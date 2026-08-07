/**
 * B106 vendor-repoint backfill — DRY-RUN by default, --apply to write.
 * Coach money-path guardrails: per-doc runTransaction, canonical-path (write back the exact
 * doc read), IDENTITY-ONLY (bcVendorNo + bcVendorName), NO version churn (only the panels field
 * is updated; updatedAt/quoteRev/bomVersion untouched), skip locked docs, leave price/LT alone
 * (a later in-app F089 Refresh reconciles), never touch BC master. Full reversible log.
 *
 * Scope (Jon 2026-08-07): PO/RFQ rows INCLUDED (all test data). Excludes only locked docs and
 * rows whose name doesn't resolve to a single BC vendor (e.g. "Hoists Direct") -> logged SKIPPED.
 *
 * Run DRY-RUN: NODE_PATH=functions/node_modules BCMAP_DIR=<maps> node tools/b106-repoint-backfill.js
 * APPLY:       ... node tools/b106-repoint-backfill.js --apply
 * Log written to BCMAP_DIR/b106-backfill-log-<runId>.json (append-only artifact).
 */
const fs = require("fs");
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const sa = require(path.join(__dirname, "..", ".secrets", "matrix-arc-admin.json"));
const MAPDIR = process.env.BCMAP_DIR || path.join(__dirname, "..");
const bcTrue = require(path.join(MAPDIR, "bc-truth.json"));
const name2num = require(path.join(MAPDIR, "name-to-number.json"));
const APPLY = process.argv.includes("--apply");
const RUN_ID = "b106-" + new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid;

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
const norm = (s) => (s == null ? "" : String(s)).toLowerCase().replace(/[^a-z0-9]/g, "");
const n2n = {}; for (const k in name2num) n2n[norm(k)] = name2num[k];
const ALIASES = { crumelectricsupply: "V00179", rittalllc: "V00366", proautomation: "V00530", ovivo: "V00540", royalsaltlakecity: "V00373" };
for (const k in ALIASES) n2n[k] = n2n[k] || ALIASES[k];

// resolve a row's proposed repoint, or null if not a repoint / not resolvable
function resolve(num, name) {
  if (!num || !name) return null;
  const tn = bcTrue[num];
  if (tn !== undefined && norm(name) === norm(tn)) return null;      // already correct
  const intended = n2n[norm(name)];
  if (!intended) return { ambiguous: true };                        // name has no single BC vendor (e.g. Hoists Direct)
  if (intended === num) return null;                                // effectively correct
  return { intended, canonical: bcTrue[intended] != null ? bcTrue[intended] : name };
}

(async () => {
  const log = { runId: RUN_ID, mode: APPLY ? "APPLY" : "DRYRUN", startedAtMs: null, changes: [], skipped: [], dupPaths: [] };
  // collect project refs from both roots
  const projectRefs = [];
  for (const coll of ["companies", "users"]) {
    const top = await db.collection(coll).get();
    for (const t of top.docs) {
      const ps = await db.collection(`${coll}/${t.id}/projects`).get();
      ps.docs.forEach((p) => projectRefs.push({ ref: p.ref, id: p.id, scope: `${coll}/${t.id}`, data: p.data() }));
    }
  }
  // dup bcProjectNumber across physical paths -> flag (do not auto-fix a mirrored project blindly)
  const byBcNum = new Map();
  for (const pr of projectRefs) { const b = (pr.data.bcProjectNumber || pr.id); if (!byBcNum.has(b)) byBcNum.set(b, []); byBcNum.get(b).push(pr.ref.path); }
  for (const [b, paths] of byBcNum) if (paths.length > 1) log.dupPaths.push({ bcProjectNumber: b, paths });

  let totalTargets = 0, docsWithTargets = 0, applied = 0;
  for (const pr of projectRefs) {
    const d = pr.data || {};
    const projLabel = `${d.bcProjectNumber || pr.id} — ${d.name || "—"}`;
    const locked = (d.ownerTakeoverActive && d.ownerTakeoverActive.expiresAt > 0 && d.ownerTakeoverActive.expiresAt > safeNow()) || d.ownerLockActive === true;
    // find target rows
    const targets = []; // {panelIdx, panelId, rowIdx, rowId, num, name, ...res}
    (d.panels || []).forEach((pan, pi) => (pan.bom || []).forEach((r, ri) => {
      const num = (r.bcVendorNo || "").toString().trim(), name = (r.bcVendorName || "").toString().trim();
      const res = resolve(num, name);
      if (!res) return;
      const base = { project: projLabel, path: pr.ref.path, projectId: pr.id, panelIdx: pi, panelId: pan.id || null, rowIdx: ri, rowId: r.id || null, oldNo: num, oldName: name,
        snap: { unitPrice: r.unitPrice, priceDate: r.priceDate, bcPoDate: r.bcPoDate, priceSource: r.priceSource, leadTimeDays: r.leadTimeDays, leadTimeSource: r.leadTimeSource, leadTimeUpdatedAt: r.leadTimeUpdatedAt } };
      if (res.ambiguous) { log.skipped.push({ ...base, reason: "ambiguous-name-no-single-bc-vendor" }); return; }
      targets.push({ ...base, newNo: res.intended, newName: res.canonical });
    }));
    if (!targets.length) continue;
    docsWithTargets++; totalTargets += targets.length;
    if (locked) { targets.forEach((t) => log.skipped.push({ ...t, reason: "locked-project" })); continue; }

    if (!APPLY) { targets.forEach((t) => log.changes.push({ ...t, schemaVersionBefore: d.schemaVersion, docUpdatedAtBefore: d.updatedAt })); continue; }

    // APPLY: per-doc transaction, re-verify each target, update ONLY panels
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(pr.ref);
      const cur = snap.data() || {};
      const panels = cur.panels || [];
      let changedInDoc = 0;
      for (const t of targets) {
        const pan = panels[t.panelIdx]; if (!pan || !pan.bom || !pan.bom[t.rowIdx]) continue;
        const row = pan.bom[t.rowIdx];
        // re-verify the row STILL matches what we planned (no drift since read)
        if ((row.bcVendorNo || "").toString().trim() !== t.oldNo || (row.bcVendorName || "").toString().trim() !== t.oldName) {
          log.skipped.push({ ...t, reason: "changed-since-read" }); continue;
        }
        row.bcVendorNo = t.newNo; row.bcVendorName = t.newName; changedInDoc++;
        log.changes.push({ ...t, schemaVersionBefore: cur.schemaVersion, docUpdatedAtBefore: cur.updatedAt });
      }
      if (changedInDoc > 0) { tx.update(pr.ref, { panels }); applied += changedInDoc; }  // ONLY panels; no updatedAt/version bump
    });
  }

  const outPath = path.join(MAPDIR, `b106-backfill-log-${RUN_ID}.json`);
  fs.writeFileSync(outPath, JSON.stringify(log, null, 2));
  console.log(`MODE=${log.mode}  RUN_ID=${RUN_ID}`);
  console.log(`Docs with targets: ${docsWithTargets}  |  Target rows: ${totalTargets}`);
  console.log(`Planned/applied changes: ${log.changes.length}  |  Skipped: ${log.skipped.length}  (${log.skipped.filter(s=>s.reason==="ambiguous-name-no-single-bc-vendor").length} ambiguous, ${log.skipped.filter(s=>s.reason==="locked-project").length} locked, ${log.skipped.filter(s=>s.reason==="changed-since-read").length} changed-since-read)`);
  if (log.dupPaths.length) { console.log(`\n⚠ DUP project paths (same bcProjectNumber in 2 physical docs) — review before APPLY:`); log.dupPaths.forEach(x => console.log(`   ${x.bcProjectNumber}: ${x.paths.join("  |  ")}`)); }
  if (APPLY) console.log(`\n✅ APPLIED ${applied} row updates via per-doc transactions.`); else console.log(`\n(DRY-RUN — no writes.)`);
  console.log(`Log: ${outPath}`);
  process.exit(0);

  function safeNow() { try { return Date.now(); } catch (e) { return 0; } }
})().catch((e) => { console.error("ERR", e); process.exit(1); });

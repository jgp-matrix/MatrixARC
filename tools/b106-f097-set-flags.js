/**
 * F097 flag-set backfill — DRY-RUN by default, --apply to write.
 * Sets pricingRefreshNeeded:{reason:"b106-vendor-repoint", panelIds:[...], setAt} on each
 * project that had a B106 vendor REPOINT (number changed), keyed by the affected panel IDs
 * (from the reversible repoint log). Excludes PRJ402509 panelIdx 0 (LINE 1 already refreshed).
 * Per-doc transaction, additive field only (no other field touched, no version churn).
 *
 * Run: NODE_PATH=functions/node_modules node tools/b106-f097-set-flags.js [--apply]
 */
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const sa = require(path.join(__dirname, "..", ".secrets", "matrix-arc-admin.json"));
const APPLY = process.argv.includes("--apply");
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const LOGDIR = path.join(__dirname, "..", "docs", "b106-backfill-logs");
const fs = require("fs");
// The 148-row REPOINT apply log = changes where newNo !== oldNo.
const files = fs.readdirSync(LOGDIR).filter(f => f.startsWith("b106-backfill-log-"));

(async () => {
  // path -> {projectLabel, panelIds:Set, panelIdxs:Set}
  const byPath = {};
  for (const f of files) {
    const l = JSON.parse(fs.readFileSync(path.join(LOGDIR, f)));
    if (l.mode !== "APPLY") continue;
    for (const c of l.changes || []) {
      if (c.newNo === c.oldNo) continue;                 // repoint only (skip restamp)
      if (!c.panelId) continue;
      const key = c.path;
      if (!byPath[key]) byPath[key] = { label: c.project, panelIds: new Set(), skip: new Set() };
      // exclude PRJ402509 LINE 1 (panelIdx 0) — already refreshed live
      if (/PRJ402509/.test(c.project) && c.panelIdx === 0) { byPath[key].skip.add(c.panelId); continue; }
      byPath[key].panelIds.add(c.panelId);
    }
  }
  const setAt = Date.now();
  let docs = 0, panels = 0, applied = 0;
  const report = [];
  for (const p in byPath) {
    const ids = [...byPath[p].panelIds];
    if (!ids.length) continue;
    docs++; panels += ids.length;
    report.push(`${byPath[p].label}  →  ${ids.length} panel(s)${byPath[p].skip.size ? "  (excluded "+byPath[p].skip.size+" already-refreshed)" : ""}`);
    if (APPLY) {
      await db.runTransaction(async tx => {
        const ref = db.doc(p);
        const snap = await tx.get(ref);
        if (!snap.exists) { report.push(`   ⚠ MISSING doc ${p}`); return; }
        tx.update(ref, { pricingRefreshNeeded: { reason: "b106-vendor-repoint", panelIds: ids, setAt } });
        applied++;
      });
    }
  }
  console.log(`MODE=${APPLY ? "APPLY" : "DRYRUN"}  projects=${docs}  panels=${panels}${APPLY ? "  applied=" + applied : ""}`);
  report.forEach(r => console.log("  " + r));
  process.exit(0);
})().catch(e => { console.error("ERR", e); process.exit(1); });

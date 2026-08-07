/**
 * B106 authoritative vendor-drift classifier (read-only DRY-RUN, no writes).
 *
 * Prereqs (regenerate the two BC-map snapshots from a BC-connected ARC tab console):
 *   bc-truth.json      = {number: displayName}  via:
 *     const vs=await bcListVendors(); const m={}; vs.forEach(v=>m[v.number]=v.displayName); JSON.stringify(m)
 *   name-to-number.json= {displayName: number}  via:
 *     const vs=await bcListVendors(); const m={}; vs.forEach(v=>m[v.displayName]=v.number); JSON.stringify(m)
 *   Place both in the dir given by BCMAP_DIR (default: repo root).
 *
 * Run: NODE_PATH=functions/node_modules BCMAP_DIR=/path/to/maps node tools/b106-classify-vendor-drift.js
 * Needs .secrets/matrix-arc-admin.json (same as tools/admin.js).
 *
 * Buckets: CORRECT (no action) · REPOINT (number wrong, re-point to name's true vendor) ·
 *          RESTAMP (name variant, keep number) · AMBIGUOUS (name not a canonical BC vendor → Jon).
 * REPOINT assumes the row's NAME reflects the intended vendor (matches the V00251→V00179 Crum intent).
 */
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const sa = require(path.join(__dirname, "..", ".secrets", "matrix-arc-admin.json"));
const MAPDIR = process.env.BCMAP_DIR || path.join(__dirname, "..");
const bcTrue = require(path.join(MAPDIR, "bc-truth.json"));
const name2num = require(path.join(MAPDIR, "name-to-number.json"));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const norm = (s) => (s == null ? "" : String(s)).toLowerCase().replace(/[^a-z0-9]/g, "");
const stem = (s) => norm(s).replace(/(electric|electrical|electronics|supply|supplies|automation|industrial|online|direct|inc|llc|ltd|corp|co|company|northamerica|na|controls?|control|wholesale|corporation|systems?)/g, "");
const n2n = {}; for (const k in name2num) n2n[norm(k)] = name2num[k];
const ALIASES = { crumelectricsupply: "V00179", rittalllc: "V00366", proautomation: "V00530", ovivo: "V00540" };
for (const k in ALIASES) if (!n2n[k]) n2n[k] = ALIASES[k];

(async () => {
  const buckets = { CORRECT: [], REPOINT: [], RESTAMP: [], AMBIGUOUS: [] };
  for (const coll of ["companies", "users"]) {
    const top = await db.collection(coll).get();
    for (const t of top.docs) {
      const ps = await db.collection(`${coll}/${t.id}/projects`).get();
      for (const p of ps.docs) {
        const d = p.data() || {};
        const label = `${d.bcProjectNumber || p.id} (${d.name || "—"})`;
        const seen = new Map();
        for (const pan of d.panels || []) for (const r of pan.bom || []) {
          const num = (r.bcVendorNo || "").toString().trim();
          const name = (r.bcVendorName || "").toString().trim();
          if (!num || !name) continue;
          const k = num + "|||" + name; seen.set(k, (seen.get(k) || 0) + 1);
        }
        for (const [k, cnt] of seen) {
          const [num, name] = k.split("|||");
          const trueName = bcTrue[num];
          const rec = { project: label, num, name, trueName: trueName === undefined ? "(num not in BC)" : trueName, rows: cnt };
          if (trueName !== undefined && norm(name) === norm(trueName)) { buckets.CORRECT.push(rec); continue; }
          const intended = n2n[norm(name)];
          if (intended && intended !== num) { rec.proposed = `re-point ${num}->${intended} (${name})`; buckets.REPOINT.push(rec); continue; }
          if (intended && intended === num) { buckets.CORRECT.push(rec); continue; }
          if (trueName && stem(name) && stem(name) === stem(trueName)) { rec.proposed = `re-stamp "${name}"->"${trueName}" (keep ${num})`; buckets.RESTAMP.push(rec); continue; }
          rec.proposed = "NEEDS JON"; buckets.AMBIGUOUS.push(rec);
        }
      }
    }
  }
  const rows = (b) => b.reduce((a, r) => a + r.rows, 0);
  const projs = (b) => new Set(b.map((r) => r.project)).size;
  const out = [`# B106 authoritative dry-run  ${new Date().toISOString().slice(0,10)}`, "",
    `CORRECT: ${buckets.CORRECT.length} pairs / ${rows(buckets.CORRECT)} rows`,
    `REPOINT: ${buckets.REPOINT.length} pairs / ${rows(buckets.REPOINT)} rows / ${projs(buckets.REPOINT)} projects`,
    `RESTAMP: ${buckets.RESTAMP.length} pairs / ${rows(buckets.RESTAMP)} rows`,
    `AMBIGUOUS: ${buckets.AMBIGUOUS.length} pairs / ${rows(buckets.AMBIGUOUS)} rows`];
  for (const key of ["REPOINT", "RESTAMP", "AMBIGUOUS"]) {
    out.push(`\n\n## ${key}`);
    const by = new Map();
    for (const r of buckets[key]) { const a = key === "AMBIGUOUS" ? r.num + "|" + r.name : r.proposed; if (!by.has(a)) by.set(a, []); by.get(a).push(r); }
    const groups = [...by.values()].sort((x, y) => recs2(y) - recs2(x));
    for (const recs of groups) {
      const hdr = key === "AMBIGUOUS"
        ? `\n### ${recs[0].num} "${recs[0].name}" (BC=${recs[0].trueName}) — ${recs2(recs)} rows`
        : `\n### ${recs[0].proposed} — ${recs2(recs)} rows / ${new Set(recs.map(r => r.project)).size} projects`;
      out.push(hdr);
      for (const r of recs.sort((x, y) => y.rows - x.rows)) out.push(`   - ${r.project}  (${r.rows})`);
    }
  }
  function recs2(arr) { return arr.reduce((s, r) => s + r.rows, 0); }
  console.log(out.join("\n"));
  process.exit(0);
})().catch((e) => { console.error("ERR", e); process.exit(1); });

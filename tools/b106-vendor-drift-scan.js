/**
 * B106 — read-only vendor name<->number drift scan across ALL projects.
 *
 * Run:  NODE_PATH=functions/node_modules node tools/b106-vendor-drift-scan.js
 * Needs the admin service-account key at .secrets/matrix-arc-admin.json (same as tools/admin.js).
 *
 * BC-FREE signals (no BC token):
 *   (1) a bcVendorName under >=2 distinct bcVendorNo  — noisy (distributor names spread across numbers)
 *   (2) a bcVendorNo under >=2 distinct bcVendorName  — RELIABLE internal-conflict signal
 *   + SUMMARY magnitude, splitting cosmetic name-variants from genuinely-different companies.
 *
 * LIMITATION (B102 lesson): a BC-free scan can flag a CONFLICT but cannot say which side is
 * correct — a number can be consistently mislabeled (e.g. V00251=Heitek shown as "Crum" on 12 rows).
 * The AUTHORITATIVE fix list requires the BC vendor number->name map (bcListVendors output).
 */
const path = require("path");
const admin = require(path.join(__dirname, "..", "functions", "node_modules", "firebase-admin"));
const serviceAccount = require(path.join(__dirname, "..", ".secrets", "matrix-arc-admin.json"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const norm = (s) => (s == null ? "" : String(s).trim());
const normName = (s) => norm(s).toLowerCase().replace(/\s+/g, " ");
const stem = (nk) => nk.replace(/\b(electric|electrical|electronics|supply|supplies|automation|industrial|online|direct|inc|llc|ltd|corp|co|company|north|america|of|the|and|controls?|control|wholesale|na)\b/g, "").replace(/[^a-z0-9]/g, "");

async function collectProjectPaths() {
  const paths = [];
  const companies = await db.collection("companies").get();
  for (const c of companies.docs) {
    const ps = await db.collection(`companies/${c.id}/projects`).get();
    ps.docs.forEach((p) => paths.push(p));
  }
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const ps = await db.collection(`users/${u.id}/projects`).get();
    ps.docs.forEach((p) => paths.push(p));
  }
  return paths;
}

(async () => {
  const projects = await collectProjectPaths();
  const pairs = new Map();
  const nameToNumbers = new Map();
  const numberToNames = new Map();
  let projScanned = 0, rowsWithVendor = 0;

  for (const ref of projects) {
    const d = ref.data() || {};
    projScanned++;
    const projLabel = `${d.bcProjectNumber || ref.id} (${d.name || "—"})`;
    for (const pan of d.panels || []) {
      for (const r of pan.bom || []) {
        const num = norm(r.bcVendorNo), rawName = norm(r.bcVendorName);
        if (!num || !rawName) continue;
        rowsWithVendor++;
        const nkey = normName(rawName), pk = `${num}|||${nkey}`;
        if (!pairs.has(pk)) pairs.set(pk, { number: num, name: rawName, projects: new Map() });
        const rec = pairs.get(pk);
        rec.projects.set(projLabel, (rec.projects.get(projLabel) || 0) + 1);
        if (!nameToNumbers.has(nkey)) nameToNumbers.set(nkey, new Set());
        nameToNumbers.get(nkey).add(num);
        if (!numberToNames.has(num)) numberToNames.set(num, new Map());
        numberToNames.get(num).set(nkey, rawName);
      }
    }
  }

  const out = [`# B106 vendor drift scan (${new Date().toISOString().slice(0,10)})`,
    `Projects scanned: ${projScanned} · BOM rows with both vendor#+name: ${rowsWithVendor}`, ""];

  out.push("## (1) Same NAME under multiple vendor NUMBERS (noisy)");
  for (const [nkey, nums] of [...nameToNumbers.entries()].filter(([, n]) => n.size >= 2)) {
    const display = [...pairs.values()].find((p) => normName(p.name) === nkey)?.name || nkey;
    out.push(`\n### "${display}" → ${nums.size} numbers: ${[...nums].sort().join(", ")}`);
    for (const num of [...nums].sort()) {
      const rec = pairs.get(`${num}|||${nkey}`); if (!rec) continue;
      out.push(`   ${num}:`);
      for (const [p, c] of rec.projects) out.push(`      - ${p}  (${c} row${c>1?"s":""})`);
    }
  }

  out.push("\n\n## (2) Same vendor NUMBER under multiple NAMES (RELIABLE conflict signal)");
  for (const [num, names] of [...numberToNames.entries()].filter(([, n]) => n.size >= 2)) {
    out.push(`\n### ${num} → ${names.size} names: ${[...names.values()].map((n)=>`"${n}"`).join(", ")}`);
    for (const [nkey, rawName] of names) {
      const rec = pairs.get(`${num}|||${nkey}`); if (!rec) continue;
      out.push(`   "${rawName}":`);
      for (const [p, c] of rec.projects) out.push(`      - ${p}  (${c} row${c>1?"s":""})`);
    }
  }

  const numMulti = [...numberToNames.entries()].filter(([, n]) => n.size >= 2);
  let cosmetic = 0, crossSupplier = 0, crossRows = 0; const crossProjects = new Set();
  for (const [num, names] of numMulti) {
    const stems = new Set([...names.keys()].map(stem).filter(Boolean));
    if (stems.size <= 1) { cosmetic++; continue; }
    crossSupplier++;
    let maxBucket = 0, totalNum = 0;
    for (const [nkey] of names) {
      let c = 0; const rec = pairs.get(`${num}|||${nkey}`);
      if (rec) for (const [pl, cc] of rec.projects) { c += cc; crossProjects.add(pl); }
      totalNum += c; maxBucket = Math.max(maxBucket, c);
    }
    crossRows += (totalNum - maxBucket);
  }
  out.push(`\n\n## SUMMARY (magnitude — BC-free)`);
  out.push(`Vendor numbers with >1 name: ${numMulti.length}  (≈${cosmetic} cosmetic-variant only, ${crossSupplier} carry genuinely-different companies)`);
  out.push(`Cross-supplier numbers touch ≈${crossProjects.size} projects; ≈${crossRows} rows sit in a minority name-bucket.`);
  out.push(`⚠ BC-free — cannot say which side is correct (a number can be consistently mislabeled). Authoritative list needs the BC vendor number→name map.`);
  console.log(out.join("\n"));
  process.exit(0);
})().catch((e) => { console.error("SCAN ERROR:", e); process.exit(1); });

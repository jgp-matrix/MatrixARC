/**
 * Find Firestore paths for specific BC project numbers.
 */
const path = require("path");
const admin = require(path.join(__dirname, "..", "..", "functions", "node_modules", "firebase-admin"));
const keyPath = path.join(__dirname, "..", "..", ".secrets", "matrix-arc-admin.json");
const serviceAccount = require(keyPath);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
});
const db = admin.firestore();

async function main() {
  const targets = ["PRJ402068", "PRJ402089", "PRJ402096"];
  const found = [];

  for (const col of ["companies", "users"]) {
    const parents = await db.collection(col).get();
    for (const parent of parents.docs) {
      const projects = await db.collection(`${col}/${parent.id}/projects`).get();
      for (const p of projects.docs) {
        const d = p.data();
        const bc = d.bcProjectNumber || "";
        if (targets.includes(bc)) {
          const hasBom = d.panels && d.panels[0] && d.panels[0].bom && d.panels[0].bom.length > 0;
          const hasReport = d.panels && d.panels[0] && d.panels[0].extractionReport;
          found.push({
            bc,
            path: `${col}/${parent.id}/projects/${p.id}`,
            bomLength: hasBom ? d.panels[0].bom.length : 0,
            hasReport: !!hasReport,
          });
        }
      }
    }
  }

  for (const f of found) {
    console.log(`${f.bc}: path="${f.path}" bom=${f.bomLength} report=${f.hasReport}`);
  }
  if (found.length === 0) {
    console.log("None of the target projects found. Listing all BC project numbers:");
    const all = [];
    for (const col of ["companies", "users"]) {
      const parents = await db.collection(col).get();
      for (const parent of parents.docs) {
        const projects = await db.collection(`${col}/${parent.id}/projects`).get();
        for (const p of projects.docs) {
          const d = p.data();
          if (d.bcProjectNumber && d.panels && d.panels[0] && d.panels[0].bom && d.panels[0].bom.length > 0) {
            all.push({ bc: d.bcProjectNumber, path: `${col}/${parent.id}/projects/${p.id}`, bomLength: d.panels[0].bom.length });
          }
        }
      }
    }
    all.sort((a, b) => a.bc.localeCompare(b.bc));
    for (const a of all) {
      console.log(`  ${a.bc}: ${a.path} (${a.bomLength} items)`);
    }
  }
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

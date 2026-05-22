/**
 * Read panel.extractionReport for PRJ402107 from Firestore.
 * C4 definitive check: did L3 fire?
 *
 * Usage: node tests/extraction-baseline/read-extraction-report.js
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
  const projectPath = "companies/XODxZ8xJc0dQXGZI7jbo/projects/La2FiGCfv9gnz5b7bdg7";
  const doc = await db.doc(projectPath).get();
  if (!doc.exists) {
    console.error("Project not found at", projectPath);
    process.exit(1);
  }

  const data = doc.data();
  const panel = data.panels[0];

  console.log("=== panel.extractionReport ===");
  console.log(JSON.stringify(panel.extractionReport, null, 2));

  console.log("\n=== Key C4 fields ===");
  const r = panel.extractionReport || {};
  console.log("timestamp:", r.timestamp ? new Date(r.timestamp).toISOString() : "(missing)");
  console.log("version:", r.version || "(missing)");
  console.log("l3MergeRecovered:", r.l3MergeRecovered != null ? r.l3MergeRecovered : "(missing)");
  console.log("l3GapFillRecovered:", r.l3GapFillRecovered != null ? r.l3GapFillRecovered : "(missing)");
  console.log("extractionPath:", r.extractionPath || "(missing)");
  console.log("scanQuality:", r.scanQuality || "(missing)");
  console.log("finalSequenceGaps:", JSON.stringify(r.finalSequenceGaps || []));
  console.log("finalItemCount:", r.finalItemCount || "(missing)");
  console.log("bomPageCount:", r.bomPageCount || "(missing)");

  if (r.perPageOutcomes) {
    console.log("\n=== perPageOutcomes ===");
    for (const o of r.perPageOutcomes) {
      console.log(JSON.stringify(o));
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

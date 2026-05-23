/**
 * Extract post-H9 BOM from Firestore for PRJ402104.
 * Checks whether items 27, 28, 30 (IDEC variants) survived the fuzzy merge.
 */
const path = require("path");
const fs = require("fs");
const admin = require(path.join(__dirname, "..", "..", "functions", "node_modules", "firebase-admin"));

const keyPath = path.join(__dirname, "..", "..", ".secrets", "matrix-arc-admin.json");
const serviceAccount = require(keyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
});
const db = admin.firestore();

async function main() {
  const projectPath = "companies/XODxZ8xJc0dQXGZI7jbo/projects/0i3NiLwcAOVh96tsvwJd";
  const doc = await db.doc(projectPath).get();
  const d = doc.data();
  const panel = d.panels[0];
  const bom = panel.bom || [];
  const report = panel.extractionReport || {};

  console.log("=== PRJ402104 Post-H9 Extraction ===\n");
  console.log(`BOM items: ${bom.length}`);
  console.log(`Version: ${report.version}`);
  console.log(`Extraction path: ${report.extractionPath}`);
  console.log(`Raw count: ${report.rawCount}`);
  console.log(`Exact count: ${report.exactCount}`);
  console.log(`Final count: ${report.finalCount}`);
  console.log(`Final item count: ${report.finalItemCount}`);
  console.log(`Fuzzy merges: ${(report.fuzzyMerges || []).length}`);
  console.log(`Sequence gaps: [${(report.finalSequenceGaps || []).join(", ")}]`);

  // Check IDEC items specifically
  console.log("\n=== IDEC Items ===\n");
  const idecItems = bom.filter(r =>
    (r.manufacturer || "").toUpperCase().includes("IDEC") ||
    (r.partNumber || "").match(/^[SR]H\d/)
  );

  if (idecItems.length === 0) {
    console.log("NO IDEC items found in BOM!");
  } else {
    for (const r of idecItems) {
      const itemNo = r.itemNo || r.item || "?";
      console.log(`  item=${String(itemNo).padEnd(4)} PN="${(r.partNumber || "").padEnd(15)}" qty=${String(r.qty).padEnd(3)} mfr="${r.manufacturer}" desc="${(r.description || "").substring(0, 60)}"`);
    }
  }

  // Check items 27, 28, 30 specifically
  console.log("\n=== Target Items (27, 28, 30) ===\n");
  const targetNos = [27, 28, 30];
  for (const target of targetNos) {
    const found = bom.find(r => {
      const num = parseInt(String(r.itemNo || r.item || "").replace(/\D/g, ""), 10);
      return num === target;
    });
    if (found) {
      console.log(`  Item ${target}: ✓ PRESENT — PN="${found.partNumber}" mfr="${found.manufacturer}" desc="${(found.description || "").substring(0, 60)}"`);
    } else {
      console.log(`  Item ${target}: ✗ MISSING`);
    }
  }

  // Check fuzzy merge log
  console.log("\n=== Fuzzy Merge Log ===\n");
  const merges = report.fuzzyMerges || [];
  if (merges.length === 0) {
    console.log("No fuzzy merges occurred — itemNo guard blocked all false merges!");
  } else {
    for (const m of merges) {
      console.log(`  KEPT="${m.kept}" DROPPED="${m.dropped}" reason="${m.reason}" mfr="${m.manufacturer}"`);
    }
  }

  // Full BOM listing sorted by itemNo
  console.log("\n=== Full BOM (sorted by itemNo) ===\n");
  const sorted = [...bom].sort((a, b) => {
    const na = parseInt(String(a.itemNo || a.item || "999").replace(/\D/g, ""), 10);
    const nb = parseInt(String(b.itemNo || b.item || "999").replace(/\D/g, ""), 10);
    return na - nb;
  });
  for (const r of sorted) {
    const itemNo = r.itemNo || r.item || "?";
    console.log(`  item=${String(itemNo).padEnd(4)} PN="${(r.partNumber || "").padEnd(20)}" qty=${String(r.qty).padEnd(4)} mfr="${(r.manufacturer || "").padEnd(20)}" desc="${(r.description || "").substring(0, 50)}"`);
  }

  // Save to JSON
  const output = {
    projectId: "0i3NiLwcAOVh96tsvwJd",
    bcProjectNumber: d.bcProjectNumber,
    capturedAt: new Date().toISOString(),
    version: report.version,
    extractionPath: report.extractionPath,
    rawCount: report.rawCount,
    exactCount: report.exactCount,
    finalCount: report.finalCount,
    finalItemCount: report.finalItemCount,
    fuzzyMerges: report.fuzzyMerges || [],
    finalSequenceGaps: report.finalSequenceGaps || [],
    bomLength: bom.length,
    bom: sorted.map(r => ({
      itemNo: r.itemNo || r.item || "",
      partNumber: r.partNumber || "",
      qty: r.qty,
      manufacturer: r.manufacturer || "",
      description: (r.description || "").substring(0, 100),
      unitPrice: r.unitPrice || 0,
      priceSource: r.priceSource || "",
    })),
  };

  const outPath = path.join(__dirname, "prj402104-post-h9.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${outPath}`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

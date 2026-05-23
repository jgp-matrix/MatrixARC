/**
 * Extract post-H6 BOM data for PRJ402107 from Firestore.
 * Captures the re-extracted BOM after the x-position dedup fix.
 *
 * Usage: node tests/extraction-baseline/extract-post-h6.js
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
  const projectPath = "companies/XODxZ8xJc0dQXGZI7jbo/projects/La2FiGCfv9gnz5b7bdg7";
  const doc = await db.doc(projectPath).get();
  if (!doc.exists) {
    console.error("Project not found at", projectPath);
    process.exit(1);
  }

  const data = doc.data();
  const panel = data.panels[0];
  const report = panel.extractionReport || {};

  const bomPage = panel.pages[8];

  let pdfPath = null;
  for (const pg of panel.pages) {
    if (pg.originalPdfPath) { pdfPath = pg.originalPdfPath; break; }
  }

  const baseline = {
    capturedAt: new Date().toISOString(),
    label: "post-H6 (v1.20.20) — x-position dedup fix",
    project: {
      firestorePath: projectPath,
      name: data.name,
      bcProjectNumber: data.bcProjectNumber,
      drawingNo: panel.drawingNo,
      status: panel.status,
      updatedAt: data.updatedAt,
    },
    extractionReport: {
      rawCount: report.rawCount || null,
      exactCount: report.exactCount || null,
      fuzzyCount: report.fuzzyCount || null,
      filteredCount: report.filteredCount || null,
      version: report.version || null,
      extractionPath: report.extractionPath || null,
      positionalMergeDropped: report.rawCount && report.exactCount ? report.rawCount - report.exactCount : null,
    },
    bomPage: {
      pageIndex: 8,
      pageId: bomPage.id,
      pageName: bomPage.name,
      types: bomPage.types,
      hasStorageUrl: !!bomPage.storageUrl,
      originalPdfPath: bomPage.originalPdfPath || pdfPath,
      pageNumber: bomPage.pageNumber || 9,
      extractionPath: bomPage.extractionPath || null,
    },
    bomItemCount: panel.bom.length,
    bom: panel.bom.map((row, idx) => ({
      _rowIndex: idx,
      item: row.item || row.itemNo || null,
      qty: row.qty,
      partNumber: row.partNumber || row.catalog || null,
      manufacturer: row.manufacturer || row.mfg || null,
      description: row.description || null,
      tags: row.tags || row.tag || null,
      revMark: row.revMark || null,
      notes: row.notes || null,
      confidence: row.confidence || null,
      x_left: row.x_left != null ? row.x_left : null,
      x_right: row.x_right != null ? row.x_right : null,
      y_top: row.y_top != null ? row.y_top : null,
      y_bottom: row.y_bottom != null ? row.y_bottom : null,
      sourcePageIdx: row.sourcePageIdx != null ? row.sourcePageIdx : null,
      priceSource: row.priceSource || null,
      unitPrice: row.unitPrice != null ? row.unitPrice : null,
      leadTimeDays: row.leadTimeDays != null ? row.leadTimeDays : null,
      leadTimeSource: row.leadTimeSource || null,
    })),
    rawBom: panel.bom,
  };

  const outPath = path.join(__dirname, "prj402107-post-h6.json");
  fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2));
  console.log(`Written ${baseline.bomItemCount} BOM items to ${outPath}`);
  console.log(`\nExtraction report:`);
  console.log(`  rawCount:    ${report.rawCount || "?"}`);
  console.log(`  exactCount:  ${report.exactCount || "?"}`);
  console.log(`  fuzzyCount:  ${report.fuzzyCount || "?"}`);
  console.log(`  filteredCount: ${report.filteredCount || "?"}`);
  console.log(`  version:     ${report.version || "?"}`);
  console.log(`  Positional merge dropped: ${baseline.extractionReport.positionalMergeDropped ?? "?"}`);

  console.log(`\nBOM items by item number:`);
  const withItem = baseline.bom.filter(r => r.item);
  const withoutItem = baseline.bom.filter(r => !r.item);
  console.log(`  ${withItem.length} with item#, ${withoutItem.length} without`);

  const xVals = baseline.bom.filter(r => r.x_left != null).map(r => r.x_left);
  if (xVals.length > 0) {
    const left = xVals.filter(x => x < 0.25);
    const right = xVals.filter(x => x >= 0.25);
    console.log(`\nColumn distribution: ${left.length} left-column, ${right.length} right-column`);
  }

  console.log("\nFirst 10 items:");
  baseline.bom.slice(0, 10).forEach(r => {
    console.log(`  Item ${String(r.item || "?").padEnd(4)} x=${(r.x_left != null ? r.x_left.toFixed(4) : "?   ").padEnd(6)} ${(r.partNumber || "").padEnd(25)} ${(r.manufacturer || "").padEnd(15)} ${(r.description || "").substring(0, 50)}`);
  });
  console.log(`  ... (${baseline.bomItemCount} total)`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

/**
 * Extract current BOM data for PRJ402107 from Firestore.
 * Captures the production pipeline's stored output as a pre-H5 baseline.
 *
 * Usage: node tests/extraction-baseline/extract-baseline.js
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
const bucket = admin.storage().bucket();

async function main() {
  const projectPath = "companies/XODxZ8xJc0dQXGZI7jbo/projects/La2FiGCfv9gnz5b7bdg7";
  const doc = await db.doc(projectPath).get();
  if (!doc.exists) {
    console.error("Project not found at", projectPath);
    process.exit(1);
  }

  const data = doc.data();
  const panel = data.panels[0];

  // Find the BOM page (page 9, index 8)
  const bomPage = panel.pages[8];

  // Find PDF storage path
  let pdfPath = null;
  for (const pg of panel.pages) {
    if (pg.originalPdfPath) {
      pdfPath = pg.originalPdfPath;
      break;
    }
  }

  // Build the baseline output
  const baseline = {
    capturedAt: new Date().toISOString(),
    project: {
      firestorePath: projectPath,
      name: data.name,
      bcProjectNumber: data.bcProjectNumber,
      drawingNo: panel.drawingNo,
      status: panel.status,
      updatedAt: data.updatedAt,
    },
    bomPage: {
      pageIndex: 8,
      pageId: bomPage.id,
      pageName: bomPage.name,
      types: bomPage.types,
      hasStorageUrl: !!bomPage.storageUrl,
      originalPdfPath: bomPage.originalPdfPath || pdfPath,
      pageNumber: bomPage.pageNumber || 9,
      bomRegion: bomPage.bomRegion || null,
      extractionPath: bomPage.extractionPath || null,
    },
    pdfStoragePath: pdfPath,
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
      catalogNotes: row.catalogNotes || null,
      priceSource: row.priceSource || null,
      unitPrice: row.unitPrice != null ? row.unitPrice : null,
      leadTimeDays: row.leadTimeDays != null ? row.leadTimeDays : null,
      leadTimeSource: row.leadTimeSource || null,
    })),
    // Also capture raw panel.bom for full fidelity
    rawBom: panel.bom,
  };

  const outPath = path.join(__dirname, "prj402107-pre-h5.json");
  fs.writeFileSync(outPath, JSON.stringify(baseline, null, 2));
  console.log(`Written ${baseline.bomItemCount} BOM items to ${outPath}`);
  console.log(`PDF path: ${pdfPath || "(not found in page metadata)"}`);
  console.log(`BOM page extraction path: ${bomPage.extractionPath || "(not recorded)"}`);

  // Quick summary of items
  console.log("\nFirst 5 items:");
  baseline.bom.slice(0, 5).forEach(r => {
    console.log(`  Item ${r.item}: ${r.partNumber} | ${r.manufacturer} | ${(r.description || "").substring(0, 60)}`);
  });
  console.log(`  ... (${baseline.bomItemCount} total)`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

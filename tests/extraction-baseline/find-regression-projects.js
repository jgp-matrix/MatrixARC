/**
 * Find production projects suitable for H6 regression testing.
 * Looks for projects with extracted BOMs and spatial coordinate data.
 * Reports column layout (single vs multi-column) based on x_left distribution.
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
  const companies = await db.collection("companies").get();
  const results = [];

  for (const c of companies.docs) {
    const projects = await db.collection(`companies/${c.id}/projects`).get();
    for (const p of projects.docs) {
      const d = p.data();
      if (!d.panels || !d.panels.length) continue;
      for (const pan of d.panels) {
        if (!pan.bom || pan.bom.length < 5) continue;
        const withX = pan.bom.filter(r => typeof r.x_left === "number");
        if (withX.length < 3) continue;

        const xVals = withX.map(r => r.x_left);
        const minX = Math.min(...xVals);
        const maxX = Math.max(...xVals);
        const spread = maxX - minX;

        // Detect columns: if spread > 0.25, likely multi-column
        let layout = "single-column";
        let colCount = 1;
        if (spread > 0.25) {
          const leftCount = withX.filter(r => r.x_left < (minX + maxX) / 2).length;
          const rightCount = withX.filter(r => r.x_left >= (minX + maxX) / 2).length;
          if (leftCount > 2 && rightCount > 2) {
            layout = "multi-column";
            colCount = 2;
          }
        }

        const report = pan.extractionReport || {};
        results.push({
          bcProjectNumber: d.bcProjectNumber || "(none)",
          projectName: d.name || "(unnamed)",
          panelName: pan.name || "(unnamed)",
          drawingNo: pan.drawingNo || "(none)",
          bomCount: pan.bom.length,
          withXCount: withX.length,
          layout,
          colCount,
          xSpread: spread.toFixed(4),
          minX: minX.toFixed(4),
          maxX: maxX.toFixed(4),
          rawCount: report.rawCount || null,
          exactCount: report.exactCount || null,
          version: report.version || null,
        });
      }
    }
  }

  // Also check users collection
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const projects = await db.collection(`users/${u.id}/projects`).get();
    for (const p of projects.docs) {
      const d = p.data();
      if (!d.panels || !d.panels.length) continue;
      for (const pan of d.panels) {
        if (!pan.bom || pan.bom.length < 5) continue;
        const withX = pan.bom.filter(r => typeof r.x_left === "number");
        if (withX.length < 3) continue;

        const xVals = withX.map(r => r.x_left);
        const minX = Math.min(...xVals);
        const maxX = Math.max(...xVals);
        const spread = maxX - minX;

        let layout = "single-column";
        if (spread > 0.25) {
          const leftCount = withX.filter(r => r.x_left < (minX + maxX) / 2).length;
          const rightCount = withX.filter(r => r.x_left >= (minX + maxX) / 2).length;
          if (leftCount > 2 && rightCount > 2) layout = "multi-column";
        }

        const report = pan.extractionReport || {};
        results.push({
          bcProjectNumber: d.bcProjectNumber || "(none)",
          projectName: d.name || "(unnamed)",
          panelName: pan.name || "(unnamed)",
          drawingNo: pan.drawingNo || "(none)",
          bomCount: pan.bom.length,
          withXCount: withX.length,
          layout,
          xSpread: spread.toFixed(4),
          minX: minX.toFixed(4),
          maxX: maxX.toFixed(4),
          rawCount: report.rawCount || null,
          exactCount: report.exactCount || null,
          version: report.version || null,
        });
      }
    }
  }

  console.log(`Found ${results.length} panels with spatial data:\n`);

  const single = results.filter(r => r.layout === "single-column");
  const multi = results.filter(r => r.layout === "multi-column");

  console.log("=== SINGLE-COLUMN BOMs ===");
  single.forEach(r => {
    const dropped = r.rawCount && r.exactCount ? r.rawCount - r.exactCount : "?";
    console.log(`  ${r.bcProjectNumber.padEnd(12)} ${r.panelName.padEnd(15)} bom=${String(r.bomCount).padEnd(4)} x=[${r.minX}..${r.maxX}] raw=${r.rawCount||"?"} exact=${r.exactCount||"?"} dropped=${dropped} ver=${r.version||"?"}`);
  });

  console.log("\n=== MULTI-COLUMN BOMs ===");
  multi.forEach(r => {
    const dropped = r.rawCount && r.exactCount ? r.rawCount - r.exactCount : "?";
    console.log(`  ${r.bcProjectNumber.padEnd(12)} ${r.panelName.padEnd(15)} bom=${String(r.bomCount).padEnd(4)} x=[${r.minX}..${r.maxX}] raw=${r.rawCount||"?"} exact=${r.exactCount||"?"} dropped=${dropped} ver=${r.version||"?"}`);
  });

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

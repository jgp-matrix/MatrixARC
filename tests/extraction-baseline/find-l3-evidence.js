/**
 * Search Firestore for panels where L3 fired with non-zero recovery,
 * or panels with finalSequenceGaps (L3 should have fired on these).
 *
 * Usage: node tests/extraction-baseline/find-l3-evidence.js
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

async function scanCollection(collectionPath, parentId, parentType) {
  const results = { l3Fired: [], hasGaps: [], hasReport: [] };
  const projects = await db.collection(collectionPath).get();

  for (const p of projects.docs) {
    const d = p.data();
    if (!d.panels || !d.panels.length) continue;

    for (let pi = 0; pi < d.panels.length; pi++) {
      const panel = d.panels[pi];
      const report = panel.extractionReport;
      if (!report) continue;

      const info = {
        parentType,
        parentId,
        projectId: p.id,
        bcProjectNumber: d.bcProjectNumber || "(none)",
        projectName: d.name || "(unnamed)",
        panelIndex: pi,
        panelName: panel.name || "(unnamed)",
        version: report.version || "?",
        timestamp: report.timestamp ? new Date(report.timestamp).toISOString() : "?",
        rawCount: report.rawCount || 0,
        exactCount: report.exactCount || 0,
        finalCount: report.finalCount || 0,
        finalItemCount: report.finalItemCount || 0,
        extractionPath: report.extractionPath || "?",
        l3MergeRecovered: report.l3MergeRecovered,
        l3GapFillRecovered: report.l3GapFillRecovered,
        finalSequenceGaps: report.finalSequenceGaps || [],
        perPageOutcomes: report.perPageOutcomes ? report.perPageOutcomes.length + " pages" : null,
        scanQuality: report.scanQuality || null,
      };

      results.hasReport.push(info);

      if ((report.l3MergeRecovered || 0) > 0 || (report.l3GapFillRecovered || 0) > 0) {
        results.l3Fired.push(info);
      }

      if (report.finalSequenceGaps && report.finalSequenceGaps.length > 0) {
        results.hasGaps.push(info);
      }
    }
  }
  return results;
}

async function main() {
  console.log("=== L3 Production Evidence Search ===\n");

  const allL3 = [];
  const allGaps = [];
  const allReports = [];

  // Scan companies
  const companies = await db.collection("companies").get();
  for (const c of companies.docs) {
    const r = await scanCollection(`companies/${c.id}/projects`, c.id, "company");
    allL3.push(...r.l3Fired);
    allGaps.push(...r.hasGaps);
    allReports.push(...r.hasReport);
  }

  // Scan users
  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const r = await scanCollection(`users/${u.id}/projects`, u.id, "user");
    allL3.push(...r.l3Fired);
    allGaps.push(...r.hasGaps);
    allReports.push(...r.hasReport);
  }

  console.log(`Total panels with extractionReport: ${allReports.length}\n`);

  // Report: L3 fields present?
  const hasL3Fields = allReports.filter(r => r.l3MergeRecovered !== undefined || r.l3GapFillRecovered !== undefined);
  const missingL3Fields = allReports.filter(r => r.l3MergeRecovered === undefined && r.l3GapFillRecovered === undefined);
  console.log(`Panels WITH l3 fields in report:    ${hasL3Fields.length}`);
  console.log(`Panels WITHOUT l3 fields in report: ${missingL3Fields.length}`);

  // Show version distribution for panels with/without L3 fields
  const versionCounts = {};
  for (const r of allReports) {
    const key = `${r.version} (l3fields: ${r.l3MergeRecovered !== undefined})`;
    versionCounts[key] = (versionCounts[key] || 0) + 1;
  }
  console.log("\nVersion distribution:");
  Object.entries(versionCounts).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // L3 fired with non-zero recovery
  console.log(`\n=== L3 FIRED (non-zero recovery): ${allL3.length} panels ===`);
  if (allL3.length === 0) {
    console.log("  NONE — L3 has never recovered an item in production (or fields not captured).");
  } else {
    for (const r of allL3) {
      console.log(`  ${r.bcProjectNumber.padEnd(12)} panel=${r.panelName.padEnd(15)} v=${r.version.padEnd(10)} l3Merge=${r.l3MergeRecovered} l3Gap=${r.l3GapFillRecovered} raw=${r.rawCount} exact=${r.exactCount} final=${r.finalItemCount} path=${r.extractionPath}`);
      console.log(`    timestamp=${r.timestamp}  projectId=${r.projectId}`);
    }
  }

  // Panels with sequence gaps
  console.log(`\n=== PANELS WITH SEQUENCE GAPS: ${allGaps.length} panels ===`);
  if (allGaps.length === 0) {
    console.log("  NONE — no panels have finalSequenceGaps populated.");
  } else {
    for (const r of allGaps) {
      const gapStr = r.finalSequenceGaps.length > 10
        ? r.finalSequenceGaps.slice(0, 10).join(",") + `... (+${r.finalSequenceGaps.length - 10} more)`
        : r.finalSequenceGaps.join(",");
      console.log(`  ${r.bcProjectNumber.padEnd(12)} panel=${r.panelName.padEnd(15)} v=${r.version.padEnd(10)} gaps=[${gapStr}] (${r.finalSequenceGaps.length} gaps)`);
      console.log(`    l3Merge=${r.l3MergeRecovered ?? "MISSING"} l3Gap=${r.l3GapFillRecovered ?? "MISSING"} raw=${r.rawCount} exact=${r.exactCount} final=${r.finalItemCount} path=${r.extractionPath}`);
      console.log(`    timestamp=${r.timestamp}  projectId=${r.projectId}`);
    }
  }

  // Panels where L3 fields exist but are zero (L3 was available but didn't fire or recovered nothing)
  const l3ZeroBoth = hasL3Fields.filter(r => (r.l3MergeRecovered || 0) === 0 && (r.l3GapFillRecovered || 0) === 0);
  console.log(`\n=== L3 FIELDS PRESENT BUT ZERO: ${l3ZeroBoth.length} panels ===`);
  console.log("  (L3 code was in the build but didn't fire or recovered 0 items)");

  // Cross-check: panels with gaps but L3 fields = 0 or missing
  const gapsButNoL3 = allGaps.filter(r => (r.l3MergeRecovered || 0) === 0 && (r.l3GapFillRecovered || 0) === 0);
  if (gapsButNoL3.length > 0) {
    console.log(`\n=== ANOMALY: Gaps exist but L3 didn't recover anything: ${gapsButNoL3.length} panels ===`);
    for (const r of gapsButNoL3) {
      const gapStr = r.finalSequenceGaps.length > 10
        ? r.finalSequenceGaps.slice(0, 10).join(",") + `...`
        : r.finalSequenceGaps.join(",");
      console.log(`  ${r.bcProjectNumber.padEnd(12)} v=${r.version.padEnd(10)} gaps=[${gapStr}] l3Merge=${r.l3MergeRecovered ?? "MISSING"} l3Gap=${r.l3GapFillRecovered ?? "MISSING"}`);
      // Possible explanations:
      // 1. L3 fired but recovered 0 (gaps are genuine missing rows)
      // 2. L3 fields not captured (pre-L3 version or re-extraction path)
      // 3. Extraction was via re-extract path (no L3)
      const isReExtract = !r.perPageOutcomes;
      console.log(`    likely re-extract (no perPageOutcomes): ${isReExtract}  extractionPath=${r.extractionPath}`);
    }
  }

  // Summary for H7
  console.log("\n=== H7 IMPLICATIONS ===");
  if (allL3.length > 0) {
    console.log(`Found ${allL3.length} panel(s) where L3 recovered items — use as regression test.`);
  } else if (allGaps.length > 0) {
    console.log(`No L3 recoveries found, but ${allGaps.length} panel(s) have sequence gaps.`);
    console.log("Investigate: was L3 available (check version)? Was this a re-extract (no L3)?");
  } else {
    console.log("No L3 evidence AND no sequence gaps. L3 may not have had a chance to fire,");
    console.log("or all extractions have been clean.");
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

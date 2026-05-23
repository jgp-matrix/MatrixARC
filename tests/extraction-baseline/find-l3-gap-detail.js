/**
 * Deeper investigation: for panels with finalSequenceGaps,
 * check whether the gaps existed in raw extraction or were
 * introduced by downstream processing.
 *
 * Key question: did the AI extract a gap-free sequence that
 * downstream processing then broke? If so, L3 (which checks
 * raw extraction) would never have fired.
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

async function analyzePanel(projectPath, bcNumber) {
  const doc = await db.doc(projectPath).get();
  if (!doc.exists) return null;
  const d = doc.data();
  if (!d.panels || !d.panels.length) return null;

  const panel = d.panels[0];
  const report = panel.extractionReport || {};
  const bom = panel.bom || [];

  if (!report.finalSequenceGaps || report.finalSequenceGaps.length === 0) return null;

  // Analyze the actual BOM items
  const itemNos = bom
    .map(r => ({ itemNo: parseInt(String(r.itemNo || r.item || "").replace(/\D/g, ""), 10), partNumber: r.partNumber || "", description: (r.description || "").substring(0, 60) }))
    .filter(r => !isNaN(r.itemNo) && r.itemNo > 0);

  const presentNums = new Set(itemNos.map(r => r.itemNo));
  const maxItemNo = Math.max(...presentNums);

  // Check what's at the gap positions
  const gapAnalysis = report.finalSequenceGaps.map(gapNum => {
    const present = presentNums.has(gapNum);
    return { itemNo: gapNum, inFinalBom: present };
  });

  // Check non-BOM rows filtered
  const nonBomFiltered = report.nonBomRowsFiltered || [];
  const nonBomItemNos = nonBomFiltered.map(r => parseInt(String(r.itemNo || r.item || "").replace(/\D/g, ""), 10)).filter(n => !isNaN(n));

  // Check if gap items appear in nonBomRowsFiltered
  const gapsInNonBom = report.finalSequenceGaps.filter(g => nonBomItemNos.includes(g));

  // Check fuzzy merges
  const fuzzyMerges = report.fuzzyMerges || [];

  return {
    bcNumber,
    projectPath,
    version: report.version,
    rawCount: report.rawCount,
    exactCount: report.exactCount,
    finalCount: report.finalCount,
    finalItemCount: report.finalItemCount,
    finalSequenceGaps: report.finalSequenceGaps,
    maxItemNo,
    bomLength: bom.length,
    itemsWithItemNo: itemNos.length,
    nonBomFilteredCount: nonBomFiltered.length,
    nonBomItemNos,
    gapsInNonBom,
    fuzzyMergeCount: fuzzyMerges.length,
    l3MergeRecovered: report.l3MergeRecovered,
    l3GapFillRecovered: report.l3GapFillRecovered,
    extractionPath: report.extractionPath,
    hasPerPageOutcomes: !!report.perPageOutcomes,
    // Items near the gaps to understand context
    nearGapItems: report.finalSequenceGaps.flatMap(g => {
      const nearby = itemNos.filter(r => Math.abs(r.itemNo - g) <= 2);
      return nearby.map(r => ({ gapAt: g, ...r }));
    }),
    // Non-BOM filtered items detail
    nonBomDetail: nonBomFiltered.map(r => ({
      itemNo: r.itemNo || r.item,
      partNumber: r.partNumber || "",
      description: (r.description || "").substring(0, 60),
      manufacturer: r.manufacturer || "",
      filterReason: r._filterReason || r._nonBomReason || "unknown",
    })),
  };
}

async function main() {
  console.log("=== L3 Gap Detail Investigation ===\n");

  // Known panels with gaps from previous scan
  const targets = [
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/0i3NiLwcAOVh96tsvwJd", bc: "PRJ402104" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/A44pe7wUPgW08n3iEmnG", bc: "PRJ402106" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/Hg87eleylTJNnvICx3sf", bc: "PRJ402097" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/IkZIRYREkHe7ZgSYVGic", bc: "PRJ402103" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/La2FiGCfv9gnz5b7bdg7", bc: "PRJ402107" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/e0WZHj9tJ9aaoMJgCSe6", bc: "PRJ402105" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/h7fWV31TG0BG62GSGqUS", bc: "PRJ402099" },
  ];

  for (const t of targets) {
    const r = await analyzePanel(t.path, t.bc);
    if (!r) { console.log(`${t.bc}: no data\n`); continue; }

    console.log(`--- ${r.bcNumber} (${r.version}) ---`);
    console.log(`  Pipeline: raw=${r.rawCount} → exact=${r.exactCount} → fuzzy=${r.finalCount || "?"} → final=${r.finalItemCount}`);
    console.log(`  BOM rows in Firestore: ${r.bomLength} (${r.itemsWithItemNo} with itemNo)`);
    console.log(`  Max itemNo: ${r.maxItemNo}`);
    console.log(`  Gaps: [${r.finalSequenceGaps.join(", ")}]`);
    console.log(`  L3 merge=${r.l3MergeRecovered ?? "MISSING"} gap=${r.l3GapFillRecovered ?? "MISSING"}`);
    console.log(`  Was initial extract: ${r.hasPerPageOutcomes}`);
    console.log(`  Non-BOM rows filtered: ${r.nonBomFilteredCount}`);
    if (r.nonBomItemNos.length > 0) {
      console.log(`  Non-BOM item numbers: [${r.nonBomItemNos.join(", ")}]`);
    }
    if (r.gapsInNonBom.length > 0) {
      console.log(`  ** GAP ITEMS FOUND IN NON-BOM FILTER: [${r.gapsInNonBom.join(", ")}] **`);
    }

    // Show non-BOM detail
    if (r.nonBomDetail.length > 0) {
      console.log(`  Non-BOM filtered items:`);
      for (const nb of r.nonBomDetail) {
        console.log(`    item=${nb.itemNo} PN="${nb.partNumber}" mfg="${nb.manufacturer}" desc="${nb.description}" reason=${nb.filterReason}`);
      }
    }

    // Determine where gaps originated
    const rawGapFree = r.rawCount === r.exactCount;
    const lostInPipeline = r.exactCount - r.finalItemCount;
    console.log(`  Raw extraction gap-free: ${rawGapFree} (raw==exact: ${r.rawCount}==${r.exactCount})`);
    console.log(`  Items lost in pipeline: ${lostInPipeline}`);

    if (rawGapFree && lostInPipeline > 0) {
      console.log(`  → CONCLUSION: AI extraction was COMPLETE. Gaps introduced by downstream processing.`);
      console.log(`  → L3 would NOT have fired (raw extraction had no gaps for _parseAndVerifyBomRaw to detect).`);
    } else if (!rawGapFree) {
      console.log(`  → CONCLUSION: Items lost in positional/exact dedup. Check if raw had gaps.`);
    }
    console.log();
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

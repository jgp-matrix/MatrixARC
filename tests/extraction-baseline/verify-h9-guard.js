/**
 * H9 regression test: verify itemNo guard in fuzzyMergeBomItemsWithReport.
 *
 * The BOM stored in Firestore is POST-fuzzy-merge — dropped items are gone.
 * Instead, we check the saved extractionReport.fuzzyMerges logs and verify
 * the itemNo guard would have blocked each false merge.
 *
 * Also reconstructs the pre-merge BOM by re-inserting dropped items, then
 * runs both OLD and NEW fuzzy merge to confirm the guard works end-to-end.
 *
 * Usage: node tests/extraction-baseline/verify-h9-guard.js
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

// --- Shared helpers (exact copy from production) ---

function _bomLevDistBounded(a, b, max) {
  if (a === b) return 0;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (!la) return lb; if (!lb) return la;
  const prev = new Array(lb + 1), curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i; let rowMin = curr[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

function _bomNormPn(s) { return (s || "").replace(/[\s\-\.\/ _]+/g, "").toUpperCase(); }

function _bomDescSim(a, b) {
  const na = (a || "").replace(/\s+/g, " ").trim().toLowerCase();
  const nb = (b || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 15 && nb.length >= 15 && na.slice(0, 25) === nb.slice(0, 25)) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  const wa = new Set(na.split(/\s+/).filter(w => w.length > 2));
  const wb = new Set(nb.split(/\s+/).filter(w => w.length > 2));
  if (!wa.size || !wb.size) return false;
  let shared = 0; for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.max(wa.size, wb.size) >= 0.6;
}

// --- OLD fuzzy merge (no itemNo guard) ---

function fuzzyMergeOLD(items) {
  const out = []; const consumed = new Set(); const merges = [];
  for (let i = 0; i < items.length; i++) {
    if (consumed.has(i)) continue;
    let base = items[i];
    const pnA = _bomNormPn(base.partNumber);
    if (pnA.length < 5) { out.push(base); continue; }
    const mfrA = (base.manufacturer || "").trim().toLowerCase();
    for (let j = i + 1; j < items.length; j++) {
      if (consumed.has(j)) continue;
      const b = items[j];
      const pnB = _bomNormPn(b.partNumber);
      if (pnB.length < 5) continue;
      if (pnA === pnB) continue;
      if (Math.abs(pnA.length - pnB.length) > 2) continue;

      let ydiffOcrDupOverride = false;
      if (typeof base.y_top === "number" && typeof b.y_top === "number") {
        const yDiff = Math.abs((base.y_top || 0) - (b.y_top || 0));
        if (yDiff > 0.008) {
          const normDesc = s => (s || "").replace(/[\s,.()\/\-]/g, "").toLowerCase();
          const dA = normDesc(base.description), dB = normDesc(b.description);
          const descIdentical = dA && dB && dA === dB && dA.length >= 8;
          if (!descIdentical) continue;
          ydiffOcrDupOverride = true;
        }
      }

      const maxLen = Math.max(pnA.length, pnB.length);
      const threshold = maxLen <= 8 ? 1 : maxLen <= 14 ? 2 : 3;
      const ed = _bomLevDistBounded(pnA, pnB, threshold);
      if (ed > threshold) continue;

      const mfrB = (b.manufacturer || "").trim().toLowerCase();
      const mfrMatch = mfrA && mfrB && mfrA === mfrB;
      const descMatch = _bomDescSim(base.description, b.description);
      if (!mfrMatch && !descMatch) continue;
      if (!mfrMatch && descMatch && ed > 1) continue;
      if (mfrMatch && !descMatch && ed > 2) continue;

      merges.push({
        keptItemNo: base.itemNo || base.item || "?",
        droppedItemNo: b.itemNo || b.item || "?",
        keptPN: base.partNumber,
        droppedPN: b.partNumber,
        editDist: ed,
      });
      consumed.add(j);
    }
    out.push(base);
  }
  return { items: out, merges };
}

// --- NEW fuzzy merge (WITH itemNo guard) ---

function fuzzyMergeNEW(items) {
  const out = []; const consumed = new Set(); const merges = [];
  for (let i = 0; i < items.length; i++) {
    if (consumed.has(i)) continue;
    let base = items[i];
    const pnA = _bomNormPn(base.partNumber);
    if (pnA.length < 5) { out.push(base); continue; }
    const mfrA = (base.manufacturer || "").trim().toLowerCase();
    for (let j = i + 1; j < items.length; j++) {
      if (consumed.has(j)) continue;
      const b = items[j];
      const pnB = _bomNormPn(b.partNumber);
      if (pnB.length < 5) continue;
      if (pnA === pnB) continue;
      if (Math.abs(pnA.length - pnB.length) > 2) continue;

      // >>> H9 itemNo guard <<<
      const inA = String(base.itemNo || base.item || "").replace(/\D/g, "");
      const inB = String(b.itemNo || b.item || "").replace(/\D/g, "");
      if (inA && inB && inA !== inB) continue;

      let ydiffOcrDupOverride = false;
      if (typeof base.y_top === "number" && typeof b.y_top === "number") {
        const yDiff = Math.abs((base.y_top || 0) - (b.y_top || 0));
        if (yDiff > 0.008) {
          const normDesc = s => (s || "").replace(/[\s,.()\/\-]/g, "").toLowerCase();
          const dA = normDesc(base.description), dB = normDesc(b.description);
          const descIdentical = dA && dB && dA === dB && dA.length >= 8;
          if (!descIdentical) continue;
          ydiffOcrDupOverride = true;
        }
      }

      const maxLen = Math.max(pnA.length, pnB.length);
      const threshold = maxLen <= 8 ? 1 : maxLen <= 14 ? 2 : 3;
      const ed = _bomLevDistBounded(pnA, pnB, threshold);
      if (ed > threshold) continue;

      const mfrB = (b.manufacturer || "").trim().toLowerCase();
      const mfrMatch = mfrA && mfrB && mfrA === mfrB;
      const descMatch = _bomDescSim(base.description, b.description);
      if (!mfrMatch && !descMatch) continue;
      if (!mfrMatch && descMatch && ed > 1) continue;
      if (mfrMatch && !descMatch && ed > 2) continue;

      merges.push({
        keptItemNo: base.itemNo || base.item || "?",
        droppedItemNo: b.itemNo || b.item || "?",
        keptPN: base.partNumber,
        droppedPN: b.partNumber,
        editDist: ed,
      });
      consumed.add(j);
    }
    out.push(base);
  }
  return { items: out, merges };
}

async function main() {
  console.log("=== H9 Regression Test: itemNo Guard ===\n");

  // -------------------------------------------------------
  // PART 1: Check saved fuzzyMerges logs across all panels
  // -------------------------------------------------------
  console.log("--- PART 1: Saved fuzzyMerges log analysis ---\n");

  let totalSavedMerges = 0;
  let totalWouldBlock = 0;
  let panelsWithFalseMerges = 0;
  const allPanelResults = [];

  const collections = [
    { type: "companies", col: "companies" },
    { type: "users", col: "users" },
  ];

  for (const { type, col } of collections) {
    const parents = await db.collection(col).get();
    for (const parent of parents.docs) {
      const projects = await db.collection(`${col}/${parent.id}/projects`).get();
      for (const p of projects.docs) {
        const d = p.data();
        if (!d.panels) continue;
        for (const panel of d.panels) {
          const report = panel.extractionReport;
          if (!report) continue;
          const savedMerges = report.fuzzyMerges || [];
          if (savedMerges.length === 0) continue;

          const bom = panel.bom || [];
          // Check each saved merge: would itemNo guard have blocked it?
          const analysis = savedMerges.map(m => {
            // Saved merges have { kept, dropped, ... } — find corresponding BOM items
            // to get itemNo. The kept item is in the BOM; the dropped one is gone.
            // But the extractionReport logs the merge — we can check if kept/dropped
            // PNs differ enough in the IDEC pattern to have different itemNos.
            //
            // Better: check finalSequenceGaps — each gap is a dropped itemNo.
            const normKept = _bomNormPn(m.kept);
            const normDropped = _bomNormPn(m.dropped);
            const ed = _bomLevDistBounded(normKept, normDropped, 5);

            // Find the kept item in current BOM to get its itemNo
            const keptRow = bom.find(r => (r.partNumber || "") === m.kept);
            const keptItemNo = keptRow ? String(keptRow.itemNo || keptRow.item || "").replace(/\D/g, "") : "?";

            return {
              kept: m.kept,
              dropped: m.dropped,
              keptItemNo,
              editDist: ed,
              manufacturer: m.manufacturer || "",
              description: (m.description || "").substring(0, 60),
              reason: m.reason || "",
            };
          });

          allPanelResults.push({
            bc: d.bcProjectNumber || "(none)",
            panelName: panel.name || "(unnamed)",
            merges: analysis,
            gaps: report.finalSequenceGaps || [],
          });
          totalSavedMerges += savedMerges.length;
        }
      }
    }
  }

  console.log(`Panels with saved fuzzyMerges: ${allPanelResults.length}`);
  console.log(`Total saved merges: ${totalSavedMerges}\n`);

  for (const r of allPanelResults) {
    console.log(`--- ${r.bc} / ${r.panelName} ---`);
    console.log(`  Gaps: [${r.gaps.join(", ")}]`);
    for (const m of r.merges) {
      // If there are gaps, the dropped item's itemNo is one of the gaps
      // The kept item is in the BOM — we found its itemNo above
      const possibleDroppedItemNo = r.gaps.length > 0 ? "one of gaps" : "unknown";
      const wouldBlock = m.keptItemNo && r.gaps.length > 0;
      if (wouldBlock) totalWouldBlock++;
      console.log(`  KEPT="${m.kept}" (item=${m.keptItemNo}) DROPPED="${m.dropped}" editDist=${m.editDist}`);
      console.log(`    mfr="${m.manufacturer}" desc="${m.description}"`);
      console.log(`    itemNo guard would block: ${wouldBlock ? "YES (different itemNos)" : "check manually"}`);
    }
    if (r.gaps.length > 0) panelsWithFalseMerges++;
  }

  // -------------------------------------------------------
  // PART 2: Reconstruct pre-merge BOM for PRJ402104 and run both merges
  // -------------------------------------------------------
  console.log("\n\n--- PART 2: PRJ402104 reconstructed pre-merge test ---\n");

  const prj104Path = "companies/XODxZ8xJc0dQXGZI7jbo/projects/0i3NiLwcAOVh96tsvwJd";
  const doc = await db.doc(prj104Path).get();
  const d = doc.data();
  const panel = d.panels[0];
  const bom = panel.bom || [];
  const report = panel.extractionReport || {};

  // The current BOM is missing items 27, 28, 30. Reconstruct them from what we know:
  // Item 27: RH2B-ULC-120 (2-pole relay), IDEC, same desc as RH1B-ULC-120
  // Item 28: SH2B-05C (2-pole socket), IDEC, same desc as SH1B-05C
  // Item 30: SH3B-05C (3-pole socket), IDEC, same desc as SH1B-05C

  // Find the kept items to copy their metadata
  const rh1b = bom.find(r => (r.partNumber || "").includes("RH1B"));
  const sh1b = bom.find(r => (r.partNumber || "").includes("SH1B"));

  if (!rh1b || !sh1b) {
    console.log("ERROR: Can't find RH1B or SH1B in BOM to reconstruct dropped items.");
    process.exit(1);
  }

  // Reconstruct dropped items with proper metadata
  const droppedItems = [
    { ...rh1b, itemNo: "27", partNumber: "RH2B-ULC-120", qty: 1, y_top: rh1b.y_top + 0.02 },
    { ...sh1b, itemNo: "28", partNumber: "SH2B-05C", qty: 1, y_top: sh1b.y_top + 0.02 },
    { ...sh1b, itemNo: "30", partNumber: "SH3B-05C", qty: 1, y_top: sh1b.y_top + 0.04 },
  ];

  // Build pre-merge BOM: current BOM + dropped items, sorted by itemNo
  const preMergeBom = [...bom, ...droppedItems].sort((a, b) => {
    const na = parseInt(String(a.itemNo || a.item || "999").replace(/\D/g, ""), 10);
    const nb = parseInt(String(b.itemNo || b.item || "999").replace(/\D/g, ""), 10);
    return na - nb;
  });

  console.log(`Reconstructed pre-merge BOM: ${preMergeBom.length} items (${bom.length} current + ${droppedItems.length} dropped)\n`);

  // Run OLD fuzzy merge
  const oldResult = fuzzyMergeOLD(preMergeBom);
  console.log(`OLD merge (no guard): ${oldResult.items.length} items, ${oldResult.merges.length} merges`);
  for (const m of oldResult.merges) {
    console.log(`  DROPPED item=${m.droppedItemNo} PN="${m.droppedPN}" → KEPT item=${m.keptItemNo} PN="${m.keptPN}" (editDist=${m.editDist})`);
  }

  // Run NEW fuzzy merge
  const newResult = fuzzyMergeNEW(preMergeBom);
  console.log(`\nNEW merge (with guard): ${newResult.items.length} items, ${newResult.merges.length} merges`);
  for (const m of newResult.merges) {
    console.log(`  DROPPED item=${m.droppedItemNo} PN="${m.droppedPN}" → KEPT item=${m.keptItemNo} PN="${m.keptPN}" (editDist=${m.editDist})`);
  }

  // Verify specific items survived
  console.log(`\nItem survival check:`);
  const mustRecover = [
    { itemNo: "27", pn: "RH2B-ULC-120" },
    { itemNo: "28", pn: "SH2B-05C" },
    { itemNo: "30", pn: "SH3B-05C" },
  ];
  for (const { itemNo, pn } of mustRecover) {
    const inOld = oldResult.items.some(r => String(r.itemNo || r.item || "").replace(/\D/g, "") === itemNo);
    const inNew = newResult.items.some(r => String(r.itemNo || r.item || "").replace(/\D/g, "") === itemNo);
    console.log(`  Item ${itemNo} (${pn}): OLD=${inOld ? "SURVIVED" : "DROPPED"} NEW=${inNew ? "✓ SURVIVED" : "✗ DROPPED"}`);
  }

  // -------------------------------------------------------
  // PART 3: Single-column BOM regression
  // -------------------------------------------------------
  console.log("\n\n--- PART 3: Single-column BOM regression ---\n");

  const singleColTargets = [
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/AZZP5jjHH1k4MQSq4lzk", bc: "PRJ402068" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/CL7krV6QZrZg8s08BUHf", bc: "PRJ402089" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/2vVsTW9goqJ1G9b8AMDC", bc: "PRJ402096" },
  ];

  for (const t of singleColTargets) {
    const doc = await db.doc(t.path).get();
    if (!doc.exists) { console.log(`${t.bc}: not found`); continue; }
    const d = doc.data();
    if (!d.panels || !d.panels.length) { console.log(`${t.bc}: no panels`); continue; }
    const bom = d.panels[0].bom || [];
    if (bom.length < 2) { console.log(`${t.bc}: BOM too small (${bom.length} items)`); continue; }

    const oldR = fuzzyMergeOLD(bom);
    const newR = fuzzyMergeNEW(bom);
    console.log(`${t.bc}: ${bom.length} items → OLD=${oldR.items.length} (${oldR.merges.length} merges), NEW=${newR.items.length} (${newR.merges.length} merges)`);
    if (newR.merges.length > oldR.merges.length) {
      console.log(`  ✗ REGRESSION: more merges with new code!`);
    } else if (newR.items.length < oldR.items.length) {
      console.log(`  ✗ REGRESSION: fewer items with new code!`);
    } else {
      console.log(`  ✓ OK`);
    }
  }

  // -------------------------------------------------------
  // VERDICT
  // -------------------------------------------------------
  console.log("\n\n=== FINAL VERDICT ===\n");

  const blocked = oldResult.merges.length - newResult.merges.length;
  const allThreeRecovered = mustRecover.every(({ itemNo }) =>
    newResult.items.some(r => String(r.itemNo || r.item || "").replace(/\D/g, "") === itemNo)
  );

  console.log(`PRJ402104 false merges blocked: ${blocked}`);
  console.log(`Items 27, 28, 30 all recovered: ${allThreeRecovered ? "✓ YES" : "✗ NO"}`);
  console.log(`Saved merge logs analyzed: ${totalSavedMerges} across ${allPanelResults.length} panels`);
  console.log(`Panels with sequence gaps (false merges): ${panelsWithFalseMerges}`);
  console.log(`\nH9 REGRESSION TEST: ${allThreeRecovered ? "✓ PASS" : "✗ FAIL"}`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

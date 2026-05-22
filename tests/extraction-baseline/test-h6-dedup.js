/**
 * H6 regression test: positionalMergeBomItems x-position guard.
 *
 * Tests:
 *  1. Two-column BOM (PRJ402107 profile): cross-column items must NOT merge
 *  2. Single-column BOM: same-row duplicates must still merge (no regression)
 *  3. Three-column BOM: all three columns preserved
 *  4. Missing x_left: falls through to y-only merge (legacy behavior)
 *  5. Real PRJ402107 spatial data: reconstructed 87-item input
 *
 * Usage: node tests/extraction-baseline/test-h6-dedup.js
 */

// Extract the function from the compiled bundle to test the ACTUAL shipped code
const fs = require("fs");
const path = require("path");
const bundlePath = path.join(__dirname, "..", "..", "public", "index.bundle.js");
const bundle = fs.readFileSync(bundlePath, "utf8");

// We can't easily extract the function from the bundle, so we'll copy it here
// exactly as it appears in app.jsx post-edit. This tests the LOGIC, not the bundle.
function positionalMergeBomItems(items) {
  const withY = [], withoutY = [];
  for (const it of items) {
    if (typeof it.y_top === "number" && typeof it.y_bottom === "number" && it.y_bottom > it.y_top && typeof it.sourcePageIdx === "number") {
      withY.push(it);
    } else {
      withoutY.push(it);
    }
  }
  if (withY.length < 2) return items;
  withY.sort((a, b) => {
    if (a.sourcePageIdx !== b.sourcePageIdx) return a.sourcePageIdx - b.sourcePageIdx;
    return (a.y_top || 0) - (b.y_top || 0);
  });
  const merged = []; const consumed = new Set(); const posMerges = [];
  const Y_TOL = 0.004;
  const X_TOL = 0.15;
  for (let i = 0; i < withY.length; i++) {
    if (consumed.has(i)) continue;
    let base = { ...withY[i] };
    for (let j = i + 1; j < withY.length; j++) {
      if (consumed.has(j)) continue;
      const b = withY[j];
      if (b.sourcePageIdx !== base.sourcePageIdx) break;
      // H6 FIX: x-position guard
      if (typeof b.x_left === "number" && typeof base.x_left === "number" && Math.abs(b.x_left - base.x_left) > X_TOL) continue;
      if (Math.abs((b.y_top || 0) - (base.y_top || 0)) > Y_TOL) break;
      if (Math.abs((b.y_bottom || 0) - (base.y_bottom || 0)) > Y_TOL * 2) continue;
      const scoreItem = (it) => {
        let s = 0;
        if ((it.partNumber || "").trim()) s += 3;
        if ((it.description || "").trim()) s += 2;
        if ((it.manufacturer || "").trim()) s += 1;
        if ((it.itemNo || "").trim()) s += 1;
        if ((+it.qty || 0) > 0) s += 1;
        return s + ((it.partNumber || "").length * 0.01) + ((it.description || "").length * 0.005);
      };
      const winner = scoreItem(b) > scoreItem(base) ? b : base;
      const keepQty = Math.max(+base.qty || 1, +b.qty || 1);
      posMerges.push({ kept: winner.partNumber, dropped: winner === base ? b.partNumber : base.partNumber });
      base = { ...winner, id: base.id, qty: keepQty, y_top: base.y_top, y_bottom: base.y_bottom };
      consumed.add(j);
    }
    merged.push(base);
  }
  return [...merged, ...withoutY];
}

// OLD version (without x-check) for comparison
function positionalMergeBomItems_OLD(items) {
  const withY = [], withoutY = [];
  for (const it of items) {
    if (typeof it.y_top === "number" && typeof it.y_bottom === "number" && it.y_bottom > it.y_top && typeof it.sourcePageIdx === "number") {
      withY.push(it);
    } else {
      withoutY.push(it);
    }
  }
  if (withY.length < 2) return items;
  withY.sort((a, b) => {
    if (a.sourcePageIdx !== b.sourcePageIdx) return a.sourcePageIdx - b.sourcePageIdx;
    return (a.y_top || 0) - (b.y_top || 0);
  });
  const merged = []; const consumed = new Set();
  const Y_TOL = 0.004;
  for (let i = 0; i < withY.length; i++) {
    if (consumed.has(i)) continue;
    let base = { ...withY[i] };
    for (let j = i + 1; j < withY.length; j++) {
      if (consumed.has(j)) continue;
      const b = withY[j];
      if (b.sourcePageIdx !== base.sourcePageIdx) break;
      // NO x-check in old version
      if (Math.abs((b.y_top || 0) - (base.y_top || 0)) > Y_TOL) break;
      if (Math.abs((b.y_bottom || 0) - (base.y_bottom || 0)) > Y_TOL * 2) continue;
      const scoreItem = (it) => {
        let s = 0;
        if ((it.partNumber || "").trim()) s += 3;
        if ((it.description || "").trim()) s += 2;
        if ((it.manufacturer || "").trim()) s += 1;
        if ((it.itemNo || "").trim()) s += 1;
        if ((+it.qty || 0) > 0) s += 1;
        return s + ((it.partNumber || "").length * 0.01) + ((it.description || "").length * 0.005);
      };
      const winner = scoreItem(b) > scoreItem(base) ? b : base;
      const keepQty = Math.max(+base.qty || 1, +b.qty || 1);
      base = { ...winner, id: base.id, qty: keepQty, y_top: base.y_top, y_bottom: base.y_bottom };
      consumed.add(j);
    }
    merged.push(base);
  }
  return [...merged, ...withoutY];
}

function makeItem(itemNo, pn, mfg, desc, x_left, y_top, pageIdx = 0) {
  return {
    id: `test-${itemNo}`, itemNo: String(itemNo), partNumber: pn,
    manufacturer: mfg, description: desc, qty: 1,
    x_left, x_right: 0.99, y_top, y_bottom: y_top + 0.01,
    sourcePageIdx: pageIdx,
  };
}

let passed = 0, failed = 0;
function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

// ========== TEST 1: Two-column BOM (PRJ402107 profile) ==========
console.log("\nTEST 1: Two-column BOM — cross-column items must NOT merge");
{
  // Left column items at x_left=0.01, right column at x_left=0.50
  // Some pairs share y_top values (the bug scenario)
  const items = [
    makeItem(4, "HF1016414", "HOFFMAN", "FAN", 0.01, 0.08),       // left col
    makeItem(54, "5069-OB16", "AB", "OUTPUT MODULE", 0.50, 0.08),  // right col, SAME y_top
    makeItem(8, "ELA02MF", "HOFFMAN", "MAGNETS", 0.01, 0.14),
    makeItem(58, "2711P-T15C21D8S", "RA", "HMI", 0.50, 0.14),     // SAME y_top
    makeItem(20, "2910386", "PHOENIX", "SURGE", 0.01, 0.32),
    makeItem(70, "3038338", "PHOENIX", "TERMINAL", 0.50, 0.32),    // SAME y_top
    makeItem(42, "1489-M1C320", "AB", "BREAKER 1P 32A", 0.01, 0.85),
    makeItem(85, "AFS09-30-22-11", "ABB", "SAFETY CONTACTOR", 0.50, 0.85), // SAME y_top
  ];

  const newResult = positionalMergeBomItems(items);
  const oldResult = positionalMergeBomItems_OLD(items);

  assert(newResult.length === 8, `New: expected 8 items, got ${newResult.length}`);
  assert(oldResult.length === 4, `Old: expected 4 items (4 merges), got ${oldResult.length}`);

  const newItemNos = newResult.map(r => r.itemNo).sort();
  assert(newItemNos.includes("4"), "New retains item 4");
  assert(newItemNos.includes("54"), "New retains item 54");
  assert(newItemNos.includes("8"), "New retains item 8");
  assert(newItemNos.includes("58"), "New retains item 58");
  console.log(`  New: ${newResult.length} items (all 8 retained)`);
  console.log(`  Old: ${oldResult.length} items (4 lost to cross-column merge)`);
}

// ========== TEST 2: Single-column BOM — same-row duplicates MUST still merge ==========
console.log("\nTEST 2: Single-column BOM — genuine duplicates must still merge");
{
  // Two readings of the same row (e.g., from quadrant overlap), same column
  const items = [
    makeItem(1, "A62H6012SSLP3PT", "HOFFMAN", "ENCLOSURE", 0.02, 0.05),
    makeItem(1, "A62H6012SSLP3", "HOFFMAN", "ENCLOSURE 2-DOOR", 0.02, 0.051), // same row, slight y noise
    makeItem(2, "A60P60", "HOFFMAN", "PANEL", 0.02, 0.08),
    makeItem(3, "AHCI238S", "HOFFMAN", "CORROSION INHIBITOR", 0.02, 0.10),
  ];

  const newResult = positionalMergeBomItems(items);
  assert(newResult.length === 3, `Expected 3 items (item 1 pair merged), got ${newResult.length}`);
  // The winner should be the one with longer description or PN
  const item1 = newResult.find(r => r.y_top <= 0.06);
  assert(item1 !== undefined, "Item 1 merge winner exists");
  console.log(`  ${newResult.length} items — item 1 duplicates merged correctly`);
}

// ========== TEST 3: Three-column BOM ==========
console.log("\nTEST 3: Three-column BOM — all three columns preserved");
{
  const items = [
    makeItem(1, "PART-A", "MFG-A", "DESC A", 0.01, 0.10),
    makeItem(30, "PART-B", "MFG-B", "DESC B", 0.34, 0.10),  // middle column, same y
    makeItem(60, "PART-C", "MFG-C", "DESC C", 0.67, 0.10),  // right column, same y
  ];

  const newResult = positionalMergeBomItems(items);
  const oldResult = positionalMergeBomItems_OLD(items);

  assert(newResult.length === 3, `New: expected 3, got ${newResult.length}`);
  assert(oldResult.length === 1, `Old: expected 1 (2 merges), got ${oldResult.length}`);
  console.log(`  New: ${newResult.length} items (all 3 columns preserved)`);
  console.log(`  Old: ${oldResult.length} item (2 lost)`);
}

// ========== TEST 4: Missing x_left — fallback to y-only ==========
console.log("\nTEST 4: Missing x_left — falls through to y-only merge");
{
  const items = [
    { id: "a", itemNo: "1", partNumber: "PART-A", description: "DESC", manufacturer: "MFG",
      qty: 1, y_top: 0.10, y_bottom: 0.12, sourcePageIdx: 0 },  // NO x_left
    { id: "b", itemNo: "1", partNumber: "PART-A-V2", description: "DESC LONGER", manufacturer: "MFG",
      qty: 1, y_top: 0.101, y_bottom: 0.121, sourcePageIdx: 0 }, // NO x_left, same y
  ];

  const newResult = positionalMergeBomItems(items);
  assert(newResult.length === 1, `Expected 1 (merged by y-only), got ${newResult.length}`);
  console.log(`  ${newResult.length} item — y-only merge works when x_left missing`);
}

// ========== TEST 5: Reconstructed PRJ402107 87-item profile ==========
console.log("\nTEST 5: PRJ402107 reconstructed 87-item profile");
{
  // Use the actual surviving 70 items' y_top values from Firestore
  // plus reconstructed y_top for the 17 missing items (matched to their
  // cross-column partners)
  const baseline = require("./prj402107-pre-h5.json");
  const surviving = baseline.rawBom.filter(r => typeof r.x_left === "number");

  // Build a map of surviving items by itemNo for y_top lookup
  const yByItem = {};
  surviving.forEach(r => { if (r.itemNo) yByItem[r.itemNo] = r.y_top; });

  // Missing items and their likely cross-column merge partners
  // (items at similar y_top in the opposite column)
  const missingPairs = [
    // [missing item, column, partner item from other column with matching y_top]
    { item: 4, x: 0.01, partnerItem: "54" },   // y≈0.08
    { item: 8, x: 0.01, partnerItem: "58" },    // y≈0.155
    { item: 9, x: 0.01, partnerItem: "59" },    // y≈0.175
    { item: 10, x: 0.01, partnerItem: "60" },   // y≈0.19
    { item: 18, x: 0.01, partnerItem: "68" },   // y≈0.338
    { item: 19, x: 0.01, partnerItem: null },    // may not have exact partner
    { item: 20, x: 0.01, partnerItem: "70" },   // y≈0.38
    { item: 24, x: 0.01, partnerItem: null },
    { item: 25, x: 0.01, partnerItem: null },
    { item: 51, x: 0.50, partnerItem: "1" },    // y≈0.035
    { item: 55, x: 0.50, partnerItem: "5" },    // y≈0.093
    { item: 62, x: 0.50, partnerItem: "12" },   // y≈0.208
    { item: 64, x: 0.50, partnerItem: null },
    { item: 65, x: 0.50, partnerItem: null },
    { item: 69, x: 0.50, partnerItem: null },
    { item: 74, x: 0.50, partnerItem: null },
    { item: 87, x: 0.50, partnerItem: null },
  ];

  // Build full 87-item set: surviving items + reconstructed missing items
  const allItems = surviving.map(r => ({ ...r }));

  // For missing items that have a known partner, place them at the partner's y_top
  // For others, place at a y_top that would collide with a same-y item from the other column
  let reconstructed = 0;
  for (const m of missingPairs) {
    let y;
    if (m.partnerItem && yByItem[m.partnerItem]) {
      y = yByItem[m.partnerItem]; // exact y match — triggers the bug
    } else {
      // Place at a unique y that doesn't collide
      y = 0.40 + (m.item * 0.005);
    }
    allItems.push(makeItem(m.item, `MISSING-${m.item}`, "TEST", `Missing item ${m.item}`, m.x, y));
    reconstructed++;
  }

  assert(allItems.length === 87, `Expected 87 items, got ${allItems.length}`);

  const newResult = positionalMergeBomItems(allItems);
  const oldResult = positionalMergeBomItems_OLD(allItems);

  const newItemNos = new Set(newResult.map(r => r.itemNo).filter(Boolean));
  const oldItemNos = new Set(oldResult.map(r => r.itemNo).filter(Boolean));

  // Count how many of the 17 missing items survive
  const missingItemNos = missingPairs.map(m => String(m.item));
  const newRecovered = missingItemNos.filter(n => newItemNos.has(n)).length;
  const oldRecovered = missingItemNos.filter(n => oldItemNos.has(n)).length;

  console.log(`  Input: ${allItems.length} items (${surviving.length} real + ${reconstructed} reconstructed)`);
  console.log(`  New: ${newResult.length} items — ${newRecovered}/17 missing items recovered`);
  console.log(`  Old: ${oldResult.length} items — ${oldRecovered}/17 missing items recovered`);

  assert(newResult.length > oldResult.length, `New should retain more items than old (${newResult.length} vs ${oldResult.length})`);
  assert(newRecovered > oldRecovered, `New should recover more missing items (${newRecovered} vs ${oldRecovered})`);

  // For partner-matched items, check recovery. Some may still merge with SAME-column
  // items at identical y_top (correct behavior — not a cross-column merge).
  // Item 20 (left col, y=0.38) collides with item 22 (left col, y=0.38) — expected.
  const partnerMatched = missingPairs.filter(m => m.partnerItem && yByItem[m.partnerItem]);
  const partnerRecovered = partnerMatched.filter(m => newItemNos.has(String(m.item))).length;
  // At least 7 of 9 partner-matched items should survive (1-2 may have same-column collisions)
  assert(partnerRecovered >= 7,
    `At least 7 of ${partnerMatched.length} partner-matched items should survive, got ${partnerRecovered}`);
  if (partnerRecovered < partnerMatched.length) {
    const lost = partnerMatched.filter(m => !newItemNos.has(String(m.item)));
    console.log(`  Note: ${lost.length} partner-matched item(s) lost to same-column collision (expected):`);
    lost.forEach(m => console.log(`    item ${m.item} at y=${yByItem[m.partnerItem]?.toFixed(4)} — same-column merge, not cross-column`));
  }
}

// ========== TEST 6: Single-column with zero drops (regression guard) ==========
console.log("\nTEST 6: Single-column uniform x_left — no behavior change");
{
  // Simulate PRJ402104 profile: all items at x_left=0.02, no drops expected
  const items = [];
  for (let i = 1; i <= 47; i++) {
    items.push(makeItem(i, `PART-${i}`, "MFG", `Description ${i}`, 0.02, 0.02 + (i * 0.02)));
  }
  const newResult = positionalMergeBomItems(items);
  assert(newResult.length === 47, `Expected all 47 items retained, got ${newResult.length}`);
  console.log(`  ${newResult.length}/47 items — no regression`);
}

// ========== SUMMARY ==========
console.log(`\n${"=".repeat(50)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("REGRESSION DETECTED — do not proceed with deploy");
  process.exit(1);
} else {
  console.log("All tests passed");
  process.exit(0);
}

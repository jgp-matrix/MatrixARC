/**
 * Check the actual BOM rows around the fuzzy-merge gaps.
 * Confirms whether merged items had different itemNo values.
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
  // PRJ402104 has gaps [27, 28, 30] — check items around those positions
  const projectPath = "companies/XODxZ8xJc0dQXGZI7jbo/projects/0i3NiLwcAOVh96tsvwJd";
  const doc = await db.doc(projectPath).get();
  const panel = doc.data().panels[0];
  const bom = panel.bom;

  console.log("=== PRJ402104 — Items around gaps [27, 28, 30] ===\n");
  console.log("Current BOM (post-fuzzy-merge, saved to Firestore):\n");

  // Find IDEC items specifically
  const idecItems = bom.filter(r =>
    (r.manufacturer || "").toUpperCase().includes("IDEC") ||
    (r.partNumber || "").match(/^[SR]H\d/)
  );

  console.log("All IDEC items in current BOM:");
  for (const r of idecItems) {
    const itemNo = r.itemNo || r.item || "?";
    console.log(`  item=${String(itemNo).padEnd(4)} PN="${(r.partNumber || "").padEnd(15)}" qty=${String(r.qty).padEnd(3)} mfr="${r.manufacturer}" desc="${(r.description || "").substring(0, 60)}" y=${r.y_top}`);
  }

  console.log("\n\nAll items in BOM sorted by itemNo (items 20-35):");
  const numbered = bom
    .map(r => ({ itemNo: parseInt(String(r.itemNo || r.item || "").replace(/\D/g, ""), 10), ...r }))
    .filter(r => !isNaN(r.itemNo) && r.itemNo >= 20 && r.itemNo <= 35)
    .sort((a, b) => a.itemNo - b.itemNo);

  for (const r of numbered) {
    const highlight = [27, 28, 30].includes(r.itemNo) ? " ** SHOULD EXIST BUT MISSING **" : "";
    console.log(`  item=${String(r.itemNo).padEnd(4)} PN="${(r.partNumber || "").padEnd(15)}" qty=${String(r.qty).padEnd(3)} mfr="${(r.manufacturer || "").padEnd(15)}" desc="${(r.description || "").substring(0, 50)}"${highlight}`);
  }

  // Check: what SHOULD items 27, 28, 30 be?
  // From the fuzzy merge log:
  // Merge 1: RH1B-ULC-120 KEPT, RH2B-ULC-120 DROPPED (this was the relay merge)
  // Merge 2: SH1B-05C KEPT, SH2B-05C DROPPED (socket merge)
  // Merge 3: SH1B-05C KEPT, SH3B-05C DROPPED (socket merge)

  // So the dropped items are: RH2B-ULC-120, SH2B-05C, SH3B-05C
  // These are genuinely different parts:
  // - RH1B = 1-pole relay, RH2B = 2-pole relay (B suffix = number of poles)
  // - SH1B = socket for 1-pole, SH2B = socket for 2-pole, SH3B = socket for 3-pole

  console.log("\n\n=== ANALYSIS ===");
  console.log("Dropped items are IDEC relay/socket product-family variants:");
  console.log("  RH1B-ULC-120 = 1-pole relay      ← KEPT");
  console.log("  RH2B-ULC-120 = 2-pole relay      ← DROPPED (editDist=1 from RH1B)");
  console.log("  SH1B-05C     = socket for 1-pole  ← KEPT");
  console.log("  SH2B-05C     = socket for 2-pole  ← DROPPED (editDist=1 from SH1B)");
  console.log("  SH3B-05C     = socket for 3-pole  ← DROPPED (editDist=1 from SH1B)");
  console.log("\nThese are DIFFERENT BC parts with DIFFERENT item numbers on the drawing.");
  console.log("Fuzzy merge treats them as OCR variants because:");
  console.log("  1. editDist=1 (only the digit after RH/SH differs)");
  console.log("  2. Same manufacturer (IDEC)");
  console.log("  3. Same description (SOCKET, RELAY, FINGERSAFE TERMINALS)");
  console.log("  4. Y-guard overridden because descriptions are IDENTICAL");
  console.log("\nFix: itemNo guard — items with different itemNo should NEVER fuzzy merge.");

  // Check that items entering fuzzy merge DO have itemNo
  // The items at this point have been through positional dedup + exact PN dedup
  // Both preserve itemNo. Let's verify by checking the surviving items.
  console.log("\n\n=== VERIFY: Do surviving BOM items have itemNo? ===");
  const withItemNo = bom.filter(r => r.itemNo || r.item);
  const withoutItemNo = bom.filter(r => !r.itemNo && !r.item);
  console.log(`  With itemNo: ${withItemNo.length}`);
  console.log(`  Without itemNo: ${withoutItemNo.length}`);
  if (withoutItemNo.length > 0) {
    console.log("  Items without itemNo:");
    for (const r of withoutItemNo) {
      console.log(`    PN="${r.partNumber}" desc="${(r.description || "").substring(0, 50)}"`);
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

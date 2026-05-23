/**
 * Reproduce fuzzy merge data loss on PRJ402104 and other affected projects.
 * Pulls the raw BOM (pre-fuzzy), runs fuzzy merge locally, shows what gets merged.
 *
 * Also checks all 25 panels with extraction reports for fuzzy merge losses.
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

// Copy the exact production functions
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

function _bomNormPn(s) { return (s || "").replace(/[\s\-\.\/ _]+/g, "").toUpperCase(); }

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

function fuzzyMergeWithDiagnostics(items) {
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
        keptIdx: i,
        droppedIdx: j,
        keptItemNo: base.itemNo || base.item || "?",
        droppedItemNo: b.itemNo || b.item || "?",
        keptPN: base.partNumber,
        droppedPN: b.partNumber,
        normKept: pnA,
        normDropped: pnB,
        editDist: ed,
        threshold,
        maxLen,
        mfrMatch,
        descMatch,
        ydiffOcrDupOverride,
        mfrA: base.manufacturer || "",
        mfrB: b.manufacturer || "",
        descA: (base.description || "").substring(0, 80),
        descB: (b.description || "").substring(0, 80),
        yTopA: base.y_top,
        yTopB: b.y_top,
      });

      consumed.add(j);
    }
    out.push(base);
  }
  return { items: out, merges };
}

async function analyzeProject(projectPath, bcNumber) {
  const doc = await db.doc(projectPath).get();
  if (!doc.exists) return null;
  const d = doc.data();
  if (!d.panels || !d.panels.length) return null;

  const panel = d.panels[0];
  const bom = panel.bom || [];
  const report = panel.extractionReport || {};

  // We can't replay the pre-fuzzy-merge state from saved BOM (it's post-pipeline).
  // But we CAN check the fuzzyMerges log in the report.
  const savedMerges = report.fuzzyMerges || [];

  return {
    bcNumber,
    version: report.version || "?",
    rawCount: report.rawCount || 0,
    exactCount: report.exactCount || 0,
    finalCount: report.finalCount || 0,
    finalItemCount: report.finalItemCount || 0,
    bomLength: bom.length,
    savedMerges,
    finalSequenceGaps: report.finalSequenceGaps || [],
  };
}

async function main() {
  console.log("=== Fuzzy Merge Investigation ===\n");

  // Targets with known gaps
  const targets = [
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/0i3NiLwcAOVh96tsvwJd", bc: "PRJ402104" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/A44pe7wUPgW08n3iEmnG", bc: "PRJ402106" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/Hg87eleylTJNnvICx3sf", bc: "PRJ402097" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/IkZIRYREkHe7ZgSYVGic", bc: "PRJ402103" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/e0WZHj9tJ9aaoMJgCSe6", bc: "PRJ402105" },
    { path: "companies/XODxZ8xJc0dQXGZI7jbo/projects/h7fWV31TG0BG62GSGqUS", bc: "PRJ402099" },
  ];

  for (const t of targets) {
    const r = await analyzeProject(t.path, t.bc);
    if (!r) continue;

    console.log(`\n--- ${r.bcNumber} (${r.version}) ---`);
    console.log(`  Pipeline: raw=${r.rawCount} → exact=${r.exactCount} → fuzzy=${r.finalCount} → final=${r.finalItemCount}`);
    console.log(`  Gaps: [${r.finalSequenceGaps.join(", ")}]`);
    console.log(`  Fuzzy merges logged: ${r.savedMerges.length}`);

    if (r.savedMerges.length > 0) {
      console.log(`  Merge details:`);
      for (const m of r.savedMerges) {
        const normKept = _bomNormPn(m.kept);
        const normDropped = _bomNormPn(m.dropped);
        const ed = _bomLevDistBounded(normKept, normDropped, 5);
        const maxLen = Math.max(normKept.length, normDropped.length);
        const threshold = maxLen <= 8 ? 1 : maxLen <= 14 ? 2 : 3;
        console.log(`    KEPT="${m.kept}" DROPPED="${m.dropped}"`);
        console.log(`      norm: "${normKept}" vs "${normDropped}"`);
        console.log(`      editDist=${ed} threshold=${threshold} (maxLen=${maxLen})`);
        console.log(`      reason="${m.reason}" mfr="${m.manufacturer}"`);
        console.log(`      desc="${(m.description || "").substring(0, 80)}"`);
      }
    } else {
      console.log(`  NO fuzzy merge log in extraction report!`);
      // Check if fuzzyMerges is an array but empty, or not present at all
      const doc = await db.doc(t.path).get();
      const panel = doc.data().panels[0];
      const fm = panel.extractionReport?.fuzzyMerges;
      console.log(`  report.fuzzyMerges type: ${typeof fm}, value: ${JSON.stringify(fm)}`);
    }
  }

  // Global scan: find ALL panels where fuzzy merge caused losses
  console.log("\n\n=== GLOBAL: All panels with fuzzy merge losses ===\n");

  const allResults = [];

  const companies = await db.collection("companies").get();
  for (const c of companies.docs) {
    const projects = await db.collection(`companies/${c.id}/projects`).get();
    for (const p of projects.docs) {
      const d = p.data();
      if (!d.panels) continue;
      for (const panel of d.panels) {
        const report = panel.extractionReport;
        if (!report) continue;
        const exactToFuzzy = (report.exactCount || 0) - (report.finalCount || 0);
        if (exactToFuzzy > 0 || (report.fuzzyMerges || []).length > 0) {
          allResults.push({
            bc: d.bcProjectNumber || "(none)",
            version: report.version || "?",
            raw: report.rawCount || 0,
            exact: report.exactCount || 0,
            fuzzy: report.finalCount || 0,
            final: report.finalItemCount || 0,
            mergeCount: (report.fuzzyMerges || []).length,
            exactToFuzzyDrop: exactToFuzzy,
            gaps: (report.finalSequenceGaps || []).length,
          });
        }
      }
    }
  }

  const users = await db.collection("users").get();
  for (const u of users.docs) {
    const projects = await db.collection(`users/${u.id}/projects`).get();
    for (const p of projects.docs) {
      const d = p.data();
      if (!d.panels) continue;
      for (const panel of d.panels) {
        const report = panel.extractionReport;
        if (!report) continue;
        const exactToFuzzy = (report.exactCount || 0) - (report.finalCount || 0);
        if (exactToFuzzy > 0 || (report.fuzzyMerges || []).length > 0) {
          allResults.push({
            bc: d.bcProjectNumber || "(none)",
            version: report.version || "?",
            raw: report.rawCount || 0,
            exact: report.exactCount || 0,
            fuzzy: report.finalCount || 0,
            final: report.finalItemCount || 0,
            mergeCount: (report.fuzzyMerges || []).length,
            exactToFuzzyDrop: exactToFuzzy,
            gaps: (report.finalSequenceGaps || []).length,
          });
        }
      }
    }
  }

  if (allResults.length === 0) {
    console.log("No panels with fuzzy merge losses found.");
  } else {
    console.log(`${allResults.length} panels with fuzzy merge activity:\n`);
    console.log("Project      Version      Raw  Exact Fuzzy Final Merges Drop Gaps");
    console.log("------------ ------------ ---- ----- ----- ----- ------ ---- ----");
    for (const r of allResults.sort((a, b) => b.exactToFuzzyDrop - a.exactToFuzzyDrop)) {
      console.log(`${r.bc.padEnd(12)} ${r.version.padEnd(12)} ${String(r.raw).padEnd(4)} ${String(r.exact).padEnd(5)} ${String(r.fuzzy).padEnd(5)} ${String(r.final).padEnd(5)} ${String(r.mergeCount).padEnd(6)} ${String(r.exactToFuzzyDrop).padEnd(4)} ${r.gaps}`);
    }
  }

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

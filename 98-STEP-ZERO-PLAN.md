# #98 Step Zero — Detailed Plan

**Author:** Sam Wize (Coach)
**Date:** 2026-06-04
**Type:** Detailed Plan for Marc implementation
**Status:** AWAITING JON APPROVAL
**Prerequisite for:** #98 Foundational Audit baseline study + all ground-truth scoring

---

## Overview

Three components, all small, all prerequisite. Each is independent — can ship in separate commits
or one. Total estimate: ~40-60 lines of app.jsx changes + 1 line of functions/index.js.

| Component | Purpose | Size |
|-----------|---------|------|
| **(a) Raw model output persistence** | Attribute errors to model vs pipeline | ~15 lines across 2 functions |
| **(b) #57 bomRegion on re-extraction batch** | Unblock re-extraction (currently returns "wrong-page-type") | 1 line |
| **(c) Surfaced correction log** | Make every PN transform visible per extraction | ~30 lines across 3 pipeline sites |

---

## Component (a): Raw Model Output Persistence

### What

Store the raw model JSON text per-page inside `extractionReport.perPageOutcomes`. This is the
model's complete structured output before `_parseAndVerifyBomRaw` parses, splits, normalizes, or
downgrades anything.

### Where

**Site 1 — `extractBomPageViaServer` (L11663-11701):**

Currently returns `_parseAndVerifyBomRaw(data.raw, ...)` which discards `data.raw`. Change to
also return `rawModelOutput` alongside the parsed result.

```
// L11699 — CURRENT:
const parsed=_parseAndVerifyBomRaw(data.raw,data.extractionPath||intendedPath);

// L11699 — NEW:
const parsed=_parseAndVerifyBomRaw(data.raw,data.extractionPath||intendedPath);
parsed.rawModelOutput=data.raw;
```

**Site 2 — `extractBomBatchViaServer` (L11718-11729):**

Same pattern inside the per-page result loop.

```
// L11723 — CURRENT:
try{const p=_parseAndVerifyBomRaw(r.raw,r.extractionPath||"pdf-native");...parsed[r.pageNumber]={...p,...};

// L11723 — NEW:
try{const p=_parseAndVerifyBomRaw(r.raw,r.extractionPath||"pdf-native");p.rawModelOutput=r.raw;...parsed[r.pageNumber]={...p,...};
```

**Site 3 — Client-side PDF fallback (L11823-11835) and crop fallback (L11865-11868):**

Same pattern — capture `raw` before passing to `_parseAndVerifyBomRaw`.

```
// L11835 — after _parseAndVerifyBomRaw:
const parsed = _parseAndVerifyBomRaw(raw, "pdf-native");
parsed.rawModelOutput = raw;
return parsed;

// L11868 — same:
const parsed = _parseAndVerifyBomRaw(raw, "bom-region-crop");
parsed.rawModelOutput = raw;
return parsed;
```

**Site 4 — Thread into `_perPageOutcomes` (L13824):**

The per-page extraction loop already collects outcomes. Add `rawModelOutput` from the result.

```
// L13824 — CURRENT:
_perPageOutcomes.push({
  pageId:pg.id, pageName:pg.name||`Page ${pgIdx+1}`, pageNumber:pg.pageNumber||null,
  hasOriginalPdf:!!pg.originalPdfPath, itemsFound:pageItems.length, ...
});

// ADD to the same object:
  rawModelOutput: result?.rawModelOutput || null,
```

This flows automatically into `extractionReport.perPageOutcomes` at L14081 (already persisted).

**Size gating:** For safety, truncate at 60KB per page:
```
parsed.rawModelOutput = (data.raw || "").slice(0, 60000);
```
A 50-item BOM raw output is typically ~25KB. 60KB covers 100+ items with headroom.

**Re-extraction path (L24067-24100):** Same threading needed. The per-page result from
`extractBomPage` / batch already carries `rawModelOutput` after Sites 1-3. Capture it in the
re-extraction per-page outcomes (currently no `_perPageOutcomes` array exists for re-extract —
the re-extraction report builder at L24168 does not have per-page outcomes). For now, store
`rawModelOutput` on the re-extraction report directly:

```
// L24168 — add to reExtractionReport:
rawModelOutputs: bomResults.flat().length > 0 ?
  bomPages.map((pg, idx) => ({pageId: pg.id, rawModelOutput: /* threaded from result */}))
    .filter(o => o.rawModelOutput) : null,
```

This is slightly rougher than the initial-extraction path (which has the clean `_perPageOutcomes`
pipeline), but sufficient for audit purposes.

### Storage impact

Firestore 1MB document limit. A panel with 50 BOM rows + all metadata is typically 200-400KB.
Adding 25KB of raw output per BOM page, with 1-4 BOM pages typical, adds 25-100KB. Well within
budget. The 60KB cap prevents any single page from exceeding 6% of the document limit.

### What this enables

With raw model output persisted, every error can be classified:
- `rawModelOutput` has PN "X" but final BOM has PN "Y" → pipeline changed it (which stage is
  identifiable from the correction log, component (c)).
- `rawModelOutput` has PN "Y" and final BOM has PN "Y" → model emitted the error.

---

## Component (b): #57 bomRegion on Re-Extraction Batch Path

### What

Add `bomRegion:unit.bomRegion||null` to the batch page object at L24053. Without this, the CF
skips CropBox, the model sees the full drawing, and returns "wrong-page-type" on pages where the
BOM is a small region of a larger drawing.

### Where

**Single site — L24053:**

```
// L24053 — CURRENT:
return{pageNumber:pg.pageNumber,croppedBomImage,croppedBomMediaType,notes};

// L24053 — NEW:
return{pageNumber:pg.pageNumber,croppedBomImage,croppedBomMediaType,notes,bomRegion:unit.bomRegion||null};
```

This matches the initial-extraction batch path at L13647 which already includes `bomRegion`.

### What this enables

Re-extraction works again on projects where BOM pages have user-drawn or AI-detected regions.
This is the prerequisite for any controlled experiment (DPI comparison, prompt A/B test).

### Risk

Zero. This is a one-field addition that brings the re-extraction batch path to parity with the
initial extraction batch path. The CF already handles `bomRegion` — it applies CropBox at
L2384-2393 when present.

---

## Component (c): Surfaced Correction Log

### What

Capture every PN transform that occurs between raw model output and final persisted BOM, and
persist the log in `extractionReport`. The log entries have the shape:

```
{stage: "arcCross"|"correctionDB"|"partLibrary"|"internalPnResolve"|"bcPricing",
 rowId: "row-...", from: "original PN", to: "replacement PN",
 reason: "auto-cross from learning DB"|"regex from description"|"BC fuzzy match"|...}
```

Three of the four suspect transform stages already produce this data but don't persist it. The
fourth (Stage R, BC pricing) doesn't produce it at all.

### Where

**Stage M/N/O/P — ARC Cross + Corrections + Part Library + Description Cross:**
`applyLearnedCorrections` (L10331) already returns `{bom, appliedLog}` where `appliedLog` has
entries with `{rowId, kind, from, to, reason}`. This is already captured at L14069-14070 as
`learnedCorrectionsLog` in the extractionReport. **No change needed — already persisted.**

However: `learnedCorrectionsLog` is capped at `.slice(-50)` (L14070). For the audit, this is
sufficient (50 entries covers any realistic BOM). No change needed.

**Stage J — `resolveInternalPartNumbers` (L11024):**

Currently returns only the modified BOM array — the individual replacements are console.log'd
but not captured. Change to return `{bom, resolvedLog}`:

```
// L11024 — CURRENT:
function resolveInternalPartNumbers(bom){
  ...
  return result;
}

// L11024 — NEW:
function resolveInternalPartNumbers(bom){
  ...
  const resolvedLog = [];
  const result=bom.map(r=>{
    ...
    if(mfrPn){
      resolved++;
      resolvedLog.push({stage:"internalPnResolve", rowId:r.id, from:origPn, to:mfrPn,
        reason:`regex from description: "${(r.description||"").slice(0,60)}"`});
      ...
    }
    ...
  });
  ...
  return {bom: result, resolvedLog};
}
```

Update all 3 call sites to destructure:
- L13917: `const {bom: resolved, resolvedLog} = resolveInternalPartNumbers(filtered);`
- L24127: `const {bom: reResolved, resolvedLog: reResolvedLog} = resolveInternalPartNumbers(reFiltered);`
- L24348: `const {bom: fbResolved, resolvedLog: fbResolvedLog} = resolveInternalPartNumbers(fbFiltered);`

Add `resolvedLog` to `extractionReport`:
```
// L14061+ — add to extractionReport:
internalPnResolutions: resolvedLog || [],
```

Same for re-extract report at L24168 and feedback re-extract report.

**Stage R — BC Pricing PN Substitution (L14357 / L25575):**

This is the stage with NO logging at all. The PN overwrite happens inline inside the
`updatedBom.map()` call. Add a capture array:

```
// At the TOP of the pricing phase (before the map):
const bcPnSubstitutions = [];

// Inside the map, at L14357 / L25575 — CURRENT:
return{...r, partNumber: bcMap[key].bcNumber || r.partNumber, ...};

// CHANGE to:
const newPn = bcMap[key].bcNumber || r.partNumber;
if (newPn !== r.partNumber) {
  bcPnSubstitutions.push({stage: "bcPricing", rowId: r.id,
    from: r.partNumber, to: newPn, reason: "BC fuzzy match"});
}
return{...r, partNumber: newPn, ...};
```

There are TWO pricing paths:
- Background pricing path (L14352-14365) — `runPricingBackground`
- Main pricing path (L25564-25583) — `runPricingOnPanel`

Both need the capture. The `bcPnSubstitutions` array should be returned/persisted.

For the main pricing path, the correction log can be stored on the panel (not in
extractionReport — pricing runs independently of extraction). Best location:
`panel.pricingLog.bcPnSubstitutions` alongside the existing pricing metadata. Or, simpler:
just log to `debugLogs` via `logDebugEntry` with the full substitution list on every pricing
run. This avoids changing the panel schema and provides immediate visibility in
Settings → Debug Logs.

**Recommended approach for Stage R:** Start with `logDebugEntry` logging (zero schema change,
immediate visibility). If the audit reveals Stage R fires frequently, promote to persisted
panel field later.

```
// After the pricing map completes, at each pricing path:
if (bcPnSubstitutions.length > 0) {
  console.warn(`[BC PRICING] ${bcPnSubstitutions.length} PN substitution(s):`,
    bcPnSubstitutions.map(s => `${s.from} → ${s.to}`));
  try {
    if (typeof window !== "undefined" && typeof window.logDebugEntry === "function") {
      window.logDebugEntry({severity: "info", source: "bcPricing",
        message: `${bcPnSubstitutions.length} PN substitution(s) during pricing`,
        extra: {projectId, panelId: panel.id, substitutions: bcPnSubstitutions.slice(0, 20)}});
    }
  } catch(_) {}
}
```

### What this enables

Jon/Noah can see, per extraction: "ARC changed PN from X to Y via [Stage J / ARC Cross / BC
pricing]." This is the single change that would have caught every silent corruption reconstructed
from git history this session (Freddy §5c).

Combined with component (a), the full attribution chain becomes:
1. Raw model output → what the model said
2. Correction log → what the pipeline changed and why
3. Final BOM → what the user sees

Any discrepancy between (1) and (3) is explained by (2). If (2) is empty but (1) ≠ (3), the
pipeline has an unlogged transform — a bug to find.

---

## Test Plan

### (a) Raw model output
1. Extract a fresh BOM (any project). Inspect `panel.extractionReport.perPageOutcomes` in
   Firestore — each page entry should have `rawModelOutput` containing the model's JSON text.
2. Verify `rawModelOutput` is valid JSON containing `items` array.
3. Compare `rawModelOutput` item count to `extractionReport.rawCount` — should match.
4. Re-extract the same panel. Verify the re-extraction report also carries raw output.

### (b) #57 bomRegion
1. Open a project where re-extraction currently fails with "wrong-page-type" (PRJ402119).
2. Re-extract. Verify it succeeds (returns items, not "wrong-page-type").
3. Verify Cloud Function logs show "PDF region crop applied" for pages with bomRegion.

### (c) Correction log
1. Extract a project known to trigger ARC Cross (any project with learned alternates). Verify
   `extractionReport.learnedCorrectionsLog` contains entries (already works — this is existing).
2. Extract an FLS-format project with numeric PNs. Verify `extractionReport.internalPnResolutions`
   contains entries showing the PN replacements.
3. Run "Get New Pricing" on any BC-connected project. Check Settings → Debug Logs for a
   `bcPricing` entry showing any PN substitutions (or confirming zero substitutions occurred).

---

## Commit Strategy

Single commit, single deploy. All three components are independent but there's no reason to
stage them separately — none is risky, all are additive (no behavior change to existing
extraction/pricing), and the audit needs all three before meaningful measurement can begin.

Commit message: `#98 Step Zero: raw model output persistence + #57 bomRegion + correction log`

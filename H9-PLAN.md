# H9-PLAN.md — Fuzzy Merge itemNo Guard

**Status:** DRAFT — awaiting Coach review, then Jon approval before implementation.

**Problem:** `fuzzyMergeBomItemsWithReport` (`app.jsx:9205-9297`) silently drops legitimate BOM items when product-family variants have edit-distance ≤ threshold, same manufacturer, and identical descriptions. 10 production panels affected, 22 items total lost. All are IDEC relay/socket variants. See COACH.md C12 for full investigation.

**Fix model:** Mirror H6's pattern — add a single guard predicate to a permissive merge function. H6 added `x_left` guard to `positionalMergeBomItems` (line 9355); H9 adds `itemNo` guard to `fuzzyMergeBomItemsWithReport`.

---

## 1. Current Logic (what exists today)

`fuzzyMergeBomItemsWithReport` at lines 9205-9297 runs a nested loop over BOM items (post-positional-dedup, post-exact-PN-dedup). For each pair `(base, b)`:

1. **Short PN skip** (line 9211): Skip if normalized PN < 5 chars.
2. **Exact match skip** (line 9218): Skip if PNs are identical (already deduped upstream).
3. **Length delta** (line 9220): Skip if normalized PN lengths differ by > 2.
4. **Y-position guard** (lines 9237-9250): If both items have `y_top` and differ by > 0.008, check if descriptions are identical after normalization. If descriptions differ → `continue` (don't merge). If descriptions are identical → set `ydiffOcrDupOverride=true` and proceed (v1.19.642 override).
5. **Edit distance** (lines 9252-9255): Compute bounded Levenshtein. Threshold: `maxLen ≤ 8 → 1`, `maxLen ≤ 14 → 2`, `else → 3`. Skip if `ed > threshold`.
6. **Signal gates** (lines 9258-9264): Require `mfrMatch` OR `descMatch`. Stricter ed limits when only one signal is present.
7. **Merge** (lines 9265-9291): Keep longer PN, merge qty (SUM normally, MAX if `ydiffOcrDupOverride`), mark dropped item as consumed.

**The gap:** No check compares `itemNo` values. Two items with different item numbers on the drawing (by definition, different BOM line items) can merge if they pass gates 1-6.

## 2. Proposed Change

### 2.1 ItemNo guard — single predicate

Insert after the length-delta check (line 9220) and before the Y-position guard (line 9237):

```javascript
// DECISION(v1.20.21): itemNo guard for product-family variants. Items with
// different non-empty itemNo values are different BOM line items on the drawing
// and must never merge, regardless of PN similarity. Analogous to the x_left
// guard in positionalMergeBomItems (v1.20.20). Items without itemNo (labor,
// contingency, crate, job-buyoff) are unaffected — they still enter fuzzy merge.
const inA=String(base.itemNo||base.item||"").replace(/\D/g,"");
const inB=String(b.itemNo||b.item||"").replace(/\D/g,"");
if(inA&&inB&&inA!==inB)continue;
```

**Placement rationale:** After line 9220 (length delta, which is a fast numeric check) and before line 9237 (Y-position guard, which does string normalization). The itemNo check is O(1) string comparison and should short-circuit before the heavier Y/description logic. It is also logically prior — if items have different item numbers, no amount of PN similarity matters.

### 2.2 Why `base.itemNo || base.item`

The extraction pipeline uses both `itemNo` and `item` as field names depending on the code path. The existing codebase (e.g., `check-merged-itemnos.js`) uses `r.itemNo || r.item` for this reason. The `replace(/\D/g,"")` strips non-digit suffixes (e.g., "27A" → "27") to normalize revision-marked item numbers.

### 2.3 Merge report enhancement

Add `keptItemNo` and `droppedItemNo` to the merge report object (line 9270-9275) for diagnostic visibility:

```javascript
merges.push({
  kept,dropped,editDist:ed,
  keptItemNo:base.itemNo||base.item||"",
  droppedItemNo:b.itemNo||b.item||"",
  reason:mfrMatch&&descMatch?"mfr+desc match":mfrMatch?"mfr match":"desc match",
  manufacturer:base.manufacturer||b.manufacturer||"",
  description:((base.description||"").length>=(b.description||"").length?base.description:b.description)||"",
});
```

This is strictly additive — no consumers of the merge report read `keptItemNo`/`droppedItemNo` today, but the `reproduce-fuzzy-merge.js` test script already captures these fields in its diagnostic version, confirming the pattern is useful.

## 3. Edge Cases

| Scenario | Behavior | Correct? |
|----------|----------|----------|
| Both items have itemNo, values differ (e.g., 25 vs 27) | `continue` — skip merge | ✓ This is the fix |
| Both items have itemNo, values match (e.g., 25 vs 25) | Fall through to remaining gates | ✓ Same-row OCR variants should still merge |
| One item has itemNo, other doesn't | Fall through (`inA` or `inB` is empty → `if(inA&&inB&&...)` is false) | ✓ Don't block merges when itemNo is unavailable on one side |
| Neither item has itemNo | Fall through (both empty) | ✓ Labor/contingency/crate/job-buyoff rows still merge normally |
| itemNo contains non-digit chars (e.g., "27A") | `replace(/\D/g,"")` normalizes to "27" | ✓ Handles revision-marked items |
| itemNo is "0" or "00" | Normalizes to "0" — string `"0"` is truthy in JS, so the guard DOES fire and blocks the merge. Inconsequential: real BOM items never use itemNo 0 | ✓ No production impact |
| Multi-page BOM, items from different pages share itemNo numbers | Same itemNo across pages → items can merge (but Y-guard and page-position differences will usually block) | ✓ ItemNo guard is conservative — it only blocks when itemNos are DIFFERENT. Same itemNo = maybe same item, leave for other gates to decide |

### Items without itemNo in production

From `check-merged-itemnos.js` on PRJ402104: 44 of 50 BOM items have itemNo. The 6 without are:
- Labor (assembly hours)
- Customer-supplied items (no drawing item number)
- Contingency
- Crate
- Job buyoff

These are non-material rows that wouldn't have product-family variants. The guard's fall-through behavior for empty itemNo is correct.

## 4. Files and Functions Affected

| File | Function/Location | Change |
|------|-------------------|--------|
| `src/app.jsx` | `fuzzyMergeBomItemsWithReport` (line ~9220) | Insert itemNo guard predicate |
| `src/app.jsx` | merge report object (line ~9270) | Add `keptItemNo`, `droppedItemNo` fields |

**No other files or functions are affected.** The fuzzy merge function is called from three places (initial extraction pipeline, re-extraction pipeline, feedback re-extraction pipeline) but the fix is inside the function itself — all callers benefit automatically.

## 5. What Does NOT Change

- Edit-distance thresholds (still `maxLen ≤ 8 → 1`, `≤ 14 → 2`, `else → 3`)
- Y-position guard and v1.19.642 identical-description override
- Manufacturer/description signal gates
- Qty merge logic (SUM vs MAX)
- The `merges` array structure (additive fields only)
- `fuzzyMergeBomItems` back-compat wrapper (line 9299)
- Positional dedup (`positionalMergeBomItems`) — already has its own H6 guard
- Exact PN dedup — runs before fuzzy, unaffected
- All downstream pipeline stages (filterNonBomRows, resolveInternalPartNumbers, etc.)

## 6. Regression Test Plan

### 6.1 Primary success criterion: 10 production panels, all 22 dropped items recovered

Run the fuzzy merge logic (with itemNo guard) against BOM data from all 10 affected panels. Each panel's previously-dropped items must survive in the output.

**Method:** Adapt `tests/extraction-baseline/reproduce-fuzzy-merge.js` to include the itemNo guard in its local `fuzzyMergeWithDiagnostics` function. Run against all 10 panels. The `merges` array should be EMPTY for the previously-flagged false merges (IDEC variants with different itemNos). Any remaining merges in the output are items with same itemNo (legitimate OCR dedup).

Specific panels and expected recovery:

| Project | Gaps | Dropped Items | Expected After Fix |
|---------|------|---------------|-------------------|
| PRJ402104 | [27, 28, 30] | RH2B-ULC-120, SH2B-05C, SH3B-05C | All 3 survive |
| PRJ402106 | gaps logged | IDEC variants | All survive |
| PRJ402097 | gaps logged | IDEC variants | All survive |
| PRJ402103 | gaps logged | IDEC variants | All survive |
| PRJ402105 | gaps logged | IDEC variants | All survive |
| PRJ402099 | gaps logged | IDEC variants | All survive |
| PRJ402107 | gaps logged | IDEC variants (if any) | All survive |
| + 3 more | from global scan | IDEC variants | All survive |

Total: 22 items across 10 panels, zero false merges remaining.

### 6.2 Legitimate OCR dedup still works

Verify that items with the SAME itemNo but different PNs (genuine OCR misreads) still merge. The itemNo guard only blocks when itemNos DIFFER — same-itemNo pairs fall through to the existing edit-distance logic.

**Method:** In the adapted `reproduce-fuzzy-merge.js`, check whether any panel has merges where `keptItemNo === droppedItemNo`. These are legitimate merges that must still occur.

If no such cases exist in the 10 panels (all merges were false positives), use a synthetic test: construct two items with `itemNo: "25"`, `partNumber: "RH1BULC120"` vs `partNumber: "RH1BUIC120"` (I→L OCR error, editDist=1), same manufacturer. Confirm they still merge.

### 6.3 Items without itemNo still merge

Verify that items lacking itemNo (labor, contingency, etc.) are not blocked by the guard.

**Method:** Construct two items with `itemNo: ""`, near-identical PNs, same manufacturer. Confirm they still merge. This is covered by the `if(inA&&inB&&...)` logic — empty strings are falsy.

### 6.4 Live re-extraction verification

After deploying the fix:

1. Re-extract PRJ402104 (the best-documented case with 3 specific dropped items).
2. Verify items 27 (RH2B-ULC-120), 28 (SH2B-05C), 30 (SH3B-05C) appear in the final BOM.
3. Verify `finalSequenceGaps` is empty (or at least doesn't include 27, 28, 30).
4. Verify no other items were lost (total item count ≥ previous).

### 6.5 Single-column BOM regression

Re-extract a single-column BOM project (not an IDEC project) to confirm no behavior change for single-column drawings. The itemNo guard is column-agnostic — it doesn't care about layout — but this confirms no unintended interaction with the H6 x_left guard or other pipeline stages.

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Guard blocks a legitimate OCR merge | Very low — requires two items with DIFFERENT itemNo values but SAME intended part (would mean the AI read the item number wrong AND the part number similarly wrong) | Low — item appears twice in BOM (visible, fixable by user) | The guard only fires when itemNos differ. Same-itemNo OCR variants still merge normally. |
| Items without itemNo stop merging | Zero — guard requires BOTH `inA` and `inB` to be non-empty | N/A | Covered by `if(inA&&inB&&...)` falsy check |
| Merge report consumers break | Zero — `keptItemNo`/`droppedItemNo` are additive fields | N/A | No existing consumer reads these fields |
| Performance regression | Zero — single string comparison per pair, before heavier Y/description logic | N/A | O(1) per pair, negligible vs Levenshtein |

**Worst-case failure mode:** A legitimate OCR merge is blocked (item appears twice in BOM with slightly different PNs). This is the opposite of the current bug (item disappears). Duplicate items are visible and correctable; missing items are invisible. The worst case is strictly better than the current state.

## 8. Implementation Steps

1. Add itemNo guard predicate to `fuzzyMergeBomItemsWithReport` (after line 9220).
2. Add `keptItemNo`/`droppedItemNo` to merge report object (line ~9270).
3. Run adapted `reproduce-fuzzy-merge.js` with guard logic to verify all 22 items recovered.
4. Run `node validate_jsx.js` to confirm JSX compiles.
5. Deploy via `bash deploy.sh`.
6. Re-extract PRJ402104 live. Verify items 27, 28, 30 survive.
7. Capture post-H9 Firestore state for baseline comparison.

**Estimated scope:** ~5 lines of production code + 2 additive report fields. Single function, single predicate. No architectural changes, no new files, no schema changes.

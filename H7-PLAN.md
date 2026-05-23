# H7-PLAN: Add L3 Retry/Gap-Fill to Re-Extraction Path

**Status:** DRAFT — awaiting Coach review + Jon approval before implementation.

---

## 1. Problem Statement

L3 (two-phase retry + gap-fill) exists only in `runExtractionTask` (initial extraction, `app.jsx:12327-12462`). The re-extraction flow (`runExtraction`, `app.jsx:22406-22609`) and feedback re-extraction (`reExtractWithFeedback`, `app.jsx:22681-22809`) have no L3 logic. Re-extractions get a single extraction pass per page — no automatic retry on count mismatch, no sequence gap detection, no targeted gap-fill.

Users who re-extract are specifically doing so because initial extraction was unsatisfactory. This is exactly when L3 is most valuable.

**Finding:** C4 in COACH.md.

---

## 2. How L3 Works Today (in runExtractionTask)

**Location:** `app.jsx:12327-12462`, inside the per-unit extraction loop.

### Phase 1 — Broad Retry + Merge (lines 12355-12410)

**Trigger:** `result.extractionVerification.status === "needs-review"` AND `pageRetryAttempts < 1`

`_parseAndVerifyBomRaw` (called inside `extractBomPage`) sets `status: "needs-review"` when:
- `countMismatch`: extracted count != `detectedLineCount` (AI's self-reported expected count)
- `missingFromStart`: smallest itemNo > 1 (e.g., starts at item 3, items 1-2 missing)
- `sequenceGaps`: gaps in the itemNo sequence (e.g., items 1..5 then 8..10 → gaps at 6,7)

**Action:** Re-calls `extractBomPage` with detailed retry feedback explaining what was missed. MERGES both passes by union on itemNo — keeps whichever entry has a real partNumber (not "?" or EXTRACTION_FAILED). New items from retry get `_extractionRetried = true`.

### Phase 2 — Targeted Gap-Fill (lines 12412-12462)

**Trigger:** After Phase 1 merge, if:
- `mergedNums.length >= 3` (need enough items to detect gaps)
- `pageRetryAttempts <= 1` (haven't already retried twice)
- `0 < remainingGaps.length <= 20` (reasonable number of missing items)

**Action:** Re-calls `extractBomPage` asking ONLY for specific missing item numbers. Filters results to only items matching requested numbers. Adds to merged items if not already present. Marked `_extractionGapFill = true`.

### Key Properties

- Both phases operate **per extraction unit** (per crop/region within a page)
- Union merge strategy: items can only be ADDED, never REMOVED
- `pageRetryAttempts` counter prevents runaway retries (max 2 extra calls per page)
- Works with both batch and per-page extraction results
- `extractBomPage` already returns `extractionVerification` from `_parseAndVerifyBomRaw` — the data is available, just unused in re-extraction

---

## 3. Recommended Approach: B (Shared Function)

### Why B over A

**Approach A (duplicate):** Copy ~135 lines of L3 logic into `runExtraction`. Fast to implement, but:
- Two copies to maintain. L3 has already been tuned twice (v1.19.1057 initial, then gap-fill limits). Future changes must touch both.
- Copy-paste errors in a 2MB file are hard to spot.
- The L3 logic is self-contained — it takes a result, optionally re-calls extractBomPage, returns an enriched result. Clean extraction boundary.

**Approach B (shared function):** Extract L3 into a module-level function, call from both paths.
- Single source of truth for retry logic.
- Mechanical refactor of `runExtractionTask` — identical behavior, just indirected through a function call.
- Risk of touching `runExtractionTask` is mitigated by the fact that we're extracting code without modifying its semantics.

### Risk mitigation for B

The main risk is: if the extracted function has a bug, it breaks both paths. Mitigations:
1. **Mechanical extraction:** The function body is a direct copy of existing L3 code. No logic changes.
2. **Same call pattern:** `runExtractionTask` calls the function with the same inputs it currently uses inline. Output is consumed identically.
3. **Test both paths:** Re-extract PRJ402107 (re-extraction path) and verify initial extraction on a test project still works.

---

## 4. Implementation Plan

### 4.1 Extract shared L3 function

**New function** at module level (near `_parseAndVerifyBomRaw`, around line 10350):

```javascript
async function applyL3RetryAndGapFill({
  result,              // return value from extractBomPage
  unit,                // extraction unit (dataUrl, originalPdfPath, pageNumber, croppedBomDataUrl, bomRegion)
  notes,               // computed notes string
  pageLabel,           // human-readable label for logging (e.g., "Page 3" or pg.name)
  pageRetryAttempts,   // mutable counter (pass current value, function returns updated value)
}) {
  // Returns: { result, pageRetryAttempts, extractionPathsSeen: string[] }
  // result.items may be enriched with _extractionRetried / _extractionGapFill items
  // result.extractionVerification may be updated with l3Merged, l3GapFillRecovered fields
}
```

**Body:** Direct copy of lines 12355-12462 from `runExtractionTask`, with:
- `unit.dataUrl`, `unit.originalPdfPath`, etc. passed via the `unit` parameter (already matches the variable names used in the loop)
- `pg.name||pgIdx+1` → `pageLabel` parameter
- `_extractionPathsSeen.add(...)` → accumulate into a returned array
- `console.log` / `console.warn` / `window.logDebugEntry` calls preserved as-is
- Returns `{ result, pageRetryAttempts, extractionPathsSeen }` so the caller can update its local state

### 4.2 Replace inline L3 in runExtractionTask

**Lines affected:** `app.jsx:12355-12462`

Replace the ~107 lines of inline L3 code with:

```javascript
const l3 = await applyL3RetryAndGapFill({
  result, unit, notes,
  pageLabel: pg.name || `Page ${pgIdx + 1}`,
  pageRetryAttempts,
});
result = l3.result;
pageRetryAttempts = l3.pageRetryAttempts;
for (const p of l3.extractionPathsSeen) _extractionPathsSeen.add(p);
```

**Behavior change:** None. The extracted function does exactly what the inline code did.

### 4.3 Add L3 to runExtraction (re-extraction path)

**Insertion point:** After line 22501 (where `result` is assigned from extractBomPage or batch), before line 22503 (where `result.extractionPath` is checked).

Current flow per extraction unit:
```
result = extractBomPage(...) or batch result
if(result?.extractionPath) _reExtractionPathsSeen.add(...)
const items = translateItemsToPageCoords(result.items...)
```

New flow per extraction unit:
```
result = extractBomPage(...) or batch result
// NEW: L3 retry/gap-fill
const l3 = await applyL3RetryAndGapFill({
  result, unit, notes,
  pageLabel: `Page ${pgIdx + 1}`,
  pageRetryAttempts,
});
result = l3.result;
pageRetryAttempts = l3.pageRetryAttempts;
for (const p of l3.extractionPathsSeen) _reExtractionPathsSeen.add(p);
// END NEW
if(result?.extractionPath) _reExtractionPathsSeen.add(...)
const items = translateItemsToPageCoords(result.items...)
```

**Requires:** Adding `let pageRetryAttempts = 0;` before the unit loop (inside the `parallelMap` callback, same scope as in `runExtractionTask`).

### 4.4 Do NOT add L3 to feedback re-extraction

`reExtractWithFeedback` already passes the user's `aiFeedback` to `extractBomPage`. Adding L3 Phase 1 on top would send BOTH the user's feedback AND automated retry feedback — potentially conflicting instructions to the AI. The user's feedback IS the retry mechanism in this flow.

If feedback re-extraction still has gaps, that's a signal the AI genuinely can't find those items, and automated retry won't help. This can be revisited later if needed.

### 4.5 Update re-extraction report builder

**Current report** (lines 22584-22595) — missing fields compared to initial extraction:

| Field | Initial | Re-extraction | Action |
|-------|---------|--------------|--------|
| `l3MergeRecovered` | Yes (line 12745) | No | **Add** — count items with `_extractionRetried` flag |
| `l3GapFillRecovered` | Yes (line 12746) | No | **Add** — count items with `_extractionGapFill` flag |
| `perPageOutcomes` | Yes (line 12741) | No | **Add** — build per-page outcome array same as initial path |
| `scanQuality` | Yes (line 12747) | No | **Skip** — PDF quality is already known from initial extraction |
| `scanDetails` | Yes (line 12748) | No | **Skip** — same reason |

**Implementation for L3 fields:** After the merge pipeline (line 22559, after `splitCompanionParts`), before the report builder (line 22584):

```javascript
const l3MergeRecovered = bomSorted.filter(it => it._extractionRetried).length;
const l3GapFillRecovered = bomSorted.filter(it => it._extractionGapFill).length;
```

Then add to the report object:
```javascript
l3MergeRecovered,
l3GapFillRecovered,
```

**Implementation for perPageOutcomes:** Requires tracking outcomes per page in the `parallelMap` callback. Add `_rePerPageOutcomes` array at the same scope as `_reExtractionPathsSeen`, populate after each page's extraction completes (mirror lines 12474-12485 from initial extraction). Add to report as `perPageOutcomes: _rePerPageOutcomes`.

---

## 5. Files and Functions Affected

| File | Function/Location | Change |
|------|-------------------|--------|
| `src/app.jsx` ~10350 | New `applyL3RetryAndGapFill()` | New shared function |
| `src/app.jsx` 12355-12462 | `runExtractionTask` L3 block | Replace inline L3 with function call |
| `src/app.jsx` 22491-22512 | `runExtraction` inner unit loop | Add L3 function call after extractBomPage |
| `src/app.jsx` 22584-22595 | `runExtraction` report builder | Add l3MergeRecovered, l3GapFillRecovered, perPageOutcomes |

**NOT changed:**
- `reExtractWithFeedback` (feedback path — user feedback IS the retry)
- `extractBomPage` / `extractBomPageViaServer` / `extractBomBatchViaServer` (extraction primitives unchanged)
- `_parseAndVerifyBomRaw` (verification logic unchanged)
- `functions/index.js` (server-side unchanged)
- No Cloud Function deploy required

---

## 6. Verification and Progress Handling

### 6.1 Verification status is already available

`extractBomPage` calls `_parseAndVerifyBomRaw` internally and returns `extractionVerification` in the result. The re-extraction flow already receives this data — it just ignores `result.extractionVerification`. No additional verification call is needed; L3 reads what's already there.

### 6.2 Progress bar updates during L3

In `runExtractionTask`, L3 doesn't update the progress bar — the heartbeat covers it. In `runExtraction`, the progress bar advances per completed unit (line 22508-22512). L3 retries will pause progress on the current unit while retries run. This is acceptable — the unit completes with more items, then progress advances.

For visibility, log lines (`console.warn("[RE-EXTRACT] L3 Phase 1 retry triggered..."`) will show in the ARC Debug Logs, same as the initial extraction path.

---

## 7. Regression Test Plan

### 7.1 Re-extract PRJ402107 (multi-column BOM)

**Expected behavior:**
- Raw extraction produces 87 items (same as H6 baseline)
- `_parseAndVerifyBomRaw` verifies: if all 87 items have sequential itemNos 1-87, status = `"ok"` → L3 does NOT fire
- If the AI misses any items (e.g., only extracts 82), status = `"needs-review"` → L3 Phase 1 fires, retries, merges
- Positional dedup (with H6 x-guard) produces ~85 items
- **Key check:** Final BOM count should be ≥ 85 (same as or better than H6 baseline)

**Why L3 likely won't fire on PRJ402107:** The AI consistently extracts all 87 items on this page — the item loss was from positional dedup (fixed by H6), not from AI extraction misses. L3 targets a different failure mode.

### 7.2 Confirm initial extraction unchanged

Re-extract a single-column test project (e.g., PRJ402104) using **initial** extraction (delete the panel, re-add files, run fresh extraction). Verify:
- L3 behavior matches pre-H7 (fires when expected, doesn't fire when not needed)
- Extraction report includes L3 fields
- Final BOM matches previous extraction

### 7.3 Force-trigger L3 on re-extraction

To verify L3 works in the re-extraction path when it does fire:
- Find or create a project where AI extraction misses items (large BOM, 100+ items, or multi-page BOM)
- OR: Temporarily lower the `detectedLineCount` threshold in `_parseAndVerifyBomRaw` to force `needs-review` (test-only, revert before deploy)
- Verify: L3 console logs appear, `_extractionRetried` / `_extractionGapFill` flags set, extraction report shows `l3MergeRecovered > 0`

### 7.4 Verify report fields

After re-extraction with L3:
- `extractionReport.l3MergeRecovered` present (number, ≥ 0)
- `extractionReport.l3GapFillRecovered` present (number, ≥ 0)
- `extractionReport.perPageOutcomes` present (array of page outcome objects)
- Fields visible in ARC Debug Logs and in the Firestore document

---

## 8. Risk Assessment

### 8.1 L3 fires unexpectedly during re-extraction

**Impact:** 1-2 extra API calls per page (~$0.30-1.00 per page). Re-extraction takes 10-30 seconds longer per L3 retry.

**Likelihood:** Low-medium. L3 fires only when `extractionVerification.status === "needs-review"`, which requires count mismatch or sequence gaps. Most single-page BOMs extract cleanly. Multi-page or large BOMs (100+ items) are more likely to trigger L3.

**Mitigation:** `pageRetryAttempts` counter caps at 2 extra calls per page. Same safeguard as initial extraction.

### 8.2 L3 retry produces worse results

**Impact:** Unlikely to cause data loss — L3 uses union merge (both passes contribute items, never removes). Worst case: retry adds low-quality items that downstream filters (non-BOM filter, fuzzy merge) handle.

**Likelihood:** Very low. In practice, L3 retries produce the same or better results because the AI gets specific feedback about what was missed.

### 8.3 Shared function breaks initial extraction

**Impact:** If `applyL3RetryAndGapFill` has a bug, initial extraction L3 stops working.

**Likelihood:** Very low — the function body is a mechanical copy of working code. The refactor changes only how it's called, not what it does.

**Mitigation:** Deploy and verify initial extraction on a test project before considering H7 complete.

### 8.4 Progress bar stalls during L3 retries

**Impact:** User sees the re-extraction progress bar pause for 10-30 seconds while L3 retries run. Not a blocking issue — the status message logs indicate what's happening.

**Mitigation:** Could add `bgSetPct` / `ep.set` updates inside L3, but this adds coupling. Acceptable for v1 — the console logs provide visibility.

### 8.5 Cost accumulation on repeated re-extractions

**Impact:** A user who re-extracts the same project multiple times (e.g., testing different feedback) could trigger L3 each time. Each L3 retry = ~$0.30-0.50.

**Likelihood:** Low — re-extraction is an occasional operation, not a tight loop. L3 only fires when the AI actually misses items.

**Mitigation:** Same as initial extraction — no additional safeguard needed.

---

## 9. What This Does NOT Fix

- **OCR/AI reading accuracy** — L3 retries the extraction but uses the same model (Opus) and same PDF input. If the AI consistently misreads a part number (e.g., `B↔8`), L3 won't fix it. That's a different problem (prompt tuning, model upgrade, or snippet self-correction).
- **Cross-column dedup** — Fixed by H6 (X_TOL guard). L3 is complementary: H6 prevents merge errors, L3 recovers extraction misses.
- **Feedback re-extraction gaps** — By design, L3 is NOT added to the feedback path. User feedback is the retry mechanism there.

---

## Summary

| Aspect | Detail |
|--------|--------|
| **Approach** | B — shared `applyL3RetryAndGapFill()` function |
| **Lines changed** | ~20 new function wrapper + ~10 lines in runExtraction + ~5 report fields |
| **Lines refactored** | ~107 lines in runExtractionTask (inline → function call, zero behavior change) |
| **Downstream effects** | Re-extraction gets L3 safety net; report gains L3 + perPageOutcomes fields |
| **Primary test** | Re-extract PRJ402107 — verify BOM count ≥ 85 |
| **Regression test** | Initial extraction on PRJ402104 — confirm unchanged behavior |
| **Risk** | Low. Union merge can't lose items. Cost capped by retry counter. |
| **Deploy** | Hosting only (`bash deploy.sh`). No Cloud Function changes. |

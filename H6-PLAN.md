# H6-PLAN: Fix positionalMergeBomItems for Multi-Column BOMs

**Status:** DRAFT — awaiting Coach review + Jon approval before implementation.

---

## 1. Current Behavior of positionalMergeBomItems

**Location:** `src/app.jsx:9309-9383`

**Purpose:** Dedup BOM items that represent the same physical row on the drawing. Originally built (v1.19.620) for the quadrant extraction path where overlapping crops could produce 2–4 readings of one row. Still used in single-pass extraction because the AI occasionally emits the same row twice with slight variation.

**Call sites (3):**
- `app.jsx:12561` — initial extraction (`runExtractionTask`)
- `app.jsx:22521` — re-extraction (panel re-extract flow)
- `app.jsx:22729` — feedback re-extraction

**Algorithm:**
1. Partition items into `withY` (have `y_top`, `y_bottom`, and `sourcePageIdx`) and `withoutY` (passed through untouched — labor rows, manual adds).
2. Sort `withY` by `(sourcePageIdx, y_top)`.
3. For each item `base`, scan forward for candidates `b` that:
   - Same `sourcePageIdx` (DECISION v1.19.645 — prevents cross-page merges)
   - `|b.y_top - base.y_top| <= Y_TOL` where `Y_TOL = 0.004` (0.4% of page height)
   - `|b.y_bottom - base.y_bottom| <= Y_TOL * 2` (guards against multi-line vs single-line rows)
4. When two items merge, the **winner** is chosen by `scoreItem()`:
   - +3 for non-empty `partNumber`
   - +2 for non-empty `description`
   - +1 each for non-empty `manufacturer`, `itemNo`, non-zero `qty`
   - Tiebreak: length of `partNumber` (×0.01) + length of `description` (×0.005)
5. Winner takes all fields as a coherent unit (DECISION v1.19.622). `qty` = MAX of both. `notes` = concatenated.
6. Output: `[...merged, ...withoutY]`

**What it does NOT check:** `x_left` or `x_right`. There is no horizontal position guard.

**The bug:** For a two-column BOM, left-column item at `y_top=0.38` and right-column item at `y_top=0.38` satisfy the Y tolerance despite being in completely different columns. One is dropped. The winner is arbitrary (whichever scores higher on field completeness), so the dropped item can come from either column.

**Proven impact on PRJ402107:**
- AI extracted 87 items (`rawCount: 87`)
- Positional dedup reduced to 70 (`exactCount: 70`)
- 17 items lost — all cross-column merges at matching y positions

---

## 2. Proposed Change

### 2.1 Add x-position distance check

Insert a single predicate into the inner merge loop, after the `sourcePageIdx` check (line 9346) and before the `y_top` check (line 9348):

```javascript
// Items in different columns of a multi-column BOM must NOT merge.
// x_left distinguishes columns: left ≈ 0.01, right ≈ 0.50 on a two-column page.
const X_TOL = 0.15;
if (typeof b.x_left === "number" && typeof base.x_left === "number"
    && Math.abs(b.x_left - base.x_left) > X_TOL) continue;
```

### 2.2 Why x_left, not midpoint or overlap detection

**Empirical data from PRJ402107** (70 surviving items with spatial data):

| Column | x_left | x_right | Items |
|--------|--------|---------|-------|
| Left (items 1–50) | 0.0100 | 0.9900 | 41 |
| Right (items 51–87) | 0.5000 | 0.9900 | 29 |

- `x_right = 0.99` for ALL items regardless of column. The AI reports x_right as the far edge of the page, not the column boundary. **x_right is useless for column discrimination.**
- `x_left` cleanly separates columns: 0.01 vs 0.50, a gap of 0.49.
- Midpoint `(x_left + x_right) / 2` would be ≈0.50 for left and ≈0.74 for right — smaller gap (0.24), less reliable.
- Overlap detection (`max(left_a, left_b) < min(right_a, right_b)`) would always find overlap because all items share `x_right=0.99`.

**Conclusion:** `x_left` is the only viable discriminator given how the AI reports coordinates.

### 2.3 X_TOL = 0.15 rationale

| Layout | Column x_left positions | Min gap between columns | X_TOL=0.15 safe? |
|--------|------------------------|------------------------|-------------------|
| Two-column | 0.01, 0.50 | 0.49 | Yes (0.49 >> 0.15) |
| Three-column | ≈0.01, ≈0.33, ≈0.66 | ≈0.32 | Yes (0.32 >> 0.15) |
| Single-column | all ≈0.01 (or all ≈0.46, etc.) | 0 (no gap) | N/A — all items satisfy the check, no behavior change |
| Noise within column | PRJ402107 shows 0.0000 spread within each column (all identical x_left) | — | 0.15 accommodates up to ±0.15 AI noise per column |

0.15 was chosen to be:
- Well below the minimum inter-column gap (0.32 for three columns)
- Well above observed within-column AI noise (0.00 on PRJ402107; checked PRJ402089 at 0.007, PRJ402079 at 0.01)
- A round fraction that's easy to reason about

### 2.4 Handling items missing x_left

Use `continue` (skip x-check, fall through to y-check) when either item lacks `x_left`:

```javascript
if (typeof b.x_left === "number" && typeof base.x_left === "number"
    && Math.abs(b.x_left - base.x_left) > X_TOL) continue;
```

If either `x_left` is missing (not a number), the `&&` short-circuits and the `continue` doesn't fire. The function falls through to the existing y_top/y_bottom checks — same behavior as before the change. This matches the existing defensive pattern: items without `y_top` are already excluded from positional dedup entirely (line 9318).

**When would x_left be missing?**
- Legacy projects extracted before spatial coordinates were added (pre-v1.19.603)
- Manual BOM rows (user-added, no spatial data)
- Labor rows (already excluded by the `withY` partition at line 9316-9322)

For these cases, the old y-only merge behavior is correct — they're single-source items where positional dedup shouldn't be needed anyway.

### 2.5 The `continue` vs `break` choice

The existing y_top check uses `break` (line 9350) because items are sorted by y_top — once you exceed Y_TOL, no further candidates can match. The x_left check must use `continue` (not `break`) because items are sorted by `(sourcePageIdx, y_top)`, NOT by x_left. A right-column item at the same y_top will appear immediately after the left-column item in sorted order. `break` would skip it AND all subsequent items; `continue` correctly skips just the cross-column item and keeps scanning.

---

## 3. Impact Analysis — Downstream Consumers

The output of `positionalMergeBomItems` feeds into identical pipelines at all three call sites:

```
positionalMergeBomItems(raw)
  → exact PN dedup (Map by normalized PN, sum qty)
  → fuzzyMergeBomItemsWithReport (edit-distance dedup)
  → filterNonBomRows (structural + pattern filter)
  → resolveInternalPartNumbers
  → [initial extraction only] L3 retry/gap-fill
  → applyPartCorrections / applyLearnedCorrections
  → sortBomByDrawingPosition
  → splitCompanionParts
  → flagSuspectQuantities
  → final sequence gap check
  → save to Firestore
```

**Downstream effects of retaining more items:**

| Stage | Effect of more items from positional dedup | Risk |
|-------|-------------------------------------------|------|
| Exact PN dedup | Items with same PN but different y_top now both survive positional dedup. Exact dedup still merges them by PN and sums qty. **No change in final output for same-PN items.** | None |
| Fuzzy merge | More items means more candidates for fuzzy edit-distance merge. But fuzzy merge has a tight threshold (editDist ≤ 2) and checks manufacturer match. Cross-column items have different PNs — they won't fuzzy-merge. | None |
| filterNonBomRows | More items to filter. But the filter uses structural rules (4-field check, pattern matches). Legitimate BOM items that were previously dropped won't match non-BOM patterns. | None |
| L3 retry | Fewer sequence gaps → fewer L3 retries. This is correct — L3 should NOT retry for items that are already present. | Positive |
| applyLearnedCorrections | More items exposed to auto-cross. If a previously-dropped item has a learned correction, it will now be applied. | Neutral (pre-existing C5 issue, orthogonal to H6) |
| sortBomByDrawingPosition | More items to sort. Sort is by `(sourcePageIdx, y_top)` — recovered items have valid spatial data. | None |
| splitCompanionParts | More items to scan for companion splits. Correct behavior — companions on recovered rows should be split. | None |
| flagSuspectQuantities | More items to flag. Correct — previously-hidden qty errors will now surface. | Positive |
| Final sequence gap check | Fewer gaps. Correct — gaps were artifacts of the dedup bug. | Positive |

**No negative downstream effects identified.** The only effect is that items that were incorrectly dropped are now retained — which is the intended fix.

---

## 4. Regression Test Plan

### 4.1 Must-improve: PRJ402107 (multi-column, 17 items dropped)

**Test:** Re-extract PRJ402107 on fixed code. Compare:
- `rawCount` should remain 87 (extraction unchanged)
- `exactCount` should increase from 70 toward 87
- All 17 previously-missing items (4, 8-10, 18-20, 24-25, 51, 55, 62, 64-65, 69, 74, 87) should be present in the final BOM
- No new duplicate items introduced

**Verification method:** Run `node tools/admin.js inspect-project PRJ402107`, compare `bom.length` and item numbers against reference. Full diff against CCD-verified 87-item BOM in `bom-extraction-test-ovivo.md`.

### 4.2 Must-not-regress: Single-column BOMs (0 positional drops)

These projects had `rawCount == exactCount` (no positional dedup drops). The x-check should be a no-op for them — all items share the same x_left value.

| Project | Panel | BOM count | rawCount → exactCount | x_left range |
|---------|-------|-----------|----------------------|--------------|
| PRJ402104 | Panel 1 | 50 | 47 → 47 (0 dropped) | 0.02 (uniform) |
| PRJ402068 | Panel 1 | 57 | 51 → 51 (0 dropped) | 0.01 (uniform) |
| PRJ402106 | Panel 1 | 50 | 48 → 48 (0 dropped) | 0.02 (uniform) |

**Test:** Re-extract each on fixed code. Verify:
- `exactCount` remains identical
- No new items appear or disappear
- BOM item numbers match pre-fix state

**Why these three:** Recent extractions (v1.20.8, v1.19.640, v1.20.11), clean single-column layout, moderate BOM sizes (47-57 items), zero positional drops. If the fix accidentally breaks single-column dedup, these will catch it immediately.

### 4.3 Additional multi-column: PRJ402101

**Characteristics:** x=[0.01..0.60], 71 items, no extraction report (pre-report era). Multi-column layout.

**Test:** Re-extract on fixed code. Check that item count does not decrease (ideally increases if items were being dropped). Compare x_left distribution to confirm multi-column detection.

**Caveat:** No extraction report means no `rawCount` baseline — we can only verify post-fix item count and check for structural integrity.

### 4.4 Edge case: Projects with within-column x_left noise

PRJ402089 has x_left range [0.01..0.017] — 0.7% spread within a single column. This is well below X_TOL=0.15 but worth a spot-check.

**Test:** Verify PRJ402089 `exactCount` unchanged after fix. Confirms within-column noise doesn't trigger false column-separation.

---

## 5. Risk Assessment

### What if X_TOL is set too HIGH (e.g., 0.50)?

Items in different columns would still merge — the fix would be ineffective. PRJ402107 would continue losing 17 items. This is the "no change" failure mode — bad but detectable immediately on re-extraction.

### What if X_TOL is set too LOW (e.g., 0.005)?

Items within the SAME column that have slight x_left variation (AI noise) would be prevented from merging. This means items that SHOULD merge (genuine duplicates at the same y position from overlapping reads) would become duplicate rows in the final BOM.

**How a reviewer would notice:**
- Duplicate rows with similar but not identical part numbers (e.g., `1489-M1C320` and `1489-M1C320` with slightly different descriptions)
- `bomCount > rawCount` in the extraction report (more items after dedup than before — impossible without false non-merges)
- Item number duplicates in the BOM table

**Likelihood:** Very low. PRJ402107 data shows 0.000 within-column spread (all items in a column share identical x_left). Even PRJ402089's worst case (0.007 spread) is 30× below X_TOL=0.15. The AI reports x_left as the column start position, not a per-row measurement — within-column variation is AI rounding noise, not positional data.

### What if x_left values change in a future model update?

The x_left coordinate comes from the AI via the BOM_PROMPT schema (`x_left: "Normalized left edge"`). If Anthropic changes how the model interprets "normalized left edge" — e.g., reporting per-cell boundaries instead of per-column — the separation between columns could shrink.

**Mitigation:** The 0.15 threshold has 2-3× headroom even for three-column layouts. A future model would need to produce x_left values within 0.15 of each other across columns to cause false merges — unlikely given the visual separation.

### Worst-case scenario

X_TOL is correct but a project has a genuinely unusual layout — e.g., two BOM tables side by side with only 10% horizontal separation (x_left gap of ~0.10 < X_TOL of 0.15). The tables would be treated as one and cross-table rows at the same height would merge.

**Likelihood:** Very low — standard engineering drawing BOM layouts don't place tables this close together. The industry standard (two-column BOM on D-size) produces a 0.49 gap. Even a cramped three-column layout on A-size would have ≈0.30 gaps.

**Detection:** The `BOM POS MERGE` console log line (9378) would show cross-column merges. The extraction report's `rawCount vs exactCount` delta would reveal unexpected drops.

---

## Summary

| Aspect | Detail |
|--------|--------|
| **Change scope** | One predicate added to `positionalMergeBomItems` inner loop |
| **Lines changed** | ~2-3 lines in `src/app.jsx:9347` (plus `X_TOL` constant) |
| **Downstream effects** | None negative; recovered items flow through existing pipeline correctly |
| **Primary test** | PRJ402107: 70 items → 87 items |
| **Regression tests** | PRJ402104, PRJ402068, PRJ402106 (single-column, 0 drops — must stay at 0) |
| **Risk** | Low. X_TOL=0.15 has 2-3× headroom vs observed column gaps. Failure mode (too-low threshold) produces visible duplicates, not silent data loss. |

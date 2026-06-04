# #98 Extraction Pipeline Archaeology — Regression Timeline + Accretion Map

**Author:** Sam Wize (Coach)
**Date:** 2026-06-04
**Type:** Read-only investigation (no fix design)
**Purpose:** Feed Freddy's reframe investigation with code-grounded history

---

## Part 1 — Regression Timeline (Extraction-Path Changes, May 12 – June 4)

Every commit below touched the extraction pipeline, corrective/normalization stages, prompt, or
model-input construction. Listed chronologically. Entries marked **⚠ ACCURACY RISK** are changes
that could plausibly degrade accuracy as a side effect.

### Week 1: May 12–14 (v1.19.1025 → v1.19.1107)

**`b077999f` May 12 — Fix buyoff/crate exclusion: check `crossedFrom` field**
What: `_isBuyoffOrCrate(r)` now also checks `crossedFrom` and `description` for buyoff/crate patterns.
Risk: LOW. Broadens an exclusion filter but only for rows that match buyoff/crate patterns.

**`f1259da1` May 13 — ⚠ Add `resolveInternalPartNumbers` (Stage J)**
What: NEW corrective stage. Detects BOMs where >50% of PNs match `_INTERNAL_PN_RE` (all-numeric
formats like `NNNN-NNNNN` or `NNNNNNN`). When triggered, REPLACES every matching PN with a
manufacturer PN extracted from the description text via regex heuristics.
Risk: **HIGH — creates a new silent-corruption path.** The `_extractMfrPnFromDesc` regex scans
description text backwards for tokens that "look like" manufacturer PNs. It can extract wrong
tokens — measurements, spec values, or adjacent-row data that happened to match the alpha-numeric
pattern. Sets no transform flag (`isResolved`, `resolvedFrom`, etc.) — the replacement is invisible.
`customerPartNumber` is the only audit trail but is not surfaced in any UI.
**Accuracy impact: NEGATIVE for FLS-format drawings.** Introduces a path where correctly-extracted
PNs are replaced by heuristically-guessed values from description text.

**`571105e9` May 14 — Remove image-based BOM extraction entirely**
What: Deleted the image-path extraction fallback. PDF-native is now the only extraction path.
Risk: MEDIUM. Eliminates the JPEG compression artifact failure mode (wrong PNs from B↔8, S↔5 etc.
on raster-origin PDFs). But also removes the only fallback when PDF-native fails or returns 0 items.
The `#82 P1` fix later (Jun 2) partially restored a crop-image fallback.
**Accuracy impact: POSITIVE for vector PDFs, NEGATIVE for edge cases where PDF-native fails.** The
crop-empty fallback added later in `48deb1c9` partially compensates.

**`53d17f59` May 14 — Clear low-confidence flag on user PN edit**
What: When user manually replaces a partNumber, clears the `confidence: "low"` flag.
Risk: NONE to extraction accuracy. UX-only change.

**`7d838f99` May 14 — Send only the BOM page to Anthropic (not full PDF)**
What: pdf-lib slices the multi-page PDF to a single page before sending to the API.
Risk: LOW. This was already the server-side behavior; this aligns the client fallback path.

**`91c6a4de` May 14 — ⚠ L3 merge + gap-fill + honest counting**
What: THREE changes in one commit:
  1. Prompt: replaced HARD CONSTRAINT (`items.length == detectedLineCount`) with honest counting.
  2. Code: L3 Phase 1 (broad retry on `needs-review`) and Phase 2 (targeted gap-fill for specific
     missing item numbers).
  3. Code: Merge strategy for retries — union by itemNo, not pick-winner.
Risk: **MEDIUM.** The honest counting change is unambiguously positive (stops the model from padding
with hallucinated items to hit a forced count). L3 retry adds an extra extraction pass that MERGES
with the first — if the second pass produces wrong items, they're unioned in. The merge-by-itemNo
strategy means a second-pass item REPLACES a first-pass placeholder but is ADDED alongside a first-
pass real item. If both passes produce different wrong readings of the same item, the first-pass
reading survives (the merge only replaces placeholders). Net: L3 is accuracy-neutral-to-positive
for items the first pass captured, and additive-risk for items only the second pass returns.
**Accuracy impact: SLIGHTLY POSITIVE on average (recovers genuinely missing items), but adds noise
from second-pass hallucinations.**

### Week 2: May 18–22 (v1.20.1 → v1.20.22)

**`48deb1c9` May 20 — Increase AI token limits 16K→64K + crop-empty fallback**
What: Bumped `max_tokens` from 16K to 64K and `budget_tokens` from 4K to 16K across all extraction
paths. Added crop-empty safety net: when crop path returns 0 items, retry via PDF-native.
Risk: LOW. The token bump prevents truncation on large BOMs (fixes #37). The crop-empty fallback is
conservative (only fires on 0 items). Larger thinking budget may help or hurt depending on the model.
**Accuracy impact: POSITIVE (prevents truncation data loss).**

**`8d984699` May 20 — ⚠ BOM extraction accuracy overhaul (Cloud Functions + prompt sync)**
What: Added crop-first extraction priority to `extractBomPage` CF. Added MFG/PART NO. combined-
column handling to `bomPrompt.js`. Synced prompts between CF and client.
Risk: **HIGH.** This commit introduced crop-path-first priority — the same change that was rolled
back 2 days later in `ed1c6a42`. Crop-first means the model receives a JPEG-compressed image crop
instead of the native PDF. For scanned/raster PDFs, JPEG double-compression introduces the B↔8,
S↔5, I↔1 confusion artifacts documented in C2. The MFG/PART NO. prompt changes are benign.
**Accuracy impact: NEGATIVE — reintroduced JPEG artifact failures. Rolled back May 22.**

**`ed1c6a42` May 22 — Restore PDF-native extraction priority over crop path**
What: Rolled back `8d984699`'s crop-first priority. PDF-native is primary again.
Risk: NONE (rollback to known-good state). Added Extraction Path Change Protocol to CLAUDE.md.
**Accuracy impact: POSITIVE (undoes the regression from `8d984699`).**

**`d38a55a5` May 22 — Fix pdfQuality variable shadowing in extractBomPage**
What: Fixed `const` shadowing `let` in the CF. `pdfQuality` now correctly flows from CF to client.
Risk: NONE to extraction accuracy. Metadata/reporting only (C6 verified: AI input was unchanged).

**`20978254` May 22 — ⚠ Add x-position guard to positionalMergeBomItems (H6)**
What: Added `X_TOL=0.15` check to prevent cross-column merges on multi-column BOMs.
Risk: **LOW but introduces a new interaction surface.** The guard uses `x_left` from AI output. If
the AI reports wrong `x_left` values, items that should merge won't (false non-merge — visible as
duplicates, not silent data loss). The fix is architecturally sound (C9/C10 verified).
**Accuracy impact: STRONGLY POSITIVE — recovers 15-17 items on multi-column BOMs.**

**`6d47099b` / `2d707228` May 22 — H9 fuzzy merge itemNo guard**
What: Added itemNo guard to `fuzzyMergeBomItemsWithReport` — different non-empty itemNos block merge.
Risk: LOW. Same safe-side failure mode as H6 (false non-merge = visible duplicate, not data loss).
**Accuracy impact: POSITIVE — prevents product-family variant destruction (22 items across 10 panels).**

### Week 3: May 26 – June 1 (v1.20.23 → v1.20.81)

**`293f5b17` Jun 1 — ⚠ BOM region tombstone + degenerate-crop retry**
What: When user deletes their BOM region, `bomRegionCleared=true` prevents fallback to `aiBomRegion`.
Added degenerate-crop retry: when CropBox extraction returns 0 items or all-placeholder, retries
without crop (full page).
Risk: **LOW-MEDIUM.** The tombstone is defensive (prevents unwanted crop). The degenerate-crop retry
adds a new extraction pass with different input (full page vs cropped) — the retry result replaces
the crop result only if it has MORE items. This is safe-side but adds complexity.
**Accuracy impact: POSITIVE for the tombstone case (prevents bad crops). Neutral-to-positive for the
retry.**

**`7c9b84b7` Jun 1 — Fix duplicate BOM row IDs (PRJ402109)**
What: Fresh IDs assigned to all rows after extraction. Defensive dedup guard.
Risk: NONE to accuracy. ID generation only.

**`3236909d` Jun 1 — ⚠ Fix exact dedup key to include itemNo**
What: Exact dedup key changed from `pn` to `pn:item:N:d:descNorm`. Prevents merging distinct BOM
line items that share a PN but have different itemNos.
Risk: **LOW.** This was a targeted fix for the 592273 case (two distinct items with same PN). The
change makes exact dedup more conservative (fewer merges) which is the safe direction.
**Accuracy impact: POSITIVE (prevents over-merging). But the key is now 3-part with a 40-char
description suffix, which means very similar items with slightly different descriptions won't merge
even when they should — potential for duplicates on re-extraction where the AI describes the same
item differently.**

**`b5ae8e73` Jun 1 — ⚠ Add description discriminator to exact dedup key**
What: Added 40-char normalized description suffix to the dedup key on ALL three branches.
Risk: **MEDIUM — this is the most subtle change in the timeline.** The intent is correct (same PN +
different description = different items). But the description comes from AI output, which is
non-deterministic. Two extraction passes of the SAME item may produce slightly different descriptions
(e.g., "TERMINAL BLOCK, 3-LEVEL" vs "TERMINAL BLOCK 3-LEVEL" → different after normalization if
punctuation differs). This means a legitimate positional-dedup survivor and its L3-retry counterpart
may not exact-dedup-merge because their descriptions differ by a comma.
**Accuracy impact: RISK OF DUPLICATES on multi-pass extractions (L3 retry, re-extraction). The
description discriminator can prevent merges that should happen.**

**`4b2ef7a0` Jun 1 — ⚠ Amend BOM prompt: preserve same-PN items with different descriptions**
What: Changed the BOM prompt to tell the AI NOT to merge same-PN items when descriptions differ.
Previously the prompt told the AI to merge all same-PN items.
Risk: **MEDIUM.** This is the prompt-side companion to `3236909d` and `b5ae8e73`. It means the AI
now returns MORE rows (preserving duplicates the AI used to merge). The code-side dedup is supposed
to catch these, but the dedup key now includes description, so if descriptions differ even slightly,
the "duplicates" survive as separate rows.
**Accuracy impact: MIXED. Fixes the 592273 case but may introduce spurious duplicate rows on other
drawings where the same part appears at multiple positions with slightly different AI-generated
descriptions.**

**`67dd897c` Jun 2 — ⚠ Remove BOM prompt duplicate-merge instruction (bomPrompt.js)**
What: Removed the instruction telling the AI to combine same-PN rows with summed qty from
`bomPrompt.js` (the server-side prompt). The client-side prompt was already changed in `4cfaeb81`.
Risk: **Same as `4b2ef7a0` above.** The AI now returns every row individually — dedup is fully
delegated to the code pipeline.
**Accuracy impact: Same risk — more raw rows, reliance on code dedup with the now-complex
3-part key.**

### Week 4: June 2–4 (v1.20.82 → v1.20.96)

**`10fdced5` Jun 2 — ⚠ Fix #82 P1: remove noBomReason escape when CropBox applied**
What: When the CF applies CropBox (bomRegion present), the prompt no longer offers the
`noBomReason: "wrong-page-type"` escape. Forces the model to attempt extraction.
Risk: **LOW.** For cropped pages, the model SHOULD extract — the crop is focused on the BOM table.
Removing the escape prevents the "easy out" on hard-to-parse scanned pages. But: if the crop is
misaligned (covers the wrong area), the model is now forced to hallucinate items from non-BOM content
rather than returning empty. The degenerate-crop retry (`293f5b17`) is the safety net for this case.
**Accuracy impact: POSITIVE for correctly-cropped pages. RISK of hallucinated items on badly-cropped
pages.**

**`4e31f918` Jun 2 — Add scan quality alert to bom-region-crop fallback prompt**
What: Added a SCANNED IMAGE ALERT to the crop-fallback prompt (matches the PDF-native path's alert).
Risk: NONE. Prompt-only change — tells the model to be more careful on scanned images.

**`fa15c96b` Jun 3 — Fix dataUrl-gating bug (#94)**
What: Fixed the filter in `confirmAndExtract` and `runExtractionTask` that gated BOM pages on
`&& p.dataUrl`, silently excluding pages with only `storageUrl` after save-reload.
Risk: NONE to accuracy per se. This is a fix for an INCLUSION bug — pages that should have been
extracted were silently skipped. After the fix, these pages ARE extracted, which means the extraction
pipeline now processes pages it previously never saw.
**Accuracy impact: POSITIVE (items are extracted instead of silently skipped). But exposes these
pages to any pre-existing accuracy issues in the pipeline.**

---

## Part 2 — Accretion Map: Corrective Stages Between Raw Model Output and Final BOM

Every stage that can transform, drop, or add data between the AI's raw JSON output and the final
persisted BOM. Ordered by pipeline position. Each entry: when/why introduced, whether it can corrupt
a good read, and whether the action is logged/flagged.

### Pre-dedup (inside `_parseAndVerifyBomRaw`)

| Stage | Introduced | Purpose | Can corrupt a good read? | Logged/flagged? |
|-------|-----------|---------|-------------------------|----------------|
| **B — Slash/comma split** (L11641-11651) | v1.19.981 (May 6) | Split compound PNs into separate rows | **YES — splits PNs with legitimate `/` (dimensions). Creates siblings with identical coords → positional dedup destroys one (#97).** | No flag on split rows. "(sub-part from above)" in description is the only tell. |
| **A/R qty normalization** (L11653-11656) | v1.19.981 | Normalize A/R, AS REQUIRED → qty=1 | No — only touches qty, not PN | No |
| **Confusable-glyph auto-downgrade** (L11616-11628) | v1.19.975 (May 5) | Downgrade "high" confidence to "medium" for PNs containing confusable chars or enclosure descriptions | No — changes confidence flag only, not PN or data | `_confDowngradeReason` set on item |
| **Synthetic y_top assignment** (L11657-11665) | v1.19.981 | Assign synthetic coords to items without y_top | No — only fills missing coords | No |

### Dedup pipeline (inside merge chain, L13900-13964)

| Stage | Introduced | Purpose | Can corrupt a good read? | Logged/flagged? |
|-------|-----------|---------|-------------------------|----------------|
| **F — Positional dedup** (`positionalMergeBomItems`, L10629) | v1.19.620 (Mar) | Merge same-page, same-Y items (cross-quadrant duplicates) | **YES — destroys one of two items at the same Y position. Winner chosen by `scoreItem` which favors longer description, not better PN. Interacts destructively with Stage B slash-split (#97).** | `posMerges` local array accumulated but DISCARDED — never returned or persisted. Console.log only. **Unreported stage.** |
| **Exact-PN dedup** (inline, L13922-13923) | v1.19.620 (Mar), **key revised Jun 1** in `3236909d`+`b5ae8e73` | Merge items with same normalized PN | **Marginally — sums qty, keeps first-seen item's data. Can inflate qty if AI emits non-duplicate items with coincidentally identical PNs after normalization.** Key is now 3-part (PN+itemNo+descNorm), reducing over-merge risk but potentially causing under-merge (duplicates survive). | `exactMerges` array captured in `mergeStats`. |
| **H — Fuzzy merge** (`fuzzyMergeBomItemsWithReport`, L10517) | v1.19.620 (Mar), Y-guard v1.19.628, description override v1.19.642, itemNo guard v1.20.21 (May 22) | Merge near-identical PNs (OCR variants) | **YES — C12 proved it silently drops product-family variants (IDEC relay/socket). Fixed by itemNo guard (H9). Remaining risk: items WITHOUT itemNo (labor, contingency, manual adds) can still fuzzy-merge incorrectly.** | `merges` array returned and persisted in `extractionReport.fuzzyMerges`. |

### Post-dedup corrective stages

| Stage | Introduced | Purpose | Can corrupt a good read? | Logged/flagged? |
|-------|-----------|---------|-------------------------|----------------|
| **I — Non-BOM filter** (`filterNonBomRows`, L10929) | v1.19.646 (Apr) | Remove sheet identifiers, title block artifacts, drawing references | **Marginally — can drop legitimate BOM items if they have unusual structure (e.g., missing manufacturer or short PN that trips the pattern filter).** | `nonBomRows` array returned in merge pipeline. `dropped` returned from function. |
| **J — Internal PN resolution** (`resolveInternalPartNumbers`, L11024) | **v1.19.1034 (May 13) — `f1259da1`** | Replace all-numeric PNs with MFR PNs from description | **YES — silently replaces PN with a regex-heuristic guess from description text. Can extract wrong tokens (measurements, specs, adjacent-row data). No transform flag.** FLS drawings are the target format. | Console.log only. `customerPartNumber` preserves original but is not surfaced. **No flag, no extractionReport field.** |
| **Companion split** (`splitCompanionParts`, L10826) | v1.19.672 (Apr) | Extract companion parts from `additionalPartNumbers` and description keywords | **Marginally — can create spurious rows from description tokens that match the `_COMPANION_PN_RE` pattern near companion keywords. Validated by `_looksLikeCompanionPn` (4+ chars, letter+digit, not a ref designator).** | Console.log with `added` array. `autoAddedCompanion: true` flag on created rows. |
| **Suspect qty flag** (`flagSuspectQuantities`, L10886) | v1.19.638 (Apr) | Flag obvious qty errors | No — advisory flag only, doesn't change data | `suspectQty` / `suspectQtyReason` on row |

### Post-merge corrective stages

| Stage | Introduced | Purpose | Can corrupt a good read? | Logged/flagged? |
|-------|-----------|---------|-------------------------|----------------|
| **M — ARC Cross (alternates)** (`applyLearnedCorrections` step 1, L10358-10375) | v1.19.626 (Mar), **expanded v1.19.635/638** | Auto-replace PNs from user's learning DB | **YES — C5 proved 5 items on PRJ402107 were correctly extracted then silently replaced with wrong values from the learning DB (including BC internal descriptions replacing catalog numbers).** | `appliedLog` array returned. `isCrossed: true`, `crossedFrom`, `autoReplaced: true` flags on row. **Logged but not gated — fires silently without user confirmation.** |
| **N — Correction DB** (`applyLearnedCorrections` step 2, L10376-10383) | v1.19.626 (Mar) | Auto-fix known OCR errors | **YES — if the correction DB has a wrong entry (user corrected to a wrong value), it silently propagates to every future extraction.** | `isCorrection: true`, `correctionFrom` flags on row. |
| **O — Part library** (`applyLearnedCorrections` step 3, L10384-10392) | v1.19.626 (Mar) | Legacy part library auto-fix | Same risk as N. | `correctedByLibrary: true` flag on row. |
| **Q — Snippet self-correction** (`selfCorrectBomRowsWithSnippets`, L11898) | v1.19.639 (Apr), **DISABLED v1.19.653 (Apr)** | Per-row Haiku re-read for verification | **Was catastrophically destructive — 100% bad-attempt rate, silently replacing correct PNs with adjacent-row data. Disabled permanently.** | Dead code. Returns `{bom, corrections: []}` immediately. |
| **R — BC fuzzy pricing** (`runPricingOnPanel`, L14369/L25585) | v1.19.641 (Apr) | Apply BC prices and item numbers | **YES — C5 documented: `partNumber: bcMap[key].bcNumber \|\| r.partNumber` replaces the extracted PN with BC's item number on every pricing run.** BC internal numbers (e.g., "DUCT,2X3,GREY") can replace catalog codes (e.g., "TYD2X3NPW6"). | `priceSource: "bc"` flag. `bcVendorName`, `bcVendorNo` set. **But no `partNumberSource` distinguishes "AI extracted this" from "BC returned this."** |

### Summary: stages that can corrupt a good read

7 of 13 post-extraction stages can turn a correctly-extracted PN into a wrong one:

| Stage | Corruption type | Silent? | Introduced |
|-------|----------------|---------|-----------|
| **B — Slash split** | Splits legitimate PNs containing `/` | Yes (no flag) | May 6 |
| **F — Positional dedup** | Destroys one of two items at same Y | **Yes (unreported)** | Mar |
| **H — Fuzzy merge** | Merges product-family variants | Partially (merges array persisted) | Mar, patched May 22 |
| **J — Internal PN resolve** | Replaces PN with regex guess from description | **Yes (no flag)** | **May 13** |
| **M — ARC Cross** | Replaces PN with wrong learning DB entry | Partially (flags set but no gate) | Mar |
| **N/O — Corrections/Library** | Propagates wrong user corrections | Partially (flags set) | Mar |
| **R — BC fuzzy pricing** | Replaces PN with BC internal number | Partially (priceSource set) | Apr |

---

## Part 3 — Synthesis: What Changed

### The degradation pattern

Jon's observation — "early ARC read drawings near-flawlessly, each fix generates more problems" —
maps cleanly onto the accretion timeline:

**Phase 1 (pre-May 12): Minimal pipeline.** The early extraction path was: AI extracts → positional
dedup → exact dedup → fuzzy merge → ARC Cross → BC pricing. Five stages, all introduced in March-
April. The dedup stages were permissive (PN-only key, no itemNo guard, no x-position guard). This
OVER-MERGED (dropped legitimate items) but never CREATED wrong PNs — every surviving PN was either
the AI's original output or a learning-DB replacement. The error rate was dominated by the AI model's
accuracy, which was high on clean vector PDFs.

**Phase 2 (May 13-14): Two pipeline additions.**
- Stage J (`resolveInternalPartNumbers`) — a new stage that can CREATE wrong PNs from description
  text. Introduced for FLS-format drawings but fires on ANY BOM where >50% of PNs are numeric.
- L3 retry — adds second/third extraction passes whose results are MERGED with the first. More
  items recovered, but also more opportunities for wrong items to enter.
- Image path removal — eliminates the JPEG artifact failure mode but also the fallback.

**Phase 3 (May 20): The crop-first regression.** `8d984699` reintroduced crop-first extraction
priority, re-enabling JPEG compression artifact failures on raster PDFs. Rolled back May 22 in
`ed1c6a42`. Any extraction run between v1.20.5 and v1.20.14 (~10 versions) would have produced
JPEG-artifact wrong PNs.

**Phase 4 (Jun 1-2): The dedup key explosion.** Three commits (`3236909d`, `b5ae8e73`, `4b2ef7a0`)
in rapid succession changed both the AI prompt (stop merging same-PN items) and the code dedup key
(3-part with description discriminator). The intent was correct (fix the 592273 case). The side
effect is that the exact dedup key is now so discriminating that AI non-determinism in descriptions
can prevent legitimate merges, leaving duplicates. Combined with the prompt change (AI now emits
all rows individually), the pipeline processes MORE raw items with a LESS aggressive dedup — net
effect is more items surviving, some of which are duplicates or spurious.

### The accretion thesis — confirmed with nuance

Freddy/Jon's working thesis ("accumulation of per-instance corrective logic is itself now a source
of errors") is CONFIRMED for stages B, J, M, and R. Each was added to fix a specific observed
misread, and each can corrupt a good read under different conditions:

- **Stage B (slash-split):** Added to handle compound PNs → corrupts PNs with legitimate `/` and
  PNs where the model fabricates `/`.
- **Stage J (internal PN resolve):** Added for FLS numeric PNs → corrupts any BOM that trips the
  >50% numeric threshold by replacing PNs with heuristic guesses.
- **Stage M (ARC Cross):** Added for user-verified corrections → corrupts when the learning DB
  contains wrong entries (C5: 5 items on PRJ402107).
- **Stage R (BC pricing):** Added for BC price lookup → corrupts by replacing catalog numbers with
  BC internal item numbers.

**The nuance:** Not all accretion is harmful. H6 (x-position guard), H9 (itemNo guard), and the
confusable-glyph auto-downgrade are PURELY DEFENSIVE additions that reduce errors without creating
new corruption paths. The problem is the stages that TRANSFORM data (B, J, M, R) vs the stages
that only FILTER or FLAG (confusable-glyph, suspect-qty, non-BOM filter). Every transform stage
carries corruption risk; every flag-only stage is safe.

### Where this analysis is blocked on Step Zero

All accuracy conclusions above are about the PIPELINE's contribution to errors. Whether the MODEL
itself has degraded (due to prompt changes, model version changes, or the interaction between longer
prompts and model behavior) **cannot be determined** without raw model output.

Specifically blocked:
- **Class 1 vs Class 2 attribution** — without raw output, we can't tell if a digit substitution
  happened in the model or in the pipeline.
- **Prompt change impact** — the prompt changed in `91c6a4de` (honest counting), `4b2ef7a0`
  (preserve same-PN items), and `67dd897c` (remove merge instruction). Whether these prompt changes
  affected model accuracy on other items (not just the targeted ones) is unknowable without
  comparing raw output before and after.
- **L3 retry contribution** — we can't distinguish "L3 recovered a genuinely missing item" from
  "L3 added a hallucinated item" without seeing both passes' raw output.

---

## Part 4 — Risk-Ranked Stages for the Audit

For Freddy's reframe investigation — which stages to audit first, ranked by demonstrated or
suspected accuracy impact:

1. **Stage B — Slash-split** (CRITICAL, deterministic). #97 proves it destroys main PNs. Fix is
   in flight. Also has the second failure mode (splitting legitimate `/` in dimensional PNs).
2. **Stage J — Internal PN resolve** (HIGH, silent). Only stage that CREATES new PNs from thin air.
   No transform flag. FLS drawings are the immediate exposure.
3. **Stage R — BC pricing PN substitution** (HIGH, partially flagged). Replaces extraction PNs with
   BC internal numbers on EVERY pricing run. C5 documented 5 cases.
4. **Stage M — ARC Cross** (MEDIUM, partially flagged). C5 documented 5 cases. `isCrossed` flag
   exists but no user confirmation gate.
5. **Exact dedup key (Jun 1 changes)** (MEDIUM, potential for duplicates). The 3-part key with
   40-char description discriminator may be too aggressive — needs baseline testing.
6. **Positional dedup reporting gap** (MEDIUM, infrastructure). The only merge stage with no
   reporting channel. Every positional merge is invisible in extractionReport.
7. **L3 retry merge quality** (LOW, blocked on Step Zero). Can't assess without raw output.

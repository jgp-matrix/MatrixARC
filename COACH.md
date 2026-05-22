# ARC Coaching Log

## Session Index

- **2026-05-22 (Session 1)** — Initial onboarding. Read CLAUDE.md, TODO.md, git log. Assessed current architecture and risk posture.
- **2026-05-22 (Session 1, cont.)** — BOM extraction test review (Ovivo PRJ402107). Cross-referenced CCD methodology against ARC extraction code. Evaluated Phase 3 prompt/schema/validation for ARC portability.
- **2026-05-22 (Session 1, cont.)** — Jon's handoff decisions: H2 deferred, H4 closed, H1/H3 bundled into H5. H5 reframed to include region-targeted 600 DPI rendering + user-facing modal + needs-review flag propagation. Baseline captured by CCD: 36.8% accuracy on PRJ402107. Failure pattern analysis logged.
- **2026-05-22 (Session 1, cont.)** — pdfQuality shadowing fix (d38a55a5) impact analysis. Traced pdfQuality through full pipeline — extraction behavior unaffected, L3 independent. Current baseline valid. Scan quality UX was dead code for single-page PDF extractions.
- **2026-05-22 (Session 1, cont.)** — C4 definitive Firestore check. PRJ402107 was a re-extraction on v1.20.18 — L3 absent from re-extraction path. AI extracted all 87 items (rawCount:87); 17 lost in positional dedup that doesn't check x-position. Root cause is dedup bug for multi-column BOMs, not extraction quality. C7 closed (manual review is sufficient belt).
- **2026-05-22 (Session 1, cont.)** — C8: BC Item Browser Drawing Reference investigation. Two rendering paths (Haiku AI preferred, stored coords fallback). H6 incidentally improves fallback path accuracy. x_right=0.99 affects snippet self-correction, not Drawing Reference. Per-column x_left values confirmed (0.01 / 0.50).
- **2026-05-22 (Session 1, cont.)** — C9: H6-PLAN.md coach review. APPROVED. All seven criteria pass. One minor omission (selfCorrectBomRowsWithSnippets as downstream consumer), zero risk. Ready for implementation.

## Findings

*(Architecture observations, risks, recommendations — dated, numbered)*

### C1 — 2026-05-22 — Initial architecture assessment (no recommendations yet, establishing baseline)

**Codebase shape:**
- Single 2MB JSX monolith (`src/app.jsx`) containing UI, business logic, BC integration, AI orchestration, and state management. No module boundary enforcement. `public/index.html` is the shell; `public/index.bundle.js` is build output. Cloud Functions in `functions/index.js` (~separate concern, but shares prompt logic with client).
- Firebase-hosted SPA with Firestore as the sole persistence layer. No backend beyond Cloud Functions. No relational DB, no migration framework — schema versioning is manual (`APP_SCHEMA_VERSION`).
- BC (Business Central) integration is REST/OData with offline queue. BC is treated as a secondary datastore that ARC pushes to, not a source of truth (except for pricing lookups).

**Deploy pipeline:**
- `deploy.sh` is a bash script that version-bumps, Babel-compiles JSX, commits, tags, pushes, and deploys hosting in one shot. Functions deploy separately. No CI/CD — everything runs from the developer's machine. No staging environment (test and production share the same Firebase project via multi-site hosting).
- Pre-commit hook covers `.js` syntax but not `.jsx` (the actual codebase). Advisory Claude review on risk-pattern files is a creative compensating control.

**AI integration:**
- Multiple Anthropic models (Opus, Sonnet, Haiku) for different tasks. PDF-native extraction is the primary BOM path. Prompt logic is duplicated between `src/app.jsx` (client fallback) and `functions/bomPrompt.js` (server). Cost controls exist (per-token spend caps, page limits, max instances).
- Recent history shows a pattern of extraction path changes causing regressions (#48, #37, #25). The new Extraction Path Change Protocol in CLAUDE.md is a direct response.

**Data integrity posture:**
- Strong "never lose data" rules in CLAUDE.md. Learning databases grow without bounds (intentional). `saveProject` has server-side merge guards for admin fields. Cross-user save guards exist.
- Snapshot/restore feature was silently broken for all company-account projects since introduction (#45) — Firestore rules gap. Fixed 2026-05-21.

**Open risk surface (from TODO.md, not my assessment yet):**
- 16 OPEN findings spanning deploy safety (#13, #15, #20, #26), BC integration (#23, #24, #27, #29, #54), data integrity (#T7, #T8), extraction (#T6, #53), UX (#30, #36, #52), and tooling (#T1, #T3, #T4, #T5).
- The stale API key cache (#6) and ledger schema mismatch (#7) from Round 2 are still open — both affect production correctness.

**Velocity:**
- 19 releases in 3 days (v1.20.1 through v1.20.19, May 20-22). High throughput but also high churn — two releases were empty or immediately superseded (v1.20.17 scoping bug, v1.19.1006 worktree deploy miss). The Extraction Path Change Protocol exists because a regression shipped via direct-to-master with no review.

**What I don't know yet:**
- How many active users / projects. Scale determines whether the monolith is a problem or just a constraint.
- Whether the duplicate-Firestore-doc issue (#T7) has caused any actual data corruption beyond confusion.
- The full shape of `functions/index.js` — 32 exported functions is a lot for a single file.
- How the `_appCtx` global state pattern interacts with React's rendering model in practice (race conditions, stale closures).

### C2 — 2026-05-22 — BOM Extraction Test: Ovivo PRJ402107

Source: `bom-extraction-test-ovivo.md` (CCD session 6dbfb33d). 87-item BOM from a D-size Ovivo drawing, page 9 of 21. Two-column layout, fax-quality scanned content embedded in PDF wrapper.

#### Key findings from the test

- **DPI was the decisive variable.** 300 DPI produced wrong part numbers on ~15% of rows (items 42-48 especially). 400 DPI got to ~90%. 600 DPI with tight crops gave 100%. The dangerous failure mode is that wrong part numbers look plausible — silent corruption.
- **Two-column layout** (items 1-50 left, 51-87 right) would interleave in naive top-to-bottom extraction.
- **PyMuPDF extracted only 78 chars** — the "text" is vector graphics (path objects), not a searchable text layer. PDF-native input still hits the vision pathway for such files.
- **Catalog-description cross-validation** was the safety net that resolved item 42 (`1489-M1C320` vs `1489-M2C030`) — the description restates pole count and amperage.
- **Per-row snippet self-correction was tried and abandoned** (v1.19.639 → disabled v1.19.653) because single-row crops lacked column-header context. CCD's half-page crop approach would avoid this failure mode while still improving effective resolution.

#### Cross-reference: CCD methodology vs ARC extraction code

**Aligned (deliberate, working as designed):**

1. **Two-column/multi-box handling.** ARC's `BOM_PROMPT` (`functions/bomPrompt.js:238-260`) has the most extensive multi-column guidance I've seen in an extraction prompt. Explicitly references CSW1807-121 as a worked example. Covers 2- and 3-column layouts, reading order, and sequence-gap detection. CCD's test validated that this guidance works — the model correctly extracted both halves.

2. **Character confusion matrix.** ARC's prompt (`bomPrompt.js:154-187`) lists 18 explicit glyph-confusion pairs (O/D, O/0, B/8, S/5, etc.) with stroke-shape disambiguation rules. CCD's test confirmed these are the exact pairs that cause failures. ARC also has end-of-PN position emphasis (lines 172-179) and long-PN character-count procedure (lines 189-202). More defensive than CCD's simpler "read EVERY character precisely" instruction.

3. **Confusable-glyph auto-downgrade.** `_parseAndVerifyBomRaw` at `src/app.jsx:10287-10300` automatically downgrades any "high" confidence row containing confusable characters to "medium". CCD's test showed this is correct — items 42-44 (the 1489-M series breakers) would all trigger this guard.

4. **A/R qty normalization.** ARC handles in both the prompt (line 217: "Set qty to 1") and post-processing (`app.jsx:10324-10327`). Covers "A/R", "AR", "AS REQUIRED", "AS REQ'D", "A.R.", "A\R".

5. **Typo preservation.** ARC prompt: "TRANSCRIBE EXACTLY what is printed" (line 187). Matches CCD's decision to preserve "ACCESORRY".

6. **Enclosure-row sensitivity.** ARC's prompt (lines 204-213) and auto-downgrade (`app.jsx:10288`) both treat enclosure parts as highest-stakes. CCD's item 1 (Hoffman A62H6012SSLP3PT) would trigger this.

**Divergent — deliberate tradeoffs where ARC chose differently:**

7. **PDF-native input vs DPI-rendered images.** ARC sends the native PDF to Anthropic (`functions/index.js:2404`, document type `application/pdf`). For vector-text PDFs this gives infinite resolution — no DPI concerns. CCD's finding that 400+ DPI is needed applies to the image fallback paths, which ARC has correctly deprioritized (#48 restored PDF-native priority). **However:** CCD's PyMuPDF finding (78 chars extracted) proves this Ovivo PDF stores text as drawn paths, not real text objects. The Anthropic vision pipeline processes such PDFs through its image renderer, and the internal rendering resolution is outside ARC's control. ARC's `assessPdfPageQuality` (`functions/index.js:2253-2303`) detects this scenario and injects a SCANNED DOCUMENT ALERT, but it adjusts the *prompt text*, not the *input resolution*. The alert tells the AI to be more careful; it doesn't give the AI more pixels to work with.

8. **Full-page vs half-page cropping.** ARC sends the full page (or user-drawn CropBox region via `bomRegion`) as a single image/document. CCD recommends preprocessing: split two-column pages into left and right halves, send as multi-image call. ARC relies on prompt engineering (the multi-column guidance) rather than image preprocessing. CCD's point about internal downsampling is valid: vision APIs downsample large images internally, so a 10200x6600 image at 600 DPI may be seen by the model at effectively ~300 DPI. For scanned/raster PDFs, this matters. For vector-text PDFs, Anthropic's internal renderer may produce adequate resolution.

9. **Schema shape.** ARC uses `{items, questions, noBomReason, detectedLineCount}` with spatial coordinates (`y_top/y_bottom/x_left/x_right`) and companion parts (`additionalPartNumbers`). CCD's schema uses `{bomRows, metadata}` with `revMark`, `catalogNotes`, and `metadata.pageLayout`. Different designs for different purposes — ARC's schema feeds downstream spatial correlation, dedup, and companion-part workflows. CCD's schema is cleaner for standalone extraction.

**Divergent — likely gaps, not deliberate choices:**

10. **No revision mark extraction.** The Ovivo BOM has revision triangles (B, C, D) on items 23, 25, 36, 42, 43, 63, 64, 84, 85, 87. ARC's schema has no `revMark` field. ARC's prompt doesn't mention revision marks at all. These marks indicate which items changed between drawing revisions — useful for ECO tracking. Currently they'd be silently dropped.

11. **"1 SET" qty not normalized.** ARC's post-processing (`app.jsx:10324-10327`) handles A/R variants but not "1 SET" (item 60 in this BOM). `Number("1 SET")` returns NaN; `parseInt("1 SET")` returns 1. Behavior depends on which conversion downstream code uses. If any path does `+item.qty` or `Number(item.qty)`, "1 SET" becomes NaN and breaks arithmetic.

12. **No manufacturer-prefix validation in post-processing.** CCD's validation Section C checks that Allen-Bradley parts match `1489-*`, `140MT-*`, etc. and Phoenix Contact parts are 6-7 digit numbers. `_parseAndVerifyBomRaw` has no equivalent. This would catch wrong-manufacturer/wrong-part combos — e.g., if the AI swapped a Phoenix Contact 7-digit number into an Allen-Bradley row.

13. **No catalog-description cross-validation in post-processing.** ARC's *prompt* tells the AI to cross-validate (`bomPrompt.js:150-151` in the column alignment section), and CCD confirmed this is the safety net that resolved item 42. But `_parseAndVerifyBomRaw` doesn't verify it was done. CCD's validation Section D would programmatically check that `1489-M1` = 1-pole, `1489-M2` = 2-pole by parsing the catalog suffix against the description. This is the strongest validation CCD proposed and ARC lacks it.

14. **No tag-count vs qty sanity check.** CCD's validation D: "Qty should be >= count of comma-separated tags (if tags = 'CB1222, CB1226, CB1230' then qty >= 3)." Simple, catches extraction drift.

#### Phase 3 evaluation: ARC portability

**Prompt — single-call compatible: YES, with caveats.**

The CCD prompt works in a single Anthropic vision call with no agent loop. The cross-validation instruction (rule 2: "cross-validate against the DESCRIPTION") is reasoning the model performs internally during generation, not an iterative feedback cycle.

Caveats for ARC integration:
- **Missing "WHAT IS NOT A BOM" section.** ARC's prompt (`bomPrompt.js:32-50`) has 80 lines of negative-example guidance (title blocks, sheet indices, revision blocks, notes, legends, barcodes). CCD's prompt assumes the input is a known BOM page. If used on non-BOM pages, it would hallucinate rows from title block text.
- **Missing character confusion matrix.** ARC's 18-pair glyph confusion guide with stroke-shape rules is absent. CCD's prompt says "read EVERY character precisely" and "cross-validate" but doesn't give the AI tools to disambiguate O/D, B/8, etc.
- **Missing spatial coordinates.** No y_top/y_bottom/x_left/x_right. ARC uses these for per-row snippet correlation and BOM-region alignment.
- **Missing detectedLineCount.** ARC uses the count mismatch between `detectedLineCount` and `items.length` to trigger re-extraction of missing rows. Without it, dropped rows are undetectable.
- **Missing noBomReason taxonomy.** ARC's 8-category taxonomy ("no-table-on-page", "sheet-index-not-bom", etc.) drives automatic skip vs. user-review routing.

**The CCD prompt is not a replacement for BOM_PROMPT.** It's a distilled version of the same approach, optimized for a known-BOM-page scenario. The parts that are valuable are the preprocessing pipeline (half-page cropping, 400+ DPI floor) and the validation checks — those are additive to what ARC already does.

**Schema — needs translation layer, not drop-in.**

| CCD field | ARC equivalent | Translation |
|-----------|---------------|-------------|
| `bomRows` | `items` | Rename |
| `item` (integer) | `itemNo` (string) | Type coerce |
| `catalog` | `partNumber` | Rename |
| `mfg` | `manufacturer` | Rename |
| `tags` | `notes` | Rename |
| `revMark` | *(none)* | New field needed |
| `catalogNotes` | *(none)* | Map to confidence downgrade |
| `metadata.totalItems` | `detectedLineCount` | Restructure |
| `metadata.pageLayout` | *(none)* | New field (nice-to-have) |
| *(none)* | `additionalPartNumbers` | CCD schema lacks |
| *(none)* | `y_top/y_bottom/x_left/x_right` | CCD schema lacks |
| *(none)* | `noBomReason` | CCD schema lacks |

**Validation — complementary, not replacement.**

CCD's validations ARC should adopt (strongest first):
1. **Catalog-description cross-validation** (Section D) — programmatic check that part number encodes the specs stated in the description. The 1489-M series rule alone would have caught item 42's potential failure.
2. **Manufacturer-prefix validation** (Section C) — known pattern matching per manufacturer.
3. **Tag-count vs qty** (Section D) — `qty >= comma-separated tags count`.
4. **Catalog number space check** (Section C) — no internal spaces in contiguous codes.

CCD's validations that overlap with ARC (already covered):
- Sequential item numbers, no gaps → ARC's `_parseAndVerifyBomRaw` lines 10271-10285
- Count mismatch → ARC's `detectedLineCount` check at line 10268
- Confidence flagging → ARC's auto-downgrade + confidence classification

**Gap in CCD's validation that ARC covers:**
- **Truncated response handling.** CCD's validation assumes clean JSON. ARC's 4-strategy parsing (`app.jsx:10212-10259`) handles truncated/malformed responses from `max_tokens` hits. This was the root cause of TODO #37 — `stopReason: "max_tokens"` with truncated JSON that failed direct parse but would have been partially recoverable via Strategy 4 (salvage individual `{itemNo}` objects). CCD's validation has no fallback for this.

### C3 — 2026-05-22 — PRJ402107 Baseline: failure pattern analysis

Source: `tests/extraction-baseline/prj402107-pre-h5-diff.md`. ARC production extraction vs CCD-verified 87-item reference.

**Headline:** 32/87 exact matches (36.8%). 38 silent wrong part numbers. 17 items missing entirely. This is not "extraction needs tuning" — on this drawing class (scanned/fax-quality D-size with two-column layout), the pipeline is producing output that would cause wrong parts to be ordered if quoted without manual review.

#### Failure pattern taxonomy

**Pattern A — Single-character OCR substitutions (24 of 38 wrong PNs).** The confusable-glyph pairs from the BOM_PROMPT confusion matrix are the exact failure mode:

| Confusion | Items affected | Example |
|-----------|---------------|---------|
| B↔8 | 38, 52, 56, 61, 63 | `RH8B-ULC` → should be `RH3B-ULC` (also 3↔8) |
| 3↔8 | 61, 63, 70 | `RH8B` → `RH3B`; `3214259` → `3038338` |
| D↔0 | 12 | `P-R2-F2RD` → `P-R2-F2R0` |
| S↔5 | 1, 85 | `AF509` → `AFS09` (S dropped/replaced) |
| 7↔P/T | 26, 45 | `W7EN` → `WTEN`; `AC7` → `ACP` |
| J↔2 | 17 | `KAJU` → `KA2U` |
| 5↔9, 8↔9, 6↔4, 3↔1 | 7, 23, 29, 30 | Digit-digit confusions at single positions |

The prompt TELLS the AI about these pairs. The auto-downgrade catches them for confidence scoring. But neither actually FIXES the misread. This is the core gap: ARC detects that a part number MIGHT be wrong (medium confidence) but still stores and displays the wrong value.

**Pattern B — Character dropping/insertion (8 of 38 wrong PNs).** Long part numbers lose or gain characters:
- Item 1: `A626H6125LP3PT` (14 chars) vs `A62H6012SSLP3PT` (15 chars) — the enclosure, most expensive single item. SS→25, dropped a character.
- Item 66: `APD182DNW` vs `APD1QH2DNW` — Q dropped, H→8.
- Item 84: `LC09S-4B-61-24` vs `LG5925-48-61-24` — extensive garbling, C→G, 0→5, S→9.

This is the failure mode that the BOM_PROMPT's "LONG PART NUMBERS — CHARACTER-COUNT FIRST" section targets. The AI isn't following the count procedure, or the source resolution is too low for counting to help.

**Pattern C — BC data replacing extraction data (4 of 38).** Items 76-79 show BC internal descriptions (`DUCT,2X3,GREY`) instead of drawing catalog numbers (`TYD2X3NPW6`). These are NOT OCR errors — this is BC data overwriting extraction output somewhere in the pipeline. Likely from `commitBcItem` or the BC pricing/lookup flow populating `partNumber` from BC's item description instead of preserving the extracted catalog number. This is a data-source-priority bug, separate from extraction quality.

**Pattern D — Complete misreads (2 of 38).** Items 14 and 70 have 6+ character differences — not OCR drift but complete misidentification. Item 14: `D64890018` vs `DAH4001B` (Hoffman heater). Item 70: `3214259` vs `3038338` (Phoenix Contact terminal). These suggest the AI read from the wrong row or column, not that it misread individual characters.

**Pattern E — Missing items (17 of 87).** Three clusters:
- Items 8-10 (Hoffman lighting accessories) — consecutive items, probably in a tight vertical cluster that the AI skipped as a group.
- Items 18-20, 24-25 — consecutive items around the transition zone in the left column. Items 24-25 have multi-line TAGS cells (6 and 4 tags respectively) — the complex row formatting may have confused row boundary detection.
- Items 51, 55, 62, 64, 65, 69, 74, 87 — scattered, right column. Item 69 is the MFG/CATALOG swap row that CCD flagged.

**Pattern F — Qty errors (7 items).** Most are over-counts, suggesting row-alignment issues or dedup aggregation. Item 73: ARC shows qty=60 vs reference qty=10. Item 43: ARC shows qty=4 vs reference qty=1. Item 16: ARC shows qty=5 vs reference qty=1. The BOM_PROMPT's "COLUMN ALIGNMENT — CRITICAL" and "SANITY CHECK" sections target this, but aren't preventing it.

**Pattern G — Manufacturer misread.** Items 80-82: "ONVO" instead of "OVIVO". Classic O↔V confusion — not in the current confusion matrix.

#### What this means for H5-PLAN.md review

1. **DPI/resolution is confirmed as the root cause for Patterns A and B.** 24 single-char substitutions + 8 char drops = 32 of 38 wrong PNs are resolution-dependent. Region-targeted 600 DPI rendering should directly address these.

2. **Pattern C (BC data replacement) is a separate bug.** H5 should NOT try to fix this — it's a data-source-priority issue in the BC sync path. But H5-PLAN.md should explicitly exclude it from scope and note it as a pre-existing issue that won't improve with better extraction.

3. **Pattern D (complete misreads) and Pattern E (missing items) may be layout/row-detection failures** rather than resolution failures. 600 DPI won't help if the AI is reading the wrong row. The two-column layout handling and the L3 retry/gap-fill mechanism should catch these — but they didn't. The plan should address whether the retry mechanism is firing on this drawing and why it isn't recovering the 17 missing items.

4. **Pattern F (qty errors) suggests the existing sanity checks aren't catching obvious violations.** Item 73 qty=60 (terminal end covers) is exactly the kind of thing the "OBVIOUSLY WRONG QUANTITIES" sanity check should catch — but it's for assemblies (enclosures, heaters), not accessories. The H3 tag-count-vs-qty check (now bundled into H5) would catch some of these.

5. **The `forceReview` flag is justified by this data.** 38 silent wrong part numbers on a single panel is catastrophic if quoted. The modal + flag propagation is not conservative — it's the minimum viable safety net.

#### Revised baseline numbers (post-investigation)

The diff report attributed 38 items to "wrong part numbers." Investigation of the Firestore data reveals 5 of those were **correctly extracted then silently corrupted by auto-cross** (items 70, 76-79). All five have `autoReplaced: true`, `isCrossed: true`, and `crossedFrom` preserving the correct catalog number.

| Metric | Original count | Corrected count | Notes |
|--------|---------------|-----------------|-------|
| True OCR errors | 38 | 33 | 5 were auto-cross, not OCR |
| Auto-cross corruptions | 0 (not identified) | 5 | Items 70, 76-79 |
| Missing items | 17 | 17 | Unchanged — L3 investigation pending |
| True extraction accuracy | 32/87 (36.8%) | 37/87 (42.5%) | 5 correct extractions were corrupted post-extraction |

H5's target (DPI improvement): 33 true OCR errors → expect ~70-75% accuracy on OCR alone. Auto-cross corruptions need a separate fix (see C5 below).

#### Handoff status update (Jon's decisions, 2026-05-22)

- **H1 (1 SET qty fix):** Bundled into H5. Still needed.
- **H2 (catalog-description cross-validation):** Deferred. Not in H5 scope.
- **H3 (tag-count vs qty):** Bundled into H5. Still needed.
- **H4 (revMark field):** Closed. Matrix doesn't act on revision marks.
- **H5 (user-facing safety net):** Reframed. Now includes region-targeted 600 DPI rendering (not just modal + flag). H5-PLAN.md review pending.

### C4 — 2026-05-22 — L3 and the 17 "missing" items: definitive Firestore check (CLOSED)

**Original hypothesis (WRONG): extraction predates L3 feature.**
**Revised hypothesis (ALSO WRONG): L3 was available but either fired with 0 recovery or was blocked.**
**Actual answer: L3 was unavailable because this was a re-extraction, and the re-extraction path doesn't include L3. More importantly, the AI extracted all 87 items — the 17 are lost in post-processing dedup, not extraction.**

#### Firestore evidence (panel.extractionReport)

```
timestamp:     2026-05-22T21:03:22.607Z  (today, 3:03 PM MDT)
version:       v1.20.18
extractionPath: pdf-native
rawCount:      87        ← AI extracted ALL 87 items
exactCount:    70        ← 17 items removed during dedup
finalCount:    70
finalItemCount: 70
finalMaxItemNo: 86       ← item 87 also missing (end gap, undetectable)
bomPageCount:  1
finalSequenceGaps: [4, 8, 9, 10, 18, 19, 20, 24, 25, 51, 55, 62, 64, 65, 69, 74]
l3MergeRecovered:   (field absent from report)
l3GapFillRecovered: (field absent from report)
scanQuality:        (field absent from report)
perPageOutcomes:    (field absent from report)
learnedCorrections: 6
```

#### Three key findings

**1. This was a RE-EXTRACTION, not an initial extraction.**

The report was built by the re-extraction report builder (`app.jsx:22575-22586`), not by `runExtractionTask` (`app.jsx:12714-12742`). Evidence: `l3MergeRecovered`, `l3GapFillRecovered`, `perPageOutcomes`, and `scanQuality` are all absent — the re-extraction builder doesn't include these fields. The initial extraction builder always includes them (even as 0/null).

**2. L3 does NOT exist in the re-extraction path.**

The re-extraction flow (`app.jsx:22478-22513`) calls `extractBomPage` per page, collects items, and proceeds directly to merge. There is no `_parseAndVerifyBomRaw` check, no L3 Phase 1 retry, no L3 Phase 2 gap-fill. The code at `app.jsx:12346-12454` (L3) only runs inside `runExtractionTask`, which is the INITIAL extraction path. Re-extractions get one shot per page.

**This is a code gap:** L3 was built to catch missing items, but only fires on initial extraction. Users who re-extract a BOM (e.g., after drawing regions or feedback) lose L3's safety net.

**3. The AI extracted all 87 items — the loss is in post-processing dedup.**

`rawCount: 87` matches the reference BOM item count exactly. The AI CAN see all 87 items on this page at the current resolution. The 17 items are removed during the positional → exact dedup pipeline (`app.jsx:22519-22531`).

**Root cause — positional dedup doesn't account for x-position:**

`positionalMergeBomItems` (`app.jsx:9309-9383`) merges items from the same page whose `y_top` values are within `Y_TOL=0.004` (0.4% of page height). It checks `y_top` and `y_bottom` proximity but does NOT check `x_left`/`x_right`. For a two-column BOM:
- Left column item at y_top=0.15 and right column item at y_top=0.15 are at the same vertical position
- Positional dedup treats them as duplicates and keeps only the one with the higher "score"
- For 87 items in a 2-column layout (~43+44 per column), roughly half the rows have a cross-column partner at matching y positions
- 17 of those pairs fall within the 0.004 tolerance → 17 items dropped

The missing items span both columns (items 4, 8-10, 18-20, 24-25 from the left; 51, 55, 62, 64-65, 69, 74 from the right), consistent with cross-column merges where the winner varies per row based on field completeness score.

#### Impact on H5 and other findings

| Finding | Previous understanding | Corrected understanding |
|---|---|---|
| 17 missing items | Extraction quality / L3 failure | Post-processing dedup bug |
| Root cause | AI can't see items at low DPI | AI sees all 87; positional dedup drops cross-column items |
| Fix needed | H5 DPI improvement / L3 fix | Positional dedup must check x-position distance |
| H5 scope change | None | H5 addresses 33 OCR errors (Patterns A/B); dedup fix is independent |
| L3 | May not be firing | Fires on initial extraction, missing from re-extraction path |

#### Additional confirmation of C5 (auto-cross corruption)

The `learnedCorrectionsLog` in the report independently confirms C5:
- `3038338` → `3214259` (item 70 — invisible corruption, both valid Phoenix Contact PNs)
- `TYD2X3NPW6` → `DUCT,2X3,GREY` (item 76 — BC description replacing catalog number)
- `TYD2CPW6` → `DUCT,COVER,2,GREY` (item 77)
- `TYD1X3NPW6` → `DUCT,1X3,GREY` (item 78)
- `TYD1CPW6` → `DUCT,COVER,1,GREY` (item 79)
- `SPF61` → `SPFG1` (item 46 — legitimate correction, AI misread 'G' as '6')

5 of 6 learned corrections are C5 corruption. 1 is a genuine fix. The learning DB is a double-edged sword.

#### Recommended actions (prioritized)

1. **HIGH — Fix positional dedup for multi-column BOMs.** Add x-position distance check to `positionalMergeBomItems`: items must be within x tolerance (e.g., `|x_left_a - x_left_b| < 0.15`) AND y tolerance to merge. Without this, every two-column BOM extraction loses items. This is a one-function fix in `app.jsx:9338-9353`.

2. **HIGH — Add L3 to the re-extraction path.** Port the L3 Phase 1 + Phase 2 logic from `runExtractionTask` to the re-extraction flow, or refactor L3 into a shared function called by both paths.

3. **MEDIUM — Re-extract PRJ402107 after dedup fix** to establish a clean baseline with all 87 items retained. This will reveal the true OCR error rate without dedup masking missing items.

4. **Confirmed: `extractionPath: null` on page objects is a red herring.** The baseline script reads `bomPage.extractionPath` which is never written. `extractionPath` lives in `panel.extractionReport`. The baseline script should be updated if it's reused.

### C5 — 2026-05-22 — Auto-cross silently corrupting correctly-extracted part numbers (HIGH PRIORITY)

**Severity: HIGH — This is silent data corruption on every extraction.**

Investigation confirmed that 5 of the 38 "wrong part numbers" in PRJ402107 were **correctly extracted** by the AI but then silently replaced by the auto-cross mechanism (`applyLearnedCorrections` at `app.jsx:9019-9097`).

**Proven corruption chain for items 76-79 (visible):**
1. AI extracted correct catalog numbers: `TYD2X3NPW6`, `TYD2CPW6`, `TYD1X3NPW6`, `TYD1CPW6`
2. `applyLearnedCorrections` found alternates with `autoReplace: true` in the user's learning DB
3. Replaced with BC internal descriptions: `DUCT,2X3,GREY`, `DUCT,COVER,2,GREY`, etc.
4. Fields set: `isCrossed: true`, `crossedFrom: <correct PN>`, `autoReplaced: true`, `priceSource: "bc"`
5. Original catalog number survives only in `crossedFrom` (audit-only, not used for ordering)

**Proven corruption chain for item 70 (INVISIBLE — the dangerous case):**
1. AI extracted correct part number: `3038338` (Phoenix Contact 1-level terminal block)
2. Auto-cross replaced with: `3214259` (Phoenix Contact multi-level terminal block)
3. **Both are valid 7-digit Phoenix Contact part numbers.** No visual tell that the replacement is wrong.
4. `crossedFrom: "3038338"` preserves the correct value, but no one looks at this field during quoting.
5. If quoted and ordered, the wrong terminal block ships. The difference (1-level vs multi-level) is functionally significant.

**Two overwrite mechanisms confirmed:**

| Mechanism | Function | When it fires | Overwrites `partNumber`? | Confirmation needed? |
|-----------|----------|---------------|--------------------------|---------------------|
| Auto-cross learning | `applyLearnedCorrections` (`app.jsx:9019-9097`) | Every extraction — initial, re-extract, feedback re-extract | YES (line 9056) | NO — fires automatically if `autoReplace: true` |
| BC fuzzy pricing | `runPricingOnPanel` (line 23961) | Every "Get New Pricing", every pricing run | YES — `partNumber: bcMap[key].bcNumber \|\| r.partNumber` | NO — fires automatically on BC fuzzy match |

**What makes this dangerous:**
1. No `partNumberSource` field distinguishes "AI extracted this" from "BC returned this" — both end up as `partNumber` with `priceSource: "bc"`.
2. No user confirmation for auto-crosses. `applyLearnedCorrections` fires silently. The user never sees "Replace TYD2X3NPW6 with DUCT,2X3,GREY?" — it just happens.
3. `runPricingOnPanel` at line 23961 does `partNumber: bcMap[key].bcNumber || r.partNumber` — the BC fuzzy match result REPLACES the extraction result on every pricing run. If BC's item number differs from the drawing catalog number (common for vendor-specific vs manufacturer part numbers), the drawing value is lost.
4. `bcFuzzyLookup` (`app.jsx:4477-4574`) uses 5 increasingly aggressive matching strategies (exact → stripped → contains → core substring → normalized startswith). The looser strategies can match items that are similar but not identical.
5. The `crossedFrom` field is the ONLY audit trail. It's not surfaced in the BOM table UI, not checked during quoting, and not compared during BC sync.

**Guard rails that DO NOT exist:**
- No flag to prevent auto-crossing already-extracted rows
- No check that the replacement PN is "better" than the original (e.g., same manufacturer, similar format)
- No user confirmation for crosses that change the PN format dramatically (catalog code → internal description)
- No protection against `runPricingOnPanel` overwriting a drawing-sourced PN with a BC internal PN

**This is separate from H5.** H5 addresses extraction quality (DPI, modal, review flags). Auto-cross corruption happens AFTER extraction, regardless of extraction quality. Fixing extraction doesn't help if the correct values are overwritten immediately after.

**Recommended fixes (prioritized):**

1. **Immediate: Add a `partNumberSource` field.** Track `"extraction"`, `"bc"`, `"manual"`, `"crossed"` separately from `priceSource`. Refuse auto-cross when `partNumberSource === "extraction"` unless the user explicitly confirms.

2. **Immediate: Guard `runPricingOnPanel` line 23961.** Change `partNumber: bcMap[key].bcNumber || r.partNumber` to ONLY overwrite when the existing `partNumber` is empty/null. If extraction already set a value, preserve it. BC's internal item number can go in `bcItemNo` (which already exists) without replacing `partNumber`.

3. **Short-term: Surface `crossedFrom` in the BOM table.** If `isCrossed: true`, show the original value alongside the replacement so users can catch bad crosses during review.

4. **Short-term: Require confirmation for format-changing crosses.** If the replacement PN looks structurally different from the original (e.g., contains commas, has spaces, different length by >30%), prompt the user instead of auto-applying.

### C6 — 2026-05-22 — pdfQuality shadowing fix (d38a55a5): baseline impact analysis

**Question:** Does CCD's d38a55a5 fix (removing `const` from `pdfQuality` assignment in `extractBomPage` CF) change extraction behavior, requiring a re-baseline before H5?

**Answer: No. Current baseline stands.**

#### Full trace

**Cloud Function — what the AI sees (unchanged by fix):**
- `extractBomPage` line 2398: `pdfQuality.warningLevel !== 'none'` builds the SCANNED DOCUMENT ALERT. This code is INSIDE the `if(hasPdf)` block alongside the `assessPdfPageQuality` call. Even with shadowing, the local `const pdfQuality` was used here correctly — the prompt injection ALWAYS worked. The AI received the identical alert text before and after the fix.
- `extractBomBatch` line 2601: Uses `const pgQuality` with no outer counterpart — no shadowing bug. Always returned correct data. (Moot for PRJ402107: 1 BOM page, batch requires ≥2.)

**Cloud Function — what's returned to client (changed by fix):**
- `extractBomPage` line 2469: `return { ..., pdfQuality }` — before fix, used outer `let pdfQuality = null` → client got `null`. After fix, returns real assessment.

**Client — consumption of `pdfQuality` (all metadata/reporting, not behavior):**

| Consumption point | Code location | Purpose | Affects extraction? |
|---|---|---|---|
| Attach to parsed result | `app.jsx:10385` | Pass-through | No |
| Capture per-page | `app.jsx:12345` | Stores in `pagePdfQuality` | No |
| `_perPageOutcomes` | `app.jsx:12475` | Reporting array | No |
| `extractionReport.scanQuality` | `app.jsx:12738` | Worst warningLevel across pages | No — metadata only |
| `extractionReport.scanDetails` | `app.jsx:12739` | Per-page scan info | No — metadata only |
| Scan quality banner | `app.jsx:25183-25196` | Amber/orange UI warning | No — display only |
| Re-extraction shortcut | `app.jsx:12245-12248` | Reuses existing scanQuality to skip pre-flight call | No — informational message only |

**L3 retry logic — completely independent of pdfQuality:**
- Phase 1 (line 12348): `const shouldRetry = verif && verif.status === "needs-review" && pageRetryAttempts < 1`
- Phase 2 (line 12408): `if(mergedNums.length >= 3 && pageRetryAttempts <= 1)` → checks remaining gaps
- Neither phase references `pdfQuality`, `scanQuality`, `warningLevel`, or any quality signal. L3 is driven entirely by structural verification (count mismatch, sequence gaps from `_parseAndVerifyBomRaw`).

**Pre-flight `checkPdfQuality` CF (lines 12250-12264):** Separate Cloud Function (`checkPdfQuality`, not `extractBomPage`). Calls `assessPdfPageQuality` independently on the server. Was NEVER affected by the shadowing bug. But it's informational only — shows progress bar message, does not affect extraction parameters, routing, or retry logic.

#### Verdict

1. **Re-baseline NOT needed.** The AI saw identical input (same PDF data, same SCANNED DOCUMENT ALERT prompt injection) on both sides of the fix. Client-side pdfQuality affects only post-extraction metadata and UI reporting.

2. **L3 was NOT broken by this bug.** L3 decisions are based on `extractionVerification` (count/gap analysis), not quality signals. The C4 finding stands independently: L3 didn't fire on PRJ402107 because the extraction predates the L3 feature.

3. **What the fix enables for H5:** `extractionReport.scanQuality` will now be populated for single-page PDF extractions, meaning:
   - The scan quality banner (line 25183) actually works for the primary extraction path
   - H5's modal can trigger from stored `scanQuality` on re-extractions without a separate `checkPdfQuality` call
   - Pre-flight shortcut (line 12245) will function on re-extractions of panels that already have real scanQuality data

4. **Bonus finding: `extractionReport.scanQuality` was dead code for single-page PDF extractions.** The only code path that calls `assessPdfPageQuality` is the PDF-native path inside `extractBomPage`. With the shadowing bug, that data was discarded. The scan quality banner (TODO #49) NEVER showed for single-page PDF-native extractions — which is likely the majority of extractions. Multi-page panels using `extractBomBatch` were unaffected (no shadowing bug on that path). This means the scan quality UX that shipped in v1.19.983+ was only functional for the batch path.

### C7 — 2026-05-22 — Scan quality banner was dead code for single-page PDF extractions (retrospective)

**Severity: LOW (no extraction behavior affected) — but has retrospective implications.**

**Timeline:**
- v1.19.983 shipped May 6, 2026: introduced `extractionReport.scanQuality`, `scanDetails`, per-page outcomes, and the scan quality banner in the BOM UI (`app.jsx:25183-25196`)
- d38a55a5 committed May 22, 2026: fixed `pdfQuality` variable shadowing in `extractBomPage` CF
- **Window: 16 days (May 6 – May 22)** where the feature was live but non-functional for single-page PDF extractions

**What was broken:**
- `extractBomPage` CF (line 2469) returned `pdfQuality: null` to the client due to `const` shadowing the outer `let`
- Client-side `extractionReport.scanQuality` (line 12738) derived worst warningLevel from `pdfQuality` → always evaluated to `"none"` for single-page PDF extractions
- The scan quality banner (line 25184: `if(!sq||sq==="none")return null;`) never rendered for those panels
- The pre-flight shortcut on re-extraction (line 12246: `if(_existingScanQuality&&_existingScanQuality!=="none")`) always fell through to calling `checkPdfQuality` CF — but that call is informational only (progress bar message), not a blocking gate

**What was NOT broken:**
- `extractBomBatch` CF (line 2662): uses `const pgQuality` with no shadowing → multi-page PDF extractions correctly returned `pdfQuality`. Panels with 2+ BOM pages using the batch path had correct scan quality data.
- The SCANNED DOCUMENT ALERT prompt injection (line 2398-2399): always worked because it used the local `pdfQuality` inside the same block before it went out of scope
- The pre-flight `checkPdfQuality` CF (lines 12250-12264): separate CF, unaffected — the progress bar warning always worked

**Scale of impact:**
- 149 releases deployed in the 16-day window (v1.19.983 through v1.20.19)
- Unknown number of actual BOM extractions performed on single-page PDF panels
- Every one of those extractions went through with no quality banner surfaced to the user, even for scanned/fax-quality documents that should have triggered it
- Cannot determine extraction count from git history — would require a Firestore query on `companies/{companyId}/debugLogs` filtering for `source: "extractBomPage"` entries between May 6-22

**Retrospective concern:** Users who extracted scanned/fax-quality PDFs in this window saw no visual warning about quality risk. If any of those BOMs were quoted without manual review, the same class of silent wrong-part-number errors we found in PRJ402107 may have shipped. This is the exact failure mode H5's modal is designed to prevent.

**CLOSED (2026-05-22, Jon's decision):** No retrospective audit needed. Every BOM gets human review before quoting — the dead scan quality banner was a missing belt; the suspenders (manual review) held. No action required.

### C8 — 2026-05-22 — BC Item Browser Drawing Reference: what it does, H6 impact, x_right=0.99 relevance

**Context:** Jon asked whether H6 (dedup fix) would incidentally improve the BC Item Browser's Drawing Reference feature, or whether the broken x_right=0.99 is the more relevant fix.

#### What the Drawing Reference actually does

**Data source:** Displays the final stored BOM (post-dedup, post-auto-cross). The `targetRow` is the BOM row the user clicked on in the BC Item Browser.

**Two rendering paths:**

| Path | Trigger | How it locates the row | Code |
|------|---------|----------------------|------|
| **Haiku AI fallback** (preferred) | API key available, initial load | Fresh Haiku call: sends page image, asks for `table_top`, `table_bottom`, `total_rows`, `pn_x`. Derives row Y via linear interpolation: `y = table_top + (itemIndex / total_rows) * (table_bottom - table_top)` | `locateInDrawing` (`app.jsx:19602-19645`) |
| **Stored coordinates** | Fallback when API unavailable, or after page-switch | Uses stored `y_top`/`y_bottom` from the BOM item directly | `cropRowFromImage` (`app.jsx:19648-19680`) |

Initial load (lines 19682-19707) always prefers the Haiku path when an API key is available — stored coordinates are the fallback, not the primary.

**Visual output:** Renders the full page as a canvas image with a single yellow highlight band at the calculated/stored row position. Scrolls horizontally to `pn_x` (from Haiku) or a default center-right position. Does NOT render bounding-box overlays or multiple row highlights. Does NOT spatially link BC items to drawing locations — it's a visual aid while the user searches the BC catalog, not a spatial indexing feature.

#### H6 impact on Drawing Reference: indirect improvement, not the primary fix

Currently, `positionalMergeBomItems` may keep the wrong column's `y_top` for cross-column merged items. Example: left column item 25 at y_top=0.30 and right column item 62 at y_top=0.30 get merged — the survivor inherits whichever `y_top` the merge scoring picks. If the user clicks item 62 in the BC Item Browser and the stored-coordinate path fires, the yellow highlight points to the wrong column's row.

After H6, each item retains its own correct `y_top` because cross-column items are no longer merged. The stored-coordinate fallback path becomes accurate for all items. However, since the Haiku AI path is preferred on initial load and uses its own linear interpolation (not stored `y_top`), the improvement only shows when the stored-coordinate fallback is used (API unavailable, page-switch, or cached result).

**Verdict:** H6 incidentally improves the Drawing Reference's fallback path. Not a reason to prioritize H6 (the dedup bug's impact on missing items is reason enough), but a nice side effect.

#### x_right=0.99: affects snippet self-correction, not Drawing Reference

The BOM_PROMPT instructs the AI: "x_left and x_right are the left and right edges of the entire BOM TABLE... All rows on the same page share the same x_left/x_right values." In practice, the AI disobeys this: it reports per-column `x_left` (0.01 for left column, 0.50 for right column) but always sets `x_right=0.99` (effectively full page width).

**Where x_right=0.99 matters:** `selfCorrectBomRowsWithSnippets` (`app.jsx:10570+`) uses stored `y_top`, `y_bottom`, `x_left`, `x_right` to crop per-row snippets for Haiku verification. With x_right=0.99, the snippet spans from the item's column start to nearly the right edge of the page — for left-column items, this includes the entire right column. The extra visual noise may reduce Haiku's verification accuracy.

**Where x_right=0.99 does NOT matter:**
- Drawing Reference highlight: uses `y_top`/`y_bottom` for the band height, scrolls to `pn_x` (from Haiku) — `x_right` is not referenced
- `positionalMergeBomItems`: checks `y_top`/`y_bottom`/`sourcePageIdx` — `x_right` not referenced (the H6 fix adds `x_left` check, not `x_right`)

**Per-column x_left values confirmed:** PRJ402107 baseline data shows `x_left=0.01` (items 1-50, left column) and `x_left=0.50` (items 51-86, right column). This confirms H6's x-distance guard will work — column separation is ~0.49, well above any reasonable X_TOL (0.10-0.25 range).

**Bottom line:** x_right=0.99 is a prompt compliance issue that primarily affects snippet self-correction crop width. It's not the relevant fix for BC Item Browser. H6 (dedup) is the higher-value change for Drawing Reference accuracy.

### C9 — 2026-05-22 — H6-PLAN.md Coach Review

**Verdict: APPROVE with one minor note. Ready for implementation.**

The plan is thorough, well-calibrated, and addresses the right problem at the right scope. Review against Jon's seven criteria:

#### 1. x_left only (x_right unusable) — SOUND

Section 2.2 nails this. x_right=0.99 for all items makes overlap detection, midpoint, and x_right comparison all useless. x_left is the only coordinate that distinguishes columns (0.01 vs 0.50 on PRJ402107). The C8 investigation independently confirmed this — the AI disobeys the prompt's "all rows share same x_left/x_right" instruction and reports per-column x_left, which is exactly what makes this fix viable.

#### 2. X_TOL = 0.15 calibration — CORRECT

Within-column noise: 0.000 (PRJ402107), 0.007 (PRJ402089), 0.01 (PRJ402079). X_TOL=0.15 is 15-21× above worst observed noise. Inter-column gap: 0.49 (two-column), ~0.32 (three-column theoretical). X_TOL=0.15 is 2-3× below the smallest gap. The threshold sits cleanly in no-man's land between within-column noise and between-column separation. No ambiguous cases.

#### 3. continue vs break — CORRECT

Critical detail CCD got right. Items sort by `(sourcePageIdx, y_top)`. Two items at y_top=0.38 in different columns are adjacent in sort order. `break` would skip the cross-column item AND all subsequent same-page items (catastrophic — would drop the entire tail of same-y-position matches). `continue` correctly skips only the cross-column candidate. The existing `break` on y_top exceeding Y_TOL remains valid because y-sort order is preserved regardless of x_left.

#### 4. Missing x_left fallthrough — CORRECT

The `&&` chain short-circuits when either x_left is not a number, so the `continue` never fires. Falls through to existing y_top/y_bottom checks. Preserves backward compatibility for legacy items, manual adds, and any edge case where the AI omits spatial coordinates. Matches the existing defensive pattern at line 9318 (items without y_top bypass dedup entirely).

#### 5. Regression test plan — ADEQUATE

- **Single-column:** Three projects (PRJ402104, PRJ402068, PRJ402106) with uniform x_left and zero positional drops. Verifies the x-check is a no-op. PRJ402089 spot-check for within-column noise edge case. Sufficient coverage.
- **Multi-column improvement:** PRJ402107 (the known 17-item drop) plus PRJ402101 (a second multi-column project).
- **Verification method:** `rawCount` vs `exactCount` comparison, item number enumeration against reference BOM. Sound approach.

#### 6. Three-column handling — SUFFICIENT (theoretical only, reasonable)

X_TOL=0.15 vs theoretical three-column gap of ~0.32 gives 2× headroom. No empirical three-column test project exists, but the math is clear and the failure mode (too-large threshold → ineffective fix, not data loss) is safe-side. No need to punt or add special handling — the same predicate works for any column count.

#### 7. Downstream consumers — ONE MINOR OMISSION

CCD's Section 3 pipeline is accurate but omits **`selfCorrectBomRowsWithSnippets`** (`app.jsx:10540`), which runs AFTER the full dedup pipeline at all three call sites (lines 12668, 22557, 22762). It operates on the merged BOM and uses stored `y_top`/`y_bottom`/`x_left`/`x_right` to crop per-row snippets for Haiku verification.

**Impact of the omission: zero risk.** More items surviving dedup → more rows sent to Haiku for snippet verification. This is correct behavior (recovered items should be verified). Cost increases proportionally to recovered items (~17 extra Haiku calls on a PRJ402107-class extraction). The pre-existing x_right=0.99 crop-width issue (C8) affects snippet quality equally for new and existing items — orthogonal to H6.

**No other consumers missed.** The three call sites and their downstream pipelines are fully enumerated. `positionalMergeBomItems` is not called anywhere else.

#### Summary

| Criterion | Verdict |
|-----------|---------|
| x_left only | Sound — only viable discriminator |
| X_TOL = 0.15 | Correct — 15-21× above noise, 2-3× below smallest column gap |
| continue vs break | Correct — break would be catastrophic |
| Missing x_left fallthrough | Correct — && short-circuit preserves legacy behavior |
| Single-column regression plan | Adequate — 3 projects + noise edge case |
| Three-column handling | Sufficient — math works, safe failure mode |
| Downstream consumers | One minor omission (selfCorrectBomRowsWithSnippets), zero risk |

**Recommendation:** Implement as written. The plan is clean, the risk assessment is honest, and the failure modes are all safe-side (detectable, not silent). No changes needed before implementation.

## Open Questions for Jon

1. How many concurrent users / active projects does ARC typically serve? Trying to calibrate whether the monolith's complexity ceiling is a near-term or long-term concern.
2. The stale API key cache (#6) and ledger mismatch (#7) have been OPEN since May 7. Are these deprioritized intentionally, or just lost in the noise?
3. Is there a reason deploy runs from the developer machine with no CI? Cost, complexity, or just hasn't been needed yet?

## Handoff to CCD

*(Specific items Jon should bring to CCD, dated)*

### 2026-05-22 — From Ovivo BOM extraction test review

**H1. Add "1 SET" to qty normalization** (bug fix, 1 line).
`_parseAndVerifyBomRaw` at `src/app.jsx:10324-10327` normalizes A/R variants to `qty:1` but not "1 SET", "2 LOT", or similar. `Number("1 SET")` → NaN. `parseInt` happens to return 1 for "1 SET" specifically, but this is fragile — depends on which coercion path downstream code hits. Add a pattern: strip trailing non-numeric text from qty strings that start with a digit (e.g., `"1 SET"` → `1`, `"2 LOT"` → `2`). One regex, one line of post-processing.

**H2. Add catalog-description cross-validation to `_parseAndVerifyBomRaw`** (medium lift, high value).
CCD's test proved this is the strongest safety net for dense BOMs. Start with the 1489-M series: parse `M{poles}{curve}{amps}` from the catalog suffix, check against the description for matching pole count and amperage. Flag mismatches as `confidence: "low"` with a reason. Expand to other known families over time (140MT, 25B/25C VFDs, 5069 PLC modules). This is the single most impactful validation CCD identified that ARC doesn't have.

**H3. Add tag-count vs qty sanity check** (small lift, easy win).
In `_parseAndVerifyBomRaw`, after parsing: if `notes` contains comma-separated tags and `qty < tag count`, flag as `needs-review`. Example: `notes: "CB1222, CB1226, CB1230"` with `qty: 2` is wrong — should be at least 3.

**H4. Consider `revMark` field in BOM schema** (design decision).
The Ovivo BOM has revision marks (B, C, D triangles) on 10 of 87 items. Currently silently dropped. If ARC tracks ECOs, revision marks tell you which items changed per revision — useful for ECO scoping. Tradeoff: adds a field to every BOM row, most will be empty. Ask Jon whether this data is actually used in the business workflow before implementing.

**H5. User-facing safety net for low-confidence BOM extraction** (medium-large lift, prevents the worst failure mode).

The most dangerous failure mode in BOM extraction is not "extraction fails" — it's "extraction returns plausible-looking wrong data and the user quotes from it." CCD's Ovivo test proved this happens: at 300 DPI, ~15% of rows had wrong part numbers that *looked right*. This change converts silent failures into visible ones.

**When to trigger.** After page type detection completes and before `runExtractionTask` starts. Two independent signals, either triggers the safety net:

| Signal | Source | Meaning |
|--------|--------|---------|
| Poor PDF quality | `checkPdfQuality` CF returns `warningLevel: "medium"` or `"high"` | Scanned/fax-quality source — character-level accuracy is not guaranteed |
| No BOM region | `resolveBomRegion(pg)` returns `null` for one or more BOM pages (no user-drawn region, no AI-detected `aiBomRegion`) | Model will see the full page at whatever resolution the API's internal renderer chooses — effective DPI may be too low for dense tables |

Both signals together = highest risk. Either alone is still worth surfacing.

**Pipeline change: move `checkPdfQuality` earlier.** Currently fires inside `runExtractionTask` at `app.jsx:12243-12266` — too late for a modal. Move it to the `confirmAndExtract` flow in `PanelCard` (lines 21788-21814), between the `bomPages` filter and the `runExtractionTask` call. The CF is lightweight (30s timeout, no AI call, ~1-2 seconds) so it won't noticeably delay the extraction start.

**Interception point.** Insert between `app.jsx:21809` (page counting) and `21814` (`runExtractionTask` call):

```
// Pseudocode — actual implementation is CCD's job
const qualityResults = await checkPdfQuality(bomPages);  // moved from runExtractionTask
const missingRegions = bomPages.filter(pg => !resolveBomRegion(pg));
const poorQuality = qualityResults.worstLevel !== 'none';

if (poorQuality || missingRegions.length > 0) {
  const userChoice = await showExtractionWarningModal({
    poorQuality,
    qualityLevel: qualityResults.worstLevel,
    missingRegionCount: missingRegions.length,
    totalBomPages: bomPages.length,
  });
  
  if (userChoice === 'cancel') return;  // user will draw BOM regions
  // userChoice === 'proceed' → set flag for downstream
  extractionFlags.forceReview = true;
}

runExtractionTask(uid, projectId, updated, { ...cbs, extractionFlags });
```

**Modal content.**

Header: "BOM extraction quality warning" (not "error" — this is a risk disclosure, not a failure)

Body varies by trigger:
- Poor quality only: "This drawing is a scanned/fax-quality image. Part numbers may be misread — especially characters like B/8, S/5, O/0, I/1."
- Missing region only: "No BOM region was identified on {N} page(s). Extraction will read the full page, which may reduce accuracy on dense tables."
- Both: "This drawing is scanned AND no BOM region was found. Extraction accuracy will be significantly reduced."

All cases end with: "Extracted items will be flagged for manual review before quoting."

Two buttons:
- **"Proceed — I'll review the BOM"** → sets `forceReview = true`, extraction runs
- **"Cancel — I'll draw the BOM region"** → returns to region-drawing workflow (exits the extract flow, opens the page thumbnail view where the user can draw BOM rectangles)

**`forceReview` flag propagation.** This is the critical path — the flag must survive all the way from the modal through to quote generation and BC integration.

| Layer | What changes | Where in code |
|-------|-------------|---------------|
| Extraction task | Pass `forceReview` into `runExtractionTask` via the `cbs` options object | `app.jsx:21814` |
| Per-page extraction | If `forceReview`, append to `userNotes`: "REVIEW MODE: User acknowledged low-quality source. Default ALL rows to confidence 'medium' or lower." | Inside `runExtractionTask`, before extraction loop at `app.jsx:12309` |
| Parse/verify | If `forceReview`, downgrade ALL "high" confidence rows to "medium" in `_parseAndVerifyBomRaw` — same mechanism as the existing confusable-glyph auto-downgrade at `app.jsx:10287-10300`, just applied universally | `_parseAndVerifyBomRaw` or a post-processing step after it returns |
| Panel metadata | Set `panel.extractionReport.forceReview = true` and `panel.extractionReport.forceReviewReason = 'poor-quality' \| 'no-region' \| 'both'` | In `runExtractionTask`'s `extractionReport` builder |
| BOM table UI | If `panel.extractionReport.forceReview`, show persistent amber banner above BOM: "This BOM was extracted from a low-confidence source. Review all items before quoting." Similar to existing scan-quality warning banner (`app.jsx`, TODO #49) but non-dismissible. | BOM table header area |
| Quote generation | If ANY panel in the quote has `forceReview && !forceReviewCleared`, block the "Send Quote" action with a modal: "Panel {name} has unreviewed BOM items from a low-confidence extraction. Review and clear the flag before sending." | Quote send flow |
| BC integration | `bcSyncPanelPlanningLines` should skip or warn (not silently push) if `panel.extractionReport.forceReview` — wrong BOM data flowing into BC planning lines is the real failure case | `app.jsx:3279` area |
| Flag clearing | User can clear the flag via an explicit "Mark as Reviewed" action on the panel — a button in the BOM toolbar that requires at least one manual row interaction (edit, confirm, or scroll-through-all). This prevents clearing without actually looking. | New UI element in BOM toolbar |

**What this does NOT do.** It does not improve extraction quality — the AI still gets the same input. It converts a silent failure (wrong data accepted as correct) into a visible one (user knows quality is in question and reviews accordingly). The actual quality improvement comes from H5's original suggestion: server-side re-rendering of raster PDFs at 400+ DPI. That's a separate, harder problem. This modal is the safety net that makes the current pipeline honest about its limitations.

**Relationship to existing warnings.** ARC already has:
- Pre-flight scan quality warning in progress bar (`app.jsx:12248-12261`) — informational only, non-blocking, disappears when extraction starts
- Post-extraction scan-quality banner (#49, `extractionReport.scanQuality`) — visual indicator, no downstream enforcement
- Confidence dots on BOM rows (#49) — per-row, no panel-level gating

The `forceReview` flag adds what's missing: a **panel-level gate** that blocks quoting and BC sync until the user explicitly acknowledges the quality risk. The existing per-row confidence system handles the "which specific rows are suspect" question; `forceReview` handles the "should we trust this BOM at all" question.

### 2026-05-22 — From C4 definitive Firestore check (post-dedup-bug discovery)

**H6. Fix positional dedup for multi-column BOMs** (HIGHEST PRIORITY — surgical fix, largest single-change impact).

`positionalMergeBomItems` (`app.jsx:9309-9383`) merges items from the same page whose `y_top` values are within `Y_TOL=0.004` but does NOT check `x_left`/`x_right` distance. For two-column BOMs (like the Ovivo 87-item table), items at the same row height in different columns get merged — one wins by score, one is silently dropped.

**Proven impact:** PRJ402107 `rawCount: 87` (AI extracted all items) → `exactCount: 70` after dedup (17 items lost). The 17 "missing" items in the baseline diff were never missing from extraction — they were removed by this bug.

**The fix:** Add an x-distance guard to the inner merge loop at `app.jsx:9341-9353`. Before checking y_top proximity, verify that the candidate item's `x_left` is within tolerance of the base item's `x_left`. Columns in a two-column BOM are separated by ~0.45-0.55 in x-space. A tolerance of `X_TOL=0.15` (15% of page width) would allow merging within the same column while preventing cross-column merges.

```
// Inside the inner loop, after the sourcePageIdx check (line 9346)
// and before the y_top check (line 9348):
if(typeof b.x_left==="number"&&typeof base.x_left==="number"
  &&Math.abs(b.x_left-base.x_left)>X_TOL)continue;
```

**Calibration:** CCD should log actual `x_left` values from a PRJ402107 extraction to verify column separation before choosing X_TOL. The Ovivo BOM has columns at approximately x_left ≈ 0.0-0.45 (left) and x_left ≈ 0.5-1.0 (right). Any threshold between 0.10 and 0.25 would work.

**Edge cases to consider:**
- Single-column BOMs: all items have similar x_left → x-check is a no-op, no behavior change
- Three-column BOMs: columns at ~0.0, ~0.33, ~0.66 → X_TOL=0.15 keeps each column separate
- Items without x_left: the guard should `continue` (skip x-check, fall through to y-check) if either item lacks x_left — matches existing pattern for items without y_top at line 9318

**No formal plan needed.** Single function, single predicate, well-defined test case (PRJ402107 retains all 87 items post-fix). The function has been through 4 prior iterations (v1.19.622/630/645/647) — each was a direct change with immediate verification. Implement, re-extract PRJ402107, verify, deploy.

**H7. Add L3 retry/gap-fill to the re-extraction path** (HIGH — eliminates safety net gap).

L3 Phase 1 (broad retry) and Phase 2 (targeted gap-fill) only exist in `runExtractionTask` (`app.jsx:12346-12454`). The re-extraction path (`app.jsx:22478-22513`) calls `extractBomPage` per page and proceeds directly to merge — no verification, no retry, no gap-fill. Users who re-extract a BOM lose L3's protection against missing items.

**Two approaches:**

A. **Port L3 inline** into the re-extraction loop. Copy the L3 Phase 1 + Phase 2 logic from `runExtractionTask` into the re-extraction per-page loop after `extractBomPage` returns. Quick but duplicates ~100 lines of code.

B. **Refactor L3 into a shared function** (preferred). Extract L3 into something like `applyL3RetryIfNeeded(result, unit, notes, pageRetryAttempts)` that both `runExtractionTask` and the re-extraction path call. Eliminates duplication, ensures both paths stay in sync on future L3 changes.

**Why this matters:** PRJ402107 was a re-extraction. If L3 had been available, the sequence gap detection would have caught any items the dedup didn't kill (or any items the AI genuinely missed), and retried. Currently, re-extraction users get worse coverage than initial extraction users — unintuitive and invisible.

**H8. Re-baseline PRJ402107 after H6 lands** (REQUIRED — current baseline is contaminated by dedup bug).

The current baseline (32/87 exact matches, 38 wrong PNs, 17 missing) is unreliable:
- The 17 "missing" items are dedup artifacts, not extraction failures
- Some of the 33 "wrong part numbers" (after C5 correction) may be dedup-swapped data — where positional dedup kept one column's item data under the other column's itemNo
- The true OCR error rate is unknowable until dedup stops masking items

**After H6:** Re-extract PRJ402107 on the fixed code. Capture new baseline. Compare against reference BOM. The new diff will show:
- How many items the AI actually gets wrong (true OCR errors, no dedup noise)
- Whether L3 (if H7 is also in place) recovers any remaining gaps
- The real accuracy target for H5

**H5's scope should be re-evaluated against this clean baseline.** The previous H5 design assumed 33 OCR errors and 17 missing items. If the 17 missing items are resolved by H6, and some of the 33 "wrong PNs" were dedup swaps, H5's remaining scope may be smaller — or the OCR error distribution may shift in ways that change the optimal approach.

#### Revised handoff status (2026-05-22, Jon's decisions)

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| **H6** | **NEW — top priority** | 1 | Dedup fix. Implement and deploy immediately, no plan doc needed. |
| **H8** | **NEW — required after H6** | 2 | Re-baseline PRJ402107. Needed before scoping H5. |
| **H7** | **NEW — high** | 3 | L3 in re-extraction path. Can be done before or after H8. |
| H5 | ON HOLD | 4 | Scope must be re-evaluated against H8's clean baseline. H5-PLAN.md deferred until H8 completes. |
| H1 | Bundled into H5 | — | "1 SET" qty fix. Still needed, ships with H5. |
| H3 | Bundled into H5 | — | Tag-count vs qty check. Still needed, ships with H5. |
| H2 | Deferred | — | Catalog-description cross-validation. Not in current scope. |
| H4 | Closed | — | revMark field. Matrix doesn't use revision marks. |
| C5 | OPEN — independent | Parallel | Auto-cross corruption. Separate from extraction pipeline. Can be addressed independently of H6-H8. |

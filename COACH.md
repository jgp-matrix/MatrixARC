# ARC Coaching Log

## Close-Out Discipline

Any design decision, analyst review, or scope change produced or relayed during a Coach session **must be committed to a repo file** before session end. Freddy's decisions live only in browser chat until Coach or Marc commits them — if a session ends without writing them down, the next Freddy has no way to recover them. When closing out, explicitly check: "Did Freddy produce anything this session that isn't in the repo yet?"

## Session Index

- **2026-05-22 (Session 1)** — Initial onboarding. Read CLAUDE.md, TODO.md, git log. Assessed current architecture and risk posture.
- **2026-05-22 (Session 1, cont.)** — BOM extraction test review (Ovivo PRJ402107). Cross-referenced CCD methodology against ARC extraction code. Evaluated Phase 3 prompt/schema/validation for ARC portability.
- **2026-05-22 (Session 1, cont.)** — Jon's handoff decisions: H2 deferred, H4 closed, H1/H3 bundled into H5. H5 reframed to include region-targeted 600 DPI rendering + user-facing modal + needs-review flag propagation. Baseline captured by CCD: 36.8% accuracy on PRJ402107. Failure pattern analysis logged.
- **2026-05-22 (Session 1, cont.)** — pdfQuality shadowing fix (d38a55a5) impact analysis. Traced pdfQuality through full pipeline — extraction behavior unaffected, L3 independent. Current baseline valid. Scan quality UX was dead code for single-page PDF extractions.
- **2026-05-22 (Session 1, cont.)** — C4 definitive Firestore check. PRJ402107 was a re-extraction on v1.20.18 — L3 absent from re-extraction path. AI extracted all 87 items (rawCount:87); 17 lost in positional dedup that doesn't check x-position. Root cause is dedup bug for multi-column BOMs, not extraction quality. C7 closed (manual review is sufficient belt).
- **2026-05-22 (Session 1, cont.)** — C8: BC Item Browser Drawing Reference investigation. Two rendering paths (Haiku AI preferred, stored coords fallback). H6 incidentally improves fallback path accuracy. x_right=0.99 affects snippet self-correction, not Drawing Reference. Per-column x_left values confirmed (0.01 / 0.50).
- **2026-05-22 (Session 1, cont.)** — C9: H6-PLAN.md coach review. APPROVED. All seven criteria pass. One minor omission (selfCorrectBomRowsWithSnippets as downstream consumer), zero risk. Ready for implementation.
- **2026-05-22 (Session 1, cont.)** — C10: H6 post-deploy verification. SIGNED OFF. 15/17 recovered, 0 false non-merges. 2 remaining are same-column y-collision (different bug class, stochastic, 2.3% impact). Exact match count invariance confirmed (32/32, 20 stable overlap). H8 baseline established.
- **2026-05-22 (Session 1, cont.)** — C11: H7-PLAN.md coach review. APPROVE with 2 flags. Architecture sound, feedback exclusion justified, downstream safe. Must fix: test plan needs real L3-triggering project via `find-l3-evidence.js`. Recommended: code-level diff for refactor verification.
- **2026-05-22 (Session 1, cont.)** — C12: Fuzzy merge silent data loss discovered. 22 items across 10 production panels. IDEC product-family variants merged due to v1.19.642 description override defeating Y-guard. H9 promoted to priority 1.
- **2026-05-22 (Session 1, cont.)** — C13: H9-PLAN.md coach review. APPROVED — no blocking issues. itemNo reliable at merge stage, v1.19.642 interaction clean, no legitimate cross-itemNo merges exist, risk asymmetry holds. One minor doc nit (edge case 6).
- **2026-05-22 (Session 1, cont.)** — C14: H9 post-deploy verification. SIGNED OFF on H9 fix (items 27/28/30 present, zero fuzzy merges, zero gaps). keepA fix clean. Separate finding: 50→21 raw count drop — AI missed items 1-26 contiguously. Root cause undetermined; three hypotheses with investigation steps. New code deficiency: re-extraction batch path omits bomRegion (line 22481 vs 12305).
- **2026-05-22 (Session 1, cont.)** — C15: Re-extraction verification gap. CRITICAL architectural finding. Re-extraction path computes per-page verification but silently discards the result. PRJ402104's 21-item extraction passed without flags. H10 reshaped to include verification + L3 + report fields. H7 absorbed into H10 — same architectural gap, one coherent fix.
- **2026-06-03 (Session 2)** — C16: Cross-project BOM contamination (CRITICAL, TODO #86). PRJ402119 BOM written into PRJ402111 via stale extraction callback + React component reuse + panel ID collision. Initial extraction pipeline investigation found no leak (correctly scoped). Root cause was at React state management layer — `<ProjectView>` reuse across projects allowed completion handlers to write to wrong project. Fixes: `key` prop + extraction guard. Documented in `DIAGNOSTIC-CROSS-PROJECT-CONTAMINATION.md`. Architectural rule added to CLAUDE.md. Follow-up: #87 (panel ID uniqueness), #88 (async ownership audit).

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

### C10 — 2026-05-22 — H6 post-deploy verification: SIGNED OFF

**H6 verdict: SUCCESS.** 15 of 17 cross-column items recovered. 0 false non-merges. 0 duplicate rows. No systematic OCR change. The fix works as designed.

#### Headline numbers

| Metric | Pre-H6 | Post-H6 | Reference |
|--------|--------|---------|-----------|
| Raw items extracted | 87 | 87 | 87 |
| After positional dedup | 70 | 85 | — |
| Items dropped by dedup | 17 | 2 | 0 |
| Exact PN matches | 32 | 32 | — |
| Extra items (false non-merges) | 0 | 0 | — |
| Version | v1.20.19 | v1.20.20 | — |

#### The 2 remaining missing items: same-column y-collision (different bug class)

Both missing items are **same-column** merges at adjacent rows where the AI reports y_top values within Y_TOL=0.004. This is NOT the cross-column bug H6 fixed — it's a denser, rarer failure mode.

**Item 50 (5069-L330ERM, ALLEN BRADLEY, $8,713 PLC controller) — merged with item 49:**

- Item 49 post-H6: x_left=0.01, y_top=0.988, notes=`"ECB1330; PLC1344"`
- PLC1344 is item 50's tag per the reference. The semicolon-concatenated notes are the `keepNotes` pattern from positional merge. Item 49 (PHOENIX CONTACT circuit breaker, $345) won on score and absorbed item 50.
- Both items are at the very bottom of the left column where row spacing is compressed. The AI placed them within 0.004 of each other in y-space.
- **This is an incorrect merge.** Two different items, different manufacturers, different prices ($345 vs $8,713), different functions.

**Item 64 (SH3B-05C, IDEC, relay socket, qty 5) — merged with item 63:**

- Item 63 post-H6: x_left=0.5, y_top=0.24, notes=`"CR1470, CR1472, CR1480, CR1482, CR1490"`
- Those are item 64's tag locations per the reference. Item 63 (RH3B-ULC-DC24V, relay) won on score and absorbed item 64 (SH3B-05C, socket — the companion part mounted under the relay).
- Items 63 and 64 are adjacent rows in the right column. Both are IDEC parts at the same tag locations — they're companion parts (relay + socket) that physically co-locate.
- **This is an incorrect merge.** Different PNs, different functions, different prices. They must remain separate BOM lines.

**Root cause:** On a 2-column BOM with ~43 rows per column spanning ~96% of page height, theoretical row spacing is ≈2.2%. Y_TOL=0.004 (0.4%) should be well below that. But the AI's y_top precision degrades at the page extremes (item 50 at y_top≈0.988) and for visually similar adjacent rows (items 63/64, both IDEC relay-family parts). In these edge cases, the AI reports y_top values within 0.004 of the neighbor.

**Is this a new H-item?** Not right now. Assessment:

| Factor | H6 (cross-column) | This (same-column y-collision) |
|--------|-------------------|-------------------------------|
| Items affected | 17/87 (20%) | 2/87 (2.3%) |
| Root cause | Missing x-check — deterministic | AI y_top noise — stochastic |
| Fix complexity | One predicate | Needs smarter merge criterion (field similarity, PN mismatch guard) |
| Reproducibility | Every extraction of this BOM | Varies per extraction (AI non-determinism) |

The same-column y-collision is stochastic — different extraction runs produce different collisions. Item 50 was exact-match pre-H6 (no collision in that run) but collided post-H6 (different y_top assignment). A fix would likely involve adding a field-similarity requirement to the merge (e.g., require matching manufacturer or similar PN to merge) — but this conflicts with the original quadrant-overlap use case where different readings of the same row produce different PNs. Worth revisiting if the quadrant path is fully retired, but not blocking current work.

#### Exact match count invariance: confirmed (with nuance)

The count 32 is stable, but the **specific items** differ significantly between extraction runs:

| Category | Count |
|----------|-------|
| Stable exact matches (correct in both runs) | 20 |
| Lost exact matches (correct pre-H6, now wrong or missing) | 12 |
| Gained exact matches (wrong/missing pre-H6, now correct) | 12 |
| Net change | 0 |

Of the 12 gained exact matches, 6 were among the 15 recovered items (18, 19, 20, 25, 51, 87). The other 6 are items that were present pre-H6 but had wrong PNs, and happened to get read correctly this time (AI non-determinism).

**What the invariance proves:**
1. **H6 does not affect OCR accuracy.** Expected — it changes dedup, not extraction.
2. **6/15 recovered items (40%) are exact matches** — in line with the overall 32/85 (37.6%) accuracy rate. The recovered items have the same OCR quality distribution as items that were always surviving. No data corruption introduced by the fix.
3. **20 items are "stably correct"** across runs — these are the parts the AI reads reliably at current resolution. The other 12 are in a noise band where the AI sometimes gets them right and sometimes doesn't.
4. **12 items that were correct pre-H6 are now wrong** — pure AI non-determinism, not H6-related. Item 50 is among these (was exact match pre-H6, now merged away by same-column collision).

#### H6 status update

| Item | Status | Priority | Notes |
|------|--------|----------|-------|
| **H6** | **CLOSED — VERIFIED** | ✓ | Deployed v1.20.20. 15/17 recovered. 2 remaining are same-column y-collision (different bug class). |
| **H9** | **APPROVED — C13** | 1 | Fuzzy merge itemNo guard. CRITICAL — 22 items across 10 production panels. |
| **H8** | **READY — baseline captured** | 2 | Post-H6 baseline. Re-baseline again after H9. |
| **H7** | **READY — blocked by H9** | 3 | L3 in re-extraction path. H9 must land first. |
| H5 | ON HOLD | 4 | Scope re-evaluation against clean baseline (post-H6 + H9). |

### C11 — 2026-05-22 — H7-PLAN.md Coach Review

**Verdict: APPROVE with two flags for revision before implementation.**

The architecture is sound. The shared-function approach is correct, the feedback exclusion is justified, and downstream consumers need no changes. Two gaps in the test plan need fixing.

#### 1. Approach B (shared function) — SOUND

CCD's argument is correct. L3 has been tuned twice (v1.19.1057 initial, then gap-fill limits), and it's ~135 lines. Two copies in a 2MB file will diverge. The proposed interface is clean:

```
applyL3RetryAndGapFill({ result, unit, notes, pageLabel, pageRetryAttempts })
→ { result, pageRetryAttempts, extractionPathsSeen }
```

Verified against the actual L3 code at lines 12355-12462: all scope dependencies are accounted for. The `unit` parameter carries `dataUrl`, `originalPdfPath`, `pageNumber`, `croppedBomDataUrl`, `bomRegion` — matching the `extractBomPage` call signatures in both Phase 1 (line 12370, passes `croppedBomDataUrl`) and Phase 2 (line 12430, passes `null` for gap-fill). The `pageLabel` parameter abstracts `pg.name||pgIdx+1`. The `extractionPathsSeen` return lets callers accumulate paths into their own Set. No hidden coupling.

**One detail CCD didn't call out but handles correctly:** Phase 1 passes `unit.croppedBomDataUrl` to the retry call (same crop as original) while Phase 2 passes `null` (gap-fill sees full page). Since the shared function body is a mechanical copy, this distinction is preserved. Worth a comment in the function.

#### 2. Feedback re-extraction exclusion — JUSTIFIED (with a nuance)

CCD's stated reason: "Adding L3 Phase 1 on top would send BOTH the user's feedback AND automated retry feedback — potentially conflicting instructions."

The actual mechanism is slightly different: L3 Phase 1 calls `extractBomPage(unit.dataUrl, retryFeedback, notes, ...)` where `retryFeedback` is the second parameter. In `reExtractWithFeedback`, the first call uses `aiFeedback` (the user's text) as the second parameter (line 22723). If L3 fired, the retry call would **replace** the user's feedback with automated retry instructions, not conflict with them. The user's domain-specific corrections would be lost on the retry pass.

The conclusion is the same — don't add L3 to the feedback path — but the reason matters for future consideration. If someone later revisits this decision, they need to CONCATENATE `aiFeedback + retryFeedback`, not just add L3.

#### 3. Report field selection — DEFENSIBLE

**Add l3MergeRecovered, l3GapFillRecovered:** Correct. These are the primary L3 outcome fields. The re-extraction report builder at line 22584 currently lacks them.

**Add perPageOutcomes:** Correct. This enables the `ZeroBomBanner` component (line 20424) to show rejection reasons for re-extractions that produce empty BOMs — currently broken because the field is missing.

**Skip scanQuality, scanDetails:** Defensible. These are derived from `pdfQuality` data captured per-page during extraction. The initial extraction's scanQuality is already on the panel's extractionReport. Re-extracting the same pages won't change PDF quality. Edge case (user uploads new PDF between extractions) is theoretical — re-extraction is always triggered on existing pages.

#### 4. Downstream consumers — NO CHANGES NEEDED

Verified all consumers:

| Consumer | Location | Reads | Safe with new fields? |
|----------|----------|-------|-----------------------|
| Extraction concerns banner | `app.jsx:20540` | `(r.l3MergeRecovered\|\|0)+(r.l3GapFillRecovered\|\|0)` | Yes — `\|\|0` fallback handles absent/present |
| ZeroBomBanner | `app.jsx:20424` | `r.perPageOutcomes\|\|[]` | Yes — `\|\|[]` fallback. **Positive change:** banner now shows rejection reasons for re-extractions |
| scanQuality derivation | `app.jsx:12747` | Derives from `perPageOutcomes` | N/A — only in initial report builder, not re-extraction |
| `read-extraction-report.js` | `tests/` | Reads both L3 fields | Already handles missing gracefully |

No code changes needed beyond what CCD plans. All consumers use defensive fallbacks.

#### 5. Test plan — TWO FLAGS

**FLAG 1 (MUST FIX): Section 7.3 "Force-trigger L3 on re-extraction" is too vague.**

CCD's plan says "Find or create a project where AI extraction misses items... OR temporarily lower the detectedLineCount threshold."

"Find or create" is not a test plan — it's a hope. "Lower threshold" is a test hack that validates plumbing but not real-world L3 behavior.

**CCD already wrote `tests/extraction-baseline/find-l3-evidence.js`** — a Firestore scanner that identifies:
- Panels where `l3MergeRecovered > 0` or `l3GapFillRecovered > 0` (proven L3 triggers)
- Panels with `finalSequenceGaps` but no L3 recovery (possible re-extraction path victims — exactly the scenario H7 fixes)

**Required revision:** The test plan must include:
1. Run `find-l3-evidence.js` to identify real projects where L3 has fired or where gaps exist
2. Pick one project from the results as the L3 verification target
3. Re-extract that project on the H7 code to confirm L3 fires in the re-extraction path
4. If `find-l3-evidence.js` returns zero results (L3 has never fired in production), that's a finding worth logging — and the "lower threshold" hack becomes acceptable as a fallback, but should be explicitly noted as a synthetic test

This is the only blocking flag. Without a real L3-triggering test case, the core claim "L3 now works in re-extraction" is unverified.

**FLAG 2 (RECOMMENDED, not blocking): Section 7.2 "Confirm initial extraction unchanged" relies on non-deterministic comparison.**

CCD says: "Re-extract a single-column test project using initial extraction. Verify final BOM matches previous extraction."

Extraction is non-deterministic — the AI produces different results each run. Comparing two extraction runs can't distinguish "refactor changed L3 behavior" from "AI extracted differently." The test will pass even if the refactor introduced a subtle bug, because any differences will be attributed to AI variance.

**Better approach:** After extracting the shared function, do a code-level diff of the function body against the original inline code (lines 12355-12462). Confirm the logic is character-for-character identical except for the parameterization changes (pg.name → pageLabel, etc.). This is a 5-minute manual review that provides stronger assurance than any behavioral test.

#### Summary

| Criterion | Verdict | Notes |
|-----------|---------|-------|
| Approach B vs A | Sound | Clean interface, correct dependency handling |
| Feedback exclusion | Justified | Real reason: retry replaces feedback, not conflicts |
| Report fields | Defensible | scanQuality skip is correct |
| Downstream consumers | No changes needed | All use defensive fallbacks |
| L3 trigger test | **MUST FIX** | Run `find-l3-evidence.js`, use real project |
| Refactor verification | Recommended fix | Code diff > behavioral comparison |

**Recommendation:** Fix Flag 1 (identify a real L3-triggering test project via `find-l3-evidence.js`) before implementation. Flag 2 is recommended but CCD can address it during implementation via a manual code review of the extraction.

### C14 — 2026-05-22 — H9 Post-Deploy Verification

**Verdict: H9 SIGNED OFF. The itemNo guard works as designed. Separate extraction-quality finding escalated.**

#### 1. H9 Success Criteria — ALL PASS

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Item 27 (RH2B-ULC-120) present | ✓ PASS | `prj402104-post-h9.json` line 16-23: itemNo "27", qty 3, IDEC |
| Item 28 (SH2B-05C) present | ✓ PASS | JSON line 25-31: itemNo "28", qty 3, IDEC |
| Item 30 (SH3B-05C) present | ✓ PASS | JSON line 41-49: itemNo "30", qty 3, IDEC |
| Zero fuzzy merges | ✓ PASS | JSON line 11: `"fuzzyMerges": []` |
| Zero sequence gaps | ✓ PASS | JSON line 12: `"finalSequenceGaps": []` |
| Pipeline invariance | ✓ PASS | raw=21 → exact=21 → fuzzy=21 → final=21. No items lost at any stage. |

The three items that were previously dropped by fuzzy merge (C12: RH2B-ULC-120 merged into RH1B-ULC-120, SH2B-05C into SH1B-05C, SH3B-05C into SH1B-05C) now survive. The itemNo guard blocked all three false merges as designed.

#### 2. v1.20.22 keepA Fix — CLEAN

Verified at `app.jsx:9272-9279`:

```
const keepA=pnA.length>=pnB.length;           // line 9272
const kept=keepA?base.partNumber:b.partNumber;  // line 9274
const dropped=keepA?b.partNumber:base.partNumber; // line 9275
keptItemNo:keepA?(base.itemNo||base.item||""):(b.itemNo||b.item||""),  // line 9278
droppedItemNo:keepA?(b.itemNo||b.item||""):(base.itemNo||base.item||""), // line 9279
```

`keptItemNo` and `droppedItemNo` correctly track the `keepA` conditional — when `base` is kept, `base.itemNo` goes to `keptItemNo` and `b.itemNo` goes to `droppedItemNo`, and vice versa. These are diagnostic-only fields (no consumers today); the fix ensures merge reports accurately reflect which item survived. No functional impact.

#### 3. Raw Count Drop: 50→27 BOM items (47→21 raw AI items) — SEPARATE FINDING

**Observation:** The post-H9 re-extraction produced items 27-47 only. Items 1-26 are entirely absent from the AI output (`rawCount=21`). This is a contiguous half-BOM miss — the AI started extraction at item 27 and missed everything above it.

**H9 regression ruled out:** The itemNo guard runs inside `fuzzyMergeBomItemsWithReport`, which is post-extraction. It cannot affect what the AI extracts from the PDF. The raw count drop is upstream of H9's change. The pipeline correctly preserved all 21 AI-extracted items through dedup (21→21→21→21 — zero loss at every stage).

**Three hypotheses:**

| # | Hypothesis | Likelihood | Evidence For | Evidence Against |
|---|-----------|-----------|-------------|-----------------|
| A | **Multi-page BOM, first page not sent** — PRJ402104's BOM spans 2+ pages. If page 1 (items 1-26) wasn't classified as "bom" or wasn't included in re-extraction, only page 2 would be extracted. | Medium-High | Item count split (26+21=47) is a natural page break. Pre-H9 extraction (v1.20.20) had raw=47, consistent with 2 pages. | The re-extraction code processes all `bomPages` — skipping a page would require it to be untagged or filtered by `_basePages`. |
| B | **AI non-determinism on a single page** — Full BOM is on one page but the AI started extraction at item 27. | Medium | AI extraction is inherently non-deterministic. Diff report acknowledges AI non-determinism for items 25-26. | Contiguous half-BOM miss is far outside normal variance. Random per-item drops produce scattered gaps, not a clean 1-26 cutoff. |
| C | **bomRegion/CropBox clipping** — A user-drawn or AI-detected bomRegion that covers only the bottom half of the BOM table. If the CropBox was applied to the PDF, the AI would only see items 27-47. | Low-Medium | The Cloud Function applies CropBox when bomRegion is provided (functions/index.js:2370-2385). A miscalibrated bomRegion would produce exactly this symptom. | The re-extraction batch path at line 22481 does NOT pass bomRegion (see finding below), so for the batch path, CropBox was NOT applied. If the extraction went through batch, this hypothesis fails. |

**Cannot determine root cause without:**
1. **Firestore page data:** How many pages does PRJ402104 have tagged as "bom"? If 2+ pages, was page 1 included in the re-extraction?
2. **Cloud Function logs:** What did `extractBomBatch` actually receive and return? How many pages were in the batch payload?
3. **Re-run test:** Re-extract PRJ402104 again. If the same 21 items return, the cause is deterministic (page config or bomRegion). If items 1-26 return, it was AI non-determinism.

**Assessment:** Hypothesis A (multi-page, first page dropped) is the most likely. The clean 1-26/27-47 split, combined with the pre-H9 raw=47 count, strongly suggests a 2-page BOM where only page 2 was sent in this extraction. This is separate from H9 and predates it — the extraction quality issue exists in the re-extraction path independent of the fuzzy merge fix.

#### 4. Code Deficiency Found: Re-Extraction Batch Missing bomRegion

**Bug:** The re-extraction batch path at `app.jsx:22481` constructs batch page objects WITHOUT `bomRegion`:

```javascript
// Re-extraction batch (line 22481) — MISSING bomRegion:
return{pageNumber:pg.pageNumber,croppedBomImage,croppedBomMediaType,notes};

// Initial extraction batch (line 12305) — INCLUDES bomRegion:
return{pageNumber:pg.pageNumber,croppedBomImage,croppedBomMediaType,notes,bomRegion:unit.bomRegion||null};
```

When `extractBomBatchViaServer` (line 10408) maps these pages, `pg.bomRegion` is `undefined` → `null`. The Cloud Function skips CropBox application. The AI sees the full PDF page instead of the focused BOM region.

**Impact on PRJ402104:** This bug means the AI saw the FULL page, not just the BOM region. For native PDFs this is likely neutral or beneficial (more content, not less). So this is NOT the direct cause of the 50→21 drop. However, for raster-origin PDFs where bomRegion increases effective DPI, the missing CropBox degrades extraction quality on re-extraction vs. initial extraction.

**Scope:** Affects ONLY the re-extraction batch path (line 22481). The feedback re-extraction path (line 22731) correctly passes `unit.bomRegion||null` via per-page extraction. The initial extraction batch path (line 12305) correctly includes `bomRegion:unit.bomRegion||null`.

**Fix:** Add `bomRegion:unit.bomRegion||null` to the return object at line 22481. One field, mechanical change.

**Promoted to H10.**

#### Summary

| Item | Verdict |
|------|---------|
| H9 itemNo guard | ✓ SIGNED OFF — all 3 target items recovered, zero false merges, zero gaps |
| keepA diagnostic fix | ✓ CLEAN — correctly tracks kept/dropped itemNo in merge report |
| 50→21 raw count drop | UNDETERMINED — most likely multi-page BOM with first page dropped. Requires Firestore page data + Cloud Function logs + re-run test. Separate from H9. |
| Re-extraction batch bomRegion | BUG — missing field at line 22481. Promoted to H10. |

### C15 — 2026-05-22 — Re-Extraction Verification Gap (CRITICAL)

**Finding: The re-extraction path silently discards per-page extraction verification. Items can go missing with zero user-visible signal. This is the root cause behind the PRJ402104 50→21 drop.**

#### The three-layer verification architecture (and where it breaks)

| Layer | What it does | Initial extraction | Re-extraction | Feedback re-extraction |
|-------|-------------|-------------------|---------------|----------------------|
| **1. Per-page verification** (`_parseAndVerifyBomRaw`, line 10278-10302) | Compares `detectedLineCount` vs `items.length`, detects missing items from start (minItemNo > 1), detects internal sequence gaps. Returns `extractionVerification` with status "ok" or "needs-review". | ✓ Computed AND read | ✓ Computed, **DISCARDED** | ✓ Computed, **DISCARDED** |
| **2. L3 retry** (lines 12364-12458) | Uses Layer 1's "needs-review" status to trigger broad retry (Phase 1) and targeted gap-fill (Phase 2). | ✓ Present | ✗ Missing (H7) | ✗ Missing (correct — would replace user feedback) |
| **3. Final gap check** (lines 12603-12614 / 22584-22589) | Detects internal sequence gaps in the assembled BOM. | Internal gaps only | Internal gaps only | Internal gaps only |

**Layer 1 is computed in all paths** because it's inside `extractBomPage` → `extractBomPageViaServer` → `_parseAndVerifyBomRaw` (line 10401) and `extractBomBatchViaServer` → `_parseAndVerifyBomRaw` (line 10425). But the re-extraction path at lines 22504-22511 only takes `result.items`:

```javascript
// Re-extraction batch hit (line 22504-22506):
result=_reBatchResults[unit.pageNumber];
// Re-extraction per-page fallback (line 22508):
result=await extractBomPage(unit.dataUrl,"",notes,...);
// Both then do:
const items=translateItemsToPageCoords(result.items||result||[],unit.cropBounds);
// ← result.extractionVerification is NEVER READ
```

**Layer 3 is structurally weaker than Layer 1.** Both initial and re-extraction final gap checks use the same algorithm: iterate sorted item numbers, detect gaps between consecutive values. Neither checks for missing items from the start. But Layer 1 (`_parseAndVerifyBomRaw`) DOES:

```javascript
// _parseAndVerifyBomRaw, line 10292-10295:
const minItemNo=sorted[0];
if(minItemNo>1){
  verification.status="needs-review";
  verification.missingFromStart=minItemNo-1;
  for(let g=1;g<minItemNo;g++)verification.sequenceGaps.push(g);
}
```

For PRJ402104 post-H9 re-extraction (items 27-47):
- **Layer 1 would have flagged:** minItemNo=27 > 1 → status="needs-review", missingFromStart=26, sequenceGaps=[1,2,...,26]. *But this was discarded.*
- **Layer 2 would have retried:** "Items 1..26 appear to be MISSING from your previous read — the smallest itemNo you returned was 27." *But L3 doesn't exist in re-extraction.*
- **Layer 3 computed:** items 27,28,29,...,47 are consecutive → _reSeqGaps=[] → no warning.

The BOM finalized at 21 items with zero flags. It went through pricing and BC sync without any indication that 26 items were missing.

#### Why this is worse than H7

H7 was scoped as "add L3 retry to re-extraction path" — bringing Layer 2 to re-extraction. But **Layer 2 depends on Layer 1 being read.** Currently, even if L3 retry code were added to the re-extraction path, it would need to read `result.extractionVerification` to know when to trigger. The verification is computed but thrown away.

The real fix has three components:

1. **Read the verification** — capture `result.extractionVerification` in the re-extraction path (line 22504-22511) and the feedback re-extraction path (line 22729-22732)
2. **Act on verification** — either retry (L3, for re-extraction) or at minimum flag the BOM as unverified
3. **Fix the final gap check** — add missing-from-start detection to the final gap algorithm (lines 12603-12614 and 22584-22589), so Layer 3 catches what Layer 1 caught

Component 1 is a prerequisite for H7. Component 3 is independent and can land immediately — it's the same 4-line check from `_parseAndVerifyBomRaw` applied to the final BOM.

#### Why the final gap check misses edge items

Both initial and re-extraction final gap checks iterate from `sortedNos[0]` to `sortedNos[last]`:

```javascript
for(let i=0;i<sortedNos.length-1;i++){
  if(sortedNos[i+1]-sortedNos[i]>1){
    for(let g=sortedNos[i]+1;g<sortedNos[i+1];g++)finalSequenceGaps.push(g);
  }
}
```

This detects a gap between items 27 and 30 (would flag 28, 29) but does NOT detect:
- Missing items before the minimum (items 1-26 when BOM starts at 27)
- Missing items after the maximum (items 48-50 if BOM ends at 47 but should go to 50)

The `_parseAndVerifyBomRaw` per-page check adds the missing-from-start detection. A complete fix would add both start AND end detection to the final check, but start detection is the higher-priority case (the symptom that exposed this gap).

#### Additional code deficiency: re-extraction batch missing bomRegion

Separately from the verification gap, the re-extraction batch path at `app.jsx:22481` constructs batch pages WITHOUT `bomRegion`:

```javascript
// Re-extraction batch (line 22481) — MISSING bomRegion:
return{pageNumber:pg.pageNumber,croppedBomImage,croppedBomMediaType,notes};

// Initial extraction batch (line 12305) — INCLUDES bomRegion:
return{pageNumber:pg.pageNumber,croppedBomImage,croppedBomMediaType,notes,bomRegion:unit.bomRegion||null};
```

The AI gets the full PDF page instead of the focused BOM region. For native PDFs this is likely neutral (full text access). For raster PDFs, the missing CropBox means lower effective DPI on the BOM area — potential quality degradation on re-extraction vs. initial extraction.

**Fix:** Add `bomRegion:unit.bomRegion||null` to line 22481.

#### Root cause of PRJ402104 50→21 drop: refined assessment

With the verification gap understood, the 50→21 drop is explained as follows:

1. The AI (for whatever reason — non-determinism, multi-page skip, or model behavior) extracted only items 27-47 on this re-extraction run
2. Per-page verification correctly flagged this as "needs-review" (minItemNo=27, missing 1-26)
3. The re-extraction path discarded the verification
4. No retry was available (no L3)
5. The final gap check found no internal gaps in 27-47
6. The BOM was saved with 21 items, zero flags

**The verification system worked.** It correctly identified the problem at Layer 1. The failure is that Layer 1's output was discarded by the re-extraction path, and Layer 3 is too weak to catch edge-item losses.

Whether the AI's 21-item result was a one-off (non-determinism) or reproducible (multi-page skip, page misclassification) is secondary. The architectural gap is that the re-extraction path has no safety net for ANY undercount failure, regardless of cause. The initial extraction path handles this with L3 retry + verification. The re-extraction path handles it with nothing.

#### H10 Scope (finalized per Jon 2026-05-22)

H7 absorbed into H10. The re-extraction path lacks multiple safety mechanisms that share the same root cause (re-extraction was built as a simpler code path and never got parity with initial extraction). Fix as one coherent architectural improvement:

1. Add `bomRegion` parameter to re-extraction batch payload (line 22481)
2. Read `result.extractionVerification` on per-page results in re-extraction path
3. Add missing-from-start detection (`minItemNo > 1` check) to final gap algorithm
4. Fire L3 retry/gap-fill when `status === "needs-review"`
5. Store per-page verification in re-extraction report
6. Add L3 report fields (`l3MergeRecovered`, `l3GapFillRecovered`) to re-extraction report builder
7. Refactor L3 logic into shared function (Approach B from H7-PLAN.md — validated in C11)

Monday work. Plan will be drafted then.

#### Meta-observation: "check fires but result discarded" failure class

C15's root cause is a pattern worth watching for elsewhere in the codebase: **a validation or check runs correctly, produces the right answer, but nothing reads the result.** The check provides a false sense of safety — it exists in the code, so it looks like the path is covered, but the output is silently dropped.

This is distinct from "check is missing" (easy to find — grep for the function name, count call sites) and from "check has a bug" (the logic itself is wrong). In the "result discarded" pattern, the check is present, correct, and called — the failure is in the *consumer*, not the *producer*.

**Why it's hard to spot in review:** A code reviewer sees `extractBomPage(...)` called in the re-extraction path, knows that `extractBomPage` internally calls `_parseAndVerifyBomRaw`, and reasonably concludes the path is verified. The gap is that the re-extraction path destructures only `result.items` and ignores `result.extractionVerification`. This requires tracing the return value through the caller, not just the callee.

**Where else to look (not investigated, not urgent — just a note for future sessions):**
- Any shared function that returns a rich object (items + metadata + diagnostics) where some callers only use a subset of the fields
- The feedback re-extraction path (lines 22719-22758) — same code pattern as re-extraction, likely same gaps
- `filterNonBomRows` returns `{kept, dropped}` — do all callers use `dropped` for diagnostics?
- `fuzzyMergeBomItemsWithReport` returns `{items, merges}` — do all callers capture `merges` for the report?

This is not an action item. It's a class of failure mode to keep in peripheral vision during future code review.

### C13 — 2026-05-22 — H9-PLAN.md Coach Review

**Verdict: APPROVE — no blocking issues. One minor documentation nit. Ready for implementation.**

This is the cleanest plan CCD has produced. Single predicate, well-defined insertion point, comprehensive edge cases, correct risk asymmetry argument. The H6 pattern (add a guard predicate to a permissive merge function) is proven and this is a faithful application.

#### 1. itemNo reliability at the fuzzy merge stage — CONFIRMED

Traced the pipeline from AI output through fuzzy merge entry:

| Stage | What happens to itemNo |
|-------|----------------------|
| AI extraction | Assigns `itemNo` from drawing's BOM table |
| `translateItemsToPageCoords` | Spreads all fields — `itemNo` preserved |
| `positionalMergeBomItems` | Winner is `{...winner, id:base.id, ...}` — winner's `itemNo` preserved |
| Exact PN dedup (line 12571) | Groups by normalized PN. First item's fields kept via `map[key]={...item}`. Subsequent same-PN items only contribute qty. `itemNo` preserved on the surviving item. |
| **→ `fuzzyMergeBomItemsWithReport`** | Items have their original `itemNo` from AI |

IDEC variants (RH1B-ULC-120 vs RH2B-ULC-120) have different normalized PNs (`RH1BULC120` vs `RH2BULC120` via `_bomNormPn`), so they survive exact dedup as separate items, each retaining their original `itemNo`. Confirmed by PRJ402104 data: 44/50 items have `itemNo`, the 6 without are labor/contingency/crate/buyoff.

#### 2. v1.19.642 description override interaction — CLEAN

The proposed placement (after line 9220, before line 9237) means the code flow is:

1. Short PN skip (9211)
2. Exact match skip (9218)
3. Length delta (9220)
4. **→ itemNo guard (NEW)** — different non-empty itemNos → `continue`
5. Y-position guard + description override (9237-9250)
6. Edit distance (9252-9255)
7. Signal gates (9258-9264)
8. Merge (9265-9291)

Items with different itemNos are blocked at step 4 and NEVER REACH the description override at step 5. This is the correct ordering — the v1.19.642 override was defeating the Y-guard for exactly the items the itemNo guard now protects.

**The override's original intent is preserved:** AI-hallucinated duplicate rows (same BOM row read twice with slight PN variation) would have the SAME itemNo in both readings. The itemNo guard doesn't fire (same value), and the description override correctly catches and merges them. Product-family variants (different rows, different itemNos, identical descriptions) are blocked before the override can enable the false merge.

This is a clean separation of concerns: itemNo distinguishes "different items," the description override distinguishes "same item read twice."

#### 3. Legitimate cross-itemNo fuzzy merges — NONE EXIST

Different itemNos on a BOM drawing means different line items, by definition. Scenarios considered:

- **Same part at multiple item numbers** (e.g., SH3B-05C at items 62 and 64): These are distinct BOM lines with different quantities, different tags, different panel locations. They must NOT merge. The current bug merges them; the guard prevents it.
- **AI misreads item number** (e.g., reads item 25 as item 26): This would give two items with itemNo "26" (the real 26 and the misread 25). They have the SAME itemNo → guard doesn't fire → falls through to existing gates. The edit distance check handles whether the PNs are similar enough. Correct behavior.
- **Retired quadrant extraction path** (different quadrant reads same row): `translateItemsToPageCoords` normalizes coordinates, so same-row items from different quadrants end up at the same y_top → positional dedup catches them BEFORE fuzzy merge.

No production scenario produces items with different itemNos that should fuzzy-merge.

#### 4. 10-panel coverage in test plan — ADEQUATE

Section 6.1 lists all 10 panels with PRJ402104 having specific items (27, 28, 30). The other 9 are validated by running the adapted `reproduce-fuzzy-merge.js` with the guard applied. This is an automated test that checks all 22 dropped items across all 10 panels — the script provides per-panel specificity even though the plan document doesn't enumerate it.

Section 6.2 (legitimate OCR dedup) and 6.3 (items without itemNo) cover the guard's fall-through behavior. Section 6.4 (live re-extraction of PRJ402104) provides end-to-end validation. Section 6.5 (single-column regression) catches unintended interactions. Comprehensive.

#### 5. Edge cases — 7 enumerated, 1 minor documentation error

Edge cases 1-5 and 7 are correctly analyzed. Edge case 6 has a nit:

**Edge case 6: itemNo "0"** — CCD says "Normalizes to '0' or empty string — falls through." This is wrong. `"0".replace(/\D/g,"")` = `"0"`, which is truthy in JavaScript (string `"0"` is truthy, unlike number `0`). So itemNo "0" does NOT fall through — it's treated as a real itemNo. Two items with itemNo "0" would compare equal (fall through, correct). An item with itemNo "0" vs itemNo "25" would be blocked (different values).

**Impact: zero.** BOM items use positive integer numbering (1, 2, 3, ...). ItemNo "0" doesn't occur in practice. The documentation is wrong but the code behavior is harmless.

#### 6. Risk asymmetry — HOLDS

Same argument as H6, applied correctly:

| Failure mode | Visibility | User action | Risk |
|-------------|-----------|-------------|------|
| Guard too strict (blocks legitimate merge) | Duplicate item visible in BOM | User deletes the duplicate | Low — 5 seconds to fix |
| Current bug (no guard) | Item silently dropped from BOM | User can't see what's missing | High — wrong quote, wrong order |

The worst case of the fix (visible duplicate) is strictly better than the current state (invisible data loss). This asymmetry is the same one that justified H6's x_left guard and it holds equally well here.

#### Summary

| Criterion | Verdict | Notes |
|-----------|---------|-------|
| itemNo reliability at fuzzy merge | Confirmed | Survives all upstream stages unchanged |
| v1.19.642 override interaction | Clean | Guard fires before override; override's intent preserved |
| Legitimate cross-itemNo merges | None exist | Different itemNos = different items by definition |
| 10-panel test coverage | Adequate | Script validates all 22 items; live test on PRJ402104 |
| 7 edge cases | Complete | Nit: edge case 6 ("0" falls through) is wrong but inconsequential |
| Risk asymmetry | Holds | Duplicates visible, missing items invisible |

**Recommendation:** Implement as written. The only action item is fixing the edge case 6 documentation in the plan (optional — it's a nit, not a code issue).

### C12 — 2026-05-22 — Fuzzy merge silent data loss: IDEC product-family variants (CRITICAL)

**Finding:** `fuzzyMergeBomItemsWithReport` (`app.jsx:9205-9297`) is silently dropping legitimate BOM items across production drawings. The function merges items whose normalized part numbers differ by ≤ threshold edit-distance, have the same manufacturer, and have similar descriptions. This correctly catches OCR variants (e.g., `RH1BULC120` misread as `RH1BULCI20`) but incorrectly merges **product-family variants** where a single character distinguishes genuinely different parts.

#### Root cause

IDEC relay/socket product families encode the pole count in a single character:

| Part Number | Normalized | Product | Poles |
|-------------|-----------|---------|-------|
| RH1B-ULC-120 | `RH1BULC120` | Relay | 1-pole (SPDT) |
| RH2B-ULC-120 | `RH2BULC120` | Relay | 2-pole (DPDT) |
| RH3B-ULC-120 | `RH3BULC120` | Relay | 3-pole (3PDT) |
| SH1B-05C | `SH1B05C` | Socket | 1-pole |
| SH2B-05C | `SH2B05C` | Socket | 2-pole |
| SH3B-05C | `SH3B05C` | Socket | 3-pole |
| SH4B-05C | `SH4B05C` | Socket | 4-pole |

These pass every merge gate:

1. **Edit distance:** `RH1BULC120` vs `RH2BULC120` = 1 (threshold=2 for maxLen=10). `SH1B05C` vs `SH2B05C` = 1 (threshold=1 for maxLen=7). All within threshold.
2. **Manufacturer match:** All IDEC → `mfrMatch=true`.
3. **Description match:** All share identical descriptions after normalization (e.g., "RELAY, FINGERSAFE TERMINALS, DPDT" or "SOCKET, FINGER-SAFE").
4. **Y-position guard override:** Items are at different Y positions on the drawing (different rows), but the Y-guard (`yDiff > 0.008`) is overridden when descriptions are identical after normalization (`descIdentical` check at line 9265-9270, added in v1.19.642). Since IDEC variants share identical descriptions, the Y-guard — the last line of defense — is bypassed.

The merge keeps the first item encountered and drops subsequent variants. The dropped items' `itemNo` values disappear from the final BOM, creating `finalSequenceGaps`.

#### Production impact

**10 panels affected, 22 items total incorrectly dropped.** All false merges are IDEC relay/socket product-family variants. Verified via `tests/extraction-baseline/reproduce-fuzzy-merge.js` (global Firestore scan) and `tests/extraction-baseline/check-merged-itemnos.js` (PRJ402104 detail).

PRJ402104 specific losses:
- Item 27: `RH2B-ULC-120` (2-pole relay) merged into item 25 `RH1B-ULC-120` (1-pole relay)
- Item 28: `SH2B-05C` (2-pole socket) merged into item 26 `SH1B-05C` (1-pole socket)
- Item 30: `SH3B-05C` (3-pole socket) merged into item 26 `SH1B-05C` (1-pole socket)

#### This is a missing-guard problem, not a threshold problem

Tightening edit-distance thresholds would break legitimate OCR dedup (the function's primary purpose). The real issue is that the function has no concept of item identity. Two items with **different item numbers on the drawing** are, by definition, different items — regardless of how similar their part numbers look. The Y-guard was intended to catch this, but the v1.19.642 identical-description override defeated it for exactly the product families where it matters most.

#### Proposed fix: itemNo guard

Add an itemNo guard to `fuzzyMergeBomItemsWithReport`, analogous to H6's x_left guard for `positionalMergeBomItems`:

```
// Inside the inner loop, after the consumed check (line 9238)
// and before the normalization (line 9239):
const itemNoA = String(base.itemNo || base.item || "").replace(/\D/g, "");
const itemNoB = String(b.itemNo || b.item || "").replace(/\D/g, "");
if (itemNoA && itemNoB && itemNoA !== itemNoB) continue;
```

Items with different non-empty itemNo values should never fuzzy merge. Items without itemNo (labor, contingency, crate, job-buyoff — 6 of 50 rows in PRJ402104) still merge normally.

**Why itemNo is reliable at this pipeline stage:** The fuzzy merge runs after positional dedup and exact-PN dedup, both of which preserve itemNo. Verified via `check-merged-itemnos.js`: 44 of 50 BOM items in PRJ402104 have itemNo; the 6 without are all non-material rows (labor, contingency, crate, job-buyoff) that wouldn't have product-family variants anyway.

#### Connected finding: L3 blindspot explained

C4/C11 investigated why L3 (retry/gap-fill) never fired in production despite 7 panels having `finalSequenceGaps`. Answer: **all sequence gaps originate from fuzzy merge, not from AI extraction misses.** For every affected panel, `rawCount === exactCount` — the AI extracted a gap-free sequence, then fuzzy merge introduced the gaps. L3 checks the raw AI output for gaps (via `_parseAndVerifyBomRaw`), finds none, and doesn't fire.

This means:
1. H7 (adding L3 to re-extraction) is still correct but lower priority than H9 — L3 can't recover items that fuzzy merge will drop downstream.
2. H9 must land before H7 for the safety net to be meaningful. Fix the data loss first, then extend the safety net.

#### Test plan

1. Extract PRJ402104 on H9-fixed code. Verify items 27, 28, 30 survive in final BOM.
2. Verify no regression on OCR dedup — items with same itemNo but different PNs (actual OCR errors) should still merge. Pick a panel with known OCR merges from the `reproduce-fuzzy-merge.js` output (if any are legitimate).
3. Global check: re-run `reproduce-fuzzy-merge.js` logic against post-fix code to confirm zero false merges.

#### Severity and priority

**CRITICAL.** This is actively losing customer BOM items in production with no user-visible signal. The items simply vanish from the quote. Unlike H6 (which duplicated items — visible oddity), H9 deletes items — invisible until someone manually compares the quote to the drawing. Analogous to H6 in fix complexity (single guard, well-defined insertion point) but higher business impact.

**Recommendation:** H9 should be the next implementation item, ahead of H7. Single function, single predicate, clear test case. Implement, verify on PRJ402104, deploy.

### C16 — 2026-06-03 — Cross-Project BOM Contamination (CRITICAL, TODO #86)

**Symptom:** Noah reported PRJ402111's BOM populated with PRJ402119's data. Different project, wrong BOM — customer-facing data integrity failure.

**Investigation timeline:**

1. **Initial hypothesis (Marc): extraction pipeline leak.** Marc investigated all extraction code paths — PDF storage paths (`originalPdfs/{uid}/{projectId}/...`), Cloud Function validation, prompt caching, Firestore saves. All correctly project-scoped. No cross-project leak in the extraction pipeline itself.

2. **Second hypothesis (Marc): `_pendingPagesCache` panel ID collision.** Marc identified that `_pendingPagesCache` (app.jsx:433) is keyed by `panelId` alone. All single-panel projects share `panel-1`. If a user drops files on PRJ402119's panel, navigates away without extracting, then opens PRJ402111, the cache would serve PRJ402119's pages to PRJ402111's panel. This was a valid secondary vector but not the primary cause.

3. **Confirmed root cause: stale extraction callback + reused `<ProjectView>`.** `<ProjectView>` had no `key` prop — React reused the same component instance when the user navigated between projects. When PRJ402119's extraction completed after the user switched to PRJ402111, the `onDone` callback wrote PRJ402119's BOM into PRJ402111's React state via the `onUpdate` → `setProject(prev => ...)` chain. `prev` was PRJ402111's data; the panel-map matched on the colliding `panel-1` ID. Auto-pricing then persisted the contaminated data via `onSaveImmediate`.

**Why the two analyses differed:** Marc's initial extraction pipeline investigation was correct — extraction IS project-scoped. The contamination happened at a different layer: React state management after async completion. This is a class of bug where the async operation is correct but the completion handler writes to the wrong target because the UI context changed during execution.

**Key insight:** Firestore saves inside `runExtractionTask` were always clean (captured `projectId` in closure). The contamination path was: `onDone` → `onUpdate(panel)` → `setProject(prev => prev.panels.map(p => p.id === panel.id ? panel : p))` → panel ID collision → wrong project's state updated → auto-pricing → `onSaveImmediate` → Firestore.

**Fixes applied:**
- (A) `key={openProject.id}` on `<ProjectView>` — forces unmount/remount on project switch, killing all stale closures
- (B) `_extractionProjectId` guard in `onDone` — defense-in-depth that blocks `onUpdate` if active project changed

**Follow-up:**
- TODO #87 — Panel ID uniqueness (generate `panel-${Date.now()}-${random}` instead of sequential `panel-1`)
- TODO #88 — Async ownership audit across all long-running operations
- CLAUDE.md — Added "Async Project Ownership Rule" as an architectural constraint
- `DIAGNOSTIC-CROSS-PROJECT-CONTAMINATION.md` — Full incident report

**Verification status:** Hotfix deployed. PRJ402111 re-extracted with correct data. Cross-project navigation during extraction no longer causes contamination.

### C17 — 2026-06-03 — #92 Background Task UI Ownership Audit (COMPLETE)

**Scope:** All async/background completion handlers in `src/app.jsx`. Also closes #91 (extraction-completion subset).

**Method:** Enumerated 48 handlers across 9 categories (extraction, pricing, BC sync, archive/restore, copy, portal apply, onSnapshot listeners, module-scoped caches, URL deep-links). Classified each on two axes: UI behavior (does it seize foreground?) and identity resolution (does it write to the correct entity?).

**Results:** `92-UI-OWNERSHIP-AUDIT.md`
- 42 SAFE, 4 GUARD-NEEDED, 2 UNSAFE-UI, 2 UNSAFE-IDENTITY
- UNSAFE-IDENTITY: `_pendingPagesCache` (line 433) and `_bgTasks` (line 421) — both keyed by `panelId` alone, collide across projects with `panel-1`
- UNSAFE-UI: `handleRestoreComplete` (44917), `CopyProjectModal.onCopied` (45326), `autoOpenPortal` edge case (34854) — navigate without focus guard
- GUARD-NEEDED: pricing/validation progress bars (cosmetic, data writes are correct)
- #91 closed: all 12 extraction-completion functions are SAFE on both axes post-#86

### C18 — 2026-06-03 — #92 Phase 1 Detailed Plan: Cache Re-Key (H1 + H2)

**Scope:** Re-key `_pendingPagesCache` and `_bgTasks` from `panelId` to `${projectId}:${panelId}`.

**Key findings:**
1. Both caches are purely in-memory (module-scoped `let`). No persistence, no migration needed.
2. `_pendingPagesCache`: 3 accessor functions gain `projectId` param, 5 write sites + 1 read site — all inside PanelCard where `projectId` is a prop. No blockers.
3. `_bgTasks`: ~50 write sites (bgStart/bgSetPct/bgUpdate/bgDone/bgError callers) + 1 key-based read site. All have `projectId` in scope. Introduced `_bgKey(projectId, panelId)` helper to avoid inline construction at 50+ sites.
4. PanelCard already has a partial guard at line 22422 (`bgTaskIsForThisProject = bgTask.projectId === projectId`) — this becomes redundant after re-key and can be removed.
5. Re-key fully closes H1 contamination vector independent of #87. #87 can downgrade from MEDIUM to LOW (defense-in-depth, no longer data-integrity risk).

**Plan:** `92-PHASE1-DETAILED-PLAN.md`. Single atomic commit (~70 lines). Test plan included with pre-fix repro steps.

**Closure (2026-06-03):** v1.20.93 (a6906355). Marc implemented per plan. Pre/post-fix repro validated.
- #92 Phase 1: CLOSED. Cache re-key shipped.
- #91: CLOSED. All 12 extraction handlers SAFE; subsumed by #92 audit.
- #87: DOWNGRADED MEDIUM → LOW. Re-key closes contamination independent of panel-ID uniqueness.
- #92 Phase 2: OPEN, queued — D2 (`handleRestoreComplete`) + E1 (`CopyProjectModal.onCopied`) UNSAFE-UI focus guards.
- #92 Phase 3: OPEN, queued — portal auto-open edge case (verify-first, may close as cannot-reproduce).
- B1/B4: OPEN, low-priority cosmetic — pricing progress-bar flicker on panel switch.

### C19 — 2026-06-03 — BOM Write-Paths Map (for BOM-revert investigation)

Read-only enumeration of every code path that writes the panel BOM array. 24 writers classified across 4 categories (user-initiated synchronous, async completion, automated/periodic, onSnapshot echo). Traced two flows end-to-end: price edit and delete. Ranked stale-snapshot-capable writers by risk.

**Key finding:** `saveProjectPanel` does NOT set `updatedBy`, leaving the onSnapshot echo guard (line 34836: `remote.updatedBy !== uid`) open for same-user writes when the doc's `updatedBy` was set by a different user (e.g., Jon's uid on docs Noah is editing). Ranked W9 (`runPricingOnPanel`) as #1 stale-snapshot risk, but the `updatedBy` gap was the confirmed root cause.

**Deliverable:** `BOM-WRITE-PATHS-MAP.md`

### C20 — 2026-06-03 — BOM Revert Fix Plan (updatedBy gap)

Detailed Plan for the one-line fix: add `updatedBy: uid` to `liveProject` in `saveProjectPanel` (line ~8887). Enumerated all 22 `saveProjectPanel` call sites with per-caller echo-impact verdict — all safe. Three completeness checks answered: (1) W24 `notifyProjectListeners` is inert for this bug (user edits pass `skipNotify=true`). (2) "Quotes drop fields" is a different root cause (write-side staleness in `saveProject`, not echo). (3) Multi-user echoes unaffected (different uid → guard still passes).

**Deliverable:** `BOM-REVERT-FIX-PLAN.md`. Awaiting Jon approval → Marc implements.

### C21 — 2026-06-03 — PRJ402119 Extraction Regression Findings

Read-only investigation of PRJ402119 returning empty BOM. Recovered current repo state: #82 P1/P2 (COMMITTED to `functions/index.js`, deployment unconfirmed), #83 (OPEN, never implemented), H10 (OPEN, never shipped), zero-BOM warning (shipped, fires visibly).

**Prime suspect:** #82 P1/P2 fixes are committed to `functions/index.js` but there is no repo-record evidence that `firebase deploy --only functions` was run. Production Cloud Function likely running pre-fix code — the `noBomReason` escape is still offered, model bails on scanned bitmap. Scanned PDFs always route to `pdf-native` (because `originalPdfPath` is present), and the JPEG+P2 fallback only fires when `originalPdfPath` is absent.

**Runtime confirmation needed:** Check `panel.extractionReport.extractionPath` — if `pdf-native` with `rawCount: 0`, confirms undeployed fix hypothesis. #92 re-key ruled out (extraction pipeline doesn't consume `_pendingPagesCache` directly).

**Deliverable:** `PRJ402119-EXTRACTION-REGRESSION-FINDINGS.md`

### C23 — 2026-06-03 — PRJ402119 Line 1 dataUrl Gating Bug (CONFIRMED + VALIDATED)

**Root cause confirmed:** Three filter sites on the initial extraction path (`confirmAndExtract` line 23353, `runExtractionTask` line 13512, zoom detection line 23242) gated BOM page inclusion on `&& p.dataUrl` — an ephemeral field stripped on every Firestore save. The re-extract path, validation path, and every other extraction-adjacent path correctly used `(p.dataUrl || p.storageUrl)` + `ensureDataUrl`. The asymmetry was a code defect, not a design choice.

**Marc's trace:** Ruled out all 3 prior hypotheses (pages 3-4 were BOM-typed with AI regions; first extraction not re-extract; regions correct). Fourth path — the dataUrl filter — was the root cause.

**Fix design (C23):** Three filter changes + one `ensureDataUrl` insertion, ~6 lines. Extraction Path Change Protocol applies (6 rules). Sites A+B implemented by Marc (v1.20.95), Site C carved out as #94a.

**Validated in production (v1.20.95):** Jon ran extraction on Line 1 fresh-loaded (storageUrl-only pages). All 13 source items extracted (0 items pre-fix). Inclusion fix confirmed.

**Notable:** #84's two symptoms (last-row truncation on LNM40BPK100, companion-part miss on TYD2CW6) were BOTH ABSENT on this run — both items came through. May have been artifacts of the prior image path (in-memory addFiles render) rather than systematic failures. #84 updated: not-reproduced pending further evidence.

**New finding — TODO #95 (HIGH):** PN accuracy errors on the post-#94 extraction. Error scoring NOT settled — ground truth itself is in dispute (three conflicting source readings: Jon's screenshot, Marc's drawing zoom, extracted PN). The Claudes are misreading the drawing at approximately the rate they attribute to the model.

**Unambiguous errors** (3 items — PN doesn't match its own description): Item 8 TYD15X3/4PWS→MPWS (compound PN mangled), Items 12-13 LNM→LNMQ (phantom Q insertion). **Contested** (5+ items — digit-level disputes unadjudicated, including Item 10 where extracted value is likely CORRECT and Marc's source transcription was the error).

**Two hypotheses, both OPEN:** (1) Path/image fidelity — digit substitutions suggest vision model reading a rendered image, not text layer. Marc asserted "PDF-native vector text" but this needs verification: what does the model actually receive? (2) ARC Cross / auto-replace — structural errors (MPWS, LNMQ) may be raw model output or downstream swap. Raw model output has NOT been inspected.

**Action required before scoring:** Authoritative ground-truth PN list from Jon/engineering source. **Next-session trace:** Marc to confirm model input (image vs text, resolution) then trace Item 8 (MPWS) end-to-end: raw model output → parsed → normalization → ARC Cross → BC lookup → final UI.

### C24 — 2026-06-04 — #97: Slash-Split × Positional-Dedup Destructive Interaction (CRITICAL, DETERMINISTIC)

**Finding:** The companion-PN slash-split in `_parseAndVerifyBomRaw` (line 11643) creates sibling rows with identical spatial coordinates. Positional dedup (line 10629) invariably merges them, and `scoreItem` (line 10689) selects the WRONG sibling — the sub-part fragment — because the appended `" (sub-part from above)"` suffix (+22 chars) gives it a higher description-length score. The main part number is silently destroyed. This is deterministic, silent, and customer-facing.

**Proven in production:** PRJ402119 Line 1 Item 8. Drawing PN `TYD15X3WPW6` (no slash in source). Model fabricated a `/` in its output → slash-split fired → two siblings at y_top=0.916 → positional dedup merged them → sub-part "MPWS" survived, main PN destroyed. All transform flags negative (isCrossed/isCorrection/correctedByLibrary undefined, priceSource "ai"). rawCount 14 → exactCount 13: the positional merge is the only explanation for the dropped row.

#### Verification 1 — `{...item}` spread copies spatial coords to all segments

**CONFIRMED.** Line 11649:
```js
expanded.push({...item,partNumber:segments[si],description:desc});
```
The spread copies ALL fields from the original item — `y_top`, `y_bottom`, `x_left`, `x_right` — then overrides only `partNumber` and `description`. After the per-page loop at line 13870 adds `sourcePageIdx:pgIdx`, all split siblings share identical spatial identity: same `y_top`, `y_bottom`, `x_left`, `x_right`, `sourcePageIdx`.

The synthetic-coordinate assignment at lines 11657-11665 is a no-op here because the original item has real `y_top` from the model (numeric, not NaN) — the spread preserves it.

#### Verification 2 — Positional dedup merges split siblings at ΔY=0

**CONFIRMED.** Split siblings pass every merge gate:

| Gate | Line | Check | Split siblings | Result |
|------|------|-------|----------------|--------|
| Has y_top/y_bottom/sourcePageIdx | 10638 | All three present | Same values from spread | **PASS** → enters `withY` |
| Same page | 10671 | `b.sourcePageIdx !== base.sourcePageIdx` | Identical | **PASS** |
| Same column | 10675 | `\|b.x_left - base.x_left\| > X_TOL(0.15)` | Δ=0 | **PASS** |
| Same Y | 10677 | `\|b.y_top - base.y_top\| > Y_TOL(0.004)` | Δ=0 | **PASS** |
| Same height | 10682 | `\|b.y_bottom - base.y_bottom\| > Y_TOL*2(0.008)` | Δ=0 | **PASS** |

All five gates pass trivially at Δ=0. Siblings are merged unconditionally.

#### Verification 3 — scoreItem makes the sub-part win

**CONFIRMED.** `scoreItem` at lines 10689-10696:
```js
return s + ((it.partNumber||"").length * 0.01) + ((it.description||"").length * 0.005);
```

The integer part (`s`) is identical for both siblings — same manufacturer, itemNo, qty, both have non-empty PN and description. The tiebreaker reduces to:

- PN length contribution: `seg0_PN.length × 0.01` vs `seg1_PN.length × 0.01`
- Description length contribution: `desc.length × 0.005` vs `(desc.length + 22) × 0.005`

The sub-part's description bonus is always `22 × 0.005 = +0.11`. The main part's PN advantage is `(seg0.length - seg1.length) × 0.01`. The sub-part wins whenever the main part's PN is fewer than 11 characters longer — which is virtually always for two halves of a single slash-split PN.

For the PRJ402119 case: any split producing "MPWS" (4 chars) as segment 1 gives the sub-part +0.11 from the description suffix minus 0.01×(seg0.length - 4) for the PN difference. Even if segment 0 were 14 chars (e.g., `TYD15X3WPW6XX`, 13 chars), the PN advantage would be `(13-4) × 0.01 = 0.09 < 0.11`. Sub-part wins.

#### Additional finding: positional dedup drops are unreported

`posMerges` is accumulated at line 10701 and logged to console at line 10707, but `positionalMergeBomItems` returns only `[...merged,...withoutY]` at line 10711. The merge data is discarded. This is why the drop appears as "NO entry in exactMerges/nonBomRowsFiltered/fuzzyMerges" — positional dedup is the ONLY merge stage without a reporting channel:

| Stage | Returns merge data? |
|-------|-------------------|
| Positional dedup (`positionalMergeBomItems`, L10629) | **NO** — `posMerges` local, discarded |
| Exact-PN dedup (inline, L13922) | Yes — `exactMerges` array, flows to `mergeStats` |
| Fuzzy merge (`fuzzyMergeBomItemsWithReport`, L10517) | Yes — `{items, merges}`, flows to `mergeStats.fuzzyMerges` |

#### Fix Design

**(i) Remove the slash-split from `_parseAndVerifyBomRaw`**

**Recommendation: REMOVE (lines 11640-11651).**

The slash-split is redundant, unsafe, and unsalvageable:

1. **Redundant.** `splitCompanionParts` (L10826, step 10 in the pipeline) handles companion-part splitting safely — it runs POST-DEDUP (after positional, exact, and fuzzy merge), consumes the structured `additionalPartNumbers` field (the AI's authoritative companion channel), and validates candidates via `_looksLikeCompanionPn` (4+ chars, letter+digit mix, not a ref designator, not a spec keyword).

2. **Unsafe.** The slash-split runs PRE-DEDUP (inside `_parseAndVerifyBomRaw`, step 1). Its siblings have identical spatial coords, so positional dedup at step 4 invariably merges them. The `scoreItem` tiebreaker reliably picks the wrong sibling. The interaction is deterministic and produces silent data loss.

3. **Cannot distinguish legitimate `/` from companion `/` from fabricated `/`.** Many catalog numbers legitimately contain `/` — dimensional separators (`TYD15X3/4PWS` = 3/4 inch), voltage ratings, model variants. The regex `pn.split(/\s*\/\s*|\s*,\s*/)` splits ALL of them. The only way to tell a legitimate `/` from a companion separator is semantic understanding of the part number family — something only the model (via `additionalPartNumbers`) or the structured `splitCompanionParts` can do.

4. **The BOM_PROMPT is contradictory.** Line 90 says "output a SEPARATE row for each" (which the slash-split duplicates). Lines 111-116 say "additional parts: additionalPartNumbers entries" (which `splitCompanionParts` consumes). The prompt instructs two different behaviors for the same input. When the model follows lines 111-116 (uses `additionalPartNumbers`), the slash-split is inert. When the model follows line 90 (separate rows with slash in PN), the slash-split fires redundantly — and destructively. The code should follow the structured path and ignore the unstructured one.

**Coverage gap analysis:** If the slash-split is removed, what companion splits are lost?

| Source | Slash-split catches? | `splitCompanionParts` catches? | Gap? |
|--------|---------------------|-------------------------------|------|
| `additionalPartNumbers` array | No | Yes (L10839-10853) | No |
| Description with companion keyword | No | Yes (L10854-10879) | No |
| Slash in `partNumber` field, model followed line 90 prompt | Yes → then destroyed by dedup | No — doesn't scan PN for slashes | **Theoretically yes, practically no** |

The theoretical gap (model puts "PN-A / PN-B" in partNumber, doesn't populate additionalPartNumbers) is real but is not worth a destructive early-split to cover. The correct fix for that gap — if it matters — is to add a PN-slash scan to `splitCompanionParts` (post-dedup, with validation), not to keep the unsafe early-split. But this case proves the model fabricates slashes in PNs that have NO companion, so splitting on model-emitted slashes is fundamentally unreliable.

**Fix:** Replace lines 11640-11651 with a passthrough:

```js
// Companion-PN splitting moved to splitCompanionParts (post-dedup, structured data).
// Early slash-split removed: creates siblings with identical spatial coords that
// positional dedup invariably merges, destroying the main PN (#97).
const expanded = items;
```

**(ii) Report positional dedup drops — independent fix**

**Recommendation: Ship alongside (i), same commit or follow-up.**

Change `positionalMergeBomItems` return to `{items: [...merged,...withoutY], merges: posMerges}`. Update the single call site at L13921 to destructure both. Plumb `posMerges` into `mergeStats` (L13964) as `positionalMerges`. This makes positional dedup match the reporting pattern of exact dedup and fuzzy merge — no more invisible drops.

Additionally, this permanently closes the class of bug where positional dedup silently destroys data without any audit trail (the same reporting gap that delayed diagnosis of H6's cross-column merges).

#### Hotfix vs Queue

**HOTFIX.** All four criteria met:

1. **Deterministic** — fires every time the model emits a `/` in a partNumber string.
2. **Silent** — zero reporting: no flag on the row, no merge report entry, no console warning beyond a generic `BOM POS MERGE` log that doesn't distinguish split-siblings from legitimate merges.
3. **Customer-facing** — the surviving row has a mangled fragment PN (`MPWS`) with "(sub-part from above)" in the description. If quoted, the wrong part is ordered.
4. **Proven in production** — PRJ402119 Line 1 Item 8.

The fix for (i) is a 10-line deletion with zero regression risk — `splitCompanionParts` provides identical companion-splitting capability at a safe pipeline stage. No new code, no new behavior, just removal of a destructive code path.

**(ii) is lower urgency** (reporting improvement, not data loss prevention) but small enough to ship in the same session. ~15 lines: return type change + call-site destructure + `mergeStats` field addition.

### C25 — 2026-06-04 — #98 Supplement: BOM Extraction Audit Brief Verification

**Source:** Freddy's `BOM-EXTRACTION-AUDIT-BRIEF.md` (2026-06-04). Five assumptions verified against the codebase.

---

#### 1. STEP ZERO — Raw Model Output Discarded

**CONFIRMED, with precision on the discard points.**

The Brief cites "app.jsx:11713" — that's actually the batch path's debug-log block, not the exact discard. The actual discard happens at **two sites**, both inside the return-value reduction from CF response → parsed items:

| Path | CF response consumed at | `data.raw` passed to | Raw discarded after |
|------|------------------------|---------------------|-------------------|
| Per-page server | `extractBomPageViaServer` L11699 | `_parseAndVerifyBomRaw(data.raw, ...)` | L11699 — return is `parsed` (items + verification), not raw |
| Batch server | `extractBomBatchViaServer` L11722 | `_parseAndVerifyBomRaw(r.raw, ...)` per page | L11723 — same reduction |
| Client PDF fallback | L11823-11835 | `_parseAndVerifyBomRaw(raw, ...)` | L11835 — same |
| Client crop fallback | L11865-11868 | `_parseAndVerifyBomRaw(raw, ...)` | L11868 — same |

In all four paths, `_parseAndVerifyBomRaw` consumes the raw JSON text and returns `{items, questions, noBomReason, extractionVerification, extractionPath}`. The raw text is a local variable that goes out of scope. No reference survives.

**Feasibility assessment — persisting raw output:**

*What to persist:* `data.raw` is a JSON string containing the model's complete structured output — the `items` array with all per-item fields (partNumber, description, manufacturer, qty, itemNo, confidence, y_top, y_bottom, x_left, x_right, additionalPartNumbers, notes), plus `questions`, `noBomReason`, `detectedLineCount`. For a 13-item BOM, this is typically 3-8 KB. For a 50-item BOM, ~15-25 KB. For a 87-item BOM with full spatial coords, ~30-40 KB.

*Storage cost:* Firestore 1 MB document limit is the constraint. A panel document with 50 BOM rows, pricing, labor data, and all metadata is typically 200-400 KB. Adding 20-30 KB of raw output is ~5-10% increase — well within the budget. The `extractionReport` already stores `learnedCorrectionsLog` (up to 50 entries), `snippetCorrectionsLog` (up to 50), `perPageOutcomes`, and `fuzzyMerges` — the raw output is no larger than data already persisted.

*Minimal change — two options:*

**Option A — Store raw per-page inside extractionReport (RECOMMENDED).** Add `rawModelOutput` to the per-page outcomes array at L13824. Each page's raw text is captured alongside its existing `pageId`, `pageName`, `itemsFound`, `extractionPath`, `pdfQuality`. The data flows naturally into `extractionReport.perPageOutcomes` which already persists. ~5 lines changed: (1) capture `data.raw` in `extractBomPageViaServer` return, (2) thread it through the per-page result in the extraction loop, (3) attach to `_perPageOutcomes` at L13824. Size gating: truncate at 50 KB per page if needed (`raw.slice(0, 50000)`).

**Option B — Store a per-item "original model values" snapshot.** Instead of the raw JSON text, store the pre-pipeline partNumber/description/manufacturer/qty per item as `_modelOriginal: {partNumber, description, manufacturer, qty}` on each BOM row. This survives into Firestore via the BOM array itself. Advantage: attribution is trivially per-row ("compare `_modelOriginal.partNumber` to final `partNumber`"). Disadvantage: requires threading through every pipeline stage's `{...item}` spread without dropping the field; if any stage reconstructs the item object without spreading, the field is lost. Also doesn't capture `noBomReason`, `detectedLineCount`, or the full JSON structure for debugging parse failures.

**Recommendation: Option A.** Store the raw text per-page in `extractionReport.perPageOutcomes`. It's the minimal change (no pipeline threading), captures the complete model output (including thinking-block artifacts and structural metadata), and the storage is bounded by the existing `perPageOutcomes` architecture. Transient-vs-persisted is a non-question — persist it; the cost is negligible and the audit needs it across sessions.

---

#### 2. RE-EXTRACTION BLOCKER — "wrong-page-type" on All Pages

**Marc's hypothesis ("original page-type classifications are no longer stored") is WRONG.** Page types DO persist to Firestore.

Both save paths (`saveProject` at L8700, `saveProjectPanel` at L8918) strip only `dataUrl` from page objects. All other fields — `types`, `regions`, `aiBomRegion`, `originalPdfPath`, `pageNumber` — survive the save-reload cycle. Confirmed by reading the destructure at L8700: `const {dataUrl,...rest}=p;return rest;`. The `types` array is preserved.

**The actual cause of "wrong-page-type" is the MODEL'S response, not ARC's filtering.**

Trace:
1. Re-extraction at L23993 filters: `pages.filter(p=>getPageTypes(p).includes("bom"))`. For PRJ402119, pages 3-4 were BOM-typed (confirmed in C23). This filter PASSES them — otherwise the error message would be "No pages tagged BOM yet" (L23994), not "wrong-page-type."
2. The pages reach the extraction call. The model receives the PDF page and inspects it.
3. The model returns `noBomReason: "wrong-page-type"` — it's the MODEL deciding the page doesn't contain a BOM table.

**Why the model rejects pages it previously extracted from:** Two likely causes, both code-level:

**(A) Missing `bomRegion` on the re-extraction batch path (TODO #57, C14/C15).** Line 24053 constructs batch pages WITHOUT `bomRegion`:
```js
return{pageNumber:pg.pageNumber,croppedBomImage,croppedBomMediaType,notes};
// ↑ bomRegion is ABSENT — compare to initial extraction at L13647:
// return{..., bomRegion:unit.bomRegion||null};
```
Without `bomRegion`, the Cloud Function skips CropBox (L2384-2393). The model sees the FULL drawing page — which for RSW1596-126 is primarily a schematic/enclosure drawing with a small BOM table in one corner. The model correctly classifies the full page as "not a BOM page" because the BOM is a small fraction of the visual content.

On initial extraction (v1.20.95), `confirmAndExtract` → `runExtractionTask` → L13647 passes `bomRegion`. The model receives the CropBox'd page focused on just the BOM table → extraction succeeds. On re-extraction, the missing `bomRegion` means the model sees the full page → "wrong-page-type."

**(B) The `#82 P1 noBomReason escape removal` (L2414-2417) only fires when `pdfCropped === true`.** When the CF applies CropBox, it removes the `noBomReason` escape from the prompt, forcing the model to extract. Without `bomRegion` (re-extraction batch), `pdfCropped` is false, the escape is offered, and the model takes it.

**Fix:** This is TODO #57 — add `bomRegion:unit.bomRegion||null` to L24053. One field, already designed in C14. This is the SECOND prerequisite the Brief should list: Step Zero needs BOTH raw-output persistence AND the #57 bomRegion fix for re-extraction to work.

**Note for Jon:** #57 is a mechanical one-field addition. It was identified in Session 1 (C14, May 22) and is part of the unshipped H10 scope. It can be extracted as a standalone hotfix independent of H10's larger architectural work.

---

#### 3. RENDER FIDELITY — What the Model Receives on pdf-native

**The Brief's characterization is accurate. Elaboration below.**

On the pdf-native path (CF `extractBomPage`, functions/index.js:2362-2423):

1. CF downloads the ORIGINAL PDF from Firebase Storage (L2370: `const [buf] = await file.download()`).
2. Slices to a single page via pdf-lib (L2376-2378: `singlePagePdf.copyPages(fullPdf, [pageNumber - 1])`).
3. Optionally applies CropBox if `bomRegion` provided (L2384-2393).
4. Serializes to base64 (L2401-2402: `singlePagePdf.save()` → `Buffer.from(...).toString('base64')`).
5. Sends as `{type: 'document', source: {type: 'base64', media_type: 'application/pdf', data: pdfBase64}}` (L2420-2421).

**What ARC controls:**
- The PDF bytes sent to the API (original vector content, losslessly sliced).
- CropBox application (when `bomRegion` is provided — focuses the visible area).
- Prompt text (SCANNED DOCUMENT ALERT when `pdfQuality.warningLevel !== 'none'`).
- Model selection (Opus), max_tokens (64000), thinking budget (8000).

**What ARC does NOT control:**
- The API's internal rendering of the PDF document. Anthropic's vision pipeline rasterizes PDF pages internally before feeding them to the model's vision encoder. The resolution, compression, and rendering parameters are API-internal. ARC has zero visibility into or control over this step.
- Whether the API extracts a text layer vs renders to an image. The `document` content type gives the API the option to extract embedded text programmatically, but there is no guarantee it does so — and the digit-substitution errors on vector-text PDFs (Items 3, 5, 7 of PRJ402119) prove the model is reading VISUALLY even when vector text is present.

**The Brief's Hypothesis 1 (render-resolution) correctly notes this uncertainty.** The effective DPI the API uses for PDF documents is unknown and uncontrollable. Testing it would require sending the same BOM as both a PDF document and a pre-rendered high-DPI image, then comparing error rates — exactly the kind of controlled experiment the Brief proposes, and exactly what the re-extraction blocker (#57) prevents.

**One ARC-side lever the Brief doesn't mention:** CropBox. When a `bomRegion` is applied, the model receives a PDF page where the MediaBox/CropBox is tightly focused on the BOM table. If the API's internal renderer uses a fixed pixel budget per page, CropBox effectively increases the DPI of the BOM content by reducing the rendered area. This is a plausible (but unproven) lever for Class 1 errors. It's already operational on the initial extraction path but missing from re-extraction (#57).

---

#### 4. STAGE J — `resolveInternalPartNumbers` Reachability

**CONFIRMED — silent replacement path with no transform flag on the replaced rows.**

`resolveInternalPartNumbers` (L11024-11047):

**Firing condition:** >50% of eligible BOM rows have PNs matching `_INTERNAL_PN_RE` = `/^\d{3,4}-\d{3,5}$|^\d{7,12}$/`. This means all-numeric PNs in the format `NNNN-NNNNN` or `NNNNNNN` through `NNNNNNNNNNNN`. When the threshold is met, EVERY matching PN is replaced with a manufacturer PN extracted from the description via `_extractMfrPnFromDesc`.

**What it sets:** `{partNumber: mfrPn, customerPartNumber: origPn}` (L11040). The original PN is preserved in `customerPartNumber`. When no MFR PN can be extracted from the description, it sets `{customerPartNumber: origPn, confidence: "low"}` (L11043).

**What it does NOT set:** No `isResolved` flag, no `resolvedFrom` field, no `priceSource` change. The replacement is invisible to downstream consumers — `partNumber` simply has a different value with no audit trail beyond `customerPartNumber` (which is not surfaced in any UI or report).

**Silent path confirmed.** The console.log at L11039 and L11045 are the only signals. No debug log entry, no extractionReport field, no row-level flag. A row that entered with `partNumber: "1234-56789"` exits with `partNumber: "AF09-30-10-13"` (extracted from description) and no indication that the PN was algorithmically derived from description text rather than read from the drawing's PN column.

**Reachability for the audit baseline:** FLS drawings use internal catalog codes (the comment at L10983 explicitly names FLS). FLS is one of the three major customers (~76% of revenue per the Brief). Any FLS project in the baseline sample will likely trigger this path. The audit MUST check FLS projects for Stage J activity.

**Risk the Brief should elevate:** Stage J's `_extractMfrPnFromDesc` is a regex-based heuristic that scans description text backwards for tokens that "look like" manufacturer PNs. It can extract the WRONG token from a complex description (e.g., a measurement or spec value that happens to contain mixed alpha-numeric characters). When it does, the BOM row silently carries a PN that was never on the drawing — a Class 2-like error introduced by ARC's own pipeline, not the model. This is distinct from #97 (which destroyed a correct PN) — Stage J can CREATE a wrong PN from description text.

---

#### 5. CLASS 2 BACKSTOP — Known-Parts Validation Feasibility

**High-level architecture assessment (what it would touch):**

A post-extraction validation layer that cross-checks extracted PNs against known-good sources. Three candidate data sources already exist in ARC:

**(A) BC Item Catalog (already wired).** `bcFuzzyLookup` (L4739) already searches BC by part number with 5 increasingly aggressive matching strategies. `runPricingOnPanel` (L14313+, L25511+) already builds a `bcMap` by fuzzy-matching every BOM row against BC. The infrastructure to answer "does this PN exist in BC?" is fully built — it runs on every pricing cycle.

What's missing: the pricing path uses BC match to REPLACE the PN (L14369: `partNumber: bcMap[key].bcNumber || r.partNumber`) rather than VALIDATE it. A validation mode would check "does the extracted PN or a close variant exist in BC?" and flag non-matches as suspect — without replacing the PN. This is a mode change on existing infrastructure, not a new data path.

Touch points: ~20 lines. Add a `bcValidateBom(bom)` function that runs `bcFuzzyLookup` per row and returns `{matched, unmatched, suspicious}` counts. Attach the result to `extractionReport`. Fire between `applyLearnedCorrections` (step 13) and the final save. No PN mutation — read-only validation.

**(B) Alternates / Corrections DB (already wired).** `applyLearnedCorrections` (L10331) already loads the user's part crosses, corrections, and description crosses. Every PN that HAS a learned alternate is implicitly "known" — the user has seen it before. PNs that are unknown to ALL learning DBs AND unknown to BC are the highest-risk candidates for Class 2 errors.

Touch points: zero new code needed. The `appliedLog` from `applyLearnedCorrections` already tells you which rows were matched. The complement (rows NOT in `appliedLog` and NOT in `bcMap`) is the "unknown PN" set.

**(C) Historical BOM corpus (not wired).** ARC has extracted BOMs for ~87+ projects. The union of all historical PNs is a de facto parts library. A Firestore query across `users/{uid}/projects/*/panels/*/bom` could build a frequency table of PNs. PNs extracted once and never seen again are higher-risk than PNs that appear across multiple projects. This is the strongest signal for Class 2 ("plausible but wrong") — a structurally valid PN that has never appeared in any other project is suspect.

Touch points: more substantial — requires a one-time corpus scan (Cloud Function or script), result cached in a `users/{uid}/config/knownParts` document. Validation then becomes a Set lookup. ~50-100 lines for the scanner, ~10 lines for the validation check.

**Recommendation for Jon:** (A) alone is sufficient as a first-pass Class 2 backstop and can ship with minimal code. The BC catalog is the authoritative source for "real parts this company buys." An extracted PN that BC has never heard of — when BC typically stocks the manufacturer's full catalog — is a strong Class 2 signal. (B) is free (already computed). (C) is the highest-value long-term investment but can wait until the baseline study shows whether Class 2 is a 5% or 50% problem.

---

#### Additional Risk the Brief Missed

**The Brief's pipeline audit (§6) should add Stage B (companion-PN split in `_parseAndVerifyBomRaw`) as a separate audit target beyond #97.** #97 covers the slash-split × positional-dedup interaction (deterministic destruction). But the slash-split has a SECOND failure mode independent of #97: it splits PNs that legitimately contain `/` as a dimensional separator (e.g., `TYD15X3/4PWS` where `3/4` means ¾ inch). Even after #97's fix removes the positional-dedup interaction, the slash-split itself still produces two rows (`TYD15X3` and `4PWS`) from a single item — both wrong, neither matching the real PN. If #97's fix option (i) (remove the slash-split entirely) ships, this is moot. If only option (ii) ships, this second failure mode survives.

**Sequencing note (§9 decision 4):** The Brief asks whether the baseline study can run in parallel with #97. Answer: yes, with a caveat. The baseline study is measurement (no code change), and #97 is a code fix. They don't conflict. However, baseline measurements taken BEFORE #97 ships will include #97-class errors (slash-split destruction) in the error count. The audit should note which errors in the baseline are #97-attributable so they can be subtracted post-fix. This is clean — any row with "(sub-part from above)" in its description is a #97 artifact.

### C26 — 2026-06-04 — #98 Extraction Pipeline Archaeology (Regression Timeline + Accretion Map)

**Full report:** `98-EXTRACTION-ARCHAEOLOGY.md`

**Summary:** Walked 4 weeks of git history (May 12 – Jun 4). 20+ commits touched the extraction pipeline. Found 4 distinct phases of change, each with measurable accuracy risk:

1. **Phase 1 (pre-May 12):** Minimal pipeline. 5 stages, all March-April. Over-merged but never CREATED wrong PNs.
2. **Phase 2 (May 13-14):** Stage J added (`resolveInternalPartNumbers`) — new silent-corruption path that CREATES PNs from description regex. L3 retry added — more items recovered but more hallucination risk. Image path removed.
3. **Phase 3 (May 20):** Crop-first regression (`8d984699`) reintroduced JPEG artifact failures. Rolled back May 22. ~10 versions affected.
4. **Phase 4 (Jun 1-2):** Dedup key explosion — 3 commits changed both prompt (stop merging same-PN) and code key (3-part with description discriminator). More raw items × less aggressive dedup = more surviving items, some duplicates.

**Accretion thesis CONFIRMED:** 7 of 13 post-extraction stages can corrupt a correctly-extracted PN. The dangerous ones are the TRANSFORM stages (B, J, M, R) vs the safe FLAG-only stages (confusable-glyph, suspect-qty). Every stage added to fix a specific misread can corrupt a good read under different conditions.

**Risk-ranked stages for audit:** (1) Stage B slash-split, (2) Stage J internal-PN resolve, (3) Stage R BC pricing substitution, (4) Stage M ARC Cross, (5) exact dedup key changes, (6) positional dedup reporting gap, (7) L3 retry quality.

**Blocked on Step Zero:** Model-vs-pipeline attribution, prompt change impact, and L3 retry quality all require raw model output (currently discarded). Flagged throughout the report.

### C27 — 2026-06-04 — #98 Step Zero Detailed Plan

**Plan file:** `98-STEP-ZERO-PLAN.md`

Three components, all prerequisite for the #98 audit:

**(a) Raw model output persistence (~15 lines).** Store `data.raw` (truncated to 60KB) per page in `extractionReport.perPageOutcomes`. Four discard sites patched: `extractBomPageViaServer` L11699, `extractBomBatchViaServer` L11723, client PDF fallback L11835, client crop fallback L11868. Threading into `_perPageOutcomes` at L13824. Re-extraction path gets parallel storage.

**(b) #57 bomRegion on re-extraction batch (1 line).** Add `bomRegion:unit.bomRegion||null` to L24053. Matches initial-extraction batch at L13647. Unblocks re-extraction for any project with BOM regions.

**(c) Surfaced correction log (~30 lines).** Stage J (`resolveInternalPartNumbers`): change return to `{bom, resolvedLog}`, persist in `extractionReport.internalPnResolutions`. Stage R (BC pricing): capture PN substitutions in both pricing paths, log via `logDebugEntry` (zero schema change, immediate visibility in Settings → Debug Logs). Stages M/N/O already persist `learnedCorrectionsLog` — no change needed.

Single commit, single deploy. Awaiting Jon approval.

### C28 — 2026-06-04 — #98 Step Zero Gap: rawModelOutput on Re-Extraction Path (Detailed Plan)

**Gap:** Step Zero (a) captures `rawModelOutput` on the initial extraction path via `_perPageOutcomes` (shipped v1.20.98). The re-extraction and feedback re-extraction paths don't have a `_perPageOutcomes` array — their report builders (`reExtractionReport` at L24186, `fbReport` at L24402) use a flatter structure. Raw output is present on the `result` object at L24095/L24098 (it flows through `extractBomPage` → `extractBomPageViaServer` which sets `parsed.rawModelOutput` since v1.20.98) but is never captured — the per-page loop consumes only `result.items` and `result.questions`.

**Plan — 3 changes, ~12 lines:**

---

**Change 1 — Accumulate per-page outcomes in re-extraction loop (L24084)**

Add a `_rePerPageOutcomes` array before the `parallelMap`, then capture per-page data inside the loop body, mirroring the initial extraction's `_perPageOutcomes` pattern at L13824.

Before the try block at L24084, add:
```js
const _rePerPageOutcomes = [];
```

Inside the `parallelMap` callback, after the `for(const unit of units)` loop ends (after L24111, before L24112 `if(pageQs.length)`), add:
```js
_rePerPageOutcomes.push({
  pageId: pg.id,
  pageName: pg.name || `Page ${pgIdx+1}`,
  pageNumber: pg.pageNumber || null,
  itemsFound: pageItems.length,
  extractionPath: result?.extractionPath || null,
  rawModelOutput: (result?.rawModelOutput || "").slice(0, 60000),
});
```

Note: `result` here is the last unit's result (from the `for(const unit of units)` loop). For single-unit pages (the vast majority), this is the only result. For multi-unit pages (rare — only if `getExtractionUnits` returns >1 unit), this captures the last unit's raw output. This matches the initial extraction path's behavior where `_perPageOutcomes` captures the page-level rollup, not per-unit.

**Scoping note on `result` variable:** `result` is declared with `let` at L24092, inside the `for(const unit of units)` loop body. After the loop completes, `result` holds the LAST unit's value. This is correct for single-unit pages. For multi-unit pages, the raw output of earlier units is lost — but multi-unit extraction is effectively dead code (quadrant extraction was reverted in v1.19.622, `getExtractionUnits` returns exactly 1 unit for all current paths). If multi-unit is ever resurrected, this would need revisiting.

Actually — looking more carefully, `result` is block-scoped inside the `for` loop. Let me re-check.

Looking at L24089-24111: `let result;` is declared at... let me re-read.

Actually, `result` is not declared with `let` before the loop — it's declared inside the loop body at L24092 with `let result;`. That means it's NOT visible after the loop ends. Let me re-examine.

Wait — looking at L24092: `let result;` is inside the `for(const unit of units)` body. So `result` is scoped to each iteration. After the loop ends at L24111, `result` is out of scope.

The fix needs to capture raw output INSIDE the loop. Let me adjust.

**Revised Change 1 — capture inside the per-unit loop:**

Before the `for(const unit of units)` loop at L24089, add:
```js
let pageRawModelOutput = null;
```

Inside the loop, after L24100 (`if(result?.extractionPath)...`), add:
```js
if (result?.rawModelOutput) pageRawModelOutput = (result.rawModelOutput || "").slice(0, 60000);
```

Then after the loop ends (after L24111, before L24112), add the `_rePerPageOutcomes.push(...)` using `pageRawModelOutput` instead of `result?.rawModelOutput`.

```js
_rePerPageOutcomes.push({
  pageId: pg.id,
  pageName: pg.name || `Page ${pgIdx+1}`,
  pageNumber: pg.pageNumber || null,
  itemsFound: pageItems.length,
  rawModelOutput: pageRawModelOutput,
});
```

---

**Change 2 — Add `perPageOutcomes` to re-extraction report builder (L24186)**

```js
// L24186 — CURRENT:
const reExtractionReport = {
  rawCount: all.length, exactCount: exactDedup.length, finalCount: fuzzyDedup.length,
  ...
  timestamp: Date.now(), version: APP_VERSION,
};

// ADD to the object:
  perPageOutcomes: _rePerPageOutcomes,
```

This places the per-page outcomes (including `rawModelOutput`) in the same `extractionReport.perPageOutcomes` field that the initial extraction uses. Consumers (the audit, Firestore inspection) see the same shape regardless of which extraction path ran.

---

**Change 3 — Same pattern for feedback re-extraction (L24329-24412)**

The feedback re-extraction at `reExtractWithFeedback` (L24293) has the same gap. Apply the identical pattern:

Before the `parallelMap` at L24330, add:
```js
const _fbPerPageOutcomes = [];
```

Inside the `parallelMap` callback, before `return pageItems.map(...)` at L24344, add:
```js
let fbPageRaw = null;
```
Wait — the feedback path has a slightly different structure. Let me look more carefully.

At L24334: `for(const unit of units)` — same pattern. `result` is `const result = await extractBomPage(...)` at L24336, scoped inside the loop.

Same fix pattern: declare `let pageRawModelOutput = null;` before the loop, capture `result.rawModelOutput` inside the loop, push to `_fbPerPageOutcomes` after the loop.

Add `perPageOutcomes: _fbPerPageOutcomes` to `fbReport` at L24402.

---

**Verification — `internalPnResolutions` on re-extraction/feedback paths:**

Checking whether the other Step Zero log fields already land on the re-extraction report:

- `internalPnResolutions`: L24194 — `internalPnResolutions: reResolvedLog || []` — **PRESENT** on re-extraction report (shipped in v1.20.98 along with the `resolveInternalPartNumbers` return-type change).
- `internalPnResolutions`: L24410 — `internalPnResolutions: fbResolvedLog || []` — **PRESENT** on feedback report.
- `learnedCorrectionsLog`: L24190 — **PRESENT** (pre-existing).
- `positionalMerges`: L24188 — **PRESENT** (from the `positionalMergeBomItems` return-type change in the #97 fix).

All Step Zero log fields are already carried on both re-extraction report builders. The ONLY gap is `perPageOutcomes` (which carries `rawModelOutput`).

---

**Test plan (PRJ402114):**

1. Open PRJ402114. Re-extract a panel.
2. After completion, inspect `panel.extractionReport.perPageOutcomes` in Firestore.
3. Each page entry should have `rawModelOutput` containing the model's raw JSON text (up to 60KB).
4. Verify `rawModelOutput` parses as JSON and contains an `items` array.
5. Compare item count in `rawModelOutput` to `extractionReport.rawCount`.

**Size: ~12 lines across 2 functions (re-extraction + feedback re-extraction). Zero behavior change — additive instrument only.**

### C29 — 2026-06-04 — #100 Supplement: Completeness Guarantee Brief Verification

**Source:** Freddy's Completeness Guarantee Investigation Brief (#100, 2026-06-04).

---

#### 1. L3 — What It Does, Where It's Wired, What It Detects

**L3 exists ONLY in `runExtractionTask` (initial extraction, L13680-13808).** The re-extraction path (`runExtraction`, L23985) and feedback re-extraction path (`reExtractWithFeedback`, L24293) have NO retry logic. `pageRetryAttempts` is declared only at L13680.

**L3 Phase 1 (broad retry, L13700-13755):**
- Trigger: `extractionVerification.status === "needs-review" && pageRetryAttempts < 1`
- Verification flags that trigger `needs-review` (from `_parseAndVerifyBomRaw`, L11592-11616):
  - `countMismatch`: model's `detectedLineCount` ≠ actual items returned (L11599)
  - `missingFromStart`: model's lowest `itemNo > 1` (L11604-11609) — **THIS is the signal that would catch the 402114 case** (first item was 26, missingFromStart = 25)
  - `sequenceGaps`: internal gaps between consecutive itemNos (L11611-11614)
- Action: sends the SAME page again with feedback describing what was missed. MERGES both passes by itemNo — union, not replace. New items get `_extractionRetried = true`.

**L3 Phase 2 (targeted gap-fill, L13757-13808):**
- Trigger: after Phase 1 merge, remaining sequence gaps exist AND `pageRetryAttempts <= 1` AND gap count ≤ 20
- Action: sends a targeted request for ONLY the specific missing itemNos. Filters response to only accept items whose itemNo is in the requested list. Additions get `_extractionGapFill = true`.

**Final gap check (L13938-13957, also L24159-24185 for re-extract):**
- Runs on the POST-PROCESSED BOM (after all dedup/filter stages)
- Detects internal gaps only — does NOT detect missing-from-start (C15 finding)
- Output: `finalSequenceGaps` array in extractionReport
- **Does NOT trigger any retry or flag** — console.warn only

**L3's detection of the 402114 failure pattern:**
For items 26-47 (first item = 26): `missingFromStart = 25`, `sequenceGaps = [1,2,...,25]`, `status = "needs-review"` → L3 Phase 1 WOULD trigger. Phase 1's feedback would say "Items 1..25 appear to be MISSING." Phase 2 would follow up for any remaining gaps.

**Critical gap L3 CANNOT detect:** If the model reads items 1-22 and stops (bottom truncation), there is no `missingFromStart`, no internal gaps — the items are sequential. Detection depends ENTIRELY on `detectedLineCount` (model self-reports "I see 47 rows" but only returns 22). If the model reports `detectedLineCount: 22` (consistent with what it returned), L3 sees nothing wrong. **The model can self-consistently partial-read with no internal contradiction.** This is the failure pattern Pillar 1 exists to catch — an INDEPENDENT row-count expectation that doesn't trust the model's self-report.

---

#### 2. Targeted Range Re-Extraction (Pillar 2) — Feasibility

**Can the CF extract "rows N-M" of a region?**

Yes — L3 Phase 2 already does exactly this (L13772). The feedback mechanism sends: "extract ONLY the following missing item numbers: 1, 2, 3, ..., 25." The model receives the same page/region but is asked for specific items. The response is filtered to only accept items whose itemNo is in the requested list (L13777-13779).

**What's needed to make this a first-class, every-path mechanism:**

The L3 Phase 2 code at L13757-13808 is self-contained — it takes the current `result`, computes remaining gaps, builds a feedback string, calls `extractBomPage` again, and filters/merges the response. It has NO dependencies on surrounding `runExtractionTask` state beyond `unit` (the extraction unit) and `notes` (user notes). It could be extracted into a shared function and called from any path.

**Cost per targeted retry:** One additional `extractBomPage` call (same model, same input page, shorter expected output). For a 25-item gap-fill, the response is ~5-8KB vs ~25KB for the full table. Thinking budget is shared. Typically ~5-10 seconds.

**Looping until complete:** L3 Phase 2 currently runs once (capped by `pageRetryAttempts <= 1`). The Brief proposes looping until the sequence is complete or recovery is provably exhausted. This is mechanically simple — replace the single-shot with a `while(remainingGaps.length > 0 && attempts < maxAttempts)` loop. Each iteration asks for the still-missing items, filters responses, updates the gap list. Converges when either all items are found or a retry returns 0 new items (exhaustion).

**Risk:** Each retry loop iteration is an additional API call (~$0.02-0.05 for Opus). For a 47-item BOM missing 25 items, expect 1-3 iterations. For a 100-item BOM missing 50, potentially 3-5. The existing `maxAttempts` cap (currently 1) would need to increase to ~3-5. Hard cap at 5 iterations prevents runaway loops.

---

#### 3. Programmatic Text-Layer Extraction (Pillar 1a) — Feasibility

**Client-side: pdf.js is already loaded and used.** `page.getTextContent()` is called at L29500 in the quote PDF reader. pdf.js is loaded via `window.pdfjsReady()` (CDN). `getTextContent()` returns `{items: [{str, transform, ...}]}` — positioned text fragments with x/y coordinates and content.

**Server-side: NOT currently available.** `functions/index.js` has `pdf-lib` (structural PDF manipulation — copy pages, set CropBox, read XObject metadata). pdf-lib CANNOT extract text content. Server-side text extraction would require adding a dependency:
- `pdf-parse` (lightweight, wraps pdf.js for Node — ~50KB, pure JS, no native deps)
- `pdfjs-dist` (full pdf.js for Node — heavier but exact parity with client-side)
- Neither is currently in `functions/package.json`

**Where it would run:** Two options:
- **(i) Client-side, before extraction starts** — in `confirmAndExtract` or `runExtraction`, after `ensureDataUrl` hydrates pages but before `runExtractionTask`. Load the original PDF via `pdfjsReady()` + `getDocument()`, call `getTextContent()` on each BOM page, parse item numbers and row count. ~20-30 lines. Advantage: no CF dependency change. Disadvantage: requires downloading the PDF to the browser (already happens for page rendering in `addFiles`, but NOT on save-reload — the original PDF is in Storage, pages are JPEG).
- **(ii) Server-side, as a new Cloud Function or inside `extractBomPage`** — add `pdf-parse` or `pdfjs-dist` to functions, extract text before/alongside the vision call. Advantage: runs alongside the extraction without browser round-trips. Disadvantage: dependency addition, slightly larger function cold-start.

**What `getTextContent` provides on a vector PDF:** An array of `{str, transform, width, height, dir, fontName}` items. `str` is the text string, `transform` is a 6-element matrix encoding position and scale. For a BOM table in a vector PDF, this gives you every cell's text content with position. Parsing item numbers from this requires:
1. Filter text items by the BOM region's spatial bounds (transform position within CropBox).
2. Identify the item-number column (leftmost numeric values in a vertical cluster).
3. Count distinct rows / extract the sequence.

This is a non-trivial parser (~50-80 lines for robust extraction with position-based column identification), but the data quality is AUTHORITATIVE — it's the PDF's actual text content, not a vision model's reading.

**The caveat Freddy correctly flags:** Scanned/raster PDFs have NO text layer (or a garbage OCR layer). `getTextContent()` returns 0 items or nonsense. `assessPdfPageQuality` (L2265) already probes for `hasVectorText` (checks Font resource dictionary) and `isScanned` (checks XObject filters). These signals can gate whether text-layer extraction is attempted — only on vector PDFs where it's reliable.

**Verdict:** Pillar 1a is feasible and high-value on vector PDFs. The infrastructure (pdf.js client-side, `hasVectorText` detection server-side) already exists. The gap is: (1) a text-content parser for BOM row counting (~50-80 lines), (2) either a client-side pre-extraction step or a server-side dependency addition. Recommend client-side option (i) for the first version — avoids CF dependency changes.

---

#### 4. Item-Number Continuity Gap Detection (Pillar 1b) — Feasibility

**Already partially implemented — the verification at L11602-11616 inside `_parseAndVerifyBomRaw` does exactly this.** It:
1. Parses all `itemNo` values to integers (L11602)
2. Sorts and deduplicates (L11604)
3. Detects `missingFromStart` when `minItemNo > 1` (L11604-11609)
4. Detects internal gaps between consecutive itemNos (L11611-11614)

**What's missing for a completeness guarantee:**

**(a) Missing-from-END detection.** The final gap check (L13943-13957) iterates from `sortedNos[0]` to `sortedNos[last]` — it finds internal gaps but NOT items missing after the maximum. If a 47-item BOM returns items 1-35, the final gap check sees consecutive 1-35 and reports no gaps. Detection requires an INDEPENDENT expected maximum — either from the text layer (Pillar 1a) or from `detectedLineCount`.

**(b) Not wired to any user-facing signal on the re-extraction path.** The re-extraction final gap check (L24159-24185) computes `_reSeqGaps` and writes it to `reExtractionReport.finalSequenceGaps`. But there is NO UI banner, NO blocking gate, NO flag-for-review mechanism that reads `finalSequenceGaps` from the re-extraction report. On the initial path, the gap data flows into `extractionReport` and the "extraction concerns" banner at L20540 reads `(r.l3MergeRecovered||0)+(r.l3GapFillRecovered||0)` — but that's L3 recovery counts, NOT gap counts. **No UI anywhere reads `finalSequenceGaps` to warn the user.**

**(c) `detectedLineCount` reliability.** The model's self-reported `detectedLineCount` is the only existing signal for expected item count. For the 402114 case: if the model reported `detectedLineCount: 47` (correct) but returned 22 items, `countMismatch` would be true and L3 would trigger. But the model could report `detectedLineCount: 22` (matching its incomplete output). **We don't yet know how reliable `detectedLineCount` is as an independent signal — Step Zero raw output will tell us (it's in the raw JSON).**

**Verdict:** Pillar 1b is the cheapest path to gap detection — the verification code already exists. The gaps are: (1) missing-from-end detection needs an independent expected max, (2) the detection result needs to reach a user-facing signal (banner/flag/gate), (3) it needs to be wired on re-extraction and feedback paths (not just initial). All are small changes (~15-20 lines each). But 1b is WEAKER than 1a — it only works when item numbers are sequential integers starting from 1, and it trusts the model's itemNo assignments (which could be wrong).

---

#### 5. Interim Bleed-Stop Assessment (Brief §8, D1)

Freddy's lean: ship a gap-DETECTION flag, not full L3.

**What a gap-detection flag would look like:**

The verification data already exists on all paths — `_parseAndVerifyBomRaw` computes `missingFromStart` and `sequenceGaps` at L11602-11616. On the re-extraction path, this fires per-page inside `extractBomPage` → `extractBomPageViaServer` → `_parseAndVerifyBomRaw`. The result includes `extractionVerification` with `status: "needs-review"` when gaps exist.

Currently the re-extraction path at L24101 does `const items = translateItemsToPageCoords(result.items||result||[], ...)` — it reads `result.items` and IGNORES `result.extractionVerification` (the C15 finding, still unfixed — H10 scope).

**Minimal interim fix (~10 lines):**
1. Read `result.extractionVerification` in the re-extraction per-page loop (L24100).
2. Accumulate per-page verification results.
3. If ANY page has `status === "needs-review"` with `missingFromStart > 0` or `sequenceGaps.length > 0`, set a flag on the extraction report: `completenessWarning: true, missingFromStart: N, sequenceGaps: [...]`.
4. Wire a UI banner to `extractionReport.completenessWarning` — amber banner above the BOM: "⚠ Extraction may be incomplete — items [1-25] were not found. Review the BOM against the drawing."

This surfaces the loss LOUDLY without adding retry complexity. It aligns with the "never silent" principle. L3's probabilistic retry can be added later as the permanent Pillar 2 mechanism.

**Risk of the interim fix:** Zero behavior change to the extraction itself — additive flag only. The banner is informational (doesn't block quoting or pricing). Same safety profile as the existing scan-quality banner.

---

#### 6. Additional Risk the Brief Should Note

**The 402114 failure pattern (start at item 26) is the EASY case.** L3's `missingFromStart` detection catches it cleanly — the model's first itemNo is 26, proving 1-25 missing. The HARD case is bottom truncation (model reads items 1-22 of 47 and stops with `end_turn`). In that case:
- `missingFromStart` = 0 (starts at 1)
- `sequenceGaps` = [] (1-22 are consecutive)
- Only `countMismatch` (`detectedLineCount` vs returned count) can signal the problem
- If the model self-consistently reports `detectedLineCount: 22`, ALL item-number-based detection fails

**Only Pillar 1a (text-layer independent count) catches this case reliably.** Pillar 1b (item-number continuity) is blind to it. This should weight the Q3 text-layer availability measurement highly — if text layers are common, 1a is the priority. If they're rare, we need a different independent-expectation source for bottom truncation (e.g., a separate lightweight model call that just counts rows visually, or a multi-pass strategy where pass 2 starts from the BOTTOM of the table).

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
| **H6** | **CLOSED — VERIFIED** | ✓ | Deployed v1.20.20. 15/17 recovered. 2 remaining are same-column y-collision (different bug class). |
| **H9** | **CLOSED — VERIFIED (C14)** | ✓ | itemNo guard deployed v1.20.22. Items 27/28/30 recovered. Zero fuzzy merges, zero gaps. |
| **H10** | **NEW — CRITICAL (C14/C15)** | 1 | Re-extraction path architectural fix. Scope: (1) bomRegion in batch payload, (2) read extractionVerification, (3) missing-from-start gap detection, (4) L3 retry/gap-fill, (5) verification in report, (6) L3 report fields, (7) shared L3 function (Approach B). Absorbs H7. Monday work. |
| **H8** | **READY — baseline captured** | 2 | `prj402107-post-h6.json` + diff are the clean baseline. H5 scope re-evaluation can proceed. |
| **H7** | **ABSORBED INTO H10** | — | L3 in re-extraction path. Absorbed because reading verification (H10 scope item 2) is prerequisite for L3 trigger (H10 scope item 4). Same architectural gap, one coherent fix. |
| H5 | ON HOLD | 4 | True OCR error rate now measurable: 53/85 (62.4%) PN mismatches. Scope re-evaluation against H8 baseline pending. |
| H1 | Bundled into H5 | — | "1 SET" qty fix. Still needed, ships with H5. |
| H3 | Bundled into H5 | — | Tag-count vs qty check. Still needed, ships with H5. |
| H2 | Deferred | — | Catalog-description cross-validation. Not in current scope. |
| H4 | Closed | — | revMark field. Matrix doesn't use revision marks. |
| C5 | OPEN — independent | Parallel | Auto-cross corruption. Separate from extraction pipeline. Can be addressed independently of H6-H8. |

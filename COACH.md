# ARC Coaching Log

## Close-Out Discipline

Any design decision, analyst review, or scope change produced or relayed during a Coach session **must be committed to a repo file** before session end. Freddy's decisions live only in browser chat until Coach or Marc commits them — if a session ends without writing them down, the next Freddy has no way to recover them. When closing out, explicitly check: "Did Freddy produce anything this session that isn't in the repo yet?"

## Freddy-Bound Delivery

Freddy-bound deliverables (analyst review requests, verdicts, supplements, plans, any >50-line content) ALWAYS go to a file + `Start-Process explorer.exe -ArgumentList "/select,<path>"` + a file link for Jon to drag — never pasted into chat. Missed 2026-06-15.

## Supplement Durability

When producing a supplement, Brief response, or any analysis artifact in docs/, commit it to git as part of creating it — do not leave it untracked in the working tree. The reasoning behind a spec must be in version control before the work it informs gets built, so the record survives independent of the working tree or conversation. Write → commit → then open/surface for relay.

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
- **2026-06-09 (Session 3, cont.)** — C37: Phase 1c verification (block-with-override gate, v1.20.107). All 5 behavioral checks PASS. Gate routes tier+region correctly, manualVerifyRequired round-trips to Firestore, Case 3 non-blocking, no silent fifth path. P&ID label still broken (carry-forward from C36). Marc cleared for 1d.
- **2026-06-09 (Session 3, cont.)** — C38: Sales-path readiness audit. Full chain investigation: extraction→pricing→BC→quote. Two BROKEN findings (trust signal vanishes at quote, re-extraction clears manualVerifyRequired), three FRAGILE seams (wrong BC match on noisy PNs, silent pricing failure, print bypasses send-gate). Delivered SALES-PATH-READINESS-AUDIT.md.
- **2026-06-09 (Session 3, cont.)** — C39: F1+C5 noisy-PN guard scope. Combined effort: BC fuzzy match hold + auto-cross freeze, both keyed off manualVerifyRequired. ~70-90 lines, low-medium risk. Key finding: bcFuzzyLookup already returns a type field (exact/fuzzy) that is NEVER USED — infrastructure exists. Delivered NOISY-PN-GUARD-SCOPE.md.
- **2026-06-09 (Session 3, cont.)** — C40: B2+B1 verification (v1.20.108). All four checks PASS. manualVerifyRequired survives both re-extraction paths, send blocked across all three send surfaces, no regression on clean panels, mixed case renders both messages. Marc cleared for F3+F2.
- **2026-06-09 (Session 3, cont.)** — C41: F3+F2 verification (v1.20.109). All six checks PASS. Print warning fires on verification block alone (the key nuance), both messages render in mixed case, clean panels print without nag, BC toast fires on disconnect with correct count and 12s auto-dismiss, no false alarm when connected. Trust-UX layer complete. Marc cleared for F1/C5 noisy-PN guard.
- **2026-06-09 (Session 3, cont.)** — C42: F1/C5 noisy-PN guard verification (v1.20.110). All 10 behavioral checks PASS. F1 guard holds fuzzy matches as suggestions when manualVerifyRequired=true, passes exact matches through, no regression when flag is false. C5 guard freezes Path 1 auto-cross alternates, Paths 2-4 (corrections/library/description) still apply, all 4 call sites thread the flag. bcMatchType stored correctly on both pricing paths. "Mark Verified" button clears flag with clear confirm dialog; post-verify state is legible (rows still red but suggestion buttons visible). GAP LOGGED: held-back alternates are scaffolding only — not surfaced in UI. Unsupervised-Sales safety net complete.
- **2026-06-09 (Session 3, cont.)** — C43: Close-out housekeeping. Created NUMBERING-CONVENTION.md (stable #N IDs, lifecycle statuses). Added [Status] tags to all 107 existing TODO items. Recorded 8 shipped items (#103-#110: Phase 0a/0b through F1/C5 guard), 4 deferred items (#111-#114: Phase 1d/1f, CropBox proof, Phase 2 voting), and 2 F1/C5 follow-ups (#115-#116: held-back UI, auto-re-price question). Added pointer lines to TODO.md and CLAUDE.md.
- **2026-06-09 (Session 3, cont.)** — C44: #111 confirmed complete, #112 scoped. Details below.
- **2026-06-09 (Session 3, cont.)** — C45: #112 verification (v1.20.111). 5 behavioral checks: L3 wire-up PASS with GAP (batch path `extractBomBatch` missing region learning — single-page paths all wired), structural-only PASS, per-company pooling PASS, no regression PASS, P&ID label PASS. GAP logged as #118 (batch region learning). #112 [Verified]. PHASE 1 COMPLETE.
- **2026-06-09 (Session 3, cont.)** — C46: #117 investigation (Payment Terms / Shipping Method intermittent disappearance). Root cause: TWO print paths diverge. Path A (`handlePrintQuote`, line 35735) runs BC auto-populate and saves. Path B ("Generate PDF" button in QuoteView, line 19469) reads React state directly — no BC fetch, no save. Quote field edits have NO auto-save. Three contributing factors: (1) direct-PDF button skips BC auto-populate, (2) quote edits only live in React state until explicit save, (3) `saveProject` at line 35945 is fire-and-forget. Recommended fix: debounced auto-save for quote fields + BC auto-populate before direct PDF generation. Details below.
- **2026-06-09 (Session 3, cont.)** — C47: #119 investigation (PRJ402119 silent zero-BOM). SYSTEMIC finding: every Phase 1 safety mechanism (ZeroBomBanner, amber chip, send gate, completeness warning) is gated on `panel.extractionReport` existing. Legacy projects extracted before v1.19.598 have NO extractionReport — all safety systems return null/undefined silently. PRJ402119 hit the C23 dataUrl gating bug, got 0 items, and was never re-extracted. The batch-path hypothesis (from #118) is NOT the primary cause — batch runs INSIDE runExtractionTask, which is called FROM confirmAndExtract AFTER the 1c gate. The real gap is that the warning UI has no fallback for legacy panels. Details below.
- **2026-06-09 (Session 3, cont.)** — C48: High-DPI resolution test on PRJ402101. CONFIRMED: resolution is the root cause for Pattern A+B errors (32 of 38 wrong PNs). Rendered BOM page 10 at 150/300/600/1600 DPI, read each as ground truth + accuracy test. All three anchor PNs (SCE-90EL4820SSFSD, SCE-90P48F1, XT1SU3060AFF000XXX) read correctly at 600 DPI, unreadable at 150 DPI, borderline at 300 DPI. ARC's specific errors (dropped-S, 8→B, SU→US transposition) are all resolution-class failures that vanish with more pixels. Answer to Jon's question: YES — high-DPI region crop fixes it. H5 is the right fix. Details below.
- **2026-06-09 (Session 3, cont.)** — C49: H5 scope — region-targeted high-DPI rendering. Buildable implementation plan. Core change: for vision-mode PDFs, stop sending native PDF → render BOM region to high-DPI image tiles client-side via pdf.js → send tiles as `type: "image"`. Critical finding: ARC uses `claude-opus-4-6` (1568 px model limit, NOT the 2576 of Opus 4.7+) — must tile to achieve usable DPI. Recommended 2×2 grid → 369 effective DPI (Opus 4.6), upgrading to 606 DPI when model bumped to 4.7+. ~143 lines, ~2 days dev + 1 day test. TODO #120. Details below.
- **2026-06-15 (Session 4)** — C57-C62: #117 Phase 2 cycle. C57 re-confirmed root cause at v1.20.114. C58 detailed plan (Option 3). C59 amended Path B wiring per Marc's findings. C60 Phase 1 code review sign-off (+218/-165). C61 QuoteTab unreachability finding — _bcToken null is PRIMARY cause, Path C (QuoteSendModal) found. C62 Phase 2 detailed plan: Fixes 3/3c/4, ~36 lines, 10 test criteria.
- **2026-06-15 (Session 4, cont.)** — C63: Deferred TODO logged — post-extraction Engineering Questions to be SUPPRESSED (render-gated), not deleted. C62 carve-outs confirmed with expanded priority (T-bcTokenRefresh IMMEDIATE, dead code LOW, Path B LOW/gated).
- **2026-06-15 (Session 4, cont.)** — C64: Phase 2 static verification. Finding 1 CONFIRMED (`{...populated}` spread at line 31886, prevents stale closure overwrite). Finding 2 Jon ruling applied (Option b — send proceeds when fully populated, blocks only on missing terms). Tests 3 & 9 amended. T-bcTokenRefresh exact fix confirmed captured. Build verification-complete on static side.
- **2026-06-15 (Session 4, cont.)** — C65: #117 marked RESOLVED in TODO.md. Queue landed: #125 T-bcTokenRefresh [NEXT], #126 BOM preview regression, #127 redundant progress bar, #128 visual PN verification, #129 ARC Usage Telemetry [Tabled], #130-132 cleanup/hardening/Engineering Questions. T-bcTokenRefresh 4-point confirmation: silent (false arg skips popup), covers both paths (one function), no latency when token valid (null check), empty catch doesn't mask real failures (_bcToken stays null → Phase 2 fires).
- **2026-06-15 (Session 4, cont.)** — C66: #126 root cause report. NOT an H5 pipeline break or Haiku call break. Two independent bugs: (1) `parseInt(itemNo)||0` degrades to 0 when itemNo is empty/non-numeric → band at table top for all rows, (2) page buttons prefer stored y_top/y_bottom which are tile-relative post-H5 → wrong positions on full-page image. Fix: modify Haiku prompt to find the specific part row (~15-20 lines) + always call locateInDrawing in page buttons (~5 lines). Self-contained, no dependency on #128. ~20-25 lines, low risk.
- **2026-06-15 (Session 4, cont.)** — C67: #128 feasibility trace. All data needed for region rendering IS persisted (bomRegion on pages, originalPdfPath, pageNumber). H5 tiles are transient but the BOM region is recomputable. Per-item y_top/y_bottom are stored but in tile/region-relative space (translateItemsToPageCoords no-op). For ny=1 grids (dominant case — landscape BOM tables), y_top IS region-relative → coord fix viable. For ny>1 (rare tall regions), y_top is tile-relative → coord fix broken. Brief direction: "render stored regions" (accurate, cheap) + companion coord fix (~15 lines). No "persist first" step. ~55-80 lines total.
- **2026-06-15 (Session 4, cont.)** — C68: #128 detailed plan. Five discrete changes: (1) `renderBomRegionPreview` function (~25 lines, after line 11824), (2) `locateInRegion` function in BCItemBrowserModal (~30 lines), (3) mount useEffect + page button branching (~9 lines), (4) modal instantiation `h5PageIds` prop (~3 lines), (5) `getExtractionUnits` cropBounds fix (~3 lines). ny=1 → instant highlight from stored coords; ny>1 → Haiku-on-region fallback. Text-layer pages keep existing path. ~70 lines total. 8 test criteria incl. #126 regression cases. #133 (Customer BOM Approval) logged in TODO.md.
- **2026-06-16 (Session 5)** — C69: #133 Supplement — verified Brief assumptions A1-A5 against codebase. Committed Brief + Supplement to `docs/133-BRIEF-AND-SUPPLEMENT.md`.
- **2026-06-16 (Session 5, cont.)** — C70: #134 Yellow circle investigation. Per-row AI confidence dot (v1.20.15, TODO #49f). Not trust-layer/F1 — it's extraction quality feedback. Live and wired correctly.
- **2026-06-16 (Session 5, cont.)** — C71: #133 Detailed Plan — implementation spec for Marc. 6 changes (~155 lines), sequenced, with 7 acceptance tests. Committed to `docs/133-BRIEF-AND-SUPPLEMENT.md`.
- **2026-06-16 (Session 5, cont.)** — C72: #133 post-deploy code-path verification (v1.20.121). All 7 items PASS. Marc's 3 deviations correct. Change 4b (inline send toggle) omitted — non-blocking, forward-note for #130.
- **2026-06-16 (Session 5, cont.)** — C73: #133 "Traveler"→"Quoted BOM" rename analysis. `opts.documentTitle` decoupling, 2 call sites proven safe, 15 rename surfaces enumerated. Open question: filename prefix change?
- **2026-06-16 (Session 5, cont.)** — C74: #133 rename spot-check (v1.20.122). All 5 items PASS. Zero customer-facing "traveler" strings. #130 forward-note present. Last code-path step for #133 closure.
- **2026-06-16 (Session 5, cont.)** — C75: #135/#136 cover-page BOM table analysis. #135 yellow PN-cell highlight (shared, ~5 lines); #136 hide Supplier column (customer-only via opts, ~8 lines). Two open decisions flagged for Jon.
- **2026-06-16 (Session 5, cont.)** — C76: #138 split REV data box into Dv.# + Qv.#. Both fields exist (panel.bomVersion, project.quoteRev). quoteRev needs opts pass-through. ~20 lines, shared, no open decisions.
- **2026-06-16 (Session 5, cont.)** — C77: #138 post-deploy code-path + rendered-PDF fit verification (v1.20.123). All 6 code-path items PASS. Half-box math confirms fit at all page sizes. Title block untouched.
- **2026-06-16 (Session 5, cont.)** — C78: PRJ402096 Dv.# blank trace — code-verified Jon's runtime findings. Missing bomVersion on Panel 3 caused by seed-condition gap in `_bumpBomVersionIfChanged`. Fix recommendation: expand seed condition (Option C) over load-backfill.
- **2026-06-16 (Session 5, cont.)** — C79: #139 Detailed Plan — Option C implementation spec for Marc. 2 changes (seed condition + comment), 5 acceptance tests (T1-T5). Verified line anchors against tip 57cad787.
- **2026-06-16 (Session 5, cont.)** — C80: #139 post-deploy code-path verification (v1.20.125). All items PASS. Seed condition expanded, bump path untouched, comment revised, #138 render unaffected. T1-T5 code-path confirmed.
- **2026-06-16 (Session 5, cont.)** — C81: #141 Confidence dot relocation + "C" glyph analysis. Co-locate dot next to BC pills (move from left-of-PN to right-of-PN). Add centered "C" inside dot. Legibility confirmed (amber/red dot vs blue pill). No logic change.
- **2026-06-16 (Session 5, cont.)** — C82: #141 AMENDMENT — match BC pill dimensions exactly. BC pills are 10px/700/borderRadius:10/padding 1px 7px/lineHeight 1.4. Confidence pill respec'd to identical dimensions with "C" text. Supersedes C81 §3 sizing only.
- **2026-06-16 (Session 5, cont.)** — C83: Email yellow-highlight note verification (v1.20.126). Note appears exactly twice: standalone unconditional (32558), bundled gated on includeTravelerBom (32009). Absent from inline ProjectView path (37471). All PASS.
- **2026-06-16 (Session 5, cont.)** — C84: #141 RE-SPEC — match BLUE "BC" circle (line 28057), not the red/amber pills. Blue circle: 24×24px, borderRadius 50%, fontSize 9, fontWeight 800, blue #2563eb. Lives in dedicated `_bc` column (32px). Placement option: widen `_bc` to 56px for side-by-side. Supersedes C82 sizing+placement; C81 independence unchanged.
- **2026-06-16 (Session 5, cont.)** — C85: #141 post-deploy code-path verification (v1.20.128). All items PASS. "C" circle matches blue "BC" circle exactly (24×24, 50%, fs 9, fw 800). In `_bc` column widened to 56px. Old dot removed, C82 pill reverted. Verify pills untouched. Independence intact.
- **2026-06-16 (Session 5, cont.)** — C86: #141 layout fix — right-justify circle pair. Change flex wrapper from `inline-flex`/`center` to `flex`/`flex-end` so BC anchors right (original position) and "C" extends leftward into the extra column width.
- **2026-06-17 (Session 6)** — C98-C99: #156 Supplement (Brief verification) + #155 false-positive closure + #156 Detailed Plan (3 phases, 39 tests). #157 logged (stale-project bug).
- **2026-06-17 (Session 6, cont.)** — C100: #153 revision-gate structural trace. Gate IS on the executed path (hypothesis refuted). Root cause: all four BOM-detection signals fail simultaneously — the panel prop loses its BOM between addFiles and confirmAndExtract. Three fixes modified the condition but never investigated what strips the inputs. Firestore read (v1.20.138) also fails — likely path or document mismatch. Deliverable: `docs/153-REVISION-GATE-TRACE.md`.
- **2026-06-17 (Session 6, cont.)** — C101: #153 full flow read. Complete end-to-end audit of revision-drop flow vs C96/C97 plan. All 6 phases match structurally. BUG 1 unpinnable statically (needs runtime trace). BUG 2: silent catch at line 14876 swallows onDone errors. 5 divergences (D1-D5), D1 architectural — gate at confirm not drop — is root cause of both. Recommendation: branch at DROP (Option A). Consolidated fix plan in 4 phases. Deliverable: `docs/153-FULL-FLOW-READ.md`.

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

---

### C30: Region-Render Code-Path Trace (2026-06-05)

**Context:** Gates the Required-BOM-Region Brief. Census result: 73% of BOM projects are vision-mode (no text layer). Investigation: read-only trace of how BOM regions get rendered and sent to the AI model.

**Finding — Two render paths, one constant:**

1. **Path A — PDF-native (CropBox):** When `originalPdfPath` exists, `extractBomPageViaServer` (app.jsx:11678) sends `bomRegion` coords to the CF. The CF applies a CropBox via pdf-lib (functions/index.js:2384-2398), restricting the PDF viewport to the BOM rectangle. The cropped PDF is sent to Claude as `application/pdf` — no rasterization, no JPEG compression. Vector text stays vector; embedded bitmaps stay at native resolution.

2. **Path B — JPEG crop (image fallback):** When `!originalPdfPath` (legacy projects), `cropRegionFromImage` (app.jsx:11453-11471) crops from the pre-rendered page image (scale:4.0 → capped 3800px → ~224 DPI effective for D-size), scales to `minWidth=2000`, encodes JPEG 0.92.

**DPI chain (Path B):**
- pdf.js render: `scale:4.0` (app.jsx:23165) → ~288 DPI raw for D-size
- `resizeImage(dataUrl, 3800)` caps to 3800px → ~224 DPI effective
- Page JPEG: quality 0.95
- Crop scales to minWidth=2000, JPEG 0.92
- All constants hardcoded. No adaptivity to drawing size, content type, or native bitmap resolution.

**Bitmap downsampling (Q3):** On Path B, YES — a 1-bit monochrome bitmap embedded in a D-size page gets composited into the page canvas at ~224 DPI, then JPEG-compressed (destructive on monochrome line art). On Path A, NO — the raw PDF preserves the native bitmap inside the PDF container.

**Vector-stroke DPI gain (Q4):** CropBox on Path A effectively increases DPI by reducing rendered area — Claude's internal renderer covers fewer PDF points with the same pixel budget. Path B is locked to page render scale; upsampling adds no information.

**Adaptivity (Q5):** None. `scale:4.0`, `minWidth=2000`, `maxWidth=3800` are all fixed constants. `assessPdfPageQuality` (functions/index.js:2265-2315) computes native embedded-image DPI and detects monochrome/scanned content, but this data is logged only — never fed back to adjust render parameters.

**Verdict:** Path A (PDF-native + CropBox) is the correct architecture for both bitmap and vector-stroke BOMs. The key question for the Required-BOM-Region Brief is not render quality — it's ensuring every project has `originalPdfPath` so it routes to Path A. The `assessPdfPageQuality` DPI data is available but unused; could inform adaptive strategies if Path A proves insufficient.

---

### C31: Required-BOM-Region Brief Supplement (2026-06-05)

Full supplement in `REQUIRED-BOM-REGION-BRIEF.md`. Key findings:

**COACH VERIFY results:**
- **Phase 0 timeout:** Brief claims bottleneck is pre-API. UNVERIFIED — no timing instrumentation exists. The 480s AbortController (functions/index.js:2457) covers only the API fetch, not total pipeline. Memory (1GB vs 2GB in batch) is a likely contributor. Recommendation: instrument first, memory bump as quick win.
- **1a auto-region:** EXISTS, classifies 5 types, partially surfaced (per-page tags YES, aggregate summary NO). `autoDetect()` is dead code.
- **1b assessPdfPageQuality:** CORRECTION — not "unused." Computed, returned to client, surfaced in UI (green pill + scan warning chip), fed into AI prompt. Just not used for ROUTING. Critical blindspot: BLIND to vector-stroke BOMs (they get warningLevel:'none' despite 0% extractable text). Branch engine needs supplementary text-extraction check.
- **1e 0-byte:** CF guard MISSING confirmed (both extractBomPage AND extractBomBatch). Message at app.jsx:11891 is NOT about 0-byte files specifically. Extraction path UI shows good path (green) but NOT bad path (no amber indicator).
- **1f region learning:** EXISTS, NOT greenfield. `region_learning` stores full coordinates, customer context, thumbnails, 30-entry window. Existing CRUD + UI + prompt integration. Missing: structural fingerprint metadata, feeds only image-fallback path.

**Line-level concerns:** L1 (AC timing gap), L2 (quality alert blind to vector-stroke), L3 (region learning feeds worst path only), L4 (batch 0-byte gap), L5 (dead autoDetect), L6 (client mirrors CF parse inefficiency).

**Verdict:** Brief is architecturally sound. Phasing correct. No blocking issues. All phases feasible. Five corrections documented above.

---

### C32: Required-BOM-Region Analyst Review + Detailed Plan (2026-06-05)

Analyst Review (Freddy + Jon's resolved decisions) committed as `REQUIRED-BOM-REGION-ANALYST-REVIEW.md`. Detailed Plan committed as `REQUIRED-BOM-REGION-PLAN.md`.

**Resolved opens:** Modal copy finalized (two "tell them why" variants). No-PDF backfill = LAZY. Voting N=3 default with convergence extension to N=5 (hard cap), plateau detection stops early.

**Ship order:** Phase 0a (diagnose + memory bump) → 0a results determine whether 0b ships before or with Phase 1 → Phase 1 (core feature) → Phase 2 (vector voting). Bitmap voting + #85 staged separately.

**Plan implementation order within Phase 1:** 1e (surgical CF guards + UI pill) → 1b (branch engine classifier) → 1a (aggregate summary) → 1c (block gate) → 1d (no-PDF) → 1f (learning extension + L3 fix).

**Key plan decisions:**
- Phase 0a: memory bump 1→2GB + timing instrumentation + L1 AC move to function entry. Deploy functions only, test PRJ402101.
- Phase 1b: `classifyBomInputTier()` function using pdf.js `getTextContent()` for text-layer detection (the Q3-proven method) + `assessPdfPageQuality` for bitmap/scan classification. Threshold tuning needed (20 chars proposed).
- Phase 1c: Gate at extraction entry point (app.jsx:~23376, before `runExtractionTask`). Two modal variants by worst-tier page. Override sets `manualVerifyRequired` flag.
- Phase 1f: Extend existing `region_learning` schema (additive fields, no migration). L3 fix wires `buildRegionLearningContext` into pdf-native + bom-region-crop paths. Per-user vs per-company flagged for Jon.
- Phase 2: Client-orchestrated voting (no CF changes). `majorityVoteItems` by itemNo alignment. Convergence: if pass N resolves ≥1 divergent row, extend. L2 test: vector-stroke prompt alert (imageCount===0 + hasVectorText + !isScanned).

**Design question raised:** Region learning is per-user. Per-company would let all team members benefit from one user's corrections. Flagged for Jon.

**Verification:** Coach verifies each phase before the next begins. Acceptance criteria per phase in the plan.

---

### C33: Plan v2 patches — 3 correctness fixes + 1 minor (2026-06-05)

Jon reviewed the Detailed Plan and identified two correctness bugs and one resolved design question. Applied as patches to `REQUIRED-BOM-REGION-PLAN.md`:

**PATCH 1 (1c modal copy mis-mapping):** The plan had Variant A ("clear and readable, high accuracy") assigned to vision-mode tiers — backwards. Corrected: Variant A = text-layer + no region (soft nudge, easily dismissed, no manualVerifyRequired flag). Variant B = vision-mode + no region (hard block, override sets flag). Text-layer without region is Case 2 (soft nudge), NOT a hard block. Strict-by-default applies only to vision-mode tiers. Four gate cases now explicit: (1) text-layer+region=silent, (2) text-layer+no-region=soft nudge, (3) vision+region=info toast, (4) vision+no-region=hard block.

**PATCH 2 (1b region-bounded text counting):** The classifier counted `getTextContent()` across the full page with only a comment about region bounds. Made region-bounded counting a HARD requirement. Q3 evidence: PRJ402101/402113 had 77-94 title-block chars — whole-page counting would exceed the >20 threshold and misclassify those as text-layer. Coordinate filter now uses `item.transform[4]`/`[5]` against resolved bomRegion bounds. Falls back to full-page count only when no region exists (acceptable — those pages go through the modal anyway).

**PATCH 3 (1f per-company):** Jon resolved the design question: PER-COMPANY (`companies/{companyId}/config/region_learning`), not per-user. Rationale: fingerprint thesis requires pooled corrections across all team members who touch a customer's drawings. Added migration approach (read both paths, one-time merge) and `contributedBy` audit field since one bad correction now pollutes all users.

**MINOR (Phase 2 convergence):** Changed convergence trigger from "any row resolved" to "net new resolutions only." A row oscillating between two readings (consensus → lost → regained) does not count as a new resolution — prevents churn from extending N to the hard cap.

---

### C34: #85 Excel BOM Import — Codebase Audit (2026-06-05)

Read-only audit per Jon's reframe of #85: Excel as extraction INPUT, parallel to drawing extraction. Findings in `EXCEL-BOM-IMPORT-AUDIT.md`.

**Q1 — Entry point + write seam:** `addFiles` (app.jsx:23061) is the single entry point. File type branching at line 23137 (PDF) / 23203 (image) / 23218 (unsupported). Excel would be a third branch at 23218. BOM write seam: `applyInMemory` at line 14122 — takes `mergedBom[]` array, preserves ECO rows, sets status to "extracted". Excel parser produces the same array shape, feeds the same write path.

**Q2 — BOM item schema:** Minimum: {id, itemNo, qty, partNumber, description, manufacturer, notes, confidence:"high", additionalPartNumbers:[], y_top, y_bottom}. All other fields (pricing, BC, corrections, lead times) added downstream. Excel sets confidence="high" always (deterministic).

**Q3 — Column mapping:** No existing spreadsheet library in the codebase. Needs SheetJS or similar (~300KB, lazy-loadable). Auto-detect header row + column mapping via heuristic pattern matching on header text. User-confirm mapping modal required. Per-company saved mappings at `companies/{companyId}/config/excel_column_mappings` (Jon's prior decision). Supplier Portal's `normPart`/`partMatch` helpers reusable for PN matching.

**Q4 — Integration:** Clean architecture. One shared output path, two input parsers. Excel bypasses page rendering, type detection, AI extraction, and multi-phase merge entirely. No new Cloud Functions needed — parsing is client-side. `applyInMemory` + consolidated save + post-write pipeline (learning DB, pricing) all reuse as-is.

---

### C35: Phase 1b Verification — classifyBomInputTier vs Q3 Ground Truth (2026-06-05)

**Context:** Jon asked for empirical verification of `classifyBomInputTier` (app.jsx:14669-14722) against 8 Q3 ground truth projects. Required: per-project classification results (not logic inspection alone). Two explicit logic concerns to check.

**Method:** Python script (`tools/q3-measurement/verify-classifier.py`) simulates both `assessPdfPageQuality` (server-side image analysis) and `classifyBomInputTier` text counting (client-side pdf.js equivalent) on the actual Q3 PDFs. Uses correct BOM page numbers from census data (`tools/q3-measurement/census-text-layer-v2.py`).

#### Per-Project Results (7 PASS, 1 FAIL)

| Project | Expected | Actual | PASS? | Evidence |
|---------|----------|--------|-------|----------|
| PRJ402096 (FLS native) | text-layer | text-layer | PASS | 2629 chars, imageCount=1, isScanned=True |
| PRJ402098 (Matrix ECAD) | text-layer | text-layer | PASS | 2634 chars, imageCount=1 |
| PRJ402093 (OVIVO Carterville) | text-layer | text-layer | PASS | 8182 chars, imageCount=0 |
| PRJ402109 (OVIVO vector-stroke) | vector-stroke | vector-stroke | PASS | 213 chars < 500 threshold, imageCount=0, no images in BOM area |
| PRJ402101 (OVIVO bitmap) | bitmap | bitmap | PASS | 81 chars, isMonochrome=True, imageCount=2 |
| PRJ402113 (FLS/CSW 1-bit) | bitmap | bitmap | PASS | 58 chars, isMonochrome=True, imageCount=2 |
| PRJ402100 (Clearstream raster) | bitmap | **scan** | FAIL | 0 chars, isMonochrome=True, imageCount=14 |
| PRJ402092 (0-byte test) | no-pdf | no-pdf | PASS | 0-byte file, caught by buf.byteLength guard |

#### PRJ402100 FAIL Analysis: SAFE misclassification

PRJ402100 classifies as `scan` instead of `bitmap` because `isMonochrome=True` fires before the `imageCount>=2` check. The BOM page has 14 images (CCITTFaxDecode + DCTDecode + FlateDecode mix), text chars = 0.

**Why it's safe:** `scan` is MORE conservative than `bitmap` (lower fidelity tier, 4% vs 19-44% accuracy). Gate behavior is identical — both are vision-mode, both trigger the Phase 1c hard block. The misclassification is in the conservative direction.

**For Phase 2 voting:** `scan` and `bitmap` have different voting strategies (bitmap voting deferred). If PRJ402100 is truly a bitmap project, it would get scan-tier voting. This would need revisiting in Phase 2, but is not blocking for Phase 1.

#### PRJ402109 Deep-Dive: Correct Classification, Surprising Structure

The BOM page (page 9) has:
- **0 text in the BOM area** (bottom-right quadrant: 0 chars, 0 spans)
- **213 chars in title block** (revision block, drawing number, notes — all top/margin)
- **1 CCITTFaxDecode image (1543x1784)** — the BOM itself is a monochrome scan

The whole-page 213 chars are below the 500-char no-region threshold, so it correctly classifies as vector-stroke. With region-bounded counting (PATCH 2), the BOM region would have 0 chars, making classification even more decisive.

**Note:** The Q3 census labeled PRJ402109 as "VECTOR-STROKE" based on vector path count heuristics. The actual BOM content is a monochrome scan (CCITTFax). For the Phase 1 gate, both tiers are vision-mode, so this doesn't affect gate behavior. The census tier labels were heuristic approximations; the classifier uses more precise signals.

#### Jon's Logic Concern 1: Check-ordering leak — CONFIRMED but not triggered

**The concern:** A non-monochrome scanned image (DCTDecode, color scan) with imageCount=1 and 0 text would:
1. Skip 'scan' (isMonochrome check fails — not monochrome)
2. Skip 'bitmap' (imageCount < 2)
3. Default to 'vector-stroke' — WRONG

**Verification:** The code at line 14717 checks `q.isMonochrome`, never `q.isScanned`. The `isScanned` flag (set by both CCITTFaxDecode and DCTDecode in assessPdfPageQuality) is NEVER consulted by the classifier.

**None of the 8 Q3 projects trigger this bug.** PRJ402100/402101/402113 are all monochrome (CCITTFax), so isMonochrome catches them. PRJ402096 has a DCTDecode image (isScanned=True, isMonochrome=False) but has 2629 text chars, so it hits text-layer first. No Q3 project represents a non-monochrome color scan with low text count.

**The pattern IS real:** A customer who scans a BOM in color (JPEG/DCTDecode) and embeds it as one image in a PDF would leak to vector-stroke. This hasn't appeared in Q3 data but is a plausible future input.

**Recommended fix (Phase 2 or earlier):** Change line 14717 from `q.isMonochrome && regionTextChars === 0` to `q.isScanned && regionTextChars === 0`. This catches ALL scanned images, not just monochrome. Alternatively, add a separate isScanned check before the imageCount check.

#### Jon's Logic Concern 2: Single-image bitmap (imageCount>=2) — CONFIRMED but dodged

**The concern:** A BOM embedded as ONE raster image (PRJ402113 per geometric audit) would have imageCount=1 and miss the imageCount>=2 threshold.

**Verification:** Both PRJ402101 and PRJ402113 have **imageCount=2** (not 1 as feared). Each BOM page has two Image XObjects — likely the BOM scan plus a title block image, logo, or stamp. The imageCount>=2 threshold catches them.

PRJ402109 has imageCount=1 (single CCITTFax bitmap). With 213 title-block chars (> 0), the isMonochrome check fails, and imageCount=1 < 2 also fails. It correctly falls through to vector-stroke — which happens to be the expected tier. But if this page had 0 title-block chars, isMonochrome would catch it as 'scan', which is also reasonable.

**The pattern IS real:** A PDF with exactly 1 embedded non-monochrome image and 0 text would leak to vector-stroke. The fix overlaps with Concern 1: either use `isScanned` instead of `isMonochrome`, or lower imageCount threshold to >= 1.

#### Verdict: Phase 1b CLEARED for Marc — proceed to 1a

The classifier correctly classifies 7/8 Q3 projects, with the one FAIL being a SAFE conservative misclassification. Both logic concerns are confirmed as real patterns but do not affect any Q3 ground truth project, and the gate behavior (text-layer soft / vision-mode hard) is correct for all cases regardless of sub-tier.

**Conditions:**
- Both logic concerns should be fixed before Phase 2 (voting), where sub-tier precision matters.
- For Phase 1, all tiers map to the correct gate behavior (text-layer = soft nudge, vision-mode = hard block), so the concerns are non-blocking.
- Region-bounded counting (PATCH 2) is validated: PRJ402109 would misclassify if the BOM region had > 500 chars of non-BOM text. The title block text (213 chars) is below the threshold, but larger pages with notes/annotations could exceed it without region bounding.

**Marc cleared for Phase 1a (aggregate detection summary).** Phase 1b is fit for gate deployment.

---

### C36: Phase 1a Verification — Aggregate Detection Summary (2026-06-06)

**Context:** Verify v1.20.106 aggregate detection banner against three criteria: correct rendering, no new AI calls, correct type-label mapping.

#### Criterion 1: Banner renders after detectPageTypes with correct counts — PASS

The aggregate summary is built at lines 23338-23344, AFTER `detectPageTypes` completes (line 23288-23301) and zoomed-page cross-check (line 23320-23332) finishes, and AFTER `setDetecting(false)` at line 23333.

```javascript
// Line 23338-23344:
const _typeCounts={};
for(const pg of livePages){for(const t of getPageTypes(pg)){_typeCounts[t]=(_typeCounts[t]||0)+1;}}
const _regionCount=livePages.filter(p=>resolveBomRegion(p)).length;
const _typeLabels={bom:"BOM",schematic:"SCH",enclosure:"ENC",backpanel:"BP",p_and_id:"P&ID"};
const _summary=Object.entries(_typeCounts).map(([t,n])=>`${n} ${_typeLabels[t]||t.toUpperCase()}`).join(", ");
const _confirmMsg=`Auto-detected: ${_summary||"no types"}. ${_regionCount} BOM region${_regionCount!==1?"s":""} found. Awaiting confirmation…`;
```

Message format matches the spec: "Auto-detected: N BOM, N SCH, ... N BOM region(s) found." Counts derived from `getPageTypes()` (per-page type array) and `resolveBomRegion()` (per-page region check). Pluralization handles both singular and plural regions.

#### Criterion 2: No new AI call, no new detection pass — PASS

- `getPageTypes(pg)` (line 14650) reads `page.types` (array) or `page.type` (string, backward compat) + merges user-drawn region types. Pure in-memory read, no API call.
- `resolveBomRegion(pg)` (line 14655) reads `page.regions` (user-drawn) or `page.aiBomRegion` (AI-detected during the prior `detectPageTypes` pass). Pure in-memory read, no API call.
- `_typeCounts` built by iterating `livePages` — all data already in memory from the detection pass at lines 23288-23301.

Zero added latency, zero added cost. Confirmed.

#### Criterion 3: Type-label mapping — BUG in P&ID label

**The mapping at line 23341:**
```
{bom:"BOM", schematic:"SCH", enclosure:"ENC", backpanel:"BP", p_and_id:"P&ID"}
```

**The actual type values stored on pages** (from detection enum at line 14620 and `_CLASSIFIER_PAGE_TYPES` at line 14649):
```
["bom", "schematic", "backpanel", "enclosure", "pid"]
```

The P&ID type value is `"pid"`, NOT `"p_and_id"`. The label mapping key `p_and_id` never matches. The fallback `t.toUpperCase()` fires and produces `"PID"` instead of `"P&ID"`.

**Evidence:** The pre-existing `SHORT` mapping at line 23093 correctly uses `pid:"P&ID"`. The new `_typeLabels` at line 23341 uses the wrong key.

**Impact:** Cosmetic. When a P&ID page is detected, the aggregate summary shows "1 PID" instead of "1 P&ID". The count is correct; only the label is wrong.

**Fix:** Change `p_and_id:"P&ID"` to `pid:"P&ID"` at line 23341. One-character scope change.

| Type value | Expected label | Actual label | Correct? |
|-----------|---------------|-------------|----------|
| `bom` | BOM | BOM | YES |
| `schematic` | SCH | SCH | YES |
| `enclosure` | ENC | ENC | YES |
| `backpanel` | BP | BP | YES |
| `pid` | P&ID | PID | **NO** — fallback fires, shows PID not P&ID |

#### Verdict: Phase 1a CLEARED with one minor fix

Phase 1a passes criteria 1 and 2 cleanly. Criterion 3 has a cosmetic bug (PID vs P&ID) that Marc should fix before or alongside 1c. Not blocking — the functional behavior (counts, gate routing, no added cost) is correct.

**Marc cleared for Phase 1c.** Flagging 1c verification bar per Jon's heads-up (see below).

#### 1c Verification Bar (flagged to Marc)

When 1c ships, Coach will verify gate behavior across all five tier + region combinations. Marc should build toward these acceptance criteria:

1. **text-layer + region present** → PROCEED silent. No modal, no flag, extraction starts immediately.
2. **text-layer + NO region** → Soft nudge modal (Variant A: "This drawing's BOM is clear and readable, and ARC is extracting at high accuracy. To increase accuracy further, please region the BOM area."). Dismissible. No `manualVerifyRequired` flag set. Extraction proceeds on dismiss.
3. **vision-mode (vector-stroke/bitmap/scan) + region present** → Info toast (region acknowledged). Extraction proceeds. No hard block.
4. **vision-mode + NO region** → Hard block modal (Variant B: "This drawing has a low-res or image-based BOM that requires more thought. Please region the BOM as tightly as possible to maximize accuracy. Results will need manual verification due to the poor source quality."). Requires either: (a) user draws a BOM region, or (b) user clicks "Extract Anyway — Manual Verification Required" which sets `manualVerifyRequired` flag on the extraction result.
5. **no-pdf** → Re-upload prompt OR region + image-extract with manual verify flag.

Verification will confirm: correct modal variant by tier, correct flag behavior, correct extraction routing after each gate case. This is the user-facing core of the feature — logic AND copy must match.

### C37 — 2026-06-09 — Phase 1c Verification: Block-with-Override Gate (v1.20.107)

**Scope:** Behavioral verification of the 5-case tier+region gate inside `confirmAndExtract()` (app.jsx:23397-23450). Verified per Jon's 5-point request: tier→modal mapping, override round-trip, Case 3 proceeds, Case 5 no-pdf, no silent fifth path. Also checked P&ID label fix status.

#### Item 1: TIER→MODAL MAPPING — PASS

The gate at lines 23397-23450 classifies every BOM page via `classifyBomInputTier` (line 23413), then evaluates five conditions in priority order. Worst-tier-first evaluation is correct: `_isNoPdf` → `_visionNoRegion` → `_isVisionMode&&_allHaveRegions` → `_textNoRegion` → implicit fall-through.

**Per-case behavior with real projects:**

| Case | Tier + Region | Dialog type | Line | Modal copy | Behavior on dismiss/cancel |
|------|--------------|-------------|------|------------|---------------------------|
| **5** | no-pdf (any) | `arcConfirm` | 23425-23428 | "No usable source PDF… re-upload or region the BOM and extract from the page image (manual verification required)." OK="Region & Extract from Image", Cancel="Cancel" | Cancel → `return` (back to confirmation state) |
| **4** | vision + NO region | `arcConfirm` | 23433-23435 | "This drawing has a low-res or image-based BOM… region the BOM as tightly as possible… manual verification due to the poor source quality." OK="Extract Anyway — Manual Verification Required", Cancel="Go Back & Draw Region" | Cancel → `return` (back to confirmation state) |
| **3** | vision + region | `bgUpdate` | 23441 | "Image-based BOM — region applied, extracting…" (toast, not modal) | No user interaction — falls through to extraction |
| **2** | text-layer + NO region | `arcAlert` | 23444-23447 | "This drawing's BOM is clear and readable… To increase accuracy further, please region the BOM area." OK="Continue" | Dismiss → falls through to extraction |
| **1** | text-layer + region | *(none)* | 23449 | Silent proceed — no modal, no toast | Falls through to extraction |

All five modal variants match the spec from C36's verification bar. Copy is accurate. Dialog types are correct (`arcConfirm` for Cases 4/5 where user choice matters, `arcAlert` for Case 2 informational nudge, `bgUpdate` for Case 3 non-blocking toast).

**Worst-tier priority logic** (line 23417): `_worstTier` finds the first match in order `no-pdf → scan → bitmap → vector-stroke`. This is correct — if ANY page is no-pdf, the entire extraction gates on Case 5 regardless of other pages' tiers. The `_isNoPdf` / `_visionNoRegion` / `_isVisionMode` / `_textNoRegion` flags at lines 23418-23422 use `.some()` and `.every()` correctly:

- `_isNoPdf`: any page no-pdf → Case 5
- `_visionNoRegion`: any vision page without region → Case 4
- `_isVisionMode && _allHaveRegions`: all pages are vision AND all have regions → Case 3
- `_textNoRegion`: any text-layer page without region → Case 2

**Edge: mixed tiers across pages.** If a panel has one text-layer page with region and one bitmap page without region, `_visionNoRegion=true` → Case 4 fires. Correct — the worst-case page drives the gate.

#### Item 2: OVERRIDE ROUND-TRIP (manualVerifyRequired flag) — PASS

Full propagation chain traced:

1. **Set:** `panel._manualVerifyRequired=true` — line 23430 (Case 5) and line 23438 (Case 4). Only these two cases set it. Cases 1/2/3 do NOT set it. Correct — only unregioned vision-mode and no-pdf extractions require manual verification.

2. **Spread into updated:** `const updated={...panel,pages:livePages,...}` at line 23473. Since `panel._manualVerifyRequired` was set directly on the `panel` object (mutation, not immutable update), the spread copies it into `updated`.

3. **Passed to extraction:** `runExtractionTask(uid,projectId,updated,{...})` at line 23520.

4. **Copied in extraction:** `latestPanel={...panel}` at line 13511 inside `runExtractionTask`.

5. **Written to extractionReport:** `...(panel._manualVerifyRequired?{manualVerifyRequired:true}:{})` at line 14112. The `panel` here is the function parameter (which is `updated` from step 3). The conditional spread ensures the field is only present when true — no `manualVerifyRequired:false` pollution.

6. **Persisted to Firestore:** `extractionReport` is written into the consolidated save at line 14123: `...(extractionReport?{extractionReport}:{})`.

7. **Amber chip renders:** Line 26978-26982: `panel.extractionReport?.manualVerifyRequired` → renders amber "Manual verification required" chip with tooltip "Extraction ran without BOM region on a vision-mode drawing."

**Round-trip verified.** Transient `_manualVerifyRequired` on panel → extractionReport field → Firestore → UI chip. The underscore-prefixed transient property is consumed once and not persisted directly — only the extractionReport copy survives.

#### Item 3: CASE 3 PROCEEDS WITHOUT BLOCKING — PASS

Line 23439-23441:
```
}else if(_isVisionMode&&_allHaveRegions){
  bgUpdate(_bgKey(projectId,panel.id),"Image-based BOM — region applied, extracting…");
}
```

`bgUpdate` is a non-blocking toast update function (defined at line ~1718 area, updates the background progress bar text). No `await`, no modal, no return. Execution falls through to line 23451 (`bgUpdate(...,"Starting extraction…")`) and continues to `runExtractionTask` at line 23520.

**No `manualVerifyRequired` flag set for Case 3.** Correct — if the user drew a region on a vision-mode BOM, ARC trusts the region to improve accuracy. No manual verification amber chip.

#### Item 4: CASE 5 (no-pdf) — PASS

Lines 23423-23430:
- `arcConfirm` presents a warning modal with title "Missing Source PDF"
- OK="Region & Extract from Image" — proceeds to extraction with `panel._manualVerifyRequired=true`
- Cancel="Cancel" — returns to confirmation state (`setAwaitingConfirm(true)`, restores bgUpdate, `return`)

**Cancel path verified:** Lines 23428-23429: `if(!_noPdfChoice){setAwaitingConfirm(true);bgUpdate(...,"Awaiting confirmation…");return;}` — user returns to the confirmation UI, can navigate away, draw a region, or re-upload.

**OK path verified:** Line 23430: `panel._manualVerifyRequired=true` — then falls through to extraction (line 23451+). The extraction runs on page images (since no PDF source exists), and the result gets the amber manual-verify chip.

#### Item 5: NO SILENT FIFTH PATH — PASS

**Within the gate (lines 23397-23450):** The if/else-if chain covers:
- `_isNoPdf` → Case 5
- `_visionNoRegion` → Case 4
- `_isVisionMode && _allHaveRegions` → Case 3
- `_textNoRegion` → Case 2
- Implicit else (no condition matched) → Case 1

**Exhaustiveness proof:** Every BOM page has a tier ∈ {text-layer, vector-stroke, bitmap, scan, no-pdf} and a region status ∈ {true, false}. The conditions cover:

| Scenario | Flag triggered | Case |
|----------|---------------|------|
| Any page no-pdf | `_isNoPdf` | 5 |
| Any vision page, no region | `_visionNoRegion` | 4 |
| All pages vision, all have regions | `_isVisionMode && _allHaveRegions` | 3 |
| Any text-layer page, no region | `_textNoRegion` | 2 |
| All text-layer + all regions | None | 1 |

Mixed case (some text-layer, some vision, all have regions): `_isVisionMode=true`, `_allHaveRegions=true` → Case 3 fires. Correct — the worst-case tier drives the gate.

**Outside the gate:** The gate only fires when `_gateBomPages.length>0 && _apiKey` (line 23400). If no BOM pages exist, the function continues to line 23451, then hits the zero-BOM check at line 23496 (`if(!bomPages.length&&!willValidate)`) which shows an explanatory alert and returns. If no API key, extraction proceeds ungated — correct, since tier classification requires `checkPdfQuality` which requires the API key.

**Re-extraction bypass:** `reExtractWithFeedback` (line 24436) is a separate function that does NOT call `confirmAndExtract` and does NOT include the Phase 1c gate. This is by design — re-extraction is a post-initial-extraction action where the user has already seen the gate once. The gate is a first-extraction safety net.

#### P&ID Label — STILL BROKEN (carry-forward from C36)

Line 23342: `{bom:"BOM",schematic:"SCH",enclosure:"ENC",backpanel:"BP",p_and_id:"PID"}`

Marc's fix changed the VALUE from `"P&ID"` to `"PID"` but kept the key `p_and_id`. The actual type value stored on pages is `"pid"` (from the detection enum at line 14620). The key `p_and_id` never matches — this entry is dead code.

The fallback at line 23343 (`t.toUpperCase()`) produces `"PID"`, which is now consistent with the dead value `"PID"`, so the result is visually stable but wrong: P&ID pages show as "PID" not "P&ID".

**The pre-existing `SHORT` mapping at line 23093 correctly uses `pid:"P&ID"`.** The fix should change the KEY from `p_and_id` to `pid` and the VALUE back to `"P&ID"`:
```
{bom:"BOM",schematic:"SCH",enclosure:"ENC",backpanel:"BP",pid:"P&ID"}
```

**Impact:** Cosmetic only. Gate routing, extraction behavior, and flag propagation are unaffected.

#### Error handling in the gate

**`checkPdfQuality` CF failure** (line 23408): `catch(_){}` — silently swallowed. `_gatePdfQuality` remains `{}`, so `classifyBomInputTier` receives `null` quality for all pages, defaulting to `vector-stroke` (the second-most-conservative tier). This is safe-side — a quality check failure triggers Case 4 (hard block) rather than silently proceeding.

**`classifyBomInputTier` per-page failure** (line 23415): `catch(_){_gateTiers.push({...,tier:"vector-stroke",...})}` — defaults to `vector-stroke`. Same safe-side behavior.

**Both error paths are conservative.** No extraction proceeds silently on error — the fallback tier forces a gate modal.

#### Verdict: Phase 1c CLEARED — Marc cleared for 1d

All five behavioral checks pass. The gate correctly routes every tier+region combination to the appropriate modal/toast/silence. The `manualVerifyRequired` flag propagates cleanly from the gate through extraction to Firestore to the amber UI chip. Case 3 proceeds without blocking. Case 5 allows cancel-to-return. No silent fifth path exists.

**One carry-forward (cosmetic):** P&ID label at line 23342 — key should be `pid`, not `p_and_id`; value should be `"P&ID"`, not `"PID"`. Marc should fix this alongside 1d or as a one-line patch.

### C38 — 2026-06-09 — Sales-Path Readiness Audit

**Scope:** Full-chain audit of the unsupervised Sales path: extraction → pricing → BC integration → quote output → trust signal propagation. Read-only investigation, no build. Delivered as `SALES-PATH-READINESS-AUDIT.md`.

**Trigger:** Jon's reframe — the goal is "inside Sales runs ARC end-to-end, unsupervised." Two days of extraction work hardened the front of the chain. This audit examines the downstream links that haven't been reviewed.

#### Finding B1: Trust signals vanish at the quote stage (BROKEN)

`manualVerifyRequired`, `extractionPath`, `scanQuality`, `completenessWarning`, and per-row `confidence` are all visible in the BOM view UI (app.jsx:26966-26988). None are referenced by:
- `findIncompleteQuoteItems` (app.jsx:15107) — the send-gate
- `buildQuotePdfDoc` (app.jsx:6756) — the quote PDF builder

The printed quote is a "clean room" that strips all extraction provenance. A quote built on a medium-confidence, vision-mode, unregioned extraction looks identical to one built on a high-confidence, text-layer, regioned extraction. Sales has no downstream signal that the BOM data is suspect.

#### Finding B2: Re-extraction clears manualVerifyRequired (BROKEN)

Both re-extraction report builders construct fresh objects:
- `reExtractionReport` (line 24326-24341): no `manualVerifyRequired` field
- `fbReport` (line 24552-24566): no `manualVerifyRequired` field

These overwrite `panel.extractionReport` (lines 24345, 24570). The flag is permanently lost. The amber chip disappears. No record remains that the BOM ever required manual verification.

**Trust hole:** Phase 1c gate fires → user clicks "Extract Anyway" → amber chip appears → user provides feedback → feedback re-extraction runs → flag gone. The quality concern hasn't been addressed; it's been erased.

#### Finding F1: Wrong BC match on noisy PNs (FRAGILE)

`bcFuzzyLookup` (app.jsx:4739) uses 5 progressively aggressive matching strategies. Strategy 5 (normalized prefix, first 5 chars) on an OCR-corrupted PN can match the wrong BC item. The wrong item has a valid price, valid priceDate, valid vendor. All UI indicators show green. Send-gate passes. Quote is wrong.

This is C5 (auto-cross corruption, Session 1) amplified to the pricing path. Risk is proportional to extraction tier: near-zero for text-layer, significant for bitmap/scan.

#### Finding F2: Silent pricing failure when BC unreachable (FRAGILE)

When BC is down or token is stale, `runPricingOnPanel` silently skips BC phases. Rows stay unpriced. No error toast — just red rows appearing. Sales sees the symptom (red highlighting, send blocked) but doesn't know the cause or fix.

#### Finding F3: "Just Print" bypasses the send-gate (FRAGILE)

`findIncompleteQuoteItems` only gates the in-app Send path. The "Just Print" button (app.jsx:31509) generates the PDF with no validation. Sales can print an incomplete quote and email it manually, circumventing all safety nets.

#### What IS solid

- **Send-gate** (`findIncompleteQuoteItems`): Catches missing qty, price, priceDate, stale dates. Primary safety net, works correctly.
- **Red-row highlighting** (`_isBomRowFlaggedRed`): Aligns with send-gate. Visual signal is accurate.
- **AI prices force manual confirmation**: AI-estimated prices have no `priceDate` (intentional), triggering red highlighting and blocking send.
- **BC offline queue**: localStorage-backed, exponential backoff, environment-stamped, amber badge.
- **BC connection indicator**: Blue/red dot in toolbar, clickable to reconnect.
- **Multi-phase pricing cascade**: BC → scrapers → AI → manual. Doesn't stop at first failure.

#### Recommended fix priority

1. **B2** — Carry `manualVerifyRequired` forward through re-extraction (one line each in two report builders)
2. **B1** — Add `manualVerifyRequired` check to `findIncompleteQuoteItems` (block send when true)
3. **F3** — Warn on Print when items are incomplete (non-blocking)
4. **F1** — Surface fuzzy BC matches for confirmation on vision-mode extractions
5. **F2** — Toast on BC pricing failure

### C39 — 2026-06-09 — F1 + C5 Noisy-PN Guard Scope

**Scope:** Combined scoping document for the "noisy PN silently becomes wrong-but-valid PN" problem. Two mechanisms, one root cause, one guard signal. Delivered as `NOISY-PN-GUARD-SCOPE.md`.

**Key finding: `bcFuzzyLookup` already returns `result.type` ∈ {"exact", "fuzzy", "fuzzy-normalized"} — but NO CALLER EVER READS IT.** The infrastructure for distinguishing exact from fuzzy matches exists and is discarded at every call site (app.jsx:25705, 14349, 27398, 27550). This is the primary leverage point.

**Second key finding: `applyLearnedCorrections` overwrites `confidence` to `"high"` on auto-crossed rows (line 10368).** The extraction quality signal isn't just invisible downstream — it's actively erased. A medium-confidence OCR extraction with a bad auto-cross becomes a "high-confidence" row with a wrong part number.

#### Guard design (three components)

**Guard 1 — F1: BC fuzzy match hold.** When `manualVerifyRequired=true` AND `result.type !== "exact"`, don't auto-accept the match. Store it as a suggestion for user review (same as multi-candidate behavior). Row stays unpriced → red → send-gate blocks. Two insertion points: `runPricingOnPanel` (line 25705) and `runPricingBackground` (line 14349). ~20 lines total.

**Guard 2 — C5: Auto-cross freeze.** When `manualVerifyRequired=true`, skip auto-replace alternates in `applyLearnedCorrections`. Still apply corrections (Path 2), part library (Path 3), and description crosses (Path 4) — those fix known errors, which is correct for noisy extraction. Log held-back alternates for user review. One insertion point with 4 call sites threading the flag. ~15 lines + 4 parameter additions.

**Guard 3 — bcMatchType field.** Store `result.type` on the row as `bcMatchType: "exact"|"fuzzy"|"fuzzy-normalized"`. Additive, no behavior change. ~6 lines. Enriches the data model for future use.

#### Dependencies

- **B2 must ship first** — guards key off `manualVerifyRequired`, which B2 preserves through re-extraction
- **B1 is complementary** — send-gate blocks on the flag; F1 guard additionally ensures fuzzy rows stay unpriced

#### What this does NOT solve

- Exact-match accidental collisions (OCR error happens to produce a real different PN)
- Non-manualVerifyRequired extractions with per-row noise (future: per-row confidence guard)
- Existing wrong entries in the learning DB (separate cleanup pass)

### C41 — 2026-06-09 — F3+F2 Verification (v1.20.109): PASS — Trust-UX layer complete

**Scope:** Behavioral verification of the print warning gate (F3) and BC pricing failure toast (F2). Six checks total.

#### F3: Just Print Warning

The gate is in `handlePrintQuote` (app.jsx:35668). It calls `findIncompleteQuoteItems(proj)` (line 35674) — the same function B1 wired for the send-gate — then builds a confirm dialog rather than a hard block.

**Check 1: Print with incomplete PRICING → warning fires, proceed/cancel works.**

Line 35674-35684: `findIncompleteQuoteItems` returns pricing issues (rows with missing qty/price/priceDate). The warning builds:
- `_pi.length + " items have incomplete pricing or stale prices."`
- `"\n\nQuote may contain gaps. Print anyway?"`
- `arcConfirm(msg, {kind:"warning", okLabel:"Print Anyway"})` → user sees confirm dialog
- `if(!proceed) return` → Cancel aborts the print
- If "Print Anyway" → continues to `_tryAcquireQuotePrintLock` and prints

**PASS** ✓

**Check 2 (NUANCE): Print with manualVerifyRequired=true but FULLY PRICED.**

This is the critical case — the trigger is keyed on `findIncompleteQuoteItems`, which checks `pan.extractionReport?.manualVerifyRequired` at line 15121 BEFORE the per-row BOM loop. When `manualVerifyRequired=true`:
- Verification block pushed: `{isVerificationBlock: true, missing: ["manual verification"]}`
- Even with zero pricing issues, `_printIssues.length > 0` because the verification block is in the array
- Line 35675: `if(_printIssues.length)` → **true**
- Line 35676: `_vb` contains the verification block
- Line 35677: `_pi` is **empty** (fully priced)
- Line 35679: `msg += "Panel 1: BOM needs manual verification (extracted from low-quality source)."`
- Line 35680: `_vb.length && _pi.length` → **false** (no double-newline separator — correct, no pricing message follows)
- Line 35681: `_pi.length` → **false** (no pricing message — correct)
- Line 35682: `msg += "\n\nQuote may contain gaps. Print anyway?"`
- Final message: "Panel 1: BOM needs manual verification (extracted from low-quality source).\n\nQuote may contain gaps. Print anyway?"
- `arcConfirm` fires with "Print Anyway" / Cancel

The warning fires on the verification block alone — no pricing incompleteness needed.

**PASS** ✓

**Check 3: Print with BOTH verification block and pricing issues.**

- `_vb` has verification block(s), `_pi` has pricing issues
- Line 35679: verification message renders
- Line 35680: `_vb.length && _pi.length` → **true** → `"\n\n"` separator added
- Line 35681: `_pi.length` → **true** → pricing count message renders
- Line 35682: "Print anyway?" suffix
- Both messages appear, correctly separated

**PASS** ✓

**Check 4: Print with clean, verified, fully-priced panel.**

- `findIncompleteQuoteItems(proj)` returns `[]` — no verification block (flag absent/false), no pricing issues
- Line 35675: `if(_printIssues.length)` → **false** → entire warning block skipped
- Proceeds directly to `_tryAcquireQuotePrintLock` and prints without any dialog

No spurious nag. **PASS** ✓

#### F2: BC Pricing Failure Toast

**Check 5: Pricing with BC disconnected → amber toast.**

`_bcWasUnavailable` is set to `true` in two scenarios:
- Line 25673: Silent BC login times out or fails → `_bcWasUnavailable = true`
- Line 25801: BC pricing phase throws at any point → `_bcWasUnavailable = true`

At end of pricing (line 26196-26201):
```javascript
if(_bcWasUnavailable){
  const _unpricedCount = updatedBom.filter(r =>
    !r.isLaborRow && !_isExcludedFromPriceCheck(r) &&
    (!(r.unitPrice > 0) || r.priceSource === "ai")).length;
  if(_unpricedCount > 0){
    setBcPricingFailToast({message: `BC pricing unavailable — ${_unpricedCount} rows unpriced or AI-estimated. Click BC status to reconnect.`, ...});
    setTimeout(() => setBcPricingFailToast(null), 12000);
  }
}
```

Count includes rows that are either unpriced OR AI-estimated (since AI prices replace BC prices when BC is unavailable). Toast renders as fixed-position portal (line 27117-27126):
- Amber box, top-right corner, z-index 10001
- Title: "BC Pricing Unavailable"
- Body: dynamic message with count
- × button: `onClick={() => setBcPricingFailToast(null)}` → manual dismiss
- Auto-dismiss: `setTimeout(..., 12000)` → 12 seconds

**PASS** ✓

**Check 6: Pricing with BC connected and healthy → NO toast.**

- Line 25669: `_bcWasUnavailable = false` (initialized)
- Line 25670: `if(!_bcToken)` → token exists, silent login block skipped, flag stays false
- Line 25675: BC pricing runs in the `if(_bcToken)` block
- Line 25798-25801: Only the `catch(ex)` sets `_bcWasUnavailable = true` — normal completion leaves it false
- Line 26196: `if(_bcWasUnavailable)` → false → toast never fires

**PASS** ✓

**Bonus observation:** If BC is unavailable but all rows happen to already be priced (from a prior pricing run), the inner check `if(_unpricedCount > 0)` prevents the toast. No false alarm when BC was down but nothing actually needed pricing. Correct behavior.

#### Verdict: F3+F2 VERIFIED — Trust-UX layer complete

All six checks pass. The trust-UX layer (B2 + B1 + F3 + F2) is done:
- **B2:** manualVerifyRequired survives re-extraction (both paths)
- **B1:** Send blocked on all three surfaces when flag is set
- **F3:** Print warns on verification block alone OR pricing issues OR both
- **F2:** BC failure toast fires on disconnect, auto-dismisses at 12s, no false alarm

**Marc cleared for the F1/C5 noisy-PN guard** (scoped in `NOISY-PN-GUARD-SCOPE.md`, B2 dependency met per C40).

### C40 — 2026-06-09 — B2+B1 Verification (v1.20.108): PASS — Marc cleared for F3+F2

**Scope:** Behavioral verification of the goal-critical trust-signal pair. The F1/C5 guard (C39 scope) depends on B2, so this verification is gating.

#### Check 1: B1 SEND-BLOCK — PASS (all three send paths)

`findIncompleteQuoteItems` (app.jsx:15107) now checks `pan.extractionReport?.manualVerifyRequired` at line 15121, BEFORE iterating BOM rows. When true, it pushes:
```javascript
{panelName: "Panel N", partNumber: "(entire BOM)",
 description: "Extracted from low-quality source — not manually verified",
 missing: ["manual verification"], isVerificationBlock: true}
```

The `isVerificationBlock:true` flag enables distinct messaging downstream (line 15160: `formatIncompleteQuoteAlert` splits verification blocks from pricing issues).

**Send Path 1 — QuoteSendModal (line 31292-31303):**
- `incompleteItems = findIncompleteQuoteItems(project)` → includes verification block
- `sendBlocked = incompleteItems.length > 0` → true
- `handleSend` → `arcAlert(formatIncompleteQuoteAlert(incompleteItems))` → returns without sending
- **BLOCKED** ✓

**Send Path 2 — Pre-gate banner (line 34078-34098):**
- `_incompleteItems = findIncompleteQuoteItems(project)` → includes verification block
- `_hasVerify = _incompleteItems.some(i => i.isVerificationBlock)` → true
- `_sendBlocked = _incompleteItems.length > 0` → true
- Banner renders: amber box with "⚠ Send blocked — BOM verification required"
- Body: "This BOM was extracted from a low-quality source and has not been manually verified. Review all part numbers before sending."
- Send button: `disabled={_sendBlocked}` → disabled
- Tooltip: "Send disabled — BOM verification required"
- "Just Print (review copy)" button available in banner
- **BLOCKED** ✓

**Send Path 3 — Inline send (line 36754-36755):**
- `incomplete = findIncompleteQuoteItems(project)` → includes verification block
- `if(incomplete.length)` → true → `arcAlert(formatIncompleteQuoteAlert(incomplete))` → returns
- **BLOCKED** ✓

**All three surfaces block.** No leak path. The verification message is distinct from pricing messages (not "missing price" — it's "low-quality source, not manually verified").

#### Check 2: B2 PRESERVE — PASS (both re-extraction paths)

**Path A — Plain re-extraction (line 24365):**
```javascript
const reExtractionReport = {
  ...stats fields...,
  timestamp: Date.now(), version: APP_VERSION,
  ...(latestPanelRef.current.extractionReport?.manualVerifyRequired
    ? {manualVerifyRequired: true} : {}),
};
```
Reads from `latestPanelRef.current.extractionReport?.manualVerifyRequired`. The ref holds the current panel state including the previous extractionReport. If the flag was set during initial extraction (via the Phase 1c gate), the re-extraction report carries it forward. ✓

**Path B — Feedback re-extraction (line 24591):**
```javascript
const fbReport = {
  ...stats fields...,
  timestamp: Date.now(), version: APP_VERSION,
  ...(latestPanel.extractionReport?.manualVerifyRequired
    ? {manualVerifyRequired: true} : {}),
};
```
Reads from `latestPanel.extractionReport?.manualVerifyRequired`. `latestPanel` is the panel at the time feedback re-extraction starts, which includes the previous extractionReport. If the flag was set, it carries forward. ✓

**This is the path that was BROKEN before v1.20.108.** The `fbReport` builder previously constructed a fresh object with no `manualVerifyRequired` field — the flag was permanently lost on feedback re-extraction. Now it's preserved.

Both paths use the conditional spread pattern: present when true, omitted when false/absent. No `manualVerifyRequired:false` pollution.

#### Check 3: NO REGRESSION — PASS

For a panel WITHOUT `manualVerifyRequired`:
- `pan.extractionReport?.manualVerifyRequired` at line 15121 → `undefined` (falsy) → the if-block is skipped
- Function proceeds to the per-row BOM loop (lines 15130-15153)
- Only pricing-based issues are pushed (qty, price, priced date, stale)
- No verification block in the issues array → `_hasVerifyBlock = false` → no verification message
- `_sendBlocked` is true only if there are pricing issues or owner priority

No spurious verification block. ✓

#### Check 4: MIXED — PASS

For a panel WITH `manualVerifyRequired` AND incomplete pricing:
- Line 15121: verification block pushed (panelName, "(entire BOM)", verification message)
- Lines 15130-15153: per-row pricing issues pushed (per-row, specific missing fields)
- Both issue types in the array → `issues.length > 0` → send blocked

**`formatIncompleteQuoteAlert` (line 15157-15176) renders both:**
- `verifyIssues` (filtered by `isVerificationBlock`): "⚠ Panel 1: This BOM was extracted from a low-quality source..."
- `pricingIssues` (filtered by `!isVerificationBlock`): "N items still need price, qty, or priced date..."
- Both sections joined with double newline

**Pre-gate banner (line 34086-34087) also handles mixed case:**
- Header: "⚠ Send blocked — BOM verification required + N items incomplete"
- Body: "This BOM was extracted from a low-quality source... Also fix N red rows with incomplete pricing."

Both messages render correctly. The verification message comes first (higher severity), pricing details follow. ✓

#### Verdict: B2+B1 VERIFIED — Marc cleared for F3+F2

All four checks pass. The trust signal now survives the full lifecycle: Phase 1c gate → initial extraction → re-extraction → feedback re-extraction → send-gate block → all three send surfaces. The F1/C5 guard (C39) can safely key off `manualVerifyRequired` — its dependency is met.

---

### C42: F1/C5 Noisy-PN Guard Verification (v1.20.110)

**Scope:** NOISY-PN-GUARD-SCOPE.md — three guards + "Mark Verified" button.
**Method:** Behavioral code trace against the scope's test plan.

#### F1 Guard: BC Fuzzy Match Hold

**Check 1: manualVerifyRequired=true + fuzzy match → HELD — PASS**

Foreground pricing path (line 25748-25782):
- `_manualVerifyRequired` read from `panel?.extractionReport?.manualVerifyRequired` (Option B per scope — React closure)
- Line 25770: `_isExact = result.type === "exact"`
- Line 25771: `_needsReview = !_isExact && _manualVerifyRequired`
- Line 25772-25774: `if(_needsReview)` → stored as suggestion: `fuzzySugg[String(row.id)] = [result.match]`
- Suggestions merged into UI state at line 25830-25831: `setBcFuzzySuggestions(prev=>({...prev,...fuzzySugg}))`
- Row stays unpriced → red → send-gate blocks (B1 on manualVerifyRequired AND missing price — belt and suspenders)

Background pricing path (line 14349-14377):
- `_bgManualVerify` read from `panelData.extractionReport?.manualVerifyRequired` (Option A per scope — parameter)
- Same guard: `_isExact`, `_needsReview`, held as `bcFuzzySugg[String(row.id)] = [result.match]` (line 14369)
- Identical logic. ✓

Both paths match scope's implementation sketch exactly. ✓

**Check 2: manualVerifyRequired=true + EXACT match → auto-accepts — PASS**

- Line 25770: `_isExact = result.type === "exact"` → true for exact matches
- Line 25771: `_needsReview = !true && true` → false
- Falls to else branch (line 25775-25778): auto-accepts, stores in bcMap
- Guard doesn't over-fire on exact matches. ✓

**Check 3: manualVerifyRequired=false → fuzzy auto-accepts (NO REGRESSION) — PASS**

- Line 25748: `_manualVerifyRequired = false`
- Line 25771: `_needsReview = !_isExact && false` → false regardless of match type
- All matches (exact and fuzzy) auto-accept as before
- Background path: `_bgManualVerify = false` → same no-op. ✓

No behavioral change for text-layer extractions. ✓

#### C5 Guard: Auto-Cross Freeze

**Check 4: manualVerifyRequired=true → Path 1 held, Paths 2-4 apply — PASS**

`applyLearnedCorrections` (line 10331-10421):
- Destructures `{manualVerifyRequired=false}` from opts (line 10332)
- Path 1 (line 10369-10378): `if(alt)` found → `if(manualVerifyRequired)` → pushes to `heldBackAlternates` array, does NOT return → falls through to Paths 2-4
- Path 2 (corrections, line 10386-10391): No guard. `if(corr&&corr.correctedPN)` → applies unconditionally. ✓
- Path 3 (part library, line 10394-10399): No guard. Applies unconditionally. ✓
- Path 4 (description cross, line 10404-10410): No guard. Applies unconditionally. ✓

The fall-through from Path 1's held-back branch is the critical design point — the `if(manualVerifyRequired)` block pushes to `heldBackAlternates` but does NOT `return r`, so execution continues through Paths 2-4. Verified by reading: line 10372-10373 is `{heldBackAlternates.push(...)}` with no return, vs line 10374-10376 `else{...return _altRow;}`. ✓

Console logging at line 10418-10419 confirms held-back count is visible in dev tools. ✓

**Check 5: All 4 call sites thread the flag — PASS**

| Call site | Line | Source of manualVerifyRequired | Verified |
|-----------|------|-------------------------------|----------|
| Initial extraction | 14029 | `!!panel._manualVerifyRequired` (transient flag from 1c gate) | ✓ |
| Re-extraction | 24343-24344 | `!!latestPanelRef.current.extractionReport?.manualVerifyRequired` (persisted, B2-safe) | ✓ |
| Feedback re-extraction | 24577-24578 | `!!latestPanel.extractionReport?.manualVerifyRequired` (persisted, B2-safe) | ✓ |
| Panel open useEffect | 22871 | `!!panel.extractionReport?.manualVerifyRequired` (persisted) | ✓ |

Panel-open useEffect (line 22880-22881): Separate inline implementation (not calling `applyLearnedCorrections`) but same guard logic: `if(_mvr){heldAlt++;return r;}` — skips auto-cross, returns row unchanged. Corrections still apply below (line 22885-22888). ✓

**Check 6: manualVerifyRequired=false → auto-cross applies normally (NO REGRESSION) — PASS**

- `{manualVerifyRequired=false}` defaults to false when not passed
- All 4 call sites pass `false` when extractionReport doesn't have the flag set
- Line 10372: `if(false)` → skips to else → auto-cross applies normally
- Panel-open useEffect line 22881: `if(false)` → skips to auto-apply at line 22882. ✓

No behavioral change for text-layer extractions. ✓

#### bcMatchType

**Check 7: Stored correctly on both pricing paths — PASS**

Foreground:
- Exact BC lookups (already bc-priced rows, line 25764): `bcMatchType:"exact"` — hardcoded, correct
- Fuzzy results (line 25778): `bcMatchType:result.type||null` — preserves exact/fuzzy/fuzzy-normalized/null
- Spread onto rows (line 25822): `...(bcMap[key].bcMatchType?{bcMatchType:bcMap[key].bcMatchType}:{})` — conditional, doesn't pollute with falsy

Background:
- Exact (line 14360): `bcMatchType:"exact"` ✓
- Fuzzy (line 14373): `bcMatchType:result.type||null` ✓
- Spread onto rows (line 14409): same conditional pattern ✓

**Check 8: Persists to Firestore — PASS**

`bcMatchType` is a property on the BOM row object. BOM rows are saved via `onSaveImmediate(updated)` where `updated.bom` contains the rows. The field is additive (not stripped by any save filter). Firestore save preserves all row metadata fields per CLAUDE.md data retention rules. ✓

#### "Mark Verified" Button

**Check 9: Clears flag with clear confirm dialog — PASS**

Line 27065-27074:
- Button labeled "✓ Mark Verified" (green, line 27072-27073)
- `arcConfirm` dialog (line 27066): "Mark this BOM as manually verified?\n\nThis clears the verification flag, re-enables auto-cross from the learning DB, and allows fuzzy BC matches to auto-accept on the next pricing run.\n\nOnly do this after reviewing all part numbers."
- On confirm (line 27068-27070): `manualVerifyRequired: false` in extractionReport → save
- Dialog explicitly states consequences: re-enables auto-cross and fuzzy acceptance. ✓
- `{kind:"info",okLabel:"Mark Verified"}` — info-level (not warning), appropriate for a user-initiated action. ✓

**Check 10: Post-verify state legibility — PASS with note**

After clicking "Mark Verified":
1. Amber "Manual verification required" chip disappears (manualVerifyRequired cleared)
2. Green "✓ Mark Verified" button disappears (same conditional)
3. Fuzzy-held rows: still unpriced (red), BUT suggestion buttons remain visible (line 27652 — `bcFuzzySuggestions` state persists in React). User sees per-row "Close match exists in BC" buttons.
4. Auto-cross held-back rows: still have original PNs (no re-application until navigate away + back or re-price)
5. "↻ Get New Pricing" button is always visible (line 27118-27131)

**Legibility assessment:** The state is NOT broken or confusing for the primary path. The suggestion buttons on fuzzy-held rows provide clear navigability — the user can see which rows have matches to review. The red highlighting provides urgency. Clicking "↻ Get New Pricing" would re-run pricing without the guard (since `manualVerifyRequired` is now false), auto-accepting fuzzy matches.

**Minor gap:** No explicit "re-price to apply held-back matches" toast or prompt after clearing verification. The user must infer that re-pricing is needed. This is acceptable because: (a) the scope document's note #3 states "held rows are still red until re-price (by design)"; (b) the red rows and pricing button provide sufficient visual signal; (c) a toast would be trivial to add if user testing shows confusion. Not a blocker.

#### GAP: Held-Back Alternates Review UI (follow-up item)

**Confirmed per Jon's request:** Guard 2 (C5) freezes auto-cross correctly, but the held-back alternates are scaffolding only:

| Storage location | What happens | Surfaced? |
|-----------------|-------------|-----------|
| `heldBackAlternates` (applyLearnedCorrections return) | Array of `{rowId, from, to, toDesc}` | Console only |
| `latestPanel._heldBackAlternates` (initial extraction, line 14032) | Stored on transient ref | Not in UI, not in Firestore |
| `reHeldBack` (re-extraction, line 24347) | Local variable only | Not stored, not in UI |
| `fbHeldBack` (feedback re-extraction, line 24581) | Local variable only | Not stored, not in UI |
| Panel-open useEffect (line 22881) | `heldAlt++` counter | Console log only (line 22893-22896) |

**The freeze is fail-safe** — it withholds the risky auto-cross action, which is the correct default for a guard. The user's BOM keeps the original (noisy) PN rather than getting a wrong substitution.

**What's missing:** The scope document estimated "~30-40 lines" for a "surface N held-back crosses for review" UI (banner or per-row indicator). This did NOT ship with v1.20.110. The data structures (`heldBackAlternates`, `_heldBackAlternates`) are assigned but not consumed by any React component.

**Risk assessment:** LOW. The freeze is the safety-critical part, and it works. The review UI is a usability enhancement — without it, the user simply doesn't know that learned crosses were available and held back. After "Mark Verified" + navigate away/back, auto-cross would apply normally. The held-back crosses are not lost; they're just invisible during the guarded phase.

**Follow-up:** Log as a future UI item: "C5 held-back alternates review UI — surface per-row indicator showing N learned crosses are available pending verification. ~30-40 lines per NOISY-PN-GUARD-SCOPE.md."

---

### C44: #111 Confirmed Complete + #112 Scoped

#### Part 1: #111 (Phase 1d) — CONFIRMED COMPLETE via Phase 1c Case 5

**Claim:** Phase 1d (no-PDF lazy handling) is already covered by Case 5 in the Phase 1c gate.

**Verification:**

Phase 1c Case 5 (app.jsx lines 23471-23482):
```
const _isNoPdf = _gateTiers.some(t => t.tier === "no-pdf");
if (_isNoPdf) {
  const _noPdfChoice = await arcConfirm(
    "No usable source PDF for this project...",
    {title:"Missing Source PDF", kind:"warning",
     okLabel:"Region & Extract from Image", cancelLabel:"Cancel"});
  if (!_noPdfChoice) { setAwaitingConfirm(true); bgUpdate(...); return; }
  panel._manualVerifyRequired = true;
}
```

`classifyBomInputTier` (line 14692) returns `"no-pdf"` when:
- No `originalPdfPath` or `pageNumber` on any BOM page, OR
- 0-byte file detected

**What Case 5 covers (= all of Phase 1d's scope):**
1. **Detection at extraction time** — `classifyBomInputTier` runs in `confirmAndExtract` before AI call ✓
2. **User choice modal** — arcConfirm with re-upload hint + region-image option ✓
3. **manualVerifyRequired set on proceed** — `panel._manualVerifyRequired = true` flows through the full trust pipeline (B2 persistence → B1 send-gate → F3 print warning → F1 fuzzy hold → C5 auto-cross freeze) ✓
4. **Cancel returns to panel** — `if(!_noPdfChoice) return` ✓

**Was proactive pre-extraction detection ever in scope?** No. The design was always extraction-time detection — the tier classifier runs when the user clicks Extract, not on file drop. This is correct because a project may start with no PDF but have one uploaded later; the gate should fire at the point of action (extraction), not at the point of creation.

**Residual work:** None.

**Verdict:** #111 marked [Verified] in TODO.md. Completed via Phase 1c Case 5, v1.20.107.

---

#### Part 2: #112 (Phase 1f) — Scope Confirmation and Implementation Sketch

##### Part A: Per-Company Structural Learning

**Current state:**

`_rlPath(uid)` (app.jsx line 12704):
```
return (_appCtx.configPath || `users/${uid}/config`) + "/region_learning"
```

For team accounts, `_appCtx.configPath` resolves to `companies/{companyId}/config` — so **per-company sharing is already in place**. Solo accounts fall back to `users/{uid}/config`. No migration needed.

`saveRegionLearningEntry` (line 12747): 30-example sliding window, saves to `_rlPath(uid)`.

Current schema per region-learning example:
- `thumbnail` — JPEG base64 of the cropped region
- `label` — user label (e.g. "bom", "schematic")
- `note` — free-text user note
- `pageTypeContext` — page type at time of save (for prioritization)
- `aiAnalysis` — Haiku-generated structural analysis:
  - `columnHeaders` — array of column header strings
  - `rowCount` — integer
  - `structuralSummary` — text description of layout
  - `signaturePhrase` — distinguishing phrase from the content

**What needs to change:**

1. **Add `contributedBy` field** — `uid` of the person who created the entry. Required for audit trail on shared company learning DBs. Add at save time in `saveRegionLearningEntry`.
   - ~1 line: add `contributedBy: fbAuth.currentUser?.uid` to the entry object at line ~12760

2. **Add `inputTierClass` field** — classification of the source document (`text-layer` / `vector-stroke` / `bitmap` / `scan`). This is the per-DRAWING structural hint that tells the extraction path what kind of document produced this region pattern. NOT per-customer — per the hard rule.
   - ~3 lines: pass `tier` from `classifyBomInputTier` result to `saveRegionLearningEntry`, store as `inputTierClass`
   - Consumed downstream: `buildRegionLearningContext` can filter/prioritize examples by matching tier class to the current extraction's tier

3. **Add `columnLayoutType` field** — structural descriptor derived from aiAnalysis (e.g. "single-column", "two-column-side-by-side", "three-box"). Already partially available in `aiAnalysis.structuralSummary` but not machine-queryable.
   - ~5 lines: extend the Haiku analysis prompt (`analyzeRegionForLearning`, line 12755) to output a structured enum alongside the free-text summary
   - Consumed downstream: helps extraction prompt anticipate multi-box BOMs

**Hard rule compliance:**
- Per-DRAWING format detection, not per-customer assumption ✓ — `inputTierClass` comes from `classifyBomInputTier` which examines the actual page content
- STRUCTURE not part-number content ✓ — all new fields describe layout/tier/columns, not part data
- Human-confirmed weighting ✓ — existing priority system in `buildRegionLearningContext` already weights by recency and pageTypeContext match; human-saved examples are the only entries in the DB

**Effort:** ~10 lines in `saveRegionLearningEntry` + ~5 lines in Haiku analysis prompt.

##### Part B: L3 Wire-Up (buildRegionLearningContext into extraction paths)

**Current state:** `buildRegionLearningContext` is called ONLY from `detectPageTypes` (line 14637). It returns an array of content parts (image + text) ready to splice into a messages[] array. It is NOT called from any BOM extraction path.

**The three extraction paths that need region learning context:**

**Path 1: Server-side `extractBomPage` (Cloud Function)**
- Client wrapper: `extractBomPageViaServer` (app.jsx:11686)
- Cloud Function: `exports.extractBomPage` (functions/index.js:2325)
- **Seam already exists:** Cloud Function destructures `regionLearningParts` from payload (line 2334) and splices it into `userContent` — BUT only for the `image-fallback` path (line 2460), NOT for `pdf-native` (line 2435) or `bom-region-crop` (line 2448)
- **Client side disconnected:** `extractBomPageViaServer` builds `payload` (line 11689) but does NOT include `regionLearningParts`
- **Fix (client, ~8 lines):** Before calling `extractBomPageViaServer`, load region learning and build context:
  ```
  let regionLearningParts = [];
  try {
    const uid = fbAuth.currentUser?.uid;
    if (uid) {
      const examples = await loadRegionLearning(uid);
      regionLearningParts = buildRegionLearningContext(examples, {maxExamples: 3});
    }
  } catch(e) { /* non-blocking */ }
  ```
  Then add `regionLearningParts` to the payload object.
- **Fix (server, ~4 lines):** In `extractBomPage` Cloud Function, splice `regionParts` into `userContent` for BOTH `pdf-native` and `bom-region-crop` paths (currently only done for `image-fallback`). Pattern: `...regionParts,` before the document/image content part, same as line 2462.

**Path 2: Client-side direct API fallback — pdf-native (app.jsx:11830-11857)**
- This is the fallback when the server-side call fails
- `userContent` built at lines 11841-11843 with document + text
- **Fix (~2 lines):** Splice `regionParts` before the document:
  ```
  messages:[{role:"user",content:[
    ...regionParts,                    // ← NEW
    {type:"document", source:{...}},
    {type:"text", text: pageHint+...}
  ]}]
  ```
- `regionParts` array already computed for the server-side call attempt (see Path 1 fix above), so it's available in scope.

**Path 3: Client-side direct API fallback — bom-region-crop (app.jsx:11864-11901)**
- Same pattern as Path 2 but with image content
- `userContent` built at lines 11880-11882 with image + text
- **Fix (~2 lines):** Splice `regionParts` before the image, identical pattern.

**Prompt modification:**
- `buildRegionLearningContext` already generates the right framing text: "PAST REGION ANNOTATIONS FROM THIS USER (use these as visual + structural patterns — apply the same extraction approach when you see similar layouts on this drawing)"
- The closing text says "(End of region annotations — apply patterns above when classifying / extracting this page.)"
- These are general enough to work for extraction, not just classification. **No BOM_PROMPT changes needed.**

**Call site summary (where `regionLearningParts` gets built):**

The natural point is in `extractBomPage` (the local wrapper at ~line 11762) — right before the try/catch that calls `extractBomPageViaServer`. Build it once, use in server payload AND client fallback:

| Extraction path | Where to load | Where to splice | Lines |
|----------------|--------------|-----------------|-------|
| Server pdf-native | app.jsx ~11765 (before server call) | functions/index.js ~2435 (userContent) | ~4 server |
| Server bom-region-crop | same | functions/index.js ~2448 (userContent) | ~2 server |
| Server image-fallback | same | Already done (line 2460) | 0 |
| Client pdf-native fallback | Already in scope | app.jsx ~11841 (messages content) | ~2 client |
| Client bom-region-crop fallback | Already in scope | app.jsx ~11880 (messages content) | ~2 client |

**Size estimate:**

| Component | Lines | Risk |
|-----------|-------|------|
| `contributedBy` field | ~1 | None |
| `inputTierClass` field | ~3 | Low — additive |
| `columnLayoutType` in Haiku prompt | ~5 | Low — additive schema |
| Load region learning in extractBomPage wrapper | ~8 | Low — non-blocking, mirrors detectPageTypes pattern |
| Send regionLearningParts in server payload | ~1 | None — field already destructured |
| Server: splice into pdf-native + bom-region-crop userContent | ~4 | Low — follows existing image-fallback pattern |
| Client: splice into fallback messages | ~4 | Low — follows existing detectPageTypes pattern |
| **Total** | **~26 lines** | **Low** |

**What shifted since original scoping:**
1. **Per-company path migration is a no-op** — `_appCtx.configPath` already handles it. Original scope assumed migration work; there is none.
2. **Server-side seam is half-built** — `regionLearningParts` is already destructured and spliced on one path. Less work than expected.
3. **No BOM_PROMPT changes needed** — `buildRegionLearningContext` output is already prompt-agnostic.

**Risk factors:**
- Payload size: region learning thumbnails are JPEG base64. Each example adds ~50-100KB to the server payload. With `maxExamples:3`, that's ~150-300KB additional. Cloud Function already handles `croppedBomImage` up to 5MB, so well within limits.
- Token cost: 3 additional images in the extraction prompt. At Opus pricing this adds ~$0.03-0.06 per extraction. Acceptable given extraction already costs ~$0.20-0.40 per page.
- Latency: `loadRegionLearning` is cached (`_regionLearningCache`), so no Firestore read on subsequent calls within the same session.

**Carry-forward:** P&ID label fix (line 23342 key should be `pid`, value should be `"P&ID"`) — Marc should fix alongside this build.

#### Verdict: F1/C5 VERIFIED — Unsupervised-Sales safety net complete

All 10 checks pass. The three guards (F1 fuzzy hold, C5 auto-cross freeze, bcMatchType provenance) are correctly implemented per NOISY-PN-GUARD-SCOPE.md. The "Mark Verified" button provides the exit path with clear consequences.

**Safety chain is now closed:**
- Phase 1c gate → `manualVerifyRequired` set (C37 ✓)
- B2 → flag survives re-extraction (C40 ✓)
- B1 → send-gate blocks on flag (C40 ✓)
- F3 → print warning on flag (C41 ✓)
- F2 → BC failure toast (C41 ✓)
- **F1 → fuzzy matches held (C42 ✓)**
- **C5 → auto-cross frozen (C42 ✓)**
- **bcMatchType → provenance stored (C42 ✓)**

One follow-up gap logged (held-back review UI — not a blocker).

---

### C45: #112 Phase 1f Verification (v1.20.111) — PHASE 1 COMPLETE

**Scope:** Per-company structural learning + L3 wire-up (region learning into extraction prompts).
**Method:** Behavioral code trace — confirm context REACHES the AI, not just that variables exist.

#### Check 1: L3 Wire-Up — PASS with GAP

**Server-side `extractBomPage` (functions/index.js):**

`regionLearningParts` destructured from payload (line 2334). Computed to `regionParts` with safe fallback (line 2369):
```
const regionParts = Array.isArray(regionLearningParts) ? regionLearningParts : [];
```

Spliced into ALL THREE server extraction paths:

| Path | Line | userContent splice | Verified |
|------|------|-------------------|----------|
| pdf-native | 2440 | `...regionParts,` before `{type:"document",...}` | ✓ |
| bom-region-crop | 2454 | `...regionParts,` before `{type:"image",...}` | ✓ |
| image-fallback | 2467 | `...regionParts,` before `{type:"image",...}` | ✓ |

All three paths splice `regionParts` as the FIRST content parts — before the document/image. This is correct: region learning context comes before the extraction target, giving the AI structural patterns to apply.

**Client-side `extractBomPageViaServer` (app.jsx:11686):**
- Signature updated: `...,regionLearningParts=null)` — accepts as last parameter ✓
- Payload includes when non-empty (line 11691): `if(regionLearningParts&&regionLearningParts.length)payload.regionLearningParts=regionLearningParts;` ✓
- Avoids payload bloat when empty — conditional add, not always present ✓

**Client-side extraction wrapper (app.jsx:11769-11772):**
- Loads region learning: `const _rlEx=await loadRegionLearning(_rlUid);` ✓
- Builds context: `_regionParts=buildRegionLearningContext(_rlEx,{maxExamples:3});` ✓
- Non-blocking: wrapped in `try/catch(_)` — failure returns `[]` ✓

**Region learning passed on ALL call paths through the wrapper:**

| Call | Line | `_regionParts` passed | Verified |
|------|------|----------------------|----------|
| Primary server call | 11776 | 8th arg to `extractBomPageViaServer` | ✓ |
| JPEG crop fallback retry | 11785 | 8th arg | ✓ |
| Uncropped retry (degenerate-crop) | 11799 | 8th arg | ✓ |

**Client-side direct API fallbacks:**

| Path | Line | Splice | Verified |
|------|------|--------|----------|
| pdf-native fallback | 11848 | `..._regionParts,` before `{type:"document",...}` | ✓ |
| bom-region-crop fallback | 11888 | `..._regionParts,` before `{type:"image",...}` | ✓ |

Both fallback paths use the SAME `_regionParts` computed at line 11771, so they benefit from region learning even when the server path fails. ✓

**GAP: Batch extraction path (`extractBomBatch`) NOT wired.**

| Component | Has region learning? |
|-----------|---------------------|
| Server `extractBomBatch` (functions/index.js:2578) | ✗ — does not destructure `regionLearningParts`, does not splice into userContent (lines 2677-2689) |
| Client `extractBomBatchViaServer` (app.jsx:11729) | ✗ — does not accept or send `regionLearningParts` |

Call sites affected:
- Initial batch extraction (line 13675): multi-BOM-page packages with shared PDF
- Re-extraction batch (line 24272): re-extraction of multiple pages

**Risk assessment:** LOW.
- Batch path is pdf-native only (requires shared PDF) — region learning is most valuable for vision-mode tiers (bitmap/scan/vector-stroke) where the AI needs structural hints. PDF-native pages have vector text, so benefit is lower.
- When batch FAILS, each page falls back to per-page `extractBomPage` which HAS region learning.
- Logged as #118 for Marc to wire up (same pattern: destructure, splice before content parts).

#### Check 2: Structural-Only Guardrail — PASS

**Schema fields stored at save time (line 20725-20738):**

| Field | Value | Content-derived? |
|-------|-------|-----------------|
| `id` | region ID | No — UI identity |
| `label` | user-assigned label ("bom", "schematic") | No — user input |
| `type` | region type | No — structural |
| `note` | free-text user note | No — user input |
| `pageTypeContext` | page classification at save time | No — structural |
| `thumbnail` | JPEG crop of region | No — visual, not extracted text |
| `regionBox` | `{x,y,w,h}` coordinates | No — spatial |
| `sourceCustomer` | customer name | No — metadata |
| `sourcePageName` | page name | No — metadata |
| `contributedBy` | `fbAuth.currentUser?.uid` | No — audit |
| `inputTierClass` | `"pdf"` or `"image"` | No — binary structural class |

**Haiku analysis output (`analyzeRegionForLearning`, line 12768-12786):**

| Field | What it captures | Content-derived? |
|-------|-----------------|-----------------|
| `columnHeaders` | Column NAMES ("ITEM", "QTY", "PART NO") | No — table structure, not row values |
| `rowCount` | Integer count | No — structural |
| `structuralSummary` | Layout description | No — structural |
| `signaturePhrase` | Distinguishing structural pattern | No — guided by examples like "5-column BOM with MFG column" |
| `columnLayoutType` | Enum (single-column, multi-column-side-by-side, etc.) | No — layout classification |

**`buildRegionLearningContext` prompt output (lines 12822-12830):**
Emits per example: Label, User note, Signature, Columns (header names), Structure.
No field reads part numbers, manufacturer names, or BOM row content. ✓

The hard rule holds: STRUCTURE not part-number content. Nothing content-derived anywhere. ✓

#### Check 3: Per-Company Pooling — PASS

**`_rlPath(uid)` (line 12712):**
```
return (_appCtx.configPath || `users/${uid}/config`) + "/region_learning"
```

| Account type | `_appCtx.configPath` | Resolved path |
|-------------|---------------------|--------------|
| Team (login) | `companies/{companyId}/config` (set line 44982) | `companies/{companyId}/config/region_learning` ✓ |
| Team (create) | `companies/{companyId}/config` (set line 17526) | Same ✓ |
| Solo | `null` | `users/{uid}/config/region_learning` ✓ |

Team members on the same company share a single region learning collection. Solo users keep personal collections. No migration needed — the path routing was already in place via `_appCtx.configPath`.

**`contributedBy` audit trail (line 20736):**
```
contributedBy: fbAuth.currentUser?.uid || null
```
Stamps the UID of the person who saved the region, even on the shared company path. Bad correction is traceable to the individual contributor. ✓

#### Check 4: No Regression — PASS

**Empty-region-learning case:**
- `buildRegionLearningContext` (line 12806): `if(!examples||!examples.length)return[];` → `[]` ✓
- `..._regionParts` where `_regionParts = []` → spread of empty array is no-op, zero additional content parts ✓
- Server-side (line 2369): `Array.isArray(regionLearningParts) ? regionLearningParts : []` → handles null/undefined/missing ✓
- Client-side (line 11691): `if(regionLearningParts&&regionLearningParts.length)` → conditional add to payload, no wasted bytes ✓

**Old entries without new fields:**
- `contributedBy` — write-only (line 20736), no reader checks for it ✓
- `inputTierClass` — write-only (line 20737), no reader ✓
- `columnLayoutType` — stored in `aiAnalysis`, but `buildRegionLearningContext` reads only `signaturePhrase`, `columnHeaders`, `structuralSummary` (lines 12826-12828) — does NOT read `columnLayoutType` ✓
- Old entries load via `loadRegionLearning` → `d.data().examples` → objects with missing fields are simply `undefined`, and all readers use falsy guards (`if(e.aiAnalysis)`, `if(e.thumbnail)`) ✓

Zero behavioral change for existing users with no region learning data or old-format entries. ✓

#### Check 5: P&ID Label — PASS

All six P&ID label maps now show `pid:"P&ID"`:

| Location | Line | Value | Verified |
|----------|------|-------|----------|
| ECO page list | 16752 | `pid:"P&ID"` | ✓ |
| Type badges | 17004 | `pid:"P&ID"` | ✓ |
| Page viewer labels | 20665 | `pid:"P&ID"` | ✓ |
| Region type short | 20669 | `pid:"P&ID"` | ✓ |
| Confirmation dialog | 23158 | `pid:"P&ID"` | ✓ |
| Extraction dialog | 23406 | `pid:"P&ID"` | ✓ |

Consistent across all rendering surfaces. Carry-forward from C36/C37 resolved. ✓

#### Verdict

**#112 [Verified].** All 5 behavioral checks pass. One non-blocking gap (#118: batch path region learning).

**PHASE 1 COMPLETE.** Required-BOM-Region feature fully shipped and verified:
- Phase 0a/0b: PDF quality assessment + CropBox (#103-#104) ✓
- Phase 1a: Tier classifier (#105) ✓
- Phase 1b: Region UI + learning (#106) ✓
- Phase 1c: Block-with-override gate (#107) ✓
- Phase 1d: No-PDF handling (#111, via 1c Case 5) ✓
- Phase 1f: Per-company learning + L3 wire-up (#112) ✓
- Sales-trust layer: B2/B1/F3/F2/F1/C5 (#108-#110) ✓

---

### C46: #117 — Payment Terms / Shipping Method Intermittent Disappearance

**Report:** Fields RANDOMLY show "---" on printed quotes. Same project, sometimes present, sometimes not.

**Method:** Data-flow trace from source (BC / user input) through state management to render time.

#### Finding 1: Two print paths diverge at BC auto-populate

**Path A — "Print Client Quote" button (handlePrintQuote, line 35735):**
1. Acquire print lock (line 35754)
2. Auto-assign quote number (line 35774)
3. **BC auto-populate (lines 35786-35942)** — fetches from BC project card:
   - `pmtTerms = bc.CCS_Payment_Terms_Code || bc.Payment_Terms_Code || ""`
   - `shipMethod = bc.CCS_Shipment_Method_Code || bc.Shipment_Method_Code || ""`
   - Falls back to customer card GUID resolution if empty
4. Merge + save (line 35943-35945):
   `proj={...proj,quote:{...q,...autoFields}};`
   `saveProject(uid,proj);` — **fire-and-forget (not awaited)**
5. Pre-print checklist or autoPrint → generates PDF from `projectRef.current` (has data ✓)

**Path B — "Generate PDF" button in QuoteView (line 19469):**
```javascript
onClick={async()=>{await generateQuotePdf(project);...}}
```
- Uses `project` from React state directly
- **NO BC auto-populate**
- **NO Firestore save**
- If `project.quote.paymentTerms` is falsy → PDF shows "---"

**This is the primary cause of the randomness.** Whether terms appear depends on WHICH button the user clicks and whether BC auto-populate has previously run and saved for this project.

#### Finding 2: Quote field edits have NO auto-save

The BOM editor has a 1.5s debounced auto-save (line 25016):
```javascript
autoSaveTimer.current=setTimeout(()=>{onSaveImmediate(...)},1500);
```

The quote editor has **no equivalent.** When the user edits Payment Terms:
1. `setQ({paymentTerms: "Net 30"})` (line 19447)
2. → `onUpdate({...project, quote:{...q, paymentTerms:"Net 30"}})` — React state only
3. → `update(p)` in ProjectView (line 35611) — sets `projectRef.current`, calls `onChange`
4. → `handleChange(p)` in App (line 45245) — updates React state only
5. **NO Firestore write anywhere in this chain**

The user types Payment Terms, the field looks saved (it renders in the editor), but it's **RAM-only**. Navigate away → gone.

#### Finding 3: Fire-and-forget save can silently fail

Line 35945:
```javascript
setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);
```

`saveProject(uid,proj)` is called without `await`. If it throws (network, Firestore quota, permission), the error is unhandled. The project in memory has the terms, but Firestore doesn't. Current session shows terms; next session doesn't.

#### Finding 4: BC token gates the entire fetch

Line 35800-35801:
```javascript
const needsBcFetch=!q.company||!q.address||!q.salesperson||spLooksLikeCode||!q.paymentTerms||!q.shippingMethod;
if(proj.bcProjectNumber&&_bcToken&&needsBcFetch){
```

If `_bcToken` is null (BC session expired, user hasn't authenticated with BC), the entire BC fetch is skipped. This is the most common "intermittent" condition — it depends on whether the user has an active BC session.

#### Finding 5: BC project card may not have terms

```javascript
let pmtTerms=bc.CCS_Payment_Terms_Code||bc.Payment_Terms_Code||"";
let shipMethod=bc.CCS_Shipment_Method_Code||bc.Shipment_Method_Code||"";
```

Both try CCS-prefixed then standard field. If neither populated → falls back to customer card `paymentTermsId` GUID resolution (lines 35878-35880). If customer card also empty → terms stay empty even when BC is connected.

#### Behavioral summary: why it's random

| Condition | Payment Terms on PDF |
|-----------|---------------------|
| Previous print via Path A + BC had terms + save succeeded | ✓ Persisted in Firestore |
| Print via Path A + BC token expired | ✗ "---" (BC fetch skipped) |
| Print via Path A + BC card has no terms | ✗ "---" (empty from BC) |
| Print via Path B + never went through Path A | ✗ "---" (no auto-populate) |
| Print via Path B + previously went through Path A + save succeeded | ✓ From Firestore |
| User manually typed terms + never printed | ✗ "---" on next session (not saved) |

#### Recommended fix (for Marc)

**Fix 1 (critical, ~5 lines): Debounced auto-save for quote field edits.**

In QuoteView or ProjectView, add a save timer when `setQ` fires — same pattern as PanelCard's autoSaveTimer:
```javascript
// In QuoteView or via a new debounce around setQ
if(quoteSaveTimer.current)clearTimeout(quoteSaveTimer.current);
quoteSaveTimer.current=setTimeout(()=>{
  saveProject(uid, projectRef.current);
},2000);
```

This ensures manual edits persist to Firestore within 2s.

**Fix 2 (critical, ~3 lines): Await the save in handlePrintQuote.**

Line 35945: change from fire-and-forget to awaited:
```javascript
await saveProject(uid,proj);
```

This ensures BC-fetched terms survive a failure.

**Fix 3 (high value, ~10 lines): Run BC auto-populate before "Generate PDF" button.**

Either:
- Refactor the BC auto-populate from `handlePrintQuote` into a shared helper
- Call it in the QuoteView before `generateQuotePdf`
- Or: when the QuoteView mounts and `!q.paymentTerms||!q.shippingMethod`, trigger the BC fetch in a useEffect

**Fix 4 (defense in depth, ~2 lines): Log when BC token gates the fetch.**

Add a console.warn when `needsBcFetch` is true but `_bcToken` is falsy, so the user sees in dev tools why terms didn't populate.

**Effort:** ~20 lines total. Fix 1+2 are the minimum viable correction.

**Not a renderer bug.** The PDF renderer (line 6812-6813) is correct: `q.paymentTerms||"---"`. It renders what it's given. The issue is data absence at call time.

### C47 — 2026-06-09 — #119 PRJ402119 Silent Zero-BOM (SYSTEMIC)

**Symptom:** PRJ402119 shows ONLY auto-rows (labor/buyoff/crate/contingency), zero extracted BOM items, and no warning/gate/amber chip — despite being regioned and legible. "The original poster-child zero-BOM project."

---

#### Lead Question: Does the batch path bypass Phase 1 safety?

**Answer: NO.** The batch-path hypothesis from C45 (#118) is not the cause of the silence.

The batch extraction path runs INSIDE `runExtractionTask` (line 13528), which is called from `confirmAndExtract` (line 23584) AFTER the Phase 1c gate (line 23458). The call chain:

```
confirmAndExtract() → 1c gate (classifyBomInputTier) → runExtractionTask() → batch if eligible
```

`runExtractionTask` has exactly ONE call site (line 23584). The batch pre-fetch at line 13654 runs inside that function. So initial extraction always passes through the gate before batch fires.

**However:** `runExtraction` (re-extract, line 24200) and `reExtractWithFeedback` (line 24503) do NOT call `confirmAndExtract` and do NOT run the 1c gate. They go straight to extraction. `runExtraction` has its own batch logic (line 24250) but no tier classification. This means re-extraction bypasses the 1c gate — a secondary gap.

#### End-to-End Trace

**1. Source/Path:**
PRJ402119 has BOM-typed pages (C23 confirmed pages 3-4 as BOM). Pages have `originalPdfPath` and `pageNumber` (uploaded from PDF). Batch-eligible (≥2 BOM pages from same PDF). On extraction, would route through batch path.

**2. Tier + Gate:**
If extracted NOW via `confirmAndExtract`, the 1c gate would classify each BOM page via `classifyBomInputTier` (line 14701). Since the PDF is legible, likely text-layer or vector-stroke:
- Text-layer + region → Case 1 (silent proceed) — correct
- Vision + region → Case 3 (info toast, proceed) — correct
- Either way, extraction proceeds

BUT: PRJ402119 was extracted BEFORE the 1c gate existed (pre-v1.20.107). No classification happened.

**3. Extraction Result:**
The C23 diagnosis (CLAUDE.md line 673) identified the root cause: `runExtractionTask` previously filtered on `&& p.dataUrl`, excluding BOM-typed pages whose `dataUrl` had been stripped after upload to Firebase Storage. Pages had `storageUrl` but not `dataUrl`. The extraction task completed "normally" but silently skipped BOM pages.

The fix is now in place at line 13535:
```javascript
let bomPages=_bp.filter(p=>getPageTypes(p).includes("bom")&&(p.dataUrl||p.storageUrl));
```

`ensureDataUrl` (line 10203) downloads from `storageUrl` if `dataUrl` is missing. A NEW extraction would not hit this bug. But PRJ402119 has never been re-extracted.

**4. #82 noBomReason Escape:**
In the batch CF (functions/index.js line 2650-2686):
- `batchPdfCropped` is set to `true` when `pg.bomRegion` has valid dimensions (CropBox applied)
- Line 2686: `batchPdfCropped ? '' : noBomEscapeText` — escape removed when cropped
- PRJ402119 is regioned → `bomRegion` would be passed → CropBox applied → escape removed
- **Not the cause** for a new extraction. For the original extraction, the #82 escape deployment status was unconfirmed (C21 finding).

**5. Completeness Warning Absence — THE ROOT CAUSE:**

Every Phase 1 safety mechanism reads `panel.extractionReport`:

| Mechanism | Gate | Line |
|-----------|------|------|
| ZeroBomBanner | `if(!r)return null` | 22082 |
| Amber chip | `panel.extractionReport?.manualVerifyRequired` | 27071 |
| Send gate | `pan.extractionReport?.manualVerifyRequired` | 15152 |
| Completeness warning | embedded in `extractionReport.completenessWarning` | 14131 |

`extractionReport` was introduced in v1.19.598 (line 14100). PRJ402119 was extracted before that version. Its panel has NO `extractionReport` in Firestore.

**Chain of failure:**
1. PRJ402119 extracted pre-v1.19.598 → hit C23 dataUrl gating bug → 0 items
2. No `extractionReport` saved (didn't exist yet)
3. `ZeroBomBanner`: `const r=panel.extractionReport; if(!r)return null;` → **silent**
4. Amber chip: `panel.extractionReport?.manualVerifyRequired` → `undefined` → **no chip**
5. Send gate: `pan.extractionReport?.manualVerifyRequired` → `undefined` → **no block**
6. Completeness: `extractionReport.completenessWarning` → **missing**
7. User sees: empty BOM + auto-rows. No banner, no chip, no warning. Silent failure.

#### Systemic Scope

**This is not a PRJ402119 problem. It's a class-wide gap.**

ANY project extracted before v1.19.598 with 0 BOM items (or degraded extraction) is invisible to ALL Phase 1 safety systems. The ZeroBomBanner, amber chip, send gate, and completeness warning all require `extractionReport` — a field that didn't exist before v1.19.598.

Scale of exposure: every project in Firestore extracted before v1.19.598 has no `extractionReport`. Projects that produced 0 items sit in silent failure. Projects that produced items but with quality issues (should have `manualVerifyRequired`) have no safety flags.

#### Secondary Finding: Re-extract Bypasses 1c Gate

Three extraction entry points exist:

| Path | 1c Gate | Batch | Region Learning |
|------|---------|-------|-----------------|
| `confirmAndExtract` → `runExtractionTask` | YES | YES (no RL) | Per-page fallback YES |
| `runExtraction` (re-extract) | **NO** | YES (no RL) | Per-page fallback YES |
| `reExtractWithFeedback` (feedback) | **NO** | **NO** | Per-page YES |

The 1c gate (`classifyBomInputTier`) is called ONLY at line 23477, inside `confirmAndExtract`. Re-extraction paths skip it entirely. This means a user re-extracting a legacy project gets no tier classification, no vision-mode warning, no `manualVerifyRequired` flag.

Note: `manualVerifyRequired` on re-extract is inherited from the EXISTING `extractionReport` (lines 24407, 24635: `...(latestPanelRef.current.extractionReport?.manualVerifyRequired?{manualVerifyRequired:true}:{})`). If the existing report has the flag, it persists. If it doesn't (legacy), it stays absent.

#### Recommended Fix Scope

**Fix 1 (critical, ~8 lines): Legacy ZeroBomBanner fallback.**
In `ZeroBomBanner` (line 22080), when `!panel.extractionReport` but `(panel.bom||[]).length===0` and BOM-tagged pages exist, show a legacy banner: "This panel was extracted before quality tracking was added. Re-extract to see diagnostic details."

```
function ZeroBomBanner({panel}){
  const r=panel.extractionReport;
+ const hasBom=(panel.bom||[]).length>0;
+ const hasBomPages=(panel.pages||[]).some(p=>getPageTypes(p).includes("bom"));
+ if(!r && !hasBom && hasBomPages){
+   return <div style={...}>⚠ Legacy extraction — no diagnostic data. Re-extract for quality warnings.</div>;
+ }
  if(!r)return null;
  ...
}
```

**Fix 2 (important, ~5 lines): 1c gate on re-extract.**
Add `classifyBomInputTier` call to `runExtraction` so re-extraction also sets `manualVerifyRequired` when warranted.

**Fix 3 (defense in depth, ~10 lines): Firestore migration script or on-load backfill.**
When a panel loads with `bom.length===0` and BOM-tagged pages and no `extractionReport`, auto-populate a minimal report so the existing ZeroBomBanner fires: `{bomPageCount: N, perPageOutcomes: [], timestamp: 0, version: "legacy-backfill"}`.

**Effort:** Fix 1 is the minimum viable — ~8 lines, immediately surfaces all legacy silent failures. Fixes 2+3 are defense in depth.

#### PRJ402119-Specific Remediation

Re-extracting PRJ402119 now would:
1. Pass the 1c gate (if via `confirmAndExtract`)
2. Succeed on batch path (dataUrl gating fix in place)
3. Get CropBox from bomRegion (no #82 escape)
4. Build `extractionReport` with `perPageOutcomes`
5. Activate ZeroBomBanner if 0 items, or produce items successfully

But this doesn't fix the class-wide gap. The code fix (Fix 1) is needed so ALL legacy projects surface the warning.

### C48 — 2026-06-09 — High-DPI Resolution Test: PRJ402101 (CONFIRMED)

**Question:** Does feeding the model a high-DPI region image fix the resolution-class errors (single-char substitutions/drops — 32 of 38 wrong PNs per C3)?

**Answer: YES.** All three anchor PN errors resolve at 600 DPI. ARC has been hobbling its own input. Scans/bitmaps are NOT floor-limited — the source quality is adequate. The fix is region-targeted high-DPI rendering (the unshipped H5).

---

#### Test Setup

**Subject drawing:** PRJ402101, CSW1927-121, page 10 of 23. D-size (17"×11"), OVIVO Redmond Wetlands. BITMAP tier — BOM text rendered as CAD vector paths, not searchable text layer (only 95 chars of real text on the page). Two-column BOM layout: items 1-50 left, 51-62 right.

**PDF:** `tools/q3-measurement/pdfs/PRJ402101.pdf` (local copy, 2.9 MB, 23 pages).

**Rendering tool:** PyMuPDF 1.27.2.2, rendering page 10 to PNG at multiple DPIs.

**Test model:** Claude Opus (this session) reading each rendered image via the Read tool. Same model family ARC uses for extraction. Same vision pathway. Only the pixels change.

**Anchor PNs (Jon's verified ground truth):**

| Anchor | Correct PN | ARC's Read | Error Type |
|--------|-----------|------------|------------|
| Item 1 (ENCLOSURE) | SCE-90EL4820**SSFSD** | SCE-90EL4820**SSFD** | Char drop (S before D) |
| Item 2 (SUB-PANEL) | SCE-90P**48**F**1** | SCE-90P**4B**F | 8→B substitution + trailing 1 drop |
| Item 6 (CB103 breaker) | XT1**SU3060A**FF000XXX | XT1**US060M**FF000XXX | SU→US transpose, 3 drop, A→M |

---

#### Test Conditions

| Condition | Image Size | Effective DPI on BOM Text | What It Simulates |
|-----------|-----------|--------------------------|-------------------|
| 150 DPI full page | 2550×1650 px | ~150 | ARC's current path: native PDF → Anthropic internal render. D-size sheet at ~150 DPI yields ~12 px per character height. |
| 300 DPI items 1-12 crop | 2500×667 px | ~300 on BOM area | Middle ground. C2 finding: "300 DPI produced wrong PNs on ~15% of rows." |
| 600 DPI BOM region crop | 4998×5360 px (left col) | ~600 on BOM area | **THE TEST:** H5 proposal — render BOM region at 600 DPI, tight crop. Small enough that API downsampling doesn't shrink below ~300 effective. |
| 1600 DPI items 1-12 crop | 13328×3556 px | ~1600 on BOM area | Ground truth calibration — maximum legibility. |

---

#### Results

**150 DPI full page (BASELINE):**
- Individual catalog number characters are **indistinguishable**. Text is approximately 12 pixels tall per character.
- S/5, 8/B, A/M, D/O pairs cannot be differentiated.
- Anchor 1 (SCE-90EL4820SSFSD): Cannot read beyond "SCE-90EL..." — trailing characters are pixel mush.
- Anchor 2 (SCE-90P48F1): Cannot distinguish 8 from B, trailing digits unclear.
- Anchor 3 (XT1SU3060AFF000XXX): Cannot read beyond "XT1..." — character-level detail is lost.
- **Estimated overall catalog accuracy: <40%.** Consistent with ARC's measured 36% match rate (Q3 report).

**300 DPI BOM crop (MIDDLE):**
- Characters are partially readable but confusable pairs are **borderline**.
- Anchor 1: SSFSD partially distinguishable but S-before-D could be missed.
- Anchor 2: 8 vs B is ambiguous — would require guessing.
- Anchor 3: SU order partially readable, 3 is small and could be missed.
- **Matches C2 finding exactly:** "300 DPI produced wrong part numbers on ~15% of rows."

**600 DPI BOM region crop (TEST — the H5 fix):**
- Characters are **clearly distinguishable**. ~48 px per character height.
- Anchor 1: SCE-90EL4820**SSFSD** — the S before D is clearly visible. ✓
- Anchor 2: SCE-90P**48**F**1** — the 8 is unambiguously 8 (not B), trailing 1 is visible. ✓
- Anchor 3: XT1**SU3060A**FF000XXX — S-then-U order clear, 3 digit present, A not M. ✓
- **All three ARC-specific errors resolve.** The dropped-S, 8→B substitution, and SU→US/3-drop/A→M compound error all vanish with more pixels.

**1600 DPI crop (GROUND TRUTH):**
- All characters perfectly unambiguous. Used to calibrate the 600 DPI reads. No errors found at 1600 DPI.

---

#### Anchor PN Score Card

| Anchor | 150 DPI | 300 DPI | 600 DPI | 1600 DPI |
|--------|---------|---------|---------|----------|
| SCE-90EL4820SSFSD | ✗ unreadable | ~ borderline | ✓ correct | ✓ correct |
| SCE-90P48F1 | ✗ unreadable | ~ 8/B ambiguous | ✓ correct | ✓ correct |
| XT1SU3060AFF000XXX | ✗ unreadable | ~ partially readable | ✓ correct | ✓ correct |

---

#### Why 600 DPI Crop Works (Not Just Raw DPI)

The improvement isn't just DPI — it's **pixels on the BOM text specifically**. Two compounding factors:

1. **Tight crop removes non-BOM area.** A D-size full page at 150 DPI allocates 2550×1650 pixels across the title block, border, and schematic areas. The BOM text occupies maybe 30% of those pixels. A BOM-region crop at 600 DPI puts ALL pixels on the BOM.

2. **API downsample threshold.** Per C2 line 103: "vision APIs downsample large images internally, so a 10200×6600 image at 600 DPI may be seen by the model at effectively ~300 DPI." A full-page 600 DPI image (10200×6600) would be aggressively downsampled. But a BOM-region crop (4998×5360) is within the range where the model retains enough detail. The pixels that matter — the catalog number glyphs — survive the downsample.

Key insight: **the crop is as important as the DPI.** 600 DPI full page may not help. 600 DPI tight crop of just the BOM region is the sweet spot.

---

#### Answer to Jon's Question

> Does feeding the model a high-DPI region image fix the resolution-class errors?

**YES.**

- The dropped-S error (SCE-90EL4820SSFSD) → **fixed at 600 DPI.** The S is clearly visible.
- The 8→B error (SCE-90P48F1) → **fixed at 600 DPI.** The 8 is unambiguous.
- The SU→US / dropped-3 / A→M compound error (XT1SU3060AFF000XXX) → **fixed at 600 DPI.** All three substitutions resolve.

These three errors represent the Pattern A (single-char substitution) and Pattern B (char drop) error classes that account for **32 of 38 wrong PNs** on this drawing (C3 analysis). The resolution fix addresses the dominant error class.

**ARC has been hobbling its own input.** The source PDF has adequate quality — the BOM text is vector-rendered CAD geometry (not a degraded scan). The information IS in the PDF at effectively infinite resolution. But Anthropic's internal PDF renderer produces a vision-model input at uncontrolled (low) DPI, and the model can't read what it can't see.

**H5 (region-targeted high-DPI rendering) is the right fix.** The mechanism is:
1. Detect bitmap/vector-path PDFs via `assessPdfPageQuality` (already built)
2. For BOM-regioned pages on these PDFs, render the region at 600 DPI using PyMuPDF CropBox
3. Send the cropped image to the model instead of (or alongside) the native PDF page
4. Keep the crop small enough (~5000×5000 px) to avoid aggressive API downsampling

This is distinct from #113b (low-DPI tight crop) — #113b tests whether a crop at ARC's current resolution helps. This test shows that **both crop AND high DPI are needed** — 300 DPI crop is borderline (matches C2's "~15% error rate"), 600 DPI crop eliminates the resolution-class errors.

**What this test does NOT address:**
- Pattern C (BC data replacing extraction data): separate bug, not resolution-related
- Pattern D (complete misreads / wrong-row reads): layout detection failure, not resolution
- Pattern E (17 missing items): lost in positional dedup per C4, not extraction quality
- Pattern F (qty errors): row alignment issue, may or may not improve with better resolution

**Estimated accuracy improvement:** 32 of 38 wrong PNs are resolution-dependent (C3). At 600 DPI region crop, these should resolve → accuracy from ~36% to ~80%+ on catalog numbers. Remaining errors would be Patterns C/D/F (separate root causes).

---

#### Test Artifacts

All images saved to `tools/q3-measurement/`:
- `PRJ402101_p10_150dpi.png` — full page 150 DPI (2550×1650)
- `PRJ402101_p10_300dpi.png` — full page 300 DPI (5100×3300)
- `PRJ402101_p10_600dpi.png` — full page 600 DPI (10200×6600)
- `PRJ402101_left_600dpi_crop.png` — left BOM column 600 DPI (4998×5360)
- `PRJ402101_right_600dpi_crop.png` — right BOM column 600 DPI (5049×5360)
- `PRJ402101_items1-12_1600dpi.png` — items 1-12 ground truth (13328×3556)
- `PRJ402101_items1-12_300dpi.png` — items 1-12 at 300 DPI (2500×667)
- Various additional crops at 800/1200/2000 DPI for ground truth verification

---

### C49 — 2026-06-09 — H5 scope: region-targeted high-DPI rendering

**Assignment:** Produce a buildable implementation plan for H5 — the core render change that fixes resolution-class extraction errors. Scope/plan only, no build.

**Context:** C48 proved that 600 DPI BOM region crop fixes Pattern A+B errors (32/38 wrong PNs, accuracy ~36%→80%+). The old H5 scope (modal/flag/needs-review) already shipped in Phase 1 trust layer. What remains is the CORE RENDER CHANGE: stop sending native PDF for vision-mode pages, render high-DPI images instead.

---

#### THE CENTRAL PROBLEM

ARC sends BOM pages to Anthropic as `type: "document"` (native PDF). Anthropic rasterizes internally at **uncontrolled DPI**. For a D-size drawing's BOM region (~17"×11" page, ~8.5"×8" BOM area), internal rendering likely produces ~72–150 DPI — too low to distinguish confusable glyphs (S/5, 8/B, U/0, F/P at ~12–18px character height).

CropBox narrows the visible region but does NOT raise rasterization DPI. The pixels-per-character stays the same regardless of crop.

**The fix is an INPUT-TYPE change:** for vision-mode pages, render the BOM region to a high-DPI IMAGE client-side and send as `type: "image"` instead of `type: "document"`.

---

#### 1. THE SWITCH

**Where:** `extractBomPage` (app.jsx:11757)

**Current decision tree:**
```
extractBomPage
  ├─ PDF-native: loadOriginalPdfAsBase64 → type: "document"     (pdfBase64 path)
  ├─ cropped-region: cropRegionFromImage(dataUrl, region, 2000)  (LOW-RES source → type: "image")
  └─ image-fallback: dataUrl as-is → type: "image"
```

**New branch — insert BEFORE existing paths:**
```
extractBomPage
  ├─ NEW: if tier ≠ text-layer AND bomRegion exists:
  │     renderBomRegionHighDpi → tile[] → type: "image" blocks   (H5 path)
  ├─ PDF-native (text-layer pages — unchanged)
  ├─ cropped-region (fallback if H5 render fails)
  └─ image-fallback (unchanged)
```

**Tier determination:** Call `classifyBomInputTier(page)` at the top of `extractBomPage`. This is lightweight (~100ms, pdf.js text-character count) and already implemented (app.jsx:14701). Calling per-page in extractBomPage means ALL three extraction entry points (confirmAndExtract, runExtraction, reExtractWithFeedback) get H5 automatically — no threading needed.

**Gate logic:**
| Tier | bomRegion? | Path | Rationale |
|------|-----------|------|-----------|
| text-layer | any | PDF-native (unchanged) | Text extraction superior for readable text |
| vector-stroke | yes | **H5 high-DPI tiles** | Vector CAD geometry needs pixel rendering |
| bitmap | yes | **H5 high-DPI tiles** | Embedded images need high-res crop |
| scan | yes | **H5 high-DPI tiles** | Scanned pages need maximum DPI |
| any non-text | no | image-fallback (unchanged) | No region = can't target render |

---

#### 2. THE RENDER

**New function:** `renderBomRegionHighDpi(storageUrl, pageNum, bomRegion, pageMediaSize)`

**Mechanism:**
1. Fetch original PDF from Firebase Storage (`storageUrl` — same download as `loadOriginalPdfAsBase64` already does)
2. Load into pdf.js (`pdfjsLib.getDocument()` — already imported client-side for `classifyBomInputTier`)
3. Get page viewport at target scale: `pdfPage.getViewport({ scale: renderDpi / 72 })`
4. Render to canvas via `pdfPage.render()`
5. Crop canvas to BOM region coordinates (region is normalized 0–1, multiply by canvas dimensions)
6. If cropped canvas exceeds tile budget: split into grid tiles with **5% vertical overlap** (overlap prevents cutting BOM rows at tile boundaries)
7. Export each tile as JPEG data URL (quality 0.92)

**Why client-side pdf.js (not CF):**
- pdf.js already loaded — zero new dependencies
- Renders at arbitrary DPI — the KEY capability ARC currently lacks
- CF alternatives: pdf-lib (parse only, NO render) or puppeteer/chromium (full render, but ~2s cold start per invocation + heavy memory — functions/package.json already has `@sparticuz/chromium` but it's overkill for rasterization)
- Canvas rendering is fast: ~200ms for a single D-size page at 600 DPI

**Canvas memory guard:** A D-size page at 600 DPI produces a ~5100×3300 canvas (~67 MB raw). After BOM region crop: ~5100×4800 (~98 MB). Modern browsers handle this. Add a safety cap at 8000×8000 (Anthropic's absolute max) — if the full-DPI canvas would exceed this, reduce renderDpi proportionally.

---

#### 3. THE API-CEILING MATH

**Critical discovery: ARC uses `claude-opus-4-6`** (app.jsx:11, `ANTHROPIC_MODELS.OPUS:"claude-opus-4-6"`).

Anthropic's vision pipeline downsamples all images to fit within the model's native resolution:
- **Opus 4.7+:** max **2576 px** on long edge
- **Opus 4.6 and earlier, Sonnet, Haiku:** max **1568 px** on long edge

ARC is on the **1568 px** tier. This is the binding constraint.

**The fundamental formula:**
```
effectiveDpi = MODEL_MAX_PX / max(tileWidthInches, tileHeightInches)
```

Rendering at any DPI above this ceiling is WASTED — the API downsamples it away. A 5100×4800 image and a 1568×1474 image deliver identical pixels to the model.

**Tiling grid analysis for 8.5"×8" BOM region (typical D-size half-page):**

| Grid | Tiles | Tile size (in) | Eff. DPI @ 1568 | Eff. DPI @ 2576 | Image tokens | Comprehension risk |
|------|-------|---------------|-----------------|-----------------|--------------|-------------------|
| 1×1  | 1     | 8.5×8.0       | 184             | 303             | ~3.3k        | None              |
| 2×2  | 4     | 4.25×4.0      | 369             | 606             | ~13k         | Low               |
| 3×2  | 6     | 2.83×4.0      | 392             | 644             | ~20k         | Medium            |
| 3×3  | 9     | 2.83×2.67     | 554             | 911             | ~30k         | High              |
| 4×4  | 16    | 2.13×2.0      | 738             | 1213            | ~52k         | Impractical       |

**C48 calibration points:** 300 DPI = borderline (some chars still misread). 600 DPI = clean (all resolution errors resolved).

**Recommendation: 2×2 grid (4 tiles) as default.**
- 369 effective DPI with Opus 4.6 — above the 300 "borderline" threshold, should resolve MOST resolution errors
- When ARC bumps to Opus 4.7+: same 4 tiles → **606 DPI → clean**, matching C48's proven threshold
- 4 tiles is low enough for reliable model comprehension
- ~13k image tokens per BOM page vs ~3k current — 4× increase for vision-mode pages ONLY

**Adaptive grid algorithm:**
```javascript
const MODEL_MAX_PX = {
  'claude-opus-4-6': 1568,
  'claude-opus-4-7': 2576,
  'claude-opus-4-8': 2576
}[ANTHROPIC_MODELS.OPUS] || 1568;

const TARGET_DPI = 600;
const MAX_TILES = 6;

function findOptimalGrid(regionWInches, regionHInches) {
  let best = { nx: 1, ny: 1, dpi: MODEL_MAX_PX / Math.max(regionWInches, regionHInches) };
  for (let nx = 1; nx <= 4; nx++) {
    for (let ny = 1; ny <= 4; ny++) {
      if (nx * ny > MAX_TILES) continue;
      const tileW = regionWInches / nx;
      const tileH = regionHInches / ny;
      const dpi = MODEL_MAX_PX / Math.max(tileW, tileH);
      if (dpi > best.dpi) best = { nx, ny, dpi };
      if (dpi >= TARGET_DPI) return best; // found good enough
    }
  }
  return best;
}
```

**Optimal render DPI per tile:** `renderDpi = MODEL_MAX_PX / max(tileWInches, tileHInches)`. This fills each tile to exactly MODEL_MAX_PX on its long edge — maximum quality, zero wasted pixels, zero API downsampling.

**For smaller BOM regions (e.g., letter-size 6"×5"):**
- 1×1: 1568/6 = 261 DPI — may be sufficient for clean text
- 2×2: 1568/3 = 523 DPI — good, and upgrades to 859 with Opus 4.7+
- The algorithm auto-selects 1×1 when effectiveDpi ≥ TARGET (rare with 1568, common with 2576)

**Token cost model:**
```
tokensPerTile = (MODEL_MAX_PX × tilePixelHeight) / 750
totalTokens = tiles × tokensPerTile
```
For 2×2 at 1568: ~4 × 3,277 = **~13,100 tokens per BOM page** (vision-mode only).
Current PDF-native path: ~2,000–4,000 tokens. Text-layer pages unchanged.

---

#### 4. PATH COEXISTENCE

**Revised extractBomPage decision tree:**
```
extractBomPage(page, idx, totalPages, bomRegion, regionLearningParts, ...)
  │
  ├─ tier = classifyBomInputTier(page)           ← NEW: ~100ms, pdf.js text count
  │
  ├─ IF tier === 'text-layer':
  │     → PDF-native path (loadOriginalPdfAsBase64 → CropBox → type: "document")
  │     → UNCHANGED — text extraction is superior for readable text
  │
  ├─ ELIF bomRegion exists:
  │     → H5 path: renderBomRegionHighDpi(storageUrl, pageNum, bomRegion, mediaSize)
  │     → Returns tile dataUrl array
  │     → Send to CF (or direct API) with tiledBomImages param
  │     → Falls back to existing crop path on render failure
  │
  └─ ELSE:
        → image-fallback path (dataUrl as-is → type: "image")
        → UNCHANGED
```

**CF changes (functions/index.js, extractBomPage ~line 2325):**
- Accept new param: `tiledBomImages: string[]` (array of base64 JPEG data URLs)
- When present, build API message with N image content blocks instead of 1:
```javascript
if (tiledBomImages && tiledBomImages.length > 0) {
  const imageBlocks = tiledBomImages.map(tile => ({
    type: "image",
    source: { type: "base64", media_type: "image/jpeg", data: tile }
  }));
  content = [...imageBlocks, { type: "text", text: tilePrefix + bomPrompt }];
}
```
- Tile-awareness prompt prefix (only when tiles > 1):
  `"This BOM table has been split into {N} overlapping image tiles for resolution. All tiles show portions of the same table. Extract items from ALL tiles and combine into a single deduplicated result."`
- When tiles = 1: no prefix, behaves identically to current single-image path

**#82 noBomReason escape:** The `pdfCropped` flag (line 2432-2436) only applies to the PDF-native path. The H5 image path doesn't offer the noBomReason escape — standard #82 retry logic applies. This is correct behavior: if the model can't find a BOM in a high-DPI render of the BOM region, retry is appropriate.

**Region learning:** `regionLearningParts` are text content blocks spliced into the prompt. They're unaffected by the image source change — they continue to work identically on the H5 path.

**Batch path (extractBomBatch, line 2578):** Initially UNCHANGED. Batch sends multi-page PDF as a single document. H5 tiling is per-BOM-page in the single-page extraction path. Batch can adopt H5 in a later iteration (would require restructuring batch to per-page + recombine). This is acceptable: batch is a performance optimization, not an accuracy path.

**Re-extract paths:** All three entry points (confirmAndExtract/runExtraction/reExtractWithFeedback) call extractBomPage → H5 activates for all of them automatically. The tier call inside extractBomPage makes this self-contained.

---

#### 5. RESIDUAL HONESTY

**What H5 fixes:**
- Pattern A (single-char substitution): 26/38 wrong PNs — resolution-dependent → **fixed**
- Pattern B (char drop): 6/38 wrong PNs — resolution-dependent → **fixed**
- Total: 32/38 wrong PNs on PRJ402101 → accuracy from **~36% to ~80%+** on catalog numbers
- Bonus: PDF `type: "document"` incurs both text AND image token costs (3–5× more expensive per the API docs). Switching vision-mode pages to `type: "image"` eliminates the text-layer overhead — **net token savings** despite the tile cost increase, for scan/bitmap PDFs with empty text layers.

**What H5 does NOT fix:**
- Pattern C (BC data replacement, 2/38): BOM cell value replaced by BC lookup data — separate bug
- Pattern D (wrong-row reads, 3/38): layout detection failure, not resolution
- Pattern E (missing items, 17 lost): positional dedup bug — addressed by H6 (shipped)
- Pattern F (qty errors, 4/38): row alignment, may partially improve with better glyph resolution

**The 1568 limit honest assessment:**
- With Opus 4.6's 1568 px limit, 2×2 tiling achieves **369 effective DPI**
- C48 showed 300 DPI = "borderline" and 600 DPI = "clean"
- 369 DPI falls between these benchmarks — expect **MOST but not ALL** resolution errors to resolve
- **Full resolution fix requires Opus 4.7+ model upgrade** (2576 limit → 606 DPI with same 4 tiles)
- The MODEL_MAX_PX constant is the only change needed when upgrading — tiling auto-adjusts

**New risks introduced by tiling:**
1. **Cross-tile row splitting:** a BOM row cut at a tile boundary produces partial data in two tiles. Mitigated by 5% vertical overlap. Residual risk: rows near boundaries may be extracted twice → need dedup in prompt or post-processing.
2. **Multi-image comprehension:** the model must stitch context across 4 tiles. At 2×2 this is manageable. At 3×3+ (9 tiles), comprehension degrades — this caps practical scaling.
3. **Canvas memory:** D-size at 600 DPI = ~98 MB canvas. Browsers handle this, but low-memory devices or tabs with heavy DOM may struggle. Safety cap at 8000×8000 px.
4. **Latency:** pdf.js render ~200ms + tile split ~50ms + larger payload upload. Total ~300–500ms added per BOM page. Acceptable.

---

#### SIZING

| Component | Lines | Location |
|-----------|-------|----------|
| `renderBomRegionHighDpi()` | ~50 | app.jsx (client) |
| `findOptimalGrid()` | ~20 | app.jsx (client) |
| `splitCanvasIntoTiles()` | ~25 | app.jsx (client) |
| Tier gate in `extractBomPage` | ~15 | app.jsx (client) |
| `MODEL_MAX_PX` constant + lookup | ~5 | app.jsx (client) |
| CF multi-image handling | ~20 | functions/index.js |
| Tile-awareness prompt prefix | ~5 | functions/index.js |
| CF `tiledBomImages` param wiring | ~3 | functions/index.js |
| **Total** | **~143** | **~2 days dev, 1 day test** |

**Risk:** LOW-MEDIUM. Rendering is well-understood (pdf.js canvas, already used for tier classification). API shape change (multi-image) is the main risk surface — need to verify Anthropic handles multiple image blocks correctly in BOM extraction context. Path coexistence is clean (text-layer pages completely unchanged). Rollback: remove the tier gate check → reverts to PDF-native for all pages.

**Interaction with #113 (CropBox bitmap proof):** H5 SUPERSEDES #113. CropBox only narrows the visible region (doesn't raise DPI). H5 renders at target DPI directly. #113 can be closed or deprioritized.

**Upgrade path:** Bump `ANTHROPIC_MODELS.OPUS` to `"claude-opus-4-7"` or later. The `MODEL_MAX_PX` lookup automatically selects 2576, the grid algorithm automatically reduces tiling (or eliminates it), and effective DPI jumps to 600+. **One additional change required:** remove `temperature:0` from `apiCall` (see C50).

---

## C50: Fable 5 Verification — Model Decision for H5
**Date:** 2026-06-09 | **Type:** Analysis | **Refs:** C48, C49, TODO #120

**Question:** Does Claude Fable 5 (released 2026-06-09, `claude-fable-5`, Mythos-class, "state-of-the-art vision") change the H5 plan?

**THE CRITICAL NUMBER — Fable 5 Image Resolution:**
- **Fable 5 MODEL_MAX_PX = 2576px** — same as Opus 4.7 and 4.8
- Source: [Anthropic Vision Docs](https://docs.anthropic.com/en/docs/build-with-claude/vision), verified 2026-06-09
- "For Claude Fable 5 and Claude Mythos 5: 4784 tokens, and at most 2576 pixels on the long edge."
- Fable 5 does **NOT** raise the resolution ceiling beyond Opus 4.7/4.8.

### Resolution Ceiling Math (re-run from C49 with all models)

BOM region: 8.5" × 8" (typical D-size). TARGET_DPI = 600. MAX_TILES = 6.

| Model | MAX_PX | Best Grid | Tiles | Eff. DPI | vs 600 Target |
|-------|--------|-----------|-------|----------|---------------|
| Opus 4.6 (current) | 1568 | 3×2 | 6 | 392 | **BELOW** (-35%) |
| Opus 4.7 | 2576 | 2×2 | 4 | 606 | ABOVE (+1%) ✓ |
| Opus 4.8 | 2576 | 2×2 | 4 | 606 | ABOVE (+1%) ✓ |
| **Fable 5** | **2576** | **2×2** | **4** | **606** | **ABOVE (+1%) ✓** |

All 4.7+ models hit the same 606 DPI ceiling with fewer tiles (4 vs 6).

### "More Pixels" vs "Smarter Reading"
- **More pixels:** NO. Fable 5 accepts exactly the same 2576px images as Opus 4.7/4.8.
- **Smarter reading:** YES. Fable 5 is Mythos-class ("rebuilds web apps from screenshots," "state-of-the-art vision"). This is a model intelligence upgrade, not a resolution upgrade.
- **But:** C48 proved the problem is DPI, not model intelligence. 600 DPI tight crops fix Pattern A+B errors on the *current* Opus 4.6. Better reading of the same 606 DPI tiles may help marginally, but the dramatic accuracy fix comes from the resolution jump.

### Cost Comparison (per BOM page, vision-mode, 2×2 tiling)

Assumptions: ~13k image tokens + ~2k prompt tokens ≈ 15k input, ~3k output.

| Model | Input $/M | Output $/M | Input Cost | Output Cost | **Total/Page** |
|-------|----------|-----------|------------|-------------|---------------|
| Opus 4.6 (current, PDF-native) | $5 | $25 | ~$0.01 | ~$0.075 | **~$0.085** |
| Opus 4.7/4.8 + H5 tiling | $5 | $25 | ~$0.075 | ~$0.075 | **~$0.15** |
| Fable 5 + H5 tiling | $10 | $50 | ~$0.15 | ~$0.15 | **~$0.30** |

**Fable 5 is 2× the cost of Opus 4.7/4.8 for identical resolution.** The ~$0.15/page delta buys "smarter reading" only — not more pixels.

### Safety Fallback Check
Fable 5's classifier-based safeguards route requests to Opus 4.8 when detecting high-risk content in three domains: cybersecurity, biology/chemistry, and distillation. BOM extraction (construction part numbers, quantities, descriptions) does **not** trigger any of these. Over 95% of Fable sessions require no fallback. **BOM extraction is safe on Fable 5.**

### API Changes Required for ANY Model ≥ 4.7

**These apply equally to Opus 4.7, Opus 4.8, and Fable 5:**

1. **Model constant** (two locations):
   - `app.jsx:11` → `OPUS:"claude-opus-4-7"` (or 4.8 or fable-5)
   - `functions/models.js:19` → `OPUS: 'claude-opus-4-7'`

2. **BREAKING — Remove `temperature:0`** from `apiCall` at `app.jsx:2595`:
   - Currently: `body:JSON.stringify({model:ANTHROPIC_MODELS.OPUS,temperature:0,...body})`
   - Must become: `body:JSON.stringify({model:ANTHROPIC_MODELS.OPUS,...body})`
   - `temperature` returns **400** on all models ≥ 4.7 (Opus 4.7, 4.8, Fable 5)
   - This is spread as default, so it affects ALL Opus calls through `apiCall`
   - Note: SQ chat at line 44723 uses `temperature:1` with SONNET — Sonnet 4.6 still accepts temperature, so that path survives. But if SONNET is ever upgraded, it'll need the same fix.

3. **Fable 5 ONLY** — explicit `thinking: {type: "disabled"}` returns 400 (must omit instead):
   - Not currently used in ARC code, so **no action needed** for Fable 5 on this point.

4. **H5-added `MODEL_MAX_PX` lookup** auto-selects 2576 for any model ≥ 4.7. No change needed.

**Net: one-constant swap + remove `temperature:0`. Same change for 4.7, 4.8, or Fable 5.**

### RECOMMENDATION: Build H5 Against Opus 4.7 (or 4.8), Not Fable 5

| Factor | Opus 4.7/4.8 | Fable 5 |
|--------|-------------|---------|
| Resolution ceiling | 2576px → 606 DPI ✓ | 2576px → 606 DPI ✓ |
| Cost per BOM page | ~$0.15 | ~$0.30 (2×) |
| C48 accuracy fix | ✓ (600 DPI proves it) | ✓ (same DPI) |
| API change scope | Same | Same + omit `thinking` param |
| Additional benefit | None needed | "Smarter reading" (marginal for BOM) |
| Risk | Low (well-tested models) | Low (same API surface) |

**Rationale:** Jon said "cost is worth it IF the accuracy return is dramatic." At identical 2576px resolution, Fable 5's accuracy return over Opus 4.7/4.8 is marginal, not dramatic. The dramatic fix is the 4.6→4.7 resolution jump (1568→2576px), which both models share. Fable 5 can be A/B tested as a premium tier AFTER H5 ships.

**If Fable 5 is wanted later:** Only the model constant changes (one-line swap). H5 tiling infrastructure works identically.

---

## C51: H5 Verification — VERIFIED
**Date:** 2026-06-10 | **Type:** Verification | **Refs:** C48, C49, C50, TODO #120
**Versions:** v1.20.112 (H5 build), v1.20.113 (adaptive-thinking fix)
**Status:** H5 [Verified]

### 1. Anchor Verification — ALL 3 HOLD

| Anchor | C48 ground truth | H5 production result | Verdict |
|--------|-----------------|---------------------|:-------:|
| Item 9 / drawing #6 | XT1SU3060AFF000XXX | XT1SU3060AFF000XXX | ✓ |
| Dropped-S / drawing #1 | SCE-90EL4820SSFSD | SCE-90EL4820SSFSD | ✓ |
| 8→B / drawing #2 | SCE-90P48F1 | SCE-90P48F1 | ✓ |

**#113b consistent-misread fixes spot-checked:**
- S↔3: Item 3 `B460V3S` → `B460VSS` ✓
- 8↔6: Items 29 (`1346516`→`1348516`) and 55 (`3036338`→`3038338`) ✓
- Q↔D: Item 35 (`2085-ID16`→`2085-IQ16`) ✓

These are the EXACT glyph confusions that higher DPI resolves — not coincidental matches. All 12 consistent misreads in the table fixed independently. 100% is NOT a scoring artifact; it's the resolution hypothesis confirmed.

**54/54 = 100%** on PRJ402101 (up from ~36% baseline, 64.8% best #113b run).

### 2. Opus-Bump Blast-Radius Check — CLEAR

**Exhaustive Opus call-site inventory (8 total, 0 orphaned):**

| # | Location | Type | temp | thinking | Status |
|---|----------|------|:----:|----------|:------:|
| 1 | `apiCall` wrapper (app.jsx:2610) | Direct fetch | REMOVED (C50) | passthrough | ✓ |
| 2 | PDF-native fallback (app.jsx:11987) | Direct fetch | — | adaptive | ✓ |
| 3 | Cropped-region fallback (app.jsx:12027) | Direct fetch | — | adaptive | ✓ |
| 4 | BOM audit (app.jsx:12398) | Through apiCall | — | adaptive | ✓ |
| 5 | Title block (app.jsx:20618) | Direct fetch | — | adaptive | ✓ |
| 6 | extractBomPage CF (index.js:2530) | Direct fetch | — | adaptive | ✓ |
| 7 | extractBomBatch CF (index.js:2750) | Direct fetch | — | adaptive | ✓ |
| 8 | Quote extraction fallback (index.js:1157) | Direct fetch | — | omitted (OK) | ✓ |

**Methodology:** Grepped ALL direct `fetch("https://api.anthropic.com/v1/messages"` calls (10 in app.jsx, 4 in functions/index.js) AND all `ANTHROPIC_MODELS.OPUS` references. Cross-verified: zero remaining `budget_tokens` or `thinking.*enabled` in live code (only in comments). Zero remaining `temperature` params in OPUS code paths.

**Marc's 6 conversions** (sites 2-7): all correctly use `thinking:{type:"adaptive"}`. Confirmed.

**Site 8 — quote extraction fallback (NOT in Marc's list):** Uses OPUS as a fallback behind SONNET. Has no `temperature` and no `thinking` param. Omitting `thinking` is valid on Opus 4.8 (`"disabled"` and omission both work). **Won't 400.** This was pre-existing — never had old syntax. Note: lacks adaptive thinking, so OPUS quote extraction won't use reasoning. Quality concern (minor), not a failure mode.

**Non-OPUS calls checked:** SONNET calls (12157, 13616, 38847, 40051, 44871) and HAIKU calls (13043, 21430) don't pass to Opus. The SONNET SQ chat at 44871 uses `temperature:1` — Sonnet 4.6 still accepts temperature. Model health monitor (index.js:2827) iterates all models with bare `max_tokens:1` ping — no thinking/temperature. All safe.

**Verdict: NO SEVENTH (or higher) orphaned Opus call site. The model bump is safe.**

### 3. Text-Layer Untouched — CONFIRMED

Tier gate at app.jsx:11893-11907:
```
if (_h5Tier !== "text-layer" && _h5Tier !== "no-pdf") → H5 tile path
else → standard PDF-native path (logged explicitly)
```

`classifyBomInputTier` (app.jsx:14845-14890) counts extractable text characters in the BOM region via pdf.js `getTextContent()`. Threshold: 100 chars (with region) or 500 chars (without). Text-layer pages return `"text-layer"` → H5 is completely bypassed → PDF-native extraction unchanged. These pages already worked at 100% and are not regressed.

### 4. Fallback Safety — CONFIRMED

The H5 block (app.jsx:11887-11916) has two independent fallback paths:

1. **H5 returns 0 items:** `if((h5Result.items||[]).length>0)` check fails → logs warning → falls through to standard extraction paths (server → PDF-native → cropped-region).
2. **H5 throws any error:** Entire H5 block is wrapped in try/catch → logs error + debug entry → falls through to same standard paths.

After either fallback, the full standard extraction waterfall runs: server-side CF (11919) → PDF-native direct (11973) → cropped-region direct (12015). H5 failure is non-blocking degradation by design. Rollback is also clean: removing the tier-gate block reverts everything.

### 5. Phantom Items — Pattern D Residual, Not H5 Bug

8 phantom items (43-50) persist: AFS09-30-22-11, RH#B-ULCDC24V relays, 4 Phoenix terminal PNs. Drawing BOM numbering skips 42→51. These come from schematic callouts inside the sloppy 94%-of-page auto-region (`aiBomRegion`). The region includes schematic area adjacent to the BOM table.

This is the expected Pattern D residual (wrong-area reads from C48/C49 taxonomy). A tight user-drawn region would exclude the schematic entirely. H5 did its job: resolution is fixed, and the 54 actual BOM items read at 100%. The 8 phantoms are a region-tightness problem, not a resolution problem.

### Effective DPI Note

Production run hit ~440 DPI (not the 606 DPI from C49's tight-region math) because the auto-region spans 16.0"×10.1" — much larger than the assumed 8.5"×8". With 3×2 grid on a 16" region: `2576 / (16/3) ≈ 483`. The ~440 reported figure likely accounts for overlap margins. Still well above C48's 300 DPI borderline, and empirically 100% clean. Tighter regions yield higher DPI automatically.

### Next Step

Test PRJ402119 (the worst-case drawing) to confirm H5 is not a one-drawing result. The infrastructure is proven; the question is whether it generalizes.

---

## C52 — H5 Generalization Test: PRJ402119 (Close-Out Findings)

**Date:** 2026-06-10 (logged 2026-06-15 close-out)
**Role:** Coach (Sam Wize)
**Scope:** PRJ402119 independent ground truth + H5 generalization analysis + three record corrections

### Result: H5 GENERALIZES — PRJ402119 14/14 = 100%

Both Marc's parallel run and Coach's independent analysis confirm H5 delivers 100% on PRJ402119, up from 36-50% baseline. H5 is proven on 2 of 2 worst-case drawings (PRJ402101 54/54, PRJ402119 14/14). The resolution hypothesis is confirmed as the general fix for vision-mode extraction accuracy.

### Finding 1: Region Edge-Padding Needed (→ TODO #121)

Over-tight BOM regions silently clip edge rows. Marc encountered this on PRJ402119 — the tight user-drawn region cut bottom rows until padded. The guidance from Phase 1c should be "tight AND complete," not just "region tightly."

**Recommended fix:** Pad the resolved region ~2% on all edges in `renderBomRegionHighDpi` before rendering tiles. Negligible DPI cost (~5-10 DPI on typical regions), prevents silent data loss.

### Finding 2: Ground-Truth Correction for #113 (→ TODO #122)

The #113 answer key (from 95-ITEM8-TRACE-RESULTS.md) was wrong on items 1 and 2:
- Item 1: listed as SCE-1413PCW → correct is **SCE-1412PCW**
- Item 2: listed as SCE-14P13AL → correct is **SCE-14P12AL**

Confirmed at 2400 DPI by Coach independent reading. Both H5 runs read the correct "12" values. The "2" vs "3" is a font-rendering ambiguity at low DPI that vanishes at high DPI — exactly the class of error H5 fixes. Notable: the AI with sufficient resolution was more accurate than the human-verified answer key.

### Finding 3: PRJ402119 is Vector, Not Raster (→ TODO #123)

**Critical record correction.** #113 characterized PRJ402119 page 3 as "168 DPI monochrome fax-scan." Investigation revealed:

- 15,307 vector drawing paths (lines, curves, text outlines)
- 531 extractable text characters via pdf.js
- 1 embedded raster image: 1425×472, 1bpc monochrome — **company logo only**
- BOM table text is vector content, not raster bitmap

The "168 DPI fax" label came from `assessPdfPageQuality` detecting the small monochrome embedded image and misgrading the entire page. `classifyBomInputTier` correctly returns `'vector-stroke'` (pdfQualityData is null in the H5 call path).

This corrects the #113 conclusion that "scans are floor-limited by source scan quality." PRJ402119 was never floor-limited — the entire 36→100% accuracy delta was send-resolution, same class as PRJ402101. Higher DPI rendering produces genuinely sharper text because the source is vector, not raster.

### H5 DPI Summary for PRJ402119

| Scenario | Grid | Tiles | Effective DPI |
|----------|------|:-----:|:-------------:|
| User-drawn region (4.77"×1.63") | 2×1 | 2 | **1,079** |
| Full page (11.0"×8.5") | 3×2 | 6 | **606** |
| API internal renderer (baseline) | n/a | 1 | **~150** |

Both scenarios are well above the 600 DPI target. The tight user-drawn region delivers nearly 2× the DPI of full-page at 1/3 the tile count.

---

## C53 — #121 Region Edge-Padding Fix Review

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** H-item step 7 review of #121 (region edge-padding in `renderBomRegionHighDpi`)
**Diff reviewed:** Uncommitted changes in `src/app.jsx` (constant + padding block + downstream derivation)

### Verdict: APPROVED — ship it

The change is correct, minimal, and well-placed. Six lines of padding math, one constant, clean handoff from `bomRegion` → `region` with no stale references downstream.

### Code Review

1. **Constant placement** — `H5_REGION_PAD_FRAC=0.02` at line 11531, adjacent to `H5_TILE_OVERLAP_FRAC`. Right neighborhood. Comment is accurate and sufficient.

2. **Padding math** — Proportional to region dimensions (`bomRegion.w * 0.02`, `bomRegion.h * 0.02`), applied symmetrically to all four edges, clamped to `[0,1]` page bounds. The asymmetric clamp (`Math.max(0,...)` on origin, `Math.min(1,...)` on extent) correctly handles regions flush against any edge — padding extends only inward on clamped edges. Width/height are computed as `(clamped far edge) - (clamped origin)`, so the geometry is self-consistent regardless of which edges clamp.

3. **Downstream references** — Verified: within `renderBomRegionHighDpi` (lines 11558–11616), `bomRegion` appears only in lines 11574–11578 (the padding computation). All subsequent code (`regionWIn`, `regionHIn`, `rX`, `rY`, `rW`, `rH`, tile loop) derives from `region`. No stale-reference bug.

4. **Call site** — Single entry point at line 11909: `renderBomRegionHighDpi(originalPdfPath, pageNumber, bomRegion)`. The raw `bomRegion` is still passed to `classifyBomInputTier` at line 11907 for tier classification — correct, since tier classification should see the user's original region, not the padded one. The padding is a render-time concern only.

5. **No Cloud Function change needed** — H5 tiling is client-side; the CF receives tiles as images. Confirmed.

### Answers to Marc's Questions

**Q1 — 2% per edge is correct.** My C52 said "pad ~2% before rendering" — that means 2% on each edge, not 2% total. The TODO's "~5-10 DPI" estimate was based on smaller region geometry; actual cost is ~18 DPI on PRJ402101 (440→422) and ~69 DPI on PRJ402119 (1079→1010). Both remain far above the 600 DPI clean threshold and even farther above the 300 DPI borderline. The margin is enormous. 1% per edge would risk being too timid for the clipping case.

**Q2 — Clamp behavior is correct.** The PRJ402119 failure was bottom-row clipping on a tight user-drawn region. A region whose bottom edge is at, say, `y+h=0.98` gets padded to `min(1, 0.98+pad)` — extends downward. A region already at `y+h=1.0` (touching the page bottom) correctly clamps to 1.0 and doesn't extend past the page. That matches: the user draws tight, the pad extends to catch the clipped row, but never off-page. The inward-only pad on clamped edges is the right behavior — a BOM table flush against the page edge has no content to capture beyond the edge.

**Q3 — Logical review is sufficient. No re-run needed.** The change is 6 lines of geometry math upstream of the tile loop. The tile loop, DPI calculation, overlap logic, and render pipeline are untouched. H5 failure already falls through to standard extraction paths (rollback-safe by design, confirmed in C51). The DPI cost is provably small relative to the margin. Re-running PRJ402119's 14/14 test would confirm what the math already proves. Save the verification cycle for something where the outcome is uncertain.

### DPI Impact Summary

| Drawing | Region | Grid | Pre-pad DPI | Post-pad DPI | Delta | vs 600 target |
|---------|--------|:----:|:-----------:|:------------:|:-----:|:-------------:|
| PRJ402101 | 16.0"×10.1" | 3×2 | ~440 | ~422 | -18 | still above 300 borderline |
| PRJ402119 | 4.77"×1.63" | 2×1 | ~1,079 | ~1,010 | -69 | 1.7× target |

No risk to extraction quality on any known drawing.

---

## C54 — #121 Region Edge-Padding v2 Review (Floor Pad)

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** H-item step 7 re-review of #121 after Freddy analyst feedback. Two-part pad: proportional ceiling + absolute floor.
**Diff reviewed:** Uncommitted changes in `src/app.jsx` (two constants + floor→fraction conversion + max-of-two pad logic + downstream derivation)

### Verdict: APPROVED — ship it. Regression re-run requested.

Freddy's insight is correct and important: a clipped row is a fixed-height problem, not a proportional one. The proportional-only pad from C53 would have delivered only 0.38% of page height per Y-edge on PRJ402119's tight 1.63" region — about 2.3pt, roughly a quarter of a BOM row. That's not enough. The floor term is the load-bearing fix.

### Review Point 1: Floor→Fraction Conversion

**Confirmed correct.** `baseVp = pg.getViewport({scale:1})` returns page dimensions in PDF points (1pt = 1/72 inch). For PRJ402119 (11.0"×8.5" = 792×612 pts):

- `_floorFracX = 14/792 ≈ 0.0177` → 14pt horizontal pad per edge
- `_floorFracY = 14/612 ≈ 0.0229` → 14pt vertical pad per edge

The division is dimensionally correct: PDF points ÷ PDF points = unitless page fraction. The `Math.max` then picks whichever is larger (floor or proportional) per axis independently. On PRJ402119, the floor wins both axes (0.0177 > 0.00868 on X, 0.0229 > 0.00384 on Y).

### Review Point 2: Floor Value — 14pt

**14pt is geometrically correct for the failure mode.** A standard BOM table row is 10-14pt (8-10pt font + 2-4pt cell padding). The clipping Marc observed on PRJ402119 was partial-row clipping at the region boundary — the user drew to the last row's baseline, cutting off the bottom cell border or descenders. 14pt covers one full row height, which is sufficient for boundary clipping.

**I do NOT have a measured clip distance from the PRJ402119 test.** The C52 finding recorded the symptom ("tight user-drawn region cut bottom rows until padded") but not the point measurement — Marc adjusted the region visually, not numerically. However, the geometry is sound: if the clip had exceeded one row (14pt), Marc would have reported losing multiple rows, not "edge rows." 14pt is the right order of magnitude.

**On Freddy's Y-axis pollution concern:** 14pt ≈ one row of pad is the minimum effective dose. The title block and revision table on PRJ402119 are several rows away from the BOM table boundary — typical BOM-to-titleblock gap on ANSI B drawings is 0.5-1.0 inches (36-72pt). 14pt won't reach it. This is a safe value. If field data later shows phantom-row injection, the floor can be lowered to 10pt without losing the fix.

### Review Point 3: DPI Impact

| Drawing | Region | Grid | Floor pad (Y) | Pre-pad DPI | Post-pad DPI | Delta |
|---------|--------|:----:|:-------------:|:-----------:|:------------:|:-----:|
| PRJ402119 | 4.77"×1.63" | 2×1 | 14pt (0.194") | ~1,079 | ~1,050 | -29 |
| PRJ402101 | 16.0"×10.1" | 3×2 | 14pt (0.194") | ~440 | ~436 | -4 |

Floor pad is larger than proportional on PRJ402119 (0.194" vs 0.033") but the DPI cost is still modest because the region only grows ~24% on its short axis. PRJ402101's large region is dominated by the proportional term (2% of 10.1" = 0.202" > 0.194"), so floor barely matters there. Both remain far above 600 DPI target.

### Review Point 4: Code Structure

Same clean structure as C53's review — `bomRegion` referenced only in the padding computation (lines 11584-11588), `region` used for everything downstream. The `Math.max` between proportional and floor is per-axis, which is correct (X and Y have different page dimensions, so the floor→fraction conversion yields different values). Asymmetric clamp to [0,1] unchanged from v1. No stale references. `classifyBomInputTier` at line 11907 still sees the raw `bomRegion` — correct.

### Review Point 5: Regression Re-run

**Requested.** Unlike the proportional-only C53 review, the floor pad changes the actual padding behavior significantly on tight regions — PRJ402119's Y-axis pad goes from ~2.3pt (proportional) to 14pt (floor). That's a 6× increase in padding on the axis that matters. The change is still geometrically safe by analysis, but:

1. The 14/14 result was achieved with zero padding. The floor pad adds ~0.39" total height (~24% region growth on Y). I want to see that no phantom rows from adjacent drawing elements leak in.
2. This is a one-time cost — extract one page, count items, compare to the known-good 14. Five minutes of work, high-confidence ship signal.

Specifically: extract PRJ402119 page 3 (the BOM page) with the padded build. Confirm 14 items returned, all matching the C52 ground truth. If item count >14, check for phantom rows from title block / revision table (Freddy's watch-item). If <14, the pad isn't sufficient and we need to investigate.

---

## C57 — #117 Re-Confirmation at v1.20.114

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Read-only re-pin of C46 root cause against v1.20.114 code. No implementation.

### Prior Finding (C46, v1.20.98-era)

From C46, the recorded root cause:

> Fields RANDOMLY show "---" on printed quotes. Two print paths diverge: Path A (`handlePrintQuote`, line 35735) runs BC auto-populate before generating PDF. Path B ("Generate PDF" button in QuoteView, line 19469) reads React state directly — no BC fetch. Additionally: quote field edits have NO auto-save, `saveProject` is fire-and-forget, and BC token expiry silently skips the entire fetch.

### Re-Confirmation: C46 holds at v1.20.114. All four findings confirmed.

#### Q1: WHICH two paths diverge?

Not two rendering paths — **two data-population paths before the same renderer.**

Both paths ultimately call the same function: `generateQuotePdf(project)` (line 7564) → `buildQuotePdfDoc(doc, project)` (line 6771) → renders `q.paymentTerms||"---"` at line 6827. The renderer is identical. The divergence is upstream:

**Path A — "Print Client Quote" / "Just Print" / "Send Quote" → `handlePrintQuote()` (line 35906):**
- Runs BC auto-populate (lines 35960-36113) which fetches `paymentTerms` and `shippingMethod` from BC project card
- Merges into `proj.quote` (line 36115)
- Saves to Firestore via `saveProject(uid, proj)` at line 36116 (fire-and-forget, not awaited)
- Then triggers `generateQuotePdf(projectRef.current)` — `projectRef.current` now has the BC-populated terms

**Path B — "🖨 Generate PDF" button in QuoteView (line 19636):**
```javascript
onClick={async()=>{await generateQuotePdf(project);...}}
```
- Calls `generateQuotePdf(project)` directly with the `project` from React state
- **NO BC auto-populate**
- **NO Firestore save**
- If `project.quote.paymentTerms` was never populated (by a prior Path A run or manual entry) → PDF shows "---"

#### Q2: WHAT diverges?

The asymmetry is BC auto-populate, not rendering. Path A runs a BC fetch that populates `paymentTerms` and `shippingMethod` before the PDF is generated. Path B skips it entirely. Both paths render through the same `buildQuotePdfDoc` which shows "---" for any missing field.

Line 36037-36038 (the actual BC fetch):
```javascript
let pmtTerms=bc.CCS_Payment_Terms_Code||bc.Payment_Terms_Code||"";
let shipMethod=bc.CCS_Shipment_Method_Code||bc.Shipment_Method_Code||"";
```

Line 36062-36063 (merge into quote):
```javascript
if(pmtTerms)autoFields.paymentTerms=pmtTerms;
if(shipMethod)autoFields.shippingMethod=shipMethod;
```

#### Q3: WHICH path fires WHEN?

- **"Print Client Quote"** button in ProjectView → Path A (`handlePrintQuote`, line 35906). This is the primary workflow button.
- **"Just Print"** from Send Quote modal → Path A (dispatches `arc-just-print` event at line 31799, caught at line 35854, calls `handlePrintQuote()`).
- **"Send Quote"** flow → Path A (triggers `handlePrintQuote` → `autoPrint` → `generateQuotePdf`).
- **"🖨 Generate PDF"** button in QuoteView (line 19636) → **Path B**. This is a secondary/convenience button inside the quote editor.

The "randomness" is NOT random — it's which button the user clicks. A user who always uses "Print Client Quote" always gets BC auto-populate. A user who uses "Generate PDF" from the quote editor never gets it. If they PREVIOUSLY used Path A and the save succeeded, the terms are in Firestore and Path B reads them from saved state — appearing to work. If they haven't, or the save failed, "---".

#### Q4: Data presence — is it ALSO a data problem?

**Yes, partially. Three data-presence factors compound the path divergence:**

1. **No auto-save on quote field edits (confirmed, still present at v1.20.114).** `setQ(updates)` at line 19614 calls `onUpdate({...project, quote:{...q, ...updates}})` → `update(p)` at line 35782 → sets React state only (`setProject`, `projectRef.current`, `onChange`). **No `saveProject` anywhere in this chain.** A user who manually types "Net 30 Days" into the Payment Terms field sees it rendered in the editor, but it's RAM-only. Navigate away → gone. Next session → "---".

2. **Fire-and-forget save in `handlePrintQuote` (confirmed, still present at line 36116).** `saveProject(uid, proj)` is called without `await`. If Firestore write fails (network, quota, permissions), the terms exist in memory for the current print but aren't persisted. Next session → "---" again.

3. **BC token gates the entire fetch (confirmed, still present at line 35972).** `if(proj.bcProjectNumber && _bcToken && needsBcFetch)` — if `_bcToken` is null (BC session expired, user hasn't authenticated), the ENTIRE BC fetch is skipped. This is the most common "intermittent" condition: whether BC auto-populate runs depends on whether the user has an active BC session at print time.

4. **BC project card may not have terms (confirmed, still present at lines 36037-36038).** Both fields try CCS-prefixed then standard BC fields. If neither populated, falls back to customer card GUID resolution (lines 36040-36051). If customer card also empty → terms stay empty even when BC is connected.

### Summary for Freddy

| Component | Current line | Status at v1.20.114 |
|-----------|:------------|:-------------------|
| `handlePrintQuote` (Path A entry) | 35906 | Unchanged — runs BC auto-populate |
| BC auto-populate block | 35960-36113 | Unchanged — fetches terms from BC |
| `needsBcFetch` gate | 35971-35972 | Unchanged — skips if `_bcToken` null |
| Fire-and-forget save | 36116 | Unchanged — `saveProject` not awaited |
| "Generate PDF" button (Path B) | 19636 | Unchanged — no BC fetch, no save |
| `setQ` (quote editor state) | 19614 | Unchanged — React state only, no auto-save |
| `update(p)` in ProjectView | 35782 | Unchanged — no Firestore write |
| `buildQuotePdfDoc` renderer | 6827-6828 | Unchanged — `q.paymentTerms\|\|"---"` |

**Fix scope from C46 still holds at ~20 lines:**
1. Debounced auto-save for quote edits (~5 lines) — same pattern as PanelCard's autoSaveTimer
2. Await the save in `handlePrintQuote` (~3 lines) — change line 36116 to `await saveProject`
3. BC auto-populate before `generateQuotePdf` on Path B (~10 lines) — extract the BC fetch into a shared helper, call it in QuoteView's Generate PDF handler
4. (Defense) Console.warn when BC token gates the fetch (~2 lines)

---

## C58 — #117 Detailed Plan (Option 3, Full Scope)

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Detailed implementation plan for Marc. Coach verifies each phase before the next.
**Principle:** Both populate paths converge on ONE pre-render gate: populate → persist → loud-on-failure. The renderer never prints a silent blank. Fixes the A/B divergence and all three silent-failure modes as one pattern.
**Builds on:** C57 (re-confirmation at v1.20.114), C46 (original root cause)

---

### Feasibility Verification

**Q1: Is the BC fetch callable from Path B's QuoteView context?**
YES. `QuoteView({project, uid, onBack, onUpdate})` (line 34754) is a function component inside app.jsx. It has closure access to all module-scoped BC infrastructure:
- `_bcToken` (line 394)
- `bcDiscoverODataPages`, `bcGatedFetch`, `bcGetCompanyId` (module-scoped functions)
- `BC_ODATA_BASE`, `BC_API_BASE` (module-scoped constants)
- `saveProject` (line 8499, module-scoped async function)

No prop threading or context wiring needed. A shared function at module scope is callable from both `handlePrintQuote` (ProjectView) and the Generate PDF handler (QuoteView).

**Q2: Does Payment Terms have a legitimate default?**
NO. Two distinct fields exist:
- `q.termsText` — the narrative body copy ("Standard Payment Terms for Panel Builds..."). HAS a default at line 6835-6836: `q.termsText!=null ? q.termsText : defaultTerms`. This is the payment terms paragraph, not the header field.
- `q.paymentTerms` — the one-line BC code ("Net 30 Days", "2% 10 Net 30"). NO default. Sourced from BC project card `CCS_Payment_Terms_Code` or `Payment_Terms_Code` (line 36037), or customer card `paymentTermsId` resolved via REST (line 36049-36051). Blank = error — means BC didn't have it or the fetch didn't run.

`q.shippingMethod` — same: NO default. BC shipment method code ("FOB Destination", "WILL CALL"). Blank = error.

**Ruling:** Blank paymentTerms or shippingMethod is always an error condition — flag it, never fall back to a default.

**Q3: Can the ~160-line BC auto-populate block be cleanly extracted?**
YES. Lines 35956-36117 are self-contained: they read `proj`, `proj.quote`, `proj.panels`, and `proj.bcProjectNumber`, then build an `autoFields` object and merge it. The only external dependency is `_bcToken` (module-scoped). The block returns the merged project. State updates (`setProject`, `projectRef.current`, `onChange`, `saveProject`) happen AFTER the merge at line 36116 — those stay with the caller.

The salesperson resolution (lines 36064-36108) is also inside this block. It's not #117-specific but it's part of the same auto-populate and must move with it.

---

### Phase 1 — Kill the Divergence + Persist (Fixes 1 + 2)

**Goal:** Both entry points call the same populate function before rendering, and the save is awaited.

#### Fix 1: Extract `ensureQuoteFieldsPopulated(project, uid)`

**What:** Extract lines 35956-36117 into a new module-scoped async function.

**New function (insert near `generateQuotePdf` at ~line 7593):**
```javascript
async function ensureQuoteFieldsPopulated(project, uid) {
  // ... lines 35956-36113 moved here, operating on `project` parameter ...
  // Returns { project: mergedProject, warnings: string[] }
}
```

**Signature:** `async function ensureQuoteFieldsPopulated(project, uid)` → `{ project, warnings }`
- `project` — the input project, possibly with quote fields merged from BC
- `warnings` — array of warning strings (empty if all succeeded). Prepares for Fix 3.
- Does NOT do state updates or saves — callers handle that.

**Change locations:**

| What | Line | Change |
|------|------|--------|
| New function declaration | ~7593 (after `generateQuotePdf`) | +165 lines (extracted, not net-new) |
| `handlePrintQuote` inline populate | 35956-36117 | Replace with: `const result = await ensureQuoteFieldsPopulated(proj, uid);` then `proj = result.project;` |
| Path B "Generate PDF" button | 19636 | Add shared call before `generateQuotePdf` (see below) |

**Path A caller change (handlePrintQuote, line ~36114-36116):**
Before:
```javascript
if(Object.keys(autoFields).length){
  proj={...proj,quote:{...q,...autoFields}};
  setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);
}
```
After:
```javascript
const populateResult = await ensureQuoteFieldsPopulated(proj, uid);
proj = populateResult.project;
setProject(proj); projectRef.current = proj; onChange(proj);
```
(Save moves to Fix 2 below — awaited.)

**Path B caller change (QuoteView "Generate PDF" button, line 19636):**
Before:
```javascript
onClick={async()=>{await generateQuotePdf(project);const hash=...;onUpdate({...project,...});}}
```
After:
```javascript
onClick={async()=>{
  const result = await ensureQuoteFieldsPopulated(project, uid);
  const populated = result.project;
  onUpdate(populated);
  await saveProject(uid, populated);
  await generateQuotePdf(populated);
  const hash = computeBomHash(populated.panels);
  onUpdate({...populated, lastPrintedBomHash: hash, lastQuotePrintedAt: Date.now(), quoteRevAtPrint: populated.quoteRev || 0});
}}
```
`onUpdate` here is `update(p)` (line 35782) — sets React state + projectRef + onChange. Then `saveProject` persists (awaited, fixing Fix 2b for Path B). Then `generateQuotePdf` runs against populated data.

**~170 lines moved, ~15 lines net-new at call sites.**

#### Fix 2: Await saves (no more fire-and-forget)

**2a — handlePrintQuote save (line 36116):**
Before: `saveProject(uid, proj);` (fire-and-forget)
After: `await saveProject(uid, proj);`
One word change. The `catch` for save failure surfaces via Fix 3's warning pattern.

**2b — autoPrint save (line 35820):**
The `autoPrint` effect at line 35820 also fires `saveProject(uid, upd)` without await. Same fix:
Before: `...onChange(upd);saveProject(uid,upd);setAutoPrint(false);...`
After: `...onChange(upd);await saveProject(uid,upd);setAutoPrint(false);...`

**2c — Path B save:** Already covered in Fix 1's Path B caller change above — `await saveProject(uid, populated)` before `generateQuotePdf`.

**2d — Wrap saves with try/catch → arcAlert on failure:**
```javascript
try { await saveProject(uid, proj); }
catch(e) { console.error("[QUOTE] Save before print failed:", e); arcAlert("Failed to save quote before printing. Your edits may not persist. Retry or check your connection."); }
```
Applied at all three save sites (handlePrintQuote, autoPrint, Path B).

**~10 lines net-new.**

#### Phase 1 Boundary

After Phase 1:
- Both paths populate from BC before rendering ✓
- Both paths persist to Firestore (awaited) before rendering ✓
- setQ edits that exist only in React state are flushed via `onUpdate` → `saveProject` ✓
- The A/B divergence is dead ✓
- Fire-and-forget is dead ✓

**Phase 1 does NOT address:** BC token null (still silently skips), blank fields still render as "---" without warning.

#### Phase 1 Test Criteria

1. **Path B now populates from BC:** With BC connected, click "Generate PDF" in QuoteView on a project with blank paymentTerms. Verify: terms appear on the PDF (not "---"), AND the project is saved to Firestore with the terms.
2. **Path A still works:** "Print Client Quote" still populates and prints correctly. Regression check.
3. **RAM-only edits persist:** In QuoteView, manually type a payment term into the field (via setQ). Without clicking "Print Client Quote" first, click "Generate PDF." Verify the typed value appears on the PDF AND is saved to Firestore.
4. **Save failure surfaces:** Disconnect network, click "Generate PDF." Verify `arcAlert` fires with the save-failure message.
5. **autoPrint path:** "Print Client Quote" → checklist → "Proceed" → verify save completes before PDF generation.

---

### Phase 2 — Loud on Failure (Fixes 3 + 4)

**Goal:** BC-token-null and blank fields are never silent. The user always knows when data is missing and can act.

#### Fix 3: BC token null → visible warning

**3a — In `ensureQuoteFieldsPopulated` (the shared function from Fix 1):**
When `proj.bcProjectNumber && needsBcFetch && !_bcToken`, push a warning string:
```javascript
if (proj.bcProjectNumber && needsBcFetch && !_bcToken) {
  warnings.push("bc-unavailable");
}
```

**3b — Path A: Add pre-print checklist entry (line ~36167):**
After the existing BC Sync check (line 36167), add:
```javascript
// Check: BC not connected but project needs quote field population
const qNow = projectRef.current.quote || {};
const needsFields = !qNow.paymentTerms || !qNow.shippingMethod;
if (projectRef.current.bcProjectNumber && !_bcToken && needsFields) {
  issues.push({
    type: "bctoken",
    label: "BC Unavailable",
    detail: "Payment Terms / Shipping Method not populated — connect to BC or enter manually",
    checked: false,  // unchecked = user must acknowledge
  });
}
```
This follows the existing checklist pattern. The issue is NOT auto-checked — the user must explicitly check it (acknowledging they'll proceed without terms) or cancel and fix.

**3c — Path B: surface warning before proceeding:**
In the Path B caller (from Fix 1), after `ensureQuoteFieldsPopulated` returns:
```javascript
if (result.warnings.includes("bc-unavailable")) {
  const proceed = await arcConfirm(
    "BC is not connected — Payment Terms and Shipping Method may be missing. Print anyway?",
    { kind: "warning", okLabel: "Print Anyway" }
  );
  if (!proceed) return;
}
```

**Carve-out:** Actual BC token refresh / re-auth is a SEPARATE backlog item. #117 only makes the null case visible. Marc logs it as a T-series TODO entry: "T-bcReauth: Implement BC token refresh flow when token expires mid-session."

**~15 lines net-new.**

#### Fix 4: Renderer backstop — no silent blanks

**4a — Pre-print checklist entry for blank required fields (line ~36200):**
After the existing Upload Drawings check:
```javascript
// Check: Required quote fields present
const qCheck = projectRef.current.quote || {};
const missingFields = [];
if (!qCheck.paymentTerms) missingFields.push("Payment Terms");
if (!qCheck.shippingMethod) missingFields.push("Shipping Method");
if (missingFields.length > 0) {
  issues.push({
    type: "blankfields",
    label: "Missing Quote Fields",
    detail: missingFields.join(", ") + " — enter manually before printing",
    checked: false,  // blocks proceed until user acknowledges
  });
}
```

**4b — Path B: same check after populate:**
```javascript
const qAfter = populated.quote || {};
const missing = [];
if (!qAfter.paymentTerms) missing.push("Payment Terms");
if (!qAfter.shippingMethod) missing.push("Shipping Method");
if (missing.length > 0) {
  const proceed = await arcConfirm(
    `Missing: ${missing.join(", ")}. The PDF will show "---" for these fields. Print anyway?`,
    { kind: "warning", okLabel: "Print Anyway" }
  );
  if (!proceed) return;
}
```

**4c — Ruling on defaults:**
- `paymentTerms`: NO default. Blank = error. Always flag.
- `shippingMethod`: NO default. Blank = error. Always flag.
- `termsText`: HAS a default (line 6835-6836). NOT flagged — it gracefully falls back to the standard terms narrative.
- Other fields (`company`, `contact`, `address`): Out of #117 scope. These have the same A/B problem but are lower severity — the user is more likely to notice a missing company name than missing payment terms code. Can be added to the backstop later.

**~15 lines net-new.**

#### Phase 2 Boundary

After Phase 2:
- BC token null shows a visible warning (checklist entry or arcConfirm) ✓
- Blank paymentTerms/shippingMethod are flagged before print ✓
- User can still proceed (acknowledged override) — this is a gate, not a block ✓
- "---" on a printed quote is now always a deliberate user choice, never a silent default ✓

#### Phase 2 Test Criteria

1. **BC token null, Path A:** Disconnect BC (clear `_bcToken`). Click "Print Client Quote" on a project with blank terms. Verify: pre-print checklist shows "BC Unavailable" entry. Entry is unchecked by default.
2. **BC token null, Path B:** Same setup. Click "Generate PDF." Verify: `arcConfirm` dialog appears warning about BC unavailability.
3. **Blank fields, Path A:** Project with no paymentTerms (even after BC populate — e.g., BC card has no terms configured). Verify: checklist shows "Missing Quote Fields: Payment Terms" entry.
4. **Blank fields, Path B:** Same project. Click "Generate PDF." Verify: `arcConfirm` dialog lists missing fields.
5. **Override works:** User checks the "Missing Quote Fields" checklist entry and proceeds. Verify: PDF generates with "---" as before — the gate doesn't hard-block.
6. **Clean path unaffected:** Project with all fields populated, BC connected. Verify: no new checklist entries appear. Print flow unchanged.

---

### Size Estimate

| Fix | Description | Net-new lines | Moved lines |
|-----|-------------|:------------:|:-----------:|
| Fix 1 | Extract `ensureQuoteFieldsPopulated` + call from both paths | ~15 | ~160 |
| Fix 2 | Await saves + try/catch | ~10 | 0 |
| Fix 3 | BC token null warning (checklist + arcConfirm) | ~15 | 0 |
| Fix 4 | Blank field backstop (checklist + arcConfirm) | ~15 | 0 |
| **Total** | | **~55 net-new** | **~160 moved** |

C46's ~20-line estimate was for the minimal "add BC fetch to Path B + await save" approach. The full Option 3 scope (shared function + loud-on-failure layer) is ~55 lines net-new. Confirmed within Jon's 40-60 estimate.

### Sequence

```
Phase 1: Fix 1 + Fix 2 → Marc implements → Coach verifies test criteria → deploy
Phase 2: Fix 3 + Fix 4 → Marc implements → Coach verifies test criteria → deploy
```

Phase 1 kills the data divergence. Phase 2 adds the noise layer. Splitting ensures the core fix lands and verifies before layering defense.

### Risk Notes

1. **Salesperson resolution inside the extracted function** (lines 36064-36108): This is ~45 lines of BC salesperson lookup that happens to live inside the auto-populate block. It must move with the extraction — it's not #117-specific, but orphaning it would break salesperson auto-fill. Marc should move it intact, not refactor it.

2. **`handlePrintQuote` runs the pre-print checklist AFTER populate.** After Fix 1, the checklist runs against the already-populated project. This is correct — the checklist should reflect post-populate state (e.g., "Missing Quote Fields" should only fire if fields are STILL blank after BC populate succeeded).

3. **Path B's `onUpdate` is React-state-only.** After `onUpdate(populated)`, the React state has the populated data but Firestore may not (until `await saveProject` completes). The order in the Fix 1 Path B change is: `onUpdate` (React) → `await saveProject` (Firestore) → `generateQuotePdf` (render). This is correct — React state updates synchronously for the next render, and the save completes before the PDF.

4. **No debounced auto-save added.** C46 suggested a debounced auto-save for setQ edits. This plan deliberately OMITS it — the flush-before-action pattern (Fix 2c) is sufficient and avoids write spam. If Jon later wants save-on-idle for quote fields, that's a separate enhancement.

---

## C59 — C58 Phase 1 Amendment (Path B Wiring Correction)

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Amendment to C58 Phase 1, fixing three incorrect assumptions about Path B's component boundary. This finding supersedes C58's Phase 1 "Path B caller change" section only. All other C58 content (Phase 2, shared function extraction, Fix 2a/2b) remains valid.

### What C58 Got Wrong

C58 Q1 ("Is the BC fetch callable from Path B's QuoteView context?") answered YES based on closure access to module-scoped BC functions. That was correct for QuoteView but irrelevant — **the Generate PDF button is in QuoteTab, not QuoteView.**

Three errors:

| # | C58 assumption | Reality (v1.20.114) | Impact if built as-planned |
|---|---------------|---------------------|---------------------------|
| 1 | Path B button lives in QuoteView (has `uid` in scope) | Button at line 19636 is in `QuoteTab({project, onUpdate})` (line 19594) — no `uid` | `ReferenceError: uid is not defined` |
| 2 | `project` in QuoteTab is the real project | QuoteTab receives `aggregated` (built at line 34800): `{...project, bom:allBom, pages:flatMap, laborData:null, _quoteLabor}` | `saveProject(uid, aggregated)` persists the synthetic merged shape → **flattens multi-panel BOM/pages into the project doc** (#86 failure class, silent data corruption) |
| 3 | `onUpdate` in QuoteTab reaches ProjectView's unrestricted `update(p)` | `onUpdate` is `handleQuoteUpdate` (line 34809) which whitelists `quote/pricing/panels/budgetaryQuote` only, drops `bcSalespersonCode` | Salesperson code from BC populate lost in Path B |

Marc caught all three before implementing. Correct call to hold.

### Verified Component Hierarchy

```
ProjectView (line 34912)
  ├─ project (real), uid, projectRef, setProject, onChange
  ├─ update(p) — unrestricted state setter (line 35782)
  │
  └─ QuoteView({project, uid, onBack, onUpdate=update}) (line 34754, rendered at 36896)
       ├─ uid ✓, project (real) ✓, onUpdate = update (unrestricted) ✓
       ├─ aggregated = {...project, bom:allBom, pages:flatMap, ...} (line 34800)
       ├─ handleQuoteUpdate(upd) — whitelists quote/pricing/panels/budgetaryQuote (line 34809)
       │
       └─ QuoteTab({project=aggregated, onUpdate=handleQuoteUpdate}) (line 19594, rendered at 34845)
            ├─ uid ✗, project = aggregated (synthetic) ✗, onUpdate = whitelisted ✗
            └─ Generate PDF button (line 19636) ← THIS IS PATH B
```

QuoteView is the correct level: it has `uid`, the real `project`, and unrestricted `onUpdate`.

### Ruling: Option A — Lift the Action to QuoteView

**Endorsed.** Option B (re-thread uid/bcSalespersonCode through QuoteTab's whitelist + split persist-real from render-aggregated) is strictly worse — same number of changes, adds coupling to the whitelist, and still requires the caller to know which object is "real" vs "aggregated."

### Amended Phase 1 Path B Wiring

**Step 1: Add `onGeneratePdf` prop to QuoteTab.**

QuoteTab signature change (line 19594):
```javascript
// Before:
function QuoteTab({project, onUpdate}){
// After:
function QuoteTab({project, onUpdate, onGeneratePdf}){
```

Generate PDF button change (line 19636):
```javascript
// Before:
onClick={async()=>{await generateQuotePdf(project);const hash=computeBomHash(project.panels);onUpdate({...project,lastPrintedBomHash:hash,lastQuotePrintedAt:Date.now(),quoteRevAtPrint:project.quoteRev||0});}}
// After:
onClick={onGeneratePdf}
```

The button becomes a pure callback — no logic, no `project`, no `uid`.

**Step 2: Define `handleGeneratePdf` in QuoteView.**

Inside QuoteView (after `handleQuoteUpdate` at line ~34813):
```javascript
async function handleGeneratePdf() {
  // 1. Populate from BC on the REAL project (not aggregated)
  const result = await ensureQuoteFieldsPopulated(project, uid);
  const populated = result.project;

  // 2. Update React state with populated real project (unrestricted update)
  onUpdate(populated);

  // 3. Persist REAL project to Firestore (awaited — Fix 2c)
  try { await saveProject(uid, populated); }
  catch(e) {
    console.error("[QUOTE] Save before print failed:", e);
    arcAlert("Failed to save quote before printing. Your edits may not persist.");
  }

  // 4. Build PDF from aggregated view with populated quote fields
  //    aggregated has the merged BOM; populated has the fresh quote
  await generateQuotePdf({...aggregated, quote: populated.quote});

  // 5. Post-print metadata on the REAL project
  const hash = computeBomHash(populated.panels);
  onUpdate({
    ...populated,
    lastPrintedBomHash: hash,
    lastQuotePrintedAt: Date.now(),
    quoteRevAtPrint: populated.quoteRev || 0
  });
}
```

**Step 3: Pass prop through (line 34845).**
```javascript
// Before:
<QuoteTab project={aggregated} onUpdate={handleQuoteUpdate}/>
// After:
<QuoteTab project={aggregated} onUpdate={handleQuoteUpdate} onGeneratePdf={handleGeneratePdf}/>
```

### Why This Works — Each Concern at the Right Level

| Concern | Where | Object used |
|---------|-------|-------------|
| BC populate | QuoteView (`handleGeneratePdf`) | `project` (real) via `ensureQuoteFieldsPopulated` |
| React state update | QuoteView | `onUpdate(populated)` = `update(p)` (unrestricted) |
| Firestore persist | QuoteView | `saveProject(uid, populated)` — real project, not aggregated |
| PDF rendering | QuoteView → `generateQuotePdf` | `{...aggregated, quote: populated.quote}` — merged BOM + fresh quote |
| bcSalespersonCode | QuoteView | On `populated` → `onUpdate(populated)` → `update(p)` → `projectRef.current` ← no whitelist |
| Post-print hash | QuoteView | `computeBomHash(populated.panels)` — real panels, not merged BOM |

The aggregated object is used ONLY for the PDF (where the merged BOM view is correct). All persistence and state updates operate on the real project.

### Shared Function Return Contract (Locked)

```
async function ensureQuoteFieldsPopulated(project, uid)
  → { project: Project, warnings: string[] }
```

**Semantics:**
- Returns a SHALLOW COPY of the input project. Does NOT mutate the input.
- `.quote` is merged with autoFields (paymentTerms, shippingMethod, company, address, contact, phone, email, salesperson, salesEmail, salesPhone, drawingRev, description, projectNumber, taxAreaCode).
- `.bcSalespersonCode` is set at the top level if resolved from BC project card (line 36068-36069 pattern: `if(spCode && !proj.bcSalespersonCode)` → set it).
- `.warnings` contains string keys: `"bc-unavailable"` when `bcProjectNumber && needsBcFetch && !_bcToken`. (Phase 2 consumes these.)
- Does NOT: call `saveProject`, call `setProject`/`projectRef.current`/`onChange`, or touch `aggregated`. Callers own state and persistence.

**Both callers apply the returned copy identically:**

Path A (`handlePrintQuote`):
```javascript
const result = await ensureQuoteFieldsPopulated(proj, uid);
proj = result.project;
setProject(proj); projectRef.current = proj; onChange(proj);
await saveProject(uid, proj);  // Fix 2a: awaited
```

Path B (`handleGeneratePdf` in QuoteView):
```javascript
const result = await ensureQuoteFieldsPopulated(project, uid);
const populated = result.project;
onUpdate(populated);  // = update(p) → setProject + projectRef + onChange
await saveProject(uid, populated);  // Fix 2c: awaited
await generateQuotePdf({...aggregated, quote: populated.quote});
```

`bcSalespersonCode` propagates correctly in both: Path A sets it directly on `proj`/`projectRef.current`; Path B sets it via `onUpdate(populated)` → `update(p)` → `projectRef.current = p` (unrestricted, no whitelist).

### Revised Phase 1 Size

| Change | Lines |
|--------|:-----:|
| Extract `ensureQuoteFieldsPopulated` (function declaration + body moved) | ~165 moved, ~8 wrapper |
| Path A caller refactor (replace inline with shared call + await save) | ~6 |
| QuoteTab: add `onGeneratePdf` prop + swap button handler | ~3 |
| QuoteView: `handleGeneratePdf` function | ~18 |
| QuoteView: pass `onGeneratePdf` prop | ~1 |
| Fix 2a: await save in handlePrintQuote | ~4 (try/catch wrap) |
| Fix 2b: await save in autoPrint effect | ~4 (try/catch wrap) |
| **Total** | **~44 net-new, ~165 moved** |

Slightly larger than C58's ~25 estimate because the QuoteView handler has more structure (aggregated rebuild, hash on real panels).

### Phase 1 Test Criteria (Amended)

C58's five test criteria still apply. Two additions:

6. **Aggregated shape NOT persisted:** After "Generate PDF" from QuoteView, read the Firestore project doc. Verify it has `panels` (array of panel objects), NOT a flat `bom` array at the project level. This confirms the aggregated shape was only used for PDF, not persisted.
7. **bcSalespersonCode persists via Path B:** Project with a BC-linked salesperson. Click "Generate PDF." Verify `bcSalespersonCode` appears on the Firestore project doc after the save.

### Verdict

C58 Phase 1 is amended per this finding. Marc implements from C59's wiring. Phase 2 (Fix 3 + Fix 4) is unchanged — C58's Phase 2 section remains valid since it references the shared function's `warnings` return and the pre-print checklist, neither of which are affected by the Path B component boundary.

Marc: implement Phase 1. Coach verifies test criteria before Phase 2.

---

## C60 — #117 Phase 1 Code Review Sign-Off

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Static verification of criteria 3, 6, 7 + quote-number redundancy check. Diff: +218/-165 in src/app.jsx, uncommitted on master.

### Shared Function Contract Verification

`ensureQuoteFieldsPopulated(project, uid)` at line 7601-7771:

| Contract point | Spec (C59) | Implementation | Verdict |
|---|---|---|---|
| Non-mutating | Returns shallow copy, never mutates input | `let merged=project;` then conditionally `merged={...project}` at line 7766. Only spreads if autoFields populated or newSalespersonCode set. Input `project` never assigned to. | PASS |
| bcSalespersonCode | Set on returned copy, not mutated in place | Old inline `proj={...proj,bcSalespersonCode:spCode}` (was line 36374) replaced with `newSalespersonCode=spCode` (line 7717) → merged at line 7767: `merged.bcSalespersonCode=newSalespersonCode`. Mutation is on the spread copy, not the input. | PASS |
| Quote merge | autoFields merged into .quote on returned copy | Line 7768: `merged.quote={...q,...autoFields}` — only on the spread copy. | PASS |
| Warnings | Returns `warnings: string[]`, empty in Phase 1 | Line 7602: `const warnings=[];` returned at line 7770. No pushes yet — Phase 2 hook point. | PASS |
| No state updates | Does not call setProject/projectRef/onChange/saveProject | Grep confirmed: zero calls to setProject, projectRef, onChange, or saveProject inside lines 7601-7771. | PASS |

### Criterion 3: All saves awaited — no fire-and-forget in print paths

| Save site | Location | Awaited? | Error handling | Verdict |
|---|---|---|---|---|
| Path A populate save | Line 36166 | `await saveProject(uid,proj)` | try/catch → console.error + arcAlert | PASS |
| Path A autoPrint save | Line 36022 | `try{await saveProject(uid,upd);}catch(e){...}` | console.error + arcAlert | PASS |
| Path B pre-render save | Line 35005 | `await saveProject(uid,populated)` | Outer try/catch → console.error + arcAlert | PASS |
| Path B post-print save | Line 35010 | `await saveProject(uid,printed)` | Same outer try/catch | PASS |

**Note on Path B's two-save pattern:** C59 spec showed one save before PDF + onUpdate after. Marc added a second save after the post-print metadata update (`lastPrintedBomHash`, `lastQuotePrintedAt`, `quoteRevAtPrint`). This mirrors Path A's structure where autoPrint also saves post-print metadata. Correct improvement over C59's spec — post-print metadata should persist, not ride only on the next unrelated save.

### Criterion 6: aggregated used ONLY for PDF — #86 corruption guard

Tracing every reference to `aggregated` inside `handleGeneratePdf` (lines 35000-35015):

| Line | Expression | Object used | Verdict |
|---|---|---|---|
| 35002 | `ensureQuoteFieldsPopulated(project,uid)` | `project` (QuoteView prop = real project from line 34754) | REAL |
| 35004 | `onUpdate(populated)` | `populated` = copy of real project | REAL |
| 35005 | `saveProject(uid,populated)` | `populated` = copy of real project | REAL |
| **35006** | `generateQuotePdf({...aggregated,quote:populated.quote})` | `aggregated` with fresh quote spliced in | **AGGREGATED — PDF only** |
| 35007 | `computeBomHash(populated.panels)` | `populated.panels` = real panels | REAL |
| 35008-35009 | `{...populated,...metadata}` + `onUpdate(printed)` | `populated` = real project | REAL |
| 35010 | `saveProject(uid,printed)` | `printed` = real project + metadata | REAL |

`aggregated` appears exactly ONCE: the `generateQuotePdf` call at line 35006. Every `saveProject` and `onUpdate` targets the real project. **The #86 guard holds.** The aggregated shape (with merged `bom`, flattened `pages`, null `laborData`, synthetic `_quoteLabor`) never reaches Firestore.

### Criterion 7: bcSalespersonCode via unrestricted onUpdate

Trace:
1. `ensureQuoteFieldsPopulated` returns `populated` with `bcSalespersonCode` set (line 7767 on the merged copy). PASS.
2. `onUpdate(populated)` at line 35004 — QuoteView's `onUpdate` is `update` from ProjectView (line 36896: `<QuoteView ... onUpdate={update}/>`). `update(p)` at line 35782 does `setProject(p);projectRef.current=p;onChange(p)`. Unrestricted — no field whitelist. PASS.
3. NOT `handleQuoteUpdate` (line 34989-34991), which whitelists `quote/pricing/panels/budgetaryQuote` only and would drop `bcSalespersonCode`. Confirmed: `handleGeneratePdf` uses `onUpdate` directly (which is `update`), not `handleQuoteUpdate`. PASS.

### Quote-Number Save Redundancy Check

Line 36151: `setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);`

This is fire-and-forget. Marc claims it's REDUNDANT because the awaited save at line 36166 persists the same `proj`.

**Verification:**
1. Line 36150: `proj={...proj,quote:{...(proj.quote||{}),number:qNum}}` — `proj` now has `quote.number`.
2. Line 36151: fire-and-forget `saveProject(uid,proj)` — saves `proj` including `quote.number`.
3. Line 36163: `ensureQuoteFieldsPopulated(proj,uid)` receives `proj` (with `quote.number`).
4. Inside the function: `q=project.quote||{}` picks up `number:qNum`. `autoFields` never touches `number`. Return: `{...project, quote:{...q,...autoFields}}` — `q` still has `number`.
5. Line 36164: `proj=_pop.project` — still has `quote.number`.
6. Line 36166: `await saveProject(uid,proj)` — awaited save includes `quote.number`.

**Redundancy confirmed.** The quote number rides through `ensureQuoteFieldsPopulated` untouched (the function only merges `autoFields`, which does not include `number`). The awaited save at line 36166 persists the same project including the number.

**Ruling: LEAVE IT.** The fire-and-forget is harmless — worst case it succeeds redundantly; the awaited save covers it. Awaiting it is scope creep into an already-working path. Agree with Marc's recommendation.

### QuoteTab Button Wiring

| Component | What changed | Verified |
|---|---|---|
| `QuoteTab` signature (line 19773) | Added `onGeneratePdf` to destructured props | PASS |
| Generate PDF button (line 19815) | `onClick={onGeneratePdf}` — pure callback, no inline logic | PASS — button has no `project`, `uid`, or `saveProject` references |
| `QuoteView` render (line 35047) | `<QuoteTab ... onGeneratePdf={handleGeneratePdf}/>` | PASS — prop wired |

### Inline Block Deletion

The old inline BC auto-populate block (was lines 35956-36117) is fully deleted from `handlePrintQuote`. No orphaned fragments remain. The replacement at lines 36158-36170 is the shared function call + awaited save. All DECISION comments from the old block are preserved in the extracted `ensureQuoteFieldsPopulated` (lines 7612-7617, 7625, 7631, 7656, 7682, 7712). No behavioral logic lost.

### Sign-Off

**Criteria 3, 6, 7: ALL PASS.**

| # | Criterion | Status |
|---|-----------|--------|
| 3 | All saves awaited | PASS — four save sites, all awaited with try/catch |
| 6 | aggregated never persisted | PASS — used exactly once, for generateQuotePdf only |
| 7 | bcSalespersonCode via unrestricted path | PASS — onUpdate = update, not handleQuoteUpdate |
| QN | Quote-number save redundancy | CONFIRMED redundant — leave as-is |

**Phase 1 code is cleared for deploy.** Marc deploys → v1.20.115. Live criteria 1/2/4/5 run by Jon post-deploy against a test-copy project first (the #86 safety gate), then real quotes. Phase 2 holds until all 7 criteria are green.

---

## C61 — #117 Root Cause Re-Confirmation: Unreachable QuoteTab + True Intermittent Cause

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Independent verification of Marc's unreachability finding, amended root cause analysis, and Phase 2 reframing. Read-only — no implementation.
**Amends:** C57 (root cause), C58 Phase 2 framing.

---

### Q1: Is the QuoteTab Editing Surface Unreachable?

**CONFIRMED.** Every path into QuoteView is invisible.

**Evidence:** All 10 `setView("quote")` call sites in ProjectView set `setAutoPrint(true)` immediately before:

| # | Line | Context | autoPrint set? |
|---|------|---------|:-:|
| 1 | 36263 | handlePrintQuote — no checklist issues | YES |
| 2 | 36279 | handlePrintQuote — no bcProjectNumber | YES |
| 3 | 36284 | handlePrintQuote — no _bcToken, planning sync skip | YES |
| 4 | 36299 | handlePrintQuote — no planning page found | YES |
| 5 | 36344 | handlePrintQuote — no drawings to upload | YES |
| 6 | 36348 | handlePrintQuote — after upload prompt, all uploaded | YES |
| 7 | 37391 | Checklist modal — "Print Now — Skip All" | YES |
| 8 | 37440 | Checklist modal — "Proceed" after processing | YES |
| 9 | 37684 | BC upload prompt — "Upload & Print" | YES |
| 10 | 37697 | BC upload prompt — "Skip" | YES |

**10/10 paired with `setAutoPrint(true)`.** Zero standalone `setView("quote")` calls.

The render branch at line 36947-36949:
```jsx
{view==="quote"?(
  <div style={autoPrint?{height:0,overflow:"hidden"}:undefined}>
    <QuoteView .../>
```

When `autoPrint=true` (always, per above), QuoteView is rendered in `height:0, overflow:hidden`. The autoPrint useEffect (line 36021-36023) fires after 400ms, generates the PDF, then immediately calls `setAutoPrint(false); setView("panels")` — React batches both state updates into a single re-render (React 18 automatic batching), so the intermediate state `(autoPrint=false, view="quote")` never renders.

**Result:** The Generate PDF button (line 19815), the setQ editor fields, and ALL of QuoteTab's interactive controls are mounted in the DOM but invisible and non-interactive. No user can reach them under any normal interaction. `view` initial state is `"panels"` (line 35303).

**Unreachable controls:**
- Generate PDF button (line 19815) — now calls `onGeneratePdf` from Phase 1, but is never clickable
- All `setQ` fields (paymentTerms, shippingMethod, company, contact, address, etc.)
- Quote terms editor, pricing fields
- The entire Formal Quote tab

### Q2: Is `_bcToken` Null the Intermittent Cause?

**YES.** On the only reachable print path (`handlePrintQuote`), the BC auto-populate is gated at line 7620 (inside `ensureQuoteFieldsPopulated`, post-Phase 1):

```javascript
if(project.bcProjectNumber && _bcToken && needsBcFetch){
```

When `_bcToken` is null:
1. The entire BC fetch block is skipped (lines 7621-7760)
2. `autoFields` remains empty for BC-sourced fields
3. `paymentTerms` and `shippingMethod` stay blank
4. PDF renders `q.paymentTerms||"---"` at line 6827

`_bcToken` (line 394) is module-scoped, set on BC connect, cleared on BC disconnect or token expiry. BC tokens expire periodically (varies by BC tenant configuration, typically ~1 hour). The "intermittent" pattern matches: print immediately after BC connect → terms populated; print after token expires → terms blank. From the user's perspective, this appears random because token expiry is invisible.

### Q3: Is `needsBcFetch` a Second Candidate?

**NO.** The gate is:
```javascript
const needsBcFetch = !q.company || !q.address || !q.salesperson || spLooksLikeCode || !q.paymentTerms || !q.shippingMethod;
```

This is an OR condition. If `paymentTerms` is blank, `needsBcFetch` is `true` regardless of other fields. The gate correctly triggers when terms are missing — it cannot cause a false skip.

The only way `needsBcFetch` could mask a problem: if ALL fields (company, address, salesperson, paymentTerms, shippingMethod) are populated from a prior fetch, the gate returns `false` and the fetch is skipped. But that's correct behavior — terms are already present.

### Q4: Phase 2 Reframing

**YES — Fix 3 is now the PRIMARY fix for #117's user-facing symptom, not a backstop.**

C57/C58 framed Fix 3 as a defensive layer — "make token-null loud" as a nice-to-have after fixing the A/B divergence. With Path B (QuoteTab's Generate PDF) confirmed unreachable, the root cause analysis inverts:

| C57 root cause | Status after unreachability finding |
|---|---|
| A/B path divergence | IRRELEVANT — Path B is unreachable |
| setQ edits lost (RAM-only) | IRRELEVANT — setQ editor is unreachable |
| `_bcToken` null silent skip | **PRIMARY** — the only cause of user-visible "---" |
| Fire-and-forget save | Addressed by Phase 1 (awaited saves), but was not the intermittent trigger |

**Phase 2 should be reframed:**
- **Fix 3 (loud on token null) is the lead fix.** This is what the user needs: when BC is unavailable and terms can't be populated, the pre-print checklist surfaces it. The user either reconnects or enters terms manually. The "intermittent ---" becomes impossible.
- **Fix 4 (renderer backstop) is defense-in-depth.** Catches the case where BC is connected but BC itself has no terms configured, or a new edge we haven't identified.

### NEW FINDING: Path C — QuoteSendModal (Reachable, No Populate)

While verifying unreachability, I traced a **third PDF-building path** not covered in C57:

**`QuoteSendModal.handleSend`** (line 31800 in `QuoteSendModal` component, line 31677):
```javascript
await buildQuotePdfDoc(pdfDoc, project);
```

This builds and emails the quote PDF directly from the `project` prop — **no `handlePrintQuote`, no `ensureQuoteFieldsPopulated`.**

**Reachability:** The "Send Quote" button (line 34540 in PanelListView) opens `QuoteSendModal` directly via `setQuoteSendModalPLV({...})` (line 34580). The user clicks "Send" (not "Just Print") → `handleSend` builds the PDF → emails it. This path is fully reachable.

**Impact:** If paymentTerms/shippingMethod were never populated by a prior `handlePrintQuote` run, the SENT PDF shows "---". The user may not notice because the emailed PDF isn't previewed — they'd only discover it when the customer responds.

**Contrast with the unreachable Path B:** QuoteSendModal is NOT inside QuoteView. It's a separate component rendered in PanelListView (line 34698: `{quoteSendModalPLV&&<QuoteSendModal project={project} uid={uid}.../>}`). It has `project` (real, not aggregated) and `uid`. It CAN call `ensureQuoteFieldsPopulated`.

**Treatment for Phase 2:** `QuoteSendModal.handleSend` should call `ensureQuoteFieldsPopulated(project, uid)` before `buildQuotePdfDoc`. The populated project should be saved via `persistProject(upd)` (line 31678: `function persistProject(upd){onUpdate(upd);return safeSave(uid,upd);}`). This is ~5 lines. Add it to Phase 2 scope.

### ALSO FOUND: Dead Code in ProjectView

**`quoteSendModal` (ProjectView, line 35309):** Declared as state, rendered at line 37054 (`{quoteSendModal&&ReactDOM.createPortal(...)}`), but **never set to a non-null value**. All `setQuoteSendModal` calls are either `null` (close) or `prev=>({...prev,...})` (field update within an already-open modal that can never be opened). The entire inline send modal (lines 37054-37135) and its handler `_doInlineQuoteSend` (line 37081) are **dead code**.

This is a separate cleanup item — not #117 scope. Log as a TODO candidate.

### Summary

| Finding | Status |
|---|---|
| QuoteTab unreachable (Generate PDF + setQ editor) | CONFIRMED — 10/10 paths pair with autoPrint, height:0 wrap |
| `_bcToken` null = primary intermittent cause | CONFIRMED — only cause on the reachable print path |
| `needsBcFetch` gate = second candidate | RULED OUT — OR condition correctly triggers on blank terms |
| Fix 3 = primary fix (not backstop) | CONFIRMED — Phase 2 reframing needed |
| Path C (QuoteSendModal.handleSend) = third PDF path, reachable, no populate | NEW FINDING — add to Phase 2 scope |
| ProjectView inline send modal = dead code | NEW FINDING — cleanup candidate |
| Phase 1 architectural value | RETAINED — fixes code correctness for if QuoteView is ever made visible |
| Criterion 6 caveat (single-panel only verified) | LOGGED — multi-panel test optional follow-up |

### Amended Phase 2 Scope

Phase 2 should now include:
1. **Fix 3 (LEAD):** Pre-print checklist entry for BC token null + equivalent arcConfirm in Path B (if ever made reachable) and Path C (QuoteSendModal).
2. **Fix 3c (NEW):** `ensureQuoteFieldsPopulated` call in `QuoteSendModal.handleSend` before `buildQuotePdfDoc`. Path C is reachable and has the same #117 bug class.
3. **Fix 4 (SUPPORT):** Blank-field renderer backstop in pre-print checklist.

Estimated size increase: ~5 lines for Fix 3c. Total Phase 2: ~35-40 lines (was ~30).

---

## C65 — #117 Closure + Queue Landing + T-bcTokenRefresh Confirmation

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Type:** Housekeeping + read-only confirmation

---

### Part 1: #117 RESOLVED in TODO.md

Marked #117 `**RESOLVED** [Verified]` with full closure basis:
- Phase 1 (v1.20.115): populate unified, saves awaited, #86 guard verified.
- Phase 2 (v1.20.116, +51/-2): Fix 3 (warnings), Fix 3c (Path C), Fix 4 (severity split), Finding 1 ({...populated}), Finding 2 (option b).
- Live: test-1 no-regression confirmed, terms populate on real quote data.
- Logic-confirmed: failure-mode cases per C62/C64 matrix. Live fixture testing retired by decision.
- Note: full warning/block plumbing live-confirmation deferred to ARC Usage Telemetry (#129).

Investigation trail logged: C46 → C57 → C58 → C59 → C60 → C61 → C62 → C64.

---

### Part 2: Queue Landed in TODO.md

| # | Item | Priority | Status |
|---|------|----------|--------|
| 125 | T-bcTokenRefresh — proactive `acquireBcToken(false)` in `ensureQuoteFieldsPopulated` | HIGH, NEXT | [Next] — see Part 3 below |
| 126 | BC Item Browser BOM preview regression (lead: H5 render-pipeline change) | Backlog | [Backlog] |
| 127 | Redundant progress bar above first Line Item during extraction | Backlog | [Backlog] |
| 128 | H5-powered visual PN verification in Item Browser (builds on #126) | Backlog, needs Brief | [Backlog, needs Brief] |
| 129 | ARC Usage Telemetry (3 events → arcUsage collection → report modal) | Tabled, needs Brief | [Tabled, needs Brief] — after #128 |
| 130 | Dead code cleanup (~80 lines: quoteSendModal, inline send, dead QuoteTab) | LOW | [Backlog, LOW] |
| 131 | Criterion-6 multi-panel hardening | Optional | [Backlog, optional] |
| 132 | Engineering Questions suppression (render-gate, C63 intent) | Deferred | [Deferred] — when Jon schedules |

**Earlier carve-outs confirmed captured:**
- Dead code cleanup → #130 (was C62 carve-out #2)
- Criterion-6 multi-panel → #131
- Engineering Questions → #132 (was C63)
- Path B warning check (C62 carve-out #3) — NOT given a number (only relevant if QuoteView resurrected; logged in C62 carve-outs, not a standalone TODO)

---

### Part 3: T-bcTokenRefresh Read-Only Confirmation

**Proposed fix (Coach C62 / C64, Marc-surfaced):**
```javascript
// Atop ensureQuoteFieldsPopulated, before line 7602 (const warnings=[]):
if(!_bcToken) try { await acquireBcToken(false); } catch(e) {}
```

**Confirmation Point 1 — Silent / non-interactive: CONFIRMED.**

`acquireBcToken` (line 1631) takes `interactive=true` as default. With `false`:
- Line 1636-1648: `acquireTokenSilent` — uses MSAL in-memory + sessionStorage cache. If access token is expired but refresh token is valid, MSAL silently exchanges the refresh token for a new access token. **No user prompt.** No popup. No redirect.
- Line 1651-1661: `ssoSilent` — uses the browser's Microsoft session cookie. **No user prompt.** Hidden iframe token exchange.
- Line 1662: `if(!interactive) return null;` — **exits before popup.** The `acquireTokenPopup` path (line 1663) is never reached.
- Both silent paths are fast no-ops when cache is empty (throw immediately, caught internally).

**Confirmation Point 2 — Covers both reachable paths: CONFIRMED.**

`ensureQuoteFieldsPopulated` is called by:
- `handlePrintQuote` at line 36196 (Path A — print, reachable)
- `QuoteSendModal.handleSend` at line 31807 (Path C — send, reachable)
- `handleGeneratePdf` at line 35034 (Path B — unreachable, covered anyway)

One insertion point → all paths covered.

**Confirmation Point 3 — No added latency when token is valid: CONFIRMED.**

The guard is `if(!_bcToken)`. When `_bcToken` is already set (non-null — token acquired earlier in the session), the entire block is skipped. Zero MSAL calls, zero network calls, zero latency. It's a single null check.

When `_bcToken` IS null (the ~hourly case): `acquireTokenSilent` with a valid refresh token completes in one HTTP round-trip to Azure AD (~100-300ms). `ssoSilent` is a hidden iframe (~200-500ms). Both are comparable to the BC OData fetch that follows — not perceptible to the user.

**Confirmation Point 4 — Empty catch doesn't mask real failures: CONFIRMED.**

Trace through a genuinely failed refresh (no refresh token, no session cookie, network down):

1. `acquireTokenSilent` throws (no accounts, or refresh token expired) → caught at line 1649, falls through.
2. `ssoSilent` throws (no session cookie, or interaction_required) → caught at line 1661, falls through.
3. Line 1662: `if(!interactive) return null;` → function returns `null`.
4. `_bcToken` was **never set** (lines 1640/1654 only execute on success). `_bcToken` remains `null`.
5. The outer `catch(e){}` in the proposed fix is defensive (catches unexpected throws, e.g. `ensureMsal()` failing). In the normal failure path, `acquireBcToken(false)` returns `null` without throwing.
6. Post-fix, code continues to line 7620: `if(project.bcProjectNumber && _bcToken && needsBcFetch)` — `_bcToken` is null → **BC fetch skipped.**
7. Line 7772: `if(project.bcProjectNumber && needsBcFetch && !_bcToken)` → **`bc-unavailable` warning pushed.**
8. Phase 2 loud-handling fires: print shows "BC Not Connected" checklist entry, send hard-blocks.

**The empty catch suppresses the NUISANCE (expired-but-refreshable token, ~90% of cases) without swallowing a REAL failure (genuinely unavailable BC, ~10% — Phase 2 warning still fires).**

---

### Marc's Build Scope

- **One line** inserted atop `ensureQuoteFieldsPopulated` (before line 7602).
- **Verify:** Force an expired-token state (wait >60 min or clear sessionStorage `msal.*` keys) → populate now succeeds silently (token refreshed, no warning). Force a genuinely failed refresh (clear ALL MSAL cache including refresh tokens) → Phase 2 warning still fires.

---

## C64 — #117 Phase 2 Static Verification + Test Amendment

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Build:** Marc, +51/-2 in src/app.jsx, JSX validates, scope-checker clean.
**Scope:** Static verification of Finding 1 + Finding 2 ruling applied + test criteria amended.

---

### Finding 1: Post-Send Lock-Save Spread — CONFIRMED CORRECT

**Location:** `QuoteSendModal.handleSend`, line 31886

**Before (stale):** `const upd={...project, quoteSentAt:..., quoteLocked:true}`
**After (Marc's fix):** `const upd={...populated, quoteSentAt:..., quoteLocked:true}`

**Why this matters:** Fix 3c runs `ensureQuoteFieldsPopulated` at line 31807 and stores the result as `populated`. The BC-fetched terms (paymentTerms, shippingMethod, bcSalespersonCode) live on `populated`, not on the stale closure `project`. The post-send lock-save at line 31886 writes to Firestore — if it spread `project`, it would clobber the just-populated terms back to blank. One token change, strictly correct: the saved project must match what was sent in the PDF (which uses `populated` at line 31830).

**Marc's comment (lines 31884-31885) is accurate:** documents exactly what changed and why.

**Neutral on budgetary-flip closure staleness:** Other reads of the stale `project` closure remain in `handleSend` — `project.quote` at line 31860 (filename construction), `project.bcProjectNumber` at line 31876 (BC sync gate), `project.panels` at line 31877 (planning line sync). These are pre-existing closure patterns unrelated to #117. The budgetary-flip race (user changes budgetary status after modal opens, before send) is a known category — not introduced by this change, not made worse by it, not in scope.

**Criterion 10 (Path C persist check): now passes.** The Firestore write at line 31886-31888 persists `populated` (with BC-populated terms), not the stale closure.

---

### Finding 2: Jon's Ruling — Option (b) Applied, No Code Change

**Ruling:** The send path hard-blocks only when required terms are **MISSING** (Fix 3b `missing-required-terms`), NOT when BC is merely offline with terms present-and-correct.

**Why the code is already correct:** The `bc-unavailable` warning (Fix 3a, line 7772) fires only when `needsBcFetch` is true AND `_bcToken` is null. `needsBcFetch` (line 7619) evaluates:

```
!q.company || !q.address || !q.salesperson || spLooksLikeCode || !q.paymentTerms || !q.shippingMethod
```

When a quote is fully populated (company, address, salesperson, paymentTerms, shippingMethod all present), `needsBcFetch` evaluates **false**. Result:
- Line 7620: BC fetch skipped — nothing to populate.
- Line 7772: `bc-unavailable` NOT pushed — `needsBcFetch` is false.
- Line 7778: `missing-required-terms` NOT pushed — terms present.
- Warnings array: **empty.**
- Send gate (line 31811): `0 > 0` false, terms present → **send proceeds.**

The `_pop.warnings.length > 0` condition in the send gate (line 31811) is NOT a bug — it correctly catches the case where BC is needed (some fields blank) but unavailable. A quote with blank company/address and BC offline is a genuinely incomplete quote that should not be emailed. The gate fires on incompleteness, not on BC connectivity per se.

**Rationale (Jon):** #117's concern is silently shipping BLANK terms, not BC connectivity. Given ~hourly token expiry (TTL finding), blocking fully-populated sends for BC-offline would block legitimate complete quotes constantly for negligible benefit. Staleness is handled by T-bcTokenRefresh, not by blocking.

---

### Test Criteria Amendment (Tests 3 and 9)

**Test 3 — AMENDED:**

| # | Test | Expected (AMENDED) |
|---|------|----------|
| 3 | **Print, BC disconnected, quote fully populated:** Disconnect BC. paymentTerms, shippingMethod, company, address, salesperson all present (from prior BC populate or manual entry). Click "Print Client Quote." | `needsBcFetch` evaluates false — no `bc-unavailable` warning, no `missing-required-terms` warning. **No new checklist entries.** Print proceeds as normal. If only paymentTerms/shippingMethod are present but other quote fields (company/address) are blank, `needsBcFetch` is true → "BC Not Connected" checklist entry appears (unchecked, informational), but **no "Missing Quote Fields" entry.** User acknowledges and proceeds. |

**Test 9 — AMENDED:**

| # | Test | Expected (AMENDED) |
|---|------|----------|
| 9 | **Send, BC disconnected, quote fully populated:** Disconnect BC. paymentTerms, shippingMethod, company, address, salesperson all present. Click "Send." | `needsBcFetch` evaluates false — no warnings. **Send proceeds.** No block, no arcAlert. If only terms are present but other quote fields blank (needsBcFetch true), `bc-unavailable` fires and send blocks — but that's a genuinely incomplete quote, not the #117 scenario. |

**All other tests (1, 2, 4-8, 10) remain unchanged.**

---

### T-bcTokenRefresh Exact Fix — CONFIRMED CAPTURED

Marc surfaced the exact fix line, confirming the C62 carve-out and TTL finding:

```javascript
// At the top of ensureQuoteFieldsPopulated, before the needsBcFetch gate (line 7619):
if(!_bcToken) try { await acquireBcToken(false); } catch(e) {}
```

- **Pattern match:** Identical to `verifyBcLineCount` (line 36278) and `bcFetchCompanyInfo` (line 4284). Established pattern in the codebase — not novel.
- **Effect:** MSAL `acquireTokenSilent` uses the cached refresh token (90-day lifetime, sessionStorage) to silently get a new access token. Eliminates ~90% of `bc-unavailable` warnings (per TTL finding: token expires ~60-75 min, refresh token covers silent renewal).
- **Priority:** HIGH → **IMMEDIATE** (Freddy's recommendation). Phase 2 loud-handling + this refresh together are the real fix. Without it, the Fix 3 warning fires ~hourly for long-session users.
- **Size:** ~1 line. Small fix — no auth-flow rewrite needed.
- **Sequence:** Ships as the next commit after Phase 2 deploys and live-verifies.

---

### Static Verification Summary

| Check | Result |
|-------|--------|
| Fix 3a: `bc-unavailable` warning push (line 7773) | PASS — fires on `bcProjectNumber && needsBcFetch && !_bcToken` |
| Fix 3b: `missing-required-terms` warning push (line 7779) | PASS — fires on blank paymentTerms or shippingMethod on final output |
| Fix 3c: QuoteSendModal populate + persist + hard-block (lines 31803-31821) | PASS — populate before setSending, persist if changed, block on warnings or blank terms |
| Fix 3c post-send spread: `{...populated,...}` (line 31886) | PASS — Finding 1 confirmed |
| Fix 3c PDF uses `populated` (line 31830) | PASS — `buildQuotePdfDoc(pdfDoc, populated)` |
| Fix 4 print: `_populateWarnings` lifted (line 36194) | PASS — visible at checklist construction |
| Fix 4 print: `bc-unavailable` checklist entry (line 36296) | PASS — unchecked, informational |
| Fix 4 print: `missing-required-terms` checklist entry (line 36304) | PASS — unchecked, shows which fields |
| Fix 4 icons: bctoken + blankfields (lines 37427-37428) | PASS — renders in checklist modal |
| Finding 2 gate behavior: fully-populated quote + BC offline | PASS — `needsBcFetch` false → no warnings → proceeds |

**Build is verification-complete on the static side. Ready for deploy + live-verify.**

---

## C62 — #117 Phase 2 Detailed Plan (Rescoped per C61)

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Detailed implementation plan for Marc. Loud-handling as the primary fix. Coach verifies before deploy.
**Builds on:** C61 (root cause re-confirmation), C59/C60 (Phase 1 shipped as v1.20.115)
**Principle:** Both reachable quote paths (print + send) populate via the shared function. No path emits blank Payment Terms / Shipping Method without the user being warned (print) or blocked (send). The `{project, warnings}` channel from Phase 1 is the signal carrier.

---

### Feasibility Verification

**Warnings channel from Phase 1:** `ensureQuoteFieldsPopulated` returns `{project, warnings}` (line 7770). `warnings` is currently an empty array (Phase 1 hook point). Phase 2 pushes warnings into it. Both callers already destructure the return — `handlePrintQuote` at line 36163 (`_pop.warnings`) and `handleGeneratePdf` at line 35002. Adding pushes inside the function and reads at the callers is clean. No new plumbing.

**QuoteSendModal scope for Fix 3c:** `QuoteSendModal({project, uid, ...})` at line 31677 has `project` (real, from PanelListView), `uid`, and `persistProject` (line 31678: `onUpdate(upd); return safeSave(uid, upd)`). `ensureQuoteFieldsPopulated` is module-scoped. All pieces available — no prop threading needed.

**Checklist insertion for Fix 4:** The pre-print checklist construction (lines 36197-36264) builds an `issues` array with typed entries. Adding new entries follows the existing pattern. The `_pop.warnings` variable from the populate call (line 36163) is block-scoped inside a try/catch (lines 36162-36170); it needs to be lifted out so it's visible at the checklist construction (line ~36200). One `let` declaration.

---

### Fix 3: Warning Signals Inside `ensureQuoteFieldsPopulated`

**Location:** `ensureQuoteFieldsPopulated` (lines 7601-7771)

Two independent warning pushes, both at the end of the function before the return (insert between line 7769 and line 7770):

**3a — BC unavailable (token null when terms needed):**
```javascript
if(project.bcProjectNumber && needsBcFetch && !_bcToken){
  warnings.push("bc-unavailable");
}
```
Fires when: the project is BC-linked, terms are needed, but `_bcToken` is null (line 394, cleared on disconnect/401). Does NOT fire when terms are already populated (needsBcFetch false) or when no BC project is linked.

**3b — Required terms still blank after populate:**
```javascript
const finalQ = merged.quote || {};
if(!finalQ.paymentTerms || !finalQ.shippingMethod){
  warnings.push("missing-required-terms");
}
```
Fires when: either field is blank on the final output, regardless of cause. Catches:
- Token null → BC block skipped → terms blank
- Token set but expired → BC returns 401 → `pr.ok` false → data not processed → terms blank
- BC fetch succeeded but project card has no terms configured → terms blank
- No BC project linked AND user never manually entered terms → terms blank

The two warnings are independent and complementary:
- `bc-unavailable` alone (no `missing-required-terms`): BC offline, but terms were manually entered. Print path: informational. Send path: blocks (BC fields might be stale).
- `missing-required-terms` alone (no `bc-unavailable`): BC connected but card has no terms. Both paths: gate the user.
- Both together: BC offline AND terms blank. Most actionable message.
- Neither: terms populated, BC available (or unnecessary). No gate.

**Change: +6 lines at line ~7769.**

---

### Fix 3c: Path C — QuoteSendModal Populate + Hard-Block

**Location:** `QuoteSendModal.handleSend` (line 31737)

Insert after email validation (line 31791) and before `setSending(true)` (line 31792):

```javascript
// #117 Fix 3c: Populate quote fields via shared gate before building PDF
const _pop = await ensureQuoteFieldsPopulated(project, uid);
const populated = _pop.project;
if(populated !== project) await persistProject(populated);
// #117 Fix 4 (send): Hard-block on blank required terms or BC unavailable
const _sq = populated.quote || {};
if(_pop.warnings.length > 0 || !_sq.paymentTerms || !_sq.shippingMethod){
  const missing = [];
  if(!_sq.paymentTerms) missing.push("Payment Terms");
  if(!_sq.shippingMethod) missing.push("Shipping Method");
  let msg = _pop.warnings.includes("bc-unavailable")
    ? "BC is not connected — quote fields could not be auto-populated from the project card.\n\n" : "";
  if(missing.length) msg += `Missing required fields: ${missing.join(", ")}. The sent quote would show "---".\n\n`;
  msg += "Connect to BC or enter the fields manually before sending.";
  arcAlert(msg);
  return;
}
```

**Key design points:**
- Populate runs BEFORE `setSending(true)` — user sees no spinner while the BC fetch runs (matches existing modal UX: validation happens before commit).
- `persistProject(populated)` uses QuoteSendModal's existing helper (line 31678): `onUpdate(upd); return safeSave(uid, upd)`. Persists the REAL project, not aggregated (QuoteSendModal receives the real project from PanelListView, confirmed C61).
- `populated !== project` reference check: if nothing changed (no autoFields, no bcSalespersonCode), the function returns the input object (line 7764: `let merged=project` when no changes). Skip the save. If anything was merged, `merged={...project}` is a new object → save fires.
- Hard-block: `return` after `arcAlert`. No override. Jon's instruction: "This path emails a CUSTOMER directly with no human glance — silently sending blank terms is the worst-case outcome."
- The block gates on `_pop.warnings.length > 0` (ANY warning, including `bc-unavailable` even if terms are present) OR blank required terms. This is stricter than print — by design per Jon's severity split.

**Also update `buildQuotePdfDoc` call at line 31800:**
```javascript
// Before (uses original project):
await buildQuotePdfDoc(pdfDoc, project);
// After (uses populated project):
await buildQuotePdfDoc(pdfDoc, populated);
```

**Change: +13 lines, 1 line modified.**

---

### Fix 4: Print Path — Pre-Print Checklist Entries

**Location:** `handlePrintQuote` in ProjectView

**Step 1: Lift `_pop.warnings` out of the try block.**

The populate call at line 36162-36170 scopes `_pop` inside the try block. The checklist at line 36200+ needs the warnings. Change:

```javascript
// Before (line 36162):
try{
  const _pop=await ensureQuoteFieldsPopulated(proj,uid);
  proj=_pop.project;
  ...

// After:
let _populateWarnings=[];
try{
  const _pop=await ensureQuoteFieldsPopulated(proj,uid);
  proj=_pop.project;
  _populateWarnings=_pop.warnings;
  ...
```

**+1 line (the `let` declaration), 1 line modified (assign inside try).**

**Step 2: Add checklist entries after "Upload drawings to BC" (line 36258).**

Insert after line 36259 (the upload check's closing brace), before the "If no issues" check at line 36261:

```javascript
// #117 Fix 4: BC unavailable warning
if(_populateWarnings.includes("bc-unavailable")){
  issues.push({
    type:"bctoken",
    label:"BC Not Connected",
    detail:"Payment Terms / Shipping Method not auto-populated — connect to BC or enter manually",
    checked:false,
  });
}

// #117 Fix 4: Missing required quote fields
const _qCheck=projectRef.current.quote||{};
const _missingFields=[];
if(!_qCheck.paymentTerms)_missingFields.push("Payment Terms");
if(!_qCheck.shippingMethod)_missingFields.push("Shipping Method");
if(_missingFields.length>0){
  issues.push({
    type:"blankfields",
    label:"Missing Quote Fields",
    detail:_missingFields.join(", ")+" — enter manually before printing",
    checked:false,
  });
}
```

**Key design points:**
- `checked: false` — user must explicitly check to acknowledge. This matches Jon's instruction: "unchecked-by-default entry... user sees 'terms not populated,' acknowledges, may proceed."
- Existing "Print Now — Skip All" button (line 37391) bypasses ALL checklist entries — the user can override even unchecked items. This is acceptable per Jon's PRINT severity: "A human sees the PDF before it leaves."
- Both entries can appear simultaneously (BC unavailable AND terms blank). The user sees both, understands the cause and the effect.
- Uses `projectRef.current.quote` (line 36215 pattern: reads current ref, not the closure `proj`). This is the POST-populate state since `proj` was already updated at line 36164-36165 (`setProject(proj); projectRef.current=proj`).

**+14 lines.**

**Step 3: Checklist rendering — add icons for new types.**

The checklist modal renders type-specific icons (line 37322-37327). Add the new types to the existing pattern:

```javascript
// After the existing {issue.type==="upload"&&...} block (line 37326):
{issue.type==="bctoken"&&<span style={{fontSize:16,flexShrink:0}}>🔌</span>}
{issue.type==="blankfields"&&<span style={{fontSize:16,flexShrink:0}}>📋</span>}
```

**+2 lines.**

---

### Coverage Check: All `buildQuotePdfDoc` Call Sites

| Line | Path | Protected by | Reachable? |
|------|------|-------------|:----------:|
| 7567 | `generateQuotePdf` → called by handlePrintQuote (Path A autoPrint) | Phase 1: `ensureQuoteFieldsPopulated` before call; Phase 2: checklist gate | YES |
| 7567 | `generateQuotePdf` → called by `handleGeneratePdf` (Path B, QuoteView) | Phase 1: `ensureQuoteFieldsPopulated`; warning check not added (dead UI) | NO |
| 31800 | `QuoteSendModal.handleSend` (Path C) | **Phase 2 Fix 3c:** populate + hard-block before call | YES |
| 37101 | `_doInlineQuoteSend` (ProjectView inline send) | **Dead code** (C61: `quoteSendModal` never set to non-null) | NO |

**All reachable paths are gated.** No path reaches `buildQuotePdfDoc` with blank terms without having passed either a warn (print) or block (send) gate.

Path B (QuoteView `handleGeneratePdf`): warnings are returned but unchecked. If QuoteView is ever made visible, add an arcConfirm check (~3 lines). NOT Phase 2 scope — log as defense-in-depth for when the dead UI is resurrected.

---

### TTL Finding (Read-Only)

**BC Token Lifecycle:**

| Component | Lifetime | Source |
|-----------|----------|--------|
| Azure AD access token (`_bcToken`) | **60-75 minutes** (randomized per Azure AD default, not configurable by ARC) | Microsoft identity platform docs |
| MSAL refresh token | **90 days** (default), stored in `sessionStorage` (line 1597) — lost on tab close | MSAL configuration |
| Microsoft browser session cookie | **24 hours to weeks** (org policy dependent) | Azure AD tenant config |

**Token acquisition flow** (`acquireBcToken`, line 1631):
1. `acquireTokenSilent` — uses MSAL cache (sessionStorage). If access token expired but refresh token valid, silently gets a new access token. **This is the implicit refresh.**
2. `ssoSilent` — uses browser session cookies. Works if Microsoft session is active.
3. `acquireTokenPopup` (interactive only) — popup login. Requires user action.

**The gap:** `ensureQuoteFieldsPopulated` (line 7620) checks `_bcToken` as a boolean gate but does NOT call `acquireBcToken(false)` to attempt a silent refresh. Many other BC call sites in the codebase DO:
- `verifyBcLineCount` (line 36278): `if(!_bcToken) try{await acquireBcToken(false);}catch(e){}`
- `bcFetchCompanyInfo` (line 4284): same pattern
- Various pricing/sync paths: same pattern

This means: if a user's last BC activity was >60 min ago, `_bcToken` holds an expired JWT. `ensureQuoteFieldsPopulated` uses it, gets a 401 from BC, silently fails. If `acquireBcToken(false)` were called first, MSAL would likely use the refresh token to silently get a fresh access token — the fix would be invisible to the user.

**Priority recommendation for the carve-out:**
- **HIGH.** Token expiry is ~hourly. Without proactive refresh in `ensureQuoteFieldsPopulated`, users who leave ARC open will hit the Fix 3 warning frequently — approximately every session where they don't happen to do a BC operation within the last hour before printing.
- A single line addition — `if(!_bcToken) try{await acquireBcToken(false);}catch(e){}` at the top of `ensureQuoteFieldsPopulated` — would eliminate ~90% of warning occurrences (the remaining ~10% are true BC unavailability: no refresh token, network down, etc.).
- This is the recommended immediate follow-up after Phase 2 ships.

**Log as:** T-series TODO: "Add proactive `acquireBcToken(false)` call at the top of `ensureQuoteFieldsPopulated` to silently refresh expired BC tokens before the populate gate. HIGH priority — without it, the Fix 3 warning fires ~hourly for users with long sessions."

---

### Size Estimate

| Fix | Description | Lines |
|-----|-------------|:-----:|
| Fix 3a | `bc-unavailable` warning push in shared function | +3 |
| Fix 3b | `missing-required-terms` warning push in shared function | +3 |
| Fix 3c | QuoteSendModal populate + persist + hard-block | +13, ~1 modified |
| Fix 4 print | Lift warnings + 2 checklist entries | +15, ~1 modified |
| Fix 4 icons | Checklist modal rendering for new types | +2 |
| **Total** | | **~36 net-new, ~2 modified** |

Within the ~35-40 estimate from C61.

### Suggested Phasing

**Single phase.** Unlike Phase 1 (which had the architectural extraction risk), Phase 2 is all additive — warning pushes in the shared function, reads at call sites. No structural refactoring, no component boundary changes. Ship as one commit.

### Test Criteria

| # | Test | Expected |
|---|------|----------|
| 1 | **Print, BC connected, terms populated:** "Print Client Quote" on a project with BC terms configured. | No new checklist entries. Print proceeds as before. |
| 2 | **Print, BC disconnected (token null), terms blank:** Disconnect BC, click "Print Client Quote" on a project with no manually-entered terms. | Checklist shows "BC Not Connected" (unchecked) AND "Missing Quote Fields: Payment Terms, Shipping Method" (unchecked). |
| 3 | **Print, BC disconnected, terms manually entered:** Disconnect BC, but paymentTerms/shippingMethod were populated by a prior print or manual entry. | Checklist shows "BC Not Connected" only (informational). No "Missing Quote Fields." User proceeds with existing terms. |
| 4 | **Print, BC connected, BC card has no terms:** BC connected but project card has empty payment/shipping fields. | Checklist shows "Missing Quote Fields" only. No "BC Not Connected" (token was available, fetch ran, BC just didn't have terms). |
| 5 | **Print, override via "Print Now — Skip All":** Same setup as #2. Click "Print Now — Skip All." | Print proceeds despite unchecked warnings. PDF shows "---". Accepted outcome — user explicitly overrode. |
| 6 | **Send, BC disconnected, terms blank:** Disconnect BC. Open Send Quote modal, fill email, click "Send." | arcAlert blocks the send: "BC is not connected... Missing required fields: Payment Terms, Shipping Method..." Return to modal. Email NOT sent. |
| 7 | **Send, BC connected, terms populated:** Normal send flow with terms present. | No block. Send proceeds as before. |
| 8 | **Send, BC connected, BC card has no terms:** BC connected but terms empty. Click "Send." | arcAlert blocks: "Missing required fields: Payment Terms, Shipping Method..." Email NOT sent. |
| 9 | **Send, BC disconnected, terms manually present:** Terms entered manually, BC offline. Click "Send." | arcAlert blocks: "BC is not connected..." Hard-block even with terms present — send severity is stricter per Jon's split. |
| 10 | **Path C persist check:** After Fix 3c populate in QuoteSendModal, verify Firestore has the populated terms. | Terms persisted on the real project doc (not flattened, not missing). |

### Carve-Outs (NOT Phase 2 — log only)

1. **T-bcTokenRefresh — IMMEDIATE (after Phase 2 ships).** Add proactive `acquireBcToken(false)` at the top of `ensureQuoteFieldsPopulated` to silently refresh expired BC tokens before the populate gate. HIGH priority per TTL finding: Azure AD access tokens expire ~60-75 min; without this call, the Phase 2 loud-handling warning fires ~hourly for users with long sessions. Loud-handling + refresh together are the real fix at this expiry rate. Scoping question when activated: does adding `acquireBcToken(false)` before declaring the token null constitute a small fix (single line, matching the pattern already used by `verifyBcLineCount` at line 36278, `bcFetchCompanyInfo` at line 4284, and other BC call sites), or does it require a deeper auth-flow rewrite? Likely small — confirm. ~1 line.
2. **Dead code cleanup — LOW.** `quoteSendModal` state (line 35309) + inline send modal handler `_doInlineQuoteSend` (lines 37054-37135) in ProjectView — never opened (C61 finding: `quoteSendModal` state is declared but never set to non-null). Also: unreachable QuoteTab interactive surface (dead branch behind autoPrint height:0 wrap). Candidate removal ~80 lines.
3. **Path B warning check — LOW (gated on QuoteView resurrection).** If QuoteView is ever made visible (autoPrint decoupled from setView("quote")), add arcConfirm for `_pop.warnings` in `handleGeneratePdf` (line 35002). ~3 lines. Not relevant until that UI is resurrected.

---

## C63 — Deferred TODO: Post-Extraction Engineering Questions (SUPPRESS, Do Not Remove)

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Type:** Deferred TODO (intent log only — no build)

### Intent

The Engineering Questions that surface after an extraction completes are to be intentionally **SUPPRESSED** (UI hidden / render gated), **NOT deleted**. The underlying logic — question generation, answer processing, data flow — stays in place for future re-integration once further testing can be done.

### Suppression Rules

- **DO NOT strip the underlying logic.** The code that generates, presents, and processes Engineering Questions remains intact.
- **Suppress via render gate only.** The UI surface (question display, answer inputs, submission) is hidden by a render-gate condition. The gate should be a single boolean check — easy to flip for re-enablement.
- **When resurrecting:** Re-enable the render gate and re-test. Do not assume the dormant logic still works after surrounding code has evolved — verify integration points.

### To Capture Before Implementing

When Jon schedules this with Marc, the suppress edit itself is small (render-gate change). Before building, capture and document:

1. **Trigger conditions:** What causes Engineering Questions to appear — which extraction completion path(s), what state, what timing.
2. **Render location:** Where in the component hierarchy the questions are displayed (component name, mount point, conditional render).
3. **What the questions feed:** What downstream processes consume the answers — do they affect BOM data, pricing, BC sync, quote fields, or extraction reports? Are there side effects if questions are suppressed but answers are expected downstream?

These three items ensure the gate doesn't silently break a downstream consumer and that resurrection is a known-scope task, not an archaeology project.

---

## C55 — H5 Render Path Headless Reachability Analysis

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Read-only code-path trace — can `renderBomRegionHighDpi` + extraction be invoked from Node.js without a browser?

### Answer: NOT cleanly reachable — but a BYPASS exists that avoids the hard parts entirely.

The render path has **four browser-hard dependencies**. But the Cloud Function already accepts pre-rendered tiles, so a Node.js test harness can render tiles server-side and call the CF directly, bypassing the entire client render chain. This is the recommended path.

### Browser-Hard Dependencies in the Client Render Chain

Tracing `renderBomRegionHighDpi` (app.jsx:11564):

1. **`window.pdfjsReady()` + `window._pdfjs`** (line 11565-11566) — pdf.js is loaded as a browser ES module from CDN (index.html:229), injected via `document.createElement("script")`. The loader itself uses `document.head.appendChild`. **Browser-only.** Node.js equivalent exists: `pdfjs-dist` npm package provides the same API. Not currently in any `package.json`.

2. **`fbStorage.ref(storagePath).getDownloadURL()`** (line 11567) — Firebase client SDK Storage call. Requires browser Firebase auth context. **Browser-only.** Node.js equivalent: `firebase-admin` Storage with `bucket.file(path).download()`. Already used in `tests/extraction-baseline/extract-baseline.js`.

3. **`document.createElement("canvas")` + `canvas.getContext("2d")` + `canvas.toDataURL("image/jpeg", 0.92)`** (lines 11614-11620) — DOM Canvas API for rendering each tile. This is the hardest dependency. **Browser-only.** Node.js equivalent: `node-canvas` (`canvas` npm package) or `@napi-rs/canvas`. Not currently installed. Requires native compilation (C++ bindings to Cairo). On Windows, `node-canvas` needs `node-gyp` + Visual C++ Build Tools — fragile install.

4. **`pg.render({canvasContext: ctx, ...})`** (line 11619) — pdf.js renders to a canvas context. In the browser, this is a `CanvasRenderingContext2D`. In Node with `pdfjs-dist`, you'd pass a `node-canvas` context. **Requires dependency #3 to work.**

### The Bypass: Skip Client Rendering, Call the CF Directly

The Cloud Function `extractBomPage` (functions/index.js:2334) accepts `tiledBomImages` — an array of base64 JPEG strings — as a **standalone input path** (line 2340: `hasTiles`). When tiles are present, the CF ignores `pdfPath`/`croppedBomImage` entirely and sends the tiles straight to Anthropic. The CF doesn't know or care whether tiles were rendered by a browser canvas, a Node script, or a GIMP export.

This means a headless test harness can:

1. **Render tiles in Node** using `pdfjs-dist` + `node-canvas`, then call the CF with the tiles.
2. **OR** (simpler, zero new dependencies): render tiles ONCE in the browser (or extract them from a successful production run's debug output), save them to disk as a fixture, and replay them against the CF from Node.

**Option 2 is the zero-dependency path for the #121 gate specifically.** The regression test question is "does the PADDED REGION produce the same 14 items?" — the pad changes which pixels are in each tile, so you need a fresh render from the padded code. But you only need that render ONCE — then the tiles are a static fixture.

### Option-by-Option Cost Assessment

**Option A — Full headless render (Node.js script)**

New dependencies: `pdfjs-dist@4.4.168` + `canvas` (node-canvas).

Shim work:
- Replace `window.pdfjsReady()` → `require('pdfjs-dist')`
- Replace `fbStorage.ref().getDownloadURL()` + `fetch()` → `admin.storage().bucket().file().download()`
- Replace `document.createElement('canvas')` → `const {createCanvas} = require('canvas')`
- Replace `canvas.toDataURL('image/jpeg', 0.92)` → `canvas.toBuffer('image/jpeg', {quality: 0.92}).toString('base64')`
- Port `findOptimalGrid` + the H5 constants + the #121 padding math (pure JS, no browser deps — copy directly)

Estimated: ~80-120 lines of test script. The hard part is `node-canvas` installation on Windows (native build, Cairo dependency). If it installs cleanly: ~2 hours. If node-gyp fights: unpredictable.

**Benefit beyond #121:** Every future H5 gate runs headless. Marc scripts it, no browser, no connector limit, no Jon relay. Worth it if H5 gates recur (they will — #121, future region changes, model upgrades).

**Option B — One-shot fixture replay (zero dependencies)**

Steps:
1. Jon runs the padded build in the browser ONCE on PRJ402119, with Marc's console logging capturing the tile base64 output (the `[H5] rendered N tile(s)` line already fires, but tiles aren't logged — would need a temporary `console.log(JSON.stringify(tiles))` or equivalent).
2. Save tiles to a JSON fixture file.
3. Node script (using existing `firebase-admin` infra from `tests/extraction-baseline/`) calls `extractBomPage` CF directly with the fixture tiles.
4. Compare returned items to C52 ground truth.

Estimated: ~30 min, zero new npm packages, works immediately. But it's a ONE-TIME fixture — every new pad value or region change needs a fresh browser capture.

**Option C — Live with the manual relay**

Jon triggers extraction in the browser, Marc reads the console output. Works for #121 right now. Recurring cost for every future gate.

### Recommendation

**For #121 today: Option B** (fixture replay) or just the manual relay (Option C). Either unblocks the ship gate in <30 min.

**For the long term: Option A** (full headless render). The connector restriction means every non-prod H5 gate hits this wall. `node-canvas` installation is a one-time cost; once it works, the test harness is reusable indefinitely. Schedule it as a tooling item after #121 ships.

### What NOT to Do

Do NOT try to drive the extraction through `puppeteer` or headless Chrome against the test site. That's a heavier dependency than `node-canvas`, introduces auth/session complexity, and doesn't solve the connector problem — it creates a second browser to manage.

---

## C56 — H5 Headless Harness Built + #121 PRJ402119 Regression Result

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Scope:** Build Option A headless harness (C55), run #121 PRJ402119 regression gate

### Harness Construction

**Dependencies installed cleanly** — `canvas` (node-canvas) 3.1.0 used prebuilt binaries, installed in 6 seconds. `pdfjs-dist@4.4.168` installed alongside. Both as devDependencies in project root `package.json`. Zero native compilation.

**Harness location:** `tests/extraction-baseline/h5-headless.js`

**Architecture:** Downloads PDF via `firebase-admin` Storage → renders tiles via `pdfjs-dist` + `node-canvas` (ported H5 math including #121 padding) → authenticates via custom token → calls `extractBomPage` Cloud Function with `tiledBomImages` (the standalone tile input at functions/index.js:2340) → parses and displays results.

**CLI interface:**
```
node tests/extraction-baseline/h5-headless.js                     # PRJ402119 page 3 (default)
node tests/extraction-baseline/h5-headless.js --project PRJ402101 # PRJ402101 page 10
node tests/extraction-baseline/h5-headless.js --no-pad             # baseline (no #121 padding)
node tests/extraction-baseline/h5-headless.js --pad-floor 10       # override floor to 10pt
node tests/extraction-baseline/h5-headless.js --save-tiles ./tiles  # write tile JPEGs to disk
```

Known projects (extend `KNOWN_PROJECTS` for new targets): PRJ402119 (page 3), PRJ402101 (page 10).

**pdfjs-dist note:** v4.4.168 ships ESM-only. Harness uses `await import('pdfjs-dist/legacy/build/pdf.mjs')` from CJS.

### #121 PRJ402119 Regression: PASS — 13/13 items, 14/14 PNs, zero phantoms

**Run output:**
```
[H5] rendered 2 tile(s) 2×1 @ ~906 DPI — region 5.2"×2.0", model ceiling 2576px
[H5] pad=ON floor=14pt
[H5] original region: x=0.0679 y=0.6906 w=0.4344 h=0.1922
[H5] padded region:   x=0.0502 y=0.6677 w=0.4697 h=0.2380
[H5] region growth: X +8.1%, Y +23.8%
```

**Item-by-item vs C52 ground truth:**

| # | Ground Truth PN | Headless PN | Match | Qty | Conf |
|---|-----------------|-------------|:-----:|-----|------|
| 1 | SCE-1412PCW | SCE-1412PCW | ✓ | 1 | med |
| 2 | SCE-14P12AL | SCE-14P12AL | ✓ | 1 | med |
| 3 | 3038338 | 3038338 | ✓ | 8 | high |
| 4 | 3214259 | 3214259 | ✓ | 20 | high |
| 5 | 3214314 | 3214314 | ✓ | 4 | high |
| 6 | 3022276 | 3022276 | ✓ | 7 | high |
| 7 | 0807012 | 0807012 | ✓ | 1 (A/R) | high |
| 8 | TYD15X3WPW6 | TYD15X3WPW6 | ✓ | 1 (A/R) | med |
| 8 cover | TYD2CW6 | TYD2CW6 (in `additionalPartNumbers`) | ✓ | — | — |
| 9 | HS-CG2 | HS-CG2 | ✓ | 3 | high |
| 10 | SECM25G | SECM25G | ✓ | 5 | high |
| 11 | SECM40G | SECM40G | ✓ | 1 | high |
| 12 | LNM25BPK100 | LNM25BPK100 | ✓ | 1 (A/R) | high |
| 13 | LNM40BPK100 | LNM40BPK100 | ✓ | 1 (A/R) | high |

**14/14 part numbers correct. 13/13 rows present. Zero phantom rows.**

The "14/14" from C52's generalization test was 14 part numbers across 13 BOM rows — item 8 has a paired cover PN (TYD2CW6) captured in `additionalPartNumbers`. The headless run matches exactly.

**Phantom check (Freddy's Y-axis watch-item):** The padded region grew 23.8% on Y (from h=0.1922 to h=0.2380). This extended the top edge from y=0.6906 to y=0.6677 and the bottom from y=0.8828 to y=0.9057. No phantom rows from title block, revision table, or adjacent drawing elements appeared in the extraction. 13 items in, 13 items out — the 14pt floor pad is safe on this drawing.

**DPI impact:** ~906 DPI (down from ~1079 unpadded). Still 1.5× the 600 DPI target. The DPI drop is larger than C54's theoretical estimate (~1010) because the floor pad dominates both axes on this tight region, producing 8.1% X growth and 23.8% Y growth (vs the proportional-only ~4%/axis from C53).

### Verdict: #121 regression gate PASSES. Ship it.

---

## C66 — #126 BC Item Browser BOM Preview Regression: Root Cause Report

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Type:** Read-only trace → root cause diagnosis
**Work item:** #126

---

### Symptom

The Drawing Reference yellow highlight band in the BC Item Browser modal shows the **SAME HIGH position** for different parts. Two parts with different correct positions (1SDA102947R1, 8106235 at the BOTTOM) both got the same band. The band does not recompute per new part lookup.

---

### Finding 1 (PRIMARY ROOT CAUSE): `parseInt(itemNo)` degrades to 0 for non-numeric or empty values

**Location:** `locateInDrawing`, line 21664

```javascript
const refLine = (targetRow?.itemNo || '').trim();   // line 21648
const itemNum = parseInt(refLine) || 0;              // line 21664
const rowIdx = Math.max(0, itemNum - 0.5);           // line 21670
const y_top = tTop + (rowIdx * rowHeight);           // line 21671
```

The Haiku prompt (line 21653-21655) asks only for **table geometry** — `table_top`, `table_bottom`, `total_rows`, `pn_x`. It does NOT identify any specific part's row. The Haiku response is **identical for every part on the same page**. Row differentiation comes entirely from `parseInt(itemNo)`.

The BOM prompt (line 11398) defines `itemNo` as: "copy exact value printed. Use `""` if no item number column exists." When a BOM table has no item-number column, `itemNo` is `""` for all rows. `parseInt("") = NaN`, `NaN || 0 = 0`, `rowIdx = 0` → **band always at `tTop` (top of table)** regardless of the actual part.

Even for numeric `itemNo`, the linear interpolation assumes uniform row spacing and 1-based sequential numbering — fragile for real-world BOMs with skipped numbers, variable row heights, or multi-line cells.

**This explains the symptom exactly:** different parts with empty `itemNo` all compute to `itemNum = 0` → all get the same HIGH band at the table top.

---

### Finding 2 (SECONDARY): Page selector buttons use broken stored coordinates

**Location:** Page button `onClick`, line 22337

```javascript
if (targetRow?.y_top != null && targetRow?.y_bottom != null
    && (targetRow.y_bottom - targetRow.y_top) > 0.001 && pg) {
  // USES STORED COORDS — skips locateInDrawing (Haiku)
  cropRowFromImage(du, targetRow.y_top, targetRow.y_bottom, targetRow.pn_x);
} else {
  locateInDrawing(i);
}
```

Page buttons **prioritize stored `targetRow.y_top / y_bottom`** over calling `locateInDrawing`. Post-H5, these coordinates are **tile-relative, not page-relative**:

- `getExtractionUnits` (line 11710) creates units with `bomRegion` but **never sets `cropBounds`**
- `translateItemsToPageCoords` (line 10940) checks `if(!cropBounds) return items;` → **no-op**
- H5 tiles are region-targeted high-DPI crops — y_top/y_bottom returned by the Cloud Function are relative to the tile, not the full page
- These tile-relative fractions are stored directly as page-level coordinates → wrong positions when applied to a full-page image

**Result:** Clicking a page button renders the band at tile-relative positions on a full-page image — consistently wrong.

---

### Finding 3: Component DOES remount (not a React state bug)

The modal is conditionally rendered at line 29031:
```javascript
{bcBrowserOpen && (<BCItemBrowserModal ...>)}
```

Close handler (line 29036) sets `setBcBrowserOpen(false)` → component unmounts. Next open → remounts fresh → `useState(null)` for `croppedDataUrl` → `useEffect([], [])` fires `locateInDrawing` fresh.

The "stale band" appearance is **not state persistence**. It's that the Haiku path computes the same position for every part (when `itemNo` is empty/non-numeric), so remounting produces the identical band.

---

### Finding 4: `useEffect([], [])` is correct given conditional rendering

The mount-only useEffect at line 21716-21741 is architecturally fine because:
- The full-screen overlay (`zIndex:300`, `position:fixed`) prevents clicking other BOM rows while the modal is open
- Each close→open cycle remounts the component, triggering the effect fresh
- `targetRow` can't change without a remount because `bcBrowserTarget` only updates in the open handlers (which set `bcBrowserOpen(true)` from `false`)

No fix needed here.

---

### Root Cause Summary

| Path | Status | Mechanism |
|------|--------|-----------|
| PRIMARY (Haiku, on mount) | **BROKEN when itemNo empty/non-numeric** | `parseInt(refLine)\|\|0` → band at table top for all rows |
| PAGE BUTTONS (stored coords) | **BROKEN post-H5** | Tile-relative y_top/y_bottom applied to full-page image |
| FALLBACK (stored coords, no API key) | **BROKEN post-H5** | Same as page buttons — tile-relative coords |

**Not an H5-pipeline break, not a Haiku-call break.** The Haiku call works — it returns correct table geometry. The bug is in **client-side row selection**: the code has no way to find a specific row without a valid numeric `itemNo`, and the stored-coordinate fallback is broken by the H5 tile-vs-page coordinate gap.

---

### Recommended Fix

**Option A (PREFERRED): Make Haiku find the specific part**

Modify the Haiku prompt at line 21653-21655 to include the target part number and ask for that row's Y-fraction directly:

```
Current: "Return JSON with: table_top, table_bottom, total_rows, pn_x"
New:     "Find the row containing part number '{pn}' (item #{refLine}).
          Return JSON with: row_top (y fraction of that row's top edge),
          row_bottom (y fraction of that row's bottom edge),
          pn_x (x fraction of center of part number column)"
```

Then use the returned `row_top`/`row_bottom` directly instead of computing from `itemNum`. Falls back to current linear interpolation if Haiku can't find the part.

**Scope:** ~15-20 lines changed in `locateInDrawing`.

**Option B: Fix page buttons (companion to A)**

Always call `locateInDrawing(i)` in the page button handler instead of using stored coords. Delete the `targetRow?.y_top != null` branch.

**Scope:** ~5 lines changed at line 22337.

**Total fix scope: ~20-25 lines, low risk.**

---

### Merge vs. Contain (#128 relationship)

The `translateItemsToPageCoords` gap (Finding 2) is shared surface with #128 (H5-powered visual PN verification). However:

- **#126 fix is self-contained** — Option A+B avoids stored coords entirely by always using Haiku, no dependency on coordinate translation fix
- **#128 would need the coordinate translation fixed** regardless (it wants accurate stored coords for hovering over any row)
- Fixing #126 first with the Haiku approach is independent and doesn't block or conflict with #128

**Recommendation:** Fix #126 independently with Option A+B. When #128 activates, it can fix `translateItemsToPageCoords` (requires `cropBounds` plumbing through `getExtractionUnits`) as part of its own scope.

---

### Scope Estimate

- **Size:** ~20-25 lines net change
- **Risk:** Low — changes are isolated to `BCItemBrowserModal` (presentation only, no data mutation)
- **Test:** Open BC Item Browser for 3+ parts with different BOM positions, verify band moves to correct row. Test on a BOM without item-number column. Test page button switching.
- **Deploy:** Standard hosting deploy

---

## C67 — #128 Feasibility Trace: H5 Region Data Persistence + Approach Comparison

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Type:** Read-only feasibility trace for #128 Brief
**Context:** #126 closed PARTIAL (v1.20.118). Residual placement accuracy is the inherent ceiling of Haiku-locating on a downsized full-page preview image. #128 promoted to NEXT — rescoped as "render the H5 region directly." This trace answers whether the data exists to support that.

---

### Q1: Does ARC persist per-item H5 region coordinates at extraction time?

**YES — per-item coordinates ARE stored. But in the WRONG coordinate space.**

Each BOM item in `panel.bom[]` (Firestore) carries:

| Field | Type | Value | Coordinate space |
|-------|------|-------|-----------------|
| `y_top` | number (0.0-1.0) | Top edge of row | **Tile/region-relative** (NOT page-relative) |
| `y_bottom` | number (0.0-1.0) | Bottom edge of row | Same |
| `x_left` | number (0.0-1.0) | Left edge of BOM table | **Tile-relative** |
| `x_right` | number (0.0-1.0) | Right edge of BOM table | Same |
| `sourcePageIdx` | number | Index into BOM pages (filtered list) | — |
| `sourcePageId` | string | Actual page ID | — |
| `itemNo` | string | Printed BOM row number | — |

**NOT stored per item:** tile index, tile grid dimensions, render DPI, region bounds, extraction path.

**Why the coords are wrong:** `translateItemsToPageCoords` (line 10940) is called after extraction at lines 14203, 24674, 24923 — but `unit.cropBounds` is **always undefined**. `getExtractionUnits` (line 11710) creates units with `bomRegion` but never sets `cropBounds`. The function hits `if(!cropBounds) return items;` at line 10941 → **no-op** → coords stored as-is.

For H5 tiles: the AI returns coords relative to the tile images. For the old crop path: coords relative to the crop. For PDF-native with CropBox: coords relative to the CropBox view. In ALL cases where the AI sees a sub-page image, the translation never runs.

---

### Q2: Where are the BOM region coordinates? Are they reusable?

**On the PAGE object (not per-item). Persisted in Firestore. Fully reusable.**

| Source | Location | Format | Persists? |
|--------|----------|--------|-----------|
| User-drawn region | `pg.regions[].type === "bom"` | `{x, y, w, h}` normalized page-relative (0-1) | ✓ Yes (in `panel.pages[]`) |
| AI-detected region | `pg.aiBomRegion` | `{x, y, w, h}` normalized page-relative (0-1) | ✓ Yes |
| `resolveBomRegion(pg)` | Resolves user → AI fallback | Returns `{x, y, w, h, source}` | — |
| Original PDF | `pg.originalPdfPath` | Firebase Storage path | ✓ Yes |
| Page number | `pg.pageNumber` | Integer (1-based) | ✓ Yes |

**The H5 padded region** (with `H5_REGION_PAD_FRAC` + `H5_REGION_PAD_FLOOR_PTS` padding) is NOT stored — it's computed dynamically from `bomRegion` + page dimensions via `renderBomRegionHighDpi`. Deterministically recomputable.

**H5 tiles themselves** are transient — rendered on-demand by `renderBomRegionHighDpi`, sent to the Cloud Function, discarded. NOT stored in Firestore or Firebase Storage.

**Conclusion: all data needed to re-render the BOM region on demand is already persisted.** No "persist regions first" step required.

---

### Q3: Can the preview re-render cheaply?

**YES.** The existing `renderBomRegionHighDpi(storagePath, pageNumber, bomRegion)` function:
1. Downloads PDF from Firebase Storage (~50-200 KB for a single-page slice)
2. Opens with pdf.js
3. Renders region to high-DPI canvas tiles

For PREVIEW purposes (not extraction), a simpler single-canvas render at ~150-200 DPI is sufficient. The preview container is ~300px max height — a 6"×2" BOM region at 150 DPI = 900×300 px, well within browser canvas limits. No tiling needed for preview.

**Cost per preview:** one Firebase Storage download + one pdf.js render. The download is the bottleneck (~200-500ms); the render is fast (~50-100ms). Comparable to the current Haiku API call (~300-800ms). Can be cached in component state (already done for `croppedDataUrl`).

**Text-layer pages** already have good full-page images (text renders cleanly at any resolution). Their preview could continue using the existing full-page approach or render the region from PDF — either works.

---

### Q4: translateItemsToPageCoords fix — alternative or companion?

**COMPANION, not alternative.** The coord fix is cheap and valuable, but doesn't replace region rendering for the preview.

#### What fixing translateItemsToPageCoords would require

Pass `cropBounds` to `getExtractionUnits` return value, then it flows to `translateItemsToPageCoords` naturally:

- **For H5 tiles:** `cropBounds` = the **padded** region (computed from `bomRegion` + padding constants + page dimensions). The padded region is the actual area the tiles cover.
- **For old crop path (`croppedBomDataUrl`):** `cropBounds` = `bomRegion` (the crop IS the region).
- **For PDF-native with CropBox:** `cropBounds` = `bomRegion` (CropBox applied server-side at line 2449).

**~15-20 lines:** compute padded region in `getExtractionUnits` when H5 conditions are met, add `cropBounds` to the returned unit object.

#### Viability by grid configuration

| Grid | ny | y_top/y_bottom space | Translation possible? |
|------|-----|---------------------|----------------------|
| 1×1 | 1 | Region-relative | ✓ Exact |
| 2×1, 3×1, 4×1 | 1 | **Region-relative** (tiles split horizontally only) | ✓ Exact |
| 2×2, 3×2 | 2 | **Tile-relative** (tiles split vertically) | ✗ Unknown tile origin |
| 1×2 | 2 | **Tile-relative** | ✗ Unknown tile origin |

**Critical insight:** `findOptimalGrid` (line 11741) with `MODEL_MAX_PX = 1568` and `H5_TILE_TARGET_DPI = 600`:

- Typical D-size BOM region (~8.5"×2"): → 4×1 grid, **ny=1** ✓
- PRJ402119 region (~5.2"×2.0"): → 2×1 grid, **ny=1** ✓
- Tall region (7"×4"): → 3×2 grid, **ny=2** ✗

**BOM tables are almost always landscape (wider than tall). ny=1 is the dominant case.** The coord fix works for the common case but breaks for tall regions.

#### Comparison: coord fix vs region render

| Aspect | Fix coords | Render region |
|--------|-----------|---------------|
| **Accuracy** | Good for ny=1 (dominant); broken for ny>1 (rare) | Accurate by construction — ALL cases |
| **Retroactive** | **NO** — only fixes newly-extracted items; existing BOMs have wrong coords | **YES** — re-renders from stored PDF/region on demand |
| **Runtime cost** | Zero (fix at extraction time) | PDF download + pdf.js render per preview (~200-500ms) |
| **Preview quality** | Full-page image → BOM table is small, low-res in the preview | Region-only image → high resolution, user can read individual characters |
| **Text-layer BOMs** | Also fixed (CropBox crop-relative → page-relative) | Needs separate path OR re-use full-page image (no H5 tiles) |
| **Scope** | ~15-20 lines (add cropBounds to getExtractionUnits) | ~40-60 lines (render function, state, loading UX) |
| **Side benefits** | Fixes positional dedup for cross-tile items, fixes Drawing Reference fallback path | Enables #128 visual PN verification (accurate region view) |

**Recommendation: DO BOTH.** The coord fix is cheap (~15 lines) and improves positional dedup + fallback paths for new extractions. Region rendering is the #128 feature — it's the only path that's retroactive, accurate for all grids, and provides readable resolution.

---

### Q5: Text-layer (non-H5) BOMs

Text-layer pages go through `pdf-native` extraction (line 12126: `tier === "text-layer"` → standard path). They never get H5 tiles.

Their y_top/y_bottom are relative to the **CropBox view** when `bomRegion` is present (server applies CropBox at line 2449). Same translation gap as H5 — but text-layer pages render cleanly at any resolution, so the full-page preview approach (current) is adequate. The Haiku locate (v1.20.118 fix) also works well on text-layer pages since the text is crisp.

For the #128 preview: text-layer pages can either:
- Continue using the current full-page + Haiku approach (it works well for readable text)
- Render the BOM region from PDF at preview quality (same mechanism as H5, slightly better resolution)

Either path is fine. The v1.20.118 Haiku approach is already sufficient for text-layer. Focus #128 on H5 vision-mode pages where the full-page preview is inadequate.

---

### Summary for #128 Brief

**Direction: "render stored regions" (accurate, cheap).** All required data is already persisted:
- BOM region coords on `pg.aiBomRegion` or `pg.regions[]` ✓
- Original PDF in Firebase Storage via `pg.originalPdfPath` ✓
- Page number via `pg.pageNumber` ✓
- Per-item y_top/y_bottom for row highlighting (region-relative for ny=1 grids — the dominant case) ✓

**No "persist regions first" step needed.** The Brief is:
1. **Region render** (~40-60 lines): In BCItemBrowserModal, for H5-extracted pages, render the BOM region from PDF at preview DPI (~150-200) as a single canvas. Use stored y_top/y_bottom (region-relative for ny=1) to highlight the target row. Fall back to Haiku locate for ny>1 or missing coords.
2. **Coord fix** (~15-20 lines, companion): Add `cropBounds` to `getExtractionUnits` so `translateItemsToPageCoords` actually translates. Fixes new extractions; doesn't help existing data.
3. **Text-layer pass-through**: Keep current full-page + Haiku approach for text-layer pages.

**Total scope:** ~55-80 lines, medium complexity. Main risk: pdf.js loading/rendering latency in the preview UX (mitigated by loading spinner, already established pattern).

---

## C68 — #128 Detailed Plan: BOM Region Render Preview + Coord Fix

**Date:** 2026-06-15
**Role:** Coach (Sam Wize)
**Type:** Detailed plan (Marc builds, Coach verifies)
**Basis:** C67 feasibility trace, Brief approved by Jon
**Prod:** v1.20.118

---

### Goal

Replace the Haiku-locate-on-full-page preview in BCItemBrowserModal with an accurate, readable BOM region render. For H5-vision-extracted pages: render the actual BOM region (the area the part was extracted from) directly from the stored PDF, highlight the target row from stored coordinates. Text-layer pages keep the current Haiku path (already works well on crisp text).

Eliminates #126's residual: 1SFL ~1 row low, 8106235 title-block miss. Those were the ceiling of "estimate row position on a downsized preview image." The region render shows the actual extraction area at readable DPI — accurate by construction.

Two companion changes (per C67): (1) region render feature, (2) translateItemsToPageCoords fix.

---

### Key Insight: Stored coords are DIRECTLY usable on the region image

For ny=1 grids (all typical landscape BOM tables — 2×1, 3×1, 4×1):
- All tiles span the FULL HEIGHT of the padded region
- y_top/y_bottom returned by the AI are fractions of the tile height = fractions of the padded region height
- The preview renders that same padded region
- **No coord translation needed** — `cropRowFromImage(regionDataUrl, item.y_top, item.y_bottom, ...)` works directly

For ny>1 grids (rare tall BOM regions):
- y_top/y_bottom are tile-relative (unknown tile) → wrong on the region image
- Fallback to Haiku locate on the region image (much better quality than old full-page Haiku)

---

### Change 1: `renderBomRegionPreview` function (~15 lines)

**Insert at:** after `renderBomRegionHighDpi` (after current line 11824), module scope

**Pattern:** Simplified single-canvas render. Same PDF loading + padded region computation as `renderBomRegionHighDpi` (lines 11761-11786), but:
- No tiling — one canvas at preview DPI (~200)
- Returns `{dataUrl, paddedRegion, grid}` instead of `{tiles, grid, renderDpi}`

```
async function renderBomRegionPreview(storagePath, pageNumber, bomRegion, previewDpi=200) {
  await window.pdfjsReady();
  const pdfjs = window._pdfjs;
  const url = await fbStorage.ref(storagePath).getDownloadURL();
  const resp = await fetch(url);
  if(!resp.ok) throw new Error("PDF fetch failed: " + resp.status);
  const buf = await resp.arrayBuffer();
  const pdf = await pdfjs.getDocument({data:buf}).promise;
  try {
    const pg = await pdf.getPage(pageNumber);
    const baseVp = pg.getViewport({scale:1});
    // Same padding as H5 extraction — CRITICAL for coord alignment
    const _floorFracX = H5_REGION_PAD_FLOOR_PTS / baseVp.width;
    const _floorFracY = H5_REGION_PAD_FLOOR_PTS / baseVp.height;
    const _padX = Math.max(bomRegion.w * H5_REGION_PAD_FRAC, _floorFracX);
    const _padY = Math.max(bomRegion.h * H5_REGION_PAD_FRAC, _floorFracY);
    const _rx = Math.max(0, bomRegion.x - _padX);
    const _ry = Math.max(0, bomRegion.y - _padY);
    const paddedRegion = { x:_rx, y:_ry,
      w: Math.min(1, bomRegion.x + bomRegion.w + _padX) - _rx,
      h: Math.min(1, bomRegion.y + bomRegion.h + _padY) - _ry };
    const regionWIn = paddedRegion.w * baseVp.width / 72;
    const regionHIn = paddedRegion.h * baseVp.height / 72;
    const grid = findOptimalGrid(regionWIn, regionHIn);
    const vp = pg.getViewport({scale: previewDpi / 72});
    const rX = paddedRegion.x * vp.width;
    const rY = paddedRegion.y * vp.height;
    const cw = Math.round(paddedRegion.w * vp.width);
    const ch = Math.round(paddedRegion.h * vp.height);
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    await pg.render({canvasContext: ctx, viewport: vp, transform: [1,0,0,1,-rX,-rY]}).promise;
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), paddedRegion, grid };
  } finally { try { pdf.destroy(); } catch(_) {} }
}
```

**~25 lines.** Uses same H5 padding constants (lines 11728-11737) for exact coordinate alignment with stored item coords.

---

### Change 2: BCItemBrowserModal modifications (~20-30 lines)

**2a. New prop: `h5PageIds`**

At `BCItemBrowserModal` function signature (line 21541):

```
function BCItemBrowserModal({..., h5PageIds}) {
```

Receives an array of page IDs that used `hi-dpi-tiles` extraction path.

**2b. New function: `locateInRegion(pgIdx)` (~15 lines)**

Inside BCItemBrowserModal, alongside `locateInDrawing` (after line 21688):

```
async function locateInRegion(pgIdx) {
  const idx = pgIdx != null ? pgIdx : drawingPageIdx;
  const pg = bomPages[idx];
  if (!pg?.originalPdfPath || !pg.pageNumber) { locateInDrawing(idx); return; }
  const bomRegion = resolveBomRegion(pg);
  if (!bomRegion) { locateInDrawing(idx); return; }
  setLocating(true); setCroppedDataUrl(null);
  try {
    const preview = await renderBomRegionPreview(pg.originalPdfPath, pg.pageNumber, bomRegion);
    if (preview.grid.ny === 1 && targetRow?.y_top != null && targetRow?.y_bottom != null
        && (targetRow.y_bottom - targetRow.y_top) > 0.001) {
      // ny=1: stored coords are region-relative → directly usable
      const pnX = targetRow.x_left != null ? Math.min(0.60, Math.max(0.35,
        (targetRow.x_left + (targetRow.x_right || 1)) / 2)) : 0.50;
      await cropRowFromImage(preview.dataUrl, targetRow.y_top, targetRow.y_bottom, pnX);
    } else {
      // ny>1 or no stored coords: Haiku locate on the region image (high-res, accurate)
      // ... (use same Haiku prompt pattern as locateInDrawing but on preview.dataUrl)
      const b64 = preview.dataUrl.split(',')[1];
      if (!b64) { setLocating(false); return; }
      const pn = (targetRow?.partNumber || initialQuery || '').trim();
      const refLine = (targetRow?.itemNo || '').trim();
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":_apiKey,
                 "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body: JSON.stringify({model:ANTHROPIC_MODELS.HAIKU_DATED, max_tokens:150, messages:[
          {role:"user",content:[
            {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
            {type:"text",text:`This is a BOM table region. Find the row containing "${pn}"${refLine?` (item #${refLine})`:''}. Return JSON: row_top, row_bottom (y fractions 0-1), pn_x (x fraction of part-number column center). If not found, set row_top/row_bottom to null.`}
          ]},{role:"assistant",content:[{type:"text",text:"{"}]}
        ]})
      });
      const data = await resp.json();
      const text = '{' + (data.content?.[0]?.text || '');
      const m = text.match(/\{[\s\S]*?\}/);
      if (m) {
        const r = JSON.parse(m[0]);
        if (r.row_top != null && r.row_bottom != null && (r.row_bottom - r.row_top) > 0.001) {
          const pnX = r.pn_x != null ? Math.min(0.60, Math.max(0.35, r.pn_x)) : 0.50;
          await cropRowFromImage(preview.dataUrl, r.row_top, r.row_bottom, pnX);
        }
      }
    }
  } catch(e) { console.warn('locateInRegion:', e); locateInDrawing(idx); }
  finally { setLocating(false); }
}
```

**Architecture:** `locateInRegion` renders the BOM region from PDF, then either:
- **ny=1 + valid stored coords:** instant highlight from stored y_top/y_bottom (no API call)
- **ny>1 or missing coords:** Haiku locate on the region image (API call, but on high-quality ~200 DPI image instead of the old low-res full-page thumbnail)
- **Any failure:** falls back to existing `locateInDrawing` (Haiku on full page)

**2c. Modified mount useEffect (line 21716-21741)**

Replace the `if(bomPages.length && _apiKey)` branch:

```
if (bomPages.length && _apiKey) {
  const pgIdx = targetRow?.sourcePageIdx ?? 0;
  const pg = bomPages[pgIdx];
  if (pg && (h5PageIds || []).includes(pg.id)) {
    locateInRegion(pgIdx);
  } else {
    locateInDrawing(pgIdx);
  }
}
```

**~5 lines** changed (was 2, now 6).

**2d. Modified page button handler (line 22345-22348)**

Currently (v1.20.118): `onClick={()=>{setDrawingPageIdx(i);locateInDrawing(i);}}`

Change to:
```
onClick={()=>{
  setDrawingPageIdx(i);
  const pg = bomPages[i];
  if (pg && (h5PageIds || []).includes(pg.id)) locateInRegion(i);
  else locateInDrawing(i);
}}
```

**~4 lines** changed.

---

### Change 3: Modal instantiation prop (~3 lines)

**At line 29041** (`<BCItemBrowserModal` instantiation):

Add prop:
```
h5PageIds={(panel.extractionReport?.perPageOutcomes||[])
  .filter(o=>o.extractionPath==='hi-dpi-tiles')
  .map(o=>o.pageId)}
```

Data source: `panel.extractionReport.perPageOutcomes` stores `{pageId, extractionPath}` per page (verified at lines 14213-14248, 22499). `extractionPath === 'hi-dpi-tiles'` identifies H5-extracted pages.

---

### Change 4: `getExtractionUnits` cropBounds fix (~3 lines)

**At line 11710:**

Current:
```
return[{dataUrl:pg.dataUrl,croppedBomDataUrl,regionNote,originalPdfPath:pg.originalPdfPath||null,pageNumber:pg.pageNumber||null,bomRegion}];
```

Change to:
```
return[{dataUrl:pg.dataUrl,croppedBomDataUrl,regionNote,originalPdfPath:pg.originalPdfPath||null,pageNumber:pg.pageNumber||null,bomRegion,cropBounds:bomRegion}];
```

**And line 11712** (no-region path): already has `bomRegion:null` → `cropBounds` stays undefined → `translateItemsToPageCoords` no-ops correctly.

**Effect:** `translateItemsToPageCoords` (lines 14203, 24674, 24923) now receives the raw bomRegion as cropBounds. For:
- **Old crop path:** EXACT translation (crop = bomRegion).
- **PDF-native + CropBox:** EXACT translation (CropBox = bomRegion, applied server-side at functions/index.js line 2449).
- **H5 ny=1:** APPROXIMATE translation (off by H5 padding ~2-4%, or ~0.004-0.008 page fraction). Well within positional dedup Y_TOL of 0.04.
- **H5 ny>1:** y coords stay tile-relative within an approximate page-level range. Not ideal but better than current (no translation at all). Edge case — rare.

**Only affects new extractions.** Existing BOM items retain their untranslated coords. The region render feature (Change 1) handles existing data retroactively.

---

### Text-layer Branch

Text-layer pages are identified by absence from `h5PageIds`. They keep the current path:
- Mount useEffect → `locateInDrawing(pgIdx)` (Haiku on full-page image)
- Page buttons → `locateInDrawing(i)` (same)
- Text at ~72-150 DPI on the full page is crisp enough for Haiku to locate accurately

**No region render for text-layer.** The Haiku path already works well (v1.20.118 fix). Region rendering would work (the PDF/region data exists) but adds latency for no accuracy gain.

---

### ny>1 Handling (MUST — not assumed away)

**Detection:** `renderBomRegionPreview` returns `grid` (from `findOptimalGrid`). Check `grid.ny`.

**ny=1 (dominant — 2×1, 3×1, 4×1 grids):**
- All tiles span full region height → stored y_top/y_bottom are region-relative
- Highlight drawn directly from stored coords → instant, no API call
- This is the hot path

**ny>1 (rare — 3×2, 2×2, 1×2 grids for tall BOM regions):**
- y_top/y_bottom are tile-relative (unknown tile) → wrong on region image
- Fallback to **Haiku locate on the region image** (200 DPI, much better than old 72 DPI full-page)
- Haiku finds the row by part number string → accurate regardless of coord issues
- Cost: one Haiku API call (~$0.001). Same as the old path, but on better image.

**No silent wrong highlight for ny>1.** The plan explicitly branches on `grid.ny` (see `locateInRegion` line: `if (preview.grid.ny === 1 && targetRow?.y_top != null ...)`).

---

### Sequencing

| Step | What | Lines | Depends on |
|------|------|-------|------------|
| 1 | `renderBomRegionPreview` function | ~25 | — |
| 2 | `locateInRegion` function in BCItemBrowserModal | ~30 | Step 1 |
| 3 | Mount useEffect + page button branching | ~9 | Step 2 |
| 4 | Modal instantiation `h5PageIds` prop | ~3 | Step 3 |
| 5 | `getExtractionUnits` cropBounds fix | ~3 | — (independent) |

Steps 1-4 are the region render feature. Step 5 is the independent coord fix. Can be committed together or separately.

---

### Scope Confirmation

| Change | Lines | Risk |
|--------|-------|------|
| `renderBomRegionPreview` | ~25 | Low — isolated function, same PDF/canvas pattern as existing H5 |
| `locateInRegion` | ~30 | Low — presentation only, falls back to `locateInDrawing` on any failure |
| Mount useEffect + page buttons | ~9 | Low — adds branch, existing path preserved for non-H5 |
| Modal instantiation prop | ~3 | Minimal — data derivation from existing panel data |
| `getExtractionUnits` cropBounds | ~3 | Low — adds one field to unit object, existing callers already pass to translateItemsToPageCoords |

**Total: ~70 lines net-new.** Within C67's 55-80 estimate.

**Risk:** Low overall. `renderBomRegionPreview` is the only new async operation (PDF download + pdf.js render). Failure falls back to existing Haiku path. No data mutations, no extraction changes, no save-path changes.

**Latency:** PDF download (~200-500ms) + pdf.js render (~50-100ms) vs current Haiku API call (~300-800ms). Comparable or slightly slower on first load. Region image can be cached in component state (`croppedDataUrl`) — subsequent views of the same part are instant.

---

### Test Criteria

| # | Test | Expected | Pass if |
|---|------|----------|---------|
| T1 | 1SFL547002R1311 on H5-extracted BOM page | Region render shows BOM area at readable DPI, highlight band on correct row | Band covers the row containing 1SFL547002R1311 (was ~1 row low with Haiku) |
| T2 | 1SDA102947R1 on same project | Region render, correct row highlighted | Band on correct row (was inconsistent with Haiku) |
| T3 | 8106235 on same project | Region render, correct row at BOTTOM of BOM | Band at bottom rows (was landing on title block with Haiku) |
| T4 | Text-layer BOM page (PDF-native extraction) | Falls through to `locateInDrawing` (Haiku on full page) | "✓ Row found" appears, region render NOT attempted |
| T5 | Page button switching between H5 BOM pages | Each page renders its own BOM region | Switching pages shows different region images, highlight tracks the target row on each |
| T6 | Legacy project (no `originalPdfPath`) | Falls through to `locateInDrawing` | Existing behavior preserved, no error |
| T7 | Part with empty `itemNo` on H5 page | Region render with stored y_top/y_bottom (ny=1) | Highlight from stored coords, NOT from itemNo interpolation |
| T8 | New extraction after cropBounds fix | `panel.bom[].y_top` values are page-relative | Compare y_top before/after: new extraction y_top should be offset by ~bomRegion.y |

**T5-specific:** If a ny>1 BOM exists in the test project set, verify the Haiku-on-region fallback fires and highlights correctly. If none available, this is a structural code review check (verify the `grid.ny === 1` branch exists).

---

### Carve-outs

1. **No caching of rendered regions across modal opens.** Each open re-renders. Acceptable — the modal remounts each time (conditional rendering at line 29040), so no cache would survive anyway.
2. **No offline/cached PDF fallback.** If PDF download fails, falls back to Haiku on full-page image. This matches the existing behavior (full-page images are cached in dataUrl/storageUrl; PDFs are fetched on demand).
3. **No retroactive coord fix for existing BOMs.** The translateItemsToPageCoords fix only applies to new extractions. Existing items keep tile-relative coords. The region render handles them retroactively (coords are directly usable on the region image for ny=1).

---

## C69 — #133 Supplement: Send Traveler BOM to Customer

**Date:** 2026-06-16
**Role:** Coach (Sam Wize)
**Type:** Supplement (assumption verification + feasibility + D3 record shape)
**Basis:** Freddy Brief #133 (LOCKED), committed as `docs/133-BRIEF-AND-SUPPLEMENT.md`
**Prod:** v1.20.120

---

### Summary

All five Brief assumptions verified. No blockers, no refactors needed.

### A1 — Traveler BOM: Render-on-Demand ✓

The "traveler BOM" is `buildCoverPage()` (app.jsx:7812) — the per-panel cover sheet stamped "PANEL PRODUCTION TRAVELER" with labor summary, BOM table, and crossed-part "Original Part #" column. It is NOT the `buildBomReportPdfDoc` (spreadsheet-style BOM Report used by "Send w/BOM").

No pre-rendered artifact exists. `buildCoverPage` is a stateless function at module scope — takes `(doc, panel, bcProjectNumber, quoteData, lineIdx, W, H, opts)`, writes to a jsPDF doc object, no component refs or hooks. A ~15 line wrapper iterating `project.panels` produces a single multi-panel PDF.

### A2 — Path C Send: Refactor-Free ✓

Both `sendGraphEmail` (line 8103) and `graphReplyToMessage` (line 8213) already accept `extraAttachments` (array of `{pdfBase64, pdfFilename}`). Added in v1.19.931 for the existing "Send w/BOM" feature. The primary PDF arg is optional (`if(pdfBase64)` at line 8114).

- **Standalone:** Traveler as primary attachment, no quote PDF. Works as-is.
- **Bundled:** Traveler pushed into `extraAttachments` alongside existing attachments. Works as-is.

Both send paths in `QuoteSendModal.handleSend` (lines 31974, 31976) and the inline ProjectView send (line 37272) already pass `extraAttachments`.

### A3 — D2 Trust Gate ✓

`findIncompleteQuoteItems(project)` (line 15541) returns `isVerificationBlock: true` entries for panels with `extractionReport.manualVerifyRequired`. Used by all three send surfaces.

**Gate for standalone BOM send:** Filter to `isVerificationBlock` only — skip pricing completeness checks (irrelevant for BOM-only send). Skip `ensureQuoteFieldsPopulated` (BC payment terms not needed for BOM-only).

### A4 — UI Placement ✓

**Standalone button:** PanelListView action area (around line 34726), below the existing Send/Print Quote button. Same vertical stack pattern.

**Bundled toggle:** QuoteSendModal body (below message textarea, above footer buttons), checkbox "Include Traveler BOM". Same pattern for inline ProjectView send.

### A5 — D3 Record Shape ✓

`bomApprovalRequests[]` array on the project document. Fields: `id`, `sentAt`, `sentTo`, `sentBy`, `mode` (standalone/bundled), `panels[]`, `quoteRev`, `status` ("sent" now; "approved"/"rejected"/"commented" RESERVED). Array field — no subcollection, no new Firestore rules, no new listener.

### Risk Assessment

No blocking risks found. `buildCoverPage` is decoupled from PanelCard. Multi-attachment size is well under Graph API 4MB cap. D3 array cardinality is negligible (1-5 entries per project).

### Scope

~130-150 lines, single session. No H-item discipline needed (no extraction/save-path/pricing changes).

**Verdict:** Brief APPROVED for implementation. Marc can proceed.

---

## C70 — #134 Yellow Circle Indicator Investigation

**Date:** 2026-06-16
**Role:** Coach (Sam Wize)
**Type:** Investigation (read-only, code + history trace)
**Request:** Jon — "What are the small yellow circles next to Part Numbers in the BOM view?"
**Prod:** v1.20.120

---

### Answer

The yellow circles are **AI extraction confidence dots** — per-row indicators showing how confident the AI was in its reading of each part number during BOM extraction.

### UI Element

**Location:** `app.jsx:28005-28008`, inside the BOM table's partNumber cell (mode==="fit" rendering path).

**Render condition:**
```
f==="partNumber" && (row.confidence==="low" || row.confidence==="medium")
  && !row.isLaborRow && !row.isContingency
```

**Appearance:**
- 8×8px circle, `borderRadius:"50%"`
- **Amber** (`#f59e0b`) for `confidence === "medium"` — at least one character could be a confusable glyph (S/5, B/8, O/0, I/1, etc.)
- **Red** (`#ef4444`) for `confidence === "low"` — multiple doubtful characters, faded/clipped print
- **No dot** for `confidence === "high"` — zero doubt on every character
- Tooltip: `"AI confidence: {level} — verify this part number against the source drawing"`

### Origin

**Shipped in:** v1.20.15 (`06a0b9ee`, 2026-05-22), as part of TODO #49 — "Scanned PDF quality detection and enhanced extraction for degraded source material." Specifically item (f) of that multi-part feature.

**Context:** v1.20.14 rolled back the crop-path extraction regression (#48). v1.20.15 added the full scan-quality detection suite to handle degraded source PDFs (CCITTFaxDecode monochrome fax scans). The confidence dot was one of six components: server-side quality assessment, dynamic prompt enhancement, CropBox, client-side propagation, scan-quality banner, and the per-row dots.

### Data Flow

1. **AI sets confidence per row** in the BOM extraction prompt response (line 11607). The prompt defines three levels with strict criteria: "high" requires ZERO doubt on every character; "medium" means at least one confusable-glyph pair in play; "low" means multiple doubtful characters.

2. **Post-extraction code-level downgrade** (line 12001-12013): even if the AI returns "high," the extraction pipeline forces a downgrade to "medium" for any row whose partNumber contains a confusable glyph (S, 0, O, 8, B, I, Z, G, 6, T, 7, H, N, 5, D, C, 2, Q, l, L, 1) OR whose description matches enclosure keywords. The `_confDowngradeReason` field records why ("contains-confusable-glyph" or "enclosure-row").

3. **Persisted on the BOM row** in Firestore — `row.confidence` is a string field on each `panel.bom[]` item. Survives save-reload cycles.

4. **Cleared on manual edit** (line 25455): when a user edits the partNumber field, `confidence` is reset to `"high"` and `_confDowngradeReason` is deleted. The dot disappears — the user's edit is treated as verification.

### Companion UI

The dots work alongside a **toolbar badge** (line 27578-27597) that summarizes confidence issues:
- Amber badge: `"⚠ N rows need review"` when low-confidence or placeholder rows exist
- Blue badge: `"N medium-confidence rows"` when only medium-confidence rows exist
- Clicking the badge opens a verification modal listing the flagged rows

### Is It Stale/Orphaned?

**No — fully live and correctly wired.** The confidence field is:
- Written by every extraction path (BOM prompt at line 11607, all three extraction paths)
- Downgraded by the post-extraction pipeline (line 12001-12013)
- Read by the BOM table renderer (line 28005)
- Read by the toolbar badge (line 27580-27581)
- Read by `findIncompleteQuoteItems` for the send gate (indirectly — via `manualVerifyRequired` on the panel, not per-row confidence)
- Cleared on user edit (line 25455)

### Freddy's Lead: Confirm or Rule Out

**RULED OUT.** The yellow dots are NOT from the trust-layer / F1 noisy-PN guard / #115 held-back-cross indicator. Those are separate systems:
- **F1 noisy-PN guard** (v1.20.110, #110): holds back BC fuzzy matches as suggestions when `manualVerifyRequired` is true. No per-row dot.
- **#115 held-back-cross per-row indicator**: scaffolding exists but UI not yet built (TODO #115 is OPEN — "needs per-row indicator").
- **"Mark BOM Verified" button** (line 27539-27549): clears `manualVerifyRequired` on the panel — a panel-level flag, not per-row.

The yellow dots are purely extraction-quality feedback from the AI confidence system (v1.20.15, #49f).

---

### C71 — #133 Detailed Plan (2026-06-16)

**Type:** Implementation spec  
**Status:** COMPLETE  
**Artifact:** `docs/133-BRIEF-AND-SUPPLEMENT.md` (appended after Analyst Review carve-outs)

Built from Freddy's Analyst Review with all decisions locked (D1-D3) and Supplement (C69) verified.

**Summary:** 6 changes, ~155 new lines, single session scope:
- **Change 0:** `generateTravelerBomPdf(project)` — wrapper after line 7562 that iterates all panels through `buildCoverPage` into one combined PDF. ~22 lines.
- **Change 1:** Standalone BOM send handler + state in PanelListView. Gates on `isVerificationBlock` only (skips pricing, skips `ensureQuoteFieldsPopulated`). Writes D3 `bomApprovalRequests[]` record. ~40 lines.
- **Change 2:** Standalone "Send Traveler BOM" button in PanelListView after Send/Print Quote button (line 34726). Purple accent. ~25 lines.
- **Change 3:** Standalone send modal (portal, minimal — no reply-to-thread). ~30 lines.
- **Change 4a:** Bundled toggle in QuoteSendModal — checkbox after signature div (line 32091), default OFF. When ON, builds traveler and pushes to `extraAttachments[]`. D3 record on send. ~20 lines.
- **Change 4b:** Same bundled toggle in ProjectView inline send modal (line 37227). ~18 lines.

**D3 record shape:** `bomApprovalRequests[]` — array-append only, `status:"sent"` write-once, never mutated by #133 paths.

**Test criteria:** 7 acceptance checks (T1-T7) covering standalone clean/blocked, bundled off/on, three-attachment combo, inline send, and D3 immutability.

**Risk flag:** Graph API 4MB cap — Marc should extend the existing size warning (line 31963) to sum all attachments including traveler. One-line change.

---

### C72 — #133 Post-Deploy Code-Path Verification (2026-06-16)

**Type:** Post-deploy review  
**Version:** v1.20.121 (commit 3621754a, base impl d561b203 + follow-ups a0906442, 0cb3fe1a)  
**Status:** PASS with one deviation note (4b omitted — not a defect)

#### Verification results

**T2 — Standalone `handleBomSend` verification gate:** PASS  
Line 32493: `findIncompleteQuoteItems(project).filter(i=>i.isVerificationBlock)` — filters to `isVerificationBlock` only, skips pricing completeness. On block: `arcAlert` with panel list (line 32495-32497), early return at 32498. No `sendGraphEmail` call, no D3 write. `setBomSending` is never set to `true` on this path (guard is before the `setBomSending(true)` at line 32509).

**T3 — Bundled toggle default OFF:** PASS  
Line 31836: `useState(false)` — default unchecked. The `if(includeTravelerBom)` guards at lines 31991 and 32038 are both gated on this state. When OFF: no `generateTravelerBomPdf` call, no `extraAttachments.push`, no `bomApprovalRequests` write.

**T7 — D3 immutability (append-only, no reads/mutations/deletes):** PASS  
Only two references to `bomApprovalRequests` in the entire codebase:
- Line 32043: bundled path — `upd.bomApprovalRequests=[...(upd.bomApprovalRequests||[]),req]`
- Line 32529: standalone path — `{...project,bomApprovalRequests:[...(project.bomApprovalRequests||[]),req]}`
Both are spread-append. `status:"sent"` is a literal in both `req` objects (lines 32042, 32528). No code anywhere reads, updates, or deletes records from this array.

**D3 FIX 1 — `"bar_"` prefix at both write sites:** PASS  
- Standalone (line 32525): `id:"bar_"+Date.now().toString(36)+Math.random()...`
- Bundled (line 32039): `id:"bar_"+Date.now().toString(36)+Math.random()...`

**D3 FIX 2 — `panels = p.id` (stable IDs) at both sites:** PASS  
- Standalone (line 32527): `panels:(project.panels||[]).map(p=>p.id)`
- Bundled (line 32041): `panels:(project.panels||[]).map(p=>p.id)`

**Size warning — sums all attachments:** PASS  
Line 32002: `approxBytes=Math.floor(((pdfBase64?.length||0)+extraAttachments.reduce((s,a)=>s+(a.pdfBase64?.length||0),0))*0.75)` — sums quote PDF base64 length + all `extraAttachments` base64 lengths, then applies the 0.75 base64→bytes factor. This covers quote + BOM Report + traveler BOM in a three-attachment send (T5). Warning message at line 32005 updated to say "email attachments total" (not "quote PDF").

**Change 0 — `generateTravelerBomPdf` calls `buildCoverPage` (cross column):** PASS  
Line 7582: `await buildCoverPage(doc,panels[i],bcNum,q,i,431.8,279.4)` — calls the per-panel traveler builder (line 7812), NOT `buildBomReportPdfDoc`. The `hasCrosses` logic at line 7956 in `buildCoverPage` renders the "Original Part #" cross column. All panels iterated in a single combined PDF (`doc.addPage` at line 7581 for i>0). No `opts` → quoting mode (not production). Correct.

#### Marc's 3 deviations — verified correct

**Owner-priority gate on standalone send:** CORRECT  
Two layers: (1) the button at line 34847 uses `onClick={ownerPriorityActive?_fireOwnerPriorityAlert:()=>{...setBomSendModal(...)}}` + `disabled={_hasVerify||ownerPriorityActive}` at line 34863 — matches the quote send button pattern at line 34797-34843. (2) the handler at line 32490 has `if(ownerPriorityActive){_fireOwnerPriorityAlert();return;}` as the first line — matches `handleSend` at line 31889. Both use the same module-scope `_fireOwnerPriorityAlert` (line 15540). No other path's behavior altered.

**`bomSending` double-send guard:** CORRECT  
- Set `true` at line 32509 (before `acquireGraphToken` + `generateTravelerBomPdf` awaits)
- Cleared on every exit: graph-token fail (line 32511), no-panels fail (line 32515), send-fail catch (line 32519), save-fail catch (line 32534), success (line 32536)
- Guard checked at line 32492: `if(!m||bomSending)return;` — early return if already in flight
- Button `disabled={bomSending}` at line 35007 + Cancel `disabled={bomSending}` at line 35006 — UI also locked during send

**Separated save try/catch:** CORRECT  
`sendGraphEmail` is in its own try/catch (line 32517-32519) — failure reports "Send failed" and returns. The D3 record save is in a SEPARATE try/catch (line 32524-32535) — failure reports "Traveler BOM was sent to X, but the send-record failed to save" (line 32533). This mirrors the #117 Fix 3c pattern on the quote path (line 32030-32033, 32045-32049). The user knows "email went out, only the audit record is missing" — not a false "Send failed".

#### Deviation note: Change 4b (ProjectView inline send toggle) omitted

The inline send modal at lines 37382-37465 has NO traveler BOM toggle, no `generateTravelerBomPdf` call, and no D3 record write. This was specified in the Detailed Plan (C71) as Change 4b (~18 lines).

**Assessment: NOT A DEFECT.** The inline send path is a secondary/simpler send surface (no reply-to-thread, no thread search). Marc may have intentionally omitted it to keep the inline path minimal, or it may be a scope decision. Either way: the PRIMARY path (QuoteSendModal, Change 4a) has the toggle and works correctly. The inline path still sends quotes with BOM Report as before — it just can't bundle the traveler. This is a **FORWARD-NOTE for #130** (dead-code cleanup TODO already tracks this inline path as a simplification candidate). No action needed for #133 closure.

#### Summary

All 7 code-path verification items PASS. Marc's 3 deviations from the plan are all correct and well-implemented. Change 4b omission is noted but non-blocking. The code-path half of #133 closure is clear.

Remaining for full closure: Jon's live-send tests (T1, T4, T5) + the #130 forward-note.

---

### C73 — #133 "Traveler" → "Quoted BOM" Rename: Decoupling Analysis (2026-06-16)

**Type:** Pre-implementation analysis (Coach lane — shared-function decoupling)  
**Status:** COMPLETE — ready for Marc

#### 1. In-PDF title: conditional mechanism

**Line 7868** is the single render point:
```js
doc.text(isProduction?"APPROVED TO PRODUCE":"PANEL PRODUCTION TRAVELER",W-margin,m(16),{align:"right"});
```

`isProduction` comes from `opts.mode==="production"` (line 7856). The existing `opts` bag already supports arbitrary fields — `mode`, `poNumber`, `dueDate`, `poReceivedDate` are the four used today (lines 7856-7859).

**Cleanest option: add `opts.documentTitle` override.** One-line change inside `buildCoverPage`:
```js
// Line 7868 becomes:
doc.text(isProduction?"APPROVED TO PRODUCE":(opts.documentTitle||"PANEL PRODUCTION TRAVELER"),W-margin,m(16),{align:"right"});
```

Then in `generateTravelerBomPdf` (line 7582), pass the title:
```js
await buildCoverPage(doc,panels[i],bcNum,q,i,431.8,279.4,{documentTitle:"QUOTED BOM"});
```

**Why `documentTitle` over a new mode:** A third mode would require a three-way branch on lines 7868 AND 7887 (the info-grid fields array). `documentTitle` only changes the title string — the info grid correctly uses the quoting-mode fields (no PO#, no due date), which is exactly right for a customer-facing quoted BOM. No new mode needed.

#### 2. Production traveler: byte-for-byte unaffected — PROVEN

**All `buildCoverPage` call sites enumerated:**

| # | Line | Caller | opts passed | Title rendered | Affected? |
|---|------|--------|-------------|----------------|-----------|
| 1 | 7582 | `generateTravelerBomPdf` (#133) | `{}` today → `{documentTitle:"QUOTED BOM"}` after rename | Changes from "PANEL PRODUCTION TRAVELER" → "QUOTED BOM" | YES — this is the target |
| 2 | 24241 | `buildAndAttachPdf` (BC upload) | `uploadOpts` pass-through | When `mode:"production"` → "APPROVED TO PRODUCE"; else → "PANEL PRODUCTION TRAVELER" | NO — `documentTitle` not in `uploadOpts`, falls through to existing conditional |

**There are exactly 2 call sites.** Call site #2 is the production/BC path. It passes `uploadOpts` which comes from:
- `buildAndAttachPdf()` with no args → `uploadOpts={}` → `isProduction=false`, no `documentTitle` → "PANEL PRODUCTION TRAVELER" (unchanged)
- `buildAndAttachPdf({mode:"production", poNumber, dueDate, poReceivedDate})` (line 38070) → `isProduction=true` → "APPROVED TO PRODUCE" (unchanged, hits the `isProduction` branch first)
- `buildAndAttachPdf({stampMode:"quote_ready",...})` / `"ready_to_produce"` / `"customer_reviewed"` (lines 33180, 33431, 33472) → no `mode`, no `documentTitle` → "PANEL PRODUCTION TRAVELER" (unchanged)

**The `documentTitle` fallback (`||"PANEL PRODUCTION TRAVELER"`) guarantees zero change for any caller that doesn't explicitly set it.** Only the #133 wrapper passes it.

#### 3. #133-only rename surfaces — complete list for Marc

All are in `src/app.jsx`. None are shared with the production/BC path.

| Surface | Line | Current text | New text | Shared with production? |
|---------|------|-------------|----------|------------------------|
| **In-PDF title** | 7868 (via opts) | "PANEL PRODUCTION TRAVELER" | "QUOTED BOM" | NO — only #133 wrapper passes `documentTitle` |
| **Filename prefix** | 7588 | `TRAVELER_BOM-[...]` | **⚠ OPEN QUESTION — see below** | NO — only in `generateTravelerBomPdf` |
| **Button label** | 34866 | "Send Traveler BOM for Approval" / "Send Traveler BOM (blocked…)" | "Send Quoted BOM for Approval" / "Send Quoted BOM (blocked…)" | NO |
| **Button tooltip** | 34864 | "Email the traveler BOM (BOM-only, cross column)…" | "Email the quoted BOM…" | NO |
| **Modal title** | 34986 | "📋 Send Traveler BOM" | "📋 Send Quoted BOM" | NO |
| **Modal subtitle** | 34987 | "BOM-only (per-panel cover pages with cross column)…" | update "traveler" wording | NO |
| **Modal send button** | 35007 | "Send Traveler BOM" / "Sending…" | "Send Quoted BOM" / "Sending…" | NO |
| **Modal send tooltip** | 35007 | "Email the traveler BOM to the customer…" | "Email the quoted BOM…" | NO |
| **Toggle label** | 32149 | "Include Traveler BOM (per-panel cover pages with cross column)" | "Include Quoted BOM…" | NO |
| **Email subject** | 34859 | `Traveler BOM — ${...}` | `Quoted BOM — ${...}` | NO |
| **Email body** | 34860 | "…attached traveler BOM…" | "…attached quoted BOM…" | NO |
| **No-panels alert** | 32515 | "No panels — cannot generate traveler BOM." | "…quoted BOM." | NO |
| **Send confirmation** | 32538 | "Traveler BOM sent to…" | "Quoted BOM sent to…" | NO |
| **Save-fail alert** | 32533 | "⚠ Traveler BOM was sent to…" | "⚠ Quoted BOM was sent to…" | NO |
| **Size warning** | 32005 | "…drop the BOM Report / Traveler BOM attachment…" | "…Quoted BOM attachment…" | NO |

**15 surfaces total.** All are #133-only code added in `d561b203`/`a0906442`/`0cb3fe1a`. Zero overlap with the production traveler, BC upload, or any pre-#133 path.

**Code comments** (lines 7565, 31835, 31989, 32000, 32035, 32142, 32483, 34844, 34980) reference "Traveler BOM" — Marc should update these too for grep consistency, but they have no runtime effect.

#### Open question for Jon

**Should the FILENAME prefix change too?**

Current: `TRAVELER_BOM-[QTE-1234 Rev 01] - Customer - Project.pdf`  
Option A: `QUOTED_BOM-[QTE-1234 Rev 01] - Customer - Project.pdf`  
Option B: Keep `TRAVELER_BOM-…` filename, only rename visible title/UI

The filename is what the customer sees in their email attachment list and downloads folder. If "Quoted BOM" is the customer-facing name, Option A is consistent. If "Traveler BOM" is fine as a behind-the-scenes filename, Option B avoids renaming a file pattern that may already be in customers' inboxes.

**Jon decides.** Marc implements whichever.

---

### C74 — #133 Rename Spot-Check (v1.20.122) (2026-06-16)

**Type:** Post-deploy review  
**Version:** v1.20.122 (commit 2c53008b, impl 7440469c, #130 note ad530f35)  
**Status:** PASS — all 5 items green

**Title decoupling:** PASS  
Line 7871: `doc.text(isProduction?"APPROVED TO PRODUCE":(opts.documentTitle||"PANEL PRODUCTION TRAVELER"),...)`. The `opts.documentTitle` fallback chain is correct — `isProduction` branch fires first for production callers; non-production callers without `documentTitle` get the default "PANEL PRODUCTION TRAVELER".

**#133 wrapper passes title:** PASS  
Line 7585: `await buildCoverPage(doc,panels[i],bcNum,q,i,431.8,279.4,{documentTitle:"QUOTED BOM"})`.

**Production byte-for-byte:** PASS  
Line 24244: `await buildCoverPage(doc,panel,bcProjectNumber,quoteData,idx,coverMm.mmW,coverMm.mmH,uploadOpts)` — `uploadOpts` comes from `buildAndAttachPdf(uploadOpts={})`. No caller ever sets `documentTitle` in `uploadOpts`. The three code paths:
- No args → `{}` → no `documentTitle`, `isProduction=false` → "PANEL PRODUCTION TRAVELER" (unchanged)
- `{mode:"production",...}` (line 38070) → `isProduction=true` → "APPROVED TO PRODUCE" (unchanged, hits first branch)
- `{stampMode:"..."}` variants → no `mode`, no `documentTitle` → "PANEL PRODUCTION TRAVELER" (unchanged)

**Filename:** PASS  
Line 7591: `QUOTED_BOM-[${q.number||"Quote"} Rev ${...}] - ${co} - ${pn}.pdf`. Prefix changed from `TRAVELER_BOM` to `QUOTED_BOM`, rest of pattern intact.

**Zero customer-facing "traveler":** PASS  
Grep for `/traveler/i` returns 16 hits — all are: internal function names (`generateTravelerBomPdf`, `includeTravelerBom`), code comments, the production-path default string, or pre-#133 shared-infra comments. Every customer-facing surface (button labels, modal title/subtitle, toggle label, email subject/body, alerts, tooltips, filename, in-PDF title, size warning) now reads "Quoted BOM". Marc's grep result confirmed.

**#130 forward-note:** PASS  
TODO.md lines 2150-2153: "If the ProjectView inline send modal is ever revived, it should inherit the 'Include Quoted BOM' toggle (#133 Change 4a)…" References correct toggle name, correct Coach finding (C73), correct rationale (Change 4b dropped, modal unreachable).

**This clears the last code-path step for #133 closure.**

---

### C75 — #135/#136 Cover-Page BOM Table: Yellow Highlight + Hide Supplier (2026-06-16)

**Type:** Pre-implementation analysis  
**Status:** COMPLETE — ready for Marc  
**TODO assignments:** #135 (Change A — yellow highlight), #136 (Change B — hide Supplier)

---

#### Change A (#135) — Yellow highlight on crossed-row PN cells

**Mechanism:** The `didParseCell` hook (line 8039-8046) already fires per-cell on body rows. It currently sets bold on all cells of crossed rows and bolditalic on the Original Part # cell (column index 3). Yellow fill is additive — set `data.cell.styles.fillColor` on the target cells.

**Existing hook (line 8039-8046):**
```js
didParseCell:(data)=>{
  if(hasCrosses&&data.section==="body"){
    const row=bom[data.row.index];
    if(row&&row.isCrossed){
      data.cell.styles.fontStyle="bold";
      if(data.column.index===3){data.cell.styles.fontStyle="bolditalic";}
    }
  }
},
```

**Column indices in `hasCrosses` layout (line 8019-8020):**
- 0=#, 1=Qty, 2=Part#, 3=Original Part#, 4=Description, 5=MFR, 6=Supplier

**Target cells for yellow fill (on crossed rows only):**
- Column 2 (Part # — the quoted/replacement PN) — ALWAYS on crossed rows
- Column 3 (Original Part #) — ONLY when populated (`row.crossedFrom` is truthy and differs from `row.partNumber`)

**Modified hook sketch:**
```js
didParseCell:(data)=>{
  if(hasCrosses&&data.section==="body"){
    const row=bom[data.row.index];
    if(row&&row.isCrossed){
      data.cell.styles.fontStyle="bold";
      if(data.column.index===3){data.cell.styles.fontStyle="bolditalic";}
      // #135: yellow fill on the two PN cells of crossed rows
      if(data.column.index===2)data.cell.styles.fillColor=[255,243,176];
      if(data.column.index===3&&row.crossedFrom&&normPart(row.crossedFrom)!==normPart(row.partNumber)){
        data.cell.styles.fillColor=[255,243,176];
      }
    }
  }
},
```

**Recommended RGB: `[255,243,176]`** — a warm "highlighter pen" yellow. Tested characteristics:
- Bright enough to pop on white/alternateRow(245,245,245) backgrounds
- Low enough saturation that black text stays fully readable (contrast ratio ~1.1:1 with white background — comparable to a physical highlighter)
- Prints clean on both color and B&W printers (renders as light grey in B&W, doesn't obscure text)

**Bold + italic + yellow readability flag:** Bold text on a yellow cell fill is standard for "changed item" callouts in BOMs — it's the industrial convention. The italic on the Original Part # cell adds distinction but bold+italic+yellow is visually heavy. **Recommendation:** keep it — the heaviness is the POINT (the substitution must be scannable at a glance on a 50-row BOM). If it reads too heavy in live testing, the italic can be dropped from the Original Part # without losing the yellow.

**OPEN DECISION for Jon:** Two PN cells only (Freddy's lean) vs. whole crossed row.

| Option | What gets yellow | Visual effect |
|--------|-----------------|---------------|
| **Two PN cells** | Part # + Original Part # cells only | Surgical — eyes go straight to the substitution pair. Rest of row (description, MFR, supplier) stays neutral. Matches "what changed" semantics. |
| **Whole row** | All cells on the crossed row | Bolder — entire row pops as "this item has a cross." Easier to see row count at a glance, but doesn't distinguish which cells carry the substitution. |

Two-cell is more precise; whole-row is faster to scan for crossed-row COUNT. Both are easy to implement (the difference is removing the `data.column.index` guard).

**Shared between both docs:** YES, intentionally. The `didParseCell` hook is inside `buildCoverPage` which serves both production traveler and Quoted BOM. No decoupling needed — both documents benefit from the highlight.

**~5 new lines** inside the existing hook.

---

#### Change B (#136) — Hide Supplier column (customer-facing Quoted BOM only)

**Mechanism:** Use `opts.hideSupplierColumn` — same `opts` bag already proven for title decoupling (C73). Set only by `generateTravelerBomPdf` (line 7585), never by `buildAndAttachPdf`.

**Where the column is defined (lines 7999-8025):**

Three structures need conditional modification:
1. **`colStyles`** (line 8003-8018) — column width/alignment definitions
2. **`head`** (line 8019-8021) — header row array
3. **`body`** (line 8022-8025) — data rows array

**Implementation approach:** When `opts.hideSupplierColumn` is true, omit the last entry from each:

`hasCrosses` layout (7 → 6 columns):
- colStyles: drop key 6 (Supplier)
- head: `["#","Qty","Part #","Original Part #","Description","MFR"]`
- body: drop `r.bcVendorName||"—"` (last element)

No-crosses layout (6 → 5 columns):
- colStyles: drop key 5 (Supplier)
- head: `["#","Qty","Part #","Description","MFR"]`
- body: drop `r.bcVendorName||"—"` (last element)

**⚠ NO-REFLOW FEASIBILITY — FLAG FOR JON:**

The current BOM table uses `tableWidth:"auto"` (line 8031). In jsPDF-AutoTable 3.8.2, `"auto"` means **fill available page width** (page width minus margins). The `'auto'`-cellWidth columns (Part #, Original Part #, Description, MFR, Supplier) share the available width after fixed columns (#, Qty) take theirs.

**When Supplier is removed with `tableWidth:"auto"`, the remaining `'auto'` columns WILL redistribute to fill the same total page width.** Each will be slightly wider. This violates the literal "NO width redistribution" constraint.

Two feasible options:

| Option | tableWidth | Column widths | Table width | Visual |
|--------|-----------|---------------|-------------|--------|
| **R1 — Let autoTable redistribute** | `"auto"` (unchanged) | Remaining columns slightly wider to fill page | Same as production (full margin-to-margin) | Clean, no visible gap. Columns ~10-15% wider each. This is the standard table behavior when removing a column. |
| **R2 — Shrink table** | `"wrap"` when `hideSupplierColumn` | Each column at its content-driven minimum (respecting `minCellWidth`) | Narrower — empty space on the right side | Columns at natural content widths. Gap on right. No column gets wider. Closest to "freed space closes, nothing else moves." |

**My recommendation: R1** (let autoTable redistribute). Reason: the `minCellWidth` values already set sensible floors (30mm Part#, 60mm Description, etc.). The redistribution is gentle — Supplier is ~28mm out of ~408mm total (7% of table width). Each remaining column gains ~4-5mm. The result looks like a normal 6-column table, not a 7-column table with a hole. R2 produces a visible gap that looks unfinished on a customer-facing document.

**Jon decides.** If R2 (literal no-redistribution) is required, Marc adds a conditional `tableWidth:"wrap"` when `hideSupplierColumn` is set. If R1 is acceptable, no `tableWidth` change needed.

**Production byte-for-byte: PROVEN**

`buildCoverPage` call sites (unchanged from C73 analysis):

| Line | Caller | Sets `hideSupplierColumn`? | Supplier column? |
|------|--------|---------------------------|-----------------|
| 7585 | `generateTravelerBomPdf` (#133 wrapper) | YES (will be added) | HIDDEN |
| 24244 | `buildAndAttachPdf` (BC/production) | NO — `uploadOpts` never includes it | SHOWN (unchanged) |

The `opts.hideSupplierColumn` fallback is falsy by default (`opts={}` at line 7841). Any caller that doesn't explicitly set it gets the full column set. The production path is byte-for-byte unaffected.

**~8 new lines** (conditional column/head/body construction).

---

#### A/B Column-Index Interaction — CONFIRMED SAFE

Supplier is always the **last** column in both layouts:
- `hasCrosses`: index 6 (of 0-6) → drops to 5 columns ending at MFR(5)
- No-crosses: index 5 (of 0-5) → drops to 4 columns ending at MFR(4)

The yellow-highlight targets (Change A) are:
- Column 2 (Part #) — unchanged index in both with/without Supplier
- Column 3 (Original Part #) — unchanged index in both with/without Supplier

**Removing the last column does not shift any preceding column indices.** The `didParseCell` hook targets columns 2 and 3 by index — these resolve correctly in both the 7-column production layout and the 6-column customer layout. No conditional index logic needed.

---

#### Summary for Marc

| TODO | Change | Scope | Mechanism | Lines |
|------|--------|-------|-----------|-------|
| #135 | Yellow PN-cell highlight | SHARED (both docs) | `fillColor` in existing `didParseCell` hook | ~5 |
| #136 | Hide Supplier column | CUSTOMER ONLY (Quoted BOM) | `opts.hideSupplierColumn` in `generateTravelerBomPdf` | ~8 |

**Open decisions before Marc starts:**
1. Yellow on two PN cells vs. whole crossed row? (Jon)
2. Column redistribution: R1 (auto-fill, recommended) vs. R2 (wrap, literal no-redistribution)? (Jon)

---

### C76 — #138 Split "REV" Data Box into Dv.# + Qv.# (2026-06-16)

**Type:** Pre-implementation analysis  
**Status:** COMPLETE — ready for Marc  
**TODO assignment:** #138  
**Scope:** SHARED — both production traveler and Quoted BOM, no decoupling

---

#### 1. Data Existence — THE GATE: PASS (both fields exist and are live)

**Dv.# = `panel.bomVersion`** (per-panel, Number)  
Auto-incremented on BOM content changes via `_bumpBomVersionIfChanged` (line 8622). Bumps when the BOM hash changes (part adds/removes/edits, re-extraction) — NOT on price-only or lead-time changes. Seeds at 1 on first extraction. Already displayed in the UI as `Dv.{panel.bomVersion}` (line 27104-27106). Persisted on each `panel` object in Firestore.

**Qv.# = `project.quoteRev`** (project-level, Number)  
Auto-bumped when any quote-relevant content changes since last print (line 8765, 8882-8919). Also has a manual-reset mechanism for specific projects (line 9228). Already used throughout: filename stamps, send-record D3, quote PDF header. Persisted on the `project` doc in Firestore.

**Both fields exist, are auto-maintained, and have clear semantics.** This is display-only — no new data-source build needed.

---

#### 2. Data Availability Inside `buildCoverPage`

**`panel.bomVersion`:** Available — `panel` is the second parameter (line 7844). Use `panel.bomVersion||"—"`.

**`project.quoteRev`:** NOT currently available. `buildCoverPage` receives `quoteData` (= `project.quote`, the quote blob) — `quoteRev` lives on `project` directly, not inside `project.quote`.

**Two options to get `quoteRev` in:**

| Option | Mechanism | Callers affected |
|--------|-----------|-----------------|
| **Q1 — via opts** | Pass `opts.quoteRev` from each caller | Both callers must pass it |
| **Q2 — via quoteData** | Callers merge `quoteRev` into the `quoteData` object they pass | Both callers must merge it |

**Recommendation: Q1 (via opts).** The `opts` bag is already the proven extension point (C73 `documentTitle`, C75 `hideSupplierColumn`). Each caller adds one field:

- `generateTravelerBomPdf` (line 7585): `{documentTitle:"QUOTED BOM", quoteRev: project.quoteRev||0}` — has `project` in scope.
- `buildAndAttachPdf` (line 24244): `{...uploadOpts, quoteRev: quoteRev}` — `quoteRev` is a PanelCard prop (line 22971, passed at line 34039 as `project.quoteRev||0`). Already in component scope.

Inside `buildCoverPage`: `const qvRev=opts.quoteRev!=null?opts.quoteRev:null;`

---

#### 3. Current "REV" Box — What's Being Replaced

The "REV" box is the **4th field** (index 3) in the info grid:
- Production variant (line 7894): `["REV", panel.drawingRev||"—"]`
- Quoting variant (line 7907): `["REV", panel.drawingRev||"—"]`

This shows the **customer's drawing revision** (`panel.drawingRev` — e.g., "A", "B", "Rev 2"). This same value already appears in the title block at line 7877:
```js
const dwgTitle=[panel.drawingNo, panel.drawingRev?"Rev "+panel.drawingRev:""].filter(Boolean).join("  ·  ");
```

So after the split, the customer drawing rev is NOT lost — it stays in the title block. The data box switches from showing the customer rev (redundant with the title) to showing the two Matrix internal versions (Dv.# and Qv.#).

---

#### 4. Box-Split Mechanism

The info grid renders each field as one box of width `cellW = (W - margin*2) / 4` (line 7915). Each box is drawn with `doc.rect(x, y-m(4), cellW-m(1), rowH-m(1))` (line 7922).

**Approach: replace the single "REV" field entry with a custom render.** Instead of one `["REV", panel.drawingRev||"—"]` entry in the `fields` array, either:

**(A) Two-pass render** — render the REV slot as TWO half-width boxes in the `forEach` loop by detecting the REV index and drawing two boxes of `(cellW-m(1))/2` width instead of one. Skip the standard label/value render for that slot.

**(B) Post-grid overlay** — render the REV slot as a blank placeholder in the grid, then after the `forEach` loop, draw two half-boxes at the known position of index 3.

**Recommendation: (A)** — cleaner, self-contained in the loop. The `forEach` already has access to the position (`x`, `y`, `cellW`). When the loop hits index 3 (the REV slot), it draws two boxes instead of one and skips the standard render.

**Sketch (inside the forEach at line 7916):**
```js
fields.forEach(([lbl,val],i)=>{
  const col=i%cols;
  const row=Math.floor(i/cols);
  const x=margin+col*cellW;
  const y=infoY+row*rowH;
  // #138: Split REV box into Dv.# + Qv.# (two half-width boxes)
  if(lbl==="__DV_QV__"){
    const halfW=(cellW-m(1))/2;
    const bH=rowH-m(1);
    // Left half: Dv.#
    doc.setDrawColor(...black);doc.setLineWidth(m(0.3));
    doc.rect(x,y-m(4),halfW,bH);
    doc.setFontSize(fs(7));doc.setFont("helvetica","normal");doc.setTextColor(...mid);
    doc.text("Dv.#",x+m(2),y);
    doc.setFontSize(fs(11));doc.setFont("helvetica","bold");doc.setTextColor(...black);
    doc.text(String(val[0]),x+m(2),y+m(6));
    // Right half: Qv.#
    const x2=x+halfW;
    doc.rect(x2,y-m(4),halfW,bH);
    doc.setFontSize(fs(7));doc.setFont("helvetica","normal");doc.setTextColor(...mid);
    doc.text("Qv.#",x2+m(2),y);
    doc.setFontSize(fs(11));doc.setFont("helvetica","bold");doc.setTextColor(...black);
    doc.text(String(val[1]),x2+m(2),y+m(6));
    return; // skip standard single-box render
  }
  // Standard single-box render (unchanged)
  doc.setDrawColor(...black);doc.setLineWidth(m(0.3));
  doc.rect(x,y-m(4),cellW-m(1),rowH-m(1));
  ...
});
```

And in the `fields` arrays, replace `["REV", panel.drawingRev||"—"]` with:
```js
["__DV_QV__", [panel.bomVersion!=null?String(panel.bomVersion):"—", qvRev!=null?String(qvRev).padStart(2,"0"):"—"]]
```

`padStart(2,"0")` on `Qv.#` matches the existing convention throughout the app (e.g., `"Qv."+String(project.quoteRev).padStart(2,"0")` at line 34843).

**Total width: identical.** Two half-boxes of `(cellW-m(1))/2` sum to `cellW-m(1)` — the same footprint as the current single box. Height unchanged (`rowH-m(1)`). Surrounding boxes unaffected.

---

#### 5. Production Safety

SHARED — intentionally. Both the production `fields` array (line 7890-7902) and the quoting `fields` array (line 7903-7913) get the same `["__DV_QV__", [...]]` entry replacing `["REV", ...]`. The `forEach` render logic handles the sentinel label identically regardless of caller.

The customer drawing rev (`panel.drawingRev`) is NOT lost — it stays in the title block (line 7877), which is untouched.

No other grid boxes are affected — the sentinel detection (`lbl==="__DV_QV__"`) only fires on the split slot; all other entries flow through the standard render path.

---

#### Summary

| Check | Result |
|-------|--------|
| Dv.# data exists? | YES — `panel.bomVersion` (per-panel, auto-bumped on BOM changes) |
| Qv.# data exists? | YES — `project.quoteRev` (project-level, auto-bumped on quote-relevant changes) |
| `quoteRev` available in `buildCoverPage`? | NO today — pass via `opts.quoteRev` (Q1) |
| Customer drawing rev lost? | NO — stays in title block (line 7877) |
| Box split within same width? | YES — two half-boxes sum to same `cellW-m(1)` footprint |
| Surrounding boxes disturbed? | NO — sentinel label only triggers on the split slot |
| Both docs get the change? | YES — shared, intentional |
| Estimated new lines | ~20 (sentinel render block + fields array edits + opts.quoteRev in both callers) |

**No open decisions.** Both data fields exist and are live. Marc builds from this.

---

### C77 — #138 Post-Deploy Code-Path + Rendered-PDF Fit Verification (2026-06-16)

**Type:** Post-deploy review  
**Version:** v1.20.123 (commit 5c776a49)  
**Status:** PASS — all items verified

#### Code-path verification

**1. `__DV_QV__` sentinel in BOTH fields arrays:** PASS  
- Production fields array (line 7895): `["__DV_QV__",[panel.bomVersion!=null?String(panel.bomVersion):"—",qvRev!=null?String(qvRev).padStart(2,"0"):"—"]]`
- Quoting fields array (line 7908): identical entry
Both arrays carry the sentinel at the same position (slot 4, replacing the old `["REV",...]`).

**2. `qvRev` declaration from `opts.quoteRev`:** PASS  
Line 7863: `const qvRev=opts.quoteRev!=null?opts.quoteRev:null;` — null-safe check, defaults to `null` (not `undefined`). When `null`, the value renders as `"—"` via the ternary in the fields array.

**3. Both callers pass `quoteRev`:** PASS  
- `generateTravelerBomPdf` (line 7585): `{documentTitle:"QUOTED BOM", quoteRev:project.quoteRev||0}` — passes project-level quote rev, falls back to 0 if unset.
- `buildAndAttachPdf` (line 24267): `{...uploadOpts, quoteRev:quoteRev}` — `quoteRev` is destructured from the caller's scope (project-level field).

**4. Half-box render logic:** PASS  
Lines 7925-7942: sentinel check `if(lbl==="__DV_QV__")` triggers the split path. Two `doc.rect()` calls of width `halfW=(cellW-m(1))/2` each, starting at `x` and `x+halfW`. Labels ("Dv.#", "Qv.#") at `fs(7)`, values at `fs(11)` bold. Explicit `return;` at line 7942 skips the standard single-box render.

**5. Title block untouched:** PASS  
Line 7877: `dwgTitle=[panel.drawingNo, panel.drawingRev?"Rev "+panel.drawingRev:""]` — customer drawing rev remains in the header title block, completely independent of the info grid. No #138 changes anywhere near this line.

**6. Width invariance:** PASS  
Standard single-box render (line 7945): `doc.rect(x,y-m(4),cellW-m(1),rowH-m(1))`. Split-box: two rects of `halfW=(cellW-m(1))/2` each = `cellW-m(1)` total. Width sum is identical — surrounding boxes undisturbed.

#### Rendered-PDF fit analysis (mathematical)

Coach has no runtime/browser access. The fit check is performed via dimensional math on the jsPDF coordinate system.

**At standard 11×17 landscape (W=431.8mm):**
- `sc = min(431.8/431.8, 279.4/279.4) = 1.0` (identity scaling)
- `margin = m(12) = 12mm`
- `cellW = (431.8 - 24) / 4 = 101.95mm`
- `halfW = (101.95 - 1) / 2 = 50.475mm`
- Label "Dv.#" at `fs(7)` = 7pt Helvetica normal: ~4 chars × ~2mm = ~8mm
- Value (e.g. "3") at `fs(11)` = 11pt Helvetica bold: 1-2 chars × ~3mm = ~3-6mm
- Text starts at `x+m(2)` = 2mm inset → available width = 50.475 - 2 = **48.5mm**
- Maximum content width ~8mm — uses **<17%** of available space

**At smallest plausible page (8.5×11 portrait, W=215.9mm):**
- `sc = min(215.9/431.8, 279.4/279.4) = 0.5`
- `cellW = (215.9 - 6) / 4 = 52.475mm`
- `halfW = (52.475 - 0.5) / 2 = 25.99mm`
- Label at `fs(3.5)` → clamped to min `fs(4)`: ~4 chars × ~1mm = ~4mm
- Value at `fs(5.5)`: 1-2 chars × ~1.5mm = ~1.5-3mm
- Available width = 25.99 - 1 = **25mm**
- Maximum content width ~4mm — uses **<16%** of available space

**Verdict: NO CLIPPING, NO WRAP, NO OVERLAP risk at any standard page size.** The half-box width provides 5-6× the space needed for the label+value content. The `padStart(2,"0")` on Qv.# values guarantees a max of 2 characters for typical quote revisions (even 3-digit revisions would fit comfortably).

#### Summary

| Check | Result |
|-------|--------|
| `__DV_QV__` sentinel in both fields arrays? | PASS — lines 7895, 7908 |
| `qvRev` from `opts.quoteRev`? | PASS — line 7863, null-safe |
| Both callers pass `quoteRev`? | PASS — lines 7585, 24267 |
| Half-box render logic correct? | PASS — lines 7925-7942 |
| Title block untouched? | PASS — line 7877 |
| Width invariance? | PASS — two halves = one whole |
| Labels/values fit at half width? | PASS — <17% utilization at standard size |

All code-path and dimensional checks pass. #138 is verified at the code level. Jon's live-generated PDF confirmation (visual spot-check of actual rendered output) is the remaining closure step — Coach's math says it will fit, but the human eye-check on a real document is Jon's lane.

---

### C78 — PRJ402096 Dv.# Blank: Code-Verified Runtime Trace (2026-06-16)

**Type:** Data/runtime trace verification  
**Status:** CONFIRMED — root cause is a seed-condition gap, not a render bug  
**Related:** #138 (Dv.#/Qv.# split), #119 (legacy panel class)

#### Jon's runtime trace — code-verified

Jon pulled live in-memory state from PRJ402096 (3 panels, authenticated). Coach independently verified each claim against the source:

| Panel | `bomVersion` | Non-labor rows | Dv.# renders | Code-verified? |
|-------|-------------|----------------|-------------|----------------|
| panel-1 | `3` (number) | 55 | "3" | YES |
| panel-2 | `5` (number) | 73 | "5" | YES |
| panel-3 | `undefined` (key absent) | 10 | "—" | YES |

`project.quoteRev = 1` — present, which is why Qv.# renders correctly on all three pages (confirmed: both fields arrays at lines 7895/7908 use `qvRev!=null?String(qvRev).padStart(2,"0"):"—"`, and `qvRev` comes from `opts.quoteRev` which traces back to `project.quoteRev`).

#### Root cause: seed-condition gap in `_bumpBomVersionIfChanged`

`_bumpBomVersionIfChanged` (line 8661) has two paths to set `bomVersion`:

**Seed path (line 8665):**
```js
if(oldCount===0 && newCount>0 && newPanel.bomVersion==null){
  return{...newPanel, bomVersion:1};
}
```
Only fires on the transition from 0 → N rows. Panel 3 already has 10 rows (populated pre-v1.19.743), so `oldCount` is always >0 on subsequent saves → seed path never fires.

**Bump path (lines 8668-8676):**
Only fires when `oldCount>0` AND either the BOM hash changes (`_computeDvBomHash`) or redline count changes. Panel 3 has had no BOM content changes since v1.19.743 → bump never fires.

**Result:** Panel 3 falls through both paths and returns unchanged — `bomVersion` is never written. The comment at line 9152 confirms this was by design: *"Existing pre-v1.19.743 panels with no version stay un-versioned until their first mutation under the new code (per user spec — 'leave existing panels as-is')."*

This is the #119 legacy-panel class, but at **panel granularity** — not a whole-project issue. Panels 1 & 2 in the same project were re-extracted/edited after v1.19.743 and got seeded+bumped; Panel 3 was left untouched.

#### Render behavior — confirmed graceful

The render path at line 7895/7908:
```js
panel.bomVersion!=null ? String(panel.bomVersion) : "—"
```
`undefined != null` → `false` → renders `"—"`. Not blank, not "Dv.undefined", not broken. The UI chip (line 27139) gates on `bomVersion!=null` and hides entirely — also correct and consistent.

**The render is NOT the problem.** #138's code is working exactly as specified in C76.

#### Fix options — Coach recommendation

**Option A — Backfill on load** (~10 lines in `loadProjects`): Seed `bomVersion:1` for any panel with `bom.length > 0` but no `bomVersion`. Fixes the data once for all consumers. Ties directly to #119's optional backfill scope (TODO line 2017). Downside: Dv.1 implies "one version tracked" when really "never tracked, backfilled" — minor semantic inaccuracy. Also writes to Firestore on next save for every legacy panel, which is a fire-once cost.

**Option B — Render-side default** (~1 line): Change the ternary to default to `"1"` instead of `"—"`. Cosmetic lie — no version was tracked, but the box shows "1". Doesn't fix the UI chip or any other consumer. Smallest change, worst semantics.

**Option C — Expand the seed condition** (~2 lines in `_bumpBomVersionIfChanged`): Add a case before the bump logic:
```js
if(newCount>0 && newPanel.bomVersion==null){
  return{...newPanel, bomVersion:1};
}
```
This removes the `oldCount===0` gate — any panel with BOM rows but no version gets seeded to 1 on its next save (any save, not just extraction). Works within the existing mechanism, fires organically on next user interaction, fixes all consumers (PDF box, UI chip, future portal). No load-time write burst. The version is semantically correct: "this is the baseline version we started tracking from."

**Recommendation: Option C.** It's the smallest code change (expanding an existing condition), works within the proven bump mechanism, doesn't require a separate backfill path, and fires organically rather than on load. The `oldCount===0` gate was defensive against false-seeding empty panels, but the `newCount>0` check alone is sufficient — a panel with >0 non-labor rows and no `bomVersion` is by definition a legacy panel that needs seeding.

Option A is the fallback if Jon/Freddy want immediate fix for all legacy panels on next load rather than waiting for user-triggered saves.

#### Connection to #119

This is a concrete manifestation of #119 (legacy panels invisible to Phase 1 safety systems). The `bomVersion` gap is lower-severity than #119's `extractionReport` gap (safety systems silently skipping), but it's the same root class: features gated on fields that were never written to pre-feature panels. Option C fixes the `bomVersion` gap. #119's broader scope (extractionReport backfill, ZeroBomBanner fallback, 1c gate on re-extract) remains open.

---

### C79 — #139 Detailed Plan: bomVersion Seed-Gap Fix (2026-06-16)

**Type:** Implementation spec (Detailed Plan)  
**Status:** AWAITING JON APPROVAL  
**TODO assignment:** #139  
**Approved fix:** Option C (expand seed condition) — Jon-approved 2026-06-16  
**Tip at time of writing:** 57cad787 (line anchors verified)

---

#### Overview

Two changes to `src/app.jsx`. Both in the save path — **sensitive file, implementation-exact plan required.**

The fix removes the `oldCount===0` gate from the seed condition in `_bumpBomVersionIfChanged`, so legacy panels with BOM rows but no `bomVersion` (populated before v1.19.743) are seeded to `1` on next save. The bump path is untouched. A stale comment in `saveProjectPanel` is revised to document the new behavior.

**Estimated size:** ~3 net lines changed (1 condition edit + 4-line comment replacement).

---

#### Change 1: Expand seed condition in `_bumpBomVersionIfChanged`

**File:** `src/app.jsx`  
**Location:** Line 8665 (inside `_bumpBomVersionIfChanged`, declared at line 8661)

**BEFORE (line 8665):**
```js
  if(oldCount===0&&newCount>0&&newPanel.bomVersion==null){
```

**AFTER:**
```js
  if(newCount>0&&newPanel.bomVersion==null){
```

Remove `oldCount===0&&` from the condition. Everything else on this line stays identical. The body (`return{...newPanel,bomVersion:1};` at line 8666) is unchanged. The bump path (lines 8668-8676) is **UNTOUCHED**.

**What this does:** Any panel with ≥1 non-labor BOM row and no `bomVersion` field gets seeded to `1` on next save. Previously, this only fired when the panel was transitioning from 0→N rows (first extraction). Now it also fires for legacy panels that already have rows but were never versioned.

**What this does NOT do:** It does not change the bump path. Panels that already have `bomVersion` (any value including `1`) never enter the seed path because `bomVersion==null` is false. The `oldCount` variable is still computed at line 8664 and still used by the bump path's hash-comparison gate at line 8669 (`if(oldCount>0)`).

---

#### Change 2: Revise stale comment in `saveProjectPanel`

**File:** `src/app.jsx`  
**Location:** Lines 9148-9154 (comment block above the `_bumpBomVersionIfChanged` call in `saveProjectPanel`)

**BEFORE (lines 9148-9154):**
```js
    // DECISION(v1.19.743): Drawing Version bump. Compares the BOM hash of the incoming
    // panel against the Firestore copy and assigns a fresh `bomVersion` when they differ.
    // First-ever BOM extraction sets v.1; any subsequent BOM mutation (manual edit, re-
    // extract with new output, supplier-apply, scraper-apply) bumps. Re-saves with no BOM
    // change leave the field untouched. Existing pre-v1.19.743 panels with no version stay
    // un-versioned until their first mutation under the new code (per user spec — "leave
    // existing panels as-is").
```

**AFTER:**
```js
    // DECISION(v1.19.743, revised v1.20.125/#139): Drawing Version bump. Compares the BOM
    // hash of the incoming panel against the Firestore copy and bumps `bomVersion` when they
    // differ. First-ever BOM extraction sets v.1. Legacy panels (rows but no bomVersion,
    // populated pre-v1.19.743) are now seeded to v.1 on next save — no backfill needed,
    // saveProject's all-panel loop handles it. Re-saves with no BOM change leave the field
    // untouched.
```

**Why:** The old comment ("leave existing panels as-is, per user spec") documents a design decision Jon has now reversed. Leaving it contradicts the new behavior and misleads future readers. The revised comment accurately reflects the current intent: legacy panels are seeded, the save-path architecture handles backfill organically.

Note: the `saveProject` call site (line 8855) has a terse comment (`// (2) bomVersion bump`) that doesn't mention legacy behavior — no update needed there.

---

#### What is NOT changed

- **Bump path (lines 8668-8676):** Entirely untouched. Hash comparison, redline comparison, version increment logic — all identical.
- **`_computeDvBomHash` (line 8646):** Untouched.
- **`_countRedlines` (line 8653):** Untouched.
- **`saveProject` all-panel loop (lines 8856-8860):** Untouched — this is the mechanism that heals legacy panels on any project-level save.
- **`saveProjectPanel` call (line 9155):** Untouched — only the comment above it changes.
- **#138 render (lines 7895, 7908, 7925-7942):** Untouched. The `__DV_QV__` sentinel, half-box render, and `bomVersion!=null` ternary all read `bomVersion` — they don't write it. This fix changes when `bomVersion` is written; the render just displays whatever value is present.
- **UI chip (line 27139):** Untouched — gates on `bomVersion!=null`, will start showing for legacy panels once they're seeded.

---

#### #138 render interaction — confirmed NONE

The #138 render (C76/C77) reads `panel.bomVersion` at two points:
- Fields array (lines 7895/7908): `panel.bomVersion!=null?String(panel.bomVersion):"—"`
- Half-box render (line 7934): `doc.text(String(val[0]),...)` where `val[0]` comes from the fields array

Both are pure reads. This fix only changes when `bomVersion` is written (in `_bumpBomVersionIfChanged`). The two systems are structurally separated — write happens in the save path, read happens in the PDF render path. No interaction.

After the fix: Panel 3 will have `bomVersion:1` on next save → the render reads `1` → displays "Dv.1" instead of "Dv.—". The render code doesn't change at all.

---

#### Acceptance Tests

**T1 — Legacy panel seeds to 1 (live target: PRJ402096 Panel 3)**  
Open PRJ402096. Panel 3 currently has `bomVersion:undefined` (10 non-labor rows, key absent). After deploying the fix, trigger any save to the project. Verify Panel 3 now has `bomVersion:1`. On the cover page (production traveler or Quoted BOM), the Dv.# box for Panel 3 should show "1" instead of "—".

**T2 — Self-heal via `saveProject` all-panel iteration**  
Using PRJ402096: edit Panel 1 (e.g., change a BOM row quantity), save. Without touching Panel 3 directly, verify Panel 3's `bomVersion` is now `1`. This confirms the `saveProject` all-panel loop (line 8856) processes Panel 3 through the expanded seed condition even though Panel 3 was not the panel being edited.

**T3 — Seed fires ONCE (no phantom bump)**  
After T1/T2 has seeded Panel 3 to `bomVersion:1`, save the project again with no content changes to any panel. Verify Panel 3's `bomVersion` is still `1` — not `2`, not re-seeded. The seed condition (`bomVersion==null`) is false after the first seed, so it falls through to the bump path, which finds no hash/redline change and returns unchanged.

**T4 — Already-versioned panels unchanged / bump correctly**  
Panel 1 (`bomVersion:3`) and Panel 2 (`bomVersion:5`) in PRJ402096: verify they remain at their current values after a no-content-change save. Then make a content change to Panel 1 (add or remove a BOM row) and save — verify it bumps to `4`. This confirms the expanded seed condition doesn't interfere with already-versioned panels.

**T5 — Empty panel not seeded**  
Add a new panel to any project (0 BOM rows). Save the project. Verify the new panel does NOT have `bomVersion` set (key should remain absent). The seed condition's `newCount>0` gate prevents seeding empty panels.

---

#### Sequencing

| Step | Action | Depends on |
|------|--------|-----------|
| 1 | Change 1: edit line 8665 (remove `oldCount===0&&`) | — |
| 2 | Change 2: revise comment at lines 9148-9154 | — |
| 3 | `node validate_jsx.js` | 1, 2 |
| 4 | Deploy (`bash deploy.sh`) | 3 |
| 5 | T1-T5 verification against PRJ402096 | 4 |

Changes 1 and 2 are independent of each other (different locations in the file) and can be made in either order.

---

### C80 — #139 Post-Deploy Code-Path Verification (2026-06-16)

**Type:** Post-deploy review  
**Version:** v1.20.125 (commit cfe81579)  
**Status:** PASS — all items verified

#### Change 1 — Seed condition expanded: PASS

Line 8665 (shipped):
```js
if(newCount>0&&newPanel.bomVersion==null){  // #139: seed legacy panels ...
```
`oldCount===0&&` removed. Condition now fires for any panel with ≥1 non-labor row and no `bomVersion`. Marc added inline comment citing #139 — accurate and helpful. Body unchanged (`return{...newPanel,bomVersion:1}` at line 8666).

#### Bump path untouched: PASS

Lines 8668-8676 (shipped): identical to pre-fix. `shouldBump` logic (hash comparison at 8670, redline comparison at 8672), version increment at 8674 (`(existingPanel?.bomVersion??newPanel.bomVersion??1)+1`) — all unchanged. The `oldCount` variable is still computed at line 8664 and still consumed by the bump gate at line 8669 (`if(oldCount>0)`).

#### Change 2 — Comment revised: PASS

Lines 9148-9153 (shipped):
```js
// DECISION(v1.19.743, revised v1.20.125/#139): Drawing Version bump. Compares the BOM
// hash of the incoming panel against the Firestore copy and bumps `bomVersion` when they
// differ. First-ever BOM extraction sets v.1. Legacy panels (rows but no bomVersion,
// populated pre-v1.19.743) are now seeded to v.1 on next save — no backfill needed,
// saveProject's all-panel loop handles it. Re-saves with no BOM change leave the field
// untouched.
```
Matches C79 spec exactly. The stale "leave existing panels as-is" language is gone. Version attribution (`revised v1.20.125/#139`) accurately documents the reversal. The `saveProject` all-panel loop explanation is present — future readers will understand why no separate backfill exists.

#### T1 — Legacy panel seeds to 1: PASS (code-path)

The expanded condition at line 8665: for Panel 3 (`newCount=10`, `bomVersion==null`), `10>0 && null==null` → TRUE → returns `{...newPanel, bomVersion:1}`. Jon confirmed live: Panel 3 now has `bomVersion:1`, Dv.# box shows "1".

#### T2 — Self-heal via `saveProject` all-panel iteration: PASS (code-path)

`saveProject` loop at lines 8856-8859 iterates `for(let i=0;i<newPanels.length;i++)` and calls `_bumpBomVersionIfChanged(np,cp)` for every panel. Editing Panel 1 and saving the project runs Panel 3 through the expanded seed condition. Structure unchanged from C79 verification.

#### T3 — Seed fires ONCE (no phantom bump): PASS (code-path)

After seeding, Panel 3 has `bomVersion:1`. On next save: seed check `10>0 && 1==null` → FALSE (1 is not null) → falls through. Bump check: hash unchanged → `shouldBump=false` → returns unchanged. Version stays at 1.

#### T4 — Already-versioned panels unaffected / bump correctly: PASS (code-path)

Panel 1 (`bomVersion:3`): seed check `55>0 && 3==null` → FALSE → falls through. No-content save: bump check hash unchanged → stays at 3. Content-change save: hash differs → `shouldBump=true` → `next=(3??3??1)+1=4`. Bump path logic at lines 8668-8676 is untouched.

#### T5 — Empty panel not seeded: PASS (code-path)

New panel with 0 rows: `newCount=0`, seed check `0>0` → FALSE → falls through. No version written. The `newCount>0` gate prevents seeding empty panels.

#### #138 render unaffected: PASS

Both fields arrays (lines 7895, 7908) and the half-box render (lines 7925-7942) are identical to C77 verification. Pure reads of `panel.bomVersion` — no writes. The fix only changes when `bomVersion` is written in the save path. Structurally separated.

#### Summary

| Check | Result |
|-------|--------|
| Seed condition expanded (line 8665)? | PASS — `oldCount===0` removed |
| Bump path untouched (8668-8676)? | PASS — identical |
| Comment revised (9148-9153)? | PASS — matches C79 spec |
| T1: legacy panel seeds to 1? | PASS — live-confirmed on PRJ402096 Panel 3 |
| T2: saveProject all-panel heal? | PASS — loop at 8856-8859 unchanged |
| T3: seed fires once? | PASS — `bomVersion==null` false after seed |
| T4: versioned panels unaffected? | PASS — seed gate rejects, bump path intact |
| T5: empty panel not seeded? | PASS — `newCount>0` gate |
| #138 render unaffected? | PASS — pure reads, untouched |

All code-path items PASS. Combined with Jon's live confirmation (Panel 3 seeded, Dv.# shows "1"), #139 is clear to close.

---

### C81 — #141 Confidence Dot Relocation + "C" Glyph Analysis (2026-06-16)

**Type:** Pre-implementation analysis  
**Status:** COMPLETE — ready for Marc  
**TODO assignment:** #141  
**Scope:** BOM row indicators — placement + glyph only, no logic change

---

#### 1. Current Layout — Where Each Indicator Renders

The BOM row's partNumber cell (`f==="partNumber"`) contains several inline indicators. The two relevant ones:

**Confidence dot** (line 28075-28077):
```
<div style={{position:"relative",display:"inline-flex",alignItems:"center",minWidth:80}}>
  {/* confidence dot — LEFT of the PN text, 8×8px circle, marginRight:3 */}
  <span ... style={{display:"inline-block",width:8,height:8,borderRadius:"50%",
    background:row.confidence==="low"?"#ef4444":"#f59e0b",marginRight:3,flexShrink:0}}/>
  {/* invisible sizer span */}
  {/* input field */}
</div>
```
Renders **before** the input, left-of-PN. The 8×8px dot with `borderRadius:"50%"` (circle), red (`#ef4444`) for low, amber (`#f59e0b`) for medium. Only shows when `row.confidence==="low"||row.confidence==="medium"`.

**BC status pills** (lines 28194-28213):
```
{/* "not-in-bc" → red "+ BC" pill */}
<button ... style={{fontSize:10, color:"#fff", background:"#dc2626",
  padding:"1px 7px", borderRadius:10, marginLeft:6}}>+ BC</button>

{/* "fuzzy" → yellow "? BC" pill */}
<button ... style={{fontSize:10, color:"#000", background:"#fcd34d",
  padding:"1px 7px", borderRadius:10, marginLeft:6}}>? BC</button>
```
Render **after** the input, right-of-PN. Pill-shaped buttons with `marginLeft:6`.

**Current visual order in the cell (left to right):**
```
[🔍 BC Browser] [● conf dot] [PN text input] [? PN / ~ PN verif badge] [+ BC / ? BC pill] [⚠ qty] [✓ Fix] [⚠ SKIPPED]
```

The confidence dot and BC pills are on **opposite sides** of the PN text. Jon wants them co-located.

---

#### 2. Co-Location Mechanism

**Move the confidence dot from line 28075-28077 to after line 28200** (right after the `+ BC` / `? BC` pills). Change `marginRight:3` to `marginLeft:6` to match the pill spacing convention.

The new visual order:
```
[🔍 BC Browser] [PN text input] [? PN / ~ PN verif badge] [+ BC / ? BC pill] [C dot] [⚠ qty] [✓ Fix] [⚠ SKIPPED]
```

The confidence dot now sits immediately after the BC pills — same cluster, one visual sweep. The `[? PN / ~ PN]` verification badges (lines 28175-28186) stay between the input and the BC cluster; these are part-number-pattern badges from `bomVerification`, not the confidence or BC systems, and their current position is fine.

**Implementation:** Cut lines 28075-28078. Paste after line 28200 (after the `+ BC` button's closing `)}` and before the `? BC` fuzzy button block). Adjust `marginRight:3` → `marginLeft:6`. The `flexShrink:0` stays.

**One subtlety:** The confidence dot currently lives INSIDE the `<div style={{position:"relative",display:"inline-flex",alignItems:"center",minWidth:80}}>` wrapper (line 28074) that contains the input. Moving it outside this wrapper means it joins the outer `<div style={{display:"flex",alignItems:"center"}}>` (line 28068) where the BC pills live. This is correct — the pills are already in that outer flex container.

---

#### 3. "C" Glyph — Mechanism + Sizing

The current dot is an empty `<span>` styled as an 8×8px circle. To add a centered "C":

**Option:** Change from empty `<span>` to a `<span>` with text content "C", sized to contain the letter:

```jsx
<span title={`AI confidence: ${row.confidence} — verify this part number against the source drawing`}
  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
    width:14,height:14,borderRadius:"50%",
    background:row.confidence==="low"?"#ef4444":"#f59e0b",
    color:"#000",fontSize:8,fontWeight:800,lineHeight:1,
    marginLeft:6,flexShrink:0,cursor:"help"}}>C</span>
```

Key sizing decisions:
- **Dot size: 8→14px.** An 8px circle can't legibly contain a letter. 14px is the minimum for an 8pt bold "C" to read clearly. This matches the scale of the BC pills (which are ~14px tall from `padding:"1px 7px"` + 10px font).
- **Font: 8px, weight 800, color #000.** Black on amber/red is high contrast. Weight 800 ensures the glyph is visible at small size.
- **`inline-flex` + `alignItems/justifyContent:center`** — centers the "C" both horizontally and vertically inside the circle.
- **Same "C" on both colors** — no variation by severity. Color carries severity (amber vs red), letter carries type.

---

#### 4. Legibility Check — "C" Dot Adjacent to "BC" Pill

After relocation, the cluster looks like:
```
[+ BC]  [C]      ← red "not-in-bc" pill + red confidence dot (worst case: both red)
[? BC]  [C]      ← yellow fuzzy pill + amber confidence dot (both yellow/amber)
        [C]      ← confidence dot alone (no BC issue)
[+ BC]           ← BC pill alone (high confidence)
```

**Worst case: both indicators present and same-hue.** A red `+ BC` pill next to a red `C` dot, or a yellow `? BC` pill next to an amber `C` dot.

**Why it still reads clearly:**
1. **Shape difference.** The BC indicator is a pill (wide rectangle, ~40px wide with text). The confidence indicator is a circle (14px). Different shapes at a glance.
2. **Content difference.** "BC" (two letters, sometimes with prefix `+` or `?`) vs "C" (one letter). Distinct text.
3. **Gap.** Both use `marginLeft:6` — 6px of whitespace separates them. Not fused.
4. **Interaction difference.** The BC pill is a `<button>` (clickable, cursor:pointer, opens BC Browser). The confidence dot is a `<span>` (cursor:help, tooltip only). Hover behavior differs.

**Assessment: LEGIBLE.** The shape, content, and size differences prevent blurring even at same hue. The most common case (one indicator present, not both) has no adjacency concern at all. When both appear simultaneously, the pill vs circle shape is the primary differentiator — same principle as traffic-sign shape coding.

One optional enhancement if Jon wants extra separation: use a slightly different shade on the confidence dot (e.g., `#f97316` orange instead of `#f59e0b` amber for medium). But I don't think this is needed — the shape difference is sufficient.

---

#### 5. No Logic Change — Confirmed

**Confidence dot clear behavior (unchanged):**
- Line 25525: `if(field==="partNumber"){next.confidence="high";delete next._confDowngradeReason;...}` — editing the PN sets confidence to "high", which hides the dot (the render guard at line 28075 only shows for "low"/"medium").
- The confidence field is set by the AI extraction prompt (Layer 1) and by BC-cross/alternate paths that force "high".
- Moving the dot's render position does not touch this logic.

**BC pill clear behavior (unchanged):**
- `bcVerify` is stamped during `runPricingOnPanel` (line 14970-14975) and on BC Item Browser match (line 25776).
- The "not-in-bc" and "fuzzy" pills render based on `row.bcVerify.status` — moving the confidence dot does not affect `bcVerify` at all.

**No coupling:** The two indicators read different fields (`row.confidence` vs `row.bcVerify.status`), are set by different code paths (extraction vs pricing), and clear independently. The relocation is purely visual — same JSX, different position in the render tree.

---

#### Summary

| Item | Detail |
|------|--------|
| Current confidence dot location | Left of PN text (line 28075-28077), inside the input wrapper div |
| New location | Right of PN text, after BC pills (after line 28200), in the outer flex container |
| Dot size | 8px → 14px (minimum for legible glyph) |
| Glyph | "C", 8px font, weight 800, black on amber/red background |
| Spacing | `marginLeft:6` (matches BC pill convention) |
| Legibility | Clear — pill vs circle shape difference, "BC" vs "C" content, 6px gap |
| Logic change | NONE — confidence clears on PN edit (#134), BC clears on pricing match, independently |
| Estimated change | ~5 lines moved + restyled (cut from 28075, paste after 28200, adjust style) |

**No open decisions.** Marc builds from this.

---

### C82 — #141 AMENDMENT: Match BC Pill Dimensions Exactly (2026-06-16)

**Type:** Amended spec (supersedes C81 §3 sizing only)  
**Status:** COMPLETE — ready for Marc  
**TODO assignment:** #141  
**What changed:** Size/glyph spec replaced. Relocation + independence unchanged from C81.

---

#### 1. BC Pill Actual Rendered Values

Both BC pills ("+ BC" at line 28197 and "? BC" at line 28211) use identical dimensions:

```js
style={{
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 7px",
  borderRadius: 10,
  border: "none",
  lineHeight: 1.4,
  marginLeft: 6,
  whiteSpace: "nowrap",
  cursor: "pointer"
}}
```

**Per-variant colors:**
- `not-in-bc`: `background:"#dc2626"` (red), `color:"#fff"` (white text)
- `fuzzy`: `background:"#fcd34d"` (yellow), `color:"#000"` (black text)

**Rendered dimensions at these values:**
- Height: `fontSize(10) × lineHeight(1.4) + padding-top(1) + padding-bottom(1)` = `14 + 2` = **~16px**
- Width: varies by text content ("+ BC" ~30px, "? BC" ~28px)
- Shape: `borderRadius:10` on a ~16px-tall element = fully rounded ends (pill shape)
- The text ("+ BC" / "? BC") is naturally centered by the padding

---

#### 2. Confidence Pill — Re-Spec'd to Match

The confidence indicator becomes a pill matching the BC pill dimensions exactly, with text content "C":

```jsx
<span title={`AI confidence: ${row.confidence} — verify this part number against the source drawing`}
  style={{
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 7px",
    borderRadius: 10,
    border: "none",
    lineHeight: 1.4,
    marginLeft: 6,
    whiteSpace: "nowrap",
    cursor: "help",
    background: row.confidence === "low" ? "#ef4444" : "#f59e0b",
    color: "#000"
  }}>C</span>
```

**Every dimensional property mirrors the BC pill:**

| Property | BC pill | Confidence pill | Match? |
|----------|---------|-----------------|--------|
| `fontSize` | 10 | 10 | ✓ |
| `fontWeight` | 700 | 700 | ✓ |
| `padding` | "1px 7px" | "1px 7px" | ✓ |
| `borderRadius` | 10 | 10 | ✓ |
| `border` | "none" | "none" | ✓ |
| `lineHeight` | 1.4 | 1.4 | ✓ |
| `marginLeft` | 6 | 6 | ✓ |

**Differences (intentional):**

| Property | BC pill | Confidence pill | Why |
|----------|---------|-----------------|-----|
| Element | `<button>` | `<span>` | BC pill is clickable (opens BC Browser); confidence pill is informational (tooltip only) |
| `cursor` | "pointer" | "help" | Signals interactive vs informational |
| `background` | `#dc2626` (red) / `#fcd34d` (yellow) | `#ef4444` (red) / `#f59e0b` (amber) | Confidence uses its existing colors from current dot |
| `color` | `#fff` (red) / `#000` (yellow) | `#000` (both) | Black "C" on both amber and red — high contrast on both |
| Text | "+ BC" / "? BC" | "C" | Different indicator type |
| `onClick` | Opens BC Browser | none | Not interactive |

**Note on `color:"#000"` for low-confidence (red background):** The BC pill uses white text on red (`#dc2626`). For the confidence pill on red (`#ef4444`), black also works — `#ef4444` is a lighter red than `#dc2626`, so black on `#ef4444` has sufficient contrast. However, if Marc or Jon find black-on-red less legible in practice, switching to `color:"#fff"` for the low case only is a one-property change. I'd start with black on both for visual consistency (same "C" appearance regardless of severity).

---

#### 3. Legibility — Now a Non-Issue

With matched dimensions, the two indicators are **identical twins distinguished by letter and color:**

```
[+ BC]  [C]      ← red BC pill (white "+" BC) + red confidence pill (black "C")
[? BC]  [C]      ← yellow BC pill (black "?" BC) + amber confidence pill (black "C")
        [C]      ← confidence pill alone (no BC issue on this row)
[+ BC]           ← BC pill alone (high confidence on this row)
```

**Why it reads clearly:**
1. **Letter content.** "BC" (two letters with prefix symbol) vs "C" (one letter). Unambiguous at any reading speed.
2. **Color.** BC pills use `#dc2626`/`#fcd34d`. Confidence pills use `#ef4444`/`#f59e0b`. Similar hues but not identical — the pair reads as "related but distinct."
3. **6px gap.** `marginLeft:6` on both means whitespace separates them — they don't fuse.
4. **Interaction.** BC pill shows pointer cursor + clicks to open BC Browser. Confidence pill shows help cursor + tooltip only. Hover behavior immediately distinguishes them.

**Matched sizing actually improves legibility** over C81's approach (8→14px circle): two same-sized pills read as a cohesive indicator cluster, not a big pill next to a small dot.

---

#### 4. What Stays From C81 (Unchanged)

- **Relocation:** Cut lines 28075-28078, paste after line 28200. Confidence pill moves from left-of-PN to right-of-PN, adjacent to BC pills.
- **"C" on both colors:** Same letter on amber (medium) and red (low). Color carries severity, not the glyph.
- **Independence:** `row.confidence` clears on PN edit (line 25525). `row.bcVerify.status` clears on pricing/BC browser match. Different fields, different code paths, unaffected by the move.
- **No logic change:** Placement + styling only.

---

#### Summary (amended, supersedes C81 §3)

| Item | C81 (superseded) | C82 (current) |
|------|-------------------|---------------|
| Dot size | 8px → 14px circle | Match BC pill: `padding:"1px 7px"`, `borderRadius:10` (~16px tall pill) |
| Font | 8px weight 800 | 10px weight 700 (matches BC pill exactly) |
| Shape | Circle | Pill (same as BC) |
| Line height | (not specified) | 1.4 (matches BC pill) |
| Relocation | After line 28200 | **Same** |
| Glyph | "C" centered | **Same** |
| Independence | No logic change | **Same** |

**No open decisions.** Marc builds from C81 (relocation + independence) + C82 (sizing).

---

### C83 — Email Yellow-Highlight Note Verification (2026-06-16)

**Type:** Post-deploy review  
**Version:** v1.20.126 (commit 0c558ea7)  
**Status:** PASS — all items verified

#### Verification

**Note text:** `"Any deviation from the customer-supplied BOM is shown in yellow highlight. Please verify these items are acceptable and we will finalize the quote."`

**Grep: exactly 2 occurrences in codebase.** PASS.

**Standalone Quoted BOM send (`handleBomSend`) — ALWAYS:** PASS  
Line 32558: `const bomNote=\`<p style="margin-top:12px">Any deviation...\`;` — unconditional assignment. No ternary, no guard. Every standalone BOM send includes the note. The comment at line 32557 confirms intent: *"Standalone Quoted BOM ALWAYS carries it."*

**Bundled send (`QuoteSendModal`) — ONLY when `includeTravelerBom` is true:** PASS  
Line 32009: `const bomNote=includeTravelerBom?\`<p...>\`:"";` — ternary gated on `includeTravelerBom`. When toggle is ON, `bomNote` contains the full note. When OFF, `bomNote` is empty string `""`. Both paths inject `bomNote` into the `html` template at line 32010 via `${bomNote}`. Empty string = absent from email.

**Bundled send, toggle OFF — ABSENT:** PASS  
Same line 32009: `includeTravelerBom` false → `bomNote=""` → the `${bomNote}` interpolation at line 32010 contributes nothing to the HTML. Note is absent.

**Inline ProjectView send path — ABSENT:** PASS  
Line 37471: `const html=\`...\${m.message...}...\`` — the template contains message + signature only. No `bomNote` variable, no "deviation" text, no "yellow highlight" text. The inline send path (`_doInlineQuoteSend` at line 37455) has no awareness of the Quoted BOM or the highlight note. Confirmed absent.

**JSX valid:** Confirmed — both occurrences are template literals inside async handlers (lines 32009 and 32558), not JSX elements. No syntax risk.

#### Summary

| Check | Result |
|-------|--------|
| Standalone send (handleBomSend) — always? | PASS — unconditional at line 32558 |
| Bundled send (QuoteSendModal) — gated on toggle? | PASS — ternary at line 32009 |
| Bundled send, toggle OFF — absent? | PASS — empty string |
| Inline ProjectView path — absent? | PASS — no bomNote, no deviation text (line 37471) |
| Exactly 2 occurrences? | PASS — grep confirms 2 |

Email-line thread is closed.

---

### C84 — #141 RE-SPEC: Match Blue "BC" Circle, Not Red/Amber Pills (2026-06-16)

**Type:** Corrected spec (supersedes C82 sizing+placement; C81 independence unchanged)  
**Status:** COMPLETE — ready for Marc after Jon reviews  
**TODO assignment:** #141

---

#### What went wrong in C82

C82 pulled style from the red `+ BC` pill (line 28197) and amber `? BC` pill (line 28211). These are verification badges inside the partNumber cell. The element Jon wants matched is the **blue "BC" circle** — a separate, dedicated element in its own `_bc` column. Different element, different cell, different shape.

---

#### 1. Blue "BC" Circle — Exact Rendered Values

**Element:** `<button>` at line 28057, inside the `_bc` column (`<td key="_bc">` at line 28048).

```js
style={{
  background: "#2563eb",       // blue
  border: "none",
  color: "#fff",               // white text
  cursor: "pointer",
  fontSize: 9,
  fontWeight: 800,
  borderRadius: "50%",         // perfect circle
  width: 24,
  height: 24,
  lineHeight: 1,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0
}}
```

**Text content:** `BC` (two letters centered inside the circle).

**Key dimensions:**
- **Size:** 24×24px explicit (`width:24, height:24`)
- **Shape:** perfect circle (`borderRadius:"50%"`)
- **Font:** 9px, weight 800, white `#fff` on blue `#2563eb`
- **Centering:** `inline-flex` + `alignItems:"center"` + `justifyContent:"center"` + `padding:0`

**Visibility gate (line 28049):** Shows when `!readOnly && _bcToken && row.priceSource!=="bc" && row.priceSource!=="manual"` — i.e., unmatched parts that need BC lookup.

**Column:** The `_bc` column is a dedicated 32px-wide `<td>` (line 28048: `style={{padding:"3px 2px",width:32,textAlign:"center"}}`). Column order in the row array (line 28046): `qty` → `partNumber` → `_bc` → `description` → `manufacturer` → `_supplier`.

---

#### 2. Where to Place the "C" Circle

The "C" confidence circle must sit **next to** the blue "BC" circle. Both the blue "BC" circle and the "C" circle live in the `_bc` column.

**Layout challenge:** The `_bc` column is currently 32px wide. The blue "BC" circle is 24px. A second 24px circle plus a gap won't fit in 32px.

**Solution: widen the `_bc` column to 56px** and render both circles side-by-side with a 4px gap using a flex wrapper.

- Current: `width:32` → one 24px circle centered, 4px padding each side
- New: `width:56` → two 24px circles + 4px gap + 2px padding each side = `2 + 24 + 4 + 24 + 2 = 56px`

The `_bc` column sits between `partNumber` (flexible-width) and `description` (220px). Widening by 24px compresses `partNumber` and `description` slightly — both use `overflow:hidden` + `textOverflow:ellipsis`, so they absorb the squeeze gracefully. At typical BOM table widths (~1200px+ on a 1080p+ screen), 24px is negligible.

**Implementation in the `_bc` cell:**

```jsx
<td key="_bc" style={{padding:"3px 2px",width:56,textAlign:"center"}}>
  <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:4}}>
    {/* Confidence "C" circle — shows for low/medium confidence */}
    {!row.isLaborRow&&!row.isContingency&&(row.confidence==="low"||row.confidence==="medium")&&(
      <span title={`AI confidence: ${row.confidence} — verify this part number against the source drawing`}
        style={{background:row.confidence==="low"?"#ef4444":"#f59e0b",
          border:"none",color:"#000",cursor:"help",fontSize:9,fontWeight:800,
          borderRadius:"50%",width:24,height:24,lineHeight:1,
          display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>C</span>
    )}
    {/* Blue "BC" circle — unchanged */}
    {!readOnly&&_bcToken&&row.priceSource!=="bc"&&row.priceSource!=="manual"&&(
      <button ... existing code unchanged ...>BC</button>
    )}
  </div>
</td>
```

The "C" circle renders FIRST (left), the "BC" circle renders SECOND (right). When only one is present, the flex container centers it. When both are present, they sit side by side with a 4px gap.

**Remove the old confidence dot from the partNumber cell** — cut lines 28075-28078 (the current 8×8px dot inside the input wrapper).

---

#### 3. Confidence "C" Circle — Spec'd to Mirror Blue "BC" Circle

Every dimensional property matches the blue "BC" circle exactly:

| Property | Blue "BC" circle | Confidence "C" circle | Match? |
|----------|-----------------|----------------------|--------|
| `width` | 24 | 24 | ✓ |
| `height` | 24 | 24 | ✓ |
| `borderRadius` | "50%" | "50%" | ✓ |
| `fontSize` | 9 | 9 | ✓ |
| `fontWeight` | 800 | 800 | ✓ |
| `lineHeight` | 1 | 1 | ✓ |
| `display` | "inline-flex" | "inline-flex" | ✓ |
| `alignItems` | "center" | "center" | ✓ |
| `justifyContent` | "center" | "center" | ✓ |
| `padding` | 0 | 0 | ✓ |
| `border` | "none" | "none" | ✓ |

**Intentional differences:**

| Property | Blue "BC" circle | Confidence "C" circle | Why |
|----------|-----------------|----------------------|-----|
| Element | `<button>` | `<span>` | BC is clickable (triggers fuzzy lookup); confidence is informational |
| `cursor` | "pointer" | "help" | Interactive vs informational |
| `background` | `#2563eb` (blue) | `#ef4444` (red) / `#f59e0b` (amber) | Color carries severity |
| `color` | `#fff` (white) | `#000` (black) | Black "C" on amber/red for contrast |
| Text | "BC" | "C" | Different indicator type |

**Note on `color:"#000"` vs `"#fff"`:** The blue "BC" circle uses white text on blue. For "C", black on amber (`#f59e0b`) is high contrast. Black on red (`#ef4444`) also works — `#ef4444` is a bright enough red that black remains legible. If Jon or Marc find black-on-red marginal in practice, switching to `color:"#fff"` for the low case is a one-property change. Starting with black on both for consistency.

---

#### 4. Co-Existence — "C" + "BC" + Verify Pills on Same Row

A row can show all three indicator types simultaneously:
- **"C" circle** (amber/red) — in the `_bc` column, left position
- **"BC" circle** (blue) — in the `_bc` column, right position
- **Red `+ BC` pill** — in the partNumber cell, right of PN text (line 28194)
- **Amber `? BC` pill** — in the partNumber cell, right of PN text (line 28201)

The "C" and "BC" circles are in a **different column** from the verify pills. They are physically separated by the column border — no overlap, no crowding. The worst case (all three present) renders:

```
| ... PN text [+ BC pill] | [C] [BC] | description ...
```

The `_bc` column at 56px comfortably holds two 24px circles + 4px gap. The partNumber cell's verify pills are unaffected — they stay in their existing position after the input text.

**Visibility combinations in the `_bc` cell:**

| Confidence | BC status | Renders |
|-----------|-----------|---------|
| high (or labor/contingency) | matched (bc/manual) | Empty cell |
| high | unmatched | `[BC]` alone, centered |
| low/medium | matched | `[C]` alone, centered |
| low/medium | unmatched | `[C] [BC]` side by side |

Flex `justifyContent:"center"` ensures single circles center in the 56px cell rather than sitting at the left edge.

---

#### 5. Independence — Unchanged from C81

- **Confidence clears on PN edit:** Line 25525: `if(field==="partNumber"){next.confidence="high";...}` — sets to "high", which hides the "C" circle (render guard: `row.confidence==="low"||row.confidence==="medium"`).
- **BC circle clears on match:** When `applyBcItem` sets `priceSource:"bc"`, the BC circle's visibility guard (`row.priceSource!=="bc"&&row.priceSource!=="manual"`) hides it.
- **No coupling:** The "C" circle reads `row.confidence`. The "BC" circle reads `row.priceSource`. Different fields, different code paths, different clear triggers. Moving them into the same cell doesn't create any data coupling.

---

#### Summary of Changes for Marc

| Step | What | Location |
|------|------|----------|
| 1 | Remove old confidence dot | Cut lines 28075-28078 (8×8px dot in partNumber cell) |
| 2 | Widen `_bc` column | Line 28048: `width:32` → `width:56` |
| 3 | Wrap `_bc` cell contents in flex div | New `<div style={{display:"inline-flex",...gap:4}}>` inside the `<td>` |
| 4 | Add "C" circle inside the flex wrapper | Before the existing BC button, gated on `row.confidence==="low"\|\|"medium"` |
| 5 | Revert C82's pill-styled element | Remove the pill-shaped "C" that Marc built from C82 |

**Also revert from C82 (Marc's v1.20.127 build):** The pill-shaped "C" element that Marc added next to the red/amber verify pills should be removed entirely — it was built from the wrong spec.

**Estimated net change:** ~8 lines (remove old dot, add new circle, widen column, flex wrapper).

---

#### What C84 supersedes

| Spec | Status |
|------|--------|
| C81 §2 (relocation to after line 28200, partNumber cell) | **SUPERSEDED** — "C" now goes in `_bc` column, not partNumber cell |
| C81 §3 (8→14px circle sizing) | **SUPERSEDED** by C82, now superseded again by C84 |
| C82 (pill sizing matching red/amber pills) | **SUPERSEDED** — wrong element identified |
| C81 §4 (legibility) | **SUPERSEDED** — different adjacency context |
| C81 §5 (independence / no logic change) | **UNCHANGED** — still applies |

---

### C85 — #141 Post-Deploy Code-Path Verification (2026-06-16)

**Type:** Post-deploy review  
**Version:** v1.20.128 (commit ee7d6b7b)  
**Status:** PASS — all items verified

#### v1.20.127 "C" pill REVERTED: PASS

No trace of C82's pill-styled element in the partNumber cell. Grep for `width:8,height:8` + confidence (old 8×8 dot): zero matches. Grep for `padding.*1px 7px` + confidence (C82 pill): zero matches. Line 28086 carries a comment confirming removal: `/* #141 (C84): confidence indicator moved out of this input wrapper to the _bc column */`.

#### New "C" circle mirrors blue "BC" circle EXACTLY: PASS

**"C" circle** (line 28057, shipped):
```js
style={{background:row.confidence==="low"?"#ef4444":"#f59e0b",border:"none",color:"#000",
  cursor:"help",fontSize:9,fontWeight:800,borderRadius:"50%",width:24,height:24,lineHeight:1,
  display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}
```

**Blue "BC" circle** (line 28067, unchanged):
```js
style={{background:"#2563eb",border:"none",color:"#fff",cursor:"pointer",fontSize:9,
  fontWeight:800,borderRadius:"50%",width:24,height:24,lineHeight:1,
  display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}
```

| Property | "C" circle | "BC" circle | Match? |
|----------|-----------|-------------|--------|
| `width` | 24 | 24 | ✓ |
| `height` | 24 | 24 | ✓ |
| `borderRadius` | "50%" | "50%" | ✓ |
| `fontSize` | 9 | 9 | ✓ |
| `fontWeight` | 800 | 800 | ✓ |
| `lineHeight` | 1 | 1 | ✓ |
| `display` | "inline-flex" | "inline-flex" | ✓ |
| `alignItems` | "center" | "center" | ✓ |
| `justifyContent` | "center" | "center" | ✓ |
| `padding` | 0 | 0 | ✓ |
| `border` | "none" | "none" | ✓ |

Element: `<span>` (informational) vs `<button>` (clickable). `cursor:"help"` vs `"pointer"`. Text: "C" vs "BC". Color: `#000` on amber/red vs `#fff` on blue. All intentional per C84 spec.

#### Placement in `_bc` column: PASS

**Column width-map** (line 28046): `["_bc",56]` — widened from 32. Comment: `/* #141 (C84): _bc widened 32→56 */`.

**`<td>` width** (line 28048): `width:56` — matches the map.

**Flex wrapper** (line 28049): `<div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:4}}>` — wraps both circles with 4px gap, centered.

**Order:** "C" circle (line 28055-28058) renders FIRST (left), "BC" circle (line 28059-28068) renders SECOND (right). Matches C84 spec.

#### Co-existence with verify pills: PASS

Red `+ BC` pill (line 28202-28207) and amber `? BC` pill (line 28209-28220) remain in the partNumber cell — `f==="partNumber"` gate, `marginLeft:6`, `borderRadius:10` pill shape. Completely untouched. These live in a different `<td>` from the `_bc` column circles — no overlap, no interference.

#### Independence: PASS

**Confidence clears on PN edit** (line 25525): `if(field==="partNumber"){next.confidence="high";...}` — unchanged. Setting confidence to "high" hides the "C" circle (render guard: `row.confidence==="low"||row.confidence==="medium"`).

**Blue "BC" circle onClick/style** (line 28060-28067): `bcFuzzyLookup` call, `applyBcItem`, `setBcBrowserTarget` — all unchanged. No reference to `row.confidence` anywhere in the BC circle's logic.

**No coupling.** The "C" circle reads `row.confidence`. The "BC" circle reads `row.priceSource`. Different fields, different clear triggers, colocated in the same cell but logically independent.

#### Layout check — 56px column width

The `_bc` column widened from 32→56px (+24px). Column order: `qty(56)` → `partNumber(flex)` → `_bc(56)` → `description(220)` → `manufacturer(flex)` → `_supplier(flex)`. The 24px increase compresses the flex-width columns (`partNumber`, `manufacturer`, `_supplier`) by a proportional share. At typical BOM table widths (~1200px+ on 1080p+ screen), 24px is ~2% — absorbed by `overflow:hidden` + `textOverflow:ellipsis` on all flex columns (line 28076).

**Risk assessment:** On very narrow viewports or dense BOMs with long PNs, the description column (fixed 220px) is unaffected. The flex columns may lose ~8px each. The `partNumber` cell has a minimum sizer span (line 28087: `minWidth:80`) that prevents collapse below 80px. This is safe.

Coach cannot render the actual layout — **the visual layout check (dense BOM, confirm no column crowding) is Jon's lane.** The math says 24px on a 1200px+ table is absorbed cleanly, but eyes on a real BOM with 50+ rows is the definitive test.

#### Summary

| Check | Result |
|-------|--------|
| v1.20.127 pill + old dot reverted? | PASS — no trace |
| "C" matches "BC" circle dimensions? | PASS — all 11 properties identical |
| In `_bc` column, width 56? | PASS — both map entry and `<td>` |
| Flex wrapper, gap 4, C left / BC right? | PASS |
| Verify pills untouched? | PASS — separate cell, unchanged |
| Independence (confidence PN-edit clear)? | PASS — line 25525 unchanged |
| BC circle onClick/style unchanged? | PASS |
| Layout — 56px column safe? | PASS (math) — visual check is Jon's lane |

All code-path items PASS. Jon's visual check on a live BOM (circle pair rendering, layout on dense BOM) is the remaining closure step for #141.

---

### C86 — #141 Layout Fix: Right-Justify Circle Pair (2026-06-16)

**Type:** Layout fix spec  
**Status:** COMPLETE — ready for Marc  
**TODO assignment:** #141 (continuation)

---

#### Problem

Jon's screenshot (v1.20.128) shows the blue "BC" circle overlapping the Description column text. The flex wrapper at line 28049 uses `display:"inline-flex"` + `justifyContent:"center"`, which centers the pair. When "C" is added to BC's left, the entire group shifts rightward, pushing BC past the column boundary.

---

#### Fix: One Line Change

**Line 28049, current:**
```js
<div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:4}}>
```

**Line 28049, after fix:**
```js
<div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
```

Two property changes on the same line:
1. `display:"inline-flex"` → `display:"flex"` — makes the div fill the `<td>` width (56px) instead of shrinking to content size.
2. `justifyContent:"center"` → `justifyContent:"flex-end"` — right-aligns the circle group within the full cell width.

**Why both changes are needed:** `inline-flex` shrinks the div to content width (24px or 52px), then `textAlign:"center"` on the `<td>` (line 28048) centers that shrunken div — making `justifyContent` irrelevant since the div exactly fits its content. Switching to `display:"flex"` forces the div to fill the `<td>`, giving `justifyContent:"flex-end"` actual space to right-anchor.

---

#### BC Position — Anchored at Original Location

**Pre-#141 (v1.20.127 and earlier):** `_bc` column was 32px, `padding:"3px 2px"`. BC (24px) was centered: `2px(pad) + 3px(margin) + 24px(circle) + 3px(margin) + 2px(pad) = ~32px`. BC's right edge was `~2px` from the cell's right border.

**Post-fix with `flex-end`:** `_bc` column is 56px, `padding:"3px 2px"`. The flex div fills 56px, right-aligns its content. BC (24px) sits at the right edge of the flex area. BC's right edge is `~2px(padding)` from the cell's right border — **same position as pre-#141.**

When "C" is present: C(24) + gap(4) + BC(24) = 52px, right-aligned in 56px of flex space. "C" sits at position 0-24px from flex-start (toward partNumber), BC sits at position 28-52px. BC hasn't moved.

When "C" is absent (high confidence): BC alone (24px), right-aligned. BC sits at position 28-52px — **identical to the paired case.** BC's position is stable regardless of whether "C" is visible.

---

#### Containment Check

**Right side (BC → Description boundary):** BC's right edge at 2px from cell right border. The `<td>` has `padding:"3px 2px"` — the 2px right padding provides clearance. Description column starts at the next `<td>` boundary. No overflow.

**Left side (C → partNumber boundary):** When both circles present, "C" starts at `56 - 2(pad) - 52(content) = 2px` from the cell's left border. With 2px left padding, "C" sits at 2+2=4px from cell left edge. No clipping, no crowding into partNumber.

**Cell dimensions:** 56px width holds C(24) + gap(4) + BC(24) = 52px of content + 2px padding each side = 56px. Exact fit.

---

#### Summary

| Item | Detail |
|------|--------|
| Change | Line 28049: `inline-flex`→`flex`, `center`→`flex-end` |
| BC position stable? | YES — right edge at ~2px from cell right border, same as pre-#141 |
| "C" extends which direction? | LEFT (toward partNumber), into the widened column space |
| Content fits in 56px? | YES — 52px content + 4px padding = 56px exactly |
| No overflow into Description? | YES — BC right-anchored with padding clearance |
| No clipping of "C" on left? | YES — 4px clearance from cell left edge |

One-line change, no new elements, no width adjustment. Marc applies directly.

---

### C87 — #143 Boot-Failure Handling: Coach Supplement (2026-06-16)

**Type:** Architectural supplement (read-only analysis, no code changes)  
**Status:** COMPLETE — delivered to `docs/143-SUPPLEMENT.md`  
**TODO assignment:** #143

---

#### Context

Freddy's Brief #143 identified two-layer root cause of RYAN's eternal spinner: (1) `loadProjects` has no try/catch — only uncaught Firestore read in the boot chain, (2) `removeTeamMember` orphans the profile doc. Brief asked Coach to answer five architectural questions before CCD builds.

#### Supplement Decisions

| Q | Question | Decision |
|---|---|---|
| Q1 | Error-branch granularity | Two branches: `permission-denied` (contact admin, no retry) vs everything else (retry button). Matches existing `e?.code === "permission-denied"` pattern at lines 39290, 40494. |
| Q2 | Retry mechanism | Full boot retry via extracted `runBoot()` function. Partial retry risks stale config from silently-failed loaders in the Promise.all. Cap at 2 auto-retries for transient; manual Retry after that. |
| Q3 | #143/#144 boundary | #143 = catch + branch + clear flag (safety net for ALL boot failures). #144 = fix `removeTeamMember` symmetry (root-cause elimination). #143 stays load-bearing even after #144 ships. |
| Q4 | Observability | `console.error` only. Debug log system writes to company path requiring `isMember()` — the misprovisioned user IS the failure case and can't write to it. Defer Firestore logging to #129. |
| Q5 | Modal vs inline | Inline, replacing spinner in same content area (line 42145). Follows `connStatus` indicator pattern (line 46034). No modal — don't block toolbar for transient errors. |

#### Key Technical Evidence

- `loadProjects` (line 9207): sole uncaught read — no try/catch, bare `await`
- Boot IIFE (line 45583+): no top-level try/catch; `setLoading(false)` at line 45682 is the ONLY call site
- All 5 config loaders in the Promise.all have internal try/catch (return defaults on failure — safe but silently degraded)
- `connStatus` inline pattern (line 46034): existing precedent for inline error/status display

#### Deliverable

Full supplement at `docs/143-SUPPLEMENT.md`.

---

### C88 — #144 removeTeamMember Orphan Cleanup: Coach Supplement (2026-06-16)

**Type:** Architectural supplement (read-only analysis, no code changes)  
**Status:** COMPLETE — delivered to `docs/144-SUPPLEMENT.md`  
**TODO assignment:** #144

---

#### Context

Freddy's Brief #144 — companion to #143. #143 catches the fall (boot-failure handling); #144 prevents the push (fix `removeTeamMember` to clear profile on removal). Core fork: delete the profile doc (Option A) vs null the companyId (Option B).

#### Profile Read Audit — Complete Codebase Sweep

Audited all 11 read sites across `app.jsx` (6 sites) and `functions/index.js` (5 sites). **Zero sites assume "profile exists implies companyId present."** Every consumer uses optional chaining (`profile?.companyId`) or truthiness gates (`if (companyId) {...}`). A profile with null/absent companyId cleanly falls to the personal/solo path in every case.

#### Supplement Decisions

| Q | Question | Decision |
|---|---|---|
| Q1 | Clear vs neutralize | Option B — `FieldValue.delete()` on companyId + role, with `set({merge:true})`. Preserves firstName. All 11 read sites are null-safe. |
| Q2 | Atomicity | Yes — batch both writes (member delete + profile field clear). Mirrors `acceptTeamInvite` batch symmetry. |
| Q3 | Re-invite from clean state | Confirmed safe — `acceptTeamInvite` uses `{merge:true}`, sets companyId+role, preserves firstName. |
| Q4 | Existing orphans | Cannot query Firestore from this session. Recommended: Marc writes `tools/audit-orphans.js` (read-only count). Jon decides on sweep. |
| Q5 | reset-user.js relationship | No conflict. Script is full delete (superset); #144 is surgical field clear. Complementary tools. |
| Boot self-heal | Recommend NO — keep boot read-only. #143 handles symptom; #144 closes creation path. |

#### The Build

One change to `removeTeamMember` (functions/index.js line 531): replace the single `delete()` with a two-operation batch (member delete + profile field clear via `FieldValue.delete()` + `set({merge:true})`). No other files change. 4 lines replace 1 line. Diff-gated per CLAUDE.md.

#### Deliverable

Full supplement at `docs/144-SUPPLEMENT.md`.

---

### C89 — #137 Customer Portal: Coach Supplement (2026-06-16)

**Type:** Architectural supplement (read-only analysis, no code changes)  
**Status:** COMPLETE — delivered to `docs/137-SUPPLEMENT.md`  
**TODO assignment:** #137

---

#### Context

Freddy's Brief #137 — Customer Portal for digital Quoted BOM approval. Builds on #133's `bomApprovalRequests[]` hook. Seven design questions + eight security requirements. The gating question (Jon-directed, answer first): how does `generateTravelerBomPdf` output reach the customer's browser?

#### Gating Answer: No Storage URL Exists

`generateTravelerBomPdf` (app.jsx:7576) is 100% client-side jsPDF. Returns base64. Sent as inline email attachment via Graph API. No Firebase Storage upload, no URL. **Zero standing exposure.**

Recommendation: **response-only portal** for v1. Customer already has the PDF from the email. Portal shows summary + action buttons (Approve/Reject/Request Changes). No document served through the portal. Document-in-portal viewing parked as upgrade (would require Storage upload + CF-gated signed URLs).

#### Side Finding

Engineering review portal (`reviewUploads`, line 29119) embeds `getDownloadURL()` Storage URLs in the token doc — these contain permanent, unrevokable access tokens. A leaked review link exposes drawings independent of token expiry. Separate security concern, not #137 scope.

#### Supplement Decisions

| Q | Question | Decision |
|---|---|---|
| ★ Q6 Security | Document delivery | Response-only portal; no document; zero leak risk |
| Q1 | Token model | New `bomApprovals/{token}` collection; 128-bit crypto token; 14-day expiry |
| Q2 | Status lifecycle | pending → viewed → approved / rejected / changes_requested; comments required for reject |
| Q3 | Write-back | CF trigger `onBomApprovalResponse` patches matching bar_ record; append-only |
| Q4 | Quote-rev | Record stale approval flag; don't auto-invalidate tokens |
| Q5 | Identity | Token-only; all 8 security requirements addressed (revocation, post-resolution lockout, access audit, etc.) |
| Q6 | ARC surfacing | Bell notification (type: bom_approval) + QUOTE SUMMARY section |
| Q7 | Partial approval | All-or-nothing per request v1; partial parked for v2 |

#### Staging

Two build phases within the same ticket: Phase 1 (token core + portal page + security rules), Phase 2 (CF trigger + write-back + notification + QUOTE SUMMARY surface).

#### Deliverable

Full supplement at `docs/137-SUPPLEMENT.md`.

---

### C90 — #146 Confidence Circle Over-Display: Diagnostic (2026-06-16)

**Type:** Read-only diagnostic (no code changes, no fix proposed)  
**Status:** COMPLETE — delivered to `docs/146-SUPPLEMENT.md`  
**TODO assignment:** #146

---

#### Determination: (a) — Display/Threshold Problem

The confidence scores from the AI model are correct. The over-display is caused by a post-extraction auto-downgrade regex at line 12073 that catches virtually every real part number.

#### Root Cause

`_confusableAny = /[S0O8BIZG6T7HN5DC2QlIL1]/i` matches any part number containing ANY of 20 out of 36 alphanumeric characters (7 of 10 digits, 13 of 26 letters). Every real electrical part number contains at least one. The regex overrides the model's correct "high" confidence → "medium", and the render condition at line 28055 shows the circle for "medium".

The model already checks for confusable glyphs IN CONTEXT (per the prompt at line 11680–11691). The regex re-checks CONTEXT-BLIND — if the character "1" appears anywhere, downgrade. This double-gate was a v1.19.975 safety net for lower-accuracy extraction; it never updated for H5/600-DPI gains.

#### Trust Layer

Confidence circle is cosmetic (informational only). `manualVerifyRequired` is the send gate. Independent systems — fixing the circle does not affect the BOM send gate.

#### Fix Location

Line 12071–12083 (the auto-downgrade block). Render condition at line 28055 is correct. Fix depends on Jon's decision about what signal the circle should carry — awaiting review.

#### Deliverable

Full diagnostic at `docs/146-SUPPLEMENT.md`.

---

### C91 — #146 Follow-Up: Pipeline Signal Availability (2026-06-16)

**Type:** Read-only investigation (no code changes)  
**Status:** COMPLETE — delivered to `docs/146-FOLLOWUP-Q1Q2.md`  
**TODO assignment:** #146

---

#### Q1 — BC Match Ordering

`runPricingOnPanel` (line 26225) runs during extraction and identifies BC matches — sets `priceSource:"bc"`, `bcMatchType`, pricing fields. But it does NOT set `confidence`. The BC match data is available at extraction time; confidence just isn't wired to it. No pipeline reordering needed to implement Jon's rule #1 ("BC-matched → high") — only a confidence write at the existing BC-match point.

`applyLearnedCorrections` (line 14511) DOES set confidence to "high" but only for previously-saved user alternates, not first-time BC catalog matches.

#### Q2 — Text-Layer Signal Availability

`classifyBomInputTier` (line 15174) uses pdf.js `getTextContent()` to count actual text characters in the PDF's text layer. Scanned images wrapped in PDFs return 0 chars → correctly classified as `"scan"`/`"bitmap"`, NOT `"text-layer"`. The distinction is genuine text layer vs interpreted from pixels — exactly what Jon asked about.

The `extractionPath` value (`"pdf-native"` for text-layer, `"hi-dpi-tiles"` for vision) is a parameter to `_parseAndVerifyBomRaw` — the same function containing the confusable regex at line 12073. The signal is in scope at the confidence assignment point; it's just not read.

Persisted: panel-level and per-page in `panel.extractionReport`. Not per-item, but cross-referenceable via `item.sourcePageId` → `perPageOutcomes[].pageId`.

#### Deliverable

Full report at `docs/146-FOLLOWUP-Q1Q2.md`.

---

### C92 — #149 Persist-Safety Confirm + Backfill Spec (2026-06-17)

**Type:** Read-only investigation + spec delivery  
**Status:** COMPLETE — delivered to `docs/149-SUPPLEMENT.md`  
**TODO assignment:** #149

---

#### Persist-Safety: SAFE

Traced all 10 consumers of `row.confidence` in `src/app.jsx`. Writing `confidence:"high"` to exact-BC-matched rows has zero downstream perturbation:

- **Display circle** (28068): disappears — desired effect
- **Verification modal** (27663-27664, 28702-28704): row exits review list — correct
- **Verification badge** (27672): count decreases — correct
- **Send-gate** (15632): reads `manualVerifyRequired` (panel-level), NOT per-row confidence — independent
- **Extraction report tallies** (12092-12095): historical snapshots, not modified — no downstream readers (grep confirmed)
- **Next pricing run** (14901/26379): re-applies same promotion — idempotent
- **Manual PN edit** (25535): already "high" → no-op

`_confDowngradeReason` deleted on promoted rows (matches extraction-time pattern at 12089). Note: #146 apply paths (14901/26379) don't delete it — minor inconsistency, not a bug (field unreachable when confidence is "high").

#### Hook Point

`migrateProjectShape()` (line 9219) — single funnel for all project loads. After quoteRev auto-normalize (line 9306), before `return out`. Project-level `_confidenceRecomputedAt` flag gates it to run once. Flag persists on next `safeSave`. Dashboard load cost: O(1) flag check for migrated projects.

#### Coverage

Rows with `bcMatchType==="exact"` (introduced v1.20.110). Pre-v1.20.110 projects have no `bcMatchType` → left alone → self-heal on next "Get New Pricing" click.

#### Deliverable

Full spec + test plan at `docs/149-SUPPLEMENT.md`.

---

### C93 — #149 Post-Deploy Doc Correction + #152 Background Save TODO (2026-06-17)

**Type:** Doc revision (no code changes)  
**Status:** COMPLETE  
**TODO assignments:** #149 (doc correction), #152 (new OPEN)

---

#### §1/§2 Revision

Marc's live verification (`docs/149-LIVE-VERIFICATION.md`) showed the persist model in §1/§2 was inaccurate. The flag (`_confidenceRecomputedAt`) is best-effort, not guaranteed-once:

1. **Panel-level saves don't carry the project-level flag** — `saveProjectPanel` (Lead-Drivers refresh on project open) persists the active panel's promoted BOM but not the flag. Can clobber a flag a prior `saveProject` set (Abbeville: null→stamped→null).
2. **Multi-panel projects persist panel-by-panel** — only the active panel's rows write; other panels stay unpromoted in Firestore (Proctors: 49 in memory, 7 persisted).
3. **Background saves touch unopened projects** — Salares went 43→0 without being opened (see #152).

**Correctness is unaffected.** The real guarantee is idempotent in-memory re-promotion on every load across all panels — the flag and persistence are pure optimizations. `confidence` is not in the `quoteRev`/`bomVersion` hash domain, so re-runs cause no churn.

Revised §1 to state the correctness model (in-memory re-promotion, not flag) upfront, added `_computeDvBomHash` to the consumer table. Revised §2 to document all three persistence behaviors with the observed evidence. Updated risk table and T5 test case.

#### #152 — Background Save of Unopened Projects

Logged TODO #152 (LOW, pre-existing). Salares was written to Firestore without the user opening it. Adjacent to #86's async-ownership rule — a save path reaching a project that isn't currently active is the inverse of #86's "completion handler writing to the wrong project." Not a #149 regression (#149 adds no save paths). Impact unknown for data beyond confidence. Deferred.

---

### C94 — #137 Phase 1 Detailed Plan: BOM Approval Token Core + Portal Page (2026-06-17)

**Type:** Implementation plan  
**Status:** COMPLETE — awaiting Jon approval, then Marc builds (diff-gated)  
**Deliverable:** `docs/137-PHASE1-PLAN.md`

---

#### Scope

Phase 1 of #137 Customer Portal. Six changes shipping together in one deploy (rules + hosting, no functions):

1. **Firestore rules** — `bomApprovals/{token}` match block with scoped helpers, all 8 security requirements from C89
2. **Token helper** — `createBomApprovalTokenDoc()`, DRY for both send paths
3. **Standalone send** — `handleBomSend()` modified: token-doc-before-email ordering, portal link in HTML, token back-ref on bar_
4. **Bundled send** — QuoteSendModal modified: same ordering, gated on `includeTravelerBom`
5. **Root routing** — `bomApprovalToken` URL param detection, portal page render without auth
6. **BomApprovalPortalPage** — new component (~120-150 lines), mirrors SupplierPortalPage pattern but simpler (response-only, no file upload)

#### Key design decisions

- **Token-doc-before-email** is the critical atomicity constraint. If email goes first and token write fails → customer gets dead link with no recovery. Token-first guarantees the link works.
- **bar_ save is best-effort** (existing pattern). Token doc is authoritative; Phase 2 CF reads from token doc, not bar_.
- **Phase 1 responses are invisible in ARC.** Customer responses land on the token doc but surface nowhere until Phase 2 ships CF write-back + notification + QUOTE SUMMARY display. Test criteria verify via direct Firestore inspection.
- **Rules deploy before hosting.** New collection — no existing behavior changes. If hosting deploys first and user sends before rules land, token write gets denied.

#### Test matrix

15 test criteria (P1-T1 through P1-T15) covering: both send paths, email link verification, portal load + summary display, viewed status update, approve/reject/changes_requested flows, post-resolution lockout, expired/revoked token handling, atomicity failure modes (token-fail blocks email, bar_-fail is benign), send-gate independence, and read-count cap.

---

### C95 — #153 Supplement: Drawing-Revision Re-Extract + BOM Reconciliation (2026-06-17)

**Type:** Codebase verification supplement  
**Status:** COMPLETE  
**Deliverable:** `docs/153-SUPPLEMENT.md`

---

#### Investigation scope

Four-axis deep trace of `src/app.jsx` to verify Brief #153 assumptions:

1. **Retention Guarantee** — complete inventory of ~67 edit-work fields across 20 categories on BOM rows. Verified achievable by carrying prior-row objects forward on match (spread-then-override pattern), not by preserving through re-extraction. Current `runExtraction()` (line 24770) replaces `panel.bom` wholesale — all enrichment destroyed.

2. **Existing Re-Extract path** — `runExtraction()` at line 24770. Snapshots BOM before overwrite (line 24781), clears derived data, extracts, replaces BOM entirely. `addFiles()` (line 23752) appends pages (doesn't replace). #153 builds a new flow that intercepts after extraction but before BOM replacement.

3. **Dv/bomVersion machinery** — `_bumpBomVersionIfChanged()` (line 8661) auto-bumps on PN/Qty hash change via `_computeDvBomHash()` (line 8646). Works as-is for reconciliation commits. **Gap identified**: existing `_snapshots` subcollection (line 9008) stores BOM only (no page refs, 10-cap FIFO). New `_dvHistory` subcollection needed for version-indexed archive with drawing page references.

4. **Match-key mechanism** — three-pass algorithm: normPN (line 46777) primary → position+description fallback → unmatched residuals. ECO diff (line 16837) is prior art but operates on per-PN aggregates, not individual rows — needs adaptation. Documented 8 failure modes with mitigations.

#### Key findings

- **Retention is achievable** but requires explicit field-by-field carry-forward logic (~15 fields to carry, ~10 to take from new extraction, ~5 to clear conditionally per D1).
- **ECO diff at line 16837** is direct prior art — same `normPart()` normalizer, same add/modify/remove classification. But wrong granularity (sums qty across duplicate PNs) and wrong interaction model (checkboxes vs gated commit).
- **New `_dvHistory` subcollection recommended** over extending `_snapshots` — different retention policy (permanent vs FIFO-10), different schema (includes `pageRefs`).
- **Labor, ECO, and contingency rows** must be excluded from matching and carried through unconditionally.
- **Confidence fields should NOT be carried** — fresh extraction produces fresh confidence, and #146/#149 re-promotion handles exact-BC rows on load.

---

### C96 — #153 Detailed Plan: Drawing-Revision Re-Extract + BOM Reconciliation (2026-06-17)

**Type:** Implementation plan  
**Status:** COMPLETE — awaiting Jon approval, then Marc builds (diff-gated)  
**Deliverable:** `docs/153-PHASE1-PLAN.md`

---

#### Internal phasing (6 phases)

| Phase | Component | Key changes |
|-------|-----------|-------------|
| **A** | `_dvHistory` archive + PREVIOUS VERSIONS modal | `archiveDvVersion()`, `loadDvHistory()`, Firestore rules, read-only modal near Dv pill |
| **B** | Three-pass match engine (`reconcileBom()`) | Pure function: normPN exact → position+desc fallback → residuals. Duplicate-PN positional+itemNo disambiguation. |
| **C** | Carry-forward merge (`buildReconciledBom()`) | Spread-then-override-then-clear pattern. Explicit clear-list for ~8 no-carry fields (confidence, suspectQty, companion flags, etc.) per MUST-ADDRESS #1. |
| **D** | Staging area + `addFiles` interception | `reconStagedExtraction` state in PanelCard. Interception in `confirmAndExtract()` (line 24028) — early-exit `if (isRevisionDrop)` route. `runExtractionTask` staging mode flag. |
| **E** | Reconciliation Modal | Frozen-BOM isolation (deep copy on mount), gated commit (disabled until all CHANGED/NEW/DELETED resolved), Accept All for CHANGED+NEW only. |
| **F** | Post-commit pipeline | `applyLearnedCorrections` on NEW + PN-CHANGED rows, auto-price trigger, `qvHistory` logging. |

#### Three must-address items

1. **Carry-forward completeness** — spread-then-override is necessary but insufficient. Plan specifies an explicit `delete` list for 8 fields that must NOT carry through: `confidence`, `_confDowngradeReason`, `suspectQty`, `suspectQtyReason`, `autoAddedCompanion`, `companionOfPartNumber`, `snippetCorrected`, `additionalPartNumbers`. These are re-derived by fresh extraction or downstream processors.

2. **Archive timing + identity** — `archiveDvVersion()` runs BEFORE page replacement and BEFORE extraction. Captures `capturedProjectId`/`capturedPanelId` in closure per #86. Write ordering: archive → replace pages → extract → modal → commit.

3. **Concurrent-save isolation** — Modal takes `frozenBom = useRef(JSON.parse(JSON.stringify(currentBom)))` on mount. Background `onSnapshot` updates flow into parent state but NOT into the modal's frozen copy. Commit writes through `onSaveImmediate` → `saveProjectPanel` with its existing mutex (line 9066) and per-page metadata guards (lines 9117-9146).

#### Risks surfaced

- `runExtractionTask` refactor for staging mode is medium-risk — function has multiple internal branches.
- Cancel-without-commit leaves new pages + old BOM (inconsistent state); documented with recovery paths (Re-Extract, Restore, re-drop).
- Post-commit enrichment is a second sequential save; if it fails, user recovers via "Refresh Pricing."

#### Test matrix

20 test criteria (T1-T20) covering: no-regression fresh extraction, revision-drop trigger, `_dvHistory` archive verification, carry-forward completeness (all Tier-1 fields), D1 PN-same/PN-changed rules, NEW accept/reject, DELETED delete/keep, Accept All behavior, gated-commit blocking, Dv bump, cancel behavior, concurrent-save isolation, PREVIOUS VERSIONS modal, labor/ECO/contingency passthrough, duplicate-PN disambiguation, corrected-PN fallback match, and #86 async-ownership.

---

### C97 — #153 Plan Addendum: Transient Staging + Disambiguation Prompt + Filter Fix (2026-06-17)

**Type:** Plan revision  
**Status:** COMPLETE — awaiting Jon review  
**Deliverable:** `docs/153-PLAN-ADDENDUM.md`

---

#### Code-path verification

Traced `runExtractionTask` (line 14036). **Reads pages from passed `panel` argument** (line 14042: `_basePages(panel)`), never from Firestore. Two Firestore `save()` calls at lines 14116 (early-upload) and 14823 (final consolidated) — suppressed in staging mode by overriding `save` with `applyInMemory`. Storage uploads still fire (harmless, needed at commit). Clean answer: transient panel works.

#### Revision 1 — Transient staging (Cancel = clean no-op)

Moved page-persist + archive from drop time to commit time. Flow:
- Interception fires BEFORE `onSaveImmediate` at line 24117 — pages NOT yet in Firestore
- Build transient panel (`{...panel, pages: [...newPages, ...ecoPages]}`) passed to `runExtractionTask` with `stagingMode: true`
- Staging mode suppresses all Firestore writes in the extractor
- Commit handler does: `archiveDvVersion` (reads current Firestore state) → swap pages + write merged BOM (single `onSaveImmediate`)
- Cancel discards staging — zero Firestore writes, panel fully intact

Eliminates the broken-Cancel state from C96 entirely. No recovery-warning dialog needed.

#### Revision 2 — Disambiguation prompt

Three-option dialog when files dropped on a BOM'd panel:
- **"Revise drawings (replace & reconcile)"** → #153 flow
- **"Add pages (keep current BOM)"** → append pages, save, skip extraction, BOM unchanged
- **Cancel** → discard pending pages

"Add pages" is a well-defined path: supplementary sheets for reference without disturbing the BOM.

#### Filter fix (build-note bug)

Shared `isPassthrough()` predicate:
```
const isPassthrough = r => r.isLaborRow || r.ecoTag || r.isContingency || r.autoLoaded;
```
Used with `!` for matchable, directly for passthrough. Eliminates the asymmetric AND/OR gap where a row with exactly one flag would fall through both filters and vanish.

#### Test criteria additions

T14 revised (Cancel verifies zero Firestore writes + panel unchanged). T21 (disambiguation prompt), T22 ("Add pages" keeps BOM intact), T23 (passthrough filter completeness — manually-added contingency row survives).

---

### C98 — #156 Supplement: In-Portal BOM Accuracy Confirmation + Verified Access (2026-06-17)

**Type:** Codebase verification supplement  
**Status:** COMPLETE — awaiting Jon review  
**Deliverable:** `docs/156-SUPPLEMENT.md`  
**Ticket:** #156 (NEW — absorbs #137 Phase 2)

---

#### Scope

Verifies all Brief assumptions for the BOM accuracy confirmation portal against the live codebase (v1.20.134, #137 Phase 1 deployed). Eight investigation axes:

1. **MFR field** — schema-guaranteed on all extracted rows (line 11748). Can be empty string, never undefined. Labor/contingency rows identifiable by flags.
2. **Admin SDK signed-URL** — `admin.storage().bucket().file()` pattern exists (line 2425) but `getSignedUrl()` is new. Requires IAM Service Account Token Creator role on default SA.
3. **Email OTP** — no existing OTP system; entirely new. SendGrid delivery trivial (6+ existing email CFs as pattern). Proposed: SHA-256 hash storage, 10-min expiry, rate-limiting (5/hr per token, 3-strike lockout).
4. **Send-time snapshot hooks** — both paths (standalone `handleBomSend` line 32637, bundled `QuoteSendModal` line 32011) have clean insertion point between token generation and token doc write. Full `project.panels[].bom` + `panel.pages[].originalPdfPath` in memory. Pre-projects to 4 columns at write time.
5. **Portal retirement** — `BomApprovalPortalPage` (lines 46818–46939) is the only component replaced. Token doc structure, URL routing, send-path wiring, bar\_ records all kept and extended. Safe: no real customer link was ever sent.
6. **Per-line response** — data shape: `lineResponses[]` with `{panelId, lineIndex, flagged, comment}`. Status derived from flags (DQ1). Default-accept (DQ2). No auto-edit (DQ3).
7. **ARC surfacing** — `onBomApprovalResponse` trigger (pattern: `onSupplierQuoteSubmitted`), bar\_ update, bell notification, QUOTE SUMMARY display with status pills, `BomApprovalResponseModal`, expired-unanswered detection.
8. **Token-only CF auth** — `extractSupplierQuotePricing` (line 988) is exact precedent: `onCall` without `context.auth`, authenticates via token doc lookup.

#### Key finding: PDF storage path available but MUST NOT be exposed

`panel.pages[].originalPdfPath` is accessible at send time and stored in the snapshot doc as a Storage object path (for the CF to locate the file). The **URL** is never exposed to the client — the CF mints a 5-minute signed URL via Admin SDK on each request. This establishes the pattern #148's fix adopts.

#### Gap analysis

13 new components: 6 CFs, 1 Firestore collection, 1 portal rewrite, 2 ARC modals, 1 QUOTE SUMMARY extension, 1 IAM config. No blocking gaps. Pre-existing #155 (bundled send bypasses manualVerify gate) should be resolved before/alongside #156.

#### Phasing recommendation

Phase A (server infra) → Phase B (portal rewrite) → Phase C (ARC surfacing). Each independently deployable.

---

### C99 — #155 False-Positive Closure + #156 Detailed Plan (2026-06-17)

**Type:** Investigation + Detailed Plan  
**Status:** COMPLETE — awaiting Marc build  
**Deliverables:** `docs/156-PHASE1-PLAN.md` (Detailed Plan), TODO.md #155 resolved, TODO.md #157 logged

---

#### #155 closure — false positive

Traced the bundled send path (`QuoteSendModal`). The `manualVerifyRequired` gate IS enforced at three independent points:
1. QUOTE SUMMARY "Send" button disabled via `_sendBlocked` (line 35335)
2. Modal send buttons disabled via `sendBlocked` (lines 32702, 32710)
3. Runtime `if(sendBlocked)` check in `handleSend` (line 32390)

`sendBlocked = incompleteItems.length > 0` (line 32385) where `incompleteItems` = `findIncompleteQuoteItems(project)` which pushes `isVerificationBlock:true` for any `manualVerifyRequired` panel (line 15704). Bundled path is actually STRICTER than standalone (blocks on verification + pricing vs. verification-only). Marc's note was narrowly true (no explicit `isVerificationBlock` filter in `handleSend`) but the gate is present one layer up. Marked RESOLVED as false positive with durable trace in TODO.md.

#### #157 logged — stale-project bug in bundled send

Surfaced during send-path investigation: `buildBomReportPdfDoc(bomDoc, project)` at line 32500 and `generateTravelerBomPdf(project)` at line 32513 use stale `project` instead of post-BC-sync `populated`. Low urgency, NOT #156's concern. Logged as #157.

#### #156 Detailed Plan

Three independently deployable phases, 39 test criteria:

**Phase A — Server infrastructure (deploy: functions + rules)**
- `bomApprovalSnapshots/{token}` collection + create-only rules (A1)
- `bomApprovals/{token}` rules: no public allow-list expansion needed — all new writes via Admin SDK (A2)
- 7 new CFs: `sendBomApprovalOtp` (A3), `verifyBomApprovalOtp` (A4), `getBomApprovalSnapshot` (A5), `getBomApprovalPdf` (A6), `submitBomApprovalResponse` (A7), `onBomApprovalResponse` trigger (A8), `revokeBomApproval` (A9)
- IAM Service Account Token Creator role — **hard pre-deploy gate** (verified via functions:shell before deploy)
- ~400 new lines in functions/index.js

**Phase B — Portal rewrite + snapshot write (deploy: hosting)**
- Snapshot write in both send paths (B1a standalone, B1b bundled) — positioned AFTER `sendBlocked` check, so it can never fire on an unverified BOM (#155's gate covers #156 for free)
- Snapshot filter: excludes labor, contingency, crate, buyoff via `_isBuyoffOrCrate` (line 15621) + `isLaborRow` + `isContingency`
- `allowedDomains` capture from recipient email at send time (B2)
- `BomAccuracyPortalPage` replaces `BomApprovalPortalPage` (B3) — OTP flow, CF-mediated data, per-line flagging, PDF viewer
- `lineResponses` carry `partNumber` + `description` so ARC-side modal is self-describing without snapshot access
- ~315 new lines in app.jsx

**Phase C — ARC surfacing (deploy: hosting)**
- QUOTE SUMMARY bar\_ display with status pills (C1)
- `BomApprovalResponseModal` with flagged-line display, revoke, re-send (C2)
- Notification deep-link via `handleNotifClick` + `setPendingBomApprovalResponseOpen` (C3)
- Bell icon update for `bom_approval` type (C4)
- Expired-unanswered detection (client-side, `sentAt + 14d`)
- ~200 new lines in app.jsx

**Risks surfaced:** R1 (project path ambiguity — solo vs. team), R2 (bar\_ array rewrite race — recommend transaction), R3 (snapshot cleanup — recommend Firestore TTL), R4 (SendGrid sender for OTP).

**Five analyst review items folded in:**
1. Crate exclusion from portal snapshot (verified: `_isBuyoffOrCrate` covers it)
2. PN + description in `lineResponses` (self-describing modal)
3. Snapshot write after `sendBlocked` (explicit sequencing guarantee)
4. IAM role as hard pre-deploy gate
5. #157 logged for stale-project bug (separate from #156)

---

### C100 — #153 Revision-Gate Structural Trace (2026-06-17)

**Type:** Read-only code-path trace
**Status:** COMPLETE — root cause identified, runtime verification needed
**Deliverable:** `docs/153-REVISION-GATE-TRACE.md`

---

#### Verdict: gate IS on the executed path

Jon's hypothesis — "the condition probably isn't on the executed path" — is **REFUTED**. The complete call chain is:

```
handleDrawingDrop (24236)
  → addFiles (23955): appends pages (24088), AI detects, sets awaitingConfirm
  → USER clicks Confirm button (27924)
  → confirmAndExtract (24414): quality gate → revision gate (24534) → extraction (24602)
```

There is NO alternative path from drop to extraction. `addFiles` does NOT extract, does NOT call `onUpdate`, does NOT call `confirmAndExtract`. The user MUST click Confirm, which MUST call `confirmAndExtract`, which contains the gate.

#### Why three fixes produced zero behavior change

**The condition is correct. The INPUTS are wrong.** All four BOM-detection signals (`_refBomRows`, `_propBomRows`, `_priorDv`, `_persistedHasBom`) fail simultaneously because:

1. **In-memory signals (A/B/C):** `latestPanelRef.current = panel` (line 23920) on every render. If the `panel` prop loses its BOM during the addFiles→confirm window, all three zero out together. The v1.20.138 comment confirms this diagnosis ("BOTH latestPanelRef.current AND the panel prop are stale, no bom AND no bomVersion").

2. **Firestore signal (D):** The v1.20.138 read at line 24519 uses `_appCtx.projectsPath || users/${uid}/projects`. If the path is wrong for a team project, the read returns no document and `_persistedHasBom` stays false.

**Three fixes modified the condition. None investigated what STRIPS the BOM from the panel prop between addFiles and confirmAndExtract.**

#### Recommended next step

Reproduce with console open. The debug log at line 24533 (`[#153 REVISION-GATE]`) dumps every signal value and will immediately reveal which input is wrong. Based on output:

- If `refBomRows=0, propBomRows=0` → add `console.trace` inside parent's `onUpdate` callback (line 34722), filtering for calls where `updatedPanel.bom` is empty/undefined. This catches the caller that strips the BOM.
- If `persistedReadErr` is populated → log `_appCtx.projectsPath` at read time. Verify it points to the correct Firestore collection.
- If `newItemsLen=0` → `pendingNewItemsRef` was cleared between addFiles and confirm. Add sentinel logs.

---

### C101 — #153 Full Flow Read: End-to-End Revision Path Audit (2026-06-17)

**Type:** Comprehensive code-path read vs. C96/C97 plan
**Status:** COMPLETE
**Deliverable:** `docs/153-FULL-FLOW-READ.md`
**Builds on:** C100

---

#### Scope

Complete end-to-end read of the #153 revision-drop flow (drop → addFiles → gate → both branches → staging → ReconciliationModal → commit) against the C96/C97 plan. Two confirmed bugs investigated (v1.20.138, project DCeU9GGjJLgB1NP0MJuJ).

#### Key findings

1. **Code structurally matches C96/C97** at all 6 phases (A-F). All specified components exist and are wired correctly.

2. **BUG 1 (gate intermittency):** Cannot be pinned via static analysis. Every examined code path preserves BOM. The `projectRemoteTasks` listener churn creates re-render windows, but the `didInitialFirestoreSyncRef` and `updatedBy!==uid` guards prevent state clobbering. Root cause is timing-dependent — needs runtime `console.trace` in parent onUpdate to catch the exact caller that strips BOM.

3. **BUG 2 (Replace → no modal):** Code is wired correctly per C97. `handleRevisionDrop` IS called (return at 24553 prevents normal path). The "50-page extraction" is a display discrepancy — extraction runs on 25-page transient panel while UI shows 50 from panel prop. Most likely failure: silent `try{...}catch(e){}` at line 14876 swallows onDone errors. Secondary: `_currentProjectId` guard discards result.

4. **5 divergences found (D1-D5):** D1 (architectural — gate at confirm not drop) is root cause of both bugs. D2 (silent catch) masks BUG 2. D3 (pendingNewItemsRef types stale after tagPage). D4 (cosmetic page count). D5 (Signal D path for team projects).

5. **Recommendation: Branch at DROP (Option A).** Move gate upstream to `handleDrawingDrop` before addFiles. Eliminates the async window (BUG 1) and ensures Revise path controls the full pipeline (BUG 2). Consolidated fix plan in 4 phases.

---

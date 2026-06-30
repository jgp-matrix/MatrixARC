# ARC Coaching Log

## Close-Out Discipline

Any design decision, analyst review, or scope change produced or relayed during a Coach session **must be committed to a repo file** before session end. Freddy's decisions live only in browser chat until Coach or Marc commits them — if a session ends without writing them down, the next Freddy has no way to recover them. When closing out, explicitly check: "Did Freddy produce anything this session that isn't in the repo yet?"

## Freddy-Bound Delivery

Freddy-bound deliverables (analyst review requests, verdicts, supplements, plans, any >50-line content) ALWAYS go to a file + `Start-Process explorer.exe -ArgumentList "/select,<path>"` + a file link for Jon to drag — never pasted into chat. Missed 2026-06-15.

## Supplement Durability

When producing a supplement, Brief response, or any analysis artifact in docs/, commit it to git as part of creating it — do not leave it untracked in the working tree. The reasoning behind a spec must be in version control before the work it informs gets built, so the record survives independent of the working tree or conversation. Write → commit → then open/surface for relay.


## Archive & Maintenance

> **Soft budget:** ≤1,500 lines. When exceeded, review pass using archive criteria below.
>
> **Archive criteria (cut test: "still load-bearing for a fresh session"):**
> (a) Status resolved/complete/closed
> (b) Not cited by a still-live finding
> (c) No resume trigger
> (d) Architectural lessons already promoted to CLAUDE.md
>
> **Current archive:** [COACH-ARCHIVE.md](COACH-ARCHIVE.md) — findings C1–C99 (archived 2026-06-29)

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
- **2026-06-26 (Session 6)** — C106: Pre-Print Checklist "AI prices" overcount on PRJ402124. RESOLVED — NO BUG. Initial trace misidentified the source: analyzed the Check 2 pricing predicate (`r.priceSource==="ai"`, line 37210) when the actual "28" came from the AI lead-time entry (`_countAiLeadTimes`, line 37183, `leadTimeSource:"ai"`). Marc's runtime read confirmed 0/89 rows have `priceSource:"ai"` across all 4 panels; 28 rows have `leadTimeSource:"ai"` (L1=17, L4=11). Modal text reads "AI-estimated lead times," not "AI prices" — Jon's paraphrase was the mismatch, not the code. Budgetary stamp via `_markProjectBudgetaryForAiLeads` is working as designed. Details below.
- **2026-06-26 (Session 6, cont.)** — C107: #163 expanded — BC 20-char PN field limit scoping trace. Full territory map: (1) No ARC-side truncation — BC server silently truncates at POST time; ARC's Firestore BOM stores whatever BC returns. (2) `bcCreateItem` sends full PN as `body.number`, BC enforces 20-char; follow-up OData PATCH copies the already-truncated `item.number` back into `Vendor_Item_No` — wrong. (3) `Vendor_Item_No` IS written today (line 4921) but set to the truncated `item.number`, never the full PN. (4) Five key-matching paths use `partNumber` as identity: `bcFuzzyLookup`, `bcLookupItem`, `applyLearnedCorrections` (4 paths), `reconcileBom`, and `bcSyncPanelPlanningLines` (line 3662: `No:row.partNumber` pushed directly to BC). (5) All three document surfaces (RFQ, Traveler, BC Item Browser) read `partNumber`/`item.number` — the truncated value. Details below.
- **2026-06-26 (Session 6, cont.)** — C108: #163 Coach Supplement — verified Freddy's 5 open questions against current tip. Q1: `bcNo` is net-new to BOM row schema (no existing BC item number persisted on rows). Q2: All 7 BC boundaries (5 original + 2 pricing-path overwrite vectors discovered in C107) can key on captured surrogate — uniform pattern. Q3: Lazy dual-match (.slice(0,20) fallback) for learning DB transition; optional batch re-key. Q4: ARC always supplies `number` to `bcCreateItem` (all 3 call sites); omitting it would trigger BC No.-Series auto-assignment. Q5: Clean-break viable — existing quotes already issued with truncated PNs, active projects self-heal on next BC interaction. Additional finding: background/foreground pricing paths (lines 14964, 26846) are independent truncation vectors not in C107's original 5. Deliverable: `docs/163-SUPPLEMENT.md`.
- **2026-06-26 (Session 6, cont.)** — C109: #163 Detailed Plan — implementation-ready spec for Marc. 5 phases (~87 lines), 10 test criteria. THREE CRITICAL FINDINGS beyond the Brief: (1) `bcSyncEcoPanelPlanningLines` (line 3851) is a 9th push site — `No:row.partNumber.trim()` same as site 4, not in any prior analysis. (2) `bcUpsertItemVendorLeadTime` is a 10th push site — writes `Item_No:partNumber` to ItemVendorCatalog. (3) Cross-detection logic (line 26415-26417) will false-positive on EVERY commit under surrogates: `isCrossing = origPN !== bcItem.number` always true when comparing full PN vs MTX-#####. Fix: compare via `bcItem._vendorItemNo` (full PN from BC) with `normPart()`. Same breakage in learning DB writes (lines 26324/26327/26336) — would store surrogates as replacement PNs. Pricing bcMap builders (14923/26796) also store `bcNumber:pn` (row.partNumber) — under new model this would be the full PN, causing mutation sites 2/3 to write full PN as `bcNo` instead of surrogate. Fix: `bcNumber:exact.number`. Deployment sequence: BC backfill MUST precede code deploy; P1+P2+P5 ship together (atomic). Deliverable: `docs/163-DETAILED-PLAN.md`.
- **2026-06-26 (Session 6, cont.)** — C109 Rev 2: #163 Detailed Plan revised per Jon's verification (5 items). GATING 1 (CSV import contradiction): resolved — update path uses `row.bcItem?.number` (populated during lookup at 41845), lookup adds `vendorItemNo` dual-filter fallback (replicating `bcLookupItemForQuote` pattern at 8469), create path handled by P3's `body.number` omission. GATING 2 (unresolved write sites): resolved — lines 31359/37680 operate on supplier portal/SQ items (NOT BOM rows), need `_bcNoMap` built from project BOM panels; line 27212 IS a BOM row, simple `_bcNo(row)`. GATING 3 (test environment): resolved — ALL changes in `src/app.jsx` (client-side), ZERO `functions/index.js` changes, no Functions deploy needed; test procedure = deploy to matrix-arc-test target + BC sandbox + scratch projects only. Secondary impact: `sqCrossings` `bcItemNumber` stores surrogate (graceful degradation, follow-up). FRAMING 4 (size): plan now states ~13 functions, ~40 call sites, ~95 lines upfront. FRAMING 5 (grep): completeness audit moved from follow-up to PRE-DEPLOY GATE. Deliverable: `docs/163-DETAILED-PLAN.md` (Rev 2).
- **2026-06-26 (Session 6, cont.)** — C109 Rev 3: #163 Detailed Plan revised per Marc's implementer review (6 items) + Jon's planning-line item (1). HIGH-1: `_vendorItemNo` is path-dependent — only populated on ItemCard search path (field="both"), NOT on v2 /items path (field="number"/"displayName") or `bcLookupItem`/`bcFuzzyLookup`. Fix: targeted ItemCard fetch in commitBcItem/pre-commit when `_vendorItemNo` absent. HIGH-2: `Vendor_Item_No` write gated inside `if(vendorNo)` — vendor-less creates skip PATCH entirely, full PN written NOWHERE post-P3. Fix: restructure gate to `vendorNo||...||number`. MED-3: P3 removes duplicate prevention (409 handler useless when body.number omitted) — added pre-create dedup via vendorItemNo lookup (~12 lines, Jon decides include/exclude). MED-4: Fuzzy branch in pricing explicitly confirmed covered by mutation-site fix; fuzzy lookup input changed to `_rowBcNo||pn` for consistency. MED-5: 4 missed read sites (6299, 6305, 23715, 30445) added to 2H; pre-deploy grep widened to cover `bcLookupItem(`/`bcGetItemVendorNo(`. MED-6: BC sandbox mechanism pinned — `_bcConfig.env` loaded from Firestore `companies/{companyId}/config/bcEnvironment`, NOT tied to hosting target; two isolation options scoped for Jon. JON-7a: Planning line `No:_bcNo(row)` = surrogate CONFIRMED correct. JON-7b: Full PN visibility scoped — 3 options (Description prepend, Description_2, BC lookup) for Jon's decision. Total ~120 lines (up from ~95). Deliverable: `docs/163-DETAILED-PLAN.md` (Rev 3).
- **2026-06-26 (Session 6, cont.)** — C109 Rev 4: #163 Detailed Plan — final corrective before build. Two narrowing changes per Jon's reconciliation. (1) Dedup query fix: rev 3's v2 `/items?vendorItemNo eq` filter is dead (Marc sandbox-proved 400). Re-pointed to ItemCard OData (`Vendor_Item_No eq`), same endpoint §1A uses. Also fixed the CSV import dual-filter fallback in §2I — same dead v2 filter, now routes through `_bcFetchItemsViaItemCard`. The `bcLookupItemForQuote` (line 8469) citation as "proven" was wrong — logged as follow-up dead code. (2) Planning line §7b DROPPED entirely: not deferred, out-of-scope/BC-owned. Jon enables Vendor_Item_No visibility on BC planning line page definition. Zero ARC code. All other rev 3 items confirmed correct on reconciliation. Plan is BUILD-READY. Deliverable: `docs/163-DETAILED-PLAN.md` (Rev 4).
- **2026-06-27 (Session 6, cont.)** — C110: #163 Full-Diff Architectural Review of Marc's P1-P5 build (commit `e18a8163`, branch `feat/163-surrogate-key`, +167/-67 in `src/app.jsx`). **PASS WITH CONDITIONS.** All 6 phases FAITHFUL to rev-4 plan. Async restructure (applyBcItem) SAFE — all 5 callers are fire-and-forget, no ordering side-effects. Known-open rulings: 3a SQ lead-time (~31443) FIX-BEFORE-PROD (price push converted but lead-time upsert still passes raw `it.partNumber`, won't match MTX-##### surrogates; needs BC No. threading or ItemCard lookup); 3b ItemCard-direct ACCEPT (beneficial deviation, matches existing codebase patterns at ~4349/~4404); 3c sibling matcher (~23727/23734) FIX-BEFORE-PROD (lacks P5's `.slice(0,20)` fallback for truncated DB entries on panel mount auto-apply). No new findings beyond Marc's flagged items. Recommended sequence: test-channel deploy → T1-T10 → fix 3a+3c → Coach re-review → production. Deliverable: `docs/163-COACH-REVIEW.md`.
- **2026-06-27 (Session 6, cont.)** — C116: #163 C115 alternates fix re-review (delta `3afb663b..55126f7b`). **PASS.** One line at 28872 — `_vendorItemNo:alt.replacement.partNumber` added to synthetic bcItem. `number`/`unitCost`/`displayName` unchanged. Delta is exactly one line. With `_vendorItemNo` present: `commitBcItem` (26320) gets `_vinResolved=true` → partNumber writes; `applyBcItem` (26510) uses it directly with same `isCrossing` result. No surrogate-leak. Clear for test-channel re-deploy → T9 + T4 regression.
- **2026-06-27 (Session 6, cont.)** — C115: #163 alternates-dropdown regression trace. **CONFIRMED REGRESSION — FIX-BEFORE-PROD.** Line 28872 constructs a synthetic bcItem with `number: alt.replacement.partNumber` (the FULL PN from learning DB, NOT the BC No.) and no `_vendorItemNo`. `commitBcItem` treats `bcItem.number` as the BC No. → `_resolveVendorItemNo(fullPN)` queries `No eq fullPN` → no match (>20 chars) → `_vinResolved = false` → partNumber NOT written. Same field-audit as C113: price from cached learning-DB unitCost, partNumber stale. Broken since initial P1 commit (both original `!==bcSurrogate` guard and C113 `_vinResolved` guard fail). Fix: one line at 28872 — add `_vendorItemNo: alt.replacement.partNumber` to the constructed bcItem. No `commitBcItem` changes needed; the `_vinResolved` guard works correctly once the input carries `_vendorItemNo`. No surrogate-leak risk (learning DB stores full PNs, never surrogates). `bcNo` will be set to full PN (not actual surrogate) — benign, corrected by next pricing run.
- **2026-06-27 (Session 6, cont.)** — C114: #163 C113 `_vinResolved` fix re-review (delta `27bf12d4..3afb663b`). **PASS.** Implementation matches C113 spec exactly. `_vinResolved` set in 2 places (lines 26325/26328), both BEFORE the `||bcSurrogate` fallback (26330). Guard at 26351 reads `bcFullPN&&_vinResolved`. `bcNo` write (26350) untouched. Delta is exactly 3 logical changes, nothing else. Four cases re-walked against committed code: A short-PN cross writes ✓, B backfilled writes ✓, C un-backfilled no-write ✓, D no ARC surrogate-leak path ✓. Clear for test-channel deploy → T1-T10.
- **2026-06-27 (Session 6, cont.)** — C113: #163 C112 fix safety verification. Q1-Q3 CONFIRMED: for un-corrected long-PN items, `_resolveVendorItemNo` returns the bulk-copied truncated Vendor_Item_No; the unconditional write sets partNumber to that truncated value; this is identical to master (no worse). Q4 SURROGATE-LEAK FOUND: post-#163 item whose `bcCreateItem` PATCH failed (line 4991 — logs error but doesn't throw) leaves Vendor_Item_No empty; `bcFullPN` falls back to `bcSurrogate` = MTX-#####; unconditional write would set partNumber to the surrogate — WORSE than both master and current branch. FIX REFINED: track `_vinResolved` boolean (true when Vendor_Item_No was actually resolved from `_vendorItemNo` or `_resolveVendorItemNo`). Guard becomes `bcFullPN&&_vinResolved?{partNumber:bcFullPN}:{}`. Handles all 4 scenarios: bulk-copy items write truncated (master-equivalent), short-PN crosses work, post-#163 items write full PN, PATCH-failed surrogates blocked. Three lines changed from C112's one-liner.
- **2026-06-27 (Session 6, cont.)** — C112: #163 P1 cross/replace regression trace. **CONFIRMED REGRESSION — FIX-BEFORE-PROD.** P1's `bcFullPN!==bcSurrogate` guard at commitBcItem line 26343 suppresses ALL legitimate crosses where the selected item's full PN equals its BC "No." — every short-PN cross and every backfilled item. Master wrote `partNumber:newPN` unconditionally; branch only writes when `bcFullPN!==bcSurrogate`, which is false for short PNs (CP2420→CP2420G) because BC No. = Vendor_Item_No = actual PN. Field audit: bcNo, price, description, isCrossed, crossedFrom all update correctly — ONLY partNumber is stale. Fix: one-line guard removal (`bcFullPN?{partNumber:bcFullPN}:{}`) — safe post-backfill because `bcFullPN` is always the resolved full PN via `_resolveVendorItemNo`. Deliverable: `docs/163-CROSS-REGRESSION-TRACE.md`.
- **2026-06-27 (Session 6, cont.)** — C111: #163 C110 fix re-review (delta `e18a8163..27bf12d4`). **BOTH PASS.** 3a: Marc's three-tier resolution (bcNoByKey cache → `_resolveBcNoFromVendorItemNo` API resolve → raw-PN fallback) ACCEPTED — exceeds the minimal fix, correctly handles the GUID-only case that pure price-loop threading wouldn't cover. `_resolveBcNoFromVendorItemNo` is a structurally clean inverse of `_resolveVendorItemNo` (same endpoint, same guards, correct field swap: filters `Vendor_Item_No eq`, returns `No`). Cache key `ln|rawPartNumber` consistent between write (31396) and read (31463). 3c: `.slice(0,20)` fallback mirrors `applyLearnedCorrections` exactly — alternates (`_altMatchesPN(a,pn.slice(0,20))`) matches line 10771, corrections (`c.badPN===pn.slice(0,20)||normPN(c.badPN)===normPN(pn.slice(0,20))`) matches line 10788. No BC writes added. Advisory notes both ACCEPTED: 20-char-prefix collision is same trade-off as P5 (full PN first, slice last resort); sequential API resolve covered by bcNoByKey cache in common case. C110 FIX-BEFORE-PROD conditions satisfied. Clear for test-channel deploy → T1-T10 → production.
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
- **2026-06-17 (Session 6, cont.)** — C102: #153 reconciliation cross trace. ReconciliationModal prior column shows pre-crossed (original) PNs instead of Jon's crossed/substituted PNs — would wipe crosses on commit. Static trace of full data flow: cross model (partNumber overwritten), prior source (latestPanelRef.current.bom), match engine (normPart on partNumber), carry-forward (unchanged preserves, pn_changed strips). No code path found that strips crosses — runtime race during drop→extraction→modal window most likely. Design defect found: `applyLearnedCorrections` runs on staging extraction with no stagingMode gate, masking real drawing changes. 4-point diagnostic log plan for CCD. Deliverable: `docs/153-RECON-CROSS-TRACE.md`.
- **2026-06-17 (Session 6, cont.)** — C103: #153 cross-aware reconciliation fix plan (FINALIZED). Root cause confirmed via v1.20.140 RECON TRACE logs — Candidate B definitively. Two-part fix: (1) gate `applyLearnedCorrections` behind `!cbs.stagingMode` at line 14581, (2) cross-aware pre-pass in `reconcileBom` matching crossed rows by `crossedFrom` before Pass 1. Carry-forward behavior: crossed rows → unchanged → `carryUnchanged` preserves cross+pricing; genuine PN changes fall to Pass 2 → `pn_changed` strips cross (correct). 5 scenarios mapped (A-E), Pass 2 interaction verified clean. ~20 lines total. 7 test criteria. Deliverable: `docs/153-CROSS-FIX-PLAN.md`.
- **2026-06-17 (Session 6, cont.)** — C104: #159 Copy-to-New-Quote customer selection scope. Copies stranded without customer/PRJ# because customer assignable only at creation. Fix: add BC customer picker (reuse existing `bcLoadAllCustomers`/`bcFilterCustomers`) to `CopyProjectModal`, pre-fill from source, call `bcCreateProject` on copy. ~70 lines, low risk. Tension resolved: fresh BC identity ≠ source carry-over. #159 logged. Deliverable: `docs/159-COPY-CUSTOMER-SCOPE.md`.
- **2026-06-29 (Session 7)** — C108 (collision with Session 6 C108/#163): #158 Region Learning 1MB Scope Trace. Full territory map of learning pipeline — storage schema, query path, 5 call sites in `applyLearnedCorrections`, size analysis (3.5KB/correction). No caps/limits per CLAUDE.md rule. C108 Rev 1: detailed plan (gzip + TTL archival, 3 phases, 7 tests, ~45 lines). Details below.
- **2026-06-29 (Session 7, cont.)** — C110/C111 (collision with Session 6 C110-C111/#163): #168 BC auto-sync divergence trace + plan. Two sync paths: Path A (fire-and-forget in `runPricingOnPanel`) and Path B (useEffect → `syncPlanningLinesToBC`). Path A redundant + race. Plan: delete Path A, add guard comments. Shipped v1.21.2. #168 tabled (symptom not reproduced post-race-removal). #170/#171 logged (BC sync residuals). Details below.
- **2026-06-29 (Session 7, cont.)** — COACH.md archiving: trimmed from 8,893 → 737 lines. C1-C99 archived to COACH-ARCHIVE.md (8,254 lines). Full session index + C100-C111 finding bodies retained. C96/C97 stubs + archive pointer added.
- **2026-06-29 (Session 7, cont.)** — Reconciliation cluster trace (#164/#165 current-state, read-only): #164 RESOLVED/not-reproducible (`keptDeleted.push(r)` preserves all fields mechanically); #160/C105 reject path VERIFIED on production crossed data (`{...m.prior}` preserves cross+pricing); #165 re-scoped (carryChangedPnChanged fires only on pn_changed; qty-Accept is cross-safe). Deliverable: `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md`.
- **2026-06-29 (Session 7, cont.)** — C117: #165 admin-only cross-strip detector scope. Predicate: `matchResult.changed.filter(m=>m.reason==="pn_changed"&&m.prior.isCrossed)`, gated `isAdmin()`, inline banner naming at-risk crossed-to PN(s). Inert — no auto-action. ~5 lines JSX. Shipped v1.21.3 (65d898e8). C118 (detector-diff verification) QUEUED for next session. Details below.
- **2026-06-29 (Session 7, cont.)** — RFQ over-selection trace (#175 evidence): `_eligibilityReason` (app.jsx:6314) three-tier short-circuit. Lead-time check (6337-6338) is INDEPENDENT include-trigger, no cooldown gate. v1.19.815 expanded "missing" to include AI-estimated (`leadTimeSource==="ai"`). PRJ402096: items have current BC pricing but lack firm lead times → all qualify as "missingLeadTime." Predicate correct as designed; over-selection is per-item state. #175 logged as visibility fix (next session first task).
- **2026-06-30 (Session 8)** — C119: #175 scope trace (FULL RED decision locked). Confirmed `_isBomRowFlaggedRed` (line 15771, single call site at 28715), RFQ predicate `isFirmLT` (line 6337), lead-time source enumeration (6 firm + ai + absent). Scope: ~5 lines — new `_hasFirmLeadTime(r)` shared helper + COND 4 in row-color + RFQ refactor. Deliverable: `docs/175-SUPPLEMENT.md`.
- **2026-06-30 (Session 8, cont.)** — C120: #175 Detailed Plan. 3 sections (~5 lines), 11 test criteria. Load-bearing step: inline `isFirmLT` DELETED, replaced by shared `_hasFirmLeadTime(r)`. Exclusion-gate analysis: two divergences (manual-price, DIN rail/duct) both benign — guarantee holds. Follow-up #176 logged (DIN rail/duct red noise). Deliverable: `docs/175-DETAILED-PLAN.md`.
- **2026-06-30 (Session 8, cont.)** — C121: #178 RFQ Pre-fill Fix Cluster scope trace (A/B/C). Part A: auto-checkbox bug — cooldown masks missing-price classification, `defaultLeadTimeOnly` fires on groups with priceless rows. Part B: unit price blank — data present on BOM row, deliberately excluded from normal-mode payload (`if(ltOnly)` guard). Part C: lead time blank — `referenceLeadTimeDays` stored unconditionally in Firestore but portal never reads it. ~30 lines estimated across 6 code sites. Deliverable: `docs/178-SUPPLEMENT.md`.
- **2026-06-30 (Session 8, cont.)** — C122: #179 Supplier Portal submit validation (A/B). Part A: spurious global LT gate at line 48016 blocks submit when "Fill all" field is empty even with all per-line fields filled — delete it. Part B: zero price validation exists in normal mode — add per-line price+LT completeness check with blocking arcAlert. ~15 lines, single code site (`handleSubmit`). Deliverable: `docs/179-SUPPLEMENT.md`.
- **2026-06-30 (Session 8, cont.)** — C123: #179 Detailed Plan (A/B/C, scope expanded). Part C pulled in per Freddy — missing LT must render red (#fca5a5 border + light red bg), matching price treatment. Shared `hasLeadTime` predicate drives both visual indicator and submit block — single definition guarantee. Also: global input's mandatory red border + asterisk removed (Part A expansion). 6 sections, 13 test criteria, ~20 lines. Deliverable: `docs/179-DETAILED-PLAN.md`.


## Findings

*(Architecture observations, risks, recommendations — dated, numbered)*

*Findings C1–C99 archived → [COACH-ARCHIVE.md](COACH-ARCHIVE.md)*

> **C96** — #153 Detailed Plan: Drawing-Revision Re-Extract + BOM Reconciliation — COMPLETE — `docs/153-PHASE1-PLAN.md` — archived → [COACH-ARCHIVE.md](COACH-ARCHIVE.md)
> **C97** — #153 Plan Addendum: Transient Staging + Disambiguation Prompt + Filter Fix — COMPLETE — `docs/153-PLAN-ADDENDUM.md` — archived → [COACH-ARCHIVE.md](COACH-ARCHIVE.md)

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

### C102 — #153 Reconciliation Cross Trace (2026-06-17)

**Type:** Read-only structural trace (urgent — potential data-loss)
**Status:** COMPLETE — runtime verification needed
**Deliverable:** `docs/153-RECON-CROSS-TRACE.md`
**Builds on:** C100, C101

---

#### Symptom

ReconciliationModal opened (47 unchanged / 4 changed / 3 new / 1 deleted) but the
"Prior Part#" column shows PRE-CROSSED (original extracted) PNs — not Jon's crossed
replacements. Committing would carry pre-cross state forward, wiping all crosses.
Jon cancelled (safe).

#### Key findings

1. **Cross data model confirmed:** `partNumber` is OVERWRITTEN with the replacement;
   `crossedFrom` stores the original. Both auto-crosses (`applyLearnedCorrections`)
   and manual crosses (BC Item Browser) use this model.

2. **Prior BOM source confirmed:** `latestPanelRef.current.bom`, deep-copied at modal
   mount. All examined code paths preserve crosses. No code path found that strips them.

3. **Root cause unpinnable statically:** Most likely a runtime race where something
   replaces the panel state with a pre-cross BOM during the drop→extraction→modal
   window.

4. **Design defect found:** `applyLearnedCorrections` at line 14583 runs on the staging
   extraction with NO `stagingMode` gate. This auto-crosses the new extraction
   identically to the prior BOM, causing reconcileBom to report "unchanged" for rows
   where the underlying drawing PN actually changed. **Recommended fix:** gate behind
   `!cbs.stagingMode`.

5. **4-point diagnostic log plan** provided for CCD (~10 lines of console.log). One
   reproduction will pin whether crosses are missing from the prior (Candidate A) or
   masked by double auto-cross (Candidate B).

---

### C103 — #153 Cross-Aware Reconciliation Fix Plan (2026-06-17)

**Type:** Finalized two-part fix plan (diff-gated, Marc builds)
**Status:** READY FOR IMPLEMENTATION
**Deliverable:** `docs/153-CROSS-FIX-PLAN.md`
**Builds on:** C102 (root cause confirmed by v1.20.140 RECON TRACE logs)

---

#### Root cause confirmed

Candidate B (C102) validated by runtime logs. All 4 diagnostic points returned:
prior has 17 crosses (Candidate A dead), staging extraction output has 16 crosses
(the smoking gun — `applyLearnedCorrections` re-applied DB crosses to the raw
extraction, masking all differences).

#### Two-part fix

1. **Gate `applyLearnedCorrections`** behind `!cbs.stagingMode` (line 14581, ~1 line).
   Staging extraction produces raw PNs.

2. **Cross-aware pre-pass in `reconcileBom`** (~18 lines, inserted before Pass 1).
   Matches crossed prior rows by `normPart(crossedFrom)` against extraction's
   `normPart(partNumber)`. Same underlying part → unchanged → `carryUnchanged`
   preserves cross + pricing + all user edits. Pass 1 guard added to skip
   already-matched rows.

Part 1 alone makes the problem WORSE (all crossed rows → pn_changed → strips cross).
Both parts must ship together.

#### Carry-forward behavior (5 scenarios verified)

- A: Drawing unchanged → cross pre-pass matches → unchanged → cross preserved
- B: Drawing changed PN → no match → Pass 2 → pn_changed → cross stripped (correct)
- C: Drawing updated to replacement PN → Pass 1 matches → unchanged → cross preserved
- D: Non-crossed row → Pass 1 as before → no regression
- E: Qty change on crossed row → cross pre-pass → changed-qty → cross preserved, qty updated

Pass 2 interaction verified clean — no changes to Pass 2 or Pass 3.

---

### C104 — #159 Copy-to-New-Quote Customer Selection Scope (2026-06-17)

**Type:** Scoping read + fix plan
**Status:** SCOPED — ready for implementation
**Deliverable:** `docs/159-COPY-CUSTOMER-SCOPE.md`

---

#### Problem

`CopyProjectModal` (line 43622) creates projects with no customer and no PRJ#.
Customer is assignable only at creation — copies are permanently stranded.

#### Scope

~70 lines, low risk. All BC functions already exist in `NewProjectModal`:

1. **Customer picker UI** (~35 lines): Reuse `bcLoadAllCustomers()` (line 4041) +
   `bcFilterCustomers()` (line 4111). Pre-fill from source project's customer.

2. **BC project creation** (~25 lines): After `copyProject()`, call
   `bcCreateProject()` (line 3984) → generates PRJ# + BC Job card. Update Firestore
   doc with `bcProjectId`, `bcProjectNumber`, `bcCustomerNumber`, `bcCustomerName`.
   Optional `bcCreatePanelTaskStructure()` for panel task lines.

3. **Progress + info text** (~10 lines): Add "BC project" step, update copy
   description from "No BC linkage" to "Fresh BC project — no purchasing state
   carried from source."

#### Tension resolved

Customer + PRJ# requires `bcCreateProject()` (creates a BC Job card). This IS a BC
connection, but it's the copy's OWN identity — not source carry-over. The copy still
excludes `bomSyncHash`, vendor assignments, pricing sources, BC item matches.

#### Decision for Jon

Should customer be REQUIRED on Copy? Recommendation: required when BC connected,
allowed-without when BC down (with warning).

#### Future

Post-creation customer reassignment flagged as separate enhancement.

---

### C105 — #160 Reconciliation Modal: Reject/Keep-Prior for Changed Rows (2026-06-17)

**Type:** Scoping read + fix plan
**Status:** SCOPED — ready for implementation
**Deliverable:** `docs/160-RECON-REJECT-SCOPE.md`

---

#### Problem

Changed rows in the ReconciliationModal offer only "Accept." No way to reject a
change and keep the prior row — critical for crossed rows where the prior contains
the user's deliberate substitution + pricing.

#### Key findings

1. **Gating already works** — `unresolved` computation at line 23113 counts changed
   rows without a resolution. Both `"accepted"` and `"rejected"` satisfy the gate.
   No changes needed.

2. **Silent drop bug** — `buildReconciledBom` (line 47422) only handles `"accepted"`.
   Any other resolution value causes the row to be silently dropped from the output
   BOM. Adding a Reject button without fixing this would cause rejected rows to vanish.

3. **Reject semantics** — `{...m.prior}` (shallow copy of prior row, exactly as-is).
   No position update for rejects: for `pn_changed` rejects, the extraction's position
   corresponds to the NEW PN's location, not the prior's. Consistent behavior regardless
   of change reason.

#### Scope

~6 lines, very low risk:

1. **Add Reject button** to changed row actions (line 23165) — `btn("#dc2626")`
   with toggled "✕ Keep Prior" state + "kept prior — differs from revision" indicator.

2. **Handle rejected resolution** in `buildReconciledBom` (line 47422) — `else if
   (res === "rejected") changedMerged.push({...m.prior})`.

3. **Footer text cleanup** (line 23190) — remove "(deletions individually)" parenthetical.

No new functions. No data model changes. No changes to `reconcileBom`. Fully contained
within `ReconciliationModal` + `buildReconciledBom`.

---

### C106 — Pre-Print Checklist "AI Prices" Overcount (2026-06-26)

**Type:** Read-only trace
**Status:** RESOLVED — NO BUG (misidentified source)
**Trigger:** PRJ402124 Pre-Print Checklist shows "28 AI" — Jon reports zero AI-priced rows in BOM table.

---

#### Initial trace (incorrect)

Analyzed the Check 2 pricing block (lines 37203-37224). Found the pricing predicate `r.priceSource==="ai"` (line 37210) is an exact match — no default-bucket, no inversion. Source array is `projectRef.current.panels` flatMapped — same as BOM table. Concluded the predicate was sound and hypothesized multi-panel aggregation as cause.

#### Correction (Marc runtime read)

Marc read PRJ402124 Firestore data: **0 of 89 rows** have `priceSource:"ai"` across all 4 panels. All 89 are `priceSource:"bc"`. The "28" is NOT from Check 2 (pricing). It is from the **AI lead-time checklist entry** at line 37183-37191:

```js
const aiLeadCount=_countAiLeadTimes(projectRef.current);
if(aiLeadCount>0){
  issues.push({
    type:"ailead",
    label:`${aiLeadCount} AI-estimated lead time${aiLeadCount>1?"s":""}`,
    ...
  });
}
```

28 rows have `leadTimeSource:"ai"` with `leadTimeEstimated:true` — clustered on Line 1 (17) and Line 4 (11). The modal text reads "AI-estimated lead times," not "AI prices." The budgetary stamp via `_markProjectBudgetaryForAiLeads` is working as designed.

#### Lesson

The symptom description said "AI prices" but the checklist entry said "AI-estimated lead times." I should have confirmed which checklist line item Jon was reading before tracing the pricing predicate. The pricing code path is correct and was never implicated.

---

### C107 — #163 Expanded: BC 20-Char PN Field Limit — Scoping Trace (2026-06-26)

**Type:** Read-only scoping trace (territory map, no fix)
**Status:** COMPLETE — ready for Brief
**Tip:** `bea037e5`

---

#### 1. THE PIVOT — WHERE DOES TRUNCATION HAPPEN?

**There is no ARC-side truncation.** No `.slice(0,20)`, `.substring(0,20)`, or any 20-char limit applied to `partNumber` anywhere in `src/app.jsx` or `functions/index.js`. Grep confirmed zero hits.

**Truncation is server-side in BC.** The `bcCreateItem` function (line 4889) sends the full PN as `body.number` to BC's `/companies(id)/items` REST API (line 4900, POST). BC enforces the 20-character limit on its `number` field server-side — it silently truncates or rejects. The API response returns the truncated `item.number`, which ARC then uses everywhere downstream.

**The truncated value enters ARC's BOM via `commitBcItem`.** At line 26249: `const newPN=bcItem.number` (the BC response's `.number`, already truncated). At line 26262: `partNumber:newPN` overwrites the BOM row's `partNumber` with the truncated value. This persists to Firestore via `saveProjectPanel` at line 26357.

**Once committed, the full PN is gone.** It exists only in the original AI extraction output (pre-`commitBcItem`). The `crossedFrom` field preserves the original extraction PN for crossed items, but for direct BC matches (not crosses), the extraction PN is overwritten with no breadcrumb.

#### 2. BC ITEM-CREATE PATH

**Create flow** (`bcCreateItem`, line 4889):
1. POST to `/companies(id)/items` with `body.number = fullPN` (line 4894/4900)
2. BC creates the item, truncating `number` to 20 chars server-side
3. Response: `item.number` = truncated value
4. Follow-up OData PATCH (line 4913-4931): sets `Vendor_No`, `Gen_Prod_Posting_Group`, `Inventory_Posting_Group`, `Manufacturer_Code`, and **`Vendor_Item_No`**

**Critical finding on Vendor_Item_No:** Line 4921:
```js
if(vendorNo)patch.Vendor_Item_No=item.number;
```
This sets `Vendor_Item_No` to **the already-truncated `item.number`**, NOT the full PN. The full PN is available in the `number` parameter passed to `bcCreateItem`, but it's never consulted after the POST. The PATCH uses the response's `item.number`.

**Is the full PN available in scope at create time?** YES. The `number` parameter to `bcCreateItem` carries the full PN. It survives until line 4894 where it's placed in `body.number`. After the POST, the function switches entirely to `item.number` (the response). The original `number` param is still in scope (closure) but never referenced again.

**Can a follow-up write issue after item creation?** YES. The PATCH at line 4913 already runs after item creation (with a 3-second wait for BC indexing, line 4925). Adding `Vendor_Item_No = number` (the param, not `item.number`) to that same PATCH is structurally trivial — the PATCH infrastructure is already there.

**Three call sites for `bcCreateItem`:**
- BC Item Browser "Create in BC" button (line 22375) — `createNumber` from user input
- Portal "Create New Item" flow (line 31481) — `newItemForm.itemNo` pre-filled from `item.partNumber`
- Supplier CSV import create (line 41866) — `row.partNumber`

#### 3. VENDOR ITEM NO. — CURRENT STATE

**Already written, but incorrectly.** `Vendor_Item_No` is actively used in 3 contexts:

(a) **`bcCreateItem` PATCH** (line 4921): `Vendor_Item_No = item.number` — copies the truncated "No." back in. This is the bug site for Jon's fix.

(b) **`bcUpsertItemVendorLeadTime`** (line 4365): Writes `Vendor_Item_No` on `ItemVendorCatalog` records (not `ItemCard`). Lines 4425-4426:
```js
if(vendorItemNo&&String(vendorItemNo).trim()&&String(vendorItemNo).trim()!==String(partNumber).trim()){
  body.Vendor_Item_No=String(vendorItemNo).trim();
}
```
Conditional: only written when `vendorItemNo` differs from `partNumber`. Called from portal apply (line 26052: `vendorItemNo:row.supplierPartNumber`), lead-time batch flush (line 26089), and pricing lead-time paths (lines 26680, 31361, 37684). These already pass supplier part numbers that may differ from BC's "No." — this path is correct for its purpose (ItemVendorCatalog, not ItemCard).

(c) **`bcFuzzyLookup` step 5** (line 4808): Searches across `No`, `Vendor_Item_No`, and `Common_Item_No` via `startswith()` — already reads `Vendor_Item_No` for matching. Once full PNs are stored there, fuzzy lookup would find them automatically.

(d) **`_bcFetchItemsViaItemCard`** (line 4566): Maps `item.Vendor_Item_No` to `_vendorItemNo` on search results. Used in scoring/filtering at line 4731.

**The field is NOT free** — it's actively written and read. But the current value (`item.number`, truncated) is wrong. Correcting it to the full PN would improve lookup AND fix display. No existing logic would break from a longer value there.

#### 4. partNumber AS A KEY — BLAST RADIUS

Every place `partNumber` is used as matching/lookup identity:

| # | Path | Line(s) | Key usage | Truncation impact |
|---|------|---------|-----------|-------------------|
| 1 | `bcLookupItem` | 4328 | `number eq '${pn}'` — exact match against BC "No." | If ARC stores full PN, this would FAIL (BC's No. is truncated). Must query by `Vendor_Item_No` or accept No.-based identity. |
| 2 | `bcFuzzyLookup` | 4758-4848 | Multi-step search: exact No., stripped search, contains, prefix. Step 5 already searches `Vendor_Item_No`. | Full PN in ARC → step 1 exact would fail. Step 5 (Vendor_Item_No startswith) would succeed IF backfill populates the field. |
| 3 | `applyLearnedCorrections` | 10711, 10728, 10737, 10747 | Alternates: `_altMatchesPN(a,pn)`. Corrections: `c.badPN===pn \|\| normPN(c.badPN)===normPN(pn)`. Part library: key match. Desc crosses: description-keyed. | Alternates DB stores the PN as learned (currently truncated for affected items). Un-truncating new rows won't match old DB entries that stored truncated PNs. One-time DB correction needed for affected items. |
| 4 | `reconcileBom` | 47290+ | `normPart(partNumber)` matching between prior BOM and new extraction | Extraction returns full PN. If prior BOM holds full PN, match succeeds. If prior BOM holds truncated (from old BC commit), match fails → shows as changed. One-time transition issue, self-corrects on re-extraction. |
| 5 | `bcSyncPanelPlanningLines` | 3662 | `No:row.partNumber` — pushed directly as BC planning line's Item No. | **CRITICAL.** If ARC stores full PN, this would push >20 chars into BC planning line `No` field → BC 400 rejection. This is the BC-push boundary Jon described — truncation MUST happen here. |
| 6 | `bcPushPurchasePrice` | 5126 | `Item_No:itemNo` on PurchasePrice record | Same as #5: BC field limit. Must use BC "No." (truncated), not full PN. |
| 7 | `bcPatchItemOData` | 4949 | `ItemCard?$filter=No eq '${itemNo}'` | Must use BC "No." for this lookup. |
| 8 | `bcFetchPurchasePrices` | 5152 | `Item_No eq '${pn}'` filter | Must use BC "No." |
| 9 | Quote PDF BOM hash | various | `computePanelBomHash` / `computeBomHash` | Display-only, no BC interaction. Full PN fine. |
| 10 | `normPart` matching (crosses, dedup) | ~20 sites | Cross detection: `normPart(crossedFrom)!==normPart(partNumber)` | If `partNumber` is full and `crossedFrom` is the extraction PN (also full), matching works. If `crossedFrom` stored a truncated value from a previous BC commit, the cross detection would break. Transition-period issue. |

**Summary of blast radius:** Paths 1, 5, 6, 7, 8 all send `partNumber` directly to BC fields with a 20-char limit. Un-truncating ARC's `partNumber` without adding a truncation-at-boundary layer would break BC sync. Path 3 (learning DB) has a stale-data transition issue for items learned while truncated.

#### 5. DOCUMENT + BROWSER RENDER SOURCES

| Surface | Field rendered | Line(s) | Fix difficulty |
|---------|---------------|---------|----------------|
| **RFQ email/PDF** | `item.partNumber` | 6435, 6446 (`_esc(item.partNumber\|\|"—")`) | Trivial — once ARC BOM stores full PN, RFQ shows it automatically. Zero code change on this surface. |
| **Traveler BOM (cover page PDF)** | `r.partNumber` | 8053 (`r.partNumber\|\|"—"`) | Same — auto-fixed when BOM row has full PN. Zero code change. |
| **BC Item Browser (picker modal)** | `item.number` | 22421 (`{item.number}`) | This reads BC's "No." field directly from the search result, NOT the ARC BOM row. Changing to `item._vendorItemNo\|\|item.number` is a ~1-line swap. Requires `_vendorItemNo` to be populated (the backfill). |
| **BOM table inline** | `row.partNumber` | 28558 column config | Auto-fixed when BOM row has full PN. |
| **Quote PDF** | `r.partNumber` | via `buildQuotePdfDoc` | Auto-fixed. |

#### Architecture summary for the Brief

Jon's proposed direction aligns well with the code. The fix has 3 layers:

**Layer A (storage):** ARC's BOM `partNumber` carries the full PN. The only mutation point is `commitBcItem` line 26262 — currently `partNumber:newPN` where `newPN = bcItem.number` (truncated). Change: keep ARC's original `partNumber` when it's longer than BC's "No.", or store full PN from a new field.

**Layer B (BC-push boundary):** Every path that writes `partNumber` into a BC field with a 20-char limit (planning lines, purchase prices, item lookups) must use the BC "No." (truncated), not the full PN. This is 5-8 call sites (paths #1, #5, #6, #7, #8 above). A helper like `bcItemNo(row)` that returns `row.bcItemNumber || row.partNumber.slice(0,20)` would centralize this.

**Layer C (Vendor_Item_No):** Fix `bcCreateItem` line 4921 to write the full PN (`number` param) instead of `item.number`. One-time backfill seeds existing items. BC Item Browser display (line 22421) swaps to `item._vendorItemNo||item.number`.

**Blast-radius caution:** The learning DB (alternates, corrections) has entries keyed by truncated PNs for affected items. A transition strategy is needed so old DB entries still match during the changeover period.

---

### C108 — #158 Region Learning 1MB Scope Trace (2026-06-29)

**Type:** Read-only scoping trace (pre-design)
**Status:** COMPLETE — scope doc delivered at `docs/158-REGION-LEARNING-SCOPE.md`
**Tip:** master `fdad5f36` (no code changes — read-only trace)

---

#### Root cause confirmed

Single Firestore document at `config/region_learning` stores up to 30 entries in a flat
`{examples:[...]}` array. Each entry carries an inline base64 JPEG thumbnail (30–130 KB
encoded). The 30-entry sliding window was designed to bound the doc, but the code comment
"thumbnails at ≤100KB give headroom" miscalculated: 30 × ~37 KB average = ~1.1 MB,
routinely breaching the 1,048,576-byte hard limit. Company XODxZ8xJc0dQXGZI7jbo is
frozen at 1.1–1.18 MB — all writes silently fail via `.catch(console.warn)` at lines
13325, 13331, 13336.

#### Reader enumeration (5 read sites + 1 passthrough)

All readers consume `loadRegionLearning(uid)` (R1, line 13312) which returns the flat
array. R1 is the ONLY function that touches Firestore directly. Downstream consumers:

- R2: `extractBomPage` client (line 12340) — feeds AI extraction prompt
- R3: `detectPageTypes` (line 15268) — feeds page classification prompt
- R4: Settings UI (line 17717) — admin display/prune
- R5: `_captureRegionForLearning` (line 21362) — dedup check before save
- R6: CF `extractBomPage` (functions/index.js:2395) — passthrough, no Firestore read

**Refactor is contained to R1.** All others consume R1's return value (array) unchanged.

#### Proposed fix: subcollection per entry

`config/region_learning/entries/{entryId}` — one doc per example. Individual thumbnails
are 50–150 KB, well under the 1 MB per-doc limit. `loadRegionLearning` becomes a
`getDocs()` subcollection query returning the same array. Five write/delete/update
functions refactored. Backward-compatible dual-path read (subcollection-first, old-doc
fallback). Firestore rules: add explicit `entries/{entryId}` match.

#### Migration: one-time admin-triggered batch

Read the frozen doc → batch write entries to subcollection → delete old doc → write
manifest. Atomic via Firestore batch (≤32 ops). **Marc runtime pull dependency:**
need actual entry count + thumbnail sizes from the frozen doc before finalizing.

#### Gap noted

`extractBomBatch` (line 12297) does not pass region learning context — pre-existing gap,
not caused by #158, not in scope.

Full detail: `docs/158-REGION-LEARNING-SCOPE.md`

---

### C108 Rev 1 — #158 Detailed Plan (2026-06-29)

**Type:** Detailed implementation plan (read-only — no build, no deploy)
**Status:** COMPLETE — plan delivered at `docs/158-DETAILED-PLAN.md`
**Tip:** master `fdad5f36` (no code changes)

---

#### Retargeting from C108 scope

Marc's runtime pull showed the frozen doc has **9 entries** (not 30) at **1,044,357
bytes**. Thumbnails average ~115K chars each (range 58K–203K), not the ~37K the scope
assumed. Root driver is **uncapped thumbnail height** in `cropRegionToBase64` (line
13339): `maxWidth=800` but height proportional to region aspect ratio. A full-page BOM
region yields a ~200K blob. The 30-entry sliding window is irrelevant — 9 entries blew
the limit.

#### Plan structure (5 phases, ordered for frozen-company safety)

1. **Thumbnail cap** — step-down algorithm in `cropRegionToBase64` (line 13339): render
   → measure → if over 250K chars, reduce quality then dimensions → re-render. Bounds
   future entries. Does not retroactively resize existing entries.

2. **Subcollection restructure** — `config/region_learning/entries/{entryId}`. Rewrite
   `_rlPath` → `_rlDocPath`/`_rlEntriesPath`. `loadRegionLearning` (R1, the ONLY
   Firestore-touching read) gets dual-path: subcollection-first, old-doc fallback.
   Merges both sources during transition window (prevents split-brain between deploy
   and migration). Write functions (W1/W2/W3) write to subcollection only. NO lazy
   migration from the read path.

3. **Loud failures + rules** — Remove `.catch(console.warn)` at lines 13325/13331/13336;
   functions now throw. `_captureRegionForLearning` (line 21373) stays non-blocking but
   routes failures to `logDebugEntry` (admin Debug Logs). Firestore rules: add
   `entries/{entryId}` match under `config/region_learning`.

4. **Migration** (post-deploy, admin-triggered) — Read frozen doc → batch write 9
   entries to subcollection → overwrite old doc with slim manifest (`.set()` is
   load-bearing — it unfreezes the doc path). 10 ops, atomic batch. Marc executes
   per-company.

5. **Verify** — Settings renders all entries; new capture writes succeed; extraction
   feeds learning context; tall-region thumbnail ≤250K chars.

#### Rollout sequence

Phases 1–3 deploy together. **Phase 4 runs IMMEDIATELY after deploy, same session,
before new captures** — shrinks the transition window to ~zero for the frozen company.

#### Accepted limitation: transition-window write holes (Rev 2)

Between deploy and migration, the merged read returns entries from BOTH sources, but
writes target the subcollection only. Two non-destructive edge cases for old-doc-only
entries during the window: (1) `.update()` on an old-doc-only entry throws (caught by
`_captureRegionForLearning` try/catch — non-blocking); (2) `.delete()` of an old-doc-only
entry no-ops and the entry resurrects on next merged read. Both self-clear at migration.
Mitigated by process (immediate Phase 4), NOT by gold-plating the write path.

Full detail: `docs/158-DETAILED-PLAN.md`

---

### C110 — #168 Auto vs Manual BC Sync Divergence Trace (2026-06-29)

**Type:** Read-only trace (evidence-first)
**Status:** RACE PROVEN + SHIPPED (v1.21.2) — race was real but was NOT the popup's cause
**Tip:** master (no code changes — read-only trace)
**Disposition (2026-06-29):** Race correctly identified and removed in v1.21.2 (Path A
deleted). Runtime evidence then showed the popup originated from Path B (the path we kept),
driven by deterministic per-item POST failures — not duplicate-record race collisions.
Posting-group theory also dead (all three flagged items have valid posting groups in BC).
Reported symptom did not survive once the race was removed; only reproduction is legitimately
missing items (e.g. JOB BUYOFF not in BC), which is correct behavior. #168 tabled.

---

#### Root cause: concurrent execution, not lookup key or async prerequisite

`runPricingOnPanel` fires `bcSyncPanelPlanningLines` directly at line 27460 (fire-and-forget,
no guards, no popup, no `bcSyncing` interlock). The `useEffect` auto-sync at line 25098–25120
independently detects the `priceSource:"bc"` count increase and fires `syncPlanningLinesToBC()`
→ `bcSyncPanelPlanningLines` 3 seconds later. Both calls operate on the same BC task with the
same panel data. No mutex exists between them.

#### How the race produces the popup

1. Path A (direct, line 27460) starts first — GETs 0 existing lines, enters Step 2b
   posting-group checks (~10–25s serial).
2. Path B (useEffect, line 25120) fires 3s later — GETs 0 existing lines (Path A hasn't
   created any yet, still in Step 2b).
3. Both enter Step 3 and POST the same lines (60000, 70000, …) concurrently.
4. For each Line_No, one POST wins and one gets a BC rejection (duplicate record). The
   loser tries `_fallback` (Type:"Text", same Line_No) → also fails. Items go into
   Path B's `failedRows` → `setSyncFailedAlert` → **popup**.

#### Why manual works

By the time the user dismisses the popup and clicks "BC Sync," both calls have finished.
BC has all lines (created by whichever POST won each Line_No). The manual sync (same
`syncPlanningLinesToBC` function) GETs the complete state, PATCHes or skips each line,
reports zero failures.

#### Hypotheses ruled out

- **Lookup key (bcNo vs partNumber):** Both paths use `_bcNo(row)` (line 4325). `bcNo` is
  populated during pricing (line 27020). Same key, same values.
- **VIN resolution (`_resolveVendorItemNo`):** Only used in `commitBcItem` (Item Browser
  flow). NOT on the pricing → auto-sync path.
- **BC token:** Both paths guard on `_bcToken`. Same token, same BC environment.
- **Timing of `bcNo` population:** `bcNo` is set before either sync call fires (pricing
  stamps it, `onUpdate` propagates it).

#### Why Path A exists alongside the useEffect auto-sync

Path A (line 27459 comment: "Auto-sync to BC after pricing is complete") appears to be a
direct sync convenience added without awareness that the useEffect at line 25098 already
triggers on the same state change (bcCount increase → 3s debounce → syncPlanningLinesToBC).
Path A bypasses `syncPlanningLinesToBC` entirely — it doesn't set `bcSyncing`, doesn't set
`bomSyncHash`, and doesn't clear the useEffect timer. Path B has no way to know Path A is
already running.

#### Marc runtime pull (confirmatory, not blocking)

Capture the raw `r.error` string from `result.failed` on the next occurrence. The
`parseBcError` helper at line 27701 classifies the error, but the raw BC response would
confirm whether BC says "record already exists" vs another rejection. Console output from
Path A's `"Post-pricing BC sync: N items failed"` (line 27462) would also show whether
Path A saw concurrent failures.

Full detail: `docs/168-BC-SYNC-DIVERGENCE-SCOPE.md`

---

### C111 — #168 Detailed Plan: Consolidate BC Auto-Sync (2026-06-29)

**Type:** Detailed implementation plan (read-only — no build, no deploy)
**Status:** SHIPPED (v1.21.2) — Path A deletion + guard comments deployed
**Depends on:** C110 divergence trace
**Disposition (2026-06-29):** Plan executed, v1.21.2 shipped. The race removal was a real
improvement (eliminated duplicate-trigger + premature POST). However, #168's reported popup
symptom was NOT caused by the race — it was deterministic per-item failures. Two surviving
diagnostics items logged as LOW for Marc: (1) Type:"Text" fallback on
Project_Planning_Lines_Excel is dead logic — BC always rejects it, masking the real
Type:"Item" POST error; (2) line 3762 discards the primary POST error body (`txt` read but
not stored), so `failedRows` only carries the misleading fallback error. Neither blocks
current work; both are first-move if #168 ever resurfaces with a genuinely-in-BC item.

---

#### Decision (Jon)

Delete Path A (direct fire-and-forget `bcSyncPanelPlanningLines` at line 27460).
Path B (useEffect → `syncPlanningLinesToBC`) becomes the sole foreground auto-sync.
Manual button (Path C) unchanged. Failure popup stays.

#### Verification results (both settled before plan was written)

**V1 — Task-Description Sync Coverage: NO ORPHAN.** Path A chains
`bcSyncPanelTaskDescriptions` in its `.then()`, but `syncPlanningLinesToBC` already
calls the same function at line 25181. Deleting Path A loses nothing.
`runPricingBackground` (line 15191) also has its own — untouched by this fix.

**V2 — Unpriced Guard Coverage: AIRTIGHT (two layers).** The useEffect guard at
line 25115 blocks when `bcCountIncreased && !ecoChanged` and unpriced rows exist.
ECO path deliberately bypasses this (comment at 25112-25114 — rows inherit base
pricing). But `syncPlanningLinesToBC` has its own unpriced guard at line 25160 that
catches AI-priced items on ALL paths including ECO. Two independent guards prevent
AI-estimated items from auto-syncing to BC.

#### Plan structure (3 phases)

1. **Delete Path A** — remove lines 27459–27467 (the `if(bcProjectNumber&&_bcToken
   &&updatedBom.length>0){...}` block inside `runPricingOnPanel`). Leave
   `runPricingBackground` sync at line 15190 untouched (separate concern, no race).

2. **Load-bearing guard comments** — mark both unpriced guard sites with `LOAD-BEARING
   GUARD (#168)` comments to prevent future sessions from "simplifying" away the
   gate that blocks AI-item auto-sync.

3. **Verify (Marc)** — T1: race eliminated (fully priced quote, no popup, one
   console log line); T2: task descriptions still sync; T3: AI-item quote does NOT
   auto-sync; T4: re-sync idempotency (hash guard skips unchanged BOM).

#### Scope boundary

In scope: delete Path A, add guard comments, verify. Out of scope:
`runPricingBackground` (line 15190), useEffect trigger logic, `syncPlanningLinesToBC`
function body, failure popup.

Full detail: `docs/168-DETAILED-PLAN.md`

---

### C117 — #165 Admin-Only Cross-Strip Detector Scope (2026-06-29)

**Type:** Scope note for CCD (Marc builds, Coach scopes)
**Status:** SHIPPED (v1.21.3, commit 65d898e8)
**Depends on:** C102 (reconciliation cross trace), C105 (#160 reject/keep-prior)

#### Background

#165's remaining risk: a Changed row with `reason:"pn_changed"` AND `m.prior.isCrossed`
Accepted → `carryChangedPnChanged` whitelist strips cross fields (isCrossed, crossedFrom,
crossedTo, crossedDate) + pricing + BC data. By design (whitelist only carries id,
partNumber, qty, description, manufacturer, itemNo, coordinates) but creates data loss
when the prior row was a user cross/substitution.

#### Scope (4 elements)

1. **Predicate:** `matchResult.changed.filter(m => m.reason === "pn_changed" && m.prior.isCrossed)`.
   Both fields present in match result — `reason` set by Pass 2 of `reconcileBom`,
   `isCrossed` carried on `m.prior` from the prior BOM row.

2. **Role gate:** `isAdmin()` (line 1994) — module-global, reads `_appCtx.role === "admin"`.
   No prop threading needed.

3. **Render point:** Inside ReconciliationModal's changed-rows section. Non-blocking inline
   banner naming the at-risk crossed-to PN(s). Fires only when `cands.length > 0`.

4. **Inertness:** Pure render. No auto-accept, no auto-reject, no resolve-state mutation,
   no commit-path change. Arms the manual Accept-on-crossed test for #165(B).

#### Deployed behavior

Shipped v1.21.3. Force-render verified via harness. Named PN confirmed = crossed-to
value. No banner on non-pn_changed reconciliations (confirmed by PRJ402096 commit).
This is #165 TOOLING, not a fix.

---

### C118 — #165 Detector-Diff Verification (2026-06-29)

**Type:** Code-path verification
**Status:** QUEUED — not done this session, open for Coach next session
**Depends on:** C117

Verify deployed diff (`git show 65d898e8 -- src/app.jsx`) matches C117 scope exactly.
Confirm: predicate, role gate, render point, inertness — no unscoped logic changes.

---

### C119 — #175 RFQ Lead-Time Visibility: Scope Trace (2026-06-30)

**Type:** Scope trace + supplement (pre-implementation, read-only)
**Status:** COMPLETE — feeds Detailed Plan
**Deliverable:** `docs/175-SUPPLEMENT.md`
**Decision locked:** FULL RED (Jon)

---

#### Trace summary

1. **Row-color source:** `_isBomRowFlaggedRed` at line 15771 — confirmed name, location, single call site (BOM table row bg at 28715). Three current conditions: qty=0, unitPrice=0, priceDate missing/stale. Exclusions: labor, customerSupplied, `_isExcludedFromPriceCheck`, vendor=customer.

2. **Lead-time state:** `leadTimeDays` (number|null), `leadTimeSource` (6 firm values + `"ai"` non-firm + undefined), `leadTimeUpdatedAt`, `leadTimeEstimated` (legacy). Firm sources: `bc_vendor`, `bc_item`, `supplier`, `scraper`, `manual`. Non-firm: `ai`, absent.

3. **RFQ predicate confirmed:** `isFirmLT = r.leadTimeDays != null && r.leadTimeSource && r.leadTimeSource !== "ai"` at line 6337 inside `_eligibilityReason` (line 6314). Lines current. Predicate is correct for factoring into a shared `_hasFirmLeadTime(r)` helper — pure function on row, orthogonal to per-caller exclusions.

4. **Scope:** ~5 lines total. New `_hasFirmLeadTime(r)` helper, add COND 4 to `_isBomRowFlaggedRed` (same exclusion gate as COND 3), refactor `_eligibilityReason` to use shared helper. NOT in scope: `findIncompleteQuoteItems` (send gate), RFQ breadth policy (HARD FENCE), pre-print checklist.

#### Visual-impact note

PRJ402096-class projects (~34/64 rows with AI lead times) will see ~34 additional red rows. Intended per FULL RED decision. Existing italic/asterisk/muted on the lead-time cell value provides secondary signal for why.

#### Regression surface

Zero behavioral regression. Single new visual condition in an existing predicate. All other lead-time consumers (pre-print checklist, budgetary auto-stamp, lead-time drivers, pricing skip guards) are independent paths — none touched.

---

### C120 — #175 Detailed Plan: RFQ Lead-Time Visibility (FULL RED) (2026-06-30)

**Type:** Detailed implementation plan (read-only — no build, no deploy)
**Status:** READY FOR APPROVAL
**Deliverable:** `docs/175-DETAILED-PLAN.md`
**Builds on:** C119 scope trace

---

#### Plan structure (3 sections, ~5 lines)

1. **§1 — New `_hasFirmLeadTime(r)` helper** (3 lines, before `_isBuyoffOrCrate` at line 15747). Pure predicate: `leadTimeDays!=null && leadTimeSource && leadTimeSource!=="ai"`.

2. **§2 — SINGLE DEFINITION (load-bearing):** Delete the inline `const isFirmLT=...` at line 6337, replace with `if(!_hasFirmLeadTime(r))return "missingLeadTime"`. Pre-deploy grep gate: `isFirmLT` → 0 hits, `leadTimeSource!=="ai"` → 0 hits in predicate context.

3. **§3 — COND 4 in `_isBomRowFlaggedRed`:** Add `if(!_hasFirmLeadTime(r))return true;` inside the existing `!_isExcludedFromPriceCheck(r) && !vendorIsCustomer` gate (line 15776). Same exclusion set as stale-price check.

#### Exclusion-gate analysis (§4)

Full side-by-side comparison of `_isExcludedFromPriceCheck` (row-color) vs `_eligibilityReason` (RFQ) exclusion sets. Two divergences:

- **`priceSource==="manual"`** (RFQ excludes, row-color doesn't): Correct — manual price doesn't imply known delivery. Row turns red, RFQ skips. Guarantee holds.

- **DIN rail / duct** (RFQ excludes via `RFQ_EXCLUDE_ITEMS`, row-color doesn't): Wrong-looking red but harmless — guarantee holds (not-red ⇒ not-RFQ'd). Logged as follow-up #176.

**Guarantee intact:** row-color ⊇ RFQ for lead-time flagging. "Not red" always means "won't be RFQ'd for lead time."

#### Regression surface

Single call site for `_isBomRowFlaggedRed` (line 28715, BOM table only). No print/PDF/export path reads it. `findIncompleteQuoteItems` (send gate) NOT touched — lead-time send-gating is a separate decision. All other `leadTimeSource` consumers are independent read/write paths — none affected. 11 test criteria (T1–T11).

---

### C121 — #178 RFQ Pre-fill Fix Cluster Scope Trace (2026-06-30)

**Type:** Read-only scope trace (A/B/C)
**Status:** SCOPE COMPLETE — feeds Detailed Plan
**Deliverable:** `docs/178-SUPPLEMENT.md`

---

#### Part A — "Lead Time Only" auto-checkbox bug

**Root cause:** Cooldown interaction with `_eligibilityReason`'s short-circuit.

When a row is in RFQ cooldown (rfqSentDate within 30 days), `_eligibilityReason` skips price checks and falls through to the lead-time check. A row with `unitPrice===0` but in cooldown returns `"missingLeadTime"` instead of `"missingPrice"`. The per-group counter `itemsMissingPrice` stays 0, so the auto-set at line 6380 fires:

```js
g.defaultLeadTimeOnly=(g.itemsMissingPrice===0&&g.itemsStalePrice===0&&g.itemsMissingLeadTime>0);
```

**Correct rule:** `defaultLeadTimeOnly = true` ONLY when every row has `unitPrice > 0` AND at least one row needs a lead time. Evaluate price presence directly, not via the reason classification.

#### Part B — Unit Price column blank in normal mode

**Answer to KEY QUESTION:** POPULATION DECISION, not data-fetch gap. Price IS present on `item.unitPrice` at RFQ-gen time. Deliberately excluded from normal-mode payload:

- Firestore payload (line 19193): `referencePrice` gated by `if(ltOnly)`
- Email HTML (line 6509): normal mode → `&nbsp;`
- PDF (line 8216): normal mode → `""`
- Portal (line 48367): blank editable input

Infrastructure exists in leadTimeOnly mode — extend to normal mode (editable, not read-only).

#### Part C — Lead Time column blank (conditional pre-fill)

**Answer to KEY QUESTION:** RENDERING GAP. `referenceLeadTimeDays` IS stored unconditionally in Firestore (line 19191). Portal never reads it. Grep: single hit at line 19191 = write-only.

**Fix:** Conditional pre-fill using `_hasFirmLeadTime` logic on stored `referenceLeadTimeSource`. Pre-fill firm sources (bc_vendor, bc_item, supplier, scraper, manual). Leave blank for AI/absent.

#### Regression surface

6 code sites across 2 paths (ARC-side build + portal render). ~30 lines estimated. Parts are independent but share payload path — ship together. Full enumeration in `docs/178-SUPPLEMENT.md`.

---

### C122 — #179 Supplier Portal Submit Validation (2026-06-30)

**Type:** Read-only scope trace (A/B)
**Status:** SCOPE COMPLETE — feeds Detailed Plan
**Deliverable:** `docs/179-SUPPLEMENT.md`

---

#### Part A — Spurious global lead time gate

**Line 48016:** `if(!leadTime.trim()){arcAlert("Please enter the lead time in days ARO...");return;}`

This is the normal-mode (non-leadTimeOnly) branch of submit validation. Requires the global "Fill all Lead Times at once" input to be non-empty — even when every per-line lead time is already filled. The global field is a convenience auto-fill tool, not an authoritative source. Auto-propagation (lines 47990–48001, which fills blank per-line entries from the global value) is preserved.

**Fix:** Delete the global gate. Replace with per-line validation (Part B).

#### Part B — No price validation, no per-line LT validation in normal mode

Current validation in `handleSubmit`:
- **leadTimeOnly:** Per-line LT validation (each non-cannotSupply line must have LT). No price check (prices read-only).
- **Normal:** Global LT required. **No price check. No per-line LT check.**

A supplier can submit in normal mode with entirely blank prices. No blocking.

**Fix:** Per-line check — each non-cannotSupply row must have both `unitPrices[i]` (non-empty, > 0) AND `_itemLeadTimesEffective[i]` (non-empty, > 0). Blocking `arcAlert` on failure with generic message (don't enumerate rows — existing red indicators for missing prices guide the supplier).

**Visual gap noted:** Missing prices render red (border `#fca5a5`, bg `#fff5f5`, `⚠ Missing`). Missing lead times have NO visual indicator. **Promoted to Part C in C123 Detailed Plan** — correctness hazard, not cosmetic.

#### Scope

~15 lines as scoped in C122. Expanded to ~20 lines in C123 Detailed Plan (Part C added).

---

### C123 — #179 Detailed Plan (2026-06-30)

**Type:** Detailed Plan (A/B/C — scope expanded from C122)
**Status:** READY FOR APPROVAL
**Deliverable:** `docs/179-DETAILED-PLAN.md`
**Builds on:** C122

---

#### Scope expansion

Part C (missing LT visual indicator) pulled in per analyst ruling: if the submit blocks
on missing LT, the row must show it. Without the red indicator, the supplier hits an
invisible wall — the #175 failure mode inverted.

#### Shared predicate guarantee

`hasLeadTime` — single definition at line 48281 (per-row rendering scope):
```js
const hasLeadTime=!cant&&itemLeadTimes[i]!=null&&String(itemLeadTimes[i]).trim()!==''&&(+itemLeadTimes[i]>0);
```

Two consumers:
- **Visual indicator (§3):** LT input gets `border: 1px solid #fca5a5` + `background: #fff5f5` when `!hasLeadTime`
- **Submit block (§4):** Same expression on `_itemLeadTimesEffective[i]` (post-auto-propagation, synced to state before validation)

Variables converge before the supplier sees the result: `setItemLeadTimes(filled)` at line 48000 fires before validation, updating React state → visual indicators update on re-render.

#### Plan structure (6 sections, ~20 lines)

1. **§1 — `hasLeadTime` predicate** — 1 line, below `hasPrice` at 48281
2. **§2 — Part A** — delete global gate (48015-48016) + remove red border (48238) + remove red asterisk (48239)
3. **§3 — Part C** — red border + light red bg on LT input (48385-48391). Optional `⚠` indicator if cell layout permits (Marc's call)
4. **§4 — Part B** — per-line price+LT check in `else` branch (replaces deleted gate). Generic arcAlert, no enumeration
5. **§5 — Guarantee statement** — visual ⊆ submit block. Every blocked row shows red.
6. **§6 — Regression surface** — zero behavioral regression. leadTimeOnly unchanged. No payload/Firestore/ARC-side changes.

13 test criteria (T1–T13).

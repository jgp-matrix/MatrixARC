# Session State — 2026-06-02 22:30 MDT

## Version
v1.20.87 (deployed 2026-06-02). JPEG+P2 extraction fix shipped. PNG reverted.

## Recent Commits (last 15)
- fc78d4de Release v1.20.87
- ed6699f2 Add TODO #84-85: missing items + Excel cross-check validation finding
- 9df5d295 Release v1.20.86
- 057f85fd Release v1.20.85
- b13f6b59 Update TODO #81: expand to extraction anomaly detection modal
- 10fdced5 Fix #82 P1: remove noBomReason escape from pdf-native when CropBox applied
- 4e31f918 Add scan quality alert to bom-region-crop fallback prompt (#82 P2)
- 2f4ef29d Release v1.20.84
- 706bf803 Release v1.20.83
- 4b1ee010 Add TODO #81-83: PRJ402119 extraction failure findings
- 126f5f35 Fix supplier portal catch to distinguish timeout vs network error
- 4f8796f4 Add 480s AbortController timeout to all Anthropic API fetch calls
- 34e89677 Add TODO #80: feedback re-extract PN-only dedup key merges too aggressively
- 96023467 Release v1.20.82
- 4c77f5da Close TODO #79 verification gap — runtime dedup test passes all 5 scenarios

## EXTRACTION INVESTIGATION — RESOLVED

**READ THIS BEFORE ANYONE RE-OPENS EXTRACTION WORK.**

The "persistent 3036338→3038338 misread" that drove hours of PNG/upscale/native-res/temperature investigation was a **GROUND-TRUTH ERROR**, not a model bug. The drawing says 3038338. The model read it correctly every run. Marc's comparison table had the wrong reference value (3036338). Both are valid Phoenix Contact parts — the BC catalog could NOT disambiguate; only the drawing/source could. There is NO scan-quality ceiling on this character.

**Do NOT re-chase:** PNG encode, 2000px upscale removal, native-res crop, temperature/determinism fixes — all of this work was chasing a phantom error that didn't exist.

Key findings that DO stand:
- **P2 quality alert is the real fix** — accurate part numbers on scanned drawings (v1.20.84, #82 P2)
- **Nondeterminism = routing variance**, not model variance (5/5 byte-identical runs on same path)
- **#83 reliable routing** addresses the variance by ensuring scanned docs hit JPEG+P2 path
- **PNG reverted** — JPEG+P2 found MORE items (13 vs 12)
- **PRJ402119 outcome:** 13 of 14 items found, all found items accurate, 1 missing (#84)
- **Image fidelity audit** (Coach): cataloged 4 pipeline leaks (#1 upload double-JPEG, #2 ensureDataUrl re-encode, #3 useless 2000px upscale, #4 crop JPEG encode). Leak #3 confirmed useless overhead — worth removing. PDF-native is the lossless gold path when it works. Audit stands as permanent reference even though the acute bug was a phantom.

**Validation finding (load-bearing for Ovivo):** BC catalog validation alone cannot catch a misread that lands on another valid PN. Only the drawing/source disambiguates. This makes the Excel cross-check (#85) load-bearing for Ovivo-class customers, not optional.

## Shipped This Session
- [DONE] #77/#78 — Pre-extraction page mgmt — v1.20.80 (dfbb2293), field-verified by Jon + Noah
- [DONE] F-1d.8 / F-1a.3 / TODO #79 — BOM prompt duplicate-merge fix — v1.20.81 (4cfaeb81 + 67dd897c). Server half-deploy gap found and closed (deploy.sh only deploys hosting; functions deployed separately)
- [DONE] Cross-session Freddy continuity — FREDDY.md startup directive, CLAUDE.md step 6c (91f180d9)
- [DONE] AbortController on extraction fetches — 480s timeout on all Anthropic API calls (4f8796f4)
- [DONE] #82 P2 — Scan quality alert added to bom-region-crop fallback prompt (4e31f918)
- [DONE] #82 P1 — Removed noBomReason escape from pdf-native when CropBox applied (10fdced5)
- [DONE] #83 — Reliable routing for scanned documents to JPEG+P2 path
- [DONE] PNG revert — JPEG+P2 outperforms PNG on scanned drawings (v1.20.87)

## Open Items

### HIGH — Next extraction work (fresh-head)
- **#84 — Missing items (13/14).** Two specific drops on PRJ402119:
  - LNM40BPK100: last-row drop — possibly systematic trailing-item truncation. Check if reproducible across projects.
  - TYD2CW6: companion-on-same-row — splitCompanionParts didn't fire. Why?
  - Coach trace points: `_parseAndVerifyBomRaw` (silent item drop), `filterNonBomRows` (4-field structural reject), L3 merge pick-winner on duplicate itemNo keys.

### MEDIUM — Confirm/close
- **#83 — Reliable routing:** Confirm deployed and working (scanned docs → JPEG+P2). May already be done.
- **#82 — PDF-native empty on scanned-bitmap-in-PDF.** Likely WON'T-FIX / route around. JPEG+P2 works for scans; PDF-native not needed. Decision item, not a code fix.

### FEATURE — Multi-day, gated
- **#85 — Excel BOM cross-check/import.** Full feature. Gated on Noah confirming Ovivo will send Excel files. Design pipeline complete: Brief + Supplement + Analyst Review done. Needs Detailed Plan. D-REV-1 (revision metadata cross-check) open.
- **F-1g.1 — Dedup message fix.** Analyst Review + Detailed Plan (F-1g1-DETAILED-PLAN.md) approved. Was queued for Marc. 5 code sites, ~35 LOC, 5-case test matrix.

### HIGH — Ongoing
- **F-2d.1 / #64** — BC concurrency sweep. ~44 ungated fetch sites remain. Phase 1 shipped (v1.20.79). Absorbed into #64.
- **#66** — bcCreatePanelTaskStructure idempotency gap (~20 LOC)

## Noah Production Bugs (reported today, NOT diagnosed)
- **BOM edits revert** — suspected stale-state-overwrite race (#65 class). Needs investigation.
- **Quotes randomly drop fields** including Budgetary header. A quote ALREADY SHIPPED to a customer may be missing the Budgetary header — **needs human verification of the sent PDF** before any code investigation.

## Design Banked (ready for implementation)
- **#85 Excel import** — Brief + Supplement + Analyst Review complete. Detailed Plan pending. D-REV-1 open.
- **F-1g.1 dedup message** — Analyst Review final. Detailed Plan at F-1g1-DETAILED-PLAN.md (in repo, untracked). 5 code sites, ~35 LOC, approved.

## Freddy Docs NOT in Repo
The following exist only in the Claude.ai browser session (Freddy). Commit if durable copies wanted:
- Excel BOM Import Brief + Analyst Review
- F-1g.1 Brief + Analyst Review

## Work Queue
1. Noah production bugs (BOM revert, quote field drop) — triage/diagnose
2. #84 — Missing items investigation (fresh-head)
3. F-1g.1 — Implementation (Detailed Plan approved)
4. #66 — bcCreatePanelTaskStructure idempotency
5. #64 — BC concurrency sweep

## Working Tree
- Branch: master (up to date with origin/master at fc78d4de)
- Untracked: F-1g1-DETAILED-PLAN.md

## Open TODOs
51 OPEN findings in TODO.md

## Codebase Audit
76 total findings in ARC-AUDIT-FINDINGS.md. F-1a.3 RESOLVED v1.20.81. F-2d.1 downgraded to HIGH (absorbed into #64). Top unresolved CRITICALs: F-1g.1 (misleading dedup message — plan approved), F-2b.1 (save guard asymmetry), F-3c.4 (partial sync green checkmark), F-3a.1 (restore lock leak).

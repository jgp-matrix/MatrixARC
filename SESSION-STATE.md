# Session State — 2026-06-03 23:30 MDT

## Version
v1.20.95 (deployed 2026-06-03). dataUrl-gating fix (#94) — BOM extraction no longer silently skips storageUrl-only pages.

## Recent Commits (last 15)
- bf5aea4f Correct #95: ground truth in dispute, error scoring unsettled
- 89075d95 #94 RESOLVED (v1.20.95) + #95 filed + #84 updated + C23 closure
- 01ef9cf2 Release v1.20.95
- fa15c96b Fix dataUrl-gating bug: BOM extraction silently skipped on storageUrl-only pages (#94)
- 70ac66de Close #82: deploy gap disproven (Coach C22) — docs update
- 8080e078 Commit Coach C19/C20/C21 entries + final session state updates
- e5954213 Closeout skill: add Step 7 — notify other roles and wait for confirmations
- 4713dbfb Add PRJ402119 deploy-gap work order + update session state
- 67f472dd Update handoff files for next session
- 525d8586 Add #92-P1 + BOM revert investigation artifacts + startup workflow improvements
- ad5a7653 Release v1.20.94
- a6906355 Release v1.20.93
- 0af48ef2 Team skills: require AskUserQuestion for all decision points
- ddb2eea2 Update handoff files for next session
- 0e474d81 Release v1.20.92

## Shipped This Session
- [DONE] **#94 — dataUrl-gating fix** (v1.20.95). `confirmAndExtract` and `runExtractionTask` filtered BOM pages on `&& p.dataUrl`, silently excluding pages with only `storageUrl` after a save-reload cycle. Fix: filter on `(p.dataUrl||p.storageUrl)` + `ensureDataUrl` hydration in runExtractionTask. Validated: PRJ402119 Line 1 now extracts 13 material items (was 0). Sites A+B shipped; Site C (zoom detection) carved out as #94a. CLAUDE.md dataUrl Ephemerality Rule added.
- [DONE] **#82 closed** — Coach C22 disproved the deploy gap (functions ARE deployed). Documentation updated across 4 files. TODO #15 elevated with deploy-drift systemic fix recommendation.
- [DONE] **FREDDY.md paste discipline** — Added pending-response rule: resolve questions BEFORE generating a paste, then stop and wait after sending it.

## Discovered This Session
- **#95 — PN fidelity issue** (HIGH). PRJ402119 Line 1 extraction produces wrong part numbers on clean vector-text PDF. Multiple errors on 13-item BOM: digit substitution (3→0, 2→3, 6→0), wholesale replacement (TYD15X3/4PWS→MPWS, LNM25BPC100→LNMQ3RP-100). Ground truth still in dispute (Coach C23 correction). Next-session priority: end-to-end trace on Item 8 (MPWS) to determine whether the model receives correct text or degraded input.

## WATCH Items
- **Noah BOM revert** — fix deployed (v1.20.94) but stays WATCH until Noah confirms reverts stopped. Secondary pricing stale-snapshot risk (W9/W10) not yet fixed.
- **Quotes randomly drop fields** — separate root cause (`saveProject` stale-arg). NOT fixed by updatedBy change.
- **Deploy drift (SYSTEMIC)** — `deploy.sh` is hosting-only. #82 verified live only because Coach ran full C22 verification. TODO #15 elevated.

## Open Items — Architectural Hardening

### HIGH — Next active investigation
- **#95 — PN fidelity on clean vector PDFs.** PRJ402119 Line 1 is the test case. Next-session priority.
- **#92 — Background Task UI Ownership Audit.** Phase 1 DONE (v1.20.93). Phases 2+ (H3-H5) open. Coach-owned.

### MEDIUM — Queued
- **#91 — Background Workflow Audit.** Coach-owned.
- **#93 — Extraction Pipeline Consolidation.** Coach design, Marc implement.
- **#87 — Panel ID Hardening.** LOW (defense-in-depth only).
- **#88 — Async Ownership Audit.** Coach-owned.

### HIGH — Pre-existing
- **#84 — Missing items on PRJ402119.** Truncation + companion symptoms NOT REPRODUCED on post-#94 run; may have been artifacts of prior image path.
- **#85 — Excel BOM cross-check.** Gated on Noah/Ovivo. Detailed Plan pending.
- **#64 — BC concurrency sweep.** ~44 ungated fetch sites.
- **#66 — bcCreatePanelTaskStructure idempotency.** ~20 LOC.

### FEATURE — Queued
- **F-1g.1 — Dedup message fix.** Plan approved, ~35 LOC.
- **#90 — ARC Cross UX.** Supersession not visually distinct.

## Work Queue
1. **#95 — PN fidelity investigation** (next-session priority)
2. Noah revert WATCH — confirm fix under real usage
3. #92 — Phases 2+ (H3-H5 foreground-seizing suppression)
4. #84 — Missing items investigation (symptoms may be resolved by #94)
5. F-1g.1 — Implementation (plan approved)
6. #66 — bcCreatePanelTaskStructure idempotency
7. #64 — BC concurrency sweep

## Working Tree
- Branch: master (up to date with origin/master at bf5aea4f)
- Clean: no uncommitted changes

## Open TODOs
60 OPEN findings in TODO.md

## Codebase Audit
76 total findings in ARC-AUDIT-FINDINGS.md. Top unresolved CRITICALs: F-1g.1 (misleading dedup message — plan approved), F-2b.1 (save guard asymmetry), F-3c.4 (partial sync green checkmark), F-3a.1 (restore lock leak).

## New Investigation Artifacts (this session)
- `92-P1-CLOSURE-REPORT.md` — #92 Phase 1 closure (from prior session, carried forward)
- `PRJ402119-EXTRACTION-REGRESSION-FINDINGS.md` — Updated: #82 CLOSED per C22

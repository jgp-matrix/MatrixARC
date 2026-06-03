# Session State — 2026-06-03 22:30 MDT

## Version
v1.20.94 (deployed 2026-06-03). Two fixes: #92-P1 cache re-key + Noah BOM revert fix.

## Recent Commits (last 15)
- 525d8586 Add #92-P1 + BOM revert investigation artifacts + startup workflow improvements
- ad5a7653 Release v1.20.94
- a6906355 Release v1.20.93
- 0af48ef2 Team skills: require AskUserQuestion for all decision points
- ddb2eea2 Update handoff files for next session
- 0e474d81 Release v1.20.92
- 2ba0843f Add Claude Dev Team quick start guide (Word doc + generator)
- e18c0c5e Analyst environment: recommend browser for unbiased third-party separation
- ec2b2a85 Add guided mode to team skills + remove ARC-specific references
- 5745e325 Refactor skills to config-driven Dev Team workflow
- 834a3b72 Add /startup and /closeout skills + automation scripts
- 75bc895f Close Out step 6d: stop and wait for user approval before applying handoff edits
- f0000fed Update handoff files for next session
- ecaf886b Release v1.20.91
- 65b42fe5 Rewrite startup/closeout procedures — sequential team boot + handoff file checks

## Shipped This Session
- [DONE] **#92-P1** — Cache re-key: `_pendingPagesCache` and `_bgTasks` re-keyed from bare `panelId` to `projectId:panelId`. Pre-fix repro confirmed cross-project pending pages contamination. Post-fix validation passed. See `92-P1-CLOSURE-REPORT.md`.
- [DONE] **Noah BOM revert fix** — Root cause: `saveProjectPanel` did not set `updatedBy`, defeating the onSnapshot echo guard. Fix: one-liner adding `updatedBy: uid`. Pre/post validation confirmed 0 echo soft-applies vs 5. See `NOAH-BOM-REVERT-EVIDENCE.md`.
- [DONE] **Startup workflow improvements** — `FREDDY-PASTE.md` drag-and-drop file replaces inline paste generation. Explorer auto-opens with file highlighted. App URL opens in linked browser session at startup. Large-content-to-Freddy protocol added to CLAUDE.md.

## #82 — RESOLVED (2026-06-03)

P1/P2 verified live (Coach C22): byte-for-byte deployed-source diff + runtime log of scanned PDF extracting to completion. PRJ402119 empty-BOM, IF still occurring, is DECOUPLED from #82 — pending fresh confirmation of a live failing example before any trace. Candidate causes if confirmed: #83/H10 re-extraction gaps, or a different per-PDF failure mode.

## WATCH Items
- **Noah BOM revert** — fix deployed (v1.20.94) but investigation stays WATCH until Noah confirms reverts have stopped. Secondary mechanism (W9/W10 pricing stale-snapshot) identified as separate risk — not yet fixed. If reverts recur WITHOUT `[CONCURRENT] Soft-applied remote update` in console, it's the pricing mechanism.
- **Quotes randomly drop fields** — SEPARATE root cause from BOM revert (Freddy analysis). `saveProject` writes a stale `project` arg missing fields (no read-before-write for project-level fields). NOT fixed by the `updatedBy` change. Needs own scope: project-level field merge in `saveProject`, or callers use `projectRef.current` not closure snapshots.
- **Deploy drift (SYSTEMIC)** — `deploy.sh` deploys hosting only → silent Cloud Function drift. #82 verified live but only because Coach ran a full REST API source-archive verification (C22). TODO #15 ELEVATED with recommendation: deployed-vs-committed function-hash check as minimum viable fix. Precedent: F-1d.8.

## Open Items — Architectural Hardening

### HIGH — Next active investigation
- **#92 — Background Task UI Ownership Audit.** Phase 1 (H1+H2 cache re-key) DONE (v1.20.93). Phases 2+ (H3-H5 foreground-seizing suppression) still open. Coach-owned.

### MEDIUM — Queued
- **#91 — Background Workflow Audit.** Classify all 12 extraction-completion functions. Coach-owned.
- **#93 — Extraction Pipeline Consolidation.** Shared `onExtractionComplete`. Coach to design, Marc to implement.
- **#87 — Panel ID Hardening.** Downgraded from MEDIUM to LOW per #92-P1 — cache re-key breaks collision independent of unique IDs. Defense-in-depth only.
- **#88 — Async Ownership Audit.** Broader audit: all long-running operations. Coach-owned.

### HIGH — Pre-existing (from prior sessions)
- **#84 — Missing items (13/14)** on PRJ402119. Last-row truncation + companion-part miss.
- **#85 — Excel BOM cross-check.** Gated on Noah/Ovivo. Design pipeline complete, Detailed Plan pending.
- **#64 — BC concurrency sweep.** ~44 ungated fetch sites remain.
- **#66 — bcCreatePanelTaskStructure idempotency gap.** ~20 LOC.

### FEATURE — Queued
- **F-1g.1 — Dedup message fix.** Detailed Plan approved (F-1g1-DETAILED-PLAN.md). 5 code sites, ~35 LOC.
- **#90 — ARC Cross UX.** Supersession not visually distinct from extraction error.

## Work Queue
1. Noah revert WATCH — confirm fix under real usage
2. #92 — Phases 2+ (H3-H5 foreground-seizing suppression)
3. Noah production bugs — triage/diagnose when prioritized
4. #84 — Missing items investigation
5. F-1g.1 — Implementation (plan approved)
6. #66 — bcCreatePanelTaskStructure idempotency
7. #64 — BC concurrency sweep

## Working Tree
- Branch: master (up to date with origin/master at 525d8586)
- Clean: no uncommitted changes (pending close out handoff commit)

## Open TODOs
57 OPEN findings in TODO.md (Coach updating)

## Codebase Audit
76 total findings in ARC-AUDIT-FINDINGS.md. Top unresolved CRITICALs: F-1g.1 (misleading dedup message — plan approved), F-2b.1 (save guard asymmetry), F-3c.4 (partial sync green checkmark), F-3a.1 (restore lock leak).

## New Investigation Artifacts (this session)
- `92-P1-CLOSURE-REPORT.md` — #92 Phase 1 closure with pre/post validation evidence
- `92-PHASE1-DETAILED-PLAN.md` — Coach's cache re-key detailed plan
- `92-UI-OWNERSHIP-AUDIT.md` — Coach's full UI ownership audit
- `BOM-REVERT-FIX-PLAN.md` — Coach's plan for the saveProjectPanel updatedBy fix
- `BOM-WRITE-PATHS-MAP.md` — Coach's write paths map for the BOM revert investigation
- `NOAH-BOM-REVERT-EVIDENCE.md` — Marc's evidence report with root cause analysis
- `PRJ402119-EXTRACTION-REGRESSION-FINDINGS.md` — Coach's investigation: #82 deploy gap (DISPROVEN per C22 — fixes ARE live)

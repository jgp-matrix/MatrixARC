# Session State — 2026-06-03 17:01 MDT

## Startup/Shutdown Procedure Change (2026-06-03)

The startup and close out procedures in CLAUDE.md were rewritten this session. Key changes:
- **Startup**: "startup" now always means full team (F+C+M). Marc boots first, produces paste-ready blocks for Coach and Freddy, then runs a cross-reference sync check. No role question asked. Variants: `startup solo`, `startup code`, `startup custom`.
- **Close Out**: New steps 6d (handoff file freshness — FREDDY.md, COACH.md, CCD memory) and 6e (commit handoff updates). "Closed" now verifies handoff files are committed and pushed.
- **Both**: Display a visible checklist before executing so Jon can follow the procedure step by step.

Read the updated CLAUDE.md sections "Team startup (default)" and "Session shutdown procedure" for full details.

## Version
v1.20.90 (deployed 2026-06-03). Cross-project contamination fix + background pricing.

## Recent Commits (last 15)
- 853913fb Add Session Closeout Verification Procedure to FREDDY.md
- a5c8f1f1 Add TODO #93 extraction pipeline consolidation + regenerate SESSION-STATE
- 7c7041e3 Add workflow lessons from contamination investigation
- 19435b11 Close contamination incident — v1.20.90 validation passed all checks
- 1d4112f4 Release v1.20.90
- 9d78a035 Add Analyst Communication Model to FREDDY.md
- 53b2aaf6 Expand TODO #92 audit scope: add re-extraction and validation requests
- fcd11f17 Add TODO #92: background task UI ownership audit (HIGH)
- 438ff9f4 Release v1.20.89
- 71337de3 Add live testing environment confirmation to session startup
- bd3cb890 Add evidence-first debugging mode to FREDDY.md
- 3351b7b2 Add #86 incident report + lessons learned across team docs
- a3c10b8c Release v1.20.88
- 8949e170 Fix SESSION-STATE.md: routing nondeterminism was real, now resolved with ~16s waste
- 6d9e3be6 Session close-out: extraction investigation resolved, SESSION-STATE regenerated

## CROSS-PROJECT CONTAMINATION INCIDENT — CLOSED

**Status: VALIDATED AND CLOSED (v1.20.90, 2026-06-03)**

Full incident report: `DIAGNOSTIC-CROSS-PROJECT-CONTAMINATION.md`

Root cause: stale extraction callback + React component reuse (`<ProjectView>` had no `key` prop) + panel ID collision (`panel-1` shared across all single-panel projects). When extraction completed after user navigated away, `onDone` wrote wrong BOM into the active project's React state.

Fixes shipped:
- v1.20.88 (#86): `key={openProject.id}` on `<ProjectView>` + `_extractionProjectId` guard in `onDone`
- v1.20.89 (#89): Background pricing on `confirmAndExtract` path
- v1.20.90 (#89): Background pricing on Re-Extract + `reExtractWithFeedback` paths

Validation (v1.20.90): guard fired, background pricing executed, correct project updated, sentinel unchanged, no forced navigation.

**Do NOT re-investigate the contamination.** It is resolved. Remaining work is architectural hardening tracked as separate TODOs below.

## EXTRACTION INVESTIGATION — RESOLVED (prior session)

The "persistent 3036338→3038338 misread" was a ground-truth error, not a model bug. Do NOT re-chase PNG encode, upscale, native-res crop, or temperature fixes. See previous SESSION-STATE for full details.

## Shipped Prior Session
- [DONE] #86 — Cross-project BOM contamination fix (v1.20.88)
- [DONE] #89 — Background pricing on all three extraction paths (v1.20.89 + v1.20.90)
- [DONE] Incident report: DIAGNOSTIC-CROSS-PROJECT-CONTAMINATION.md
- [DONE] CLAUDE.md: Async Project Ownership Rule, Multi-Project Workflow Assumption, Dashboard Command Center Principle, Live Testing Environment Confirmation
- [DONE] FREDDY.md: Evidence-First Debugging Mode, Analyst Communication Model, Pending Response Rule, Incident Closure Criteria, Cross-Project Contamination Investigation Protocol, Post-Investigation Documentation Checklist, Durable-Record Assignment Practice, Session Closeout Verification Procedure
- [DONE] COACH.md: C16 (contamination finding), C17 (#89 analysis), C18 (extraction architecture priority plan)
- [DONE] TODO #88 (async ownership audit), #90 (ARC Cross UX), #91 (background workflow audit), #92 (UI ownership audit), #93 (extraction pipeline consolidation)

## Open Items — Architectural Hardening

### HIGH — Next active investigation
- **#92 — Background Task UI Ownership Audit.** Background operations must never seize foreground UI. Audit all completion handlers for modal opens, route changes, required-input interruptions. Coach-owned.

### MEDIUM — Queued
- **#91 — Background Workflow Audit.** Classify all 12 extraction-completion functions as safe/UI-only/unsafe in background mode. Coach-owned.
- **#93 — Extraction Pipeline Consolidation.** Shared `onExtractionComplete` for all three extraction paths. Coach to design, Marc to implement.
- **#87 — Panel ID Hardening.** Generate unique panel IDs instead of sequential `panel-1`. Follow-up for #86.
- **#88 — Async Ownership Audit.** Broader audit: all long-running operations, not just extraction. Coach-owned.

### HIGH — Pre-existing (from prior sessions)
- **#84 — Missing items (13/14)** on PRJ402119. Last-row truncation + companion-part miss.
- **#85 — Excel BOM cross-check.** Gated on Noah/Ovivo. Design pipeline complete, Detailed Plan pending.
- **#64 — BC concurrency sweep.** ~44 ungated fetch sites remain.
- **#66 — bcCreatePanelTaskStructure idempotency gap.** ~20 LOC.

### FEATURE — Queued
- **F-1g.1 — Dedup message fix.** Detailed Plan approved (F-1g1-DETAILED-PLAN.md). 5 code sites, ~35 LOC.
- **#90 — ARC Cross UX.** Supersession not visually distinct from extraction error.

## Noah Production Bugs (from prior session, NOT diagnosed)
- **BOM edits revert** — suspected stale-state-overwrite race (#65 class).
- **Quotes randomly drop fields** including Budgetary header — needs human verification of sent PDF first.

## Work Queue
1. #92 — Background Task UI Ownership Audit (active investigation)
2. Noah production bugs — triage/diagnose when prioritized
3. #84 — Missing items investigation
4. F-1g.1 — Implementation (plan approved)
5. #66 — bcCreatePanelTaskStructure idempotency
6. #64 — BC concurrency sweep

## Working Tree
- Branch: master (up to date with origin/master at 853913fb)
- Clean: no uncommitted changes

## Open TODOs
56 OPEN findings in TODO.md

## Codebase Audit
76 total findings in ARC-AUDIT-FINDINGS.md. Top unresolved CRITICALs: F-1g.1 (misleading dedup message — plan approved), F-2b.1 (save guard asymmetry), F-3c.4 (partial sync green checkmark), F-3a.1 (restore lock leak).

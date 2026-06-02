# Session State — 2026-06-02 09:45 MDT

## Version
v1.20.75 (deployed 2026-06-02)

## Recent Commits (last 10)
- d8c13140 Release v1.20.75
- 301a7f98 Fix F-2d.2: reorder PDF attachment for atomicity, convert to bcGatedFetch
- cafbd49e docs: add FREDDY.md for new Claude.ai session continuity
- 15d9b894 Release v1.20.74
- 9e0e3fe2 Fix F-1c.1: resolve vendor/customer names from BC on restore remap
- 33b0df6e Release v1.20.73
- a5d46c38 Raise panel line qty limit from 20 to 1000, widen input field
- e90d70e7 Release v1.20.72
- df6dd05c Raise panel count limit from 20 to 1000, add direct input field
- 45086a2b Add TODO #77 (page delete broken state) + #78 (pre-extraction page selection)

## Active Work
- [CRITICAL] F-2d.1 — 46 BC fetch calls bypass bcGatedFetch semaphore (not started)
- [CRITICAL] F-1g.1 — "AI missed" message misleading for dedup gaps (not started)
- [CRITICAL] F-2d.3 — Firestore write after BC sync crash gap (not started)
- [DONE] F-1c.1 — Vendor name nulled on restore remap (shipped v1.20.74)
- [DONE] F-2d.2 — PDF attachment not atomic (shipped v1.20.75)
- [DONE] Marc Independent #1 — Stale init.panels to BC sync (shipped v1.20.71)

## Blockers
- BOM prompt duplicate-merge instruction (app.jsx:11265, bomPrompt.js:215) — root cause of 592273 dedup failure. Prompt amendment needed. No fix deployed.

## Working Tree
- 5 untracked files (ARC-AUDIT-FINDINGS.md, DIAGNOSTIC-PRJ402109-DATA-LOSS.md, OVERNIGHT-LOG.md, STARTUP-DESIGN.md, .claude/scheduled_tasks.lock)
- Branch: master

## Open TODOs
47 OPEN findings in TODO.md (of 86 total)

## Overnight Log
No unresolved items. Final verification completed 2026-06-02 ~04:10 MDT — 11 of 12 audit findings confirmed, 3 independent findings discovered. See OVERNIGHT-LOG.md for full results.

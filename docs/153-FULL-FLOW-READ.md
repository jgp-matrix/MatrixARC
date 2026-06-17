# #153 Full Flow Read — End-to-End Revision Path Audit

**Coach (C101) — 2026-06-17**
**Type:** Comprehensive code-path read vs. C96/C97 plan
**Status:** IN PROGRESS — stub committed early to survive compaction

---

## Scope

Two confirmed bugs (v1.20.138, project DCeU9GGjJLgB1NP0MJuJ, Line 1, 54-row BOM):

1. **BUG 1 — Gate intermittency:** BOM detection signals intermittently fail (panel prop
   loses BOM during addFiles→confirm window). Gate fires sometimes, not others.
2. **BUG 2 — Replace branch mis-wire:** "Replace and Reconcile" runs full 50-page
   extraction instead of transient-staging → ReconciliationModal.

End-to-end flow map with ALL divergences from C96/C97 plan.

---

*Findings will be appended incrementally below as the read progresses.*

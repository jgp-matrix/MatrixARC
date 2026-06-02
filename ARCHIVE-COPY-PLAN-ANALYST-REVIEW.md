# ARCHIVE-COPY-PLAN-ANALYST-REVIEW.md

**Version:** 1.0
**Date:** 2026-06-01
**Author:** Freddy Lyst (via Jon facilitation)
**Companion to:** ARCHIVE-COPY-BRIEF.md v1.0 + ARCHIVE-COPY-PLAN-SUPPLEMENT.md v1.0
**For:** Sam (input to ARCHIVE-COPY-PLAN-DETAILED.md)

## PURPOSE

This memo synthesizes the Brief's product decisions with the Supplement's codebase findings, captures Jon's responses to the design questions surfaced by the Supplement, and provides architectural recommendations for how the Detailed Plan should be structured. It's the bridge document between product intent and implementation specifics.

## SUPPLEMENT FINDINGS — ANALYST ACKNOWLEDGMENT

Five findings from your Supplement that materially change the Brief's assumptions, and the analyst-side response to each:

### Finding 1 — Existing copyProject function

The Brief assumed Milestone E was build-from-scratch. The existence of copyProject (and CopyProjectModal, and the wired-up Copy button) means the work is enhancement, not new construction. This is a meaningful scope reduction.

**Recommendation:** The Detailed Plan should frame phases as modifications to existing infrastructure, not as net-new feature work. Specifically: enhance copyProject, enhance CopyProjectModal, build the ECO flatten utility as the only genuinely new code.

### Finding 2 — ECO data model uses ecoModifiesBaseRowId, not part number

The Brief described ECO flatten as "find matching base row by part number." This was wrong. ECO rows reference base rows by explicit ID, which is more precise and avoids edge cases like duplicate part numbers or part number changes.

**Recommendation:** The Detailed Plan's flatten utility should use ecoModifiesBaseRowId as the join key. Document the three ECO operation types (add, remove, modify) and how each is applied.

### Finding 3 — Three ECO operation types

The Brief implied a generic "apply ECO" model. Your finding that ECOs have explicit operation types (add, remove, modify) with structured semantics is cleaner than the Brief described.

**Recommendation:** The Detailed Plan should make the operation type an explicit part of the flatten algorithm, with clear handling per type rather than inferred behavior.

### Finding 4 — No BC calls during copy

The Brief implied copy might trigger BC sync. Your finding that the copy operation is entirely Firestore-local (no BC calls) is a major risk reduction. No 429 concerns, no rate limit pressure, no BC connection requirement.

**Recommendation:** The Detailed Plan can be simpler than executeRestore. No lock/resume needed (no BC step to recover from), no semaphore involvement, no F4-style hash management. A simple linear write sequence is sufficient.

### Finding 5 — Field exclusion has 8 categories

The Brief listed about 8 individual fields to exclude. Your 8-category framing (BC linkage, customer, quote history, ECO state, review state, purchasing, admin/lock, archive refs) is more comprehensive and easier to maintain.

**Recommendation:** The Detailed Plan should define the field exclusion as a structured list, organized by category. Future fields added to projects can be classified into a category, making exclusion decisions easier.

## JON'S PRODUCT DECISIONS (CONFIRMED)

### Decision 1 — ECO labor folding

**Question (from your Supplement):** ECO labor deltas — fold into laborData.overrides, or convert to manual rows?

**Jon's decision:** Fold into laborData.overrides.

**Rationale:** Final values are baked in cleanly. The new project starts as if a fresh quote with those labor values, no historical layering. Simpler downstream behavior, less to explain to the user.

**Implication for Detailed Plan:** The labor flatten utility should compute the final laborData (base + ECO overrides applied) and write it directly. No separate "manual override row" tracking.

### Decision 1 — Fresh quote number at copy time

**Question (from your Supplement):** ARC's pattern is to assign quote numbers at print time. Should the copy follow that, or assign at copy time?

**Jon's decision:** Assign at copy time.

**Rationale:** Jon wants the new project to have a clear identity from the moment it's created. Easier to reference, easier to discuss with colleagues, easier to share. The existing pattern of assigning at print time may be appropriate for greenfield project creation but is unnecessary friction for copy.

**Implication for Detailed Plan:** Use getNextQuoteNumber(uid) during the copy operation. Note this is a deliberate divergence from the existing greenfield project pattern. If any code paths assume the absence of a quote number implies "unprinted," they need to be reviewed for compatibility.

**Sam action item:** Verify whether any existing code assumes absence of quote number implies a specific state. If so, surface it before Detailed Plan finalizes.

### Decision 3 — Approve scan/exclusion reuse from Phase 2.2

The Brief specified that Copy should reuse the Phase 2.2 archive warning logic (scanBomForArchiveIssues with exclusions for isLaborRow, isContingency, BUYOFF, crate-pattern). Jon confirms this is correct — no changes.

**Implication for Detailed Plan:** Reuse the existing scan function. If the function signature doesn't fit cleanly (e.g., it assumes archive context), refactor to make it context-agnostic. Or write a thin wrapper that calls the same internal logic.

## ARCHITECTURAL RECOMMENDATIONS FOR DETAILED PLAN

### Recommendation 1 — Phasing strategy

The Brief implied this might be a multi-phase milestone. Given the Supplement findings (existing copy infrastructure, no BC calls, narrow scope), the work might fit into fewer phases than initially anticipated. Sam's judgment on the right number.

**Considerations:**
- Phase 1 (ECO flatten utility) is independent and verifiable in isolation. Recommend it ships as its own phase even though it's small.
- The enhanced CopyProjectModal, the BOM scan warning, and the auto-open behavior could ship together (UX phase) or separately. Sam's call on cohesion.
- A "polish" phase for edge cases discovered during smoke testing is good practice.

### Recommendation 2 — Backward compatibility

The existing copyProject function is presumably called from other places (other than the Copy button in the project action bar). Enhancing it with ECO flatten changes behavior for those callers too.

**Sam action item:** Inventory existing callers of copyProject. If any other caller exists, decide whether to:
- Enhance in place (all callers get the new behavior) — only safe if all callers want ECO flatten
- Add a new function (copyProjectAsNewQuote) wrapping the original — preserves backward compat for any caller that wants the old behavior
- Add a parameter (copyProject(uid, sourceId, { flattenEcos: true })) — most flexible

This decision affects the Detailed Plan's structure. Surface it early.

### Recommendation 3 — Use existing patterns for progress UI

The Brief asked for executeRestore-style progress UI. Given that copy doesn't have BC operations or resumable state, the progress UI can be simpler than the restore version. Recommend reusing the visual treatment (icons, animation, layout) but with a shorter step list and no failure-resume capability.

**Detailed Plan should specify:**
- Exact step list for the copy progress view
- Whether to reuse the existing progress view component or build a copy-specific simpler version
- Auto-navigation timing (immediately on success, or with a brief "Success!" pause?)

### Recommendation 4 — Don't over-engineer the lock

The Brief mentioned reusing acquireRestoreLock. For copy, the lock concern is much narrower: prevent two simultaneous copies of the same source project from creating conflicts. This is much simpler than restore's BC-state-coordination problem.

**Recommendation:** A simple optimistic lock on the source project's Firestore doc during the copy window is sufficient. Don't reuse the full restore lock machinery if a simpler lock suffices.

## RISK AREAS TO ADDRESS IN DETAILED PLAN

### Risk 1 — Duplicate quote numbers under concurrent copy

If two users initiate a copy at the same moment, getNextQuoteNumber must guarantee uniqueness. If it's not transactional, two copies could collide on the same number.

**Sam action item:** Verify getNextQuoteNumber's atomicity. If non-transactional, wrap in a Firestore transaction. Document in the Detailed Plan.

### Risk 2 — Orphaned ECO references

If an ECO has ecoModifiesBaseRowId pointing to a row that no longer exists in the base BOM (e.g., the base row was deleted while the ECO survived), the flatten logic needs a defined behavior.

**Recommendation:** Skip the orphaned ECO row with a console warning. Document this behavior in the Detailed Plan.

### Risk 3 — Auto-open race condition

After copy completes, the new project doc must be fully written and propagated before the auto-navigation can render it. If there's a Firestore propagation delay, the project view could render with stale or missing data.

**Recommendation:** Either await an explicit doc read confirmation before navigating, or add a small delay (e.g., 500ms) before navigation. Document in the Detailed Plan.

### Risk 4 — Field exclusion incompleteness

The 8-category exclusion list is a starting point. Real-world copy testing may surface fields that should have been excluded but weren't (or vice versa).

**Recommendation:** The Detailed Plan should include a final phase for polish/edge cases. Jon will surface anything observed during smoke testing.

## HAND-OFF TO COACH

This memo + the Brief + the Supplement is the complete input set for the Detailed Plan. Sam should now write ARCHIVE-COPY-PLAN-DETAILED.md, addressing:

- The architectural recommendations above
- The four risk areas
- Sam's action items (verify getNextQuoteNumber atomicity, inventory copyProject callers, surface any quote-number-absence assumptions)
- Implementation specifics: file/line references, function signatures, data shapes, pseudocode where helpful

After the Detailed Plan is written, Marc implements phase-by-phase per the Detailed Plan.

## REVISION HISTORY

- v1.0 (2026-06-01) — Initial analyst review, post-Supplement

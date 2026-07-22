# F032 — Role-Differentiated To-Do Dashboard — Scope

**Coach diagnose+scope · 2026-07-22 · read-only. From Andrew's feedback (Reviewer+Designer) via Jon.**

## Why (item 2 root cause — pinned)
The shipped F025 pane is **role-blind**: `paneProjects=projects.filter(_isMyProject(p,uid))` (`:45187`, a SALESMAN scope = `createdBy===uid || bcSalespersonCode` match) then renders the **8 sales pills unconditionally** to every user (`:45188-45218`). Andrew's "2 RFQs" are real projects he created/owns, but meaningless for his actual role. Fix = make buckets AND scope role-aware.

## Role model (detectable today)
| Role | Detection | Source |
|------|-----------|--------|
| Salesman (default) | `_isMyProject` = `createdBy===uid` OR `bcSalespersonCode`↔email (`_arcSalespersonCache`) | :16592 |
| Reviewer | `permissions.reviewer` → `hasPermission("reviewer")`/`_isTechReviewer` | flag :19495; helper :16310 |
| Designer | **NO flag exists** — only per-project `bcDesignerUid`/`bcDesignerCode`/`bcDesigner` assignment | :43736, BC sync :36053 |
| Manager (F027) | `permissions.manager` | pin-only, irrelevant to buckets |
Multi-role possible (Andrew = reviewer flag + designer assignments; Jon = admin+salesman). Admins implicitly all.

## Reviewer buckets — data exists (item 3)
Effective-status already emits `pre_review` (preReviewStatus pending, :16675) + `post_review` (postReviewStatus pending, :16674). Assignee fields: `preReviewAssignedTo`/`postReviewAssignedTo` (+Name). Helpers `_isTechReviewer` :16310 / `_isReviewSignoffAuthority` :16321. The **engineering board already renders "Needs Pre-Review"/"Needs Post-Review" columns (:44778/44787) but UNSCOPED** (all pending, not assigned-to-me). Reviewer pane needs the assignee filter:
- IN PRE-REVIEW (mine) = `preReviewStatus==="pending" && (preReviewAssignedTo===uid || (!preReviewAssignedTo && bcDesignerUid===uid))`
- NEEDS POST-REVIEW (mine) = `postReviewStatus==="pending" && (postReviewAssignedTo===uid || (!postReviewAssignedTo && bcDesignerUid===uid))`

## Designer / Engineering buckets (item 4)
Engineering board columns: `engineering_design`/`programming`/`commissioning` = projects with a `serviceCards[].lineType` of that type (`_hasServiceOfType`, :1259/:37480) — **unscoped to a designer**. Designer scope = `bcDesignerUid===uid`.
**Data gaps:** (a) no `designer` permission flag → "Andrew is a designer" only inferrable from assignments; (b) the engineering *service card* is a quote/labor line, NOT a reliable "in design phase" marker — a project Andrew designs may lack it. `bcDesignerUid` is the trustworthy assignment; the service card is the work-type signal; they don't always coincide.

## Proposed role → buckets + scope
| Role | Buckets | Scope |
|------|---------|-------|
| Salesman | current 8 sales pills (unchanged) | `_isMyProject` (createdBy/salesperson) |
| Reviewer | In Pre-Review · Needs Post-Review | projects **assigned to me for review** (NOT `_isMyProject`) |
| Designer | Engineering Design (+ optionally Programming/Commissioning) | `bcDesignerUid===uid` (and/or engineering service card) |
Multi-role: **union of labeled role sections** in the same pane (rec) vs a role toggle. Scope MUST vary per role — that's the item-2 fix (a reviewer's "my work" ≠ createdBy/salesperson).

## Effort M
Data/predicates all exist. Work = (1) role-detection helper, (2) per-role bucket+scope config replacing the hard-coded 8-pill block (:45187-45218), (3) union rendering. No new data model IF designer stays assignment-inferred. Applies to the F025 pane AND the future F030 page.

## Open decisions for Jon
1. **Multi-role UX:** union of stacked role sections (rec) vs a role toggle.
2. **Designer identity:** add an explicit `permissions.designer` flag (rec — mirrors reviewer/manager, one-line Team-UI add; unambiguous even w/ no current assignments) vs infer purely from `bcDesignerUid`.
3. **Engineering Design bucket def:** scope by `bcDesignerUid===uid`, by engineering service-card presence, or both? Programming/Commissioning as separate designer buckets or folded into one "Engineering"?
4. **★ Salesman detection for mixed users (the item-2 fix):** should a reviewer/designer who also *created* projects still see the sales pills (union), or ONLY if they're an actual salesperson (has a `bcSalespersonCode`)? This governs whether Andrew ever sees RFQ pills again. (Rec: sales pills only for actual salespeople — Andrew wouldn't.)
5. **Post-review timer:** `_TODO_THRESHOLD_DEFAULTS` has no `post_review` threshold (only `pre_review` :16555) — add one if these pills get the timeout coloring (minor).

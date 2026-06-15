# ARC Work Item Numbering Convention

## The rule
Every work item has ONE stable integer ID, assigned once, never reused, never renamed.
The ID is permanent identity; meaning lives in a short description; stage lives in a
status field. Neither the number nor the description changes as the item advances —
only the status moves.

Written form:  #N — short description [Status]
Example:       #85 — Excel BOM import [Backlog]

## Number space
Continues the existing TODO.md numbering. TODO.md is the master registry — every work
item is a TODO entry. Next new item takes the next integer. Numbers never recycle.

## Status values (lifecycle order never reverses; stages may be skipped)
- [Backlog]   — not active; a concern, deferral, or unstarted request. Has an activation trigger.
- [Discovery] — under investigation/audit/measurement. Produces findings.
- [Decided]   — investigated, a ruling/spec exists (Brief/Analyst Review/Plan approved). Ready to build.
- [Building]  — implementation in progress.
- [Verified]  — built AND confirmed by Coach. Done.
Skip paths: a confirmed fix skips [Discovery]; a trivial fix skips [Discovery] and [Decided].

## Not covered by this convention
- COACH.md C## entries: Coach's session journal (findings diary), a separate artifact. Leave as-is.
- Decisions/rulings: recorded in the relevant Brief/Analyst Review, referenced by the item they constrain.

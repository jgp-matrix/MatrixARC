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

## Numbering history (notable)
- **#177 = denylist fail-open hazard** (firm-LT predicate `!=="ai"`). During the 2026-06-30 session,
  #177 was briefly used as a working label for the RFQ pre-fill cluster, but that cluster landed as
  **#178**. The repo's #177 is, and stays, the denylist hazard — no collision in the registry.
- **#178 = RFQ pre-fill cluster** (outbound: referencePrice / firm-LT pre-fill, email/PDF reference cells).
- **#179 = Supplier Portal submit validation** (inbound). Coach caught a transient #178 double-assignment
  mid-session (RFQ cluster vs portal issue both briefly labeled #178) and renumbered the portal issue to
  #179. Final mapping is stable; older chat artifacts labeling the portal issue "#178" are superseded.

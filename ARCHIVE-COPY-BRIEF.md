# ARCHIVE-COPY-BRIEF.md (Milestone E)

**Version:** 1.2
**Date:** 2026-06-01
**Author:** Freddy Lyst (via Jon facilitation)
**v1.1/1.2 editor:** Sam Wize (Senior Development Engineer, Architecture)

## PURPOSE

Add a "Copy to New Quote" capability to ARC. Allows a user to clone an active project into a brand new quote with a fresh quote number, automatically flattening any ECOs into the base panel BOMs. The source project is unmodified.

## USE CASE

Matrix often quotes similar projects to similar customers. Rather than recreating a quote from scratch, the user can pick an existing project that's structurally similar, copy it, and then customize the new copy with a different customer, slightly different scope, etc. This is a common workflow that today requires manual duplication of panel structure and BOM data.

The ECO flattening is particularly important. A project that's gone through multiple revisions (Q-rev 1, Q-rev 2, etc.) accumulates ECOs that represent the cumulative state. When copying for a new quote, the user almost always wants the "current state" baked into the new quote's base BOMs, not the historical revision structure that's no longer relevant for a fresh sales cycle.

## SCOPE

### IN SCOPE

- "Copy to New Quote" button in the active project view (placement to be decided)
- New project creation with fresh quote number
- Customer picker as first step of copy flow (v1.2 — user selects customer before copy proceeds; same picker UI as New Project)
- Copy panels (structure, names, positions)
- Copy BOM rows per panel, with ECO flatten:
  - For each base panel BOM row, retain as-is
  - For each ECO BOM row (additions, deletions, quantity changes), apply to the base panel's BOM
  - The result is a single flat BOM per panel matching the project's current state
- Copy labor estimates (CUT, LAYOUT, WIRE values)
- Pre-confirm preview modal showing what will be copied
- Pre-confirm warning if BOM has incomplete sync (mirrors Phase 2.2/2.3 logic)
- Post-completion: auto-open the new project
- BC project creation during copy with planning line sync (v1.1)
- Use existing lock/resume architecture (acquireRestoreLock pattern)
- Use existing progress/completion/failure view pattern

### NOT IN SCOPE

- ECO mode selection (always flatten; the existing ecoMode radio buttons in RestorePreviewModal are not needed for this milestone and can be removed or left stubbed)
- Customer/contact/address/salesperson inheritance from source (customer is SELECTED via picker, not inherited; contact, address, salesperson are always blank)
- Quote header metadata (revision numbers, print history, etc.)
- Archive-related features
- ~~BC project creation during copy~~ — **MOVED TO IN SCOPE in v1.1.** BC project + task structure + planning lines created during copy.
- Selective copy (the user copies the entire project, not subsets of panels or BOMs)
- Multi-source copy (copy from one source at a time)

## WHAT THE NEW PROJECT INHERITS

From the source project:
- Panel structure (count, names, positions)
- Panel BOMs with ECOs flattened in
- Labor estimates per panel
- Project name (with " (Copy)" appended for clarity)

From the copy flow:
- Customer number and name (v1.2 — selected via picker, NOT inherited from source)
- BC project number (v1.1 — NEW BC project created during copy using chosen customer)
- Fresh quote number (assigned at copy time)

What it does NOT inherit:
- Customer from source project (v1.2 — user picks customer; BC customers cannot be changed after project creation)
- Contact, address, salesperson
- Quote revision history, print history
- bomSyncHash, bcVerify states (will be re-established on first BC sync)
- Archive references
- Status (starts as a new quote at the earliest status, like "Pending" or "Draft")

## ECO FLATTEN LOGIC

For each panel in the source:
- Start with the base BOM rows
- For each ECO attached to this panel:
  - For each ECO row:
    - If it's an addition: append the row to the panel's BOM
    - If it's a quantity adjustment: find the matching base row by part number and adjust its quantity
    - If it's a deletion: mark the matching base row as removed (filter it out of the final BOM)
  - Process ECOs in order (oldest to newest) so cumulative changes layer correctly
- Result: a single flat BOM that represents the panel's "current state"

## EDGE CASES

- ECO row with no matching base row: treat as addition (add the row)
- Multiple ECOs touching the same part number: sequential application, last write wins for any non-quantity field
- ECO row marked as deletion for a part that doesn't exist in base BOM: silently skip (no-op)
- Source project has no ECOs: BOM copies as-is, no flatten logic needed

## WARNINGS AND CONFIRMATIONS

Before the copy proceeds, scan the source project's BOM (after flatten preview) for the same conditions as Phase 2.2 archive warning:
- Items with bcVerify.status === "not-in-bc"
- Items with missing manufacturer
- Items with missing vendor (bcVendorNo)

Apply the same exclusions as Phase 2.2 hotfix:
- Skip isLaborRow, isContingency
- Skip BUYOFF exact match
- Skip items with "crate" in part number or description

If any issues, show a warning modal with explicit acknowledgment. User can:
- Cancel and fix the BOM in the source project
- Proceed anyway with acknowledgment logged to the new project's metadata

## COPY FLOW

v1.2 modal navigation:
1. **Customer** — User selects customer via picker (same UI as New Project). Name field editable. BC connection required. Cancel closes modal with no side effects.
2. **Preview** — Source summary, ECO flatten preview, panel/BOM/labor counts. Confirm button.
3. **Warning** (conditional) — BOM integrity issues, if any. Acknowledge or cancel.
4. **Progress** — Step-by-step with animated indicators (quote number → flatten → panels → save → images → BC project → tasks → planning lines → done).
5. **Done** — Auto-navigate to new project after brief pause.
6. **Error** (if failure) — Error detail with retry options. If BC project was created but planning lines failed, "Open Project Anyway" option available.

## PROGRESS UI

Reuse the executeRestore progress view pattern:
- Step list showing each phase (quote number, ECOs flattened, panels, save, images, BC project, tasks, planning lines)
- Icons: ⏳ (active, animated), ✅ (complete), ○ (pending), ❌ (failed)
- Pulse animation on active step (existing arcPulse keyframe from F5)
- Failure summary view if any step fails
- Completion view with "Open New Project" button (or auto-open)

## POST-COPY BEHAVIOR

Auto-navigate to the new project as soon as the copy completes successfully. The user lands on the project view of the new quote, with all panels, BOMs (flattened), labor, BC project linkage, and chosen customer already in place. They can then:
- Adjust BOMs as needed for the new quote
- Add contact, address, salesperson details
- Submit the quote when ready

The source project is unchanged.

## DEPENDENCIES ON COMPLETED WORK

This milestone depends on:
- Milestone D Phase 1 (executeRestore architecture) — reused for the copy execution
- Milestone D Phase 2.2 (archive integrity warning) — reused logic for pre-copy warning
- Milestone D Phase 2.3 (B4 pre-confirm warning, F5 spinner) — reused UX patterns
- TODO #64 Phase A (BC semaphore) — BC calls during copy use the global rate limiter
- TODO #65 Phase B (sync hygiene) — Copy creates a project that benefits from bomSyncHash gating

## OPEN QUESTIONS FOR COACH

1. Where in the code does ECO flatten logic need to live? Is there an existing utility that approximates this, or does it need to be net-new?
2. What's the precise data shape of an ECO row in the project doc? How does it reference the base BOM row it modifies?
3. What's the entry point for the new quote number? Is there an existing nextQuoteNumber() helper or do we generate manually?
4. Where in the active project view should the Copy button go? (Sam: identify suitable UX location; defer final decision to Jon if multiple options exist.)
5. What's the right place to insert the Pre-Confirm modal — reuse RestorePreviewModal or create a new CopyPreviewModal?
6. Are there any project-level fields that should NOT carry over that I haven't listed in "What it does NOT inherit"?

## OPEN QUESTIONS FOR MARC (deferred until Plan stage)

1. Implementation order of phases (parallel with Sam's recommendation)
2. Risk areas in ECO flatten logic given existing code patterns

## REVISION HISTORY

- v1.0 (2026-06-01) — Initial brief, six design decisions logged with Jon
- v1.1 (2026-06-01) — BC project creation moved from NOT IN SCOPE to IN SCOPE. Customer number inheritance added. Per Jon's decision after smoke testing showed copy-without-BC created immediate workflow friction.
- v1.2 (2026-06-01) — Customer picker added as first step instead of inheritance, per Jon's clarification that BC customers cannot be changed after project creation. Customer/contact/address remain NOT inherited from source. Added COPY FLOW section describing the full modal navigation. Reverted v1.1 customer-inheritance additions.

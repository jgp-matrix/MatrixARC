# Incident Report: Cross-Project BOM Contamination

**Date:** 2026-06-03
**Severity:** CRITICAL — customer-facing data integrity
**Status:** VALIDATED AND CLOSED (v1.20.90, 2026-06-03)
**TODO ref:** #86 (resolved), #87 (open — panel ID hardening), #89 (resolved — background pricing), #92 (open — UI ownership audit)

---

## Symptom

Noah reported that PRJ402111's BOM was populated with data from PRJ402119. The BOM items, part numbers, and descriptions in PRJ402111 matched PRJ402119's extraction results — a completely different project's drawings.

If undetected, this would have resulted in quoting the wrong BOM to a customer.

## Timeline

| When | What |
|------|------|
| 2026-06-02 (evening) | Noah notices PRJ402111 BOM contains PRJ402119 items |
| 2026-06-03 07:47 MDT | Marc session starts, Jon reports the issue |
| 2026-06-03 ~08:00 | Marc investigates extraction pipeline — all paths are project-scoped at the code level (PDF paths, Cloud Functions, Firestore). No cross-project leak found in extraction itself |
| 2026-06-03 ~08:15 | Marc identifies `_pendingPagesCache` panel ID collision as a candidate vector — cache keyed by `panelId` alone, not `projectId+panelId` |
| 2026-06-03 ~08:30 | Marc traces `confirmAndExtract` flow — confirms cached pages from one project can be restored onto another project's panel when panel IDs collide |
| 2026-06-03 ~09:00 | Root cause confirmed as stale extraction callback + reused `<ProjectView>` component (TODO #86) |
| 2026-06-03 | Hotfix deployed: `key={openProject.id}` on `<ProjectView>` + `_extractionProjectId` guard in `onDone` |

## Root Cause (Confirmed)

Two issues combined to create the contamination:

### Issue 1: Panel ID collisions across projects

All single-panel projects use `panel.id = "panel-1"` (legacy migration at `app.jsx:10243`, project copy at `app.jsx:10043`). Only `addPanel()` generates unique IDs (`panel-${Date.now()}`). This means the vast majority of projects share `panel-1` as their first panel ID.

Any module-scoped state keyed by `panelId` alone can cross-contaminate between projects:
- `_pendingPagesCache` (app.jsx:433) — pre-extraction page cache
- `_bgTasks` (app.jsx:421) — background task registry

### Issue 2: Stale extraction callback via reused `<ProjectView>`

`<ProjectView>` had no `key` prop, so React reused the same component instance when the user navigated directly between projects (e.g., via notification click or project list). When a long-running extraction completed after the user switched to a different project, the `onDone` callback wrote PRJ402119's BOM into PRJ402111's React state via the panel ID collision.

**The Firestore save inside `runExtractionTask` was always clean** — it captured `projectId` in its closure. The contamination occurred through the React state `onUpdate` → `setProject(prev => ...)` chain, where `prev` was the new project's data. Auto-pricing then persisted the contaminated data via `onSaveImmediate`.

### Contamination path (step by step)

1. User opens PRJ402119, drops drawings, extraction starts on Panel 1 (`id: "panel-1"`)
2. User navigates to PRJ402111 while extraction is still running
3. React reuses `<ProjectView>` (no key prop) — same component instance, new project data in props
4. PRJ402119's extraction completes; `onDone` fires
5. `onDone` calls `onUpdate(updatedPanel)` where `updatedPanel` has PRJ402119's BOM
6. `onUpdate` calls `setProject(prev => ...)` — but `prev` is now PRJ402111's data
7. The panel-map logic matches on `panel.id === "panel-1"` and replaces PRJ402111's panel with PRJ402119's BOM data
8. Auto-pricing runs on the contaminated panel, then `onSaveImmediate` persists to Firestore
9. PRJ402111 now has PRJ402119's BOM in Firestore

### Secondary vector: `_pendingPagesCache`

Even without the stale callback issue, `_pendingPagesCache` keyed by `panelId` alone could cause contamination if a user drops files on one project's panel, navigates away without extracting, and opens another project with the same panel ID. The `useEffect` at line 22286 restores cached pages onto the wrong project's panel.

## Why Standard Investigation Was Misleading

The initial investigation focused on the extraction pipeline itself — PDF storage paths, Cloud Functions, prompt caching, Firestore saves. All of these are correctly project-scoped. The contamination didn't happen during extraction; it happened during the React state update after extraction completed.

This is a class of bug where **the async operation is correct, but the completion handler writes to the wrong target** because the UI context changed while the operation was in flight.

## Implemented Fixes

### Fix A: `key={openProject.id}` on `<ProjectView>` (app.jsx:45160)

Forces React to unmount and remount `<ProjectView>` whenever the project changes. This kills all stale closures, pending state, and in-flight callbacks from the previous project. Most important single fix — eliminates the entire class of cross-project state bleed through component reuse.

### Fix B: `_extractionProjectId` guard in `onDone` (app.jsx:23209)

Defense-in-depth. Before `onDone` calls `onUpdate` or triggers auto-pricing, it compares the extraction's `projectId` against `_currentProjectId`. If they differ (user switched projects during extraction), the callback is silently dropped. Prevents contamination even if the key prop is somehow bypassed.

## Validation

### Initial (v1.20.88)
- Verified that PRJ402111 can be re-extracted with correct data after the fix
- Verified that navigating between projects during extraction no longer causes cross-contamination
- Verified that the `key` prop forces clean remount (DevTools component tree)

### Full validation (v1.20.90, 2026-06-03)

All three extraction paths validated with navigate-away test:

| Check | Result |
|-------|--------|
| Extraction guard fired correctly on navigate-away | PASS |
| Background pricing executed against originating project | PASS |
| Background validation executed against originating project | PASS |
| Correct project (extraction source) received all updates | PASS |
| Sentinel project (navigated to) remained unchanged | PASS |
| No forced navigation during background completion | PASS |

**Resolved items:**
- Cross-project BOM contamination (v1.20.88, #86)
- Background pricing gap on extraction path 1 — `confirmAndExtract` (v1.20.89, #89)
- Background pricing gap on extraction paths 2 and 3 — Re-Extract Drawings + `reExtractWithFeedback` (v1.20.90)

**Immediate production risk is resolved.** The incident is formally closed pending dashboard/tile validation as a final confirmation step.

## Follow-Up Hardening (open)

Ordered by priority:

1. **#92 — Background Task UI Ownership Audit** (HIGH). Background operations must never seize foreground UI. Audit all completion handlers for modal opens, route changes, and required-input interruptions. Architectural hardening.
2. **#91 — Background Workflow Audit** (MEDIUM). Classify all 12 extraction-completion functions as safe / UI-only / unsafe in background mode. Preventive audit.
3. **Extraction Pipeline Consolidation** (MEDIUM). Three extraction paths share the same completion chain — consolidate into a shared `onExtractionComplete` function. Coach to design, Marc to implement.
4. **#87 — Panel ID uniqueness** (MEDIUM). Generate `panel-${Date.now()}-${random}` instead of sequential `panel-1` for new panels. Existing projects keep their current IDs (migration not needed since the #86 fix prevents the acute contamination). Eliminates the collision class entirely for future projects.

## Lessons Learned

### 1. Module-scoped state keyed by sub-entity ID is a cross-entity contamination vector

Any cache, task tracker, or callback registry keyed by `panelId` (or any ID that isn't globally unique) can cross-contaminate when the parent entity (project) changes. The fix is to key by `projectId:panelId` or use globally unique IDs.

### 2. React component reuse across different data entities is dangerous for long-running operations

Without a `key` prop, React reuses component instances when the parent re-renders with different data. This is normally fine for stateless rendering, but catastrophic when the component has in-flight async operations with callbacks that capture stale state.

**Rule: Any component that owns long-running async operations (extraction, pricing, BC sync) MUST have a `key` prop that forces remount when the underlying entity changes.**

### 3. Async completion handlers must validate their target before writing

The "currently open project" must never determine where async results are written. Completion handlers must carry sufficient identity to guarantee they update only the originating entity. This applies to extraction, pricing, BC sync, archive/restore, copy, imports, and attachment processing.

### 4. Cross-checking code-path analysis with runtime data catches blind spots

The code-level investigation found the extraction pipeline to be correctly project-scoped — and it was. The contamination occurred at a different layer (React state management). Independent runtime analysis (checking what data was actually in Firestore, what the React state looked like at completion time) was necessary to identify the true vector.

### 5. Evidence preservation before repair is critical

Jon's instinct to analyze before re-extracting was correct. Running a re-extract first would have destroyed the contaminated state, making root cause analysis much harder.

---

## Affected Code Paths

| Path | File | Lines | Role in contamination |
|------|------|-------|-----------------------|
| `onDone` callback | app.jsx | 23208 | Wrote wrong BOM via `onUpdate` |
| Panel map in `setProject` | app.jsx | 32955 | Matched on colliding `panel-1` ID |
| `setProject` function updater | app.jsx | 35110 | Merged wrong panel into project state |
| Auto-pricing `onSaveImmediate` | app.jsx | 25783 | Persisted contaminated data to Firestore |
| `<ProjectView>` render (no key) | app.jsx | 45160 | Allowed component reuse across projects |
| `_pendingPagesCache` | app.jsx | 433 | Secondary vector — keyed by panelId alone |
| `_bgTasks` | app.jsx | 421 | Same collision class, lower severity |

## Related Incidents

- **#65b / DIAGNOSTIC-PRJ402109-DATA-LOSS.md** — Stale `init.panels` closure overwriting Firestore on project open. Same bug class: async completion handler writing to wrong target due to stale captured state. Fixed v1.20.65.
- **#19** — `firstSnapshot` effect-instance-scoped variable causing repeated Firestore overwrites. Same pattern: React state management interacting badly with Firestore listeners across component lifecycle.

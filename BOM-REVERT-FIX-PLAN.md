# BOM Revert Fix — Detailed Plan

**Author:** Sam Wize (Coach) · 2026-06-03  
**Status:** Plan — awaiting Jon's approval → Marc implements  
**Root cause:** `saveProjectPanel` does not set `updatedBy`, leaving the onSnapshot echo guard open for same-user writes  
**Fix:** Set `updatedBy = uid` in `saveProjectPanel`, mirroring `saveProject`

---

## Root Cause Confirmed

`saveProjectPanel` (line 8779) is the primary save path for all BOM edits. It reads the current Firestore doc (line 8790), replaces the target panel (line 8875), and writes the entire project back (line 8919 via `ref.set(stripped)`).

The written doc's `updatedBy` field is inherited from whatever was in Firestore — it is never set to the current user's uid. Meanwhile, `saveProject` (line 8700) explicitly sets `updatedBy: uid`.

The onSnapshot guard at line 34836 is:
```js
if (remote.updatedBy && remote.updatedBy !== uid) {
  setProject(migrated);   // ← overwrites React state
  projectRef.current = migrated;
}
```

When `saveProjectPanel` writes without setting `updatedBy`, and the doc's existing `updatedBy` is a different user (confirmed in production: Jon's uid on projects Noah/Andrew are editing), the guard passes. The onSnapshot fires with the just-saved data — which includes the pre-edit BOM from Firestore's read-before-write at line 8790. This overwrites React state, resetting `latestPanelRef.current` (via line 35139), making the revert permanent on the next debounced save.

---

## Core Change

**One line added inside `saveProjectPanel`, line ~8887:**

```js
// BEFORE (line 8887):
let liveProject = {...proj, panels, updatedAt: Date.now(), schemaVersion: APP_SCHEMA_VERSION};

// AFTER:
let liveProject = {...proj, panels, updatedAt: Date.now(), updatedBy: uid, schemaVersion: APP_SCHEMA_VERSION};
```

This mirrors `saveProject` line 8700: `{...data, updatedBy: uid, updatedAt: Date.now(), ...}`.

After this change, every `saveProjectPanel` write stamps the current user's uid. The onSnapshot guard (`remote.updatedBy !== uid`) correctly blocks self-echo, preventing the stale-data revert.

---

## Blast Radius: Full saveProjectPanel Caller Enumeration

`saveProjectPanel` has 22 call sites. The fix changes echo semantics for all of them: own writes that previously echoed (because `updatedBy` was a different user's uid) will now be suppressed by the guard. For each caller, the question is: **does suppressing the onSnapshot echo break anything?**

### Callers where `skipNotify = true` (notify suppressed — W24 doesn't fire)

These callers already suppress `notifyProjectListeners`. The `updatedBy` fix only affects the Firestore onSnapshot path (W23). For all of these, the onSnapshot echo with own data is **never useful** — the caller already updated React state before saving.

| # | Line | Caller | Context | Echo suppression safe? |
|---|------|--------|---------|----------------------|
| 1 | 25028 | `commitBcItem` async vendor lookup | PanelCard — updates `latestPanelRef` + `onUpdate` before saving | **YES** — React already has the latest |
| 2 | 25063 | `commitBcItem` async MFR/lead-time lookup | Same as above | **YES** |
| 3 | 25103 | `commitBcItem` main save | Same as above | **YES** |
| 4 | 33699 | Pre-review status stamp (approved) | PanelListView — updates project state locally | **YES** |
| 5 | 33711 | Pre-review status stamp (rejected) | Same | **YES** |
| 6 | 33722 | Pre-review reassign | Same | **YES** |
| 7 | 35267 | BC relink — clear old panel sync state | PanelListView relink flow | **YES** |
| 8 | 35280 | BC relink — set bomSyncPending | Same | **YES** |
| 9 | 35288 | BC relink — set bomSyncHash | Same | **YES** |
| 10 | 35296 | BC relink — clear bomSyncPending | Same | **YES** |
| 11 | 36763 | Quote-print — update bcPdfAttached | Print flow | **YES** |
| 12 | 36866 | Quote-print — set bomSyncPending | Print flow | **YES** |
| 13 | 36873 | Quote-print — set bomSyncHash | Print flow | **YES** |
| 14 | 36877 | Quote-print — clear bomSyncPending | Print flow | **YES** |

### Callers where `skipNotify` is conditional

| # | Line | Caller | `skipNotify` value | Echo suppression safe? |
|---|------|--------|--------------------|----------------------|
| 15 | 32073 | `saveImmediatePanel` (THE main edit save path) | `!hasOverrides` — typically `true` (skip notify), `false` only when `_pendingPreReviewOverrides` exist | **YES** — this is the user-edit path. When `skipNotify=false` (overrides pending), the notify pushes the override fields to App state — `updatedBy` suppression of onSnapshot is still correct because the override data is already in the save. |

### Callers where `skipNotify = false` (default — notify DOES fire)

These callers fire `notifyProjectListeners` after saving, which calls `_appProjectUpdateFn` → `setOpenProject` and `onProjectUpdated` listener → `setProject` + `projectRef.current` + `onChange`. The question: does suppressing the onSnapshot echo for these leave any state gap?

| # | Line | Caller | Context | Echo suppression safe? |
|---|------|--------|---------|----------------------|
| 16 | 13528 | `runExtractionTask` — `save()` helper (intermediate extraction save) | Background extraction. `notifyProjectListeners` fires with the saved data. The user may have navigated away. | **YES** — `notifyProjectListeners` already pushes the data to App state. The onSnapshot echo would be a redundant second delivery of the same data. Suppressing it eliminates a no-op round-trip. |
| 17 | 14292 | `runExtractionTask` — final consolidated save | Same as 16 | **YES** |
| 18 | 14459 | `runPricingBackground` — background pricing save | User navigated away. `notifyProjectListeners` pushes to App state. | **YES** — same reasoning as 16. |
| 19 | 24197 | Re-extraction guard — background save | User navigated away. Direct `saveProjectPanel`. | **YES** |
| 20 | 24217 | Re-extraction validation — background save | Same | **YES** |
| 21 | 24410 | Feedback re-extraction — background save | Same | **YES** |

**Summary:** For all 21 callers (plus the function definition itself), suppressing the onSnapshot self-echo is safe. The callers fall into two camps:
- **User-edit callers** (15): Already updated React state before saving. The onSnapshot echo is redundant at best, revert-causing at worst.
- **Background callers** (16–21): Use `notifyProjectListeners` as the primary state-push mechanism. The onSnapshot echo is a redundant second delivery.

No caller relies on the onSnapshot echo to propagate its own writes.

---

## Completeness Check 1: W24 (notifyProjectListeners)

**Question:** Is W24 a separate revert vector independent of the onSnapshot guard?

**Answer: No — W24 is inert for the BOM-revert scenario.**

`saveImmediatePanel` (line 32073) — the path all user BOM edits take — passes `skipNotify = !hasOverrides`, which is typically `true`. So `notifyProjectListeners` does NOT fire after user edits. The BOM-revert symptom requires a concurrent save to echo stale data back — that echo comes from the onSnapshot listener (W23), not from W24.

The callers that DO fire `notifyProjectListeners` (lines 13528, 14292, 14459, 24197, 24217, 24410) are all background extraction/pricing paths. Their `notifyProjectListeners` calls push the extraction/pricing result to App state — this is correct and desired behavior. The data they push is the just-saved data (with the new BOM from extraction), not stale pre-edit data.

The `onProjectUpdated` listener at line 35139 (`setProject(p); projectRef.current=p; onChange(p)`) directly overwrites `ProjectView` state with the `liveProject`. This IS a full-state replacement. But it only fires from background paths, and the data it carries is the extraction/pricing result — not a stale snapshot. The user isn't editing the BOM during extraction (the panel has an extraction overlay), so no edit can be lost.

**Verdict: W24 is not a revert vector. No additional handling needed.**

---

## Completeness Check 2: "Quotes Drop Fields" — Shared Root?

**Question:** Does the `updatedBy` fix resolve the "quotes randomly drop fields" symptom?

**Answer: No — different root cause, different fix needed.**

The BOM-revert is an **echo** bug: correct data is saved to Firestore, but the onSnapshot echo overwrites React state with pre-edit data, causing the next save to write the stale state back.

The field-drop symptom (Budgetary header disappearing) points to a **write** bug: a save path writes a `project` object that's missing the field. The write-paths map identified `saveProject` (line 8484) as the higher risk path — it uses the incoming `project` argument directly, with no read-before-write for project-level fields (unlike `saveProjectPanel` which reads Firestore first). If a caller's closure captured the project before the Budgetary header was set, `saveProject` writes the old project back without the header.

The `updatedBy` fix addresses the echo path. The field-drop needs a write-side fix — either:
- A project-level field merge in `saveProject` (read current doc, preserve fields the incoming write is missing), or
- Ensuring all `saveProject` callers use `projectRef.current` instead of closure snapshots.

**Verdict: Scope field-drop as a separate item. Do NOT fold into this fix.**

---

## Completeness Check 3: Multi-User Side Effects

**Question:** Does the fix suppress legitimate echoes from other users?

**Answer: No.**

The guard is `remote.updatedBy !== uid`. The fix ensures `saveProjectPanel` sets `updatedBy = uid` (the writer's uid). When **User A** saves, the doc's `updatedBy` becomes User A's uid. When **User B's** onSnapshot fires, `remote.updatedBy` (User A) `!== uid` (User B) → guard passes → User B sees User A's changes. Correct behavior, unchanged.

The fix only closes the guard for the **writer's own** onSnapshot echo — where `remote.updatedBy` (now correctly = writer's uid) `=== uid` (writer) → guard blocks → no self-echo.

**Verdict: Multi-user echoes are unaffected.**

---

## Out of Scope: Last-Writer-Wins Architecture

After this fix, the immediate revert symptom is resolved: the user's edits survive because the onSnapshot echo is correctly suppressed.

However, **true concurrent edits** (two users editing the same panel simultaneously) still result in last-writer-wins. `saveProjectPanel` does a read-before-write (line 8790), but there's no optimistic concurrency check — if User A and User B both read the doc, edit different rows, and save, the second save overwrites the first. This requires a write-time staleness guard (compare `updatedAt` at read vs. write, reject if changed) or field-level merging. Larger architectural change — separate backlog item.

---

## Repro Plan

No live capture of the revert exists. The fix must be validated by constructing the conditions.

### Pre-fix repro (Marc runs BEFORE implementing)

**Setup:**
1. Open a project in ARC. Note the project's `updatedBy` field in Firestore (Firebase Console → project doc). If it's the current user's uid, temporarily change it to a different value (e.g., another team member's uid, or the string `"other-user"`) — this simulates the real-world condition where Jon's uid is on a doc Noah is editing.
2. The project should have at least one panel with BOM rows that have prices.

**Steps:**
1. Open the project in ARC.
2. Open browser DevTools Console.
3. Edit a price on a BOM row (e.g., change $100 to $999). Observe the new price in the UI.
4. Wait for the debounced save to fire (~500ms for price, ~1500ms for other fields). Watch the console for `[CONCURRENT] Soft-applied remote update from` — this is the onSnapshot echo firing.
5. **Observe:** The price reverts to its pre-edit value. The console log confirms the echo fired with `updatedBy` = the value set in step 1 (not the current user), so the guard passed.

**Alternative trigger:** Instead of waiting for the debounce, manually trigger a `saveProjectPanel` from the console or perform any action that saves the panel (e.g., toggle a checkbox). The onSnapshot echo follows ~100-500ms later.

**Expected result (pre-fix):** Price reverts. Console shows `[CONCURRENT] Soft-applied remote update from <other-user>`.

### Post-fix validation

**Same setup and steps.** After the fix:

**Expected result (post-fix):**
1. Price edit persists — no revert.
2. Console does NOT show `[CONCURRENT] Soft-applied remote update` for the user's own save, because `updatedBy` now matches uid → guard blocks the echo.
3. If a DIFFERENT user edits the project (e.g., from a second browser), the echo DOES fire with that user's changes — confirming multi-user echoes still work.

### Delete-resurrection variant

Same setup. Instead of editing a price, delete a BOM row. Observe whether the row reappears after the save + echo cycle. Pre-fix: row returns. Post-fix: row stays deleted.

---

## Commit Boundary

**Single commit.** One line added to `saveProjectPanel` at line ~8887.

Suggested commit message: `Fix BOM revert: set updatedBy in saveProjectPanel so onSnapshot self-echo is correctly suppressed`

---

## Post-Fix Remaining Items (Logged, Not Scoped)

| Item | Description | Priority |
|------|-------------|----------|
| Quotes drop fields | `saveProject` write-side staleness — separate root cause from echo bug. Needs write-side field preservation or fresh-read-before-write. | MEDIUM — scope separately |
| Last-writer-wins concurrent edits | Two users editing same panel simultaneously → second save overwrites first. Needs optimistic concurrency (updatedAt check) or field-level merge. | LOW — architectural, rare in current usage |
| W9 pricing stale-snapshot | `runPricingOnPanel` captures BOM at call time, writes full array at completion. Can overwrite user edits made during pricing run. Separate from echo bug. | MEDIUM — scope separately |

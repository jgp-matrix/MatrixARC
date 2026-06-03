# Noah "BOM Edits Revert" — Evidence Report

**Investigator:** Marc Masdev · 2026-06-03
**Status:** Root cause identified — **Bucket (A): onSnapshot echo** with a specific mechanism
**Fix designed:** NO — evidence only per instruction. Fix ownership pending.

---

## STEP 1 — Available Forensics

| Forensic source | What it captures | Useful for this bug? |
|----------------|------------------|---------------------|
| Debug logs (`debugLogs/{entryId}`) | Event metadata only — severity, source, message, projectId. NO write payloads, no BOM diffs, no save trigger info. | **No** — can't reconstruct write sequence |
| `updatedBy` field on project doc | Set by `saveProject()` only. NOT set by `saveProjectPanel()`. | **Yes** — this is the root cause |
| `updatedAt` field on project doc | Set by both `saveProject()` and `saveProjectPanel()`. | Partial — gives timing but not trigger source |
| Write-audit collection | **Does not exist.** No audit trail for project/panel mutations. | N/A |
| Console logging in save paths | Sparse. Quote rev bumps, page wipe guards. No payload logging. | **No** |
| onSnapshot logging | `[CONCURRENT] Soft-applied remote update from {uid}` on guard pass | **Yes** — but only visible in Noah's browser console at time of occurrence |

**Conclusion:** Existing forensics are **insufficient** to reconstruct a specific revert event after the fact. The root cause was identified via code analysis, not log mining.

---

## STEP 2 — PRJ402108 Write Sequence

Cannot reconstruct from logs — no write-audit trail exists. However, Firestore data confirms the conditions for the bug:

**Live Firestore sample (20 most-recently-updated projects):**

Projects where `updatedBy` is set to a DIFFERENT user than the active editor:

| Project | updatedBy | createdBy (likely editor) | Bug-vulnerable? |
|---------|-----------|--------------------------|-----------------|
| Villages Clarifier | **Jon** | Noah | **YES** — Noah's `saveProjectPanel` echoes back with `updatedBy: Jon`, guard passes |
| Secret Panel | **Jon** | Andrew | **YES** — same mechanism for Andrew |
| Hollywood Detritor CP | **Jon** | Noah | **YES** |

These projects have `updatedBy` set to Jon (from a prior `saveProject` call — e.g., archive, transfer, copy, or explicit full-project save). When Noah edits BOM rows, `saveProjectPanel` fires but does NOT update `updatedBy`. The field stays as Jon's UID.

---

## STEP 3 — Discriminator: The Exact Mechanism

**Root cause: `saveProjectPanel` does not set `updatedBy`, causing the onSnapshot echo guard to be defeated.**

### The race condition (step by step):

```
T=0.0s  Noah edits Row 5 price ($100 → $150)
        → updateBomRow() → onUpdate(updated) — React state updated immediately
        → latestPanelRef.current = panel with Row5=$150
        → 1.5s auto-save timer starts

T=1.5s  Auto-save timer fires
        → onSaveImmediate(latestPanelRef.current) → saveProjectPanel()
        → saveProjectPanel reads Firestore doc, replaces panel, writes
        → updatedBy is NOT changed (stays as Jon's UID from last saveProject)

T=2.0s  Noah edits Row 6 qty (2 → 3)     ← DURING the Firestore round-trip
        → updateBomRow() → onUpdate(updated) — React state: Row5=$150 + Row6=3
        → latestPanelRef.current = panel with Row5=$150 + Row6=3
        → NEW 1.5s auto-save timer starts

T=2.5s  onSnapshot fires from T=1.5s save
        → remote.updatedBy = "Jon's UID" (NOT Noah's — saveProjectPanel didn't set it)
        → Guard: "Jon's UID" !== Noah's UID → TRUE → GUARD PASSES
        → setProject(migrated) — overwrites React state with snapshot data
        → Snapshot has: Row5=$150 ✓, Row6=2 (pre-edit) ✗
        → PanelCard re-renders with Row6=2
        → line 23003: latestPanelRef.current = panel (now has Row6=2!)
        → Noah sees Row 6 revert to qty=2

T=3.5s  Auto-save timer from T=2.0s fires
        → onSaveImmediate(latestPanelRef.current) — but latestPanelRef was
          overwritten in T=2.5s with the stale snapshot data
        → Saves Row6=2 (STALE) to Firestore — edit is PERMANENTLY LOST
```

### Why "delete comes back":

Same mechanism. Noah deletes a row → `deleteBomRow` calls `onSaveImmediate` immediately (no debounce) → Firestore write completes → onSnapshot echoes back → `updatedBy` is another user → guard passes → state overwritten. If Noah made ANY other edit before or after the delete that was still in the debounce window, the echo overwrites the pending edit AND resets `latestPanelRef.current`, causing the next auto-save to write stale data.

### Why it's intermittent:

The bug requires TWO conditions simultaneously:
1. **`updatedBy` on the project doc is set to a different user** — this happens whenever Jon (admin) touches the project via `saveProject` (archive, transfer, copy, send quote, relink BC, etc.)
2. **Noah makes a second edit during the Firestore round-trip window** (~0.5-1.5s) of the first edit's save

Condition 1 is TRUE on a significant fraction of projects (confirmed via Firestore: 3 of 20 sampled). Condition 2 is probabilistic — fast editors hit it more often.

### Why "most projects":

Jon routinely touches Noah's projects via admin operations (relinking BC, transferring, reviewing). Each of these calls `saveProject` which stamps `updatedBy: Jon`. After that, ALL of Noah's BOM edits via `saveProjectPanel` are vulnerable to the echo race until Noah himself triggers a `saveProject` path (which is rare — `saveProject` is only called by high-level operations, not row edits).

---

## STEP 4 — Instrumentation Proposal (for validation, NOT implementation yet)

The code analysis identifies the root cause with high confidence. If validation is desired before fixing:

**Minimal instrumentation (3 lines, behind debug flag):**

1. In `saveProjectPanel` (~line 8919), log before write:
   ```
   console.log('[SAVE-AUDIT] saveProjectPanel:', projectId, panelId, 'updatedBy:', liveProject.updatedBy, 'uid:', uid);
   ```

2. In onSnapshot handler (~line 34836), log when guard passes:
   ```
   console.log('[SNAPSHOT-ECHO] Guard passed: updatedBy=', remote.updatedBy, 'uid=', uid, 'saving overwrite');
   ```

3. In `updateBomRow` (~line 24782), log timer fire:
   ```
   console.log('[AUTO-SAVE] Timer fired, latestPanelRef.current bom length:', latestPanelRef.current?.bom?.length);
   ```

**Deployment:** Have Noah keep the browser console open. When a revert happens, the console will show the `[SNAPSHOT-ECHO]` log immediately before the revert, confirming the mechanism.

**However:** The code-level proof is strong enough that instrumentation may be unnecessary. The fix is a one-liner.

---

## STEP 5 — Cross-Check: "Quotes Randomly Drop Fields"

**YES — same root cause.** The Budgetary header is stored in `panel.pricing.isBudgetary`, which is saved via `saveProjectPanel`. The same onSnapshot echo race can overwrite the `isBudgetary` flag:

1. Noah checks "Mark as Budgetary Quote" → `saveProjectPanel` saves with `isBudgetary: true`
2. `updatedBy` stays as Jon's UID
3. onSnapshot fires back → guard passes → state overwrites with pre-check data (or a concurrent stale save)
4. Budgetary header disappears

Both bugs share the same root: **`saveProjectPanel` not setting `updatedBy`.**

---

## Summary

| Question | Answer |
|----------|--------|
| Which bucket? | **(A) onSnapshot echo** — but not due to a missing guard. The guard exists (line 34836) but is **defeated** because `saveProjectPanel` doesn't set `updatedBy`. |
| Root cause proven? | **YES** — via code analysis + Firestore data confirming `updatedBy` mismatch on active projects. |
| Fix identified? | Yes (one-liner: add `updatedBy: uid` to `saveProjectPanel` at line 8887), but **NOT implemented** per instruction. |
| Instrumentation needed? | Optional — code proof is strong. 3-line console instrumentation available if validation desired. |
| "Quotes drop fields" related? | **YES** — same `saveProjectPanel` echo vulnerability. |
| PRJ402108 write sequence? | Cannot reconstruct — no write-audit trail exists. |

---

## Recommended Next Step (for Jon/Freddy)

Decide fix ownership. The fix is a one-liner in `saveProjectPanel` (add `updatedBy: uid`), but should be reviewed against:
- Whether any downstream code relies on `updatedBy` NOT being set by panel saves
- Whether the onSnapshot guard should also check `updatedAt` proximity (defense-in-depth against the window where `updatedBy` was just set by the same user but the echo arrives late)

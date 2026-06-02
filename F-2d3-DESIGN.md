# F-2d.3 Design — Firestore-after-BC Crash Recovery Gap

**Author:** Sam Wize (Coach)
**Date:** 2026-06-02
**Status:** DRAFT — awaiting Jon's review
**Severity:** CRITICAL
**Effort:** MEDIUM (~25 LOC across 3 sites)

---

## Problem

When a user manually syncs planning lines to BC (`syncPlanningLinesToBC`, line 23545), the sequence is:

```
1. bcSyncPanelPlanningLines(...)     → pushes data to BC         (line 23577)
2. computePanelBomHash(panel)        → computes new hash          (line 23616)
3. onUpdate(updated)                 → updates React state        (line 23618)
4. onSaveImmediate(updated)          → writes hash to Firestore   (line 23618)
```

If the app crashes / tab closes / network drops between steps 1 and 4, BC has the new planning lines but Firestore still has the old `bomSyncHash`. On next project open, the open-sync (line 34932) reads the stale hash, concludes the BOM changed since last sync, and re-syncs.

### Actual duplicate risk (refined)

The sync uses deterministic `Line_No` values (10000, 30000-50000, 60000+10000*i) and incremental compare-by-Line_No logic (line 3710-3740). Re-syncing identical BOM data results in all rows `skipped` — **no duplicates if BOM is unchanged between crash and re-sync.**

The real risks are:

1. **BOM edited between crash and re-sync:** If the user adds/removes/reorders rows before the next project open, the `Line_No` assignments shift. The stale hash triggers a re-sync with new Line_No positions. BC gets new lines POSTed at new positions + old lines at old positions that should have been deleted but aren't (the orphan detection at line 3742 only deletes lines NOT in the current desired set, which uses new Line_No values — it will correctly delete old orphans). Actually, the delete logic IS correct for this case. The real issue is **wasted BC API calls and 429 pressure** on every project open.

2. **Open-sync hash save is DISABLED (line 34962-34967):** The v1.20.65 hotfix disabled the hash-save-back in open-sync. This means open-sync fires on EVERY project open regardless of crash state — the hash never gets written back. This is the more immediate problem: every BC-connected project open triggers a full BC sync, even when nothing changed.

3. **Partial sync + crash:** If BC sync completed for 3 of 5 ECO tasks and then crashed, the next re-sync pushes all 5 again. The 3 completed ones get `skipped` (no harm), the 2 incomplete ones get properly synced. This is actually safe.

### Revised severity assessment

The duplicate-line risk is lower than originally reported because the sync is incremental and uses deterministic Line_No values. The primary harm is:
- **Wasted BC API calls** on every project open (429 pressure)
- **The disabled hash-save-back** from v1.20.65 means the hash is NEVER written by open-sync, making the crash gap moot for that path — it's already broken
- **Manual sync crash** (the original F-2d.3 scenario) is rare but real

**Recommendation: Fix the disabled hash-save-back FIRST (it's the bigger problem), then add the idempotency marker as defense-in-depth.**

---

## 1. Marker Schema

### Fields (per-panel, on the panel object in Firestore)

```js
{
  bomSyncHash: "12345",           // existing — hash of BOM at last successful sync
  bomSyncPending: true|false,     // NEW — true while BC sync is in progress
  bomSyncStartedAt: 1717300000000 // NEW — Date.now() when sync started (for staleness)
}
```

**Why per-panel, not per-project:** Each panel syncs independently. Panel 1 might succeed while panel 2 crashes. Per-panel markers allow independent recovery.

**Why on the panel object (not a separate Firestore doc):** The panel is already the unit of save for `saveProjectPanel`. Adding two fields to the existing panel write is simpler and atomic with the hash clear.

### Staleness threshold

```js
const SYNC_PENDING_STALE_MS = 5 * 60 * 1000; // 5 minutes
```

If `bomSyncPending` is true and `bomSyncStartedAt` is older than 5 minutes, treat the sync as failed/abandoned. This handles:
- Tab closed mid-sync (sync never completes)
- Network dropped permanently
- BC down for extended period

5 minutes is generous: even a 50-row panel sync takes ~30 seconds. Any sync still pending after 5 minutes is dead.

---

## 2. Full Sequence — Manual Sync (syncPlanningLinesToBC)

### Before (current)

```
BC sync → hash → React state → Firestore write
```

### After (with marker)

```
Step 0: Write pending marker to Firestore (blocking)
Step 1: BC sync (unchanged)
Step 2: Compute hash
Step 3: Write hash + clear marker to Firestore (single write, atomic)
Step 4: Update React state
```

### Step 0 — Write pending marker

**Before** the BC sync starts, write `bomSyncPending: true` and `bomSyncStartedAt: Date.now()` to Firestore. This write MUST complete before the BC sync begins — it's the "I'm about to sync" signal that recovery logic reads.

This is a single `saveProjectPanel` call with just the two marker fields. It's fast (~200ms) and adds one Firestore write to the sync path.

### Step 3 — Write hash + clear marker (atomic)

**After** the BC sync succeeds, write three fields in one `saveProjectPanel` call:
- `bomSyncHash: newHash` (same as today)
- `bomSyncPending: false`
- `bomSyncStartedAt: null`

Because all three fields are in the same Firestore write, they're atomic. There's no window where the hash is updated but the marker isn't cleared.

### On BC sync failure

If the BC sync throws, clear the marker WITHOUT updating the hash:
- `bomSyncPending: false`
- `bomSyncStartedAt: null`
- `bomSyncHash`: unchanged (stays at old value)

This tells recovery logic: "sync was attempted but failed; re-sync is needed."

---

## 3. Recovery Logic — Open-Sync

### Current behavior (line 34932-34975)

```js
const curHash = computePanelBomHash(p);
if (curHash === (p.bomSyncHash || "")) { continue; } // Already synced
await bcSyncPanelPlanningLines(...);
// hash save-back DISABLED (lines 34962-34967)
```

### New behavior

```js
const curHash = computePanelBomHash(p);
const hashMatch = curHash === (p.bomSyncHash || "");
const pending = p.bomSyncPending && p.bomSyncStartedAt;
const stale = pending && (Date.now() - p.bomSyncStartedAt > SYNC_PENDING_STALE_MS);

if (hashMatch && !pending) { continue; } // Fully synced, no pending marker — skip

if (pending && !stale) {
  // Sync was started recently (< 5min). Another tab or session may still be syncing.
  // Don't re-sync — avoid duplicate concurrent syncs. Skip silently.
  console.log(`[OPEN BC SYNC] panel ${i+1}: sync pending (started ${Math.round((Date.now()-p.bomSyncStartedAt)/1000)}s ago), skipping`);
  continue;
}

if (stale) {
  // Pending marker is older than 5 minutes — the original sync is dead.
  // Clear the stale marker and proceed with a fresh sync.
  console.log(`[OPEN BC SYNC] panel ${i+1}: stale pending marker (${Math.round((Date.now()-p.bomSyncStartedAt)/1000)}s), clearing and re-syncing`);
}

// Either: hash mismatch (BOM changed), or stale pending (previous sync died).
// In both cases: sync to BC, then write hash + clear marker.
try {
  // Write pending marker before sync
  const markerPanel = {...p, bomSyncPending: true, bomSyncStartedAt: Date.now()};
  await saveProjectPanel(uid, projectId, p.id, markerPanel, true);

  await bcSyncPanelPlanningLines(bcNum, i+1, p, projectName);
  synced++;

  // Write hash + clear marker (atomic)
  const syncHash = computePanelBomHash(p);
  const hashed = {...p, bomSyncHash: syncHash, bomSyncPending: false, bomSyncStartedAt: null};
  await saveProjectPanel(uid, projectId, p.id, hashed, true);

  // Update React state so manual sync sees the new hash
  const updPanels = (projectRef.current.panels || []).map((cp, j) => j === i ? hashed : cp);
  const upd = {...projectRef.current, panels: updPanels};
  setProject(upd); projectRef.current = upd; onChange(upd);
} catch (e) {
  console.warn("Open BC sync panel", i+1, "failed:", e);
  // Clear marker on failure — don't leave it stuck
  try {
    await saveProjectPanel(uid, projectId, p.id, {...p, bomSyncPending: false, bomSyncStartedAt: null}, true);
  } catch (e2) {}
}
```

**This also re-enables the hash save-back** that was disabled in v1.20.65. The v1.20.71 fix (using `projectRef.current` instead of `init.panels`) makes the save-back safe again. The original disable was because `init.panels` was stale — that's no longer the case.

### Why Option A (skip) over Option C (compare BC lines)

Jon's design questions listed three recovery options:
- **Option A:** Skip (assume sync completed)
- **Option B:** Re-sync (assume it didn't)
- **Option C:** Compare BC planning lines to detect completion

**Recommendation: A hybrid of A and B, informed by the staleness check.**

- **Fresh pending (< 5 min):** Skip. Another tab is probably still syncing. (Option A)
- **Stale pending (> 5 min):** Re-sync. The original sync is dead. (Option B)
- **No pending, hash mismatch:** Re-sync. Normal case — BOM changed. (Option B)

Option C (compare BC lines) is rejected because:
- It requires fetching all existing BC planning lines just to CHECK whether we need to sync — the same BC API calls as actually syncing.
- The incremental sync already handles the "lines already exist" case (it skips identical lines). So re-syncing IS the comparison — it's idempotent by design.
- Adding a separate comparison path doubles the code complexity for no benefit.

---

## 4. UI Considerations

### During pending state

The existing `bcSyncing` React state (line 23562) already shows a spinner/status during the manual sync button press. No UI change needed for the pending marker — it's a Firestore-level flag, not a React state.

### On stale pending recovery

When open-sync detects a stale pending marker, it silently re-syncs. No user-facing warning.

**Rationale:** The user doesn't need to know their previous sync partially completed. The recovery is silent and safe (incremental sync skips identical lines). Showing a "previous sync may have failed" warning would alarm users without actionable information — they can't do anything except "sync again," which the recovery does automatically.

### On sync failure after pending marker written

If the BC sync fails after the pending marker is written, the catch block clears the marker and the existing error UI shows (`setBcSyncStatus("error")` at line 23623). No additional UI needed.

---

## 5. Edge Cases

### Multiple panels with independent pending flags

Each panel has its own `bomSyncPending` / `bomSyncStartedAt`. The manual sync (`syncPlanningLinesToBC`) only syncs the current panel. Open-sync iterates all panels sequentially. No interaction — each panel's marker is independent.

### User edits BOM while bomSyncPending is true

Scenario: User clicks "Sync to BC" → pending marker written → BC sync in progress → user edits BOM → BC sync completes → hash written.

The hash written at step 3 reflects the BOM state AT SYNC TIME, not the edited state. On next open, the hash won't match the edited BOM, so a re-sync fires. This is correct behavior — the edits need to be synced.

No special handling needed. The pending marker is irrelevant here — it gets cleared when the original sync completes.

### Marker stuck pending forever

Scenario: User clicks sync → pending marker written → BC times out → app crash before catch block clears marker.

The 5-minute staleness check handles this. On next open, the stale marker is detected, cleared, and a fresh sync fires. Maximum downside: 5-minute window where the next user to open the project sees "sync pending" and open-sync skips the panel. After 5 minutes, recovery kicks in.

### Concurrent users

Scenario: User A syncs panel 1 → crash → User B opens the project → sees pending marker.

If the marker is fresh (< 5 min), User B's open-sync skips panel 1 (assumes User A is still syncing). If stale (> 5 min), User B's open-sync clears the marker and re-syncs. Both are correct:
- Fresh: User A may still be syncing in another tab. Skipping avoids duplicate concurrent syncs.
- Stale: User A is gone. Recovery proceeds.

**The 5-minute threshold means a concurrent user might wait up to 5 minutes before their open-sync proceeds.** This is acceptable — the manual sync button still works immediately (it doesn't check `bomSyncPending`).

### Open-sync saves panel while manual sync is in progress

The open-sync hash save-back uses `saveProjectPanel` which has per-project locking (`_panelSaveLocks`). This serializes the saves. The last writer wins, but both writers are writing the same hash (computed from the same BOM state), so the result is correct regardless of order.

---

## 6. LOC Estimate

| Location | Change | LOC |
|----------|--------|-----|
| `syncPlanningLinesToBC` (line 23562-23618) | Add pending marker write before sync, clear on success/failure | +10 |
| Open-sync `useEffect` (line 34932-34975) | Add pending/stale check, re-enable hash save-back | +15 |
| Pre-print sync (line 36531-36541) | Add pending marker (same pattern) | +8 |
| `SYNC_PENDING_STALE_MS` constant | Add near other constants | +1 |
| **Total** | | **~34 LOC** |

---

## 7. Implementation Plan for Marc

### Change sites (3 total)

#### Site 1: Manual sync — `syncPlanningLinesToBC` (line 23545)

**After** line 23562 (`setBcSyncing(true);setBcSyncStatus(null);setSyncFailedAlert(null);`):

Insert pending marker write:
```js
    // F-2d.3: Write pending marker before BC sync starts.
    try{onSaveImmediate({...panel,bomSyncPending:true,bomSyncStartedAt:Date.now()});}catch(e){}
```

**At** line 23616-23618 (success path), replace:
```js
        const syncHash=computePanelBomHash(panel);
        const updated={...panel,bomSyncHash:syncHash};
        onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}
```
with:
```js
        const syncHash=computePanelBomHash(panel);
        const updated={...panel,bomSyncHash:syncHash,bomSyncPending:false,bomSyncStartedAt:null};
        onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}
```

**At** line 23621-23626 (catch block), add marker clear:
```js
    }catch(e){
      console.error("bcSyncPlanningLines failed:",e);
      setBcSyncStatus("error");
      try{onSaveImmediate({...panel,bomSyncPending:false,bomSyncStartedAt:null});}catch(e2){}
      setTimeout(()=>setBcSyncStatus(null),6000);
```

#### Site 2: Open-sync — `useEffect` (line 34932)

Replace lines 34953-34968 (the `for` loop body and disabled hash-save) with the recovery logic from section 3 above. This is the largest change (~15 lines replacing ~15 lines). Key points:
- Add staleness constant at module level: `const SYNC_PENDING_STALE_MS=5*60*1000;`
- Add pending/stale/fresh check before syncing
- Re-enable hash save-back (was disabled by v1.20.65)
- Add marker write/clear around the sync call

Marc will need `uid`, `projectId` (from `init.id`), and `saveProjectPanel` in scope. All are already available in `ProjectView`.

#### Site 3: Pre-print sync (line 36531)

Same pattern as Site 1: write marker before sync, clear + hash on success, clear on failure. The pre-print sync at line 36535-36540 already does hash save-back correctly — just add the marker fields to the existing writes.

### Verification

After implementation, Marc should test:
1. **Manual sync** — Sync a panel, verify `bomSyncPending: false` and `bomSyncHash` updated in Firestore
2. **Open-sync** — Open a project with stale hash, verify open-sync fires and writes hash back
3. **Stale marker** — Manually set `bomSyncPending: true, bomSyncStartedAt: (Date.now() - 600000)` in Firestore, open the project, verify recovery clears it and re-syncs
4. **Fresh marker** — Set `bomSyncPending: true, bomSyncStartedAt: Date.now()` in Firestore, open the project, verify open-sync SKIPS the panel

---

## 8. Dependency Note

**This fix also re-enables the open-sync hash save-back** that was disabled in the v1.20.65 hotfix (lines 34962-34967). That disable was necessary because `init.panels` was stale — but v1.20.71 replaced `init.panels` with `projectRef.current`, making the save-back safe again. The re-enablement is part of this fix, not a separate change.

The disabled hash save-back is currently a bigger problem than the crash gap: it means open-sync fires on EVERY project open, generating unnecessary BC API calls. Fixing F-2d.3 solves both issues in one change.

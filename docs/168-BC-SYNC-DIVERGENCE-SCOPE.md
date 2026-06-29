# #168 — BC Auto-Sync vs Manual Sync Divergence Trace

**Author:** Sam Wize (Coach)  
**Type:** Read-only trace (C-finding)  
**Date:** 2026-06-29  
**Version:** v1.21.1  
**Status:** DIVERGENCE PROVEN — ready for review

---

## The Bug

After extraction + pricing completes, an auto-popup appears ("⚠ BC Sync Incomplete")
listing items that "could not be pushed to BC." Closing the popup and clicking the
manual "BC Sync" toolbar button syncs those **same items** to the **same BC environment**
successfully. The auto-popup fires before the user ever sees the BOM.

Confirmed in production v1.21.1. Same items, same BC, different results.

## Finding: Concurrent Race Between Two Sync Calls

**The divergence is a race condition.** Two independent calls to `bcSyncPanelPlanningLines`
fire on the same BC task within seconds of each other. The second call reads a
partially-modified BC state (mid-write from the first call) and fails on lines the
first call has already created or is about to create.

The manual button works because it runs after both concurrent calls have finished —
a clean, uncontested sync against a stable BC state.

---

## 1. Entry Points + Timing

### Path A — Direct fire-and-forget (inside `runPricingOnPanel`)

**Location:** `src/app.jsx:27460–27465`

```js
// Auto-sync to BC after pricing is complete (not during extraction)
if(bcProjectNumber&&_bcToken&&updatedBom.length>0){
  bcSyncPanelPlanningLines(bcProjectNumber,idx+1,updated,projectName).then(result=>{
    if(result.failed?.length>0)console.warn("Post-pricing BC sync: "+result.failed.length+" items failed");
    else console.log("Post-pricing BC sync: planning lines synced");
    bcSyncPanelTaskDescriptions(...)
  }).catch(e=>console.warn("Post-pricing BC sync failed:",e));
}
```

- **Fires:** Immediately when `runPricingOnPanel` finishes building the updated panel
- **Panel arg:** `updated` (line 27433) — built from `updatedBom` with `bcNo` populated
- **Popup on failure?** NO — failures go to `console.warn` only
- **Sets `bcSyncing`?** NO — calls `bcSyncPanelPlanningLines` directly, bypasses `syncPlanningLinesToBC`
- **Sets `bomSyncHash` on success?** NO — only `syncPlanningLinesToBC` does that

### Path B — useEffect auto-sync (reactive trigger)

**Location:** `src/app.jsx:25098–25121` (trigger) → `25145–25235` (execution)

```js
// Trigger (useEffect):
useEffect(()=>{
  const bcCount=bom.filter(r=>r.priceSource==='bc').length;
  // ...
  if(bcCountIncreased&&!ecoChanged){
    const unpriced=bom.filter(r=>!r.isLaborRow&&r.priceSource!=="bc"&&r.priceSource!=="manual");
    if(unpriced.length>0)return;
  }
  bcAutoSyncTimer.current=setTimeout(()=>syncPlanningLinesToBC(),3000);  // line 25120
},[JSON.stringify((panel.bom||[]).map(r=>r.id+'|'+r.priceSource)),_ecoSig]);
```

- **Fires:** 3 seconds after React re-renders with the new `bcCount` (triggered by
  `onUpdate(updated)` at line 27434, which stamps `priceSource:"bc"` on rows)
- **Panel arg:** `panel` (component prop from the render that set the timer — structurally
  equivalent to `updated`)
- **Popup on failure?** YES — `syncPlanningLinesToBC` calls `setSyncFailedAlert(result.failed)`
  at line 25210
- **Sets `bcSyncing`?** YES — at line 25162
- **Sets `bomSyncHash` on success?** YES — at line 25219

### Path C — Manual button

**Location:** `src/app.jsx:28401`

```js
<button onClick={syncPlanningLinesToBC} disabled={bcSyncing} ...>
```

- **Fires:** On user click after the popup is dismissed
- **Same function** as Path B's execution (`syncPlanningLinesToBC`)
- **Popup on failure?** YES (same code path)
- **Works because:** No concurrent call is in progress; BC state is stable

### Timeline

```
T+0s    runPricingOnPanel finishes:
          → onUpdate(updated)               [queues React re-render]
          → await onSaveImmediate(updated)   [Firestore write]
          → setAiPricing(false)              [pricing bar clears]
          → [lines 27459-27465]:             PATH A fires bcSyncPanelPlanningLines
                                             (fire-and-forget, no popup, no bcSyncing)

T+0.1s  React re-renders with new panel (bcCount increased)
          → useEffect detects bcCount increase
          → setTimeout(syncPlanningLinesToBC, 3000)   [3s timer starts]

T+0.5s  PATH A: backfills task block, discovers OData pages, GETs existing lines
          → sees 0 existing lines (first sync after extraction)
          → builds desired lines from updated panel

T+1–15s PATH A: Step 2b posting-group checks (serial, ~300ms/item)
          → for 50 items ≈ 15 seconds

T+3.1s  PATH B fires: syncPlanningLinesToBC()
          → bcSyncing guard? bcSyncing=false (PATH A never set it) → PASSES
          → bomSyncHash guard? bomSyncHash=undefined (PATH A never set it) → PASSES
          → unpriced guard? all priceSource="bc" or "manual" → PASSES
          → setBcSyncing(true)
          → calls bcSyncPanelPlanningLines

T+3.5s  PATH B: GETs existing lines
          → PATH A is still in Step 2b (posting-group fixes)
          → BC has 0 planning lines (PATH A hasn't created any yet)
          → PATH B builds the SAME desired lines as PATH A

T+15s   PATH A enters Step 3: starts POSTing lines (60000, 70000, 80000, ...)
T+16s   PATH B enters Step 3: starts POSTing lines (60000, 70000, 80000, ...)

          *** RACE: Both POST the same Line_No to the same BC task ***

          → One call creates line 60000 first; the other gets BC rejection
            (duplicate record or "already exists")
          → The loser tries _fallback (Type:"Text", same Line_No) → also fails
          → Failed items go into PATH B's failedRows → setSyncFailedAlert → POPUP

T+30s   Both calls finish. BC has all lines (created by whichever POST won each Line_No).
          → User sees "⚠ BC Sync Incomplete" popup with N items

T+??    User dismisses popup, clicks manual "BC Sync" button (PATH C)
          → syncPlanningLinesToBC runs alone (no concurrent call)
          → GETs existing lines → all present (created by PATH A and/or PATH B)
          → PATCH/skip for each line → everything matches → 0 failures
          → "ok" status, no popup
```

## 2. Shared Core or Two Implementations?

**Shared core.** Both paths call the same function: `bcSyncPanelPlanningLines`
(`src/app.jsx:3526`). There are no separate sync implementations.

The divergence is **not** in the sync function itself — it's in the **call pattern**.
Path A calls `bcSyncPanelPlanningLines` directly (fire-and-forget). Path B calls it
through `syncPlanningLinesToBC` (which adds guards, popup, and hash tracking). Both
pass structurally equivalent panel data.

**The bug is that two callers both invoke the shared core concurrently on the same BC
task, with no mutex between them.**

## 3. Lookup Key

Both paths use the same lookup key. `bcSyncPanelPlanningLines` builds each BOM
planning line with:

```js
No: _bcNo(row)     // src/app.jsx:3662
```

Where `_bcNo` is defined at line 4325:

```js
function _bcNo(row) { return row?.bcNo || (row?.partNumber || '').slice(0,20); }
```

- For BC-priced items: `bcNo` is populated during pricing (line 27020–27023,
  `bcNo: matchedBcNo` where `matchedBcNo = bcMap[key].bcNumber` from the fuzzy lookup)
- For AI-priced items: `bcNo` is absent; `partNumber.slice(0,20)` is used
- Both Path A and Path B see the same `bcNo` values on the same rows

**The lookup key is NOT the divergence point.** Both paths resolve to the same `No` value
for each row. The `_resolveVendorItemNo` / `_vinResolved` flow (C113/C115) is only used
in `commitBcItem` (the Item Browser manual-commit flow) — it is NOT on the pricing →
auto-sync path and is NOT a factor in this bug.

## 4. Async Prerequisites

| Prerequisite | Path A (direct) | Path B (useEffect) | Manual (Path C) |
|---|---|---|---|
| BC token (`_bcToken`) | Guard at 27460 | Acquired at 25169 if missing | Same as B |
| `bcNo` populated | Yes (pricing at 27020) | Yes (same panel) | Yes |
| VIN resolution | N/A (not on this path) | N/A | N/A |
| Pricing complete | Yes (fires at end of pricing) | Yes (triggered by priceSource change) | Yes (user waited) |
| Region learning/cache | N/A | N/A | N/A |
| **No concurrent sync** | **NO — Path B fires 3s later** | **NO — Path A is already running** | **YES — runs alone** |

**The single divergence driver is concurrent execution.** All other prerequisites are
met identically for all three paths. The manual button works because it's the ONLY
sync running — Path A and B have both finished, BC state is stable, and the incremental
sync (PATCH existing / skip unchanged) handles everything cleanly.

## 5. The "Couldn't Sync" Predicate

**Location:** `src/app.jsx:25208–25213` (inside `syncPlanningLinesToBC`)

```js
if(result.failed && result.failed.length > 0){
  setBcSyncStatus("error");
  setSyncFailedAlert(result.failed);     // ← THIS IS THE POPUP
  const errs = {};
  result.failed.forEach(f => { if(f.rowId) errs[f.rowId] = f; });
  setBcSyncErrors(prev => ({...prev, ...errs}));
}
```

`result.failed` is populated inside `bcSyncPanelPlanningLines` at line 3754–3766.
An item enters `failedRows` when:

1. **POST fails** (line 3759): `r.ok` is false for the primary `Type:"Item"` POST
2. **Fallback POST also fails** (line 3765): `_fallback` POST with `Type:"Text"` also fails
3. Or: **no fallback exists** and the primary POST fails (line 3766)

For the race scenario, the failure is: BC rejects the POST because the Line_No
already exists (created by Path A). The fallback uses the same Line_No → also
rejected. Both fail → item goes into `failedRows`.

**The predicate is simply "did the BC POST fail?"** It does NOT check whether the item
exists in BC, whether VIN is resolved, or whether the token is valid. The "couldn't
sync" framing in the UI ("could not be pushed to BC") is technically accurate — the
POST failed — but the reason is a duplicate-creation race, not a missing item.

## Assessment: Single Divergence Point

**Root cause:** `runPricingOnPanel` fires `bcSyncPanelPlanningLines` directly at line
27460 (fire-and-forget, no guards, no popup) AND the `useEffect` auto-sync at line
25098–25120 fires `syncPlanningLinesToBC()` → `bcSyncPanelPlanningLines` 3 seconds
later. There is no mutex, no `bcSyncing` interlock, and no `bomSyncHash` coordination
between the two calls. The underlying sync function is the same; the race is in the
call pattern.

**Why Path A exists:** It was added as a "convenience" sync at the end of pricing
(comment: "Auto-sync to BC after pricing is complete"). It predates or is unaware of
the useEffect auto-sync at line 25098, which ALSO triggers on the pricing-complete
state change (bcCount increase).

**Why Path B also fires:** The useEffect watches `priceSource` changes on BOM rows.
When pricing stamps `priceSource:"bc"`, the count jumps from 0 to N, triggering the
3-second debounced sync. Path A's direct call doesn't set `bcSyncing` (it bypasses
`syncPlanningLinesToBC`), doesn't set `bomSyncHash`, and doesn't clear the useEffect
timer. Path B has no way to know Path A is already running.

**Why the manual button works:** By the time the user dismisses the popup and clicks
"BC Sync," both Path A and Path B have finished. BC has all lines (created by whichever
path won each Line_No). The manual sync GETs the complete state, PATCHes or skips each
line, and reports zero failures.

## Marc Runtime Pull Needed

To confirm the specific BC error that surfaces during the race, one data point would
close this definitively:

- **Capture the `result.failed` array** from the `syncPlanningLinesToBC` popup on the
  next occurrence. The `parseBcError` helper at line 27701 classifies the error, but
  the raw `r.error` string would confirm whether BC says "record already exists,"
  "must select an existing item," or another validation error. Console output from
  `"Post-pricing BC sync: N items failed"` (line 27462, Path A's log) would also show
  whether Path A saw failures concurrently.

This is confirmatory, not blocking — the race is structurally proven from the code.

---

**Stop here. No fix design until Jon reviews the divergence finding.**

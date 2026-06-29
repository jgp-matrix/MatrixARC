# #168 Detailed Plan — Consolidate BC Auto-Sync to One Trigger

**Author:** Sam Wize (Coach)  
**Type:** Implementation plan (read-only — no build, no deploy)  
**Date:** 2026-06-29  
**Status:** Ready for review  
**Depends on:** C110 divergence trace (`docs/168-BC-SYNC-DIVERGENCE-SCOPE.md`)

---

## Decision (Jon)

Delete Path A (the direct fire-and-forget `bcSyncPanelPlanningLines` inside
`runPricingOnPanel`). Path B (the `useEffect` → `syncPlanningLinesToBC`) becomes the
sole auto-sync. Manual "BC Sync" button (Path C) unchanged. Failure popup stays.

## Pre-Plan Verifications (Coach, settled)

### V1 — Task-Description Sync Coverage ✅ NO ORPHAN

Path A chains `bcSyncPanelTaskDescriptions` in its `.then()` at line 27464.

**Path B already covers this.** Inside `syncPlanningLinesToBC`, line 25180–25181:

```js
result = await bcSyncPanelPlanningLines(bcProjectNumber, idx+1, panel, projectName);
// Always sync task descriptions so existing projects get updated
bcSyncPanelTaskDescriptions(bcProjectNumber, idx+1, panel, projectName)
  .catch(e => console.warn("task desc sync failed:", e));
```

Same function, same args, same fire-and-forget pattern. Deleting Path A loses nothing.

**`runPricingBackground` (line 15191–15192)** also chains its own
`bcSyncPanelTaskDescriptions`. This is the background path (user navigated away) —
operates outside React, no useEffect fires, no race. Untouched by this fix.

### V2 — Unpriced Guard Coverage ✅ AIRTIGHT (two layers)

The useEffect at lines 25098–25122 has two trigger conditions that reach the
`setTimeout(syncPlanningLinesToBC, 3000)` at line 25120:

| Trigger | Unpriced check in useEffect? | Reaches setTimeout? |
|---------|------|------|
| `bcCountIncreased && !ecoChanged` | **YES** (line 25115–25117) — blocks if any non-labor row is not bc/manual | Only if all priced |
| `ecoChanged` (with or without bcCountIncreased) | **NO** — deliberately bypassed (comment at 25112–25114: "ECO trigger does not [require all priced]") | Always |

The ECO bypass is **intentional** — ECO rows inherit base pricing at creation time.

**But it doesn't matter**, because `syncPlanningLinesToBC` has its OWN unpriced guard
at line 25160 that catches AI-priced items on ANY entry path:

```js
const unpriced = (panel.bom||[]).filter(r =>
  !r.isLaborRow && (r.partNumber||"").trim() &&
  r.priceSource !== "bc" && r.priceSource !== "manual"
);
if(unpriced.length) { setUnpricedAlert(unpriced); return; }
```

AI-priced rows (`priceSource:"ai"`) pass this filter → `setUnpricedAlert` → sync
blocked. This guard fires for both the useEffect auto-trigger AND the manual button.

**Result:** An AI-item quote can never auto-sync to BC, regardless of whether the
trigger is bcCount increase or ECO change. Two independent guards ensure this.

**Action:** Add a load-bearing comment at both guard sites (see Phase 2 below).

---

## Phase 1 — Delete Path A

**File:** `src/app.jsx`  
**Location:** Inside `runPricingOnPanel`, lines 27459–27467

**Delete this block:**

```js
    // Auto-sync to BC after pricing is complete (not during extraction)
    if(bcProjectNumber&&_bcToken&&updatedBom.length>0){
      bcSyncPanelPlanningLines(bcProjectNumber,idx+1,updated,projectName).then(result=>{
        if(result.failed?.length>0)console.warn("Post-pricing BC sync: "+result.failed.length+" items failed");
        else console.log("Post-pricing BC sync: planning lines synced");
        bcSyncPanelTaskDescriptions(bcProjectNumber,idx+1,updated,projectName).catch(e=>console.warn("Post-pricing task desc sync failed:",e));
      }).catch(e=>console.warn("Post-pricing BC sync failed:",e));
      // BC drawing upload deferred until user prints quote (As-Quoted flow)
    }
```

That's the entire `if` block — 8 lines including the comment, the condition, the
`.then()` chain, and the trailing comment. After deletion, `runPricingOnPanel` ends at
the `pricingClearTimer.current=setTimeout(...)` line (currently 27458), and the next
function is `validatePanel()`.

**What NOT to delete:**

- The `runPricingBackground` sync at line 15190–15194 — this is the background path
  for navigated-away panels. No React, no useEffect, no race. It's the sole sync for
  that code path and is correct.

- The useEffect auto-sync at lines 25098–25122 — this becomes the sole foreground
  auto-sync trigger.

- `syncPlanningLinesToBC` at lines 25145–25235 — the canonical sync function. Unchanged.

- The manual button at line 28401 — `onClick={syncPlanningLinesToBC}`. Unchanged.

## Phase 2 — Load-Bearing Guard Comments

Add comments at both unpriced guard sites to mark them as load-bearing. These prevent
a future session from "simplifying" away the guard that blocks AI-item auto-sync.

### 2a — useEffect guard (line 25115)

Replace the existing comment block at lines 25112–25114:

**Before:**
```js
    // BASE trigger requires all non-labor rows priced. ECO trigger does not —
    // the user is intentionally adding/editing tagged rows and they inherit
    // pricing from their base row at creation time.
```

**After:**
```js
    // LOAD-BEARING GUARD (#168): BASE trigger requires all non-labor rows
    // BC/manual-priced. Prevents auto-sync of AI-estimated items to BC.
    // ECO trigger deliberately bypasses this — ECO rows inherit base pricing.
    // syncPlanningLinesToBC has a second-layer guard (line ~25160) that
    // catches AI items on ALL paths including ECO. Do not remove either guard.
```

### 2b — syncPlanningLinesToBC guard (line 25154)

Replace the existing comment at line 25154:

**Before:**
```js
    // Guard: all non-labor BOM rows (including auto-replaced) must have a BC or manual price.
```

**After:**
```js
    // LOAD-BEARING GUARD (#168): All non-labor BOM rows must be BC/manual-priced.
    // This is the sole gate preventing AI-estimated items from syncing to BC.
    // Applies to both auto-sync (useEffect) and manual button paths.
```

## Phase 3 — Verify (Marc)

No new functions. No data model changes. No new files. The fix is a deletion + two
comment updates. Verification confirms the race is gone and no behavior is orphaned.

### T1 — Race eliminated (fully priced quote)

1. Open a BC-connected project with a panel containing BOM items.
2. Drop drawings → extraction runs → pricing runs → all items BC-priced.
3. **Expected:** NO "⚠ BC Sync Incomplete" popup. BC planning lines created
   successfully. Only ONE `bcSyncPlanningLines:` log line in console (from the
   useEffect path via `syncPlanningLinesToBC`). No `"Post-pricing BC sync:"` log line
   (that was Path A — deleted).
4. **Verify in BC:** all panel planning lines present (60000+ series for BOM items,
   30000/40000/50000 for labor, 10000 for progress billing).

### T2 — Task descriptions still sync

1. Same project from T1 (or any BC-connected project after a sync).
2. Check console for `"bcSyncPanelTaskDescriptions: task ..."` log lines.
3. **Expected:** Task description PATCH logs appear (from `syncPlanningLinesToBC`
   line 25181). The descriptions in BC match the panel's drawing number, revision,
   and project name.

### T3 — AI-item quote does NOT auto-sync

1. Open a BC-connected project. Drop drawings for a panel where some items won't
   match BC (unusual/custom parts → AI-estimated pricing).
2. Extraction + pricing completes. Some rows have `priceSource:"ai"`.
3. **Expected:** NO auto BC sync fires. No "⚠ BC Sync Incomplete" popup. No
   `bcSyncPlanningLines:` log. The useEffect guard blocks (all rows not bc/manual →
   `unpriced.length > 0 → return`).
4. Manually price out the AI items via Item Browser (`commitBcItem` → `priceSource:"bc"`).
5. Click manual "BC Sync" button.
6. **Expected:** Sync runs cleanly, all lines created in BC.

### T4 — Re-sync idempotency

1. After T1 completes, click the manual "BC Sync" button again.
2. **Expected:** Hash check at line 25148 catches unchanged BOM → "ok" status,
   no popup, console logs `"syncPlanningLinesToBC: hash unchanged, skipping sync"`.

---

## Scope Boundary

- **In scope:** Delete Path A, add guard comments, verify.
- **Out of scope:** `runPricingBackground` sync (line 15190) — different code path,
  no race, correct as-is. The useEffect auto-sync logic itself (trigger conditions,
  debounce timing, ECO bypass) — unchanged. The `syncPlanningLinesToBC` function body
  — unchanged. The failure popup (`syncFailedAlert`) — stays; it surfaces genuine
  BC failures, not just race artifacts.

## C110 Runtime Pull Note

The raw `result.failed[].error` strings from the next occurrence would confirm whether
BC reports "record already exists" during the race. Not blocking — the race is
structurally proven. If Marc sees the popup before deploying this fix, capturing and
logging the raw error to console would close it for the record. After this fix deploys,
the popup should only appear for genuine BC failures (missing items, posting group
issues, rate limits).

---

**Stop here. No build, no deploy. Plan ready for Jon's review.**

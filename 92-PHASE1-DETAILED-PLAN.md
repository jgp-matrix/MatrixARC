# #92 Phase 1 — Cache Re-Key Detailed Plan

**Author:** Sam Wize (Coach) · 2026-06-03  
**Status:** Plan — awaiting Jon's approval → Marc implements  
**Scope:** H1 (`_pendingPagesCache`) + H2 (`_bgTasks`) re-key from `panelId` to `${projectId}:${panelId}`

---

## Persistence Confirmation

Both caches are **module-scoped `let` objects** (lines 421, 433). Neither is written to localStorage, sessionStorage, Firestore, IndexedDB, or any other persistent store. They exist only in the JS runtime of the current browser tab. A deploy/reload clears all entries. **No migration needed.**

---

## H1 — `_pendingPagesCache`

### Current behavior

Keyed by `panelId` alone. All single-panel projects share `panel-1`. If the user drops files on Project A's panel, navigates to Project B (also single-panel), PanelCard mounts and calls `pendingPagesGet("panel-1")` — which returns Project A's pending pages. If the user then confirms extraction, Project A's drawings extract into Project B's panel.

### Key change

All three accessor functions gain a `projectId` parameter. The cache key becomes `` `${projectId}:${panelId}` ``.

### API signature changes (lines 436–438)

```
// BEFORE
function pendingPagesSet(panelId, data)
function pendingPagesClear(panelId)
function pendingPagesGet(panelId)

// AFTER
function pendingPagesSet(projectId, panelId, data)
function pendingPagesClear(projectId, panelId)
function pendingPagesGet(projectId, panelId)
```

Internal key construction: `const key = projectId + ':' + panelId;` in each function.

### Write sites (4)

All are inside `PanelCard` (line 22338), which receives `projectId` as a prop.

| # | Line | Current code | Change |
|---|------|-------------|--------|
| W1 | 23264 | `pendingPagesSet(panel.id, {pages:livePages, newItems, awaiting:true})` | `pendingPagesSet(projectId, panel.id, {pages:livePages, newItems, awaiting:true})` |
| W2 | 23301 | `pendingPagesClear(panel.id)` | `pendingPagesClear(projectId, panel.id)` |
| W3 | 23341 | `pendingPagesClear(panel.id)` | `pendingPagesClear(projectId, panel.id)` |
| W4 | 23941 | `pendingPagesSet(panel.id, {pages:updatedPending, newItems:updatedNewItems, awaiting:awaitingConfirm})` | `pendingPagesSet(projectId, panel.id, {pages:updatedPending, newItems:updatedNewItems, awaiting:awaitingConfirm})` |
| W5 | 23945 | `pendingPagesClear(panel.id)` | `pendingPagesClear(projectId, panel.id)` |

### Read sites (1)

| # | Line | Current code | Change | `projectId` in scope? |
|---|------|-------------|--------|-----------------------|
| R1 | 22459 | `const cached = pendingPagesGet(panel.id)` | `const cached = pendingPagesGet(projectId, panel.id)` | **YES** — `projectId` is a prop of `PanelCard` (line 22338) |

### Listener/notify (no change needed)

Lines 434–435: `_pendingPagesListeners` and `_pendingPagesNotify` broadcast the entire `{..._pendingPagesCache}` object to subscribers. No key-based filtering happens in the notification path — the subscriber receives the whole cache and the consumer (R1) does a key lookup. Since R1 now uses the composite key, the listener pattern is unaffected.

### `projectId` availability confirmation

Every read and write site is inside `PanelCard` (line 22338: `function PanelCard({panel, idx, uid, projectId, ...})`). `projectId` is a required prop, destructured at the function signature. **No blocker.**

---

## H2 — `_bgTasks`

### Current behavior

Keyed by `taskId` = `panel.id` for extraction/pricing tasks, or `panel.id + "_bcsync"` for BC sync tasks. The cache stores `projectId` as a field in the value object (line 443: `_bgTasks[taskId] = {..., projectId, ...}`), but the key itself is `panel.id`.

The **render-side consumer** (PanelCard, line 22421–22422) already has a partial guard:

```js
const bgTask = bgTasks[panel.id];
const bgTaskIsForThisProject = bgTask && bgTask.projectId === projectId;
```

This prevents the extraction *overlay* from showing on the wrong project, but it doesn't prevent key collisions in the cache itself. If Project A starts extracting `panel-1`, and then Project B starts extracting `panel-1`, the second `bgStart` overwrites the first entry. Project A's progress bar disappears.

### Key change

The `taskId` parameter to `bgStart` / `bgSetPct` / `bgUpdate` / `bgDone` / `bgError` / `bgDismiss` / `bgHeartbeat` changes from `panel.id` to `${projectId}:${panel.id}`. Correspondingly, the `syncTaskId` construction (line 23809) changes from `panel.id+"_bcsync"` to `${projectId}:${panel.id}_bcsync`.

This is a **caller-side change**, not an API-signature change. The `bg*` functions accept any string as `taskId` — the composite key is constructed at each call site.

### Write sites — `bgStart` callers (3)

| # | Line | Current `taskId` | New `taskId` | `projectId` in scope? |
|---|------|-----------------|-------------|----------------------|
| W1 | 23098 | `panel.id` | `` `${projectId}:${panel.id}` `` | **YES** — PanelCard prop |
| W2 | 23810 | `syncTaskId` = `panel.id+"_bcsync"` (line 23809) | Change 23809 to: `const syncTaskId = projectId+':'+panel.id+'_bcsync'` | **YES** — PanelCard prop |
| W3 | 24028 | `panel.id` | `` `${projectId}:${panel.id}` `` | **YES** — PanelCard prop |

### Write sites — `bgSetPct` / `bgUpdate` / `bgDone` / `bgError` callers

All of these use `panel.id` as the taskId. Every occurrence is inside PanelCard or `runExtractionTask` (which receives `panel` from PanelCard). The callers are (by line number):

**Inside PanelCard (projectId available as prop):**

| Lines | Function | Current | Change to |
|-------|----------|---------|-----------|
| 23215, 23239, 23258, 23292, 23299, 23302, 23310, 23356, 23388, 23391, 23402, 23404, 23406, 23408, 23411 | `addFiles` / `confirmAndExtract` flow | `panel.id` | `` `${projectId}:${panel.id}` `` |
| 23873, 23877 | BC sync completion | `syncTaskId` | Already changed via W2 |
| 23948 | All pages removed | `panel.id` | `` `${projectId}:${panel.id}` `` |
| 24028, 24029, 24031, 24052, 24065, 24102, 24115, 24117, 24158, 24190, 24209, 24212, 24231, 24232, 24237, 24251, 24254 | Re-extraction flow | `panel.id` | `` `${projectId}:${panel.id}` `` |
| 26643 | Pricing progress dismiss | `panel.id` | `` `${projectId}:${panel.id}` `` |

**Inside `runExtractionTask` (module-scope, receives `panel` parameter):**

| Lines | Current | `projectId` in scope? | Change |
|-------|---------|-----------------------|--------|
| 13548, 13550, 13605, 13618, 13635, 13648, 13669, 13698, 13996, 14024, 14028, 14127, 14158, 14183, 14228, 14251, 14283, 14288 | `panel.id` | **YES** — `projectId` is the second parameter of `runExtractionTask` (line 13504: `async function runExtractionTask(uid, projectId, panel, cbs={})`) | `` `${projectId}:${panel.id}` `` |

**Inside `runPricingBackground` (module-scope, receives params):**

| Lines | Current | `projectId` in scope? | Change |
|-------|---------|-----------------------|--------|
| 14302, 14312, 14328, 14388, 14407, 14467 | `panelId` | **YES** — `panelId` and `uid, projectId` are parameters (line 14299) | `` `${projectId}:${panelId}` `` |

### Write sites — direct `_bgTasks` access (2)

| # | Line | Current code | `project.id` in scope? | Change |
|---|------|-------------|------------------------|--------|
| W-D1 | 32062 | `if(_bgTasks[id]){bgDone(id,...); delete _bgTasks[id]; _bgNotify();}` | **YES** — `deletePanel` is in PanelListView, which has `project` prop | Change `id` to `` `${project.id}:${id}` `` in all three references |
| W-D2 | 44977 | `Object.values(_bgTasks\|\|{}).filter(t=>t.status==='running')` | N/A — iterates values, does not use key | **No change needed** |

### Write sites — rbg* Firestore mirror (no key change needed)

Lines 502 (`rbgStart`), 524 (`rbgUpdate`), 548 (`rbgDone`), 562 (`rbgError`) write to `companies/{cid}/activeExtractions/{uid}_{taskId}`. The Firestore doc ID changes from `{uid}_panel-1` to `{uid}_{projectId}:panel-1`. This is purely cosmetic — these docs are ephemeral (auto-deleted on completion), use no index or query by doc ID. The `where('projectId','==',projectId)` query at line 34476 is unaffected (queries the field, not the doc ID). **No additional change needed in `rbg*` functions.**

### Read sites — `useBgTasks()` consumers (5)

The hook at line 197 returns the entire `_bgTasks` object. Consumers do key lookups or `Object.values()`:

| # | Line | Component | Current lookup | `projectId` in scope? | Change |
|---|------|-----------|---------------|----------------------|--------|
| R1 | 22421 | `PanelCard` | `bgTasks[panel.id]` | **YES** — prop | `bgTasks[projectId+':'+panel.id]`. Remove the post-hoc guard at 22422 (`bgTaskIsForThisProject`) — the composite key makes it redundant. |
| R2 | 31637 | `PanelListView` | `Object.values(bgTasks).filter(t=>t.projectId===project.id&&t.status==="running")` | **YES** — `project` prop | **No change needed** — uses `Object.values()` + field filter, not key lookup. |
| R3 | 40940 | `ProjectBoard` (dashboard) | Not visible in grep — `bgTasks` is consumed but no direct `[key]` access found. Likely passed to ProjectTile. | N/A | Check below (R4). |
| R4 | 42454 | `ProjectTile` | `Object.values(bgTasks).find(t=>t.projectId===p.id&&...)` | **YES** — `p` is the project prop | **No change needed** — uses `Object.values()` + field filter. |
| R5 | 44092 | `App` (toolbar) | `Object.values(bgTasks).filter(t=>t.status==="running")` | N/A | **No change needed** — uses `Object.values()`, no key. |

**Only R1 requires a change.** All other consumers iterate values and filter by `projectId` field — they never use the key directly.

### R1 post-hoc guard cleanup

Lines 22421–22425 currently read:

```js
const bgTask = bgTasks[panel.id];
const bgTaskIsForThisProject = bgTask && bgTask.projectId === projectId;
useEffect(()=>{if(bgTaskIsForThisProject&&bgTask?.status==="running")setExtracting(true);},[]);
```

After the re-key, this simplifies to:

```js
const bgTask = bgTasks[projectId+':'+panel.id];
useEffect(()=>{if(bgTask?.status==="running")setExtracting(true);},[]);
```

The `bgTaskIsForThisProject` variable and its check at line 22425 become dead code. Remove them. Grep for other uses of `bgTaskIsForThisProject` before removing:

<details><summary>Expected grep result (confirm during implementation)</summary>

```
22422: const bgTaskIsForThisProject=bgTask&&bgTask.projectId===projectId;
22425: useEffect(()=>{if(bgTaskIsForThisProject&&bgTask?.status==="running")setExtracting(true);},[]);
22429: (check if bgTaskIsForThisProject is used in the effect at ~22430)
```

If `bgTaskIsForThisProject` appears in any other line beyond these, leave it and add the composite key change alongside — don't break an unknown consumer. If it appears only in these 2–3 lines, remove the variable.
</details>

---

## Helper: Composite Key Builder

To avoid 50+ sites each building `` `${projectId}:${panel.id}` `` inline, introduce a one-line helper at line ~420 (next to the cache declarations):

```js
function _bgKey(projectId, panelId){ return projectId + ':' + panelId; }
```

Every call site replaces `panel.id` with `_bgKey(projectId, panel.id)`. This also prevents inconsistent key formats (e.g., someone using `:` vs `-` as separator).

The `_bcsync` suffix is appended **after** the helper: `_bgKey(projectId, panel.id) + '_bcsync'` (line 23809).

---

## Change Summary

| Cache | Write sites | Read sites | Lines touched | Blockers |
|-------|------------|------------|---------------|----------|
| `_pendingPagesCache` (H1) | 5 (W1–W5) | 1 (R1) | ~10 | None |
| `_bgTasks` (H2) | ~50 (3 bgStart + ~45 bgSetPct/bgUpdate/bgDone/bgError + 1 direct delete) | 1 key-based (R1) + 4 value-iterated (no change) | ~55 | None |
| Helper + API change | 3 accessor signatures + 1 helper | — | ~5 | None |
| **Total** | | | **~70 lines** | **None** |

---

## Commit Boundary

**Single commit.** The key change must be atomic — changing writes without changing reads (or vice versa) makes pending pages disappear. All changes ship together.

Suggested commit message: `Fix #92-P1: Re-key _pendingPagesCache and _bgTasks by projectId:panelId to prevent cross-project cache collisions`

---

## #87 Impact Assessment

**Does this re-key close the H1 contamination vector independent of #87?**

**Yes.** The H1 contamination requires two conditions: (1) colliding cache key, AND (2) colliding panel ID. After this fix, the cache key is `projectId:panelId`. Even if two projects both have `panel-1`, their cache keys differ (`projA:panel-1` vs `projB:panel-1`). The collision is broken at the cache layer regardless of whether panel IDs are unique.

**Does #87 stay queued?**

**Yes, but can downgrade from MEDIUM to LOW.** Panel ID uniqueness still matters for:
- Any future code that does panelId-based lookup without projectId context
- Firestore paths that include panelId (e.g., `saveProjectPanel(uid, projectId, panelId, ...)` — already scoped by projectId, so not a collision risk today)
- Defensive depth — unique IDs prevent an entire class of bugs rather than patching each instance

#87 is no longer a data-integrity risk — it's a defense-in-depth improvement. Downgrade priority; defer to a low-urgency session.

---

## Test Plan — Pre-Fix Contamination Repro + Post-Fix Validation

### Pre-fix repro (Marc runs BEFORE implementing)

This demonstrates the H1 contamination vector on the current codebase. Record the outcome as baseline evidence.

**Setup:**
1. Open ARC in browser. Have two projects that are both single-panel (both have `panel-1` as their only panel). If none exist, create two draft projects each with one "Control Panel" quote line.
2. Call these **Project A** and **Project B**.

**Steps:**
1. Open Project A.
2. Drop a PDF onto Project A's panel (e.g., any small drawing file). Wait for the "Awaiting confirmation…" banner to appear — do NOT click "Extract." The `pendingPagesCache["panel-1"]` is now populated with Project A's pages.
3. Click the back button to return to the dashboard. PanelCard unmounts; the cache persists.
4. Open Project B.
5. **Observe:** Project B's PanelCard mounts and reads `pendingPagesGet("panel-1")`. It finds Project A's pending pages and shows the "Awaiting confirmation…" banner with Project A's drawings.

**Expected result (pre-fix):** Project B shows Project A's pending pages. This is the contamination vector.

### Post-fix validation

**Same steps as above.** After the re-key:

**Expected result (post-fix):**
- Step 5: Project B's PanelCard calls `pendingPagesGet(projectBId, "panel-1")`. The cache key `projectBId:panel-1` has no entry. No pending pages shown. Project B is clean.
- Project A's pending pages remain in the cache under `projectAId:panel-1`. If the user navigates back to Project A, the pending pages reappear correctly.

### H2 validation (progress bar)

1. Open Project A. Drop files and confirm extraction — extraction begins, progress bar shows.
2. While extraction is running, press Back, open Project B.
3. **Pre-fix:** Project B's PanelCard shows Project A's progress bar (bgTask lookup by `panel-1` finds the running task). The `bgTaskIsForThisProject` guard prevents the extraction overlay, but the progress chip in the toolbar may show stale state.
4. **Post-fix:** Project B's PanelCard looks up `projectBId:panel-1` — no task found. No stale progress bar. Project A's task continues under `projectAId:panel-1` and completes normally.

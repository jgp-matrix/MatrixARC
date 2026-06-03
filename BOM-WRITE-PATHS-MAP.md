# BOM Write-Paths Map

**Author:** Sam Wize (Coach) · 2026-06-03  
**Purpose:** Enumeration of every code path that writes the panel BOM array, with snapshot-timing classification. For Marc's instrumentation — NO diagnosis, NO fix.

---

## Architecture Overview

Two save functions exist:

| Function | Line | Scope | `updatedBy`? | Read-before-write? |
|----------|------|-------|-------------|-------------------|
| `saveProject` | 8484 | Whole project object | **YES** (line 8700) | YES — reads current doc for guards (8525) |
| `saveProjectPanel` | 8779 | Single panel replacement into full project | **NO** — `updatedBy` is NOT set | YES — reads current doc (8790), replaces target panel (8875), writes entire project (8919) |

Both write the ENTIRE project doc to Firestore via `ref.set(stripped)`. There are no field-level Firestore updates for panel/BOM data. Every save overwrites the full document.

The `onUpdate` prop (line 33156) updates React state:
```js
onUpdate={updatedPanel => {
  onUpdate(prev => ({...prev, panels: (prev.panels||[]).map(p => p.id===panel.id ? updatedPanel : p)}));
}}
```
This merges the updated panel into the project's `panels` array in React. It's a functional update (`prev => ...`), so it reads the latest React state.

The `onSaveImmediate` prop (line 33159) calls `saveImmediatePanel` → `saveProjectPanel`. This reads FIRESTORE (not React) for the project doc, replaces the target panel, and writes the whole project back.

---

## All BOM Writers — Classified

### Category 1: User-Initiated Synchronous Edits

These update React state immediately via `onUpdate`, then save via debounced or immediate `onSaveImmediate`.

| # | Writer | Line | Trigger | Snapshot Timing | Array Scope | Debounced? |
|---|--------|------|---------|----------------|-------------|-----------|
| **W1** | `updateBomRow` | 24742 | User edits any BOM field (qty, PN, desc, etc.) | Reads `panel.bom` from **closure** (prop at render time). Builds `updated = {...panel, bom: panel.bom.map(...)}`. | WHOLE array | **YES — 1500ms** (line 24782). Saves `latestPanelRef.current` at flush time, NOT the closure snapshot |
| **W2** | `updatePrice` | 25173 | User edits price field | Reads `panel.bom` from **closure**. Builds `updatedBom = panel.bom.map(...)`. | WHOLE array | For null/contingency: **immediate** `onSaveImmediate`. For cleared price: **500ms debounce** (line 25193) saving `latestPanelRef.current` |
| **W3** | `applyBudgetaryPrice` | 25230 | User clicks "Budgetary" in price confirm popup | Reads `panel.bom` from **closure**. | WHOLE array | Immediate `onSaveImmediate` |
| **W4** | `applyConfirmedPrice` | 25245 | User clicks "Confirmed" in price confirm popup | Reads `panel.bom` from **closure**. | WHOLE array | Immediate `onSaveImmediate` |
| **W5** | `deleteBomRow` | 24897 | User deletes a BOM line | Reads `panel.bom` from **closure**. Builds `updated = {...panel, bom: panel.bom.filter(r => r.id !== id)}`. | WHOLE array (item removed) | **Immediate** `onSaveImmediate` |
| **W6** | `addBomRow` (inline add) | 24864 | User clicks "+ Add Row" | Reads `panel` from **closure**. Appends new row. | WHOLE array | Immediate `onSaveImmediate` |
| **W7** | `confirmSuggestion` | 24930 | User accepts a suggested PN | Reads `panel.bom` from **closure**. | WHOLE array | via `saveBomRow` |
| **W8** | BOM notes edit | 27724 | User edits notes textarea | Builds `{...panel, bomNotes: e.target.value}`. | Targeted (bomNotes only) | **1000ms debounce** saving `latestPanelRef.current` |

### Category 2: Async Completion Writers (Background)

These fire when an async operation completes. The data they write was captured at dispatch time or built from intermediate results — potentially stale relative to user edits.

| # | Writer | Line | Trigger | Snapshot Timing | Array Scope | Key Detail |
|---|--------|------|---------|----------------|-------------|-----------|
| **W9** | `runPricingOnPanel` completion | 25981–25985 | Pricing finishes (manual or post-extraction) | Builds `updated` from `panelOverride` (function argument, captured at CALL time) or `panelRef.current`. The `updatedBom` is built from `bomOverride` (also call-time arg). **BOM rows are spread from the call-time snapshot.** | **WHOLE array** — every row gets price/vendor/bcVerify fields spread onto the call-time copy | Immediate `onSaveImmediate` |
| **W10** | `runPricingBackground` save | 14458 | Background pricing (user navigated away) | Receives `panelData` as parameter (captured at extraction completion). Builds `updatedBom` from that snapshot. | **WHOLE array** | Direct `saveProjectPanel` — reads Firestore, replaces panel |
| **W11** | `commitBcItem` async vendor lookup | 25028 | User selects item from BC browser, async vendor fetch resolves | Uses `latestPanelRef.current` at resolution time. Maps over `lp.bom`. | **WHOLE array** | Calls `saveProjectPanel` directly (line 25028, 25063) |
| **W12** | `commitBcItem` async MFR/lead-time lookup | 25045–25063 | Same selection, second async fetch resolves | Uses `latestPanelRef.current` at resolution time. Maps over `lp.bom`. | **WHOLE array** | Calls `saveProjectPanel` directly |
| **W13** | BC sync completion (`syncPlanningLinesToBC`) | 23865 | Manual "Sync to BC" → completion updates `bomSyncHash` etc. | Reads `panel` from **closure** (PanelCard prop). Builds `updated = {...panel, bomSyncHash, bomSyncPending:false, ...}`. | Targeted (sync metadata only, NOT BOM array) | Immediate `onSaveImmediate` |
| **W14** | Extraction `onDone` | 23395 | Extraction completes while user is still on project | Calls `onUpdate(finalPanel)`. `finalPanel` was built by `runExtractionTask` from its own pipeline. | **WHOLE panel** including BOM array | Via `onUpdate` only (React state). Pricing chain (W9) follows |
| **W15** | Re-extraction completion | 24192–24199 | Re-extraction completes | Builds `updated` from `latestPanelRef.current` with new `bom`. | **WHOLE panel** | `onSaveImmediate` (foreground) or `saveProjectPanel` (background) |
| **W16** | Feedback re-extraction completion | 24405–24415 | Feedback re-extract completes | Builds `updated` from `latestPanel` (local var accumulated during extraction). | **WHOLE panel** | `onSaveImmediate` (foreground) or `saveProjectPanel` (background) |
| **W17** | `doApplyPortalPrices` | 36128–36134 | User applies supplier portal submission | Builds `updatedPanels` from `projectRef.current.panels.map(...)`. Stale-state guard at 35921–35933 checks `projectUpdatedAtAtReviewStart` vs `currentUpdatedAt`. | **WHOLE project + all panels** | `update(updatedProject)` + `safeSave` |
| **W18** | Post-extraction validation | 24213–24220 | Validation completes after extraction | Builds `updated` from `latestPanelRef.current` with validation/laborData. | Targeted (validation + laborData + status, NOT BOM array) | `onSaveImmediate` or `saveProjectPanel` |

### Category 3: Automated/Periodic Writers

| # | Writer | Line | Trigger | Snapshot Timing | Array Scope |
|---|--------|------|---------|----------------|-------------|
| **W19** | Labor auto-sync on mount | 22477 | PanelCard mount / BOM change | Reads `panel` from prop. Recalculates labor rows. | WHOLE array (labor rows updated) |
| **W20** | Auto re-verify (SqModal apply etc.) | 22496 | BC fuzzy suggestions or SqModal triggers re-verify | Uses `latestPanelRef.current`. Maps BOM. | WHOLE array |
| **W21** | `_autoSyncBcDrawings` | 34507 | 5-minute `setInterval` | Reads `projectRef.current`. | Targeted (page metadata only) |

### Category 4: onSnapshot Echo

| # | Writer | Line | Trigger | Snapshot Timing | Array Scope | Guard |
|---|--------|------|---------|----------------|-------------|-------|
| **W22** | Project doc onSnapshot (initial) | 34824–34832 | ProjectView mount | Reads from Firestore cache. Calls `setProject(migrated)`. | **WHOLE project** including all panels and BOM arrays | Always fires on mount. Replaces entire React state. |
| **W23** | Project doc onSnapshot (subsequent) | 34836–34840 | Another user/tab writes the project doc | Reads Firestore remote data. Calls `setProject(migrated)`. | **WHOLE project** | **Guard: `remote.updatedBy !== uid`** — only fires when a DIFFERENT user made the write. Own writes do NOT trigger this path. |
| **W24** | `notifyProjectListeners` → `_appProjectUpdateFn` | 8922 / 44800 | `saveProjectPanel` calls `notifyProjectListeners` (line 8922) when `skipNotify=false` | Receives `liveProject` — the just-saved Firestore data | **WHOLE project** | Calls `setOpenProject(prev => prev?.id === liveProject.id ? liveProject : prev)` — replaces App-level project state |

---

## Flow A: PRICE EDIT — End-to-End Write Chain

**User changes a price on a regular BOM row (non-contingency):**

```
1. User types price → updatePrice() [W2, line 25173]
   - If clearing price (null): builds updatedBom from panel.bom closure
     → onUpdate(updated) [React]
     → latestPanelRef.current = updated
     → 500ms debounce → onSaveImmediate(latestPanelRef.current) [W2]
       → saveProjectPanel: reads Firestore, replaces panel, writes full doc

   - If setting price: opens confirmation popup
     → NO save yet — price is held in priceConfirmPending state

2. User clicks "Confirmed" → applyConfirmedPrice() [W4, line 25245]
   - Reads panel.bom from CLOSURE (at render time of the popup, NOT at click time)
   - Builds updatedBom = panel.bom.map(r => r.id===id ? {...r, unitPrice:price, ...} : r)
   - updated = {...panel, bom: updatedBom}
   - onUpdate(updated) [React state]
   - onSaveImmediate(updated) [immediate, no debounce]
     → saveProjectPanel: reads Firestore, replaces panel, writes full doc

3. CONCURRENT WRITERS THAT COULD FIRE IN THIS WINDOW:

   a. If pricing is running (W9, line 25981):
      runPricingOnPanel was called BEFORE the user's edit. It holds
      bomOverride from call time. When it completes:
      - Builds updatedBom from the PRE-EDIT bom snapshot
      - onUpdate(updated) → REPLACES React state with pre-edit BOM + pricing results
      - onSaveImmediate(updated) → REPLACES Firestore panel with pre-edit BOM
      *** THE USER'S PRICE EDIT IS OVERWRITTEN ***

   b. If auto re-verify fires (W20, line 22496):
      Uses latestPanelRef.current → should have the user's edit IF latestPanelRef
      was updated. But latestPanelRef is only set by specific flows (W1 updateBomRow
      at 24774, W2 updatePrice at 25190). If the re-verify fires between onUpdate
      and latestPanelRef assignment, it reads stale data.

   c. commitBcItem async (W11/W12, lines 25028/25063):
      Uses latestPanelRef.current. If the async fetch started BEFORE the user's edit
      but resolves AFTER, latestPanelRef.current has the edit → safe.
      But if latestPanelRef update races with the async resolution → uncertain.

   d. onSnapshot echo (W23, line 34836):
      Guard: only fires if updatedBy !== uid. Since saveProjectPanel does NOT
      set updatedBy, the field retains the LAST saveProject caller's uid. If that
      was the same user, the guard blocks. If it was a different user (or the
      field is missing), the onSnapshot CAN fire and overwrite React state with
      Firestore's version — which is the state BEFORE the user's edit if the
      edit hasn't been persisted yet.
      
   e. notifyProjectListeners (W24, line 8922):
      Fires at the end of saveProjectPanel UNLESS skipNotify=true. Calls
      _appProjectUpdateFn → setOpenProject with the just-saved liveProject.
      This project was built from Firestore's pre-save state + the target panel.
      NON-target panels come from Firestore (8875: `panels = proj.panels.map(...)`).
      This is safe for the target panel but could carry stale data for OTHER panels
      if multiple panels are being edited concurrently.
```

**Highest-risk writer for price revert: W9 (`runPricingOnPanel`).** It captures the full BOM at call time, runs for potentially minutes (BC + AI pricing), and writes the entire array back at completion — overwriting any user edits made during the run.

---

## Flow B: DELETE LINE ITEM — End-to-End Write Chain

**User deletes a BOM row:**

```
1. User clicks delete → deleteBomRow() [W5, line 24897]
   - Reads panel.bom from CLOSURE
   - Builds updated = {...panel, bom: panel.bom.filter(r => r.id !== id)}
   - onUpdate(updated) [React state — item gone from UI immediately]
   - onSaveImmediate(updated) [immediate, no debounce]
     → saveProjectPanel: reads Firestore, replaces panel, writes full doc
     → The deleted item is NOT in the updatedPanel passed to saveProjectPanel
     → saveProjectPanel reads Firestore for OTHER panels (8875), but the TARGET
       panel is the updatedPanel WITHOUT the deleted row
     → Item is removed from Firestore

2. CONCURRENT WRITERS THAT COULD RESURRECT THE DELETED ITEM:

   a. Debounced save from a PRIOR edit (W1, line 24782):
      If the user edited a field 1500ms ago, the debounced save is still pending.
      The timer captures latestPanelRef.current at FLUSH time (not at edit time).
      IF latestPanelRef.current was updated by the delete (via onUpdate → panel
      prop update → latestPanelRef.current = panel at line 23003), the debounced
      save sees the post-delete state → safe.
      
      BUT: latestPanelRef.current is updated at line 23003 only when the panel
      PROP changes. The prop changes asynchronously (React re-render). If the
      debounce timer fires in the same microtask as the delete but BEFORE React
      re-renders, latestPanelRef.current still has the pre-delete panel.
      *** POTENTIAL RESURRECTION ***

   b. runPricingOnPanel completion (W9):
      Same risk as price edit. If pricing was running when user deleted the row,
      the pricing result carries the FULL pre-delete BOM. On completion:
      - onUpdate(updated) → overwrites React state with pre-delete BOM
      - onSaveImmediate(updated) → writes pre-delete BOM to Firestore
      *** ITEM COMES BACK ***

   c. commitBcItem async (W11/W12):
      Uses latestPanelRef.current. Maps over lp.bom. If latestPanelRef.current
      has the post-delete BOM (item filtered out), the map skips it → safe.
      If latestPanelRef.current is stale (pre-delete), the map includes the
      deleted item and saves it back.
      *** POTENTIAL RESURRECTION ***

   d. onSnapshot echo (W23):
      Same analysis as price edit. If the onSnapshot fires with pre-delete data
      from Firestore (because the delete save hasn't been persisted yet), React
      state gets the full BOM including the deleted item.
      *** POTENTIAL RESURRECTION — timing-dependent ***
      
      BUT: the guard (updatedBy !== uid) should block this for the SAME user.
      HOWEVER: saveProjectPanel does NOT update updatedBy. If the last
      saveProject was from a different user (or no saveProject has run this
      session), the guard doesn't block.

   e. _pendingPreReviewOverrides or other project-level save (W17 etc.):
      Any save through safeSave/saveProject that captures the project BEFORE the
      delete but writes AFTER. persistProject (line 31659/31032) calls
      onUpdate then safeSave. If onUpdate captures the pre-delete project and
      safeSave runs after the delete's saveProjectPanel, safeSave writes the
      pre-delete panels array back (it uses its own copy, not Firestore-read).
      *** POTENTIAL RESURRECTION — if persistProject and deleteBomRow race ***
      
      saveProject DOES have a BOM item count high-water guard (line 8507) that
      preserves BOM if incoming has 0 but high-water has > 0. This does NOT
      protect against single-row deletions — only full-array wipes.
```

**Highest-risk writers for item resurrection:**
1. **W9 (`runPricingOnPanel`)** — most likely: long-running, captures full BOM at call time.
2. **W1 debounce timer** — possible if React re-render hasn't propagated `latestPanelRef.current` before timer fires.
3. **W11/W12 (`commitBcItem` async)** — possible if async fetch was in-flight when delete happened.

---

## Cross-Reference: #64 Ungated Fetch Sites

`bcSyncPanelPlanningLines` (line 3510) is called from ~12 sites. W13 (line 23865) writes panel metadata (sync status) back to Firestore via `onSaveImmediate`, reading `panel` from closure. If `panel` is stale (pre-edit state), the save overwrites the BOM. However, W13 writes `{...panel, bomSyncHash, bomSyncPending:false, ...}` — it spreads the WHOLE panel including `bom`. If `panel` is from a stale closure, the stale BOM is written.

The other `bcSyncPanelPlanningLines` call sites (BC sync inside quote-send, print, relink) read from `project.panels[i]` — also from closure, but in those flows no concurrent BOM editing is expected.

---

## Cross-Reference: onSnapshot Guard Coverage (Audit G2)

The onSnapshot handler at line 34836 has one guard: `remote.updatedBy && remote.updatedBy !== uid`.

**What it covers:** Blocks self-echo when the same user wrote via `saveProject` (which sets `updatedBy`). This prevents the user's own save from coming back as an "external update" and overwriting their current state.

**What it does NOT cover:**
1. **Writes via `saveProjectPanel`** — this function does NOT set `updatedBy`. After a `saveProjectPanel` write, `updatedBy` retains whatever value it had before. If `updatedBy` is the same uid (from a prior `saveProject` call), the guard blocks — correct. If `updatedBy` is a different uid or absent, the guard does not block, and the onSnapshot WILL fire with whatever `saveProjectPanel` wrote.
2. **The `updatedBy` field is set from the `data` spread** (line 8700), which comes from the `project` argument to `saveProject`. If `saveProject` is called with a project that doesn't have `updatedBy` set, the field could be missing on Firestore.

**Net:** For single-user editing, the guard is effective for `saveProject` writes but has a gap for `saveProjectPanel` writes. If `saveProjectPanel` writes a stale panel to Firestore, and the `updatedBy` on the doc happens to differ from the current user, the onSnapshot handler will fire and overwrite React state with the stale data — reverting the user's in-memory edit.

---

## Cross-Reference: "Quotes Drop Fields" Symptom

Any writer that saves a WHOLE project doc (Categories 1–4 above) can drop quote-level fields if the `project` object it captured is missing those fields. Specifically:

- `persistProject` (line 31659) calls `safeSave` → `saveProject` with whatever `project` state was in the PanelListView closure. If the closure's `project` is stale (e.g., from before the user set the Budgetary header), the save writes the stale project back, losing the header.
- `saveProjectPanel` (line 8779) reads the CURRENT Firestore doc (8790), so it should preserve fields it doesn't touch. But it replaces the target panel (8875) AND updates `updatedAt` and `lastQuoteHash` — if the incoming `updatedPanel` was built from stale state that's missing a field that was recently added, the field survives on Firestore (since `saveProjectPanel` reads current Firestore data for the project envelope). The field would be missing from React state but present on Firestore.
- The `saveProject` path does NOT read current Firestore for field preservation (it uses the incoming `project` argument). Any field missing from the argument is dropped from Firestore. This is the higher-risk path for field loss.

---

## Ranked Stale-Snapshot-Capable Writers (Instrumentation Priority)

| Rank | Writer | Line | Risk | Why |
|------|--------|------|------|-----|
| **1** | `runPricingOnPanel` (W9) | 25458 | **HIGH** | Long-running (~5-60s). Captures full BOM at call time. Writes entire array at completion. Any user edit during the run is overwritten. Both price-revert and delete-resurrection. |
| **2** | `updateBomRow` debounce (W1) | 24782 | **MEDIUM** | 1500ms timer. Uses `latestPanelRef.current` which SHOULD have latest state, but depends on React re-render propagating before timer fires. |
| **3** | `updatePrice` debounce (W2) | 25193 | **MEDIUM** | 500ms timer. Same `latestPanelRef.current` pattern as W1. |
| **4** | `commitBcItem` async (W11/W12) | 25028/25063 | **MEDIUM** | Async BC fetch resolves ~1-5s after dispatch. Uses `latestPanelRef.current` — stale if ref hasn't caught up. |
| **5** | onSnapshot echo (W23) | 34836 | **MEDIUM** | Guard covers `saveProject` writes but NOT `saveProjectPanel` writes. If `updatedBy` is stale, echo fires with pre-edit data. |
| **6** | `notifyProjectListeners` (W24) | 8922 | **LOW-MEDIUM** | Fires after every `saveProjectPanel` (unless skipNotify). Updates App-level `openProject`. Could propagate a stale non-target panel. |
| **7** | BC sync completion (W13) | 23865 | **LOW** | Writes whole panel spread including BOM, but only runs when user explicitly clicks "Sync to BC". Unlikely to race with edits. |
| **8** | `doApplyPortalPrices` (W17) | 36132 | **LOW** | Has explicit stale-state guard. But writes all panels, not just the one with portal prices. |

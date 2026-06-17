# #153 Full Flow Read — End-to-End Revision Path Audit

**Coach (C101) — 2026-06-17**
**Type:** Comprehensive code-path read vs. C96/C97 plan
**Status:** COMPLETE
**Builds on:** C100 (gate trace, `docs/153-REVISION-GATE-TRACE.md`)

---

## Executive Summary

The #153 revision-drop flow has been read end-to-end against the C96/C97 plan.
The code **structurally matches the plan** at every phase (A-F). Both bugs stem from
the same architectural decision: placing the gate at CONFIRM (after addFiles appends
pages) rather than at DROP (before processing). The consolidated fix is to move the
gate upstream.

**BUG 1 (gate intermittency):** Root cause unpinnable via static analysis alone.
All examined code paths preserve BOM. The intermittency is timing-dependent — the
`projectRemoteTasks` listener churn creates re-render windows where a teammate's
save could overwrite local state. Diagnostic steps identified.

**BUG 2 (Replace branch → no modal):** Code is correctly wired per C97. The most
likely failure point is the silent `try{...}catch(e){}` wrapping onDone at line
14876, which swallows any error from the staging completion callback. Secondary
candidate: `_currentProjectId !== _reconProjectId` guard discarding the result.

**Recommendation:** Branch at DROP (Option A). Eliminates both bugs' root causes.

---

## 1. Complete Flow Map

```
FILE DROP on BOM'd panel (25 existing + 54-row BOM)
  │
  ▼
handleDrawingDrop(e)                               ← line 24236
  │  Collects files from e.dataTransfer
  │  Early return if awaitingConfirm is already true
  │
  ├─► addFiles(files)                              ← line 24248 → fn at 23955
  │     │
  │     │  ① livePages = [...(panel.pages||[])]     ← 24023 (captures 25 existing)
  │     │  ② Per PDF page: newItems.push(item),
  │     │     livePages=[...livePages,item]          ← 24088 (25→50 pages)
  │     │     setPendingPages([...livePages])         ← 24089 (re-render per page)
  │     │  ③ AI page-type detection (parallelMap)    ← 24120-24171
  │     │     Mutates newItems[i].types in-place
  │     │  ④ pendingNewItemsRef.current = newItems   ← 24174 (25 new items)
  │     │  ⑤ setAwaitingConfirm(true)                ← 24183
  │     │  ⑥ pendingPagesSet(cache)                  ← 24188
  │     │  ⑦ RETURNS — no onUpdate, no save, no extraction
  │     │
  │     └── (end of addFiles)
  │
  │  ═══════════════════════════════════════════════
  │  ║ ASYNC WINDOW: addFiles complete → user clicks Confirm           ║
  │  ║ Panel prop receives re-renders from parent.                     ║
  │  ║ latestPanelRef.current = panel on every render (line 23920).    ║
  │  ║ BUG 1 lives here: something can strip BOM from panel prop.     ║
  │  ═══════════════════════════════════════════════
  │
  ▼
User clicks "Proceed with Extraction"              ← line 27924
  │  onClick={confirmAndExtract}
  │
  ▼
confirmAndExtract()                                 ← line 24414
  │
  │  ① setAwaitingConfirm(false)                    ← 24415
  │  ② Input-tier quality gate                      ← 24417-24470
  │  ③ Page-type learning save                      ← 24473-24488
  │  ④ livePages = pendingPages (50)                ← 24490
  │     newItems = pendingNewItemsRef.current (25)   ← 24491
  │
  │  ⑤ ┌─── REVISION GATE ────────────────────────── 24506-24554
  │     │
  │     │  Signal A: _refBomRows (latestPanelRef.current.bom)   ← 24507
  │     │  Signal B: _propBomRows (panel.bom prop)              ← 24508
  │     │  Signal C: _priorDv (bomVersion > 0)                  ← 24509
  │     │  Signal D: _persistedHasBom (Firestore read, 4s)      ← 24517-24528
  │     │
  │     │  _hasExistingBom = A || B || C || D                   ← 24531
  │     │  _droppedNewPages = newItems.length > 0               ← 24532
  │     │  Debug log dumps all signal values                    ← 24533
  │     │
  │     │  if (_hasExistingBom && _droppedNewPages):
  │     │    showRevisionPrompt() → 3-way dialog                ← 24535
  │     │
  │     │    ┌─── "Cancel" ──────────────────────────
  │     │    │  setPendingPages([])                   ← 24538
  │     │    │  Clean no-op, zero writes, return.
  │     │    │
  │     │    ├─── "Add pages" ───────────────────────
  │     │    │  _updAdd = {...panel, pages: livePages} ← 24544
  │     │    │  onUpdate → onSaveImmediate             ← 24545-24546
  │     │    │  BOM unchanged, no extraction, return.
  │     │    │
  │     │    └─── "Revise" ──────────────────────────
  │     │         handleRevisionDrop(livePages, newItems, notes) ← 24552
  │     │         return.                                         ← 24553
  │     │
  │     └──────────────────────────────────────────────
  │
  │  ⑥ Gate did NOT fire → normal extraction path    ← 24555-24602
  │     onUpdate(updated), onSaveImmediate, runExtractionTask
  │
  └── (end of confirmAndExtract)
```

### "Revise" Path Detail (handleRevisionDrop → ReconciliationModal)

```
handleRevisionDrop(livePages, newItems, notes)      ← line 24298
  │
  │  capturedProjectId = projectId                   ← 24299
  │  ecoPages = latestPanelRef.current.pages         ← 24301
  │             .filter(p => p.ecoId)
  │
  │  transientPanel = {                              ← 24302-24306
  │    ...latestPanelRef.current,
  │    pages: [...newItems, ...ecoPages],   ◄── 25 new + ECO (NOT 50)
  │    extractionNotes: notes
  │  }
  │
  │  setPendingPages([])                             ← 24307
  │  setAwaitingConfirm(false)
  │  setExtracting(true)                             ← 24308
  │
  │  runExtractionTask(uid, capturedProjectId,       ← 24310
  │    transientPanel, {
  │      stagingMode: true,     ◄── suppresses Firestore writes
  │      onDone: (finalPanel, extractedBom) => {
  │        if (_currentProjectId !== _reconProjectId)
  │          → discard + return                      ← 24314-24316
  │        setReconStagedExtraction({...})           ← 24319
  │        setShowReconciliation(true)               ← 24320
  │      }
  │    })
  │
  ▼
runExtractionTask (staging mode)                     ← line 14067
  │
  │  save = p => { latestPanel = p; }                ← 14095-14096
  │  ▲ All Firestore writes suppressed
  │
  │  Normal extraction pipeline runs on transientPanel:
  │  BOM extraction, validation, verification, stamp, upload
  │  All use in-memory save only
  │
  │  finally block:                                  ← 14873-14877
  │    try {
  │      if (onDone) {
  │        if (cbs.stagingMode)
  │          onDone(latestPanel, latestPanel.bom || []);
  │        else
  │          onDone(latestPanel);
  │      }
  │    } catch(e) {}         ◄── SILENT CATCH — swallows onDone errors
  │
  ▼
ReconciliationModal renders                          ← line 29892
  │  Condition: showReconciliation && reconStagedExtraction
  │  Props: currentBom (latestPanelRef), stagedExtraction, panel
  │
  │  Mount effect: reconcileBom(frozenBom, staged.items) ← 23097
  │  Three-pass match: exact PN → position+desc → residuals
  │  Categories: CHANGED, NEW, DELETED, UNCHANGED
  │  Gated commit: disabled until all non-UNCHANGED resolved
  │
  ▼
handleReconciliationCommit(mergedBom, matchResult, resolutions) ← 24343
  │
  │  ① archiveDvVersion (Firestore write)            ← 24348
  │  ② Build committed panel:                        ← 24351-24358
  │     {...latestPanelRef.current,
  │      pages: transientPanel.pages,
  │      bom: mergedBom,
  │      laborData: null, validation: null, ...}
  │  ③ onUpdate + onSaveImmediate
  │     (single Firestore write, Dv auto-bumps)
  │  ④ Post-commit: applyLearnedCorrections
  │     on NEW + PN-changed rows
  │  ⑤ Auto-price trigger
  │  ⑥ qvHistory log
  │
  └── Done. Panel has new pages + merged BOM.
```

---

## 2. BUG 1 — Gate Intermittency

### Observed Behavior

Gate fires ONLY when the in-memory BOM survives the addFiles→confirm window.
Three earlier runs: gate false → no prompt → full append-extract.
Latest run: gate FIRED — `{hasExistingBom:true, droppedNewPages:true,
refBomRows:54, propBomRows:54, priorDv:true}`.

### What C100 Established

- Gate IS on the executed path (no bypass exists)
- Condition is correct: `_hasExistingBom && _droppedNewPages`
- Problem is the INPUTS: all 4 BOM signals fail simultaneously
- Signals A-C track `panel` prop; if prop loses BOM, all three go to zero
- Signal D (Firestore read) is the backstop; it can fail on path mismatch

### Root Cause Analysis (Static)

**Every examined code path preserves BOM.** Specifically:

| Caller during window | BOM preserved? | Why |
|---|---|---|
| `tagPage` onUpdate (line 25134) | YES | `{...panel, pages:...}` — spreads from panel prop |
| Background BC vendor lookup (26280) | YES | Uses `latestPanelRef.current`, spreads |
| BC re-verify effect (23392) | YES | Reads `.bom`, doesn't replace panel |
| Previous extraction onDone (24618) | YES | Uses `finalPanel` from extraction |
| onSnapshot re-subscribe (36470) | GUARDED | `didInitialFirestoreSyncRef` prevents first-snapshot clobber; `updatedBy!==uid` check prevents own-save overwrite |

**The projectRemoteTasks listener** (lines 36120-36138) is the strongest candidate
for creating the conditions. It subscribes to `companies/${cid}/activeExtractions`
filtered by projectId. Every heartbeat/status change fires
`setProjectRemoteTasks(fresh)`. Because `projectRemoteTasks` is in the onSnapshot
effect's deps (line 36500), each change causes:

1. Effect cleanup → old `unsub()` fires
2. New `onSnapshot` subscriber
3. Firestore fires initial snapshot from cache
4. `didInitialFirestoreSyncRef.current` is `true` → `firstSnapshot = false`
5. Goes to `if(remote.updatedBy && remote.updatedBy !== uid)` check
6. **If last Firestore write was by the current user** → IGNORED (safe)
7. **If last Firestore write was by a teammate or Cloud Function** → `setProject(migrated)` fires

Path 7 replaces the entire project state with Firestore's truth. The Firestore
data SHOULD include the BOM (it was saved during the original extraction). So even
path 7 should preserve BOM.

### Why Static Analysis Cannot Pin It

The intermittency means a timing-dependent race exists that all examined code paths
don't exhibit in isolation. Possible explanations:

1. **An unexamined caller** — a callback, effect cleanup, or async completion not
   traced in this read — calls `onUpdate(panelWithoutBom)` during the window.
2. **Firestore document mutation** — a Cloud Function or background write modifies
   the project doc without `updatedBy`, and the onSnapshot handler applies it with
   missing BOM data. (Unlikely — no project-modifying Cloud Functions found.)
3. **React batching edge case** — multiple rapid `setProject` calls from different
   sources interleave in a way that drops the BOM from one intermediate state.

### Signal D Firestore Backstop Assessment

The Firestore read at line 24520 uses:
```javascript
fbDb.collection(_appCtx.projectsPath || `users/${uid}/projects`).doc(projectId)
```

For a **team/company-path project**, `_appCtx.projectsPath` must equal
`companies/${cid}/projects`. It's set at line 46219 (company mode) or 46284
(personal mode). If `_appCtx.projectsPath` is null at read time (race during app
init), the fallback `users/${uid}/projects` queries the wrong collection — the
document doesn't exist there — and `_persistedHasBom` stays false.

**Verdict:** For a fully-initialized team project, Signal D should work. But if
`_appCtx` initialization races with the confirm click (unlikely but possible on
slow connections), the backstop fails.

### Required Diagnostics (Runtime)

These cannot be resolved by further static analysis:

1. **Console.trace in parent onUpdate** — add inside the PanelCard render at
   line 34722: `if(!updatedPanel.bom || !updatedPanel.bom.length) console.trace("[BOM-STRIP]", updatedPanel);`
   This catches the EXACT caller that sends a BOM-less panel to the parent.

2. **Log `_appCtx.projectsPath`** at line 24520 — verify it's
   `companies/${cid}/projects` for team projects.

3. **Watch `[CONCURRENT]` console logs** during the addFiles→confirm window — if
   "Soft-applied remote update" appears, the onSnapshot applied a teammate's save.

---

## 3. BUG 2 — Replace Branch → No Modal

### Observed Behavior

Gate fired, Jon clicked "Revise drawings (replace & reconcile)" → went straight to
what looked like a full 50-page extraction, no ReconciliationModal appeared.

### Code Trace

The "Revise" button (line 29878) calls `revisionPrompt.onChoice("revise")`.
This resolves the Promise from `showRevisionPrompt()` with `"revise"`.

In `confirmAndExtract`, the flow is:
```
if(_choice === "cancel") → return     ← 24536
if(_choice === "add")    → return     ← 24542
// falls through to:
handleRevisionDrop(livePages, newItems, notes)  ← 24552
return;                                          ← 24553
```

The `return` at 24553 **definitively prevents** the normal extraction path at 24555.
`handleRevisionDrop` IS called.

### Why the UI Shows "50-Page Extraction"

This is a **display discrepancy**, not a functional one:

1. `handleRevisionDrop` calls `setPendingPages([])` at line 24307
2. With empty pendingPages, the page display falls back to `savedPages` (line 23929)
3. `savedPages = (panel.pages || []).filter(p => !p.ecoId)`
4. `panel` (prop) was updated by `tagPage`'s `onUpdate` during confirm → has 50 pages
5. UI shows 50 pages while extraction runs on the 25-page transient panel

The extraction itself uses `transientPanel.pages` = `[...newItems, ...ecoPages]` =
25 new pages (+ any ECO pages). The 50-page display is cosmetic.

### Why the Modal Doesn't Appear — Candidate Causes

**Candidate 1 (HIGHEST PROBABILITY): Silent error in onDone**

The `finally` block at line 14876:
```javascript
try { if(onDone) {
  if(cbs.stagingMode) onDone(latestPanel, latestPanel.bom || []);
  else onDone(latestPanel);
}} catch(e) {}
```

The `catch(e){}` swallows ANY error from the onDone callback. If the callback
throws for any reason — undefined variable, type error, stale closure — the modal
never renders and no console output appears.

**Candidate 2: Project-change guard**

Line 24314: `if(_currentProjectId !== _reconProjectId)`

`_currentProjectId` is module-scoped, set by a useEffect at line 36114. If ANY
effect resets it during the extraction window (unlikely but possible if the
onSnapshot re-subscribe triggers a project reload), the guard fires and discards
the staging result silently.

**Candidate 3: Extraction produces empty BOM**

If the transient panel's 25 pages have no BOM-typed pages (AI detection didn't
tag them, or user changed types during confirm and the ref has stale types),
`runExtractionTask` finds zero BOM pages → skips BOM extraction → onDone receives
a panel with no extracted BOM. The modal WOULD still appear (with all rows as
"Deleted"), but this may look like "nothing happened."

**NOTE on pendingNewItemsRef types:** `tagPage` (line 25124) updates `pendingPages`
(line 25133) but NOT `pendingNewItemsRef.current` (line 23321). If the user changed
page types during confirm, the transient panel uses the ORIGINAL AI-detected types
from the ref, not the user's confirmed types. This is a minor divergence from C97
intent but wouldn't prevent the modal from appearing.

### Required Diagnostics (Runtime)

1. **Replace silent catch** — change line 14876 from `catch(e){}` to
   `catch(e){console.error("[RECON] onDone error:",e);}` — this is the single
   most impactful diagnostic change for BUG 2.

2. **Log before/after onDone** — add `console.log("[RECON] calling onDone, stagingMode:", cbs.stagingMode)` before the onDone call and `console.log("[RECON] onDone completed")` after.

3. **Check console for `[RECON] project changed`** — if present, the project-change guard fired.

---

## 4. Divergences from C96/C97 Plan

### Phases Implemented Correctly

| Phase | Plan | Deployed | Match? |
|-------|------|----------|--------|
| **A** — dvHistory archive + PREVIOUS VERSIONS modal | `archiveDvVersion()`, `loadDvHistory()`, read-only modal | Implemented at 24348, modal state at 23317-23319 | **YES** |
| **B** — Three-pass match engine | `reconcileBom()` at line 47286 | Implemented | **YES** |
| **C** — Carry-forward merge | `buildReconciledBom()` at line 47364 | Implemented | **YES** |
| **D** — Staging area + addFiles interception | `reconStagedExtraction` state, interception in confirmAndExtract, stagingMode flag | Implemented at 23314, 24534, 14095 | **YES** |
| **E** — Reconciliation Modal | Frozen-BOM isolation, gated commit, Accept All | Implemented at 23092-23151 | **YES** |
| **F** — Post-commit pipeline | Archive → page swap → merged BOM → enrich → price → qvHistory | Implemented at 24343-24405 | **YES** |

### Divergences Found

| # | Area | Plan says | Code does | Severity |
|---|------|-----------|-----------|----------|
| **D1** | Gate placement | "Interception fires BEFORE onSaveImmediate at line 24117" (C97) | Gate is at confirmAndExtract (line 24534), AFTER addFiles has appended pages and an async window has elapsed | **ARCHITECTURAL** — root cause of both bugs |
| **D2** | onDone error handling | Not specified | `try{...}catch(e){}` at line 14876 silently swallows errors from the staging completion callback | **HIGH** — masks BUG 2 failures |
| **D3** | pendingNewItemsRef types | Implicit: user-confirmed types should flow to extraction | `tagPage` updates `pendingPages` but NOT `pendingNewItemsRef.current` — transient panel uses AI-detected types, ignoring user corrections during confirm | **LOW** — affects accuracy, not control flow |
| **D4** | UI page count during Revise | Not specified | After `setPendingPages([])` in handleRevisionDrop, UI shows 50 pages (from panel prop) while extraction runs on 25 (transient). Confusing but not functionally broken. | **LOW** — cosmetic |
| **D5** | Signal D path for team projects | C97 doesn't mention team-path projects | Firestore backstop uses `_appCtx.projectsPath` which could be null during init race | **MEDIUM** — weakens the backstop |

### C97 Additions Verified

| Feature | Specified | Implemented | Match? |
|---------|-----------|-------------|--------|
| Transient staging (Cancel = clean no-op) | Yes — zero Firestore writes | `save` overridden to in-memory (14095-14096), cancel at 24536-24540 | **YES** |
| Three-option disambiguation prompt | Revise / Add pages / Cancel | Implemented at 29872-29890, resolved via `reconResolveRef` Promise | **YES** |
| "Add pages" path | Append + save, skip extraction | Implemented at 24542-24549, BOM unchanged | **YES** |
| Passthrough filter fix (`isPassthrough`) | Shared predicate for match exclusion | NOT VERIFIED — would need to check `reconcileBom` internals | **UNVERIFIED** |

---

## 5. Design Recommendation: Branch at DROP (Option A)

### The Question

Should the Revise/Add decision move UPSTREAM to the DROP (before addFiles appends),
rather than at confirm-after-append?

### Option A: Branch at DROP (RECOMMENDED)

```
handleDrawingDrop(e)
  │  Collects files
  │  Checks panel.bom → gate fires HERE (fresh prop, guaranteed BOM)
  │
  │  if (hasExistingBom):
  │    showRevisionPrompt() → "Revise" / "Add pages" / "Cancel"
  │
  │    "Revise" → addFiles(files) → AI detection → build transient panel
  │               → runExtractionTask(staging) → ReconciliationModal
  │
  │    "Add pages" → addFiles(files) → AI detection → append + save (no extraction)
  │
  │    "Cancel" → discard files, zero processing
  │
  │  else (no BOM):
  │    addFiles(files) → normal flow → confirm → extract
```

**Pros:**
- Gate fires with FRESH panel prop — BOM is guaranteed present (eliminates BUG 1)
- No async window between gate check and panel state — timing races impossible
- Intent decision happens before ANY processing (no wasted AI detection on Cancel)
- "Revise" path controls the full addFiles→extract pipeline (eliminates BUG 2)
- Simpler state management — no pendingNewItemsRef divergence from pendingPages

**Cons:**
- User doesn't see page types before deciding intent (types come from AI detection AFTER decision)
- Larger code change — handleDrawingDrop becomes the control nexus instead of confirmAndExtract
- addFiles must be callable from two different contexts (Revise vs. normal)

**Why the "no page types" con is acceptable:**
The decision is about INTENT ("am I replacing drawings or adding supplementary sheets?"),
not about page content. The user knows whether they're revising. Page type review still
happens after addFiles — the user can still adjust types before extraction begins in
the Revise path.

### Option B: Branch at CONFIRM (current architecture)

**Pros:**
- Minimal code change (already implemented)
- User sees all page types before deciding

**Cons:**
- The async window between addFiles and confirm is the ROOT CAUSE of both bugs
- Requires increasingly complex signal detection (currently 4 signals + Firestore read)
- Each new fix adds another signal without addressing the structural problem
- Four patches have failed to reliably solve BUG 1

### Verdict: Option A

The current architecture has been patched four times (v1.20.136/137/138 +
Firestore backstop). Each patch added another BOM-detection signal without
eliminating the async window that strips the BOM. The complexity is growing and
the reliability is not. Moving the gate upstream eliminates the class of bug,
not just the instance.

---

## 6. Consolidated Fix Plan

**One coherent fix, not N patches.** Marc builds after Jon approves.

### Phase 1: Move gate to handleDrawingDrop (eliminates BUG 1 + BUG 2)

1. In `handleDrawingDrop` (line 24236), after collecting files:
   - Read `panel.bom` (the prop — guaranteed fresh, no async window)
   - If BOM exists (non-labor/non-contingency rows > 0 OR bomVersion > 0):
     → call `showRevisionPrompt()`
   - No Firestore backstop needed — panel prop is authoritative at drop time

2. On "Revise":
   - Call `addFiles(files)` (processes pages, AI detection, sets pendingPages)
   - After addFiles completes, build transient panel from `pendingNewItemsRef.current`
   - Call `runExtractionTask` with `stagingMode:true`
   - onDone opens ReconciliationModal
   - **Key:** addFiles runs AFTER the decision, not before

3. On "Add pages":
   - Call `addFiles(files)` (same processing)
   - After addFiles completes, save with BOM unchanged
   - Skip extraction entirely

4. On "Cancel":
   - Discard files — zero processing, zero state changes

5. Remove gate logic from `confirmAndExtract` (lines 24506-24554):
   - `confirmAndExtract` becomes the simple "proceed with extraction" path
   - Only reached for non-revision drops (no existing BOM)

### Phase 2: Fix silent catch (prevents future debugging blindness)

6. Change line 14876 from `catch(e){}` to:
   ```javascript
   catch(e) { console.error("[EXTRACTION] onDone callback error:", e); }
   ```

### Phase 3: Sync pendingNewItemsRef with user type changes (D3 fix)

7. In `tagPage` (line 25124), after updating pendingPages, also update
   `pendingNewItemsRef.current` if the tagged page is a new item:
   ```javascript
   const nIdx = pendingNewItemsRef.current.findIndex(n => n.id === id);
   if (nIdx >= 0) pendingNewItemsRef.current[nIdx] = {...pendingNewItemsRef.current[nIdx], types};
   ```

### Phase 4: UI clarity during Revise extraction (D4 fix)

8. When entering the Revise extraction path, set a `revisingPanel` state that
   shows the 25-page transient panel's page count, not the panel prop's 50-page
   count. This prevents user confusion about "50-page extraction."

### What Gets Removed

- The 4-signal gate at lines 24506-24554 (replaced by simple prop check at drop time)
- The Firestore backstop read (Signal D) — no longer needed
- The `_hasExistingBom`/`_droppedNewPages` variables
- The debug log at line 24533 (move to new gate location with simpler signals)

### What Stays

- `showRevisionPrompt()` and the three-way dialog (lines 24283-24291, 29872-29890)
- `handleRevisionDrop` (line 24298) — called from handleDrawingDrop instead of confirmAndExtract
- `handleReconciliationCommit` (line 24343) — unchanged
- `ReconciliationModal` (line 23092) — unchanged
- `reconcileBom` / `buildReconciledBom` — unchanged
- `runExtractionTask` staging mode — unchanged (except error logging)
- All Phase A (dvHistory), Phase E (modal), Phase F (post-commit) code — unchanged

### Risk Assessment

| Risk | Mitigation |
|------|------------|
| handleDrawingDrop becomes more complex | Function is currently simple (12 lines); adding gate check keeps it under 30 |
| addFiles must be awaitable | It already returns a Promise (async function); just need to `await addFiles(files)` |
| Regression on non-revision drops | Normal path (no BOM) goes through addFiles → confirm → extract unchanged |
| Test matrix impact | T1 (fresh extraction) unchanged. T21/T22 (disambiguation, Add pages) timing changes. T14 (Cancel) cleaner. |

---

## 7. Test Criteria for Consolidated Fix

| # | Scenario | Expected |
|---|----------|----------|
| T1 | Fresh drop on empty panel (no BOM) | No prompt, normal addFiles → confirm → extract |
| T2 | Drop on BOM'd panel → Revise | Prompt appears at drop time, addFiles runs, staging extraction, ReconciliationModal opens with matched/new/deleted rows |
| T3 | Drop on BOM'd panel → Add pages | Prompt appears, addFiles runs, pages saved, BOM unchanged |
| T4 | Drop on BOM'd panel → Cancel | Prompt appears, files discarded, zero processing |
| T5 | BUG 1 regression: Revise path fires reliably | Drop on BOM'd panel → prompt ALWAYS appears (no intermittency) |
| T6 | BUG 2 regression: Modal appears after Revise extraction | ReconciliationModal renders with staged extraction data |
| T7 | Page types reflect user changes in Revise extraction | User changes BOM→SCH during confirm → extraction uses updated type |
| T8 | onDone errors are logged (not silent) | Introduce deliberate error → console.error appears |
| T9 | 50-page display during Revise extraction | UI shows transient panel page count, not merged count |
| T10 | Cancel in ReconciliationModal | Zero Firestore writes, panel unchanged |
| T11 | Commit in ReconciliationModal | Archive → page swap → merged BOM → enrich → price |

---

*End of C101 full flow read. Ready for Jon's review and approval before Marc builds.*

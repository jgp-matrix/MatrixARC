# #153 Revision-Gate Code-Path Trace

**Coach (C100) — 2026-06-17**
**Type:** Read-only structural trace
**Status:** COMPLETE — root cause identified, runtime verification needed

---

## Context

The revision-drop gate has failed THREE fixes (v1.20.136/137/138). All targeted the
`isRevisionDrop` condition in `confirmAndExtract`. All produced zero behavior change.
Jon requested a structural read of the actual control flow — map the path, not patch the
condition.

**Observed behavior:** Drop 25 revised pages onto a BOM'd panel → pages APPEND to
existing 25 = 50 → page-type confirmation → NO Revise/Add/Cancel prompt → extraction
runs on all 50 pages.

**Hypothesis under test:** When three targeted edits to a condition produce zero
behavior change, the condition probably isn't on the executed path.

---

## THE COMPLETE CALL CHAIN

```
File drop on BOM'd panel (25 existing pages + BOM)
  │
  ▼
handleDrawingDrop(e)                               ← line 24236
  │  Collects files from e.dataTransfer
  │  Early return if awaitingConfirm is already true
  │
  ├─► addFiles(files)                              ← line 24248 → fn at line 23955
  │     │
  │     │  ① livePages = [...(panel.pages||[])]     ← line 24023
  │     │     ▲ CAPTURES existing 25 pages from panel prop
  │     │
  │     │  ② For each PDF page:
  │     │     item = {id, name, dataUrl, types:[], ...}
  │     │     newItems.push(item)                   ← line 24087
  │     │     livePages = [...livePages, item]      ← line 24088  ◄── PAGE APPEND
  │     │     setPendingPages([...livePages])        ← line 24089
  │     │     (25→26→27→...→50 pages)
  │     │
  │     │  ③ AI page-type detection (parallelMap)   ← lines 24120-24171
  │     │     Updates newItems[i].types in-place
  │     │     Updates livePages via setPendingPages
  │     │
  │     │  ④ pendingNewItemsRef.current = newItems  ← line 24174
  │     │     ▲ STORES the 25 new items in a ref
  │     │
  │     │  ⑤ setAwaitingConfirm(true)               ← line 24183
  │     │     ▲ SHOWS the confirmation banner
  │     │
  │     │  ⑥ pendingPagesSet(projectId, panel.id,   ← line 24188
  │     │       {pages:livePages, newItems, awaiting:true})
  │     │     ▲ MODULE-SCOPE CACHE for remount recovery
  │     │
  │     │  ⑦ RETURNS — no onUpdate, no extraction, no save
  │     │     addFiles does NOT call onUpdate (parent state unchanged)
  │     │     addFiles does NOT call confirmAndExtract
  │     │     addFiles does NOT call runExtractionTask
  │     │
  │     └── (end of addFiles)
  │
  └── (end of handleDrawingDrop)

USER REVIEWS PAGE TYPES
  │  Confirmation banner visible (line 27913-27932)
  │  User can change tags, draw regions, add extraction notes
  │
  ▼
User clicks "Proceed with Extraction"              ← line 27924
  │  onClick={confirmAndExtract}
  │  Button is in the awaitingConfirm banner
  │
  ▼
confirmAndExtract()                                 ← line 24414
  │
  │  ① setAwaitingConfirm(false)                    ← line 24415
  │
  │  ② Input-tier quality gate                      ← lines 24417-24470
  │     classifyBomInputTier, checkPdfQuality
  │     May show modal (no-pdf, vision-mode)
  │
  │  ③ Page-type learning save                      ← lines 24473-24488
  │
  │  ④ livePages = pendingPages (50 pages)          ← line 24490
  │     newItems = pendingNewItemsRef.current (25)   ← line 24491
  │
  │  ⑤ ┌─── THE REVISION GATE ───────────────────── lines 24506-24554
  │     │
  │     │  Signal A: _refBomRows                     ← line 24507
  │     │    latestPanelRef.current.bom filtered for non-labor/non-contingency
  │     │
  │     │  Signal B: _propBomRows                    ← line 24508
  │     │    panel.bom (prop) filtered same way
  │     │
  │     │  Signal C: _priorDv                        ← line 24509
  │     │    bomVersion > 0 from either ref or prop
  │     │
  │     │  Signal D: _persistedHasBom                ← lines 24517-24528
  │     │    FIRESTORE READ with 4s timeout (v1.20.138 fix)
  │     │    fbDb.collection(_appCtx.projectsPath||`users/${uid}/projects`)
  │     │      .doc(projectId).get()
  │     │    Finds panel by ID, checks bom + bomVersion
  │     │
  │     │  _hasExistingBom = A || B || C || D        ← line 24531
  │     │  _droppedNewPages = newItems.length > 0    ← line 24532
  │     │
  │     │  DEBUG LOG                                  ← line 24533
  │     │    console.log("[#153 REVISION-GATE]", {
  │     │      hasExistingBom, droppedNewPages,
  │     │      refBomRows, propBomRows, priorDv,
  │     │      persistedHasBom, persistedBomVer,
  │     │      persistedReadErr, bomVersion, newItemsLen
  │     │    })
  │     │
  │     │  if (_hasExistingBom && _droppedNewPages)   ← line 24534
  │     │    → showRevisionPrompt()                   ← line 24535
  │     │    → Revise / Add pages / Cancel dialog
  │     │
  │     └──────────────────────────────────────────────
  │
  │  ⑥ If gate did NOT fire:
  │     Normal extraction path                       ← lines 24555-24602+
  │     onUpdate(updated), onSaveImmediate, runExtractionTask
  │
  └── (end of confirmAndExtract)
```

---

## VERDICT: The gate IS on the executed path

**Jon's hypothesis — "the condition probably isn't on the executed path" — is REFUTED
by the structural analysis.** There is NO alternative path from drop to extraction:

1. **Only one drop handler:** `handleDrawingDrop` (line 24236). It calls `addFiles`.
2. **`addFiles` does NOT extract.** It processes pages, runs AI detection, sets
   `awaitingConfirm=true`, and returns. No `onUpdate`, no `runExtractionTask`.
3. **Only one Confirm button:** Line 27924, `onClick={confirmAndExtract}`. The button
   only appears when `awaitingConfirm` is true.
4. **Only two extraction triggers in PanelCard:**
   - `confirmAndExtract` → `runExtractionTask` (line 24602) — the normal path
   - `handleRevisionDrop` → `runExtractionTask` (line 24310) — the "Revise" path
   Both go through the gate at line 24534 first.
5. **`runExtraction`** (line 25218) is the manual re-extract button — separate flow,
   not triggered by drops.

**The gate is checked. It evaluates to false. The prompt never shows. Extraction
proceeds through the normal (non-revision) path.**

---

## WHERE THE PAGE APPEND HAPPENS

The append happens at **line 24088** inside `addFiles`:
```
livePages = [...livePages, item];
```

This is BEFORE any gate check. By the time `confirmAndExtract` runs, `pendingPages`
already has 50 pages. The append is an accomplished fact — the gate doesn't prevent it,
it only determines what happens AFTER: reconcile vs. re-extract vs. cancel.

On "Cancel": pendingPages is discarded (line 24538), panel reverts to original 25 pages.
This is correct — the append was only in React state, not Firestore.

---

## WHY THE GATE NEVER FIRES — ROOT CAUSE ANALYSIS

Since the gate IS on the path, the condition `_hasExistingBom && _droppedNewPages`
evaluates to **false**. Both sides were investigated:

### `_droppedNewPages` — likely TRUE (not the problem)

`pendingNewItemsRef.current` is set at line 24174 (25 items) and only cleared by:
- `removePage` when all pages deleted (line 25167)
- Component remount (reinit to `[]`, but cache restores at line 23374)

No code path clears it between `addFiles` and `confirmAndExtract` during normal flow.

### `_hasExistingBom` — likely FALSE (the problem)

All four signals must fail simultaneously:

| Signal | Source | Why it could fail |
|--------|--------|-------------------|
| `_refBomRows` | `latestPanelRef.current.bom` | Ref tracks prop (line 23920). If prop loses BOM, ref loses BOM. |
| `_propBomRows` | `panel.bom` (prop) | Parent must provide BOM-less panel. |
| `_priorDv` | `bomVersion` from ref or prop | Same — if both lose BOM fields, bomVersion also missing. |
| `_persistedHasBom` | Firestore read | Read fails, times out, or doesn't find the panel. |

**Signals A-C fail together** because `latestPanelRef.current = panel` runs on every
render (line 23920). If the `panel` prop loses its BOM, all three in-memory signals go
to zero simultaneously.

**Signal D (Firestore read) ALSO fails.** The v1.20.138 fix added this as the
definitive backstop. Three possible failure modes:
1. **Read throws/times out** → caught at line 24528, `_persistedHasBom` stays false
2. **Panel not found** → `_ppanel` is undefined at line 24523
3. **Path mismatch** → `_appCtx.projectsPath` is wrong, read goes to wrong collection

---

## THE STRUCTURAL ROOT CAUSE

**The three fixes all modified the CONDITION. But the condition is correct — it's the
INPUTS that are wrong.**

The v1.20.138 comment itself states the diagnosis (lines 24497-24505):
> "at confirm time BOTH latestPanelRef.current AND the panel prop are stale
> (no bom AND no bomVersion) during the drop→confirm re-render window"

This means something STRIPS the BOM from the panel between `addFiles` completing and
`confirmAndExtract` running. The three fixes never investigated WHAT strips it — they
only added more ways to detect BOM presence, all reading from the same corrupted
source.

### What could strip the BOM from the panel prop?

The parent's `onUpdate` callback (line 34721-34723) replaces the entire panel in the
project state:
```javascript
onUpdate={updatedPanel => {
    onUpdate(prev => ({
        ...prev,
        panels: (prev.panels||[]).map(p => p.id===panel.id ? updatedPanel : p)
    }));
}}
```

If ANY code calls `onUpdate(panelWithoutBom)` during the addFiles→confirm window, the
parent's state loses the BOM, the next render provides a BOM-less panel prop, and
`latestPanelRef.current` follows.

**Candidate callers during the window** (async completions that could fire at any time):
- Background BC vendor lookup (line 26280) — uses `latestPanelRef.current`, preserves BOM
- Background pricing completion — uses extraction result, should have BOM
- BC re-verify effect (line 23392) — uses `latestPanelRef.current.bom`, preserves BOM
- **Any extraction `onDone` from a PREVIOUS run** (line 24618) — uses `finalPanel` from
  `runExtractionTask`, should have BOM

All examined callers use `{...panel, ...}` or `{...latestPanelRef.current, ...}` and
should preserve BOM fields. **No smoking gun found in static analysis.**

### Why the Firestore read also fails

If the BOM IS in Firestore but the read fails to find it, the most likely cause is a
**path or ID mismatch at read time.** The read uses:
```javascript
fbDb.collection(_appCtx.projectsPath || `users/${uid}/projects`).doc(projectId)
```

If `_appCtx.projectsPath` is null/wrong at this moment, the fallback
`users/${uid}/projects` would be queried. For a team project stored at
`companies/{cid}/projects`, this returns no document, and `_persistedHasBom` stays false.

---

## RECOMMENDED NEXT STEP

**Do NOT patch the condition again.** The condition is correct.

**Reproduce with the debug log open.** The log at line 24533 dumps every signal value.
One reproduction will immediately reveal:

1. Which side is false — `hasExistingBom` or `droppedNewPages`?
2. If `hasExistingBom` is false — which specific signals are false?
3. If `persistedReadErr` is populated — the Firestore read failed (path/timeout/perm)
4. If `persistedHasBom` is false but no error — the document/panel wasn't found

**Based on the log output:**

- If `refBomRows=0, propBomRows=0, priorDv=false` → the panel prop lost its BOM.
  **Investigate:** add a `console.trace` inside the parent's `onUpdate` callback
  (line 34722) filtering for calls where `updatedPanel.bom` is undefined/empty.
  This will show the exact caller that strips the BOM.

- If `persistedReadErr` is populated → the Firestore read is failing.
  **Investigate:** log `_appCtx.projectsPath` and `projectId` at read time.
  Verify the read points to the correct collection.

- If `newItemsLen=0` → `pendingNewItemsRef.current` was cleared.
  **Investigate:** add a sentinel log at the ref set (line 24174) and any clear
  points (lines 25163, 25167).

---

## SUPPLEMENTARY: All Paths to Extraction

| Path | Entry point | Gate? | When used |
|------|-------------|-------|-----------|
| Drop → confirm | `confirmAndExtract` (24414) → `runExtractionTask` (24602) | YES (24534) | User drops pages, clicks Confirm |
| Revision "Revise" | `handleRevisionDrop` (24298) → `runExtractionTask` (24310) | Through gate above | Revision prompt → Revise choice |
| Re-extract button | `runExtraction` (25218) | NO (separate flow) | Manual re-extract from UI |

There is no hidden auto-extract path. No `useEffect` triggers extraction. No keyboard
shortcut bypasses `confirmAndExtract`.

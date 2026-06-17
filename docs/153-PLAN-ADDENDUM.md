# #153 Plan Addendum — Revision 1 (Transient Staging) + Revision 2 (Disambiguation Prompt) + Filter Fix

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-17  
**Status:** Addendum to `docs/153-PHASE1-PLAN.md` (C96) — revises Phase D + commit path  
**Supersedes:** Phase D (Changes D1-D4) and the commit handler in Change E6 from C96.  
All other phases (A, B, C, E modal internals, F) stand as written in C96.

---

## Code-Path Verification: Can `runExtractionTask` Run Over a Transient Panel?

**Answer: YES — with one modification.**

`runExtractionTask` (line 14036) reads pages from the **passed `panel` argument**:
- Line 14042: `const _bp = _basePages(panel);` — pages come from the arg, not Firestore
- Line 14043: `bomPages = _bp.filter(...)` — BOM pages filtered from the arg
- Line 14044: `bomPages = await Promise.all(bomPages.map(ensureDataUrl))` — hydrates dataUrls

The function never re-reads `panel.pages` from Firestore or `latestPanelRef`. A transient panel object with new pages works.

**The modification:** The function has two Firestore `save()` calls that must be suppressed in staging mode:
1. **Early-upload save** (line 14116): After uploading page images to Firebase Storage, saves `latestPanel` to Firestore to persist storageUrls.
2. **Final consolidated save** (line 14823): Writes all accumulated results (BOM + validation + verification + stamps) to Firestore.

Both use the `save` helper defined at line 14060:
```js
const save = async p => { latestPanel = p; await saveProjectPanel(uid, projectId, panel.id, p).catch(...); };
```

**Staging-mode override:** Replace `save` with `applyInMemory` when `cbs.stagingMode` is true:

```js
const save = cbs.stagingMode
  ? (p => { latestPanel = p; })  // staging: accumulate in memory only, no Firestore write
  : (async p => { latestPanel = p; await saveProjectPanel(uid, projectId, panel.id, p).catch(...); });
const applyInMemory = p => { latestPanel = p; };
```

**Storage uploads still happen** — `uploadPageImage()` (line 14109) fires regardless of `save`. This is correct: page images in Storage are harmless (cheap, never auto-deleted) and the committed panel will need them. The `save` suppression only prevents the _Firestore doc_ from reflecting the new pages until commit.

**Error-path save** (line 14833 in the `catch` block): Also needs the staging guard:
```js
} catch (ex) {
  // ...
  if (!cbs.stagingMode) {
    try { await saveProjectPanel(uid, projectId, panel.id, latestPanel).catch(() => {}); } catch (e) {}
  }
}
```

**`onDone` callback change:** In staging mode, pass the extracted BOM as a second argument so the caller can route it to staging instead of `panel.bom`:

```js
} finally {
  try {
    if (cbs.stagingMode) {
      if (onDone) onDone(latestPanel, latestPanel.bom || []);
    } else {
      if (onDone) onDone(latestPanel);
    }
  } catch (e) {}
}
```

---

## Revision 1 — Deferred Page-Persist + Archive to Commit

### Principle

**Nothing touches Firestore until the user clicks Commit.** Cancel = discard staging, zero Firestore writes, panel fully intact.

### Revised Change D2 — Interception in `confirmAndExtract()`

**File:** `src/app.jsx`  
**Function:** `confirmAndExtract()` (line 24028)  
**Location:** After page-type learning save (line 24101), BEFORE the `onSaveImmediate` call at line 24117

The interception fires BEFORE `onSaveImmediate(updated)` — so pages have NOT been persisted to Firestore yet when we detect the revision drop. (Pages live only in `pendingPages` React state + module cache until line 24117.)

```js
// #153: Detect revision drop — panel has BOM + user just dropped new pages
const hasExistingBom = (latestPanelRef.current.bom || [])
  .some(r => !r.isLaborRow && !r.isContingency);
const droppedNewPages = (pendingNewItemsRef.current || []).length > 0;

if (hasExistingBom && droppedNewPages) {
  // Show disambiguation prompt (Revision 2 — see below)
  const choice = await showRevisionPrompt();
  if (choice === "cancel") {
    // Discard pending pages, restore panel to original state
    setPendingPages([]);
    pendingPagesClear(projectId, panel.id);
    setAwaitingConfirm(false);
    return;
  }
  if (choice === "add") {
    // Fall through to existing flow — append pages, save, extract normally
    // (existing behavior: replaces BOM entirely via runExtractionTask)
    // continue below to line 24117...
  }
  if (choice === "revise") {
    // #153 reconciliation flow — see Revised Change D3 below
    handleRevisionDrop(livePages, newItems, notes);
    return;
  }
}

// === Existing flow continues here (line 24107-24117) ===
const updated = { ...panel, pages: livePages, ...(notes ? { extractionNotes: notes } : {}) };
onUpdate(updated);
pendingPagesClear(projectId, panel.id);
onSaveImmediate(updated).catch(() => {});
// ... rest of confirmAndExtract ...
```

### Revised Change D3 — `handleRevisionDrop()` (transient panel, no Firestore writes)

```js
async function handleRevisionDrop(livePages, newItems, notes) {
  const capturedProjectId = projectId;   // #86 async-ownership
  const capturedPanelId = panel.id;
  const capturedPanelName = panel.name || ("Panel " + (idx + 1));

  // 1. Build TRANSIENT panel — new pages, NOT persisted to Firestore
  const ecoPages = (latestPanelRef.current.pages || []).filter(p => p.ecoId);
  const transientPanel = {
    ...latestPanelRef.current,
    pages: [...newItems, ...ecoPages],
    ...(notes ? { extractionNotes: notes } : {}),
  };

  // 2. Clear pending state (pages now live in transient panel, not pendingPages)
  setPendingPages([]);
  pendingPagesClear(projectId, panel.id);
  setAwaitingConfirm(false);

  // 3. Extract over transient panel in STAGING MODE (no Firestore writes)
  setExtracting(true);
  const _reconProjectId = capturedProjectId;

  runExtractionTask(uid, capturedProjectId, transientPanel, {
    stagingMode: true,  // <-- suppresses all Firestore save() calls
    projectName,
    bcProjectNumber,
    onDone: (finalTransientPanel, extractedBom) => {
      // #86: verify identity
      if (_currentProjectId !== _reconProjectId) {
        console.warn("[RECON] project changed during extraction — discarding");
        setExtracting(false);
        return;
      }
      setExtracting(false);

      // Route to staging — NOT to panel.bom, NOT to Firestore
      setReconStagedExtraction({
        items: extractedBom,
        transientPanel: finalTransientPanel,  // carries storageUrls from early-upload
        reason: "Drawing revision",
      });
      setShowReconciliation(true);
    },
    stampFn: /* same as existing */,
  });
}
```

**What happens in Firestore during this flow: NOTHING.** The original panel with its old pages and old BOM remains untouched. The new pages exist only in the transient panel object (in memory) and as Storage files (harmless).

### Revised Change E6 — Commit Handler (archive + page swap + BOM write)

The commit handler is now the ONLY place that touches Firestore:

```js
async function handleReconciliationCommit(mergedBom) {
  const capturedProjectId = projectId;
  const capturedPanelId = panel.id;

  // === STEP 1: Archive outgoing Dv (MUST-ADDRESS #2) ===
  // Uses the CURRENT persisted panel (latestPanelRef.current) which still has
  // old pages + old BOM — nothing has been overwritten yet.
  try {
    await archiveDvVersion(uid, capturedProjectId, latestPanelRef.current);
  } catch (e) {
    console.warn("[RECON] dvHistory archive failed:", e.message);
    // Non-fatal — proceed with commit
  }

  // === STEP 2: Build committed panel — new pages + merged BOM ===
  // Take pages from the transient panel (which carries storageUrls from
  // the staging-mode early-upload). This is the page swap.
  const transientPanel = reconStagedExtraction.transientPanel;
  const committed = {
    ...latestPanelRef.current,
    pages: transientPanel.pages,           // new pages (with storageUrls)
    bom: mergedBom,                        // reconciled BOM
    updatedAt: Date.now(),
    // Clear stale derived data (same as runExtraction line 24788-24794)
    laborData: null,
    validation: null,
    bomVerification: null,
    bomAudit: null,
    extractionReport: transientPanel.extractionReport || null,
  };

  // === STEP 3: Single atomic write ===
  latestPanelRef.current = committed;
  onUpdate(committed);
  try { onSaveImmediate(committed); } catch (e) {}
  // _bumpBomVersionIfChanged fires inside saveProjectPanel (line 9154)
  // when the BOM hash changes — Dv bumps automatically

  // === STEP 4: Clean up modal state ===
  setShowReconciliation(false);
  setReconStagedExtraction(null);

  // === STEP 5: Post-commit pipeline (Phase F — unchanged from C96) ===
  // applyLearnedCorrections on NEW + PN-CHANGED rows, auto-price trigger,
  // qvHistory logging
  // ... (see C96 Phase F)
}
```

### Cancel Handler (clean no-op)

```js
function handleReconciliationCancel() {
  // Discard staging — zero Firestore writes, panel fully intact
  setShowReconciliation(false);
  setReconStagedExtraction(null);
  // No warning needed — nothing was persisted. Panel has old pages + old BOM.
}
```

### Write ordering on commit

```
1. archiveDvVersion()    → writes _dvHistory/{dv} doc (old BOM + old pageRefs)
2. onSaveImmediate()     → writes panel with new pages + merged BOM
   └─ saveProjectPanel() → internally calls _bumpBomVersionIfChanged → Dv bumps
```

Step 1 reads the **current** Firestore state (old panel) and archives it. Step 2 overwrites it with the new state. Ordering is correct: the archive captures what step 2 is about to overwrite.

If step 1 fails (Firestore write error): commit proceeds without archive. The user loses the ability to browse the prior version in PREVIOUS VERSIONS, but the reconciled BOM is correct. Acceptable degradation — `_dvHistory` is a convenience, not a correctness mechanism.

If step 2 fails: commit failed, user is still in the modal, panel unchanged. The `_dvHistory` doc exists but references a version that was never actually superseded — harmless orphan.

---

## Revision 2 — Disambiguation Prompt on Drop-onto-BOM'd Panel

### Change D5 — `showRevisionPrompt()` dialog

**File:** `src/app.jsx`  
**Location:** In `PanelCard`, called from the revision-detection block in `confirmAndExtract()`

Uses the existing `arcConfirm`-style modal pattern (or a new three-button variant):

```js
async function showRevisionPrompt() {
  return new Promise(resolve => {
    setRevisionPrompt({
      message: "This panel already has an extracted BOM. What do you want to do?",
      options: [
        {
          label: "Revise drawings (replace & reconcile)",
          description: "Replace the current drawings with the new set. Opens the Reconciliation Modal to review changes against the existing BOM — edits, pricing, and crosses are preserved on matching items.",
          value: "revise",
          color: "#a855f7",  // purple — primary/novel action
        },
        {
          label: "Add pages (keep current BOM)",
          description: "Append the new pages to the existing drawing set. The current BOM is unchanged — no extraction, no reconciliation. Tag the new pages manually if you want to re-extract later.",
          value: "add",
          color: "#38bdf8",  // blue — safe/additive action
        },
      ],
      onChoice: (value) => {
        setRevisionPrompt(null);
        resolve(value);
      },
      onCancel: () => {
        setRevisionPrompt(null);
        resolve("cancel");
      },
    });
  });
}
```

Add state: `const [revisionPrompt, setRevisionPrompt] = useState(null);`

Render the prompt as a modal portal (same pattern as `reExtractWarn` dialog at lines 29386-29403).

### "Add pages" behavior for a BOM'd panel

When the user picks "Add pages (keep current BOM)":

1. Pages are appended to `panel.pages` (existing `addFiles` append behavior).
2. Pages are saved to Firestore (line 24107-24117 continues normally).
3. **No extraction runs** — the BOM is kept as-is.

This requires a small addition to the existing flow: after the prompt returns `"add"`, skip the extraction trigger and just save the pages:

```js
if (choice === "add") {
  // Save pages (append) but skip extraction
  const updated = { ...panel, pages: livePages, ...(notes ? { extractionNotes: notes } : {}) };
  onUpdate(updated);
  pendingPagesClear(projectId, panel.id);
  onSaveImmediate(updated).catch(() => {});
  setAwaitingConfirm(false);
  bgDone(_bgKey(projectId, panel.id), "Pages added — BOM unchanged");
  return;
}
```

The user can later manually trigger re-extraction via the existing "Re-Extract Drawings" button if they want to re-extract the full set (which goes through the standard `runExtraction()` → full BOM replacement path with the existing confirmation dialog).

**This is a well-defined path** — it's simply "add supplementary pages for reference without disturbing the BOM." Common use case: adding a schematic page or one-line diagram to a panel that already has its BOM complete.

---

## Passthrough Filter Fix (Build-Note Bug)

### The problem

In C96 Phase C, the matchable/passthrough filters are asymmetric:

**Matchable exclusion** (Change B1):
```js
const matchableCurrent = currentBom.filter(r =>
  !r.isLaborRow && !r.ecoTag && !r.isContingency && !r.autoLoaded
);
```
Excludes a row if ANY of: `isLaborRow`, `ecoTag`, `isContingency`, `autoLoaded`.

**Passthrough inclusion** (Change C1, Step 1):
```js
const passthroughRows = currentBom.filter(r =>
  r.isLaborRow || r.ecoTag || (r.isContingency && r.autoLoaded)
);
```
Includes a row only if: `isLaborRow`, `ecoTag`, or (`isContingency` AND `autoLoaded`).

**A row with `isContingency: true` but `autoLoaded: false`** (manually added contingency) is excluded from matching (has `isContingency`) but NOT included in passthrough (fails the `&& autoLoaded` check). It vanishes from the reconciled BOM.

Same for a row with `autoLoaded: true` but `isContingency: false` (if that combination ever occurs).

### The fix

The passthrough filter must be the **exact complement** of the matchable filter:

```js
const isPassthrough = r => r.isLaborRow || r.ecoTag || r.isContingency || r.autoLoaded;
const matchableCurrent = currentBom.filter(r => !isPassthrough(r));
const passthroughRows = currentBom.filter(r => isPassthrough(r));
```

Single predicate `isPassthrough()`, used with `!` for matchable and directly for passthrough. Impossible for a row to fall through both.

**Updated code for Phase B (Change B1) and Phase C (Change C1):**

Replace the separate filters with the shared predicate. In the plan, this replaces the filter definitions in both B1 and C1 Step 1.

---

## Revised Test Criteria (additions/modifications to C96 T1-T20)

### T14 — Cancel is a clean no-op (REVISED)

Drop revised drawings → proceed through type detection → pick "Revise drawings" → reconciliation modal opens → extraction completes → rows are shown. **Cancel.** Verify:
- No Firestore writes occurred (check Firestore console — panel doc unchanged).
- `panel.pages` still shows the OLD drawings (not the new ones).
- `panel.bom` still shows the OLD BOM.
- No `_dvHistory` doc was created.
- Storage files from the early-upload phase exist (harmless) but are not referenced by any Firestore doc.
- The user can re-drop the same files immediately with no recovery steps needed.

### T21 — Disambiguation prompt appears (NEW)

Panel with existing BOM. Drop new drawing files. After type detection, verify:
- Prompt appears: "This panel already has an extracted BOM."
- Three options: "Revise drawings", "Add pages", Cancel.
- **"Revise drawings"** → reconciliation flow (extraction + modal).
- **"Add pages"** → pages appended, BOM unchanged, no extraction triggered.
- **Cancel** → pages discarded, panel unchanged.

### T22 — "Add pages" keeps BOM intact (NEW)

Panel with edited BOM (crosses, prices, manual edits). Drop a supplementary schematic page. Pick "Add pages." Verify:
- New page appears in the thumbnail strip alongside existing pages.
- BOM is completely unchanged (all edit-work preserved).
- No Dv bump (BOM hash unchanged).
- "Re-Extract Drawings" button is still available for future full re-extract.

### T23 — Passthrough filter completeness (NEW)

Panel with a manually-added contingency row (`isContingency: true`, `autoLoaded: false`). Drop revised drawings → reconcile → commit. Verify: the contingency row survives in the committed BOM. It should not appear in the reconciliation modal (passthrough), and it should not be dropped.

---

## Summary of Changes to C96

| C96 section | Change |
|-------------|--------|
| **Phase D, Change D2** | Revision detection + disambiguation prompt BEFORE `onSaveImmediate`. Prompt gates entry to reconciliation vs add-pages vs cancel. |
| **Phase D, Change D3** | Transient panel passed to `runExtractionTask` in staging mode. NO Firestore writes. `save()` replaced with `applyInMemory` in staging mode. |
| **Phase D, Change D4** | `runExtractionTask` gets `stagingMode` flag. Suppresses both `save()` calls (lines 14116, 14823) and the error-path save (line 14833). `onDone` passes extracted BOM as second arg. |
| **Phase E, Change E6** | Commit handler now does: archive outgoing Dv → swap pages (from transient panel) → write merged BOM. Single atomic `onSaveImmediate`. |
| **Phase E, Cancel** | Clean no-op: discard staging, zero Firestore writes, no warning needed. |
| **Phase B, Change B1** | Shared `isPassthrough()` predicate replaces separate matchable/passthrough filters. |
| **Phase C, Change C1 Step 1** | Same `isPassthrough()` predicate — exact complement guaranteed. |
| **New: Change D5** | Disambiguation prompt ("Revise drawings" / "Add pages" / Cancel). |
| **New: "Add pages" path** | Saves pages, skips extraction, BOM unchanged. |
| **Tests T14, T21-T23** | Revised/new test criteria. |

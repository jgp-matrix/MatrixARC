# #153 Detailed Plan — Drawing-Revision Re-Extract + BOM Reconciliation

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-17  
**Status:** Plan — awaiting Jon approval, then Marc builds (diff-gated)  
**Source spec:** `docs/153-SUPPLEMENT.md` (C95), Brief #153 (Jon)

---

## Internal Phasing

This is a large feature. Six phases, each independently testable. Deploy after all six pass.

| Phase | What | Depends on |
|-------|------|-----------|
| **A** | `_dvHistory` archive infrastructure + PREVIOUS VERSIONS modal | Nothing |
| **B** | Three-pass match engine (pure function, no UI) | Nothing |
| **C** | Carry-forward merge logic (pure function, no UI) | B |
| **D** | Extraction staging area + `addFiles` interception | Nothing |
| **E** | Reconciliation Modal (UI + gated commit) | B, C, D |
| **F** | Post-commit pipeline + integration wiring | A, E |

Phases A, B, D can be built in parallel. C depends on B's match output shape. E depends on B + C + D. F wires everything together.

---

## Phase A — `_dvHistory` Archive + PREVIOUS VERSIONS Modal

### Change A1 — `archiveDvVersion()` helper

**File:** `src/app.jsx`  
**Location:** After `restoreSnapshot()` (line 9038), before `saveProjectPanel()` (line 9040)

```js
async function archiveDvVersion(uid, projectId, panel) {
  const dv = panel.bomVersion || 0;
  if (dv === 0) return;
  const path = (_appCtx.projectsPath || `users/${uid}/projects`) + `/${projectId}/_dvHistory`;
  const doc = {
    dvVersion: dv,
    panelId: panel.id,
    panelName: panel.name || "",
    createdAt: Date.now(),
    reason: `Archived before drawing revision (Dv.${dv} → Dv.${dv + 1})`,
    bom: JSON.parse(JSON.stringify(panel.bom || [])),
    laborData: panel.laborData || null,
    pageRefs: (panel.pages || []).filter(p => !p.ecoId).map(p => ({
      pageId: p.id,
      name: p.name || null,
      storageUrl: p.storageUrl || null,
      originalPdfPath: p.originalPdfPath || null,
      pageNumber: p.pageNumber || null,
      types: p.types || [],
    })),
  };
  await fbDb.collection(path).doc(String(dv)).set(doc);
}
```

**Key design decisions:**

- **Doc ID is the Dv number** (`String(dv)`) — natural key, prevents duplicate archives for the same version.
- **`pageRefs` are pointers** — `storageUrl` and `originalPdfPath` reference already-retained Storage files. No data duplication. Storage files are never deleted (CLAUDE.md: "retained forever").
- **Deep-copies BOM** via `JSON.parse(JSON.stringify(...))` — same pattern as `saveSnapshot()` (line 9013).
- **No FIFO cleanup** — version history is permanent. Unlike `_snapshots` (10-cap, line 9018-9019), `_dvHistory` docs are small (~50KB each) and few per project (<20 typical).
- **ECO pages excluded** from `pageRefs` (filtered by `!p.ecoId`), matching `_basePages()` pattern (line 15271).

### Change A2 — `loadDvHistory()` helper

**File:** `src/app.jsx`  
**Location:** Immediately after `archiveDvVersion`

```js
async function loadDvHistory(uid, projectId) {
  const path = (_appCtx.projectsPath || `users/${uid}/projects`) + `/${projectId}/_dvHistory`;
  const snap = await fbDb.collection(path).orderBy("dvVersion", "desc").get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
```

### Change A3 — Firestore rules for `_dvHistory`

**File:** `firestore.rules`  
**Location:** Inside the existing `match /users/{userId}/projects/{projectId}` block. Add a nested match for the subcollection.

```
match /_dvHistory/{dvVersion} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

Team access follows the existing project-level rules — `_dvHistory` inherits from the project's access pattern. If team-level access is needed (company members reading other users' projects), mirror the project-level team check.

### Change A4 — PREVIOUS VERSIONS modal

**File:** `src/app.jsx`  
**Location:** In `PanelCard`, alongside existing modals. Add state:

```js
const [showDvHistory, setShowDvHistory] = useState(false);
const [dvHistory, setDvHistory] = useState([]);
const [dvHistoryLoading, setDvHistoryLoading] = useState(false);
```

**Button location:** In the BOM toolbar area (around line 27185, near the `Dv.N` pill). Add "Previous Versions" button after the Dv pill:

```jsx
{panel.bomVersion > 1 && (
  <button onClick={async () => {
    if (showDvHistory) { setShowDvHistory(false); return; }
    setDvHistoryLoading(true); setShowDvHistory(true);
    const hist = await loadDvHistory(uid, projectId);
    setDvHistory(hist); setDvHistoryLoading(false);
  }} style={{/* small pill style matching existing toolbar buttons */}}>
    📋 Previous Versions
  </button>
)}
```

**Modal content** (read-only):

For each version in `dvHistory`:
- **Header:** `Dv.{dvVersion}` — archived `{formatDate(createdAt)}` — `{reason}`
- **Drawing thumbnails:** Render `pageRefs` as a horizontal scrollable strip. Each thumbnail links to `storageUrl` (click to view full-size in a lightbox or new tab). Page names shown below each thumbnail.
- **BOM table:** Read-only table showing `partNumber`, `qty`, `description`, `manufacturer`, `unitPrice`. Same columns as the main BOM table but non-interactive.
- **No actions** — strictly read-only comparison reference.

---

## Phase B — Three-Pass Match Engine

### Change B1 — `reconcileBom()` pure function

**File:** `src/app.jsx`  
**Location:** Near `normPart()` (line 46777) — same utility area.

This is a **pure function** — no side effects, no Firestore, no React state. Takes two arrays, returns structured match results. Testable in isolation.

```js
function reconcileBom(currentBom, newExtraction) {
  // currentBom:   the user's EDITED BOM (crosses + pricing applied) — Array<row>
  // newExtraction: raw extraction output from new drawings — Array<item>
  // Returns: { unchanged, changed, deleted, added, matchLog }
  //   unchanged: [{prior, extracted}]  — PN + Qty match
  //   changed:   [{prior, extracted, reason}] — PN match, Qty or desc differ
  //   deleted:   [prior]                — in current, not in new
  //   added:     [extracted]            — in new, not in current
  //   matchLog:  [{pass, action, ...}]  — diagnostic trace
}
```

**Implementation — three passes:**

#### Pass 1 — normPN exact match

```js
// Build maps
const currentMap = new Map();  // normPN → row[]
const extractMap = new Map();  // normPN → item[]
// Exclude labor, ECO-tagged, contingency/autoLoaded from currentBom
const matchableCurrent = currentBom.filter(r =>
  !r.isLaborRow && !r.ecoTag && !r.isContingency && !r.autoLoaded
);
matchableCurrent.forEach(r => {
  const np = normPart(r.partNumber);
  if (!np) return;
  const arr = currentMap.get(np) || [];
  arr.push(r);
  currentMap.set(np, arr);
});
// newExtraction — all rows are matchable (fresh from AI)
newExtraction.forEach(item => {
  const np = normPart(item.partNumber);
  if (!np) return;
  const arr = extractMap.get(np) || [];
  arr.push(item);
  extractMap.set(np, arr);
});
```

**Matching within a normPN group:**

When a normPN key has exactly one row on each side → direct match.

When a normPN key has N rows on one side and M on the other (duplicate PNs):
1. Try positional disambiguation: match by `(sourcePageIdx, y_top)` proximity (within 0.05 threshold on same page).
2. If positional match fails, try `itemNo` (drawing line number) match.
3. If still ambiguous, match by array index order (first-to-first, second-to-second).
4. Log ambiguous matches in `matchLog` for user review.

Excess rows (N > M or M > N) go to Pass 3 as unmatched.

**Match classification within a pair:**
- `prior.qty === extracted.qty` → UNCHANGED
- `prior.qty !== extracted.qty` → CHANGED (reason: `"qty"`)

#### Pass 2 — Position + description fallback

Unmatched rows from both sides enter Pass 2.

For each unmatched `extracted` item, search unmatched `current` rows by:
1. Same `sourcePageIdx` AND `y_top` within 0.08 threshold (wider than Pass 1 — allows for minor reflow)
2. AND description similarity > 0.7 (normalized Levenshtein or token overlap)

If a match is found: classify as CHANGED with reason `"pn_changed"` (the PN is different — this is likely a user-corrected PN or a reformatted PN).

This pass catches the corrected-PN scenario: the prior row has `isCorrection: true` with a different displayed PN, and the new extraction has the original OCR'd PN.

#### Pass 3 — Residuals

- Unmatched new extraction items → `added`
- Unmatched current BOM rows → `deleted` (candidates — user must resolve)

#### Return shape

```js
return {
  unchanged: [{ prior: currentRow, extracted: newItem }],
  changed:   [{ prior: currentRow, extracted: newItem, reason: "qty"|"pn_changed" }],
  deleted:   [currentRow],
  added:     [newItem],
  matchLog:  [{ pass: 1|2|3, action: "match"|"ambiguous"|"unmatched", ... }],
};
```

### Performance note

200-row BOM × 3-pass: Pass 1 is O(n) map lookups, Pass 2 is O(u² × desc_len) where u = unmatched count (typically <20), Pass 3 is O(1) residuals. Sub-5ms total.

---

## Phase C — Carry-Forward Merge Logic

### Change C1 — `buildReconciledBom()` pure function

**File:** `src/app.jsx`  
**Location:** Adjacent to `reconcileBom()`

Takes the match results from Phase B + the user's resolution decisions from the modal, produces the final BOM array.

```js
function buildReconciledBom(matchResult, resolutions, currentBom) {
  // matchResult: output of reconcileBom()
  // resolutions: Map<key, "accepted"|"rejected"|"deleted"|"kept">
  //   - CHANGED rows: "accepted" = take new values per D1 rules
  //   - NEW rows:     "accepted" = include, "rejected" = exclude
  //   - DELETED rows: "deleted" = remove, "kept" = preserve
  // currentBom: the full current BOM (including labor/ECO/contingency)
  // Returns: Array<row> — the final merged BOM
}
```

**Implementation:**

#### Step 1 — Collect passthrough rows

Labor rows (`isLaborRow`), ECO rows (`ecoTag`), contingency rows (`isContingency`/`autoLoaded`), and customer-supplied rows are **carried unconditionally**. They were excluded from matching and pass through unchanged.

```js
const passthroughRows = currentBom.filter(r =>
  r.isLaborRow || r.ecoTag || (r.isContingency && r.autoLoaded)
);
```

#### Step 2 — Process UNCHANGED rows

For each `unchanged` pair: **spread the prior row, then override extraction-position fields, then clear no-carry fields.**

```js
function carryForwardUnchanged(prior, extracted) {
  const merged = {
    ...prior,                               // spread ALL prior fields (retention guarantee)
    y_top: extracted.y_top,                  // override: new drawing position
    y_bottom: extracted.y_bottom,
    x_left: extracted.x_left,
    x_right: extracted.x_right,
    sourcePageIdx: extracted.sourcePageIdx,
    sourcePageId: extracted.sourcePageId,
  };
  // EXPLICIT CLEAR LIST (MUST-ADDRESS #1 — post-spread clear)
  delete merged.confidence;                  // fresh extraction re-establishes; #146/#149 re-promotes on load
  delete merged._confDowngradeReason;        // stale from prior extraction
  delete merged.suspectQty;                  // fresh extraction re-flags
  delete merged.suspectQtyReason;
  delete merged.autoAddedCompanion;          // fresh extraction re-splits companions
  delete merged.companionOfPartNumber;
  delete merged.snippetCorrected;            // fresh extraction re-runs audit
  delete merged.additionalPartNumbers;       // companion metadata from prior extraction
  return merged;
}
```

**Why spread-then-clear, not cherry-pick:** The carry-forward field inventory (C95 §1) has 67+ fields. Cherry-picking is fragile — a new field added in a future release would silently not carry forward. Spread carries everything by default; the explicit clear-list handles the ~8 fields that MUST NOT carry.

#### Step 3 — Process CHANGED rows

**D1 rule — PN UNCHANGED (qty or description changed):**
```js
function carryForwardChanged_PnSame(prior, extracted) {
  const merged = carryForwardUnchanged(prior, extracted);
  merged.qty = extracted.qty;  // take new qty
  // Description: take new if meaningfully different, else keep prior
  if (extracted.description && extracted.description !== prior.description) {
    merged.description = extracted.description;
  }
  return merged;
}
```
Crosses, BC pricing, lead times — all carried (PN is the same).

**D1 rule — PN CHANGED:**
```js
function carryForwardChanged_PnChanged(prior, extracted) {
  return {
    id: prior.id,                            // keep row identity
    partNumber: extracted.partNumber,         // new PN
    qty: extracted.qty,
    description: extracted.description || prior.description,
    manufacturer: extracted.manufacturer || "",
    itemNo: extracted.itemNo || prior.itemNo,
    y_top: extracted.y_top,
    y_bottom: extracted.y_bottom,
    x_left: extracted.x_left,
    x_right: extracted.x_right,
    sourcePageIdx: extracted.sourcePageIdx,
    sourcePageId: extracted.sourcePageId,
    // ALL cross/pricing/BC/lead-time fields CLEARED (not spread from prior)
    // Post-commit pipeline will re-apply corrections + crosses + BC pricing
  };
}
```
Everything else is omitted — the row is effectively a new item from a pricing perspective.

#### Step 4 — Process NEW rows (accepted)

Take raw extraction values. Assign fresh row ID: `"row-" + Date.now() + "-" + random`.

```js
function buildNewRow(extracted) {
  return {
    id: "row-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    partNumber: extracted.partNumber,
    qty: extracted.qty || 1,
    description: extracted.description || "",
    manufacturer: extracted.manufacturer || "",
    itemNo: extracted.itemNo || "",
    y_top: extracted.y_top,
    y_bottom: extracted.y_bottom,
    x_left: extracted.x_left,
    x_right: extracted.x_right,
    sourcePageIdx: extracted.sourcePageIdx,
    sourcePageId: extracted.sourcePageId,
  };
}
```

Post-commit pipeline (Phase F) applies corrections + crosses + BC pricing.

#### Step 5 — Process DELETED rows (kept)

If user chose "kept": carry the prior row in full, no changes. Keep its position in the BOM.

#### Step 6 — Assemble final BOM

```js
// Order: follow the NEW extraction's line ordering for matched/accepted rows,
// then append KEPTs (deleted-but-retained) at the end, then passthroughs.
const finalBom = [
  ...sortBomByDrawingPosition([
    ...unchangedMerged,
    ...changedMerged,
    ...acceptedNew,
  ]),
  ...keptDeleted,  // retain at end — no position in new drawing
  ...passthroughRows,
];
```

---

## Phase D — Extraction Staging Area + `addFiles` Interception

### Change D1 — Staging state in PanelCard

**File:** `src/app.jsx`  
**Location:** In `PanelCard` state declarations (around line 23385)

```js
const [reconStagedExtraction, setReconStagedExtraction] = useState(null);
// { items: extractedBomItems[], pages: newPageArray[], reason: string }
const [showReconciliation, setShowReconciliation] = useState(false);
```

### Change D2 — Interception in `confirmAndExtract()`

**File:** `src/app.jsx`  
**Function:** `confirmAndExtract()` (line 24028)  
**Location:** After the page-type learning save (line 24101) and before `runExtractionTask` is called (line 24154)

**Current flow at this point:**
1. Pages saved to panel (line 24108-24117)
2. BOM pages filtered (line 24127)
3. `runExtractionTask()` called (line 24154) with `onDone` callback that replaces BOM

**New flow — detect "revision drop" and route to staging:**

Insert between line 24127 (BOM page filter) and line 24150 (state setup):

```js
// #153: If panel already has an extracted BOM AND new pages were just added,
// route to reconciliation instead of direct BOM replacement.
const hasExistingBom = (latestPanelRef.current.bom || []).some(r => !r.isLaborRow && !r.isContingency);
const isRevisionDrop = hasExistingBom && (pendingNewItemsRef.current || []).length > 0;

if (isRevisionDrop) {
  // Phase D: archive outgoing Dv, replace pages, extract to staging
  // ... see Change D3
  return;
}
// else: original flow continues (first extraction or re-extract without reconciliation)
```

**Why here and not in `addFiles`:** `addFiles` is the hot path for all file drops — first-time projects, adding more pages to an existing set, ECO drawings. The revision-detection logic must fire AFTER page-type detection and user confirmation, not during file processing. `confirmAndExtract` is the decision point.

### Change D3 — Revision-drop flow inside `confirmAndExtract`

When `isRevisionDrop` is true:

```js
if (isRevisionDrop) {
  // 1. Archive outgoing Dv BEFORE overwriting (MUST-ADDRESS #2)
  const capturedProjectId = projectId;  // #86 async-ownership
  const capturedPanelId = panel.id;
  try {
    await archiveDvVersion(uid, capturedProjectId, latestPanelRef.current);
  } catch (e) {
    console.warn("[RECON] dvHistory archive failed:", e.message);
    // Non-fatal — reconciliation can proceed without archive
  }

  // 2. Replace active pages with new set (dropping old pages)
  const newPages = (pendingNewItemsRef.current || []);
  const ecoPages = (latestPanelRef.current.pages || []).filter(p => p.ecoId);
  const replacedPanel = {
    ...latestPanelRef.current,
    pages: [...newPages, ...ecoPages],  // new base pages + ECO pages preserved
    updatedAt: Date.now(),
  };
  onUpdate(replacedPanel);
  try { onSaveImmediate(replacedPanel); } catch (e) {}

  // 3. Extract to staging — same extraction pipeline, but onDone routes to staging
  setExtracting(true);
  const _reconProjectId = capturedProjectId;
  runExtractionTask(uid, capturedProjectId, replacedPanel, {
    projectName, bcProjectNumber,
    onDone: (extractedPanel, extractedBom) => {
      // #86: verify identity
      if (_currentProjectId !== _reconProjectId) {
        console.warn("[RECON] project changed during extraction — saving directly");
        // Fall back to direct Firestore save for original project
        return;
      }
      setExtracting(false);
      // Route to staging, NOT to panel.bom
      setReconStagedExtraction({
        items: extractedBom,     // raw post-pipeline extracted items
        pages: replacedPanel.pages,
        reason: "Drawing revision",
      });
      setShowReconciliation(true);
    },
    // stampFn same as existing
  });
  return;
}
```

**Critical ordering (MUST-ADDRESS #2):**
1. `archiveDvVersion()` — writes `_dvHistory` doc with CURRENT `panel.bom` + CURRENT `panel.pages` refs
2. Replace `panel.pages` with new drawing set
3. Extract over new pages to staging
4. Open modal — current edited BOM (still in `panel.bom`) vs staged extraction

The archive write carries `capturedProjectId` and `capturedPanelId` — #86 async-ownership compliance.

### Change D4 — `runExtractionTask` output adaptation

**Problem:** `runExtractionTask` (line 14036) currently writes the extracted BOM directly to `panel.bom` in its internal flow. For staging, we need the extracted items returned separately.

**Solution:** Add an optional `stagingMode` flag to the task options. When true, the `onDone` callback receives the extracted BOM array as a second parameter instead of it being written to the panel.

**File:** `src/app.jsx`  
**Function:** `runExtractionTask()` (line 14036)

At the point where the BOM is finalized (end of the post-processing pipeline, around line 24946 in `runExtraction` — the equivalent point in `runExtractionTask` is line 14546 area):

```js
// After applyLearnedCorrections, sortBomByDrawingPosition, splitCompanionParts, etc.
if (cbs.stagingMode) {
  // Return extracted items to caller without writing to panel
  cbs.onDone(panel, finalBom);
  return;
}
// else: existing flow — write to panel.bom, save, auto-price
```

**Note for Marc:** The exact line where the BOM finalizes inside `runExtractionTask` needs careful tracing — the function has several branches. The key principle: intercept after the full post-processing pipeline (dedup, corrections, crosses, companion split, suspect qty flagging) but before the `panel.bom = bom` assignment.

---

## Phase E — Reconciliation Modal

### Change E1 — `ReconciliationModal` component

**File:** `src/app.jsx`  
**Location:** After `BomApprovalPortalPage` or near `EcoEditor` (line 16521) — same area as other full-screen modals.

**Props:**
```js
function ReconciliationModal({
  currentBom,        // the user's current edited BOM (panel.bom)
  stagedExtraction,  // { items, pages, reason }
  panel,             // current panel object (for metadata)
  onCommit,          // (mergedBom) => void — writes to panel.bom + saves
  onCancel,          // () => void — discard staged extraction, no changes
}) { ... }
```

### Change E2 — Internal state

```js
const [matchResult, setMatchResult] = useState(null);
const [resolutions, setResolutions] = useState(new Map());
// key format: "unchanged:idx", "changed:idx", "deleted:idx", "added:idx"
// value: null (unresolved) | "accepted" | "rejected" | "deleted" | "kept"
```

On mount, run the match engine:
```js
useEffect(() => {
  const result = reconcileBom(currentBom, stagedExtraction.items);
  setMatchResult(result);
  // Pre-resolve UNCHANGED rows (they don't block commit)
  const initial = new Map();
  result.unchanged.forEach((_, i) => initial.set(`unchanged:${i}`, "accepted"));
  setResolutions(initial);
}, []);
```

### Change E3 — Gated commit logic

```js
const unresolvedCount = useMemo(() => {
  if (!matchResult) return Infinity;
  let count = 0;
  matchResult.changed.forEach((_, i) => { if (!resolutions.get(`changed:${i}`)) count++; });
  matchResult.added.forEach((_, i) => { if (!resolutions.get(`added:${i}`)) count++; });
  matchResult.deleted.forEach((_, i) => { if (!resolutions.get(`deleted:${i}`)) count++; });
  return count;
}, [matchResult, resolutions]);

const canCommit = unresolvedCount === 0;
```

**Commit button** disabled while `unresolvedCount > 0`. Running count displayed: `"{unresolvedCount} unresolved — resolve all to commit"`.

### Change E4 — Row rendering

**Table columns** (per Brief):

| Line # | New Part# | New Qty | Prior Part# | Prior Qty | Description | Action |
|--------|-----------|---------|-------------|-----------|-------------|--------|

**Row state rendering:**

- **UNCHANGED** — muted row, no action needed. Both new and prior shown, values identical. No action button (pre-resolved).
- **CHANGED** — highlighted amber. New vs prior side-by-side. D1 indicator: "PN unchanged, qty changed" or "PN changed". **Accept** button.
- **DELETED** — highlighted red. No new line number. Prior values shown. **Delete** / **Keep** buttons (both explicit — per Brief, destructive either way, resolved individually).
- **NEW** — highlighted green. New values shown, prior columns empty. **Accept** / **Reject** buttons.

**Accept All button:** Resolves all CHANGED + NEW rows at once. DELETED rows excluded (per Brief: "no Accept-All shortcut" for deletions).

### Change E5 — Concurrent-save isolation (MUST-ADDRESS #3)

The modal operates on a **frozen snapshot** of `currentBom` taken at modal open. Background `onSnapshot` updates do NOT flow into the modal's working copy.

```js
// Capture immutable snapshot on mount
const frozenBom = useRef(JSON.parse(JSON.stringify(currentBom)));
```

**Why this works:**
- The modal is open for seconds to minutes. During this time, background saves (auto-save timers, BC sync, onSnapshot listener at line 36289) may update `panel.bom` in the parent's React state.
- The modal's `frozenBom` is immune to these updates — it's a deep copy taken at open time.
- On commit, the modal writes the merged BOM via `onCommit(mergedBom)`, which calls `onUpdate` + `onSaveImmediate`. The `saveProjectPanel` mutex (line 9066-9069) serializes the write.
- The save guards in `saveProjectPanel` (lines 9117-9146) merge page metadata (storageUrl, reviewNotes) from the Firestore copy, preventing the reconciliation commit from clobbering metadata that a background upload stamped.

**Race condition: background save during commit:**
- `saveProjectPanel` reads current Firestore state (line 9073) before writing. If a background save landed between modal open and commit, the Firestore state includes background changes.
- The reconciliation commit writes its merged BOM. Background BOM changes (if any) are overwritten — this is correct because the user explicitly reviewed and resolved every row in the modal.
- Page metadata (storageUrl, reviewNotes, reviewShapes) is preserved by the existing per-page guards (lines 9117-9146).

**What if the user closes and reopens the panel during reconciliation?**
- The modal is a child of `PanelCard`. If the user navigates away, the modal unmounts and staged extraction is lost.
- `reconStagedExtraction` state lives in `PanelCard` — it survives React re-renders but not unmounts.
- To prevent accidental loss: the modal's Cancel button shows a confirmation dialog: "Discard reconciliation? You'll need to re-drop the drawings."

### Change E6 — Commit handler

Called when user clicks Commit (all rows resolved):

```js
function handleCommit() {
  const mergedBom = buildReconciledBom(matchResult, resolutions, frozenBom.current);
  onCommit(mergedBom);
}
```

In PanelCard, `onCommit`:

```js
function handleReconciliationCommit(mergedBom) {
  const updated = {
    ...latestPanelRef.current,
    bom: mergedBom,
    updatedAt: Date.now(),
    // Clear stale derived data — same as runExtraction line 24788-24794
    laborData: null,
    validation: null,
    bomVerification: null,
    bomAudit: null,
    extractionReport: null,
  };
  latestPanelRef.current = updated;
  onUpdate(updated);
  try { onSaveImmediate(updated); } catch (e) {}
  setShowReconciliation(false);
  setReconStagedExtraction(null);
  // Dv bump fires automatically in saveProjectPanel via _bumpBomVersionIfChanged
  // (line 9154 calls it when BOM hash changes)

  // Phase F: trigger post-commit pipeline for NEW + PN-CHANGED rows
  // ... see Change F1
}
```

---

## Phase F — Post-Commit Pipeline + Integration Wiring

### Change F1 — Post-commit enrichment for new/changed rows

**File:** `src/app.jsx`  
**Location:** Inside `handleReconciliationCommit()`, after the save

NEW rows and PN-CHANGED rows need the same enrichment pipeline that initial extraction applies (lines 24918-24946):

1. `applyPartCorrections()` — library suggestions
2. `applyLearnedCorrections()` — user's Correction DB + crosses/alternates
3. `splitCompanionParts()` — companion part splitting
4. `flagSuspectQuantities()` — suspect qty heuristics

```js
// Identify rows that need enrichment (NEW + PN-CHANGED)
const enrichmentRowIds = new Set();
matchResult.added.forEach((_, i) => {
  if (resolutions.get(`added:${i}`) === "accepted") {
    const row = mergedBom.find(r => /* match by the newly assigned ID */);
    if (row) enrichmentRowIds.add(row.id);
  }
});
matchResult.changed.forEach((m, i) => {
  if (resolutions.get(`changed:${i}`) === "accepted" && m.reason === "pn_changed") {
    enrichmentRowIds.add(m.prior.id);
  }
});

if (enrichmentRowIds.size > 0) {
  // Run enrichment on just the new/changed rows
  const toEnrich = mergedBom.filter(r => enrichmentRowIds.has(r.id));
  const enriched = await applyLearnedCorrections(toEnrich, uid, {});
  // Merge enriched rows back into the full BOM
  const enrichedMap = new Map(enriched.bom.map(r => [r.id, r]));
  const finalBom = mergedBom.map(r => enrichedMap.get(r.id) || r);
  // Save the enriched version
  const enrichedPanel = { ...latestPanelRef.current, bom: finalBom };
  onUpdate(enrichedPanel);
  try { onSaveImmediate(enrichedPanel); } catch (e) {}
}
```

### Change F2 — Auto-price trigger

After enrichment, trigger BC pricing for rows that have no price:

```js
// Same pattern as runExtraction completion (line 24996-25027)
// Fire pricing in background — non-blocking
setTimeout(() => {
  if (latestPanelRef.current.bom?.some(r => !r.isLaborRow && !r.unitPrice)) {
    runPricingOnPanel(/* same args as existing auto-price trigger */);
  }
}, 500);
```

### Change F3 — `qvHistory` logging

Add a `_logQvHistory` entry on reconciliation commit:

```js
_logQvHistory(projectId, {
  type: "reconciliation",
  panelId: panel.id,
  panelName: panel.name || "",
  unchanged: matchResult.unchanged.length,
  changed: matchResult.changed.length,
  deleted: matchResult.deleted.filter((_, i) => resolutions.get(`deleted:${i}`) === "deleted").length,
  added: matchResult.added.filter((_, i) => resolutions.get(`added:${i}`) === "accepted").length,
  kept: matchResult.deleted.filter((_, i) => resolutions.get(`deleted:${i}`) === "kept").length,
  rejected: matchResult.added.filter((_, i) => resolutions.get(`added:${i}`) === "rejected").length,
});
```

### Change F4 — Wiring the modal render

**File:** `src/app.jsx`  
**Location:** In `PanelCard`'s return JSX, alongside other modal portals

```jsx
{showReconciliation && reconStagedExtraction && (
  <ReconciliationModal
    currentBom={(latestPanelRef.current.bom || []).filter(r => !r.isLaborRow)}
    stagedExtraction={reconStagedExtraction}
    panel={latestPanelRef.current}
    onCommit={handleReconciliationCommit}
    onCancel={() => {
      // Restore original pages (before revision drop replaced them)
      // The archive in _dvHistory preserves the original page refs;
      // the user can re-drop if they cancelled accidentally.
      setShowReconciliation(false);
      setReconStagedExtraction(null);
    }}
  />
)}
```

**Cancel behavior note:** When the user cancels, the staged extraction is discarded. However, the page replacement (Change D3 step 2) has already been saved to Firestore. The panel now has the NEW pages but the OLD BOM — an inconsistent state.

**Recovery options:**
1. **Re-extract via the existing "Re-Extract Drawings" button** — uses the new pages, replaces BOM entirely.
2. **Restore via "↩ Restore" button** — the pre-reconciliation snapshot (from `saveSnapshot` or `_dvHistory`) has the old BOM. Combined with manually re-adding old drawings if needed.
3. **Re-drop the same revised drawings** — triggers reconciliation flow again.

**Recommendation for Marc:** Show a warning in the Cancel confirmation dialog: "Pages have already been updated. The existing BOM will remain but may not match the new drawings. You can re-drop files to try again, or use Re-Extract for a clean start."

---

## Deploy Mechanics

Single deploy: `bash deploy.sh` (hosting + auto-version-bump). Plus `firebase deploy --only firestore:rules` for the `_dvHistory` rules (Change A3).

Rules first (so `_dvHistory` writes succeed when the new code fires). Same rationale as #137 Phase 1.

No Cloud Functions changes in this feature.

---

## Test Criteria

### T1 — Fresh extraction (no regression)
Drop drawings on a panel with NO existing BOM. Verify: standard flow (page detection → confirm → extract → BOM created). No reconciliation modal. No `_dvHistory` doc created.

### T2 — Revision drop triggers reconciliation
Panel with existing extracted + edited BOM. Drop new drawings. Verify:
- Pages are replaced (old thumbnails gone, new ones visible)
- Extraction runs over new pages only
- Reconciliation Modal opens (not the standard extraction-complete state)
- Current edited BOM shown in "Prior" columns
- New extraction shown in "New" columns

### T3 — `_dvHistory` archive written before reconciliation
After T2, before committing in the modal, check Firestore: `_dvHistory/{dvVersion}` doc should exist with the PRIOR Dv's BOM + `pageRefs` pointing to the old drawing Storage URLs.

### T4 — UNCHANGED rows carry edit-work
Row with `bcMatchType:"exact"`, `priceSource:"bc"`, `unitPrice` set, `bcVendorName` set, `leadTimeDays` set, `isCrossed:true`. After reconciliation (same PN + same Qty = UNCHANGED), verify ALL those fields survive on the committed row. Verify `confidence` and `_confDowngradeReason` are cleared (explicit clear-list).

### T5 — CHANGED row (qty only, PN same) carries D1 fields
Row with cross (`isCrossed`, `crossedFrom`). New extraction has same PN but different qty. Accept the change. Verify: cross fields carried, qty updated from new extraction. Price + BC data carried.

### T6 — CHANGED row (PN changed) clears D1 fields
Row with cross + BC pricing. New extraction has different PN at same position. Accept. Verify: cross fields cleared, BC pricing cleared, lead time cleared. Row effectively becomes a new item. Post-commit pipeline applies corrections + crosses from Correction DB.

### T7 — NEW row accepted
New extraction has a row not in current BOM. Accept it. Verify: row appears in committed BOM with fresh ID. Post-commit pipeline applies learned corrections and crosses. Auto-pricing triggers.

### T8 — NEW row rejected
Reject a NEW row. Verify: row does NOT appear in committed BOM.

### T9 — DELETED row deleted
Prior BOM row not in new extraction. Delete it. Verify: row is removed from committed BOM.

### T10 — DELETED row kept
Keep a deleted row. Verify: row is retained in committed BOM (at the end of the BOM, after extraction-ordered rows).

### T11 — Accept All resolves CHANGED + NEW
Multiple CHANGED and NEW rows. Click Accept All. Verify: all resolved. DELETED rows remain unresolved (Accept All does not touch them). Commit is still gated on DELETED rows.

### T12 — Gated commit blocks until all resolved
Open modal with CHANGED + NEW + DELETED rows. Verify Commit button is disabled. Resolve all CHANGED + NEW (via Accept All). Commit still disabled (DELETED unresolved). Resolve each DELETED row individually. Commit enables.

### T13 — Dv bump on commit
Check `panel.bomVersion` before and after reconciliation commit. If any PN or Qty changed, Dv should bump by 1. If only UNCHANGED rows (identical BOM), Dv should NOT bump.

### T14 — Cancel discards staged extraction
Open reconciliation modal. Cancel (confirm the warning). Verify: `reconStagedExtraction` is null. Panel retains its current BOM. New pages are on the panel (page replacement already happened).

### T15 — Concurrent save isolation
While reconciliation modal is open, trigger a background save (e.g., BC lead-time writeback, auto-save timer). Verify: modal's row data does NOT change. Commit writes the user's reconciled BOM, not the background-modified one. Page metadata (storageUrl, reviewNotes) from the background save is preserved via `saveProjectPanel` guards.

### T16 — PREVIOUS VERSIONS modal
After T2's commit, click "Previous Versions" next to the Dv pill. Verify: shows one entry for the prior Dv with the old drawing thumbnails (from `pageRefs.storageUrl`) and the old BOM table.

### T17 — Labor/ECO/contingency passthrough
Panel with labor rows, ECO-tagged rows, and auto-loaded contingency rows. Drop revised drawings + reconcile. Verify: all three categories pass through unchanged in the committed BOM. They do not appear in the reconciliation modal's match list.

### T18 — Duplicate PN disambiguation
BOM with two rows for the same part number (e.g., wire in two colors — same PN, different descriptions). New extraction also has two rows for that PN. Verify: positional disambiguation matches each to the correct prior row. Both appear as UNCHANGED (if qty matches) or CHANGED (if qty differs).

### T19 — Corrected-PN fallback match (Pass 2)
Prior BOM row where user corrected the PN (has `isCorrection:true`, `correctionFrom`). New extraction has the original (uncorrected) PN at a similar position. Verify: Pass 2 catches this as CHANGED (reason: `"pn_changed"`), not Delete+Add.

### T20 — #86 async-ownership
Start a revision drop on Project A. Navigate to Project B before extraction completes. Verify: extraction results do NOT write to Project B. Completion handler detects the mismatch (`_currentProjectId !== _reconProjectId`) and saves directly to Project A's Firestore doc.

---

## Risks Surfaced During Planning

| Risk | Severity | Mitigation |
|------|----------|------------|
| **`runExtractionTask` refactor for staging mode** | Medium | The function has multiple internal branches (batch vs per-page, validation, verification). Adding a `stagingMode` flag requires careful tracing of where the final BOM is written. Marc should trace the function end-to-end before modifying. |
| **Cancel leaves inconsistent state** (new pages, old BOM) | Medium | Documented in Change F4. The existing Re-Extract and Restore buttons provide recovery. Warning dialog informs the user. |
| **`confirmAndExtract` is already complex** (~160 lines) | Low | The interception adds a single `if (isRevisionDrop) { ... return; }` early-exit. The revision flow is a separate code path, not interleaved with the existing logic. |
| **Post-commit enrichment timing** | Low | `applyLearnedCorrections` is async and may take 1-2s for large BOMs. The enrichment save happens after the initial commit save — two sequential saves. If the second save fails, the BOM has the user's resolutions but without auto-corrections on new rows. User can re-trigger via "Refresh Pricing" button. |
| **Large BOM reconciliation modal scroll performance** | Low | 200-row BOM renders as a flat table with ~6 columns. No virtualization needed at this scale. If >500 rows becomes common, add windowing in v2. |

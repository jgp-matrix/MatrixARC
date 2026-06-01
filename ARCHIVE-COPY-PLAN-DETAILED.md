# ARCHIVE-COPY-PLAN-DETAILED.md (Milestone E)

**Version:** 1.0  
**Date:** 2026-06-01  
**Author:** Coach (Senior Development Engineer, Architecture)  
**Input documents:** ARCHIVE-COPY-BRIEF.md v1.0, ARCHIVE-COPY-PLAN-SUPPLEMENT.md v1.0, ARCHIVE-COPY-PLAN-ANALYST-REVIEW.md v1.0

---

## 1. EXECUTIVE SUMMARY

Milestone E adds "Copy to New Quote" for active projects, with ECO flattening into base BOMs. The existing `copyProject` function (line 9897) and `CopyProjectModal` (line 41557) are enhanced — this is modification work, not greenfield. No BC calls during copy (Firestore-local operation). Three phases: ECO flatten utility, copyProject enhancement + modal upgrade, polish.

---

## 2. ACTION ITEM RESOLUTIONS

Three action items from the Analyst Review, resolved before planning:

### AI-1: copyProject callers (Analyst Rec. 2)

**Finding:** Only one caller — `CopyProjectModal` at line 41568. No other code path calls `copyProject`.

**Decision:** Enhance in place. No wrapper function or parameter flag needed.

### AI-2: getNextQuoteNumber atomicity (Analyst Risk 1)

**Finding:** Already uses `fbDb.runTransaction` (line 2223). Atomic increment with `Math.max(stored, 202000)` floor. Two concurrent copies will get sequential numbers. No risk.

### AI-3: Quote number absence assumptions (Analyst Decision 2)

**Finding:** Only one code path checks for absent quote number — the print handler at line 34962:
```js
if(!proj.quote?.number||!/^MTX-Q\d{6}$/.test(String(proj.quote.number))){
```
This auto-assigns on first print. Having a quote number pre-assigned from copy causes this guard to safely skip. No downstream issues found.

Additionally, `saveProject` at line 8567-8569 seeds `quoteRev:1` for new projects. A copied project with a pre-assigned quote number will get `quoteRev:1, quoteRevAtPrint:0` — correctly showing as "unsent" on the kanban card (line 44218). This is correct behavior for a never-printed project.

---

## 3. PHASING

Three phases, each independently deployable:

| Phase | Name | Scope | Est. LOC |
|-------|------|-------|----------|
| **1** | ECO Flatten Utility | `flattenEcosIntoBom` + `flattenEcosLabor` + `computeLaborEstimate` bridge | ~70 |
| **2** | Copy Enhancement | Rewrite `copyProject` + enhance `CopyProjectModal` with preview/warning/progress | ~200 |
| **3** | Polish | Edge cases from smoke test, button label, field exclusion gaps | ~30 |

---

## 4. PHASE 1 — ECO FLATTEN UTILITY

### 4.1 New Function: `flattenEcosIntoBom`

**Location:** After `_ecosUpTo` (line 835), near the existing ECO computation helpers.

**Signature:**
```js
function flattenEcosIntoBom(panel, ecoSummary)
```

**Returns:** `Array<BomRow>` — flat BOM with ECO operations applied and ECO metadata stripped.

**Algorithm:**

```js
function flattenEcosIntoBom(panel, ecoSummary) {
  const baseRows = (panel.bom || []).filter(r => !r.ecoTag && !r.isLaborRow);
  const baseMap = new Map(baseRows.map(r => [r.id, {...r}]));
  
  const sortedEcos = (ecoSummary || [])
    .slice()
    .sort((a, b) => (+a.number || 0) - (+b.number || 0));
  
  for (const eco of sortedEcos) {
    const ecoRows = (panel.bom || [])
      .filter(r => r.ecoTag === eco.ecoId && !r.isLaborRow);
    
    for (const row of ecoRows) {
      if (row.ecoOp === "add") {
        // Append as new base row — strip ECO fields, assign new ID
        const clean = _stripEcoFields(row);
        baseMap.set(clean.id, clean);
        
      } else if (row.ecoOp === "remove") {
        // Delete the targeted base row
        if (row.ecoModifiesBaseRowId) {
          baseMap.delete(row.ecoModifiesBaseRowId);
        }
        // Orphaned reference (Risk 2): silently skip if base row already gone
        
      } else if (row.ecoOp === "modify") {
        const base = baseMap.get(row.ecoModifiesBaseRowId);
        if (!base) continue; // Base removed by prior ECO — skip
        
        const orig = row.ecoOriginal || {};
        const merged = {...base};
        
        // Qty is a signed delta. qty===0 means "no qty change" (line 24070)
        if ((+row.qty || 0) !== 0) {
          merged.qty = (+base.qty || 0) + (+row.qty || 0);
        }
        
        // Other fields: if changed from original, take the ECO value
        for (const f of ["partNumber", "description", "manufacturer", "unitPrice"]) {
          if ((row[f] ?? "") !== (orig[f] ?? "")) {
            merged[f] = row[f];
          }
        }
        
        baseMap.set(base.id, merged);
      }
    }
  }
  
  return Array.from(baseMap.values());
}
```

**Helper — `_stripEcoFields`:**
```js
function _stripEcoFields(row) {
  const clean = {...row};
  delete clean.ecoTag;
  delete clean.ecoNumber;
  delete clean.ecoOp;
  delete clean.ecoModifiesBaseRowId;
  delete clean.ecoOriginal;
  delete clean.ecoCreatedAt;
  delete clean.restoreSkipped;
  // New unique ID
  clean.id = `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return clean;
}
```

### 4.2 New Function: `flattenEcosLabor`

**Problem:** ECO labor rows store SIGNED DELTA HOURS (e.g., CUT +2hrs). But `laborData.overrides` stores device COUNTS (e.g., wireCount: 50), not hours. You can't add hours to counts — the conversion is lossy because it depends on rates.

**Solution:** Add a `laborData.ecoFlattenAdded` field and bridge it into `computeLaborEstimate`.

**Signature:**
```js
function flattenEcosLabor(panel, ecoSummary)
```

**Returns:** `{cut: number, layout: number, wire: number}` — cumulative ECO labor deltas in hours per category.

**Algorithm:**
```js
function flattenEcosLabor(panel, ecoSummary) {
  const deltas = {cut: 0, layout: 0, wire: 0};
  if (!ecoSummary || ecoSummary.length === 0) return deltas;
  
  const ecoLaborRows = (panel.bom || []).filter(r => r.isLaborRow && r.ecoTag);
  for (const r of ecoLaborRows) {
    const desc = (r.description || "").toUpperCase();
    const hrs = Number(r.qty) || 0;
    if (desc === "CUT") deltas.cut += hrs;
    else if (desc === "LAYOUT") deltas.layout += hrs;
    else if (desc === "WIRE") deltas.wire += hrs;
  }
  
  // Clamp to prevent negative labor (Risk area S8.5 #3)
  deltas.cut = Math.max(deltas.cut, -999);
  deltas.layout = Math.max(deltas.layout, -999);
  deltas.wire = Math.max(deltas.wire, -999);
  
  return deltas;
}
```

### 4.3 Bridge: `computeLaborEstimate` Enhancement

**Location:** Line 733, after the group hours calculation.

**Change:** 3 lines added after the group computation, before the return.

```js
// Before (existing):
const groups = {
  cut:    {hours: Math.ceil(cutHrs),    cost: Math.ceil(cutHrs)    * laborRate},
  layout: {hours: Math.ceil(layoutHrs), cost: Math.ceil(layoutHrs) * laborRate},
  wire:   {hours: Math.ceil(wireHrs),   cost: Math.ceil(wireHrs)   * laborRate}
};

// After (add between groups computation and totalHours):
const ecoFlat = ld.ecoFlattenAdded || {};
if (ecoFlat.cut)    { groups.cut.hours    = Math.max(0, groups.cut.hours    + ecoFlat.cut);    groups.cut.cost    = groups.cut.hours    * laborRate; }
if (ecoFlat.layout) { groups.layout.hours = Math.max(0, groups.layout.hours + ecoFlat.layout); groups.layout.cost = groups.layout.hours * laborRate; }
if (ecoFlat.wire)   { groups.wire.hours   = Math.max(0, groups.wire.hours   + ecoFlat.wire);   groups.wire.cost   = groups.wire.hours   * laborRate; }
```

This is backward-compatible: `ecoFlattenAdded` is absent on all existing projects, so the `|| {}` default makes the three `if` checks no-ops.

### 4.4 Phase 1 Verification

- Unit-verify `flattenEcosIntoBom` with a project that has ECOs (use an existing project from the live DB — read-only).
- Check: base rows preserved, add rows appended, remove rows deleted, modify rows applied.
- Check: ECO metadata fields stripped from all output rows.
- Check: labor deltas computed correctly per category.
- Check: `computeLaborEstimate` returns correct totals when `ecoFlattenAdded` is present.

---

## 5. PHASE 2 — COPY ENHANCEMENT

### 5.1 Rewrite `copyProject` (line 9897-9969)

**Existing function replaced.** Same name, same signature, new internals.

**New signature:**
```js
async function copyProject(uid, sourceProject, onProgress)
```

**New step sequence:**

| Step | Name | Description |
|------|------|-------------|
| 1 | Quote number | `getNextQuoteNumber(uid)` — atomic, pre-save |
| 2 | Flatten ECOs | Per panel: `flattenEcosIntoBom` + `flattenEcosLabor` |
| 3 | Build panels | Deep clone panels with flattened BOMs, new IDs, laborData with ecoFlattenAdded |
| 4 | Build project | Construct new project doc with field exclusions (§5.2) |
| 5 | Save | `saveProject(uid, newProject)` |
| 6 | Copy images | Per page: download from source, upload to new project |
| 7 | Re-save | `saveProject` with updated storageUrls |
| 8 | Done | Return new project |

**Pseudocode:**
```js
async function copyProject(uid, sourceProject, onProgress) {
  const pp = onProgress || (() => {});
  const src = sourceProject;
  const srcPanels = src.panels || [];
  const ecoSummary = src.ecoSummary || [];
  
  // Step 1: Quote number
  pp({step: "quote", msg: "Assigning quote number…", pct: 5});
  const quoteNumber = await getNextQuoteNumber(uid);
  
  // Step 2: Flatten ECOs
  pp({step: "flatten", msg: "Flattening ECOs…", pct: 10});
  const flattenedPanels = srcPanels.map(panel => {
    const flatBom = ecoSummary.length > 0
      ? flattenEcosIntoBom(panel, ecoSummary)
      : (panel.bom || []).filter(r => !r.isLaborRow).map(r => ({...r, id: `row-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}));
    
    const laborDeltas = ecoSummary.length > 0
      ? flattenEcosLabor(panel, ecoSummary)
      : {cut: 0, layout: 0, wire: 0};
    
    // Preserve base labor rows (non-ECO), strip ECO labor rows
    const baseLaborRows = (panel.bom || [])
      .filter(r => r.isLaborRow && !r.ecoTag)
      .map(r => ({...r, id: `row-${Date.now()}-${Math.random().toString(36).slice(2,8)}`}));
    
    const hasDeltas = laborDeltas.cut || laborDeltas.layout || laborDeltas.wire;
    const laborData = panel.laborData
      ? {...panel.laborData, ...(hasDeltas ? {ecoFlattenAdded: laborDeltas} : {})}
      : panel.laborData;
    
    return {
      ...panel,
      bom: [...flatBom, ...baseLaborRows],
      laborData,
    };
  });
  
  // Step 3: Build new panels with fresh IDs
  pp({step: "clone", msg: "Building panels…", pct: 20});
  const newPanels = flattenedPanels.map((panel, i) => {
    const newPages = (panel.pages || []).map(pg => ({
      ...pg,
      id: `pg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      dataUrl: undefined,
      storageUrl: undefined,
      _srcStorageUrl: pg.storageUrl || null,
      _srcPageId: pg.id,
    }));
    return {
      ...panel,
      id: `panel-${i + 1}`,
      pages: newPages,
      bomSyncHash: undefined,
      engineeringQuestions: undefined,
    };
  });
  
  // Step 4: Build project doc (field exclusion per §5.2)
  pp({step: "build", msg: "Building project…", pct: 30});
  const now = Date.now();
  const newProjectData = {
    name: src.name + " (Copy)",
    status: "draft",
    panels: newPanels,
    quote: {number: quoteNumber},
    ecoSummary: [],
    ecoCounter: 0,
    createdAt: now,
    updatedAt: now,
    // Note: saveProject adds id, schemaVersion, createdBy automatically
  };
  
  // Step 5: Save
  pp({step: "save", msg: "Saving project…", pct: 35});
  const newProj = await saveProject(uid, newProjectData);
  
  // Step 6: Copy images
  const allPages = newPanels.flatMap((panel, pi) =>
    (panel.pages || []).map((pg, pgi) => ({pi, pgi, pg}))
  );
  const totalPages = allPages.filter(x => x.pg._srcStorageUrl).length;
  let copied = 0;
  for (const {pi, pgi, pg} of allPages) {
    if (!pg._srcStorageUrl) continue;
    pp({step: "images", msg: `Copying drawing ${copied + 1}/${totalPages}…`,
        pct: 35 + Math.round((copied / Math.max(totalPages, 1)) * 45)});
    try {
      const loaded = await ensureDataUrl({storageUrl: pg._srcStorageUrl});
      if (loaded.dataUrl) {
        const newUrl = await uploadPageImage(uid, newProj.id, pg.id, loaded.dataUrl);
        newPanels[pi].pages[pgi].storageUrl = newUrl;
        newPanels[pi].pages[pgi].dataUrl = loaded.dataUrl;
      }
    } catch (e) {
      console.warn("Copy image failed for page", pg._srcPageId, e.message);
    }
    copied++;
  }
  // Clean up temp fields
  newPanels.forEach(panel =>
    (panel.pages || []).forEach(pg => { delete pg._srcStorageUrl; delete pg._srcPageId; })
  );
  
  // Step 7: Re-save with storage URLs
  pp({step: "save2", msg: "Saving images…", pct: 85});
  const finalProj = await saveProject(uid, {...newProj, panels: newPanels, updatedAt: Date.now()});
  
  pp({step: "done", msg: "Project copied!", pct: 100});
  return finalProj;
}
```

### 5.2 Field Exclusion (Applied in Step 4)

The new project doc is constructed from scratch (not spread from source), so excluded fields are excluded by omission. Only explicitly listed fields are copied.

**Fields INCLUDED:**

| Field | Value | Source |
|-------|-------|--------|
| `name` | `src.name + " (Copy)"` | Editable in modal |
| `status` | `"draft"` | Fixed |
| `panels` | Flattened clone | Built in steps 2-3 |
| `quote.number` | From `getNextQuoteNumber` | Step 1 |
| `ecoSummary` | `[]` | Fixed |
| `ecoCounter` | `0` | Fixed |
| `createdAt` | `Date.now()` | Fixed |
| `updatedAt` | `Date.now()` | Fixed |

**Fields EXCLUDED by omission** (everything not in the table above):

BC linkage (`bcProjectId`, `bcProjectNumber`, `bcEnv`), customer (`bcCustomerNumber`, `bcCustomerName`), quote metadata (`quoteRev`, `lastQuoteHash`, `quoteRevAtPrint`, `quote.company`, `quote.contact`, `quote.address`, `quote.salesperson`, `quote.prints`), ECO state (`activeEcoId`, `ecoEditUnlocked`, `ecoFirstCreatedAt`), review state (all `preReview*`, `postReview*`, `reviewRev` fields), purchasing (`bcPoStatus`, `poNumbers`), admin/lock (`ownerTakeoverActive`, `ownerLockActive`, `quotePrintLock`, `projectPresence`), archive refs (`_archiveComplete`, `archiveRefId`, `restoredFrom`, `restoredBy`, `restoredAt`, `restoreHistory`).

**Per-panel fields preserved:** `name`, `bom` (flattened), `pages` (structure), `laborData` (with ecoFlattenAdded), `validation`, `drawingNo`, `drawingDesc`, `drawingRev`, `pricing`, `complianceReview`.

**Per-panel fields stripped:** `bomSyncHash`, `engineeringQuestions`.

### 5.3 Enhance `CopyProjectModal` (line 41557-41609)

The current 52-line modal becomes a multi-view modal with preview → warning → progress → completion.

**Views:**

| View | Content |
|------|---------|
| `preview` | Editable name, source summary (panels, BOM rows, ECO count), flatten preview |
| `warning` | BOM scan results from `scanBomForArchiveIssues` — shown only if issues found |
| `progress` | Step list with arcPulse animation (shorter than restore — no BC steps) |
| `completion` | "Open New Project" button (or auto-open after 1s delay) |
| `failure` | Error detail (unlikely given no BC calls, but defensive) |

**Preview content:**
```
Source: PRJ402107 — Customer Panel Upgrade
Panels: 4
BOM items: 127 (after ECO flatten: 119 — 8 removals, 6 additions)
ECOs flattened: 3 (ECO 01, ECO 02, ECO 03)
Labor: CUT 12hrs, LAYOUT 8hrs, WIRE 22hrs (includes ECO adjustments)
Quote number: MTX-Q202045 (assigned on copy)
```

**Progress step list:**

| Step | Label |
|------|-------|
| 1 | Quote number assigned |
| 2 | ECOs flattened |
| 3 | Panels cloned |
| 4 | Saved to Firestore |
| 5 | Drawings copied |
| 6 | Complete |

Uses the same icon convention as RestorePreviewModal: ⏳ (active, arcPulse), ✅ (complete), ○ (pending), ❌ (failed).

**Pre-copy BOM warning:**

Run `scanBomForArchiveIssues` (line 8989) against the flattened panels BEFORE the user confirms. If issues found, show `arcConfirm` with the same warning text pattern as the archive handler (line 44699). User can cancel or proceed with acknowledgment.

**Implementation note:** The `scanBomForArchiveIssues` function accepts a project object (line 8989: `function scanBomForArchiveIssues(project)`). Pass `{panels: flattenedPanels}` to scan the flattened output. No signature change needed.

### 5.4 Auto-Open Behavior (Analyst Risk 3)

After `copyProject` returns, the new project object is already in memory (returned from `saveProject`). Navigation sets this as the open project via `handleOpen(newProj)` — no Firestore round-trip needed.

**Current wiring (line 44666):**
```js
onCopied={p => { setCopyProject(null); setProjects(ps => [p, ...ps]); handleOpen(p); }}
```

This already auto-opens. The `handleOpen` call uses the in-memory project object, so there's no Firestore propagation delay. Risk 3 is a non-issue with the current architecture.

**Enhancement:** Add a 500ms delay between the "Complete" view and auto-navigation, so the user sees the success state before the view switches.

### 5.5 Lock Strategy (Analyst Rec. 4)

**No lock needed.** Rationale:

1. The copy operation is Firestore-local — no BC calls, no external state to coordinate.
2. Two simultaneous copies of the same source produce two independent new projects with different quote numbers (guaranteed by `getNextQuoteNumber` transaction). They don't conflict.
3. The source project is read-only during copy — no mutations to coordinate.
4. `saveProject` handles new-doc creation atomically (Firestore `add` or `set` on a new ref).

The full `acquireRestoreLock` pattern is unnecessary. If a future requirement adds BC calls during copy, a lock can be added then.

---

## 6. PHASE 3 — POLISH

### 6.1 Button Label

Change "⧉ Copy" to "⧉ Copy to New Quote" at line 32512 per Brief terminology.

### 6.2 Smoke Test Checklist

| Test | Expected |
|------|----------|
| Copy project with 0 ECOs | BOM copied as-is, no flatten artifacts |
| Copy project with 1 ECO (add + remove + modify) | Flattened correctly, ECO metadata stripped |
| Copy project with 3 ECOs, cumulative modifications | Sequential application, final state correct |
| Copy project with ECO that removes a row modified by a later ECO | Remove wins (sequential), no orphan crash |
| Copy project with ECO labor deltas | Labor hours include ECO adjustments |
| Copy project with BOM integrity issues | Warning shown before copy, acknowledgment logged |
| Copy project with no images | Copy completes (image step skipped) |
| Two simultaneous copies | Both get unique quote numbers, both succeed |
| Open copied project | All panels render, BOMs display correctly, labor totals correct |
| Print quote on copied project | Quote number already assigned, no auto-assign trigger |

### 6.3 Edge Cases Discovered During Testing

Reserve this section for findings from smoke testing. Jon will route observations here for ARC Dev to address.

---

## 7. RISK MATRIX

| # | Risk | Severity | Mitigation | Status |
|---|------|----------|------------|--------|
| R1 | Duplicate quote numbers | High | `getNextQuoteNumber` uses Firestore transaction — verified atomic | **Resolved** |
| R2 | Orphaned ECO references | Medium | Flatten silently skips missing base rows, console.warn | **Handled in algorithm** |
| R3 | Auto-open race condition | Low | Uses in-memory project object, no Firestore round-trip | **Non-issue** |
| R4 | Field exclusion gaps | Medium | Build-from-scratch pattern (include-list, not exclude-list) + Phase 3 polish | **Mitigated** |
| R5 | ECO labor hours → counts mismatch | Medium | New `ecoFlattenAdded` field + 3-line `computeLaborEstimate` bridge | **Handled in Phase 1** |
| R6 | `quoteRev` auto-bump on first save | Low | `saveProject` seeds `quoteRev:1` for new projects — correct behavior | **Non-issue** |

---

## 8. FILE/LINE REFERENCE INDEX

| Item | Location |
|------|----------|
| `copyProject` function | `src/app.jsx:9897-9969` |
| `CopyProjectModal` | `src/app.jsx:41557-41609` |
| Copy button in project view | `src/app.jsx:32511-32512` |
| `onCopy` prop wiring | `src/app.jsx:44699` |
| `CopyProjectModal` render | `src/app.jsx:44666` |
| `copyProject_` state | `src/app.jsx:43419` |
| `getNextQuoteNumber` | `src/app.jsx:2220-2231` |
| `scanBomForArchiveIssues` | `src/app.jsx:8989-9008` |
| `computeLaborEstimate` | `src/app.jsx:634-745` |
| Labor group computation | `src/app.jsx:730-737` |
| ECO computation helpers | `src/app.jsx:763-835` |
| ECO BOM row creation (add) | `src/app.jsx:15620-15647` |
| ECO modify row creation | `src/app.jsx:24054-24089` |
| ECO remove row creation | `src/app.jsx:24095-24129` |
| `ecoSummary` creation | `src/app.jsx:14875-14889` |
| `ecoModifiesBaseRowId` usage | `src/app.jsx:24060, 24068, 24114` |
| `ecoOriginal` shape | `src/app.jsx:24076-24084` |
| arcPulse animation | Used in RestorePreviewModal line 41390 |
| `saveProject` new-doc seed | `src/app.jsx:8567-8569` |
| Quote number absence check | `src/app.jsx:34962` |

---

## 9. OPEN QUESTIONS

None. All Brief questions answered in Supplement; all Analyst action items resolved above.

---

## REVISION HISTORY

- v1.0 (2026-06-01) — Initial detailed plan, three phases

# ARCHIVE-COPY-PLAN-DETAILED.md (Milestone E)

**Version:** 2.1  
**Date:** 2026-06-01  
**Author:** Coach (Senior Development Engineer, Architecture)  
**Input documents:** ARCHIVE-COPY-BRIEF.md v1.0→1.2, ARCHIVE-COPY-PLAN-SUPPLEMENT.md v1.0, ARCHIVE-COPY-PLAN-ANALYST-REVIEW.md v1.0

---

## 1. EXECUTIVE SUMMARY

Milestone E adds "Copy to New Quote" for active projects, with ECO flattening into base BOMs. The existing `copyProject` function (line 9969) and `CopyProjectModal` (line 41650) are enhanced — this is modification work, not greenfield.

**v2.0 scope change:** BC project creation + planning line sync added to the copy operation (Jon's decision after smoke testing — projects without BC linkage created immediate workflow friction).

**v2.1 scope change:** Customer is NOT inherited from source. User selects customer via picker as the first step of the copy flow, matching the NewProjectModal pattern. Jon's clarification: customers cannot be changed on a BC project after creation, so the picker must come first.

Four phases: ECO flatten utility (**complete**), copyProject enhancement + modal upgrade (**complete**), BC project creation + planning line sync (**new**), polish.

---

## 2. ACTION ITEM RESOLUTIONS

Three action items from the Analyst Review, resolved before planning:

### AI-1: copyProject callers (Analyst Rec. 2)

**Finding:** Only one caller — `CopyProjectModal` at line 41704. No other code path calls `copyProject`.

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

Four phases, each independently deployable:

| Phase | Name | Scope | Est. LOC | Status |
|-------|------|-------|----------|--------|
| **1** | ECO Flatten Utility | `flattenEcosIntoBom` + `flattenEcosLabor` + `computeLaborEstimate` bridge | ~70 | **Complete** |
| **2** | Copy Enhancement | Rewrite `copyProject` + enhance `CopyProjectModal` with preview/warning/progress | ~200 | **Complete** |
| **3** | BC Integration | Customer picker + BC project creation + task structure + planning lines + retry | ~150 | **New** |
| **4** | Polish | Edge cases from smoke test, field exclusion gaps | ~30 | Renumbered from v1.0 Phase 3 |

---

## 4. PHASE 1 — ECO FLATTEN UTILITY (Complete)

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
        const clean = _stripEcoFields(row);
        baseMap.set(clean.id, clean);
        
      } else if (row.ecoOp === "remove") {
        if (row.ecoModifiesBaseRowId) {
          baseMap.delete(row.ecoModifiesBaseRowId);
        }
        
      } else if (row.ecoOp === "modify") {
        const base = baseMap.get(row.ecoModifiesBaseRowId);
        if (!base) continue;
        
        const orig = row.ecoOriginal || {};
        const merged = {...base};
        
        if ((+row.qty || 0) !== 0) {
          merged.qty = (+base.qty || 0) + (+row.qty || 0);
        }
        
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
const ecoFlat = ld.ecoFlattenAdded || {};
if (ecoFlat.cut)    { groups.cut.hours    = Math.max(0, groups.cut.hours    + ecoFlat.cut);    groups.cut.cost    = groups.cut.hours    * laborRate; }
if (ecoFlat.layout) { groups.layout.hours = Math.max(0, groups.layout.hours + ecoFlat.layout); groups.layout.cost = groups.layout.hours * laborRate; }
if (ecoFlat.wire)   { groups.wire.hours   = Math.max(0, groups.wire.hours   + ecoFlat.wire);   groups.wire.cost   = groups.wire.hours   * laborRate; }
```

Backward-compatible: `ecoFlattenAdded` is absent on all existing projects, so the `|| {}` default makes the three `if` checks no-ops.

### 4.4 Phase 1 Verification

- Unit-verify `flattenEcosIntoBom` with a project that has ECOs.
- Check: base rows preserved, add rows appended, remove rows deleted, modify rows applied.
- Check: ECO metadata fields stripped from all output rows.
- Check: labor deltas computed correctly per category.
- Check: `computeLaborEstimate` returns correct totals when `ecoFlattenAdded` is present.

---

## 5. PHASE 2 — COPY ENHANCEMENT (Complete)

### 5.1 Rewrite `copyProject` (line 9969)

**Existing function replaced.** Same name, same signature, new internals.

**Step sequence (v1.0 — Firestore-local only; v2.1 adds BC steps in §6):**

| Step | Name | Description |
|------|------|-------------|
| 1 | Quote number | `getNextQuoteNumber(uid)` — atomic, pre-save |
| 2 | Flatten ECOs | Per panel: `flattenEcosIntoBom` + `flattenEcosLabor` |
| 3 | Build panels | Deep clone panels with flattened BOMs, new IDs, laborData with ecoFlattenAdded |
| 4 | Build project | Construct new project doc with field exclusions (§5.2) |
| 5 | Save | `saveProject(uid, newProject)` |
| 6 | Copy images | Per page: download from source, upload to new project |
| 7 | Re-save | `saveProject` with updated storageUrls |
| 8+ | BC steps | See §6 |

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

**v2.1 note:** Customer fields (`bcCustomerNumber`, `bcCustomerName`) are NOT included in the initial project doc. They are written by the step 9a checkpoint (§6.4) after BC project creation, using the customer chosen in the picker — NOT from the source project.

**Fields EXCLUDED by omission** (everything not in the table above):

BC linkage (`bcProjectId`, `bcProjectNumber`, `bcEnv`), customer (`bcCustomerNumber`, `bcCustomerName`), quote metadata (`quoteRev`, `lastQuoteHash`, `quoteRevAtPrint`, `quote.company`, `quote.contact`, `quote.address`, `quote.salesperson`, `quote.prints`), ECO state (`activeEcoId`, `ecoEditUnlocked`, `ecoFirstCreatedAt`), review state (all `preReview*`, `postReview*`, `reviewRev` fields), purchasing (`bcPoStatus`, `poNumbers`), admin/lock (`ownerTakeoverActive`, `ownerLockActive`, `quotePrintLock`, `projectPresence`), archive refs (`_archiveComplete`, `archiveRefId`, `restoredFrom`, `restoredBy`, `restoredAt`, `restoreHistory`).

**Per-panel fields preserved:** `name`, `bom` (flattened), `pages` (structure), `laborData` (with ecoFlattenAdded), `validation`, `drawingNo`, `drawingDesc`, `drawingRev`, `pricing`, `complianceReview`.

**Per-panel fields stripped:** `bomSyncHash`, `engineeringQuestions`.

### 5.3 Enhance `CopyProjectModal` (line 41650)

The current modal is a multi-view modal with preview → warning → progress → done → error.

**v2.1 update: Modal navigation adds customer picker as first step.** See §6.3 for the new flow.

### 5.4 Auto-Open Behavior (Analyst Risk 3)

After `copyProject` returns, the new project object is already in memory (returned from `saveProject`). Navigation sets this as the open project via `handleOpen(newProj)` — no Firestore round-trip needed.

**Wiring (line 44903):**
```js
onCopied={p => { setCopyProject(null); setProjects(ps => [p, ...ps]); handleOpen(p); }}
```

Auto-opens after a 500ms delay so the user sees the "Complete" state before the view switches.

### 5.5 Lock Strategy

**No lock needed on the source project.** The source is read-only during copy. Two simultaneous copies of the same source produce independent new projects with different quote numbers. BC project creation uses the chosen customer number, not source-level state.

`relinkToBC` (line 34913) serves as the retry mechanism if BC steps fail after the Firestore project is created.

---

## 6. PHASE 3 — BC INTEGRATION (New in v2.0, revised v2.1)

### 6.1 Background

Jon's decision after smoke-testing v1.0: projects created by Copy had no BC project number, forcing the user to manually create a BC project before they could do anything productive. Every Copy should create a BC project + sync planning lines so the new project is immediately usable.

**v2.1 clarification:** Customers cannot be changed on a BC project after creation. Therefore, the user must select the customer BEFORE BC project creation, not inherit from source. This matches the NewProjectModal pattern where customer selection is the first required step.

### 6.2 Customer Handling (DECIDED — v2.1)

**Decision (Jon, v2.1):** Customer picker as first step of copy flow.

- Customer is NOT inherited from source project
- Customer is selected via the same picker UI as NewProjectModal
- Customer picker is the first view in the modal, before Preview
- If user cancels the customer picker, the whole copy cancels (no project created)
- Contact, address, salesperson remain NOT inherited (user fills in after copy)

This is the correct approach because:
1. BC projects are permanently tied to a customer — no post-creation change
2. The primary use case is "copy to a different customer" — inheritance would force an extra step
3. Matches the established NewProjectModal UX pattern

### 6.3 Phase 3a: Customer Picker Integration in CopyProjectModal

**Investigation: Is the existing customer picker reusable?**

The customer picker in `NewProjectModal` (line 39428) is **NOT a separate component**. It's ~80 lines of inline JSX + ~30 lines of state/functions embedded directly in the modal. The core elements:

**State variables (8):**
- `customerQuery`, `allCustomers`, `customerResults`, `customerSearching` — search/filter
- `selectedCustomer`, `showDropdown` — selection
- `showNewCust`, `newCustName`, `newCustPhone`, `newCustEmail`, `creatingCust`, `newCustErr` — inline customer creation

**Functions (5):**
- `loadCustomers` (line 39486) — calls `bcLoadAllCustomers()`, populates list
- `handleCustomerInput` (line 39549) — filters on keystroke via `bcFilterCustomers()`
- `selectCustomer` (line 39556) — sets state, auto-fetches contacts
- `createNewCustomer` (line 39565) — calls `bcCreateCustomer()`, refreshes list
- `connectBC` (line 39542) — `acquireBcToken(true)` then `loadCustomers()`

**BC helper functions (all top-level, reusable as-is):**
- `bcLoadAllCustomers` (line 3985) — fetches full customer list from BC
- `bcFilterCustomers` (line 4055) — client-side fuzzy filter
- `bcCreateCustomer` (line 4063) — creates new customer in BC
- `bcFetchCustomerContacts` (line 4084) — loads contacts for a customer

**JSX (~80 lines):**
- BC connect prompt (lines 39697-39704)
- Search input + dropdown (lines 39706-39733)
- "New Customer" inline form (lines 39684-39696)

**What CopyProjectModal does NOT need from NewProjectModal:**
- Salesperson/PM/Designer pickers (lines 39782-39795) — not relevant for copy
- Contact person picker (lines 39742-39781) — not relevant for copy
- Panel count selector — irrelevant (panels come from source)

**Reuse recommendation: Extract a shared `<CustomerPicker>` component.**

```jsx
function CustomerPicker({onSelect, onClear, autoFocus}) {
  // Internal state: customerQuery, allCustomers, customerResults, 
  //   customerSearching, selectedCustomer, showDropdown,
  //   showNewCust, newCust* fields
  // 
  // On mount: check _bcToken, call loadCustomers if connected
  // Renders: BC connect prompt OR search input + dropdown + "New Customer" form
  // Calls onSelect({number, displayName}) when customer is chosen
  // Calls onClear() when customer input is cleared
  //
  // ~120 lines total (state + functions + JSX)
}
```

**Benefits:**
- Reused by both `NewProjectModal` and `CopyProjectModal`
- Single source of truth for customer selection UX
- BC helper functions already top-level — no extraction needed for those

**Alternative (faster, less clean):** Duplicate the ~110 lines of state + JSX into CopyProjectModal. This is copy-paste but avoids refactoring NewProjectModal in the same PR. Phase 4 polish could extract the shared component later.

**Marc should choose based on timeline.** Extraction is ~30 min extra work but cleaner.

**CopyProjectModal new view flow:**

```
customer → preview → warning (if issues) → progress → done/error
```

| View | Trigger | Content |
|------|---------|---------|
| `customer` | Modal opens | Customer picker + project name input. "Next ▸" button (disabled until customer selected + name non-empty). |
| `preview` | "Next ▸" clicked | Source summary, ECO flatten preview, BOM scan. "Confirm Copy ▸" button (disabled until BC connected). |
| `warning` | BOM issues found | Same as current — acknowledgment required. |
| `progress` | Copy confirmed | Step list with arcPulse animation. |
| `done` | Copy successful | Auto-navigate to new project after 500ms. |
| `error` | Copy failed | Error detail + retry options (see §6.6). |

**Customer view layout:**
```
┌──────────────────────────────────────┐
│  📋 Copy to New Quote                │
│  Source: PRJ402107 — Panel Upgrade   │
│                                      │
│  PROJECT NAME                        │
│  ┌──────────────────────────────────┐│
│  │ Panel Upgrade (Copy)             ││
│  └──────────────────────────────────┘│
│                                      │
│  CUSTOMER (from Business Central)    │
│  ┌──────────────────────────────┐    │
│  │ Search by name or number…    │    │
│  └──────────────────────────────┘    │
│  [+ New Customer]                    │
│                                      │
│  ⚠ A customer is required...        │
│                                      │
│        [Cancel]  [Next ▸]            │
└──────────────────────────────────────┘
```

### 6.4 Phase 3b: BC Project Creation in copyProject

**New steps added to `copyProject` after the existing step 7 (re-save).**

The `customerNumber` is passed into `copyProject` as a new parameter:

**Updated signature:**
```js
async function copyProject(uid, sourceProject, customerNumber, customerName, onProgress)
```

**New step sequence (steps 8-12, appended after existing steps 1-7):**

| Step | Name | Description |
|------|------|-------------|
| 8 | BC connect | Verify `_bcToken` is live. If not, `acquireBcToken(true)`. |
| 9 | BC project | `bcCreateProject(newProj.name, customerNumber)` |
| 9a | Checkpoint | Persist `bcProjectNumber`, `bcProjectId`, `bcEnv`, `bcCustomerNumber`, `bcCustomerName` to Firestore |
| 10 | Task structure | `bcCreatePanelTaskStructure(bcProjectNumber, newProj.name, newPanels)` |
| 11 | Planning lines | `bcSyncPanelPlanningLines` per panel |
| 11a | bomSyncHash | Set `bomSyncHash` on each panel (prevents redundant auto-sync on open) |
| 12 | Done | Return new project with BC linkage |

**Pseudocode for new steps:**
```js
// Step 8: BC connect
pp({step: "bc-connect", msg: "Connecting to BC…", pct: 86});
if (!_bcToken) {
  const tok = await acquireBcToken(true);
  if (!tok) throw new Error("BC connection required — sign in and retry");
}

// Step 9: BC project creation
pp({step: "bc-project", msg: "Creating BC project…", pct: 88});
const bcResult = await bcCreateProject(finalProj.name, customerNumber);

// Step 9a: Checkpoint — persist BC linkage immediately
const projPath = _appCtx.projectsPath || ("users/" + uid + "/projects");
await fbDb.doc(projPath + "/" + finalProj.id).update({
  bcProjectNumber: bcResult.number,
  bcProjectId: bcResult.id,
  bcEnv: _bcConfig.env,
  bcCustomerNumber: customerNumber,
  bcCustomerName: customerName || null,
});
finalProj.bcProjectNumber = bcResult.number;
finalProj.bcProjectId = bcResult.id;
finalProj.bcEnv = _bcConfig.env;
finalProj.bcCustomerNumber = customerNumber;
finalProj.bcCustomerName = customerName || null;

// Step 10: Panel task structure (non-fatal)
pp({step: "bc-tasks", msg: "Creating panel tasks…", pct: 90});
try {
  await bcCreatePanelTaskStructure(bcResult.number, finalProj.name, newPanels);
} catch (e) {
  console.warn("Copy: task structure failed:", e.message);
}

// Step 11: Planning lines per panel (continue on per-panel failure)
for (let i = 0; i < newPanels.length; i++) {
  pp({step: "bc-planning",
      msg: `Syncing planning lines (panel ${i+1}/${newPanels.length})…`,
      pct: 90 + Math.round((i / Math.max(newPanels.length, 1)) * 8)});
  try {
    await bcSyncPanelPlanningLines(bcResult.number, i+1, newPanels[i],
      finalProj.name, {skipPostingGroupFix: true});
  } catch (e) {
    console.warn("Copy: planning lines failed panel", i+1, e.message);
  }
}

// Step 11a: bomSyncHash (Phase 2.1 F4 pattern — prevents auto-sync on open)
try {
  for (let i = 0; i < newPanels.length; i++) {
    newPanels[i].bomSyncHash = computePanelBomHash(newPanels[i]);
  }
  await fbDb.doc(projPath + "/" + finalProj.id).update({panels: newPanels});
} catch (e) {
  console.warn("Copy: bomSyncHash write failed (non-fatal):", e.message);
}

pp({step: "done", msg: "Project copied!", pct: 100});
return finalProj;
```

**Key design decisions:**

1. **Task structure failure is non-fatal.** Same as executeRestore step 6 (line 9786-9795).
2. **Planning line failure continues to next panel.** Same as executeRestore D2 (line 9815-9819).
3. **Checkpoint after BC project creation.** If anything after step 9 fails, bcProjectNumber is already persisted. `relinkToBC` available as retry.
4. **`skipPostingGroupFix: true`** — same as executeRestore (line 9808).
5. **customerNumber comes from the picker, NOT the source project.** The `startCopy` function in CopyProjectModal passes the selected customer to `copyProject`.

### 6.5 Phase 3c: Planning Line Sync Details

All BC API calls route through `bcGatedFetch` (line 395-415) which implements `_bcSemaphore` (max 6 inflight, with 429 retry). No additional semaphore work needed.

`bomSyncHash` is set on each panel after planning line sync (step 11a) using the same `computePanelBomHash` function as executeRestore Phase 2.1 F4 (line 9822-9836). This prevents the auto-sync from firing a redundant second sync when the user opens the new project.

### 6.6 Phase 3d: Failure Handling + Retry

**Failure scenarios and handling:**

| Failure point | State after failure | Recovery path |
|---------------|-------------------|---------------|
| Steps 1-7 (Firestore-local) | No project created or partial Firestore write | Simple retry — start over |
| Step 8 (BC connect) | Firestore project exists, no BC project | `relinkToBC` from project view |
| Step 9 (BC project creation) | Firestore project exists, no BC project | `relinkToBC` from project view |
| Step 9a (checkpoint write) | Firestore + BC project, but Firestore missing linkage | `relinkToBC` creates another BC project. Orphan tolerated (restore D3 pattern). |
| Step 10 (task structure) | Firestore + BC project, no tasks | `relinkToBC` creates tasks (idempotent) |
| Step 11 (planning lines) | Firestore + BC + tasks, partial planning lines | Normal project-view sync on open, or manual "Sync All" |

**CopyProjectModal error view:**

The `startCopy` function catches errors. To distinguish BC-specific failures:

- If `result.bcProjectNumber` exists (step 9a checkpoint succeeded but later steps failed): show "BC project created ({number}), but planning line sync had errors. You can fix this from the project view." + "Open Project Anyway" button.
- If no `bcProjectNumber` (step 8 or 9 failed): show standard error + "Retry" button.

**Implementation:** `copyProject` returns a partial result on BC failure:
```js
try { /* steps 10-11 */ } catch (e) {
  return {...finalProj, _bcStepsFailed: true, _bcError: e.message};
}
```
The modal checks `result._bcStepsFailed` to show the partial-success view.

**relinkToBC (line 34913):** Already exists and performs the exact retry sequence needed:
1. Creates BC project via `bcCreateProject`
2. Creates task structure via `bcCreatePanelTaskStructure`
3. Syncs planning lines per panel via `bcSyncPanelPlanningLines`
4. Updates project doc with `bcProjectNumber`, `bcProjectId`, `bcEnv`

No new retry UI needed — `relinkToBC` is the retry path for any BC failures after the Firestore project exists.

### 6.7 Phase 3e: CopyProjectModal Progress UI Update

**Updated progress step list:**

| Step key | Label |
|----------|-------|
| `quote` | Quote number assigned |
| `flatten` | ECOs flattened |
| `clone` | Panels cloned |
| `save` | Saved to Firestore |
| `images` | Drawings copied |
| `bc-connect` | BC connected |
| `bc-project` | BC project created |
| `bc-tasks` | Panel tasks created |
| `bc-planning` | Planning lines synced |
| `done` | Complete |

**BC connection gating:** The "Next ▸" button on the customer view (§6.3) should check `_bcToken` and show a connect prompt if disconnected, same as NewProjectModal (line 39697-39704). The Confirm button on the preview view should also be disabled when `!_bcToken`.

### 6.8 Phase 3 Verification

| Test | Expected |
|------|----------|
| Copy project with BC connected + customer selected | BC project created with chosen customer, planning lines synced |
| Copy project — choose different customer than source | New BC project has the CHOSEN customer, not source customer |
| Copy project with BC disconnected | Customer view shows "Connect BC" prompt, "Next ▸" disabled |
| Cancel on customer view | Modal closes, no project created, no side effects |
| BC project creation fails (BC offline mid-copy) | Firestore project saved, error view shows "Open Project Anyway", relinkToBC works |
| Task structure fails | BC project exists, planning lines skipped, warning shown |
| Planning line sync fails on one panel | Other panels synced, partial success shown |
| Open copied project after successful copy | No redundant auto-sync (bomSyncHash match) |
| relinkToBC on a copy that failed at step 10 | Creates tasks + syncs planning lines |
| "New Customer" flow in customer picker | Customer created in BC, auto-selected, copy proceeds |

---

## 7. PHASE 4 — POLISH (Renumbered from v1.0 Phase 3)

### 7.1 Smoke Test Checklist

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

### 7.2 Edge Cases Discovered During Testing

Reserve this section for findings from smoke testing. Jon will route observations here for Marc to address.

### 7.3 Customer Picker Extraction (Optional Cleanup)

If Phase 3a used the duplication approach (copy customer picker code into CopyProjectModal), consider extracting a shared `<CustomerPicker onSelect={fn}>` component during polish. This would:
- Deduplicate ~120 lines between NewProjectModal and CopyProjectModal
- Create a reusable customer selection widget for future features
- Not block Phase 3 delivery

---

## 8. RISK MATRIX

| # | Risk | Severity | Mitigation | Status |
|---|------|----------|------------|--------|
| R1 | Duplicate quote numbers | High | `getNextQuoteNumber` uses Firestore transaction — verified atomic | **Resolved** |
| R2 | Orphaned ECO references | Medium | Flatten silently skips missing base rows, console.warn | **Handled in algorithm** |
| R3 | Auto-open race condition | Low | Uses in-memory project object, no Firestore round-trip | **Non-issue** |
| R4 | Field exclusion gaps | Medium | Build-from-scratch pattern (include-list, not exclude-list) + Phase 4 polish | **Mitigated** |
| R5 | ECO labor hours → counts mismatch | Medium | New `ecoFlattenAdded` field + 3-line `computeLaborEstimate` bridge | **Handled in Phase 1** |
| R6 | `quoteRev` auto-bump on first save | Low | `saveProject` seeds `quoteRev:1` for new projects — correct behavior | **Non-issue** |
| R7 | BC project creation fails mid-copy | Medium | Step 9a checkpoint persists bcProjectNumber immediately. `relinkToBC` available as retry. Orphan BC projects tolerated (restore D3 pattern). | **Handled in Phase 3** |
| R8 | Duplicate auto-sync on project open | Low | `bomSyncHash` set on each panel after planning line sync (F4 pattern). | **Handled in Phase 3** |
| R9 | User forgets to select customer | Low | "Next ▸" button disabled until customer selected + name non-empty. Clear UX gating. | **Phase 3 implementation** |
| R10 | BC rate limiting during copy (429s) | Low | All BC calls route through `bcGatedFetch` with built-in 429 retry. | **Already handled by TODO #64** |

---

## 9. FILE/LINE REFERENCE INDEX

| Item | Location |
|------|----------|
| `copyProject` function | `src/app.jsx:9969` |
| `CopyProjectModal` | `src/app.jsx:41650` |
| Copy button in project view | `src/app.jsx:32603` |
| `CopyProjectModal` render | `src/app.jsx:44903` |
| `copyProject_` state | `src/app.jsx:43656` |
| `getNextQuoteNumber` | `src/app.jsx:2220-2231` |
| `scanBomForArchiveIssues` | `src/app.jsx:8989-9008` |
| `computeLaborEstimate` | `src/app.jsx:634-745` |
| Labor group computation | `src/app.jsx:730-737` |
| ECO computation helpers | `src/app.jsx:763-835` |
| `flattenEcosIntoBom` | `src/app.jsx:843` |
| ECO BOM row creation (add) | `src/app.jsx:15620-15647` |
| ECO modify row creation | `src/app.jsx:24054-24089` |
| ECO remove row creation | `src/app.jsx:24095-24129` |
| `ecoSummary` creation | `src/app.jsx:14875-14889` |
| `ecoModifiesBaseRowId` usage | `src/app.jsx:24060, 24068, 24114` |
| `ecoOriginal` shape | `src/app.jsx:24076-24084` |
| arcPulse animation | RestorePreviewModal line 41390 |
| `saveProject` new-doc seed | `src/app.jsx:8567-8569` |
| Quote number absence check | `src/app.jsx:34962` |
| `bcCreateProject` | `src/app.jsx:3928-3982` |
| `bcCreatePanelTaskStructure` | `src/app.jsx:2881` |
| `bcSyncPanelPlanningLines` | `src/app.jsx:3478` |
| `relinkToBC` | `src/app.jsx:34913-34938` |
| `_bcSemaphore` / `bcGatedFetch` | `src/app.jsx:390-415` |
| `executeRestore` step 5 (BC) | `src/app.jsx:9765-9779` |
| `executeRestore` step 5a (checkpoint) | `src/app.jsx:9773-9778` |
| `executeRestore` step 6 (tasks) | `src/app.jsx:9782-9795` |
| `executeRestore` step 7 (planning) | `src/app.jsx:9797-9820` |
| `executeRestore` F4 bomSyncHash | `src/app.jsx:9822-9836` |
| `NewProjectModal` | `src/app.jsx:39428-39812` |
| `NewProjectModal.create` | `src/app.jsx:39578-39662` |
| Customer picker state | `src/app.jsx:39434-39446` |
| Customer picker JSX | `src/app.jsx:39697-39733` |
| `bcLoadAllCustomers` | `src/app.jsx:3985` |
| `bcFilterCustomers` | `src/app.jsx:4055` |
| `bcCreateCustomer` | `src/app.jsx:4063` |
| `bcFetchCustomerContacts` | `src/app.jsx:4084` |

---

## 10. OPEN QUESTIONS

None. All decisions resolved:
- Customer handling: picker first (Jon, v2.1)
- BC project creation: in scope (Jon, v2.0)
- ECO labor fold: `ecoFlattenAdded` bridge (v1.0)
- Quote number: assign at copy time (v1.0)

---

## REVISION HISTORY

- v1.0 (2026-06-01) — Initial detailed plan, three phases (ECO flatten, copy enhancement, polish)
- v2.0 (2026-06-01) — Added Phase 3 (BC project creation + planning line sync). Customer inheritance (Option A) recommended as blocking open question. Phases 1-2 marked complete. Old Phase 3 renumbered to Phase 4. New risks R7-R10.
- v2.1 (2026-06-01) — Customer handling changed from inheritance to picker, per Jon's clarification that BC customers cannot be changed after project creation. §6.2 decided (no longer open question). §6.3 added (customer picker integration + reusability investigation). Updated `copyProject` signature to accept `customerNumber`. Phase 3 restructured to 3a-3e. LOC estimate updated from ~100 to ~150.

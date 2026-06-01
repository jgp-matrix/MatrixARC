# ARCHIVE-COPY-PLAN-SUPPLEMENT.md (Milestone E)

**Version:** 1.0  
**Date:** 2026-06-01  
**Author:** Coach (Senior Development Engineer, Architecture)  
**Companion to:** ARCHIVE-COPY-BRIEF.md v1.0

---

## PURPOSE

This supplement provides the codebase-grounded technical answers to the six Open Questions in the Brief, plus implementation-ready detail on ECO flatten logic, field exclusion, and reuse of existing infrastructure. Every claim cites specific line numbers verified against the live `src/app.jsx`.

---

## S1 — ECO DATA SHAPE & FLATTEN LOGIC

### S1.1 Where ECOs Live

ECOs use a three-layer data model:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Summary array** | `project.ecoSummary[]` on the project doc | Denormalized for fast tile/card rendering (line 14799-14801) |
| **Canonical docs** | `{projectsPath}/{projectId}/ecos/{ecoId}` subcollection | Full ECO metadata, margins, comments, costs |
| **Tagged BOM rows** | `panel.bom[]` entries where `row.ecoTag` is truthy | Material and labor changes — inline on each panel |

The summary array entries have this shape (line 14875-14888):
```
{ecoId, number, status, kind, deltaSell, approvedAt, completedAt, createdAt, displayLabel}
```

### S1.2 ECO BOM Row Shape

Every ECO BOM row carries these fields (verified at line 15624-15637 and 24063-24084):

| Field | Type | Purpose |
|-------|------|---------|
| `ecoTag` | string (ecoId) | Links row to its ECO document |
| `ecoNumber` | number | ECO sequence number |
| `ecoOp` | `"add"` \| `"remove"` \| `"modify"` | Operation type |
| `ecoModifiesBaseRowId` | string \| null | For modify/remove: the `id` of the base row being changed. Null for add ops. |
| `ecoOriginal` | object \| undefined | For modify ops: `{qty, unitPrice, partNumber, description, manufacturer, leadTimeDays, leadTimeSource}` — pre-edit snapshot |
| `ecoCreatedAt` | timestamp | When the ECO row was created |

**ECO labor rows** (line 758-762): Same structure but with `isLaborRow: true`. Description is "CUT", "LAYOUT", or "WIRE". Qty is a SIGNED DELTA (e.g., +2 means 2 more hours than base).

### S1.3 How Rows Reference Base

Modify and remove rows link to their base via `ecoModifiesBaseRowId` (NOT by part number). This is the correct join key for flatten. The code enforces exactly one modify/remove row per base row per ECO (line 24060 checks for existing).

### S1.4 ECO Flatten Algorithm

No existing flatten utility exists in the codebase. The closest patterns are:
- `computeBasePanelSellPrice` (line 813-816): strips all ecoTag rows → BASE-only view
- `computePanelSellPrice` (line 932-948): includes ecoTag rows with signed arithmetic
- `computeEcoChangeDetails` (line 901-930): structured per-ECO change analysis

**Recommended flatten algorithm (net-new function `flattenEcosIntoBom`):**

```
function flattenEcosIntoBom(panel, ecoSummary):
  baseRows = panel.bom.filter(r => !r.ecoTag)
  baseMap  = Map(row.id → row) for baseRows
  
  // Sort ECOs oldest → newest (ascending by number)
  sortedEcos = ecoSummary.slice().sort((a,b) => a.number - b.number)
  
  for each eco in sortedEcos:
    ecoRows = panel.bom.filter(r => r.ecoTag === eco.ecoId && !r.isLaborRow)
    
    for each ecoRow in ecoRows:
      if ecoRow.ecoOp === "add":
        // Strip ECO metadata, assign new ID, append to base
        newRow = stripEcoFields(ecoRow)
        baseMap.set(newRow.id, newRow)
        
      else if ecoRow.ecoOp === "remove":
        // Remove the base row this targets
        baseMap.delete(ecoRow.ecoModifiesBaseRowId)
        
      else if ecoRow.ecoOp === "modify":
        baseRow = baseMap.get(ecoRow.ecoModifiesBaseRowId)
        if !baseRow: continue  // Edge case: base row already removed by prior ECO
        
        orig = ecoRow.ecoOriginal || {}
        merged = {...baseRow}
        
        // Qty: ecoRow.qty is a SIGNED DELTA (line 24051-24052)
        // Exception: qty===0 means "no qty change" (line 24070)
        if ecoRow.qty !== 0:
          merged.qty = (baseRow.qty || 0) + (ecoRow.qty || 0)
        
        // Other fields: if different from ecoOriginal, use the ECO value
        for field in [partNumber, description, manufacturer, unitPrice]:
          if ecoRow[field] !== orig[field]:
            merged[field] = ecoRow[field]
        
        baseMap.set(baseRow.id, merged)
  
  return Array.from(baseMap.values())
```

### S1.5 ECO Labor Flatten

ECO labor rows (`isLaborRow && ecoTag`) carry SIGNED DELTA hours (line 758-762). For the copy:

**Option A (recommended):** Sum all ECO labor deltas per category (CUT/LAYOUT/WIRE) and add to the panel's `laborData.overrides`. This preserves the AI-derived labor model while incorporating ECO adjustments. The `laborData.overrides` field exists (line 12789: `overrides:{}`) and is read by `computeLaborEstimate`.

**Option B:** Convert ECO labor delta rows into `_manualLabor` base rows. Simpler but loses the labor model.

**Design decision needed:** Confirm with Jon which approach to use.

### S1.6 Edge Cases (code-verified)

| Case | Behavior | Evidence |
|------|----------|---------|
| ECO row with no matching base row | For remove: silent skip (base already gone). For modify: skip — base was removed by a prior ECO. | Sequential processing handles naturally |
| Multiple ECOs touching same part | Enforced one row per base per ECO (line 24060). Sequential application in ECO number order. | Correct — last ECO's state wins |
| ECO `modify` with qty=0 | Means "no qty change, only field changes" | Line 24070 comment |
| ECO `remove` qty sign | Two code paths exist: `commitNewRow` negates qty (line 15623), `removeBaseRowInEco` keeps positive (line 24116). Irrelevant for flatten — remove ops delete the row entirely. | Row removal, not qty arithmetic |
| Source project has no ECOs | `ecoSummary` empty → skip flatten, copy BOM as-is | Brief §Edge Cases matches |

---

## S2 — QUOTE NUMBER GENERATION

### S2.1 Existing Helper

`getNextQuoteNumber(uid)` at line 2220-2231:

```js
async function getNextQuoteNumber(uid){
  const path=(_appCtx.configPath||`users/${uid}/config`)+"/quoteCounter";
  const ref=fbDb.doc(path);
  const num=await fbDb.runTransaction(async tx=>{
    const doc=await tx.get(ref);
    const stored=doc.exists?(doc.data().next||0):0;
    const next=Math.max(stored,202000);
    tx.set(ref,{next:next+1});
    return next;
  });
  return "MTX-Q"+String(num);
}
```

- **Path:** `{configPath}/quoteCounter` (Firestore doc with `{next: <number>}`)
- **Format:** `MTX-Q2#####` starting at MTX-Q202000
- **Concurrency:** Uses Firestore transaction — safe for parallel copy operations
- **Ready to use:** No modifications needed. Call early in the copy process.

### S2.2 When to Assign

Assign the quote number during copy execution (after confirm, before save). The quote number should be written to `project.quote.number` on the new project doc. The existing `NewProjectModal` does NOT assign a quote number at creation time — it's assigned on first print (line 34893). For Copy, follow the same pattern: do NOT pre-assign a quote number. The new project gets one on first print.

**Correction to Brief:** The Brief says "fresh quote number" in the scope. But the existing ARC pattern is that quote numbers are assigned at print time, not at project creation. Recommend following the existing pattern — the copy creates a project with no quote number, and one is assigned when the user first prints.

---

## S3 — PROJECT CREATION PATTERN

### S3.1 Existing Copy Infrastructure

Two copy-related code paths already exist:

**1. `copyProject` function (line 9897-9969)** — Active project copy. Current behavior:
- Creates BC project with customer inherited (line 9907)
- Creates BC task structure (line 9910-9912)
- Deep clones panels with fresh IDs (line 9916-9920) — **no ECO flatten**
- Copies page images from Storage (line 9937-9955)
- Syncs planning lines to BC (line 9961-9966)
- Returns new project object

**2. `CopyProjectModal` (line 41557-41609)** — UI for active project copy:
- Editable name field (default: " (Copy)")
- Customer display (read-only, inherited)
- Progress bar
- Calls `copyProject` directly

**3. Archive-based copy** — `RestorePreviewModal` with `mode="copy"` (line 41065):
- Full preview with customer/vendor/item drift checks
- ECO mode radio buttons rendered (line 41501-41512) but NOT wired to execution
- Calls `executeRestore` — same path as restore, no ECO flatten implemented

### S3.2 Recommended Approach

**Enhance the existing `copyProject` function** and **enhance `CopyProjectModal`** rather than building from scratch or routing through the archive/restore path.

Rationale:
- `copyProject` already handles live project as source (not archive envelope)
- `CopyProjectModal` is already wired to the active project view via `onCopy` prop
- The archive-based copy path via `RestorePreviewModal` is designed for archived projects — different data shape, different concerns (drift detection against current BC state)
- Adding a preview phase to `CopyProjectModal` is simpler than adapting `RestorePreviewModal` to accept live projects

### S3.3 What Changes to `copyProject`

| Current Step | Milestone E Change |
|--------------|--------------------|
| Step 1: bcCreateProject with customer | **Remove** — no BC project at copy time (Brief: "starts with no BC linkage") |
| Step 2: bcCreatePanelTaskStructure | **Remove** — no BC project |
| Step 3: Deep clone panels | **Add ECO flatten** before cloning. Apply `flattenEcosIntoBom` per panel. |
| Step 4: saveProject | **Modify** — use field exclusion list (§S6). Set name to " (Copy)", blank BC/customer fields. |
| Step 5: Copy page images | **Keep** (or defer — see design decision) |
| Step 6: Re-save with URLs | **Keep** (if images copied) |
| Step 7: bcSyncPanelPlanningLines | **Remove** — no BC project |
| (new): Quote number | Do NOT assign — follows existing pattern of assign-on-print |

---

## S4 — ACTIVE PROJECT VIEW UX (Copy Button Placement)

### S4.1 Current Location

The Copy button already exists in the active project view's action bar at line 32511-32512:

```jsx
{!readOnly&&onCopy&&(
  <button onClick={onCopy} 
    style={btn(C.accentDim,C.accent,{border:`1px solid ${C.accent}`,
      fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>
    ⧉ Copy
  </button>
)}
```

It sits in the same row as:
- `+ Add Quote Line` (left)
- `📦 Send CADLink BOM's` (conditional)
- **`⧉ Copy`** ← this one
- `📦 Archive`
- `⇄ Transfer`
- `🗑 Delete`

The `onCopy` prop flows from line 44699: `onCopy={()=>setCopyProject(openProject)}`.

### S4.2 Recommendation

**Keep the existing button location.** It's already in the right place — the project action bar alongside Archive and Transfer. The button label could be refined from "⧉ Copy" to "⧉ Copy to New Quote" to match the Brief's terminology, but the placement is correct.

---

## S5 — MODAL REUSE ASSESSMENT

### S5.1 RestorePreviewModal

The `RestorePreviewModal` (line 41062-41555) is purpose-built for **archive** data:
- Reads from `archive` object (archive envelope format)
- Runs drift detection against current BC state (customer, vendors, items)
- Remap UI for missing entities
- ecoMode radio buttons (line 41501-41512) present but unused in execution
- Calls `executeRestore` which is archive-specific (lock/resume, archive subcollections, etc.)

**Verdict: Do NOT reuse for active project copy.** The concerns are too different:
- Active projects don't need customer/vendor/item drift detection (they're already in the current BC)
- Active projects don't need the remap UI
- The execution path (`executeRestore`) is wrong — it handles archive-specific concerns

### S5.2 CopyProjectModal

The `CopyProjectModal` (line 41557-41609) is lightweight:
- Editable name, customer display, progress bar
- Calls `copyProject` directly
- 52 lines total

**Verdict: Enhance this modal.** Add:
1. **Pre-copy BOM scan** — reuse `scanBomForArchiveIssues` (line 8989-9008) against the flattened BOM
2. **ECO flatten preview** — show panel count, ECO count, rows affected
3. **Warning display** — same pattern as the archive handler's `arcConfirm` at line 44699
4. **Progress view** — expand the existing progress bar to match the step-list UX from RestorePreviewModal (arcPulse animation, step icons)

### S5.3 Pre-Copy Warning Implementation

The existing `scanBomForArchiveIssues` (line 8989-9008) is directly reusable. It checks:
- `bcVerify.status === "not-in-bc"` count
- Missing manufacturer count
- Missing vendor (bcVendorNo) count
- Excludes: `isLaborRow`, `isContingency`, BUYOFF, crate-pattern items

For the copy: run this scan against a **preview of the flattened BOM** (build the flattened panels first, then scan). This ensures the warning reflects the copy's output, not the source's raw state.

The warning modal pattern from the archive handler (line 44699) can be reused:
```js
const issues = scanBomForArchiveIssues({...project, panels: flattenedPanels});
if (issues.bcNotInBcCount > 0 || issues.mfrMissingCount > 0 || issues.vendorMissingCount > 0) {
  // Show arcConfirm warning
}
```

---

## S6 — FIELD EXCLUSION LIST

### S6.1 Fields to EXCLUDE (do not carry to new project)

**BC Linkage:**
- `bcProjectId` — no BC project at copy time
- `bcProjectNumber` — no BC project
- `bcEnv` — no BC linkage

**Customer/Contact (Brief: always blank):**
- `bcCustomerNumber`
- `bcCustomerName`
- `quote.company`, `quote.contact`, `quote.contactEmail`, `quote.contactPhone`
- `quote.address`, `quote.city`, `quote.state`, `quote.zip`
- `quote.salesperson`, `quote.salespersonName`

**Quote/Print History:**
- `quoteRev` — starts fresh
- `lastQuoteHash`
- `quoteRevAtPrint`
- `quoteRevAcknowledgedAt`
- `quote.number` — assigned at first print per existing pattern
- `quote.prints` (print history array)

**ECO State (flattened into base):**
- `ecoSummary` — empty array (ECOs have been flattened)
- `ecoCounter` — reset to 0
- `activeEcoId` — null
- `ecoEditUnlocked` — false/absent
- `ecoFirstCreatedAt` — absent

**BOM Sync State:**
- `bomSyncHash` per panel — will be re-established on first sync

**Archive/Restore References:**
- `_archiveComplete`
- `archiveRefId`
- `restoredFrom`, `restoredBy`, `restoredAt`
- `restoreHistory`

**Review State:**
- `preReviewStatus` and all `preReview*` fields (line 8509)
- `postReviewStatus` and all `postReview*` fields (line 8517)
- `reviewRev`, `reviewRevBumpedThisCycle`, `reviewChangeLog`

**Purchasing State:**
- `bcPoStatus`
- `poNumbers`

**Admin/Lock State:**
- `ownerTakeoverActive`
- `ownerLockActive`
- `quotePrintLock`
- `projectPresence`

**Ephemeral:**
- `dataUrl` (per page — never persisted)

### S6.2 Fields to SET on New Project

| Field | Value |
|-------|-------|
| `name` | `source.name + " (Copy)"` (editable in modal) |
| `status` | `"draft"` |
| `createdAt` | `Date.now()` |
| `createdBy` | current `uid` |
| `updatedAt` | `Date.now()` |
| `updatedBy` | current `uid` |
| `schemaVersion` | `APP_SCHEMA_VERSION` |
| `panels` | Flattened clone (see §S6.3) |
| `ecoSummary` | `[]` |
| `ecoCounter` | `0` |

### S6.3 Per-Panel Field Handling

| Panel Field | Action |
|-------------|--------|
| `id` | New ID (`panel-1`, `panel-2`, etc.) |
| `name` | Keep from source |
| `bom[]` | **Flattened** — ECO rows applied to base, ECO metadata stripped |
| `pages[]` | Keep structure, copy images (new IDs, new storageUrl) |
| `laborData` | Keep from source (with ECO labor deltas applied per §S1.5) |
| `validation` | Keep from source (structural analysis is still valid) |
| `drawingNo`, `drawingDesc`, `drawingRev` | Keep from source |
| `pricing` | Keep from source (labor rate, markup) |
| `bomSyncHash` | Omit (re-computed on first sync) |
| `complianceReview` | Keep from source |
| `engineeringQuestions` | Omit (fresh project) |

### S6.4 Per-BOM-Row Field Handling (After Flatten)

| Row Field | Action |
|-----------|--------|
| `id` | New unique ID |
| `ecoTag` | **Strip** |
| `ecoNumber` | **Strip** |
| `ecoOp` | **Strip** |
| `ecoModifiesBaseRowId` | **Strip** |
| `ecoOriginal` | **Strip** |
| `ecoCreatedAt` | **Strip** |
| `restoreSkipped` | **Strip** |
| `bcVerify` | Keep (reflects current BC state — useful for pre-copy warning) |
| All other fields | Keep (partNumber, description, manufacturer, qty, unitPrice, etc.) |

---

## S7 — ANSWERS TO BRIEF'S OPEN QUESTIONS

### Q1: Where does ECO flatten logic need to live?

**Answer:** New utility function `flattenEcosIntoBom(panel, ecoSummary)` placed near the existing ECO computation helpers (around line 835, after `_ecosUpTo`). No existing utility approximates this — the closest are `computeBasePanelSellPrice` (strips ECOs for pricing) and `computeEcoChangeDetails` (structured change list for display). The flatten function is ~40-50 lines (see §S1.4 algorithm).

### Q2: What's the precise data shape of an ECO row?

**Answer:** See §S1.2 full field table. Key linkage: `ecoModifiesBaseRowId` → `baseRow.id` (NOT by part number). Modify rows store a signed qty delta with `ecoOriginal` snapshot. Full field list: `{id, ecoTag, ecoNumber, ecoOp, ecoModifiesBaseRowId, ecoOriginal, ecoCreatedAt, qty, partNumber, description, manufacturer, unitPrice, priceSource, notes, createdAt, createdBy}`.

### Q3: What's the entry point for the new quote number?

**Answer:** `getNextQuoteNumber(uid)` at line 2220 — exists, transactional, ready to use. However, per the existing ARC pattern, quote numbers are assigned at print time, NOT at project creation. **Recommend: do NOT assign a quote number during copy.** The new project gets one when the user first prints. This matches `NewProjectModal` behavior and avoids wasting quote numbers on copies that may be deleted before printing.

### Q4: Where should the Copy button go?

**Answer:** It's already there — line 32511-32512 in the active project action bar, adjacent to Archive/Transfer/Delete. The `onCopy` prop is wired through `ProjectView` (line 33988) from the root render (line 44699). No relocation needed. Consider renaming from "⧉ Copy" to "⧉ Copy to New Quote" for clarity.

### Q5: Reuse RestorePreviewModal or create CopyPreviewModal?

**Answer:** Neither. **Enhance the existing `CopyProjectModal`** (line 41557-41609). The RestorePreviewModal is purpose-built for archive data (drift detection, entity remapping, restore lock/resume) — none of which applies to active project copy. CopyProjectModal is already wired correctly and just needs: (1) ECO flatten preview summary, (2) `scanBomForArchiveIssues` warning, (3) expanded progress view with step icons. See §S5.2 for detail.

### Q6: Are there project-level fields that should NOT carry over?

**Answer:** Yes — extensive list in §S6.1. Key categories: BC linkage (6 fields), customer/contact (10+ fields), quote/print history (5 fields), ECO state (5 fields), review state (12 fields), purchasing state (2 fields), admin/lock state (4 fields), archive references (5 fields).

---

## S8 — IMPLEMENTATION NOTES

### S8.1 No BC Calls During Copy

The Brief explicitly states: "the new project starts with no BC linkage." This means:
- No `bcCreateProject` call
- No `bcCreatePanelTaskStructure` call
- No `bcSyncPanelPlanningLines` call
- No planning line sync

This significantly simplifies the copy operation (no 429 rate limit risk, no BC connection requirement) but means the user must manually link to BC later. The existing BC sync flows (project-open auto-sync, manual "Sync to BC") will handle this when the user creates the BC project.

### S8.2 Image Copy Decision

The existing `copyProject` copies all page images from Firebase Storage to new paths. This is potentially slow (sequential download + re-upload per page). For Milestone E, two options:

**Option A:** Copy images during the copy operation (current behavior). Slower but self-contained.  
**Option B:** Share source storageUrls initially, copy lazily on first edit. Faster copy, but creates a dependency on the source project's images.

**Recommendation:** Keep Option A for correctness. The copy should be fully independent. The progress view makes the wait visible.

### S8.3 ECO Subcollection

The Brief's "NOT IN SCOPE" section doesn't mention ECO subcollection documents. Since ECOs are being flattened into base BOM, the new project should NOT have an `ecos` subcollection. The ECO state is fully consumed by the flatten and discarded.

### S8.4 Existing `copyProject` as Starting Point

The enhanced `copyProject` function outline:

```
async function copyProject(uid, sourceProject, onProgress):
  1. Flatten ECOs per panel (flattenEcosIntoBom)
  2. Apply ECO labor deltas to panel laborData
  3. Build new project doc (field exclusion per §S6)
  4. saveProject to Firestore
  5. Copy page images from source to new project
  6. Re-save with storage URLs
  7. Return new project
```

Steps 1-3 are new. Steps 4-6 are adapted from the existing implementation. Steps for BC project creation and planning line sync are removed.

### S8.5 Risk Areas

1. **ECO modify qty=0 edge case:** Must not change base qty when delta is 0. The algorithm in §S1.4 handles this with the `if ecoRow.qty !== 0` guard.

2. **Multiple ECOs removing same part:** First ECO removes it, second ECO's remove is a no-op (base row already gone). Sequential processing handles this naturally.

3. **ECO labor delta overflow:** If ECO deltas reduce labor below 0, clamp to 0. The flattened panel shouldn't have negative labor hours.

4. **Image copy failure tolerance:** Current `copyProject` wraps each image copy in try/catch and continues (line 9951). This is correct — partial image failure shouldn't block the copy.

5. **`scanBomForArchiveIssues` on flattened data:** The scan must run against the post-flatten panels, not the raw source. If `ecoOp==="remove"` rows removed items that had `bcVerify.status==="not-in-bc"`, those items should NOT appear in the warning.

---

## REVISION HISTORY

- v1.0 (2026-06-01) — Initial supplement, answering all six Brief Open Questions with code-verified findings

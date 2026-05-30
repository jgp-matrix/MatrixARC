# Archive/Restore — Implementation Plan

**Based on:** `ARCHIVE-RESTORE-BRIEF.md` v1.1 (2026-05-27)
**Repo state:** v1.20.22, commit `5953b76e`, master
**Author:** CCD (Claude Code Desktop)
**Status:** v4 — approved. Milestone A deployed. v3→v4 changes: R2 hard-block restore lock UX, permission model revision (restore = canWrite, not admin-only), BC write scope audit + post-restore verification checklist, Q2/Q5 Jon rulings applied.
**v3 changes:** Archive storage switched from embedded arrays to subcollections (Critical #1). `_archiveComplete` flag for write atomicity (Critical #2). ECO flatten scenarios fully specified with linkage mechanism documented (Critical #3). preReview/postReview fields enumerated (21 fields). Archive browser read-pattern note added. Open questions Q1-Q5/Q7 all resolved. Q6 informational (no decision needed).
**v2 changes:** Field resets expanded to four categories (brief §6 restructure). Per-panel BC fields added. BC master-data preservation made explicit. Kanban stale-state handling added (brief §6a). Tooltip proposal added as plan-level decision.

---

## 1. File/Module Structure

All implementation lives in `src/app.jsx` (the monolith). No new files are created. One Firestore rules addition in `firestore.rules`.

### New Functions (all in `src/app.jsx`)

| Function | Section | Purpose |
|----------|---------|---------|
| `archiveProject()` | After `deleteProjectStorageBlobs` (~line 8736) | Core archive: deep-clone project + subcollections → `projects_archive` |
| `bulkArchiveProjects()` | After `archiveProject` | Admin bulk: iterate all projects, skip already-archived, write archives |
| `loadArchives()` | After `bulkArchiveProjects` | Fetch all archives from `projects_archive`, sorted by `archivedAt` desc |
| `buildRestorePreview()` | After `loadArchives` | Reference drift detection: check Items/Customers/Vendors against live BC |
| `executeRestore()` | After `buildRestorePreview` | Write path: Firestore → BC project → tasks → planning lines → ECOs → subcollections |
| `executeCopyToNewQuote()` | After `executeRestore` | Variant of restore: ECO flatten/keep choice, no BC precondition |
| `ArchiveBrowserModal` | After `CopyProjectModal` (~line 39710) | UI: archive list with search/sort, restore/copy actions |
| `RestorePreviewModal` | After `ArchiveBrowserModal` | UI: drift visualization, remap controls, labor rate opt-in, mode selection |
| `BulkArchiveModal` | After `RestorePreviewModal` | UI: progress counter, retry, admin-only |

### Modified Functions

| Function | Location | Change |
|----------|----------|--------|
| `deleteProjectStorageBlobs()` | Line 8704-8735 | Add archive existence guard before deletion |
| `ProjectTile` | Line 39812-39909 | Muted rendering + tooltip for BC-disconnected projects (§6a) |
| `firestore.rules` | `/companies/{companyId}` block | Add `projects_archive/{archiveId}` match |
| Main app render | ~line 42620-42670 (modal area) | Add `ArchiveBrowserModal`, `RestorePreviewModal`, `BulkArchiveModal` |
| Project action menu | ~line 42622 (project card actions) | Add "Archive" action |
| Settings / admin area | ~line 38040 (admin section in SettingsModal) | Add "Archive All Projects" button |
| Gear menu | ~line 42538 | Add "Archived Projects" view entry (admin-only) |

---

## 2. Function Signatures

### Archive Write Path

```js
async function archiveProject(uid, project, reason)
```
- `uid`: current user's UID
- `project`: full project object (already in memory from the project list)
- `reason`: `"pre-reset"` | `"user-initiated"`
- **Behavior:** Multi-step write with atomicity flag:
  1. Fetches `_snapshots` and `ecos` subcollections for the project.
  2. Writes parent archive document to `companies/{companyId}/projects_archive/{auto-id}` with `_archiveComplete: false`. Document contains envelope fields + full project data (panels, BOM, pricing — same size as original project doc, fits within 1MB).
  3. Writes each ECO document to `projects_archive/{archiveId}/_ecos/{originalEcoId}` (preserves original doc IDs).
  4. Writes each snapshot document to `projects_archive/{archiveId}/_snapshots/{auto-id}`.
  5. Sets `_archiveComplete: true` on the parent document.
  6. Returns `{archiveId, archivedAt}`.
- **Subcollection fetch pattern:** Mirrors `loadSnapshots()` (line 8403-8408) for `_snapshots`; mirrors ECO loading via `ecoSubcollectionPath()` (line 13659-13664) for `ecos`.
- **Size safety:** ECOs and snapshots live in subcollections, not embedded arrays. Each snapshot is 150-300KB (duplicates a full panel BOM); 10 snapshots = 1.5-3MB. Embedding them would exceed Firestore's 1MB document limit. Subcollections have no size impact on the parent doc.
- **Partial write handling:** If the function fails after creating the parent doc but before completing subcollection writes, `_archiveComplete` remains `false`. The archive is invisible in the browser (filtered out). Bulk archive retry detects it as incomplete (not skipped) and re-runs.

```js
async function bulkArchiveProjects(uid, onProgress)
```
- `uid`: current user's UID
- `onProgress`: callback `({total, done, failed, failedNames})` for UI progress
- **Behavior:** Loads all project IDs from `_appCtx.projectsPath`. Queries `projects_archive` where `_archiveComplete === true` for existing `originalProjectId` values (single query, build Set). For each non-archived project (NOT in the complete set): fetch full project doc, call `archiveProject()`. Incomplete archives (exist but `_archiveComplete !== true`) are treated as not-yet-archived — `archiveProject()` will overwrite them. On per-project failure: log, increment `failed`, continue. Returns `{total, archived, skipped, failed, failedNames[]}`.

### Archive Browser

```js
async function loadArchives()
```
- Returns `archive[]` from `companies/{companyId}/projects_archive` where `_archiveComplete === true`, ordered by `archivedAt` desc.
- Each archive includes the envelope fields plus `name` (from archived project) for display.
- **Read-pattern note:** This fetches ONLY parent envelope documents. Do NOT pre-fetch `_ecos` or `_snapshots` subcollections for every archive in the list — that's an N+1 query pattern. Subcollection fetches happen only when a specific archive is opened for restore preview (inside `buildRestorePreview()` or `executeRestore()`).

### Restore Preview — Reference Drift Detection

```js
async function buildRestorePreview(archive)
```
- `archive`: full archive document from Firestore
- **Behavior:** Requires `_bcToken`. Extracts unique Items (by `bcPartNumber`/`partNumber`), the Customer (`bcCustomerNumber`), and Vendors (`bcVendorNo`) from the archived BOM rows and project header. For each reference category:
  - **Items:** Call `bcLookupItem(partNumber)` (line 4045) for each unique part. Compare `Unit_Cost` against archived `unitPrice` using `COST_DRIFT_THRESHOLD`. Flag missing items (red), cost drift > threshold (yellow), description changes (yellow).
  - **Customer:** Call `bcLoadAllCustomers()` (line 3794), find by `customerNumber`. Flag missing (red) or name change (yellow).
  - **Vendors:** Call `bcGetVendorMap()` (line 5292) once, lookup each `bcVendorNo`. Flag missing (red) or name change (yellow).
- **Labor rate drift:** Compare `archive.panels[].pricing.laborRate` against current `LABOR_RATES.shopRate`. Surface delta if different.
- Returns `{items: [{partNumber, status, archivedPrice, livePrice, delta, liveDescription}], customer: {status, archivedName, liveName}, vendors: [{vendorNo, status, archivedName, liveName}], laborDrift: {archived, current}}`.

```js
const COST_DRIFT_THRESHOLD = 0.05;
```
Named constant, placed near other pricing constants (around `_pricingConfig`, line ~680).

### Restore Execution

```js
async function executeRestore(archive, remaps, options, onProgress)
```
- `archive`: full archive document
- `remaps`: `{items: {partNumber: {action, remapTo}}, customer: {action, remapTo}, vendors: {vendorNo: {action, remapTo}}}`
- `options`: `{updateLaborRates: bool}`
- `onProgress`: callback `({step, msg, pct})`
- **Behavior** (matches brief §5, steps 1-10):

  1. **Check for resume:** Query `_appCtx.projectsPath` for any doc with `_restoringFromArchive === archive.archiveId`. If found, read its `bcProjectNumber` and skip to appropriate step.
  
  2. **Check archive integrity:** If `archive._archiveComplete !== true`, abort with error: "Archive is incomplete — re-run archive to complete." Do not attempt restore against a partial archive.
  
  2b. **Check restore lock:** Read archive doc's `restoreLock`. Three cases:
     - No lock OR `lockedAt` > 5 min ago (stale): proceed — write `restoreLock: {lockedBy: uid, lockedByName: userName, lockedAt: Date.now()}`.
     - Lock exists, `lockedAt` < 5 min ago, `lockedBy === uid`: same user's own in-progress restore — proceed to resume via `findResumeDoc()`.
     - Lock exists, `lockedAt` < 5 min ago, `lockedBy !== uid`: **HARD BLOCK** — show "This archive is being restored by [lockedByName]" with no proceed option. Return without starting restore.
  
  3. **Build project data:** Deep-clone archived project. Run `migrateProjectShape()` (line 8598). Apply field resets per brief §6 (four categories below). Apply remaps. If `options.updateLaborRates`, update `panel.pricing.laborRate` on each panel.

     **3a. BC Project-Entity Fields (reset — old BC project no longer exists):**
     `bcProjectId` → null (new value from step 5), `bcProjectNumber` → null (new value from step 5), `bcEnv` → `_bcConfig.env`, `bcCompanyName` → `_bcConfig.companyName`, `bcPoNumber` → null, `bcPoStatus` → null, `bcPoDate` → null, `bcStatusForcedToQuote` → false, `bcStatusForcedToQuoteAt` → null, `bcPdfAttached` → false, `bcPdfFileName` → null.

     **3b. Per-Panel BC Project-Entity Fields (reset — iterate all panels):**
     For each panel: `bcPdfAttached` → false, `bcPdfFileName` → null, `bcUploadCount` → 0, `bcUploadQuoteRev` → null, `bcProjectTaskNo` → null (new task blocks created by `bcCreatePanelTaskStructure` in step 6).

     **3c. Project Lifecycle Fields (reset — clean slate):**
     `id` → null (saveProject assigns new), `wonAt`/`wonBy` → null, `lostAt`/`lostBy` → null, `quoteRev` → 1, `quoteRevAtPrint` → null, `lastQuoteHash` → null, `qvHistory` → [].
     Pre-review (13 fields, canonical source line 8284): `preReviewStatus` → null, `preReviewSubmittedAt` → null, `preReviewSubmittedBy` → null, `preReviewApprovedAt` → null, `preReviewApprovedBy` → null, `preReviewNotes` → null, `preReviewAssignedTo` → null, `preReviewAssignedToName` → null, `preReviewRev` → 0, `preReviewChangeLog` → [], `reviewRev` → 0, `reviewRevBumpedThisCycle` → false, `reviewChangeLog` → [].
     Post-review (8 fields, canonical source line 8292): `postReviewStatus` → null, `postReviewSubmittedAt` → null, `postReviewSubmittedBy` → null, `postReviewApprovedAt` → null, `postReviewApprovedBy` → null, `postReviewNotes` → null, `postReviewAssignedTo` → null, `postReviewAssignedToName` → null.
     `ownerLockActive` → false, `ownerTakeoverActive` → null, `ownerTakeoverLog` → [], `editUnlocked` → false, `quotePrintLock` → null, `unlockRequestedBy` → null, `createdBy` → restoring user's UID, `createdAt` → now, `updatedBy` → restoring user's UID, `updatedAt` → now.
     None of these 21 review fields appear in the BC master-data preserved list. All reset confirmed.

     **3d. BC Master-Data Fields (PRESERVED — survive BC reset):**
     Do NOT reset any of these. They reference Items, Customers, Vendors, and Users which are unaffected by the BC Database reset:
     - Project-level: `bcCustomerNumber`, `bcCustomerName`, `bcContactNo`, `bcContactName`, `bcContactEmail`, `bcContactPhone`, `bcSalespersonCode`, `bcSalesperson`, `bcSalespersonUid`, `bcProjectManagerCode`, `bcProjectManager`, `bcProjectManagerUid`, `bcDesignerCode`, `bcDesigner`, `bcDesignerUid`.
     - Per-BOM-row: `bcPartNumber`, `bcVendorNo`, `bcVendorName`, `bcPurchasePrice`, `bcItemCardCost`, `bcCurrentCost`, `bcVerify`, `bcItemId`, `bcItemNumber`, `bcPoDate` (item-level purchase price date, NOT project PO date).

     **3e. Other preserved fields:** `name`, `status` (set to `"draft"`), all panel data (drawing metadata, pages, BOM rows, validation, laborData, pricing config, engineeringQuestions), `serviceCards`, `ecoCounter`/`ecoSummary`/`activeEcoId` (on Restore; cleared on Copy-with-flatten per brief §6 additional resets).
  
  4. **Save to Firestore:** Call `saveProject(uid, projectData)` with `_restoringFromArchive: archive.archiveId` and `bcProjectNumber: null`. This is the checkpoint — if anything fails after this, resume finds this doc.
  
  5. **Create BC project:** `bcCreateProject(name, customerNumber)` (line 3737). Update Firestore doc with `bcProjectNumber` and `bcEnv`.
  
  6. **Create panel task structure:** `bcCreatePanelTaskStructure(bcNumber, name, panels)` (line 2772).
  
  7. **Sync base planning lines per panel:** `bcSyncPanelPlanningLines(bcNumber, panelIndex, panel, name)` (line 3292) for each panel. Filter to non-ECO BOM rows (existing function handles this).
  
  8. **Sync ECO planning lines per panel per ECO:** `bcSyncEcoPanelPlanningLines(bcNumber, panelIndex, ecoNumber, ecoId, panel, name)` (line 3558) for each panel × each active ECO.
  
  9. **Recreate `ecos` subcollection:** Fetch all docs from `projects_archive/{archiveId}/_ecos/`. For each doc, write to `{projectsPath}/{newProjectId}/ecos/{originalEcoId}` (preserve original doc IDs — BOM rows reference ECOs via `ecoTag` which holds the ecoId).
  
  10. **Recreate `_snapshots` subcollection:** Fetch all docs from `projects_archive/{archiveId}/_snapshots/`. For each doc, write to `{projectsPath}/{newProjectId}/_snapshots/{auto-id}`.
  
  11. **Clear restore flag, update archive:** Remove `_restoringFromArchive` from project doc. Append to archive's `restoreHistory[]`. Clear `restoreLock`.
  
  12. **Return** `{newProjectId, bcProjectNumber}` for navigation.

**`migrateProjectShape()` invocation site:** Step 3 above, after deep-cloning and before field resets. This is a non-standard invocation — normally called inside `loadProjects()` (line 8589) on every Firestore load. Here we call it explicitly on the archived project data because the archive bypasses `loadProjects()`. The function is pure (takes object, returns object, no side effects, no Firestore calls), so calling it outside the normal load path is safe.

### Resume Detection

```js
// Inside executeRestore(), before any writes:
async function findResumeDoc(archiveId)
```
- Queries `_appCtx.projectsPath` where `_restoringFromArchive == archiveId`.
- Returns `{projectId, bcProjectNumber}` or `null`.
- **Resume logic:**
  - `bcProjectNumber === null` → resume from step 5 (BC project creation)
  - `bcProjectNumber !== null` → resume from step 6 (task structure onward — all BC write functions are idempotent per brief §7)

### Copy to New Quote Variant

```js
async function executeCopyToNewQuote(archive, remaps, options, onProgress)
```
- `options` adds: `{ecoMode: "flatten" | "keep", updateLaborRates: bool}`
- **Behavior:** Largely identical to `executeRestore()` with these differences:
  - If `ecoMode === "flatten"`: apply ECO flatten logic per §2a (three scenarios: modify→overlay, add→keep, remove→delete). Clear `ecoTag`/`ecoOp`/`ecoNumber`/`ecoModifiesBaseRowId`/`ecoOriginal`/`ecoCreatedAt`/`ecoSource` on every surviving row. Reset `ecoCounter` to 0, clear `ecoSummary`, clear `activeEcoId`, clear `ecoFirstCreatedAt`. Skip step 8 (ECO planning line sync). Skip ECO subcollection recreation in step 9.
  - BC connection is not required. If `!_bcToken`, skip steps 5-8 (BC writes). Set `bcProjectNumber: null`. User can connect BC later and manually sync.
  - Uses `canWrite()` permission (edit + admin), not admin-only.

### ECO-to-Base-Row Linkage and Flatten Semantics (Critical #3)

**Linkage mechanism (grounded in code):**

ECO rows link to base rows via `ecoModifiesBaseRowId`, which holds the base row's `id` (a `Date.now() + Math.random()` unique ID). This is a **row-ID linkage**, not a partNumber match. Row IDs are stable across the archive→restore→flatten round-trip because we deep-clone the full BOM array with all IDs preserved.

Each ECO BOM row carries:
- `ecoTag`: the ECO document ID (matches `ecoId` in the `ecos` subcollection)
- `ecoOp`: `"add"` | `"modify"` | `"remove"` — the operation type
- `ecoModifiesBaseRowId`: the base row's `id` (null for `"add"` rows)
- `ecoOriginal`: `{qty, unitPrice, partNumber, description, manufacturer, leadTimeDays, leadTimeSource}` — pre-modification snapshot of the base row (present on `"modify"` and `"remove"` rows)
- `ecoNumber`: 1-based ECO number
- `ecoCreatedAt`, `ecoSource`: metadata

**Qty semantics for modify rows:** `row.qty` is a **delta** (additive), not an absolute. The actual post-modification qty = `ecoOriginal.qty + row.qty`. This is confirmed at line 879-881: `const qtyDelta = Number(r.qty) || 0; const origQty = Number(orig.qty) || 0; const newQty = origQty + qtyDelta;`.

**Three flatten scenarios for Copy to New Quote (`ecoMode === "flatten"`):**

**(i) ECO modifies an existing row (`ecoOp === "modify"`, `ecoModifiesBaseRowId` set):**

Find the base row by `id === ecoModifiesBaseRowId`. Overlay the base row with the ECO row's current field values:
- `qty`: set to `ecoOriginal.qty + ecoRow.qty` (apply the delta to get the post-modification absolute)
- `partNumber`, `description`, `manufacturer`: take from ECO row (these are the "new" values; `ecoOriginal` holds the "old" values)
- `unitPrice`: take from ECO row if non-zero, else preserve base
- `leadTimeDays`, `leadTimeSource`: take from ECO row if set, else preserve base
- All other fields: preserve base row values

After overlay: delete the ECO row from the BOM. Clear ECO metadata on the merged base row (`ecoTag`, `ecoOp`, `ecoNumber`, `ecoModifiesBaseRowId`, `ecoOriginal`, `ecoCreatedAt`, `ecoSource` — all set to null/undefined).

**Edge case — multiple ECOs modify the same base row:** If ECO 1 and ECO 2 both modify the same base row, apply in ECO number order (lowest first). Each overlay's delta stacks on the previous result. This is unlikely in practice (rare to have two ECOs touching the same row) but the logic must be deterministic.

**Edge case — ECO row references a base row ID that doesn't exist in the BOM:** This shouldn't happen in well-formed data, but if it does: log a warning, treat the ECO row as an `"add"` (keep it, clear ECO metadata). Don't silently drop it.

**(ii) ECO adds a new row (`ecoOp === "add"`, `ecoModifiesBaseRowId` is null):**

Keep the row in the BOM. Clear all ECO metadata fields. The row becomes a regular base BOM row going forward. No overlay needed — it doesn't reference an existing row.

**(iii) ECO removes a row (`ecoOp === "remove"`, `ecoModifiesBaseRowId` set):**

Find the base row by `id === ecoModifiesBaseRowId`. Delete BOTH the base row AND the ECO remove row from the BOM. The row no longer exists in the flattened BOM.

**Edge case — base row was already removed by a prior ECO's flatten:** If two ECOs both remove the same base row (shouldn't happen in practice, but defensively): the first one deletes it, the second one finds no match and gets treated as a no-op (delete the orphaned ECO row, log a warning).

**Fields cleared on all surviving rows after flatten:**
`ecoTag`, `ecoOp`, `ecoNumber`, `ecoModifiesBaseRowId`, `ecoOriginal`, `ecoCreatedAt`, `ecoSource` — all set to null or deleted.

**Processing order:** Flatten iterates ECOs in `ecoNumber` ascending order. Within each ECO, process removes first (so base rows targeted for removal are gone before adds/modifies run — avoids stale-reference issues), then modifies, then adds.

### Deletion Guard

```js
// Modified deleteProjectStorageBlobs() — new guard at top of function body
```
- Before the existing `uids` harvesting loop, query `companies/{companyId}/projects_archive` where `originalProjectId == projectId`.
- If any document exists: log `[deleteProjectStorageBlobs] skipped — archive {archiveId} references project {projectId}` and return `{deleted: 0, failed: 0, uids: [], skipped: true, reason: "archive_exists"}`.
- If no archive exists: fall through to existing deletion logic unchanged.

---

## 3. Sequencing — Implementation Milestones

### Milestone A: Firestore Rules + Archive Write Path + Bulk Archive UI + Kanban Stale-State

**Ships:** Firestore rules for `projects_archive`. `archiveProject()`, `bulkArchiveProjects()`, `loadArchives()`. `BulkArchiveModal` UI in Settings/admin area. Per-project "Archive" action in project card menu. Kanban muted-card rendering for BC-disconnected projects (brief §6a).

**Justification:** This is the BC Database reset prerequisite. The entire feature exists to protect data before a reset. Archiving must be available first, and it has zero dependencies on restore logic. Jon can archive all projects immediately after this milestone deploys. The Kanban stale-state rendering ships here because it's useful the moment the BC environment changes — before any restore happens. It's a small change to `ProjectTile` (opacity + border + tooltip) with no dependencies on the archive write path, but deploying it alongside archiving gives Jon immediate visual feedback about which projects are disconnected after the BC swap.

**Deliverables:**
- `firestore.rules` updated and deployed
- Archive write path tested against production data (read-only verification: archive a test project, inspect the Firestore document)
- Bulk archive with progress/retry tested
- Per-project archive from card menu tested
- Kanban cards muted when `_bcEnvMismatched()` is true — verified across Sales, Purchasing, Production, Engineering tabs
- `⚠` tooltip explains the mismatch and suggests restore action

### Milestone B: Deletion Guard on `deleteProjectStorageBlobs()`

**Ships:** The ~10-line guard addition.

**Justification:** Ships immediately after A because once archives exist, the guard needs to be in place before anyone deletes a project that has an archive. Small change, low risk, high safety value. Could ship as part of Milestone A if the deploy timeline is tight.

**Deliverables:**
- Guard fires when archive exists (verified by archiving a test project, then attempting delete)
- Guard is transparent when no archive exists (existing delete behavior unchanged)

### Milestone C: Archive Browser + Restore Preview + Reference Drift Detection

**Ships:** `ArchiveBrowserModal` (list, search, sort). `buildRestorePreview()` with all three reference categories. `RestorePreviewModal` with drift visualization and remap UI.

**Justification:** Preview is read-only — it doesn't write anything. Building it before the write path lets Jon and Coach verify the drift detection logic against real BC data without any risk of creating malformed projects. Also validates that the BC lookup functions (`bcLookupItem`, `bcLoadAllCustomers`, `bcGetVendorMap`) perform adequately at scale.

**Depends on:** Milestone A (archives must exist to browse/preview them).

**Deliverables:**
- Archive browser shows all archived projects with search/sort
- Preview correctly identifies missing items, cost drift, missing customers, missing vendors
- Labor rate drift displayed accurately
- Remap UI allows re-assignment for all flagged references

### Milestone D: Restore Execution + Resume Semantics

**Ships:** `executeRestore()` with full BC write sequencing. Resume detection. Concurrent restore prevention (lock). Restore history tracking.

**Justification:** This is the core value — actually getting projects back into BC. Depends on C because the preview data feeds directly into the restore (remaps, options).

**Depends on:** Milestone C.

**Deliverables:**
- Full restore creates new BC project with correct task structure and planning lines
- ECO recreation works (subcollection + planning lines)
- Snapshot subcollection recreated
- Resume after BC failure (tested by simulating BC disconnect mid-restore)
- Concurrent restore lock prevents double-restore
- Restore history appended to archive

### Milestone E: Copy to New Quote Variant

**Ships:** `executeCopyToNewQuote()` with ECO flatten/keep dialog.

**Justification:** Lower priority than restore — the BC reset use case needs full restore (Milestone D). Copy to New Quote is a convenience feature for re-quoting. Can be deferred without blocking the reset.

**Depends on:** Milestone D (shares ~90% of the write path code).

**Deliverables:**
- ECO flatten produces a clean consolidated BOM
- ECO keep preserves all ECO structure
- Works without BC connection (Firestore-only mode)
- ECO combine dialog tested with both choices

### What Can Be Deferred

**Copy to New Quote (Milestone E)** can be deferred without blocking the BC Database reset. The reset use case requires: archive (A), guard (B), browse/preview (C), and restore (D). Copy to New Quote is a separate workflow that doesn't affect the reset→restore cycle.

---

## 4. Deletion Guard on `deleteProjectStorageBlobs()`

### Current Function (line 8704-8735)

The function harvests UIDs from `currentUid`, `project.createdBy`, and page `storageUrl` patterns, then iterates `pageImages/{uid}/{projectId}/` calling `listAll()` + `delete()` on each blob.

### Proposed Guard

Insert at the top of the function body, before the `uids` Set construction:

```js
// Pseudocode — not final implementation
async function deleteProjectStorageBlobs(currentUid, projectId, project) {
  // Archive existence guard: if this project has been archived, preserve blobs
  if (_appCtx.companyId) {
    try {
      const archiveQuery = await fbDb.collection(
        `companies/${_appCtx.companyId}/projects_archive`
      ).where('originalProjectId', '==', projectId).limit(1).get();
      
      if (!archiveQuery.empty) {
        const archiveId = archiveQuery.docs[0].id;
        console.log(`[deleteProjectStorageBlobs] skipped — archive ${archiveId} references project ${projectId}`);
        return { deleted: 0, failed: 0, uids: [], skipped: true, reason: 'archive_exists' };
      }
    } catch (e) {
      // Guard query failed — fail safe by preserving blobs
      console.warn(`[deleteProjectStorageBlobs] skipped — archive lookup failed: ${e.message || e}`);
      return { deleted: 0, failed: 0, uids: [], skipped: true, reason: 'lookup_failed' };
    }
  }
  
  // ... existing deletion logic unchanged ...
}
```

### Guard Design Decisions

1. **Fail-safe direction:** If the archive query itself fails (network, permissions), blobs are preserved. This matches the brief's "no data loss" principle.

2. **`_appCtx.companyId` gate:** The guard requires `_appCtx.companyId` to query `projects_archive` (which is company-scoped). If `companyId` is null (users without a company workspace), the guard is skipped — matching the same defensive pattern other ARC features use in that state.

3. **`.limit(1)`:** We only need to know if at least one archive exists, not how many. Single-doc read is cheap.

4. **Return shape:** Extended with `skipped: true` and `reason` so callers can distinguish "no blobs found" from "blobs preserved due to archive." The caller at line 42559 doesn't currently inspect the return value beyond logging, so this is forward-compatible.

### Warning Log Shape

```
[deleteProjectStorageBlobs] skipped — archive abc123 references project PRJ402107
```

Uses `[deleteProjectStorageBlobs]` prefix (function name). Severity: `console.log` (informational, not an error — this is correct behavior). Failure path uses `console.warn` with `[deleteProjectStorageBlobs] skipped — archive lookup failed: {message}`.

### Test Approach

1. **Guard fires:** Archive a test project (Milestone A). Then delete that project from the UI. Verify:
   - Console shows the `[deleteProjectStorageBlobs] skipped` message
   - Storage blobs still exist (check Firebase Storage console or `listAll()`)
   - Project Firestore doc is still deleted (the guard only protects blobs, not the doc)

2. **Guard transparent:** Delete a project that has NOT been archived. Verify:
   - Console shows the normal `[CASCADE DELETE] project {id} — deleted N blob(s)` message
   - Storage blobs are deleted as before

3. **Guard fail-safe:** Temporarily break the archive query (e.g., test against a non-existent collection path). Verify:
   - Console shows the `archive guard query failed` warning
   - Blobs are preserved (not deleted)

---

## 5. `migrateProjectShape()` Invocation Site

### Normal Path

`migrateProjectShape()` is called at `src/app.jsx:8589` inside `loadProjects()`:

```js
return snap.docs.map(d => migrateProjectShape(d.data()));
```

Every project loaded from Firestore passes through this function. It handles: `ecoCounter` default, `activeEcoId` default, `ecoSummary` backfill (kind field), `serviceCards` init, `serviceLines` cleanup, manual quote rev resets, and runaway quote rev normalization.

### Restore Path

In `executeRestore()` step 3, after deep-cloning the archived project data and before applying field resets:

```js
// Step 3: Build project data from archive
let projectData = JSON.parse(JSON.stringify(archive));  // deep clone

// Strip archive envelope fields (not part of project data)
delete projectData.archiveId;
delete projectData.archiveVersion;
delete projectData.archivedAt;
delete projectData.archivedBy;
delete projectData.archiveReason;
delete projectData.originalProjectId;
delete projectData.originalBcProjectNumber;
delete projectData.originalBcEnv;
delete projectData.restoreHistory;
delete projectData.restoreLock;
delete projectData._archiveComplete;

// Run schema migration — handles ECO defaults, serviceCards, quote rev normalization.
// This is a non-standard invocation: normally called inside loadProjects() on every
// Firestore read. Here we call it explicitly because the archive bypasses loadProjects().
// The function is pure (no Firestore reads, no side effects), so this is safe.
projectData = migrateProjectShape(projectData);

// Apply field resets per brief §6 — four categories

// 3a. BC Project-Entity Fields (reset — old BC project gone)
projectData.bcProjectId = null;
projectData.bcProjectNumber = null;
projectData.bcEnv = _bcConfig.env;
projectData.bcCompanyName = _bcConfig.companyName;
projectData.bcPoNumber = null;
projectData.bcPoStatus = null;       // ← resets Kanban to Sales column
projectData.bcPoDate = null;
projectData.bcStatusForcedToQuote = false;
projectData.bcStatusForcedToQuoteAt = null;
projectData.bcPdfAttached = false;
projectData.bcPdfFileName = null;

// 3b. Per-Panel BC Project-Entity Fields (reset)
for (const panel of (projectData.panels || [])) {
  panel.bcPdfAttached = false;
  panel.bcPdfFileName = null;
  panel.bcUploadCount = 0;
  panel.bcUploadQuoteRev = null;
  panel.bcProjectTaskNo = null;  // new tasks created by bcCreatePanelTaskStructure
}

// 3c. Project Lifecycle Fields (reset — clean slate)
projectData.id = null;  // saveProject() will assign a new ID
projectData.wonAt = null; projectData.wonBy = null;
projectData.lostAt = null; projectData.lostBy = null;
projectData.quoteRev = 1;
projectData.quoteRevAtPrint = null;
projectData.lastQuoteHash = null;
projectData.qvHistory = [];

// 3c-review. Pre-review fields (13) — canonical source: line 8284
projectData.preReviewStatus = null;
projectData.preReviewSubmittedAt = null;
projectData.preReviewSubmittedBy = null;
projectData.preReviewApprovedAt = null;
projectData.preReviewApprovedBy = null;
projectData.preReviewNotes = null;
projectData.preReviewAssignedTo = null;
projectData.preReviewAssignedToName = null;
projectData.preReviewRev = 0;              // counter, not null
projectData.preReviewChangeLog = [];        // array, not null
projectData.reviewRev = 0;                  // counter, not null
projectData.reviewRevBumpedThisCycle = false; // boolean
projectData.reviewChangeLog = [];            // array, not null

// 3c-review. Post-review fields (8) — canonical source: line 8292
projectData.postReviewStatus = null;
projectData.postReviewSubmittedAt = null;
projectData.postReviewSubmittedBy = null;
projectData.postReviewApprovedAt = null;
projectData.postReviewApprovedBy = null;
projectData.postReviewNotes = null;
projectData.postReviewAssignedTo = null;
projectData.postReviewAssignedToName = null;
// None of these 21 fields appear in the BC master-data preserved list. All reset.

projectData.ownerLockActive = false;
projectData.ownerTakeoverActive = null;
projectData.ownerTakeoverLog = [];
projectData.editUnlocked = false;
projectData.quotePrintLock = null;
projectData.unlockRequestedBy = null;
projectData.createdBy = uid;
projectData.createdAt = Date.now();
projectData.updatedBy = uid;
projectData.updatedAt = Date.now();
projectData.status = "draft";

// 3d. BC Master-Data Fields — DO NOT RESET
// bcCustomerNumber, bcCustomerName, bcContact*, bcSalesperson*,
// bcProjectManager*, bcDesigner*, per-row bcPartNumber, bcVendorNo,
// bcVendorName, bcPurchasePrice, bcItemCardCost, bcCurrentCost,
// bcVerify, bcItemId, bcItemNumber, per-row bcPoDate — all preserved.
```

### Why This Ordering Matters

`migrateProjectShape()` must run BEFORE field resets because:
- The quote rev normalization logic (line 8676-8684) reads `quoteRev` and `quoteRevAtPrint` — those need to be the archived values, not the reset values (`1` / `null`), otherwise the normalization would fire incorrectly.
- The manual reset table (line 8645-8647) matches on `bcProjectNumber` — we want it to match on the archived `bcProjectNumber` (in case that project is in the reset table), then the field resets clear `bcProjectNumber` afterward.
- `ecoSummary` backfill runs on the archived summary — the resets then decide whether to keep or clear it (keep on restore, clear on copy-with-flatten).

After migration + resets, the project data goes to `saveProject()` which stamps `schemaVersion: APP_SCHEMA_VERSION` and `updatedAt`.

---

## 6. Firestore Rules Diff

Add inside the `match /companies/{companyId}` block (after the `debugLogs` match at line 435, before the `activeExtractions` match at line 442):

```
    // Archive: read-only snapshots of projects for BC reset recovery.
    // Members can read (browse archives), writers can create and update (per-project
    // archive — need update for _archiveComplete flip, restoreHistory, restoreLock),
    // admins can delete.
    match /projects_archive/{archiveId} {
      allow read: if isMember();
      allow create, update: if canWrite();
      allow delete: if isAdminMember();

      // ECO documents from the archived project. Mirrored from projects/{id}/ecos.
      match /_ecos/{ecoId} {
        allow read: if isMember();
        allow create: if canWrite();
        allow delete: if isAdminMember();
      }

      // Panel snapshots from the archived project. Mirrored from projects/{id}/_snapshots.
      match /_snapshots/{snapshotId} {
        allow read: if isMember();
        allow create: if canWrite();
        allow delete: if isAdminMember();
      }
    }
```

This mirrors the brief's §1 rules for the parent, plus subcollection rules for `_ecos` and `_snapshots`. Uses the same helper functions already defined in the `companies/{companyId}` scope:
- `isMember()` — line 142-144
- `canWrite()` — line 152-154 (role != 'view')
- `isAdminMember()` — line 149-151

Subcollection rules don't need `allow update` — archive data is immutable once written. Delete is admin-only for cleanup of partial archives.

### Deployment Note

This requires `firebase deploy --only firestore:rules`. Per CLAUDE.md, Firestore rules deploy separately from hosting. Can be deployed as part of Milestone A before any code changes.

---

## 7. UI Surface Decisions

### 7.1 Bulk Archive Entry Point

**Placement:** Inside `SettingsModal` (line 37799), within the admin-only section that already contains `AdminBudgetSection` (line 38040). Add a new section below the budget section:

```
Admin Tools
├── Budget Settings (existing AdminBudgetSection)
└── Archive All Projects [button]
```

The button opens `BulkArchiveModal` — a full-screen overlay with:
- Confirmation step: "This will archive all N projects. Already-archived projects will be skipped."
- Progress bar: "Archived 45/80 projects..."
- Failure list: "2 failed: [Project A, Project B]. Retry?"
- "Retry" button re-runs, skipping already-archived.

**Why Settings:** This is a one-time admin action (pre-reset), not daily workflow. Settings is where admin-only tools live. No need to clutter the main dashboard.

### 7.2 Per-Project Archive Action

**Placement:** In the project card action area where "Copy" and "Delete" already live (~line 42622). Add "Archive" as a new action, gated by `canWrite()` (edit + admin roles).

The button triggers a confirmation dialog:
> "Archive [Project Name]? This creates a read-only snapshot in Firestore. The original project is not affected."

On confirm: calls `archiveProject()`, shows toast "Archived [Project Name]."

### 7.3 Archive Browser

**Placement:** Accessible from two entry points:
1. **Gear menu** (~line 42538): Add "📦 Archived Projects" entry, admin-only, alongside the existing "🧠 ARC AI Database" entry. Sets `view` to `"archives"`.
2. **Settings modal:** Link from the "Archive All Projects" section — "View Archived Projects →"

**Layout:** Full-page view (like the AI Database view). Table or card layout:
- Columns: Project Name, BC Project #, Archived Date, Archived By, Restore Count
- Search: filter by name or BC project number (client-side, archives are small enough)
- Sort: by `archivedAt` desc (default), name, BC number
- Row actions: "Restore" (edit + admin), "Copy to New Quote" (edit + admin), "Delete" (admin-only)

### 7.4 Restore Preview UX

**Triggered by:** clicking "Restore" or "Copy to New Quote" on an archive in the browser.

**Modal layout — RestorePreviewModal:**

```
┌─────────────────────────────────────────────┐
│ Restore: PRJ402107 - Customer Panel Job     │
│                                             │
│ ⚠ BC Connection Required                   │
│ [Connect to Business Central]               │  ← only shown if !_bcToken
│                                             │
│ ── Reference Check ──────────────────────── │
│                                             │
│ Customer: ACME Corp                         │
│   ✅ Found in BC (name unchanged)           │
│                                             │
│ Items (24 unique):                          │
│   🔴 3 missing from BC                     │
│     PN-1234  [Remap ▾] [Skip]              │
│     PN-5678  [Remap ▾] [Skip]              │
│     PN-9012  [Remap ▾] [Skip]              │
│   🟡 2 with cost drift > 5%                │
│     PN-3456  $12.50 → $14.20 (+13.6%)      │
│       [Accept current] [Keep archived]      │
│   ✅ 19 matched                             │
│                                             │
│ Vendors (6 unique):                         │
│   🔴 1 missing from BC                     │
│     V-001 ACME Supply  [Accept] [Remap ▾]  │
│   ✅ 5 matched                              │
│                                             │
│ ── Labor Rates ──────────────────────────── │
│ Archived: $45/hr → Current: $52/hr          │
│ ☐ Update to current rates                  │
│                                             │
│ ── ECO Handling ─────────────────────────── │  ← only for Copy to New Quote
│ ○ Combine into base BOM                    │
│ ○ Keep ECOs separate                       │
│                                             │
│         [Cancel]  [Restore / Copy]          │
│                                             │
│ ⚠ Customer must be mapped before restore   │  ← blocks button if customer missing
└─────────────────────────────────────────────┘
```

**BC precondition (Restore only):** If `!_bcToken`, the preview loads but the "Restore" button is disabled with tooltip: "Connect to Business Central before restoring." The "Copy to New Quote" button remains enabled (Firestore-only path).

**Blocking rule:** If the customer is missing and not remapped, the Restore/Copy button is disabled. All other missing references are non-blocking (items can be skipped, vendors can be accepted as-is).

### 7.5 Copy to New Quote — ECO Dialog

Part of the RestorePreviewModal (shown above). Only appears when the action is "Copy to New Quote" AND the archive has `ecoCounter > 0`.

Radio buttons:
- **Combine into base BOM** — merge all ECO rows, clear ECO metadata, start fresh
- **Keep ECOs separate** — full ECO recreation (same as restore)

### 7.6 Kanban Stale-State Rendering (Brief §6a)

**Scope:** When `_bcEnvMismatched(project)` (line 346-352) returns true, the project's Kanban card gets visual treatment to signal its column placement is stale.

**Implementation in `ProjectTile` (line 39812):**

The `bcDisconnected` variable already exists at line 39817: `const bcDisconnected = p.bcEnv && p.bcEnv !== _bcConfig.env;`. The `⚠` badge already renders at line 39844. What's new:

1. **Muted card opacity:** Apply `opacity: 0.5` to the card's root `<div>` style when `bcDisconnected` is true. The brief says 0.5 is a starting point — during implementation, tune if cards become too hard to read or too subtle. The card's existing border, background, and text colors remain unchanged; only opacity drops.

2. **Muted border color:** Override `_idleBorderColor` to a neutral gray (e.g., `#64748b55`) when `bcDisconnected` is true, replacing the normal `#4a5080` or the ECO-red `#ef4444`. This prevents the visual conflict of a muted card with a bright accent border.

3. **Tooltip on the `⚠` badge:** Currently the badge has `title={"Linked to " + p.bcEnv}`. Expand to:

   ```
   title={`BC Disconnected — this project was linked to ${p.bcEnv}, which doesn't match your current BC environment (${_bcConfig.env}). Column placement may be stale. Restore from archive or re-link to update.`}
   ```

   **Plan-level decision (tooltip content):** The brief doesn't specify tooltip behavior. The proposed tooltip explains: (a) what's wrong (environment mismatch), (b) why the card looks muted (column placement stale), and (c) what to do about it (restore or re-link). This is informational — no action button inside the tooltip. If Jon wants a clickable "Restore" link in the tooltip, that's a future enhancement (tooltips are title attributes, not interactive elements, in the current card renderer).

4. **No column relocation:** The Kanban grouping functions (lines 39300-39439) are NOT modified. Disconnected projects stay in their current column (Purchasing, Active, Production, etc.). The muted appearance signals staleness without disrupting spatial memory.

5. **Badge visibility across Kanban views:** The `⚠` badge renders inside `ProjectTile`, which is used by ALL Kanban views (Sales/status at line 39601, Purchasing at line 39622, Production, Engineering, Active, etc.). All views use the same `ProjectTile` component. No per-view badge addition needed — confirmed by reading the render sites.

6. **Post-restore auto-clear:** After restore, `bcPoStatus` resets to null (routing to Sales) and `bcEnv` matches `_bcConfig.env`, so `_bcEnvMismatched()` returns false. The muted styling disappears automatically. No manual cleanup.

**Pseudocode for the style change in `ProjectTile`:**

```js
const bcDisconnected = p.bcEnv && p.bcEnv !== _bcConfig.env;

// Existing border color logic — add bcDisconnected override
const _idleBorderColor = bcDisconnected ? '#64748b55'
  : _hasActiveEcoTile ? '#ef4444' : '#4a5080';
const _idleHoverColor = bcDisconnected ? '#64748b88'
  : _hasActiveEcoTile ? '#fca5a5' : (C.accent + '99');

// Root div style — add opacity
style={{
  ...card({padding:"4px 10px"}),
  ...(_tileBg ? {background: _tileBg} : {}),
  border: `1px solid ${_idleBorderColor}`,
  opacity: bcDisconnected ? 0.5 : 1,         // ← NEW
  cursor: isDraggable ? "grab" : "pointer",
  // ... rest unchanged
}}
```

### 7.7 Restore Lock UX (R2 — revised 2026-05-28)

When a user clicks Restore on an archive, `executeRestore()` checks `restoreLock` on the archive document:

**Case 1 — No lock OR stale lock (> 5 min old):** Proceed normally. Write lock, start restore. If the lock was stale, the clicking user effectively takes over via `findResumeDoc()` — they'll resume against the existing in-progress restore's Firestore doc. BC-level idempotency protects data integrity if the original user is still legitimately working past 5 minutes.

**Case 2 — Non-stale lock, `lockedBy === currentUserUid`:** Resume the user's own in-progress restore. Existing `findResumeDoc()` logic handles this — no change.

**Case 3 — Non-stale lock, `lockedBy !== currentUserUid`:** **HARD BLOCK.** No proceed button. No take-over button. The only option is dismiss:

```
This archive is being restored by [User Name].
Please wait until they finish before attempting restore.
(Started [N] minutes ago.)
[OK]
```

**No soft-signal.** The user cannot bypass this — they must wait for the lock to go stale (5 min) or contact the other user.

**What is NOT implemented (deferred):**
- No heartbeat on the lock during long operations — 5-min stale-lock takeover + BC idempotency is sufficient.
- No project-doc-level lock (Option B: `restoreInProgress` on the new project doc to prevent editing during restore). Deferred unless the failure mode "User B edits a half-restored project while User A's restore is running" is observed in practice. Do not add any `restoreInProgress` field to the project doc.

---

## 8. Test Approach

### Milestone A: Archive Write Path + Bulk Archive + Kanban Stale-State

**Smoke tests (archive):**
1. Archive a single project via card menu. Inspect `projects_archive` in Firestore console — verify: envelope fields on parent doc, all panels and BOM rows in parent doc, `_ecos` subcollection contains ECO docs with original IDs, `_snapshots` subcollection contains snapshot docs, `_archiveComplete === true`.
2. Archive the same project again — verify it's skipped (already archived, `_archiveComplete` is true).
3. Bulk archive all projects. Verify progress counter tracks correctly. Verify final count matches.
4. Verify non-admin users can archive (edit role). Verify view-only users cannot.
5. **Partial archive simulation:** Interrupt `archiveProject()` after parent doc write but before `_archiveComplete` flip (e.g., disconnect network). Verify: parent doc exists with `_archiveComplete: false`, archive browser does NOT show it, bulk archive retry does NOT skip it (treats as incomplete, re-runs).

**Smoke tests (Kanban stale-state):**
5. Change BC environment in Settings to a different env name. Verify all project cards on Sales/Purchasing/Production/Engineering tabs render at reduced opacity with muted border.
6. Hover over the `⚠` badge — verify tooltip shows the environment mismatch explanation.
7. Change BC environment back to original — verify cards return to full opacity immediately (no page reload needed, since `_bcConfig.env` updates in memory and `ProjectTile` re-renders).
8. Create a new project with the current env — verify it renders at full opacity while older projects from the previous env remain muted.

**Edge cases (archive):**
- Project with no panels (empty project) — should archive cleanly. `_ecos` and `_snapshots` subcollections empty.
- Project with no ECOs — `_ecos` subcollection empty (0 docs).
- Project with no snapshots — `_snapshots` subcollection empty (0 docs).
- Project with 10+ panels — parent doc may be large but should fit (same size as existing project doc). If Firestore rejects the write, `archiveProject()` catches the error and `_archiveComplete` stays false.

**Edge cases (Kanban stale-state):**
- Project with no `bcEnv` stamp (legacy/solo project) — `_bcEnvMismatched()` returns false, card renders normally. No muting.
- Project with active ECO AND env mismatch — both the ECO red border and the muted opacity should apply. Verify the muted override takes precedence on border color (gray muted, not red ECO border — the ECO state is also stale).
- BC not configured (no `_bcConfig.env`) — `_bcEnvMismatched()` returns false. No muting.

### Milestone B: Deletion Guard

**Smoke tests:**
1. Delete a project that has an archive → blobs preserved, console log shows guard message.
2. Delete a project that has no archive → blobs deleted normally.
3. Delete a project when `_appCtx.companyId` is null (users without a company workspace) → guard skipped, normal deletion.

**Edge case:**
- Archive query permission denied (shouldn't happen with correct rules, but test with a view-only user deleting via direct Firestore SDK — rules should block the delete itself, not just the guard).

### Milestone C: Restore Preview + Drift Detection

**Smoke tests:**
1. Preview an archived project with all references intact in BC → all green checkmarks.
2. Delete an Item from BC, then preview → red flag on that item, remap UI appears.
3. Change an Item's cost in BC beyond 5% → yellow flag with cost delta.
4. Delete a Customer from BC → red flag, restore button disabled until remapped.
5. Delete a Vendor from BC → red flag with accept/remap option.
6. Archive a project with labor rate $45/hr, change company rate to $52/hr → drift shown.

**Edge cases:**
- Archive with 0 BOM rows (empty panels) — preview should show "no items to check."
- Archive from a different BC environment — all references will be missing. Preview should show all-red and still allow remap.
- BC disconnected during preview — show "Connect to Business Central" message.

### Milestone D: Restore Execution

**BC Write Scope Verification (precondition — must pass before any Milestone D test):**

Code audit confirmed (2026-05-28, CCD session against v1.20.22+Milestone A):

| BC function | Writes to | Does NOT write |
|-------------|-----------|----------------|
| `bcCreateProject()` (line 3737) | `/projects` — POST new project, PATCH Bill_to_Customer_No, Status="Quote", dimensions, dates | No PO records, no purchaseQuotes/Lines endpoints |
| `bcCreatePanelTaskStructure()` (line 2772) | OData `ProjectTaskLines` — task hierarchy (10000, 20N00/10/20/99, 99999) | No PO data |
| `bcSyncPanelPlanningLines()` (line 3292) | OData `ProjectPlanningLines` — Billable + Budget lines, auto-fix Item posting groups | No PO data, no customer PO linkage |
| `bcSyncEcoPanelPlanningLines()` (line 3558) | OData `ProjectPlanningLines` — ECO Budget lines only | No PO data |

**What restore writes to BC:**
- New BC Project (with customer linkage to existing master-data Customer)
- Panel task structure (20N00/20N10/20N20/20N99 per panel)
- Planning lines per panel (Progress Billing + labor + BOM items)
- ECO planning lines per ECO per panel (Restore only; Copy-with-flatten skips)
- References to existing BC Items, Customers, Vendors (read-only lookups, no master-data creation/modification)

**What restore does NOT write to BC:**
- Supplier purchase orders (no `purchaseQuotes`/`purchaseQuoteLines` endpoints)
- Customer purchase order numbers (no PO field patched onto BC project)
- Quote line history
- Win/loss state
- Any modification, creation, or duplication of master-data (Items, Customers, Vendors, Users)

**Post-restore BC state verification (mandatory for every Milestone D test run):**
1. ✅ New BC project exists with new project number (different from archived project number)
2. ✅ Panel task blocks exist in BC (10000, 20N00/10/20/99 per panel, 99999)
3. ✅ Planning lines exist in BC (Progress Billing + labor + BOM items per panel)
4. ✅ No new POs created in BC (BC purchase order list unchanged before/after restore)
5. ✅ Customer PO field on new BC project is null/empty (not carried from archived `bcPoNumber`)
6. ✅ `bcPoStatus` and `bcPoNumber` are null on the new Firestore project doc

**Smoke tests:**
1. Full restore of a simple project (1 panel, 10 BOM rows, no ECOs) → new BC project created, task structure correct, planning lines match. Post-restore BC state verification passes.
2. Full restore of a complex project (3 panels, ECOs, snapshots) → all task blocks, all planning lines, ECO subcollection, snapshot subcollection. Post-restore BC state verification passes.
3. Verify `migrateProjectShape()` runs correctly on archived data (check ECO defaults, serviceCards).
4. Verify field resets follow all four categories:
   - BC project-entity: new `bcProjectId`, new `bcProjectNumber`, `bcPoStatus` null, `bcPoNumber` null, `bcPdfAttached` false
   - Per-panel: each panel's `bcPdfAttached` false, `bcUploadCount` 0, `bcProjectTaskNo` null
   - Lifecycle: `quoteRev` = 1, all review fields null, `wonAt`/`lostAt` null, timestamps updated, `createdBy` = restoring user
   - **Master-data PRESERVED**: `bcCustomerNumber`, `bcCustomerName`, `bcContact*`, `bcSalesperson*`, `bcProjectManager*`, `bcDesigner*` all retain archived values. Per-row `bcPartNumber`, `bcVendorNo`, `bcVendorName`, `bcPurchasePrice`, `bcItemCardCost` all retained.
5. Restore the same archive a second time → `restoreHistory` has 2 entries, both projects exist.

**Edge cases — deliberately exercise:**
- **Missing customer:** Remap to a different customer, verify BC project is created with remapped customer number.
- **Missing vendor:** Accept as-is, verify BOM rows retain original vendor info but no BC vendor sync error.
- **Missing item:** Skip 2 items, verify: rows retained in Firestore BOM with `restoreSkipped: true`, `customerSupplied` unchanged from archived value (almost always `false`), planning lines use `Type="Text"` (existing pattern at line 3520-3524), rows visually flagged in restored project BOM so user can review.
- **Cost drift over threshold:** Accept current prices, verify restored BOM rows have updated prices.
- **Concurrent restore — hard block (R2):** User A starts restore. Within 5 minutes, User B (different UID) clicks Restore on the same archive → hard-block dialog shows User A's name with no proceed button. User B cannot bypass. After 5 minutes, User B clicks again → stale lock, User B takes over via `findResumeDoc()`.
- **Concurrent restore — same user resume:** User A starts restore, disconnects, clicks Restore again within 5 minutes → lock check passes (same UID), `findResumeDoc()` finds the in-progress doc, resume continues.
- **Resume after failed BC create:** Start restore, disconnect BC (kill token) after Firestore save but before `bcCreateProject`. Reconnect BC, click "Retry" → detects existing Firestore doc, resumes from BC project creation.
- **Resume after partial panel task block write:** Start restore, disconnect BC after 2 of 4 panels get task blocks. Reconnect, retry → `bcCreatePanelTaskBlock` is idempotent, skips existing tasks, creates missing ones.

### Milestone E: Copy to New Quote

**Smoke tests:**
1. Copy with "Combine into base BOM" → all ECO rows merged, `ecoTag`/`ecoOp`/`ecoNumber` cleared, `ecoCounter` = 0, no ECO subcollection docs.
2. Copy with "Keep ECOs separate" → identical to full restore behavior.
3. Copy without BC connection → Firestore project created, `bcProjectNumber` null, no BC errors.

**Edge cases — ECO flatten scenarios (all three per §2a):**
- **Modify:** Archive a project where ECO 01 modifies a base row (qty delta +2, new description). Flatten. Verify: base row qty = original + 2, description = ECO's new value, ECO row deleted, no ECO metadata on base row.
- **Add:** Archive a project where ECO 01 adds a new row (not in base BOM). Flatten. Verify: row survives with all ECO metadata cleared, treated as base row.
- **Remove:** Archive a project where ECO 01 removes a base row. Flatten. Verify: both the base row AND the ECO remove row are gone from the BOM.
- **Multi-ECO modify stacking:** ECO 01 modifies base row (qty +2), ECO 02 also modifies same base row (qty +3). Flatten. Verify: base row qty = original + 2 + 3 = original + 5, applied in ECO number order.
- **Orphaned reference:** ECO modify row references a base row ID that doesn't exist (corrupted data). Flatten. Verify: ECO row kept as base row (treated as add), warning logged.
- Copy a project that has 0 ECOs → ECO dialog should not appear, just proceed.

---

## 9. Open Questions

### Q1: Firestore 1MB Document Size Limit — RESOLVED

Coach's size analysis confirmed this was a real problem: embedded `_snapshots[]` alone would be 1.5-3MB (10 snapshots × 150-300KB each). The subcollection fix (Critical #1) resolves this — ECOs and snapshots live in subcollections with no size impact on the parent document. The parent archive document is the same size as the original project document (which already fits within 1MB by definition — it's stored in Firestore today).

**Residual concern:** A project with an extremely large panel count (10+ panels, 200+ BOM rows each) could still approach 1MB for the parent doc alone. This mirrors the existing risk for live project documents. The `archiveProject()` function should still catch Firestore write errors gracefully and surface them to the user (bulk archive already handles per-project failures).

### Q2: Skipped Items — What Happens in Restored BOM? — RESOLVED

When the user skips a missing item in the remap UI:

- **Keep the BOM row** — do not remove it.
- **Set `restoreSkipped: true`** as an audit marker on the row.
- **Do NOT touch `customerSupplied`** — leave it at whatever the archived value was (almost always `false`). "Customer Supplied" is a deliberate user assertion about who provides a part, not a system-applied fallback label. Applying it automatically would inject misleading business semantics into quotes.
- **BC planning line:** Fall back to `Type="Text"` (existing pattern at line 3520-3524) for skipped rows. They appear in BC as text lines, not item lines, so no item lookup is attempted.
- **Surface visibly:** Skipped rows must be clearly flagged in the restored project's BOM so the user can review and decide: mark `customerSupplied: true` themselves, remap to a different item, or otherwise resolve.

**Jon confirmed.** The system never asserts `customerSupplied` on the user's behalf.

### Q3: ECO Flatten — Modification Row Semantics — RESOLVED

All three ECO operation types are now fully specified in the new §2a "ECO-to-Base-Row Linkage and Flatten Semantics" section above. Summary:
- **Modify:** Option B confirmed — overlay base row with ECO field deltas (qty is additive: `ecoOriginal.qty + ecoRow.qty`), delete the ECO row. Grounded in the actual delta semantics at line 879-881.
- **Add:** Keep the row, clear ECO metadata. No base-row interaction.
- **Remove:** Delete both the base row and the ECO row.

Linkage is by row ID (`ecoModifiesBaseRowId`), which is stable across archive→restore→flatten. Edge cases for multi-ECO modify stacking and orphaned references are documented.

### Q4: Archive Document Structure — Envelope vs. Nested Project — RESOLVED

With the subcollection fix (Critical #1), this question dissolves. Heavy data (ECOs, snapshots) lives in subcollections. The parent document is flat: archive envelope fields + project fields at the top level. Envelope field names (`archiveId`, `archivedAt`, `_archiveComplete`, etc.) don't collide with project field names. On restore, strip envelope fields via a known list.

**Option A (flat) confirmed by Analyst.**

### Q5: Personal Accounts — REMOVED

The premise was wrong. There are no "personal accounts" in ARC — the application requires a BC connection to operate. The `!_appCtx.companyId` pattern in the code is a defensive check for users without a company workspace, not a real user-facing account type. No special-casing needed. If the defensive null-check fires somewhere, archive features follow whatever pattern other ARC features already use in that state.

**Jon confirmed: question removed from plan scope.**

### Q6: BC Rate Limiting on Bulk Restore

If Jon restores 80 projects in sequence, each with 3 panels and 50 BOM rows, that's:
- 80 × `bcCreateProject` = 80 API calls
- 80 × `bcCreatePanelTaskStructure` = 80 calls (each internally creates ~10 tasks)
- 80 × 3 × `bcSyncPanelPlanningLines` = 240 calls (each internally creates ~50 lines)
- Total: ~thousands of BC API calls

The existing exponential backoff (1s/2s/4s on 429) handles individual rate limits, but restoring 80 projects sequentially could take hours.

**This is informational, not blocking.** The restore is per-archive (one at a time via the browser UI), not a bulk-restore-all button. Jon will restore projects one at a time or in small batches. If bulk restore becomes needed, it's a future enhancement.

**No decision needed** — just flagging the constraint.

### Q7: `_ecos` Subcollection Document IDs on Restore — RESOLVED

Preserve original ECO document IDs. BOM rows reference ECOs via `ecoTag` (which holds the ecoId), and `activeEcoId` on the project doc holds an ecoId. Remapping would force a fragile rewrite across every BOM row in every panel. The new project's `ecos` subcollection starts empty, so no collision risk.

**Analyst confirmed.** This is also consistent with the archive subcollection approach — `archiveProject()` step 3 already writes to `_ecos/{originalEcoId}` preserving the original ID.

---

## Plan-Level Decisions (Not in Brief)

### P1: Kanban Tooltip Content for BC-Disconnected Cards

The brief specifies muted rendering but doesn't define hover/tooltip behavior. This plan proposes:

**Tooltip text (on the `⚠` badge):**
> "BC Disconnected — this project was linked to [old env], which doesn't match your current BC environment ([current env]). Column placement may be stale. Restore from archive or re-link to update."

This uses a native `title` attribute (no custom tooltip component). It explains what's wrong, why the card is muted, and what action to take. A clickable "Restore" link is not proposed because `title` attributes don't support interactive content and building a custom tooltip component is scope creep for this feature.

If Jon wants richer tooltip behavior (click-through to archive browser, dismiss option), flag it as a future enhancement after the base feature ships.

### P2: ECO Border vs. Muted Border Priority

When a project has both an active ECO (red border) AND a BC environment mismatch, which visual wins? The plan proposes: **muted wins**. Rationale: the ECO state is also stale — the ECO was for the old BC project which no longer exists. Showing a red ECO border on a stale project would be misleading (it implies the ECO is actionable). The muted gray border correctly signals "this entire card's state is stale."

---

## Deviations from Brief

**D1: Subcollection storage (vs. brief §2 embedded arrays).** The brief specifies `_snapshots[]` and `_ecos[]` as embedded arrays in the archive document. The plan uses subcollections instead. This is a necessary deviation — Coach's size analysis proved embedded arrays would exceed Firestore's 1MB document limit on real production data. The subcollection approach preserves the same data with the same semantics; only the storage topology changes. Brief §2's subcollection table should be updated to reflect this.

**D2: `_archiveComplete` flag (not in brief).** Added per Analyst requirement. The brief assumed atomic single-document writes. Subcollections make writes non-atomic, requiring a completion flag to prevent partial archives from being treated as complete.

No other deviations. Plan-level decisions P1 and P2 fill gaps the brief intentionally left to the implementation plan. All open questions resolved: Q1/Q3/Q4/Q7 by Coach+Analyst consensus, Q2/Q5 by Jon ruling. Q6 is informational (no decision needed).

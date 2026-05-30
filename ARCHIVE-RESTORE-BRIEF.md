# Matrix ARC — Project Archive/Restore: Final Design Brief

**Version:** 1.1 — 2026-05-27
**Status:** Verified against repo at v1.20.22, all assumptions grounded in code.
**Audience:** ARC Development (Claude Code Desktop) for implementation planning.
**Review chain:** Senior Coding Analyst (original design) → Coach (verification + refinement) → Jon (product decisions) → this document.
**Revision 1.1:** Added §6a (Kanban stale-state handling for BC-disconnected projects), expanded §6 field reset table with per-panel and BC project-entity fields, clarified master-data vs. project-entity field categories.

---

## Purpose

Preserve all Project data in Firestore before BC Database reset. Restore archived projects as new Projects in any BC environment. Support multiple archive/reset/restore cycles during BC implementation testing. Support Copy to New Quote from archived projects with ECO flatten/keep option.

## Scope

**In scope:**
- Bulk archive all projects (admin-only, one-time pre-reset action)
- Per-project archive (edit + admin roles)
- Full restore with ECOs recreated faithfully (edit + admin)
- Copy to New Quote with ECO combine/keep option (edit + admin)
- Archive browser with search
- Restore preview with reference drift detection (Items, Customers, Vendors)
- Storage blob deletion guard
- Multiple restore cycles from the same archive
- Kanban stale-state visual treatment for BC-disconnected projects (§6a)

**Out of scope:**
- Storage blob archiving (Firebase Storage survives BC reset; blobs protected by deletion guard)
- Company/member/config backup
- Scheduled/automated archiving
- Cloud Storage export
- Editing archived data
- Partial project restore (single panel)
- Archive deletion/TTL (indefinite retention, negligible Firestore cost)
- Full system backup utility (future project, tabled)

---

## 1. Archive Storage

**Collection:** `companies/{companyId}/projects_archive/{archiveId}`

**Firestore rules:**
```
match /projects_archive/{archiveId} {
  allow read: if isMember();
  allow create, update: if canWrite();
  allow delete: if isAdminMember();
}
```

Mirrors project rules for membership. Create and update are open to edit+admin (per-project archive, `_archiveComplete` flip, restoreHistory, restoreLock). Delete restricted to admin (cleanup of partial archives).

**Security:** All operations run within the authenticated user's `_appCtx.companyId`. No cross-company archive access is possible at the Firestore rules layer. `isMember()` checks `companies/{companyId}/members/{uid}` exists.

---

## 2. What Gets Archived

A deep clone of one project's full Firestore state, plus archive envelope metadata.

### Archive Envelope Fields

| Field | Type | Purpose |
|-------|------|---------|
| `archiveId` | string | Document ID |
| `archiveVersion` | int | Archive format version (start at 1) |
| `schemaVersion` | int | `APP_SCHEMA_VERSION` at archive time |
| `archivedAt` | timestamp | When archived |
| `archivedBy` | string | UID |
| `archiveReason` | string | `"pre-reset"`, `"user-initiated"` |
| `originalProjectId` | string | Firestore doc ID of source project |
| `originalBcProjectNumber` | string | BC project number for audit linkage |
| `originalBcEnv` | string | BC environment at archive time |
| `restoreHistory` | array | `[{bcProjectNumber, bcEnvironment, restoredAt, restoredBy, mode: "restore"\|"copy"}]` |
| `restoreLock` | object\|null | `{lockedBy: uid, lockedByName: string, lockedAt: timestamp}` — see §7 |

### Project Document Fields (all captured)

Every field on the project document is archived as-is. Key categories:

| Category | Key Fields |
|----------|------------|
| **Identity** | `id`, `name`, `bcProjectNumber`, `createdBy`, `createdAt`, `updatedBy`, `updatedAt`, `schemaVersion` |
| **Status** | `status`, `bcPoStatus`, `bcPoDate`, `wonAt`, `lostAt` |
| **Quote tracking** | `quoteRev`, `quoteRevAtPrint`, `lastQuoteHash`, `qvHistory` |
| **ECO state** | `ecoCounter`, `activeEcoId`, `ecoSummary`, `ecoFirstCreatedAt`, `ecoEditUnlocked*` |
| **Review workflow** | All `preReview*` and `postReview*` fields |
| **Owner locks** | `ownerLockActive`, `ownerTakeoverActive`, `ownerTakeoverLog`, `editUnlocked` |
| **Pricing** | `effectivePanelTotals` |
| **Service cards** | `serviceCards[]` |
| **BC force flags** | `bcStatusForcedToQuote`, `bcStatusForcedToQuoteAt` |
| **BC env** | `bcEnv`, `bcCompanyName` |

Full field reference: `saveProject` at `src/app.jsx:8147-8369`.

### Panel Array (inline, each panel)

| Category | Key Fields |
|----------|------------|
| **Identity** | `id`, `name`, `lineQty`, `status` |
| **Drawing** | `drawingNo`, `drawingDesc`, `drawingRev`, `bomVersion` |
| **Pages** | `pages[]` — each with `pageNumber`, `storageUrl`, `pageType`, `bomRegion`, `extractionPath`, `reviewNotes[]`, `reviewShapes[]` |
| **BOM** | `bom[]` — each row: `partNumber`, `description`, `manufacturer`, `vendor`, `qty`, `unitPrice`, `uom`, `priceSource`, `priceDate`, `bcPartNumber`, `bcVendorNo`, `leadTimeDays`, `leadTimeSource`, `ecoTag`, `ecoOp`, `ecoNumber`, `ecoModifiesBaseRowId`, `customerSupplied`, `isCrossed`, `crossedFrom`, `confidence`, and all other BOM row fields |
| **Analysis** | `validation`, `laborData`, `complianceReview`, `schematicAnalysis`, `engineeringQuestions[]` |
| **Pricing** | `pricing` object (margin, laborRate, ecoLaborRate, discounts, etc.) |

Full BOM row schema: ~40 fields per row. Archive captures all of them.

### Subcollections (fetched and embedded as arrays)

| Subcollection | Embedded As | Contents |
|---------------|-------------|----------|
| `_snapshots/{id}` | `_snapshots[]` | Panel state backups (panelId, reason, bom, pricing, validation, laborData, status). Max 10 per project. |
| `ecos/{id}` | `_ecos[]` | Full ECO documents: status, kind, customer approval state, internal review, sent/approval metadata, timestamps. Immutable audit records. |

### Reference Snapshots

For each Item/Customer/Vendor reference, the archive freezes the values already stored on the project. No additional snapshot fetch is needed at archive time — BOM rows already contain `partNumber`, `description`, `unitPrice`, `bcPartNumber`, `bcVendorNo`, `bcVendorName`, `bcPurchasePrice`, `bcItemCardCost`, `leadTimeDays`, etc. Customer info is on the project header. These frozen values are compared against live BC data at restore time.

---

## 3. Archive Triggers

### Bulk Archive (Admin-Only)

Button in admin/settings area: "Archive All Projects."

1. Load all project IDs from `companies/{companyId}/projects`
2. Check which already have a corresponding `projects_archive` document (by `originalProjectId`)
3. Skip already-archived projects
4. For each remaining project:
   a. Fetch the project document
   b. Fetch `_snapshots` subcollection
   c. Fetch `ecos` subcollection
   d. Write archive document to `projects_archive`
5. Update progress counter in UI
6. On per-project failure: log error, continue to next project
7. On completion: show summary — "Archived 78/80 projects. 2 failed: [names]. Retry?"

"Retry" re-runs the same logic — skips already-archived, retries failed. Each archive is a single independent Firestore write.

### Per-Project Archive (Edit + Admin)

"Archive" action in project context menu. Confirmation dialog:

> "Archive [Project Name]? This creates a read-only snapshot in Firestore. The original project is not affected."

Same steps as bulk but for a single project.

**Archiving does NOT delete projects from Firestore or BC.** It only creates the snapshot.

---

## 4. Storage Blob Deletion Guard

**Location:** Modify `deleteProjectStorageBlobs()` at `src/app.jsx:8704-8735`.

**Behavior:** Before deleting pageImages blobs for a project, query `companies/{companyId}/projects_archive` for any document with `originalProjectId` matching the project being deleted. If an archive exists, skip blob deletion and log:

```
[CASCADE DELETE] skipped — project {projectId} has active archive(s), preserving Storage blobs
```

**Fail-safe direction:** Archive exists → blobs preserved. No archive → current deletion behavior unchanged. This is a ~10-line guard addition to the existing function.

**Scope of guard:** Covers `pageImages/{uid}/{projectId}/**`. Note: `originalPdfs` are already not cleaned up on project deletion (existing gap, not introduced by this feature).

---

## 5. Restore Flow (Edit + Admin)

### Step 1 — Archive Browser

New view (tab or modal) showing all archived projects from `companies/{companyId}/projects_archive`. Sortable by `archivedAt`, searchable by project name and `originalBcProjectNumber`. Shows restore history count per archive.

### Step 2 — Restore Preview

User selects archive, clicks "Restore" or "Copy to New Quote."

**Three reference categories checked against live BC data:**

| Reference | Archived Source | Live Check | Red Flag | Yellow Flag |
|-----------|----------------|------------|----------|-------------|
| **Items** | BOM row `partNumber`, `bcPartNumber`, `unitPrice` | BC Items list lookup | Item missing from BC | Cost delta > `COST_DRIFT_THRESHOLD` (default 5%), description change |
| **Customer** | Project `customerNumber`, `customerName` | BC Customer lookup | Customer missing from BC | Name change |
| **Vendors** | BOM row `bcVendorNo`, `bcVendorName` | BC Vendor lookup | Vendor missing from BC | Name change |

`const COST_DRIFT_THRESHOLD = 0.05;` — named constant, configurable without a release.

**Labor rate drift (informational):**
> "Archived shop labor rate: $45/hr → Current company rate: $52/hr"

User can accept archived rates (preserve original quote economics) or opt to update to current rates. Checkbox in preview, default: keep archived rates.

**Pre-condition:** Active BC connection required for Restore. If `!_bcToken`, preview shows: "Connect to Business Central before restoring." Copy to New Quote can proceed without BC connection (Firestore-only, BC sync deferred).

### Step 3 — Remap UI

For each flagged reference:

| Reference Type | Options |
|----------------|---------|
| **Missing Item** | Remap to different item, mark customer-supplied, skip (exclude from BOM) |
| **Cost/description drift** | Accept current live data, keep archived values |
| **Missing Customer** | Remap to different customer. **Restore cannot proceed without a valid customer** — required for `bcCreateProject`. |
| **Missing Vendor** | Accept (BOM rows can exist without vendor assignment), remap to different vendor |

### Step 4 — Mode Selection (Copy to New Quote only)

Dialog: "How should ECOs be handled?"

- **Combine into base BOM** — merge all ECO-tagged BOM rows into primary BOM, clear `ecoTag`/`ecoOp`/`ecoNumber`/`ecoModifiesBaseRowId`, reset `ecoCounter` to 0, clear `ecoSummary`. Project starts with a clean, consolidated BOM.
- **Keep ECOs separate** — same as full restore, ECOs recreated as-is.

### Step 5 — Write (Firestore first, BC second)

**Data sources noted explicitly for each step:**

1. **Save new project doc to Firestore** — source: archived project data, passed through `migrateProjectShape()`, with fields reset per §6. Set `_restoringFromArchive: archiveId` and `bcProjectNumber: null`.

2. **`bcCreateProject(name, customerNumber)`** — source: archive envelope + remap selections. Returns new BC project number.

3. **Update Firestore doc** with `bcProjectNumber` and `bcEnv: _bcConfig.env`.

4. **`bcCreatePanelTaskStructure(newProjectNumber, name, panels)`** — source: in-memory panels array from archive.

5. **`bcSyncPanelPlanningLines(...)` per panel** — source: in-memory `panel.bom` (base rows filtered by `!ecoTag`).

6. **`bcSyncEcoPanelPlanningLines(...)` per panel per ECO** — source: in-memory `panel.bom` (rows filtered by `ecoTag`/`ecoNumber`). **Does not require Firestore `ecos` subcollection to exist** — function reads entirely from in-memory BOM rows (confirmed: zero Firestore queries in this function).

7. **Recreate `ecos` subcollection** documents under new project — source: embedded `_ecos[]` array from archive.

8. **Recreate `_snapshots` subcollection** documents under new project — source: embedded `_snapshots[]` array from archive.

9. **Clear `_restoringFromArchive` flag.** Append to archive's `restoreHistory[]`.

10. **Navigate** to new project.

### Step 6 — Completion

User sees the new project with its new BC project number. Archive record updated with restore event.

---

## 6. Fields Reset on Restore / Copy

Fields are categorized by why they reset. BC project-entity fields are tied to the old BC project (wiped by reset). BC master-data fields (Items, Customers, Vendors, Users) survive the reset and are preserved.

### BC Project-Entity Fields (reset — old BC project no longer exists)

| Field | Reset To | Reason |
|-------|----------|--------|
| `bcProjectId` | New (from `bcCreateProject`) | Old BC project GUID gone |
| `bcProjectNumber` | New (from `bcCreateProject`) | Old BC project number gone |
| `bcEnv` | `_bcConfig.env` | Targets current BC environment |
| `bcCompanyName` | `_bcConfig.companyName` | Targets current BC company |
| `bcPoNumber` | null | PO tied to old BC project |
| `bcPoStatus` | null | Status of old BC project; resets Kanban to Sales column |
| `bcPoDate` | null | PO date tied to old BC project |
| `bcStatusForcedToQuote` | false | Force flag for old BC project |
| `bcStatusForcedToQuoteAt` | null | Timestamp of old force flag |
| `bcPdfAttached` | false | PDF was attached to old BC project |
| `bcPdfFileName` | null | Filename on old BC project |

### Per-Panel BC Project-Entity Fields (reset)

| Field | Reset To | Reason |
|-------|----------|--------|
| `bcPdfAttached` | false | Attached to old BC project |
| `bcPdfFileName` | null | Filename on old BC project |
| `bcUploadCount` | 0 | Upload counter for old BC project |
| `bcUploadQuoteRev` | null | Quote rev at time of old upload |
| `bcProjectTaskNo` | null | Task slot in old BC project; new task blocks are created by `bcCreatePanelTaskStructure` |

### Project Lifecycle Fields (reset — clean slate in new environment)

| Field | Reset To | Reason |
|-------|----------|--------|
| `id` | New document ID | New Firestore document |
| `wonAt` / `wonBy` | null | Not won yet in new env |
| `lostAt` / `lostBy` | null | Not lost yet |
| `quoteRev` | 1 | Fresh quote cycle |
| `quoteRevAtPrint` | null | No prints yet |
| `lastQuoteHash` | null | No hash baseline |
| `qvHistory` | [] | Fresh history |
| `preReview*` / `postReview*` | null (all review fields) | Fresh review cycle |
| `ownerLockActive` | false | No active session |
| `ownerTakeoverActive` | null | No takeover |
| `ownerTakeoverLog` | [] | Fresh audit |
| `editUnlocked` | false | Default locked state |
| `quotePrintLock` | null | No active print |
| `unlockRequestedBy` | null | No request |
| `createdBy` | Restoring user's UID | New project |
| `createdAt` | Now | New project |
| `updatedBy` | Restoring user's UID | New project |
| `updatedAt` | Now | New project |

### BC Master-Data Fields (PRESERVED — survive BC reset)

These reference Items, Customers, Vendors, and Users which are unaffected by the BC Database reset:

| Field | Preserved | Reason |
|-------|-----------|--------|
| `bcCustomerNumber`, `bcCustomerName` | Yes | Customer master data survives reset |
| `bcContactNo`, `bcContactName`, `bcContactEmail`, `bcContactPhone` | Yes | Customer contacts survive reset |
| `bcSalespersonCode`, `bcSalesperson`, `bcSalespersonUid` | Yes | BC users survive reset |
| `bcProjectManagerCode`, `bcProjectManager`, `bcProjectManagerUid` | Yes | BC users survive reset |
| `bcDesignerCode`, `bcDesigner`, `bcDesignerUid` | Yes | BC users survive reset |
| Per-row: `bcPartNumber`, `bcVendorNo`, `bcVendorName` | Yes | Items/Vendors survive reset |
| Per-row: `bcPurchasePrice`, `bcItemCardCost`, `bcCurrentCost` | Yes | Item pricing (validated in restore preview) |
| Per-row: `bcVerify`, `bcItemId`, `bcItemNumber` | Yes | Item card references survive reset |
| Per-row: `bcPoDate` (Purchase Price start date) | Yes | Item-level date, not project PO date |

### Other Preserved Fields

`name`, `status` (set to `"draft"`), all panel data (drawing metadata, pages, BOM rows, validation, laborData, pricing config, engineeringQuestions), `serviceCards`, `ecoCounter`/`ecoSummary`/`activeEcoId` (on Restore; cleared on Copy-with-flatten).

### Additional Resets for Copy to New Quote with ECO Flatten

| Field | Reset To |
|-------|----------|
| `ecoCounter` | 0 |
| `ecoSummary` | [] |
| `activeEcoId` | null |
| `ecoFirstCreatedAt` | null |
| BOM row `ecoTag`, `ecoOp`, `ecoNumber`, `ecoModifiesBaseRowId` | Cleared on all rows |

---

## 6a. Kanban Stale-State Handling for BC-Disconnected Projects

### Problem

After a BC environment swap, projects with stale `bcPoStatus` (e.g., `"purchasing"`, `"Open"`) remain in their old Kanban columns. The `⚠ BC Disconnected` badge appears on project tiles (line 39844) and project headers (line 31024), but the Kanban column routing logic (lines 39304-39434) uses the stale `bcPoStatus` value without any visual differentiation. Users cannot tell at a glance which cards in Purchasing or Active columns reflect pre-swap state vs. live state.

### Design

**On restore:** `bcPoStatus` resets to `null`. The restored project routes to the Sales column — clean slate. No special Kanban handling needed post-restore.

**For disconnected projects (not yet restored):** Add a Kanban-level visual treatment so users can identify pre-swap cards without opening each one.

**Implementation:**

1. **Muted card rendering:** When `_bcEnvMismatched(project)` returns true, render the Kanban card with reduced opacity (`opacity: 0.5`) and a muted border color. The card stays in its current column — preserving spatial memory for users who know where their projects were — but the muted appearance signals the column placement is stale.

2. **Disconnected badge on cards:** The `⚠ BC Disconnected` badge already renders on project tiles at line 39844. Confirm it's visible in all Kanban views (Sales, Purchasing, Production, Active tabs). If any Kanban tab uses a different card renderer that skips the badge, add it.

3. **No column relocation:** Do NOT move disconnected projects to a separate column or back to Sales. That would disrupt spatial memory and make the Kanban confusing when half the board shifts. The muted styling communicates "stale placement" without relocating cards.

4. **Post-restore cleanup:** After a project is restored, `bcPoStatus: null` routes it to Sales and `bcEnv` matches `_bcConfig.env`, so the muted styling disappears automatically. No manual cleanup needed.

**Kanban column fields affected by stale `bcPoStatus`:**

| Column | Routing Condition | Stale When |
|--------|-------------------|------------|
| Purchasing → IN PROCESS | `bcPoStatus === "purchasing"` | Old PO no longer exists in new BC |
| Purchasing → TO BE PURCHASED | `bcPoStatus === "Open"` | Old project status stale |
| Purchasing → COMPLETED | `bcPoStatus === "purchased" \|\| "Completed"` | Old completion status stale |
| Production → IN PURCHASING | `bcPoStatus === "Open" \|\| "purchasing"` | Old status stale |
| Production → IN PRODUCTION | `bcPoStatus === "purchased" \|\| "Completed"` | Old status stale |
| Active | `bcPoStatus === "Open"` | Old status stale |
| Sales | Filtered OUT when `bcPoStatus === "purchasing" \|\| "Open"` | Projects stuck in wrong tab |

All of these become accurate again after restore resets `bcPoStatus` to `null`.

---

## 7. Restore Idempotency and Failure Handling

### Idempotency Unit

The Firestore project document is the checkpoint. The `bcProjectNumber` field is the resume key. The `_restoringFromArchive` field identifies an in-progress restore.

### Resume Flow

On "Restore" click:
1. Check if a Firestore project doc exists with `_restoringFromArchive: archiveId`. If found, this is a **resume** — read its `bcProjectNumber` and skip to the appropriate step.
2. If `bcProjectNumber` is null → resume from step 2 (BC project creation).
3. If `bcProjectNumber` is set → resume from step 4 (panel task blocks onward).
4. All BC write functions are idempotent: `bcCreatePanelTaskBlock` probes before creating, `bcSyncPanelPlanningLines` diffs before writing. Safe to re-run.

**"Retry" never creates orphaned BC projects.** It detects the existing Firestore doc and resumes against its recorded `bcProjectNumber`.

### Failure Surface

If BC fails at any step after Firestore save, surface the failure to the user:
- Which step failed
- Per-row failure detail from `bcSyncPanelPlanningLines` (returns `{ created, updated, failed[] }`)
- "Retry" button that resumes from the failed step

### Concurrent Restore Prevention

**Mechanism:** UI-level debounce + archive-level lock with hard block.

1. Restore button disables immediately on click, shows spinner.
2. Before starting, read `restoreLock` on the archive document.
3. If no lock OR lock is stale (> 5 minutes old): proceed — write `restoreLock: { lockedBy: uid, lockedByName: userName, lockedAt: timestamp }`.
4. If non-stale lock exists AND `lockedBy === currentUserUid`: same user's own in-progress restore — proceed to resume via `findResumeDoc()`.
5. If non-stale lock exists AND `lockedBy !== currentUserUid`: **HARD BLOCK** — display "This archive is being restored by [lockedByName]. Please wait until they finish before attempting restore. (Started [N] minutes ago.)" No proceed or take-over button. User must wait for the lock to go stale or contact the other user.
6. On completion or failure, clear `restoreLock`.

**Stale lock takeover policy:** The 5-minute TTL is a UI convenience. If a lock goes stale, the next user who clicks Restore takes over — they'll resume against the existing in-progress restore via `findResumeDoc()`. If the original user is still legitimately working past 5 minutes, the BC-level idempotency protects data integrity: both restore attempts converge on the same BC project number via the `_restoringFromArchive` checkpoint. No heartbeat mechanism is needed. ARC Dev should not add heartbeating — it adds complexity for a scenario already handled at the data layer.

**Deferred:** Project-doc-level lock during restore (preventing edits on the half-restored project while restore runs). Not implemented unless the failure mode is observed in practice.

---

## 8. BC Environment Handling

Restore implicitly targets the active BC connection (`_bcConfig.env`). No environment selection UI needed.

- Restored project gets `bcEnv: _bcConfig.env` and `bcCompanyName: _bcConfig.companyName` stamped at restore time.
- This is correct for the BC reset scenario: admin switches to the new BC environment, then restores projects into it.
- `restoreHistory[]` records `bcEnvironment: _bcConfig.env` for audit.
- If BC environment changes after restore, the existing `_bcEnvMismatched()` function (line 346-352) blocks further syncs and shows "BC Disconnected" badge — standard behavior, no special handling needed.

---

## 9. Schema Versioning

- `archiveVersion` (on envelope): tracks archive format. Start at 1. Bump when envelope fields change. Add `migrateArchiveShape()` if needed.
- `schemaVersion` (captured from project): tracks project data version. Captured at archive time from `APP_SCHEMA_VERSION`.
- On restore: run existing `migrateProjectShape()` (`src/app.jsx:8598-8687`) on archived project data before creating new project doc. This function already exists and runs on every project load — handles `ecoCounter`, `activeEcoId`, `ecoSummary`, `serviceCards`, deprecated field removal, quote rev normalization.
- If archive format changes in the future, add `migrateArchiveShape()` — analogous pattern to `migrateProjectShape()`.

---

## 10. Dependency Chain

| Finding | Status | Impact on This Feature |
|---------|--------|------------------------|
| #22 (addPanel BC tasks) | **RESOLVED** (v1.19.1005) | None — task blocks work. |
| #18 (Cloud Functions source) | **RESOLVED** (2026-05-12) | None — functions deployable. |
| #26 (deploy.sh worktree hazard) | **OPEN** | Process item: merge to master before deploying. No new CFs needed for this feature (all client-side), so impact is minimal. |
| #15 (no functions deploy in deploy.sh) | **OPEN** | Same — no new CFs needed. If CFs are added later, manual `firebase deploy --only functions` required. |
| C15 (re-extraction verification gap) | **OPEN** | Not blocking. Archive captures extraction state as-is. |

**No code blockers. No findings must be closed before implementation.**

---

## 11. Architecture Notes

- **No new Cloud Functions needed.** Archive writes to Firestore via client SDK. Restore uses existing client-side BC API functions (`bcCreateProject`, `bcCreatePanelTaskStructure`, `bcSyncPanelPlanningLines`, `bcSyncEcoPanelPlanningLines`). All client-side, all idempotent.
- **Existing BC write path is complete:** Project → Panels (4-task blocks) → Planning Lines (BOM + labor) → ECO task slots + planning lines. No gaps in the write path for restore.
- **Rate limiting:** BC API rate limiting is already handled by exponential backoff (1s/2s/4s on 429, 300ms delay between operations). Large project restores with many panels/BOM rows will be slow but reliable.
- **Offline queue:** If `_bcToken` is unavailable during restore, BC operations can be enqueued to `localStorage['_arc_bc_queue']` for later replay. This is existing infrastructure — restore should use the same pattern for graceful degradation.

---

## Summary of Key Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Archive storage | Separate `projects_archive` collection | Avoids modifying complex Firestore rules on `projects` collection |
| ECO handling on Restore | Full recreation | Jon: "restored to its original state, ECOs and all" |
| ECO handling on Copy to New Quote | User chooses flatten or keep | Jon: "option should come up for the User" |
| Restore permissions | Edit + Admin | Revised from admin-only — writers can restore (same permission as per-project archive and copy to new quote) |
| Copy to New Quote permissions | Edit + Admin | Creates a new project (same as existing project creation permission) |
| Write order | Firestore first, BC second | Recoverable: Firestore doc exists as checkpoint for retry |
| BC environment | Implicit from active connection | Correct for BC reset scenario; `_bcEnvMismatched()` handles drift |
| Labor rates on restore | Keep archived, surface drift in preview | Preserves original quote economics; user can opt to update |
| Storage blob protection | Deletion guard on `deleteProjectStorageBlobs()` | Cheap insurance; fails safe |
| Multiple restore cycles | Supported via `restoreHistory[]` array | Required for BC implementation testing |
| Stale restore lock | Accept risk, rely on resume semantics | Data-layer idempotency handles the edge case; no heartbeat needed |
| Cost drift threshold | Named constant `COST_DRIFT_THRESHOLD = 0.05` | Configurable without release |
| Kanban stale-state handling | Muted card rendering for BC-disconnected projects | Visual signal without column relocation; auto-clears after restore |
| BC field reset categories | Project-entity fields reset, master-data fields preserved | Items/Customers/Vendors survive BC reset; only project-tied fields go stale |

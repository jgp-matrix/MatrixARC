# Milestone D Detailed Implementation Plan — Restore Execution

**Based on:** Master plan (`ARCHIVE-RESTORE-PLAN.md` v4), D supplement (`ARCHIVE-RESTORE-PLAN-D-SUPPLEMENT.md` Spec v3), Cost-source hotfix (`ARCHIVE-RESTORE-PLAN-C-COST-SOURCE-HOTFIX.md`)
**Repo state:** v1.20.41, commit `a3e4d25e`, master
**Author:** CCD (Claude Code Desktop)
**Prerequisite:** Milestone C deployed (v1.20.28–v1.20.39), cost-source hotfix deployed, smoke test confirmed
**Status:** Draft v3 — Analyst Z-findings (Z1–Z10) folded in. Z9 bug fix is load-bearing. Ready for Jon greenlight.
**v1→v2 changes:** Phase 0 fix deployed — `bcAddEcoTask` and `bcCreateEcoTaskPlanningSkeleton` now have probe-before-create idempotency (v1.20.40, `87b13eaf`; console.warn traceability v1.20.41, `a3e4d25e`). §5.5 updated to confirm all three ECO functions are now idempotent. §6.6 A5 smoke test updated to clarify it validates the Phase 0 fix (supplement claim was wrong).
**v2→v3 changes:** Analyst architectural-risk review (Z1–Z10). Z9 is a real bug: step 10 snapshot recreation used `.add()` (auto-ID), making retries create duplicate docs — fixed to `.doc(doc.id).set()`. Z2: `buildRestoreProjectData` purified (pass `bcEnv`/`bcCompanyName` as params). Z5: step 6 failure now fast-exits steps 7–8. Z1: uid/userName source unified. Z6: `findResumeDoc` handles multi-doc edge case. Z7: Start Fresh tags orphan docs. Z4: empty-panels defensive warning. Z8: `archiveId` resolution centralized. Z10: lock create/release symmetry. Z3: `migrateProjectShape` purity verification note added.

---

## Table of Contents

1. [File/Module Structure](#1-filemodule-structure)
2. [Function Signatures + Pseudocode](#2-function-signatures--pseudocode)
3. [Implementation Sequence](#3-implementation-sequence)
4. [UI Surface Specifications](#4-ui-surface-specifications)
5. [Restore Execution Specifics](#5-restore-execution-specifics)
6. [Test Approach](#6-test-approach)
7. [Open Questions](#7-open-questions)

---

## 1. File/Module Structure

All implementation lives in `src/app.jsx` (the monolith). No new files created. No Firestore rules changes (Milestone A already deployed `projects_archive` rules).

### 1.1 New Functions

| Function | Insertion point | Purpose |
|----------|----------------|---------|
| `acquireRestoreLock(archiveId, uid, userName)` | After `buildRestorePreview` (~line 9220, after the cache write/return) | Firestore transaction: atomic lock on archive doc |
| `findResumeDoc(archiveId)` | After `acquireRestoreLock` | Queries projects for `_restoringFromArchive === archiveId` |
| `releaseRestoreLock(archiveId)` | After `findResumeDoc` | Simple Firestore update: clear `restoreLock` on archive doc |
| `buildRestoreProjectData(archive, remaps, options, uid, now, bcEnv, bcCompanyName)` | After `releaseRestoreLock` | Pure function: deep-clone → migrate → reset → remap → labor overrides (Z2: no module-level reads) |
| `applyRemaps(data, remaps)` | After `buildRestoreProjectData` | Helper: applies customer/vendor/item remaps to project data |
| `applyLaborOverrides(data, laborOverrides)` | After `applyRemaps` | Helper: applies per-panel labor rate overrides |
| `executeRestore(archive, remaps, options, onProgress)` | After `applyLaborOverrides` | Full orchestration: lock → build → save → BC writes → subcollections → cleanup |

### 1.2 Modified Functions/Components

| Component/Function | Location | Change |
|-------------------|----------|--------|
| `RestorePreviewModal` | Line 40345 | Major rewrite: add Confirm button (replaces disabled placeholder), remap controls (item text input, customer picker, vendor picker), transition to progress view, failure summary, completion view with "Open Project" |
| `ArchiveBrowserModal` | Line 40206 | Add interrupted-restore indicator (A6): Resume / Start Fresh / View Archive buttons when stale lock detected |
| App shell modal rendering | Line 43689–43690 | Thread `onRestoreComplete` callback from ArchiveBrowserModal through to RestorePreviewModal |
| `handleCreated`-adjacent | Line 43286 | New `handleRestoreComplete(projectId)`: refresh project list, open restored project |
| BOM row rendering | Multiple locations in PanelListView/BomTable | `restoreSkipped` visual treatment: amber tint, ⚠ SKIPPED badge, tooltip |
| `_bcReVerifyNotInBc` | Line 4613 | Clear `restoreSkipped` when skipped item is found in BC during re-verify |

### 1.3 New State Variables

All in the App component (~line 42451 area, near existing `showArchiveBrowser`/`archivePreviewTarget`):

| Variable | Type | Purpose |
|----------|------|---------|
| `restoreInFlight` | `boolean` | Guards against accidental modal close during BC writes; enables `onbeforeunload` |

The existing `archivePreviewTarget` state (`{archive, mode}`) is sufficient for driving RestorePreviewModal. The progress/completion/failure states live inside RestorePreviewModal itself (local state), not at the App level.

### 1.4 Insertion Point Map (app.jsx line references)

```
Line 9220  (after buildRestorePreview cache write)
  ├── acquireRestoreLock()
  ├── findResumeDoc()
  ├── releaseRestoreLock()
  ├── buildRestoreProjectData()
  │     ├── applyRemaps()
  │     └── applyLaborOverrides()
  └── executeRestore()

Line 40206  ArchiveBrowserModal  ← modify (add interrupted-restore indicator)
Line 40345  RestorePreviewModal  ← major rewrite (remap UI + progress + completion)

Line 42451  State variables  ← add restoreInFlight
Line 43689  Modal rendering  ← thread callbacks
```

---

## 2. Function Signatures + Pseudocode

### 2.1 `acquireRestoreLock(archiveId, uid, userName)`

```js
async function acquireRestoreLock(archiveId, uid, userName) {
  // Returns: { blocked: false } or { blocked: true, lockedByName, lockedAt }
  // Uses fbDb.runTransaction() for atomic read-check-write.
  // Pattern mirrors existing transactions at lines 2189, 14203, 14257, 34242.

  const archivePath = `companies/${_appCtx.companyId}/projects_archive`;
  const archiveRef = fbDb.doc(`${archivePath}/${archiveId}`);
  const STALE_MS = 5 * 60 * 1000; // 5 minutes

  return await fbDb.runTransaction(async tx => {
    const doc = await tx.get(archiveRef);
    if (!doc.exists) throw new Error("Archive not found");
    const data = doc.data();

    // Integrity check (plan step 2)
    if (!data._archiveComplete) throw new Error("Archive is incomplete — re-archive to complete");

    const lock = data.restoreLock;
    const now = Date.now();

    // Case 3: non-stale lock from different user → HARD BLOCK
    if (lock && lock.lockedBy !== uid && (now - lock.lockedAt) < STALE_MS) {
      return { blocked: true, lockedByName: lock.lockedByName || "another user", lockedAt: lock.lockedAt };
    }

    // Case 1 (no lock / stale) or Case 2 (same user): acquire/refresh lock
    tx.update(archiveRef, {
      restoreLock: { lockedBy: uid, lockedByName: userName, lockedAt: now }
    });
    return { blocked: false, staleLockTakeover: !!(lock && lock.lockedBy !== uid) };
  });
}
```

### 2.2 `findResumeDoc(archiveId)`

```js
async function findResumeDoc(archiveId) {
  // Returns: { projectId, projectData, bcProjectNumber } or null
  // Z6: query without limit — log warning if multiple docs match (data corruption indicator)
  const path = _appCtx.projectsPath;
  if (!path) return null;
  const snap = await fbDb.collection(path)
    .where("_restoringFromArchive", "==", archiveId)
    .get();
  if (snap.empty) return null;
  if (snap.size > 1) {
    console.warn(`[RESTORE] findResumeDoc: ${snap.size} docs found for archiveId ${archiveId} — expected 1. Using most recent.`);
  }
  // Return the most recently updated doc if multiple exist
  const sorted = snap.docs.sort((a, b) => (b.data().updatedAt || 0) - (a.data().updatedAt || 0));
  const doc = sorted[0];
  const data = doc.data();
  return {
    projectId: doc.id,
    projectData: data,
    bcProjectNumber: data.bcProjectNumber || null
  };
}
```

**Note:** This queries the projects collection, which does NOT currently have a composite index for `_restoringFromArchive`. Since we filter on a single field with no `orderBy`, a composite index is NOT needed (Firestore auto-indexes single fields). Confirmed by Milestone C experience (finding #61): composite indexes are only required for `where()` + `orderBy()` on different fields.

### 2.3 `releaseRestoreLock(archiveId)`

```js
async function releaseRestoreLock(archiveId) {
  // Z10: uses FieldValue.delete() for clean doc state (no leftover empty object).
  // acquireRestoreLock uses update({restoreLock: {...}}) for atomic write —
  // different patterns are intentional: nested object for create (transactional),
  // FieldValue.delete() for release (idempotent cleanup).
  const archivePath = `companies/${_appCtx.companyId}/projects_archive`;
  await fbDb.doc(`${archivePath}/${archiveId}`).update({
    restoreLock: firebase.firestore.FieldValue.delete()
  });
}
```

### 2.4 `buildRestoreProjectData(archive, remaps, options, uid, now, bcEnv, bcCompanyName)`

Pure, deterministic function. No Firestore calls, no side effects, no module-level reads. `now` passed from caller for timestamp determinism (A4). Z2: `bcEnv` and `bcCompanyName` passed as parameters (caller captures from `_bcConfig` at top of `executeRestore`) — eliminates the only impurity in the original design.

Z3: **`migrateProjectShape` purity verification required before Phase 1.** Grep the function body for any Firestore, `console.`, `fetch`, or `_appCtx` references. If it logs, document. If it writes to Firestore or reads module-level state, that's a purity violation — either pass the dependency as a parameter or extract the side effect to run before/after the pure pipeline.

```js
function buildRestoreProjectData(archive, remaps, options, uid, now, bcEnv, bcCompanyName) {
  // 1. Deep clone
  let data = JSON.parse(JSON.stringify(archive));

  // 2. Strip archive envelope fields (known list from plan §5 lines 410-421)
  const ENVELOPE_FIELDS = [
    'archiveId', 'archiveVersion', 'archivedAt', 'archivedBy', 'archiveReason',
    'originalProjectId', 'originalBcProjectNumber', 'originalBcEnv',
    'restoreHistory', 'restoreLock', '_archiveComplete'
  ];
  for (const f of ENVELOPE_FIELDS) delete data[f];

  // 3. Run migrateProjectShape — before field resets (plan §5 ordering rationale)
  data = migrateProjectShape(data);

  // 4a. BC Project-Entity Fields (reset — old BC project no longer exists)
  data.bcProjectId = null;
  data.bcProjectNumber = null;
  data.bcEnv = bcEnv;           // Z2: passed from caller, not read from _bcConfig
  data.bcCompanyName = bcCompanyName; // Z2: passed from caller, not read from _bcConfig
  data.bcPoNumber = null;
  data.bcPoStatus = null;
  data.bcPoDate = null;
  data.bcStatusForcedToQuote = false;
  data.bcStatusForcedToQuoteAt = null;
  data.bcPdfAttached = false;
  data.bcPdfFileName = null;

  // 4b. Per-Panel BC Project-Entity Fields (reset)
  for (const panel of (data.panels || [])) {
    panel.bcPdfAttached = false;
    panel.bcPdfFileName = null;
    panel.bcUploadCount = 0;
    panel.bcUploadQuoteRev = null;
    panel.bcProjectTaskNo = null;
  }

  // 4c. Project Lifecycle Fields (reset — clean slate)
  data.id = null; // saveProject() assigns new
  data.wonAt = null; data.wonBy = null;
  data.lostAt = null; data.lostBy = null;
  data.quoteRev = 1;
  data.quoteRevAtPrint = null;
  data.lastQuoteHash = null;
  data.qvHistory = [];

  // Pre-review fields (13)
  data.preReviewStatus = null;
  data.preReviewSubmittedAt = null;
  data.preReviewSubmittedBy = null;
  data.preReviewApprovedAt = null;
  data.preReviewApprovedBy = null;
  data.preReviewNotes = null;
  data.preReviewAssignedTo = null;
  data.preReviewAssignedToName = null;
  data.preReviewRev = 0;
  data.preReviewChangeLog = [];
  data.reviewRev = 0;
  data.reviewRevBumpedThisCycle = false;
  data.reviewChangeLog = [];

  // Post-review fields (8)
  data.postReviewStatus = null;
  data.postReviewSubmittedAt = null;
  data.postReviewSubmittedBy = null;
  data.postReviewApprovedAt = null;
  data.postReviewApprovedBy = null;
  data.postReviewNotes = null;
  data.postReviewAssignedTo = null;
  data.postReviewAssignedToName = null;

  // Ownership + lock fields
  data.ownerLockActive = false;
  data.ownerTakeoverActive = null;
  data.ownerTakeoverLog = [];
  data.editUnlocked = false;
  data.quotePrintLock = null;
  data.unlockRequestedBy = null;
  data.createdBy = uid;
  data.createdAt = now;
  data.updatedBy = uid;
  data.updatedAt = now;
  data.status = "draft";

  // D6: Permanent audit field linking restored project to its archive
  data.restoredFromArchive = archive.archiveId || archive.id;
  // A2: restoredBy — updated on stale-lock takeover (initially same as createdBy)
  data.restoredBy = uid;

  // 5. Apply remaps (customer, vendor, item — see §2.5)
  applyRemaps(data, remaps);

  // 6. Apply labor overrides (per-panel — see §2.6)
  applyLaborOverrides(data, options.laborOverrides);

  // 4d. BC Master-Data Fields — DO NOT RESET
  // bcCustomerNumber, bcCustomerName, bcContact*, bcSalesperson*,
  // bcProjectManager*, bcDesigner*, per-row bcPartNumber, bcVendorNo,
  // bcVendorName, bcPurchasePrice, bcItemCardCost, bcCurrentCost,
  // bcVerify, bcItemId, bcItemNumber, per-row bcPoDate — all preserved.
  // (Customer/vendor remaps may have overwritten some of these — that's intentional.)

  return data;
}
```

### 2.5 `applyRemaps(data, remaps)`

```js
function applyRemaps(data, remaps) {
  if (!remaps) return;

  // Customer remap (D7: clear contact fields on remap)
  if (remaps.customer && remaps.customer.action === "remap") {
    data.bcCustomerNumber = remaps.customer.remapTo;
    data.bcCustomerName = remaps.customer.remapName || null;
    // D7: Clear contact fields — stale contacts from old customer
    data.bcContactNo = null;
    data.bcContactName = null;
    data.bcContactEmail = null;
    data.bcContactPhone = null;
  }

  // Vendor remaps — apply to all BOM rows referencing old vendor
  if (remaps.vendors) {
    for (const [oldVendorNo, action] of remaps.vendors) {
      if (action.action !== "remap") continue;
      for (const panel of (data.panels || [])) {
        for (const row of (panel.bom || [])) {
          if ((row.bcVendorNo || "").trim() === oldVendorNo) {
            row.bcVendorNo = action.remapTo;
            row.bcVendorName = action.remapName || null;
            // unitPrice NOT recalculated — archived price preserved
          }
        }
      }
    }
  }

  // Item remaps — skip or remap
  if (remaps.items) {
    for (const [oldPn, action] of remaps.items) {
      for (const panel of (data.panels || [])) {
        for (const row of (panel.bom || [])) {
          const rowPn = row.bcPartNumber || row.partNumber;
          if (rowPn !== oldPn) continue;

          if (action.action === "skip") {
            row.restoreSkipped = true;
            // customerSupplied NOT touched — per Q2 ruling
          } else if (action.action === "remap") {
            row.partNumber = action.remapTo;
            row.bcPartNumber = action.remapTo;
            row.bcItemId = null;       // new item, unknown until BC lookup
            row.bcItemNumber = action.remapTo;
            row.bcVerify = null;        // needs re-verification
            // description preserved — user chose this description for this slot
            // unitPrice preserved — user can re-price after restore
          }
          // "accept" → no changes
        }
      }
    }
  }
}
```

**Design note on `remaps` shape:** The supplement §4.1 specifies `remaps.items` and `remaps.vendors` as `Map` objects. Since these are built in the RestorePreviewModal UI and passed to `executeRestore`, they'll be JS Maps (not plain objects). The `for...of` iteration works on Maps.

### 2.6 `applyLaborOverrides(data, laborOverrides)`

```js
function applyLaborOverrides(data, laborOverrides) {
  // A7 merge logic: per-panel labor rate overrides from preview UI
  if (!laborOverrides) return;

  for (const [panelId, overrideRate] of laborOverrides) {
    const panel = (data.panels || []).find(p => p.id === panelId);
    if (!panel) continue;

    const rate = Number(overrideRate);
    if (Number.isNaN(rate) || rate < 0) continue;

    // Only override if panel has existing pricing data
    // Don't create a pricing object from nothing — rate has no context without pricing structure
    if (panel.pricing) {
      panel.pricing.laborRate = rate;
      // Zero is valid — user may intentionally zero out labor (e.g., warranty project)
    }
  }
}
```

### 2.7 `executeRestore(archive, remaps, options, onProgress)`

This is the core orchestration function. Structured as a sequence of awaited helper calls with try/catch per BC step (D2: continue-on-error).

```js
async function executeRestore(archive, remaps, options, onProgress) {
  // Z8: centralize archiveId resolution once — used by lock, resume, cleanup, history
  const archiveId = archive.archiveId || archive.id;
  // Z1: unified source — firebase.auth().currentUser for both uid and displayName
  const currentUser = firebase.auth().currentUser;
  const uid = currentUser.uid;
  const userName = currentUser.displayName || currentUser.email || uid;
  const archivePath = `companies/${_appCtx.companyId}/projects_archive`;
  const projectsPath = _appCtx.projectsPath;
  const now = Date.now(); // A4: single timestamp for all fields
  // Z2: capture _bcConfig values here — pass to buildRestoreProjectData as params
  const bcEnv = _bcConfig.env;
  const bcCompanyName = _bcConfig.companyName;

  const report = (step, stepName, detail, pct) =>
    onProgress?.({ step, stepName, detail, pct });
  const results = { steps: [], errors: [], warnings: [] };

  // ── Step 1: Lock acquisition (§3) ──
  report(1, "lock", "Acquiring restore lock…", 0);
  const lockResult = await acquireRestoreLock(archiveId, uid, userName);
  if (lockResult.blocked) {
    return { error: "blocked", lockedByName: lockResult.lockedByName, lockedAt: lockResult.lockedAt };
  }
  results.steps.push({ step: 1, name: "lock", status: "ok" });

  try {
    // ── Step 2: Resume check ──
    report(2, "resume", "Checking for in-progress restore…", 5);
    const resumeDoc = await findResumeDoc(archiveId);

    let projectData, newProjectId, bcProjectNumber;

    if (resumeDoc) {
      // ── RESUME PATH ──
      newProjectId = resumeDoc.projectId;
      bcProjectNumber = resumeDoc.bcProjectNumber;
      projectData = resumeDoc.projectData;
      // A2: on stale-lock takeover, update restoredBy
      if (lockResult.staleLockTakeover) {
        await fbDb.doc(`${projectsPath}/${newProjectId}`).update({ restoredBy: uid });
      }
      report(3, "resume", `Resuming restore of ${bcProjectNumber || "new project"}…`, 10);
      results.steps.push({ step: 2, name: "resume", status: "resumed", bcProjectNumber });
    } else {
      // ── FRESH PATH ──
      // Step 3: Build project data
      report(3, "build", "Building project data…", 10);
      projectData = buildRestoreProjectData(archive, remaps, options, uid, now, bcEnv, bcCompanyName); // Z2
      results.steps.push({ step: 3, name: "build", status: "ok" });

      // Step 4: Save to Firestore
      report(4, "save", "Saving to Firestore…", 15);
      const saved = await saveProject(uid, {
        ...projectData,
        _restoringFromArchive: archiveId
      });
      newProjectId = saved.id;
      projectData = saved; // saveProject stamps id, schemaVersion, updatedAt
      results.steps.push({ step: 4, name: "save", status: "ok", projectId: newProjectId });
    }

    // ── Step 5: Create BC project (skip if resuming with bcProjectNumber) ──
    if (!bcProjectNumber) {
      report(5, "bc-project", "Creating BC project…", 20);
      const customerNumber = projectData.bcCustomerNumber;
      if (!customerNumber) throw new Error("No customer number — cannot create BC project");
      const bcResult = await bcCreateProject(projectData.name, customerNumber);
      bcProjectNumber = bcResult.number;

      // Step 5a: CHECKPOINT — persist bcProjectNumber immediately
      await fbDb.doc(`${projectsPath}/${newProjectId}`).update({
        bcProjectNumber: bcProjectNumber,
        bcProjectId: bcResult.id,
        bcEnv: _bcConfig.env
      });
      results.steps.push({ step: 5, name: "bc-project", status: "ok", bcProjectNumber });
    }

    // ── Step 6: Panel task structure ──
    // Z5: if step 6 fails, skip steps 7–8 (they depend on task slots and produce
    // cascading 400 errors). Surface one clear error instead of 50+.
    report(6, "tasks", "Creating panel task structure…", 30);
    let step6Failed = false;
    try {
      await bcCreatePanelTaskStructure(bcProjectNumber, projectData.name, projectData.panels);
      results.steps.push({ step: 6, name: "tasks", status: "ok" });
    } catch (e) {
      step6Failed = true;
      results.errors.push({ step: 6, name: "tasks", message: e.message });
      results.steps.push({ step: 6, name: "tasks", status: "error", message: e.message });
      results.warnings.push("Panel task structure failed — fix this first, then retry. Steps 7–8 skipped.");
    }

    // ── Step 7: Base planning lines per panel ──
    const panels = projectData.panels || [];
    if (step6Failed) {
      results.steps.push({ step: 7, name: "planning", status: "skipped", message: "Skipped — step 6 failed" });
    } else for (let i = 0; i < panels.length; i++) {
      const pIdx = i + 1; // 1-based
      report(7, "planning", `Syncing planning lines — panel ${pIdx}/${panels.length}…`,
        35 + (i / Math.max(panels.length, 1)) * 25);
      try {
        await bcSyncPanelPlanningLines(bcProjectNumber, pIdx, panels[i], projectData.name);
        results.steps.push({ step: 7, name: `planning-panel-${pIdx}`, status: "ok" });
      } catch (e) {
        results.errors.push({ step: 7, name: `planning-panel-${pIdx}`, message: e.message });
        results.steps.push({ step: 7, name: `planning-panel-${pIdx}`, status: "error", message: e.message });
        // D2: continue to next panel
      }
    }

    // ── Step 8: ECO task slots + skeleton + planning lines ──
    // D5: sequence must be bcAddEcoTask → bcCreateEcoTaskPlanningSkeleton → bcSyncEcoPanelPlanningLines
    // Iterate panels sequentially, within each panel iterate ECOs in ecoNumber order
    const ecoSummary = projectData.ecoSummary || [];
    if (step6Failed) {
      // Z5: skip step 8 when step 6 failed — same rationale as step 7
      if (ecoSummary.length > 0) {
        results.steps.push({ step: 8, name: "eco", status: "skipped", message: "Skipped — step 6 failed" });
      }
    } else if (ecoSummary.length > 0) {
      // Z4: warn if panels array is empty but ecoSummary isn't — ECOs would be silently skipped
      if (panels.length === 0) {
        results.warnings.push("Archive has ECOs but no panels — ECO BC writes skipped.");
      }
      let ecoStepsDone = 0;
      const totalEcoSteps = panels.length * ecoSummary.length;
      for (let i = 0; i < panels.length; i++) {
        const pIdx = i + 1;
        const panelName = panels[i].name || `Panel ${pIdx}`;
        // Sort ECOs by ecoNumber ascending
        const sortedEcos = [...ecoSummary].sort((a, b) => (a.ecoNumber || 0) - (b.ecoNumber || 0));

        for (const eco of sortedEcos) {
          const ecoNum = eco.ecoNumber;
          const ecoId = eco.ecoId;
          ecoStepsDone++;
          report(8, "eco", `ECO ${ecoNum} panel ${pIdx}/${panels.length} (${ecoStepsDone}/${totalEcoSteps})…`,
            60 + (ecoStepsDone / Math.max(totalEcoSteps, 1)) * 20);
          try {
            // 8a: Create ECO task slot (idempotent — probes before creating)
            await bcAddEcoTask(bcProjectNumber, pIdx, ecoNum, panelName);
            // 8b: Create ECO task planning skeleton (idempotent — probes before creating)
            await bcCreateEcoTaskPlanningSkeleton(bcProjectNumber, pIdx, ecoNum, panelName);
            // 8c: Sync ECO planning lines (idempotent — incremental diff)
            await bcSyncEcoPanelPlanningLines(bcProjectNumber, pIdx, ecoNum, ecoId, panels[i], projectData.name);
            results.steps.push({ step: 8, name: `eco-${ecoNum}-panel-${pIdx}`, status: "ok" });
          } catch (e) {
            results.errors.push({ step: 8, name: `eco-${ecoNum}-panel-${pIdx}`, message: e.message });
            results.steps.push({ step: 8, name: `eco-${ecoNum}-panel-${pIdx}`, status: "error", message: e.message });
            // D2: continue to next ECO/panel
          }
        }
      }
    }

    // ── Step 9: Recreate ECO subcollection (Firestore) ──
    report(9, "ecos", "Recreating ECO documents…", 85);
    try {
      const ecoSnap = await fbDb.collection(`${archivePath}/${archiveId}/_ecos`).get();
      for (const doc of ecoSnap.docs) {
        await fbDb.doc(`${projectsPath}/${newProjectId}/ecos/${doc.id}`).set(doc.data());
      }
      results.steps.push({ step: 9, name: "ecos", status: "ok", count: ecoSnap.size });
    } catch (e) {
      results.errors.push({ step: 9, name: "ecos", message: e.message });
      results.steps.push({ step: 9, name: "ecos", status: "error", message: e.message });
    }

    // ── Step 10: Recreate _snapshots subcollection (Firestore) ──
    // Z9 FIX: use .doc(doc.id).set() instead of .add() — preserves source doc IDs,
    // making retries idempotent (overwrite same doc instead of creating duplicates).
    // Same pattern as step 9 ECO recreation.
    report(10, "snapshots", "Recreating snapshots…", 90);
    try {
      const snapSnap = await fbDb.collection(`${archivePath}/${archiveId}/_snapshots`).get();
      for (const doc of snapSnap.docs) {
        await fbDb.doc(`${projectsPath}/${newProjectId}/_snapshots/${doc.id}`).set(doc.data());
      }
      results.steps.push({ step: 10, name: "snapshots", status: "ok", count: snapSnap.size });
    } catch (e) {
      results.errors.push({ step: 10, name: "snapshots", message: e.message });
      results.steps.push({ step: 10, name: "snapshots", status: "error", message: e.message });
    }

    // ── Step 11: Cleanup ──
    report(11, "cleanup", "Finalizing…", 95);
    // 11a: Clear _restoringFromArchive + persist final state
    await fbDb.doc(`${projectsPath}/${newProjectId}`).update({
      _restoringFromArchive: firebase.firestore.FieldValue.delete(),
      bcProjectNumber: bcProjectNumber,
      restoredBy: uid
    });
    // 11b: Append to archive's restoreHistory
    await fbDb.doc(`${archivePath}/${archiveId}`).update({
      restoreHistory: firebase.firestore.FieldValue.arrayUnion({
        restoredAt: now,
        restoredBy: uid,
        restoredByName: userName,
        newProjectId: newProjectId,
        bcProjectNumber: bcProjectNumber,
        errorsCount: results.errors.length
      })
    });
    // 11c: Release lock
    await releaseRestoreLock(archiveId);
    results.steps.push({ step: 11, name: "cleanup", status: "ok" });

    report(12, "done", `Restore complete — ${bcProjectNumber}`, 100);
    return { newProjectId, bcProjectNumber, results };

  } catch (e) {
    // Catastrophic failure — lock auto-expires after 5 min
    // D3: leave orphan BC project (resume handles it)
    console.error("[RESTORE] catastrophic failure:", e);
    return { error: e.message, results };
  }
}
```

**Key design decisions in `executeRestore`:**

1. **Single checkpoint at 5a** (D1): `bcProjectNumber` persisted immediately after BC creation. Resume logic branches on `bcProjectNumber !== null`.

2. **Continue-on-error** (D2): Steps 6–10 each catch errors independently. Errors accumulated in `results.errors`. The "Retry Failed Steps" button (A1) restarts from step 6 — all post-5a calls are idempotent.

3. **Orphan BC project** (D3): If catastrophic failure after step 5, BC project persists in Quote status. Resume picks it up on retry.

4. **ECO sequence** (D5): `bcAddEcoTask` → `bcCreateEcoTaskPlanningSkeleton` → `bcSyncEcoPanelPlanningLines`, strictly sequential per (panel, ECO) pair.

5. **Stale-lock takeover** (A2): `restoredBy` field updated on takeover.

6. **Step 6 fast-exit** (Z5): If `bcCreatePanelTaskStructure` fails, steps 7–8 are skipped. User sees one root cause instead of 50+ cascading 400 errors.

7. **Snapshot idempotency** (Z9): Step 10 uses `.doc(doc.id).set()` not `.add()` — retry overwrites same docs instead of creating duplicates.

8. **Pure data build** (Z2): `buildRestoreProjectData` receives `bcEnv`/`bcCompanyName` as params. Caller captures `_bcConfig` values at top of `executeRestore`.

---

## 3. Implementation Sequence

### 3.1 Dependency Map

```
Phase 1: Core restore logic (no UI)
  ├── acquireRestoreLock
  ├── findResumeDoc
  ├── releaseRestoreLock
  ├── buildRestoreProjectData
  │     ├── applyRemaps
  │     └── applyLaborOverrides
  └── executeRestore
      (depends on: all above + existing BC functions)

Phase 2: Remap UI in RestorePreviewModal
  ├── Item text input (D8)
  ├── Customer remap (D7 contact clearing)
  ├── Vendor remap
  └── Confirm button activation logic
      (depends on: nothing — pure UI, can parallel with Phase 1)

Phase 3: Progress + completion view in RestorePreviewModal
  ├── Preview → progress transition (§8.3)
  ├── Step-by-step progress list
  ├── Failure summary (§5.4)
  ├── "Open Project" button
  └── onbeforeunload guard
      (depends on: Phase 1 function signatures, Phase 2 Confirm button)

Phase 4: restoreSkipped BOM treatment
  ├── Amber row rendering
  ├── ⚠ SKIPPED badge
  ├── Tooltip
  └── _bcReVerifyNotInBc clear
      (depends on: nothing — pure rendering, can parallel)

Phase 5: Interrupted restore indicator (A6)
  ├── ArchiveBrowserModal stale-lock detection
  ├── Resume / Start Fresh / View Archive buttons
  └── Resume flow wiring
      (depends on: Phase 1 for findResumeDoc)

Phase 6: Navigation handoff (A9)
  ├── onRestoreComplete callback chain
  ├── handleRestoreComplete in App
  ├── Project list refresh + open
  └── Modal close cascade
      (depends on: Phase 3 completion view)
```

### 3.2 Phase Details and Ship Order

**Phase 1: Core restore logic** — ships first, tested via browser console

New module-level functions: `acquireRestoreLock`, `findResumeDoc`, `releaseRestoreLock`, `buildRestoreProjectData`, `applyRemaps`, `applyLaborOverrides`, `executeRestore`. All inserted after `buildRestorePreview` (~line 9220). No UI changes — the Confirm button remains disabled. Functions callable from browser console for testing.

- Scope checker validation: each function is module-level, no new globals needed in allowlist.
- Deploy as separate version.
- **Critical test:** Call `executeRestore` from console on a test archive. Verify BC project creation, task structure, planning lines, ECO subcollection recreation.

**Phase 2: Remap UI in RestorePreviewModal** — ships second

Modify RestorePreviewModal to add interactive remap controls:
- **Item remap (D8):** Text input next to each missing item. No BC validation during preview — invalid part numbers fall back to Text-type planning lines during sync.
- **Customer remap (D7):** Dropdown/input for replacement customer number. On remap, clear contact field display.
- **Vendor remap:** Input for replacement vendor number.
- **Confirm button activation:** Enabled when: (a) BC connected, (b) customer is either ok/name_changed/remapped — missing customer without remap blocks the button.

This phase produces the `remaps` Map objects that Phase 3 passes to `executeRestore`.

- Deploy as separate version.

**Phase 3: Progress + completion view** — ships third

RestorePreviewModal gains three internal views: `preview` (current), `progress` (new), `completion` (new).

- On "Confirm Restore" click: switch to `progress` view, disable click-outside-close, hide Cancel, call `executeRestore` with `onProgress` wired to step list.
- On completion: switch to `completion` view with "Open Project" button.
- On partial failure: show completed steps (green), failed steps (red), "Retry Failed Steps" / "Open Project Anyway" buttons.
- `window.onbeforeunload` during BC writes.
- Deploy as separate version.

**Phase 4: restoreSkipped BOM treatment** — ships after Phase 1

Pure rendering — no dependency on Phases 2–3. Can be implemented in parallel.

- BOM row background: `#78350f22` (amber tint) when `row.restoreSkipped === true`.
- Left border: `3px solid #f59e0b` (amber).
- `⚠ SKIPPED` badge next to part number.
- Tooltip on badge (per D4 spec).
- `_bcReVerifyNotInBc` (line 4613): when re-verify finds a skipped row's item, clear `restoreSkipped`.
- Manual `partNumber` edit: clear `restoreSkipped` on the row.
- Deploy as separate version.

**Phase 5: Interrupted restore indicator** — ships after Phase 1

ArchiveBrowserModal modification. When loading archive rows, check `restoreLock` on each archive. If `restoreLock.lockedAt` is stale (> 5 min old), show the A6 indicator.

- "Resume Restore": calls `onPreviewOpen(archive, "restore")` with a flag indicating resume mode.
- "Start Fresh": same, but flags to skip `findResumeDoc` (fresh start).
- "View Archive": opens RestorePreviewModal in preview-only mode (same as today).
- Deploy as separate version.

**Phase 6: Navigation handoff** — ships last

Wires the post-restore callback chain:
1. RestorePreviewModal → `onRestoreComplete(newProjectId)` callback prop.
2. ArchiveBrowserModal → receives callback, closes both modals, calls `onProjectOpen(newProjectId)`.
3. App shell → new `handleRestoreComplete(projectId)`: refresh projects via `loadProjects`, find the project, call `handleOpen(project)`.

The callback prop threading goes through:
```
App (line 43689-43690):
  <ArchiveBrowserModal onRestoreComplete={handleRestoreComplete} />
    <RestorePreviewModal onRestoreComplete={restoreCompleteCallback} />
```

- Deploy as separate version.

### 3.3 Phases That Can Run Independently

| Phase | Can parallel with |
|-------|------------------|
| Phase 1 | None — must ship first |
| Phase 2 | Phase 4 |
| Phase 3 | Phase 4, Phase 5 |
| Phase 4 | Phases 2, 3, 5 |
| Phase 5 | Phases 3, 4 |
| Phase 6 | None — depends on Phases 3, 5 |

Recommended order: 1 → 2 → 4 → 3 → 5 → 6 (interleave 4 during 2–3 development).

---

## 4. UI Surface Specifications

### 4.1 RestorePreviewModal — Confirm Button Activation

Replace the current disabled placeholder (lines 40564-40572) with active logic:

**Button state:**

| Condition | Button state |
|-----------|-------------|
| `!_bcToken` (BC disconnected) | Disabled, tooltip: "Connect to BC first" |
| Customer is `missing` AND no remap selected | Disabled, tooltip: "Customer must be remapped" |
| Preview not yet complete (`!previewDone`) | Disabled, tooltip: "Loading preview…" |
| All other states | **Enabled** |

Missing vendors and items do NOT block the button — vendors can be accepted as-is, items can be skipped.

**Button label:** "Confirm Restore ▸" (restore mode) or "Confirm Copy ▸" (copy mode).

### 4.2 Remap Controls (Phase 2 UI)

**Item remap (D8 — text input):**

When an item has `costStatus === "missing"`, show two controls:
```
🔴 PN-1234 "CABLE ASSY 24AWG" — missing from BC
  [ Skip ✓ ]  [ Remap: [___text input___] ]
```

- "Skip" toggle: sets `remaps.items.set("PN-1234", { action: "skip" })`.
- Text input: on blur/Enter, sets `remaps.items.set("PN-1234", { action: "remap", remapTo: inputValue })`.
- Default action: "skip" (pre-selected). User can change to remap by typing a part number.
- No BC validation during preview — planning line falls back to Text type if invalid.

**Customer remap (D7):**

When customer has `status === "missing"`:
```
🔴 ACME Corp (#C10000) — missing from BC
  Remap to: [___text input___]
  ⚠ Contact fields will be cleared on remap
```

- Text input for replacement customer number. On entry, sets `remaps.customer = { action: "remap", remapTo: value, remapName: null }`.
- Contact-field warning text: "Contact fields (contact name, email, phone) will be cleared — re-select after restore."
- No remap = button blocked (customer is required for BC project creation).

**Vendor remap:**

When vendor has `status === "missing"`:
```
🔴 ACME Supply (#V10000) — missing from BC
  [ Accept as-is ]  [ Remap: [___text input___] ]
```

- "Accept as-is": keeps original data. Missing vendor doesn't block BC writes (planning lines use Item type, not Vendor).
- Text input: sets `remaps.vendors.set("V10000", { action: "remap", remapTo: value, remapName: null })`.
- Default action: "accept".

### 4.3 Progress View (Phase 3 UI — supplement §8.2)

When user clicks "Confirm Restore":

1. Modal content replaces preview with progress view (same modal shell).
2. Click-outside-to-close disabled (remove `onMouseDown` handler on overlay).
3. Cancel button hidden.
4. `window.onbeforeunload = () => "Restore in progress — closing may leave incomplete data."` set.
5. `onbeforeunload` cleared on completion/failure.

**Progress layout:**

```
┌─────────────────────────────────────────────┐
│ Restoring: PRJ402107 - Customer Panel Job   │
│                                             │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░ 62%     │
│                                             │
│ ✅ Restore lock acquired                    │
│ ✅ Project data built                       │
│ ✅ Saved to Firestore                       │
│ ✅ BC Project PRJ402200 created             │
│ ✅ Panel task structure created             │
│ ⏳ Syncing planning lines — panel 2/3...    │
│ ○ ECO planning lines                       │
│ ○ ECO documents                            │
│ ○ Snapshots                                │
│ ○ Finalizing                               │
│                                             │
│ ⚠ Do not close this window during restore  │
└─────────────────────────────────────────────┘
```

Step icons: `✅` (ok), `⏳` (in progress), `○` (pending), `❌` (failed).

**Failure summary (§5.4):**

```
┌─────────────────────────────────────────────┐
│ Restore complete with warnings              │
│                                             │
│ ✅ BC Project PRJ402200 created             │
│ ✅ Panel 1 — 42 planning lines synced       │
│ ❌ Panel 2 — 3 of 38 lines failed          │
│    Error: 429 Too Many Requests             │
│ ✅ Panel 3 — 15 planning lines synced       │
│ ❌ ECO 01 Panel 2 — task creation failed    │
│    Error: BC project task OData page not... │
│                                             │
│ [Retry Failed Steps]  [Open Project Anyway] │
└─────────────────────────────────────────────┘
```

**"Retry Failed Steps" (A1):** Does NOT track individual failed calls. Restarts `executeRestore` from the existing resume doc (re-enters at step 6 via `findResumeDoc`). All idempotent steps re-run; previously-succeeded panels complete instantly.

**Completion view:**

```
┌─────────────────────────────────────────────┐
│ ✅ Restore Complete                          │
│                                             │
│ BC Project: PRJ402200                       │
│ Panels: 3  |  Planning lines: 95           │
│ ECO tasks: 2  |  Snapshots: 4              │
│                                             │
│              [Open Project]                 │
└─────────────────────────────────────────────┘
```

### 4.4 Interrupted Restore Indicator (A6 — Phase 5)

In ArchiveBrowserModal, when an archive row has a stale `restoreLock`:

```
┌──────────────────────────────────────────────────────────┐
│ PRJ402107 - Customer Panel Job         Archived 2026-03  │
│ ⚠ Interrupted restore (started by Jon, 2h ago)           │
│ [Resume Restore]  [Start Fresh]  [View Archive]          │
└──────────────────────────────────────────────────────────┘
```

Detection logic in ArchiveBrowserModal:
```js
const STALE_MS = 5 * 60 * 1000;
const isInterrupted = a.restoreLock
  && a.restoreLock.lockedAt
  && (Date.now() - a.restoreLock.lockedAt) > STALE_MS;
```

- **Resume Restore:** Opens RestorePreviewModal with `resumeHint: true`. The modal skips preview loading and goes directly to `executeRestore` with the resume flow.
- **Start Fresh:** Opens RestorePreviewModal normally (full preview → confirm → fresh restore). The stale lock is taken over during `acquireRestoreLock`. Z7: Before opening fresh restore, query `findResumeDoc(archiveId)`. If a matching doc exists, tag it with `_orphanedByStartFresh: true` and `_orphanedAt: Date.now()` (don't delete — preserve data). A future cleanup sweep can use this flag to identify and purge orphaned partial-restore docs.
- **View Archive:** Opens RestorePreviewModal in preview-only mode (same as clicking "Restore" today — preview drift but don't execute).

**Non-stale lock (active, < 5 min):** Standard Restore button is replaced with a locked indicator:
```
🔒 Restore in progress by [UserName] (started Xm ago)
```
No buttons — hard block per §7.7 Case 3.

### 4.5 `restoreSkipped` BOM Row Treatment (D4 — Phase 4)

In the BOM table row rendering (inside PanelListView/BomTable), when `row.restoreSkipped === true`:

**Visual treatment:**

| Aspect | Value |
|--------|-------|
| Row background | `#78350f22` (amber tint, matches ARC warning palette) |
| Left border | `3px solid #f59e0b` (amber) |
| Badge | `⚠ SKIPPED` next to partNumber, amber text (`color: #f59e0b`, `fontSize: 10`, `fontWeight: 700`) |
| Tooltip on badge | "This item was not found in BC when the project was restored. Review and remap to a valid BC item, or mark as customer-supplied if the customer provides this part." |
| Interactivity | Fully editable — user can change partNumber, mark customerSupplied, or delete |

**Auto-clear triggers:**
- `_bcReVerifyNotInBc` (line 4613): Add to the item update object: `if (row.restoreSkipped) updates.restoreSkipped = null;`
- Manual `partNumber` edit: In the BOM inline edit handler, clear `restoreSkipped` when `partNumber` changes.

### 4.6 `onbeforeunload` Warning

During BC writes (steps 5–10 of `executeRestore`):

```js
// Set at start of BC writes
window.onbeforeunload = (e) => {
  e.preventDefault();
  return "Restore in progress — closing may leave incomplete data.";
};
// Clear on completion/failure
window.onbeforeunload = null;
```

This is managed by the RestorePreviewModal's progress view, not inside `executeRestore` itself. The modal sets the handler before calling `executeRestore` and clears it in the `.then()`/`.catch()`.

---

## 5. Restore Execution Specifics

### 5.1 Hard Dependency Ordering (supplement §2.1)

```
Step 5: bcCreateProject(name, customerNumber)
   ↓  bcProjectNumber required by all subsequent steps
Step 5a: Firestore checkpoint (persist bcProjectNumber)
   ↓  resume boundary
Step 6: bcCreatePanelTaskStructure(bcProjectNumber, name, panels)
   ↓  task slots 20N10 required for planning lines
Step 7: bcSyncPanelPlanningLines(bcProjectNumber, panelIdx, panel, name) × N panels
   ↓  independent of ECO steps
Step 8 (per panel × ECO, strictly sequential):
   8a: bcAddEcoTask(bcProjectNumber, panelIdx, ecoNumber, panelName)
   8b: bcCreateEcoTaskPlanningSkeleton(bcProjectNumber, panelIdx, ecoNumber, panelName)
   8c: bcSyncEcoPanelPlanningLines(bcProjectNumber, panelIdx, ecoNumber, ecoId, panel, name)
   ↓
Step 9-10: Firestore subcollection writes (no BC dependency)
Step 11: Cleanup (clear flags, append history, release lock)
```

### 5.2 Checkpoint Design (D1 — supplement §5.2)

**Single Firestore checkpoint at step 5a.** This is the critical dividing line:
- Before 5a: `bcProjectNumber === null` on the Firestore doc. Resume starts fresh at step 5 (BC project creation).
- After 5a: `bcProjectNumber` persisted. Resume skips to step 6.

**Why not more checkpoints:** Steps 6–10 are all idempotent:
- `bcCreatePanelTaskStructure`: probes for existing tasks (line 2901–2908 fast path)
- `bcSyncPanelPlanningLines`: incremental diff (fetch existing, PATCH/POST/DELETE)
- `bcAddEcoTask`: probes for existing ECO task slot (line 2960–2975)
- `bcCreateEcoTaskPlanningSkeleton`: probes for existing skeleton lines
- `bcSyncEcoPanelPlanningLines`: incremental diff

Re-running from step 6 on resume is safe. Previously-succeeded steps complete instantly.

### 5.3 Resume Flow (supplement §5.3)

```
User clicks Restore (or Resume):
  → acquireRestoreLock(archiveId, uid)
  → findResumeDoc(archiveId)
    → If found WITH bcProjectNumber:
        Load project data from Firestore.
        Skip steps 3–5a. Resume at step 6.
    → If found WITHOUT bcProjectNumber:
        Load project data from Firestore.
        Skip steps 3–4. Resume at step 5 (bcCreateProject).
    → If not found:
        Full restore from step 3.
```

### 5.4 Continue-on-Error (D2 — supplement §5.4)

Each BC call in steps 6–10 is wrapped in individual try/catch. Failures are accumulated in `results.errors[]`. On completion, the UI shows the failure summary (§4.3).

**"Retry Failed Steps" (A1):** Re-calls `executeRestore` with the same archive. `findResumeDoc` finds the existing Firestore doc. Resume enters at step 6. All idempotent calls re-run. The previously-failed steps retry from the beginning of their scope (e.g., all planning lines for all panels re-sync). Previously-succeeded panels complete instantly (no-op diffs).

### 5.5 ECO Sequence (D5 — supplement GAP 6)

The plan's original steps 7–8 missed ECO task slot creation. The supplement corrected this:

For each (panel, ECO) pair:
1. `bcAddEcoTask(bcProjectNumber, panelIndex, ecoNumber, panelName)` — creates task slot 20N3{eco-1}
2. `bcCreateEcoTaskPlanningSkeleton(bcProjectNumber, panelIndex, ecoNumber, panelName)` — seeds PROGRESS BILLING, CUT, LAYOUT, WIRE lines at qty=0
3. `bcSyncEcoPanelPlanningLines(bcProjectNumber, panelIndex, ecoNumber, ecoId, panel, projectName)` — syncs actual ECO BOM items

All three are now idempotent. `bcAddEcoTask` and `bcCreateEcoTaskPlanningSkeleton` were fixed in the Phase 0 pre-implementation patch (v1.20.40, `87b13eaf`; console.warn traceability in v1.20.41, `a3e4d25e`) — both now probe-before-create. `bcSyncEcoPanelPlanningLines` was already idempotent (incremental diff pattern). A5 smoke test (checklist item #13) validates the Phase 0 fix empirically.

### 5.6 Labor Override Merge (A7 — supplement §4.4)

The preview UI's labor rate inputs produce `options.laborOverrides = Map<panelId, number>`. During `buildRestoreProjectData`, `applyLaborOverrides` writes overrides to `panel.pricing.laborRate`.

Edge cases:
- No `panel.pricing` object: skip (don't create pricing from nothing).
- `overrideRate === 0`: valid (warranty project). Apply.
- `overrideRate` is NaN or negative: skip.

### 5.7 `restoredBy` on Stale-Lock Takeover (A2 — supplement §3.3)

When User B takes over User A's stale lock:
1. `acquireRestoreLock` writes new lock with User B's UID.
2. `findResumeDoc` finds User A's partially-restored project.
3. `executeRestore` updates the project doc: `restoredBy: uid` (User B).
4. On completion, `restoreHistory` records User B as the completer.

This gives: `createdBy` = User A (who started), `restoredBy` = User B (who finished).

---

## 6. Test Approach

### 6.1 Phase 1 — Core Restore Logic (Console Tests)

**Happy path:**
1. **Simple project restore.** Archive with 1 panel, 10 BOM rows, no ECOs. Call `executeRestore(archive, new Map(), {laborOverrides: new Map()}, console.log)` from browser console. Verify:
   - New Firestore project doc created with `status: "draft"`, `restoredFromArchive: archiveId`.
   - New BC project with new number, correct customer.
   - Task structure: 10000, 20100/10/20/99, 99999.
   - Planning lines: PROGRESS BILLING + 3 labor + N BOM items per panel.
   - `_restoringFromArchive` cleared after completion.
   - `restoreHistory` on archive has 1 entry.
   - `restoreLock` cleared.

2. **Complex project restore.** Archive with 3 panels, 2 ECOs, 4 snapshots. Verify:
   - All 3 panel task blocks.
   - All base planning lines per panel.
   - ECO task slots (20130, 20131, 20230, 20231, 20330, 20331) created.
   - ECO planning skeleton seeded on each.
   - ECO planning lines synced.
   - ECO subcollection: 2 docs with original IDs.
   - Snapshot subcollection: 4 docs.

3. **Multi-restore.** Restore the same archive a second time. Verify:
   - Second Firestore project created.
   - `restoreHistory` has 2 entries.
   - BC project numbers differ.

**Post-restore BC state verification (mandatory — per master plan §8 D):**
- ✅ New BC project with new number
- ✅ Task blocks present
- ✅ Planning lines present
- ✅ No new POs created (purchase order list unchanged)
- ✅ Customer PO field on BC project is null/empty
- ✅ `bcPoStatus` and `bcPoNumber` null on Firestore doc

### 6.2 Phase 1 — Field Reset Verification

Verify all four reset categories after restore:

| Category | Check |
|----------|-------|
| 3a: BC project-entity | `bcProjectId` = new, `bcProjectNumber` = new, `bcPoStatus` = null, `bcPoNumber` = null, `bcPdfAttached` = false |
| 3b: Per-panel | Each panel: `bcPdfAttached` = false, `bcUploadCount` = 0, `bcProjectTaskNo` = null |
| 3c: Lifecycle | `quoteRev` = 1, `createdBy` = restoring user, `createdAt` = recent, all 21 review fields null/reset, `wonAt`/`lostAt` = null |
| 3d: Master-data | `bcCustomerNumber`, `bcCustomerName`, `bcContact*`, `bcSalesperson*` preserved. Per-row `bcPartNumber`, `bcVendorNo`, `bcVendorName`, `bcPurchasePrice` preserved |
| New fields | `restoredFromArchive` = archiveId, `restoredBy` = uid, `status` = "draft" |

### 6.3 Phase 1 — Z3 Verification (Pre-Implementation)

**migrateProjectShape purity check (Z3):**
1. Grep `migrateProjectShape` function body for: `fbDb`, `firebase.`, `fetch(`, `_appCtx`, `_bcConfig`, `console.log`, `console.warn`, `console.error`.
2. If only `console.` references found: document as acceptable (logging is a benign side effect). Add one-line note to §2.4.
3. If Firestore writes or module-level state reads found: refactor to pass as parameters before Phase 1 ships.
4. Record verification result in the commit message for Phase 1.

### 6.4 Phase 1 — Failure Scenarios (including Z5)

1. **Step 6 fast-exit (Z5).** Simulate: BC returns 400 on task creation. Verify:
   - `results.warnings` has "Panel task structure failed" message.
   - Steps 7 and 8 show `status: "skipped"` — NOT cascading 400 errors.
   - Steps 9–11 still run (Firestore subcollections don't depend on task structure).
   - Retry from "Retry Failed Steps" re-enters at step 6.

2. **BC project create fails.** Simulate: disconnect BC token before step 5. Verify:
   - Firestore doc exists with `_restoringFromArchive` set, `bcProjectNumber` = null.
   - Error returned.
   - Retry: `findResumeDoc` finds doc, resumes at step 5.

2. **Planning lines fail mid-sync.** Simulate: 3 panels, disconnect after panel 2. Verify:
   - Panels 1-2 have planning lines.
   - Panel 3 has no lines.
   - `results.errors` has entry for panel 3.
   - Retry: resumes at step 6. Panel 1-2 re-sync (no-op diff). Panel 3 syncs.

3. **ECO task creation fails.** Simulate: disconnect during step 8. Verify:
   - Error accumulated.
   - Retry: `bcAddEcoTask` idempotent — already-created slots found via probe.

### 6.5 Phase 1 — Resume Tests

1. **Resume after step 4 (Firestore save, no BC project yet).**
   - Create archive. Start restore, kill BC after Firestore save but before `bcCreateProject`.
   - Click "Resume Restore". Verify: `findResumeDoc` finds doc. `bcProjectNumber` is null → resumes at step 5. New BC project created. Restore completes.

2. **Resume after step 5a (BC project created, checkpointed).**
   - Start restore, kill connection after step 5a.
   - Resume. Verify: `bcProjectNumber` exists → skips to step 6. Task structure and planning lines created. No duplicate BC project.

3. **Resume after partial step 7 (some panels synced).**
   - Start restore on 3-panel project, kill after 2 panels.
   - Resume. Verify: all 3 panels get planning lines (panels 1-2 via no-op diff, panel 3 fresh).

4. **Z9: Resume after step 10 (snapshot idempotency).** Archive with 4 snapshots. Start restore, kill after step 10 completes but before step 11 cleanup. Resume. Verify:
   - `_snapshots` subcollection has exactly 4 docs (not 8). Doc IDs match archive source IDs.
   - This test validates the `.doc(doc.id).set()` fix — `.add()` would have created 4 duplicates.

### 6.6 Phase 1 — Lock Contention Tests

1. **Two tabs, same user.** Tab A starts restore. Tab B clicks Restore on same archive within 5 min.
   - Tab B: lock check passes (same UID). `findResumeDoc` finds Tab A's doc. Resume continues.
   - Both tabs should not conflict — second tab just re-runs idempotent steps.

2. **Two tabs, different users.** Tab A (User A) starts restore. Tab B (User B) clicks within 5 min.
   - Tab B: HARD BLOCK dialog. "This archive is being restored by [User A]". No proceed button.

3. **Stale lock takeover.** User A starts, disconnects. After 5+ minutes, User B clicks Restore.
   - User B: lock is stale → acquires new lock. `findResumeDoc` may or may not find a doc.
   - If found: resume. `restoredBy` updated to User B.
   - If not found: fresh restore.

### 6.7 Phase 1 — A5 Smoke Test (bcAddEcoTask Idempotency)

**Critical pre-implementation test (checklist item #13):**

1. Create a test BC project (or use an existing one).
2. Call `bcAddEcoTask(bcNumber, 1, 1, "Panel 1")` → task slot 20130 created.
3. Call `bcAddEcoTask(bcNumber, 1, 1, "Panel 1")` again → should NOT create a duplicate. Verify:
   - No error thrown.
   - BC project still has exactly one task 20130.
4. Call `bcCreateEcoTaskPlanningSkeleton(bcNumber, 1, 1, "Panel 1")` → skeleton lines created.
5. Call `bcCreateEcoTaskPlanningSkeleton(bcNumber, 1, 1, "Panel 1")` again → should NOT duplicate lines.

**Note:** The supplement (GAP 1) claimed `bcAddEcoTask` already probed before creating — this was WRONG. Both `bcAddEcoTask` and `bcCreateEcoTaskPlanningSkeleton` did direct POSTs with no probe. Fixed in Phase 0 (v1.20.40, `87b13eaf`). This smoke test empirically validates the Phase 0 fix, not the supplement's claim.

### 6.8 Phase 2 — Remap Tests

1. **Item skip:** Missing item, user clicks "Skip". Restore. Verify: BOM row has `restoreSkipped: true`. Planning line is Text type. `customerSupplied` unchanged.

2. **Item remap to valid BC item.** Missing item, user types valid part number. Restore. Verify: BOM row has new `partNumber`, `bcPartNumber` updated, `bcVerify` null, `bcItemId` null. Planning line uses the new item.

3. **Item remap to invalid string.** Missing item, user types nonsense. Restore. Verify: planning line falls back to Text type (same as skip, but no `restoreSkipped` flag). Error appears in results summary.

4. **Customer remap.** Missing customer, user types valid customer number. Verify:
   - `bcCustomerNumber` = new value.
   - `bcContactNo`/`bcContactName`/`bcContactEmail`/`bcContactPhone` all null (D7).
   - BC project created with remapped customer.

5. **Vendor remap.** Missing vendor, user types new vendor number. Verify:
   - All BOM rows with old vendor → updated to new `bcVendorNo`, `bcVendorName`.
   - `unitPrice` unchanged.

6. **Vendor "accept as-is."** Missing vendor, user accepts. Verify:
   - BOM rows retain original vendor data.
   - No BC write failure (planning lines use Item type, not Vendor).

### 6.9 Phase 3 — Progress UI Tests

1. **Full happy path.** Restore completes. Progress view shows all steps green. "Open Project" button works.
2. **Partial failure.** Some planning lines fail. Progress view shows mixed green/red. "Retry Failed Steps" re-runs from step 6.
3. **Modal cannot be dismissed during BC writes.** Click outside modal during progress → no close. Browser close → `onbeforeunload` warning.

### 6.10 Phase 4 — restoreSkipped BOM Tests

1. Restore a project with 2 skipped items. Open project BOM. Verify:
   - Skipped rows have amber tint + `⚠ SKIPPED` badge.
   - Tooltip on badge shows expected text.
   - Rows are fully editable.

2. Run BC re-verify on the restored project (with the skipped item now existing in BC). Verify:
   - `restoreSkipped` cleared.
   - Amber tint removed.

3. Manually edit a skipped row's `partNumber`. Verify: `restoreSkipped` cleared.

### 6.11 Phase 5 — Interrupted Restore Tests

1. Start a restore, kill the browser tab mid-way. Wait > 5 min. Open ArchiveBrowserModal.
   - Verify: archive row shows "⚠ Interrupted restore" with Resume/Start Fresh/View Archive buttons.

2. Click "Resume Restore". Verify: goes directly to restore flow (skips preview), finds resume doc, completes from checkpoint.

3. Click "Start Fresh". Verify: opens preview, user confirms, fresh restore starts (old partial doc becomes orphan).

### 6.12 Phase 6 — Navigation Handoff Tests (A9)

1. Complete a restore. Click "Open Project" in completion view. Verify:
   - ArchiveBrowserModal closes.
   - RestorePreviewModal closes.
   - Project list refreshes.
   - Restored project opens in ProjectView.
   - Project appears in Sales Kanban column (status=draft).

---

## 7. Open Questions

### 7.1 `saveProject` Side Effects on Restore

`saveProject` (line 8255) contains several guards and auto-behaviors:
- **High-water save guard** (line 8264): Blocks saves that reduce panel count. For restore, the project is new (no prior save), so `_saveHighWater[project.id]` is empty. No guard fires. ✅ Safe.
- **storageUrl regression guard** (line 8307): Reads current Firestore doc. For new projects, the doc doesn't exist yet. `_curDoc.exists` check handles this. ✅ Safe.
- **bomVersion bump** (line 8292): Computes hash delta against current doc. For new projects, no prior hash — no bump. ✅ Safe.
- **quoteRev bump** (line 8293): Same — no prior state, no bump. ✅ Safe.

**Conclusion:** `saveProject` is safe for restore's initial write. No special handling needed.

### 7.2 ECO Source Data for `bcSyncEcoPanelPlanningLines`

`bcSyncEcoPanelPlanningLines` (line 3565) filters the panel's BOM for ECO-tagged rows matching the given `ecoId`/`ecoNumber`. The archived panel's BOM contains these tagged rows. The function reads from the panel data passed to it — it does NOT query Firestore for ECO docs.

However, the function references `ecoId` which comes from the project's `ecoSummary`. During restore, `ecoSummary` is preserved from the archive (it's master-data, not reset). The `ecoSummary` entries carry `ecoId` (the Firestore doc ID in the `ecos` subcollection) and `ecoNumber`.

**Potential issue:** The ECO subcollection docs are recreated in step 9 — AFTER the planning lines are synced in step 8. Does `bcSyncEcoPanelPlanningLines` need the ECO doc to exist in Firestore? Reading the function (line 3565–3594): it only reads from the `panel` parameter's `bom` array (filtering by `ecoTag === ecoId`). It does NOT read the ECO Firestore doc. ✅ Safe — step 9 can run after step 8.

### 7.3 `_restoringFromArchive` Firestore Index

`findResumeDoc` queries `where("_restoringFromArchive", "==", archiveId)` without `orderBy`. Single-field equality filters use Firestore's automatic single-field indexes. No composite index needed. Confirmed by Milestone C experience: composite indexes are only required for `where()` + `orderBy()` on different fields.

**Forward note:** If `findResumeDoc` ever adds `orderBy`, a composite index would be needed. Add to `firestore.indexes.json` checklist (finding #61 forward-looking note).

### 7.4 Copy to New Quote (Milestone E) — Out of Scope

Milestone D covers Restore only. The "Copy to New Quote" button remains disabled with "Coming in next update" tooltip. The copy path shares ~90% of `executeRestore` but adds ECO flatten logic (plan §2a Critical #3). Deferred to Milestone E.

The `ecoMode` radio buttons already exist in RestorePreviewModal (lines 40549–40561). They are used only in copy mode and will be wired in Milestone E.

### 7.5 Flagged Constraint: `bcCreateProject` Is NOT Idempotent

Per supplement GAP 1: `bcCreateProject` (line 3744) does a POST that creates a new project every time. Running it twice creates two BC projects. The checkpoint at step 5a is the protection: `bcProjectNumber` is persisted to Firestore immediately after creation. Resume skips step 5 if `bcProjectNumber` exists.

**Risk scenario:** BC project created successfully, Firestore checkpoint write fails (extremely unlikely — Firestore writes are reliable). In this case, resume would call `bcCreateProject` again, creating a second BC project. The first BC project becomes orphan. This is the D3 "leave it" policy. The orphan is in Quote status with no data.

**Mitigation if this becomes a pattern:** Before `bcCreateProject`, query BC for any project with the same display name created recently. Not implemented in Milestone D — the risk is negligible.

### 7.6 No Open Product Decisions Required

All decisions have been resolved in the supplement (D1–D8 + A1–A9). No product decisions remain for Jon.

---

## Appendix A: State Machine for RestorePreviewModal

```
                    ┌──────────┐
                    │  preview  │ ← mount
                    └────┬─────┘
                         │ Confirm clicked
                         ▼
                    ┌──────────┐
              ┌──── │ progress │
              │     └────┬─────┘
              │          │
       error  │          │ all steps done
              │          ▼
              │     ┌──────────┐
              │     │completion│ → [Open Project] → close + navigate
              │     └──────────┘
              │
              ▼
         ┌─────────┐
         │ failure  │ → [Retry] → back to progress
         └────┬────┘   [Open Project Anyway] → close + navigate
              │
              └── errors[] displayed
```

Internal state variable: `modalView = "preview" | "progress" | "completion" | "failure"`

## Appendix B: Callback Chain Wiring (A9 Navigation)

```
App component
  ├── state: showArchiveBrowser, archivePreviewTarget
  ├── handleRestoreComplete(newProjectId):
  │     1. setArchivePreviewTarget(null)   // close preview modal
  │     2. setShowArchiveBrowser(false)      // close browser modal
  │     3. const projects = await loadProjects(uid)
  │     4. setProjects(projects)
  │     5. const proj = projects.find(p => p.id === newProjectId)
  │     6. if (proj) handleOpen(proj)        // open project in ProjectView
  │
  ├── <ArchiveBrowserModal
  │     onRestoreComplete={handleRestoreComplete}
  │     ...
  │   />
  │
  └── <RestorePreviewModal
        onRestoreComplete={(newProjectId) => {
          // Callback received from ArchiveBrowserModal via prop drilling
          // or directly from App if modals are siblings (current architecture)
          props.onRestoreComplete(newProjectId);
        }}
        ...
      />
```

**Current modal architecture (lines 43689–43690):** Both modals are rendered as siblings in the App component. `ArchiveBrowserModal` and `RestorePreviewModal` are both children of App. The callback doesn't need to pass through ArchiveBrowserModal — it can go directly from RestorePreviewModal to App.

Simplified wiring:
```jsx
{archivePreviewTarget && <RestorePreviewModal
  archive={archivePreviewTarget.archive}
  mode={archivePreviewTarget.mode}
  uid={user.uid}
  onClose={() => setArchivePreviewTarget(null)}
  onRestoreComplete={handleRestoreComplete}  // NEW
/>}
```

## Appendix C: Files Modified Per Phase

| Phase | Files | Lines touched (approximate) |
|-------|-------|-----------------------------|
| 1 | `src/app.jsx` | ~9220 (new functions, ~250 lines) |
| 2 | `src/app.jsx` | ~40345-40570 (RestorePreviewModal remap UI, ~150 lines) |
| 3 | `src/app.jsx` | ~40345-40570 (RestorePreviewModal progress/completion, ~200 lines) |
| 4 | `src/app.jsx` | BOM row rendering (scattered), ~4613 (_bcReVerifyNotInBc), ~50 lines total |
| 5 | `src/app.jsx` | ~40206-40340 (ArchiveBrowserModal), ~60 lines |
| 6 | `src/app.jsx` | ~43689-43690 (App modal rendering), ~43286 (new handler), ~30 lines |

**Total estimated new code:** ~740 lines across 6 phases.

---

*Plan v3 complete. Analyst Z1–Z10 findings folded in. Z9 bug fix is load-bearing (snapshot idempotency). Awaiting Jon greenlight for implementation.*

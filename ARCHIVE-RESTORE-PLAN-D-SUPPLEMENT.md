# Milestone D Planning Supplement

**Author:** Coach (Senior Development Engineer, Architecture)
**Date:** 2026-05-29
**Scope:** Restore execution design specifics for Milestone D
**Status:** Spec v3 — All decisions resolved (D1-D8 + A6). Ready for ARC Dev implementation planning.
**Prerequisite:** Milestone C shipped (v1.20.28 → v1.20.39), including cost-source hotfix. Smoke test confirmed.

---

## Table of Contents

1. [Plan Consistency Audit — Milestone D Surface](#1-plan-consistency-audit--milestone-d-surface)
2. [BC Write Sequence and Dependency Ordering](#2-bc-write-sequence-and-dependency-ordering)
3. [Lock Acquisition — Race Condition Design](#3-lock-acquisition--race-condition-design)
4. [executeRestore() Orchestration](#4-executerestore-orchestration)
5. [Partial-Failure Recovery and Resume Semantics](#5-partial-failure-recovery-and-resume-semantics)
6. [restoreSkipped Visual Treatment (GAP 3 Promotion)](#6-restoreskipped-visual-treatment-gap-3-promotion)
7. [bcFetchPurchasePrices {signal} Refactor — Now In Scope](#7-bcfetchpurchaseprices-signal-refactor--now-in-scope)
8. [User Feedback During Multi-Step BC Write](#8-user-feedback-during-multi-step-bc-write)
9. [Newly-Restored Project State](#9-newly-restored-project-state)
10. [Remap Application Semantics](#10-remap-application-semantics)
11. [Milestone D Readiness Checklist](#11-milestone-d-readiness-checklist)

---

## 1. Plan Consistency Audit — Milestone D Surface

Reviewed all Milestone D-relevant plan sections (§2 "Restore Execution" at lines 99-157, §2 "Resume Detection" at lines 163-171, §7.7 "Restore Lock UX", §8 "Milestone D Test Approach" at lines 787-841) against Milestone C implementation state (v1.20.39) and the cost-source hotfix. Seven gaps found; remaining surfaces are consistent.

### GAP 1: DECISION NEEDED — BC write ordering on partial failure

**What the plan says:** Steps 5-10 are listed in sequence (create project → tasks → base planning lines → ECO planning lines → ECO subcollection → snapshots → cleanup). The resume detection (lines 163-171) has a two-state checkpoint: `bcProjectNumber === null` → resume from step 5; `bcProjectNumber !== null` → resume from step 6.

**What's missing:** The plan says "all BC write functions are idempotent per brief §7" but doesn't verify this against the actual function implementations. Specifically:

- `bcCreateProject` (line 3744) **is NOT idempotent** — it does a POST that creates a new project every time. Running it twice creates two BC projects. The plan's resume skips past it (resumes from step 6 if bcProjectNumber exists), which is correct, but only if the Firestore checkpoint reliably captures bcProjectNumber before any subsequent step runs.
- `bcCreatePanelTaskStructure` (line 2779) **is idempotent** — it probes for existing tasks before creating (line 2901-2908 fast path).
- `bcSyncPanelPlanningLines` (line 3299) **is idempotent** — it does incremental diff (fetch existing, PATCH/POST/DELETE).
- `bcSyncEcoPanelPlanningLines` (line 3565) **is idempotent** — same incremental diff pattern.
- `bcAddEcoTask` (line 2955) — **is idempotent** (A5 confirmed). Probes for existing ECO task slot (line 2960-2975) before creating. On retry, the probe finds the already-created slot and returns without a second POST. `bcCreateEcoTaskPlanningSkeleton` (line 3031) also probes — if skeleton lines already exist, it skips creation. Safe to re-run on resume.

**Decision needed:** What checkpoint granularity does `executeRestore` use? The plan has only one Firestore checkpoint (step 4). See §5 below for detailed analysis and recommendation.

### GAP 2: DECISION NEEDED — Remap application for items, customer, and vendors

**What the plan says:** Step 3 says "apply remaps" — one sentence. The `remaps` parameter is `{items: {partNumber: {action, remapTo}}, customer: {action, remapTo}, vendors: {vendorNo: {action, remapTo}}}`.

**What's missing:** What does each remap `action` do to the project data? Specifically:
- **Item remap:** Does it rewrite `partNumber` on every BOM row referencing the old part? Does it update `bcPartNumber`, `bcItemId`, `bcItemNumber`? Does it clear `bcVerify`?
- **Item skip:** Sets `restoreSkipped: true` — but does the planning line creation skip these rows? (Yes — see §6.)
- **Customer remap:** Rewrites `bcCustomerNumber` and `bcCustomerName` on the project? What about `bcContactNo`/`bcContactName`/`bcContactEmail`/`bcContactPhone` — those are contact-level fields tied to the customer?
- **Vendor remap:** Rewrites `bcVendorNo` and `bcVendorName` on all BOM rows referencing the old vendor?
- **Vendor "accept as-is":** Keeps the original vendor data. What if the vendor is missing from BC? Planning lines POST with Item type, not Vendor — so missing vendors don't block BC writes directly. But the restored project will have vendor references that don't resolve. Is this acceptable?

See §10 for detailed analysis and recommendation per action type.

### GAP 3: Cost-source hotfix changes Milestone D's Direct_Unit_Cost handling

**What the plan says:** Step 7 calls `bcSyncPanelPlanningLines` which writes `Unit_Cost: row.unitPrice || 0` on each BOM item line (line 3436). The plan doesn't address whether restored BOM rows should carry their archived `unitPrice` or a refreshed `Direct_Unit_Cost` from BC.

**What's changed since the plan:** The cost-source hotfix established that `unitPrice` on `priceSource==="bc"` rows *was* the `Direct_Unit_Cost` at archive time (line 4638-4639). For restored projects, `unitPrice` is the correct value to push to BC planning lines — it's what the project was quoted at.

**Resolution (no decision needed):** Keep the current behavior. `bcSyncPanelPlanningLines` reads `row.unitPrice` and pushes it as `Unit_Cost` to BC. This is correct for restore — the restored project should carry its archived pricing. If the user wants to re-price after restore, they run a pricing sync (existing feature).

### GAP 4: DECISION NEEDED — restoreSkipped visual treatment in BOM

Promoted from C supplement GAP 3. Now blocking for Milestone D — the Skip button exists in the preview UI but the restored BOM needs to render skipped rows visibly. See §6 for full spec.

### GAP 5: Plan doesn't specify bcFetchPurchasePrices {signal} refactor scope for D

**What the plan says:** The original F2 deferral (now reversed by the cost-source hotfix) said `bcFetchPurchasePrices` signal refactor was "Milestone D pre-work." The hotfix created `bcFetchPurchasePricesMultiVendor` (with signal) for drift detection, but the original `bcFetchPurchasePrices` still lacks signal support.

**Question:** Does Milestone D need `bcFetchPurchasePrices` (single-vendor dedup) with signal, or is the existing function sufficient? See §7.

### GAP 6: DECISION NEEDED — ECO task slot creation during restore

**What the plan says:** Steps 7-8 call `bcSyncPanelPlanningLines` and `bcSyncEcoPanelPlanningLines`. Step 8 syncs ECO planning lines per panel per ECO. But the ECO task slots (20N30, 20N31, etc.) are NOT created by `bcCreatePanelTaskStructure` — they're created on-demand by `bcAddEcoTask` (line 2955).

**What's missing:** `bcSyncEcoPanelPlanningLines` targets task `20N3{ecoNumber-1}`. If that task doesn't exist, every POST returns 400. The plan's step 6 creates the base panel task structure (10000, 20N00/10/20/99) but NOT ECO task slots.

**Required fix:** Add a step 6b: for each panel × each archived ECO, call `bcAddEcoTask(bcNumber, panelIndex, ecoNumber, panelName)` to create the ECO task slot BEFORE syncing ECO planning lines in step 8. `bcAddEcoTask` is idempotent (probes before creating, line 2960-2975).

Also requires `bcCreateEcoTaskPlanningSkeleton` (line 3031) to seed the skeleton lines (PROGRESS BILLING, CUT, LAYOUT, WIRE at qty=0) on the new ECO task. Without this, `bcSyncEcoPanelPlanningLines`'s labor PATCH at line 3715-3727 will warn "skeleton not seeded" and skip labor sync.

**Sequence must be:** `bcAddEcoTask` → `bcCreateEcoTaskPlanningSkeleton` → `bcSyncEcoPanelPlanningLines`.

### GAP 7: Plan's `_restoringFromArchive` flag and `restoreLock` timing mismatch

**What the plan says:** Step 2b acquires `restoreLock` on the archive doc. Step 4 writes the new project doc with `_restoringFromArchive: archive.archiveId`. Step 11 clears both.

**What's missing:** The plan's step 2b lock acquisition happens BEFORE step 4 (Firestore project save). But the C supplement's §2.2a specifies "acquire late (confirm click)" which is the right moment — right before executeRestore begins. The plan and supplement are consistent on this. However, between lock acquisition and step 4 (Firestore save), a BC token expiration or network failure would leave the lock acquired but no resume doc created. The lock auto-expires after 5 minutes, so this is self-healing. Documenting for clarity — no decision needed.

### Surfaces that ARE consistent

| Surface | Refinement | Plan location | Status |
|---------|-----------|---------------|--------|
| Permission model (Restore = canWrite) | Per plan | Lines 182, 599 | Consistent |
| R2 hard-block restore lock (3 cases) | Per plan §7.7 | Lines 709-729 | Consistent, deployed in C (advisory check) |
| `_archiveComplete` integrity check | Step 2 of executeRestore | Line 112 | Consistent |
| migrateProjectShape invocation | Step 3, after deep clone, before resets | Lines 159, 404-427 | Consistent |
| Field resets (4 categories) | Steps 3a-3d | Lines 121-138 | Consistent |
| Archive envelope field stripping | Step 3, known list | Lines 410-421 | Consistent |
| ECO subcollection: preserve original doc IDs | Step 9 | Line 151 | Consistent (Q7 resolved) |
| Snapshot subcollection: auto-id | Step 10 | Line 153 | Consistent |
| Resume detection: query by `_restoringFromArchive` | findResumeDoc | Lines 163-171 | Consistent |
| Post-restore: append restoreHistory, clear lock | Step 11 | Lines 155-156 | Consistent |

---

## 2. BC Write Sequence and Dependency Ordering

### 2.1 Hard Dependencies (MUST respect ordering)

```
Step 5: bcCreateProject(name, customerNumber)
   ↓  requires bcProjectNumber from step 5
Step 6: bcCreatePanelTaskStructure(bcNumber, name, panels)
   ↓  requires task slots 20N10 to exist
Step 7: bcSyncPanelPlanningLines(bcNumber, panelIndex, panel, name)  × N panels

Step 6b: bcAddEcoTask(bcNumber, panelIndex, ecoNumber, panelName)  × N panels × M ECOs
   ↓  requires ECO task slot 20N3{eco-1} to exist
Step 6c: bcCreateEcoTaskPlanningSkeleton(bcNumber, panelIndex, ecoNumber, panelName)  × same
   ↓  requires skeleton lines seeded
Step 8: bcSyncEcoPanelPlanningLines(bcNumber, panelIndex, ecoNumber, ecoId, panel, name)  × same
```

### 2.2 Ordering Within Steps

**Step 7 (base planning lines):** Panels can be synced sequentially (1, 2, 3, ...). Each panel targets a different task (20110, 20210, 20310), so there's no ordering dependency between panels. However, BC rate limiting means sequential is safer than parallel.

**Steps 6b-8 (ECO flow):** For each `(panel, eco)` pair, the three calls MUST be sequential: task slot → skeleton → planning lines. Across panels, the order doesn't matter. ARC Dev should iterate panels sequentially, and within each panel, iterate ECOs in ecoNumber order.

**Steps 9-10 (Firestore subcollections):** No BC dependency. Can run after all BC writes complete, or interleaved. Recommend running after BC writes — if BC fails, we might want to roll back the Firestore doc.

### 2.3 Recommended Execution Order

```
 1. Acquire restoreLock (Firestore transaction)
 2. Validate _archiveComplete
 3. Build project data (deep clone, migrate, reset, apply remaps + labor overrides)
 4. Save to Firestore with _restoringFromArchive flag
 5. bcCreateProject → get bcProjectNumber
 5a. Update Firestore doc with bcProjectNumber (CHECKPOINT — resume skips to 6)
 6. bcCreatePanelTaskStructure
 7. For each panel: bcSyncPanelPlanningLines
 8. For each panel × each ECO:
    a. bcAddEcoTask
    b. bcCreateEcoTaskPlanningSkeleton
    c. bcSyncEcoPanelPlanningLines
 9. Fetch + recreate _ecos subcollection (Firestore)
10. Fetch + recreate _snapshots subcollection (Firestore)
11. Clear _restoringFromArchive, append restoreHistory, release restoreLock
12. Return {newProjectId, bcProjectNumber} for navigation
```

**Key change from plan:** Step 5a is new — a Firestore update that persists `bcProjectNumber` immediately after BC project creation. This ensures resume detection works correctly. Without it, a failure between step 5 and step 6 would leave a Firestore doc with `bcProjectNumber: null`, and resume would try to create ANOTHER BC project.

---

## 3. Lock Acquisition — Race Condition Design

### 3.1 Firestore Transaction for Lock Acquire

The plan's lock acquisition (step 2b) describes a read-then-write pattern. Without a transaction, two users clicking "Confirm Restore" within milliseconds of each other could both read "no lock" and both write their own lock.

**Recommendation: Use `fbDb.runTransaction()`.** The codebase already uses this pattern in four places (lines 2189, 14203, 14257, 34242). The transaction reads the archive doc, checks the lock, and writes the lock atomically.

```js
// Pseudocode — lock acquisition
const archiveRef = fbDb.doc(`${archivePath}/${archiveId}`);
const lockResult = await fbDb.runTransaction(async tx => {
  const doc = await tx.get(archiveRef);
  if (!doc.exists) throw new Error("Archive not found");
  const data = doc.data();

  // Integrity check
  if (!data._archiveComplete) throw new Error("Archive is incomplete");

  const lock = data.restoreLock;
  const now = Date.now();
  const STALE_MS = 5 * 60 * 1000;

  if (lock && lock.lockedBy !== uid && (now - lock.lockedAt) < STALE_MS) {
    return { blocked: true, lockedByName: lock.lockedByName, lockedAt: lock.lockedAt };
  }

  // Acquire lock
  tx.update(archiveRef, {
    restoreLock: { lockedBy: uid, lockedByName: userName, lockedAt: now }
  });
  return { blocked: false };
});
```

**Why transaction, not simple write:** Firestore transactions retry automatically on contention. Two concurrent confirm-clicks will serialize — one gets the lock, the other sees the lock and gets hard-blocked. Without a transaction, both could succeed (classic TOCTOU race).

### 3.2 Lock Release

Lock is released in step 11 via a simple Firestore update (not inside a transaction — no race risk on release). If the restore fails at any point, the lock auto-expires after 5 minutes.

### 3.3 Stale Lock Takeover

When a stale lock is encountered (> 5 min old), the transaction writes a new lock for the current user. The new user then calls `findResumeDoc(archiveId)` — if a Firestore doc with `_restoringFromArchive === archiveId` exists, they resume it. This handles the case where User A started a restore, disconnected, and User B takes over.

**Edge case — stale lock but no resume doc:** User A acquired the lock but failed before step 4 (no Firestore doc created). User B takes over the stale lock and starts a fresh restore. Correct behavior.

**Edge case — stale lock with resume doc from different user:** User A started, got to step 5a (Firestore doc has bcProjectNumber). User B takes over. `findResumeDoc` finds User A's doc. User B resumes from step 6 using User A's bcProjectNumber. BC idempotency ensures no duplicate writes. Correct behavior.

**A2: `restoredBy` field for stale-lock takeover auditing.** When a user acquires a lock (fresh or stale takeover), write `restoredBy: uid` alongside the lock. When a different user takes over a stale lock and resumes, update the project doc's `restoredBy` to the new user's UID. This answers "who actually completed this restore?" in the audit trail — the `createdBy` field records who started it, `restoredBy` records who finished it (they differ on stale-lock takeover).

---

## 4. executeRestore() Orchestration

### 4.1 Function Signature (matching plan §2)

```js
async function executeRestore(archive, remaps, options, onProgress)
```

- `archive`: full archive document from Firestore
- `remaps`: `{items: Map<partNumber, {action: "skip"|"remap"|"accept", remapTo?: string}>, customer: {action: "accept"|"remap", remapTo?: string, remapName?: string}, vendors: Map<vendorNo, {action: "accept"|"remap", remapTo?: string, remapName?: string}>}`
- `options`: `{laborOverrides: Map<panelId, number>}` — per-panel labor rate values from the preview UI
- `onProgress`: `({step: number, stepName: string, detail: string, pct: number})` — progress callback for UI

### 4.2 Internal Structure

The function should NOT be a single 200-line monolith. Recommend structuring as a sequence of awaited helper calls inside a try/catch, each reporting progress:

```js
async function executeRestore(archive, remaps, options, onProgress) {
  const report = (step, stepName, detail, pct) => onProgress?.({step, stepName, detail, pct});

  // 1. Lock acquisition (§3)
  report(1, "lock", "Acquiring restore lock...", 0);
  const lockResult = await acquireRestoreLock(archive, uid);
  if (lockResult.blocked) return { error: "blocked", ...lockResult };

  // 2. Resume check
  report(2, "resume", "Checking for in-progress restore...", 5);
  const resumeDoc = await findResumeDoc(archive.archiveId || archive.id);

  // 3. Build project data (if not resuming)
  let projectData, newProjectId, bcProjectNumber;
  if (resumeDoc) {
    newProjectId = resumeDoc.projectId;
    bcProjectNumber = resumeDoc.bcProjectNumber;
    // Load project data from Firestore for field access during BC sync
    report(3, "resume", `Resuming restore of ${bcProjectNumber || "new project"}...`, 10);
  } else {
    report(3, "build", "Building project data...", 10);
    projectData = buildRestoreProjectData(archive, remaps, options, uid);

    // 4. Save to Firestore
    report(4, "save", "Saving to Firestore...", 15);
    const saved = await saveProject(uid, { ...projectData, _restoringFromArchive: archive.archiveId || archive.id });
    newProjectId = saved.id;
  }

  // 5. Create BC project (skip if resuming with bcProjectNumber)
  if (!bcProjectNumber) {
    report(5, "bc-project", "Creating BC project...", 20);
    const customerNumber = projectData.bcCustomerNumber;
    const result = await bcCreateProject(projectData.name, customerNumber);
    bcProjectNumber = result.number;

    // 5a. Checkpoint — persist bcProjectNumber immediately
    await fbDb.doc(`${projectsPath}/${newProjectId}`).update({ bcProjectNumber, bcProjectId: result.id, bcEnv: _bcConfig.env });
  }

  // 6. Panel task structure
  report(6, "tasks", "Creating panel task structure...", 30);
  await bcCreatePanelTaskStructure(bcProjectNumber, projectData.name, projectData.panels);

  // 7. Base planning lines per panel
  const panels = projectData.panels || [];
  for (let i = 0; i < panels.length; i++) {
    report(7, "planning", `Syncing planning lines — panel ${i + 1}/${panels.length}...`, 35 + (i / panels.length) * 25);
    await bcSyncPanelPlanningLines(bcProjectNumber, i + 1, panels[i], projectData.name);
  }

  // 8. ECO task slots + skeleton + planning lines
  // ... (see §2.3 for ordering)

  // 9. Recreate ECO subcollection
  report(9, "ecos", "Recreating ECO documents...", 85);
  // ...

  // 10. Recreate snapshots subcollection
  report(10, "snapshots", "Recreating snapshots...", 90);
  // ...

  // 11. Cleanup
  report(11, "cleanup", "Finalizing...", 95);
  // Clear _restoringFromArchive, append restoreHistory, release lock
  // ...

  report(12, "done", `Restore complete — ${bcProjectNumber}`, 100);
  return { newProjectId, bcProjectNumber };
}
```

### 4.3 buildRestoreProjectData — Separate Function

Extract the deep-clone + migrate + reset + remap logic into a pure function:

```js
function buildRestoreProjectData(archive, remaps, options, uid, now) {
  let data = JSON.parse(JSON.stringify(archive));
  // Strip envelope fields (known list from plan §5 line 410-421)
  // Run migrateProjectShape
  // Apply field resets (4 categories, plan §5 lines 431-498)
  //   — use `now` for createdAt, modifiedAt, etc. (A4: deterministic timestamps)
  // Apply remaps (§10 of this supplement)
  // Apply labor overrides (see A7 merge logic below)
  return data;
}
```

**A4: Pass `now` as a parameter** rather than calling `Date.now()` internally. This makes `buildRestoreProjectData` truly pure — same inputs, same outputs. The caller (`executeRestore`) captures `const now = Date.now()` once at the top and passes it through. Benefits: (1) all timestamps in the restored project are identical (createdAt, modifiedAt, field resets), (2) unit-testable with a fixed timestamp, (3) no hidden clock dependency.

### 4.4 Labor Override Merge Logic (A7)

The preview UI lets the user override per-panel labor rates. The `options.laborOverrides` Map carries these values. Merge into panel data during `buildRestoreProjectData`:

```js
// Inside buildRestoreProjectData, after remaps applied:
if (options.laborOverrides) {
  for (const [panelId, overrideRate] of options.laborOverrides) {
    const panel = data.panels.find(p => p.id === panelId);
    if (!panel) continue;

    // Number coercion — preview UI may pass string from input field
    const rate = Number(overrideRate);
    if (Number.isNaN(rate) || rate < 0) continue;

    // Only override if panel has existing pricing data
    if (panel.pricing) {
      panel.pricing.laborRate = rate;
      // Zero is valid — user may intentionally zero out labor
    }
  }
}
```

**Edge cases:**
- **No `panel.pricing` object:** Panel was archived before pricing ran. Don't create a pricing object from nothing — the labor rate has no context without the rest of the pricing structure. Skip silently.
- **`overrideRate === 0`:** Valid. User intentionally zeroed labor (e.g., warranty project). Apply it.
- **`overrideRate` is a string:** Coerce with `Number()`. The preview UI text input may pass strings. `NaN` or negative → skip.

---

## 5. Partial-Failure Recovery and Resume Semantics

### 5.1 The Core Problem

BC OData is not transactional. If step 5 (create project) succeeds but step 7 (planning lines) fails on panel 3 of 4, BC has:
- A project (created)
- Task structure (created)
- Planning lines for panels 1-2 (created)
- No planning lines for panels 3-4
- No ECO data

The user's options are retry or manual cleanup.

### 5.2 Checkpoint Design

**Single Firestore checkpoint at step 5a** (after BC project creation). This is the critical dividing line:
- Before 5a: nothing has been created in BC (or the BC project was rolled back by `bcCreateProject`'s catch block, line 3787-3796). Resume means start fresh.
- After 5a: a BC project exists. Resume means pick up from step 6.

**Why not more checkpoints?** Each checkpoint is a Firestore write. Adding checkpoints after each panel's planning line sync would add N Firestore writes for N panels. The benefit is marginal because:
1. `bcCreatePanelTaskStructure` is idempotent (probes before creating)
2. `bcSyncPanelPlanningLines` is idempotent (incremental diff)
3. `bcSyncEcoPanelPlanningLines` is idempotent (incremental diff)
4. `bcAddEcoTask` is idempotent (probes before creating)

All steps 6-8 can safely re-run from the top. The only non-idempotent call is step 5 (`bcCreateProject`), which is protected by the 5a checkpoint.

### 5.3 Resume Flow

```
User clicks Restore on an archive:
  → acquireRestoreLock
  → findResumeDoc(archiveId)
    → If found with bcProjectNumber:
        Skip steps 3-5a. Load project data from Firestore.
        Resume at step 6 (bcCreatePanelTaskStructure).
    → If found WITHOUT bcProjectNumber:
        Skip step 3-4. Resume at step 5 (bcCreateProject).
    → If not found:
        Full restore from step 1.
```

### 5.4 DECISION NEEDED — User-Facing Error Handling

When a BC write fails mid-restore, what does the user see?

**Option A (recommended): Continue-on-error with summary.** Each BC call (steps 6-8) catches errors individually. Failed panels/ECOs are logged. At the end, show a summary:

```
Restore complete with warnings:
  ✅ BC Project PRJ402200 created
  ✅ Panel 1 — 42 planning lines synced
  ⚠ Panel 2 — 3 of 38 planning lines failed (rate limit)
  ✅ Panel 3 — 15 planning lines synced
  ❌ ECO 01 Panel 2 — task creation failed (BC error)
  [Retry Failed Steps]  [Open Project Anyway]
```

The user can retry just the failed steps, or open the project and manually fix in BC.

**Option B: Hard-stop on first error.** Simpler but frustrating — a single rate-limit-induced failure on line 30 of 200 aborts the entire restore. The user retries and waits through 30 successful lines again before hitting the next failure.

**Option C: Automatic retry with backoff.** The individual BC call functions already retry 429s (line 3476-3481, exponential backoff up to 3 attempts). Adding a higher-level retry loop around failed panels would compound complexity.

**Coach recommendation: Option A.** The existing BC call functions already handle 429 retries internally. The orchestrator should catch errors per-panel and per-ECO, accumulate results, and present a summary. A "Retry Failed" button re-runs only the failed calls (idempotent — safe to re-run).

**A1 clarification — what "Retry" actually means:** "Retry Failed Steps" does NOT attempt to re-run individual failed POST/PATCH calls. It restarts from step 6 (the first idempotent step after the 5a checkpoint). All idempotent steps re-run from the top — `bcCreatePanelTaskStructure` probes, `bcSyncPanelPlanningLines` diffs, etc. Previously-succeeded panels complete instantly (no matching diff). Previously-failed panels retry from their beginning. This is simpler than tracking per-call failure state and equally correct because every post-5a call is idempotent.

### 5.5 DECISION NEEDED — Orphan BC Project Cleanup

If the restore fails catastrophically after step 5 (BC project created) but before step 11 (cleanup), a BC project exists with incomplete data. Two options:

**Option A (recommended): Leave it.** The Firestore doc has `_restoringFromArchive` set, so resume can pick it up. The BC project is in Status="Quote" with partial data — not visible in BC's active project views, not harmful. If the user never retries, the project sits in BC as an empty quote. Manual cleanup is possible via BC.

**Option B: Attempt rollback.** After a threshold number of failures, delete the BC project. Risky — `bcCreateProject` has a rollback block (lines 3787-3796) but that only fires during the creation step itself, not after tasks and planning lines have been added. Deleting a BC project with task lines may require deleting the lines first (BC referential integrity). Too complex for the restore's error path.

---

## 6. restoreSkipped Visual Treatment (GAP 3 Promotion)

### 6.1 Now Blocking

Milestone C deferred this as "ARC Dev can propose during implementation." Milestone D activates the Skip button — the user can now click it and the restored project must render skipped rows correctly. Without a spec, ARC Dev would need to make product decisions mid-implementation.

### 6.2 BOM Row Behavior When Skipped

When the user clicks "Skip" on a missing item in the preview:

1. **BOM row preserved** — row stays in the restored project's BOM with original `partNumber`, `description`, `qty`, `unitPrice`, all fields intact.
2. **`restoreSkipped: true`** set on the row — audit marker.
3. **`customerSupplied` NOT touched** — per Q2 ruling (plan line 874).
4. **BC planning line:** Pushed as `Type: "Text"` (not `Type: "Item"`). This is the existing fallback pattern at line 3438-3441 — when an Item POST fails, the function falls back to a Text line. For `restoreSkipped` rows, skip the Item attempt entirely and go straight to Text. The text description carries the part number: `"{partNumber} - {description}"`.

### 6.3 DECISION NEEDED — Visual Treatment in BOM Table

Skipped rows need to be visually distinct in the restored project's BOM. The user must see at a glance which rows need attention.

**Recommended treatment:**

| Aspect | Spec |
|--------|------|
| Row background | Amber tint (`#78350f22` — matches ARC's warning palette) |
| Left-edge indicator | 3px amber left border on the row |
| Inline badge | `⚠ SKIPPED` badge next to the part number, amber text |
| Tooltip on badge | "This item was not found in BC when the project was restored. Review and remap to a valid BC item, or mark as customer-supplied if the customer provides this part." |
| Row interactivity | Row is fully editable — user can change `partNumber`, mark `customerSupplied`, or delete the row |
| Filter | No dedicated filter in Milestone D. The inline badge is sufficient for visual scanning. If Jon needs a "show only skipped rows" filter, it's a small post-D enhancement. |

**Clearing the flag:** When the user edits the `partNumber` on a skipped row (remaps it themselves) or runs a BC re-verify that finds the item, `restoreSkipped` should be cleared automatically. Specifically:
- `_bcReVerifyNotInBc` (line 3613) already re-checks items. If a skipped row's part is found in BC during re-verify, the update should include `restoreSkipped: null`.
- Manual `partNumber` edit → clear `restoreSkipped` on save.

### 6.4 Planning Line Follow-Up

After the restored project opens, if the user remaps a previously-skipped item to a valid BC item and syncs planning lines, `bcSyncPanelPlanningLines` will naturally replace the Text line with an Item line (the incremental diff detects `No` changed, PATCHes or deletes+recreates). No special handling needed in the planning line sync — the BOM is the source of truth.

---

## 7. bcFetchPurchasePrices {signal} Refactor — Now In Scope

### 7.1 Current State

| Function | Signal support | Used by |
|----------|---------------|---------|
| `bcFetchItemCardCosts` | ✅ `opts.signal` (v1.20.28) | buildRestorePreview (existence + description drift) |
| `bcFetchPurchasePricesMultiVendor` | ✅ `opts.signal` (v1.20.39) | buildRestorePreview (cost drift) |
| `bcFetchPurchasePrices` (single-vendor dedup) | ❌ No signal | `_bcReVerifyNotInBc` (line 4633), pricing sync flows |

### 7.2 Does Milestone D Need It?

**No.** `executeRestore` does NOT call `bcFetchPurchasePrices` or `bcFetchPurchasePricesMultiVendor`. The restore write path calls:
- `bcCreateProject` — no purchase price fetch
- `bcCreatePanelTaskStructure` — no purchase price fetch
- `bcSyncPanelPlanningLines` — pushes `Unit_Cost: row.unitPrice`, no purchase price fetch
- `bcSyncEcoPanelPlanningLines` — same, pushes `Unit_Cost: row.unitPrice`

The purchase price functions are read-path (preview/drift detection), not write-path (restore execution).

**Resolution:** The `bcFetchPurchasePrices` signal refactor is NOT required for Milestone D. It remains a nice-to-have for cancelling mid-flight pricing syncs, which is a separate feature. Remove from Milestone D scope.

---

## 8. User Feedback During Multi-Step BC Write

### 8.1 Expected Duration

For a typical project (3 panels, 80 BOM rows, 2 ECOs):

| Step | Calls | Pacing | Time |
|------|-------|--------|------|
| 5. Create BC project | 2 (POST + PATCH) | — | ~1s |
| 6. Panel task structure | ~14 tasks (10000 + 4×3 panels + 99999) | sequential | ~3s |
| 7. Base planning lines (3 panels × ~30 lines) | ~90 line POSTs/PATCHes | 300ms pacing | ~27s |
| 8. ECO tasks + skeleton + lines (2 ECOs × 3 panels) | ~6 task + ~18 skeleton + ~30 line POSTs | 300ms pacing | ~16s |
| 9-10. Firestore subcollections | ~12 doc writes | — | ~2s |

**Total: ~50 seconds for a complex project.** A 3-panel project with no ECOs takes ~30 seconds.

### 8.2 Progress UI Design

**Recommended: Modal overlay with step-by-step progress.** The RestorePreviewModal transitions to a progress view when the user clicks Confirm:

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

**Key UX details:**
- **No Cancel button during BC writes.** Once step 5 fires, a BC project exists. Cancelling mid-write would leave orphan data. The user must wait for completion or failure.
- **Close-window warning.** Set `window.onbeforeunload` during the restore to warn on tab close.
- **onProgress callback** fires at each step boundary and mid-step for planning lines (per-panel progress within step 7).
- **On completion:** progress view replaces with "Restore complete" and an "Open Project" button.
- **On failure:** progress view shows completed steps (green), failed step (red with error message), and "Retry Failed Steps" / "Open Project Anyway" buttons (per §5.4).

### 8.3 Transition From Preview to Progress

When the user clicks "Confirm Restore":
1. Replace the preview content with the progress view (same modal, different content)
2. Disable the modal's click-outside-to-close behavior
3. Hide the Cancel button
4. Start `executeRestore()` with onProgress wired to the step list

This avoids the jarring UX of closing one modal and opening another.

### 8.4 Interrupted Restore Indicator in ArchiveBrowserModal (A6)

If a prior restore was interrupted (lock expired, user closed tab, network failure), the archive has a stale `restoreLock` and a Firestore doc with `_restoringFromArchive` still set. The user needs to know this BEFORE clicking Restore again.

**Detection:** When ArchiveBrowserModal loads an archive row, check for `restoreLock` on the archive doc. If `restoreLock.lockedAt` is stale (> 5 min old), display an indicator:

```
┌──────────────────────────────────────────────────────────┐
│ PRJ402107 - Customer Panel Job         Archived 2026-03  │
│ ⚠ Interrupted restore (started by Jon, 2h ago)           │
│ [Resume Restore]  [Start Fresh]  [View Archive]          │
└──────────────────────────────────────────────────────────┘
```

- **Resume Restore:** Takes the stale lock, calls `findResumeDoc`, enters the resume flow (step 6+).
- **Start Fresh:** Takes the stale lock, does NOT look for a resume doc, starts a full new restore. The old partial project doc (with `_restoringFromArchive`) becomes orphaned — it will have `_restoringFromArchive` set permanently, but no `bcProjectNumber` write path targets it again. Acceptable for Milestone D; a cleanup sweep can be added later.
- When no stale lock exists, the standard Restore button appears as today.

---

## 9. Newly-Restored Project State

### 9.1 What State Does the Restored Project Open In?

Per the plan's field resets (§5 lines 431-498):

| Field | Value | Effect |
|-------|-------|--------|
| `status` | `"draft"` | Project appears in Sales column on Kanban |
| `bcProjectNumber` | New number from step 5 | Different from archived project number |
| `bcEnv` | `_bcConfig.env` | Matches current BC environment — no stale-state muting |
| `bcPoStatus` | `null` | Routes to Sales column |
| `bcPoNumber` | `null` | No PO linked |
| `quoteRev` | `1` | Clean slate |
| `createdBy` | Restoring user's UID | |
| `createdAt` | Now | |
| `restoredBy` | UID of user who completed the restore | Differs from `createdBy` on stale-lock takeover (A2) |
| All review fields | `null` / reset | Clean review cycle |

### 9.2 DECISION NEEDED — Does Restored Project Need a Distinguishing Flag?

The plan doesn't specify a `restoredFromArchive` flag on the project itself (only `_restoringFromArchive` during the restore process, cleared afterward). Two options:

**Option A (recommended): Add `restoredFromArchive: archiveId` as a permanent field.** Benefits:
- The user can see "This project was restored from archive XYZ" in project details
- Future queries can find all restored projects
- Audit trail connecting restored project to its archive source
- Read-only — no behavioral impact

**Option B: No flag.** The `restoreHistory` on the archive doc provides the audit trail. The project itself has no memory of being restored. Simpler but loses the project-side reference.

**A3 note:** If Option A is chosen and multi-restore becomes a pattern (same archive restored multiple times), consider expanding the field to `restoredFromArchive: {archiveId, restoreIndex}` where `restoreIndex` matches the index in the archive's `restoreHistory[]` array — providing a bidirectional link. For Milestone D the simple `archiveId` string is sufficient.

### 9.3 Does It Need Re-Verify on First Open?

**No.** The restore just created the BC project, task structure, and planning lines — all BC data is fresh. Running `_bcReVerifyNotInBc` would re-check all items against BC and potentially overwrite `unitPrice` with current `Direct_Unit_Cost` values, undoing the archived pricing.

**Exception:** `restoreSkipped` rows DO need re-verify eventually, but that's user-initiated (the user sees the amber-flagged rows and decides to remap/re-verify).

### 9.4 Navigation After Restore

After step 12 (return), the caller should:
1. Close the RestorePreviewModal
2. Reload the project list (`loadProjects()`)
3. Navigate to the new project (set it as the active project)

The restored project appears in the Sales Kanban column (status=draft, bcPoStatus=null) with a fresh quote number.

### 9.5 Navigation Handoff Caller Chain (A9)

After `executeRestore` returns `{newProjectId, bcProjectNumber}`, the UI must navigate to the new project. The caller chain:

```
RestorePreviewModal
  → executeRestore() returns {newProjectId, bcProjectNumber}
  → onRestoreComplete(newProjectId)    // callback prop from parent

ArchiveBrowserModal (parent of RestorePreviewModal)
  → receives onRestoreComplete
  → closes both modals (ArchiveBrowser + RestorePreview)
  → calls props.onProjectSelect(newProjectId)  // callback from app shell

App shell (project list / Kanban view)
  → receives onProjectSelect
  → calls loadProjects() to refresh the list
  → sets activeProjectId = newProjectId
  → project detail view opens with the restored project
```

**Why document this:** The RestorePreviewModal is three layers deep from the app shell. The callback chain must be wired during Milestone D implementation. If any layer swallows the return value or doesn't propagate the callback, the user sees "Restore complete" but stays on the archive browser with no way to reach the new project.

**Alternative (simpler):** Instead of a callback chain, `executeRestore` could write the new project ID to a ref and the progress view's "Open Project" button could use `window.location.hash` or a top-level navigation function (if one exists). ARC Dev should assess which pattern matches the existing modal→app-shell communication.

---

## 10. Remap Application Semantics

### 10.1 Customer Remap

**Action: `"accept"`** — Customer exists in BC (or name changed). No modification to project data. `bcCustomerNumber` and `bcCustomerName` remain as archived.

**Action: `"remap"`** — Customer is missing. User selected a different BC customer from a picker.

Apply to project data:
- `bcCustomerNumber` → `remaps.customer.remapTo`
- `bcCustomerName` → `remaps.customer.remapName`

**Contact fields (`bcContactNo`, `bcContactName`, `bcContactEmail`, `bcContactPhone`):** These are customer-contact-level fields. If the customer is remapped, the archived contacts won't match the new customer. Two options:

**Option A (recommended): Clear contact fields on customer remap.** Set all four to `null`. The user re-selects a contact after the project opens. Carrying stale contacts from the old customer is worse than having no contacts.

**Option B: Preserve contacts.** Keep the archived values. They reference the old customer's contacts — likely wrong, but the user might know the same person exists under the new customer.

### 10.2 Vendor Remap

**Action: `"accept"`** — Vendor exists (or was accepted despite being missing). No modification.

**Action: `"remap"`** — Vendor is missing. User selected a different BC vendor.

Apply to ALL BOM rows where `bcVendorNo === oldVendorNo`:
- `bcVendorNo` → `remaps.vendors.get(oldVendorNo).remapTo`
- `bcVendorName` → `remaps.vendors.get(oldVendorNo).remapName`

**Note:** Vendor remap only affects the reference fields. `unitPrice` is NOT recalculated — that's the archived price. If the user wants to re-price from the new vendor's Purchase Prices, they run a pricing sync after restore.

### 10.3 Item Remap

**Action: `"accept"`** — Item exists in BC (matched, or had cost drift that user accepted). No modification.

**Action: `"skip"`** — Item is missing. User chose to skip it. Set `restoreSkipped: true` on all BOM rows with this part number. See §6.

**Action: `"remap"`** — Item is missing. User selected a different BC item.

Apply to ALL BOM rows where `partNumber === oldPartNumber`:
- `partNumber` → `remaps.items.get(oldPartNumber).remapTo`
- `bcPartNumber` → same (these are the same field in practice)
- `bcItemId` → `null` (new item, unknown ID until BC lookup)
- `bcItemNumber` → `remaps.items.get(oldPartNumber).remapTo`
- `bcVerify` → `null` (needs re-verification)
- `description` → **preserve archived** (don't overwrite with new item's description — the user chose this description for this BOM slot)
- `unitPrice` → **preserve archived** (don't overwrite — user can re-price after restore)

### 10.5 Stale Remap Targets (A8)

A remap target (customer, vendor, or item) may become invalid between the time the user selects it in the preview and the time `executeRestore` runs. Scenarios:
- User selects a customer in preview → that customer is deleted/blocked in BC before Confirm
- User types a replacement part number → typo, or the item is deactivated in BC

**Resolution:** This is covered by D2's continue-on-error semantics. If `bcCreateProject` fails because the remapped customer doesn't exist, it's a step 5 failure — the restore hasn't created anything in BC yet, so the user gets a clean error and can retry with a different customer. If a remapped item's planning line POST fails (step 7), it falls back to Text type — same as `restoreSkipped`. The summary shows which lines failed, and the user can fix them in the restored project.

No additional validation in the preview is required for Milestone D. If the BC search picker is added later (§10.6), it naturally reduces stale-target risk by validating at selection time.

### 10.6 DECISION NEEDED — Item Remap UI in Preview

The current preview shows missing items but has no remap picker (Milestone C scope was display-only). Milestone D needs:

**Minimum viable:** A text input next to each missing item where the user types a replacement part number. No validation against BC during preview — if they type a wrong number, the planning line will fall back to Text type during sync.

**Better:** A BC item search picker (like the existing BOM part number lookup). Type-ahead against `bcLookupItem()`. Confirms the remapped item exists before the user clicks Confirm. This prevents the "typed a wrong number" failure mode.

**Coach recommendation:** The text input is sufficient for Milestone D. The remap picker is a UX enhancement that can follow. The planning line Text-type fallback already handles invalid part numbers gracefully.

---

## 11. Milestone D Readiness Checklist

All items must be true before ARC Dev starts Milestone D implementation.

| # | Gate | Status | Owner |
|---|------|--------|-------|
| 1 | Milestone C verified in production | **Done** (v1.20.28-v1.20.39, smoke test confirmed) | Jon |
| 2 | Cost-source hotfix deployed | **Done** (v1.20.39) | ARC Dev + Coach |
| 3 | D1: checkpoint granularity | **Resolved** — single checkpoint at 5a (2026-05-29) | Jon |
| 4 | D2: partial-failure UX | **Resolved** — continue-on-error + retry from step 6 (2026-05-29) | Jon |
| 5 | D3: orphan BC project policy | **Resolved** — leave it, resume picks up (2026-05-29) | Jon |
| 6 | D4: restoreSkipped visual treatment | **Resolved** — amber tint + ⚠ SKIPPED badge + tooltip (2026-05-29) | Jon |
| 7 | D5: ECO task slot creation sequence | **Resolved** — add step 6b/6c before step 8 (2026-05-29) | Jon |
| 8 | D6: restored project flag | **Resolved** — `restoredFromArchive: archiveId` permanent field (2026-05-29) | Jon |
| 9 | D7: contact fields on customer remap | **Resolved** — clear all four contact fields (2026-05-29) | Jon |
| 10 | D8: item remap UI | **Resolved** — text input only, no BC picker (2026-05-29) | Jon |
| 11 | A6: interrupted restore indicator | **Resolved** — Resume / Start Fresh / View Archive buttons (2026-05-29) | Jon |
| 12 | GAP 2: remap application semantics | **Resolved** — per §10, all sub-decisions covered by D7/D8 (2026-05-29) | Jon |
| 13 | A5 smoke test: bcAddEcoTask + skeleton retry idempotency | **Pending** — call bcAddEcoTask twice for same panel/ECO, confirm no duplicate | ARC Dev |
| 14 | This supplement reviewed by Analyst | **Done** — A1-A9 folded in | Analyst |
| 15 | Open questions from Analyst review | **Resolved** — all A1-A9 incorporated, no open items (2026-05-29) | Jon |

### Items that do NOT gate Milestone D start

- `bcFetchPurchasePrices` signal refactor: Not needed for D (§7). Removed from scope.
- Item remap BC search picker: Enhancement, not required. Text input is minimum viable.
- restoreSkipped filter in BOM table: Post-D enhancement if needed.

### Items carried forward from prior milestones

- KNOWN_VIOLATIONS cleanup (8 pre-existing scope checker violations): Still deferred, tracked as TODO #60.
- Scope checker hard gate: Remains active in deploy.sh for all deploys.

---

## Summary of Decisions — All Resolved (2026-05-29)

| # | Decision | Section | Resolution |
|---|----------|---------|------------|
| D1 | Checkpoint granularity | §5.2 | Single checkpoint at step 5a (bcProjectNumber persisted) |
| D2 | Partial-failure UX | §5.4 | Continue-on-error with summary; retry restarts from step 6 (A1) |
| D3 | Orphan BC project cleanup | §5.5 | Leave it (resume handles it) |
| D4 | restoreSkipped visual treatment | §6.3 | Amber tint + ⚠ SKIPPED badge + tooltip |
| D5 | ECO task slot creation sequence | GAP 6 / §2.3 | Add step 6b (bcAddEcoTask) + 6c (skeleton) before step 8 |
| D6 | Restored project flag | §9.2 | `restoredFromArchive: archiveId` (permanent, read-only) |
| D7 | Contact fields on customer remap | §10.1 | Clear all four contact fields |
| D8 | Item remap UI | §10.6 | Text input (minimum viable, no BC picker) |
| A6 | Interrupted restore indicator | §8.4 | Resume / Start Fresh / View Archive buttons |

---

*Supplement finalized. All decisions resolved. Route to ARC Dev for ARCHIVE-RESTORE-PLAN-D-DETAILED.md implementation planning.*

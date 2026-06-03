# #92 — Background Task UI Ownership Audit

**Author:** Sam Wize (Coach) · 2026-06-03  
**Status:** Classification complete — awaiting remediation review  
**Scope:** All async/background completion handlers in `src/app.jsx` (~46,500 lines)  
**Also closes:** #91 (Background Workflow Audit — extraction-completion subset tagged below)

---

## Summary

**48 handlers** audited across 9 categories. Findings:

| Verdict | Count | Meaning |
|---------|-------|---------|
| **UNSAFE-IDENTITY** | 2 | Resolves target from current state — can write to wrong entity |
| **UNSAFE-UI** | 3 | Seizes foreground (navigation/modal) regardless of user focus |
| **GUARD-NEEDED** | 4 | Touches foreground but lacks focus gate — correct entity but disruptive |
| **SAFE** | 39 | Correct identity capture + non-intrusive completion |

**Hotfix shortlist:** 5 handlers (2 UNSAFE-IDENTITY + 3 UNSAFE-UI).  
**Focus-guard candidates:** 4 handlers (GUARD-NEEDED).

---

## Classification Table

### A. Extraction Pipeline (#91 subset — 12 functions)

All three extraction paths received identity guards in the #86 hotfix (v1.20.90). These are the strongest-guarded handlers in the codebase.

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| A1 | `confirmAndExtract` → `onDone` callback | 23381 | `runExtractionTask` completes | STATE-ONLY (foreground: `onUpdate` + clears `setExtracting`; background: `saveProjectPanel` only) | Captures `_extractionProjectId` at 23378; guard at 23382 compares to `_currentProjectId` | **SAFE** | **SAFE** |
| A2 | `runExtractionTask` (orchestrator) | 13504 | Called from A1 | TOAST/SILENT (`bgStart`/`bgSetPct`/`bgDone` progress bar only) | Receives `projectId` as parameter; `save()` at 13527 uses captured `projectId` | **SAFE** | **SAFE** |
| A3 | Re-extraction (`reExtractPanel`-equivalent, inline in PanelCard) | 23997 | User clicks "Re-extract" | STATE-ONLY (foreground: `onUpdate` + `onSaveImmediate`; background: `saveProjectPanel`) | Captures `_reExtractProjectId` at 23997; guard at 24193 | **SAFE** | **SAFE** |
| A4 | Feedback re-extraction (`reExtractWithFeedback`) | 24283 | User submits AI feedback | STATE-ONLY (foreground: `onUpdate` + `onSaveImmediate`; background: `saveProjectPanel`) | Captures `_fbExtractProjectId` at 24285; guard at 24406 | **SAFE** | **SAFE** |
| A5 | Post-extraction pricing (foreground) | 23401–23409 | `onDone` chains to `runPricingOnPanel` | TOAST/SILENT (progress bar update via `bgSetPct`, then `bgDone`) | Inherits from A1 closure — if foreground, pricing writes to same React state | **SAFE** | **SAFE** |
| A6 | Post-extraction pricing (background) | 14299 `runPricingBackground` | A1 guard fires (user navigated away) | TOAST/SILENT (`bgUpdate`/`bgDone` only) | Receives `uid, projectId, panelId` as parameters; saves via `saveProjectPanel(uid, projectId, panelId, ...)` at 14458 | **SAFE** | **SAFE** |
| A7 | Post-extraction validation (`runPanelValidation`) | 24206–24223 | Chained after re-extraction BOM save | STATE-ONLY (`onUpdate` + `onSaveImmediate` or `saveProjectPanel` depending on background flag) | Inherits `_reExtractProjectId` guard from A3; background path uses captured projectId at 24216 | **SAFE** | **SAFE** |
| A8 | Post-extraction BC planning-line sync | 14462–14465 | `runPricingBackground` completes | TOAST/SILENT (fire-and-forget, `.catch` logs only) | Receives `bcProjectNumber, panelIndex` from A6 caller — all parameters captured at dispatch | **SAFE** | **SAFE** |
| A9 | Post-extraction BC task-description sync | 14464 | Chained from A8 `.then()` | TOAST/SILENT (fire-and-forget, `.catch` logs only) | Same captured parameters as A8 | **SAFE** | **SAFE** |
| A10 | Post-extraction panel metadata / CPD log | 24241–24245 | Chained after re-extraction pricing | TOAST/SILENT (fire-and-forget, `.catch(()=>{})`) | Uses `uid, updated` from closure — `updated` is the re-extracted panel built from captured projectId | **SAFE** | **SAFE** |
| A11 | `addFiles` (page ingestion) | 23037 | User drops files on PanelCard | STATE-ONLY (updates `pages` via `onUpdate`, triggers `bgStart` progress bar) | Captures `projectId, panel.id` at 23057–23058 in `_ctx`; all state writes use PanelCard props | **SAFE** | **SAFE** |
| A12 | `autoExtractTitle` | 23441 | Called from `addFiles` flow | STATE-ONLY (updates `project.name, drawingNo, drawingRev` etc. via `persistProject`) | Uses `project` from PanelListView closure — same component instance | **SAFE** | **SAFE** |

**#91 verdict:** All 12 extraction-completion functions are SAFE on both axes post-#86 hotfix. The `_extractionProjectId` / `_reExtractProjectId` / `_fbExtractProjectId` guard pattern is the gold standard in this codebase. #91 can close.

---

### B. Pricing (non-extraction-triggered)

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| B1 | `runPricingOnPanel` (manual "Get New Pricing" button) | 25458 | User clicks pricing button | STATE-ONLY (`setPricingProgress`, then `onUpdate` + `onSaveImmediate` via internal completion) | Uses `panel` from PanelCard closure — same component instance, same project | **SAFE** | **SAFE** |
| B2 | Post-pricing BC sync (contingency price edit) | 25214–25219 | User confirms contingency price → `bcSyncPanelPlanningLines` | TOAST/SILENT (`setBcSyncStatus("ok")`, auto-dismiss 3s) | Uses `bcProjectNumber, idx+1, updated` from PanelCard closure | **SAFE** | **SAFE** |
| B3 | Post-pricing BC sync (from manual pricing or extraction chain) | 26001–26005 | `runPricingOnPanel` completes | TOAST/SILENT (fire-and-forget `.then()` chain) | Uses `bcProjectNumber, idx+1, updated` from PanelCard closure | **SAFE** | **SAFE** |
| B4 | Validate-then-price flow (standalone) | 26009–26035 | User clicks "Validate + Price" | STATE-ONLY (`onUpdate` + `onSaveImmediate`, then chains `runPricingOnPanel`) | Uses `latestPanelRef.current` — PanelCard-scoped, same component | **SAFE** | **SAFE** |

---

### C. Business Central Sync

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| C1 | Manual "Sync to BC" button completion | 23820–23824 | User clicks sync button in PanelCard | MODAL when errors exist (failure modal via inline rendering in PanelCard) | Uses `bcProjectNumber, idx+1, panel` from PanelCard closure | **SAFE** | **SAFE** |
| C2 | Panel qty change → auto BC sync | 23887–23891 | User edits `lineQty` field | TOAST/SILENT (console log only, fire-and-forget `.then()`) | Uses `bcProjectNumber, idx+1, updated` from PanelCard closure | **SAFE** | **SAFE** |
| C3 | `addPanel` → `bcCreatePanelTaskBlock` | 31990–31997 | User adds new Quote Line | TOAST/SILENT (console log `.then()`, queues on failure) | Uses `project.bcProjectNumber, n, newPanel` — PanelListView closure, synchronous | **SAFE** | **SAFE** |
| C4 | `bcProcessQueue` (offline queue drain) | 6099 | BC reconnect, explicit button | TOAST/SILENT (updates `_bcQueueCountSetter` badge count) | Each queued item carries its own `{projectNumber, panelIndex, ...}` from enqueue time | **SAFE** | **SAFE** |
| C5 | `_autoSyncBcDrawings` (5-min interval) | 34507–34523 | `setInterval` every 5 minutes | TOAST/SILENT (console log, fire-and-forget) | Reads `projectRef.current` — **reads current project, but only for the project it's defined under** (lives inside ProjectView's effect) | **SAFE** | **SAFE** |
| C6 | `_flushLeadTimeBcQueue` (batched lead-time writeback) | 24810 | 30s debounce timer, "Sync now" pill, visibilitychange | TOAST/SILENT (`setPendingSyncCount`, console log) | Uses `_leadTimeBcQueue.current.pending` Map keyed by rowId — accumulated from user edits in PanelCard | **SAFE** | **SAFE** |
| C7 | Quote-send pre-lock BC sync | 31197–31199 | User sends quote (RFQ email flow) | STATE-ONLY (BC sync hidden behind send progress) | Uses `project.bcProjectNumber, project.panels` from QuoteEmailModal closure | **SAFE** | **SAFE** |
| C8 | Quote-send pre-lock BC sync (inline send variant) | 36577–36579 | User sends quote (inline print-and-send) | STATE-ONLY (same as C7) | Uses `project.bcProjectNumber, project.panels` from PanelListView closure | **SAFE** | **SAFE** |
| C9 | Quote-print pre-print BC sync | 35749/37103 | User prints quote | STATE-ONLY (BC sync hidden behind print progress) | Uses `bcNum, proj.panels` from print flow closure | **SAFE** | **SAFE** |
| C10 | BC relink sync | 35327 | User relinks project to different BC project | STATE-ONLY (fire-and-forget) | Uses `bc.number, panels` from relink handler | **SAFE** | **SAFE** |
| C11 | Full BC create/sync (`bcCreatePanelTaskStructure` + full sync) | 9840–9853 | New project creation / project copy / relink | STATE-ONLY (progress callback) | Receives `bcProjectNumber, panels` as parameters | **SAFE** | **SAFE** |

---

### D. Archive / Restore

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| D1 | `onArchive` (archive button in ProjectView header) | 45359 (inline lambda) | User clicks 📦 Archive | MODAL (`arcConfirm` warning, then `arcAlert` success) — but user-initiated, not async-completion | Uses `openProject` from App closure — synchronous user action | **SAFE** | **SAFE** |
| D2 | `handleRestoreComplete` | 44917 | User clicks "Open Project" in RestorePreviewModal | **ROUTE** — reloads all projects from Firestore, then `handleOpen(proj)` which sets `openProject` and navigates to project view | Receives `projectId` as parameter from modal — **correct target project**. But **navigates away** from whatever the user is currently viewing | **UNSAFE-UI** | **SAFE** |

---

### E. Copy Operations

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| E1 | `CopyProjectModal` → `onCopied` | 45326 | Copy completes (500ms `setTimeout` in modal at 42138) | **ROUTE** — `setCopyProject(null)` + prepend to project list + `handleOpen(newProj)` which navigates to the new project | Receives `newProj` from `copyProject()` return value — **correct target**. But **navigates away** after a 500ms timer regardless of what user is doing | **UNSAFE-UI** | **SAFE** |

---

### F. Supplier Portal Apply

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| F1 | `doApplyPortalPrices` | 35915 | User clicks "Apply" in portal submission review | STATE-ONLY (`update(updatedProject)` + `safeSave`) | Uses `projectRef.current` for stale-state check, `uid` from closure. Writes to all panels referenced in submission. Has stale-state guard at 35921–35933 | **SAFE** | **SAFE** |

---

### G. onSnapshot Listeners (Real-Time)

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| G1 | Project doc listener (first snapshot) | 34824–34832 | ProjectView mount, Firestore delivers initial cache | STATE-ONLY (`setProject(migrated)`) | Uses `init.id` from ProjectView props — subscribes to `${path}/${init.id}` at 34821 | **SAFE** | **SAFE** |
| G2 | Project doc listener (subsequent — remote update) | 34834–34847 | Another user/tab writes to the project doc | STATE-ONLY + TOAST (`setProject(migrated)` + `setExternalUpdateToast` for 4s) | Subscribes to `${path}/${init.id}` — only fires for the opened project. Filter `remote.updatedBy !== uid` prevents self-echo | **SAFE** | **SAFE** |
| G3 | Active extractions listener (project-scoped) | 34475–34488 | Team member starts/updates extraction on same project | STATE-ONLY (`setProjectRemoteTasks(fresh)`) | Filtered by `.where('projectId','==',projectId)` at 34476 | **SAFE** | **SAFE** |
| G4 | Project presence listener | 34553–34560 | Team member opens/closes same project | STATE-ONLY (`setViewers(rows)`) | Filtered by `.where('projectId','==',projectId)` at 34554 | **SAFE** | **SAFE** |
| G5 | Notifications listener | 44164–44166 | New notification created in Firestore | STATE-ONLY (`setNotifications(...)` — badge count update) | Filtered by `users/${user.uid}/notifications` — user-scoped, not project-scoped. **No navigation** — that happens in G6 | **SAFE** | **SAFE** |
| G6 | Notification click handler (`handleNotifClick`) | 44289–44304 | User clicks a notification in bell menu | **ROUTE + MODAL** — `handleOpen(proj)` navigates to project + sets `pendingPortalOpen` or `pendingCustomerReviewOpen` which auto-opens a modal | Finds project via `projects.find(p=>p.id===notif.projectId)` — **correct target**. But this is user-initiated (click), not async-completion | **SAFE** (user-initiated) | **SAFE** |
| G7 | Team active-extractions listener (company-wide) | 44260–44268 | Any team member's extraction status changes | STATE-ONLY (`setTeamTasks(fresh)` — dashboard pills) | Company-wide, filtered `uid !== user.uid`. No project-specific writes | **SAFE** | **SAFE** |
| G8 | Team presence listener (company-wide) | 44278–44284 | Any team member opens/closes a project | STATE-ONLY (`setTeamViewers(fresh)` — dashboard pills) | Company-wide, no project-specific writes | **SAFE** | **SAFE** |
| G9 | Version banner listener | 44790–44794 | Deploy writes new version to `_system/version` | STATE-ONLY (`setNewVersionAvailable(remote)`) | Global — not project-scoped | **SAFE** | **SAFE** |
| G10 | Anthropic ledger listener | 44473 | Any AI call updates spend ledger | STATE-ONLY (toolbar spend pill update) | User-scoped (`users/${uid}/config/anthropicLedger`) | **SAFE** | **SAFE** |
| G11 | ECO live-doc listener | 15918–15921 | ECO document changes in Firestore | STATE-ONLY (`setLiveEco(...)`) | Subscribes to specific `{ecoSubcollectionPath}/{ecoId}` | **SAFE** | **SAFE** |

---

### H. Module-Scoped Caches

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| H1 | `_pendingPagesCache` | 433 | `addFiles` stores pending pages for panel | STATE-ONLY (surfaces via PanelCard pending-pages badge) | **Keyed by `panelId` alone** (line 436: `pendingPagesSet(panelId, data)`). All single-panel projects share `panel-1`. If user drops files on Project A's panel, navigates to Project B (also single-panel), PanelCard reads `pendingPagesGet("panel-1")` and shows Project A's pending pages on Project B | N/A | **UNSAFE-IDENTITY** |
| H2 | `_bgTasks` | 421 | `bgStart` tracks extraction/pricing progress | STATE-ONLY (progress bar chips in toolbar) | **Keyed by `taskId` = `panel.id`** (line 443: `_bgTasks[taskId] = {..., projectId, ...}`). Same panel-ID collision as H1. The `projectId` field IS stored in the task object but is not checked when rendering — `_bgTasks["panel-1"]` from Project A shows on Project B's panel | N/A | **UNSAFE-IDENTITY** |
| H3 | `_appProjectUpdateFn` (background extraction → App state) | 593–596 / 44800–44804 | `notifyProjectListeners` called from background pricing save | STATE-ONLY (`setProjects` + `setOpenProject` update) | At 44802: `setOpenProject(prev => prev?.id === liveProject.id ? liveProject : prev)` — **correctly guards** with `prev?.id === liveProject.id` check. Only updates if the open project matches | **SAFE** | **SAFE** |

---

### I. URL Deep-Link Handlers

| # | Handler | Location | Trigger | Foreground Behavior | Identity Resolution | UI Verdict | ID Verdict |
|---|---------|----------|---------|--------------------|--------------------|------------|------------|
| I1 | `?openProject=<id>` deep-link | 44204–44217 | Page load with URL param | **ROUTE** — `handleOpen(proj)` navigates to project | Finds project by `projects.find(x=>x.id===pid)`. Strips param after use. Fires once on mount | **SAFE** (one-shot on load) | **SAFE** |
| I2 | `?openCustomerReview=<id>` deep-link | 44189–44201 | Page load with URL param | **ROUTE + MODAL** — `handleOpen(proj)` + `setPendingCustomerReviewOpen` | Same pattern as I1 | **SAFE** (one-shot on load) | **SAFE** |
| I3 | `?openDebugLogs=1` deep-link | 44172–44182 | Page load with URL param | MODAL — `setShowDebugLogs(true)` | Global (not project-scoped) | **SAFE** (one-shot on load) | **SAFE** |

---

## Hotfix Shortlist

### UNSAFE-IDENTITY (can write to wrong entity)

| # | Handler | Root Cause | Impact |
|---|---------|-----------|--------|
| **H1** | `_pendingPagesCache` (line 433) | Keyed by `panelId` alone, not `projectId:panelId`. All single-panel projects share `panel-1`. | User drops files on Project A → navigates to Project B → PanelCard shows "Pending pages" badge with Project A's files. If user confirms extraction, Project A's drawings extract into Project B. **Same class as #86 secondary vector.** |
| **H2** | `_bgTasks` (line 421) | Keyed by `taskId` = `panel.id`, same collision. | Progress bar from Project A's extraction shows on Project B's PanelCard. Cosmetic — `bgDone` cleanup timer may clear Project B's legitimate progress. **No data corruption** (extraction writes use captured projectId), but misleading UI. |

### UNSAFE-UI (seizes foreground regardless of user focus)

| # | Handler | Root Cause | Impact |
|---|---------|-----------|--------|
| **D2** | `handleRestoreComplete` (line 44917) | Reloads all projects + `handleOpen(proj)` with no guard on what user is currently doing. | User restores archive, leaves the modal open, starts working on another project. When Firestore reload completes, user is yanked to the restored project. Low frequency (archive restore is rare). |
| **E1** | `CopyProjectModal` → `onCopied` (line 45326 / 42138) | 500ms `setTimeout` → `onCopied(newProj)` → `handleOpen(newProj)`. Timer fires regardless. | User copies project, then immediately navigates somewhere else. 500ms later, forced navigation to the copy. Low frequency (copy is rare) but disorienting. |
| **G6-adjacent: auto-open portal modal** | 34854–34858 | `autoOpenPortal` + `portalSubmissions.length > 0` → `setShowPortalModal(true)`. Fires from `useEffect` when user navigates to a project via notification click. | Not a completion handler per se — fires synchronously when ProjectView mounts with the flag. But if `pendingPortalOpen` state lingers (e.g., from an earlier notification click that didn't clear), the modal opens on a project the user navigated to independently. Edge case — `onPortalOpened` clears the flag. |

---

## GUARD-NEEDED Handlers (Focus-Gate Candidates)

These handlers touch the foreground (update visible React state) but don't check whether the originating entity is still in focus. They write to the **correct** entity (identity is safe) but may update UI the user isn't looking at, causing flicker or confusion.

| # | Handler | What It Does | Why Guard Matters |
|---|---------|-------------|-------------------|
| **B1** | `runPricingOnPanel` (manual) | `setPricingProgress(...)` updates visible progress bar in PanelCard | If user switches panels mid-pricing, progress bar updates apply to the wrong PanelCard (cosmetic — data writes go to the correct panel via closure) |
| **B4** | Validate-then-price flow | `setValidatingPanel(true/false)` + `ep.set(...)` update visible progress | Same panel-switch scenario as B1 |
| **A5** | Post-extraction pricing (foreground) | `bgSetPct(panel.id, ...)` updates toolbar progress chip | `panel.id` collision (single-panel projects) means the chip could show on the wrong project's toolbar — but this is the same issue as H2 |
| **C5** | `_autoSyncBcDrawings` (5-min interval) | Reads `projectRef.current` to find stale panels | If user navigated away, `projectRef.current` is stale (the ref updates via `setProject` which only fires inside ProjectView). The auto-sync function checks `alive` flag and returns early on unmount — **already guarded by cleanup**. Low risk |

---

## Architecture Notes

### The #86 Guard Pattern (Gold Standard)

All three extraction paths now follow this pattern (added v1.20.90):

```
const _extractionProjectId = projectId;           // capture at dispatch
// ... async work ...
if (_currentProjectId !== _extractionProjectId) {  // check at completion
  // background path — save to Firestore directly, skip React state
} else {
  // foreground path — update React state normally
}
```

This is the right pattern. Extending it to the UNSAFE-IDENTITY handlers (H1, H2) means changing their key from `panelId` to `projectId:panelId`.

### Module-Scoped Cache Keying Convention

Three module-scoped caches exist:

| Cache | Key | Contains projectId? | Collision Risk |
|-------|-----|--------------------|----|
| `_pendingPagesCache` (line 433) | `panelId` | No | **HIGH** — all `panel-1` projects share cache entries |
| `_bgTasks` (line 421) | `panel.id` (= `taskId`) | Yes (in value, not key) | **MEDIUM** — progress bar shows on wrong project, but data is safe |
| `_projectListeners` (line 591) | `projectId` | Yes (is the key) | None |

Remediation for H1 and H2: change the key to `${projectId}:${panelId}`. This is the same fix recommended in CLAUDE.md's "Module-scoped caches" note and tracked in #87 (Panel ID Hardening).

---

## Counts

| Category | Total | Safe | Guard-Needed | Unsafe-UI | Unsafe-ID |
|----------|-------|------|-------------|-----------|-----------|
| A. Extraction (#91) | 12 | 12 | 0 | 0 | 0 |
| B. Pricing | 4 | 2 | 2 | 0 | 0 |
| C. BC Sync | 11 | 11 | 0 | 0 | 0 |
| D. Archive/Restore | 2 | 1 | 0 | 1 | 0 |
| E. Copy | 1 | 0 | 0 | 1 | 0 |
| F. Portal Apply | 1 | 1 | 0 | 0 | 0 |
| G. Listeners | 11 | 11 | 0 | 0 | 0 |
| H. Module Caches | 3 | 1 | 0 | 0 | 2 |
| I. Deep Links | 3 | 3 | 0 | 0 | 0 |
| **TOTAL** | **48** | **42** | **2** | **2** (+1 edge) | **2** |

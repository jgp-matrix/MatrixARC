# B085 — BC Re-link fails silently + doesn't persist when user leaves mid-op

> Marc lane investigation, via Freddy · 2026-08-04 · prod v1.24.85 · MONEY-PATH / DATA-SAFETY
> Violates the Async Project Ownership Rule (CLAUDE.md CRITICAL). Investigate + propose only — NO edits/commits/deploys/live mutations performed.

## PART A — Root cause

**`relinkToBC()` — src/app.jsx:43011, defined INSIDE `ProjectView` (starts 41772).** It's a component-scoped async closure, NOT a module-scoped background task — that is the entire bug.

Flow: guards (43012-43014) → `_relinkInFlight=true` (43016) → `bcCreateProject` mints a NEW BC project (43023) → **early binding persist** `saveProject({bcProjectNumber,bcProjectId,bcEnv,_noBumpWrite:true})` (43036-43038, BEFORE any lines populated) → `bcCreatePanelTaskStructure().catch(console.warn)` (43042, silent swallow #1) → per-panel `bcSyncPanelPlanningLines(...)` loop (43051-43074), per-panel `catch→console.warn` (43062, swallow #2 but captured to `_panelOutcomes`) → **final cleanup save** clears stale `panel.bcTaskNo`/`row.bcLineNo` from the OLD BC project (43082-43093) → outcome `arcAlert`s (43095-43114) → outer `catch→console.error+setRelinkMsg` (43115-43117) → finally releases `_relinkInFlight` (43118).

**Why it breaks on leave — never registers a bg-task (no `bgStart`):**
1. `beforeunload` guard (54488, `_hasRunningBgTaskForProject`) is FALSE → hard nav/reload/tab-close mid-relink gets NO warning → JS context killed mid-loop → BC half-populated. **This is the PRJ402135 mechanism.**
2. No editing-lease keep-alive (unmount hook 42443-42450 only arms `_startLeaseKeepAlive` when a bg-task is running).
3. Progress/outcome are component-only React state (`setRelinkMsg`/`setRelinking`/completion `arcAlert`) → no-op after unmount.

**Why silent — src/app.jsx:43116-43117:** `catch{ console.error(...); setRelinkMsg(...) }` — no `window.logDebugEntry` ANYWHERE in relinkToBC (43011-43122), no `bgError`. Nothing written to `companies/{companyId}/debugLogs`. Worse than B078 (which at least had the swallow) — here there's zero durable capture.

**Half-finished state left behind:** ARC bound to the NEW bcProjectNumber/bcProjectId (early persist landed), BC planning lines only PARTIALLY populated, and stale `row.bcLineNo`/`panel.bcTaskNo` from the OLD BC project still on the rows (cleanup at 43087-43091 never ran).

## PART B — PRJ402135 remediation (needs Jon's live BC session)

### Read-only diagnostics first (safe)
1. **Debug Logs** `companies/{companyId}/debugLogs` — expect NOTHING from relink (confirms B085: failure never recorded). Check browser console history for `"Relink error:"` / `"Relink planning lines error panel"` / `"Relink task structure error"`.
2. **Project doc** — confirm half-finished signature: `bcProjectNumber`+`bcProjectId`+`bcEnv` SET while rows still carry `row.bcLineNo` + panels carry `panel.bcTaskNo` (stale-clear never ran).
3. **ARC BOM vs BC lines diff** — for PRJ402135's `bcProjectNumber`, read BC `ProjectPlanningLines` (page 1007; keys `Project_No`/`Project_Task_No`/`Line_No`) per task; compare `No` set vs each panel's ARC `panel.bom` non-labor rows with a `bcNo`. Missing-in-BC = the lines that didn't populate.

### Safe remediation — DO NOT re-run the Re-link button
`relinkToBC` calls `bcCreateProject` (43023) → re-running would mint a **duplicate BC project**. The project is already bound. Instead **re-run the per-panel ⇅ Sync BC** → `syncPlanningLinesToBC()` (29119) → `bcSyncPanelPlanningLines` (4360), which **reads existing BC lines and diffs** (create/update/skip-unchanged/delete) with the **B065 delete guard** (4677-4684) → fills only missing lines, never duplicates (idempotent; task-structure create is also idempotent, 3622/3650). It's a registered bg-task and surfaces failures loudly (setSyncFailedAlert + bgError, 29191-29218). Hash short-circuit (29129) won't block (partial relink never set bomSyncHash).
**Pre-check:** the #168 unpriced gate (29142-29143, `_panelUnpricedForBc`) blocks the sync if any non-labor row lacks a BC/manual price — verify PRJ402135's rows are BC-priced first.

## PART C — Persistence fix (design only)

Convert `relinkToBC` from a component closure to a **module-scoped bg-task keyed by projectId** (peer of `runExtractionTask` 16451):
1. **`bgStart(taskId, project.name, projectId, "Re-linking to BC…")`** at start + `bgSetPct`/`bgUpdate` per phase (replacing setRelinkMsg 43015/43040/43053/…) + `bgDone`/`bgError` terminals. Key `_bgKey(projectId,"relink")` or `projectId+"_relink"`. **Load-bearing:** immediately makes `_hasRunningBgTaskForProject` true → arms the beforeunload warning (54488) + lease keep-alive (42448) → survives leave.
2. **Capture projectId at start; identity-guard the React-state writes** (`if(_currentProjectId!==capturedProjectId)` — pattern at 28395/28663). BC writes are already projectId-scoped by arg (`bc.number`) → continue to completion; only gate the `setProject/onChange/setRelinkMsg` calls. The `saveProject` Firestore write still lands against `capturedProjectId`.
3. **Fail loudly + Debug Logs** — replace the outer catch (43115-43117) + the two `.catch(console.warn)` (43042, 43062) with a surface helper modeled on `_surfaceExtractionSaveFailure` (11247-11252): `bgError(...)` (doesn't auto-dismiss, 935) + `window.logDebugEntry({severity:"error", source:"relinkToBC", extra:{projectId,bcProjectNumber,panelOutcomes,lastError}})`. Keep `_panelOutcomes` itemization, route through logDebugEntry too.
4. **Idempotent resume** — populate is already diff-based (Part B). Move the stale `row.bcLineNo`/`panel.bcTaskNo` clear (43087-43091) to run BEFORE the loop (right after the early binding persist 43037) so a mid-loop interrupt doesn't strand stale OLD-project bindings on rows.

### Anchors to reuse
bgStart 904 / bgSetPct 912 / bgDone 924 / bgError 931 / bgDismiss 938 / _bgKey 845; _hasRunningBgTaskForProject 872; _startLeaseKeepAlive 884 / _stopLeaseKeepAlive 883; unmount hook 42443-42450; beforeunload 54488; identity guard `_currentProjectId` 41820, used 28395/28663; loud-fail template `_surfaceExtractionSaveFailure` 11247-11252; reference task `runExtractionTask` 16451; reference loud/idempotent sync `syncPlanningLinesToBC` 29119 / `bcSyncPanelPlanningLines` 4360.

### Money-path flags for Coach
Remediation issues real BC planning-line POSTs (Jon-session only). The fix touches the early-binding-persist ordering (43037) + the stale bcLineNo/bcTaskNo clear (43087-43091) — mis-sequencing risks orphaned/duplicated BC lines (#66/B065 territory). Coach must review the resume/idempotency ordering + identity-guard placement before build.

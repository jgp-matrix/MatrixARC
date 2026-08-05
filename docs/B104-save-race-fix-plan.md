# B104 — Price-edit revert on rapid edits (stale-save clobber) — BUILD PLAN

> Coach scope (code-confirmed) + live-instrumentation evidence, 2026-08-05 · prod v1.24.96 · MONEY-PATH, touches the CORE save funnel. Jon deferred the build to a fresh focused session (this doc = the spec to build to). All anchors vs `src/app.jsx`.

## The bug (CONFIRMED, not theory)
Editing BOM prices FAST makes the value revert to a PRIOR edit. Live instrumentation on PRJ402509 / SDU850B (edits 1365→1368→**1500**): three writes persisted `1500` (incl. a whole-project `saveProject` @t=143061ms from the Update-ALL fan-out), then a `saveProjectPanel` fired **99ms later @143160ms writing `1368`** (the previous edit) → full-panel-replace → final persisted = **1368** (stale), not 1500. A single deliberate edit (+Update-ALL) does NOT revert (held 77s); only rapid successive confirms trigger it. All writes were the same user (self-inflicted, not concurrent). B016/B012 family.

## Root cause (code-confirmed)
1. **No shared lock:** `saveProjectPanel` serializes on `_panelSaveLocks[projectId]` (~:11117) but `saveProject`/`safeSave` take **NO lock** → panel-write vs project-write for the same doc race freely; last `ref.set` wins.
2. **No value-level stale-write guard:** `saveProject`/`saveProjectPanel` full-replace the panel (`panels.map(p=>p.id===panelId?safeUpdated:p)`, ~:11215). Existing guards only catch panel-count shrink / pages-wipe (pages=[]) / BOM-wipe (nBom===0) / storageUrl / reviewNotes / quote-rev / pinned — a stale **price** on a non-empty BOM passes ALL of them.
3. **Culprit scheduler (strongly inferred from the artifact):** `applyConfirmedPrice` (~:31243-31320) is `async` with a BC `await` in the middle. Its saves carry captured snapshots: the initial save (:31273) passes the **closure `updated`** (not `latestPanelRef.current`); the promote-on-success save (:31302-31307) fires after the BC round-trip (~100ms late). An earlier confirm's in-flight save lands after the newer confirm's `saveProject`. Secondary stale-snapshot site: `syncPlanningLinesToBC` markers (:29351, :29412-29413, :29420) spread a `{...panel}` up to 3s old (from the 3s timer @:29256).

## Save-path table (which paths are safe vs stale-capable)
- SAFE: cell-edit `autoSaveTimer` (:30604, reads `latestPanelRef.current||updated` at fire) · `_scheduleBgSave` coalescer (:28110, has a `_bgLastContentSave` stale-guard :11414) · Update-ALL `propagatePartAcrossPanels` (:43195-43286, reads `projectRef.current` at fire — why single-edit+Update-ALL never reverts) · lead-time flush (:30640, reads ref, vendor-only).
- **STALE-CAPABLE (fix these):** `applyConfirmedPrice` initial save **:31273** (closure `updated`) + promote save **:31302-31307** · `syncPlanningLinesToBC` markers **:29351/:29412-29413/:29420** (3s-old `{...panel}`). Audit also: `applyBudgetaryPrice` :31240, `updatePrice` contingency branch :31210-31211.

## Fix (build to this)
**(a) Fire-time-latest** — every panel save that carries a captured snapshot rebuilds from the live panel at FIRE time, merging only this edit's row-patch (mirror the :30604 cell-edit pattern):
- `applyConfirmedPrice` initial (:31273): save `latestPanelRef.current` + this row-patch, not the closure `updated`.
- `applyConfirmedPrice` promote (:31302-31307): rebuild from `latestPanelRef.current` at resolve time (note ref-reset at :28131 — see (b)).
- `syncPlanningLinesToBC` markers (:29351/:29412-29413/:29420): rebuild from `latestPanelRef.current` and merge ONLY marker fields (`bomSyncPending`/`bomSyncHash`/`bcLastSyncedBcCount`) — never spread a stale `{...panel}`.

**(b) Monotonic stale-write guard (the DURABLE backstop — ship even if a site in (a) is missed):**
- Per-panel client **edit sequence** `panel._localEditSeq`, bumped on every user edit (`updateBomRow`/`applyConfirmedPrice`/price+LT edits), carried in the save payload. Use a SEQUENCE, not a wall-clock timestamp (artifact shows 99ms-apart writes; ms ties are fragile — the existing `_bgLastContentSave` already had to special-case same-ms).
- In `saveProjectPanel` (inside the existing in-lock `ref.get()` ~:11124-11215) AND `saveProject`'s per-panel loop: **refuse to replace a panel whose PERSISTED `_localEditSeq` ≥ the incoming payload's** — keep the server panel, or for `_noBumpWrite` marker writes merge ONLY the marker fields onto the newer server panel (never reject a marker-only write wholesale).
- **Close the lock gap:** `saveProject` acquires the same `_panelSaveLocks[projectId]` mutex so project- and panel-level writes serialize (= B016 Fix B's mutex extension). Serialization ALONE isn't correctness — it must pair with the seq guard.
- Key any new seq field per `projectId:panelId` (Async-Project-Ownership rule), never global.

## B016 relationship
B104's seq-guard + shared-mutex = the **correctness core of the deferred B016 Fix B** (`docs/B016-B012-WRITE-EXHAUSTION-PLAN.md`). B016 Fix B proposed the mutex extension for write-VOLUME but explicitly left the "collapsed stale write clobbers" hole open — B104's seq guard IS that missing invariant. Land B104's seq-guard + mutex-extension now as Fix B's correctness core; defer B016's debounce/volume tuning separately. Reuse, don't duplicate.

## Regression checks (must not break)
1. **Update-ALL** (`propagatePartAcrossPanels`) must bump `_localEditSeq` on every touched panel, or the guard will reject its own multi-panel write. Verify multi-panel apply still lands.
2. Single deliberate edit + Update-ALL still persists (works today; held 77s).
3. Background `_noBumpWrite` markers (BC-sync pending, labor-sync, vendor writeback) still persist their marker fields — merge marker fields onto the newer server panel, don't reject.
4. Extraction final save (`saveProjectPanelWithRetry`) + storageUrl/reviewNotes/pages/high-water/pinned guards unchanged.
5. Seq keyed per `projectId:panelId`.

## Test plan (client race; prod-reproducible; Test OK for the Firestore race, BC-write aspects need prod per G008)
- Disposable BC-linked throwaway project (confirm throwaway before any BC write).
- Read-only instrument: window counter logging every `saveProject`/`saveProjectPanel` `{fn, panelId, unitPrice, capturedSeq, t}` (the same technique that caught this — see the B104 instrumentation in the 2026-08-05 transcript).
- **Repro:** rapid successive confirmed price edits on one row (1365→1368→1500), confirming as fast as possible so an earlier confirm's BC `await` overlaps the next; ideally with cross-line auto-approve active.
- **Assert:** after the burst, the persisted Firestore `unitPrice` === the LAST entered value (1500); no later write carries an earlier value. Run 10× to catch the window.
- **Regression asserts:** single edit persists; single edit + Update-ALL sets all matching lines; a background BC-sync marker after a newer edit does NOT revert the value.

## Effort / gate
Medium-high (core save funnel). MONEY-PATH → Coach code-review of the diff + the rapid-edit verify (Jon-driven, prod) BEFORE deploy. Version bump: minor. No `functions/` change.

## Key anchors
`saveProjectPanel` :11108-11304 · `saveProject` :10678+ · `applyConfirmedPrice` :31243-31320 (culprit saves :31273, :31302-31307) · `syncPlanningLinesToBC` markers :29351/:29412-29413 · `_panelSaveLocks` :11117 · `propagatePartAcrossPanels` :43195-43286 · coalescer stale-guard precedent :11393-11444 · ref-reset :28131.

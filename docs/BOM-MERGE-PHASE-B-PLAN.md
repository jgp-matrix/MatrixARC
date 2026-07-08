# Phase B Build Plan — Concurrent-Safe BOM Row Merge

**Author:** Sam Wize (Coach)
**Date:** 2026-07-08
**Origin:** C137 (COACH.md) — CRITICAL data-loss: concurrent BOM edits clobber each other on PRJ402096 (live customer project, v1.23.3).
**Status:** DRAFT — build-ready spec. **HOLD build until Jon approves this plan.** Money/data path → PR + Jon sign-off per the save-path protocol (CLAUDE.md).

**Companion:** Phase A (separate, ships first) removes the save-on-open at `src/app.jsx:37471-37476`. This doc is Phase B — the durable row-level merge fix. Interim containment (one editor per project, ALL projects) is live meanwhile; Phase B is what makes concurrent editing safe and lets containment relax.

---

## 1. Problem recap (from C137)

No BOM row-level merge exists anywhere. Every layer replaces whole objects:

- **M1 — save-on-open** (`37471`) writes a stale dashboard `init` snapshot. → **Phase A** removes it.
- **M2 — save overwrites** the edited panel's `bom` wholesale with the saver's in-memory copy (`saveProject` `ref.set` @9158; `saveProjectPanel` replaces target panel @9361 + `ref.set` @9405). Pages/notes/shapes are id-merged; **bom rows never are.** Only guard = the `nBom===0` total-wipe high-water belt (misses partial loss).
- **M3 — soft-apply** (`37243`) replaces local React state on a remote save (`setProject(migrated)`), dropping the local user's unsaved rows.

**Root:** whole-object replace instead of row-level merge. Row ids are globally unique (`"row-"+Date.now()+"-"+random`), so union-by-id is viable; `_dedupBomRowIds` (`881`/`9360`) already resolves accidental dup ids.

---

## 2. Design — baseline-anchored union merge

### 2.1 The disambiguation rule (the crux)

A server row absent from the incoming (client) bom is EITHER a concurrent addition by another user (must preserve) OR a row this client intentionally deleted (must honor). The two are distinguished by a **per-panel baseline of row-ids this client last knew existed on the server**:

- server-only row, id **∈ baseline** → client had it and dropped it → **intentional delete → honor (drop it).**
- server-only row, id **∉ baseline** → client never saw it → **concurrent add by another user → preserve (carry the WHOLE server row).**
- row present in incoming → incoming wins (edits/field changes apply).

### 2.2 `_bomBaselineIds` — module-scoped, keyed by `projectId:panelId`

Save functions are module-scope (not inside the component), so the baseline must live in module scope:

```js
// near _saveHighWater
let _bomBaselineIds = {};                       // { "<projectId>:<panelId>": Set<string rowId> }
function _bomBaselineKey(projectId,panelId){ return projectId+':'+panelId; }
function _setBomBaseline(projectId,panelId,bom){
  _bomBaselineIds[_bomBaselineKey(projectId,panelId)] =
    new Set((bom||[]).filter(r=>!r.isLaborRow).map(r=>String(r.id)));
}
```

**When to (re)capture the baseline — it must reflect "what this client last synced from the server":**

1. **Initial load** — onSnapshot first-snapshot (`37233`), after `migrateProject`: for each panel, `_setBomBaseline(init.id, panel.id, panel.bom)`.
2. **Soft-apply of a remote update** (`37241-37243`): after computing the merged project (see §2.4), `_setBomBaseline(...)` from the merged bom of each panel.
3. **After a successful local save** — at the end of `saveProject` / `saveProjectPanel`, refresh the baseline to the just-persisted merged bom ids (so the client's own save becomes its new baseline).
4. **Clear on unmount** (project close) for hygiene — keys are project-scoped so cross-project can't collide, but clear the closing project's keys anyway.

**Baseline-null fallback (degraded case — e.g. module state lost on hard reload, first-ever save):** bias to **no-loss** → preserve all server-only non-labor rows (accept possible delete-resurrection) **and `console.warn` loudly**. Because baseline is captured on the very first snapshot, null should be rare. **→ Jon decision:** confirm "bias to preserve" vs "behave like today (overwrite)" for the null case. Recommend bias-to-preserve (loss is the reported harm).

### 2.3 Merge-on-save (M2 fix) — extend the EXISTING server-read guards

Both save functions already read the current server doc inside the save. Add a bom merge **for the target panel(s)**, running **before `_dedupBomRowIds` (9360)** and independent of the `nBom===0` high-water belt (keep that belt).

Shared helper:

```js
// bom = client incoming; serverBom = server's copy of same panel; baselineSet = Set|null
function _mergeBomRows(bom, serverBom, baselineSet){
  const incoming = bom||[];
  const incomingIds = new Set(incoming.map(r=>String(r.id)));
  const preserved = [];
  for(const s of (serverBom||[])){
    if(s.isLaborRow) continue;                    // labor is recomputed, not concurrent user data — incoming wins
    const sid = String(s.id);
    if(incomingIds.has(sid)) continue;            // incoming has it → incoming wins
    if(baselineSet && baselineSet.has(sid)) continue; // client knew it + dropped it → honor delete
    preserved.push(s);                            // concurrent add (or baseline unknown) → preserve WHOLE row
  }
  return preserved.length ? [...incoming, ...preserved] : incoming;
}
```

- **`saveProjectPanel`** (`9266`): the server doc is `proj` (`9279`); `cp = proj.panels.find(p=>p.id===panelId)`. Just before `9360` (`_dedupBomRowIds`):
  ```js
  const _base = _bomBaselineIds[_bomBaselineKey(projectId,panelId)] || null;
  safeUpdated = {...safeUpdated, bom: _mergeBomRows(safeUpdated.bom, cp && cp.bom, _base)};
  ```
- **`saveProject`** (`8940`): loop over `newPanels` inside the `_curDoc.exists` block (alongside the existing per-panel page-merge loop `8992-9027`); for each `np`, `cp=curPanels.find(p=>p.id===np.id)`, apply `_mergeBomRows(np.bom, cp&&cp.bom, baseline)` and write back into `newPanels[i]`. (`saveProject` writes ALL panels, so merge each.) Then let the existing `_bumpBomVersionIfChanged` + strip run as today.
- After the `ref.set(...)` succeeds in each function, refresh the baseline(s) to the merged bom ids.
- **Log** every preservation: `console.warn("BOM MERGE: preserved N concurrent-add row(s) on panel …")` — visible triage signal, mirrors the existing SAVE GUARD logs.

**Preserve rows WHOLE — never reconstruct.** `preserved.push(s)` carries the entire server row object → `priceSource` (`manual`/`bc`), `isCrossed`, `crossedFrom`, `techReview*`, `leadTime*`, `bcNo`, `bomVerification`, etc. all intact (CLAUDE.md data-retention).

**Ordering:** preserved (concurrent-add) rows append after incoming rows. Acceptable; note in QA. If Jon wants positional stability, a follow-up can sort by a stored index — out of scope for the minimal fix.

### 2.4 Soft-apply merge (M3 fix) — MERGE, don't replace

At `37239-37244`, replace the wholesale `setProject(migrated)` with a per-panel merge that **re-injects the local client's unsaved additions** onto the remote truth:

```js
const migrated = migrateProject({...remote,id:init.id});
const local = projectRef.current;
if(local && Array.isArray(local.panels)){
  migrated.panels = (migrated.panels||[]).map(rp=>{
    const lp = local.panels.find(p=>p.id===rp.id);
    if(!lp) return rp;
    const base = _bomBaselineIds[_bomBaselineKey(init.id,rp.id)] || null;
    const remoteIds = new Set((rp.bom||[]).map(r=>String(r.id)));
    // local rows the server hasn't seen yet (id ∉ remote AND ∉ baseline) = my unsaved concurrent adds → keep
    const localAdds = (lp.bom||[]).filter(r=>!r.isLaborRow && !remoteIds.has(String(r.id)) && !(base&&base.has(String(r.id))));
    return localAdds.length ? {...rp, bom:[...(rp.bom||[]), ...localAdds]} : rp;
  });
}
projectRef.current=migrated; setProject(migrated);
// refresh baseline to the merged remote truth (NOT including my unsaved adds)
(remote.panels||migrated.panels||[]).forEach(p=>_setBomBaseline(init.id,p.id,p.bom));
```

**Conservative scope for M3:** re-inject local **unsaved adds only**. Do NOT apply local unsaved *deletes* or local field-edits during soft-apply — those reconcile on the client's next save via §2.3. Concurrent same-row *field* editing remains last-writer-wins (document it); a field-level merge is an explicit **follow-up**, not part of this minimal fix. This guarantees "a remote save never eats my unsaved new rows" without attempting full CRDT-style field merging.

### 2.5 What stays unchanged

- The `nBom===0` high-water total-wipe belt — keep as an independent backstop.
- Pages / reviewNotes / reviewShapes / storageUrl id-merge — unchanged.
- Project-level admin-field guards (takeover/lock/review) — unchanged.
- `_dedupBomRowIds` — still runs, now AFTER the merge.
- Labor-row and quote-rev logic — unchanged (labor follows incoming; not preserved from server).

---

## 3. Files & anchors

| Change | File / anchor | ~Lines |
|---|---|---|
| `_bomBaselineIds` map + helpers | `src/app.jsx` near `_saveHighWater` | ~10 |
| `_mergeBomRows` helper | `src/app.jsx` (module scope) | ~12 |
| Merge in `saveProjectPanel` + baseline refresh | `src/app.jsx:~9360` / end of fn | ~6 |
| Merge in `saveProject` (all-panels loop) + baseline refresh | `src/app.jsx:~9028` / `~9158` | ~10 |
| Baseline capture on first-snapshot | `src/app.jsx:37233` | ~2 |
| Soft-apply merge (M3) + baseline refresh | `src/app.jsx:37239-37244` | ~14 |
| Baseline clear on unmount | ProjectView cleanup | ~3 |

Total ~55-60 lines. All client-side (`src/app.jsx`); **zero `functions/index.js` changes** → no Functions deploy.

---

## 4. Test matrix — 2 sessions, matrix-arc-test channel, before prod

Run on the test channel (containment lifted there so two editors can hit one project). Two browser sessions, Session A (owner) + Session B (edit-role).

| # | Scenario | Expected |
|---|---|---|
| T1 | A adds row R1 (unsaved), B adds row R2 (unsaved) → both save | Both R1 + R2 present |
| T2 | A adds R1 + saves; B (stale, pre-R1) edits R3 + saves | R1 preserved; R3 edit applied |
| T3 | A deletes row X + saves; B (stale, still has X) saves | X STAYS deleted (delete honored, not resurrected) |
| T4 | A deletes X; B concurrently adds Y — both save orders | X gone, Y present, both directions |
| T5 | A + B edit DIFFERENT fields on same row Z | Last-writer-wins (documented); no row lost |
| T6 | Phase A regression: open project, no edit, close, reopen | Data intact; no clobber on open |
| T7 | M3: A has unsaved new row; B saves an edit → A's screen soft-applies | A's unsaved row survives |
| T8 | Single-user regression: add / edit / delete / reorder / re-extract | Identical to today |
| T9 | Metadata preservation: B's concurrent-add row carries priceSource manual/bc, isCrossed, techReview*, leadTime*, bcNo | All flags intact after A's save merges it in |
| T10 | Labor rows: after any merge | No labor duplication; labor follows incoming |
| T11 | ECO scope: concurrent add in ECO scope; base/eco separation | ECO add preserved; base unaffected |
| T12 | Baseline-null fallback (hard reload mid-edit then save) | Per Jon's §2.2 ruling (recommend preserve + warn) |

Verification: Firestore doc read after each save (confirm row set), console SAVE/BOM-MERGE guard logs, and the debug-log stream.

---

## 5. Open decisions for Jon

1. **Baseline-null fallback** (§2.2): bias-to-preserve (recommended — loss is the reported harm; risk = possible delete-resurrection in the rare null case) vs behave-like-today (overwrite).
2. **M3 depth:** conservative re-inject-adds-only now (recommended), full field-merge as a follow-up — confirm acceptable that concurrent same-row field edits are last-writer-wins.
3. **Concurrent-add ordering** (§2.3): append-at-end acceptable, or invest in positional stability follow-up.

---

## 6. Rollout & protocol

- **PR + Jon sign-off** — save-path change, money/data path (CLAUDE.md: direct commits to master prohibited for save-path changes).
- Deploy to **matrix-arc-test** first; run the full §4 matrix (esp. T3/T4 delete-resurrection and T9 metadata) before prod.
- Recovery of already-lost PRJ402096 rows is handled separately via the app after the fix (per Jon) — not part of this code change.
- Coach re-reviews the diff before prod; verify the merge runs before `_dedupBomRowIds`, the high-water belt is intact, and no row is ever reconstructed.

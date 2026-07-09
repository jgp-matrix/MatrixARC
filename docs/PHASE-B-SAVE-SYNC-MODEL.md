# Phase B — Authoritative BOM Save/Sync Model + Live-Matrix Recipes

**For:** Freddy (to rebuild the Phase B live-matrix run sheets).
**Author:** Marc, 2026-07-09. **Grounded in:** `src/app.jsx` on `master` (timing) + `claude/phase-b-bom-merge` diff (merge/baseline/soft-apply). Line numbers are master unless noted.

---

## TL;DR — there is NO manual Save

Jon is right: no Save button. **Every BOM mutation auto-persists near-immediately.** The old "add-but-don't-save → then Save" staging in the matrix (esp. T7) does not map to the app — a human cannot hold an add unsaved through the UI. The valid tests are **timing races** (stale write from the other session) plus, for the pure not-yet-persisted case, a **DevTools Offline** lever. Details + per-case recipes below.

---

## Q1 — WRITE TIMING: immediate, not debounced

- Every add/edit/delete of a BOM row calls `onSaveImmediate(updatedPanel)` → `saveImmediatePanel` (`app.jsx:34318`) → **`saveProjectPanel` (`9266`)**.
- `saveProjectPanel` is **immediate** — no debounce. It `await`s a Firestore `ref.get()` (server read) then `await ref.set(stripped)` (`9405`), writing the **whole project doc**. Round-trip lands ~a few hundred ms after the action.
- **Per-project serialize lock** (`_panelSaveLocks[projectId]`, `9271`) → a single client's own saves never overlap; they queue.
- **Fire-and-forget at the call site, awaited internally.** Most callers don't await (e.g. `addBomRow` `26578`: `try{onSaveImmediate(updated)}catch{}`), but `saveProjectPanel` itself awaits the round-trip, so the write reliably lands — the caller just doesn't block.
- **Which function fires:** BOM-row/panel edits → `saveProjectPanel`. Project-scope edits (name, flags, project pricing) → `persistProject` (`33088`/`33906`) → `safeSave` (`9166`) → **`saveProject` (`8940`)** — same immediate whole-doc `ref.set()`.
- **Debounce exceptions (do NOT confuse with the Firestore save):**
  - Labor-row auto-sync effect: `setTimeout(…,800)` (`24345`) — internal recompute, not user typing.
  - Manual lead-time cell edits batch to **BC** on a 30s debounce (`_leadTimeBcQueue`). That is **BC writeback only** — the Firestore save of the `leadTimeDays` value is still immediate.
  - Core BOM text inputs (PN/desc/qty) save per-change; no per-keystroke debounce gating the Firestore write.

**Add-row specifics** (`addBomRow` `26558`): clicking **+ Add Row** inserts a blank-PN row with a unique id (`Date.now()+Math.random()`, `26559`), fires `onSaveImmediate` **immediately** (`26578`), then opens the BC Item Browser 300ms later (`26582`). ⇒ the row exists server-side the instant you click Add; typing/pricing the PN is a second save.

## Q2 — INBOUND SYNC: onSnapshot soft-apply, ~0.5–2s

- `ProjectView` subscribes to the project doc via `onSnapshot` (`37226`).
- A remote write with **`updatedBy !== me`** (`37239`) triggers **soft-apply**: migrate remote → `setProject(migrated)`. Latency = Firestore push, typically **~0.5–2s**.
- **Same-uid writes do NOT soft-apply** — your own saves, and two tabs of ONE login, skip the concurrent path (guard `remote.updatedBy!==uid`). This is exactly why the matrix mandates **two DISTINCT logins**; same-login "concurrency" proves nothing.
- **Overwrite vs merge on the inbound side:**
  - **master (prod today):** soft-apply REPLACES local React state wholesale → drops any not-yet-persisted local rows/edits. This is C137 mechanism **M3**.
  - **Phase B (test build):** before `setProject`, soft-apply **re-injects THIS client's unsaved concurrent ADDS** onto the remote truth (`37301+` in the branch diff), keyed off the OLD baseline (a local row absent from remote AND never in baseline = my unsaved add → keep; a row in old baseline but absent from remote = the OTHER user deleted it → do NOT re-inject). Then it refreshes the baseline to the server truth. **Adds-only by design**; concurrent same-row FIELD edits stay last-writer-wins (documented; field-merge is a follow-up).

## Q3 — IN-PROGRESS STATE: only a sub-second window; no user-held draft

- React holds `project` state; each mutation updates state, then the immediate save fires. Between the state update and the Firestore round-trip completing there is a **sub-second local-only window**. Text typed into an input is local until its onChange-save lands (still sub-second).
- **There is no user-facing "draft"/unsaved mode.** ⇒ **T7 as written ("add but do NOT save") is not achievable via the UI.** To create a genuine not-yet-persisted add you must (a) win the timing race, or (b) force it with **DevTools → Network → Offline** on the adding session.

## Q4 — Recipes that actually trigger the merge path (auto-save world)

Confirm the merge fired via Console:
- Save-side merge: `BOM MERGE (saveProjectPanel): preserved N concurrent-add row(s)` / `BOM MERGE (saveProject): preserved N …`
- Soft-apply re-inject: `[CONCURRENT] Soft-applied remote update from <uid>`
- Degraded no-baseline: `BOM MERGE: baseline unknown — bias-to-preserve kept N server-only row(s)`

### (a) Concurrent add — T1
Both A and B on **P-AB**, same panel, screens in sync.
1. A clicks **+ Add Row**, types `A-R1`. B clicks **+ Add Row**, types `B-R2`. Do both within ~2s (ideally before each other's row soft-applies).
2. **Expected:** both `A-R1` and `B-R2` present after settle. Each side's save-side `_mergeBomRows` preserves the other's server-only row. No manual save step.
- Layered protection means order doesn't matter: whoever saves second reads the server (which has the other's row, not in its baseline) → preserves it (M2); if the second save was based on a pre-other-add snapshot, the first session's soft-apply re-injects its own row (M3).

### (b) Stale-write delete-safety — T3/T4 (THE load-bearing case)
1. A deletes `X-DEL` (auto-save; row leaves Firestore + A's baseline).
2. **WAIT ~2–3s until B's screen soft-applies and `X-DEL` visibly disappears on B.** *The vanishing row on B is the signal the soft-apply landed and B's baseline is now the post-delete truth.*
3. **Then** B clicks + Add Row → `B-NEW` (auto-save).
4. **Expected:** `X-DEL` stays deleted (not in B's incoming bom, not in B's refreshed baseline → merge won't resurrect); `B-NEW` present.
- **C138 caveat is real and is exactly step 2.** If B adds BEFORE the delete propagates, B's in-memory bom + baseline still contain `X-DEL` → B's save writes it back (incoming wins) → **resurrection**. That is the documented ordering requirement, not a Phase B failure: a delete must reach the other client (soft-apply) before that client's next save. **The wait IS the test.** (Want to observe the accepted edge? Skip the wait — but that is not what T3 asserts.)

### (c) BC-metadata-whole — T9
1. B clicks + Add Row, then prices it via the **BC Item Browser** so it carries `priceSource:'bc'`, a BC vendor, lead time, etc. (auto-saves).
2. A (screen stale, pre-B's-row) makes any unrelated edit and saves.
3. **Expected:** B's row preserved **whole** — `_mergeBomRows` pushes the entire server row object (never reconstructs), so price/vendor/lead-time all survive. Verify by reload + inspect B's row fields.

### T7 reframed (unsaved add survives a remote save)
- **Timing-race version (matches how the app behaves):** A adds `A-R7` (auto-saved, but B's screen hasn't caught up). Within ~1–2s, B edits any row and saves. Watch A soft-apply B's edit. **Expected (Phase B):** `A-R7` remains on A's screen (re-injection) and B's edit appears.
- **True not-yet-persisted version (isolates M3):** DevTools → Network → **Offline** on A → A adds `A-R7` (save cannot reach Firestore = genuinely unsaved) → B (online) saves an edit → bring A back **online**. **Expected:** `A-R7` survives the incoming snapshot and then persists on A's next save. (Offline also engages Firestore's own replay queue — fine, but note it in the result.)

---

## Notes for the rewrite
- Drop the "don't save / then Save" language everywhere — replace with "add/edit (auto-saves)" + explicit **wait-for-propagation** or **offline** steps where an unsaved/stale condition is required.
- Keep the **two-distinct-logins** and **fresh-throwaway-project** guards (unchanged).
- The three ★ load-bearing asserts are unchanged in intent: T3 (no delete resurrection), T7 (unsaved/stale add survives inbound), T9 (concurrent-add row kept whole). Only the *how-to-trigger* changes.

---

## Ground-truth watcher (READ-ONLY) — instrument instead of eyeballing

Jon writes the SAME project doc as Andrew (`companies/{cid}/projects/{id}`), so **ONE listener on that doc sees both writers** and records what actually persisted — independent of either session's React state.

### Mechanism decision

- **(A) firebase-admin node watcher — NOT viable now.** No local service-account key, `GOOGLE_APPLICATION_CREDENTIALS` unset, no ADC (`functions/node_modules/firebase-admin` exists but can't authenticate). Jon's Firebase CLI login does **not** grant admin-SDK access. Would need Jon to drop a service-account JSON — extra friction, and Option B needs none.
- **(B) in-tab `onSnapshot` logger — RECOMMENDED.** Uses the page's already-authenticated `window.firebase` (compat SDK, confirmed exposed at `app.jsx:2639`). Runs in **Jon's (or Andrew's) matrix-arc-test tab** (host-agnostic to Marc's reachability limit). No creds, no deploy, read-only — an **independent** second listener that never touches app state. Keep it light (one doc + set-diff; no fiber scans, no full-collection pull) so it can't freeze the tab.

### Start command (paste into DevTools Console, AFTER opening the Lebanon project)

```js
// ── ARC Phase-B ground-truth watcher (READ-ONLY) — one listener, both writers ──
(async () => {
  const db = firebase.firestore();
  const uid = firebase.auth().currentUser.uid;
  const cid = (await db.doc('users/'+uid).get()).get('companyId');
  // light discovery: top 8 most-recently-updated projects, match name "lebanon" (no full scan)
  const qs = await db.collection('companies/'+cid+'/projects').orderBy('updatedAt','desc').limit(8).get();
  const hit = qs.docs.find(d => (d.get('name')||'').toLowerCase().includes('lebanon'));
  if(!hit){ console.error('[WATCH] no recent project matching "lebanon" — open it first, or hard-set the id below'); return; }
  // If two match: replace the finder with →  const hit = qs.docs.find(d=>d.id==='PASTE_PROJECT_ID');
  const path = 'companies/'+cid+'/projects/'+hit.id;
  const names = {}; (window._arcDesignerCache||[]).concat(window._arcSalespersonCache||[]).forEach(u=>{const k=u&&(u.uid||u.Uid); if(k)names[k]=u.name||u.Name||u.E_Mail||'';});
  window.__arcWatchLog = []; let prev = null; const everDeleted = new Set(); window.__arcSnap = null;
  console.log('%c[WATCH] '+path+' ('+hit.get('name')+')','color:#4ade80;font-weight:700');
  window.__arcWatchUnsub = db.doc(path).onSnapshot(snap => {
    if(!snap.exists) return;
    const d = snap.data(); window.__arcSnap = d;
    const t = new Date().toISOString().slice(11,23);
    const by = d.updatedBy || '?'; const who = names[by] ? names[by]+' ('+by.slice(0,6)+')' : by;
    const ids = []; (d.panels||[]).forEach(p => (p.bom||[]).forEach(r => { if(!r.isLaborRow) ids.push(String(r.id)); }));
    const cur = new Set(ids); let flags = '';
    if(prev){
      const added = [...cur].filter(x=>!prev.has(x));
      const removed = [...prev].filter(x=>!cur.has(x));
      removed.forEach(x=>everDeleted.add(x));
      const resurrected = added.filter(x=>everDeleted.has(x));
      flags = ' +'+added.length+' -'+removed.length;
      if(removed.length) flags += ' DEL:['+removed.join(',')+']';
      if(resurrected.length) flags += ' RESURRECTED:['+resurrected.join(',')+']';
    }
    prev = cur;
    window.__arcWatchLog.push({t,by,who,rows:cur.size,ids:[...cur]});
    console.log((flags.includes('RESURRECTED')?'%c':'%c')+'[WATCH '+t+'] by='+who+' rows='+cur.size+flags, flags.includes('RESURRECTED')?'color:#f87171;font-weight:700':'color:inherit');
  }, e => console.error('[WATCH] listener error', e));
  window.__arcInspect = (needle) => { const d = window.__arcSnap||{}; const out=[];
    (d.panels||[]).forEach(p => (p.bom||[]).forEach(r => { if(String(r.id)===String(needle)||(r.partNumber||'').toLowerCase().includes(String(needle).toLowerCase()))
      out.push({id:r.id,pn:r.partNumber,priceSource:r.priceSource,unitPrice:r.unitPrice,leadTimeDays:r.leadTimeDays,leadTimeSource:r.leadTimeSource,bcNo:r.bcNo||r.bcItemNumber}); }));
    console.table(out); return out; };
  console.log('[WATCH] ready. Stop: window.__arcWatchUnsub()  |  Inspect a row: __arcInspect("PN-or-id")  |  Export: copy(JSON.stringify(window.__arcWatchLog))');
})();
```

### What the output looks like

```
[WATCH] companies/…/projects/abc123 (Lebanon …)
[WATCH 21:14:07.102] by=Jon (a1b2c3) rows=155
[WATCH 21:14:22.880] by=Jon (a1b2c3) rows=154 -1 DEL:[1751998xxxxx.42]     ← A deleted X-DEL
[WATCH 21:14:31.550] by=Andrew (d4e5f6) rows=155 +1                        ← B added B-NEW; X-DEL NOT back = PASS
```

Each line = one persisted write to the doc. `by=` is `updatedBy` (uid; name best-effort from the BC user cache — if blank, the two uids still distinguish Jon vs Andrew). `+N/-N` = rows added/removed vs the previous write; `DEL:[…]` lists removed ids; `RESURRECTED:[…]` (red) = a previously-deleted id came back.

### How to read PASS/FAIL

- **T1 concurrent add** — after both adds settle, `rows=` equals the expected total and both new ids appear in `ids`; no add's id shows up in a later `DEL:` without a real delete action. **FAIL** = a just-added id silently missing.
- **T3 / T4 delete-safety (load-bearing)** — you see `-1 DEL:[<xid>]` on the delete, then the other user's add as `+1`. **PASS = no `RESURRECTED:[<xid>]` line and `<xid>` never reappears in `ids`.** **FAIL = any red `RESURRECTED:[…]`.**
- **T7 stale/unsaved add survives** — the added row's id must stay in `ids` across the other user's write; **FAIL** = it appears in a `DEL:[…]` (dropped by the inbound write).
- **T9 metadata-whole** — after the concurrent writes, run `__arcInspect("<T9 part number>")`. **PASS** = `priceSource:"bc"`, `unitPrice` set, `leadTimeDays`+`leadTimeSource` present, `bcNo` present. **FAIL** = those go null/blank after the stale save.
- **Any run:** an id that vanishes with no corresponding delete = lost row = **FAIL**.

### Caveats
- Open Lebanon **before** pasting; discovery matches the name among the 8 most-recently-updated projects. If it can't find it or two match, hard-set `hit` to the exact project id (comment in the snippet shows how).
- The `everDeleted` set means a *legitimate* re-add of the same row id would false-flag as RESURRECTED — but matrix delete rows are throwaways never re-added, so any RESURRECTED = the bug.
- Independent read-only listener; safe to run alongside the app. Stop with `window.__arcWatchUnsub()`; export the full log with `copy(JSON.stringify(window.__arcWatchLog))` and send it to Freddy.
- Pairs with the app's own console `BOM MERGE: preserved N …` warnings (those confirm the merge *fired*; the watcher confirms the *result* in Firestore).

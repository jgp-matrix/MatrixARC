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

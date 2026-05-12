# ARC Review Findings

Captured: Thu May  7 10:54:16 MDT 2026
Source: ./tools/review.sh first runs

Each finding has a status: **OPEN** (still needs work), **RESOLVED** (committed, SHA noted),
**STALE** (no longer matches current code — kept as a record of what was checked and why).

---

## Round 1 (firestore.rules + deploy.sh diff)

1. **RESOLVED** — `701d693` (2026-05-07). Firestore rules: `rfqUploads` write access not role-gated.
   CREATE was wide-open to any authenticated user (including view-only members) and allowed
   spoofing someone else's `uid`. UPDATE/DELETE only matched `uid` so teammates with edit role
   couldn't dismiss/delete a coworker's RFQ. Fix added a `_writerIsCompanyWriter(cid)` helper
   inside the `match /rfqUploads/{token}` block; CREATE now requires uid-self-match + non-`view`
   role; UPDATE/DELETE auth path now extends to same-company writers; legacy uid-only docs and
   solo accounts (no companyId) preserved.
2. **RESOLVED** — `701d693` (subsumed by #1, verified 2026-05-07). The CREATE rule now reads
   `request.resource.data.get('companyId', null) == null || _writerIsCompanyWriter(request.resource.data.companyId)`.
   The helper does `exists(...members/$(request.auth.uid))`, so a writer setting `companyId`
   to a company they aren't a member of fails the existence check and the create is rejected.
   The legacy/solo bypass (`companyId == null`) is intentional — those docs are uid-only by
   design and don't participate in team-scoped queries.
5. **STALE** (verified 2026-05-07) — Firestore rules: "Missing `rfq_history` match rule." The
   path `users/{uid}/rfq_history` is fully covered by the catch-all
   `match /users/{uid}/{document=**}` rule at `firestore.rules:12-14`, which gates read/write
   on `request.auth.uid == uid`. Same pattern as `users/{uid}/projects`, `users/{uid}/config`,
   etc. No gap; no fix needed. Kept as a record of what was checked.

## Round 2 (functions/index.js diff)

6. **OPEN** — Stale API key caching in `_resolveAnthropicKey` (~line 2149). Cached key isn't
   invalidated when an admin rotates the Anthropic key in Settings → API. Calls keep using the
   old key until the function instance is recycled.
7. **OPEN** — Ledger schema mismatch — server vs client. Server writes one shape, client reads
   another, leading to monthly spend being under-counted in the toolbar pill.
8. **STALE** (verified 2026-05-07) — "Unawaited `_writeDebugLog` — fire-and-forget risks lost
   writes." The function is actually `logDebugEntry`, defined in `public/index.html:277` and
   `public/modules/shared.js:201`. It is BROWSER-side only — there is no Cloud Function
   equivalent. In browser code, `await`-ing the log write blocks the UI without improving
   durability (tab-close before write completes is solved by `navigator.sendBeacon`, not by
   await). The codebase already awaits at `shared.js:329` (user-reported issue submit) where
   the caller actually needs the write to complete before showing success UI. The mixed
   pattern is deliberate, not a bug.
9. **RESOLVED** — `b33df02` (2026-05-07). Prompt injection via `pageNumber`. Note: the original
   finding mis-located the vector in `functions/index.js`. The actual interpolation lives in
   `src/app.jsx:9588` (the `extractBomPage` PDF-native path). Cloud Function `extractBomPage`
   referenced by the client doesn't currently exist in `functions/index.js`. Fix added a
   bounded-positive-integer validator at the top of `extractBomPage` covering both the
   server-callable path and the direct-API path. Hard-throws on invalid input.
10. **OPEN** — Duplicate Firestore member queries in email fan-out. Same `members` collection
    queried twice per recipient when sending engineer-question / supplier-quote notifications.
    Cache once, reuse.

## Round 3 (deploy.sh re-review, 2026-05-07)

Stale Round 1 findings #3, #4, #11 were dropped — they referenced a deploy.sh state that no
longer matches what's committed. Re-reviewed deploy.sh against current reality and found:

12. **RESOLVED** — `29bec5d` (2026-05-08). Adds the `node validate_jsx.js` build step before
    `git commit`, plus the bundle `?v=` cache-bust sed (so the bumped bundle URL forces a fresh
    fetch on every deploy). Same commit also rewrote the original DECISION(v1.19.769) comment
    that claimed a nonexistent placeholder-restore step, and added the bundle `?v=` verifier
    tracked separately as #16 below.
13. **OPEN** — Hardcoded `git push origin master` and `git push origin "$NEW_VERSION"` regardless
    of current branch. Running `deploy.sh` from a worktree branch would push the wrong ref or
    refuse the push. Fix: capture `git rev-parse --abbrev-ref HEAD` and either gate on `master`
    or push the current branch.
14. **RESOLVED** — `b61eedf` (2026-05-07). Added a post-sed `grep -q` verification that the
    replaced `APP_VERSION="$NEW_VERSION"` actually exists in `public/index.html`. If not,
    aborts with a clear error message naming the expected pattern and the file to inspect,
    rather than letting the failure cascade into a confusing downstream "nothing to commit".
15. **OPEN** — No functions deploy + no preflight invocation. `deploy.sh` runs
    `firebase deploy --only hosting`. Cloud Functions changes need a separate manual
    `firebase deploy --only functions` (per CLAUDE.md). The toolkit's `tools/preflight-functions.sh`
    isn't wired in anywhere. Fix: either auto-detect functions changes and run the preflight,
    or add a `--with-functions` flag.
16. **RESOLVED** — `29bec5d` (2026-05-08, caught during pre-merge review, resolved in same commit).
    Added `grep -q` verification on the bundle `?v=` sed in `deploy.sh`, mirroring #14's APP_VERSION
    verifier. sed exits 0 even with no match, so without this the deploy could silently ship
    without busting the browser cache if the `index.bundle.js?v=` pattern ever shifts (e.g. someone
    moves the bundle to a `<link>` import or drops the query param). Same error-message format
    and abort behavior as the APP_VERSION verifier.

## Round 4 (caught during pre-commit review of merge resolution, 2026-05-08)

17. **OPEN** — Fire-and-forget call to async `_showPopupBlockedFallback` from the synchronous
    `arcDocOpen` helper in `src/app.jsx`. Source commit `3fd29f6`
    ("arcDocOpen: drop features string so window.open returns a normal tab"). The fallback is
    invoked without `await` from a non-async caller, so any rejection inside it (e.g. an
    `arcConfirm` rejection — unlikely in practice but possible if the dialog host unmounts mid-
    prompt) surfaces as an unhandled promise rejection. Low severity — the popup-blocked path is
    rare and the rejection wouldn't corrupt state. Fix: either wrap the call site in
    `.catch(()=>{})` to swallow benign rejections, or refactor `arcDocOpen` itself to be `async`
    and `await` the fallback. Not for the current deploy window.

## Round 5 (orphan Cloud Functions, caught during 2026-05-07 deploy)

18. **RESOLVED** — `904a60b`, `edeede1` (2026-05-12, deployed to production) —
    Two Cloud Functions in production had no local source. One (`extractBomPage`) is on
    the active BOM extraction path — pressing Y at firebase's deletion prompt would have
    broken production.

    The orphan functions are `extractBomPage(us-central1)` and
    `monitorAnthropicModels(us-central1)`. `firebase deploy --only functions` prompts to
    delete both on every run. **DO NOT press Y without investigation first.** Until
    resolved, either skip `--only functions` deploys, or always answer N to the deletion
    prompt.

    Investigation needed:
    (a) Where the deployed source for each function originally came from — check
        `git log --all -- functions/index.js` for commits referencing these names
        that may have been later removed/refactored.
    (b) Whether each function is actively called by the app — search `src/app.jsx`
        and `public/` for references to both function names.
    (c) Once known, decide whether to restore source from history or deliberately
        delete from production.

    **Preliminary investigation (2026-05-07):**

    *`functions/index.js` git history (`git log --all --oneline -- functions/index.js | head -20`):*
    Last commit touching `functions/index.js` is `3b90e09` "Diagnostic backlog:
    rules, functions, SW (deployed across v1.19.955-.964)". Nothing after that.
    No commit on any branch references `extractBomPage` or `monitorAnthropicModels`
    in the `functions/` tree. CLAUDE.md attributes `extractBomPage` to v1.19.981 —
    so the function was added to production ~25 releases AFTER the most recent
    `functions/index.js` commit. **The source was deployed via
    `firebase deploy --only functions` from an uncommitted working tree and
    never written back to git.** Same situation almost certainly applies to
    `monitorAnthropicModels`. This is deploy-without-commit drift; the
    deployed function bodies are recoverable only from a Firebase console
    download or whatever local working copy originally produced them.

    *`extractBomPage` references in source (`git grep -n 'extractBomPage'`):*
    **Actively called from production code path.** `src/app.jsx:9702` instantiates
    the callable: `fbFunctions.httpsCallable("extractBomPage", {timeout:300000})`.
    Called via `extractBomPageViaServer` (line 9701), which is the server path
    `extractBomPage` (client wrapper, line 9757) takes when `originalPdfPath`
    + `pageNumber` are present. Falls back to direct Anthropic API only on
    server error. The client wrapper is invoked from at least five extraction
    flows (`src/app.jsx:11973, 11990, 14096, 21661, 21873`) — covers the
    primary "first pass" extract, L3 auto-retry, native-PDF fast path, and
    two re-extract paths. **Deleting the production function would break
    BOM extraction for every user that lands on the server-side path.**
    `storage.rules:11` and `CLAUDE.md:240` also reference it. Restore source
    from history is mandatory before any next `--only functions` deploy.

    *`monitorAnthropicModels` references in source (`git grep -n 'monitorAnthropicModels'`):*
    **Zero matches.** No client code calls it; no docs reference it; no other
    function references it. Most likely a scheduled function that runs
    server-side only on a cron trigger (synthetic Anthropic model-health
    monitor — referenced in earlier session notes as a daily monitor added
    around v1.19.990). If kept, source still needs to be restored from
    whatever working tree originally deployed it. If purpose is no longer
    needed, deletion from production is safe — no caller will break.

    Asymmetric resolution: `extractBomPage` source MUST be restored before
    next functions deploy (production-critical); `monitorAnthropicModels`
    source restoration is optional pending decision on whether the daily
    monitor is still wanted.

    **Session 3 update (2026-05-08, CLEANUP_PLAN Phase 3B):**

    *Latent deploy-blocker discovered and RESOLVED (`ee93e4c`):* The committed
    `functions/index.js:25` was already calling `require('./ecos')`, but
    `functions/ecos/index.js` (Phase-1 ECO Firestore-trigger module — defines
    `onEcoCreatedCompany`, `onEcoCreatedUser`, `onEcoUpdatedCompany`,
    `onEcoUpdatedUser`) was untracked. A `firebase deploy --only functions`
    from a clean checkout would have failed at module load with
    `Cannot find module './ecos'`. Same drift pattern as `validate_jsx.js`
    (Session 2). Committed in `ee93e4c` alongside the orphan-support modules
    `functions/bomPrompt.js` (mirrors `BOM_PROMPT` from `src/app.jsx`,
    consumed by `extractBomPage`) and `functions/models.js` (defines
    `ANTHROPIC_MODELS` + `MONITORED_MODELS`, consumed by
    `monitorAnthropicModels`). `./tools/preflight-functions.sh` now passes
    cleanly.

    *Source recovery for `extractBomPage` and `monitorAnthropicModels` —
    REMAINS OPEN, deferred to a dedicated session:* Phase 3C blocked on the
    main-checkout machine — `gcloud` and `gsutil` are not installed
    (`which gcloud` empty; standard Windows install paths absent;
    `winget list --id Google.CloudSDK` hung). Three documented paths forward
    when ready to resume:

    1. **Install Google Cloud SDK + use `gsutil`/`gcloud`** (recommended).
       Native installer at `https://cloud.google.com/sdk/docs/install#windows`.
       After install + `gcloud auth login`:
       ```
       gcloud functions describe extractBomPage --region us-central1 \
         --project matrix-arc --format=json
       gcloud functions describe monitorAnthropicModels --region us-central1 \
         --project matrix-arc --format=json
       gsutil ls gs://gcf-sources-*matrix-arc*/
       gsutil cp gs://gcf-sources-*/<archive>.zip ./recovered-source.zip
       ```
       Reliable, scriptable, exact bytes of deployed source. ~5 min one-time
       setup; same tooling will be useful for any future Cloud Functions /
       GCS recovery work.

    2. **Firebase Console UI** (zero install). Open
       `https://console.firebase.google.com/project/matrix-arc/functions`,
       click each function, view "Source" tab, copy-paste back into
       `functions/index.js`. Manual; copy-paste error risk; no checksum or
       archive. Faster if gcloud install is undesirable.

    3. **REST API via `firebase login:ci` token**. `sourceUploadUrl` and
       `sourceArchiveUrl` are exposed by the Cloud Functions REST API.
       Workable but more code than option 1 is worth.

    The functional support modules are now committed, so once the consumers
    are recovered, integration into `functions/index.js` should be
    straightforward (`require('./bomPrompt')` and `require('./models')`
    already-importable).

    **Resolution (2026-05-12, deployed to production):**

    Both functions restored in `functions/index.js` and deployed. Firebase
    no longer prompts to delete them on `firebase deploy --only functions`.

    `extractBomPage` (`904a60b`): HTTPS callable, Opus + thinking, PDF-native
    and image-fallback paths, 540s timeout, 1GB memory, max 10 instances.
    pageNumber capped at 50 (server-side). Shared `resolveAnthropicKey`
    helper (company-first, user-fallback) and `recordAnthropicUsage` (atomic
    FieldValue.increment ledger update). Security fix (`edeede1`): `pdfPath`
    scoped to `originalPdfs/{uid}/` — blocks cross-account file reads.

    `monitorAnthropicModels` (`904a60b`): PubSub scheduled daily 06:00 MDT,
    probes each model in `MONITORED_MODELS` with a minimal 1-token call,
    posts failures to Teams webhook if configured. Uses dedicated
    `ANTHROPIC_API_KEY` env var for unattended operation — gracefully skips
    if not set. Env var still needs to be configured in Firebase to activate.

    Remaining housekeeping (non-blocking):
    - Set `ANTHROPIC_API_KEY` env var in Firebase for the monitor
    - Node.js 20 runtime deprecated 2026-04-30, decommissioned 2026-10-30 —
      upgrade `functions/package.json` engines to Node 22 in a future session
    - **WATCH:** On next BOM extraction, check browser console for
      `[BOM EXTRACT/server] ok` confirming the restored `extractBomPage`
      Cloud Function is being hit. If it shows the fallback warning instead
      (`server path failed — falling back to direct API`), investigate.
      Also check Settings → Debug Logs for the `extractBomPage` info entry.

## Round 6 (user-reported, 2026-05-08)

19. **RESOLVED** (b492069, 64ddd51, deployed in v1.19.1004 / a730a4e) —
    Project Line Item disappears when drawings are dropped onto a freshly-added
    panel. Original capture said "BOM line item" — incorrect; the actual
    symptom is the entire Quote Line / panel card vanishing while the
    "Awaiting confirmation…" bg-task chip persists in the toolbar.

    **Root cause** (verified via Claude-in-Chrome instrumentation hooking
    `DocumentReference.prototype.set/update` plus a React fiber walk):

    1. `addPanel()` at `src/app.jsx:29142` did not call `safeSave` — the new
       panel lived only in React state, never persisted to Firestore.
    2. `addFiles` → `bgStart` → `rbgStart` writes to
       `companies/{cid}/activeExtractions/{uid}_{taskId}` on every drop and
       again on every `rbgUpdate` (~2s heartbeat).
    3. The `activeExtractions` `onSnapshot` listener at line 31147 calls
       `setProjectRemoteTasks(fresh)` with a NEW array reference each time
       (`Object.is([], [])` is false), invalidating the project-doc effect's
       deps `[init.id, uid, projectRemoteTasks]` at line 31480.
    4. The project-doc `onSnapshot` effect re-runs: cleanup unsubs, new
       listener subscribes, Firestore fires the initial snapshot synchronously
       from cache.
    5. The original `let firstSnapshot=true` (effect-instance-scoped, recreated
       on every effect run) treated every re-subscribe as a fresh mount,
       calling `setProject(migrated)` unconditionally with Firestore data —
       which lacked Panel 2 because step (1) never persisted it. Result:
       `ProjectView.state.panels` collapsed to `[P1]`. PanelListView received
       the stale state as a prop and rendered only Panel 1. The chip persisted
       because `_bgTasks[panelId]` is module-scope and outlives the unmounted
       PanelCard.

    **Forensic confirmation:** during repro, the console emitted exactly 8
    `[CONCURRENT] Initial load — synced to Firestore truth` log messages
    spaced ~2s apart — matching the `rbgUpdate` throttle interval and proving
    the firstSnapshot path was firing repeatedly.

    **Fix (v1.19.1004):**
    - **A.** `addPanel` now calls `safeSave(uid, updated)` after `onUpdate`,
      mirroring `addServiceCard`. New panels are persisted to Firestore
      immediately, so any re-subscribe that does fire returns `[P1, P2]`.
    - **C.** `firstSnapshot` promoted from effect-instance `let` to component-
      mount `useRef` (`didInitialFirestoreSyncRef`). "First" now means "first
      ever for this mount of ProjectView", not "first per re-subscribe".
      Also: dedicated `useEffect(()=>{ref.current=false},[init.id])` resets
      the flag if `ProjectView` ever receives a different `init.id` without
      unmounting (defensive — current navigation always unmounts).

20. **OPEN** — `deploy.sh` cache-bust verifier doesn't cover bundle regeneration.
    The `grep -q "index.bundle.js?v=$NEW_VERSION"` check at `deploy.sh:48`
    confirms the HTML's query string was updated, but does not confirm
    `validate_jsx.js` produced a fresh `public/index.bundle.js`. Failure modes
    that would slip past deploy: validate_jsx.js silently exits 0 without
    writing the bundle (the HEAD validate_jsx.js bug — see CLEANUP_PLAN
    Session 2 Phase 2A investigation, fixed in `cdceb17`); babel transform
    emits an empty `compiled` and `fs.writeFileSync` writes a 0-byte bundle;
    bundle write succeeds against an unintended path. In all cases the deploy
    ships a stale or empty bundle with a fresh `?v=` token, forcing every
    client to re-fetch broken content.

    Suggested fix: capture `stat -c %Y public/index.bundle.js` (or a content
    hash) before invoking `node validate_jsx.js`, then re-check after; require
    both that the file exists, that its mtime changed, and that size > some
    threshold (e.g., 100 KB — current bundle is ~2.4 MB). Optionally also
    assert the bundle contains a known marker such as `APP_VERSION` or
    `MTX-Q`.

    Discovered while triaging WIP files in CLEANUP_PLAN Session 2 (Phase 2A);
    HEAD's `validate_jsx.js` was found to silently no-op against the current
    `index.html` structure, with deploys succeeding only because of
    uncommitted WIP. The verifier did not catch the underlying broken script.

## Round 7 (CLEANUP_PLAN follow-up, 2026-05-08)

21. **RESOLVED** (no commit SHA — local hook deletion, not tracked in git) —
    Post-commit hook auto-pushing deleted 'main' branch. The
    `.git/hooks/post-commit` hook (31 bytes, created 2026-03-02) ran
    `git push origin main` after every commit. After Session 5 deleted
    `main`, this surfaced as a non-fatal `src refspec main does not match
    any` error on every push. Resolution: hook deleted
    (`.git/hooks/post-commit` removed). Hook was leftover from early-project
    main era.

## Round 8 (discovered while verifying #19 fix, 2026-05-08)

22. **RESOLVED** — `b4c6167` (2026-05-08, deployed in v1.19.1005) — `addPanel` does not create the per-panel BC Project Task block
    (20N00 / 20N10 / 20N20 / 20N99) in Business Central. User expected the
    same task-creation behavior as the New Project flow, where
    `bcCreatePanelTaskStructure` lays down all panel task scaffolding at
    once. Adding a Quote Line → Control Panel to an existing project leaves
    the new panel with no BC tasks; downstream sync (planning lines, push
    BOM, sell price patches) targets task numbers that don't exist.

    **Code-path evidence:**
    - `bcCreatePanelTaskStructure` (`src/app.jsx:2711`) is the only function
      that creates the per-panel `20N00..20N99` task scaffolding. It is
      called from exactly three sites: New Project creation
      (`src/app.jsx:36417`), project copy (`src/app.jsx:8243`), and project
      relink (`src/app.jsx:31917`). It is **not** called from `addPanel`.
    - `addPanel` (`src/app.jsx:29142`) has had the same body since v1.19.762
      (Mar 2026): build a panel object, `onUpdate({...project, panels:[...,
      newPanel]})`, and (after v1.19.1004) `safeSave(uid, updated)`. No BC
      side-effects. v1.19.916 added the modal but did not add BC sync.
    - `addServiceCard` (`src/app.jsx:29152`) explicitly calls
      `_syncServiceCardToBc(card, "create")` after `safeSave`. This is what
      makes Engineering/Programming/Commissioning quote lines auto-create
      their BC tasks (the 50100..50399 series). The Control Panel path is
      missing the equivalent call.

    **BC ground-truth verified for PRJ402089 (Lemay Pump Station)** via
    direct ProjectTaskLines OData query during this session — Panel 2 (the
    test panel added during v1.19.1004 verification) has zero BC tasks:

    | Task # | Type        | Description                               | Totaling          |
    |--------|-------------|-------------------------------------------|-------------------|
    | 10000  | Begin-Total | PRJ402089 - Lemay Pump Station            | (empty)           |
    | 20100  | Begin-Total | PRJ402089-100 - Lemay Pump Station        | (empty)           |
    | 20110  | Posting     | PRJ402089-100 Rev - - Lemay Pump Station [1] | (empty)        |
    | 20120  | Posting     | Engineering Design - Lemay Pump Station   | (empty)           |
    | 20199  | End-Total   | TOTAL: PRJ402089-100 - Lemay Pump Station | `20100..20199`    |
    | 99999  | End-Total   | TOTAL: PRJ402089 - Lemay Pump Station     | `10000..99999`    |

    **Design decisions** (resolved this session, ready for implementation):

    **1. 99999 End-Total `Totaling` range** — NO PATCH NEEDED on incremental
    adds. The project End-Total at 99999 already has `Totaling: "10000..99999"`
    which is permissive (inclusive integer range) and covers all future panel
    blocks at 20200, 20300, etc. Adding a new panel only requires creating
    the 4 panel-specific tasks (20N00, 20N10, 20N20, 20N99). Per-panel
    End-Total at 20N99 uses panel-specific range like `"20200..20299"`.

    **2. Existing-project backfill** — Implicit self-heal on first BC sync.
    The two existing per-panel BC sync calls (`bcSyncPanelTaskDescriptions`
    and `bcSyncPanelPlanningLines`) already iterate panels by index and
    construct task numbers via `20000 + panelIdx*100 + offset`. Add a
    pre-check at the top of each: if the target task doesn't exist in BC,
    call the new helper to create the panel's 4-task block first, THEN
    proceed with the sync. This auto-fixes legacy projects without UI churn
    and without firing unexpected writes on project open. New panels added
    via the fixed `addPanel` get their tasks immediately; missing tasks on
    existing panels get filled in on the next sync trigger.

    **3. Partial-failure handling** — Offline queue + per-panel pending flag.
    `bcCreatePanelTaskStructure` already supports two field-name prefixes
    (`Project_*` then `Job_*`) with auto-retry — reuse that logic in the
    extracted helper. If task creation fails on the network/auth layer:
      - Enqueue via existing `bcEnqueue('createPanelTaskBlock', {...},
        'Create panel ${idx} BC tasks')` — matches the labor/PO/PDF queue
        pattern.
      - Set `panel.bcTasksSyncPending: true` on the panel so a future UI
        chip can surface "BC sync pending" without blocking workflow.
        Cleared on successful create (or on idempotent re-create that finds
        the task already exists).
      - Do NOT roll back partial creates. If 2 of 4 tasks land before failure,
        the offline queue retries the helper — which is idempotent (probes
        existing task numbers via OData and skips any already present).

    **Implementation sketch** (single session work, ~1-2 hrs):

    a. Extract helper from `src/app.jsx:2743-2760` (the `buildTasks` loop body):
       ```js
       async function bcCreatePanelTaskBlock(projectNumber, panelIndex, panelData, projectName)
         // panelData: {drawingNo, drawingRev, name, lineQty}
         // panelIndex: 1-based
         // Returns {created, skipped, failed} summary like bcCreatePanelTaskStructure does
       ```
       Internally probes both `Project_No`/`Job_No` field prefixes (existing
       pattern). For each of the 4 tasks (20N00, 20N10, 20N20, 20N99): GET
       to check existence first, POST if missing. PATCH the per-panel End-
       Total's `Totaling` to `"20N00..20N99"` if it was created bare.

    b. Call from `addPanel` (`src/app.jsx:29142`) after `safeSave`:
       ```js
       function addPanel(){
         // ...existing build + onUpdate + safeSave...
         if(project.bcProjectNumber && _bcToken && !_bcEnvMismatched(project)){
           const newIdx = (project.panels||[]).length;  // 1-based after spread
           bcCreatePanelTaskBlock(project.bcProjectNumber, newIdx, newPanel, project.name)
             .catch(e => {
               console.warn('[ADD PANEL] BC task block create failed, queuing:', e.message);
               bcEnqueue('createPanelTaskBlock', {projectNumber: project.bcProjectNumber,
                 panelIndex: newIdx, panelData: newPanel, projectName: project.name},
                 `Create panel ${newIdx} BC tasks`);
             });
         }
       }
       ```

    c. Add backfill check to `bcSyncPanelTaskDescriptions` (`src/app.jsx:3092`)
       and `bcSyncPanelPlanningLines` (`src/app.jsx:3128`) — both compute
       a base task number from `panelIndex`. Before their existing GET-
       and-PATCH loop, run a probe: if the panel's Begin-Total (20N00)
       doesn't exist in BC, call `bcCreatePanelTaskBlock` first. This
       transparently fixes any legacy panel.

    d. Add `bcCreatePanelTaskBlock` to the `bcEnqueue`/`bcProcessQueue`
       handler list (CLAUDE.md mentions queue types: `createPurchaseQuote`,
       `attachPdf`, `patchJob`, `syncTaskDescs` — find the dispatcher and
       add the new type).

    **Test plan** (post-implementation, run against the same sandbox tenant):

    1. **Fresh add:** Open any BC-connected project. Add Quote Line → Control
       Panel. Within ~5s, query `ProjectTaskLines?$filter=Job_No eq
       'PRJ...'` and verify 4 new tasks appeared at 20N00, 20N10, 20N20,
       20N99 with the panel-specific Totaling range on 20N99. Verify 99999
       Totaling is unchanged at `"10000..99999"`.

    2. **Offline path:** Open browser DevTools, set `_bcToken=null` to
       simulate token loss. Add a panel. Observe console: should log
       "[ADD PANEL] BC task block create failed, queuing" and the BC queue
       badge in the toolbar should increment. Restore token (toggle BC
       Connected). Observe queue drain and the new tasks appear.

    3. **Backfill:** Use a project that has a panel without BC tasks
       (e.g., PRJ402089 Panel 2 from this session, before fix). Trigger
       any BC sync — push pricing, save BOM row, etc. Verify the panel's
       BC task block gets created automatically before the sync runs.

    4. **Idempotency:** Run the helper twice in a row for the same panel.
       Second invocation should detect existing tasks via probe and skip
       all four POSTs (just verify, don't error).

    5. **Cross-env mismatch:** Open a project whose `bcEnv` differs from
       the active env (`_bcEnvMismatched(project) === true`). Add a panel.
       The helper should NOT fire (per the existing guard pattern at
       `src/app.jsx:23229` and similar). No queue entry, no BC writes, no
       errors.

    Discovered post-deploy of v1.19.1004 by user testing the bug-fix flow
    (added Panel 2 via Add Quote Line, observed no 20200-series tasks in
    BC). Out of scope for the #19 fix; design is now nailed down — pick up
    in next session and implement the helper + three call-site changes
    above. Reference this BC dump when verifying the test plan.

    **Resolution note (2026-05-08, deployed in v1.19.1005, master `b4c6167`):**
    Implemented exactly per the design sketch in steps (a)–(d) above:

    - (a) New helper `bcCreatePanelTaskBlock(projectNumber, panelIndex, panel,
      projectName)` added at `src/app.jsx` immediately after
      `bcCreatePanelTaskStructure`. Idempotent: probes Begin-Total (20N00)
      first as a fast path; if missing, falls through to per-task GET-by-key
      probe + POST. Same `Project_No` → `Job_No` field-prefix fallback as
      `bcCreatePanelTaskStructure`. Returns `{created, skipped, failed,
      total:4}` summary; throws on partial failure so callers route to the
      offline queue.

    - (b) `addPanel` (in `ProjectView`) now calls `bcCreatePanelTaskBlock`
      after `safeSave` when `project.bcProjectNumber` is set and BC env
      matches. Token-missing path enqueues via
      `bcEnqueue('createPanelTaskBlock', …)`; runtime failure also enqueues
      with the same payload.

    - (c) Backfill probe added to the top of
      `bcSyncPanelTaskDescriptions` and `bcSyncPanelPlanningLines` —
      `await bcCreatePanelTaskBlock(...)` runs first. Idempotent + fast-path
      means already-scaffolded panels pay one GET; legacy panels with
      missing tasks self-heal on first sync.

    - (d) BC offline queue dispatcher (`_bcQueueExecute`) gained a
      `case 'createPanelTaskBlock'` branch that calls the helper with the
      enqueued params.

    `panel.bcTasksSyncPending` flag from design item #3 NOT implemented this
    session — the offline queue + BC queue badge already surface pending
    state, and the helper's idempotency means re-runs don't double-create.
    Defer the per-panel chip to a follow-up if needed once the fix is
    field-tested.

    Test plan from above is the verification path. Run after deploy:
    1. **Fresh add** in any BC-connected project — verify 20N00/20N10/20N20/
       20N99 appear within ~5s. Verify 99999 Totaling unchanged.
    2. **Offline path** with `_bcToken=null` — verify queue badge increments
       and drains on reconnect.
    3. **Backfill** on PRJ402089 Panel 2 (currently has no BC tasks per
       this session's BC dump) — trigger any sync and verify tasks land.
    4. **Idempotency** — call helper twice; second call should report
       skipped=4 from the fast-path probe.
    5. **Cross-env mismatch** — `_bcEnvMismatched(project)===true`: helper
       not invoked, no queue entry, no errors.

23. **OPEN** — Drawing delete/re-drop leaves BC planning line 10000 holding the
    prior sell price until the next pricing run. `removePage` at
    `src/app.jsx:21679` clears `panel.bom`, `pricing`, `laborData`, etc.
    when `remaining.length===0`, but does NOT trigger a `bcSyncPanelPlanningLines`
    push to BC. Result: BC's task Unit Price (sourced from planning line
    10000's `Unit_Price` field, which carries `computePanelSellPrice(panel)`
    at last sync) stays frozen at the pre-delete value through the entire
    re-extraction window. Self-corrects on the next pricing run that fires
    `bcSyncPanelPlanningLines`, so the bug is purely cosmetic / time-bounded —
    but during a long re-extraction it can mislead anyone watching BC for
    project status.

    Discovered 2026-05-08 while smoke-testing the v1.19.1005 TODO #22 fix:
    user re-dropped Panel 2 drawings on PRJ402089; BC continued to show the
    prior $36,049.79 Unit Price on task 20210 throughout the new extraction.

    **Suggested fix:** in `removePage`'s `remaining.length===0` branch
    (after `onUpdate` / `onSaveImmediate`), if `project.bcProjectNumber` is
    set and `_bcEnvMismatched(project)===false`, call
    `bcSyncPanelPlanningLines(bcProjectNumber, panelIndex, updated, project.name)`
    with the now-empty `updated` panel. Since the sync function recreates
    line 10000 with `Unit_Price = computePanelSellPrice(panel)` and the panel's
    BOM is empty + pricing nulled, the new Unit_Price will be 0. Same pattern
    as other post-mutation BC syncs already in the codebase. Token-missing
    path: `bcEnqueue('syncPanelPlanningLines', ...)` — note this queue type
    isn't currently registered (the existing dispatcher has
    `createPurchaseQuote`, `attachPdf`, `patchJob`, `syncTaskDescs`,
    `syncServiceCardTask`, `createPanelTaskBlock`), so adding this fix may
    also need a new queue branch wrapping `bcSyncPanelPlanningLines`.

    Low severity; out of scope for v1.19.1005 deploy. Pick up in a follow-up
    session.

24. **OPEN** — Remove auto-creation of Project Task `20N20 Engineering Design`.
    This task is auto-created on new projects (likely in the BC job/project
    creation path or initial project template), but is no longer needed since
    Engineering Design is now handled as a separate line item on the
    quote/BOM. The auto-created task is now redundant and should be removed
    from whatever code path seeds default project tasks.

## Round 9 (user-reported, 2026-05-08)

25. **RESOLVED** — `4da7909` (2026-05-08, deployed in v1.19.1007) — BOM
    extraction silently dropped pages where ENC and BOM share the same
    drawing. The AI page-type detector (`PAGE_TYPE_DETECT_PROMPT` at
    `src/app.jsx:12626`) is instructed via DECISION ORDER to pick ONE
    primary purpose per page — drawing wins over BOM when both are present
    — so a 3-page set with an ENC+BOM combined page returned
    `{"types":["enclosure"]}`. The BOM extraction filter at
    `src/app.jsx:11976` (`_bp.filter(p => getPageTypes(p).includes("bom") && p.dataUrl)`)
    excluded the page entirely; user-drawn BOM regions on that page never
    reached `getExtractionUnits` because the per-page extraction loop is
    only entered for pages that pass the filter.

    Discovered by user testing PRJ402089 Line 3: 3-page drawing set with
    ENC + BOM combined; extraction failed despite a BOM region being
    identified.

    **Fix:** `getPageTypes()` (`src/app.jsx:12727`) now unions AI-detected
    types with classifier-compatible region types (`bom` / `schematic` /
    `backpanel` / `enclosure` / `pid`). User-drawn regions are
    authoritative — they ADD types but never remove them, so pages with
    no regions still rely on the AI classifier. The change is
    centralized: every downstream filter (extraction at 11976, audit at
    12434, validation, UI counters at 20796–20800, ~20+ callsites total)
    automatically sees the user's truth. Multi-page case is handled by
    the per-page nature of `getPageTypes` — N pages each with an ENC
    region all land in `enclosurePages`; same for BOM.

    Region annotation types that aren't classifier-compatible
    (`zoomed_detail`, `label`, `spec`, `other`, `ignore`, `titleblock`)
    are correctly ignored as page-type sources — they remain annotations,
    not page classifications. `getExtractionUnits` (`src/app.jsx:9598`)
    still independently crops user-drawn BOM rectangles, unaffected.

    Side note: v1.19.1006 was an empty version bump — see #26 below for
    the deploy.sh worktree-mismatch root cause.

26. **OPEN** — `deploy.sh` builds from the main checkout
    (`C:\Users\jon\AppDev\MatrixARC\src\app.jsx`), not from the cwd
    worktree's source. If a fix is edited inside a worktree
    (`.claude/worktrees/...`) and `bash deploy.sh` is invoked from that
    worktree, the script silently builds and ships main's stale source
    with only the version bump applied — the actual code change does NOT
    deploy. v1.19.1006 was an empty release for exactly this reason
    (commit `ee7721b`); the fix had to be re-applied in the main checkout
    and re-deployed as v1.19.1007 (`4da7909`).

    Discovered 2026-05-08 while shipping #25. The earlier session's
    `node validate_jsx.js` log even hinted at this — output said "Source
    length: 2747264" against the main checkout's app.jsx, not the
    worktree's — but no abort or warning fired.

    **Fix candidates:**
    a. `deploy.sh` aborts (or prompts) if cwd is a worktree and the
       worktree's `src/app.jsx` differs from the main checkout's. One
       `diff -q` before the build is enough to detect this.
    b. `deploy.sh` rsyncs the cwd's `src/app.jsx` to the main checkout
       before building — riskier, could clobber unrelated edits in main.
    c. Document loudly in CLAUDE.md that worktree edits must be applied
       in main (or merged to master) before running deploy. Cheapest, but
       relies on the operator remembering.

    (a) is the recommended path — it's a 3-line guard, fails closed, and
    makes the failure mode visible the moment it happens instead of after
    the empty version is live.

## Round 10 (user-reported, 2026-05-12)

27. **OPEN** — Status pills in Quote Summary do not match the status pills on the
    Panel Card. The two UI surfaces render panel status independently and their
    styling / label logic has diverged. They should be visually identical for the
    same underlying status value.

28. **OPEN** — Auto-populating Crossed/Superseded list should exclude "CRATES" and
    "JOB BUYOFF" entries entirely. These are not real part crosses — they are
    internal cost-category line items that should never appear in the alternates
    suggestion list.

29. **OPEN** — Auto-add "ECO FEE STANDARD" line item on ECO creation. When a new
    ECO is created, automatically insert a line item just below the Labor lines
    called "ECO FEE STANDARD". This is an active BC Service Item representing a
    standard fee applied to every ECO. The amount is variable (configurable), with
    a default of $1,500.

30. **OPEN** — Budgetary designation should be project-level, not per-panel. When a
    project is marked as "Budgetary", apply the designation to the entire quote
    rather than each individual panel. Move the "BUDGETARY" pill from inside each
    Panel Line card in Quote Summary to sit next to the total price instead.

T1. **OPEN** — Pre-commit hook only inspects `.js` files (`grep -E '\.js$'` skips `.jsx`).
    Most of ARC lives in `src/app.jsx` (~2 MB), so the hook is currently silent on the largest
    surface area of the codebase. `node --check` doesn't parse JSX natively — fixing this needs
    a different syntax-check approach (Babel parse, esbuild --syntax, or a small wrapper).
T2. **RESOLVED** — `150f75e` (2026-05-07). Pre-commit hook now collects `.js` and `.jsx`
    files separately. Syntax check still runs on `.js` only (T1 still open — `node --check`
    can't parse JSX). The advisory Claude review now scans both, with `app\.jsx` added
    explicitly to the risk pattern. Re-installed via `./tools/install-hooks.sh`. Note: the
    risk pattern is a basename-style match, so any path containing `app.jsx` qualifies —
    intentional, since the file might be moved or referenced via worktree paths.
T3. **OPEN** — `firestore.rules` and other non-JS files (`.rules`, `.json`, `.html`) get no
    coverage from the syntax check or the risk-pattern review. The rfqUploads fix (#1, commit
    `701d693`) committed without any pre-commit feedback. Low priority; add a separate
    rules-syntax check (`firebase deploy --only firestore --dry-run` or similar) if/when it
    becomes a real risk.

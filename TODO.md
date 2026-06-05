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
15. **OPEN** (ELEVATED) — No functions deploy + no preflight invocation. `deploy.sh` runs
    `firebase deploy --only hosting`. Cloud Functions changes need a separate manual
    `firebase deploy --only functions` (per CLAUDE.md). The toolkit's `tools/preflight-functions.sh`
    isn't wired in anywhere. Fix: either auto-detect functions changes and run the preflight,
    or add a `--with-functions` flag.
    **Elevation (Coach C22, 2026-06-03):** #82 demonstrated the cost — a full verification
    cycle (Cloud Functions REST API → `generateDownloadUrl` → download deployed source archive
    → byte-for-byte diff) was required to answer "are functions live?" because no deploy audit
    trail exists in the repo. Recommend minimum viable fix: a deployed-vs-committed
    function-hash check runnable from the repo, before any larger "fold functions into
    deploy.sh" work.
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
    - ~~**WATCH:** On next BOM extraction, check browser console for
      `[BOM EXTRACT/server] ok` confirming the restored `extractBomPage`
      Cloud Function is being hit.~~ **Confirmed working (2026-05-20):**
      Noah's PRJ402101 extraction hit the `bom-region-crop` server path
      successfully. Token limits subsequently bumped 16K→64K (see #37).

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

28. **RESOLVED** — `b077999f` (2026-05-12, deployed in v1.19.1034) — Auto-populating
    Crossed/Superseded list should exclude "CRATES" and "JOB BUYOFF" entries.
    Fix: new `_isBuyoffOrCrate(r)` helper checks `partNumber`, `description`,
    AND `crossedFrom` fields for `/buyoff/` and `/crat(e|ing)/` patterns. Applied
    to all 5 crossed-items filters, `_isExcludedFromPriceCheck`, lead time drivers
    (`_computePanelLeadDriversLine`/`_computeProjectLeadDriversLine`), and
    `computeControlPanelLeadTime`. Earlier attempts using narrow regexes and
    positional last-3 exclusion failed because: (a) `crossedFrom` held the OLD
    part number (e.g. "JOB BUYOFF") while the new `partNumber` was just "BUYOFF";
    (b) these rows weren't always at the end of the BOM array.

29. **OPEN** — Auto-add "ECO FEE STANDARD" line item on ECO creation. When a new
    ECO is created, automatically insert a line item just below the Labor lines
    called "ECO FEE STANDARD". This is an active BC Service Item representing a
    standard fee applied to every ECO. The amount is variable (configurable), with
    a default of $1,500.

30. **OPEN** — Budgetary designation should be project-level, not per-panel. When a
    project is marked as "Budgetary", apply the designation to the entire quote
    rather than each individual panel. Move the "BUDGETARY" pill from inside each
    Panel Line card in Quote Summary to sit next to the total price instead.

## Round 11 (BC integration fixes, 2026-05-12)

31. **RESOLVED** — `5d459657` (2026-05-12, deployed in v1.19.1025) — BC+ pills
    (red "+" indicators) not persisting after "Get New Pricing" / "Sync BC".
    Root cause: `bcVerify` stamping in `runPricingOnPanel` ran AFTER the
    Firestore save (`onSaveImmediate`), so stamps only existed in React state
    and were lost on reload. Fix: moved stamping block BEFORE the save.

32. **RESOLVED** — `a7c10da6` (2026-05-12, deployed in v1.19.1026) — Item
    Browser USE applying stale Item Card price over Purchase Price. `commitBcItem`
    applied `bcItem.unitCost` (Item Card `Unit_Cost`, often stale) immediately,
    then did an async PP fetch that arrived too late. Fix: made `commitBcItem`
    async, fetches Purchase Prices BEFORE the first save, uses PP
    `directUnitCost` when available (falls back to `unitCost` if PP unavailable).

33. **RESOLVED** — `f95d319c` (2026-05-12, deployed in v1.19.1025) — Manual
    price entry via confirmed price dialog set `priceSource:"manual"`, causing
    an "M" pill and exclusion from RFQs. Since the price IS pushed to BC,
    `applyConfirmedPrice` now sets `priceSource:"bc"` with `bcPoDate`. If BC
    push fails, safely reverts to `priceSource:"manual"` with valid `priceDate`.

34. **RESOLVED** — `be6ff11f` (2026-05-12, deployed in v1.19.1028) — Panel lead
    time calculation showing less than longest item lead time. When a TRAQS
    absolute production date was earlier than the material chain
    (engineering + approval + longest item lead), `leadDays` could be less than
    `longestItemDays`. Fix: `productionDoneDays` now floored at
    `materialsCompleteDays`.

35. **RESOLVED** — `f436d9e6` (2026-05-12, deployed in v1.19.1029) — Admin
    override for AI-estimated lead time budgetary enforcement. Admins can now
    bypass the forced BUDGETARY flag when AI-estimated lead times are present.
    On send: two-step confirm (Cancel → "Override, Send as Firm"). On print:
    "Mark Budgetary" vs "Print as Firm (Admin)" choice. Non-admins retain
    existing forced-budgetary behavior.

## Round 12 (user-reported, 2026-05-14)

36. **OPEN** — Service line items (Commissioning, Programming, Design) need a proper
    status lifecycle. Currently they lack progression tracking. Desired flow:
    **DRAFT** (initial creation) → **READY** (when costs and qty are entered) →
    **IN PRE_REVIEW** (when sent for review) → **QUOTES SENT** (once the quote is
    sent). Status should update automatically based on data completeness and
    workflow actions.

## Round 13 (BOM extraction token truncation, 2026-05-20)

37. **RESOLVED** — `48deb1c9` (2026-05-20, deployed in v1.20.1) — BOM extraction
    silently returning 0 items on dense/large BOMs (reported on PRJ402101,
    Clearstream drawing format). Root cause: `max_tokens: 16000` was too low for
    large BOMs — Anthropic returned `stopReason: "max_tokens"` with truncated
    JSON that failed all 4 parse strategies in `_parseAndVerifyBomRaw`, resulting
    in `items: []`. Because the HTTP call succeeded (200), no error was thrown and
    the empty result was accepted silently. Fix: bumped `max_tokens` from 16000
    to 64000 and `budget_tokens` (thinking) from 4000 to 16000 in all three
    extraction paths — Cloud Function `extractBomPage`, client-side crop fallback,
    and client-side PDF fallback. Also added crop-empty safety net: when the
    cropped-BOM path returns 0 items, extraction now retries via the full
    PDF-native path before giving up.

38. **RESOLVED** — `48deb1c9` (2026-05-20, deployed in v1.20.1) — Same
    `max_tokens: 16000` truncation affected `extractSupplierQuotePricing` Cloud
    Function (supplier portal quote uploads). Bumped to `max_tokens: 64000`.

39. **RESOLVED** — `48deb1c9` (2026-05-20, deployed in v1.20.1) — Added admin
    warning email at 75% token usage. New `warnAdminsTokenUsage()` helper in
    `functions/index.js` resolves the user's companyId, finds admin UIDs, and
    sends a SendGrid alert when `output_tokens >= 0.75 * maxTokens`. Wired into
    both `extractBomPage` and `extractSupplierQuotePricing`. Non-fatal — failures
    are logged but don't block extraction.

## Round 14 (RFQ / Supplier Portal bug fixes, 2026-05-20)

40. **RESOLVED** — `52394c87` (2026-05-20, deployed in v1.20.3) — Duct and DIN rail
    items appearing on RFQs. `RFQ_EXCLUDE_ITEMS` regex in `buildRfqSupplierGroups()`
    only excluded job buyoff / crating / crate. Fix: added `\b(din\s*rail|duct)\b`
    to the exclusion pattern. These are bulk cut-to-length consumables sourced
    internally — never belong on supplier RFQs.

41. **RESOLVED** — `aa9b45c1` (2026-05-20, deployed in v1.20.3) — Crossed parts
    using stale vendor/manufacturer for RFQs. Auto-cross at `src/app.jsx` line
    ~9014 spreads `{...r, partNumber:alt.replacement.partNumber}` without clearing
    `bcVendorName`/`bcVendorNo`, so the RFQ routes to the original part's supplier
    instead of the crossed part's supplier. Fix: `buildRfqSupplierGroups()` now
    re-resolves vendor from BC for any `isCrossed` item before the existing
    empty-vendor fallback. Falls back to stale vendor if BC lookup fails.

42. **RESOLVED** — `c2bba6cf` (2026-05-20, deployed in v1.20.3) — "Default for
    future RFQs" vendor email persistence — three bugs:
    (A) Emails only saved on checkbox toggle — edits made after checking "remember"
    were never persisted. Fix: save all remembered vendor emails at send time in
    `sendAll()`.
    (B) Saved defaults silently discarded when BC had already populated the email
    field. Fix: saved defaults now always override BC-populated contacts.
    (C) Silent `.catch(()=>{})` on Firestore writes swallowed errors. Fix: replaced
    with `console.warn` logging.

43. **RESOLVED** — `e61f13ed` (2026-05-20, deployed in v1.20.4) — No admin
    notifications when supplier portal encounters failures. New
    `notifyAdminPortalFailure()` helper in `functions/index.js` sends de-duplicated
    emails (1/hr per alert type) to company admins for: AI extraction errors,
    JSON parse failures, cost-cap triggers, notification pipeline breaks, and
    email delivery failures. Also wrapped `onSupplierQuoteSubmitted` notification
    creation in try/catch to prevent unhandled rejections from killing the trigger.

44. **RESOLVED** — `09c1f79b` (2026-05-20, deployed in v1.20.4) — Supplier-facing
    error message shows raw technical error text. Replaced with user-friendly copy:
    "We couldn't auto-extract pricing from your quote — our team has been notified
    and will review it. Please enter prices manually below to keep things moving."
    Raw error still stored in state for console diagnostics.

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
T3. **OPEN** — BOM row ordering: JOB BUYOFF and CRATE rows should always sort to the bottom
    of the BOM, just above CONTINGENCY. Currently they can appear at arbitrary positions
    depending on extraction/insertion order, which causes them to show up in crossed-item
    notes and lead-time drivers despite content-based filtering. Fix: enforce a stable
    sort in the BOM display/save path that pins these utility rows to the end.
T4. **OPEN** — `firestore.rules` and other non-JS files (`.rules`, `.json`, `.html`) get no
    coverage from the syntax check or the risk-pattern review. The rfqUploads fix (#1, commit
    `701d693`) committed without any pre-commit feedback. Low priority; add a separate
    rules-syntax check (`firebase deploy --only firestore --dry-run` or similar) if/when it
    becomes a real risk.
T5. **OPEN** — Quote package enhancement: investigate sending the client a copy of the
    ARC-stamped drawings and ARC BOM alongside the quote PDF. Customers may find it valuable
    to receive the stamped drawings (with ARC markups/redlines) and the extracted BOM as part
    of the quote package. Would require bundling or attaching additional PDFs to the quote
    email or print output.
T6. **OPEN** — `extractionReport` not updated on re-extraction. When a user re-extracts a
    panel, the `panel.extractionReport` retains the timestamp and stats from the PREVIOUS
    extraction. Observed on PRJ402101: extractionReport timestamp 2026-05-20T22:23Z is from
    Round 1 extraction, but qvHistory shows `re_extract` at 2026-05-20T21:20Z (Round 2).
    The report should be regenerated on every extraction pass. Root cause: `runExtractionTask`
    builds `extractionReport` at the end of the pipeline but may not overwrite it on re-extract
    if the report-generation code path is skipped or conditional. Fix: ensure `extractionReport`
    is always rebuilt from scratch on every extraction, not merged with prior data.
    Discovered: 2026-05-21 diagnostic session (Issue E).
T7. **OPEN** — Duplicate Firestore documents: 23 BC project numbers have two documents in
    `companies/{companyId}/projects/` — one created manually by a user (with pages/BOM), one
    from BC import (empty, `importedFromBC: true`, panels: 0). No data divergence (all 23
    BC-import docs are empty shells), but the duplicate causes confusion: different users may
    load different documents for the same project number. Root cause: no uniqueness constraint
    on `bcProjectNumber` at creation time. Fix (Layer A): add a duplicate guard that checks
    for existing documents with the same `bcProjectNumber` before creating a new project.
    Remediation: all 23 BC-import docs are safe to delete (0 BOM, 0 pages). See audit data
    from 2026-05-21 diagnostic session.
    Discovered: 2026-05-21 diagnostic session (Issue A root cause).
T8. **OPEN** — Qty inflation (Issue A2): Noah's screenshot of PRJ402101 at 8:30 AM 5/21/2026
    (post-hard-refresh) showed enclosure qty=8 and A/C qty=48, but current Firestore has qty=1
    for both. Extraction completed 4:23 PM 5/20 — no extraction was running at 8:30 AM.
    Investigation paths:
    (a) Firestore offline persistence: RULED OUT — `enablePersistence()` never called in ARC.
        IndexedDB cannot be serving stale data.
    (b) Wrong document: Projects load by document ID, not bcProjectNumber. Two duplicate docs
        exist for PRJ402101. CONSTRAINED by server metadata: the BC-import shell
        (arc-40b43a7c...) server updateTime = createTime = 5/20/2026 11:57:02 AM MDT.
        The shell was NEVER WRITTEN TO after initial creation — it cannot have temporarily
        held BOM data. The `quoteRev:1` and `lastQuoteHash:655853926` were set at creation
        time (part of the initial BC import save), not from a later operation.
        The manual doc (z1QmSG8B...) updateTime = 5/21/2026 9:32:38 AM MDT (1 hour AFTER
        Noah's screenshot, by Jon). Before that write, the manual doc was unchanged since
        the 5:06 PM refresh_pricing on 5/20.
    (c) BOM modification without qvHistory: Exact-dedup SUM (line 12518/22481 in index.bundle.js)
        aggregates qty across pages without per-row qvHistory. Snippet self-correction can also
        modify qty during extraction without separate qvHistory entry. But `bomPageCount:1` and
        no active extraction at 8:30 AM makes this path unlikely.
    Status: no satisfying explanation found. Server metadata rules out the shell as a source
    of stale data (never modified) and rules out a recent write to the manual doc (no write
    between 5:06 PM 5/20 and 9:32 AM 5/21, after the screenshot). Remaining possibilities:
    (i) Noah's screenshot was from a different project, (ii) the screenshot timestamp is
    inaccurate, or (iii) a client-side rendering bug displayed wrong quantities from correct
    data. Need Noah's actual screenshot to cross-reference visible part numbers.
    Discovered: 2026-05-21 diagnostic session.

## Round 15 (diagnostic session fixes, 2026-05-21)

45. **RESOLVED** — (firestore.rules deployed 2026-05-21, commit pending) — Issue I: `_snapshots`
    subcollection under `companies/{companyId}/projects/{projectId}` had no matching Firestore
    rule. The `users/{uid}/{document=**}` recursive wildcard covers user-path subcollections,
    but the company-path `match /projects/{projectId}` block only had explicit rules for the
    project document itself and `ecos/{ecoId}` — no rule for `_snapshots/{snapshotId}`.
    Result: `saveSnapshot()` silently failed for ALL company-account projects since the
    snapshot feature was introduced. Every "Restore" safety-net call (before re-extraction,
    Get New Pricing, panel deletion) was non-functional.

    Fix: added `match /_snapshots/{snapshotId}` rule inside the company-path projects block:
    `allow read: if isMember(); allow create: if canWrite(); allow delete: if canWrite();
    allow update: if false;` Snapshots are immutable by design — create and delete only.
    Deployed via `firebase deploy --only firestore:rules` (single Firebase project, applies
    to both test and production hosting targets).

    Verification: triggered Get New Pricing on PRJ402105 Panel 1. Console confirmed
    `SNAPSHOT: saved "Before Get New Pricing" for Panel 1`. UI Restore button shows
    "Before Get New Pricing — 5/21/2026, 6:13:36 PM · 50 BOM items" with working Restore
    button. PASS.

46. **RESOLVED** — `ab5f3b91` (v1.20.13, deployed 2026-05-21) — Issue H: BC sync self-conflict — "Another user has already changed the
    record" ETag concurrency errors on valid BC Items during planning line sync.
    Observed on PRJ402105 during pricing run: 3 items (CHCC2DIU, 592273, 2910386) all
    show the same error with different CorrelationIds. All items exist in BC; single user.

    **Root cause (confirmed 2026-05-21):** ARC racing itself via BC server-side cascades
    inside `bcSyncPanelPlanningLines` (`src/app.jsx:3279`). The function captures ETags
    for all ~50 planning lines in one bulk GET (Step 1, line 3356), then runs two
    operations that can invalidate those ETags before the PATCH loop (Step 3) reaches
    the affected lines:

    (A) Step 2b (lines 3425-3443) PATCHes ItemCard posting groups for items with empty
    `Gen_Prod_Posting_Group`/`Inventory_Posting_Group`. BC's business logic revalidates
    planning lines referencing the patched item, bumping their `@odata.etag`.

    (B) Step 3's own sequential PATCHes (300ms spacing, ~30s total loop time) trigger BC
    task-level recalculations that can bump ETags on other lines in the same task. Early
    PATCHes invalidate later PATCHes' Step-1 ETags.

    (C) `bcSyncPanelTaskDescriptions` (line 22208) runs concurrently (fire-and-forget)
    and PATCHes task records in the same project, potentially triggering additional BC
    server-side recalculations.

    `patchLine` (line 3463) retries only on 429 (rate limiting). No re-fetch-ETag-and-
    retry pattern for concurrency conflicts. No re-read-before-write.

    **Proposed fix:** Use `If-Match: "*"` for planning line PATCHes in Step 3, matching
    what `bcSyncPanelTaskDescriptions` already does. Safe because: (a) the sync is a
    full-state overwrite; (b) `bcSyncing` guard prevents overlapping UI-triggered syncs;
    (c) the "other user" is always ARC's own server-side cascade, not a human. Step 2b's
    `bcPatchItemOData` should keep per-item ETags (shared ItemCard records could be
    modified externally). Alternative: re-fetch ETag immediately before each PATCH
    (preserves concurrency safety, costs ~50 extra GETs per sync).

    **Separate sub-issue:** The original diagnostic also captured 4 "Inventory Posting
    Group is read-only" errors (different items, different root cause — ARC's PATCH
    payload includes a read-only field). These may be addressed separately.

    Discovered: 2026-05-21 diagnostic session.

    **Reproduction #2 (2026-05-21 evening, production):** Project CSW1904-121
    (Springfield WWTP, PRJ402105). 7 items failed BC sync:
    - 300-AOD930 (300 NEMA contactor) — "Another user has already changed the record"
    - FNQ-R-1 (Bussmann fuse) — same ETag conflict
    - CHCC2DIU (fuse holder) — same ETag conflict
    - 592273 (enclosure equipment tag) — same ETag conflict
    - 2910386 (surge protective device) — same ETag conflict
    - CRATE — same ETag conflict
    - JOB BUYOFF — "BC item validation error" (different root cause, not ETag)
    Trigger: BC sync after pricing. 6 of 7 are the same ETag self-conflict pattern
    from the original diagnostic. Confirms the issue is reliably reproducible on
    any project with 20+ BOM items syncing to BC.

    **Interim fix (Path B wildcard):** Dropped `existing["@odata.etag"]` from both
    `patchLine` call sites (BASE sync at `src/app.jsx:3499`, ECO sync at
    `src/app.jsx:3656`). `patchLine` defaults to `If-Match: "*"` when no ETag is
    passed. Planning lines are project-specific — ARC is the sole writer, so
    wildcard is safe. `bcPatchItemOData` (shared ItemCards) retains per-item ETags.
    Verified on test: PRJ402105 BC sync completed without ETag errors for all
    previously-failing items. Long-term: if multi-user BC editing is introduced,
    revisit the wildcard assumption (TODO comment in code marks both sites).

47. **RESOLVED** — `9987dc4a` (v1.20.12, deployed 2026-05-21) — FIX 2: AI determinism
    + structured output + multi-type page classification.
    Three changes shipped together:
    (a) `apiCall` now defaults `temperature:0` for all AI calls, eliminating
        nondeterministic extraction results. Smart Query chatbot overridden to
        `temperature:1` at its call site to preserve conversational tone.
    (b) `apiCall` response handling now detects `tool_use` blocks and returns
        `JSON.stringify(toolBlock.input)` — enables structured output via Anthropic's
        tool_use schema enforcement.
    (c) `detectPageTypes` now uses `tools` + `tool_choice` (forced tool call) with a
        typed schema (`types: string[]` enum + optional `bomRegion` object). Prompt
        DECISION ORDER replaced with CLASSIFICATION RULES allowing multi-type arrays
        (e.g. `["schematic","bom"]` for pages with both drawing and parts table).
        Deepens the region-merge fix from #25 — AI itself now returns multi-type,
        not just user regions compensating for single-type AI output.
    Relates to: #25 (original DECISION ORDER single-type issue).

## Round 16 (crop-path rollback + scanned PDF quality + progress bar, 2026-05-22)

48. **RESOLVED** — `ed1c6a42` (v1.20.14, deployed 2026-05-22) — Crop-path extraction
    regression rollback. Commit `8d984699` (2026-05-20, v1.20.5) reintroduced
    crop-first BOM extraction priority, unknowingly re-enabling the same JPEG
    compression artifact failure mode that caused ~20 wrong part numbers on dense
    D-size BOMs (character-merging: B↔8, I↔1, S↔5, 2↔3). Originally deleted in
    `571105e9` (2026-05-14). Reintroduction was via direct commit to master with
    no PR, no documented rationale, and no test case.

    Discovered 2026-05-22 after PRJ402107 BOM extraction missed most part numbers.
    Diagnostic confirmed the source PDF (CSW1807-121_Rev.D.pdf) contains
    CCITTFaxDecode monochrome fax-scan images (~280 DPI), not vector text.

    Fix: restored PDF-native priority across all three call sites (extractBomPage CF,
    extractBomBatch CF, client-side fallback). Added 6-rule Extraction Path Change
    Protocol to CLAUDE.md to prevent recurrence. Exposure assessment: 87 projects
    scanned, 7 affected, 1 quoted (MTX-Q202018) — manually verified clean.

49. **RESOLVED** — `06a0b9ee` (v1.20.15, deployed 2026-05-22) — Scanned PDF quality
    detection and enhanced extraction for degraded source material. Multi-part feature:

    (a) Server-side `assessPdfPageQuality()` helper in `functions/index.js` — inspects
    pdf-lib page XObject resources for CCITTFaxDecode (monochrome fax), DCTDecode
    (JPEG), large FlateDecode images. Returns `{isScanned, isMonochrome, estimatedDpi,
    imageCount, hasVectorText, warningLevel}`.

    (b) Dynamic prompt enhancement: when quality is degraded, injects SCANNED DOCUMENT
    ALERT into the Anthropic prompt instructing maximum character scrutiny, default
    medium confidence, explicit disambiguation rules for B/8, O/0, S/5, I/1.

    (c) PDF-native CropBox: when users draw BOM regions, applies `page.setCropBox()`
    in native PDF coordinates instead of converting to JPEG crop. Preserves vector
    fidelity. Coordinate transform from normalized (0-1, top-left origin) to PDF
    points (bottom-left origin).

    (d) Client-side propagation: `pdfQuality` flows from server response → parsed
    result → `_perPageOutcomes` → `extractionReport.scanQuality` (persisted on panel).

    (e) UI scan-quality warning banner above BOM table — amber for medium, orange for
    high (monochrome fax). Persists across reloads via extractionReport.

    (f) Confidence dot indicators on BOM rows — red (#ef4444) for low confidence,
    amber (#f59e0b) for medium. Tooltip shows "AI confidence: {level}".

50. **RESOLVED** — `8a3e8773` (v1.20.16, deployed 2026-05-22) — Pre-extraction scan
    quality warning. New `checkPdfQuality` Cloud Function (30s timeout, 512MB, no AI
    call) — lightweight pre-flight check that downloads PDF and inspects XObjects.
    Client calls it before extraction starts; for re-extractions uses cached
    `extractionReport.scanQuality` instead. Shows warning via progress status bar:
    "Low-quality scanned drawing detected (N fax-scan pages) — extraction will take
    longer and part numbers may need review." Non-blocking (try/catch).

51. **RESOLVED** — `4c6581d7` (v1.20.18, deployed 2026-05-22) — Progress bar heartbeat
    during long API calls. Added `bgHeartbeat()` function that ticks the progress bar
    forward every 3 seconds using an asymptotic curve (fast initial progress, slows
    over time, never reaches cap). Wired into 3 stall points: batch extraction, per-page
    fallback, and re-extract batch. Shows elapsed progress like "Batch extracting 3 BOM
    pages… (42%)". v1.20.17 had a scoping bug (function defined inside `runExtractionTask`
    but called from `PanelCard`) — fixed in v1.20.18 by hoisting to module scope.

52. **OPEN** — Progress bar streaming (future improvement). Current heartbeat is synthetic
    — it shows simulated progress, not real extraction progress. The Anthropic API
    supports `stream: true` which could provide token-level progress updates. Would
    require server-side streaming (Cloud Functions → client) or SSE/WebSocket bridge.
    Significantly more complex than the heartbeat approach. Deferred.

53. **OPEN** — ECO page type detection bug (Issue G from 2026-05-22 diagnostic). When an
    ECO is created from a panel, the page type detection may misclassify pages that were
    previously correctly typed. Needs investigation — observed during the PRJ402107
    diagnostic session but not root-caused.

54. **OPEN** — BC sync 400 errors on valid items (Issue J from 2026-05-22 diagnostic).
    Separate from the ETag self-conflict (#46) — these are HTTP 400 validation errors
    where the PATCH payload includes fields that BC considers read-only or invalid for
    the target entity type. Needs investigation to identify which fields in the PATCH
    payload trigger the rejection.

## Round 17 (H9 fuzzy merge fix + Coach post-deploy findings, 2026-05-22)

55. **RESOLVED** — `6d47099b` (v1.20.21), `2d707228` (v1.20.22, deployed 2026-05-22) —
    H9: fuzzy merge itemNo guard. Added a 3-line predicate to
    `fuzzyMergeBomItemsWithReport` (app.jsx:9221-9223) that blocks merges when both items
    have different non-empty itemNo values. Prevents false merges of product-family
    variants (e.g. IDEC RH1B/RH2B/RH3B relays, SH1B/SH2B/SH3B sockets) that differ by
    1 character, share the same manufacturer, and have identical descriptions — previously
    passing all 7 existing gates including the v1.19.642 identical-description override of
    the Y-position guard.

    v1.20.22 follow-up fixed keepA alignment in merge report fields (keptItemNo/
    droppedItemNo now track the keepA conditional correctly). Diagnostic-only impact.

    Regression tested across 10 production panels (22 saved merges analyzed), PRJ402104
    reconstructed pre-merge BOM (items 27/28/30 all survived), and 3 single-column BOM
    projects (PRJ402068, PRJ402089, PRJ402096 — zero regressions). Coach signed off: C14.

    Test artifacts: `tests/extraction-baseline/verify-h9-guard.js`,
    `tests/extraction-baseline/prj402104-post-h9.json`,
    `tests/extraction-baseline/prj402104-post-h9-diff.md`.

56. **OPEN** — PRJ402104 re-extraction raw count drop 50→21 (Coach C14). Post-H9
    re-extraction produced items 27-47 only — items 1-26 entirely absent from AI output.
    This is upstream of the fuzzy merge fix (raw count, not pipeline loss). Most likely
    hypothesis: multi-page BOM where page 1 wasn't included in re-extraction batch.
    Pre-H9 raw=47 is consistent with 2-page BOM. Requires: (1) Firestore page data
    inspection (how many "bom" pages?), (2) Cloud Function logs, (3) re-run test for
    determinism check. Not an H9 regression — pipeline preserved all 21 AI items
    (21→21→21→21, zero loss at every stage).

57. **RESOLVED** — `4861a967` (v1.20.98, deployed 2026-06-04) — Re-extraction batch path missing bomRegion.
    `app.jsx:22481` constructs batch page objects WITHOUT `bomRegion` — initial extraction
    at line 12305 correctly includes `bomRegion:unit.bomRegion||null`. When
    `extractBomBatchViaServer` maps these pages, `pg.bomRegion` is undefined→null, Cloud
    Function skips CropBox. AI sees full page instead of focused BOM region. One-field
    mechanical fix, but part of broader H10 re-extraction architecture work.

58. **OPEN** — Re-extraction verification gap (Coach C15, CRITICAL, H10). Re-extraction
    path computes per-page verification via `verifyBomExtraction` but silently discards
    the result. The verification object is computed, not read, and never stored. H10 scope:
    (1) bomRegion in batch payload (#57), (2) read extractionVerification result,
    (3) missing-from-start gap detection, (4) L3 retry/gap-fill, (5) verification in
    extractionReport, (6) L3 report fields, (7) shared L3 function. Absorbs H7
    (re-extraction path was previously tracked separately). Monday work.

59. **OPEN** — 4 panels with fuzzy merges but no sequence gaps (from H9 regression test).
    PRJ402091, PRJ402083, PRJ402093, PRJ402079 each have 1-3 saved fuzzy merges in
    `extractionReport.fuzzyMerges` but empty `finalSequenceGaps`. These merges were
    legitimate (true duplicates, not product-family variants) — the itemNo guard would
    not have changed the outcome. Worth spot-checking to confirm no false positives exist
    in production merge history beyond the 10 known IDEC-family cases.

60. **OPEN** — Latent identifier scope bugs in existing codebase (discovered by
    `tools/check-scope.js` during Milestone B, v1.20.26). Eight pre-existing identifier
    scope bugs documented as `KNOWN_VIOLATIONS` in the scope checker. Each is the same bug
    class as the v1.20.23 `onArchive` regression (JSX compiles, runtime crashes when code
    path executes). Latent because the code paths aren't hit frequently or only trigger
    under specific conditions.

    Priority order for resolution:
    1. `VendorsPanel` `setMigrateStatus` — Vendor Posting Group migration would crash if
       invoked. Most likely user-visible failure.
    2. `ProjectView` `_doInlineQuoteSend` `onUpdate` — inline quote send would crash.
       ProjectView has `onChange`, not `onUpdate`.
    3. `ProjectView` EcoEditor `onUpdate` prop — same scope mismatch as #2.
    4. `PanelListView` ship-date popover `update` vs `onUpdate` — Enter key handler crash
       in the lead-time override popover.
    5. `ProjectView` `applyPortalPrices` `selectedPanelId` — references PanelListView's
       state. Guarded by `bomIsEmpty` check so only triggers on empty-BOM portal apply.
    6. `EcoEditor` `handleEcoFiles` `projectId` / `_logRemote` — scope mismatch, should
       use `project.id` and the function is from `addFiles` scope.
    7. `reExtractWithFeedback` `fbQs` — block-scoped `let` inside `try{}` block referenced
       after catch. Works only because catch returns early on error.

    Address after Milestone C ships. The `KNOWN_VIOLATIONS` baseline in `tools/check-scope.js`
    ensures these don't get worse, and the scope checker catches any new instances immediately.

61. **RESOLVED** (v1.20.36, index deployed separately) — Missing Firestore composite index
    for `loadArchives()` query. The query uses `where('_archiveComplete', '==', true)` combined
    with `orderBy('archivedAt', 'desc')` on `companies/{companyId}/projects_archive`. Firestore
    requires a composite index for any query that filters on one field and orders on a different
    field. Added to `firestore.indexes.json` and deployed via `firebase deploy --only firestore:indexes`.

    **CHECKLIST for future milestones:** Any Firestore query combining `where()` filters with
    `orderBy()` on different fields needs its composite index added to `firestore.indexes.json`
    BEFORE the query goes live. Milestone D may add restore history queries (filtered by user,
    ordered by date) — check index requirements during planning.

62. **OPEN** — BC sync doesn't update BOM row descriptions. BOM rows retain the originally
    scanned (OCR/AI-extracted) descriptions even after BC sync executes. Part numbers and
    pricing sync correctly; descriptions don't. Quote PDFs and downstream BC writes carry the
    scanned text, not the BC ItemCard description.

    Discovered during Milestone C smoke testing — restore preview surfaced "30 with description
    changes" on archived projects that proved to be the cumulative scanned-vs-BC gap present
    since original quote time, not real BC-side drift.

    Impact:
    - Restore preview description drift display surfaces noise rather than signal (structural
      gap masquerading as drift)
    - Quote documents may show scanned descriptions that don't match BC catalog descriptions
      (potential customer-facing issue worth investigating)
    - Milestone D restore execution needs to decide: write scanned descriptions back to BC,
      or fetch BC descriptions for writes

    Root cause likely in: the BC re-verify / pricing sync path — around `bcSyncPanelPlanningLines`
    (~line 3469) or the pricing audit function (~line 5034). Confirm by grepping through `bc*`
    functions for any that update `row.description`.

    Priority: Medium-high. Not blocking Milestone C (read-only preview, Restore button disabled).
    Should be resolved before Milestone D ships so restore execution writes BC-truth descriptions,
    not scanned text.

63. **OPEN** — Archive availability incorrectly gated by project status. Archive option is
    locked/disabled for projects in "Quote Sent" status (and possibly other statuses — needs
    investigation). Archive is a non-destructive snapshot operation that does NOT modify the
    source project. There is no business reason to restrict it by status — it should be
    available in ALL project statuses with no restrictions.

    Investigation needed:
    - Identify all status-based gates on archive availability (button visibility, menu items,
      keyboard shortcuts, action bar conditions)
    - Verify whether the bulk archive admin action has the same status gates
    - Map the full set of statuses that currently block archive

    Fix scope: Remove status checks from archive availability logic. Straightforward once the
    gates are identified.

    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.
    Priority: Defer to Milestone D wind-down or Milestone E.

## Post-Milestone-D BC Housekeeping (discovered during Phase 2.1 smoke test, v1.20.52)

64. **OPEN** — BC concurrency cap and exponential backoff. BC requests fire without
    coordination. Multiple parallel call paths hit 429 simultaneously. Retries don't back off
    correctly — same calls re-hit 429 in tight loops.

    Required behavior: Global concurrency cap (5–10 simultaneous BC requests), exponential
    backoff with jitter on 429, circuit breaker after N consecutive 429s.

    Investigation start: Identify all BC fetch/POST/PATCH call sites, find or build a shared
    throttle/queue layer.

    Effort estimate: Medium (touches many BC call sites OR centralizes through one shared helper).
    Priority: HIGH — first item after Milestone D wind-down.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

65. **OPEN** — Project-open BC sync hygiene. Opening any project triggers cascading BC sync
    work — customer re-sync, BC verify, purchase price fetch, labor sync, progress billing
    patch, panel task block backfill. Multiple parallel BC calls per open. Restored projects
    with partial state continuously try to "catch up" forever, each open firing another sync
    attempt.

    Required behavior: Debounce sync triggers (no re-sync within N seconds of last sync),
    verify F4's bomSyncHash actually prevents re-sync on restored projects, make on-open sync
    lazy/opt-in where possible.

    Related: F4 from Phase 2.1 (v1.20.52) should have addressed this for restored projects,
    but smoke test logs suggest it isn't working as intended — needs verification.

    Investigation start: Find all project-open BC sync trigger points, identify which ones are
    necessary vs. opportunistic.

    Priority: HIGH — second item after Milestone D wind-down.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

66. **OPEN** — bcCreatePanelTaskStructure idempotency gap. When resuming a partial restore,
    `bcCreatePanelTaskBlock` probes for one task (20100) but the wider
    `bcCreatePanelTaskStructure` tries to create all six tasks (10000, 20100, 20110, 20120,
    20199, 99999) sequentially without probing. On resume, the previously-created tasks return
    "EntityWithSameKeyExists" 400 errors.

    Required behavior: Probe-before-create for ALL six task numbers, not just 20100. Pattern
    same as Phase 0 fix for `bcAddEcoTask` and `bcCreateEcoTaskPlanningSkeleton`.

    Effort estimate: Small (~20 LOC, mirrors Phase 0 fix pattern).

    Note: Missed during Milestone D planning. Phase 0 caught the ECO functions but didn't
    audit the panel task function. Lesson for future planning: when adding probe-before-create
    for some BC writes, audit ALL related BC write functions for the same pattern.

    Priority: HIGH — third item after Milestone D wind-down.
    Discovered: Phase 2.1 smoke test (v1.20.52) when retrying PRJ402113 restore, by Jon, 2026-06-01.

67. **OPEN** — Test cleanup utility for smoke-test-restored projects. Each test restore creates
    a real BC project + real Firestore project. They persist forever, each one auto-syncing on
    every open. Compounds BC load over time.

    Required behavior: Way to mark projects as test artifacts and clean them up in batch.
    Either a flag (`_testProject: true`) set during smoke test mode, or a dedicated cleanup
    function that finds and removes recent test restores.

    Priority: MEDIUM — after #64, #65, #66 ship.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

68. **OPEN** — BC rate limit observability. 429 errors are silent (only visible in DevTools
    console). No proactive signal to user when throttling is happening.

    Required behavior: Surface 429 count in UI, optionally log to Firestore for cross-session
    visibility. Could be as simple as a banner that appears when N 429s occur in a window.

    Priority: LOWER — after the actual throttling improvements (#64) ship.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

69. **OPEN** — Posting-group auto-fix fails on service items (BUYOFF, Contingency).
    `bcSyncPanelPlanningLines` attempts to patch Gen. Prod. Posting Group on every planning line
    that mismatches, but service-type items (BUYOFF, Contingency, Crate) have a different posting
    group structure in BC. The PATCH returns 400, logged as "posting group fix failed" in console.
    Non-blocking (sync continues), but generates noisy errors on every sync for panels with
    service items.

    Required behavior: Skip posting-group auto-fix for rows matching `isServiceItem()` criteria
    (same pattern as `scanBomForArchiveIssues`). Already skipped during restore via F3's
    `opts.skipPostingGroupFix`, but the normal open-sync path still fires it.

    Priority: LOW — cosmetic console noise, no data impact.
    Discovered: Phase B investigation, 2026-06-01.

70. **OPEN** — bcFetchCustomerContacts 400 on specific customer C10114. Opening projects tied to
    customer C10114 triggers a 400 from the BC `customerContacts` endpoint. Other customers work
    fine. Likely a data-quality issue in BC (malformed contact record or missing required field on
    the BC side), but ARC doesn't handle the 400 gracefully — it logs a console error and
    silently skips contact population.

    Required behavior: Wrap bcFetchCustomerContacts in a try/catch that degrades gracefully
    (empty contacts array, no error noise). Optionally log the specific customer number to debug
    logs for BC admin follow-up.

    Priority: LOW — only affects one customer, non-blocking.
    Discovered: Phase B investigation, 2026-06-01.

71. **OPEN** — Vendor field source-of-truth audit. `bcVendorNo` and `bcVendorName` are
    independently populated in BOM data. Many projects have `bcVendorName` but no `bcVendorNo`.
    Different code paths check different fields for vendor presence.

    Symptom: PRJ402064 had 18/18 base BOM rows with `bcVendorName` populated but `bcVendorNo`
    empty. `scanBomForArchiveIssues` checked only `bcVendorNo`, flagging all 20 rows (including
    ECO adds) as "missing vendor" despite every row having a vendor name assigned.

    Stopgap shipped (v1.20.63): `scanBomForArchiveIssues` now passes if EITHER `bcVendorNo` OR
    `bcVendorName` has data, plus Matrix Systems vendor exclusion added.

    Audit needed: Identify all code paths reading vendor fields, determine when each is populated
    (BC sync, extraction, manual entry, pricing refresh), recommend canonical field per purpose.
    Investigation scope: Display, BC sync (PO creation, planning lines), search/filter,
    import/export, ECO handling. Action items if audit surfaces issues: Possibly backfill missing
    `bcVendorNo` from `bcVendorName` via BC lookup, or migrate to use `bcVendorName` as canonical
    for validation checks.

    Priority: MEDIUM — no immediate user-facing failures, but indicates systemic data integrity
    gaps worth resolving.
    Discovered: Milestone E Phase 2 smoke test on PRJ402064 (v1.20.62), 2026-06-01.
    Owner for investigation: Coach.

72. **OPEN** — Cannot change customer on existing project from ARC UI.
    After a project is created, ARC's UI allows editing project name and customer contact, but not
    the underlying customer (the `Bill_to_Customer_No` that ties the project to "Ovivo", "FLSmidth",
    etc.).

    Impact: If a customer is wrong at creation time, there's no recovery path within ARC. Limited
    workaround is editing in BC directly, but it's unconfirmed whether BC allows changing
    `Bill_to_Customer_No` on an existing project (may depend on PO activity, planning lines, etc.).

    Why noted: Discovered during Milestone E Phase 3 planning, where this constraint determined that
    Copy needs an upfront customer picker (rather than inheriting and allowing later change).

    Investigation needed: Confirm whether BC allows changing `Bill_to_Customer_No` on an existing
    project. If BC allows it, ARC should expose the change.

    Priority: LOWER — no immediate user-facing issue, but represents a UI gap that could become a
    problem if a customer assignment mistake happens.
    Discovered: Milestone E Phase 3 planning (v1.20.63), 2026-06-01.

73. **OPEN** — BOM extraction warning visibility (Scan Results banner).
    Symptom: When extraction produces issues (missing rows, sequence gaps, dedup-caused gaps),
    warnings appear in the ScanResultsBanner component above the BOM table. But the banner is
    collapsed by default. The collapsed summary shows all concerns on one line separated by
    middots, easy to gloss over.

    Impact: Real extraction problems can be silently ignored by users. Item 18 missing from
    RSD0203-126's extraction was caught by the system (`finalSequenceGaps` included `[18]`) but
    Jon didn't notice the warning during spot-check.

    Additionally: The warning message text says "missed by the AI scan" which is misleading for
    dedup-caused gaps (the AI returned the row, ARC's exact dedup consumed it). Different cause,
    same symptom, different message needed.

    Proposed improvements (Coach to design later):
    - Make the banner expanded by default when concerns exist
    - Promote the most critical issues out of the middot list
    - Distinguish "AI missed" gaps from "dedup-caused" gaps via mergeStats (if rawCount > exactCount,
      at least some gaps came from dedup)
    - Maybe add an inline indicator near affected BOM rows

    Priority: MEDIUM — no immediate data loss now that the dedup fix is shipped (v1.20.67), but
    represents a real product gap. A user could miss other warnings about extractions that the
    system correctly flagged.
    Discovered: RSD0203-126 extraction spot-check after v1.20.66, 2026-06-01.
    Owner for design: Coach.

75. **OPEN** — Extraction progress bar accuracy.
    Symptom: During extraction, the progress bar does not move smoothly or accurately. User has
    limited visibility into how far along the extraction is.

    Impact: User uncertainty during long extractions (100s+). User doesn't know if extraction is
    still running, stuck, or how much longer to wait.

    Possible causes (to analyze when prioritized):
    - Progress events not fired by Cloud Function during extraction
    - Progress states use static labels instead of percentage updates
    - Client-side timer not synchronized with actual extraction state
    - No granular per-step progress (only "extracting" → "complete")

    Investigation areas:
    - Where is the progress bar driven from? What events update it?
    - Can per-page progress be reported by the Cloud Function?

    Recommended approach (Jon, 2026-06-01):
    - Cloud Function writes progress milestones to Firestore (e.g. `panel.extractionProgress` field)
    - Client subscribes via existing project Firestore listener (no polling)
    - Progress bar maps milestones to percentage and label

    Granularity per page:
    - `queued` → `parsing-pdf` → `ai-extraction` → `parsing-response` → `validation` → `merging` → `saving` → `complete`
    - For multi-page: `pagesTotal`, `pagesComplete`, `currentPage`

    The data already exists in Cloud Functions logs — surface it via Firestore writes for the client
    to consume. This matches ARC's existing subscription pattern and avoids polling overhead.
    Marc + Coach to refine the exact field schema during implementation.

    Priority: LOWER — cosmetic / UX improvement, not data-affecting.
    Discovered: PRJ402109 Line 4 RSD0203-126 re-extractions, 2026-06-01. Jon observed limited
    progress visibility during long extraction runs.
    Owner for design: Coach.

## Development Direction (2026-06-01)

76. **OPEN** — Multi-Claude coordination layer (Freddy ↔ Coach ↔ Marc).
    Symptom: Three-role workflow currently requires Jon to manually copy/paste messages between
    Claude.ai (Freddy Lyst / Analyst), CC Terminal (Sam Wize / Coach), and CCD (Marc Masdev / Dev).
    Each exchange is a forwarded paste. Friction is real: latency, lossy summarization,
    version-tracking mistakes (e.g., one role drafting guidance about a fix that was never actually
    deployed, or referencing a version that another role hasn't seen yet).

    Impact: Slows multi-role work. Increases chance of coordination errors. Limits how complex
    problems can be solved before context drift. Jon spends substantial cognitive load just routing
    messages between sessions.

    Concept: Direct Claude-to-Claude messaging between the three roles, with Jon as facilitator
    rather than message bus.

    Possible directions to explore:
    - Shared SESSION-LOG.md in repo root — all roles read/append, single source of truth
    - MCP-based coordination — dedicated MCP server with a message bus, each Claude instance
      posts updates and reads from a shared queue
    - Repurpose TRAQS infrastructure — CCD hooks already feed into
      ccd-monitor.cloudfunctions.net/ccdHook, could extend to route between sessions
    - Nested sub-agents — Claude Code supports nested agent invocation, Marc could be a
      sub-agent invoked from Coach's terminal instead of a separate session

    Considerations:
    - Each Claude instance has its own context window; persistent shared state needs to live
      somewhere durable (file, Firestore, or external service)
    - Notifications already exist (Pushover via notify.ps1) — could be extended for inter-role
      messages beyond simple alerts
    - Version drift is a real risk — any solution needs to handle "Claude A thought v1.20.X was
      deployed when it was actually v1.20.Y"
    - Conversation log compaction means each session loses context over long conversations;
      coordination layer needs to survive compactions
    - Related: CCD hooks at ccd-monitor.cloudfunctions.net are existing infrastructure that
      could be extended; may overlap with TRAQS direction

    Priority: HIGH — Jon explicitly elevated this. The paste-forwarding workflow has surfaced
    multiple coordination errors during today's multi-role work and is a real bottleneck for
    productive three-session collaboration.
    Discovered: Multiple instances throughout 2026-06-01 work where paste-forwarding caused
    version-tracking confusion and added latency between sessions.
    Owner for design: Coach (with Jon coordination on broader Matrix ARC tooling stack).

77. **RESOLVED** (v1.20.80, dfbb2293, field-verified by Jon + Noah — all 5 tests pass incl. navigate-away-return symptom check) — UI bug: page delete renders broken state during pre-extraction phase.
    Root cause: removePage wrote to panel.pages and Firestore instead of pendingPages; Firestore
    save stripped dataUrl, causing black images on fallback. Fix: pre-extraction-aware removePage
    updates pendingPages/cache directly, no Firestore write.
    Design: PRE-EXTRACTION-PAGE-MGMT-DESIGN.md (Coach v3), PRE-EXTRACTION-PAGE-MGMT-ANALYST-REVIEW.md (Freddy).
    Discovered: Noah's workflow feedback during pre-extraction page management (2026-06-02).

78. **RESOLVED** (v1.20.80, dfbb2293, field-verified by Jon + Noah — all 5 tests pass) — Feature: pre-extraction page selection/deletion.
    Shipped alongside #77. Delete-based page management per Jon's 5-step flow (drop → scan →
    delete unwanted → confirm types → extract remaining). "Proceed with Extraction" button shows
    live page count after deletions and disables when list is empty. Pre-extraction deletes
    survive in-app navigation (module-scope cache) but not browser refresh (intentional).
    Design: PRE-EXTRACTION-PAGE-MGMT-DESIGN.md (Coach v3), PRE-EXTRACTION-PAGE-MGMT-ANALYST-REVIEW.md (Freddy).
    Discovered: Noah's feedback during pre-extraction page management (2026-06-02).

## BOM Prompt Fix (2026-06-02)

79. **RESOLVED** (v1.20.81) — F-1a.3 / F-1d.8: BOM prompt duplicate-merge instruction caused silent data loss.
    The `DUPLICATE PART NUMBERS` prompt instruction told the AI to combine same-PN rows with
    summed qty before returning results. This destroyed data inside the model's response before
    ARC's code dedup (positional → exact → fuzzy merge at line 13884+) could handle it correctly.
    Root cause of the 592273 failure (items 17/18 on RSD0203-126 silently merged during extraction).
    Prompt merge fix shipped in two stages. v1 (4b2ef7a0, Jun 1): merge only if descriptions
    identical — field-verified by Jon on 592273 (different-description case). v2 (v1.20.81,
    4cfaeb81 + 67dd897c, Jun 2): removed all AI-side merging, defers to code dedup. v1.20.81
    is strictly more permissive and inherits the 592273 result for different-description rows,
    Same-PN/same-description case runtime-verified by Marc on v1.20.81 via browser console dedup
    pipeline test: 5 scenarios (same-PN/same-desc/same-itemNo → collapsed qty summed; cross-page
    duplicate → collapsed; same-PN/different-desc → kept separate; same-PN/same-desc/different-itemNo
    → kept separate; unrelated part → untouched). All pass. Verification gap closed.
    Changed at `src/app.jsx:11286` and `functions/bomPrompt.js:215`.
    Discovered: overnight audit F-1a.3 (2026-06-01), diagnosed across v1.20.67-69 dedup fixes.

## Feedback Re-Extract Dedup Key Mismatch (2026-06-02)

80. **OPEN** (HIGH) — Feedback re-extract path uses PN-only dedup key — merges more aggressively
    than first-extract/re-extract paths.
    Feedback re-extract (`app.jsx:24101-24103`) dedups on PN alone, while first-extract (line
    13893) and re-extract (line 23889) key on `PN + itemNo + descNorm`. Consequence: two distinct
    line items sharing a PN but with different descriptions survive the normal paths but get
    silently merged on a feedback re-extract — same data-loss class as the prompt over-merge just
    fixed (F-1d.8/#79). Same BOM dedups differently depending on which extraction path is taken.
    Needs investigation to confirm real-world impact (how often do users trigger feedback
    re-extract on panels with same-PN/different-desc items?).
    Not fixed by F-1g.1 (v1.20.82), which instruments the merge for reporting but does not change
    merge behavior. F-1g.1's exactMerges instrumentation will surface this over-merge when it
    happens, making it visible rather than silent.
    Discovered: Coach trace during F-1g.1 plan (2026-06-02).

## PRJ402119 Extraction Failure (2026-06-02)

81. **OPEN** (HIGH) — Extraction anomaly detection: warn user when results look suspicious.
    When extraction produces anomalous results, ARC should surface a modal warning instead of
    silently accepting bad data. Anomaly signals (any should trigger):
    - Zero items from a user-asserted BOM region (wrong region/drawing)
    - All/most items have placeholder PNs ("TO BE CONFIRMED", "?", "TBD")
    - Very low confidence scores across the board
    - Descriptions that don't match BOM patterns (no manufacturer, no part-like strings)
    - Column header detection failure flagged by the AI
    Target UX: modal warning after extraction completes, explaining what anomalies were found
    and suggesting the user verify the BOM region / page selection. Not a blocker — user can
    dismiss and keep the results — but makes the problem visible instead of silent.
    Observed on PRJ402119: Line 2 bad region produced items with "TO BE CONFIRMED" as PNs —
    visible enough to signal a problem, but only because the user checked. Lines 1-2 earlier
    had wrong regions with 0 items and ARC said nothing.
    Design: Freddy scope (modal triggers, wording, actions). Not part of F-1g.1.
    Discovered: PRJ402119 diagnostic (2026-06-02).

82. **RESOLVED** — `10fdced5` + `4e31f918` (2026-06-02, functions deployed 2026-06-02T21:49:04Z).
    PDF-native extraction bailing on CropBox pages with `noBomReason:"wrong-page-type"`.
    P1: removed noBomReason escape when `pdfCropped===true` (both `extractBomPage` and
    `extractBomBatch`). P2: added scan quality alert to bom-region-crop fallback prompt.
    Deploy status verified definitively by Coach C22 (2026-06-03): byte-for-byte diff of
    deployed source archive vs committed `functions/index.js` = zero diff. Runtime log
    confirmed scanned PDF extracting to completion post-fix.
    Discovered: PRJ402119 diagnostic (2026-06-02).

83. **OPEN** (HIGH) — Image/crop fallback path architecture — replace lossy JPEG with full-res
    PDF region crop or fail visibly.
    The current bom-region-crop fallback sends a canvas-cropped JPEG of the page image. On
    scanned monochrome drawings (166 DPI), JPEG compression destroys edge detail on text
    characters, causing systematic misreads (3→0, G→6/8, 12→L, etc.). Target architecture
    per Jon: PDF-native primary (fixed per #82 P1) → full-res PDF region crop as fallback
    (CropBox on the native PDF, NOT JPEG) → if that fails, FAIL VISIBLY ("couldn't extract
    reliably, verify manually"). Never silently hand the user a low-confidence BOM that looks
    confident. Before removing the JPEG path, need data: how often does image-crop fallback
    produce a GOOD BOM vs garbled? Investigation pending.
    Discovered: PRJ402119 diagnostic (2026-06-02).

84. **OPEN** (MEDIUM) — Extraction drops last row(s) on scanned BOMs + misses companion parts.
    On PRJ402119 Sht 3/6 (13-row BOM), the JPEG+P2 path consistently extracts 13/14 items
    (missing LNM40BPK100, the last row) and the companion TYD2CW6 (written as "WITH COVER
    TYD2CW6" on the same line as TYD15X3WPW6, row 8). The splitCompanionParts post-processor
    exists but depends on the AI emitting the companion — on this scan the model only returns
    the primary part. Two sub-issues:
    (a) Last-row drop: BOM table bottom may be clipped by the crop region or the model stops
        reading before the final row. Check if the crop region coordinates include row 13.
    (b) Companion-part miss: the prompt asks for companion splitting but the model doesn't
        always comply on scanned drawings with small text. May need stronger prompt or a
        post-processing pattern match ("WITH COVER", "WITH BASE", "WITH SOCKET").
    Discovered: PRJ402119 variance measurement (2026-06-02).
    **Update (2026-06-03):** Both symptoms NOT REPRODUCED on the post-#94 extraction run
    (v1.20.95). LNM40BPK100 (last row) AND TYD2CW6 (companion part) both extracted. The #94
    inclusion fix changed the image source from in-memory addFiles render to ensureDataUrl
    (Storage-fetched), which may have altered the image the model sees. Truncation and
    companion-miss may have been artifacts of the prior image path rather than systematic
    prompt/model failures. Keep OPEN pending reproduction on another scanned BOM project;
    if not reproduced after 3+ projects, mark STALE. See #95 for fidelity issues on the same
    extraction run.

86. **RESOLVED** (CRITICAL) — Cross-project BOM contamination via stale extraction callback + reused ProjectView.
    Root cause: two issues combined. (1) Panel IDs are sequential (`panel-1`, `panel-2`) and
    collide across every project. (2) `<ProjectView>` had no `key` prop, so React reused the
    same component instance when the user navigated directly between projects (e.g., notification
    click). When a long-running extraction completed after the user switched to a different project,
    `onDone` callback wrote PRJ402119's BOM into PRJ402111's React state via panel ID collision.
    The Firestore save inside `runExtractionTask` was always clean (captured projectId in closure);
    contamination was through the React state `onUpdate` → `setProject(prev => ...)` chain where
    `prev` was the new project's data. Auto-pricing then persisted contaminated data via
    `onSaveImmediate`.
    Fix: (a) Added `key={openProject.id}` to `<ProjectView>` — forces unmount/remount on project
    switch, killing all stale closures. (b) Added `_extractionProjectId` guard in `onDone` that
    compares against `_currentProjectId` at completion time — defense-in-depth that blocks
    `onUpdate` and auto-pricing if the active project changed during extraction.
    Follow-up: Panel ID uniqueness (use `panel-${Date.now()}-${random}` instead of sequential
    `panel-1`) would eliminate the collision class entirely. Tracked separately — not part of
    this hotfix due to migration risk on existing projects. Also: `_pendingPagesCache` uses the
    same panel-ID key and could cross-contaminate cached pages between projects (lower severity,
    same class).
    Discovered: 2026-06-03 (PRJ402119 → PRJ402111 contamination reported by Noah).
    Contamination paths: `app.jsx:23208` (onDone→onUpdate), `app.jsx:32955` (panel map by ID),
    `app.jsx:35110` (setProject function updater), `app.jsx:25783` (pricing onSaveImmediate).
    Fix sites: `app.jsx:45160` (key prop), `app.jsx:23209` (extraction guard).

87. **OPEN** (MEDIUM) — Panel IDs are non-unique across projects (follow-up hardening for #86).
    All projects generate panel IDs as `panel-1`, `panel-2`, etc. (`app.jsx:10043`, `app.jsx:39799`).
    Any module-scoped cache or callback keyed by panel.id can cross-contaminate between projects.
    Known affected: `_pendingPagesCache` (app.jsx:433), `_bgTasks` (app.jsx:421).
    Fix: generate unique IDs (`panel-${Date.now()}-${random}`) for new panels. Existing projects
    keep their current IDs (migration not needed — the #86 fix prevents the acute contamination).

88. **OPEN** (MEDIUM) — Async ownership audit: verify all long-running operations have project-scoped
    completion behavior. TODO #86 proved that async completion handlers can write to the wrong
    project if the user navigates away during execution. The extraction path is now fixed, but
    the same class of bug could exist in other async operations.
    Candidate areas to audit:
    - Extraction (`runExtractionTask`, `reExtractWithFeedback`) — FIXED in #86
    - Pricing (`runPricingOnPanel`, auto-pricing after extraction) — check `onSaveImmediate` closure
    - BC sync (`bcSyncPanelPlanningLines`, `bcSyncPanelTaskDescriptions`) — fire-and-forget pattern
    - Archive/Restore — long-running with multiple Firestore writes
    - Copy project — async with storage uploads
    - Attachment processing (`addFiles` → PDF upload → page rendering)
    - Import operations
    Goal: ensure async completion cannot mutate whichever project happens to be active. Each
    operation must capture `projectId` at invocation and validate before writing.
    Related: #86 (root cause), #87 (panel ID uniqueness). See CLAUDE.md "Async Project Ownership
    Rule" and `DIAGNOSTIC-CROSS-PROJECT-CONTAMINATION.md`.
    Discovered: 2026-06-03 (lesson learned from #86 investigation).
    Owner for investigation: Coach.

89. **RESOLVED** (HIGH) — Background extraction pricing completion.
    When extraction completes for a project that is no longer the active view, pricing does not
    run. The #86 contamination guard correctly blocks `onDone` → `runPricingOnPanel` to prevent
    cross-project state writes, but the result is that the originating project's BOM is saved
    unpriced — 40 of 42 rows red on PRJ402119 after a navigate-away extraction.
    Product requirement: users must be able to start extraction on one project, navigate away,
    and have that project complete correctly in the background (including pricing).
    Fix: approach (a) — run pricing safely against the originating project using captured
    projectId/panelId closure. When the guard detects a project switch, pricing runs with
    `{background:true}` — suppresses React state setters and UI modals, writes directly to
    Firestore via `onSaveImmediate` (which is correctly project-scoped). Applied to all three
    extraction paths: `confirmAndExtract` (v1.20.89), Re-Extract Drawings + `reExtractWithFeedback`
    (v1.20.90).
    **Validated 2026-06-03 (v1.20.90):** Guard fired correctly, background pricing executed,
    background validation executed, correct project received updates, sentinel project unchanged,
    no forced navigation during test. All three extraction paths pass navigate-away test.
    Discovered: 2026-06-03 (PRJ402119 contamination test).
    Related: #86 (guard that causes this), #88 (async ownership audit), #91 (background workflow
    audit), #92 (UI ownership audit).

90. **OPEN** (MEDIUM) — ARC Cross UX: supersession not visually distinct from extraction error.
    Lead case on PRJ402119: model correctly read `855F-VMS20B24Y3L3Y8Y4Y6` (discontinued
    Allen-Bradley 855F stack light), ARC Cross correctly auto-replaced with `856TC-VMB24Y3Y5Y4`
    (current successor). Both extraction and ARC Cross worked as designed — the original part IS
    discontinued and the replacement IS intentional.
    Problem: an experienced user interpreted the valid supersession as an extraction error because
    the current "from: 855F... / ARC Cross / auto-replace" indicator doesn't clearly communicate
    that this was a deliberate discontinuation replacement vs. an OCR correction vs. a user
    preference. This triggered a false investigation.
    Proposed fix: change the ARC Cross pill/label to communicate intent more clearly. Options:
    - "Superseded — ARC Cross" (communicates discontinuation)
    - "Replaced (discontinued) — ARC Cross" (explicit reason)
    - Add a tooltip showing: "Original part 855F-VMS20B24Y3L3Y8Y4Y6 was recognized correctly.
      Replaced with 856TC-VMB24Y3Y5Y4 because the original is discontinued (per your ARC Cross
      database)."
    Goal: reduce false extraction investigations caused by users interpreting valid ARC Cross
    replacements as extraction errors. The indicator must clearly convey: (1) the original part
    was recognized, (2) the replacement was intentional, (3) the reason was supersession.
    Note: the alternates DB currently stores no reason field (discontinuation vs. preference vs.
    cost). Adding an optional `reason` field to alternate entries would enable context-specific
    labels. Low effort, high UX value.
    Discovered: 2026-06-03 (PRJ402119 BOM diagnostic — Jon initially suspected extraction defect).

91. **OPEN** (MEDIUM) — Background workflow audit: verify all extraction-completion functions are
    background-safe and do not depend on active UI state.
    The #86 contamination fix and #89 pricing fix exposed that pricing was part of the extraction
    completion chain and broke when the user navigated away. We fixed the immediate issue, but
    should verify all background-completion functions are correctly project-scoped.
    When extraction completes after the user navigates away, verify each of these is background-safe:
    1.  Extraction result save (`saveProjectPanel` in `runExtractionTask`)
    2.  Pricing (`runPricingOnPanel` — BC match, AI fallback, lead times)
    3.  BC item lookup (`bcLookupItem`, `bcFuzzyLookup`)
    4.  BC purchase price lookup (`bcFetchPurchasePrices`)
    5.  BC vendor resolution (`bcGetItemVendorNo`, `bcGetVendorName`, vendor backfill)
    6.  BC planning line sync (`bcSyncPanelPlanningLines` — fire-and-forget at end of pricing)
    7.  ARC Cross application (`applyLearnedCorrections` in extraction pipeline)
    8.  Fuzzy match suggestion generation (`setBcFuzzySuggestions` — React state setter)
    9.  Auto-assign behavior (`_autoAssignTriggerSetter` — module-scope, can fire on wrong project)
    10. Firestore listener recovery (does data appear correctly when user returns?)
    11. Task completion/status reporting (`bgDone`, `bgUpdate` — module-scope `_bgTasks`)
    12. Modal/toast/UI side effects (`setPricingReport`, `arcAlert`, progress bar)
    For each function, classify as:
    - Safe as-is (uses captured projectId or explicit args)
    - Requires captured projectId/panelId (currently uses closure but correctly scoped)
    - UI-only, should be suppressed in background mode (React state setters, modals)
    - Unsafe in background mode (references active project or module-scope mutable state)
    - Requires future hardening
    Core rule: no background-completion function should use the currently active project to
    determine where data is saved, synced, or applied.
    Preliminary assessment from C17 analysis (2026-06-03):
    - Items 1-6: safe as-is (explicit projectId args or closure-captured, module-scope BC functions)
    - Item 7: safe (runs inside `runExtractionTask` before `onDone`)
    - Item 8: UI-only, no-op on unmounted component (harmless)
    - Item 9: UNSAFE — `_autoAssignTriggerSetter` is module-scope, can fire on wrong project after
      600ms timeout. Needs `background` flag guard.
    - Item 10: safe — Firestore listener subscribes on mount, gets latest data including pricing
    - Item 11: safe — `_bgTasks` is module-scope but keyed by panelId, used for UI badge only
    - Item 12: UI-only, no-ops on unmounted component (cosmetic React warnings)
    Related: #86 (contamination root cause), #88 (broader async ownership audit), #89 (pricing fix).
    See C17 in COACH.md for detailed analysis.
    Discovered: 2026-06-03 (follow-up from #89 investigation).
    Owner for investigation: Coach.

92. **OPEN** (HIGH) — Background task UI ownership audit: background operations must never seize
    foreground UI control.
    Observed during v1.20.89 testing: background extraction/project updates appear capable of
    pulling the user into another project, screen, panel, or required-input workflow when
    milestones are reached or user attention is requested.
    Core rule: the active user workflow always owns the foreground UI. Background operations may
    request attention but may not seize control.
    Allowed (passive, non-disruptive):
    - Task chip updates (`_bgTasks` status/progress)
    - Notifications (bell badge, Pushover)
    - Badges (amber pills, red dots)
    - Passive status indicators (progress bars within the originating panel's chip)
    - Action-center items (queued for user to act on when ready)
    Not allowed (foreground-seizing):
    - Route changes (navigating to a different project/view)
    - Project switches (changing `openProject` from a background callback)
    - Panel switches (changing `selectedPanelId` from a background callback)
    - Modal opens (`arcAlert`, `arcConfirm`, pricing report, auto-assign, EQ modal)
    - Focus changes (scrolling to a panel, highlighting a row)
    - Screen navigation (switching from dashboard to project view)
    - Required-input interruptions (dialogs that block until user responds)
    Audit scope — identify every path capable of changing foreground UI state from a background
    project's completion handler:
    1.  Extraction completion (`onDone` → modals, EQ modal, auto-assign)
    2.  Re-extraction completion (`reExtractWithFeedback` → same completion chain as extraction)
    3.  Pricing completion (`runPricingOnPanel` → pricing report modal, auto-assign trigger)
    4.  BC sync (`bcSyncPanelPlanningLines` → error modals, posting group fix alerts)
    5.  Imports (supplier portal apply → modal opens, navigation)
    6.  AI jobs (validation completion → status changes that trigger re-renders)
    7.  Task completions (`bgDone` → chip updates are OK, but check for side effects)
    8.  Validation requests (panel validation → status updates, potential modal triggers)
    9.  Required-input requests (EQ modal, confidence review, budgetary enforcement)
    10. Notifications (`onSupplierQuoteSubmitted` listener → auto-navigate to project on click)
    For each path, classify as:
    - Passive (chip/badge/notification) — allowed, no change needed
    - Foreground-seizing — must be suppressed or deferred when the originating project is not active
    - Conditional — safe when originating project is active, must be suppressed otherwise
    Implementation pattern: before any modal open, route change, or focus action, check
    `_currentProjectId === originatingProjectId`. If mismatch, queue the action as a notification
    or deferred item instead of executing it immediately.
    This is an architectural hardening item — not a single bug fix. The goal is to establish and
    enforce the rule that background operations never own the foreground.
    Related: #86 (contamination), #89 (background pricing), #91 (background workflow audit).
    Discovered: 2026-06-03 (v1.20.89 testing — background task pulled user into wrong context).
    Owner for investigation: Coach.

93. **OPEN** (MEDIUM) — Extraction pipeline consolidation: shared completion handler for all three
    extraction paths. Currently `confirmAndExtract`, Re-Extract Drawings, and `reExtractWithFeedback`
    each have their own `onDone` callback with independently implemented guards, background pricing,
    and BC sync logic. The #86/#89 fixes were applied to each path separately — same pattern, three
    copies.
    Recommended: extract a shared `onExtractionComplete(finalPanel, {extractionProjectId, ...})`
    function that owns the project-switch guard, background pricing, BC sync, and UI suppression.
    Each entry point calls `runExtractionTask` with an `onDone` that delegates to the shared function.
    Per-path differences (validation after first extract, feedback merge) happen BEFORE `onDone`.
    Risk: MEDIUM — touches three code sites in a 46K-line file. Requires Coach review before merge.
    Do not start until #89 is validated and #92 audit is understood.
    Related: #86, #89, #91, #92. See C18 in COACH.md for architecture recommendation.
    Discovered: 2026-06-03 (C18 extraction architecture priority plan).
    Owner: Coach (design) → Marc (implement).

94. **RESOLVED** — v1.20.95 (2026-06-03). dataUrl-gating bug: BOM extraction silently skipped when pages lack dataUrl.
    `confirmAndExtract` (line 23353) and `runExtractionTask` (line 13512) filtered BOM pages on
    `p.dataUrl` — an ephemeral field stripped by every Firestore save. After a save-reload cycle
    (or component remount during the awaitingConfirm pause), BOM-typed pages with only `storageUrl`
    were silently excluded. The extraction task still completed (title block, layout, validation
    all succeed because they use `p.dataUrl||p.storageUrl`), so the user saw "clean completion"
    with zero BOM items and no error.
    Fix: Sites A (confirmAndExtract 23353) + B (runExtractionTask 13512) changed to
    `(p.dataUrl||p.storageUrl)`; Site B adds `ensureDataUrl` after filter. Site C (zoom
    detection 23242) CARVED OUT — needs `ensureDataUrl` or a `detectZoomedPages` guard;
    tracked as #94a, Coach to design. Root cause PRJ402119 Line 1 (Noah 2026-06-03),
    confirmed Coach C23, Site C correction Freddy.
    94a. **OPEN** (LOW) — Site C follow-up: `detectZoomedPages` reads `pg.dataUrl` directly
         (line 12874) without `ensureDataUrl`. If storageUrl-only pages reach it, zoom detection
         fails silently. Needs either `ensureDataUrl` hydration before the call, or an internal
         guard in `detectZoomedPages`. Low-risk: Site C runs during `addFiles` when pages normally
         have `dataUrl`, but the inconsistency should be fixed for robustness.
    Discovered: 2026-06-03 (PRJ402119 Line 1 empty-BOM trace, Coach C23).
    Owner: Coach (C23) → Marc (implemented A+B).

95. **OPEN** (HIGH) — PRJ402119 Line 1 PN accuracy: ground truth SETTLED (2026-06-04).
    Marc read the drawing via browser. Score: **7/13 correct (54%), 6/13 wrong (46%).**

    **CONFIRMED ERRORS (against authoritative drawing):**
    - Item 3: 3038338 → 3036038 (8→6 at pos 4, 3→0 at pos 5)
    - Item 5: 3214314 → 3214014 (3→0 at pos 5)
    - Item 7: 0807012 → 0907012 (8→9 at pos 2)
    - Item 8: TYD15X3WPW6 → MPWS (wholesale misread + slash-split pipeline bug, fixed in #97)
    - Item 8 cover: TYD2CW6 → TYD2CWS (6→S)
    - Item 12: LNM25BPK100 → LNMQ3RP-100 (restructured: 25B→Q3R)
    - Item 13: LNM40BPK100 → LNMQ8RP-100 (restructured: 40B→Q8R)
    **CONFIRMED CORRECT:** Items 1,2,4,6,9,10,11. Item 10 SECM25G confirmed correct (Freddy was right).
    Error classes: digit substitution (items 3,5,7) + structural misread (items 8,12,13) on pdf-native.

    Prior "CONTESTED" items resolved — all originally disputed items now scored.
    - Item 10: Marc scored SECM25G as WRONG vs source "SECME5G" — but description says
      "M25 gray" and Hubbell M25 = SECM25G. Extracted value is LIKELY CORRECT; Marc's source
      transcription was the error. The Claudes are misreading the drawing at ~the rate they
      attribute to the model.
    - Item 7: read 3 different ways by 3 sources.

    **ACTION REQUIRED:** Authoritative ground-truth PN list from Jon/engineering source BEFORE
    scoring. Without it, error rates are meaningless.

    **Two hypotheses (both OPEN — neither verified):**
    1. PATH/IMAGE FIDELITY: digit-substitution errors (3→0, 2→3, 6→S) are the signature of a
       VISION model reading a RENDERED IMAGE, not a text layer — text extraction is lossless or
       fails, it doesn't swap digits. The #94 fix routes via storageUrl→ensureDataUrl; if that
       image is lower-res than the addFiles render, it directly explains the digit class. Marc
       asserted "PDF-native vector text" — that assertion needs verification (confirm what the
       model actually receives: text layer vs rendered image vs JPEG crop, at what resolution).
    2. ARC CROSS / AUTO-REPLACE: the structural errors (MPWS, LNMQ#RP-100) may be raw model
       output OR a downstream "known-equivalent" swap (C5 class). Raw model output has NOT been
       inspected — only final UI rows.

    **Next-session trace (Marc, evidence-first, do NOT design fix):**
    a) Confirm the actual image/text the model receives for Line 1's BOM page + resolution.
    b) ONE structural failing PN (start Item 8 / MPWS) end-to-end: raw model output → parsed
       → normalization → ARC Cross/auto-replace → BC lookup → final UI. The right-description/
       wrong-PN signature is the sharpest discriminator between vision error and auto-replace.

    Related: #94 (inclusion fix that changed image source), #84 (same project, truncation/
    companion symptoms NOT reproduced), #85 (Excel cross-check), C5 (auto-cross corruption).
    Discovered: 2026-06-03 (PRJ402119 Line 1 post-#94 validation). Corrected same day after
    Marc's source comparison revealed ground-truth disputes.

96. **OPEN** (IDEA) — Windows facilitator app for three-role Claude workflow.
    Currently Jon manually copy-pastes messages between CCD (Marc), Terminal (Coach), and
    Claude.ai (Freddy). A lightweight Windows desktop app could automate or streamline this
    relay — clipboard monitoring, paste routing, session status dashboard, maybe direct API
    integration for the Claude.ai leg. Would eliminate the primary bottleneck in the
    three-role workflow.
    Discovered: 2026-06-03 (Jon idea during close out).

85. **OPEN** (HIGH) — BC validation cannot disambiguate all misreads — need Excel cross-check.
    On PRJ402119, both 3036338 and 3038338 are valid Phoenix Contact SKUs in BC. A misread
    that lands on ANOTHER valid PN is invisible to BC lookup validation — only the source
    drawing (or the customer's Excel/spreadsheet BOM) can disambiguate. This is the strongest
    case for the Excel cross-check workflow on Ovivo: the spreadsheet contains unambiguous
    typed part numbers, no glyph-reading required. For customers who provide Excel BOMs
    alongside drawings, cross-check extracted PNs against the spreadsheet and flag mismatches.
    Discovered: PRJ402119 diagnostic — Jon confirmed both candidate PNs resolve in BC (2026-06-02).

## Round 18 (extraction pipeline audit, 2026-06-04)

97. **RESOLVED** — `5f3a0b21` (v1.20.96, deployed 2026-06-04) — Slash-split × positional-dedup
    destructive interaction. The slash-split code at L11643 split compound PNs at "/" into sibling
    rows sharing identical Y coordinates. Positional dedup then merged these siblings, systematically
    dropping the MAIN part number (segment 0) because the sub-part's description was longer
    (due to appended "(sub-part from above)" text). Deterministic on every compound PN with "/".
    Proven on PRJ402119 Item 8: drawing shows "TYD15X3WPW6" (no slash), model fabricated a "/"
    in its output, slash-split created two rows, positional dedup destroyed the main PN.
    Fix: deleted the slash-split block entirely. Companion splitting is handled safely by
    `splitCompanionParts` via the structured `additionalPartNumbers` array. Also plumbed
    positional-dedup merge reporting into all 3 extraction paths.

98. **OPEN** (HIGH) — Foundational extraction accuracy audit (Step Zero instrumentation shipped).
    Raw model output persistence (v1.20.98-99): `rawModelOutput` captured on all extraction paths,
    stored in `extractionReport.perPageOutcomes`. Stage J (`resolveInternalPartNumbers`) now returns
    `{bom, resolvedLog}` persisted as `internalPnResolutions`. Stage R (BC pricing PN substitution)
    logged via `logDebugEntry` to Debug Logs. Stages M/N/O already had `learnedCorrectionsLog`.
    Full attribution chain: raw output → correction log → final BOM. Any discrepancy explained.
    BLOCKED on ground-truth measurement (BC match is circular). Next: Q3 text-layer measurement
    on D2 sample (PRJ402113, 402100, 402101, 402076, 402092).
    Discovered: 2026-06-04 session — #98 evidence pull showed ARC Cross coverage as primary
    differentiator between good/bad extractions.

99. **OPEN** (HIGH) — Model partial-read on long single-column BOMs.
    PRJ402114 (47-item BOM, single column, single page): model returned ONLY items 26-47.
    rawModelOutput confirms first item = itemNo:"26", stopReason = "end_turn" (not truncation).
    Ruled out: page-scoping (1 BOM page processed, correct), crop-cutoff (full table within crop
    at x=0.47 y=0.03 w=0.51 h=0.81). The model simply stopped reading partway through the table.
    This is a COMPLETENESS failure distinct from ACCURACY (#95). BC match % can be 100% on a BOM
    missing half its rows — the "good bucket" from #98 evidence pull is compromised.
    The re-extraction path lacks L3 retry/gap-fill (initial path only, L13680-13808). This is the
    root cause of differential completeness between initial and re-extraction.
    Discovered: 2026-06-04 — C28 validation + #99 diagnostic.

100. **OPEN** (MEDIUM) — Completeness guarantee: permanent fix requires text-layer row counting.
     Interim shipped (v1.20.100-101): warn-only completeness flag. PART A: extractionVerification
     (was discarded per C15) now captured on re-extract + feedback paths; completenessWarning flag
     computed and stored. PART B: missing-from-END detection added to `_parseAndVerifyBomRaw`.
     UI: ScanResultsBanner wired into BOM table (was dead code since written), completenessWarning
     rendered as top concern with critical orange styling.
     VALIDATED: fires on PRJ402114 (items 1-25 missing), silent on complete BOMs, warn-only framing.
     SCOPE LIMIT: detects missing-from-start + interior gaps. Clean bottom-truncation (1-22 of 47,
     no gap) NOT detectable by continuity — requires text-layer row count (Pillar 1a, gated on Q3).
     Permanent fix: two pillars — (1) independent row-count expectation via text-layer parsing,
     (2) deterministic targeted recovery (L3 on all paths) + loud flag if unclosable.
     Discovered: 2026-06-04 — Coach C29 supplement + Freddy Brief.

101. **OPEN** (HIGH, future milestone) — Estimator's-Eye Cross-Check Workflow — full multi-region
     quoting intelligence. Encodes a 30-year estimator's cross-check process: customer identification
     drives structural fingerprinting, layout/enclosure scan for buildability and high-cost flags,
     schematic scan for wire integrity and cost-tie, then BOM outlier analysis against all three
     region types. Depends on Layout/Enclosure/Schematic regions maturing beyond primal state and
     on near-term extraction-accuracy foundation being solid. NOT current scope — resurface when
     BOM extraction is stable and non-BOM regions are ready to graduate.
     See `ARC-VISION-ESTIMATOR-REVIEW.md`.
     Captured: 2026-06-05, from Jon.

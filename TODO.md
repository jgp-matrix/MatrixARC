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

18. **OPEN — HIGH PRIORITY (production code path, near-miss during 2026-05-07 deploy)** —
    Two Cloud Functions in production have no local source. One (`extractBomPage`) is on
    the active BOM extraction path — pressing Y at firebase's deletion prompt would have
    broken production today.

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

# BC-Reliability Plan (B021 · B013 · B016) — Freddy synthesis

> **Author:** Freddy (synthesizing away-mode subagent lanes) · **Date:** 2026-07-11 · **Mode:** headless away-mode fleet (read-only scoping → build-ready plans).
> **Status:** SCOPING COMPLETE (both lanes done). B021 = BUILD-READY (pending Jon sign-off + Coach review + headless tests). B013/B016 = build-ready design, PR + Jon sign-off gated for the money-path parts. 3 CRITICAL design questions for Jon at the tail (build-time, not blocking). Recommended build order: B021 → B013-1 → B013-2/3 → B016-1 → B016-2/3.
> **Theme:** all three touch the one BC-call choke point (`bcGatedFetch`). Changes are factored there once (single-source-of-truth), not per-site.

---

## B021 — `bcGatedFetch` timeout/abort + guaranteed semaphore release

### Problem (confirmed by code trace)
`bcGatedFetch` (`src/app.jsx:419-454`) has **no timeout and no AbortController**. Its three `_bcRelease()` sites (440/445/452) all sit on paths that require the fetch to *settle*. A hung fetch (connection opens, never responds) `await`s forever → its `_bcSemaphore` slot (def `:414`, `max:6`) is never returned → once ≥6 hung calls accumulate, the gate `while(_bcSemaphore.inflight>=_bcSemaphore.max)` (`:432-434`) blocks **every** subsequent BC call permanently (total BC deadlock). Combined with `runPricingBackground` (`:15193`) awaiting a chain of BC calls while the progress bar is pinned at 95% (`:15173`), a single hang **freezes that panel's pricing at 95% forever.**

**Signal usage today:** no `bcGatedFetch` caller passes `options.signal` (~150 sites checked); the signal-aware helpers (`:4219/5402/5440/5807/9866`) use raw `fetch` and bypass the semaphore. So caller-signal composition is defensive/forward-looking but cheap and correct to include.

### Fix (diff-ready) — replace `src/app.jsx:419-454`
Add the named const beside the semaphore (above `:414`):
```js
// B021 — hard ceiling on any single BC round-trip. A hung connection (opens, never
// responds) would otherwise await forever, pinning a semaphore slot and eventually
// deadlocking the whole BC surface + freezing background pricing at 95%.
const _BC_FETCH_TIMEOUT_MS=45000; // 45s   (see Open Decisions: value + const-vs-let)
```
Replace the whole function (429 recursion → `while(true)` loop so the release lives in one `finally`, and the retry cleanly re-acquires a fresh slot — preserving the original release-before-sleep property):
```js
async function bcGatedFetch(url,options){
  {
    const _m=((options&&options.method)||"GET").toUpperCase();
    if(IS_TEST_ENV&&_m!=="GET"&&_m!=="HEAD"&&!_BC_SANDBOX_ENVS.some(e=>String(url).includes(e))){
      console.warn("[TEST-ENV] BC write suppressed (non-sandbox target):",_m,url);
      return new Response('{"_testEnvBlocked":true}',{status:200,headers:{"Content-Type":"application/json"}});
    }
  }
  const callerSignal=options&&options.signal;
  let depth=(options&&options._bcRetryDepth)||0;
  while(true){
    while(_bcSemaphore.inflight>=_bcSemaphore.max){
      await new Promise(r=>_bcSemaphore.queue.push(r));
    }
    _bcSemaphore.inflight++;
    const timeoutCtrl=new AbortController();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;timeoutCtrl.abort();},_BC_FETCH_TIMEOUT_MS);
    let onCallerAbort=null;
    if(callerSignal){
      if(callerSignal.aborted){timeoutCtrl.abort();}
      else{onCallerAbort=()=>timeoutCtrl.abort();callerSignal.addEventListener("abort",onCallerAbort);}
    }
    let r=null,fetchErr=null;
    try{
      r=await fetch(url,{...options,signal:timeoutCtrl.signal});
    }catch(e){
      fetchErr=e;
    }finally{
      clearTimeout(timer);
      if(onCallerAbort)callerSignal.removeEventListener("abort",onCallerAbort);
      _bcRelease(); // single guaranteed release: timeout-abort, network error, 429, or success all pass here exactly once
    }
    if(fetchErr){
      if(timedOut){
        const te=new Error(`bcGatedFetch: BC request timed out after ${_BC_FETCH_TIMEOUT_MS}ms: ${url}`);
        te.name="BcTimeoutError";te.isBcTimeout=true;throw te;
      }
      throw fetchErr; // caller abort or genuine network/DNS error — propagate as-is
    }
    if(r.status===429){
      if(depth>=3){console.warn("bcGatedFetch: 429 retry limit (3) reached, returning 429 response");return r;}
      depth++;
      const retryAfter=parseInt(r.headers.get("Retry-After")||"2",10);
      await new Promise(resolve=>setTimeout(resolve,Math.min(retryAfter,30)*1000));
      continue; // re-acquire a fresh slot (already released in finally)
    }
    return r;
  }
}
```

### Why it satisfies the requirements
- **Configurable timeout:** single named const `_BC_FETCH_TIMEOUT_MS`.
- **Always releases:** the `finally` runs on every attempt exit (timeout-abort, network error, 429, success) → slot always returned. Exactly **one** `_bcRelease()` now (vs three) → no double-release; each attempt is balanced 1:1 (`inflight++` per loop turn).
- **Composes with caller signal:** a local `timeoutCtrl` is handed to `fetch`; a listener forwards the caller's abort into it. Either source aborts; the caller's signal is never clobbered; listener removed in `finally` (no leak).
- **Clear catchable timeout:** throws `BcTimeoutError` (`isBcTimeout:true`). Pricing phases already wrap BC blocks in `try/catch` that log+proceed (`:15265`, `:15297`) → the phase advances to `saveProjectPanel` (`:15377`) + `bgDone` (`:15386`) and finishes at "✓ N priced" instead of freezing at 95%. **No change needed in `runPricingBackground`** — the fix restores its intended graceful degradation.

### Edge cases
- Caller-passed signal: none today; composition correct if adopted (already-aborted → immediate; later → forwarded). 
- `bgDone`/advance: timeout now throws → caught by existing per-phase catches → control reaches `bgDone`.
- Double-release: impossible (one release site).
- 429 semantics preserved: max-3 retries, `Retry-After` cap 30s, release-before-sleep intact.
- Alt considered: `AbortSignal.any([...])`+`AbortSignal.timeout()` (Chrome-only PWA — available) is terser; manual controller chosen for unambiguous timeout-vs-caller-abort classification (lower risk).

### Verification (no real hung BC endpoint needed)
- **Timeout + guaranteed release:** monkeypatch `global.fetch` to a never-resolving promise that rejects on `signal` abort; call `bcGatedFetch`; assert reject `err.isBcTimeout===true` and `_bcSemaphore.inflight===0` after.
- **Deadlock recovery:** fire `max+2` (8) hung calls, `Promise.allSettled`, assert `inflight===0` + `queue.length===0`, and a subsequent stubbed-200 call resolves promptly.
- **Caller-abort still an AbortError (not BcTimeout):** pass `{signal:ac.signal}`, `ac.abort()` mid-flight, assert plain `AbortError`, `isBcTimeout` falsy, inflight→0.
- **429 unaffected:** stub 429→200; assert retry+resolve; inflight→0.
- Test-timeout override: prefer changing `const`→`let _BC_FETCH_TIMEOUT_MS` so a test can shrink it (or fake timers). See Open Decisions.

### ⭐ Open decisions for Jon (build/deploy-time — NOT blocking now)
1. **Timeout value = 45s?** Comfortably above normal BC OData latency, but any BC op that *legitimately* exceeds 45s (large batch writes?) would now abort. Confirm 45s or set a per-call override for known-slow ops.
2. **`const` → `let` for `_BC_FETCH_TIMEOUT_MS`** to enable the fast headless test. Trivial, lower-risk; Jon's call.

### Verdict
**BUILD-READY but NOT safe to build cold / direct-to-master.** `bcGatedFetch` is the single choke point for ~150 BC call sites — money-path-adjacent = the HIGH-stakes lane. The fix is well-scoped + low-complexity, but the surface it governs earns the full cross-check: (1) Jon signs off on the 45s value + const→let; (2) Coach reviews release-accounting + timeout classification; (3) headless deadlock/timeout tests pass; (4) test-channel → prod per the save/BC protocol. Recommend building it when Jon is back / via the standing sessions, not unattended.

---

## Shared BC-call surface (as-is)
- **`bcGatedFetch` `:419-454`** — single BC OData/REST choke point: G005 test-env write-belt, 6-slot concurrency semaphore, **429-only** retry. Does **not** handle 401. (Release manual in 3 spots today → B021 converts to one `finally` + adds the timeout.)
- **`acquireBcToken(interactive)` `:1738-1781`** — MSAL silent→ssoSilent→(popup). `acquireBcToken(false)` = silent refresh = the auto-refresh lever; sets module-global `_bcToken`.
- Callers build their own `Authorization: Bearer ${_bcToken}` header → **a token refresh must also rewrite the header on retry** (in-flight callers won't pick up the new `_bcToken`).
- **Pill `:47805-47809`** renders off React `bcOnline` (`:46744`, seeded `!!_bcToken`), updated ONLY by mount + the **5-min health ping** (`:47157-47251`). No real per-call path feeds `bcOnline`.
- **Root of "green-but-dead":** the pill reflects "a token exists / last 5-min ping OK", not "calls succeed now." On mid-op expiry, every real call 401s for up to 5 min until the next ping. Andrew/Ryan get honest red (token drops cleanly → silent refresh fails → ping flips red); Jon's is a *degraded* token still in cache.

## B013 — Honest BC health + 401 recovery
**B013-1 — retry-on-401 + token auto-refresh, factored into `bcGatedFetch`** (`:419-454`): add a 401 branch mirroring the 429 branch — on 401 with budget left, `const t=await acquireBcToken(false)`; if a new token differs, rebuild `options.headers.Authorization` and recurse with a distinct `_bc401RetryDepth` (**max 1** re-auth). **Rely on B021's `finally` for release — add NO manual `_bcRelease()`** (the pre-B021 footgun). Idempotency: a 401 is pre-processing (BC never handled the body) so a single POST replay is safe; never loop.

**B013-2 — drive the pill off VALIDITY** (health ping `:47157-47251`; pill `:47805-47809`; `bcOnline` `:46744`): add module-level `_bcLast401At` set inside the 401 branch **when re-auth fails**, exposed via a tiny pub-sub `_bcHealthSubs` (mirror the existing `_bcQueueCountSetter`/`_bgListeners` pattern) so the toolbar flips `bcOnline=false` immediately on a real unrecovered 401 — closing the up-to-5-min blind window. Three states: **green** (probe OK) · **amber "Reconnecting…"** (401 seen, silent refresh in flight / transient 429·5xx) · **red "Offline — Click to connect"** (unrecovered 401 → click = `acquireBcToken(true)`, already wired). Only flip red once silent refresh has *already* failed (avoid over-eager red on a self-healing transient).

**B013-3 — fix the misleading 401 sync-modal** (modal `:28119-28175`, `parseBcError` `:28120-28130`, retry gate `:28161`; failed-row strings from `bcSyncPanelPlanningLines` `:3906-3918`): classify 401 FIRST in `parseBcError` ("BC session expired — reconnect and retry (items are valid)") so it wins over the "select an existing item"/posting-group branches; suppress the per-row "Fix in Item Browser" button for 401 rows (`:28147`, currently 429-only); show "Reconnect & Retry Sync" when **any** failure is 401 (`anyAuth`), not just all-429 (`allRateLimit` `:28131`) → on click `await acquireBcToken(true); syncPlanningLinesToBC()`; auth-dominated header → "⚠ BC Session Expired". **Robust preference:** stamp the HTTP status onto each failed row (`:3907/3917/3918`) so the modal branches on `status===401` deterministically instead of regexing the body.

## B016 — Silent mutation reverts under on-open churn
**Two independent defects (Coach C137, code-confirmed):** **M2** `saveProjectPanel` (`:9331`) re-reads the fresh doc but replaces the target panel **wholesale** (`:9426`) — the fresh read is used only for *other* panels + page/notes guards (`:9386-9416`); **BOM field edits on the target panel are taken verbatim from the passed-in snapshot, never merged** → a stale save reverts another writer's lead-time / Est-Prod-Done-date, or resurrects a deleted row. **M3** every mutation is fire-and-forget with an empty catch (`addBomRow :26656`, `deleteBomRow :26680`, `saveBomRow :26634`, lead-time flush `:26622`, reconciliation `:24911/24933`) → a background whole-panel save landing after an un-awaited user edit clobbers it, invisibly.

**On-open churn amplifiers (all whole-panel/doc writers):** project-level purchase-price check `:37160-37221` (**on open + every 30s**, all parts all panels — the 132-item fetch) · per-panel `pollBcPricing` `:24311-24353` (5-min, whole-panel save `:24344`) · auto-sync planning lines `:25473-25499` (3s debounce, 61 POST/PATCH) · sell-price auto-sync `:25506-25520` (2s debounce) · `bcPatchProgressBillingLine` `:5600-5643`.

**B016-1 — reduce churn (biggest lever, lowest risk):** kill the 30s repeat on the project price-check (`:37218`) → run once on open + only on a real part-set change (hash-guard like `bomSyncHash`); gate all on-open BC work behind visibility + first-interaction, skip when `_bcEnvMismatched(project)` (`:370`) and when the panel BOM hash is unchanged; coalesce the 2s sell-price patch with the 3s planning-line sync (planning-line sync already writes line 10000 `:3768` → the standalone progress-billing patch `:25515` is partially redundant on open); **seed `bcPrevSyncCount.current` from the persisted last-synced count on mount** so reopening an already-synced panel doesn't read as a `bcCount` increase (the on-open `runPricingOnPanel` re-flip of `priceSource:'bc'` is what falsely trips the sync today).

**B016-2 — row-level merge in the whole-doc save (the real M2 fix)** (`saveProjectPanel :9426`; sibling `saveProject :9007-9022`): before writing, merge the target panel's `bom` against the fresh server copy **by row `id`** (mirror the per-page `storageUrl`/notes merge `:9386-9416`) — **last-writer-by-timestamp on a whitelist** of protected fields (`leadTimeDays/Source/UpdatedAt`, `unitPrice`+`priceSource`+`priceDate`, `bcPoDate`, panel `productionEndDate`); needs a baseline/dirty signal (stamp `_lastEditedFields`/reuse `leadTimeUpdatedAt`). **Deletes:** only honor when the save carries an explicit `_deletedRowIds` marker (analogous to `window._deletedPanelIds :9333`); otherwise a server row absent from incoming = staleness → **preserve** (stops both "deletes don't stick" and "background save resurrects a deleted row"). **Money/data path → PR + Jon sign-off.**

**B016-3 — resilient mutations:** route user add/edit/delete through the existing **`safeSave` wrapper `:9231`** (2 retries + `_saveFailBanner`) instead of bare `try{onSaveImmediate}catch(e){}`; replace empty catches with a visible error path + `logDebugEntry`. Serialize user edits ahead of background churn: bg writers (`pollBcPricing`, auto-sync) must re-read `latestPanelRef.current` **inside** the per-project mutex (`:9336`) or express a targeted field-update intent rather than a whole-panel replace (`pollBcPricing` already double-reads `latestPanelRef` `:24317/24323` — extend + route through B016-2's field merge so it can never revert a user field). B016-2's per-field last-writer-wins makes a separate "edit in progress" flag unnecessary.

## Composition with B021
- **B021 owns `bcGatedFetch`'s core loop** (AbortController timeout + `finally` release). **B013-1 layers a 401 branch on top:** after B021's fetch resolves, relies on B021's `finally` for release (no manual release), uses its own `_bc401RetryDepth`, recursion acquires a fresh slot while B021's `finally` frees the outer one. **One coordination item:** confirm the `finally` fires before the 401-retry recursion (it does — recursion is `return`ed after the awaited refresh). No conflicting loop rewrite.
- **B013's health signal** (`_bcLast401At` + `_bcHealthSubs`) is new module state, orthogonal to B021.
- **B016 doesn't touch `bcGatedFetch`** (Firestore-save + churn scheduling) — but benefits from B021 (a timed-out call no longer starves the saves that then race). Purely additive.
- **Single-source-of-truth honored:** the only shared BC-call change (retry-on-401 + header rewrite) is factored into the one `bcGatedFetch`; per-site work (sync modal, health pill) just consumes the shared signal.

## Data-retention landmines (CLAUDE.md "Data Retention (CRITICAL)")
1. **B016-2 merge must never drop fields** — spread the server row first, apply only intended-changed fields; preserve ALL metadata (`isCrossed/crossedFrom/isCorrection/correctionType/priceSource/bcFuzzySuggestions/bomVerification/extractionFeedbackLog/cannotSupply/techReviewFlag*/leadTime*`). Additive + last-writer-wins on a whitelist, never a prune.
2. **Delete-merge must never wipe a `priceSource:"manual"|"bc"` or manually-edited row** (Data-Retention rule 6) — stale-absence preserves, not deletes.
3. `schemaVersion:APP_SCHEMA_VERSION` stays on every write (`:8996/9442`); no bump (no renames/removals). B013-3 + B016-1 = patch; B016-2's merge-semantics change = **minor**, PR-gated + backward-compat load test.
4. **B013's 401-replay of POST planning lines must not duplicate `ProjectPlanningLines`** — mitigated by 401=pre-processing + single-retry cap + the existing PATCH-if-exists incremental sync (`:3883`) self-healing.
5. **Strip only `dataUrl` on save** — B016-2 merge runs on the already-stripped panel (`:9221`); keep that ordering.

## Rollout & sequence
Land in order: **B021 (base) → B013-1 (401 retry) → B013-2/3 (health pill + modal) → B016-1 (churn) → B016-2/3 (save semantics, highest risk, last).** Test channel first — but the browser tool can't navigate `matrix-arc-test` → **verification is Jon-driven**; add a debug hook (`window._arcForceBc401=true` → next `bcGatedFetch` returns a synthetic 401) so Jon can validate the pill green→amber→green transition + the sync-modal re-auth affordance without waiting for a real expiry. B013-3 + B016-1 = low-risk patch after test confirm; **B013-1 + B016-2 touch the money/data path → PR + Jon sign-off** (Save/Extraction-path protocol) + backward-compat load test.

## ⭐ CRITICAL design questions for Jon (build-time; NOT blocking the scoping)
1. **B016-2 conflict policy:** for a field edited on two clients in the same window — **last-writer-wins-by-timestamp**, or **lease-aware** (the app now has the B012 editing-lease `editingBy`/`editingExpiresAt` `:9438` + Owner Priority Mode)? Determines whether the merge is timestamp- or lease-based. *(Note: with the B012 one-editor lock LIVE on prod, concurrent same-project field edits are already largely prevented — this may reduce to an edge-case policy.)*
2. **401 POST auto-replay:** approve auto-replaying a **single** failed planning-line POST after silent re-auth? (Near-zero dup risk — 401 is pre-processing — but it's a money-path write → explicit sign-off per protocol.)
3. **Owner-vs-member auth:** surface the per-member-API-key vs owner-token distinction (`diagnoseMemberApiKey`) when a 401 persists after refresh, to confirm whether Jon's degraded-token case is member-key-specific? Diagnostic scope — include in this build or spin a separate probe?

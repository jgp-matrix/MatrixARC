# BC-Reliability Plan (B021 · B013 · B016) — Freddy synthesis

> **Author:** Freddy (synthesizing away-mode subagent lanes) · **Date:** 2026-07-11 · **Mode:** headless away-mode fleet (read-only scoping → build-ready plans).
> **Status:** B021 = BUILD-READY (pending Jon sign-off + Coach review + headless tests — see §Verdict). B013/B016 = Lane 2 still running; section appended on completion.
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

## B013 + B016 — (Lane 2 running; section appended on completion)

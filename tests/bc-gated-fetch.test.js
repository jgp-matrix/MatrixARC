// B021 — bcGatedFetch timeout / guaranteed-release harness test.
//
// OPTION (b): This harness MIRRORS (does NOT import) the bcGatedFetch implementation
// from src/app.jsx. A true in-place unit test is impractical: src/app.jsx is a ~3.3MB
// browser JSX bundle with no module exports, and bcGatedFetch closes over module-scoped
// _bcSemaphore / _bcRelease / fetch / IS_TEST_ENV / _BC_SANDBOX_ENVS. Importing it into
// Node would require executing the whole app (React/DOM/Firebase globals) or refactoring
// app.jsx to add exports — explicitly out of scope (fix > testability).
//
// The function body below is a VERBATIM copy of the B021 bcGatedFetch in src/app.jsx
// (lines ~419-471). If you change the impl in app.jsx, mirror the change here.
// Run: node tests/bc-gated-fetch.test.js   (Node 18+; uses global fetch/Response/AbortController)

"use strict";

// ── Mirrored module-scoped state (matches src/app.jsx :350, :414-418) ──
const IS_TEST_ENV = false; // prod-equivalent: G005 write-belt is a no-op here
const _BC_SANDBOX_ENVS = ["MATR_SndBx_01152026"];
let _BC_FETCH_TIMEOUT_MS = 45000; // mutable (locked `let`) so tests can shrink it
const _bcSemaphore = { inflight: 0, max: 6, queue: [] };
function _bcRelease() {
  _bcSemaphore.inflight--;
  if (_bcSemaphore.queue.length) _bcSemaphore.queue.shift()();
}

// ── VERBATIM MIRROR of src/app.jsx bcGatedFetch (B021) ──
async function bcGatedFetch(url, options) {
  {
    const _m = ((options && options.method) || "GET").toUpperCase();
    if (IS_TEST_ENV && _m !== "GET" && _m !== "HEAD" && !_BC_SANDBOX_ENVS.some(e => String(url).includes(e))) {
      console.warn("[TEST-ENV] BC write suppressed (non-sandbox target):", _m, url);
      return new Response('{"_testEnvBlocked":true}', { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }
  const callerSignal = options && options.signal;
  let depth = (options && options._bcRetryDepth) || 0;
  while (true) {
    while (_bcSemaphore.inflight >= _bcSemaphore.max) {
      await new Promise(r => _bcSemaphore.queue.push(r));
    }
    _bcSemaphore.inflight++;
    const timeoutCtrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; timeoutCtrl.abort(); }, _BC_FETCH_TIMEOUT_MS);
    let onCallerAbort = null;
    if (callerSignal) {
      if (callerSignal.aborted) { timeoutCtrl.abort(); }
      else { onCallerAbort = () => timeoutCtrl.abort(); callerSignal.addEventListener("abort", onCallerAbort); }
    }
    let r = null, fetchErr = null;
    try {
      r = await fetch(url, { ...options, signal: timeoutCtrl.signal });
    } catch (e) {
      fetchErr = e;
    } finally {
      clearTimeout(timer);
      if (onCallerAbort) callerSignal.removeEventListener("abort", onCallerAbort);
      _bcRelease();
    }
    if (fetchErr) {
      if (timedOut) {
        const te = new Error(`bcGatedFetch: BC request timed out after ${_BC_FETCH_TIMEOUT_MS}ms: ${url}`);
        te.name = "BcTimeoutError"; te.isBcTimeout = true; throw te;
      }
      throw fetchErr;
    }
    if (r.status === 429) {
      if (depth >= 3) { console.warn("bcGatedFetch: 429 retry limit (3) reached, returning 429 response"); return r; }
      depth++;
      const retryAfter = parseInt(r.headers.get("Retry-After") || "2", 10);
      await new Promise(resolve => setTimeout(resolve, Math.min(retryAfter, 30) * 1000));
      continue;
    }
    return r;
  }
}

// ── Test scaffolding ──
const _realFetch = global.fetch;
let _passed = 0, _failed = 0;
function ok(cond, label) {
  if (cond) { _passed++; console.log("  PASS:", label); }
  else { _failed++; console.error("  FAIL:", label); }
}
function reset() {
  _bcSemaphore.inflight = 0; _bcSemaphore.queue.length = 0; _BC_FETCH_TIMEOUT_MS = 45000;
}

// A fetch that never resolves on its own but rejects (AbortError) when its signal aborts.
function hangingFetch(url, opts) {
  return new Promise((resolve, reject) => {
    const s = opts && opts.signal;
    const rej = () => { const e = new Error("The operation was aborted."); e.name = "AbortError"; reject(e); };
    if (s) {
      if (s.aborted) return rej();
      s.addEventListener("abort", rej);
    }
    // otherwise: hang forever
  });
}

async function test1_timeoutFiresAndReleases() {
  console.log("Case 1 — timeout fires → BcTimeoutError + slot released");
  reset();
  _BC_FETCH_TIMEOUT_MS = 50;
  global.fetch = hangingFetch;
  let threw = null;
  try { await bcGatedFetch("https://bc.example/hang"); }
  catch (e) { threw = e; }
  ok(threw && threw.isBcTimeout === true, "throws err.isBcTimeout === true");
  ok(threw && threw.name === "BcTimeoutError", "error name is BcTimeoutError");
  ok(_bcSemaphore.inflight === 0, "inflight === 0 after timeout");
}

async function test2_deadlockRecovery() {
  console.log("Case 2 — fire max+2 (8) hung calls → gate fully drains");
  reset();
  _BC_FETCH_TIMEOUT_MS = 50;
  global.fetch = hangingFetch;
  const calls = [];
  for (let i = 0; i < _bcSemaphore.max + 2; i++) calls.push(bcGatedFetch("https://bc.example/hang" + i));
  const settled = await Promise.allSettled(calls);
  ok(settled.every(s => s.status === "rejected" && s.reason && s.reason.isBcTimeout), "all 8 rejected as BcTimeout");
  ok(_bcSemaphore.inflight === 0, "inflight === 0 after drain");
  ok(_bcSemaphore.queue.length === 0, "queue.length === 0 after drain");
  // subsequent 200 call resolves promptly (gate not deadlocked)
  global.fetch = () => Promise.resolve(new Response("{}", { status: 200 }));
  const r = await bcGatedFetch("https://bc.example/ok");
  ok(r && r.status === 200, "subsequent call resolves 200 (no residual deadlock)");
  ok(_bcSemaphore.inflight === 0, "inflight === 0 after subsequent call");
}

async function test3_callerAbortIsAbortError() {
  console.log("Case 3 — caller abort → plain AbortError (NOT BcTimeout)");
  reset();
  _BC_FETCH_TIMEOUT_MS = 10000; // high, so caller abort wins the race
  global.fetch = hangingFetch;
  const ac = new AbortController();
  const p = bcGatedFetch("https://bc.example/hang", { signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  let threw = null;
  try { await p; } catch (e) { threw = e; }
  ok(threw && threw.name === "AbortError", "throws AbortError");
  ok(threw && !threw.isBcTimeout, "isBcTimeout is falsy (not misclassified)");
  ok(_bcSemaphore.inflight === 0, "inflight === 0 after caller abort");
}

async function test4_429Retry() {
  console.log("Case 4 — 429 then 200 → retries + resolves");
  reset();
  let n = 0;
  global.fetch = (url, opts) => {
    n++;
    if (n === 1) return Promise.resolve(new Response("", { status: 429, headers: { "Retry-After": "0" } }));
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const r = await bcGatedFetch("https://bc.example/rl");
  ok(n === 2, "fetch called twice (one retry)");
  ok(r && r.status === 200, "final response is 200");
  ok(_bcSemaphore.inflight === 0, "inflight === 0 after 429 retry");
}

(async () => {
  try {
    await test1_timeoutFiresAndReleases();
    await test2_deadlockRecovery();
    await test3_callerAbortIsAbortError();
    await test4_429Retry();
  } catch (e) {
    console.error("HARNESS ERROR:", e);
    _failed++;
  } finally {
    global.fetch = _realFetch;
  }
  console.log(`\nB021 harness: ${_passed} passed, ${_failed} failed.`);
  process.exit(_failed === 0 ? 0 : 1);
})();

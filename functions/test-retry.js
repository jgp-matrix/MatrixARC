// B080 — unit tests for anthropicFetchWithRetry / sleepBackoff.
// No deploy, no real API — global.fetch is stubbed BEFORE requiring index.js.
// Run: node functions/test-retry.js   (exit 0 = all pass, 1 = any fail)

process.env.ARC_TEST_EXPORTS = '1'; // opt-in export hook in index.js (deploy never sets this)

// ── fetch stub plumbing (installed before requiring index.js) ────────────────
let _fetchQueue = [];
let _fetchCalls = 0;
function fakeResponse({ status = 200, retryAfter = null, bodyObj = {} }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n) => (String(n).toLowerCase() === 'retry-after' ? retryAfter : null) },
    json: async () => bodyObj,
    text: async () => JSON.stringify(bodyObj),
  };
}
global.fetch = async () => {
  _fetchCalls++;
  const next = _fetchQueue.shift();
  if (next === undefined) throw new Error('fetch stub: queue empty (unexpected extra call)');
  if (next instanceof Error) throw next; // simulate a network throw
  return fakeResponse(next);
};

// Requiring index.js is load-side-effect-safe (same as tools/preflight-functions.sh).
const { anthropicFetchWithRetry, sleepBackoff } = require('./index.js');

const _origRandom = Math.random;
let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  const FAR = () => Date.now() + 300000; // ample budget — deadline never blocks

  // (a) 429(retry-after:1) -> 529 -> 200 : returns 200 in 3 calls, honoring the 1s delay
  console.log('Case (a): 429(retry-after:1) -> 529 -> 200');
  Math.random = () => 0; // kill jitter so only the 1s Retry-After contributes
  _fetchQueue = [
    { status: 429, retryAfter: '1' },
    { status: 529 },
    { status: 200, bodyObj: { ok: true } },
  ];
  _fetchCalls = 0;
  let t0 = Date.now();
  let r = await anthropicFetchWithRetry({ model: 'x' }, 'k', { deadlineMs: FAR(), label: 'test-a' });
  let elapsed = Date.now() - t0;
  check('(a) returns 200', r.status === 200, `got ${r && r.status}`);
  check('(a) exactly 3 fetch calls', _fetchCalls === 3, `got ${_fetchCalls}`);
  check('(a) honored ~1s Retry-After', elapsed >= 950 && elapsed < 2500, `elapsed ${elapsed}ms`);
  Math.random = _origRandom;

  // (b) 400 -> 1 call, no retry (non-retryable)
  console.log('Case (b): 400 (non-retryable)');
  _fetchQueue = [{ status: 400, bodyObj: { error: { message: 'bad request' } } }];
  _fetchCalls = 0;
  r = await anthropicFetchWithRetry({ model: 'x' }, 'k', { deadlineMs: FAR(), label: 'test-b' });
  check('(b) returns 400', r.status === 400, `got ${r && r.status}`);
  check('(b) exactly 1 fetch call (no retry)', _fetchCalls === 1, `got ${_fetchCalls}`);

  // (c) 500 x4 -> returns final 500 after MAX_ATTEMPTS(4)
  console.log('Case (c): 500 x4 (retries exhausted)');
  Math.random = () => 0; // jitter -> 0ms so the case runs fast
  _fetchQueue = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }];
  _fetchCalls = 0;
  r = await anthropicFetchWithRetry({ model: 'x' }, 'k', { deadlineMs: FAR(), label: 'test-c' });
  check('(c) returns final 500', r.status === 500, `got ${r && r.status}`);
  check('(c) exactly 4 fetch calls (MAX_ATTEMPTS)', _fetchCalls === 4, `got ${_fetchCalls}`);
  Math.random = _origRandom;

  // (d) near-now deadline -> sleepBackoff refuses, no sleep, failing response surfaced
  console.log('Case (d): near-now deadline (budget guard)');
  _fetchQueue = [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }];
  _fetchCalls = 0;
  t0 = Date.now();
  // 6s budget: attempt 1 can start (6000-5000>0), but any retry sleep would land
  // within 15s of the deadline -> sleepBackoff returns false -> surface the 500.
  r = await anthropicFetchWithRetry({ model: 'x' }, 'k', { deadlineMs: Date.now() + 6000, label: 'test-d' });
  elapsed = Date.now() - t0;
  check('(d) surfaced failing 500 (no retry into kill)', r && r.status === 500, `got ${r && r.status}`);
  check('(d) exactly 1 fetch call (retry refused)', _fetchCalls === 1, `got ${_fetchCalls}`);
  check('(d) did NOT sleep before surfacing', elapsed < 500, `elapsed ${elapsed}ms`);

  // (d2) sleepBackoff guard, direct: returns false + sleeps nothing near the deadline
  console.log('Case (d2): sleepBackoff guard, direct');
  t0 = Date.now();
  const slept = await sleepBackoff(1000, Date.now() + 100); // 100 < 1000+15000 -> refuse
  elapsed = Date.now() - t0;
  check('(d2) sleepBackoff returns false near deadline', slept === false, `got ${slept}`);
  check('(d2) sleepBackoff did not sleep', elapsed < 100, `elapsed ${elapsed}ms`);
  // sanity: sleepBackoff DOES sleep + returns true when budget allows
  t0 = Date.now();
  const slept2 = await sleepBackoff(50, Date.now() + 300000);
  elapsed = Date.now() - t0;
  check('(d2) sleepBackoff sleeps when budget allows', slept2 === true && elapsed >= 45, `slept=${slept2} elapsed=${elapsed}ms`);

  console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('test-retry harness error:', e);
  process.exit(1);
});

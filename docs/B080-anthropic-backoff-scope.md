# B080 — Anthropic scaling hardening (429/backoff + retry) — build plan

Coach scope, 2026-08-03. Goal (Jon-corrected): NOT a user cap — make the system **scale gracefully**. Today a rate-limited (429) extraction request **fails silently, no retry**; under concurrent load some pages just don't extract. Fix = retry-with-backoff so throttled requests succeed (slower under peak, never broken). All line refs `functions/index.js`.

## Root cause (confirmed)
No retry/backoff on ANY Anthropic call in functions/. Current non-200:
- `extractBomPage` (3748-3752): throws `internal`, no retry → page fails.
- `extractBomBatch` per-page worker (3969-3974): `results[i]={error}`, `continue` — no retry; batch "succeeds" with a buried failed page.
- `extractSupplierQuotePricing` (2387,2396-2409): 404-only model-fallback; any 429/5xx throws immediately.
- `monitorAnthropicModels` (4029): probe only — leave.

**Key reframe:** extraction uses `resolveAnthropicKey(uid)` (77-89) → **company key** (`companies/{cid}/config/api`) preferred, **user key** fallback (already exists). Env `ANTHROPIC_API_KEY` (42) is monitor-only. So the ceiling = one company key = one org rate-limit pool (5 instances × CONCURRENCY 4 = up to 20 concurrent Opus calls @ max_tokens 64000). Per-user keys are NOT new infra — org policy question (see §Ceiling).

**Latent bug found (fix same pass):** 3964 — batch network-timeout catch calls `pageResults.push(...)` but the var is `results` (indexed by `i`). Throws ReferenceError → dead timeout branch. Fix to `results[i]={pageNumber,error}`.

## Fix — deadline-aware retry wrapper
Add `anthropicFetchWithRetry(bodyObj, apiKey, {deadlineMs, extraHeaders, label})` near `_anthropicAgent` (15). MAX_ATTEMPTS=4, BASE 1s, CAP 20s, **full jitter**, honor `Retry-After`. RETRYABLE={429,500,502,503,504,529, network throw}; NON-retryable={400,401,403,404,413, our AbortError}. Per-attempt abort = `min(remaining−5s, 520s)`; `sleepBackoff` refuses to sleep if `now+delay+15s > deadlineMs` (**never retry into the 540s function kill** — the critical guard). On retries-exhausted / non-retryable: return the response so the caller's existing `!ok` handler fires.

Wire-in (compute `deadlineMs` at each fn entry):
- `extractBomPage` (3720-3752): `deadlineMs=Date.now()+510000`; route the fetch through the wrapper (keep `anthropic-beta: interleaved-thinking-2025-05-14` header); keep the existing `!ok` throw as terminal.
- `extractBomBatch` (3941-3974): compute `deadlineMs` **once at fn entry** (shared across the 4 concurrent workers), pass to each per-page call. **Fix the 3964 `pageResults`→`results[i]` bug here.**
- `extractSupplierQuotePricing` (2359-2409): wrap each model attempt's fetch (keep the 404 model-fallback loop); timeout is **120s** → `deadlineMs=Date.now()+110000`.

## Concurrency pacing
Backoff + full jitter is sufficient (jitter = the anti-thundering-herd). **Do NOT add a rejecting limiter** (would need a distributed token bucket — overkill, new failure surface). Recommend one tweak: **CONCURRENCY 4→3** (3873) — worst-case 20→15 concurrent Opus, negligible throughput loss. Defer per-worker start-stagger unless logs show heavy 429 clustering.

## Ceiling — ⭐ Jon decision (complementary to backoff, not required for it)
- **(a) Bump the company Anthropic org tier** [REC] — zero code, transparent, **preserves central billing + the cost-attack ledger**; still one (larger) pool.
- **(b) Per-user keys** — infra exists (`resolveAnthropicKey` fallback); linear scaling + per-user isolation, BUT each user needs their own Anthropic account/billing, **fragments the cost ledger**, onboarding overhead. Hold as future escape hatch.
Recommend **(a) tier bump first**; (b) later if one company outgrows a high tier.

## Test/deploy (CF — separate from hosting Test channel)
1. `tools/preflight-functions.sh` (loads index.js — catches helper syntax/scope).
2. **Unit-test the wrapper (primary net, no deploy/no real API):** stub `global.fetch` — `429(retry-after:1)→529→200` returns 200 (3 calls, honored delay); `400` → 1 call no retry; `500`×4 → final 500; near-now `deadlineMs` → no sleep, error surfaced (proves budget guard).
3. Post-deploy smoke: 1 single-page + 1 small batch extraction on a known project; watch `functions:log`.
4. `firebase deploy --only functions` after Jon's gate.

## Effort/risk
M effort. LOW-MED risk (additive; happy path unchanged on 200; only hazard = retry-into-kill, mitigated by the deadline guard). Money-path-adjacent → Coach review + Jon deploy gate. Independent of B078.

## Jon decisions
1. **Ceiling:** tier bump (central billing) [rec] vs per-user keys (isolation)?
2. OK to fold in **CONCURRENCY 4→3** + the **pageResults latent-bug fix** in the same commit? (rec yes)

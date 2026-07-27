# Ryan Latimer — "constantly disconnecting from BC" — Live Diagnostic

**By:** Freddy (Marc-lane read-only) · **Date:** 2026-07-27 · Evidence: PROD `companies/{cid}/debugLogs` (400 most-recent, span 2026-07-21 → 2026-07-27), read live from Jon's admin session.

## Verdict — NOT the B013 Mode-A (MSAL token expiry) hypothesis
Ryan has **zero** token/401/ssoSilent entries. His "disconnecting" is two real, distinct problems:

### 1. BC ENVIRONMENT problem (primary) — 32 events
Ryan's BC calls return **404 `BadRequest_ResourceNotFound` — "Resource not found for the segment 'Project_Planning_Lines_Excel'"**. From the log `extra`:
- `bcEnv: "MATR_SndBx_01152026"` — a BC **SANDBOX** environment.
- `bcCompanyName: "Matrix Systems LLC"`, `bcUserUpn: "Ryan@matrixpci.com"`, `projectNumber: "PRJ402141"`.
- Failing endpoint: `Project_Planning_Lines_Excel(...,Line_No=…)` for CUT(30000)/LAYOUT(40000)/WIRE(50000)/planning lines.
- **Confirmed company-wide config:** `companies/{cid}/config/bcEnvironment.env = "MATR_SndBx_01152026"` (the sandbox). Code: `_BC_DEFAULTS.env` = this sandbox (`src/app.jsx:345`), `_BC_SANDBOX_ENVS` lists it (`:350`), OData base built from `_bcConfig.env` (`:354`).
- ARC already has env-mismatch machinery: `_bcEnvMismatched(project)` (`:370`) + a per-project `bcEnv` stamp — i.e. a project synced under one BC env 404s if the company later targets a different env.

**404 "Resource not found for the segment" = the OData web service `Project_Planning_Lines_Excel` does not resolve in the sandbox env** — either (a) that web service/page isn't PUBLISHED in `MATR_SndBx_01152026`, or (b) PRJ402141's BC planning-line records live in a DIFFERENT environment than the sandbox ARC currently targets (env mismatch). It is **not** a token expiry (would be 401) and **not** a row-level permission (would be 401/403). The app's canned "admin can see it; likely BC permissions or company/env mismatch" message is a guess — the real cause is the env/web-service.

### 2. Firestore WRITE-STREAM EXHAUSTION (amplifier) — 46 events
`FirebaseError: [code=resource-exhausted]: Write stream exhausted` + `Using maximum backoff delay to prevent overloading`. The Firestore CLIENT write-queue overloads → backoff → writes stall → the session **freezes / feels disconnected**. Breadcrumbs show console.warn/error storms preceding each — consistent with the failing BC ops (the 404 burst above) triggering rapid retries/reverts that overflow the write queue. **Same amplifier class as B012/B016** ("~61 rapid reverts overflow the Firestore client write queue"). Also seen for **Jon and Noah** (company-wide), but worst for Ryan (46).

## Ryan's error profile (143 entries / 6 days, 46 distinct minutes)
| Category | Count |
|---|---|
| Firestore write-exhausted (resource-exhausted / max backoff) | 46 |
| BC 404 planning-line (sandbox env / Project_Planning_Lines_Excel) | 32 |
| SAVE BLOCKED (panel-reduction data-safety guard) | 7 |
| invite/membership (legacy invite link) | 1 |
| other (misc console errors) | 57 |
| **bc-401-token (Mode A / MSAL)** | **0** |

## What Ryan actually experiences
BC planning-line reads/writes fail (404, sandbox), and the repeated failures churn Firestore writes into backoff → his whole session stalls → reads as "constantly disconnecting from BC" (even though the BC pill likely stays green — these are 404s, not 401s, so they don't flip the honest-pill).

## Decisive questions / remediation for Jon
1. **Is prod ARC supposed to be on the BC SANDBOX `MATR_SndBx_01152026`?** (Company config currently is.) If it should be production BC, fix `companies/{cid}/config/bcEnvironment` to the correct env (where `Project_Planning_Lines_Excel` is published + PRJ402141's records live).
2. **If the sandbox is intended (pre-launch):** publish the `Project_Planning_Lines_Excel` OData web service in `MATR_SndBx_01152026`, and confirm PRJ402141 was synced under that same env (check the project's `bcEnv` stamp vs the company config — `_bcEnvMismatched`).
3. **Firestore write-exhaustion (B012/B016):** the burst-write amplifier is live and hitting multiple users — the failing BC ops make it worse. Fix the 404 source first (removes the burst), then the durable fix is the B016 await/confirm-per-mutation + churn reduction.

## Follow-ups
- Confirm Ryan's BC pill color at a "disconnect" moment (expected: GREEN, since 404≠401) — proves it's the freeze/404, not a token drop.
- Quick check: PRJ402141's `bcEnv` field vs `MATR_SndBx_01152026` (env-mismatch confirmation) — the projects query by `number` returned null (field/path differs; re-check with `projectNumber`).

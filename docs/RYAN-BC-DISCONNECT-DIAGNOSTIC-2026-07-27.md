# Ryan Latimer — "constantly disconnecting from BC" — Live Diagnostic

**By:** Freddy (Marc-lane read-only) · **Date:** 2026-07-27 · Evidence: PROD `companies/{cid}/debugLogs` (400 most-recent, span 2026-07-21 → 2026-07-27), read live from Jon's admin session.

## ★★ FINAL ROOT CAUSE (corrected 2026-07-27 via live BC OData probes) — WRONG Job_Task_No
The BC web service is **fine** (published; unkeyed + keyed GETs for real records return 200 — Jon confirmed publication). The failure is that **ARC requests PRJ402141's planning lines under `Job_Task_No = "20510"`, which does not exist in BC.** Live-verified against `MATR_SndBx_01152026`:
- PRJ402141 has **121 planning lines** under tasks **`20110, 20210, 20310, 20410, 20610`**.
- **`20510` = 0 lines (not a real task).** ARC keys its planning-line reads/writes to `(Job_No='PRJ402141', Job_Task_No='20510', Line_No=…)` → **404 on every one** → silent (404 doesn't flip the pill) → retry/revert churn → Firestore write-exhaustion → Ryan's session stalls ("disconnecting").
- The real tasks **skip 20510 and add 20610** → BC's task numbering was **renumbered/shifted** (a task removed/inserted), so ARC's stored **panel→BC `Job_Task_No` mapping went stale.** This is an **ARC bug** (trusting a stale/computed task number instead of re-resolving from BC) + a BC data change (task renumber, likely around the ~June-22 window).
- **Evidence chain (corrected twice as probes came in):** "web service unpublished" ✗ (Jon: it's published) → "OData key-structure/Page-vs-Query mismatch" ✗ (keyed GET on a real record = 200) → **"ARC's Job_Task_No 20510 doesn't exist; real is 20110–20610" ✓.**

**NEW work item B065 [BUG · HIGH]:** ARC's panel→BC-task-number mapping for a project can go stale (BC task renumber) → planning-line 404 storm. Fix = re-resolve the actual `Job_Task_No` from BC per panel (don't trust a stored/computed increment), + fail loudly on task-not-found (ties to B064). The B064/B016/F069 hardening items remain valid defense-in-depth; **B065 is the actual root-cause bug.**

**Superseded hypotheses below are kept for the record but are NOT the cause.**

## (SUPERSEDED) Earlier framing — NOT the B013 Mode-A (MSAL token expiry) hypothesis
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

## ★ TIMING — this is CHRONIC, not new (answers "why now?")
Scanned 1800 recent logs (window 2026-06-20 → 07-27). `Project_Planning_Lines_Excel` 404s total **522**, spanning **~June 22 → today, essentially every day**. June 20–21 show ZERO planning-404s then June 22 onward is heavy → likely a change ~**June 22** (logs don't retain earlier, so can't see before 06-20). **It is NOT Ryan-specific:** recent window = **jon@matrixpci.com 63, Ryan 32**. It went unnoticed for ~5 weeks because a **404 does not flip the BC health pill** (only 401 does, per B013) → the planning-line sync failed **silently**. Ryan surfaced it now only because the failures also trigger the Firestore write-exhaustion that visibly **stalls his session**.

**Not an ARC-side change:** no BC/planning commits around June 22; `_planPageCache`/page-discovery logic unchanged since v1.19.x. ARC discovers the planning page from BC's published web services (`allPages.find(/^project.?planning/i)`, `src/app.jsx:3528/3630`) then queries it. A **404 "Resource not found for the segment"** = the `Project_Planning_Lines_Excel` web service **no longer resolves** in `MATR_SndBx_01152026` despite being set up months ago → **BC-side.** Likely an **orphaned web-service publication after a sandbox refresh/recreate ~June 22** (the Web Services record survives → discovery finds the name → but its target page/query object is gone → query 404s). **BC-admin action (Jon):** verify/republish `Project_Planning_Lines_Excel` in the sandbox; check whether the sandbox was refreshed ~June 22.

## Env-match reconciliation (re: "no user should be on an env ≠ Settings")
The evidence shows **no env mismatch across users** — every user (Jon + Ryan) is on `MATR_SndBx_01152026`, which **matches** the company Settings config (`companies/{cid}/config/bcEnvironment.env`). This is a **broken web service in the correct, matched env**, not a user on the wrong env. A hard env-match guard (F069) is good defense-in-depth but would NOT fix these 404s.

## Resulting work items (Jon: "all of the above")
- **B064** — BC connection failures that bypass the honest pill (404 "segment not found" on a discovered web service; also the raw-fetch 401 family per B013 G1) must SURFACE, not fail silently. Add an admin-visible signal + a persistently-failing-endpoint alert so a 5-week silent breakage can't recur. Extends **B013**.
- **B016 / B012 (write-exhaustion amplifier)** — failing BC ops churn writes → `resource-exhausted` / max-backoff → session stalls (the actual "disconnect"). Harden per B016 (await/confirm per mutation + churn reduction); scope now.
- **F069** — hard guard: block any BC op when the user's/project's env ≠ Settings env (build on `_bcEnvMismatched` + per-project `bcEnv`). Defense-in-depth (not the cause here).
- **BC-admin (Jon):** verify/republish `Project_Planning_Lines_Excel` in `MATR_SndBx_01152026`.

## Follow-ups
- Confirm Ryan's BC pill color at a "disconnect" moment (expected: GREEN, since 404≠401) — proves it's the freeze/404, not a token drop.
- Quick check: PRJ402141's `bcEnv` field vs `MATR_SndBx_01152026` (env-mismatch confirmation) — the projects query by `number` returned null (field/path differs; re-check with `projectNumber`).

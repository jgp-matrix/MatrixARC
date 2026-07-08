# G005 — Test-Environment Isolation (Phase 1) — COACH FEASIBILITY + BUILD PLAN

**Author:** Sam Wize (Coach) · **Date:** 2026-07-07
**For:** Freddy (Analyst Review) → Jon (approve + rule the §11 questions) → Marc (build).
**Scope:** Phase 1 only = `IS_TEST_ENV` side-effect firewall + dedicated test company + TEST-MODE banner (Brief Option A4 + Axis-B). Phase 2 (separate Firebase project) is OUT of scope.
**Traced against tip:** `92d39150`. **HOLD — no code until Jon approves + rules §11.**

## 0. FEASIBILITY VERDICT — FEASIBLE, and the codebase is unusually well-shaped for it

Phase 1 is **LOW–MEDIUM lift** and directly kills the two demonstrated harms. Three findings make it clean:
1. **Every BC write is CLIENT-SIDE** (17 direct OData writes + the offline queue; **zero server-side BC writes**). The near-miss BC price-push fired client-side. So a client `IS_TEST_ENV` gate stops the ERP harm — no Functions change needed for BC. **~90% funnels through ONE wrapper, `bcGatedFetch` (app.jsx:408)** → gate by HTTP method there. **2 stragglers use raw `fetch()`** and must be routed/gated (§4).
2. **A BC SANDBOX environment already exists** — `_BC_DEFAULTS.env = "MATR_SndBx_01152026"` (app.jsx:339). ARC already parameterizes the BC environment **per company** (`companies/{cid}/config/bcEnvironment`, 380–392). The real company overrides the default with a **production** env (that's why the near-miss hit real BC). → The test company can point its `bcEnvironment.env` at the sandbox → test BC writes land in the **BC sandbox**, real+isolated. **Decisively answers Q1: yes, a sandbox exists and the routing mechanism is already built.**
3. **Client-side external sends funnel through single wrappers** — BC via `bcGatedFetch`, Graph email via `sendGraphEmail` (app.jsx:8305; all 10 client emails). Two client choke points cover the bulk.

The only genuinely fiddly part is **server-side** side-effects (SendGrid/Teams/FCM in Functions), because test+prod share one Functions deployment — a Function can't read `location.hostname`. That's handled by threading a signal (§5).

## 1. Answers to Brief §6

- **Q1 — BC sandbox?** **YES.** `MATR_SndBx_01152026` sandbox env exists and is the default constant; `bcEnvironment.env` is per-company. Phase-1 BC option = **point the test company at the sandbox env** (preferred — realistic round-trip) **+ a `bcGatedFetch` write-block as defense-in-depth** (belt: even if the test company's env is misconfigured to prod, the test host blocks mutating verbs). *(Open: is `MATR_SndBx_01152026` still the CURRENT, writable sandbox, or stale? → Jon/IT, §11.)*
- **Q2 — guard surface:** sized in §3.
- **Q3 — `IS_TEST_ENV` mechanism + client↔server threading:** §2. This is the crux; client-side gating alone does NOT stop server-side SendGrid/Teams/FCM — addressed via payload flag + test-company doc marker.
- **Q4 — test-company convention:** §6.
- **Q5 — TEST-MODE banner:** §7.

## 2. The `IS_TEST_ENV` mechanism (§6-Q3, the crux)

**Flag (client):** one constant, defined EARLY in app.jsx (before BC/config init):
```js
const IS_TEST_ENV = (typeof location!=="undefined" && location.hostname==="matrix-arc-test.web.app");
window.IS_TEST_ENV = IS_TEST_ENV; // for console/debug + any late reader
```
**Client-side side-effects** gate directly on `IS_TEST_ENV` at their choke points (§3/§4/§5). This covers ALL BC writes and ALL Graph emails — i.e. **both demonstrated harms** (the BC push was client-side).

**Server-side side-effects** (SendGrid/Teams/FCM in Functions) can't read the hostname (shared deployment). Thread the signal two ways (defense-in-depth):
- **(a) Callable payload `isTest`** — the test client passes `isTest:true` (from `IS_TEST_ENV`) into each side-effect-producing callable (`sendInviteEmail`, `sendEngineerQuestionEmail`, engineering senders, `poCreateOrder`/`poUpdateStatus` if any external). The Function early-returns/skips the external send when `isTest`.
- **(b) Test-company doc marker for TRIGGERS** — Firestore triggers (`onSupplierQuoteSubmitted`, `onIssueReported`, `onCustomerReviewSubmitted`) have no client payload. The test client **stamps `isTest:true`** on the docs it creates (`rfqUploads/{token}`, `debugLogs`, review docs); each trigger checks `if(snap.data().isTest) return;` before emailing/posting/pushing. This is the durable, trigger-safe signal and also namespaces to the test company.

Both are **accident-prevention, not security** (a spoofed client could lie) — acceptable for Phase 1's goal (stop a tester on the test URL from hitting prod BC/email). Phase 2's separate project makes it structural.

## 3. Guard surface — precisely sized

### CLIENT-SIDE (gate on `IS_TEST_ENV`) — the primary harm-preventers
| Surface | Sites | Guard |
|---|---|---|
| **BC writes** | `bcGatedFetch` (408) — ~15 OData POST/PATCH funnel here | ONE gate in `bcGatedFetch`: block mutating verbs (POST/PATCH/PUT/DELETE) in test (§4) |
| **BC writes — raw-fetch strays** | **3595** (task-desc sync PATCH), **5643** (panel end-date PATCH) — bypass `bcGatedFetch` | route both through `bcGatedFetch` (also gains 429/semaphore handling) OR add the same method-gate inline |
| **BC offline queue** | `bcEnqueue` (6219) | gate `bcEnqueue` → don't enqueue in test (queue is localStorage; a test-enqueued op is already env-stamped + skipped on prod reconnect at 6247, but not-enqueuing is cleaner) |
| **Graph email** | `sendGraphEmail` (8305) — all 10 client sends (RFQ, quote, review) | ONE gate in `sendGraphEmail`: suppress send in test (§5) |
| **Clearbit logo** | 233 (GET) | harmless read — ignore |

### SERVER-SIDE (thread via §2a/§2b) — secondary but real (test supplier-quote → real Teams/email today)
| Surface | Sites (functions) | Guard |
|---|---|---|
| **SendGrid** | 12 `sgMail.send` — callables (`sendInviteEmail` 607, `sendEngineerQuestionEmail` 929, engineering 118/162) + triggers (`onSupplierQuoteSubmitted` 729/747, `onIssueReported` 893) + monitors (165/226/300/2925) | callables: `isTest` param → skip; triggers: doc `isTest` marker → skip |
| **Teams webhook** | 4 `postToTeams` — `onSupplierQuoteSubmitted` 674, `onIssueReported` 840, `sendEngineerQuestionEmail` 961, monitor 2872 | same as SendGrid (share the triggers/callables) |
| **FCM push** | 3 `sendPushToUser` — 663, 827, 950 | same |

### LEFT ON in test (needed to exercise the app) — note spend, no gate
| Surface | Sites | Rationale |
|---|---|---|
| **Anthropic** | server `extractBomPage`/`extractBomBatch`/`extractSupplierQuotePricing`/`monitorAnthropicModels` + ~10 client direct | extraction/pricing is the primary thing to test; leave on. Spend note §8. |
| **Vendor scrapers** | Codale/Mouser/DigiKey/custom (server) | read-only pricing lookups; needed to test pricing; not destructive to prod data. Cost only. |

## 4. BC design (Phase 1)
**Primary — route test to the BC sandbox:** set the test company's `companies/{testCid}/config/bcEnvironment.env` to the sandbox environment. Test BC writes then hit the sandbox (realistic, isolated). Zero code change beyond the test-company setup — the per-company env mechanism already exists (380–392) and `_bcEnvMismatched` (359) already prevents cross-env project confusion.
**Belt — `bcGatedFetch` write-block:** in `bcGatedFetch` (408), if `IS_TEST_ENV` and the request method is mutating, **no-op**:
```js
const _m=((options&&options.method)||"GET").toUpperCase();
if(IS_TEST_ENV && _m!=="GET" && _m!=="HEAD"){
  console.warn("[TEST-ENV] BC write suppressed:",_m,url);
  return new Response('{"_testEnvBlocked":true}',{status:200,headers:{"Content-Type":"application/json"}});
}
```
⚠ **Caller-tolerance nuance:** some BC-write callers read the response (created item id, etc.). A no-op fake-200 must not crash them. **This is why routing to the sandbox (real responses) is PREFERRED** — the belt is the safety net for a misconfigured test company, and Marc must verify the fake-200 shape doesn't break the write-response readers (or the belt is applied only when the env is NOT the sandbox). Also cover the 2 raw-fetch strays (3595/5643) and `bcEnqueue`.

## 5. Email / Teams / FCM design
- **Client Graph (all 10):** gate in `sendGraphEmail` (8305) — `if(IS_TEST_ENV){console.warn("[TEST-ENV] email suppressed",to,subject);return {suppressed:true};}` (or redirect `to` → a test inbox — Jon's call, §11-QC).
- **Server SendGrid/Teams/FCM callables:** add `isTest` param; wrap each `sgMail.send`/`postToTeams`/`sendPushToUser` in `if(!isTest){…}`.
- **Server triggers** (`onSupplierQuoteSubmitted`, `onIssueReported`, `onCustomerReviewSubmitted`): early `if(snap.data()?.isTest) return;` — requires the test client to stamp `isTest:true` on the source docs (rfqUploads/debugLogs/review). Small client-side additions at those doc-create sites, gated on `IS_TEST_ENV`.

## 6. Dedicated test-company convention (§6-Q4)
- A dedicated `companies/{testCid}` (flagged `isTestCompany:true`) with a test user (or Jon's test login) as its member. All test work is created under it → its projects/config are namespaced separately from real customer companies (projects render from `companies/{cid}/…` / `users/{uid}`). Its `bcEnvironment.env` = the BC sandbox (§4).
- **Honest limit:** because Firestore is shared, this is a *convention + access boundary*, not a hard code wall — a test user who is ALSO a member of a real company could still open a real project (that's exactly the near-miss: a real project opened on the test host). **Phase 1's structural protection against the EXTERNAL harm is the `IS_TEST_ENV` firewall (§4/§5), which fires on the test HOST regardless of which project is open.** The test company reduces the Firestore-collision harm; Phase 2 (separate project) eliminates it. State this to Jon so the residual Firestore-collision risk isn't assumed closed by Phase 1.
- **`isTest` doc-stamp:** the test client stamps `isTest:true` on trigger-source docs (§5) — this both self-gates the triggers and tags test data for identification/cleanup.

## 7. TEST-MODE banner (§6-Q5)
When `IS_TEST_ENV`, render a persistent, unmissable top banner (e.g. amber bar: "⚠ TEST ENVIRONMENT — BC writes go to sandbox, emails suppressed. Not production."). One conditional block in the App shell; zero logic risk.

## 8. Anthropic / scraper spend (left on)
Extraction + pricing lookups stay enabled (can't test the app without them). They write to the shared `anthropicLedger` and cost real tokens. **Recommend:** (optional) a lower per-call/monthly cap when `IS_TEST_ENV`, or just accept the low test volume. Not a Phase-1 blocker — flag for Jon (§11-QE).

## 9. Invariants / risk
- **No prod behavior change** — every gate is `if(IS_TEST_ENV)`; on the prod host `IS_TEST_ENV` is false → byte-identical behavior. The server `isTest` params default false → prod unaffected.
- **Data-retention** — adds `isTest` markers + a test company; removes/renames nothing. ✓
- **Risk: the fake-200 BC belt** (§4 nuance) is the one place a gate could break a caller — mitigated by preferring sandbox-routing + Marc verifying response-readers. **Risk: `isTest` is spoofable** — accepted for Phase 1 (accident-prevention); Phase 2 makes it structural.

## 10. Test criteria
1. On `matrix-arc-test.web.app`: `IS_TEST_ENV===true`; on prod: false (banner absent, all sends fire).
2. **BC write suppressed/sandboxed** — trigger a supplier-apply price push on the test host → confirm NO write to the prod BC company (either sandbox-only or no-op); repeat the exact near-miss (PRJ402096-style) → prod BC untouched.
3. Raw-fetch strays (3595/5643) + `bcEnqueue` gated (no prod BC write, no queued prod op).
4. **Client Graph email suppressed** — send an RFQ/quote on test → no real email leaves.
5. **Server email/Teams/FCM suppressed** — submit a supplier quote on test (fires `onSupplierQuoteSubmitted`) → no SendGrid email, no Teams post, no push (trigger sees `isTest`).
6. TEST-MODE banner visible on test, absent on prod.
7. Anthropic extraction still works on test (left on).
8. Prod regression: on the prod host, BC writes / emails / triggers all fire normally. `validate_jsx.js` clean; `preflight-functions.sh` clean (Functions changed).

## 11. BLOCKING questions for Jon (via Freddy) — needed before build
- **QA (BC sandbox liveness):** is `MATR_SndBx_01152026` (or a current sandbox) a LIVE, writable BC environment we can point the test company at? (Decides sandbox-routing vs no-op-only.)
- **QB (BC test posture):** route test BC → sandbox (realistic round-trip) **or** hard no-op all BC in test (safest, but can't test the BC round-trip)? *(Coach rec: sandbox + belt.)*
- **QC (email in test):** suppress entirely, or redirect to a test inbox (e.g. jon@matrixpci.com)? *(Coach rec: suppress + console log.)*
- **QD (test company):** does a dedicated test company/user exist, or does Marc create one? Confirm the `isTest` doc-stamp approach for triggers is acceptable.
- **QE (Anthropic spend):** leave uncapped (low test volume) or add a test spend cap? *(Coach rec: leave; revisit if volume grows.)*
- **Functions deploy:** Phase 1 changes `functions/index.js` (server gates) → needs `firebase deploy --only functions` (shared deployment — the gates are prod-safe since `isTest` defaults false). Note `deploy.sh` only does hosting; Functions deploy is a separate step (Brief §6-Q4).

## 12. Lift / pipeline / HOLD
**Lift:** client ~1 flag + 3 choke-point gates (`bcGatedFetch`, `sendGraphEmail`, `bcEnqueue`) + 2 stray-fetch fixes + banner + `isTest` doc-stamps ≈ **~40–60 LOC**; server ~`isTest` params/markers across ~5 callables + ~3 triggers ≈ **~30–50 LOC**; + test-company setup (data, not code). **Overall MEDIUM** (touches ERP + Functions → full cross-check + careful verify per §10). Risk concentrated in the BC-belt caller-tolerance (§4) and the server threading completeness.
**Pipeline:** this plan → Freddy Analyst Review → **Jon rules §11 + approves** → Marc builds (client gates first, then Functions) → verify (§10, incl. the near-miss replay on test with prod BC watched) → Coach review → Jon deploy checkpoint (hosting + functions). **HOLDING — no code.**

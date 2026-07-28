# B064 — Surface silent BC failures (esp. structural 404s) — Coach scope

**Coach read-only · 2026-07-27 · master @ prod v1.24.38 · `src/app.jsx`.** Design only.

## Reframe (premise was half-shipped)
B013-**G1** already shipped (`6958dc33`, v1.24.4): the search/pricing/customer READ helpers now route through `bcGatedFetch`, so the **401 "mode-B" blind spot is largely closed already**. B064 splits into:
- **Class A** = the deferred "G1b" tail — raw-`fetch()` GET/etag helpers whose 401 still bypasses the health pill (mechanical, low-risk).
- **Class B** = the **404 structural class** (the Ryan incident) — **NOT fixed by gate-routing**, because **`bcGatedFetch` itself is 404-blind** (`:534` only acts on 429/401/`r.ok`; a 404 passes straight through). Several planning writes that 404'd for 5 weeks were **already fully gated** and still failed silently. Class B needs a **new, distinct signal.**

> ⚠ Incident-specific note (Freddy, live-verified): in the Ryan case the 404 is NOT an orphaned web service — the `Project_Planning_Lines_Excel` service resolves fine; ARC requests a **non-existent Job_Task_No (20510; real tasks 20110–20610)**. See `docs/RYAN-BC-DISCONNECT-DIAGNOSTIC-2026-07-27.md` (root cause = **B065**). B064 still applies: the point is these 404s must SURFACE, whatever the sub-cause.

## Gate-bypassing BC sites still on raw fetch (re-grepped; the B064 target set)
Key ones (full 24-row table in lane transcript): `bcPatchProgressBillingLine` etag-GET (:6265), `bcPatchLaborPlanningLines` etag-GET (:6330), `bcSyncServiceCardTask` probes (:3652/:3695), `bcSyncPanelPlanningLines` probes (:3858/3872/3891), `bcSyncEcoPanelPlanningLines` (:4156/4243), `bcPatchPanelEndDate` (:6375), `bcPatchJobOData` (:6398), `bcPatchItemOData` (:5372), inline MFR-save (:24439), assorted create/task probes, admin tools (:42479/43426/49061/49175), boot caches (:50915/51148/51150). Already-gated (DO NOT re-touch): `_bcFetchItems*`, `bcLookupCustomer`, `bcFetchPurchasePrices*`, `bcFetchItemCardCosts`, `bcLookupItem/LeadTime`.

## Why gating alone doesn't fix Class B
`_bcDiscoverODataPagesImpl` (:6215) GETs the OData root (the published web-service NAMES) → discovery succeeds and `allPages.find(/^project.?planning/i)` finds the name; but the keyed call 404s. The gate has **no 404 branch**. Capture already happens (`logDebugEntry` at :6278/:6336 — that's how the 522 entries got recorded) but: severity `warn`, **guessed message** ("likely BC permissions or company/env mismatch" — wrong), **no dedupe** (522 near-identical), **no user/admin surface** (pill stays green; 404≠401).

**Discriminator (net-new):** a keyed 404 for a legitimately-absent row is NORMAL (existence probe); the SAME "Resource not found for the segment" body also appears for structural faults. Must branch on the OData error body + persistence (repeat count), NOT `status===404` alone. (Freddy note: the Ryan wrong-task 404 returns the identical "segment" body as a missing row, so persistence/threshold — not body text alone — is the reliable structural signal.)

## Surfacing design (SSOT — one predicate, one recorder, one pub-sub; mirror `_bcHealth`)
- New: `_bcEndpointFaults` Map (endpoint→{count,firstAt,lastAt,env,sampleBody}), `_bcEndpointFaultSubs` pub-sub, `_isStructural404(status,body)`, `_recordBcEndpointFault(url,body)`. Debug hook `window._arcForceBc404="<Segment>"` (mirror `_arcForceBc401` :495).
- Threshold: broadcast after **N≥2** faults on the same endpoint/session; dedupe the debugLog to **once/endpoint/session at severity:error** with an honest message.
- **Distinct signal, NOT the red pill** (red = "reconnect", useless for a 404): pill stays green; add an **amber advisory chip/banner** near the pill (:51602) — "⚠ BC sync degraded — endpoint '<seg>' unavailable; notify your admin" — subscribing to `_bcEndpointFaultSubs` (mirror the `_bcHealthSubs` subscriber :51232); clears on next success to that endpoint.
- **Admin alert** (so a 5-week silence can't recur): either bump severity→`error`+`source:"bcStructuralFault"` via existing `onIssueReported`, or (better) a server-side company-wide aggregator that fires ONE alert past a 24h threshold. (Functions change → separate deploy.)

## Money-path caution
Pricing helpers already gated (G1) — do NOT touch. For etag-GET-before-PATCH reads, change ONLY the health/observability path; keep the etag→conditional-PATCH data flow + `If-Match` + skip-if-correct byte-identical.

## Build order
P0 primitives (SSOT, no behavior change) → P1 wire Class B in `bcGatedFetch` 404 passthrough (`:534`, clone body-peek so callers' stream is intact) + upgrade :6278/:6336 to the shared recorder → P2 amber UI chip + subscriber → P3 Class A tail (route raw GETs through the gate; leave `_bcDiscoverODataPagesImpl` :6215 raw/bespoke — it expects a candidate miss) → P4 admin alert. Gates: validate_jsx, Coach cross-check (money-path GETs), Test repro via `_arcForceBc404`, per-phase HOLD.

## Open questions for Jon
1. Amber advisory chip (rec) vs a 4th pill state?
2. Fault threshold N=2/session + clear-on-success (vs manual dismiss)?
3. Admin alert: minimal (per-session via onIssueReported) vs server aggregator (company-wide, 24h threshold — actually prevents a long silence)?
4. `_bcDiscoverODataPagesImpl` (:6215): leave raw or wrap?
5. Class A scope: all 22 raw GETs now, or planning/patch cluster now + defer admin-tool/boot-cache reads?

**Tracker note:** this is really **B013-G1b + a new 404-structural feature** — don't under-scope to Class A only.

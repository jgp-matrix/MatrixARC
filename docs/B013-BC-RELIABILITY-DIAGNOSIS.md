# B013 — Chronic Multi-User BC Connection Reliability — Coach Diagnosis

**Coach read-only diagnose lane · 2026-07-22 · base `src/app.jsx` @ v1.24.3. Diagnosis only — no fix built.**

## Framing correction
B013-1 (v1.23.7 `ad3c0f2c`), B013-2/3 (v1.23.10 `6cc1c3d7`), and B021 (timeout/abort) all **already SHIPPED**. The honest 3-state pill, 401 auto-refresh/retry, and 401-aware sync modal are LIVE. The chronic reliability is **not unfixed — it's a COVERAGE HOLE**, not a missing feature.

## Token / connection model (Confirmed-by-code)
- **Per-user MSAL / Azure AD OAuth (NOT API keys).** `acquireBcToken()` (`~:1822`) → MSAL `PublicClientApplication` vs `login.microsoftonline.com/{BC_TENANT}`, scope `…businesscentral…/.default`. Bearer lives in module global `_bcToken` (`~:405`), memory only.
- **Refresh (3-tier):** `acquireTokenSilent` → `ssoSilent` → `acquireTokenPopup` (interactive only). `acquireBcToken(false)` = silent-only lever for auto-recovery.
- **★ MSAL cache = `sessionStorage`** (`~:1788`) — per-tab, dies on tab close. New tab / restart / crashed tab → no cached account → `acquireTokenSilent` can't run → falls to `ssoSilent` (needs a live Microsoft web session).
- **Choke point:** `bcGatedFetch` (`~:446`) — 6-slot semaphore + 45s AbortController (B021) + 429 retry + 401 branch (B013-1). This is where the honest-health signal + 401 recovery live.
- **`resetTeamApiKeys`/`diagnoseMemberApiKey` (functions/index.js) manage the ANTHROPIC api key, NOT BC** → the tracker's "per-member API key" suspicion is a **RED HERRING for B013 — dismissed.**

## Failure mode B (pill stays BLUE/green while calls 401) — ROOT CAUSE (Confirmed)
The honest-health machinery only fires for calls routed through `bcGatedFetch` (`_setBcHealth('red')` at its 401 give-up `~:530`). **A family of BC helpers use raw `fetch()` and bypass the gate entirely**, do their own inline `_bcToken=null`+silent-retry, then silently return empty/partial data — never touching the health pub-sub:
- **`_bcFetchItemsViaItemCard` (`~:4883`) + `_bcFetchItems` (`~:4855`)** behind **`bcSearchItems` (`~:5007`)** — the default Item Browser / BOM search path. On 401 → one silent refresh → else `_bcToken=null; return null` → **search returns "no results" with the pill still green.** = Jon's "search died while pill stayed blue." **CONFIRMED active mechanism.** (ItemCard fires 7 parallel field queries → an expired token = a 7-way 401 storm.)
- **`bcLookupCustomer` (`~:4379`), `bcFetchPurchasePrices` (`~:5566`), `bcFetchPurchasePricesMultiVendor` (`~:5604`), `bcFetchItemCardCosts` (`~:5642`)**, progress-billing/lead-time helper (`~:6009`) — all raw fetch, treat 401 as `continue`/`return null`/`warn`, **none call `_setBcHealth`.** Feed pricing sync / drift / restore → silent partials with a green pill.
- Secondary: the 5-min validity probe `checkBc` (`~:48273`) has **no leading call** (setInterval only `~:48367`) → first real probe is +5 min after mount; `bcOnline` seeded from mere presence `!!_bcToken` until then.

## Failure mode A (team members drop more) — ranked
Same MSAL path for everyone → divergence = MSAL session/account state:
1. **sessionStorage cache + no persistent MS session (Likely).** Andrew/Ryan in fresh tabs w/o Outlook/Teams-web → no cached account, `ssoSilent` has no session → silent refresh null → **honest clean RED**, click → popup → blue. Jon keeps a persistent MS session → `ssoSilent` keeps succeeding → he silently renews and lands in **degraded mode B** instead. **One factor explains both modes.**
2. Conditional-access / token-lifetime policy differences by user (Plausible).
3. Admin-consent vs per-user consent for the BC scope (Plausible).
4. Trailing-dot redirect (Speculative; already guarded `~:1787`).

## Already shipped vs the gap
- ✅ B021 (timeout/abort), B013-1 (401 refresh+replay in `bcGatedFetch`), B013-2 (honest 3-state pill via `_bcHealthSubs`), B013-3 (401-classified sync modal + reconnect affordance). Debug hooks `window._arcForceBc401=N` (`~:495`), `window._arcBcHealth(state)` (`~:440`).
- **Remaining gap (chronic-reliability residue):**
  - **G1 (the big one):** raw-fetch helpers bypass the gate + the health signal → live mode-B surface (search + pricing).
  - **G2:** sessionStorage MSAL cache → mode-A frequency; no cross-tab refresh-token persistence, no proactive pre-expiry renew.
  - **G3:** no leading validity probe on mount → presence masquerades as validity for the first 5 min.
  - **G4:** B029 (per-row pill 401) already filed LOW.

## Fix direction (one-liners — not built)
- **G1 (highest value, closes mode B):** route the raw-fetch helpers through `bcGatedFetch` (or minimally have their 401-give-up paths call `_setBcHealth('red')`+stamp `_bcLast401At`). Extends the honest pill + timeout + semaphore to search & pricing. **Money-path-adjacent (pricing helpers) → full cross-check + PR + test-channel gate before build.**
- **G2:** switch MSAL `cacheLocation` to `localStorage` (survives tab-close → far fewer member drops) — *validate vs tenant security posture (shared-machine risk) first;* add proactive silent renew at ~T-5min of expiry.
- **G3:** fire one `checkBc()` immediately on mount before the 5-min interval.
- **Owner-vs-member probe:** a one-shot diagnostic when a member's silent refresh keeps failing (conditional-access vs consent vs no-MS-session) — kept SEPARATE from B013 per Jon.

## Decisive runtime artifacts to confirm ACTIVE (code-read proves POSSIBLE only)
- **Mode B money shot:** expire the token (or `window._arcForceBc401=8`), run an Item Browser search → **empty results + console `bcSearchItems(ItemCard) failed: 401` (`~:4893`) WHILE the pill is still green.** Contrast: a gated call (sync) at the same moment flips the pill red → proves the coverage split.
- **Debug Logs** (`companies/{cid}/debugLogs`, filter out `bcFuzzyLookup`): `severity error/warn` + `401` + source `bcSearchItems`/`bcSearchItems(ItemCard)`/`bcFetchPurchasePrices*`; clustered 401 storms (the 7-query burst); correlate against the ABSENCE of a red-pill/`_bcLast401At` transition.
- **Mode A:** Andrew/Ryan reproduce a drop → check sessionStorage MSAL account presence + whether Outlook/Teams-web was open + capture the `Silent BC token failed, trying ssoSilent…` (`~:1840`) console path vs Jon's session where it succeeds.
- **Live tell:** pill color at the moment an action fails. **Mode B = green pill + failed action (bypass path). Mode A = red pill, click fixes (gated path / no MS session).**

## Recommendation
Build **G1 first** (route the raw-fetch helpers through the gate) — it closes the confirmed mode-B search/pricing blind spot and is the highest-value lever. Money-path-adjacent → Coach cross-check + test-channel gate before prod. G2/G3 are follow-ups. Confirm active via the mode-B money-shot capture before/after.

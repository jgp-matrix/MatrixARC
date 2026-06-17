# Coach Supplement — #143 Boot-Failure Handling

**From:** Coach (Sam Wize)  
**To:** Freddy  
**Re:** Brief #143, five open questions  
**Date:** 2026-06-16  

---

## Q1 — Error-Branch Granularity

**Recommendation: Two branches. `permission-denied` vs everything else.**

The Firestore client SDK attaches a `.code` string to every error. The realistic codes during boot reads are:

| Code | Cause | Retryable? |
|---|---|---|
| `permission-denied` | Security rule denied (RYAN case: orphan profile → `isMember()` fails) | No — membership state won't change on retry |
| `unavailable` | Firestore service down or client offline | Yes |
| `resource-exhausted` | Rate limiting | Yes (with backoff) |
| `deadline-exceeded` | Timeout | Yes |
| `unauthenticated` | Auth token expired/revoked | Edge case — SDK auto-refreshes tokens, extremely rare |

The codebase already branches on this exact axis. Two existing call sites use `e?.code === "permission-denied"` (lines 39290 and 40494 in app.jsx) to distinguish "you don't have access" from "something went wrong." The connection quality monitor at line 45017 branches on `unavailable` and `resource-exhausted` as transient.

**Two branches are enough:**

- **`permission-denied`** → "You don't have access to this company's projects. Contact your administrator." No Retry button. The user can't fix this themselves — their member doc doesn't exist.
- **Everything else** → "Couldn't load projects." + Retry button. Transient failure, try again.

Don't special-case `unauthenticated`. It's vanishingly rare (Firebase SDK handles token refresh), and if it does fire, the Retry button harmlessly re-attempts and the auth state listener will eventually redirect to sign-in.

---

## Q2 — Retry Mechanism

**Recommendation: Full boot retry, not partial.**

The boot IIFE (line 45583+) runs a sequential chain:

```
1. loadUserProfile          → sets _appCtx.projectsPath, companyId
2. member doc fetch         → sets userRole
3. member onSnapshot        → live permission listener
4. company doc fetch        → sets companyName, companyLogo, etc.
5. Promise.all (5 loaders)  → apiKey, pricingConfig, laborRates, bomItems, mfrDenylist
6. loadProjects             → THE FAILING CALL
7. setLoading(false)        → clears spinner
```

If `loadProjects` fails due to a transient error, steps 1–5 completed successfully. A partial retry (re-run only step 6) would work for that scenario.

**But partial retry is unsafe in the general case.** If the transient error (e.g., `unavailable`) also hit one of the config loaders in step 5, those loaders swallowed the error silently (they all return defaults on failure). The user would land on a page with default pricing config, default labor rates, etc. — silently wrong. Re-running only `loadProjects` cements that bad state.

**Implementation path:**

1. Extract the IIFE body into a named async function (e.g., `async function runBoot(user)`).
2. At the top of `runBoot`, tear down the existing member onSnapshot if present (`window._arcPermsUnsub?.()`), then reset `_appCtx` fields and the React state variables (`setCompanyId(null)`, `setUserRole(null)`, etc.).
3. Call `runBoot(user)` in the existing `useEffect` (replaces the current IIFE).
4. The Retry button calls `runBoot(user)` directly — full re-initialization.

Cost: a few redundant Firestore reads on retry (~5 doc reads, well within free tier). Benefit: guaranteed consistent state. The retry path is the same as the initial boot path — one code path, not two.

**Retry count:** Cap at 2 automatic retries for transient errors (with 2-second delay between). After that, show the error with a manual Retry button. Don't auto-retry `permission-denied` at all.

---

## Q3 — #143 / #144 Boundary

**Confirmed: #143 catches the fall. #144 prevents the push.**

The orphan state is created by `removeTeamMember` (functions/index.js line 518–533). It deletes the member doc but leaves the profile doc with a stale `companyId`. On next login, the orphaned user's profile routes to the company projects path → `isMember()` fails → `permission-denied` → uncaught throw → eternal spinner.

**#143 scope (this ticket):**
- Wrap `loadProjects` (and the boot IIFE top-level) in try/catch
- Clear `setLoading(false)` on ANY failure — spinner always stops
- Branch the error message: `permission-denied` → "contact admin" (no retry) vs transient → "retry" button
- `console.error` the raw error for diagnostics
- Do NOT attempt to detect or repair the orphan state
- Do NOT touch `removeTeamMember`

**#144 scope (separate ticket):**
- Fix `removeTeamMember` to also delete/clear the profile doc (`users/{targetUid}/config/profile`) — eliminate the orphan state at creation time
- Optionally: add a profile-consistency check during boot that detects the orphan condition (profile.companyId exists but member doc doesn't) and self-heals by clearing the stale profile

**The boundary is clean.** #143 makes the app resilient to any `loadProjects` failure regardless of cause. #144 eliminates the specific cause that triggered RYAN's instance. Even after #144 ships, #143 remains load-bearing — there are other ways `loadProjects` can fail (network, outage, rate limit), and the app needs to handle all of them gracefully.

**Admin fix path for RYAN (before #144):** Delete the orphaned profile doc at `users/{RYAN_UID}/config/profile`, then re-invite. `acceptTeamInvite` uses an atomic batch (member doc + profile doc + invite delete), so the re-invite creates consistent state.

---

## Q4 — Observability

**Recommendation: `console.error` only. Defer structured logging to #129.**

The debug log system (`window.logDebugEntry`) writes to `companies/{companyId}/debugLogs/{entryId}`. That path requires `isMember()`. A user failing with `permission-denied` is by definition not a member — the debug log write would also fail, creating a silent double-fault.

The fallback path `users/{uid}/debugLogs/{entryId}` would succeed (rule: `request.auth.uid == uid`), but the debug log system currently writes to the company path based on `_appCtx.companyId`. Wiring up a fallback log path is out of scope for #143.

**For #143, do this:**

```js
console.error("[ARC boot]", e?.code || "unknown", e?.message || e);
```

This is:
- **Free** — no Firestore write, no Cloud Function call
- **Always available** — works for any user, any error, any membership state
- **Visible** — appears in browser DevTools console, Chrome remote debugging, and any crash-reporting tool that captures console output
- **Sufficient** — the error code + message tells the admin exactly what failed

Structured Firestore-based logging (#129) can add the user-path fallback later. #143 doesn't need to wait for it.

---

## Q5 — Modal vs Inline

**Recommendation: Inline, same position as the spinner. No modal.**

The Dashboard already renders two states in the same content area:

```jsx
{loading && (<spinner/>)}                              // line 42145
{!loading && projects.length === 0 && (<"No projects"/>)}  // line 42180
```

Add a third state — `bootError`:

```jsx
{loading && !bootError && (<spinner/>)}
{bootError && (<error UI based on bootError.code/>)}
{!loading && !bootError && projects.length === 0 && (<"No projects"/>)}
```

**Why not a modal:**

1. **`permission-denied` doesn't need a modal.** The user can't do anything useful, but the toolbar still renders (harmlessly inert — navigation targets would also fail gracefully with the existing try/catch on each feature). A centered message in the content area is clear enough.

2. **Transient errors definitely shouldn't modal.** The user might want to check the BC connection indicator, glance at the offline/slow banner (the existing `connStatus` indicator at line 46034), or try Settings. A modal blocks all of that.

3. **Consistency.** The `connStatus` offline/slow indicator (line 46034) is inline — a small banner in the toolbar area. Boot failure should follow the same pattern: surface the problem in-context, don't hijack the screen.

**Implementation:**

- New state in App: `const [bootError, setBootError] = useState(null);`
- In the catch block: `setBootError({ code: e?.code || "unknown", message: e?.message }); setLoading(false);`
- Pass `bootError` to Dashboard as a prop alongside `loading`.
- Dashboard renders the error in the same `textAlign:"center", padding:80` container as the spinner, with:
  - An icon (existing `⚠` or similar, no new assets)
  - The branched message (Q1)
  - Retry button for transient errors (calls `runBoot(user)` from Q2, which also clears `bootError` at the top)
- On retry: `setBootError(null); setLoading(true);` at the top of `runBoot`.

This keeps the change scoped to the Dashboard rendering path + one new state variable in App. No overlay, no z-index, no modal dismiss logic.

---

## Summary for CCD

| Question | Decision | Rationale |
|---|---|---|
| Q1 Granularity | Two branches: `permission-denied` vs other | Matches existing codebase pattern; covers all realistic boot errors |
| Q2 Retry | Full boot retry via extracted `runBoot()` | Partial retry risks stale config from silently-failed loaders |
| Q3 Boundary | #143 = catch + branch + clear flag; #144 = fix `removeTeamMember` | Clean separation; #143 stays load-bearing even after #144 |
| Q4 Observability | `console.error` only | Debug log system can't write when the user IS the failure case |
| Q5 UI Surface | Inline, replacing spinner, no modal | Consistent with `connStatus` pattern; doesn't block toolbar |

**Constraint check:** No adjacent boot logic refactored. Scope is: guard the reads, clear the flag, branch the message. The `runBoot` extraction is the minimum viable change to enable retry — it doesn't restructure the boot sequence, just names it.

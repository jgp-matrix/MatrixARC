# ARC Review Findings

Captured: Thu May  7 10:54:16 MDT 2026
Source: ./tools/review.sh first runs

Each finding has a status: **OPEN** (still needs work), **RESOLVED** (committed, SHA noted),
**STALE** (no longer matches current code — kept as a record of what was checked and why).

---

## Round 1 (firestore.rules + deploy.sh diff)

1. **RESOLVED** — `701d693` (2026-05-07). Firestore rules: `rfqUploads` write access not role-gated.
   CREATE was wide-open to any authenticated user (including view-only members) and allowed
   spoofing someone else's `uid`. UPDATE/DELETE only matched `uid` so teammates with edit role
   couldn't dismiss/delete a coworker's RFQ. Fix added a `_writerIsCompanyWriter(cid)` helper
   inside the `match /rfqUploads/{token}` block; CREATE now requires uid-self-match + non-`view`
   role; UPDATE/DELETE auth path now extends to same-company writers; legacy uid-only docs and
   solo accounts (no companyId) preserved.
2. **RESOLVED** — `701d693` (subsumed by #1, verified 2026-05-07). The CREATE rule now reads
   `request.resource.data.get('companyId', null) == null || _writerIsCompanyWriter(request.resource.data.companyId)`.
   The helper does `exists(...members/$(request.auth.uid))`, so a writer setting `companyId`
   to a company they aren't a member of fails the existence check and the create is rejected.
   The legacy/solo bypass (`companyId == null`) is intentional — those docs are uid-only by
   design and don't participate in team-scoped queries.
5. **STALE** (verified 2026-05-07) — Firestore rules: "Missing `rfq_history` match rule." The
   path `users/{uid}/rfq_history` is fully covered by the catch-all
   `match /users/{uid}/{document=**}` rule at `firestore.rules:12-14`, which gates read/write
   on `request.auth.uid == uid`. Same pattern as `users/{uid}/projects`, `users/{uid}/config`,
   etc. No gap; no fix needed. Kept as a record of what was checked.

## Round 2 (functions/index.js diff)

6. **OPEN** — Stale API key caching in `_resolveAnthropicKey` (~line 2149). Cached key isn't
   invalidated when an admin rotates the Anthropic key in Settings → API. Calls keep using the
   old key until the function instance is recycled.
7. **OPEN** — Ledger schema mismatch — server vs client. Server writes one shape, client reads
   another, leading to monthly spend being under-counted in the toolbar pill.
8. **STALE** (verified 2026-05-07) — "Unawaited `_writeDebugLog` — fire-and-forget risks lost
   writes." The function is actually `logDebugEntry`, defined in `public/index.html:277` and
   `public/modules/shared.js:201`. It is BROWSER-side only — there is no Cloud Function
   equivalent. In browser code, `await`-ing the log write blocks the UI without improving
   durability (tab-close before write completes is solved by `navigator.sendBeacon`, not by
   await). The codebase already awaits at `shared.js:329` (user-reported issue submit) where
   the caller actually needs the write to complete before showing success UI. The mixed
   pattern is deliberate, not a bug.
9. **RESOLVED** — `b33df02` (2026-05-07). Prompt injection via `pageNumber`. Note: the original
   finding mis-located the vector in `functions/index.js`. The actual interpolation lives in
   `src/app.jsx:9588` (the `extractBomPage` PDF-native path). Cloud Function `extractBomPage`
   referenced by the client doesn't currently exist in `functions/index.js`. Fix added a
   bounded-positive-integer validator at the top of `extractBomPage` covering both the
   server-callable path and the direct-API path. Hard-throws on invalid input.
10. **OPEN** — Duplicate Firestore member queries in email fan-out. Same `members` collection
    queried twice per recipient when sending engineer-question / supplier-quote notifications.
    Cache once, reuse.

## Round 3 (deploy.sh re-review, 2026-05-07)

Stale Round 1 findings #3, #4, #11 were dropped — they referenced a deploy.sh state that no
longer matches what's committed. Re-reviewed deploy.sh against current reality and found:

12. **OPEN** — No build/JSX validation step. CLAUDE.md claims `deploy.sh` runs `node validate_jsx.js`
    before deploying, but the actual script bumps version → commits → tags → pushes → runs
    `firebase deploy --only hosting` with no compile step. Risk: ships a broken `index.bundle.js`
    if it's out of sync with `src/app.jsx` on disk. Fix: add `node validate_jsx.js` before the
    git commit, with `set -e` already at the top to abort on failure.
13. **OPEN** — Hardcoded `git push origin master` and `git push origin "$NEW_VERSION"` regardless
    of current branch. Running `deploy.sh` from a worktree branch would push the wrong ref or
    refuse the push. Fix: capture `git rev-parse --abbrev-ref HEAD` and either gate on `master`
    or push the current branch.
14. **OPEN** — Silent sed. The `sed -i "s/APP_VERSION=.../APP_VERSION=.../"` exits 0 with no
    replacement if the regex doesn't match. The downstream empty `git commit` trips `set -e`,
    but with a confusing "nothing to commit" instead of a clear "couldn't find APP_VERSION line."
    Fix: capture sed output, diff, abort with a real error if no replacement happened.
15. **OPEN** — No functions deploy + no preflight invocation. `deploy.sh` runs
    `firebase deploy --only hosting`. Cloud Functions changes need a separate manual
    `firebase deploy --only functions` (per CLAUDE.md). The toolkit's `tools/preflight-functions.sh`
    isn't wired in anywhere. Fix: either auto-detect functions changes and run the preflight,
    or add a `--with-functions` flag.

## Toolkit gaps (deferred)

T1. **OPEN** — Pre-commit hook only inspects `.js` files (`grep -E '\.js$'` skips `.jsx`).
    Most of ARC lives in `src/app.jsx` (~2 MB), so the hook is currently silent on the largest
    surface area of the codebase. `node --check` doesn't parse JSX natively — fixing this needs
    a different syntax-check approach (Babel parse, esbuild --syntax, or a small wrapper).
T2. **OPEN** — Pre-commit hook's risk-pattern grep
    (`pricing|quote|margin|markup|bom|firestore|rules|deploy|functions/index`) doesn't match
    `app.jsx` even though pricing/BOM/quote logic actually lives in there. Either expand the
    pattern (e.g. include `app\.jsx`) or accept that `.jsx` coverage is a separate workstream
    from `.js` coverage. Coupled with T1 — fix together.
T3. **OPEN** — `firestore.rules` and other non-JS files (`.rules`, `.json`, `.html`) get no
    coverage from the syntax check or the risk-pattern review. The rfqUploads fix (#1, commit
    `701d693`) committed without any pre-commit feedback. Low priority; add a separate
    rules-syntax check (`firebase deploy --only firestore --dry-run` or similar) if/when it
    becomes a real risk.

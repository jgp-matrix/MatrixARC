# Testing Procedures — Prod vs. Test

## The one thing to remember
`matrix-arc-test.web.app` runs different **CODE** but the **SAME DATA** as production. It is NOT a
data sandbox — every project/BOM/price/BC write on Test is a real production record. Test isolates
the **BUILD**, never the **DATA**. (True data isolation needs a separate test user — blocked by ARC's
one-company-per-user model; tracked under G005.)

## Which environment do I use?

| You want to… | Use | Why |
|--------------|-----|-----|
| Verify a new build's code/UI/logic before it goes live | **Test** | Vet the build, then promote via `deploy.sh` |
| Real day-to-day work (real quotes/BOMs/BC) | **Prod** | Live app; versioning `v1.23.NN` |
| Reproduce a production bug | **Prod** (non-destructive) or **Test** on a throwaway project | Same data both ways; only prod has real email/push |

## Hard rules (both environments — shared data)
1. Only ever use disposable/throwaway projects for test writes.
2. No destructive edits to real projects in EITHER env — a delete on Test is a delete in production.
3. Confirm a project is disposable before injecting test data.

## What behaves differently on Test
- Email + push are **SUPPRESSED** on Test by design — do NOT triage "email/push didn't fire" as a bug on Test.
- BUT the in-app notification **bell** is a client write NOT test-gated → a missing bell CAN be a real bug; investigate + confirm on prod.
- BC mutating writes are redirected/suppressed on Test; reads hit real BC.

## Confirm env + build every session
1. **URL** — `matrix-arc-test.web.app` = Test; `matrix-arc.web.app` = Prod.
2. **Badge** — Test shows the orange ribbon `🧪 TEST ENVIRONMENT · Test V.### (base v1.23.NN)`. Prod shows **NO** ribbon.
3. **Right build?** — the `Test V.###` on the ribbon must match the latest row in `docs/TEST-BUILDS.md`; if behind, hard-refresh.
4. **Prod build check** — `APP_VERSION` / version pill = `v1.23.NN`.

## How Test builds are deployed
Test deploys go through `deploy-test.sh` (repo root), NOT `deploy.sh`:
- Bumps the monotonic `TEST_BUILD` counter (never resets, independent of prod semver).
- Cache-busts the bundle (`index.bundle.js?v=<base>-T<###>`) and writes a `testBuild`-tagged `version.json`,
  so the freshness check auto-reloads Test clients onto the new build (loop-guarded — see below).
- Logs the build to `docs/TEST-BUILDS.md`.
- Deploys `hosting:test` **only**. It never bumps `APP_VERSION`, never tags, and never touches prod hosting.
- `firestore.rules` are **shared prod infra** and are NOT pushed by default — pass `--with-rules` to opt in.

Usage: `./deploy-test.sh "one-line change description"` (or `./deploy-test.sh --with-rules "…"`).

## Freshness auto-reload (why Test now updates itself)
Both `index.html` and `version.json` carry a combined build id: `APP_VERSION` plus `-T<TEST_BUILD>` on
the test host. On load, the client compares its own id to the one in `version.json`; if they differ it
clears caches and reloads once. Prod compares `v1.23.NN` to `v1.23.NN` (no `-T`) → never reloads. Test
compares `v1.23.NN-T###` to itself → reloads exactly once when a NEWER Test build lands. Because the
served `index.html` and `version.json` always come from the same deploy, the ids can never permanently
disagree — so there is no reload loop.

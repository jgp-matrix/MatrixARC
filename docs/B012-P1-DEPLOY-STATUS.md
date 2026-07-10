# B012 P1 — Deploy Status (away-mode note · Marc)

**2026-07-10 (away mode, pull-based):** Coach combined-P1 verdict = **PASS** (COACH.md, commit `a5d33dab` / lines 331 & 338). Per Freddy's away-mode instruction, Marc re-deployed the **combined P1 to the TEST CHANNEL** and is holding.

- **Branch:** `worktree-b012-hard-lock-p1` @ `a7c4bbf2` = `b654c5d6` (base P1) + `d1b1b07e` (keep-alive, Coach-cleared `93f2a211`) + `a7c4bbf2` (Fix B, eligibility-gated claim).
- **Deployed:** `hosting:test` + `firestore:rules` together (Coach's instruction). Rules reported *"already up to date, skipping upload"* → unchanged/idempotent, **no prod behavior change**.
- **TEST** (https://matrix-arc-test.web.app, APP_VERSION v1.23.3) now serving combined P1 — verified markers live in the served bundle: `_eligibleEditor`, `_structuralReadOnly`, `_startLeaseKeepAlive`.
- **PROD** (matrix-arc.web.app, v1.23.4 = F011) **UNTOUCHED** — served bundle has **0** P1 markers (confirmed). **No prod deploy.**
- **HOLDING:** the live matrix re-run — **L5** (Async-Ownership writeback) + **L6** (reviewer resolve/approve under another's presence), plus **L1/L3/L8** and **L7** — needs Jon (away). No further action until Jon returns.
- **Outstanding (awaits Jon / infra):** **G008** storage-bucket CORS for `matrix-arc-test.web.app` (needs gcloud/Cloud Shell — `cors.json` + exact `gsutil cors get`→`set` commands handed to Freddy; prod origin preserved). Needed for image-dependent matrix cases; not a lock-behavior blocker.

**Next on Jon's return:** run L5/L6 (+L1/L3/L7/L8) on `matrix-arc-test` → green matrix → Jon prod sign-off → merge branch to master + `deploy.sh` (prod) + relax the one-editor containment. **B021** (BC-fetch no-timeout / 95% pricing hang) is separate/tracked, not part of P1.

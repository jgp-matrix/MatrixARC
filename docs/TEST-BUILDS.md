# Test Builds Log (matrix-arc-test.web.app)

Append-only log of TEST hosting deploys. Each `deploy-test.sh` run bumps the monotonic
`TEST_BUILD` counter and appends one row here. The counter is **independent of prod semver**
and is **never reset** — prod deploys (`deploy.sh`) never touch it.

The **Build** value shown here is what the orange TEST ribbon displays (`Test V.###`) and what
a tester should confirm against before verifying a build. The **Bundle tag** is the cache-bust
id (`<base>-T<###>`) written to `index.bundle.js?v=` and mirrored in `version.json.testBuild`.

| Build | Bundle tag | Base SHA | Change | Date |
|-------|-----------|----------|--------|------|
| V.007 | v1.23.18-T007 | 2cfc12a | G009 seed — test-env versioning introduced (TEST_BUILD counter + ribbon badge + deploy-test.sh + freshness loop-guard) | 2026-07-14 |
| V.009 | v1.23.23-T009 | a86df6eb | (no description) | 2026-07-22 |
| V.010 | v1.23.23-T010 | 9c88e776 | (no description) | 2026-07-22 |
| V.011 | v1.23.23-T011 | 565d33af | (no description) | 2026-07-22 |
| V.012 | v1.23.23-T012 | c0b447f6 | (no description) | 2026-07-22 |
| V.013 | v1.24.3-T013 | 9cf4c7c4 | (no description) | 2026-07-22 |
| V.014 | v1.24.3-T014 | c640607d | (no description) | 2026-07-22 |
| V.015 | v1.24.3-T015 | 54bd45e5 | (no description) | 2026-07-22 |
| V.016 | v1.24.3-T016 | 38247be7 | (no description) | 2026-07-22 |
| V.017 | v1.24.3-T017 | e979d405 | (no description) | 2026-07-22 |
| V.018 | v1.24.3-T018 | 2e35c355 | (no description) | 2026-07-22 |
| V.019 | v1.24.3-T019 | 02678060 | (no description) | 2026-07-22 |
| V.020 | v1.24.3-T020 | b864b741 | (no description) | 2026-07-22 |
| V.021 | v1.24.3-T021 | a456a6ba | (no description) | 2026-07-22 |
| V.022 | v1.24.4-T022 | 37aca71d | (no description) | 2026-07-22 |
| V.023 | v1.24.4-T023 | 4cd99e36 | (no description) | 2026-07-22 |
| V.024 | v1.24.6-T024 | 6cdf3679 | (no description) | 2026-07-22 |

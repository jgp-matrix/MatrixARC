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
| V.025 | v1.24.7-T025 | 5de11e66 | (no description) | 2026-07-22 |
| V.026 | v1.24.8-T026 | c6bb03b1 | (no description) | 2026-07-22 |
| V.027 | v1.24.8-T027 | fc68b9c3 | (no description) | 2026-07-22 |
| V.028 | v1.24.8-T028 | 2ed3594a | (no description) | 2026-07-22 |
| V.029 | v1.24.8-T029 | 3d3e2c31 | (no description) | 2026-07-22 |
| V.030 | v1.24.9-T030 | 04dbe940 | (no description) | 2026-07-22 |
| V.031 | v1.24.10-T031 | 4f81e495 | (no description) | 2026-07-22 |
| V.032 | v1.24.11-T032 | e24be048 | (no description) | 2026-07-22 |
| V.033 | v1.24.11-T033 | 012aaa52 | (no description) | 2026-07-22 |
| V.034 | v1.24.12-T034 | 660c2cb0 | (no description) | 2026-07-22 |
| V.035 | v1.24.12-T035 | 042c8b37 | (no description) | 2026-07-22 |
| V.036 | v1.24.12-T036 | 67b5c416 | (no description) | 2026-07-22 |
| V.037 | v1.24.12-T037 | 492f413d | (no description) | 2026-07-22 |
| V.038 | v1.24.12-T038 | 3cf97dec | (no description) | 2026-07-22 |
| V.039 | v1.24.13-T039 | 94b2fb0f | (no description) | 2026-07-23 |
| V.040 | v1.24.13-T040 | 4d439492 | (no description) | 2026-07-23 |
| V.041 | v1.24.13-T041 | deda529a | (no description) | 2026-07-23 |
| V.042 | v1.24.13-T042 | 70c13ea5 | (no description) | 2026-07-23 |
| V.043 | v1.24.14-T043 | b9541073 | (no description) | 2026-07-23 |
| V.044 | v1.24.14-T044 | f8f12dd5 | (no description) | 2026-07-23 |
| V.045 | v1.24.14-T045 | 5275618c | (no description) | 2026-07-23 |
| V.046 | v1.24.14-T046 | 271578f3 | (no description) | 2026-07-23 |
| V.047 | v1.24.15-T047 | 0d2c4e56 | (no description) | 2026-07-23 |
| V.048 | v1.24.15-T048 | c460e2e5 | (no description) | 2026-07-23 |

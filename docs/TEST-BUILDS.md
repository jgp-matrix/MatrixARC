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
| V.049 | v1.24.15-T049 | 0a109e68 | (no description) | 2026-07-23 |
| V.050 | v1.24.15-T050 | 1dc59dac | (no description) | 2026-07-23 |
| V.051 | v1.24.16-T051 | 8787e3ce | (no description) | 2026-07-23 |
| V.052 | v1.24.16-T052 | b6c70173 | (no description) | 2026-07-23 |
| V.053 | v1.24.17-T053 | 48b54585 | (no description) | 2026-07-23 |
| V.054 | v1.24.36-T054 | aae00a18 | F068 cross-propagation (full-sync) — cross a part on one Line, offers to cross the same part on the other Lines to B with price+LT+vendor. For Jon verify (disposable project). | 2026-07-24 |
| V.055 | v1.24.36-T055 | 82a751db | F068 LT-timing fix — [Cross all] re-reads source LT at click (re-verify: cross carries lead time) | 2026-07-24 |
| V.056 | v1.24.36-T056 | 2da63905 | (no description) | 2026-07-27 |
| V.057 | v1.24.37-T057 | bb21d7c8 | (no description) | 2026-07-27 |
| V.058 | v1.24.38-T058 | 5994ac88 | (no description) | 2026-07-27 |
| V.059 | v1.24.39-T059 | 79f8fab0 | (no description) | 2026-07-27 |
| V.060 | v1.24.40-T060 | fe6f9a2c | (no description) | 2026-07-27 |
| V.061 | v1.24.41-T061 | 8488268c | (no description) | 2026-07-27 |
| V.062 | v1.24.42-T062 | 87308c90 | (no description) | 2026-07-27 |
| V.063 | v1.24.43-T063 | aee396eb | (no description) | 2026-07-27 |
| V.064 | v1.24.43-T064 | 6a867470 | (no description) | 2026-07-28 |
| V.065 | v1.24.44-T065 | 84b6bec5 | (no description) | 2026-07-28 |
| V.066 | v1.24.44-T066 | 93a9e40f | (no description) | 2026-07-28 |
| V.067 | v1.24.44-T067 | c75d0756 | (no description) | 2026-07-28 |
| V.068 | v1.24.44-T068 | 56f6bb78 | (no description) | 2026-07-28 |
| V.069 | v1.24.44-T069 | ea0c6fe6 | (no description) | 2026-07-28 |
| V.070 | v1.24.60-T070 | 72068708 | (no description) | 2026-07-30 |
| V.071 | v1.24.96-T071 | 3f29a893 | B104 save-race fix: fire-time-latest saves + monotonic _localEditSeq guard + shared save mutex (Coach-approved, pre-prod verify) | 2026-08-05 |
| V.072 | v1.24.97-T072 | 3db46f83 | B101 (6-rung status sequencer §6d) + B096 (reviewer-only TR uncheck + approve-gate) — Coach SHIP-TO-TEST, prod HOLD pending Jon | 2026-08-05 |
| V.073 | v1.24.98-T073 | 46a7fa18 | F092: sent-quote pinning + Quote-Expired Re-Quote button + green Re-Quote tile + 3 status renames (Address Issues / Needs BOM Pricing / In Tech. Review, incl. column headers) | 2026-08-06 |
| V.074 | v1.24.99-T074 | 6bd294a2 | F093: red EXPIRED flag on the Project Card for a sent, pinned quote past its validity window | 2026-08-06 |
| V.075 | v1.24.100-T075 | 0d068fc3 | G024 Export BOM modal + G025 BOM-header buttons right-justified + G026 Drawings-header real buttons right-justified | 2026-08-06 |
| V.076 | v1.24.101-T076 | 46441b8f | F094: amber 'Expires in N Days' countdown on sent-quote tiles within 10 days of expiry (+ F093 EXPIRED) | 2026-08-06 |
| V.077 | v1.24.102-T077 | 50c98843 | B107 fix: controlled LaborQtyInput — background sync no longer eats labor-category keystrokes (Coach SHIP-TO-TEST) | 2026-08-06 |
| V.078 | v1.24.103-T078 | 7f537955 | F095: manual per-group labor-hours entry (editable CUT/LAYOUT/WIRE BOM hrs → override inside computeLaborEstimate → quote/BC/lead-time; MAN.OVERRIDE + RESET TO AUTO; all-zero guard). Coach SHIP-TO-TEST | 2026-08-06 |
| V.079 | v1.24.104-T079 | 14db9f80 | B105: BC Item Browser dash/special-char-agnostic search (normalizeSeparators fallback-on-empty; shared _bcNormPn) — Coach SHIP-TO-TEST | 2026-08-06 |

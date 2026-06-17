# Session State — 2026-06-16 MDT

## Version
v1.20.133 (deployed 2026-06-16). Confidence-"C" 3-signal ladder (#146) + RYAN orphan-account incident chain (#143 boot-failure handling, #144 removeTeamMember orphan-fix) + SendGrid email restored (#145) + #95 closure. Stable, live-verified.

## Deploy State
- Master tip: f862e49e ("Release v1.20.133")
- Local master == origin/master (synced)
- Latest tag: v1.20.133
- v1.20.133 is a close-out version stamp (no code change since v1.20.132 — the #146 ladder shipped in v1.20.132). #144 shipped via `firebase deploy --only functions` (no client version bump).

## Recent Commits (last 15)
- f862e49e Release v1.20.133
- 3f724417 docs: SendGrid sender-review invite-email sample (HTML + rendered PNG)
- 9cf2d630 TODO #148: re-rank HIGH -> LOW (latent flaw, zero live exposure)
- 14241a89 #146 RESOLVED — confusable-glyph over-downgrade replaced with 3-signal confidence ladder (v1.20.132)
- 86521d03 Release v1.20.132
- 2ca981da COACH.md: add supplement-durability convention (commit specs at creation)
- ec3dbd03 Coach supplements + COACH.md: #143/#144/#146/#137 specs (durable record)
- 36c1515d TODO #149 (MEDIUM): backfill stale confidence "C" circles on existing projects
- 50fc9fc3 TODO: #95 RESOLVED (H5/600-DPI, re-validated on PRJ402119) + H5 re-triage notes
- 15a088ca TODO: #137 APPROVED (two-phase, ready) + add #148 HIGH (reviewUploads URL exposure)
- d6595614 #144: removeTeamMember clears orphaning profile fields atomically
- e648e853 Add tools/audit-orphans.js — read-only orphaned-profile audit (#144 Q4)
- 6de46f05 TODO #146 (MEDIUM): confidence "C" circles over-firing — investigation first
- dde26d92 #143 RESOLVED — boot-failure handling shipped (v1.20.131)
- b361d20e Release v1.20.131

## Headline: RYAN orphan-account incident closed end-to-end + confidence-"C" ladder shipped
Diagnosed and fixed the RYAN eternal-spinner (orphaned profile: companyId set, no member doc). #143 makes boot fail gracefully; #144 closes the orphan-creation path. Restored all transactional email (#145, SendGrid account reactivation — no code change). Closed #95 (H5 fixed the glyph-misread root cause, re-validated on PRJ402119). Replaced the over-firing confidence-"C" regex with a 3-signal ladder (#146). 9 releases referenced; key client releases v1.20.131 (#143), v1.20.132 (#146); #144 functions-only.

## Shipped This Session — RESOLVED

### #143 Boot-failure handling (v1.20.131) — RESOLVED
Extracted the boot IIFE into re-entrant-safe `runBoot(user)` (tears down member onSnapshot before re-subscribe, resets state). try/catch: `setLoading(false)` on every terminal path; `console.error("[ARC boot]",…)`; two-branch INLINE Dashboard surface — `permission-denied` → "contact administrator" (no Retry) vs other → "Couldn't load projects" + Retry; transient codes auto-retry ≤2× (2s), manual Retry resets the budget. Live-verified happy path + permission-denied discriminator; error-render branches inspection-confirmed (no re-orphaning). Coach C87.

### #144 removeTeamMember orphan-fix (functions deploy) — RESOLVED
`removeTeamMember` now runs an atomic batch: delete member doc + `set({merge:true})` profile with `companyId`/`role` `FieldValue.delete()`. Closes the orphaned-profile creation path; preserves firstName; `{success:true}` unchanged. `tools/audit-orphans.js` (committed) → 0 existing orphans. Coach C88.

### #145 SendGrid email restored — RESOLVED (no code change)
The 7-week 401 was an expired SendGrid account, not a bad key. Account reactivated (Essentials 50K); existing key authenticates again. Verified live: deployed `sendInviteEmail` → 200, Email Activity `status:"delivered"`. All transactional email paths recovered (shared key).

### #95 PRJ402119 PN accuracy — RESOLVED
H5 region-targeted 600-DPI tiling + Opus 4.8 (v1.20.112–113) fixed the glyph-misread root cause (image-fidelity confirmed). PRJ402119 re-extracted → Jon-confirmed 100% PN accuracy. Structural errors covered by #97.

### #146 Confidence "C" 3-signal ladder (v1.20.132) — RESOLVED
Replaced the v1.19.975 context-blind confusable-glyph regex (matched 20/36 alphanumerics → downgraded ~100% of rows) with: (1) exact-BC → high authoritative (both pricing paths `:14898`/`:26376`); (2) pdf-native → high unless model flagged low/medium; (3) vision → trust model; (4) regex removed. Display-layer only, no send-gate interaction. Verified 52%→10% circle rate (meaningful minority tracking genuine model doubt). Coach C90.

## Top of Queue (Jon to direct)
1. **#137** Customer Portal — digital Quoted BOM approval. APPROVED, two-phase build ready (Phase 1 security-first bomApprovals/{token} + portal; Phase 2 write-back + surfacing incl. expired-unanswered state). Coach C89 / docs/137-SUPPLEMENT.md is the spec. NOT started.
2. **#149** Existing-project exact-BC backfill — UNBLOCKED (was gated on #146 core, now deployed). Needs Coach persist-safety confirm + spec.
3. **#146 backfill** is #149 (above).

## Open Items / Watch
- **#140** WATCH (post-#139): first-extraction bomVersion seed reliability.
- **#83** narrowed to "fail-visibly-on-fallback" only (H5 delivered the high-DPI render half).
- **#85** downgraded (H5 cut misreads; independent-source cross-check gap remains).
- **#148** reviewUploads getDownloadURL() permanent-URL flaw — LOW (downgraded: unfinished portal, zero live exposure; fix as part of portal redesign with signed-URL-via-CF, not a standalone patch).

## Parked Backlog
- #80 (feedback dedup key), #81 (anomaly-detection warning), #98 (foundational accuracy measurement — NOT addressed by H5; remains the rigorous-measurement question), #99 (long single-column completeness), #101 (Estimator's-Eye milestone), #128 (Drawing Reference band), #142 (red "+BC" pill redundancy — Coach), #129 (usage telemetry, needs Brief).

## Known Tooling Gaps
- **T9** Claude-in-Chrome MCP can't navigate to non-prod / file:// origins. Workaround: render via puppeteer-core + system Chrome, or `tests/extraction-baseline/h5-headless.js`.

## Open TODOs
~76 OPEN findings in TODO.md.

## Working Tree
- Branch: master (up to date with origin/master at f862e49e)
- Clean

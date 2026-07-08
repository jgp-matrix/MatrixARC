# G005 §10 Verify — CONTINUATION BRIEF (for a fresh Marc session)

**From:** Freddy (hub) · **Date:** 2026-07-07 · **Read this, then resume the verify tail + final flip.**

## State (nothing half-broken)
- **G005 Phase 1 code is Coach-APPROVED** — client `c01e9a53` + server `a23f9ba9` + bulkMfrLookup fix `f4880084`. All on master (tip is later due to Freddy's doc commits).
- **Functions are DEPLOYED** (deploy step 1 of 2) — prod-safe, gates default-false → prod byte-identical. All 32 functions live.
- **Client is on matrix-arc-TEST hosting only** — NOT on prod. Prod users still on v1.23.2.
- **✅ MONEY-PATH PROVEN** (the demonstrated harm): §10-1 (IS_TEST_ENV true), §10-2 (bcGatedFetch BLOCKS a non-sandbox write / ALLOWS a sandbox write), §10-3 (bulkMfrLookup dryRun:false+isTest → patched:0), §10-6 (TEST-MODE banner). Coach is results-reviewing this proof.

## Your task — run the PENDING §10 tail autonomously (controlled tab), then the final flip
FIRST: open + LINK + STAMP the controlled tab (`document.title='🤖 CLAUDE-CONTROLLED ▸ ARC'`) on **https://matrix-arc-test.web.app** (re-stamp after reloads). Confirm/create the throwaway TEST COMPANY (`isTestCompany:true`, `bcEnvironment.env → MATR_SndBx`) if the prior session didn't persist it. **All synthetic data on the TEST COMPANY only — never a real project (the PRJ402096 near-miss lesson).**

Pending steps (same isTest/isTestCompany mechanism already Coach-approved — confirmatory):
- **§10-4 client email suppress:** send an RFQ + a quote + a customer-review from test → console shows "[TEST-ENV] email suppressed", no real send.
- **§10-5 server triggers:** inject a test `rfqUpload` (fires onSupplierQuoteSubmitted) + file a debug issue under the test company (onIssueReported) + send a review (onCustomerReviewSubmitted) → `firebase functions:log` shows each SKIPS (reads isTest / isTestCompany / reviewUploads.isTest) → no SendGrid/Teams/push.
- **§10-6 callables:** team invite + engineer-question email from test → suppressed.
- **§10-7 left-on:** run an extraction on test → WORKS (Anthropic not gated); bcEnqueue → no queued op.
- **§10-8 prod regression:** on the PROD host, spot-check ONE BC write + ONE email fire normally (byte-identical; IS_TEST_ENV false).
- **Jon's ONE batched check:** after 4/5/6, ask Jon once to confirm his real email inbox + Teams stayed empty. Keep his burden to that single glance.

## Then: report → review → FINAL DEPLOY (step 2 of 2)
Report per-step PASS/FAIL to Freddy → Coach results-reviews the tail → **Jon's FINAL go on the client hosting→prod flip** (`bash deploy.sh` from the main checkout — bumps version, deploys hosting:production). That completes G005 Phase 1. STOP + flag Freddy on any FAIL.

Tracker context: TODO.md G005 entry (the §10 VERIFY IN PROGRESS + VERIFY RESULTS notes). Coach's steps: COACH.md tip e076b902.

# Session State — 2026-07-07 MDT (regen at close-out · G005 Phase 1 SHIPPED v1.23.3 · backlog fully scoped + categorized · B009 parked)

## Version
**v1.23.3** (deployed 2026-07-07, PRODUCTION). G005 Phase 1 test-env firewall (client) + Functions gates live.

## Deploy State
- **Master tip:** `dc14eea8` (close-out docs). **Release commit = `d373a510` (v1.23.3)**. `master == origin/master`. No feature branches.
- Production: **https://matrix-arc.web.app** serving **v1.23.3**. Functions ALSO deployed this session (G005 server gates; prod-safe default-false).
- **Working tree:** 2 UNTRACKED files present — `BACKLOG-REVIEW.docx` + `BACKLOG-REVIEW.html` (NOT ours — likely Dez's legacy-screen output; left for their owner, do not sweep).

## ⭐ NEXT UP — analyst leads (ranked)
1. **★ G005 §10-8 PROD-REGRESSION SMOKE — FIRST task.** G005 Phase 1 just shipped to prod; confirm on prod (v1.23.3) that a normal BC write + an email fire NORMALLY (IS_TEST_ENV false → byte-identical). Fast sanity that the flip didn't regress prod. Then §10-1 spot (banner absent on prod).
2. **#192 BUDGETARY false auto-revert — fix FIRMED + SHIP-APPROVED (build it).** Two correct-by-construction gates before the auto-revert prompt: Gate 1 SETTLED (bail if bg reprice in-flight; `_bgTasks` signal), Gate 2 STABLE (re-confirm no-red after settle). Jon ruled ship-now. Build → Coach quick-review → deploy; keep instrumentation 1 cycle then strip. Spec: `docs/192-FREDDY-FIX-BRIEF.md`.
3. **G005 mutating-tail live demo (§10-4/5/6/7)** — DEFERRED: BLOCKED by no isolated test company (1-company-per-user, no switcher). Needs a dedicated test USER account (Jon creates) OR Phase 2. Covered by-construction meanwhile (Coach). Resume: `docs/G005-VERIFY-CONTINUATION.md`.
4. **Features cluster F004/F005/F007/F008** — scoped, build-ready as ONE batch. **F008 ~90% already built** (banner + `_system/version` broadcast); **F007 sort infra exists**; F004/F005 small. Next: Coach touch-point confirm → build. Brief: `docs/F004-F005-F007-F008-CLUSTER-BRIEF.md`.
5. **Bugs cluster B008/B011/B005** — scoped. B008 (Supplier-Portal link keys `sub.id` not `uploadToken` @20354) + B005 (readOnly re-arm) small; B011 money-path (harden `lineItems` writes @31304/31340/32004/32147, `_nullifyUndefined` Date/Map caveat). Brief: `docs/B008-B011-B005-BUGS-SCOPING-BRIEF.md`.
6. **MED features F006/#197/#198** — scoped, TRACE-GATED (Coach code-trace before build). #197 (ship-date calc EXISTS @1261, re-anchor to PO-received); #198 (review-lock has an auto-clear @34140 — trace WHY it sticks); F006 (needs per-send doc snapshot). Brief: `docs/F006-197-198-SCOPING-BRIEF.md`.
7. **G005 Phase 2** — separate Firebase project + dedicated test user. The REAL data-collision fix AND what unblocks the mutating-tail live demo. Now well-motivated (Phase 1's test-company mitigation is blocked by the 1-company-per-user architecture).
8. **#194 global email/metrics** — needs a PRODUCT conversation with Jon (what metrics matter) before scoping. Not blind-scopable.
9. **Relevance/staleness pass over the remaining ~87 legacy items** — the bigger backlog-shrink lever (Dez teed up); needs Coach/Marc reads + Freddy ranking.

## What shipped this session (2026-07-07)
- **G005 Phase 1 — test-env isolation firewall. SHIPPED v1.23.3.** `IS_TEST_ENV` (hostname) gates ALL external side-effects on the test host: all **14** client BC writes routed through the single `bcGatedFetch` belt (plan said 2 — caught by re-grep); client email (3 sites) suppressed; server triggers/callables gated (isTest/isTestCompany); `bulkMfrLookup` server-side BC write gated (the one exception to "BC is client-side"); TEST-MODE banner; test BC → sandbox `MATR_SndBx`. **Money-path/ERP-write harm PROVEN CLOSED** (§10-1/2/3/6 live). Three independent review passes each caught a real enumeration miss. Brief: `docs/G005-TEST-ENV-ISOLATION-BRIEF.md`; Plan: `docs/G005-COACH-BUILD-PLAN.md`.
- **Quick-win batch — SHIPPED v1.23.2** (`9d89f26b`): G006 (portal copy), #190 ("Save"→full-modal confirmed), #195 (false BUDGETARY entry), B002 (state-aware TR message), B001 (OAuth trailing-dot), B003 (RFQ-Apply not-quoted list hidden).
- *(Earlier in-session, RESOLVED in tracker: F002 v1.21.26, F003 v1.22.0, checkbox/B006/B007 v1.22.1-.3, F001 v1.23.0, B010 v1.23.1.)*

## Key state carried forward
- **B009 (supplier-cross TR auto-stamp clears) — PARKED.** Not reproducible in v1.23.1 (the awaited-save B004 prevents the hypothesized race); Jon "it's good." Belt fix plan BANKED (`docs/B009-COACH-FIX-PLAN.md`, recency-stamp) — ready if it recurs. Synthetic test data cleaned; PRJ402096 (a REAL customer project — near-miss) restored 11/11. BC writes landed in sandbox (not prod).
- **Backlog fully SCOPED + CATEGORIZED.** All actionable items have Briefs (above). Legacy: 91 open `#N` items tagged B=45/F=27/G=19 (tag-only, keeps #N) — index `docs/LEGACY-BFG-CATEGORIZATION.md`; 4 stale closed (#24/#75/#76/#96). Backlog is ~50% bugs (several money-path/BC).
- **G005 harm scoping (don't over-claim):** BC/ERP-write harm = PROVEN CLOSED. Firestore data-collision = Phase-1 PARTIAL (test-company convention, itself blocked) → full closure is Phase 2.

## Team workflow state (unchanged; see CLAUDE.md)
- **Per-phase gating** (HOLD after each phase for Jon's "go"; a question FREEZES the team; deploy is its own Jon checkpoint; Freddy minimizes sends — Allow-Once is per-send/hardcoded, G001).
- **Hub-and-spoke through Freddy**; **hybrid routing** (low-stakes mechanical → subagents, Jon-gated; high-stakes → 4 standing sessions). Subagent used successfully this session for the 91-item legacy categorization.
- **Close-outs + startup orchestrated by Freddy.**

## Session lessons (carry-forward)
- **Treat plan enumerations as a FLOOR, verify independently.** On G005 the layered review caught 3 real misses: BC sites 2→14, the server-side sweep, and an ungated *server-side* BC write (`bulkMfrLookup`) that the "BC is 100% client-side" assumption hid. On a money-path change, re-grep every count.
- **Test-env isolation is architecturally blocked at Phase 1:** `companyId` is 1-per-user-profile with no switcher, so a "test company" can't be cleanly used without a dedicated test USER; setting `isTestCompany` on the real company doc would regress prod. → Phase 2 (separate project + test user) is the real fix.
- **Functions deploy is shared test+prod** — but prod-safe when every server gate is isTest-conditioned + defaults false (prod byte-identical). Deploying Functions to enable a test-only verify is safe by construction.
- **Confirm a project is a throwaway before test-data injection** (the PRJ402096 near-miss); prefer the app's own save handlers over raw writes; there are 2 server-side BC writers (`bulkMfrLookup` gated; `writePricesToBC` in codaleScheduler — not test-reachable, latent follow-up if UI-wired).

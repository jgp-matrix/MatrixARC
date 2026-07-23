# Session State — 2026-07-22 MDT · prod ACTIVE at v1.24.13 · big dashboard/notifications batch shipped

## Operating model (READ FIRST)
**Subagent-lane model is the default** (Jon's standing preference). One Freddy session in CCD with full repo access spawns **Marc** (build/fix) + **Coach** (review/diagnose/scope) as in-session Agent-tool lanes, **role-announced every spawn**; Freddy is sole git-writer + sole notifier, owns Dez's files (STATUS.md/INBOX.md) directly. Flow: **build (worktree) → cherry-pick to master → test deploy → Jon eyeball → prod deploy**; money-path/data-safety = Coach review before prod. Worktree isolation used for parallel builds (disjoint regions → clean cherry-picks). Startup: `/ARC-team-Startup`; close-out: `/ARC-team-Closeout`. Full spec: FREDDY.md "★★ CURRENT OPERATING MODEL" + memory `feedback_subagent_lane_model_preferred`.

## Version
**v1.24.13** (PRODUCTION) — release `c061a06b`, 2026-07-22. Session ran v1.23.22 → v1.24.13. Prod is **ACTIVE** (Jon back, no freeze).

## Deploy State
- **Master tip:** `a0904296` (handoff refresh atop the v1.24.13 release). `master == origin/master`, working tree clean.
- **Production:** https://matrix-arc.web.app serving **v1.24.13**.
- Test channel: matrix-arc-test.web.app last at **V.038** (dashboard + B051 + Email panel — all since shipped to prod).

## Shipped this session (v1.23.23 → v1.24.13) — all Coach-reviewed where money-path/data-safety, Jon-gated deploys
- **B043** — Ryan RFQ hardening (sender-confirmation + blank-supplier-email path).
- **User To-Do Dashboard epic:** **F025** (right-side rail: role-aware status pills + timer-sorted "Needs Attention" list w/ inline RFQ rows), **F026** (8-column status split + per-status timestamps), **F027** (MANAGER role + priority pin), **F032** (role-differentiated dashboard: salesman/reviewer/designer, from Andrew's feedback), **F033** (rail persists on every nav tab + full-height divider). **F025 3b** = the Needs-Attention list + RFQ awaiting rows (closed Ryan/Noah's founding ask). Font-size bump on the tiles.
- **F028** — admin toggle to RFQ all items ignoring Priced Dates (dual-ERP lag).
- **Notifications:** **B045** (bell never worked — index-free listener + logging handler), **F031 #1** (per-item Clear ✕), **#3** (handled "safe to clear" note), **#4** (batch-clear button), **#2** (deep-link to the specific RFQ submission — needed a 2-bug fix: mark-read-before-guard + auto-open race). **B049** (review/all-type notifications now navigate; re-enabled dead customer_review/issue_report deep-links). **B050** (post-review bell notification, fires to designer at PO-receipt).
- **B047/B046** — ProjectTile owner/EDITING name overflow + first-name-in-header.
- **B048** — To-Do rail load delay: localStorage warm-cache + reactive recompute on salesperson-roster land (rail+board share the version bump, `_isMyProject` not forked).
- **B018** (money-path) — phantom-red BC rows: `_effectivePriceDate` SSOT accessor (BC rows use `bcPoDate` for staleness) routed through red-flag + send-block count + column; fixed false Send-block + silent auto-Budgetary. + split-by-reason send-block overlay ("N block Send: pricing · M flagged for lead time"). Confirmed live on prod.
- **F030** — dedicated MY DASHBOARD page (first nav tab): page-mode TodoRail + project rows w/ $ totals + live notifications; rail auto-suppressed on it. 3 layout rounds per Jon.
- **F029 slice-1** — F030 📧 Email panel shows the user's relevant Outlook emails (high-importance + RFQ, via existing Graph/MSAL; read-only, zero Firestore persistence, poll not push, graceful Connect-Outlook). Coach privacy-approved.
- **B051** — triangle/multi-line markup render fix (unit viewBox + non-scaling-stroke; SVG `points` can't use `%`).

## In flight (as of close)
- **🔍 Coach scope lane running: F035 + F040 (interactive markup)** — move/resize placed shapes + shape-notes-beside-shape-movable-with-leader-line. Will produce a build-ready plan + slice order (move-first likely) + a note-position add-only data model. **Capture its output into a doc next session** (or it landed at close — check `docs/`).

## Engineer review-markup feedback — triaged + numbered (`docs/ENGINEER-FEEDBACK-TRIAGE.md`)
**B051** ✅ shipped. Queued: **F034** (click list→highlight shape), **F035** (move/resize shapes — scoping), **F036** (edit note text + wrap — ⚠ verify pin-edit already exists vs shape-note; Jon input), **F037** (highlighter tool), **F038** (free-text markup — ⚠ Jon product call: text tool vs note variant), **F039** (Escape reverts part#/qty edit), **G014** (per-page markup group spacing). **F040** (notes beside shape + leader) filed this session.

## Pending Jon (non-blocking)
- **B051 prod-verify:** draw a triangle + multi-point line on PROD (test ribbon covered the tools on test → G015) + decide the **circle→oval on non-square pages** question (leave, or add `<ellipse>` aspect-comp follow-up).
- **F036 / F038** clarifications (deferred; sensible defaults chosen — see triage doc).
- **G015** — test ribbon overlaps the markup toolbar; offered to fix (z-index/auto-hide) so drawing-review is testable on test.

## Backlog / parked
- **F029** phases: A (two-way To-Do sync, `Tasks.ReadWrite`), C (email↔Project linking), D (tab-closed background) — plan `docs/F029-PLAN.md`; slice-1 email panel done. "Pinned" email rule still tabled (Graph doesn't expose it).
- Non-blocking nits: F031 #2 (rare abnormal-data dead-click) + `_navigable` projectId consistency; B018 (`_redReasonBreakdown` #192 instrumentation drift; optional poll-hardening to sync priceDate on dateChanged); F029 slice-1 (button-handler unmount guards; dead `conversationId`).
- Older: B016-2/3 (deferred), tech-review cluster (B024-B027/F017/F018), ~90 legacy `#N` items.

## Next-session startup
1. Boot via `/ARC-team-Startup` (subagent-lane model).
2. Prod is **v1.24.13, ACTIVE** (no freeze).
3. Check `docs/` for the **F035/F040 interactive-markup scope** (Coach lane was finishing at close) → present plan + build (move-first).
4. Likely-next: the markup interactive cluster (F035/F040), then F034/F037, and F036/F038 pending Jon's clarifications; G015 test-ribbon fix if Jon wants it.

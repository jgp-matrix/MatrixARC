# Session State — 2026-07-14 MDT · 🧳 Jon AWAY ~4 days (back ~07-18) · prod FROZEN at v1.23.22 · NO deploys/changes until return

## Operating model (READ FIRST)
**Subagent-lane model is the default** (Jon's preference, endorsed 2026-07-12; used all of the 2026-07-14 session, works well). One Freddy session in CCD with full repo access spawns **Marc** (build/fix) + **Coach** (review/diagnose/scope) as in-session Agent-tool lanes, **role-announced every spawn**; Freddy is sole git-writer + sole notifier, owns Dez's files (STATUS.md/INBOX.md) directly, and drives the Claude-controlled prod tab for read-only diagnosis + Jon-gated data ops. Flow: **build → Coach review → Jon deploy gate**; high-stakes/data-safety = Coach review + live verify. Startup skill: `/team-sub-start`. Full spec: FREDDY.md "★★ CURRENT OPERATING MODEL" + CLAUDE.md startup-variants table + memory `feedback_subagent_lane_model_preferred`.

## Version
**v1.23.22** (PRODUCTION) — F024 ACTIVE ECO board column (release `06f93e00`, 2026-07-14). Prior session baseline was v1.23.5 (B012 P1 lock, 2026-07-10); the 2026-07-14 session shipped v1.23.6 → v1.23.22.

## Deploy State
- **Master tip:** current HEAD (this SESSION-STATE + FREDDY.md handoff refresh) atop `1e861a3c` (F024 shipped). `master == origin/master`.
- **Production:** https://matrix-arc.web.app serving **v1.23.22**. Working tree clean, everything pushed, no lanes running.
- **🧳 PROD FROZEN:** Jon is away ~4 days (2026-07-14 → ~07-18) and does NOT want ARC changed before/while he's gone. **No deploys or prod changes until he returns.** (Handoff-doc edits like this file are fine — they don't touch the app.)

## Shipped this session (v1.23.6 → v1.23.22), all Coach-reviewed + Jon-gated
- **BC-reliability chain:** B021, B013-1, B013-2/3, F019.
- **Quote:** B033, F020, F005, F021 (+ quote heading "Project Name: <name> - <customer> / PROJECT #: <cust#>"), G012.
- **B034** sent-quote revision bump (+ the send-anchor **regression fix** v1.23.16 after Jon's live test) · **B041** `_noBumpWrite` guard (background saves don't bump a sent quote).
- **Board:** F023 (click-header column filter), F024 (ACTIVE ECO column; (BOM) IN PROCESS now pre-PO-only + yellow), "(BOM) IN PROCESS" rename.
- **BC item create:** B038 (auto-retry transient empty-No.) + B039 (tighten).
- **F022** PO Received drag-n-drop upload + BC attach + View PO.
- **G009** Test V.### env-build versioning + `deploy-test.sh` + `docs/TESTING-PROCEDURES.md`.
- **Loose-ends:** B035, B036, B037.

## Data operations (Claude-controlled prod tab, Jon-gated, verified)
- **B040** — 7 sent quotes healed out of In Process (re-anchored quoteSentRev=quoteRev).
- **B042** — 36 duplicate `arc-<hash>` empty import stubs archived to `companies/{cid}/projects_archive` (restorable, tagged `_b042KeepId`) + deleted; projects 128→92, 0 dups remain; import dedup guard fixed (v1.23.21) so no new dups.

## Parked for Jon's return (all filed; prod NOT exposed)
- **Quick-wins batch (unstarted — Jon paused it before leaving):** Triangle-not-rendering markup bug (eng #4, quickest win), purchasing-board ECO nit (F024 follow-up), B023 (quote-summary pill overflow), G007 (leftover TEST upload bar), B030 (silent-catch log), B029, B022.
- **Engineer Review-markup feedback** → `docs/ENGINEER-FEEDBACK-ON-REVIEWS.md`.
- **Live-verify-later (non-blocking):** B039 (BC transient carries `No.: ''`), F022 disposable-BC PO test, B041 unlock re-test, `deploy-test.sh` run.
- **B016-2/3 (concurrent row-merge) — DEFERRED:** unshipped + 108-commit-stale + no open data-loss (B012 lock contains it); branch `b016-23-merge` preserved for a future rebuild.
- **Backlog:** F014-B, F007/F016, tech-review cluster (B024-B027/F017/F018), ~90 legacy `#N` items.

## Next-session startup
1. Boot via `/team-sub-start` (subagent-lane model).
2. Prod is **v1.23.22, FROZEN until Jon confirms he's back** — do not deploy/change until then.
3. When Jon returns: resume the **quick-wins batch** (Triangle bug first).

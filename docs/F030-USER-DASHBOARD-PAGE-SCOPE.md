# F030 — User Dashboard PAGE — Coach scope + Jon decisions (build-ready)

**2026-07-22. Effort M — assembly, not new engine work: the F033 rail-suppression hook already exists and every data path is an existing SSOT. ARC-native, standalone-shippable, ZERO Outlook/F029 dependency (Jon sequencing directive: F030 ships BEFORE the Outlook tie).**

## Jon's decisions (2026-07-22)
1. **Nav: label "MY DASHBOARD", placed FIRST/leftmost** (before SALES) — the personal landing view.
2. **Notifications window: UNREAD-ONLY for v1** (reuse the bell's live listener exactly; zero risk, real-time out of the box).
3. **v1 body: attention-style project ROWS + $ totals** (reuse the scoped set + existing total math; NOT the heavy Dashboard kanban tiles).

## 1. Nav integration (file:line — re-locate by content, lines drift)
- `NAV_TABS` array `:46714` (`{id,label,icon}`, 5 entries) → **add** `{id:"user_dashboard", label:"MY DASHBOARD", icon:"📋"}` **as the FIRST entry**.
- Tab bar render maps `NAV_TABS` `:49626`; active = `navTab===t.id` `:49627`; click `setNavTab(t.id)` `:49641`. `navTab` state `:48218`.
- Page-body: navTab blocks `{navTab==="X"&&(…)}` at `:49673–49677` inside main content column `:49662` (`overflowY:auto`). **Add** `{navTab==="user_dashboard"&&(<the F030 page block>)}`.
- **Do NOT add to `projectListingTabs`** (`:49251`) — so clicking a project from the page routes via `handleOpen` (`:49247`) → `projectOriginTab="projects"` + `setNavTab("projects")` (`:49252–49254`) → ProjectView opens on Sales cleanly. No back-button special-casing.

## 2. Rail suppression — ALREADY WIRED, zero new code
`:49763–49768`: `const _f030Active=navTab==="user_dashboard";` … `if(_projectViewOpen||_f030Active||showSearch)return null;` before `<TodoRail>`. Adding the nav id makes `_f030Active` true on the page → rail auto-suppresses.

## 3. Pills + Needs Attention list — page-mode TodoRail (reuse, do NOT fork)
Pills, `_sections` memo (`:44777`, deps `[projects,uid,salesCacheVer]`), attention filter/sort (`:44859–44873`) + render (`:44912–44952`), `_pill` (`:44839`), `_grid` (`:44852`), `<aside width:380 borderLeft>` (`:44878`), collapsed strip (`:44824`) all live INSIDE `TodoRail` (`:44774`).
- **Add a `pageMode` prop to `TodoRail`:** in page mode → force expanded (skip the `:44824` collapsed strip), swap the `width:380`/`borderLeft` `<aside>` for a full-width block, widen `_grid` to more columns. **Every data path reused byte-identical** (`_sections`/`_dashboardRoles`/`_todoBucketOf`/timers/`_rfqAwaitingSummary`/attention sort) → the page cannot drift from the rail (avoids the 3a fork risk that a `_sections` extraction would create).

## 4. Live notifications window — reuse bell infra, factor ONE shared row renderer
- State `notifications` `:48294`; `onSnapshot` `:48361` (index-free, `orderBy createdAt desc limit(50)`, client filter `read!==true` = **unread-only**) — already live → **no new listener**, real-time free.
- Helpers (App scope): `handleNotifClick` `:48501`, `markAllNotifsRead` `:48542`, `markNotifRead` `:48549`, `_isNotifHandled` `:48556` (SSOT), `markSafeToClearNotifs` `:48560`; `rfqStatusMap` `:48437`; `_navigable` gate `:49525`.
- Bell row markup is INLINE JSX `:49516–49551`. **Extract it into ONE shared `renderNotifRow(n)`** (or `<NotifRow>`) called by BOTH the bell dropdown AND the page window — do NOT fork.
- **Render the F030 page as a block inside App's return** (like other navTab blocks) so it has closure access to `notifications` + all helpers — no prop-drilling.
- Window = header (Mark all read / "✓ Clear received (N)" reusing `markAllNotifsRead` + `_isNotifHandled` count) + scrollable list of `renderNotifRow` over `notifications`.
- **v1 = unread-only** (decision 2). (History = a later add-only 2nd query without the `read!==true` filter; not v1.)

## 5. Project rows + $ totals (decision 3)
$ totals derivable from loaded data — pattern at `buildArcContext` `:48574` (`panels→bom→ qty*unitPrice`). Reuse the scoped `salesProjects` set; render compact attention-style rows (PRJ#/name/status/timer + $ total). Do NOT import the heavy `Dashboard` kanban tile component.

## 6. Layout / role-awareness
- Renders in page-body container `:49662` (responsive). Two regions: pills + Needs Attention (+ project rows) main column; **live notifications window** side/stacked panel.
- Role sections via `_dashboardRoles(uid)` `:16649` — inherited free through page-mode `TodoRail` (reviewer/designer/salesman, same as F032).
- **Leave a documented insertion point** for F029: `{/* F029 mounts here: Outlook tasks + mail/meeting awareness */}` — so the Outlook layer slots in additively later WITHOUT restructuring.

## Deferred (NOT v1)
- F029/Outlook (tasks list, mail/meeting awareness) — mounts into the placeholder later.
- Separate ECO list, Quotes-Sent weekly follow-up view, 40h/24h idle-flash (needs new last-opened data + a Jon decision), per-category Settings timers (that's F025-3c), F027 manager priority-pin sort (`_priorityPinCompare` `:44763` exists, wire when F027 lands).

## SSOT / data-safety
- Do NOT fork `_dashboardRoles`/`_todoBucketOf`/timers/`_rfqAwaitingSummary` — reach via page-mode `TodoRail`.
- Do NOT fork notification logic — ONE shared `renderNotifRow` + reuse the existing helpers/state/listener.
- Read-only page; no new Firestore writes (mark-read reuses existing add-only `read:true`). Any future history query is add-only.

**Edit surface:** `NAV_TABS` (+1) · new navTab render block in App return · `TodoRail` (+`pageMode`) · extract `renderNotifRow` (shared bell + page). **M.**

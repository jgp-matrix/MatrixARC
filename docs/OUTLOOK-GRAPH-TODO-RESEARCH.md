# Research: Outlook Tasks sync + in-ARC time-management/awareness tool (Graph)

**Research/architecture lane · 2026-07-22 · read-only (code + web). Decision-informing — NOT a build/plan-to-build.**
Source questions (Jon): (1) manual To-Do list in ARC that syncs with Outlook Tasks; (2) a "Co-Work" tool organizing tasks + emails + meetings; (3) refinement — a **time-management tool that proactively surfaces + NOTIFIES** the user of key emails/meetings/tasks they might miss while heads-down in ARC (meeting-coming-up + important-email alerts).

## Foundation — ARC already has the Graph stack (the enabler)
- **MSAL browser OAuth live in prod:** `msal.PublicClientApplication` (`src/app.jsx:1784`), clientId `75b9ff22-488d-4d4c-88ec-f803f7038716` (`:345`), single-tenant authority = Matrix's tenant `d1f2c7f7…` (`:343`), redirectUri = origin (trailing-dot stripped, B001). **`cacheLocation:"sessionStorage"`** ← per-tab token durability constraint (B013).
- **Graph token:** `acquireGraphToken()` (`:1883`) silent-first → popup; pre-warmed after BC sign-in (`tryGraphTokenSilent` `:1872`).
- **Scopes ALREADY consented:** `GRAPH_MAIL_SCOPES` = `Mail.Send, Mail.Read, Mail.ReadWrite` (`:1870`) — working in prod ⇒ this tenant permits **user consent** for delegated Graph scopes (no admin wall for that class).
- **Graph already in use:** `sendGraphEmail`→`/me/sendMail` (`:8610`); `graphSearchEmails`→`/me/messages?$search` (`:8626`); attachments, replyAll, message-body reads. **ARC already reads/searches/sends Outlook mail.**
- **Server side has NO Graph** (`functions/` = Anthropic/SendGrid/DigiKey only) → all Graph today = browser-side delegated tokens; no app-only/daemon path.
- **ARC-native items would persist** in Firestore `users/{uid}/…` (add-only, no caps, per Data-Retention).
- **Consent:** adding `Tasks.ReadWrite` + `Calendars.Read` = **incremental user-consent** on the same app (one popup, `Tasks.ReadWrite` admin-consent NOT required). Caveat: if the tenant ever disables user consent org-wide it becomes an admin ask — confirm with Jon.

## Q1 — Manual To-Do ⇄ Outlook Tasks (Microsoft To Do) — VERDICT: YES (cheapest)
- Microsoft To Do Graph API is GA on v1.0: `/me/todo/lists` + `/me/todo/lists/{id}/tasks` full CRUD incl. complete (`PATCH status:completed`); scope **`Tasks.ReadWrite`**. (Legacy `/me/outlook/tasks` is deprecated — don't use.)
- Two-way sync: **delta query** (`/me/todo/lists/{id}/tasks/delta` → replay `deltaLink`). Push subscriptions exist but need a public HTTPS endpoint + renewal (server infra) and have known gaps.
- **Design:** ARC-native todos in `users/{uid}/todos`, optional `graphTaskId`/`graphListId` link; auto-create an "ARC" To Do list; **poll (delta) in foreground**, no server infra; start one-way ARC→Outlook, add Outlook→ARC pull as phase 2, full two-way (conflict resolution) later.
- **Scope:** `Tasks.ReadWrite`. **Effort S–M.**
- **Risks:** sessionStorage tokens (per-tab, die on close) → foreground-only sync (fine while tab open; rules out unattended background without server infra); two-way conflicts; Graph throttling (poll in minutes, back off on 429).

## Q2/Q3 — In-ARC time-management + proactive awareness/notifications — VERDICT: YES-WITH-CAVEATS
**Interpretation (Jon's refinement):** a personal awareness layer in ARC that surfaces the user's tasks + relevant emails + upcoming meetings AND **proactively notifies** them (meeting-coming-up, important-email-arrived) while they work in ARC.
- ⚠ **Flag:** the existing F025 "To-Do Dashboard" is a **project-workflow attention board** (status pills/timers on ARC projects), NOT a personal task manager. This awareness tool is a **new, adjacent concept** — or, if Jon means "enrich the F025 project board with related emails/meetings per project," that's a narrower different build. Confirm which.
- **Data sources (all reachable):** Tasks (`Tasks.ReadWrite`), Mail (`Mail.Read` — already live), Calendar (`/me/events`, `/me/calendarView?start&end`, scope **`Calendars.Read`** — add one).
- **★ The notification/awareness vision maps cleanly onto FOREGROUND polling** — because the trigger is explicitly "while working IN ARC" (= the tab is open), ARC can, on a foreground interval: poll `calendarView` for the next meeting → fire an in-app reminder toast N min before; poll inbox delta for new mail → alert on "important" ones. **Surfaced via ARC's EXISTING notification system** (the toolbar bell / in-app notifications, + optional FCM/Teams). No server infra needed for the in-ARC case.
- **"Important email" definition (needs Jon):** options — `importance:high` flag, Focused Inbox (`inferenceClassification:focused`), flagged, or from specific senders/domains. Pick the rule.
- **TRUE background alerts (ARC tab CLOSED)** = the only piece needing server infra: Graph **change-notification subscriptions** (webhook → a `functions/` HTTPS endpoint) + app-only or stored-refresh tokens + subscription renewal. Separate, bigger decision — but likely NOT needed for the stated "while working in ARC" goal (foreground covers it).
- **Effort:** M for a read-only awareness pane + foreground meeting/mail notifications reusing the bell; L–XL for a full hub with linking; +L and new infra for tab-closed background alerts.
- **Build-vs-buy opinion:** lean LIGHTER — reuse the bell + foreground polling for the awareness/notify value (high leverage, low cost); deep-link out to Outlook/To Do for heavy interaction; avoid rebuilding Outlook inside ARC. Add tab-closed background alerts only if a concrete need justifies the server infra.

## Phased recommendation
1. **Q1 one-way sync (S)** — add `Tasks.ReadWrite`, auto-create "ARC" list, mirror ARC todos → Outlook. Proves incremental consent + the To Do API on Matrix's tenant; foreground-only; no server infra.
2. **Q1 two-way (M)** — delta pull + last-writer-wins reconcile.
3. **Awareness + notify (M)** — add `Calendars.Read`; foreground-poll next meeting + new important mail; fire in-app reminders via the existing bell; read-only agenda/mail/tasks pane; "link email/meeting → ARC project." **This is the core of Jon's vision.**
4. **Tab-closed background alerts (L + new infra)** — Graph webhooks + server tokens, ONLY if unattended (ARC-closed) notification is a hard requirement.
Each step independently shippable.

## Open questions for Jon
1. Q1 sync direction: one-way (ARC→Outlook) first, or two-way day one?
2. Tenant user-consent still enabled? (Mail.* live says yes — confirm no recent lockdown.)
3. Per-user private vs team-shared to-dos? (Graph is per-user; shared changes the Firestore model.)
4. Awareness tool = new personal hub, or enrich the F025 project board with per-project emails/meetings? (Different builds.)
5. **Foreground-only acceptable** (notify while ARC tab is open — covers "while working in ARC"), or is **tab-closed background** notification a hard requirement (→ phase-4 server infra)?
6. "Important email" rule: high-importance flag / Focused Inbox / flagged / specific senders?

**Sources:** MS To Do Graph API (learn.microsoft.com, GA announcement) · delta query · change notifications · user/admin consent · Tasks.ReadWrite consent flag (graphpermissions.merill.net). Full links in the research lane transcript.

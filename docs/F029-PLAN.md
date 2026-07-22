# F029 — In-ARC Time-Management + Outlook Integration — Build-Ready Phased Plan

**Analyst lane · 2026-07-22 · read-only. Companion to `docs/OUTLOOK-GRAPH-TODO-RESEARCH.md`. Anchors verified vs current `src/app.jsx`; Graph facts cited to learn.microsoft.com v1.0.**

## Foundation (already in prod)
MSAL browser OAuth (`PublicClientApplication` :1784, clientId `75b9ff22…`, single-tenant); **token cache = `sessionStorage` → per-tab, foreground-only**; `acquireGraphToken()` :1883; scopes `Mail.Send/Read/ReadWrite` already consented (:1870) — proves delegated user-consent is enabled on this app. `sendGraphEmail`→`/me/sendMail` :8589; `graphSearchEmails`→`/me/messages?$search` :8620 (**`$search` can't combine with `$filter`/`$orderby`**). Bell: writes `users/{uid}/notifications` :38589 (shape `{type,title,body,projectId,projectName,from,createdAt,read:false}` — **`from` required** by rule :38562), listener :48045. RFQ history company-scoped `companies/{cid}/rfq_history` (:2415); **no conversationId captured on send today**. **Projects are COMPANY-shared** (`companies/{cid}/projects` :19106). F025 rail = collapsible 380px, `railOpen` localStorage (:44650), template :36505 — a PROJECT board, not a personal task list.

## Graph facts (web-verified)
- **To Do** GA v1.0: `POST /me/todo/lists`; CRUD `/me/todo/lists/{id}/tasks`; complete=`PATCH{status:"completed"}`; `/tasks/delta`→`@odata.deltaLink`, `@removed` on deletes; scope **`Tasks.ReadWrite`** (delegated). Weak `$filter`, no `$search`.
- **calendarView** `GET /me/calendarView?startDateTime&endDateTime` (both required), scope **`Calendars.Read`**; recurrence expanded; `$orderby=start/dateTime` + `Prefer: outlook.timezone`.
- **★ "Pinned" is NOT on the Graph `message` resource (v1.0).** Available: `importance` (low/normal/high, filterable), `inferenceClassification` (focused/other), `flag` (`followupFlag`: notFlagged/flagged/complete), `isRead`, `categories`, `conversationId`, `internetMessageId`, `receivedDateTime`. No pinned/isPinned. Pinning = client-side OWA sort; only reachable (if at all) via a fragile undocumented extended-property `$expand`. → **Q-PIN decision.**

## Cross-cutting
- **Foreground-only** (sessionStorage): every sync/poll re-acquires silently on load, runs only while tab open. **Tab-closed background alerts = OUT OF SCOPE** → named later **Phase D** (Graph change-notification subscriptions + `functions/` webhook + stored/app-only tokens + renewal; `functions/` has zero Graph today).
- **Incremental consent:** add `Tasks.ReadWrite`(A) + `Calendars.Read`(B) via a scope-parameterized `ensureGraphScope()` (silent→popup, one popup); keep separate from `GRAPH_MAIL_SCOPES` so a decline degrades gracefully. Confirm tenant user-consent still org-enabled.
- **Throttling:** poll in minutes; honor 429 `Retry-After`; pause when `document.hidden`.
- **Data-retention:** all add-only, uncapped, non-destructive; per-user docs under `users/{uid}/**` (no rules change); shared linkedEmails subcollection needs a rules carve-out (Coach). `@removed` tasks tombstoned, not hard-deleted.

## Phase A — Two-way To-Do sync (`Tasks.ReadWrite`, effort M)
- **`users/{uid}/todos/{id}`** (add-only): `{title,notes,status,dueAt,importance,priorityPinnedAt,graphTaskId,graphListId,lastModifiedLocal,graphLastModified,lastSyncedAt,syncState,deletedLocal,schemaVersion,createdAt,createdBy}` + **`users/{uid}/config/todoSync`** `{arcListId,deltaLink,lastPollAt}`.
- Find-or-create an "ARC" To Do list; CRUD tasks; pull via `/tasks/delta` (persist deltaLink).
- **LWW reconcile, echo-safe:** push on local edit (debounced, mirror `_leadTimeBcQueue` 30s pattern) → store Graph's returned `lastModifiedDateTime`; pull compares vs stored `graphLastModified`; echo-guard skips our own round-trip (UTC compare, <~2s = echo); `Date(task.lastModified) > lastModifiedLocal` ⇒ Outlook wins else local wins; `@removed` ⇒ tombstone.
- **UI (rec):** own "My Tasks" TAB in the F025 rail chrome (2-tab header Projects | My Tasks) — NOT mixed into F025's project buckets (keeps `_todoBucketOf` SSOT clean; matches the pin-is-todo-list-only note).
- Risks: echo loops (mitigated), clock skew (UTC), foreground-only.

## Phase B — Awareness + notify (`Calendars.Read`, effort M)
- **Meetings:** poll `calendarView?start=now&end=now+12h&$orderby=start/dateTime` + `Prefer: outlook.timezone`; fire bell at `start − N min`, **N default 10 (configurable)** in `users/{uid}/config/awareness`.
- **Important-mail rule (ANY of), mapped:** (a) `importance eq 'high'` (filterable); (b) **"pinned" → NOT queryable → proposed proxy `flag/flagStatus eq 'flagged'`** (Q-PIN); (c) `"RFQ"/"request for quote"` substring. **Client-side rule engine** on a recent window: `GET /me/mailFolders/inbox/messages?$filter=receivedDateTime ge {lastSeen}&$orderby=receivedDateTime desc&$top=25&$select=…` → JS predicate `_isImportantMail(m)` (avoids the `$search`+`$filter` conflict; single SSOT predicate).
- **De-dupe:** `awareness.lastSeenMailAt` + a ring of alerted message ids; `alertedEventIds` for meetings.
- **Fire via EXISTING bell** (`users/{uid}/notifications` add, `from:uid`) — not a new system. (Bell writes fire in all envs incl. test — they're Firestore, not email.)
- UI: read-only "Today" strip (next meeting + unread-important count), deep-link out via `webLink`.

## Phase C — Email → Project linking (the high-value element, effort L)
- **★ Projects are company-shared; Graph messages are per-user** → a linked message is *visible* team-wide but *openable* only by a user whose mailbox holds it.
- **Store (rec):** subcollection `companies/{cid}/projects/{id}/linkedEmails/{id}` (NOT an inline array — avoids project-doc bloat + `saveProject` clobber). Shape `{internetMessageId (durable key), graphMessageId, conversationId, subject, fromEmail, receivedDateTime, webLink, linkedByUid/Name, linkedAt, linkSource, schemaVersion}`. Anchor identity on `internetMessageId`; re-resolve if `graphMessageId` 404s (moved); consider `Prefer: IdType="ImmutableId"`.
- **Auto-hooks:** (1) **RFQ reply → project** — add-only: have `sendGraphEmail` return + `rfq_history` store `conversationId`/`internetMessageId` on send, then match inbound supplier replies by conversationId (or from==vendorEmail + subject∋rfqNum). (2) **proj#/customer match** — Phase-B poll tests subject+body for a project's `bcProjectNumber`/PRJ#/`bcCustomerName` → suggest link. (3) **Manual** link from awareness pane / "linked emails" from project view (reuse `graphSearchEmails`).
- Hard parts flagged: per-mailbox scoping; message-id stability; thread-vs-message; rules carve-out for the shared subcollection (Coach; respect Owner-Priority lock).

## Open decisions for Jon
1. **★ Q-PIN:** Graph has no pinned property. **(a)** use `flag/flagStatus=flagged` as the proxy (rec), **(b)** drop pinned (keep high-importance + RFQ text only), **(c)** fragile extended-property $expand (not rec).
2. To-Do placement: own "My Tasks" tab in the F025 rail (rec).
3. Meeting lead time N: default 10 min, configurable — confirm.
4. Linked-email storage: shared subcollection (rec) vs inline array vs per-user.
5. LWW conflict acceptable for rare simultaneous edits? (Jon already chose LWW.)
6. OK to enhance `sendGraphEmail`+`rfq_history` (add-only) to capture `conversationId` (enables RFQ-reply auto-link)?
7. Tenant user-consent still org-enabled? (Mail.* live says yes — confirm no lockdown.)

## Build order + smallest slice
**A → B → C** (each shippable), then optional D.
- **Smallest first slice (A1):** ARC-LOCAL "My Tasks" tab (Firestore only, no Graph) + `ensureGraphScope(['Tasks.ReadWrite'])` consent probe + **one-way ARC→Outlook push**. Proves consent + the To Do API, near-zero risk.
- **A2:** delta pull + LWW → full two-way. **B:** calendar + mail polls → bell. **C:** manual link first, then the two auto-hooks. **D (later):** background alerts (server infra).

## Data-retention statement
All add-only/uncapped/non-destructive: `users/{uid}/todos/*`, `users/{uid}/config/{todoSync,awareness}` (owner R/W, no rules change); shared `companies/{cid}/projects/{id}/linkedEmails/*` (rules carve-out, Coach); add-only `conversationId`/`internetMessageId` on `rfq_history` + optional project doc. No field removed/renamed, no cap, project-save schemaVersion/strip untouched, `@removed` tasks tombstoned. Legacy-safe `??`/`||` reads.

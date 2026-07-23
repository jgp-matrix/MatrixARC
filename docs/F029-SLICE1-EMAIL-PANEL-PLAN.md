# F029 — First Slice: populate the F030 "📧 Email" section with the user's relevant Outlook emails

**Coach build-ready plan · 2026-07-22 · read-only. Effort S–M, single file (`src/app.jsx`). Assembly on ARC's already-live Graph/MSAL stack — no new scopes, no server work, no Firestore. Builds AFTER F030 ships (drops into the Email scaffold + F029 mount point).**

## Reuse (call, do NOT rebuild)
| Asset | Location | Use |
|---|---|---|
| `ensureMsal()` | `src/app.jsx:1784` (clientId `75b9ff22…`, single-tenant, `sessionStorage`) | already called by token helpers |
| `tryGraphTokenSilent()` | `:1876` (silent-only → token or null) | on-load "is Outlook connected?" probe (no popup) |
| `acquireGraphToken()` | `:1887` (silent→popup) | behind the "Connect Outlook" button |
| `GRAPH_MAIL_SCOPES` | `:1874` (`Mail.Send/Read/ReadWrite`, **consented in prod**) | **Mail.Read already granted → ZERO incremental consent** |
| `graphSearchEmails(token,query,top)` | `:8628` (`$search`, maps to row objects `:8639`) | reuse the MAPPER pattern, NOT verbatim (see below) — leave it untouched (load-bearing in Send-Quote reply-to-thread) |
| Connect-UI precedent | `SettingsModal` `graphStatus` `:43344` + `authorizeOutlook()` `:43394` + UI `:43502` | copy this state-machine for the not-connected state |

## The query — TWO calls merged client-side (new helper `graphFetchRelevantEmails(token,{daysBack=30,top=25})` ~`:8651`)
Criteria = high-importance **OR** subject/body contains "RFQ"/"request for quote". Can't be one request (`$filter`+`$orderby` for importance vs `$search` for body-text are mutually exclusive; `bodyPreview` is only ~255 chars so a client substring misses deep-body hits — `$search` indexes full body).
- **Call A (importance):** `GET /me/mailFolders/inbox/messages?$filter=importance eq 'high' and receivedDateTime ge {ISO(now-daysBack)}&$orderby=receivedDateTime desc&$top={top}&$select=id,subject,bodyPreview,from,receivedDateTime,webLink,importance,conversationId,isRead`. Fallback on `InefficientFilter`/400: drop `$orderby`, sort client-side.
- **Call B (RFQ text):** `GET /me/messages?$search="RFQ"&$top={top}&$select=<same>` + header `ConsistencyLevel:eventual`. (`$search` = subject+body+sender, relevance order, no `$orderby`.) Optional 2nd search for `"request for quote"`.
- **Merge:** dedupe by `id`, sort `receivedDateTime` desc, cap `top`. Map → `{id,subject,preview:bodyPreview.slice(0,120),from,receivedDateTime,webLink,importance,isRead}` (same shape/style as `:8639`).

## Feed the F030 Email section
- **Replace** the scaffold placeholder rows/empty-line at `src/app.jsx:49792–49809` (keep the `📧 Email` header `:49797`, swap the "Coming soon" pill for a live status/refresh control).
- **App-level state** (mirror `notifications` `:48349`): `outlookEmails=[]`, `outlookMailStatus="checking"` (checking|connected|disconnected|loading|error), `outlookMailFetchedAt=null` — App scope so the F030 block reaches them by closure.
- **Fetch effect** near `:48410`, gated `navTab==="user_dashboard"`: `tryGraphTokenSilent()` → null ⇒ `disconnected`+Connect prompt (no popup on load); token ⇒ `graphFetchRelevantEmails` ⇒ rows+`connected`+stamp; catch ⇒ `error`.
- **Connect handler** (copy `authorizeOutlook` `:43394`): `loading` → `acquireGraphToken()` → fetch or `disconnected`.
- **Rows** (replace `:49803`): two-line (bold subject 13/700 + muted `bodyPreview` 12, ellipsis), `onClick=window.open(webLink,"_blank","noopener")`, optional `High`/`RFQ` tag + unread bold.

## Refresh — poll/on-load, NOT push (be explicit to Jon)
Graph has no free browser push (the ARC bell's `onSnapshot` real-time is Firestore-only). Rec: (a) fetch on dashboard mount, (b) manual "↻ Refresh" + `fetchedAt` ("updated 3m ago"), (c) optional 5-min poll only while `navTab==="user_dashboard"` && `!document.hidden`, honor 429 `Retry-After`. Tab-closed/real-time = Phase D (webhooks+server), out of scope.

## Privacy / safety
Personal/private by construction (`/me/…`, user's own delegated token, client-side). **Zero Firestore writes — email content lives only in ephemeral React state, never persisted.** No rules change, no Data-Retention surface. Cost negligible (`$top` 25, ≤2 queries, paused on hidden, 429 backoff).

## Edit surface (S–M, one file)
1. `~:8651` new `graphFetchRelevantEmails()`. 2. `~:48349`/`~:48410` state + fetch effect + `connectOutlook()`. 3. `:49792–49809` live rows + connect/loading/empty/error + header refresh control. No `functions/`, no rules, no new scopes.

## Open decisions for Jon (each w/ rec) — resolve at build kickoff (after F030 ships)
1. RFQ match: subject+body (rec) vs subject-only; token `"RFQ"` only (rec) vs also `"request for quote"`.
2. Days-back for importance filter — rec 30.
3. `$top` cap — rec 25/query, 25 display.
4. Manual refresh button — rec yes.
5. Auto-poll — rec on-mount+manual now; 5-min visible-tab poll optional.
6. Folder scope — inbox for importance; `$search` hits all folders (may surface a Sent match) — rec accept.
7. Row badge (`High`/`RFQ` tag + unread bold) — rec yes, minor.

## Deferred (hooks noted) — per `docs/F029-PLAN.md`
Two-way To-Do sync (Phase A, `Tasks.ReadWrite`, `users/{uid}/todos`) · meeting awareness (Phase B, `Calendars.Read`) · email↔Project linking (Phase C — hooks at the row `onClick`: a "Link to project" affordance → `companies/{cid}/projects/{id}/linkedEmails/*`). This slice is read-only surface only.

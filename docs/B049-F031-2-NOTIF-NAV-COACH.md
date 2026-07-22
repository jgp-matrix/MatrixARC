# B049 + F031 #2 — Notification click-through — Coach scope + build plan

**Coach (Sam Wize) · 2026-07-22 · read-only diagnosis. Build lands hosting-only (no Cloud Function deploy).**

## Notification-type inventory (`users/{uid}/notifications`)

| `type` | Created at | Trigger | Fields carried | Current click | Desired target |
|--------|-----------|---------|----------------|---------------|----------------|
| `supplier_quote` | `functions/index.js:645` | Supplier submits quote | `projectId`, **`rfqUploadId`** (=token), `rfqNum`, `vendorName`, `projectName` | Clickable → project + opens PortalSubmissionsModal (ALL subs) | Project + modal **focused on this submission** (F031 #2) |
| `pre_review` | `src/app.jsx:35628` (reassign) & `:35751` (request) | Project submitted/reassigned for pre-quote review | `projectId`, `projectName`, `from` | **NOT clickable, no handler** | Open the project (B049) |
| `customer_review` | `functions/engineering/index.js:55` | Customer submits review | `projectId`, `token` | Handler EXISTS (`:48338`) but gate blocks it | Project + Customer Review modal |
| `unlock_request` | `src/app.jsx:38615` | Teammate requests edit access | `projectId`, `fromUid`, `fromName`, `reason` | NOT clickable | (optional) open project |
| `unlock_granted` | `src/app.jsx:38646` | Owner grants unlock | `projectId`, `from` | NOT clickable | (optional) open project |
| `issue_report` | `functions/index.js:821` | Debug/issue filed (→ admins) | `debugLogId`, `companyId`, `reporterName` | Handler EXISTS (`:48344`) but gate blocks it | Open Debug Logs |

- **`engineer_question`** (`functions/index.js:966`) is push/email/Teams ONLY — no bell doc, nothing to click.
- **No `post_review` bell notification is ever created.** pre-review assignment writes a bell notif; post-review assignment does NOT (only status/kanban logic). → a post-reviewer assigned via `postReviewAssignedTo` gets no bell at all. **Open question for Jon.**
- Listener `src/app.jsx:48192` = per-uid `users/${user.uid}/notifications`. Andrew's `pre_review` docs are written to his uid → he does receive them.

## Root cause — B049 (review notifs go nowhere)

Two independent defects, both fixed:
1. **Render gate too narrow** — `src/app.jsx:49307` `const _clickable=n.type==='supplier_quote'&&!_rfqHandled;`. Row `cursor`+`onClick` (`:49309-49310`) gated on it → only supplier_quote rows clickable; every other type is a dead row. *(The supplier_quote-only gate PRE-DATES F031 #3 — before #3 the gate was already `n.type==='supplier_quote'`; #3 only added the `!_rfqHandled` suppression. So customer_review/issue_report handlers have been dead since they were written — not an F031 #3 regression.)*
2. **No handler branch** — `handleNotifClick` (`:48332`) branches only on `supplier_quote`, `customer_review`, `issue_report`. No `pre_review` branch → no-op even if the gate allowed it.
`projectId` IS present on `pre_review` docs (`:35631`, `:35754`) → pure gate+branch bug, no payload change.

## Root cause — F031 #2 (quote lands on project, not the submission)

Click path works but under-targets: supplier_quote branch (`:48335`) does `handleOpen(proj); setPendingPortalOpen(notif.projectId)` → `autoOpenPortal` (`:49532`) → auto-open effect (`:38415`) opens `PortalSubmissionsModal` (`:20894`, rendered `:40397`) with ALL project submissions (`:38333`). Modal signature `{submissions,onClose,onApplyPrices,onImportPdf}` has **no focus/selected-submission prop** → opens at top of list, not the just-arrived one. `rfqUploadId` (token) is on the notification → data to focus exists, modal just doesn't use it.

## Build plan (hosting-only)

### B049 — widen nav to all deep-linkable types
- **Widen the gate** (`:49307`) via a type→target test, keep supplier_quote `_rfqHandled` suppression exactly as-is:
  ```js
  const _navigable = n.type==='supplier_quote' ? !_rfqHandled
                   : (['pre_review','customer_review','issue_report'].includes(n.type)
                      || (['unlock_request','unlock_granted'].includes(n.type) && !!n.projectId));
  ```
  Use `_navigable` for `cursor` (`:49309`) + `onClick` (`:49310`). Add a generic `→` affordance for newly-clickable types (the "Click to Review Quote →" span `:49316` is supplier_quote-only).
- **Add branch** to `handleNotifClick` (`:48332`), mirroring the customer_review branch:
  ```js
  }else if((notif.type==='pre_review'||notif.type==='unlock_request'||notif.type==='unlock_granted')&&notif.projectId){
    const proj=projects.find(p=>p.id===notif.projectId);
    if(proj)handleOpen(proj);
  }
  ```
  `handleOpen` = the established "land on the project" behavior (same as the pre-review EMAIL deep-link `?openProject=`, `:48232`). No dedicated pre-review surface exists → opening the project matches the email path. *(Landing on the review/notes surface specifically = larger optional follow-up.)*
- Re-enabling the gate also restores the already-written `customer_review` + `issue_report` deep-links (currently dead).
- **No Cloud Function change** — payloads already carry `projectId`.

### F031 #2 — focus the specific submission (additive, presentational)
- Add `focusUploadId` prop to `PortalSubmissionsModal` (`:20894`). In `submissions.map` (`:20907`) attach a `ref` when `sub.id===focusUploadId`, `scrollIntoView` + brief highlight on mount; if not in the (submitted-only) list, no-op fallback.
- Thread the token: App state `pendingPortalFocusId` set alongside `setPendingPortalOpen(notif.projectId)` in `handleNotifClick` using `notif.rfqUploadId`; pass through `ProjectView` (next to `autoOpenPortal`) into the modal render (`:40397`).
- **No Cloud Function change** — `rfqUploadId` already on the notification (`functions/index.js:652`). Add-only, Data-Retention-safe.

## Money-path / data-safety flags
- **F031 #2 touches `PortalSubmissionsModal`** (RFQ pricing surface — Apply Prices / Import PDF / lead-time push). Scope to **scroll + highlight ONLY**; do NOT touch `onApplyPrices`/`onImportPdf` or `leadTimeOnly`/price-derivation (`:20908+`).
- **No functions deploy** for either fix (hosting-only, `bash deploy.sh`). A `post_review` bell notif (if Jon wants it) would be a separate additive change.
- **Data Retention:** no field removed/renamed. `pendingPortalFocusId` is client-only.

## All-users / role check
- Listener per-uid + type-agnostic → gate/handler fixes are role-independent: Andrew (reviewer/`pre_review`), salespeople (`customer_review`), admins (`issue_report`/`unlock_*`) all benefit. Verify on a reviewer account, not just the reporter.
- **Caveat:** post-review assignees get NO bell notification (no `post_review` create) — widening the gate can't help because there's nothing to click. Confirm whether Andrew's failing notifs are `pre_review` (fixable now) or an expectation of a not-yet-existing `post_review` notif.

**Key files:** `src/app.jsx` (handler `:48332`, render gate `:49301-49329`, ProjectView render `:49532`, portal auto-open `:38415`, modal `:20894`), `functions/index.js` (`:645`/`:652` supplier_quote payload), `functions/engineering/index.js` (`:55` customer_review payload).

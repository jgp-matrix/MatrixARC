# F087 Scoping Brief — "Email Customer Confirmation" modal on project creation

> Author: Coach (Sam Wize) lane, via Freddy · 2026-08-04 · prod v1.24.84
> Status: SCOPED — awaiting Jon decisions (Section D) before build. Money-path-adjacent (external customer email / Outlook / comms-safety).

**Feature (Jon 2026-08-04):** When a project is created, pop a modal (similar to Send Quote) confirming an email should go to the **Requestor**: *"The RFQ has been received to the Sales queue and someone from Sales will be responding soon."* Let the user **select from recent Outlook email chains**.

All anchors are `src/app.jsx` unless noted.

---

## (A) Reusable components + exact anchors

### The Send Quote modal — `QuoteSendModal`
- **Definition:** `function QuoteSendModal({project,uid,modalData,setModalData,onUpdate,onClose,ownerPriorityActive,bcCommitGate})` — **line 37779**.
- **Three send modes** (`sendMode` state, default `"sales"`): `📩 Send To Sales` / `✉ New Email` / `↩ Reply to Thread` — tab bar at **lines 38118–38135**.
- **The "recent Outlook email chains" picker already exists** (in `reply` mode) — exactly what F087 needs:
  - `searchThreads(q)` → `graphSearchEmails(token,q,20)` — **lines 37803–37809**.
  - Debounced live search (500ms) — **lines 37812–37818**.
  - Results list with per-row preview (`👁`), date, sender; click to select (`selectedThread`) — **lines 38159–38181**.
  - `loadEmailPreview(msg)` fetches full body via Graph `/me/messages/{id}` — **lines 37820–37837**.
  - Selected-thread "Reply All" confirmation card — **lines 38183–38193**.
- **Composition + send:** `handleSend(withBom)` — **lines 37876–38112**. Most of this is quote-specific (pricing gates, PDF build, quote-number, BC sync, lock stamping) — do **NOT** clone. Reusable send primitives:
  - `sendGraphEmail(graphToken,to,subject,html,...)` — **line 9881** (built-in `IS_TEST_ENV` suppression at **9884**).
  - `graphReplyToMessage(graphToken,selectedThread.id,html,...)` — **line 10061** (reply-into-chain via Graph `replyAll`; test-env suppression at **10084**).
  - `acquireGraphToken()` (interactive) / `tryGraphTokenSilent()` (silent). Scopes include `Mail.Send/Read/ReadWrite` (**line 2165**).
- **Message body / signature UI:** editable `<textarea value={modalData.message}>` — **line 38198**; signature — **line 38200**.
- **Open/seed shape:** `setQuoteSendModalPLV({to,_customerTo,subject,message,signature})` — **lines 41076–41082**; rendered at **line 41261**.

### Outlook / Graph integration (F029)
- `graphSearchEmails(graphToken,query,top)` — **line 9912**. Rows: `{id,subject,from,fromEmail,to,date,preview,conversationId,isRead}` — **lines 9923–9933**. `fromEmail` = likely requestor.
- `graphFetchRelevantEmails` (F029 dashboard Email panel) — **line 9946**; consumed **lines 53435–53472**. Confirms Graph read plumbing is live/stable.

### SendGrid Cloud Functions (server-side alternative)
- `sendEngineerQuestionEmail` — `functions/index.js` **line 2223**. Cleanest clone template: auth-gated, `SENDGRID_KEY` check, `data.isTest===true` suppression (**2229**), `from: 'sales@matrixpci.com'` + `replyTo` = sender, branded HTML.
- Siblings: `sendInviteEmail` (**1762**), `engSendReviewEmail` (**154**, `./engineering`).

---

## (B) Recommended trigger point

Project creation is a single synchronous event:
- `NewProjectModal` — **line 48420**; `create(e)` — **line 48573**; `saveProject(...)`→`p` — **48622**; `onCreated(p)` — **48655** → `handleCreated(p)` — **54482** (`setShowNew(false); setProjects(...); setOpenProject(p); setView("project")`).
- No separate "enters Sales queue" state — a new project is `status:"draft"` (**48646**); that is the creation moment.

**Recommendation:** Fire the F087 modal from `handleCreated` (App scope, **54482**), after `NewProjectModal` closes and the project is open. Keeps the dense `create()` flow untouched; `p` carries `bcContactEmail`/`bcProjectNumber`/`name`; App scope owns the Graph helpers + dashboard Outlook state.
Fields available at that moment (**48622–48648**): `name`, `bcProjectNumber`, `bcCustomerName`, `bcContactName`, `bcContactEmail`, `bcContactNo`, `bcSalesperson`, `quote.{contact,email,phone}` (only if a contact was selected).

---

## (C) Proposed data flow (requestor email → modal → send)

1. `handleCreated(p)` sets new state `confirmEmailProject = p` (gated on a preference — see D-5).
2. New `<CustomerConfirmModal project=p …>` reuses the `reply`-mode picker (debounced `graphSearchEmails` + results list + preview), pre-seeded:
   - Thread search pre-filled with `p.bcCustomerName || p.name` (mirrors `threadSearch` seed at **37791**).
   - Recipient (`to`) precedence: **selected chain's `fromEmail`** → `p.bcContactEmail` → blank (user types). The RFQ arrived by email, so the chain sender *is* the requestor.
   - Message pre-filled with the F087 boilerplate, editable.
3. On confirm: chain selected → `graphReplyToMessage(token,thread.id,html)`; else → `sendGraphEmail(token,to,subject,html)`. Both no-op on test host.
4. Optionally stamp `p.customerConfirmSentAt` (fire-and-forget `safeSave`) to prevent duplicate sends + drive an "already acknowledged" indicator.

---

## (D) DECISIONS FOR JON (each with a recommendation)

1. **Exact trigger moment.** (a) auto-pop right after creation in `handleCreated`; (b) manual button on the project view. → **Rec (a)** — auto-pop once, immediately after creation.
2. **Requestor-email source / fallback.** No dedicated `requestor` field exists; closest is the optional BC contact (`bcContactEmail`, **48641**), frequently blank. → **Rec:** selected Outlook chain's sender (`fromEmail`) primary, `bcContactEmail` fallback, free-type `To` final. **GATING Q:** a true distinct "Requestor" concept would need a new (additive, safe) schema field.
3. **SendGrid vs Outlook-reply-into-chain.** Send Quote is 100% Graph/Outlook from the signed-in user's mailbox; SendGrid sends from `sales@matrixpci.com`. → **Rec Graph reply-into-chain** — matches "select recent email chains" literally, reuses `graphSearchEmails`/`graphReplyToMessage`, keeps ack in the customer's thread, honors test-env suppression. Use SendGrid only if the ack should come from the shared `sales@` box.
4. **User-gated vs auto-with-skip.** → **Rec user-gated** (modal is the gate; nothing sends without explicit confirm). External customer email on a routine internal action — needs a human glance. Prominent "Skip / Don't send."
5. **Remember-choice / suppress-per-project.** → **Rec both:** per-project `customerConfirmSentAt` de-dupe + optional user pref ("Always ask on new project"). Default = ask.
6. **Editable message body.** → **Rec yes** — mirror the editable `<textarea>` at **38198**.

---

## (E) Effort + flags

**Effort: Medium (M).** No new backend if Graph-reply is chosen (picker + token helpers + send primitives all exist). Work: a ~150-line modal lifting the `reply`-mode picker out of `QuoteSendModal`, a trigger hook in `handleCreated`, a boilerplate template, optional `customerConfirmSentAt` stamp + preference toggle. Grows to **M+/L** only with a new "Requestor" schema field (D-2) or a SendGrid server function (D-3).

**Money-path / comms-safety flags:**
- 🚩 **External customer email on a routine action** — highest risk is an unwanted/duplicate ack. Mitigations: user-gated modal, explicit Skip, per-project `customerConfirmSentAt` de-dupe, recipient regex validation (reuse **37917–37921**).
- ✅ **Test-env already safe** — `sendGraphEmail` (**9884**), `graphReplyToMessage` (**10084**), and SendGrid (`data.isTest`) all suppress. Confirm the new modal routes through these choke points, not a direct `fetch(/sendMail)`.
- ⚠️ **No BC/pricing money-path touched** — comms-only.
- ⚠️ **Verify-for-all-users:** send depends on a signed-in Graph token. Users without Outlook connected can't reply-into-chain — modal must degrade gracefully ("Connect Outlook" like **53446**, or fall back to free-type `To` + `sendGraphEmail`, or skip).

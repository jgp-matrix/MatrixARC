# B043 — Ryan's RFQ send: no sender confirmation + blank supplier emails

**Coach (Sam Wize) diagnose lane · 2026-07-21 · read-only code trace of `src/app.jsx`**
Source report: Jon relaying user **Ryan** (2026-07-21). Not yet confirmed active on prod — needs one live Ryan send.

---

## TL;DR — both symptoms are ONE root cause (H1)

Ryan's RFQ send has no working BC token / BC vendor-read permission → **every vendor recipient email resolves blank** → each vendor is **skipped** (`if(!to)` → `sent:false`, "No email address") → the supplier receives nothing (relayed as "blank"). The **sender confirmation email is explicitly gated on ≥1 successful non-API send** (`sentVendors.length>0`), so zero sends = zero confirmation, deterministically. Same mechanism explains both symptoms. This is the same brittle BC-email resolution chain as **B024** (reviewer-notification).

**Ryan-specifically:** the workspace owner has BC connected with vendor-card read scope (recipients populate); Ryan is a team member who either hasn't connected BC in his session or uses a per-member BC API key lacking Vendor/Contact read permission → BC reads fail → `""` recipients. The saved company `vendorEmails` config is the only BC-independent source and only rescues vendors someone previously saved by hand.

---

## How the RFQ send path works (grounding, all `src/app.jsx`)

- **Trigger:** `onSendRfqEmails()` `:38692` → `buildRfqSupplierGroups` `:38696` → seeds `g.vendorEmail = await bcGetVendorEmail(g.vendorNo)` `:38699` → opens `RfqEmailModal` `:38702`.
- **Send mechanism = client-side Microsoft Graph from the SENDER's own mailbox.** `sendAll()` gets a token via `acquireGraphToken()` `:19837` (def `:1883`, MSAL against the browser's signed-in MS365 account) → `sendGraphEmail(token,to,subject,html,pdf)` `:19913` → POST `https://graph.microsoft.com/v1.0/me/sendMail` `:8604`. **No SendGrid / no server function for RFQ mail.** Sender = whatever MS account is signed into MSAL in Ryan's browser.
- **Vendor recipient resolution (fallback order):**
  1. Seed `bcGetVendorEmail(vendorNo)` `:38699` → returns `""` if `!_bcToken` (`:6282`) or no email on the vendor card.
  2. Modal init `emails[v]=(g.vendorEmail||"")` `:19762`.
  3. Override from saved config `_readSupplierConfig(uid,"vendorEmails")` `:19785` — **company-shared, BC-independent** (`:2368`/`:2371`).
  4. Fill-if-empty from BC contacts `bcFetchVendorContacts` `:19806` → `[]` if `!_bcToken` (`:19732`).
  - Only source 3 is non-BC. Sources 1 & 4 both need Ryan's `_bcToken`.
- **Blank recipients are skipped, not sent:** `const to=_normalizeEmails(emails[v]); if(!to){status=error "No email address"; historyEntry sent:false; continue}` `:19891`–`:19896`. `sendGraphEmail` never called with blank `to`.
- **Confirmation-to-sender** `:20053`–`:20068`: recipient `fromEmail = userEmail||fbAuth.currentUser?.email` `:19822` (`userEmail` prop = `fbAuth.currentUser?.email` `:39985`). **Gated:** `if((sentVendors.length>0||apiVendorResults.length>0) && graphToken && fromEmail)` where `sentVendors=historyEntries.filter(e=>e.sent && e.vendorEmail!=="API")` `:20054`,`:20057`. Also `hasEmailVendors` `:19834`: if every vendor email is blank, the Graph token isn't even acquired (`:19836`).

---

## Ranked hypotheses

### H1 — No working BC token/permission for Ryan → blank recipients → sends skipped AND confirmation gated off (BOTH symptoms, one root) — STRONGEST
- Explains BOTH. Sources 1 & 4 dead without `_bcToken`; source 3 empty unless a teammate saved these vendors. Each vendor → `if(!to)` skip `:19892`; `sentVendors.length===0` → confirmation `if` false `:20057` → no confirmation.
- Cites: `:6282`, `:19732`, `:19892`, `:20057`.
- Why Ryan: owner has BC connected w/ vendor read scope; Ryan (team member) hasn't connected BC or per-member API key lacks Vendor/Contact read (see `resetTeamApiKeys`, `diagnoseMemberApiKey`). Shared `vendorEmails` config doesn't rescue. Same class as **B024**.
- Confidence: **code-confirmed the failure is POSSIBLE and links both symptoms**; ACTIVE-status needs the live artifact below.
- Decisive artifact: live Ryan send → Send-RFQ modal per-vendor rows **blank / "✗ No email address"** confirms H1. Corroborate: **zero** POSTs to `graph.microsoft.com/v1.0/me/sendMail`; no `"[RFQ] Confirmation email sent to…"` console line (`:20066`); newest `companies/{cid}/rfq_history` doc has every `entries[].sent===false`, `error:"No email address"`. Cheapest tell: Ryan's BC toolbar connection status.

### H2 — Ryan on `matrix-arc-test` → all Graph email suppressed (BOTH, trivially) — RULE OUT FIRST
- `sendGraphEmail` early-returns on test host: `if(IS_TEST_ENV){…return{suppressed:true}}` `:8586`. Not inherently Ryan-specific — host-specific. Console `"[TEST-ENV] email suppressed:"`.
- Check: is Ryan on `matrix-arc-test.web.app` (orange 🧪 ribbon)? One glance. Do this FIRST to avoid chasing a non-bug. (Matches known "test env suppresses EMAIL/PUSH" reference.)

### H3 — Sends succeed but confirmation goes to an address Ryan doesn't monitor (confirmation-only)
- Confirmation recipient = Ryan's **Firebase auth email** `:19822`/`:39985`, but mail is sent from Ryan's **MSAL/MS365 mailbox** `:8604`. If his Firebase login email ≠ his monitored Outlook mailbox (shared/ops mailbox, or Google-provider login), the confirmation lands somewhere he doesn't watch. Only relevant if supplier emails DID send.
- Confidence: speculative. Check: console `"[RFQ] Confirmation email sent to <X>"` `:20066` — compare `<X>` vs Ryan's real Outlook address.

### H4 — Blank email BODY (not blank recipient) — unlikely
- Body = `buildRfqEmailHtml(group,…)` `:19910` → `content:htmlBody` `:8593`; synchronous template, empty only on throw / empty `group.items`. No per-user factor. Kill via the modal's 👁 Preview `:20117` in Ryan's session — populated preview = H4 dead.

---

## What to check first (cheapest → decisive)
1. **Host** (H2): prod vs test ribbon. If test → expected suppression, not a bug.
2. If prod: **open the Send-RFQ modal in Ryan's session, read the per-vendor email rows.** Blank / "✗ No email address" instantly confirms **H1** and explains the missing confirmation (same root via `:20057`). Corroborate with Ryan's BC connection status + zero `me/sendMail` POSTs.

## Fix direction (one-liners — not a plan)
- Decouple recipient resolution from `_bcToken` (fall back to saved company `vendorEmails`; surface a hard "connect BC / no vendor email on file" state instead of a silent blank).
- Make the sender confirmation independent of successful vendor sends — or fire a "0 sent — all vendors missing emails" confirmation so a total-blank run still notifies the sender.
- Log a Debug Log entry when a vendor resolves to a blank recipient (currently silent) — would make this self-diagnosing.

*Diagnosis only; no files edited by the lane. Every claim cited to `src/app.jsx`. Promote H1 possible→active with one live Ryan send on prod.*

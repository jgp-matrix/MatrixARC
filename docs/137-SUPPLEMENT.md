# Coach Supplement — #137 Customer Portal for Digital Quoted BOM Approval

**From:** Coach (Sam Wize)  
**To:** Freddy → Jon (approve) → Marc (build)  
**Re:** Brief #137, seven design questions + eight security requirements  
**Date:** 2026-06-16  
**Builds on:** #133 (Quoted BOM send, bomApprovalRequests[]), RFQ supplier portal, engineering review portal

---

## ★ GATING QUESTION FIRST — Q6 Security: Document Delivery Path

**Answer: There is NO Storage URL today. The PDF never touches Firebase Storage.**

`generateTravelerBomPdf` (app.jsx:7576–7592) is 100% client-side. It uses jsPDF in the browser, produces a base64 string, and returns `{pdfBase64, pdfFilename}`. The caller (`handleBomSend` at line 32569, or the bundled path at line 32045) passes the base64 directly to `sendGraphEmail` / `graphReplyToMessage` as an inline email attachment via Microsoft Graph API.

The delivery path is:

```
jsPDF (browser) → base64 → Graph API sendMail → email attachment → customer inbox
```

**No Firebase Storage upload. No URL of any kind. No standing exposure.**

The customer receives the PDF as a file attached to the email. There is no URL that could leak, be forwarded, or be indexed.

### Recommendation for #137: Response-Only Portal (v1)

The portal does NOT serve the document. The customer already has the PDF from the email. The portal's job is to let them RESPOND — approve, reject, or request changes. The portal shows:

- Company branding (logo, name — already stored on the company doc)
- A summary: "Quoted BOM for [Project Name] — Quote Revision [N] — [N] panels"
- Panel names (from the token doc's panels list)
- Date sent, sent to
- Action buttons: Approve / Reject / Request Changes
- A text area for comments (required for Reject and Request Changes, optional for Approve)

**This is the same shape as the RFQ supplier portal** — the RFQ portal shows line items in a table, not the original ARC drawings. The customer BOM portal shows a summary, not the actual PDF. Both are response mechanisms, not document viewers.

**Zero IP leak risk** because no document URL exists anywhere in the flow.

### Parked Upgrade: Document-in-Portal Viewing

If customers request PDF viewing within the portal (so they don't have to open the email attachment in a separate tab), the upgrade path is:

1. At send time, upload the generated PDF to Firebase Storage at `bomApprovalDocs/{token}.pdf`
2. Add a Storage rule: `match /bomApprovalDocs/{allPaths=**} { allow read, write: if false; }` (no direct access — Admin SDK bypasses rules)
3. Add a CF `getBomApprovalDocument(token)` that validates the token (exists, unexpired, not revoked, not resolved), then generates a short-lived signed URL (5 min) via Admin SDK `getSignedUrl({action:'read', expires: Date.now() + 5*60*1000})`
4. Portal calls the CF, renders the PDF in an iframe/embed

**Critical: Do NOT use client-side `getDownloadURL()`.** Those URLs contain embedded access tokens that are effectively permanent and unrevokable — this is the exact standing exposure the Brief warns about.

### ⚠ Side Finding: Engineering Review Portal Storage URL Exposure

While tracing delivery paths, I found that the existing engineering review portal (`reviewUploads`, line 29119) passes `getDownloadURL()` Storage URLs for drawing pages directly in the token doc as `drawingPages: pageUrls`. These URLs contain permanent, unrevokable access tokens. A leaked review portal link exposes the drawing page URLs embedded in the Firestore doc, which are then readable by anyone — forever, regardless of token expiry.

**This is not #137 scope**, but it's the same class of risk the Brief identified. Flag as a separate security finding for Jon to track.

---

## Q1 — Token Model

**Recommendation: New `bomApprovals/{token}` collection. Do not extend rfqUploads or reviewUploads.**

Each external-party portal gets its own collection — they're different audiences (supplier vs customer vs engineering reviewer) with different data shapes, different security postures, and different lifecycles. Sharing a collection creates confusing rule complexity and makes it harder to reason about who can see what.

### Token Generation

Same proven pattern as RFQ portal (app.jsx:18965):
```js
const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
  .map(b => b.toString(16).padStart(2, '0')).join('');
```
128-bit, cryptographically random, URL-safe hex. Satisfies security requirement #1.

### Token Doc Structure

```
bomApprovals/{token} = {
  // Identity + ownership
  uid:          <ARC user uid>,
  companyId:    <company ID or null>,
  projectId:    <project ID>,
  barId:        <bar_ record ID from bomApprovalRequests[]>,

  // What was sent
  sentTo:       <customer email>,
  sentBy:       <ARC user email>,
  sentAt:       <ms timestamp>,
  panels:       [<panel names>],   // human-readable, for portal display
  panelIds:     [<panel IDs>],     // stable IDs, for write-back matching
  quoteRev:     <number>,          // project.quoteRev at send time
  projectName:  <string>,          // for portal display + notifications
  companyName:  <string>,          // branding
  companyLogoUrl: <string|null>,   // branding

  // Security + lifecycle
  expiresAt:    <ms timestamp>,    // Date.now() + 14 days
  revoked:      false,
  status:       "pending",         // pending → viewed → approved | rejected | changes_requested
  accessLog:    [],                // [{ts: <ms>}, ...]  (security req #8)

  // Cost-attack hardening (inherited from RFQ pattern)
  readCount:    0,                 // incremented on each portal load

  // Response fields (written by customer via portal)
  respondedAt:  <ms timestamp|null>,
  responseComments: <string|null>,
}
```

### Token Creation

At send time — both `handleBomSend` (standalone, line 32542) and the bundled QuoteSendModal path (line 32091). After the email is confirmed sent, before saving the bar_ record:

1. Generate token
2. Write `bomApprovals/{token}` doc
3. Include `bomApprovalToken: token` on the bar_ record (for ARC-side linking)
4. Include the portal link in the email body: `https://matrix-arc.web.app?bomApproval=${token}`

### Firestore Rules

```
match /bomApprovals/{token} {
  // Reuse the rfqUploads _writerIsCompanyWriter / _isOwnerOrTeamWriter helpers

  allow read: if _isOwnerOrTeamWriter()
              || (resource.data.get('expiresAt', 0) > request.time.toMillis()
                  && resource.data.get('revoked', false) == false);

  allow create: if request.auth != null
                && request.resource.data.uid == request.auth.uid
                && (request.resource.data.get('companyId', null) == null
                    || _writerIsCompanyWriter(request.resource.data.companyId));

  allow update: if _isOwnerOrTeamWriter()
                || (resource.data.get('expiresAt', 0) > request.time.toMillis()
                    && resource.data.get('revoked', false) == false
                    && !['approved','rejected','changes_requested'].hasAny([resource.data.get('status','pending')])
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
                      'status','respondedAt','responseComments','accessLog','readCount'
                    ]));

  allow delete: if _isOwnerOrTeamWriter();
}
```

Key differences from rfqUploads rules:
- **Revoked check** on public read/update (security req #4). rfqUploads doesn't have this — we add it because drawings are higher-stakes than RFQ line items.
- **Post-resolution lockout** (security req #5): public updates blocked when status is terminal (`approved`, `rejected`, `changes_requested`).
- **Field allow-list is tighter**: only status, respondedAt, responseComments, accessLog, readCount. No file uploads, no storageUrl.

### Expiry

14 days (shorter than RFQ's 30 days). Drawing-bearing tokens should have a tighter window per the Brief's reasoning — a years-old forwarded email shouldn't open live IP.

Dual expiry: token becomes inaccessible when EITHER condition is met:
- `expiresAt` passes (time-bounded)
- Status becomes terminal (approval resolves)

Both enforced at the rule level.

---

## Q2 — Status Lifecycle

```
pending ──► viewed ──► approved
                   ──► rejected
                   ──► changes_requested
```

| State | Who sets | When | Portal shows |
|-------|----------|------|-------------|
| `pending` | ARC (at send) | Token doc created | — |
| `viewed` | Portal page | First load (auto) | Action buttons + comment field |
| `approved` | Customer | Clicks Approve | Receipt: "You approved this on [date]" |
| `rejected` | Customer | Clicks Reject + enters reason | Receipt with reason shown |
| `changes_requested` | Customer | Clicks Request Changes + enters details | Receipt with details shown |

**`viewed` transition:** On first portal load, if status is `pending`, the portal page updates it to `viewed` and appends to `accessLog`. This is cheap and gives the ARC user visibility that the customer opened the link.

**Terminal states are final.** Once approved/rejected/changes_requested, no further public updates. The portal shows a read-only receipt. The ARC user sees the response. If the customer needs to change their response, the ARC user sends a new BOM (creating a new token).

**Comments:** Required for `rejected` and `changes_requested` (portal validates before submit). Optional for `approved`. A rejection with no reason is useless — force the customer to explain.

---

## Q3 — Write-Back into bomApprovalRequests[]

**CF Firestore trigger on `bomApprovals/{token}` update. Patches the matching bar_ record in the project doc.**

### Trigger: `onBomApprovalResponse`

```
exports.onBomApprovalResponse = functions.firestore
  .document('bomApprovals/{token}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const terminal = ['approved','rejected','changes_requested'];
    if (terminal.includes(before.status) || !terminal.includes(after.status)) return null;
    // ... write-back + notification logic
  });
```

Fires only on transition TO a terminal state. Ignores pending→viewed (not worth a notification).

### Write-Back

The CF reads `projectId` and `barId` from the token doc, loads the project doc from the correct path (`companies/{companyId}/projects/{projectId}` or `users/{uid}/projects/{projectId}`), finds the matching bar_ record in `bomApprovalRequests[]`, and patches it:

```js
matchingBar.status = after.status;            // "approved" | "rejected" | "changes_requested"
matchingBar.respondedAt = after.respondedAt;
matchingBar.responseComments = after.responseComments || null;
matchingBar.bomApprovalToken = context.params.token;  // back-reference for deep-linking
```

**Append-only:** The original fields (sentAt, sentTo, sentBy, mode, panels, quoteRev) are preserved. Only new response fields are added. Per CLAUDE.md data retention: no field removals, no overwrites.

### Notification + Email

Same pattern as `onSupplierQuoteSubmitted` (functions/index.js:623):

1. Create `users/{uid}/notifications` doc:
   ```js
   { type: 'bom_approval', title, body, createdAt, read: false,
     projectId, barId, status: after.status }
   ```
2. Send push notification via `sendPushToUser`
3. Send SendGrid email with "Open ARC to Review" CTA
4. Post to Teams via `postToTeams`

### Write-Back Path Resolution

The CF needs the project doc path. The token doc stores `companyId`. If companyId is set, path is `companies/{companyId}/projects/{projectId}`. If null (solo user), path is `users/{uid}/projects/{projectId}`. This mirrors the existing `resolveAnthropicKey` pattern.

---

## Q4 — Quote-Rev Coupling

**Recommendation: Record stale approval, do not auto-invalidate tokens.**

When the customer responds, the CF compares:
- `tokenDoc.quoteRev` (frozen at send time)
- `project.quoteRev` (current)

If they differ, the response is still written back (it's a valid customer action), but flagged:

```js
matchingBar.staleApproval = true;
matchingBar.approvedQuoteRev = tokenDoc.quoteRev;
matchingBar.currentQuoteRev = project.quoteRev;
```

ARC-side surfacing shows a warning: "⚠ Approval was for Qv.02, current quote is Qv.04."

**Why NOT auto-invalidate tokens on quote revision:**
- Requires a trigger on project quoteRev changes that finds and invalidates all outstanding tokens across the collection — complex, expensive (collection scan), and fragile.
- The customer gets a confusing "expired" message when they click the link, with no explanation that the quote changed.
- The ARC user may not have sent the new quote to the customer yet.

Better UX: let the customer respond, warn the ARC user that the approval is stale, and let the ARC user decide whether to re-send at the current revision. The stale flag is a human-judgment prompt, not an automated gate.

---

## Q5 — Customer Identity

Token-only access, decided. The eight security hardening points from the Brief are addressed throughout this supplement:

| # | Requirement | Where addressed |
|---|-------------|-----------------|
| 1 | Unguessable token | Q1: `crypto.getRandomValues(new Uint8Array(16))` — 128-bit |
| 2 | Token expiry | Q1: 14-day `expiresAt`, enforced in rules |
| 3 | Least-exposure scope | Q1: token doc has summary only — no project data, no drawings, no customer history |
| 4 | Revocability | Q1: `revoked` field, checked in rules on every public read/update |
| 5 | Post-resolution lockout | Q1/Q2: rules block updates when status is terminal; portal shows receipt |
| 6 | Secured document delivery | ★ Gating question: response-only portal, no document served |
| 7 | Cost/abuse hardening | Below |
| 8 | Access audit trail | Q1: `accessLog` array, appended on each portal load |

### Cost/Abuse Hardening (Requirement #7)

The BOM approval portal has **no AI extraction** (unlike the supplier portal). The customer reads a summary and clicks a button. The cost-attack surface is Firestore reads only — no Anthropic API spend.

Hardening inherited from the RFQ pattern:
- **`readCount` on the token doc** — incremented on each portal page load. Cap at 100 reads (legitimate use is 1-5). Portal rejects loads past the cap.
- **`maxInstances` cap** on any new CF callable (10, same as `removeTeamMember`).
- **Status guards** in rules — terminal status blocks further public updates.
- **Expiry + revocation** in rules — no access to expired or revoked tokens.

Since there's no AI callable (the portal is just Firestore reads + one status update), the `aiCallCount` / `aiSpendCents` / spend-ledger pattern from the RFQ portal is not needed. The read counter + status guards are sufficient.

---

## Q6 — ARC-Side Surfacing

### Bell Notification

New notification type: `bom_approval`. The CF creates a notification doc with `type: 'bom_approval'` and the bell menu renders it with a distinct icon (e.g. `📋` for BOM, distinct from `📥` for supplier quotes).

`handleNotifClick` gets a new branch:
```js
} else if (notif.type === 'bom_approval' && notif.projectId) {
  const proj = projects.find(p => p.id === notif.projectId);
  if (proj) { handleOpen(proj); /* auto-scroll to QUOTE SUMMARY */ }
}
```

### QUOTE SUMMARY Surface

Currently, `bomApprovalRequests[]` is data-only — not surfaced in any UI. #137 adds a section in PanelListView's QUOTE SUMMARY area showing each bar_ record:

| Column | Content |
|--------|---------|
| Date | sentAt, formatted |
| Sent To | sentTo (customer email) |
| Mode | "Standalone" or "Bundled" |
| Qv. | quoteRev |
| Status | Badge: Sent (gray) / Viewed (blue) / Approved (green) / Rejected (red) / Changes Requested (amber) |
| Stale? | ⚠ icon if staleApproval is true, with tooltip showing rev mismatch |
| Actions | "Revoke Link" button (sets revoked=true on the token doc). "View Response" if terminal (shows comments). |

This mirrors the RFQ Sent History table pattern (line 19795+).

### Project Tile

Optional: a small status indicator on the Dashboard project tile when there's an unread BOM approval response. This is lightweight — just check if any bar_ record has a terminal status that was set after the last notification was read. Defer to v2 if it complicates the project tile render.

---

## Q7 — Multi-Panel / Partial Approval

**All-or-nothing per request for v1.**

The bar_ record's `panels[]` lists all panels covered by that send. The customer approves or rejects the ENTIRE quoted BOM — they can't approve Panel 1 and reject Panel 2 in the same response.

If a customer needs to split their response: the ARC user sends separate Quoted BOMs for different panel subsets (each creates its own bar_ record and token), and the customer responds to each independently. This is a workflow choice, not a code constraint — #133 already supports per-panel selection in the send flow.

**Partial approval is parked for v2** if customers ask for it. It would require:
- A per-panel status map on the token doc
- Per-panel response UI in the portal
- Per-panel write-back into the bar_ record
- Per-panel surfacing in QUOTE SUMMARY

The state complexity is real. Start simple.

---

## Portal Page Component

New component: `BomApprovalPortalPage({token})`, mirroring `SupplierPortalPage` (app.jsx:46704).

Entry point — same pattern as the RFQ portal. In `Root` (line 47438+):
```js
const [bomApprovalToken] = useState(() => {
  try { return new URLSearchParams(window.location.search).get("bomApproval") || null; }
  catch(e) { return null; }
});
```

At line 47490 (before the auth check):
```jsx
if (bomApprovalToken) return (<><BomApprovalPortalPage token={bomApprovalToken}/><ArcDialogHost/><PopupBlockedModal/></>);
```

### Portal Page Flow

1. Load token doc from Firestore
2. Validate: exists? expired? revoked? status already terminal?
3. If valid + status is `pending`, update to `viewed`, append to accessLog, increment readCount
4. Render:
   - Company logo + name (from token doc)
   - Summary: project name, quote rev, panel names, sent date
   - If terminal: read-only receipt ("You approved this on [date]" + comments)
   - If active: action buttons + comment text area
5. On submit: update token doc with status + respondedAt + responseComments → CF fires → write-back + notification

### Portal Page Rendering

Company-branded, minimal, professional. Dark theme matching ARC. No navigation, no sidebar — single-purpose page. Same design language as the existing supplier portal page.

---

## Staging Recommendation

The Brief suggested staging. Given that the patterns are all precedented (RFQ portal, engineering review portal, notification system), I recommend **two build phases within the same ticket**:

### Phase 1: Token Core + Portal Page (security-first)

1. `bomApprovals` Firestore rules (with all 8 security requirements)
2. Token creation at send time (both standalone + bundled paths)
3. Portal link in the email body
4. `BomApprovalPortalPage` component (response-only, no document)
5. Portal URL param detection in Root

**Ship Phase 1 → verify token security + portal rendering → proceed.**

### Phase 2: Write-Back + ARC Surfacing

1. `onBomApprovalResponse` CF trigger
2. Write-back into bomApprovalRequests[] on the project doc
3. Bell notification with deep-link
4. QUOTE SUMMARY display section
5. "Revoke Link" action in QUOTE SUMMARY
6. Quote-rev stale-approval warning

Phase 2 depends on Phase 1 being deployed (the CF trigger fires on `bomApprovals` updates that Phase 1 creates).

---

## Summary Table

| Question | Decision | Key rationale |
|----------|----------|---------------|
| ★ Q6 Security | Response-only portal; no document served | PDF is email attachment today; no Storage URL exists; zero leak risk |
| Q1 Token model | New `bomApprovals/{token}` collection | Separate audience from rfqUploads/reviewUploads; own rules, own data shape |
| Q2 Status lifecycle | pending → viewed → approved / rejected / changes_requested | Comments required for reject/changes; terminal states are final |
| Q3 Write-back | CF trigger patches matching bar_ record; append-only | Mirrors onSupplierQuoteSubmitted pattern; preserves sent-record history |
| Q4 Quote-rev | Record stale approval, don't auto-invalidate | Auto-invalidation is complex and confusing to the customer |
| Q5 Identity | Token-only, hardened per 8 security requirements | Decided in Brief; all 8 requirements addressed |
| Q6 Surfacing | Bell notification (type: bom_approval) + QUOTE SUMMARY section | Mirrors RFQ notification + Sent History pattern |
| Q7 Partial approval | All-or-nothing per request, v1 | Partial multiplies state complexity; park for v2 |

---

## Open Item Flagged (Not #137 Scope)

The engineering review portal (`reviewUploads`, line 29119) embeds `getDownloadURL()` Storage URLs for drawing pages directly in the token doc. These URLs contain permanent, unrevokable access tokens. A leaked review portal link exposes the drawing images independent of the token's expiry. This is the exact risk the Brief warned about for #137, but it exists TODAY in the review portal. Separate security finding — Jon to track.

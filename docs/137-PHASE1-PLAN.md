# #137 Phase 1 Detailed Plan — BOM Approval Token Core + Portal Page

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-17  
**Status:** Plan — awaiting Jon approval, then Marc builds (diff-gated)  
**Source spec:** `docs/137-SUPPLEMENT.md` (C89)  
**Phase 2 (CF write-back, notification, QUOTE SUMMARY):** explicitly NOT in this plan

---

## Phase-1 Responses-Invisible Caveat

Phase 1 deploys the token security layer and the customer-facing portal page. It does NOT include:
- Cloud Function `onBomApprovalResponse` (write-back to bar_ record)
- Bell notification
- QUOTE SUMMARY display section
- "Revoke Link" action

A Phase 1 customer response lands as `status:"approved"` (or rejected/changes_requested) on the `bomApprovals/{token}` Firestore doc but **surfaces nowhere in ARC**. Phase 1 is for token-security + portal-render verification only. The test criteria verify the token doc via direct Firestore inspection, not via any ARC-side surface.

**Do not point a real customer at a live link until Phase 2 ships.**

---

## Token / bar_ Atomicity Ordering

### Write sequence (both send paths)

```
1. Generate token + barId     (in memory — pure, no I/O)
2. Create bomApprovals/{token} doc in Firestore
3. Build email HTML           (includes portal link with token)
4. Send email via Graph API
5. Save bar_ record           (includes bomApprovalToken back-reference)
```

### Why this ordering

**Token-doc-before-email** is the critical constraint. If the email goes first and the token doc write fails, the customer receives a link to a non-existent token — permanent "invalid link" with no recovery path except re-sending. Token-doc-first guarantees the link works when the customer clicks it.

**bar_-save after email** matches the existing pattern (line 32617 comment: "a save failure isn't reported as a send failure"). The bar_ back-reference is a convenience for Phase 2 ARC-side linking, not the source of truth — the token doc carries all identity fields (`projectId`, `barId`, `uid`, `companyId`).

### Partial-failure behavior

| Failure point | State | Customer impact | ARC impact | Recovery |
|---------------|-------|-----------------|------------|----------|
| Token doc creation fails | No email, no link, no bar_ | None | User sees error: "Could not create approval link" | Retry send |
| Email send fails | Token doc exists (orphan), no email | None (no link received) | User sees "Send failed" | Retry creates new token; orphan expires in 14 days |
| bar_ save fails | Token doc exists, email sent, bar_ missing | Portal works — customer can respond | User warned: "BOM sent but audit record failed to save" | Token doc is authoritative; Phase 2 CF reads from token doc, not bar_. Manual cleanup optional. |

**Orphan-token is the designed-for failure mode.** An orphan token (created but email never sent, or email sent but bar_ not saved) is benign: it expires in 14 days, no one has the link (email-fail case), or the link works fine and Phase 2's CF finds the token by doc ID (bar_-fail case). No cleanup required.

---

## Change 1 — Firestore Rules: `bomApprovals/{token}`

**File:** `firestore.rules`  
**Location:** After `match /rfqUploads/{token}` block (line 119), before `match /reviewUploads/{token}` (line 124)

### New rule block

```
match /bomApprovals/{token} {
  // Helpers scoped to bomApprovals (same pattern as rfqUploads lines 94-104,
  // duplicated because Firestore functions are match-block-scoped)
  function _baWriterIsCompanyWriter(cid) {
    return cid != null
      && exists(/databases/$(database)/documents/companies/$(cid)/members/$(request.auth.uid))
      && get(/databases/$(database)/documents/companies/$(cid)/members/$(request.auth.uid)).data.role != 'view';
  }
  function _baIsOwnerOrTeamWriter() {
    return request.auth != null && (
      resource.data.get('uid', null) == request.auth.uid
      || _baWriterIsCompanyWriter(resource.data.get('companyId', null))
    );
  }

  // READ: ARC owner/team always; public only while unexpired AND not revoked
  allow read: if _baIsOwnerOrTeamWriter()
              || (resource.data.get('expiresAt', 0) > request.time.toMillis()
                  && resource.data.get('revoked', false) == false);

  // CREATE: authenticated ARC user, own uid, company membership if companyId set
  allow create: if request.auth != null
                && request.resource.data.uid == request.auth.uid
                && (request.resource.data.get('companyId', null) == null
                    || _baWriterIsCompanyWriter(request.resource.data.companyId));

  // UPDATE: ARC owner/team can update freely (revoke, Phase 2 write-back);
  // public (customer) can update only unexpired + unrevoked + non-terminal,
  // restricted to response fields only
  allow update: if _baIsOwnerOrTeamWriter()
                || (resource.data.get('expiresAt', 0) > request.time.toMillis()
                    && resource.data.get('revoked', false) == false
                    && !(['approved','rejected','changes_requested'].hasAny([resource.data.get('status','pending')]))
                    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
                      'status','respondedAt','responseComments','accessLog','readCount'
                    ]));

  // DELETE: ARC owner/team only
  allow delete: if _baIsOwnerOrTeamWriter();
}
```

### Security requirements coverage

| # | Requirement | Rule mechanism |
|---|------------|----------------|
| 1 | Unguessable token | 128-bit crypto token (client-side generation, Change 2) |
| 2 | Token expiry | `expiresAt` checked on every public read/update |
| 3 | Least-exposure scope | Token doc has summary only — no project data, no drawings |
| 4 | Revocability | `revoked` field checked on every public read/update |
| 5 | Post-resolution lockout | `hasAny` check blocks updates when status is terminal |
| 6 | Secured document delivery | Response-only portal — no document served |
| 7 | Cost/abuse hardening | `readCount` cap (portal-side, Change 6) |
| 8 | Access audit trail | `accessLog` append on every portal load |

---

## Change 2 — Token Generation Helper

**File:** `src/app.jsx`  
**Location:** Near the existing RFQ token generation (line 19003) or at the top of PanelListView's function body. A standalone helper keeps both send paths DRY.

### Helper function (~8 lines)

```js
function createBomApprovalTokenDoc(project, barId, sentTo) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const doc = {
    uid: _appCtx.uid,
    companyId: _appCtx.companyId || null,
    projectId: project.id,
    barId,
    sentTo,
    sentBy: fbAuth.currentUser?.email || _appCtx.uid,
    sentAt: Date.now(),
    panels: (project.panels || []).map(p => p.name || p.drawingNo || p.id),
    panelIds: (project.panels || []).map(p => p.id),
    quoteRev: project.quoteRev || 0,
    projectName: project.name || '',
    companyName: _appCtx.company?.name || '',
    companyLogoUrl: _appCtx.company?.logoUrl || null,
    expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
    revoked: false,
    status: 'pending',
    accessLog: [],
    readCount: 0,
    respondedAt: null,
    responseComments: null,
  };
  return { token, doc };
}
```

Both send paths call this, then write to Firestore:
```js
const { token, doc } = createBomApprovalTokenDoc(project, barId, recipientEmail);
await fbDb.collection('bomApprovals').doc(token).set(doc);
```

---

## Change 3 — Standalone Send Path (`handleBomSend`)

**File:** `src/app.jsx`  
**Function:** `handleBomSend()` (line 32583)  
**Current flow:** validate → setBomSending → acquireGraphToken → build HTML → generate PDF → send email → save bar_ record  
**New flow:** validate → setBomSending → acquireGraphToken → generate barId + token doc → build HTML (with portal link) → generate PDF → send email → save bar_ record (with token)

### Modifications

**A. Generate barId early** (move from line 32621 to before token creation):

Currently the barId is generated inline at line 32621:
```js
const req = {id: "bar_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6), ...};
```

Move to before the token creation so both the token doc and bar_ record share the same barId.

**B. Create token doc** (insert after `acquireGraphToken`, before HTML build — between lines 32605 and 32606):

```js
const barId = "bar_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const { token: approvalToken, doc: approvalDoc } = createBomApprovalTokenDoc(project, barId, m.to);
try {
  await fbDb.collection('bomApprovals').doc(approvalToken).set(approvalDoc);
} catch (e) {
  arcAlert("Could not create approval portal link: " + e.message);
  setBomSending(false);
  return;
}
```

**C. Add portal link to email HTML** (modify line 32608-32609):

After `bomNote`, before the signature close:
```js
const portalLink = `https://matrix-arc.web.app?bomApproval=${approvalToken}`;
const portalBlock = `<p style="margin-top:16px"><a href="${portalLink}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Review & Approve BOM →</a></p><p style="font-size:12px;color:#94a3b8;margin-top:4px">This link expires in 14 days.</p>`;
const html = `<div style="...">${m.message...}${bomNote}${portalBlock}<p ...>Best regards,...</p></div>`;
```

**D. Stamp token on bar_ record** (modify line 32621-32624):

```js
const req = {
  id: barId,  // ← use pre-generated barId (was inline)
  sentAt: Date.now(), sentTo: m.to, sentBy: fbAuth.currentUser?.email || uid,
  mode: "standalone", panels: (project.panels || []).map(p => p.id),
  quoteRev: project.quoteRev || 0, status: "sent",
  bomApprovalToken: approvalToken,  // ← NEW: back-reference for Phase 2
};
```

---

## Change 4 — Bundled Send Path (QuoteSendModal)

**File:** `src/app.jsx`  
**Location:** Inside QuoteSendModal's send function, within the `if(includeTravelerBom)` block (line 32132)  
**Current flow:** build HTML → send email → build bar_ → save project  
**New flow:** generate barId + token doc (if includeTravelerBom) → build HTML (with portal link) → send email → build bar_ (with token) → save project

### Modifications

**A. Token creation before HTML build** (insert after `setSending(true)` / `acquireGraphToken` around line 32054, gated on `includeTravelerBom`):

```js
let approvalToken = null;
let approvalBarId = null;
if (includeTravelerBom) {
  approvalBarId = "bar_" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  const { token: tok, doc: approvalDoc } = createBomApprovalTokenDoc(
    populated, approvalBarId, sendMode === "reply" ? /* sentTo logic */ : m.to
  );
  try {
    await fbDb.collection('bomApprovals').doc(tok).set(approvalDoc);
    approvalToken = tok;
  } catch (e) {
    arcAlert("Could not create approval portal link: " + e.message);
    setSending(false);
    return;
  }
}
```

**Sentto resolution note:** The bundled path's `sentTo` is computed AFTER the email send (line 32114-32116, using `selectedThread` for reply mode). The token doc needs `sentTo` BEFORE the email. For new-email mode, use `m.to`. For reply mode, use `selectedThread.fromEmail || selectedThread.from`. Marc should verify the `sentTo` value matches between the token doc and the bar_ record.

**B. Add portal link to email HTML** (modify line 32059-32060):

```js
const portalBlock = approvalToken
  ? `<p style="margin-top:16px"><a href="https://matrix-arc.web.app?bomApproval=${approvalToken}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px">Review & Approve BOM →</a></p><p style="font-size:12px;color:#94a3b8;margin-top:4px">This link expires in 14 days.</p>`
  : "";
const html = `<div style="...">${m.message...}${bomNote}${portalBlock}<p ...>Best regards,...</p></div>`;
```

**C. Stamp token on bar_ record** (modify line 32133):

```js
const req = {
  id: approvalBarId,  // ← use pre-generated barId
  sentAt: Date.now(), sentTo: sentTo, sentBy: fbAuth.currentUser?.email || uid,
  mode: "bundled", panels: (project.panels || []).map(p => p.id),
  quoteRev: rev, status: "sent",
  bomApprovalToken: approvalToken,  // ← NEW
};
```

---

## Change 5 — Portal URL Param Detection (Root)

**File:** `src/app.jsx`  
**Function:** `Root()` (line 47478)

### A. Add state (after line 47479):

```js
const [bomApprovalToken] = useState(() => {
  try { return new URLSearchParams(window.location.search).get("bomApproval") || null; }
  catch(e) { return null; }
});
```

### B. Add routing (after line 47531, before the loading/auth checks):

```jsx
if (bomApprovalToken) return (<><BomApprovalPortalPage token={bomApprovalToken}/><ArcDialogHost/><PopupBlockedModal/></>);
```

Same pattern as the RFQ portal routing at line 47531. The portal page renders without authentication — the token IS the auth.

---

## Change 6 — BomApprovalPortalPage Component

**File:** `src/app.jsx`  
**Location:** Before `SupplierPortalPage` (line 46745) or after it. Same file, same pattern.

### Component structure (~120-150 lines)

```jsx
function BomApprovalPortalPage({ token }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [comments, setComments] = useState('');

  // Load token doc
  useEffect(() => {
    fbDb.collection('bomApprovals').doc(token).get()
      .then(snap => {
        if (!snap.exists) { setError("This link is invalid or has expired."); setLoading(false); return; }
        const data = snap.data();
        // Check expiry client-side (rules enforce it too, but show a clear message)
        if (data.expiresAt && data.expiresAt < Date.now()) {
          setError("This approval link has expired. Please contact your sales representative for a new link.");
          setLoading(false); return;
        }
        if (data.revoked) {
          setError("This approval link has been revoked. Please contact your sales representative.");
          setLoading(false); return;
        }
        setInfo(data);
        // Mark as viewed + append access log + increment readCount
        if (data.status === 'pending') {
          fbDb.collection('bomApprovals').doc(token).update({
            status: 'viewed',
            accessLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now() }),
            readCount: firebase.firestore.FieldValue.increment(1),
          }).catch(e => console.warn('[BOM APPROVAL] viewed update failed:', e));
        } else if (!['approved','rejected','changes_requested'].includes(data.status)) {
          // viewed or unknown — just log access
          fbDb.collection('bomApprovals').doc(token).update({
            accessLog: firebase.firestore.FieldValue.arrayUnion({ ts: Date.now() }),
            readCount: firebase.firestore.FieldValue.increment(1),
          }).catch(e => console.warn('[BOM APPROVAL] access log failed:', e));
        }
        setLoading(false);
      })
      .catch(e => { setError("Could not load: " + e.message); setLoading(false); });
  }, [token]);

  // Read count cap (security req #7)
  // If readCount > 100, show error instead of content
  
  async function handleSubmit(status) {
    if (status !== 'approved' && !comments.trim()) {
      arcAlert('Please enter a reason for ' + (status === 'rejected' ? 'rejection' : 'requested changes') + '.');
      return;
    }
    const confirmMsg = status === 'approved'
      ? 'Approve this Quoted BOM? This action is final.'
      : status === 'rejected'
        ? 'Reject this Quoted BOM? This action is final.'
        : 'Request changes to this Quoted BOM? This action is final.';
    if (!await arcConfirm(confirmMsg)) return;
    setSubmitting(true);
    try {
      await fbDb.collection('bomApprovals').doc(token).update({
        status,
        respondedAt: Date.now(),
        responseComments: comments.trim() || null,
      });
      setInfo(prev => ({ ...prev, status, respondedAt: Date.now(), responseComments: comments.trim() || null }));
    } catch (e) {
      arcAlert('Failed to submit: ' + e.message);
    }
    setSubmitting(false);
  }

  // RENDER
  // Loading / error states (same pattern as SupplierPortalPage)
  // if (loading) → spinner
  // if (error) → error message with company branding fallback
  // if terminal status → read-only receipt
  // if active → summary + action buttons + comment textarea
}
```

### Render layout (response-only, no document)

**Header:** Company logo (from `info.companyLogoUrl`) + company name. Dark theme matching ARC.

**Summary block:**
- "Quoted BOM for **{projectName}**"
- "Quote Revision: Qv.{quoteRev}"
- "Panels: {panels.join(', ')}"
- "Sent: {formatDate(sentAt)}"
- "Sent to: {sentTo}"

**Terminal state (status is approved/rejected/changes_requested):**
- "You {approved/rejected/requested changes to} this on {formatDate(respondedAt)}"
- If comments: show in a read-only block
- No action buttons

**Active state (status is pending or viewed):**
- Three buttons: Approve (green), Reject (red), Request Changes (amber)
- Comment textarea: required for reject/changes_requested, optional for approve
- Submit confirmation dialog before each action

**Read count cap:** If `info.readCount > 100`, render "This link has been accessed too many times. Please contact your sales representative." instead of the normal content. (Rules still block the update; this is UX.)

---

## Phase-Internal Ordering

```
Step 1:  firestore.rules  — new bomApprovals match block (Change 1)
Step 2:  src/app.jsx      — token helper function (Change 2)
Step 3:  src/app.jsx      — standalone send path (Change 3)
Step 4:  src/app.jsx      — bundled send path (Change 4)
Step 5:  src/app.jsx      — Root URL param detection (Change 5)
Step 6:  src/app.jsx      — BomApprovalPortalPage component (Change 6)
```

Steps 1-6 ship together in one deploy. Steps 2-6 are all in `src/app.jsx`. Step 1 is `firestore.rules`.

---

## Deploy Mechanics

**Single deploy: rules + hosting together. No functions deploy in Phase 1.**

```bash
firebase deploy --only firestore:rules
bash deploy.sh
```

Rules first (so the collection exists when the app writes to it). Then hosting (so the portal page is live). Order matters: if hosting deploys first and a user sends a BOM before rules deploy, the token doc write will fail (no rule match → denied). Rules-first is safe because the collection is new — no existing behavior changes.

No `firebase deploy --only functions` — Phase 1 has no Cloud Function changes.

---

## Test Criteria

All verification via direct Firestore inspection + browser. No ARC-side surface exists in Phase 1.

### P1-T1 — Standalone send creates token doc
Trigger `handleBomSend` (📋 Send Quoted BOM). Verify in Firestore console:
- `bomApprovals/{token}` doc exists with correct `uid`, `companyId`, `projectId`, `barId`, `sentTo`, `panels`, `quoteRev`, `projectName`, `status:"pending"`, `expiresAt` ~14 days out.
- The bar_ record in `bomApprovalRequests[]` has `bomApprovalToken` matching the token.

### P1-T2 — Bundled send creates token doc
Trigger quote send with "Include Quoted BOM" toggled ON in QuoteSendModal. Same verification as P1-T1 but `mode:"bundled"`. Verify token doc + bar_ back-reference.

### P1-T3 — Bundled send WITHOUT BOM skips token
Send quote with "Include Quoted BOM" toggled OFF. Verify NO `bomApprovals` doc created. No `bomApprovalToken` on the bar_ record. No portal link in the email.

### P1-T4 — Email contains portal link
Check sent email (Outlook Sent Items). Verify "Review & Approve BOM →" button links to `https://matrix-arc.web.app?bomApproval={token}`. Link should resolve to the portal page when clicked.

### P1-T5 — Portal page loads and shows summary
Open the portal link in an incognito browser (not signed in to ARC). Verify:
- Company logo and name displayed
- Project name, quote rev, panel names, sent date all correct
- Three action buttons visible (Approve, Reject, Request Changes)
- Comment textarea present

### P1-T6 — Portal marks viewed on first load
After P1-T5, check the token doc in Firestore. Verify:
- `status` changed from `"pending"` to `"viewed"`
- `accessLog` has one entry with a timestamp
- `readCount` incremented to 1

### P1-T7 — Customer can approve
Click Approve in the portal. Verify in Firestore:
- `status:"approved"`
- `respondedAt` set
- `responseComments` null (optional, not entered)
- Portal shows receipt: "You approved this on [date]"
- Action buttons gone (terminal state)

### P1-T8 — Customer can reject (comments required)
Create a new token (re-send). Open portal. Try clicking Reject without entering a comment → should show validation error. Enter a reason, click Reject. Verify:
- `status:"rejected"`
- `responseComments` contains the entered reason
- Portal shows receipt with reason displayed

### P1-T9 — Post-resolution lockout
After P1-T7 or P1-T8, try to change the response (modify `status` via Firestore console REST or attempt to re-submit from portal). The rules should deny the update (terminal state check). Portal should show the read-only receipt with no action buttons.

### P1-T10 — Expired token
Create a token, then manually set `expiresAt` to a past timestamp in Firestore console. Open the portal link. Verify: "This approval link has expired" error message. Firestore rules should also deny any read from an unauthenticated client.

### P1-T11 — Revoked token
Set `revoked: true` on a token doc. Open the portal link. Verify: "This approval link has been revoked" error message.

### P1-T12 — Token doc creation failure (atomicity)
Simulate failure: temporarily comment out the `bomApprovals` rules (or add `allow create: if false`). Trigger a BOM send. Verify:
- User sees "Could not create approval portal link" error
- No email was sent
- No bar_ record was created
- Reset rules after test

### P1-T13 — bar_ save failure (atomicity)
After email sends but before bar_ save, simulate a Firestore write failure (e.g. via browser DevTools overriding the save function). Verify:
- Token doc exists (portal link works)
- User warned "BOM sent but audit record failed to save"
- Email was delivered with working portal link

### P1-T14 — Send-gate independence
Project with `manualVerifyRequired:true`. Verify 📋 Send Quoted BOM is still blocked (line 32587-32592 check fires before token creation). Token creation never reached.

### P1-T15 — Read count cap
Manually set `readCount: 101` on a token doc. Open the portal link. Verify portal shows access-cap error instead of the normal content.

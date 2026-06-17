# #156 Detailed Plan — In-Portal BOM Accuracy Confirmation + Verified Access

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-17  
**Status:** Plan — Jon-approved, Marc builds (diff-gated)  
**Supplement:** `docs/156-SUPPLEMENT.md` (C98)  
**Absorbs:** #137 Phase 2 (CF write-back, notification, QUOTE SUMMARY, Revoke)  
**Builds on:** #137 Phase 1 (token core, rules, send-path wiring — all LIVE v1.20.134)

---

## Three Internal Phases

| Phase | Scope | Deploy | Independently testable? |
|-------|-------|--------|------------------------|
| **A** | Server infrastructure — 6 new CFs, snapshot collection + rules, IAM config | `firebase deploy --only functions` + `firebase deploy --only firestore:rules` | YES — test via Firestore console + `firebase functions:shell` |
| **B** | Portal rewrite — `BomAccuracyPortalPage` replaces `BomApprovalPortalPage`, snapshot write in both send paths, `allowedDomains` capture | `bash deploy.sh` (hosting) | YES — test with real token link |
| **C** | ARC surfacing — `BomApprovalResponseModal`, QUOTE SUMMARY bar\_ display, notification deep-link, revoke action | `bash deploy.sh` (hosting) | YES — test with submitted response |

Each phase has its own deploy. Phase A must land before B (CFs must exist before portal calls them). Phase C can land independently of B (ARC surfacing reads token doc status, which Phase 1 portal can already set — but the full per-line response requires B).

---

## Pre-Deploy Gate (Phase A)

**IAM Service Account Token Creator role** — `PROJECT_ID@appspot.gserviceaccount.com` must have the `iam.serviceAccounts.signBlob` permission (via the "Service Account Token Creator" role) or `getSignedUrl()` throws `SigningError` at runtime. This is a one-time IAM configuration, not a code change.

**Verification:** Before deploying Phase A functions, run in `firebase functions:shell`:
```js
const admin = require('firebase-admin');
const bucket = admin.storage().bucket();
const [url] = await bucket.file('test/any-existing-file.pdf').getSignedUrl({
  action: 'read', expires: Date.now() + 60000, version: 'v4'
});
console.log(url); // must print a signed URL, not throw SigningError
```

If it throws, grant the role:
```
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:PROJECT_ID@appspot.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

**This is a deploy-blocking checklist item.** Easy to forget, silently works in dev and breaks in prod.

---

## Phase A — Server Infrastructure

### A1. Firestore rules: `bomApprovalSnapshots/{token}`

**File:** `firestore.rules`  
**Location:** After the `bomApprovals/{token}` block (after line 161)

```
match /bomApprovalSnapshots/{token} {
  allow create: if request.auth != null
    && request.resource.data.createdBy == request.auth.uid;
  allow read, update, delete: if false;
}
```

Create-only by authenticated ARC users. No client reads ever — all read access via Admin SDK in CFs. This is the hard security boundary: even if a token leaks, the BOM snapshot is unreachable without CF mediation.

### A2. Firestore rules: extend `bomApprovals/{token}` update allow-list

**File:** `firestore.rules`, line 156  
**Change:** Add OTP and session fields to the public update allow-list.

Current (line 156–158):
```
request.resource.data.diff(resource.data).affectedKeys().hasOnly([
  'status','respondedAt','responseComments','accessLog','readCount'
])
```

Replace with:
```
request.resource.data.diff(resource.data).affectedKeys().hasOnly([
  'status','respondedAt','responseComments','accessLog','readCount',
  'lineResponses','flaggedCount','totalLineCount','respondedBy','responseComment'
])
```

Wait — actually, `submitBomApprovalResponse` is a CF using Admin SDK. It bypasses rules. The public client never writes response fields — the portal calls the CF, and the CF writes via Admin SDK. So the existing rules are fine for Phase B's portal. The allow-list expansion is only needed if we want the portal to write responses directly (Phase 1's pattern) — but #156 deliberately moves all writes behind CFs.

**REVISED:** No change to the `bomApprovals` public update allow-list. The existing fields (`status`, `respondedAt`, `responseComments`, `accessLog`, `readCount`) remain for backward compatibility with any Phase 1 portal instances. The new fields (`lineResponses`, `flaggedCount`, etc.) are written exclusively by the `submitBomApprovalResponse` CF via Admin SDK.

The ARC-side team update rule (`_baIsOwnerOrTeamWriter()`, line 152) already allows unrestricted updates — the `revokeBomApproval` CF writes `revoked: true` via Admin SDK anyway, but the ARC UI revoke button (Phase C) could also write directly. Both paths work.

### A3. Cloud Function: `sendBomApprovalOtp`

**File:** `functions/index.js`  
**Type:** `onCall`, token-only auth (no `context.auth` required)  
**Pattern:** Follows `extractSupplierQuotePricing` (line 988) — token-auth, no Firebase Auth

```js
exports.sendBomApprovalOtp = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
    const { token, email } = data;
    if (!token || !email) throw ... 'invalid-argument';

    // 1. Load + validate token doc
    const tokenRef = db.collection('bomApprovals').doc(token);
    const tokenDoc = await tokenRef.get();
    if (!tokenDoc.exists) throw ... 'not-found';
    const td = tokenDoc.data();
    if ((td.expiresAt || 0) < Date.now()) throw ... 'failed-precondition', 'Token expired';
    if (td.revoked) throw ... 'failed-precondition', 'Token revoked';
    if (['confirmed','changes_requested'].includes(td.status)) throw ... 'failed-precondition', 'Already responded';

    // 2. Domain check (server-side only)
    const emailDomain = email.split('@')[1]?.toLowerCase();
    const allowed = (td.allowedDomains || []).map(d => d.toLowerCase());
    // SECURITY: constant-time-ish response — never reveal whether domain matched
    if (!emailDomain || !allowed.includes(emailDomain)) {
      // Log the attempt but return same shape as success
      functions.logger.warn('sendBomApprovalOtp: off-domain attempt', { token, emailDomain });
      return { sent: true }; // lie — never reveal domain list
    }

    // 3. Rate limiting
    const otpAttempts = td.otpAttempts || [];
    const recentAttempts = otpAttempts.filter(a => a.requestedAt > Date.now() - 3600000);
    if (recentAttempts.length >= 5) throw ... 'resource-exhausted', 'Too many requests. Try again in an hour.';
    const failedRecent = otpAttempts.filter(a => !a.verified && a.requestedAt > Date.now() - 900000);
    if (failedRecent.length >= 3) throw ... 'resource-exhausted', 'Too many failed attempts. Try again in 15 minutes.';
    if (otpAttempts.length >= 20) throw ... 'resource-exhausted', 'This link has reached its verification limit.';

    // 4. Generate code + hash
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    const crypto = require('crypto');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // 5. Store attempt on token doc
    await tokenRef.update({
      otpAttempts: admin.firestore.FieldValue.arrayUnion({
        email, requestedAt: Date.now(), codeHash, expiresAt, verified: false
      })
    });

    // 6. Send via SendGrid
    await sgMail.send({
      to: email,
      from: 'sales@matrixpci.com',
      subject: `Your verification code: ${code}`,
      html: `<div style="font-family:-apple-system,sans-serif;font-size:14px;color:#1e293b;line-height:1.7">
        <p>Your verification code for the ${td.companyName || 'Matrix Systems'} BOM review is:</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 0;color:#2563eb">${code}</div>
        <p style="font-size:13px;color:#64748b">This code expires in 10 minutes. If you did not request this, you can safely ignore it.</p>
      </div>`
    });

    return { sent: true };
  });
```

### A4. Cloud Function: `verifyBomApprovalOtp`

**File:** `functions/index.js`  
**Type:** `onCall`, token-only auth

```js
exports.verifyBomApprovalOtp = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
    const { token, email, code } = data;
    if (!token || !email || !code) throw ... 'invalid-argument';

    // 1. Load + validate token
    const tokenRef = db.collection('bomApprovals').doc(token);
    const tokenDoc = await tokenRef.get();
    // ... same 3-check validation as A3 ...

    // 2. Find matching unexpired OTP attempt
    const td = tokenDoc.data();
    const crypto = require('crypto');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const attempts = td.otpAttempts || [];
    const match = attempts.find(a =>
      a.email === email && a.codeHash === codeHash
      && a.expiresAt > Date.now() && !a.verified
    );
    if (!match) {
      functions.logger.warn('verifyBomApprovalOtp: wrong code', { token, email });
      throw ... 'permission-denied', 'Invalid or expired code.';
    }

    // 3. Mark attempt verified + generate session nonce
    const sessionNonce = crypto.randomBytes(32).toString('hex');
    const sessionExpiresAt = Date.now() + 4 * 3600 * 1000; // 4 hours

    // Update the attempt's verified flag (rewrite array — no arrayUnion for in-place edit)
    const updatedAttempts = attempts.map(a =>
      a.email === match.email && a.codeHash === match.codeHash && a.requestedAt === match.requestedAt
        ? { ...a, verified: true }
        : a
    );

    await tokenRef.update({
      otpAttempts: updatedAttempts,
      [`verifiedSessions.${sessionNonce}`]: {
        email, verifiedAt: Date.now(), expiresAt: sessionExpiresAt
      },
      accessLog: admin.firestore.FieldValue.arrayUnion({
        ts: Date.now(), email, event: 'otp_verified'
      }),
    });

    return { sessionNonce, expiresAt: sessionExpiresAt };
  });
```

### A5. Cloud Function: `getBomApprovalSnapshot`

**File:** `functions/index.js`  
**Type:** `onCall`, token + session nonce auth

```js
exports.getBomApprovalSnapshot = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
    const { token, sessionNonce } = data;
    if (!token || !sessionNonce) throw ... 'invalid-argument';

    // 1. Validate token (exists, unexpired, unrevoked, non-terminal)
    const tokenRef = db.collection('bomApprovals').doc(token);
    const tokenDoc = await tokenRef.get();
    if (!tokenDoc.exists) throw ... 'not-found';
    const td = tokenDoc.data();
    if ((td.expiresAt || 0) < Date.now()) throw ... 'failed-precondition', 'Expired';
    if (td.revoked) throw ... 'failed-precondition', 'Revoked';

    // 2. Validate session nonce
    const session = (td.verifiedSessions || {})[sessionNonce];
    if (!session || session.expiresAt < Date.now())
      throw ... 'permission-denied', 'Session expired. Please re-verify.';

    // 3. Log access
    await tokenRef.update({
      accessLog: admin.firestore.FieldValue.arrayUnion({
        ts: Date.now(), email: session.email, event: 'snapshot_view'
      }),
      readCount: admin.firestore.FieldValue.increment(1),
      ...(td.status === 'pending' ? { status: 'viewed' } : {}),
    });

    // 4. Read snapshot (Admin SDK — bypasses rules)
    const snapDoc = await db.collection('bomApprovalSnapshots').doc(token).get();
    if (!snapDoc.exists) throw ... 'not-found', 'Snapshot not found';
    const snap = snapDoc.data();

    // 5. Return projected data (BOM lines are already 4-column at write time)
    return {
      projectName: snap.projectName,
      quoteRev: snap.quoteRev,
      companyName: td.companyName || '',
      companyLogoUrl: td.companyLogoUrl || null,
      sentAt: td.sentAt,
      panels: snap.panels.map(p => ({
        panelId: p.panelId,
        panelName: p.panelName,
        drawingNo: p.drawingNo || '',
        drawingRev: p.drawingRev || '',
        hasPdf: (p.pdfStoragePaths || []).length > 0,
        bomLines: p.bomLines,  // already {lineIndex, qty, partNumber, description, manufacturer}
      })),
      verifiedEmail: session.email,
      existingResponse: td.status === 'confirmed' || td.status === 'changes_requested'
        ? { status: td.status, lineResponses: td.lineResponses || [], responseComment: td.responseComment }
        : null,
    };
  });
```

### A6. Cloud Function: `getBomApprovalPdf`

**File:** `functions/index.js`  
**Type:** `onCall`, token + session nonce auth

```js
exports.getBomApprovalPdf = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
    const { token, sessionNonce, panelId } = data;
    if (!token || !sessionNonce || !panelId) throw ... 'invalid-argument';

    // 1. Validate token + session (same as A5)
    // ...

    // 2. Read snapshot to find PDF storage path for the requested panel
    const snapDoc = await db.collection('bomApprovalSnapshots').doc(token).get();
    if (!snapDoc.exists) throw ... 'not-found';
    const panel = snapDoc.data().panels.find(p => p.panelId === panelId);
    if (!panel || !panel.pdfStoragePaths?.length) throw ... 'not-found', 'No PDF for this panel';

    // 3. Mint 5-minute signed URL via Admin SDK
    const bucket = admin.storage().bucket();
    const pdfPath = panel.pdfStoragePaths[0].originalPdfPath;
    const file = bucket.file(pdfPath);
    const [exists] = await file.exists();
    if (!exists) throw ... 'not-found', 'PDF file not found in storage';

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      version: 'v4',
    });

    // 4. Log access
    await tokenRef.update({
      accessLog: admin.firestore.FieldValue.arrayUnion({
        ts: Date.now(), email: session.email, event: 'pdf_view', panelId
      }),
    });

    return { signedUrl, expiresIn: 300 };
  });
```

**CRITICAL:** The signed URL expires in 5 minutes. The portal must re-request if the user keeps the PDF open longer. The URL is token-revalidated on every request — revoking the token immediately kills PDF access (next request fails).

### A7. Cloud Function: `submitBomApprovalResponse`

**File:** `functions/index.js`  
**Type:** `onCall`, token + session nonce auth

```js
exports.submitBomApprovalResponse = functions
  .runWith({ timeoutSeconds: 30, memory: '256MB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
    const { token, sessionNonce, lineResponses, responseComment } = data;
    if (!token || !sessionNonce || !Array.isArray(lineResponses)) throw ... 'invalid-argument';

    // 1. Validate token (exists, unexpired, unrevoked, NOT already terminal)
    const tokenRef = db.collection('bomApprovals').doc(token);
    const tokenDoc = await tokenRef.get();
    if (!tokenDoc.exists) throw ... 'not-found';
    const td = tokenDoc.data();
    if ((td.expiresAt || 0) < Date.now()) throw ... 'failed-precondition', 'Expired';
    if (td.revoked) throw ... 'failed-precondition', 'Revoked';
    if (['confirmed','changes_requested'].includes(td.status))
      throw ... 'failed-precondition', 'Already responded';

    // 2. Validate session
    const session = (td.verifiedSessions || {})[sessionNonce];
    if (!session || session.expiresAt < Date.now())
      throw ... 'permission-denied', 'Session expired';

    // 3. Validate + sanitize lineResponses
    // Each: { panelId, lineIndex, flagged, comment, partNumber, description }
    const sanitized = lineResponses.map(lr => ({
      panelId: String(lr.panelId || ''),
      lineIndex: Number(lr.lineIndex || 0),
      flagged: !!lr.flagged,
      comment: lr.flagged ? String(lr.comment || '').slice(0, 500) : '',
      partNumber: String(lr.partNumber || '').slice(0, 100),
      description: String(lr.description || '').slice(0, 200),
    }));
    const flaggedCount = sanitized.filter(lr => lr.flagged).length;
    const totalLineCount = sanitized.length;
    const status = flaggedCount === 0 ? 'confirmed' : 'changes_requested';

    // 4. Write response to token doc (Admin SDK — bypasses rules)
    await tokenRef.update({
      status,
      respondedAt: Date.now(),
      respondedBy: session.email,
      responseComment: (responseComment || '').slice(0, 2000) || null,
      lineResponses: sanitized,
      flaggedCount,
      totalLineCount,
      accessLog: admin.firestore.FieldValue.arrayUnion({
        ts: Date.now(), email: session.email, event: 'response_submitted',
        flaggedCount, totalLineCount,
      }),
    });

    return { status, flaggedCount, totalLineCount };
  });
```

**DQ3 enforcement:** This CF writes ONLY to the `bomApprovals/{token}` doc. It NEVER touches `project.panels[].bom[]`. The response is a comment record, not a data mutation. The estimator reads the flags in ARC and decides.

### A8. Cloud Function: `onBomApprovalResponse` (Firestore trigger)

**File:** `functions/index.js`  
**Type:** Firestore `onUpdate` trigger on `bomApprovals/{token}`  
**Pattern:** Follows `onSupplierQuoteSubmitted` (line 623)

```js
exports.onBomApprovalResponse = functions.firestore
  .document('bomApprovals/{token}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Only fire on status transition TO a terminal state
    const terminal = ['confirmed','changes_requested'];
    if (terminal.includes(before.status) || !terminal.includes(after.status)) return null;

    const token = context.params.token;
    const uid = after.uid; // originating ARC user
    const projectId = after.projectId;

    // 1. Update bar_ record on the project doc
    try {
      const projPath = after.companyId
        ? `companies/${after.companyId}/projects/${projectId}`  // team path
        : `users/${uid}/projects/${projectId}`;                 // solo path

      // Actually — projects live at users/{uid}/projects/{id} or the team path.
      // The token doc carries uid + companyId + projectId. Read the project,
      // find the matching bar_ record, update it in place.
      // NOTE: bar_ records are on the project doc in bomApprovalRequests[].
      // Since Firestore has no array-element update, read→mutate→write.
      const projRef = db.doc(`users/${uid}/projects/${projectId}`);
      const projSnap = await projRef.get();
      if (projSnap.exists) {
        const proj = projSnap.data();
        const bars = proj.bomApprovalRequests || [];
        const idx = bars.findIndex(b => b.bomApprovalToken === token);
        if (idx >= 0) {
          bars[idx] = {
            ...bars[idx],
            status: after.status,
            respondedAt: after.respondedAt,
            respondedBy: after.respondedBy,
            flaggedCount: after.flaggedCount || 0,
            totalLineCount: after.totalLineCount || 0,
          };
          await projRef.update({ bomApprovalRequests: bars });
        }
      }
    } catch (e) {
      functions.logger.error('onBomApprovalResponse: bar_ update failed', { token, error: e.message });
    }

    // 2. Create notification for originating ARC user
    try {
      const flagged = after.flaggedCount || 0;
      const total = after.totalLineCount || 0;
      const notifDoc = {
        type: 'bom_approval',
        read: false,
        createdAt: Date.now(),
        projectId,
        projectName: after.projectName || '',
        message: flagged === 0
          ? `BOM confirmed by ${after.respondedBy || 'customer'}`
          : `${flagged} of ${total} line(s) flagged by ${after.respondedBy || 'customer'}`,
        barId: after.barId || null,
        token,
      };
      await db.collection(`users/${uid}/notifications`).add(notifDoc);
    } catch (e) {
      functions.logger.error('onBomApprovalResponse: notification failed', { token, error: e.message });
    }

    return null;
  });
```

**#86 identity:** `projectId` is read from `after.projectId` (written at send time, immutable on the token doc). The trigger never writes to "the currently open project."

### A9. Cloud Function: `revokeBomApproval`

**File:** `functions/index.js`  
**Type:** `onCall`, requires Firebase Auth (ARC user)

```js
exports.revokeBomApproval = functions
  .runWith({ timeoutSeconds: 15, memory: '256MB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
    if (!context.auth) throw ... 'unauthenticated';
    const { token } = data;
    if (!token) throw ... 'invalid-argument';

    const tokenRef = db.collection('bomApprovals').doc(token);
    const tokenDoc = await tokenRef.get();
    if (!tokenDoc.exists) throw ... 'not-found';

    // Verify caller is owner or team member
    const td = tokenDoc.data();
    if (td.uid !== context.auth.uid) {
      // Check team membership
      if (!td.companyId) throw ... 'permission-denied';
      const member = await db.doc(`companies/${td.companyId}/members/${context.auth.uid}`).get();
      if (!member.exists || member.data().role === 'view')
        throw ... 'permission-denied';
    }

    await tokenRef.update({
      revoked: true,
      revokedAt: Date.now(),
      revokedBy: context.auth.uid,
    });

    return { revoked: true };
  });
```

### A10. Deploy Phase A

```
# 1. Verify IAM role (pre-deploy gate)
# 2. Deploy rules
firebase deploy --only firestore:rules
# 3. Deploy functions (all 7 new exports)
firebase deploy --only functions
```

---

## Phase B — Portal Rewrite + Snapshot Write

### B1. Snapshot write: `bomApprovalSnapshots/{token}` — both send paths

**CRITICAL SEQUENCING:** The snapshot write is positioned AFTER the `if(sendBlocked)` check in both paths. The `sendBlocked` gate (line 32390 in QuoteSendModal, line 33016–33021 in `handleBomSend`) catches `manualVerifyRequired` panels via `findIncompleteQuoteItems` → `isVerificationBlock`. This means the snapshot write can NEVER fire on an unverified BOM. This ordering must be preserved — a future reorder that moves the snapshot write above `sendBlocked` would break the gate coverage.

#### Snapshot filter: exclude internal rows

The snapshot `bomLines` array excludes labor, contingency, crate, and job-buyoff rows — customer sees only real part lines they can verify against their drawings.

**Filter predicate** (reuses existing `_isBuyoffOrCrate` at line 15621):
```js
const isPortalExcluded = r =>
  r.isLaborRow || r.isContingency || _isBuyoffOrCrate(r);
```

`_isBuyoffOrCrate(r)` (line 15621) checks PN, description, and crossedFrom for `/buyoff/i` and `/crat(e|ing)/i` — covers "JOB BUYOFF", "CRATE", "CRATING", and all description variants.

#### B1a. Standalone send path — `handleBomSend` (line 33012)

**Location:** After token doc write (line 33042), before email build (line 33044).

Insert snapshot write between line 33043 and 33044:

```js
// #156: frozen BOM snapshot — positioned AFTER sendBlocked check (line 33016)
// and AFTER token doc write. If snapshot fails, abort (no email, no link).
try {
  const snapDoc = {
    token: approvalToken,
    createdAt: Date.now(),
    createdBy: _appCtx.uid,
    companyId: _appCtx.companyId || null,
    projectId: project.id,
    projectName: project.name || '',
    quoteRev: project.quoteRev || 0,
    panels: (project.panels || []).map(p => ({
      panelId: p.id,
      panelName: p.name || p.drawingNo || '',
      drawingNo: p.drawingNo || '',
      drawingRev: p.drawingRev || '',
      pdfStoragePaths: (p.pages || [])
        .filter(pg => !pg.ecoId && pg.originalPdfPath)
        .map(pg => ({ originalPdfPath: pg.originalPdfPath, pageNumber: pg.pageNumber })),
      bomLines: (p.bom || [])
        .filter(r => !isPortalExcluded(r))
        .map((r, i) => ({
          lineIndex: i,
          qty: r.qty || 0,
          partNumber: r.partNumber || '',
          description: r.description || '',
          manufacturer: r.manufacturer || '',
        })),
    })),
  };
  await fbDb.collection('bomApprovalSnapshots').doc(approvalToken).set(snapDoc);
} catch (e) {
  // Snapshot failed — delete orphaned token doc, abort send
  fbDb.collection('bomApprovals').doc(approvalToken).delete().catch(() => {});
  arcAlert("Could not create BOM snapshot: " + e.message);
  setBomSending(false);
  return;
}
```

#### B1b. Bundled send path — `QuoteSendModal.handleSend`

**Location:** Inside the `if(includeTravelerBom)` block, after token doc write (line 32478), before the `}` closing the block (line 32480).

Insert snapshot write between line 32478 and 32479. Same `snapDoc` shape but reads from `populated` (not `project`):

```js
// #156: frozen BOM snapshot — uses `populated` (post-BC-sync)
try {
  const snapDoc = { /* same shape as B1a, but using `populated` */ };
  await fbDb.collection('bomApprovalSnapshots').doc(_tok).set(snapDoc);
  approvalToken = _tok;
} catch (e) {
  fbDb.collection('bomApprovals').doc(_tok).delete().catch(() => {});
  arcAlert("Could not create BOM snapshot: " + e.message);
  setSending(false);
  return;
}
```

**Note:** The existing line `approvalToken = _tok;` (line 32478) must move AFTER the snapshot write succeeds. If the snapshot fails, `approvalToken` stays `null` → no portal link in email, no bar\_ record.

### B2. `allowedDomains` capture on token doc

**Location:** `createBomApprovalTokenDoc` function (line 31919)

Add `allowedDomains` field to the returned `doc` object:

```js
allowedDomains: (function() {
  const emails = (sentTo || '').split(/[,;]\s*/).filter(Boolean);
  const domains = [...new Set(emails.map(e => (e.split('@')[1] || '').toLowerCase()).filter(Boolean))];
  return domains;
})(),
```

Insert after the existing `sentTo` field (line 31930). This captures the recipient email domain(s) at send time for server-side OTP domain verification.

### B3. `BomAccuracyPortalPage` — replaces `BomApprovalPortalPage`

**Location:** Replace `function BomApprovalPortalPage({token})` at line 47349 through end of component (~line 47490).

**Architecture — no direct Firestore access:**

| Phase 1 portal | #156 portal |
|---|---|
| `fbDb.collection('bomApprovals').doc(token).get()` | `httpsCallable('getBomApprovalSnapshot')({token, sessionNonce})` |
| Client reads token doc directly | CF reads token + snapshot, returns projected data |
| Client writes response to token doc | `httpsCallable('submitBomApprovalResponse')({token, sessionNonce, ...})` |
| No access verification | Email OTP via `httpsCallable('sendBomApprovalOtp')` + `httpsCallable('verifyBomApprovalOtp')` |

**Component states:**

1. **Email entry** — input for email address, "Send Code" button
2. **OTP entry** — 6-digit code input, "Verify" button, timer showing expiry
3. **BOM review** — BOM table with per-line flagging + PDF viewer + submit
4. **Submitted** — confirmation of response, read-only

**Session management:** `sessionNonce` stored in `sessionStorage` (cleared on tab close). On mount, check `sessionStorage` for existing nonce → if present, attempt `getBomApprovalSnapshot` → if session expired, clear and show email entry.

**BOM table columns:** Qty | Part # | Description | MFR | Flag checkbox
- Unflagged rows: default state, presumed correct (DQ2)
- Flagging a row: checkbox → checked, comment field expands below the row
- Submit button: "Submit (2 of 47 flagged)" or "Confirm All Lines" if none flagged
- Count display before submit: "2 of 47 lines flagged as incorrect"

**PDF viewer:** "View Drawing" button per panel → calls `getBomApprovalPdf` → opens signed URL in iframe or new tab. URL expires in 5 minutes; re-request on subsequent clicks.

**Per-line response payload sent to `submitBomApprovalResponse`:**
```js
{
  token,
  sessionNonce,
  lineResponses: panels.flatMap(p =>
    p.bomLines.map(line => ({
      panelId: p.panelId,
      lineIndex: line.lineIndex,
      flagged: flagState[p.panelId + ':' + line.lineIndex] || false,
      comment: commentState[p.panelId + ':' + line.lineIndex] || '',
      partNumber: line.partNumber,     // echoed back for ARC-side display
      description: line.description,   // echoed back for ARC-side display
    }))
  ),
  responseComment: overallComment || null,
}
```

**PN + description in lineResponse** (analyst review item 2): each `lineResponse` carries `partNumber` and `description` so `BomApprovalResponseModal` (Phase C) is self-describing without needing a separate snapshot-read CF. The CF sanitizes and truncates (100 chars PN, 200 chars desc).

### B4. Root URL routing update

**Location:** Line 48263

No change needed — the existing route `if(bomApprovalToken) return <BomApprovalPortalPage .../>` stays. The component name changes from `BomApprovalPortalPage` to `BomAccuracyPortalPage` (or keep the old name as an alias to minimize diff). The `?bomApproval=TOKEN` URL parameter is unchanged.

**Recommendation:** Rename in-place to `BomAccuracyPortalPage` for clarity. Update the two references: definition (line 47349) and usage (line 48263).

### B5. Deploy Phase B

```
bash deploy.sh   # hosting (auto-bumps version, commits, tags, pushes)
```

Functions are already deployed from Phase A. Rules are already deployed from Phase A.

---

## Phase C — ARC Surfacing

### C1. QUOTE SUMMARY bar\_ display

**Location:** QUOTE SUMMARY section, lines 34601–34689 area. Insert after the existing panel status pills, before the "Quote sent" confirmation line.

**Data source:** `project.bomApprovalRequests[]` — array of bar\_ records, updated by the `onBomApprovalResponse` trigger (Phase A8).

**Display per bar\_ record:**

```
┌────────────────────────────────────────────────────────┐
│ 📋 BOM Review — sent to customer@acme.com              │
│ Status: [CONFIRMED ✓] or [2/47 FLAGGED ⚠] or [SENT ◦] │
│ Sent: Jun 17, 2026 · Qv.02 · Click to review →        │
└────────────────────────────────────────────────────────┘
```

**Status pill colors:**
- `sent` — amber pill, "Sent" label
- `viewed` — amber pill, "Viewed" label
- `confirmed` — green pill, "Confirmed" label
- `changes_requested` — red pill, "N/M Flagged" label
- Expired-unanswered — grey pill, "Expired" label + clock icon

**Expired detection (client-side):**
```js
const isExpired = bar_.status !== 'confirmed' && bar_.status !== 'changes_requested'
  && Date.now() > (tokenDoc?.expiresAt || bar_.sentAt + 14 * 24 * 3600 * 1000);
```

Since the bar\_ record doesn't carry `expiresAt`, compute from `sentAt + 14 days` (the token's expiry window).

**Click handler:** Opens `BomApprovalResponseModal` (C2) with the bar\_ record.

### C2. `BomApprovalResponseModal`

**Location:** New component, defined near the existing `PortalSubmissionsModal` (line 19576 area).

**Props:** `{ project, barRecord, onClose }`

**Data source:** `barRecord.lineResponses[]` (from the bar\_ record on the project doc, populated by the `onBomApprovalResponse` trigger). Each entry: `{ panelId, lineIndex, flagged, comment, partNumber, description }`.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ BOM Accuracy Review — customer@acme.com                      │
│ Status: CHANGES REQUESTED · 2 of 47 flagged · Jun 17, 2026  │
├─────────────────────────────────────────────────────────────┤
│ # │ Qty │ Part Number    │ Description        │ MFR  │ Flag │
│ 1 │ 2   │ SCE-1413PCW    │ 14x12x6 enclosure  │ S-E  │      │
│ 2 │ 1   │ 1489-M2C020    │ 20A breaker        │ E-H  │      │
│ 3 │ 4   │ 100-C09D10     │ Contactor 9A       │ A-B  │  ⚠   │
│   │     │ "Qty should be 2 not 4"                            │
│ ...                                                          │
├─────────────────────────────────────────────────────────────┤
│ Overall comment: "Please also check drawing rev on panel 2"  │
├─────────────────────────────────────────────────────────────┤
│ [Revoke Link]                        [Re-send BOM Review]    │
└─────────────────────────────────────────────────────────────┘
```

- Flagged rows: amber/red row background, comment shown below in an indented block
- Unflagged rows: default background, no comment
- "Revoke Link" button: calls `revokeBomApproval` CF → confirms → updates bar\_ status to "revoked"
- "Re-send" button: generates new token + snapshot (same as original send), adds new bar\_ record. Old bar\_ retained for history.

**Self-describing without snapshot access:** `lineResponses` carries `partNumber` + `description` (analyst review item 2), so the modal renders the full BOM context from the bar\_ record alone. No need for a separate authenticated snapshot-read CF.

### C3. Notification deep-link

**Location:** `handleNotifClick` function (line 45744)

Add a case for `bom_approval` notifications:

```js
} else if (notif.type === 'bom_approval' && notif.projectId) {
  const proj = projects.find(p => p.id === notif.projectId);
  if (proj) {
    handleOpen(proj);
    setPendingBomApprovalResponseOpen({ projectId: notif.projectId, barId: notif.barId, token: notif.token });
  }
}
```

**New state:** `const [pendingBomApprovalResponseOpen, setPendingBomApprovalResponseOpen] = useState(null);`

In `PanelListView` (or wherever the QUOTE SUMMARY renders), detect the pending state and auto-open `BomApprovalResponseModal`:

```js
useEffect(() => {
  if (pendingBomApprovalResponseOpen?.projectId === project.id) {
    const bar = (project.bomApprovalRequests || []).find(
      b => b.bomApprovalToken === pendingBomApprovalResponseOpen.token
        || b.id === pendingBomApprovalResponseOpen.barId
    );
    if (bar) setShowBomApprovalResponse(bar);
    setPendingBomApprovalResponseOpen(null);
  }
}, [pendingBomApprovalResponseOpen, project]);
```

### C4. Bell notification icon update

**Location:** Notification rendering in bell menu (line 46628 area)

Add icon/label for `bom_approval` type:

```js
{n.type === 'bom_approval' ? '📋' : n.type === 'supplier_quote' ? '📥' : '🔔'}
```

And clickable label:
```js
{n.type === 'bom_approval' && <span style={{...}}>Click to Review Response →</span>}
```

### C5. Deploy Phase C

```
bash deploy.sh   # hosting
```

---

## Risks Surfaced During Planning

### R1. Project path ambiguity in `onBomApprovalResponse`

The trigger (A8) needs to find the project doc to update the bar\_ record. Projects live at `users/{uid}/projects/{id}` (solo) or could be team-scoped. The token doc carries `uid` and `companyId`. The trigger should try `users/{uid}/projects/{id}` first (the standard path); if the project is team-scoped in a future migration, this path will need updating. For now, all projects are user-scoped.

### R2. Array rewrite for bar\_ update

The trigger (A8) reads `bomApprovalRequests[]`, finds the matching entry, mutates it, and writes the full array back. This is a read-modify-write cycle without a transaction. If two tokens for the same project respond simultaneously, the second write could clobber the first's bar\_ update. Mitigation: BOM approval responses are infrequent (hours/days apart). A transaction wrapper (`runTransaction`) would be more correct but adds complexity for an unlikely race.

**Recommendation:** Use `runTransaction` for the bar\_ update in A8. The read-modify-write is a classic lost-update scenario; the transaction cost is negligible.

### R3. Snapshot cleanup

`bomApprovalSnapshots/{token}` docs are never deleted by application code. Over time, they accumulate. Each doc is small (~5-50 KB depending on BOM size). Options:
- TTL: Cloud Firestore TTL policies (set `expiresAt` field, enable TTL) — cleanest
- Manual: Admin cleanup script periodically
- None: let them accumulate (low cost at expected volume)

**Recommendation:** Add `expiresAt: Date.now() + 90 * 24 * 3600 * 1000` (90 days) to the snapshot doc. Configure Firestore TTL policy on the collection. Not blocking for launch.

### R4. SendGrid sender domain

OTP emails are sent `from: 'sales@matrixpci.com'`. Verify this sender is authorized in the SendGrid account. If the OTP email lands in spam, the customer can't verify. Consider a dedicated `noreply@matrixpci.com` sender for OTP codes.

---

## Test Criteria

### Phase A (server infrastructure)

| # | Criterion | Verify |
|---|-----------|--------|
| T1 | `bomApprovalSnapshots/{token}` Firestore rules: authenticated user can create; no client can read | Firestore console: create succeeds, read denied |
| T2 | `sendBomApprovalOtp`: on-domain email receives 6-digit code within 60 seconds | Send to test email, verify code arrives |
| T3 | `sendBomApprovalOtp`: off-domain email returns `{ sent: true }` but NO email sent | Send off-domain, check SendGrid logs — no send |
| T4 | `sendBomApprovalOtp`: rate limit — 6th request within 1 hour returns `resource-exhausted` | Rapid-fire 6 calls |
| T5 | `verifyBomApprovalOtp`: correct code returns `sessionNonce` | Submit correct code |
| T6 | `verifyBomApprovalOtp`: wrong code returns `permission-denied` | Submit wrong code |
| T7 | `verifyBomApprovalOtp`: expired code (>10 min) returns `permission-denied` | Wait or manipulate `expiresAt` |
| T8 | `getBomApprovalSnapshot`: valid session returns 4-column BOM lines (no pricing fields) | Inspect response — no `unitPrice`, `leadTimeDays`, etc. |
| T9 | `getBomApprovalSnapshot`: expired/revoked token returns error | Revoke, then request |
| T10 | `getBomApprovalPdf`: valid session returns a working signed URL | Open URL in browser — PDF renders |
| T11 | `getBomApprovalPdf`: signed URL expires after 5 minutes | Wait 6 minutes, re-request — old URL 403, new URL works |
| T12 | `submitBomApprovalResponse`: 0 flagged → status `confirmed` | Submit all unflagged |
| T13 | `submitBomApprovalResponse`: N>0 flagged → status `changes_requested` | Flag some lines |
| T14 | `submitBomApprovalResponse`: already-responded token returns `failed-precondition` | Double-submit |
| T15 | `onBomApprovalResponse`: trigger updates bar\_ record on project doc | Inspect project doc in Firestore |
| T16 | `onBomApprovalResponse`: trigger creates notification for originating user | Check `users/{uid}/notifications` |
| T17 | `revokeBomApproval`: sets `revoked: true`; subsequent CF calls fail | Revoke, then request snapshot |

### Phase B (portal + snapshot write)

| # | Criterion | Verify |
|---|-----------|--------|
| T18 | Standalone send: `bomApprovalSnapshots/{token}` doc created with 4-column BOM lines | Firestore console after send |
| T19 | Standalone send: snapshot excludes labor, contingency, crate/buyoff rows | Inspect `bomLines` — no internal rows |
| T20 | Bundled send: same snapshot behavior when `includeTravelerBom` ON | Firestore console |
| T21 | Bundled send: no snapshot when `includeTravelerBom` OFF | Verify no snapshot doc created |
| T22 | `allowedDomains` captured on token doc from recipient email | Inspect token doc |
| T23 | Portal OTP flow: enter email → receive code → enter code → BOM loads | Full flow in browser |
| T24 | Portal: BOM table shows Qty, Part#, Description, MFR — no pricing columns | Visual inspection |
| T25 | Portal: "View Drawing" button loads PDF in viewer | Click button, PDF renders |
| T26 | Portal: flag a line → comment field appears; submit → response stored | Flag, comment, submit, inspect token doc |
| T27 | Portal: submit with 0 flags → status `confirmed` | Submit unflagged |
| T28 | Portal: already-responded token shows read-only response | Re-open portal link after response |
| T29 | Snapshot write CANNOT fire on a `manualVerifyRequired` project — `sendBlocked` gate prevents it | Set `manualVerifyRequired` on a panel, attempt send — blocked before snapshot |
| T30 | Phase 1 portal URL (`?bomApproval=TOKEN`) routes to new `BomAccuracyPortalPage` | Open existing Phase 1 token URL |

### Phase C (ARC surfacing)

| # | Criterion | Verify |
|---|-----------|--------|
| T31 | QUOTE SUMMARY shows bar\_ record with correct status pill | Visual — after response |
| T32 | Status pill: `sent` (amber), `confirmed` (green), `changes_requested` (red), expired (grey) | Visual — each state |
| T33 | Expired-unanswered: bar\_ older than 14 days with no response shows "Expired" pill | Wait or manipulate `sentAt` |
| T34 | Click bar\_ row → `BomApprovalResponseModal` opens with flagged lines displayed | Click |
| T35 | Modal shows PN + description for each line (self-describing from `lineResponses`) | Visual — no blank rows |
| T36 | "Revoke Link" in modal calls `revokeBomApproval` → pill updates to "Revoked" | Click revoke |
| T37 | Bell notification appears on response | Submit response, check bell in ARC |
| T38 | Notification click → project opens + response modal auto-opens | Click notification |
| T39 | #86 identity: trigger writes to correct project (not currently-open project) | Submit response while viewing different project in ARC |

---

## Summary

| Phase | Changes | New lines (est.) | Deploy |
|-------|---------|------------------|--------|
| **A** | 7 new CFs + Firestore rules + IAM config | ~400 in functions/index.js, ~5 in firestore.rules | functions + rules |
| **B** | Snapshot write (both send paths) + `allowedDomains` + `BomAccuracyPortalPage` rewrite | ~250 in app.jsx (portal), ~60 (snapshot writes), ~5 (allowedDomains) | hosting |
| **C** | QUOTE SUMMARY display + `BomApprovalResponseModal` + notification deep-link | ~200 in app.jsx | hosting |

Total: ~920 new lines across two files. 39 test criteria. Three independently deployable phases.

---

## ENTRY-POINT CORRECTION (Jon, 2026-06-17)

C99 assumed the BOM-approval snapshot rides with the quote-send paths only. That is
the SECONDARY/optional path. The PRIMARY entry point was missed.

### PRIMARY entry: standalone "Send Quoted BOM for Approval" button

This is a **PRE-QUOTE action**. The user sends the crossed BOM for the customer to
approve Matrix's changes/crosses to the customer's requested BOM, BEFORE any
quoting or pricing exists. Purpose: confirm the BOM is right before investing in
pricing — avoid customer surprises after the quote is built.

"Quoted BOM" in the button name = "the BOM the customer wants quoted, that we are
changing" — NOT "a BOM with prices attached." No pricing exists at this stage, which
is why the no-pricing portal projection (4-column: Qty, PN, Description, MFR) is
structurally correct, not just a privacy choice.

### SECONDARY entry (optional): attach to Send Quote

The user MAY also attach the same BOM-approval to a Send Quote flow as a supporting
document, if they choose. C99's existing dual-path quote-send wiring (B1a standalone
`handleBomSend` + B1b bundled `QuoteSendModal`) covers THIS path. Keep it as-is.

### Plan impact when #156 activates

1. **Wire snapshot/token creation to the standalone button handler** — the primary
   path C99 missed. Find the button's handler at build time; it will be separate
   from `handleBomSend` (which is the quote-attached path). Same snapshot shape,
   same token doc, same `bomApprovalSnapshots/{token}` write.

2. **Keep the quote-send-path snapshot wiring** as the opt-in secondary attachment.
   Both paths produce identical token docs and snapshots — only the entry point
   and the send-gate differ.

3. **Send-gate differences:**
   - SECONDARY (quote-attached): `sendBlocked` / `manualVerify` gate applies
     (#155 analysis covers this path).
   - PRIMARY (standalone): needs its own lighter gate — likely just "panel has a
     non-empty crossed BOM to send" (no pricing, no quote completeness required).

4. **Everything else in C99 is entry-point-agnostic — UNCHANGED:** token core
   (A1-A2), OTP (A3-A4), domain-allow (B2), snapshot collection (A1),
   signed-URL PDF (A6), per-line flagging (B3), no-pricing projection,
   all CFs (A3-A9), ARC surfacing (C1-C4).

# #156 Supplement — In-Portal BOM Accuracy Confirmation + Verified Access

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-17  
**Status:** Supplement — codebase verification of Brief assumptions  
**Absorbs:** #137 Phase 2 (CF write-back, notification, QUOTE SUMMARY, Revoke)  
**Builds on:** #137 Phase 1 (token core, rules, portal routing, send-path wiring — all LIVE)

---

## §1 — MFR Field Reliability

**Question:** Does `manufacturer` exist reliably on every BOM row?

**Answer: YES — schema-guaranteed.** The extraction JSON schema (line 11748) defines `manufacturer` as a required field with default empty string. It is never `undefined` on an extracted row.

| Row type | `manufacturer` value | Flag field |
|----------|---------------------|------------|
| Extracted rows | AI-populated or `""` | — |
| Labor rows | `""` (hard-coded, lines 1217/27886/27901/27944) | `isLaborRow: true` |
| Contingency rows | `"Matrix Systems"` (line 10786) | `isContingency: true` |
| Customer-supplied | Whatever AI extracted (may be `""`) | `customerSupplied: true` |
| Template/manual-add | `tpl.manufacturer \|\| ""` (line 10778) | — |

All four portal columns confirmed present on every row:

| Column | Field | Default | Notes |
|--------|-------|---------|-------|
| Qty | `qty` | `1` | Number type |
| Part # | `partNumber` | `""` | String |
| Description | `description` | `""` | String |
| MFR | `manufacturer` | `""` | String; can be blank but never missing |

**Rendering:** MFR is column 6 in the BOM table (header at line 27864, data at line 28087). All downstream paths (CSV export line 8053, RFQ PDF line 8158, email HTML line 6437, customer quote PDF line 7502) include MFR with `|| "—"` fallback.

**Portal column projection:** The serving CF must project ONLY `{qty, partNumber, description, manufacturer}` — stripping `unitPrice`, `leadTimeDays`, `supplier`, `bcVendorNo`, `priceSource`, and all other fields. Labor/contingency rows should be included (customer sees their full BOM) but can be tagged with their type for styling.

**Supplement verdict: CONFIRMED.** No MFR reliability gap.

---

## §2 — Admin SDK Signed-URL Capability + CF Patterns

**Question:** Can Cloud Functions mint short-lived signed URLs for Storage objects? What existing patterns support the view-time CF architecture?

### Admin SDK Storage — current usage

Admin SDK is initialized at `functions/index.js` line 2:
```
const admin = require('firebase-admin');
admin.initializeApp();
```

Storage bucket access exists at lines 2425–2432:
```
const bucket = admin.storage().bucket();
const file = bucket.file(pdfPath);
const [exists] = await file.exists();
const [buf] = await file.download();
```

**Signed-URL generation does NOT exist in the current codebase.** The Admin SDK supports `file.getSignedUrl({ action: 'read', expires: Date.now() + 5 * 60 * 1000 })` but it has never been used. This is NEW capability for #156.

### Requirement: service account key for `getSignedUrl`

`getSignedUrl()` requires either:
- A service account JSON key file (not present on default Cloud Functions), OR
- The `iam.serviceAccounts.signBlob` IAM permission on the default service account

Firebase Cloud Functions running on the default service account need the **Service Account Token Creator** IAM role granted to `PROJECT_ID@appspot.gserviceaccount.com`. Without it, `getSignedUrl` throws `SigningError`. This is a one-time IAM configuration — no code dependency, but must be verified before deploy.

**Alternative:** `getSignedUrl` with `{ version: 'v4' }` works with the default credentials if the IAM role is set. No key file needed.

### Existing CF patterns reusable for #156

**Token-only authentication (no Firebase Auth):**
`extractSupplierQuotePricing` (line 988) is the precedent. It accepts `onCall` without requiring `context.auth` — authenticates via `data.token` against `rfqUploads/{token}` Firestore doc. Three-check validation: exists → expiry → status (lines 1025–1040). **Exact same pattern** for `getBomApprovalSnapshot` and `getBomApprovalPdf`.

**Cost-attack hardening (6-layer):**
`extractSupplierQuotePricing` (lines 996–1084): page cap, image size cap, status check, call counter, spend ledger, maxInstances. For #156's view-time CFs, the cost risk is lower (no Anthropic API call), but rate-limiting is still needed to prevent signed-URL farming. Recommended: per-token `viewCount` (soft cap, e.g. 500) + `maxInstances: 5` on each new CF.

**SendGrid email pattern:**
All CF emails use SendGrid (imported at line 3, configured at line 43). Examples: token warning (line 165), supplier notification (line 729), invite (line 601), engineer question (line 909). Pattern: `sgMail.send({ to, from: 'sales@matrixpci.com', subject, html })`. Reusable directly for OTP code delivery.

**Firestore trigger pattern:**
`onSupplierQuoteSubmitted` (line 623) fires on `rfqUploads/{token}` update when `status → "submitted"`. Creates notification + sends email. **Exact pattern** for `onBomApprovalResponse` trigger: fire when `bomApprovals/{token}.status` transitions from `pending`/`viewed` to a terminal state.

**Notification creation pattern:**
Notifications land at `users/{uid}/notifications/{id}`. App listener at line 45214 picks up unread docs → bell badge. Deep-link navigation on click. The `onSupplierQuoteSubmitted` CF creates notifications for the originating user — same pattern for BOM approval responses.

### New CFs required for #156

| CF name | Type | Auth model | Purpose |
|---------|------|------------|---------|
| `sendBomApprovalOtp` | onCall | Token-only | Validates email domain, generates OTP, stores hash, sends via SendGrid |
| `getBomApprovalSnapshot` | onCall | Token + OTP session | Returns projected BOM lines (4 columns only) |
| `getBomApprovalPdf` | onCall | Token + OTP session | Mints 5-min signed URL for drawing PDF |
| `submitBomApprovalResponse` | onCall | Token + OTP session | Writes per-line flags + comments to token doc |
| `onBomApprovalResponse` | Firestore trigger | — | Fires on token status change → notification + bar_ update |
| `revokeBomApproval` | onCall | Auth required (ARC user) | Sets `revoked: true` on token doc |

**Supplement verdict: FEASIBLE.** Signed-URL is new but Admin SDK supports it. IAM role must be configured. All other patterns have direct precedent.

---

## §3 — Email One-Time-Code Path

**Question:** How does the OTP verification flow work? What infrastructure exists?

### Email delivery: SendGrid (existing)

CFs already send email via SendGrid (`sgMail`, line 3). The OTP email is a simple HTML template with a 6-digit code — identical pattern to the existing admin-warning emails (line 165) but sent to the customer's email.

### OTP data model (NEW — no existing OTP system)

No OTP/verification-code system exists in the codebase. This is entirely new. Proposed shape on the `bomApprovals/{token}` doc:

```
otpAttempts: [                    // append-only log (rate-limit source)
  { email, requestedAt, codeHash, expiresAt, verified: bool }
],
otpRateLimit: {                   // server-side rate gate
  lastRequestAt: timestamp,
  requestCount: number,           // rolling window (e.g. 5 per hour)
},
allowedDomains: ["customer.com"], // captured at send time from recipient email
verifiedSessions: {               // keyed by session nonce
  "sess_abc123": { email, verifiedAt, expiresAt }
}
```

### Domain-allowed enforcement (server-side only)

At send time, the client writes `allowedDomains` onto the token doc (extracted from recipient email: `email.split('@')[1].toLowerCase()`). The `sendBomApprovalOtp` CF:
1. Reads `allowedDomains` from token doc
2. Checks submitted email domain against the list — rejects with generic "unable to verify" if off-domain (no domain leak)
3. Checks rate limit (e.g. 5 requests per hour per token, 3 consecutive failures = 15-min cooldown)
4. Generates 6-digit code, stores `SHA-256(code)` + `expiresAt` (10 min) on the token doc
5. Sends code via SendGrid
6. Returns `{ sent: true }` (never reveals whether email exists or domain matched — constant response)

### Session verification model

Client receives OTP, sends it to `getBomApprovalSnapshot` (or a dedicated `verifyBomApprovalOtp` CF). CF:
1. Hashes submitted code, compares against stored hash
2. If match + not expired: generates a `sessionNonce` (crypto random), stores `{ email, verifiedAt, expiresAt: +4h }` in `verifiedSessions` on the token doc
3. Returns `{ sessionNonce, bomLines, companyName, projectName }` — first payload includes BOM data
4. Subsequent requests include `sessionNonce` in payload — CF validates session exists and not expired

Client stores `sessionNonce` in `sessionStorage` (cleared on tab close per Brief). No cookies, no localStorage persistence.

### Rate-limiting considerations

| Attack vector | Mitigation |
|---------------|------------|
| Code brute-force (10^6 space) | 3 wrong attempts → 15-min lockout on that token; 10 total failures → permanent lock |
| OTP farming (email spam) | 5 code requests per hour per token; 20 lifetime per token |
| Session replay | Nonce is crypto-random; `expiresAt` enforced server-side; logged on every access |
| Domain guessing | Server never confirms/denies domain match — same response regardless |

**Supplement verdict: FEASIBLE.** No existing OTP system to reuse — fully new. SendGrid delivery is trivial. Rate-limiting logic is straightforward CF code. Domain enforcement is server-only.

---

## §4 — Send-Time Server-Side Snapshot Write Hooks

**Question:** Where in both send paths does the frozen BOM snapshot write go?

### Snapshot target: `bomApprovalSnapshots/{token}` (NEW collection)

Not to be confused with `_snapshots` (FIFO-10, wrong lifecycle) or `_dvHistory` (#153). This is a one-time frozen write at send time, keyed by the same token as the approval doc. Firestore rules: **create-only by authenticated ARC users, no reads by anyone** (CF uses Admin SDK to bypass rules).

### Standalone send path — `handleBomSend` (line 32637)

Current write sequence (Phase 1 live):
```
1. Generate token + barId           (line 32663, in memory)
2. Create bomApprovals/{token}      (line 32665, Firestore write)
3. Build email HTML with portal link (line 32669)
4. Generate traveler BOM PDF        (line 32675)
5. Send email via Graph API         (line 32679)
6. Save bar_ record on project      (line 32688)
```

**Snapshot hook point: between steps 1 and 2** (after token generated, before token doc write). Write sequence becomes:

```
1.  Generate token + barId
1a. Write bomApprovalSnapshots/{token} — frozen BOM + PDF storage paths
2.  Create bomApprovals/{token} (includes allowedDomains from recipient email)
3-6. Unchanged
```

Snapshot-before-token-doc mirrors the existing token-doc-before-email ordering: if the snapshot write fails, no token doc exists, no email goes out, no orphaned token. If the token doc write fails after snapshot, the orphaned snapshot is harmless (no token points to it, TTL cleanup can sweep).

**Data available at this point:**
- `project.panels[].bom[]` — full BOM with all fields (project is the live in-memory object)
- `project.panels[].pages[].originalPdfPath` — Storage path for signed-URL minting (NOT the URL itself)
- `_appCtx.uid`, `_appCtx.companyId` — identity
- `m.to` — recipient email (source for `allowedDomains`)

**Snapshot doc shape:**
```js
{
  token,                          // back-reference
  createdAt: Date.now(),
  createdBy: _appCtx.uid,
  companyId: _appCtx.companyId,
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
    bomLines: (p.bom || []).filter(r => !r.isLaborRow && !r.isContingency)
      .map((r, i) => ({
        lineIndex: i,
        qty: r.qty || 0,
        partNumber: r.partNumber || '',
        description: r.description || '',
        manufacturer: r.manufacturer || '',
      })),
  })),
}
```

Note: `bomLines` is pre-projected to 4 columns at write time. Even though the full BOM is in memory, the snapshot stores ONLY the display columns. The CF `getBomApprovalSnapshot` reads this doc directly — no further projection needed.

**CRITICAL — `pdfStoragePaths` stores the Firebase Storage object path (e.g. `originalPdfs/uid/projectId/fileId.pdf`), NOT a download URL.** The CF uses this path to call `admin.storage().bucket().file(path).getSignedUrl(...)` at view time. The path is never exposed to the client.

### Bundled send path — `QuoteSendModal` (line 32011)

Current write sequence (Phase 1 live, gated on `includeTravelerBom`):
```
1. Generate token + barId           (line 32099)
2. Create bomApprovals/{token}      (line 32102)
3. Build email HTML with portal link (line 32106)
4-6. PDF renders, email send, bar_ save
```

**Same hook point: between steps 1 and 2.** Identical snapshot write logic, but reads from `populated` (post-BC-sync project, line 32070) instead of `project`. This is correct — `populated` has authoritative data.

**Note on bundled path data source:** Agent investigation flagged that `buildBomReportPdfDoc` at line 32125 uses stale `project` instead of `populated`. The snapshot write must use `populated` — this is correct for #156 and also surfaces a pre-existing minor bug in the PDF builder (tracked separately if needed, not #156's concern).

### Firestore rules for `bomApprovalSnapshots/{token}`

```
match /bomApprovalSnapshots/{token} {
  allow create: if request.auth != null
    && request.resource.data.createdBy == request.auth.uid;
  allow read, update, delete: if false;  // CF uses Admin SDK
}
```

Create-only by authenticated users. No client reads ever — the CF bypasses rules via Admin SDK. Delete via Admin SDK only (cleanup/TTL).

**Supplement verdict: CONFIRMED.** Both send paths have clean hook points. Full BOM + PDF storage paths are in memory. Pre-projection at write time means the CF serves the snapshot as-is.

---

## §5 — Retiring the Summary Portal vs. Phase 1 Components

**Question:** How does retiring the response-only portal interact with existing Phase 1 code?

### Phase 1 components currently live

| Component | Location | Status |
|-----------|----------|--------|
| `createBomApprovalTokenDoc()` | Line 31919–31944 | **KEEP** — token creation helper, reused by #156 |
| `bomApprovals/{token}` Firestore rules | `firestore.rules` | **KEEP + EXTEND** — add OTP fields, session fields |
| `handleBomSend` token wiring | Line 32664–32668 | **KEEP + EXTEND** — add snapshot write + `allowedDomains` |
| `QuoteSendModal` token wiring | Line 32098–32104 | **KEEP + EXTEND** — same |
| `BomApprovalPortalPage` | Lines 46818–46939 | **RETIRE (replace)** — full rewrite as `BomAccuracyPortalPage` |
| Root URL `?bomApproval=TOKEN` routing | Lines 47678–47732 | **KEEP** — same URL param, new component |
| bar\_ record structure | Lines 32184–32191 / 32688–32691 | **KEEP + EXTEND** — add response fields on write-back |

### What gets retired

Only `BomApprovalPortalPage` (lines 46818–46939). This component:
- Reads `bomApprovals/{token}` directly from Firestore (client-side read)
- Displays: company logo, project name, panel names, quote revision
- Captures: approve/reject/changes\_requested + comments (whole-token response)
- Writes response directly to the token doc (client-side update)

**Why safe to retire:** No real customer was ever sent a Phase 1 link (Brief confirms). The token doc structure evolves (adds OTP fields, `allowedDomains`, `verifiedSessions`), but the existing fields (`status`, `sentTo`, `expiresAt`, `revoked`, `accessLog`, `readCount`) are all reused.

### What replaces it: `BomAccuracyPortalPage`

New component at the same URL route (`?bomApproval=TOKEN`). Completely different architecture:

| Phase 1 portal | #156 portal |
|----------------|-------------|
| Client reads Firestore directly | CF-mediated data fetch |
| No access verification | Email OTP + domain-allowed |
| Whole-token response (approve/reject) | Per-line flagging |
| Shows project metadata only | Shows BOM lines (4 cols) + drawing PDF |
| Client writes response to Firestore | CF writes response |
| No document display | Signed-URL PDF viewer |

### Token doc evolution

Fields added to `bomApprovals/{token}`:
```
allowedDomains: string[],           // from recipient email at send time
otpAttempts: array,                 // OTP request/verify log
otpRateLimit: object,               // rate-limiting state
verifiedSessions: map,              // active verified sessions
lineResponses: [{                   // per-line flags (from submitBomApprovalResponse CF)
  panelId, lineIndex, flagged: bool, comment: string
}],
responseComment: string | null,     // optional overall comment
respondedAt: number | null,
respondedBy: string | null,         // verified email address
```

Existing fields are untouched — backward-compatible with any Phase 1 token docs that exist (dev/test only).

**Supplement verdict: CLEAN RETIREMENT.** One component replaced, everything else additive. No migration needed.

---

## §6 — Per-Line Response Data Shape + ARC-Side Surfacing

**Question:** What does the response data look like, and how does it surface in ARC?

### Per-line response (portal → CF → token doc)

The `submitBomApprovalResponse` CF writes to `bomApprovals/{token}`:

```js
{
  status: 'confirmed' | 'changes_requested',  // derived: all unflagged = confirmed
  respondedAt: Date.now(),
  respondedBy: verifiedEmail,                  // from OTP session
  responseComment: overallComment || null,
  lineResponses: [
    { panelId: 'panel-1', lineIndex: 0, flagged: false },
    { panelId: 'panel-1', lineIndex: 3, flagged: true, comment: 'Qty should be 4, not 2' },
    { panelId: 'panel-1', lineIndex: 7, flagged: true, comment: 'Wrong manufacturer — should be Allen-Bradley' },
    // ... one entry per BOM line shown in portal
  ],
  flaggedCount: 2,
  totalLineCount: 47,
}
```

**Status derivation (DQ1):** `flaggedCount === 0 ? 'confirmed' : 'changes_requested'`. No standalone "reject" verb. The flags ARE the change request.

**Default-accept (DQ2):** Customer flags only what's wrong. The portal shows all lines with checkboxes (unchecked by default). Flagging a line enables a comment field for that line. Submit button shows count: "Submit (2 of 47 flagged)" or "Confirm All Lines" if none flagged.

**No auto-edit (DQ3):** The CF writes `lineResponses` to the token doc only. It does NOT touch `project.panels[].bom[]`. The estimator reads the flags in ARC and decides what (if anything) to change.

### ARC-side surfacing (absorbed #137 Phase 2)

**1. `onBomApprovalResponse` CF trigger:**
Fires when `bomApprovals/{token}.status` transitions to `confirmed` or `changes_requested`.
- Updates `bar_` record on the project doc: sets `status` from `"sent"` to the response status, adds `respondedAt`, `respondedBy`, `flaggedCount`, `totalLineCount`
- Creates notification at `users/{originatingUid}/notifications/{id}`:
  ```js
  {
    type: 'bom_approval',
    read: false,
    createdAt: Date.now(),
    projectId,
    projectName,
    message: flaggedCount === 0
      ? `BOM confirmed by ${respondedBy}`
      : `${flaggedCount} line(s) flagged by ${respondedBy}`,
    barId,         // for deep-link to specific bar_ record
    token,         // for deep-link to response detail
  }
  ```

**2. Bell notification + deep-link:**
Notification appears in bell (line 45214 listener picks it up). Click navigates to project (existing pattern from supplier portal). Deep-link opens a **BomApprovalResponseModal** showing the response detail.

**3. QUOTE SUMMARY section:**
Each bar\_ record in `project.bomApprovalRequests[]` renders a row in QUOTE SUMMARY (lines 34601–34689 area) with:
- Status pill: `sent` (amber) → `confirmed` (green) → `changes_requested` (red) → `expired` (grey)
- Sent-to email, sent date
- Response date + verified email (if responded)
- Flagged count badge (e.g. "2/47 flagged")
- Click → opens `BomApprovalResponseModal`

**4. `BomApprovalResponseModal` (new):**
Shows the frozen BOM snapshot side-by-side with line flags:
- Each line: Qty | Part# | Description | MFR | Flag status | Customer comment
- Flagged lines highlighted (red/amber row background)
- Overall comment at bottom
- "Revoke Link" button (calls `revokeBomApproval` CF)
- "Re-send" button (generates new token, keeps old bar_ for history)

**5. Expired-unanswered state:**
Per #137 refinement: if `expiresAt` passes with `status === 'pending'` or `'viewed'`, QUOTE SUMMARY shows "Expired — unanswered" (grey pill with clock icon). Prompts re-send. Detection: client-side check (`Date.now() > bar_.expiresAt && !['confirmed','changes_requested'].includes(bar_.status)`).

**6. Revoke action:**
"Revoke Link" calls `revokeBomApproval` CF (requires ARC auth). Sets `revoked: true` on token doc. All subsequent portal CF calls reject immediately. QUOTE SUMMARY shows "Revoked" pill.

### #86 identity discipline

Every CF write-back carries `projectId` captured at invocation time. The `onBomApprovalResponse` trigger reads `projectId` from the token doc (written at send time, immutable). Never writes to "the currently open project." Fully #86-compliant.

**Supplement verdict: CONFIRMED.** Response model is clean. ARC surfacing reuses existing notification + QUOTE SUMMARY patterns.

---

## §7 — Gap Analysis: New Components Required

| # | Component | Type | Complexity | Notes |
|---|-----------|------|------------|-------|
| 1 | `bomApprovalSnapshots/{token}` collection + rules | Firestore | Low | Create-only by auth users, no reads |
| 2 | Snapshot write in both send paths | Client (app.jsx) | Low | 4-column projection, PDF storage paths |
| 3 | `allowedDomains` capture on token doc | Client (app.jsx) | Low | `email.split('@')[1]` at send time |
| 4 | `sendBomApprovalOtp` CF | Cloud Function | Medium | Domain check, rate limit, SHA-256 hash, SendGrid |
| 5 | `getBomApprovalSnapshot` CF | Cloud Function | Medium | Token + session validation, return projected BOM |
| 6 | `getBomApprovalPdf` CF | Cloud Function | Medium | Token + session validation, Admin SDK signed URL |
| 7 | `submitBomApprovalResponse` CF | Cloud Function | Medium | Per-line flags, status derivation, write to token doc |
| 8 | `onBomApprovalResponse` trigger | Cloud Function | Medium | bar_ update, notification creation |
| 9 | `revokeBomApproval` CF | Cloud Function | Low | Auth-required, set `revoked: true` |
| 10 | `BomAccuracyPortalPage` component | Client (app.jsx) | High | OTP flow, BOM table, PDF viewer, per-line flagging |
| 11 | `BomApprovalResponseModal` | Client (app.jsx) | Medium | Snapshot + flags display, revoke, re-send |
| 12 | QUOTE SUMMARY bar\_ display | Client (app.jsx) | Medium | Status pills, click-to-modal, expired detection |
| 13 | IAM role configuration | Infrastructure | Low | Service Account Token Creator for signed URLs |

**Total: 6 new CFs, 1 new Firestore collection, 1 portal rewrite, 2 new ARC modals, 1 QUOTE SUMMARY extension, 1 IAM config.**

### Pre-existing issue surfaced: #155

The bundled send path (`QuoteSendModal`) bypasses the `manualVerifyRequired` send-gate. Tracked as #155. #156's snapshot write goes in the SAME code path as the token write — it inherits whatever gate exists. #155 should be resolved before or alongside #156 to prevent a verified-BOM-accuracy portal showing an unverified BOM.

### Phasing recommendation (for Detailed Plan)

Given the scope (6 CFs + portal rewrite + ARC surfacing), recommend 3 internal phases:

**Phase A — Server infrastructure:** Snapshot collection + rules, all 6 new CFs (OTP, snapshot fetch, PDF serve, submit response, trigger, revoke), IAM role. Deploy functions + rules. Test via `firebase functions:shell` or Postman.

**Phase B — Portal rewrite:** `BomAccuracyPortalPage` replacing `BomApprovalPortalPage`. OTP verification flow, BOM table with per-line flagging, PDF viewer with signed-URL fetch, submit flow. Deploy hosting.

**Phase C — ARC surfacing:** QUOTE SUMMARY bar\_ display, `BomApprovalResponseModal`, bell notification deep-link, expired-unanswered detection, revoke action. Deploy hosting.

Each phase is independently deployable. Phase A alone enables manual Firestore inspection of responses. Phase B enables customer-facing portal. Phase C closes the loop in ARC.

---

## §8 — Summary of Findings

| Brief assumption | Verified? | Notes |
|------------------|-----------|-------|
| MFR reliably on every BOM row | **YES** | Schema-guaranteed; can be empty string |
| Admin SDK signed-URL | **YES (new)** | Requires IAM role config; no existing usage |
| SendGrid for OTP email | **YES** | Existing pattern; 6+ email CFs as precedent |
| Send-time snapshot hook | **YES** | Both paths have clean insertion point before token doc write |
| Phase 1 portal retirement | **YES** | Safe — no customer links sent; one component replaced |
| Per-line response model | **YES** | Clean data shape; ARC surfacing reuses notification + QUOTE SUMMARY patterns |
| Token-only CF auth | **YES** | `extractSupplierQuotePricing` is exact precedent |
| #86 identity discipline | **YES** | Token doc carries `projectId`; CF reads it immutably |

**No blocking gaps found. All Brief assumptions verified against the codebase.**

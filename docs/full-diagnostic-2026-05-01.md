# MatrixARC Full Diagnostic — Executive Briefing

**Date**: 2026-05-01
**Version analyzed**: v1.19.954
**Scope**: Three parallel deep-dive analyses (security, concurrency / multi-user, cost & billing resilience)
**Three companion reports** in this folder:
- `security-audit-2026-05-01.md` (1 critical, 5 high, 6 medium, 4 low, 3 info)
- `concurrency-analysis-2026-05-01.md` (2 will-break, 6 high, 7 medium)
- `cost-resilience-analysis-2026-05-01.md` (cost inventory + recommendations)

**Caveats**:
- The cost analyst could not access live web pricing pages this session, so dollar figures are based on pricing as of late-2025 / early-2026. Re-verify at Anthropic, Firebase, SendGrid pricing pages before acting on specific numbers.
- The cost analyst's report references some file paths that don't exist in this single-file React app (`src/bom/extractor.ts` etc.) — those references appear to be from another project's structure that the model conflated. The Cloud-Function-side findings (`functions/index.js`) and the architectural recommendations are still valid because they were verified against the real codebase. When the cost report says "BOM extraction is at `src/bom/extractor.ts:256`", read it as "BOM extraction inside `src/app.jsx`" — the model just labeled the surface wrong.

---

## TL;DR — what to do first thing back in office

### THIS WEEK — non-code (60 minutes total)

1. **Anthropic billing hardening**
   - Switch to Prepaid Credits with auto-recharge (e.g. recharge $300 when balance hits $50). Auto-recharge is what prevents service interruption on payment failure.
   - Set Workspace monthly spend limit at $300 — hard ceiling.
   - Open a second Anthropic account on a different billing card; keep $50 in prepaid credits as failover insurance.
   - Set Anthropic 80% usage email alert.

2. **Google Cloud (Firebase) billing budget**
   - `console.cloud.google.com/billing/budgets` for project `matrix-arc` → create Budget at $50/mo with alerts at 50/90/100/120%.
   - Optional but powerful: subscribe a Cloud Function to the Pub/Sub alert topic that auto-disables billing if actual spend exceeds 150% of budget. This is the nuclear-option circuit breaker.

3. **Confirm SPF/DKIM/DMARC** on `matrixpci.com` so a single bounce-rate spike doesn't get the SendGrid sender silently throttled.

### THIS WEEK — code (1-2 days, in priority order)

4. **Cap the supplier portal — single biggest risk reduction.** `extractSupplierQuotePricing` (functions/index.js:665) currently has no page-count cap, no per-token rate limit, no spend ceiling, and uses Sonnet 4 (the cost analyst flagged Haiku as the documented model — there's a docs↔code discrepancy here too). One leaked supplier token + a 500-page synthetic PDF = ~$13 burned in one click. Repeated hourly = ~$1,500. This is identified as the single most important fix in BOTH the security report (C-1) AND the cost report (D1). Do this first.

5. **Tighten Firestore rules on `rfqUploads/{token}` and `reviewUploads/{token}`** — both have `allow update: if true;`. A token holder can overwrite arbitrary fields including BOM line item prices, drawing URLs (phishing), and `status:"submitted"` (notification spam). Replace with `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])` allow-lists. Both Security H-1/H-2 AND Cost D4.

6. **Add `maxInstances` cap on every callable Cloud Function.** No code change needed — just `functions.runWith({ maxInstances: 5 })`. Recommended caps in cost report B2.

### NEXT 30 DAYS — bigger fixes

7. **Move `saveProject` into the same per-project mutex as `saveProjectPanel`** (Concurrency WBP-1). This is the textbook last-write-wins fix that protects cross-user edits.
8. **Lock down the Anthropic API key.** Currently any "view"/"edit" team member can read `companies/{cid}/config/api` and exfiltrate the `sk-ant-…` key (Security H-3). Tighten that rule to admin-only. Long-term: move all Anthropic calls server-side into Cloud Functions and stop using `anthropic-dangerous-direct-browser-access:true`.
9. **HTML-escape all email-builder interpolations** (`buildRfqEmailHtml`, `buildReviewEmailHtml`). Supplier-name and BOM-description fields flow through unescaped today — a malicious supplier PDF can inject `<script>` into outbound email AND into the in-app email preview rendered with `dangerouslySetInnerHTML` (Security H-4).
10. **Add prompt caching** to BOM extraction prompt + supplier-portal prompt. Both prompts are large (~3-4KB) and run hundreds of times per month uncached. `cache_control: { type: "ephemeral" }` cuts cached input tokens 90% — estimated 30-50% saving on heavy-month Anthropic spend.

---

## 1. Critical findings — what would actually take production down

### 1.1. Supplier portal cost-attack (Cost Critical / Security C-1)
**One leaked supplier token + a script + a synthetic PDF = unbounded billing damage.**

- **Where**: `functions/index.js:665` — `extractSupplierQuotePricing`. Public Firebase callable, no `context.auth` check, no rate limit, no `pageImages` size validation, no per-token spend ledger.
- **Per-attack cost** (cost analyst's estimate, verify pricing): 500-page synthetic PDF = 25 batches × 20 pages × ~5,800 input tokens/page (vision) on Sonnet 4 = ~2.9M input tokens × $3/Mtok + 0.3M output tokens × $15/Mtok = **~$13/upload**.
- **Hourly damage if scripted**: 120 uploads × $13 = **~$1,560 in one hour**.
- **Why a token can leak**: emails are forwarded ("can you review this RFQ?"), tokens get archived in spam folders, suppliers hire freelancers and forward links. Tokens are valid for 30 days.
- **Fix priority**: Day 0. Both reports agree this is THE single biggest risk.
- **Specific fixes** (both reports converge):
  1. Hard-cap `pageImages.length > 25` per call. Reject otherwise.
  2. Per-token call counter in `rfqUploads/{token}.aiCallCount`, hard-cap at e.g. 5.
  3. Per-token spend ledger using `usage` returned from Anthropic responses; reject when accumulated cost > $5.
  4. `functions.runWith({ maxInstances: 5 })` so a script can't fan-out to 1000 concurrent invocations.
  5. Refuse calls when `tokenData.status` is already `submitted` or `dismissed`.

### 1.2. `saveProject` ↔ `saveProjectPanel` mutex desync (Concurrency WBP-1)
**Cross-user edits silently overwrite each other.**

- **Where**: `src/app.jsx:6812-6967` (`saveProject`) vs `src/app.jsx:7021-7160` (`saveProjectPanel`). The latter takes a per-project lock (`_panelSaveLocks`), the former does not.
- **Scenario**: User-A's background extraction is running (`saveProjectPanel`). User-B clicks "Send Quote" (which calls `safeSave` → `saveProject`). The whole-project write can land between the panel-update's read and write, clobbering it.
- **Defense in place**: `_saveHighWater` only catches "panel disappears entirely", NOT field-level regressions.
- **Fix**: Either route both through the same per-project mutex, OR convert the whole-project save path to a Firestore transaction that compares `updatedAt`/`updatedBy` and retries on mismatch.

### 1.3. `_saveHighWater` is per-tab in-memory (Concurrency WBP-2)
**Two users on the same project = no protection at all.**

- **Where**: `src/app.jsx:6811` — `const _saveHighWater = {};` in module scope, never persisted.
- **Scenario**: User-B opens a project right after User-A landed a panel-add. User-B's tab has empty `_saveHighWater`. User-B's `setProject` fires before the `onSnapshot` soft-apply lands. User-B saves, the high-water guard at line 6822 sees nothing to protect, so a stale state can pass through.
- **Fix**: Read the high-water from Firestore at save time (server-authoritative). Or convert to Firestore transactions throughout.

### 1.4. Anthropic API key exposed to all team members (Security H-3)
**Any "view" role employee can exfiltrate the production API key.**

- **Where**: `firestore.rules:154-157` — `match /companies/{cid}/config/{configId}: allow read: if isMember();`. No role discrimination.
- **Plus**: The key is also sent directly to the browser via `anthropic-dangerous-direct-browser-access:true` (~10 sites in app.jsx). Recoverable from network logs even without Firestore access.
- **Fix near-term**: Add a more-specific rule before the wildcard:
  ```
  match /companies/{cid}/config/api {
    allow read, write: if isAdminMember();
  }
  ```
- **Fix long-term**: Move every Anthropic call server-side into Cloud Functions. Drop `dangerous-direct-browser-access`.

---

## 2. High findings — significant risk

### 2.1. `rfqUploads` / `reviewUploads` accept fully-public updates (Security H-1, H-2 / Cost D4)
- **Where**: `firestore.rules:50-55` (rfqUploads) and 58-63 (reviewUploads). Both `allow update: if true;`.
- **Attack vectors**:
  - Overwrite `lineItems` with bogus prices (price-injection — replaces BC pricing when user clicks "Apply Prices to BOM").
  - Replace `drawingPages` with attacker-controlled URLs (rendered via `<img src>` in the engineer-side review modal).
  - Set `status:"submitted"` to fire `onSupplierQuoteSubmitted` (sends email + push + Teams) without uploading anything — notification spam.
  - Replace `storageUrl` with attacker-controlled URL — engineer's "View PDF" downloads attacker content.
- **Fix**: `request.resource.data.diff(resource.data).affectedKeys().hasOnly([...])` allow-list. Forbid updates after `expiresAt` and after `status == 'submitted'`.

### 2.2. HTML email builders interpolate untrusted strings without escaping (Security H-4)
- **Where**: `src/app.jsx:4813-4892` `buildRfqEmailHtml`, plus other email builders.
- **Attack**: Supplier crafts a PDF that causes AI extraction to emit a description like `</td><td><script src=...>`. That description gets interpolated into outbound email HTML AND into the in-app email-preview iframe (`iframe srcDoc=`, no `sandbox` attribute).
- **Fix**: Add `escapeHtml` helper (one already exists at `public/modules/engineering/portal.js:744`). Wrap every interpolation. URL fields validated separately (`/^https?:/i`). Add `sandbox="allow-same-origin"` to preview iframes.

### 2.3. AI assistant renders Claude responses via `dangerouslySetInnerHTML` (Security H-5)
- **Where**: `src/app.jsx:37836-37848`. Hand-rolled markdown-to-HTML, no sanitizer.
- **Attack**: Indirect prompt injection via supplier PDF → Claude returns malicious HTML in response → renders into ARC user session.
- **Fix**: Use a real sanitizer (DOMPurify) or render markdown with React components instead of innerHTML.

### 2.4. Anthropic rate-limit collisions across simultaneous supplier uploads (Concurrency H-1)
- **Scenario**: Three suppliers all upload 60-page PDFs the same morning. All three `extractSupplierQuotePricing` invocations share Jon's API key. At Anthropic Tier-1 limits (~40k input-tokens/min), three concurrent ~20-image Sonnet calls can hit 429/529.
- **Fix**: Per-uid mutex/semaphore on the Cloud Function. Queue subsequent uploads with "your quote is being processed, est. wait time…" UI in the portal. Add explicit retry-with-backoff on 429/529.

### 2.5. Quote-counter is transactional but UI doesn't gate concurrent prints (Concurrency H-2)
- **Scenario**: User-A and User-B both click "Print Client Quote" on the same project within the same second. Both get unique quote numbers (counter is safe), but the customer receives two different quote numbers each claiming to be the latest.
- **Fix**: Set `quotePrintLockedBy/At` in Firestore at the start of print; refuse a second print within ~30 seconds (similar pattern to Owner Priority Mode).

### 2.6. Project doc 1MB limit (Concurrency H-3)
- **Scenario**: 30-ECO project with 5000-row BOM split across 10 panels, 100+ engineering questions, full review history → hits 1MB.
- **Symptom**: `ref.set(toSave)` throws `INVALID_ARGUMENT: Document size exceeds maximum`. `safeSave` retries 2 times then surfaces the "Save failed" banner. After dismissal, every subsequent save on that project fails silently. Violates the CLAUDE.md "never lose user data" rule.
- **Fix**: Move panels into a subcollection `users/{uid}/projects/{id}/panels/{panelId}`. Project doc keeps only `panelOrder`, `quote`, `ecoSummary` (labels+status), and project-level metadata. Lazy migration on existing projects.
- **Stopgap**: Monitor doc size in `saveProject` and warn at 750KB.

### 2.7. Firestore 1-write/sec/doc soft cap (Concurrency H-4)
- Burst BOM editing across users + onSnapshot rebroadcast = thrash risk → `RESOURCE_EXHAUSTED`.
- **Fix**: True debounce on `saveProjectPanel` callers (e.g. `_pendingPanelSaves[panelId]`, batched 500ms). Audit `useEffect`s that auto-save on every state change.

### 2.8. ECO drafts not enforced as one-at-a-time (Concurrency H-5)
- Two users clicking "+ New ECO" can produce duplicate-number drafts because `ecoCounter` increment isn't transactional in all paths.
- **Fix**: Wrap "+ New ECO" creation in a Firestore transaction that asserts no `status:"draft"` ECO exists before creating.

### 2.9. `onSnapshot` soft-apply clobbers in-flight typing (Concurrency H-6)
- User-A typing into a BOM cell when User-B saves: `setProject(migrated)` fires and replaces the in-flight edit.
- **Fix**: Track focus state on critical input fields; defer soft-apply if any are focused. Or surface a "remote edit available — refresh?" banner.

### 2.10. CLAUDE.md ↔ code drift on supplier-quote model
- CLAUDE.md says supplier-quote extraction uses Haiku. Real code (functions/index.js:710) uses `claude-sonnet-4-20250514`. Sonnet is roughly 4-5× the cost of Haiku.
- **Fix**: Either switch the function to Haiku 4.5 OR update the docs. If switched: heavy-month savings ~$300-500/mo.

---

## 3. Medium findings — known gaps to track

### Security
- **M-2**: `_system/{docId}` rule lets any signed-in user write the system version doc.
- **M-3**: `supplierQuotes` and `bcPriceUpdates` create rules don't validate ownership — a member could create entries assigned to other users.
- **M-4**: `users/{uid}/notifications/{id}` allows any authenticated user to spam any other user with notification documents.
- **M-5**: Team invite token uses `Math.random` client-side — 53 bits of entropy and not cryptographic. Move to `crypto.getRandomValues`.

### Concurrency
- **M-1**: BC offline queue is per-tab (localStorage). Two tabs reconnecting at the same time can each retry the same operation.
- **M-2**: FCM duplicate notifications across devices.
- **M-3**: Presence heartbeat orphans (closed tabs that didn't fire `beforeunload`).
- **M-4**: ECO scope drift between concurrent users.
- **M-5**: `activeExtractions` ghost cleanup is per-user only.
- **M-6**: `migrateProjectShape` may still produce silent saves on load (the v1.19.954 fix removed one path; watch for regressions).
- **M-7**: Concurrent file uploads on `addFiles` not serialized.

### Cost
- See cost report sections D5-D7 (BC 429 backoff, signed Storage upload URLs, image-entropy guard).

---

## 4. What's already done well (preserves what's working)

The audits explicitly called out several things the codebase gets right — preserve these:

- **Token entropy**: Supplier and review portal tokens use 128-bit `crypto.getRandomValues`. Properly unguessable.
- **Team management auth**: `inviteTeamMember`, `acceptTeamInvite`, `removeTeamMember`, `updateMemberRole` all re-validate admin role server-side rather than trusting client claims.
- **BC OAuth tokens**: in-memory only, never persisted.
- **`acceptTeamInvite`**: correctly checks invitee email matches the auth token email.
- **`pageImages/{uid}/...` Storage path**: correctly scoped to owner.
- **Owner Priority Mode lock**: enforced in Firestore rules with safe defaults for missing fields.
- **Quote counter**: Firestore transaction is correct; uniqueness is guaranteed.
- **v1.19.954 rev-bump fix**: removed the silent `safeSave` from the `didEcoLegacyMigrate` effect that was polluting hashes on every project open.

---

## 5. Concrete cost numbers (verify against vendor pricing pages)

Cost analyst's estimates at three usage levels:

| Scenario | Anthropic | Firebase | Total/mo |
|---|---|---|---|
| Light (5 projects/wk, 2 panels each, 1 RFQ each) | ~$76 | ~$5-15 | **~$80-90** |
| Heavy (25 projects/wk, 4 panels each, 5 RFQs each) | ~$1,193 | ~$10-25 | **~$1,200** |
| 1-hour stress attack on supplier portal | ~$1,560 burned | negligible | **~$1,560 in one hour** |

Anthropic dominates 80-95% of monthly spend. The supplier portal Cloud Function is the single biggest exposure surface.

---

## 6. Stress-test plan — verify fixes work

The concurrency analyst included a 10-scenario stress test plan. Highlights:

1. **Two-user race**: Open PRJ402083 in two browsers (different uid). User-A edits a BOM cell, User-B clicks Print Quote. Verify: nothing silently overwrites. (Today, WBP-1/2 will fail this.)
2. **Concurrent supplier portal**: Open three supplier portal links in three browsers, drop a 60-page PDF in each. Verify: all three complete, no 429 cascade. (Today, H-1 will fail.)
3. **Supplier portal cost-attack**: Generate a 500-page synthetic PDF, drop it through a fresh portal link. Verify: function rejects with page-count error. (Today, no rejection — call would proceed.)
4. **Token-tampering**: With dev tools open on a supplier portal link, run `fbDb.doc('rfqUploads/'+token).update({status:'submitted'})`. Verify: rejected by Firestore rules. (Today, accepted.)
5. **API key exfiltration**: Sign in as a `view`-role user, run `fbDb.doc('companies/'+cid+'/config/api').get()`. Verify: rejected by rules. (Today, accepted.)
6. **Quote-print race**: User-A and User-B both click Print Client Quote within 1 second. Verify: only one quote PDF goes out. (Today, two PDFs.)
7. **ECO race**: User-A and User-B both click "+ New ECO" within 1 second. Verify: only one ECO is created. (Today, two.)
8. **Project doc size**: Generate a project with 5000+ BOM rows + 30 ECOs and try to save. Verify: warning at 750KB, graceful failure at 1MB. (Today, silent retry-then-fail.)
9. **In-flight typing**: User-A typing in a BOM cell when User-B saves. Verify: User-A's typing is preserved. (Today, clobbered.)
10. **HTML injection in email preview**: Inject `<script>alert(1)</script>` as part description, send Quote email. Verify: script does NOT execute in the in-app preview iframe. (Today, executes.)

Full test plan with reproduction steps is in `concurrency-analysis-2026-05-01.md`.

---

## 7. Failover & degraded modes — keeping the system usable when things break

The cost analyst's section F has the full list. Highlights:

- **F1 — Manual entry on supplier portal when Anthropic is down**: Today the portal shows `aiError` but the supplier still has manual entry. Make manual entry a first-class path so the supplier doesn't think the upload failed.
- **F2 — Skip-AI BOM extract**: When Anthropic returns 5xx for 60 seconds, surface a "Skip AI — enter BOM manually" CTA. Today the user is stuck.
- **F4 — Firestore-down handling**: Today writes silently fail. Add a top-level toast and a local outbox.
- **F5 — Service-worker offline read mode**: Big project (1-2 days), but cache `index.html` + bundle so the app loads from cache and reads existing projects when any backend is down.

---

## 8. Recommended billing setup (the "never go down due to billing" plan)

The cost analyst's section 5 is the prescription. Compressed version:

### Anthropic
1. Switch to **Prepaid Credits** (not credit-card-on-file). Top up $300.
2. **Auto-recharge**: threshold $50, recharge $300. — Auto-recharge is THE thing that prevents service interruption when credits drain mid-month.
3. **Workspace monthly spend cap** at $300. — Hard ceiling. API returns 429 when hit, not catastrophic billing surprise.
4. **Notifications email at 80%** of cap.
5. **Second account on a different billing card** (e.g. company Amex + Jon's personal backup). $50 prepaid as failover insurance. Wire the failover key into the client with automatic swap on 401/402/quota.
6. (Optional) Apply for higher Tier (Tier 3 = $400 deposit, Tier 4 = $5,000 deposit). Heavy-use months would push against Tier 1/2 RPM/TPM if multiple supplier portals fire concurrently.

### GCP / Firebase
1. **GCP Billing Budget** at $50/mo. Alerts at 50/90/100/120%. Notification email + Pub/Sub topic.
2. (Optional, nuclear) Subscribe a Cloud Function to the Pub/Sub topic that auto-disables billing if actual spend exceeds 150% of budget. Sample at `https://cloud.google.com/billing/docs/how-to/notify`.
3. Confirm project is on **Blaze** (required for Cloud Functions and outbound network).
4. `firebase functions:config:set` — verify all secrets are set; missing keys cause function failures that look like outages.

### SendGrid
1. Confirm **SPF + DKIM + DMARC** on `matrixpci.com`.
2. Move `SENDGRID_API_KEY` to Google Secret Manager (referenced via `defineSecret` in Functions Gen 2). Rotates without redeploy.
3. Subscribe to SendGrid bounce + spam-report webhooks → log to Firestore.
4. **Fallback ESP** — Postmark or Mailgun, generous free tiers. Wrap `sgMail.send` in try/catch + fallback so a SendGrid outage doesn't take RFQ confirmations down.
5. Already-used path: outbound RFQs go through MS Graph (`me/sendMail` from `jon@matrixpci.com`), not SendGrid. So that path is already non-SendGrid-dependent.

### Microsoft Graph
- Free with M365 / BC tenant. Limit is 10,000 messages/24h per mailbox; transactional batch ~30/min. Well under typical RFQ volume.

---

## 9. Roadmap

### Day 0 — Today (60 min, no code)
- [ ] Anthropic: prepaid credits + auto-recharge + workspace cap + 80% alert
- [ ] GCP: $50/mo budget + alerts at 50/90/100/120%
- [ ] Anthropic: open second account, $50 prepaid, save failover key
- [ ] Confirm Blaze + SendGrid API key + SPF/DKIM/DMARC

### Days 1-7 — Cost-attack hardening (4-6 hr code)
- [ ] Add page-count + image-size cap to `extractSupplierQuotePricing`
- [ ] Per-token rate limit (Firestore counter)
- [ ] Tighten `rfqUploads` + `reviewUploads` rules to allow-list updates
- [ ] `maxInstances` cap on every callable function
- [ ] Cloud Logging alerts on function error rate + supplier-portal anomaly
- [ ] Retry-with-backoff in Anthropic call wrapper for 429/529

### Days 8-30 — Cost reduction + reliability (1-2 days)
- [ ] **Fix `saveProject`/`saveProjectPanel` mutex desync** (concurrency WBP-1)
- [ ] **Lock down API key Firestore rule** (security H-3)
- [ ] **HTML-escape email builders + sandbox preview iframe** (security H-4)
- [ ] Prompt caching on BOM extract + supplier-portal prompts
- [ ] Per-token Anthropic spend cap (defense in depth)
- [ ] Email-fallback path through MS Graph
- [ ] Wire up failover Anthropic key with automatic swap

### Days 31-60 — Resilience (2-3 days)
- [ ] Move panels into subcollection (concurrency H-3 — prevent 1MB doc cliff)
- [ ] Manual-entry fallback on supplier portal when AI fails (cost F1)
- [ ] Skip-AI fallback in BOM extract (cost F2)
- [ ] Sign supplier-portal storage uploads with one-time URL from Cloud Function (security/cost D6)
- [ ] Anthropic spend ledger + toolbar pill (cost A6)
- [ ] BC 429 retry-with-Retry-After honoring (cost D5)
- [ ] Quote-print lock to prevent two-user race (concurrency H-2)
- [ ] ECO transactional create (concurrency H-5)

### Days 61-90 — Premium polish (2-3 days, optional)
- [ ] Status page at `/status`
- [ ] Firestore-write outbox / retry on transient failure
- [ ] Service-worker offline read mode (decide if maintenance burden is worth it)
- [ ] Tune `index.html` cache headers; consider splitting bundle

---

## 10. Pricing data to re-verify before acting

The cost analyst flagged six numbers worth a fresh check before committing to specific dollar limits:

1. Anthropic per-Mtok prices for Sonnet 4.6 and Haiku 4.5
2. Anthropic image-token formula (`tokens ≈ W*H/750`) for current model versions
3. Firebase Blaze unit prices (Firestore $/100k ops; Cloud Functions Gen 2 $/Mreq + $/GB-s; Storage $/GB)
4. SendGrid Essentials current pricing
5. Whether the M365 / BC tenant has the standard 10k/day `me/sendMail` limit or a tenant-specific override
6. Anthropic rate-limit Tier 1/2/3/4 thresholds (these have changed twice in the last year)

URLs:
- `https://www.anthropic.com/pricing`
- `https://docs.anthropic.com/en/api/rate-limits`
- `https://firebase.google.com/pricing`
- `https://sendgrid.com/pricing`
- `https://learn.microsoft.com/en-us/graph/throttling-limits`

---

## Appendix — Files inspected across all three audits

- `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc`
- `functions/index.js` (1357 lines, all reviewed)
- `src/app.jsx` (~36k lines, targeted review of auth/save/portal/quote/ECO/AI surfaces)
- `public/index.html`, `public/sw.js`, `public/firebase-messaging-sw.js`
- `public/modules/engineering/portal.js`
- `CLAUDE.md` (architecture context for all three agents)

---

## Appendix — Companion reports

- **Security audit** — full findings with attack scenarios and recommended fixes: `docs/security-audit-2026-05-01.md`
- **Concurrency analysis** — failure scenarios with reproduction steps and a 10-test stress plan: `docs/concurrency-analysis-2026-05-01.md`
- **Cost & resilience** — full Anthropic surface map, monthly cost models at light/heavy/stress use, 30/60/90-day priority list, billing-resilience setup guide: `docs/cost-resilience-analysis-2026-05-01.md`

---

*Diagnostic compiled by Claude on 2026-05-01 from three parallel deep-dive analyses. v1.19.954 of the app was the analyzed baseline.*

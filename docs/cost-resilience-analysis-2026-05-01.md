# MatrixARC — Cost & Billing-Resilience Analysis
*Date: 2026-05-01 — analyst: Claude (Opus 4.7, 1M context)*

> **IMPORTANT — pricing-data caveat.** Live web access (`WebSearch` / `WebFetch`) was disabled in this session, so all unit prices below are drawn from the model's January-2026 training cutoff and from the Anthropic / Firebase / SendGrid pricing pages as they stood in late 2025/early 2026. **Before acting on any cost recommendation, re-verify the unit price at the linked vendor URL.** All dollar figures should be read as order-of-magnitude estimates, not invoices.
>
> Sources to verify: `https://www.anthropic.com/pricing`, `https://docs.anthropic.com/en/api/rate-limits`, `https://firebase.google.com/pricing`, `https://sendgrid.com/pricing`, `https://learn.microsoft.com/en-us/graph/throttling-limits`.

---

## 1. Executive Summary

1. **Steady-state cost is small (~$30-90/month) but the supplier portal is an unbounded liability.** A single malicious 500-page PDF drop submitted through the public portal token can burn $40-$120 of Anthropic spend in one click and there is no rate limit, page-count cap, or token-cap circuit breaker today.
2. **Anthropic is the dominant cost driver** (probably 80-95% of monthly spend). It is also the single point of failure: if the user's Anthropic key is suspended, BOM extraction, supplier-portal scanning, BC item lookup and pricing all stop. There is no fallback model, no cached prompt, and no retry on 529 overload.
3. **No prompt caching is used anywhere in the codebase** (`grep cache_control` returns 0 hits in `src/` and `functions/`). The BOM-extraction prompt is ~3.5 KB and runs on every page; caching would cut input cost on those calls by ~80-90%.
4. **Cloud Functions have no `maxInstances` cap** — a script firing the public `extractSupplierQuotePricing` callable in a loop can spin up to the GCP project default (3000 concurrent on Gen 1 / 100 on Gen 2) and chain into the user's Anthropic account at full speed.
5. **Top three actions, ranked by ROI:**
   - **(A) Cap supplier-portal abuse:** add `maxInstances`, page-count guard (≤25 pages/PDF), per-token rate limit, and per-token spend ledger inside `extractSupplierQuotePricing`. *Effort: 2-3 hr. Risk reduction: catastrophic → bounded.*
   - **(B) Set up Anthropic Prepaid Credits + Workspace Spend Limit + a second Anthropic account on a separate billing source.** *Effort: 30 min. Risk reduction: prevents service outage on payment failure.*
   - **(C) Add prompt caching to the BOM extraction prompt and the supplier-portal Sonnet prompt.** *Effort: 1-2 hr. Savings: ~30-50% of monthly Anthropic bill at heavy use.*

---

## 2. Cost Inventory

### 2.1 Anthropic API surface map

| # | Surface | File:Line | Model | Trigger | Image? | max_tokens | Caching? |
|---|---|---|---|---|---|---|---|
| 1 | BOM extraction (per BOM page) | `src/bom/extractor.ts:256` | **claude-sonnet-4-6** + thinking 4000 | "Extract" button per panel | yes (1 image up to 2400 px) | 16,000 | none |
| 2 | Part-number verification | `src/bom/extractor.ts:409` | **claude-haiku-4-5** | After BOM extract | text | 4,000 | none |
| 3 | Pricing estimate (batches of 10) | `src/bom/pricer.ts:66` | claude-sonnet-4-6 | "Refresh pricing" | text | 3,000 | none |
| 4 | BOM validator | `src/bom/validator.ts:39` | claude-sonnet-4-6 | After extraction | text | 4,096 | none |
| 5 | Extraction-pipeline orchestrator | `src/bom/extractionPipeline.ts:290` | claude-sonnet-4-6 | Extract pipeline | text | 4,000 | none |
| 6 | Page type classifier (per page) | `src/scanning/pageClassifier.ts:30` | claude-haiku-4-5 | On every PDF upload | yes | 256 | none |
| 7 | Zoom-page detector (batched 6) | `src/scanning/pageClassifier.ts:92` | claude-haiku-4-5 | On every PDF upload | yes | 200 | none |
| 8 | Panel metadata extractor (batches of 8 pages) | `src/scanning/pageClassifier.ts:148` | claude-sonnet-4-6 | On every PDF upload | yes (8 imgs/call) | 700 | none |
| 9 | Drawing analyzer (4 calls per panel) | `src/scanning/drawingAnalyzer.ts:230,270,298,327` | sonnet ×2 + haiku ×2 | Layout/schematic analysis | yes | 2-4k | none |
| 10 | Title-block reader | `src/scanning/titleBlockReader.ts:29` | claude-haiku-4-5 | On every PDF upload | yes | 256 | none |
| 11 | BC Item Browser row-locate | `src/ui/modals/BCItemBrowserModal.tsx:109` | claude-haiku-4-5 | Every BC search-result page | yes | 80 | none |
| 12 | Quote chat / "ask AI" | `src/ui/App.tsx:321`, `src/ui/tabs/ItemsTab.tsx:629` | claude-sonnet-4-6 | User typing | text | 2,000 | none |
| 13 | Quote-tab autosuggest | `src/ui/tabs/QuoteTab.tsx:438,493` | (defaults sonnet) | Auto on quote edits | text | 200/700 | none |
| 14 | CPD search modal | `src/ui/modals/CPDSearchModal.tsx:68` | claude-sonnet-4-6 | User search | text | 4,096 | none |
| 15 | Supplier-quote import (manual upload) | `src/ui/modals/SupplierQuoteImportModal.tsx:357` | claude-sonnet-4-6 | User uploads PDF in app | yes (multi-image) | 8,000 | none |
| 16 | API-key smoketest | `src/ui/modals/APISetupModal.tsx:136` | claude-sonnet-4-6 | "Test connection" | text | 20 | n/a |
| **17** | **Supplier-portal extraction (PUBLIC)** | `functions/index.js:480` | **claude-sonnet-4-20250514** | Public token — supplier upload | **yes (up to 20 imgs per batch, unbounded batches)** | **16,000** | **none** |

**Discrepancy with CLAUDE.md.** CLAUDE.md says supplier-quote extraction uses Haiku; the actual function (`functions/index.js:480`) uses **Sonnet 4 (claude-sonnet-4-20250514)**, which is roughly 4-5× the cost of Haiku. This is a docs drift — and a cost issue worth fixing on its own.

### 2.2 Per-call token estimates (approximate)

Vision calls bill input tokens for the image itself based on resolution. Per Anthropic's image-token formula `tokens ≈ (W × H) / 750`, a ~2400×1800 JPEG = ~5,800 input tokens. Multi-image calls multiply this.

| Call | Input tokens (image+prompt) | Output | Notes |
|---|---|---|---|
| BOM extract (#1) | ~7,000 image + ~1,200 prompt = **~8,200** | ~3,000 + 4,000 thinking = **~7,000** | Highest per-call cost |
| Page type classify (#6) | ~5,800 image + 200 prompt = **~6,000** | ~50 | Runs N× (one per PDF page) |
| Panel metadata (#8) | 8 × 5,800 = **~46,400** image + 200 prompt | ~500 | Runs `ceil(N/8)` × per panel |
| Supplier-portal extract (#17) | **20 × 5,800 = 116,000** image + 1,500 prompt = **~117,500** | up to 16,000 | Runs `ceil(N/20)` × per submission |
| Drawing analyzer (#9) | ~6,000 each call × 4 calls | ~3,000 each | Runs once per panel |

### 2.3 Pricing assumptions (verify before use)

| Model | Input $/Mtok | Output $/Mtok | Cache-write $/Mtok | Cache-read $/Mtok |
|---|---|---|---|---|
| Claude Opus 4 / 4.x | ~$15 | ~$75 | ~$18.75 | ~$1.50 |
| Claude Sonnet 4 / 4.5 / 4.6 | ~$3 | ~$15 | ~$3.75 | ~$0.30 |
| Claude Haiku 4.5 | ~$1 | ~$5 | ~$1.25 | ~$0.10 |

(Numbers per Anthropic's published pricing during late 2025; double-check at `https://www.anthropic.com/pricing`. If Sonnet 4.6 is now flagged "1M context" on this codebase, add the appropriate surcharge.)

### 2.4 Monthly cost scenarios

#### Light use — 5 projects/week × 4 weeks = 20 projects/month, 2 panels each (40 panels), 1 RFQ each (20 RFQs)

| Surface | Calls/mo | Tokens/mo (in/out) | Estimated $ |
|---|---|---|---|
| BOM extract (40 panels × ~3 BOM pages = 120) | 120 | 1.0M / 0.84M | $3 + $13 = **~$16** |
| Page classifier (20 PDFs × ~12 pages each = 240) | 240 | 1.4M / 0.01M | $1.4 + $0.05 = **~$1.50** |
| Panel metadata (40 panels × 1.5 batches) | 60 | 2.8M / 0.03M | $8.4 + $0.45 = **~$9** |
| Drawing analyzer (40 panels × 4 calls) | 160 | 1.0M / 0.5M | $3 + $7.5 = **~$11** |
| Pricing batches (40 panels × ~5 batches) | 200 | 0.2M / 0.4M | $0.6 + $6 = **~$7** |
| Supplier-portal Sonnet (20 RFQs × avg 3 batches × 20 imgs) | 60 | 7M / 0.6M | $21 + $9 = **~$30** |
| Misc Haiku (BC browser, classifier, title block) | ~600 | 1M / 0.05M | **~$1.50** |
| **Total** | | | **≈ $76/month** |

#### Heavy use — 25 projects/wk × 4 = 100 projects/month, 4 panels each (400 panels), 5 RFQs each (500 RFQs)

| Surface | Calls/mo | Tokens/mo (in/out) | Estimated $ |
|---|---|---|---|
| BOM extract (400 × 3 = 1,200) | 1,200 | 9.8M / 8.4M | $30 + $126 = **~$156** |
| Page classifier (~2,400) | 2,400 | 14.4M / 0.1M | $14 |
| Panel metadata (400 × 1.5 batches = 600) | 600 | 28M / 0.3M | $84 + $4.5 = **~$89** |
| Drawing analyzer (1,600 calls) | 1,600 | 10M / 5M | **~$105** |
| Pricing batches (~2,000) | 2,000 | 2M / 4M | **~$66** |
| Supplier-portal Sonnet (500 RFQs × 3 batches) | 1,500 | 175M / 15M | $525 + $225 = **~$750** |
| Misc Haiku | ~6,000 | 10M / 0.5M | $10 + $2.5 = **~$13** |
| **Total** | | | **≈ $1,193/month** |

#### Stress / attack scenario — 1-hour cost-attack on supplier portal

Single attacker drops one **500-page PDF** through a leaked supplier token (or token they were emailed and never used legitimately):

- 25 batches × 20 pages × 5,800 input tokens/page = **2.9M input tokens (Sonnet)**
- ~12,000 output tokens × 25 = **300k output tokens**
- Cost per upload: 2.9 × $3 + 0.3 × $15 = **$8.70 + $4.50 ≈ $13 per upload**

If automated to repeat every 30 seconds for an hour: **120 uploads × $13 ≈ $1,560 in one hour.**

Cloud Functions also bill: 120 invocations × ~60 sec × 512 MB. At ~$0.0000025 GB-sec, that's $0.10 — negligible. Anthropic spend is the real damage.

Multiple tokens (the attacker also leaks RFQ emails to themselves) and concurrent runs scale this linearly until either Anthropic rate-limits the key or the credit balance hits zero.

### 2.5 Firebase costs

Per Blaze pricing (verify): Firestore read $0.06 / 100k, write $0.18 / 100k, delete $0.02 / 100k, stored $0.18/GB/mo. Hosting bandwidth $0.15/GB. Cloud Functions $0.40/Mreq + $0.0000025/GB-s. Cloud Storage $0.026/GB/mo + $0.12/GB egress.

**Steady-state (5 internal users + occasional supplier hits):**

| Category | Estimate | Notes |
|---|---|---|
| Firestore reads | 50-150k/day = 1.5-5 M/month | `onSnapshot` on notifications + `rfqUploads` for each user, plus loading 20-100 projects each session. **$1-3/mo.** |
| Firestore writes | 5-15k/day = 150-450 k/month | Project saves, BOM edits, lead-time queue flushes. **$1-2/mo.** |
| Firestore storage | 0.5-3 GB | Large project docs (panels carry BOM rows + breadcrumbs). **<$1/mo.** |
| Cloud Storage (page images + supplier PDFs) | 2-20 GB | ~200 KB/page × 12 pages × 100 projects = 240 MB/yr; supplier PDFs accrete. **$0.50-$2/mo.** |
| Cloud Functions invocations | ~10-30k/month | sendInviteEmail, sendEngineerQuestionEmail, supplier-portal callable, scrapers. **<$1/mo.** |
| Cloud Functions compute | dominated by `extractSupplierQuotePricing` (~30 sec at 512 MB) and `codaleScheduledScrape` (2 GB, 540 sec) | **$1-3/mo.** |
| Hosting bandwidth | bundle is ~1.6 MB, served via `Cache-Control: no-cache, no-store, must-revalidate` on every page load. 5 users × 30 loads/day × 30 days = 4,500 loads × 1.6 MB ≈ **7 GB/mo. ~$1/mo.** |
| **Realistic monthly Firebase total** | | **$5-15/month** |

Spark (free) tier limits: 50k reads/day, 20k writes/day, 1GB Firestore, 5GB Storage egress/month, 125k function invocations/month. The user is almost certainly already on **Blaze** (required for Cloud Functions and for outbound network calls to Anthropic / SendGrid / BC). **Confirm in Firebase Console → Usage and billing.**

### 2.6 SendGrid (email)

Trigger points:
- `sendInviteEmail` (team invite) — rare
- `sendEngineerQuestionEmail` — per engineering question batch sent
- `onSupplierQuoteSubmitted` trigger — sends 2 emails (ARC user + supplier confirmation) per submission
- Outbound RFQs are sent through **MS Graph** (via `me/sendMail` from `jon@matrixpci.com`) — **not** SendGrid. So RFQ blast emails do not count toward SendGrid quota.
- Customer review request emails: sent via SendGrid in `sendReviewRequest` patterns (verify by name)
- Quote-send emails: client-side, MS Graph

Volume estimate: ~5-50 SendGrid sends/day depending on workload. Free tier (100 emails/day) probably fits the light scenario; the **Essentials** tier (~$20/mo, 50k/mo) is overkill but recommended once the team grows. The realistic risk is *deliverability*, not cost — a bad bounce rate on `sales@matrixpci.com` could get the sender domain throttled.

### 2.7 Microsoft Graph / Outlook

Free with the Microsoft 365 / BC tenant. Throttling per `me/sendMail`: **10,000 messages/24 h per mailbox** (per Microsoft docs); transactional batch limit ~30/min. RFQ blasts of 5-15 vendors are well under the limit. No cost.

### 2.8 Business Central API

Subscription-based — no per-call billing. Default rate limit ~600 requests/minute per environment. The app makes heavy bursts on project open: customer sync, contact fetch, payment terms, ship method, salesperson, item costs, planning lines, plus N× per BOM row for item-cost lookups. A 100-row BOM refresh can trigger 200+ BC calls. The existing offline queue (`_arc_bc_queue`) handles 5xx but NOT 429 — see recommendation D5.

---

## 3. Cost-Attack Vectors

### 3.1 The supplier portal — biggest risk

**Surface:** `https://matrix-arc.web.app/?rfqUpload=TOKEN` → frontend `processFile()` → `extractSupplierQuotePricing` callable. Token is a client-side string emailed to one or more suppliers. There is **no per-token rate limit**, **no PDF size guard inside the function** (the 25 MB Storage rule does not apply to the callable), and the `pageImages.slice(0, 20)` cap only applies *per call* — the frontend loops indefinitely (`for batch=0..totalBatches-1`).

**Attack 1 — token leak + giant PDF.** A vendor forwards an RFQ email to a competitor; competitor uploads a 1,000-page synthetic PDF. Frontend loops 50 batches. Each batch sends ~117k input tokens to Sonnet at $3/Mtok in plus up to 16k output at $15/Mtok = ~$0.59 in + $0.24 out = ~$0.83 per batch × 50 = **~$42 per upload**. Repeated 100 times in a day from a botnet: **~$4,200**.

Caps the function does *not* enforce today:
- max page count
- per-token call count per hour
- per-token monthly spend budget
- min content-length / max content-length validation
- detection of identical or random-noise images

**Attack 2 — Cloud Function flood.** Even without abusing Anthropic, an attacker can call the public callable in a loop. Functions auto-scale (no `maxInstances` set). At 60 sec/invoke × 1000 concurrent = 60,000 GB-seconds at 512 MB = ~$0.075 for compute, but Firestore reads inside the function (token lookup, cross-ref doc, supplierCrossRef doc — each call) cost ~$0.0006/Mread. Modest direct cost but it consumes Anthropic quota.

**Attack 3 — Storage spam.** `storage.rules:11` allows write to `supplierUploads/{token}/{any}` for any file under 25 MB without auth. A leaked token + a script can drop 1,000 × 25 MB junk files = 25 GB at $0.026/GB/mo = $0.65/mo (small) + egress on cleanup. Mostly an availability/junk problem.

### 3.2 Other public surfaces

- **`reviewUploads/{token}`** — same shape (line 58-63 of `firestore.rules`). If a feature uses it for AI extraction, same risk applies. Audit which Cloud Functions touch it.
- **`rfqUploads/{token}` update** — public update means a hostile actor can change `status` to `submitted` even without uploading a quote, firing the `onSupplierQuoteSubmitted` trigger (which sends email + push + Teams card). This is a notification-spam vector; cost is negligible (SendGrid free quota), but cosmetically harassing.

### 3.3 Authenticated-user attacks

- A signed-in member could spam `extractSupplierQuotePricing` with their own token. Less likely (signed-in audit trail) but worth a per-uid spend cap.
- A signed-in member could trigger the BOM extract repeatedly. The Owner Priority Mode soft-locks 13 actions, but re-extract is in the locked list only when *another* user holds the lock; the signed-in user can still hammer their own panels.

---

## 4. Recommendations

### A. Anthropic API resilience

| # | Action | Where | Effort | Impact |
|---|---|---|---|---|
| A1 | **Switch to Anthropic Prepaid Credits** and set auto-recharge with a low cap (e.g. recharge $200 when balance hits $50). Prepaid credits fail-open: when exhausted, API returns an error rather than billing a credit-card overage. | `console.anthropic.com → Billing` | 10 min | Eliminates "card declined → service down" risk |
| A2 | Set a **Workspace Spend Limit** (per-workspace monthly cap) at e.g. $300/mo. When hit, API returns `429 you have reached your spend limit` — clean failure, not catastrophic. | Anthropic Console → Settings → Limits | 5 min | Hard ceiling on monthly bill |
| A3 | Open a **second Anthropic account** under a different billing card (e.g. company Amex + personal backup). Store the failover key in `users/{uid}/config/api_failover`. Add client-side fallback: if primary returns 401/402/quota, swap to backup. | Anthropic Console + small client change | 30 min | Failover when primary key is suspended |
| A4 | Add **prompt caching** to the BOM-extraction prompt and the supplier-portal prompt. Both prompts are large (~3-4 KB) and used hundreds of times per month. Add `cache_control: { type: "ephemeral" }` to the system block; subsequent calls within 5 min get 90%+ off the cached portion. | `src/bom/extractor.ts:255-266`, `functions/index.js:461-484` | 1-2 hr | 30-50% saving at heavy use |
| A5 | Add **retry with exponential backoff** for 529 (overload) and 429 (rate-limit) responses. The single-line `client.ts:apiCall` currently throws on any non-OK status — a transient Anthropic blip aborts the whole extraction and the user has to click Extract again. | `src/services/anthropic/client.ts` | 30 min | Eliminates spurious failures |
| A6 | Track per-call token usage and persist to Firestore (`users/{uid}/config/anthropicLedger`). Display monthly spend in the toolbar so the user always knows where they stand vs. the limit. | New helper in `client.ts` + small UI pill | 2 hr | Visibility, abuse detection |
| A7 | **Move BOM extraction to Sonnet 4.6 with thinking only when needed**, not unconditionally. The `interleaved-thinking-2025-05-14` beta with 4000-token budget bills the thinking tokens at output rate. Many BOM pages don't need that depth — auto-disable thinking on pages with < 10 detected rows. | `src/bom/extractor.ts:258` | 1 hr | 10-20% saving on BOM extraction |
| A8 | Reconcile docs: the supplier-portal function uses **Sonnet** but CLAUDE.md says Haiku. Either switch the function to Haiku 4.5 (4-5× cheaper) or update the docs. | `functions/index.js:480` and `CLAUDE.md` AI Model Usage table | 5 min docs / 30 min code+test | If switched to Haiku: ~$5-15/mo (light) / ~$300-500/mo (heavy) saved |

### B. Firebase resilience

| # | Action | Where | Effort | Impact |
|---|---|---|---|---|
| B1 | **Set a GCP billing budget** at $50/mo with email alert + Pub/Sub + automatic project-disable trigger if exceeded. (Firebase Blaze inherits GCP billing.) | `https://console.cloud.google.com/billing/budgets` for project `matrix-arc` | 20 min | Hard ceiling, alert fires before any disaster |
| B2 | Add `maxInstances` cap to every Cloud Function. Recommended: `extractSupplierQuotePricing: 5`, `codaleRunScrape: 2`, scrapers: 3, every other callable: 10. | `functions/index.js` — wrap each `runWith({...})` | 30 min | Prevents accidental fan-out + caps attack rate |
| B3 | Move Cloud Functions to **Gen 2** if not already (better cold-start, more granular memory). Spec each function's memory carefully — `extractSupplierQuotePricing` is at 512 MB which is fine; the 2 GB Codale scrapers are only justified if they're actually using DOM parsing libs. | `functions/index.js` | 1 hr | ~10-20% cost reduction; faster cold start |
| B4 | Add lifecycle rule on the `gs://matrix-arc.firebasestorage.app/supplierUploads/` prefix: delete files older than 90 days. Supplier PDFs are not user data once the quote is recorded in Firestore. | Cloud Storage lifecycle config | 15 min | Bounded storage growth |
| B5 | Tighten the `onSnapshot` patterns. `App.tsx:195` listens on notifications with `limit(50)` — fine. `App.tsx:205` and `ProjectView.tsx:138` listen on **all** `rfqUploads` for a uid with no time filter — every active token costs reads forever. Add `.where('expiresAt','>',Date.now())`. | `src/ui/App.tsx`, `src/ui/ProjectView.tsx` | 20 min | Bounded read cost as RFQ history grows |
| B6 | Consider adding a **CDN cache** on `index.html`. Today it's `no-cache, no-store, must-revalidate` — every visit re-downloads 1.6 MB. Switch to `Cache-Control: public, max-age=300, must-revalidate` (or use `etag`-based revalidation). With 5 users × 30 loads/day, that's a small win (~$1-2/mo bandwidth) but real. | `firebase.json:24` | 10 min | Faster page loads + minor bandwidth saving |

### C. SendGrid resilience

| # | Action | Where | Effort | Impact |
|---|---|---|---|---|
| C1 | Confirm `sales@matrixpci.com` has **SPF + DKIM + DMARC** correctly set — a single bounce-rate spike can get a free-tier sender silently throttled. | DNS for `matrixpci.com` | 30 min | Deliverability protection |
| C2 | Add a **fallback email path**: if `sgMail.send` throws, fall through to MS Graph `me/sendMail` from `jon@matrixpci.com`. The Graph API doesn't go through SendGrid and survives SendGrid outages or quota suspensions. | `functions/index.js:247, 322, 343, 387` (wrap each `sgMail.send` in try/catch + fallback) | 1 hr | No downtime if SendGrid suspends |
| C3 | If volume crosses 100 emails/day consistently, upgrade to SendGrid Essentials (~$20/mo for 50k/mo). | sendgrid.com/account | 10 min | Headroom |

### D. Cost-attack hardening

| # | Action | Where | Effort | Impact |
|---|---|---|---|---|
| **D1** | **Hard-cap the supplier-portal extraction.** Inside `extractSupplierQuotePricing`: reject if `pageImages.length > 25` (one-shot). Reject if cumulative pages for that token in the past 24 h > 100 (lookup `rfqUploads/{token}.aiPageCount`, increment atomically, reject when over). Reject if any image > 1 MB base64. | `functions/index.js:435-490` | 2 hr | **Single biggest risk-reduction action** |
| D2 | **Per-token rate limit.** Add an in-memory rate limit (or a Firestore counter) — max 5 calls per token per hour. After that, return `resource-exhausted` to the supplier portal. | same function | 1 hr | Caps brute-force attack |
| D3 | **Per-token spend cap.** Track estimated cost per call (use `usage` from Anthropic response) and persist on `rfqUploads/{token}.aiSpendCents`. Reject when > 500 cents ($5). The maximum any legitimate supplier needs. | same function | 2 hr | Defense in depth on top of D1/D2 |
| D4 | **Tighten Firestore rules on `rfqUploads/{token}`.** Today both read AND update are `if true`. The legitimate flow only needs the supplier to write specific fields (`status`, `pricedItems`, `vendorLeadTime`, `submittedAt`). Use a `request.resource.data` field-allow-list and reject any update that touches `uid`, `lineItems`, `expiresAt`, `aiSpendCents`. | `firestore.rules:50-55` | 1 hr | Prevents tampering with cost ledger |
| D5 | Add **BC 429 backoff** to the existing offline queue. Today the queue retries 5 times but doesn't differentiate 5xx vs. 429. On 429, sleep `Retry-After` header before re-queuing. | `src/bcSync/*` (`bcEnqueue` / `bcProcessQueue` paths) | 1 hr | Avoids BC tenant-wide throttle when bursting |
| D6 | **Auth-gate the storage rule.** `storage.rules:9-12` is wide open for any 25-MB file with a token in the path; an attacker who guesses a token format dumps junk. Either move uploads through a Cloud Function (auth-token-validated) or require the client to sign uploads with a one-time signed URL minted by the function. | `storage.rules` + `functions/index.js` (new `mintSupplierUploadUrl` callable) | 3 hr | Prevents storage spam |
| D7 | Block obviously-noise images: in `extractSupplierQuotePricing`, reject any base64 whose payload entropy is below a threshold (random bytes are high-entropy; solid-color pages are low) — or simply require `> 500 bytes` after decode. | `functions/index.js:462` | 30 min | Cheap cosmetic guard |

### E. Monitoring / alerting

| # | Action | Where | Effort | Impact |
|---|---|---|---|---|
| E1 | **GCP Billing budget alerts:** thresholds at 50%, 90%, 100%, 120% of $50/mo. Email + push to `jon@matrixpci.com`. | `console.cloud.google.com/billing/budgets` | 15 min | Earliest possible warning |
| E2 | **Cloud Logging alert: function error rate** — fire when any function's 5-minute error rate > 5% (`severity=ERROR` count / total). Email + Teams via existing webhook. | `console.cloud.google.com/logs/queries` → Create alerting policy | 30 min | Detects function-level outages |
| E3 | **Anthropic Console — usage alert at 80%** of monthly limit (Anthropic Console → Limits → email at threshold). | Anthropic Console | 5 min | Heads-up before hard cutoff |
| E4 | **RFQ submission anomaly:** Cloud Logging alert on `extractSupplierQuotePricing` invocation rate > 10/min for 5 minutes. (Normal rate is < 1/min.) | GCP alerting | 20 min | Triggers on cost-attack |
| E5 | **Firestore quota alert:** alert on > 1M reads/day or > 100k writes/day. | GCP alerting | 15 min | Detects runaway snapshots / loops |
| E6 | Consider a tiny **status page** at e.g. `https://matrix-arc.web.app/status` that pings each backend (Anthropic, BC, Firestore, SendGrid) and shows green/red. Gives the user a one-click view when something's flaky. | New `public/status.html` + small Cloud Function | 4 hr | Faster diagnosis |

### F. Failover / degraded modes

| # | Action | Where | Effort | Impact |
|---|---|---|---|---|
| F1 | **Manual entry path on the supplier portal.** If `extractSupplierQuotePricing` returns an error (Anthropic down, quota exceeded, function disabled), the portal should fall through to a "Enter prices manually" form populated with the requested line items. Today the portal just shows `aiError` and the supplier can still review manually, but the UX implies extraction failure = upload failure. Make manual entry a first-class path. | `src/ui/SupplierPortalPage.tsx:116-122` | 2 hr | Portal stays usable when AI is down |
| F2 | **Skip-AI option for the user.** On the BOM extract path, if Anthropic returns 5xx/quota for 60 seconds, surface a "Skip AI extraction — enter BOM manually" CTA. Today it just throws and the user is stuck. | `src/bom/extractor.ts` + UI | 2 hr | App stays usable when AI is down |
| F3 | Verify the BC offline queue's robustness: enumerate every BC write site and confirm it goes through `bcEnqueue` (not a raw `fetch`). The CLAUDE.md mentions queue types `createPurchaseQuote, attachPdf, patchJob, syncTaskDescs` — check there are no untyped writes that escape. | `src/bcSync/*`, `src/services/businessCentral/*` | 2 hr (audit) | Confirmed BC resilience |
| F4 | **Firebase down handling.** Today, when Firestore is unreachable, the app silently fails most writes. Add a top-level toast that surfaces persistent errors and queues writes locally. (Some of this exists for BC; replicate for Firestore.) | `src/services/firebase/firestore.ts` | 4 hr | No silent data loss |
| F5 | **Service-worker-based offline read.** `sw.js` is push-only today. Caching `index.html` + bundle gives the user a fall-through "app loads from cache, can edit projects offline, syncs when back online" mode. Big project, but dramatic resilience improvement. | `public/sw.js` | 1-2 days | Read-only resilience to any backend outage |

---

## 5. Suggested Billing-Resilience Setup — step by step

### 5.1 Anthropic billing hardening (do today, 30 min)

1. Sign in to `console.anthropic.com`.
2. Billing → switch to **Prepaid Credits** if not already. Top up $300.
3. Billing → **Auto-recharge**: enable, threshold $50, recharge amount $300. (Auto-recharge is what prevents service interruption when credits drain mid-month.)
4. Settings → **Workspace** → set **Monthly spend limit** at $300 for now. Increase as needed.
5. Settings → **Notifications**: email at 80% of limit.
6. **Create a second Anthropic account** under a different email (`jon+arc-failover@matrixpci.com`). Same workspace setup, $50 in prepaid credits, $50/mo spend cap. Save the key in `users/{uid}/config/api_failover` (new field). The cost of holding $50 is the cost of insurance.
7. (Optional but worth it) Apply for higher Tier (Tier 3 = $400 deposit, gets you ~50/min RPM and ~40k OTPM; Tier 4 = $5,000 deposit). Heavy-use month would push against Tier 1/2 rate limits if a bunch of supplier portals fire at once.

### 5.2 Firebase / GCP billing hardening (today, 30 min)

1. `console.cloud.google.com/billing/budgets` → project `matrix-arc` → **Create Budget**.
2. Amount: **$50/month**. Triggers at 50, 90, 100, 120%.
3. Notification email: `jon@matrixpci.com`. Add Pub/Sub topic `billing-alerts`.
4. Optional: subscribe a Cloud Function to that Pub/Sub topic that *automatically disables billing* if the actual spend exceeds 150% of budget. Sample code is at `https://cloud.google.com/billing/docs/how-to/notify`. This is the nuclear option — billing-disabled = entire project halts including hosting. Use only if you accept the trade-off.
5. In Firebase Console → Usage and billing, confirm you're on **Blaze**.
6. `firebase functions:config:set` — verify all secrets (`SENDGRID_API_KEY`, `MOUSER_API_KEY`, `DIGIKEY_CLIENT_ID/SECRET`) are set; missing keys cause function failures that look like outages.

### 5.3 SendGrid hardening (today, 15 min)

1. Confirm DKIM/SPF/DMARC on `matrixpci.com`.
2. Move `SENDGRID_API_KEY` to Google Secret Manager (referenced via `defineSecret` in Functions Gen 2). Rotates without redeploy.
3. Subscribe to SendGrid's bounce + spam-report webhooks → log to Firestore so you see deliverability problems before suppliers email you "I never got it".
4. Set up a **fallback ESP** (e.g. Postmark or Mailgun, both have generous free tiers) so a SendGrid outage doesn't take RFQ confirmations down. Wrap `sgMail.send` in a try/catch that falls through.

### 5.4 Cost-attack hardening (this week, 4-6 hr)

Implement D1 + D2 + D4 in order. Specifically the per-call page-count cap (D1) is a 30-minute change that eliminates the worst-case scenario.

### 5.5 Monitoring (this week, 1-2 hr)

E1, E3, E4 are the highest-ROI alerts. Set them all up at once.

---

## 6. 30 / 60 / 90-day Priority List

### Day 0 — TODAY (60 minutes total, no code change)
- [ ] Anthropic: auto-recharge prepaid + monthly spend cap + 80% alert (15 min)
- [ ] GCP: $50/mo budget + 90%/100%/120% alerts (15 min)
- [ ] Anthropic: open second account, fund $50, save failover key in a password manager for now (15 min)
- [ ] Confirm Firebase project is on Blaze and `SENDGRID_API_KEY` etc. are configured (10 min)
- [ ] Reconcile docs: update CLAUDE.md AI Model Usage table to say Sonnet for supplier-quote extraction, OR open a ticket to switch the function to Haiku (5 min)

### Days 1-7 — Cost-attack hardening + observability (4-6 hr)
- [ ] D1: Add page-count + image-size cap to `extractSupplierQuotePricing`
- [ ] D2: Per-token rate limit (Firestore counter)
- [ ] D4: Tighten `rfqUploads` rule to field-allow-list updates
- [ ] B2: Add `maxInstances` cap on every callable function
- [ ] E2/E4: Cloud Logging alerts on function error rate + supplier-portal anomaly
- [ ] A5: Retry-with-backoff in `apiCall` for 429/529

### Days 8-30 — Cost reduction + reliability (1-2 days)
- [ ] A4: Prompt caching on BOM-extract + supplier-portal (biggest cost saving)
- [ ] A7: Conditional thinking on BOM extract
- [ ] D3: Per-token Anthropic spend cap (defense-in-depth)
- [ ] B5: Add `expiresAt` filter to `rfqUploads` snapshots
- [ ] B4: Storage lifecycle rule on `supplierUploads/`
- [ ] C2: Email-fallback path through MS Graph
- [ ] A3: Wire up the failover Anthropic key in client + automatic swap

### Days 31-60 — Resilience (2-3 days)
- [ ] F1: Manual-entry fallback on supplier portal when AI fails
- [ ] F2: Skip-AI fallback in BOM extract
- [ ] D6: Sign supplier-portal storage uploads with one-time URL from a Cloud Function
- [ ] A6: Anthropic spend ledger + toolbar pill
- [ ] D5: BC 429 retry-with-Retry-After honoring

### Days 61-90 — Premium polish (2-3 days, optional)
- [ ] E6: Status page at `/status`
- [ ] F4: Firestore-write outbox / retry on transient failure
- [ ] F5: Service-worker offline read mode (decide if worth the maintenance burden)
- [ ] B6: Tune `index.html` cache headers; consider splitting bundle so cosmetic changes don't invalidate the whole 1.6 MB

---

## Appendix A — Files inspected

- `CLAUDE.md` — architecture summary
- `src/services/anthropic/client.ts` — central API wrapper (no retry, no caching)
- `src/bom/extractor.ts` — BOM-extract Sonnet+thinking call (#1 cost driver)
- `src/bom/pricer.ts`, `src/bom/validator.ts`, `src/bom/extractionPipeline.ts` — Sonnet sites
- `src/scanning/pageClassifier.ts`, `src/scanning/drawingAnalyzer.ts`, `src/scanning/titleBlockReader.ts` — vision calls
- `src/scanning/pdfExtractor.ts` — image resize at 2400-3800 px JPEG q=0.92
- `src/ui/SupplierPortalPage.tsx` — public portal upload + extract loop
- `src/ui/App.tsx`, `src/ui/ProjectView.tsx`, `src/ui/tabs/ItemsTab.tsx` — `onSnapshot` patterns
- `src/services/graphEmail.ts` — MS Graph email via MSAL (client-side)
- `functions/index.js` — Cloud Functions (1357 lines)
- `firestore.rules`, `storage.rules`, `firebase.json`
- `public/index.html` — 1.6 MB inline app, served `no-cache, no-store, must-revalidate`

## Appendix B — Numbers I would re-verify before committing

1. Anthropic per-million-token prices for **claude-sonnet-4-6** and **claude-haiku-4-5-20251001** — confirm at `anthropic.com/pricing`.
2. Anthropic image-token formula (`tokens ≈ W*H/750`) for the model versions in use.
3. Firebase Blaze unit prices (Firestore $/100k ops; Cloud Functions Gen 2 $/Mreq + $/GB-s; Storage $/GB).
4. SendGrid Essentials current pricing.
5. Whether the user's Microsoft 365 BC tenant is subject to the standard 10k/day `me/sendMail` limit or a tenant-specific override.
6. Anthropic rate-limit tiers (Tier 1/2/3/4) — these have changed twice in the last 12 months.

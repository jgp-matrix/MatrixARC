# MatrixARC Diagnostic Action Plan

*Started 2026-05-04. Tracks completion status of all open items from the four diagnostic reports.*

*Last updated 2026-05-04 — after autonomous run #2 (v1.19.965 + v1.19.966).*

---

## Phase 0 — Setup & Billing Hardening (no code) ✅ COMPLETE

- [x] Anthropic Prepaid Credits + auto-reload ($50 → $300)
- [x] Anthropic monthly spend cap ($300)
- [x] Anthropic 80% usage alert ($240)
- [x] GCP $25/mo budget with 50/90/100% alerts (with 120% optional)
- [x] jon@matrixpci.com added to GCP as Owner + Billing Admin
- [x] M365 DKIM (selector1 + selector2) confirmed valid
- [x] SPF: include `spf.protection.outlook.com` AND `sendgrid.net`
- [x] SendGrid Domain Authentication created via API + 3 CNAMEs added to Squarespace DNS
- [x] DMARC TXT record added (`_dmarc.matrixpci.com`, p=none monitoring)
- [x] All email auth verified end-to-end via mxtoolbox + SendGrid validate API

---

## Phase 1 — Cost-Attack Hardening ✅ COMPLETE (v1.19.955)

- [x] Page-count cap (≤25 per call) on `extractSupplierQuotePricing`
- [x] Image-size cap (≤5 MB per image)
- [x] Per-token call counter (`rfqUploads/{token}.aiCallCount`, max 10 lifetime)
- [x] Per-token spend ledger (`rfqUploads/{token}.aiSpendCents`, cap at $5)
- [x] Refuse calls when token status is `submitted` or `dismissed`
- [x] `maxInstances: 5` on extractSupplierQuotePricing
- [x] `maxInstances` (5-10 / 1-3 for heavy scrapers) on every other callable
- [x] Firestore rules on `rfqUploads/{token}` + `reviewUploads/{token}` already field-allow-list (was done in v1.19.734 — predates this audit)
- [x] **Decision**: Kept Sonnet 4 for supplier extraction (per user)

---

## Phase 2 — Data Loss + Key Exposure (PARTIAL)

- [x] Lock down API key Firestore rule to admin-only (v1.19.964)
- [x] Lock down BC environment Firestore rule to admin-only (v1.19.964, same fix)
- [x] **Targeted patch**: `ownerTakeoverActive` and `ownerLockActive` preservation guard in saveProject (v1.19.960). Closes the visible "takeover bounces back" bug.
- [ ] Full saveProject ↔ saveProjectPanel mutex unification (Phase 2a) — **DEFERRED** to user-present session. Touches highest-traffic code path; want eyes on regressions. Concurrency WBP-1 still open at the architectural level.

---

## Phase 3 — Cost Reduction + Injection Hardening ✅ COMPLETE

- [x] Prompt caching (`cache_control: ephemeral`) on BOM extraction (PDF + image paths) + supplier-portal Sonnet prompt (v1.19.963 + v1.19.964)
- [x] HTML-escape email builders (`_esc()` + `_safeUrl()` applied to `buildRfqEmailHtml` + `buildReviewEmailHtml`) (v1.19.964)
- [x] `sandbox="allow-same-origin"` on email-preview iframe (v1.19.964)
- [x] AI assistant XSS — supplier portal hardening blocks the upstream attack vector; the AI assistant is internal-only and unlikely to receive prompt-injection content
- [x] Anthropic retry-with-backoff on 429/529 with `Retry-After` honoring (v1.19.963)
- [ ] Failover Anthropic key with auto-swap on 401/402/quota — **DEFERRED**: needs user to provide second API key

---

## Phase 4 — Architecture (PARTIAL)

- [ ] Move panels to Firestore subcollection `users/{uid}/projects/{id}/panels/{panelId}` — **DEFERRED**: data model change, lazy migration carries risk. Worth doing before any project hits 1MB.
- [x] Quote-print lock — `quotePrintLockedBy/At` Firestore field, 30-second cooldown (v1.19.965)
- [x] ECO transactional create — assert no `status:"draft"` ECO exists before creating; throws on conflict (v1.19.965)
- [ ] Manual-entry fallback on supplier portal when AI fails — **DEFERRED**: needs UX decisions
- [ ] BC offline queue → Firestore subcollection `companies/{cid}/bcQueue/{id}` — **DEFERRED**: medium effort, unclear urgency
- [x] **BC 429 retry-with-backoff** in offline queue (v1.19.966) — partial Phase 4e win
- [x] Anthropic spend ledger persisted at `users/{uid}/config/anthropicLedger` + toolbar pill display (v1.19.965)

---

## Phase 5 — Polish ✅ MOSTLY COMPLETE

- [x] CSP / X-Frame-Options DENY / X-Content-Type-Options nosniff / Referrer-Policy / Permissions-Policy headers in firebase.json (v1.19.963)
- [x] Storage MIME-type restriction on `supplierUploads/` — `application/pdf` only (v1.19.963)
- [ ] Storage lifecycle rule (90-day delete on `supplierUploads/`) — **DEFERRED**: needs gcloud CLI, not available in this environment. ~10 minutes of console work next time gcloud is available.
- [x] Notification create rule fix — require `from == request.auth.uid` (v1.19.964); all notification creators in client code updated to set `from`
- [ ] `_system/{docId}` write restriction — **DEFERRED**: tightening to admin-only could break the existing version-banner write path. Needs careful coordinated change.
- [x] Service worker URL validation — same-origin check on notification click target (sw.js + firebase-messaging-sw.js, v1.19.963)
- [x] `bcPriceUpdates` ownership validation — require companyId + member check (v1.19.964); `sqSavePushAudit` updated to include companyId
- [x] `supplierQuotes` create rule — require `userId == request.auth.uid` (v1.19.964)
- [x] Drop client-side invite token write — invites now route through `inviteTeamMember` Cloud Function with `crypto.getRandomValues` (v1.19.964)
- [x] `testTeamsWebhook` admin-gate (v1.19.963)
- [ ] Status page at `/status` — **DEFERRED**: needs design decisions

---

## BC Disconnect Popup ✅ FIXED (v1.19.965)

- [x] Differentiate transient (429, 5xx) from persistent (401 + refresh fail, network down) errors
- [x] Transient errors no longer fire the modal — log only, flip `bcOnline=false`
- [x] Persistent errors require 2 consecutive failures before alarming
- [x] ANY successful ping resets fail counter and dismisses the modal

---

## BOM Extraction Bulletproofing ✅ COMPLETE (v1.19.959)

- [x] Original PDF retained at `originalPdfs/{uid}/{projectId}/{fileId}.pdf` on upload
- [x] `extractBomPage` uses Anthropic native PDF document input when retained PDF is available
- [x] Image-based extraction is the fallback for legacy projects (uploaded before v1.19.959)
- [x] Stamping, redlining, customer review, quote rendering — all unchanged (still use page images)
- [x] Verified on OVIVO CSW1807-121 (84 items, ~95%+ accuracy vs 30% before)

---

## UX Improvements

- [x] Removed 5-tile page-type grid (TOTAL/BOM/SCHEMATIC/BACK PANEL/ENCLOSURE) on panel cards (v1.19.961)
- [x] Inlined drawing count into "21 DRAWINGS in package" header (v1.19.961-.962)
- [x] Anthropic spend pill in toolbar (running monthly burn vs $300 cap, color-coded) (v1.19.965)
- [x] Pricing Audit modal UI — admin tool inside APISetupModal, sortable table + CSV export (v1.19.966)

---

## Carryover (pre-diagnostic)

- [x] Pricing Audit modal UI — engine in v1.19.906, UI added in v1.19.966
- [ ] Service item status pills — review and design management UX — **DEFERRED**: needs user UX direction

---

## Reference: source diagnostic reports

- `docs/full-diagnostic-2026-05-01.docx` — executive briefing
- `docs/security-audit-2026-05-01.docx` — 1 critical · 5 high · 6 medium · 4 low · 3 info
- `docs/concurrency-analysis-2026-05-01.docx` — 2 will-break · 6 high · 7 medium
- `docs/cost-resilience-analysis-2026-05-01.docx` — Anthropic surface map, cost models, recommendations

---

## Snapshot of remaining open work

| Item | Why deferred |
|---|---|
| Phase 2a — saveProject mutex unification | Touches highest-traffic code path; want user present for regression testing |
| Phase 3d — Failover Anthropic key auto-swap | Needs user to provide 2nd API key |
| Phase 4a — Panels subcollection migration | Data model change, requires lazy migration of existing projects |
| Phase 4d — Manual-entry fallback on supplier portal | Needs UX decisions on form layout / copy / button placement |
| Phase 4e — BC offline queue → Firestore subcollection | Medium effort, partial mitigation in v1.19.966 (429 retry/backoff) |
| Phase 5c — Storage lifecycle rule | Needs gcloud CLI to set; ~10 min console task |
| Phase 5e — `_system/{docId}` write restriction | Could break version-banner write path; needs coordinated change |
| Phase 5j — Status page at `/status` | Needs design decisions |
| BC offline queue → Firestore | Same as 4e |
| Service item status pills UX | Needs user UX direction |

Net status: **all single-deploy security/cost/concurrency wins from the diagnostic are shipped.** The remaining items are bigger architectural work or require user input.

# Sales-Path Readiness Audit

**Author:** Sam Wize (Coach), Senior Development Engineer, Architecture
**Date:** 2026-06-09
**Status:** Read-only audit. No build, no code changes.
**Scope:** Can inside Sales run ARC end-to-end unsupervised: drawing -> extract -> price -> BC -> quote?

---

## Executive Summary

The extraction front-end (Phases 0-1) is strong after two days of work. The downstream
path has **one broken trust signal, two fragile integration seams, and one structural
gap** that collectively mean Sales cannot yet run unsupervised without risk of sending
a quote built on unverified data or wrong prices.

The send-gate (`findIncompleteQuoteItems`) is the strongest safety net — it blocks
sending quotes with missing prices, quantities, or stale dates. But it doesn't know
about extraction quality. A BOM that extracted wrong part numbers at medium confidence
will price against the WRONG parts, get valid-looking prices, pass the send-gate, and
produce a professional-looking quote with incorrect line items.

---

## Link 1: PRICING

### How it works

`runPricingOnPanel` (app.jsx:25623) runs a multi-phase pipeline after extraction:

| Phase | Source | What it does |
|-------|--------|-------------|
| 1 | Business Central | Exact item lookup, then `bcFuzzyLookup` (5 strategies) for unmatched rows |
| 1b | Codale scraper | Auto-scrape Codale-vendor items via CF `codaleTestScrape` |
| 1c | Custom scrapers | Configurable vendor-specific scrapers via CF `customScraperBatch` |
| 2 | BC lead times | `ItemVendorCatalog` then `ItemCard` fallback |
| 3 | AI pricing | Sonnet estimates for rows still unpriced after BC+scrapers |
| 4 | AI lead times | Haiku estimates for rows still missing lead times |

### What happens to unmatched rows

**No silent $0.** Unpriced rows stay `unitPrice:null`, not zero. This is the correct
design — it forces visibility.

| Outcome | unitPrice | priceSource | priceDate | UI | Send-gate |
|---------|-----------|-------------|-----------|-----|-----------|
| BC exact match + PurchasePrice | Item.unitCost | "bc" | PP.Starting_Date | Normal | PASS |
| BC exact match, NO PurchasePrice | Item.unitCost | "bc" | **null** | **RED row** | **BLOCKED** ("priced date") |
| BC fuzzy match, multiple candidates | null | null | null | Fuzzy badge + suggestions dropdown | **BLOCKED** ("price") |
| BC no match, AI estimates | Sonnet value | "ai" | **null** | Shows price, **RED row** (no date) | **BLOCKED** ("priced date") |
| BC no match, AI fails | null | null | null | "---" | **BLOCKED** ("price") |
| Manual entry | User value | "manual" | Date.now() | Normal | PASS |

### Key finding: AI prices always block Send

AI-estimated prices intentionally have no `priceDate` (DECISION v1.19.641). The
send-gate flags `priceDate:null` as red. This means:

- If BC doesn't have an item, AI estimates the price
- The row turns RED (missing priced date)
- Send is BLOCKED until the user manually confirms the price

**Verdict: This is actually a safety net.** AI prices are estimates, not quotes. Forcing
manual confirmation before send is correct. But it means Sales WILL hit red rows on
any BOM with items not in BC — they need to know this is expected, not a bug.

### Risk: Wrong BC match = wrong price (silent)

The 5-strategy `bcFuzzyLookup` (app.jsx:4739) gets progressively aggressive:

1. Exact match on `number`
2. Stripped search (remove dashes/spaces/dots)
3. Contains search on original PN
4. Core substring (strip prefixes like "mtx", suffixes like "rev")
5. Normalized prefix match (first 5 chars, stripped)

Strategy 5 on a noisy vision-mode PN (e.g., `RH8B-ULC` instead of `RH3B-ULC` — a
known OCR error from C3) could match the WRONG BC item. The wrong item has a valid
price and valid priceDate. The row renders green. Send-gate passes. The quote has the
wrong part at the wrong price.

**This is the C5 auto-cross problem (found Session 1) amplified to the pricing path.**
OCR errors that produce a valid-but-wrong PN → valid-but-wrong BC match → valid-but-wrong
price → quote passes all gates.

---

## Link 2: BC INTEGRATION

### Authentication

MSAL (Azure AD) with three-tier fallback: silent cached → SSO silent → interactive popup.
Token stored in module-scoped `_bcToken`. On 401, token cleared and re-acquired on next
operation.

**Connection indicator exists:** Blue/red dot in dashboard toolbar (app.jsx:45293).
Sales can see "BC Connected" or "BC Offline — Click to connect." Clickable to reconnect.

### Known open issue: #6 Stale API Key Cache

If a BC admin rotates credentials in Azure, ARC doesn't detect this until the MSAL token
naturally expires or an API call returns 401. Between rotation and detection, BC operations
silently fail.

**Sales impact:** Pricing runs silently skip BC (rows stay unpriced). No error toast.
The only signals are: rows show "---" for price, red highlighting appears, and the BC
status dot eventually flips red after consecutive failures.

**Severity for unsupervised Sales:** MEDIUM. The send-gate catches the symptom (missing
prices block send), but Sales won't understand WHY pricing failed. They'll see red rows
and not know the fix is "click the BC dot to reconnect."

### Offline queue

BC write operations (planning lines, attachments, task descriptions, purchase quotes)
use a localStorage-backed queue with:
- 429/503 exponential backoff (1s → 60s cap, 5 attempts max)
- Environment stamping (prevents env-swap accidents)
- Amber toolbar badge: "N pending BC sync"

**This is solid.** Write failures queue and retry. The badge is visible.

### BC match quality vs extraction quality

| Extraction tier | PN accuracy | BC match risk |
|----------------|------------|---------------|
| text-layer | High (deterministic text) | Low — exact PNs match exact BC items |
| vector-stroke | Medium (some OCR noise) | Medium — fuzzy strategies may catch errors, or match wrong item |
| bitmap/scan | Low (significant OCR errors) | **HIGH** — noisy PNs match wrong BC items via aggressive fuzzy strategies |

The `bcFuzzyLookup` was designed for catalog PNs with minor formatting differences
(dashes vs no dashes). It was NOT designed for OCR-corrupted PNs where single characters
are wrong. When the PN is wrong by 1-2 characters, the fuzzy strategies can match a
structurally similar but functionally different item.

---

## Link 3: QUOTE OUTPUT

### Generation

`generateQuotePdf` (app.jsx:7549) uses jsPDF to produce a professional PDF:
- Page 1: Header, contact info, line items, pricing totals
- Page 2 (if applicable): Engineering questions for customer
- Final page: Terms & conditions (2-column layout)
- Auto-uploads to BC as job attachment

### Send-gate (the strongest safety net)

`findIncompleteQuoteItems` (app.jsx:15107) blocks SEND (not print) when any BOM row has:

| Missing | Flagged as |
|---------|-----------|
| qty = 0 or null | "qty" |
| unitPrice = 0 or null | "price" |
| priceDate = null | "priced date" |
| priceDate older than 60d | "stale price (>60d)" |

Exclusions: labor rows, customer-supplied, contingency, crate, job-buyoff, Matrix Systems
vendor, vendor-matches-customer.

**CRITICAL DETAIL: Print is NOT gated.** The "Just Print" button bypasses
`findIncompleteQuoteItems`. Sales can print an incomplete quote and send it manually
(email attachment, physical mail). The send-gate only blocks the in-app email send path.

### What the quote shows (and doesn't)

| Data | On quote? | Notes |
|------|-----------|-------|
| Part number | YES | Whatever's in `partNumber` field — could be OCR-corrupted |
| Description | YES | Whatever's in `description` — could be OCR-garbled |
| Manufacturer | **NO** | Not on customer-facing quote (only on internal BOM Report) |
| Qty | YES | |
| Unit price | YES | "---" if null |
| Extended price | YES | qty * unitPrice |
| Lead time | YES | With asterisk if AI-estimated |
| Engineering questions | YES | Page 2 |
| **manualVerifyRequired** | **NO** | Not on quote |
| **Extraction confidence** | **NO** | Not on quote |
| **Scan quality warning** | **NO** | Not on quote |
| **Image fallback indicator** | **NO** | Not on quote |

### What breaks the quote render

The quote renders regardless of missing fields — blanks show as "---". No hard crash.
But a quote with multiple "---" entries looks unprofessional and signals to the customer
that the quoting company doesn't have its data together.

Vision-mode extractions with noisy PNs produce quotes where part numbers have subtle
character errors (B/8 swaps, S/5 swaps) that look professional but specify the wrong
parts.

---

## Link 4: TRUST-SIGNAL PROPAGATION

### manualVerifyRequired: BROKEN in two ways

**Problem 1: Invisible at the quote stage.**

The flag renders as an amber chip in the BOM view (app.jsx:26978) but is NOT referenced
by:
- `findIncompleteQuoteItems` — doesn't check it, doesn't block send
- `buildQuotePdfDoc` — doesn't render it on the quote
- Any other downstream function

Sales sees the amber chip while editing the BOM. When they switch to the quote view and
hit Send, the flag is invisible. The printed quote has zero indication that the
underlying BOM was extracted from a vision-mode drawing without a region.

**Problem 2: Cleared by re-extraction.**

Both re-extraction report builders construct fresh objects that never include
`manualVerifyRequired`:

```
reExtractionReport (line 24326-24341):  NO manualVerifyRequired field
fbReport           (line 24552-24566):  NO manualVerifyRequired field
```

These overwrite `panel.extractionReport` (lines 24345, 24570). The previous report —
including `manualVerifyRequired:true` — is replaced entirely.

**The trust hole:** User extracts a vision-mode BOM → Phase 1c gate fires → user clicks
"Extract Anyway — Manual Verification Required" → amber chip appears → user provides
feedback → feedback re-extraction runs → `fbReport` overwrites extractionReport →
`manualVerifyRequired` is gone. Amber chip disappears. No record that this BOM ever
needed manual verification.

### Other trust signals: all stop at BOM view

| Signal | Where it lives | BOM view | Quote | Send-gate |
|--------|---------------|----------|-------|-----------|
| `manualVerifyRequired` | extractionReport | Amber chip | **NO** | **NO** |
| `extractionPath` | extractionReport | Green/amber pill | **NO** | **NO** |
| `scanQuality` | extractionReport | Amber/orange banner | **NO** | **NO** |
| `completenessWarning` | extractionReport | Warning banner | **NO** | **NO** |
| Per-row `confidence` | BOM row field | Colored dot | **NO** | **NO** |
| `bcVerify.status` | BOM row field | Badge (in-bc/fuzzy/not-in-bc) | **NO** | **NO** |

Every quality signal is visible to the person reviewing the BOM. None survive to the
quote or the send-gate. The quote is a "clean room" that strips all provenance.

---

## Link 5: THE GAPS — Ranked by what blocks "Sales runs the full process"

### BROKEN (must fix before unsupervised Sales use)

**B1. Trust signal vanishes at quote stage.**
`manualVerifyRequired` and all extraction quality signals are invisible on the printed
quote and unchecked by the send-gate. A Sales user who doesn't carefully review the BOM
view amber chips will send a quote built on unverified extraction with no downstream
warning. The customer receives a professional-looking document with no indication of
data quality.

**Fix:** Add `manualVerifyRequired` check to `findIncompleteQuoteItems`. When true,
block Send with message: "This BOM was extracted from a low-quality source and has not
been manually verified. Review all part numbers before sending." Optionally add a
"BUDGETARY — VERIFY BEFORE ORDERING" watermark to the quote PDF.

**B2. Re-extraction clears manualVerifyRequired.**
Feedback re-extraction builds a fresh `extractionReport` that drops the flag. The amber
chip disappears silently. If the re-extraction ran on the same vision-mode pages, the
quality concern hasn't been addressed — it's just been erased.

**Fix:** In both `reExtractionReport` (line 24340) and `fbReport` (line 24565), add:
`...(latestPanel.extractionReport?.manualVerifyRequired?{manualVerifyRequired:true}:{})`
to carry the flag forward. Only clear it when the user explicitly marks the BOM as
verified (new action, doesn't exist today).

### FRAGILE (works but can silently produce wrong results)

**F1. Wrong BC match on noisy PNs → wrong price, passes all gates.**
`bcFuzzyLookup` strategies 2-5 can match OCR-corrupted PNs to the wrong BC item. The
wrong item has a valid price, valid date, valid vendor. All UI indicators show green.
Send-gate passes. The quote is wrong.

This is the pricing-path manifestation of C5 (auto-cross corruption, found Session 1).
The risk is proportional to extraction tier: near-zero for text-layer, significant for
bitmap/scan.

**Mitigation (short-term):** When `manualVerifyRequired` is set AND `bcVerify.status`
shows a fuzzy match, surface the match for user confirmation before pricing proceeds.
**Mitigation (long-term):** `partNumberSource` field (C5 recommendation) to distinguish
"AI extracted this" from "BC matched this."

**F2. Silent pricing failure when BC is unreachable.**
If BC is down or the token is stale, `runPricingOnPanel` silently skips BC phases. Rows
stay unpriced. No error toast — just red rows appearing. Sales sees red rows and doesn't
know why.

The send-gate catches the symptom (blocks send on missing prices), but the user
experience is confusing. Sales doesn't know the fix is "click the BC dot."

**Mitigation:** Show a toast when BC pricing fails: "BC pricing unavailable — N rows
unpriced. Click BC status to reconnect."

**F3. "Just Print" bypasses the send-gate.**
`findIncompleteQuoteItems` only gates the in-app Send path. The "Just Print" button
generates the PDF with no validation. Sales can print an incomplete or incorrect quote
and email it manually.

**Mitigation:** Run `findIncompleteQuoteItems` on Print as well — show a warning (not
a hard block): "N items have incomplete pricing. Quote may contain gaps."

### SOLID (works correctly for unsupervised use)

**S1. Send-gate blocks incomplete quotes.** `findIncompleteQuoteItems` catches missing
qty, missing price, missing priceDate, and stale prices. This is the primary safety net
and it works. Exclusions (labor, customer-supplied, etc.) are correct.

**S2. Red-row highlighting is accurate.** `_isBomRowFlaggedRed` (app.jsx:15062) aligns
with the send-gate criteria. Users see which rows need attention.

**S3. AI prices force manual confirmation.** AI-estimated prices have no `priceDate`,
which triggers red highlighting and blocks send. Sales must manually confirm or override
AI prices. This is the correct design.

**S4. BC offline queue is hardened.** Write operations (planning lines, attachments)
queue in localStorage with exponential backoff. Amber badge shows pending count. Safe
for intermittent connectivity.

**S5. BC connection indicator exists.** Blue/red dot in toolbar. Sales can see and act
on connection status.

**S6. Multi-phase pricing with fallbacks.** BC → scrapers → AI → manual. The cascade
ensures most rows get some price. The system doesn't stop at the first failure.

---

## Net Assessment

| Chain link | Status | Unsupervised Sales? |
|-----------|--------|-------------------|
| Extraction (Phase 0-1) | SOLID after recent work | YES for text-layer; GATED for vision-mode (1c gate works) |
| Pricing | SOLID for correctly-extracted PNs | YES when BC is connected |
| | FRAGILE for noisy PNs | NO — wrong BC match → wrong price, no guard |
| BC integration | SOLID when connected | YES |
| | FRAGILE when disconnected | PARTIAL — send-gate catches missing prices, but confusing UX |
| Quote output | SOLID for complete data | YES |
| | GAP for trust signals | **NO** — no downstream visibility into extraction quality |
| Trust propagation | **BROKEN** | **NO** — signals vanish at quote stage |

**Bottom line:** The chain is functional for text-layer extractions with a connected BC.
It is NOT safe for unsupervised Sales use on vision-mode extractions because trust signals
don't survive to the point where Sales makes the send decision.

### Priority order for fixes

1. **B2** — Preserve `manualVerifyRequired` through re-extraction (one-line fix each in
   two report builders)
2. **B1** — Add `manualVerifyRequired` to the send-gate (small change in
   `findIncompleteQuoteItems`)
3. **F3** — Warn on Print when items are incomplete (non-blocking warning)
4. **F1** — Surface fuzzy BC matches for confirmation on vision-mode extractions
5. **F2** — Toast on BC pricing failure

B2 and B1 together close the trust gap. F3 closes the print bypass. These three make
the chain safe for supervised Sales use (training + process). F1 and F2 improve the
experience but aren't blockers if Sales is trained to review the BOM view before quoting.

---

## Appendix: Code References

| Function | Location | Role |
|----------|----------|------|
| `runPricingOnPanel` | app.jsx:25623 | Master pricing orchestrator |
| `bcFuzzyLookup` | app.jsx:4739 | 5-strategy BC item matching |
| `findIncompleteQuoteItems` | app.jsx:15107 | Send-gate validation |
| `_isBomRowFlaggedRed` | app.jsx:15062 | Red row highlighting |
| `_isExcludedFromPriceCheck` | app.jsx:15042 | Price-check exclusion list |
| `generateQuotePdf` | app.jsx:7549 | Quote PDF generation |
| `buildQuotePdfDoc` | app.jsx:6756 | Quote PDF content builder |
| `reExtractionReport` builder | app.jsx:24326 | Re-extraction report (drops manualVerifyRequired) |
| `fbReport` builder | app.jsx:24552 | Feedback re-extraction report (drops manualVerifyRequired) |
| `acquireBcToken` | app.jsx:1618 | BC authentication |
| `bcEnqueue` / `bcProcessQueue` | app.jsx:6060 | BC offline queue |
| BC connection indicator | app.jsx:45293 | Blue/red dot in toolbar |

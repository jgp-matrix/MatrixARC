# F014(B) — Reading per-customer payment terms from BC — research findings

> **Lane:** Marc (dev research subagent) · **Date:** 2026-07-11 · **Mode:** read-only research (away-mode subagent fleet)
> **Status:** research complete — awaiting a Jon design ruling before any build (see §4). Not blocking; F014 is queue item #2.

## Headline
**ARC already reads a per-customer payment-terms field from BC today.** The plumbing is live in `src/app.jsx`. F014(B) is not greenfield — it is a "surface / broaden what we already fetch" task, with one real design fork (§4).

## 1. BC entity + field (confirmed against this codebase)
ARC uses **standard BC API v2.0** (not a custom extension):
- `BC_API_BASE` = `https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env}/api/v2.0` — `src/app.jsx:353`.
- Standard `customers` entity exposes **`paymentTermsId`** (GUID) — in use at `src/app.jsx:7941`.
- GUID resolves to human-readable `code`/`displayName` (e.g. "Net 30 Days", "2% 10 Net 30") via the standard **`paymentTerms({id})`** entity — `src/app.jsx:7947-7948`.

→ "Does BC expose a per-customer payment-terms field ARC can read?" **Yes, and ARC already reads it.**

## 2. Project → BC customer mapping (already stored, no new lookup)
- `project.bcCustomerNumber` + `project.bcCustomerName` are persisted on every BC-linked project (`src/app.jsx:1616`, `10157`; also in archive/copy/restore).
- Two-hop fetch as currently coded in `ensureQuoteFieldsPopulated` (`src/app.jsx:7937-7958`):
  1. `GET .../companies({compId})/customers?$filter=number eq '{custNo}'&$select=number,paymentTermsId,shipmentMethodId` → `paymentTermsId`.
  2. `GET .../companies({compId})/paymentTerms({paymentTermsId})` → `code`/`displayName`.
- `compId` from `bcGetCompanyId()`. Current code derives customer No. from the **project card** (`bc.Bill_to_Customer_No || bc.Sell_to_Customer_No`), but `project.bcCustomerNumber` holds the same value directly on the project — a cleaner entry point that avoids the project card entirely.

## 3. Where a fetch slots in — mirror existing patterns
- **Canonical pattern:** `ensureQuoteFieldsPopulated(project, uid)` (`src/app.jsx:7843`) — refreshes BC token (`acquireBcToken(false)`), routes via `bcGatedFetch` (offline queue + G005 write-gate; GETs are read-safe), tries project-card fields first (`CCS_Payment_Terms_Code`/`Payment_Terms_Code`) then falls back to customer-card `paymentTermsId` resolution, writes to `autoFields.paymentTerms` → `q.paymentTerms` → quote PDF (`q.paymentTerms||"---"`).
- **Per-customer defaults precedent:** `_loadCustomerValidity(bcCustomerNumber)` (`src/app.jsx:2159`) reads `companies/{companyId}/customerDefaults/{bcCustomerNumber}` for per-customer quote-validity days; `resolveQuoteValidityDays` (`src/app.jsx:2145`). If F014 wants an ARC-editable per-customer terms **default** (BC-seeded, overridable), `customerDefaults/{bcCustomerNumber}.paymentTerms` is the natural home — mirror these exactly.
- Also relevant: `bcLookupCustomer` direct-by-number lookup (`src/app.jsx:4211`).

## 4. ⭐ OPEN DECISION for Jon (fold into F014 kickoff — not blocking today)
The build differs significantly depending on what F014(B) actually wants:
- **(a) Live BC read on demand** — *already exists* in the quote-populate flow. Work = extend its reach (remove the project-card / `bcProjectNumber` dependency so terms populate for any BC-linked project, not just those with a project card + live token).
- **(b) Cached, ARC-editable per-customer default, BC-seeded** — *new*, but has a clean precedent (`customerDefaults` + `_loadCustomerValidity`). This is the option that actually **eliminates hand-entry across all entry points** and survives BC being disconnected.

Recommendation to carry into kickoff: **(b)** most directly satisfies the F014 intent ("ARC reads it, not hand-entered"), with (a)'s live read as the seed.

## 5. Gaps / notes
- Current path only runs in quote-populate, gated by `needsBcFetch` + requires `project.bcProjectNumber` + live token (`src/app.jsx:7868-7869`); no BC link / disconnected → blank terms (flagged as error per the #117 ruling, never defaulted).
- No caching / no per-customer override UI today — every populate is a fresh 2-call round-trip.
- **Robustness:** project-card `CCS_`-prefixed custom fields vary across BC configs and can 400 on `$select` (`src/app.jsx:7874-7876`); the **standard `customers`/`paymentTerms` v2.0 entities are stable**, so a customer-card-only path is *more* robust than the project-card path.
- Active env is `MATR_SndBx_01152026` (sandbox); reads are safe (G005 gate only no-ops mutations) but sandbox customer master may differ from prod.

**Key refs:** `src/app.jsx:7843-7960` (populate + terms resolution), `:2145-2166` (per-customer defaults precedent), `:342-360` (BC config/base URLs), `:4211` (`bcLookupCustomer`).

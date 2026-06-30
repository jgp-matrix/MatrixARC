# #175 Detailed Plan — RFQ Lead-Time Visibility (FULL RED)

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** READY FOR APPROVAL
**Builds on:** C119 scope trace (`docs/175-SUPPLEMENT.md`)
**Decision locked:** FULL RED — missing firm lead time → same red as missing price
**Tip:** master `aba4c6e7`

---

## Overview

Three changes, ~5 lines total. One new shared helper, one new condition in the row-color
predicate, one inline predicate deletion/replacement. The guarantee: after this change,
`_isBomRowFlaggedRed` and `_eligibilityReason` both call `_hasFirmLeadTime(r)` — one
definition, two consumers, no duplicate predicate anywhere.

---

## §1 — New shared helper: `_hasFirmLeadTime`

**Location:** `src/app.jsx`, insert immediately BEFORE `_isBuyoffOrCrate` (line 15747).
Placing it in the same cluster as the other row-classification helpers (`_isBuyoffOrCrate`,
`_isExcludedFromPriceCheck`, `_vendorMatchesCustomer`, `_isBomRowFlaggedRed`).

```js
function _hasFirmLeadTime(r){
  return r.leadTimeDays!=null&&r.leadTimeSource&&r.leadTimeSource!=="ai";
}
```

Pure predicate. No project context, no customer context, no side effects. Returns `true`
for any row with a non-null `leadTimeDays` AND a source that is NOT `"ai"` AND NOT absent.

Firm sources (all return `true`): `bc_vendor`, `bc_item`, `supplier`, `scraper`, `manual`.
Non-firm (return `false`): `"ai"`, `undefined`/absent, or `leadTimeDays===null`.

---

## §2 — SINGLE DEFINITION: delete inline `isFirmLT`, replace with shared helper

**Location:** `src/app.jsx`, line 6337–6338 inside `_eligibilityReason` (line 6314).

**Before:**
```js
    const isFirmLT=r.leadTimeDays!=null&&r.leadTimeSource&&r.leadTimeSource!=="ai";
    if(!isFirmLT)return "missingLeadTime";
```

**After:**
```js
    if(!_hasFirmLeadTime(r))return "missingLeadTime";
```

**LOAD-BEARING STEP — the single-definition guarantee.**

The inline `const isFirmLT=...` is the ONLY definition of this predicate in the entire
codebase (confirmed: grep for `isFirmLT` returns exactly one definition at line 6337 and
one use at line 6338; grep for `leadTimeSource!=="ai"` returns only line 6337). After this
change, no inline firm-lead-time predicate exists anywhere — both the RFQ path and the
row-color path call `_hasFirmLeadTime(r)`. Any future change to what "firm" means happens
in one place.

**Pre-deploy verification (Marc):** After applying §1+§2+§3, grep for:
- `isFirmLT` — must return ZERO hits
- `leadTimeSource!=="ai"` — must return ZERO hits in predicate context (the
  `leadTimeSource==="ai"` comparisons in italic/tooltip rendering are fine — those are
  the OPPOSITE check, testing whether to show the asterisk, not whether the lead time
  is firm)

---

## §3 — Add COND 4 to `_isBomRowFlaggedRed`

**Location:** `src/app.jsx`, line 15776–15780 (`_isBomRowFlaggedRed` function body).

**Before (lines 15776–15781):**
```js
  if(!_isExcludedFromPriceCheck(r)&&!vendorIsCustomer){
    if(!r.priceDate)return true;
    const staleMs=((_pricingConfig&&_pricingConfig.defaultStaleDays)||60)*24*60*60*1000;
    if((Date.now()-r.priceDate)>staleMs)return true;
  }
  return false;
```

**After:**
```js
  if(!_isExcludedFromPriceCheck(r)&&!vendorIsCustomer){
    if(!r.priceDate)return true;
    const staleMs=((_pricingConfig&&_pricingConfig.defaultStaleDays)||60)*24*60*60*1000;
    if((Date.now()-r.priceDate)>staleMs)return true;
    if(!_hasFirmLeadTime(r))return true;
  }
  return false;
```

One line added: `if(!_hasFirmLeadTime(r))return true;`

COND 4 inherits the SAME exclusion gate as COND 3 (`!_isExcludedFromPriceCheck(r) &&
!vendorIsCustomer`). See §4 below for the full exclusion-gate analysis.

---

## §4 — EXCLUSION-GATE CONFIRM

### What `_isExcludedFromPriceCheck` excludes (line 15751–15753)

| Row type | How excluded | Lead time expected? | Red for no LT? |
|----------|-------------|---------------------|-----------------|
| `isLaborRow` | `r.isLaborRow` | No — labor is hours, not procurement | Correctly excluded |
| `customerSupplied` | `r.customerSupplied` | No — customer provides the item | Correctly excluded |
| `isContingency` | `r.isContingency` | No — contingency is a cost buffer | Correctly excluded |
| Matrix Systems vendor | `/matrix\s*systems/i.test(r.bcVendorName)` | No — internal vendor | Correctly excluded |
| Buyoff/Crate | `_isBuyoffOrCrate(r)` | No — utility/administrative rows | Correctly excluded |

Additionally, COND 4 is inside the `!vendorIsCustomer` guard: rows where the BC vendor
matches the project customer are excluded (customer-furnished items have no supplier lead
time to track).

**Verdict:** Every row type that shouldn't be red for "no lead time" is excluded by the
inherited gate. No false-positive reds on non-procured rows.

### Comparison with `_eligibilityReason` exclusions (line 6314–6317)

| Exclusion | `_eligibilityReason` (RFQ) | `_isExcludedFromPriceCheck` (row color) | Match? |
|-----------|---------------------------|----------------------------------------|--------|
| Labor | `r.isLaborRow` | `r.isLaborRow` | ✓ |
| Manual price source | `r.priceSource==="manual"` | — | RFQ-only |
| Contingency | `r.isContingency \|\| CONTINGENCY_PNS` | `r.isContingency` | RFQ adds PN set |
| Buyoff/Crate | `RFQ_EXCLUDE_ITEMS` regex | `_isBuyoffOrCrate(r)` | Both cover, diff mechanism |
| DIN rail/Duct | `RFQ_EXCLUDE_ITEMS` regex | — | RFQ-only |
| Customer-supplied | — | `r.customerSupplied` | Row-color-only |
| Matrix Systems | — | `bcVendorName` regex | Row-color-only |
| Vendor = customer | — | `!vendorIsCustomer` guard | Row-color-only |

### Divergences and assessment

**A. `priceSource==="manual"` (RFQ excludes, row-color does NOT):**
A manually-priced row with no firm lead time WILL turn red. This is CORRECT — a manual
price doesn't imply known delivery. The row is red for lead-time reasons; the RFQ won't
pull it because the manual-price exclusion fires first (before the lead-time check). The
guarantee holds: "not red" ⇒ "won't be RFQ'd for lead time."

**B. DIN rail / Duct (RFQ excludes, row-color does NOT):**
DIN rail and duct items without firm lead times WILL turn red. These are bulk consumables
excluded from RFQs but not from price checks. A red DIN rail row means "no firm lead
time" — technically correct but likely noise (these items are cut-to-length from stock,
lead time is irrelevant). However: the guarantee still holds ("not red" ⇒ "won't be
RFQ'd"). The red is wrong-looking but harmless. **Recommendation: LOG AS FOLLOW-UP, do
NOT fix in this scope.** Fixing it means widening `_isExcludedFromPriceCheck` or adding
a separate lead-time exclusion, both of which change price-check behavior too. A future
#176 can add a `_isExcludedFromLeadTimeCheck` if the noise is unacceptable. Logged below.

**C. `CONTINGENCY_PNS` set (RFQ tests PN set, row-color uses `isContingency` flag):**
Benign — `isContingency` is set on rows that match `CONTINGENCY_PNS`, and vice versa.
The two mechanisms agree. `CONTINGENCY_PNS` also includes legacy PNs ("BOM CONTINGENCY",
"WIRE & CONSUMABLES") which carry `isContingency` from prior extraction. No gap.

**D. `customerSupplied` / Matrix Systems / vendor=customer (row-color excludes, RFQ does NOT):**
These rows never reach the RFQ's lead-time check because the RFQ function
(`buildRfqSupplierGroups`) operates on a BOM filtered by `_eligibilityReason`, and
customer-supplied rows pass through (not excluded by `_eligibilityReason`'s early returns).
But in practice, customer-supplied rows with no vendor assignment won't group into any RFQ
supplier bucket. No guarantee violation.

### Guarantee statement

**Direction: row-color ⊇ RFQ for lead-time flagging.** Every row the RFQ would flag for
`missingLeadTime` will also be red. Some rows may be red but NOT RFQ'd (manual-price,
DIN rail/duct). This is the safe direction — "not red" always means "won't be RFQ'd for
lead time." The guarantee is intact.

---

## §5 — Regression surface

### Direct consumers of `_isBomRowFlaggedRed`

| Consumer | Line | Impact |
|----------|------|--------|
| BOM table row background | 28715 | **INTENDED** — new red rows for non-firm lead times |

Single call site. No print path, no PDF path, no export.

### Aligned consumer: `findIncompleteQuoteItems` (line 15816)

Mirrors `_isBomRowFlaggedRed`'s logic independently for the quote-send gate + pre-print
checklist. Does NOT call `_isBomRowFlaggedRed`. Currently checks qty/price/priceDate only.
**NOT touched by this plan.** Lead-time send-gating is a separate decision (currently
handled by `_countAiLeadTimes` → `_markProjectBudgetaryForAiLeads` auto-stamp).

### Consumers of `leadTimeSource`

| Consumer | Lines | Impact |
|----------|-------|--------|
| Lead-time cell rendering (italic/asterisk) | 29099 | NONE — reads `==="ai"`, unaffected |
| Lead-time tooltip | 29937 | NONE — reads `==="ai"`, unaffected |
| `_countAiLeadTimes` / `_hasAiLeadTimes` | 1537, 1542 | NONE — reads `==="ai"`, unaffected |
| `_markProjectBudgetaryForAiLeads` | 1545 | NONE — independent path |
| Pre-print checklist AI-lead entry | 37379 | NONE — reads `_countAiLeadTimes`, unaffected |
| Pricing skip guards | 15112, 27083–27085 | NONE — reads `==="supplier"`, `==="manual"` |
| Lead-time drivers signature | 37006 | NONE — reads field, doesn't flag |
| Portal apply / SQ upload stamping | 31613, 37832, 38750 | NONE — writes, doesn't read for flagging |
| `commitBcItem` bc_item stamp | 26486 | NONE — writes, doesn't read for flagging |
| Manual edit stamp | 26169 | NONE — writes, doesn't read for flagging |
| AI estimate stamp | 15153, 27387 | NONE — writes, doesn't read for flagging |

### Consumer of the line-6337 predicate

| Consumer | Line | Impact |
|----------|------|--------|
| `_eligibilityReason` | 6337 | REFACTORED — inline deleted, shared helper called. Identical logic. |

No other consumer. The `isFirmLT` variable was local to `_eligibilityReason`.

### Net regression risk

**ZERO behavioral regression.** One visual change (new red rows) is the entire intended
effect. All other lead-time consumers are independent read paths that don't use
`_isBomRowFlaggedRed` or the `isFirmLT` predicate.

---

## §6 — Follow-up item (NOT in this scope)

**#176 — DIN rail / duct red-row noise.** DIN rail and duct items without firm lead times
will turn red after #175. These are bulk consumables sourced internally — lead time is
irrelevant. The RFQ correctly excludes them (via `RFQ_EXCLUDE_ITEMS`), so the guarantee
holds, but the red is wrong-looking. Fix: either widen `_isExcludedFromPriceCheck` to
include DIN rail/duct (changes price-check behavior — may be undesirable), or introduce
a separate `_isExcludedFromLeadTimeCheck` predicate. Jon decides priority after observing
the visual impact post-deploy.

---

## Test criteria

| # | Test | Method | Expected |
|---|------|--------|----------|
| T1 | AI-lead-time row turns red | Open PRJ402096 or any project with `leadTimeSource:"ai"` rows. Row background should be `rgba(255,40,40,0.35)`. | Red bg visible |
| T2 | Firm-lead-time row stays white/zebra | Same project, rows with `leadTimeSource:"bc_vendor"` or `"supplier"`. Background should be transparent or zebra stripe. | No red |
| T3 | No-lead-time row (null) turns red | Any row with `leadTimeDays:null` and not excluded. | Red bg visible |
| T4 | Labor row unaffected | Labor rows should remain `#0a1628` (dark blue). | No red |
| T5 | Customer-supplied row unaffected | CustomerSupplied row with no lead time. | No red |
| T6 | Contingency row unaffected | Contingency row with no lead time. | No red |
| T7 | Buyoff/Crate row unaffected | JOB BUYOFF or CRATE row with no lead time. | No red |
| T8 | Vendor=customer row unaffected | Row where `bcVendorNo` matches `project.bcCustomerNumber`. | No red |
| T9 | RFQ eligibility unchanged | Open RFQ modal — same rows selected as before. | No change |
| T10 | Existing price-red rows unchanged | Row with `unitPrice:0` or stale priceDate — still red. | Still red |
| T11 | No duplicate predicate | `grep isFirmLT src/app.jsx` → 0 hits. `grep 'leadTimeSource!=="ai"' src/app.jsx` → 0 hits in predicate context. | Zero hits |

---

## Implementation sequence

1. Marc applies §1 (new helper), §2 (delete inline, replace), §3 (add COND 4) in a
   single commit.
2. Marc runs T11 (grep verification) before committing.
3. Deploy via `deploy.sh`.
4. Marc + Jon run T1–T10 against deployed build.
5. Coach verifies committed diff matches plan.

**Total: ~5 lines changed in `src/app.jsx`. One commit. One deploy.**

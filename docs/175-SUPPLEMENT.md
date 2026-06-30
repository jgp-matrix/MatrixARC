# #175 Supplement — RFQ Lead-Time Visibility: Scope Trace

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** SCOPE COMPLETE — feeds Detailed Plan
**Tip:** master (read-only trace, no code changes)
**Decision locked:** FULL RED — missing firm lead time flags red, identical to missing price.

---

## 1. ROW-COLOR SOURCE

### Function: `_isBomRowFlaggedRed` — confirmed name + location

**Line 15771** of `src/app.jsx`. Name is current and accurate.

```js
function _isBomRowFlaggedRed(r, customerNo, customerName) {
  if (!r || r.isLaborRow) return false;
  const vendorIsCustomer = _vendorMatchesCustomer(r.bcVendorNo, r.bcVendorName, customerNo, customerName);
  if (!r.customerSupplied && +r.qty === 0) return true;                         // COND 1
  if (!r.customerSupplied && !vendorIsCustomer && +r.unitPrice === 0) return true; // COND 2
  if (!_isExcludedFromPriceCheck(r) && !vendorIsCustomer) {                     // COND 3
    if (!r.priceDate) return true;
    const staleMs = ((_pricingConfig && _pricingConfig.defaultStaleDays) || 60) * 86400000;
    if ((Date.now() - r.priceDate) > staleMs) return true;
  }
  return false;
}
```

### Current conditions (any one → red)

| # | Condition | Exclusions | Comment |
|---|-----------|------------|---------|
| 1 | `qty === 0` | labor, customerSupplied | Zero-qty row |
| 2 | `unitPrice === 0` | labor, customerSupplied, vendor=customer | Zero-price row |
| 3 | `priceDate` missing OR older than `defaultStaleDays` (60d) | `_isExcludedFromPriceCheck(r)` + vendor=customer | Stale or un-priced |

### `_isExcludedFromPriceCheck` (line 15751)

Excludes: `isLaborRow`, `customerSupplied`, `isContingency`, `bcVendorName` matching `matrix systems`, `_isBuyoffOrCrate(r)`.

### Single call site

`_isBomRowFlaggedRed` is called from **exactly one location**: the BOM table row background at **line 28715**. No print path, no PDF path, no export, no other UI surface reads it. The function is purely a visual-flag predicate for the interactive BOM table.

### Downstream alignment: `findIncompleteQuoteItems` (line 15816)

This function mirrors `_isBomRowFlaggedRed`'s logic to build the quote-send gate and pre-print checklist. It independently checks qty=0, unitPrice=0, priceDate missing/stale — with the same exclusions. It does NOT currently check lead-time state. Adding a lead-time condition to `_isBomRowFlaggedRed` without also adding it to `findIncompleteQuoteItems` would create a visual/gate divergence: a row could be red in the BOM but not flagged in the Send gate. **This is an intentional scope decision** — see §4 below.

---

## 2. LEAD-TIME STATE ON A ROW

### Fields per BOM row

| Field | Type | Purpose |
|-------|------|---------|
| `leadTimeDays` | `number \| null` | Days to delivery. `null` = no data. |
| `leadTimeSource` | `string \| undefined` | How the value was obtained. |
| `leadTimeUpdatedAt` | `number (ms) \| undefined` | Timestamp of last update. |
| `leadTimeEstimated` | `boolean` | Legacy flag; current code uses `leadTimeSource==="ai"` instead. |

### `leadTimeSource` values (exhaustive, from code)

| Value | Set at | Firm? | Description |
|-------|--------|-------|-------------|
| `"bc_vendor"` | line 27104 (pricing), line 15124 (bg pricing) | YES | BC ItemVendorCatalog — vendor-specific lead time |
| `"bc_item"` | line 27108, 26486 (commitBcItem), 15125 | YES | BC ItemCard — generic item lead time |
| `"supplier"` | line 31613 (portal apply), 37832 (SQ upload), 38750 | YES | Supplier portal submission or uploaded quote |
| `"scraper"` | line 27176, 27290 | YES | Codale/custom web scraper |
| `"manual"` | line 26169 | YES | User typed a value in the lead-time cell |
| `"ai"` | line 15153, 27387 | **NO** | AI estimate — the only non-firm source |
| `undefined`/absent | initial state | **NO** | No lead-time data at all |

**Key observation:** The firm/non-firm split is binary: everything except `"ai"` and `undefined` is firm. The RFQ predicate `isFirmLT = leadTimeDays != null && leadTimeSource && leadTimeSource !== "ai"` captures this exactly.

### Existing visual treatment (BOM table lead-time cell, line 29090–29114)

- AI estimates render in **italic** with an **asterisk** suffix and **muted color** (`C.muted`).
- Firm values render in normal weight with `C.text` color.
- Stale lead times (older than `defaultStaleDays`) get a `~` prefix.
- A tooltip (line 29930) shows source label, age, and stock info.

**No row-level background color is currently driven by lead-time state.** The lead-time cell has per-cell styling (italic/muted) but the row background (`rowBg` at 28715) is entirely price/qty-driven.

---

## 3. PREDICATE CONFIRMATION

### RFQ firm-lead-time predicate

**Confirmed at line 6337** inside `_eligibilityReason` (line 6314):

```js
const isFirmLT = r.leadTimeDays != null && r.leadTimeSource && r.leadTimeSource !== "ai";
if (!isFirmLT) return "missingLeadTime";
```

Line numbers current against master tip.

### Is this the right predicate to share?

**YES — with one scoping note.** The predicate is clean and captures the exact binary split from §2. However, the EXCLUSION sets differ between the two consumers:

| Consumer | Exclusion set |
|----------|---------------|
| `_eligibilityReason` (RFQ) | `isLaborRow`, `priceSource==="manual"`, `isContingency`, `CONTINGENCY_PNS`, `RFQ_EXCLUDE_ITEMS` (regex on desc/PN) |
| `_isBomRowFlaggedRed` (row color) | `isLaborRow`, `customerSupplied` (conds 1+2); `_isExcludedFromPriceCheck` (cond 3) = labor + customerSupplied + contingency + matrix systems + buyoff/crate |

The firm-LT predicate itself (`isFirmLT`) is **orthogonal to the exclusions** — it answers "does this row HAVE a firm lead time?" without caring who's asking. The exclusion logic stays in each caller. This is the correct factoring:

```
Shared helper:  _hasFirmLeadTime(r) → boolean
                  = r.leadTimeDays != null && r.leadTimeSource && r.leadTimeSource !== "ai"

_isBomRowFlaggedRed:  ... || (!_isExcludedFromPriceCheck(r) && !vendorIsCustomer && !_hasFirmLeadTime(r))
_eligibilityReason:   ... if (!_hasFirmLeadTime(r)) return "missingLeadTime"
```

The helper is a pure predicate on `r` alone — no project context, no customer context, no cooldown. Each caller applies its own exclusions before reaching the shared check.

### Predicate shape recommendation

No change to the RFQ's predicate. The shared helper should be:

```js
function _hasFirmLeadTime(r) {
  return r.leadTimeDays != null && r.leadTimeSource && r.leadTimeSource !== "ai";
}
```

Callers that currently inline `isFirmLT` (line 6337) switch to `_hasFirmLeadTime(r)`. The row-color function adds a new condition calling the same helper.

---

## 4. SCOPE AS AN H-ITEM

### Touch points (implementation changes)

| # | File | Line | Change | Risk |
|---|------|------|--------|------|
| 1 | `src/app.jsx` | ~15771 | New `_hasFirmLeadTime(r)` helper (3 lines) | None — new function |
| 2 | `src/app.jsx` | 15776–15780 | Add COND 4 to `_isBomRowFlaggedRed`: `if (!_isExcludedFromPriceCheck(r) && !vendorIsCustomer && !_hasFirmLeadTime(r)) return true;` | LOW — additive condition, same exclusion set as COND 3 |
| 3 | `src/app.jsx` | 6337 | Replace inline `isFirmLT` with `_hasFirmLeadTime(r)` | ZERO — identical logic, just factored |

**Total: ~5 lines changed.**

### Exclusion alignment for the new COND 4

The new lead-time red flag should use the SAME exclusion gate as COND 3 (stale priceDate):
`!_isExcludedFromPriceCheck(r) && !vendorIsCustomer`. This means:

- Labor rows: **excluded** (no lead time expected)
- Customer-supplied: **excluded** (customer provides the item)
- Contingency: **excluded** (not a real procured item)
- Matrix Systems vendor: **excluded** (internal)
- Buyoff/Crate: **excluded** (utility rows)
- Vendor = customer: **excluded** (customer-furnished, no supplier lead time)

This matches `_eligibilityReason`'s exclusion set for lead-time purposes (labor + contingency + buyoff/crate are all excluded from RFQ). The only RFQ-specific exclusion not in the row-color path is `priceSource==="manual"` — but manual-priced rows that lack firm lead times SHOULD turn red (a manual price doesn't imply known delivery). Alignment is correct.

### Phase boundaries

**Phase 1 (this scope):** Extract helper, add COND 4 to `_isBomRowFlaggedRed`, refactor `_eligibilityReason` to use the same helper. Deploy. Visual verification.

**NOT in Phase 1 (explicit exclusions):**

- `findIncompleteQuoteItems` (quote-send gate) — does NOT get a lead-time check. The send gate blocks on price/qty/verification issues. Lead-time incompleteness is handled by the separate `_countAiLeadTimes` → `_markProjectBudgetaryForAiLeads` path (auto-stamps BUDGETARY, admin can override). Adding a lead-time block to the send gate would be a behavioral change beyond visual flagging. **Jon decides separately if/when the send gate should also block on non-firm lead times.**

- `_eligibilityReason` include logic — **HARD FENCE per work order.** The RFQ-breadth policy question is PARKED.

- Pre-print checklist (line 37379) — already has `_countAiLeadTimes` as a separate checklist item. No change needed.

### Regression surface

| Consumer | Reads | Impact of #175 |
|----------|-------|----------------|
| BOM table row background (28715) | `_isBomRowFlaggedRed` | **INTENDED** — rows with non-firm lead times now red |
| `findIncompleteQuoteItems` (15816) | Independent logic, same shape | NONE — not touched |
| Pre-print checklist (37379) | `_countAiLeadTimes` | NONE — separate path |
| Budgetary auto-stamp (32725, 37364) | `_countAiLeadTimes` / `_markProjectBudgetaryForAiLeads` | NONE — separate path |
| Lead-time cell rendering (29090) | `leadTimeSource`, inline | NONE — per-cell italic/muted unaffected |
| Lead-time tooltip (29930) | `leadTimeSource`, inline | NONE |
| Lead-time drivers (37006) | `leadTimeDays`, `leadTimeSource` | NONE — reads, doesn't flag |
| RFQ eligibility (6337) | `isFirmLT` inline → `_hasFirmLeadTime` | NONE — identical logic, refactored |
| Pricing skip guards (15112, 27083–27085) | `leadTimeSource` equality checks | NONE — not touched |

**No behavioral regression.** The only observable change is: BOM rows that previously had white/transparent backgrounds (price OK, qty OK, priceDate OK) but lacked firm lead times will now render with `rgba(255,40,40,0.35)` red background — the same red as missing-price rows.

### Risk assessment

**LOW.** The change is additive (new condition in an existing predicate), uses the same exclusion logic already battle-tested for price checks, and the shared helper is a pure function with no side effects. The refactor of `_eligibilityReason` is a rename (local `isFirmLT` → shared `_hasFirmLeadTime`), not a logic change.

**One visual-impact note for Jon:** On a project like PRJ402096, where 34 of 64 rows have `leadTimeSource:"ai"`, this change will turn ~34 additional rows red. The BOM table will look significantly more "flagged" than before. This is the INTENDED behavior per the FULL RED decision — but worth previewing on a real project post-deploy to confirm it reads correctly. The existing italic/asterisk/muted styling on the lead-time cell value provides a secondary signal for WHY the row is red (AI estimate visible at a glance).

---

## Summary for Detailed Plan

- **New helper:** `_hasFirmLeadTime(r)` — 3 lines, pure predicate
- **`_isBomRowFlaggedRed`:** add COND 4 with same exclusion gate as COND 3 — 1 line
- **`_eligibilityReason`:** replace inline `isFirmLT` with `_hasFirmLeadTime(r)` — 1 line
- **Total:** ~5 lines
- **Test criteria:** (1) AI-lead-time row turns red, (2) firm-lead-time row stays white, (3) excluded rows (labor/CS/contingency/buyoff/crate/vendor=customer) stay unaffected, (4) RFQ eligibility unchanged, (5) existing price-red rows unchanged
- **NOT in scope:** send gate, RFQ breadth, pre-print checklist

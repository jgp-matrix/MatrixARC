# Item Lead Times — Design Spec (v1)

**Status:** Approved for implementation
**Date:** 2026-04-23
**Related:** Extends supplier portal, BC Item Card pricing, scrapers, and the RFQ flow.

## Problem

Today, `row.leadTimeDays` only populates on BOM rows when a supplier submits via the portal. Every other row shows no lead time. Sales has no visibility into which items drive the critical path, and users must manually type lead times on the quote. BC holds lead-time data (`Item Card Lead_Time_Calculation` + `Item Vendor Catalog Lead_Time_Calculation`) but ARC doesn't pull it. Scrapers only return prices, never lead times. There's no dedicated RFQ path for when prices are already in BC but we need supplier confirmation of current lead times.

## Solution overview

Three coordinated subsystems in one feature:

1. **READ + display** — pull lead times from five sources with a ranked precedence, display in BOM column + BC Item Browser column, source tracked per-row
2. **WRITE** — when ARC user applies supplier portal prices to the BOM, also write the supplier's lead time back to BC `ItemVendorCatalog` (Page 114, published as `/ItemVendorCatalog` on the OData base)
3. **RFQ extension** — when sending RFQs, detect items missing lead times; add a per-vendor "Lead Times Only" checkbox that shows BC prices as reference and asks supplier to confirm lead times only

**Out of scope:** Quote-level lead time rollup (needs production schedule data — future feature).

## Data model

### New fields on BOM rows

```js
{
  // existing
  leadTimeDays: number | null,          // already exists (populated by supplier portal today)
  // new
  leadTimeSource: "supplier" | "scraper" | "bc_vendor" | "bc_item" | "ai" | "manual",
  leadTimeUpdatedAt: number,            // ms epoch — for stale detection
  leadTimeEstimated: boolean,           // true only when source === "ai"
}
```

### New / extended fields on `rfqUploads/{token}` docs

```js
{
  // existing
  leadTimeOnly: boolean,                          // new — lead-time-only RFQ mode
  lineItems: [{
    // existing
    referencePrice: number | null,                // BC price pre-filled as reference when leadTimeOnly=true
    referencePriceSource: "bc" | null,
  }]
}
```

### Retention

All new fields preserved on save per `CLAUDE.md` retention rule. No schema version bump needed — existing rows without `leadTimeSource` treated as unknown (render as `—`).

## Source precedence (READ)

```
1. Supplier portal submission    → leadTimeSource = "supplier"   (already writes today)
2. Scraper output                → leadTimeSource = "scraper"    (framework extension)
3. BC ItemVendorCatalog          → leadTimeSource = "bc_vendor"  (new fetch)
4. BC Item Card Lead_Time_Calc   → leadTimeSource = "bc_item"    (new fetch, reference)
5. AI fallback                   → leadTimeSource = "ai", leadTimeEstimated:true
```

Higher priority overwrites lower. `manual` edit beats everything until a user-initiated force-refresh.

### Date formula parser (helpers)

```js
function _bcDateFormulaToDays(f){
  if(!f)return null;
  const m=String(f).toUpperCase().replace(/^P/,"").match(/^(\d+)\s*([DWMY])$/);
  if(!m)return null;
  const n=+m[1], u=m[2];
  return u==="D"?n : u==="W"?n*7 : u==="M"?n*30 : u==="Y"?n*365 : null;
}

function _daysToBcDateFormula(days){
  if(days==null||days<=0)return "";
  return `${Math.round(days)}D`;
}
```

## Fetch pipeline

Piggybacks on existing `runPricingOnPanel`. Lead time and price fetched together per row in one pass through all sources:

1. Skip if row is `_isExcludedFromPriceCheck`
2. If row already has a `supplier`-sourced lead time, keep it
3. For remaining rows: try scraper (if vendor has active scraper) → BC ItemVendorCatalog → BC Item Card
4. Collect rows that still have `leadTimeDays == null` → batch-call AI fallback, mark `leadTimeEstimated:true`

No new button. Force-refresh of pricing also force-refreshes lead times.

## Scraper framework extension

- Add `leadTimeField` step type alongside existing `priceField` in scraper builder UI (Settings → Config)
- CSS selector + regex (user configures both)
- Runner returns `{partNumber, unitPrice, leadTimeDays}` — backward-compat for scrapers without lead-time selectors (returns `null`)
- Existing scraper definitions continue to work unchanged

## UI: BOM table column

- Position: between `Ext $` and `Priced`
- Header: `Lead`
- Populated value: plain integer (`14`)
- Empty: `—`
- Editable inline; manual edit → `leadTimeSource="manual"`, `leadTimeEstimated:false`
- AI estimate rendering: italic + asterisk suffix (`14*`)
- Stale (>60d since update): tilde prefix (`~14`)
- Hover tooltip (all values):
  ```
  Lead time: 14 days
  Source: Supplier portal (Codale submission)
  Updated: 3 days ago
  ```

## UI: BC Item Browser column

- New read-only `Lead` column in `BCItemBrowserModal`
- Source: `ItemCard.Lead_Time_Calculation` parsed via `_bcDateFormulaToDays`
- Empty → `—`
- Selecting an item populates BOM row with the BC lead time (editable there)

## BC writeback to ItemVendorCatalog (Page 114)

**Endpoint:** `/ItemVendorCatalog` on the OData base (same pattern as existing `ItemCard`).

**Trigger:** Fires inside `doApplyPortalPrices` alongside the existing BC price push — same transaction semantics; one click from the user ("Apply Prices to BOM") does everything.

**Fields written:**

| BC field | Source in ARC | Notes |
|---|---|---|
| `Item_No` | `row.partNumber` | **Must be non-blank** — rows with blank partNumber skipped |
| `Vendor_No` | `bcGetVendorByName(submission.vendorName)` → resolved Vendor_No | Skip row if vendor can't be resolved |
| `Vendor_Item_No` | `row.supplierPartNumber` if distinct from `partNumber`, else blank | Optional BC field |
| `Lead_Time_Calculation` | `_daysToBcDateFormula(leadTimeDays)` | Always `"{N}D"` |

**Upsert logic:**
1. `GET /ItemVendorCatalog?$filter=Item_No eq '{pn}' and Vendor_No eq '{vn}'` to check existence + get ETag
2. Exists → `PATCH` with ETag
3. Not exists → `POST` new record

**Safeguards:**
- `row.partNumber.trim() !== ""` — **never** write a blank partNumber
- `leadTimeDays > 0`
- `vendor_no` resolved successfully (skip otherwise)
- Row not excluded by `_isExcludedFromPriceCheck` (no labor/customer-supplied/contingency/etc.)
- Failed writes logged but don't block the price apply (non-fatal)

**Audit trail:** New Firestore collection `companies/{cid}/bcLeadTimeWrites`:
```js
{
  writtenAt, writtenBy, projectId, vendorNo, vendorName,
  itemNo, leadTimeDays, previousLeadTime, outcome: "created" | "updated" | "failed",
  error: string | null,
}
```

## RFQ extension for lead time requests

**Detection:** When user clicks "Send/Print RFQs", for each vendor group ARC computes:
- `itemsMissingPrice` (existing)
- `itemsMissingLeadTime` (new — any non-excluded row with `leadTimeDays == null` AND vendor matches)

If either exists for a vendor, that vendor's RFQ includes **ALL items from that vendor** (not just missing ones) so supplier sees full context.

**New checkbox in `RfqEmailModal`, per vendor group:**

```
☐ Request Lead Times Only (prices already in BC)
```

When **checked** for a vendor:
- RFQ PDF header banner: *"LEAD TIME REQUEST ONLY"*
- BC prices shown as reference column (read-only on supplier side)
- Email subject prefix: `[Lead Time Request]`
- Email body intro swaps to: *"We already have pricing for these items on file. We're requesting confirmation of current lead times only. Please confirm lead time in days for each item below."*
- `rfqUploads/{token}.leadTimeOnly = true`
- Per-line `referencePrice` = BC price (copied at send time, frozen in the RFQ)

When **unchecked** (default): behaves exactly like today — supplier quotes price + lead time.

**PDF changes (`buildRfqPdf`):**
- Extra column "Current Price" shown only when `leadTimeOnly:true` — populated from `referencePrice`
- Banner header "LEAD TIME REQUEST ONLY" rendered when active
- Submit validation: lead time required; price not required

## Supplier Portal UI changes

When `rfqUploads/{token}.leadTimeOnly === true`:
- Portal banner: *"📅 Lead Time Request — prices already in BC"*
- Line items: `Price` column shows `referencePrice` read-only (grey background, no input)
- `Lead Time (days)` column is the primary input (keeps current widget)
- Submit validation: require `leadTimeDays` for every line; prices unchecked

When `false` (default): no change.

`extractSupplierQuotePricing` Cloud Function already handles both shapes — it already returns `leadTimeDays`. No Cloud Function changes needed.

## Firestore retention compliance

- New row fields preserved on save (never stripped)
- `bcLeadTimeWrites` is an append-only audit collection — no caps
- `rfqUploads.leadTimeOnly` is a simple boolean — no migration needed
- Older rows without `leadTimeSource` render as `—`, treated as unknown
- `APP_SCHEMA_VERSION` bump NOT required — all changes additive

## Precedence rules (extends existing)

- Manual edit beats any auto-fetch source
- `bc_vendor` beats `bc_item` (vendor-specific more accurate than item default)
- Supplier portal write → BC `ItemVendorCatalog` → next time ARC fetches `bc_vendor` source, data is fresh
- AI fallback never fires if any firm source returned a value

## Testing plan

1. **Pricing pipeline pulls BC data:** BOM row with BC `Item Card.Lead_Time_Calculation="14D"` + no portal data → after pricing run, `leadTimeDays=14`, `leadTimeSource="bc_item"`, tooltip: "BC Item Card"
2. **BC ItemVendorCatalog read:** row with both ItemCard lead time AND ItemVendorCatalog lead time → ItemVendorCatalog wins, `leadTimeSource="bc_vendor"`
3. **Supplier submission + writeback:** submit supplier quote with `leadTimeDays=10` → row flips to `leadTimeSource="supplier"`, click "Apply Prices to BOM" → BC `ItemVendorCatalog` has new/updated record with `Lead_Time_Calculation="10D"` for the right vendor + item, audit log entry in `bcLeadTimeWrites`
4. **Blank partNumber guard:** try to apply a submission where a row has blank `partNumber` → writeback skips that row; logged as skipped; other rows still write
5. **Scraper with lead time:** configure scraper step with lead-time selector → run pricing → row populated with `leadTimeSource="scraper"`
6. **AI fallback:** row with no data sources + all other sources empty → AI estimates → row renders `14*` italic, tooltip "AI estimate — not firm"
7. **Manual edit preserved:** edit cell to `21` → `leadTimeSource="manual"`. Re-run normal pricing → value sticks. Force-refresh → value overwritten with highest auto-source.
8. **Stale detection:** `leadTimeUpdatedAt` >60 days ago → renders `~14` with tooltip showing age
9. **BC Item Browser Lead column:** search for an item → Lead column populated from `ItemCard.Lead_Time_Calculation`
10. **RFQ lead time mode:**
   - Open RFQ modal with a vendor group missing lead times → "Request Lead Times Only" checkbox visible for that vendor
   - Check it → RFQ PDF shows "LEAD TIME REQUEST ONLY" banner + BC prices in reference column
   - Supplier opens portal → sees read-only prices + lead time input
   - Supplier submits with just lead times → `leadTimeDays` updates on BOM rows, prices unchanged
   - Apply to BOM → writes to `ItemVendorCatalog` for each row

## Scope boundaries

**In scope:**
- All 5 source fetches
- BOM column + BC Item Browser column + inline editing
- BC `ItemVendorCatalog` writeback via `doApplyPortalPrices`
- RFQ "Lead Times Only" checkbox + portal/PDF changes
- Scraper framework extension
- Audit trail

**Out of scope (future features):**
- Quote-level lead time rollup (needs production schedule)
- Per-panel build time configuration
- `requestedShipDate` feasibility warning
- Lead time history / diff view

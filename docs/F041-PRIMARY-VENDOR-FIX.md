# F041 Slice 1 — Price from PRIMARY vendor (not newest-across-vendors)

**Author:** Freddy Lyst · **Build plan:** Marc Masdev · **Date:** 2026-07-23 · base v1.24.16
**Status:** BUILD-READY, NOT APPLIED. Automated pricing is currently DISABLED (`AUTO_PRICING_ENABLED=false`), so this fix is dead code until pricing is re-enabled. **Apply this (+ a write-side plausibility gate) as the prerequisite to turning pricing back on.** Money-path → Coach review + test + Jon gate.

## Root cause (confirmed)
`bcFetchPurchasePrices` (`src/app.jsx:5562`) keeps, per part, the PurchasePrice with the **most-recent `Starting_Date` across ALL vendors** (`:5584-5588`). A junk vendor (V00373/Royal @ $0.71, recent date) beats the correct primary (V00040 @ $1,632). This is the systemic wrong-price mechanism (627 rows / 40 projects).

## The fix (zero extra BC calls)
Add optional `opts.preferredVendors` (Map<part, vendorNo>) to `bcFetchPurchasePrices`. Ingest ALL vendor records per part (same OData request), then per part: **prefer the PurchasePrice whose `Vendor_No` == the item's primary/default vendor** (ItemCard `Vendor_No`, already resolved per-row as `bcMap[k].bcVendorNo` via `bcGetItemVendorNo`); fall back to newest-across-vendors only when the primary has no PP record. No-opts callers get byte-for-byte legacy behavior (zero regression).

## Fixes re-pricing WITHOUT cleaning BC — with a caveat
A manual re-price on an affected item resolves `bcVendorNo`=V00040 → selection picks $1,632, **ignoring** the junk V00373 $0.71. So primary-vendor selection routes around the junk; BC cleanup becomes hygiene, not a blocker. **CAVEAT:** only holds if each item's ItemCard `Vendor_No` = the correct vendor and that vendor has a PP record. If the ItemCard default IS the junk vendor (or the correct vendor has no PP), the fallback still picks junk → those need BC cleanup. **Spot-check ItemCard `Vendor_No` on a sample of the 627 before any bulk re-price.**

## Edits (paste-ready — from the Marc build lane; re-verify line numbers at apply time, file drifts)
1. **`bcFetchPurchasePrices`** (`~:5560-5594`) — rewrite to accept `opts.preferredVendors`, ingest all-vendor records, select primary-then-fallback. (Full replacement code in the build-lane output / this session's transcript.)
2. **`runPricingOnPanel` BC pass** (`~:28536-28539`) — build `_preferredVendors` from `bcMap[k].bcVendorNo` and pass it.
3. **`runPricingBackground`** (`~:15740-15743`) — same `_preferredVendors` build + pass.
4. **dead-vendor re-verify** (`~:5211-5214`) — same, from `updates[k].bcVendorNo`.
5. **`commitBcItem`** (`~:27848`) — pass `bcItem.vendorNo` if present (⚠ confirm the picker's `bcItem` carries `vendorNo`; else `bcGetItemVendorNo` or leave legacy).
6/7. **5-min poll (`~:25377`) + on-open check (`~:38520`)** — apply the SAME `preferredVendors` treatment WHEN `AUTO_BC_REPRICE_ENABLED` is turned back on (else the bug returns on re-enable). **Linked follow-up — do not miss.**

## Blast radius (callers of `bcFetchPurchasePrices`)
Apply primary-vendor to the price-SETTING callers (`:28539`, `:15743`, `:5214`, `:27848`). Leave date-only callers (`:25334`, `:28734`, `:28848`) and the read-only `runPricingAudit` (`:5716`) legacy (cosmetic; audit could get a follow-up to compare vs primary).

## Verify before mass re-price
`node validate_jsx.js` → live "Get New Pricing" on an affected project (e.g. HMIST6500) in the controlled tab → confirm $1,632 replaces $0.71.

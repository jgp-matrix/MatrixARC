# New BC Sandbox (`MATR_SndBx_UAT_070926`) — Master-Data Gaps to Load

**Context:** The new sandbox was seeded with **Items, Vendors, and Customers**, but three supporting
master-data sets that ARC depends on **did not come across**. Re-linking projects works, but items
come in without MFR / lead time / price until these are loaded. Verified live against the sandbox
2026-07-29. Please load the following into `MATR_SndBx_UAT_070926`.

## 1. Manufacturer data (items have NO `Manufacturer_Code`)
- **Finding:** 0 of 300 sampled items have a `Manufacturer_Code`; no Manufacturers table is present.
- **Effect in ARC:** Manufacturer never auto-populates on a BOM row (Supplier does, because `Vendor_No`
  came across). ARC reads the item's `Manufacturer_Code` and resolves the name from the Manufacturers list.
- **Load:** the **Manufacturers** table (Code → Name) **and** the per-item **`Manufacturer_Code`** values
  (as they exist in the old env `MATR_SndBx_01152026`).

## 2. Item Vendor Catalog (blank)
- **Finding:** the **Item Vendor Catalog** is empty in the new env.
- **Effect in ARC:** per-item lead times don't populate (ARC's authoritative `bc_vendor` lead-time source
  is this table), **and** ARC's lead-time write-back has nowhere to land (see note below).
- **Load:** the **Item Vendor Catalog** rows from the old env (item ↔ vendor, incl. `Lead_Time_Calculation`
  / vendor item no). Confirm the table/web-service is **published** for OData read+write.

## 3. Purchase Prices (not loaded)
- **Finding:** BC Purchase Prices are not loaded in the new env.
- **Effect in ARC:** item unit costs don't come from BC (ARC reads the **`PurchasePrices`** web service:
  `Item_No, Vendor_No, Direct_Unit_Cost, Starting_Date, Unit_of_Measure_Code`).
- **Load:** the **Purchase Price** records from the old env; confirm the `PurchasePrices` web service is
  published.

## Notes
- **Lead-time write-back (ARC):** ARC reportedly isn't writing a manually-entered lead time to the Item
  Vendor Catalog. This is most likely **downstream of gap #2** (the catalog is blank/unpublished, so the
  write has nothing to target). **Re-test after #2 is loaded**; if it still fails, it's an ARC-side bug to
  trace separately.
- **Already fixed (customers, 2026-07-29):** added missing customer **North Central Electric (C10128)**;
  renamed **C10127** "Ryan Graham" → **"Rebuild-It"** to match old env. Full customer audit is now clean
  (30/30, no other mismatches).
- **Also:** the 48 items ARC created during migration (`MTX-117675…117722`) were created with
  Vendor_Item_No + posting groups only — they'll also need Manufacturer_Code / vendor-catalog / price
  like the rest.

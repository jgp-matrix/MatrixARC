# F072 — Secondary-vendor / supplier management + selection — build-ready plan

**Coach scope · 2026-07-27 · base v1.24.41 · `src/app.jsx`.** Read-only design. Money-path (changes row `unitPrice`/vendor/lead-time) → Coach review + regression + Jon gate required.

> **SCOPE LOCKED (Jon 2026-07-27):** Primary auto-select (BC Item Card `Vendor_No`) is ALREADY correct behavior — OUT OF SCOPE, untouched. F072 = give the user the ability to **view, manage, and select SECONDARY vendors/suppliers (+ alternate source/MFR)** for a BOM item. Jon: *"#1 is how ARC and BC behave. The only thing we dont have is the ability to manage and select secondary vendors/suppliers."*

## 1. Current state (grounded)
- **Primary vendor (leave alone):** `bcGetItemVendorNo(itemNo)` `:6967` reads ItemCard `Vendor_No`; callers stamp `row.bcVendorNo`/`row.bcVendorName`. Auto-selected primary — correct.
- **Secondaries already fetched — two shapes:**
  - `bcFetchPurchasePrices(partNumbers,opts)` `:6150` — ingests ALL vendor PurchasePrice records (`byPart` map `:6175-6181`) but **collapses to ONE** per part (`:6184-6198`: F041 picks `opts.preferredVendors` primary, else newest-`Starting_Date`). Price-setting path — deliberately hides secondaries.
  - **`bcFetchPurchasePricesMultiVendor(partNumbers,opts)` `:6446` — RETAINS every vendor**, keyed `"pn:vendorNo"` → `{directUnitCost,startingDate,uom}` (`:6465-6472`). **Ideal F072 data source — the full per-vendor list already exists.** Today's only consumer: archive restore/verify comparator (`:11298`), never a user picker.
- **Row vendor chosen/displayed:** `BCItemBrowserModal` `:24167` (per-row 🔍, `targetRow`); `commitBcItem` `:29092` stamps price + `bcVendorNo`/`bcVendorName`. Row carries a SINGLE vendor. No UI lets a user see/choose among a part's secondary vendors — entirely automatic today.
- **"DISABLED until BC cleaned + primary-vendor selection" — confirmed dormant:** comment `:6015` on `AUTO_BC_REPRICE_ENABLED=false` (`:6017`); master `AUTO_PRICING_ENABLED=false` (`:6023`). F041 primary-vendor SELECT landed inside `bcFetchPurchasePrices` (`:6157-6197`) but is dead code until pricing re-enabled. `preferredVendors` mechanism exists + works when passed.

## 2. Existing stores to UNIFY (do not duplicate)
- `users/{uid}/config/supplierCrossRef` — supplier part# → BC part. Write `:21351`, read `:46977`. Team-scoped via `_supplierDocPath`/`_readSupplierConfig`.
- `users/{uid}/config/alternates` — part crosses (REPLACE). `saveAlternateEntry` `:29087`.
- `users/{uid}/config/manufacturerVendorMap` — learned MFR→vendor. `getManufacturerVendorMap` `:7052`, `rebuild…` `:7075`, `bump…` `:7122`. Already trains vendor auto-assign `:37186`.
- **F010 relationship (backlog `TODO.md:142`):** F010 = multi-alternate "ALT" picker suggesting alternate **parts** under an item (part axis). F072 = choose a secondary **vendor/source for the SAME part** (vendor axis). **Distinct axes**, but share the BC Item Browser surface, additive-list persistence, and a learning-DB write. Build the shared "alternate picker" chrome once so F010 can reuse it — but do NOT make F072 wait on F010.

## 3. Design (additive — Data Retention: no caps, preserve-on-save)
- Reuse `bcFetchPurchasePricesMultiVendor` `:6446` (no new BC call shape). Add resolver `_resolveRowVendorOptions(row)` → `[{vendorNo,vendorName,directUnitCost,startingDate,uom,isPrimary}]`: primary = ItemCard `Vendor_No`, secondaries = every `"pn:vendorNo"`, MFR-enriched via `manufacturerVendorMap`.
- On selection write to row: `bcVendorNo`, `bcVendorName`, and (if user adopts that vendor's price) `unitPrice`/`priceSource:"bc"`/`_priceStamp()`, plus lead-time re-resolve. Add provenance `vendorSource:"manual-secondary"` so a later auto-reprice can't silently clobber the explicit pick (mirrors `priceSource:"manual"` guard).
- Persist part→chosen-vendor to a **new learning doc `users/{uid}/config/vendorPreferences`** (additive, arrayUnion, no cap) → secondary auto-applies on future BOMs. F072 analogue of the alternates DB.
- **Picker location — LOCKED by Jon (2026-07-27):** a **new section INSIDE the BC Item Browser modal** (`:24167`), NOT an inline row popover (Coach's original rec is overridden). Placement: **below the Part# field, above the DRAWING REFERENCE viewport**. The section lists **all possible alternatives + MFRs + Suppliers** for the item (primary pre-selected; each secondary with price + lead time + MFR). **The modal will need to grow in height AND width** to accommodate the new list without crowding the drawing viewport. Jon: *"Secondary Vendors just need to show Items in the BC Item Browser as a new section that shows all possible alternatives, MFR's and Suppliers. List can be shown below the Part# field and above the DRAWING REFERENCE viewport. Item Browser Window will likey need to increase in hieght and width to accomodate."* → This also naturally shares the surface with **F010** (part-axis alternates) since both live in the BC Item Browser — build the section chrome to host both axes.
- **BC write-back — ARC-side-ONLY for v1.** Selecting a secondary changes the ROW only; NO PATCH to BC Purchase Price / ItemVendorCatalog. Write-back would (a) drag F072 onto the BC-integrity critical path (F071/B064/F069), (b) risk re-poisoning the shared catalog (the PRJ402119 failure class the kill switches guard). Keep local; revisit write-back after F071/F070 land.

## 4. Open decisions for Jon (Coach rec first)
1. ~~**Picker location**~~ — ✅ **RESOLVED (Jon 2026-07-27): new section in the BC Item Browser modal, below Part# / above DRAWING REFERENCE, modal grown in H+W.** (See Design §3.)
2. **Secondary adopts price/lead-time too, or vendor-only?** — *rec: offer both* (default "vendor + its price"; "vendor only, keep my price" option); always stamp `vendorSource:"manual-secondary"`.
3. **BC write-back now or ARC-side-only?** — *rec: ARC-side-only v1* (off the BC-integrity path; no catalog re-poison).
4. **Persist choice to a learning DB?** — *rec: yes*, new additive `config/vendorPreferences`, no cap.
5. **Fold shared picker chrome with F010 or ship standalone?** — *rec: build the picker reusably but ship F072 first*; F010 adopts it later.
6. **MFR enrichment source** — *rec: `manufacturerVendorMap` first (zero extra BC calls)*; live ItemCard MFR lookup deferred.

## 5. Stakes / acceptance / gates
- **Money-path: YES** → Coach review + regression + Jon gate. Not trivial.
- **Acceptance:** on a part with ≥2 BC PurchasePrice vendors, the row popover lists all with prices; selecting a secondary updates `bcVendorNo`/`bcVendorName` (+price if adopted); save-reload preserves the choice + `vendorSource`; re-applies on a fresh BOM with the same part; NO BC catalog write (v1).
- **Data-retention gate:** `vendorPreferences` arrayUnion/uncapped; all existing row flags survive save (`schemaVersion` unchanged — additive only).
- **Regression:** dormant F041 `preferredVendors` path + auto-reprice kill switches untouched; a manual secondary pick not clobbered if pricing later re-enabled.

## Sequencing
ARC-side-only → **independent of the BC-integrity cluster (B064/B065/F071)**; ship off the critical path. Coupling appears ONLY if v1 adds BC write-back — explicitly deferred to avoid entangling with F071's commit-gate + B064's fault-surfacing.

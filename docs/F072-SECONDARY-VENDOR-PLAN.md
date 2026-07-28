# F072 — Secondary-vendor / supplier management + selection — build-ready plan

**Coach scope · 2026-07-27 · base v1.24.41 · `src/app.jsx`.** Read-only design. Money-path (changes row `unitPrice`/vendor/lead-time) → Coach review + regression + Jon gate required.

> **SCOPE LOCKED (Jon 2026-07-27):** Primary auto-select (BC Item Card `Vendor_No`) is ALREADY correct behavior — OUT OF SCOPE, untouched. F072 = give the user the ability to **view, manage, and select SECONDARY suppliers** for a BOM item. Jon: *"#1 is how ARC and BC behave. The only thing we dont have is the ability to manage and select secondary vendors/suppliers."*

## Two features, one surface (Jon 2026-07-27 — the unifying model)
The BC Item Browser becomes the one place a user finds a Part# and chooses **how to source it**, combining two DISTINCT features:

| | **Cross-Reference** (EXISTING — `config/alternates`) | **Alternates** (F072 — NEW) |
|---|---|---|
| What varies | a **different Part#** (substitute product) | a **different Supplier** (same product) |
| Meaning | "this OTHER part can be used in its place" | "buy the IDENTICAL product from another source (e.g. online retailer when the local supplier can't get it)" |
| MFR | may differ (it's a different part) | **same** (identical product) → no MFR field |
| Applied | ARC auto-selects standard crosses | user picks a secondary supplier |

For any found Part#, the Browser lets the user choose: **① Primary supplier** (Item Card `Vendor_No`, auto-selected) · **② Secondary supplier** — an F072 user-entered Alternate OR a BC Purchase Price vendor · **③ Cross-Referenced Part** — a substitute part# from the existing Cross-Reference DB. F072 builds ② and surfaces all three together in one selector.

Jon: *"We have the Cross-Reference feature… allows ARC to automatically select standard crossed items. This Alternates feature… allows the User to choose from alternate Suppliers for an identical product (i.e. Online Retailer if our local supplier cannot get it). These features work together in this BC Item Browser list to allow the User to find a Part# and choose if they want to buy from the Primary supplier, a secondary supplier, or select a Cross-Referenced Part that can be used in its place."*

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
- **New user-alternates learning DB** `users/{uid}/config/itemAlternates` (additive, no cap, preserve-on-save — Data Retention rules; sibling of `alternates`/`supplierCrossRef`). Keyed by **BC item No / part#**; value = array of user-entered alternates `[{supplier, price, leadTimeDays, mfr?, enteredAt}]`. The ALT modal reads/writes this doc; entries persist across projects → the same alternates re-list on any future BOM with that item.
- **Optional auto-discovered secondaries (decision Q7):** in addition to user-entered alternates, the Browser MAY also surface BC's own Purchase Price vendors via `bcFetchPurchasePricesMultiVendor` `:6446` (already retains all `"pn:vendorNo"` records) — shown as read-only "from BC" secondaries alongside the editable user ones.
- **On selecting a listed alternate → apply to the BOM row:** set vendor (`bcVendorName`/`bcVendorNo` if the supplier resolves in BC, else the free-text supplier name), `unitPrice`/`priceSource`/`_priceStamp()`, and `leadTimeDays`/`leadTimeSource`. Stamp provenance `vendorSource:"manual-secondary"` so a later auto-reprice can't silently clobber the explicit pick (mirrors the `priceSource:"manual"` guard).
- **ARC-side-only for v1** (locked, decision Q3): entering/selecting an alternate does NOT PATCH BC's Purchase Price / ItemVendorCatalog — stays off the BC-integrity critical path (F071/B064/F069) and avoids re-poisoning the shared catalog. Alternates live in the ARC learning DB + on the BOM row.
- **UI — LOCKED by Jon (2026-07-27, refined):** F072 is a **user-managed alternates database** (this IS the "cross-reference DB" from Jon's original request #2), not a read-only view of BC Purchase Prices.
  - **"ALT" button next to "USE"** on each BC Item Browser **item row**. (USE = commit this BC item to the BOM row; ALT = manage this item's alternates.)
  - **ALT opens a modal** to **enter alternate Supplier + Price + Lead Time**, with **multiple rows** — the user adds as many alternates as they want (Add-row + delete-row; each row = {supplier, price, leadTimeDays, (MFR? — see decision Q6)}).
  - The item's saved alternates then **list on the BC Item Browser page as selectable Secondary options** (below the Part# field / above the DRAWING REFERENCE viewport; modal grows in H+W to fit). Jon: *"put a button next to USE in the Item row called ALT that opens a modal allowing user to enter alternate Supplier, Price and Lead time by row (they can enter multiple if desired). Then on the BC Item Browser page, these Alternates are listed and selectable as Secondary options."*
  - **Selecting a listed alternate applies it to the BOM row** (supplier/price/LT) — the secondary-pick equivalent of USE.
  - Placement/layout note carries over: list **below Part#, above DRAWING REFERENCE**; **modal grows H+W**. Shares the surface with **F010** (part-axis alternates) — both live in the BC Item Browser.
  - **Earlier "read-only section sourced from BC Purchase Prices" approach is SUPERSEDED** by user-entry. BC Purchase Price records MAY still be shown as auto-discovered secondaries alongside the user-entered ones — see decision Q7.
- **BC write-back — ARC-side-ONLY for v1.** Selecting a secondary changes the ROW only; NO PATCH to BC Purchase Price / ItemVendorCatalog. Write-back would (a) drag F072 onto the BC-integrity critical path (F071/B064/F069), (b) risk re-poisoning the shared catalog (the PRJ402119 failure class the kill switches guard). Keep local; revisit write-back after F071/F070 land.

## 4. Open decisions for Jon (Coach rec first)
1. ~~**UI**~~ — ✅ **RESOLVED (Jon 2026-07-27): ALT button next to USE per item row → modal to enter alternate Supplier/Price/Lead-Time (multiple rows) → alternates list + selectable as secondaries in the BC Item Browser (below Part#, above DRAWING REFERENCE; modal grows H+W).** (See Design §3.)
2. ~~**Secondary adopts price/LT too?**~~ — ✅ **RESOLVED by design:** an alternate IS `{supplier, price, lead-time}`; selecting it applies all three to the row.
3. **BC write-back?** — ✅ **LOCKED: ARC-side-only v1** (off the BC-integrity path; no catalog re-poison).
4. ~~**Persist to a learning DB?**~~ — ✅ **RESOLVED: yes** — new additive `config/itemAlternates` (no cap, preserve-on-save).
5. **Fold shared chrome with F010?** — *rec: build the ALT/alternates UI reusably but ship F072 first*; F010 (alternate PARTS) adopts the same surface later.
6. ~~**MFR field in the ALT modal?**~~ — ✅ **RESOLVED: NO MFR field.** Jon (2026-07-27): an F072 alternate is a different **supplier for the IDENTICAL product**, so MFR is unchanged. The MFR/different-part dimension is the separate **Cross-Reference** feature (see §Two-features below). ALT modal = Supplier / Price / Lead Time only.
7. ~~**Also auto-list BC Purchase Price vendors?**~~ — ✅ **RESOLVED: SHOW BOTH** (Jon 2026-07-27). Browser lists user-entered alternates (editable) AND the item's BC Purchase Price vendors (read-only, auto-discovered via `bcFetchPurchasePricesMultiVendor`) — all selectable as secondaries.

## 5. Stakes / acceptance / gates
- **Money-path: YES** → Coach review + regression + Jon gate. Not trivial.
- **Acceptance:** on a part with ≥2 BC PurchasePrice vendors, the row popover lists all with prices; selecting a secondary updates `bcVendorNo`/`bcVendorName` (+price if adopted); save-reload preserves the choice + `vendorSource`; re-applies on a fresh BOM with the same part; NO BC catalog write (v1).
- **Data-retention gate:** `vendorPreferences` arrayUnion/uncapped; all existing row flags survive save (`schemaVersion` unchanged — additive only).
- **Regression:** dormant F041 `preferredVendors` path + auto-reprice kill switches untouched; a manual secondary pick not clobbered if pricing later re-enabled.

## Sequencing
ARC-side-only → **independent of the BC-integrity cluster (B064/B065/F071)**; ship off the critical path. Coupling appears ONLY if v1 adds BC write-back — explicitly deferred to avoid entangling with F071's commit-gate + B064's fault-surfacing.

---

# Build-ready ordered plan (Coach re-scope, 2026-07-27 · base v1.24.42 · `src/app.jsx` only)

All work inside `BCItemBrowserModal` (`:24167`) + one new learning-DB helper pair + one apply branch. ARC-side only, NO BC write-back. Modal already grows H+W (resize handle `:25066-25095`, floors `:25075-76`, persisted `_saveBcBrowserSize` `:24164`).

**S1 — ALT button next to USE (per result row).** Actions `<td>` `:25001-25004`: wrap Use + a new **ALT** button in a `flex` container (`flexShrink:0` on both — B055 guard `:24838`). ALT = violet `#a78bfa` ("manage"), Use keeps `C.accent`. `onClick` calls `openAltModal(item)` with `e.stopPropagation()` (row onClick `:24858` = Use).

**S2 — Alternates entry modal** (nested `createPortal`, `zIndex:320` over the browser's 300). State near `:24218`. Grid, one row per alternate: **Supplier** (free text), **Price** (numeric ≥0, mirror `updatePrice` guard `:29231`), **Lead Time (days)** (int ≥0), **✕ delete-row**; **+ Add alternate**; **Save**/**Cancel**. NO MFR field (identical product). Persisted row `{supplier, price:number|null, leadTimeDays:number|null, enteredAt, enteredBy}`.

**S3 — new `config/itemAlternates` learning DB** (near `_readSupplierConfig` `:2632`). **Shape = map-of-arrays keyed by BC item No** (chosen for delete-row + no cross-item clobber): `{ items: { [itemNo]: [ {supplier,price,leadTimeDays,enteredAt,enteredBy} ] } }`. `loadItemAlternates(uid,itemNo)` via `_readSupplierConfig`; `saveItemAlternates(uid,itemNo,rows)` via `fbDb.doc(_supplierDocPath(uid,"itemAlternates")).set({items:{[itemNo]:rows}},{merge:true})` (dot-path merge → other items untouched). **Data-Retention:** uncapped, additive, `APP_SCHEMA_VERSION` unchanged. Optional `_itemAltCache` mirroring `_altCache`.

**S4 — unified selector, inserted between Load More `:25021` and DRAWING REFERENCE `:25025`** (same flex column, `flexShrink:0`). Groups: **① Primary** (Item Card `bcVendorName`, label+✓, non-selectable) · **② user alternates** (editable+Select+✎) · **②-b BC Purchase-Price vendors** (`bcFetchPurchasePricesMultiVendor` `:6446`, names via `bcGetVendorName` `:6984`, read-only, "from BC", lazy + skip if `!_bcToken`) · **③ cross-ref parts** (`loadAlternates` `:2715`, "CROSS"). Factor into a reusable `SourceOptionList({groups,onPick})` so **F010** (part-axis) reuses it. Hide block if all empty + no targetRow.

**S5 — apply-on-select (ARC-side only), new `applySecondary(bomRowId,pick)` near `applyBcItem` `:29163`.** Secondary supplier → RMW the row: set `bcVendorName`(+`bcVendorNo` if resolvable), `unitPrice`+`priceSource:"manual"`+`_priceStamp()` (mirror `:29290`), `leadTimeDays`+`leadTimeSource:"manual"`, and **`vendorSource:"manual-secondary"`** (the guard — future re-price/vendor-auto-assign must skip it, mirroring `priceSource:"manual"` skips `:41732`/`:42321`); save via existing `onSaveImmediate`. Cross-ref part → reuse the existing cross flow (`applyBcItem`/`commitBcItem`, already stamps `isCrossed`/`crossedFrom` + trains `saveAlternateEntry` `:29090`). **NO BC write-back** → F071 `bcCommitGate` (`:24168`) does NOT apply to S1/S2/S5 (gates BC-create only).

**Guardrails:** kill switches `:6017`/`:6023` untouched; add `vendorSource` to the row-field preservation list (Data-Retention rule 4); `bcCommitGate` NOT read by ALT/select; B055 `flexShrink:0`; ②-b silent if BC offline.

**Resolved (Coach recs accepted by Freddy):** (1) S3 = map-of-arrays keyed by itemNo (delete-row needs removal; arrayUnion can't). (2) ② supplier = free-text string in v1 (Jon's "online retailer" alternates often aren't BC vendors); BC `Vendor_No` resolution deferred to v2.

**Acceptance:** ALT left of Use; entry modal add/edit/delete multi-row → persists keyed by item No → re-lists on a fresh BOM with that item; selector lists ①②②-b③; selecting ②/②-b writes vendor(+price+LT) + both source stamps, survives save/reload; selecting ③ = existing cross flow; **zero BC writes on any alternate op (verify via Test network trace)**; modal grows to fit; `itemAlternates` uncapped, no other item dropped, `schemaVersion` unchanged.

**Gates:** `node validate_jsx.js` → Coach code-review (money-path) → `deploy-test.sh` → Jon verify on `matrix-arc-test.web.app` → prod.

**Files:** `src/app.jsx` only (S1 `:25001`, S2 nested modal, S4 `~:25022`, S3 helpers `~:2725`, S5 `~:29163`, preservation list). No functions/rules, no `APP_SCHEMA_VERSION` bump.

---

# ⚠ VERIFICATION NOTES (Jon 2026-07-28) — F072-as-built (Test V.063) does NOT match intent → RE-SCOPE + REBUILD

Jon's Test-V.063 review revealed the locked "ARC-side-only" scope was wrong for his intent. F072 is a **BC-integrated vendor-catalog editor**, not an ARC-side alternates list. The four notes:

1. **Supplier = a BC Vendor (dropdown + "Create New"), BC is source of truth.** The ALT ("Manage Alternate Suppliers") modal must present a **BC-vendor dropdown** + a **"Create New"** option using the SAME rules as the other places that create/pick a BC vendor (`bcCreateVendor` + the existing vendor-picker). Selecting a supplier ALWAYS links to a BC Vendor (or creates one). **Reverses locked decision Q3/#4 free-text-supplier.**
2. **No MTX-###### references.** The modal currently shows the internal BC item No ("MTX-######") where it should show the **Supplier Part #**. Remove all MTX-number references from the modal; reference the part# the user recognizes.
3. **Saving an alternate WRITES to BC** (Jon's expectation → now a requirement): populate the BC **Purchase Price** card (Vendor + Price + Price Date) via `bcPushPurchasePrice` AND the **Item Vendor Catalog** card (Vendor + Lead Time) via `bcUpsertItemVendorLeadTime`. **This reverses the locked "ARC-side-only, no BC write-back" decision** → F072 is now ON the BC-write path (F071 commit-gate applies; uses the hardened B057 `bcPushPurchasePrice` + existing `bcUpsertItemVendorLeadTime`; user-initiated, not auto — distinct from the disabled auto-pricing).
4. **BC VENDORS group → PRIMARY (green) vs Secondary Vendors.** In the selector's BC-vendor list: if a vendor IS the item's primary (Item Card `Vendor_No`), show its pill as **"PRIMARY" in green** (non-selectable). Other vendors are selectable as **SECONDARY**. Rename the "YOUR ALTERNATES" group to **"Secondary Vendors"** — the user-entered alternates ARE the secondary vendors (now BC-linked per #1/#3).

**Impact:** the ARC-side-only build (v1.24.43 Test V.063, branch `claude/f072-alternates`) is superseded — do NOT ship it. Re-scope to the BC-write model (pending Jon's explicit confirm of the #3 pivot given the BC-integrity/pricing-emergency history), then rebuild. Good news: every BC write helper already exists and is hardened (`bcCreateVendor`, `bcPushPurchasePrice` [B057-rebuilt], `bcUpsertItemVendorLeadTime`).

## ✅ PIVOT CONFIRMED (Jon 2026-07-28) — F072 is a BC-write feature
1. **Full BC-write model.** ALT modal Save writes to BC: **Purchase Price** (vendor+price+date, via `bcPushPurchasePrice`) + **Item Vendor Catalog** (vendor+lead time, via `bcUpsertItemVendorLeadTime`). Supplier = a BC vendor via dropdown + **Create New** (`bcCreateVendor`), BC source of truth.
2. **Select-secondary also writes.** Selecting a SECONDARY vendor in the BC Item Browser ALSO pushes/refreshes that vendor's Purchase Price + lead time in BC at select-time (not only in the ALT modal), in addition to pointing the BOM row's purchasing at that vendor.

**Architectural consequence:** BC is now the source of truth for secondary vendors → an item's "Secondary Vendors" list ≈ its BC Purchase Price records (read via `bcFetchPurchasePricesMultiVendor`), minus the primary. The ARC-side `config/itemAlternates` learning DB from the superseded build is likely REDUNDANT (Coach to confirm during re-scope — may drop it entirely). All F072 writes are **user-initiated + F071-gated + use the hardened B057 helpers** (distinct from the disabled auto-pricing). Re-scope → Coach build-ready plan → rebuild.

# B081 scope — Auto-Add BOM Items list shows MTX# instead of Vendor Part #

Scoping lane (read-only), 2026-08-03. Origin: Jon screenshot — Settings → Configuration → AUTO-ADD BOM ITEMS shows `MTX-114593`/`MTX-114825` in PART #; should show the Vendor Part #. Line numbers = current `src/app.jsx`.

## Data trace
- Auto-add items persist to `users/{uid}/config/defaultBomItems` (`loadDefaultBomItems`/`saveDefaultBomItems` ~2632-2644), UI state `defaultItems` seeded ~20438.
- `addBcItem(item)` (~20576-20583) stores `{partNumber:item.number, description:item.displayName, manufacturer:"", qty, unitPrice, priceSource:"bc", priceDate}` — **`item.number` is the internal MTX Item No.** No vendor part# stored.
- Saved-list render (~20823): `{item.partNumber||"—"}` → shows MTX#.
- **KEY:** the BC search (`bcSearchItems` ~5697) already maps ItemCard `Vendor_Item_No` → **`_vendorItemNo`** on every result (~5601). So the vendor part# is present in `bcResults` when the user clicks a result — `addBcItem` discards it. (Live search dropdown ~20789 also prints `item.number`, not `_vendorItemNo`.)
- **Proven pattern:** commit `1075d007` fixed the same concern in the BC Fuzzy box with `{s._vendorItemNo||s.number}` (~33029; also ~26029).
- **Matrix-internal items** (Buyoff/Service, Crate, Contingency — vendor = Matrix Systems): `Vendor_Item_No` almost certainly blank → no external vendor part# exists → fall back to MTX# or description.

## Recommended fix — Option (a): capture at add + fallback render (Low risk, ~3 one-line edits)
1. `addBcItem` (~20580): also store `vendorPartNumber:item._vendorItemNo||""`.
2. Saved-list render (~20823): `{item.vendorPartNumber||item.partNumber||"—"}`.
3. Live search dropdown (~20789): `{item._vendorItemNo||item.number}` (matches fuzzy box).
- Additive field, never strips existing; `partNumber` (MTX#) untouched → extraction/pricing/append (`appendDefaults` ~12841 uses `tpl.partNumber`) unchanged.
- **Fixes future adds.** Does NOT fix already-saved items (Jon's Buyoff/Crate) until re-added — unless a backfill (option c) is added.
- Rejected (b) show description (redundant — already in adjacent column). Optional (c) BC ItemCard backfill for existing items = N async calls, throttle-fragile, still blank for Matrix-internal.

## ⭐ Jon decisions
1. **Matrix-internal items** (blank `Vendor_Item_No`): fall back to **MTX#** (option-a default) or show **description**?
2. **Existing saved entries** (current Buyoff/Crate): acceptable to require a **re-add** to pick up the vendor#, or add a one-time **BC backfill lookup** (option c) so they fix in place on next load?

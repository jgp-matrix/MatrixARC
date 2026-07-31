# Scope — opt-in secondary-vendor RFQs

**Status:** OPEN · feature · **scope SETTLED (Jon 2026-07-31)** — Option A approved; all sub-decisions locked (see "Decisions settled" at bottom). No code written yet; next in build queue behind IP66 + bcFuzzy Fix 1. (Draft 2026-07-30.)

**Feature (Jon 2026-07-30):** at RFQ-send time, let the user confirm whether to ALSO solicit quotes from each item's SECONDARY suppliers. Ruling: *"the only time an item would be quoted by another supplier is if that supplier was listed as a secondary supplier."*

## Current state (all `src/app.jsx`)

- **Routing is single-vendor per item.** `buildRfqSupplierGroups` (7741) groups each eligible row by its displayed `bcVendorName` (7794); one item → one group → one `rfqUploads/{token}` doc + one email (send path `sendAll` 21678). Just-shipped WYSIWYG routing (v1.24.61) must stay byte-for-byte unchanged when the toggle is OFF.
- **Secondary vendors are NOT on the row.** A BOM row carries one `bcVendorName`/`bcVendorNo`. Per F072 (2682-2689) BC is the source of truth: an item's secondary vendors = its BC PurchasePrice records minus the primary. Materialized on demand only, in the Item Browser source selector (`bcFetchPurchasePricesMultiVendor`, 6606 / 25233). So secondary vendors require a **BC fetch** at RFQ time — nothing on the row/Firestore holds them.
- **Send-time UI:** `RfqEmailModal` (21608) is the confirm surface — natural home for the toggle.

## Recommended: Option A — global "include secondary vendors" checkbox (fan-out at build time)

One checkbox in RfqEmailModal. When ON, each eligible item is also added to a group for each of its BC secondary vendors.
- **Data:** one batched `bcFetchPurchasePricesMultiVendor(partNumbers)` (30/call — same call pricing already runs) yields secondaries + prices. Per-(item,vendor) lead times optional (skip for competitive price-only RFQs; BC throttles).
- **Grouping:** an item now appears on MULTIPLE vendor RFQs; dedup within a vendor (merge primary+secondary items for the same vendor into one email).
- **Complexity:** Medium; smallest change matching the ruling exactly.

(Option B = per-item secondary selection — higher precision, more UI/state. Option C = per-primary-group cross-solicit — less intuitive.)

## Decisions needed from Jon
1. Approve Option A (global toggle)?
2. Secondary submissions = comparison-only (user manually adopts via `applySecondary` 30181) vs. auto-applicable? (Recommend comparison-only — auto-apply would violate WYSIWYG primary routing.)
3. Secondary RFQs request lead time too, or price-only?

## Risks
Mapping a secondary quote back to a single-vendor row (don't auto-overwrite primary); duplicate-vendor dedup; RFQ-history/`sentItemIds` double-count (tag secondary tokens e.g. `rfqPurpose:"secondary"`); BC lookup cost; BC-offline disables the toggle (no local fallback); API-vendor (DigiKey/Mouser) items already cross-check — decide if they participate.

## Decisions settled (Jon 2026-07-31)
1. **Option A approved** — single global "include secondary vendors" checkbox in `RfqEmailModal` (21608), fan-out at build time.
2. **Comparison-only** — secondary quotes arrive as comparison data; user manually adopts via `applySecondary` (30181). Primary WYSIWYG routing/pricing (v1.24.61) is NEVER auto-overwritten. Toggle OFF = byte-identical to today.
3. **Price + lead time** — secondary RFQs request BOTH. Requires per-(item,vendor) lead-time lookups → mind BC throttling (batch `bcFetchPurchasePricesMultiVendor`, 30/call; cap/limit LT calls).
4. **Exclude API vendors** — DigiKey/Mouser items already cross-checked via Get-Prices; they do NOT participate in secondary-vendor RFQ fan-out. Secondary RFQs = BC-vendor secondaries only.

**Build-ready** once IP66 + bcFuzzy Fix 1 clear the queue. Guardrails carried: tag secondary tokens `rfqPurpose:"secondary"` (double-count guard); dedup primary+secondary items for the same vendor into one email; BC-offline disables the toggle. Money-path → branch → Coach review → Test → Jon verify before prod.

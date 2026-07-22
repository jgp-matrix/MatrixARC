# F028 — Admin toggle: RFQ all items, ignore Priced Dates — Scope

**Coach scoping lane · 2026-07-22 · read-only · all refs `src/app.jsx`.**

## Ask (Jon)
Dual-ERP (ARC + legacy M1) timing lag → an admin Settings toggle that disregards Priced Dates and requests RFQ pricing for **ALL of a supplier's quotable items** every time, not just stale/missing-price ones. Opt-in, default off.

## Current behavior — the single choke point
All RFQ item-selection lives in `buildRfqSupplierGroups(bom)` → inner `_eligibilityReason(r)` (`:6652-6734`). A row enters an RFQ **only if `_eligibilityReason` returns a non-null reason** (`:6690`). Reasons:
- `missingPrice` = `!r.unitPrice||r.unitPrice===0` (`:6673`)
- `stalePrice` = `!displayDate||displayDate<now-RFQ_STALE_MS` (`:6674`) — **RFQ_STALE_MS is a HARDCODED 60d** (`:6651`), NOT `_pricingConfig.defaultStaleDays`
- `missingLeadTime` = `!_hasFirmLeadTime(r)` (`:6686`)
- Price reasons are suppressed while in a **30-day re-send cooldown** `inCooldown` (`:6671`); `missingLeadTime` always evaluated.

No separate eligible-vs-selected split: `_eligibilityReason` IS both. `RfqEmailModal` (`:19897`) defaults every returned vendor `included=true` and does NOT re-filter by staleness; `RfqDocument` renders whatever rows are in the group. Both `onPrintRfq` (`:38851`) + `onSendRfqEmails` (`:38863`) route through `buildRfqSupplierGroups`. → **`_eligibilityReason` is the one and only choke point** (dual-consumer satisfied; do NOT add a parallel check in the modal/send flow).

## "All quotable items" — what stays excluded (uses the RFQ inline set, NOT `_isExcludedFromPriceCheck`)
`_eligibilityReason`'s own inline exclusions (`:6664-6666`) + group-level vendor filter (`:6731`): labor (`isLaborRow`), `priceSource==="manual"`, contingency (`isContingency`/`CONTINGENCY_PNS`), `RFQ_EXCLUDE_ITEMS` (job buyoff/crate/DIN rail/duct), `RFQ_EXCLUDE_VENDORS` (`^matrix systems|crate|job buyoff`). **Keep this set** (matches today's semantics) — do NOT switch to `_isExcludedFromPriceCheck` (:16262), which differs (checks `customerSupplied`, not `manual`/duct). **★ Open decision:** confirm `customerSupplied` + `manual` rows stay excluded even in all-items mode (Coach + Freddy believe yes — you don't RFQ customer-furnished or hand-entered rows).

## Toggle plumbing (add-only, mirrors `_pricingConfig`; Data-Retention safe)
- `_pricingConfig` default `rfqAllItemsIgnoreStale:false` (`:2214`).
- `loadPricingConfig` `??false` (`:2229`).
- `PricingConfigModal` state (near `:18419`) + `save()` payload (`:18625`); `savePricingConfig` (`:2232`) persists as-is.
- Admin-gated UI toggle (clone the `TooltipToggle` pattern `:18396`; gate `isAdmin()&&(…)` like the F025 block `:18760`), placed under "Price Refresh Thresholds" (`:18735`) — it's the conceptual inverse.

## Where it plugs in (one site)
Inside `_eligibilityReason` (`:6663`): when `_pricingConfig.rfqAllItemsIgnoreStale` and the row passes the exclusion gate, return a reason for EVERY quotable row (a new `forceAll` reason) instead of only stale/missing.
- **The M-portion (not a one-liner):** thread `forceAll` through the group counters `itemsMissingPrice/itemsStalePrice/itemsMissingLeadTime` (`:6717`) and `g.defaultLeadTimeOnly=g.items.every(_hasPrice)&&itemsMissingLeadTime>0` (`:6728`) so forced rows don't flip the group into lead-time-only mode — forced rows read as a PRICE request; keep `defaultLeadTimeOnly` false whenever the flag is on.

## Open decisions for Jon
1. **★ Cooldown:** with the flag ON, also bypass the 30-day `RFQ_SENT_COOLDOWN` (`:6671`)? The dual-ERP-lag motivation is "disregard recency," so Coach + Freddy recommend YES (else a recently-RFQ'd fresh item still won't re-send). Confirm.
2. **Exclusions:** confirm `customerSupplied` + `priceSource:"manual"` rows stay excluded in all-items mode (recommend yes).

## Interactions / risks
- **Status routing:** broader RFQs stamp `rfqSentDate` on more rows → `hasActiveRfqs` holds projects in the `rfqs` bucket longer (expected consequence of quoting more).
- Email/PDF/portal `lineItems` grow (no hard cap; fine). Per-token cost caps NOT affected (keyed to uploaded PDF pages, not requested line count). B003 not-quoted noise NOT affected (already hidden).
- Clean **opt-in**, default OFF → existing behavior fully preserved unless an admin enables it.

**Build size: S–M** (flag+config+UI = S; the `forceAll`-through-counters threading = M). Money-path-adjacent → Coach review before deploy.

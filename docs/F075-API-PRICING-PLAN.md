# F075 — Re-enable Auto-Pricing for API Sources Only (Mouser + DigiKey) — Plan

**Author:** Sam Wize (Coach), filed by Freddy · 2026-07-29 · Scope: `src/app.jsx`. DESIGN — awaiting Jon's decision (§ options + §5).

## Headline (changes the shape of the work)
**The disabled engines never sourced Mouser/DigiKey.** `runPricingOnPanel` (:30297) and `runPricingBackground` (:16665) — the two functions gated by `AUTO_PRICING_ENABLED` — fan out to **BC → Codale → custom-scrapers → AI-estimate only**. Neither ever calls `mouserSearch`/`digikeySearch`. The **only** auto API-pricing is the **RFQ-send `apiGroups` path (:21558-21638)**, which is **already ungated and works in prod today** (verified — not gated by any of the three kill-switches; comments at :31863 explicitly note DigiKey/Mouser are unaffected).

So re-enabling API pricing is NOT a flip of `AUTO_PRICING_ENABLED` (that flag governs BC-pull + scrapers + AI — exactly what Jon wants OFF). No kill-switch changes.

## Kill-switches (unchanged)
- `SCRAPER_BC_WRITEBACK_ENABLED=false` (:6147) — scraper→BC writeback (Codale :30628, custom :30739). STAYS OFF.
- `AUTO_BC_REPRICE_ENABLED=false` (:6153) — 5-min reprice poll (:26892) + on-open check (:40719). STAYS OFF.
- `AUTO_PRICING_ENABLED=false` (:6159) — master (both engines + "Get New Pricing" UI :31865). STAYS OFF (it drives scrapers/AI).

## Where Mouser/DigiKey actually run
RFQ-send apiGroups auto-fetch (:21558; `onApiPriced` :43109 writes rows client-side only, no BC write; `onApiAlternates` :43147 writes the cheaper alternate to BC — API-source, already live). Plus manual Settings tools: `_vSync` bulk sync (:44924), test panels (:43932/:44699). All ungated, already working.

## Options (Jon picks)
### Option A — "It already works; make it discoverable" (RECOMMENDED, minimal)
No new engine. Kill-switches stay off. Only fix the **misleading UI copy**: the panel "Get New Pricing" button + the two `arcAlert`s (:31868/:31874) say "Automated pricing is paused — send an RFQ." Reword to point at the RFQ→API-vendor flow (which auto-fetches Mouser/DigiKey on send). Zero money-path code change. Lowest risk.

### Option B — Add a standalone API-only pricing button (new flag)
New `API_PRICING_ENABLED=true` gating a **dedicated** `runApiPricingOnPanel` that calls ONLY `digikeySearch`+`mouserSearch` (reuse the :21562-21617 cross-check merge), writes rows client-side (mirror `onApiPriced`). Re-gate the panel button (:31865) on the new flag → new helper (NOT `runPricingOnPanel`). HARD INVARIANT: never touch Codale (:30549), custom-scrapers (:30652), `estimatePrices` (:30786/:16803), or the scraper→BC writeback. Adds a non-RFQ trigger only.

## Data-safety
- API prices can't enter the scraper→BC writeback (that's scraper-block-only, behind the off flag) or the AI-estimate path (`estimatePrices` only runs on price-less rows). ✓
- Existing API→BC writes (`onApiAlternates` :43147, `_vSync` :44951) are API-source-only, already live, never implicated in the $0.71 incident (that was Royal/Codale scraper "first-$-on-page"). APIs return structured prices — no scrape failure mode.
- **Optional (rec):** add a source-agnostic >$0/sanity plausibility gate to `bcPushPurchasePrice` before widening any API→BC write — cheap insurance.

## §5 Open decisions for Jon
1. **Option A (copy fix) vs B (standalone button)?** — Coach rec: A (it already works; B only adds a non-RFQ trigger).
2. Flag name if B: `API_PRICING_ENABLED`.
3. Panel Get-Pricing button reappear for API-only? (if yes → new narrow helper, never `runPricingOnPanel`).
4. UI copy replacement for :31868/:31874 (proposed: "Automated BC/scraper pricing is paused. Mouser/DigiKey pricing runs automatically when you send an RFQ to an API vendor.").
5. Add the plausibility gate to `bcPushPurchasePrice`? (rec: yes.)
6. Leave `_vSync` bulk sync as-is? (assumed yes.)

## Verification (Test host, disposable project)
Send RFQ to a DigiKey/Mouser vendor → confirm apiGroups fetch + `onApiPriced` stamp (Option A validity). Regression: trigger any pricing → confirm NO Codale/customScraper CF call + NO scraper→BC write + no `estimatePrices`. Option B: new button calls only digikey/mouser, client-side write, no primary BC push. Confirm reworded copy.

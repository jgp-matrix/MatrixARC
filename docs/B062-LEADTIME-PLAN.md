# B062 — BC Item Browser lead-time flow: build-ready plan

**Scope author:** Sam Wize (Coach, read-only trace) · **Orchestrated:** Freddy Lyst · **Date:** 2026-07-27 · base prod v1.24.38
**Money-path-adjacent** (LT feeds row-red/RFQ eligibility via `_hasFirmLeadTime` #175 SSOT, + panel ship-date chip). Two symptoms, one pass.

## Jon decisions (LOCKED 2026-07-27)
- **Q1 LT source:** **`bc_vendor` (ItemVendorCatalog) is authoritative** — read it first, ItemCard (`bc_item`) as fallback. (Matrix keeps lead times per-vendor; item cards often blank → why the column shows "—" for everything.)
- **Q2 fetch strategy:** **lazy — visible rows only** (remove the 12-row cap; fetch LT as rows scroll into view; no full-result fetch storm).
- **Q3 manual override:** **overwrite a manual LT on USE/re-select** (explicit user action; make it deliberate, not accidental).
- **Q4 re-select fan-out:** **full-sync across all Lines** (like F065) — a same-part re-select propagates LT to the same part on every Line.

## Symptom summary
1. **BC Item Browser shows NO lead time for any item** — it has a Lead column and DOES fetch, but reads only the weaker `bc_item` (ItemCard `Lead_Time_Calculation`), never the authoritative per-vendor `bc_vendor` (ItemVendorCatalog); + a 12-row enrich cap; + USE discards the displayed LT.
2. **Re-select doesn't push LT** — `commitBcItem`'s fan-out is PRICE-ONLY (correct only for a TRUE cross where B's LT is still resolving; wrong for a same-part re-select).

## Real symbols (brief premises were off)
- NO `bcGetItemLeadTimeDays`. Real fetchers: **`bcLookupLeadTime(pn)`** (ItemCard → `bc_item`) `src/app.jsx:4703`; **`bcLookupItemVendorLeadTime(pn,vendorNo)`** (ItemVendorCatalog Page 114 → `bc_vendor`) `:4834`.
- Precedence `supplier→scraper→bc_vendor→bc_item→ai` lives in `runPricingBackground` `:16141-16188` (`:16157` bc_vendor, `:16158` bc_item fallback).
- SSOT `_hasFirmLeadTime(r)` `:16780` (`!!r.leadTimeSource && r.leadTimeSource!=="ai"`) drives BOTH row-red and RFQ LT-eligibility (#175).
- **⚠ CRITICAL:** `runPricingBackground`/`runPricingOnPanel` early-return on `AUTO_PRICING_ENABLED=false` (RFQ-only kill-switch) → the whole BC-LT precedence pass is DISABLED. So the Item Browser USE path is currently the PRIMARY live BC-LT path → raises B062 priority.
- `computeControlPanelLeadTime` `:1401` reads `r.leadTimeDays`/`r.leadTimeSource` off the bom (`:1562`) → a correctly-stamped LT feeds the ship-date chip automatically.

## Symptom 1 fix — `BCItemBrowserModal` (:23696) + `enrichVendorNames` (:23982)
Existing: Lead header `:24375`; Lead cell `:24518-24520` shows `leadTimeData[item.number]`; populated in `enrichVendorNames` via inline ItemCard SELECT `:24009-24014` (bc_item only); vendor already resolved at `:23998` (`bcGetItemVendorNo`).
1. **`enrichVendorNames` :24007-24014** — prefer `bcLookupItemVendorLeadTime(it.number,vNo)` (bc_vendor); fall back to the ItemCard value (bc_item). Store `{days,source}` (widen `leadTimeData` or add parallel `leadTimeSrc`). Mirror the `:16157-16158` precedence (SSOT).
2. **`:23992` 12-row cap** — replace `.slice(0,12)` with **lazy-on-visible** LT fetch (Q2): fetch LT for rows as they scroll into view (IntersectionObserver or on-render-visible), not all N at once. (MFR/Vendor/Last-Purchased share the cap — scope the lazy change to LT; leave the others unless trivial.)
3. **Lead cell tooltip** `:24518` — optionally show source (`bc_vendor`/`bc_item`).
4. **USE handlers** `:24384` (row), `:24526` (Use btn), `:24349` (created), `:24165` (customer-supplied) — attach `_leadTimeDays`/`_leadTimeSource` from `leadTimeData[item.number]` onto the `item` passed to `onSelect`.
5. **`commitBcItem` .map ~:28545-28556** — if `bcItem._leadTimeDays!=null`, stamp `leadTimeDays/leadTimeSource/leadTimeUpdatedAt/leadTimeEstimated:false` **synchronously** so the row shows LT immediately + the fan-out (§Symptom 2) can read it.
6. **`_f068ItemCardP` IIFE :28591-28612** — guard so it does NOT clobber a just-stamped `bc_vendor` LT with a weaker `bc_item` one. Per Q3, a USE/re-select MAY overwrite a `manual` LT (explicit action) — but make it a deliberate check, not accidental.

Haiku row-locate (`locateInDrawing`/`locateInRegion` :23791/:23849) is UNRELATED to LT — leave out of scope.

## Symptom 2 fix — `commitBcItem` (:28460) re-select LT full-sync
- Fan-out via `_maybePromptCrossLine` `:28095` (gated by `crossLineDuplicates`); full-sync patch builder SSOT `_fullCrossLinePatch` `:28071`. Direct cell edits already send the full patch (`:28283/:28285`). But `commitBcItem` sends price-only at `:28654-28662` (F065/F2 comment `:28657-28660` — correct ONLY for a true cross).
- **Split by whether the PN changed:**
  - **Same-part re-select** (`normPart(bcFullPN)===normPart(_f068OldA)`): **defer** the `_maybePromptCrossLine` fan-out inside `Promise.allSettled([_f068VendorP,_f068ItemCardP]).then(...)` (F068 pattern), then fire with `_fullCrossLinePatch(settledRow)` re-read from `latestPanelRef.current` (carries freshly-landed LT+vendor). **Q4 = full-sync across all Lines.**
  - **True cross** (`!==`): leave the immediate price-only fire (`:28661`) + F068 deferred cross-propagation (`:28669`) **UNCHANGED** — do not touch the true-cross LT timing (F068's fix depends on B's LT landing async).
  - The two branches are mutually exclusive by the `===`/`!==` PN test — verify a single commit never fires both.

## Data-safety + SSOT
Additive only (all 4 LT fields in the preserve list; `{...r,...}` spread; no LT-field delete). Single save (`commitBcItem` saves once `:28649`; IIFEs use `_noBumpWrite` — don't add a 2nd write). Manual-override: overwrite-on-USE is Jon-approved (Q3) but must be a deliberate check. Route the browser LT read through the same `bc_vendor→bc_item` precedence as `:16157-16158`; keep `_fullCrossLinePatch` the single fan-out patch builder.

## Interactions / risk
- F065/F068 share `commitBcItem`+propagate → the §2 split is additive; verify mutual exclusivity.
- RFQ-only kill-switch: `bcLookupItemVendorLeadTime`/`bcLookupLeadTime` are NOT gated (only the `runPricing*` wrappers are) → calling them directly from the browser/`commitBcItem` is fine and does NOT re-enable auto-pricing. Do NOT route the browser LT through `runPricingOnPanel` (it early-returns).
- `computeControlPanelLeadTime` picks up a stamped LT automatically; verify the chip refreshes after USE (via existing `onUpdate`).
- Cost: lazy-on-visible avoids the fetch storm; enrich loop already spaces 30ms (`:24017`) + aborts stale searches (`:23989`).

## Build order
1. `enrichVendorNames` :24007-24014 — bc_vendor LT (ItemCard fallback), store source.
2. `enrichVendorNames` :23992 — lazy-on-visible (remove 12-cap for LT).
3. Lead cell :24518 — optional source tooltip.
4. USE handlers :24384/:24526/:24349/:24165 — attach `_leadTimeDays`/`_leadTimeSource`.
5. `commitBcItem` ~:28545 — sync LT stamp from `bcItem._leadTimeDays` (deliberate manual-overwrite per Q3).
6. `commitBcItem` `_f068ItemCardP` :28601 — guard against clobbering a stronger/just-stamped LT.
7. `commitBcItem` fan-out :28654-28674 — deferred same-part-reselect full-sync branch (Q4); true-cross paths unchanged.

## Gates & repro
Gates: `node validate_jsx.js` → `tools/check-syntax.sh` → `tools/check-scope.js` → `tools/review.sh` on the diff (money-adjacent). No functions/ changes.
- **Symptom 1 repro:** unpriced row → Item Browser → search a part with an ItemVendorCatalog LT but blank ItemCard `Lead_Time_Calculation` → Lead column shows the bc_vendor days; USE stamps `leadTimeDays`+`leadTimeSource:"bc_vendor"`, row un-reds.
- **Symptom 2 repro:** same part# on 2 Lines (a `crossLineDuplicates` pair) → re-select that part on one row → fan-out now carries LT (not just price) to the sibling → sibling un-reds. Then a TRUE cross A→B → sibling-on-A still full-syncs via F068 with B's LT (no A-stale-LT regression).

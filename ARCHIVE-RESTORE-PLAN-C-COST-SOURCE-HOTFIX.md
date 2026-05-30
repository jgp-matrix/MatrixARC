# Milestone C Hotfix — Cost Source Correction

**Date:** 2026-05-28
**Author:** Coach (Senior Dev Engineer, Architecture)
**Triggered by:** Production smoke test of buildRestorePreview (v1.20.28+)
**Severity:** Architectural — drift detection produces wrong results for every row
**Status:** Spec v2 — Analyst H1-H6 refinements folded in. Awaiting Jon greenlight + ARC Dev implementation.

---

## Table of Contents

1. [Architectural Rationale](#1-architectural-rationale)
2. [Code Changes Required](#2-code-changes-required)
3. [Edge Cases](#3-edge-cases)
4. [BC Call Count Impact](#4-bc-call-count-impact)
5. [UI Implications](#5-ui-implications)
6. [Implementation Phases](#6-implementation-phases)
7. [TODO — F2 Lesson Learned](#7-todo--f2-lesson-learned)

---

## 1. Architectural Rationale

### 1.1 The Bug

The current `buildRestorePreview` (app.jsx lines 9091-9133) compares:

- **Live:** `bcFetchItemCardCosts` → `unitCost` (BC ItemCard `Unit_Cost`)
- **Archived:** `archivedRow.bcItemCardCost` → always `null` → **falls back to `unitPrice`**

**Problem 1 — The archived field doesn't exist.** `bcItemCardCost` is never stored on BOM rows. It's a computed field that exists only in pricing audit result objects (line 5034: `results.push({...s, bcPurchasePrice:bcPp, bcItemCardCost:bcIc, ...})`). The `archiveProject` function (line 8833) does a full deep clone of the project — BOM rows come through as-is with no `bcItemCardCost` field. Therefore `archivedRow.bcItemCardCost` is **always** `null` or `undefined`, and the code **always** takes the legacy fallback path (lines 9105-9107).

**Problem 2 — The fallback comparison is wrong.** Once in fallback, the code compares BC ItemCard `Unit_Cost` (live) against `unitPrice` (archived). These are different things:
- `Unit_Cost` is a global placeholder field on the BC ItemCard — in Jon's environment it is not the operational cost reference.
- `unitPrice` is the ARC sell-side price. It may contain markup, manual edits, or Direct_Unit_Cost written during re-verify (line 4638-4639). Comparing these produces misleading drift deltas.

**Problem 3 — The F2 decision was wrong.** Coach finding F2 (Draft v1) flagged that `bcFetchPurchasePrices` appeared in the supplement's query table but wasn't consumed by the drift comparison. The recommendation was to clarify whether it was needed for Milestone C. Jon confirmed dropping it. ARC Dev implemented accordingly in Draft v2 (§7.2 deferral, §6.2 lock-in to Unit_Cost). This was incorrect — `Direct_Unit_Cost` from `bcFetchPurchasePrices` is the real operational cost in Jon's BC environment.

### 1.2 The Correct Design

Drift detection should compare:

- **Live:** `bcFetchPurchasePrices` → `directUnitCost` (BC Purchase Prices `Direct_Unit_Cost`), matched on `(partNumber, bcVendorNo)` from the archived BOM row
- **Archived:** `archivedRow.unitPrice` — the only price field stored on BOM rows

This is **not** apples-to-apples (Direct_Unit_Cost is a vendor-specific buy-side cost; unitPrice may include markup or manual edits), but it is the best available comparison because:

1. `unitPrice` is the only numeric cost field stored on BOM rows (no `bcPurchasePrice` or `bcItemCardCost` exists)
2. For rows where `priceSource === "bc"`, `unitPrice` **was** written from `Direct_Unit_Cost` during the last pricing sync (line 4638-4639: `unitPrice: pp.directUnitCost`), so the comparison IS valid for the common case
3. For rows where `priceSource !== "bc"` (manual, scraper, etc.), the comparison is approximate — flag these with `legacyFallback: true`

**Known limitation — `priceSource` staleness (H1):** The `priceSource` field reflects the last pricing *operation*, not the last edit. If a user manually edits `unitPrice` after a BC re-verify (e.g., applying sales markup or a custom adjustment), `priceSource` remains `"bc"` but `unitPrice` no longer represents the BC `Direct_Unit_Cost`. This means `legacyFallback` undercounts the "comparison approximate" cases — some rows flagged as precise drift may actually reflect the user's own markup, not BC cost movement. In practice most rows in Jon's environment are BC-priced and not subsequently hand-edited, so the misleading-drift rate should be low. This limitation should be noted in the UI tooltip (see §5.2) and revisited in Milestone D, where finer-grained unitPrice provenance tracking (e.g., last-edit timestamp vs last pricing-sync timestamp) could be used to set `legacyFallback` more accurately.

**`bcFetchItemCardCosts` is retained** for existence checks and description drift only. It is not removed.

### 1.3 `bcFetchPurchasePrices` Return Shape Problem

The current `bcFetchPurchasePrices` (lines 4900-4929) returns `Map<partNumber, {vendorNo, directUnitCost, startingDate, uom}>` — keyed by part number only. When BC returns multiple vendor records for the same part, the function keeps only the record with the most recent `Starting_Date` (line 4921-4923). This loses vendor specificity.

For drift detection, we need to look up `Direct_Unit_Cost` for a **specific** `(partNumber, bcVendorNo)` pair — the vendor that was on the archived BOM row. If we use the current function as-is, we might compare against the wrong vendor's price.

**Fix:** Add a vendor-aware return mode. Two options:

- **Option A (recommended):** New function `bcFetchPurchasePricesMultiVendor(partNumbers, opts)` that returns `Map<"partNumber:vendorNo", {directUnitCost, startingDate, uom}>`. Same OData query, different keying. Zero disruption to existing callers of `bcFetchPurchasePrices`.
- **Option B:** Add an `opts.multiVendor` flag to the existing function that changes the return shape. Riskier — callers must know which shape they're getting.

The OData query itself needs no change — BC already returns all vendor records per item. The only change is client-side: iterate all `d.value` records and key by `${rec.Item_No}:${rec.Vendor_No}` instead of deduplicating to most-recent.

---

## 2. Code Changes Required

### 2.1 New Function: `bcFetchPurchasePricesMultiVendor`

**Location:** After `bcFetchPurchasePrices` (after line 4929)

```js
// Batch-fetch Purchase Prices from BC, keyed by partNumber:vendorNo.
// Returns ALL vendor records per part (no dedup). Used by drift detection
// where the comparison target is the specific vendor on the archived BOM row.
async function bcFetchPurchasePricesMultiVendor(partNumbers, opts) {
  if (!_bcToken || !partNumbers.length) return new Map();
  const allPages = await bcDiscoverODataPages();
  const ppPage = allPages.find(n => /purchase.?price/i.test(n));
  if (!ppPage) { console.warn("bcFetchPurchasePricesMultiVendor: no PurchasePrices OData page"); return new Map(); }
  const baseUrl = `${BC_ODATA_BASE}/${ppPage}`;
  const results = new Map();
  const BATCH = 30;
  for (let i = 0; i < partNumbers.length; i += BATCH) {
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const batch = partNumbers.slice(i, i + BATCH);
    const filterClauses = batch.map(pn => `Item_No eq '${pn.replace(/'/g, "''")}'`).join(' or ');
    const url = `${baseUrl}?$filter=${encodeURIComponent(filterClauses)}&$select=Item_No,Vendor_No,Direct_Unit_Cost,Starting_Date,Unit_of_Measure_Code`;
    try {
      const r = await fetch(url, {
        headers: { "Authorization": `Bearer ${_bcToken}`, "Accept": "application/json" },
        signal: opts?.signal
      });
      if (!r.ok) { console.warn("bcFetchPurchasePricesMultiVendor batch failed:", r.status); continue; }
      const d = await r.json();
      (d.value || []).forEach(rec => {
        const key = `${rec.Item_No || ''}:${rec.Vendor_No || ''}`;
        const sd = rec.Starting_Date ? new Date(rec.Starting_Date).getTime() : 0;
        const existing = results.get(key);
        // Per vendor+part combo, keep the most recent Starting_Date
        if (!existing || sd > (existing.startingDate || 0)) {
          results.set(key, {
            directUnitCost: rec.Direct_Unit_Cost || 0,
            startingDate: sd || null,
            uom: rec.Unit_of_Measure_Code || ''
          });
        }
      });
    } catch (e) {
      if (e.name === "AbortError") throw e;
      console.warn("bcFetchPurchasePricesMultiVendor batch error:", e);
    }
  }
  console.log("[BC] Fetched multi-vendor Purchase Prices:", results.size, "entries for", partNumbers.length, "items");
  return results;
}
```

**Key design decisions:**
- Separate function, not a flag on the existing one — `bcFetchPurchasePrices` has established callers (line 4633, pricing sync) that expect the current return shape.
- Dedup within each `(partNumber, vendorNo)` pair by most recent `Starting_Date` — BC may have historical price records for the same vendor.
- AbortController support via `opts.signal` — threaded to `fetch()` and checked before each batch.
- Same 30-item batching and OData query as `bcFetchPurchasePrices` — identical BC API cost.

### 2.2 Rewrite `buildRestorePreview` Items Section (lines 9091-9133)

**Current code (WRONG):**
```js
// Line 9097: Fetches ItemCard Unit_Cost only
const itemCostMap = await bcFetchItemCardCosts(partNumberArr, {signal});

// Lines 9102-9103: Reads nonexistent field, always null
let archivedCost = archivedRow.bcItemCardCost;
```

**New code:**
```js
// Fetch BOTH: ItemCard for existence+description, PurchasePrices for cost drift.
// Graceful degradation (H2): if one fetch fails, the other's data is still usable.
// AbortError always re-throws — modal-close abort must propagate immediately.
let itemCostMap = new Map();
let ppMap = new Map();
let ppFetchFailed = false;

const itemCardPromise = bcFetchItemCardCosts(partNumberArr, {signal})
  .then(map => { itemCostMap = map; })
  .catch(e => { if (e.name === "AbortError") throw e; errors.push({section: "items", message: "ItemCard fetch failed: " + e.message}); });

const ppPromise = bcFetchPurchasePricesMultiVendor(partNumberArr, {signal})
  .then(map => { ppMap = map; })
  .catch(e => { if (e.name === "AbortError") throw e; ppFetchFailed = true; errors.push({section: "items", message: "PurchasePrices fetch failed: " + e.message}); });

await Promise.all([itemCardPromise, ppPromise]);

for (const pn of partNumberArr) {
  const liveItem = itemCostMap.get(pn);
  const archivedRow = firstRowByPn.get(pn) || {};
  const archivedVendor = (archivedRow.bcVendorNo || "").trim();

  // Drift comparison: live Direct_Unit_Cost for this part+vendor vs archived unitPrice
  const ppKey = `${pn}:${archivedVendor}`;
  const livePp = ppFetchFailed ? null : ppMap.get(ppKey);

  // Archived cost: unitPrice is the only price field stored on BOM rows.
  // For priceSource==="bc" rows, this was originally Direct_Unit_Cost.
  // Note (H1): priceSource reflects last pricing operation, not last edit —
  // manual edits after BC re-verify leave priceSource as "bc" but unitPrice
  // no longer represents the BC cost. legacyFallback undercounts these cases.
  let archivedCost = archivedRow.unitPrice;
  let legacyFallback = archivedRow.priceSource !== "bc";

  // Live cost: prefer vendor-specific Direct_Unit_Cost from Purchase Prices
  let liveCost = livePp ? livePp.directUnitCost : null;
  let costSource = livePp ? "purchase_price" : (ppFetchFailed ? "cost_check_unavailable" : "none");

  // Fallback: if no purchase price for this vendor, use ItemCard Unit_Cost (less accurate)
  if (liveCost == null && liveItem && !ppFetchFailed) {
    liveCost = liveItem.unitCost;
    costSource = "item_card_fallback";
    legacyFallback = true;
  }

  if (!liveItem) {
    itemResults.push({
      partNumber: pn, costStatus: "missing", descStatus: "unknown",
      archivedCost: archivedCost ?? null, liveCost: null, delta: null,
      archivedDescription: archivedRow.description || "", liveDescription: null,
      legacyFallback, costSource, archivedVendor
    });
  } else {
    const liveDesc = liveItem.description || "";
    const archivedDesc = archivedRow.description || "";

    // Cost drift check — skip if PurchasePrices fetch failed (H2: degrade, don't mislead)
    let costStatus = ppFetchFailed ? "cost_check_unavailable" : "ok";
    let delta = null;
    if (!ppFetchFailed && liveCost != null && archivedCost != null && archivedCost !== 0) {
      delta = (liveCost - archivedCost) / archivedCost;
      if (Math.abs(delta) > COST_DRIFT_THRESHOLD) costStatus = "cost_drift";
    } else if (!ppFetchFailed && (liveCost === 0 || liveCost == null)) {
      costStatus = "zero_cost";
    }

    // Description drift check — independent of cost data, always available if ItemCard succeeded
    let descStatus = "ok";
    if (liveDesc && archivedDesc && liveDesc !== archivedDesc) descStatus = "description_changed";

    itemResults.push({
      partNumber: pn, costStatus, descStatus,
      archivedCost: archivedCost ?? null, liveCost: liveCost ?? null,
      delta, archivedDescription: archivedDesc, liveDescription: liveDesc,
      legacyFallback, costSource, archivedVendor
    });
  }
}
```

**Key changes from current code:**
1. Fetches `bcFetchPurchasePricesMultiVendor` in parallel with `bcFetchItemCardCosts` — but with **graceful degradation** (H2): each fetch catches independently. If PurchasePrices fails, ItemCard data (existence + description drift) still renders. AbortError always re-throws.
2. Looks up live cost by `partNumber:bcVendorNo` key — vendor-specific comparison
3. Archived cost is `unitPrice` (the only field that exists), qualified by `priceSource` (with H1 staleness caveat noted in code comment)
4. Falls back to ItemCard `Unit_Cost` only when no Purchase Price exists for the specific vendor
5. Adds `costSource` field to results: `"purchase_price"`, `"item_card_fallback"`, `"cost_check_unavailable"`, or `"none"`
6. Adds `archivedVendor` to results for UI display
7. New `costStatus: "cost_check_unavailable"` when PurchasePrices fetch failed — distinguishes "we couldn't check" from "we checked and it's ok"

### 2.3 Plan Document Updates

The following plan sections must be revised:

| Section | Current (wrong) | New (corrected) |
|---------|-----------------|-----------------|
| §3.3 | `bcFetchItemCardCosts` signal refactor only | Add `bcFetchPurchasePricesMultiVendor` with signal support |
| §3.4 pseudocode line 229 | `itemCostMap = await bcFetchItemCardCosts(...)` | `[itemCostMap, ppMap] = await Promise.all([bcFetchItemCardCosts(...), bcFetchPurchasePricesMultiVendor(...)])` |
| §6.1 query table | "Items (existence + cost)" — 1 endpoint, 3 calls | Two rows: "Items (existence + desc)" via ItemCard 3 calls + "Items (cost drift)" via PurchasePrices 3 calls |
| §6.2 price comparison target | Live=Unit_Cost, Archived=bcItemCardCost | Live=Direct_Unit_Cost (vendor-specific), Archived=unitPrice (qualified by priceSource) |
| §7.1 | Signal refactor for bcFetchItemCardCosts only | Add §7.1a for bcFetchPurchasePricesMultiVendor |
| §7.2 | "bcFetchPurchasePrices deferred to Milestone D" | DELETED — purchase prices are now consumed in Milestone C |
| §8 edge case row 6 | "Legacy archive row with null bcItemCardCost" | "Archived priceSource !== 'bc'" — flag as approximate |
| §10.2 progressive load timing | "Items section loads last (~3s for 80 parts)" | "Items section loads last (~4s for 80 parts — 2×3 batches via Promise.all)" |

**Note (H6):** The "Current (wrong)" column references plan section numbers (§3.3, §6.1, etc.), not line numbers. Plan line numbers have shifted across Draft v1→v3 edits. ARC Dev should locate sections by heading name, not line number — consistent with established practice.

### 2.4 Scope Checker Impact

`bcFetchPurchasePricesMultiVendor` is a new module-scope `async function` declaration. It will:
- Be visible to the scope checker as a new global
- **Not** need GLOBAL_ALLOWLIST addition (it's defined and called within the same module scope)
- Need to be called from `buildRestorePreview` (already in module scope) — no scope issues

Confirm zero scope-checker violations before deploy.

---

## 3. Edge Cases

### 3.1 No Purchase Price for Archived Vendor

**Scenario:** Archived BOM row has `bcVendorNo: "V10000"` and `partNumber: "CABLE-001"`. BC has purchase prices for `CABLE-001` from vendor `V20000` but NOT `V10000`.

**Behavior:** `ppMap.get("CABLE-001:V10000")` returns `undefined`. Falls back to ItemCard `Unit_Cost` via `itemCostMap.get("CABLE-001")`. Result has `costSource: "item_card_fallback"`, `legacyFallback: true`.

**UI:** Shows drift with info icon: "No vendor-specific price — using ItemCard Unit_Cost."

### 3.2 Archived `priceSource` is Not "bc"

**Scenario:** Row was priced manually (`priceSource: "manual"`) or via scraper (`priceSource: "scraper"`). The `unitPrice` value does not represent a `Direct_Unit_Cost` that came from BC.

**Behavior:** `legacyFallback: true`. Drift is calculated but flagged as approximate.

**UI:** Info icon: "Archived price was manually set — cost comparison approximate."

### 3.3 Archived Row Has No `bcVendorNo`

**Scenario:** BOM row was added before vendor assignment, or vendor was cleared.

**Behavior:** `ppKey` is `"CABLE-001:"` — unlikely to match any BC purchase price record (vendor field would be empty string). Falls back to ItemCard `Unit_Cost`.

**UI:** Same as 3.1 — "No vendor-specific price" info icon.

### 3.4 Part Exists in BC But Has Zero Direct_Unit_Cost

**Scenario:** Purchase price record exists but `Direct_Unit_Cost` is 0.

**Behavior:** `livePp.directUnitCost` is 0. `liveCost` is 0. `costStatus` becomes `"zero_cost"` (line: `liveCost === 0`).

**UI:** Yellow flag: "Live cost is zero — verify in BC."

### 3.5 Multiple Starting_Date Records Per Vendor+Part

**Scenario:** BC has price records for `(CABLE-001, V10000)` with Starting_Date 2025-01-01 and 2025-06-01.

**Behavior:** `bcFetchPurchasePricesMultiVendor` keeps the most recent per `(partNumber, vendorNo)` key (the 2025-06-01 record). This is correct — we want the current effective price.

**Null Starting_Date (H4):** A record with null `Starting_Date` is treated as epoch 0 (older than any dated record). It is only used if it is the sole record for that `(part, vendor)` pair. This is intentional — null-date records are typically "draft" or "no expiration" prices in BC, and using them as a last-resort fallback is reasonable. A null-date record that is the only record is better than no price data at all.

### 3.6 PurchasePrices Fetch Fails Mid-Preview (H2)

**Scenario:** `bcFetchPurchasePricesMultiVendor` returns a network error or 401/403 (e.g., BC token expired mid-request), but `bcFetchItemCardCosts` succeeds.

**Behavior:** `ppFetchFailed = true`. All items render with `costStatus: "cost_check_unavailable"`, `costSource: "cost_check_unavailable"`. Existence checks and description drift still surface normally from ItemCard data. The error is recorded in the top-level `errors[]` array.

**UI:** Items section renders with a yellow banner: "Purchase price check failed — cost drift data unavailable. Item existence and description checks are still valid." Each item row shows a dash or "N/A" in the cost drift column instead of misleading zeroes.

**Inverse scenario:** If `bcFetchItemCardCosts` fails but `bcFetchPurchasePricesMultiVendor` succeeds, `itemCostMap` is empty. Every item shows `costStatus: "missing"` (no `liveItem` found). Cost data from ppMap is available but cannot be displayed without the existence anchor from ItemCard. This is acceptable — the "missing" status is accurate from the ItemCard perspective and the user can retry.

### 3.7 `bcFetchPurchasePrices` Existing Callers Unaffected

The pricing re-verify flow (line 4633) calls `bcFetchPurchasePrices` (single-vendor dedup). This function is unchanged. The new `bcFetchPurchasePricesMultiVendor` is additive — no existing code paths are affected.

---

## 4. BC Call Count Impact

### 4.1 Before Hotfix (Current Deployed)

| Reference | BC Endpoint | Calls (80 parts, 1 customer, 6 vendors) |
|-----------|-------------|------------------------------------------|
| Items (cost + existence) | ItemCard | 3 (30/batch) |
| Customer | customers | 1 |
| Vendors | vendors | 6 |
| **Total** | | **~10 calls** |

### 4.2 After Hotfix

| Reference | BC Endpoint | Calls (80 parts, 1 customer, 6 vendors) |
|-----------|-------------|------------------------------------------|
| Items (existence + description) | ItemCard | 3 (30/batch) |
| Items (cost drift) | PurchasePrices | 3 (30/batch) |
| Customer | customers | 1 |
| Vendors | vendors | 6 |
| **Total** | | **~13 calls** |

**Delta:** +3 BC calls (one PurchasePrices batch per 30-item chunk, same count as ItemCard batches).

**Latency impact:** The two item fetches run in `Promise.all`, so they overlap. Net latency increase for the Items section: **near zero** (limited by the slower of the two, not the sum). Overall preview load time stays at ~4 seconds.

**This matches the original Supplement §2.1 design** which specified ~13 calls. The F2 deferral reduced it to ~10; this hotfix restores the original call count.

### 4.3 Cache Behavior

The `_restorePreviewCache` (line 8957) already caches the `items` section result. After the hotfix, the cached `items` result will include the purchase-price-based drift data. The 5-minute `bcTokenFingerprint` staleness check (line 8968) applies equally — no cache changes needed. No explicit cache-version bump is required (H3): `_restorePreviewCache` is an in-memory Map that resets on every page load/deploy, so the new ppMap-keyed result shape is never mixed with the old ItemCard-only shape.

---

## 5. UI Implications

### 5.1 New `costSource` Field in Item Results

Each item result now includes `costSource: "purchase_price" | "item_card_fallback" | "cost_check_unavailable" | "none"`. The RestorePreviewModal items table should display this context:

- **`purchase_price`:** No annotation needed — this is the correct, vendor-specific comparison.
- **`item_card_fallback`:** Info icon with vendor context (see §5.3/H5): "No price for vendor {archivedVendor} — using ItemCard Unit_Cost."
- **`cost_check_unavailable`:** Yellow warning icon: "Cost check unavailable — PurchasePrices fetch failed. Description and existence checks are still valid." (H2 graceful degradation)
- **`none`:** No live cost available — item is flagged `missing` or `zero_cost`.

### 5.2 `legacyFallback` Meaning Changes

**Before hotfix:** `legacyFallback: true` meant "archived row has no `bcItemCardCost` field (legacy archive)."

**After hotfix:** `legacyFallback: true` means EITHER:
- Archived `priceSource` is not `"bc"` (archived price wasn't a Direct_Unit_Cost), OR
- No vendor-specific purchase price found — fell back to ItemCard Unit_Cost

The UI copy should read: "Cost comparison approximate" with a tooltip showing the specific reason. Per H1, the tooltip should also note: "Cost comparison reflects archived unitPrice, which may include manual edits or markup. Drift may not represent BC-side cost changes alone."

### 5.3 `archivedVendor` in Results

The item result now includes `archivedVendor` (the `bcVendorNo` from the archived row). Display requirements vary by `costSource` (H5):

- **`costSource === "item_card_fallback"`:** The UI **should** render the archived vendor explicitly so the user knows which vendor's price was unavailable. Suggested format: "No price for vendor V10000 — using ItemCard cost ($X.XX) as approximate reference."
- **`costSource === "purchase_price"`:** Vendor display is optional/informational — the comparison is already vendor-specific and correct.
- **`costSource === "cost_check_unavailable"`:** Vendor display not meaningful — cost data is missing entirely.

### 5.4 No Schema Changes to itemResults Array

The result objects still have the same required fields: `partNumber`, `costStatus`, `descStatus`, `archivedCost`, `liveCost`, `delta`, `archivedDescription`, `liveDescription`, `legacyFallback`. The additions (`costSource`, `archivedVendor`) are new fields that the UI can consume or ignore.

---

## 6. Implementation Phases

### Phase 1 — New Function (zero risk, no behavior change)

1. Add `bcFetchPurchasePricesMultiVendor` after line 4929. Same OData query as `bcFetchPurchasePrices`, different keying.
2. Add `{signal}` support (AbortController) — matches bcFetchItemCardCosts pattern.
3. Run scope checker — confirm no new violations.
4. **Test:** Call from browser console with a few known part numbers. Verify Map keys are `"partNumber:vendorNo"` format.

### Phase 2 — Rewire buildRestorePreview

1. In the items section (lines 9091-9133), add `bcFetchPurchasePricesMultiVendor` with **graceful degradation** (H2): each fetch catches independently, AbortError re-throws. If PurchasePrices fails, items still render with existence + description drift; cost columns show `"cost_check_unavailable"`.
2. Replace the cost comparison logic:
   - Remove `archivedRow.bcItemCardCost` read (line 9103)
   - Use `ppMap.get(partNumber:bcVendorNo)` for live cost
   - Use `archivedRow.unitPrice` for archived cost
   - Use `archivedRow.priceSource` to set `legacyFallback`
   - Add `costSource` and `archivedVendor` to result objects
3. Retain `bcFetchItemCardCosts` for existence check (`liveItem` null test at line 9110) and description drift (lines 9127-9129).
4. **Test:** Open RestorePreviewModal on a project with known pricing. Verify:
   - Cost drift values make sense against BC Purchase Prices page
   - `costSource` is `"purchase_price"` for rows with vendor-specific prices
   - Rows with no purchase price fall back to ItemCard with `"item_card_fallback"`
   - Rows with `priceSource !== "bc"` show `legacyFallback: true`
   - (H2) Simulate PurchasePrices failure (e.g., disconnect BC token mid-load): items section should still render with existence + description, cost column shows "Cost check unavailable"

### Phase 3 — Update Plan Document

1. Revise ARCHIVE-RESTORE-PLAN-C-DETAILED.md sections listed in §2.3 above. Per H6, locate sections by heading name, not line number — line numbers have shifted across edits.
2. Remove the §7.2 deferral language.
3. Update the status line to note the cost-source correction.

### Phase 4 — UI Copy (if RestorePreviewModal markup exists)

1. Update any hardcoded tooltip or info-icon text referencing "bcItemCardCost" or "ItemCard Unit_Cost."
2. Add `costSource`-conditional rendering per §5.1.

---

## 7. TODO — F2 Lesson Learned

**Finding:** Coach finding F2 (Draft v1 → v2) recommended clarifying whether `bcFetchPurchasePrices` was needed for Milestone C, noting it appeared in the Supplement query table but wasn't consumed by the drift comparison. The resolution dropped it from Milestone C, locking drift detection to `bcFetchItemCardCosts.Unit_Cost` vs `archivedRow.bcItemCardCost`.

**What went wrong:**
1. The decision assumed `bcItemCardCost` existed as a stored field on BOM rows. It does not — it's a computed field in pricing audit results only (line 5034).
2. The decision assumed `Unit_Cost` was the correct operational cost reference. In Jon's BC environment, ItemCard `Unit_Cost` is a placeholder/global field — `Direct_Unit_Cost` from Purchase Prices is the real operational cost.
3. Neither the Coach finding nor the Jon confirmation step validated the remaining data source against production data.

**Rule for future plan decisions:** When a planning decision drops a data source (reducing scope), the remaining data source(s) must be verified as fit-for-purpose against real production data before the decision is finalized. Specifically:
- Does the stored field actually exist on the data model being read? (Verify with grep/search, not assumption.)
- Does the field contain meaningful data in the user's actual environment? (Ask the user or check production.)
- If the field is a fallback, does the fallback chain terminate at a value that exists?

**Category:** Process / Coach verification gap. Not a code bug at time of planning — became a code bug when ARC Dev implemented the wrong design faithfully.

---

## Cross-References

- **Supplement §2.1** (lines 94-108): Original query plan — included BOTH bcFetchItemCardCosts AND bcFetchPurchasePrices. This hotfix restores that design.
- **Plan §6.2** (line 694): Price comparison target — needs full revision per this hotfix.
- **Plan §7.2** (line 787): bcFetchPurchasePrices deferral — needs deletion.
- **app.jsx line 4638-4639**: Proof that `unitPrice` is written from `Direct_Unit_Cost` during re-verify — validates the comparison for `priceSource==="bc"` rows.
- **app.jsx line 5034**: Only location where `bcItemCardCost` and `bcPurchasePrice` are created — pricing audit results, not BOM row fields.
- **app.jsx lines 9097-9133**: Current (wrong) implementation to be replaced.

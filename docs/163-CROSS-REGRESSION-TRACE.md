# Coach — #163 P1 Cross/Replace Regression Trace

**Branch:** `feat/163-surrogate-key` | **Tip:** `27bf12d4` | **Repro:** CP2420 → CP2420G on PRJ402124 (matrix-arc-test)
**Reviewer:** Sam Wize (Coach) | **Date:** 2026-06-27 | **Status:** CONFIRMED REGRESSION — FIX-BEFORE-PROD

---

## 1. CROSS/REPLACE HANDLER

When the user selects a different item in the Item Browser, the flow is:

1. **`onSelect`** callback (line 29815) calls `applyBcItem(bcBrowserTarget, item)`
2. **`applyBcItem`** (line 26451) resolves `bcFullPN` via `_resolveVendorItemNo` when `bcItem._vendorItemNo` is absent, then compares `normPart(origPN) !== normPart(bcFullPN)` (line 26505)
3. If different → cross prompt fires via `setCrossOrCorrectPending` (line 26507)
4. User selects an option (Crossed/Bad Extraction/Formatting/Just Apply) → calls **`commitBcItem`** (lines 30067/30072/30077/30082)
5. `commitBcItem` (line 26269) builds the `updates` object that writes back to the BOM row

The partNumber write lives inside `commitBcItem`'s `.map()` at line 26338.

## 2. HOW P1 SUPPRESSED IT — THE EXACT GUARD

**Master** (commit `0f8a61fb`), inside `commitBcItem`'s updates object:
```js
...(newPN ? {partNumber: newPN} : {}),
```
Always sets `partNumber` to `bcItem.number` when truthy. Simple, unconditional.

**Branch** (commit `27bf12d4`), lines 26342-26343:
```js
...(bcSurrogate ? {bcNo: bcSurrogate} : {}),
...(bcFullPN && bcFullPN !== bcSurrogate ? {partNumber: bcFullPN} : {}),
```
Only sets `partNumber` when `bcFullPN !== bcSurrogate` — i.e., when the resolved Vendor_Item_No differs from the BC "No." (surrogate).

**The bug:** For short PNs (≤20 chars) where BC doesn't truncate, `bcSurrogate` = `bcFullPN` = the actual PN. The guard `bcFullPN !== bcSurrogate` evaluates to **false** → `partNumber` is never set. The cross prompt fires correctly (user sees CP2420 → CP2420G), the user confirms, but `commitBcItem` writes everything EXCEPT `partNumber`.

The guard was designed for one case: "don't overwrite the full PN with a truncated BC surrogate (un-backfilled item where Vendor_Item_No is empty)." But it also catches every short-PN cross and every backfilled item where Vendor_Item_No equals No.

## 3. MASTER vs BRANCH CONFIRMATION

| Aspect | Master (`0f8a61fb`) | Branch (`27bf12d4`) |
|--------|---------------------|---------------------|
| partNumber write | `...(newPN ? {partNumber: newPN} : {})` | `...(bcFullPN && bcFullPN !== bcSurrogate ? {partNumber: bcFullPN} : {})` |
| CP2420 → CP2420G | `newPN = "CP2420G"`, truthy → **writes partNumber** | `bcFullPN = "CP2420G" = bcSurrogate` → guard false → **does NOT write partNumber** |
| Cross result | Row shows "CP2420G" | Row shows "CP2420" (stale) |

**Confirmed: this is a #163 regression.** partNumber updated on master, does NOT update on the branch.

## 4. FIELD AUDIT (CP2420 → CP2420G cross on branch)

| Field | Updated? | Value | Source |
|-------|----------|-------|--------|
| `bcNo` | YES | "CP2420G" | Line 26342: `{bcNo: bcSurrogate}` |
| `priceSource` | YES | "bc" | Line 26344 |
| `unitPrice` | YES | PP-fetched price | Line 26346 |
| `priceDate` / `bcPoDate` | YES | PP date | Line 26347 |
| `description` | YES | `bcItem.displayName` | Line 26375 |
| `bcVerify` | YES | `{status:"in-bc"}` | Line 26345 |
| `confidence` | YES | "high" | Line 26348 |
| `isCrossed` | YES | true | Line 26369 |
| `crossedFrom` | YES | "CP2420" | Line 26369 |
| `manufacturer` | YES | from `_mfrCode` | Line 26361 |
| `leadTimeDays` | YES | from async ItemCard fetch | Line 26391 |
| **`partNumber`** | **NO — BUG** | **stays "CP2420"** | **Line 26343 guard is false** |

The write is partNumber-specific. Every other field updates correctly. Learning DB write is also correct — `saveAlternateEntry` at line 26405 uses `bcFullPN` ("CP2420G"), not `partNumber`.

## 5. FIX DIRECTION (scope only)

**Root cause:** The guard `bcFullPN !== bcSurrogate` conflates two unrelated conditions:
- (A) "We couldn't resolve a full PN from Vendor_Item_No" (should not write surrogate as partNumber) — **correct intent**
- (B) "The full PN happens to equal the BC No." (short PNs, or backfilled items where Vendor_Item_No = No) — **false positive, suppresses legitimate crosses**

**Fix:** Replace the guard with unconditional `partNumber: bcFullPN`. After BC-2 backfill (a prerequisite for #163 deploy), `bcFullPN` is always the resolved full PN:

- **Long PN, backfilled:** `bcFullPN` = Vendor_Item_No (full PN) ≠ `bcSurrogate` → writes full PN ✓
- **Long PN, un-backfilled:** `bcFullPN` falls back to `bcSurrogate` → writes surrogate, same as master's pre-#163 behavior. This case is eliminated by BC-2 backfill.
- **Short PN:** `bcFullPN` = `bcSurrogate` = the actual PN → writes correct PN ✓
- **Cross (any length):** writes `bcFullPN` = selected item's full PN ✓

The change is one line:
```js
// current (broken):
...(bcFullPN && bcFullPN !== bcSurrogate ? {partNumber: bcFullPN} : {}),
// fixed:
...(bcFullPN ? {partNumber: bcFullPN} : {}),
```

This restores master's cross behavior while using the resolved full PN (instead of master's raw `bcItem.number`). The `bcNo: bcSurrogate` write at line 26342 is unaffected and remains correct.

**Why this is safe post-backfill:** The guard was protecting against writing a surrogate (MTX-#####) as partNumber. Post-backfill, `_resolveVendorItemNo` always returns the real full PN, so `bcFullPN` is never just the surrogate for items that have a real long PN. The guard was a belt-and-suspenders protection for un-backfilled items, but it also broke crosses. Removing it is safe because the backfill is a deployment prerequisite.

**Scope:** One line in `commitBcItem`. No other sites affected — the cross prompt logic (`applyBcItem`), learning DB writes, and pricing paths are all correct.

---

## Verdict

**CONFIRMED REGRESSION — FIX-BEFORE-PROD.** P1's `bcFullPN !== bcSurrogate` guard at line 26343 suppresses ALL legitimate crosses where the selected item's full PN equals its BC "No." (every short-PN cross, every backfilled item). Fix is a one-line guard removal. Must be fixed before test-channel deploy — this affects core cross/replace functionality, not just an edge case.

— Sam Wize, Coach

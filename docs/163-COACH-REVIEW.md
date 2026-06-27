# Coach — #163 Full-Diff Architectural Review

**Branch:** `feat/163-surrogate-key` | **Commit:** `e18a8163` | **Spec:** C109 Rev 4
**Reviewer:** Sam Wize (Coach) | **Date:** 2026-06-27 | **Status:** PASS WITH CONDITIONS

---

## Plan Fidelity — Phase Verdicts

### P0: Utilities — FAITHFUL

- `_bcNo(row)` matches spec exactly: `row?.bcNo||(row?.partNumber||'').slice(0,20)`
- `_resolveVendorItemNo(bcNo)` correctly does targeted ItemCard OData fetch when `_vendorItemNo` is absent
- Known-open 3b: uses direct `${BC_ODATA_BASE}/ItemCard` path rather than `bcDiscoverODataPages()` indirection — assessed separately below

### P1: Core Resolution — FAITHFUL

- Resolution hoisted BEFORE `.map()` at commitBcItem — correct async restructure
- `bcSurrogate = bcItem.number`, `bcFullPN` resolved via `_resolveVendorItemNo` when `_vendorItemNo` absent
- Learning DB writes (alternates, corrections) use `bcFullPN` — no truncated values enter the learning DB
- `applyBcItem` made async for `_resolveVendorItemNo` await — call sites assessed separately below
- Pre-commit cross detection: `normPart(origPN) !== normPart(bcFullPN)` — correct
- bg/fg pricing: `exact.number` stored as `bcNo`, lookup by `_rowBcNo||pn`, fuzzy input uses `_rowBcNo||pn`, mutation sites write `bcNo` not `partNumber`

### P2: Push/Read Site Conversion — FAITHFUL

- Planning lines: `_bcNo()` applied
- `bcReVerifyItems`: converted
- `bcLookupItems`: converted
- `bcPatchItemOData` callers (6): all converted
- `bcPushPurchasePrice` callers (10): all converted, including SQ push at line 31412 (`_bcNo(i)`)
- Lead-time upserts: 3 of 4 converted (portal `_portalBcNo`, batched cell writeback). 4th (SQ ~31443) is known-open 3a
- Read sites: all 4 added (6299/6305/23715/30445) converted to `_bcNo(row)`
- CSV import: ItemCard `Vendor_Item_No` fallback, update by `bcItem.number`
- Portal: `_bcNoMap` + `_portalBcNo` helper for price push AND lead-time upsert

### P3: Create Path — FAITHFUL

- `body.number` omitted: BC auto-assigns MTX-##### via No.-Series
- `Vendor_Item_No` write OUTSIDE the `if(vendorNo)` gate: gate changed to `vendorNo||...||number`, with `if(number) patch.Vendor_Item_No = number` independent
- Pre-create dedup: ItemCard-based `Vendor_Item_No eq` query — correct endpoint (NOT the dead v2 filter)
- Returns `fullPN` for caller consumption
- SQ "Create New Item" correctly passes full PN as `number`

### P4: Item Browser — FAITHFUL

- Search results show `item._vendorItemNo || item.number`
- Placeholder text updated from misleading "e.g. MTX-1234"

### P5: Learning DB Fallback — FAITHFUL

- `.slice(0,20)` dual-match fallback on: alternates (auto ~10754, non-auto ~10766), corrections (~10776), part library (~10780)
- Description-based crosses not changed (match by description, not PN) — correct
- Known-open 3c: sibling matcher at ~23727/23734 lacks this fallback — assessed separately below

---

## Known-Open Rulings

### 3a — SQ push-modal lead-time site (~31443): FIX-BEFORE-PROD

**What:** `bcUpsertItemVendorLeadTime({partNumber: it.partNumber, ...})` at line 31443 passes the FULL part number. `bcUpsertItemVendorLeadTime` queries BC's `ItemVendorCatalog` by `Item_No eq '${pn}'` (line 4426). For post-#163 items with surrogate MTX-##### numbers, `it.partNumber` (the full PN) won't match `Item_No` (the BC surrogate), so the lead-time push silently fails.

**Why not fix-now:** The price push on the same code path IS correctly converted (`_bcNo(i)` at line 31412). The lead-time failure is graceful — try/catch handles it, no ARC data loss, same surface as an unresolved vendor. Safe for test-channel deploy.

**Why not accept:** Post-#163, ALL supplier-quote lead-time pushes for PNs >20 chars would silently fail. That's a real loss of functionality, not just an edge case. And `_bcNo(it)` alone isn't sufficient — SQ line items don't carry `bcNo`, so `_bcNo(it)` would fall back to `.slice(0,20)`, which still won't match an MTX-##### surrogate.

**Fix path:** Thread the BC No. from the price-push loop (which already resolves items via `bcPushPurchasePrice`) into the lead-time upsert, OR do an ItemCard-by-`Vendor_Item_No` lookup (same pattern as `_resolveVendorItemNo` but returning the `No`). Marc's two options in the build report are both valid; the price-push-threading option is lower-cost.

### 3b — ItemCard-direct deviation: ACCEPT

**What:** `_resolveVendorItemNo` and the pre-create dedup both use `${BC_ODATA_BASE}/ItemCard` directly rather than routing through `bcDiscoverODataPages()` indirection.

**Why accept:** This is the EXISTING pattern in the codebase — `bcLookupLeadTime` (~4349) and `bcUpsertItemVendorLeadTime` (~4404) both use direct ItemCard OData calls. The `bcDiscoverODataPages` indirection adds a service-document round-trip that these targeted queries don't need. Simpler, fewer round-trips, same endpoint. This is a beneficial deviation from the plan's letter that follows its spirit.

### 3c — Sibling learning-DB matcher (~23727/23734): FIX-BEFORE-PROD

**What:** PanelCard mount auto-apply at line 23727 (`_altMatchesPN(a,pn)`) and line 23734 (`c.badPN===pn || normPN(c.badPN)===normPN(pn)`) do NOT have the `.slice(0,20)` fallback that P5's `applyLearnedCorrections` does.

**Why fix-before-prod:** Post-#163, the learning DB may contain entries written with pre-#163 truncated part numbers. When a new panel opens with a full PN >20 chars, these matchers won't find the truncated DB entries. The explicit "Apply Learned Corrections" action (P5 path) would catch them, but the automatic mount-time application wouldn't.

**Severity:** Lower than 3a. Users still get corrections via the explicit path. No data loss — just a missed automatic application on panel open. But for consistency with P5, the fallback should be added before production.

**Fix:** Add `.slice(0,20)` fallback to both matchers at ~23727 and ~23734 (same dual-match pattern as `applyLearnedCorrections`).

---

## Async-Restructure Assessment: SAFE

`applyBcItem` (line 26437) was made `async` to support `_resolveVendorItemNo` inside it. Five call sites identified:

| Line | Context | Awaits? | Impact |
|------|---------|---------|--------|
| 28660 | Fuzzy lookup onClick (async handler) | No | Fire-and-forget; else branches mutually exclusive |
| 28811 | bcVerify `.then()` callback | No | Fire-and-forget; no follow-up depends on it |
| 28850 | Alternates dropdown onChange | No | Fire-and-forget; only resets dropdown after |
| 28880 | Fuzzy suggestion click | No | Fire-and-forget; no follow-up |
| 29815 | Item Browser onSelect | No | Follow-up closes modal; uses `item._created` not return value |

All 5 callers use fire-and-forget — none consume the return value or depend on completion timing. The function was synchronous before; callers never awaited it. The async internals (resolution, then state setting) execute correctly within the function's own await chain. Different calls target different `bomRowId`s, preventing interference.

**No ordering side-effects.** The async change is correctly scoped and all callers are safe without modification.

---

## New Findings

**None.** The diff is clean beyond the three known-opens Marc flagged. All conversion sites match the rev-4 plan. No missed sites, no regression risks, no data-retention violations.

---

## Summary Verdict

| Area | Result |
|------|--------|
| P0 Utilities | FAITHFUL |
| P1 Core Resolution | FAITHFUL |
| P2 Site Conversion | FAITHFUL |
| P3 Create Path | FAITHFUL |
| P4 Item Browser | FAITHFUL |
| P5 Learning Fallback | FAITHFUL |
| Async Restructure | SAFE |
| 3a SQ lead-time | FIX-BEFORE-PROD |
| 3b ItemCard-direct | ACCEPT |
| 3c Sibling matcher | FIX-BEFORE-PROD |
| New findings | NONE |

**Overall: PASS WITH CONDITIONS.** All 6 phases are faithful to the rev-4 plan. The async restructure is safe. Two known-opens (3a, 3c) require fixes before production but do NOT block test-channel deploy — both are graceful degradation scenarios with no ARC data loss. Known-open 3b is an accepted beneficial deviation.

**Recommended sequence:** Deploy to test channel → run T1-T10 → fix 3a + 3c → Coach re-review of fixes → production deploy.

— Sam Wize, Coach

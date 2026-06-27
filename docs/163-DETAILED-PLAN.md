# Freddy — #163 Detailed Plan: Full PN Integrity via BC Surrogate Key

**Author:** Coach (Sam Wize) | **Date:** 2026-06-26 | **Tip:** `ef1e2279`
**Rev 3:** Marc's implementer review (6 items) + Jon's planning-line item (1).
**Rev 2:** Gating items 1-3 closed, framing items 4-5 folded in per Jon's review.
**Grounding:** C107 + 163-SUPPLEMENT + Freddy Analyst Review + Jon verification
**Owner:** Marc (CCD) implements; Coach verifies each phase; Jon owns BC config.

---

## Scope at a Glance

This plan touches **~13 BC-touching functions** across **~40 call sites** in
`src/app.jsx`. Zero changes to `functions/index.js`. All changes are client-side.

| Category | Functions | Call sites |
|----------|-----------|------------|
| Mutation sites (P1) | 3 (`commitBcItem`, bg pricing, fg pricing) | 3 |
| Cross detection (P1) | 1 (pre-commit prompt) | 1 |
| Push sites — inline (P2) | 2 (`bcSyncPanelPlanningLines`, `bcSyncEcoPlanningLines`) | 2 |
| Push callers — `bcPatchItemOData` (P2) | callers | 6 |
| Push callers — `bcPushPurchasePrice` (P2) | callers | 10 |
| Push callers — `bcUpsertItemVendorLeadTime` (P2) | callers | 4 |
| Push callers — `bcReVerifyItems` / `bcLookupItems` (P2) | callers | 2 |
| Secondary reads — `bcGetItemVendorNo` / `bcLookupItem` (P2) | callers | 8 |
| Create path (P3) | 1 (`bcCreateItem`) | 3 |
| CSV import (P3) | 1 (lookup + batch) | 2 |
| Display (P4) | 1 (`BCItemBrowserModal`) | 2 |
| Learning DB (P5) | 1 (`applyLearnedCorrections`) | 4 matching paths |

**P1+P2+P5 deploy atomically.** A missed caller in P2 sends a full PN into a
Code[20] field → BC 400. The completeness audit grep (section 8) is a
**pre-deploy gate**, not a follow-up.

---

## Prerequisites (before any code changes)

**BC-1 (Jon):** Configure item No.-Series in BC sandbox for `MTX-#####`
auto-assignment. Confirm that a POST to `/companies(id)/items` with `body.number`
omitted returns an auto-assigned number in the response's `.number` field.

**BC-2 (Jon):** One-time backfill — populate `Vendor_Item_No` on all existing BC
items that currently have a PN stored in their "No." field. Items whose "No." is
already a surrogate need `Vendor_Item_No` set to the full PN.

**BC-3 (dependency):** BC-2 backfill MUST complete before code deploy. Without
it, `commitBcItem` can't distinguish the full PN from the surrogate —
cross-detection would false-positive on every commit for un-backfilled items.

---

## Utility Function

Add near the BC helper functions (after `_daysToBcDateFormula`, ~line 4319):

```js
function _bcNo(row){return row?.bcNo||(row?.partNumber||'').slice(0,20);}
```

Returns the BC "No." for any BOM row: the captured surrogate if available,
otherwise a 20-char-truncated fallback that preserves today's behavior for rows
that haven't touched BC yet. Every push site and caller uses this instead of
`row.partNumber` when targeting a BC Code[20] field.

~1 line.

---

## Phase 1 — Mutation Sites + Cross Detection (~45 lines)

Stop overwriting `partNumber` with the BC "No." Capture the surrogate as `bcNo`.
Fix cross-detection and learning-DB writes to use the full PN from
`Vendor_Item_No`.

**P1 and P2 MUST deploy together.** If P1 ships without P2, `partNumber` stays
full but push sites still send `row.partNumber` into Code[20] fields → BC 400.

### 1A. `commitBcItem` (line 26202)

**CRITICAL (Rev 3 — Marc item 1): `_vendorItemNo` is path-dependent.**

`bcItem._vendorItemNo` is ONLY populated when the user searches via "All Fields"
(field="both"), which routes through `_bcFetchItemsViaItemCard` (line 4538).
When the user searches by "Part # Only" or "Description Only," the search routes
through `_bcFetchItems` (v2 /items mapper, lines 4525-4529) which does NOT map
`Vendor_Item_No`.

Also: `bcFuzzyLookup` (line 4754) calls `bcSearchItems({field:"number"})` →
also routes through `_bcFetchItems` → no `_vendorItemNo`. And `bcLookupItem`
(line 4322) uses the v2 `/items` API directly → no `_vendorItemNo` either.

**Fix:** When `bcItem._vendorItemNo` is absent, do a targeted ItemCard fetch to
resolve the full PN before computing `bcFullPN`. This is a single OData GET
with `$select` — lightweight.

**Line 26249** — resolve `bcFullPN` reliably:
```js
const bcSurrogate = bcItem.number;
let bcFullPN = (bcItem._vendorItemNo || '').trim();
if (!bcFullPN) {
  // ItemCard fetch — bcItem may have come from the v2 /items mapper
  // which omits Vendor_Item_No. Resolve it now.
  try {
    const allPages = await bcDiscoverODataPages();
    const iPage = allPages.find(n => /^ItemCard$/i.test(n));
    if (iPage) {
      const viR = await bcGatedFetch(
        `${BC_ODATA_BASE}/${iPage}?$filter=No eq '${bcSurrogate.replace(/'/g,"''")}'&$select=No,Vendor_Item_No&$top=1`,
        { headers: { "Authorization": `Bearer ${_bcToken}` } }
      );
      if (viR.ok) {
        const viD = ((await viR.json()).value || [])[0];
        if (viD) bcFullPN = (viD.Vendor_Item_No || '').trim();
      }
    }
  } catch (e) { console.warn("commitBcItem: Vendor_Item_No resolve failed:", e); }
}
bcFullPN = bcFullPN || bcSurrogate;
```

**Naming note:** The two API surfaces use different casing:
- OData ItemCard: `Vendor_Item_No` → mapped to `_vendorItemNo` (underscore prefix)
- v2 /items: `vendorItemNo` (camelCase, no underscore) — present on the raw
  response but NOT `$select`'d or mapped by `_bcFetchItems`

The targeted ItemCard fetch above uses the OData path which is already proven
in the enrichment flow (line 22047).

**Line 26261-26262** — capture surrogate, conditionally write full PN:
```
CURRENT:  const updates={...r,
            ...(newPN?{partNumber:newPN}:{}),
CHANGE:   const updates={...r,
            ...(bcSurrogate?{bcNo:bcSurrogate}:{}),
            ...(bcFullPN&&bcFullPN!==bcSurrogate?{partNumber:bcFullPN}:{}),
```
`bcNo` always gets the surrogate. `partNumber` gets the full PN from
`Vendor_Item_No` — but ONLY when `_vendorItemNo` is populated (i.e.,
`bcFullPN !== bcSurrogate`). If `Vendor_Item_No` is empty (un-backfilled item),
`partNumber` stays as the row's current value. This is why BC-2 must complete
first.

**Line 26282** — async vendor lookup uses surrogate:
```
CURRENT:  if(!updates.bcVendorName&&newPN){...bcGetItemVendorNo(newPN)...
CHANGE:   if(!updates.bcVendorName&&bcSurrogate){...bcGetItemVendorNo(bcSurrogate)...
```

**Line 26287** — cross detection uses full PNs:
```
CURRENT:  }else if(asCross&&normPart(newPN)!==normPart(origPN)){
CHANGE:   }else if(asCross&&normPart(bcFullPN)!==normPart(origPN)){
```
Without this fix, `normPart("MTX-00001")!==normPart("LONG-PN-12345")` → every
commit flagged as a cross.

**Line 26299** — async Item Card re-fetch uses surrogate:
```
CURRENT:  ...ItemCard?$filter=No eq '${newPN}'...
CHANGE:   ...ItemCard?$filter=No eq '${bcSurrogate}'...
```
(Also change `if(newPN)` guard to `if(bcSurrogate)` at same line.)

**Line 26324** — learning DB cross entry uses full PN:
```
CURRENT:  saveAlternateEntry(uid,origPN,{partNumber:newPN,...},true)
CHANGE:   saveAlternateEntry(uid,origPN,{partNumber:bcFullPN,...},true)
```

**Line 26327** — learning DB correction entry:
```
CURRENT:  saveCorrectionEntry(uid,origPN,newPN,correctionType)
CHANGE:   saveCorrectionEntry(uid,origPN,bcFullPN,correctionType)
```

**Line 26336** — description cross entry:
```
CURRENT:  partNumber:bcItem.number,
CHANGE:   partNumber:bcFullPN,
```

~25 lines changed in `commitBcItem` (increased from rev 2 due to the
`_vendorItemNo` resolution block).

### 1B. Pre-commit cross detection (line 26415)

**Lines 26415-26417** — same `_vendorItemNo` resolution needed here:
```
CURRENT:  const origPN=(row.crossedFrom||row.partNumber||"").trim();
          const newPN=bcItem.number;
          const isCrossing=origPN&&origPN!==newPN;
CHANGE:   const origPN=(row.crossedFrom||row.partNumber||"").trim();
          const bcSurrogate=bcItem.number;
          // Resolve bcFullPN — bcItem may lack _vendorItemNo (v2 search path)
          let bcFullPN=(bcItem._vendorItemNo||'').trim();
          if(!bcFullPN){
            // Same targeted ItemCard fetch as 1A — but we can reuse the
            // bcFullPN resolved in 1A if commitBcItem was called first.
            // If this is the pre-commit prompt (called BEFORE commitBcItem),
            // we need our own fetch. Marc: factor the resolve into a small
            // helper if the duplication bothers you.
            try{
              const allPages=await bcDiscoverODataPages();
              const iPage=allPages.find(n=>/^ItemCard$/i.test(n));
              if(iPage){const viR=await bcGatedFetch(`${BC_ODATA_BASE}/${iPage}?$filter=No eq '${bcSurrogate.replace(/'/g,"''")}'&$select=No,Vendor_Item_No&$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
              if(viR.ok){const viD=((await viR.json()).value||[])[0];if(viD)bcFullPN=(viD.Vendor_Item_No||'').trim();}}
            }catch(e){}
          }
          bcFullPN=bcFullPN||bcSurrogate;
          const isCrossing=origPN&&normPart(origPN)!==normPart(bcFullPN);
```

**Marc implementation note:** The `_vendorItemNo` resolution logic appears in
both 1A and 1B. Factor into a helper if desired:
```js
async function _resolveVendorItemNo(bcNo) { /* ItemCard fetch */ }
```
Called from both sites. Single responsibility, single OData round-trip per call
(cached by `bcDiscoverODataPages` already).

~10 lines (or ~3 + helper).

### 1C. Background pricing (line 14914)

**Line 14916** — extract `bcNo` alongside `pn`:
```
ADD after: const pn=(row.partNumber||"").trim();
           const _rowBcNo=row.bcNo||'';
```

**Lines 14919-14923** — exact lookup uses surrogate, stores BC "No." as
bcNumber:
```
CURRENT:  const exact=await bcLookupItem(pn);
          ...bcNumber:pn,...
CHANGE:   const exact=await bcLookupItem(_rowBcNo||pn);
          ...bcNumber:exact.number||_rowBcNo||pn,...
```
Key fix: `bcNumber` now stores `exact.number` (the BC "No." from the lookup
response) instead of `pn` (the row's full partNumber). Without this,
`bcMap[key].bcNumber` would be the full PN, and mutation site 2 would write
the full PN as `bcNo` — wrong.

**Lines 14927-14936 — fuzzy branch (Rev 3, Marc item 4):**

The fuzzy branch also writes `bcMap[key].bcNumber`:
```js
const matchNo = result.match.number || pn;  // line 14934
bcMap[...] = { ...bcNumber: matchNo, ... }; // line 14936
```

`result.match.number` IS the BC "No." from `bcFuzzyLookup` → `bcSearchItems` →
`_bcFetchItems` mapper. This is always the surrogate (BC's actual "No." field).
So `bcNumber: matchNo` is ALREADY correct for the fuzzy path — it stores the
BC "No.", not the full PN.

**Explicit confirmation for the implementer:** The rev 2 mutation-site fix
(`matchedBcNo = bcMap[key].bcNumber`) covers BOTH exact and fuzzy branches
because both paths store the BC "No." as `bcNumber`. No fuzzy-specific change
needed at the mutation site.

**Fuzzy lookup input:** `bcFuzzyLookup(pn)` at line 14927 should take
`_rowBcNo || pn` for consistency. When a row has `bcNo` (previously committed
to BC) but `priceSource !== "bc"` (e.g., user manually set a price), the exact
path at 14920 would be skipped (gated on `priceSource==="bc"`), and the fuzzy
path fires. Using `_rowBcNo || pn` means the fuzzy lookup starts with the
surrogate — `bcLookupItem(surrogate)` finds the item on the first try instead
of fuzzy-matching the full PN.
```
CURRENT:  const result=await bcFuzzyLookup(pn);
CHANGE:   const result=await bcFuzzyLookup(_rowBcNo||pn);
```

**Lines 14964-14966** — mutation site 2:
```
CURRENT:  const newPn=bcMap[key].bcNumber||r.partNumber;
          ...
          return{...r,partNumber:newPn,
CHANGE:   const matchedBcNo=bcMap[key].bcNumber||null;
          ...
          return{...r,
            ...(matchedBcNo?{bcNo:matchedBcNo}:{}),
```
`partNumber` is no longer touched. `bcNo` is written only when a BC match exists.

Update `bcPnSubstitutions` logging (line 14965): check
`matchedBcNo&&matchedBcNo!==(r.bcNo||'')` instead of `newPn!==r.partNumber`.

~10 lines.

### 1D. Foreground pricing (line 26781)

Identical pattern to 1C:

**Line 26783** — add `_rowBcNo`:
```
ADD: const _rowBcNo=row.bcNo||'';
```

**Lines 26792-26796** — exact lookup:
```
CHANGE: bcLookupItem(_rowBcNo||pn)
        ...bcNumber:exact.number||_rowBcNo||pn,...
```

**Line 26800** — fuzzy lookup:
```
CHANGE: bcFuzzyLookup(_rowBcNo||pn)
```
Same rationale as 1C fuzzy: start with surrogate when available.

**Lines 26846-26848** — mutation site 3:
```
CHANGE: const matchedBcNo=bcMap[key].bcNumber||null;
        return{...r,...(matchedBcNo?{bcNo:matchedBcNo}:{}),...
```

~10 lines.

### P1 total: ~45 lines

---

## Phase 2 — Push Sites + Read Sites (~40 lines)

Switch every BC-push call site to use `_bcNo(row)` or the captured surrogate.
Also fix read-site callers that pass `partNumber` to BC lookup functions.

### 2A. `bcSyncPanelPlanningLines` (line 3662)

```
CURRENT:  No:row.partNumber,
CHANGE:   No:_bcNo(row),
```

Line 3678 (posting group auto-fix) reads `l.No` from the planning line object —
already correct after this change.

~1 line.

### 2B. `bcSyncEcoPanelPlanningLines` (line 3851)

```
CURRENT:  No:row.partNumber.trim(),
CHANGE:   No:_bcNo(row),
```

~1 line.

### 2C. `bcReVerifyItems` (lines 4858-4877)

**Line 4860-4861:**
```
CURRENT:  const pn=(row.partNumber||"").trim();
          const item=await bcLookupItem(pn);
CHANGE:   const pn=_bcNo(row);
          const item=await bcLookupItem(pn);
```

**Line 4871** — PP fetch PN list:
```
CURRENT:  return r?(r.partNumber||"").trim():null;
CHANGE:   return r?_bcNo(r):null;
```

~2 lines.

### 2D. `bcLookupItems` (line 4498-4500)

```
CURRENT:  const pn=(row.partNumber||"").trim();
CHANGE:   const pn=_bcNo(row);
```

~1 line.

### 2E. `bcPatchItemOData` callers

The function itself (line 4943) is generic — takes a string. Fix callers that
pass BOM-row `partNumber`:

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 26524 | manual price push | `bcPatchItemOData(partNumber,...)` | Trace `partNumber` to its row at ~line 26512: `const row=(panel.bom\|\|[]).find(r=>r.id===id)`. Add `const _bn=_bcNo(row);` after that line. Use `_bn` at 26524. |
| 26564 | vendor update | `bcPatchItemOData(pn,...)` where `pn=(row?.partNumber\|\|"")` | `bcPatchItemOData(_bcNo(row),...)` |
| 27010 | Codale pricing | `bcPatchItemOData(origPN,...)` | `origPN` is from the loop row `r`. Change to `bcPatchItemOData(_bcNo(r),...)` |
| 27119 | scraper pricing | `bcPatchItemOData(r.partNumber,...)` | `bcPatchItemOData(_bcNo(r),...)` |
| 37591 | price push batch | `bcPatchItemOData(partNumber,...)` | Trace `partNumber` to its row in the calling loop. Use `_bcNo(row)` or extract `bcNo` from the row. |
| 41863 | CSV import update | `bcPatchItemOData(row.partNumber,...)` | **RESOLVED**: use `row.bcItem?.number\|\|row.partNumber` (the BC item's actual "No." from lookup). |

~6 lines.

### 2F. `bcPushPurchasePrice` callers

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 26533 | manual price push | `bcPushPurchasePrice(partNumber,...)` | Use `_bn` from 2E fix above |
| 27011 | Codale | `bcPushPurchasePrice(origPN,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 27120 | scraper | `bcPushPurchasePrice(r.partNumber,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 31328 | portal apply | `bcPushPurchasePrice(i.partNumber,...)` | `bcPushPurchasePrice(_bcNo(i),...)` |
| 37597 | price push batch | `bcPushPurchasePrice(partNumber,...)` | Trace to row, use `_bcNo(row)` |
| 38172 | alt/cross | `bcPushPurchasePrice(alt.partNumber,...)` | `bcPushPurchasePrice(_bcNo(alt),...)` |
| 38842 | scraper push | `bcPushPurchasePrice(r.partNumber,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 39369 | scraper push | `bcPushPurchasePrice(r.partNumber,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 39510 | DK scraper | `bcPushPurchasePrice(res.partNumber,...)` | `bcPushPurchasePrice(_bcNo(res),...)` |
| 39515 | Mouser scraper | `bcPushPurchasePrice(res.partNumber,...)` | `bcPushPurchasePrice(_bcNo(res),...)` |

Callers that already use `created.number` (lines 22381, 31506) are correct — they
pass the BC response's number. No change.

~10 lines.

### 2G. `bcUpsertItemVendorLeadTime` callers (RESOLVED)

This function writes `Item_No` to BC's ItemVendorCatalog — a Code[20] field.
All four callers now have specified changes:

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 26088 | portal lead time batch | `partNumber:w.partNumber` | `partNumber:_bcNo(w)` |
| 26679 | pricing lead time | `partNumber:row.partNumber` | `partNumber:_bcNo(row)` |
| 31359 | SQ apply lead time | `partNumber:it.partNumber` | Build `_bcNoMap` before the loop (see below) |
| 37680 | portal apply lead time | `partNumber:item.partNumber` | Build `_bcNoMap` before the loop (see below) |

**Lines 31359 and 37680 — resolved context:** These callers operate on supplier
portal/SQ line items that do NOT carry `bcNo`. The BOM rows DO carry `bcNo` but
are in a different data structure. Fix: build a lookup map from the panel BOM
before the lead-time loop.

**Line 31359** (SQ apply, ~line 31343): The project panels are accessible via
component props. Before the `for(const it of toUpdate)` loop, add:
```js
const _bcNoMap={};
(project?.panels||[]).forEach(p=>(p.bom||[]).forEach(r=>{
  if(r.bcNo)_bcNoMap[(r.partNumber||'').toLowerCase().replace(/[\s\-\.]/g,'')]=r.bcNo;
}));
```
Then at line 31360: `partNumber:_bcNoMap[normPart(it.partNumber)]||it.partNumber.slice(0,20),`

Marc: confirm `project` is in scope at this point (it's the SQ component's
parent data — trace from the component's props/state).

**Line 37680** (portal apply, ~line 37672): `updatedPanels` (built at line 37662)
has the BOM rows with `bcNo`. Before the lead-time loop, add:
```js
const _bcNoMap={};
updatedPanels.forEach(p=>(p.bom||[]).forEach(r=>{
  if(r.bcNo)_bcNoMap[(r.partNumber||'').toLowerCase().replace(/[\s\-\.]/g,'')]=r.bcNo;
}));
```
Then at line 37681: `partNumber:_bcNoMap[normPart(item.partNumber)]||item.partNumber.slice(0,20),`

~8 lines total (2 map builders + 2 lookups + 2 simpler callers).

### 2H. `bcGetItemVendorNo` and `bcLookupItem` read callers (Rev 3 — Marc item 5)

Not push sites (reads only), but lookups fail if passed a full PN instead of BC
"No." A failed lookup returns empty vendor info — not data corruption, but
incorrect vendor display.

**Complete list (8 callers):**

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 6299 | RFQ vendor resolve (crossed) | `bcGetItemVendorNo(pn)` where `pn=item.partNumber` | `bcGetItemVendorNo(_bcNo(item))` |
| 6305 | RFQ vendor resolve (fallback) | `bcGetItemVendorNo(pn)` where `pn=item.partNumber` | `bcGetItemVendorNo(_bcNo(item))` |
| 15042 | bg pricing vendor patch | `const pn=(row.partNumber\|\|"")` | `const pn=_bcNo(row)` |
| 23715 | vendor backfill | `bcGetItemVendorNo(pn)` where `pn=row.partNumber` | `bcGetItemVendorNo(_bcNo(row))` |
| 26082 | portal vendor resolve | `w.partNumber` | `_bcNo(w)` |
| 26652 | pricing vendor | `(row.partNumber\|\|"").trim()` | `_bcNo(row)` |
| 27212 | vendor backfill | `const pn=(row.partNumber\|\|"").trim()` — `row` IS a BOM row | `const pn=_bcNo(row)` |
| 30445 | SQ validate-missing | `bcLookupItem(pn)` where `pn=row.partNumber` — `row` IS a BOM row | `bcLookupItem(_bcNo(row))` |

~8 lines.

### 2I. CSV import — update path (RESOLVED)

**Line 41840** — dual-filter lookup (same pattern as `bcLookupItemForQuote`):
```
CURRENT:  const items=await _bcFetchItems(compId,`number eq '${pn.replace(/'/g,"''")}'`,1,0);
CHANGE:   let items=await _bcFetchItems(compId,`number eq '${pn.replace(/'/g,"''")}'`,1,0);
          if(!items||!items.length)items=await _bcFetchItems(compId,`vendorItemNo eq '${pn.replace(/'/g,"''")}'`,1,0);
```

**Line 41863** — use `bcItem.number` (actual BC "No."), not `row.partNumber`:
```
CURRENT:  await bcPatchItemOData(row.partNumber,{Unit_Cost:row.newCost});
CHANGE:   await bcPatchItemOData(row.bcItem?.number||row.partNumber,{Unit_Cost:row.newCost});
```
`row.bcItem` was populated during `runLookup` (line 41845). Its `.number` is the
BC item's actual "No." — guaranteed correct for the PATCH.

**Line 41866** (create path) — no call-site change needed at this line. After
P3's changes to `bcCreateItem`, the `number` param carries the full PN for
`Vendor_Item_No` only. BC auto-assigns the surrogate. BUT see P3 for the
pre-create dedup addition.

~3 lines.

### 2J. Push sites reachable without `bcNo` — analysis

The following push sites can fire on rows that have NEVER been through a mutation
site (1/2/3):

1. **`bcSyncPanelPlanningLines` (2A) and `bcSyncEcoPlanningLines` (2B):** Iterate
   ALL non-labor BOM rows. A freshly extracted row has no `bcNo`. `_bcNo(row)`
   returns `partNumber.slice(0,20)` — same as today where BC would either find
   the item or 400. No new failure mode.

2. **`bcPushPurchasePrice` scraper callers (2F):** Scrapers push for rows without
   BC items. `_bcNo(r)` returns `.slice(0,20)`. Push fails with "item not found"
   — same as today.

3. **`bcReVerifyItems` (2C):** Checks rows with `bcVerify.status==="not-in-bc"`.
   No `bcNo` on these rows. `_bcNo(row)` returns `.slice(0,20)`. Correct behavior.

**Conclusion:** The `.slice(0,20)` fallback covers all edge cases. No additional
guards needed.

### P2 total: ~40 lines

---

## Phase 3 — Create Path + Pre-Create Dedup (~25 lines)

Omit `body.number` on `bcCreateItem` so BC auto-assigns the surrogate. Write
full PN to `Vendor_Item_No`. Add pre-create dedup check.

### 3A. `bcCreateItem` function (line 4889)

**Line 4894** — omit `number` from POST body:
```
CURRENT:  if(number)body.number=number;
CHANGE:   // #163: body.number omitted — BC No.-Series auto-assigns the surrogate.
          // The `number` param is now the full PN, used only for Vendor_Item_No.
```

**CRITICAL (Rev 3 — Marc item 2): Vendor_Item_No PATCH must escape the
`if(vendorNo)` gate.**

Today's code (line 4914):
```js
if(item.number && (vendorNo || genProdPostingGroup || inventoryPostingGroup || manufacturerCode)) {
  const patch = {};
  if(vendorNo) patch.Vendor_No = vendorNo;
  // ...
  if(vendorNo) patch.Vendor_Item_No = item.number;  // line 4921
  // ... retry loop, bcPatchItemOData ...
}
```

If no `vendorNo`/posting groups/`manufacturerCode` are provided, the entire
PATCH block is skipped. Post-P3, `body.number` is omitted → BC auto-assigns
a surrogate → the full PN is written NOWHERE. The item exists with a
surrogate "No." and empty `Vendor_Item_No`.

**Fix:** Restructure so `Vendor_Item_No` is ALWAYS patched when `number` was
provided (i.e., always post-P3):

```js
// After POST succeeds and `item` is available:
const needsODataPatch = vendorNo || genProdPostingGroup || inventoryPostingGroup || manufacturerCode || number;
if (item.number && needsODataPatch) {
  const patch = {};
  if (vendorNo) patch.Vendor_No = vendorNo;
  if (genProdPostingGroup) patch.Gen_Prod_Posting_Group = genProdPostingGroup;
  if (inventoryPostingGroup) patch.Inventory_Posting_Group = inventoryPostingGroup;
  if (manufacturerCode) patch.Manufacturer_Code = manufacturerCode.slice(0,10);
  // #163: Always write Vendor_Item_No when we have the full PN
  if (number) patch.Vendor_Item_No = number;
  // ... existing retry loop unchanged ...
}
```

The key changes:
1. Gate condition adds `|| number` so the PATCH fires even without vendor info
2. `Vendor_Item_No` write uses `number` (the full PN param), not `item.number`
   (the surrogate)
3. `Vendor_Item_No` write is gated on `number` being truthy, not on `vendorNo`

**Line 4933** — return the full PN alongside the surrogate:
```
CURRENT:  return{number:item.number||"",...
CHANGE:   return{number:item.number||"",fullPN:number||item.number||"",...
```

~8 lines.

### 3B. Pre-create dedup check (Rev 3 — Marc item 3)

**The problem:** Today, duplicate creates are caught by BC's unique constraint
on "No." — same PN → same "No." → 409 "already exists." Post-P3, `body.number`
is omitted → BC auto-assigns a new surrogate every time → two creates for the
same PN silently produce two BC items. CSV run twice, two users creating the same
item, or a retry after a timeout all create duplicates.

**Feasibility:** HIGH — the `vendorItemNo` dual-filter (already proven in
`bcLookupItemForQuote`, line 8469) can detect existing items by full PN before
creating. One extra API call per create.

**Fix:** Add a pre-create lookup inside `bcCreateItem`, BEFORE the POST:

```js
// Pre-create dedup: check if an item with this Vendor_Item_No already exists
if (number) {
  const pn = number.trim().replace(/'/g, "''");
  try {
    const dupCheck = await bcGatedFetch(
      `${BC_API_BASE}/companies(${compId})/items?$filter=vendorItemNo eq '${pn}'&$top=1`,
      { headers: { "Authorization": `Bearer ${_bcToken}` } }
    );
    if (dupCheck.ok) {
      const dupData = await dupCheck.json();
      const existing = (dupData.value || [])[0];
      if (existing && !existing.blocked) {
        console.log(`bcCreateItem: item with Vendor_Item_No='${number}' already exists as ${existing.number}, reusing`);
        return {
          number: existing.number || "", fullPN: number,
          displayName: existing.displayName || "",
          unitCost: existing.unitCost ?? null,
          unitPrice: existing.unitPrice ?? null,
          inventory: existing.inventory || 0,
          lastModifiedDateTime: existing.lastModifiedDateTime || "",
          vendorNo: existing.vendorNo || ""
        };
      }
    }
  } catch (e) { console.warn("bcCreateItem: dedup check failed, proceeding with create:", e); }
}
```

**Behavior:** If an item with the same `Vendor_Item_No` already exists, return
it as if it were just created. The caller gets the existing surrogate + full PN.
No duplicate. The `try/catch` ensures a failed dedup check doesn't block
creation — worst case is a duplicate (same as today).

**Cost:** One additional API call per create. Creates are infrequent (~1-5 per
project), so the overhead is negligible.

**Jon decision point:** This dedup is a SHOULD, not a MUST. Without it, the
system works but can accumulate duplicate BC items that share a Vendor_Item_No.
These duplicates don't cause data loss — they're just messy. The dedup is ~12
lines and self-contained. Coach recommends including it.

~12 lines.

### 3C. Call site: BC Item Browser "Create in BC" (line 22375)

No call-site change — `number:createNumber.trim()` now carries the full PN for
`Vendor_Item_No`. P3A's removal of `body.number` ensures it's not sent as the BC
"No." The form field is relabeled in P4.

### 3D. Call site: Portal "Create New Item" (line 31482)

```
CURRENT:  number:newItemForm.itemNo||undefined,
CHANGE:   number:newItemForm.itemNo||item.partNumber||undefined,
```
Ensures the full PN is always available for `Vendor_Item_No`.

**Post-create `bcNo` capture (line ~31496):** After `bcLookupItemForQuote`,
add `bcNo: created.number` to the BOM row update.

~3 lines.

### 3E. Call site: Supplier CSV import (line 41866)

No call-site change at this line — `number:row.partNumber` becomes the
Vendor_Item_No param. P3A handles the `body.number` omission. P3B's dedup
check prevents duplicate creation when CSV is re-run. The CSV lookup
dual-filter was added in 2I.

### P3 total: ~25 lines

---

## Phase 4 — Item Browser Display + Create Form (~5 lines)

### 4A. Search results display (line 22421)

```
CURRENT:  <td ...>{item.number}</td>
CHANGE:   <td ...>{item._vendorItemNo||item.number}</td>
```

~1 line.

### 4B. Create form field relabel

Relabel the "Item No." text input (near line 22350-22370) to "Part Number."
The value still flows to `createNumber` → `bcCreateItem({number:createNumber})`
→ becomes `Vendor_Item_No`. User types the full PN; BC assigns the surrogate.

~1 line.

### P4 total: ~3 lines

---

## Phase 5 — Learning-DB Lazy Dual-Match (~8 lines)

When `applyLearnedCorrections` (line 10672) matches BOM row PNs against learning
DB entries, add a `.slice(0,20)` fallback so a full-PN row matches a truncated
DB entry.

### 5A. Alternates (line 10711)

```
CURRENT:  const alt=userAlts.find(a=>a.autoReplace&&a.replacement&&_altMatchesPN(a,pn));
CHANGE:   const alt=userAlts.find(a=>a.autoReplace&&a.replacement&&(_altMatchesPN(a,pn)||_altMatchesPN(a,pn.slice(0,20))));
```

Also line 10723 (non-auto alternate check):
```
CHANGE:   ...(_altMatchesPN(a,pn)||_altMatchesPN(a,pn.slice(0,20)))
```

~2 lines.

### 5B. Corrections (line 10728)

```
CURRENT:  const corr=userCorrs.find(c=>c.badPN===pn||normPN(c.badPN)===normPN(pn));
CHANGE:   const corr=userCorrs.find(c=>c.badPN===pn||normPN(c.badPN)===normPN(pn)
            ||c.badPN===pn.slice(0,20)||normPN(c.badPN)===normPN(pn.slice(0,20)));
```

~2 lines.

### 5C. Part library (line 10736-10737)

```
CURRENT:  const pc=userPartCorrs.find(c=>c.key===pcKey);
CHANGE:   const pc=userPartCorrs.find(c=>c.key===pcKey||c.key===pn.slice(0,20).toLowerCase());
```

~1 line.

### 5D. Description crosses (line 10745-10748)

No change — matches by `description`, not `partNumber`.

### P5 total: ~6 lines

---

## Document Surfaces — Verify Only (0 lines)

RFQ (6435), Traveler (8053), Quote PDF, BOM table all read `row.partNumber`.
Once `partNumber` stays full, these show full PNs with zero code change. Marc
visually verifies in T1.

---

## Test Environment Strategy

### What's client vs. Functions?

ALL #163 changes are in `src/app.jsx` — client-side JavaScript served by Firebase
Hosting. **Zero changes to `functions/index.js`.** No Cloud Functions deploy is
needed.

| Layer | Change? | Deploy target |
|-------|---------|---------------|
| `src/app.jsx` | YES (~105 lines) | Firebase Hosting only |
| `functions/index.js` | NO | Not deployed |
| Firestore schema | Additive (`bcNo` field) | No deploy — written by client |
| BC API | No ARC-side change | BC sandbox config by Jon |

### BC sandbox isolation (Rev 3 — Marc item 6)

The client writes directly to BC via `BC_API_BASE` and `BC_ODATA_BASE`, which
are computed from `_bcConfig.env` (line 342-343):

```
https://api.businesscentral.dynamics.com/v2.0/{BC_TENANT}/{_bcConfig.env}/...
```

`_bcConfig.env` is loaded from Firestore at
`companies/{companyId}/config/bcEnvironment` (line 380-381). The default is
`MATR_SndBx_01152026`. All BC API calls go to whichever environment this
Firestore doc specifies.

**BC env is NOT tied to the hosting target.** A test deploy to
`matrix-arc-test` uses the SAME `_bcConfig.env` as prod unless the Firestore
`bcEnvironment` doc is changed.

**Isolation mechanism:** Two options, Jon picks:

**Option A — Separate Firestore bcEnvironment doc for test company:**
The test hosting target (`matrix-arc-test`) should be used with a DIFFERENT
Firestore company (or the same company with a modified `bcEnvironment` doc
pointing to a sandbox BC environment). Jon creates a sandbox BC environment
(e.g., `MATR_SndBx_163TEST`) and points the test company's
`companies/{testCompanyId}/config/bcEnvironment` → `{env:"MATR_SndBx_163TEST"}`.
Test BC writes go to sandbox; prod BC writes untouched.

**Option B — Same environment, test tolerance:**
If the existing BC sandbox (`MATR_SndBx_01152026`) IS the sandbox (i.e., prod
uses a different env name), then the test deploy already writes to sandbox.
Confirm: is the current `MATR_SndBx_01152026` the sandbox or prod? The name
suggests sandbox. If so, no config change needed for testing — prod would use
a different env value.

**Jon: confirm which option applies.** The plan does NOT assume a specific
option — both are zero-code-change. The risk is a test deploy that mutates prod
BC items (creates surrogates, rewrites Vendor_Item_No). Pin the answer before
T1.

### Safe test procedure

1. **Deploy `app.jsx` to `matrix-arc-test` target only.** This serves the updated
   client code at the test URL. Prod target is untouched.

2. **Confirm BC env points to sandbox** (per Jon's answer above).

3. **Use scratch projects only.** Create new projects (fresh PRJ numbers) for
   testing. The `bcNo` field written to Firestore is project-scoped — writing to
   scratch projects cannot affect real customer projects. Do NOT open existing
   customer projects in the test target during testing, as the new code would
   write `bcNo` to their Firestore docs.

4. **Run T1-T10 on scratch projects** (see test criteria below).

5. **After verification:** Deploy to prod Hosting target. No Functions deploy.

### Why shared Firestore is safe

The `bcNo` field is additive (new field on BOM rows). The old code ignores it
(it's never read by pre-fix code). If testing writes `bcNo` to a scratch project
and the test is abandoned, the field is inert. Prod code won't read or act on it.

### sqCrossings secondary impact (not a deploy blocker)

`sqSaveCrossing` (line 8514) stores `bcItemNumber: bcItem.number`. Under
surrogates, this stores MTX-##### instead of the truncated PN. The
`functions/index.js` enrichment (line 1314) keys by `bcItemNumber` — surrogate
entries won't match full-PN lookups. Impact: `supplierPartNumber` auto-fill stops
working for surrogate-era items. Failure is graceful (user fills manually). Log
as a follow-up item — fix by storing `bcFullPN` alongside `bcItemNumber` in
`sqSaveCrossing` and updating the Functions enrichment to key by both.

---

## Project Planning Lines — Vendor Item No Visibility (Rev 3 — Jon item 7)

### 7a. Confirm: surrogate is correct for `No:` (CONFIRMED)

`bcSyncPanelPlanningLines` (3662) and `bcSyncEcoPanelPlanningLines` (3851) push
`No:_bcNo(row)` = the surrogate. This is correct and required — the planning
line links to the item master by `No.` = surrogate. Pushing the full PN there
would break the link and/or 400 the Code[20] field.

No other field in the planning line payload carries the full PN. The payload
(lines 3661-3667 for base, 3844-3860 for ECO) sends: `No`, `Description`,
`Quantity`, `Unit_Cost`, `Location_Code`, `Line_Type`, `Type`, `Planning_Date`,
`Unit_of_Measure_Code`. None of these carry `partNumber` except `No:` (now
fixed to surrogate). `Description` carries the description string, not the PN.
The `_fallback` object (line 3668) uses `Type:"Text"` with a combined
`partNumber - description` string in `Description` — but the fallback only fires
when the Item-type POST fails, and it's a Text line (no BC item link).

### 7b. Expose full PN on planning line (SCOPED — Jon decides)

With `No:` now showing `MTX-#####`, planning lines in BC are unreadable when
verifying. The question is whether the BC Project Planning Line entity exposes
a writable field where ARC can store the full PN.

**Entity: ProjectPlanningLines (BC page 1007)**

ARC discovers this entity via `bcDiscoverODataPages()` (line 3552) and POSTs/
PATCHes to it via OData. The fields ARC currently writes are:
`No`, `Description`, `Quantity`, `Unit_Cost`, `Unit_Price`, `Line_Type`, `Type`,
`Planning_Date`, `Location_Code`, `Unit_of_Measure_Code`, `Line_No`.

**Does `Vendor_Item_No` exist on this entity?**

The BC standard Job Planning Line table (T1003) does NOT have a native
`Vendor_Item_No` field. The Item table (T27) has `Vendor_Item_No`, but it's an
item-level field, not a planning-line-level field. Planning lines reference items
by `No.` — BC resolves the item's vendor info from the item master.

**However:** BC's planning line `Description` field IS writable and ARC already
uses it (line 3663: `Description:desc`). And BC planning lines have a
`Description 2` field (50 chars) on the standard table that ARC does NOT
currently use.

**Options for Jon:**

**Option 1 — Append PN to Description (0 new lines, ~2 modified):**
Prepend the full PN to the description:
```js
Description: `[${row.partNumber}] ${(row.description||"").slice(0,80)}`.slice(0,100)
```
Planning line in BC reads: `[SCE-90EL4820SSFSD000XXX] Fusible Switch 480V`.
Pro: zero new fields, zero BC config. Con: consumes description space (100 char
limit, PN eats 20-30 chars). The ECO description (line 3843) already uses a
`[ECO ### op]` prefix — adding PN would crowd it.

**Option 2 — Write to Description_2 (~3 lines):**
```js
// In the planning line payload:
Description_2: (row.partNumber || '').slice(0, 50)
```
Pro: dedicated field, doesn't consume Description space, up to 50 chars.
Con: requires the `Description_2` field to be exposed on the published OData
page. Jon would need to verify it's in the page's field list (it's a standard
BC field on T1003 but may not be published). If not published, Jon adds it to
the BC web service page definition — no code change on BC side, just a page
publish config.

**Option 3 — No ARC-side change, BC lookup resolves it:**
In BC, when viewing a planning line, the user can navigate to the item card
from the `No.` field. The item card shows `Vendor_Item_No` (the full PN after
BC-2 backfill). Pro: zero ARC code. Con: extra click to see the full PN; not
visible in planning line list views.

**ARC-side planning line display:** ARC does NOT render planning lines in its
own UI. Planning lines are pushed to BC for BC-side consumption (project
managers view them in BC). There is no ARC UI surface that shows planning line
content — only a sync status toast.

**Coach recommendation:** Option 2 if `Description_2` is published on the page;
Option 3 as fallback. Option 1 crowds Description. Jon: check the BC page
definition and decide.

---

## Deployment Sequence

1. **BC-1/BC-2** (Jon): Configure No.-Series + backfill Vendor_Item_No. Validate
   in sandbox.
2. **Pin BC sandbox** (Jon): Confirm which BC environment the test deploy will
   target (see Test Environment Strategy above).
3. **P1+P2+P5** ship together as one version to test target. Run T1-T10.
4. After test verification, deploy P1+P2+P5 to prod.
5. **P3+P4** ship as the next version (after prod P1+P2+P5 is stable).
6. Run T7 (create path + dedup) + T5 (regression) on P3+P4.

---

## Pre-Deploy Gate: Completeness Audit (Rev 3 — widened grep)

**Run BEFORE deploying P1+P2.** This is a gate, not a follow-up. One missed
caller sends a full PN into a Code[20] field → BC 400.

Marc: after implementing P2, run the following greps and confirm ZERO unguarded
hits:

**Push/write patterns:**
```bash
grep -n 'partNumber.*bcPatch\|partNumber.*bcPush\|partNumber.*Item_No\|No:.*partNumber\|partNumber.*bcUpsert' src/app.jsx
```

**Read/lookup patterns (Rev 3 addition):**
```bash
grep -n 'bcLookupItem(\|bcGetItemVendorNo(' src/app.jsx
```

**Each hit must be one of:**
- Already converted to `_bcNo(row)` or surrogate variable ✓
- Passing a BC response value (`created.number`, `bcItem.number`, `exact.number`) ✓
- Passing a user-input value (CSV `row.partNumber`) with `bcItem?.number` guard ✓
- In a non-BC context (React display, Firestore save, etc.) ✓
- Inside `bcFuzzyLookup` itself (internal — calls `bcLookupItem(pn)` where `pn`
  is already the search term, not a BOM row field) ✓

Any unclassified hit is a missed boundary — fix before deploy.

---

## Test Criteria

### T1 — End-to-end long-PN item (Golden Path)

Extract a BOM with a >20-char PN (e.g., "SCE-90EL4820SSFSD000XXX"). Verify:
1. `row.partNumber` in Firestore = full PN (not truncated)
2. Commit via BC Item Browser → `row.bcNo` = MTX-##### in Firestore
3. `row.partNumber` unchanged (still full PN) after commit
4. RFQ email shows full PN
5. Traveler BOM shows full PN
6. BOM table shows full PN
7. Item Browser picker shows full PN (via `_vendorItemNo`)
8. **Rev 3:** Test with BOTH "All Fields" and "Part # Only" search modes —
   `_vendorItemNo` resolution must work on both paths

### T2 — Pricing does not overwrite partNumber

After T1 commit, trigger pricing (background or foreground):
1. `row.partNumber` unchanged after pricing completes
2. `row.bcNo` unchanged (same surrogate)
3. Price, vendor, bcVerify update correctly

### T3 — Planning line sync keys on surrogate

Trigger "Push Update to BC" (planning line sync):
1. BC planning line's "No" = MTX-##### (the surrogate), NOT the full PN
2. No BC 400 errors
3. Quantity, Unit_Cost correct

### T4 — Cross detection works

With a committed >20-char row, open BC Item Browser:

Select a DIFFERENT item:
1. Cross/Correction/Just Apply prompt appears
2. Learning DB stores full PNs (both `originalPN` and `replacement.partNumber`)
3. `crossedFrom` = the original full PN

Re-select the SAME item:
4. No cross prompt (same-item re-commit should NOT prompt)

### T5 — Short PN (≤ 20 chars) regression

Full cycle with a normal PN (e.g., "1492-J4"):
1. Commit, pricing, planning sync all work as before
2. `row.bcNo` = MTX-##### (surrogate)
3. `row.partNumber` = "1492-J4" (unchanged)

### T6 — Learning DB transition

Create a learning DB alternate with a truncated PN (manually or via old-code
commit). Extract a new BOM with the full version of that PN:
1. Auto-cross fires (`.slice(0,20)` fallback matches)
2. `appliedLog` shows the match

### T7 — Create path + dedup (after P3)

Use "Create in BC" button for a >20-char PN:
1. BC item created with auto-assigned MTX-##### as "No."
2. BC item's `Vendor_Item_No` = the full PN
3. Item Browser shows the full PN
4. Subsequent commit → `row.bcNo` = MTX-#####, `row.partNumber` = full PN
5. **Rev 3:** Create AGAIN with the same PN → dedup returns existing item,
   no second BC item created
6. **Rev 3:** Create with NO vendor selected → `Vendor_Item_No` still written
   (not gated on vendorNo)

### T8 — Clean-break existing data

Open a project committed under old code (truncated PNs):
1. BOM table shows truncated PNs (as before)
2. Pricing works (finds item via truncated "No." through `_bcNo()` fallback)
3. Planning sync works (sends truncated via `_bcNo()` fallback)
4. Re-commit via Item Browser → `bcNo` captured, `partNumber` updated to full PN

### T9 — ECO planning lines

Trigger ECO planning line sync with a >20-char PN row:
1. BC planning line's "No" = surrogate or `.slice(0,20)` fallback
2. No BC 400 errors

### T10 — Purchase price push + CSV import

Manually enter a price for a >20-char PN row that has `bcNo`:
1. `bcPatchItemOData` called with surrogate
2. `bcPushPurchasePrice` called with surrogate
3. Both succeed

CSV import with a full PN:
4. Lookup finds item via `vendorItemNo` fallback (dual-filter)
5. Update patches correct BC item (via `row.bcItem.number`)
6. **Rev 3:** CSV import of same PN twice → dedup prevents second BC item

---

## Summary

| Phase | Lines | Risk | Rev 3 changes |
|-------|-------|------|---------------|
| Utility `_bcNo` | 1 | Negligible | — |
| P1 (mutation + cross) | ~45 | MEDIUM — core data flow | +10: `_vendorItemNo` resolve, fuzzy branch explicit |
| P2 (push + read sites) | ~40 | MEDIUM — many sites, uniform pattern | +5: 4 missed read sites, widened grep |
| P3 (create path + dedup) | ~25 | LOW-MEDIUM | +15: `Vendor_Item_No` gate fix, pre-create dedup |
| P4 (display) | ~3 | LOW — UI text only | — |
| P5 (learning DB) | ~6 | LOW — additive fallback | — |
| **Total** | **~120** | | |

## Follow-up Items (NOT in this build)

- **Batch re-key** (Q3 Step 2 + Q5 re-fetch): One-time migration script. Scope
  only if field data shows material impact.
- **sqCrossings surrogate support:** Store `bcFullPN` alongside `bcItemNumber`,
  update Functions enrichment to key by both. Graceful failure until fixed.
- **Planning line `Description_2`** (if Jon chooses Option 2 in §7b): Add
  `Description_2: row.partNumber.slice(0,50)` to both planning line payloads.
  Requires Jon to publish the field on the BC web service page.
- **v2 mapper `vendorItemNo`:** Consider adding `vendorItemNo` to the v2
  `_bcFetchItems` mapper (line 4525-4529) so "Part # Only" searches carry it
  natively. Would eliminate the targeted ItemCard fetch in 1A/1B. Low priority
  — the resolve-on-demand approach works.

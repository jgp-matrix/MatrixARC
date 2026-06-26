# Freddy — #163 Detailed Plan: Full PN Integrity via BC Surrogate Key

**Author:** Coach (Sam Wize) | **Date:** 2026-06-26 | **Tip:** `53a29288`
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
| Secondary reads — `bcGetItemVendorNo` (P2) | callers | 4 |
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

## Phase 1 — Mutation Sites + Cross Detection (~35 lines)

Stop overwriting `partNumber` with the BC "No." Capture the surrogate as `bcNo`.
Fix cross-detection and learning-DB writes to use the full PN from
`Vendor_Item_No`.

**P1 and P2 MUST deploy together.** If P1 ships without P2, `partNumber` stays
full but push sites still send `row.partNumber` into Code[20] fields → BC 400.

### 1A. `commitBcItem` (line 26202)

**Line 26249** — introduce `bcFullPN`:
```
CURRENT:  const newPN=bcItem.number;
CHANGE:   const bcSurrogate=bcItem.number;
          const bcFullPN=(bcItem._vendorItemNo||'').trim()||bcSurrogate;
```

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
`bcFullPN !== bcSurrogate`). If `_vendorItemNo` is empty (un-backfilled item),
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

~15 lines changed in `commitBcItem`.

### 1B. Pre-commit cross detection (line 26415)

**Lines 26415-26417:**
```
CURRENT:  const origPN=(row.crossedFrom||row.partNumber||"").trim();
          const newPN=bcItem.number;
          const isCrossing=origPN&&origPN!==newPN;
CHANGE:   const origPN=(row.crossedFrom||row.partNumber||"").trim();
          const bcFullPN=(bcItem._vendorItemNo||'').trim()||bcItem.number;
          const isCrossing=origPN&&normPart(origPN)!==normPart(bcFullPN);
```
Uses `normPart()` for consistent comparison.

~3 lines.

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

~8 lines.

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

**Lines 26846-26848** — mutation site 3:
```
CHANGE: const matchedBcNo=bcMap[key].bcNumber||null;
        return{...r,...(matchedBcNo?{bcNo:matchedBcNo}:{}),...
```

~8 lines.

### P1 total: ~35 lines

---

## Phase 2 — Push Sites (~35 lines)

Switch every BC-push call site to use `_bcNo(row)` or the captured surrogate.

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
| 41863 | CSV import update | `bcPatchItemOData(row.partNumber,...)` | **RESOLVED (see 2I below)**: use `row.bcItem.number` (the BC item's actual "No." from lookup). |

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

### 2H. `bcGetItemVendorNo` callers (secondary reads — RESOLVED)

Not push sites (reads only), but lookups fail if passed a full PN instead of BC
"No." A failed lookup returns empty vendor info — not data corruption, but
incorrect vendor display.

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 15042 | bg pricing vendor patch | `const pn=(row.partNumber\|\|"")` | `const pn=_bcNo(row)` |
| 26082 | portal vendor resolve | `w.partNumber` | `_bcNo(w)` |
| 26652 | pricing vendor | `(row.partNumber\|\|"").trim()` | `_bcNo(row)` |
| 27212 | vendor backfill | `const pn=(row.partNumber\|\|"").trim()` where `row` is from `needVendor` (filtered `updatedBom`) — this IS a BOM row | `const pn=_bcNo(row)` |

~4 lines.

### 2I. CSV import — update path (RESOLVED)

**The contradiction (Gating 1):** Section 2E (C109) said "leave as-is, CSV rows
are BC-keyed." Section 3D said `row.partNumber` is the full PN for
`Vendor_Item_No`. Both were partially wrong.

**Traced:** The CSV import flow (line 41816 `runLookup`):
1. Extracts `pn` from CSV column (line 41824)
2. Queries BC: `number eq '${pn}'` (line 41840) — finds the item by "No."
3. If found: `status:'update'`, `bcItem` stored on the row (line 41845)
4. If not found: `status:'new'`

**Resolution:** Under the new model, CSV users might enter the full PN or the
surrogate. The lookup must handle both:

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

**Line 41866** (create path) — no call-site change needed. After P3's removal of
`if(number)body.number=number` from `bcCreateItem`, the `number` param carries
the full PN for `Vendor_Item_No` only. BC auto-assigns the surrogate.

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

### P2 total: ~35 lines

---

## Phase 3 — Create Path + CSV Import (~15 lines)

Omit `body.number` on `bcCreateItem` so BC auto-assigns the surrogate. Write
full PN to `Vendor_Item_No`.

### 3A. `bcCreateItem` function (line 4889)

**Line 4894** — omit `number` from POST body:
```
CURRENT:  if(number)body.number=number;
CHANGE:   // #163: body.number omitted — BC No.-Series auto-assigns the surrogate.
          // The `number` param is now the full PN, used only for Vendor_Item_No.
```

**Line 4921** — write full PN to `Vendor_Item_No`:
```
CURRENT:  if(vendorNo)patch.Vendor_Item_No=item.number;
CHANGE:   if(vendorNo)patch.Vendor_Item_No=number||item.number;
```
Uses the original `number` parameter (the full PN). Falls back to `item.number`
if `number` is empty.

**Line 4933** — return the full PN alongside the surrogate:
```
CURRENT:  return{number:item.number||"",...
CHANGE:   return{number:item.number||"",fullPN:number||item.number||"",...
```

~5 lines.

### 3B. Call site: BC Item Browser "Create in BC" (line 22375)

No call-site change — `number:createNumber.trim()` now carries the full PN for
`Vendor_Item_No`. P3A's removal of `body.number` ensures it's not sent as the BC
"No." The form field is relabeled in P4.

### 3C. Call site: Portal "Create New Item" (line 31482)

```
CURRENT:  number:newItemForm.itemNo||undefined,
CHANGE:   number:newItemForm.itemNo||item.partNumber||undefined,
```
Ensures the full PN is always available for `Vendor_Item_No`.

**Post-create `bcNo` capture (line ~31496):** After `bcLookupItemForQuote`,
add `bcNo: created.number` to the BOM row update.

~3 lines.

### 3D. Call site: Supplier CSV import (line 41866)

No call-site change — `number:row.partNumber` becomes the Vendor_Item_No
param. P3A handles the `body.number` omission. The CSV lookup dual-filter
was added in 2I.

### P3 total: ~10 lines

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
| `src/app.jsx` | YES (~95 lines) | Firebase Hosting only |
| `functions/index.js` | NO | Not deployed |
| Firestore schema | Additive (`bcNo` field) | No deploy — written by client |
| BC API | No ARC-side change | BC sandbox config by Jon |

### Safe test procedure

1. **Deploy `app.jsx` to `matrix-arc-test` target only.** This serves the updated
   client code at the test URL. Prod target is untouched.

2. **Point BC calls at sandbox.** The BC token acquisition in the test target
   connects to BC sandbox (configured by Jon). All BC item creation, planning
   line sync, purchase price writes go to sandbox — never prod BC.

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

## Deployment Sequence

1. **BC-1/BC-2** (Jon): Configure No.-Series + backfill Vendor_Item_No. Validate
   in sandbox.
2. **P1+P2+P5** ship together as one version to test target. Run T1-T10.
3. After test verification, deploy P1+P2+P5 to prod.
4. **P3+P4** ship as the next version (after prod P1+P2+P5 is stable).
5. Run T7 (create path) + T5 (regression) on P3+P4.

---

## Pre-Deploy Gate: Completeness Audit

**Run BEFORE deploying P1+P2.** This is a gate, not a follow-up. One missed
caller sends a full PN into a Code[20] field → BC 400.

Marc: after implementing P2, run the following grep and confirm ZERO hits that
aren't guarded by `_bcNo()` or are known-safe (callers that pass BC response
numbers like `created.number`, `item.number` from browser, etc.):

```bash
grep -n 'partNumber.*bcPatch\|partNumber.*bcPush\|partNumber.*Item_No\|No:.*partNumber\|partNumber.*bcUpsert' src/app.jsx
```

Each hit must be either:
- Already converted to `_bcNo(row)` ✓
- Passing a BC response value (`created.number`, `bcItem.number`) ✓
- In a non-BC context (React display, Firestore save, etc.) ✓

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

### T7 — Create path (after P3)

Use "Create in BC" button for a >20-char PN:
1. BC item created with auto-assigned MTX-##### as "No."
2. BC item's `Vendor_Item_No` = the full PN
3. Item Browser shows the full PN
4. Subsequent commit → `row.bcNo` = MTX-#####, `row.partNumber` = full PN

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

---

## Summary

| Phase | Lines | Risk |
|-------|-------|------|
| Utility `_bcNo` | 1 | Negligible |
| P1 (mutation + cross) | ~35 | MEDIUM — core data flow |
| P2 (push sites, ~40 call sites) | ~35 | MEDIUM — many sites, uniform pattern |
| P3 (create path + CSV) | ~15 | LOW — isolated function |
| P4 (display) | ~3 | LOW — UI text only |
| P5 (learning DB) | ~6 | LOW — additive fallback |
| **Total** | **~95** | |

## Follow-up Items (NOT in this build)

- **Batch re-key** (Q3 Step 2 + Q5 re-fetch): One-time migration script. Scope
  only if field data shows material impact.
- **sqCrossings surrogate support:** Store `bcFullPN` alongside `bcItemNumber`,
  update Functions enrichment to key by both. Graceful failure until fixed.

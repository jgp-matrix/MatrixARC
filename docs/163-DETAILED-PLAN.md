# Freddy — #163 Detailed Plan: Full PN Integrity via BC Surrogate Key

**Author:** Coach (Sam Wize) | **Date:** 2026-06-26 | **Tip:** `53a29288`
**Grounding:** C107 territory map + 163-SUPPLEMENT + Freddy Analyst Review
**Owner:** Marc (CCD) implements; Coach verifies each phase; Jon owns BC config.

---

## Prerequisites (before any code changes)

**BC-1 (Jon):** Configure item No.-Series in BC sandbox for `MTX-#####` auto-assignment. Confirm that a POST to `/companies(id)/items` with `body.number` omitted returns an auto-assigned number in the response's `.number` field.

**BC-2 (Jon):** One-time backfill — populate `Vendor_Item_No` on all existing BC items that have a PN stored in their "No." field. Items whose "No." is already a surrogate (from manual entry or previous series) need `Vendor_Item_No` set to whatever the full PN should be. This ensures `bcItem._vendorItemNo` is populated for existing items when users browse them.

**BC-3 (dependency):** BC-2 backfill MUST complete before code deploy. Without it, `commitBcItem` can't distinguish the full PN from the surrogate — cross-detection would false-positive on every commit for un-backfilled items.

---

## Utility Function

Add near the BC helper functions (after `_daysToBcDateFormula`, ~line 4319):

```js
function _bcNo(row){return row?.bcNo||(row?.partNumber||'').slice(0,20);}
```

Returns the BC "No." for any BOM row: the captured surrogate if available, otherwise a 20-char-truncated fallback that preserves today's behavior for rows that haven't touched BC yet. Every push site and caller uses this instead of `row.partNumber` when targeting a BC Code[20] field.

~1 line.

---

## Phase 1 — Mutation Sites + Cross Detection (~35 lines)

Stop overwriting `partNumber` with the BC "No." Capture the surrogate as `bcNo` instead. Fix cross-detection and learning-DB writes to use the full PN from `Vendor_Item_No`.

**P1 and P2 MUST deploy together.** If P1 ships without P2, `partNumber` stays full but push sites still send `row.partNumber` into Code[20] fields → BC 400 errors.

### 1A. `commitBcItem` (line 26202)

**Line 26249** — introduce `bcFullPN`:
```
CURRENT:  const newPN=bcItem.number;
CHANGE:   const bcSurrogate=bcItem.number;
          const bcFullPN=(bcItem._vendorItemNo||'').trim()||bcSurrogate;
```

**Line 26261-26262** — capture surrogate, write full PN:
```
CURRENT:  const updates={...r,
            ...(newPN?{partNumber:newPN}:{}),
CHANGE:   const updates={...r,
            ...(bcSurrogate?{bcNo:bcSurrogate}:{}),
            ...(bcFullPN&&bcFullPN!==bcSurrogate?{partNumber:bcFullPN}:{}),
```
Rationale: `bcNo` always gets the surrogate. `partNumber` gets the full PN from `Vendor_Item_No` — but ONLY when `bcFullPN` differs from the surrogate (i.e., `_vendorItemNo` is populated). If `_vendorItemNo` is empty (un-backfilled item), `partNumber` stays as the row's current value (preserves whatever was there — full from extraction, or truncated from an old commit).

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
Without this, `normPart("MTX-00001") !== normPart("LONG-PN-12345")` → every commit would be flagged as a cross.

**Line 26299** — async Item Card re-fetch uses surrogate:
```
CURRENT:  ...ItemCard?$filter=No eq '${newPN}'...
CHANGE:   ...ItemCard?$filter=No eq '${bcSurrogate}'...
```
(Also change `if(newPN)` guard to `if(bcSurrogate)` at same line.)

**Line 26324** — learning DB cross entry uses full PN:
```
CURRENT:  saveAlternateEntry(uid,origPN,{partNumber:newPN,description:...unitCost:...},true)
CHANGE:   saveAlternateEntry(uid,origPN,{partNumber:bcFullPN,description:...unitCost:...},true)
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

This is the UI prompt before `commitBcItem` is called:

**Lines 26415-26417:**
```
CURRENT:  const origPN=(row.crossedFrom||row.partNumber||"").trim();
          const newPN=bcItem.number;
          const isCrossing=origPN&&origPN!==newPN;
CHANGE:   const origPN=(row.crossedFrom||row.partNumber||"").trim();
          const bcFullPN=(bcItem._vendorItemNo||'').trim()||bcItem.number;
          const isCrossing=origPN&&normPart(origPN)!==normPart(bcFullPN);
```
Also uses `normPart()` for consistent comparison (strips whitespace/hyphens/dots). Without this, the cross prompt fires for `"ABC-123"` vs `"ABC123"` differences.

~3 lines changed.

### 1C. Background pricing (line 14914)

**Line 14916** — extract `bcNo` alongside `pn`:
```
CURRENT:  const pn=(row.partNumber||"").trim();
ADD:      const _rowBcNo=row.bcNo||'';
```

**Line 14919-14923** — exact lookup uses surrogate, stores BC "No." as bcNumber:
```
CURRENT:  if(row.priceSource==="bc"){
            const exact=await bcLookupItem(pn);
            if(exact&&exact.unitCost!=null){
              const vNo=exact.vendorNo||await bcGetItemVendorNo(pn);
              bcMap[...]={...bcNumber:pn,...};
CHANGE:   if(row.priceSource==="bc"){
            const exact=await bcLookupItem(_rowBcNo||pn);
            if(exact&&exact.unitCost!=null){
              const vNo=exact.vendorNo||await bcGetItemVendorNo(_rowBcNo||pn);
              bcMap[...]={...bcNumber:exact.number||_rowBcNo||pn,...};
```
Key fix: `bcNumber` now stores `exact.number` (the BC "No." from lookup response) instead of `pn` (the row's full partNumber). Without this, `bcMap[key].bcNumber` would be the full PN, and mutation site 2 would write it to `bcNo` — wrong.

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
`partNumber` is no longer touched. `bcNo` is written only when we have a BC match.

The `bcPnSubstitutions` logging (line 14965) should be updated: instead of `newPn!==r.partNumber`, check `matchedBcNo&&matchedBcNo!==(r.bcNo||'')` (log when bcNo changes, not when partNumber was going to change).

~8 lines changed.

### 1D. Foreground pricing (line 26781)

Identical changes to 1C, at the foreground pricing path:

**Line 26783** — add `_rowBcNo`:
```
ADD:      const _rowBcNo=row.bcNo||'';
```

**Lines 26792-26796** — exact lookup:
```
CURRENT:  const exact=await bcLookupItem(pn);
          ...bcNumber:pn,...
CHANGE:   const exact=await bcLookupItem(_rowBcNo||pn);
          ...bcNumber:exact.number||_rowBcNo||pn,...
```

**Lines 26846-26848** — mutation site 3:
```
CURRENT:  const newPn=bcMap[key].bcNumber||r.partNumber;
          ...
          return{...r,partNumber:newPn,
CHANGE:   const matchedBcNo=bcMap[key].bcNumber||null;
          ...
          return{...r,
            ...(matchedBcNo?{bcNo:matchedBcNo}:{}),
```

~8 lines changed.

### P1 total: ~35 lines

---

## Phase 2 — Push Sites (~30 lines)

Switch every BC-push call site to use `_bcNo(row)` or the captured surrogate instead of `row.partNumber`.

### 2A. `bcSyncPanelPlanningLines` (line 3662)

```
CURRENT:  Line_Type:"Budget",Type:"Item",No:row.partNumber,
CHANGE:   Line_Type:"Budget",Type:"Item",No:_bcNo(row),
```

Also line 3678 — posting group auto-fix reads `l.No` from the planning line object, which now has the correct value from the change above. No additional change needed there.

~1 line.

### 2B. `bcSyncEcoPanelPlanningLines` (line 3851)

**NOT in Freddy's 8-site list.** Discovered during this trace — same `No:row.partNumber` pattern for ECO planning lines.

```
CURRENT:  No:row.partNumber.trim(),
CHANGE:   No:_bcNo(row),
```

~1 line.

### 2C. `bcReVerifyItems` (lines 4858-4877)

**Line 4860-4861** — lookup uses surrogate:
```
CURRENT:  const pn=(row.partNumber||"").trim();
          const item=await bcLookupItem(pn);
CHANGE:   const pn=_bcNo(row);
          const item=await bcLookupItem(pn);
```

**Line 4871** — PP fetch uses surrogate:
```
CURRENT:  return r?(r.partNumber||"").trim():null;
CHANGE:   return r?_bcNo(r):null;
```

~2 lines.

### 2D. `bcLookupItems` (line 4498-4500)

```
CURRENT:  const pn=(row.partNumber||"").trim();
          ...
          const item=await bcLookupItem(pn);
CHANGE:   const pn=_bcNo(row);
          ...
          const item=await bcLookupItem(pn);
```

~1 line.

### 2E. `bcPatchItemOData` callers

The function itself (line 4943) is generic — takes a string. Fix the callers that pass BOM-row `partNumber`:

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 26524 | manual price push | `bcPatchItemOData(partNumber,...)` | Need row context: extract `bcNo` from the BOM row at line 26512 or use `_bcNo(row)` |
| 26564 | vendor update | `bcPatchItemOData(pn,{Vendor_No:...})` where `pn=(row?.partNumber\|\|"")` | `bcPatchItemOData(_bcNo(row),{Vendor_No:...})` |
| 27010 | Codale pricing | `bcPatchItemOData(origPN,...)` | `bcPatchItemOData(_bcNo(r),...)` (need the row `r` in scope) |
| 27119 | scraper pricing | `bcPatchItemOData(r.partNumber,...)` | `bcPatchItemOData(_bcNo(r),...)` |
| 37591 | price push batch | `bcPatchItemOData(partNumber,...)` | Need row context |
| 41863 | CSV import update | `bcPatchItemOData(row.partNumber,...)` | Keep as-is — CSV rows are BC-keyed already (user enters BC item number) |

For lines 26524 and 37591, the `partNumber` variable is extracted from the BOM row earlier in the function. Marc should trace the variable back to the row object and use `_bcNo(row)` or extract `row.bcNo || partNumber.slice(0,20)` at the extraction point.

~6 lines.

### 2F. `bcPushPurchasePrice` callers

Same pattern — function is generic, fix callers:

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 26533 | manual price push | `bcPushPurchasePrice(partNumber,...)` | `bcPushPurchasePrice(_bcNo(row),...)` (same row context as 2E line 26524) |
| 27011 | Codale | `bcPushPurchasePrice(origPN,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 27120 | scraper | `bcPushPurchasePrice(r.partNumber,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 31328 | portal apply | `bcPushPurchasePrice(i.partNumber,...)` | `bcPushPurchasePrice(_bcNo(i),...)` |
| 37597 | price push batch | `bcPushPurchasePrice(partNumber,...)` | Need row context |
| 38172 | alt/cross | `bcPushPurchasePrice(alt.partNumber,...)` | `bcPushPurchasePrice(_bcNo(alt),...)` |
| 38842 | scraper push | `bcPushPurchasePrice(r.partNumber,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 39369 | scraper push | `bcPushPurchasePrice(r.partNumber,...)` | `bcPushPurchasePrice(_bcNo(r),...)` |
| 39510 | DK scraper | `bcPushPurchasePrice(res.partNumber,...)` | `bcPushPurchasePrice(_bcNo(res),...)` |
| 39515 | Mouser scraper | `bcPushPurchasePrice(res.partNumber,...)` | `bcPushPurchasePrice(_bcNo(res),...)` |

Callers that already use `created.number` (lines 22381, 31506) are correct — they pass the BC response's number. No change.

~10 lines.

### 2G. `bcUpsertItemVendorLeadTime` callers

**NOT in Freddy's 8-site list.** Discovered during this trace. This function writes `Item_No` to BC's ItemVendorCatalog — a Code[20] field.

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 26088 | portal lead time batch | `partNumber:w.partNumber` | `partNumber:_bcNo(w)` |
| 26679 | pricing lead time | `partNumber:row.partNumber` | `partNumber:_bcNo(row)` |
| 31359 | portal apply | `partNumber:...` | check caller context |
| 37680 | pricing lead time | `partNumber:...` | check caller context |

~4 lines.

### 2H. `bcGetItemVendorNo` callers (secondary read sites)

Not push sites (reads only), but lookups would fail if passed a full PN instead of BC "No." A failed lookup returns empty vendor info — not data corruption, but incorrect vendor display.

| Line | Context | Current | Change |
|------|---------|---------|--------|
| 15042 | bg pricing vendor patch | `pn=(row.partNumber\|\|"")` | `pn=_bcNo(row)` |
| 26652 | pricing vendor | `(row.partNumber\|\|"")` | `_bcNo(row)` |
| 26082 | portal vendor | `w.partNumber` | `_bcNo(w)` |
| 27212 | supplier vendor | `pn=...` | check row context |

~4 lines.

### 2I. Correction 2(b) — push sites reachable without `bcNo`

The following push sites can fire on rows that have NEVER been through a mutation site (1/2/3):

1. **`bcSyncPanelPlanningLines` (site 4) and `bcSyncEcoPanelPlanningLines` (site 5):** Iterate ALL non-labor BOM rows regardless of BC interaction history. A freshly extracted row has no `bcNo`. The `_bcNo(row)` fallback returns `partNumber.slice(0,20)` — same as today's behavior where `partNumber` was already truncated by a previous commit. For rows that were never committed (raw extraction PNs), the truncated value is a "best effort" BC match. BC will either find the item or 400.

2. **`bcPushPurchasePrice` callers (scraper flows):** Scrapers push prices for rows that may not have BC items yet. Without `bcNo`, `_bcNo(r)` returns `.slice(0,20)`. The push will fail with "item not found" — same as today when pushing a price for an un-created item.

3. **`bcReVerifyItems`:** Checks rows with `bcVerify.status==="not-in-bc"`. These rows have NO BC item — `bcNo` is undefined. `_bcNo(row)` returns `.slice(0,20)`. The lookup either finds an item (confirms BC sync) or doesn't (stays "not-in-bc"). Correct behavior.

**Conclusion:** The `.slice(0,20)` fallback in `_bcNo()` covers all edge cases. No additional guards needed. The fallback preserves today's behavior exactly — the only rows affected by #163 are rows where mutation sites 1/2/3 fire, which always populate `bcNo`.

### P2 total: ~30 lines

---

## Phase 3 — Create Path (~15 lines)

Omit `body.number` on `bcCreateItem` so BC auto-assigns the surrogate. Write full PN to `Vendor_Item_No`.

### 3A. `bcCreateItem` function (line 4889)

**Line 4894** — omit `number` from POST body:
```
CURRENT:  if(number)body.number=number;
CHANGE:   // #163: body.number intentionally omitted — BC auto-assigns from No.-Series.
          // The `number` param is now used ONLY for Vendor_Item_No (the full PN).
```

**Line 4921** — write full PN to `Vendor_Item_No`:
```
CURRENT:  if(vendorNo)patch.Vendor_Item_No=item.number;
CHANGE:   if(vendorNo)patch.Vendor_Item_No=number||item.number;
```
Uses the original `number` parameter (the full PN passed by the caller). Falls back to `item.number` if `number` is empty (defensive).

**Line 4933** — return the full PN alongside the surrogate:
```
CURRENT:  return{number:item.number||"",...
CHANGE:   return{number:item.number||"",fullPN:number||item.number||"",...
```
Callers that need the full PN can read `created.fullPN`. Callers that need the BC "No." read `created.number` (unchanged).

~5 lines.

### 3B. Call site: BC Item Browser "Create in BC" (line 22375)

```
CURRENT:  bcCreateItem({number:createNumber.trim(),...})
CHANGE:   bcCreateItem({number:createNumber.trim(),...})
```
No change to the call — `number` param now serves as the full PN for `Vendor_Item_No`. The `if(number)body.number=number` removal in 3A ensures it's not sent as the BC "No."

BUT: The form field currently labeled "Item No." (or similar) should be relabeled to "Part Number" in P4 to avoid confusion. The user types the full PN; BC assigns the surrogate automatically.

~0 lines (call site unchanged).

### 3C. Call site: Portal "Create New Item" (line 31482)

```
CURRENT:  number:newItemForm.itemNo||undefined,
CHANGE:   number:newItemForm.itemNo||item.partNumber||undefined,
```
Ensure the full PN is always passed as `number` (for `Vendor_Item_No`). If the form has a user-edited value, use it; otherwise fall back to the BOM row's `partNumber`.

~1 line.

### 3D. Call site: Supplier CSV import (line 41866)

```
CURRENT:  await bcCreateItem({number:row.partNumber,...});
```
No change needed — `row.partNumber` is the full PN from the CSV. It becomes the `Vendor_Item_No`. BC auto-assigns the surrogate.

~0 lines.

### 3E. Post-create: capture `bcNo` on BOM row

After `bcCreateItem` returns, the caller should write the auto-assigned surrogate (`created.number`) back to the BOM row as `bcNo`:

**Line 22375 path (BC Item Browser create):** After create, the user selects the newly created item via `onSelect(created)` → flows to `commitBcItem` → P1 fix captures `bcNo` automatically. No additional change needed.

**Line 31496 (Portal create):** After create, `bcItem=await bcLookupItemForQuote(created.number)` → then the row is updated. Marc should add `bcNo: created.number` to the row update at ~line 31498.

**Line 41866 (CSV import create):** The CSV import doesn't update individual BOM rows — it's a batch BC item creation utility. `bcNo` is captured when the row later goes through pricing or commitBcItem.

~3 lines (portal path only).

### P3 total: ~10 lines (excluding P4 relabel)

---

## Phase 4 — Item Browser Display + Create Form (~5 lines)

### 4A. Item Browser search results display (line 22421)

```
CURRENT:  <td ...>{item.number}</td>
CHANGE:   <td ...>{item._vendorItemNo||item.number}</td>
```
Shows the full PN when available; falls back to BC "No." for items without Vendor_Item_No.

~1 line.

### 4B. Create form field relabel

The "Item No." text input in the create form (within BCItemBrowserModal) should be relabeled to "Part Number" since the user is now entering the full PN, not the BC "No." The value still flows to `createNumber` → `bcCreateItem({number: createNumber, ...})` → becomes `Vendor_Item_No`.

Marc: search for the create form label near line 22350-22370 and change the label text. ~1 line.

### 4C. Consider: show surrogate in results

After the transition, the search results' "No." column shows `item._vendorItemNo||item.number`. If users need to see both the surrogate and the full PN (e.g., for BC cross-reference), add a second narrow column showing `item.number` (the surrogate) in muted text. This is optional — defer to Jon's judgment.

### P4 total: ~3-5 lines

---

## Phase 5 — Learning-DB Lazy Dual-Match (~12 lines)

When `applyLearnedCorrections` (line 10672) matches BOM row PNs against learning DB entries, add a `.slice(0,20)` fallback so a full-PN row matches a truncated DB entry.

### 5A. Alternates (line 10711)

```
CURRENT:  const alt=userAlts.find(a=>a.autoReplace&&a.replacement&&_altMatchesPN(a,pn));
CHANGE:   const alt=userAlts.find(a=>a.autoReplace&&a.replacement&&(_altMatchesPN(a,pn)||_altMatchesPN(a,pn.slice(0,20))));
```

Also line 10723 (non-auto alternate check):
```
CURRENT:  const matchedButNotAuto=userAlts.find(a=>!a.autoReplace&&a.replacement&&_altMatchesPN(a,pn));
CHANGE:   const matchedButNotAuto=userAlts.find(a=>!a.autoReplace&&a.replacement&&(_altMatchesPN(a,pn)||_altMatchesPN(a,pn.slice(0,20))));
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
CURRENT:  const pcKey=pn.toLowerCase();
          const pc=userPartCorrs.find(c=>c.key===pcKey);
CHANGE:   const pcKey=pn.toLowerCase();
          const pc=userPartCorrs.find(c=>c.key===pcKey||c.key===pn.slice(0,20).toLowerCase());
```

~1 line.

### 5D. Description crosses (line 10745-10748)

No change needed — description crosses match by `description`, not by `partNumber`. The `.slice(0,20)` fallback is irrelevant here.

### P5 total: ~6 lines (plus the additional fallback on line 10723)

---

## Document Surfaces — Verify Only (0 lines)

Confirm that these surfaces read `row.partNumber` and auto-fix once `partNumber` stays full:

| Surface | Field | Line(s) | Expected behavior |
|---------|-------|---------|-------------------|
| RFQ email/PDF | `item.partNumber` | 6435 | Shows full PN ✓ |
| Traveler BOM | `r.partNumber` | 8053 | Shows full PN ✓ |
| Quote PDF | `r.partNumber` | via `buildQuotePdfDoc` | Shows full PN ✓ |
| BOM table inline | `row.partNumber` | 28558 column config | Shows full PN ✓ |

Zero code changes. Marc should visually verify in the end-to-end test (T1 below).

---

## Deployment Sequence

1. **BC-1/BC-2** (Jon): Configure No.-Series + backfill Vendor_Item_No. Validate in sandbox.
2. **P1+P2** ship together as one commit (or sequential commits, one version bump). NEVER deploy P1 without P2.
3. **P3** can ship with P1+P2 or immediately after. Before P3, new BC items are created with the full PN as "No." (old behavior). After P3, new items get surrogates.
4. **P4** ships with or after P3 (display swap only makes sense after surrogates exist).
5. **P5** ships with P1+P2 (learning-DB fallback is needed from the moment `partNumber` stops being truncated).

Recommended: **P1+P2+P5 in one version, P3+P4 in the next.** P1+P2+P5 is the "stop truncating" release. P3+P4 is the "auto-assign surrogates" release. Both can be in the same deploy if testing allows.

---

## Test Criteria

### T1 — End-to-end long-PN item (Golden Path)

Extract a BOM with a >20-char PN (e.g., "SCE-90EL4820SSFSD000XXX"). Verify:
1. `row.partNumber` in Firestore = full PN (not truncated)
2. Commit via BC Item Browser → `row.bcNo` = MTX-##### surrogate in Firestore
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
4. Console shows no `bcPnSubstitutions` for this row (or shows bcNo-change logging)

### T3 — Planning line sync keys on surrogate

Trigger "Push Update to BC" (planning line sync):
1. BC planning line's "No" = MTX-##### (the surrogate), NOT the full PN
2. No BC 400 errors
3. Quantity, Unit_Cost correct

### T4 — Cross detection works

With a committed >20-char row, open BC Item Browser and select a DIFFERENT item:
1. Cross/Correction/Just Apply prompt appears (genuine cross)
2. Learning DB stores full PNs (both `originalPN` and `replacement.partNumber`)
3. `crossedFrom` = the original full PN

With the same committed row, re-select the SAME BC item:
4. No cross prompt (same-item re-commit should NOT prompt)

### T5 — Short PN (<= 20 chars) regression

Full cycle with a normal PN (e.g., "1492-J4"):
1. Commit, pricing, planning sync all work as before
2. `row.bcNo` = MTX-##### (surrogate, even for short PNs)
3. `row.partNumber` = "1492-J4" (unchanged)
4. No behavioral difference from pre-fix for short PNs

### T6 — Learning DB transition

Create a learning DB alternate with a truncated PN (manually or via old-code commit). Then extract a new BOM with the full version of that PN:
1. Auto-cross fires (the `.slice(0,20)` fallback matches)
2. `appliedLog` shows the match
3. `crossedFrom` = the full PN (from extraction)

### T7 — Create path (after P3)

Use "Create in BC" button in Item Browser for a >20-char PN:
1. BC item created with auto-assigned MTX-##### as "No."
2. BC item's `Vendor_Item_No` = the full PN
3. Item Browser display shows the full PN (not the surrogate)
4. Subsequent commit from browser → `row.bcNo` = MTX-#####, `row.partNumber` = full PN

### T8 — Clean-break existing data

Open a project that was committed under old code (truncated PNs):
1. BOM table shows truncated PNs (as before)
2. Pricing works (finds BC item via truncated "No.")
3. Planning sync works (sends truncated "No." via `_bcNo()` fallback)
4. If user re-commits via Item Browser → `bcNo` captured, `partNumber` updated to full PN (if `_vendorItemNo` populated from backfill)

### T9 — ECO planning lines

Trigger ECO planning line sync with a >20-char PN row:
1. BC planning line's "No" = surrogate or `.slice(0,20)` fallback
2. No BC 400 errors

### T10 — Purchase price push

Manually enter a price for a >20-char PN row that has `bcNo`:
1. `bcPatchItemOData` called with surrogate (not full PN)
2. `bcPushPurchasePrice` called with surrogate
3. Both succeed (item found in BC)

---

## Summary — Change Count

| Phase | Lines | Risk |
|-------|-------|------|
| Utility `_bcNo` | 1 | Negligible |
| P1 (mutation + cross) | ~35 | MEDIUM — core data flow |
| P2 (push sites) | ~30 | MEDIUM — many call sites, uniform pattern |
| P3 (create path) | ~10 | LOW — isolated function |
| P4 (display) | ~5 | LOW — UI text only |
| P5 (learning DB) | ~6 | LOW — additive fallback |
| **Total** | **~87** | |

## Follow-up Items (NOT in this build)

- **Batch re-key** (Q3 Step 2 + Q5 re-fetch): One-time migration script to update learning DB entries and existing BOM rows. Scope only if field data shows material impact.
- **Marc audit**: After implementing P2, grep for `partNumber` in all BC-calling functions and confirm no remaining sites pass `row.partNumber` into a Code[20] field. Pattern: `grep -n 'partNumber.*bcPatch\|partNumber.*bcPush\|partNumber.*Item_No\|No:.*partNumber'`.

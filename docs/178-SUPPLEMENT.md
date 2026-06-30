# #178 Supplement — RFQ Pre-fill Fix Cluster (A/B/C)

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** SCOPE COMPLETE — feeds Detailed Plan
**Tip:** master `cda53afa`
**Scope:** Trace + scope only. NO implementation.

---

## Overview

Three supplier-facing issues in the RFQ send + portal path. One bug (auto-checkbox
fires on wrong conditions) and two gaps (price and lead-time columns not pre-filled).
All share the same data path: `buildRfqSupplierGroups` → Firestore `rfqUploads/{token}`
→ supplier portal rendering.

**GOVERNING PRINCIPLE (from analyst):** Pre-fill values we trust (current price, firm
lead time) for supplier confirm/update. Leave blank only what the supplier must provide
(missing price, AI/missing lead time).

**HARD FENCE:** Do NOT touch `_eligibilityReason`'s include logic or RFQ-breadth policy.

---

## Part A — "Lead Time Only" Auto-checkbox Bug

### Current code

**Auto-set condition** (`src/app.jsx` line 6380):
```js
g.defaultLeadTimeOnly=(g.itemsMissingPrice===0&&g.itemsStalePrice===0&&g.itemsMissingLeadTime>0);
```

**Counter increments** (lines 6372–6374):
```js
if(reason==="missingPrice")grp.itemsMissingPrice++;
else if(reason==="stalePrice")grp.itemsStalePrice++;
else if(reason==="missingLeadTime")grp.itemsMissingLeadTime++;
```

**State initialization** (line 19104):
```js
const [leadTimeOnly,setLeadTimeOnly]=useState(()=>{
  const m={};groups.forEach(g=>{m[g.vendorName]=!!g.defaultLeadTimeOnly;});return m;
});
```

### Bug mechanism: cooldown masking

`_eligibilityReason` (line 6314) has a cooldown short-circuit:

```js
const inCooldown=r.rfqSentDate&&(now-r.rfqSentDate)<RFQ_SENT_COOLDOWN;
if(!inCooldown){
  if(!r.unitPrice||r.unitPrice===0)return "missingPrice";
  // ...stale price check...
  if(!displayDate||displayDate<now-RFQ_STALE_MS)return "stalePrice";
}
// Lead-time check — ALWAYS evaluated, regardless of cooldown
if(!_hasFirmLeadTime(r))return "missingLeadTime";
return null;
```

When a row is IN COOLDOWN (`rfqSentDate` within 30 days), the price checks are
skipped entirely. A row with `unitPrice===0` (no price) but in cooldown falls through
to the lead-time check and returns `"missingLeadTime"` instead of `"missingPrice"`.

**Consequence:** `itemsMissingPrice` stays 0 for that row. If all rows in a vendor
group are in cooldown with missing prices AND missing lead times, `defaultLeadTimeOnly`
fires — the checkbox auto-enables on a group that genuinely needs prices quoted.

### Concrete scenario

Vendor A has 3 items. All were RFQ'd 15 days ago (in cooldown). Two have `unitPrice:0`,
one has `unitPrice:50`. None have firm lead times.

| Row | unitPrice | inCooldown | `_eligibilityReason` | Counter |
|-----|-----------|------------|---------------------|---------|
| 1 | 0 | yes | `"missingLeadTime"` | missingLeadTime++ |
| 2 | 0 | yes | `"missingLeadTime"` | missingLeadTime++ |
| 3 | 50 | yes | `"missingLeadTime"` | missingLeadTime++ |

Result: `itemsMissingPrice=0, itemsStalePrice=0, itemsMissingLeadTime=3`.
`defaultLeadTimeOnly = true` — **BUG.** 2/3 of items have no price.

### Correct rule (from analyst)

`defaultLeadTimeOnly = true` ONLY when:
1. EVERY included row has a firm price (`unitPrice > 0`, not being requested), AND
2. At least one row needs a lead time (`itemsMissingLeadTime > 0`)

Any row with `unitPrice===0` or missing → box UNCHECKED, regardless of cooldown or
RFQ reason classification.

### Why the counters can't be trusted for auto-set

The counters are downstream of `_eligibilityReason`'s classification, which serves a
different purpose: determining WHY a row is RFQ-eligible. Cooldown correctly suppresses
re-requesting prices too soon. But auto-set needs to know whether prices ARE PRESENT,
not whether they're being requested. These are different questions, and the counter
conflates them.

**Fix direction:** Auto-set must evaluate price presence directly on `item.unitPrice`,
NOT rely on the `_rfqReason` classification. The counters remain correct for their
original purpose (eligibility breakdown display).

---

## Part B — RFQ Unit Price Column Blank

### KEY QUESTION: data present but not written, or not loaded?

**Answer: POPULATION DECISION.** The current price IS present on the BOM row at RFQ-gen
time. `group.items` carries full BOM row data via `{...item, _rfqReason:reason}` (line
6371). `item.unitPrice` is available and populated.

The price is deliberately excluded from the Firestore payload and all rendered surfaces
in normal (non-leadTimeOnly) mode. This is not a data-fetch gap — it's a design gap.

### Data flow trace

**1. Firestore payload** (line 19189–19197):
```js
const base={partNumber:..., description:..., qty:..., manufacturer:...};
if(i.leadTimeDays!=null) base.referenceLeadTimeDays=+i.leadTimeDays;
if(i.leadTimeSource) base.referenceLeadTimeSource=i.leadTimeSource;
if(ltOnly){
  base.referencePrice=i.unitPrice!=null?+i.unitPrice:null;
  base.referencePriceSource=i.unitPrice!=null?"bc":null;
}
```

`referencePrice` is gated by `if(ltOnly)`. In normal mode, no price data reaches
Firestore. The base payload includes only `partNumber`, `description`, `qty`,
`manufacturer`.

**2. Email HTML** (line 6502–6511):
```js
// Normal mode row:
<td style="...text-align:right">&nbsp;</td>      // Price: blank
<td style="...text-align:center">&nbsp;</td>      // Lead time: blank
```
```js
// leadTimeOnly mode row (line 6490–6500):
<td style="...font-style:italic">${refP}</td>     // Price: $XX.XX from item.unitPrice
<td style="...background:#fef9c3">&nbsp;</td>     // Lead time: blank (to fill)
```

**3. PDF attachment** (line 8216):
```js
const refP=(leadTimeOnly&&item.unitPrice!=null)?`$${Number(item.unitPrice).toFixed(2)}`:"";
```
Normal mode → blank. leadTimeOnly → `$XX.XX`.

**4. Portal review table** (line 48362–48374):
- leadTimeOnly: read-only `<span>` showing `item.referencePrice` (italic, gray bg)
- Normal: editable `<input>`, `value={unitPrices[i]??''}` — starts blank

**5. Portal load pre-fill** (line 47857–47866):
```js
if(data.leadTimeOnly && Array.isArray(data.lineItems)){
  const prefillPrices={};
  data.lineItems.forEach((item,i)=>{
    if(item.referencePrice!=null) prefillPrices[i]=Number(item.referencePrice).toFixed(2);
  });
  setUnitPrices(prefillPrices);
  setPhase('review');  // Skip PDF upload entirely
}
```
Pre-fill only fires in leadTimeOnly mode. Normal mode: no pre-fill, supplier lands on
upload phase.

### Infrastructure exists

The leadTimeOnly path proves the infrastructure works end-to-end:
- `referencePrice` field on lineItems ✓
- Portal reads and pre-fills from it ✓
- Read-only vs editable rendering ✓

The gap is that normal mode doesn't use any of this. Fix requires:
1. Always write `referencePrice` to the payload (drop the `if(ltOnly)` guard)
2. Portal pre-fill `unitPrices[i]` from `referencePrice` in normal mode (editable, not
   read-only — supplier can update)
3. Show reference price in email/PDF in normal mode (as "Current Price" column)

---

## Part C — RFQ Lead Time Column Blank (Conditional Pre-fill)

### KEY QUESTION: data present but not rendered, or not stored?

**Answer: RENDERING GAP.** `referenceLeadTimeDays` IS already stored unconditionally
in the Firestore payload. The portal never reads it.

### Data flow trace

**1. Firestore payload** (line 19191–19192):
```js
if(i.leadTimeDays!=null) base.referenceLeadTimeDays=+i.leadTimeDays;
if(i.leadTimeSource) base.referenceLeadTimeSource=i.leadTimeSource;
```
Written UNCONDITIONALLY (not gated by `ltOnly`). Both the value and its source are
stored. This means every RFQ lineItem in Firestore already carries the reference lead
time and its source classification.

**2. Portal rendering** (line 48385–48391):
```js
<input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="days"
  value={itemLeadTimes[i]??''}
  onChange={e=>{...setItemLeadTimes(prev=>({...prev,[i]:v}));}}
  ...
/>
```
Always blank. `itemLeadTimes[i]` is never pre-populated from `referenceLeadTimeDays`.
No code reads `referenceLeadTimeDays` from the loaded lineItems (grep: single hit at
line 19191, which is the WRITE site).

**3. Email HTML** (line 6499/6510): Lead time cell is always `&nbsp;` in both modes.

**4. PDF** (line 8217): Lead time cell is always `""`.

### Conditional pre-fill rule (reuses #175 predicate)

The pre-fill must be CONDITIONAL on the lead-time source:

| `referenceLeadTimeSource` | Firm? | Pre-fill? | Rationale |
|--------------------------|-------|-----------|-----------|
| `bc_vendor` | yes | YES | BC vendor catalog — trusted |
| `bc_item` | yes | YES | BC item card — trusted |
| `supplier` | yes | YES | Prior supplier submission — trusted |
| `scraper` | yes | YES | Web scraper — trusted |
| `manual` | yes | YES | User-entered — trusted |
| `ai` | **no** | NO — leave blank | AI estimate — supplier must provide |
| absent/undefined | **no** | NO — leave blank | No data — supplier must provide |

This is the SAME firm/non-firm split as #175's `_hasFirmLeadTime(r)`. The portal-side
pre-fill evaluates it against the stored `referenceLeadTimeSource` field:

```
Pre-fill if: referenceLeadTimeDays != null
          && referenceLeadTimeSource
          && referenceLeadTimeSource !== "ai"
```

**Editable, not read-only.** Unlike price in leadTimeOnly mode (which is locked),
pre-filled lead times should be editable — the supplier can correct if the reference
value is wrong.

### Fix requires

1. Portal load: pre-fill `itemLeadTimes[i]` from `item.referenceLeadTimeDays` when
   the source is firm (same predicate as above)
2. Email/PDF: optionally show firm reference lead times inline (for supplier reference,
   e.g., "Current: 14d"). Non-firm: leave blank.
3. No payload changes needed — `referenceLeadTimeDays` is already stored.

---

## Regression Surface

### RFQ payload builders (ARC side → Firestore)

| Component | Lines | Touched by fix? |
|-----------|-------|----------------|
| `buildRfqSupplierGroups` | 6345–6384 | A: auto-set logic changes |
| `buildRfqEmailHtml` | 6482–6564 | B: normal-mode price column. C: lead-time column |
| `buildRfqPdf` (via `buildRfqPdfDoc`) | ~8200–8230 | B: normal-mode price column. C: lead-time column |
| Firestore `rfqUploads/{token}` write | 19189–19205 | B: remove `if(ltOnly)` guard on referencePrice |
| `leadTimeOnly` state init | 19104 | A: unchanged (reads `defaultLeadTimeOnly`) |

### Portal consumers (read from Firestore)

| Component | Lines | Touched by fix? |
|-----------|-------|----------------|
| Portal load / pre-fill | 47844–47870 | B: pre-fill prices in normal mode. C: pre-fill firm LTs |
| Portal review table (price cell) | 48352–48375 | B: show editable pre-filled price in normal mode |
| Portal review table (LT cell) | 48377–48392 | C: show pre-filled firm LT (editable) |
| Portal submit handler | ~48450+ | NONE — reads `unitPrices`/`itemLeadTimes` state, unchanged |

### ARC-side consumers (read portal submissions)

| Component | Purpose | Touched by fix? |
|-----------|---------|----------------|
| Apply Prices handler | Writes submitted prices/LTs to BOM rows | NONE |
| RFQ history entry | Logs sent items | NONE |
| PortalSubmissionsModal | Displays submitted responses | NONE |

### Interaction with #175

Part C reuses the firm/non-firm split from #175's `_hasFirmLeadTime(r)`. If #175 is
deployed first (it should be — it's already planned), the shared helper exists and the
portal-side pre-fill evaluates the same logic against stored `referenceLeadTimeSource`.
If #175 is NOT yet deployed, Part C can evaluate the predicate inline on the portal
side (it doesn't need the helper function — it has the raw source value).

---

## Scope summary for Detailed Plan

| Part | Type | Root cause | Fix surface |
|------|------|-----------|-------------|
| A | BUG | Cooldown masks missing-price classification → auto-set fires wrong | `buildRfqSupplierGroups` auto-set condition |
| B | GAP | `referencePrice` gated by `ltOnly` + no normal-mode pre-fill | Payload builder + portal load + email/PDF |
| C | GAP | `referenceLeadTimeDays` stored but never read portal-side | Portal load + email/PDF (no payload change) |

**Total touch points:** 6 code sites across 2 rendering paths (ARC-side build + portal render).

**Estimated size:** ~30 lines. Each part is independent and can be implemented/tested
separately, but they share the same payload path and should ship together.

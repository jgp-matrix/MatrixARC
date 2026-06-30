# #178 Detailed Plan — RFQ Pre-fill Fix Cluster (A/B/C)

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** READY FOR APPROVAL
**Builds on:** C121 scope trace (`docs/178-SUPPLEMENT.md`)
**Tip:** master `aa5c5ec1`

---

## Overview

Three changes spanning the RFQ send path (ARC side) and the supplier portal (portal side)
in `src/app.jsx`. One bug fix (Part A), two gap fills (Parts B/C). ~30 lines across
7 code sites.

**KEY SEPARATION:** The auto-set question ("should we default to lead-time-only?") and the
eligibility question ("why is this row included?") are DIFFERENT questions that now use
DIFFERENT code paths. Conflating them via `_eligibilityReason`'s counters caused the bug.

**PRICE-PRESENCE ALIGNMENT:** ARC-side `_hasPrice(r)` and portal-side `_isValidPrice(x)`
(from #179) answer the same question — "is there a meaningful price?" — against different
data shapes (BOM row vs form input). They are linked through the `referencePrice` data
flow: `_hasPrice` gates what gets STORED in Firestore; `_isValidPrice` gates what the
portal ACCEPTS. If the BOM-row definition evolves, the stored data changes, and the
portal predicate automatically reflects that. Same notion, one definition per side, data
flow prevents drift.

---

## §1 — Shared price-presence helper

**Location:** `src/app.jsx`, near `_hasFirmLeadTime` (line 15746). Both are BOM-row
predicates — co-locate for discoverability.

**Add:**
```js
function _hasPrice(r){return r.unitPrice!=null&&+r.unitPrice>0;}
```

One pure predicate. Takes a BOM row and answers "does this row have a meaningful price?"
Used by four sites in this plan:
- Auto-set condition (§2)
- Firestore payload builder (§3)
- Email rendering (§6)
- PDF rendering (§7)

---

## §2 — Part A: Fix auto-checkbox condition

**Location:** `src/app.jsx` line 6380, inside `buildRfqSupplierGroups`.

**Before:**
```js
g.defaultLeadTimeOnly=(g.itemsMissingPrice===0&&g.itemsStalePrice===0&&g.itemsMissingLeadTime>0);
```

**After:**
```js
g.defaultLeadTimeOnly=g.items.every(it=>_hasPrice(it))&&g.itemsMissingLeadTime>0;
```

**What changes:** The auto-set evaluates price presence DIRECTLY on each item's
`unitPrice` field via `_hasPrice`, bypassing the cooldown-masked eligibility counters.
Every item in the group must genuinely have a price for the checkbox to default on.

**What stays:** The counters (`itemsMissingPrice`, `itemsStalePrice`, `itemsMissingLeadTime`)
are UNCHANGED. They remain correct for their original purpose — the eligibility breakdown
display. `itemsMissingLeadTime > 0` is safe in the new condition because the lead-time
counter is never masked by cooldown (the LT check in `_eligibilityReason` is ALWAYS
evaluated, per the DECISION comment at line 6318).

**The cooldown-masking bug resolved:**

| Scenario | `_eligibilityReason` | Old auto-set | New auto-set |
|----------|---------------------|-------------|-------------|
| In cooldown, unitPrice=0, no firm LT | `"missingLeadTime"` | `itemsMissingPrice=0` → **true (BUG)** | `_hasPrice(it)` → false → **false (CORRECT)** |
| In cooldown, unitPrice=50, no firm LT | `"missingLeadTime"` | true | `_hasPrice(it)` → true → true |
| Not in cooldown, unitPrice=0 | `"missingPrice"` | `itemsMissingPrice>0` → false | `_hasPrice(it)` → false → false |
| All items priced, some need LT | mixed | true | true |

---

## §3 — Part B: Firestore payload (always write referencePrice)

**Location:** `src/app.jsx` lines 19189–19197, inside the per-vendor token loop.

**Before:**
```js
const base={partNumber:i.partNumber||"",description:i.description||"",qty:i.qty||1,manufacturer:i.manufacturer||""};
if(i.leadTimeDays!=null)base.referenceLeadTimeDays=+i.leadTimeDays;
if(i.leadTimeSource)base.referenceLeadTimeSource=i.leadTimeSource;
if(ltOnly){
  base.referencePrice=i.unitPrice!=null?+i.unitPrice:null;
  base.referencePriceSource=i.unitPrice!=null?"bc":null;
}
```

**After:**
```js
const base={partNumber:i.partNumber||"",description:i.description||"",qty:i.qty||1,manufacturer:i.manufacturer||""};
if(i.leadTimeDays!=null)base.referenceLeadTimeDays=+i.leadTimeDays;
if(i.leadTimeSource)base.referenceLeadTimeSource=i.leadTimeSource;
base.referencePrice=_hasPrice(i)?+i.unitPrice:null;
base.referencePriceSource=_hasPrice(i)?(i.priceSource||null):null;
```

**What changes:**
1. `if(ltOnly)` guard REMOVED — `referencePrice` populates in ALL modes
2. `_hasPrice(i)` replaces `i.unitPrice!=null` — excludes zero-price rows (which have no
   meaningful price to reference)
3. `referencePriceSource` uses actual `i.priceSource` instead of hardcoded `"bc"` — the
   portal doesn't read this field today, but the stored value is now accurate

**What stays:**
- `referenceLeadTimeDays` and `referenceLeadTimeSource` — already unconditional
- All other payload fields (`partNumber`, `description`, `qty`, `manufacturer`)
- `leadTimeOnly` flag on the Firestore doc

---

## §4 — Part B+C: Portal pre-fill (prices + firm LTs)

**Location:** `src/app.jsx` lines 47863–47872, inside the load `useEffect`.

**Before:**
```js
if(data.leadTimeOnly&&Array.isArray(data.lineItems)){
  const prefillPrices={};
  data.lineItems.forEach((item,i)=>{
    if(item.referencePrice!=null){
      prefillPrices[i]=Number(item.referencePrice).toFixed(2);
    }
  });
  setUnitPrices(prefillPrices);
  setPhase('review');
}
```

**After:**
```js
if(Array.isArray(data.lineItems)){
  const prefillPrices={};
  const prefillLTs={};
  data.lineItems.forEach((item,i)=>{
    if(item.referencePrice!=null)prefillPrices[i]=Number(item.referencePrice).toFixed(2);
    if(item.referenceLeadTimeDays!=null&&item.referenceLeadTimeSource&&item.referenceLeadTimeSource!=="ai")prefillLTs[i]=String(item.referenceLeadTimeDays);
  });
  setUnitPrices(prefillPrices);
  if(Object.keys(prefillLTs).length)setItemLeadTimes(prefillLTs);
  if(data.leadTimeOnly)setPhase('review');
}
```

**What changes:**
1. Price pre-fill no longer gated by `data.leadTimeOnly` — fires in ALL modes
2. Firm lead-time pre-fill ADDED (Part C)
3. `setPhase('review')` stays inside `if(data.leadTimeOnly)` — normal mode still starts
   at the upload phase (supplier uploads a PDF, then reviews)

**Part C pre-fill rule (same as `_hasFirmLeadTime`):**
```
referenceLeadTimeDays != null
&& referenceLeadTimeSource
&& referenceLeadTimeSource !== "ai"
```

The portal component cannot call the ARC-side `_hasFirmLeadTime` function (different
rendering context — the portal loads data from Firestore, not from BOM rows). But the
RULE is identical: firm sources (bc_vendor, bc_item, supplier, scraper, manual) pre-fill;
AI/absent stay blank for the supplier to provide.

Pre-filled values appear in the existing EDITABLE inputs — the supplier can confirm or
update. No read-only rendering changes needed (that's leadTimeOnly mode only).

---

## §5 — Part B+C: processFile merge (prices AND lead times)

**Location:** `src/app.jsx` lines 47936–47938 and 47964–47966, inside `processFile`.

**CRITICAL:** `processFile` currently does a FULL REPLACEMENT of BOTH `unitPrices` AND
`itemLeadTimes` state. After §4, both are pre-filled at load time from Firestore
reference data. Without merge, AI extraction wipes pre-fills for rows it didn't match.

### §5a — Price merge

**Before (line 47936, success path):**
```js
setUnitPrices(allPrices);
```

**After:**
```js
setUnitPrices(prev=>({...prev,...allPrices}));
```

**Before (line 47964, error/partial path):**
```js
setUnitPrices(allPrices);
```

**After:**
```js
setUnitPrices(prev=>({...prev,...allPrices}));
```

### §5b — Lead time merge

**Before (line 47938, success path):**
```js
setItemLeadTimes(allLeadTimes);
```

**After:**
```js
setItemLeadTimes(prev=>({...prev,...allLeadTimes}));
```

**Before (line 47966, error/partial path):**
```js
setItemLeadTimes(allLeadTimes);
```

**After:**
```js
setItemLeadTimes(prev=>({...prev,...allLeadTimes}));
```

### Why both merges are critical

`allPrices` and `allLeadTimes` only contain entries for rows AI successfully matched
(line 47928–47930: entries set only when `idx >= 0`). Unmatched rows have no key in
either object. Without merge, pre-filled reference values for unmatched rows are wiped.

The merge flow (prices — same pattern applies to LTs):
1. Load: `unitPrices = {0: "15.50", 1: "8.75", 2: "22.00"}` (from referencePrice)
2. Upload PDF → AI extracts → `allPrices = {0: "16.00", 2: "23.50"}` (matched 2 of 3)
3. Merge: `{0: "15.50", 1: "8.75", 2: "22.00", ...{0: "16.00", 2: "23.50"}}`
   → `{0: "16.00", 1: "8.75", 2: "23.50"}` — AI wins where it matched, reference
   preserved where it didn't.

### Re-process durability

**Normal mode "Start Over"** (line 48441): `setUnitPrices({}); setItemLeadTimes({})` —
full reset clears all pre-fills. Subsequent `processFile` merges with empty state →
`{...{}, ...allPrices}` = `allPrices`. No stale pre-fills survive. **Clean.**

**leadTimeOnly "Prices not accurate?"** (line 48162): `setPhase('upload')` WITHOUT
clearing state. Subsequent `processFile` merges with existing pre-fills → reference
preserved for unmatched rows. **Correct** — better than blank for read-only prices.

In normal mode, `processFile` is ONLY reachable via "Start Over" → upload. The drag-drop
UI (line 48520–48533) is rendered only when `phase !== 'analyzing'` and `phase !== 'review'`
(the render function returns early at lines 48123/48141 for those phases). No re-process
without reset is possible in normal mode.

---

## §6 — Part B+C: Email rendering

**Location:** `src/app.jsx` lines 6502–6511, the normal-mode row template inside
`buildRfqEmailHtml`.

**Before (price + LT cells):**
```js
<td style="padding:6px 10px;border-bottom:1px dotted #94a3b8;text-align:right">&nbsp;</td>
<td style="padding:6px 10px;border-bottom:1px dotted #94a3b8;text-align:center">&nbsp;</td>
```

**After:**
```js
<td style="padding:6px 10px;border-bottom:1px dotted #94a3b8;text-align:right;color:#64748b;font-style:italic">${_hasPrice(item)?_esc(refP):"&nbsp;"}</td>
<td style="padding:6px 10px;border-bottom:1px dotted #94a3b8;text-align:center;color:#64748b;font-style:italic">${_hasFirmLeadTime(item)?item.leadTimeDays+"d":"&nbsp;"}</td>
```

**What changes:**
- Price cell: shows reference price in italic gray when `_hasPrice(item)`, blank otherwise
- LT cell: shows firm lead time in italic gray when `_hasFirmLeadTime(item)`, blank
  for AI/absent
- Styling matches the leadTimeOnly price cell (italic, `#64748b` — subdued reference)

**Code access:** `refP` already computed at line 6489. `_hasPrice` (§1) and
`_hasFirmLeadTime` (line 15746) are both hoisted function declarations, available here.

**leadTimeOnly rows UNCHANGED.** Lines 6490–6500 keep their existing template. The
leadTimeOnly mode has its own distinct styling (yellow LT bg, explicit banner).

---

## §7 — Part B+C: PDF rendering

**Location:** `src/app.jsx` lines 8216–8217, inside `buildRfqPdfDoc`.

**Before:**
```js
const refP=(leadTimeOnly&&item.unitPrice!=null)?`$${Number(item.unitPrice).toFixed(2)}`:"";
return [i+1,item.partNumber||"—",item.description||"—",item.manufacturer||"—",item.qty||1,refP,""];
```

**After:**
```js
const refP=_hasPrice(item)?`$${Number(item.unitPrice).toFixed(2)}`:"";
const refLT=_hasFirmLeadTime(item)?`${item.leadTimeDays}d`:"";
return [i+1,item.partNumber||"—",item.description||"—",item.manufacturer||"—",item.qty||1,refP,refLT];
```

**What changes:**
- `refP` no longer gated by `leadTimeOnly` — shows in ALL modes when `_hasPrice(item)`
- `refLT` added — shows firm lead time in ALL modes when `_hasFirmLeadTime(item)`
- Last column changes from `""` to `refLT`

---

## §8 — Separation guarantee + alignment

### Auto-set vs eligibility (the bug's root cause)

| Question | Predicate | Used by | Cooldown-affected? |
|----------|-----------|---------|-------------------|
| "Does this row have a price?" | `_hasPrice(r)` | Auto-set (§2) | **NO** — reads `unitPrice` directly |
| "Why is this row RFQ-eligible?" | `_eligibilityReason(r)` | Counters + display | YES — cooldown masks price checks |

The old code used eligibility-derived counters (`itemsMissingPrice === 0`) as a proxy
for "all items have prices." Cooldown broke this proxy: a cooldown row with no price
gets classified as `"missingLeadTime"` (not `"missingPrice"`), so the counter reads zero
even though prices are missing.

The fix decouples: auto-set calls `_hasPrice` directly — no counters, no cooldown, no
classification logic. The counters remain for UI display.

### #175 interaction (confirmed: no fight)

| Predicate | Purpose | Scope |
|-----------|---------|-------|
| `_hasFirmLeadTime(r)` (#175) | Row has reliable lead time | Row-color (ARC UI) + RFQ eligibility + pre-fill gate (§4/§6/§7) |
| `_hasPrice(r)` (#178) | Row has meaningful price | Auto-set (§2) + payload gate (§3) + email/PDF (§6/§7) |
| `_eligibilityReason(r)` | Why row is RFQ-eligible | Counter increments + display |

`_hasFirmLeadTime` and `_hasPrice` are independent BOM-row predicates — LT presence
and price presence are orthogonal. They don't interact. The row-color system (#175) uses
`_hasFirmLeadTime` only; the auto-set uses `_hasPrice` only. No fight.

### Cross-boundary alignment (#178 ↔ #179)

| Side | Predicate | Data shape | Answers |
|------|-----------|-----------|---------|
| ARC (BOM row) | `_hasPrice(r)` | numeric `unitPrice` | "Row has a price" |
| Portal (form input) | `_isValidPrice(x)` (#179) | string/number input | "Field has a price" |

Linked through `referencePrice` data flow:
1. ARC: `_hasPrice(row)` → true → `referencePrice = +row.unitPrice` → Firestore
2. Portal load: `referencePrice` → pre-fills `unitPrices[i]` (formatted string)
3. Portal: `_isValidPrice(unitPrices[i])` → true (non-empty, non-undefined)

If `_hasPrice` evolves (adds a source check, raises minimum), the stored data changes
and `_isValidPrice` automatically reflects it. Same notion, one definition per side,
data flow prevents drift.

---

## §9 — Regression surface

### ARC-side changes

| Component | Lines | Change |
|-----------|-------|--------|
| `_hasPrice` helper | ~15748 (new) | §1: 1 line |
| `buildRfqSupplierGroups` auto-set | 6380 | §2: condition replaced |
| Firestore lineItems payload | 19193–19196 | §3: `if(ltOnly)` guard removed |
| `buildRfqEmailHtml` normal-mode row | 6509–6510 | §6: reference data shown |
| `buildRfqPdfDoc` row | 8216–8217 | §7: reference data shown |
| Counters (6372–6374) | — | UNCHANGED |
| `_eligibilityReason` (6314–6338) | — | UNCHANGED |
| `leadTimeOnly` state init (19104) | — | UNCHANGED |
| leadTimeOnly email row (6490–6500) | — | UNCHANGED |

### Portal-side changes

| Component | Lines | Change |
|-----------|-------|--------|
| Load useEffect pre-fill | 47863–47872 | §4: all-mode price + firm LT |
| `processFile` price state | 47936, 47964 | §5a: merge replaces full set |
| `processFile` LT state | 47938, 47966 | §5b: merge replaces full set |
| Review table rendering | — | UNCHANGED (existing editable inputs) |
| `handleSubmit` validation | — | UNCHANGED (#179 handles) |
| `_isValidPrice` / `_isValidLT` | — | UNCHANGED |
| "Start Over" button | — | UNCHANGED (full reset) |

### ARC-side consumers (read portal submissions)

| Consumer | Impact |
|----------|--------|
| Apply Prices handler | NONE — reads submitted `lineItems`, format unchanged |
| PortalSubmissionsModal | NONE — displays submitted data |
| RFQ history | NONE |
| `onSupplierQuoteSubmitted` Cloud Function | NONE — fires on status change |

### Interaction with #179

#179 added per-line completeness validation (price + LT) and visual indicators. #178
pre-fills reference data into the same fields #179 validates. The interaction is CLEAN:
- Pre-filled prices → `_isValidPrice` returns true → no false submit-block
- Pre-filled firm LTs → `_isValidLT` returns true → no false submit-block
- Rows with no reference data stay blank → red indicators + submit block apply correctly

**Recommended ship order:** #179 first (already approved, smaller), then #178. No
coordination needed — each works independently.

### Net regression risk

**ZERO behavioral regression.** Observable changes:
1. Auto-checkbox no longer fires on cooldown-masked priceless groups (Part A — bug fix)
2. Reference prices appear in email/PDF/portal for all modes (Part B — gap fill)
3. Firm lead times pre-fill in portal and appear in email/PDF (Part C — gap fill)
4. AI extraction preserves pre-filled reference prices for unmatched rows (§5 — merge)

No submitted-data payload shape changes. No Firestore schema changes. No ARC-side
consumer changes.

---

## Test criteria

| # | Test | Method | Expected |
|---|------|--------|----------|
| T1 | Auto-set OFF: cooldown-masked group | Vendor group, all items in cooldown, some with unitPrice=0, no firm LTs. Check `defaultLeadTimeOnly`. | `false` — checkbox unchecked |
| T2 | Auto-set ON: all priced + missing LTs | Vendor group, all items have unitPrice>0, none have firm LT. No cooldown. | `true` — checkbox checked |
| T3 | Auto-set ON: cooldown + real prices | All items in cooldown with unitPrice>0, none have firm LT. | `true` — cooldown irrelevant when prices present |
| T4 | referencePrice in normal payload | Send RFQ in normal mode. Inspect Firestore `rfqUploads/{token}`.lineItems. | Items with prices have `referencePrice`; items with unitPrice=0 have `referencePrice: null` |
| T5 | referencePriceSource accurate | Same as T4. Check `referencePriceSource`. | Matches `priceSource` (e.g., "bc", "supplier"), NOT hardcoded "bc" |
| T6 | Portal pre-fills price (normal mode) | Open normal-mode portal link. Upload PDF, reach review. | Unmatched rows show pre-filled reference price in editable input |
| T7 | Portal pre-fills firm LT | Open portal link. Check LT inputs in review table. | Rows with firm LT sources show pre-filled value (editable) |
| T8 | Portal does NOT pre-fill AI/absent LT | Same as T7. | Rows with `referenceLeadTimeSource === "ai"` or absent: blank LT input |
| T9 | AI extraction merges with pre-fill | Upload PDF. AI matches some rows. | Matched: AI price. Unmatched: reference price preserved |
| T10 | Start Over clears pre-fill | Click "Start Over" after seeing pre-filled values. | All prices and LTs cleared, returns to upload phase |
| T11 | Email reference price (normal mode) | Send normal-mode RFQ for vendor with known prices. | Email table shows prices italic gray where present, blank where absent |
| T12 | Email firm LT (normal mode) | Same as T11 for vendor with firm LTs. | Email shows "XXd" italic gray for firm LTs, blank for AI/absent |
| T13 | PDF reference data | Open PDF attachment from normal-mode RFQ. | Price and LT columns populated where applicable |
| T14 | leadTimeOnly mode unchanged | Send RFQ with lead-time-only checked. Open portal. | Prices read-only, skip upload phase, existing behavior preserved |
| T15 | Counters unchanged | Open RFQ modal, check per-vendor breakdown display. | `itemsMissingPrice`, `itemsStalePrice`, `itemsMissingLeadTime` unchanged |
| T16 | Start Over + re-upload clears pre-fills | Pre-fills shown → click Start Over → re-upload different PDF. | AI-extracted values only; no stale reference pre-fills from first load |

---

## Implementation sequence

1. Marc applies §1–§7 in a single commit (all changes in `src/app.jsx`).
2. Deploy via `deploy.sh`.
3. Marc + Jon test T1–T16 against deployed build.
4. Coach verifies committed diff matches plan.

**Total: ~34 lines changed in `src/app.jsx`. One commit. One deploy.**

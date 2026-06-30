# #179 Detailed Plan — Supplier Portal Submit Validation (A/B/C)

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** READY FOR APPROVAL
**Builds on:** C122 scope trace (`docs/179-SUPPLEMENT.md`)
**Tip:** master `b682243c`

---

## Overview

Three changes to the supplier portal review page in `src/app.jsx`. One gate deletion
(A), one validation addition (B), one visual indicator addition (C). All within the
`SupplierPortal` component. ~20 lines total.

**THE GUARANTEE:** The submit-block condition (Part B) and the red-indicator condition
(Part C) for missing lead time are driven by the SAME predicate — `hasLeadTime`. They
can never disagree. If the submit blocks on it, the row shows it.

---

## §1 — Shared predicate: `hasLeadTime`

**Location:** `src/app.jsx` line 48281, inside the per-row `lineItems.map` callback.

**Before (line 48281):**
```js
const hasPrice=!cant&&unitPrices[i]!==undefined&&unitPrices[i]!=='';
```

**After (add one line immediately below):**
```js
const hasPrice=!cant&&unitPrices[i]!==undefined&&unitPrices[i]!=='';
const hasLeadTime=!cant&&itemLeadTimes[i]!=null&&String(itemLeadTimes[i]).trim()!==''&&(+itemLeadTimes[i]>0);
```

`hasLeadTime` answers: "does this row have a valid lead time right now?" It is `true`
when the per-line `itemLeadTimes[i]` is defined, non-empty, and positive. It is `false`
when the field is blank, zero, or the row is marked Cannot Supply.

This is the SINGLE DEFINITION used by both the visual indicator (§3) and the submit
block (§4). The submit block uses `_itemLeadTimesEffective[i]` (post-auto-propagation),
which is synced to `itemLeadTimes` state via `setItemLeadTimes(filled)` at line 48000
before validation runs — so after a submit attempt, the visual always reflects the
post-propagation state.

---

## §2 — Part A: Delete global LT hard gate + mandatory styling

Three changes. All remove the "global lead time is required" behavior.

### §2a — Delete hard gate

**Location:** `src/app.jsx` lines 48015–48016, inside `handleSubmit`.

**Before:**
```js
}else{
  if(!leadTime.trim()){arcAlert("Please enter the lead time in days ARO for this order before submitting.");return;}
}
```

**After:**
```js
}else{
  // Per-line completeness validation — see §4 below
}
```

The `else` body is replaced by §4's per-line check. The leadTimeOnly branch (lines
48004–48014) is UNCHANGED — it correctly validates LT-only in that mode.

### §2b — Remove red border on global input

**Location:** `src/app.jsx` line 48238.

**Before:**
```js
style={{width:90,...inp,border:`1px solid ${(!info?.leadTimeOnly&&!leadTime.trim())?"#fca5a5":"#d97706"}`,background:"#fff"}}
```

**After:**
```js
style={{width:90,...inp,border:"1px solid #d97706",background:"#fff"}}
```

The global input always gets the neutral amber border. It is no longer mandatory.

### §2c — Remove red asterisk

**Location:** `src/app.jsx` line 48239.

**Before:**
```js
<span style={{fontSize:13,color:"#92400e",fontWeight:600,whiteSpace:"nowrap"}}>days ARO {!info?.leadTimeOnly&&<span style={{color:"#dc2626"}}>*</span>}</span>
```

**After:**
```js
<span style={{fontSize:13,color:"#92400e",fontWeight:600,whiteSpace:"nowrap"}}>days ARO</span>
```

The asterisk signaled "required." The field is no longer required.

### Auto-propagation preserved

Lines 47990–48001 (submit-time propagation) and lines 48221–48235 (onChange
propagation) are NOT touched. The "Fill all Lead Times at once" feature continues to
work exactly as before — it fills blank per-line fields. It's just no longer a
mandatory gate.

---

## §3 — Part C: Visual indicator for missing lead time

### §3a — Red styling on LT input

**Location:** `src/app.jsx` line 48385–48391, the per-line lead time `<input>`.

**Before:**
```js
<input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="days"
  value={itemLeadTimes[i]??''}
  onChange={e=>{const v=e.target.value;if(v!==''&&!/^\d*$/.test(v))return;setItemLeadTimes(prev=>({...prev,[i]:v}));}}
  onFocus={e=>e.target.select()}
  onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}}
  style={{width:80,textAlign:"center",...inp}}
/>
```

**After:**
```js
<input type="text" inputMode="numeric" pattern="[0-9]*" placeholder="days"
  value={itemLeadTimes[i]??''}
  onChange={e=>{const v=e.target.value;if(v!==''&&!/^\d*$/.test(v))return;setItemLeadTimes(prev=>({...prev,[i]:v}));}}
  onFocus={e=>e.target.select()}
  onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}}
  style={{width:80,textAlign:"center",...inp,border:`1px solid ${hasLeadTime?"#e2e8f0":"#fca5a5"}`,background:hasLeadTime?"#fff":"#fff5f5"}}
/>
```

Mirrors the price input's red treatment:
- Has LT → neutral border (`#e2e8f0`) + white background
- Missing LT → red border (`#fca5a5`) + light red background (`#fff5f5`)

Uses the `hasLeadTime` predicate from §1 — same check that the submit block uses.

### §3b — ⚠ indicator for missing LT (optional, Marc's call)

The price column shows `⚠ Missing` when the field is empty (line 48357). For the LT
column, the cell is narrower (80px input in a centered cell). A `⚠` symbol or similar
can be placed below or beside the input if space allows:

```js
{!hasLeadTime&&<div style={{fontSize:10,color:"#dc2626",fontWeight:600,marginTop:2}}>⚠</div>}
```

This is OPTIONAL — the red border + background already provides the visual signal that
matches the submit block. The price column's `⚠ Missing` label lives inside a wider
flex container with room for badges; the LT cell is tighter. Marc decides whether the
`⚠` fits without breaking the cell layout. The guarantee holds either way — it's the
red styling, not the label, that signals the missing state.

---

## §4 — Part B: Per-line completeness block

**Location:** `src/app.jsx` lines 48015–48016, replacing the deleted global gate from §2a.

**Code:**
```js
}else{
  const _lineItems=info?.lineItems||[];
  let hasIncomplete=false;
  _lineItems.forEach((_,i)=>{
    if(cannotSupply[i]===true)return;
    const _hp=unitPrices[i]!==undefined&&unitPrices[i]!=='';
    const _lt=_itemLeadTimesEffective[i];
    const _hl=_lt!=null&&String(_lt).trim()!==''&&(+_lt>0);
    if(!_hp||!_hl)hasIncomplete=true;
  });
  if(hasIncomplete){arcAlert("There are rows with missing price or lead time. Please complete them before submitting.");return;}
}
```

**Predicate match:** The price check (`_hp`) mirrors `hasPrice` (§1, line 48281):
`unitPrices[i]!==undefined&&unitPrices[i]!==''`. The LT check (`_hl`) mirrors
`hasLeadTime` (§1): `_lt!=null&&String(_lt).trim()!==''&&(+_lt>0)`. The only
difference: the submit block evaluates against `_itemLeadTimesEffective[i]`
(post-propagation) while the visual indicator evaluates against `itemLeadTimes[i]`
(React state). These are synced by `setItemLeadTimes(filled)` at line 48000
before this validation runs.

**Message:** Generic, no row enumeration. After dismissing the alert, the supplier
returns to the review table where red borders (price + LT) guide them to the
incomplete rows.

**leadTimeOnly branch unchanged.** Lines 48004–48014 continue to validate LT-only
(prices are read-only in that mode). No price check needed there.

---

## §5 — Shared predicate guarantee

| Check | Expression | Source variable |
|-------|-----------|----------------|
| Visual indicator (§1/§3) | `itemLeadTimes[i]!=null && String(...).trim()!=='' && (+...>0)` | `itemLeadTimes[i]` (React state) |
| Submit block (§4) | `_lt!=null && String(_lt).trim()!=='' && (+_lt>0)` | `_itemLeadTimesEffective[i]` (post-propagation) |

The expressions are identical. The source variables converge before the supplier sees
the visual indicator post-submit:

1. Supplier clicks Submit
2. Auto-propagation fires (47990–48001), `setItemLeadTimes(filled)` queues re-render
3. Submit validation (§4) fires, finds incomplete rows
4. `arcAlert` fires, blocks async
5. React re-renders with updated `itemLeadTimes` state → visual indicators update
6. Supplier dismisses alert → sees updated red indicators matching the block

**Direction:** visual ⊆ submit block. Every row the submit blocks on WILL show red.
A row might briefly show red before being auto-filled by propagation — this is correct
(the field IS empty until propagation fires). After propagation, both the visual and
the submit agree.

---

## §6 — Regression surface

### Direct consumers

| Component | Lines | Impact |
|-----------|-------|--------|
| `handleSubmit` validation | 48004–48017 | §2a: gate deleted. §4: per-line check added. |
| `handleSubmit` auto-propagation | 47990–48001 | NONE — unchanged |
| `handleSubmit` long-lead check | 48018–48027 | NONE — fires after new validation |
| `handleSubmit` payload build | 48039–48057 | NONE — reads state, unaffected |
| Global LT input styling | 48238–48239 | §2b/§2c: remove mandatory indicators |
| Per-row LT input styling | 48385–48391 | §3a: add conditional red styling |
| Per-row rendering scope | 48281 | §1: add `hasLeadTime` computed value |
| leadTimeOnly validation | 48004–48014 | NONE — separate branch, unchanged |
| leadTimeOnly portal load | 47857–47866 | NONE — pre-fill logic untouched |
| Firestore write | 48065–48067 | NONE — writes submitted data |

### ARC-side consumers

| Component | Impact |
|-----------|--------|
| Apply Prices handler | NONE — reads submitted `lineItems`, no format change |
| PortalSubmissionsModal | NONE — displays submitted data |
| RFQ history | NONE |
| `onSupplierQuoteSubmitted` Cloud Function | NONE — fires on status change |

### Interaction with #178

If #178 Part C (lead-time pre-fill) ships first, some portal rows will arrive with
pre-filled LT values from `referenceLeadTimeDays`. Those rows will have `hasLeadTime =
true` immediately → no red indicator, no submit block. Rows without firm LT stay blank
→ red indicator + submit block. This is correct and requires no coordination — #179
validates whatever is in the field, regardless of how it got there.

### Net regression risk

**ZERO behavioral regression.** The only observable changes:
1. Suppliers can submit when all per-line LTs are filled without touching the global
   field (Part A — removes false rejection)
2. Suppliers CANNOT submit with blank prices or blank lead times (Part B — adds
   missing validation)
3. Blank lead-time cells render with red border + light red background (Part C — new
   visual indicator)

No payload shape changes. No Firestore schema changes. No ARC-side consumer changes.

---

## Test criteria

| # | Test | Method | Expected |
|---|------|--------|----------|
| T1 | Global LT not required | Fill all per-line LTs manually, leave global empty. Click Submit. | Submit proceeds (no alert) |
| T2 | Global auto-fill still works | Type "14" in global field. All blank per-line fields fill. | Per-line fields show "14" |
| T3 | Submit blocked on missing price | Leave one row's price blank, all LTs filled. Click Submit. | arcAlert fires, submit blocked |
| T4 | Submit blocked on missing LT | Fill all prices, leave one row's LT blank. Click Submit. | arcAlert fires, submit blocked |
| T5 | Submit blocked on both missing | One row missing price, another missing LT. Click Submit. | arcAlert fires, submit blocked |
| T6 | Cannot Supply rows excluded | Mark one row Cannot Supply, leave its price+LT blank. Fill all others. Click Submit. | Submit proceeds |
| T7 | All complete → submit proceeds | Fill every non-CS row with price + LT. Click Submit. | Submit proceeds, no alert |
| T8 | Red border on missing LT | Row with blank LT field (not Cannot Supply). | Red border (`#fca5a5`) + light red bg (`#fff5f5`) |
| T9 | Red clears when LT entered | Type a value in blank LT field. | Border returns to neutral, bg returns to white |
| T10 | Red clears on global fill | Type in global "Fill all" field. Blank per-line LT fields fill. | Red indicators clear on filled rows |
| T11 | leadTimeOnly mode unchanged | Open a leadTimeOnly portal link. Leave one LT blank. Submit. | Existing arcAlert fires (with row enumeration), unchanged |
| T12 | Global field no longer red | In normal mode, global "Fill all" field is empty. | Amber border (`#d97706`), no red asterisk |
| T13 | Long-lead check still fires | Fill all prices + LTs, one LT > 60 days. Submit. | Long-lead confirmation modal appears |

---

## Implementation sequence

1. Marc applies §1 (hasLeadTime), §2 (gate + styling deletion), §3 (LT red indicator),
   §4 (per-line block) in a single commit.
2. Deploy via `deploy.sh`.
3. Marc + Jon test T1–T13 against deployed build.
4. Coach verifies committed diff matches plan.

**Total: ~20 lines changed in `src/app.jsx`. One commit. One deploy.**

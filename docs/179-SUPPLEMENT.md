# #179 Supplement — Supplier Portal Submit Validation (A/B)

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** SCOPE COMPLETE — feeds Detailed Plan
**Tip:** master `630300f8`
**Scope:** Trace + scope only. NO implementation.
**Independent of:** #178 (RFQ pre-fill cluster, outbound ARC-side). This is INBOUND portal.

---

## Overview

Two changes to the supplier portal submit handler (`handleSubmit`, line 47978 in
`src/app.jsx`). Part A removes a spurious global lead-time gate. Part B adds per-line
completeness validation. Small fix — ~15 lines.

**Context (from analyst):** The portal's "Fill all Lead Times at once" input auto-
propagates to every per-line field on blur AND at submit time (lines 47990–48001).
By submit time, there are no global-vs-per-line edge cases — populated lines are just
filled. The validator only sees filled-or-not. No "covered by global" special logic
needed.

---

## Part A — Remove Spurious Global Lead Time Requirement

### Current gate

**Location:** `src/app.jsx` line 48015–48016, inside `handleSubmit`:

```js
}else{
  if(!leadTime.trim()){arcAlert("Please enter the lead time in days ARO for this order before submitting.");return;}
}
```

This is the ELSE branch of the `if(info?.leadTimeOnly)` check (lines 48004–48017).
In normal (non-leadTimeOnly) mode, the global `leadTime` state (the "Fill all Lead
Times at once" input, declared at line 47822) MUST be non-empty. Even if every per-line
`itemLeadTimes[i]` is filled individually, submit is blocked if the global field is empty.

### Why it's wrong

The auto-propagation at lines 47990–48001 fills blank per-line entries from the global
field. But if the supplier fills every line manually (or via AI extraction), the global
field stays empty and submit is blocked. The global field is a convenience — not an
authoritative data source. The actual lead times are on the per-line entries.

### Auto-propagation preserved

Lines 47990–48001 (the "Fill all → per-line" propagation) are NOT removed. They remain
useful: supplier types a global value, it fills blanks, submit proceeds. The only
change is removing the hard gate on `!leadTime.trim()`.

### Fix

Delete lines 48015–48016. Replace with per-line validation (Part B below). The
`leadTimeOnly` branch (lines 48004–48014) already does per-line validation correctly —
the normal-mode branch needs the same treatment, plus price validation.

---

## Part B — Submit-Time Completeness Block

### Current validation summary

| Mode | Price validation | Lead time validation |
|------|-----------------|---------------------|
| leadTimeOnly | None (prices read-only, pre-filled from BC) | Per-line: each non-cannotSupply must have LT |
| Normal | **None** | Global field required (Part A bug) |

No price validation exists in ANY mode. In normal mode, a supplier can submit with
entirely blank prices.

### Required validation (from Jon)

Every non-cannotSupply line must have BOTH:
1. A unit price (`unitPrices[i]` is defined, non-empty, and parses to a number > 0)
2. A lead time (`_itemLeadTimesEffective[i]` is defined, non-empty, and parses to a
   number > 0)

If any line fails either check, show a blocking `arcAlert`:

> "There are rows with missing price or lead time. Please complete them before
> submitting."

Do NOT enumerate specific rows — missing rows already render red (price input gets
`border: 1px solid #fca5a5` + `background: #fff5f5` + `⚠ Missing` label at line 48357
when `hasPrice` is false). After dismissing the alert, the supplier returns to the
review table where red indicators guide them.

### Pattern to follow

The `leadTimeOnly` branch (lines 48004–48014) is the template:

```js
if(info?.leadTimeOnly){
  const lineItems=info?.lineItems||[];
  const missing=[];
  lineItems.forEach((item,i)=>{
    if(cannotSupply[i]===true)return;
    const v=_itemLeadTimesEffective[i];
    if(v===undefined||v===null||String(v).trim()===""||!(+v>0)){
      missing.push(...);
    }
  });
  if(missing.length){arcAlert("...");return;}
}
```

Part B extends this to normal mode and adds price checking. The `leadTimeOnly` branch
itself can be left as-is (price is read-only in that mode, so only LT needs checking)
or unified — architect's call at Detailed Plan time.

### Visual gap (noted, not in scope)

Missing prices have red visual indicators (border, background, `⚠ Missing`). Missing
lead times have NO visual indicator — the LT input always renders the same regardless
of content. After #179, the submit block will tell the supplier "rows have missing
price or lead time" but the supplier can only SEE which rows are missing price. Missing
LT rows look normal. This is a follow-up cosmetic item, not a #179 blocker — the
validation itself is correct and the supplier can scroll through to find blank LT cells.

---

## Touch Points

| # | Location | Lines | Change |
|---|----------|-------|--------|
| 1 | `handleSubmit` normal-mode gate | 48015–48016 | DELETE global LT requirement |
| 2 | `handleSubmit` normal-mode validation | 48015–48016 (replacement) | ADD per-line price + LT check with arcAlert |

**Total: 2 code sites, ~15 lines, all within `handleSubmit`.**

No changes to:
- Auto-propagation logic (47990–48001) — stays as-is
- leadTimeOnly validation (48004–48014) — stays as-is (only LT needed; prices read-only)
- Long lead time confirmation (48018–48027) — stays as-is
- Portal submit payload construction (48039–48057) — stays as-is
- Portal review table rendering — stays as-is
- ARC-side RFQ send path — unrelated (outbound, not inbound)

---

## Regression Surface

| Consumer | Lines | Impact |
|----------|-------|--------|
| `handleSubmit` validation | 48004–48017 | MODIFIED — Part A + Part B |
| Auto-propagation | 47990–48001 | NONE — unchanged |
| Long lead check | 48018–48027 | NONE — fires after new validation |
| Payload build (`pricedItems`) | 48039–48057 | NONE — consumes state, unaffected |
| Firestore `rfqUploads/{token}` update | 48065–48067 | NONE — writes submitted data |
| ARC-side Apply Prices | ~31350+ | NONE — reads submitted data |
| ARC-side notification | Cloud Function | NONE — fires on status change |
| leadTimeOnly portal flow | 48004–48014, 47857–47866 | NONE — separate branch |

**Net regression risk: ZERO.** Both changes are within the validation section of
`handleSubmit`. No payload shape changes, no Firestore schema changes, no ARC-side
consumer changes. The only behavioral change: suppliers who previously could submit
with blank prices or per-line-filled-but-global-empty lead times will now be blocked
until all lines are complete.

---

## Scope summary

| Part | Type | Current | After fix |
|------|------|---------|-----------|
| A | BUG | Global LT required even when all lines filled | Global LT gate removed |
| B | GAP | No price validation, no per-line LT validation in normal mode | Per-line price + LT required |

**Estimated: ~15 lines. Contained within `handleSubmit`. One code site.**

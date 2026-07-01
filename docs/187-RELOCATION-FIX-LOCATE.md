# #187 Relocation Fix — Read-Only Locate

**Author:** Sam Wize (Coach)
**Date:** 2026-07-01
**Type:** Read-only locate (no code changes)
**Tip:** master `2bdf223d` (v1.21.14 code)
**Bug:** Valid-until row emits its own "BUDGETARY - " prefix → doubles the word. Separate `arcDocCheckBreak` orphans it to the next PDF page.

---

## 1. PDF (buildQuotePdfDoc)

### Existing BUDGETARY element — lines 7446-7449

```js
if(isBudg){
    doc.setFontSize(11);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.red);
    doc.text("BUDGETARY",bx+bw/2,ctx.y,{align:"center"});ctx.y+=6;
}
```

- `bx = ARC_DOC.W - ARC_DOC.margin.right - 60` = `215.9 - 15 - 60` = **140.9**
- `bw = 60`
- Center point: `bx + bw/2` = **170.9** (center of the totals number box, right-aligned)
- Font: helvetica bold 11pt, red
- After rendering, `ctx.y += 6`

### Broken valid-until row — lines 7454-7457

```js
arcDocCheckBreak(ctx,8);  // ← ORPHAN TRIGGER
doc.setFontSize(9);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.red);
doc.text((isBudg?"BUDGETARY - ":"")+"Prices Valid Until "+new Date(...).toLocaleDateString(...),
    ARC_DOC.W/2,ctx.y,{align:"center"});  // ← DOUBLING BUG: emits "BUDGETARY - " prefix
ctx.y+=6;
```

Two bugs in this block:
1. **Doubling:** `(isBudg?"BUDGETARY - ":"")` emits a second "BUDGETARY" — the word already appeared from lines 7446-7449.
2. **Orphan:** `arcDocCheckBreak(ctx,8)` at line 7454 is a **separate** page-break check from the totals block's reservation at line 7422. If the totals box lands near the page bottom, this check pushes the valid-until row to a new page while the totals + BUDGETARY stay on the prior page.

### Orphan mechanics

The totals block pre-reserves space at line 7422:

```js
arcDocCheckBreak(ctx,25+_extraRows*7);
```

This reserves `25 + (eco_rows * 7)` units — enough for the totals table only. It does NOT account for:
- The BUDGETARY line (+6 when `isBudg`)
- The valid-until row (+8 via its own break check)

So the sequence is:
1. Line 7422: reserve ~25pt for totals → fits on this page
2. Lines 7432-7443: render totals rows
3. Line 7444: `ctx.y += totalsRows.length * 7 + 3` (advances past totals)
4. Lines 7446-7449: render "BUDGETARY" + advance 6 (still fits)
5. **Line 7454: `arcDocCheckBreak(ctx,8)` — not enough room → NEW PAGE → orphan**

`arcDocCheckBreak` (line 6634): `if(ctx.y + height > ctx.contentBottom) { arcDocNewPage(ctx); }`

Page dimensions: W=215.9, H=279.4, bottom margin=20, so `contentBottom` ≈ 259.4.

### Fix approach for PDF

**Compose one centered string, remove the separate break check.**

Replace the existing BUDGETARY block (7446-7449) and the valid-until block (7451-7457) with a single block:

```js
// Combined BUDGETARY + Prices Valid Until — one centered line, no separate break check
doc.setFontSize(isBudg?11:9);
doc.setFont("helvetica",isBudg?"bold":"normal");
doc.setTextColor(...ARC_DOC.colors.red);
const _vuDate=new Date(project.quoteExpiresAt||Date.now()+resolveQuoteValidityDays(project,_customerValidityDays)*86400000)
    .toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
doc.text((isBudg?"BUDGETARY - ":"")+"Prices Valid Until "+_vuDate,bx+bw/2,ctx.y,{align:"center"});
ctx.y+=6;
```

Key details:
- **Centering at `bx+bw/2` (170.9)** — matches the totals box center. jsPDF `align:"center"` will extend the text equally left and right of this point. The longest string ("BUDGETARY - Prices Valid Until September 30, 2026") at fontSize 11 is ~120pt wide, so it extends from ~111 to ~231 — within the page margins (15 left, 200.9 right).
- **No separate `arcDocCheckBreak`** — the totals block reservation at line 7422 must be increased by 8 (or 6) to include this row: change `25+_extraRows*7` to `31+_extraRows*7`.
- **isBudg font size stays 11** so the "BUDGETARY" word matches the original weight/size.
- **Non-budgetary font size drops to 9** — just "Prices Valid Until <date>", lighter weight.

**Lines to REMOVE:** 7446-7449 (existing separate BUDGETARY block) + 7451-7457 (broken valid-until block). Replaced by the combined block above.

**Line to EDIT:** 7422 — increase pre-reservation from `25+_extraRows*7` to `31+_extraRows*7`.

---

## 2. ON-SCREEN (QuoteTab)

### Existing BUDGETARY element — line 20837

```jsx
{isProjectBudgetary&&<div style={{textAlign:"center",padding:"6px 0",fontSize:14,fontWeight:800,
    color:"#dc2626",letterSpacing:2,textTransform:"uppercase"}}>BUDGETARY</div>}
```

- Renders only when `isProjectBudgetary` is true
- Inside `qd-totals-box`, directly after the Total row (line 20836)
- Styled: centered, red (#dc2626), 14px, bold 800, uppercase, letter-spacing 2

### Broken valid-until row — lines 20838-20841

```jsx
{/* #187 relocation — combined valid-until row ... */}
<div style={{textAlign:"center",padding:"4px 0",fontSize:11,fontWeight:600,color:"#dc2626"}}>
  {isProjectBudgetary?"BUDGETARY - ":""}Prices Valid Until {defaultValidUntil}
</div>
```

- **Always renders** (no conditional) — positioned after the BUDGETARY element
- **Doubling bug:** emits `"BUDGETARY - "` when `isProjectBudgetary`, duplicating the word from line 20837

### `defaultValidUntil` — line 20244

```js
const defaultValidUntil=new Date(project.quoteExpiresAt||Date.now()+
    resolveQuoteValidityDays(project||{},_customerValidityDays)*86400000)
    .toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
```

Already computed, available to the template. No change needed.

### Fix approach for on-screen

**Merge valid-until text INTO the BUDGETARY element when budgetary; render a standalone valid-until element when not.**

Replace lines 20837-20841 with:

```jsx
{isProjectBudgetary ? (
  <div style={{textAlign:"center",padding:"6px 0",fontSize:14,fontWeight:800,
      color:"#dc2626",letterSpacing:2,textTransform:"uppercase"}}>
    BUDGETARY<span style={{letterSpacing:0,textTransform:"none",fontWeight:600,fontSize:11}}>
      {" - Prices Valid Until "}{defaultValidUntil}</span>
  </div>
) : (
  <div style={{textAlign:"center",padding:"4px 0",fontSize:11,fontWeight:600,color:"#dc2626"}}>
    Prices Valid Until {defaultValidUntil}
  </div>
)}
```

This keeps `isProjectBudgetary` as the sole gate for the word "BUDGETARY". The valid-until text sits to the right of "BUDGETARY" in the same `<div>`, same line. When not budgetary, it's a standalone centered row. The `<span>` inside the budgetary div resets `letterSpacing`, `textTransform`, `fontWeight`, and `fontSize` so "Prices Valid Until <date>" renders at the lighter style while "BUDGETARY" keeps its heavy uppercase look.

**Lines to REMOVE:** 20838-20841 (the separate valid-until div + its comment).

**Line to REPLACE:** 20837 (the existing BUDGETARY-only div) → the conditional block above.

**Note on "don't touch the existing BUDGETARY element":** The `isProjectBudgetary` condition and the "BUDGETARY" text+styling are preserved exactly. The only change is appending the valid-until span inside the same element when budgetary. The show/hide condition is unchanged.

---

## 3. Summary — what to REMOVE, what to ADD

### PDF

| Line(s) | Current | Action |
|---------|---------|--------|
| 7422 | `arcDocCheckBreak(ctx,25+_extraRows*7)` | EDIT: `25` → `31` (add 6 for combined row) |
| 7446-7449 | Separate `if(isBudg)` BUDGETARY block | REMOVE (merged into combined row) |
| 7451-7457 | Separate valid-until row with own `arcDocCheckBreak` + "BUDGETARY - " prefix | REMOVE (replaced by combined row) |
| After 7444 | (nothing) | ADD: combined BUDGETARY/valid-until block (see §1 above) |

### On-screen

| Line(s) | Current | Action |
|---------|---------|--------|
| 20837 | `{isProjectBudgetary&&<div>BUDGETARY</div>}` | REPLACE with conditional: budgetary div includes valid-until span; else standalone valid-until div |
| 20838-20841 | Separate valid-until div with "BUDGETARY - " prefix | REMOVE (merged into the conditional above) |

### Not touched

| Element | Line | Why |
|---------|------|-----|
| `isProjectBudgetary` definition | 20238 | Show/hide condition unchanged |
| `isBudg` definition | 6844 | PDF equivalent unchanged |
| `defaultValidUntil` | 20244 | Already correct |
| `resolveQuoteValidityDays` | 2038-2043 | Cascade logic unchanged |
| `quoteExpiresAt` stamp (send paths) | 33000-33003, 38478-38481 | Persistence unchanged |
| Expiry gate | 36668-36673 | Not a render concern |
| Compact form input | 20306-20310 | The editable days input, unchanged |
| Footer (emptied in Phase 2) | 20847-20855 | Stays empty |

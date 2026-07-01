# #187 Valid-Until Relocation — Render Site Trace

**Author:** Sam Wize (Coach)
**Date:** 2026-07-01
**Type:** Read-only trace (no code changes)
**Tip:** master post-Phase 1 implementation

---

## 1. ON-SCREEN (QuoteTab) — Totals + BUDGETARY + insertion point

**Total Price row — line 20762:**
```js
<div className="qd-totals-row qd-grand"><span>Total</span><span className="qd-amt">{hasTotalPrice?fmtMoney(totalPrice):"—"}</span></div>
```

**BUDGETARY element — line 20763:**
```js
{isProjectBudgetary&&<div style={{textAlign:"center",padding:"6px 0",fontSize:14,fontWeight:800,color:"#dc2626",letterSpacing:2,textTransform:"uppercase"}}>BUDGETARY</div>}
```

**Gate condition:** `isProjectBudgetary` — defined at line 20164:
```js
const isProjectBudgetary=(project.panels||[project]).some(isPanelBudgetary);
```
This is the flag for the "BUDGETARY - " prefix.

**Insertion point for new valid-until row:** Directly after line 20763 (the BUDGETARY element),
still inside the `qd-totals-box` div that closes at line 20764 (`</div>`). The new row goes
between line 20763 and line 20764.

Structure at the insertion point:
```
line 20762:  Total row (qd-grand)
line 20763:  {isProjectBudgetary && <div>BUDGETARY</div>}
  ← INSERT NEW ROW HERE ←
line 20764:  </div>   ← closes qd-totals-box
line 20765:  </div>   ← closes qd-totals-bar
```

The new row would be:
```jsx
<div style={{textAlign:"center",padding:"4px 0",fontSize:11,fontWeight:600,color:"#dc2626"}}>
  {isProjectBudgetary?"BUDGETARY - ":""}Prices Valid Until {defaultValidUntil}
</div>
```

---

## 2. PDF (buildQuotePdfDoc) — Totals + BUDGETARY + insertion point

**Total Price row — line 7415 (last entry in `totalsRows` array):**
```js
{l:"Total",v:arcFmtMoney(totalPrice),bold:true,eco:false},
```
Rendered by the forEach at lines 7417-7428. After the loop, `ctx.y` advances at line 7429.

**BUDGETARY element — lines 7431-7433:**
```js
if(isBudg){
  doc.setFontSize(11);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.red);
  doc.text("BUDGETARY",bx+bw/2,ctx.y,{align:"center"});ctx.y+=6;
}
```

**Gate condition:** `isBudg` — defined at line 6844:
```js
const isBudg=panels.some(pan=>(pan.pricing||{}).isBudgetary);
```
Same semantic test as the on-screen `isProjectBudgetary`, just different variable name.

**Current PRICES VALID UNTIL — lines 7436-7444:**
```js
// ── PRICES VALID UNTIL ──
arcDocCheckBreak(ctx,8);
doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.grey);
doc.text("PRICES VALID UNTIL",ARC_DOC.W-ARC_DOC.margin.right,ctx.y,{align:"right"});
ctx.y+=3.5;
doc.setFontSize(9);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.red);
doc.text(new Date(project.quoteExpiresAt||...).toLocaleDateString(...),ARC_DOC.W-ARC_DOC.margin.right,ctx.y,{align:"right"});
ctx.y+=6;
```

This is a **separate block** after BUDGETARY — a grey label "PRICES VALID UNTIL" right-aligned,
then the red date right-aligned below it. It renders as two right-aligned lines, visually
detached from the totals box.

**Relocation:** Replace lines 7436-7444 (the current separate valid-until block) with a single
line directly after the BUDGETARY block (line 7433). The new line combines BUDGETARY prefix +
valid-until into one centered row matching the on-screen spec:

```
line 7429:  ctx.y+=totalsRows.length*7+3;
line 7430:  doc.setTextColor(...ARC_DOC.colors.black);
line 7431:  if(isBudg){ ... BUDGETARY ... ctx.y+=6; }
  ← INSERT combined valid-until row HERE (after line 7433's closing brace) ←
line 7436-7444: ← REMOVE this entire block (the old separate valid-until) ←
```

The PDF replacement renders the same spec as on-screen:
"BUDGETARY - Prices Valid Until July 31, 2026" (centered, red) when budgetary,
"Prices Valid Until July 31, 2026" (centered, red) when not.

---

## 3. REMOVAL / KEEP split

### On-screen footer (lines 20775-20781) — what moves vs stays

**Current footer structure (lines 20769-20783):**
```
<div className="qd-footer-info">           ← line 20770
  <div>                                     ← Salesperson block
    <div>Salesperson</div>                  ← line 20772
    <div>{q.salesperson||"—"}</div>         ← line 20773
  </div>
  <div style={{textAlign:"right"}}>         ← line 20775
    <div>Prices Valid Until</div>           ← line 20776 (label)
    <div> (flex container)                  ← line 20778
      <span>{defaultValidUntil}</span>      ← DATE DISPLAY (line 20779)
      <input type="number" .../>            ← DAYS OVERRIDE INPUT (line 20780)
    </div>
  </div>
</div>
```

**DATE DISPLAY (line 20779):** `<span>{defaultValidUntil}</span>` — this is the computed
date string. This display **RELOCATES** to the new row under Total/BUDGETARY (the spec row).
Remove from the footer.

**DAYS OVERRIDE INPUT (line 20780):** `<input type="number" ... value={q.quoteValidityDays||""}
... />` — this is the editable control that writes `q.quoteValidityDays` via `setQ`. This
**STAYS in the footer** (or could move to the compact form area at line 20232-20236 where a
duplicate already exists). The user needs a place to type the override days; the footer is fine
for that. But the date display next to it relocates up.

**Recommendation:** Keep the footer right side as just the days-override input with its label,
remove the date span. The date now shows in the totals section (the new row). The footer
becomes:

```
<div style={{textAlign:"right"}}>
  <div className="qd-footer-label">Quote Validity (days)</div>
  <div className="qd-footer-value">
    <input type="number" ... value={q.quoteValidityDays||""} ... placeholder={...+"d"} />
  </div>
</div>
```

Or, if you'd rather not have the input in two places (it's already in the compact form at
line 20232-20236), remove the footer input entirely and keep only the compact form copy.
The footer then shows nothing for validity (Salesperson on the left, nothing on the right) —
or can be rebalanced. **Decision for Jon:** one input (compact form only) or two (compact form
+ footer)?

### Compact form (line 20232-20236)

**STAYS.** This is the "Quote Validity (days)" numeric input in the quote fields area. It's
the primary structured input. No change needed.

### PDF valid-until block (lines 7436-7444)

**REMOVE** the entire block (7 lines). Replaced by the new combined row inserted after the
BUDGETARY block at line 7433. There is no "keep" portion — the old block was a two-line
right-aligned label+date; the new row is a single centered line with the spec format.

---

## Summary

| Surface | Element | Line(s) | Action |
|---------|---------|---------|--------|
| On-screen | Total row | 20762 | No change |
| On-screen | BUDGETARY | 20763 | No change (reuse `isProjectBudgetary` for prefix) |
| On-screen | **New valid-until row** | Insert after 20763 | ADD: `{isProjectBudgetary?"BUDGETARY - ":""}Prices Valid Until {defaultValidUntil}` |
| On-screen | Footer date span | 20779 | REMOVE (relocated to new row) |
| On-screen | Footer days input | 20780 | KEEP (or remove if compact-form-only preferred — Jon's call) |
| On-screen | Footer label | 20776 | UPDATE label to "Quote Validity (days)" if input stays; REMOVE if input removed |
| On-screen | Compact form input | 20232-20236 | No change (primary days input) |
| PDF | Total row | 7415 | No change |
| PDF | BUDGETARY | 7431-7433 | No change (reuse `isBudg` for prefix) |
| PDF | **New valid-until row** | Insert after 7433 | ADD: combined centered row |
| PDF | Old valid-until block | 7436-7444 | REMOVE entirely (replaced by new row) |

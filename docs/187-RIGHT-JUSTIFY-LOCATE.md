# #187 Right-Justify Locate — Why textAlign Has No Visible Effect

**Author:** Sam Wize (Coach)
**Date:** 2026-07-01
**Type:** Read-only locate (no code changes)
**Tip:** master `b556a044` (v1.21.15)
**Bug:** `textAlign:"right"` on the valid-until row produces no visible change

---

## 1. Container Chain

```
#quote-doc (maxWidth:900, margin:0 auto)
  └─ div (breakInside:avoid)
       └─ .qd-totals-bar ← display:flex; justify-content:flex-end; padding:0 44px 28px
            └─ .qd-totals-box ← width:280px; overflow:hidden; border-radius:8px
                 ├─ .qd-totals-row (Subtotal) ← display:flex; justify-content:space-between; padding:10px 20px
                 ├─ .qd-totals-row (Tax)
                 ├─ .qd-totals-row.qd-grand (Total) ← same flex layout
                 │    ├─ <span>Total</span>         → pushed LEFT by space-between
                 │    └─ <span.qd-amt>$xxx</span>   → pushed RIGHT by space-between, 20px from box edge
                 └─ valid-until div ← NO className, inline styles only, padding:"6px 0" or "4px 0"
```

CSS source: `public/index.html` lines 77-81.

---

## 2. Why textAlign:"right" Has No Visible Effect

**Root cause: the text fills the 280px box.**

The valid-until div is a block-level child of `qd-totals-box` (280px, `overflow:hidden`). It
has `padding:"6px 0"` (budgetary) or `padding:"4px 0"` (non-budgetary) — **zero horizontal
padding**. So the text layout area is the full 280px.

**Budgetary case** (the one Jon tested):
```
"BUDGETARY" at fontSize:14, fontWeight:800, letterSpacing:2, textTransform:uppercase
" - Prices Valid Until July 1, 2026" at fontSize:11, fontWeight:600, letterSpacing:0
```

"BUDGETARY" alone at 14px + 2px letter-spacing ≈ 95-100px. The trailing text at 11px ≈
200-220px. Combined ≈ 300-320px — **wider than the 280px box**. The text wraps, and the
longest line fills most of the available width. Whether `textAlign:center` or
`textAlign:right`, the visible text layout is nearly identical because there's no meaningful
free space to redistribute.

**Non-budgetary case:**
"Prices Valid Until July 1, 2026" at 11px/600 ≈ 230-250px in a 280px box. The alignment
shift is only 15-25px — subtle, but exists. Jon likely tested the budgetary case.

**No CSS override exists.** No parent sets `text-align:center`. No `!important` rule
overrides inline `textAlign`. The property IS applied — it just produces no visible change
when the text fills the container.

---

## 3. How the Total Row Right-Aligns Its Dollar Value

The Total row uses class `qd-totals-row qd-grand`:

```css
.qd-totals-row {
  display: flex;
  justify-content: space-between;  /* ← label LEFT, value RIGHT */
  padding: 10px 20px;              /* ← 20px from each box edge */
  font-size: 16px;
  color: #475569;
}
```

Two `<span>` children: `<span>Total</span>` goes left, `<span className="qd-amt">$xxx</span>`
goes right. The dollar value's right edge sits at **280 - 20 = 260px** from the left edge of
`qd-totals-box`.

**The valid-until row has NO horizontal padding** (`padding:"6px 0"` / `"4px 0"`). Even if
`textAlign:right` worked visually, the right edge of the text would be at 280px — **20px to
the right of the Total dollar value**, not aligned under it.

---

## 4. The Correct Fix

**Match the Total row's mechanism: padding + flex (or textAlign:right for short text).**

The valid-until row needs two things:
1. **`padding: Npx 20px`** — so its right edge aligns with the Total value (260px, not 280px)
2. **A layout that right-aligns regardless of text width**

### Recommended approach: flex with flex-end

```jsx
{isProjectBudgetary ? (
  <div style={{display:"flex",justifyContent:"flex-end",alignItems:"baseline",
      padding:"6px 20px",gap:4,color:"#dc2626"}}>
    <span style={{fontSize:14,fontWeight:800,letterSpacing:2,
        textTransform:"uppercase"}}>BUDGETARY</span>
    <span style={{fontSize:11,fontWeight:600}}>
      - Prices Valid Until {defaultValidUntil}</span>
  </div>
) : (
  <div style={{textAlign:"right",padding:"4px 20px",fontSize:11,
      fontWeight:600,color:"#dc2626"}}>
    Prices Valid Until {defaultValidUntil}
  </div>
)}
```

Why this works:
- **`justifyContent:"flex-end"`** pushes content to the right of the flex container —
  independent of text width. Unlike `textAlign:right` on a block div (which has no effect
  when text fills the container), `flex-end` positions the flex ITEMS at the right edge.
  If the combined text exceeds the available width (280 - 40 = 240px), the items overflow
  to the LEFT and are clipped by `overflow:hidden` on the parent — the right edge stays
  flush with the padding boundary.
- **`alignItems:"baseline"`** aligns the 14px BUDGETARY and 11px valid-until on their text
  baselines, keeping them visually on one line.
- **`padding: Npx 20px`** matches the totals-row horizontal padding, so the right edge of
  "2026" sits directly under the right edge of "$xxx,xxx".
- **Non-budgetary case** can use plain `textAlign:right` because the text fits within 240px.

### Why textAlign:right alone can't work here

`textAlign` controls the alignment of **inline content within a block formatting context**.
It has no effect when:
- The inline content is wider than the block (text wraps to fill the available width)
- The block has no free horizontal space (zero padding + text fills container)

`justify-content:flex-end` operates at the **flex layout level**, positioning flex items
regardless of their text content width. This is the correct primitive for this case.

### Alternative: drop letterSpacing on the combined row

If the two-span flex layout feels heavy, the budgetary text CAN fit in 240px if
`letterSpacing:2` and `textTransform:uppercase` are dropped from the BUDGETARY word when
it's on the combined row. "BUDGETARY - Prices Valid Until July 1, 2026" at uniform 11px/600
is ≈ 240px — tight fit, right-aligns with `textAlign:right` + `padding:4px 20px`. Trade-off:
the BUDGETARY word loses its heavy visual weight. Jon's call.

---

## Summary

| Question | Answer |
|----------|--------|
| Why no visible effect? | Text fills the 280px box (especially budgetary with letterSpacing:2). No free space for textAlign to redistribute. |
| What centers it? | Nothing — the text is simply wide enough to appear centered because it fills the container. No CSS `text-align:center` is inherited. |
| How does Total right-align? | `display:flex; justify-content:space-between; padding:10px 20px` on `.qd-totals-row`. Dollar value at 260px (20px from right edge). |
| Correct fix? | `display:flex; justifyContent:flex-end; padding:Npx 20px` for budgetary (pushes flex items right regardless of text width). `textAlign:right` with same padding for non-budgetary (text fits in available width). |
| What to match? | Right edge of valid-until text at 260px from box left = right edge of Total dollar value. `padding:20px` horizontal is the key missing piece. |

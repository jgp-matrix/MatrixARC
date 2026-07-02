# Freddy — #187 right-justify: rendered computed-style trace (READ-ONLY)

**To:** Freddy (Analyst) · **From:** Marc · **Date:** 2026-07-01 · **DevTools/computed inspection, no fix**

v1.21.17: font change landed but the budgetary valid-until row still reads as not-right-aligned.
Measured the RENDERED truth (getComputedStyle + getBoundingClientRect on the real live-stylesheet
classes). **Your flex-centering hypothesis is REFUTED. The real cause is text WRAPPING in a fixed
280px box — text-align:right IS applied and IS working; there's just nothing to move.**

## Computed styles (rendered)

**The row `<div>`:** `display:block`, `text-align:right` ✅ (applied, NOT overridden), `width:278.7px`
(≈ full box width), `margin:0`. So it is NOT a shrink-wrapped narrow box sitting centered — it's a
full-width right-aligned block.

**Parent `.qd-totals-box`:** `display:block`, `width:280px`, border, `overflow:hidden`. **NOT a flex
container.** No `justify-content`/`align-items`. So it does NOT center its children.

**Grandparent `.qd-totals-bar`:** `display:flex; justify-content:flex-end; padding:0 44px 28px`.
Flex, but `flex-end` — it right-pushes the whole 280px box; it does not center anything.

→ **Hypothesis refuted:** neither ancestor centers the row. `text-align:right` is live on a
full-width block.

## The actual mechanism

The 280px box has 20px horizontal padding → **~239px content width**. Measured string widths at the
rendered 11px/600 font:
- **Budgetary "BUDGETARY - Prices Valid Until September 30, 2026" = ~280px → exceeds 239px → WRAPS to ~3 lines** (div offsetHeight 35px). A wrapped, right-aligned block fills the width on every line, so `text-align:right` has no visible effect and it reads as "centered/ragged."
- **Non-budgetary "Prices Valid Until September 30, 2026" = ~202px → fits in 239px → does NOT wrap** → this variant should already right-align cleanly. (Worth having Jon confirm the non-budgetary case looks right — it likely does; only the budgetary one is broken.)

## Why the Total value right-aligns but this row doesn't

Structural difference, same parent (both are children of `.qd-totals-box`):
- **Total row** = `.qd-totals-row` = `display:flex; justify-content:space-between` with **two spans**
  (label left, value right). The value is a short single-line span pinned to the right by flex.
- **Valid-until row** = a plain single text block. Its long text wraps within the 240px content area
  instead of being a short right-pinned element.

## Fix direction (yours to scope — it is NOT a single alignment property)

The blocker is that the budgetary string doesn't fit one line in the fixed 280px box. `text-align`
is already right. Candidate one-targeted-ish fixes for you to weigh:
- **Shrink to fit one line:** drop font to ~9px and/or remove the 20px padding (budgetary at ~280px
  still won't fit at 11px even at 0 padding — needs a smaller font or shorter text).
- **Shorten the string:** e.g. "Valid Until 9/30/26" (numeric date) fits easily and right-aligns.
- **Restructure like the Total row:** make it a `.qd-totals-row` (flex space-between) or a two-span
  row so the date pins right on one line.
- **Let it be wider:** move the row OUTSIDE the 280px box (into `.qd-totals-bar`, which is flex-end)
  so it can be full-width and right-align under the box without wrapping.

PDF is unaffected (page-centered, plenty of width). This trace covers on-screen only.

# #187 Relocation Fix Verification — Coach

**Author:** Sam Wize (Coach)
**Date:** 2026-07-01
**Version:** v1.21.15 (code d12c9241, release b556a044)
**Scope:** Commits 61efe318 (combined blocks) + d12c9241 (PDF anchor fit-correction)
**Verdict:** PASS — all 4 checks confirmed

---

## 1. ANCHOR DEVIATION — BLESSED

**My locate doc specified `bx+bw/2` (170.9mm, totals-box center). Marc rejected it — correct.**

### Fit math verification (independent)

The longest PDF string is the budgetary case: `"BUDGETARY - Prices Valid Until September 30, 2026"`
at fontSize 11, helvetica bold. jsPDF `getStringUnitWidth` returns character-width units that
scale by `fontSize / doc.internal.scaleFactor`. Marc measured 96.4mm for the full string — I'll
verify the margin fit for both anchors:

**At `bx+bw/2` = 170.9mm (my locate's suggestion):**
- Left edge: 170.9 - 96.4/2 = **122.7mm** (inside left margin 15mm — OK)
- Right edge: 170.9 + 96.4/2 = **219.1mm** (OUTSIDE right page edge 215.9mm — **CLIP**)

**At `ARC_DOC.W/2` = 107.95mm (Marc's correction):**
- Left edge: 107.95 - 96.4/2 = **59.75mm** (inside left margin 15mm — OK)
- Right edge: 107.95 + 96.4/2 = **156.15mm** (inside right margin 200.9mm — OK)

Marc's fit math is **correct**. The totals-box center clips; page center fits with 44.75mm of
right-side clearance.

### Why page center is the right choice

The totals number box (`bx` to `bx+bw`, 140.9–200.9mm) is a narrow 60mm column at the right
margin — it's the right place for right-aligned dollar amounts, but the wrong anchor for a
wide centered text string. The valid-until line is a standalone informational row beneath the
totals, not a column-aligned value — page center is semantically and visually correct.

This also matches the T&C page header at line 7465 which uses `ARC_DOC.W/2` for
`"STANDARD TERMS AND CONDITIONS OF SALE"` — same centering convention for full-width
informational text.

**My locate doc's anchor suggestion was wrong. Marc's correction is correct. Blessed.**

---

## 2. DOUBLING FIX — CONFIRMED

### PDF (lines 7446-7457)

The old separate `if(isBudg)` BUDGETARY block (was 7446-7449) is **removed**. The old separate
valid-until row with its own `"BUDGETARY - "` prefix (was 7451-7457) is **removed**. Replaced by
a single combined block (lines 7452-7457):

```js
doc.setFontSize(isBudg?11:9);
doc.setFont("helvetica",isBudg?"bold":"normal");
doc.setTextColor(...ARC_DOC.colors.red);
const _vuDate=new Date(project.quoteExpiresAt||Date.now()+resolveQuoteValidityDays(project,_customerValidityDays)*86400000)
    .toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
doc.text((isBudg?"BUDGETARY - ":"")+"Prices Valid Until "+_vuDate,ARC_DOC.W/2,ctx.y,{align:"center"});
```

- `isBudg` is the **sole gate** for the "BUDGETARY - " prefix — word appears once
- Font: 11pt bold (budgetary) / 9pt normal (non-budgetary) — preserves the BUDGETARY weight
- Data source: `project.quoteExpiresAt` (project-level, correct) with live cascade fallback
- `_customerValidityDays` passed to resolver — customer tier intact

### On-screen (lines 20837-20847)

The old standalone BUDGETARY div + separate valid-until div (was 20837-20841) replaced by a
ternary:

```jsx
{isProjectBudgetary ? (
  <div style={{...BUDGETARY styles...}}>
    BUDGETARY<span style={{letterSpacing:0,textTransform:"none",fontWeight:600,fontSize:11}}>
      {" - Prices Valid Until "}{defaultValidUntil}</span>
  </div>
) : (
  <div style={{...valid-until styles...}}>
    Prices Valid Until {defaultValidUntil}
  </div>
)}
```

- `isProjectBudgetary` is the **sole gate** for "BUDGETARY" — word appears once
- BUDGETARY div styling preserved: center, 14px, 800 weight, #dc2626, letterSpacing 2, uppercase
- Inner `<span>` resets letterSpacing/textTransform/fontWeight/fontSize for the valid-until text
  so "BUDGETARY" renders heavy uppercase and " - Prices Valid Until ..." renders light normal —
  same line, one element
- Non-budgetary: standalone centered div, 11px, 600 weight, red

**Both surfaces: word "BUDGETARY" appears exactly once, gated by isBudg/isProjectBudgetary. CONFIRMED.**

---

## 3. ORPHAN FIX — CONFIRMED

### Separate break check removed

The old `arcDocCheckBreak(ctx,8)` at line 7454 (the orphan trigger) is **gone**. No separate
page-break check exists between the totals block and the valid-until line.

### Pre-reservation increased

Line 7422: `arcDocCheckBreak(ctx,31+_extraRows*7)` — changed from `25` to `31` (+6).

The 6-unit increase covers the combined valid-until row (`ctx.y+=6` at line 7457). The entire
sequence — totals rows + combined valid-until — is now reserved as one block:

| Component | Space (mm) |
|-----------|-----------|
| Totals rows | `totalsRows.length * 7` (base 5 rows = 35) |
| Post-totals gap | 3 |
| Combined valid-until | 6 |
| **Total base** | **31 + extraRows×7** |

When `arcDocCheckBreak(ctx, 31+_extraRows*7)` runs, if there isn't room for the full block,
the ENTIRE block moves to a new page — the valid-until row can never be orphaned from the
totals. **CONFIRMED.**

---

## 4. NOT TOUCHED — CONFIRMED

Verified each element is unchanged between v1.21.14 (`c46e75fd`) and the fix (`d12c9241`):

| Element | Location | Status |
|---------|----------|--------|
| `isProjectBudgetary` | Line 20238 | Unchanged — `(project.panels\|\|[project]).some(isPanelBudgetary)` |
| `isBudg` | Line 6844 | Unchanged — `panels.some(pan=>(pan.pricing\|\|{}).isBudgetary)` |
| `resolveQuoteValidityDays` | Lines 2038-2043 | Unchanged — 4-tier cascade, all 6 call sites intact |
| `quoteExpiresAt` stamp (send 1) | Lines 33006-33009 | Unchanged — race guard + stamp |
| `quoteExpiresAt` stamp (send 2) | Lines 38484-38487 | Unchanged (not in diff) |
| Expiry gate | Lines 36674-36678 | Unchanged — `quoteLocked && !_quoteExpired` |
| Compact form input | Lines 20306-20310 | Unchanged — numeric days input |
| Emptied footer | Lines 20853-20860 | Unchanged — salesperson only, comment preserved |
| `defaultValidUntil` | Line 20244 | Unchanged — `project.quoteExpiresAt` with cascade fallback |

The diff touches exactly **two code regions** in `src/app.jsx`:
1. PDF `buildQuotePdfDoc` (lines 7422 + 7446-7457): pre-reservation bump + combined row
2. On-screen QuoteTab (lines 20837-20847): ternary replacement

Total: 17 lines removed, 17 lines added (+ 1 line edited). Scope is tight. **CONFIRMED.**

---

## Live-Pending Check

The one remaining check is a **live PDF eyeball** — Jon's to run:

- **Budgetary project:** Generate PDF → verify single centered line reading
  `"BUDGETARY - Prices Valid Until <date>"` in red bold, no separate "BUDGETARY" word above it,
  no orphan to the next page.
- **Non-budgetary project:** Generate PDF → verify single centered line reading
  `"Prices Valid Until <date>"` in red normal weight, no "BUDGETARY" prefix.
- **On-screen:** Open both project types → verify the same visual under the Total row.

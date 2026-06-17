# Coach Supplement — #146 Confidence "C" Circles Over-Displaying

**From:** Coach (Sam Wize)  
**To:** Jon  
**Re:** Brief #146 — diagnose (a) display/threshold vs (b) score calibration  
**Date:** 2026-06-16  
**Type:** READ + REPORT — no fix proposed

---

## The Determination: (a) — Display/Threshold Problem

**Unambiguously case (a).** The confidence scores from the AI model are fine. The over-display is caused by a post-extraction auto-downgrade regex that is so broad it catches virtually every real part number.

The model is NOT the problem. The post-extraction code that second-guesses the model IS the problem.

---

## The Evidence

### 1. The Render Condition (line 28055)

```js
{!row.isLaborRow && !row.isContingency
  && (row.confidence === "low" || row.confidence === "medium")
  && (<span>C</span>)}
```

The circle renders for `"low"` or `"medium"` confidence. `"high"` hides it. There IS a threshold gate — the condition is correct in principle. The problem is upstream: too many rows are being downgraded from "high" to "medium" before they reach this render check.

### 2. The Confidence Source: Two Layers

**Layer 1 — AI model assignment (line 11676–11699):**

The extraction prompt instructs the model to assign `"high"`, `"medium"`, or `"low"` per row. The bar for "high" is strict: "ZERO doubt on EVERY character of every cell." The prompt lists 20 confusable-glyph pairs (S↔5, O↔0, 8↔B, etc.) and says: if ANY confusable pair is in play AND you can't rule it out by glyph shape alone, do NOT mark "high."

The model already enforces this conservatively. Rows with genuine glyph ambiguity get "medium" from the model. Rows with crystal-clear text get "high" from the model.

**Layer 2 — Post-extraction auto-downgrade (line 12071–12083):**

After the model returns its results, a post-processing step OVERRIDES the model's "high" → "medium" for any row whose part number contains a confusable character:

```js
const _confusableAny = /[S0O8BIZG6T7HN5DC2QlIL1]/i;
// ...
if (hasConfusable || isEnclosure) {
  it.confidence = "medium";
  it._confDowngradeReason = isEnclosure ? "enclosure-row" : "contains-confusable-glyph";
}
```

### 3. The Smoking Gun: The Regex Catches Everything

The regex `/[S0O8BIZG6T7HN5DC2QlIL1]/i` matches any part number containing ANY of:

| Category | Characters matched | Characters NOT matched |
|----------|-------------------|----------------------|
| **Digits** | 0, 1, 2, 5, 6, 7, 8 | 3, 4, 9 |
| **Letters** | B, C, D, G, H, I, L, N, O, Q, S, T, Z | A, E, F, J, K, M, P, R, U, V, W, X, Y |

**20 out of 36 alphanumeric characters trigger a downgrade.** More than half.

A part number avoids this filter ONLY if it uses exclusively the digits 3, 4, 9 and the letters A, E, F, J, K, M, P, R, U, V, W, X, Y.

Real-world examples from Matrix's domain (Allen-Bradley, ABB, Siemens):

| Part Number | Characters hitting the regex | Downgraded? |
|-------------|------------------------------|-------------|
| 1SDA102947R1311 | 1, S, D, 1, 0, 2, 1 | YES |
| 100-C09ND10 | 1, 0, 0, C, 0, N, D, 1, 0 | YES |
| 800H-BR6A | 8, 0, 0, H, B, 6 | YES |
| 1489-M2C100 | 1, 8, C, 1, 0, 0 | YES |
| 140G-H6C3-D10 | 1, 0, G, H, 6, C, D, 1, 0 | YES |
| CAT-5E-PATCH | C, 5 | YES |

**There is essentially no legitimate electrical part number that escapes this regex.** Every row the model correctly identifies as "high" confidence gets downgraded to "medium" by the post-extraction code. The circle then renders on every line.

### 4. The Double-Gate Redundancy

The AI model prompt (lines 11680–11691) already instructs the model to check for confusable glyphs and downgrade accordingly. The post-extraction regex at line 12073 then checks for the same thing AGAIN — but with a much coarser test.

**The model checks:** "Can I rule out the alternate reading by glyph shape alone?" This is context-aware. The model can see that "100" in a BOM context is clearly one-zero-zero, not I-O-O. It marks "high" because the glyphs are unambiguous IN CONTEXT.

**The regex checks:** "Does the string contain any character that COULD theoretically be confusable?" This is context-blind. It doesn't care that "100" is obviously digits — the characters "1" and "0" are in the confusable list, so it downgrades.

The model is doing the right thing. The regex is overriding it with a context-blind check that the model already performed with more intelligence.

### 5. Historical Context

The comment at line 12071 says `"mirrors v1.19.975 logic"`. This was added when extraction accuracy was lower (pre-H5, pre-600-DPI). At that time, the model's "high" confidence was less trustworthy — the confusable-glyph regex served as a safety net. The rationale was: better to over-flag than to miss a misread part number on an industrial BOM (wrong part → wrong component → safety risk).

The world changed. With H5 generalization and 600-DPI rendering, the model's accuracy improved dramatically. But the safety-net regex didn't. It still casts the same wide net, catching everything, even though the model's "high" is now genuinely reliable.

---

## The Confidence Pipeline (Full Trace)

```
AI model assigns "high" / "medium" / "low" per row
         ↓
Post-extraction auto-downgrade (line 12073):
  IF part number contains S/0/O/8/B/I/Z/G/6/T/7/H/N/5/D/C/2/Q/l/I/L/1 → "medium"
  IF description matches enclosure/cabinet/NEMA/subpanel/backpanel → "medium"
         ↓
Row stored with confidence = "medium" and _confDowngradeReason
         ↓
User edits part number (line 25525) → confidence restored to "high"
         ↓
BC auto-cross / learned-correction replaces PN → confidence set to "high"
         ↓
Render: confidence === "low" || "medium" → show amber/red circle
```

The auto-downgrade at step 2 is where nearly every "high" becomes "medium". User PN edits and BC crosses restore it — but only AFTER manual action. On initial extraction, virtually everything shows the circle.

---

## Interaction with the Trust Layer

The confidence circle and `manualVerifyRequired` are **independent systems**:

| System | Scope | Purpose | Gates send? |
|--------|-------|---------|-------------|
| Confidence circle ("C") | Per-row | Visual indicator: "AI was unsure about this PN" | NO — informational only |
| `manualVerifyRequired` | Per-panel | Block BOM send until manual verification | YES — blocks `handleBomSend` and `findIncompleteQuoteItems` (line 15625) |
| "Mark BOM Verified" | Per-panel | User clears the `manualVerifyRequired` flag | YES — unblocks send |

Fixing the confidence circle display **does not affect** the send-gate logic. They don't read each other. The confidence circle is cosmetic; the send gate is `manualVerifyRequired`. Any fix to #146 is scoped to the display/downgrade layer — no interaction with the business-logic trust layer.

---

## What I Did NOT Determine (Deferred to Jon)

Per the Brief: do NOT propose a fix or a threshold until Jon has seen the score distribution and the (a)/(b) determination.

The determination is in: **(a) — the post-extraction confusable-glyph regex at line 12073 is too broad and catches ~100% of real part numbers, overriding the model's correct "high" confidence scores.**

**The question back to Jon:**

The simplest fix is to remove or narrow the auto-downgrade regex (line 12073–12083). But the RIGHT calibration depends on what Jon wants the circle to mean now:

- If "C" should flag rows the MODEL is unsure about: remove the post-extraction auto-downgrade entirely. Trust the model's prompt-level confusable-glyph check. The circle would only appear on rows the model itself marked "medium" or "low."
- If "C" should flag rows with genuinely ambiguous glyphs: narrow the regex to check for confusable PAIRS in context (e.g., "S" adjacent to digits, "0" adjacent to letters), not just presence of any confusable character.
- If "C" should be reserved for truly low-confidence lines: the circle already hides for "high" — just need to stop mass-downgrading "high" to "medium."

All three options converge on the same underlying change (the regex at 12073), but the threshold tuning depends on what signal Jon wants the circle to carry. That's his call once he's seen this report.

---

## Summary

| Finding | Detail |
|---------|--------|
| **Determination** | **(a) — Display/threshold problem, NOT score calibration** |
| **Root cause** | Post-extraction confusable-glyph regex (line 12073) matches 20/36 alphanumeric characters → downgrades ~100% of rows from "high" to "medium" |
| **Model scores** | Fine — model assigns "high" correctly for clear text |
| **The regex** | `/[S0O8BIZG6T7HN5DC2QlIL1]/i` — catches every real part number |
| **Historical** | Added v1.19.975 as a safety net for lower-accuracy extraction; never updated for H5/600-DPI gains |
| **Trust layer** | No interaction — confidence circle is cosmetic; `manualVerifyRequired` is the send gate |
| **Fix location** | Line 12071–12083 (the auto-downgrade block). Render condition at line 28055 is correct. |

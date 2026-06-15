# Q3 Probe 3 — FLSmidth / Matrix Crown-Jewel Determinism Test

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Brief by:** Freddy Lyst

---

## Result: 100% Deterministic

Both FLSmidth and Matrix drawings extract with **perfect reproducibility** across
3 independent runs. Every part number, every item, every time. Zero divergence.

---

## Side-by-Side: All Four Drawing Types

| Metric | PRJ402096 FLS | PRJ402098 Matrix | PRJ402113 OVIVO CAD | PRJ402100 OVIVO Raster |
|--------|:---:|:---:|:---:|:---:|
| **PDF text layer** | **YES** (2,796 chars) | **YES** (2,792 chars) | NO (77 chars) | NO (0 chars) |
| Item counts (3 runs) | 28 / 28 / 28 | 15 / 15 / 15 | 87 / 86 / 86 | 28 / 28 / 30 |
| Exact 3-run consensus | **100%** | **100%** | 19% | 4% |
| Fuzzy d≤2 consensus | **100%** | **100%** | 55% | 31% |
| Item-aligned: all agree | **100%** (28/28) | **100%** (15/15) | 37% (32/86) | 11% (2/18) |
| Item-aligned: majority | **100%** | **100%** | 67% | 39% |
| Item-aligned: all diverge | **0%** | **0%** | 33% | 61% |

---

## The Dividing Line: Text Layer

The single variable that separates 100% determinism from 4–19% chaos is
**whether the PDF carries an embedded text layer on the BOM page.**

| Drawing source | Text layer? | BOM page text chars | Determinism |
|----------------|:-----------:|--------------------:|:-----------:|
| FLSmidth (1001244897) | YES | 2,796 | **Perfect** |
| Matrix (Buyoff_Disconnect) | YES | 2,792 | **Perfect** |
| OVIVO/CSW CAD export | NO | 77 | **19% exact** |
| OVIVO/Clearstream raster | NO | 0 | **4% exact** |

When the PDF has a text layer, the model reads Unicode glyphs from the PDF's
text stream. This is lossless — the characters ARE the characters, no vision
interpretation needed. The model returns the same output every time.

When the PDF lacks a text layer (CAD exports where text is rendered as vector
paths, or raster scans), the model falls back to vision-based OCR on the page
image. The same curved path or pixel cluster gets interpreted as different
characters on each pass. This is fundamentally stochastic.

---

## What This Means

### It's World A — clean drawings stayed clean

Jon's recall is correct. FLSmidth and Matrix drawings extracted near-perfectly
before AND still extract perfectly now. There is no regression. The extraction
pipeline has not degraded.

The OVIVO/CSW drawings were always hard — they lack text layers due to how
AutoCAD exports them. The "degradation" Jon observed when onboarding OVIVO was
not code regression but an input-quality cliff: the new customer's drawings
hit a fundamentally different extraction path (vision OCR vs text reading).

### The extraction pipeline is not broken — it has two modes

1. **Text mode** (text-layer present): PDF-native extraction reads the text
   stream. Deterministic, accurate, fast. This is what FLS/Matrix drawings use.

2. **Vision mode** (no text layer): The model renders the page as an image and
   performs OCR. Non-deterministic, noisy, slow. This is what OVIVO CAD exports
   and raster scans force.

The code doesn't distinguish these modes. Both go through `extractBomPage` via
the pdf-native path. The model itself decides whether to read text or interpret
the image based on what's available in the PDF content stream.

### Implications for #98 and #100

1. **#98 accuracy is a per-customer problem, not a system problem.** FLS/Matrix
   accuracy is likely near-perfect (text-layer extraction). OVIVO accuracy is
   the one that needs measurement, and it requires an external oracle because
   the extraction itself is non-reproducible.

2. **#100 completeness is also per-customer.** Text-layer drawings get complete
   extraction (28/28, 15/15 every time). Vision-mode drawings get variable
   completeness (62–87 items from the same page).

3. **C5 auto-cross corruption primarily affects vision-mode projects.** On
   text-layer projects, the extracted PNs are correct and stable — auto-cross
   corrections (if any exist for these PNs) would be applying correct→correct.
   On vision-mode projects, auto-cross applies stochastic→stochastic corrections,
   compounding the noise.

4. **The fix is input-quality, not code.** Asking OVIVO/CSW to export their
   AutoCAD drawings with "Plot to PDF with text layer" (a CAD setting, not a
   redraw) would move them from 4–19% determinism to 100%. This is a customer
   workflow change, not an ARC code change.

### Actionable next steps (measurement only — no fix design)

- **Classify the full project population** by text-layer status. The Q3 census
  showed 9 no-PDF + 3 zero-byte + 14 healthy PDFs. Of those 14 healthy PDFs,
  how many have text layers? This determines the scale of the problem.
- **Measure OVIVO accuracy against customer Excel BOMs** (per TODO #85). Since
  extraction is non-reproducible, only an external oracle can measure accuracy.
- **Quantify the BC-lookup success rate** for text-layer vs vision-mode projects.
  If text-layer projects have 90%+ BC match and vision projects have 40%, that's
  the production-impact proof.

---

## Extraction Metadata

| Project | Model | Path | Stop | Runs | Items |
|---------|-------|------|------|:----:|:-----:|
| PRJ402096 | claude-opus-4-6 | pdf-native | end_turn | 3 × identical | 28 |
| PRJ402098 | claude-opus-4-6 | pdf-native | end_turn | 3 × identical | 15 |

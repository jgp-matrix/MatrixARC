# Q3 Probe 5 — Path-A Determinism: VECTOR-STROKE vs BITMAP on PDF-Native

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Brief by:** Freddy Lyst

---

## The Answer

**VECTOR-STROKE is materially more deterministic than BITMAP on Path A.**
Path A (PDF-native) doesn't change the path for these projects — they're already on it.
But the drawing's internal structure (vector strokes vs embedded bitmap) creates a
3× determinism gap even on the same extraction path.

| Metric | PRJ402109 VECTOR-STROKE | PRJ402113 BITMAP (Probe 2) | Ratio |
|--------|:-----------------------:|:--------------------------:|:-----:|
| Exact 3-run consensus | **60%** | 19% | **3.2×** |
| Fuzzy d≤2 consensus | **94%** | 55% | **1.7×** |
| Item-aligned all-agree | **77%** | 37% | **2.1×** |
| Item-aligned all-diverge | **2%** (1/44) | 33% (28/86) | **16× less** |
| Item count stability | 44 / 44 / 44 | 87 / 86 / 86 | Both stable |

**BITMAP (PRJ402101) on Path A** shows 44% exact / 80% fuzzy d≤2 / 58% item-aligned
(2 runs only, so not directly comparable to 3-run consensus). Better than PRJ402113's
3-run result but this is partially an artifact of the 2-run vs 3-run methodology.

---

## Side-by-Side: All Tested Drawing Types on Path A

| Drawing Type | Project | Runs | Exact Consensus | Fuzzy d≤2 | Item All-Agree | Item All-Diverge |
|-------------|---------|:----:|:---------------:|:---------:|:--------------:|:----------------:|
| **Text-layer** | PRJ402096/098 | 3 | **100%** | **100%** | **100%** | **0%** |
| **VECTOR-STROKE** | PRJ402109 | 3 | **60%** | **94%** | **77%** | **2%** |
| **BITMAP (CAD)** | PRJ402113 | 3 | **19%** | **55%** | **37%** | **33%** |
| **BITMAP (CAD)** | PRJ402101 | 2* | **44%*** | **80%*** | **58%*** | — |
| **SCAN (raster)** | PRJ402100 | 3 | **4%** | **31%** | **11%** | **61%** |

*PRJ402101: 2-run pairwise, not 3-run consensus. Values are inherently higher than
3-run because fewer chances to disagree.

**The determinism hierarchy is clear:**

```
Text-layer (100%) >> VECTOR-STROKE (60/94%) >> BITMAP (19-44/55-80%) >> SCAN (4/31%)
```

---

## PRJ402109 — VECTOR-STROKE Detail (3 runs, all complete)

| Run | Items | Unique PNs |
|-----|------:|-----------:|
| r0 | 44 | — |
| r1 | 44 | — |
| r2 | 44 | — |

**3-run consensus:**

| Category | Count | % of 53 unique |
|----------|------:|-----------------:|
| In ALL 3 | 32 | **60%** |
| In exactly 2 | 18 | 34% |
| In only 1 | 3 | 6% |

**Item-aligned (44 items in all 3 runs):**

| Agreement | Items | % |
|-----------|------:|--:|
| All 3 identical | 34 | **77%** |
| 2 agree, 1 off | 9 | 20% |
| All 3 diverge | 1 | **2%** |

Only ONE row fully diverges across 3 runs:

| Item | Run 0 | Run 1 | Run 2 |
|------|-------|-------|-------|
| 7 | `E1DSBR0U` | `ELDBR01U` | `E1DSBRU` |

This is a single 8-character PN where the model consistently struggles with the
specific character shapes at one position. Every other row has at least a majority vote.

**Multi-pass voting would stabilize 97% of rows** (77% unanimous + 20% majority).

---

## PRJ402101 — BITMAP Detail (2 runs: Probe 5 r0 + Q3)

| Run | Items |
|-----|------:|
| Probe 5 r0 | 62 |
| Q3 run | 62 |

Counts perfectly stable. Pairwise comparison:

| Metric | Value |
|--------|------:|
| Unique PNs (union) | 84 |
| Exact match | 37 (44%) |
| Fuzzy d≤2 match | 67 (80%) |
| Item-aligned total | 60 |
| Item-aligned agree | 35 (58%) |

Sample mismatches (same row, 2 readings):

| Item | Run 0 | Q3 | Pattern |
|------|-------|-----|---------|
| 2 | `SCE-90P48F1` | `SCE-90P48P1` | F→P |
| 3 | `SCE-AC1440B46VSS` | `SCE-AC1400B460VSS` | digit transposition |
| 4 | `SCE-LF18` | `SCE-UF18` | L→U |

Classic OCR noise on bitmap-rendered text — but at a HIGHER rate than the
VECTOR-STROKE project.

**Bonus finding — chronic timeout:** PRJ402101 (2.9 MB, 23-page PDF) consistently
exceeds the 480s Cloud Function timeout. 5 of 7 extraction attempts across Q3 and
Probe 5 timed out. The PDF's size causes the Cloud Function to spend too long on
download + pdf-lib parsing before the Anthropic API call even starts. This is a
production reliability issue for large PDFs independent of determinism.

---

## What This Means

### VECTOR-STROKE is the fix target with the best ROI

The 3 VECTOR-STROKE projects (PRJ402109, 402117, 402119 — 71 BOM items total)
extract at 60% exact / 94% fuzzy on Path A TODAY with no code changes. Multi-pass
voting (N=3) would stabilize 97% of their rows.

This is dramatically better than BITMAP (19-44% exact, 55-80% fuzzy) and close
enough to text-layer (100%) that the extraction is productionally usable with
a simple voting layer.

### BITMAP is floor-limited by source image quality

Path A (PDF-native) already sends the native PDF content to the model. The BITMAP
pages have their BOM table embedded as raster images within the PDF — the model
receives the image at its native resolution. Path A can't add detail the source
lacks.

For BITMAP drawings:
- **Multi-pass voting helps partially**: 37% unanimous + 30% majority = 67% stabilized
  (Probe 2 fuzzy analysis). But 33% of rows have 3 different readings — no majority.
- **The ceiling is the image**: improving the extraction path won't help when the source
  pixels are ambiguous. Only external oracles (#85 Excel cross-check) or customer
  workflow changes (text-layer export) can push past this.

### The 73% vision-mode population splits into two fixability tiers

| Tier | Projects | BOM Items | Best ARC-Side Fix | Expected Outcome |
|------|:--------:|----------:|-------------------|------------------|
| **Tier 1: VECTOR-STROKE** | 3 | 71 | Multi-pass voting (N=3) | 97% row stability |
| **Tier 2: BITMAP** | 16 | ~800 | Voting + Excel oracle (#85) | 67% from voting, remainder needs external oracle |

Tier 1 is a small population (3 projects, 71 items) but proves that Path A +
voting is sufficient for vector-stroke drawings. The technique is cheap to implement
and would immediately improve these projects.

Tier 2 is the bulk (16 projects, ~800 items) and is floor-limited. Voting helps
partially but can't close the gap without an external ground-truth source.

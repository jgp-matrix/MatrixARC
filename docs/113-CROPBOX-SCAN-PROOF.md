# #113 — CropBox Bitmap/Scan Proof on PRJ402119

**Author:** Marc Masdev  
**Date:** 2026-06-09  
**Version:** v1.20.111  
**Status:** MEASUREMENT COMPLETE — no code changes, no saves

---

## Executive Summary

**CropBox is COUNTERPRODUCTIVE on scan-tier PDFs.**  

On PRJ402119 (168 DPI monochrome fax-scan), CropBox returns **0 items** — total failure.
The model cannot read the cropped BOM region in isolation. The baseline's 14 items came
from the degenerate-crop retry path (full page, no CropBox).

Full-page extraction is the only viable path for scans, and it produces 36–50% accuracy
with high run-to-run variance. This tier is **floor-limited by source scan quality** —
voting (#114) would compound cost without recovering accuracy. The Excel oracle (#85)
is the correct path for scan-tier projects.

---

## Source Document Profile

| Property | Value |
|----------|-------|
| Project | PRJ402119 — Proctors Creek Trolley Junction Box (RSW1596-126) |
| Drawing type | Scanned PDF (monochrome fax-quality) |
| Page | 3 of 6 (BOM + enclosure page) |
| PDF quality | `isScanned: true, isMonochrome: true, estimatedDpi: 168, warningLevel: "high"` |
| BOM region | User-drawn: `{x: 0.068, y: 0.691, w: 0.434, h: 0.192}` (43% × 19% of page) |
| Extraction path | `pdf-native` via `extractBomPage` Cloud Function |
| Model | Claude Opus 4.6 |
| Ground truth items | 14 (13 material + 1 cover plate sub-item) |

---

## Ground Truth (from 95-ITEM8-TRACE-RESULTS.md, drawing inspection)

| # | Part Number | Description |
|---|-------------|-------------|
| 1 | SCE-1413PCW | Junction box |
| 2 | SCE-14P13AL | Subpanel |
| 3 | 3038338 | Motor terminal block |
| 4 | 3214259 | 3-level terminal block |
| 5 | 3214314 | Terminal block |
| 6 | 3022276 | Terminal block |
| 7 | 0807012 | Terminal block |
| 8 | TYD15X3WPW6 | Cover plate |
| 8c | TYD2CW6 | Cover plate (item 8 variant) |
| 9 | HS-CG2 | Hub |
| 10 | SECM25G | Sealing compound |
| 11 | SECM40G | Sealing compound |
| 12 | LNM25BPK100 | Locknut |
| 13 | LNM40BPK100 | Locknut |

---

## Three Extraction Runs

### Run 1: CropBox ON (PDF CropBox to BOM region)

| Metric | Value |
|--------|-------|
| bomRegion | `{x: 0.068, y: 0.691, w: 0.434, h: 0.192}` |
| Items returned | **0** |
| API time | 9,616 ms |
| Input tokens | 1,837 (+ 7,712 cache creation) |
| Output tokens | 228 (194 thinking) |
| Raw response | 81 chars |

**Result: TOTAL FAILURE.** The model could not read anything from the cropped area.
The CropBox isolates a 43% × 19% slice of a 168 DPI monochrome scan — approximately
2,479 × 710 pixels of blurry bitmap. Without the surrounding page context (title block,
schematic, other tables), the model doesn't even recognize the region as a BOM table.

### Run 2: Baseline (Jon's fresh extraction via app, v1.20.111)

The app's extraction flow calls `resolveBomRegion` → CropBox → **0 items** → triggers
the degenerate-crop retry → re-extracts as **full page (no CropBox)** → success.
This is the data currently in Firestore.

| # | Extracted PN | Ground Truth | Verdict |
|---|-------------|-------------|---------|
| 1 | SCE-14**L**3PCW | SCE-14**1**3PCW | ✗ 1→L |
| 2 | SCE-14P13AL | SCE-14P13AL | ✓ |
| 3 | 303**80**38 | 303**83**38 | ✗ 3→0 |
| 4 | 3214259 | 3214259 | ✓ |
| 5 | 3214**0**14 | 3214**3**14 | ✗ 3→0 |
| 6 | 3022276 | 3022276 | ✓ |
| 7 | 0807012 | 0807012 | ✓ |
| 8 | TYD**1513**WPW**S** | TYD**15X3**WPW**6** | ✗ X→1, 6→S |
| 8c | T**1**D2CW**S** | T**Y**D2CW**6** | ✗ Y→1, 6→S |
| 9 | HS-CG2 | HS-CG2 | ✓ |
| 10 | SECM25G | SECM25G | ✓ |
| 11 | SECM40G | SECM40G | ✓ |
| 12 | LNM**J25**PK100 | LNM**25B**PK100 | ✗ restructured |
| 13 | LNM**J40**PK100 | LNM**40B**PK100 | ✗ restructured |

**Score: 7/14 correct (50%), 7/14 wrong**  
**Items: 14** (all material items present, including item 8 cover)  
**API time: ~120s** (estimated from app extraction including overhead)

### Run 3: Full Page — Direct CF Call (no CropBox, no retry logic)

| # | Extracted PN | Ground Truth | Verdict |
|---|-------------|-------------|---------|
| 1 | SCE-14**L**3PCW | SCE-14**1**3PCW | ✗ 1→L (same as baseline) |
| 2 | SCE-14P13AL | SCE-14P13AL | ✓ |
| 3 | 303**80**38 | 303**83**38 | ✗ 3→0 (same as baseline) |
| 4 | 3214259 | 3214259 | ✓ |
| 5 | 3214**5**14 | 3214**3**14 | ✗ 3→5 (DIFFERENT error from baseline) |
| 6 | **80**2276 | **302**2276 | ✗ leading "30" truncated (baseline was CORRECT) |
| 7 | 0807012 | 0807012 | ✓ |
| 8 | TYD15X3**M**PW**S** | TYD15X3**W**PW**6** | ✗ W→M, 6→S |
| 8c | — MISSING — | TYD2CW6 | ✗ not extracted at all |
| 9 | HS-CG2 | HS-CG2 | ✓ |
| 10 | SECM25G | SECM25G | ✓ |
| 11 | SECM40G | SECM40G | ✓ |
| 12 | LNM**P25R**-100 | LNM**25BPK**100 | ✗ wholesale restructuring |
| 13 | LNM**P40R**-100 | LNM**40BPK**100 | ✗ wholesale restructuring |

**Score: 5/14 correct (36%), 9/14 wrong**  
**Items: 13** (item 8 cover MISSING)  
**API time: 120,234 ms** (2 min 0 sec)  
**Input tokens: 9,711 | Output tokens: 7,528**

---

## Analysis

### 1. CropBox Verdict: COUNTERPRODUCTIVE on Scans

| Approach | Items | Accuracy | API time |
|----------|:-----:|:--------:|:--------:|
| **CropBox ON** | 0 | 0% | 9.6s |
| **Full Page (baseline)** | 14 | 50% | ~120s |
| **Full Page (run 3)** | 13 | 36% | 120s |

CropBox kills extraction on scan-tier PDFs. The mechanism is clear:

1. **168 DPI scan** — the bitmap resolution is fixed at scan time. CropBox cannot
   increase it. The cropped area is ~2,479 × 710 pixels of blurry monochrome bitmap.
2. **Context loss** — the BOM region is only 8.3% of the total page area
   (43% × 19%). The model loses the title block, schematic, and other contextual
   cues that help it recognize the region as a BOM table.
3. **No escape route** — with CropBox applied, the `noBomReason` escape is
   removed (#82 P1 fix). The model can't say "wrong page type." But it also
   can't read the bitmap. Result: empty items array.

The app's degenerate-crop retry (line 11787) already handles this correctly:
CropBox → 0 items → retry full page → success. But this wastes a CF call
(~10s + $0.02 in API cost) on every scan-tier extraction.

### 2. Full-Page Accuracy: Non-Deterministic, ~36–50%

Between the baseline (50%) and this run (36%), accuracy varies by **14 percentage
points**. The error patterns differ significantly between runs:

| Item | Baseline Error | Run 3 Error | Stable? |
|------|---------------|-------------|:-------:|
| 1 | 1→L | 1→L | Yes — same |
| 3 | 3→0 | 3→0 | Yes — same |
| 5 | 3→0 | 3→5 | **No** — different digit |
| 6 | (correct) | leading "30" truncated | **No** — regressed |
| 8 | X→1, 6→S | W→M, 6→S | **No** — 6→S consistent, rest differs |
| 8c | Y→1, 6→S | MISSING entirely | **No** |
| 12 | J25PK | P25R- | **No** — completely different misread |
| 13 | J40PK | P40R- | **No** — completely different misread |

**6 items are consistently correct** across both runs: SCE-14P13AL, 3214259,
0807012, HS-CG2, SECM25G, SECM40G. These are items with distinct, simple
glyph shapes that survive 168 DPI monochrome rendering.

**2 items have consistent errors** (same wrong character each time): item 1
(1→L), item 3 (3→0). These are systematic misreads of ambiguous glyphs.

**6 items are non-deterministic** — different errors each run. The model is
reading the same blurry bitmap but arriving at different interpretations of
ambiguous glyphs. Voting (#114) would NOT fix this because the variance is
too high — you'd need 5+ runs at ~120s each to establish a consensus, and
the cost ($0.50+) approaches the Excel oracle's zero-API cost.

### 3. Error Classification

| Class | Count | Items | Character |
|-------|:-----:|-------|-----------|
| **Consistent correct** | 6 | 2,4,7,9,10,11 | Clear, distinctive glyphs |
| **Consistent wrong** | 2 | 1,3 | 1→L, 3→0 (ambiguous on monochrome) |
| **Non-deterministic** | 6 | 5,6,8,8c,12,13 | Different error each run |

The non-deterministic items are the ones that would theoretically benefit from
voting. But with only 36–50% per-item accuracy on these items, you'd need
majority agreement across 3+ independent runs where the model reads the same
ambiguous glyph differently each time. The expected accuracy gain from
3-way voting is marginal (~5–10%) and costs 3× the extraction fee.

### 4. The Excel Oracle Alternative (#85)

For scan-tier projects like PRJ402119, the user almost certainly has the
original BOM data in a spreadsheet, CAD export, or ERP system. The Excel
oracle path would:

1. Accept a user-uploaded BOM file (Excel, CSV) as ground truth
2. Map it against the drawing's extracted items
3. Achieve ~100% accuracy with zero API cost
4. Skip the entire AI extraction pipeline for this tier

Cost comparison:

| Approach | Accuracy | API cost | Latency | User effort |
|----------|:--------:|:--------:|:-------:|:-----------:|
| Full page (1 run) | 36–50% | ~$0.20 | 120s | Review + correct 7+ items |
| Voting (3 runs) | ~50–60%* | ~$0.60 | 360s | Review + correct 5+ items |
| Voting (5 runs) | ~55–65%* | ~$1.00 | 600s | Review + correct 4+ items |
| **Excel oracle** | **~100%** | **$0** | **<5s** | **Upload file** |

*Voting accuracy estimates assume independent errors, which is optimistic —
the consistent-wrong items (1→L, 3→0) will be wrong in EVERY run.

---

## Conclusions

### Question Answered

> Does high-DPI CropBox MATERIALLY improve scan-tier reading?

**No. CropBox DESTROYS scan-tier reading** — 0 items vs 13-14 on full page.
PRJ402119 is floor-limited by its 168 DPI monochrome scan quality. CropBox
reduces the visible area without increasing resolution, and removes the
contextual cues the model needs to recognize the BOM structure.

### Path Decision

| Path | Verdict | Reason |
|------|---------|--------|
| CropBox improvement | ✗ REJECTED | 0 items on scan-tier. Counterproductive. |
| Voting (#114) | ✗ NOT WORTH IT for scans | 3–5× cost for marginal gain. Non-deterministic errors won't converge. |
| **Excel oracle (#85)** | **✓ CORRECT PATH** | Zero API cost, ~100% accuracy, user has the data |

### CropBox Tier Matrix (updated understanding)

| Input Tier | CropBox Effect | Recommended Path |
|------------|---------------|------------------|
| Text-layer (vector PDF) | ✓ Focuses model on BOM region | CropBox + pdf-native |
| Vector-stroke (CAD PDF) | ✓ Same as text-layer | CropBox + pdf-native |
| Bitmap (high DPI scan, >300 DPI) | ? Untested — may help | Test needed |
| **Scan (monochrome, ≤200 DPI)** | **✗ DESTROYS extraction** | **Full page only; Excel oracle preferred** |

### Immediate Optimization Available

The degenerate-crop retry (line 11787) already recovers from CropBox failure
on scans, but wastes ~10s + $0.02 on the doomed CropBox attempt. A tier-aware
gate that skips CropBox when `pdfQuality.isMonochrome && estimatedDpi < 200`
would save that cost on every scan-tier extraction.

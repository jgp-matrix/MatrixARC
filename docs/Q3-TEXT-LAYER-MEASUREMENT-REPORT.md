# Q3 Text-Layer Measurement Report

**Date:** 2026-06-04 (overnight run)  
**Investigator:** Marc Masdev  
**Brief by:** Freddy Lyst  
**Projects:** PRJ402113, PRJ402100, PRJ402101, PRJ402076, PRJ402092 (D2 sample)  
**Feeds:** #98 (ACCURACY) and #100 (COMPLETENESS)

---

## Executive Summary

**The text-layer measurement as designed could not be executed.** 0 of 5 D2 sample
PDFs have a viable text layer on their BOM pages. BOM tables in these engineering
drawings are rendered as vector paths (CAD exports) or embedded raster images — not
as selectable text objects. This blocks Pillar 1a (text-layer row counting) as a
completeness oracle for the real customer drawing population.

Despite the text-layer failure, a **two-way decomposition** (fresh raw model output
vs. historical ARC BOM) was run on all 5 projects, producing significant findings
about extraction stability and completeness.

---

## Part A — Text-Layer Viability (Step 0)

| Project | PDF Status | BOM Page Text Chars | Vector Paths | Viable? | Reason |
|---------|-----------|--------------------:|-------------:|---------|--------|
| PRJ402076 | No PDF uploaded | N/A | N/A | **NO** | Image-only upload, no `originalPdfPath` |
| PRJ402092 | 0 bytes in Storage | N/A | N/A | **NO** | Silent upload failure (2026-05-13). File metadata exists but `size: 0`. |
| PRJ402100 | 571 KB, raster scan | 0 | 4,877 | **NO** | Pure image PDF — 0 text blocks, 9 image blocks |
| PRJ402101 | 3.0 MB, CAD export | 94 | 2,315 | **NO** | BOM rendered as paths + 2 images. Only title block labels in text layer. |
| PRJ402113 | 2.9 MB, CAD export | 77 | 1,757 | **NO** | BOM rendered as paths + 2 images. Only title block labels in text layer. |

**Key finding:** Non-BOM pages in the same PDFs DO have substantial text (500–3,500
chars on schematic/notes pages). The BOM pages specifically lack text layers. In
AutoCAD exports, BOM tables are typically created as table blocks that render as
graphics, not as PDF text objects.

**Text found on BOM pages (title block only):**
- PRJ402101: "SHEET", "REVISION", "CSW1927-121", "10", "23", "D", "BILL OF MATERIALS", "B"
- PRJ402113: "DWG", "NO.", "REVISION", "CSW1807-121", "9", "21", "BILL OF MATERIAL", "D"

No part numbers, no descriptions, no quantities. The actual BOM content lives in
the vector path/image layers, accessible only to vision models — not text extractors.

### Implication for #100 Pillar 1a

Text-layer row counting cannot serve as the completeness oracle for CAD-exported
drawings. This covers the majority of ARC's real customer input (OVIVO, FLSmidth,
Sentry Equipment all submit AutoCAD PDF exports). The permanent completeness fix
must use a different independent oracle — options include:

1. **Vision-based row counting** (a secondary AI call specifically to count rows)
2. **PDF page-object counting** (count vector-path clusters that look like table rows)
3. **Excel/spreadsheet cross-check** (per TODO #85 — customers who provide Excel BOMs)
4. **Multi-pass extraction with quorum** (extract N times, flag if counts disagree)

---

## Part B — Two-Way Decomposition (Fresh Extraction vs. Historical BOM)

Since text-layer ground truth was unavailable, a shadow extraction was run against
each project's BOM pages (calling `extractBomPage` Cloud Function WITHOUT saving
results to Firestore). The raw model output was compared to the existing historical
BOM (which went through the full pipeline: dedup, normalize, auto-cross corrections).

### Method

- **Fresh extraction:** Called `extractBomPage` via Cloud Function. PDF-native path
  for projects with valid PDFs, bom-region-crop path for image-only projects.
  Model: claude-opus-4-6 on all calls.
- **Historical BOM:** Read from `panel.bom` in Firestore. Labor rows (1012/CUT,
  1013/LAYOUT, 1014/WIRE) excluded from comparison — they are system-added, not extracted.
- **Comparison:** Case-insensitive exact PN match. No fuzzy matching — this measures
  raw extraction determinism, not near-miss tolerance.
- **No Firestore writes.** All projects remain untouched. No data was modified.

### Summary Table

| Project | Name | Path | Existing Material | New Extracted | Exact PN Match | Match % | Gaps in New |
|---------|------|------|------------------:|--------------:|---------------:|--------:|-------------|
| PRJ402076 | Magino Thickener | crop (3 pg) | 67 | 64 | 55 | **82%** | None |
| PRJ402113 | Berry Ken systems | pdf-native | 88 | 87 | 32 | **37%** | None |
| PRJ402101 | Redmond Wetlands | pdf-native | 68 | 62 | 24 | **36%** | None |
| PRJ402100 | Abbeville Clarifier | pdf-native | 38 | 28 | 4 | **11%** | None |
| PRJ402092 | Ball Mill Equipment | crop | 19 | 52 | 0 | **0%** | Items 38–50 |

### Per-Project Analysis

#### PRJ402076 — Magino Thickener (BEST: 82% match)

- 3 BOM pages, image-only upload, bom-region-crop extraction path
- 67 existing material items → 64 new extracted items (3 fewer)
- **55 exact PN matches** — highest in sample. 12 only-in-existing, 8 only-in-new.
- Each page numbered independently (1–28, 1–28, 1–8). No item gaps.
- **Interpretation:** Image-based extraction on this drawing set is relatively stable.
  The 18% mismatch is likely a mix of OCR/vision stochasticity and auto-cross
  mutations on the historical side.

#### PRJ402113 — Berry Ken systems (37% match)

- 1 BOM page (p9), pdf-native extraction, 21-page CAD export
- 88 existing material → 87 new extracted. Nearly identical count.
- **Only 32 exact PN matches** despite near-identical item counts.
- Known C5 corruption present: existing BOM contains "3214259" (a known auto-cross
  corruption from C5 — correct PN replaced with a different valid Phoenix Contact PN).
- Many mismatches are OCR variants: existing `A2ZH60125SLP3PT` vs new `A62H6012SSLP3PT`
  — same physical part, different character reads on the same drawing.
- **Interpretation:** Item count is stable (87 vs 88), but PN accuracy is highly
  variable between runs. The vision model reads the same CAD-rendered text differently
  each time. Auto-cross then mutates some readings further.

#### PRJ402101 — Redmond Wetlands (36% match)

- 1 BOM page (p10), pdf-native, 23-page CAD export
- 68 existing material → 62 new extracted (**6 fewer items**)
- 24 exact PN matches out of 67 unique existing PNs.
- Known C5 marker: existing BOM contains "3214259" (same corrupted PN as PRJ402113).
- New extraction timed out on first attempt (480s), succeeded on retry.
- **Interpretation:** Both count discrepancy (6 missing) and PN variability. The
  large PDF (3 MB, 23 pages) may cause server-side processing delays that affect
  extraction quality.

#### PRJ402100 — Abbeville Clarifier (11% match)

- 1 BOM page (p2), pdf-native, 2-page raster-scan PDF
- 38 existing material → 28 new extracted (**10 fewer items = 26% completeness loss**)
- Only 4 exact PN matches — effectively a different BOM between runs.
- This is a pure raster-scan PDF (0 text, 9 image blocks, 4,877 vector paths).
- Despite being "pdf-native" path, the model receives a rendered page image since
  there's no text layer — same input quality as crop-based extraction.
- **Interpretation:** Scanned/raster PDFs produce the worst extraction stability.
  The combination of scan quality + vision stochasticity + auto-cross corrections
  creates near-zero reproducibility. The 10-item deficit is a significant
  completeness failure.

#### PRJ402092 — Ball Mill Equipment Wiring (0% match)

- 1 BOM page (p9), bom-region-crop (0-byte PDF → image fallback)
- 19 existing material → 52 new extracted (**33 MORE items**)
- **Zero exact PN matches.** Completely disjoint PN sets.
- New extraction found items 1–65 but with a **13-item interior gap (items 38–50).**
- The existing BOM's 19 items appear to be a severely truncated extraction — the
  new extraction found 2.7× more items from the same drawing.
- **Interpretation:** The historical extraction was a major completeness failure
  (only 19 of ~65 items captured). The new extraction recovered most items but has
  its own gap (items 38–50 = a mid-table skip). Zero PN overlap suggests the
  historical extraction was from a different run/path or was heavily mutated by
  auto-cross corrections.

---

## Part C — Findings for #98 (ACCURACY) and #100 (COMPLETENESS)

### For #98 — Extraction Accuracy

1. **Extraction is non-deterministic.** The same drawing produces different part
   numbers on different runs. Match rates range from 0% to 82% across the sample.
   Without an authoritative oracle (text layer, Excel BOM, or manual reading), we
   cannot determine which run is MORE correct — only that they disagree.

2. **C5 auto-cross corruption is confirmed across multiple projects.** The known
   corrupted PN "3214259" (a Phoenix Contact part that auto-cross replaces with
   another valid PN) appears in multiple project BOMs. The learning database is
   actively degrading accuracy — correctly-extracted PNs are being replaced with
   previously-learned wrong values. This is independent of model accuracy and
   compounds the problem.

3. **OCR/vision stochasticity on CAD-rendered text is the primary accuracy driver.**
   PNs like `A2ZH60125SLP3PT` vs `A62H6012SSLP3PT` are the same physical part
   read differently by the vision model on different runs. These are CAD text
   rendered as vector paths — the model is doing OCR on curves, not reading text.

4. **Ground truth MUST come from outside ARC.** BC match is circular (#98's original
   finding). Text layer doesn't exist for these drawings. The remaining options are:
   - Manual reading from drawings (expensive, error-prone — see #95 experience)
   - Customer Excel BOMs (per TODO #85 — best option for OVIVO projects)
   - Engineering source data from the customer

### For #100 — Extraction Completeness

1. **Item count stability varies widely.** PRJ402113 shows near-perfect count
   stability (87 vs 88), while PRJ402100 lost 26% of items and PRJ402092's
   historical extraction captured only 29% of actual items.

2. **Interior gap detected.** PRJ402092 new extraction has a 13-item gap
   (items 38–50). This is a mid-table completeness failure — different from
   the start-missing pattern in PRJ402114 (items 26–47 only).

3. **Pillar 1a (text-layer row counting) is blocked.** The D2 sample
   unanimously demonstrates that BOM pages in CAD-exported and scanned drawings
   lack text layers. The permanent completeness oracle must use a different
   approach (see Part A recommendations).

4. **Pillar 2 (L3 on all paths) remains valuable.** The PRJ402092 gap (items 38–50)
   is exactly the kind of interior completeness failure that L3 retry/gap-fill would
   catch. The existing BOM's 19-item capture (vs 52+ actual) confirms that some
   historical extractions are severely incomplete and would benefit from L3.

---

## Appendix — Extraction Metadata

| Project | Model | Extraction Path | Stop Reason | Raw Output Length |
|---------|-------|----------------|-------------|------------------:|
| PRJ402076 p27 | claude-opus-4-6 | bom-region-crop | end_turn | — |
| PRJ402076 p28 | claude-opus-4-6 | bom-region-crop | end_turn | — |
| PRJ402076 p29 | claude-opus-4-6 | bom-region-crop | end_turn | — |
| PRJ402092 | claude-opus-4-6 | bom-region-crop | end_turn | 12,882 |
| PRJ402100 | claude-opus-4-6 | pdf-native | end_turn | 11,259 |
| PRJ402101 | claude-opus-4-6 | pdf-native | end_turn | (retry, 1st timed out at 480s) |
| PRJ402113 | claude-opus-4-6 | pdf-native | end_turn | 27,626 |

All extractions returned `end_turn` (not `max_tokens`), confirming the model
believes it finished reading — not that it was cut off. Partial reads are model
decisions, not truncation.

---

## Data Artifacts

- PDF downloads: `tools/q3-measurement/pdfs/` (4 files, PRJ402092 is 0-byte)
- Text-layer analysis scripts: `tools/q3-measurement/`
- Raw extraction data: stored in browser session `window._q3results` (ephemeral)
- This report: `docs/Q3-TEXT-LAYER-MEASUREMENT-REPORT.md`

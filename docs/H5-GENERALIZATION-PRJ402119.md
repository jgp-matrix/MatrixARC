# H5 Generalization Test — PRJ402119 (Marc's independent run)

**Author:** Marc Masdev
**Date:** 2026-06-10
**Version:** v1.20.113
**Mode:** READ-ONLY — no saves, no project mutation. Coach ran the same test independently; compare reports.

---

## Executive Summary

**H5 generalizes. PRJ402119 — the worst-case problem child — scores 100% with
its production region** (the stored user-drawn region): 13/13 items, all
quantities, plus the item-8 cover PN. Even the sloppy aiBomRegion scores 12/13,
and its single failure is an honest "?" placeholder on a row the region's top
edge physically clips — not a misread.

**No PN on this drawing is genuinely ambiguous at high res.** Reading the
source at 500 DPI myself, every catalog number is crisp. There is no floor on
this project — the old 36–50% was entirely a send-resolution artifact.

| Run | Region | Tiles | DPI | Items | Catalog PNs correct |
|-----|--------|:-----:|:---:|:-----:|:-------------------:|
| A — aiBomRegion | {.03,.72,.62,.22} | 2 | 687 | 13 | **12/13** (item 1 = "?", row clipped by region top) |
| B1 — my tight (over-tight) | bottom 0.85 | 1 | 633 | 11 | 11/11 read, 2 rows cut by crop |
| B2 — tighter v2 | bottom 0.867 | 1 | 608 | 12 | 12/12 read, 1 row cut by crop |
| **B3 — tight, correct bounds** | {.055,.672,.385,.223} | 1 | 608 | 13 | **14/14 incl. cover (100%)** |
| **P — stored USER region (production)** | {.068,.691,.434,.192} | 2 | 980 | 13 | **14/14 incl. cover (100%)** |

---

## Ground Truth (established independently from the source PDF)

Rendered the BOM area of RSW1596-126.pdf page 3 at 500 DPI via pdf.js and
read it visually. 13 BOM rows, one with a paired cover PN:

| # | Qty | Catalog | Make |
|---|-----|---------|------|
| 1 | 1 | SCE-1412PCW | SCE |
| 2 | 1 | SCE-14P12AL | SCE |
| 3 | 8 | 3038338 | Phoenix Contact |
| 4 | 20 | 3214259 | Phoenix Contact |
| 5 | 4 | 3214314 | Phoenix Contact |
| 6 | 7 | 3022276 | Phoenix Contact |
| 7 | A/R | 0807012 | Phoenix Contact |
| 8 | A/R | TYD15X3WPW6 (+ cover TYD2CW6) | Thomas & Betts by ABB |
| 9 | 3 | HS-CG2 | Duct-O-Wire |
| 10 | 5 | SECM25G | Hubbell |
| 11 | 1 | SECM40G | Hubbell |
| 12 | A/R | LNM25BPK100 | Hubbell |
| 13 | A/R | LNM40BPK100 | Hubbell |

**Ambiguous-at-high-res PNs: NONE.** Every glyph is unambiguous at 500 DPI.

### ⚠ Ground-truth correction vs #113's answer key

Items 1 and 2 differ from the key used in #113 (docs/113-CROPBOX-SCAN-PROOF.md):

| # | #113 key | Actual on current source | Verified |
|---|----------|--------------------------|----------|
| 1 | SCE-141**3**PCW | SCE-141**2**PCW | Zoomed — digit is unambiguously 2 |
| 2 | SCE-14P1**3**AL | SCE-14P1**2**AL | Zoomed — digit is unambiguously 2 |

(Consistent with the 15.40"×14.68" enclosure description — a 14×12 nominal
box.) Both H5 runs read "2", agreeing with my zoom. If Coach's independent
key also reads "2", #113's key was wrong on these two digits.

### Source-quality note (honesty)

#113 described this source as a 168 DPI monochrome fax-scan. The current PDF
(uploaded ~June 5, path `1781021520169_lc3k72_RSW1596-126.pdf`) renders
**crisp** at 500 DPI in pdf.js — clean anti-aliased text, not fax garbage.
Tier classifier: `vector-stroke` (no text layer). Whether #113 tested an
earlier worse upload or the CF's `assessPdfPageQuality` mis-graded this file,
I can't fully resolve read-only. What's empirically solid: full-page sends of
THIS project scored 36–50% (#113), and H5 region-targeted sends score
92–100% — the delta is send-resolution, not source quality.

---

## Run Details

All runs: production `extractBomPage()` (v1.20.113), tier=`vector-stroke`,
path=`hi-dpi-tiles`, page 11"×8.5" landscape. Elapsed 24–39s per run —
**5–8× faster than PRJ402101's 159s** (smaller payload, fewer items).

### Run A — aiBomRegion (the "auto" region)

`{x:0.03, y:0.72, w:0.62, h:0.22}` → 2 tiles @ 687 DPI, 38.8s, 13 items.

- Items 2–13: **all correct**, including quantities.
- Item 1: returned as PN `"?"` qty 0 — the placeholder convention. The
  aiBomRegion's top edge (y=0.72) cuts the table header and most of item 1's
  row (table starts at y≈0.685). The model saw a clipped row and **flagged
  it rather than hallucinating** — correct behavior, and the red-row UI
  convention surfaces it to the user.
- **Phantoms: ZERO.** The region's extra area (enclosure drawing above,
  "NOTE:" text right of the table) contributed no junk rows.

### Runs B1/B2 — my tight regions, drawn too tight (instructive failures)

My first two hand-drawn regions clipped the table bottom (my screen-coords
estimate of the table's extent was wrong). B1 lost rows 12–13; B2 lost row
13. **Everything inside the crop was read 100% correctly in both.** The
model does not invent rows it can't see — clipped rows simply vanish from
output (B1/B2) or come back as "?" if partially visible (Run A).

### Run B3 — tight region, correct bounds

`{x:0.055, y:0.672, w:0.385, h:0.223}` → 1 tile @ 608 DPI, 23.6s.
**13/13 items, 14/14 PNs (cover TYD2CW6 captured in additionalPartNumbers),
13/13 quantities. 100%.**

### Run P — the stored user region (what production actually uses)

PRJ402119's page already has a user-drawn region; production
`resolveBomRegion` picks it over aiBomRegion. `{x:0.068, y:0.691, w:0.434,
h:0.192}` → 2 tiles @ 980 DPI, 29.5s. **13/13 items, 14/14 PNs, all
quantities. 100%.**

---

## The Two Questions

### 1. Does H5 generalize?

**Yes — emphatically.** The worst-case project goes from 36–50% (#113
full-page sends; ~75%-wrong on the original ARC BOM) to **100% under
production configuration** (user region → Run P). Every #113 error class is
gone: 1→L, 3→0 substitutions, the TYD/LNM restructurings, the missing cover
PN — all read correctly, plus quantities. Combined with PRJ402101's 54/54,
H5 is now 2-for-2 at ~100% on the two worst vision-mode projects.

### 2. Does a tight region fix both resolution AND phantoms in one move?

**On this project the phantom half of the question never materialized** —
even the sloppy aiBomRegion produced zero phantoms, because the extra area
it includes (enclosure outline, a text note) contains nothing row-shaped.
The PRJ402101 phantom problem needs schematic-like tabular content inside
the region; that's project-geometry-dependent, not universal.

What region quality DID determine here is **edge coverage**:

- aiBomRegion clipped the table TOP → item 1 degraded to "?" (12/13).
- My first two tight regions clipped the BOTTOM → rows silently absent
  (11/13, 12/13).
- Correct-bounds regions (B3, P) → 100%.

DPI did NOT differentiate: every run was ≥608 DPI (letter-size page = small
region = high DPI even with loose bounds). Accuracy tracked **region
completeness**, not DPI, on this drawing.

**Revised one-move claim:** a tight region buys phantom-exclusion only when
the excluded area contains table-like content (PRJ402101 yes, PRJ402119
moot). The universal requirement is *complete* coverage — a region that
clips a table edge silently costs whole rows. Tight AND complete is the
spec; "as tight as possible" alone is risky guidance.

---

## Recommendations surfaced by this test

1. **Region edge-clipping is the new dominant failure mode** for H5 — worth
   a follow-up: pad the resolved region by ~2% on all edges before
   rendering (cheap, recovers header/edge rows without meaningfully
   lowering DPI), and/or have the L3 verification compare extracted
   itemNo range against detectedLineCount when a region was applied.
2. **aiBomRegion quality matters more under H5** than before (it used to be
   a soft hint for a JPEG crop; now it bounds what the model ever sees).
   The Phase 1c flow already pushes users to draw regions on vision-mode
   drawings — Run P shows a user region is sufficient for 100%.
3. #113's ground-truth items 1–2 should be corrected if any future scoring
   reuses that key (1413→1412, 14P13→14P12).

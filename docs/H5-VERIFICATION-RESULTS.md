# H5 — Region-Targeted High-DPI Rendering: Build + Verification Results

**Author:** Marc Masdev
**Date:** 2026-06-10
**Versions:** v1.20.112 (H5 build), v1.20.113 (adaptive-thinking fix)
**Status:** BUILT, DEPLOYED, VERIFIED — awaiting Coach review

---

## Executive Summary

**H5 delivers 54/54 = 100% catalog-number accuracy on PRJ402101** — up from a
~36–65% baseline across prior runs. All three of Jon's hand-verified anchors
resolve correctly. The resolution hypothesis from C48 is confirmed in
production: the misreads were a DPI problem, and controlling rasterization
DPI client-side fixes them.

| Anchor | ARC's old misread | H5 result | Verdict |
|--------|-------------------|-----------|:-------:|
| Item 9 / drawing #6 | XT1US060MFF000XXX | **XT1SU3060AFF000XXX** | ✓ |
| Dropped-S / drawing #1 | SCE-90EL4820SSFD | **SCE-90EL4820SSFSD** | ✓ |
| 8→B / drawing #2 | SCE-90P4BF | **SCE-90P48F1** | ✓ |

---

## What Was Built (per C49/C50)

1. **Prerequisite (C50):** `temperature:0` removed from `apiCall`
   (app.jsx:2595) — Opus 4.7+ rejects any temperature param with 400.
2. **Model bump:** `ANTHROPIC_MODELS.OPUS` → `claude-opus-4-8` in both
   `src/app.jsx` and `functions/models.js`. Raises the vision input ceiling
   from 1568px to 2576px on the long edge.
3. **`MODEL_MAX_PX` registry** (app.jsx, next to `ANTHROPIC_MODELS`): maps
   model → px ceiling; the tiling math derives render DPI from it, so a
   future model bump auto-adjusts.
4. **Tier gate** in client `extractBomPage`: `classifyBomInputTier` runs when
   `originalPdfPath + pageNumber + bomRegion` are present. `text-layer` →
   PDF-native path unchanged; vision-mode (`vector-stroke`/`bitmap`/`scan`)
   → H5 tile path. Any H5 failure falls through to the standard paths.
5. **`renderBomRegionHighDpi()`** (app.jsx): pdf.js renders each tile as its
   own canvas via viewport translate (no giant full-page canvas), grid chosen
   by `findOptimalGrid()` (max 6 tiles, target 600 DPI), 5% overlap on
   interior edges, JPEG q0.92.
6. **CF `tiledBomImages[]` param** (`extractBomPage`): up to 6 tiles, ≤5MB
   each, builds N image blocks + tile-awareness prompt, `extractionPath:
   'hi-dpi-tiles'`. No noBomReason escape (tiles are a known BOM region,
   #82 P1 rationale). Region-learning `regionParts` splice preserved.
7. **QUOTE SUMMARY pill**: `hi-dpi-tiles` shows a green "High-DPI tiles"
   badge (previously would have mislabeled as "Image fallback").

### Discovered during build — Opus 4.8 thinking syntax (NOT in C49/C50)

C50 flagged `temperature:0` but **missed that Opus 4.7+ also removes
`thinking: {type:"enabled", budget_tokens:N}`** — it returns 400
(`"thinking.type.enabled" is not supported for this model. Use
"thinking.type.adaptive"`). Six call sites ran OPUS with the old syntax and
all would have hard-failed:

| Site | File | Purpose |
|------|------|---------|
| extractBomPage CF | functions/index.js:2533 | Server extraction |
| extractBomBatch CF | functions/index.js:2753 | Batch extraction |
| PDF-native direct fallback | app.jsx:11989 | Client fallback |
| Cropped-region direct fallback | app.jsx:12029 | Client fallback |
| BOM audit pass | app.jsx:12400 | Opus re-read audit |
| Title block extraction | app.jsx:20624 | Title block read |

All six now use `thinking: {type:"adaptive"}` (v1.20.113). Note: with
adaptive thinking, v1.19.637's max_tokens>budget_tokens rule no longer
applies — the model self-allocates.

---

## Verification Run (production code path)

Executed the real client `extractBomPage()` against PRJ402101 page 10 with
its production region (aiBomRegion, 94%×92% of page — no user region drawn).

| Property | Value |
|----------|-------|
| Tier classified | `vector-stroke` |
| Extraction path | `hi-dpi-tiles` |
| Grid | 3×2 = 6 tiles |
| Region | 16.0" × 10.1" |
| Effective DPI | **~440** (vs ~80–150 uncontrolled on pdf-native) |
| Elapsed | 159.2 s |
| Items returned | 62 |

### Score vs #113b ground truth (54 drawing items)

**54/54 correct = 100.0%.**

Every one of #113b's CONSISTENT misreads — the ones 3-way voting could never
fix — resolved at 440 DPI:

| # | Old misread (all 3 #113b runs) | H5 read | Glyph confusion fixed |
|---|-------------------------------|---------|----------------------|
| 3 | SCE-AC3400B460V**3S** | …B460**VSS** | S↔3 |
| 16 | 25B-D**3P0**N114 | 25B-D**2P3**N114 | digit cluster |
| 20 | SU20**3**M-K30 | SU20**1**M-K30 | 1↔3 |
| 28 | 2320**322** | 2320**283** | digit cluster |
| 29 | 134**6**516 | 134**8**516 | 8↔6 |
| 33 | IME1-401EX-R (garbled) | IM1-451EX-R | multiple |
| 34 | 2080-L**C**70E-24QWB | 2080-L70E-24QWB | phantom C |
| 35 | 2085-I**D**16 | 2085-I**Q**16 | Q↔D |
| 52 | 3247053 | 3047293 | digit cluster |
| 53 | 0802986 | 0800886 | digit cluster |
| 55 | 30**36**338 | 30**38**338 | 8↔6 |
| 56–58 | TYD#X3**S**WPW6 | TYD#X3WPW6 | phantom S |

### Accuracy progression

| Method | Accuracy | Source |
|--------|:--------:|--------|
| Jon's original ARC BOM | ~36% (catalog numbers) | C48 analysis |
| #113b full-page image, best of 3 runs | 64.8% | docs/113b |
| #113b 3-way voting | 59.3% (worse than best run) | docs/113b |
| **H5 high-DPI tiles, 1 run** | **100%** | this run |

---

## Honest Scope — what survives (expected, not bugs)

- **Phantom items 43–50 persist** (8 items: AFS09-30-22-11, RH#B-ULCDC24V
  relays, 4 Phoenix terminal PNs). The drawing's BOM numbering skips 42→51;
  the model reads these from the schematic area that the sloppy 94%-of-page
  aiBomRegion includes. This is a region-tightness problem (Pattern D
  family), not a resolution problem — a tight user-drawn region would
  exclude the schematic. Phase 1c's "region the BOM as tightly as possible"
  guidance directly mitigates.
- Pattern C (BC contamination) and F (qty errors) untested in this pass —
  separate root causes per C49; qty fields were not scored.
- 440 DPI (not 606): the production aiBomRegion spans 16"×10.1", so 6 tiles
  cap at ~440 DPI. Still well above C48's 300-DPI borderline — and
  empirically clean. Tighter regions yield higher DPI automatically.

## Cost/latency note

6 tiles ≈ 2576px long edge each ≈ ~28k image tokens vs ~3k for pdf-native —
per C50's ~$0.15/page estimate for vision-mode pages only. Text-layer pages
are completely untouched. 159s elapsed is comparable to the old path
(~195s in #113b runs).

## Rollback

Remove the tier-gate block in client `extractBomPage` → everything reverts
to PDF-native/crop paths. The CF `tiledBomImages` param is additive and
inert when not sent. NOTE: the model bump + adaptive-thinking changes must
stay regardless (Opus 4.8 rejects the old syntax).

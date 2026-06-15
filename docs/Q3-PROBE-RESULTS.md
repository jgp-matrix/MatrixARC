# Q3 Follow-Up Probes — Storage Census + Determinism Test

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Brief by:** Freddy Lyst  
**Feeds:** #98 (ACCURACY) and #100 (COMPLETENESS)

---

## Probe 1 — Storage Integrity Census

### Question
How widespread are the source-PDF data-loss cases found during Q3 (PRJ402092 = 0-byte
PDF, PRJ402076 = no PDF path)?

### Method
Read-only census of all projects with panel BOM data. For each project:
- Check if BOM pages have `originalPdfPath`
- For those that do, verify Storage file `size > 0` via `getMetadata()`

### Results

**Total projects with BOM-typed pages: 26**

| Category | Count | % of Total | Description |
|----------|------:|----------:|-------------|
| (a) No originalPdfPath | 9 | 35% | BOM pages exist, uploaded as images only, no source PDF retained |
| (b) 0-byte PDF in Storage | 3 | 12% | originalPdfPath exists but file is empty — silent upload failure |
| (c) Healthy PDF | 14 | 54% | PDF exists and has non-zero size |

**46% of projects (12 of 26) have degraded or missing source PDFs.**

### Category (a) — No originalPdfPath (9 projects)

These projects were uploaded before PDF retention was implemented, or were uploaded
as image-only (e.g., photos of drawings). All have `storageUrl` on their pages
(page images exist) but no source PDF.

| Project | Name | BOM Pages | BOM Items |
|---------|------|----------:|----------:|
| PRJ402063 | Lebanon Clarifier | 1 | 52 |
| PRJ402065 | Albion Idaho Water | 1 | 67 |
| PRJ402066 | Parham Landing Thickener | 1 | 54 |
| PRJ402068 | Brush Creek | 2 | 57 |
| PRJ402069 | Natchitoches Thickener | 1 | 46 |
| PRJ402076 | Magino Thickener | 3 | 70 |
| PRJ402079 | Golden Chest Thickener | 4 | 57 |
| PRJ402083 | Chandler SBR | 1 | 44 |
| PRJ402087 | LUMBERTON PLC | 1 | 43 |

These projects cannot use the pdf-native extraction path on re-extraction.
They are permanently limited to the image-based (bom-region-crop) path.

### Category (b) — 0-byte PDF in Storage (3 projects)

Silent upload failures. The `originalPdfPath` is set on every page in the project,
but the Storage file has `size: 0`. These projects APPEAR to have a PDF but
extraction would fail on the pdf-native path.

| Project | Name | Pages | BOM Items | Upload Date | PDF Filename |
|---------|------|------:|----------:|-------------|--------------|
| PRJ402089 | Lemay Pump Station | 21 | 87 | 2026-05-07 | CSW1807-121_Rev.D.pdf |
| PRJ402091 | Berkely Clarifier | 9 | 55 | 2026-05-06 | CSW1892-121.dwg.pdf |
| PRJ402092 | Ball Mill Equipment Wiring | 9 | 22 | 2026-05-13 | 400068437.pdf |

**Risk:** These projects' `originalPdfPath` will cause `extractBomPageViaServer`
to attempt the pdf-native path, which will fail. The client fallback chain should
recover via image path, but this is untested for 0-byte files specifically. If the
Cloud Function receives a 0-byte PDF, the error handling path determines whether
the user sees a failure or a silent degraded extraction.

**Note:** PRJ402089 uses the same drawing number as PRJ402113 (CSW1807-121 Rev D)
but has a different upload (different timestamp, different doc ID). PRJ402113's
upload succeeded (2.9 MB); PRJ402089's failed (0 bytes). Same drawing, different
upload sessions.

### Production Risk Assessment

- **Immediate risk:** The 3 zero-byte PDFs will cause extraction failures on
  re-extraction attempts. Users may not understand why re-extraction fails on
  projects that were previously extracted successfully (original extraction used
  images, not the PDF).
- **Silent risk:** There is no validation at upload time that verifies the PDF
  was actually written to Storage. `addFiles` sets `originalPdfPath` on the page
  metadata before (or without verifying) the upload completed.
- **Scale risk:** 12/26 = 46% of projects lack a usable source PDF. If the
  extraction pipeline is ever changed to require PDF-native input, nearly half
  of existing projects would break.

---

## Probe 2 — Fresh-to-Fresh Determinism (temp=0)

### Question
Given identical input today (same PDF, same page, same model, same code), does
`extractBomPage` produce the same output?

### Method
- Called `extractBomPage` Cloud Function 3 times each on:
  - **PRJ402113** (Berry Ken, CAD export, page 9 of 21-page PDF, pdf-native path)
  - **PRJ402100** (Abbeville Clarifier, raster scan, page 2 of 2-page PDF, pdf-native path)
- All calls: claude-opus-4-6, same Cloud Function, no feedback, no userNotes
- Compared raw model output across the 3 runs WITHIN each project
- No Firestore writes. No pipeline processing. Raw output only.

### Results — PRJ402113 (Berry Ken, CAD export)

| Metric | Run 0 | Run 1 | Run 2 |
|--------|------:|------:|------:|
| Items extracted | 87 | 86 | 86 |
| Unique PNs | 86 | 86 | 86 |

**Pairwise PN match (exact, case-insensitive):**

| Pair | Match | Match % | Only in A | Only in B |
|------|------:|--------:|----------:|----------:|
| r0 vs r1 | 41 | 31% | 45 | 45 |
| r0 vs r2 | 38 | 28% | 48 | 48 |
| r1 vs r2 | 43 | 33% | 43 | 43 |

**3-run consensus:**

| Category | Count | % of Total (168) |
|----------|------:|-----------------:|
| In ALL 3 runs | 32 | **19%** |
| In exactly 2 runs | 26 | 15% |
| In only 1 run | 110 | **65%** |

**19% consensus.** Of 168 unique part numbers seen across 3 runs, only 32 appear
in all three. 110 part numbers (65%) appear in a single run only — they are
one-off readings that would not reproduce.

Item COUNTS are stable (86-87), but the actual PNs are highly variable.

### Results — PRJ402100 (Abbeville, raster scan)

| Metric | Run 0 | Run 1 | Run 2 |
|--------|------:|------:|------:|
| Items extracted | 28 | 28 | 30 |
| Unique PNs | 20 | 19 | 19 |

**Pairwise PN match (exact, case-insensitive):**

| Pair | Match | Match % | Only in A | Only in B |
|------|------:|--------:|----------:|----------:|
| r0 vs r1 | 5 | 15% | 15 | 14 |
| r0 vs r2 | 4 | 11% | 16 | 15 |
| r1 vs r2 | 2 | 6% | 17 | 17 |

**3-run consensus:**

| Category | Count | % of Total (49) |
|----------|------:|----------------:|
| In ALL 3 runs | 2 | **4%** |
| In exactly 2 runs | 5 | 10% |
| In only 1 run | 42 | **86%** |

**4% consensus.** Only 2 part numbers out of 49 unique PNs appear in all 3 runs:
`350B-120-30` and `AF09-30-10-13`. Everything else is stochastic noise.

### Interpretation

**The extraction pipeline is fundamentally non-deterministic on these input types.**

The model produces a stable item COUNT (±2 items across runs) but reads
completely different part numbers each time. This is not a temperature artifact —
these calls are made to the same Cloud Function with no stochastic parameters
under user control.

The root cause is that the model is performing OCR on:
- **CAD exports:** text rendered as vector paths (curves, not glyphs)
- **Raster scans:** text rendered as pixels in a scanned image

In both cases, the "text" is an image the model interprets via vision, not a text
layer it reads deterministically. Vision-model OCR on ambiguous character shapes
(B/8, I/1, S/5, 0/O, 6/G) produces different readings on each pass.

**Raster scans are worse than CAD exports:** 4% vs 19% consensus. This matches
expectations — scan artifacts (skew, blur, compression) add noise on top of the
inherent glyph ambiguity.

### Implications

1. **For #98 (accuracy):** Measuring extraction accuracy by comparing two runs is
   meaningless — the runs don't agree with EACH OTHER, let alone with ground truth.
   Accuracy measurement requires an external oracle (Excel BOM, manual read,
   customer source data). The extraction system does not have a reliable PN output
   on these drawing types at this time.

2. **For #100 (completeness):** Item count is a viable completeness signal — counts
   are stable across runs (87/86/86 and 28/28/30). A count-based oracle (expected
   rows vs extracted rows) would reliably detect missing items even though the
   item contents vary. This supports count-based approaches like Pillar 1a
   (if a row-count oracle is available) or multi-pass quorum (extract N times,
   flag if counts disagree).

3. **For C5 (auto-cross):** The learning database is built on quicksand. Corrections
   learned from one extraction will not match the part numbers produced by the
   next extraction of the same drawing. Auto-cross may be actively harmful in
   this regime — it mutates unstable PNs toward previously-learned values that
   are themselves products of a stochastic process.

4. **For production reliability:** Users who re-extract a project will get a
   different BOM than the original extraction, even with no code or model changes.
   BC pricing lookups on the new PNs will fail at different rates than before.
   This is a fundamental reliability ceiling until either (a) the input quality
   improves (text-layer PDFs) or (b) a post-extraction verification/correction
   step is added.

---

## Combined Probe Summary

| Finding | Severity | Affects |
|---------|----------|---------|
| 46% of projects have degraded/missing source PDFs | HIGH | Re-extraction reliability, PDF-native path coverage |
| 3 projects have 0-byte PDFs (silent upload failure) | HIGH | Production — re-extraction will fail silently |
| No upload-time verification of Storage write success | MEDIUM | Data integrity — future uploads could silently fail |
| 4-19% PN consensus across 3 identical extraction runs | CRITICAL | #98 accuracy measurement, production BOM reliability |
| Item count is stable (±2) across runs | POSITIVE | #100 count-based completeness oracles are viable |
| Raster scans produce worse determinism than CAD exports | INFO | Prioritization — raster projects need extra validation |

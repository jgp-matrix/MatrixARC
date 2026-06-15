# Q3 Text-Layer Landscape Census

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Brief by:** Freddy Lyst  
**Constraint:** Customer drawing-export changes are NOT an option. All fixes must be ARC-side.

---

## Headlines

| Category | Projects | % of 26 |
|----------|:--------:|--------:|
| **Text-layer** (deterministic, 100% reproducible) | **7** | **27%** |
| **Vision-mode** (stochastic, 4–19% exact consensus) | **19** | **73%** |

Vision-mode breakdown:

| Sub-category | Count | Root Cause |
|--------------|:-----:|------------|
| BITMAP (BOM as embedded raster image) | 4 + 9 no-PDF + 3 zero-byte = **16** | Image quality ceiling. Voting / preprocessing / Excel oracle. |
| VECTOR-STROKE (BOM text as path geometry) | **3** | Character geometry is in the PDF. Higher-DPI render or geometry-aware extraction possible. |

---

## Full Project Table

### Text-Layer Projects (7) — Deterministic Extraction

| Project | Customer | Name | BOM Items | Mfr PNs in Text | Source Format |
|---------|----------|------|----------:|:----------------:|---------------|
| PRJ402096 | FLSmidth | Salares Norte Retort | 55 | 12 | FLS native PDF |
| PRJ402098 | Matrix Systems | Buyoff Disconnect Box | 15 | 15 (full BOM) | Matrix ECAD export |
| PRJ402094 | Neumann Construction | Materion | 19 | 6 | Matrix ECAD export |
| PRJ402093 | OVIVO | Carterville | 68 | 41 | CSW .dwg.pdf — WITH text |
| PRJ402111 | Rebuild-It | Secret Panel | 43 | 16 | Matrix ECAD export |
| PRJ402102 | Sentry Equipment | Load Cell Panel | 18 | 8 | Matrix ECAD export |
| PRJ402108 | Sentry Equipment | Secret Project | 46 | 16 | Matrix ECAD export |

**Observations:**
- 5 of 7 are **Matrix ECAD exports** (Matrix's own drawings, "PAGE Bill of Materials"
  header, structured table with Idx/Part Number/Qty/Description). These are produced by
  Matrix Systems' own design software and always include text layers.
- PRJ402096 is an **FLSmidth native PDF** (different format — ABB/Allen-Bradley part
  catalog structure, 7-digit PNs).
- PRJ402093 is the **surprise**: an OVIVO CSW-style `.dwg.pdf` that HAS a text layer
  with 41 manufacturer PNs. Not all OVIVO drawings lack text layers — this one
  (CSW1902-221) has full BOM content while CSW1807-121 and CSW1927-121 don't. The
  difference is likely an AutoCAD export setting ("SHX text as geometry" vs "SHX text
  as text") that varies by drawing or by engineer.

### Vision-Mode Projects — Healthy PDF (7)

| Project | Customer | Name | BOM Items | Root Cause | Text Chars | Vector Paths | Images |
|---------|----------|------|----------:|------------|:----------:|:------------:|:------:|
| PRJ402100 | Clearstream | Abbeville Clarifier | 38 | **BITMAP** | 0 | 4,877 | 9 |
| PRJ402113 | FLSmidth | Berry Ken systems | 88 | **BITMAP** | 77 | 1,757 | 2 |
| PRJ402101 | OVIVO | Redmond Wetlands | 68 | **BITMAP** | 94 | 2,315 | 2 |
| PRJ402118 | Royal A&C | Leamington Jct Boxes | 16 | **BITMAP** | 0 | 6,032 | 2 |
| PRJ402109 | OVIVO | S. Florida Trash Rake | 37 | **VECTOR-STROKE** | 229 | 2,353 | 1 |
| PRJ402117 | OVIVO | Hollywood Detritor CP | 15 | **VECTOR-STROKE** | 384 | 5,906 | 1 |
| PRJ402119 | OVIVO | Proctors Creek | 19 | **VECTOR-STROKE** | 530 | 15,307 | 1 |

### Vision-Mode Projects — No PDF / Broken PDF (12)

| Project | Customer | Name | BOM Items | Root Cause | Issue |
|---------|----------|------|----------:|------------|-------|
| PRJ402063 | OVIVO | Lebanon Clarifier | 52 | BITMAP | No `originalPdfPath` |
| PRJ402065 | Royal A&C | Albion Idaho Water | 67 | BITMAP | No `originalPdfPath` |
| PRJ402066 | OVIVO | Parham Landing Thickener | 54 | BITMAP | No `originalPdfPath` |
| PRJ402068 | OVIVO | Brush Creek | 57 | BITMAP | No `originalPdfPath` |
| PRJ402069 | OVIVO | Natchitoches Thickener | 46 | BITMAP | No `originalPdfPath` |
| PRJ402076 | OVIVO | Magino Thickener | 70 | BITMAP | No `originalPdfPath` |
| PRJ402079 | OVIVO | Golden Chest Thickener | 57 | BITMAP | No `originalPdfPath` |
| PRJ402083 | Clearstream | Chandler SBR | 44 | BITMAP | No `originalPdfPath` |
| PRJ402087 | OVIVO | LUMBERTON PLC | 43 | BITMAP | No `originalPdfPath` |
| PRJ402089 | OVIVO | Lemay Pump Station | 84 | BITMAP | 0-byte PDF (upload fail) |
| PRJ402091 | OVIVO | Berkely Clarifier | 55 | BITMAP | 0-byte PDF (upload fail) |
| PRJ402092 | FLSmidth | Ball Mill Equipment | 22 | BITMAP | 0-byte PDF (upload fail) |

All 12 extract via page images (storageUrl → ensureDataUrl). Functionally equivalent
to BITMAP — the model receives a rendered image regardless of root cause.

---

## Root Cause Detail

### BITMAP (4 healthy-PDF projects + 12 no-PDF/broken = 16 total)

The BOM table is embedded as one or more raster images within the PDF page. The PDF
has no text objects corresponding to part numbers — only pixel data. Even with the
pdf-native extraction path, the model receives an image and performs vision OCR.

**ARC-side techniques:**
- Multi-pass voting (N=3+): stabilizes ~67% of CAD-export PNs, less effective on
  raster scans (only ~39%)
- Image preprocessing (contrast, sharpening, upscaling): may improve OCR on raster
  scans but won't help CAD-rendered curves
- BC lookup as weak oracle: filters nonsense PNs, can't disambiguate near-miss valid PNs
- Excel BOM cross-check (TODO #85): strongest option for customers who provide
  spreadsheet BOMs alongside drawings

### VECTOR-STROKE (3 projects)

The BOM text is drawn as vector path geometry (curves/strokes) in the PDF. The
character shapes ARE mathematically present — they're just stored as drawing
instructions (moveTo, lineTo, curveTo) rather than as Unicode text objects.

**ARC-side techniques (best candidates for improvement):**
- **Higher-DPI render:** The Cloud Function renders the PDF page to an image before
  sending to the model. Increasing render DPI from the current default would produce
  sharper character images, potentially reducing OCR ambiguity on curves.
- **Geometry-aware text recovery:** PDF path geometry could theoretically be decoded
  back to characters by matching path shapes to known font glyph outlines. This is
  complex but would convert VECTOR-STROKE to text-layer-equivalent input.
- **OCR preprocessing:** Apply Tesseract or similar OCR to the rendered image first,
  then feed both the OCR text AND the image to the model for cross-validation.
- Multi-pass voting and BC lookup also apply.

These 3 projects total only 71 BOM items (37 + 15 + 19). The VECTOR-STROKE category
is the smallest by item volume but the most technically addressable.

---

## Customer-Level View

| Customer | Projects | Text-Layer | Vision-Mode | Drawing Source |
|----------|:--------:|:----------:|:-----------:|----------------|
| OVIVO | 11 | 1 (Carterville) | 10 | CSW .dwg.pdf — mostly vision, 1 exception |
| FLSmidth | 3 | 1 (Salares Norte) | 2 | Mixed — native PDF vs CSW rebranded |
| Matrix Systems | 1 | 1 | 0 | ECAD export — always text-layer |
| Sentry Equipment | 2 | 2 | 0 | Matrix ECAD — always text-layer |
| Rebuild-It | 1 | 1 | 0 | Matrix ECAD — always text-layer |
| Neumann Construction | 1 | 1 | 0 | Matrix ECAD — always text-layer |
| Clearstream Environmental | 2 | 0 | 2 | Raster scan + no-PDF |
| Royal A&C Direct | 2 | 0 | 2 | No-PDF + BITMAP |

**Key insight:** FLSmidth appears in BOTH categories. PRJ402096 (Salares Norte, native
FLS drawing `1001244897_Rev_01.pdf`) has a text layer. PRJ402113 (Berry Ken, CSW-style
`CSW1807-121_Rev.D.pdf`) does not. The difference: Salares Norte uses FLSmidth's own
drawing format; Berry Ken uses OVIVO/CSW-style drawings rebranded under FLSmidth.
The customer name is misleading — the drawing FORMAT determines text-layer presence.

---

## Summary of the Landscape

```
26 TOTAL PROJECTS WITH BOM
├── 7 TEXT-LAYER (27%) ─── 100% deterministic, no ARC-side fix needed
│   ├── 5 Matrix ECAD exports (Matrix, Sentry, Rebuild-It, Neumann)
│   ├── 1 FLSmidth native (Salares Norte)
│   └── 1 OVIVO CSW exception (Carterville)
│
└── 19 VISION-MODE (73%) ── 4–19% exact consensus
    ├── 3 VECTOR-STROKE (12%) ── best ARC-side fix candidates
    │   └── Higher-DPI render, geometry-aware extraction
    └── 16 BITMAP (62%) ── hardest to fix ARC-side
        ├── 4 healthy PDF (BOM as embedded images)
        ├── 9 no-PDF (page images only)
        └── 3 zero-byte PDF (broken uploads)
```

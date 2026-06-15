# Q3 Probe 4 — 0-Byte PDF Runtime Reproduction

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Brief by:** Freddy Lyst

---

## Summary

The 0-byte PDF path produces **two different failure modes** depending on whether the
BOM page has a drawn region (bomRegion). With a region, the image fallback silently
recovers — the user gets a result but at degraded vision-mode quality. Without a
region, extraction hard-fails with an unhelpful error message.

The Cloud Function lacks the 0-byte guard that the client code already has.

---

## Test Setup

Uploaded a deliberate 0-byte file to Firebase Storage at
`originalPdfs/test-zero-byte/test-0byte-probe4.pdf`. Called `extractBomPage`
Cloud Function with `pdfPath` pointing to it. No live customer data was touched.

---

## What Happens at Each Layer

### Layer 1 — Cloud Function (`extractBomPage` in functions/index.js)

```
file.exists()        → TRUE (0-byte file exists in Storage, metadata has size:0)
file.download()      → returns Buffer of 0 bytes
PDFDocument.load(buf) → THROWS (pdf-lib can't parse empty buffer)
```

**Result:** Unhandled exception. Firebase wraps it as:
```json
{ "code": "functions/internal", "message": "INTERNAL" }
```

No useful error message, no error code, no details. The client receives only "INTERNAL".

**Missing guard:** The Cloud Function does NOT check `buf.length === 0` before
calling `PDFDocument.load()`. Compare to the client-side `loadOriginalPdfAsBase64`
(line 10164) which already has this guard:
```js
if(!fullBuf.byteLength) throw new Error("PDF file is empty (0 bytes) at " + storagePath);
```

### Layer 2 — Client Fallback Chain (`extractBomPage` in app.jsx)

After the Cloud Function returns `INTERNAL`:

```
1. Server path (extractBomPageViaServer) → CAUGHT: "INTERNAL"
   → logs: "[BOM EXTRACT] server path failed: INTERNAL"
   → logs debug entry (warn severity)

2. Direct API path (loadOriginalPdfAsBase64) → downloads 0-byte from Storage
   → guard fires: "PDF file is empty (0 bytes) at [path]"
   → CAUGHT: "[BOM EXTRACT] PDF native failed: PDF file is empty (0 bytes)"

3. Cropped BOM image fallback → depends on croppedBomDataUrl:
   IF present → extracts from image → RECOVERS (vision-mode quality)
   IF null   → skips

4. Final → throw "BOM extraction failed: no PDF path and no cropped BOM image available"
```

### Layer 3 — Page Preparation (`getExtractionUnits`)

Whether `croppedBomDataUrl` is available depends on the page's `bomRegion`:

**With bomRegion** (user-drawn or AI-detected BOM region on the page):
- `ensureDataUrl(pg)` hydrates the page image from `storageUrl`
- `cropRegionFromImage(dataUrl, bomRegion)` crops to the BOM area
- `croppedBomDataUrl` is set → fallback chain reaches step 3 → **RECOVERS**

**Without bomRegion:**
- No hydration, no crop
- `croppedBomDataUrl` is null → fallback chain reaches step 4 → **HARD FAILURE**

---

## Impact on the 3 Affected Projects

| Project | Name | bomRegion? | Outcome on Re-Extract |
|---------|------|:----------:|----------------------|
| PRJ402089 | Lemay Pump Station | YES | **Silent recovery** — extracts from page image via crop. Vision-mode quality (4–19% deterministic). User sees a result but doesn't know PDF was broken. |
| PRJ402091 | Berkely Clarifier | YES | **Silent recovery** — same as above. |
| PRJ402092 | Ball Mill Equipment | NO | **Hard failure** — "BOM extraction failed: no PDF path and no cropped BOM image available". User sees error. No result. |

---

## What the User Experiences

### Case A — Re-extract with bomRegion (PRJ402089, PRJ402091)

1. User clicks "Re-Extract" or "Feedback Re-Extract"
2. Console shows three sequential warnings (not visible to user):
   - `[BOM EXTRACT] server path failed: INTERNAL`
   - `[BOM EXTRACT] PDF native failed: PDF file is empty (0 bytes) at ...`
   - `[BOM EXTRACT] using cropped BOM region image (direct API fallback)`
3. Extraction completes from image — user sees BOM items appear
4. **No visible indication** that the PDF was broken or that image fallback was used
5. Result quality: vision-mode OCR (4–19% deterministic per Probe 2)

The user has no way to know they're getting degraded-quality extraction unless they
check browser console or Debug Logs.

### Case B — Re-extract without bomRegion (PRJ402092)

1. User clicks "Re-Extract"
2. Extraction fails with error: "BOM extraction failed: no PDF path and no cropped
   BOM image available"
3. User sees error toast/message
4. **No actionable guidance** — the error message says "no PDF path" but
   `originalPdfPath` IS set. The real problem (0-byte file) is hidden.

The error message is misleading: it suggests no PDF path exists, when actually
the path exists but the file is empty. The user can't diagnose the problem.

---

## Gaps Identified

| Gap | Location | Severity |
|-----|----------|----------|
| No 0-byte guard in Cloud Function | `functions/index.js:2370` | HIGH — produces opaque INTERNAL error instead of actionable message |
| Client guard exists but message doesn't surface to UI | `app.jsx:10164` | MEDIUM — only visible in console, not in error toast |
| No extraction-path indicator in UI | — | LOW — user can't see whether PDF-native or image-fallback was used |
| No upload-time validation of Storage write | `addFiles` pipeline | HIGH — 0-byte files are written without verification |
| Error message misleading for Case B | `app.jsx:11891` | LOW — says "no PDF path" when path exists but file is empty |

---

## Sanity Re-Check

All 3 affected projects confirmed still 0-byte in Storage:

| Project | Size | Upload Date | File |
|---------|:----:|-------------|------|
| PRJ402089 | 0 | 2026-05-07 | CSW1807-121_Rev.D.pdf |
| PRJ402091 | 0 | 2026-05-06 | CSW1892-121.dwg.pdf |
| PRJ402092 | 0 | 2026-05-13 | 400068437.pdf |

---

## Cleanup Note

Test file `originalPdfs/test-zero-byte/test-0byte-probe4.pdf` (0 bytes) remains
in Storage — client-side deletion is blocked by security rules. Harmless but should
be cleaned up via admin console or `gsutil rm`.

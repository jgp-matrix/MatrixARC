# Scanned PDF Quality Detection & Warning

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect low-quality scanned PDFs during BOM extraction, warn the user, and improve extraction accuracy for degraded source material.

**Architecture:** Server-side PDF quality analysis in Cloud Functions (runs on every extraction, near-zero cost since we already load the PDF with pdf-lib). Results flow back to client → persisted on panel → drives UI warning banner and enhanced AI prompt.

**Tech Stack:** pdf-lib (already installed in functions/), Anthropic API prompt augmentation

---

## Background

Some customer drawing PDFs are scanned monochrome bitmaps (CCITTFaxDecode — fax compression) wrapped in a PDF container, rather than CAD-generated vector PDFs. The pdf-native extraction path was designed for vector text, where characters are Unicode code points. On scanned PDFs, the AI is doing OCR on ~280 DPI monochrome pixels, causing:
- Character confusion: B↔8, O↔0, S↔5, I↔1
- Missed rows in dense table areas
- Multiple scanned images per page splitting the BOM across regions

Detection is straightforward: inspect the page's XObject resources for image subtype + CCITTFaxDecode filter.

---

### Task 1: Server-Side PDF Quality Detection

**Files:**
- Modify: `functions/index.js:2294-2324` (extractBomPage pdf-native block)
- Modify: `functions/index.js:2460-2481` (extractBomBatch pdf-native block)

- [ ] **Step 1: Add `assessPdfPageQuality` helper function**

Insert before `extractBomPage` (around line 2240):

```javascript
// ── PDF page quality assessment ──
// Inspects a single pdf-lib page for indicators of scanned/degraded source:
// CCITTFaxDecode images (fax scans), low DPI, monochrome bitmaps.
function assessPdfPageQuality(pdfPage, context) {
  const result = { isScanned: false, isMonochrome: false, estimatedDpi: null, imageCount: 0, hasVectorText: false, warningLevel: 'none' };
  try {
    const resources = pdfPage.node.get(PDFName.of('Resources'));
    if (!resources) return result;
    // Dereference if it's a PDFRef
    const resDict = resources instanceof PDFRef ? context.lookup(resources) : resources;
    if (!resDict || typeof resDict.get !== 'function') return result;

    // Check for fonts → indicates vector text content
    const fonts = resDict.get(PDFName.of('Font'));
    if (fonts) {
      const fontDict = fonts instanceof PDFRef ? context.lookup(fonts) : fonts;
      if (fontDict && typeof fontDict.entries === 'function') {
        result.hasVectorText = [...fontDict.entries()].length > 0;
      }
    }

    // Check XObjects for embedded images
    const xobjects = resDict.get(PDFName.of('XObject'));
    if (!xobjects) return result;
    const xoDict = xobjects instanceof PDFRef ? context.lookup(xobjects) : xobjects;
    if (!xoDict || typeof xoDict.entries !== 'function') return result;

    const pageSize = pdfPage.getSize();
    for (const [, val] of xoDict.entries()) {
      const obj = val instanceof PDFRef ? context.lookup(val) : val;
      if (!obj || !obj.dict) continue;
      const subtype = obj.dict.get(PDFName.of('Subtype'));
      if (!subtype || subtype.toString() !== '/Image') continue;

      result.imageCount++;
      const filter = obj.dict.get(PDFName.of('Filter'));
      const filterStr = filter ? filter.toString() : '';
      const width = obj.dict.get(PDFName.of('Width'));
      const height = obj.dict.get(PDFName.of('Height'));
      const w = width ? Number(width.toString()) : 0;
      const h = height ? Number(height.toString()) : 0;

      // CCITTFaxDecode = monochrome fax-quality scan
      if (filterStr.includes('CCITTFax')) {
        result.isScanned = true;
        result.isMonochrome = true;
      }
      // DCTDecode = JPEG embedded image (also scanned, but grayscale/color)
      if (filterStr.includes('DCTDecode')) {
        result.isScanned = true;
      }
      // Large FlateDecode images are also likely scans
      if (filterStr.includes('FlateDecode') && w > 1000 && h > 1000) {
        result.isScanned = true;
      }

      // Estimate DPI from image pixels vs page points (72 pts = 1 inch)
      if (w > 0 && pageSize.width > 0) {
        const dpi = Math.round(w / (pageSize.width / 72));
        if (!result.estimatedDpi || dpi < result.estimatedDpi) result.estimatedDpi = dpi;
      }
    }

    // Determine warning level
    if (result.isMonochrome) {
      result.warningLevel = 'high'; // worst case: fax-quality monochrome
    } else if (result.isScanned && result.estimatedDpi && result.estimatedDpi < 200) {
      result.warningLevel = 'high'; // low-DPI color/grayscale scan
    } else if (result.isScanned) {
      result.warningLevel = 'medium'; // scanned but decent resolution
    }
  } catch (e) {
    // Quality assessment is best-effort — never block extraction
    functions.logger.warn('assessPdfPageQuality error', { error: e.message });
  }
  return result;
}
```

- [ ] **Step 2: Wire quality assessment into `extractBomPage`**

After the PDF is sliced (line ~2313, after `functions.logger.info('extractBomPage PDF sliced', ...)`), add:

```javascript
const pdfQuality = assessPdfPageQuality(fullPdf.getPage(pageNumber - 1), fullPdf.context);
functions.logger.info('extractBomPage quality', { ...pdfQuality, pageNumber });
```

Then when building `userContent` (lines 2321-2324), prepend a scanned-document alert when quality is degraded:

```javascript
const qualityAlert = pdfQuality.warningLevel !== 'none'
  ? `\n\n⚠️ SCANNED DOCUMENT ALERT: This page is a ${pdfQuality.isMonochrome ? 'monochrome (black-and-white) fax-quality' : 'scanned'} image at ~${pdfQuality.estimatedDpi || 'unknown'} DPI embedded in a PDF. The BOM table is a bitmap, NOT vector text. Characters WILL be ambiguous.\n\nAPPLY MAXIMUM SCRUTINY:\n- Perform the character-count check on EVERY part number, not just long ones\n- Default ALL rows to confidence "medium" unless the glyph is crystal clear\n- For any character that could be B/8, O/0, S/5, I/1 — examine the surrounding pattern (manufacturer catalog format) for clues\n- Count total BOM rows TWICE before starting extraction — scanned tables are easy to under-count\n- If the BOM spans multiple image regions on this page, explicitly note how many sections you found\n`
  : '';
```

Inject `qualityAlert` into the `pageHint`:

```javascript
const pageHint = `Extract ALL Bill of Materials (BOM) items from this page.${qualityAlert}\n\n`;
```

Modify the return statement (line ~2387) to include quality info:

```javascript
return { raw, extractionPath, modelUsed, stopReason, usage: result.usage || {}, pdfQuality };
```

- [ ] **Step 3: Wire quality assessment into `extractBomBatch`**

Same pattern — after slicing each page in the per-page loop, call `assessPdfPageQuality`, add the `qualityAlert` to the prompt, and include `pdfQuality` in each page's result object.

The batch function returns `results` array where each entry has `{ raw, extractionPath, modelUsed, stopReason, pageNumber, ... }`. Add `pdfQuality` to each entry.

- [ ] **Step 4: Add `PDFName` and `PDFRef` to the imports at the top of `functions/index.js`**

Find the existing pdf-lib import and add the needed types:

```javascript
const { PDFDocument, PDFName, PDFRef } = require('pdf-lib');
```

---

### Task 2: Client-Side Quality Propagation

**Files:**
- Modify: `src/app.jsx:10337-10373` (extractBomPageViaServer)
- Modify: `src/app.jsx:10375-10401` (extractBomBatchViaServer)
- Modify: `src/app.jsx:12418-12429` (_perPageOutcomes recording)
- Modify: `src/app.jsx:12667-12693` (extractionReport construction)

- [ ] **Step 1: Pass `pdfQuality` through from server response**

In `extractBomPageViaServer` (~line 10372), the current return is:
```javascript
return _parseAndVerifyBomRaw(data.raw, data.extractionPath || intendedPath);
```

Change to include quality info:
```javascript
const parsed = _parseAndVerifyBomRaw(data.raw, data.extractionPath || intendedPath);
if (data.pdfQuality) parsed.pdfQuality = data.pdfQuality;
return parsed;
```

- [ ] **Step 2: Same for `extractBomBatchViaServer`**

In the batch loop (~line 10394), add `pdfQuality` to each parsed result:
```javascript
try {
  const p = _parseAndVerifyBomRaw(r.raw, r.extractionPath || 'pdf-native');
  if (r.pdfQuality) p.pdfQuality = r.pdfQuality;
  parsed[r.pageNumber] = { ...p, extractionPath: r.extractionPath, modelUsed: r.modelUsed, stopReason: r.stopReason };
}
```

- [ ] **Step 3: Collect quality into `_perPageOutcomes`**

In the per-page outcome recording (~line 12419), add quality info:
```javascript
_perPageOutcomes.push({
  ...existing fields...,
  pdfQuality: result?.pdfQuality || null,
});
```

- [ ] **Step 4: Aggregate quality into `extractionReport`**

In the extraction report construction (~line 12667), add a top-level quality summary:
```javascript
const _worstQuality = _perPageOutcomes.reduce((worst, o) => {
  const level = o.pdfQuality?.warningLevel || 'none';
  const rank = { high: 3, medium: 2, low: 1, none: 0 };
  return rank[level] > rank[worst] ? level : worst;
}, 'none');

const extractionReport = mergeStats ? {
  ...existing fields...,
  scanQuality: _worstQuality,  // 'none' | 'medium' | 'high'
  scanDetails: _perPageOutcomes.filter(o => o.pdfQuality?.warningLevel && o.pdfQuality.warningLevel !== 'none').map(o => ({
    pageName: o.pageName,
    isMonochrome: o.pdfQuality.isMonochrome,
    estimatedDpi: o.pdfQuality.estimatedDpi,
    warningLevel: o.pdfQuality.warningLevel,
  })),
} : null;
```

---

### Task 3: UI Warning Banner

**Files:**
- Modify: `src/app.jsx` — BOM toolbar area (near line ~25130, where the verification badge lives)

- [ ] **Step 1: Add scan-quality warning banner**

Insert before the existing verification badge block (line ~25135). Read `panel.extractionReport?.scanQuality`:

```jsx
{(()=>{
  const sq = panel.extractionReport?.scanQuality;
  if (!sq || sq === 'none') return null;
  const isHigh = sq === 'high';
  const details = panel.extractionReport?.scanDetails || [];
  const monoPages = details.filter(d => d.isMonochrome).length;
  const msg = isHigh
    ? `Low-quality scanned drawing detected${monoPages ? ` (${monoPages} monochrome fax-scan page${monoPages > 1 ? 's' : ''})` : ''} — part numbers may contain errors. Review carefully.`
    : `Scanned drawing detected — some part numbers may need verification.`;
  return (
    <div style={{
      background: isHigh ? '#3a1500' : '#2a2500',
      border: `1px solid ${isHigh ? '#f97316aa' : '#eab308aa'}`,
      color: isHigh ? '#fdba74' : '#fde68a',
      borderRadius: 8,
      padding: '6px 12px',
      fontSize: 12,
      fontWeight: 600,
      marginBottom: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <span style={{ fontSize: 16 }}>⚠</span>
      <span>{msg}</span>
    </div>
  );
})()}
```

The banner appears above the BOM table whenever `extractionReport.scanQuality` is `'medium'` or `'high'`. Persists across reloads since it's stored in `panel.extractionReport`.

---

### Task 4: Enhanced Confidence Display on BOM Rows

**Files:**
- Modify: `src/app.jsx` — BOM row rendering (find the part number cell renderer)

- [ ] **Step 1: Add amber dot indicator for medium/low confidence rows**

Find the BOM table row rendering for the part number cell. When `row.confidence === 'medium'` or `row.confidence === 'low'`, add a small visual indicator next to the part number:

```jsx
{(row.confidence === 'low' || row.confidence === 'medium') && (
  <span title={`AI confidence: ${row.confidence} — verify this part number against the source drawing`}
    style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: row.confidence === 'low' ? '#ef4444' : '#f59e0b',
      marginRight: 4, flexShrink: 0 }} />
)}
```

This gives immediate per-row visual feedback: red dot = low confidence, amber dot = medium confidence.

---

### Task 5: Client-Side Direct API Fallback (quality alert in prompt)

**Files:**
- Modify: `src/app.jsx:10443-10478` (client-side PDF-native fallback)

- [ ] **Step 1: Add quality assessment for client-side fallback**

The client-side direct API path at line 10443 loads the PDF via `loadOriginalPdfAsBase64`. This helper already loads the full PDF to extract a single page. We need to also run quality assessment here.

However, since `loadOriginalPdfAsBase64` only returns the base64 string, the simplest approach is to add a parallel helper `assessPdfQualityFromStorage(pdfPath, pageNumber)` that loads the same PDF and runs the assessment. But that doubles the download.

**Better approach:** The quality info should already be available from the server attempt that failed (the reason we're in the fallback). If the server returned quality info before failing, we could cache it. But since server failures are typically network/timeout errors, the quality data won't be available.

**Simplest correct approach:** Duplicate the quality assessment logic client-side is overkill. Instead, when the client-side fallback is used, always include the scanned-document alert in the prompt (conservative — assumes worst case for a fallback scenario). This is the rare path anyway.

```javascript
// Client fallback always includes quality alert (conservative — if server failed, be cautious)
const qualityAlert = '\n\n⚠️ DOCUMENT QUALITY UNKNOWN: The server-side quality assessment was unavailable. Apply maximum character scrutiny to all part numbers. Default confidence to "medium" unless every character is unambiguous.\n';
const pageHint = `Extract ALL Bill of Materials (BOM) items from this page.${qualityAlert}\n\n`;
```

---

### Task 6: Commit & Deploy

- [ ] **Step 1: Run `node validate_jsx.js`** to verify JSX compiles
- [ ] **Step 2: Run `./tools/preflight-functions.sh`** before function deploy
- [ ] **Step 3: Deploy functions** — `firebase deploy --only functions` (quality detection is server-side)
- [ ] **Step 4: Deploy hosting** — `bash deploy.sh` (UI warning + confidence dots)
- [ ] **Step 5: Test** — Re-extract the PRJ402107 BOM and verify:
  - Console shows `extractBomPage quality` log with `isScanned: true, isMonochrome: true`
  - Extraction response includes `pdfQuality` object
  - UI shows amber scan-quality warning banner
  - Medium/low confidence rows show colored dots
  - Prompt includes scanned-document alert (check server logs)

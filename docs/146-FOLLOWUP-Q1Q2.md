# Coach Follow-Up — #146 Confidence Pipeline: Q1 + Q2 Facts

**From:** Coach (Sam Wize)  
**To:** Jon  
**Re:** #146 follow-up — two ordering/availability questions for the 3-signal priority ladder  
**Date:** 2026-06-16  
**Type:** READ + REPORT — no fix design

---

## Q1 — BC Match Ordering

**Question:** Does the BC auto-match run at initial extraction, early enough to set "high" BEFORE the user sees the row? Or does it only fire on manual cross?

### Answer: BC pricing runs at extraction time — but does NOT set confidence.

The pipeline ordering at extraction time:

```
1. _parseAndVerifyBomRaw (line 11984)
   → AI model assigns confidence per row
   → confusable-glyph regex DOWNGRADES high → medium (line 12073)

2. BOM merge (positional → exact → fuzzy dedup)

3. applyLearnedCorrections (line 14511)
   → learning DB alternates: if a row's PN matches a previously-saved
     alternate, replaces PN and sets confidence = "high"
   → ONLY fires for rows matching entries in users/{uid}/config/alternates

4. Snippet self-correction (line 14524)
   → re-reads the drawing image to verify uncertain PNs
   → can set confidence = "high" if it confirms the part number

5. runPricingOnPanel (line 26225) — runs AFTER extraction completes
   → BC fuzzy/exact lookup
   → sets: priceSource:"bc", bcMatchType, bcNumber, unitPrice, etc.
   → does NOT set confidence — not at line 26352 (foreground), not at 14880 (background)
```

**The gap:** `runPricingOnPanel` identifies BC matches (sets `priceSource:"bc"` and `bcMatchType:"exact"` or `"fuzzy"`) but never touches the `confidence` field. The BC match signal exists at extraction time — it's just not wired to confidence.

**For Jon's rule #1 ("BC-matched → high, authoritative"):** The BC pricing step already runs early enough. The information is there (`priceSource === "bc"` and `bcMatchType === "exact"`). Confidence just needs to be set during or after that step. No pipeline reordering required — it's a matter of adding a confidence write where BC match data is already being written.

**Separate note on `applyLearnedCorrections`:** This DOES set confidence to "high" — but only for rows where the PN matches a previously-saved user alternate. It's the learning DB auto-cross, not BC catalog matching. First-time BC matches (a part that exists in the BC catalog but was never manually crossed by this user) are NOT covered by this path.

---

## Q2 — Text-Layer Signal Availability

**Question:** Does the extraction pipeline track, per-project or per-row, whether the source was a NATIVE PDF TEXT LAYER vs the VISION/OCR (H5) path? Is the distinction "text extracted from a genuine text layer" vs "interpreted from pixels" — NOT merely "file is a .pdf"?

### Answer: YES — the pipeline makes exactly this distinction, and it's correct.

### How the tier classification works

`classifyBomInputTier` (line 15174) uses pdf.js to physically extract text content from the PDF:

```js
const tc = await pg.getTextContent();           // pdf.js text layer extraction
// ...counts characters inside the BOM region...
const textThreshold = bomRegion ? 100 : 500;
if (regionTextChars > textThreshold) return 'text-layer';
```

It counts actual text characters found in the PDF's text layer within the BOM region. If there are more than 100 characters (with a region) or 500 (full page), it returns `"text-layer"`. Otherwise it returns:
- `"scan"` — monochrome image with zero text chars (scanned document)
- `"bitmap"` — multiple embedded images (image-wrapped PDF)
- `"vector-stroke"` — vector drawing with no readable text layer

### Scanned-image-in-PDF is correctly handled

A scanned image wrapped in a PDF has NO text layer — pdf.js `getTextContent()` returns zero text characters for embedded raster images. So `regionTextChars` would be 0, and the classifier returns `"scan"` or `"bitmap"` — NOT `"text-layer"`.

This is exactly the distinction Jon asked about: **"text extracted from a genuine text layer" vs "interpreted from pixels."** The pipeline does NOT conflate "file is a .pdf" with "file has readable text."

### How the tier drives the extraction path

| Tier | Extraction path | What happens |
|------|----------------|--------------|
| `"text-layer"` | `"pdf-native"` | PDF sent directly to Anthropic — deterministic text extraction from the actual text layer |
| `"scan"` / `"bitmap"` / `"vector-stroke"` | `"hi-dpi-tiles"` | Client renders the page at high DPI → image tiles sent to Anthropic → vision/OCR interpretation |

Code at lines 12222-12235:
```js
const _h5Tier = await classifyBomInputTier({...});
if (_h5Tier !== "text-layer" && _h5Tier !== "no-pdf") {
    // → high-DPI tile path (vision mode)
} else {
    // → standard PDF-native path (text layer present)
}
```

### Where the signal is stored

| Level | Location | Available? |
|-------|----------|------------|
| **Panel-level** | `panel.extractionReport.extractionPath` (line 14588) | YES — persisted to Firestore |
| **Per-page** | `panel.extractionReport.perPageOutcomes[].extractionPath` (line 14329) | YES — persisted to Firestore |
| **Per-item/row** | Not directly on the row | NO — but retrievable via `item.sourcePageId` → cross-reference against `perPageOutcomes[].pageId` |
| **At confidence assignment point** | `extractionPath` parameter to `_parseAndVerifyBomRaw` (line 12165) | YES — in scope but not used |

### The critical finding for Q2

**The `extractionPath` is literally a parameter to `_parseAndVerifyBomRaw` — the same function that contains the confusable regex at line 12073.** The signal is in scope at the exact point where confidence is assigned. It's just not read.

The confusable regex currently applies the same downgrade regardless of whether the source was `"pdf-native"` (genuine text layer, deterministic, high fidelity) or `"hi-dpi-tiles"` (vision/OCR, pixel interpretation, inherently less certain).

---

## Summary Table

| Question | Answer |
|----------|--------|
| **Q1: BC match at extraction time?** | YES — `runPricingOnPanel` runs during extraction and identifies BC matches. But it does NOT set confidence. The BC match data (`priceSource`, `bcMatchType`) is available; confidence just isn't wired to it. |
| **Q1: Pipeline reordering needed?** | NO — the data is already there at the right time. It's a matter of adding a confidence write, not changing execution order. |
| **Q2: Text-layer vs vision distinguished?** | YES — `classifyBomInputTier` counts actual text characters in the PDF text layer via pdf.js. Scanned images return 0 chars → correctly classified as `"scan"`/`"bitmap"`, not `"text-layer"`. |
| **Q2: Signal available at confidence point?** | YES — `extractionPath` is a parameter to `_parseAndVerifyBomRaw`, the function containing the confusable regex. In scope, not used. |
| **Q2: Signal persisted?** | YES — panel-level and per-page in `extractionReport`. Not per-item, but cross-referenceable via `sourcePageId`. |
| **Q2: Does H5 normalize everything through vision?** | NO — text-layer pages skip H5 entirely and go through `"pdf-native"` path. Only non-text-layer pages go through H5 vision tiles. |

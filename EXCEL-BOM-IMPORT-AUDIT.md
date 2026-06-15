# #85 Excel BOM Import — Codebase Audit

**Author:** Sam Wize (Coach), Senior Development Engineer, Architecture
**Date:** 2026-06-05
**Status:** Read-only audit — findings for a future #85 Brief
**Scope:** Four audit questions per Jon's reframe. No build, no feature design.

---

## Reframe summary

#85 is Excel as an EXTRACTION INPUT, parallel to drawing extraction. Drop an .xlsx,
ARC parses the BOM from the spreadsheet, fills the panel BOM line items — identical
output to a drawing extraction. One feature: Excel → panel BOM, parallel to PDF →
panel BOM. Everything downstream (pricing, BC matching, quote) is the same path.

Key property: Excel is DETERMINISTIC. A cell is text, no OCR/vision. Imports at 100%
fidelity, structurally equivalent to the text-layer tier.

---

## Q1. Where does drag-and-drop ingest happen, and where does parsed BOM output get written?

### Entry point: `addFiles` (app.jsx:23061)

All file ingestion flows through one function. Two UI surfaces call it:

- **Drag-and-drop zone** (app.jsx:26559-26614): `onDrop` handler collects files,
  calls `addFiles(files)`.
- **File input** (app.jsx:26614): `<input type="file" accept="image/*,application/pdf">`
  onChange calls `addFiles(e.target.files)`.

Inside `addFiles`, `_sniffFileType(f)` (app.jsx:23048-23060) determines the file type
by MIME or magic bytes. Currently handles two branches:

| Type | Branch | Lines | Behavior |
|------|--------|-------|----------|
| `application/pdf` | line 23137 | 23137-23202 | Render pages via pdf.js, upload to Storage, create page objects |
| `image/*` | line 23203 | 23203-23217 | Read as dataUrl, resize to 3800px, create page object |
| anything else | line 23218 | 23218-23221 | Logged as "unsupported-type", skipped |

**Excel would be a third branch** at line 23218 (the current unsupported-type path).
`_sniffFileType` would need to recognize xlsx magic bytes (PK = 0x50, 0x4B for the
ZIP container) or the browser-supplied MIME
(`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`). The file input's
`accept` attribute would need `.xlsx` added.

### Post-detection pipeline (not needed for Excel)

After `addFiles` creates page objects, the pipeline runs:
1. Page type detection via AI (app.jsx:23226-23245) — classifies BOM/SCH/BP/etc.
2. Confirmation gate (app.jsx:23281) — user reviews detected types
3. `confirmAndExtract` (app.jsx:23376) — filters BOM pages, calls `runExtractionTask`
4. `runExtractionTask` (app.jsx:13507-14306) — AI extraction per page, multi-phase
   merge (positional dedup → exact dedup → fuzzy merge → non-BOM filter → internal PN
   resolution → companion split → suspect qty flagging)

**Excel bypasses steps 1-4 entirely.** There are no "pages" to detect, no AI
extraction. The parse step reads cells directly.

### BOM write seam: `applyInMemory` at line 14122

After extraction produces `mergedBom` (an array of standard BOM items), it's written to
the panel at app.jsx:14122:

```javascript
const _existingEcoRows = (latestPanel.bom || []).filter(r => r.ecoTag);
const _bomWithEco = mergedBom.length > 0 ? [...mergedBom, ..._existingEcoRows] : null;
const bomSave = {
  ...latestPanel,
  ...(_bomWithEco ? { bom: _bomWithEco } : {}),
  aiQuestions: aiQuestions || [],
  engineeringQuestions: eqs,
  extractionReport: extractionReport,
  status: mergedBom.length > 0 ? "extracted" : latestPanel.status,
  updatedAt: Date.now()
};
applyInMemory(bomSave);
```

Then persisted to Firestore in a single consolidated save at line 14292.

**This is the seam.** An Excel parser produces the same `mergedBom` array shape, then
writes via the same `applyInMemory` + save path. The ECO row preservation
(`_existingEcoRows`) and status transition (`"extracted"`) apply identically.

---

## Q2. What is the panel BOM line-item schema?

### Minimum fields an Excel parser must produce

These are the fields the extraction pipeline populates. An Excel import must produce
the same shape:

```javascript
{
  id: "row-" + Date.now() + "-" + Math.random().toString(36).slice(2,8),
  itemNo: "1",              // from item # column, or "" if none
  qty: 1,                   // numeric, must be > 0
  partNumber: "RH2B-ULC",   // manufacturer part number
  description: "Relay 2P",  // component description
  manufacturer: "IDEC",     // manufacturer name
  notes: "",                // ref designators, tags, or ""
  confidence: "high",       // "high" for Excel (deterministic — cell is text)
  additionalPartNumbers: [],// companion PNs if multi-PN cell, else []
  y_top: 0.0,               // spatial coords (not meaningful for Excel)
  y_bottom: 0.0,
  x_left: 0.0,
  x_right: 1.0
}
```

### Fields added downstream (Excel parser does NOT populate these)

| Field | Added by | Purpose |
|-------|----------|---------|
| `unitPrice`, `priceSource`, `priceDate` | Pricing pipeline | BC/manual/scraper prices |
| `bcVendorNo`, `bcVendorName`, `bcNumber` | BC matching | Business Central link |
| `bcFuzzySuggestions` | BC fuzzy lookup | Candidate matches |
| `leadTimeDays`, `leadTimeSource`, `leadTimeUpdatedAt` | Pricing pipeline | Lead times |
| `isCrossed`, `crossedFrom`, `autoReplaced` | Learning DB application | Part alternates |
| `isCorrection`, `correctionType`, `correctedByLibrary` | Learning DB application | Auto-corrections |
| `snippetCorrected` | Per-row snippet verify | AI self-correction |
| `customerPartNumber` | Internal PN resolution | Customer-specific PN |
| `suspectQty`, `suspectQtyReason` | `flagSuspectQuantities` | Qty sanity check |
| `isLaborRow`, `isContingency` | Post-extraction classification | Row type flags |
| `ecoTag`, `ecoOp`, `ecoNumber` | ECO system | Engineering change rows |
| `extractionWarning` | BOM audit | Dupe/gap detection codes |

### Fields that matter for downstream pipeline correctness

| Field | Required for pricing? | Required for BC push? | Required for quote print? |
|-------|----------------------|----------------------|--------------------------|
| `id` | Yes | Yes | Yes |
| `qty` | Yes (>0) | Yes | Yes |
| `partNumber` | Yes | Yes | Yes |
| `description` | Yes | Yes | Yes |
| `manufacturer` | Helps fuzzy match | Helps | Yes |
| `confidence` | No | No | No — but affects UI review indicators |

### Excel-specific notes

- **confidence: always "high"** — Excel cells are deterministic text. No OCR ambiguity.
- **y_top/y_bottom: set to row-order fractions** — `y_top = i/count`,
  `y_bottom = (i+1)/count`. Not meaningful spatially but the sort function
  (`sortBomByDrawingPosition`, app.jsx) uses these. Setting them to row order
  preserves the spreadsheet's row sequence.
- **additionalPartNumbers**: If a cell contains multiple PNs (comma/slash separated),
  parse into `[{partNumber, relationship: "other", context: "from Excel cell"}]`.
  The companion-split step (`splitCompanionParts`) already handles these.

---

## Q3. Excel parse + column mapping

### The problem

Customer spreadsheet layouts vary: different header names ("Part #" vs "P/N" vs
"Catalog Number"), headers not always in row 1, title rows and merged cells, columns
in different order. A fixed-column parser won't work across customers.

### What's needed

**Column mapping pipeline:**

1. **Read the Excel file** — needs a client-side XLSX parser. No existing spreadsheet
   library in the codebase. Candidates: SheetJS (xlsx), ExcelJS, or a lighter
   alternative. SheetJS is the standard — ~300KB minified, handles merged cells,
   multiple sheets, formulas.

2. **Auto-detect header row** — scan rows until one matches a heuristic (contains
   ≥3 of: qty/quantity, part/p.n./catalog, description/desc, manufacturer/mfr/mfg).
   The row BEFORE the first data row is the header. Handle: header in row 1 (common),
   header in row 3+ (customer title block above), no header (rare — manual mapping).

3. **Auto-detect column mapping** — match header cell text to the schema fields:
   | Schema field | Match patterns |
   |-------------|---------------|
   | `itemNo` | "item", "line", "#", "no" |
   | `qty` | "qty", "quantity", "count" |
   | `partNumber` | "part", "p/n", "p.n.", "catalog", "cat #", "model" |
   | `description` | "description", "desc", "name" |
   | `manufacturer` | "mfr", "mfg", "manufacturer", "vendor", "brand" |
   | `notes` | "notes", "ref", "tag", "remark" |

4. **User-confirm mapping** — show the auto-detected mapping and let the user adjust.
   "We detected Qty in column C, Part # in column E — is this right?" Drag-drop or
   dropdown per column. The user sees a preview of the first 5-10 rows mapped to the
   schema.

5. **Per-COMPANY saved mapping** (Jon's prior decision) — save confirmed mappings to
   `companies/{companyId}/config/excel_column_mappings`. Key by a fingerprint of the
   column headers (sorted, normalized). Next time a spreadsheet with the same header
   pattern is dropped, auto-apply the saved mapping. User can still override.

### Supplier Portal as pattern reference (read-only)

The Supplier Portal's `extractSupplierQuotePricing` (functions/index.js:977-1335) is
a **different pattern** — it uses AI to extract from a PDF image, not to read cells.
The MATCHING logic is reusable:

- `normPart()` (app.jsx:~45758) — normalize part numbers for matching. Reuse directly.
- `partMatch()` (app.jsx:~45778-45790) — fuzzy prefix/suffix matching. Reuse for
  comparing Excel PNs against existing BOM rows (if Excel is being used to UPDATE an
  existing BOM rather than CREATE one).

The portal does NOT have user-configurable column mapping — it's AI-driven. Excel
import needs the column mapping UI that the portal does not.

### Edge cases to handle

- **Merged cells**: SheetJS resolves these — merged cell value appears in top-left cell,
  other cells in the range are empty.
- **Formula cells**: SheetJS can return computed values (`{raw: true}` option). Use the
  computed value, not the formula.
- **Multi-sheet workbooks**: Common pattern is BOM on one sheet, cover/notes on another.
  Let the user pick which sheet. Auto-detect by checking which sheet has the most rows
  matching the column heuristic.
- **Empty/spacer rows**: Filter rows where all mapped fields are empty.
- **Title/summary rows**: Rows above the header row are skipped. Rows below that don't
  have a part number or qty are filtered.
- **"Customer supplied" items**: These are valid BOM rows (per feedback_bom-row-types
  memory). They have a description and qty but may lack a manufacturer or part number.
  Don't filter them.

---

## Q4. Can Excel ingest reuse the existing drag-drop UI and BOM-fill path?

### Yes — one shared output path, two input parsers

The architecture is clean. Here's the integration:

```
                    ┌─── PDF → render pages → AI extract ──┐
  addFiles(files) ──┤                                       ├── mergedBom[] → applyInMemory → save
                    └─── Excel → parse cells → map columns ─┘
```

**Shared components (reuse as-is):**
- Drag-and-drop zone (app.jsx:26559) — already accepts any file, calls `addFiles`
- `applyInMemory` + consolidated save (app.jsx:14122-14292) — writes bom to panel
- Post-write pipeline: learning DB application (`applyCorrections`, `applyAlternates`),
  pricing (`runPricingOnPanel`), BC matching
- BOM table UI, quote print, export — all read from `panel.bom` regardless of source

**New components (Excel-specific):**
- `_sniffFileType` extension — recognize xlsx magic bytes (PK = 0x50 0x4B)
- Excel parse branch in `addFiles` — third branch at line 23218
- SheetJS dependency — client-side xlsx parsing library
- Column mapping UI — modal for user to confirm/adjust detected mapping
- Per-company mapping persistence — Firestore at `companies/{companyId}/config/excel_column_mappings`

**Components NOT needed (bypass entirely):**
- Page rendering (pdf.js) — no pages to render
- `originalPdfPath` upload — no PDF
- Page type detection (`detectPageTypes`) — no page classification
- AI extraction (`extractBomPage` / `extractBomBatch`) — no AI call
- Multi-phase merge (positional dedup, fuzzy merge, non-BOM filter) — Excel rows are
  already structured; no OCR dedup needed. May still want companion-split and suspect-
  qty flagging.
- Per-row snippet self-correction — no image to re-verify against

**The lightest integration path:**

1. In `addFiles`, detect xlsx file type
2. Parse with SheetJS, auto-detect columns, show mapping confirmation modal
3. User confirms mapping → produce `mergedBom[]` array in standard schema
4. Write to panel via the existing `applyInMemory` path (line 14122)
5. Run post-write pipeline (learning DB, pricing) as normal

No new Cloud Functions needed. No server-side processing. Excel parsing is client-side
only (SheetJS runs in the browser). The CF extraction path is not involved.

### extractionReport metadata

The `extractionReport` object on the panel records extraction metadata. For Excel:

```javascript
extractionReport: {
  extractionPath: "excel-import",    // new path identifier
  totalItems: mergedBom.length,
  inputFile: file.name,
  columnMapping: { qty: "C", partNumber: "E", ... },
  mappingSource: "saved" | "auto" | "manual",
  scanQuality: "none",              // Excel = deterministic, no scan quality
  timestamp: Date.now(),
  version: APP_VERSION
}
```

This follows the existing pattern (extractionPath is already logged and surfaced in
the UI as a green/amber pill). "excel-import" would get its own pill style.

---

## Summary of seams and integration points

| Component | Location | Role in Excel import |
|-----------|----------|---------------------|
| `addFiles` | app.jsx:23061 | Entry point — add xlsx branch |
| `_sniffFileType` | app.jsx:23048 | Extend with xlsx detection |
| File input `accept` | app.jsx:26614 | Add `.xlsx` to accept list |
| `applyInMemory` | app.jsx:14122 | Write path — reuse as-is |
| Consolidated save | app.jsx:14292 | Persist path — reuse as-is |
| `applyCorrections` | app.jsx:~10322 | Learning DB — runs on all BOMs including Excel |
| `applyAlternates` | app.jsx:~10377 | Alternate application — runs on all BOMs |
| `runPricingOnPanel` | app.jsx:~14320 | Pricing — runs on all BOMs |
| `extractionReport` | app.jsx:~14090 | Metadata — new "excel-import" path |
| `normPart` | app.jsx:~45758 | PN normalization — reuse for column matching |
| Excel column mappings | Firestore (new) | `companies/{companyId}/config/excel_column_mappings` |

---

## Risk notes

1. **SheetJS bundle size**: ~300KB minified. Consider lazy-loading (dynamic import on
   first xlsx drop) to avoid penalizing users who never use Excel import.
2. **Column mapping accuracy**: Auto-detect will fail on spreadsheets with non-English
   headers or unusual naming. The user-confirm step is essential — never auto-import
   without showing the mapping.
3. **Existing BOM overwrite**: If a panel already has a BOM (from drawing extraction),
   dropping an Excel should REPLACE it (same as re-extraction). The ECO row
   preservation at line 14120 already handles this — eco-tagged rows survive.
4. **No cross-check in v1**: The optional drawing-vs-Excel comparison is explicitly
   deferred. v1 is just: drop Excel → get BOM. The cross-check would compare two
   `panel.bom` arrays from different sources — structurally simple but a separate
   feature.

# REQUIRED BOM REGION — DETAILED PLAN

**Author:** Sam Wize (Coach), Senior Development Engineer, Architecture
**Date:** 2026-06-05
**Source:** Analyst Review (REQUIRED-BOM-REGION-ANALYST-REVIEW.md), Coach Supplement (C31)
**Status:** Ready for implementation — Marc implements per phase, Coach verifies each
**Patches:** v2 (2026-06-05) — 3 patches from Jon's review + 1 minor convergence fix

---

## Implementation Order

    Phase 0a → [Jon decides ship order] → Phase 0b / Phase 1 → Phase 2

Phase 0a is the first implementable unit. Its results determine whether 0b ships
before or with Phase 1.

---

## PHASE 0a — Diagnose Timeout + Memory Bump

**Goal:** Determine where PRJ402101's 480s+ goes. Simultaneously try the cheapest fix.
**Files:** `functions/index.js`
**Deploy:** `firebase deploy --only functions` (no hosting change)
**Test:** Re-extract PRJ402101 BOM page, read Cloud Function logs

### Step 1: Memory bump (1 line)

At line 2324, change:
```
.runWith({ timeoutSeconds: 540, memory: '1GB', maxInstances: 10 })
```
to:
```
.runWith({ timeoutSeconds: 540, memory: '2GB', maxInstances: 10 })
```
This matches extractBomBatch (line 2549) which already runs at 2GB.

### Step 2: Stage timing instrumentation

Add `Date.now()` timing around each pipeline stage in `extractBomPage`. Insert after
the `file.exists()` check succeeds (line 2367), wrapping the existing code:

**Location: lines 2370-2401 (download → parse → slice → save)**

Record timestamps between:
1. **t0** — before `file.download()` (line 2370)
2. **t1** — after download, before `PDFDocument.load()` (between 2370 and 2371)
3. **t2** — after parse, before `copyPages()` (between 2371 and 2376)
4. **t3** — after slice + CropBox + `save()` (after line 2401)
5. **t4** — before API fetch (line 2460)
6. **t5** — after API response (line 2492)

Log all deltas in a single structured log entry:
```javascript
functions.logger.info('extractBomPage timing', {
  uid,
  downloadMs: t1 - t0,
  parseMs: t2 - t1,
  sliceMs: t3 - t2,
  promptMs: t4 - t3,
  apiMs: t5 - t4,
  totalMs: t5 - t0,
  pdfSizeKB: Math.round(buf.length / 1024),
  slicedSizeKB: Math.round(singlePageBytes.length / 1024),
  pdfCropped
});
```

### Step 3: Move AbortController to function entry (L1 fix)

Currently the AC starts at line 2457, after all pre-API work:
```javascript
const ac = new AbortController();
const acTimer = setTimeout(() => ac.abort(), 480000);
```

Move the AC creation to the top of the function body (after auth check, ~line 2328).
Reduce timeout to account for total pipeline budget:
```javascript
const ac = new AbortController();
const acTimer = setTimeout(() => ac.abort(), 520000); // 520s within 540s CF budget
```

Pass `ac.signal` to the existing fetch call at line 2460. No other changes needed —
the signal is already consumed there.

### Step 4: Deploy + test

1. `firebase deploy --only functions`
2. Re-extract PRJ402101 (2.9MB, 23 pages) — single BOM page
3. Read Cloud Function logs for the timing entry
4. Report to Jon: where the seconds went, whether 2GB solved it

### Acceptance

Timing data exists in logs. If 2GB solves the timeout, Phase 0b may be unnecessary.
If the bottleneck is model latency, flag to Jon that Phase 0b ships WITH Phase 1
(CropBox reduces viewport → faster model processing).

---

## PHASE 0b — Timeout Fix (mechanism conditional on 0a)

**Cannot be fully specified until 0a reports.** Three branches:

### If memory was the answer (2GB succeeds)
Phase 0b = done. The 1-line fix from 0a is the fix. Proceed to Phase 1.

### If download/parse is the bottleneck
Investigate page-scoped PDF loading. pdf-lib doesn't support partial load natively,
but buffer-surgery approaches exist (copy page objects by cross-reference without
parsing the full document tree). This is a medium-effort optimization.

### If model latency is the bottleneck
The fix is CropBox (viewport restriction) — which is Phase 1's regioning feature.
Phase 0b merges INTO Phase 1. Ship order inverts: Phase 1 ships first, Phase 0b is
absorbed. Flag to Jon for approval.

In all branches, the L1 AC fix from 0a step 3 is already in place.

---

## PHASE 1 — Required BOM Region + Quality Gate + 0-byte Hardening

**Files:** `src/app.jsx`, `functions/index.js`
**Deploy:** `firebase deploy --only functions` + `bash deploy.sh`

Implement sub-phases in order: 1e → 1b → 1a → 1c → 1d → 1f. Rationale: 1e is
surgical (CF guards + UI pill); 1b is the load-bearing classifier that 1c depends on;
1a and 1c are UI; 1d is a special case of 1c; 1f extends existing infra.

---

### Phase 1e — 0-byte hardening + extraction path indicator

**1e-1. CF 0-byte guard — extractBomPage**

At functions/index.js line 2370, after download, before parse:
```javascript
const [buf] = await file.download();
// --- ADD ---
if (!buf.length) {
  throw new functions.https.HttpsError('failed-precondition',
    'PDF file is empty (0 bytes) — re-upload the source PDF.');
}
// --- END ---
const fullPdf = await PDFDocument.load(buf);
```

**1e-2. CF 0-byte guard — extractBomBatch**

At functions/index.js line 2582, after download, before parse:
```javascript
const [buf] = await file.download();
// --- ADD ---
if (!buf.length) {
  throw new functions.https.HttpsError('failed-precondition',
    'PDF file is empty (0 bytes) — re-upload the source PDF.');
}
// --- END ---
const fullPdf = await PDFDocument.load(buf);
```

**1e-3. Amber "Image fallback" pill**

At app.jsx ~line 26854 (after the green "PDF native" pill closing tag), add a
parallel condition for the degraded path:
```jsx
{panel.extractionReport?.extractionPath&&panel.extractionReport.extractionPath!=="pdf-native"&&(
  <span title="Extraction used image fallback — lower accuracy than PDF native."
    style={{background:"#2a1f0d",border:"1px solid #f59e0b88",color:"#fcd34d",
      borderRadius:14,padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"help",
      whiteSpace:"nowrap"}}>
    Image fallback
  </span>
)}
```

Style mirrors the existing green pill pattern but in amber. Shows when extraction
used any path OTHER than pdf-native.

**1e-4. Cleanup 0-byte test file**

Run via admin gsutil (Jon or admin action, not code):
```
gsutil rm gs://<bucket>/originalPdfs/test-zero-byte/test-0byte-probe4.pdf
```

---

### Phase 1b — Input classification branch engine

This is the load-bearing classifier. Must run BEFORE extraction starts, after page
detection, to determine which tier each BOM page falls into.

**New function: `classifyBomInputTier(page)`**

Location: app.jsx, near `assessPdfPageQuality` usage (after `resolveBomRegion`, ~line
14667). Returns one of: `'text-layer'`, `'vector-stroke'`, `'bitmap'`, `'scan'`,
`'no-pdf'`.

```javascript
async function classifyBomInputTier(page) {
  if (!page.originalPdfPath || !page.pageNumber) return 'no-pdf';

  // Step 1: count text chars WITHIN the BOM region bounds only.
  // HARD REQUIREMENT — do NOT count full-page text. Q3 proved vision-mode BOM pages
  // have 77-94 title-block text chars (PRJ402101/402113) which would trip a whole-page
  // threshold and misclassify bitmap/vector-stroke as text-layer. Only chars whose
  // pdf.js transform position falls inside the resolved BOM region count.
  const bomRegion = resolveBomRegion(page);
  let textCharCount = 0;
  try {
    // pdf.js is already loaded for rendering — reuse the instance
    const pdfDoc = await pdfjsLib.getDocument(/* page's PDF URL or storage URL */).promise;
    const pdfPage = await pdfDoc.getPage(page.pageNumber);
    const viewport = pdfPage.getViewport({ scale: 1.0 });
    const textContent = await pdfPage.getTextContent();

    if (bomRegion) {
      // Region bounds in PDF points (normalized 0-1 → page dimensions)
      const rLeft = bomRegion.x * viewport.width;
      const rTop = bomRegion.y * viewport.height;
      const rRight = (bomRegion.x + bomRegion.w) * viewport.width;
      const rBottom = (bomRegion.y + bomRegion.h) * viewport.height;

      for (const item of textContent.items) {
        // item.transform[4]=x, item.transform[5]=y in PDF coords (bottom-left origin)
        // Convert to top-left origin to match bomRegion convention
        const ix = item.transform[4];
        const iy = viewport.height - item.transform[5];
        if (ix >= rLeft && ix <= rRight && iy >= rTop && iy <= rBottom) {
          textCharCount += (item.str || '').length;
        }
      }
    } else {
      // No region defined — count full page (less reliable, but still useful for
      // the gate since no-region pages go through the modal anyway)
      textCharCount = textContent.items.reduce((sum, item) => sum + (item.str || '').length, 0);
    }
  } catch (e) {
    // pdf.js not available or page load failed — fall through to quality check
  }

  if (textCharCount > 20) return 'text-layer';  // meaningful text in the BOM region

  // Step 2: check PDF quality for image characteristics
  const q = page.pdfQuality || null;
  if (q) {
    if (q.isMonochrome) return 'scan';         // 1-bit fax = worst tier
    if (q.isScanned) return 'bitmap';           // embedded raster image
  }

  // Zero text in BOM region + no scanned images = vector-stroke (text as geometry)
  return 'vector-stroke';
}
```

**Design note for Marc:** Region-bounded counting is the HARD requirement here. The
Q3 measurement scripts proved `getTextContent()` returns 0 chars for vector-stroke
and bitmap BOM regions but 77-94 chars for their title blocks. The coordinate filter
uses pdf.js `item.transform[4]` (x) and `item.transform[5]` (y, bottom-left origin)
converted to top-left to match bomRegion's normalized convention. The threshold
(20 chars) should be tuned — a BOM with 50+ items will have hundreds of characters
inside the region; title-block chars are excluded by the bounds check.

**If no bomRegion exists:** Fall back to full-page count. This is less reliable but
acceptable because no-region pages go through the 1c modal regardless — the
classification informs the modal variant (soft nudge vs hard block), and whole-page
counting errs toward text-layer (the permissive variant), which is the right default
for a page where the user hasn't drawn a region yet.

**Integration:** The pre-flight quality check already runs at app.jsx:13604-13627.
The input tier classification should run at the same point, storing the result on
each BOM page object for downstream use by the gate (1c) and the extraction report.

**pdfQuality data availability:** `checkPdfQuality` CF (functions/index.js:2505) is
already called at app.jsx:13616 during pre-flight. Its result can be cached on page
objects. For the pdf.js text extraction, the PDF is already loaded client-side for
rendering — reuse that instance rather than re-downloading.

---

### Phase 1a — Aggregate detection summary

After `detectPageTypes` completes for all pages during `addFiles` (app.jsx:~23225-
23245), build an aggregate summary string and surface it.

**Location:** Inside `addFiles`, after the detection loop completes.

Count pages by type from the existing `page.types` arrays:
```javascript
const typeCounts = {};
for (const pg of updatedPages) {
  for (const t of getPageTypes(pg)) {
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }
}
const regionCount = updatedPages.filter(p => resolveBomRegion(p)).length;
const summary = Object.entries(typeCounts)
  .map(([t, n]) => `${n} ${t.toUpperCase()}`)
  .join(', ');
```

Surface as a brief toast or banner: `"Auto-detected: ${summary}. ${regionCount} BOM
region${regionCount !== 1 ? 's' : ''} found."`

This reads existing data — no new AI call. The pre-extraction banner at app.jsx:26663
already shows type tags; this adds the aggregate number.

---

### Phase 1c — Block-with-override gate

**Location:** At the extraction entry point. The "confirm and extract" flow starts
around app.jsx:23376 where `bomPages` is filtered. The gate goes BEFORE
`runExtractionTask` is called (line 23403).

**Gate logic (PATCHED v2 — corrected tier-to-copy mapping):**

```
for each BOM page:
  tier = classifyBomInputTier(page)  // from 1b
  region = resolveBomRegion(page)     // existing function at 14655
  worstTier = worst(tiers)            // no-pdf > scan > bitmap > vector-stroke > text-layer

CASE 1: ALL pages text-layer + ALL have region → PROCEED (no modal, no toast)
CASE 2: ALL pages text-layer + SOME lack region → SOFT NUDGE (Variant A modal)
        Easily dismissable. Extraction is already high-accuracy on text-layer.
        NOT a hard block — text-layer without region is a missed optimization, not
        a quality risk.
CASE 3: ANY page is vision-mode + ALL vision-mode pages have region → PROCEED
        with info toast ("Vision-mode drawing — results tagged for review")
CASE 4: ANY page is vision-mode + ANY vision-mode page lacks region → HARD BLOCK
        (Variant B modal). Requires drawn region OR conscious override.
```

The critical distinction: text-layer without region (Case 2) is a **soft nudge** —
the extraction will be fine, the region just makes it better. Vision-mode without
region (Case 4) is the **hard block** — extraction will be degraded and the user
needs to know.

**Modal component:**

New modal, pattern matches existing `arcAlert` / `arcConfirm` style.

**Variant A — TEXT-LAYER, no region (soft nudge, easily dismissed):**
> "This drawing's BOM is clear and readable, and ARC is extracting at high accuracy.
> To increase accuracy further, please region the BOM area."
>
> [Draw Region] [Continue Without Region]

No "manual verification required" tag on override — text-layer extraction is already
deterministic. "Continue Without Region" proceeds normally.

**Variant B — VISION-MODE (vector-stroke/bitmap/scan/no-pdf), no region (hard block):**
> "This drawing has a low-res or image-based BOM that requires more thought. Please
> region the BOM as tightly as possible to maximize accuracy. Results will need manual
> verification due to the poor source quality."
>
> [Draw Region] [Extract Anyway — Manual Verification Required]

Override tags result with `manualVerifyRequired = true`.

**Override behavior:**
- "Draw Region" → close modal, scroll to the page, enter region-drawing mode
- "Continue Without Region" (Variant A only) → proceed, no flag
- "Extract Anyway" (Variant B only) → proceed with extraction, set flag:
  `panel.extractionReport.manualVerifyRequired = true`

**manualVerifyRequired flag:** Persists on the panel. Surfaces in the extraction
report UI as an amber chip: "Manual verification required" (same style as the image
fallback pill from 1e-3). Only set on vision-mode overrides, never on text-layer.

---

### Phase 1d — No-PDF / 0-byte handling

**Location:** Inside the 1c gate logic, as a special case.

When `classifyBomInputTier` returns `'no-pdf'` for any BOM page:

> "No usable source PDF for this project. Re-upload the source PDF to enable
> high-quality extraction, or region the BOM and extract from the page image
> (manual verification required)."
>
> [Re-upload PDF] [Region & Extract from Image]

"Re-upload PDF" → navigate to the file upload section.
"Region & Extract" → proceed via image fallback path with manualVerifyRequired flag.

This is LAZY — only triggers when someone attempts extraction on a project with
missing/0-byte PDF. No proactive backfill scan.

---

### Phase 1f — Structural learning extension + L3 fix

**1f-1. Schema extension**

Extend the existing `region_learning` entry schema (saved at app.jsx:20613-20624).
Add fields to each entry:

```javascript
const entry = {
  // ... existing fields (id, label, type, note, pageTypeContext, thumbnail, regionBox, sourceCustomer, sourcePageName) ...
  inputTier: tier,                    // 'text-layer' | 'vector-stroke' | 'bitmap' | 'scan' | 'no-pdf'
  columnStructure: columnHints,       // future: detected column names/order
  // ... existing aiAnalysis added by background Haiku call ...
};
```

The `inputTier` comes from `classifyBomInputTier` (1b). Column structure detection
is future work — add the field now, populate later.

**1f-2. Migrate region learning to per-company scope (PATCHED v2 — Jon's decision)**

Region learning currently lives at `users/{uid}/config/region_learning` (per-user).
Migrate to `companies/{companyId}/config/region_learning` (per-company).

**Rationale:** The structural fingerprint thesis only works if corrections pool across
whoever touches a customer's drawings. Per-user gives two half-trained models when
two estimators work the same customer's projects. Per-company pools all learning.

**Migration approach:**
- New path: `_rlPath()` (app.jsx:12692) changes from `{configPath}/region_learning`
  to `companies/{companyId}/config/region_learning`. Use `_appCtx.companyId`.
- Read migration: on first load, check both paths. If per-user has entries and
  per-company is empty, copy per-user entries to per-company (one-time merge).
  If per-company already has entries, prefer per-company and ignore per-user.
- Write: all new entries go to per-company only.
- Clear `_regionLearningCache` on migration so subsequent reads hit the new path.

**Stricter human-confirmed weighting:** Under per-company scope, one bad correction
pollutes all team members. The existing human-confirmed weighting rule (learn
aggressively from explicit corrections, cautiously from un-objected auto-types) is
now LOAD-BEARING. Consider adding an admin-visible log of who contributed each
learning entry (`entry.contributedBy = uid`) for auditability.

**1f-3. Wire region learning into pdf-native and bom-region-crop paths (L3 fix)**

Currently, `buildRegionLearningContext` (app.jsx:12784) is only called in
`detectPageTypes` (app.jsx:14614) for the image-fallback path.

The extraction prompt construction happens at:
- **extractBomPageViaServer** (app.jsx:11674) — sends payload to CF
- **extractBomPage CF** (functions/index.js:2406-2451) — constructs prompt

Region learning context needs to be passed to the CF and included in the prompt for
pdf-native and bom-region-crop paths, not just image-fallback.

**Approach:** Add a `regionLearningHint` text field to the CF payload. Build it
client-side from `buildRegionLearningContext`, serialize as a text hint (not images —
images can't be sent alongside PDF documents in the same message). Append to the
user-content text block alongside feedbackSection and notesSection.

---

## PHASE 2 — Vector-Stroke Voting

**Files:** `src/app.jsx` (voting orchestration), `functions/index.js` (no CF changes —
voting is client-orchestrated, reuses existing extractBomPageViaServer)
**Deploy:** `bash deploy.sh`

### Voting orchestration

**Location:** Inside the BOM extraction flow at app.jsx:~13628-13900. Currently, each
BOM page is extracted once. For vector-stroke pages, extract N times and vote.

**Trigger:** `classifyBomInputTier(page) === 'vector-stroke'`

**Algorithm:**

```
N = 3  // initial pass count
resolvedRows = new Set()  // tracks rows that have reached stable consensus

for each vector-stroke BOM page:
  results = []
  for i in 1..N:
    result = extractBomPageViaServer(...)  // reuses existing function
    results.push(result)

  // Item-aligned majority vote
  voted = majorityVoteItems(results)

  // Convergence check: count NET NEW resolutions only.
  // A "resolution" = a row that was divergent in passes 1..(N-1) and now has
  // majority consensus in passes 1..N. A row that oscillates (consensus in pass 3,
  // loses it in pass 4, regains in pass 5) does NOT count as a new resolution on
  // pass 5 — it was already in resolvedRows from pass 3.
  newlyResolved = (rows with new consensus) minus resolvedRows
  resolvedRows = resolvedRows union newlyResolved

  if N < 5 AND newlyResolved.size >= 1:
    N++  // genuine progress — extend
  else:
    stop  // plateau or oscillation — stop
```

**majorityVoteItems function:**

Align items across runs by `itemNo` (integer sequence number). For each field in each
row, take the value that appears most often across N runs. Track per-row consensus:
- **Unanimous:** all N runs agree on all fields → high confidence
- **Majority:** >=2 of 3 (or >=3 of 5) agree → medium confidence
- **No majority:** no value appears >N/2 times → low confidence, flag for review

Store voting metadata on the extraction result:
```javascript
{
  votingPasses: N,
  unanimousRows: count,
  majorityRows: count,
  noMajorityRows: count,
  convergenceHistory: [{ pass: 1, divergentRows: X }, { pass: 2, divergentRows: Y }, ...]
}
```

### L2 test — Vector-stroke quality alert

In the CF prompt construction (functions/index.js:~2410-2418), add a vector-stroke
alert parallel to the existing scanned-document alert:

```javascript
const vectorStrokeAlert = (!pdfQuality.isScanned && !pdfQuality.imageCount && pdfQuality.hasVectorText)
  ? `\n\n⚠️ VECTOR-STROKE DRAWING ALERT: This page renders text as geometric paths (vector strokes), NOT as selectable text characters. The BOM table text is drawn as tiny line segments that look like characters visually but have no character-level encoding.\n\nAPPLY MAXIMUM SCRUTINY:\n- Characters are ambiguous by nature — B/8, O/0, S/5, I/1, G/6 are common confusions\n- Count characters in every part number carefully — stroke-rendered text often merges or splits characters\n- Default ALL rows to confidence "medium" unless the glyph is unambiguous\n` : '';
```

**Detection logic:** `imageCount === 0` AND `hasVectorText === true` AND NOT
`isScanned`. This is the signature of vector-stroke pages: font resources exist in
the PDF dictionary but the actual BOM content is rendered as drawing paths with no
embedded raster images.

Add to the prompt at line 2418:
```javascript
const pageHint = `${cropHintText}Extract ALL Bill of Materials...${qualityAlert}${vectorStrokeAlert}${noBomEscape}\n\n`;
```

**Measure:** Compare Probe 5's 60% exact-match baseline against extraction with the
new alert on the same 3 vector-stroke projects. If exact match improves, keep the
alert. If no change, it's free (no harm in extra scrutiny instructions).

### Honesty constraint (UI)

The voting result UI must NOT use words like "verified," "confirmed," or "validated."
Use: "N-pass consensus" or "majority agreement." The extraction report chip should
show voting metadata but frame it as consensus, not correctness:

```
"3-pass consensus: 45/47 rows unanimous, 2 majority"
```

Not:
```
"Verified: 45/47 rows confirmed"  // WRONG — correlated errors survive the vote
```

---

## Verification Gates

Coach verifies each phase before the next begins:

| Phase | Coach verification |
|-------|-------------------|
| 0a | Review timing logs. Confirm instrumentation captures all stages. Determine bottleneck. |
| 0b | Verify PRJ402101 extracts with margin. Confirm AC covers full pipeline. |
| 1e | Verify 0-byte guard in both CFs. Verify amber pill renders. Manual test with known 0-byte project. |
| 1b | Verify tier classification on all 3 tiers using known projects (text-layer, vector-stroke, bitmap). |
| 1a | Verify aggregate summary matches per-page tags. |
| 1c | Verify all 4 gate cases: (1) text-layer+region=silent, (2) text-layer+no-region=soft nudge, (3) vision+region=toast, (4) vision+no-region=hard block. Verify Variant A dismisses cleanly without flag. Verify Variant B override sets manualVerifyRequired. |
| 1d | Verify no-PDF detection and prompt on a known 0-byte project. |
| 1f | Verify schema extension persists. Verify region learning reaches pdf-native prompt. |
| 2 | Verify voting on all 3 vector-stroke projects. Confirm convergence logic. Measure L2 alert impact. |

---

## Risk Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Phase 0 bottleneck is model latency, not memory/parse | HIGH | Ship order inverts — 0b merges into Phase 1. Jon decides. |
| 1b text extraction check returns ambiguous results (stray title-block text) | MEDIUM | PATCHED: region-bounded counting is now HARD requirement. Title-block chars excluded by coordinate filter. Threshold tuning still needed. |
| 1c gate annoys power users who know what they're doing | MEDIUM | PATCHED: text-layer gets soft nudge (easily dismissed), not hard block. Strict-by-default only applies to vision-mode tiers. |
| Phase 2 item alignment fails on edge cases | LOW for vector-stroke | Vector-stroke structure is 60% exact — items align. Higher risk for future bitmap voting. |
| 1f schema migration on live region_learning data | LOW | Additive fields only — existing entries work without new fields. |
| 1f per-company learning: one bad correction pollutes all users | MEDIUM | PATCHED: human-confirmed weighting is now load-bearing. Add contributedBy audit field. |
| Phase 2 convergence churn (oscillating rows extend N to cap) | LOW | PATCHED: net-new-only counting. Oscillating rows don't re-trigger extension. |

# REQUIRED BOM REGION + INPUT-QUALITY-AWARE EXTRACTION — BRIEF

**Author:** Freddy Lyst (Analyst)
**Date:** 2026-06-05
**Status:** Brief + Coach Supplement — awaiting Analyst Review

---

## Background (what this session proved)

Extraction determinism is governed by ONE variable: whether the BOM page's content
is readable as text vs. must be read by vision-OCR. Measured hierarchy:

  Text-layer (100%) >> Vector-stroke (60% exact / 94% fuzzy) >> Bitmap (19-44%) >> Scan (4%)

Population (26 BOM projects):
  - 7 text-layer (27%) — deterministic, no fix needed, LEAVE ALONE
  - 19 vision-mode (73%):
      - 3 vector-stroke (71 BOM items) — Path A + voting → ~97% row stability
      - 16 bitmap (~800 items; 12 of these have no usable PDF) — floor-limited by
        source image quality; voting → ~67%, remainder needs external oracle

Render paths (Coach C30): Path A (PDF-native CropBox) = native quality, no JPEG, no
rasterization. Path B (JPEG crop from pre-rendered page, ~224 DPI, destructive on
1-bit monochrome) = degraded. A project takes Path A only if it has a valid
originalPdfPath. The 0-byte/no-PDF projects are forced off Path A silently.

## Core principle

This feature does NOT try to "render better." Path A is already best-available
quality. The job is: (1) guarantee every project can take Path A (valid PDF present),
(2) force region extraction through Path A never Path B, (3) make input quality
VISIBLE to the user before extraction and pull them in when it's bad, (4) add voting
where it pays off. Promise: "better and safer," NOT "fixed," for the bitmap tier.

---

## PHASE 0 — Large-PDF timeout fix (production reliability, ships FIRST)

PROBLEM: PRJ402101 (2.9MB, 23-page PDF) times out on 5 of 7 attempts at the 480s
Cloud Function ceiling. Time is spent on PDF download + pdf-lib parse BEFORE the
Anthropic API call starts. This kills extraction outright on large PDFs and MUST
land before any voting (voting triples extraction time on exactly these PDFs).

COACH VERIFY: where does the 480s actually go? Download vs pdf-lib parse vs page
render vs model call. The fix mechanism depends entirely on this — I am NOT
specifying a mechanism for a bottleneck we haven't located. Candidate directions to
assess, not prescribe: page-scoped PDF load (don't parse all 23 pages to read 1),
streaming/range download, raising the function timeout/memory, caching the parsed PDF.

ACCEPTANCE: a 2.9MB / 20+ page PDF extracts a single BOM page without timing out,
with margin to spare for a future N=3 voting pass.

JON: confirmed — Phase 0 ships first, on its own, ahead of the regioning UX.

---

## PHASE 1 — Required BOM region + input-quality pre-review + honest fallbacks

### 1a. AI auto-region pass (already exists — confirm + report)
ARC attempts to auto-detect region types. JON: BOM is the only GATED type for now.
Layout / Enclosure / Schematic are STAGED for future (they're primal today — see
ARC-VISION-ESTIMATOR-REVIEW.md / TODO #101). After the auto pass, REPORT to the user
which types were found (this closes the silent-operation gap).
COACH VERIFY: does auto-region currently classify types, and is the result surfaced
anywhere today, or is it dead/internal?

### 1b. Deterministic text-layer pre-review (the branch engine)
Before extracting, ARC assesses the BOM region's input class using DETERMINISTIC
signals (NOT an AI quality guess):
  - text-layer present (BOM content as selectable text) → text-layer tier
  - no text layer → classify vision-mode sub-tier: vector-stroke / bitmap / scan
  - native bitmap DPI (assessPdfPageQuality ALREADY computes this — COACH VERIFY:
    confirm it's computed and currently unused; route it into this gate)
  - no valid PDF (0-byte / missing) → worst-case, force the re-upload path (1d)

### 1c. Block-with-override gate
JON DECISION (confirmed): block-with-override.
  - Text-layer / clean input + BOM region present → PROCEED, no warning.
  - Vision-mode input AND no BOM region drawn → BLOCK. Modal requires EITHER a drawn
    region OR a conscious "Extract anyway — results need manual verification"
    acknowledgment. No silent path to a degraded extraction.
  - Modal copy escalates by tier (OPEN — see copy block below):
      * vision-mode, region missing: "Please select a BOM region to increase
        extraction accuracy."
      * low-resolution/bitmap/scan: "This drawing is low resolution. Please region
        the BOM as tightly as you can to maximize accuracy. Results will need manual
        verification."
  - Override path proceeds but TAGS the result as manually-verify-required (1e).

OPEN — JON: confirm the two copy strings above, or revise. (Recommend keeping them
short and non-technical; Noah/Ryan are the audience.)

### 1d. No-PDF / 0-byte handling (the 12 projects)
These can't take Path A — no valid PDF to CropBox from. They're stuck at the
uploaded image's resolution.
  - On extraction attempt, detect missing/0-byte PDF and prompt: "No usable source
    PDF for this project. Re-upload the source PDF to enable high-quality extraction,
    or region the BOM and extract from the page image (manual verification required)."
  - This makes the silent demotion VISIBLE.
OPEN — JON: for these 12 existing projects, do you want a one-time backfill prompt
(ARC flags them proactively and asks for re-upload) or only handle it lazily when
someone next re-extracts? Recommend LAZY — don't mass-nag on projects nobody's
touching.

### 1e. Reactive 0-byte hardening (folds the storage hotfix in here)
COACH VERIFY line refs:
  - Cloud Function extractBomPage (~functions/index.js:2370) lacks the buf.length===0
    guard the client already has (app.jsx:10164). Add it → return an actionable error,
    not opaque "INTERNAL".
  - Misleading message (~app.jsx:11891): "no PDF path" fires when the path EXISTS but
    the file is empty. Fix to "PDF file is empty — re-upload the source PDF."
  - VISIBLE extraction-path indicator: when extraction used the image fallback instead
    of PDF-native, surface it in the UI (NOT just console). This is the anti-silent-
    demotion flag. (I am promoting this from Marc's "LOW" to HIGH — it's the difference
    between a user trusting a degraded BOM and knowing to verify it.)
  - Cleanup: remove test file originalPdfs/test-zero-byte/test-0byte-probe4.pdf
    (0 bytes, client deletion blocked by rules — needs admin/gsutil) in this commit.

### 1f. Per-drawing structural learning (structure only — NOT content)
JON DECISION: scope (a) only — region placement + per-DRAWING format detection +
structural hints. When a user confirms or corrects a region, accumulate structural
signature (where the BOM sits, column structure, text-layer-vs-vision class) to make
future auto-region smarter.
HARD RULE: detect format PER DRAWING, never assume mode by customer. Census proved
this — FLS and OVIVO each appear in BOTH text-layer and vision-mode; the AutoCAD
"SHX text as geometry" export setting varies per drawing/engineer, not per customer.
HARD RULE: learn STRUCTURE, never PART-NUMBER CONTENT. Learning "this customer's PNs
look like X" and biasing OCR toward it = the C5 failure mode. Do not rebuild C5.
Weight learning by human-confirmed signal (learn aggressively from explicit
corrections, cautiously from un-objected auto-types).
COACH VERIFY: Jon recalls an early per-customer region-memory mechanism. Does any of
it still exist in code we can build on, or is this greenfield?
(Business-rule learning — customer-supplied items, habitual crosses — is OUT of scope,
staged to the vision doc.)

---

## PHASE 2 — Vector-stroke multi-pass voting (the proven cheap win)

JON DECISION: vector-first. Build voting for VECTOR-STROKE only. Bitmap voting STAGED,
gated on Phase 0 (don't triple latency on PDFs that already time out).

  - For vector-stroke input: extract N times, item-aligned majority vote per row.
    Probe 5: N=3 stabilizes ~97% of vector-stroke rows (77% unanimous + 20% majority).
  - OPEN — JON: N=3 default? (Recommend N=3 — Probe 5 measured it, good cost/benefit.
    N=5 buys little for 67% more cost.)
  - HONESTY CONSTRAINT: voting recovers CONSENSUS, not CORRECTNESS. Correlated OCR
    errors (all runs misread 0→O) survive the vote. Voting reduces noise; it does not
    establish ground truth. UI should not claim "verified."
  - Bitmap voting (STAGED, not this build): ~67% stabilization, 33% no-majority
    remainder needs the #85 Excel oracle. Revisit after Phase 0 lands.

---

## EXPLICITLY OUT OF SCOPE / DEFERRED

  - Bitmap/scan accuracy beyond "flag for review" — needs #85 Excel cross-check,
    which is now the single highest-leverage item for real BOM accuracy by VOLUME
    (~800 of ~870 vision-mode items are bitmap). Recommend #85 be reframed from
    "feature" to "the accuracy oracle for the bitmap tier" and prioritized after this.
  - Layout / Enclosure / Schematic region types and the estimator's-eye cross-check
    (TODO #101 / ARC-VISION-ESTIMATOR-REVIEW.md).
  - C5 auto-cross — separate; freeze recommended near-term (degrades on stochastic
    bitmap reads), full fix later.

---

## PHASE / SHIP ORDER

  Phase 0 (timeout)        — ships first, standalone, mechanism pending Coach trace
  Phase 1 (regioning+gate+0-byte hardening) — the core feature
  Phase 2 (vector voting)  — after Phase 0
  Bitmap voting + #85       — staged, separate effort

---
---

# COACH SUPPLEMENT

**Author:** Sam Wize (Coach), Senior Development Engineer, Architecture
**Date:** 2026-06-05
**Finding:** C31

---

## COACH VERIFY Confirmations

### Phase 0 — Timeout root-cause trace

**The Brief's claim that time is spent "on PDF download + pdf-lib parse BEFORE the
Anthropic API call" is UNVERIFIED.** No timing instrumentation exists between pipeline
stages. Here's what the code shows:

**Pipeline (extractBomPage, functions/index.js):**
1. PDF download — `file.download()` at line 2370 (full 2.9MB buffer, no streaming)
2. pdf-lib parse — `PDFDocument.load(buf)` at line 2371 (parses ALL 23 pages into memory)
3. Page slice — `copyPages` + `save` at lines 2376-2401 (creates + serializes single page)
4. Prompt construction — lines 2406-2451
5. Anthropic API call — `fetch()` at line 2460, protected by 480s AbortController (line 2457)

**The 480s timeout is on the API fetch call only (line 2457-2458), not on the full
pipeline.** The CF timeout is 540s (line 2323). So the budget is:

    download + parse + slice + prompt = X seconds
    API call ≤ 480s
    Total must be < 540s

If pre-API work takes 30-60s, the API gets 480s but the CF only has 480-510s left.
The AbortController doesn't save you if total pipeline time exceeds 540s.

**Memory is a likely contributor.** extractBomPage runs with **1GB** memory (line 2323).
extractBomBatch runs with **2GB** (line 2548). pdf-lib builds an in-memory object tree
that can easily 10× the raw PDF size. For a 2.9MB PDF with 23 pages of embedded
images, that's potentially 30MB+ of parsed objects. On 1GB, Node.js GC thrashing
could add significant latency to every stage.

**Existing logs don't measure stage timing.** The logs at lines 2404 ("PDF sliced")
and 2453 ("starting") are events, not durations. No elapsed-time measurement exists
between download → parse → slice → API call.

**RECOMMENDATION for Phase 0:**
1. **First:** Add timing instrumentation (Date.now() deltas between each stage). Deploy
   and re-extract PRJ402101. The fix mechanism depends on where the seconds actually go.
2. **Quick win to try:** Bump extractBomPage memory from 1GB to 2GB (match
   extractBomBatch). If the same PDF succeeds in extractBomBatch, memory is the answer.
3. **If API call is the bottleneck:** Opus + thinking on a large single-page PDF with
   embedded monochrome bitmap may genuinely take 400+ seconds. No simple fix — but
   CropBox (reducing the PDF viewport to just the BOM region) should cut model
   processing time significantly. This ties Phase 0 to Phase 1 (regioning).
4. **Candidate: skip full-document parse.** pdf-lib loads ALL pages to extract one.
   A buffer-surgery approach (copy page objects by reference without parsing the full
   cross-reference table) could skip most of the parse work. Complex but high-leverage
   for 23-page PDFs.

**Risk:** If the bottleneck is model latency on large embedded bitmaps, Phase 2
voting (3× API calls) will 3× the timeout on exactly these PDFs. Phase 0 MUST include
enough margin for N=3. This validates the Brief's ship-order decision (Phase 0 first).

---

### 1a. Auto-region — CONFIRMED, partially surfaced

Auto-region detection EXISTS and classifies 5 types: bom, schematic, backpanel,
enclosure, pid. Implemented in `detectPageTypes` (app.jsx:14600-14640) using
Claude Sonnet. When BOM is detected, the AI returns a bounding box (`aiBomRegion`
with normalized {x,y,w,h} coordinates).

**Surfacing:**
- **YES:** Colored tag buttons on each page thumbnail (app.jsx:26500-26532) — users
  see BOM/SCH/BP/ENC/PID tags immediately after detection.
- **YES:** Pre-extraction confirmation banner (app.jsx:26663-26683) shows detected
  types and BOM region count: "N BOM regions defined."
- **NO:** No aggregate summary toast/notification ("Auto-detected: 3 BOM, 2 SCH,
  1 ENC"). Users see per-page tags but no "here's what we found" overview.

**Dead code:** `autoDetect()` (app.jsx:~24000) is defined but NEVER CALLED. Detection
only fires during `addFiles` (upload flow). There is no way to re-run detection on
already-uploaded pages without re-uploading.

**Gap for the Brief:** The "REPORT to the user which types were found" is partially in
place via tags. The missing piece is the aggregate summary + the ability to re-trigger
detection. For the Required-BOM-Region gate, the check should query the existing
`page.types` / `page.aiBomRegion` — no new detection pass needed, just a gate on the
existing data.

---

### 1b. assessPdfPageQuality — CORRECTION to Brief

The Brief says "ALREADY computes this — confirm it's computed and currently unused."

**CORRECTION:** It IS computed and it IS used — just not for ROUTING.

Current usage (functions/index.js:2265-2315):
- Computes: `isScanned`, `isMonochrome`, `estimatedDpi`, `imageCount`, `hasVectorText`,
  `warningLevel` (line 2266)
- DPI calculation: `Math.round(w / (pageSize.width / 72))` (line 2303)
- **Returned to client** in response payload (line 2502, 2712)
- **Fed into AI prompt** as a quality alert when `warningLevel !== 'none'` (line 2410-2411)
  — tells the model to apply maximum scrutiny on scanned/monochrome content
- **Surfaced in UI:**
  - Green "PDF native" pill when pdf-native path was used (app.jsx:26849-26854)
  - Scan quality warning chip when quality is low (app.jsx:26856-26870)
  - Per-page extraction path with green/amber color in results table (app.jsx:22012)

**NOT used for:** routing decisions, parameter adjustment, DPI changes, path selection.
The routing is entirely driven by input availability (PDF exists → pdf-native; no PDF
→ image fallback), never by quality assessment.

**Critical blindspot for Phase 1b:** `assessPdfPageQuality` is BLIND to vector-stroke
BOMs. It checks `hasVectorText` by looking for Font resources in the page dictionary
(line 2273-2278). Vector-stroke BOMs have font resources (for title blocks etc.) but
render BOM text as geometric paths — so `hasVectorText: true` but NO extractable text.
And since vector-stroke pages have no embedded images (imageCount=0), `isScanned: false`,
`warningLevel: 'none'`. They look "clean" to this function.

**The 1b branch engine cannot rely solely on assessPdfPageQuality.** It needs a
supplementary check: attempt text extraction on the BOM region and check character
count. Zero characters in the BOM region + hasVectorText = vector-stroke tier.
This is a pdf.js operation (client-side, already loaded for rendering), not a new
dependency.

---

### 1e. 0-byte guards — CONFIRMED with corrections

**CF guard MISSING — confirmed.** At functions/index.js:2370-2371:
```javascript
const [buf] = await file.download();
const fullPdf = await PDFDocument.load(buf);
```
No `buf.length === 0` check. A 0-byte PDF will cause PDFDocument.load to throw an
opaque parse error, not an actionable "file is empty" message.

**Client guard EXISTS** at app.jsx:10164:
```javascript
if(!fullBuf.byteLength)throw new Error("PDF file is empty (0 bytes) at "+storagePath+" — re-upload the source PDF");
```
This is correct — clear message, actionable instruction.

**Misleading message — CORRECTION to Brief.** The message at app.jsx:11891:
```
"BOM extraction failed: no PDF path and no cropped BOM image available"
```
This fires when NEITHER input source exists (no pdfPath AND no croppedBomDataUrl).
It's not specifically about 0-byte files — 0-byte files would throw earlier from
`loadOriginalPdfAsBase64` (client-side) or from PDFDocument.load crashing (server-side).
The Brief's description "fires when the path EXISTS but the file is empty" is
inaccurate — this path fires when there's no path at all. The 0-byte case produces a
different, worse error (opaque pdf-lib crash on the CF side).

**Extraction path indicator — PARTIALLY in UI.** The Brief says to promote surfacing
the fallback path to HIGH. Current state:
- Green "PDF native" pill shows ONLY when pdf-native was used (app.jsx:26849-26854)
- Per-page path shown in extraction results detail table (app.jsx:22012, green/amber)
- **NO indicator when image fallback was used** — the UI only celebrates the good
  path, doesn't flag the bad one

The Brief's promotion to HIGH is warranted. Add an amber "Image fallback" or
"Degraded input" pill alongside the green "PDF native" pill. Make the bad path visible.

---

### 1f. Region memory — EXISTS, NOT greenfield

**Substantial infrastructure already in place.** Jon's recollection is correct.

`region_learning` at `users/{uid}/config/region_learning` (app.jsx:12691-12718):
- Stores full region coordinates: `regionBox: {x, y, w, h}` (normalized 0-1)
- Customer context: `sourceCustomer`, `sourcePageName`
- Region type and label
- Cropped thumbnail (base64)
- Background AI analysis via Haiku
- 30-entry sliding window (oldest auto-pruned, line 12701-12704)

**Already fed into extraction prompts** via `buildRegionLearningContext` (app.jsx:12784),
which passes up to 3 examples as visual context to the AI. Currently only fed into the
image-fallback path (app.jsx:14614), NOT into pdf-native or bom-region-crop paths.

**Existing UI** for viewing/managing examples (app.jsx:17350-17381): shows saved
examples in reverse chronological order with a "30 of 30 examples saved" counter.

**What's missing for 1f:**
- No text-layer-vs-vision classification stored per drawing (structural fingerprint)
- No column structure detection
- Learning is per-user, not per-customer (the Firestore path is `users/{uid}/config/...`)
- Learning examples are fed ONLY to the image-fallback path, not to the dominant
  pdf-native path

**Build-on, don't rebuild.** Extend the existing `region_learning` schema with the
structural metadata the Brief describes. The CRUD infrastructure, sliding window, UI,
and prompt integration are already working.

---

## Feasibility and Risk Assessment

### Phase 0 — Large-PDF timeout fix

**Feasibility: HIGH** (but fix mechanism is undetermined)

| Candidate | Effort | Risk |
|-----------|--------|------|
| Memory bump 1GB→2GB | 1 line | Low — try first, may solve it |
| Timing instrumentation | ~20 lines | None — diagnostic, deploy first |
| Page-scoped PDF load | Medium | Medium — pdf-lib doesn't support partial load natively |
| CropBox before API call | Already exists | Ties Phase 0 to Phase 1 (regioning) |

**Risk:** If model latency is the bottleneck (not download/parse/memory), there is no
quick fix. CropBox (Phase 1) may be the real solution — smaller viewport = faster
model processing. This could invert the ship order: Phase 1 regioning might need to
land WITH Phase 0, not after it.

---

### Phase 1 — Required BOM region + quality gate

**Feasibility: HIGH** — most infrastructure exists

| Sub-phase | New code | Existing infra | Risk |
|-----------|----------|----------------|------|
| 1a. Report detection results | Aggregate summary UI | detectPageTypes, page tags | Low |
| 1b. Input class branch engine | Text extraction check | assessPdfPageQuality | Medium — vector-stroke detection needs new logic |
| 1c. Block-with-override modal | New modal component | — | Medium — UX tuning, user pushback risk |
| 1d. No-PDF handling | Detection + prompt UI | Client 0-byte guard | Low |
| 1e. 0-byte hardening | CF guard + UI pill | Client guard, extraction path logging | Low |
| 1f. Structural learning | Schema extension | region_learning CRUD, UI, prompt integration | Medium — schema migration on live data |

**Key risk (1b):** The vector-stroke detection gap. assessPdfPageQuality can't
distinguish "has real text layer" from "has font resources but renders text as
geometry." Need a supplementary text-extraction check. This is the most technically
uncertain piece — but pdf.js `page.getTextContent()` on the BOM region should work
(it's what the Q3 measurement scripts used successfully).

**Key risk (1c):** The gate is user-facing and affects workflow speed. Too aggressive =
annoyed power users. Too passive = doesn't prevent degraded extractions. Recommend
starting strict (block by default) and loosening based on feedback — easier to relax
a gate than to tighten one after users are habituated to skipping it.

---

### Phase 2 — Vector-stroke voting

**Feasibility: HIGH** for vector-stroke

| Concern | Assessment |
|---------|------------|
| Item alignment across runs | Low risk — Probe 5 showed vector-stroke structure is stable (60% exact), items align reliably |
| Cost (3× API calls) | Acceptable — vector-stroke PDFs are small, fast to extract |
| Latency | ~3× wall-clock per page — acceptable for 3 vector-stroke projects |
| Correlated errors | Known limitation — voting can't fix systematic OCR errors (B↔8 etc.) |

**Risk for future bitmap voting:** Item alignment is NOT guaranteed for bitmap tier.
Different runs may extract different item counts (19-44% determinism). Majority vote
on misaligned items is meaningless. Bitmap voting needs an alignment strategy (possibly
itemNo-based or y-position-based) before it's viable. This validates the Brief's
decision to defer bitmap voting.

---

## Line-Level Concerns

### L1. AbortController placement doesn't protect total pipeline time
The 480s AC (functions/index.js:2457) covers only the API fetch call. If pre-API work
takes 60s, total pipeline = 60 + 480 = 540s = exactly the CF timeout. Any variance
and the CF kills the function before the AC fires. Consider: start the AC timer at
function entry, not at the fetch call. Or: reduce AC timeout to 540 - measured_preAPI.

### L2. Quality alert is blind to vector-stroke BOMs
The prompt quality alert (functions/index.js:2410-2411) fires on
`warningLevel !== 'none'`. Vector-stroke BOMs get `warningLevel: 'none'` (no embedded
images → `isScanned: false`). The model receives NO warning that it's reading geometric
paths, not text. Probe 5's 60% exact-match rate might improve if the model knew.

### L3. Region learning feeds only the worst extraction path
`buildRegionLearningContext` (app.jsx:12784) is injected into the image-fallback
prompt (app.jsx:14614 via `regionParts`). It is NOT injected into pdf-native or
bom-region-crop paths. The 73% of vision-mode projects that take pdf-native with
CropBox get no benefit from accumulated region learning. If region learning informs
prompt construction (e.g., column structure hints), it should feed ALL paths.

### L4. extractBomBatch also lacks 0-byte guard
The Brief's 1e focuses on extractBomPage, but extractBomBatch (functions/index.js:2582)
has the same gap: `const [buf] = await file.download()` followed immediately by
`PDFDocument.load(buf)` with no empty-buffer check. Both functions need the guard.

### L5. autoDetect() is dead code — decision needed
The dead `autoDetect()` function (app.jsx:~24000) suggests someone planned a manual
re-detection trigger. Phase 1a should either revive it (let users re-run detection on
existing pages) or delete it. Dead code that looks functional is a maintenance trap.

### L6. Client-side PDF load duplicates the full-document parse problem
`loadOriginalPdfAsBase64` (app.jsx:10157-10202) mirrors the CF pipeline: download full
PDF → PDFDocument.load (all pages) → copyPages (1 page). The client-side path has the
same full-parse inefficiency as the CF. If Phase 0 optimizes the CF path, consider
matching the optimization client-side.

---

## Summary

The Brief is architecturally sound. The phasing is correct, the scope boundaries are
right, and the core principle ("ensure Path A, don't try to render better") aligns
with C30's findings. Key corrections:

1. **Phase 0 needs timing data first** — don't prescribe a fix for an undiagnosed
   bottleneck. Memory bump is the cheapest first try.
2. **assessPdfPageQuality is not unused** — it's surfaced and prompt-enhanced, just
   not used for routing. The Brief's 1b branch engine needs a supplementary
   text-extraction check for vector-stroke detection.
3. **Region learning exists** — 1f is an extension, not a greenfield build.
4. **The 0-byte guard gap exists in BOTH CF functions** (extractBomPage AND
   extractBomBatch), not just one.
5. **Extraction path UI indicator partially exists** (green pill for pdf-native) but
   doesn't flag the degraded path. Add an amber indicator for image fallback.

No blocking issues found. All phases are feasible. Phase 0 is correctly prioritized —
voting without timeout margin is a production risk.

# PRJ402119 Extraction Regression — Code-Path Findings

**Author:** Sam Wize (Coach) · 2026-06-03  
**Status:** CLOSED — #82 deploy gap DISPROVEN (C22, 2026-06-03)  
**Scope:** Read-only code + repo-record investigation. No diagnosis, no fix.

> **C22 Correction (2026-06-03):** Deploy gap DISPROVEN. P1/P2 verified live via
> byte-for-byte deployed-source diff (Cloud Functions REST API `generateDownloadUrl`
> → extracted archive → `diff` against committed `functions/index.js` = zero diff)
> + behavioral log showing scanned PDF (`isScanned:true`, `warningLevel:"high"`)
> extracting to completion (`rawChars:17232`) on 2026-06-03. The C21 conclusion
> "fixes likely not live" was wrong — there is no repo-record deploy evidence at
> all (no CI, no deploy log, `deploy.sh` is hosting-only), so absence of evidence
> was misread as evidence of absence. Functions were deployed at 2026-06-02T21:49:04Z
> (between the P2 commit at 21:31Z and the P1 commit at 21:51Z — deployed from the
> working tree before P1 was committed). #82 closed.

---

## Task 1: Current Repo State

### #82 — PDF-native bails on scanned-bitmap BOM pages

**STATUS: COMMITTED, DEPLOYMENT UNCONFIRMED**

Two sub-fixes committed to `functions/index.js`:

| Fix | Commit | What it does |
|-----|--------|-------------|
| **P1** | `10fdced5` (2026-06-02) | Removes `noBomReason` escape from PDF-native prompt when CropBox is applied (`pdfCropped === true`). Forces extraction attempt instead of allowing the model to bail with "wrong-page-type". |
| **P2** | `4e31f918` (2026-06-02) | Adds scan quality alert to `bom-region-crop` fallback prompt — character-count checks, ambiguity guidance, confidence defaults. |

**CRITICAL: Both fixes are in `functions/index.js`, which deploys separately from hosting.** `deploy.sh` runs `firebase deploy --only hosting`. Cloud Functions require `firebase deploy --only functions`.

Evidence of deployment status:
- `git log --oneline 10fdced5..HEAD -- functions/index.js` returns **empty** — no further changes to functions after the fix.
- No commit message in the subsequent 15 commits (v1.20.85 through v1.20.94) mentions a functions deploy.
- SESSION-STATE.md has no functions deploy record.
- The release commits (v1.20.85 through v1.20.94) are all `deploy.sh` runs — hosting only.

**Assessment: The #82 P1/P2 fixes are committed to git but there is no repo-record evidence that `firebase deploy --only functions` was run after they were committed.** If the functions were not deployed, the production Cloud Function `extractBomPage` is running the pre-fix code — which still offers the `noBomReason` escape on CropBox-applied pages, and the bom-region-crop fallback prompt still lacks quality alerts.

### #83 — Reliable routing of scanned docs to JPEG+P2 path

**STATUS: OPEN — never implemented**

TODO #83 is marked OPEN. It describes the target architecture: PDF-native primary → full-res PDF region crop fallback → fail visibly. No commits reference #83 as RESOLVED. The current architecture still uses lossy JPEG crop as the fallback, not a full-res PDF CropBox.

### H10 — Re-extraction silent discard

**STATUS: OPEN — never shipped**

TODO #57 and #58 (H10 components) are both marked OPEN. The re-extraction path still:
- Missing `bomRegion` in batch payload (line 22481 — confirmed still absent in current code; TODO #57)
- Silently discards `extractionVerification` (lines 22504–22511; TODO #58)
- Has no L3 retry/gap-fill
- Has no missing-from-start detection in the final gap check

H10 was logged as "Monday work" on 2026-05-22. It was never implemented.

### Zero-BOM-pages warning

**STATUS: SHIPPED — fires at line 23356**

When `bomPages.length === 0 && !willValidate`, the code:
1. Fires `bgDone` with "⚠ No BOM pages" (line 23357)
2. Writes a debug log entry (lines 23361–23364)
3. Shows an `arcAlert` modal to the user (lines 23366–23370)

This warning is **not silent** — it shows a visible modal. If Noah saw "empty BOM, labor lines only" WITHOUT seeing this modal, then BOM pages WERE classified (the filter at line 23353 found at least one page), and the extraction ran but returned zero items.

---

## Task 2: Routing Trace

### How path selection works for a scanned drawing

The extraction path is determined by two factors:

1. **Does the page have `originalPdfPath`?** — Set during file upload when the source file is a PDF. Present on all PDF-uploaded pages, including scanned-bitmap-in-PDF.

2. **Does the page have a `bomRegion`?** — Set by user-drawn regions or AI-detected `aiBomRegion` (via `resolveBomRegion`, line 14638).

The routing logic at `extractBomPageViaServer` (line 11677):

| `originalPdfPath` present? | `croppedBomDataUrl` present? | Path taken | What it sends |
|---------------------------|----------------------------|-----------|--------------|
| YES | Either | `pdf-native` | Native PDF (single-page slice) to Cloud Function |
| NO | YES | `bom-region-crop` | JPEG crop image to Cloud Function |
| NO | NO | Error thrown | "requires native PDF or cropped BOM image" |

**For PRJ402119 (scanned PDF):** `originalPdfPath` IS present (it was uploaded as a PDF). Therefore the routing ALWAYS selects `pdf-native`, regardless of whether a bomRegion exists. The JPEG+P2 path (`bom-region-crop`) only fires when `originalPdfPath` is absent (legacy projects, or when the PDF-native server call fails and falls back).

### The fallback chain (lines 11758–11793)

When the PDF-native path returns 0 items, the client-side code has retry logic:

```
1. Server PDF-native (with CropBox if bomRegion exists)
   → 0 items?
2. If no bomRegion was used: retry via JPEG crop fallback (line 11769)
   → This is the bom-region-crop path
3. If bomRegion WAS used (CropBox applied, still 0): retry WITHOUT crop (line 11783)
   → Full-page PDF-native, no CropBox
```

**Critical question: does step 2 fire for PRJ402119?**

If PRJ402119 has NO bomRegion (no user-drawn region, no `aiBomRegion`), then:
- Step 1: PDF-native, full page → returns 0 items (scanned bitmap, model bails)
- Step 2 check: `!bomRegion && croppedBomDataUrl` — but `croppedBomDataUrl` is only set when `resolveBomRegion` returns a region (line 11480). No region → no crop → `croppedBomDataUrl` is null → step 2 does NOT fire
- Falls through to `return serverResult` at line 11793 — the empty result

If PRJ402119 HAS a bomRegion (user-drawn or `aiBomRegion`):
- Step 1: PDF-native with CropBox → The #82 P1 fix removes the `noBomReason` escape **IF DEPLOYED**. If not deployed, model can still bail.
- Step 3 fires if step 1 returned 0: retry full-page PDF-native without CropBox → model sees the full busy page → likely bails again on scanned bitmap

### Where a scanned drawing gets mis-routed

The current code does NOT have a "detect scanned → force JPEG path" router. The `assessPdfPageQuality` function runs server-side (line 2403) and populates `pdfQuality`, but this is used only for prompt enhancement (quality alert text), NOT for path selection. A scanned-bitmap PDF always takes the `pdf-native` path, relying on the prompt to coerce the model into extracting despite bitmap content.

**The JPEG+P2 path that produced 13/14 only fires when `originalPdfPath` is absent** (or the server call throws an error, triggering the direct-API fallback at line 11794+). There is no "scanned → prefer JPEG" routing anywhere in the current code.

### Recent commits touching routing

No commit after `10fdced5` (#82 P1, 2026-06-02) touched `functions/index.js` or extraction path selection logic in `src/app.jsx`. The Extraction Path Change Protocol in CLAUDE.md was not triggered because no extraction path changes were made. The recent commits (v1.20.86–v1.20.94) are all process/tooling changes.

---

## Task 3: Page Classification

For PRJ402119's drawing pages to yield zero BOM items, one of two things happened:

**A. Zero BOM pages classified:** `detectPageTypes` did not tag any page as "bom" → the zero-BOM warning modal fired → Noah should have seen it. If he didn't see a warning, this isn't the cause.

**B. BOM pages classified, extraction returned empty:** Pages were tagged as "bom", extraction ran via PDF-native, and the Cloud Function returned zero items. This is the #82 pattern — scanned bitmap, model bails with `noBomReason:"wrong-page-type"` because the P1 fix (removing the escape) may not be deployed.

The `getPageTypes` function (line 12727) unions AI-detected types with region-based types. If the user drew a BOM region, the page is always tagged as "bom" regardless of AI classification. PRJ402119's previous 13/14 extraction implies the page WAS classified as BOM in prior runs.

---

## Task 4: Rule Out #92

The #92 re-key (`_pendingPagesCache` keyed by `${projectId}:${panelId}`) does NOT affect the extraction pipeline:

1. **Cache write** (line 23264): `pendingPagesSet(projectId, panel.id, ...)` — uses composite key. ✓
2. **Cache read** (line 22459): `pendingPagesGet(projectId, panel.id)` — uses composite key. ✓
3. **Cache clear** (line 23342): `pendingPagesClear(projectId, panel.id)` — uses composite key. ✓
4. **Extraction input** (line 23330): `const livePages = pendingPages.length > 0 ? pendingPages : (panel.pages || [])` — reads from React state (`pendingPages`), which was populated from the cache at mount. Does NOT read the cache directly during extraction.
5. **BOM page filter** (line 23353): `updated.pages.filter(p => getPageTypes(p).includes("bom") && p.dataUrl)` — operates on the pages array already in React state.

**Verdict: #92 re-key is ruled out.** The extraction pipeline never touches `_pendingPagesCache` directly — it uses the React state that was populated from the cache at PanelCard mount. The re-key changed key construction but not the cache API semantics. Drawings are present in the UI (confirming cache reads work), and the same pages flow into extraction.

---

## Summary: Which Known-Open Item Does This Map To?

| Hypothesis | Maps to | Status | Likelihood |
|-----------|---------|--------|-----------|
| **PDF-native returns empty on scanned bitmap because #82 P1 fix not deployed to production Cloud Functions** | #82 | Committed, deploy unconfirmed | **HIGH — PRIME SUSPECT** |
| Zero BOM pages classified | Zero-BOM warning | Shipped (warning fires) | LOW — Noah would have seen the modal |
| Re-extraction silent discard | H10 | OPEN (never shipped) | MEDIUM — only if this was a re-extraction |
| #92 cache re-key broke extraction input | #92 | Shipped, ruled out | **NONE** |
| New regression from recent code changes | — | No extraction code changed since #82 | **NONE** |

**Most likely scenario:** PRJ402119's scanned-bitmap PDF is routed to `pdf-native` (because `originalPdfPath` exists). The production Cloud Function is running the PRE-#82-P1 code (noBomReason escape still offered). The model sees a busy scanned page and takes the escape, returning `{items:[], noBomReason:"wrong-page-type"}`. The client-side fallback chain doesn't fire because there's no `croppedBomDataUrl` (no bomRegion → no JPEG crop prepared). Result: zero BOM items.

The prior 13/14 extraction likely took the JPEG crop path because it was triggered differently (possibly with a drawn BOM region, or from a code version that had different path priority, or via re-extraction which has different routing).

---

## Single Runtime Confirmation for Dev Session

**Check #1 (5 seconds — definitive):**

Run in browser console while on PRJ402119:
```js
// Check which extraction path the last extraction took
const panel = /* current panel */;
console.log('extractionReport:', panel.extractionReport);
console.log('path:', panel.extractionReport?.extractionPath);
console.log('perPage:', panel.extractionReport?.perPageOutcomes);
```

If `extractionPath` is `"pdf-native"` and `rawCount` is 0, the model bailed on the scanned bitmap — confirms the #82 undeployed-fix hypothesis.

**Check #2 (30 seconds — confirms deploy status):**

From the Firebase Console or CLI:
```bash
firebase functions:log --only extractBomPage | head -20
```

Look for recent `extractBomPage PDF sliced` log entries. If the log shows `pdfCropped: true` but the function returned `noBomReason`, the P1 fix is not deployed. If the log shows `pdfCropped: false` (no CropBox applied because no bomRegion), the function saw the full page and bailed.

**Check #3 (if Check #1 shows path = bom-region-crop):**

If the path was JPEG crop, the empty BOM is a different failure. Check `panel.extractionReport.scanQuality` and the raw character count — garbled extraction at low DPI could produce items that all fail parse, yielding zero surviving rows.

---

## Cheap Discriminator (for Noah, parallel to runtime work)

Ask Noah:
1. **First extraction or re-extraction?** First + silent-empty → routing (#82). Re-extraction + silent-empty → H10 silent discard.
2. **Did a warning or error appear?** Warning shown → zero-BOM classification fired. No warning → silent path (routing or H10).
3. **Does the panel have a user-drawn BOM region?** If yes → CropBox should apply → #82 P1 is the gate. If no → no CropBox, no JPEG crop, full-page PDF-native → model bails on busy scanned page.

# BOM Extraction Accuracy — Region Cropping, Description Crosses, and MFG/PART NO. Format

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix catastrophic BOM extraction accuracy on dense multi-content pages (Clearstream-style drawings) by cropping BOM regions before extraction, add description-to-part-number learning for rows extracted without part numbers, and enhance prompt handling of combined MFG/PART NO. columns.

**Architecture:** Three independent features that stack: (1) BOM region crop sends a focused image to the API instead of the full busy page, dramatically improving character-level accuracy; (2) a new "description cross" learning database auto-populates part numbers on future extractions when a row's description matches a previously-filled blank-PN row; (3) prompt enhancements for the combined MFG/PART NO. column pattern common in Clearstream and similar drawings.

**Tech Stack:** React (JSX, single-file app.jsx), Firebase Firestore, Anthropic API (Opus for BOM extraction), Canvas API for image cropping, pdf-lib for PDF page slicing.

---

## Background — The Problem

PRJ402100 (Clearstream Environmental, Abbeville Clarifier, drawing CP.120) demonstrated catastrophic extraction failure: **1 correct part number out of 28 items**. Five items were completely missing, and the rest were garbled beyond recognition.

### Root Causes Identified

1. **BOM table is ~15% of a dense page.** Sheet 2/2 contains a full schematic (left half), terminal block diagram (lower right), legend, title block, AND the BOM table (upper right). The API processes the entire page, and the BOM text is small relative to the visual noise.

2. **Full page sent to API, not cropped BOM.** `getExtractionUnits()` detects BOM regions but sends the entire PDF page with only a text hint. The AI reads the BOM at the page's native rendering resolution, which is insufficient for dense alphanumeric part numbers.

3. **Combined MFG/PART NO. column.** Clearstream's BOM has 5 columns: ITEM, QTY, TAG, MFG/PART NO., DESCRIPTION — no separate manufacturer column. The MFG/PART NO. column packs manufacturer names AND part numbers (and sometimes multiple PNs) into one cell.

4. **Rows with no part number.** Items like TERMINAL BLOCK, GROUNDING BLOCK, END BARRIER, etc. are extracted correctly with descriptions but N/A part numbers. Users must manually fill these from BC Item Browser, and that knowledge is currently lost for future extractions.

5. **No customer-format memory.** There's no system to remember Clearstream's BOM format for repeat jobs.

---

## File Map

| File | Changes | Responsibility |
|------|---------|---------------|
| `src/app.jsx:10014-10028` | Modify `getExtractionUnits()` | Add actual image crop when BOM region exists |
| `src/app.jsx:9996-10013` | Modify `cropRegionFromImage()` | May need resolution increase for BOM crops |
| `src/app.jsx:10218-10330` | Modify `extractBomPage()` + `extractBomPageViaServer()` | Accept cropped image as extraction input alongside native PDF |
| `src/app.jsx:12030-12063` | Modify BOM extraction pipeline | Pass crop data through to extraction |
| `src/app.jsx:12759-12794` | Modify `detectPageTypes()` | Return BOM bounding box coordinates from detection |
| `src/app.jsx:~2055-2130` | New section after corrections DB | Description cross learning database (load/save/apply) |
| `src/app.jsx:8936-9010` | Modify `applyLearnedCorrections()` | Add description-cross application step |
| `src/app.jsx:22941-23095` | Modify `commitBcItem()` | Save description cross when filling blank-PN row |
| `src/app.jsx:9679-9993` | Modify `BOM_PROMPT` | Enhanced MFG/PART NO. handling |
| `functions/bomPrompt.js:1-324` | Modify `BOM_PROMPT` | Mirror prompt changes (keep in sync) |
| `functions/index.js:1988-2103` | Modify `extractBomPage` Cloud Function | Accept cropped image input for region-based extraction |

---

## Task 1: BOM Region Auto-Detection in Page Type Detection

**Goal:** When the AI detects a BOM on a page, also return the bounding box coordinates of the BOM table. This gives us coordinates to crop even when the user hasn't manually drawn a region.

**Files:**
- Modify: `src/app.jsx:12759-12794` (detectPageTypes function)

- [ ] **Step 1: Add BOM bounding box to page type detection prompt**

In `detectPageTypes()`, the AI already classifies page types. Extend the prompt to also return bounding box coordinates when a BOM is detected.

Find the prompt text inside `detectPageTypes()` (around line 12782) that asks the AI to classify page types. Add instructions to return BOM bounding box:

```jsx
// Add to the detection prompt's return format:
// When type "bom" is detected, also return:
//   "bomRegion": {"x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0}
// where x,y is top-left corner and w,h is width/height as fractions (0-1) of page dimensions.
// If multiple BOM tables exist on the page, return the bounding box that encompasses ALL of them.
```

- [ ] **Step 2: Parse and store BOM bounding box from detection response**

After the AI returns page types, extract the `bomRegion` field and store it on the page object:

```jsx
// In the detectPageTypes response handler:
if(parsed.bomRegion && parsed.types?.includes("bom")){
  pg.aiBomRegion = parsed.bomRegion; // {x, y, w, h} normalized 0-1
}
```

- [ ] **Step 3: Merge AI-detected region with user-drawn region**

Add a helper function that resolves the "best" BOM region for a page:

```jsx
function resolveBomRegion(pg){
  // Priority: user-drawn region > AI-detected region > null (full page)
  const userRegions = (pg.regions||[]).filter(r=>r.type==="bom");
  if(userRegions.length){
    // User drew a BOM region — this is ground truth
    // Use it directly; also serves as verification of AI detection
    const r = userRegions[0]; // use first user BOM region
    return {x:r.x, y:r.y, w:r.w, h:r.h, source:"user"};
  }
  if(pg.aiBomRegion){
    // AI detected BOM region during page classification
    return {...pg.aiBomRegion, source:"ai"};
  }
  return null; // full page extraction
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app.jsx
git commit -m "feat: detect BOM bounding box during page type classification"
```

---

## Task 2: BOM Region Cropping for Extraction

**Goal:** When a BOM region is known (user-drawn or AI-detected), crop the page image to just the BOM area and send the cropped image to the API instead of the full page. This dramatically increases the effective resolution of the BOM table text.

**Files:**
- Modify: `src/app.jsx:10014-10028` (getExtractionUnits)
- Modify: `src/app.jsx:9996-10013` (cropRegionFromImage)
- Modify: `src/app.jsx:10218-10330` (extractBomPage, extractBomPageViaServer)
- Modify: `src/app.jsx:12030-12063` (extraction pipeline)
- Modify: `functions/index.js:1988-2103` (extractBomPage Cloud Function)

- [ ] **Step 1: Enhance cropRegionFromImage to produce high-resolution crops**

The existing `cropRegionFromImage` at line 9996 already crops to normalized coordinates. Ensure it outputs at sufficient resolution for BOM text (minimum 2000px wide for the crop):

```jsx
function cropRegionFromImage(dataUrl, region, minWidth=2000){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sx = Math.round(region.x * img.naturalWidth);
      const sy = Math.round(region.y * img.naturalHeight);
      const sw = Math.round(region.w * img.naturalWidth);
      const sh = Math.round(region.h * img.naturalHeight);
      if(sw < 10 || sh < 10) return reject(new Error("crop too small"));
      // Scale up if needed to ensure readable text
      const scale = Math.max(1, minWidth / sw);
      const cw = Math.round(sw * scale);
      const ch = Math.round(sh * scale);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
```

- [ ] **Step 2: Modify getExtractionUnits to produce cropped image data**

Replace the current `getExtractionUnits` which only passes region notes:

```jsx
async function getExtractionUnits(pg){
  const bomRegion = resolveBomRegion(pg);
  
  if(bomRegion){
    // Crop the BOM region from the page image for high-fidelity extraction
    let croppedDataUrl = null;
    try {
      // ensureDataUrl loads from storage if needed
      const dataUrl = pg.dataUrl || await ensureDataUrl(pg);
      if(dataUrl){
        croppedDataUrl = await cropRegionFromImage(dataUrl, bomRegion, 2000);
        console.log(`[BOM REGION] Cropped BOM area (${bomRegion.source}) — ${Math.round(bomRegion.w*100)}%×${Math.round(bomRegion.h*100)}% of page`);
      }
    } catch(e){
      console.warn("[BOM REGION] crop failed, falling back to full page:", e.message);
    }
    
    const regionNote = (pg.regions||[]).find(r=>r.type==="bom")?.note || null;
    
    return [{
      dataUrl: pg.dataUrl,
      croppedBomDataUrl: croppedDataUrl, // NEW — cropped image of just the BOM
      regionNote,
      originalPdfPath: pg.originalPdfPath || null,
      pageNumber: pg.pageNumber || null,
      bomRegion, // NEW — region coordinates for logging/diagnostics
    }];
  }
  
  // No BOM region — full page extraction (existing behavior)
  return [{
    dataUrl: pg.dataUrl,
    croppedBomDataUrl: null,
    regionNote: null,
    originalPdfPath: pg.originalPdfPath || null,
    pageNumber: pg.pageNumber || null,
    bomRegion: null,
  }];
}
```

- [ ] **Step 3: Modify extractBomPageViaServer to send cropped image**

When a cropped BOM image is available, send it alongside the native PDF. The server function uses the cropped image as the PRIMARY input (higher resolution of just the BOM) with the native PDF as a FALLBACK:

```jsx
async function extractBomPageViaServer(dataUrl, feedback, userNotes, originalPdfPath, pageNumber, croppedBomDataUrl){
  // If we have a high-res crop of the BOM region, prefer it over full-page PDF
  const useCrop = !!croppedBomDataUrl;
  
  const payload = {
    pdfPath: originalPdfPath,
    pageNumber,
    feedback: feedback || "",
    userNotes: userNotes || "",
  };
  
  if(useCrop){
    // Send cropped BOM image as base64 — the Cloud Function will use this
    // instead of (or alongside) the full PDF page
    const base64 = croppedBomDataUrl.replace(/^data:image\/\w+;base64,/, "");
    payload.croppedBomImage = base64;
    payload.croppedBomMediaType = "image/jpeg";
  }
  
  const callable = fbFunctions.httpsCallable("extractBomPage", {timeout: 300000});
  const t0 = Date.now();
  const result = await callable(payload);
  // ... rest of existing logic unchanged
}
```

- [ ] **Step 4: Modify extractBomPage Cloud Function to use cropped image**

In `functions/index.js`, modify the Cloud Function to accept and prefer the cropped BOM image:

```javascript
// In the extractBomPage Cloud Function, after existing parameter extraction:
const { pdfPath, pageNumber, imageBase64, imageMediaType, feedback, userNotes,
        regionLearningParts, croppedBomImage, croppedBomMediaType } = data || {};

// NEW: If cropped BOM image is provided, use it as primary input
const hasCroppedBom = !!(croppedBomImage && croppedBomMediaType);
const hasPdf = !!(pdfPath && pageNumber != null);
const hasImage = !!(imageBase64 && imageMediaType);

if (!hasCroppedBom && !hasPdf && !hasImage) {
  throw new functions.https.HttpsError('invalid-argument', 
    'Provide {croppedBomImage}, {pdfPath, pageNumber}, or {imageBase64, imageMediaType}');
}

// Build user content — prefer cropped BOM image when available
if (hasCroppedBom) {
  extractionPath = 'bom-region-crop';
  // Use the high-resolution cropped BOM image
  userContent = [
    { type: 'image', source: { type: 'base64', media_type: croppedBomMediaType, data: croppedBomImage } },
    { type: 'text', text: 'This image is a CROPPED region showing ONLY the BOM table from the drawing page. '
      + 'Extract ALL items from this table.\n\n' + pageHint + feedbackSection + notesSection },
  ];
  functions.logger.info('extractBomPage using cropped BOM region', { uid, croppedSizeKB: Math.round(croppedBomImage.length * 0.75 / 1024) });
} else if (hasPdf) {
  // ... existing PDF path unchanged
}
```

- [ ] **Step 5: Thread cropped image through the extraction pipeline**

In the BOM extraction orchestrator (around line 12030-12063), pass the `croppedBomDataUrl` from extraction units through to `extractBomPage`:

```jsx
// In the extraction loop where extractBomPage is called:
const raw = await extractBomPage(
  unit.dataUrl,
  feedbackText,
  notesText,
  unit.originalPdfPath,
  unit.pageNumber,
  unit.croppedBomDataUrl  // NEW parameter
);
```

- [ ] **Step 6: Update client-side extractBomPage fallback to use cropped image**

In the client-side `extractBomPage` function (line 10251), add the `croppedBomDataUrl` parameter and use it when the server path fails:

```jsx
async function extractBomPage(dataUrl, feedback="", userNotes="", originalPdfPath=null, pageNumber=null, croppedBomDataUrl=null){
  // Server path first — now passes cropped image
  try {
    return await extractBomPageViaServer(dataUrl, feedback, userNotes, originalPdfPath, pageNumber, croppedBomDataUrl);
  } catch(serverErr) {
    // ... existing fallback logic
  }
  
  // Direct API fallback — if we have a cropped BOM image, use it instead of full PDF
  if(croppedBomDataUrl) {
    const base64 = croppedBomDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {/* existing headers */},
      body: JSON.stringify({
        model: ANTHROPIC_MODELS.OPUS,
        max_tokens: 16000,
        thinking: {type: "enabled", budget_tokens: 4000},
        system: [{type: "text", text: BOM_PROMPT, cache_control: {type: "ephemeral"}}],
        messages: [{role: "user", content: [
          {type: "image", source: {type: "base64", media_type: "image/jpeg", data: base64}},
          {type: "text", text: "This image is a CROPPED region showing ONLY the BOM table. Extract ALL items.\n\n" + pageHint + feedbackSection + notesSection}
        ]}]
      })
    });
    // ... existing response handling
  }
  
  // Original full-PDF path as final fallback
  // ... existing code
}
```

- [ ] **Step 7: Commit**

```bash
git add src/app.jsx functions/index.js
git commit -m "feat: crop BOM region for extraction — sends focused high-res image instead of full page"
```

---

## Task 3: Description-to-Part-Number Learning Database

**Goal:** When a user fills a Part# from BC Item Browser for a BOM row that was extracted with no Part# (blank or "N/A"), save the description→part# mapping. On future extractions, auto-populate the part# for rows with matching descriptions and blank part numbers.

**Files:**
- Modify: `src/app.jsx:~2117` (new section after corrections DB)
- Modify: `src/app.jsx:8936-9010` (applyLearnedCorrections)
- Modify: `src/app.jsx:22941-23095` (commitBcItem)

- [ ] **Step 1: Create the description cross learning database**

Add the database functions after the corrections DB section (around line 2117):

```jsx
// ── DESCRIPTION CROSS DATABASE ──
// When a user fills a Part# for a BOM row that had no Part# extracted (blank or "N/A"),
// save the description→part# mapping for auto-population on future extractions.
// Only applies to rows whose ORIGINAL extraction had no part number.
let _descCrossCache = null;
function _descCrossPath(uid){
  return (_appCtx.configPath || `users/${uid}/config`) + "/descriptionCrosses";
}

function _descCrossNorm(desc){
  // Normalize description for matching: uppercase, collapse whitespace, strip punctuation
  return (desc||"").toUpperCase().replace(/[^A-Z0-9\s]/g,"").replace(/\s+/g," ").trim();
}

async function loadDescriptionCrosses(uid){
  if(_descCrossCache) return _descCrossCache;
  try {
    const d = await fbDb.doc(_descCrossPath(uid)).get();
    _descCrossCache = d.exists ? (d.data().crosses || []) : [];
  } catch(e){ _descCrossCache = []; }
  return _descCrossCache;
}

function _invalidateDescCrossCache(){ _descCrossCache = null; }

async function saveDescriptionCrossEntry(uid, description, replacement){
  // replacement = {partNumber, manufacturer, description (BC desc), unitCost}
  if(!description || !replacement?.partNumber) return await loadDescriptionCrosses(uid);
  
  const crosses = await loadDescriptionCrosses(uid);
  const normDesc = _descCrossNorm(description);
  
  // Guard: don't save if normalized description is too short (< 5 chars) — too generic
  if(normDesc.length < 5) return crosses;
  
  // Update existing or add new
  const idx = crosses.findIndex(c => _descCrossNorm(c.description) === normDesc);
  if(idx >= 0){
    crosses[idx] = {...crosses[idx], replacement, updatedAt: Date.now()};
    console.log(`[DESC CROSS] updated: "${description}" → "${replacement.partNumber}"`);
  } else {
    crosses.push({description, replacement, createdAt: Date.now()});
    console.log(`[DESC CROSS] new entry: "${description}" → "${replacement.partNumber}"`);
  }
  
  _descCrossCache = [...crosses];
  await fbDb.doc(_descCrossPath(uid)).set({crosses: _descCrossCache});
  return _descCrossCache;
}
```

- [ ] **Step 2: Add cache invalidation to user/company switch**

Find the existing `_invalidateAltCache()` call on user switch (around the auth state change handler) and add:

```jsx
_invalidateDescCrossCache();
```

This should be placed next to existing `_invalidateAltCache()` calls.

- [ ] **Step 3: Apply description crosses during extraction post-processing**

In `applyLearnedCorrections()` (line 8945), add a new step AFTER the existing correction steps. This step only applies to rows with blank or "N/A" part numbers:

```jsx
// In applyLearnedCorrections, after step 4 (supplier cross-refs), add step 5:

// 5. Description cross — auto-fill part# for rows extracted without a part number
// ONLY applies when the row's partNumber is blank, "?", or "N/A"
let descCrosses = [];
try { descCrosses = await loadDescriptionCrosses(uid).catch(() => []); } catch(_){}

const result = bom.map(r => {
  // ... existing steps 1-4 unchanged ...
  
  // 5. Description cross (only for blank-PN rows)
  const pnTrimmed = (r.partNumber || "").trim().toUpperCase();
  const isBlankPN = !pnTrimmed || pnTrimmed === "?" || pnTrimmed === "N/A" || pnTrimmed === "EXTRACTION_FAILED";
  if(isBlankPN && r.description && descCrosses.length){
    const normDesc = _descCrossNorm(r.description);
    const match = descCrosses.find(c => _descCrossNorm(c.description) === normDesc);
    if(match && match.replacement?.partNumber){
      appliedLog.push({
        rowId: r.id, kind: "descriptionCross",
        from: `(no PN) "${r.description}"`,
        to: match.replacement.partNumber,
        reason: "auto-fill from description cross DB"
      });
      return {
        ...r,
        partNumber: match.replacement.partNumber,
        manufacturer: match.replacement.manufacturer || r.manufacturer,
        description: r.description, // keep original extracted description
        unitPrice: match.replacement.unitCost ?? r.unitPrice,
        priceSource: "bc",
        isDescriptionCross: true,
        descriptionCrossFrom: r.description,
        confidence: "high"
      };
    }
  }
  
  return r;
});
```

- [ ] **Step 4: Save description cross when user fills blank-PN row from BC**

In `commitBcItem()` (line 22941), detect when the user is filling a part# for a row that had no original part number, and save the description cross:

```jsx
// In commitBcItem, after the existing learning DB saves (around line 23060-23068):

// Description cross: when user fills a blank-PN row from BC Item Browser,
// remember the description→part# mapping for future auto-population.
// Only save when the ORIGINAL extracted PN was blank/N/A (not a correction of a real PN).
const origPNUpper = (origPN || "").trim().toUpperCase();
const wasBlankPN = !origPNUpper || origPNUpper === "?" || origPNUpper === "N/A" || origPNUpper === "EXTRACTION_FAILED";
const rowDesc = (row.description || "").trim();

if(wasBlankPN && rowDesc && !skipLearning){
  saveDescriptionCrossEntry(uid, rowDesc, {
    partNumber: bcItem.number,
    manufacturer: bcItem._mfrCode || row.manufacturer || "",
    description: bcItem.displayName || bcItem.description || rowDesc,
    unitCost: bcItem.unitCost || null
  }).catch(e => console.warn("[DESC CROSS] save failed:", e.message));
}
```

- [ ] **Step 5: Add isDescriptionCross flag preservation to save guards**

In the Firestore save logic (saveProjectPanel), ensure the `isDescriptionCross` and `descriptionCrossFrom` flags are preserved on BOM rows (they must not be stripped). These fields follow the same preservation pattern as `isCrossed`, `crossedFrom`, `isCorrection`, etc.

No code change needed if the save logic already preserves all BOM row fields — but verify that the save doesn't strip unknown fields.

- [ ] **Step 6: Visual indicator in BOM table for description-crossed rows**

In the BOM table row rendering, add a small indicator (similar to the "Crossed" badge) for description-crossed rows:

```jsx
// In the Part Number cell rendering, after existing crossed/correction badges:
{r.isDescriptionCross && (
  <span style={{fontSize:10, color:"#8b5cf6", display:"block"}}>
    from: {r.descriptionCrossFrom?.slice(0,30)} ✓ desc-cross
  </span>
)}
```

- [ ] **Step 7: Commit**

```bash
git add src/app.jsx
git commit -m "feat: description-to-part-number learning — auto-fills blank-PN rows from past BC selections"
```

---

## Task 4: Enhanced BOM_PROMPT for Combined MFG/PART NO. Columns

**Goal:** Improve the BOM extraction prompt to handle the Clearstream-style combined MFG/PART NO. column pattern more accurately, with explicit guidance for manufacturer prefix recognition and multi-PN cells.

**Files:**
- Modify: `src/app.jsx:9679-9993` (BOM_PROMPT)
- Modify: `functions/bomPrompt.js:1-324` (BOM_PROMPT server-side mirror)

- [ ] **Step 1: Add explicit MFG/PART NO. combined column guidance**

After the existing manufacturer prefix rules (lines 87-91 in bomPrompt.js / lines 9758-9764 in app.jsx), add an expanded section:

```
★ COMBINED MFG/PART NO. COLUMNS (CRITICAL for Clearstream, some Siemens, and other formats):
Some BOM tables use a single column headed "MFG/PART NO." or "MFR/PART NO." that contains
BOTH the manufacturer name AND the catalog number in the same cell. When you see this column
header pattern:

1. The FIRST word(s) in the cell are usually the manufacturer name/abbreviation.
   Split them from the catalog number that follows.
   
2. Common manufacturer prefixes to recognize and split:
   SAGINAW, HOFFMAN, ABB, IDEC, EATON, SCHNEIDER, SQUARE D, SIEMENS, ALLEN-BRADLEY, AB,
   ROCKWELL, PHOENIX, PHOENIX CONTACT, WAGO, AUTOMATION DIRECT, AUTOMATIONDIRECT, PILZ,
   TURCK, SICK, BANNER, OMRON, KEYENCE, MURR, RITTAL, PANDUIT, BRADY, BELDEN, MOLEX,
   WEIDMULLER, HUBBELL, FEDERAL, FEDERAL SIGNAL, LITTLE FUSE, LITTELFUSE, IMPERVITRAN,
   HAMMOND, TRUMETER, EMEC, CPU, STAHLIN, NVENT, MERSEN, BUSSMANN, FERRAZ SHAWMUT,
   GENERAL ELECTRIC, GE, MITSUBISHI, CUTLER-HAMMER, LEVITON, COOPER, LUTZE, MEANWELL,
   MEAN WELL, RED LION, CROUSE-HINDS, APPLETON

3. When a cell contains MULTIPLE catalog codes separated by commas:
   e.g. "ABB AF09-30-10-13, CA4-22M, TF42-1.0"
   This means: main item AF09-30-10-13 (ABB), PLUS companion parts CA4-22M and TF42-1.0
   (also ABB). ALL share the same manufacturer prefix from the beginning of the cell.
   - First part: main item row with original description
   - Additional parts: additionalPartNumbers entries with relationship "accessory"
   
   e.g. "FEDERAL 350B-120-30, KB435666A, TR"
   Main part 350B-120-30 (FEDERAL), additional parts KB435666A and TR (both FEDERAL).
   
   e.g. "TRUMETER 722-0004, 5003-011"
   Main part 722-0004 (TRUMETER), additional part 5003-011 (TRUMETER).

4. Some cells have NO manufacturer prefix — just the catalog number(s):
   e.g. "ALD2QH211DNUG" or "G85K" or "XT1NU3020AAA000XXX"
   When the cell has no recognizable manufacturer prefix, set manufacturer to ""
   and put the entire cell value as partNumber.

5. If the column header is "MFG/PART NO." but some rows have the prefix "N/A":
   This means no part number exists for that item. Set partNumber to "" and manufacturer to "N/A".
```

- [ ] **Step 2: Mirror the prompt change in functions/bomPrompt.js**

Copy the exact same text addition to `functions/bomPrompt.js` to keep prompts in sync.

- [ ] **Step 3: Validate both prompts with node --check**

```bash
node --check src/app.jsx 2>&1 || echo "SYNTAX ERROR"
node --check functions/bomPrompt.js 2>&1 || echo "SYNTAX ERROR"
```

- [ ] **Step 4: Commit**

```bash
git add src/app.jsx functions/bomPrompt.js
git commit -m "feat: enhanced BOM prompt for combined MFG/PART NO. columns — Clearstream format support"
```

---

## Task 5: Wire Up Detection → Region → Extraction Pipeline End-to-End

**Goal:** Ensure the full pipeline works: page type detection → BOM region detection → region crop → extraction. Handle edge cases: no dataUrl available, crop failure, multi-page BOMs.

**Files:**
- Modify: `src/app.jsx:12030-12063` (extraction orchestrator)

- [ ] **Step 1: Ensure dataUrl is loaded before crop attempt**

In the extraction orchestrator, before calling `getExtractionUnits`, ensure the page's dataUrl is available. The `ensureDataUrl` function loads from Firebase Storage if needed:

```jsx
// Before extracting each BOM page:
for(const pg of bomPages){
  // Ensure image is loaded for potential region cropping
  if(!pg.dataUrl && pg.storageUrl){
    try { pg.dataUrl = await ensureDataUrl(pg); }
    catch(e){ console.warn("[BOM] could not load dataUrl for region crop:", e.message); }
  }
  
  const units = await getExtractionUnits(pg);
  // ... extraction continues with units
}
```

- [ ] **Step 2: Add diagnostic logging for region-based extraction**

Log whether each extraction used a cropped region or full page:

```jsx
for(const unit of units){
  const cropInfo = unit.bomRegion 
    ? `region-crop (${unit.bomRegion.source}, ${Math.round(unit.bomRegion.w*100)}×${Math.round(unit.bomRegion.h*100)}%)` 
    : "full-page";
  console.log(`[BOM EXTRACT] page=${pg.pageName} mode=${cropInfo} hasPdf=${!!unit.originalPdfPath}`);
  // ... extraction call
}
```

- [ ] **Step 3: Handle crop failure gracefully — fall back to full page**

If the crop fails (bad coordinates, missing dataUrl, canvas error), fall back to full-page extraction silently. This is already handled in Step 2 of Task 2 via the try/catch in `getExtractionUnits`, but verify the fallback works by testing with `croppedBomDataUrl = null`.

- [ ] **Step 4: Commit**

```bash
git add src/app.jsx
git commit -m "feat: wire up BOM region crop pipeline with dataUrl preload and diagnostic logging"
```

---

## Task 6: Persist aiBomRegion on Page Objects

**Goal:** Store the AI-detected BOM region coordinates on the page so they survive save/reload cycles and can be used without re-running detection.

**Files:**
- Modify: `src/app.jsx` (page save/load handling)

- [ ] **Step 1: Include aiBomRegion in page serialization**

When saving panels to Firestore, ensure `aiBomRegion` is preserved on page objects. Find the page serialization in `saveProjectPanel` and verify it doesn't strip unknown fields. The field is small ({x, y, w, h} — 4 numbers) so it won't impact the 1MB Firestore limit.

```jsx
// In the page object that gets saved, aiBomRegion should be preserved.
// Since the save logic preserves all page fields except dataUrl (which is stripped),
// aiBomRegion will be saved automatically. Verify this is the case.
```

- [ ] **Step 2: Load aiBomRegion on project load**

When loading projects from Firestore, `aiBomRegion` will be present on page objects if it was saved. No additional code needed — Firestore returns all fields.

- [ ] **Step 3: Commit**

```bash
git add src/app.jsx
git commit -m "feat: persist AI-detected BOM region coordinates on page objects"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] BOM region cropping for extraction — Task 1 (detection) + Task 2 (cropping) + Task 5 (pipeline)
- [x] User-drawn region as ground truth, AI-detected as fallback — Task 1 Step 3 (`resolveBomRegion`)
- [x] Auto-detect BOM region when user hasn't drawn one — Task 1 Step 1-2
- [x] Description-to-part-number learning — Task 3
- [x] Only for blank-PN or N/A rows — Task 3 Step 4 (`wasBlankPN` check)
- [x] Save from BC Item Browser selection — Task 3 Step 4
- [x] Auto-apply on future extractions — Task 3 Step 3
- [x] Enhanced MFG/PART NO. handling — Task 4
- [x] Both client and server prompts updated — Task 4 Steps 1-2
- [x] Clearstream format support — Task 4 (manufacturer list, multi-PN rules)
- [x] Region persistence across sessions — Task 6

### Placeholder Scan
- No TBD/TODO/fill-in-later items found
- All code blocks contain actual implementation code
- All file paths are exact

### Type Consistency
- `resolveBomRegion()` returns `{x, y, w, h, source}` or `null` — consistent across Tasks 1-2
- `croppedBomDataUrl` parameter threaded consistently through Tasks 2 and 5
- `_descCrossNorm()` used consistently in save and apply paths (Task 3)
- `isDescriptionCross` / `descriptionCrossFrom` flags consistent between apply (Step 3) and display (Step 6)

### Data Retention Verification
- No Firestore fields removed or renamed
- New fields are additive: `aiBomRegion`, `isDescriptionCross`, `descriptionCrossFrom`
- New Firestore document: `users/{uid}/config/descriptionCrosses` — follows existing pattern
- Description cross DB is append-only with sliding-window updates (same as corrections DB)

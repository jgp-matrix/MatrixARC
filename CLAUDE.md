# MatrixARC — Development Rules

## Project Overview
- **App**: Firebase-hosted at https://matrix-arc.web.app
- **Architecture**: Single-file app — `matrix-arc/public/index.html` (no build step)
- **Deploy**: `cd matrix-arc && npx firebase deploy --only hosting`
- **User always wants deploy after changes**
- **Git workflow**: Always commit + push + tag after each change (remote: `jgp-matrix/MatrixARC`)
- **Versioning**: `vMajor.Minor.Patch` (semver). Current: **v1.15.0**
  - **Patch** (x.x.+1): Bug fixes, cosmetic/wording tweaks, adjusting rates/thresholds, fixing a value that wasn't stored
  - **Minor** (x.+1.0): New AI prompt capabilities, new device types, new labor categories, new UI sections, restructuring data flow — anything that changes what the app can detect or output
  - **Major** (+1.0.0): Schema changes requiring migration, breaking changes to saved data format, `APP_SCHEMA_VERSION` bumps
- **APP_VERSION** constant (~line 163) should be updated to match the git tag on each release

## Data Retention (CRITICAL)

This app is used for real production projects. **No user data may ever be lost due to code changes.**

### Rules

1. **Never remove or rename Firestore fields.** If a field is no longer needed, stop writing to it but always preserve existing values on read/save.

2. **Never add caps or limits to learning databases.** The following collections grow without bounds:
   - `users/{uid}/config/alternates` — part crosses / superseded parts
   - `users/{uid}/config/corrections` — formatting & extraction error corrections
   - `users/{uid}/config/page_type_learning` — drawing type classification learning
   - `users/{uid}/config/layout_learning` — panel hole / layout analysis corrections

3. **Always include `schemaVersion: APP_SCHEMA_VERSION`** in project saves (both `saveProject` and `saveProjectPanel`). If the schema changes, bump `APP_SCHEMA_VERSION` and add migration code in `loadProjects`.

4. **Only strip `dataUrl` on Firestore save** (1MB limit). Never strip any other fields. All metadata flags (`isCrossed`, `crossedFrom`, `isCorrection`, `correctionType`, `priceSource`, `bcFuzzySuggestions`, `bomVerification`, `extractionFeedbackLog`, etc.) must be preserved.

5. **Test backward compatibility** after every change: load an existing project and verify all data renders correctly.

6. **Never overwrite user data silently.** If merging new extraction results with existing BOM, preserve manual edits (rows with `priceSource: "manual"` or `priceSource: "bc"`).

### Firestore Data Locations

| Data | Path | Notes |
|------|------|-------|
| Projects | `users/{uid}/projects/{id}` | Full project + panels |
| Part crosses | `users/{uid}/config/alternates` | Auto-applied on extraction |
| Corrections | `users/{uid}/config/corrections` | Auto-applied on extraction |
| Page type learning | `users/{uid}/config/page_type_learning` | Fed into AI detection prompt |
| Layout learning | `users/{uid}/config/layout_learning` | Fed into layout/enclosure AI prompts |
| Page images | Firebase Storage `pageImages/{uid}/{projectId}/{pageId}.jpg` | Loaded via `ensureDataUrl` |

### Learning Databases

All learning is persisted to Firestore and applied automatically:
- **Alternates**: When a user crosses a part number, it's saved and auto-applied to future BOMs if `autoReplace: true`
- **Corrections**: When a user fixes an OCR/formatting error, the correction is auto-applied to future extractions
- **Page type learning**: When a user corrects AI page type detection, the correction history is included in future AI prompts
- **Layout learning**: When a user corrects panel hole count in the labor estimate, the AI count vs user count is saved and fed into future layout/enclosure analysis prompts
- **Extraction feedback**: When a user provides BOM correction feedback and re-extracts, the feedback is logged in `panel.extractionFeedbackLog`

## Key Architecture Notes

### Two Code Paths for laborData
`runPanelValidation()` AND the Fast Quote pipeline (~line 1790) both build laborData independently — changes must be applied to BOTH.

### Schematic Authority
Schematic is the authority for door device count — layout analysis often misclassifies backpanel devices as door cutouts.

### Wire Counting
AI returns a classified wire list (`internal: true/false`), code filters programmatically. Vertical bus lines, dashed lines, and panel-exiting wires are excluded.

### AI Model Usage
| Task | Model |
|------|-------|
| BOM extraction | Opus + thinking |
| Schematic / layout / pricing analysis | Sonnet |
| Page detection / part verification | Haiku |

### Firebase Storage
- Bucket: `gs://matrix-arc.firebasestorage.app`
- Rules require auth
- Uses `putString(dataUrl, "data_url")` for uploads
- CORS configured for web.app / firebaseapp.com / localhost

### Image Persistence
- `ensureDataUrl`: loads storage images via `<img crossOrigin>` + canvas (avoids CORS fetch issues)
- `dataUrl` is stripped on Firestore save (1MB limit), `storageUrl` is preserved
- Thumbnails use `pg.dataUrl || pg.storageUrl`
- Upload happens at end of `addFiles` after extraction/validation

### BOM Row Highlighting
Rows with `qty=0` or `unitPrice=0` get red background.

### Connection Quality Indicator (v1.14.1)
- Yellow "Slow Connection" or red "Offline" pill in top menu bar
- Three detection methods: `navigator.onLine` events, Network Information API, Firestore latency pings (every 30s)
- Hidden when connection is good

### Debug Logging
Console logs present in production (WIRE COUNT, MERGE LAYOUTS, DOOR DEVICES, ADDFILES, STORAGE UPLOAD, API ERROR, etc.) — can be removed when stable.

## Quote / Print System

### Architecture
- **No screen preview** — "Print Quote" button triggers `window.print()` directly via Edge/Chrome print dialog
- `#quote-doc` is rendered in the DOM but hidden on screen (`height:0;overflow:hidden` wrapper)
- `@media print` CSS makes `#quote-doc` visible, hides everything else
- Quote fields are editable via compact dark-themed form (inside QuoteView), state stored in `project.quote`
- QuoteView still accessible for Budgetary Quote tab and field editing
- Auto-print flow: button sets `view="quote"` + `autoPrint=true` → useEffect triggers `window.print()` after 400ms render delay → returns to panels view

### Print CSS Rules
- `@page{size:8.5in 11in;margin:0}` — zero CSS margins, content padding provides visual margins
- `.qd-page` uses `page-break-after:always` (last page excluded) — avoids blank pages between quote and T&C
- All `qd-*` font sizes are duplicated in `@media print` with `!important` to ensure print matches
- `#quote-doc` print override: `position:absolute;top:0;left:0;width:100%`
- Inputs/textareas styled as plain text in print (no borders, transparent background)

### Quote Form Font Sizes (current — +20% from original)
| Element | Screen | Print |
|---------|--------|-------|
| Brand h1 | 29px | 29px |
| Body text (info-detail, terms) | 14-15px | 14-15px |
| Labels (uppercase) | 12px | 12px |
| Spec fields | 13px | 13px |
| Pricing values | 14px | 14px |
| Grand total | 19px | 19px |

### T&C Page Font Sizes (sized to fill one page)
| Element | Size |
|---------|------|
| Title | 18px |
| Subtitle | 12px |
| Section headings | 10.5px |
| Body paragraphs | 10px, line-height 1.6 |

### Key Constraints
- T&C must fit on exactly one printed page
- Quote content may span multiple physical pages — page break logic handles this
- Total row: white background, dark text, blue amount, top border
- Print preview = source of truth (screen preview was removed to avoid mismatch)
- `firebase.json` has `Cache-Control: no-cache` headers for HTML files

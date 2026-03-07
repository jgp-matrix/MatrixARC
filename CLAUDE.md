# MatrixARC — Development Rules

## Data Retention (CRITICAL)

This app is used for real production projects. **No user data may ever be lost due to code changes.**

### Rules

1. **Never remove or rename Firestore fields.** If a field is no longer needed, stop writing to it but always preserve existing values on read/save.

2. **Never add caps or limits to learning databases.** The following collections grow without bounds:
   - `users/{uid}/config/alternates` — part crosses / superseded parts
   - `users/{uid}/config/corrections` — formatting & extraction error corrections
   - `users/{uid}/config/page_type_learning` — drawing type classification learning

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
| Page images | Firebase Storage `pageImages/{uid}/{projectId}/{pageId}.jpg` | Loaded via `ensureDataUrl` |

### Learning Databases

All learning is persisted to Firestore and applied automatically:
- **Alternates**: When a user crosses a part number, it's saved and auto-applied to future BOMs if `autoReplace: true`
- **Corrections**: When a user fixes an OCR/formatting error, the correction is auto-applied to future extractions
- **Page type learning**: When a user corrects AI page type detection, the correction history is included in future AI prompts
- **Extraction feedback**: When a user provides BOM correction feedback and re-extracts, the feedback is logged in `panel.extractionFeedbackLog`

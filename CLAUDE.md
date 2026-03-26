# MatrixARC — Development Rules

## Project Overview
- **App**: Firebase-hosted at https://matrix-arc.web.app
- **Architecture**: Single-file app — `public/index.html` (~1MB, no build step) + Cloud Functions in `functions/index.js`
- **Deploy hosting**: `bash deploy.sh` — auto-bumps patch version, commits, tags, pushes, deploys hosting
- **Deploy functions**: `firebase deploy --only functions` — must be run separately when `functions/index.js` changes
- **User always wants deploy after changes**
- **Git workflow**: `deploy.sh` handles commit + push + tag automatically. Never manually set a git tag before running deploy.sh (causes double version bump).
- **Versioning**: `vMajor.Minor.Patch` (semver). Current: **v1.18.173**
  - **Patch** (x.x.+1): Bug fixes, cosmetic/wording tweaks, adjusting rates/thresholds, fixing a value that wasn't stored
  - **Minor** (x.+1.0): New AI prompt capabilities, new device types, new labor categories, new UI sections, restructuring data flow — anything that changes what the app can detect or output
  - **Major** (+1.0.0): Schema changes requiring migration, breaking changes to saved data format, `APP_SCHEMA_VERSION` bumps
- **APP_VERSION** constant (~line 163) is updated automatically by `deploy.sh`
- **JSX validation**: Run `node validate_jsx.js` before deploying to catch JSX errors early

## Data Retention (CRITICAL)

This app is used for real production projects. **No user data may ever be lost due to code changes.**

### Rules

1. **Never remove or rename Firestore fields.** If a field is no longer needed, stop writing to it but always preserve existing values on read/save.

2. **Never add caps or limits to learning databases.** The following collections grow without bounds:
   - `users/{uid}/config/alternates` — part crosses / superseded parts
   - `users/{uid}/config/corrections` — formatting & extraction error corrections
   - `users/{uid}/config/page_type_learning` — drawing type classification learning
   - `users/{uid}/config/layout_learning` — panel hole / layout analysis corrections
   - `users/{uid}/config/supplierCantSupply` — parts vendors have flagged as cannot-supply
   - `users/{uid}/config/supplierCrossRef` — supplier part number cross-references

3. **Always include `schemaVersion: APP_SCHEMA_VERSION`** in project saves (both `saveProject` and `saveProjectPanel`). If the schema changes, bump `APP_SCHEMA_VERSION` and add migration code in `loadProjects`.

4. **Only strip `dataUrl` on Firestore save** (1MB limit). Never strip any other fields. All metadata flags (`isCrossed`, `crossedFrom`, `isCorrection`, `correctionType`, `priceSource`, `bcFuzzySuggestions`, `bomVerification`, `extractionFeedbackLog`, `cannotSupply`, etc.) must be preserved.

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
| Supplier cannot-supply | `users/{uid}/config/supplierCantSupply` | `{records:[{vendorName,partNumber,description,markedAt,rfqNum}]}` |
| Supplier cross-ref | `users/{uid}/config/supplierCrossRef` | Supplier part → BC part mappings |
| RFQ history | `users/{uid}/rfq_history` | Log of all sent RFQ emails |
| Notifications | `users/{uid}/notifications/{id}` | In-app notifications (read/unread) |
| RFQ upload tokens | `rfqUploads/{token}` | Supplier portal session docs |
| Page images | Firebase Storage `pageImages/{uid}/{projectId}/{pageId}.jpg` | Loaded via `ensureDataUrl` |
| Supplier uploads | Firebase Storage `supplierUploads/{token}/{filename}` | PDF uploads from supplier portal |
| Team members | `companies/{companyId}/members/{uid}` | Role: admin/edit/view |
| Team invites | `companies/{companyId}/pendingInvites/{token}` | Pending email invitations |
| FCM push tokens | `users/{uid}/fcmTokens/{tokenHash}` | Push notification device tokens |
| Quote counter | `users/{uid}/config/quoteCounter` | Sequential quote number (next field) |

### Learning Databases

All learning is persisted to Firestore and applied automatically:
- **Alternates**: When a user crosses a part number, it's saved and auto-applied to future BOMs if `autoReplace: true`
- **Corrections**: When a user fixes an OCR/formatting error, the correction is auto-applied to future extractions
- **Page type learning**: When a user corrects AI page type detection, the correction history is included in future AI prompts
- **Layout learning**: When a user corrects panel hole count in the labor estimate, the AI count vs user count is saved and fed into future layout/enclosure analysis prompts
- **Extraction feedback**: When a user provides BOM correction feedback and re-extracts, the feedback is logged in `panel.extractionFeedbackLog`
- **Cannot-supply**: When a supplier marks an item as cannot-supply in the portal, it's saved for future RFQ tracking

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
| Supplier quote price extraction | Haiku (via Cloud Function) |
| BC Item Browser row locate | Haiku (table boundaries + math) |

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

### Connection Quality Indicator
- Yellow "Slow Connection" or red "Offline" pill in top menu bar
- Three detection methods: `navigator.onLine` events, Network Information API, Firestore latency pings (every 30s)
- Hidden when connection is good

### Debug Logging
Console logs present in production (WIRE COUNT, MERGE LAYOUTS, DOOR DEVICES, ADDFILES, STORAGE UPLOAD, API ERROR, etc.) — can be removed when stable.

### JSX Fragment Rule (CRITICAL)
When rendering a modal alongside a component's root `<div>`, the return MUST use a fragment:
```jsx
return(<>
  <div>...main content...</div>
  {showModal&&<MyModal .../>}
</>);   // <-- closing </> is REQUIRED
```
Missing `</>` or two root elements = site breaks. Always verify both `<>` AND `</>` match.

## Cloud Functions (`functions/index.js`)

Functions deploy separately from hosting — `firebase deploy --only functions`.

| Function | Trigger | Purpose |
|----------|---------|---------|
| `inviteTeamMember` | HTTPS callable | Creates pending invite, returns token |
| `acceptTeamInvite` | HTTPS callable | Validates token, adds user to company |
| `removeTeamMember` | HTTPS callable | Admin removes a member |
| `updateMemberRole` | HTTPS callable | Admin changes a member's role |
| `sendInviteEmail` | HTTPS callable | Sends invite email via SendGrid |
| `onSupplierQuoteSubmitted` | Firestore trigger on `rfqUploads/{token}` | Fires when status→"submitted": creates notification + sends email to ARC user |
| `extractSupplierQuotePricing` | HTTPS callable | Sends PDF page images to Claude Haiku, returns extracted prices/lead times |
| `sendEngineerQuestionEmail` | HTTPS callable | Sends formatted engineering questions email via SendGrid + push notification |
| `testTeamsWebhook` | HTTPS callable | Test endpoint to verify Teams webhook integration |

### Environment Variables (set via Firebase, in `functions/.env`)
- `SENDGRID_API_KEY` — required for email sending
- `APP_URL` — defaults to `https://matrix-arc.web.app`
- `TEAMS_WEBHOOK_URL` — Power Automate webhook URL for Teams channel notifications (optional)

## Business Central (BC) Integration

### BC Offline Queue
When BC is offline, write operations are queued in localStorage (`_arc_bc_queue`) and retried automatically on reconnect.
- `bcEnqueue(type, params, description)` — adds operation to queue
- `bcProcessQueue()` — called on reconnect, retries up to 5 times each
- `_bcQueueCountSetter` — global setter pattern to update toolbar badge
- Queue types: `createPurchaseQuote`, `attachPdf`, `patchJob`, `syncTaskDescs`
- Amber "⏳ N pending" badge shows in toolbar when queue is non-empty

### Company Info from BC
`bcFetchCompanyInfo()` pulls `name`, `address`, `phone` from `/companies(id)` endpoint on connect.
Stored in `_appCtx.company = {name, logoUrl, address, phone}` and Firestore.
Used by all RFQ document builders via `companyInfo` parameter.

### BC API
- Base URL: `BC_API_BASE` constant
- Purchase quotes: `purchaseQuotes`, `purchaseQuoteLines` endpoints
- Company info: `/companies(id)` endpoint

## RFQ / Supplier Portal System

### Supplier Portal Flow
1. User sends RFQ emails → creates `rfqUploads/{token}` doc in Firestore with lineItems, expiry, etc.
2. Supplier receives email with "Upload Quote →" button link (`?rfqUpload=TOKEN`)
3. Supplier opens portal page, uploads PDF
4. Auto-scan: all PDF pages processed in batches of 20 (Anthropic API limit), no user intervention needed
5. Claude Haiku extracts prices/lead times with fuzzy part# matching
6. Supplier reviews, corrects, marks "Cannot Supply" for unavailable items, enters lead time
7. On submit: `rfqUploads/{token}` updated to `status: "submitted"`
8. Cloud Function `onSupplierQuoteSubmitted` fires → creates notification + sends email to ARC user
9. Bell badge appears in ARC toolbar; clicking notification navigates to project + opens submissions modal

### Part Number Fuzzy Matching
`normPart(s)` and `partMatch(a,b)` helper functions handle:
- Spaces/dashes/dots stripped, uppercase: `"ARL 449"` → matches `"ARL449"`
- Contains/substring: `"HOFF CEL550M"` → normalized `"HOFFCEL550M"` contains `"CEL550M"` → match
- Used in: `processFile` (portal scan matching), `applyPortalPrices` (BOM matching)
- Also instructed in AI prompt: AI returns BC part# (from requested list), not supplier's version

### Cannot-Supply Tracking
- Supplier checks "Cannot Supply" per line item in portal review
- Saved as `cannotSupply: true` on each `pricedItem` in the submission
- On "Apply Prices to BOM": cannot-supply items are skipped, saved to `users/{uid}/config/supplierCantSupply`
- `PortalSubmissionsModal` shows cannot-supply items with strikethrough + red "Cannot Supply" label

### RFQ Email Structure
`buildRfqEmailHtml(group, projectName, rfqNum, rfqDate, responseBy, uploadUrl, companyInfo)`:
- "Upload Quote →" button appears BOTH at the top (above line items) and bottom of email
- Company logo or name from `_appCtx.company` / BC
- "Request For Quote from" heading

### Key Button Names
- "Print Client Quote" — opens quote editor / print dialog
- "Upload Supplier Quote" — opens portal submissions or import modal
- "History" — compact button for RFQ send history

## Project Kanban / Status System

### Columns
```js
const order = ["draft","in_progress","evc","active","purchasing"];
const labels = {
  draft: "Draft",
  in_progress: "In Progress",
  evc: "Ready",
  active: "Active (Ready for Purchasing)",
  purchasing: "Purchasing In Progress"
};
```

### Status Colors
```js
statusColColors = {
  Draft: C.muted, "In Progress": C.yellow, Ready: C.green,
  "Active (Ready for Purchasing)": "#38bdf8",
  "Purchasing In Progress": "#f59e0b"
}
```

### Routing Logic
- `bcPoStatus === "purchasing"` → Purchasing In Progress column
- `bcPoStatus === "Open"` → Active (Ready for Purchasing) column
- Otherwise → status field value

## Notification System

### Firestore
Notifications stored at `users/{uid}/notifications/{id}`:
```js
{
  type: "supplier_quote",        // notification type
  title: "New Quote from {vendor}",
  body: "...",
  createdAt: Date.now(),
  read: false,
  projectId: string,
  rfqUploadId: token,
  rfqNum: string,
  vendorName: string,
  projectName: string
}
```

### Frontend
- `App` component listens to unread notifications via `onSnapshot`
- Bell icon turns amber + shows red badge count when unread notifications exist
- Bell dropdown lists notifications with timestamp; supplier quote notifications are clickable
- Clicking navigates to the project + auto-opens `PortalSubmissionsModal` via `autoOpenPortal` prop
- "Mark all read" button in dropdown
- Push notification toggle at bottom of bell dropdown

### PWA + Push Notifications (v1.18.154+)
- **PWA manifest**: `public/manifest.json` — Edge/Chromium can install to taskbar/Start Menu
- **Service worker**: `public/sw.js` + `public/firebase-messaging-sw.js` — push notification handling only (no caching/offline)
- **FCM tokens**: Stored at `users/{uid}/fcmTokens/{tokenHash}` in Firestore
- **Push toggle**: In bell dropdown, persisted to localStorage `arc_push_{uid}`
- **Persistent notifications**: All push notifications use `requireInteraction: true` — stay until user dismisses
- **Push triggers**: Supplier quote submissions (`onSupplierQuoteSubmitted`) + engineer question emails (`sendEngineerQuestionEmail`)
- **Teams webhook**: `postToTeams()` helper sends Adaptive Cards to Teams channel via Power Automate workflow
- **Icons**: `public/icons/icon-192.png` and `icon-512.png` generated from `public/redpill_logo.png`
- **Sonnet 4.6 does NOT support assistant prefill** — use Haiku for prefill-based JSON extraction

### Engineering Questions System (v1.18.153+)
- **Data**: `panel.engineeringQuestions[]` — unified array for BOM + compliance questions
- **Statuses**: `open`, `answered`, `skipped`, `on_quote`
- **Sources**: `bom` (from extraction) and `compliance` (from `runComplianceReview`)
- **Modal**: `EngineeringQuestionsModal` — answer/skip/include-on-quote per question
- **Pulsing badge**: Panels with open questions show pulsing yellow badge in QUOTE SUMMARY
- **Print warning**: `handlePrintQuote` warns about unanswered questions before printing
- **"Questions for Customer"**: Questions with `status:"on_quote"` appear on printed quote
- **Email engineer**: `sendEngineerQuestionEmail` Cloud Function sends formatted email + push notification

## Quote / Print System

### Architecture
- **No screen preview** — "Print Client Quote" button triggers `window.print()` directly via Edge/Chrome print dialog
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

### Quote Numbering (v1.18.153+)
- Format: `MTX-Q######` (e.g. `MTX-Q202000`), auto-assigned on first print via `getNextQuoteNumber()`
- Firestore transaction increments `users/{uid}/config/quoteCounter.next`
- Validation regex: `/^MTX-Q\d{6}$/`
- Quote revision (`project.quoteRev`) auto-bumps when BOM hash changes since last print
- `computeBomHash()` uses djb2 hash of part numbers + quantities

### BC Drawing Upload Filename
- Format: `[QUOTED] CustomerDWG#-MTX-Q######.pdf`
- Fallback: `[QUOTED] NoCust#-MTX-Q######.pdf` if no drawing number extracted
- `bcCheckAttachmentExists` checks for any PDF attachment (not exact filename match)

### Key Constraints
- T&C must fit on exactly one printed page
- Quote content may span multiple physical pages — page break logic handles this
- Total row: white background, dark text, blue amount, top border
- Print preview = source of truth (screen preview was removed to avoid mismatch)
- `firebase.json` has `Cache-Control: no-cache` headers for HTML files

## Global State

### `_appCtx`
```js
let _appCtx = {
  uid: null,
  companyId: null,
  role: null,
  projectsPath: null,
  configPath: null,
  company: { name: null, logoUrl: null, address: null, phone: null }
};
```
Company info is populated from BC on connect and from Firestore on load.

### Badge Component
`<Badge status={st}/>` — status pill styling used throughout:
- `background`, `borderRadius:20`, `padding:"3px 12px"`, `fontWeight:700`
- Status values: `draft`, `in_progress`, `extracted`, `validated`, `costed`, `quoted`

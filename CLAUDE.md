# MatrixARC — Development Rules

## Session startup procedure
**Before any task work, run `./tools/verify-state.sh`** and confirm the output matches expectations:
- `pwd` is the worktree the session was launched in
- `git branch --show-current` matches the expected branch
- `git log --oneline -5` shows the commits you expect (no surprise commits from the parallel CLI session)
- `git status` is clean (or only contains files you know about)
- Report the active site version (the `APP_VERSION` constant in `public/index.html`, e.g. `v1.19.1005`) alongside the verification output so the user knows which deployed build the session is starting from.

If anything looks unexpected — wrong directory, unfamiliar branch, untracked files you didn't create, commits you didn't make — **stop and surface the contradiction to the user before doing any task work**. Do not auto-clean, auto-checkout, or "fix" the state. The parallel testing/review CLI session may have written artifacts you should not touch.

## Session shutdown procedure

The shutdown is a two-step user command: "Close Out" (surface state) followed by "Closed" (confirm safe to end).

### "Close Out" — commit, merge, push, deploy, and surface state

When the user says "Close Out" (or any case-insensitive variant: close-out, closeout, etc.), run the following procedure. The default behavior is to **execute** the full commit→merge→push→deploy pipeline, not just surface state. Only pause for user input when something is ambiguous or fails.

1. **Commit uncommitted work**: Run `git status`. If there are modified or staged files:
   - Stage the relevant files and commit with an appropriate message.
   - If the commit message or scope is ambiguous, ask the user before committing.
   - If the working tree is already clean, note that and proceed.

2. **Merge feature branch to master**: If the current session's commits exist on a feature branch (e.g., `claude/<random-name>`) but not on master:
   a. From the main checkout (`C:/Users/jon/AppDev/MatrixARC`):
      ```
      git checkout master
      git merge <feature-branch>
      git push origin master
      ```
   b. After push, verify: `git rev-parse master origin/master` (must match).
   c. **Worktree + branch cleanup**: The current session runs inside its own worktree directory, so the OS holds a file lock on it — `rm` / `git worktree remove` will fail with "Device busy". This is expected and unavoidable. **Do not leave a manual cleanup note** — instead, clean up *other* sessions' orphaned worktrees now, and the current session's directory will be auto-removed by Claude Code when the session ends.
      ```
      git worktree prune
      # Remove any leftover dirs from prior sessions (skip the current one):
      for d in .claude/worktrees/*/; do [ "$d" != ".claude/worktrees/<current-worktree>/" ] && rm -rf "$d"; done
      git branch -d <feature-branch>   # may fail if current worktree still references it — OK
      ```
   d. If commits are already on master (or session produced no commits), skip the merge.

3. **Deploy**: Run `bash deploy.sh` from the main checkout (`C:/Users/jon/AppDev/MatrixARC`). This auto-bumps the patch version, commits the version bump, tags, pushes, and deploys to Firebase hosting.

4. **Show what was committed**: List all commits made this session (use `git log --oneline <start-SHA>..HEAD` or last 10 if unsure of session start).

5. **Identify TODO.md updates**: Based on what was accomplished, list:
   - Findings that should be marked RESOLVED with their commit SHAs
   - New findings that should be captured (with proposed wording)
   - Findings whose investigation notes should be updated
   Do not auto-edit TODO.md — surface the proposed changes for user approval.

6. **Provide a one-paragraph summary**: What was accomplished, what's still pending, what the next logical session would address. Must include:
   - Master's current tip SHA after deploy
   - Deployed version number
   - Confirmation that origin/master matches local
   - Any branches that remain (feature branch retained due to active worktree, etc.)

7. **Stop.** Wait for the user to either:
   - Direct additional actions (update TODO.md, etc.) — execute as instructed
   - Type "Closed" — confirm safe shutdown (see below)
   - Continue working — abort the close-out

**Exceptions** (pause and ask instead of auto-executing):
- If `git status` shows files the user might not want committed (e.g., unrecognized files, .env, WIP experiments), ask before committing.
- If the user previously said "leave on the branch for now" during the session, skip merge and flag it in the summary.
- If `deploy.sh` fails, surface the error and wait for direction.

### "Closed" — final confirmation

When the user says "Closed" (or any case-insensitive variant: closed, close, done) AFTER a Close Out has been run, perform a final verification before treating the session as ended:

1. Re-run `git status` — must be clean (no modified, staged, or untracked files apart from `.claude/worktrees/`).

2. Re-run `git log master..origin/master` — must be empty (everything pushed).

### Step 2.5 — Verify commits are on master (or intentionally on feature branch)

If commits exist on a feature branch but not on master, AND the user did not explicitly choose "no" or "not yet" during Close Out, fail the close-out check with:

> "Commits remain on feature branch `<name>` and were not merged. Either merge them now, or confirm 'leave on branch' to proceed."

If user confirmed "leave on branch" during Close Out, allow Closed to proceed but note in the confirmation:

> "✓ Session closed cleanly. Note: commits remain on feature branch `<name>` per user choice."

3. Confirm any TODO.md updates surfaced in Close Out have been either applied or explicitly waived by the user.

4. If all checks pass: respond "✓ Session closed cleanly. All changes committed and pushed. Safe to end."

5. If any check fails: respond with which specific check failed, what state needs to be addressed, and do not declare the session closed. Wait for the user to address it and type "Closed" again.

The "Closed" command is the user's contract that the session is genuinely done. CCD's job is to verify the state matches that claim before agreeing.

## Commit destination

CCD worktrees check out a feature branch by default (e.g., `claude/<random-name>`). Work landing only on that branch is invisible to master and to future sessions.

The default sequence at the end of any session that produced commits:

1. Commit the work in the CCD worktree (on the feature branch — this is fine and expected).
2. Merge to master and push to origin via the Close Out procedure (see below).

Exceptions (do not auto-merge):
- Investigation-only sessions that produced no commits (no merge needed).
- Work-in-progress sessions where the user explicitly says "leave on the branch for now."
- Multi-day work spanning sessions where the branch is intentionally retained.

## Parallel Claude session workflow
The user runs **two Claude sessions in parallel** against this codebase:

- **Development session (Claude Code IDE / this session)** — owns code edits, deploys (`bash deploy.sh`), Firestore rule changes, Cloud Function deploys (`firebase deploy --only functions:...`), and live verification via Claude in Chrome browser tools. All `Edit`/`Write` operations originate here.
- **Testing / review session (separate CLI)** — runs read-only scans, code review (`tools/review.sh`), test suites, and diagnostic queries. Does NOT modify source files. Generated artifacts (e.g. `TODO.md`) appear in the working tree and are imported into the dev session's todo list.

**Coordination rules for the development session (this one):**
- Re-read files before editing — the testing session may add review artifacts; tag them as input, not as files to ignore.
- Don't assume the working tree is the same as last edit. Quick `git status` before risky changes is cheap insurance.
- If the user says "the CLI is touching X," skip X until they say it's safe.
- Do not run `tools/review.sh` or other test/scan scripts from the dev session — that's the CLI's job, and concurrent runs may corrupt their output files.

## Superpowers skills available (manual-load, local)
Jesse Vincent's `obra/superpowers` skill pack is cloned at `C:\Users\jon\superpowers\skills\`. The Claude Code plugin system isn't available in this environment, so skills are loaded on-demand via `Read` on `C:\Users\jon\superpowers\skills\<skill-name>\SKILL.md`.

**Claude should proactively offer to load a skill when a task matches:**
- **`systematic-debugging`** — tricky reproducible bug where the cause isn't obvious. Offer before diving in.
- **`writing-plans`** — multi-step feature work (3+ files or 30+ min estimated). Offer before writing code.
- **`brainstorming`** — vague / exploratory feature requests; socratic questioning before committing to a design.
- **`verification-before-completion`** — run before declaring a fix "done", especially for fixes the user explicitly asked to test.
- **`using-git-worktrees`** — when running experimental branches in parallel with mainline work.

Other skills present but lower-utility for this solo/single-file codebase: `subagent-driven-development`, `executing-plans`, `test-driven-development`, `requesting-code-review`, `receiving-code-review`, `dispatching-parallel-agents`, `finishing-a-development-branch`, `writing-skills`, `using-superpowers`.

### Trigger phrases the user may use
- **"use Superpowers"** / **"apply Superpowers"** / **"check Superpowers"** → user doesn't know or care which specific skill; Claude picks the best match for the current task from the list above, loads it, and applies it. If genuinely ambiguous, ask one clarifying question ("the task looks like a debugging problem vs. a design problem — which is it?") then proceed.
- **"use the <skill-name> skill"** → load exactly that skill by name.
- **"Superpowers on this"** / **"Superpower it"** → same as "use Superpowers".
- If multiple skills apply (e.g. a multi-step feature with a bug inside), load them in sequence: plan first, then debug as issues surface.

### User preference: always render spec + plan content inline
When the brainstorming or writing-plans skill produces a design spec or implementation plan document, SAVE it to the standard location (`docs/superpowers/specs/…` or `docs/superpowers/plans/…`) AND ALSO paste the full file content into the chat. User prefers to read specs/plans in the chat directly rather than opening the file. For long files (500+ lines) offer to chunk it into sections rather than a single message — but always show the content inline unless the user explicitly asks to just see the file path.

## Project Overview
- **App**: Firebase-hosted at https://matrix-arc.web.app
- **Architecture**: Source-and-bundle app:
  - `src/app.jsx` — JSX source of truth (~2 MB, **edit this** when changing app behavior).
  - `public/index.html` — HTML shell (~30 KB, references `index.bundle.js`). Edit when changing meta tags, fonts, head scripts, etc.
  - `public/index.bundle.js` — generated by `validate_jsx.js`, gitignored, regenerated on every deploy.
  - Cloud Functions in `functions/index.js`.
  - **Build step (v1.19.762):** `bash deploy.sh` runs `node validate_jsx.js` to compile JSX → JS via Babel before deploying. Eliminates the ~1-2 sec in-browser Babel cost. Local Babel toolchain: `@babel/core` + `@babel/preset-react` (classic runtime, matches what babel-standalone used to do in the browser).
- **Deploy hosting**: `bash deploy.sh` — auto-bumps patch version, commits, tags, pushes, deploys hosting
- **Deploy functions**: `firebase deploy --only functions` — must be run separately when `functions/index.js` changes
- **User always wants deploy after changes**
- **Git workflow**: `deploy.sh` handles commit + push + tag automatically. Never manually set a git tag before running deploy.sh (causes double version bump).
- **Versioning**: `vMajor.Minor.Patch` (semver). Current version lives in `APP_VERSION` constant in `public/index.html` — auto-bumped by `deploy.sh`, do not edit by hand.
  - **Patch** (x.x.+1): Bug fixes, cosmetic/wording tweaks, adjusting rates/thresholds, fixing a value that wasn't stored
  - **Minor** (x.+1.0): New AI prompt capabilities, new device types, new labor categories, new UI sections, restructuring data flow — anything that changes what the app can detect or output
  - **Major** (+1.0.0): Schema changes requiring migration, breaking changes to saved data format, `APP_SCHEMA_VERSION` bumps
- **JSX validation**: Run `node validate_jsx.js` before deploying to catch JSX errors early

## Verification toolkit

Located in `tools/`. Use these alongside development:

- `./tools/check-syntax.sh` — sanity-check that all JS parses; run after pulls or refactors.
- `./tools/review.sh [optional path]` — headless Claude review of uncommitted changes (`claude -p` with a diff). Run before non-trivial commits on pricing / Firestore / functions code.
- `./tools/preflight-functions.sh` — always run before `firebase deploy --only functions`.
- `./tools/install-hooks.sh` — one-time setup per checkout / per worktree. Installs the pre-commit hook into the active git hooks directory (worktree-aware via `git rev-parse --git-common-dir`). Re-run is idempotent.

**Pre-commit hook** (auto-fires on every `git commit` once installed):
- BLOCKS the commit if any staged `.js` file fails `node --check`.
- Runs an advisory Claude review (60s timeout) on staged files matching the risk pattern `pricing|quote|margin|markup|bom|firestore|rules|deploy|functions/index`. Review is advisory only — never blocks the commit.

**Outstanding findings**: see `TODO.md`. Each entry tagged OPEN / RESOLVED (with commit SHA) / STALE. Update when findings change state — don't delete history, mark it.

**Known toolkit gap**: hook only covers `.js`, not `.jsx`. Most of `src/app.jsx` (~2 MB, the bulk of the codebase) is unreviewed by the automated hook. Tracked as deferred toolkit improvement T1/T2 in `TODO.md`.

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
| Original PDFs (v1.19.959) | Firebase Storage `originalPdfs/{uid}/{projectId}/{fileId}.pdf` | Retained for native PDF input to Anthropic during BOM extraction. Image-based extraction is the fallback for legacy projects. Page metadata carries `originalPdfPath` + `pageNumber`. |
| Supplier uploads | Firebase Storage `supplierUploads/{token}/{filename}` | PDF uploads from supplier portal — MIME-restricted to `application/pdf` (v1.19.963) |
| Team members | `companies/{companyId}/members/{uid}` | Role: admin/edit/view |
| Team invites | `companies/{companyId}/pendingInvites/{token}` | Pending email invitations — token now generated server-side via `inviteTeamMember` Cloud Function (was weak `Math.random` in v1.19.964) |
| FCM push tokens | `users/{uid}/fcmTokens/{tokenHash}` | Push notification device tokens |
| Quote counter | `users/{uid}/config/quoteCounter` | Sequential quote number (next field) |
| Anthropic spend ledger (v1.19.965) | `users/{uid}/config/anthropicLedger` | `{monthKey, monthCents, totalCents, lastCallAt, lastCallModel, lastCallCents, lastCallUsage}` — running monthly burn for the toolbar pill. Updated on every API call by `_recordAnthropicUsage`. |
| Debug logs | `companies/{companyId}/debugLogs/{entryId}` | Error captures + user-reported issues; admin-readable (v1.19.584) |

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
| Task | Model | Input format | Notes |
|------|-------|--------------|-------|
| BOM extraction | Opus + thinking | **Native PDF document** when available (v1.19.959+); image fallback otherwise | Bypasses our render→JPEG→resize→re-encode pipeline for vector-text fidelity. Resolves OCR character-merging on dense D-size BOMs. Prompt cached via `cache_control: ephemeral` (v1.19.963). |
| Schematic / layout / pricing analysis | Sonnet | Image | |
| Page detection / part verification | Haiku | Image | |
| Supplier quote price extraction | **Sonnet 4** (via Cloud Function) | Image | Prompt is split into static system block (cached) + dynamic user block (per-token line items). |
| BC Item Browser row locate | Haiku (table boundaries + math) | Image | |

**Model gotcha:** Sonnet 4.6 does NOT support assistant prefill — use Haiku for prefill-based JSON extraction.

### Anthropic Cost-Attack Hardening (v1.19.955+)
The supplier portal Cloud Function `extractSupplierQuotePricing` is hardened against cost-attack via leaked tokens:
- Hard-cap `pageImages.length > 25` per call
- Per-image size cap (~5 MB raw)
- Reject when token `status === "submitted" || "dismissed"`
- Per-token call counter (`rfqUploads/{token}.aiCallCount`, max 10 lifetime)
- Per-token spend ledger (`rfqUploads/{token}.aiSpendCents`, max 500¢ = $5 lifetime)
- `maxInstances: 5` on the function — also applied (10 default, 1-3 for heavy scrapers) to every other callable

### Image Persistence
- `ensureDataUrl`: loads storage images via `<img crossOrigin>` + canvas (avoids CORS fetch issues)
- `dataUrl` is stripped on Firestore save (1MB limit), `storageUrl` is preserved
- Thumbnails use `pg.dataUrl || pg.storageUrl`
- Upload happens at end of `addFiles` after extraction/validation

### BOM Row Highlighting
A row gets a red background if ANY of these are true (see `_isBomRowFlaggedRed`):
1. `qty === 0` (excludes labor / customer-supplied)
2. `unitPrice === 0` (excludes labor / customer-supplied)
3. `priceDate` missing OR older than `_pricingConfig.defaultStaleDays` (default 60 days). Only applied to "priceable" rows — excludes labor, customer-supplied, contingency, job-buyoff, crate, Matrix Systems vendor.

### Cross-User Save Guards (v1.19.960+)
- `saveProject` reads current Firestore doc inside its save logic and PRESERVES admin-set fields that the incoming write would clobber:
  - `ownerTakeoverActive` if server has unexpired takeover and incoming write doesn't include it
  - `ownerLockActive` if server has it set and the writer is not the project owner
  - `reviewNotes` / `reviewShapes` (per-page) if incoming save is missing notes that exist on the server
- Same pattern as the storageUrl regression guard (v1.19.739) — single Firestore read per save, multiple guards layered on top.
- Quote-print lock (v1.19.965): `quotePrintLock = {lockedBy, lockedByName, lockedAt, expiresAt}` on the project doc; prevents two users from printing the same quote within a 30-second window.
- ECO transactional create (v1.19.965): `+ New ECO` runs inside `runTransaction`; aborts if another draft already exists.

### JSX Fragment Rule (CRITICAL)
When rendering a modal alongside a component's root `<div>`, the return MUST use a fragment:
```jsx
return(<>
  <div>...main content...</div>
  {showModal&&<MyModal .../>}
</>);   // <-- closing </> is REQUIRED
```
Missing `</>` or two root elements = site breaks. Always verify both `<>` AND `</>` match.

### Control Panel Lead Time (v1.19.706+)
`computeControlPanelLeadTime(panel, project)` returns the panel's ship date from `longestItemLeadDays + laborDays + productionDays` (sum-based, not max). Feeds a live chip to the left of each panel's status pill in QUOTE SUMMARY; clicking opens an override popover. `panel.productionDays` is a user-entered duration (0-365 days). `dailyCrewHours` + `leadTimeBatchSeconds` live in `LABOR_RATES`. Full spec: `docs/superpowers/specs/2026-04-24-control-panel-lead-time-design.md`. Plan: `docs/superpowers/plans/2026-04-24-control-panel-lead-time.md`.

### Batched BC Lead-Time Writeback (v1.19.711+)
Cell-level `leadTimeDays` edits enqueue in `_leadTimeBcQueue.current.pending` (Map keyed by rowId, dedupes re-edits) and flush via a 30-second debounced timer. Amber `⏳ N pending BC sync` pill in the BOM toolbar exposes manual force-flush; `visibilitychange` triggers best-effort flush when the tab hides. Configurable via `LABOR_RATES.leadTimeBatchSeconds`. Bulk paths (Push All, supplier portal Apply, Upload Supplier Quote) push immediately — deliberate user-initiated actions on complete data.

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
| `extractSupplierQuotePricing` | HTTPS callable | Sends PDF page images to Claude Sonnet 4, returns extracted prices/lead times |
| `extractBomPage` | HTTPS callable | Server-side BOM extraction (v1.19.981). Accepts native PDF (`{pdfPath, pageNumber}`) or image fallback. Client tries this first via `extractBomPageViaServer`; falls back to legacy direct API on error. Centralizes the Anthropic call. Prompt mirrored at `functions/bomPrompt.js` — keep in sync with `BOM_PROMPT` in app.jsx. |
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

High-level flow:
1. User sends RFQ emails → creates `rfqUploads/{token}` doc in Firestore with lineItems, expiry, etc.
2. Supplier receives email with "Upload Quote →" button link (`?rfqUpload=TOKEN`)
3. Supplier opens portal page, uploads PDF
4. Auto-scan: all PDF pages processed in batches of 20 (Anthropic API limit), no user intervention needed
5. Claude Sonnet 4 extracts prices/lead times with fuzzy part# matching
6. Supplier reviews, corrects, marks "Cannot Supply" for unavailable items, enters lead time
7. On submit: `rfqUploads/{token}` updated to `status: "submitted"`
8. Cloud Function `onSupplierQuoteSubmitted` fires → creates notification + sends email to ARC user
9. Bell badge appears in ARC toolbar; clicking notification navigates to project + opens submissions modal

Helper details (fuzzy matching, cannot-supply tracking, RFQ email structure, button names): see `docs/rfq-supplier-portal.md`.

## Project Kanban / Status System

Five columns (`draft`, `in_progress`, `evc`, `active`, `purchasing`) drive the project board. Routing logic: `bcPoStatus === "purchasing"` → Purchasing In Progress; `bcPoStatus === "Open"` → Active (Ready for Purchasing); otherwise the project's `status` field value. Full column labels, color values, and the source snippets: see `docs/kanban-status.md`.

## Notification System

In-app + push notifications for MatrixARC. Bell icon in the toolbar turns amber with a red badge when unread; clicking a supplier-quote notification navigates to the project and auto-opens `PortalSubmissionsModal`. Push triggers: supplier-quote submissions and engineer-question emails. Optional Teams channel posting via `postToTeams()`. Engineering Questions workflow (`panel.engineeringQuestions[]`, statuses: `open` / `answered` / `skipped` / `on_quote`) drives the pulsing yellow badge in QUOTE SUMMARY and the "Questions for Customer" block on printed quotes. Full schema, FCM token storage, PWA manifest details, and Engineering Questions specifics: see `docs/notification-system.md`.

## Debug Logging (v1.19.584+)

Client-side error capture + user-reported issue pipeline. Captures uncaught errors, promise rejections, and `console.error` / `console.warn` calls automatically; users can also file reports via the floating `🐛 Report Issue` button. Logs are append-only at `companies/{companyId}/debugLogs/{entryId}` (or `users/{uid}/debugLogs/{entryId}` fallback) — admin-readable, immutable. Admins view the stream via **Settings → Debug Logs**. Each entry carries severity, source, breadcrumbs (last ~30 events), and project/panel context. Full schema, client-capture wiring, and UI surfaces: see `docs/debug-logging.md`.

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

### Font Sizes
Quote form sizes (+20% from original) and one-page T&C sizes are tabulated in `docs/quote-print-fonts.md`. Update that doc when changing sizes in `src/app.jsx`.

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

### Owner Priority Mode (v1.19.678–683)
Soft-lockout that activates when the project owner is viewing — sits between Hard Project Lock (task running) and free-for-all. Triggered by owner's `projectPresence.lastSeen` within 90s OR `project.ownerLockActive === true`; overridden by active admin takeover (`project.ownerTakeoverActive`, 15-min auto-expire). Hard-locks 13 destructive actions (re-extract, refresh pricing, send quote, send RFQs, etc.); allows view + row/field edits. Server-side enforcement via Firestore rules helper `isOwnerPriorityLocked(project)`; audit trail at `companies/{companyId}/ownerTakeovers/{id}`. Full spec: `docs/superpowers/specs/2026-04-23-owner-priority-mode-design.md`. Plan: `docs/superpowers/plans/2026-04-23-owner-priority-mode.md`.

### Item Lead Times (v1.19.684–692)
Per-item lead times populated from a ranked source precedence on every BOM row: `supplier` → `scraper` → `bc_vendor` → `bc_item` → `ai`; manual edits override all auto-sources until force-refresh. Fields on BOM rows: `leadTimeDays`, `leadTimeSource`, `leadTimeUpdatedAt`, `leadTimeEstimated` (preserved on save). Fetch piggybacks on `runPricingOnPanel`. Writeback to BC `ItemVendorCatalog` happens during `doApplyPortalPrices` (HARD REJECT on blank partNumber); audit at `companies/{companyId}/bcLeadTimeWrites/{id}`. RFQ "Lead Times Only" mode adds a per-vendor checkbox that switches the portal to lead-time-only validation. Full spec: `docs/superpowers/specs/2026-04-23-item-lead-times-design.md`. Plan: `docs/superpowers/plans/2026-04-23-item-lead-times.md`.

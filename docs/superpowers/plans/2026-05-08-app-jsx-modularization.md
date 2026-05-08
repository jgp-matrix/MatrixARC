# `src/app.jsx` Incremental Modularization Plan

**Status:** Draft for review. No code changes performed; nothing committed.
**Date:** 2026-05-08
**Author:** investigation session in worktree `loving-wiles-d3a413`
**Scope:** plan only — execution gated on user approval phase-by-phase.

---

## 0. Basis for the risk model: first-principles, not historical

A prior `matrix-arc-working` refactor attempt existed but was deliberately deleted during today's cleanup because it wasn't progressing well. The branch and any sibling working directory are gone by choice, not by accident. Confirmed during investigation:

- `git reflog --all` and `git fsck --lost-found` in this repo — no commits referencing `matrix-arc-working`, no dangling commits matching `modular`, `refactor`, `chunk`, or `split`.
- `git ls-remote origin` — only `master`, no `matrix-arc-working` ref upstream.
- `C:\Users\jon\AppDev\` — no `matrix-arc-working` folder on disk.
- `TODO.md` — no entries reference a prior attempt.

**Consequence for this plan:** the failure-mode analysis in Section 3 is derived from first-principles reasoning about the *current* architecture's coupling shape (32 module-level globals, ~295 closure-captured helpers, single Babel pass, no bundler), not from artifacts of the prior attempt. This is a deliberate choice, not missing information. The prior attempt's specific lessons are not recoverable; the plan stands on the architectural facts visible today.

---

## 1. Inventory of `src/app.jsx`

### 1.1 Headline numbers

- **41,837 lines**, single file.
- **~75** top-level React function components (`function ComponentName(...)`).
- **~295** module-level functions/constants total.
- **787** `useState` calls, **153** `useEffect` calls.
- **~32** module-level mutable `let` globals (`_appCtx`, `_pricingConfig`, `_bcConfig`, `_bcToken`, `_msalInstance`, `_bgTasks`, `_pendingPagesCache`, `_altCache`, `_correctionsCache`, `_cpdCache`, `_layoutLearningCache`, `_pageTypeLearningCache`, `_odataPageCache`, `_planPageCache`, `_vendorMapCache`, `_bcQueueCountSetter`, `_jsPdfReady`, `_saveFailBanner`, etc.).
- **268** references to `fbDb` / `fbAuth` (declared once at lines 256–257 as plain `const`s consumed by every helper).
- **1 file** in `src/`. The build step (`validate_jsx.js`) runs Babel once on `src/app.jsx` and emits `public/index.bundle.js`.

### 1.2 Major logical sections (line ranges from `// ── BANNER ──` markers)

| Lines | Section | Notes |
|---|---|---|
| 1–229 | React/global imports, `ANTHROPIC_MODELS`, joke engine, `useSmoothProgress`, `useBgTasks`, `useCustomerLogo` | Pure-ish utility & one-off curiosities |
| 229–243 | `C` (theme), style helpers | Pure constants — easy lift |
| 244–270 | API key loader, NIQ search engine | Firestore-bound |
| 271–322 | NIQ AI learning store | Firestore + cache |
| 323–544 | BC config + token + MSAL bootstrap + background task registry | Auth-adjacent globals |
| 544–578 | Project live-update event bus | Pub-sub with module-level Map |
| 579–933 | **Labor estimation, ECO math, panel sell-price math, project totals** | Pure-functional, ~350 lines, very extractable |
| 935–1047 | Service Cards (project quote line items) | Mostly pure |
| 1049–1087 | Labor BOM rows | Pure |
| 1088–1422 | **Control Panel Lead Time** (`computeControlPanelLeadTime`) | Pure, ~330 lines |
| 1424–1546 | MSAL script loader / Microsoft Graph / Office365 helpers | Auth side-effect |
| 1548–1567 | Debug log flag |
| 1567–1830 | **`arcAlert/arcConfirm/arcPrompt` dialog system** + popup-blocked modal | Module-level queue + 2 React components |
| 1831–1898 | App context, role helpers, tooltips, pricing config, labor rates | Globals |
| 1900–2125 | Alternates database (read/write/auto-apply) | Firestore + cache + pure helpers |
| 2126–2142 | Quote-number counter |
| 2143–2459 | CPD database + part categorization | Cache-heavy |
| 2460–2922 | **Business Central API** core (`bcAuth`, `bcFetch`, customer/item/vendor CRUD) | ~460 lines, heavy |
| 2923–4474 | **BC service-card sync, project sync, BOM push** | ~1,550 lines — single largest BC chunk |
| 4475–5315 | BC manufacturer code mapping, vendor resolution, OData paging | Helpers used by BC core |
| 5316–5969 | **BC offline queue** | ~650 lines including localStorage persistence + retry/backoff |
| 5970–7316 | **Quote PDF builder + BOM Report PDF builder** | ~1,350 lines, jsPDF, mostly pure given inputs |
| 7317–7531 | Supplier quote import (PDF parsing path) |
| 7532–7559 | Image resize helper | Pure |
| 7560–7688 | Quote revision hash | Pure |
| 7689–8302 | **Firestore project save/load + Copy Project** | ~610 lines, includes the cross-user save guards |
| 8303–8404 | Firebase Storage helpers, project migration |
| 8405–8551 | Part library |
| 8552–8610 | Default BOM items |
| 8611–9104 | **BOM merger** (~490 lines, deep merge logic with retention guarantees) |
| 9105–9150 | Firestore team helpers, callable wrappers |
| 9151–10239 | **BOM extraction prompt + `extractBomPage` (legacy direct API path)** ~1,090 lines |
| 10240–10516 | Per-row snippet self-correction, part-number verification |
| 10517–10685 | BOM audit (second-pass verification) |
| 10686–10973 | **Schematic / layout / backpanel / enclosure AI prompts** ~290 lines |
| 10974–11240 | Layout / page-type / region / device-classification learning DBs |
| 11241–11355 | `runPanelValidation` |
| 11356–11552 | Compliance review |
| 11553–11706 | Burn-stamp into image (canvas overlay) |
| 11707–12467 | **Background extraction task** (~760 lines, survives unmount) |
| 12468–12503 | Pricing prompt |
| 12504–12609 | Page type detection (Haiku) |
| 12610–12621 | Page-types backward-compat helper |
| **12622–end (~29,200 lines)** | **All React components** | Modals, panels, dashboards, project view, item browser, etc. |
| 41096–41771 | `SupplierPortalPage` (token-gated public portal — independent surface) |
| 41772–end | `Root` (mount) |

### 1.3 The "all React components" bucket (29k of the 42k lines)

The component bulk breaks down roughly:

| Lines | Component cluster |
|---|---|
| 12723–13262 | `ConfidenceBar`, `Badge` |
| 13264–14706 | **ECO editor + scope tabs** (~1,440 lines) |
| 14708–14829 | Engineering Questions modal |
| 14848–15321 | Pricing config modal |
| 15323–15950 | Company / team / member / login modals |
| 15952–17840 | **RFQ + supplier portal modals** (~1,890 lines) |
| 17102–17840 | QuoteTab |
| 17860–18263 | Title block extractor + per-customer template learning |
| 18335–18793 | **Drawing lightbox** (~460 lines, region/note overlay editor) |
| 18795–19665 | **BC Item Browser modal** (~870 lines) |
| 19696–20053 | Banners (zero BOM, scan results) |
| **20054–26031** | **`PanelCard`** — single largest component, **~6,000 lines**. The inline workspace where most user time is spent. BOM table, drawings, validation, AI calls, all here. |
| 26032–28232 | CPD search, BOM-in-BC update, supplier quote import modals |
| 28249–28786 | Quote-send / cadlink modals + service card |
| 29002–30952 | **`PanelListView`** (~1,950 lines) |
| 30954–31076 | `QuoteView` |
| 31077–33771 | **`ProjectView`** (~2,700 lines) — owns most cross-panel state |
| 33772–34730 | Test panels (Codale / Mouser / Digikey / pricing audit / vendor sync) |
| 34772–37151 | API setup, cost analysis, customer templates, settings, delete, new project, supplier pricing, about, AI database |
| 37322–37990 | Dashboard + project tile |
| 37999–38040 | Left nav |
| 38041–38161 | Purchasing / Engineering iframe loader tabs |
| 38181–39280 | **Vendors / Items tabs** (~1,100 lines) |
| 39281–39481 | Debug logging UI |
| **39482–40976** | **`App`** (~1,500 lines) — top-level orchestrator |
| 40804–41058 | Tour overlay |
| 41096–41771 | Supplier portal page (independent surface) |

### 1.4 Already-extracted siblings

The repo already has a precedent for non-bundled, separately-loaded surfaces:

- `public/modules/shared.js` (347 lines) — IIFE-wrapped context bridge that exposes Firebase + BC token + app context to embedded module pages. Promises a global `arcModuleReady`.
- `public/modules/engineering/{engineering,annotations,portal}.js` (~1,120 lines combined)
- `public/modules/purchasing/purchasing.js` (89 lines) + iframe HTML

These modules use plain `<script>` tags (no ES `export`), live in iframes loaded by `PurchasingTab` / `EngineeringTab` inside the bundle. **None of them participate in the Babel build for `src/app.jsx`.** They're precedent for *splitting at a route/iframe boundary*, not for splitting the bundle itself.

---

## 2. Dependency map — where the coupling actually is

### 2.1 Five global state islands the bundle relies on

These are `let` bindings at module scope inside `src/app.jsx`. Every helper closes over them at parse time:

1. **Firebase singletons** — `fbAuth`, `fbDb` declared at line 256–257. Read by ~268 call-sites.
2. **App context** — `_appCtx` (uid, companyId, role, permissions, projectsPath, configPath, company). Mutated on auth and on company switch. Read everywhere.
3. **BC connection** — `_bcConfig`, `_bcToken`, `_bcCompanyId`, `_msalInstance`, `_msalReady`, plus `_bcLastAccountUsername`, `_graphToken`. Mutated by login flow, read by every BC helper.
4. **Pricing/labor config** — `_pricingConfig`, `LABOR_RATES`, `_defaultBomItems`. Loaded once after auth.
5. **Caches** — `_altCache`, `_correctionsCache`, `_cpdCache`, `_layoutLearningCache`, `_pageTypeLearningCache`, `_vendorMapCache`, `_odataPageCache`, `_planPageCache`, `_niqCache`. Lazy-initialized on first read; sometimes invalidated on save.

There is no DI. Every pure-looking helper actually reads a closure-captured global. **This is the central reason simple file-splitting won't work**: moving a function to a new file means it can no longer see the global unless the global is also moved or re-exported, and circular `require`/`import` graphs follow immediately.

### 2.2 React-side cross-references

- `App` (39,482) consumes nearly all top-level Firestore listeners and is responsible for routing (`view`, `tab`, `selectedProjectId`).
- `ProjectView` (31,111) holds the per-project state and mounts `PanelListView` / `PanelCard` / `QuoteView`.
- `PanelCard` (20,054) is the engine. It drags `useState` hooks for: BOM rows, drawings, validation, owner takeover, ECO scope, lead time, lightbox state, AI extraction in flight, supplier portal submissions. It also calls into module-level globals for: BC, alternates DB, corrections DB, CPD DB, pricing config, labor rates, layout learning, page type learning, region learning, device classification, panel validation, compliance review, background extraction, pricing prompts. Every section of the file is reachable from `PanelCard`.
- Module-level setter pattern — `_bcQueueCountSetter`, `_saveFailBanner`, `_appProjectUpdateFn` — components register themselves on mount so non-React code can call back into the React tree. **This is the most fragile coupling for a refactor**: the order of mount vs. first-call of a global helper matters.

### 2.3 Suspected circular hot-paths

If the bundle were split today by section banner, these are the places where two-way imports would appear:

- BC core ↔ BC offline queue (queue calls back into `bcAuth/bcFetch`, BC core calls `bcEnqueue` on connection failure).
- BOM extraction ↔ alternates DB ↔ corrections DB (extraction reads them; saving an alternate from inside extraction writes them).
- Project save (`saveProject`, line ~7689) ↔ BOM merger ↔ Firebase Storage helpers (save reads merged BOM and uploads stripped images).
- `runPanelValidation` ↔ labor estimation ↔ default BOM items ↔ service cards.
- Background extraction task ↔ `bgUpdate/bgDone` ↔ `notifyProjectListeners` ↔ React `App` setter callbacks.
- React components ↔ `arcAlert/arcConfirm/arcPrompt` (dialogs use module-level queue + a React component registered as host; circularity emerges if the dialog system moves to its own module before the host component does).

### 2.4 Build assumptions that constrain the refactor

- **No bundler.** `validate_jsx.js` runs a single Babel pass with `preset-react` (classic runtime) and writes `public/index.bundle.js`. Imports/exports across files are not currently part of the toolchain. Adding multi-file source means either (a) concatenate-then-Babel, (b) introduce a real bundler (esbuild/rollup), or (c) keep splits at the iframe/script-tag boundary (the existing `public/modules/` pattern).
- **No npm workspace for the front-end.** React, Firebase, jsPDF arrive via CDN `<script>` tags in `public/index.html`. Adding bundled imports means wiring node_modules resolution, or sticking with CDN globals and only extracting our own code.
- **Single-file deploy contract.** `deploy.sh`'s cache-bust regex looks for `index.bundle.js?v=…`. Moving to multi-file output requires updating the cache-bust step (TODO finding #16-style verifier).
- **Pre-commit hook covers `.js` only, not `.jsx`.** The existing TODO calls this out (T1/T2). Splitting source increases the value of fixing T1 first.

---

## 3. Likely failure modes (first-principles, not historical)

**Note on basis:** the prior `matrix-arc-working` attempt was deliberately deleted during today's cleanup because it wasn't progressing well — see Section 0. The lessons that follow are not recovered from that attempt. They are inferred from the current codebase's coupling shape: 32 module-level `let` globals closure-captured by ~295 helpers, a single-Babel-pass build with no bundler, classic JSX runtime over CDN globals, and React tree mounted by a top-level `App` that registers setter callbacks for non-React code. Any of those properties, in combination with naive file-splitting, produces one of the failures below. This is a *deliberate substitution* of architecture-derived analysis for missing historical evidence.

The failures most consistent with this codebase's shape are:

1. **Top-level-await-style init order.** A module imports `bcCore` to call `bcFetch`; `bcCore` imports `_appCtx` from a different file; `_appCtx` is set by the auth listener mounted by `App`, which imports `bcCore` for `bcOffline`. Either bundler runs into a circular import (live binding still `null` when first call happens) or, worse, minified output shuffles statement order and the global is consumed before assignment.
2. **Minifier cross-chunk hoisting.** With code-splitting (e.g. `React.lazy`), helper functions that were colocated get separated. If they share module-level `let` state (caches, the BC offline queue), each chunk gets its own copy and the offline queue silently bifurcates.
3. **`React.lazy` + closure-captured setter pattern.** `_bcQueueCountSetter` is registered on mount of a top-level toolbar component. If that component lazy-loads, BC queue events that fire before the toolbar mounts get dropped or throw on `_bcQueueCountSetter is null`.
4. **`arcAlert/arcConfirm/arcPrompt` race.** The dialog host (`ArcDialogHost`) is mounted by `App`. If a module-level helper triggers an alert during a pre-mount async (e.g. background extraction restart on page load, BC offline queue replay), the dialog queue holds it forever or drops it. Splitting the dialog system out is the easiest way to expose this.
5. **JSX classic runtime + cross-file React reference.** `const {useState,useEffect,...}=React;` at line 2. If any new module is loaded before the global `React` script tag has executed (e.g. served as a true ES module with `<script type="module">` at the top of `<head>`), `React` is undefined. Quietly works in dev because of HMR, blows up in production minified output.
6. **Babel `runtime: 'classic'` + `import`/`export`.** Mixing classic JSX runtime with ES modules works in Babel but breaks any heuristic that assumed a single-file JSX bundle (e.g. our `validate_jsx.js`'s parser-only fast path on lines that aren't valid as standalone modules).
7. **Service-worker cache pinning.** `public/sw.js` and `firebase-messaging-sw.js` are present. If new bundle filenames are emitted (e.g. `vendors.bundle.js`) without the cache-bust verifier covering them, returning users get a stale partial bundle and a runtime error.

The plan below is written to make each of the above failure modes either impossible or detectable inside one phase.

---

## 4. Phased extraction order

**Guiding principles:**

- **Start at leaves**, not at modals or pages. Pure functions with no React dependency move out first.
- **Preserve the single-bundle output** for as long as possible; only adopt a real bundler when the residual shape demands it.
- **Every phase is independently shippable** behind a deploy + smoke test. If a phase fails, rollback is `git revert <SHA>` plus `bash deploy.sh`. No phase requires a follow-up phase to be functional.
- **No global behavior changes** in any extraction phase. Pricing, BC writes, BOM merging stay byte-for-byte equivalent — verified by hash where possible.
- **Module-level `let` globals are migrated last**, not first. The temptation is to move `_appCtx` into its own module on day one; that's exactly what will trigger circular imports. Globals stay where they are until a critical mass of consumers have moved.

### Phase A — Tooling preconditions (no source code moves)

**Goal:** make modularization measurable and fail-safe before touching anything.

- A.1 Resolve TODO finding T1/T2: extend the pre-commit hook to `.jsx` (`node --check` doesn't accept JSX, so use `@babel/parser` for JSX files — pattern already present in `validate_jsx.js`).
- A.2 Add a per-deploy invariant check to `deploy.sh`: bundle output line count must be within ±5% of the previous deploy's bundle, OR the diff explicitly lists removed files. Catches "module silently dropped" regressions. (TODO #16-style.)
- A.3 Add a "import graph linter" — a 30-line script that reads each new module and flags circular `require`/`import` graphs. Run it from the pre-commit hook.
- A.4 Establish a smoke-test script (`tools/smoke.sh`) that, post-deploy, hits the live URL with a headless browser, logs in as a fixture account, opens a project, opens a panel, opens a drawing, exits. Today this is manual. Even a 5-step Playwright happy-path catches 80% of regressions.

**Risk:** low. **Effort:** 1 day. **Validation:** the smoke-test script itself becomes the validation rig for every subsequent phase.

### Phase B — Pure-leaf utilities (no Firebase, no React, no globals)

**Goal:** extract files that have zero closure-captured dependencies, just inputs in, outputs out.

Candidate modules:

- `src/utils/labor.js` ← lines 579–933 (labor estimation, ECO math, panel sell-price math, project totals, service cards, labor BOM rows)
- `src/utils/leadTime.js` ← lines 1088–1422 (control panel lead time + helpers)
- `src/utils/quoteRevisionHash.js` ← lines 7560–7688
- `src/utils/imageResize.js` ← line 7532–7559
- `src/utils/bomMerger.js` ← lines 8611–9104 (provided it has no global reads — needs verification)
- `src/utils/partLibrary.js` ← lines 8405–8551
- `src/utils/defaultBomItems.js` ← lines 8552–8610
- `src/utils/categorizePart.js` ← line 2229 only (the function `categorizePart` is in the CPD section but is itself pure)
- `src/constants/theme.js` ← lines 229–243 (`C` and style helpers)
- `src/constants/anthropicModels.js` ← lines 10–16

Each gets one file. Each is bundled into `public/index.bundle.js` by extending `validate_jsx.js` with a one-time concat step (resolve `import` statements at build time by inlining — no runtime module system introduced yet). The contract is "build still emits one file, source is just split."

This avoids Phase 3-1 (init-order failures), Phase 3-2 (chunk hoisting), and Phase 3-5 (React global) entirely because the runtime artifact is unchanged.

**Risk:** low. **Effort:** 2–3 days. **Validation per file:** byte-diff the previous bundle with the new bundle after Babel runs; only trivial differences (whitespace, source-map comments) should remain. Smoke-test script must pass.

### Phase C — Dialog system, background tasks, project pub-sub

**Goal:** extract the cross-cutting helpers that *do* hold module-level state but are mounted by `App` exactly once.

Candidate modules:

- `src/services/dialogs.js` ← lines 1567–1830 (`arcAlert/arcConfirm/arcPrompt` + `ArcDialogHost` + `PopupBlockedModal`). Components stay in the file but exports the queue and host.
- `src/services/bgTasks.js` ← lines 385–544 (background task registry + remote tasks)
- `src/services/projectEventBus.js` ← lines 544–578 (pub-sub)
- `src/services/jokeEngine.js` ← lines 17–209
- `src/hooks/useSmoothProgress.js` ← lines 110–197
- `src/hooks/useCustomerLogo.js` ← lines 207–229

Each module exports its public functions and (where applicable) a React component. The setter-registration pattern (`_bcQueueCountSetter` etc.) becomes an explicit `register*` function on the module, which is a refactor in itself but trivially reversible.

Risk introduced in this phase: failure mode 3-4 (dialog race). Mitigation: keep the dialog host export *exactly* shaped as today, and add a unit test that calls `arcAlert` before the host mounts and verifies the queued message is replayed.

**Risk:** medium-low. **Effort:** 2 days. **Validation:** smoke test + manual: log in (triggers MSAL/dialog), trigger a save failure (triggers banner), trigger a BC reconnect (triggers queue badge). Each surface known to use the registration pattern gets exercised.

### Phase D — BC subsystem (the largest single domain extraction)

**Goal:** carve BC into its own folder. Lines 2460–5969 plus parts of the auth bootstrap (1424–1546).

Candidate layout:

- `src/bc/index.js` (re-exports public surface)
- `src/bc/auth.js` (MSAL + token + company)
- `src/bc/api.js` (`bcFetch`, OData paging)
- `src/bc/customers.js`, `src/bc/items.js`, `src/bc/vendors.js`, `src/bc/quotes.js`, `src/bc/jobs.js`
- `src/bc/manufacturerMap.js` (lines 4475–4577)
- `src/bc/serviceCardSync.js` (lines 2923–4474)
- `src/bc/offlineQueue.js` (lines 5316–5969)

Two cross-module hazards to resolve:

- `bcCore` ↔ `offlineQueue` cycle (mitigation: pass `bcEnqueue` as an injected callback into `bcCore` via a one-time `init({enqueue})` call from `App`'s mount).
- `bcCore` reads `_appCtx`. `_appCtx` does *not* move in this phase. `bcCore` imports it from its current location. This is the explicit "globals stay" rule.

**Risk:** medium-high. This is the riskiest of the per-domain phases because BC behavior is hard to test without a real BC tenant. Mitigation: extract BC behind a feature-detect — at runtime, the bundle continues to carry the *current* BC code path, and the new modules are wired in but called via a thin adapter. After 1 week of clean production telemetry, the old code path is removed in a follow-up commit.

**Risk:** medium-high. **Effort:** 4–5 days for the move + 1 week of dual-path observation + 1 day cleanup. **Validation:** `tools/preflight-functions.sh` (no BC functions affected, but useful for parallel work). Manual: connect BC, send an RFQ that builds a purchase quote, push BOM to BC, simulate offline (block firewall to BC host), reconnect, verify queue drains. The BC writeback audit collection (`companies/{cid}/bcLeadTimeWrites`) gives a record of writes for sanity-check.

### Phase E — Quote/PDF builders + Firestore I/O

**Goal:** lines 5970–8302 (Quote PDF, BOM Report PDF, Firestore project save/load, copy project, storage helpers, project migration).

Candidate layout:

- `src/pdf/quoteBuilder.js`
- `src/pdf/bomReportBuilder.js`
- `src/firestore/projects.js` (saveProject, saveProjectPanel, loadProjects, copyProject, migration)
- `src/firestore/storage.js` (storage helpers, `ensureDataUrl`)

Save guards (cross-user save, `ownerLockActive`, `quotePrintLock`) stay inside `firestore/projects.js`. **The data-retention rules in CLAUDE.md govern this phase tightly** — no field can be dropped during the move.

**Risk:** medium. **Effort:** 3 days. **Validation:** load the 5 oldest projects in production data, save without changes, byte-diff before/after Firestore docs (excluding `updatedAt`). Smoke-test full project lifecycle.

### Phase F — AI prompt + extraction subsystem

**Goal:** lines 9151–12609 (BOM extraction prompt + `extractBomPage` legacy path, snippet correction, part verification, BOM audit, schematic/layout/backpanel/enclosure prompts, learning DBs, validation, compliance review, burn-stamp, background extraction task, pricing prompt, page-type detection).

Candidate layout:

- `src/ai/bomExtractionPrompt.js`
- `src/ai/extractBomPage.js`
- `src/ai/audit.js`
- `src/ai/schematicPrompts.js`
- `src/ai/learning/{layout,pageType,region,deviceClass}.js`
- `src/ai/validation.js` (`runPanelValidation`)
- `src/ai/compliance.js`
- `src/ai/burnStamp.js`
- `src/ai/backgroundExtraction.js` (the survives-unmount task)
- `src/ai/pricingPrompt.js`
- `src/ai/pageTypeDetect.js`

The prompt at `BOM_PROMPT` must be kept in sync with `functions/bomPrompt.js` (CLAUDE.md). After extraction, propose an automated equality assertion at build time: read both files, diff the prompt bodies, fail the build if they drift. (This is a side-quest that becomes nearly free once the prompt is its own importable module.)

**Risk:** medium. **Effort:** 4 days. **Validation:** re-run BOM extraction on 5 representative projects (cabinet door schematic, dense D-size BOM, multi-page set), compare extracted BOM JSON to last-known-good. Background extraction restart-from-page-reload must still work — that's the closest analogue to failure mode 3-3.

### Phase G — Component carving (the long tail)

**Goal:** the ~29,000 lines of React components.

Order, easiest first:

1. `src/components/modals/` — every standalone modal (`PricingConfigModal`, `CompanySetupModal`, `RemoveMemberModal`, `TeamModal`, `RfqEmailModal`, `PoReceivedModal`, `PortalSubmissionsModal`, `RfqHistoryModal`, `PurchasePriceCheckModal`, `SentQuoteEditConfirm`, `BCItemBrowserModal`, `CPDSearchModal`, `UpdateBomInBCModal`, `SupplierQuoteImportModal`, `CADLinkSendModal`, `QuoteSendModal`, `OwnerTakeoverModal`, `DeleteConfirmModal`, `NewProjectModal`, `SupplierPricingUploadModal`, `AboutModal`, `SettingsModal`, `CostAnalysisModal`, `CustomerTemplatesModal`, `ReportsModal`, `CopyProjectModal`, `TransferProjectModal`, `APISetupModal`, `PricingAuditModal`, `PricingReportsModal`, `EngineeringQuestionsModal`, `ReportIssueModal`, `DebugLogsModal`). Most are <500 lines; each is independently testable.
2. `src/components/quote/` — `QuoteTab`, `QuoteView`, `RfqDocument`, contingency/services cards.
3. `src/components/eco/` — `EcoScopeTabs`, `EcoEditor` (~1,440 lines).
4. `src/components/dashboard/` — `Dashboard`, `ProjectTile`, `LeftNav`.
5. `src/components/admin/` — test panels (Codale/Mouser/Digikey/Vendor sync), `AIDatabasePage`, `VendorsPanel`, `ItemsTab`, debug logging UI, `TourOverlay`.
6. `src/components/lightbox/` — `DrawingLightbox`, `StampedDrawing`.
7. `src/components/banners/` — `ZeroBomBanner`, `ScanResultsBanner`, `Badge`, `ConfidenceBar`.
8. `src/components/login/` — `LoginScreen`.
9. `src/components/portal/` — `SupplierPortalPage`. This one is special: it could plausibly graduate to a separate route + bundle, mirroring the existing `public/modules/` pattern. Consider it.
10. `src/components/PanelListView.jsx` ← lines 29002–30952. Single move once its child modals are out.
11. `src/components/ProjectView.jsx` ← lines 31111–33771. Single move after `PanelListView`.
12. **`src/components/PanelCard.jsx`** ← lines 20054–26031, 6,000 lines. **The hardest piece in the codebase.** Do not attempt to internally subdivide PanelCard until it lives in its own file with its current shape preserved. Once isolated, propose a follow-up plan for splitting it.
13. `src/components/App.jsx` ← lines 39482–40976. Last component to move.
14. `src/Root.jsx` ← lines 41772–end. Mount point.

Each component move is ≤1 day, smoke-tested individually. Modal moves can be batched 5 at a time.

**Risk:** low per move, accumulating. **Effort:** 4–6 weeks at a sustainable pace.

### Phase H — Globals decomposition (the final, riskiest piece)

**Goal:** with all consumers in their own files, finally move `_appCtx`, `_pricingConfig`, `LABOR_RATES`, the BC tokens, and the cache layer into explicit modules.

This is where the inferred failure modes hit hardest. Mitigations:

- Migrate one global at a time, behind a `// TEMP shim` re-export from the original location. So `src/state/appCtx.js` becomes the new home, and the old definition site re-exports from it for one release.
- Use `Object.defineProperty(globalThis, '_appCtx', {get: () => state.appCtx})` for a transitional release if needed, to keep the closure-captured reads working without rewriting every consumer.
- After 1 week of clean telemetry post-shim, remove the shim and update consumers.

At this point, the codebase looks like a normal React app with explicit imports. The bundle could be split (vendor bundle, AI bundle, BC bundle) if the bundle size justifies it. Probably it won't — the existing 2 MB JSX compiles to ~1.8 MB JS, which is a single HTTP/2 stream and not worth splitting in the average case.

**Risk:** medium-high. **Effort:** 2 weeks.

### Phase I — Optional: introduce a real bundler

**Goal:** replace `validate_jsx.js`'s concat-then-Babel with esbuild or Vite.

Only do this *after* Phases A–H are complete. Otherwise the bundler change happens against a 41,000-line single file, which obscures every regression in noise.

**Risk:** medium. **Effort:** 3 days. **Validation:** the cache-bust verifier (#16) and the Phase A smoke-test script catch most issues. Compare bundle size and first-paint time before/after.

---

## 5. Validation framework (applies to every phase)

After **every** phase commit:

1. `node validate_jsx.js` — bundle compiles cleanly.
2. `bash deploy.sh` — deploy to production hosting (`matrix-arc.web.app`).
3. Hard-refresh the live URL in two browsers (Edge, Chrome). Confirm:
   - Login completes (Google + Microsoft SSO).
   - Dashboard loads with project list.
   - Open the most-recently-touched project. Panel renders. Drawing thumbnails render.
   - Open BOM table. Edit one cell. Save. Reload. Verify edit persisted.
   - Connect BC if not connected. Verify customer search works.
   - Print Client Quote → confirm PDF dialog opens with one full quote + T&C page.
4. Check `companies/{cid}/debugLogs` in Firestore for any new errors with `appVersion` matching the just-deployed bundle.
5. Wait 24 hours; check the same query again. If clean, mark phase complete.
6. **If any of the above fails, immediately `git revert <SHA>` and `bash deploy.sh`.** No exception. Forward-fix lives in the next phase, not this one.

For Phases D, E, F, G's PanelCard, and H — the "high-risk" phases — also:

- Bisect-verify on staging by toggling the new module via a feature flag (URL query param) for 24 hours before promoting to default.
- For BC and AI extraction phases: run the same input through old + new code paths and diff outputs in a dev session.

---

## 6. Effort + risk summary

| Phase | Effort | Risk | Reversibility |
|---|---|---|---|
| A — Tooling | 1d | Low | n/a |
| B — Pure leaves | 2–3d | Low | Trivial revert |
| C — Cross-cutting services | 2d | Medium-low | Single revert |
| D — BC | 4–5d + 1wk shadow | Medium-high | Feature-flag rollback |
| E — Quote PDF + Firestore I/O | 3d | Medium | Single revert; data-retention audit per change |
| F — AI / extraction | 4d | Medium | Single revert |
| G — Components | 4–6wk | Low per move | Per-component revert |
| H — Globals | 2wk | Medium-high | Shim-based gradual migration |
| I — Bundler | 3d | Medium | Optional, defer until clean |

**Total elapsed:** 2–3 months at sustainable pace, single contributor, with parallel feature work continuing.

If the plan's pace is too slow, the *correct* compression is to drop scope (skip Phase I; defer Phase H; stop at Phase G), not to compress per-phase validation.

---

## 7. Open questions for the user before any phase begins

1. **Bundler appetite** — are you open to introducing a real bundler (esbuild/Vite) eventually, or is "Babel single-file" a hard constraint? The plan defers this to Phase I, but it shapes Phase B's "concat then Babel" approach.
2. **Smoke-test rig** — do you want to invest in Phase A.4 (Playwright smoke tests) up front, or should every phase rely on manual smoke testing? Playwright is ~1 day; without it the per-phase validation cost is the constant tax.
3. **Production data sensitivity** — Phase E (Firestore I/O) needs a recent prod-data export to a staging Firestore for byte-diff testing. Do you have a staging project, or should phase E gate on creating one?
4. **Pace** — start with Phase A immediately, or start with B (visible code movement) to build confidence in the workflow first? Recommend A; happy to flip if you'd rather see early movement.

---

## 8. What this plan deliberately does **not** do

- It does not move `PanelCard`'s internal subdivisions. PanelCard's 6,000 lines are an entire follow-on plan.
- It does not split the bundle into multiple HTTP-loaded chunks. Single bundle stays the deploy contract through Phase H. Code splitting is Phase I's optional output.
- It does not touch Cloud Functions (`functions/index.js`). They're already in their own folder and have their own lifecycle.
- It does not unify the existing `public/modules/{purchasing,engineering}/` modules with the bundle. They are precedent, not target. They keep their iframe deployment.
- It does not introduce TypeScript. That's a separate decision; doing it during this refactor doubles the risk and the effort.

---

End of plan. No code touched. No commits made. Awaiting review.

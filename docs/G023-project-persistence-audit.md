# G023 — Project-Operation Persistence & Loud-Failure Audit

> Coach lane (read-only), via Freddy · 2026-08-04 · prod v1.24.86 · `src/app.jsx`
> Principle (Jon): "ANY operation in a Project should persist even if the User leaves the Project" — AND must not fail silently. Generalization of B085.

**Gold-standard patterns graded against:**
- **Survives-leave** = `bgStart` (:904) → `_hasRunningBgTaskForProject` (:872) → arms `beforeunload` guard (:54564) + lease keep-alive (:884, armed :42448) + identity-guarded completion writes keyed by `_bgKey(projectId,panelId)` (:845).
- **Fails-loudly** = `bgError` (:931, no auto-dismiss) + `window.logDebugEntry({severity:"error"})` (durable to `companies/{cid}/debugLogs`) + unmount-safe `arcAlert`.
- PASS baselines: `relinkToBC` (:43011/43031), `runExtractionTask` (B078 surfacing :11244).

## ★ RANKED — worst first (candidate follow-up tickets)

| # | Operation | Money? | Drops on leave? | Silent fail? | Ticket |
|---|-----------|--------|-----------------|--------------|--------|
| 1 | **`runApiPricingOnPanel`** (F075 "Get Prices" Mouser+DigiKey) — :31987 | ✅ pricing | ✅ no bg-task; multi-sec remote calls | ⚠ 6s toast + console.error only (:32095) | **B088 (NEW)** |
| 2 | **`buildAndAttachPdf`** (BC drawing attach) — :28808 | ✅ BC doc | ✅ no bg-task | ⚠ 6s toast + console.error, no logDebugEntry (:28996) | **B089 (NEW)** |
| 3 | **`archiveProject`** — :11594 | integrity | ⚠ interrupt → invisible orphan `_archiveComplete:false` | ⚠ ECO/snapshot fetch fails swallowed console.warn (:11605/:11612) → archive silently loses subcollections | **B090 (NEW)** |
| 4 | **Sell-price BC PATCH** `_flushSellPriceBc` — :29069 | ✅ BC sell price | ✅ FIXED (B082 unmount/vis/beforeunload flush :29107) | ⚠ PATCH fail → console.warn (:29082) | **B082 residual** |
| 5 | **`_flushLeadTimeBcQueue`** — :30427 | ✅ BC lead times | ⚠ no unmount flush (unlike B082) | ⚠ debounce/vis paths → console.warn (:30476) | **B083 residual** |
| 6 | `doApplyPortalPrices` — :43764 | ✅ pricing | persist OK (awaited safeSave); not bg-task | mostly loud | lower — well-guarded |

**Top action:** #1 and #2 are the genuinely new gaps — user-initiated money/BC-doc writes running seconds against remote APIs with NO bg-task (no leave protection) and only a transient 6s toast (no bgError, no durable logDebugEntry). Closest analogues to the B085/B078 class not yet hardened.

## Classification summary
- **PASS (survives + loud):** addFiles/runExtractionTask/runExtraction/revision-drop/page-upload (extraction); runPricingOnPanel/runBackgroundPricing (pricing); syncPlanningLinesToBC + auto-sync (recovery-backed via bomSyncHash) + relinkToBC (BC sync); createEcoDoc (transactional); confirmDelete.
- **DROP-ON-LEAVE + PARTIAL:** runApiPricingOnPanel (B088), buildAndAttachPdf (B089).
- **PARTIAL (persist OK, silent-fail half):** B082 residual (sell-price PATCH console.warn), archiveProject (B090), copyProject (new-project, low risk), doApplyPortalPrices (strong persist, not bg-task), PanelCard mount effects (low-stakes learning-DB).
- **PARTIAL = B083:** `_flushLeadTimeBcQueue` (no unmount flush + silent console.warn).
- **Send actions (modal-watched, loud ✅, interrupt loses in-flight send — inherent):** QuoteSendModal.handleSend, Send-Quoted-BOM.
- **UNVERIFIED (flagged for a follow-up pass):** RFQ send / `rfq_history` write path — read helpers swallow to console.warn (:2781/2788); the send-WRITE path not traced this session.

## Net-new tickets stamped (Freddy)
- **B088** — `runApiPricingOnPanel` (F075 Get Prices): wrap in `bgStart(_bgKey(projectId,panel.id),…)` at :32014; convert catch → `bgError` + `logDebugEntry`. Mirror `runPricingOnPanel` :31336/:31826.
- **B089** — `buildAndAttachPdf` BC attach: register bg-task + `bgError`/`logDebugEntry` on failure. Mirror `relinkToBC` :43031 + addFiles logDebugEntry :28025.
- **B090** — `archiveProject`: surface ECO/snapshot fetch failures (don't swallow to console.warn → archive proceeds missing subcollections silently); consider bg-task so an interrupt isn't an invisible `_archiveComplete:false` orphan.
- **RFQ-send trace** — follow-up investigation pass (unverified this session).

## Known / already-tracked (NOT re-logged)
B082 (drop-half fixed; PATCH silent-fail residual), B083 (hard-close + silent console.warn residual), F085 (leave-sync PASS), B078 (loud baseline), B085 (survives baseline), B087 (board-stale, display domain — out of operation-persistence scope).

## Method (enumeration-is-a-floor)
Cross-checked 3 ways: (a) grep all bgStart/bgError/_bgKey sites (~200) = what IS registered; (b) grep named ops + completion writes; (c) grep `catch{console.warn|error}` swallow sites = loud-fail gaps. The gap set (#1-#4) = ops in (b)/(c) but not (a).

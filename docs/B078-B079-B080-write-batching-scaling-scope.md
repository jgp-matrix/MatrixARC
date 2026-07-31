# Scope — B078 (write-queue exhaustion) · B079 (panel-name dup) · B080 (Anthropic scaling)

Coach (Sam Wize) read-only scoping, 2026-07-31. Origin: PRJ402141 (Plum Island), Ryan — 18-page drawing add + extract → `resource-exhausted` → extraction results silently not persisted. Line numbers verified against current `src/app.jsx` / `functions/index.js` / `public/index.html`. **All scope-only — B078 is a save-path/data-safety change → Coach review + Test-channel verify + Jon deploy gate before any code lands.**

---

## B078 — Client write-queue exhaustion during multi-page add/extract ⚠ HIGHEST PRIORITY

### Root cause (a flood + a silent swallow)

**Part 1 — what floods the single client Firestore WriteStream.** The per-page loops are NOT the culprit (they're React-state only):
- `addFiles` render loop (`27912-27944`) + detect loop (`27979-27992`) → `setPendingPages` (useState, `27365`) — zero Firestore.
- `bgStart/bgUpdate/...` progress → in-memory `_bgTasks` (`904-940`) — zero Firestore.
- Page-image + PDF uploads → **Storage** (`uploadPageImage 12408`, `uploadOriginalPdf 12426`); an 18-page add = **1 PDF + 18 image uploads** via `parallelMap(...,4)` (`16310-16322`) → **saturates the browser uplink.**

The Firestore writes that pile up during that uplink spike (each a **full read-modify-write of the entire multi-panel project doc** via `saveProjectPanel 10962`, serialized by `_panelSaveLocks 10967`):
1. Pre-extraction pages save — `confirmAndExtract 28380`.
2. Early-upload storageUrl save — `runExtractionTask 16327`.
3. Final consolidated save — `17050`.
4. Post-extract pricing save(s) — `runPricingOnPanel` (from `28441`).
5. **The multiplier:** 7 PanelCard background `_noBumpWrite` auto-sync effects, each a fire-and-forget full-doc save, re-firing as panel/bom props churn during extraction — priceDate `27543`, vendor-name `27517`, BC PO-date `27566`, BC price poll `27650`, BC item-pulse `27712`, labor-row sync `27729`, mount alternates/corrections `27476`.
6. Presence heartbeat every 30s (`41578-41585`).

Large doc (multi-panel + 18 pages + 66-row BOMs, near 1 MB) + saturated uplink ⇒ WriteStream can't get acks ⇒ enqueued mutations exceed SDK cap ⇒ `resource-exhausted: Write stream exhausted`. (Debug-log path is already rate-limited — B016 Fix D, `index.html:311-357` — so it's NOT the amplifier here; the project-doc autosaves are.)

**Part 2 — why it vanished silently.** The extraction `save` wrapper (`16269-16271`) is `async p=>{ latestPanel=p; await saveProjectPanel(...).catch(e=>console.warn("bg save:",e)); }`. So when the final save (`17050`) hits `resource-exhausted`, it's downgraded to `console.warn`; `onDone` fires with the **in-memory** panel (`17066`), the bg bar shows "✓ N items" (`28449`), React shows the BOM — but **Firestore never received it.** Reload ⇒ 0 items, no `extractionReport`. Exactly Ryan's symptom. Error-path fallback save (`17062`) also swallows.
**Secondary silent-drop:** high-water guard `saveProject:10570-10573` logs `SAVE BLOCKED: would reduce panels…` and `return data` — success-shaped object, no write.

### Fix design (priority order)
- **B078-1 (must-fix · S · Low risk): stop swallowing + retry the extraction save.** Route final save (`17050`) + error-path save (`17062`) through a retrying `saveProjectPanelWithRetry` (mirror `safeSave 10862`, 2×2s). On terminal failure: `bgError` + `logDebugEntry({severity:"error"})` + trip `_saveFailBanner`. Converts silent data loss → visible, retried failure. **Highest value, lowest risk — ship first.**
- **B078-2 (core · M · Medium): coalesce the background autosave burst.** One per-project write coalescer/scheduler (trailing debounce + in-flight cap ~2-3, mirror the debug-log limiter `index.html:321-357`). The 7 `_noBumpWrite` effects enqueue into it instead of each calling `saveProjectPanel`. User-initiated saves bypass the debounce. **Enumerate every `_noBumpWrite` site independently — a missed one keeps flooding.**
- **B078-3 (defensive · S · Low): decouple extraction save from the upload spike** (lower upload concurrency to 2-3 while a critical save pends) + make the `10570` high-water block log-at-error and signal the caller instead of returning success-shaped.

### Data-safety
Preserve the save-consolidation invariant (v1.19.644 — no per-stage intra-extraction saves); keep `_panelSaveLocks` + all merge guards (storageUrl/reviewNotes/reviewShapes `11024-11054`, pages-wipe guard `10994-11012`, bomVersion bump `11061`); coalescer must **flush on visibilitychange/beforeunload**; never debounce a user-content save.

### Verify
Test channel, 18-page add to a fresh panel on a multi-panel project; console + `debugLogs` show zero `resource-exhausted`; reload → BOM + `extractionReport` persisted. Regression: single-page add, re-extract, revise staging, deliberate offline-blip mid-extract (should surface banner + retry, not vanish).

---

## Scaling audit — safe at 10 concurrent extractions?

- **Cloud Function concurrency:** `extractBomBatch` maxInstances **5** × internal CONCURRENCY **4** = 20 concurrent Opus calls (`3822-3823, 3873`); `extractBomPage` maxInstances **10** (`3527-3528`). Queues/throttles, doesn't fail — **NOT the ceiling.**
- **🔴 Anthropic rate limits = the real ceiling.** **No 429 / Retry-After / backoff handling anywhere** — `extractBomPage` throws `internal` on non-200 (`3748-3752`); `extractBomBatch` marks page failed, no retry (`3969-3974`). **All users share ONE `ANTHROPIC_API_KEY`.** Opus at `max_tokens 64000` + adaptive thinking + native PDF (`3731-3738`) = very high TPM/call; ~20 concurrent breaches org TPM/RPM → cascading 429s → silently failed pages across ALL users. (Scrapers already respect rate limits — `2.5s Mouser delay 3220` — that discipline was never applied to the Anthropic extraction path.)
- **Firestore per-doc:** not a multi-user concern (separate docs). Whole-doc rewrites push toward 1 MB limit — slow-burn, track separately.

**Verdict:** After B078, single user is solid. **NOT yet safe at 10 concurrent large-PDF extractions** — binding constraint is the shared Anthropic key with zero 429 handling → **B080**.

### B080 — Anthropic scaling-hardening (Cloud Function; independent of B078; M effort)
1. 429/`overloaded` **retry with exponential backoff + jitter** in `extractBomPage` + `extractBomBatch`.
2. **Concurrency cap / small queue** on Anthropic calls keyed to org Opus TPM (don't let 5×4 fire at once).
3. Consider **per-user API keys** or a tier bump so one pool isn't shared. **(Jon decision.)**

---

## B079 — addPanel duplicate-name bug

**Root cause:** `addPanel 38697-38699` → `n = (panels||[]).length+1`; reused after deletes → three "Panel 4"s. **id** is unique (`panel-'+Date.now()`), only the human **name** collides.

**Rename is SAFE for BC** — task binding is **positional** (task# from array index `n=i+1` → `20000+n*100`, `bcCreatePanelTaskBlock 3657-3663`); description uses `name` last + cosmetic (`3663`).
*Latent risk to flag (not fix here):* positional task numbers mean an add-after-middle-delete can point a new panel's block at an existing panel's `20N00` series, silently skipped by the "already present" guard (`3696`) → BC cross-panel binding risk. Follow-up.

**Fix:** persisted monotonic `project.panelSeq`, incremented per add, `name = \`Panel ${++seq}\``, persisted in the same `persistProject 38701`. Seed from `Math.max(existing "Panel N")` on first use. **Do NOT** rename by live position (renames survivors on delete). No migration; existing names untouched. **S · Low.**

---

## Must-fix / decisions for Jon
1. **B078-1** (unswallow + retry the extraction save) — highest-value, lowest-risk; stops silent BOM loss immediately. Ship first, ahead of the fuller coalescer.
2. **B080** (Anthropic 429/backoff + concurrency cap) — the true 10-user ceiling. **Decision:** now vs. after B078; per-user keys on the table?
3. **B078-2 coalescer** — apply "enumeration is a floor": re-grep every `_noBumpWrite` independently.

All money-path/save-path adjacent → Coach review + Test + Jon deploy gate. No code changed.

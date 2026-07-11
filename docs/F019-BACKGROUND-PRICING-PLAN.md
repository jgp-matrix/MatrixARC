# F019 — Standalone "Get New Pricing" dies on nav-away — build-ready plan

> **Author:** Freddy (synthesizing away-mode scoping lane) · **Date:** 2026-07-11 · **Mode:** read-only scoping. All citations `src/app.jsx`.
> **Status:** SCOPING COMPLETE. Recommended = **Option A** (~1–2 hrs). 4 decisions for Jon at the tail. NOT B021-related (B021 = hung-request timeout; F019 = task-lifecycle gap).

## Root cause (confirmed) — one root, two symptoms
Standalone "Get New Pricing" (`↻` button `:28802` → `runPricingOnPanel` `:27324`) is a **component method** on `PanelCard` and is **never registered in `_bgTasks`**. Extraction, by contrast, runs in **module scope** and registers a bg task. Consequence chain on nav-away:
1. Click → `runPricingOnPanel` starts long BC/Codale/scraper/AI awaits. No `_bgTasks` entry.
2. Navigate to dashboard → ProjectView unmounts → cleanup (`:37529`) calls `_releaseEditingLease(init.id)`.
3. `_releaseEditingLease` guard `if(_hasRunningBgTaskForProject(projectId))return` (`:38120`) is **false** (no registered task) → **the editing lease IS released**; `_startLeaseKeepAlive` (`:37534`) also NOT started (same gate).
4. The in-flight promise keeps running, reaches `await onSaveImmediate(updated)` → `saveProjectPanel` — but this tab **no longer holds the B012 editing lease** → write **rejected (`permission-denied`)**, and the rejection is **swallowed by `try{}catch(e){}`** at `:27876`. → **writeback doesn't land + silent.** (Matches Jon's prod re-confirm.)
5. Dashboard tile shows nothing — the tile (ProjectCard `:45131-45224`) renders progress only from `_bgTasks`/`activeExtractions`, neither populated. → **no tile bar.**

Both symptoms = the single gap: **standalone pricing is not a registered background task.**

**Note on `runPricingBackground` (`:15216`):** the resilient module-scoped pricing pass, but only invoked POST-extraction (`:25141/26008/26206`), assumes extraction already `bgStart`ed the key, and is a REDUCED pass (no Codale/custom-scrapers/report-modal/snapshot/PO-date/forceFresh). The standalone button intentionally uses the FULL `runPricingOnPanel`. So it's a sibling, not a drop-in.

## The model to copy (extraction's bg-task system)
`_bgTasks` registry (`:480`, module object — survives unmount) · `_bgKey(projectId,panelId)` (`:498`, composite key — bare panelId collides across projects) · `bgStart`/`bgSetPct`/`bgDone`/`bgError` (`:552-601`) · `useBgTasks`/`_bgNotify` (`:216/551`) push to React for tile re-render · heavy work in module-scoped fns that save via `saveProjectPanel(uid,projectId,panelId,updated)` (`:15400`, "no React state"). **Load-bearing:** `_hasRunningBgTaskForProject` (`:520`) makes `_releaseEditingLease` (`:38117`) suppress release AND `_startLeaseKeepAlive` (`:532`) renew the lease every 30s while a task runs — so a completing writeback still lands under the holder's identity.

## ✅ PLAN — Option A (RECOMMENDED): wrap the existing engine as a bg task (~1–2 hrs)
Don't rewrite pricing into module scope — just give `runPricingOnPanel` a `_bgTasks` registration for its lifetime. That single change flips on all the proven resilience machinery (lease keep-alive stops the writeback rejection; tile lights up). All changes inside `runPricingOnPanel` (`:27324`) + the button:

- **A1 — Register at start** (after the guard `:27327` + snapshot `:27330`): `const _bgId=_bgKey(projectId,panel.id); bgStart(_bgId, panel.name||("Panel "+(idx+1)), projectId, "Getting prices…");` (`projectId`/`panel`/`idx` all in scope). Makes `_hasRunningBgTaskForProject` true → unmount now suppresses lease release + starts keep-alive.
- **A2 — Double-start / extraction-collision guard:** `if(_bgTasks[_bgId]&&_bgTasks[_bgId].status==="running")return;` (or use a `+'_pricing'` suffix key — see Decision 2).
- **A3 — Thread progress to the tile:** change `_pp` (`:27332`) to `const _pp=(o)=>{setPricingProgress(o); if(onEpProgress)onEpProgress(o.pct); bgSetPct(_bgId,o.pct,o.msg);};` — one line drives ~40 existing `_pp` call sites → live tile bar.
- **A4 — Lifecycle-independent completion save** (replace `:27876`): `onUpdate(updated);` (live UI, harmless if unmounted) then `try{ await saveProjectPanel(uid,projectId,panel.id,updated); }catch(e){ console.error("[F019] save failed:",e); bgError(_bgId,"Save failed"); }` — writes to the ORIGINATING project via captured ids (Async Project Ownership Rule / #86; never reads "current open project"). Preserve the `!hasOverrides` 5th-arg behavior (`:34427`) — see Decision 4.
- **A5 — Guaranteed terminal state (CRITICAL new risk):** wrap the body in `try/catch/finally` so `bgDone`/`bgError` ALWAYS fires, incl. early returns (`:27327` pre-start, `:27794` AI-error). Success → `bgDone(_bgId,\`✓ ${totalPriced} priced\`)`. **A leaked "running" task pins the editing lease forever via `_startLeaseKeepAlive` → locks out all teammates.** The `finally` must be exhaustive.
- **A6 — Button running-guard:** `disabled` while `aiPricing` (currently only relabels "Refreshing…" `:28805`) so a 2nd concurrent run can't stomp the key.

**Reuse (untouched):** all pricing logic (BC/Codale/scraper/AI/lead-time/vendor/verify), report modal, fuzzy-suggestion state, `_startLeaseKeepAlive`, `_releaseEditingLease` suppression, tile rendering, `saveProjectPanel`. **Refactor (small):** `_pp` (1 line), completion save, add bgStart/terminal bgDone/bgError + try/finally, button disabled.

**Risks:** (1) leaked running task → permanent lease pin (mitigated by A5 — must be airtight). (2) key collision with extraction (mitigated by A2). (3) `panelBase` (`:27872`) slightly stale if user edits rows after starting then navigates — pre-existing, not worsened. (4) post-nav BC sync (planning lines / task descs / Codale-scraper price pushes) now completes headless — desirable; confirm captured `bcProjectNumber`/env checks hold.

## Option B (NOT recommended) — extract a module-scoped pricing engine
Literally mirror extraction (`runStandalonePricingBackground` in module scope). Downsides: the rich UX (report modal, fuzzy suggestions, toast) is component-scoped → lost or needs re-plumbing via module setters; large code move; higher regression surface. ~1–2 days vs A's ~1–2 hrs, worse UX. For completeness only.

## Interim guard (cheap same-day stopgap, ~30–45 min)
Prevent silent loss without the refactor: **warn before nav-away/unload while standalone pricing runs.** Module flag `_standalonePricingActive` keyed by `_bgKey`, set on start / cleared on terminal. Intercept the in-app "back to dashboard" with `arcConfirm("Pricing is still running — leaving will cancel it and prices won't save. Leave anyway?")`; add a `beforeunload` guard (mirror the version-banner guard `:47687-47704`). **Limits:** does NOT fix the tile bar, does NOT make pricing survive if the user confirms "leave", does NOT survive reload. Converts a silent loss into a warned choice. Ship first as a safety net if Option A must run the full H-item pipeline before deploy.

## Data-safety / rollout / effort
- **Landmines:** Async Project Ownership Rule / #86 (write via captured ids only — A4) · always `_bgKey(projectId,panel.id)` not bare panelId · **leaked "running" task ⇒ permanent lease pin** (biggest new risk — audit every `return`) · money/data path (writes prices to BOM + pushes to BC) = HIGH stakes.
- **Rollout:** test channel first (matrix-arc-test shares PROD Firestore → use a disposable project, confirm throwaway; host not navigable by Claude-in-Chrome → **Jon-driven verify**). Scenario: start pricing → go to dashboard → confirm (a) tile shows live bar, (b) prices persist across reload, (c) lease releases after `bgDone` (no stuck lock), (d) BC sync completed headless. Regressions: in-place pricing, "Refresh All"/forceFresh, report modal + fuzzy suggestions (when user stays), extraction's own post-pricing unaffected, no double-fire on button spam. H-item discipline applies.
- **Effort:** Option A ~1–2 hrs · interim guard ~30–45 min (independent, shippable first) · Option B ~1–2 days (not recommended).

## ⭐ DECISIONS FOR JON
1. **Approve Option A** (wrap existing engine) over Option B (module rewrite)? *(Rec: A.)*
2. **`_bgKey` policy:** plain extraction key `_bgKey(projectId,panel.id)` + the A2 running-guard, vs a `+'_pricing'` suffix (never clobbers an extraction task's slot)? *(Rec: plain key + A2 guard.)*
3. **Ship the interim guard now** as a same-day safety net while Option A runs the full pipeline? *(Rec: yes — cheap, stops silent loss immediately.)*
4. **Completion save:** direct `saveProjectPanel` (A4, lifecycle-independent, matches extraction) vs keep `onSaveImmediate` (works once the lease survives, but re-couples to component)? Preserve the `!hasOverrides` 5th-arg (`:34427`) for pre-review projects. *(Rec: direct save.)*

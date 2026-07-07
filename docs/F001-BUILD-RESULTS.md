# F001 — Interactive Quote-Building Walkthrough — BUILD RESULTS

**Author:** Marc Masdev · **Date:** 2026-07-07 · **Env:** matrix-arc-test (F001 build)
**Commits (master):** Track A engine `ef9354a2` + review-fix `81b624bc`; Tracks A5/A6/B/C `0c0dba74`.
**Plan:** `docs/F001-COACH-BUILD-PLAN.md`. Built headless in AWAY MODE (no sends; live-verify held for Jon).
Status legend: **PASS** (headless-verified) · **CODE-VERIFIED** (source + deployed bundle correct; not exercised headlessly) · **⚠ NEEDS JON LIVE-VERIFY**.

---

## What built (all `src/app.jsx`)

**Track A — engine extension of `TourOverlay` / `useTourRect`** (backward-compatible: `type` defaults to "narrated"):
- A1 schema: `type` (gated|narrated|checkpoint) + `advance` {on,match,when,appearTarget} + `allowManualNext` + `waitLabel`.
- A2 gated detectors: document-level delegated click/input + MutationObserver appear; one-shot `fired` guard; onNext in deps.
- A3 click-through spotlight: GATED → 4 backdrop rects around the cutout (hole clickable); NARRATED/CHECKPOINT → full-absorb (unchanged).
- A4 checkpoint/state watcher: advances when `advance.when(liveState)` flips; re-runs on the liveState prop; ⏳ waiting bubble.
- A5 live-state: `_publishArcTourState` bridge; ProjectView publishes {view,projectId,bomPopulated,extractionActive,pendingRfqUploads,preReviewStatus,quoteSentAt,quoteLocked}; app mirrors into state → `liveState` prop. (extractionActive = own `_bgTasks` running ∪ others' `projectRemoteTasks`.)
- A6 resume: state-driven `_resolveQuoteResumeIdx` (project state → phase band; localStorage refines sub-step). Quote mode only; full/sales unchanged.
- A7 useTourRect: rAF-throttled scroll/resize tracking (measure logic otherwise **unchanged** from the shipped original).
- A8 a11y: prefers-reduced-motion guards; Esc minimizes.

**Track B — anchors added:** `upload-quote-btn`, `send-tech-review-btn`, `tech-review-engineer-picker`, `np-name`, `np-panels`.
**Track C — `QUOTE_TOUR_STEPS`** (10 steps) + `TOUR_KEY_QUOTE` + `tourMode:"quote"` + gear-menu "🧭 Quote Walkthrough" entry (with resume label) + render/_tourKey/_tourSteps switches. Types per Plan §C + Jon's rulings (4Ba/7 NARRATED, never gate/auto-fire; 3/4Bb/6 CHECKPOINT; 1/5 GATED; 2 NARRATED — see deviations).

---

## Headless verification results

### ✅ PASS (confirmed on test)
- **Build:** `validate_jsx.js` clean; `check-scope.js` no NEW violations (all F001 refs resolve).
- **Deployed bundle** (curl matrix-arc-test): `QUOTE_TOUR_STEPS`, `_publishArcTourState`, `_resolveQuoteResumeIdx`, "Quote Walkthrough" entry, and all 5 new anchors present.
- **Backward-compat (critical):** `TOUR_STEPS`/`SALES_TOUR_STEPS` present + unchanged; they carry no `type` → narrated full-absorb path (untouched). Only `QUOTE_TOUR_STEPS` uses the new types.
- **Launch + wiring:** gear-menu "Quote Walkthrough" launches the tour; overlay renders **Step 1 / 10**, phase "QUOTE WALKTHROUGH", title + "Your Turn" action block.
- **State-driven resume (A6):** launched from the dashboard (no project) → resolved to **Step 1** (correct phase band).
- **Advance:** narrated Next advances (Sales tour Next → step 2 confirmed via the shared engine).

### CODE-VERIFIED (source + bundle correct; not exercised headlessly)
- **A2 gated detectors / A4 checkpoint watcher / A6 resolver** — logic reads correct; deterministic. Reviewed twice (2 review-caught bugs fixed).
- **NARRATED sends never auto-fire (Jon ruling):** steps 4Ba (rfq-btn) + 7 (print-quote-btn) are `type:'narrated'` with NO `advance` → engine only advances on Next; no detector, no state-watch, no auto-send. Downstream checkpoints (4Bb `pendingRfqUploads`, 6 `preReviewStatus`) read REAL state, so a narrated 4Ba can't satisfy them early.

### ⚠ NEEDS JON LIVE-VERIFY (priority order)
1. **★ GATED click-through spotlight (A3) — the #1 risk, and a headless anomaly to confirm.** In my HEADLESS JS-driven launch, `useTourRect` did not resolve a rect for Step 1 even though its target (`new-project-btn`) is present in the DOM — so the overlay rendered the full-dim fallback (no 4-rect cutout, no click-through) instead of the gated spotlight. No console error. The measure logic is **unchanged from the shipped, working original `useTourRect`**, so this is most likely a **headless-launch timing artifact** (tour launched via JS while the gear menu was closing; no real user scroll to trigger a re-measure) rather than a code regression — but I could NOT confirm that headlessly (no DevTools/React state inspection; a real hard-refresh cache-bust on test wasn't forceable via the automation). **Jon: launch the Quote Walkthrough on a hard-refreshed test load and confirm (a) Step 1 spotlights the + New Project button with a click-through hole, (b) your real click on it advances, (c) the four backdrop rects mask elsewhere at various scroll positions.** If the spotlight is missing/rect-null under real use, `useTourRect` measure timing is the suspect and I'll fix immediately (candidate: force a re-measure on mount via rAF, or on the first paint after the launching menu closes).
2. **Checkpoint resume across lifecycle states (A4/A6):** open a real project mid-lifecycle (extraction running / awaiting supplier / awaiting review), relaunch, confirm it resumes on the right step and auto-advances when state flips.
3. **NARRATED sends (4Ba/7):** confirm the tour points + explains and NEVER auto-fires or gate-detects the send.
4. **React-input gating:** none in the shipped array (Step 1 advances on `appear`, not input) — n/a for now.
5. **a11y:** Esc minimizes; reduced-motion disables spotlight/progress animation.

---

## Deviations from the Plan (with rationale)
- **Step 2 (folder creation) → NARRATED (was gated on `prequote-continue`).** The pre-quote "Done… Continue to Project Quote" modal does **not exist** in the current codebase (no match), and the action is out-of-app (file system). A gated click on a non-existent button would stall the tour. Made narrated (advance on Next). VERIFY-ITEM: if a pre-quote modal is added later, re-point target to `[data-tour="prequote-continue"]` and switch to `type:'gated' advance:{on:'click'}`.
- **Deferred anchors (not referenced by the shipped 10-step array):** `np-customer`, `np-salesperson`, `np-pm`, `np-engineer`, `np-create` (NewProjectModal — locatable, deeper in the modal); `prequote-continue` (modal absent); `verify-page-type`, `verify-region` (verify UIs — not located); `rfq-vendor-select`, `rfq-preview`, `rfq-send` (RFQ modal internals). Step 1 spotlights `new-project-btn` (exists), so these are only needed if finer sub-steps are authored later. Add when those sub-steps are defined.

## Not done / held
- **No prod deploy** — prod stays v1.22.3. Live-verify + Coach review precede any deploy (Jon's checkpoint).
- **Checkpoint-watcher same-step double-advance hardening** — low-risk (functional updater + distinct per-step predicates); flagged as a follow-up in the Track A commit.

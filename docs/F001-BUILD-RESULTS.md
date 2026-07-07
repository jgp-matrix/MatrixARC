# F001 — Interactive Quote-Building Walkthrough — BUILD RESULTS

**Author:** Marc Masdev · **Date:** 2026-07-07 · **Env:** matrix-arc-test (F001 build)
**Commits (master):** Track A engine `ef9354a2` + review-fix `81b624bc`; Tracks A5/A6/B/C `0c0dba74`; A3 spotlight fix `b834660d` + `9f52b642`.
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

### ★ A3 GATED spotlight anomaly — ROOT-CAUSED + FIXED (was a real bug, not an artifact)
Headless debugging (instrumented deploys + console logs) proved: `useTourRect` measured a valid rect and called `setRect`, but the ordinary `useEffect` measure was **not propagating to the overlay render** — the spotlight stayed on the full-dim fallback (no click-through hole). **FIX (commits `b834660d` + `9f52b642`):** measure in `React.useLayoutEffect` (commits pre-paint on the mount frame) + rAF-retry the first ~12 frames for late layout; reset rect to null on target change. **Verified on test:** launching the Quote Walkthrough now renders the gated spotlight on Step 1 — `root pointerEvents:none`, **4 backdrop rects**, blue ring — and `document.elementFromPoint` at the + New Project button returns the **BUTTON** (click reaches it through the hole) once the launching gear-menu backdrop is gone (as it is in normal use). A7 scroll/resize tracking retained.

### ⚠ NEEDS JON LIVE-VERIFY (priority order) — real clicks
1. **A3 gated click-through (real flow):** click the gear → "🧭 Quote Walkthrough" → confirm Step 1 spotlights the + New Project button with a click-through hole, your real click opens the modal / advances, and the four rects mask elsewhere at a couple of scroll positions. (Headless-fixed + confirmed; this is the real-mouse confirmation.)
2. **Checkpoint resume across lifecycle states (A4/A6):** open a real project mid-lifecycle (extraction running / awaiting supplier / awaiting review), relaunch, confirm it resumes on the right step and auto-advances when state flips.
3. **NARRATED sends (4Ba/7):** confirm the tour points + explains and NEVER auto-fires or gate-detects the send.
4. **a11y:** Esc minimizes; reduced-motion disables spotlight/progress animation.

---

## Deviations from the Plan (with rationale)
- **Step 2 (folder creation) → NARRATED (was gated on `prequote-continue`).** The pre-quote "Done… Continue to Project Quote" modal does **not exist** in the current codebase (no match), and the action is out-of-app (file system). A gated click on a non-existent button would stall the tour. Made narrated (advance on Next). VERIFY-ITEM: if a pre-quote modal is added later, re-point target to `[data-tour="prequote-continue"]` and switch to `type:'gated' advance:{on:'click'}`.
- **Deferred anchors (not referenced by the shipped 10-step array):** `np-customer`, `np-salesperson`, `np-pm`, `np-engineer`, `np-create` (NewProjectModal — locatable, deeper in the modal); `prequote-continue` (modal absent); `verify-page-type`, `verify-region` (verify UIs — not located); `rfq-vendor-select`, `rfq-preview`, `rfq-send` (RFQ modal internals). Step 1 spotlights `new-project-btn` (exists), so these are only needed if finer sub-steps are authored later. Add when those sub-steps are defined.

## Live-verify progress (Jon co-drive, 2026-07-07)
Verify #1 (A3 gated flow) — **PASS live**, after 4 verify-fixes caught + fixed during the pass:
1. **A3 spotlight rect** — `useLayoutEffect` + rAF-retry (`b834660d`/`9f52b642`): the spotlight now renders (rect propagates on the mount frame); real click reaches + New Project through the hole.
2. **Step 1b modal spotlight** (`0862d00d`): split Step 1 (btn) → Step 1b (whole New-Project modal via `np-modal`) so the open modal isn't masked by the button-cutout.
3. **Cutout follows target growth** — `ResizeObserver` (`18d64f6c`): the modal grows when a customer is picked; the cutout now tracks it (confirmed: +140px growth → cutout followed).
4. **Bubble on-screen clamp** (`7cd91f3a`): below a tall target the Next button was clipped off the viewport bottom; bubble now clamped fully on-screen (confirmed at Step 3: bubble bottom 1219 ≤ vh 1261, Next visible).

Confirmed live: the walkthrough drove project creation end-to-end (Steps 1→1b→2→3), auto-advancing through to the Step-3 extraction checkpoint (real project PRJ402134 created on test).
STILL PENDING (Jon): drop drawings → real extraction checkpoint auto-advance; #2 checkpoint resume across lifecycle; #3 narrated sends (4Ba/7) never auto-fire; #4 a11y (Esc/reduced-motion).

## Not done / held
- **No prod deploy** — prod stays v1.22.3. Live-verify + Coach review precede any deploy (Jon's checkpoint).
- **Checkpoint-watcher same-step double-advance hardening** — low-risk (functional updater + distinct per-step predicates); flagged as a follow-up in the Track A commit.

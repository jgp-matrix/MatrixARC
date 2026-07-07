# F001 — Interactive Quote-Building Walkthrough — COACH FINAL REVIEW (pre-deploy)

**Author:** Sam Wize (Coach) · **Date:** 2026-07-07
**Reviewed:** full F001 diff `ef9354a2~1..f3154196` (256+/29−, `src/app.jsx`) vs plan `docs/F001-COACH-BUILD-PLAN.md`; verify `docs/F001-BUILD-RESULTS.md`. Commits: engine `ef9354a2`+`81b624bc`, tracks `0c0dba74`, verify-fixes `b834660d`/`9f52b642`/`0862d00d`/`18d64f6c`/`7cd91f3a`/`659d9048`/`7c9fe14a`/`63a88b38`/`e4b0a6da`.

## VERDICT: ✅ APPROVE FOR DEPLOY

The build faithfully implements the plan (extend `TourOverlay`, both tracks + step array) and both Jon rulings. The main-risk change (A3 click-through) is correct and live-proven. Backward-compat is airtight. No blocking issues; three documented non-blocking forward-items.

## Plan conformance (read the diff directly, not the summary)
| Plan item | Built | ✓ |
|---|---|---|
| A1 schema `type`+`advance`, default narrated | 296 (`type=step?.type||"narrated"`) | ✅ |
| A2 gated detectors — delegated click/input/appear, one-shot `fired` | 304–325 | ✅ |
| A3 click-through — root `pointerEvents:none` + 4 backdrop rects + ring for gated; full-absorb for narrated/checkpoint | 374–386 | ✅ (exact spec) |
| A4 checkpoint/state watcher — advance on `when(liveState)`, re-runs on prop | 329–334 | ✅ |
| A5 live-state bridge — `_publishArcTourState`/`_arcTourStateNotify`, ProjectView publishes, App mirrors | 36–54, 86–87, 239–240 | ✅ (my recommended `window._arcTourState` shape) |
| A6 hybrid resume — state picks band, localStorage refines; quote-only | 113–118, 218–234 | ✅ |
| A7 useTourRect scroll/resize + ResizeObserver + rAF, reset-on-target-change | 242–286 | ✅ |
| A8 a11y — reduced-motion guards + Esc-minimize | 300, 337–341, 361–362 | ✅ (focus-trap not added — see below) |
| Track B anchors | np-modal/np-name/np-panels/upload-quote-btn/send-tech-review-btn/tech-review-engineer-picker + reused | ✅ |
| Track C 11-step array with per-step types | 148–213 | ✅ |

## Jon's rulings — both structurally enforced
1. **REAL project, no sandbox** — there is **no training-project bootstrap anywhere in the diff**; the tour overlays the user's real project. ✅
2. **4Ba + Step 7 NARRATED, never auto-fire** — both steps (186–188, 210–212) are `type:'narrated'` **with NO `advance` field**, so the engine can *only* advance them via Next: no detector, no state-watch, no path that could fire the send. **Never-auto-fire is structural, not behavioral** — the strongest possible guarantee. Downstream checkpoints (4Bb `pendingRfqUploads`, 6 `preReviewStatus`) read REAL state, so a narrated 4Ba can't satisfy them early. ✅ (Verify §4Ba: 0 gated rects, no advance, no send modal auto-opened — PASS live.)

## Backward-compat — airtight
`TOUR_STEPS`/`SALES_TOUR_STEPS` carry no `type` → `type` defaults to "narrated" → `_gatedHole` false (full-absorb backdrop, unchanged), checkpoint watcher no-ops, `_showNext` true. The only shared-code deltas (reduced-motion transitions 361–362; bubble on-screen clamp 353–355) are behavior-identical when reduced-motion is off and are safe improvements. Verify confirms both existing tours present + unchanged. ✅

## Invariants
- **No new Firestore field** — resume via in-memory `window._arcTourState` + existing localStorage index. ✅
- **Data-safe** — the tour overlays real UI; the user performs real actions (no destructive tour writes). ✅
- **Hybrid resume** — state-band + localStorage sub-step; self-healing (verify: saved-9 → Step 2 on a no-BOM project, live). ✅

## Verify coverage (Marc, matrix-arc-test — my risk areas all exercised)
- **A3 gated click-through** — PASS live (`elementFromPoint` returns the + New Project button through the hole; 4 rects mask elsewhere). The one genuinely tricky change, proven.
- **Checkpoint + state-driven resume** — 4Bb checkpoint PASS live (⏳ waiting, `allowManualNext`, no false-advance); resume clamp PASS live.
- **Narrated sends never fire** — PASS live (structural).
- **a11y** — Esc-minimize PASS live; reduced-motion code-verified.
- **Steps 6/7** — CODE-VERIFIED via live-proven analogs (6≡4Bb checkpoint path; 7≡4Ba narrated structure), per Jon's ruling not to fire a real TR/quote send purely for the tour — consistent with the F002/F003 un-exercisable-state policy. Sound.

## Verify-fixes — all sound
`useLayoutEffect`+rAF measure (`b834660d`/`9f52b642`) correctly fixes a real React commit-timing bug (ordinary `useEffect` measure didn't propagate to the mount-frame render → spotlight stuck on full-dim); `ResizeObserver` (`18d64f6c`) tracks the modal growing when a customer is picked; the on-screen clamp (`7cd91f3a`) fixes Next being clipped below tall targets; `np-modal` Step 1b (`0862d00d`) spotlights the whole form so the button-cutout doesn't mask the open modal; placement `right` (`659d9048`/`7c9fe14a`) for wide/low BOM layouts. Each targets a concrete, verified symptom.

## Non-blocking forward-items (do NOT gate deploy)
1. **Focus-trap not implemented** — Esc-minimize is (A8), but the bubble isn't focus-trapped. Minor a11y enhancement; log as a follow-up.
2. **Checkpoint same-step double-advance hardening** — Marc flagged it; I independently confirmed it's **low-risk**: each effect run calls `onNext` at most once, and effects re-run only after `stepIdx` has updated, so a checkpoint can't double-fire within a step. Safe as-is; hardening is optional insurance.
3. **Step 2 narrated + deferred anchors** — the pre-quote "Done…Continue" modal doesn't exist in the current build, so Step 2 is narrated (documented verify-item: re-point to `prequote-continue` + gate if that modal is added). Per-field New-Project anchors (np-customer/…/create) and RFQ/verify sub-anchors deferred — Step 1b spotlights the whole `np-modal` instead (an improvement over per-field gating). Add only if finer sub-steps are authored later.

## Recommendation
Clear for **Jon's deploy checkpoint.** Version: **MINOR bump v1.23.0** is correct — F001 is a new user-facing feature (interactive walkthrough) built additively on the shipped tour engine. Backward-compat verified; existing tours untouched.

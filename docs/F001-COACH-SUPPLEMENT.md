# F001 — Interactive Quote-Building Walkthrough — COACH ENGINE SUPPLEMENT

**Author:** Sam Wize (Coach) · **Date:** 2026-07-06
**For:** Freddy (Analyst Review) → Jon (approve) → build. **Feasibility + design — NOT a build plan.**
**Traced against tip:** `dc61b42c`. Refs: Brief `docs/F001-QUOTE-WALKTHROUGH-BRIEF.md`, steps `docs/F001-WALKTHROUGH-STEPS.md`.

---

## 0. HEADLINE — a tour engine ALREADY EXISTS. Extend it; don't build a new one.

**This revises Brief §3a ("custom engine, ~a few hundred lines, no existing primitive").** There IS one, shipped v1.19.667:
- **`TourOverlay` component** (app.jsx:47927) — dimmed backdrop + spotlight cutout (boxShadow ring on the target rect), anchored callout bubble (phase header, progress bar, "N / total" counter, title, body, a "👆 Your Turn" action block, Back/Next/Finish, End-tour, Hide/minimize), placement top/bottom/right/center.
- **`useTourRect(step.target)`** (rect resolver for `[data-tour="…"]`, recalculs on scroll/resize; missing target → graceful centered bubble + full dim).
- **Two step arrays** — `TOUR_STEPS` (full/engineering, 47797) + `SALES_TOUR_STEPS` (47762); step schema `{phase,title,body,target,placement,action,actionLabel}`.
- **Controls** — `tourStep` state (46384), `tourMode` full/sales (46386), `startTour` (46429), `tourNext/tourPrev/tourDone/tourSkip` (46440-46443).
- **Re-entrancy ALREADY works via localStorage** — `saveTourStep` (46428) persists the step index to `TOUR_KEY`/`TOUR_KEY_SALES`; the launcher shows **"Resume Full Training (n/N)"** (47499).
- **Launcher hook EXISTS** — the gear menu has `data-tour="training-btn"` "Full Training (Engineering)" + "Sales Walkthrough" entries (47499-47501). (This is the D2 "Help button.")
- **~14 `data-tour` anchors already placed** (see §3).

**What the existing engine does NOT do — this is the exact F001 delta:**
| Capability | Exists? | F001 needs |
|---|---|---|
| NARRATED (read → click Next) | ✅ yes (this is all it does) | reuse as-is |
| Visual "Your Turn" action hint | ✅ (`step.action`/`actionLabel`) | reuse |
| **GATED** (auto-advance when the user performs the real action) | ❌ — `action` is cosmetic; Next still advances on click; **backdrop `pointerEvents:'all'` absorbs clicks so the user can't even click the real target** (47968) | **ADD**: action-detection (click/input/appear/navigate) + **click-through to the spotlighted target** |
| **CHECKPOINT** (pause on async-external wait, resume when state flips) | ❌ | **ADD**: watch a project-state signal, show "continue when X arrives," resume |
| **STATE-DRIVEN resume** (read project state → jump to matching step) | ❌ (only localStorage step-index) | **ADD** (see §5) |

**Bottom line:** F001 = **extend `TourOverlay`** with three step-type behaviors + a state-driven resume, and **add anchors across the non-BOM flows.** Much smaller/safer than a from-scratch engine, and it inherits the shipped bubble/spotlight/placement/progress/persistence.

---

## 1. Q1 — the 3 step-types + re-entrancy are supported by extending the existing engine

- **NARRATED** — already native. F001 steps 4A/4B slot straight in (`{action:false}`, advance on Next). Zero engine change.
- **GATED** — add an `advance` field to the schema (Brief §3c/§3d vocab: `click`/`input`/`appear`/`navigate`) and an effect in `TourOverlay` that arms the matching detector for the current step and calls `onNext()` when it fires. **Critical companion change:** the spotlight must allow click-through to the real target — today the overlay root is `pointerEvents:'all'` (47968) and blocks it. Fix: make the backdrop pieces `pointerEvents:'all'` but leave a real hole over the target (either 4 backdrop rects around the cutout, or the SVG-mask approach in Brief §3e) so the user's click reaches the actual element. This is the single most important engine change and the main risk area (see §7).
- **CHECKPOINT** — a step with `advance:{on:"state", when:(project)=>…}`. The engine subscribes to the project (ARC already has live project/subscription plumbing — e.g. the `activeExtractions` subscription at 36786) and auto-advances when the predicate flips. Renders a "⏳ waiting — you'll continue when X arrives" bubble; fully re-entrant because the predicate is recomputed on every (re)launch (§5).
- **Re-entrancy** — see §5; supported via project-state + the existing localStorage index.

**No existing primitive is being discarded** — every new behavior is additive to `TourOverlay`.

---

## 2. Q2 — whole-flow `data-tour` anchor inventory (Brief F1)

Walking the 7 steps' WHERE fields. **~14 anchors exist; ~15–19 need adding**, mostly inside modals (New-Project, pre-quote, RFQ, verify-page-type).

| Step | Element (WHERE) | Anchor | Status |
|---|---|---|---|
| 1 | + New Project button | `new-project-btn` (43430) | ✅ exists |
| 1 | Project-name field | — | ➕ add |
| 1 | # of Panels field | — | ➕ add |
| 1 | Customer dropdown | — | ➕ add |
| 1 | Salesperson select | — | ➕ add |
| 1 | Project Manager select | — | ➕ add |
| 1 | Engineer select | — | ➕ add |
| 1 | Create Project button | — | ➕ add |
| 2 | Pre-Quote modal + "Done…Continue" button | — | ➕ add (~1–2) |
| 3 | Drawings drop zone | `add-files-zone` (28329) | ✅ exists |
| 3 | Verify-page-type UI | — | ➕ add |
| 3 | Region-out ("verify region") UI | — | ➕ add |
| 4A | Issues column / chips (BC + confidence) | `bom-status` (29145) | ✅ exists (column-level) |
| 4B | BOM row Lead / Priced cells | `bom-table` (28779) | ✅ exists (table-level; finer add optional) |
| 4Ba | Send/Print RFQs button | `rfq-btn` (36051) | ✅ exists |
| 4Ba | RFQ vendor-select | — | ➕ add |
| 4Ba | RFQ preview + Send button | — | ➕ add (~2) |
| 4Bb | Upload Quote button (`pendingRfqUploads` badge) | button at 36056 | ➕ add |
| 4Bb | Project tile "# RFQs" badge | — | ➕ add (optional) |
| 4Bb | TR checkbox | `bom-tr-user-checkbox` (29129) | ✅ exists (F003) |
| 5 | Send for Tech. Review button | — | ➕ add (~34523) |
| 5 | Engineer picker | — | ➕ add |
| 5 | "In Pre-Review — awaiting…" overlay | — | ➕ add (optional) |
| 6 | Engineer green sign-off circle | `bom-tr-engineer-circle` (29119) | ✅ exists (F003) |
| 7 | Send / Print Quote button | `print-quote-btn` (36108) | ✅ exists |
| 7 | Post-send lock overlay | — | ➕ add (optional) |

Also already present and reusable: `bom-tr`, `bom-search`, `project-list`, `config-btn`/`training-btn`, `team-btn`. **Existing ≈ 14; new required ≈ 15 (core) + ~4 optional.** The **engine change is small; the anchor-tagging is the bulk of the surface** — spread across many components/modals, exactly as Freddy's F1 predicted.

> **Remount/one-shot caveat (Brief §4.3):** several targets live in modals or React-keyed rows. Prefer `appear`/`navigate`/state detectors, or a **document-level delegated listener** (`e.target.closest('[data-tour="key"]')`) for `click` gating, so a remount doesn't drop a node-bound one-shot listener. `useTourRect` already re-resolves the rect each render, so spotlight positioning is remount-safe.

---

## 3. Q3 — hard-trigger feasibility (all three are doable; signals located)

| Trigger | Feasible? | Signal / mechanism |
|---|---|---|
| **Drag-drop (Step 3)** | ✅ | Don't detect the raw drop — detect the **result**: `appear` on pages/extraction starting, or `navigate` into the extraction state. Robust vs. the fragile HTML5 drop event. Anchor = `add-files-zone` (exists). |
| **Long-async extraction complete (Step 3)** | ✅ (CHECKPOINT) | ARC already subscribes to `companies/{cid}/activeExtractions` (36786); complete = the task doc clears **and** `panel.bom.length>0`. Engine watches → resumes. |
| **Supplier quote arrived (Step 4Bb)** | ✅ (CHECKPOINT) | `pendingRfqUploads` drives the "Upload Quote (N)" badge (36056); a submission also fires a notification (`onSupplierQuoteSubmitted`). Checkpoint predicate: `pendingRfqUploads>0`. |
| **Tech review returned (Step 6)** | ✅ (CHECKPOINT) | `project.preReviewStatus` `pending→approved` (F003); or all flagged rows `techReviewResolved`. Trivial to watch. |
| **Quote sent / locked (Step 7 end)** | ✅ | `project.quoteSentAt` / `quoteLocked` (16036, 33282). |

All four lifecycle waits map to **already-persisted project fields** + one existing live subscription. No new backend, no polling infra to invent — ARC re-renders on project updates, so a `when:(project)=>…` predicate re-evaluates naturally.

---

## 4. Q4 — re-entrancy: recommend STATE-DRIVEN (primary) + existing localStorage (sub-step), no new Firestore field

The lifecycle milestones map cleanly to project state, so **project state = progress** works:

| Project state | Resume at |
|---|---|
| on dashboard / no project | Step 1 |
| project created, no BOM, no extraction running | Step 2 → 3 |
| extraction running (`activeExtractions`) | Step 3 (checkpoint: waiting) |
| BOM populated, has red/issue rows, no RFQ sent | Steps 4A/4B |
| RFQ sent, `pendingRfqUploads===0`, awaiting supplier | Step 4Bb (checkpoint) |
| `pendingRfqUploads>0` | Step 4Bb (continue: upload) |
| `preReviewStatus==="pending"` | Steps 5/6 (checkpoint: awaiting engineer) |
| `preReviewStatus==="approved"` | Step 7 |
| `quoteSentAt` set / `quoteLocked` | done (locked) |

**Recommendation — HYBRID (no new persisted field in v1):**
1. **State-driven picks the PHASE/milestone** on (re)launch — device-independent, survives logout, always correct (reads Firestore project state). This is the F2-ruled primary.
2. **The existing localStorage step-index** (`saveTourStep`, already shipped) resolves the **exact narrated sub-step within a phase** — because project state alone can't tell "Step 4A (narrated)" from "Step 4Ba (gated)" (both are the same project state "BOM populated, not yet RFQ'd"). localStorage already does within-phase resume today; reuse it as the sub-step cursor, clamped to the state-derived phase.
3. **Do NOT add a `users/{uid}/config/trainingProgress` Firestore field in v1** — project state + localStorage cover it, and Brief §3g already says leave the hook, don't build it. A persisted per-project progress field would only be worth it if Jon later wants cross-device *sub-step* precision or completion analytics; note it as a future hook, not v1.

**Why not persisted-progress-only:** it double-tracks state that the project already encodes and can drift (e.g. a user advances the tour past "extraction," but the extraction was deleted — state-driven self-heals; a stored index would strand them). State-driven is self-correcting; that's its main win.

---

## 5. Brief §4 open questions

1. **Data-safety (real Firestore writes during hands-on) — endorse Freddy's (b).** Auto-create a clearly-labeled `TRAINING — <user> <date>` project at tour start (reuses the existing new-project path), trivially identifiable + deletable. Relates to **G005** (matrix-arc-test shares prod Firestore) — until G005 is resolved, training writes hit prod; the self-labeled project keeps them quarantined + sweepable. (a) real-project-then-delete risks orphans; (c) shared-demo-project collides across concurrent trainees. **(b) is safest.** *Jon rules.*
2. **View/navigation hook.** ProjectView tracks `view` state `"panels"|"quote"` (36938); dashboard↔project is the project-selection state. `navigate` triggers hook these. Reliable; no router to fight.
3. **Element inventory / remounts** — §2 table + the delegated-listener caveat.
4. **Scroll/virtualization** — **no virtualization library present** (no react-window/react-virtual/FixedSizeList); the BOM `flatMap`-renders all rows. Bounding-rect math is safe; `useTourRect` handles scroll/resize already.
5. **Reduced-motion / a11y** — the overlay uses CSS transitions (47970/47976); add a `prefers-reduced-motion` guard to disable the spotlight/progress animations, and ensure the bubble is focus-trappable + Esc-to-exit. Minor add.

---

## 6. Lift estimate + risk

| Work | ~LOC | Risk |
|---|---|---|
| **Engine extension** — `advance` schema field + GATED detectors (click/input/appear/navigate) + **click-through spotlight** rework + CHECKPOINT state-watch + state-driven-resume resolver | **~150–250** in `TourOverlay`/tour-control region | **MED** — the click-through backdrop rework (47968-47970) is the one genuinely tricky bit (must let the real target receive the click while still blocking off-script clicks); GATED remount-safety needs the delegated-listener pattern. |
| **Anchor tagging** — ~15 core `data-tour` adds across New-Project modal, pre-quote modal, verify-page-type/region, RFQ modal, Upload Quote, Send-for-Tech-Review + picker (+ ~4 optional) | **~15–19 one-line attrs** across many components | **LOW** (mechanical) but **wide** — touches ~6-7 components. |
| **Author the F001 step array** — Jon's 7 steps → schema with per-step type/advance/target | data only | **LOW** |
| **Training-project bootstrap** (Q1 option b) | ~20–40 | **LOW–MED** (real writes; G005 caveat) |

**Overall: MEDIUM.** The engine already exists, which removes the largest risk; the residual risk concentrates in (1) click-through gating and (2) the breadth of anchor tagging. **Recommend the build Plan split into two tracks** — engine-extension (one focused change, heavy verify on gated advance) and anchor-tagging (mechanical, parallelizable) — with the step array authored last against the tagged anchors.

## 7. Pipeline / HOLD
This Supplement → Freddy Analyst Review → Jon approve → **Coach build Plan** (exact engine diffs + full anchor list + step array) → Marc builds → live verify (gated advance + checkpoint resume are the risk areas) → Coach review → Jon deploy. **HOLDING — no build.**

**★ Single most important takeaway for the Plan:** extend `TourOverlay` (47927) — do not author a second engine. The Brief's §3a "custom engine" premise is superseded by the shipped one.

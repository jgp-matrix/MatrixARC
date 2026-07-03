# F001 — Interactive Quote-Building Walkthrough — BRIEF

**Author:** Freddy Lyst (Analyst)
**Date:** 2026-07-03
**Status:** Discovery → Decided-pending (awaiting Jon "go" to route to Coach for Supplement)
**Category:** F001 (first Feature under the B/F/G scheme; sole-allocator stamp)

---

## 1. Problem / goal
New users have no in-app guidance for building a quote from scratch. We want an **interactive training walkthrough** that highlights the exact area of the screen to act on and gives a concise instruction, step by step, through the full "build a quote from scratch" flow. It doubles as a demo aid and a refresher.

## 2. Locked decisions (Jon, 2026-07-03)
| # | Decision | Choice | Consequence |
|---|----------|--------|-------------|
| D1 | Interaction model | **Guided hands-on (gated)** | The user actually performs each step on the real UI; the engine **detects the action** and only then advances. Every step needs a **completion condition** ("advance trigger"). |
| D2 | Entry point / audience | **Help button, always available** | A persistent "?/Training" launcher, any user, fully replayable. No first-run/`seen`-state logic in v1. |
| D3 | v1 deliverable | **Reusable engine + this one walkthrough** | Build a small data-driven tour engine; author only the "build a quote" walkthrough on top. Future walkthroughs = just a new step array. |

## 3. Analyst-proposed design (for Coach to pressure-test)

### 3a. Build approach — custom, not a vendored library
ARC is a single self-contained app (`src/app.jsx`, Babel build step, strict runtime). Recommend a **custom spotlight/overlay engine** (~a few hundred lines) over Driver.js/Shepherd.js/Intro.js — avoids dependency + CSP risk and gives full control over the gated-advance behavior. *Coach to confirm no existing in-app tour/overlay primitive we should reuse.*

### 3b. Anchoring — `data-tour` attributes, not CSS selectors
Each step targets an element by a stable `data-tour="<key>"` attribute added to the relevant button/field. Robust against layout/class changes. Marc adds the tags to the quote-build UI during the build. *Coach's Supplement enumerates which elements in the quote-build flow need tags.*

### 3c. Step schema (data-driven — the heart of the engine)
```js
{
  id: "create-project",
  target: '[data-tour="new-project-btn"]',   // element to spotlight
  title: "Create a new project",             // short heading in the bubble
  body:  "Click + New Project to start a blank quote.", // concise direction
  placement: "bottom",                       // bubble side: top|bottom|left|right|auto
  advance: { on: "click" },                  // COMPLETION CONDITION — see vocab below
  allowManualNext: false,                    // fallback "Next" button if detection is unreliable
  optional: false
}
```
A walkthrough = an ordered array of these. The engine renders one at a time.

### 3d. Advance-trigger vocabulary (what "gated" means per step)
| `advance.on` | Advances when… | Detection |
|--------------|----------------|-----------|
| `click` | user clicks the spotlighted target | one-shot listener on the target |
| `input` | target field gets a value (optionally matches a predicate) | `input`/`change` listener |
| `appear` | a named element appears (modal opens, BOM row added, etc.) | `MutationObserver` on a selector |
| `navigate` | the app view changes (e.g. enters QUOTE SUMMARY) | hook into ARC's view/route state |
| `next` | (narrated step) user clicks **Next** | button in the bubble |

*Most steps will be `click`; `navigate`/`appear` handle screen transitions; `next` for pure "read this" steps.*

### 3e. Overlay / spotlight behavior
- Dimmed backdrop with a cutout over the target's bounding rect (four rects or an SVG mask); recalculated on scroll/resize.
- Callout bubble anchored to the target: title + concise body + step counter (e.g. "3 / 12") + **Skip step** + **Exit tour**.
- Backdrop **absorbs clicks except on the spotlighted target** — so during a gated step the user can only click the right thing (reinforces training, prevents off-script drift).

### 3f. Off-script / escape handling
Always-present **Skip step** and **Exit tour**. If a step's target isn't on screen (user navigated away), engine shows a gentle "return to X" nudge rather than breaking. `allowManualNext:true` gives a Next fallback where auto-detection is fragile.

### 3g. State
v1 is **replayable, stateless** (per D2 — no first-run auto-launch). Leave a hook for a future `users/{uid}/config/trainingProgress` if we later add auto-launch/completion memory — but **do not build it in v1**.

## 4. Open questions for Coach's Supplement
1. **Data-safety (important, pre-launch).** Hands-on "build from scratch" = real Firestore writes / a real project created during training. Do we (a) let the user create a real project they delete after, (b) auto-create a clearly-named `TRAINING — <user> <date>` project, or (c) point the walkthrough at a shared demo project? Relates to **G005** (matrix-arc-test shares prod Firestore). *Freddy leans (b): a self-labeled training project that's trivially identifiable + deletable.*
2. **View/navigation hook.** What does ARC expose for "current view" so `navigate` triggers are reliable? (Coach to locate the state.)
3. **Element inventory.** Which elements in the quote-build flow need `data-tour` tags, and do any get remounted (React `key`) mid-flow in a way that would drop a one-shot listener?
4. **Scroll/virtualization.** Any long lists (BOM) that virtualize rows and could break `appear`/bounding-rect math?
5. **Reduced-motion / accessibility** posture for the overlay.

## 5. What Freddy needs from Jon — the walkthrough content
The engine is designed; the **steps** (content) come from Jon. Please provide each step in this template so it slots straight into the schema (§3c):

```
Step N:
  - WHERE (what button/field/area the user should look for — describe it; I'll map it to a data-tour tag)
  - WHAT TO DO (the concise instruction to show)
  - HOW I KNOW THEY DID IT (the advance trigger: click that button / type in that field / a modal opens / the view changes to X / just "Next")
```
Example:
```
Step 1:
  - WHERE: the "+ New Project" button, top-left of the dashboard
  - WHAT TO DO: "Click + New Project to start a blank quote."
  - HOW I KNOW: they click that button
```

## 6. Proposed pipeline (per-phase gated — HOLDS for Jon between phases)
1. **Brief** (this doc) → **Jon "go"**.
2. **Coach Supplement** — codebase investigation, answers §4, element inventory, feasibility of gated detection → **Analyst Review** (Freddy).
3. **Plan** (Coach) → **Jon approve**.
4. **Build** (Marc) — engine + `data-tour` tags + author Jon's steps → live verify (gated advance is the risk area) → **Jon sign-off** → deploy (its own checkpoint).

*Content track runs parallel: Jon provides §5 steps anytime; not on the critical path for the engine design/Supplement.*

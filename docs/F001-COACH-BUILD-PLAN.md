# F001 — Interactive Quote-Building Walkthrough — COACH BUILD PLAN

**Author:** Sam Wize (Coach) · **Date:** 2026-07-06
**For:** Freddy (Analyst Review) → Jon (build-approval) → Marc (build).
**Traced against tip:** `efbe4a1d`. Supplement: `docs/F001-COACH-SUPPLEMENT.md` (PASS). Steps: `docs/F001-WALKTHROUGH-STEPS.md`.
**Direction (confirmed):** EXTEND `TourOverlay` (47927) — do NOT build a new engine. **Jon rulings baked in: (1) REAL project, no sandbox; (2) Steps 4Ba + 7 are NARRATED, never gated.** **HOLD — no build until Jon approves.**

Two tracks: **A (engine extension)** and **B (anchor tagging)**; the **7-step array (C)** is authored last against the tagged anchors.

---

## TRACK A — engine extension (`TourOverlay` + tour-control region)

### A1. Step schema — add `type` + `advance` (backward-compatible)
Extend the step object (existing fields `{phase,title,body,target,placement,action,actionLabel}` unchanged). Add:
```js
type: "gated" | "narrated" | "checkpoint",   // default "narrated" if omitted → existing behavior
advance: {                                    // ignored for narrated (Next button drives it)
  on: "click" | "input" | "appear" | "navigate" | "state",
  match: (el|value)=>bool,   // optional predicate for input/click
  when:  (live)=>bool,       // for "state"/"navigate"/checkpoint — reads the live-state object (A5)
  appearTarget: '[data-tour="…"]', // for "appear" if different from target
},
allowManualNext: false,       // fallback Next even on gated/checkpoint (Brief §3f)
```
Omitting `type`/`advance` = today's narrated step → **the two existing tours (`TOUR_STEPS`, `SALES_TOUR_STEPS`) keep working untouched.**

### A2. GATED detectors (new effect in `TourOverlay`)
For `type:"gated"`, arm the detector on mount of the step; disarm on unmount/advance. Use **document-level delegated listeners** (remount-safe — Supplement §2 caveat):
```js
useEffect(()=>{
  if(step?.type!=="gated"||!step.advance)return;
  const {on,match}=step.advance;
  if(on==="click"){
    const h=e=>{const t=e.target.closest(step.target); if(t&&(!match||match(t)))onNext();};
    document.addEventListener("click",h,true); return()=>document.removeEventListener("click",h,true);
  }
  if(on==="input"){
    const h=e=>{const t=e.target.closest(step.target); if(t&&(!match||match(t.value)))onNext();};
    document.addEventListener("input",h,true); return()=>document.removeEventListener("input",h,true);
  }
  if(on==="appear"){
    const sel=step.advance.appearTarget||step.target;
    const mo=new MutationObserver(()=>{ if(document.querySelector(sel))onNext(); });
    mo.observe(document.body,{childList:true,subtree:true});
    if(document.querySelector(sel))onNext();
    return()=>mo.disconnect();
  }
  // "navigate"/"state" handled by the checkpoint watcher (A4) — same `when(live)` mechanism.
},[stepIdx,step]);
```
One-shot: `onNext()` advances, unmounting the effect. `match` lets e.g. Step 1 require the name field non-empty.

### A3. Click-through spotlight rework (lines 47968–47971) — the main risk
Today the root `<div style={{position:'fixed',inset:0,zIndex:99997,pointerEvents:'all'}}>` (47968) absorbs ALL clicks, so a gated user can't click the real target. **Make click-absorption conditional on step type:**
- **NARRATED / CHECKPOINT** → keep the current full-absorb backdrop (prevents off-script drift while reading/waiting).
- **GATED** → replace the single full-screen absorber with **four backdrop rects** (above / below / left / right of the target cutout), each `pointerEvents:'all'`, leaving the **cutout hole with no overlay element** so the real target receives the click. Keep the existing blue ring (47970, `pointerEvents:'none'`) as the visual. Sketch:
```jsx
step.type==="gated" && rect ? (
  <>
    <div style={{position:'fixed',top:0,left:0,right:0,height:rect.top-PAD,background:'rgba(0,0,0,0.75)',pointerEvents:'all'}}/>
    <div style={{position:'fixed',top:rect.top+rect.height+PAD,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.75)',pointerEvents:'all'}}/>
    <div style={{position:'fixed',top:rect.top-PAD,left:0,width:rect.left-PAD,height:rect.height+PAD*2,background:'rgba(0,0,0,0.75)',pointerEvents:'all'}}/>
    <div style={{position:'fixed',top:rect.top-PAD,left:rect.left+rect.width+PAD,right:0,height:rect.height+PAD*2,background:'rgba(0,0,0,0.75)',pointerEvents:'all'}}/>
    {/* ring (visual) + bubble as today */}
  </>
) : (/* existing full-absorb backdrop for narrated/checkpoint */)
```
The bubble stays `pointerEvents:'all'` (z 99999). **This is the highest-risk change — verify click-through lands on the exact target and the four rects fully mask elsewhere, at various scroll positions.**

### A4. CHECKPOINT watcher (new)
For `type:"checkpoint"`, render a "⏳ Waiting — you'll continue when {X} arrives" state (reuse the bubble; hide Next unless `allowManualNext`), and auto-advance when the predicate flips:
```js
useEffect(()=>{
  if(step?.type!=="checkpoint"&&!(step?.advance?.on==="state"||step?.advance?.on==="navigate"))return;
  if(step.advance?.when && step.advance.when(liveState)) onNext();   // re-runs when liveState prop changes
},[stepIdx,step,liveState]);
```
`liveState` is the object from A5. Because it flows in as a prop, the effect re-checks on every project update — no manual polling. Re-entrant: the predicate is recomputed fresh each launch.

### A5. Live-state exposure (the one WIRING dependency)
`TourOverlay` renders at app scope (47745); the checkpoint/resume predicates need project state that lives in `ProjectView`. **Expose a small live-state object** following the codebase's existing module/global convention (`_appCtx`, `window._*`):
```js
// updated wherever ProjectView/dashboard already re-renders on these:
window._arcTourState = {
  view,                       // "dashboard" | "panels" | "quote"  (ProjectView view state, 36938)
  projectId,
  bomPopulated,               // panel.bom.length>0
  extractionActive,           // from the activeExtractions subscription (36786)
  pendingRfqUploads,          // 36056
  preReviewStatus,            // "pending"|"approved"|... (F003)
  quoteSentAt, quoteLocked,   // 16036/33282
};
```
Pass it into `<TourOverlay liveState={window._arcTourState} …/>` (or a small `useSyncExternalStore`/state mirror so React re-renders the overlay when it changes). **Least-invasive; mirrors `_appCtx`.** Marc picks the exact update sites (they already exist — these values are computed in render).

### A6. State-driven resume resolver (hybrid — Supplement §4)
Replace `startTour`'s pure-localStorage resume (46429-46439) with **state-picks-phase, localStorage-picks-sub-step**:
```js
function resolveResumeIdx(steps, live, savedIdx){
  const phaseIdx = firstStepIndexMatchingState(steps, live);  // per the §4 mapping table
  // clamp the saved sub-step to the resolved phase's contiguous range; else land on phaseIdx
  return (savedIdx!=null && withinSamePhase(steps, savedIdx, phaseIdx)) ? savedIdx : phaseIdx;
}
```
`firstStepIndexMatchingState` implements the Supplement §4 table (no project → 1; extractionActive → Step 3 checkpoint; pendingRfqUploads>0 → 4Bb; preReviewStatus==="pending" → 5/6; approved → 7; quoteSentAt → done). **No new Firestore field** — reuse `TOUR_KEY` localStorage for the sub-step cursor (already shipped). Keep `tourNext/Prev/Done/Skip` + `saveTourStep` as-is.

### A7. `useTourRect` scroll/resize tracking (47909)
Today it measures once + at 320ms only. For gated steps the user scrolls to reach the target → the cutout must follow. Add `window` `scroll`/`resize` listeners (throttled via rAF) while a step is active, re-running `measure()`. Small, contained.

### A8. a11y (Brief §4.5)
- `prefers-reduced-motion`: guard the spotlight `transition` (47970) + progress-bar `transition` (47976) — skip animations when set.
- Focus-trap the bubble; **Esc** → `onMinimize` (preserves resume). Ensure the bubble is reachable/tabbable.

**Track A total ≈ 150–230 LOC** in the `TourOverlay` + tour-control region. Risk **MED** (A3 click-through + A5 wiring are the watch-items). No change to the two existing tours' behavior (schema additions are optional/defaulted).

---

## TRACK B — `data-tour` anchor tagging (~15 core adds + ~4 optional)

Per Supplement §2. One-line `data-tour="…"` attrs; no logic. Mapped to components:

| Anchor (add) | Component / rough site | Step |
|---|---|---|
| `np-name` | New-Project modal — name field | 1 |
| `np-panels` | New-Project modal — # panels | 1 |
| `np-customer` | New-Project modal — customer dropdown | 1 |
| `np-salesperson` | New-Project modal — salesperson | 1 |
| `np-pm` | New-Project modal — project manager | 1 |
| `np-engineer` | New-Project modal — engineer | 1 |
| `np-create` | New-Project modal — Create Project button | 1 |
| `prequote-continue` | Pre-Quote modal — "Done…Continue" button | 2 |
| `verify-page-type` | verify-page-type UI | 3 |
| `verify-region` | region-out ("verify region") UI | 3 |
| `rfq-vendor-select` | RFQ modal — vendor select | 4Ba |
| `rfq-preview` / `rfq-send` | RFQ modal — preview + Send | 4Ba |
| `upload-quote-btn` | "Upload Quote (N)" button (36056) | 4Bb |
| `send-tech-review-btn` | Send-for-Tech-Review button (~34523) | 5 |
| `tech-review-engineer-picker` | engineer picker | 5 |
| *(optional)* `project-tile-rfq-badge` | dashboard tile "# RFQs" | 4Bb |
| *(optional)* `prereview-overlay` | "In Pre-Review — awaiting…" overlay | 5 |
| *(optional)* `quote-lock-overlay` | post-send lock overlay | 7 |
| *(optional)* `bom-lead` / `bom-priced` | BOM Lead / Priced cells | 4B |

**Reuse (exist):** `new-project-btn`, `add-files-zone`, `bom-status` (Issues), `bom-table`, `rfq-btn`, `bom-tr-user-checkbox`, `bom-tr-engineer-circle`, `print-quote-btn`. Track B is **LOW risk but WIDE** (~6–7 components). Fully parallelizable with Track A.

---

## TRACK C — the 7-step array (authored last, against tagged anchors)

New array `QUOTE_TOUR_STEPS` (own `TOUR_KEY_QUOTE` localStorage key; a 3rd `tourMode:"quote"`, launched from a new gear-menu entry beside the existing two). Per-step type per `docs/F001-WALKTHROUGH-STEPS.md` tags **+ Jon's ruling (4Ba + 7 NARRATED).**

| # | Step | type | target | advance |
|---|---|---|---|---|
| 1 | Create Project | **gated** | `new-project-btn` → modal fields | `appear`/`navigate`: project created (PRJ# assigned / view→panels). `match` requires name+panels set. |
| 2 | Create folders (out-of-app) | **gated** | `prequote-continue` | `click` the Done/Continue button |
| 3 | Extract Drawings | **checkpoint** (with a gated drag sub-step) | `add-files-zone` | drag → `appear` (pages/extraction start); then **checkpoint** `when: live=>!live.extractionActive && live.bomPopulated`. Verify-page-type/region = narrated sub-points. |
| 4A | Issues chips | **narrated** | `bom-status` | Next |
| 4B | Stale lead/price | **narrated** | `bom-table` | Next |
| 4Ba | Send RFQs | **NARRATED (Jon)** | `rfq-btn` | Next — the step POINTS at Send/Print RFQs and explains; **the tour never gate-detects or auto-fires the send.** Copy note: *"Send when you're ready — the walkthrough continues automatically once a supplier sends a quote back."* |
| 4Bb | Receive Supplier Quotes | **checkpoint** | `upload-quote-btn` | `when: live=>live.pendingRfqUploads>0`; then narrated upload + TR-flag sub-points (`bom-tr-user-checkbox`). Waits on the real supplier submission — a narrated 4Ba can't flip this early. |
| 5 | Send for Technical Review | **gated** | `send-tech-review-btn` → picker | `when: live=>live.preReviewStatus==="pending"` (detects the user's own action; internal review, not an external customer/supplier send) |
| 6 | Receive Returned Tech Review | **checkpoint** | `bom-tr-engineer-circle` | `when: live=>live.preReviewStatus==="approved"` (or all flagged resolved) |
| 7 | Verify & Send Quote | **NARRATED (Jon)** | `print-quote-btn` | Next — POINTS at Send Quote + explains the post-send lock; **never gate-detects/auto-fires the send.** Copy note: *"When your rows are clean, send on your own timing; sending locks the quote."* |

**Jon ruling #2 encoded:** the two consequential external sends (4Ba suppliers, 7 customer) are NARRATED — the tour explains + points, advances on Next, and **never auto-fires or gate-detects the send**; the downstream checkpoints (4Bb `pendingRfqUploads`, 6 `preReviewStatus`) resume off **real** state, so a narrated 4Ba won't prematurely satisfy 4Bb.

**Jon ruling #1 encoded:** **no training sandbox** — the tour overlays the user's REAL project/quote (dropped the Supplement §5.1 option-b bootstrap, −~20-40 LOC). Data-safety: writes are real; **G005** (matrix-arc-test shares prod Firestore) remains the standing pre-launch caveat, accepted per Jon.

---

## Sequence, lift, verify

- **Build order:** Track B (anchors, mechanical) ∥ Track A (engine) → Track C (author steps against tagged anchors) → `validate_jsx.js`.
- **Lift:** A ≈ 150–230 LOC (MED — A3 click-through, A5 wiring), B ≈ 15–19 one-liners (LOW, wide), C data-only. **Overall MEDIUM.**
- **Verify (risk areas):** (1) GATED click-through — the user's real click lands on the target through the cutout, backdrop masks elsewhere at all scroll positions; (2) CHECKPOINT resume — kill/reopen the tour mid-lifecycle (extraction running / awaiting supplier / awaiting review) and confirm state-driven resume lands on the right step; (3) narrated 4Ba/7 never auto-advance the send; (4) existing `TOUR_STEPS`/`SALES_TOUR_STEPS` unaffected (schema defaults); (5) a11y reduced-motion + Esc; (6) `validate_jsx.js` clean.

## Pipeline / HOLD
This Plan → Freddy Analyst Review → Jon build-approval → Marc builds (Tracks A+B, then C) → live verify → Coach review → Jon deploy checkpoint. **HOLDING — no build.**

# #181 — Manual-Line Title Data Loss (drawing-less lines) — Diagnostic

**Status:** OPEN (HIGH — silent loss of manually-entered customer data). Diagnosis complete; **no fix yet** (fix design deferred behind Coach's `v1.19.618` origin trace — see "Open question" below).
**Date:** 2026-06-30 MDT
**Roles:** Coach (path map / mechanism trace) · Jon (runtime repro) · Marc (writeup) · Freddy (analysis/routing)

---

## Summary

When a user adds a Line to a project with **no drawing dropped** and manually types **DWG# / REV / DESCRIPTION**, those values are **silently wiped** from React state *and* Firestore on a later visit. The loss is **deterministic on a specific navigation pattern** (cross-project navigation that unmounts/remounts the `PanelCard`), which is why field reports looked "intermittent."

The data is genuine, customer-facing title-block information on a drawing-less line. It is lost without any user action or warning.

---

## Symptom (field reports)

- **PRJ402124** — lines 1, 2, 3 cleared.
- **PRJ402126** — all lines cleared.
- Other drawing-less lines elsewhere **retained** their data → not universal; pattern-dependent.

Required behavior: manual DWG#/REV/DESCRIPTION must **persist** on a line that has no drawing.

---

## Runtime confirmation (Jon's repro — primary evidence)

Reproduced live on **PRJ402100** (test project, real-shaped data). The trigger is **more precise than "every re-open"**:

| Sequence | Result |
|---|---|
| Drawing-less line + manual DWG#/REV/DESC → leave PRJ402100 → **return immediately** | data **SURVIVES** |
| Same line → open a **DIFFERENT** project → back out → return to PRJ402100 | data **GONE** |

**Conclusion: the trigger is `PanelCard` UNMOUNT/REMOUNT, not project re-open per se.** Returning straight back keeps the component mounted (or the `_titleClearRan` ref still `true`); routing through another project forces a real unmount → the `useRef` resets → on remount Mechanism 2 fires and wipes the fields. This is deterministic per navigation pattern, which explains the field-reported "intermittency."

---

## Mechanism (Coach's path map, grounded in current code)

Both mechanisms live in `PanelCard` and both carry `DECISION(v1.19.618)`. Their original intent: retroactively scrub **stale** title-block text left on extraction-origin panels by **pre-v1.19.738 saves through `saveProjectPanel`** — those saves wiped `pages` to `[]` but kept `drawingNo/Desc/Rev`, with no cascade to clear them. **NOTE (Coach trace correction):** this is *not* a deleted-drawing case — `removePage` has cascaded `drawingNo` since **v1.10.19**, so deleting a drawing already clears the title. The earlier "deleted-drawing" framing was wrong.

### Mechanism 1 — draft state init forces empty ([src/app.jsx:23613-23616](../src/app.jsx))
```js
const _titleStale=(panel.pages||[]).length===0;
const [draftNo,setDraftNo]=useState(_titleStale?"":(panel.drawingNo||"").slice(0,25));
const [draftDesc,setDraftDesc]=useState(_titleStale?"":(panel.drawingDesc||""));
const [draftRev,setDraftRev]=useState(_titleStale?"":(panel.drawingRev||""));
```
On mount, if `pages=[]`, the visible draft inputs initialize to `""` **regardless of stored values** — the UI shows blank fields even before any wipe is persisted.

### Mechanism 2 — useEffect wipes state + Firestore ([src/app.jsx:23524-23534](../src/app.jsx))
```js
const _titleClearRan=useRef(false);
useEffect(()=>{
  if(_titleClearRan.current)return;
  if((panel.pages||[]).length!==0)return;
  if(!panel.drawingNo&&!panel.drawingDesc&&!panel.drawingRev)return;
  _titleClearRan.current=true;
  const cleaned={...panel,drawingNo:"",drawingDesc:"",drawingRev:""};
  console.log('[TITLE BLOCK] Cleared stale drawingNo/Desc/Rev on panel with no drawings:',panel.name||panel.id);
  onUpdate(cleaned);
  try{onSaveImmediate&&onSaveImmediate(cleaned);}catch(e){}
},[panel.pages?.length,panel.drawingNo,panel.drawingDesc,panel.drawingRev]);
```
On mount, if `pages=[]` **and** any of `drawingNo/drawingDesc/drawingRev` is populated → writes `""` to all three in React state **and** persists via `onSaveImmediate` to Firestore.

**Why the unmount/remount trigger:** `_titleClearRan` is a `useRef` scoped to a single component instance. Same instance (leave + immediate return — stays mounted, or ref still `true`) → guard short-circuits → no wipe. A real unmount (cross-project navigation) destroys the instance → on remount the ref is `false` again → the effect runs → wipe + immediate Firestore save.

---

## Root flaw

`v1.19.618` conflates two states that are both `pages.length === 0`:
1. **Stale** title block — an extraction-origin panel left with orphaned title text by a **pre-v1.19.738 save** that wiped `pages` to `[]` but kept `drawingNo/Desc/Rev` (no cascade). (The case v1.19.618 wanted to scrub. NOT a deleted-drawing case — `removePage` cascaded `drawingNo` since v1.10.19.)
2. **Legitimate** drawing-less manual line — the user deliberately entered DWG#/REV/DESC on a line that never had, and was never meant to have, a dropped drawing. (Valid customer data.)

The code cannot distinguish (2) from (1), so it destroys (2) along with (1).

---

## Discriminator — RESOLVED · fix shipped v1.21.9 (`4175ecbd`)

Coach's `v1.19.618` origin trace resolved the discriminator: **`extractionReport` presence.** An extraction-origin panel always has a populated `extractionReport`; a manual-entry line never does. Both mechanisms are now gated on it (FIX #181):
- **Mechanism 2:** `if(!panel.extractionReport)return;` added before the populated-fields check (~23528).
- **Mechanism 1:** `_titleStale = (panel.pages||[]).length===0 && !!panel.extractionReport` (~23614).

The cleanup now fires ONLY on extraction-origin panels (its original target); manual-entry lines are left untouched. Resolution values and the cleanup body are unchanged. Plan: `docs/181-DETAILED-PLAN.md`.

---

## ⚠ Regression-test spec (trap-prevention — bank this)

The fix MUST be verified with **Jon's cross-project-navigation sequence**:

> drawing-less manual line → enter DWG#/REV/DESC → **open a DIFFERENT project** → return → **data must survive**.

Do **NOT** verify with "leave and return immediately" — that path **passes even on the broken build** (the component never unmounts, so Mechanism 2 never re-fires) and gives a false all-clear. A green result on the immediate-return path means nothing.

---

## Verification (v1.21.9)

- **PRESERVE (the fix's actual job) — live-confirmed on real opens:** Jon's PRJ402100 cross-project-nav repro (manual line survived the round-trip), plus **PRJ402124 opened under v1.21.9 with zero `[TITLE BLOCK]` events** and manual lines retained.
- **STILL-CLEANS (T3) — code-reasoned + Coach diff-verify.** The fix is a single *additive* early-return that fires only when `extractionReport` is falsy; the report-truthy (extraction-origin) cleanup path is byte-identical to pre-fix, so it cannot have regressed. Coach confirmed the cleanup body is untouched.
- **T4 (no double-fire) — code-reasoned:** `_titleClearRan` untouched. **T5 (grep) — PASS:** `_titleStale` = 1 definition + 3 uses.

### T3 synthetic-live: INFEASIBLE (access boundary — do NOT retry)

A synthetic live T3 (stage a stale panel, open it, watch the cleanup fire) **cannot be run from the browser-session access level.** The page can only write `users/{uid}/projects` — a **legacy collection the app does not render** (confirmed: a synthetic panel staged in Test7/PRJ402042 never loaded, and a dashboard search for that PRJ# returned "No projects yet"). The **live company project source** the app actually renders is rules-blocked and its path was not resolvable from the page (`_appCtx` is module-scoped, `collectionGroup` is permission-denied). Synthesizing into a real company project is therefore both impossible (unknown path) and unsafe. **A future session should not retry the synthetic-live T3 expecting it to work** — still-cleans is covered by code-reasoning + Coach diff-verify.

### Legacy coverage floor

The `extractionReport` discriminator was introduced at **v1.19.598**. Extraction panels created in the pre-field era (**2026-03-04 → 2026-04-21**) lack an `extractionReport`, so the gated cleanup will **skip** them — a **cosmetic miss only** (stale title text not auto-scrubbed; no data loss), with near-zero real-world likelihood. New extraction panels always carry the report, so the cleanup covers them.

## Evidence / references

- Coach's path map + `v1.19.618` origin trace — terminal session 2026-06-30.
- Jon's live repro on PRJ402100 — 2026-06-30 (the runtime confirmation table above).
- Code: `PanelCard`, `src/app.jsx:23524-23534` (Mechanism 2, gated), `src/app.jsx:23613-23616` (Mechanism 1, gated).
- **PRJ402124** was opened under the **fixed** build (v1.21.9, by Jon) with zero wipe events — this became the live PRESERVE confirmation. **PRJ402126** was not opened. (During diagnosis, before the fix shipped, both were deliberately left untouched to avoid tripping the wipe.)

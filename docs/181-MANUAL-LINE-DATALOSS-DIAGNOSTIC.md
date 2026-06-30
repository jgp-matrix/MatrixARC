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

Both mechanisms live in `PanelCard` and both carry `DECISION(v1.19.618)`. Their original intent: retroactively scrub **stale** title-block text left on panels whose drawings were deleted *before* the "clear title block on last page remove" logic existed.

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
1. **Stale** title block — drawings were dropped, title fields were drawing-derived, then drawings were deleted, leaving orphaned text. (The case v1.19.618 wanted to scrub.)
2. **Legitimate** drawing-less manual line — the user deliberately entered DWG#/REV/DESC on a line that never had, and was never meant to have, a dropped drawing. (Valid customer data.)

The code cannot distinguish (2) from (1), so it destroys (2) along with (1).

---

## Open question (gates the fix — DO NOT design the fix yet)

The discriminator: **how to tell a stale title block apart from a legitimate drawing-less manual line.** This waits on **Coach's `v1.19.618` origin trace** — what exact scenario v1.19.618 was solving, and whether a distinguishing signal exists (e.g. a "title fields were drawing-derived" flag, a "manually entered" marker, or whether the scrub should be gated to the drawing-deletion event rather than running blindly on every mount). No fix is scoped until that trace lands.

---

## ⚠ Regression-test spec (trap-prevention — bank this)

The fix MUST be verified with **Jon's cross-project-navigation sequence**:

> drawing-less manual line → enter DWG#/REV/DESC → **open a DIFFERENT project** → return → **data must survive**.

Do **NOT** verify with "leave and return immediately" — that path **passes even on the broken build** (the component never unmounts, so Mechanism 2 never re-fires) and gives a false all-clear. A green result on the immediate-return path means nothing.

---

## Evidence / references

- Coach's path map (mechanism trace) — terminal session 2026-06-30.
- Jon's live repro on PRJ402100 — 2026-06-30 (the runtime confirmation table above).
- Code: `PanelCard`, `src/app.jsx:23524-23534` (Mechanism 2), `src/app.jsx:23613-23616` (Mechanism 1).
- Cross-member docs (PRJ402124/126) were **deliberately NOT read** — opening them via the app risked triggering the very wipe under study; their populated values may still be intact in Firestore and must not be disturbed.

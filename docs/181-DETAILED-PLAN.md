# #181 Detailed Plan — Manual-Line Title Data-Loss Fix

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** READY FOR APPROVAL
**Builds on:** Coach path map (Session 9) + v1.19.618 origin trace + Marc's `docs/181-MANUAL-LINE-DATALOSS-DIAGNOSTIC.md` + Jon's PRJ402100 repro
**Discriminator locked:** `extractionReport` presence (Jon's decision)
**Tip:** master `5448c765`

---

## Overview

Two changes in PanelCard, ~4 lines modified. Both mechanisms from v1.19.618 get the same
`extractionReport` gate so the stale-title cleanup fires ONLY on extraction-origin panels
(where it was always intended) and leaves manual-entry panels untouched.

---

## §1 — Gate Mechanism 2: cleanup useEffect

**Location:** `src/app.jsx`, lines 23525–23534 (the `_titleClearRan` useEffect).

**Before (lines 23527–23528):**
```js
    if((panel.pages||[]).length!==0)return;
    if(!panel.drawingNo&&!panel.drawingDesc&&!panel.drawingRev)return;
```

**After:**
```js
    if((panel.pages||[]).length!==0)return;
    if(!panel.extractionReport)return;
    if(!panel.drawingNo&&!panel.drawingDesc&&!panel.drawingRev)return;
```

One line added: `if(!panel.extractionReport)return;`

Inserted BEFORE the populated-fields check. If `extractionReport` is falsy (`null`,
`undefined`), the effect returns immediately — no state clear, no Firestore wipe. The
existing guards (pages check, populated-fields check, `_titleClearRan` once-per-mount)
remain intact and unchanged.

### Why this position

The `extractionReport` gate must come before the populated-fields check (line 23528).
Reason: a manual-entry panel has populated fields AND no extractionReport. If the gate
came after 23528, the effect would have already passed the "fields are populated" test
and the gate would be too late to prevent the check from falling through on panels that
match both conditions in a different order. Placing it immediately after the pages-length
check (23527) and before anything else ensures the earliest possible exit for manual panels.

### Discriminator expression: `panel.extractionReport` (simple truthiness)

`extractionReport` is created at line 14767 during extraction — always a populated object
with `rawCount`, `exactCount`, `finalCount`, and other fields. Never `{}`. Cleared to
`null` by `removePage` cascade (line 25355) and re-extract clear (line 25407). On a panel
created by `addPanel()` (line 33758), the field is `undefined` (not in the initial shape).

| Panel origin | `extractionReport` value | Truthiness | Gate result |
|---|---|---|---|
| Extraction-derived, drawings later deleted (STALE) | `{rawCount:N, ...}` | truthy | **cleanup fires** (correct) |
| Manual-entry, never extracted | `undefined` | falsy | **cleanup skips** (correct) |
| Extraction-derived, drawings deleted post-v1.19.658 | `null` (cascade-cleared) | falsy | cleanup skips — but title fields are already `""` from cascade, so the populated-fields guard (23528) would skip anyway |

No ambiguity. No edge case where `extractionReport` is an empty object.

---

## §2 — Gate Mechanism 1: `_titleStale` state initialization

**Location:** `src/app.jsx`, line 23613.

**Before:**
```js
  const _titleStale=(panel.pages||[]).length===0;
```

**After:**
```js
  const _titleStale=(panel.pages||[]).length===0&&!!panel.extractionReport;
```

Same `extractionReport` gate, same logic. `_titleStale` is now `true` only when BOTH
conditions hold: pages are empty AND the panel has an extraction report (meaning the title
data originated from extraction and is genuinely stale).

Effect: lines 23614–23616 initialize `draftNo`/`draftDesc`/`draftRev` from the stored
panel values (not forced to `""`) when the panel is a manual-entry panel. The UI shows the
user's manually-entered DWG#/REV/DESC on mount instead of blanking the fields.

---

## §3 — Comment update

**Location:** `src/app.jsx`, lines 23520–23523 and 23610–23612.

Update both DECISION comments to reference the discriminator:

**Mechanism 2 comment (lines 23520–23523), replace with:**
```
  // DECISION(v1.19.618, FIX #181): Retroactive cleanup for extraction-origin panels
  // where the drawings were deleted before the v1.19.658 cascade-clear existed. Gated
  // on extractionReport presence so manual-entry panels (no extraction, no report) are
  // never wiped. See docs/181-MANUAL-LINE-DATALOSS-DIAGNOSTIC.md for root-cause analysis.
```

**Mechanism 1 comment (lines 23610–23612), replace with:**
```
  // DECISION(v1.19.618, FIX #181): Draft inputs blank only for extraction-origin panels
  // with no pages (stale title from deleted drawing). Manual-entry panels init from stored
  // values. Gated on extractionReport — same discriminator as the cleanup useEffect above.
```

---

## §4 — What is NOT changed

| Item | Why untouched |
|---|---|
| `removePage` cascade (25343–25358) | Already handles all live >0→0 transitions correctly. The fix narrows v1.19.618, not the cascade. |
| `saveTitleFields()` (24844–24867) | SAVE path is clean (per path map). No flag, no new field. |
| `saveProjectPanel` (9153–9297) | SAVE path is clean. No field stripping. |
| `onSnapshot` / `migrateProject` | LOAD path is clean. No field reconstruction. |
| `addPanel()` (33756–33758) | Panel creation shape is correct (`extractionReport` absent = manual). |
| `_titleClearRan` ref | Still needed — prevents the cleanup from re-firing on prop changes within the same mount. |

---

## §5 — Known limitation: no recovery of already-destroyed data

Panels whose manual title data was wiped by this bug before the fix deploys are **not
recoverable** — the values are gone from Firestore (`onSaveImmediate` wrote `""` over
them). The fix prevents future loss only.

Jon should spot-check projects where he previously entered manual-only lines (PRJ402124
lines 1–3, PRJ402126 all lines). Those fields will need to be re-entered manually.

---

## §6 — Regression surface

### Direct consumers of `_titleStale`

| Consumer | Lines | Impact |
|---|---|---|
| `draftNo` init | 23614 | **INTENDED** — manual-entry panels now init from stored value |
| `draftDesc` init | 23615 | **INTENDED** — same |
| `draftRev` init | 23616 | **INTENDED** — same |

No other consumer. `_titleStale` is a local `const` used only for the three `useState` initializers.

### Direct consumers of the cleanup useEffect

The useEffect at 23525–23534 calls `onUpdate` + `onSaveImmediate`. Those are the same
handlers called by every other panel mutation. No unique side effects from this effect
beyond the title-field clearing it already does.

### `extractionReport` read sites

The gate reads `panel.extractionReport` — a read-only truthiness check. It does not modify,
delete, or depend on the report's contents. No other code path is affected by this read.

### Net regression risk

**ZERO unintended behavioral change.** The cleanup continues to fire on exactly the panels
it was designed for (extraction-origin, stale title). The only change is that manual-entry
panels are excluded — which is the fix.

---

## Test criteria

| # | Test | Method | Expected |
|---|------|--------|----------|
| T1 | **PRESERVE** — manual-entry survives cross-project navigation | Create a drawing-less line on PRJ402100, enter DWG#/REV/DESC manually. Open a DIFFERENT project. Return to PRJ402100. | DWG#/REV/DESC **still present** in UI AND Firestore |
| T2 | **PRESERVE** — survives browser refresh | Same line from T1. Hard-refresh the browser (Ctrl+Shift+R). | DWG#/REV/DESC **still present** |
| T3 | **STILL-CLEANS** — stale extraction-origin title cleared | Find or create a panel that has `extractionReport` present but `pages:[]` and populated drawingNo (an extraction-origin panel with drawings deleted). Open, navigate away, return. | drawingNo/Desc/Rev cleared to `""` — console shows `[TITLE BLOCK] Cleared stale drawingNo/Desc/Rev` |
| T4 | **NO DOUBLE-FIRE** — cleanup doesn't repeat within same session | On the stale panel from T3, stay on the project (don't navigate away). Verify the cleanup fires once. | `_titleClearRan` prevents re-fire; console log appears exactly once |
| T5 | **GREP** — no other `_titleStale` usage | `grep _titleStale src/app.jsx` | Exactly 1 definition + 3 uses (the three `useState` lines) |

---

## Implementation sequence

1. Marc applies §1 (gate Mechanism 2), §2 (gate Mechanism 1), §3 (comment updates) in a
   single commit.
2. Marc runs T5 (grep verification) before committing.
3. Deploy via `deploy.sh`.
4. Jon runs T1 + T2 (manual-entry preserve) on PRJ402100 using the cross-project navigation
   pattern from the diagnostic.
5. Marc runs T3 + T4 (stale-cleanup still works) on a test panel with extraction artifacts.
6. Coach verifies committed diff matches plan.

**Total: ~4 lines changed in `src/app.jsx`. One commit. One deploy.**

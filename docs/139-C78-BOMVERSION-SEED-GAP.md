# C78 — PRJ402096 Dv.# Blank: Code-Verified Runtime Trace + Fix Analysis

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-16  
**Status:** CONFIRMED — root cause is a seed-condition gap, not a render bug  
**Related:** #138 (Dv.#/Qv.# split), #119 (legacy panel class)  
**TODO:** #139 (bomVersion seed-gap)

---

## 1. Jon's Runtime Trace — Code-Verified

Jon pulled live in-memory state from PRJ402096 (3 panels, authenticated as Jon, company account). Coach independently verified each claim against the source:

| Panel | `bomVersion` | Non-labor rows | Dv.# renders | Code-verified? |
|-------|-------------|----------------|-------------|----------------|
| panel-1 | `3` (number) | 55 | "3" | YES |
| panel-2 | `5` (number) | 73 | "5" | YES |
| panel-3 | `undefined` (key absent) | 10 | "—" | YES |

`project.quoteRev = 1` — present, which is why Qv.# renders correctly on all three pages. Both fields arrays (lines 7895/7908) use `qvRev!=null?String(qvRev).padStart(2,"0"):"—"`, and `qvRev` comes from `opts.quoteRev` which traces back to `project.quoteRev`.

---

## 2. Root Cause: Seed-Condition Gap in `_bumpBomVersionIfChanged`

`_bumpBomVersionIfChanged` (app.jsx:8661) has two paths to set `bomVersion`:

### Seed path (line 8665):
```js
if(oldCount===0 && newCount>0 && newPanel.bomVersion==null){
  return{...newPanel, bomVersion:1};
}
```
Only fires on the transition from 0 → N non-labor rows. Panel 3 already has 10 rows (populated before v1.19.743 when the feature shipped), so `oldCount` is always >0 on subsequent saves → seed path **never fires**.

### Bump path (lines 8668-8676):
Only fires when `oldCount>0` AND either the BOM hash changes (`_computeDvBomHash` — part numbers + quantities) or redline count changes. Panel 3 has had no BOM content changes since v1.19.743 → bump **never fires**.

### Result:
Panel 3 falls through both paths and returns unchanged — `bomVersion` is never written. The comment at line 9152 confirms this was intentional at the time: *"Existing pre-v1.19.743 panels with no version stay un-versioned until their first mutation under the new code (per user spec — 'leave existing panels as-is')."*

This is the #119 legacy-panel class, but at **panel granularity** — not a whole-project issue. Panels 1 & 2 in the same project were re-extracted/edited after v1.19.743 and got seeded+bumped; Panel 3 was left untouched.

---

## 3. Render Behavior — Confirmed Graceful

The render path at line 7895/7908:
```js
panel.bomVersion!=null ? String(panel.bomVersion) : "—"
```
`undefined != null` → `false` → renders `"—"`. Not blank, not "Dv.undefined", not broken. The UI chip (line 27139) gates on `bomVersion!=null` and hides entirely — also correct and consistent.

**The render is NOT the problem.** #138's code is working exactly as specified in C76.

---

## 4. Fix Options

### Option A — Backfill on load (~10 lines in `loadProjects`)
Seed `bomVersion:1` for any panel with `bom.length > 0` but no `bomVersion`. Fixes the data once for all consumers. Ties directly to #119's optional backfill scope (TODO line 2017). Downside: writes to Firestore on next save for every legacy panel (fire-once cost across entire fleet).

### Option B — Render-side default (~1 line)
Change the ternary to default to `"1"` instead of `"—"`. Cosmetic lie — no version was tracked, but the box shows "1". Doesn't fix the UI chip or any other consumer. Smallest change, worst semantics.

### Option C — Expand the seed condition (~2 lines in `_bumpBomVersionIfChanged`)
Remove the `oldCount===0` gate:
```js
// BEFORE (current):
if(oldCount===0 && newCount>0 && newPanel.bomVersion==null){
  return{...newPanel, bomVersion:1};
}

// AFTER (Option C):
if(newCount>0 && newPanel.bomVersion==null){
  return{...newPanel, bomVersion:1};
}
```
Any panel with BOM rows but no version gets seeded to 1 on its next save.

---

## 5. BACKFILL QUESTION — Does Option C Need a Paired One-Time Backfill?

**Short answer: NO — Option C self-heals without a separate backfill, and without requiring an edit to the affected panel.**

### Why: `saveProject` iterates ALL panels

The `saveProject` function (app.jsx:8856-8860) runs `_bumpBomVersionIfChanged` on **every panel in the project**, not just the panel being edited:

```js
// (2) bomVersion bump
for(let i=0;i<newPanels.length;i++){
  const np=newPanels[i];
  const cp=curPanels.find(p=>p.id===np.id);
  newPanels[i]=_bumpBomVersionIfChanged(np,cp);
}
```

This means: if Jon edits Panel 1 and saves, Panel 3 also passes through the bump function. With Option C's expanded condition, Panel 3 (`newCount=10`, `bomVersion==null`) hits the seed path and gets `bomVersion:1` — even though Panel 3 itself was not edited.

### Both save paths cover this:

| Save path | Scope | Heals Panel 3? |
|-----------|-------|----------------|
| `saveProject` (line 8856) | Iterates ALL panels | YES — Panel 3 seeded on any project-level save |
| `saveProjectPanel` (line 9155) | Single panel only | Only if Panel 3 itself is saved |

Since `saveProject` is the common path (project-level edits, quote changes, status changes, etc.), Panel 3 gets healed on the **next save of any kind to PRJ402096** — not just a Panel 3-specific edit.

### What about projects with NO activity?

A truly dormant project (no user interaction at all after the fix deploys) would not self-heal. But such a project also isn't generating Quoted BOMs or production travelers — there's no consumer of the Dv.# field to see the "—". The moment someone opens and saves the project for any reason, all its panels heal.

**A paired backfill (Option A) is NOT needed.** Option C alone is sufficient because the save-path architecture already processes all panels on every save.

---

## 6. OVER-SEED / SPURIOUS-BUMP SAFETY PROOF

### What `oldCount===0` currently distinguishes

The `oldCount===0` check was a proxy for "this is a first extraction" — it gates the seed path to ONLY fire on the transition from 0 rows → N rows (new panel getting its first BOM). It was paired with `bomVersion==null` as a double guard.

But `bomVersion==null` is the **real** guard against spurious seeding. A panel that already has `bomVersion` set (any value, including 1) will never enter the seed path regardless of `oldCount`. The `oldCount===0` check is redundant for panels that already have a version — it only matters for legacy panels that have rows but no version, which is exactly the case we want to FIX.

### Proof: the expanded condition fires ONCE, then never again

Trace through `_bumpBomVersionIfChanged` for Panel 3 (10 rows, `bomVersion` absent) on a no-content-change save:

**First save after fix deploys:**
1. `newCount = 10`, `oldCount = 10` (both have same 10 rows)
2. Expanded seed check: `10 > 0 && undefined == null` → **TRUE** → returns `{...newPanel, bomVersion:1}`
3. **Panel 3 is now seeded at Dv.1** ✓

**Second save (any subsequent save):**
1. `newCount = 10`, `oldCount = 10`
2. Expanded seed check: `10 > 0 && 1 == null` → **FALSE** (1 is not null) → falls through
3. Bump check: hash unchanged → `shouldBump = false` → returns unchanged
4. **Panel 3 stays at Dv.1** ✓ — no phantom bump

### Proof: already-working panels are unaffected

Trace for Panel 1 (`bomVersion:3`, 55 rows) on a no-content-change save:
1. Expanded seed check: `55 > 0 && 3 == null` → **FALSE** → falls through
2. Bump check: hash unchanged → `shouldBump = false` → returns unchanged
3. **Panel 1 stays at Dv.3** ✓

Trace for Panel 1 on a content-change save (added a row):
1. Expanded seed check: `56 > 0 && 3 == null` → **FALSE** → falls through
2. Bump check: hash changed → `shouldBump = true` → `next = (3 ?? 3 ?? 1) + 1 = 4`
3. **Panel 1 bumps to Dv.4** ✓ — correct behavior, unchanged from current

### Proof: empty panels are not spuriously seeded

Trace for a brand-new panel with 0 BOM rows:
1. Expanded seed check: `0 > 0` → **FALSE** → falls through
2. **Not seeded** ✓ — empty panels don't get a version

### What replaces the `oldCount===0` gate?

Nothing needs to replace it. The `bomVersion==null` check alone is the correct guard:

| Panel state | `newCount>0` | `bomVersion==null` | Seed fires? | Correct? |
|------------|-------------|-------------------|-------------|----------|
| Legacy, has rows, no version | YES | YES | **YES** | ✓ Fix target |
| Already versioned, no content change | YES | NO | NO | ✓ No spurious seed |
| Already versioned, content changed | YES | NO | NO (bump path handles) | ✓ Correct bump |
| Empty panel, no version | NO | YES | NO | ✓ Don't seed empty panels |
| Empty panel, has version (impossible) | NO | — | NO | ✓ N/A |

The `oldCount===0` gate was load-bearing only for one case: "panel has rows AND no version AND the rows aren't new." That is precisely the legacy-panel case we're fixing. Removing it doesn't affect any other case because `bomVersion==null` already gates out all already-versioned panels.

---

## 7. Summary

| Question | Answer |
|----------|--------|
| Root cause | `oldCount===0` gate in seed path (line 8665) prevents seeding legacy panels that already have BOM rows |
| Render broken? | NO — graceful "—" fallback, correct per spec |
| Recommended fix | **Option C** — remove `oldCount===0` from seed condition (~2-line change) |
| Needs paired backfill? | **NO** — `saveProject` iterates all panels, so legacy panels heal on next project-level save of any kind |
| Over-seed risk? | **NONE** — `bomVersion==null` is the real guard; fires exactly once per legacy panel, then never again |
| Phantom bump risk? | **NONE** — bump path (hash/redline change) is structurally separate from seed path; removing `oldCount===0` doesn't touch it |
| #119 connection | Same root class (legacy panels missing post-feature fields). Option C fixes the bomVersion gap; #119's broader scope remains open |
| Estimated change | ~2 lines in `_bumpBomVersionIfChanged` + comment update |

**No code until Jon reviews and approves.**

---

## 8. Connection to #119

This is a concrete manifestation of #119 (legacy panels invisible to Phase 1 safety systems). The `bomVersion` gap is lower-severity than #119's `extractionReport` gap (safety systems silently skipping), but it's the same root class: features gated on fields that were never written to pre-feature panels. Option C fixes the `bomVersion` gap. #119's broader scope (extractionReport backfill, ZeroBomBanner fallback, 1c gate on re-extract) remains open.

# #153 Reconciliation Cross Trace

**Coach (C102) — 2026-06-17**
**Type:** Read-only structural trace
**Status:** COMPLETE — root cause narrowed to two candidates, runtime verification needed

---

## Context

Jon dropped revised drawings on a panel with ~55 BOM rows. The ReconciliationModal
opened (47 unchanged / 4 changed / 3 new / 1 deleted) — the modal itself works. But
the **prior column shows PRE-CROSSED (original extracted) part numbers**, not Jon's
crossed/substituted PNs. He expected a dozen+ differences (because his crosses change
many PNs); it reported almost none, because it's comparing raw-extraction PNs on both
sides.

**Critical risk:** If Jon commits, `carryUnchanged` would carry the pre-cross prior
rows (with original PNs) forward — WIPING his crosses. This is the exact data-loss
scenario #153 exists to prevent. Jon cancelled (safe — zero writes on cancel).

---

## TRACE ANSWERS

### Q1: Where do crosses live in the data model?

Crossing **OVERWRITES** `row.partNumber` with the replacement PN.

```
crossedFrom = original extracted PN  (stored for display/audit)
partNumber  = replacement PN         (the working value)
isCrossed   = true
autoReplaced = true (if from learning DB)
```

Source: `applyLearnedCorrections` at line 10717:
```javascript
const _altRow = {
  ...r,
  partNumber: alt.replacement.partNumber,   // ← OVERWRITES
  crossedFrom: pn,                          // ← stores original
  isCrossed: true,
  autoReplaced: true,
  ...
};
```

Manual crosses (BC Item Browser) use the same model — `commitBcItem` sets
`partNumber` to the selected item, `crossedFrom` to the original, `isCrossed: true`.

**Two display conventions exist:**
- Interactive BOM grid: shows `partNumber` (replacement) as primary, `crossedFrom`
  as "from: ..." secondary line
- RFQ print table (line 18892): shows `crossedFrom` as primary, `partNumber` as
  "Matrix Part #" secondary

Jon works with the interactive grid. His mental model: primary PN = the replacement.

### Q2: What is passed as the "prior" BOM?

The ReconciliationModal receives its prior BOM at render time:

```
line 29894:  currentBom={latestPanelRef.current.bom || []}
line 23093:  frozenBom = useRef(JSON.parse(JSON.stringify(currentBom || [])))
line 23097:  reconcileBom(frozenBom.current, stagedExtraction.items)
```

- `latestPanelRef.current` is updated every render from the `panel` prop (line 23920)
- The deep copy at mount freezes the prior BOM against background saves
- **SHOULD be the live BOM with all crosses preserved**

### Q3: Does the match key compare crossed or pre-cross PNs?

```
line 47300:  matchableCurrent.forEach(r => {
               const np = normPart(r.partNumber); // ← uses partNumber
             });
line 47301:  extraction.forEach(it => {
               const np = normPart(it.partNumber); // ← uses partNumber
             });
```

Both sides use `normPart(partNumber)`. For crossed rows, `partNumber` = replacement PN.
If both sides have the same cross applied, they match as **unchanged**. If only the
prior has the cross, they won't match on Pass 1 and may match on Pass 2 (position +
description) as `pn_changed`.

### Q4: Does carry-forward preserve crosses?

**Unchanged rows — YES:**
```
line 47367:  carryUnchanged(prior, ext) = {
               ...prior,              // ← spreads ALL prior fields (crosses included)
               y_top: ext.y_top, ...  // ← only overrides position fields
             };
```

**PN-changed rows — NO (by design):**
```
line 47372:  carryChangedPnChanged(prior, ext) = {
               id: prior.id,
               partNumber: ext.partNumber,  // ← NEW extraction PN
               qty: ext.qty,
               ...                          // ← strips isCrossed, crossedFrom, pricing
             };
```

---

## ROOT CAUSE ANALYSIS

### Static analysis rules out

Every code path examined preserves crosses on `latestPanelRef.current`:

| Path | Preserves crosses? | Why |
|------|--------------------|-----|
| Original extraction `onDone` (line 24610) | YES | `onUpdate(finalPanel)` — finalPanel has crosses from `applyLearnedCorrections` |
| Pricing completion (line 27253) | YES | `onUpdate({...panelBase, bom: updatedBom})` — pricing only adds price fields, never touches `partNumber`/`crossedFrom`/`isCrossed` |
| Manual cross via BC Item Browser | YES | `onUpdate` called with the updated row that has `isCrossed: true` |
| Staging extraction `applyInMemory` | N/A | Only updates LOCAL `latestPanel` inside `runExtractionTask` — never touches `latestPanelRef.current` |
| onSnapshot listener (line 36483) | N/A | Only applies when `updatedBy !== uid` (another user's edit) |

**No code path was found that strips crosses from `latestPanelRef.current`.**

### Two candidates remain

#### CANDIDATE A — `latestPanelRef.current.bom` lacks crosses at modal mount (MOST LIKELY)

Something replaces the panel prop with a version that has original (uncrossed) PNs.
All examined paths preserve crosses, but the async window between drop and modal mount
is wide enough for a race:

1. **Between gate and staging extraction start:** User reviews page types in the
   confirmation banner. Any re-render during this window runs
   `latestPanelRef.current = panel` (line 23920). If the parent state changes to a
   BOM-less or pre-cross version during page review, the ref follows.

2. **During staging extraction:** The extraction runs asynchronously (~10-30s). Any
   `onUpdate(...)` call from a background process (pricing, BC vendor lookup, BC
   re-verify) during this window updates the parent state. If any of these passes
   through a panel without crosses, the state is corrupted.

3. **Firestore-sourced replacement:** If the panel data in Firestore somehow lacks
   crosses (e.g., a save race from another extraction that overwrote with pre-cross
   data), and an onSnapshot fires with `updatedBy !== uid`, the project state would
   be replaced with the pre-cross version.

#### CANDIDATE B — `applyLearnedCorrections` masks the real diff (SECONDARY)

`applyLearnedCorrections` runs on the staging extraction at line 14583 with **NO
`stagingMode` gate**. If all of Jon's crosses originate from the learning DB:

- Original BOM: `partNumber` = crossed PN (via `applyLearnedCorrections` at first extraction)
- New extraction: `partNumber` = crossed PN (via `applyLearnedCorrections` again)
- Both sides identical → **47 unchanged**, all showing crossed PNs
- But the diff SHOULD show these as requiring verification — a drawing revision might
  have changed the original PN, and the blind auto-cross masks the change

This candidate doesn't explain Jon seeing pre-crossed PNs in the prior column, but it
creates a **different data-integrity risk**: the modal falsely reports "unchanged" for
rows where the underlying drawing PN actually changed, because the auto-cross applied
identically to both sides.

---

## `applyLearnedCorrections` STAGING-MODE GAP

**Regardless of root cause, this is a design defect:**

```
line 14581-14587:
if (mergedBom.length > 0) {
    const learned = await applyLearnedCorrections(mergedBom, uid, {...});
    mergedBom = learned.bom;
}
// ← NO stagingMode check — runs in BOTH normal and staging extraction
```

In staging mode, the extraction is meant to produce a RAW extraction for COMPARISON
against the user's worked BOM. Applying learned corrections (crosses, corrections,
library fixes) to the staging extraction:

1. **Masks real drawing changes** — if the revised drawing has a different PN but the
   learning DB still crosses it to the same replacement, the change is invisible
2. **Produces false "unchanged" matches** — both sides show the same crossed PN, so
   reconcileBom reports no difference
3. **Correct behavior:** The staging extraction should extract RAW PNs. The
   reconciliation engine should then compare raw extraction PNs against the user's
   worked BOM. Any row where the raw PN differs from the prior's `crossedFrom`
   (original) is a genuine drawing change that the user needs to review.

**Recommended fix:** Gate `applyLearnedCorrections` behind `!cbs.stagingMode` at
line 14581.

---

## DIAGNOSTIC STEPS (for CCD — runtime verification)

**One reproduction will pin the root cause.** Add these temporary logs:

### Step 1: Verify the prior BOM at modal mount

In ReconciliationModal's mount effect (line 23096), before `reconcileBom`:

```javascript
console.log("[RECON TRACE] frozenBom crossed rows:",
  frozenBom.current.filter(r => r.isCrossed).map(r => ({
    partNumber: r.partNumber,
    crossedFrom: r.crossedFrom,
    isCrossed: r.isCrossed
  }))
);
console.log("[RECON TRACE] frozenBom total:", frozenBom.current.length,
  "crossed:", frozenBom.current.filter(r => r.isCrossed).length);
```

**Expected if crosses preserved:** `crossed: N > 0`, each showing
`partNumber = replacement`, `crossedFrom = original`.

**Expected if Candidate A:** `crossed: 0` — the BOM has no crosses at all.

### Step 2: Verify latestPanelRef at render time

At the ReconciliationModal render point (line 29892), add:

```javascript
console.log("[RECON TRACE] latestPanelRef.current.bom crossed:",
  (latestPanelRef.current.bom||[]).filter(r => r.isCrossed).length,
  "total:", (latestPanelRef.current.bom||[]).length
);
```

### Step 3: Snapshot at handleRevisionDrop entry

At the top of `handleRevisionDrop` (line 24328), add:

```javascript
console.log("[RECON TRACE] handleRevisionDrop entry — crossed in latestPanelRef:",
  (latestPanelRef.current.bom||[]).filter(r => r.isCrossed).length
);
```

This reveals whether crosses exist at staging-extraction START. If they exist here
but not at modal mount (Step 1), something stripped them DURING the extraction window.

### Step 4: Verify staging extraction output

In the `handleRevisionDrop` onDone callback (line 24344), add:

```javascript
console.log("[RECON TRACE] staging extraction done — extractedBom crossed:",
  (extractedBom||[]).filter(r => r.isCrossed).length,
  "total:", (extractedBom||[]).length
);
```

This reveals whether `applyLearnedCorrections` is auto-crossing the staging
extraction (Candidate B). If `crossed > 0` in the extraction output, the
no-stagingMode-gate issue is confirmed.

---

## ANSWER TO JON'S QUESTION

**"Find which BOM is being used as prior and why it lacks the crosses."**

The prior BOM is `latestPanelRef.current.bom`, deep-copied at modal mount. This
SHOULD contain your worked BOM with all crosses. Static analysis confirms every
examined code path preserves crosses on this ref.

**Why it lacks crosses** cannot be determined statically — no code path was found that
strips them. The most likely cause is a runtime race where something updates the
parent's panel state with a pre-cross BOM during the drop→extraction→modal window.
The diagnostic logs above (4 insertion points, ~10 lines total) will identify the
exact moment crosses are lost on the next reproduction.

**Immediate safety:** Cancel was correct. The pre-cross prior would have been carried
forward on commit, wiping crosses. Do not commit until the root cause is fixed.

**The `applyLearnedCorrections` staging-mode gap is a separate design defect** that
should be fixed regardless — it masks real drawing changes by auto-crossing both
sides identically.

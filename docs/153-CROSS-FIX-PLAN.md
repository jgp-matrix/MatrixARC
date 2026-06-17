# #153 Cross-Aware Reconciliation Fix Plan

**Coach (C103) — 2026-06-17**
**Type:** Finalized two-part fix plan (diff-gated, Marc builds)
**Status:** READY FOR IMPLEMENTATION
**Builds on:** C102 (root cause trace), confirmed by v1.20.140 RECON TRACE logs

---

## ROOT CAUSE (CONFIRMED)

C102 Candidate B, validated by runtime logs:

| Diagnostic | Expected | Actual | Verdict |
|-----------|----------|--------|---------|
| Step 1 (prior at mount) | crosses present | **crossed: 17** | Candidate A dead |
| Step 3 (handleRevisionDrop entry) | crosses present | **crossed: 17** | Consistent |
| Step 2 (render) | crosses present | **crossed: 17** | Consistent |
| Step 4 (staging extraction output) | **crossed: 0** (raw) | **crossed: 16** | **SMOKING GUN** |

`applyLearnedCorrections` runs on the staging extraction (no `stagingMode` gate at
line 14583) and re-applies the same DB crosses to the new extraction. Both sides end
up with identical crossed PNs. `reconcileBom` matches them as "unchanged." Jon sees
no differences because the diff was masked. Manual crosses that trained the learning
DB (confirmed by Marc) are auto-applied to both sides identically.

---

## THE FIX — TWO PARTS

### Part 1: Gate `applyLearnedCorrections` in staging mode

**File:** `src/app.jsx`
**Location:** line 14581
**Change:** Wrap the `applyLearnedCorrections` block in `!cbs.stagingMode`

**Current code (lines 14581-14587):**
```javascript
if(mergedBom.length>0){
  try{
    const learned=await applyLearnedCorrections(mergedBom,uid,{manualVerifyRequired:!!panel._manualVerifyRequired});
    mergedBom=learned.bom;
    learnedLog=learned.appliedLog||[];
    if(learned.heldBackAlternates?.length)latestPanel._heldBackAlternates=learned.heldBackAlternates;
  }catch(e){console.warn("applyLearnedCorrections failed:",e.message);}
}
```

**Fixed code:**
```javascript
if(mergedBom.length>0&&!cbs.stagingMode){
  try{
    const learned=await applyLearnedCorrections(mergedBom,uid,{manualVerifyRequired:!!panel._manualVerifyRequired});
    mergedBom=learned.bom;
    learnedLog=learned.appliedLog||[];
    if(learned.heldBackAlternates?.length)latestPanel._heldBackAlternates=learned.heldBackAlternates;
  }catch(e){console.warn("applyLearnedCorrections failed:",e.message);}
}
```

**Effect:** Staging extraction produces RAW extracted PNs — no auto-crosses, no
auto-corrections, no library fixes. The reconciliation engine sees what the drawing
actually says.

**Why this alone is NOT enough:** Once staging extraction is raw, the new side has
ORIGINAL PNs but the prior side has CROSSED PNs (`partNumber` = replacement).
`reconcileBom` matches by `normPart(partNumber)` — new-original won't match
prior-replacement. All 17 crossed rows would fall to Pass 2 (position + description)
and match as `pn_changed`. `carryChangedPnChanged` **STRIPS** the cross (by design —
it clears all cross/pricing/BC fields). Accepting the change would WIPE the cross.
Part 1 without Part 2 makes the problem WORSE: currently crosses are silently masked;
with Part 1 alone they'd be actively destroyed on accept.

---

### Part 2: Cross-aware matching in `reconcileBom`

**File:** `src/app.jsx`
**Location:** Between `pairGroup` definition (line 47328) and Pass 1 loop (line 47330)
**Change:** Add a cross-aware pre-pass that matches crossed prior rows by `crossedFrom`

**Rationale:** When a prior row is crossed:
- `partNumber` = replacement PN (user's cross)
- `crossedFrom` = original extracted PN (what the drawing actually shows)

The raw staging extraction produces `partNumber` = original PN. To recognize "same
underlying part, user crossed it," the match engine must compare the extraction's
`partNumber` against the prior's `crossedFrom` — not `partNumber`.

**Insert BEFORE line 47330 (before the Pass 1 `curByPN.forEach` loop):**

```javascript
// #153 cross-aware pre-pass: match crossed prior rows by crossedFrom (the original
// PN on the drawing) against the raw staging extraction. Same underlying part — the
// cross is user work that carryUnchanged preserves. Runs BEFORE Pass 1 so crossed
// rows are claimed before the partNumber-based pass can mis-match them.
const _crossByOrig=new Map();
matchableCurrent.forEach(r=>{
  if(!r.isCrossed||!r.crossedFrom)return;
  const np=normPart(r.crossedFrom);
  if(!np)return;
  if(!_crossByOrig.has(np))_crossByOrig.set(np,[]);
  _crossByOrig.get(np).push(r);
});
_crossByOrig.forEach((curArr,np)=>{
  const extArr=extByPN.get(np);
  if(!extArr||!extArr.length)return;
  const pairs=pairGroup(curArr,extArr);
  pairs.forEach(({cur,ext})=>{
    if(matchedCur.has(cur)||matchedExt.has(ext))return;
    matchedCur.add(cur);matchedExt.add(ext);
    if((+cur.qty||0)===(+ext.qty||0)){
      unchanged.push({prior:cur,extracted:ext});
      matchLog.push({pass:'cross',action:'cross-match',cls:'unchanged',pn:np});
    }else{
      changed.push({prior:cur,extracted:ext,reason:'qty'});
      matchLog.push({pass:'cross',action:'cross-match',cls:'changed-qty',pn:np});
    }
  });
});
```

**Also add a guard in the Pass 1 loop (line 47334) to skip already-matched rows:**

```javascript
// Current (line 47334):
pairs.forEach(({cur,ext})=>{
  matchedCur.add(cur);matchedExt.add(ext);
  ...

// Fixed:
pairs.forEach(({cur,ext})=>{
  if(matchedCur.has(cur)||matchedExt.has(ext))return; // skip if claimed by cross pre-pass
  matchedCur.add(cur);matchedExt.add(ext);
  ...
```

---

## CARRY-FORWARD BEHAVIOR (complete picture)

After both fixes, here is how each crossed-row scenario flows:

### Scenario A: Drawing unchanged (most common — Jon's 17 rows)

```
Prior:      partNumber="ABC-REPL"  crossedFrom="XYZ-ORIG"  isCrossed=true
Extraction: partNumber="XYZ-ORIG" (raw — no learned corrections)

Cross pre-pass: normPart("XYZ-ORIG") matches → UNCHANGED
carryUnchanged: {...prior, positions from ext}
Result:     partNumber="ABC-REPL"  crossedFrom="XYZ-ORIG"  isCrossed=true  ← CROSS PRESERVED ✓
            + pricing, BC data, all user edits preserved
            + position fields updated from new drawing
```

### Scenario B: Drawing changed the PN to something new

```
Prior:      partNumber="ABC-REPL"  crossedFrom="XYZ-ORIG"  isCrossed=true
Extraction: partNumber="DEF-NEW"  (different part on revised drawing)

Cross pre-pass: normPart("XYZ-ORIG") → no match in extraction
Pass 1:         normPart("ABC-REPL") → no match in extraction
Pass 2:         position + description fallback → matched as pn_changed
carryChangedPnChanged: strips cross, uses extraction PN
Result:     partNumber="DEF-NEW"  (no cross)  ← CORRECT: different part, cross doesn't apply ✓
```

### Scenario C: Drawing updated to the replacement PN itself (rare)

```
Prior:      partNumber="ABC-REPL"  crossedFrom="XYZ-ORIG"  isCrossed=true
Extraction: partNumber="ABC-REPL" (drawing now says the replacement PN directly)

Cross pre-pass: normPart("XYZ-ORIG") → no match (extraction has "ABC-REPL")
Pass 1:         normPart("ABC-REPL") matches → UNCHANGED
carryUnchanged: {...prior, positions from ext}
Result:     partNumber="ABC-REPL"  isCrossed=true  ← cross preserved, now redundant but harmless ✓
```

### Scenario D: Non-crossed row, same PN (no change from current behavior)

```
Prior:      partNumber="XYZ-ORIG"  (no cross)
Extraction: partNumber="XYZ-ORIG"

Cross pre-pass: skipped (not isCrossed)
Pass 1:         normPart("XYZ-ORIG") matches → UNCHANGED
carryUnchanged: {...prior, positions from ext}
Result:     partNumber="XYZ-ORIG"  ← unchanged, as before ✓
```

### Scenario E: Qty change on a crossed row

```
Prior:      partNumber="ABC-REPL"  crossedFrom="XYZ-ORIG"  qty=5
Extraction: partNumber="XYZ-ORIG"  qty=8

Cross pre-pass: normPart("XYZ-ORIG") matches → CHANGED (reason: qty)
carryChangedPnSame: {...carryUnchanged(prior,ext), qty: ext.qty}
Result:     partNumber="ABC-REPL"  crossedFrom="XYZ-ORIG"  isCrossed=true  qty=8
            ← CROSS PRESERVED, qty updated from drawing ✓
```

---

## PASS 2 INTERACTION

Pass 2 (position + description fallback) is UNCHANGED. It runs after the cross
pre-pass and Pass 1 on their residuals:

- **Crossed rows matched by `crossedFrom`:** Already in `matchedCur` → skipped by
  Pass 2's `if(matchedCur.has(cur))return` guard (line 47347). No interaction.

- **Crossed rows NOT matched by `crossedFrom` or `partNumber`:** Eligible for Pass 2.
  If position + description match → `pn_changed` → `carryChangedPnChanged` strips
  cross. **CORRECT** — the drawing has a genuinely different part at that position;
  the old cross doesn't apply.

- **Crossed rows not matched anywhere:** Pass 3 → `deleted` → user decides keep/delete.
  **CORRECT** — the part is gone from the revised drawing.

No changes to Pass 2 or Pass 3 code required.

---

## MODAL DISPLAY NOTE

After this fix, unchanged cross-matched rows will show in the "Unchanged" section:

| New Part# | Prior Part# | Action |
|-----------|-------------|--------|
| XYZ-ORIG (raw) | ABC-REPL (crossed) | carried (edits kept) |

The PNs differ visually, but the row is correctly classified as unchanged. The
"carried (edits kept)" label is accurate — the cross IS an edit being carried.

**Future UX enhancement (NOT this fix):** For cross-matched unchanged rows, consider
showing "✓ crossed · original matches" or displaying `crossedFrom` context. Not
blocking for the data-integrity fix.

---

## IMPLEMENTATION CHECKLIST

| # | Change | Location | Lines affected |
|---|--------|----------|---------------|
| 1 | Gate `applyLearnedCorrections` behind `!cbs.stagingMode` | line 14581 | ~1 (add `&&!cbs.stagingMode`) |
| 2 | Add cross-aware pre-pass in `reconcileBom` | between lines 47328-47330 | ~18 (new block) |
| 3 | Add `matchedCur`/`matchedExt` guard in Pass 1 loop | line 47334 | ~1 (add if-return) |
| 4 | Remove C102 diagnostic `console.log` lines | lines from Step 1-4 | ~4 (remove temp logs) |

**Total:** ~20 lines changed/added. No new functions. No data model changes. No
Firestore schema changes. `crossedFrom` field already exists on every crossed row.

---

## TEST CRITERIA

### T1 — Core fix (crosses preserved on unchanged drawing)
Drop revised drawings with IDENTICAL PNs to the prior BOM. All crossed rows should
appear as "unchanged" with "carried (edits kept)." Commit → verify crossed PNs, pricing,
and BC data are all intact.

### T2 — Genuine drawing change surfaces
Drop revised drawings where at least 1 PN actually changed on the drawing. That row
should appear as "changed (PN changed)" — NOT masked as unchanged. The prior shows
the crossed PN; the new shows the different raw PN.

### T3 — Qty change on crossed row
Drop revised drawings where a crossed row's qty changed. Row should appear as "changed
(qty)" with both PNs visible. On commit, cross preserved, qty updated.

### T4 — Non-crossed rows unaffected
All non-crossed rows should match exactly as before (by `partNumber`). No regression.

### T5 — New rows and deleted rows unaffected
Rows genuinely added or removed from the revised drawing appear correctly in "New" and
"Deleted" sections respectively.

### T6 — Staging extraction has zero crosses
After Part 1, check console: `[RECON TRACE] staging extraction done — extractedBom
crossed: 0`. The staging extraction must be raw.

### T7 — Corrections (isCorrection) behavior
Rows with `isCorrection: true` (not crosses) continue to match by `partNumber` (the
corrected value) in Pass 1. No regression — corrections are NOT handled by the cross
pre-pass (they use `correctionFrom`, not `crossedFrom`).

---

## WATCH ITEMS (incidental, NOT this fix)

1. **"BOM AUDIT: no JSON in response"** — Audit step returned nothing during staging
   extraction on a field-stripped copy. Likely harmless (audit may not have meaningful
   input on a raw extraction), but worth a glance if it persists after the fix.

2. **"[NIQ] Failed to save learning record: insufficient permissions"** — Learning
   save failed during staging extraction. May be copy-specific (the transient panel
   doesn't have all context). Check if this fires on normal extraction too; if not,
   it's expected in staging mode (learning shouldn't be saved from a staging run anyway).

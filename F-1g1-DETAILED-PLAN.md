# F-1g.1 Detailed Plan — Distinguish Dedup Gaps from AI Misses

**Author:** Sam Wize (Coach)
**Date:** 2026-06-02
**Status:** PLAN — awaiting Marc implementation
**Severity:** CRITICAL UX (misleading message)
**Effort:** MEDIUM (~41 LOC across 5 sites)
**Ships:** STANDALONE (not bundled with #73 items 1/2/4)

---

## Summary

The "Missing BOM Line Items" message in the Scan Results banner says all gaps
were "not found in extraction" / "missed by the AI scan." In reality, many gaps
are caused by ARC's own dedup pipeline consuming duplicate rows. The user sees
"AI missed item 18" when item 18 was actually merged into item 17.

**Fix:** Instrument the exact dedup stage to report which items it consumed (fuzzy
already does this). At the render site, correlate each gap with the merge reports
to produce accurate messages: "Merged with item N" for dedup-caused gaps,
"Not found in extraction" only for genuine AI misses.

---

## Architecture Decision

Key off the **merge event**, not gap detection. Gap detection (line 13916) runs
after all dedup and only knows that itemNo N is missing from the final BOM — it
cannot tell WHY. The merge reports carry the answer: "itemNo N was consumed into
itemNo M during exact/fuzzy dedup."

This is pivotal because merges DON'T always leave gaps (TODO #59 confirms: 4
production panels have fuzzy merges with no sequence gaps). Gap detection alone
would miss those entirely.

---

## Scope

**IN:** Exact dedup instrumentation (3 flows) + fuzzy merge correlation (already
exists) + render-site message rewrite.

**OUT:** Positional dedup instrumentation (rarely causes gaps — same-Y rows
typically share itemNo).

---

## Phase 1: Exact Dedup Instrumentation (3 sites)

### Site 1A — First extraction (app.jsx:13892-13893)

**Current code (line 13892-13893):**
```js
const map={};
positional.forEach(item=>{const pn=_bomNormPn(item.partNumber);const itemNo=String(item.itemNo||item.item||"").replace(/\D/g,"");const descNorm=(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40);const key=(pn&&itemNo)?pn+":item:"+itemNo+":d:"+descNorm:pn?pn+":d:"+descNorm:"desc:"+descNorm;if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);console.log(`BOM MERGE: "${item.partNumber}" qty ${item.qty} → merged with existing (now qty ${map[key].qty})`);}else{map[key]={...item};}});
```

**Replace with:**
```js
const map={};const exactMerges=[];
positional.forEach(item=>{const pn=_bomNormPn(item.partNumber);const itemNo=String(item.itemNo||item.item||"").replace(/\D/g,"");const descNorm=(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40);const key=(pn&&itemNo)?pn+":item:"+itemNo+":d:"+descNorm:pn?pn+":d:"+descNorm:"desc:"+descNorm;if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);exactMerges.push({keptItemNo:String(map[key].itemNo||map[key].item||"").replace(/\D/g,""),droppedItemNo:itemNo,keptPn:map[key].partNumber,droppedPn:item.partNumber});console.log(`BOM MERGE: "${item.partNumber}" qty ${item.qty} → merged with existing (now qty ${map[key].qty})`);}else{map[key]={...item};}});
```

**What changed:** Added `const exactMerges=[];` and a `push` inside the `if(map[key])` branch that records `keptItemNo` and `droppedItemNo` for each exact merge.

### Site 1B — Thread `exactMerges` into `mergeStats` (app.jsx:13934)

**Current code (line 13934) — the return statement. Find this substring:**
```
fuzzyMerges:fuzzyReport.merges,nonBomRowsFiltered:nonBomRows,
```

**Replace with:**
```
fuzzyMerges:fuzzyReport.merges,exactMerges,nonBomRowsFiltered:nonBomRows,
```

### Site 1C — Thread into `extractionReport` (app.jsx:14044-14071)

**After line 14048 (`fuzzyMerges:mergeStats.fuzzyMerges||[],`), insert:**
```js
      exactMerges:mergeStats.exactMerges||[],
```

### Site 2A — Re-extract (app.jsx:23889-23897)

**Current code (lines 23889-23897):**
```js
    const map={};
    positionalDedup.forEach(item=>{
      const pn=_bomNormPn(item.partNumber);
      const itemNo=String(item.itemNo||item.item||"").replace(/\D/g,"");
      const descNorm=(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40);
      const key=(pn&&itemNo)?pn+":item:"+itemNo+":d:"+descNorm:pn?pn+":d:"+descNorm:"desc:"+descNorm;
      if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);console.log(`BOM MERGE: "${item.partNumber}" qty ${item.qty} → merged (now qty ${map[key].qty})`);}
      else{map[key]={...item};}
    });
```

**Replace with:**
```js
    const map={};const exactMerges=[];
    positionalDedup.forEach(item=>{
      const pn=_bomNormPn(item.partNumber);
      const itemNo=String(item.itemNo||item.item||"").replace(/\D/g,"");
      const descNorm=(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40);
      const key=(pn&&itemNo)?pn+":item:"+itemNo+":d:"+descNorm:pn?pn+":d:"+descNorm:"desc:"+descNorm;
      if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);exactMerges.push({keptItemNo:String(map[key].itemNo||map[key].item||"").replace(/\D/g,""),droppedItemNo:itemNo,keptPn:map[key].partNumber,droppedPn:item.partNumber});console.log(`BOM MERGE: "${item.partNumber}" qty ${item.qty} → merged (now qty ${map[key].qty})`);}
      else{map[key]={...item};}
    });
```

### Site 2B — Thread into re-extract report (app.jsx:23944-23955)

**Current code (line 23945-23946):**
```js
      rawCount:all.length,exactCount:exactDedup.length,finalCount:fuzzyDedup.length,
      fuzzyMerges:fuzzyReport.merges,bomPageCount:bomPages.length,
```

**Replace with:**
```js
      rawCount:all.length,exactCount:exactDedup.length,finalCount:fuzzyDedup.length,
      fuzzyMerges:fuzzyReport.merges,exactMerges,bomPageCount:bomPages.length,
```

### Site 3A — Feedback re-extract (app.jsx:24100-24106)

**Current code (lines 24100-24106):**
```js
    const map={};
    fbPositional.forEach(item=>{
      const pn=_bomNormPn(item.partNumber);
      const key=pn||("desc:"+(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40));
      if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);}
      else{map[key]={...item};}
    });
```

**Replace with:**
```js
    const map={};const exactMerges=[];
    fbPositional.forEach(item=>{
      const pn=_bomNormPn(item.partNumber);
      const key=pn||("desc:"+(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40));
      const itemNo=String(item.itemNo||item.item||"").replace(/\D/g,"");
      if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);exactMerges.push({keptItemNo:String(map[key].itemNo||map[key].item||"").replace(/\D/g,""),droppedItemNo:itemNo,keptPn:map[key].partNumber,droppedPn:item.partNumber});}
      else{map[key]={...item};}
    });
```

**Note:** This path uses a simpler key (PN only, no itemNo qualifier), so it
merges more aggressively than the other two. The instrumentation still works —
it records whatever gets consumed regardless of key structure.

### Site 3B — Thread into feedback report (app.jsx:24147-24156)

**Current code (line 24148-24149):**
```js
      rawCount:all.length,exactCount:fbExact.length,finalCount:fbFuzzy.length,
      fuzzyMerges:fbFuzzyReport.merges,bomPageCount:bomPages.length,
```

**Replace with:**
```js
      rawCount:all.length,exactCount:fbExact.length,finalCount:fbFuzzy.length,
      fuzzyMerges:fbFuzzyReport.merges,exactMerges,bomPageCount:bomPages.length,
```

---

## Phase 2: Render-Site Message Rewrite (1 site, 2 locations)

### Site 4 — ScanResultsBanner (app.jsx:21807)

All changes are within the `ScanResultsBanner` function.

### Site 4A — Build merge correlation map (after line 21811)

**After line 21811 (`const fuzzyMerges=r.fuzzyMerges||[];`), insert:**

```js
  const exactMerges=r.exactMerges||[];
  // Build consumed→survivor map: for each gap, can we explain it via a merge?
  const consumedToSurvivor={};
  for(const m of exactMerges){if(m.droppedItemNo)consumedToSurvivor[m.droppedItemNo]={survivorItemNo:m.keptItemNo,survivorPn:m.keptPn,source:"exact"};}
  for(const m of fuzzyMerges){const dNo=String(m.droppedItemNo||"").replace(/\D/g,"");const kNo=String(m.keptItemNo||"").replace(/\D/g,"");if(dNo)consumedToSurvivor[dNo]={survivorItemNo:kNo,survivorPn:m.kept,source:"fuzzy"};}
```

### Site 4B — Rewrite gap concern pill (line 21871-21875)

**Current code (lines 21871-21875):**
```js
  const seqGaps=r.finalSequenceGaps||[];
  if(seqGaps.length>0){
    const sample=seqGaps.slice(0,10).join(", ");
    concerns.push(`⚠ ${seqGaps.length} missing item${seqGaps.length>1?"s":""} — line${seqGaps.length>1?"s":""} ${sample}${seqGaps.length>10?` (+${seqGaps.length-10} more)`:""} not found in extraction`);
  }
```

**Replace with:**
```js
  const seqGaps=r.finalSequenceGaps||[];
  if(seqGaps.length>0){
    const dedupGaps=seqGaps.filter(g=>consumedToSurvivor[String(g)]);
    const aiGaps=seqGaps.filter(g=>!consumedToSurvivor[String(g)]);
    if(dedupGaps.length>0)concerns.push(`${dedupGaps.length} duplicate${dedupGaps.length>1?"s":""} consolidated — ${dedupGaps.slice(0,8).map(g=>{const s=consumedToSurvivor[String(g)];return s?.survivorItemNo?`item ${g} → merged with ${s.survivorItemNo}`:`item ${g} consolidated`;}).join(", ")}${dedupGaps.length>8?` (+${dedupGaps.length-8} more)`:""}`);
    if(aiGaps.length>0){const sample=aiGaps.slice(0,10).join(", ");concerns.push(`⚠ ${aiGaps.length} missing item${aiGaps.length>1?"s":""} — line${aiGaps.length>1?"s":""} ${sample}${aiGaps.length>10?` (+${aiGaps.length-10} more)`:""} not found in extraction`);}
  }
```

**What changed:** Gaps are split into two groups. Dedup-caused gaps get "item 18 →
merged with 17." Genuine AI misses keep the existing "not found in extraction" wording.

### Site 4C — Rewrite expanded details section (lines 21945-21957)

**Current code (lines 21945-21957):**
```jsx
          {seqGaps.length>0&&(
            <div style={{marginTop:10,padding:"8px 12px",background:"#3a0a0a",border:"1px solid #ef444488",borderRadius:6}}>
              <div style={{color:"#fca5a5",fontWeight:700,fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>⚠ Missing BOM Line Items ({seqGaps.length})</div>
              <div style={{color:"#fecaca",fontSize:11,marginBottom:8,lineHeight:1.5}}>
                The following drawing item numbers were not found in the extracted BOM. These items may have been missed by the AI scan. <strong>Spot-check the drawing to verify whether these items exist and add them manually if needed.</strong>
              </div>
              <div style={{color:"#fca5a5",fontSize:12,fontWeight:600,fontFamily:"ui-monospace,Menlo,Consolas,monospace"}}>
                Missing items: {seqGaps.slice(0,30).join(", ")}{seqGaps.length>30?` (+${seqGaps.length-30} more)`:""}
              </div>
              <div style={{color:"#fecaca",fontSize:10,marginTop:6}}>
                Extracted {r.finalItemCount||0} items · highest item # is {r.finalMaxItemNo||"?"} · {seqGaps.length} gap{seqGaps.length>1?"s":""}
              </div>
            </div>
          )}
```

**Replace with:**
```jsx
          {(()=>{const dedupGaps=seqGaps.filter(g=>consumedToSurvivor[String(g)]);const aiGaps=seqGaps.filter(g=>!consumedToSurvivor[String(g)]);return(<>
          {dedupGaps.length>0&&(
            <div style={{marginTop:10,padding:"8px 12px",background:"#1a2300",border:"1px solid #a3e63588",borderRadius:6}}>
              <div style={{color:"#a3e635",fontWeight:700,fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>🔀 Duplicates Consolidated ({dedupGaps.length})</div>
              <div style={{color:"#d9f99d",fontSize:11,marginBottom:8,lineHeight:1.5}}>
                These item numbers were merged with other rows during duplicate detection. No items were lost — the quantities were combined into the surviving row.
              </div>
              <div style={{color:"#d9f99d",fontSize:11,fontFamily:"ui-monospace,Menlo,Consolas,monospace"}}>
                {dedupGaps.slice(0,30).map(g=>{const s=consumedToSurvivor[String(g)];return s?.survivorItemNo?`Item ${g} → merged with item ${s.survivorItemNo}`:`Item ${g} → duplicate consolidated`;}).join(" · ")}
              </div>
            </div>
          )}
          {aiGaps.length>0&&(
            <div style={{marginTop:10,padding:"8px 12px",background:"#3a0a0a",border:"1px solid #ef444488",borderRadius:6}}>
              <div style={{color:"#fca5a5",fontWeight:700,fontSize:11,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>⚠ Missing BOM Line Items ({aiGaps.length})</div>
              <div style={{color:"#fecaca",fontSize:11,marginBottom:8,lineHeight:1.5}}>
                The following drawing item numbers were not found in the extracted BOM. These items may have been missed by the AI scan. <strong>Spot-check the drawing to verify whether these items exist and add them manually if needed.</strong>
              </div>
              <div style={{color:"#fca5a5",fontSize:12,fontWeight:600,fontFamily:"ui-monospace,Menlo,Consolas,monospace"}}>
                Missing items: {aiGaps.slice(0,30).join(", ")}{aiGaps.length>30?` (+${aiGaps.length-30} more)`:""}
              </div>
              <div style={{color:"#fecaca",fontSize:10,marginTop:6}}>
                Extracted {r.finalItemCount||0} items · highest item # is {r.finalMaxItemNo||"?"} · {aiGaps.length} gap{aiGaps.length>1?"s":""}
              </div>
            </div>
          )}
          </>);})()}
```

**What changed:**
- Split into two separate boxes: green "Duplicates Consolidated" (dedup-caused)
  and red "Missing BOM Line Items" (AI-miss). They show independently.
- Dedup box: green border/text, "merged with item N" per-gap. Non-alarming — no
  spot-check suggestion, because no data was lost.
- AI-miss box: unchanged red border, same "spot-check the drawing" language.
- D3 is satisfied: re-extract suggestion only appears in the AI-miss context.

---

## Phase Boundaries

| Phase | Sites | Can ship independently? | Risk |
|-------|-------|------------------------|------|
| **Phase 1** (dedup instrumentation) | 1A-1C, 2A-2B, 3A-3B | Yes — adds data to extractionReport, no UI change. Existing UI ignores the new `exactMerges` field. | Zero — additive data only. |
| **Phase 2** (render rewrite) | 4A-4C | Only after Phase 1 — needs `exactMerges` in extractionReport. | Low — UI change only, reads existing + new data. |

**Recommendation:** Ship both phases in one commit. Phase 1 alone is safe but
useless without Phase 2. The total change is ~41 LOC and should be reviewed as
one coherent unit.

---

## §7 — Five-Case Test Matrix

### Test 1: Pure dedup gap (exact merge)

**Setup:** Extract a BOM where two rows share the same part number but different
itemNo values — the AI returned the same row from two overlapping regions.

**Expected:** Exact dedup merges them. The gap shows as "Item N → merged with
item M" in green, NOT red "AI missed."

**How to verify:** Open the panel's Scan Results banner → expand → look for the
green "Duplicates Consolidated" box. Check `extractionReport.exactMerges` in
Firestore — should contain the merge record.

**Production candidate:** PRJ402109 (592273 item originally merged by prompt
instruction; with F-1d.8 shipped, re-extract should now split them — but if any
exact-dedup merges remain, they'll appear here).

### Test 2: Pure AI miss (no merge involved)

**Setup:** Extract a BOM that has a genuine sequence gap (AI failed to read a row).

**Expected:** The gap shows as "Not found in extraction" in red, with "spot-check
the drawing" language — identical to current behavior.

**How to verify:** Open Scan Results banner → expand → look for the RED "Missing
BOM Line Items" box. Confirm green box is absent (no merges) or separate.

**Production candidate:** Any panel with known AI misses (check recent extractions
for `finalSequenceGaps` in Firestore with no corresponding merge records).

### Test 3: Mixed — some gaps from dedup, some from AI miss

**Setup:** Extract a BOM that has BOTH a dedup-caused gap AND a genuine AI miss.

**Expected:** Two separate boxes in expanded details: green "Duplicates
Consolidated" for dedup gaps, red "Missing BOM Line Items" for AI gaps. The
concern pill shows two separate concern entries.

**How to verify:** Both boxes visible. Green box lists dedup gaps with "merged
with item N." Red box lists AI gaps with "not found in extraction." Neither box
mentions the other's gaps.

### Test 4: Gapless fuzzy merge (the #59 / architecture-proving case)

**Setup:** Extract a BOM where fuzzy merge fires but does NOT leave a sequence
gap — both merged rows had the same itemNo (or the consumed row's itemNo didn't
create a gap in the sequence).

**Expected:** The concern pill shows "N OCR duplicates auto-merged" (existing
fuzzy merge message, line 21857). NO "missing items" message. The gap detection
finds no gaps because no itemNos are missing from the sequence.

**Why this matters:** This proves the architecture is correct. If we only keyed
off gap detection, this merge would be invisible. The fuzzy merge message (which
already exists) surfaces it. The new code doesn't break this case — it only adds
correlation for gaps that DO exist.

**How to verify:** Open Scan Results banner → concern pill says "N OCR duplicates
auto-merged." Expand → see the existing "OCR Duplicates Merged" table (lines
21903-21933). NO red "Missing BOM Line Items" box. NO green "Duplicates
Consolidated" box (because there are no gaps to correlate).

**Production candidates:** PRJ402091, PRJ402083, PRJ402093, PRJ402079 (the 4
panels from TODO #59 with fuzzy merges + no gaps).

### Test 5: Re-extract + feedback re-extract paths

**Setup:** Re-extract a panel that previously had dedup-caused gaps. Then trigger
a feedback re-extract on the same panel.

**Expected:** Both paths produce `exactMerges` in the updated `extractionReport`.
The Scan Results banner correctly classifies gaps on re-extracted data (same
behavior as first-extract).

**How to verify:** After re-extract: check `extractionReport.exactMerges` in
Firestore — should be populated. After feedback re-extract: check again — should
reflect the feedback path's merges. Banner renders correctly for both.

---

## Verification Sequence

1. **Marc implements** Phases 1+2 in one commit.
2. **Coach (me) verifies** §7 at runtime:
   - Test 4 first (architecture-proving case) — use PRJ402091 or another #59 panel.
   - Tests 1+2 (basic dedup vs AI miss classification).
   - Test 3 (mixed case).
   - Test 5 (re-extract paths).
3. **Jon field-verifies** on a real extraction workflow.
4. **Deploy** after all 5 tests pass.

---

## LOC Summary

| Site | Description | LOC |
|------|-------------|-----|
| 1A | First-extract exact dedup instrumentation | +1 (add `exactMerges` array + push) |
| 1B | Thread into mergeStats return | +1 (add `exactMerges` to object) |
| 1C | Thread into extractionReport | +1 |
| 2A | Re-extract exact dedup instrumentation | +1 |
| 2B | Thread into re-extract report | +1 |
| 3A | Feedback re-extract exact dedup instrumentation | +2 (also add itemNo extraction) |
| 3B | Thread into feedback report | +1 |
| 4A | Build merge correlation map | +4 |
| 4B | Rewrite concern pill | +4 (replace 4 lines with 4) |
| 4C | Rewrite expanded details | +19 (replace 12 lines with ~24) |
| **Total** | | **~35 net LOC** |

---

## Edge Cases

### Gap itemNo appears in BOTH exact and fuzzy merge reports

Exact dedup runs before fuzzy. If a row is consumed by exact dedup, it never
reaches fuzzy dedup. So the same itemNo can't appear in both. No conflict.

### Consumed row has no itemNo (fallback wording)

If `droppedItemNo` is empty string, `consumedToSurvivor[g]` won't match (the gap
is a number, the dropped key is ""). The gap falls through to AI-miss. This is
conservative — if we can't prove a merge caused the gap, we don't claim one did.

For fuzzy merges where `droppedItemNo` is empty: same behavior. The merge still
shows in the existing "OCR Duplicates Merged" table (line 21903), but the gap
won't get the "merged with" label. This matches D1's fallback: "Duplicate
consolidated" only when survivor ID isn't available — and in this case, the gap
wasn't provably caused by that merge.

### extractionReport from before this fix (no `exactMerges` field)

`r.exactMerges||[]` returns `[]`. All gaps fall through to AI-miss (current
behavior). Backwards-compatible — no migration needed.

### Multiple items consumed into the same survivor

Exact dedup can merge 3+ rows with the same key into one. Each push creates a
separate entry in `exactMerges`. The correlation map overwrites
`consumedToSurvivor[droppedItemNo]` for each — but the survivor is the same
for all of them, so the last write is correct.

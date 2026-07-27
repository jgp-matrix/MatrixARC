# F068 Near-Miss Cross-Propagation — Build-Ready Plan

**Author:** Sam Wize (Coach, scope) · **Orchestrated-by:** Freddy Lyst · **Date:** 2026-07-27 · branch `claude/f068-cross-propagation` · base v1.24.36
**Origin:** F068 re-verify on Test V.055 (PRJ402142) — cross on Line 4 propagated to Lines 2/3 but skipped Line 1. Root cause CONFIRMED (Freddy, live read-only + branch code): a **manufacturer-prefix / part# normalization gap**, not an F068 logic bug. Line 1 stored `partNumber:"1492-D2Cxxx"` (+ separate `manufacturer:"Allen-Bradley"`); Lines 2/3/4 stored the part pre-cross as `"AB 1492-D2Cxxx"` (the "AB" mfr abbrev baked INTO the part# string). `normPart` strips only `\s`/`-`/`.`, not letters → keys `1492D2CXXX` ≠ `AB1492D2CXXX` → genuine non-match, correctly excluded by the exact-key scan.
**Jon decisions (LOCKED 2026-07-27):** (1) fix = **surface the near-miss in the F068 prompt** for explicit per-row opt-in (do NOT globally change the `_samePartKey`/`normPart` SSOT predicate); (2) **hold F068** and ship it bundled with this near-miss fix.
**Status:** BUILD-READY pending Jon's 2 open-question answers (§Open questions) + a Coach code-review after build. Money-path (save + price + part# mutation).

---

## 1. Loose-match predicate (reuse curated mfr tokens — NOT a blind prefix strip)

Reject "strip any leading short alpha token" (conflates legit PNs like `SE 9007…`). Instead use the **closed, curated manufacturer-token set already in the codebase**:
- `BC_MFR_MAP` (`src/app.jsx:5388`) — includes `'a-b'`, `'a/b'`, `'ab '`, `'ch '`, `'c-h'`, …
- `_MFR_ALIASES` (`:6561`) — `"AB"→"ALLEN-BRADLEY"`, `"GE"`, `"ABB"`, `"SIEMENS"`, `"ROCKWELL"`, …

**Rule:** strip a **single leading whitespace-delimited token** from the RAW part# **only if** that token (uppercased, `.`/`-`/`/` removed) is in the mfr-token set; then `normPart` the remainder. Compare loose keys on both sides → inherently symmetric (prefix can be on oldA OR the target). Must split on whitespace in the RAW string BEFORE `normPart` collapses delimiters (the space is unrecoverable post-normalize).

New pure helpers next to `normPart`/`_samePartKey` (`~:52391`–:52399) — one definition, SSOT-consistent, do NOT modify `_samePartKey`:

```js
let _mfrTokenSet=null;
function _getMfrTokenSet(){
  if(_mfrTokenSet)return _mfrTokenSet;
  const s=new Set();
  const norm=t=>String(t||"").toUpperCase().replace(/[.\-\/\s]/g,"");
  try{
    (typeof BC_MFR_MAP!=="undefined"?BC_MFR_MAP:[]).forEach(e=>{e.terms.forEach(t=>{if(!/\s/.test(t.trim())){const n=norm(t);if(n.length>=2)s.add(n);}});});
    if(typeof _MFR_ALIASES!=="undefined")Object.keys(_MFR_ALIASES).forEach(k=>{if(!/\s/.test(k.trim())){const n=norm(k);if(n.length>=2)s.add(n);}});
  }catch(e){}
  _mfrTokenSet=s;return s;
}
function _loosePartKey(pn){
  const raw=(pn||"").trim();
  if(!raw)return"";
  const m=raw.match(/^(\S+)\s+(\S.*)$/);
  if(m){
    const tok=m[1].toUpperCase().replace(/[.\-\/]/g,"");
    if(_getMfrTokenSet().has(tok))return normPart(m[2]);
  }
  return normPart(raw);
}
function _isNearMissPart(a,b){
  const la=_loosePartKey(a),lb=_loosePartKey(b);
  return !!la&&la===lb&&_samePartKey(a)!==_samePartKey(b); // loose-equal but NOT exact-equal
}
```

Lazy-memoized (order-safe). PRJ402142 check: oldA `"AB 1492-D2Cxxx"`→loose `1492D2CXXX`; Line 1 `"1492-D2Cxxx"`→loose `1492D2CXXX`; exact keys differ → **near-miss TRUE**. Lines 2/3 exact-match oldA → stay exact.

**False-match risk (documented, accepted):** a 2-char code that is genuinely a PN prefix could loose-collapse onto an unrelated row. Contained: near-miss rows are **opt-in, default OFF**, shown with a visible "formatted differently: X vs Y" diff, never swept silently. **Known limitation:** multi-word baked-in prefixes (`"ALLEN BRADLEY 1492…"`) NOT handled (first-token split only) → follow-up.

## 2. `_findCrossPropagationTargets` (`:28154`)

At the per-row filter (`:28162`), replace the single exact-key skip:
```js
const _exact=_samePartKey(r.partNumber)===key;
const _near =!_exact&&_isNearMissPart(r.partNumber,oldPartA);
if(!_exact&&!_near)return;
```
Keep all other exclusions (source row, labor/`_isExcludedFromPriceCheck`, F5 ECO-base). Add to the pushed object:
```js
nearMiss:_near,
nearMissReason:_near?`"${(r.partNumber||"").trim()}" vs "${(oldPartA||"").trim()}"`:undefined,
```
Exact rows carry `nearMiss:false` → identical downstream behavior.

## 3. Prompt/modal UX (`:32646`–:32718)

New sibling state near `crossPropPrompt` (`:25610`): `const [crossPropNearSel,setCrossPropNearSel]=useState(()=>new Set());` — reset to EMPTY (all OFF) on prompt open (`~:28216`) and on every close.

Render inside the existing modal `<div>` (no new root → no Fragment-Rule risk):
- `exactRows = otherRows.filter(r=>!r.nearMiss)` → render as today, bundled, no checkbox.
- `nearRows = otherRows.filter(r=>r.nearMiss)` → distinct bordered section, header "Possible matches — part# formatted differently (opt in per Line):", each with a checkbox (bound to `crossPropNearSel`, **default OFF**), the amber `⚠ Part# formatted differently: {partNumber} vs {oldPartA}` note (reuse existing `#fbbf24`/`#f59e0b` styles), plus the current-values + qty-differs line.
- Headline count = exact matches; if near rows, append "(plus M possible match(es) formatted differently below)".

`[Cross all]` onClick (`:32696`–:32705): change `targetRowIds` to include all exact + only checked near-miss:
```js
const _sel=cp.otherRows.filter(r=>!r.nearMiss||crossPropNearSel.has(r.rowId));
// targetRowIds:new Set(_sel.map(r=>r.rowId))
```
Everything else (LT-timing `_freshPatch` rebuild from `latestPanelRef`, `kind:"cross"`, `capturedProjectId`) stays.

## 4. Write path — CRITICAL correctness point (`propagatePartAcrossPanels :40257`)

Per-row guards `:40273`–:40278. Line **`:40277 if(_samePartKey(row.partNumber)!==key)return row;`** re-rejects near-miss rows (their key ≠ key(oldA)) → silent no-op for exactly the rows the feature must fix. Make the defensive re-match near-aware **for `kind:"cross"` only** (exact-match kinds F065/F067 untouched):
```js
const _matchOk=_samePartKey(row.partNumber)===key||(kind==="cross"&&_isNearMissPart(row.partNumber,partNumber));
if(!_matchOk)return row;
```
- Primary selection stays `targetRowIds` (`:40276`) — near-miss rows chosen by the explicit user-approved id set, not by key re-match.
- `:40277` stays as defense-in-depth: for `kind:"cross"` admits exact-OR-near to oldA, so a stale `targetRowIds` still can't write to a truly unrelated row.
- The `kind==="cross"` stamping branch (`:40311`–:40329) runs unchanged (additive: `partNumber=B, bcNo, isCrossed, crossedFrom=A, bcVerify:in-bc, manufacturer=B, bcVendorNo:""`, clears correction flags, `confidence:high`), correctly placed BEFORE the empty-patch bail (`:40330`).

## 5. Data safety
Identical additive `{...row,...rowPatch}` spread as exact targets — all flags preserved (qty, techReview*, ecoTag, customerSupplied, notes, confidence); only part#/bcNo/isCrossed/crossedFrom/bcVerify + price/LT/vendor-name overlaid; single `safeSave` (`:40349`); owner-priority + async/multi-project ownership (`capturedProjectId` re-checked `:40263`/`:40347`) intact.

## 6. Blast radius / F065 (flagged, NOT expanded)
F065 `buildCrossLineDuplicates` (`:52404`) keys by exact `_samePartKey` → same gap (groups the AB-lines, treats Line 1 separate). **This fix does NOT change F065's auto price/LT gap — left as documented follow-up, per Jon scoping to the F068 prompt.** Incidental self-heal: once Line 1 is opted into the near-miss cross its `partNumber` becomes B, so the next `buildCrossLineDuplicates` rebuild inside `propagatePartAcrossPanels` (`:40339`) groups it going forward. No F065 code touched.

## 7. Build order
1. `_getMfrTokenSet`/`_loosePartKey`/`_isNearMissPart` helpers (`~:52399`).
2. `_findCrossPropagationTargets` near-miss collection + tags (`:28162`).
3. `crossPropNearSel` state + reset-on-open (`:25610`/`~:28216`).
4. Modal — exact/near split, per-row checkboxes, amber diff note (`:32651`/`:32671`).
5. `[Cross all]` onClick — `targetRowIds` filtered by `crossPropNearSel` (`:32704`).
6. `propagatePartAcrossPanels` near-aware defensive re-match for `kind:"cross"` (`:40277`).
No new prop plumbing.

## 8. Gates & test repro
Gates: `node validate_jsx.js`, `tools/check-syntax.sh`, `tools/check-scope.js`, `tools/review.sh` on the diff. JSX Fragment Rule: near-miss section nests in the existing modal div — no new root.
Repro (PRJ402142 shape): A on 4 Lines, Line 1 `"1492-D2Cxxx"`, Lines 2/3/4 `"AB 1492-D2Cxxx"`. Cross A→B on Line 4:
- Prompt lists Lines 2/3 exact (bundled) + Line 1 near-miss (separate, checkbox OFF) with amber diff.
- Check Line 1 → [Cross all]: Lines 2/3 AND Line 1 become B (full set), red cleared, qty/techReview/ecoTag preserved, persists on reload.
- Leave Line 1 unchecked → [Cross all]: only Lines 2/3 crossed.
- False-match negative: unrelated `"SE 9007…"` must NOT appear as near-miss.
- Exact-unchanged regression: all-identical-format cross still bundles, no near-miss section.

## Open questions for Jon
1. **[Cross all] label** with near-miss rows present — keep "Cross all" (+ count), or relabel "Cross selected"? (Coach rec: keep "Cross all"; exact bundled, near-miss explicit opt-in.)
2. **Multi-word baked-in mfr prefixes** (`"ALLEN BRADLEY 1492…"`) — OK to leave as documented follow-up (v1 = single-token only)? (Coach rec: yes.)

**Verdict:** build-ready; spine additive; single load-bearing point is the §4 `:40277` near-aware re-match. `_samePartKey`/`normPart` untouched.

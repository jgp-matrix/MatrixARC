# Noisy-PN Guard: F1 + C5 Combined Scope

**Author:** Sam Wize (Coach), Senior Development Engineer, Architecture
**Date:** 2026-06-09
**Status:** Scoping document. No build. Next build after Marc's B2/B1/F3/F2 trust fixes.

---

## Problem Statement

Two independent paths silently convert a noisy/OCR-corrupted part number into a
wrong-but-valid part number, then stamp it green so every downstream gate passes:

| Path | Mechanism | Example (from PRJ402107) |
|------|-----------|------------------------|
| **C5: Auto-cross** | `applyLearnedCorrections` matches PN against learning DB, auto-replaces with `autoReplace:true` alternate | `3038338` (correct, 1-level terminal) → `3214259` (wrong, multi-level terminal). Both valid Phoenix Contact PNs. |
| **F1: BC fuzzy match** | `bcFuzzyLookup` strategy 2-5 matches noisy PN against BC catalog, auto-accepts single fuzzy match with valid price | `RH8B-ULC` (OCR error, B/8 swap) matches a different relay family in BC with a valid price and vendor. |

Both paths: wrong PN → valid price → valid priceDate → `bcVerify.status:"in-bc"` →
green row → send-gate passes → customer receives quote with wrong parts.

**Root cause:** Neither path checks extraction quality. Both treat vision-mode OCR output
with the same trust as text-layer deterministic extraction.

**Why this blocks unsupervised Sales:** Training doesn't catch it. The row looks correct.
The price looks correct. The BC match looks correct. The only signal that something is
wrong is the original amber chip in the BOM view — which B1 now gates send on, but
doesn't prevent the wrong price from being accepted in the first place.

---

## What exists today (relevant infrastructure)

### bcFuzzyLookup (app.jsx:4739)

Returns `{match, type, suggestions}` where:
- `type` ∈ `{"exact", "fuzzy", "fuzzy-normalized", null}`
- **`type` is NEVER READ by any caller.** The field exists, is computed correctly, and is
  discarded. This is the key leverage point — the infrastructure is already there.

**5 strategies in order:**

| # | Strategy | Match type returned | Risk level on noisy PN |
|---|----------|-------------------|----------------------|
| 1 | Exact `number` lookup | `"exact"` | SAFE — exact match means PN is right |
| 2 | Stripped (remove `-`, ` `, `.`, `/`) | `"fuzzy"` | LOW — only catches formatting diffs |
| 3 | Contains search on original PN | `"fuzzy"` | MEDIUM — substring match can hit wrong item |
| 4 | Core substring (strip mtx/rev prefixes) | `"fuzzy"` | MEDIUM — shorter search string = more false matches |
| 5 | Normalized prefix (first 5 chars, stripped) | `"fuzzy-normalized"` | **HIGH** — 5-char prefix on a noisy PN is unreliable |

**Current behavior at the pricing call site (app.jsx:25705-25712):**
```javascript
const result = await bcFuzzyLookup(pn);
if(result.match && result.match.unitCost != null){
  // Auto-accept. No type check. No quality check.
  bcMap[String(row.id)] = {unitPrice: result.match.unitCost, ...};
}
```

Same pattern in `runPricingBackground` (line 14349-14356). Both auto-accept.

### applyLearnedCorrections (app.jsx:10331-10410)

Fires on ALL THREE extraction paths (initial, re-extract, feedback re-extract) PLUS
on panel open (useEffect at line 22830).

**Auto-cross path (lines 10364-10368):**
```javascript
if(!r.isCrossed){
  const alt = userAlts.find(a => a.autoReplace && a.replacement && _altMatchesPN(a, pn));
  if(alt){
    return {...r, partNumber: alt.replacement.partNumber, confidence: "high", ...};
  }
}
```

**Zero quality checks.** No `manualVerifyRequired`, no `confidence`, no extraction tier.
The function receives `(bom, uid)` — it has no access to the panel or extractionReport.

**`_altMatchesPN` (line 2060-2064):** Exact match OR normalized match (strips
`[-\s_./\\,]`, uppercases). On a noisy PN, the normalization can match a different
learning DB entry than intended.

**Overwrites `confidence` to `"high"`** — even if the original extraction confidence
was `"medium"` due to confusable glyphs. The quality signal is not just invisible
downstream; it's actively erased.

### What runPricingOnPanel sees

`runPricingOnPanel` (app.jsx:25623) does NOT receive `panel.extractionReport`. It
accesses BOM rows from React state but never reads extraction quality signals. Neither
does `runPricingBackground` (app.jsx:14311). Neither does `bcFuzzyLookup` (app.jsx:4739)
— it accepts only `partNumber`.

**The extraction quality wall:** Extraction quality signals flow to the BOM view UI
(display layer) but never reach the pricing layer, the BC lookup layer, or the learning
DB application layer. This is the architectural gap.

---

## Guard Design

### Principle

Convert auto-apply to user-review when extraction quality is low. Don't hard-block — 
surface the match/cross for confirmation so Sales can accept or reject.

### Signal: when to activate the guard

The guard activates when `panel.extractionReport?.manualVerifyRequired === true`.

This is already set by the Phase 1c gate for:
- Vision-mode (vector-stroke/bitmap/scan) + no region → Case 4
- No-PDF → Case 5

After B2 ships, the flag survives re-extraction. This is the single gating signal for
both F1 and C5 guards.

**Why not also check per-row `confidence`?** Per-row confidence is a finer-grained
signal, but it's OVERWRITTEN to `"high"` by auto-cross (line 10368). Using it as a guard
would create an order-of-operations dependency (guard must run before auto-cross, but
auto-cross runs first). `manualVerifyRequired` is panel-level and immune to row-level
mutations.

### Guard 1: BC fuzzy match hold (F1)

**Location:** `runPricingOnPanel` line 25705-25712 and `runPricingBackground` line
14349-14356.

**Current behavior:** Single fuzzy match → auto-accept price + PN substitution.

**Guarded behavior:** When `manualVerifyRequired` is true AND `result.type !== "exact"`:
- Do NOT auto-accept the match
- Store as suggestion: `fuzzySugg[String(row.id)] = [result.match]`
- Row stays unpriced → red highlighting → send-gate blocks
- User sees the fuzzy suggestion in the UI, reviews, and accepts or rejects

**When `manualVerifyRequired` is false:** Current behavior unchanged. Exact matches
always auto-accept regardless.

**Implementation sketch (both call sites):**
```javascript
const result = await bcFuzzyLookup(pn);
if(result.match && result.match.unitCost != null){
  const isExact = result.type === "exact";
  const needsReview = !isExact && _manualVerifyRequired;
  if(needsReview){
    // Hold for user review instead of auto-accepting
    fuzzySugg[String(row.id)] = [result.match];
  } else {
    bcMap[String(row.id)] = {unitPrice: result.match.unitCost, ...};
  }
} else if(result.suggestions.length > 0){
  fuzzySugg[String(row.id)] = result.suggestions;
}
```

**Threading `_manualVerifyRequired` to the pricing path:**

Both pricing functions need access to the panel's extraction report. Options:

| Option | Mechanism | Invasiveness |
|--------|-----------|-------------|
| A | Pass `panel.extractionReport?.manualVerifyRequired` as a new parameter to `runPricingOnPanel` and `runPricingBackground` | LOW — add one boolean param |
| B | Read from `panel` directly inside `runPricingOnPanel` (it's in the React closure) | ZERO — panel is already accessible via closure |
| C | Stamp `manualVerifyRequired` on each BOM row during extraction, read per-row | HIGH — proliferates the flag to every row |

**Recommendation: Option B** for `runPricingOnPanel` (panel is in the React closure).
**Option A** for `runPricingBackground` (receives `panelData` as parameter — read
`panelData.extractionReport?.manualVerifyRequired`).

### Guard 2: Auto-cross freeze (C5)

**Location:** `applyLearnedCorrections` line 10364-10368.

**Current behavior:** Auto-replace alternates unconditionally when `autoReplace:true`
and `!r.isCrossed`.

**Guarded behavior:** When `manualVerifyRequired` is true:
- Skip auto-replace for alternates (Path 1, lines 10364-10368)
- DO still apply corrections (Path 2, lines 10376-10382) — these fix known extraction
  errors, which is exactly what you want on noisy extraction
- DO still apply part library corrections (Path 3) — same reasoning
- DO still apply description crosses (Path 4) — blank PNs need filling regardless
- Log held-back alternates so the user sees "N learned crosses available — review"

**Implementation sketch:**
```javascript
// Inside applyLearnedCorrections, add manualVerifyRequired parameter
async function applyLearnedCorrections(bom, uid, opts = {}){
  const { manualVerifyRequired = false } = opts;
  // ...existing loading code...
  
  const heldBackAlternates = [];
  const result = bom.map(r => {
    // ...existing guards...
    
    // Path 1: Auto-replace alternates
    if(!r.isCrossed){
      const alt = userAlts.find(a => a.autoReplace && a.replacement && _altMatchesPN(a, pn));
      if(alt){
        if(manualVerifyRequired){
          // FREEZE: don't auto-replace, surface for review
          heldBackAlternates.push({rowId: r.id, from: pn, to: alt.replacement.partNumber});
          // Don't return — fall through to other correction types
        } else {
          appliedLog.push({...});
          return {...r, partNumber: alt.replacement.partNumber, ...};
        }
      }
    }
    
    // Paths 2-4 unchanged — corrections still apply
    // ...
  });
  
  return {bom: result, appliedLog, heldBackAlternates};
}
```

**Call sites (3 + 1):**

| Call site | Location | Has access to manualVerifyRequired? |
|-----------|----------|-----------------------------------|
| Initial extraction | line 14017 | YES — `panel._manualVerifyRequired` is set at this point |
| Re-extraction | line 24291 | YES — after B2, `latestPanelRef.current.extractionReport?.manualVerifyRequired` |
| Feedback re-extraction | line 24522 | YES — same as above |
| Panel open useEffect | line 22830 | YES — `panel.extractionReport?.manualVerifyRequired` |

All four call sites can pass the flag. The initial extraction path uses
`panel._manualVerifyRequired` (the transient flag from the 1c gate). The other three
read from the persisted `extractionReport.manualVerifyRequired`.

### Guard 3: Store bcMatchType on row (new field)

**Purpose:** Preserve the match type so downstream systems (and future guards) know
whether this price came from an exact or fuzzy BC match. Currently, once a fuzzy match
is accepted, no record remains.

**Field:** `bcMatchType: "exact" | "fuzzy" | "fuzzy-normalized" | null`

**Set in:** The bcMap construction at lines 25706-25709 and 14349-14356:
```javascript
bcMap[String(row.id)] = {
  ...existing fields...,
  bcMatchType: result.type,
};
```

**Applied to row in:** The bcMap spread at line 25738-25754 and equivalent background path.

**Consumed by:**
- `bcVerify` stamping (lines 26120-26138): Could distinguish `"in-bc-exact"` vs
  `"in-bc-fuzzy"` for richer UI badges
- Future audit queries: "show me all rows that were fuzzy-matched"
- The F1 guard itself: if `manualVerifyRequired` is later cleared (user verified the BOM),
  rows that were already fuzzy-matched and accepted retain the provenance

**This is additive, not gating.** It enriches the data model without changing behavior.
Implement alongside the guards or independently.

---

## Interaction with existing fixes

### Dependency on B2 (manualVerifyRequired survives re-extraction)

The guards key off `manualVerifyRequired`. If B2 hasn't shipped, feedback re-extraction
clears the flag and the guards deactivate. **B2 must ship first.**

### Dependency on B1 (send-gate checks manualVerifyRequired)

B1 ensures send is blocked when `manualVerifyRequired` is true. The F1 guard additionally
ensures that fuzzy-matched rows stay unpriced (red) when the flag is set, so the
send-gate has TWO reasons to block: the flag itself (B1) AND missing prices on held-back
rows. Belt and suspenders.

### Interaction with the P&ID label fix (carry-forward from C36/C37)

No interaction. Independent cosmetic fix.

### Interaction with Phase 1d (no-PDF/0-byte lazy detection)

Phase 1d sets `manualVerifyRequired` for Case 5 (no-pdf). The guards activate for
those extractions too. No conflict — correct behavior.

---

## What this does NOT solve

1. **Exact-match wrong PN.** If the OCR error happens to produce a PN that exactly
   matches a DIFFERENT BC item (exact match, not fuzzy), the guard doesn't fire. This
   is rare — exact accidental collisions require the wrong PN to be a real item number —
   but not impossible. The only defense is the per-row snippet self-correction
   (`selfCorrectBomRowsWithSnippets`), which catches some OCR errors before pricing.

2. **Non-manualVerifyRequired extractions with noisy PNs.** If a text-layer BOM has a
   few noisy pages mixed in, `manualVerifyRequired` may not be set (the 1c gate checks
   the aggregate worst tier). Per-row confidence would catch this, but it's overwritten
   by auto-cross. This is a future refinement — activate the guard per-row when
   `confidence !== "high"`, but only after fixing the confidence-overwrite in auto-cross.

3. **Learning DB entries that are simply wrong.** The C5 corruption created learning DB
   entries from wrong data (e.g., BC description replacing catalog number). Those entries
   persist until manually deleted. The guard prevents them from auto-applying on
   manualVerifyRequired extractions, but they'll still auto-apply on text-layer
   extractions. A separate cleanup pass on the learning DB would address this.

---

## Sizing estimate

| Component | Lines of change | Risk | Notes |
|-----------|----------------|------|-------|
| F1: Hold fuzzy matches in pricing (both paths) | ~10 lines each (20 total) | LOW | Read one boolean, branch on it |
| C5: Freeze auto-cross in applyLearnedCorrections | ~15 lines | LOW | Add parameter, conditional skip, return held-back list |
| C5: Thread manualVerifyRequired to 4 call sites | ~4 lines | LOW | Pass boolean from existing state |
| Guard 3: bcMatchType field | ~6 lines | ZERO | Additive field, no behavior change |
| UI: Surface held-back alternates for review | ~30-40 lines | MEDIUM | New banner or per-row indicator in BOM view |
| UI: Distinguish fuzzy vs exact in bcVerify badge | ~10 lines | LOW | Cosmetic enhancement |
| **Total** | ~70-90 lines | LOW-MEDIUM | No new functions, no architectural changes |

**Estimated effort:** Small. The pricing path and auto-cross path are well-understood
(traced in this investigation). The changes are conditional branches in existing code,
not new pipelines. The riskiest part is the UI for surfacing held-back alternates — but
it can reuse the existing fuzzy-suggestions pattern (inline popup below part number).

---

## Test plan outline

### F1 guard

1. **Text-layer extraction (manualVerifyRequired=false):** Fuzzy BC match auto-accepts
   as before. No behavior change. Regression check.
2. **Vision-mode extraction (manualVerifyRequired=true), fuzzy match:** Single fuzzy
   match held as suggestion, NOT auto-accepted. Row stays unpriced (red). User sees
   suggestion, clicks to accept → price applies, row turns green.
3. **Vision-mode extraction, exact match:** Auto-accepts as before. Guard doesn't fire
   on exact matches. Regression check.
4. **Vision-mode extraction, multiple candidates:** Already stored as suggestions today.
   No behavior change.
5. **Vision-mode extraction, no match:** Already stays unpriced. No behavior change.

### C5 guard

1. **Text-layer extraction:** Auto-cross applies as before. No behavior change.
2. **Vision-mode extraction:** Auto-cross held back. User sees "N learned crosses
   available" banner. Corrections (Path 2/3) still apply. Description crosses (Path 4)
   still apply.
3. **Panel open with manualVerifyRequired:** Inline auto-apply (useEffect) also respects
   the guard. Held-back alternates surfaced.
4. **After user manually verifies and clears manualVerifyRequired:** Auto-cross applies
   on next extraction or panel open. (Note: clearing the flag is a new action that
   doesn't exist yet — scope for B1 follow-up or this effort.)

### bcMatchType field

1. **Exact match:** `bcMatchType:"exact"` stored on row.
2. **Fuzzy match:** `bcMatchType:"fuzzy"` stored.
3. **No match:** `bcMatchType:null` or absent.
4. **Verify field persists to Firestore and survives re-pricing.**

---

## Appendix: Code references

| Code | Location | Role in this scope |
|------|----------|-------------------|
| `bcFuzzyLookup` | app.jsx:4739-4836 | Returns `type` field (exact/fuzzy/fuzzy-normalized) — currently unused |
| Pricing call site (foreground) | app.jsx:25705-25712 | Where F1 guard inserts |
| Pricing call site (background) | app.jsx:14349-14356 | Where F1 guard inserts (same pattern) |
| bcMap application to rows | app.jsx:25738-25754 | Where bcMatchType field is added |
| `applyLearnedCorrections` | app.jsx:10331-10410 | Where C5 freeze inserts |
| `_altMatchesPN` | app.jsx:2060-2064 | Matching logic for learning DB alternates |
| `_altNorm` | app.jsx:2059 | Normalization for alternate matching |
| Auto-cross call sites | app.jsx:14017, 24291, 24522, 22830 | Where manualVerifyRequired is threaded |
| `bcVerify` stamping (foreground) | app.jsx:26120-26138 | Where bcMatchType could enrich status |
| `bcVerify` stamping (background) | app.jsx:14459-14472 | Same |
| Fuzzy suggestions UI | app.jsx:27546-27630 | Existing pattern to reuse for held-back matches |
| `findIncompleteQuoteItems` | app.jsx:15107 | Send-gate — B1 adds manualVerifyRequired check here |

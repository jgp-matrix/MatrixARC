# #192 BUDGETARY Auto-Setter Fix Verification

**Author:** Sam Wize (Coach)  
**Date:** 2026-07-01  
**Version:** v1.21.19 (code a30d975c, release b9a7bc5a)  
**Scope:** Widened auto-setter gate from `leadTimeSource==="ai"` to full `_isBomRowFlaggedRed`  
**Verdict:** PASS — all 5 checks confirmed

---

## 1. ALL SITES UPDATED — CONFIRMED

Old function names `_hasAiLeadTimes`, `_countAiLeadTimes`, `_markProjectBudgetaryForAiLeads`
are **completely gone** (grep returns 0 matches). New names at all expected sites:

### Definitions (3)

| # | Line | Old | New |
|---|------|-----|-----|
| 1 | 1540 | `_hasAiLeadTimes` | `_hasRedRows` |
| 2 | 1546 | `_countAiLeadTimes` | `_countRedRows` |
| 3 | 1552 | `_markProjectBudgetaryForAiLeads` | `_markProjectBudgetaryForRedRows` |

### Window debug exports (3)

| # | Line | Status |
|---|------|--------|
| 4 | 1579 | `window._hasRedRows` ✓ |
| 5 | 1580 | `window._countRedRows` ✓ |
| 6 | 1581 | `window._markProjectBudgetaryForRedRows` ✓ |

### Send path — QuoteSendModal (3)

| # | Line | What |
|---|------|------|
| 7 | 32855 | Gate: `_countRedRows(project)` ✓ |
| 8 | 32857–32864 | Dialog text: "items with incomplete pricing or lead time data" ✓ |
| 9 | 32874 | Mark call: `_markProjectBudgetaryForRedRows(project)` ✓ |

### Auto-revert useEffect (2 + dialog text)

| # | Line | What |
|---|------|------|
| 10 | 37201 | Gate: `_hasRedRows(cur)` ✓ |
| 11 | 37214 | Debounce guard: `_hasRedRows(latest)` ✓ |
| — | 37216–37218 | Dialog text: "All items … complete pricing and firm lead times (no red rows)" ✓ |

### Print path — handlePrintQuote (3 + checklist)

| # | Line | What |
|---|------|------|
| 12 | 37518 | Gate: `_hasRedRows(projectRef.current)` ✓ |
| 13 | 37521 | Admin count: `_countRedRows(projectRef.current)` ✓ |
| — | 37523 | Admin dialog: "items with incomplete pricing or lead time data" ✓ |
| 14 | 37530 | Mark call: `_markProjectBudgetaryForRedRows(projectRef.current)` ✓ |

### Pre-print checklist (count + label)

| # | Line | What |
|---|------|------|
| — | 37545 | Count: `_countRedRows(projectRef.current)` ✓ |
| — | 37549 | Label: "items with incomplete pricing or lead times" ✓ |
| — | 37550 | Detail: "red rows are resolved (firm price + lead time)" ✓ |

### Unchanged (correct):

- `_clearAutoBudgetary` — not renamed (operates on sentinel, which was kept) ✓
- `_hasArcAutoBudgetary` — not renamed (same reason) ✓
- Both still exported at lines 1582–1583 ✓

### DECISION comments:

All 5 DECISION comment blocks updated with `#192 widened 2026-07-01` annotation:
lines 1527, 32850 (send), 37192 (auto-revert), 37512 (print gate), 37543 (checklist).

**Rename is complete and consistent. No stale references remain.**

---

## 2. PREDICATE CORRECTNESS — CONFIRMED

### `_hasRedRows(project)` (line 1540):

```js
function _hasRedRows(project){
  const cNo=project?.bcCustomerNumber, cName=project?.bcCustomerName;
  return (project?.panels||[]).some(p=>
    (p.bom||[]).some(r=>_isBomRowFlaggedRed(r,cNo,cName))
  );
}
```

- Extracts `bcCustomerNumber` and `bcCustomerName` from the project ✓
- Threads both through to `_isBomRowFlaggedRed(r, cNo, cName)` ✓
- Iterates all panels and all BOM rows ✓

### `_countRedRows(project)` (line 1546):

Same pattern with `.reduce()` + `.filter()` for counting ✓

### `_isBomRowFlaggedRed` captures ALL red reasons (line 15807–15819, UNCHANGED):

| Condition | Line | ✓ |
|-----------|------|---|
| `qty === 0` (non-CS) | 15810 | ✓ |
| `unitPrice === 0` (non-CS, non-customer-vendor) | 15811 | ✓ |
| No `priceDate` | 15813 | ✓ |
| Stale `priceDate` (> `defaultStaleDays`) | 15814–15815 | ✓ |
| `!_hasFirmLeadTime(r)` | 15816 | ✓ |

### Excluded categories (all via `_isBomRowFlaggedRed`'s internal guards):

| Exclusion | How | Line | ✓ |
|-----------|-----|------|---|
| Labor rows | `if(!r\|\|r.isLaborRow)return false` | 15808 | ✓ |
| Customer-vendor (price/stale/LT checks) | `!vendorIsCustomer` guard on block | 15812 | ✓ |
| Customer-supplied | `!r.customerSupplied` (qty) + `_isExcludedFromPriceCheck` | 15810, 15812 | ✓ |
| Contingency | `_isExcludedFromPriceCheck` | 15812→15789 | ✓ |
| Buyoff/crate | `_isExcludedFromPriceCheck` → `_isBuyoffOrCrate` | 15812→15789 | ✓ |
| Matrix Systems vendor | `_isExcludedFromPriceCheck` | 15812→15789 | ✓ |

Note: `_hasRedRows` does NOT add its own `!r.isLaborRow` filter (the old `_hasAiLeadTimes`
had one). This is correct — `_isBomRowFlaggedRed` already excludes labor rows internally
at line 15808. No double-filtering needed.

**The predicate is the exact same function that drives BOM row background color (called at
line 28840). What's red in the UI is red in the auto-setter. Single source of truth.**

---

## 3. AUTO-REVERT SYMMETRY — CONFIRMED

The auto-revert useEffect (line 37198–37228) has three guards before clearing:

### Guard chain:

```
1. hasRed = _hasRedRows(cur)           [line 37201]
   └─ if(hasRed) → reset prompt gate, return early
                   (don't offer to clear while reds exist)

2. hasAutoBudg = _hasArcAutoBudgetary(cur)   [line 37202]
   └─ if(!hasAutoBudg) → return (no sentinel, nothing to clear)

3. _budgPromptShownRef.current         [line 37209]
   └─ if(shown) → return (one-shot gate, already prompted)

4. Debounced re-check                  [line 37214]
   └─ if(!latest || _hasRedRows(latest) || !_hasArcAutoBudgetary(latest)) → return
      (stale-state bail — red rows reappeared or sentinel was manually cleared)

5. User prompt                         [line 37215–37218]
   └─ if(!ok) → return (user declined)

6. _clearAutoBudgetary(latest)         [line 37221]
   └─ clears isBudgetaryAiAutoSet + isBudgetary on sentinel-marked panels
```

### No stuck-set path:

The useEffect fires on `_leadDriversSig` changes (any BOM row lead time/price change).
When the last red row is resolved:
- `hasRed` becomes false → falls through to guard 2
- `hasAutoBudg` is true (sentinel exists) → falls through to guard 3
- First time → `_budgPromptShownRef.current = true`, fires debounced prompt
- User approves → sentinel cleared

If the user DECLINES, the sentinel stays set — but `_budgPromptShownRef` prevents
re-prompting on the same transition. If red rows reappear and then resolve again,
line 37204 resets the prompt gate, enabling a fresh prompt. **No stuck path.**

### No premature-clear path:

Both guard 1 (`if(hasRed) → return`) and guard 4 (`_hasRedRows(latest)`) prevent
clearing while any row is still red. The double-check at guard 4 is inside the
debounced timeout — it catches race conditions where a row went red between the
outer check and the timer firing. **No premature clear.**

---

## 4. SENTINEL PRESERVED — CONFIRMED

### Field name `isBudgetaryAiAutoSet` — unchanged in all 4 functional uses:

| Use | Line | Code |
|-----|------|------|
| Set | 1558 | `isBudgetaryAiAutoSet:true` |
| Read guard | 1568 | `if(!pr.isBudgetaryAiAutoSet)return p` |
| Destructure-clear | 1570 | `const{isBudgetaryAiAutoSet:_a,...}=pr` |
| Check | 1576 | `(p.pricing\|\|{}).isBudgetaryAiAutoSet` |

### Legacy comment present:

Line 1538–1539:
> NOTE: the "Ai" in `isBudgetaryAiAutoSet` is LEGACY (kept to avoid a Firestore
> migration) — the trigger is now ALL red rows, not AI-only.

Line 1563:
> (Sentinel name "Ai" is legacy.)

**No migration needed. No new sentinel field. Existing Firestore data (`isBudgetaryAiAutoSet: true`
on previously-auto-set panels) continues to work without any change.**

---

## 5. #195 PRE-EXISTING — CONFIRMED, NOT INTRODUCED OR WORSENED

### The issue:

When an admin clicks "Print as Firm" (line 37527: `_skipBudgFlip = true`), the budgetary
flip is skipped (line 37529–37535). But the pre-print checklist (line 37545–37552) re-counts
red rows via `_countRedRows` and adds:

```js
{
  type:"ailead",
  label:`${redRowCount} items with incomplete pricing or lead times`,
  detail:"Quote auto-flagged BUDGETARY until these red rows are resolved (firm price + lead time).",
  checked:true,
}
```

This entry claims "Quote auto-flagged BUDGETARY" even though the admin just chose NOT to
flag it. The `_skipBudgFlip` variable is not consulted by the checklist block.

### Pre-existing:

The BEFORE code (pre-#192) had the exact same pattern:

```
BEFORE: const aiLeadCount = _countAiLeadTimes(projectRef.current);
        if(aiLeadCount > 0) { issues.push({type:"ailead", ...}); }
AFTER:  const redRowCount = _countRedRows(projectRef.current);
        if(redRowCount > 0) { issues.push({type:"ailead", ...}); }
```

Both are structurally identical — count → push, with no `_skipBudgFlip` consultation.
The disconnect between the admin override and the checklist entry has existed since
v1.19.1028 (when the admin override was added). #192 changed only the variable name
and the label/detail text.

**#192 did NOT introduce this. #192 did NOT worsen it** (the checklist entry's text
is now more accurate — "incomplete pricing or lead times" vs the old "AI-estimated lead
times" — but the structural disconnect is unchanged).

Correctly logged as #195, out of #192 scope.

### Minor cosmetic holdover:

Line 37548: `type:"ailead"` — the internal issue type string still says "ailead" from the
AI-only era. Not user-facing (it's a programmatic identifier for the checklist item type).
Harmless. Could be renamed to `"redrows"` in a future cleanup if desired.

---

## VERDICT: PASS

All 5 checks confirmed:

| Check | Status |
|-------|--------|
| 1. All 14 sites updated, old names gone | **PASS** |
| 2. `_hasRedRows` wraps `_isBomRowFlaggedRed` correctly with customer params | **PASS** |
| 3. Auto-revert symmetry: clears only when no reds, no stuck/premature paths | **PASS** |
| 4. Sentinel `isBudgetaryAiAutoSet` preserved, legacy comment present | **PASS** |
| 5. #195 checklist-after-skip is pre-existing, not introduced/worsened by #192 | **PASS** |

### Live-pending check:

Jon eyeball: open a project with red rows, attempt Print → confirm BUDGETARY auto-checked.
Open a project with zero red rows, attempt Print → confirm no auto-budgetary prompt.

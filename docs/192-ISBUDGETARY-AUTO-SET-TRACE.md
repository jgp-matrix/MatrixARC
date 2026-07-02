# #192 isBudgetary Auto-Set Regression — Code Trace

**Author:** Sam Wize (Coach)  
**Date:** 2026-07-01  
**Type:** Read-only code trace (no code changes)  
**Tip:** master (v1.21.15+)  
**Bug:** BUDGETARY used to auto-set when BOM had red rows; stopped weeks ago. Noah manually checks the box every time.

---

## 1. Does an Auto-Setter Still Exist?

**YES.** The entire auto-setter cluster is intact at lines 1527–1577, introduced in v1.19.740, **never modified since**.

| Component | Line | Purpose |
|-----------|------|---------|
| `_hasAiLeadTimes(project)` | 1535 | Gate: checks `leadTimeSource === "ai"` on non-labor BOM rows |
| `_countAiLeadTimes(project)` | 1540 | Count of AI-sourced lead time rows (for dialog text) |
| `_markProjectBudgetaryForAiLeads(project)` | 1545 | Sets `isBudgetary:true` + sentinel `isBudgetaryAiAutoSet:true` on each panel's pricing |
| `_clearAutoBudgetary(project)` | 1557 | Removes both flags (used by auto-revert) |
| `_hasArcAutoBudgetary(project)` | 1568 | Checks if auto-set sentinel is present |

### Call sites (both user-confirmed gates):

- **Print path** (line 37513): `if(_hasAiLeadTimes(projectRef.current))` → prompts admin or auto-flips budgetary
- **Send path** (line 32850): `if(aiCount > 0)` → prompts user, then marks budgetary or allows admin override

### Auto-revert (line 37192):
A `useEffect` watches for the transition where all AI leads are replaced with firm values. If the budgetary was auto-set (sentinel `isBudgetaryAiAutoSet`), it prompts the user to clear the flag. Guarded with a one-shot ref so it doesn't re-fire on every keystroke.

---

## 2. Why It's Not Firing

**The auto-setter gates on `leadTimeSource === "ai"`. Red rows gate on `!_hasFirmLeadTime(r)`. These are NOT the same condition.**

### `_hasFirmLeadTime(r)` (line 15771):
```js
return r.leadTimeDays != null && r.leadTimeSource && r.leadTimeSource !== "ai";
```

A row is **NOT firm** (→ red) when ANY of:
- `leadTimeDays` is null (no lead time at all)
- `leadTimeSource` is null/undefined/absent
- `leadTimeSource === "ai"`

### `_hasAiLeadTimes(project)` (line 1535):
```js
return (project?.panels||[]).some(p =>
  (p.bom||[]).some(r => !r.isLaborRow && r.leadTimeSource === "ai")
);
```

This ONLY catches `leadTimeSource === "ai"`. It **misses**:
- Rows with `leadTimeDays: null, leadTimeSource: undefined` (no lead time data at all)
- Rows with `leadTimeDays: null, leadTimeSource: null`

### The gap:

| Row state | Red? | Auto-budgetary fires? |
|-----------|------|-----------------------|
| `leadTimeSource: "ai"` | YES | YES |
| `leadTimeDays: null, leadTimeSource: undefined` | YES | **NO** |
| `leadTimeDays: null, leadTimeSource: null` | YES | **NO** |
| `leadTimeSource: "bc_vendor"` | NO | NO |
| `leadTimeSource: "supplier"` | NO | NO |

The second and third rows are the problem. A row with NO lead time data at all is flagged red but does NOT trigger the auto-setter.

---

## 3. What Changed: Three Contributing Factors

### Factor A: AI estimation is a last-resort fallback

The pricing flow runs lead time sources in strict precedence (line 27198–27517):

1. BC ItemVendorCatalog → `leadTimeSource: "bc_vendor"`
2. BC Item Card → `leadTimeSource: "bc_item"`
3. Scraper (Codale, custom) → `leadTimeSource: "scraper"`
4. **AI estimation (line 27497) → `leadTimeSource: "ai"` — ONLY for rows where ALL above returned null**

The AI fallback filter (line 27500):
```js
const rowsNeedingAiLead = updatedBom.filter(r =>
  !r.isLaborRow && !_isExcludedFromPriceCheck(r) &&
  (r.partNumber||"").trim() && (r.leadTimeDays == null));
```

Only rows with `leadTimeDays == null` after BC+scraper get AI estimation. If BC/scraper cover more parts over time (as vendor catalogs are populated), fewer rows fall through to AI.

### Factor B: BC lead time coverage growth

BC's `ItemVendorCatalog` and `Item Card` were introduced in v1.19.762 — just 22 patch versions after the auto-setter (v1.19.740). As Matrix PCI populates vendor data in BC, more BOM rows get firm lead times from BC, leaving fewer for the AI fallback. Noah's early projects (right after v1.19.740) likely had rows that fell through to AI; newer projects may not.

### Factor C: AI estimation silent failure

`aiEstimateLeadTimes` (line 12786) silently returns `[]` on:
- API failure (line 12811: `catch(e){...return[];}`)
- Missing API key (line 12788: `if(!_apiKey)return[];`)
- No estimable parts (partNumber < 3 chars)

If the estimation fails, rows stay with `leadTimeDays: null, leadTimeSource: undefined`. They're red (because `!_hasFirmLeadTime` catches null). But the auto-setter doesn't fire (because `leadTimeSource !== "ai"`).

### The "worked then stopped" timeline:

Noah's early projects had AI-estimated lead times (either because BC had less catalog data, or by coincidence). The auto-setter fired correctly on `leadTimeSource === "ai"`. Later:
- BC catalog coverage improved → fewer rows need AI fallback
- OR the AI estimation encountered API issues → rows got no source tag at all
- OR both

Either way: rows are red, but `leadTimeSource` is not `"ai"`, so the auto-setter's gate stays closed.

---

## 4. Red Rows vs. AI Lead Times: The Full Divergence

`_isBomRowFlaggedRed` (line 15807) flags a row red for ANY of:

| Condition | Line | Related to lead times? |
|-----------|------|----------------------|
| `qty === 0` (non-CS) | 15810 | No |
| `unitPrice === 0` (non-CS, non-customer-vendor) | 15811 | No |
| No `priceDate` | 15813 | No |
| Stale `priceDate` (> 60 days) | 15815 | No |
| `!_hasFirmLeadTime(r)` | 15816 | **YES** |

Noah sees "red rows" → expects auto-budgetary. But the red rows might be red for PRICE reasons (no price, stale price, qty=0), not lead-time reasons. Even when they're red for lead-time reasons, the auto-setter only catches the `leadTimeSource === "ai"` subset, not the full `!_hasFirmLeadTime` set.

---

## 5. Fix Direction — SCOPE ADJUSTMENT (Jon directive, 2026-07-01)

Jon's directive: widen the trigger to the **FULL red-row condition** (`_isBomRowFlaggedRed`),
not just the lead-time subset (`!_hasFirmLeadTime`). Any red row → auto-budgetary.

### Q1. The canonical "any red row" predicate

**`_isBomRowFlaggedRed(r, customerNo, customerName)`** — line 15807.

This is the single predicate that drives BOM row background color (called at line 28840).
It captures ALL red reasons:

| Condition | Line | Category |
|-----------|------|----------|
| `qty === 0` (non-CS) | 15810 | Data completeness |
| `unitPrice === 0` (non-CS, non-customer-vendor) | 15811 | Price |
| No `priceDate` | 15813 | Price |
| Stale `priceDate` (> `defaultStaleDays`, default 60) | 15814–15815 | Price |
| `!_hasFirmLeadTime(r)` | 15816 | Lead time |

Correctly excluded (never red):
- Labor rows (`r.isLaborRow`, line 15808)
- Customer-vendor rows for price/stale checks (`vendorIsCustomer`, lines 15809/15811/15812)
- Price-check-excluded rows for the price/stale/lead-time block: `_isExcludedFromPriceCheck(r)` (line 15812) covers customer-supplied, contingency, Matrix Systems vendor, buyoff/crate

**Confirmed: this IS the composite predicate. It's not a subset — it's the source of truth for row color.**

### Q2. Reachability at the auto-setter's evaluation point

**YES — fully reachable, no threading needed.**

| Requirement | Status |
|-------------|--------|
| `_isBomRowFlaggedRed` (line 15807) | `function` declaration → hoisted ✓ |
| `_vendorMatchesCustomer` (line 15801) | `function` declaration → hoisted ✓ |
| `_isExcludedFromPriceCheck` (line 15787) | `function` declaration → hoisted ✓ |
| `_hasFirmLeadTime` (line 15771) | `function` declaration → hoisted ✓ |
| `_isBuyoffOrCrate` (line 15783) | `function` declaration → hoisted ✓ |
| `_pricingConfig` (line 2016) | Module-level `let`, populated at app init ✓ |
| `project.bcCustomerNumber` | On the project object, available at both call sites ✓ |
| `project.bcCustomerName` | On the project object, available at both call sites ✓ |

**Signature change:** `_hasAiLeadTimes(project)` takes only `project`. The widened
`_hasRedRows(project)` extracts `project.bcCustomerNumber` and `project.bcCustomerName`
internally and passes them to `_isBomRowFlaggedRed`. No caller signature change needed.

```js
// NEW (replaces _hasAiLeadTimes):
function _hasRedRows(project){
  const cNo=project?.bcCustomerNumber, cName=project?.bcCustomerName;
  return (project?.panels||[]).some(p=>
    (p.bom||[]).some(r=>_isBomRowFlaggedRed(r,cNo,cName))
  );
}
function _countRedRows(project){
  const cNo=project?.bcCustomerNumber, cName=project?.bcCustomerName;
  return (project?.panels||[]).reduce((n,p)=>
    n+(p.bom||[]).filter(r=>_isBomRowFlaggedRed(r,cNo,cName)).length,0);
}
```

Note: `_isBomRowFlaggedRed` already filters out labor rows internally (line 15808),
so the old `!r.isLaborRow` guard in `_hasAiLeadTimes` is no longer needed — it's
built into the predicate.

### Q3. Updated site list (12 sites)

Same sites as before. The pattern is identical — rename + widen — just targeting
`_isBomRowFlaggedRed` instead of `!_hasFirmLeadTime`.

| # | Line | Current | Change to |
|---|------|---------|-----------|
| 1 | 1527–1530 | DECISION comment | Update: "AI lead times" → "red rows (incomplete pricing/lead times)" |
| 2 | 1535–1538 | `_hasAiLeadTimes` definition | → `_hasRedRows` using `_isBomRowFlaggedRed` |
| 3 | 1540–1542 | `_countAiLeadTimes` definition | → `_countRedRows` using `_isBomRowFlaggedRed` |
| 4 | 1545 | `_markProjectBudgetaryForAiLeads` definition | → `_markProjectBudgetaryForRedRows` (rename only, logic unchanged) |
| 5 | 1572–1574 | `window._hasAiLeadTimes` etc. debug exports | Update function names |
| 6 | 32850 | `_countAiLeadTimes(project)` (send path gate) | → `_countRedRows(project)` |
| 7 | 32853 | Dialog: "AI-estimated lead times" | → "items with incomplete pricing or lead time data" |
| 8 | 32869 | `_markProjectBudgetaryForAiLeads(project)` | → `_markProjectBudgetaryForRedRows(project)` |
| 9 | 37196 | `_hasAiLeadTimes(cur)` (auto-revert gate) | → `_hasRedRows(cur)` |
| 10 | 37209 | `_hasAiLeadTimes(latest)` (auto-revert debounce) | → `_hasRedRows(latest)` |
| 11 | 37513 | `_hasAiLeadTimes(projectRef.current)` (print path gate) | → `_hasRedRows(projectRef.current)` |
| 12 | 37516–37518 | `_countAiLeadTimes` + dialog: "AI-estimated lead times" | → `_countRedRows` + "items with incomplete pricing or lead time data" |
| 13 | 37525 | `_markProjectBudgetaryForAiLeads(projectRef.current)` | → `_markProjectBudgetaryForRedRows(projectRef.current)` |
| 14 | 37540–37545 | `_countAiLeadTimes` + checklist label: "AI-estimated lead times" | → `_countRedRows` + "items with incomplete pricing or lead times" |

**Sentinel field `isBudgetaryAiAutoSet`** — keep as-is. It's persisted to Firestore on
existing projects. Renaming would require migration or dual-read. The sentinel's meaning
shifts ("ARC auto-set this") but its role is unchanged (distinguish auto-set from manual).

**Auto-revert behavior change:** With the widened predicate, auto-revert only offers to
clear the flag when `!_hasRedRows(cur)` — i.e., NO rows are red at all (all prices valid,
all lead times firm, all qtys nonzero). This is a higher bar than before (was: "no AI lead
times") but correct: if ANY row is still red, the quote is still non-firm.

### Q4. Blast radius

**Intended expansions (Jon-accepted):**

| New trigger | Example | Previously triggered? |
|-------------|---------|----------------------|
| DIN/duct rows without firm LT (#176) | Cosmetic-over-flag rows | No (had `leadTimeSource: undefined`, not `"ai"`) |
| Stale price (> 60 days) | Any row not re-priced recently | No |
| Missing price (`unitPrice === 0`) | Unpriced items | No |
| Missing `priceDate` | Items without a price timestamp | No |
| Zero qty | Data-entry placeholders | No |

**No unintended blast radius.** The predicate's exclusions are tight:

- Labor rows: excluded at line 15808 (`r.isLaborRow → false`)
- Customer-supplied: excluded from qty check (line 15810) and price check (line 15812 via `_isExcludedFromPriceCheck`)
- Customer-vendor rows: excluded from unitPrice and price/stale/LT checks (via `vendorIsCustomer`)
- Contingency, buyoff/crate, Matrix Systems: excluded from price checks (via `_isExcludedFromPriceCheck`)

**Stale-price frequency note:** Projects not re-priced within 60 days (the default `_pricingConfig.defaultStaleDays`) will now auto-set budgetary. This is a larger surface than lead-time-only, but Jon's call is that erring toward BUDGETARY is safe. The auto-revert will offer to clear once all rows are clean.

**No other side effects:**
- `_markProjectBudgetaryForAiLeads` logic is unchanged — it still skips panels where `isBudgetary` is already true (line 1549), so a manually-checked panel is never double-set
- `_clearAutoBudgetary` only clears the sentinel-marked panels, never user-set ones
- The sentinel field name doesn't matter functionally — it's just a boolean tag

---

## 6. Summary

| Question | Answer |
|----------|--------|
| Does auto-setter exist? | YES — `_markProjectBudgetaryForAiLeads` at line 1545, unchanged since v1.19.740 |
| Was it removed? | NO |
| Is it just not firing? | YES — the gate condition (`leadTimeSource === "ai"`) doesn't match "red rows" |
| What's different from "when it worked"? | BC coverage grew, AI fallback runs less, rows are red for non-AI reasons |
| Was the gate ever broader? | NO — it was always `leadTimeSource === "ai"` from day one |
| Code bug? | No — works as designed. The design is too narrow. |
| Canonical red-row predicate? | `_isBomRowFlaggedRed(r, customerNo, customerName)` at line 15807 |
| Reachable at auto-setter? | YES — hoisted function declaration, all deps hoisted, project carries customer params |
| Fix direction | Widen `_hasAiLeadTimes` → `_hasRedRows` using `_isBomRowFlaggedRed` |
| Scope | 14 sites to rename/update in `src/app.jsx`. No Firestore schema change. Keep sentinel name. |
| Blast radius | Stale prices, missing prices, zero qtys now trigger auto-budgetary. DIN/duct #176 rows included. Jon-accepted. No unintended expansion. |

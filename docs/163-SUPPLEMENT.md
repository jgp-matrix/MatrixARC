# Freddy — #163 Coach Supplement: Three-Field Model Verification

**Author:** Coach (Sam Wize) | **Date:** 2026-06-26 | **Grounding:** C107 territory map + current tip `bea037e5`

This supplement answers the 5 open questions from your Brief, verified against the codebase. It also documents two additional PN-overwrite vectors discovered during the C107 trace that were not in the original 5 BC boundaries.

---

## Q1 — `row.bcNo` capture: existing key field or net-new schema?

**Answer: Net-new.** There is no persisted BC item number on individual BOM rows today.

**Evidence:**

- `bcItemNumber` exists at the **panel** level (line 23884: `if(!panel.bcItemNumber)return;` — used for BC pulse check) and in supplier portal crossings (line 8514), but NOT on individual BOM rows.

- The `bcNumber` that appears in pricing paths (lines 14923, 26796) is ephemeral — it's a local variable inside the pricing `bcMap` builder, scoped to the pricing function, and never persisted to the row object.

- `bcItemId` (BC's GUID) does not appear on BOM rows either. The only BC identity currently carried by a BOM row is `partNumber` itself (overwritten with the truncated BC "No." by `commitBcItem`).

**Implication:** Adding `row.bcNo` (or equivalent — `bcItemNo`, `bcSurrogate`, whatever naming Freddy chooses) is a **schema addition** to the BOM row. Per project rules, this field must never be removed or renamed once shipped. New rows that pre-date the change will have `bcNo: undefined`, which is fine — the fallback `row.partNumber.slice(0,20)` covers it.

---

## Q2 — Can each BC boundary key on a captured surrogate?

The C107 trace identified 5 BC-push boundaries. During this supplement trace, I found **2 additional PN-overwrite vectors** in the pricing paths (not in the original 5). Here's the full 7-boundary analysis:

### Boundary 1: `commitBcItem` (line 26262)

```js
const newPN = bcItem.number;  // line 26249 — truncated BC "No."
return {...r, partNumber: newPN, ...}  // line 26262
```

**Can key on surrogate?** YES. This is the PRIMARY mutation site. With the three-field model, this becomes: `bcNo: bcItem.number` (capture the surrogate), `partNumber` left untouched (keeps full PN). The `bcItem.number` value is the BC POST response's `.number` field — the surrogate is already in hand.

### Boundary 2: `bcSyncPanelPlanningLines` (line 3662)

```js
No: row.partNumber  // pushed directly as BC planning line Item No.
```

**Can key on surrogate?** YES. Change to `No: row.bcNo || row.partNumber`. The planning line POST would use the captured surrogate. If `bcNo` is undefined (row never committed to BC), it falls back to `partNumber` — BC will either truncate or reject, same as today.

### Boundary 3: `bcLookupItem` (line 4328)

```js
$filter=number eq '${pn}'  // exact match against BC "No."
```

**Can key on surrogate?** YES, but needs caller-side change. `bcLookupItem` is called with `partNumber` today. Callers need to pass `row.bcNo || row.partNumber` instead. The function itself is generic (takes any string) — no internal change needed.

### Boundary 4: `bcPushPurchasePrice` (line 5126)

```js
Item_No: itemNo  // on PurchasePrice record
```

**Can key on surrogate?** YES. Same pattern — callers pass `row.bcNo` instead of `row.partNumber`.

### Boundary 5: `bcPatchItemOData` (line 4949)

```js
ItemCard?$filter=No eq '${itemNo}'
```

**Can key on surrogate?** YES. Same caller-side pattern.

### Boundary 6 (NEW): Background pricing PN overwrite (line 14964)

```js
const newPn = bcMap[key].bcNumber || r.partNumber;  // line 14964
return {...r, partNumber: newPn, ...}  // line 14966
```

**Not in C107's original 5.** The background pricing path reads `bcMap[key].bcNumber` (the BC item's "No." from fuzzy lookup) and overwrites `partNumber` with it. This is a SECOND vector where truncated BC numbers infect ARC's `partNumber`.

**Can key on surrogate?** YES. With the three-field model: write `bcNo: newPn` (capture the surrogate), leave `partNumber` alone. The `bcMap[key].bcNumber` is populated by `bcFuzzyLookup`, which returns `item.number` (BC's "No.") — same truncated value.

### Boundary 7 (NEW): Foreground pricing PN overwrite (line 26846)

```js
const newPn = bcMap[key].bcNumber || r.partNumber;  // line 26846
return {...r, partNumber: newPn, ...}  // line 26848
```

**Identical pattern to Boundary 6** but in the foreground pricing path. Same fix.

### Summary

All 7 boundaries can key on the captured surrogate. The pattern is uniform:

- **Boundaries 1, 6, 7** (mutation sites): Stop overwriting `partNumber`; write to `bcNo` instead.
- **Boundaries 2, 3, 4, 5** (BC-push sites): Pass `row.bcNo || row.partNumber` instead of `row.partNumber`.

No boundary derives the BC key algorithmically from `partNumber` at runtime (e.g., no `.slice(0,20)` truncation). They all either receive it from BC's response or use `partNumber` directly. Swapping to a captured surrogate is mechanically simple at each site.

---

## Q3 — Learning-DB transition approach with re-key cost

**The problem:** The learning DB (alternates, corrections, part library, description crosses) stores entries keyed by `partNumber` as it existed at learning time. For items that went through `commitBcItem` before the fix, those keys are the truncated 20-char BC "No.", not the full PN.

**Concrete example:** User crosses `SCE-90EL4820SSFSD000XXX` → `PHOENIX-REPLACEMENT`. The learning DB stores `originalPN: "SCE-90EL4820SSFSD00"` (truncated). After the fix, new extractions produce `partNumber: "SCE-90EL4820SSFSD000XXX"` (full). The `_altMatchesPN` lookup (line 10711) normalizes via `_altNorm` which strips hyphens/spaces/underscores but does NOT truncate — so the full PN won't match the truncated DB entry.

**Scale:** Only items with PNs > 20 chars that went through BC commit are affected. This is a subset of all learning DB entries — most PNs are under 20 chars. The affected entries are identifiable: any `originalPN` or `badPN` that is exactly 20 chars long AND has a plausible truncation (no natural 20-char boundary).

### Recommended approach: Lazy dual-match + optional batch re-key

**Step 1 (code, zero-risk):** In `applyLearnedCorrections`, add a fallback match: if the primary `_altMatchesPN(a, pn)` fails, try `_altMatchesPN(a, pn.slice(0,20))`. This catches the case where the row has the full PN but the DB entry has the truncated version. ~3 lines per matching path (alternates, corrections, part library). Corrections path already does `normPN` matching (line 10728) — add the `.slice(0,20)` fallback there too.

**Step 2 (optional, batch):** One-time migration script that scans the learning DB and re-keys 20-char entries by looking up the full PN. For alternates: if `originalPN` is exactly 20 chars, search Firestore project BOMs for rows where `crossedFrom` or `correctionFrom` matches that truncated value — the `crossedFrom` field preserves the original extraction PN, which IS the full PN. Use that to update the DB entry's `originalPN`. For corrections: similar scan using `correctionFrom`.

**Why lazy-first:** Step 1 is safe and handles 100% of runtime matches. Step 2 is a data cleanup that improves the DB's legibility but isn't required for correctness. Ship Step 1 with the surrogate fix; schedule Step 2 if the number of affected entries justifies it.

**Cost:** Step 1 is ~12 lines across the 4 matching paths. Step 2 is a standalone admin script, scope TBD based on affected-entry count.

---

## Q4 — Does ARC ever create BC "No." itself, or does BC always assign?

**Answer: ARC currently ALWAYS supplies the "No."**

**Evidence:** `bcCreateItem` (line 4889) accepts a `number` parameter. Line 4894:

```js
if(number) body.number = number;
```

All three call sites pass the PN as `number`:

1. **BC Item Browser** (line 22375): `number: createNumber.trim()` — user-typed value in the create form
2. **Portal "Create New Item"** (line 31482): `number: newItemForm.itemNo || undefined` — pre-filled from `item.partNumber`
3. **Supplier CSV import** (line 41866): `number: row.partNumber` — from the CSV row

**No call site omits `number`.** The `if(number)` guard at line 4894 is structurally there but never exercised in practice — every caller passes a value.

**BC auto-assignment capability:** If `body.number` is omitted, BC's No.-Series kicks in and auto-assigns from the configured numbering scheme (typically `MTX-#####` or similar). The API response's `item.number` would contain the auto-assigned value. ARC would capture this as `bcNo` on the BOM row.

**Implication for the Three-Field Model:** To use surrogate keying:
- **Option A** (omit `number`): Don't send `body.number` at all. BC auto-assigns from No.-Series. ARC captures the assigned number as `bcNo`. The full PN goes into `Vendor_Item_No` via the PATCH. This is the cleanest — no truncation at all.
- **Option B** (send truncated): Send `body.number = partNumber.slice(0,20)`. Explicit truncation on the ARC side prevents BC's silent truncation. ARC captures `bcNo = item.number`. Preserves the current "PN is the BC No." ergonomic for PNs ≤ 20 chars.

**Call site 1 (BC Item Browser) is user-facing.** The user currently types the desired BC item number into a form field. With Option A, this field would change semantics (now it's a description/hint, not the BC No.). With Option B, the user still controls the BC No. but gets warned when it exceeds 20 chars. Both options work mechanically; the UX question is Freddy's call.

---

## Q5 — Existing in-flight projects with truncated PNs: clean-break or re-fetch?

**Answer: Clean-break is viable. One-time re-fetch is feasible but not required.**

### What "truncated" looks like in existing data

When `commitBcItem` runs, the original PN IS preserved in one of two places:
- `crossedFrom` (line 26288): if the BC match was flagged as a cross (`asCross=true`)
- `correctionFrom` (line 26291): all other cases (the `else` branch)

Only the `skipLearning` path (line 26283-26286: "Just Apply") deletes both fields. In the normal flow, the row carries breadcrumbs.

**However:** The pricing paths (Boundaries 6 and 7, lines 14964/26846) overwrite `partNumber` with `bcMap[key].bcNumber` but set NO breadcrumb field — no `crossedFrom`, no `correctionFrom`. If a row's first BC interaction was through pricing (not `commitBcItem`), the full PN is lost on that row.

### Clean-break assessment

**Clean-break means:** Ship the fix, new BOM rows get the three-field treatment. Existing rows keep truncated `partNumber`. Old projects print/display truncated PNs. No data corruption — just cosmetic.

**Why it works:**
1. Existing quotes are already issued with truncated PNs — reprinting them with full PNs would actually create a discrepancy with what the customer already received.
2. Active projects can be re-extracted (revision re-extract flow), which re-runs the full pipeline with the new code. This naturally transitions active projects.
3. The lazy dual-match in Q3 Step 1 handles learning DB lookups for the transition period.

### One-time re-fetch option (if desired)

A batch script could scan all project BOMs and, for each row where `partNumber` is exactly 20 chars:
1. Check `crossedFrom` or `correctionFrom` — if present and longer than 20 chars, that's the full PN. Restore it to `partNumber` and capture `bcNo = currentPartNumber`.
2. If no breadcrumb exists (pricing-path overwrite), query BC's `Vendor_Item_No` for the item — if a longer value exists there (from a future backfill or manual entry), use it.
3. If neither source yields the full PN, leave the row as-is.

**Cost:** The re-fetch is read-heavy (scan all projects × all panels × all BOM rows) but write-light (only touches rows with exactly-20-char PNs). No BC API calls needed for source (1) — it's all Firestore data. Source (2) requires BC calls but only for the small subset where source (1) fails.

### Recommendation

**Ship with clean-break.** The re-fetch adds complexity for marginal benefit — existing quotes/documents are already issued with truncated PNs. New work gets full PNs immediately. Active projects self-heal on next BC interaction (commitBcItem will populate `bcNo` and leave `partNumber` intact under the new code). Log a follow-up item for the batch re-key script (Q3 Step 2 + Q5 re-fetch combined) if field data shows significant impact.

---

## Additional Finding: Pricing Paths as Truncation Vectors

The C107 trace identified `commitBcItem` (line 26262) as the primary mutation site. This supplement trace found two additional, independent truncation vectors:

**Background pricing** (line 14964-14966):
```js
const newPn = bcMap[key].bcNumber || r.partNumber;
return {...r, partNumber: newPn, ...}
```

**Foreground pricing** (line 26846-26848): identical pattern.

Both paths run during `runPricingOnPanel` — background (auto-triggered) and foreground (user-triggered). They receive the BC-matched item's `number` via `bcFuzzyLookup` → `bcMap[key].bcNumber` and overwrite `partNumber` on the BOM row. Unlike `commitBcItem`, these paths set NO breadcrumb (`crossedFrom`/`correctionFrom`) for the original PN.

**Impact on fix scope:** The Brief's Scope A (ARC-side storage) must cover all three mutation sites, not just `commitBcItem`. The fix pattern is the same at all three: write `bcNo` instead of overwriting `partNumber`.

---

## Consolidated Mutation-Site Map

For implementation reference — every code location that overwrites `partNumber` with a BC-derived value:

| # | Function | Line | Current behavior | Fix |
|---|----------|------|-----------------|-----|
| 1 | `commitBcItem` | 26262 | `partNumber: newPN` (BC response `.number`) | Write `bcNo: newPN`, keep `partNumber` |
| 2 | Background pricing | 14966 | `partNumber: newPn` (bcMap bcNumber) | Write `bcNo: newPn`, keep `partNumber` |
| 3 | Foreground pricing | 26848 | `partNumber: newPn` (bcMap bcNumber) | Write `bcNo: newPn`, keep `partNumber` |

And every code location that pushes `partNumber` into a BC field with a 20-char limit:

| # | Function | Line | Current key | Fix |
|---|----------|------|-------------|-----|
| 4 | `bcSyncPanelPlanningLines` | 3662 | `No: row.partNumber` | `No: row.bcNo \|\| row.partNumber` |
| 5 | `bcLookupItem` | 4328 | `number eq '${pn}'` | Callers pass `bcNo` |
| 6 | `bcPushPurchasePrice` | 5126 | `Item_No: itemNo` | Callers pass `bcNo` |
| 7 | `bcPatchItemOData` | 4949 | `No eq '${itemNo}'` | Callers pass `bcNo` |
| 8 | `bcFetchPurchasePrices` | 5152 | `Item_No eq '${pn}'` | Callers pass `bcNo` |

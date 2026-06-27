# Freddy — Marc's implementer review of the #163 Detailed Plan (C109)

**From:** Marc (CCD) | **Date:** 2026-06-26 | **Read against tip:** `bea037e5` (app.jsx unchanged since Coach's `53a29288`; all cited line numbers verified against current `src/app.jsx`)
**Mode:** read-only architectural review, no build. Verified the plan's runtime assumptions against live code.

---

## Bottom line

The plan is careful and mostly correct — its transitive reasoning (e.g. 3678/3690 inheriting the 3662 fix) checks out, and the line numbers are accurate. But there are **four concrete issues a static read can't see**, two of which are correctness bugs in the plan as written (not just the build). None are on your 5-item list. The biggest is that the plan's central assumption — `bcItem._vendorItemNo` is always present — is **path-dependent and silently false on a user-selectable code path.**

I **agree** with all five of your items; specific corroboration on #1 (CSV) and #4 (undersizing) below.

---

## Agreement on your 5 items (no need to re-litigate)

1. **CSV contradiction (2E/41863 vs 3D)** — AGREE, it's real. 41863 (`bcPatchItemOData(row.partNumber,…)`, "keep as-is — CSV is BC-keyed") treats the CSV `row.partNumber` as a BC **"No."**, while 3D treats the *same* CSV `row.partNumber` as a **full PN** destined for `Vendor_Item_No`. Both cannot be true for the same column. Coach must pick one meaning for the CSV's PN field and make 2E/3D consistent.
2. **Three "check caller context" sites (31359/37680/27212)** — AGREE they must be resolved before build; they're genuine unknowns (see also my extra read sites below).
3. **Missing test-environment strategy** — AGREE, and I add the *specific* isolation constraint in §2 below (it's BC env, not Functions).
4. **"10 boundaries" undersizes ~40 sites** — AGREE and corroborated: my independent grep lands ~40+, and I found **read sites the plan's 2H list omits** (§3).
5. **Completeness grep → pre-deploy gate** — AGREE; I'd make it a hard gate (see §3, the grep needs widening).

---

## §1 — Runtime assumptions (verified against code)

### 1a. ⚠️ HIGH — `bcItem._vendorItemNo` is only populated on ONE of two search paths
This is the plan's load-bearing assumption (P1: `commitBcItem` 26249 + pre-commit 26415 both read `bcItem._vendorItemNo`). It is **not uniformly true.**

- `bcSearchItems` (4662) dispatches by `field`:
  - `field:"both"` (default) → `_bcFetchItemsViaItemCard` (4538) → maps **`_vendorItemNo`** ✓
  - `field:"number"` or `field:"displayName"` → `_bcFetchItems` (4510, v2 `/items`) → mapper at 4525-4529 **omits `_vendorItemNo`** ✗
- The Item Browser modal defaults `field` to `"both"` (21736) **but exposes a `<select>` (22183)** letting the user switch to Number/Description.

**Consequence:** when a user searches the Item Browser by Number or Description and selects an item, the `bcItem` handed to `commitBcItem` has **no `_vendorItemNo`**. The plan's `bcFullPN=(bcItem._vendorItemNo||'').trim()||bcSurrogate` then falls back to the **surrogate**. After P3 (surrogate = `MTX-#####`):
  - cross-detection at 26287 / 26415 compares `normPart(MTX-#####)` vs `normPart(origPN=full PN)` → **always unequal → false cross flag on a legitimate same-item commit**, which can fire a wrong learning-DB cross write; and
  - `partNumber` is *not* updated to the full PN (the `bcFullPN!==bcSurrogate` guard fails).

**Fix options for Coach:** in `commitBcItem`, when `bcItem._vendorItemNo` is absent, do a targeted ItemCard fetch (`_bcFetchItemsViaItemCard` / `ItemCard?$filter=No eq …&$select=…,Vendor_Item_No`) to resolve the full PN before computing `bcFullPN`; **or** add `Vendor_Item_No` to the v2 mapper at 4525-4529 (note: a sibling function filters `/items` on `vendorItemNo` at 8469, so the v2 item *does* carry it — it just isn't `$select`ed/mapped). The field-name split is also a trap: ItemCard path → `_vendorItemNo`; v2 path → `vendorItemNo` (camelCase, no underscore). The plan only ever reads `_vendorItemNo`.

### 1b. ✓ `bcLookupItem` exposes `.number` and `.vendorNo`
Verified (4338): returns `{unitCost, unitPrice, displayName, inventory, number, vendorNo}`. So `exact.number` (plan 1C/1D bcMap fix) and `exact.vendorNo` work. **Assumption holds.** It does **not** return `_vendorItemNo`, but the plan doesn't rely on that here.

### 1c. ✓ (config-gated) `bcCreateItem` auto-assign
Code-side the response is read as `item.number` (4912/4933), so omitting `body.number` *will* return the No.-Series value **iff** BC has an Item No.-Series configured as default — exactly what BC-1 validates. No extra code needed for the read. **Assumption holds, gated on BC-1.** But see §4a/§4b for two create-path problems the plan misses.

---

## §2 — Deploy mechanics (clear answer)

**All BC sync code is client-side in `app.jsx`. `functions/index.js` contains none of it** — verified: zero matches for `commitBcItem`/`bcLookupItem`/`bcCreateItem`/`bcPatchItemOData`/`bcPushPurchasePrice`/`Vendor_Item_No`/`BC_ODATA_BASE`/`bcGatedFetch` in `functions/`. Definitions all live in app.jsx (`bcLookupItem:4322`, `bcCreateItem:4889`, `bcPatchItemOData:4943`, `bcPushPurchasePrice:5092`, `commitBcItem:26202`, planning lines `3526/3851`).

**Implication:** a #163 deploy is **hosting-only** (`deploy.sh`), so it **can** be isolated to a preview/test hosting channel — there is **no Functions-side change forcing a both-targets deploy.** That removes the worry the review raised.

**BUT the real isolation risk is BC, not hosting.** The client calls BC directly via `BC_API_BASE`/`BC_ODATA_BASE`. Whatever environment those constants point at is where test commits land — and #163 test commits are **mutating** (auto-create items + surrogates, rewrite `Vendor_Item_No`, push prices). So the test-environment strategy (your item #3) must guarantee the **test build points at the BC *sandbox*, not production BC** — otherwise "safe" UI testing silently writes to real BC. Confirm whether `BC_API_BASE`/`BC_ODATA_BASE` are build-time constants that differ per hosting target (and whether the project's `bcEnv` field overrides them). That, not Functions, is what decides whether safe testing is possible.

---

## §3 — Independent site sweep (corroboration)

My grep (`bcPushPurchasePrice(|bcPatchItemOData(|bcUpsertItemVendorLeadTime(|bcLookupItem(|bcGetItemVendorNo(|No:…partNumber|Item_No:…partNumber`) matches the plan's ~40 and confirms its tricky calls:
- **3690** (`bcPatchItemOData(pn,…)` posting-group auto-fix) — **correctly covered transitively**: `pn` comes from `l.No` (3678), set by the 3662 line the plan already fixes. The plan's reasoning here is right. ✓
- Push sites 26533/27011/27120/31328/37597/38172/38842/39369/39510/39515 and `created.number` correct sites (22381/31506) all match the plan. ✓

**Sites the plan's 2H read-list OMITS** (all `bcGetItemVendorNo`/`bcLookupItem` reads — degradation, not corruption, but should be in the audit): **6299, 6305, 23715, 30445**. Each passes a local `pn`; Coach should confirm each is already a BC "No." or apply `_bcNo()`. → **The completeness grep in the follow-up must be widened** beyond `bcPatch|bcPush|Item_No|No:` to also cover `bcLookupItem(`, `bcGetItemVendorNo(`, and `bcUpsertItemVendorLeadTime(` argument PNs, and run as a **hard pre-deploy gate** (your item #5).

---

## §4 — Build feasibility

### 4a. ⚠️ HIGH (plan bug) — 3A writes `Vendor_Item_No` inside the `if(vendorNo)` gate → full PN lost on vendor-less creates
In `bcCreateItem`, the entire OData PATCH block is gated: `if(item.number&&(vendorNo||genProdPostingGroup||inventoryPostingGroup||manufacturerCode))` (4914), and the `Vendor_Item_No` write is further inside `if(vendorNo)` (4921). Plan 3A changes line 4921 to `Vendor_Item_No=number||item.number` **but leaves it in that gate.** So a create with **no vendorNo/posting groups skips the PATCH entirely** → after P3 omits `body.number`, the item has the surrogate as "No." and the **full PN is written nowhere.** Coach must **lift the `Vendor_Item_No` write out of the `if(vendorNo)` gate** and PATCH it whenever `body.number` was omitted (i.e. always, post-P3), independent of vendor. This is more than the "~5 lines" 3A implies.

### 4b. ⚠️ MED (not in plan) — P3 removes duplicate-item prevention
Today the 409/400 handler (4906-4908) catches "already exists" on the unique **"No."** field. After P3 the full PN goes to **`Vendor_Item_No`, which is not unique-constrained**, and each create auto-assigns a *new* surrogate. So re-creating the same PN (e.g. CSV import run twice, or two users) will **silently spawn duplicate BC items** with the same full PN and different `MTX-#####`. Needs a deliberate decision: pre-create lookup-by-`vendorItemNo` (8469 already supports that filter) to dedupe, or accept duplicates.

### 4c. MED (plan undercount) — 26524/37591 "need row context" is more than ~1 line
At 26524/26533 the edited row (`r` where `r.id===id`) is only in scope **inside** the `.map` at 26510-26516; the BC push runs **after** the map closes, so `_bcNo(row)` is not reachable there. Marc must add an explicit `const editRow=(panel.bom||[]).find(r=>r.id===id)` (or capture `bcNo` during the map). Same shape at 37591. Feasible, but flag the under-estimate.

### 4d. ✓ syntax patterns are fine
`_bcNo` (`row?.bcNo||(row?.partNumber||'').slice(0,20)`) and the spread-conditionals (`...(bcSurrogate?{bcNo:bcSurrogate}:{})`) are valid as written. No issue.

### 4e. ⚠️ MED (plan gap) — 1C/1D are silent on the FUZZY branch
The plan's 1C/1D show only the **exact**-lookup branch (14920/26793). But background pricing has a **fuzzy branch** (14927-14936) that *also* writes `bcMap[key].bcNumber` (`matchNo=result.match.number||pn`) and feeds the **same** mutation site (14959-14978) the plan rewrites. Two sub-points:
  - The shared mutation-site change **does** cover fuzzy (since `result.match.number` is the BC No.) — but the plan should *say so explicitly* so the implementer doesn't think it's unhandled.
  - The plan changes the exact lookup input to `bcLookupItem(_rowBcNo||pn)` but leaves `bcFuzzyLookup(pn)` (14927) using the **full PN**. For a row that has a `bcNo` but `priceSource!=="bc"`, fuzzy will search BC by the full PN even though the item's "No." is now a surrogate. Usually fuzzy still finds it (it matches on description/vendorItemNo), but Coach should decide whether to feed `_rowBcNo||pn` here too for consistency.

---

## §5 — Phasing / atomic deploy

**P1+P2 as one commit is feasible from a deploy standpoint** — everything is in the single file `app.jsx`, hosting-only, so there's **no Functions-before-client sequencing landmine.** One `deploy.sh` ships P1+P2 atomically. ✓

The real ordering constraints are **data/config, not code**, and the plan already names them — but I'd harden two:
- **BC-2 backfill is a hard gate** *and* interacts with §1a: even a fully backfilled BC item won't carry `_vendorItemNo` into `bcItem` if the user searched via the Number/Description path. So BC-2 alone doesn't save cross-detection — §1a's code fix is *also* required before P1 is safe. Sequence them together.
- **P5 must ship with P1+P2** (plan agrees). Confirmed necessary: the moment `partNumber` stops truncating, `applyLearnedCorrections` (10672+) needs the `.slice(0,20)` fallback or every pre-#163 learning-DB entry stops matching.

---

## Recommended additions before build (for Coach's revision)
1. **§1a**: resolve `_vendorItemNo` regardless of search path (targeted ItemCard fetch in `commitBcItem`, or map it on the v2 path). **Blocks P1 correctness.**
2. **§4a**: move the `Vendor_Item_No` write out of the `if(vendorNo)` gate in `bcCreateItem`. **Blocks P3 correctness.**
3. **§4b**: decide duplicate-item policy for the create path post-P3.
4. **§4e**: explicitly address the fuzzy branch in 1C/1D.
5. **§2**: pin BC sandbox vs prod in the test-target strategy (constants/`bcEnv`).
6. **§3**: widen the completeness grep (add `bcLookupItem(`/`bcGetItemVendorNo(`/`bcUpsertItemVendorLeadTime(`) and audit 6299/6305/23715/30445; make it a hard pre-deploy gate.

No code written. Back to you for reconciliation with Coach's revision.

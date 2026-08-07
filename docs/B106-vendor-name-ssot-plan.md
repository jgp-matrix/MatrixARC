# B106 — Vendor name inconsistent on BOM rows (cached `bcVendorName` drifts) + duplicate BC vendor records

**Author:** Sam Wize (Coach) · Scoping plan (build-ready) · prod v1.24.97
**Status:** SCOPED — awaiting Jon decision on fix direction (see Open Questions). No code written.
**Cross-ref:** F041 / F075 (vendor config family), B075 (dup MFRs), B104 (save-funnel we just hardened), CLAUDE.md "Single Source of Truth for Dual-Consumer Predicates" + "BC surrogate vs Vendor Part# — CARDINAL RULE".

---

## Problem

Same supplier shows under two names in the BOM **Supplier** column. Live-confirmed on **PRJ402509**:

- Vendor **V00251** is stamped `"Crum Electric"` on 10 rows AND `"Crum Electric Supply"` on 2 rows — **same `bcVendorNo`, two different `bcVendorName` strings** on the row objects.
- The live BC vendor master (via `bcGetVendorName("V00251")`) returns the single canonical name `"Crum Electric"`. So the 2 drifted rows carry a stale cached string.
- Separately, a **second** vendor record **V00179** is ALSO named `"Crum Electric"` in BC = a likely **duplicate BC vendor master record** for the same real supplier.

Two distinct defects bundled under B106:
- **(a)** Row-level `bcVendorName` is a **cached per-row string** that can drift from the BC master. (Code defect — ARC.)
- **(b)** Two BC vendor master records (V00179, V00251) for one real supplier. (Data defect — BC-side, ARC can only surface/flag.)

**Concrete downstream harm (not just cosmetic):** RFQ vendor-grouping keys on the **displayed name string** (`bcVendorName`), not `bcVendorNo` — see `getRfqVendorGroups` at **`src/app.jsx:8065-8087`** and the explicit **WYSIWYG decision (Jon, 2026-07-30)** in the comment at **8070-8076** ("the RFQ ALWAYS routes to the vendor shown on the row … do NOT re-resolve from BC behind the scenes"). Consequence: a drifted V00251 splits into **two RFQ groups** ("Crum Electric" + "Crum Electric Supply") for one vendor — two RFQs to the same supplier. That is the real cost of the drift.

---

## Root (code-confirmed, line anchors)

The name resolver **is** an SSOT and is correct:

- **`bcGetVendorName(vendorNo)` — `src/app.jsx:7437-7462`.** Resolves a name from a vendorNo via `_vendorMapCache` (sync helper `bcResolveVendorName`, `:7396-7399`) or a direct BC `vendors` API lookup, caching the result. `_vendorMapCache` is built from `bcListVendors()` (the BC vendor master) in `bcGetVendorMap` (`:7387-7395`). **This is authoritative name-from-number.**

The drift is NOT in the resolver — it is that **rows store a name STRING captured at write time from mixed provenance, and several write paths capture a NON-BC string and/or omit `bcVendorNo`.** Once stored, the display and RFQ grouping read that stale string verbatim. Root cause = *the stored `bcVendorName` is treated as the display SSOT, but it is a point-in-time cache from heterogeneous sources with no re-sync to the BC master.*

---

## Write sites of `bcVendorName` (every stamp, by name provenance)

### Group A — BC-resolved (correct: name pulled from `vendorNo` via `bcGetVendorName`, and `bcVendorNo` set)
- `:17559`, `:17569`, `:17586` — `runPricingOnPanel` BC match (exact / fuzzy-crossfield / fuzzy). Sets `bcVendorNo:vNo` + `bcVendorName:bcGetVendorName(vNo)`.
- `:31739`, `:31753`, `:31772` — second pricing path (mirror of the 17559 family).
- `:17701`, `:32196-32197` — `needVendor` backfill (missing name → `bcGetVendorName`).
- `:27960-27986` — "VENDOR BACKFILL" effect: backfills `bcVendorName` for BC-priced rows missing it via `bcGetVendorName`.
- `:30973`, `:30986`, `:30999` — F068 / B041 deferred vendor lookup on part-number change (`bcItem._vendorName` or `bcGetVendorName(vNo)`).

### Group B — NON-BC name strings (the drift sources)
- **`:44085`** — supplier-portal **add-rows**: `bcVendorName:submission.vendorName||""`. Uses the **supplier's own** name string. **Does NOT set `bcVendorNo`.**
- **`:44360`, `:44363`, `:44365`** — `doApplyPortalPrices`: `bcVendorName:submission.vendorName||row.bcVendorName`. Supplier's string. **Does NOT set `bcVendorNo`.**
- **`:44960`, `:44968`** — vendor-scraper apply: `bcVendorName:match.source||vendorName`, `bcVendorNo:vendorNo`. Uses the **API/scraper** vendor label (sets `bcVendorNo`).
- **`:31220`** — RFQ / manual-secondary pick (`ItemBrowser`): `u.bcVendorName=pick.supplier; u.bcVendorNo=pick.vendorNo||""`. Uses the pick's label.
- `:37161`, `:37808` — supplier-quote import add-rows: `bcVendorName:vendorName` (import-scope label).

> These are the paths most likely to have written `"Crum Electric Supply"` (a supplier/portal/API label) onto V00251 rows while the BC-priced rows got the master `"Crum Electric"`.

### Group C — user pick (from the BC vendor list, generally correct, but note gap)
- **`:31418`** — `updateVendor(id,vendorName)`: `{...r,bcVendorName:vendorName}`. `vendorName` comes from `bomVendorList` (BC display names), so the STRING is BC-correct — **but this path stamps only the NAME and does NOT store `bcVendorNo` on the row** (it looks up the number only to PATCH the BC item card at `:31430-31433`). SSOT-id gap.
- `:39610` — `doAutoAssignApply`: sets **both** `bcVendorNo` + `bcVendorName` from the pick map (correct).
- `:12237` — bulk remap action (`action.remapName`).
- `:13212` — contingency row hardcoded `"Matrix Systems"` (intentional).

### Group D — pass-through / preserve (merge existing, no new provenance)
- `:17626`, `:31819` — `bcVendorName:bcMap[key].bcVendorName||r.bcVendorName` (merge).
- `:31359` — `confirmPrice`: `bcVendorName:vendorName||r.bcVendorName`.
- `:30199`, `:30481`, `:30513`, `:30575`, `:56257` — save/copy/quote funnels preserve the existing value (data-retention).

---

## Read / display sites (where the stored string is consumed verbatim)

- **`:34035-34036`** — **the Supplier column render.** `title={row.bcVendorName}`, cell = `row.bcVendorName||"—"`. **Primary surface where the drift shows.**
- **`:8065-8087`** — `getRfqVendorGroups`: groups by `bcVendorName` string (WYSIWYG, see Problem). **Drift → split RFQ groups.**
- `:9839-9840` — quote/print BOM table (`bcVendorName`).
- `:32560-32569` — CSV export (F011) — same field the on-screen BOM shows.
- `:18699-18701` — RFQ status vendor sets (pending/expired/sent) keyed by `bcVendorName`.
- `:11764-11767`, `:11975` — vendor-missing / vendor-name-map counts.
- `_vendorMatchesCustomer(...)` consumers — `:2014`, `:18384`, `:18553`, `:34295`, `:34312`. **These already read BOTH `bcVendorNo` AND `bcVendorName`** — the good pattern.

**SSOT id on the row = `bcVendorNo`.** But it is **NOT universally populated** (portal apply `:44085`/`:44360-44365` and manual `updateVendor :31418` omit it). This coverage gap is decisive for the fix choice below.

---

## Fix options for (a)

### Constraint that shapes everything: render is synchronous
The Supplier column renders synchronously; `bcGetVendorName` is **async**. Only `bcResolveVendorName(vendorNo)` (sync) can run at render, and only if `_vendorMapCache` is already loaded (`bcGetVendorMap` on BC connect). If BC is offline / cache empty / row has no `bcVendorNo`, display-time resolution returns `""` and MUST fall back to the stored string.

### Option 1 — Display-time resolution (non-destructive)
Render `bcResolveVendorName(row.bcVendorNo) || row.bcVendorName || "—"`. Stored data untouched.
- **Pros:** zero save-funnel risk (pure render), instantly collapses the V00251 display to one master name for every row that HAS a `bcVendorNo` in the loaded map. Data-retention-safe by construction.
- **Cons:** (1) **Coverage gap** — rows priced only via portal/manual-set have no `bcVendorNo`, so they fall through to the (possibly drifted) stored string → still split. (2) **RFQ grouping (`:8065`) is a SEPARATE read** — a render-only change does NOT fix the split RFQ unless grouping is also switched to resolve/key on `vendorNo`. (3) **Conflicts with the WYSIWYG decision** (`:8070-8076`) — that comment deliberately says the *displayed stored value* is authoritative and BC should not be re-resolved behind the scenes.

### Option 2 — Write-time re-stamp (keep stored value authoritative)
Re-stamp `bcVendorName` from BC (`bcGetVendorName(bcVendorNo)`) on every match/price so it can't drift.
- **Pros:** stored value stays correct → WYSIWYG holds, display + RFQ grouping + CSV + quote all correct with no read-side change.
- **Cons:** touches the **money-path save funnel just hardened in B104**; a blanket "re-stamp all rows every save" risks clobber/regressions and violates "conservative on vendor identity." Also does nothing for **already-drifted stored rows** without a repair pass.

### Recommendation — **HYBRID (write-time normalization at the drift sources + one-time repair, with an optional display-time safety net)**

Weighted toward the WRITE side, because the WYSIWYG rule (`:8070-8076`) and the separate RFQ-grouping read (`:8065`) mean *the stored value must be correct*, not just the pixels:

1. **Close the drift sources (Group B + the `updateVendor` id-gap).** At each non-BC write site, **when a `vendorNo` is available, resolve the name through `bcGetVendorName(vendorNo)` and store BOTH `bcVendorNo` + `bcVendorName`.** Where only a supplier label is available (portal add-rows with no number), store the label but ALSO capture `bcVendorNo` if the submission/RFQ token carries one so a later normalize can fix it. Fix `updateVendor :31418` to also persist `bcVendorNo` (it already resolves the number at `:31432`).
2. **One-time repair pass (idempotent, guarded).** A maintenance action that, for rows with a `bcVendorNo`, re-stamps `bcVendorName = bcGetVendorName(bcVendorNo)` **only when it differs**, and for rows missing `bcVendorNo` attempts `bcGetItemVendorNo`→resolve. This is the existing "VENDOR BACKFILL" pattern (`:27960-27986`) extended to *correct* (not just fill) — run it as an explicit, logged, reversible pass, NOT auto-on-every-save. This repairs PRJ402509's 2 drifted rows.
3. **Optional display-time safety net (Jon's call).** IF Jon accepts a small WYSIWYG relaxation, add `bcResolveVendorName(row.bcVendorNo)||row.bcVendorName` at the render (`:34036`) AND switch RFQ grouping (`:8065`) to key on a resolved name/`vendorNo`, as a belt-and-suspenders against future drift. This conflicts with the 2026-07-30 WYSIWYG decision, so it is **gated on Jon** — do not ship silently.

**Why not pure Option 1:** doesn't fix the RFQ split without also touching `:8065`, leaves the no-`bcVendorNo` rows drifted, and fights WYSIWYG.
**Why not pure Option 2:** blanket save-funnel re-stamp is riskier than needed post-B104 and skips repair of existing rows. The hybrid gets the correctness of Option 2 with surgical, auditable writes.

---

## Duplicate-vendor handling for (b) — ARC-side vs BC-admin

**An ARC tool for this ALREADY EXISTS** — `scanForDuplicates` (`src/app.jsx:52570-52606`) + `executeRemoveDuplicates` (`:52608-52643`), with `normVendorName` (`:52564-52568`):

- `normVendorName` strips `electric|electronics|supply|inc|llc|ltd|corp|co|…` and non-alphanumerics. Both `"Crum Electric"` and `"Crum Electric Supply"` normalize to `"crum"`, and V00179/V00251 (both literally "Crum Electric") normalize identically → **the existing scan already detects this duplicate group.**
- The scan (non-destructive) fetches all BC vendors, groups by normalized name, keeps the lowest vendor number, lists the rest.
- `executeRemoveDuplicates` then **hard-`DELETE`s** the extra vendor records via BC REST (`:52619-52625`) and cleans Firestore `vendorCodes`.

**Risk to flag:** the existing remove is a **destructive BC-admin action** and does **not** check whether the vendor being deleted is referenced by `ItemVendorCatalog`, item cards, POs, or existing BOM rows (V00179 may be the `Vendor_No` on live item cards / historical POs). Deleting a referenced vendor can orphan those references. This is exactly the "conservative on vendor identity / never silently rewrite a vendorNo" concern.

**Recommended split for (b):**
- **ARC-side (safe, in scope):** *surface / flag* duplicate vendor groups (the scan is fine) and **prefer the canonical (lowest / most-referenced) vendorNo** when stamping new rows. Optionally add a reference-count check before offering removal. Do NOT auto-merge or auto-delete.
- **BC-admin (out of ARC scope):** actual vendor-master **merge/delete** of V00179 vs V00251 is a Business Central admin action (BC's own vendor-merge / careful delete after re-pointing item cards + POs). ARC should not auto-merge vendor master records. If the existing `executeRemoveDuplicates` stays exposed, gate it behind a reference-check + explicit confirm.
- **Cross-ref:** F075 (Vendor Sync config gap — vendor#→BC config UI) and F041 vendor family own the canonical-vendor config surface; B106(b) should feed into that rather than grow a parallel tool.

---

## Regression + data-safety checks

- **Never rewrite `bcVendorNo` to a different value silently.** Writes may only ADD a missing `bcVendorNo` or re-stamp a `bcVendorName` to match an EXISTING `bcVendorNo`. No path may change an existing `bcVendorNo`.
- **Data-retention:** display-time changes store nothing. The repair pass must be idempotent, change-only (skip when equal), logged, and reversible; it must preserve all other row fields (price, `bcPoDate`, lead-time, `priceSource`, flags).
- **Respect B104 save funnel:** route any repair writes through the existing `saveProjectPanel` path with `_noBumpWrite` semantics (see the B041 pattern at `:30986`) — do NOT introduce a parallel writer or bump/unlock churn.
- **WYSIWYG (`:8070-8076`):** if the display/RFQ-grouping safety net (step 3) is approved, update that comment + confirm with Jon; if not approved, correctness must come entirely from the stored value (steps 1–2).
- **Verify across ALL consumers** (dual-consumer-predicate rule): after the fix, Supplier column, RFQ grouping, CSV export, quote print, and `_vendorMatchesCustomer` must all show the single consistent name for V00251.
- **Cardinal rule:** `bcVendorNo` (BC surrogate) is the link; the front-facing name is derived from it. Keep the number as SSOT, the name as its projection.

## Test plan

1. **PRJ402509 primary:** after fix + repair pass, all 12 V00251 rows show **one** consistent name (BC master `"Crum Electric"`). No `"Crum Electric Supply"` remains on any row.
2. **RFQ grouping:** generating an RFQ for PRJ402509 produces **one** Crum group, not two.
3. **Portal-apply drift repro:** apply a supplier-portal submission whose `submission.vendorName` differs from the BC master name for a known `vendorNo`; confirm the row ends up with the BC master name (write-time normalization) and a populated `bcVendorNo`.
4. **`updateVendor` id-gap:** manually set a row's vendor; confirm both `bcVendorName` AND `bcVendorNo` now persist on the row.
5. **BC-offline fallback:** with BC disconnected / `_vendorMapCache` empty, confirm rows still render their stored name (no blank Supplier column) and nothing is destructively rewritten.
6. **Data-retention:** load a legacy project, confirm all vendor/price/lead-time/flag fields survive the repair pass unchanged except the corrected name.
7. **Dup scan:** run `scanForDuplicates`; confirm the Crum group (V00179 + V00251) is surfaced. Do NOT execute removal in test.

## Effort + gate

- **(a) code fix (steps 1–2, write-time normalization + repair pass):** **M** (~4–7 non-BC write sites + one idempotent repair action; money-path save funnel → Coach review + live PRJ402509 verification gate required per CLAUDE.md H-item discipline).
- **(a) optional display/RFQ safety net (step 3):** **S**, but **Jon-gated** (WYSIWYG tension).
- **(b) ARC-side flag + prefer-canonical:** **S** (leverage existing `scanForDuplicates`; add reference-check before any removal). Actual BC vendor merge/delete = **BC-admin, out of ARC scope.**
- **Gate:** H-item discipline (not trivial) — plan → Coach review (this doc) → Jon approval → build → regression on PRJ402509 → Coach review → Jon final. Deploy is its own Jon-released checkpoint.

## Open questions for Jon

1. **WYSIWYG vs display-resolution.** The 2026-07-30 WYSIWYG rule says the *stored displayed* vendor name is authoritative and BC should not be re-resolved behind the scenes. The recommended hybrid keeps that (fix stored value + repair) and treats display-time resolution as an OPTIONAL safety net. **Do you want the display/RFQ-grouping safety net (belt-and-suspenders, slight WYSIWYG relaxation), or write-side correctness only?**
2. **Repair scope.** Run the one-time name-repair pass **per-project on open** (auto, quiet, change-only) or as an **explicit admin "Normalize vendor names" action**? (Recommend explicit + logged, for auditability.)
3. **Duplicate removal.** For V00179 vs V00251: is the existing `executeRemoveDuplicates` (hard BC `DELETE`) acceptable *after* a reference-count guard, or should ARC only **flag** duplicates and leave the actual merge/delete to a BC admin? (Recommend flag-only from ARC; merge is a BC-side action given PO/item-card references.)
4. **Canonical pick.** When two vendorNos map to one supplier, prefer **lowest number** (current dup-tool behavior) or **most-referenced**? This affects which vendorNo new stamps should prefer.

---

## ★ CORRECTION (Jon 2026-08-06) — BC is CLEAN; drop the dedup piece

Jon **verified BC's vendor list directly: NO duplicates.** So the earlier "duplicate BC vendor records (V00179 + V00251 both Crum Electric)" framing was WRONG — there is no BC-side duplication to detect/dedup/merge. **Remove the dup-vendor-detection/`scanForDuplicates`/BC-admin-merge scope from B106 entirely.**

**Confirmed root (live, PRJ402509 Firestore + Jon):** the "duplicate Crum Electric" is a pure ARC name≠number divergence. **V00251 is HEITEK in BC**, but ARC has **12 rows stamped `bcVendorNo:V00251` + `bcVendorName:"Crum Electric"`** — Jon manually changed those Heitek rows to Crum and the old `updateVendor` saved the NAME but not the NUMBER. The real Crum (V00179) is on 2 rows. So "Crum Electric" appears under two numbers → looks like a dupe, is one mislabeled Heitek. **Consequence: those 12 rows price/LT/write-back to Heitek (the number), not Crum (the display).**

**B106 revised scope = ARC-side only:**
1. **Forward-fix — persist `bcVendorNo` at every vendor-assignment path** (`updateVendor`, `doApplyPortalPrices`, secondary-supplier apply). **NOW BEING BUILT IN F089** (a) — B106 inherits it; verify coverage, don't duplicate.
2. **Repair pass for existing mislabeled rows** (the new B106 core): find rows where `bcVendorName` and `bcVendorNo` disagree (name resolves to a different vendor than the number) — e.g. the 12 Heitek-as-Crum. These can't be auto-inferred (the number says Heitek, the intent was Crum), so the repair is: surface them for the user to re-select the correct vendor (which now stamps the right number), OR a targeted admin tool that re-resolves `bcVendorNo` from the displayed name where unambiguous. Scope both; Jon picks.
3. **Display-name-from-number** — resolve the Supplier column name via `bcGetVendorName(bcVendorNo)` (or refresh the cached name on match) so it can't drift again once the number is right.

Effort: forward-fix = F089 (done). Repair + display-resolve = the B106 build. No BC-admin action needed.

---

## ★★ v1.25.0 BUILD-READY REFRESH (Coach lane, 2026-08-07 — post-F089 ship)

Re-grepped against current `src/app.jsx` (v1.25.0). **The plan's earlier line anchors are stale (v1.24.97).**

### Re-anchored sites (current v1.25.0)
| Site | Current line | Note |
|---|---|---|
| `updateVendor` | :31622 (F089 block :31625-31631) | now stamps `bcVendorNo` best-effort |
| `doApplyPortalPrices` | fn :44407; writes :44620/:44623/:44625; vendorNo :44529-44541 | stamps number (fuzzy) |
| portal **add-rows** (BOM-empty) | :44345 | **name-only — GAP #1** |
| secondary/ItemBrowser pick | :31427-31428 | stamps number (may be "") |
| `doAutoAssignApply` | :39819 (write :39827) | both, correct |
| scraper apply | :45234/:45242 | both, correct |
| **SQ-import apply** | :45678 | **name-only — GAP #2** |
| Supplier-column render | :34252-34253 | reads stored string |
| RFQ grouping (renamed `buildRfqSupplierGroups`) | :8120; keys :8173/:8188-8192 | WYSIWYG comment :8175-8181 |
| `bcGetVendorName` / `bcResolveVendorName` (sync) / `_vendorMapCache` | :7542 / :7501 / :7492 | map `{number:displayName}` |
| **F089 transitional supplier-LT guard** | **:32084-32085** | `if(r.leadTimeSource==="supplier"&&!forceFresh)return false;` |
| G028 Push-LT btn/fn | :33714 / `pushAllLeadTimesToBc` :31698 | → ItemVendorCatalog |
| G028 Sync-BC btn/fn | :33740 / `syncPlanningLinesToBC` :29591 (+ :4408) | → Job Planning Lines |

### F089 coverage verdict
Closed the 3 core assignment paths (`updateVendor`, `doApplyPortalPrices`, secondary-pick) + auto-assign + scraper. **2 residual name-only writers remain: portal add-rows :44345 and SQ-import apply :45678.** Also `doApplyPortalPrices` stores a supplier-label name with a *fuzzy-matched* number → can itself mint a name≠number row (new class the repair predicate must catch).

### Repair mechanism — Coach recommends user-driven, NEVER auto
Auto-repair from the number would "correct" the 12 rows' display back to **Heitek** (opposite of intent). Auto-from-name only works when the name resolves to exactly one vendor ("Crum Electric"→V00179 here, but that's luck not a rule) and would silently rewrite a `bcVendorNo` — forbidden by the CARDINAL RULE. **Repair = the user re-selects the correct vendor** (stamps number+name together, same shape as `doAutoAssignApply`), routed through the B104 funnel `saveProjectPanel(...,_noBumpWrite:true)` (pattern @ :31193), re-PATCHing the BC ItemCard `Vendor_No` (mirror :31644). Detection predicate: for each non-labor row with non-blank number+name, flag when `normVendorName(bcResolveVendorName(bcVendorNo)) !== normVendorName(bcVendorName)` (compare against BC master name, not a stripped stem). Change-only, logged via `_logQvHistory` (:31701, old→new = reversible), preserves all non-vendor fields.

**Minimal vs full (the Jon fork):** the 12 known rows can be repaired with **zero new code** — Jon re-picks the correct vendor via the now-fixed `updateVendor` picker. A reusable **"repair vendor identity" scan** (surfaces name≠number rows across projects for one-click re-select) is the value-add for the residual-gap/fuzzy drift, but is optional.

### Display-name-from-number — Coach recommends SKIP for B106
Once repair stamps number+name together and forward paths persist the number, the stored value is correct and the 2026-07-30 WYSIWYG rule (:8175-8181) holds. A display-time `bcResolveVendorName` at render + grouping would contradict that ruling → Jon-gated. Recommend decline; rely on write-side + repair.

### LT-guard removal (:32085) — hard precondition
Remove **only after** the repair backfills a correct `bcVendorNo` on every legacy `leadTimeSource==="supplier"` row AND a zero-name≠number verification passes. Removing it before repair re-opens the exact clobber it prevents (a Refresh would read Heitek's LT and overwrite the firm Crum supplier LT). Distinct gated step, not bundled into the repair commit. (Companion firm-LT predicate @ :17756 is unrelated — leave it.)

### G028 — NOT a clean merge
Sync-BC (:33740→:29591, Job Planning Lines) and Push-LT (:33714→:31698, ItemVendorCatalog) differ on: gating (Push-LT blocks on `ownerPriorityActive`+`bom.length>0`; Sync-BC on `bcProjectNumber`, no owner-priority block), pre-flights (Push-LT runs Page-114 discovery + a #188 dead-`bcVendorNo` heal that Sync-BC lacks), and error surfaces (Sync-BC = `bcSyncStatus` state machine; Push-LT = arcAlert + pending pill). A merged "Sync to BC (both, sequentially)" is feasible but needs the union of gates + both pre-flights + a unified status surface — a real build, not cosmetic. **Recommend scoping G028 as its own item, kept OUT of the B106 money-path change.** Sequence: sync planning lines → then push LT (abort LT push if planning-line sync errors).

### Jon decisions blocking the B106 build
1. Repair shape: **minimal** (Jon re-picks the 12 rows via the fixed picker) vs **full** (add the reusable name≠number detection/repair tool).
2. Close the 2 residual name-only writers (:44345, :45678) in B106? (Coach: yes.)
3. Display-resolve safety net? (Coach: decline — keep WYSIWYG.)
4. Confirm LT-guard removal is a separate gated step after backfill verification. (Coach: yes.)
5. G028: merge vs keep separate vs merge-as-its-own-build. (Coach: separate item; a merge is non-trivial.)

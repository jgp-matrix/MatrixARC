# STEP 2 — ARC→BC One-Time Price Reconcile — Design & Decisions

**Author:** Sam Wize (Coach) · Read-only trace, no code changed · 2026-07-29
**Status:** DESIGN — awaiting Jon's decisions (§8) before any build. No writes proposed yet.

## 0. Executive summary
Step 1 (the `loadBcPurchasePrices` bulk load) populated BC `PurchasePrices.Direct_Unit_Cost` from the Excel Item Master at `Starting_Date 2026-01-01`. Step 2 is a **second, one-time reconcile**: for every priceable BOM row across all projects, compare ARC's price to the BC price for that item+vendor and, where they differ, PATCH BC to ARC's value (ARC = source of truth, this once). The single hard problem is **N-to-1 collision**: one BC item+vendor can appear in many BOMs at different ARC prices, but BC holds one catalog value per item+vendor. That collision rule is the decision Jon must make (§3, §8). Everything else reuses proven F072 / `loadBcPurchasePrices` mechanics.

## 1. ARC's BOM-row price model
| Field | Meaning | Notes |
|---|---|---|
| `unitPrice` | **The per-unit COST — the reconcile field.** | Naming trap: despite "Price", every BC read writes `Direct_Unit_Cost`→`unitPrice` (:5482/:5846/:16704/:16717). Quote markup is applied downstream, not stored here. |
| `unitCost` | BC-lookup result object field only | On `bcLookup*` returns (:5321/:5503/:5530), NOT a persisted row field. Do not reconcile on it. |
| `priceSource` | Provenance | `"bc"`, `"manual"`, `"scraper"`, `"supplier"`, `"ai"`, `""`. |
| `priceDate` / `bcPoDate` | Pricing timestamp | `_effectivePriceDate(r)` (:17496) = `bcPoDate` when `priceSource==="bc"`, else `priceDate`. Use for any recency tiebreak. |
| `bcNo` | BC item No. (post-#163 `MTX-#####`) | `_bcNo(row)` :5272; `_hasBcBinding` :4454. |
| `bcVendorNo` / `bcVendorName` | Resolved BC vendor | The item+vendor key half. Many manual rows have a price but no `bcVendorNo`. |
| `isCrossed`/`crossedFrom` | Alternate/superseded part | Crossed row's `unitPrice`+`bcNo` already reflect the replacement; reconcile as-is. |

**SSOT predicates:** `_hasPrice(r)= unitPrice!=null && +unitPrice>0` (:17427). **Reconcile field = `unitPrice` vs BC `Direct_Unit_Cost`, keyed `(bcNo, bcVendorNo)`.**

## 2. How ARC reads a BC purchase price today
`bcFetchPurchasePrices(partNumbers,{preferredVendors})` (:6286) — `PurchasePrices` OData, `$select=Item_No,Vendor_No,Direct_Unit_Cost,Starting_Date,Unit_of_Measure_Code`, 30/batch. Precedence (F041, :6293): item's primary/default vendor's newest record, else newest `Starting_Date` across vendors (this fixed the PRJ402119 junk-$0.71 incident). `bcFetchPurchasePricesMultiVendor` (:6582) is the same keyed item+vendor — the shape this reconcile needs. **BC `Direct_Unit_Cost` per item+vendor is exactly what ARC reads/prices from.**

## 3. The core ambiguity (THE decision) — N ARC prices, 1 BC value
Same `(bcNo, bcVendorNo)` recurs across many projects, each row a potentially different `unitPrice`. BC holds ONE value per item+vendor (write lane: `Currency''`, `Variant''`, `MinQty 0`, matching UoM — :6202). Collapse rule options:

| Option | Rule | Pro | Con |
|---|---|---|---|
| A. Most-recent wins | newest `_effectivePriceDate` | matches ARC's own F041 read precedence; intuitive | stale-but-correct manual loses to newer scraper/AI |
| B. Only-consistent | reconcile only if all ARC rows agree (within tol); report conflicts, push nothing | safest — never picks arbitrarily | leaves conflicted items un-reconciled (likely large) |
| C. Highest | push max `unitPrice` | conservative on cost | arbitrary; rewards outliers |
| **D. Source-priority + recency** | rank `manual`/`bc`/`supplier` over `scraper`/`ai`, then newest within top rank | trusts human-vetted prices; auto-drops AI guesses | more rules to agree |

**Coach recommends D + a mandatory conflict list in the dry-run** (every item+vendor whose in-rank rows disagree beyond tolerance is surfaced for Jon, never silently collapsed). Rationale: under the RFQ-only freeze (scraper/AI OFF post-PRJ402119), the trustworthy prices are `manual`/`bc`/`supplier`. If Jon wants zero judgment calls, fall back to pure A (matches existing read behavior). **Jon's call.**

## 4. Match definition & tolerance
Compare chosen `unitPrice` vs current BC `Direct_Unit_Cost` for the item+vendor. **Float tolerance:** equal if `|arc-bc| <= 0.005` (half-cent; BC is 2-decimal — avoids PATCH churn). **$0/missing:** if `!_hasPrice(row)` → **skip, never push $0** (F072 M1 rule, enforced :24917). Reconcile only pushes `unitPrice > 0`.

## 5. Scope filters
In scope = real BC item + resolvable vendor + valid ARC price: (1) `_hasBcBinding` non-blank `bcNo` (:4454); (2) `bcVendorNo` present; (3) `_hasPrice` `unitPrice>0` (:17427). **Exclude** via `_isExcludedFromPriceCheck` (:17447 — labor/customerSupplied/contingency/Matrix Systems/buyoff/crate), reusing the server-side `_cfIsNonItem` port (reconcileBcNos :687). Rows failing 1–3 are **reported un-reconcilable, never guessed**.

## 6. Mechanism — recommended
**Path 1 (recommend): new server-walk CF that computes the ARC-derived list, then reuses the Step-1 write core.** Model the walk on `reconcileBcNos` (:635 — admin gate, dryRun default, isTestCompany force-dry, field-level discipline, durable status, `assertBcODataBase` SSRF pin); the collapse rule (§3) yields the same `{no,vendorNo,uom,cost}` shape `loadBcPurchasePrices` consumes, and each write goes through the same `_cfPpKeyUrl` + `_cfPatchFreshEtag` + expire mechanics — **money-path write code identical to the just-validated Step-1 path; only the source of the list changes.** Path 2 (feed `loadBcPurchasePrices` a client-computed list) rejected — its input is a bundled `require`, and passing a large list over the callable is the fragile transport that CF deliberately avoided.

**Dry-run mandatory + previews every delta:** per in-scope item+vendor → `{bcNo, vendorNo, arcPrice, arcSource, arcDate, bcCurrentPrice, delta, action: match|update|conflict|skip-$0|no-vendor}`. Only explicit `dryRun:false` writes. Mirrors the `bcReconcileStatus`/`bcPpLoadStatus`+`bcPpLoadRuns` audit patterns.

## 7. Data-safety & reversibility
- **Same-day PATCH-in-place, not a new record.** Step 1 wrote the `2026-01-01` record, so Step 2 lands on `scopedSameDay` → PATCHes `Direct_Unit_Cost` in place via a fresh etag (`If-Match:*` 409s on this tenant). Keep `Starting_Date`=Step-1's value. No new dated record, no duplicate lane.
- **Scope-lane guard (load-bearing):** only `UoM==push AND Currency'' AND Variant'' AND MinQty 0` (:6202) — never touch FX/variant/volume-break lines.
- **Never leave price-less:** write-first/expire-after ordering already baked in.
- **Audit = rollback map:** persist `{bcNo, vendorNo, oldBcCost, newArcCost, arcSource}` to `companies/{cid}/bcPpReconcileRuns/{ts}` (re-push `oldBcCost` to reverse).
- **After Step 2:** BC = source of truth; ARC = initial-write + future-change via existing F072 `bcPushPurchasePrice`. One-shot; guard re-run with a `bcPpReconcileStatus` doc.

## 8. Open decisions for Jon (answer before build)
1. **Collision rule (§3) — the big one:** A / B / C / **D (Coach rec: source-priority + newest, + mandatory conflict list)**.
2. **Match tolerance (§4):** exact / **±$0.005 (rec)** / % band.
3. **ARC price field (§1):** confirm reconcile uses **`unitPrice`** (row cost), not a marked-up/sell figure. (Coach confident; needs explicit OK — name misleads.)
4. **$0 / missing-vendor rows:** confirm **skip + report** (never push $0, never guess a vendor).
5. **Vendor scope:** reconcile **only the row's `bcVendorNo`** lane (Coach: skip+report no-vendor rows).
6. **Starting_Date:** reuse Step-1's **`2026-01-01`** for the same-day PATCH (rec) / stamp today.

No build recommended yet — design + the six decisions above for approval.

# F041 — Primary/Secondary Supplier Matrix — Analysis & Options

**Author:** Freddy Lyst (analyst) · **Code trace:** Coach (Sam Wize) · **Date:** 2026-07-23
**Status:** ANALYSIS — no build.

## ✅ Decisions locked (Jon, 2026-07-23)
- **Axis 1 — Source of truth: HYBRID.** BC ItemCard `Vendor_No` seeds primary; ARC overlays ranking +
  overrides + enforcement layer.
- **Axis 2 — Enforcement posture: SOFT-GATE (near-term).** Default to primary; one-time confirm + a
  Purchasing-visible flag when a salesman prices off-primary. Hard-gate deferred to the Purchasing module.

**Still open:** granularity (per-item vs per-manufacturer), Sales↔Purchasing handoff (Jon working through
the flow), reconcile-vs-supersede `manufacturerVendorMap`. See "Decisions needed" below.

---

## The problem (as stated by Jon)

Salesmen are pricing BOM items from suppliers that are **not** the company's primary source for
that item. Purchasing then has to re-source or reconcile, causing friction. Jon wants a
**Primary/Secondary supplier matrix**: every BOM item defaults to its **primary** supplier's
sourcing/pricing unless Purchasing deliberately sources from a **secondary**.

**Constraints:**
- ARC has **no Purchasing module yet** — purchasing is done in an old external system.
- The Sales↔Purchasing flow is still being worked out by Jon.
- BC integration exists and "may already model this."

---

## What BC actually does (resolves Jon's uncertainty)

BC gives you a **primary, but not a true ranked matrix**:

- **Item card → `Vendor No.`** = the item's single **default (primary) vendor.** BC auto-inserts it
  (and its price/lead time) on purchase lines and requisition-worksheet suggestions.
- **Item Vendor Catalog** (the `Item Vendor` table) = a **flat, unranked list** of every vendor that
  can supply the item — each row carries `Vendor Item No.`, `Lead Time Calculation`, and pricing (via
  purchase price lists). These are the "secondaries."
- **Gap:** no native rank-1/rank-2 tiering. BC = **primary + alternates pool**, not an ordered
  primary/secondary/tertiary matrix. Strict ranking would be layered on by ARC.

**Net:** BC is a legitimate system-of-record for *which vendor is primary per item* and *who else can
supply it*. What BC can't do is your actual problem — stop a salesman's off-primary price from landing
on the ARC quote.

---

## What ARC does today (code-grounded — Coach trace)

**Headline: there is no primary/secondary concept on a BOM row today, and a salesman can freely put a
non-primary vendor's price on a row — nothing checks it against any primary.** But the substrate exists.

### Row fields (all preserved on save)
- `bcVendorName` / `bcVendorNo` — the vendor stamped on the row. **Freely overwritable**, no validation.
- `priceSource` — `"bc"` | `"manual"` | `"ai"` | null. **Collapses BC/scraper/supplier-portal all into
  `"bc"`** (deliberate, v1.19.1026). So `priceSource` does **not** tell you which supplier priced a row —
  only `bcVendorNo` does, and that's overwritable. No provenance field distinguishing suppliers.
- `bcPoDate`, `priceDate`, `bcVerify` — price timestamps/verification.
- `leadTimeSource` — has a real ranked precedence: `supplier → scraper → bc_vendor → bc_item → manual → ai`.

### Pricing precedence — the crux
There is **no single ranked pricing function** (unlike lead times). Precedence is emergent from ordered
passes in `runPricingOnPanel`: **`manual` > (BC / scraper, whichever is fresh) > `ai`.** Manual is sticky
and wins over everything. **No stage consults a primary supplier.**

### Three doors that put a non-primary price on a row (none gated)
1. **Manual entry** (`applyConfirmedPrice`, vendor pick `~28045`): salesman types a price, picks **any
   vendor** from the full vendor list, and ARC **pushes it to BC** (`Unit_Cost` on the ItemCard + a
   `PurchasePrice` for the chosen vendor). **No check that the vendor is the item's primary.** ← the vector Jon described.
2. **Free vendor reassignment** (`updateVendor`): sets `bcVendorName` with zero validation.
3. **Supplier-portal apply** (`doApplyPortalPrices`): the RFQ-winning supplier's name + a per-vendor
   `PurchasePrice` land on the row — again no primary check.

### BC integration already in place
- **`bcGetItemVendorNo(itemNo)`** already reads BC ItemCard `Vendor_No` (the primary). Used to stamp the
  row vendor during pricing and as the RFQ routing fallback.
- **`bcLookupItemVendorLeadTime(part, vendorNo)`** reads Page 114 ItemVendorCatalog per vendor.
- **`bcFetchPurchasePricesMultiVendor`** already fetches **all** vendor prices per part — but is only
  used for archive/drift detection, **not** live pricing. Ready-made building block for
  "compare row price to the primary's price."
- Live pricing currently fetches **one** vendor (the default / most-recent price), not all.

### RFQ routing already prefers the primary (as a fallback)
`buildRfqSupplierGroups`: uses the row's `bcVendorName` if present; **else resolves BC ItemCard default
vendor** via `bcGetItemVendorNo`. So primary-as-default already exists in RFQ routing — but only as a
blank-fill fallback, not enforced.

### ⭐ The most important finding — this is NOT greenfield
**A manufacturer→vendor preference learner is already shipped** (`manufacturerVendorMap`, plan
`docs/superpowers/plans/2026-05-12-auto-assign-suppliers.md`):
- Storage: `users/{uid}/config/manufacturerVendorMap` — per-manufacturer vendor usage counts
  (`{vendorNo, vendorName, count, lastUsedAt}`).
- "Most-used vendor per manufacturer wins" heuristic; **fills blank vendor rows only** (never overrides);
  user confirms in `AutoAssignVendorsModal`; Stage 2 pushes picks to BC ItemVendorCatalog.
- It is **preference-by-manufacturer, count-based, blank-fill-only** — NOT an authoritative per-item
  primary designation, and it does **not** warn/gate when a salesman prices off-preference.

**Implication:** a Primary/Secondary matrix should **extend/reconcile with `manufacturerVendorMap`**, not
add a parallel store. This overlap is the single biggest design input.

### SSOT predicate home
The codebase has a documented single-source-of-truth predicate cluster (`_hasFirmLeadTime`, `_hasPrice`,
`_effectivePriceDate`, `_isBomRowFlaggedRed`). A new **`_isPrimarySupplier(row)` / `_effectivePrimaryVendor(row)`**
belongs right here — one predicate, consumed by both a row indicator and any gate ("factor the rule, not
the inputs" — CLAUDE.md).

---

## Two independent design axes

The design splits cleanly into two decisions that can be made independently.

### Axis 1 — Where does "primary supplier per item" live? (source of truth)

| Option | Primary lives in | Pros | Cons |
|---|---|---|---|
| **A — BC-authoritative** | BC ItemCard `Vendor_No` (already read) | One source of truth, shared with the old purchasing system, no ARC store to reconcile | Depends on BC item data being maintained; per-item only (BC has no ranked secondaries) |
| **B — ARC-owned matrix** | Extend `manufacturerVendorMap` into an explicit primary/secondary designation | Full control, works where BC item data is thin, supports true ranking + per-manufacturer OR per-item, reuses shipped code | A second source of truth to reconcile with BC; ARC becomes authoritative for something purchasing cares about |
| **C — Hybrid (recommended)** | BC `Vendor_No` = seed/primary; ARC overlay adds ranking + overrides + the warning logic | Best of both — leans on BC where data is good, ARC fills gaps + owns the *enforcement* layer | Most moving parts; needs a clear "who wins" rule when BC and ARC disagree |

### Axis 2 — How hard do we enforce? (posture — given no Purchasing module yet)

| Posture | Behavior | Fit for today |
|---|---|---|
| **1 — Surface only** | Row indicator + dashboard flag when priced off-primary; a "primary vs. actual" column | Lowest risk, immediate value, zero workflow disruption |
| **2 — Soft-gate (recommended near-term)** | Default sourcing to primary; when a salesman prices off-primary, a **one-time confirm** ("This isn't the primary supplier for this item — proceed?") + it's flagged for Purchasing visibility | Matches "no nag-modals for known-safe behavior" (warn only on genuine off-primary); catches the problem at entry without blocking legit secondary sourcing |
| **3 — Hard-gate** | Block off-primary pricing unless a role (Purchasing/manager) authorizes the secondary | Right long-term once the **Purchasing module** exists and roles are wired; premature today (purchasing is external) |

---

## Recommendation

**Axis 1 → C (Hybrid), Axis 2 → 2 (Soft-gate), built as a small first slice.**

Rationale: the enforcement problem (a salesman's off-primary price silently winning) is separable from
the eventual full purchasing workflow. We can solve the *visible* pain now — default to primary + warn on
off-primary + make it visible to Purchasing — **without** waiting for the Purchasing module, and reuse
the already-shipped `manufacturerVendorMap` + `bcGetItemVendorNo` + the SSOT predicate pattern.

**Suggested slice order (for a later build, not now):**
1. **Slice 1 — Surface (S–M).** Add `_effectivePrimaryVendor(row)` + `_isPrimarySupplier(row)` predicates
   (seeded from BC `Vendor_No`, overlaid with `manufacturerVendorMap`). Add a row indicator + a MY DASHBOARD /
   BOM column showing primary vs. actual. Read-only, zero enforcement — proves the data is right first
   (matches the "prove it's active with a runtime artifact" discipline).
2. **Slice 2 — Soft-gate (M).** One-time confirm at the three write doors (`applyConfirmedPrice`,
   `updateVendor`, `doApplyPortalPrices`) when the chosen vendor ≠ primary; stamp a flag Purchasing can see.
3. **Slice 3 — RFQ pre-selection (S).** Promote primary from "blank-fill fallback" to the *preferred*
   routing in `buildRfqSupplierGroups`.
4. **Slice 4 (deferred → Purchasing module).** Hard-gate + secondary-authorization workflow + true ranked
   tiers, once purchasing is in ARC and roles exist.

---

## Decisions needed from Jon (before any build)

1. ~~**Source of truth (Axis 1):**~~ ✅ **HYBRID** (Jon 2026-07-23).
2. ~~**Enforcement posture (Axis 2):**~~ ✅ **SOFT-GATE near-term** (Jon 2026-07-23).
3. **Primary granularity:** per-**item** (like BC `Vendor_No`) or per-**manufacturer** (like the shipped
   `manufacturerVendorMap`), or both? Determines how we reconcile with the existing learner.
   *Freddy default (assumed unless Jon overrides): **per-item primary is authoritative**, seeded/suggested
   by the per-manufacturer learner — matches how BC keys it and how a salesman thinks about "this part."*
4. **Sales↔Purchasing handoff (Jon still working through the flow):** since purchasing is external today —
   is the near-term goal purely *quote-time* correctness (salesman quotes off the primary), or does
   Purchasing also need an ARC signal/export ("this line was sourced off-primary, here's why")? **← the one
   genuinely open product question; no rush.**
5. **Reconcile vs. supersede `manufacturerVendorMap`:** *Freddy default (assumed unless Jon overrides):
   **extend** the existing learner — the matrix reads/writes it as the per-manufacturer seed and adds an
   explicit per-item primary + off-primary detection on top. No parallel store.*

---

## Open ambiguities (flagged, not guessed)

- `priceSource` can't distinguish suppliers (all "bc") — if the matrix needs true provenance, that's a new field.
- BC-as-truth vs. ARC-store is a genuine fork (Axis 1) — Jon's call.
- Overlap with the shipped auto-assign feature needs an explicit reconcile decision.
- `bcFetchPurchasePricesMultiVendor` (already exists, unused in live pricing) is the ready building block
  if we need to compare a row's price against the primary vendor's BC price.

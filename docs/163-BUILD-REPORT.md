# Coach / Freddy — #163 P1–P5 build report (Marc)

**Branch:** `feat/163-surrogate-key` | **Commit:** `e18a8163` | **Built:** 2026-06-26 (overnight, unattended) | **Base:** master tip `0f8a61fb`
**Spec:** Coach C109 Rev 4 (`docs/163-DETAILED-PLAN.md`). All client-side in `src/app.jsx`; **zero** `functions/index.js` changes.
**Scope of this run:** CODE BUILD ONLY — no deploy, no BC writes, nothing on master. Test-channel deploy + T1–T10 + Coach per-phase review are pending (morning, with Jon).

---

## Baseline (the 5-commit divergence, resolved)
`origin/master..master` = 5 commits, **all Coach doc/handoff** (C108 supplement + C109 Rev 1–4 + COACH.md) touching only `COACH.md`, `docs/163-DETAILED-PLAN.md`, `docs/163-SUPPLEMENT.md`. **No code.** Tree clean except untracked `docs/163-MARC-REVIEW.md`. No stop condition.

## Per-phase summary (`src/app.jsx`: +167 / −67)

| Phase | Change |
|---|---|
| **P0** | `_bcNo(row)` helper + `_resolveVendorItemNo(bcNo)` (ItemCard OData fetch). |
| **P1** | `commitBcItem` + pre-commit cross-detection resolve the full PN via `Vendor_Item_No` (ItemCard fetch when `bcItem._vendorItemNo` is absent — the v2/Part#/Description search paths don't map it). Resolution runs **before** the synchronous `.map` (it needs `await`). Capture surrogate as `bcNo`; stop overwriting `partNumber`. bg + fg pricing store `exact.number` as `bcNo`, look up by `_rowBcNo‖pn`, fuzzy input uses `_rowBcNo‖pn`, mutation sites write `bcNo` not `partNumber`. `applyBcItem` made `async`. |
| **P2** | All push/read sites → `_bcNo()`/surrogate: 2A/2B planning lines, 2C `bcReVerifyItems`, 2D `bcLookupItems`, 2E (6 `bcPatchItemOData` callers), 2F (10 `bcPushPurchasePrice` callers), 2G (3 of 4 lead-time upserts), 2H (8 read sites incl. the 4 I added: 6299/6305/23715/30445), 2I CSV (ItemCard `Vendor_Item_No` fallback + update by `bcItem.number`). Portal apply (`doApplyPortalPrices`) builds a `_bcNoMap` + `_portalBcNo` helper used by its price push AND lead-time upsert. |
| **P3** | `bcCreateItem`: omit `body.number` (BC auto-assigns `MTX-#####` — **confirmed by the BC-1 sandbox probe**); write full PN to `Vendor_Item_No` **outside** the `if(vendorNo)` gate; return `fullPN`; ItemCard-based pre-create dedup (reuses existing item by `Vendor_Item_No`, no duplicate). SQ "Create New Item" passes a full PN as `number`. |
| **P4** | Item Browser search results show `item._vendorItemNo‖item.number`; create-form label already "Part Number" — fixed the misleading `e.g. MTX-1234` placeholder. |
| **P5** | `applyLearnedCorrections` `.slice(0,20)` dual-match fallback: alternates (auto + non-auto), corrections, part library. |

## Verification (all green)
- `node validate_jsx.js` → **JSX OK**, bundle compiled (ran after P1, P2, and final).
- `node tools/check-scope.js` → **No NEW violations** (8 pre-existing baseline only). Confirms every `_bcNo` / `_resolveVendorItemNo` / `_portalBcNo` reference resolves in scope.
- **Completeness grep (hard gate): CLEAN.** Push/write hits all converted, BC-response values, or benign false-positives (`itemNo:` audit field + create-form prefill). Read hits all converted or BC-No. values (`bcItem.number`, `created.number`, `matchNo`, `panel.bcItemNumber`, `newPN`); the only raw-`partNumber` inputs left are inside `bcFuzzyLookup` (its own search term) by design.

## ⚠️ KNOWN-OPEN — for Coach's review (NOT resolved; flagged, not improvised)

1. **SQ push-modal lead-time site (~`31418`)** — the plan's 2G `_bcNoMap`-from-`project.panels` is **not applicable here**: `projectRef` is `useRef`-scoped to **ProjectView (~`36151`)** and is **not in scope** in the SQ push modal (`handlePush`). The SQ line items carry only `bcItemId` (GUID) + full `partNumber`, no `bcNo`. Left **as-is** (graceful degradation: a mismatched/failed lead-time write to ItemVendorCatalog — no ARC data loss, same surface as an unresolved vendor). **Needs a decision:** resolve the surrogate via an ItemCard-by-`Vendor_Item_No` lookup (the 3B dedup pattern), or thread the BC `No.` from the price-push loop (which already calls `bcLookupItemForQuote`). This is the one genuine plan↔code gap.

2. **Implementation deviation (helpers):** `_resolveVendorItemNo` and the 3B dedup hit `${BC_ODATA_BASE}/ItemCard` **directly** (the proven pattern in `bcLookupLeadTime` ~`4349` and `bcUpsertItemVendorLeadTime` ~`4404`) rather than the plan's `bcDiscoverODataPages()` indirection. Simpler, fewer round-trips, same endpoint. Flagging for awareness.

3. **Sibling learning-DB matcher (~`23727`/`23734`)** was **not** given the P5 `.slice(0,20)` fallback — the plan listed only the `applyLearnedCorrections` (~`10672`) path. If that sibling (auto-cross-on-extraction?) should match truncated DB entries too, it needs the same fallback. Candidate for consistency.

## Still pending (morning, with Jon)
- **BC-2** Vendor_Item_No backfill confirmation (BC-3 gate — sandbox currently has `Vendor_Item_No ≈ No.` on 244/250 items; backfill not yet run).
- **BC sandbox vs prod pin** for the test hosting target (BC env is a shared Firestore doc, NOT channel-isolated).
- Deploy to test channel: `node validate_jsx.js && firebase deploy --only hosting:test`.
- Run **T1–T10** on scratch projects against sandbox (incl. T1 step 8: both "All Fields" and "Part # Only" search paths).
- **Coach** full-diff review of `e18a8163`.

— Marc

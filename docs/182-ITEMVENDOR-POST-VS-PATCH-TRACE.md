# #182 — Item Vendor "EntityWithSameKeyExists" — Code Trace

**Status:** TRACE ONLY — no fix, no build. Fix scoping after Jon reviews.
**Date:** 2026-06-30 MDT · **Author:** Marc Masdev
**Pairs with:** Marc runtime read (PRJ402124: 0 created / 0 updated / 32 failed, all 400 `Internal_EntityWithSameKeyExists` on Item Vendor; 64 unique (item,vendor) pairs / 16 vendors).

---

## Headline

The Item Vendor write is **not** POST-only and the update branch is **not** missing. It's a real upsert (`bcUpsertItemVendorLeadTime`) with a working existence-check — but its **PATCH (update) branch 404s on BC Page 114**, and a **404-fallthrough deliberately re-POSTs a record the code already confirmed exists**, producing the 400 collision. The records pre-exist because an *earlier* run of the *same* function created them successfully (POST when they didn't yet exist).

---

## Q1 — The Item Vendor write: POST-only or upsert? Exact lines + key

**One function does all Item Vendor writes: `bcUpsertItemVendorLeadTime` ([src/app.jsx:4401](../src/app.jsx)).** It is an **upsert**, keyed by **(`Item_No`, `Vendor_No`)** compound key. Flow:

1. **Existence GET (4440)** — `GET /ItemVendorCatalog?$filter=Item_No eq '…' and Vendor_No eq '…'`. This is a clean "get item-vendor by key" and it **works**. If found, `existingRec` is set.
2. **Update branch — PATCH (4464-4491)** — for an existing record, PATCH via compound-key URL `…/ItemVendorCatalog(Item_No='…',Vendor_No='…')` (4468). On **this BC tenant's Page 114 (legacy NAV.* type), that PATCH returns 404.**
3. **The 404-fallthrough (4485-4488) — THE BUG:**
   ```js
   if(!ok&&lastErr&&/PATCH 404/.test(lastErr)){
     // BC NAV-type compound-key 404 — record exists in filter but can't be
     // addressed for PATCH; fall through to POST (create) instead.
     existingRec=null;
   }
   ```
   It nulls `existingRec` and falls to…
4. **POST/create (4493-4500)** — `POST /ItemVendorCatalog` → BC returns **400 `EntityWithSameKeyExists`** because the record *does* exist. Recorded as `POST failed: 400 …` (4500) — which is exactly the string shown in the push-result UI.

So: existence-check ✅ present and correct; update branch ✅ present but **fails (404)**; the failure handler **re-creates** → guaranteed collision on every already-existing record. "0 updated" = every PATCH 404'd; "0 created" = every POST collided; "32 failed" = all 32 pre-existed.

---

## Q2 — One path or two?

**One shared write function, multiple triggers — coordinated, not duplicated.** Every Item Vendor write in the app routes through `bcUpsertItemVendorLeadTime`; the only `ItemVendorCatalog` **CREATE** in the codebase is line **4494**, inside it. Triggers that call it:

- **`pushAllLeadTimesToBc()`** ([26817](../src/app.jsx) → upsert at 26878) — the "Push Lead Times to BC" button (this is what Jon hit; its `created/updated/failed` tally is the "0/0/32" alert).
- **Batched lead-time writeback flush** ([26255](../src/app.jsx)) — the debounced `_leadTimeBcQueue` flush + supplier-portal **Apply Prices** / Upload Supplier Quote (immediate flush).

**This refutes the "two uncoordinated paths" hypothesis.** Both triggers share the same upsert and the same existence-check. The **prior creation** the runtime data implied (rows carry `leadTimeSource: supplier/manual`, `priceSource: bc`) came from an **earlier successful run of this same function** — first time, the GET found nothing → POST created the record. Every subsequent run now: GET finds it → PATCH 404 → fallthrough → POST collides. The duplication is *temporal* (re-run), not *cross-path* (two writers).

---

## Q3 — Why exactly 32?

The selector is `pushAllLeadTimesToBc`'s qualifying filter ([26832-26838](../src/app.jsx)):

```js
const directlyQualifying = bom.filter(r=>{
  if(r.isLaborRow||_isExcludedFromPriceCheck(r))return false;
  const pn=(r.partNumber||"").trim();
  const vn=(r.bcVendorNo||"").trim();
  const ld=+r.leadTimeDays;
  return pn && vn && ld>0;          // ← non-labor, not excluded, has PN + vendor + leadTimeDays>0
});
```

(plus a second pass that live-resolves a vendor for `pn && !vn && ld>0` rows.) Of the 95 BOM rows / 64 unique (item,vendor) pairs, only the **lead-time-bearing** qualifying rows get an upsert attempt — **that subset is the 32.** Rows with `leadTimeDays<=0`, no resolvable vendor, labor, or excluded are skipped (not counted in created/updated/failed). All 32 fail because they all pre-exist and hit the PATCH-404→POST path.

---

## Q4 — Fix DIRECTION only (NOT implemented)

The pre-check Freddy proposed **already exists** (the 4440 `$filter` GET is the clean "get item-vendor by key," and it works). The defect is downstream:

1. **Primary fix — kill the 404-fallthrough-to-POST (4485-4488).** When the GET has **already confirmed the record exists**, a PATCH 404 must NOT be treated as "doesn't exist → POST." POSTing a confirmed-existing record can only collide. Two sub-options:
   - **(a) Make the update actually work.** Find a PATCH addressing form BC Page 114 accepts — e.g. use the `@odata.editLink`/`@odata.id` from the GET response (already captured as `odataId`, 4450, but currently only tried as a fallback URL), correct key escaping, or the SystemId if exposable. If a working PATCH exists, the update branch succeeds and the bug disappears.
   - **(b) If Page 114 PATCH is genuinely unsupported on this tenant:** when GET confirms existence and PATCH 404s, **SKIP** (treat as "exists; lead time unchanged/un-updatable") and report a clear status — never POST. This stops the error but **does not update the lead time**.
2. **"Treat the 400 as already-exists and continue"** (Freddy's alt route) — clears the *error* but **silently drops the lead-time update** (the PATCH never succeeded). Acceptable only if the lead time rarely changes after first creation; otherwise it masks a real "update didn't apply" gap. Lower-quality than (1a).

**Recommendation to scope:** investigate (1a) first — does `@odata.editLink` PATCH succeed on Page 114? If yes, that's the clean fix (real updates restored). If Page 114 PATCH is truly impossible, fall to (1b) explicit skip. Avoid the band-aid (2) unless lead-time updates are confirmed non-critical. **Coach should confirm against BC whether Page 114 supports any PATCH addressing.**

---

## Separate note (log, don't chase) — push concurrency / Firestore throttling

The 23:07 Firestore `resource-exhausted` / "Write stream exhausted" + heavy `bcPatchLaborPlanningLines` (90) / `bcPatchProgressBilling` (56) is **adjacent, not causal** to the 32 failures. Contributing factors visible in this trace: `bcUpsertItemVendorLeadTime` writes a `companies/{cid}/bcLeadTimeWrites` audit entry **per row** (4508), and a broader push fires many planning-line/progress-billing PATCHes + panel saves concurrently — a burst that trips Firestore write throttling. **Candidate follow-up finding** (push-concurrency/batching/backoff), separate from #182's POST-vs-PATCH defect. Flagging only.

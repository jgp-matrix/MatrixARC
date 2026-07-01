# #182 Detailed Plan — ItemVendorCatalog PATCH 3-Part Key Fix

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** APPROVED — build-ready (queued for Marc after #183)
**Builds on:** Marc's code trace (`docs/182-ITEMVENDOR-POST-VS-PATCH-TRACE.md`, commit `f26ea671`) + Coach BC probe v2 (confirmation PATCH returns 200)
**Root cause:** PATCH URL at line 4468 sends a 2-part key (`Item_No`, `Vendor_No`) but BC's `$metadata` declares a 3-part key (`Item_No`, `Vendor_No`, `Variant_Code`) → 404 → fallthrough nulls `existingRec` → re-POST → 400 `EntityWithSameKeyExists`
**Fix:** Add `Variant_Code` to the PATCH key (read from the existing record), delete the 404→POST fallthrough
**Tip:** master `07a29ee9` (v1.21.7)

---

## Overview

Three changes inside `bcUpsertItemVendorLeadTime` (lines 4401–4511): add `Variant_Code` to the GET
`$select`, build the PATCH URL with all 3 key segments, and delete the 404-fallthrough-to-POST block
that masked the real error.

**Total: ~3 lines changed, 4 lines deleted, 1 comment updated. One commit. One deploy.**

---

## §1 — Add `Variant_Code` to GET `$select` (line 4440)

The existence GET must return `Variant_Code` so the PATCH URL can include the record's actual value.

**Before (line 4440):**
```js
const existing=await bcGatedFetch(`${BC_ODATA_BASE}/ItemVendorCatalog?$filter=Item_No eq '${encodeURIComponent(pn)}' and Vendor_No eq '${encodeURIComponent(vn)}'&$select=Item_No,Vendor_No,Vendor_Item_No,Lead_Time_Calculation`,{
```

**After:**
```js
const existing=await bcGatedFetch(`${BC_ODATA_BASE}/ItemVendorCatalog?$filter=Item_No eq '${encodeURIComponent(pn)}' and Vendor_No eq '${encodeURIComponent(vn)}'&$select=Item_No,Vendor_No,Vendor_Item_No,Lead_Time_Calculation,Variant_Code`,{
```

One field added to `$select`: `,Variant_Code`. The `$filter` is unchanged — it still matches on
`Item_No` + `Vendor_No` only. **Safe: all 476 ItemVendorCatalog records are single-variant (0
non-empty `Variant_Code`, verified 2026-07-01 live BC read); the 2-part GET cannot return multiple
rows per (Item, Vendor), so `existingRec.Variant_Code` always resolves to `''` (the probe Test A
confirmed-200 case).** If variants are ever introduced, the GET filter would need a `Variant_Code`
clause added — but that is not the current state.

---

## §2 — Build PATCH URL with 3-part key (line 4468)

Read `Variant_Code` from the existing record and include it as the third key segment.

**Before (line 4468):**
```js
patchUrls.push(`${BC_ODATA_BASE}/ItemVendorCatalog(Item_No='${encodeURIComponent(pn)}',Vendor_No='${encodeURIComponent(vn)}')`);
```

**After:**
```js
const vc=encodeURIComponent((existingRec.Variant_Code||'').replace(/'/g,"''"));
patchUrls.push(`${BC_ODATA_BASE}/ItemVendorCatalog(Item_No='${encodeURIComponent(pn)}',Vendor_No='${encodeURIComponent(vn)}',Variant_Code='${vc}')`);
```

### Escaping

Follows the same pattern as `pn` and `vn` (line 4434–4435) and every other OData compound-key URL
in the codebase (lines 2992, 3077, 3087, 3097, 3172, 3182):
1. OData single-quote escape: `'` → `''`
2. URI-encode: `encodeURIComponent()`

For the common case (`Variant_Code` = `''`), `vc` resolves to an empty string and the URL
becomes `...Variant_Code=''` — exactly the form confirmed working by the probe (Test A, 200).

### Why read from `existingRec`, not from the function parameter

`bcUpsertItemVendorLeadTime` has no `variantCode` parameter (line 4401), and none of its 4 callers
(lines 26258, 26881, 31571, 37901) have variant info — BOM rows don't carry a variant field. The
GET already returns the existing record, so reading `existingRec.Variant_Code` is the correct
source. This handles:
- `''` variant (the common case) — works now, confirmed by probe
- Non-empty variant (edge case, if any exist) — the record's own Variant_Code is used, so the
  PATCH targets the exact record the GET found

---

## §3 — Delete the 404→POST fallthrough (lines 4485–4488)

**Delete entirely:**
```js
          if(!ok&&lastErr&&/PATCH 404/.test(lastErr)){
            // BC NAV-type compound-key 404 — record exists in filter but can't be
            // addressed for PATCH; fall through to POST (create) instead.
            existingRec=null;
          }else if(!ok){
```

**Replace with:**
```js
          if(!ok){
```

### Why delete, not keep as safety net

The fallthrough was a workaround for the 2-part key 404 — it treated "can't address for PATCH" as
"doesn't exist" and re-POSTed. With the 3-part key working, a PATCH 404 now means something is
genuinely wrong (record deleted between GET and PATCH, key mismatch, service unpublished). In all
those cases, re-POSTing is the wrong response:
- Record deleted → POST creates a duplicate with potentially stale data
- Key mismatch → POST creates a second record under the wrong key
- Service unpublished → POST also 404s

A PATCH failure should surface as `auditEntry.error` (line 4490) so the user sees a clear error
message, not a silent re-create that collides.

---

## §4 — Update the DECISION comment (lines 4436–4439)

**Before:**
```js
      // DECISION(v1.19.698): Page 114 'ItemVendorCatalog' uses legacy NAV.* metadata which
      // does NOT expose a SystemId property. Dropped SystemId from $select (previously
      // caused 400 BadRequest). PATCH uses the compound-key URL form, which BC accepts
      // once the service is actually published.
```

**After:**
```js
      // DECISION(v1.19.698, FIX #182): Page 114 'ItemVendorCatalog' uses legacy NAV.*
      // metadata with a 3-part key (Item_No, Vendor_No, Variant_Code) per $metadata.
      // No SystemId. PATCH uses the full compound-key URL; Variant_Code is read from the
      // existing record (typically '' for non-variant items).
```

Also update the comment at lines 4465–4466:

**Before:**
```js
          // DECISION(v1.19.698): Page 114 NAV.* type has no SystemId — compound-key URL is
          // the only way to address a specific record. @odata.id fallback kept for safety.
```

**After:**
```js
          // FIX #182: 3-part compound key (Item_No, Vendor_No, Variant_Code) per $metadata.
          // @odata.id fallback kept for safety (null on this tenant but may exist on others).
```

---

## §5 — What is NOT changed

| Item | Why untouched |
|---|---|
| GET `$filter` (line 4440) | Still filters on `Item_No` + `Vendor_No` only. ARC has no variant info; the filter returns all variants and `[0]` picks the first (correct for non-variant items). |
| POST body (lines 4456–4463) | No `Variant_Code` needed — BC defaults to `''` on create. The POST path only fires for genuinely-new records (`existingRec` null from GET). |
| POST path (lines 4493–4501) | Unchanged. Still fires when `!existingRec && !auditEntry.error` — i.e., only when the GET found nothing. |
| Function signature (line 4401) | No `variantCode` parameter added. None of the 4 callers have variant data; the fix reads it from the GET response instead. |
| Callers (lines 26258, 26881, 31571, 37901) | All unchanged. They pass the same args as before. |
| `odataId` fallback (line 4469) | Kept. It's a no-op when null (this tenant) but provides safety on tenants where `@odata.editLink` is populated. |
| PATCH retry loop (lines 4471–4483) | Unchanged. Still tries primary URL first, falls back to `odataId` on 404, bails on non-404 errors. |
| Audit entry structure (lines 4402–4413, 4507–4509) | Unchanged. `outcome` values (`created`/`updated`/`failed`) are the same. |
| Page-published check (lines 4429–4432) | Unchanged. |

---

## §6 — Regression surface

### PATCH URL change (§2)

The URL gains one key segment (`Variant_Code`). This makes the URL match BC's declared key per
`$metadata`. The probe confirmed this returns 200 for `Variant_Code=''`. For non-empty variants
(if any), the URL uses the record's own value — correct by construction.

### Fallthrough deletion (§3)

The only behavioral change: a PATCH 404 is no longer silently retried as POST. Instead it
surfaces as `auditEntry.error`. This is strictly better — the old behavior (re-POST) always
produced a 400 collision on existing records and was never useful.

### GET `$select` expansion (§1)

Adding `Variant_Code` to `$select` returns one additional field. No consumer of `existingRec`
is affected — the only new reader is the `vc` extraction in §2. Existing readers
(`Lead_Time_Calculation` at 4448, `@odata.etag` at 4449, `@odata.id` at 4450) are unchanged.

### Net regression risk

**ZERO unintended behavioral change.** The PATCH now succeeds where it previously 404'd. The
POST path for new records is byte-identical. The only removed code path (fallthrough) was the
bug itself.

---

## Test criteria

| # | Test | Method | Expected |
|---|------|--------|----------|
| T1 | **REAL UPDATE** — existing record, value changes | Pick an existing ItemVendorCatalog record (e.g. Item_No `00791`, Vendor_No `V00020`). Change its `leadTimeDays` to a different value via Push Lead Times. | PATCH returns 200. `auditEntry.outcome === "updated"`. BC record shows new `Lead_Time_Calculation`. |
| T2 | **CREATE** — genuinely new (item,vendor) | Add a lead time to a BOM row whose (item, vendor) pair has no ItemVendorCatalog record. Push. | POST creates the record. `auditEntry.outcome === "created"`. |
| T3 | **PRJ402124 re-push** — the original 0/0/32 scenario | Change at least one row's `leadTimeDays` to a different value BEFORE pushing. Re-run "Push Lead Times to BC" on PRJ402124. After push: eyeball the changed row's `Lead_Time_Calculation` in BC (via the audit entry's `previousLeadTime` vs new value, or a direct BC lookup) to confirm the update actually persisted — a 200 alone doesn't prove the value changed. | All 32 succeed as updates (`updated=32, failed=0`). No `EntityWithSameKeyExists` errors. The deliberately-changed lead time is reflected in BC. |
| T4 | **VARIANT-BEARING** — non-empty `Variant_Code` | Find a record with `Variant_Code !== ''` and push a lead-time update for it. | PATCH key includes the real `Variant_Code`, returns 200. |
| T5 | **T4 FALLBACK** — if no variant records exist in test data | Grep `Variant_Code` in a GET-all response. | If all records have `Variant_Code === ''`, note T4 as code-reasoned (the `vc` extraction at §2 handles non-empty values by construction — same escaping as `pn`/`vn`). |
| T6 | **GREP** — fallthrough deleted | `grep "PATCH 404" src/app.jsx` | Zero hits in `bcUpsertItemVendorLeadTime`. The `/PATCH 404/.test(lastErr)` block is gone. |

---

## Implementation sequence

1. Marc applies §1 (`$select`), §2 (3-part key URL), §3 (delete fallthrough), §4 (comments) in a
   single commit.
2. Marc runs T6 (grep verification) before committing.
3. Deploy via `deploy.sh`.
4. Jon runs T3 on PRJ402124 — the decisive test (32 failures → 32 updates).
5. Jon or Marc runs T1 (real value change, confirm it persists in BC).
6. Marc runs T2 (create path still works) on a test row.
7. Marc runs T5 to determine if T4 is testable or code-reasoned.
8. Coach verifies committed diff matches plan.

**Total: ~3 lines changed, 4 lines deleted, 2 comments updated in `src/app.jsx`. One commit. One deploy.**

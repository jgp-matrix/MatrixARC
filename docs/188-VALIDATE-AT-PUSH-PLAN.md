# #188 Validate-at-Push — Structural Fix Plan

**Author:** Sam Wize (Coach)  
**Date:** 2026-07-01  
**Type:** Planning only (no code)  
**Reviewed by:** [pending Coach review → Jon approval → Marc build]  
**Prerequisites:** Marc's traces `docs/188-VENDOR-NO-STALE-TRACE.md` + `docs/188-VENDOR-PROVENANCE-TRACE.md`

---

## 0. ROOT CAUSE (confirmed by both traces)

`pushAllLeadTimesToBc()` (line 26952) has a two-pass filter:

- **`directlyQualifying`** (line 26967): rows WITH `bcVendorNo` → uses cached value **without revalidation**
- **`needVendorLookup`** (line 26974): rows WITHOUT `bcVendorNo` → resolves live via `bcGetItemVendorNo` (correct)

The `directlyQualifying` pass is the bug. If BC renumbers/merges a vendor after ARC cached
`bcVendorNo`, the cached number is dead — `bcUpsertItemVendorLeadTime` sends it to BC and
gets `Internal_InvalidTableRelation`.

**Preserve-stale mechanism** (why re-pricing didn't fix it): the pricing path at line 27134
stamps `bcVendorNo: vNo||""` — but the `vNo` comes from `exact.vendorNo||await bcGetItemVendorNo(...)`,
which resolves from the BC *PurchasePrice* record or *ItemCard* at that moment. If the item
has no PurchasePrice record (SY50M-26-1A has none now), the fallback is `row.bcVendorNo||""` at
line 4926 in the pricing fallback chain — keeping the stale cached value.

---

## 1. VALIDATE-AT-PUSH: vendor-level check with item-level fallback

### Design: cheapest-first validation

The validate-at-push intercepts `directlyQualifying` rows before the push loop. Two-tier:

1. **Tier 1 — Vendor existence check** (cheap): collect unique `bcVendorNo` values from
   `directlyQualifying` rows. For each, call `bcGetVendorName(vendorNo)`. If it returns
   `""`, the vendor is dead. Cost: one call per unique vendor. `_vendorMapCache` makes
   already-seen vendors free (0 network calls).

2. **Tier 2 — Item re-resolution** (only for dead-vendor rows): rows whose vendor failed
   Tier 1 get re-resolved via `bcGetItemVendorNo(_bcNo(row))`, deduped by item number.
   This is the same live lookup `needVendorLookup` already uses. Cost: one call per unique
   item number among stale rows only.

### Why this approach (vs alternatives)

| Alternative | BC calls (50 rows, 3 vendors, 30 items) | #184 safe? |
|---|---|---|
| **This plan: vendor check + item fallback** | 3 vendor checks (cached=0) + 0 item lookups (normal case) | YES |
| Re-resolve every item | 30 `bcGetItemVendorNo` calls (no cache) | MARGINAL |
| Retry-on-failure (Marc's option b) | 0 upfront, but N failures before N retries | YES (but noisy) |
| Periodic background refresh | Batch scan of all rows | NO (#184 disaster) |

Normal case (no stale vendors): **zero additional network calls** (all vendors cached in
`_vendorMapCache`). Only stale-vendor rows trigger item-level re-resolution.

### Insertion point

Between line 26981 (`setPushingLeadTimes(true)`) and line 26983 (`const resolvedExtra=[]`).
The validation runs after the loading state is set, alongside the `needVendorLookup`
resolution, and before the `qualifying` array is assembled.

### Specification

```js
// #188: Validate cached bcVendorNo before push — stale vendor numbers
// cause Internal_InvalidTableRelation in BC ItemVendorCatalog writes.
const _staleVendorRows=[];
const _freshDirectly=[];
{
  const uniqueVendors=new Set(
    directlyQualifying.map(r=>(r.bcVendorNo||"").trim()).filter(Boolean)
  );
  const deadVendors=new Set();
  for(const vNo of uniqueVendors){
    const name=await bcGetVendorName(vNo);
    if(!name) deadVendors.add(vNo);
  }
  if(deadVendors.size>0){
    console.warn("[PUSH] Stale vendor(s) detected:",
      [...deadVendors].join(", "), "— re-resolving affected items");
  }
  for(const r of directlyQualifying){
    if(deadVendors.has((r.bcVendorNo||"").trim())){
      _staleVendorRows.push(r);
    }else{
      _freshDirectly.push(r);
    }
  }
}
```

Then **extend the existing resolution loop** (lines 26983–26995) to also process
`_staleVendorRows`. The loop already does exactly what's needed: `bcGetItemVendorNo` →
`bcGetVendorName` → push to `resolvedExtra` or `stillNoVendor`. Change:

```js
// BEFORE:
const resolvedExtra=[];
const stillNoVendor=[];
for(const row of needVendorLookup){
  // ... existing resolution ...
}

// AFTER:
const resolvedExtra=[];
const stillNoVendor=[];
const _allNeedResolution=[...needVendorLookup,..._staleVendorRows];
const _itemResolveCache=new Map();
for(const row of _allNeedResolution){
  try{
    const itemNo=_bcNo(row);
    let vNo=_itemResolveCache.get(itemNo);
    if(vNo===undefined){
      vNo=await bcGetItemVendorNo(itemNo);
      _itemResolveCache.set(itemNo, vNo||"");
    }
    if(vNo){
      const vName=await bcGetVendorName(vNo).catch(()=>"");
      resolvedExtra.push({...row,bcVendorNo:vNo,bcVendorName:row.bcVendorName||vName||""});
    } else {
      stillNoVendor.push(row);
    }
  }catch(e){stillNoVendor.push(row);}
}
```

And change line 26996 to use `_freshDirectly` instead of `directlyQualifying`:

```js
// BEFORE:
const qualifying=[...directlyQualifying,...resolvedExtra];

// AFTER:
const qualifying=[..._freshDirectly,...resolvedExtra];
```

### Dedupe via `_itemResolveCache`

The `_itemResolveCache` Map dedupes `bcGetItemVendorNo` calls by item number. If 5 rows
share item `SY50M-26-1A`, the live BC lookup fires once. The map is local to the push
operation — no cross-invocation leaking.

This also dedupes across `needVendorLookup` + `_staleVendorRows` — if a row appeared in
`needVendorLookup` (no cached vendor) AND a different row with the same item appeared in
`_staleVendorRows` (stale vendor), only one BC call fires.

### Persist healed vendors back to BOM

The existing persist-back block at lines 27025–27036 already handles `resolvedExtra` rows —
it writes `{bcVendorNo, bcVendorName}` back to the BOM via `resolvedIdMap`. Since stale-vendor
rows are added to `resolvedExtra` (with fresh vendor numbers), they're automatically persisted.
**No additional persist code needed.**

This means: after one successful push, the stale vendor is corrected in Firestore. Future
pushes won't hit the same stale vendor again.

### Confirmation dialog update

The existing confirmation dialog (line 27004) already reports `resolvedExtra.length` as
"rows had vendor resolved live from BC Item Card." With the fix, stale-vendor rows join
this count. No text change needed — the message is accurate (they WERE resolved live).

Optional: add a line if stale vendors were detected:

```js
${deadVendors.size>0?`\n\n(${_staleVendorRows.length} row${_staleVendorRows.length>1?"s":""} had stale vendor — re-resolved from current BC Item Card.)`:""}
```

This makes the vendor renumber visible to the user. Not blocking — omit if scope-creeping.

---

## 2. #184 INTERACTION — BC LOAD ANALYSIS

### Current push load (unchanged)

Per push, the existing code makes:
- 1× `bcDiscoverODataPages` (pre-flight check, line 26958)
- N× `bcGetItemVendorNo` for `needVendorLookup` rows (line 26987)
- N× `bcGetVendorName` for resolved rows (line 26989)
- N× `bcUpsertItemVendorLeadTime` for qualifying rows (line 27013) — each does:
  - 1× GET existing ItemVendorCatalog record (line 4493)
  - 1× PATCH or POST (line 4519 or 4532)

Total per qualifying row: 2-3 BC OData calls. For 50 qualifying rows: ~100-150 calls.
All through `bcGatedFetch` with 6-concurrent semaphore and 429 retry.

### Additional load from this fix

**Normal case (no stale vendors):**
- `uniqueVendorCount` calls to `bcGetVendorName` — but `_vendorMapCache` means most are
  instant (0 network calls). Cached vendors return synchronously from the in-memory map
  at line 5760.
- **Net additional network calls: 0** (assuming vendors were seen during pricing)

**Stale case (e.g., 1 dead vendor, 2 affected rows, 2 unique items):**
- 1× `bcGetVendorName("V00102")` → cache miss, 1 network call → returns ""
- 2× `bcGetItemVendorNo(itemNo)` → 2 network calls (or 1 if deduped)
- 1× `bcGetVendorName("V00111")` → may be cached from other rows, 0-1 network calls
- **Net additional network calls: 2-4**

**Worst case (all vendors dead, 50 rows, 30 unique items):**
- `uniqueVendorCount` `bcGetVendorName` calls (all miss) — say 3 vendors: 3 calls
- 30 `bcGetItemVendorNo` calls (deduped by item)
- ~3 `bcGetVendorName` for new vendor numbers
- **Net additional network calls: ~36** — still well within `bcGatedFetch`'s capacity

### Verdict: #184 safe

The fix adds essentially zero load in the normal case and modest load in the stale case.
The 6-concurrent semaphore prevents burst pressure. The dedupes (vendor-level and item-level)
ensure the cost scales with unique vendors/items, not total rows.

---

## 3. HEAL PRJ402124 — SY50M-26-1A & SY5100-5U1

### Automatic heal via fix

Once the fix deploys, the next "Push Lead Times to BC" on PRJ402124 will:
1. Detect V00102 as dead (Tier 1)
2. Re-resolve both items to V00111 (Tier 2)
3. Push with V00111 (succeeds)
4. Persist V00111 back to the BOM rows (existing persist-back block)

**No manual intervention required** — the user just clicks "Push Lead Times" again.

### Optional immediate heal (console one-liner)

If Jon wants to fix the cached vendor before anyone re-pushes, Marc can run after deploy:

```js
// Heal stale bcVendorNo on PRJ402124
const pid='PRJ402124';
const snap=await firebase.firestore().doc(
  `companies/${_appCtx.companyId}/projects/${pid}`).get();
const p=snap.data();
const panels=(p.panels||[]).map(panel=>{
  const bom=(panel.bom||[]).map(row=>{
    if(row.bcVendorNo==='V00102'){
      return{...row, bcVendorNo:'V00111'};
    }
    return row;
  });
  return{...panel, bom};
});
await firebase.firestore().doc(
  `companies/${_appCtx.companyId}/projects/${pid}`).update({panels});
console.log('PRJ402124: V00102 → V00111 on',
  panels.reduce((n,p)=>n+p.bom.filter(r=>r.bcVendorNo==='V00111'&&r.bcVendorName==='SMCUSA').length,0),
  'SMCUSA rows');
```

**Not required** — the fix handles it automatically. Only use this if someone needs the rows
fixed before the next push attempt.

---

## 4. EXPOSURE SCAN — stale `bcVendorNo` across projects

### Purpose

Size how many projects carry stale (dead) vendor numbers beyond PRJ402124.

### Approach: admin-console scan

After deploy, Marc runs a scan that collects all unique `bcVendorNo` values across all
projects, validates each against `bcGetVendorName`, and reports any that return "":

```js
// Scan for stale bcVendorNo across all projects
const projSnap=await firebase.firestore()
  .collection(`companies/${_appCtx.companyId}/projects`).get();
const vendorRows=new Map(); // vendorNo → [{projectId, partNumber}]
projSnap.forEach(doc=>{
  const p=doc.data();
  (p.panels||[]).forEach(panel=>{
    (panel.bom||[]).forEach(row=>{
      const vNo=(row.bcVendorNo||"").trim();
      if(!vNo)return;
      if(!vendorRows.has(vNo))vendorRows.set(vNo,[]);
      vendorRows.get(vNo).push({projectId:doc.id, partNumber:row.partNumber||""});
    });
  });
});
console.log(`Unique vendor numbers: ${vendorRows.size}`);
// Validate each unique vendor
const stale=[];
for(const [vNo, rows] of vendorRows){
  const name=await bcGetVendorName(vNo);
  if(!name){
    stale.push({vendorNo:vNo, rowCount:rows.length, projects:[...new Set(rows.map(r=>r.projectId))]});
    console.warn(`STALE: ${vNo} — ${rows.length} rows across ${[...new Set(rows.map(r=>r.projectId))].length} projects`);
  }
}
if(stale.length===0)console.log("No stale vendor numbers found.");
else console.log(`${stale.length} stale vendor(s), ${stale.reduce((n,s)=>n+s.rowCount,0)} total rows affected`);
```

### Load safety

This scan calls `bcGetVendorName` once per unique vendor number. Given `_vendorMapCache`,
many will be instant. Even with 100 unique vendors and a cold cache, that's 100 sequential
OData calls through `bcGatedFetch` — well within normal operating parameters.

### When to run

After the fix deploys. The fix's persist-back mechanism will auto-correct stale vendors
on future pushes, but the scan tells us the total exposure so Jon can decide whether
to proactively heal affected projects or let them self-heal on next push.

---

## 5. BC-ADMIN CONFIRMATION (open question)

Marc's provenance trace notes:

> V00102 was a REAL SMCUSA vendor number when ARC cached it, and BC has since
> renumbered/merged SMCUSA to V00111

This is the most likely explanation (the evidence is strong), but **Jon/BC-admin should
confirm** SMCUSA's vendor-number history:

- Was V00102 → V00111 a deliberate renumber? A vendor merge?
- Are there other vendors that were renumbered similarly?
- Is this a one-off (SMCUSA-specific) or a pattern (e.g., a batch vendor cleanup)?

The fix handles any cause — it validates at push time regardless of why the number is stale.
But knowing the history helps predict whether this will recur (batch cleanup = high risk of
more stale vendors; one-off renumber = low risk).

**Not blocking** — the fix deploys regardless. This is informational for exposure sizing.

---

## 6. COMPLETE CHANGE INVENTORY

| # | Line | What changes |
|---|------|-------------|
| 1 | After 26981 | NEW vendor validation block (Tier 1: unique vendor check) |
| 2 | After 26981 | NEW stale-row split (`_staleVendorRows` / `_freshDirectly`) |
| 3 | Line 26983–26995 | MODIFY resolution loop: merge `_staleVendorRows` into resolution pool, add `_itemResolveCache` dedupe |
| 4 | Line 26996 | MODIFY `qualifying` assembly: `_freshDirectly` replaces `directlyQualifying` |
| 5 | (optional) Line 27004 | UPDATE confirmation dialog to mention stale-vendor re-resolution |
| 6 | Post-deploy | Console exposure scan (section 4) |
| 7 | Post-deploy (optional) | Console heal for PRJ402124 (section 3) |

**Total code change:** ~25 lines added, ~3 lines modified. No new functions. No Firestore
schema change. No new fields. No new BC API endpoints.

### NOT changed:

- `bcUpsertItemVendorLeadTime` — unchanged, still sends `vendorNo` from the row
- `bcGetItemVendorNo` — unchanged, still resolves from ItemCard
- `bcGetVendorName` — unchanged, still resolves from Vendors API with cache
- `bcGatedFetch` — unchanged, semaphore and 429 retry intact
- `directlyQualifying` filter logic — unchanged, still filters on `pn&&vn&&ld>0`
- `needVendorLookup` filter logic — unchanged, still filters on `pn&&!vn&&ld>0`
- Existing persist-back block (lines 27025–27036) — unchanged, already handles `resolvedExtra`
- Pricing paths (`runPricingOnPanel`, background pricing) — unchanged. The preserve-stale
  mechanism at line 4926 / 27134 still operates as before. The fix is at push time, not
  cache time — intentional. Re-pricing with a fresh vendor lookup naturally corrects the
  cache, and the push validates before sending.

### Design choice: push-time vs cache-time fix

The fix validates at **push time** (when the stale vendor actually causes a failure), not at
**cache time** (when `bcVendorNo` is first stored during pricing). Rationale:

- **Push time** is the failure point — validate where it matters
- Cache-time validation would require intercepting all 12+ `bcVendorNo` write sites
  (Marc's trace lists: 4926, 15065, 15078, 27109, 27123, 15187, 27532, 26362, 26965,
  26018, 38518, 38521, 34092). Touching all of them is high blast radius.
- A vendor renumber in BC may happen long after caching — validating at cache time
  doesn't prevent future staleness
- Push-time validation + persist-back = self-healing. Each push corrects the cache.
  Over time, stale vendors are eliminated naturally.

---

## 7. EDGE CASES

### Transient `bcGetVendorName` failure

If `bcGetVendorName` returns "" due to a transient BC error (not a dead vendor), the row
gets unnecessarily re-resolved via `bcGetItemVendorNo`. The re-resolution returns the same
vendor number → the row proceeds unchanged. Extra work, no incorrect behavior.

### `bcGetItemVendorNo` failure for stale-vendor row

The row falls into `stillNoVendor` and is skipped — same behavior as the existing
`needVendorLookup` path. The user sees "N row(s) skipped — no vendor on BC Item Card."
The stale cached vendor is NOT sent to BC (no `Internal_InvalidTableRelation`). This is
strictly better than the current behavior (where the stale vendor IS sent and fails).

### Item no longer in BC

If the item was removed from BC entirely, `bcGetItemVendorNo` returns "". The row joins
`stillNoVendor`. The existing skip-and-report mechanism surfaces this to the user. No
silent failure.

### Concurrent vendor renumber during push

If a vendor is renumbered between the Tier 1 check and the push loop, the Tier 1 check
passes (vendor existed at check time) but the push fails with `Internal_InvalidTableRelation`.
This is the same failure mode as today — and is a race window that exists regardless of the
fix. The fix narrows the window (validates closer to push) but can't eliminate it entirely.
Not blocking — this is an edge case of an edge case.

### `copyProject` vendor carry-forward

Marc's trace notes `copyProject` (line 26018) carries `base.bcVendorNo||""` forward
unvalidated. A copied project inherits the source project's stale vendor. The fix handles
this at push time — when the copied project pushes lead times, the stale vendor is detected
and re-resolved. No change to `copyProject` needed.

---

## 8. UNBLOCKS

This fix closes #188 (`Internal_InvalidTableRelation` on push). No downstream tickets are
gated on #188.

The fix also provides a general defense against future vendor renumbers in BC — any stale
`bcVendorNo` is caught at push time, re-resolved, and healed. This is a durable fix, not
a one-off patch for V00102.

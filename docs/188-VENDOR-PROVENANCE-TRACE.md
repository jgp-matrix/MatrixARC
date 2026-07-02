# Freddy — #188 provenance trace: origin of bcVendorNo V00102 (READ-ONLY)

**To:** Freddy · **From:** Marc · **Date:** 2026-07-01 · **Diagnosis only, no writes, no fix**

Where V00102 came from on PRJ402124 rows SY50M-26-1A / SY5100-5U1, using the 5-row V00111 control.

## Evidence-based refinement of the framing
The brief says "not a renumber — V00102 is a phantom." **The data points the other way: V00102 was a
REAL SMCUSA vendor number when ARC cached it, and BC has since renumbered/merged SMCUSA to V00111**
(leaving V00102 absent — which is what makes it *look* like a phantom now). Worth Jon/BC-admin
confirming SMCUSA's vendor-number history. Either way the mechanism + fix are the same.

## 2-vs-5 field comparison (verbatim)
All 7 rows are structurally near-identical: `bcVendorName:"SMCUSA"`, `manufacturer:"SMC"`,
`leadTimeSource:"manual"`, `priceSource:"bc"`, `isCorrection:true`, `correctionFrom`=self, same
`sourcePageId`. The ONLY meaningful difference is the cached vendor number:

| Row | bcVendorNo | bcVendorName | priceDate | note |
|-----|-----------|--------------|-----------|------|
| **SY50M-26-1A** (bad) | **V00102** | SMCUSA | 1782240082437 | no PP record in BC now |
| **SY5100-5U1** (bad) | **V00102** | SMCUSA | 1782172800000 (date-only) | — |
| AXT100-DS25-015 | V00111 | SMCUSA | 1782240052437 | — |
| SV2000-55-1-10-A | V00111 | SMCUSA | 1781728179266 | has aiSources |
| SY50M-1-11AB1-N11 | V00111 | SMCUSA | 1781728068682 | has aiSources |
| SY50M-2-2DA-N7 | V00111 | SMCUSA | 1781728196658 | has aiSources |

The bad rows even have *later* priceDates than some good rows — so it is NOT simply "older cache."
See the preserve-stale mechanism below.

## Live BC right now (control confirms)
- Item Card `Vendor_No`: **V00111** for all four checked (incl. both bad items).
- Purchase Price `Vendor_No`: **V00111** (SY50M-26-1A has NO PP record now).
- `bcGetVendorName("V00102")` = **""**; `bcGetVendorName("V00111")` = **"SMCUSA"**.
→ V00102 exists nowhere in current BC; everything is V00111.

## The write path (§2/§4)
`bcVendorNo` is stamped onto rows at **pricing time** by `runPricingOnPanel`, e.g. the
`priceSource==="bc"` exact path (app.jsx:15061-15065):
```
const vNo = exact.vendorNo || await bcGetItemVendorNo(_rowBcNo||pn);
bcMap[row.id] = {... bcVendorNo: vNo||"", bcVendorName: vNo? await bcGetVendorName(vNo):"" ...}
```
So the number comes from the **BC item lookup's vendor** and the **name is resolved via
`bcGetVendorName(vNo)` at that moment**. Because the row cached `bcVendorName:"SMCUSA"`, V00102
resolved to SMCUSA **when cached** → it was a live BC vendor number then (not a never-existed value).

**All `bcVendorNo` write sites** (grep): pricing 4926 / 15065 / 15078 / 27109 / 27123, item-card
re-resolve 15187 / 27532 / 26362 / 26965, **copyProject 26018** (`base.bcVendorNo||""` — carries
source row's number forward, unvalidated), supplier-apply 38518 / 38521, bulk 34092.

**Preserve-stale mechanism (why later re-prices didn't fix it):** line 4926 stamps
`bcVendorNo: item.vendorNo || row.bcVendorNo || ""` — if a later pricing run returns no vendor, it
**keeps the existing cached number**. And `pushAllLeadTimesToBc` uses `row.bcVendorNo` directly when
present (only live-resolves when ABSENT). So once V00102 was cached, nothing revalidated or dislodged
it — later re-prices updated unitPrice/priceDate but preserved the stale V00102. That explains the
bad rows' newer priceDates with the old vendor number.

## Most likely origin
`runPricingOnPanel` cached `bcVendorNo=V00102` (with name "SMCUSA", validated then) from BC's item
lookup **before** SMCUSA was renumbered/merged to V00111. BC later dropped V00102 → V00111. ARC never
revalidates a cached `bcVendorNo`, so the dead number rode through to the BC push
(`Internal_InvalidTableRelation`). The 5 control rows carry V00111 because their number was resolved
at/after the V00111 state; the 2 bad rows retain the pre-change V00102.

## Fix scoping (yours — NOT implemented)
Revalidate `bcVendorNo` against the live Item Card at push time (or whenever the cached number's name
no longer resolves via `bcGetVendorName`), rather than trusting the cache. Cheap heal for the 2 rows:
re-resolve to V00111. Broader: a scan for rows whose `bcVendorNo` yields an empty `bcGetVendorName`
sizes the exposure (ties to the #188 stale-cache finding in docs/188-VENDOR-NO-STALE-TRACE.md).

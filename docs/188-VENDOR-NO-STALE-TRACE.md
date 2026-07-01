# Freddy — #188 runtime trace: stale Vendor No. on Push Lead Times (READ-ONLY)

**To:** Freddy (Analyst) · **From:** Marc · **Date:** 2026-07-01 · **Diagnosis only — no data written, no fix**

PRJ402124 "Push Lead Times to BC": 2 rows failed `Internal_InvalidTableRelation` — Vendor No.
**V00102** not in BC's Item↔Vendor relation. BC Item Browser shows the correct vendor is **V00111**.
Rows: **SY50M-26-1A**, **SY5100-5U1**.

## VERDICT: stale value cached on the row (not wrong-field, not bad lookup)

The item's BC vendor is **V00111 (SMCUSA)**, but ARC's rows still carry **V00102** in `bcVendorNo`
from an earlier pricing/resolution. V00102 is defunct (renumbered/merged), so BC rejects the
ItemVendorCatalog write. The push trusts the cached `bcVendorNo` and never re-checks BC.

## Evidence

### Q1 — what's stored on the rows (Firestore, verbatim)
Both rows on PRJ402124 (panel 0):

| partNumber | bcVendorNo | bcVendorName | leadTimeSource | leadTimeDays | priceSource |
|---|---|---|---|---|---|
| SY50M-26-1A | **V00102** | SMCUSA | manual | 60 | bc |
| SY5100-5U1 | **V00102** | SMCUSA | manual | 60 | bc |

`V00102` is stored **directly on the row** (`bcVendorNo`). Not computed at push time. (SY5100-5U1
also has `bcNo: "SY5100-5U1"`.)

### Q2 — which field the push sends
`pushAllLeadTimesToBc` (src/app.jsx:26923) → `bcUpsertItemVendorLeadTime({... vendorNo: row.bcVendorNo ...})`
(app.jsx:26984). `bcUpsertItemVendorLeadTime` (4429) sends that value straight through as BC
`Vendor_No` (4486). **Critical:** the push has a two-pass filter — rows that already have
`bcVendorNo` ("directlyQualifying", 26938-26944) use the **stored value as-is**; only rows *missing*
`bcVendorNo` get a live `bcGetItemVendorNo` lookup (26956-26965). So for these rows the cached
V00102 is sent verbatim — BC is never re-consulted.

### Q3 — what BC / the Item Browser resolves live
`bcGetItemVendorNo(itemNo)` (app.jsx:5739) reads BC **`ItemCard.Vendor_No`** — the item's Purchase →
Vendor No., the same field the BC Item Browser displays. Live read just now (BC connected):

- `bcGetItemVendorNo("SY50M-26-1A")` → **V00111**
- `bcGetItemVendorNo("SY5100-5U1")` → **V00111**
- `bcGetVendorName("V00111")` → **"SMCUSA"**  ·  `bcGetVendorName("V00102")` → **""** (no such vendor)

The empty name for V00102 is the tell: it's not a current BC vendor. V00111's name (SMCUSA) matches
the row's cached `bcVendorName`, so the vendor is the same company — only the **number** is stale.

### Q4 — which of the three
- **STALE cache** ✅ — row `bcVendorNo` = V00102 (defunct); live Item Card = V00111. The number on
  the row was cached earlier (priceSource "bc") and never refreshed when BC's Item Card vendor
  changed / SMCUSA was renumbered.
- **Wrong-field read** ❌ — push and browser both target the item's vendor number; the push just reads
  a **stored copy** (`row.bcVendorNo`) instead of the **live** `ItemCard.Vendor_No`.
- **Bad name→number lookup** ❌ — no name→number resolution happens at push for these rows; the number
  is stored directly.

## For scoping (fix is yours to assign — NOT implemented)
The gap is cache invalidation: `bcVendorNo` is cached at pricing time and trusted forever. Candidate
directions (for you to weigh): (a) re-resolve/validate `bcVendorNo` against live `ItemCard.Vendor_No`
before pushing (or when the cached number's name doesn't resolve); (b) on an
`Internal_InvalidTableRelation` failure, re-resolve the vendor live and retry once; (c) periodically
refresh cached `bcVendorNo`. Blast radius beyond these 2 rows is unknown — any row whose BC vendor was
renumbered after ARC cached it is exposed; a scan of `bcVendorNo` values whose `bcGetVendorName`
returns empty would size it.

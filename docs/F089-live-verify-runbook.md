# F089 — Live single-row BC verify runbook (Jon's morning gate)

**For:** Jon · **Prepared by:** Freddy · **Date:** 2026-08-07
**Feature:** "🔄 Refresh Pricing + Lead Times" (BC match+price+LT pull → Mouser/DigiKey overwrite → write API price back to BC)
**Build status:** committed to master, on **Test V.080**, Coach SHIP-TO-TEST. Money-path invariants I1–I7 re-confirmed against the committed artifact (Freddy, 2026-08-07).

> **⚠️ RUN THIS ON PROD, NOT TEST.** The test host fakes BC writes (`bcGatedFetch` fake-200) — a "written to BC" toast on Test proves nothing about the write path. But F089 is **not on prod yet** (prod = v1.24.105 without F089). So the only true live verify is either (a) deploy F089 to prod first, then verify, or (b) verify the write path some other way. See "Deploy-order note" at the bottom — this is a Jon decision.

---

## Pre-requisites (confirm all before starting)

- [ ] **Live BC connected** — BC pill is **BLUE** in the toolbar (not grey/red).
- [ ] Testing from the **Claude-controlled tab** (or your own live tab — just be consistent; runtime findings are only valid from the same session).
- [ ] **Vendor mappings present** in Settings → Vendor Sync: **DigiKey = V00196**, **Mouser = V00304**. (Without these, the API→BC write skips with a "vendor number not linked" alert — that's negative case ③, not a pass.)
- [ ] A **throwaway / disposable BC-linked project+panel** — the refresh **writes real PurchasePrices to BC** and overwrites budgetary/manual prices. Do NOT run the first verify on a live customer quote.
- [ ] Console open + filtered to `[F089]`; and know where BC PurchasePrices live for the item you'll test.

---

## ① Positive path — the core write-path proof

1. On the throwaway BC-linked panel, **portal-apply a supplier quote** to one row (or manually assign a vendor to a BC-linked row).
   - ✅ **Confirm the row now carries the supplier's `bcVendorNo`** (the vendor *number*, not just the name). This is the F089 forward-fix — inspect the row object / BOM state.
2. Click **🔄 Refresh Pricing + Lead Times** → the amber confirm dialog appears → **Refresh**.
3. Watch for, in order:
   - Progress: "Getting prices…" → "Writing N prices back to BC…" → terminal toast.
   - ✅ **On-row:** `unitPrice` updated to the Mouser/DigiKey price, **`priceDate` = today**.
   - ✅ **Toast:** `✓ X of Y priced via Mouser + DigiKey · N written to BC` (the `· N written to BC` clause is the write confirmation).
   - ✅ **Lead time** pulled from BC on the row (`leadTimeSource` = `bc_vendor`, else `bc_item`).
4. **The decisive check — open BC directly:** the **PurchasePrice for that item + THAT vendor** (the row's `bcVendorNo`, e.g. DigiKey V00196) now equals the API price just applied on-row (**I4 parity**).
   - This is the one check the test host cannot fake. If the BC record matches the on-row price for the correct vendor, the write path is proven.

**Watch (backend):** debugLogs `source:"apiPricing"`; console `[F089]` lines. Report the toast text + any `[F089]` warnings to me and I'll interpret.

---

## ② Lead-time-on-the-row check (the vendor-on-row fix)

- On a row whose assigned vendor differs from the BC item's *primary* vendor, confirm the refresh pulled **that row's vendor's** lead time (not the primary's). This is the "honor the vendor ON the row" behavior (`r.bcVendorNo || primary`).
- **Note the transitional guard:** a legacy `leadTimeSource:"supplier"` row is **intentionally skipped** on a non-force Refresh (it has no persisted `bcVendorNo` yet — reading BC would clobber the firm supplier LT). A **Force Refresh (▾)** overrides. This guard is removed in B106 after the backfill — expected behavior, not a bug.

---

## ③ Negative cases — each must fail *safely*

| # | Setup | Expected (safe) result |
|---|-------|------------------------|
| a | **BC disconnected** (pill not blue) mid-refresh | On-row prices still apply + persist; toast shows `· N BC-skipped`; **nothing written to BC**; no throw/crash. (I2) |
| b | **Row not in BC** (no `bcNo`) | On-row price applies; that row gets **no BC write** (can't PurchasePrice a non-existent BC item). (I3) |
| c | **Unmapped vendor#** (clear DigiKey/Mouser # in Vendor Sync, then refresh) | `arcAlert`: "…BC vendor number not yet linked in Vendor Sync…"; price applied on-row but **not** written to BC. (I3) |

If any negative case **writes to BC anyway**, or **throws/crashes**, that's a STOP — do not deploy; report to me.

---

## Deploy-order note (Jon decision) — resolve before shipping

Two coupled decisions once verify passes:

1. **How to verify the write path when F089 isn't on prod yet.** Options:
   - **(A) Deploy F089 to prod first, then verify on prod.** Fastest, but ships an unverified-on-real-BC money-path change (mitigated: invariants confirmed + Coach SHIP-TO-TEST). If a negative case fails, you'd hotfix/revert.
   - **(B) Verify the write path against real BC without a full prod ship** — e.g. a BC sandbox, or a one-off local run pointed at live BC. More setup, safest.
   - My read: given the invariants are confirmed and the guard stack skips cleanly when anything's off, **(A)** with an immediate rollback plan is defensible for a single throwaway-panel verify — but it's your money-path call.

2. **Version bump.** F089 is a new capability → **minor** (v1.25.0) per the versioning rules. But `deploy.sh` only auto-bumps **patch** (would produce v1.24.106). Shipping as a minor needs a deliberate version set before/around the deploy — flag me and I'll handle the mechanics (without pre-tagging, which double-bumps).

---

## One-line summary for the gate
Portal-apply a vendor to a BC-linked throwaway row → **Refresh** → on-row price+today + `· N written to BC` toast → **BC PurchasePrice for that item+vendor == the on-row price**. Then the 3 negative cases fail safely. Pass → resolve deploy-order + minor-bump → ship.

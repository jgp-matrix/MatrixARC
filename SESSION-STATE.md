# SESSION-STATE.md — 2026-08-06 (EOD close-out, Jon away)

> **Operating model:** subagent-lane (`/ARC-team-Startup`). One Freddy (CCD) session; Marc/Coach run as in-session subagent lanes; Freddy is sole git-writer + owns all handoff files (incl. STATUS.md/INBOX.md).
> **🧳 PROD-FROZEN (Jon away EOD 2026-08-06).** Prod = **v1.24.105**. F089 is on **Test V.080**, Coach-approved, NOT on prod — awaiting Jon's morning single-row BC verify → prod. Away close-out skipped the deploy step.

## Current state
- **Prod version:** v1.24.105 (B105 was the last prod ship).
- **Test:** V.080 = F089 (Refresh Pricing + Lead Times), base v1.24.105.
- **master @ `1a6bbb56`**, in sync with origin. Working tree clean.
- **OPEN items:** see `## ⭐ NEXT UP` + `TODO.md`.

## What shipped to prod today (2026-08-06) — 13 items, v1.24.98 → v1.24.105
| ver | items |
|---|---|
| v1.24.98 | **B101** 6-rung status sequencer (§6d) + **B096** reviewer-only TR uncheck + approve-gate |
| v1.24.99 | **F092** sent-quote pinning + "Quote Expired – Re-Quote Now" + tile + 3 status/column renames (ADDRESS ISSUES / NEEDS BOM PRICING / IN TECH. REVIEW) |
| v1.24.100 | **F093** sent-quote "· EXPIRED" red tile flag |
| v1.24.101 | **G024** Export BOM modal + **G025** BOM-header buttons right-justified + **G026** Drawings-header real buttons |
| v1.24.102 | **F094** sent-quote "· Expires in N Days" amber countdown (≤10d) |
| v1.24.103 | **B107** labor-qty input remount fix (controlled `LaborQtyInput`) |
| v1.24.104 | **F095** manual labor-HOURS entry (per-group override inside computeLaborEstimate; MAN.OVERRIDE + RESET TO AUTO; all-zero guard) |
| v1.24.105 | **B105** BC Item Browser dash-agnostic search (`_bcNormPn` SSOT + fallback-on-empty) |

All Test-verified (Jon or Freddy-in-controlled-tab) + Coach-reviewed where money-path/logic.

## ⭐ NEXT UP (ranked)

**#1 — F089 "Refresh Pricing + Lead Times" (mid-flight, on Test V.080, Coach SHIP-TO-TEST, PROD-PENDING).**
The single "🔄 Refresh Pricing + Lead Times" button (replaced "Get Prices"): BC match + BC price + BC lead-time pull → API grab (Mouser/DigiKey) that always wins + writes back to BC (F071-guarded). Active-panel only. Now **honors the vendor ON the row** for BOTH price + lead-time (persists `bcVendorNo` at RFQ-accept/manual-assign; precedence `r.bcVendorNo || primary`). **Transitional supplier-LT guard kept** (`leadTimeSource==="supplier" && !forceFresh` → skip) — REMOVE only in B106 after the legacy `bcVendorNo` backfill.
- **Coach VERDICT: SHIP-TO-TEST** (both money-path cruxes pass: two-pass composition can't wipe BC data; `_writeApiPriceToBcGuarded` can't poison the catalog). Plan: `docs/F089-bc-repull-plan.md`.
- **DONE CRITERIA / Jon's morning gate — the safe single-row BC verify** (Test FAKES BC writes via bcGatedFetch, so the write-path MUST be verified on prod/BC): pre-req DigiKey=V00196 / Mouser=V00304 mapped. On a throwaway BC-linked panel — (1) portal-apply a supplier quote → confirm the row now carries the supplier's `bcVendorNo` (not just name); (2) Refresh → on-row price+priceDate=today, toast "N written to BC", BC PurchasePrice for that item+**that vendor** = the API price; (3) negatives: BC disconnected → on-row applies + "BC-skipped", nothing written; no-bcNo row → on-row only; unmapped vendor# → alert, no write. Watch debugLogs `source:"apiPricing"` + `[F089]` console. → then deploy prod (minor bump).

**#2 — B106 vendor-name repair (BC verified CLEAN by Jon — no dedup).** ROOT CONFIRMED: the "duplicate Crum Electric" was never a BC dupe — it's an ARC name≠number divergence. **V00251 is HEITEK in BC**, but 12 PRJ402509 rows carry `bcVendorNo:V00251` + `bcVendorName:"Crum Electric"` (Jon manually changed Heitek→Crum; old `updateVendor` saved the NAME not the NUMBER → those rows price/LT/write-back to Heitek). Real Crum = V00179 (2 rows). **F089 delivers the forward-fix** (persist bcVendorNo). B106 build = (1) repair the existing mislabeled rows (name≠number — can't auto-infer intent; user re-select or targeted tool), (2) display-name-from-number, and (3) **remove F089's transitional supplier-LT guard** after the backfill. Plan (corrected): `docs/B106-vendor-name-ssot-plan.md`.

**#3 — G028 consolidate "Sync BC" + "Push Lead Times"** — quick, decision + small UI. (Jon queued B106 + G028 together.)

**#4 — F090 BOMv version tracking** — SCOPED + build-ready (`docs/F090-bomv-tracking-plan.md`): ~70-80% reuse of Dv-history subcollection + snapshot/restore + F089-refresh. New `bomvVersion` counter (don't widen customer-facing Dv), subcollection storage (not array, B078 1MB), 6 bump triggers + debounced coalescer, BOMv pill→history modal, restore(archive-first)+F089-refresh. Absorbs **G027** (remove Restore). 7 Jon decisions. Effort L. (Jon: build F090 after B106+G028.)

**#5 — F096 vendor de-dup guard (NEW, Jon 2026-08-06).** Jon accidentally created a dup BC vendor via BC Item Browser "Create New". Add a pre-create dedup check (fuzzy name + vendor-list match, warn/block) + a dup-scan tool + verify vendor#↔name on assign. `INBOX.md`. Vendor family (B106/F075/F041).

**Also open (older backlog):** B103 (BUYOFF config revert + BC sync-fail — needs Firestore check) · F091 (fix wrong BC Part# + propagate) · B102 remediation (61 BC-verified wrong crossed rows) · B101 §6e lifecycle audit stamps · "In Pre-Review" help-text tidy · B078-3 nit · B095 3-rows-no-LT edge · B078-5 per-panel subcollection (deferred epic). Full list: `TODO.md` + `INBOX.md`.

## Docs produced this session
`docs/B107-F095-labor-calc-analysis.md` · `docs/B105-item-browser-search-plan.md` · `docs/B106-vendor-name-ssot-plan.md` (corrected) · `docs/F089-bc-repull-plan.md` · `docs/F090-bomv-tracking-plan.md`.

## Startup for next session
Boot `/ARC-team-Startup` (Freddy). First act on **F089** (#1) — Jon's single-row BC verify → prod. Then B106+G028, then F090.

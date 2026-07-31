# Session State — 2026-07-30 EOD MDT · prod v1.24.61 · 🧳 PROD FROZEN (Jon away) · IP66/1200 recovery on Test V.074 awaiting one trace re-extract

> ## ★★ CURRENT (2026-07-30 EOD) — read STATUS.md "▶ RESUME HERE" block first.
> **prod v1.24.61**, `master == origin` @ `1336f4fa`, working tree clean. **🧳 PROD FROZEN — Jon away; nothing ships without a fresh "go".** Shipped to prod today: **v1.24.61 RFQ WYSIWYG vendor routing** (routes to the vendor shown on the BOM row — primary OR user-selected secondary; removed the crossed-item re-resolve that mis-routed via a stale `bcNo`, PRJ402143/SCE-60EL6018LPPL→Royal; Jon Test-verified, Coach-approved). Earlier today also shipped: v1.24.54–60 (multi-page Ref# resequence, BC matching/pricing re-enable, BC lead-times, F077 Vendor Sync UI, ?PN resilience).
>
> **▶ #1 RESUME ITEM — IP66/1200 Part# recovery is BUILT + on Test V.074 but NOT confirmed live.** Deterministic recovery of Part#-column misreads (model writes a rating `IP66` / dimension `1200` from the description column into partNumber instead of the real catalog value `640014405`/`8660025`). Algorithm proven (headless regression) AND live plumbing proven (prod tab: pdf.js loads, PDF fetch OK, `640014405` at x=77 same-band as IP66). Fixed a real `window.pdfjsReady()` no-op. **But Jon's re-extracts on V.072 AND V.073 still showed IP66/1200 → the recovery code isn't EXECUTING on his re-extract.** Prime suspect: **stale service-worker bundle** (recurring all session). V.074 adds a per-page `recoverMisread(trace)` debug log. **ONE definitive-cache-clear re-extract tomorrow settles it** — see STATUS.md RESUME block for the exact steps + how Freddy reads the trace from `companies/XODxZ8xJc0dQXGZI7jbo/debugLogs`.

## Operating model (READ FIRST)
**Subagent-lane model is the default** (Jon's standing preference). One Freddy session in CCD with full repo access spawns **Marc** (build/fix) + **Coach** (review/diagnose/scope) as in-session Agent-tool lanes, **role-announced every spawn**; Freddy is sole git-writer + sole notifier, owns Dez's files (STATUS.md/INBOX.md) directly. Money-path/data-safety = **Coach review before prod**; money-path features go **branch → Test (deploy-test.sh) → Jon verify → merge to master + prod (deploy.sh)** — keep master prod-clean until verified. Startup: `/ARC-team-Startup`; close-out: `/ARC-team-Closeout` (freeze-aware — skips deploy when prod frozen). Full spec: FREDDY.md + memory `feedback_subagent_lane_model_preferred`.

## ★ CRITICAL — pricing model (CORRECTED 2026-07-30 — do NOT revert to "all auto-pricing OFF")
**BC is the DEFAULT source of truth.** Every extraction pulls BC match + price + lead-time automatically. The post-PRJ402119 kill-switch was set TOO BROADLY (it disabled BC too → all-red BOMs) and was corrected this session:
- `BC_PRICING_ENABLED=true` (BC matching/pricing/lead-time ON by default).
- **Only the Royal/Codale SCRAPERS stay OFF** — double-locked: `SCRAPER_PRICING_ENABLED=false` + `SCRAPER_BC_WRITEBACK_ENABLED=false`. `AI_ESTIMATE_PRICING_ENABLED=false`.
- **API (DigiKey/Mouser) is ON** (`API_PRICING_ENABLED=true`, F075 "Get Prices"), writes back to BC — optional-write inert until F077 vendor#s mapped.
- Auto-reprice poll stays OFF (`AUTO_BC_REPRICE_ENABLED=false`). Manual/RFQ/supplier prices protected.
See memory `project_rfq_only_pricing_mode` (rewritten 2026-07-30).

## Version
**v1.24.61** (PRODUCTION) — 2026-07-30 (release `39625cdd`). `master == origin/master` @ `1336f4fa`, working tree clean. **PROD FROZEN (Jon away).** Nothing pending deploy.

## ⭐ NEXT UP (ranked)
1. **IP66/1200 recovery — confirm live (Test V.074).** One definitive-cache-clear re-extract of PRJ402501 Line 1 → Freddy reads `recoverMisread(trace)` in debugLogs. **NO trace entry = stale bundle** (then fix SW cache-busting + re-verify); **a trace entry** → read its `stage`/`outcomes` for the exact runtime cause. Done = Idx 7→`640014405`, Idx 44→`8660025`, both low-confidence flagged. Branch `claude/ip66-partnum-recovery` (has temp trace instrumentation to remove before prod merge).
2. **MTX#→vendor part# display fix — stage on Test + verify.** Built on `claude/mtx-vendor-display` (Part A: render `s._vendorItemNo||s.number`, display-only). Deploy to Test after #1 frees the channel; then merge to prod. Part B (source the common fuzzy path via `field:"both"`) deferred — matcher-behavior change, needs Jon sign-off.
3. **bcFuzzyLookup misses in-BC parts — Jon go on the fix (money-path).** Plan: `docs/B-bcFuzzyLookup-misses-fix-plan.md`. Fix 1 = add a cross-field `contains` step (Item Browser's path) with exact-equality auto-apply gate. `800F-34RE100` etc.
4. **Secondary-vendor RFQ opt-in — Jon decision on 3 questions.** Scope: `docs/F-secondary-vendor-rfq-scope.md`. Recommend Option A global toggle. Needs: approve A? comparison-only vs auto-applicable? lead-time or price-only?
5. **F077 activation (data-config, not a build).** Jon sets DigiKey `V00196` / Mouser `V00304` via Settings → Vendor Sync to turn on F075 optional API→BC writeback (then verify the write end-to-end live).
6. **B024** — reviewer-assignment notification writes to the ASSIGNED uid (not the brittle BC-email chain). [OPEN·MED]
7. **B069** — Sign-Out doesn't release project presence immediately (90s lingering). Small/isolated fix. [TABLED pending BC-sandbox migration]
8. **F076** — supplier portal manual entry. [parked]
9. **`1002` non-MTX item in PRJ402119** — Step-2 reconcile leftover, needs Jon's BC-item pick.
10. **Test-env data isolation** — matrix-arc-test shares PROD Firestore; needs a separate test user/project before real customers (memory `test_env_blocked_one_company_per_user`).

## Shipped to prod this session (2026-07-30)
- **v1.24.54** — multi-page BOM continuation-page Ref# fix + validity-driven confidence (PRJ402501).
- **v1.24.55** — prompt reinforce: partNumber from Part# column even when description has recognizable codes (IP66 nudge; non-deterministic — superseded by the deterministic recovery now on Test).
- **v1.24.56** — deterministic `_resequenceContinuationPages` (Ref# 41=41; Jon-verified).
- **v1.24.57** — re-scope kill-switch: **re-enable BC + API pricing, keep scrubbers off** (all-red-BOM fix).
- **v1.24.58** — BC lead-time lookup uses resolved `bcNo` (fuzzy-matched parts resolve lead time).
- **v1.24.59** — F077 Settings → Vendor Sync UI + BC-vendor-list cache (instant dropdowns).
- **v1.24.60** — ?PN/~PN resilience: Debug-Logs surfacing on verify failures + visible "🔎 Verify Part #s" button (transient Haiku 529 was the cause; Jon confirmed badges show).
- **v1.24.61** — RFQ WYSIWYG vendor routing (Jon Test-verified).

## Branches (retained — intentionally NOT on master)
- `claude/ip66-partnum-recovery` — IP66/1200 recovery + trace instrumentation (Test V.074; awaiting live confirm).
- `claude/mtx-vendor-display` — MTX#→vendor part# display fix (built; awaiting Test/verify).
- (Many older lane branches remain; prune during a non-frozen session.)

## How to resume (next session)
Boot `/ARC-team-Startup`. Read this file + STATUS.md "▶ RESUME HERE" + TODO.md top block. The #1 action is the IP66 trace re-extract (needs Jon live). Prod is frozen until Jon lifts it.

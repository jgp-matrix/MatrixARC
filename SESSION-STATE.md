# Session State — 2026-07-29 MDT · prod ACTIVE at v1.24.53 · BC-sandbox UAT + F075 Get-Prices Phase 2 shipped · Vendor Sync mapping BLOCKED (resume AM)

> ## ★★ CURRENT (2026-07-29 EOD) — read STATUS.md "▶ RESUME HERE" block first.
> **prod v1.24.53**, master==origin, clean. BC pointed at the new UAT sandbox `MATR_SndBx_UAT_070926` (Sales in UAT). **Shipped today:** v1.24.52 RFQ-send stale-Priced-Date hotfix (F075 finding #2), then v1.24.53 **F075 Phase 2** (Get-Prices Confirmed/Budgetary gate + opt-in record-as-optional to BC; #1/#3 primary-overwrite fixed; Coach-approved; Jon Test-verified #2/#3, #1 code-verified). **▶ OPEN BLOCKER (resume in the morning):** activating F075's optional-BC-write needs `digikeyVendorNo`/`mouserVendorNo` in `users/{uid}/config/vendorConfig` (verified: DigiKey=`V00196`, Mouser=`V00304`) — but there's NO clean UI to set them (only the mass DigiKey price-sync writes them; Mouser has no field; direct write classifier-blocked). Jon deferred; 3 options in STATUS.md (rec: build a small Vendor Sync config UI = the queued "New-API-source BC-vendor check" / RS-Online item). **Also parked:** F076 (portal manual entry); `1002` non-MTX item in PRJ402119 (Step-2 reconcile leftover, needs Jon's BC-item pick). The F065/F068 content below is HISTORICAL (2026-07-24 session).

## Operating model (READ FIRST)
**Subagent-lane model is the default** (Jon's standing preference). One Freddy session in CCD with full repo access spawns **Marc** (build/fix) + **Coach** (review/diagnose/scope) as in-session Agent-tool lanes, **role-announced every spawn**; Freddy is sole git-writer + sole notifier, owns Dez's files (STATUS.md/INBOX.md) directly. Money-path/data-safety = **Coach review before prod**; high-blast-radius writes get a Jon controlled-test-push before trusted live. Money-path features go **branch → Test (deploy-test.sh) → Jon verify → merge to master + prod (deploy.sh)** — keep master prod-clean until verified (this session did that for F065 and F068). Startup: `/ARC-team-Startup`; close-out: `/ARC-team-Closeout`. Full spec: FREDDY.md + memory `feedback_subagent_lane_model_preferred`.

## ★ CRITICAL — pricing is RFQ-ONLY right now (do NOT "fix" the disabled auto-pricing)
After the PRJ402119 junk-price incident, **auto-pricing is intentionally OFF** via kill-switches (all `false`): `SCRAPER_BC_WRITEBACK_ENABLED`, `AUTO_BC_REPRICE_ENABLED`, `AUTO_PRICING_ENABLED`. "Get New Pricing"/"Refresh All" are now **hidden** (G020, this session) behind the `AUTO_PRICING_ENABLED` gate (reversible). Deliberate — Jon: "just use RFQs for a while." See memory `project_rfq_only_pricing_mode`.

## Version
**v1.24.53** (PRODUCTION) — 2026-07-29 (release `578e8cba`). `master == origin/master` @ `ff0015f9`, working tree clean, no freeze. Nothing pending deploy. (Prior 07-24 session ran to v1.24.36; the version notes below this line are historical.)

## Shipped to prod this session (all Jon-verified; money-path items Coach-reviewed)
- **F065 cross-Line Part# propagation + FULL-SYNC** — [Update all] on a repeated part propagates **price + lead time + vendor** in one click across all Lines → rows clear red together. Includes Bug A (explicit [Update all] overrides manual prices, with per-Line disclosure), Bug B (the `crossLineDuplicates` index self-heals on every project open — was clobbered by the first Firestore snapshot), Bug C (confidence "C" pill clears on any propagated update). `v1.24.35` core + `v1.24.36` full-sync. Coach money-path reviewed (multiple passes; the full-sync review caught + fixed a per-Line disclosure gap F1, a commitBcItem stale-LT F2, a `""`-coercion F3).
- **B060** — `applyConfirmedPrice` promote-on-success (stamp `manual` first, promote to `bc` only after the BC push confirms) → kills the BC-circle flicker. `v1.24.35`.
- **B058** — BC "not in BC" circle is now membership-driven (durable `bcNo`/`bcVerify`), price-independent — entering a manual price no longer hides it. `v1.24.34`.
- **B061** — Ext$ column: colgroup `<col>` width 64→108 (was overflowing into Lead) + `$`-left / number-right format matching Unit$. `v1.24.35`/`.36`.
- **F066** — Duct / Din Rail / Duct Cover are RED **only on $0.00 / qty=0** — exempt from price-date staleness AND estimated-lead-time firmness, and NOT RFQ'd for a lead time (`_isReorderCommodity`, Part#-only keyword match; `_hasFirmLeadTime` treats a commodity's estimated LT as firm). `v1.24.36`. Coach-reviewed (both red + RFQ SSOT).
- **F067** — "Auto-approve all for 3 min" on the cross-Line prompt (live banner: countdown · N lines · M manual overwritten · Cancel). `v1.24.36`.
- **G019** — Engineering-Questions UI hidden behind `QUESTIONS_ENABLED=false`. `v1.24.33`.
- **G020** — "Get New Pricing"/"Refresh All" hidden behind `AUTO_PRICING_ENABLED` (reversible when auto-pricing returns). `v1.24.36`.
- **G021** — PRJ# in the Panel Summary header, styled to match the Project-header title. `v1.24.36`.
- **B032** — **RESOLVED** (was a stale EMERGENCY tag): the save-on-open wipe was already deleted in `ff1ea466` / shipped v1.23.12 and is present in prod v1.24.36. Not live. TODO.md corrected.

## ⏳ Mid-flight / on Test — F068 (NOT on master/prod)
**F068 — propagate the CROSS across Lines (full-sync)** — crossing a part A→B on one Line offers (always prompt) to cross the same part on the other Lines still carrying A → B, with price+LT+vendor. On branch **`claude/f068-cross-propagation`**, **Test V.055** (base v1.24.36). BUILT + **Coach code-review APPROVE** (F1–F9 all correct; vendor-number-clear ruled safe) + a **LT-timing fix** ([Cross all] re-reads the source row's current state at click, since B's LT can land after the prompt opens). **Jon verified the cross *appears* on other Lines but pivoted to the RE-SELECT scenario before confirming the lead time carries with the fix.** Docs: `docs/F068-CROSSED-SUPERSEDED-ANALYSIS.md` + `docs/F068-BUILD-PLAN.md`.

## ⭐ NEXT UP (ranked — start here)
1. **F068 — re-verify the CROSS case on Test V.055, then merge to prod.** Decisive test: on a project with part A on 2+ Lines, cross A→B on one Line → [Cross all] → the other Lines become B **with the lead time** (and price+vendor), red cleared. Done = crosses carry LT on Test → merge branch to master + `deploy.sh`. (Coach already code-approved; only Jon's live cross-LT confirm is outstanding.)
2. **B062 + re-select-LT — the lead-time/BC-Item-Browser pass (Jon-tabled, it's a build).** BC Item Browser shows **no lead time** for any item (never calls `bcGetItemLeadTimeDays` :4700 per row → USE can't carry it); and re-selecting a part pushes price but not LT (`commitBcItem` F065 fire :28653 is price-only per Coach F2 — a same-part re-select should full-sync the LT). Do as one focused lead-time-flow pass. This is the real root behind the F068/re-select LT friction.
3. **gap5b-f015** — editing-lease ghost fix (the 90-second "View Only" after a browser closes; `LEASE_STALE_MS=90000`). Built on a branch, blocked on a multi-device verify (Jon + Andrew + 2nd device). High-value — recurred this session.
4. **Quote Lifecycle & Lock epic** — F048 (lock sent BOM) · F049 (PO-receipt cost-reconcile) · F051 (freshness-through-validity on open+send) · F052 (expired-quote-at-PO). Scoped, not built. Money-path.
5. **F050** — send-time plausibility/divergence check (may consume the B052 `bcPollDivergence` flag). Read-only sweep tool already exists.
6. **F062** — dynamic rail "RFQs to Send" → "RFQs to Accept" (needs per-project rfqUploads submission state plumbed into the rail).
7. **B031** — silent price-clear (blank the unit-price field, no guard/confirm) — Jon "against design", MED.
8. **B036** — `quoteSentRev`/`quoteSentAt`/`quoteSentTo` not in `saveProject`'s server-field preserve-guards (load-bearing after B034), MED.
9. **B059** — "N not in BC" archive counters under-count a manual-priced non-BC part (parked, LOW; pairs with auto-pricing re-enable).
10. **Pricing re-enable prereqs** — F041 edges + write-side plausibility gate + scraper extraction fix (before flipping the kill-switches back on).

## Key context pointers
- Analyses/plans: `docs/F065-*`, `docs/F068-*`, `docs/B060-BC-CIRCLE-FLICKER-DIAGNOSIS.md`, `docs/PRJ402119-PRICING-INCIDENT.md`, `docs/F041-*`.
- Board (glanceable + Next-Session): `STATUS.md`. Intake log (all session captures): `INBOX.md`. Tracker: `TODO.md`.
- Test env: `matrix-arc-test.web.app` shares PROD Firestore — use a DISPOSABLE project for money-path testing. Deploy via `deploy-test.sh` (branch checkout).

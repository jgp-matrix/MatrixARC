# Session State — 2026-08-05 EOD MDT · prod v1.24.96 · NOT frozen · marathon BC-integrity + status-system day

> ## ★★ CURRENT (2026-08-05 EOD) — read STATUS.md "▶ 2026-08-05 EOD — B104" block FIRST, then `docs/B104-save-race-fix-plan.md`.
> **prod v1.24.96**, `master == origin` @ `773b308a` (working tree clean after this handoff commit). **NEXT SESSION = build B104** (price-edit revert on rapid edits; root confirmed via live instrumentation; Coach-scoped fix in the plan doc; MONEY-PATH + core save funnel → Coach diff-review + rapid-edit verify before deploy). Jon deferred the B104 build to a FRESH focused session rather than the tail of this marathon. This session shipped 5 fixes to prod, finalized the B101 status-flag-sequencer spec, and captured a large intake (B103/B105/B106/F091 + the B102 remediation set).

## Operating model (READ FIRST)
**Subagent-lane model is the default** (Jon's standing preference). One Freddy session in CCD with full repo access spawns **Marc** (build/fix) + **Coach** (review/diagnose/scope) as in-session Agent-tool lanes, **role-announced every spawn**; Freddy is sole git-writer + sole notifier, owns Dez's files (STATUS.md/INBOX.md) directly. Money-path/data-safety = **Coach review before prod**; money-path features go **branch → (Test if verifiable) → Jon verify → cherry-pick to master + prod (deploy.sh)** — keep master prod-clean until verified. Startup: `/ARC-team-Startup`; close-out: `/ARC-team-Closeout` (freeze-aware). Full spec: FREDDY.md + memory `feedback_subagent_lane_model_preferred`.
> **Git discipline reminder (bit us once this session):** after a `git checkout master`, a subsequent commit lands on master, not a lane branch — checkout the branch BEFORE committing lane work. And browser-globals need `window.` prefix (`window.caches`/`window.fetch`) or `tools/check-scope.js` blocks the deploy.

## Version
**v1.24.96** (PRODUCTION) — 2026-08-05 (master `773b308a` after handoff commit). `master == origin/master`, tree clean. Hosting-only ships today (no functions/rules change). Nothing pending deploy.

## ✅ Shipped to prod this session (2026-08-05)
- **v1.24.91 — B097:** false "Unsynced changes to BC / must be priced" modal fixed (predicate SSOT align — Matrix-Systems/exempt rows no longer trip the BC-sync unpriced gate).
- **v1.24.92 — B099 + B091:** "Refresh & Apply" version modal now reliably reloads (timeout-race the SW teardown + cache-busting `location.replace(?_cb=)`); collapses the double version-modal. LIVE-VERIFIED via a reversible red-dot Test crossing.
- **v1.24.93→.94 — B091 downgrade-guard:** version modal only prompts for a STRICTLY-NEWER build (`_versionIsNewer`) + monotonic `_system/version` admin write → no phantom "older version available" modal. LIVE-VERIFIED.
- **v1.24.95 — B100:** Copy Project carries ALL drawing assets (hydrate source from Firestore + copy native PDFs + remap) → copies render + re-extract. Verified on prod (PRJ402509: 16/16 pages have storageUrl+originalPdfPath).
- **v1.24.96 — B098 + B102:** B098 = dash-agnostic BC surrogate resolve (alphanumeric-run anchors) + FIRM-MFR collision-breaker; B102 = crossed rows re-bind bcNo to the crossed-TO part (never push the original). Both verified via PRJ402509 re-extract.
- **B102 remediation scrub (BC-verified, read-only):** 61 genuinely-wrong crossed rows / 32 projects (of 607 crossed BC-bound rows; 541 correct). Heuristics unreliable — only BC resolution is truth. Remediation NOT yet run (Jon reviewing; 61-row list on request).

## ⭐ NEXT UP (ranked) — full detail in STATUS.md "▶ 2026-08-05 EOD — B104" block
1. **★ B104 — price-edit revert on rapid edits (BUILD THIS FIRST).** Root CONFIRMED (live instrument); Coach-scoped fix in **`docs/B104-save-race-fix-plan.md`**: fire-time-latest saves + monotonic per-panel `_localEditSeq` guard + extend `_panelSaveLocks` to `saveProject` (= correctness core of deferred B016 Fix B). MONEY-PATH + core save funnel → Coach diff-review + rapid-edit verify (10×) before deploy. Recurring, days-spent.
2. **B103** — BUYOFF auto-add default reverts to "JOB BUYOFF" + BUYOFF sync-fails (needs Firestore config-doc check).
3. **B106** — vendor-name "Crum Electric Supply" ingress onto rows (trace the RFQ/supplier `bcVendorName` write; Jon's Heitek→Crum manual change is intentional, not the bug).
4. **B105** — BC Item Browser manual search is dash-sensitive (= F082 parity; extend B098's normalized approach to `bcSearchItems`).
5. **F091** — fix-a-wrong-Part#-in-BC + propagate to all projects (feature, design).
6. **B102 remediation** — clear bcNo on the 61 wrong crossed rows → re-resolve; + manual BC line correction for any already posted to a live BC job.
7. **B101 status-flag sequencer** — spec FINALIZED (`docs/B101-kanban-status-rules-review.md` §6d, Jon-confirmed 6-rung dynamic ladder + §6e lifecycle audit stamps); NOT built — build after B104.
   _(08-03 items below are superseded/done: F086 shipped + rollout done; B078 family shipped; B080 tier-bump = Jon console action.)_
2. **F086 rollout bootstrap.** The modal/hard-reload/nudge only fully work once a client is on **≥v1.24.83** — older cached tabs still have the old plain-reload; the team needs **ONE manual Ctrl+Shift+R** to bootstrap. After that it self-heals. (Tell Ryan/Noah.)
3. **B078-2 monitor (no code).** Coalescer is deployed but Jon has no large project to force-test — WATCH future large-drawing extractions for any recurrence of `resource-exhausted` / silent BOM loss; re-surface B078 if it recurs.
4. **B080 tier bump** — Jon action on the company Anthropic account console (raises the rate-limit ceiling; the backoff makes it graceful meanwhile).
5. **LOW backlog (no Jon input needed):** F085 F1 (bgDone green-pill on partial sync-fail) / F2 (lead-time flush failures not reported in Sync-now); **B080 F1** (add `functions/test-retry.js` to `.gcloudignore`) / **F2** (drain body on supplier-404 fallback `continue`); **B083** (lead-time BC writeback dropped on hard tab-close <30s, recoverable).
6. **S1 multi-tenant hardening (future).** The broadcast write is pinned to one company ID — before any external/multi-tenant rollout, update the ID or move the write to a Cloud Function (Admin SDK). Note in firestore.rules.
7. **TODO.md over budget (3,642 lines).** Flag for an archive-review pass (criteria in TODO header; archive to TODO-ARCHIVE.md) — do NOT blind-trim. Also triage: promote/close this session's INBOX items (all stamped B078–B083/F085/F086, statuses in INBOX.md) into TODO.md.
8. **Older open TODO.md items** — next session should read TODO.md top block for the fuller backlog (B024 reviewer-assignment notification, F076 supplier-portal manual entry, test-env data isolation, etc.).

## Branches (retained — work already cherry-picked to master, safe to prune next session)
13 `marc/*` lane branches on origin (b078-1/f085/b078-2/b079/b081/b080/b082/f086-part2, etc.). Each was cherry-picked to master + shipped. `git branch -d` may fail (cherry-picked, not merged) — prune with care next session.

## How to resume (next session)
Boot `/ARC-team-Startup`. Read this file + STATUS.md "▶ RESUME HERE (2026-08-03 EOD)" + TODO.md top. Nothing is frozen; nothing is mid-deploy. The only live-verify owed is the F086 4-min nudge (#1). Everything else this session is shipped + stable.

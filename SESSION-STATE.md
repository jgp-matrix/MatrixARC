# Session State — 2026-08-03 EOD MDT · prod v1.24.83 (+ functions + firestore:rules) · NOT frozen · big ship day (full bug queue + F086 feature)

> ## ★★ CURRENT (2026-08-03 EOD) — read STATUS.md "▶ RESUME HERE (2026-08-03 EOD)" block first.
> **prod v1.24.83**, `master == origin` @ `6c290ad9`, working tree clean. **NOT frozen** — Jon actively shipped all day. This session: root-caused + fixed Ryan's extraction save-loss, shipped the entire staged bug queue, and built + shipped the **F086** Admin-Global-Broadcast / forced-refresh-on-new-version feature end-to-end (heavy live UX iteration with Jon).

## Operating model (READ FIRST)
**Subagent-lane model is the default** (Jon's standing preference). One Freddy session in CCD with full repo access spawns **Marc** (build/fix) + **Coach** (review/diagnose/scope) as in-session Agent-tool lanes, **role-announced every spawn**; Freddy is sole git-writer + sole notifier, owns Dez's files (STATUS.md/INBOX.md) directly. Money-path/data-safety = **Coach review before prod**; money-path features go **branch → (Test if verifiable) → Jon verify → cherry-pick to master + prod (deploy.sh)** — keep master prod-clean until verified. Startup: `/ARC-team-Startup`; close-out: `/ARC-team-Closeout` (freeze-aware). Full spec: FREDDY.md + memory `feedback_subagent_lane_model_preferred`.
> **Git discipline reminder (bit us once this session):** after a `git checkout master`, a subsequent commit lands on master, not a lane branch — checkout the branch BEFORE committing lane work. And browser-globals need `window.` prefix (`window.caches`/`window.fetch`) or `tools/check-scope.js` blocks the deploy.

## Version
**v1.24.83** (PRODUCTION) — 2026-08-03 (master `6c290ad9`). `master == origin/master`, tree clean. Functions redeployed (B080). firestore:rules redeployed (F086 admin-lock + S1 pin). Nothing pending deploy.

## ✅ Shipped to prod this session (2026-08-03)
- **v1.24.69 — B078-1:** extraction save-failure now retries + surfaces a blocking modal (no silent green ✓). Fixes the silent save-loss that lost Ryan's BOM.
- **v1.24.70 — F085:** prompt-to-sync unsynced ARC→BC changes on project-leave (hash-based; "Sync now"/"Later"; unpriced→Later-only).
- **v1.24.71 — B078-2** (autosave coalescer — the ROOT fix: an 18-page add no longer floods the Firestore write queue; airtight clobber-guard) **+ B079** (unique panel names via `panelSeq`) **+ B081** (Auto-Add config shows vendor part#).
- **functions — B080:** Anthropic 429 retry-with-backoff (deadline-aware) on the 3 extraction calls + CONCURRENCY 4→3 + a latent `pageResults` bug fix. Ceiling = **tier bump** (Jon's Anthropic console, no code).
- **v1.24.72 — B082:** Margin/sell-price PATCH no longer dropped on quick project-leave.
- **v1.24.73–83 — F086** (Admin Global Msg + version broadcast; folds F008): hard-reload fix (unregister SW + clear caches) → admin-locked `_system/globalBroadcast` doc + top-bar 📢 button + **centered TAKEOVER modal** (must acknowledge) → version detect via `_system/version` instant ping (fixed userRole-null-at-mount) + `version.json` 60s poll → **"Later" snoozes 4 min then re-nudges** until updated. **S1 hardened:** broadcast write pinned to Matrix PCI company `XODxZ8xJc0dQXGZI7jbo` (Jon test-verified).
- **"3-user issues" = the B078 save-loss** (Jon confirmed) — fully resolved by B078-1/2.

## ⭐ NEXT UP (ranked)
1. **F086 — verify the 4-min nudge live.** Not yet exercised end-to-end (Noah saw the modal + hard-reload work; the snooze→re-nudge timing is untested). Get a client on ≥v1.24.83, push a bump, click "Later", confirm it re-pops in ~4 min. Done = re-nudge fires.
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

# F025 — Right-Side To-Do Dashboard Pane — Build-Ready Plan

**Marc planning lane · 2026-07-22 · read-only. Phase 3 (final) of the dashboard epic, built on shipped F026 (v1.24.1) + F027 (built, on master). Anchors verified against current `src/app.jsx`/`firestore.rules`.**

> Correction to earlier assumptions: pane template is `:36505` (not :36393); Dashboard return is `:44827`; there is NO `_timingStates` in shipped code (F026 uses `statusChangedAt` directly); there is NO F025-v1 top-strip in prod (was TEST-only, already removed) — Phase 3 builds fresh.

## Locked design (Jon)
Right-side **380px collapsible** pane on the Projects page (template `:36505`); 7-bucket pill grid (count each, GREEN / YELLOW≥80% / RED≥100% by timeout); timer-sorted project list (pinned-first via F027 `_priorityPinCompare`, then worst-timer; color-coded rows; `RFQ'S: ## SENT: ## RECVD: ##` on RFQ rows); separate ECO sub-list (yellow 3d / red 4d, reset on BOM change); QUOTES SENT click→weekly follow-up; per-user idle-flash (40h→24h); per-category thresholds in Settings.

## Items (build detail)
1. **Layout** — wrap Dashboard return (`:44827`) in a flex row (only when `!forceView && groupBy==="status"`); existing centered board stays as a `flex:1;minWidth:0` child; append a collapsible 380px sticky `<aside>` (copy `:36505` styling). `railOpen` useState persisted to `localStorage`. Board's F026 horizontal-scroll absorbs the width loss when open. Fragment-safe (one new root div).
2. **Pill grid (7)** — `_todoBucketOf(project)` maps `computeActiveEco?→active_eco : computeProjectEffectiveStatus` to the buckets (matches board columns exactly). Count = # myProjects in bucket. Color = max timer% across the bucket (worst project drives it). Pill click → F023 `setFocusedCol(colKey)`.
3. **Timer SSOT** — `_todoThresholdMsFor(bucket)` / `_bucketTimerPct(project,bucket,now)` / `_timerColor(pct)` near `_statusClockStart`. Standard buckets use `_statusClockStart`; ECO uses `ecoLastBomChangeAt` with absolute 3d/4d (`_ecoTimerColor`, not 80%); idle is a separate overlay.
4. **Project list** — single comparator: pinned-first (priorityPinnedAt desc) then timer% desc. Row: 📌? · PRJ# · Customer · Name + timer chip; bg/border = `_timerColor`. RFQ line: SENT=`awaitingVendorCount`, RECVD=`rfqCounts[p.id]` (existing submitted listener :48003), RFQ'S=total sent vendors — **extend `_rfqAwaitingSummary` (add-only) with `sentVendorCount`** (SSOT, no re-inline).
5. **ECO sub-list + NEW `ecoLastBomChangeAt`** (add-only) — ★ **CORRECTION:** the master-plan assumption (piggyback `onPreReviewInvalidated`/`onReviewerEdit`) is WRONG — `_trackBomChange` (`:27224`) is GATED (only fires under approved/pending review), so a normal active-ECO edit with no pending review would NEVER reset. **Must hook the real BOM-mutation path** (`updateBomRow` `:27242` + add/remove), gated on `computeActiveEco(project)`, via a new `onEcoBomChanged()` → narrow `.update({ecoLastBomChangeAt,updatedAt})`. Rules: add `ecoLastBomChangeAt` to the ECO/Won lock carve-outs (`:283`/`:292`/`:298`) — **Coach rules review required**. `_statusClockStart` gets an `active_eco` branch.
6. **Idle-flash — NEW per-user `lastOpenedAt`** — store one doc `users/{uid}/config/lastOpened` = `{map:{[projectId]:ms}}` (**zero rules change** — `users/{uid}/**` already owner-R/W). Stamp fire-and-forget in `handleOpen(p)` (`:48753`) keyed by `p.id`. Two-threshold: never-opened → 40h from `createdAt`; opened → 24h from the stamp; re-flash at 24h. Red pulse overlay on tile + row, independent of the status timer.
7. **QUOTES SENT weekly** — new `groupBy="quotes_sent_weeks"` branch in `groupProjects` (`:44751`): filter sent-not-won/lost, group by ISO-week-of-`quoteSentAt`, render via existing grouped-list layout (`:45061`).
8. **Per-category thresholds** — `_pricingConfig.attentionThresholds{bucket:{yellow,red}}` (add-only; migration-free `??` seeding from the legacy single `attentionThresholdValue`); N-row admin Settings UI (clone `:18803`). Keep legacy scalar. Minute precision via `_ATTENTION_UNIT_MS` (+`weeks`).

## Data-retention
3 new add-only fields (`ecoLastBomChangeAt` project doc, per-user `lastOpened` map, `attentionThresholds` config) + F027's `priorityPinnedAt/By`. No removal/rename, no cap, no schema bump, nothing new stripped on save. All reads `??`/`||` fallback → legacy-safe. Multi-project/Async-Ownership safe (render-time derive, no module cache; stamps keyed by captured `p.id`).

## Build order (sub-phases) — each: build → Coach review → live-test → Jon deploy
- **3a — Shell + pills** (layout, collapsible rail, `_todoBucketOf`/`_bucketTimerPct`/`_timerColor`, pill grid). No new fields, zero data-model risk. Fast visible value.
- **3b — Sorted list + RFQ line + quotes-weekly** (uses shipped `priorityPinnedAt` + `rfqCounts`; extend `_rfqAwaitingSummary`). No new persisted fields.
- **3c — Per-category thresholds** (config + N-row Settings UI). One config-doc field; low risk.
- **3d — ECO timer** (NEW `ecoLastBomChangeAt` + the real BOM-hook + rules carve-out). Save-path + rules → Coach review + emulator/live gate.
- **3e — Idle flash** (NEW per-user `lastOpened` doc + stamp + listener + flash). Per-user write; no rules change.

**Est. ~680–740 LOC total** (pane render + N-row Settings dominate). 3d + 3e are the only sub-phases touching persisted state/rules.

## Open decisions for Jon (7)
1. **Q1 — bucketing:** Jon's 7 pills omit READY TO SEND and split RFQs. Where do (a) `rfqs`-status-but-no-RFQ-sent-yet and (b) `evc_send` (READY TO SEND) projects go? Rec: PENDING RFQs = `awaitingVendorCount>0` only; add an 8th READY TO SEND pill (or fold into READY TO REVIEW).
2. **Q2 — idle map prune:** keep unbounded (rec) vs prune >90d.
3. **Q3 — pill color source:** worst-project-timer in bucket (rec) vs bucket aggregate.
4. **Q4 — threshold shape:** per-bucket `{yellow,red}` pairs (rec — honors 4h/6h, 4h/7h, 3d/4d exactly) vs single-red + generic 80% yellow. Freezes the config shape.
5. **Q5 — non-specified thresholds** (defaults, need sign-off): PENDING RFQs red 5d · READY TO REVIEW red 2d · QUOTES SENT follow-up 2 weeks.
6. **Q6 — ECO reset hook:** confirm hooking the real BOM-mutation path (not the gated review events) — required for correctness.
7. **Q7 — pane scope:** To-Do list always the user's own projects (rec) vs follow the board's My-Projects toggle.

*Plan only — no files edited. Awaits Jon sign-off + the 7 decisions before building 3a.*

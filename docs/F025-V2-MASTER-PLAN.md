# F025 v2 — To-Do Dashboard Epic — Phased Master Plan

**Freddy, 2026-07-22, from Jon's reshape + 2 Coach scoping lanes (`docs/B044-F026-EVC-SPLIT-COACH.md` + the status-model/role/timer/pane scope). Requirements: `docs/F025-V2-TODO-DASHBOARD-REQUIREMENTS.md`.**

## Jon's locked decisions (2026-07-21)
- Idle timer = **per-user** (each user's own last-opened). · Manager = **admin-assigned in Team settings**. · Sequence = **foundation first**.

## Baked-in decisions (Coach recs — Jon to veto any)
- **Manager = `permissions.manager` flag** (reuse `reviewer` machinery; client `isManager()` + rules `isManager()`; Team-UI checkbox), NOT a 4th role tier. Orthogonal capability — a view/edit user can be a manager without changing edit rights.
- **evc split via new effective-status values** `evc_review` / `evc_send` emitted by `computeProjectEffectiveStatus` (keeps `statusToCol` one-to-one + drives the aging buckets).
- **Timing = current-bucket** (statusChangedAt re-stamps each transition — "how long sitting HERE"), not cumulative.
- **ECO reset = event-driven** — piggyback existing review-invalidation BOM-edit events (`onPreReviewInvalidated`/`onReviewerEdit`, fire on qty/partNumber/add/remove) to stamp a new `ecoLastBomChangeAt`.
- **Priority pin = global** (one shared prioritized list; managers curate the team's queue), add-only `priorityPinnedAt`/`priorityPinnedBy`, allowed on locked projects (added to lock carve-outs like statusChangedAt).
- **Right rail = full-height sticky** (matches in-project pane feel); the top-strip (v1) is **removed** in its favor.
- **✅ Width strategy (Jon 2026-07-21):** horizontal-scroll the kanban (`overflow-x:auto` wrapper, columns keep readable minWidth) + a **collapsible right rail** (toggle to reclaim full board width). Solves the 8-col + 380px-rail overflow without cramping tiles.
- **✅ READY-TO-REVIEW Issues gate (Jon 2026-07-21):** gate on **tech-review + manualVerify only** (the existing hard send-blockers). Confidence chips + not-in-BC stay ADVISORY (visible, don't hold a project out of READY TO REVIEW). So `issuesCleared(project) = !_hasUnresolvedTechReview(project) && no manualVerifyRequired`.

## Data-model additions (ALL add-only, no migration, no schema bump)
`ecoLastBomChangeAt` · `lastOpenedAt` (per-user — a `users/{uid}` map or durable per-user stamp) · `priorityPinnedAt` + `priorityPinnedBy` · `_pricingConfig.attentionThresholds{ per-bucket {value,unit} }` · member `permissions.manager`. (Existing `statusChangedAt`/`_lastEffectiveStatus` reused.)

---

## PHASE 0 — quick wins
- **G013** — remove the redundant status pills from the 5 tiles (DRAFT/IN PROCESS/RFQs/READY/PRE-REVIEW). LOW, independent. Can ship immediately.

## PHASE 1 — F026 status-model foundation (fixes B044 + B018 in the same pass)
1. **SSOT predicates** (near `computeProjectEffectiveStatus` :16527, reuse existing helpers):
   - `anyRedRow(project)` = any non-labor row `_isBomRowFlaggedRed` (:16282).
   - `readyToReview(project)` = `hasBom && !hasActiveRfqs && issuesCleared(project)` (may still have red/LT/pricing gaps).
   - `readyToSend(project)` = `readyToReview && findIncompleteQuoteItems(project).length===0 && !anyRedRow(project)`.
   - `issuesCleared(project)` = `!_hasUnresolvedTechReview(project) && no panel manualVerifyRequired` (Jon: tech-review + manualVerify only; confidence/BC chips advisory).
2. **Fix B044/B018:** replace the narrow `hasUnpriced` (:16554) routing so a send-blocked project can NOT land in a "ready" bucket; align the send-count/messaging (B018) onto the same SSOT.
3. **Emit split statuses:** `computeProjectEffectiveStatus` returns `evc_review` / `evc_send`; add `if(hasBom && anyRedRow) return "rfqs"` (review-with-red-rows → back to RFQs) after the quoteSent/postReview/preReview-pending short-circuits.
4. **Kanban triple in lockstep** (:44646-44648): `order` → `[draft, in_progress, process_rfq, ready_review, pre_review, ready_send, active_eco, quotes_sent]` (pre_review between review & send); `labels` + `statusToCol` + `_statusColColors/_statusColBg` + `Badge` map (:16589) + transferred-tile maps — add the two new keys; keep `statusToCol` total.
5. **Per-status entry timestamps:** widen `_timingStates` (:44778) to include the split states + `active_eco` + `quotes_sent`; `statusChangedAt` already covers current-bucket (lock-safe, whitelisted).
6. **★ Width strategy** (the board is now 8 columns) — implement per Jon's choice (below).
   - Risk-managed with §Phase-3 rail (combined width budget).

## PHASE 2 — F027 manager role + priority pin
1. **Manager flag:** client `isManager()=hasPermission("manager")` (:2190, mirrors `reviewer`); rules `isManager()` mirroring `isReviewer()` (firestore.rules:258); Team-UI Permissions checkbox beside "Reviewer" (:19087/:19164). Zero schema change (`permissions` map already admin-writable + whitelisted).
2. **Priority pin:** `priorityPinnedAt`/`priorityPinnedBy` (add-only); checkbox in project-detail header gated `isManager()||isAdmin()`; rules gate the pin-field diff to manager/admin + add the two fields to the lock carve-out whitelists (so a Won/review-locked project can still be pinned). Sort comparator: pinned-first (by `priorityPinnedAt` desc), then existing order.

## PHASE 3 — F025 right-pane dashboard
1. **Layout:** wrap the Dashboard return (:44708) in a flex row; existing board becomes `flex:1` (keeps its `maxWidth:2100` centering inside); append a **380px full-height sticky `<aside>`** copying the in-project pane styling (:36393). Remove the v1 top-strip; move its derive (:44774-44805) into the pane.
2. **Pill grid** (7 buckets: IN DRAFT · (BOM) IN PROCESS · PENDING RFQs · READY TO REVIEW · IN PRE-REVIEW · ACTIVE ECO · QUOTES SENT) — count per bucket; color GREEN / YELLOW(≥80% of window) / RED(≥100%) via per-bucket `_attentionThresholdMs(bucket)`.
3. **Timer-sorted list:** all projects as single rows (PRJ# · Customer · Name), **priority-pinned first**, then by highest timer %; row color-coded; RFQ rows show `RFQ'S: ## SENT: ## RECVD: ##` (reuse `_rfqAwaitingSummary`).
4. **ECO sub-list** (separate, below): `ecoLastBomChangeAt` timer — yellow 3d / red 4d; reset only on a BOM-item change (event-driven stamp).
5. **QUOTES SENT tile** → click filters the main window to sent quotes grouped by weeks (follow-up list).
6. **Idle-flash:** per-user `lastOpenedAt` stamped on project open; untouched >40h → RED flash; entering resets to a 24h window (re-flashes at 24h). Two-threshold (initial 40h / post-touch 24h) per project per user.
7. **Per-category thresholds in Settings:** extend `_pricingConfig` to `attentionThresholds{bucket:{value,unit}}` (migration-free `??` fallback from the single legacy value); replicate the one Settings threshold block into N rows (admin-gated); day-based, minute-precision (native via `_ATTENTION_UNIT_MS`).

---

## Risks (ranked)
1. **★ Horizontal width (Phase 1 + 3 combined)** — 8 columns (flex, no-wrap, minWidth:180) − 380px rail overflows ~1440px. MUST be solved once for both. (Jon decision below.)
2. **★ Idle-timer per-user data shape** — per-user `lastOpenedAt` (Jon's choice) needs a per-user write on open + the derive reads the current user's stamp. Add-only; shapes the idle feature.
3. **Role/rules** — LOW via the flag path; the pin-on-locked-project carve-out needs the same whitelist treatment `statusChangedAt` got.
4. **ECO BOM-change detection** — contained (reuse review-invalidation events).
5. **Data-retention** — all additions add-only; no removal/rename/cap/schema bump. Save-path stamps already lock-whitelisted.

## Save-path / high-care flags
F026's `computeProjectEffectiveStatus` change is read-path (low risk); the new stamps (`ecoLastBomChangeAt`, `lastOpenedAt`, `priorityPinnedAt`) touch save/open paths + rules → Coach review per phase before deploy, same gate as the statusChangedAt work. Rules changes (manager `isManager()`, pin carve-outs) deploy WITH hosting.

## Build order (foundation-first, Jon-confirmed)
Phase 0 (G013) → Phase 1 (F026, incl. B044/B018 fix + width) → Phase 2 (F027) → Phase 3 (F025 pane). Each phase: build → Coach review → live-test gate → Jon deploy. Phases 1 & 3 share the width budget → decide width up front.

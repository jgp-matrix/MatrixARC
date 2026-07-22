# F025 — User "Attention" Dashboard — Build-Ready Plan

**Marc planning lane · 2026-07-22 · target `src/app.jsx` unless noted · anchors verified against current source. Companion to `docs/F025-ATTENTION-DASHBOARD-SCOPE.md`.**

## Six pieces (dependency order)
| # | Piece | Sites | Care |
|---|-------|-------|------|
| A | `statusChangedAt` + `_lastEffectiveStatus` stamp | `saveProject` :9207, `saveProjectPanel` :9583 | **HIGH — save-path, Coach gate** |
| B | Factor `_rfqAwaitingSummary(project)` + repoint panel badge | new module fn near :16452, badge :36889 | Med (SSOT refactor) |
| C | Attention-derive (render-time) | Dashboard :44371 | Low |
| D | Threshold config + admin settings field | `_pricingConfig` :2214/:2222/:2225, Settings :18300/:18507/new | Low |
| E | Top-strip UI + deep-link | Dashboard render, insert :44664→:44686 | Low |

No new Cloud Functions, no rules changes, no new listeners.

## A. `statusChangedAt` stamp (HIGH CARE — save-path)
- **Fields (add-only, persisted):** `statusChangedAt` (number `Date.now()` — when effective status last changed), `_lastEffectiveStatus` (string — comparison baseline). No generic underscore-strip guard exists (only `_sendAnchorWrite`/`_noBumpWrite` deleted by name) so `_lastEffectiveStatus` persists. Data-Retention safe (nothing removed/renamed).
- **`Date.now()` not serverTimestamp** — every sibling stamp is client-time; serverTimestamp can't be read back synchronously to compare and would break the uniform client-time aging compare. Client already trusted for `updatedAt`.
- **`saveProject` :9207:** compute `computeProjectEffectiveStatus(data)` AFTER all guards that mutate `data` (panels merge, review/quote-field restore), insert after ~:9468 before the strip at :9473. Baseline = **server** value (`_curDoc.data()._lastEffectiveStatus`), so a stale-client `set()` can never wipe the fields (self-guarding, same pattern as ownerTakeover/quoteSent*). **Seed path (prev===undefined): set `_lastEffectiveStatus` but do NOT stamp** — avoids a mass clock-reset making every existing project look "just entered status" (dashboard backfill A5 supplies the clock until a real transition). On change → stamp `Date.now()`. Unchanged → carry server stamp.
- **`saveProjectPanel` :9583: YES it needs it too** — it's the path that drives draft→in_progress→evc/rfqs transitions during background extraction (panel status flows only through here). Placement after the quote-rev block before :9739; `liveProject` (:9701) spreads the fresh server doc = natural baseline. Both save fns read a fresh server doc under existing concurrency control (`ref.get()` / `_panelSaveLocks` mutex) → no stale-baseline race.
- **A5 backfill/fallback (dashboard-side, read-only)** — module helper `_statusClockStart(project,eff)`: precedence `statusChangedAt` → state-specific exact (`preReviewSubmittedAt` for pre_review; oldest non-labor `rfqSentDate` for rfqs) → `draft? createdAt : updatedAt`.
- **Perf:** one extra `computeProjectEffectiveStatus` per save — negligible (already called all over render path). Acceptable.
- **A7 — must get Coach review + live save→reload→re-save backward-compat check before deploy.** Riskiest piece of F025.

## B. Shared `_rfqAwaitingSummary(project)` (fix SSOT drift)
- New pure module fn near :16452, factoring the panel-badge logic :36890–:36900 verbatim (RFQ_EXPIRED_MS 5d, RFQ_COOLDOWN_MS 30d): returns `{pendingRowCount, expiredRowCount, awaitingVendorCount, expiredVendorCount, oldestSentDate}`. Uses `r.bcVendorName` (the badge's field — the intended SSOT target; do NOT unify the row-based `hasActiveRfqs` in `computeProjectEffectiveStatus` :16484, a different rule per scope).
- Repoint the panel badge IIFE (:36889) to call it; reproduce the badge string byte-for-byte across all 3 branches (expired / awaiting / none). Buttons unchanged. Regression-gated by T-B.
- Grep-the-floor: only divergent copy is `hasActiveRfqs` (intentionally left); no other inline `rfqSentDate && !bcPoDate && unitPrice` triples.

## C. Attention-derive (pure client-side, no new reads)
- Render-time IIFE in `Dashboard` (:44371), mirroring the KPI-box IIFE :44621. No `useMemo`/module cache (Async Ownership Rule) — recompute each render from in-memory `projects`.
- Sources already in scope: `projects` prop; **`rfqCounts` prop** (`{projectId→submittedNotImportedCount}`, populated by the EXISTING app-level `_listenRfqUploadsTeamScoped(uid,{statusFilter:'submitted'})` :47753 — chip #2's source, no new listener); `myProjectsOnly` :44374; `_pricingConfig.attentionThresholdDays`.
- Factor `_isMyProject(p,uid)` (the :44690 createdBy||salesperson predicate) into a helper, call from both :44690 and the derive (avoid drift).
- Base: `projects.filter(!wonAt&&!lostAt&&!importedFromBC).filter(!myProjectsOnly||_isMyProject)`. Respects My/Team toggle; ignores search (like the KPI boxes).
- **Chips:** (1) ⏳ Awaiting RFQ response — `pendingRowCount>0` (headline=project count, sublabel=Σ awaitingVendorCount); (2) 📥 Responses ready to review — `rfqCounts[p.id]>0`; (3) ⏰ Timing out — effective status in `{draft,in_progress,evc,pre_review,rfqs}` AND `now-_statusClockStart(p,eff)>thresholdMs`. Each yields its project-id set for deep-link.
- Terminal exclusion (won/lost/imported) baked in — Jon can veto.

## D. Threshold config + admin settings
Default **7 days**, admin-editable, persisted to the pricing-config doc (mirrors `defaultStaleDays`/`quoteValidityDays`). Edits: `_pricingConfig` default :2214 (`attentionThresholdDays:7`); `loadPricingConfig` :2222 (`??7` rehydrate); Settings state after :18306; `save()` payload :18507. UI: admin-gated (`isAdmin()`) "Attention Dashboard" subsection cloning the Quote Validity block :18560, inserted after Price Refresh Thresholds :18637. `savePricingConfig` sets `_pricingConfig` synchronously → strip reflects new threshold next render.

## E. Top-strip UI + deep-link
- Insert `{!forceView&&(()=>{…})()}` sibling between filter row (closes :44664) and board IIFE (:44686). Parent is the single top-level div (:44606) whose children are already sibling `{…&&<div>}` expressions → **no fragment needed, fragment-safe**; strip renders a single `<div>` or `null`.
- Chips styled to match `box()` (:44628): emoji+label+count, colored by urgency (indigo/green/amber, red if any expired). Flex row, `marginBottom:8`.
- **Deep-link (recommended): uniform id-set filter.** Local `attnFilter={label,ids:Set}`; chip onClick sets `groupBy="status"`, `focusedCol=null`, `attnFilter`. In the board pipeline after the search filter (:44709) add `if(attnFilter)myProjects=myProjects.filter(p=>attnFilter.ids.has(p.id))` + a "← Clear filter" banner (mirrors F023 reset :44734); clear on view switch via the `[groupBy]` effect :44385. (Covers all 3 chips incl. multi-column "timing out"; `setFocusedCol("process_rfq")` only covers chips 1&2.)
- **Empty state (recommended):** slim "✓ You're all caught up — nothing needs attention" line (vs collapse).
- **My/Team toggle:** reuse existing `myProjectsOnly` button :44660 — no new UI; flipping it live-updates strip + board.

## Data-retention safety
Add-only fields (`statusChangedAt`, `_lastEffectiveStatus`, `attentionThresholdDays`); no field removed/renamed. Stamp fields always rewritten from server truth (self-guarding). `rfq_history`/`rfqUploads` read-only (existing listener, no writes). Piece B is pure read-only display refactor. `dataUrl` strip unchanged. No new caps/limits.

## Test plan (highlights)
- **T-A1/A2** draft→in_process→ready transitions stamp `statusChangedAt`; unchanged re-saves don't restamp; background-extraction (saveProjectPanel-only) path stamps — live, controlled tab Firestore read.
- **T-A3** stale-client set() can't wipe stamp (code + optional 2-tab).
- **T-A4** backward-compat: existing doc w/o stamp loads, A5 fallback clock, first save seeds without reset, no data loss — **live on an existing project**.
- **T-B** regression: panel RFQ badge byte-identical after `_rfqAwaitingSummary` refactor (all 3 branches) — live.
- **T-C1/C2/C3** chip counts correct; chip 2 drops to 0 after Import; chip 3 respects threshold change + terminal exclusion. T-C2 needs a Jon-driven supplier portal submission.
- **T-D** threshold round-trips; non-admins can't edit.
- **T-E1..E4** deep-link filter + clear + view-switch-clear; empty state; My/Team toggle updates both; `node validate_jsx.js` clean.
- Live tests run in the Claude-controlled tab (BC/extraction/Firestore state is in-memory-bound).

## Risk / size / version
- **Risk concentrated in A** (save-path ×2). Mitigation: server-baseline self-guarding, seed-without-reset, mandatory Coach review + live backward-compat gate before deploy. B regression-gated by T-B. C/D/E additive, low-risk.
- **~140–160 net LOC** (A≈22, B≈25, C≈30, D≈20, E≈65).
- **Minor version → target v1.24.0** (new UI capability). `deploy.sh` auto-bumps patch only — set the minor base in `APP_VERSION` before deploy (coordinate number with Jon).

## Residual decisions for Jon (Marc's recommendations)
1. **Deep-link:** uniform id-set `attnFilter` (**rec**, covers all 3 chips) vs `setFocusedCol` (chips 1&2 only).
2. **Empty state:** calm "✓ all caught up" line (**rec**) vs collapse.
3. **Terminal exclusion:** bake in won/lost/imported exclusion (**rec**) — veto?
4. **Chip 1 headline:** project count + vendor sublabel (**rec**) vs vendor count headline.
5. **Field name:** `_lastEffectiveStatus` (persists fine) vs rename `lastEffectiveStatus` (no transient-implying underscore).
6. **Version:** confirm `v1.24.0` + account for deploy.sh patch-bump.
7. **Clock:** `Date.now()` confirmed (awareness only).

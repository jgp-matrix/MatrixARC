# F025 v2 — User "To-Do" Dashboard (right-pane) — Requirements Capture + Decomposition

**Source: Jon, 2026-07-21. Supersedes the top-strip approach (F025 v1, `docs/F025-ATTENTION-DASHBOARD-*` — deployed to TEST only, never prod). The v1 foundation — `statusChangedAt`/`_lastEffectiveStatus` stamp, `_rfqAwaitingSummary`, `_statusClockStart`, `_attentionThresholdMs`, unit-aware threshold — is REUSED; only the UI placement changes (top strip → right-side pane) and the scope expands substantially.**

## Overall goal
An active **"To-Do" list** so no project is forgotten / left untouched > ~1 week. Surfaces what needs attention and what's timing out, with per-status timers and manager prioritization.

## Decomposition (work items)
| Item | Title | Depends on |
|------|-------|-----------|
| **G013** | Remove redundant status pills from the 5 board tiles (Draft, In Process, RFQs Send/Receive, Ready To Review, In Pre-Review) | — (independent, quick) |
| **B044** | Projects with red rows / unpriced / no-lead-time incorrectly shown in READY TO REVIEW/SEND (`evc`) | — (diagnostic; informs F026) |
| **F026** | Status-model refactor: split `evc` → READY TO REVIEW + READY TO SEND; move IN PRE-REVIEW column between them; review-with-red-rows → return to RFQs; per-status entry timestamps + Issues/clean-BOM predicates | B044 |
| **F027** | MANAGER role (new permission tier) + manager/admin-only project **priority** flag | — (can parallel F026) |
| **F025** | The right-pane To-Do Dashboard (pills grid + sorted list + ECO sub-list + Quotes-Sent follow-up + per-category timers in Settings + 40h/24h idle-flash) | F026 (buckets/timers), F027 (role/priority) |

## 1. Remove redundant status pills (G013)
On the main Projects page, remove the status pills from the DRAFT / IN PROCESS / RFQs SEND-RECEIVE / READY TO REVIEW / IN PRE-REVIEW tiles — redundant now that tiles are already sorted into status columns. (They existed only to confirm sort accuracy.)

## 2. Fix incorrect READY TO REVIEW/SEND sorting (B044)
Projects with red rows, unpriced items, missing lead times are appearing in READY TO REVIEW/SEND when they shouldn't. Analyze `computeProjectEffectiveStatus`'s `evc` predicate + fix. (Coach diagnosing.)

## 3. The right-pane dashboard (F025)
- **Placement:** a right-side window on the main Projects page, **same size as the in-project Panel Summary / Quote Summary side windows** (NOT a top strip).
- **Status pills grid** (like the TOTAL SENT / SOLD / LOST pills), one per bucket, showing the **count of projects** in that status:
  IN DRAFT · (BOM) IN PROCESS · PENDING RFQs (sent, not received/entered) · READY TO REVIEW · IN PRE-REVIEW · ACTIVE ECO · QUOTES SENT.
- **Pill color by timeout:** GREEN = within time range · YELLOW = ≥80% of window · RED = ≥100% (out of window).
- **Summary list below the pills:** all projects as single rows (**PRJ#, Customer Name, Project Name**), sorted by **highest timer count**, each row color-coded (green/yellow/red) same as pills.
- **ECO list:** a SEPARATE list below the general list (ACTIVE ECO projects).
- **Timers:** per-category, adjustable in **Settings in DAYS** but counted **to the minute** in the background. Timestamp each project on entering each status bucket; track time-in-status. (Reusable for later features.)

## 4. Manager role + prioritization (F027)
- New **MANAGER** role (develop the code) alongside ADMIN.
- MANAGER or ADMIN sees a **priority checkbox** inside a project (hidden from others). Checking it pins the project to the TOP of the dashboard list.
- Prioritized projects always sort to the top, ordered by the **timestamp when prioritized**.
- Manager can re-prioritize by unchecking + re-checking (updates the timestamp).

## 5. Status bucket definitions + timers (F026 semantics)
- **IN DRAFT** — created, NO drawings extracted and NO BOM populated. A "parking space" pre-extraction; creates the BC project + tees it up. **>4h → YELLOW; >6h → RED.**
- **(BOM) IN PROCESS** — BOMs extracted/started but rows still have **ISSUES** (BC circles / confidence circles). Target ≤4h. **4–6h → YELLOW; >7h → RED.**
- **RFQs SEND/RECEIVE** — two-fold: (1) Issues column cleared (rows may still be red for pricing/lead-time) → can send for supplier quotes; (2) after RFQs sent. **Track # supplier quotes + # pending responses.** Row displays: **`RFQ'S: ##, SENT: ##, RECVD: ##`.**
- **IN PRE-REVIEW** — sent for Technical Review. Target ≤24h. Reviewer's dashboard shows their to-review projects in order received. **Move this column on the main screen to sit BETWEEN READY TO REVIEW and READY TO SEND.**
- **READY TO REVIEW** (split from evc) — all obtainable RFQs in, all Issues resolved; MAY still have red rows / missing LT / missing pricing. Salesman marks rows for review or sends for review. **If review completes and red rows remain → project returns to RFQs SEND/RECEIVE.**
- **READY TO SEND** (split from evc) — clean BOM: NO red rows, all pricing + lead times shown. Salesman's final review before customer. **>4h → RED.**
- **ACTIVE ECO** — mostly untouched for now. Dashboard tile with count; a SEPARATE ECO list in the right pane. **Row YELLOW after 3 days, RED after 4 days; reset the timer ONLY on a user BOM-item change** (keep the user on top of the ECO).
- **QUOTES SENT** — all sent quotes. Tile shows count; **clicking filters the main window to sent quotes, sorted/grouped by time in WEEKS** (a follow-up list).

## 6. Idle/untouched flash (F025)
- **Any project untouched/unopened > 40h flashes RED.** Entering the project resets the timer, but only to **24h** (not the full 40h) — and it flashes red again at 24h. (First window 40h; every reset thereafter = 24h.)
- This is SEPARATE from the per-status time-in-status timers.

## Open product decisions (for Jon — some pending Coach scope)
1. **Idle timer scope:** per-USER (each user's own last-opened) or GLOBAL (any user opening resets)? Applies to ALL projects on top of per-status timers?
2. **Manager assignment:** admin assigns "manager" in the team-members UI (add a role tier)? Per-company.
3. **Build sequence / phasing:** G013 + B044 first → F026 (status model + timestamps) → F027 (role/priority) → F025 (pane)? Or get a visible pane sooner with approximate timers?
4. **Pill vs column mismatch:** dashboard pill "PENDING RFQs" = sent-not-received only; the board column "RFQs SEND/RECEIVE" holds both ready-to-send + sent — confirm.
5. **"Issues cleared" definition** — BC circles + confidence circles (Coach confirming the exact predicate).

## Phasing (proposed, dependency-ordered)
- **Phase 0** — G013 (pill removal, trivial) + B044 (evc diagnosis/fix).
- **Phase 1 (F026)** — status-model foundation: split columns + reorder + per-status entry timestamps + Issues/clean-BOM predicates + review→RFQ-return.
- **Phase 2 (F027)** — MANAGER role + priority flag.
- **Phase 3 (F025)** — right-pane dashboard consuming Phase 1 timers + Phase 2 role/priority; pills, sorted list, ECO list, Quotes-Sent follow-up, idle-flash.

*Coach scoping in flight: (A) B044 evc mis-sort + Issues/clean-BOM predicates; (B) column split/reorder + timers + manager role + right-pane placement feasibility. Plan finalizes when both return + Jon answers the open decisions.*

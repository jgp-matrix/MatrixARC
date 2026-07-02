# #200 — Dashboard Tile Quota-Aging Color-Shift — BRIEF

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-02 · **Priority:** MED-HIGH
**Pipeline stage:** Brief (Coach Supplement queued — Coach currently on #199)
**Base version:** v1.21.23 · master `03ae8ee6`

---

## 1. Problem / Intent

Sales has a quota to get quotes **out the door within a preset number of days** (default **5**, admin-configurable). Today project tiles on the dashboard are all the same black — nothing surfaces which quotes are aging toward the quota deadline. Add a **passive color-shift on each project tile background** that escalates black → yellow → red as a project approaches its quota limit, so the aging quotes are visually obvious at a glance.

## 2. Jon's Decisions (2026-07-02)

| # | Decision | Value |
|---|----------|-------|
| **D1** | **Age anchor (Day 1)** | **`project.createdAt`** — clock starts when the project is created. |
| **D2** | **Scope + stop** | **Un-quoted projects only.** Once a quote is sent, the tile returns to normal (quota met, clock stops). |
| **D3** | **Day counting** | **Business days** — Mon–Fri, weekends do NOT burn quota days. (Holidays out of scope for v1.) |
| **D4** | **Scaling** | **Fixed offsets from the deadline** — reproduces the 5-day pattern exactly AND scales to any quota value. |
| **D5** | **Config** | `salesQuotaDays`, default **5**, admin-editable in Config (same pattern as `_pricingConfig.defaultStaleDays`). |

## 3. Color model (fixed offsets from the quota deadline `Q`)

Let `d` = **business days elapsed** since `createdAt` (d = 1 on the creation day). Let `Q` = `salesQuotaDays`.

| Condition | Tile background | For Q=5 |
|-----------|-----------------|---------|
| `d ≤ Q-3` | **Black** (current normal) | days 1–2 ✓ |
| `d == Q-2` | **Begin fade-in yellow** (partial/lighter yellow tint) | day 3 ✓ |
| `d == Q-1` | **Full yellow** | day 4 ✓ |
| `d == Q` | **Red** (reaching quota limit) | day 5 ✓ |
| `d > Q` | **Overdue** — stays red (recommend; optional deepen/pulse — see §7 open item) | day 6+ |

- "Begin fade-in" = a lighter yellow tint on day `Q-2`; full yellow on `Q-1`. Discrete steps keep it deterministic. A smooth cross-day opacity gradient is possible as polish but not required for v1.
- **Small-quota degradation:** if `Q ≤ 2` the black tier collapses — clamp gracefully (red on day `Q`, yellow the day before). Handling detail for the Detailed Plan; not a common config.
- **Contrast:** tile text/badges must stay readable on yellow/red. Confirm foreground colors flip or retain contrast (Coach/Marc handle in impl).

## 4. Scope

**IN (this increment, #200):**
1. New config field `salesQuotaDays` (default 5), admin-editable in the Config modal.
2. A **single tile-color helper** `_projectQuotaTier(project, quotaDays)` → returns the tier/background, used at **every** tile render site (per §5).
3. Business-day elapsed calc from `createdAt`.
4. Apply the computed background to un-quoted project tiles; normal black once `quoteSentAt` is set (D2).

**OUT (deferred):**
- Company holiday calendar (D3 v1 = weekends only).
- Any change to kanban routing, status logic, or tile content/layout beyond background color.
- Notifications/escalation off the quota (this is passive visual only).

## 5. Single-source predicate (CLAUDE.md dual-consumer rule)

The quota tier is consumed by potentially multiple render surfaces (kanban columns, any list view). Factor **one** helper `_projectQuotaTier(project, quotaDays)` — every tile calls it; do NOT re-inline the day-math/color thresholds per site. A future change to the color mapping then happens in one place.

## 6. Dashboard Command Center Principle (CLAUDE.md)

Color-shift is **passive styling only** — it must never steal focus, navigate, or re-order tiles. Compliant by design; call it out so impl doesn't add side-effects. Recompute on render (cheap) — no background timer needed; the tier changes at day boundaries and a normal dashboard mount/refresh picks it up.

## 7. Open questions for Coach's SUPPLEMENT (code verification, when routed)

- **V1 — anchor reliability.** Is `project.createdAt` set on ALL projects incl. legacy? If some lack it, fallback (treat as un-aged? use `updatedAt`?).
- **V2 — "quote is out" signal.** `project.quoteSentAt` (seen at ~app.jsx:15983) vs the `qvHistory` `quote_send` entry (added #193) vs status past quoting — which is **authoritative** for "quota met," and is `quoteSentAt` set on ALL send paths (standalone, bundled, send-to-sales)?
- **V3 — tile render choke point.** Where is the project-tile background actually set? One component or several (kanban card vs list)? Confirm the single site(s) to apply the tint.
- **V4 — business-day helper.** Does a business-day utility already exist (lead-time calc uses production days / `dailyCrewHours`)? Reuse vs new helper.
- **V5 — config plumbing.** Where does the dashboard read config — is `_pricingConfig` globally available to add `salesQuotaDays` alongside `defaultStaleDays`, and is the Config modal the right edit surface?

## 8. Suggested pipeline

LOW-risk (dashboard-cosmetic, additive config, no data mutation, no money/send path). Lighter pipeline than #199: **Brief (this doc) → light Coach Supplement (V1–V5) → Marc builds with a short plan → Jon eyeball.** Could compress to Coach-scopes-then-Marc-builds if you want it fast.

## 9. Routing note

Coach currently has one open request (#199 Supplement) — per single-open-request discipline I have NOT stacked #200 on Coach. This Brief is written and queued; route it to Coach the moment #199's Supplement returns, OR (if you want #200 moving sooner) I can have Marc take it once #188 is done. Recommendation in the chat reply.

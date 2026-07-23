# F025 3b — To-Do rail: timer-sorted project summary list + RFQ sent/awaiting rows

**Coach scope + Jon decisions · 2026-07-22. Build lives entirely in `TodoRail` (`src/app.jsx` :44754–44851) + its `_sections` memo (:44757) + one prop at the mount (:49646) + `handleOpen` wiring. Read-only/presentational. Closes Ryan/Noah's founding "nothing shows pending RFQs" ask.**

## Jon's decisions (2026-07-22)
1. **Row click → OPEN THE PROJECT directly** (thread `onOpenProject` → App `handleOpen` :49126, at the mount :49646).
2. **RFQ info = INLINE annotation on each row** (sub-line) + a roll-up awaiting count in the Sales Pipeline section header (NOT a separate section).
3. **Designer/engineering items EXCLUDED from the sorted list** (they have no clean timer; stay count-only pills).
4. **List shows ONLY attention items (yellow+red)**, sorted most-overdue first, + a small **"N on track"** footer.

## Reusable helpers — MUST call, do NOT re-implement (SSOT; the 3a non-equivalent-filter lesson)
| Helper | Line | Role |
|---|---|---|
| `_dashboardRoles(uid)` | 16649 | which sections/scopes the user sees (F032 role-awareness) |
| `_isMyProject(p,uid)` | 16633 | salesman personal scope |
| `_todoBucketOf(project)` | 16541 | project → bucket key (the bucket SSOT the pills use) |
| `_statusClockStart`/`_todoClockStart(project,bucket)` | 16524/16579 | timer origin (time-in-status) |
| `_TODO_THRESHOLD_DEFAULTS`/`_todoThresholdMsFor(bucket)` | 16558/16574 | yellow/red thresholds (3c-override-aware) |
| `_bucketTimerColor(project,bucket,now)` | 16585 | per-project green/yellow/red — row color + sort input |
| `_rfqAwaitingSummary(project)` | 16507 | `{sentVendorCount,awaitingVendorCount,expiredVendorCount,oldestSentDate,…}` |

The `_sections` memo (:44757) already produces the scoped, role-filtered sets: `salesProjects` (union across the 8 buckets, `_isMyProject`-scoped + F032 exclusions), `preRevItems`/`postRevItems` (reviewer), `engItems`/`progItems`/`commItems` (designer). Derive the list from THESE — no new filtering → cannot drift from the pills.

## Sorted summary list
- **Candidate set:** flatten the memo's scoped sets to `{project,bucket}` pairs (salesman: `bucket=_todoBucketOf(p)`; reviewer: the two review buckets). **Exclude designer buckets** (decision 3).
- **Attention filter (decision 4):** keep only rows where `_bucketTimerColor(p,bucket,now)` is yellow or red. Count the rest for the **"N on track"** footer.
- **Sort key:** normalized **overdue index** = `(now − _todoClockStart(p,bucket)) / _todoThresholdMsFor(bucket).redMs`, DESC. (Raw elapsed isn't comparable across buckets — a `draft` at 6h is red, a `quotes_sent` at 6h is green — so normalize to each bucket's own red threshold; honors the existing timer math without forking it.) Tie-break: raw elapsed desc, then project number.
- **Row contents:** `bcProjectNumber` + name, bucket label (from the memo's `_todoBuckets` label map), exact time-in-status (reuse the `formatTimeAgo` pattern at :45481 — mins/hours/days), left color bar via `_bucketTimerColor`/`_pillTint` (:44800).
- **Live timers:** compute sort + colors at RENDER with a fresh `_now` (as the pills do); memoize only the candidate set (extend `_sections`, deps `[projects,uid,salesCacheVer]`). Sorting a few dozen projects/render is cheap.

## RFQ sent/awaiting (decision 2 — inline)
From `_rfqAwaitingSummary(p)`: on any row with `sentVendorCount>0`, a sub-line e.g. **"📤 N RFQs out · M awaiting · oldest Xd"** (`M`=`awaitingVendorCount`, oldest from `now − oldestSentDate`; if `expiredVendorCount>0` flag it red/overdue). `sentVendorCount` is the SAME field feeding the tile SENT badge (:46501) — reuse, don't re-count. Put a roll-up "· N awaiting RFQ responses" in the **Sales Pipeline section header** so the founding complaint is answered at a glance.

## Layout / mount / click
- Mount a new block inside the `<aside>` (:44819) **after** the salesman grid (:44848), before `</aside>`. Aside is already `alignSelf:"stretch"`+`overflowY:"auto"` (F033 divider intact) → scrolls within the rail, no new container.
- Row click → **open project** (decision 1): new `onOpenProject` prop → App `handleOpen` (:49126); add at the mount (:49646).

## Guardrails
- Don't fork the timer (`_todoClockStart`+`_todoThresholdMsFor`+`_bucketTimerColor`) or the bucket predicate (`_todoBucketOf`) — 3a SSOTs.
- Preserve F032 role-awareness (`_dashboardRoles`/`_isMyProject`) — reviewer sees review items, salesman sees sales items; NOT a flat all-projects list.
- Reuse `_rfqAwaitingSummary` (don't re-count RFQs).
- Read-only/pure; no Firestore writes; no data-retention surface.
- **Parallel lane owns the notification/`handleNotifClick`/`PortalSubmissionsModal` region (F031 #2 fix) — stay inside `TodoRail` + the mount + `handleOpen` wiring so the merge is clean.**

**Effort: M** — one component, all data helpers exist.

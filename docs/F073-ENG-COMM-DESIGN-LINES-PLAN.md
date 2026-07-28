# F073 — Auto-create Engineering / Commissioning / Design project lines — build-ready plan

**Coach scope · 2026-07-27 · base v1.24.41 · `src/app.jsx`.** Read-only design. Jon: *"we need to be sure and add the auto create of Project Lines for Engineering, Commissioning and Design."*

## 1. Current per-panel task-block structure (grounded)
Scheme comment `:3452-3464`. Per panel N (1-based), `base = 20000 + N*100`:

| Task No | Meaning | Type | Built at |
|---|---|---|---|
| `10000` | Project header | Begin-Total | `:3483` |
| `20N00` (base) | Panel N Begin-Total | Begin-Total | `:3490` |
| `20N10` (base+10) | BOM / Drawing (Posting) — **gets planning lines** | Posting | `:3492` |
| `20N20` (base+20) | **"Engineering Design"** — the combined line F073 splits | Posting | `:3493`, `:3591` |
| `20N30`–`20N39` (base+30..39) | **ECO 1–10 slots** (`bcAddEcoTask`, `20{N}3{eco-1}` `:3656`) | Posting | on-demand |
| `20N99` (base+99) | Panel N End-Total (Totaling `base..base+99`) | End-Total | `:3494` |
| `99999` | Project End-Total | End-Total | `:3496` |

Builders: `bcCreatePanelTaskStructure` (all panels @ New Project; `:3449`, called `:11728`/`:40911`/`:46189`) + `bcCreatePanelTaskBlock` (per-panel incremental/backfill; `:3562`, called addPanel `:36963`, backfill `:4016`/`:4261`/`:7550`). Both idempotent (probe-by-key before POST). Descriptions synced by `bcSyncPanelTaskDescriptions` (`:4007`; `taskDescs` `:4025-4030` hard-codes `base+20 → "Engineering Design"`).

**Key facts:**
- `20N20` today is an **empty Posting task** — NO planning lines auto-created. Only `20N10` gets planning lines (`bcSyncPanelPlanningLines` `:4254`). New tasks would likewise be empty skeletons unless F073 also adds costed lines.
- **SEPARATE project-level "Service Cards" system** (`:1476-1546`): Engineering Design / Programming / Commissioning as **customer-facing quote line items with sell price**, BC tasks `50100`/`50200`/`50300` (`SERVICE_CARD_BC_BASE_SLOT` `:1530`), synced `bcSyncServiceCardTask` `:3848`. **Manually added, project-level, sell-side.** Overlaps F073's naming but different level (project vs per-panel) + purpose (sell-side quote line vs internal job-cost task). **⚠ biggest ambiguity — see decision #3.**

## 2. The change + ⚠ numbering collision (HEADLINE)
Split combined per-panel `20N20 "Engineering Design"` → three separate per-panel tasks: **Engineering, Commissioning, Design.**

**⚠ Jon's illustrative "`20N20` Eng / `20N30` Commissioning / `20N40` Design" COLLIDES:** `20N30`–`20N39` is the ECO slot range (`bcAddEcoTask` `20{N}3{eco-1}` `:3656`). Commissioning at `20N30` overwrites ECO 1. **Do NOT use base+30.**

**Recommended numbering (no ECO collision, inside `base..base+99`):**

| Task | Recommended No | Type |
|---|---|---|
| Engineering | `20N20` (base+20, reuse) | Posting |
| Commissioning | `20N21` (base+21) | Posting |
| Design | `20N22` (base+22) | Posting |

Contiguous; leaves `20N23–20N29` for future services; never touches ECO (`+30..+39`).

**Touch points (keep in sync):**
- `bcCreatePanelTaskStructure.buildTasks` `:3481-3498` — replace single `engNo` push (`:3493`) with three.
- `bcCreatePanelTaskBlock.taskDefs` `:3588-3593` — replace single eng entry (`:3591`); update "4 tasks" bookkeeping (`{total:4}`→6; `4/4 failed` msg `:3644`; fast-path skip `:3602`/`:3609`).
- `bcSyncPanelTaskDescriptions.taskDescs` `:4025-4030` — split `base+20` into three.
- Idempotency (per-key probe) heals legacy panels on next sync automatically.

## 3. Open decisions for Jon (Coach rec first)
1. **Exact task numbers** — *rec: `20N20` Engineering / `20N21` Commissioning / `20N22` Design* (rejects Jon's `20N30/40` sketch — `20N30` = ECO 1).
2. **Header skeletons or costed lines (hrs × rate)?** — *rec: Posting skeletons in v1* (matches today's `20N20`; zero costing risk), fast-follow to add planning lines (Qty=hrs, Unit_Price=rate) once binding durable — reuse `bcSyncServiceCardTask` `:3848` pattern.
3. **Per-panel or per-project once?** — *rec: per-panel* (fits `20Nxx` block). **⚠ SURFACE FIRST:** project-level Engineering/Commissioning ALREADY exist as Service Cards (`50100`/`50300`, sell-side). Confirm Jon wants **per-panel internal-cost tasks IN ADDITION to** (not instead of) the sell-side service cards.
4. **Map to `LABOR_RATES`/service-card categories?** — service cards are `engineering`/`programming`/`commissioning` (`:1491`), default $125/hr (`:1506`); "Design" is NOT an existing service-card type. *rec: if costed later, Engineering+Design→engineering rate, Commissioning→commissioning rate; add a "design" category only if Jon wants distinct Design costing.*
5. **Descriptions** — *rec: `"Engineering - {panelDesc}"`, `"Commissioning - {panelDesc}"`, `"Design - {panelDesc}"`* (drop combined "Engineering Design"). Confirm wording.
6. **B065 durable-binding interaction (must-flag):** new tasks are position-computed (`base+2x`) — exactly the fragility B065 fixes (panels carry no stored `bcTaskNo`). *rec: reserve `20N20/21/22` in B065's slot map now; create additively/idempotently in F073, bind durably in B065 Phase 2 — don't introduce a 4th position-computed family right before Phase 2 converts to durable bindings.*

## 4. Stakes / acceptance / gates
- **Money-path: BC job structure.** v1 empty Posting skeletons → LOW money risk (no cost values, idempotent, additive). Costed planning lines (fast-follow) → MEDIUM → Coach review + Jon gate.
- **Acceptance:** New Project + addPanel create `20N20/21/22` per panel (Begin/End-Total range `base..base+99` valid, ECO `20N30-39` uncollided); re-run idempotent (no dupes); `bcSyncPanelTaskDescriptions` PATCHes all three; legacy panels self-heal; End-Total `Totaling` unaffected.
- **Gates:** `node validate_jsx.js`; live verify on a ≥2-panel project in the controlled tab (New Project + addPanel + re-sync) — all three tasks appear, no ECO overwrite; confirm "4→6 tasks" bookkeeping doesn't false-throw the partial-failure path (`:3644`).

## Sequencing (F073 sits inside the BC-integrity domain)
Creates BC job tasks → gated by **F071** (commit-gate on BC task/planning sync), surfaced by **B064** (structural-404 recorder), inside **B065**'s durable-binding domain. **Recommended order:** land F073's additive/idempotent task-creation + numbering now (safe, dormant-friendly like today's block); **reserve the slots in B065's map**; defer costed planning lines until B065 Phase 2 gives resolve-don't-compute binding. Coordinate so Phase 2 covers `20N20/21/22` in one pass.

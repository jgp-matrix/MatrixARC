# F043 — Rail-hover → board-tile highlight — Scope

**Author:** Freddy Lyst · **Code trace:** Marc Masdev · **Date:** 2026-07-23 · base v1.24.14
**Status:** SCOPED — awaiting Jon decisions (D1, D3). No build yet.

## Ask
Hovering a row in the To-Do rail's NEEDS ATTENTION list should highlight the corresponding
project's tile on the main board.

## Key finding — it's only *reliably* useful on the SALES tab
The rail is app-level and **role-scoped** (my sales + my review projects), identical on every tab.
Each tab's board shows only *its own stage slice*. So:
- **SALES tab:** sales-bucket rows + "In Pre-Review" rows → matching tile present. ✅ Works well.
- **PURCHASING / ENGINEERING / PRODUCTION:** the board shows that stage's projects while the rail
  still lists my sales/review projects → **most rail rows match no visible tile.**
- **"Needs Post-Review" rows:** not on the Sales board (PO'd projects) → no match there.
- **ITEMS/VENDORS tab:** rail shows but there are **no project tiles at all.**
- **MY DASHBOARD (F030):** standing rail is suppressed (uses pageMode rails beside a bespoke
  "My Projects" list that is NOT `ProjectTile`) → separate wiring, out of core scope.

**Implication:** the feature must treat "no matching tile" as a **silent no-op**, and its real value
lands on the **SALES** tab. Still worthwhile there (that's where a salesman lives), but Jon should
know it's not a universal highlight.

## Recommended implementation (lowest-risk, matches existing idiom)
The tiles + rail rows already mutate hover styles imperatively (`e.currentTarget.style.*`), no React
state. Mirror that instead of lifting state:
1. `ProjectTile` root (`app.jsx:46764`): add `data-project-tile={p.id}`. Zero behavior change.
2. NEEDS ATTENTION row (`app.jsx:45077`): `onMouseEnter`/`onMouseLeave` →
   `document.querySelector('[data-project-tile="…"]')` and toggle an **accent glow ring**
   (`boxShadow`, precedent at `app.jsx:45572`). No-op when not found (covers all mismatch cases).
3. **No state lifted into `App`, no new `Dashboard`/`ProjectTile` props, no board re-render.**

**Why not the React-state lift:** neither `Dashboard` nor `ProjectTile` is memoized, so threading a
`hoveredProjectId` prop would re-render `App` + the whole `Dashboard` + every tile on *every*
mouseenter/leave — visible jank on a big board for a cosmetic hover. (If state-lift is required
anyway: memoize `ProjectTile` + deliver the id via context so only the two changed tiles re-render.)

- **Hover source:** NEEDS ATTENTION per-project rows ONLY. The top status pills are per-bucket
  aggregates (many projects) → not hover targets.
- **Highlight style:** accent glow ring via `boxShadow` (non-colliding with the tile's existing
  border-color + transform hover; background is reserved for ECO tint).

## Open decisions for Jon
- **D1 — scroll-into-view?** The main column is its own scroll pane now (+ kanban scrolls
  horizontally), so a hovered project's tile may be off-screen. (a) highlight-only, no-op if
  off-screen; (b) highlight **+** `scrollIntoView`. *Proposed: (a) highlight-only; bind scroll to
  click if locate-on-demand is wanted — auto-scroll on mere hover is jarring.*
- **D2 — implementation:** DOM/imperative (recommended) vs React-state lift (needs memoization).
  *Freddy default: DOM/imperative unless Jon objects — it's an internal detail.*
- **D3 — scope/behavior:** confirm "highlight when the project is on the current board, silently do
  nothing otherwise" is acceptable, given it's mainly meaningful on SALES. Also: build for the
  standing rail ⇄ `Dashboard` board first; MY DASHBOARD's inline list + the transferred-projects
  grid are possible follow-ups, not core scope.

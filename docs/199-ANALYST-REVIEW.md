# #199 — Per-Line "Tech Review" Flag — ANALYST REVIEW

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-02
**Synthesizes:** `docs/199-TECH-REVIEW-FLAG-BRIEF.md` + `docs/199-COACH-SUPPLEMENT.md` (f12d25bf) + Jon's decisions
**Pipeline stage:** Analyst Review → (Jon approval gate) → Coach Detailed Plan → Marc implements
**Base version:** v1.21.23 · master `03ae8ee6`

---

## Verdict

Coach's Supplement is **accepted in full**. Feasibility confirmed: one deterministic auto-stamp site, a proven multi-surface gate choke point, additive persistence, and flag-survival that rides the `isCrossed` lifecycle. This review **resolves P1–P3, picks the Q2 gate shape, finalizes the field model**, and adds **two requirements** Coach flagged as "small" that I'm elevating to explicit scope (reviewer-resolution UI + a phase-sequencing constraint).

## Resolved product decisions

### P1 — Can Sales uncheck a supplier auto-flag? → **NO (supplier); YES (manual).**
- Supplier-sourced flags (`techReviewFlagSource:"supplier"`) can be cleared **only by a reviewer** via resolution — Sales cannot uncheck their way past a vendor substitution. This is the whole point of the gate.
- Manual flags (`techReviewFlagSource:"manual"`) — the person who checked it (Sales) may freely toggle it while unresolved.
- **Implementation:** checkbox `onChange` gated on `techReviewFlagSource !== "supplier" || isReviewer`. (Coach concurs; I concur.)

### P2 — Does approve clear ALL flags or only reviewed ones? → **Approve-sweep clears all (IN SCOPE).**
- Project approval **is** the reviewing engineer's affirmative sign-off on the whole project — including its flagged lines. So on approve (line 34231), sweep all still-flagged rows → `techReviewResolved:true` (`techReviewResolvedBy` = approver, `techReviewResolvedAt` = now).
- This is a **safety net**, not the primary path — per-item resolution (P-primary below) is still the intended day-to-day mechanism. The sweep guarantees an approved project can never be permanently un-sendable due to a stray flag.
- Coach's caution (don't let a *pure* clear-all silently bless unreviewed items) is satisfied because the reviewer must take the explicit approve action; approval is not silent.

### P3 — Manual-flag re-raise after resolution? → **Re-check re-arms the gate.**
- Any manual check writes `{techReviewFlag:true, techReviewFlagSource:"manual", techReviewResolved:false, techReviewResolvedBy:null, techReviewResolvedAt:null}` — i.e. it **clears any prior resolution**, so a re-raised row re-blocks send until a reviewer resolves it again.
- Manual uncheck (allowed per P1) writes `techReviewFlag:false`.
- A previously-supplier-then-resolved row that Sales wants to re-question becomes a fresh **manual** flag (new Sales-raised question) — consistent, since the reviewer already cleared the supplier obligation.

### Q2 — Gate shape → **Option A: extend `findIncompleteQuoteItems`.**
- Emit one synthetic incomplete-item per unresolved Tech-Review row (e.g. `{isTechReviewBlock:true, count, …}`) inside `findIncompleteQuoteItems(project)` (line 15900). All **6** send/print surfaces inherit the block with zero new call sites — matches the `_hasPrice`/`_isValidPrice` "factor the rule" precedent and cannot be forgotten on a future 7th send path.
- **Block message (requirement):** the send-block banner/alert must say clearly, e.g. *"N line(s) require Technical Review sign-off before this quote can be sent — Send for Tech. Review, or have an engineer resolve them."* Not a generic "incomplete items."
- **Composition with `preReviewStatus`:** keep both. `_hasUnresolvedTechReview` blocks until flagged lines clear; `preReviewStatus` blocks until project review is approved. Different preconditions; the flag drives the user *into* review, approval clears the flag. (Coach traced this; confirmed.)

## Final field model (locked for the Detailed Plan)

Per-row fields (additive, no `APP_SCHEMA_VERSION` bump — Coach Q4 confirmed):
```
techReviewFlag: boolean
techReviewFlagSource: "supplier" | "manual"
techReviewResolved: boolean
techReviewResolvedBy: uid | null
techReviewResolvedAt: ms | null
```

Two-tier predicate (adopt Coach's refinement — one rule, two altitudes):
```js
const _isUnresolvedTechReviewRow = r => !!r.techReviewFlag && !r.techReviewResolved;
const _hasUnresolvedTechReview  = project =>
  (project.panels||[]).some(p => (p.bom||[]).some(_isUnresolvedTechReviewRow));
```
Row checkbox/indicator calls the row rule; the hard gate (Q2-A) calls the rollup. "What counts as unresolved" lives in exactly one function.

Auto-stamp site: **`src/app.jsx:38801`** (variance-review "Apply … to BOM") — stamp `techReviewFlag:true, techReviewFlagSource:"supplier"` at cross creation. No back-fill.

## Analyst-added requirements (elevated from Coach's "small" notes)

### R1 — Reviewer-resolution UI is IN SCOPE (not optional).
The hybrid resolution model requires a place for the reviewing engineer to clear items per-row. Requirement:
- **Who is a reviewer:** the project's assigned engineer (`preReviewAssignedTo === current uid`) **or** an admin. This defines `isReviewer` for P1 and for the resolve control.
- **Surface:** in the BOM view, a reviewer sees unresolved flagged rows with a distinct indicator and a per-row **Resolve** control (clears `techReviewFlag`'s block by setting `techReviewResolved:true`). Keep this visually **distinct from the existing red price-flag** (`_isBomRowFlaggedRed`) — do not overload that styling.
- **Checkbox enable/disable matrix:**

  | Row source | Sales (non-reviewer) | Reviewer / Admin |
  |---|---|---|
  | `supplier` | checked, **disabled** (cannot uncheck) | can Resolve |
  | `manual` (unresolved) | can toggle | can toggle / Resolve |
  | unflagged | can check (→ manual) | can check (→ manual) |

### R2 — Phase-sequencing constraint (dead-end guard).
The **hard gate (Q2-A) must NOT ship before the resolution path exists.** Shipping the block without a way to clear a flag creates an un-sendable project with no exit. Therefore the gate phase and the resolution phase (per-item Resolve + approve-sweep) **ship together, or resolution ships first.** Auto-stamp + checkbox + persistence can ship independently ahead of the gate (they're inert without the block).

### Suggested phasing (for Coach's Detailed Plan)
1. **P1 — Data + capture:** field model, two-tier predicate, auto-stamp @38801, checkbox UI + enable/disable matrix, persistence. *Inert (no gate yet) — safe to ship alone.*
2. **P2 — Resolution:** reviewer per-row Resolve control + `isReviewer` + approve-sweep @34231. *Must precede or accompany P3.*
3. **P3 — Hard gate:** extend `findIncompleteQuoteItems` (Q2-A) + block message. *Ships with or after P2 (R2).*

## Data-retention doc note (carry into the plan)
Add `techReviewFlag` / `techReviewFlagSource` / `techReviewResolved*` to the CLAUDE.md "preserved-metadata set" list (documentation only — the save path already preserves them mechanically; Coach Q4).

## Handoff
Ready for **Coach's Detailed Plan** (phased per above, with per-phase test criteria) — pending Jon's approval gate. Marc's #188 is separate/parallel.

# F050 activation plan — make the magnitude send-block actually fire

Coach scope, 2026-07-31. F050 = the PRJ402119 catcher (a $12 price on a $6,000 item passed the send-gate because it wasn't "red," just wildly wrong).

## Status of the F050 build (branch `worktree-agent-ae60bf6ad18b1fa49`, commit `4d4c8e66`)
The build added a send-gate block reading `row.aiEstimate` — **but no row carries a persisted `aiEstimate`** (it's produced only at runtime by `estimatePrices` inside the read-only `runPlausibilitySweep`, and `findIncompleteQuoteItems` is synchronous — can't await an AI call). So **F050 as-built is INERT** and needs rework to whichever estimate source Jon picks. Do NOT deploy as-is.

## Why AI-estimate was left off
`estimatePrices` (Sonnet 4.6, ~$0.14/project per pass) is gated by `AI_ESTIMATE_PRICING_ENABLED=false` (part of the B053 pricing-trust freeze). Re-arming AI in the pricing path is the wrong default while that freeze holds.

## Options
- **A — persist an AI estimate per row** (A1 every pricing run ~$0.40–0.85/proj recurring + re-arms AI in pricing [not rec]; A2 on-demand pre-send ~$0.14/proj once).
- **B — estimate at extraction** — same as A with worse timing; not recommended.
- **C — non-AI heuristic ($0):** **C1 = historical median.** For each row, pull the median `unitPrice` for the same part across the user's existing projects (already loaded by `loadProjects`, which the sweep uses). Flag when the row price < RATIO × that median. Deterministic, $0, synchronous-friendly, **no new persisted field** (computed live). Cold-start gap: brand-new parts with no history aren't magnitude-checked (acceptable — it's a safety net, and the 500×-off failure class is exactly what a coarse band catches). C2 = curated category band table (needs upkeep, coarser).
- **D (Coach recommendation) — hybrid:** **C1 as the synchronous send-gate** (catches the incident class, $0, AI-free) + keep the **AI sweep on-demand (A2)** as a deeper manual audit for parts C1 can't judge.

## Cost
C = $0 · A2 ≈ $0.14/project once · A1 ≈ $0.40–0.85/project recurring. A 3-orders-of-magnitude miss doesn't need AI precision to catch → **C1 is the min-cost catch.**

## Data-retention
C1 stores nothing (best posture). A/B add an additive `row.aiEstimate` (persists via the `{...project}` save spread automatically; add to the documented preserve list; no schemaVersion bump — additive). **In every option: a missing/failed estimate must NEVER block Send** (absent estimate ⇒ no block), else an API outage or legacy row freezes quoting.

## ⭐ Decisions for Jon
1. **Estimate source:** (a) **C1 historical-median, $0** [recommended] · (b) AI on-demand pre-send ~$0.14/proj once · (c) AI every pricing run [not rec — cost + re-arms AI in freeze].
2. **Block vs warn:** recommend **hard-block on HIGH severity** (price < 0.2× expected) + **warn-only on MED** (0.2–0.5×) to avoid false lockouts on legit-cheap parts.
3. **Thresholds:** keep `PLAUSIBILITY_RATIO=0.5` / `PLAUSIBILITY_HIGH_RATIO=0.2` or tune.
4. **Flag:** use a separate `F050_PLAUSIBILITY_ENABLED` (decoupled from the frozen `AI_ESTIMATE_PRICING_ENABLED`).

## Effort
C1 ≈ 0.5 day (build a part→historical-median index from loaded projects + `_plausibilityFloor(row,index)` helper + one new block in `findIncompleteQuoteItems` ~17850 + a branch in `formatIncompleteQuoteAlert` ~17958; factor the predicate per CLAUDE.md dual-consumer rule). A2 ≈ 1–1.5 days. The surrounding send-gate infra (`readyToSend`, Send-button consumers) is already correct — only the block + its flag + alert branch are net-new.

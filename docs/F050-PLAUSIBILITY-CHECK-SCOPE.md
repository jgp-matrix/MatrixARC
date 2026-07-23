# F050 — Price-Plausibility / Divergence Check + Sweep — Scope

**Author:** Freddy Lyst · **Code trace:** Marc Masdev · **Date:** 2026-07-23 · base v1.24.15
**Status:** SCOPED — awaiting Jon's Phase-0 decision (the reference signal). No build yet. Money-path.

## Why this exists
PRJ402119 shipped a $12 price on a ~$6000 SS enclosure. Root cause (confirmed): **BC's own purchase price for the part is $12** (bad BC master data); ARC pulled it faithfully; nothing flags a magnitude-implausible price. F050 = the guard that catches a bad-magnitude price regardless of source.

## ⭐ PIVOTAL FINDING (Thread 1): there is NO stored AI estimate to compare against
- When AI prices a row, the estimate goes **straight into `unitPrice`** (`priceSource:"ai"`), plus only non-numeric companions `aiBasis` (text) + `aiSources` (links) — `src/app.jsx:28787`, `15716`. **No dedicated numeric `aiEstimate` survivor.** Once BC/manual overwrites `unitPrice`, the AI number is gone.
- Worse: AI estimation **skips BC-priced rows entirely** (`:28768` / `:15709` filter `priceSource!=="bc" && !(unitPrice>0)`). The enclosure was **never AI-estimated** — there was no estimate to lose.
- ⇒ **"BC price vs. AI estimate" is impossible on existing data** without new AI calls.

Two other candidate signals also MISS this incident:
- **`bcPollDivergence` (B052)** — only fires on a *downward swing during the 5-min poll*. The enclosure was $12 from the first BC pull (no swing) → never flagged. B052 alone does NOT catch this.
- **`runPricingAudit` (ARC-vs-BC, `:5663`)** — compares ARC price to BC; ARC $12 == BC $12 → `risk:"none"`. Blind to bad data *inside* BC.

**⇒ F050 needs an ABSOLUTE plausibility signal, and the only one that semantically knows "$12 is wrong for an SS enclosure" is an AI estimate** — either stored going forward, or re-run on demand.

## Reference-signal options (Phase 0 — Jon's call)
| Option | Catches existing rows (PRJ402119)? | Cost | Notes |
|---|---|---|---|
| **(a) Store `aiEstimate` going forward** (on every row incl. BC-priced) | ❌ no (only new/re-priced rows) | 1 extra estimate pass at extraction | Makes send-time check instant + free forever after |
| **(b) On-demand AI re-estimate** (sweep + check) | ✅ yes | ⌈rows/10⌉ Sonnet calls per run (`estimatePrices`, batched 10/call) | The only retroactive signal; modest cost |
| **(c) Heuristic** (category floor / extended-total sanity) | ✅ partial | free/instant | Coarse, noisy, needs per-category tuning |
| **(d) `bcPollDivergence` only** | ❌ no | free | Structurally misses this incident |

**Freddy recommendation — hybrid (a)+(b):**
- **Going forward:** store a durable numeric **`aiEstimate`** on every row (a parallel estimate-only pass that also runs on BC-priced rows, writing ONLY `aiEstimate`, never touching `unitPrice`). Then F050's send-time check is **instant + free** (compare `unitPrice` vs stored `aiEstimate`).
- **Retroactively (the sweep):** **on-demand AI re-estimate** over existing projects — catches PRJ402119 + any other in-flight quote NOW.
This delivers exactly Jon's ask ("price far below its AI estimate") both forward and backward.

## Build plan (money-path → Coach review + test + Jon gate per phase)
**Phase 1 — F050 send-time predicate (SSOT, HARD block):**
- `_isPriceImplausible(r)` in the predicate cluster after `_hasPrice` (~`:16331`). Inputs OR-combined: `r.bcPollDivergence` (fold in the current `:16377` B052 line) + the absolute test (`_hasPrice(r) && r.aiEstimate>0 && unitPrice < aiEstimate*THRESHOLD`).
- Consumed by `_isBomRowFlaggedRed` (`:16372`, replacing the standalone `:16377`) → row goes **red**; and `findIncompleteQuoteItems` (`:16512-16534`) push `isImplausiblePriceBlock` → **hard-blocks send** via existing `sendBlocked` (`:34316/34321`); distinct alert copy in `formatIncompleteQuoteAlert` (`:16577-16594`). Hard block (not the soft auto-Budgetary path) — precedent: `manualVerifyRequired`, Tech-Review.

**Phase 2 — durable `aiEstimate` going forward:**
- New estimate-only branch that calls `estimatePrices` (`:15786`) for BC/manual rows too, storing only into `aiEstimate` (additive field; survives save — only `dataUrl` is stripped). Feeds Phase 1's absolute test for all future quotes.

**Phase 3 — the SWEEP (admin report, READ-ONLY):**
- `runPlausibilitySweep(uid,onProgress)` cloned from `runPricingAudit` skeleton (`:5663`: `loadProjects`→panels→bom). For each priceable row: on-demand `estimatePrices` (retroactive signal) + `_isPriceImplausible`; classify by magnitude of the price/estimate gap. New admin card + `PlausibilitySweepModal` beside Pricing Audit (`:42737`), modeled on `PricingAuditModal` (`:41373`). Report only, no mutations; optionally log to `pricingSyncLog`.

## Open decisions for Jon
- **D1 (Phase 0, pivotal):** reference signal — hybrid (a)+(b) [rec], on-demand-AI-only (b), or heuristic (c)? Confirms whether we accept the sweep's per-run AI-call cost.
- **D2:** divergence threshold — flag when `unitPrice < aiEstimate × ratio`. Suggest **ratio = 0.5** (price below half the AI estimate) to start; tune from sweep results. ($12 vs ~$6000 = 0.2% → caught at any sane ratio.)
- **D3:** send-time behavior — HARD block [rec] vs warn.

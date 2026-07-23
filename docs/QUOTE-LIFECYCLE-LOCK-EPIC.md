# Quote Lifecycle & Lock — Epic Build Plan

**Author:** Freddy Lyst · **Code trace:** Coach (Sam Wize) · **Date:** 2026-07-23 · base v1.24.15
**Status:** SCOPED — awaiting Jon's decisions D1–D5 (blocking). No build until decisions land. All money-path → Coach review + test + Jon gate per phase.
**Origin:** PRJ402119 pricing incident (`docs/PRJ402119-PRICING-INCIDENT.md`). Root cause: auto-price-check-on-open reopened sent quotes, bumped `quoteRev` (→ IN-PROCESS demotion) and rewrote prices from bad BC data; no true lock; no freshness gate.

## Keystone shared predicates (build first)
- **`_isBomLocked(project)`** — NEW, near `_sentSoftBlockActive` (`src/app.jsx:38145`). True when `quoteSentAt` set AND not in a sanctioned-unlock state. **Do NOT overload `quoteLocked`** (self-clears on first edit `:9601/:9913`, sole consumer = on-open price-check guard; reusing re-tangles B034/B036). Project-level, row-agnostic.
- **`_priceExpiresWithinValidity(r, validityDays)`** — NEW, near `_isBomRowFlaggedRed` (`:16458`). Flag when `_effectivePriceDate(r) + defaultStaleDays·DAY < now + validityDays·DAY`. `defaultStaleDays` = `_pricingConfig.defaultStaleDays||60`; `validityDays` = `resolveQuoteValidityDays(project,…)` (`:2272`, default 30).

## Pieces + insertion points (line numbers verified current)
- **F048 — true lock (FOUNDATION).** Client: add `bomSentLocked` term to ProjectView readOnly composition `:38792` (flows to PanelCard `:36775` → all row inputs) + defensive early-return in `updateBomRow` `:27594`. Suppress auto-pricing: on-open price-check guard `:38490` (replace `quoteLocked&&!expired` with `_isBomLocked` — closes the expiry + unlock-edge escapes); gate auto `runPricingOnPanel` callers `:26006/:26203/:27071/:29036` (leave manual buttons `:29938/:29944`). Rules backstop: `isQuoteSentLocked` mirroring `isWonOrLostLocked` (`firestore.rules:223`), wire into project update gate `rules:436` with carve-outs (send-write, unlock, ECO index, priority-pin, `_noBumpWrite`). **= the IN-PROCESS demotion fix** (no post-send edit → no `quoteRev>quoteSentRev` at `:16926`).
- **Staleness-red-suppress-on-locked.** In `_isBomRowFlaggedRed` (`:16458`), skip ONLY the date-aging branch `:16469-16471` when locked; keep `bcPollDivergence`/qty=0/price=0/no-firm-LT. Predicate is row-only → add a `bomLocked` param; update all callers (`:30297,:16488,:16862,:1706,:1712` — re-grep, enumeration-is-a-floor). Send-gate impact moot post-send (behind `quoteSent` short-circuit `:16924`).
- **F051 — freshness gate.** (a) On open: new sibling useEffect near `:38463`; soft notice + Get-New-Pricing when `_priceExpiresWithinValidity` hits. (b) On send: fold `_priceExpiresWithinValidity` into `findIncompleteQuoteItems` (`:16574`, parallel to stale push `:16611`) → hard-blocks both send paths + print-gate (SSOT).
- **F049 — PO quoted-vs-current reconcile.** Prereq: NEW additive `quotedBomSnapshot`@send (both paths `:34605`/`:40591`), per-row {qty,unitPrice,partNumber,leadTimeDays}+totals@sentRev. Diff at `PoReceivedModal.onDone` `:40655` pre-`wonAt` `:40664`.
- **F052 — expired-quote at PO receipt.** Same insertion `:40655`. If `quoteExpiresAt<now` → warn; (a) accept-as-is via NEW additive `acceptedOrderTotal` (+By/At) — **no order total is stored today** (computed `:21489/:36910`); (b) re-quote → refresh → resend → request updated PO.

## Recommended build SEQUENCE
1. `_isBomLocked` foundation (+ sanctioned-unlock scaffold) — needs D1/D2.
2. **F048** client guard + auto-pricing suppression + rules backstop — *this alone prevents the incident + fixes the demotion.*
3. Staleness-red-suppress-on-locked (trivial once #1 exists; ship with F048).
4. `_priceExpiresWithinValidity` + F051(b) send-block, then F051(a) on-open notice.
5. `quotedBomSnapshot`@send → F049 reconcile → F052 expired-handling + `acceptedOrderTotal` (co-located, build together, last).

## Decisions for Jon (BLOCKING)
- **D1 — Unlock model:** does the true lock REPLACE the ack soft-unlock, or coexist? (Real freeze needing owner/admin unlock like Won/Lost, vs. user can still ack-through.)
- **D2 — Sanctioned unlock paths + expiry:** which of owner/admin session-unlock, ECO, F051 refresh? And should an EXPIRED sent quote auto-reprice (today it does) or require explicit "Get New Pricing"? *Rec: no silent auto-reprice; expiry surfaces F051's refresh, nothing auto-writes.*
- **D3 — F049 snapshot granularity:** full per-row vs totals-only. *Rec: full rows.*
- **D4 — F051(a) on open:** soft notice vs blocking. *Rec: soft (blocking = nag-modal); the send gate F051(b) is the hard stop.*
- **D5 — F052 manual adjustment:** new record-only `acceptedOrderTotal` field vs per-panel markup override. *Rec: record-only additive field (auditable, doesn't mutate pricing).*

## Risks / notes
- No order-total stored → F052(a) is a net-new additive field. No quoted snapshot → F049 net-new capture in TWO send paths (keep in sync — or factor a shared send helper first).
- LT "expiring within validity" has no date model (`_hasFirmLeadTime` is source-based) — confirm what LT-freshness means (likely reduces to "not firm").
- `_isBomRowFlaggedRed` signature change ripples to 6 sites — update all.
- **B053** (auto-price-check repeat-nag on UNLOCKED quotes + "does more harm than help") is RELATED but distinct — F048 only suppresses the check on LOCKED quotes; the unlocked-quote repeat-nag + a possible rethink of on-open auto-check is separate, to diagnose.

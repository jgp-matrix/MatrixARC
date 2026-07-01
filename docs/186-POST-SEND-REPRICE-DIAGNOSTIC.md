# Freddy — #186 follow-up diagnostic: post-send BC re-price exposure (READ-ONLY)

**To:** Freddy (Analyst) · **From:** Marc · **Date:** 2026-07-01 · **Diagnosis only — no data written**

Per C127: pre-v1.21.12 the price-check modal's Accept overwrote `row.unitPrice` (PURCHASE COST)
with `priceSource:'bc'` on locked/sent quotes, shifting the customer-facing SELL price via margin
recalc. This is the "were real quotes affected?" spot-check.

## Method (read-only)
Scanned the live `companies/{cid}/projects` collection in the controlled tab. Detection set =
non-labor, non-`_isExcludedFromPriceCheck` BOM rows with `priceSource:'bc'` whose effective price
date (`priceDate`/`bcPoDate`) is **after** the project's latest `quoteSentAt`, on frozen projects
(`quoteSentAt` set, or won/lost). Deduped the collection (see caveat 4). No writes of any kind.

## Headline
- **113 project docs → 84 real projects** (~29 `arc-…` stub docs excluded).
- **15 frozen** projects (sent/won/lost).
- **5 candidate projects, 35 candidate rows.**
- **Real customer-facing exposure: 1 project (PRJ402091).** The other 4 were sent to
  `noah@matrixpci.com` — an internal Matrix address (internal/test sends).

## Candidate projects (affected-row cost = current cost of the flagged rows, NOT the shift)

| Project | Rows | Affected-row cost | quoteRev / sentRev | Sent to | Read |
|---------|------|-------------------|--------------------|---------|------|
| PRJ402089 | 13 | $9,318.36 | 8 / 8 | noah@matrixpci.com | internal |
| PRJ402103 | 7 | $873.30 | 1 / 1 | noah@matrixpci.com | internal (single send, never revised) |
| **PRJ402091** | **11** | **$764.19** | **3 / 3** | **riley.thurgood@ovivowater.com** | **EXTERNAL customer (OVIVO), sent 2026-05-07** |
| PRJ402079 | 2 | $110.51 | 8 / 8 | noah@matrixpci.com | internal |
| PRJ402092 | 2 | $26.61 | 4 / **3** | noah@matrixpci.com | in-progress Rev 4 (unsent) → expected, likely NOT bug |

## What this means
- **Genuine customer exposure is small: effectively PRJ402091 only** — 11 rows, $764.19 of the
  affected rows' current cost, on a real OVIVO quote (Rev 3). Everything else is internal/test or
  an in-progress revision.
- **The exact sell-price shift is NOT reconstructible.** Accept overwrote `unitPrice` with no
  prior-value field, and there is no sent-total snapshot — the only quote baseline stored is
  `lastQuoteHash` (a non-invertible hash). So I can bound the affected-row *cost* but cannot state
  "$X of sell moved." Illustrative envelope: at a typical ~30% margin, PRJ402091's $764 of affected
  cost carries ~$1,090 of sell weight, but the *actual* shift is only the changed fraction of that
  cost (BC price vs prior price) — realistically well under that, likely tens–low-hundreds of $.

## Caveats (important for interpreting the count)
1. **Bug vs legit re-price not cleanly separable.** `priceSource:'bc'` + post-send date catches
   both the modal-Accept bug AND legitimate "refresh pricing" (`runPricingOnPanel`) done during an
   unlock→revise window. `quoteRev == quoteSentRev` (true for 402089/402103/402091/402079) narrows
   to "the latest revision WAS sent, yet rows priced after it" — the strongest bug signal. PRJ402092
   fails this (Rev 4 unsent) and is almost certainly legit in-progress work.
2. **Stored date is BC's effective date, not the action timestamp.** The modal-Accept stored
   `priceDate = bcPoDate = bc.startingDate`, so "afterDays" measures how far BC's price effective
   date trails the send, not when the click happened. The count is a proxy, not proof of a post-send
   click. The modal-Accept bug is a *subset* of this set.
3. **`noah@matrixpci.com` treated as internal** — 4/5 sends. Confirm with Jon if any of those were
   actually forwarded to a customer.
4. **Dedupe:** the collection carries `arc-…` stub docs (0 panels) alongside real project docs; I
   kept the doc with panels per project number. First uncorrected pass reported 6/43 before dedupe +
   labor/BUYOFF exclusion; corrected figure is 5/35.

## Suggested framing for the remediation decision (yours to make)
The data does not support a fleet-wide correction. The only real customer-facing candidate is
**PRJ402091** (OVIVO, ~$764 affected-row cost, true sell delta a fraction of that). If remediation
is wanted, it's a targeted per-row review of that single quote (compare current BC-sourced costs
against what OVIVO was quoted at Rev 3), not a mass fix. v1.21.12 already stops any further
occurrence.

# Freddy — New bug for analysis + assignment: #186 locked-quote BC price-check nag

**To:** Freddy (Analyst) · **From:** Marc · **Version:** v1.21.11 · **Date:** 2026-07-01

Freddy — new bug reported by Jon. **This is yours to analyze and assign** — scope it, decide the
approach, and make the work assignments (who implements, who reviews, what gates apply). The
preliminary investigation below is input you can use or override; no fix has been deployed.

---

## The bug (Jon-observed, live)

Opening a **sent / locked** quote (a project whose quote has already gone out — it shows the
**"LOCKED REV NN"** status pill) pops the **"💲 BC Purchase Price Updates"** modal, asking the
user to accept updated BC pricing. That should never happen on a quote the customer has already
received.

On a frozen quote, **both** modal actions mutate the quoted BOM:
- **Accept** overwrites each selected row's `unitPrice` / `priceDate` / `bcPoDate` and sets
  `priceSource:'bc'` — silently changing pricing the customer was already quoted.
- **Dismiss** stamps `bcPriceCheckDismissed` on the rows and saves.

---

## Preliminary investigation (Marc — input for your analysis, not a decision)

**Root cause found:** the BC purchase-price check runs in a `useEffect` (app.jsx:36532) that
fires on **every project open** plus a **30-second poll**, comparing each BOM row's `unitPrice`
against BC Purchase Prices and showing the modal on any material diff (>1% AND >$0.10, BC date
newer). It has **no lock/quoted/sent status gate** — only the per-row dismiss stamp and the
price-delta threshold. The panel card already soft-blocks sent quotes via `sentReadOnly`
(app.jsx:36760), but this price-check path predates / bypasses that model.

**Frozen-state signals available:** `project.quoteSentAt` (drives the "LOCKED REV NN" pill;
`quoteLocked` is set alongside it at send), and `project.wonAt` / `project.lostAt`.

**Candidate fix (in working tree, NOT deployed, revertible):** early-return in `tryCheck` when
the project is frozen —

```js
const _fp=projectRef.current||{};
if(_fp.quoteSentAt||_fp.wonAt||_fp.lostAt)return;
```

placed after the `_bcToken` check, before `priceCheckRan` is set. Suppresses the modal + the 30s
re-poll on sent/won/lost projects; leaves the check intact for draft/in-process; changes no
pricing data.

---

## For your analysis / Brief

Open questions the investigation surfaced that are yours to resolve:

1. **Predicate** — `quoteSentAt` vs `quoteLocked` vs the soft-block `sentReadOnly`? The soft-block
   allows an acknowledged in-session edit — should the price-check stay suppressed after ack, or
   re-enable?
2. **Scope** — is freezing on `wonAt`/`lostAt` correct, or over-reach?
3. **Silent-mutation angle** — separate from the nag: should a *legitimate* BC price change on a
   locked quote surface to the owner as a **read-only notice** (no write), rather than being fully
   suppressed?
4. **Assignments** — who implements, who reviews, and whether this is a trivial fix or warrants
   the H-item plan/review gates (it touches a BC/save-adjacent path).

# B044 (evc too loose) + F026 (split evc → REVIEW / SEND) — Coach diagnostic

**Coach read-only trace · 2026-07-22 · all refs `src/app.jsx`.**

## Q1 — Why red/unpriced/no-LT projects land in "Ready To Review/Send"

### The `evc` predicate (`computeProjectEffectiveStatus`)
```
if((hasUnpriced||hasActiveRfqs)&&hasBom) return "rfqs";        // :16577
if(hasBom&&!hasUnpriced&&!hasActiveRfqs)  return "evc";         // :16578  ← Ready To Review/Send
```
Inputs: `hasBom` (:16544, any non-labor row); `priceable` (:16553, `!_isExcludedFromPriceCheck` :16262 — excludes labor/customerSupplied/contingency/Matrix-Systems/buyoff/crate); **`hasUnpriced` (:16554) = `priceable.some(r=>!r.unitPrice||r.unitPrice===0||!r.priceDate)`**; `hasActiveRfqs` (:16558) = `priceable.some(r=>r.rfqSentDate&&!r.bcPoDate)`.

### Root cause: `hasUnpriced` is NARROWER than the red-row rule + the send gate
`_isBomRowFlaggedRed` (:16282) reds on 5 conditions: qty=0; unitPrice=0 (unless vendor=customer); priceDate missing; priceDate **stale** (>60d); **no firm lead time** (`_hasFirmLeadTime` :16246). `findIncompleteQuoteItems` (send gate, :16377) blocks on: qty=0, unitPrice=0, priceDate missing, **stale priceDate** (:16413), `manualVerifyRequired` (:16391), **unresolved tech-review** (:16431), unpriced service cards (:16447).

| Condition | Red? | Blocks Send? | Trips `hasUnpriced`? |
|---|---|---|---|
| unitPrice missing/0 | yes | yes | **yes** |
| priceDate missing | yes | yes | **yes** |
| priceDate stale (>60d) | yes | yes | **NO** |
| no firm lead time | yes | no | **NO** |
| qty=0 (nonzero price) | yes | yes | **NO** |
| unresolved tech-review | yellow | yes | **NO** |
| manualVerifyRequired | — | yes | **NO** |

Any project whose remaining reds/blocks fall only in the "NO" rows satisfies `evc` → routes to "Ready To Review/Send" (`statusToCol.evc` :44648) even though Send is blocked. = Jon's report.

### Verdict: mixed
- **Genuine bug** for stale-date / qty=0 / unresolved-TR / manualVerify: they block Send but `evc` waves them into "Ready to send." Same family as **B018**.
- **Intended-but-confusing** for lead-time-only reds: a non-firm LT is RFQ-eligible, not send-blocking (#175) — the split resolves this ambiguity.
- **Secondary (opposite) divergence to fold in:** `hasUnpriced` has NO vendor-is-customer exemption, but `_isBomRowFlaggedRed` (:16286) + the send gate (`_vic` :16408) do → a $0 customer-supplied row wrongly trips `hasUnpriced` and keeps a project OUT of evc.

## Q2 — Predicates to split evc → READY TO REVIEW vs READY TO SEND

### "Issues" column (F003) + "Issues cleared"
Issues cell renders per red row: **confidence chip** (Red=low, Yellow=medium; `confidence` :9902/:12706), **BC chip** (Red=not in BC; `bcMatchType`), **tech-review flag** (`_isUnresolvedTechReviewRow` :16300 / `_hasUnresolvedTechReview` :16301). No single `issuesCleared()` helper today. Planning def:
```
issuesCleared(project) = no row confidence in {low,medium} && no row not-in-BC
  && !_hasUnresolvedTechReview(project) && !any panel.extractionReport.manualVerifyRequired
```
**★ OPEN DECISION (Jon):** which Issues gate READY TO REVIEW — confidence + BC chips (advisory today, don't block Send), or only tech-review + manualVerify (already hard send-gates)? This is the one genuinely ambiguous input.

### "Clean BOM / ready to send" — reuse SSOT, no new inline
No consolidated `isSendable()` today — `_sendBlocked` recomputed inline at :37031/:34660/:34671/:38965/:40019. Introduce ONE helper all consumers call:
```
readyToSend(project) = findIncompleteQuoteItems(project).length===0 && !anyRedRow(project)
  where anyRedRow(project) = panels.some(pan => (pan.bom||[]).some(r =>
     _isBomRowFlaggedRed(r, project.bcCustomerNumber, project.bcCustomerName)))
```
`!anyRedRow` closes the lead-time/stale gap via the existing `_isBomRowFlaggedRed`; `findIncompleteQuoteItems` covers tech-review/manualVerify/service cards. Together = Jon's "no red rows, all pricing, all lead times."

### Mapping to Jon's buckets
```
readyToReview(project) = hasBom && !hasActiveRfqs && issuesCleared(project)   // may still have red/LT/pricing gaps
readyToSend(project)   = readyToReview(project) && (findIncompleteQuoteItems==0 && !anyRedRow)
```
Current `evc` maps to NEITHER cleanly (looser than review on Issues, looser than send on reds) → need one relaxed (review) + one strict (send) predicate, both from existing helpers.

### Review-completed-with-red-rows → return to RFQs
Already emergent: approval sets `preReviewStatus:"approved"` (:35389); `computeProjectEffectiveStatus` only special-cases `"pending"` → `pre_review` (:16576), so `"approved"` falls through to the `hasUnpriced/hasActiveRfqs` test → red/active-RFQ projects already route back to `rfqs`. Gap = `hasUnpriced` misses stale/LT/qty reds. One-line broadening:
```
if(hasBom && anyRedRow(project))  return "rfqs";       // red rows remain → back to RFQs
if(readyToSend(project))          return "evc_send";
if(readyToReview(project))        return "evc_review";
```
(after the quoteSent/postReview/preReview-pending short-circuits). **Open:** should a stale-PRICING red route to `rfqs` (implies re-RFQ) or a distinct "refresh pricing" state? (Jon.)

## Risks (flag before implementing the split)
1. **Kanban triple** (`order`/`labels`/`statusToCol` :44646-44648) must stay in lockstep; `statusToCol` currently folds 6 statuses into `evc` (incl. extracted/validated/costed/quoted/pushed_to_bc) — decide where those land; keep the map total or `||"draft"` (:44659) silently dumps to Draft.
2. **`bcPoStatus` carve-out** (:44657) removes Won from Sales board; verify a REVIEW/SEND project can't carry a stale `bcPoStat`.
3. **Active-ECO short-circuit** (:16541) overrides all → ECO never reaches evc branch (fine); **Badge map** (:16596 `evc→"Ready"`) needs 2 new entries+colors or the pill breaks.
4. **B018 alignment** — consolidating on `findIncompleteQuoteItems` + `_isBomRowFlaggedRed` fixes B044 + B018 + the split together (the send-count `_pricingCount` :37049 disagrees with the red set today).
5. **`_statusClockStart` (:16513) / F025 aging** — new `evc_review`/`evc_send` fall to the `updatedAt` fallback unless `statusChangedAt` stamps the review→send transition (saveProject/saveProjectPanel already stamp on effective-status change).

**Bottom line:** B044 = real predicate misalignment (`hasUnpriced` strictly narrower than red-rule + send-gate). Fix by introducing two SSOT helpers (`readyToReview` looser+Issues, `readyToSend` = send-gate-empty && !anyRedRow) + an `anyRedRow→rfqs` return branch, updating the kanban triple + Badge map in lockstep — resolving B044 + B018 + the F026 split in one consolidation. One open Jon decision: which Issues gate READY TO REVIEW.

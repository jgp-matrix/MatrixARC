# Kanban Status / Column Rules — Review (B101)

> Freddy analyst review, 2026-08-05 · prod v1.24.94 · code-grounded map of `computeProjectEffectiveStatus` + all predicates + the RFQ sent-vs-applied tracking break. For Jon + Freddy to walk through and rule on the desired behavior. All line numbers from current `src/app.jsx`.

## 1. Precedence chain — `computeProjectEffectiveStatus` (first match wins)
1. no project → `draft`
2. no panels → stored `status`
3. empty (no drawings, no started panel, no BOM) → `draft`
4. **quote sent** (`quoteSentAt`): not diverged (`quoteRev<=quoteSentRev`) → `budgetary_sent`/`firm_sent`; diverged → `in_progress`  *(preempts everything below)*
5. `postReviewStatus==="pending"` → `post_review`
6. `preReviewStatus==="pending"` → `pre_review`
7. **`hasBom && (anyRedRow || hasActiveRfqs)` → `rfqs`**  *(the RFQ/red bucket — preempts BOTH ready buckets)*
8. `readyToSend` → `evc_send`
9. `readyToReview` → `evc_review`
10. fallthrough → pipeline status (extracted/validated/costed/quoted/pushed_to_bc → READY / In Process)

## 2. Status → board column (`statusToCol`)
`draft→Draft` · `post_review→Draft(!)` · `in_progress + extracted/validated/costed/quoted/pushed_to_bc→In Process` · `rfqs→RFQs Send/Receive` · `pre_review→In Pre-Review` · `evc_review→READY TO REVIEW` · `evc_send→READY TO SEND` · `budgetary_sent/firm_sent→Quotes Sent (toggle)` · Won/PO'd w/o ECO → dropped from Sales board.

## 3. Predicates
- `_isBomRowFlaggedRed(r)` — RED if any: BC-poll divergence; `qty===0`; `unitPrice===0` (non-customer-supplied, vendor≠customer); or (priceable, vendor≠customer, not Duct/DIN reorder-commodity): **no `_effectivePriceDate`** OR **`_effectivePriceDate` older than `defaultStaleDays||60`**; PLUS `!_hasFirmLeadTime`.
- `_effectivePriceDate(r)` — **for `priceSource==="bc"` rows uses `bcPoDate`; else `priceDate`.**  ← reconciles the probe (see §5).
- `_hasFirmLeadTime(r)` — false if `leadTimeDays==null`; true for Duct/DIN; else `leadTimeSource && !=="ai"`.
- `_hasPrice(r)` — `unitPrice>0`.
- `anyRedRow` — any row `_isBomRowFlaggedRed`.
- `issuesCleared` — no unresolved tech-review AND no `manualVerifyRequired` (the two HARD blockers only).
- `readyToReview` — `hasBom && !hasActiveRfqs && issuesCleared`.
- `readyToSend` — `readyToReview && findIncompleteQuoteItems empty && !anyRedRow`.
- **`hasActiveRfqs` — `hasBom && priceable.some(r=>r.rfqSentDate && !r.bcPoDate)`** ← the whole "answered?" test is `bcPoDate` presence.

## 4. THE RFQ SENT-vs-APPLIED BREAK (root of B101)
- `rfqSentDate` is set once by `onRfqSent` (:43873) and **NEVER cleared / nulled anywhere** (grep-confirmed). There is **no** `rfqReceivedDate`/`rfqResolved`/`rfqAnswered` field — none exist.
- The only "answered" signal `hasActiveRfqs` reads is **`bcPoDate`**.
- **Applies that DON'T set `bcPoDate`:** manual per-row price (`commitPrice` :31193 sets `bcPoDate:null`); the portal **manual-preserve** branch (:44185) leaves `bcPoDate` untouched (null). Only the portal **BC** branch (:44191) sets `bcPoDate:now`.
- ⟹ A row priced by manual/supplier-preserve keeps `rfqSentDate && !bcPoDate` = **true forever** → project **welded to RFQs Send/Receive**, even though the row is fully & correctly priced (green, not red).
- **Tile "N SENT" pill** (`sentVendorCount` :18541) counts distinct vendors across any row with `rfqSentDate`, **no price/PO gate** → **never decrements** (matches Jon's report: received/applied quotes don't reduce the SENT count).
- **Tile "N RFQ" red pill** = `rfqUploads` docs with `status==='submitted'` → this DOES decrement on apply (flips to `'imported'`). (So the received-count works; the SENT-count + routing don't.)

## 5. Reconciliation of the "are there red rows?" question
Jon: PRJ402501 / PRJ402143 have NO red rows → should be READY TO REVIEW. Freddy's earlier probe flagged "stale" rows — **that probe was wrong**: it aged `priceDate`, but the real rule ages `_effectivePriceDate`, which for `bc` rows is **`bcPoDate`** (e.g. the 217-day `DUCT` row is `bc` + has a recent `bcPoDate` → NOT stale → not red). So Jon is right for those rows. ⚠ ONE edge to confirm on screen: a `bc`-sourced row with **no** `bcPoDate` (e.g. `FLEXY20500` on 402501) has no `_effectivePriceDate` → the rule marks it RED. If any such rows genuinely show red, `anyRedRow` is true and Part B (below) also matters; if none show red, **Part A is the entire fix.**

## 6. Fix options for the RFQ tracking (Jon to rule)
- **Part A (the confirmed bug):** an RFQ is "answered" once the row has a real applied price — not only when `bcPoDate` is set. Two ways: (a) every apply path stamps a per-row resolution marker (or sets `bcPoDate`/a new `rfqResolvedDate` on manual/supplier applies too); or (b) repoint `hasActiveRfqs` + the "N SENT" tile count at `_hasPrice(r)` (real price, any source) instead of `bcPoDate`. Rec: (b) is the smaller, SSOT-friendly change; (a) is more explicit/auditable. Both make the SENT count decrement + release the RFQs column when quotes are applied.
- **Part B (only if red rows are real):** the `anyRedRow` clause (step 7) preempts READY TO REVIEW, contradicting the design comments that say review may carry pricing/LT gaps. Reverses a deliberate B044 decision. Only needed if §5's red edge is real.

## 6b. ★ CORE DESIGN FLAW (Jon 2026-08-05) — status inferred from ABSENCE of blockers, not POSITIVE completion
Live: a freshly **copied** project (clean BOM, never technically reviewed) routed straight to **READY TO SEND**, skipping READY TO REVIEW. Root: `readyToSend = readyToReview && quote-complete && !anyRedRow`, and `readyToReview`'s only review gate is `issuesCleared` = **"no UNRESOLVED tech-review flag."** A never-reviewed project has NO TR flag → `issuesCleared`=true → it passes review gates it never actually went through. The system cannot distinguish **"review completed & passed"** from **"review never happened"** — both read as "nothing blocking." Same disease as the RFQ stickiness (§4): no POSITIVE "RFQ answered" flag; here no POSITIVE "review done" flag.

## 6c. ★★ AUTHORITATIVE STATUS SPEC (Jon 2026-08-05) — dynamic, sequential state machine
**Dynamic principle:** a status flag "trips" the moment its condition becomes TRUE, advancing the project to the next column; if any condition becomes UNTRUE the project **auto-reverts** to the status it actually belongs in. Recomputed live/continuously. **Sequential dependency:** a status is only reachable when ALL prior statuses' conditions are satisfied (e.g. RFQS SEND/RECEIVE requires DRAFT + (BOM) IN PROCESS satisfied first).

**The ladder (evaluate top-down; a project sits in the FIRST status whose condition holds — equivalently, the highest rung whose own + all lower conditions are met):**

| # | Status / column | Condition (Jon's words → predicate) |
|---|---|---|
| 1 | **DRAFT** | Project created; **no drawings loaded** AND **no BOM items besides auto-populated items or labor rows** (nothing really extracted). |
| 2 | **(BOM) IN PROCESS** | Extracted BOM that **has ISSUES in the Issues column** — **Blue BC circles, Red BC circles, or Confidence circles**. (BC-match incomplete / low-confidence items still being worked.) ← NOTE: this ELEVATES the BC-match/confidence indicators to a routing gate; today they're only advisory. |
| 3 | **RFQS SEND/RECEIVE** | Issues cleared, but the BOM **has Red Rows** (row-level red = `_isBomRowFlaggedRed`: qty0 / $0 / no-firm-LT / stale-or-missing effective price date). ← NOTE: Jon's definition is **red rows ONLY** — the `rfqSentDate`/`hasActiveRfqs` clause is DROPPED from routing (that fixes the PRJ402501/402143 stuck-in-RFQs cases by definition; the "# SENT" tile-count decrement is a SEPARATE display fix, §4/§6-A). |
| 4 | **IN PRE-REVIEW** | No issues, no red rows, and the project is **currently in the Tech Review process** (`preReviewStatus==="pending"`). |
| 5 | **READY TO REVIEW** | **No Red Rows** (and no issue-circles) **AND has NOT been approved by Tech Review** — i.e. never submitted, OR **returned/REJECTED** from review. (Rejected → lands here. If a change re-introduces a red row → reverts to RFQS.) |
| 6 | **READY TO SEND** | All prior satisfied **AND POSITIVELY approved by Tech Review** (`preReviewStatus==="approved"`) **AND not yet sent to the customer** (`!quoteSentAt`). ← the positive review flag; a never-reviewed project can NEVER reach here (fixes the copy→Ready-to-Send jump). |
| 7+ | (beyond spec) | sent-to-customer → **Quotes Sent**; ECO / purchasing continue past here. |

**Reversion rules (fall directly out of live re-evaluation):** review REJECTED (`preReviewStatus` not approved) → drops to READY TO REVIEW (rung 5); review produces / any edit adds a red row → drops to RFQS (rung 3); a new unmatched/low-confidence item → drops to IN PROCESS (rung 2).

**What this fixes:** (a) priced projects with lingering RFQ flags → READY TO REVIEW (RFQS is red-rows-only now); (b) copy/new clean project → READY TO REVIEW not READY TO SEND (send needs positive `approved`).

**★ Open mapping to nail before build (Coach to trace, Jon to confirm):**
- **Exact predicates for the Issues-column circles** — Blue BC circle (= unmatched / `bcVerify` not-in-bc / no `bcNo`?), Red BC circle (= BC divergence/mismatch?), Confidence circle (= low extraction-confidence chip threshold?). Need the precise fields that drive each UI indicator → define one `hasBomIssueCircles(project)` predicate.
- Confirm READY TO SEND keys on `preReviewStatus==="approved"` (positive) and that never-submitted/`rejected` both fall to READY TO REVIEW.
- DRAFT's "auto-populated items or labor rows" exclusion set (so a project with only labor/auto rows stays DRAFT).
- Where `postReviewStatus`, Quotes Sent, ECO, purchasing slot in beyond rung 6.

**Next step:** Coach traces the circle predicates + I turn this table into the single `computeProjectEffectiveStatus` rewrite spec (replacing the scattered predicates), Jon confirms, then build. NOT a build yet.

## 7. Other gaps found (for the walkthrough)
- **"awaiting" vs routing disagree:** the To-Do rail's "awaiting" (:18537) excludes priced rows, but `hasActiveRfqs` (routing) doesn't → rail can say "0 awaiting" while the board still holds the project in RFQs.
- **`post_review` folds into the Draft column** on the Sales board (`statusToCol` maps it to `draft`) — shows "In Post-Review" pill but sits in Draft.
- **`active_eco` is dead-but-present** in the maps (F061 stopped emitting it) — harmless dead mapping.
- **`findIncompleteQuoteItems` re-inlines** the stale/reorder-commodity exemption instead of calling `_isBomRowFlaggedRed` → two copies of the rule (drift risk, violates SSOT).

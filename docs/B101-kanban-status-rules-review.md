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

**★ Circle predicates — TRACED + PINNED (Coach, code-confirmed):** the "Issues" column (`_status` cell, render ~:33816) holds TWO circle families:
- **BC circle** (tri-state, `_bcCircle` IIFE :33785-33800, per-ROW, only when BC connected): no circle if `bcNo || bcVerify.status==="in-bc" || priceSource==="bc"`; **RED** = `bcVerify.status==="not-in-bc"` (confirmed NOT in BC catalog); **YELLOW** = `bcVerify.status==="fuzzy"` (ambiguous, awaiting confirm); **BLUE** = editable + un-linked + none of the above (the broad "un-matched, click to match" default for freshly-extracted unpriced rows).
- **Confidence "C" circle** (`_bomReviewLevel(row,panel)` :14553-14580, per-ROW+panel): `"low"`(red C) / `"medium"`(amber C) / null. On pdf-native pages only validity force-flags raise it (suspect/placeholder/dimension/companion/enclosure); on vision pages `confidence==="low"|"medium"` also counts.
- Composite: `hasBomIssueCircles(project)` = any row with `_bomReviewLevel` non-null OR a BC circle. NOTE: BC-circle logic is inline in the render — factor a top-level `_bcCircleState(row,{bcConnected})` first so render + classifier share ONE definition (SSOT).

**★★ ONE OPEN QUESTION (Jon): does BLUE count?** Blue = essentially EVERY un-priced/un-matched row when BC is connected → so if blue gates rung 2, a freshly-extracted BOM sits in (BOM) IN PROCESS until its items are matched/priced (blue clears). Jon named "Blue BC circles" explicitly, so the working assumption is **YES, blue counts** (IN PROCESS = "items still being matched/priced") — CONFIRM. If instead only genuine problems should gate, use RED+YELLOW+Confidence and drop blue.

**Review-status map — CONFIRMED (code):** `preReviewStatus`/`postReviewStatus` ∈ {null=never-submitted, `pending`=in review, `approved`=POSITIVE approved, `rejected`=returned}. READY TO SEND ⇒ `preReviewStatus==="approved"` (send gate :41316 already blocks the quote unless approved). READY TO REVIEW ⇒ `null || "rejected"`. IN PRE-REVIEW ⇒ `"pending"`.

**DRAFT exclusion — CONFIRMED:** no `autoPopulated` boolean exists; "real BOM row" should use the SSOT `!_isExcludedFromPriceCheck(r)` (excludes labor / customer-supplied / contingency / Matrix-Systems vendor / buyoff-crate) rather than the current narrower `!r.isLaborRow`, so a project of only labor/contingency/auto rows stays DRAFT.

**Still to slot beyond rung 6:** `postReviewStatus`, Quotes Sent (`quoteSentAt`), ECO, purchasing.

**Next step:** on Jon's confirm of the ladder + the 2 clarifications + the blue-circle question, Freddy writes the single `computeProjectEffectiveStatus` rewrite spec (replacing the scattered predicates 18762-18842), Jon signs off, THEN build. NOT a build yet.

## 6d. ✅ FINALIZED SPEC (Jon confirmed 2026-08-05) — build to THIS
**Confirmations:** (1) 6-rung ladder ✅ (2) issue-circles (rung 2) outrank red rows (rung 3) ✅ (3) RFQs = the FULL red-row rule — "stays until ALL rows are priced, price-dated AND lead-timed (no red row anymore)"; the `rfqSentDate`/`hasActiveRfqs` clause is DROPPED from routing ✅ (4) **rung 2 = ANYTHING in the Issues column** — any BC circle **including BLUE**, or a confidence circle; "if there's anything in the Issues column it stays in (BOM) IN PROCESS" ✅.

**Precedence (first match wins; recomputed live so it auto-reverts):**
```
0. !project → draft ; !panels.length → stored status
1. DRAFT            : no drawings AND no "real" BOM row  (real = some row where !_isExcludedFromPriceCheck) — labor/contingency/auto rows alone still = DRAFT
2. (BOM) IN PROCESS : hasBomIssueCircles(project)         — ANY row shows a BC circle (blue/yellow/red) OR a confidence C
3. RFQS SEND/RECEIVE: anyRedRow(project)                  — FULL red rule (unpriced/$0/qty0/no-priceDate/stale/no-firm-LT); stays until every row priced+dated+lead-timed
   — below here the BOM is clean (no issue circles, no red rows) —
4. QUOTES SENT      : quoteSentAt && quoteRev<=quoteSentRev → budgetary_sent/firm_sent   (diverged quoteRev>quoteSentRev → see open Q)
5. IN PRE-REVIEW    : preReviewStatus==="pending"
6. READY TO SEND    : preReviewStatus==="approved" && !quoteSentAt      (POSITIVE approved — a never-reviewed project can't reach here)
7. READY TO REVIEW  : preReviewStatus ∈ {null,"rejected"}              (never submitted OR returned/rejected)
8. else → in_progress (safety fallthrough)
```
`hasBomIssueCircles(project)` = any row with a BC circle via `_bcCircleState(row,{bcConnected})` (RED not-in-bc / YELLOW fuzzy / BLUE unmatched) OR `_bomReviewLevel(row,panel)` non-null (confidence). Factor `_bcCircleState` out of the render (SSOT). `anyRedRow` = existing `_isBomRowFlaggedRed` (full rule). Reversions fall out of live re-eval: red row appears during review → rung 3 preempts → RFQs; rejected → rung 7; new unmatched item → rung 2.

## 6e. ★ LIFECYCLE AUDIT STAMPS (Jon 2026-08-05) — every flag transition carries {user, timestamp}
Each status/flag transition records **who** + **when** (for future graphical project-timeline UI). Specifics Jon named:
- Sent for Tech Review → stamp {user, datetime} of the submitter.
- Reviewer REJECTS → stamp {reviewer, datetime} + revert to the status it belongs in (per §6d reversions).
- Requestor ADDRESSES a rejection → stamp {user, datetime} when they next ACCESS the project after a rejection.
- General rule: anytime a user completes/trips a flag, keep a {user, datetime} stamp of when it occurred. More review-step stamps coming later.
- Stale-status reminders (project sits in a status past a preset time → nudge the owner) — Jon believes already set up; verify + wire to the new sequencer.
- Storage: an append-only per-project lifecycle log (e.g. `project.statusHistory[] = {status, by, at, reason}`) — additive, retention-safe. Build alongside the sequencer.

## 6f. Open (minor) — confirm with Jon before build
- Diverged sent quote (`quoteRev>quoteSentRev`, B034): today → in_progress. Under the new model should a diverged-but-clean quote go to READY TO SEND/REVIEW instead? (keep B034 behavior unless Jon says otherwise).
- Where ECO / purchasing (Won/PO'd) slot in relative to the ladder (today they drop off the Sales board).

## 7. Other gaps found (for the walkthrough)
- **"awaiting" vs routing disagree:** the To-Do rail's "awaiting" (:18537) excludes priced rows, but `hasActiveRfqs` (routing) doesn't → rail can say "0 awaiting" while the board still holds the project in RFQs.
- **`post_review` folds into the Draft column** on the Sales board (`statusToCol` maps it to `draft`) — shows "In Post-Review" pill but sits in Draft.
- **`active_eco` is dead-but-present** in the maps (F061 stopped emitting it) — harmless dead mapping.
- **`findIncompleteQuoteItems` re-inlines** the stale/reorder-commodity exemption instead of calling `_isBomRowFlaggedRed` → two copies of the rule (drift risk, violates SSOT).

# Freddy — #191 runtime trace: quote # missing (assignment gap on SEND path) — READ-ONLY

**To:** Freddy (Analyst) · **From:** Marc · **Date:** 2026-07-01 · **Diagnosis only, no fix**

Quote # (MTX-Q######) randomly missing from BOTH the filename and the quote document; Noah hits it,
Jon doesn't. **Verdict: ABSENT-FIELD — the number is never assigned when a quote is SENT without
first being Viewed/printed. Not a role-gate, not a race.**

## Assignment point (§1)
`getNextQuoteNumber(uid)` — app.jsx:2352 — a Firestore **transaction** on
`companies/{cid}/config/quoteCounter` (company-scoped; healthy, `next=202030`). **Called from only
THREE places** (grep-confirmed):
- `copyProject` (10448) — assigns on Copy-to-New-Quote.
- `handlePrintQuote` (37483) — the **View/Print** path; assigns "if not yet set" (37481 guard),
  wrapped in a try/catch that only `console.warn`s on failure.
- (definition, 2352.)

**It is NOT called from either SEND path.**

## Consume points (§2) — single source, as you predicted
Both read `project.quote.number`:
- **Inline send** `_doInlineQuoteSend` (38437, the "✉ Send" / "✉ Send w/BOM" buttons): builds the PDF
  at 38457 `buildQuotePdfDoc(pdfDoc, project)` and the filename at 38463
  `QTE_C-[${qq.number||"Quote"} Rev NN]...`. **No assignment anywhere before it.**
- **Modal send** (32937, `buildQuotePdfDoc(pdfDoc, populated)`): same — no `getNextQuoteNumber` call
  upstream.
- When `quote.number` is empty → **filename falls back to the literal "Quote"**, and the **PDF quote-#
  render is blank**. Both empty from the one missing assignment.

## Which of the three (§3/§4)
- **Role-gate — REFUTED.** Noah's member role is **`edit`** (not `view`); `canWrite()` = `role != 'view'`,
  so he CAN write `companies/{cid}/config/quoteCounter`. The counter is incrementing fine. Permission
  is not the issue.
- **Race — REFUTED.** Within `handlePrintQuote` the assignment is `await`ed before the PDF build. The
  send paths don't race — they simply never call the assigner. It's a missing call, not a timing window.
- **ABSENT-FIELD — CONFIRMED.** `project.quote.number` is genuinely absent on affected projects.

## Real affected artifacts (§5)
Scanned all sent projects (`quoteSentAt` set): **12 have a valid MTX-Q number; 2 have it ABSENT** —
**PRJ402119** and **PRJ402118** (both `quote.number` = absent, sent Rev 1, recipient noah@matrixpci.com).
The field is truly missing on the stored object — assignment-failure, not a read/timing bug.

## Why Noah, not Jon
**Workflow, not permission.** The number is assigned only by **View/Print** (handlePrintQuote) and
**Copy**. If a user clicks **✉ Send** on a quote they never Viewed/printed first, no number is ever
assigned → blank doc + "Quote" filename. Jon habitually Views/prints (which assigns) before sending;
a send-direct leaves it blank. "Random" = whether View happened before Send.

## Fix direction (yours to scope — NOT implemented)
Assign the number on the SEND path(s) too. Cleanest per the CLAUDE.md dual-consumer/single-source
principle: factor "assign quote number if missing/invalid" into ONE helper (the 37481 logic) and have
**View, both Send paths, and Copy** all call it before building the PDF/filename — so the number can
never be consumed before it's assigned. Optionally backfill the 2 affected sent quotes (PRJ402119,
PRJ402118). Note the 37481 assignment's try/catch swallows failures silently (`console.warn` only) —
worth surfacing a real error there as part of the fix so a future assignment failure isn't invisible.

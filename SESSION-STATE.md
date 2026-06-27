# Session State — 2026-06-27 MDT (post-#163 close-out)

## Version
**v1.21.0** (deployed 2026-06-27, PRODUCTION). **#163 Full PN Integrity via BC Surrogate Key** shipped.
Decoupled BC item identity from the part number: BC "No." is now an opaque **MTX-#####** surrogate
(auto-assigned by No.-Series); the full manufacturer PN lives in ARC's `partNumber` + BC's
`Vendor_Item_No`. Ends the >20-char Code[20] truncation that was losing full PNs. Minor bump (data-flow
restructure, backward-compatible — additive `bcNo` field on BOM rows, no APP_SCHEMA_VERSION change).

## Deploy State
- **Master tip: `43ab7b14`** ("Release v1.21.0 — #163 Full PN Integrity via BC Surrogate Key").
- **`master == origin/master == 43ab7b14`** (in sync). **Tag `v1.21.0`** on origin.
- **PR #1** (feat/163-surrogate-key → master) **merged via fast-forward**; branch retained on origin.
- Production hosting: **https://matrix-arc.web.app** serving v1.21.0 (all 4 fixes verified in the live bundle).
- **ROLLBACK POINT:** `master → 0f8a61fb`, redeploy **v1.20.142** (or roll back hosting in the Firebase console).
- Prior release lineage: v1.20.142 = #160; v1.20.141 = #153 C103.

## BC environment (CRITICAL CONTEXT)
- **`bcEnvironment` = `MATR_SndBx_01152026` (SANDBOX) — the ONLY BC env that exists. There is NO production
  BC yet.** #163 is **code-live only; NO BC cutover occurred.**
- The `bcEnvironment` doc (`companies/{companyId}/config/bcEnvironment`) is **company-shared, NOT
  channel-isolated** — prod and test hosting read the SAME BC env. (companyId is not exposed to the page;
  the effective env is read from the resolved `BC_API_BASE` / `_bcConfig.env`.)

## #163 — what shipped (43ab7b14)
P1–P5 (mutation/cross/pricing capture `bcNo`, push/read sites via `_bcNo()`, create path omits
`body.number` → auto-surrogate + full PN to `Vendor_Item_No` + ItemCard dedup, Item Browser display,
learning-DB `.slice(0,20)` fallback) **+ 3a** (SQ lead-time surrogate resolution) **+ 3c** (sibling
learning-DB matcher) **+ C113** (cross-regression: `_vinResolved` guard) **+ C115** (alternates-dropdown
synthetic `_vendorItemNo`). **Full T1–T10 passed on test.** All client-side in `src/app.jsx`; zero
`functions/index.js` changes. Plan: `docs/163-DETAILED-PLAN.md` (C109 Rev 4). Review/trace record:
`docs/163-MARC-REVIEW.md`, `163-BUILD-REPORT.md`, `163-COACH-REVIEW.md`, `163-CROSS-REGRESSION-TRACE.md`,
`163-SUPPLEMENT.md`. **Coach review chain: C107–C116** (supplement, plan revs 1–4, full-diff review,
fix re-reviews, two regression traces).

## NEXT MILESTONES (in order) — the #163 production cutover
1. **Stand up a production BC environment** (does not exist yet — gates everything below).
2. **Jon + BC developer, Monday** — scope the cutover. Framing: "what to stand up for production BC +
   what the rename touches (BC references-by-No. AND ARC `bcNo` links)."
3. **Hand-correct long-PN items** — put the true full PN into `Vendor_Item_No` BEFORE any rename, or the
   rename loses the full PN.
4. **BC mass-rename ALL item No.s → MTX-##### + ARC `bcNo` reconciliation IN LOCKSTEP.** Establishes the
   invariant "any MTX-##### in ARC's Part# field = a surrogate-leak bug." NOT a pure BC op: ARC BOM rows
   carry `bcNo` pointing at current BC No.s — renaming synced items orphans those links unless ARC's
   `bcNo` values are reconciled simultaneously. **Needs a Coach trace on ARC-side impact** alongside the
   developer's BC-side review. **GATED — do not start until step 1 exists.** Full detail in TODO #163.

### Agreed migration approach (BC mass-rename → MTX) — exact next-session plan
Two halves of ONE operation: the BC rename + the ARC `bcNo` reconciliation (BC-only orphans ARC's links).
Strict order: (1) prod BC exists → (2) long-PN hand-corrections into `Vendor_Item_No` FIRST → (3) dev
BC-side assessment (what references items by No.; posted-history rename block?) → (4) Jon renames via Excel
export/edit/reimport (No.→`MTX-#####`, `Vendor_Item_No` keeps the full PN) → (5) Jon produces a **3-column
mapping sheet**: [ (a) old BC No. exactly as it was (may be truncated) | (b) full Part# / `Vendor_Item_No`
| (c) new MTX# ] — **(a) is the PRIMARY join** (ARC's `bcNo` may store the truncated value), (b) is the
fallback bridge → (6) **ARC reconciliation script** (Coach scopes, Marc executes): walk every project's
BOM rows, match each `bcNo` to the sheet, rewrite `bcNo` → new MTX#. This is the half the Excel reimport
does NOT cover (ARC `bcNo` lives in Firestore). **DRY-RUN FIRST** (report row count + old→new pairs, no
writes) → Jon verifies → live run → (7) verify (mini T-suite vs renamed items).
**Resolve FIRST — Coach trace, before scoping the script:** is `row.bcNo` the ONLY place ARC stores a BC
No.? If anything else caches it (a lookup map, etc.), the script must update that too.
**Next-session trigger:** Jon opens a session + provides the Excel mapping sheet → FIRST ACTION = Coach
trace (bcNo sole-reference confirm + join-field reliability) → Coach scopes script → Marc dry-runs → Jon
verifies → Marc runs live. **Jon brings:** the mapping sheet (3 cols), BC-rename-done confirmation (or
whether we scope before executing), and whether long-PN hand-corrections are complete.

## Sandbox test artifacts (label for eventual cleanup)
- BC items: **MTX-01023** (`ZZ_TEST_LONGPN_0123456789ABCDEF`, 31ch), **MTX-01024**
  (`BL20-E-16DO-24VDC-0.5A-P`), **MTX-01025** (`BL20-E-8AI-U/I-4PT/NI/ET`), plus any `ZZ TEST #163` items
  and scratch test projects created during T1–T10. Sandbox only; safe to leave, clean up before/at cutover.

## Open work queue (post-#163)
**#163 follow-ups (full detail in TODO #163):**
- **REQUIRED CUTOVER** (gated — see Next Milestones above).
- **GH #2** — supplier portal: per-row lead times should satisfy submit (block missing rows via
  non-overridable modal, not always-require-global).
- **GH #3** — supplier portal: no manual-entry path without uploading a doc first.
- **GH #4** — BC price-push stacks prices without end-dating the prior (duplicate open-ended Purchase
  Prices; money-correctness). Open Q: ARC explicit end-date vs BC supersession — needs Coach trace.
- **NEAR-TERM UX** — dedup-hit should WARN ("Part# already in use as a Vendor Part#") instead of silently
  routing through the cross/correct modal (data already correct; feedback missing). Found T6.
- **POLISH** — RFQ Part# column auto-width; Print Traveler internal-print button
  (`docs/PRINT-TRAVELER-BUTTON-SPEC.md`, build deferred); BC Item Browser preview rows missing MFR/Vendor.

**Pre-#163 open items (carried forward — NOT started):**
- **#164** — Reconciliation Deleted→"Keep" may strip crosses (HIGH, possible data loss, untested branch).
- **#165** — Reconciliation Accept/Reject verbs read backwards (HIGH, UX with data-loss risk).
- **#158** — region_learning doc exceeds Firestore 1MB limit (HIGH, silent prod failure; logged, not scoped).
- **#159** — Copy-to-New-Quote customer selection (C104 scope ready: `docs/159-COPY-CUSTOMER-SCOPE.md`).
- **#161/#162** — BOM-region tip timing; monthly counter reset (both LOW).
- **#166** — stampFn/drop-handler dedup cleanup (LOW; needs Coach scope).
- **#167** — PRJ402124 "28 AI prices" — NO-BUG / false alarm (closed; it was AI-estimated lead times).

## Working tree / handoff
- Clean. master == origin/master == `43ab7b14`. All #163 docs committed (close-out commits `e7771658`
  [design/review docs] + the TODO/SESSION-STATE close-out commit).
- TODO.md: #163 marked DONE with the full post-#163 backlog logged.

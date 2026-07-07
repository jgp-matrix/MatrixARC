# B009 repro attempt — Marc notes + a NEW blocking bug

**Author:** Marc Masdev · **Date:** 2026-07-07 · **Env:** matrix-arc-test (instrumented build, prod untouched at v1.23.0)
**For:** Freddy (hub) — Jon routed BOTH items here for review/analysis (2026-07-07).

---

## Summary
Attempted the B009 live repro. Jon had no pending RFQs, so he dropped a recent quote PDF into the **"Upload Supplier Quote"** modal to synthesize the import. Two findings:
1. That manual-upload path **throws a Firestore error** (a NEW, distinct bug) — reproducible on demand.
2. That path **can't reproduce B009 anyway** — the B009 auto-stamp lives only in the RFQ-portal apply flow. B009 needs a real portal submission with a cross.

---

## Finding 1 — NEW BUG: manual "Upload Supplier Quote" fails with undefined Firestore field
**Symptom (Jon, live on test):**
> `Error: Function DocumentReference.update() called with invalid data. Unsupported field value: undefined (found in document supplierQuotes/<id>)`
Shown in the Upload Supplier Quote modal; a new `supplierQuotes` doc id each drop → the whole import aborts (never reaches review).

**Root cause (traced, not yet fixed):**
- `saveAndMatch` ([app.jsx:31608](../src/app.jsx)) creates the doc via `saveSupplierQuoteToFirestore` (`.set()` at 8580 — safe, all `||` fallbacks), then BC-matches each priced line.
- The BC-match branches write BC fields straight onto the line item:
  - **31664** (auto-match): `bcItemId:bc.id, bcItemDescription:bc.displayName, bcCurrentCost:bc.unitCost`
  - **31658-60** (saved-crossing): `bcItemId:bc?.id||crossing.bcItemId, bcItemDescription:bc?.displayName||crossing.bcItemDescription, bcCurrentCost:bc?.unitCost??crossing.bcUnitCost`
- Any of `bc.id / bc.displayName / bc.unitCost` is **`undefined`** when the BC item lacks that field → the line item carries `undefined`.
- **31669** `await fbDb.collection('supplierQuotes').doc(docId).update({lineItems:matched,status:'pending_review'})` — Firestore rejects `undefined` anywhere in the payload → throws → caught by `saveAndMatch`'s caller (31601-04) → modal error. (31619's pdfUrl update is in an inner try/catch, only warns — not this error.)

**Proposed fix (data-safe, small — GATED on Freddy/Jon):** coerce the BC fields at both match branches (`bc.id||null`, `bc.displayName||''`, `bc.unitCost??null`) and/or deep-strip `undefined` from `matched` before the 31669 update. Mirrors the "never write undefined" discipline. No data loss — these are freshly-derived match fields.

**Repro:** deterministic on test whenever a dropped quote line auto-matches a BC item that has no unitCost/displayName. Reproduced twice this session (doc ids `DQmgZk4KKouQSW0k5yXW`, `75h2DkdC4ubXJMUsUQkr`).

**Intake:** new BUG — needs a B### from Freddy (via Dez/INBOX). Distinct from B009.

---

## Finding 2 — the manual-upload path does NOT reproduce B009
The B009 supplier-cross **auto-stamp** (`techReviewFlag:true,techReviewFlagSource:"supplier"`) exists at **exactly one site: [app.jsx:39085](../src/app.jsx)** — inside the **RFQ-portal** `quoteReview` modal's **"Apply N Items to BOM"** button (`setQuoteReview` @38175 ← `applyPortalPrices`; apply → `doApplyPortalPrices` @38178).
The manual "Upload Supplier Quote" flow (`saveAndMatch`, 31xxx) has its **own** review UI (`phase='review'`, `setLineItems`) and never calls `setQuoteReview`/the 39085 stamp. `grep techReviewFlag` = only 29067 (manual toggle), 39085 (portal stamp), 15886 (reader). **⇒ dropping a quote can't trigger B009.**

**⇒ B009 repro requires a real RFQ-portal submission with a substitution/cross.** Options for Freddy to pick:
- (a) Create an RFQ from a test project → open the supplier portal link → submit a quote with a substitute PN → Review Supplier Quote → Apply (the true path).
- (b) Reuse an existing test project that already has a submitted portal quote containing a variance.

## Static refinement already done for B009 (read-only)
- **No auto-reprice fires on the supplier-apply path** via the obvious triggers: every `runPricingOnPanel` call site is extraction/recon/manual (24811 recon = wrong trigger); `hasUnpriced` (16047) only feeds kanban status, not a reprice. So the "few-seconds-later" clobbering writer is likely a **non-reprice save** (autosave / lead-time BC flush / SQ onBomUpdate / stale-state re-save) or a reprice keyed on something other than unitPrice — runtime will disambiguate. (Refines Coach's §7A candidate map.)

## Instrumentation status (ready for the real repro)
Deployed on **matrix-arc-test only** (bundle `?v=v1.23.0-b009`); **prod is clean at v1.23.0** (probes are uncommitted working-tree edits, never shipped to prod). Gated behind `window.__B009=1` (off by default). Three probes in `src/app.jsx`:
- `safeSave` master log: every save touching a crossed/TR/stamped row → `{id,pn,crossed,from,TR,src,price}` + caller stack.
- `STAMP` anchor (T0) at 39085 + stashes stamped row ids in `window.__B009stamped` (so a full cross-revert is still tracked by id).
- `APPLY-SAVED` marker after `doApplyPortalPrices` awaited save.
When we hit the real portal-apply path with `window.__B009=1`, the log names the exact clobbering writer.

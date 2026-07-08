# Scoping Brief — F006 · #197 · #198 (the MED/larger backlog)

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-07 · **Status:** Brief → Coach feasibility/code-trace → Jon approve → Marc build
**Traced against tip:** `dec62ad9`. These are MED-sized and each needs a Coach code-trace before build (flagged per feature). Not a quick-batch — likely 3 separate builds.

> Freddy scoped requirements + grounded touch-points via read-only grep. Each has a **"Coach must trace"** item where the mechanism needs code-grounded confirmation before design is locked.

---

## F006 — "Qv.## Hist" button: per-quote send history with document previews
**Ask:** A "Qv.## Hist." button next to Send/Resend/Print Quote that opens the history of ALL sends for that quote, each entry showing a **PREVIEW of the document actually sent.**

**Current state (grounded):**
- `project.qvHistory[]` already exists + is maintained: `_logQvHistory` (app.jsx:33341) appends a `quote_send` entry `{type, sendMode, to, quoteNumber, quoteRev, withBom, at, id}` on each send; `_mergeQvHistory` (9147/9219) dedupes across saves; arrayUnion persist (9216). A sorted read already exists (34704 `_allQv`).
- **So the send-history DATA (metadata) already accrues.** What's missing is (a) the button + history modal UI, and (b) the hard part — **a document snapshot per send** (qvHistory entries carry metadata only, NOT the rendered document).

**Proposed design:**
- **UI:** "Qv.## Hist" button near Send/Resend/Print (Quote Summary header area, ~35486) → modal listing `qvHistory` `quote_send` entries (date, recipient, mode, rev, withBom), newest first.
- **Document preview (the meaty decision):** to show "the document actually sent," pick one:
  - **(A) Snapshot-on-send (truest):** on each send, render + store the quote PDF to Firebase Storage (e.g. `quoteSnapshots/{uid}/{projectId}/{sendId}.pdf`); the history entry stores the storage path; preview = inline PDF/thumbnail. Faithful to "actually sent"; adds one Storage write per send + storage cost.
  - **(B) Re-render from snapshot data (lighter):** store the quote-data payload used at send time in the qvHistory entry (or a companion doc); preview re-renders on demand. Cheaper storage, but a code change to the renderer could make an old preview differ from what was truly sent.
  - **Freddy lean: (A)** — the feature's whole point is an accurate record of what was sent; re-render risks drift. Confirm Storage-cost tolerance with Jon.

**Touch-points (Coach to confirm):** the send path (`_logQvHistory` @33341 — add snapshot capture); the Quote Summary button row (~35486); a new history modal; Storage path + retention (append-only, never capped — data-retention rule).
**Data-retention:** additive (new `qvHistory` fields + Storage objects); never delete prior sends. ✓
**★ Coach must trace:** the exact send entry-point(s) that should capture the snapshot (all send modes — Sales/New/Reply from #193), and whether the PDF is already generated at send time (reuse it) or must be re-rendered to capture.
**Acceptance:** send a quote twice at different revs → "Qv.## Hist" lists both, each preview shows that send's actual document.
**Open Q:** (A) vs (B); Storage cost tolerance; retention horizon (keep all sends forever per data-retention — confirm).

---

## #197 — Ship-date on PO-Received modal + mismatch messaging
**Ask:** Estimated ship date = **PO-received date + lead time** (the lead-time clock industrially starts at order placement, not quote date). On mismatch vs the quoted ship date: OA message *"PO date ≠ Quoted Ship Date, Quoted applies"* + request an updated PO.

**Current state (grounded) — CORRECTION to the tracker's "ARC doesn't compute a calendar ship date":**
- `computeControlPanelLeadTime(panel, project)` (app.jsx:1261) **already returns a calendar `shipDate`** — but anchored to **today**: `shipDate = today + totalDays` (1403). It also returns `leadDays` + a full breakdown.
- The Receive-PO path already has a `poReceivedDate` (8017 `opts.poReceivedDate||generated`, rendered "PO RECEIVED" 8052).
- **So the calc EXISTS; #197 is a re-anchor + a comparison, not a from-scratch date calc.**

**Proposed design:**
- Compute a **PO-anchored ship date** = `poReceivedDate + leadDays` (reuse `computeControlPanelLeadTime(...).leadDays`; anchor to `poReceivedDate` instead of `today`). Surface it in the Receive-PO modal.
- Compare against the **quoted ship date** (the ship date on the quote at quote time — Coach confirms where/whether it's stored; may need to persist `quotedShipDate` at quote-send). On mismatch: show the OA message + a "request updated PO" affordance.

**Touch-points (Coach to confirm):** `computeControlPanelLeadTime` (1261 — factor out a "leadDays from anchor date" helper so today-anchored and PO-anchored share ONE formula, per the CLAUDE.md single-source principle); the Receive-PO modal (poReceivedDate 8017/8052); where the quoted ship date is/should be persisted.
**Data-retention:** additive (`quotedShipDate` if not already stored). ✓
**★ Coach must trace:** (1) is a `quotedShipDate` persisted at quote-send, or must #197 add it? (2) the Receive-PO modal component + whether poReceivedDate is reliably structured/available for the calc.
**Acceptance:** enter a PO-received date in the Receive-PO modal → estimated ship date = PO date + lead time; if it differs from the quoted ship date, the OA mismatch message shows + prompts for an updated PO.
**Open Q:** define "quoted ship date" (today-anchored at quote time, or the requested ship date?); mismatch tolerance (exact, or ± business days?).

---

## #198 — Client Review has no completion/approval step → project stuck edits-locked
**Ask:** After a Client Review there's no "Approval" action, so the project sticks on *"Client Review In Progress — Edits Locked"* with no way to complete/reset. Add a client-facing "Approved" button that clears the edits-lock + advances state.

**Current state (grounded) — needs a real trace, because there's ALREADY an auto-clear that seemingly should prevent the stick:**
- The lock: `project.customerReviewStatus === "pending"` → "All edits are locked until the customer responds or the review is cancelled" (app.jsx:34834/34839).
- Review data: `reviewUploads/{token}` onSnapshot → `customerReviewData` (34123); trigger `onCustomerReviewSubmitted` (functions/engineering/index.js:28) stamps `customerReviewSubmittedAt/By`.
- **There IS an auto-clear:** 34140-34142 — `if(customerReviewData.status==="submitted" && project.customerReviewStatus==="pending") → set customerReviewStatus=null`. So on a submitted review the lock is *supposed* to clear.
- **⇒ The reported "stuck" state contradicts the auto-clear** — so either (a) the stick is a DIFFERENT lock (engineering-review vs customer-review; note there are two review notions — `customerReview*` fields AND the `engineering` module), (b) the auto-clear doesn't fire in some path (listener not attached, status never reaches "submitted", token mismatch), or (c) "Client Review In Progress" is a distinct status string from `customerReviewStatus==="pending"`.

**Proposed design (pending the trace):** add an explicit "Approved / Complete Review" action (client-facing and/or ARC-side) that deterministically clears the edits-lock and advances project state — NOT relying solely on the fragile auto-clear. But the exact state field(s) to set depend on the trace.

**Touch-points (Coach to confirm):** the review-lock state machine (`customerReviewStatus`, the auto-clear @34140, the engineering module); the "Client Review In Progress — Edits Locked" banner (find its exact status source); `onCustomerReviewSubmitted`.
**Data-retention:** state-transition only (additive status fields). ✓
**★ Coach must trace (the critical one):** reproduce/identify the EXACT stuck state — which status string drives the "Client Review In Progress — Edits Locked" banner, why the 34140 auto-clear doesn't resolve it, and whether "Client Review" = customer review or the engineering-review module. The fix design is blocked on this.
**Acceptance:** a project in the stuck "Client Review In Progress — Edits Locked" state can be completed via an explicit action → lock clears, state advances, no re-stick.
**Open Q:** should "Approved" be client-facing (in the review portal) or ARC-side (the user marks it complete), or both? What state should it advance TO?

---

## Routing
Each is MED + trace-gated. Recommend: **Coach code-trace pass on all three** (answer the "Coach must trace" items) → firm the designs → Jon approves per-feature → Marc builds (likely 3 separate builds, not one batch — #198 especially is trace-first). All queued behind G005 Phase 1 + the small features cluster. F006's snapshot-storage decision (A vs B) + #198's stuck-state trace are the two things most likely to change effort.

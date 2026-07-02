# #199 — Per-Line "Tech Review" Flag — BRIEF

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-02 · **Priority:** HIGH
**Pipeline stage:** Brief (awaiting Coach Supplement)
**Base version:** v1.21.23 · master `03ae8ee6`

---

## 1. Problem / Intent

Sales produces quotes in ARC, but some BOM line items involve decisions Sales is **not qualified to approve** — most notably parts a **supplier/vendor substituted** (crossed) in their RFQ quote. Today nothing stops Sales from sending a customer quote that contains such an item without an engineer signing off on it.

Add a **per-BOM-line checkbox labeled "Tech Review"** that flags a line as requiring engineering sign-off. Flagged lines feed the existing **"Send for Tech. Review"** process (project-level engineering review). This is the first **row-level** input into that process, which today is entirely project-level.

## 2. Jon's Decisions (2026-07-02)

| # | Decision | Value |
|---|----------|-------|
| **D1** | **Enforcement** | **HARD GATE.** If any line is flagged AND not yet resolved by Tech Review, Sales **cannot send / approve** the customer quote. |
| **D2** | **Auto-check scope** | **Supplier/vendor crosses ONLY** (parts the supplier substituted via the RFQ portal). User manual crosses and learning-DB auto-crosses do **NOT** auto-check. |
| **D3** | **Manual check** | User can manually check the box on any row to raise a question in Tech Review. |
| **D4** | **Label** | **"Tech Review"** (matches the existing "Send for Tech. Review" button). |
| **D5** | **Sequencing** | Build the per-line flag + auto-check + persistence + review-surfacing **now**. Broader Tech Review process fine-tuning is a **separate follow-up** thread that builds on this. |

## 3. What I found (routing-level read — NOT an authoritative trace; Coach verifies)

- **"Send for Tech. Review" today** (`src/app.jsx` ~34341–34420, ~35839): a **project-level** workflow. Button → modal (assign engineer + notes) → sets `preReviewStatus:"pending"`, `preReviewSubmittedAt/By`, `preReviewAssignedTo/Name`, `preReviewRev`, `reviewRev`, `reviewChangeLog:[]` → notifies the engineer (in-app notification + Graph email). Engineer approves/returns. **It already gates quoting** — `arcAlert("Engineering approval required before sending quote…")` at ~35876 keys on `preReviewStatus`. There is **no per-line dimension** today.
- **"Crossed" rows** carry `isCrossed` + `crossedFrom`, but that flag **does not distinguish provenance** — supplier-portal, user manual, and learning-DB auto-cross (`autoReplaced`) ALL set `isCrossed`. Supplier-portal crosses flow through `supplierCrossRef` / `doApplyPortalPrices`. **So "auto-check on supplier cross" needs a precise, supplier-specific signal** — this is the #1 code-fact for Coach to nail down.

## 4. Scope

**IN (this increment, #199):**
1. New **per-row persisted field(s)** for the flag + its provenance + its resolution state (data-retention safe — see §6).
2. **Checkbox UI** in each BOM line labeled "Tech Review".
3. **Auto-check** the box when a row was crossed by the supplier (D2 signal).
4. **Hard gate** (D1): block send/approve of the customer quote while any flagged line is unresolved.
5. **Surface flagged lines** in the Tech Review flow so the reviewing engineer sees exactly which items need sign-off, and can **resolve** them (which clears the gate).

**OUT (deferred to the follow-up process-tuning thread):**
- Broader Tech Review process fine-tuning (workflow states, richer reviewer assignment, per-item comment threads, etc.).
- Any change to WHO can be assigned as reviewer or how approval/return works project-wide.
- Multi-panel review nuances beyond what already exists.

## 5. Proposed data model (for Coach to validate — do NOT treat as final)

Per CLAUDE.md **"Single Source of Truth for Dual-Consumer Predicates"** — this flag drives BOTH a row-level visual indicator AND a send/approve gate, so the RULE must be **one predicate**, not re-inlined per site.

Proposed per-row fields:
- `techReviewFlag: boolean` — is this line flagged for Tech Review.
- `techReviewFlagSource: "supplier" | "manual"` — provenance. Governs D3-vs-D2 behavior (see open Q3: can Sales uncheck a supplier-sourced auto-flag?).
- `techReviewResolved: boolean` (+ `techReviewResolvedBy`, `techReviewResolvedAt`) — set when the engineer clears the item during review.

Proposed single-source predicate:
- `_hasUnresolvedTechReview(panel|project)` → true if any row has `techReviewFlag && !techReviewResolved`. **Both** the hard gate (§4.4) and any row/summary indicator call this ONE predicate.

## 6. Data-retention requirements (CLAUDE.md CRITICAL)

- New fields are **additive** — never strip on save (only `dataUrl` is stripped). Add `techReviewFlag` / `techReviewFlagSource` / `techReviewResolved*` to the preserved-metadata set alongside `isCrossed`, `priceSource`, etc.
- Flag state must **survive save→reload** and (Coach to confirm) **#153 reconciliation re-extract** — a supplier-crossed row that gets re-extracted should not silently lose its flag.

## 7. Open questions for Coach's SUPPLEMENT (code verification)

- **Q1 (blocking) — supplier-cross signal.** What is the *precise* field/condition that marks a row as crossed **by the supplier** (vs user vs learning-DB)? Is there a `priceSource:"supplier"`, a portal-set flag in `doApplyPortalPrices`, or a `supplierCrossRef` application marker? Auto-check (D2) must key on this and must NOT fire on user/learning crosses.
- **Q2 — gate choke point.** Where do the "send customer quote" and "approve" paths live, and what is the cleanest single choke point to add the D1 block? Does it layer on top of the existing `preReviewStatus` gate (~35876) or is it independent?
- **Q3 — resolution mechanics.** How should a flagged line get **resolved/cleared**? Options: (a) engineer unchecks it in a Tech Review view during review; (b) it clears when `preReviewStatus → approved` for the whole project; (c) per-item resolution tracked in `reviewChangeLog`. What does the existing review data model best support? **Related product Q:** can Sales uncheck a *supplier-sourced* auto-flag, or only manual ones? (My lean: supplier auto-flags can only be cleared via review resolution; manual flags Sales can toggle freely. Confirm feasibility.)
- **Q4 — field persistence.** Confirm the proposed fields (§5) are preserved on Firestore save and don't need an `APP_SCHEMA_VERSION` bump (they're additive row metadata, so likely no).
- **Q5 — reconciliation survival.** Does the flag survive #153 revision re-extract / reconciliation, and should a supplier-crossed row retain its flag across re-extract?

## 8. Suggested pipeline

Brief (this doc) → **Coach Supplement** (answer Q1–Q5, confirm feasibility + choke points) → **Freddy Analyst Review** (resolve Q3 product nuance + finalize field model) → **Coach Detailed Plan** → **Marc implements** (phased). Given the HARD GATE touches the money/send path, this warrants the full pipeline, not a skip-to-build.

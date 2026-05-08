# RFQ / Supplier Portal System

Detailed reference for the RFQ supplier-portal flow in MatrixARC. The high-level flow lives in `CLAUDE.md`; this doc covers the helper functions, fuzzy-matching rules, cannot-supply tracking, email structure, and the user-facing button names.

## Part Number Fuzzy Matching

`normPart(s)` and `partMatch(a, b)` helper functions handle:

- **Spaces / dashes / dots stripped, uppercased:** `"ARL 449"` → matches `"ARL449"`
- **Contains / substring:** `"HOFF CEL550M"` → normalized `"HOFFCEL550M"` contains `"CEL550M"` → match
- **Used in:** `processFile` (portal scan matching), `applyPortalPrices` (BOM matching)
- **Also instructed in the AI prompt:** the AI returns the BC part# (from the requested list), not the supplier's version.

## Cannot-Supply Tracking

- Supplier checks "Cannot Supply" per line item in portal review.
- Saved as `cannotSupply: true` on each `pricedItem` in the submission.
- On "Apply Prices to BOM": cannot-supply items are skipped and saved to `users/{uid}/config/supplierCantSupply`.
- `PortalSubmissionsModal` shows cannot-supply items with strikethrough and a red "Cannot Supply" label.

## RFQ Email Structure

`buildRfqEmailHtml(group, projectName, rfqNum, rfqDate, responseBy, uploadUrl, companyInfo)`:

- "Upload Quote →" button appears **both** at the top (above line items) and at the bottom of the email.
- Company logo or name comes from `_appCtx.company` / BC.
- "Request For Quote from" heading.

## Key Button Names

- **"Print Client Quote"** — opens the quote editor / print dialog.
- **"Upload Supplier Quote"** — opens portal submissions or the import modal.
- **"History"** — compact button for RFQ send history.

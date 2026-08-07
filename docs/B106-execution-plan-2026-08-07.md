# B106 — execution plan (Coach money-path review folded in, 2026-08-07)

**Coach verdict:** NEEDS-CHANGES → **conditionally SAFE as an identity-only, per-doc-transactional, path-canonical admin backfill** with hard exclusions. The naive whole-doc read-modify-write is REJECTED (it's a parallel writer bypassing the app save funnel's guards). Fallback if any guardrail can't be met: build the in-app `saveProjectPanel(_noBumpWrite:true)` repair tool instead (by-the-book money path; also gets the ItemCard PATCH for free).

## Eligibility (of the 148 REPOINT rows)
| Bucket | Rows | Disposition |
|---|---|---|
| Already on a BC PO (`bcPoDate`) | **123** | **EXCLUDE from auto-backfill** — a purchased row is committed to its vendor; re-pointing misattributes a real purchase. Needs Jon. |
| In-flight RFQ (`rfqSentDate && !bcPoDate`) | 1 | EXCLUDE — don't move vendor under an open RFQ. |
| Locked project (takeover/ownerLock) | 0 | EXCLUDE if any appear at run time. |
| **Clean — safe to auto-fix** | **24** | 7 projects: Redmond Wetlands (8), Fluence (6), Lumberton TX (3), Lemay (2), Jellico (2), Proctors Creek (2), Salares Norte (1). 0 supplier-LT. |

## The safe backfill — mandatory guardrails (Coach)
1. **Per-doc `runTransaction`** (admin SDK): re-read in-txn, re-verify each target row still matches the approved `(bcVendorNo,bcVendorName)` pair, apply, commit. Closes the lost-update window. Plain read-then-set is REJECTED.
2. **Identity only:** set `bcVendorNo` + `bcVendorName` (to BC canonical) on matched rows. Touch nothing else.
3. **Canonical path only:** resolve each project to the ONE path prod reads — `companies/{cid}/projects` for team members, `users/{uid}/projects` only for legacy solo. Writing the wrong copy repairs a doc nobody loads. (Biggest silent-failure risk.)
4. **No version churn:** `_noBumpWrite` semantics — don't bump `updatedAt`/`quoteRev`/`bomVersion` (must not falsely unlock a sent quote). Don't regress `schemaVersion`.
5. **Skip locked docs** (`ownerTakeoverActive.expiresAt>now` or `ownerLockActive`) and any panel with a `bomSyncPending` marker; run in a low-traffic window.
6. **Leave price/LT in place** (identity-only). Do NOT clear, do NOT auto-re-pull. The *next in-app F089 Refresh* per project re-pulls price+LT against the now-correct vendor. Log which rows carry pre-repoint price/LT so a human knows a Refresh is owed.
7. **Do NOT touch BC master** — no ItemCard `Vendor_No` PATCH, no ItemVendorCatalog write from the script. BC reconciliation is a deliberate in-app F089/G028 follow-up. Expect (and note) temporary ARC↔BC default-vendor drift.
8. **Reversible log** (append-only file + Firestore audit collection, `_logQvHistory` shape) per row: canonical `projectPath`, `projectId`, `panelId`+index, `rowId`+bom index, old/new num+name, matched mapping, **pre-repoint money/LT snapshot** (`unitPrice`,`priceDate`,`bcPoDate`,`priceSource`,`leadTimeDays`,`leadTimeSource`,`leadTimeUpdatedAt`), `schemaVersionBefore`, `docUpdatedAtBefore`, `backfillRunId`, ts, operator.
9. **SKIPPED log** for every excluded row (with reason) so counts reconcile — nothing silently missed.

## Verification (post-backfill)
1. Re-run `tools/b106-classify-vendor-drift.js` vs a fresh BC pull → REPOINT count drops by exactly the 24 fixed; remaining = the excluded/ambiguous holds.
2. Spot-check in the live app: Supplier column (`:34252`) + RFQ grouping (`buildRfqSupplierGroups :8120`) show one consistent vendor for a fixed group.
3. `logCount === rowsWritten === 24`, no partial run.

## Supplier-LT guard removal (`src/app.jsx:32085`) — SEPARATE later step
Only after a backfill (incl. the on-PO rows, once Jon decides them) leaves **zero** name≠number supplier-LT rows + a zero-re-classify. For any `leadTimeSource==="supplier"` REPOINT row, log the firm LT and re-push it to BC (G028 Push-LT `:31698`) under the correct vendor BEFORE the first Refresh, then remove the guard as its own gated commit. (0 supplier-LT rows in the current clean set, so N/A for the 24.)

## Open Jon decisions
1. **Greenlight the 24-row guardrailed backfill?** I build it to the spec above, produce a dry-run log for your review, then execute on your OK.
2. **The 123 on-PO rows** — leave as historical (forward-fix already prevents NEW drift; the purchase is done), or correct the ARC labels too (in-app, carefully), or investigate whether any PO actually went to the wrong vendor first? (Your purchasing call.)

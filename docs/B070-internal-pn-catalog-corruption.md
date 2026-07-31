# B070 — resolveInternalPartNumbers corrupts all-digit manufacturer catalog part numbers

**Status:** OPEN · HIGH (money-path, silent data corruption) · root cause VERIFIED live · fix Jon-approved + building (2026-07-31).
**Supersedes:** the "IP66/1200 misread recovery" theory (branch `claude/ip66-partnum-recovery`, dropped 2026-07-31, tip `0556aaa6`). The model never misread these — see below.

## Symptom
On extraction, correct all-digit catalog part numbers are silently replaced with a spec token scraped from the same row's description. Live case — PRJ "Twin SR Protection Panels" (`fUsAEqvID9iMLqkxSjtH`, file `402006-01 PLC_001 REV5.pdf`, Rittal BOM):
- Ref#7  "X2 extreme 12 HP Touch operator panel…" → `partNumber` `640014405` **→ `IP66`** (ingress rating from description)
- Ref#44 "VX Base/plinth corner piece… for W: 1200 mm…" → `partNumber` `8660025` **→ `1200`** (bare dimension from description)

## Root cause (Coach trace, all `src/app.jsx`) — VERIFIED live
`resolveInternalPartNumbers` (~13165) assumes a bare all-digit code is an *internal/customer* PN and recovers a "real" manufacturer PN from the description:
- `_INTERNAL_PN_RE = /^\d{3,4}-\d{3,5}$|^\d{7,12}$/` (13129). The `^\d{7,12}$` alternative matches legitimate all-digit **manufacturer catalog** numbers (Rittal `8660025`, `640014405`; Weidmüller `3137290000`; Phoenix).
- The function only runs when **>50%** of BOM PNs match `_INTERNAL_PN_RE`. A Rittal BOM is nearly all all-digit → trigger fires BOM-wide.
- For each matching row it calls `_extractMfrPnFromDesc(description)` → `_looksLikeMfrPn(tok)` and, on a hit, `return {...r, partNumber: mfrPn, customerPartNumber: origPn}` (13183). So the real value is **moved to `customerPartNumber`**, not destroyed.
- `_looksLikeMfrPn`: `IP66` passes (letter+digit); `1200` passes (`/^#?\d{4,}$/`; the space in "1200 mm" exposes the bare number — "1200mm" as one token would have been rejected by `_MEAS_RE`). Neighbors `8660023`/`8660042` survived because their descriptions held no qualifying token.

**Runs at all 3 extract sites:** 16445 (initial), 28702 (re-extract / V.074 path), 28938 (batch). After fuzzy-merge, before applyPartCorrections/sort/splitCompanionParts — i.e. *after* the per-page `recoverMisread` (which is why recovery correctly logged `no-misreads`: at that pre-merge stage the PN was still `640014405`).

**Live smoking gun (Firestore):** `extractionReport.internalPnResolutions` = `[{from:"640014405",to:"IP66",stage:"internalPnResolve"}, {from:"8660025",to:"1200",stage:"internalPnResolve"}]`; and `customerPartNumber` on both rows still holds the correct value.

## Why the recoverMisread feature was misaimed
The raw model output (extractionPath `pdf-native`) shows the model emitted `640014405` and `8660025` correctly; `IP66`/`1200` never appear as a partNumber, only in descriptions. So this is **downstream ARC corruption, not a model misread**. Per-page misread recovery cannot help (nothing to recover at that stage). Branch dropped.

## Fix (Jon-approved: Primary + IP guard) — building on `claude/internal-pn-catalog-fix`
**Change 1 (primary, root cause, 13129):** drop the bare-all-digit alternative —
`const _INTERNAL_PN_RE=/^\d{3,4}-\d{3,5}$/;`
Self-contained (`_INTERNAL_PN_RE` is used only inside `resolveInternalPartNumbers`). After this, an all-digit Rittal BOM no longer trips the >50% trigger → the function early-returns.
**Change 2 (defense-in-depth, `_looksLikeMfrPn` ~13139):** `if(/^IP\d{2}[A-Z]?$/i.test(tok))return false;` — an ingress rating is a spec, never a PN (protects genuinely-internal dashed-code BOMs).

**Risk:** loses auto-recovery for a hypothetical customer who prints bare 7–12-digit *internal* codes with the real PN in the description — no evidence such a customer exists; all-digit *manufacturer* BOMs are demonstrably common and actively corrupted today. Net-safer. Future-proof option if that case ever arises: gate recovery on a detected "Customer P/N" column header rather than a structural guess. The dashed `^\d{3,4}-\d{3,5}$` customer-code form is retained.

## Rollout
Money-path → branch → Coach review → Test (`deploy-test.sh`) → **Jon re-extracts this same project and confirms `640014405`/`8660025` land in `partNumber`** → merge to master + prod (`deploy.sh`). Prod frozen until Jon's Test verify.

## Follow-up (separate work item, not blocking the fix)
**Backfill existing corrupted projects.** Any previously-extracted all-digit-catalog (Rittal/Weidmüller/Phoenix) BOM likely has this corruption, and the wrong PNs may already have flowed into pricing/BC/RFQs. The correct value survives in `customerPartNumber`, so a scan+restore is feasible: for rows where `internalPnResolutions` shows a spec-shaped `to`, restore `partNumber` from `customerPartNumber`. Scope: count affected projects (Firestore scan), decide restore criteria, one-time migration. Flag to Jon after the code fix ships.

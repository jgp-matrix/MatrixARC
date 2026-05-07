# ARC Review Findings — Captured During Toolkit Build

Captured: Thu May  7 10:54:16 MDT 2026
Source: ./tools/review.sh first runs

## Round 1 (firestore.rules + deploy.sh diff)
1. Firestore rules: `rfqUploads` write access not role-gated — view-only members can modify/delete
2. Firestore rules: `companyId` not validated on create
3. deploy.sh: No exit on JSX validation failure — continues to commit/deploy with bad build
4. deploy.sh: Misleading comment about placeholder restore
5. Firestore rules: Missing `rfq_history` match rule

## Round 2 (functions/index.js diff)
6. Stale API key caching in `_resolveAnthropicKey` (~line 2149)
7. Ledger schema mismatch — server vs client, monthly spend under-counted in UI
8. Unawaited `_writeDebugLog` — fire-and-forget risks lost writes on error paths
9. Prompt injection via `pageNumber` — unvalidated string interpolated into prompt
10. Duplicate Firestore member queries in email fan-out
11. Fragile sed in deploy.sh — fails silently if `?v=` param is missing

## Triage (fill in after toolkit is built)
- [ ] Severity (high/med/low)
- [ ] Estimated fix time
- [ ] Order of attack

# Critical Audit — full tracker grading (2026-07-31)

Freddy synthesis of 3 parallel grading lanes (Bugs B001–B076 · Features F001–F082+M001 · General G + legacy #1–#198). Rubric: **CRITICAL = could send a wrong quote/price/PO to a customer, lose/corrupt data, security, or hard-block a core workflow.** SLIPPED = open High/Critical that was deprioritized. Items re-graded on merits (skeptical of existing tags).

## ⭐ Master critical/slipped list (deduped, ranked by urgency)

### Theme 1 — Silent post-send quote rewrite (PRJ402119 preventive trio — the headline slip)
The incident's reactive/attribution fixes shipped (F044/45/46/47, F041 live); the **preventive gates the incident doc names as the actual fixes were never built.**
- **F048** [CRITICAL] — Lock a sent BOM + kill auto-repricing on it. BC price-check-on-open still live → a sent quote can be silently rewritten from bad BC cost. *Filed, not built.*
- **F050** [CRITICAL] — Plausibility/magnitude send-block ($12-vs-$6000). The only gate that catches a bad-magnitude BC price red-block misses. Read-only sweep on Test; preventive gate not in prod.
- **F049** [HIGH→CRIT] — Snapshot-at-send + PO-receipt reconcile. Makes post-send drift detectable at all. Filed only.
- **F051 / F052** [HIGH] — Send-time freshness-through-validity gate / expired-quote PO handling. Filed, unbuilt (F051j cleanup tool ≠ the gate).

### Theme 2 — BC write correctness (wrong part ordered / silently dropped)
- **B065** [CRITICAL·SLIPPED] — Positional BC bindings: a BOM-row shift PATCHes the WRONG BC planning line + deletes the tail → wrong part ordered / part dropped, silent. Phase-1 DELETE-guard shipped (v1.24.40); durable-binding Phase 2 deferred; PRJ402141 re-resolve pending Jon.
- **B016** [CRITICAL·SLIPPED] — Silent BC write-race: field edits (lead-time, Est-Prod date) revert + **deletes don't stick (dropped part stays in BC/order)**. Safe half shipped (v1.24.42); await/confirm core (Fix A/B) deferred pending Jon answers.
- **#188** [HIGH] — Stale bcVendorNo pushes lead times to a nonexistent BC vendor (V00102). Plan approved, not built.
- **F070** [CRITICAL] — Continuous ARC↔BC mismatch detector ("Jon's centerpiece ask"). ~80% of machinery exists; targets the silent-divergence class behind the incident. Open/scoped only.
- **F069** [HIGH] — Hard-block a BC op when user/project env ≠ Settings env. Open/unscoped.

### Theme 3 — Extraction completeness (silent under-quote)
- **#80** [CRITICAL] — Re-extract dedup keys on PN only → merges distinct line items → dropped BOM rows → under-quote. Same class as fixed #79; never fixed.
- **#119** [CRITICAL] — Legacy (pre-v1.19.598) panels bypass ALL Phase-1 safety nets (ZeroBom banner, send-gate, completeness warn) → silent 0/wrong BOM can be quoted.
- **#99** [HIGH] — Model partial-read drops half a long single-column BOM; BC-match reads 100% on the half → under-quote. Interim warn (#100) misses clean bottom-truncation.
- **#83 / #81** [HIGH/MED] — No fail-loud on image/crop fallback + no extraction-anomaly warning → a confident-looking bad BOM passes silently. H5 cut frequency; the safety surface still doesn't exist.

### Theme 4 — Send-gate / quote-status integrity holes
- **B035** [HIGH·SLIPPED] — Send-block ignores serviceCards → a services quote can be SENT with an unpriced $0 line. Open since 2026-07-13. *(small fix)*
- **B036** [HIGH·SLIPPED] — `quoteSentRev/At/To` (load-bearing since B034) absent from saveProject preserve-guards → a stale full-doc write can wipe them, silently breaking divergence detection. *(additive fix)*
- **B041** [HIGH·SLIPPED — confirm deploy] — Background/programmatic saves spuriously bump a sent quote's rev → sent quotes drift into "In Process" (root of the B040 casualties). Reads BUILT + Coach-APPROVE + "deploy-ready" but no SHIPPED tag — verify.

### Theme 5 — BC reliability (silent failures → wrong pricing state)
- **B013** [HIGH·SLIPPED] — ~7 raw-fetch BC helpers bypass the health gate → 401s go silent ("search dies while pill blue"). Fully diagnosed 2026-07-22; G1 build awaiting Jon greenlight.
- **B021** [HIGH·SLIPPED] — BC fetch has no timeout/abort → a hung request freezes extraction at 95% forever + can deadlock the whole BC semaphore. Known one-line AbortController fix, deferred behind B012.

### Theme 6 — Crashes / workflow hard-blocks
- **#60** [HIGH] — 8 latent identifier-scope bugs that compile but crash at runtime (inline quote-send, vendor migration, ECO editor, ship-date popover, portal-apply). Documented in tools/check-scope.js KNOWN_VIOLATIONS.
- **#159** [HIGH] — Copy-to-New-Quote strands projects customerless/PRJ#-less, unrecoverable.
- **#198** [HIGH] — Client Review has no completion step → project stuck "edits locked," no exit.

### Theme 7 — Active money-path regression (already fix-firmed)
- **#192** [CRITICAL] — BUDGETARY flag silently cleared on project open → a must-be-budgetary quote can go out FIRM on unconfirmed AI prices/lead-times. **Fix firmed + Jon-approved to ship; build slotted.**

### Theme 8 — Jon-flagged priority + data-safety
- **F014** [HIGH — Jon ★CRITICAL] — Customer-specific payment-terms note on every quote + BC field. Wrong/blank milestone terms reach the customer. Backlog.
- **F019** [HIGH] — Background standalone Get-New-Pricing silently killed on nav-away (writeback never lands, no signal) → user may act on stale prices.
- **G005 Ph2** [HIGH data-safety] — matrix-arc-test still shares PROD Firestore; external/BC harm closed in Ph1, real-customer data-collision remains until separate project + test user.
- **#148** [LOW·dormant security] — reviewUploads permanent unrevokable Storage download URLs (customer-IP leak) — safe only because the review portal isn't built; MUST fix when it ships.

## Execution plan (tiers)

**TIER A — ship-ready criticals (small/well-defined, buildable today, Coach + Test/prod):**
`#192` (fix firmed) · `B035` (extend findIncompleteQuoteItems) · `B036` (add 3 fields to preserve-guards) · `B041` (verify deploy, ship if not) · `B021` (AbortController timeout).

**TIER B — one Jon decision unblocks a build:**
`B013` (greenlight the G1 gate build) · `B016` core (Fix A/B behavior answers) · `B065` Phase 2 (durable-binding direction) · `F048/F049/F050` trio (approve the lock+snapshot+plausibility design) · `F070` (scope the detector).

**TIER C — scope/design first (bigger, careful money-path):**
`#80` `#119` `#99` `#83/#81` (extraction-completeness safety net) · `#60` (fix the 8 crash sites) · `#159` `#198` (workflow exits) · `F051/F052` `F069` `F014` `F019`.

**Guardrails:** every money-path item → Coach review + Test + Jon verify before prod. Non-money cosmetics bundle to prod directly.

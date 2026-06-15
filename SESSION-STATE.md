# Session State — 2026-06-15 MDT

## Version
v1.20.120 (deployed 2026-06-15). Quote-populate trust work (#117 P1+P2), silent BC token refresh (#125), and the Drawing Reference band fixes (#126, #128). Stable.

## Deploy State
- Master tip: f2dbe932 ("docs: session close-out — #117/#125/#126 resolved, #128 tabled, #133 queued")
- Local master == origin/master (synced)
- Latest tag: v1.20.120
- No code changes since the v1.20.120 release — the close-out doc commit (f2dbe932) is documentation only

## Recent Commits (last 15)
- f2dbe932 docs: session close-out — #117/#125/#126 resolved, #128 tabled, #133 queued
- 4caddc71 Release v1.20.120
- 4fabf9f2 #128 follow-up: await locateInDrawing fallback in locateInRegion
- 11b57a71 Release v1.20.119
- a3f040ba #128: H5 BOM-region render preview + cropBounds coord fix (C68)
- 9a00ed02 Release v1.20.118
- 641714b0 #126: fix Drawing Reference band landing on wrong/same row (two bugs, C66)
- aa9c1bbd Release v1.20.117
- 1e22b6df #125 (T-bcTokenRefresh): silent BC token refresh atop ensureQuoteFieldsPopulated
- b4d6d0f3 Release v1.20.116
- 5afa49e0 #117 Phase 2: loud-on-failure for quote populate (Fixes 3, 3c, 4)
- c6f145cf Release v1.20.115
- 0756e4b6 #117 Phase 1: unify quote-populate paths + persist (Fixes 1+2)
- c6d6d252 Close-out records for #121: RESOLVED + Q3 watch-item (#124) + MCP T9
- afcfb98b Release v1.20.114

## Headline: Quote Trust Layer + Drawing-Reference Fixes Shipped
This session closed the #117 quote-field reliability thread and the #126→#128 Drawing Reference preview thread, plus the #121 H5 follow-up.

## Shipped This Session (v1.20.113 → v1.20.120)

### #121 Region edge-padding (v1.20.114) — RESOLVED
Pad the resolved BOM region before H5 render: `max(2% of region per edge, 14pt floor)`, clamped to page bounds. The absolute floor is load-bearing (Freddy analyst review, Coach C54) — a clipped row is a fixed height, so proportional-only (2.3pt on PRJ402119) was insufficient. Verified via headless harness (Coach C56): PRJ402119 14/14 PNs, zero phantoms. New standing tool: `tests/extraction-baseline/h5-headless.js`.

### #117 Quote Payment Terms / Shipping Method — RESOLVED (Phase 1 + Phase 2)
- **Phase 1 (v1.20.115):** extracted `ensureQuoteFieldsPopulated(project,uid)→{project,warnings}` (non-mutating shared gate), unified both print paths, awaited all saves. Path B lifted to QuoteView (Option A) persisting the REAL project (#86 guard).
- **Phase 2 (v1.20.116):** loud-on-failure — `bc-unavailable`/`missing-required-terms` warnings; QuoteSendModal HARD-BLOCKS on missing terms before emailing; print path shows unchecked checklist entries.
- **Key finding:** the QuoteTab editing surface (Generate PDF button + setQ editor) is **unreachable** in the live UI (renders only in the hidden autoPrint QuoteView). The reachable path is handlePrintQuote→autoPrint. Verified fixed on real production quote data (Jon).

### #125 Silent BC token refresh (v1.20.117) — RESOLVED
One line atop `ensureQuoteFieldsPopulated`: `if(!_bcToken)try{await acquireBcToken(false);}catch(e){}`. Kills the ~hourly Phase 2 false-warning by silently re-acquiring after a 401 nulls the token. Refresh-fails leaves `_bcToken` null → Phase 2 still fires (Coach C65).

### #126 Drawing Reference band wrong/same row (v1.20.118) — RESOLVED
Two bugs (Coach C66): `parseInt(itemNo)||0` collapsed every part to row 0 when itemNo blank/non-numeric; page buttons used tile-relative stored coords post-H5. Fix: Haiku locates by part-number STRING; page buttons always re-locate.

### #128 H5 region-render preview (v1.20.120) — TABLED
Region render + ny=1 zero-Haiku hot path + getExtractionUnits cropBounds fix + spinner-race follow-up all SHIPPED and STAY. Band placement still wrong but **intermittent** — see TODO #128 for the corrected resume note (stateful/conditional, not deterministic coord-math; instrument-and-characterize first).

## Top of Queue
**#133 Send Traveler BOM** — opens next session after its Brief.

## Parked Backlog (priority order)
1. **#128** Drawing Reference band misposition residual — TABLED, resume per corrected note (characterize intermittency first). Test parts: 1SFL547002R1311 / 1SDA102947R1 / 8106235.
2. **#115** Held-back-cross review UI — scaffolding exists, needs per-row indicator.
3. **#85** Internal Excel fast-quote — audited, needs Brief.
4. **#119** Legacy panels invisible to Phase 1 safety systems.
5. **#118** Batch extraction path missing region learning context.
6. Item 16 / BC-fill cluster (long-standing).

## Known Tooling Gaps
- **T9** Claude-in-Chrome MCP can't navigate to non-prod origins (test/channel) even at extension all-sites — connector-internal, origin-wide. Workaround: `tests/extraction-baseline/h5-headless.js` runs non-prod H5 gates from Node. Blocks agent-driven non-prod live tests; owner Jon to route.

## Open TODOs
~74 OPEN findings in TODO.md.

## Working Tree
- Branch: master (up to date with origin/master at f2dbe932)
- Clean

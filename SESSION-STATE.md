# Session State — 2026-06-16 MDT

## Version
v1.20.130 (deployed 2026-06-16). Quoted BOM customer-send feature + cover-page BOM enhancements + bomVersion seed fix + confidence-indicator relocation. Stable, live-verified.

## Deploy State
- Master tip: f59b1fb7 ("TODO close-out polish: #133 follow-ups noted; #138 ref to #139 marked RESOLVED")
- Local master == origin/master (synced)
- Latest tag: v1.20.130
- No code changes since the v1.20.130 release — the C78 doc commit (73910dfa) and TODO close-out commits are documentation only.

## Recent Commits (last 15)
- f59b1fb7 TODO close-out polish: #133 follow-ups noted; #138 ref to #139 marked RESOLVED
- 73910dfa docs: add Coach C78 — PRJ402096 Dv.# seed-gap trace + fix analysis (#139)
- 2170e15a TODO: #141 RESOLVED (v1.20.130, commit e4d287a1)
- e4d287a1 Release v1.20.130
- 761e85b0 #141 layout fix 2: flexShrink:0 on C + BC circles so they stay round
- 3c414cff Release v1.20.129
- 5efa5b8a #141 layout fix (C86): right-anchor the _bc circle pair so BC clears Description
- 85c74866 C86: #141 layout fix — right-justify circle pair in _bc column
- 3b04741d C85: #141 post-deploy code-path verification (v1.20.128) — all PASS
- ee7d6b7b Release v1.20.128
- db55d5a9 #141 REBUILD (C84): match the blue BC circle, not the +BC pill
- e01e06ed C84: #141 re-spec — match blue BC circle (24x24, borderRadius 50%, fontSize 9)
- c10c9b31 TODO #142 (TABLED): red +BC pill redundancy review (Coach investigation)
- 73a65b6a Release v1.20.127
- 4363063c #141: relocate confidence indicator next to BC + restyle as matched 'C' pill (C81/C82)

## Headline: Quoted BOM Customer-Send + Cover-Page BOM Enhancements Shipped
Built the customer-facing Quoted BOM send feature end-to-end, plus a cluster of cover-page BOM improvements, the bomVersion seed-gap fix, and the confidence-indicator relocation. 50 commits, 10 releases (v1.20.121 → v1.20.130).

## Shipped This Session (v1.20.121 → v1.20.130)

### #133 Send Quoted BOM to Customer (v1.20.121–122, +follow-ups) — RESOLVED
Standalone + bundled send of the existing traveler cover-page BOM (cross column) to the customer for review/approval before PO. Standalone `handleBomSend` in PanelListView (gates on `manualVerifyRequired`, skips `ensureQuoteFieldsPopulated`, owner-priority gated, double-send guard + separated save try/catch). Bundled = "Include Quoted BOM" toggle (default OFF) in QuoteSendModal. D3 `bomApprovalRequests[]` record (id `bar_`-prefixed, panels = stable IDs, status write-once "sent"). Graph size-warning sums all attachments. Change 4b (ProjectView inline modal) DROPPED — dead code (#130). Customer-facing renamed "Traveler BOM" → "Quoted BOM" via `opts.documentTitle` (C73, v1.20.122); production traveler unchanged. Yellow-highlight email explainer line added (v1.20.126) — standalone always, bundled only when toggle ON. New fn: `generateTravelerBomPdf` (internal name retained).

### #134 Confidence dots explainer (no code) — RESOLVED
Yellow circles next to PNs = AI extraction confidence (amber=medium, red=low; clears on PN edit). Distinct from `manualVerifyRequired`. Coach C70.

### #135 Yellow crossed-PN highlight (v1.20.124) — RESOLVED
Two PN cells (Part # always, Original Part # when populated) filled yellow `[255,243,176]` on crossed rows via `didParseCell`. Additive to bold/italic. SHARED — both production traveler and Quoted BOM. C75.

### #136 Hide Supplier column on Quoted BOM (v1.20.124) — RESOLVED
`opts.hideSupplierColumn` (set only by `generateTravelerBomPdf`) drops Supplier from the customer doc; production keeps it byte-for-byte. R2: `tableWidth:"wrap"`, no redistribution. C75.

### #138 Cover-page REV box → Dv.# | Qv.# split (v1.20.123) — RESOLVED
Single REV box (redundant `panel.drawingRev`) replaced with two half-boxes: Dv.# (`panel.bomVersion`) | Qv.# (`project.quoteRev` via `opts.quoteRev` from both callers). Customer rev stays in the title block. SHARED. C76/C77.

### #139 bomVersion seed-gap fix (v1.20.125) — RESOLVED
Removed `oldCount===0` gate from the seed condition in `_bumpBomVersionIfChanged` → legacy panels (BOM rows but no `bomVersion`, populated pre-v1.19.743) seed to 1 on next save via `saveProject`'s all-panel loop. Bump path untouched. Root cause: PRJ402096 panel 3 (undefined bomVersion → Dv.# rendered "—"). Coach C78/C79. **Live confirmation on PRJ402096 panel 3 NOT yet triggered** (needs a save to that project — see Open Items).

### #141 Confidence "C" indicator relocation (v1.20.127–130) — RESOLVED
Four iterations: v1.20.127 matched the WRONG element (+BC pill); C84 rebuild matched the blue BC circle (24×24 circle in the `_bc` column); C86 right-anchored the pair so BC clears Description; final `flexShrink:0` keeps both circles round under the 52px-in-56px exact fit. Result: "C" (amber/red, black glyph) left of the blue "BC" circle, matched round pair. Live-verified by Jon.

## Top of Queue
**#142 Red "+BC" pill redundancy review** (TABLED — Coach investigation) OR **#137 Customer Portal Quoted BOM approval** (backlog, needs Brief). Jon to pick.

## Open Items / Watch
1. **#139 live confirmation OUTSTANDING** — trigger a save to PRJ402096 → confirm panel 3 stamps `bomVersion:1` and Dv.# shows "1" (was "—"). Fix is deployed; just needs the live save + re-check.
2. **#140** WATCH (post-#139): first-extraction bomVersion seed reliability after the seed-condition change.
3. **#142** TABLED: red "+BC" pill possible redundancy vs blue "BC" circle / amber "?BC" pill (Coach read-only audit). Couples with #141 layout if "+BC" is removed.

## Parked Backlog (priority order)
1. **#137** Customer Portal — digital Quoted BOM approval/change-request workflow (builds on #133 `bomApprovalRequests[]`). Needs Brief.
2. **#128** Drawing Reference band misposition residual — TABLED (characterize intermittency first). Test parts: 1SFL547002R1311 / 1SDA102947R1 / 8106235.
3. **#115** Held-back-cross review UI. **#85** Internal Excel fast-quote. **#119** Legacy panels invisible to Phase 1 safety systems. **#118** Batch extraction region learning. Item 16 / BC-fill cluster.

## Known Tooling Gaps
- **T9** Claude-in-Chrome MCP can't navigate to non-prod origins. Workaround: `tests/extraction-baseline/h5-headless.js` runs non-prod gates from Node.

## Open TODOs
~75 OPEN findings in TODO.md.

## Working Tree
- Branch: master (up to date with origin/master at f59b1fb7)
- Clean

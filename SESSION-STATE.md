# Session State — 2026-06-17 MDT

## Version
v1.20.142 (deployed 2026-06-17). #153 Drawing-Revision Re-Extract + BOM Reconciliation now working end-to-end (Option A entry gate + C103 cross-aware reconciliation), plus #160 Reconciliation Reject/Keep-Prior with a latent silent-drop data-loss fix. Live-verified through the cross-masking fix; #160 awaiting Jon's T1–T8.

## Deploy State
- Master tip: e774ef38 ("tests: #153 C103 cross pre-pass + #160 reject/keep-prior harness coverage") — doc/test commits after the v1.20.142 release stamp, no code change, no version bump
- v1.20.142 was deployed at commit 0a3c7121; post-deploy commits are all non-deployable: 37527cdb (#163 TODO log) → e101d816 (handoff files) → e774ef38 (harness coverage — deploy.sh doesn't stage tests/, so the C103+#160 harness changes were committed separately at close-out)
- Local master == origin/master (synced at e774ef38)
- Latest tag: v1.20.142
- v1.20.142 = #160 reject/keep-prior + silent-drop fix. v1.20.141 = #153 C103 cross-fix. All deployable work is live.

## Recent Commits (last 15)
- 37527cdb Log #163 (Part# >20 chars truncation — full PN lost to BC field limit)
- 987bbdb3 Log #161 (BOM-region tip timing) and #162 (monthly counter reset) to TODO
- 0a3c7121 Release v1.20.142
- 218c5c1f C105: #160 Reconciliation reject/keep-prior scope for changed rows
- d0dcd6f2 C104: #159 Copy-to-New-Quote customer selection scope
- f3e83a4f Release v1.20.141
- 9d83efb7 C103: #153 cross-aware reconciliation fix plan — two-part fix finalized
- eb810ba3 Log #158: region-learning doc exceeds Firestore 1MB limit (silent prod failure)
- ba919deb Release v1.20.140
- 2c244a79 C102: #153 reconciliation cross trace — prior BOM shows pre-crossed PNs
- 1853ce5e Release v1.20.139
- 19316090 Append entry-point correction to #156 plan (C99)
- 223b8461 C101: #153 full flow read — end-to-end revision path audit
- 282c12c0 docs: stub 153-FULL-FLOW-READ.md for compaction durability

## Headline: #153 revision reconciliation works end-to-end + #160 silent-drop data-loss closed
The drawing-revision re-extract flow (#153) is now functional through its two hardest defects: the entry gate (was firing in a stale async window — fixed structurally via Option A, gate at drop with a fresh panel prop) and the cross-masking bug (the reconciliation modal compared raw PNs on both sides, so a crossed prior would have been carried forward pre-cross on commit, wiping the user's substitutions — fixed via C103's two-part fix). On top of that, #160 added Reject/Keep-Prior to the Changed bucket and, in doing so, closed a latent silent-drop bug where a non-accepted Changed row vanished from the output BOM.

## Shipped This Session — RESOLVED / LIVE

### #153 Option A entry gate (v1.20.139) — SHIPPED, T5/T6 confirmed
Revision gate moved from `confirmAndExtract` (async-window staleness was the root cause of 4 failed gate patches, v1.20.136–138) to drop time — top of `addFiles`, against the fresh panel prop. Decision stored in `reconIntentRef`; `confirmAndExtract` is a pure intent-router (reads only `reconIntentRef`, NO BOM re-evaluation in the confirm window — verified). Also: un-silenced the `runExtractionTask` onDone catch (line ~14876, KEEP permanently); `tagPage` syncs `pendingNewItemsRef` so type review survives; D4 staging page count. Coach C101. T5 (gate fires, 4/4 reliable Cancel) + T6 confirmed.

### #153 C103 cross-aware reconciliation fix (v1.20.141) — SHIPPED, awaiting full T1–T7
Two-part fix, ships together:
- **Part 1** (`runExtractionTask` ~line 14581): `applyLearnedCorrections` gated behind `!cbs.stagingMode` so the staging extraction is RAW — the reconciliation engine compares what the revised drawing actually says against the user's worked BOM. Without it, the DB re-crossed both sides identically and every real diff was masked as "unchanged" (the `crossed:16` symptom).
- **Part 2** (`reconcileBom` ~line 47334): cross-aware pre-pass runs BEFORE Pass 1 — indexes crossed prior rows by `normPart(crossedFrom)`, matches against the raw extraction's `partNumber`; equal qty → unchanged (cross preserved via carryUnchanged), differing qty → changed/qty. Pass-1 loop guards on `matchedCur/matchedExt` so pre-pass claims aren't re-matched.
- Removed all 4 [RECON TRACE] diagnostic logs (C102) + the [#153 REVISION-GATE] log.
- Harness: cross pre-pass synced; Scenario A/B/D/E cases added.
- **Live-test note (Scenario B):** a genuinely changed PN relies on Pass 2 (position+description); a revision that reflows the BOM table can drop it to Pass 3 (deleted+new) instead of pn_changed — still safe, just a different classification. Coach C103.

### #160 Reconciliation Reject/Keep-Prior + silent-drop fix (v1.20.142) — SHIPPED, awaiting T1–T8
- Added Reject ⇄ "✕ Keep Prior" toggle to Changed rows (symmetric with New/Deleted) + "kept prior — differs from revision" indicator.
- `buildReconciledBom`: rejected → `{...prior}` (prior kept EXACTLY — no position/qty/field changes; crosses+pricing+BC intact).
- **Data-loss fix:** the explicit rejected branch closes a latent silent-drop — previously any non-"accepted" Changed row fell through and vanished from the output BOM.
- Footer text cleanup (dropped stale "(deletions individually)").
- Harness: reject-not-dropped, reject-pn-preserves-cross, unresolved-still-drops (gate rationale), mixed-batch. 64 passing total. Coach C105.

## Coach items this session (not yet built)
- **#158** — region_learning doc exceeds Firestore 1MB limit (silent prod failure). HIGH. **LOGGED only** (eb810ba3), no scope doc yet.
- **#159** (C104) — Copy-to-New-Quote customer selection. **SCOPED** (`docs/159-COPY-CUSTOMER-SCOPE.md`).
- **#160** (C105) — built this session (above).
- ⚠️ The stampFn/drop-handler **dedup** cleanup (a deferred Marc item earlier expected at "#158") is NOT at #158 (that slot is region-learning) and does not appear logged under any number — possible unlogged gap, confirm with Jon.
- Untracked Coach docs in working tree at close (left for Coach to commit, 5 of 7 already committed): `docs/153-REVISION-GATE-TRACE.md` (C100), `docs/156-SUPPLEMENT.md`.

## Open work queue (top candidates)
- **#160 live T-suite** (T1–T8) — Jon to run on v1.20.142.
- **#153 C103 T1–T7** — full reconciliation cross verification on v1.20.142.
- **#158** — Firestore 1MB region_learning limit (HIGH, silent failure).
- **#159** — Copy-to-New-Quote customer selection (C104 scope ready).
- **#163** — Part# >20 chars truncation / BC field spillover (MED, needs briefing).
- **#161/#162** — BOM-region tip timing; monthly counter reset (both LOW).

## Working tree / TODO
- Clean except two untracked Coach docs (above), intentionally left for Coach's close-out.
- TODO.md OPEN findings: ~88.

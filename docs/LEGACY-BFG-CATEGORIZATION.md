# Legacy Backlog — B/F/G Categorization (tag-only, keeps #N)

**Produced by:** Freddy-spawned subagent (Jon-directed, 2026-07-07) · **Reviewed/finalized by:** Freddy · **Traced @** `6a382fe5`
**Scope:** TAG each OPEN legacy `#N` with a B/F/G *type* — the item KEEPS its `#N` id (NO renumber; NUMBERING-CONVENTION intact). This is the type-overlay index for the ~101-item legacy backlog; the `#N` entries in TODO.md's Round-N section are the source of truth for content/status.

**TOTALS: B=45 · F=27 · G=19 · (91 open legacy items) · STALE-flagged=4**

## Categorization index

| #N | Type | Short title | STALE? |
|----|------|-------------|--------|
| #6 | B | Stale Anthropic key caching | |
| #7 | B | Ledger schema mismatch under-counts spend | |
| #10 | G | Duplicate member queries (perf) | |
| #13 | B | deploy.sh hardcoded push refs | |
| #15 | G | No functions deploy/preflight gate | |
| #20 | G | Bundle-regen verifier gap | |
| #23 | B | Re-drop leaves stale BC price | |
| #24 | G | Remove auto-created 20N20 task | ⚠ task "no longer needed" |
| #26 | B | deploy.sh builds from main (stale source) | |
| #27 | B | Status pills diverged across surfaces | |
| #29 | F | Auto-add ECO FEE line | |
| #30 | F | Project-level budgetary flag | |
| #36 | F | Service-item status lifecycle | |
| #52 | F | Streaming progress bar | |
| #53 | B | ECO page-type misclassification | |
| #54 | B | BC sync 400 on valid items | |
| #56 | B | Re-extract raw count drop (items 1-26) | |
| #58 | B | Re-extraction verification gap (CRITICAL) | |
| #59 | G | Fuzzy-merge false-positive spot-check | |
| #60 | B | Latent identifier scope bugs (8, crash-class) | |
| #62 | B | BC sync skips descriptions | |
| #63 | B | Archive gated by status | |
| #64 | G | BC concurrency cap/backoff | |
| #65 | G | Project-open BC sync hygiene | |
| #66 | B | Task-structure idempotency gap (400s) | |
| #67 | F | Test-project cleanup utility | |
| #68 | F | BC rate-limit observability | |
| #69 | B | Posting-group fix fails services | |
| #70 | B | Customer-contacts 400 (C10114) | |
| #71 | G | Vendor field source-of-truth audit | |
| #72 | F | Change customer post-creation | |
| #73 | B | Scan-results warnings hidden | |
| #75 | B | Progress-bar accuracy | ⚠ overlaps #52/#127 |
| #76 | G | Multi-Claude coordination layer | ⚠ CCD bus built |
| #80 | B | Feedback re-extract dedup key | |
| #81 | F | Extraction anomaly detection | |
| #83 | F | Full-res crop fallback path | |
| #84 | B | Drops last row / misses companion | |
| #85 | F | Excel BOM cross-check | |
| #87 | B | Non-unique panel IDs (cache contamination) | |
| #88 | G | Async ownership audit | |
| #90 | F | Supersession UX distinction | |
| #91 | G | Background-workflow audit | |
| #92 | B | Background task seizes UI | |
| #93 | G | Extraction pipeline consolidation | |
| #96 | F | Windows facilitator app | ⚠ CCD bus supersedes |
| #98 | G | Extraction accuracy audit | |
| #99 | B | Model partial-read long BOMs | |
| #100 | F | Text-layer completeness guarantee | |
| #101 | F | Estimator's-eye cross-check | |
| #102 | B | Input-tier scan leak | |
| #115 | F | Held-back-cross review UI | |
| #116 | F | Mark-Verified auto-reprice | |
| #118 | F | Batch region-learning context | |
| #119 | B | Legacy panels skip safety systems | |
| #124 | G | H5 vertical-pad pollution watch | |
| #127 | B | Redundant progress bar | |
| #129 | F | ARC usage telemetry | |
| #130 | G | Dead-code cleanup (quoteSendModal) | |
| #131 | G | Multi-panel criterion-6 hardening | |
| #132 | F | Suppress post-extract Eng Questions | |
| #140 | G | bomVersion seed watch | |
| #148 | B | Permanent unrevokable review URLs | |
| #149 | F | Backfill stale confidence circles | |
| #150 | F | Budget-meter 80% admin alert | |
| #151 | G | Duplicated BC-apply spread | |
| #152 | B | Save writes unopened projects | |
| #153 | F | Revised-drawing-set diff | |
| #154 | F | Clickable confidence circles | |
| #156 | F | In-portal BOM confirmation | |
| #157 | B | Stale closure in PDF builders | |
| #159 | B | Copies stranded customerless (B; fix adds picker) | |
| #161 | B | Mistimed BOM-region tip | |
| #162 | B | Spend counters don't reset monthly | |
| #165 | B | Reconciliation verbs backwards (data-loss) | |
| #166 | G | stampFn/drop-handler dedup | |
| #169 | F | Prior-quote recognition | |
| #170 | B | Item POST error discarded | |
| #171 | B | Auto-cross not applied pre-sync | |
| #172 | B | Cross-apply reverts to original PN | |
| #173 | B | Revised set appends not supersedes | |
| #174 | B | Vector PDFs misclassified scanned | |
| #176 | B | DIN/duct rows over-flagged red (B; or G-tuning) | |
| #177 | B | Firm-lead-time denylist hazard (latent) | |
| #184 | B | Push write-burst exhausts Firestore | |
| #185 | B | RFQ contacts dropdown inert | |
| #188 | B | Stale bcVendorNo pushed to BC | |
| #192 | B | BUDGETARY auto-revert regression | (fix firmed, ship-approved) |
| #194 | F | Global email/metrics tracing | |
| #196 | B | Lock overlay blocks PO receipt | |
| #197 | F | Ship-date calc on PO receipt | |
| #198 | F | Client Review approval step | |

## Close calls (Freddy picks; override welcome)
- **#159** → **B** (primary harm: copies permanently stranded without a customer; the fix happens to add a picker).
- **#176** → **B** (cosmetic over-flag; could be **G** as red-flag tuning).

## STALE candidates (4) — for Jon's ruling: close, or keep?
- **#24** — remove auto-created 20N20 BC task; the task is declared "no longer needed" → likely closeable.
- **#75** — progress-bar accuracy; overlaps the #52/#127 progress-bar work → likely superseded.
- **#76** — multi-Claude coordination layer; the CCD `send_message` bus is largely built → likely superseded.
- **#96** — Windows facilitator app to automate role relay; the CCD bus supersedes manual relay → likely superseded.
*(Text-based hunches only — no code read. A full relevance/staleness pass over all 91 is the separate, bigger lever Dez teed up.)*

## Application
Recommend this doc IS the categorization index (a pointer added in TODO.md's Round-N section header), rather than editing 91 inline lines — keeps the #N entries untouched + reference-safe. Pending Jon's nod + the STALE/close-call rulings.

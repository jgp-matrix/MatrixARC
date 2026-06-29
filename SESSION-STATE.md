# Session State — 2026-06-29 MDT (post-#158 close-out)

## Version
**v1.21.1** (deployed 2026-06-29, PRODUCTION). **#158 Region-Learning subcollection restructure** shipped.
Patch bump over v1.21.0 (#163 surrogate key). #158 moved `region_learning` from a single
`{examples:[...]}` doc (which hit Firestore's 1 MB hard ceiling and silently broke all learning writes)
to a one-doc-per-entry subcollection, added a thumbnail size cap, and made write failures loud. Config
data only — no `APP_SCHEMA_VERSION` bump.

## Deploy State
- **Master tip: the #158 close-out commit** (TODO/SESSION-STATE/docs). Code release tip: **`f6762a79`**
  ("Release v1.21.1"). #158 code commit: **`13787154`** (P1-P3).
- **`master == origin/master`** (in sync). **Tag `v1.21.1`** on origin.
- Production hosting: **https://matrix-arc.web.app** serving v1.21.1. Firestore rules deployed
  (`config/region_learning/entries/{entryId}` → read isMember / write canWrite).
- **ROLLBACK POINT:** `master → 0f8a61fb`, redeploy **v1.20.142** (#160). Prior lineage: v1.21.0 = #163;
  v1.20.142 = #160.

## #158 — what shipped (13787154 / v1.21.1)
P1 thumbnail step-down cap in `cropRegionToBase64` (`RL_THUMB_MAX_CHARS=250000`, dim floor 200, quality
floor 0.4; new captures only). P2 `_rlPath`→`_rlDocPath`/`_rlEntriesPath`; `loadRegionLearning` dual-path
merge (subcollection + old doc, dedupe by id subcollection-wins, client-side savedAt sort, NO write-back);
save/delete/update rewritten to per-entry subcollection ops. P3 removed 3 silent `.catch` (W1/W2/W3 throw
to callers); `_captureRegionForLearning` non-blocking + `logDebugEntry` + actionable warn;
`pruneRegionLearning` keeps the row on delete failure. **Migration:** frozen doc
(companies/XODxZ8xJc0dQXGZI7jbo) 1,044,339 chars → 132-byte slim manifest + 9 entries in `/entries`,
thumbnails byte-for-byte preserved, 10-op atomic batch (dry-run verified first). **Phase 5 V1-V4 all
PASS** (V3 extraction landed 76 BOM items with region-learning in path; Haiku `.update()` merge confirmed
on subcollection). Learning DB at **13** (4 real OVIVO regions kept). Plan: `docs/158-REGION-LEARNING-SCOPE.md`
+ `docs/158-DETAILED-PLAN.md` (C108 Rev 2); Coach review **C109 PASS**. Root driver was uncapped thumbnail
height (9 entries blew 1MB), NOT entry count.

### #158 loose ends (carry forward)
- **DEFERRED V3 DIRECT CONFIRM (LOW):** `regionLearningParts` verified non-empty by invariant + read-path
  proof, not a captured request payload. Next catchable extraction — glance at the request payload to close
  it directly.
- **SANDBOX BC CLEANUP:** scratch project **PRJ402127** BC project + task structure remain in BC (ARC-side
  deleted; "also delete from BC" left unchecked per scope). Retire alongside the other #163 sandbox test
  artifacts (MTX-01023/24/25, ZZ_TEST items). Harmless sandbox cruft.

## NEXT-SESSION PRIORITY — #168 Coach trace (NEW, HIGH)
**#168 — Post-extraction auto BC-sync modal flags valid in-BC items as "couldn't sync."** The auto-popup
(end of the post-extraction auto-sequence) lists items that can't sync; closing it + clicking the manual
"BC Sync" button syncs them ALL. Same items, same BC, different results. CONFIRMED (Jon, prod v1.21.1): the
auto-popup is a DIFFERENT code path from the manual button and fires before the user sees the BOM.
**NEXT ACTION: Coach evidence-first trace of BOTH sync paths to find the divergence point** — investigate
what DIFFERS between auto and manual, NOT "why don't these match BC." Hypothesis (unconfirmed): async-window
timing (#153 class — VIN `_resolveVendorItemNo`/`_vinResolved` C113/C115, BC token #125, field population,
cache load), different lookup key (No. vs Vendor_Item_No vs partNumber), or mis-classifying a not-yet-resolved
result as "couldn't sync." Full trace request drafted + ready to route. **STOP before fix design until the
failing layer is proven.** Full detail in TODO #168.

## #163 production cutover — STILL GATED (was top of queue; unchanged)
Gated on a production BC environment existing (does not yet). `bcEnvironment` = `MATR_SndBx_01152026`
(SANDBOX) — the only BC env. Strict order: (1) stand up prod BC → (2) scope cutover w/ BC dev → (3) hand-
correct long-PN items into `Vendor_Item_No` FIRST → (4) BC mass-rename No.→`MTX-#####` + ARC `bcNo`
reconciliation IN LOCKSTEP. **Next-session trigger:** Jon brings the Excel mapping sheet → FIRST ACTION =
Coach `bcNo` sole-reference trace → Coach scopes reconciliation script → Marc dry-runs → Jon verifies →
Marc runs live. Full detail in TODO #163 + the agreed migration approach (retained in git history of this
file's prior revision).

## Open work queue
**Actionable HIGH (no gate):**
- **#168** — auto vs manual BC-sync divergence (NEW; next-session Coach trace — see above).
- **#164** — Reconciliation Deleted→"Keep" may strip crosses (possible data loss, untested branch).
- **#165** — Reconciliation Accept/Reject verbs read backwards (UX, data-loss risk).
- **#159** — Copy-to-New-Quote customer selection (scope ready: `docs/159-COPY-CUSTOMER-SCOPE.md`).
- **#160** — ReconciliationModal Changed rows offer only "Accept", no reject.

**#163 follow-ups (GitHub-tracked):** GH #2 (portal per-row lead times satisfy submit), GH #3 (no manual
entry without uploading a doc first), GH #4 (BC price-push stacks prices without end-dating prior — money
correctness).

**Carried-forward (NOT started):** #161/#162 (LOW), #166 (stampFn/drop-handler dedup, LOW, needs Coach
scope). #167 closed NO-BUG (false alarm). #158 DONE (this session).

## Working tree / handoff
- Clean after close-out (TODO.md + SESSION-STATE.md + docs/158-*.md + FREDDY-SESSION-BRIEF.md committed).
- `COACH.md` modified by Coach this session — **left for Coach to commit** (Coach-owned; not swept).
- master == origin/master. v1.21.1 tag on origin.

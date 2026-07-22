# ARC Review Findings

> Work item numbering follows NUMBERING-CONVENTION.md (authoritative). New items: `<B|F|G>### — "<short title>" — description [Status]` (each category its own ranked list, in the B/F/G Tracker below). Legacy `#1–#198` keep their `#N` IDs (no renumber) in the Round-N sections.

Captured: Thu May  7 10:54:16 MDT 2026
Source: ./tools/review.sh first runs

Each finding has a status: **OPEN** (still needs work), **RESOLVED** (committed, SHA noted),
**STALE** (no longer matches current code — kept as a record of what was checked and why).

---

## 🆕 B/F/G Tracker (new taxonomy, 2026-07-02+)

> New items since the B/F/G cutover. Each category is its own ranked list (top = highest priority);
> Freddy is sole allocator. Legacy `#1–#198` remain in the Round-N sections below (kept, not renumbered).

> **✅ SHIPPED — QUICK-WIN BATCH → v1.23.2 (2026-07-07, release `9d89f26b`).** 6 items in one patch (`bf771c6a` 5-of-6 + `4fe189b3` B003), Coach diff-review APPROVE (COACH.md `cef4ba5b`, inclusive range `bf771c6a~1..4fe189b3`), Jon deploy checkpoint → prod. Members all RESOLVED: **G006** (portal loading copy), **#190** ("Save Defaults"→"Save" + full-modal-commit confirmed), **#195** (false auto-BUDGETARY checklist entry suppressed on Print-as-Firm), **B002** (state-aware approved-TR block message), **B001** (OAuth redirect trailing-dot strip), **B003** (hid RFQ-Apply-modal not-quoted noise list @39074-77, apply path unaffected). B011 + B005 EXCLUDED (money-path/TR-logic). **Next per Jon's sequencing: G005 Phase 1** (approved, plan + rulings ready).

> **★ SCOPED — BUGS CLUSTER (B008 / B011 / B005)** → `docs/B008-B011-B005-BUGS-SCOPING-BRIEF.md` (Freddy, 2026-07-07, @af3e7dfe). **B008** — the "🔗 Supplier Portal" link @20354 keys off `sub.id` while sibling links use `uploadToken` → likely the wrong key (opens pre-submission not submitted); Coach traces key-vs-state. **B011** — line numbers drifted since B010; the un-hardened `lineItems` writes are now **31304/31340/32004/32147** (31707 already hardened); apply undefined→null with the `_nullifyUndefined` Date/Map caveat verified per-site; money-path-adjacent = careful. **B005** — resolved-TR-row checkbox readOnly gate (@29074-29116) blocks manual re-arm; LOW/tuning; Coach traces the exact condition. Recommend: bundle B008+B005 (small UI/routing), keep B011 its own careful change. Queued behind G005 + features clusters.

> **★ LEGACY SCREEN (Dez, Jon-directed, 2026-07-07, STATUS.md `7c4ee8bc`).** Screened all ~101 open `#N` Round-N items for silent fixes → **none; the ~101 is REAL backlog** (not bookkeeping lag). Done: #190/#195 flipped to RESOLVED (shipped v1.23.2). **5 to CODE-CONFIRM** (adjacent work may have shifted/partially-addressed them — need a Coach/Marc read before re-rank, at a G005 break): **#73** (Scan-Results banner ↔ B006 reworked that banner), **#65** (project-open BC-sync hygiene ↔ #65b emergency-disabled for PRJ402109 data loss), **#84** (drops last rows on scanned BOMs ↔ touched during #94), **#71** (vendor source-of-truth ↔ scanBomForArchiveIssues hotfix), **#58** (CRITICAL re-extraction verification gap ↔ re-scoped `5cc930fe`, confirm wording current). **Bigger lever (deferred):** a relevance/staleness pass over the ~101 ("still worth doing / superseded?") — judgment call needing Coach/Marc + Freddy ranking; tee up when backlog-shrink is the goal.
> **★ DONE — legacy B/F/G categorization (Jon-directed, 2026-07-07).** All OPEN legacy `#N` items TAGGED by type (KEEP #N — no renumber). **Index: `docs/LEGACY-BFG-CATEGORIZATION.md`** (subagent-proposed + Freddy-reviewed). **91 items: B=45 · F=27 · G=19.** Backlog is ~50% bugs (several money-path/BC: #23/#54/#62/#69/#171/#172/#188). **4 STALE closed** (Jon 2026-07-07): #24 (task no-longer-needed), #75 (superseded by #52/#127 progress work), #76 + #96 (CCD send_message bus supersedes the coordination-layer/facilitator ideas). Applied as an index doc + this pointer (not 91 inline edits → #N entries untouched, reference-safe). Remaining bigger lever: the full relevance/staleness pass (Dez teed up).

> **★ ENGINEER FEEDBACK ON REVIEWS (captured 2026-07-14) → `docs/ENGINEER-FEEDBACK-ON-REVIEWS.md`.** 9 items from Jon's engineer on the Review Redlining/markup feature (move/resize placed shapes, click-note→highlight-shape, edit note text, 🐛 Triangle not rendering, highlighter tool, on-drawing text tool, note text wrap-not-scroll, per-page group spacing [screenshot NOT attached — get from Jon], + a separate BOM Escape-revert for part#/qty cross-ref B031). NOT yet scoped/numbered — Freddy to allocate B/F/G + route when Jon prioritizes. Quickest win = the Triangle-not-rendering bug.

### 🐛 Bugs (B###)
- **B044 — "Projects with red rows / unpriced / no-lead-time incorrectly shown in READY TO REVIEW/SEND (evc)"** [OPEN · MED · diagnosing] — Jon (2026-07-21): projects appear in the READY TO REVIEW/SEND column (`evc`) that still have red rows, unpriced items, and items without lead times — they shouldn't be there. Analyze `computeProjectEffectiveStatus`'s `evc` predicate (prior finding `hasBom && !hasUnpriced && !hasActiveRfqs` ~:16504): why does a red/unpriced/no-LT project satisfy it (what does `hasUnpriced` test vs `_isBomRowFlaggedRed` / `_hasFirmLeadTime` / send-block)? Verdict bug-vs-intended + fix. Cross-ref B018. **★ Coach ROOT CAUSE (`docs/B044-F026-EVC-SPLIT-COACH.md`):** `hasUnpriced` (:16554) is STRICTLY NARROWER than `_isBomRowFlaggedRed` (:16282) + `findIncompleteQuoteItems` (:16377) — it only checks missing/zero price + missing priceDate, so **stale-date reds, qty=0, unresolved tech-review, manualVerify** (all send-blocking) still satisfy `evc` → wrong column. Genuine bug (+ lead-time-only reds = the intended-confusing case the split resolves; + a vendor-is-customer exemption gap to fold in). **FIX = consolidate onto SSOT** (`anyRedRow`/`readyToReview`/`readyToSend`) → fixes B044 + B018 + enables the F026 split in ONE pass. Folded into F026 Phase 1. *(source: Jon 2026-07-21; Coach diagnostic.)*
- **B043 — "Ryan's RFQ send: no sender confirmation email + supplier emails blank"** [OPEN · HIGH · diagnosed, needs live confirm] — user Ryan reports (via Jon, 2026-07-21): sending RFQs produces NO confirmation email back to him, and supplier emails come through "blank." **★ Coach diagnosed (`docs/B043-RYAN-RFQ-COACH-TRACE.md`, read-only trace): BOTH symptoms = ONE root (H1).** RFQ email sends client-side via Microsoft Graph from the sender's own mailbox (`onSendRfqEmails` @38692 → `sendGraphEmail` @19913 → `me/sendMail` @8604; no SendGrid). Vendor recipient resolution is BC-token-dependent: `bcGetVendorEmail` returns `""` if `!_bcToken` (@6282), `bcFetchVendorContacts` returns `[]` if `!_bcToken` (@19732); only non-BC source is saved company `vendorEmails` config (@19785). A blank recipient is SKIPPED (`if(!to)` → `sent:false` "No email address" @19892), so the supplier gets nothing. The sender confirmation is gated on ≥1 successful non-API send (`sentVendors.length>0` @20057) → zero sends = zero confirmation, deterministically. **Ryan-specifically:** owner has BC connected w/ vendor read scope; Ryan (team member) likely hasn't connected BC or his per-member BC API key lacks Vendor/Contact read → blank recipients. Same brittle-BC-email-resolution class as **B024**. **RULE OUT FIRST (H2):** is Ryan on `matrix-arc-test` (🧪 ribbon)? test host suppresses all Graph email (@8586) — expected, not a bug. **CHEAPEST DECISIVE TEST (H1):** live Ryan send on PROD → open Send-RFQ modal, read per-vendor rows — blank / "✗ No email address" confirms H1 (+ explains missing confirmation via @20057); corroborate: zero `me/sendMail` POSTs, no `[RFQ] Confirmation email sent…` console line, newest `companies/{cid}/rfq_history` doc all `entries[].sent===false`; cheapest tell = Ryan's BC toolbar connection status. **FIX DIRECTION (not built):** decouple recipient resolution from `_bcToken` (fall back to saved `vendorEmails` / surface a hard "no vendor email on file" state, no silent blank); make the sender confirmation fire even on a 0-sent run; add a Debug Log entry on blank-recipient. **★ LIVE TRIAGE (Jon, 2026-07-21): reporter on PROD + BC CONNECTED (blue) + Ryan sending fine NOW → not a broken account; the bug is the blank-vendor-email data/handling path.** Original report matches an all-blank send (every vendor on that RFQ lacked an email → zero sent → no confirmation). **★ Marc build-ready plan → `docs/B043-RYAN-RFQ-MARC-PLAN.md`:** all changes in `RfqEmailModal`, ~50–70 LOC, LOW–MED, not money-path, fragment-safe — (1) per-vendor "no email" marker + pre-send "N of M won't be sent" banner, (2) guaranteed in-app zero-sent feedback + widen the confirmation-email gate, (3) BC-vs-no-email distinction, (4) Debug Log on blank recipient. **Jon ruled warn-and-continue.** **✅✅ SHIPPED TO PROD v1.23.23** (2026-07-21, release `3a297d66`; build `d233d0f7`). Marc built (`RfqEmailModal`, +35/-5 LOC, validate PASS); Coach APPROVE WITH NITS → NIT-1 (blank-vs-failed label split + empty-included edge) folded; Freddy re-validated. **⏳ LIVE-VERIFY (Jon, prod):** all-blank send → in-app "⚠ 0 RFQs sent" + sender gets "RFQ NOT SENT" confirmation email; partial → good ones send + blanks flagged + confirmation fires; all-good → unchanged; + `rfqSend` warn entries in `companies/{cid}/debugLogs`. *(source: Jon relaying Ryan 2026-07-21; Coach diagnose+review + Marc scope+build lanes.)*
- **B012 — "Concurrent multi-user editing destroys BOM rows (whole-doc save, no row merge)"** [★ CRITICAL — ✅ P1 SHIPPED TO PROD v1.23.5 (2026-07-10, release 7b2ba1ba, master tip 7b2ba1ba) — hard one-editor lease LIVE (client + firestore.rules); ONE-EDITOR CONTAINMENT RELAXED. MATRIX CLOSED — L5 PASS via the EXTRACTION path (backgrounded writeback survives nav-away; keep-alive d1b1b07e validated via _hasRunningBgTaskForProject reading _bgTasks, which extraction populates; Jon's months of extraction+pricing-while-away confirm it). Marc confirmed standalone "Get New Pricing" is FOREGROUND/pre-existing (not a P1 regression — P1 diff touches zero pricing/abort code) → that's the wrong L5 vehicle + a separate enhancement → F019. Full matrix: L1/L2/L3/L5/L6/L7/L8 ✅ (no L4 in this matrix). Remaining: P2/P3/P4 phases + same-user-multi-tab fast-follows OPEN. Phase A+B merge PR #5 SHELVED/retained (superseded by the lock).] — two users editing the same project (owner + non-owner) clobber each other's BOM additions; rows "disappear when the other user opens the project." ROOT CAUSE (Coach C137 code-trace + Marc runtime, cross-validated): ARC saves the BOM as a whole document (`ref.set()` full-doc replace) with NO row-level merge — last write wins. THREE compounding mechanisms: **M1** save-on-open fires `safeSave(migrateProject(init))` off the dashboard-CACHED (stale) `init` (app.jsx:37471) → opening strips rows added since the cache; **M2** every edit does full-doc `ref.set()` replacing the panel's `bom` with the client's in-memory copy (saveProject @9158 / saveProjectPanel @9361-9405) — only guard is the nBom===0 total-wipe high-water belt (8963/9291), partial loss (7→5) NOT caught; **M3** the project-doc onSnapshot soft-apply REPLACES local state (37243) dropping not-yet-persisted rows. AMPLIFIER (Marc): each edit fires a BURST full-doc save that overflows the Firestore client write queue (`resource-exhausted: Write stream exhausted` — both users, matching add cadence) → row-writes silently dropped. Affects ANY project edited by 2 users concurrently (platform-wide), not just PRJ402096. FIX (Jon-approved, staged): **Phase A** delete/guard the stale save-on-open @37471 (~5 LOC, kills M1); **Phase B** row-level merge-on-save (union by globally-unique `row-<ts>-<rand>` id) in both save fns' server-read guards + soft-apply MERGE not replace (M3) — CRUX: delete-vs-add disambiguation via a client-carried baseline of loaded row-ids (`_bomBaselineIds`) so intentional deletes aren't resurrected; preserve priceSource + all metadata (carry rows whole), run merge BEFORE `_dedupBomRowIds` @9360, keep the high-water belt. Plan: docs/BOM-MERGE-PHASE-B-PLAN.md (Coach). Rollout: test-channel + 2-session concurrent ADD+DELETE matrix before prod; PR + Jon sign-off (save-path protocol). CONTAINMENT (live, until Phase B ships): ONE editor per project, ALL projects. DATA: no Firestore revision history → prior overwritten states GONE; PRJ402096 preserved in docs/PRJ402096-BOM-SNAPSHOT-2026-07-08T2259Z.md (155 rows); panel-1 has duplicate BUYOFF/CRATE (cleanup pending); recovery = reconcile + re-add via app after fix. **★ PROVEN INSTANCE (2026-07-08 late):** Jon added **534013 + 534042** BEFORE Andrew joined; both GONE from the Firestore BOM (absent at the 22:59 snapshot AND now @157 rows). **534013 confirmed-clobbered** — it appeared in the 22:59 BC planning-line sync ("Type must not be Text", Task 20210) so it WAS a real BOM row pushed to BC, yet absent from the Firestore source-of-truth = clobber signature; timing fits Andrew's 22:36–22:50 concurrent-add burst. 534042 = clobbered or never-persisted (B016) — no independent artifact. **RECOVERY:** re-add 534013 + 534042 (need pricing) once Phase B ships / under containment. **STATUS (late):** Phase A+B BUILT, unit-tested 25/25 (`tests/bom-merge-phaseb.test.js`), Coach C138 review PASS, deployed to TEST, PR #5 — **HELD** for the live 2-session matrix (`docs/PHASE-B-MATRIX-SCRIPT.md`, Jon + co-driver) + Jon prod sign-off. NOT merged/deployed to master or prod. *(source: Jon 2026-07-08, live incident on PRJ402096; Coach C137, Marc snapshot + 534013 clobber proof.)* **★ STRATEGY PIVOT (Jon, 2026-07-09) → HARD ONE-EDITOR LOCK (server-enforced editing lease), not row-merge.** Phase A+B (merge, PR #5) SHELVED + RETAINED (not deleted). New approach = a per-project editing lease (`editingBy/editingByName/editingTabId/editingClaimedAt/editingExpiresAt/editingLastActivityAt`): first-accessor edits, others view-only; held-while-open, released-on-exit (no idle TTL); ownership (Salesman/createdBy) permanent + separate; request-access→holder-grants (P2); force-takeover only after 30-min inactivity + warning/grace (P3); "hold priority while away" blocks all takeovers, admin-only override (P4); per-project granularity; holder-prints-only; 2nd-tab per-session view-only modal; reviewer FULL control during review. Brief + rulings: `docs/B012-HARD-LOCK-BRIEF.md`; plan: `docs/B012-HARD-LOCK-COACH-PLAN.md` (C139). **★ P1 (core lock) STATUS (2026-07-10): BUILT + Coach-cleared + test-verified GREEN.** Combined build @98576f8e (base P1 `b654c5d6` + keep-alive `d1b1b07e` + Fix B eligibility-gated claim `a7c4bbf2` + gap #3 reviewer-exempt `6871b280` + gap #4 reject/approve lease-hand-back `93607beb` + gap #5a reload-ghost sessionStorage tab-id `98576f8e`); rules UNCHANGED since `b654c5d6`. Jon FINAL re-test PASS: refresh false-positive GONE ✅, reject-path hand-back ✅, L8 2nd-tab view-only ✅. **PRE-SHIP SEQUENCE (2026-07-10):** (1) Jon's initial fold-in "remove View-read-only → only Close the tab" (97c8ec31) was tried but Jon's re-confirm hit a same-user-2nd-tab episode ("both tabs editable, no modal"). (2) Marc pinned it: **Root A = a pre-tick window** (leaseReadOnly defaulted false; first async claim/detect tick left a fresh tab briefly editable) — NOT the button, NOT gap #5a; same class as the deferred gap #4 #2b. Cross-user B012 CONFIRMED intact (rules lock on editingBy vs uid, no tab-id; all 5 _ARC_TAB_ID uses same-uid-guarded) → fail-safe, non-data-loss. **Root B = ghost lease** (close-release is a tx that dies on tab close → lease lingers ≤90s) = gap #5b, deferred. (3) Jon chose FOLD IN the Root A **pre-tick guard** (37b15953, Coach PASS 2b4987e0 — seeds leaseReadOnly from init.editingBy so a tab opening onto an already-held lease is read-only from first render; FREE lease → false, sole editor never flashed). (4) Coach flagged a PROD-GATE trap: the non-dismissible "Close the tab" modal (97c8ec31) + the deferred ghost (gap #5b) = a ≤90s self-trap on a close-then-reopen-within-90s (window.close() can't close a user-opened tab). Non-dismissibility buys ZERO data-safety (same-user is client-only). **(5) Jon ruled: SHIP DISMISSIBLE NOW** — restore the "View read-only" escape on the same-user other-tab modal for P1; ship the non-dismissible hard-block WITH gap #5b (F015 fast-follow, per the pre-recorded F015 dependency). Marc restoring the escape → Coach quick prod-gate confirm → deploy test → Jon re-confirm (clean slate) → prod sign-off → deploy client+rules → relax containment. **Fast-follow after ship (same-user-multi-tab hardening family):** gap #5b (close-ghost: pagehide+sendBeacon/non-tx release + same-uid adopt) + F015 (non-dismissible hard-block, incl. Chrome Duplicate-Tab caveat) ship together; then B024/B025/B026, F016, B027/F017/F018, G008/G009. P2/P3/P4 = later phases. Full lifecycle log in SESSION-STATE.md.
- **B013 — "BC 401 (expired token) is hidden: stale 'Connected' indicator + misleading sync-fail modal + no retry/refresh"** [OPEN · HIGH] — a transient BC OAuth token expiry mid-operation makes every BC call 401 (`credentials provided are incorrect`) in that window, but ARC HIDES it: (1) toolbar still shows "BC Connected" (green) while every call 401s (indicator reflects "a token exists," not "valid"); (2) the "BC Sync Incomplete — N items could not be pushed / Use the Item Browser to find each item" modal is MISLEADING for a 401 (items are matched+valid; the token is dead — steers user to re-match good rows); (3) "Retry Sync" only renders on all-429, so a pure-401 shows no retry affordance; (4) no token auto-refresh / retry-on-401 → the whole batch fails in one window (61 planning-line POSTs on PRJ402096, 2026-07-08 17:47Z). SECONDARY: on each BC failure the app reverts the row + writes it back; ~61 rapid reverts overflow the Firestore client write queue (`resource-exhausted`) — same burst-write class as B012's amplifier. FIX: distinguish 401 from item-mismatch in the sync-result modal; drive the "BC Connected" indicator off token VALIDITY (re-auth prompt on 401); add retry/re-auth affordance on 401; consider token auto-refresh; batch the revert writes. NOTE: root cause is OAuth-expiry, NOT the G005 refactor (Marc + Coach both ruled G005 out — this path predates G005 by ~5 weeks and the gate is inert on prod). *(source: Jon 2026-07-08 PRJ402096 "61 items" report; Marc debugLogs 401 storm, Coach path trace. Supersedes the INBOX "G005 regression suspected" wording.)* **★ ESCALATED (2026-07-08 late) → CHRONIC MULTI-USER BC CONNECTION RELIABILITY.** Tonight Jon's session degraded repeatedly (search died, adds/edits flaky), recovering only on reload+reconnect — while the pill stayed GREEN and the search icons did NOT disappear (health indicator missed it). Jon reports Andrew's & Ryan's pills are OFTEN RED (connection drops frequently; a click reconnects → blue). ⇒ TWO failure modes: (A) clean drop → pill honestly RED (Andrew/Ryan, frequent, click-reconnects); (B) silent mid-session token degradation → pill stays GREEN but calls fail (Jon tonight — detection blind spot). Marc verified BC HEALTHY at the account/tenant level (his session, authed as jon, returns 200s) → per-SESSION token degradation, not the tenant. Possible role factor: owner vs team-member BC auth (per-member API keys) may fail differently. FIX widened: honest connection-health indicator (probe token VALIDITY, not mere presence) + auto-reconnect/backoff + token refresh. MORNING WEDGE: compare Jon's green-but-dead vs Andrew/Ryan's honest-red-then-reconnect to pin the health-check + refresh gaps. Priority: right behind shipping Phase B.
- **B014 — "Codale scraper misses price on a multi-result page (no exact catalog# normalization match)"** [OPEN · MED] — server `extractFromPage` (functions/codaleScraper.js) fails to return a price even when the product + price ARE on the Codale page: Strategy 1 requires a Catalog # whose normalized form (strips only space/-/.) === the query EXACTLY; its substring fallback fires only if exactly ONE catalog line; Strategy 3 only if the page says exactly "1 Products found". ⇒ on a MULTI-result page where no catalog # normalizes exactly to the query, ALL strategies miss (client faithfully reports "Price not found on Codale"). Secondary: price-format regex needs `$X.XX` + optional UOM (misses "Call for price"/login-gated/no-cents); login only reaches "status uncertain — proceeding". Decisive artifact = codaleTestScrape Functions logs: error "Price not found" + debug body CONTAINING a $price confirms the parse gap. NOTE: Jon's PRJ402096 report of "5 Codale items no pricing" was NOT this — those rows were BC-priced (scraper skipped when BC has a recent price, app.jsx:27456); he force-priced them as a workaround. This is the LATENT scraper bug Coach found while tracing, still worth fixing. *(source: Coach C135 trace 2026-07-08.)*
- **B015 — "Project remote-lock / 'is editing' banner has reactivity + orphan gaps"** [OPEN · MED] — the remote-task lock ("🔒 {owner} is currently processing this project", fed by companies/{cid}/activeExtractions) and the owner-priority/"is editing" banner have three defects (Coach C136): (i) per-panel `remoteEditor` grey is DEAD CODE — the filter @35415 matches bare `panel.id` / `panel.id+'_bcsync'` but every bgStart writer uses `_bgKey(projectId,panel.id)` ("PRJ…:panel-1") → never matches → the softer per-panel grey never fires (so the harsher full-page lock bites instead); (ii) staleness (30s heartbeat freshness) is only re-evaluated on a snapshot event or re-render — no timer → an activeExtractions doc silently aging past 30s LINGERS in state and keeps blocking until the next event; (iii) orphaned 'running' docs — rbgStart writes status:'running' with NO server-side TTL; a crash / mobile background-kill / navigate-away-with-running-task leaves an orphan that keeps locking. FIX: fix the `_bgKey` mismatch @35415; add a time-based staleness timer to expire an aging lock without a new event; add a TTL/cleanup for orphaned activeExtractions docs. NOTE: the 2026-07-08 PRJ402096 "Jon is editing" reports were largely a live-presence confound (Marc's investigation tab authed as Jon + Jon's own then-open session; activeExtractions observed EMPTY live) — but these code defects are real and independent. *(source: Coach C136 trace 2026-07-08.)*
- **B016 — "BC Item Browser add silently does nothing (fire-and-forget save + swallowed errors)"** [OPEN · HIGH] — applying/adding a part via the BC Item Browser modal can SILENTLY no-op: modal closes, nothing changes, no error shown (Jon, PRJ402096 PROD, single-user, 2026-07-08). Marc diagnosis: NOT the dropped-write bug (debugLogs clean, no resource-exhausted, row count unchanged 155, no write landed) and NOT Phase B/concurrency (prod = old code). PATH: onSelect @30351 → applyBcItem → commitBcItem @26640 → FIRE-AND-FORGET `saveProjectPanel(...).catch(console.warn)` @26817; addBomRow's onSaveImmediate @26578 is an EMPTY catch. commitBcItem applies a BC item to an EXISTING row (only inserts a row via the @26644 fallback). Silent-failure candidates (pin via console repro): (i) `bcBrowserTarget` null at select → applyBcItem never fires (modal just closes); (ii) saveProjectPanel silent EARLY-RETURN (deletedPanelIds @9268 / zero-pages / lock guards); (iii) commitBcItem pre-save await throws (unlikely — no uncaught log). ROOT reliability defect: the save is fire-and-forget with swallowed catches → ANY failure is invisible to the user. FIX DIRECTION (not built): surface the save outcome + await/verify the persist (kill the fire-and-forget + empty catches). DECISIVE repro (Jon, morning): reproduce once with DevTools console OPEN → report console lines + entry point + BC-Connected state to pin the branch. Distinct from B012/B013. **★ RE-SCOPED (2026-07-08 late) — NOT a deterministic silent no-op; it's an intermittent WRITE-RACE / DELAY under heavy on-open BC churn.** Evidence: the "added" rows actually PERSISTED (row count 155→157) — they just rendered minutes late; and it hits ALL mutations, not just adds — field EDITS revert too (lead-time value reverts to empty; **Est. Prod. Done date set to Aug 13 reverted to the old Sept value**), and DELETES don't stick (deleted item stays in BOM → its BC planning-line isn't removed downstream). ROOT (Coach C137 + this): concurrent read-modify-write on a WHOLE-DOCUMENT save with no row merge (M2) + soft-apply-replace (M3), amplified by PRJ402096's massive on-open BC churn (132-item price fetches, bcSyncPlanningLines, bcPatchProgressBilling ×3, repeated searches) → whoever writes last wins; soft-apply also reverts uncommitted edits on the read side. Single-user AND concurrent. FIX (beyond Phase B's row-merge, which protects new ROWS only, not field edits): (a) REDUCE the on-open BC churn (why re-sync everything on every open?); (b) make mutations resilient — await + confirm each add/edit/delete (spinner, no fire-and-forget) so a background sync can't revert an in-flight change. **NOTE: Phase B does NOT fully fix this** — its M3 is adds-only; the churn-reduction + await/confirm is what fixes the lead-time/date/delete reverts.
- **B017 — "Special-character part numbers 400 the BC price/purchase-history lookups"** [OPEN · MED] — BC price + purchase-history queries fail (HTTP 400) for items whose part numbers contain commas / plus-signs / spaces, so those items skip auto-pricing (e.g. "66 of 134 fetched"). Observed PNs (PRJ402096 console, 2026-07-08): `DUCT,2X3,GREY` · `DIN, 35MM, STANDARD` · `DCT880-W03-0325-05+J404+S500` · `CRATE LG 56X48X16` · `1032264 CS` · `ANR FABRICATION-004`. Affected calls: `bcFetchPurchasePrices` batch (PurchasePrices `$filter=Item_No eq '…'`) + `bcGetLastPurchase` (purchaseInvoiceLines `lineObjectNumber eq '…'`). Likely an OData `$filter` value-escaping gap on special chars (confirm vs "item genuinely absent"). Not blocking, not data-loss — just missing auto-prices. SECONDARY noise (same session): ItemCard PATCH 400 "Inventory Posting Group is read-only" on BUYOFF/CONTINGENCY — the app shouldn't PATCH those pseudo/labor items. *(source: Jon PRJ402096 console 2026-07-08; Freddy read.)*
- **B018 — "Send-block overlay counts only pricing-incomplete rows, not all red rows (confusing)"** [OPEN · MED — product decision] — the send-block cover says "N items incomplete (incomplete pricing)" counting ONLY pricing-incomplete rows (e.g. 2: 8660023 + 8617502 — price present but `priceDate` NULL, the #178/#179 pattern), while the BOM shows more red rows (6), because missing/stale LEAD TIME also reds a row but does NOT block send (it's RFQ'd). Users can't reconcile "6 red but 2 counted." The pricing-blocks-vs-lead-time-RFQs split is LIKELY intentional (confirm it's not #178/#179-class predicate drift). FIX (Jon's call): probably CLARIFY — overlay lists/explains ALL red rows by reason ("2 block send: pricing; N flagged for lead time: will RFQ, don't block") rather than block-on-any-red (which would over-block the RFQ workflow). Also open: WHY do 4 non-blocking rows (9345610/8660021/8660022 dated Jun-29 ~10d, 8617500 Jul-8) render red when priceDate isn't stale (<60d)? → investigate `_isBomRowFlaggedRed` vs the send-block predicate (dual-consumer alignment, #175/#178/#179 class). *(source: Jon 2026-07-08 PRJ402096.)* **★ DECISIVE REPRO folded in (Jon, PRJ402100, 2026-07-10):** item `3044102` rendered RED with ALL reqs met (Priced Date + Lead Time + BC satisfied); bumping the price **+1 cent CLEARED the red** → points squarely at `_isBomRowFlaggedRed`'s **priceDate read/staleness compare** (a valid priceDate mis-evaluated as stale; the 1-cent edit refreshes priceDate/state and clears the flag). Audit `_isBomRowFlaggedRed` + the priceDate staleness comparison. (Distinct project/cleaner repro than the PRJ402096 observation; same likely root — kept under B018.)
- **B026 — "Can't start a 2nd tech-review cycle without cancelling the prior one"** [OPEN · MED] — after a tech review completes (approved/rejected), checking new TR boxes does NOT let the user initiate a fresh review / does NOT re-enable Send-for-Review — they must CANCEL the prior review first. Jon: checking ANY TR box after a prior review should trigger a NEW review cycle + enable Send-for-Review (support repeat reviews per project). ROOT hypothesis: post-completion `preReviewStatus` is a terminal state (approved/rejected) and Send-for-Review is gated on not-already-reviewed / requires a manual cancel to reset → no auto-re-arm on a fresh TR-check. Fix: a TR-check after a completed review re-arms a new pending cycle (Send-for-Review re-enabled). ★ **MARC VERDICT (2026-07-10): PRE-EXISTING, NOT a P1 regression → does NOT block ship.** Decisive: P1's only `preReviewStatus`-SET changes (approve/reject) are BYTE-IDENTICAL on the status value (P1 only appended `_reviewLeaseHandBack()` lease fields); nothing in the P1 diff touches the Send-for-Review gating, `_onTrToggle`, or re-arm logic. ROOT: post-completion `preReviewStatus` is terminal; (1) B002 @16104 — Send-for-Review button not rendered in "approved" state; (2) `_onTrToggle` @29172 sets `techReviewFlag` but doesn't reset `preReviewStatus` → no new pending cycle; only manual Cancel/invalidate @35532 resets. FIX (F003 state-machine, Coach domain, cross-ref B002/#199): a new TR-flag after a terminal review auto-resets `preReviewStatus`→null to re-arm a fresh cycle (preserve prior audit; don't fire during pending). Fast-follow. *(source: Jon 2026-07-10; Marc diagnosis.)*
- **B027 — "Revision history doesn't persist the engineer's review notes"** [OPEN · MED] — the engineer's/reviewer's notes entered during a Tech Review are NOT stored in the project's revision history; they only render transiently in the top window as light-red text and are lost afterward. Users can't go back and see what the reviewer noted. Fix: persist reviewer notes into the revision-history record so they're retained + viewable later. Relates to F017/F018 (per-row review notes) + F003 tech-review workflow. *(source: Jon 2026-07-10 P1 re-test, via Freddy.)*
- **B028 — "Concurrent scraper logins may collide (shared credential, no serialization)"** [OPEN · LOW · **TABLED** — latent, no observed harm] — the web scrapers ARC uses for pricing/lead-times (`customScraperBatch`, `codaleTestScrape`) do a FRESH login per call with a single SHARED credential per vendor, run at `maxInstances` 2–5 (concurrent instances allowed), and have NO client-side cross-project serialization (unlike BC's `_bcSemaphore` @app.jsx:422). ARC's multi-project model means 2+ projects scraping one vendor concurrently is expected. Risk: IF a supplier rejected/invalidated concurrent same-credential sessions, ARC would MISCLASSIFY it as "invalid credentials"/"price not found" and NOT retry (silent/misleading; login-verify @codaleScraper.js:117 doesn't distinguish a session-conflict logout). **VERIFIED NOT AN ACTIVE PROBLEM (2026-07-11):** prod logs show two `customScraperBatch` runs overlapping ~21:16–21:26 both finishing status 200 with prices + ZERO login/session/timeout/error entries; AND Jon confirmed Royal TOLERATES concurrent same-credential sessions (2-tab manual test — different actions per login). → TABLED for possible future issue. Mitigation IF ever needed: `maxInstances:1` on credentialed scrapers (serializes → slows multi-project pricing) + error-classification/retry (distinguish session-conflict from bad-creds). *(source: Jon question 2026-07-11; Freddy scraper investigation + prod-log verify + Jon's Royal 2-tab test.)*
- **B029 — "Per-BOM-row ⚠ error pill doesn't classify 401s (routes session-expired to Item Browser)"** [OPEN · LOW · follow-up to B013-3] — the per-row `⚠` BC-error pill on the BOM grid (`app.jsx:~29674`, `parsePillErr`) regexes only `.error` and ignores the now-available `ef.status`, and its onClick ALWAYS opens the BC Item Browser. On a 401 it renders "⚠ BC error" and sends the user to Item Browser — useless for a session-expired failure (the item is valid; the token is dead). NOT a regression (identical to pre-B013-3) and NOT the primary surface (the sync MODAL is, and B013-3 fixed it correctly); only appears if the user dismisses the modal without reconnecting. Fix is small: `bcSyncErrors[row.id]` already carries `status` → classify 401 → "Session expired" label + reconnect (mirror B013-3's modal treatment) instead of the Item-Browser route. *(source: Coach C145 review of B013-2/3, 2026-07-11; recommended as a separate LOW item.)*
- **B030 — "BC Item Browser LT-populate save has a silent .catch (no observability)"** [OPEN · LOW] — the direct `saveProjectPanel(...).catch(()=>{})` at ~`app.jsx:27119` (BC Item Browser lead-time populate) swallows errors silently. NOT a data-loss risk (the value survives in React state via `onUpdate`, and it's B016-2 merge-protected), and it's outside B016-3's user-funnel scope — but zero observability. Fix: add a `console.warn` / `logDebugEntry` in the catch. *(source: Coach C146 review of B016-2/3, 2026-07-11.)*
- **B031 — "User can silently clear a price (blank the unit-price field) — no guard, no confirm, no BC reconcile"** [OPEN · MED · Jon: AGAINST DESIGN] — blanking a row's editable unit-price cell fires `updatePrice(id,"")` (`app.jsx:~27087`, "Clearing price — no popup needed") → sets `unitPrice`/`priceSource`/`priceDate` all to null. **Jon (2026-07-12): by design no user should ever be able to clear a price.** Today it's reachable + uncontrolled: NO confirmation (the Confirmed-vs-Budgetary popup only fires on price ENTRY, not on clear) and NO BC reconcile (the ARC row loses its price while BC keeps the old one → mismatch). Candidate fixes (Jon to pick the behavior): (a) on-blur of an emptied price field, REVERT to the prior value — mirror the existing Escape-key handler (`~:27767`) — so a blank can't clear; or (b) require an explicit confirm + define BC handling. NOTE: the B016-2 `priceUpdatedAt` fix already ensures that IF a clear happens it persists (doesn't silently revert) — B031 is about preventing/guarding the clear itself, orthogonal to the merge. *(source: Jon 2026-07-12, during B016 matrix testing.)*
- **B032 — "🚨 ACTIVE PROD data-loss: save-on-open wipes flat/panels-less projects (C137 M1, never deployed to prod)"** [OPEN · CRITICAL · EMERGENCY] — opening a flat/panels-less project fires the eager save-on-open effect (`app.jsx` master ~:37814/:37863) which persists `migrateProject(stale dashboard-cached init)` = `{panel-1, bom:[], status:'draft'}` WHOLESALE → wipes the BOM + flips status to draft. The B016-2 merge is bypassed (no matching server panel → `cp` undefined) and the nBom belt is skipped (first-save, unset high-water). **LIVE ON PROD v1.23.11** — the C137 Phase A fix (delete the save-on-open effect) was Jon-approved but landed on the shelved `claude/phase-b-bom-merge`, never folded to master. Reproduced on the b016-23-merge test build (PRJ402063, throwaway) 2026-07-12. **FIX:** delete the save-on-open effect + dead `didMigrate` ref (C137 Phase A) → **emergency prod deploy** (independent of the B016 matrix); + defense-in-depth (panel-level union when the merge can't run, nBom belt in `saveProjectPanel`, first-save high-water seed). *(source: Coach C148 diagnosis, 2026-07-12; Freddy.)*
- **B033 — "Commissioning/Programming-only quote (no control panel) shows an empty right pane — no quote buttons or data"** [OPEN · MED-HIGH · scoping] — creating a quote for **commissioning or programming ONLY** (a services-only project with no control panel / no BOM panel) renders NOTHING in the right pane — none of the quote action buttons (Print/Send/RFQ/etc.) or the quote data/summary appear. Jon's hypothesis: the whole right-pane quote UI is gated on having a control panel, so a panel-less services quote falls through the gate. Blocks producing commissioning/programming-only quotes. **Scoping via Coach** (2026-07-13) — trace the QUOTE SUMMARY/right-pane render gate + fix so a services-only quote still shows the quote shell + applicable buttons/data (watch for totals/lead-time computations that assume a panel exists). **✅ Marc BUILT** → branch `b033-services-quote-pane` (`3fddc7fe`, off master `dce149a2`, validate PASS): factored the QUOTE SUMMARY + action block into a shared `quoteSummaryPane` (header + interleaved line list + PROJECT TOTAL + buttons) used by both branches; `panelDetailPane` (labor/ConfidenceBar/pricing/ship-date) stays panel-only. Send-BOM-for-Approval gated `panels.length>0`; RFQ row + Update-BOM-in-BC hidden for services-only (BOM-specific, crash-prone). **✅ Coach APPROVE WITH NITS (C150):** panel case output-identical (hoisted consts identical, no dup decls, babel parse OK); no `sp` null-deref on the services path; Print/Send traced SAFE for zero panels (`ensureQuoteNumber` panel-agnostic, `buildQuotePdfDoc` totals services-aware, traveler/BOM-report null-guarded). Nits (non-blocking): PDF "Subtotal (Panels): $0" cosmetic; services-pane top accent line; **pre-existing gap → B035** (`findIncompleteQuoteItems` ignores serviceCards → $0 service card doesn't block Send). Render-only, data-safe. Live smoke test advisable (not blocking). **✅✅ SHIPPED TO PROD v1.23.13** (2026-07-13, release `d49f882f`; merged with F020-A in one release). Commissioning/programming-only quotes now render the full right pane (summary + PROJECT TOTAL + Print/Send/Tech-Review/PO buttons). *(source: Jon 2026-07-13, via Freddy; Coach C150.)*
- **B035 — "Send is not blocked by a $0-priced service card (findIncompleteQuoteItems ignores serviceCards)"** [OPEN · MED · follow-up to B033] — `findIncompleteQuoteItems` (~`app.jsx:16138`) iterates only `project.panels`, so on a services-only quote (or any quote with service cards) a service card with a $0/blank price does NOT trip the send-block → a services quote can be sent with an unpriced line. Pre-existing (predates B033; surfaced by Coach C150 while reviewing B033, which made services-only quotes reachable for Send). Fix: extend `findIncompleteQuoteItems` (or the send-block predicate) to validate `serviceCards` pricing too, consistent with the panel-row completeness rule (factor the rule — dual-consumer per CLAUDE.md). *(source: Coach C150, 2026-07-13; via Freddy.)*
- **B042 — "Duplicate project docs — two Firestore docs share one bcProjectNumber (arc-<hash> draft + real short-id)"** [OPEN · MED · data hygiene] — while healing B040, found that PRJ402131 AND PRJ402126 each have TWO docs in `companies/{cid}/projects`: an older `arc-<hash>` copy (never-sent, status draft — e.g. `arc-599981ab…` for 402131, `arc-bbf1a3c7…` for 402126) AND the real sent short-id doc (`opk30Xqh…`, `qgXWaILM…`). Duplicate project docs sharing a bcProjectNumber = data-hygiene risk (board confusion, wrong-doc writes, sync ambiguity). Investigate: how they arose (copy? BC-sync creating a second doc? import?), whether it's widespread (scan for dup bcProjectNumber across the collection), and a cleanup (archive/delete the orphan drafts after confirming they hold no unique data). **★ SIZED (prod scan, Freddy 2026-07-14): SYSTEMIC — 128 docs / 92 distinct PRJ / 36 duplicate groups (~40% of projects).** Every pair = one Firestore auto-id doc + one older `arc-<hash>` doc, same name/bcProjectNumber (arc-hash usually older/unsent; short-id often the live/sent one). NOT a loose-end — deleting project docs = data-safety. **★ Coach root-caused (2026-07-14):** `arc-<hash>` = BC auto-import (`syncBcProjects` @`:48242`, deterministic id from BC GUID → never >2); short-id = manual New Project (auto-id). **Defective dedup guard** (`:48238`): checks in-memory `ps` (not fresh Firestore) + only `bcProjectId` (not `bcProjectNumber`) → races (initial-load / manual-create window / multi-tab) write stub twins. **ONGOING** (still races). Canonical = manual short-id doc (has work); orphan = arc-hash stub (empty draft). No read-side dedup → renders TWO tiles + can split state via bcProjectNumber-keyed background syncs. **Jon chose (2026-07-14): fix-first + then verified cleanup.** **🔨 Marc building `b042-import-dedup-guard`** (fresh-read + dual-key `bcProjectId`+`bcProjectNumber` match + load-gated initial sync → stops new dups) → Coach → deploy. **✅✅ CLEANUP DONE (Jon go, 2026-07-14):** all 36 dup empty stubs verified (0 needed review) → archived to `companies/{cid}/projects_archive` (reason "B042 duplicate empty BC-import stub", `_b042KeepId` tag, restorable) → deleted. Verified: projects 128→92, remainingDupGroups=0, keepers intact. 46 remaining `arc-<hash>` = legit sole-copy BC-import projects (left as-is). **B042 RESOLVED** — guard fix (v1.23.21) stops new + 36 existing cleaned. (Note: `archiveProject` at `:9981` only COPIES to `projects_archive`; delete is separate + client-allowed via `canWrite` rule.) *(source: Freddy B040-heal + Coach root-cause, executed 2026-07-14.)*
- **B041 — "Rev bumps on the 'Verify & Enable Edits' unlock click, before any content edit (Rule-2 deviation)"** [OPEN · MED · diagnosing] — B034 live-test (Jon, prod v1.23.17): after SEND (correctly stays Quotes Sent — regression fixed ✓), clicking **"Verify with Project Owner & Enable Edits"** bumped the rev N→N+1 + flipped to IN PROCESS **before** the user made any edit. Per Jon's spec Rule 2 ("unlock → no change → re-lock = rev UNCHANGED"), the bump must fire on the first genuine CONTENT edit, not on the unlock/ack itself (else unlocking just to view/print wrongly bumps + re-diverges). **🔎 Coach tracing** what save/hash-change fires on ack — prime suspect **F020 `_seedQuoteTermDefaults`** (mount-seed of quote terms when the panel becomes editable on a non-BC project → changes `project.quote` → hash differs → save bumps) or an `ensureQuoteFieldsPopulated`/save-on-edit-enter. Fix: bump only on a genuine user content edit; a seed/populate must not bump a sent quote. **★ Coach root-caused:** the ack click fires NO save — the bump comes from a background/programmatic save coinciding with unlock (unmasked by the B034 send-anchor fix removing post-send suppression). **Jon chose: guard ALL background saves.** **✅ Marc BUILT + Coach APPROVE WITH NITS** → `b041-nobump-background-saves` (`f7871ed7`): `_noBumpWrite` transient flag on every programmatic save (stripped pre-hash/persist, kept out of React state); enumeration independently verified COMPLETE (no missed programmatic-hashed save, no mis-flagged user-edit → Rule 3 intact); print/send + extraction/pricing correctly untouched. **Nit → Jon ratify:** budgetary-auto-clear on a sent quote = no-bump (policy). **✅ DEPLOY-READY.** ★ Live-proven by the B040 heal: background bumps are exactly what put 7 sent quotes into In Process → B041 prevents recurrence. *(source: Jon 2026-07-14 B034 re-test, via Freddy; Coach C-note.)*
- **B040 — "Sent projects stuck in IN PROCESS (should be QUOTES SENT) — B034 regression-window casualties"** [OPEN · MED · self-heal building] — projects SENT during the B034 premature-bump window (2026-07-13 ~12:36–13:42 MDT, v1.23.14→v1.23.16) persisted `quoteRev = quoteSentRev+1` → `computeProjectEffectiveStatus` (`:16375`) returns `in_progress` → they sit in the IN PROCESS column instead of QUOTES SENT. Data intact; cosmetic/workflow only. v1.23.16 fix prevents NEW cases; these existing ones need correction. **Jon chose (2026-07-13): self-heal migration** (no customer re-email). **🔨 Marc building `b040-inprocess-selfheal`:** one-time guarded re-anchor in `loadProjects` — IF `quoteSentAt` in-window (start −5min buffer, END TIGHT) AND `quoteRev===quoteSentRev+1` AND no post-send qvHistory edit → set `quoteSentRev=quoteRevAtPrint=quoteRev`, persist once (idempotent). Tightly guarded → never touches a legit revision. Money-path/data-migration → Coach review before deploy. **🛑 Coach CHANGES REQUIRED on the auto-migration (`8a8fabf8`): NOT SAFE as an auto-fix.** Root: `quoteRev` bumps off `_computeQuoteHash`, but MANY edit types (service-card, markup, labor, ship-date, isBudgetary, drawing, quote-terms) bump the rev with NO qvHistory entry → a genuinely-edited window quote is INDISTINGUISHABLE from a pure casualty in stored data (both land rev===sentRev+1, no history; no send-time hash to compare). Auto-heal could re-anchor a legit revision → hide a real divergence (violates Jon's rule). **Auto-migration branch SHELVED (not deploying).** **Jon chose (2026-07-14): TARGETED verify-and-heal** — enumerate window-sent projects (rev===sentRev+1), confirm per-project (with owner knowledge) that it wasn't edited after send, then re-anchor ONLY confirmed pure casualties via a 2-field `.update({quoteSentRev,quoteRevAtPrint})`, verifying window+rev+1 before each write + showing before/after. **✅✅ REMEDIATED via TARGETED HEAL (Freddy, 2026-07-14, controlled-tab):** enumerated all 17 sent quotes; found 7 casualties (sent + `quoteRev>quoteSentRev` + no post-send qvHistory user-edit + not won/lost), Jon-confirmed none genuinely revised, re-anchored `quoteSentRev=quoteRevAtPrint=quoteRev` via targeted 2-field `.update()`: **PRJ402131 Messabi, PRJ402126 Longonjo Analyzer, PRJ402106, PRJ402109, PRJ402092, PRJ402119, PRJ402137** → all flip to firm/budgetary_sent (QUOTES SENT); 402137 stays Draft (own status). **★ Key finding:** the divergence was NOT the B040 send-window bug for most — it's **B041 background-save bumps accumulated over time** (e.g. 402126 sent 06-30, drifted 2→4). So B040-window auto-heal would've MISSED these; targeted heal + B041 fix (prevents recurrence) is the correct combo. Separate: sent quotes WITH post-send edits left untouched (likely legit revisions — Jon to review); **duplicate `arc-<hash>` draft docs found → B042.** Auto-migration branch `b040-inprocess-selfheal` stays shelved. Lesson: qvHistory is NOT the SSOT for "content changed" — `_computeQuoteHash` is (COACH.md). *(source: Jon 2026-07-13/14; Coach diagnosis + CHANGES-REQUIRED, via Freddy.)*
- **G012 — "Sent-quote status message: 'Quote sent Qv## to <recipient>' (was 'Rev NN')"** [OPEN · LOW · building] — the status line above the "Customer has received this Quote" overlay reads "Rev 02"; Jon wants **"Quote sent Qv<sentRev> to <recipient email>"** (e.g. "Quote sent Qv02 to jon@matrixpci.com") using `quoteSentRev` + `quoteSentTo`, matching the Qv pill format. **✅ Marc BUILT** `sent-quote-status-wording` (`19864769`): renders `✓ Quote sent Qv.02 to jon@matrixpci.com · Jul 14, 25` (canonical Qv.NN dot format, null-safe recipient, kept ✓+date). **Jon confirmed wording "as built" (2026-07-14).** **✅✅ SHIPPED TO PROD v1.23.18** (2026-07-14, release `8c537674`; with B038+F022). *(source: Jon 2026-07-14 B034 re-test comment, via Freddy.)*
- **G011 — "Owner is view-only on their own SENT quotes (sent-quote soft-block applies to owner) — consider owner exemption"** [OPEN · LOW · design consideration — NOT a bug] — Jon (2026-07-13) found PRJ402131/402126 (owned, sent) open View Only. **Working as designed:** `_sentSoftBlockActive` (`:37261`) = `quoteSentAt && !ack && !(wonAt||lostAt)` makes ANY sent quote read-only until the user clicks "Verify with Project Owner & Enable Edits" (predates B034, v1.19.745; no owner exemption). Resolution today = click Verify to edit. **Open design Q (Jon to decide if desired):** should the OWNER (or admin) be exempt from the sent-quote soft-block / get a lighter affordance? Relates to F013 (reviewer/owner control). Not built — captured pending Jon's call. *(source: Jon 2026-07-13; Coach enumeration, via Freddy.)*
- **B039 — "B038 retry signature too broad — Internal_DataNotFoundFilter alone triggers futile retries + misleading message"** [OPEN · LOW · follow-up to B038] — the B038 transient-retry match (`app.jsx:~5264`) uses `/Internal_DataNotFoundFilter/i || /No\.:\s*''/`, so the generic BC "record not found by filter" code ALONE is sufficient. A create failing for a different reason (e.g. bad `itemCategoryCode`/`baseUnitOfMeasureCode` ref) would surface that code → 3 futile retries (~2.4s) + the misleading "numbering series busy" friendly message. NOT a data/dup risk (adopt finds nothing → friendly error; raw logged). Fix: require the `No.: ''` half (AND the two, or key only on empty-No.). *(source: Coach C-note on B038 review, 2026-07-13/14.)*
- **B038 — "'Create In BC' (new item) fails with empty item No. — Internal_DataNotFoundFilter (No.: '')"** [OPEN · HIGH · LIVE prod · diagnosing] — Ryan (prod, 2026-07-13) adds a NEW item and clicks "Create In BC" → `Failed to create item: {"error":{"code":"Internal_DataNotFoundFilter","message":"There is no Item within the filter. Filters: No.: '' CorrelationId: 0991f07d-0fdc-4121-a143-0b953b3d6a56"}}`. BC received an EMPTY item `No.` in a filter/lookup during the create flow. Likely a blank part-number field (missing input-guard) OR a field not populating BC's `No.`. NOT obviously from today's deploys (F021 project-create / PoReceivedModal, F022 in-progress, B034 quote-save don't touch item-create). **★ Coach DIAGNOSED (confident, 2026-07-13):** ROOT = a **BC-side No.-Series config/exhaustion condition, NOT an ARC bug or today's-deploy regression.** `bcCreateItem` (`app.jsx:5222`) **intentionally omits `body.number`** (the `#163` surrogate scheme, shipped v1.21.0 `43ab7b14` — avoids the >20-char PN truncation bug) and relies on BC's No.-Series to auto-assign the item `No.`; the typed PN goes to `Vendor_Item_No` (`:5278`). Ryan's input was FINE (the "Create in BC" button `:23081` is disabled unless `createNumber.trim()` non-empty). BC's auto-numbering isn't firing → `No.=''` → `Internal_DataNotFoundFilter`. **✅ IMMEDIATE UNBLOCK (BC admin, no deploy):** BC → Inventory Setup → Item Nos. → ensure a No. Series is assigned with **Default Nos.=Yes** and NOT exhausted (current No. < Ending No.; extend Ending No. / add series line if capped). **Residual code gap → hardening (do NOT revert the surrogate scheme):** `bcCreateItem` `:5259-5264` relays BC's raw error; map the `Internal_DataNotFoundFilter`/`No.: ''` signature to a clear message ("BC couldn't auto-assign an item number — check Inventory Setup → Item Nos."). **★ UPDATE (Jon, 2026-07-13): retrying the SAME create in Ryan's login WORKED the 2nd time, no BC change** → the failure is **TRANSIENT** (BC auto-numbering hiccup), NOT hard No.-Series exhaustion/Default-Nos-off (those wouldn't self-heal on retry). So the config fix is likely moot (glance only if it recurs). **Real gap = ARC has NO resilience for the transient** — `bcCreateItem` throws the raw error instead of retrying (a retry succeeds). **Proposed fix:** auto-retry `bcCreateItem` on the `Internal_DataNotFoundFilter`/empty-`No.` signature (1–2x w/ small backoff) so it's seamless + friendly-error fallback if it still fails — WITH an **idempotency check** (verify the failed first POST didn't leave a partial/orphan item before retrying, to avoid duplicates). Do NOT revert the surrogate scheme. **Jon chose (2026-07-13): auto-retry + friendly fallback.** **✅✅ SHIPPED TO PROD v1.23.18** (2026-07-14, release `8c537674`; with F022+G012). Auto-retry (2x, backoff) on the transient empty-No. signature + adopt-existing-by-Vendor_Item_No (no dup) + friendly fallback; Coach APPROVE WITH NITS (dup risk nil). B039 (regex-tighten) follow-up open. **🔨 Marc built `b038-item-create-retry`:** retry `bcCreateItem` on the `Internal_DataNotFoundFilter`/empty-No. signature (2x + backoff) + idempotency guard (GET by `Vendor_Item_No` → adopt existing item, never dup) + friendly fallback message; surrogate scheme UNCHANGED. → Coach review → Jon deploy. *(source: Jon relaying Ryan, prod 2026-07-13; Coach diagnosis + Jon retry-works update, via Freddy.)* [OPEN · LOW · follow-up to F021] — the inline-editable Customer Project # in the project header (F021-2, `PanelListView` ~`:35349`) does a best-effort `bcPatchJobOData(...).catch(()=>{})` with NO `bcEnqueue` (mirrors the sibling customer-name edit) → if edited while BC is offline/failing, ARC persists the value to Firestore but BC's `External_Document_No` stays stale with no retry until the next connected create/PO/edit. LOW (write-only field, ARC always correct, self-heals). Jon chose (2026-07-13) to ship F021 best-effort + track this. Fix: add `bcEnqueue('patchJob',{projectNumber,fields:{External_Document_No:_composeExternalDocNo(upd)}},...)` on the offline branch (mirror `PoReceivedModal`). *(source: Coach C-note on F021 review, 2026-07-13; Jon deferred.)*
- **B036 — "quoteSentRev/quoteSentAt/quoteSentTo not in saveProject's server-field preserve-guards (now load-bearing after B034)"** [OPEN · MED · follow-up to B034] — `saveProject`'s server-read preserve-guards (the same pattern that protects `ownerTakeoverActive`/`reviewNotes`/`storageUrl`) do NOT include `quoteSentRev`/`quoteSentAt`/`quoteSentTo`. Pre-existing, but B034 makes these fields **load-bearing** (they now drive the rev-bump cap, the In-Process status flip, and the divergence unlock) → a stale-client full-doc `set()` could wipe them and silently break the revision/divergence logic. Fix: add the three `quoteSent*` fields to `saveProject`'s preserve-guard list (carry server value when the incoming write omits them). *(source: Coach C-note on B034/F005 review, 2026-07-13; via Freddy.)*
- **B034 — "Editing a SENT quote doesn't bump the revision (Qv.##) — current quote can silently diverge from what the customer received"** [OPEN · HIGH · scoping] — Jon (2026-07-13): making changes to a quote that has already been sent does NOT increment the Qv.## revision. Any change to a quote after it's been sent should bump the Qv.## so the revision reflects that the current quote differs from the sent one (quote-integrity: otherwise the live quote silently diverges from the customer's copy with the same revision number). **Scoping via Coach** (2026-07-13): trace the revision model (`quoteRev`/`quote.number`/`qvHistory[]`/`Qv.`), where/when it bumps today (send? print? never on edit?), the sent-state marker, the change surfaces that should trigger a bump + whether there's a single save choke point to centralize it, and the exact reason a post-send edit doesn't bump. Likely-correct model to confirm: **first change after a send → bump Qv + mark "unsent revision"** (an unsent-revision pill may already exist), further edits within that revision don't keep incrementing — vs Jon's literal "any change bumps" (flag per-keystroke noise). Relates to #193 (`qvHistory` writes), F006 (per-send snapshots), B033 (services-only quotes now reach Send). **★ Coach scoped (2026-07-13, C149):** ROOT = the bump gate + "unsent revision" pill are anchored to the last PRINT (`quoteRevAtPrint`); SEND (`quoteSentRev`) never participates. Bump logic already exists + is centralized in TWO save choke points (`saveProject` @`:9262-9290`, `saveProjectPanel` @`:9539-9556`), content-hash driven, capped to one bump per print cycle. Because send never advances the cap, a sent/edited quote's `Qv.##` stays stuck (`Qv.01` forever for send-only-never-print users). **FIX (Coach Option A):** factor one predicate `_lastDeliveredRev(p)=max(quoteRevAtPrint,quoteSentRev)` + `_hasUnsentRevision(p)=quoteRev>_lastDeliveredRev(p)`, route the two bump gates + two pills (`:20662`,`:36088`) + the warn (`checkQuoteRevWarn` @`:47787`) through it. No new field/schema (send handlers @`:33607`/`:39409` already write `quoteSentRev`); data-retention safe; **minor** bump. **Jon chose (2026-07-13): "first change after send bumps"** (once per revision, not per-keystroke) — Option A, retaining PRINT as a reset point too (dropping it would leave the same divergence bug on the print path). **Rejected:** literal "every change bumps" (recreates the v1.19.911 Rev-293 runaway; per-change detail belongs in `qvHistory[]`). **STATUS: build QUEUED behind B033 deploy** — B034 edits the unsent-pill @`:36088`, which sits inside B033's refactored quote-summary region (`b033-services-quote-pane`); build on the post-B033 master to avoid a collision. Build-time verify: service-card edits (B033/services-only) persist into the hashed `project.quote` shape so they trigger a bump. **★★ ESCALATED → ASAP + AUTHORITATIVE SPEC (Jon 2026-07-13, supersedes the C149 print-anchored model):** Jon diagnosed the root as a **phantom-"save" gate** — a modal says "Rev will bump on next save," but users never click "save"; saving is implicit (on change + on send) → the bump trigger never fires. **Jon's lock-centric state-machine spec (authoritative):** (1) a SENT quote is **locked** → its Rev is **frozen** (no bumps while locked); (2) **unlock → no changes → re-lock = Rev UNCHANGED**; (3) **unlock → ANY change (any way) → Rev bumps IMMEDIATELY** + the quote returns to **"active"** status until re-sent to the customer; (4) **on the first change-attempt after unlocking a quote that HAS a send history → a warning modal:** *"This Quote has been sent to the customer. Making changes will cause the Customer copy and internal copy to be different. Do you wish to continue making changes to this Quote?"* (continue/cancel gate). So the bump is keyed on the **lock/send state machine + the actual change event**, NOT a "save" click and NOT the print cap. This reconciles with C149's choke points (bump still lands in `saveProject`/`saveProjectPanel`, which fire on change) but changes the GATE: frozen-while-locked; bump once on first post-unlock change; status→active; divergence-warning modal. **★ Bundle with F005** (Print-Only in the locked overlay — Coach scoping) — same lock/rev/print area. **★★ Coach authoritative re-scope DONE (supersedes C149):** ROOT confirmed = bump cap `quoteRev>quoteRevAtPrint` (last PRINT) + SEND never stamps `quoteRevAtPrint` → after send the quote is already "ahead of print" → first post-unlock edit hits the SUPPRESS branch → never bumps. **Rules 1/2 already satisfied** (locked=read-only=no save; unlock=session-state only, no bump); found a **DEAD "Unlock" modal** (@`:36867`, bumps `quoteRev+1` on unlock — would break Rule 2 if wired, zero callers → delete). **Rule 3 = the real fix; Rule 4 = reword existing modal.** **FIX (one branch, B034+F005, B034 first):** (A) re-anchor both bump caps (`saveProject` @`:9298`, `saveProjectPanel` @`:9575`) on `max(quoteRevAtPrint, quoteSentRev||0)` — never-sent cadence byte-identical (guard: `quoteSentRev||0`=0); (B) `computeProjectEffectiveStatus` @`:16303` → diverged sent-quote (`quoteRev>quoteSentRev`) resolves to **`in_progress` ("In Process" — Jon's choice 2026-07-13)**; (C) on the divergence bump set `quoteLocked=false` (re-arm active); (D) reword `SentQuoteEditConfirm` @`:20122` to Jon's exact text + drop the "next save" banner @`:36625`; (E) OR-in `quoteRev>quoteSentRev` on the unsent pills @`:20721`/`:36159`/`:36566`; (F) delete the dead unlock modal. **F005:** "🖨 Print Only" button in the locked banner @`:36610` → no-bump PDF (skip the `quoteRevAtPrint` stamp @`:37068`), reuses quote #. No schema bump; data-retention safe (quoteSent* preserved as history). Money-path-adjacent → Coach re-review + live-test cycle before deploy. **✅✅ SHIPPED TO PROD v1.23.14** (2026-07-13, release `d6ddbd3e`; with F005 + F021 in one release). Coach money-path APPROVE; F1 (print-only pre-print-save bump/unlock hole) + F2 (pill on never-sent) fixed pre-merge. **🚨 REGRESSION (Jon live-test v1.23.15) → FIXING FORWARD (Jon chose 2026-07-13):** sent-quote divergence path inert — no bump on edit; every send falsely flips to In-Process/unsent/unlocked. ROOT (Coach) = the SEND flow's own `ensureQuoteFieldsPopulated`/`ensureQuoteNumber` persists bump `quoteRev` (quote is in `_computeQuoteHash`) BEFORE `quoteSentRev` is stamped from the STALE pre-populate rev → quote lands `quoteRev>quoteSentRev` = falsely diverged at send → first real edit suppressed by the cap. **FIX (Marc `b034-send-anchor-fix`):** stamp `quoteSentRev`/`quoteRevAtPrint` from the FINAL post-populate `quoteRev` (SEND = anchor not trigger) in BOTH send paths (`QuoteSendModal.handleSend` ~`:33604-33734`, ProjectView inline ~`:39594-39621`); post-send invariant = `quoteSentRev==quoteRev`, locked, NOT In-Process; + shared `_sentSoftBlockActive` predicate (SSOT gap: banner `:36698` omits `!isProjectLocked` vs `sentReadOnly` `:37777`); + modal-path verify. Never-sent unchanged. Money-path → Coach re-review + live re-test before redeploy. F005 + F021 unaffected (stay live). **✅✅ FIX SHIPPED TO PROD v1.23.16** (2026-07-13, release `9bd2db4d`): `_sendAnchorWrite` guard + Firestore read-back stamp all 3 anchors equal at send; shared `_sentSoftBlockActive` SSOT predicate. Coach money-path APPROVE WITH NITS (all 4 invariants confirmed; nits cosmetic/pre-existing). Regression CLOSED. **⏳ Jon re-test on prod:** send→Locked/not-In-Process; Verify→modal→edit→bump+In-Process; never-sent unchanged. **Follow-up:** delete dead `_doInlineQuoteSend` (separate ticket). *(source: Jon 2026-07-13 ASAP + regression, via Freddy; Coach authoritative scope + regression trace, supersedes C149.)*
- **B024 — "Reviewer-assignment notification fails silently (brittle BC-email resolution, not the assigned uid)"** [OPEN · MED] — on "Send for Review" (`app.jsx:34744`) the handler fires an in-app bell (`users/{designer}/notifications` type `pre_review` @34773) + a Graph email @34787 to the assignee — BUT gates the recipient on a FRAGILE resolution chain (designerEmail via `_arcSalespersonCache` by Name/Code → BC `/User` by designerCode → company-member FUZZY name match), NOT the assigned uid. If BC-designer→email resolution fails or the member email doesn't exactly/fuzzy-match → BOTH bell + email silently skipped → reviewer gets nothing (in PROD). FIX (Marc, Jon-endorsed): write the in-app bell to `users/{preReviewAssignedTo}/notifications` keyed off the ASSIGNED UID (independent of the BC-email chain); keep email best-effort on top. NOTE (Marc, corrects earlier "test masks it"): test-env suppresses emails + push, but the in-app BELL @34773 is a direct client write NOT `IS_TEST_ENV`-gated → Andrew's missing bell ON TEST is itself evidence of the resolution-chain failure, not env-masking. DECISIVE prod-verify: a real Send-for-Review assigning a teammate → does the assignee's bell badge? (no → confirmed prod bug). ⚠ open factual q: whether test suppresses the bell via some non-client mechanism (rules) — Jon to confirm or prod-verify settles it. Distinct from gap #4; NOT P1-blocking. *(source: Jon 2026-07-10 P1 re-test + Marc code trace; fix endorsed by Jon.)*
- **B025 — "Marked-for-review rows lose their checkbox + go RED after Send-for-Review (should stay YELLOW 'in review')"** [OPEN · MED] — after a user checks rows for tech review (F003 design: row → bright YELLOW "in review", locked on send) and submits, the marked rows LOST their checkboxes and reverted to RED (the base `_isBomRowFlaggedRed` state) instead of staying YELLOW. Jon: checked-for-review rows should stay YELLOW (in-review indicator) even though the user can't edit. Investigate: the yellow in-review overlay not persisting/rendering post-submit (base red shows through)? ★ **Marc to determine REGRESSION-vs-pre-existing:** if caused by the recent review/lease changes (Fix B / gap #3 / gap #4 touched review code) → P1-relevant, fix before ship; if pre-existing → separate. ★ **MARC VERDICT (2026-07-10): PRE-EXISTING, NOT a P1 regression → does NOT block the ship.** Decisive: the full P1 diff (`adb13dad..93607beb`) has ZERO hunks in B025's paths (row-color ternary ~29124, TR-toggle ~29172, checkbox render ~29246, submit handler ~34744; grep techReviewFlag/preReviewStatus in P1 diff = none). ROOT (best trace): the Send-for-Review submit @34744 writes ONLY reviewFields (not bom/techReviewFlag) → server bom keeps the flags; RED+no-checkbox = techReviewFlag missing in RENDERED state → likely the submit's `onUpdate({...project,...reviewFields})` merges onto a STALE local `project` snapshot whose bom lacks the just-checked flags. DECISIVE artifact: RELOAD after send → rows return YELLOW? YES=stale-local-onUpdate (fix: merge onto latest projectRef/bom); NO=flag-persistence (cross-ref B009). Jon's spec: on submit, TR checkboxes go INACTIVE (not disappear), row colors STAY. Fast-follow. *(source: Jon 2026-07-10 P1 re-test; Marc diagnosis.)*
- **B022 — "Login 'Continue with Microsoft' misleads existing users (account-setup-only path)"** [OPEN · MED] — the sign-in screen's "Continue with Microsoft" button is only for NEW-account setup, but existing/already-setup users click it expecting to log in → wrong path. Fix: relabel/reposition so an already-setup user sees a clear plain "log in" path distinct from new-account Microsoft setup. *(source: Jon 2026-07-09, via Intake.)*
- **B023 — "Quote Summary line-row overflow clips the total price (long status pill)"** [OPEN · LOW — cosmetic] — in QUOTE SUMMARY a panel-summary row's status text (e.g. "IN PRE-REVIEW") is too long → pushes the total price out of the row box (price clipped at the right edge; Jon screenshot). Jon's suggested fix: truncate "IN PRE-REVIEW" → "IN ETR" (Engineering Technical Review); also add min-width/ellipsis so any long status can't clip the price. Pill wording ties to F003 Tech-Review. *(source: Jon 2026-07-10, via Intake.)*
- **B021 — "BC fetch has no timeout/abort → a stalled BC request freezes the pricing phase (95%) AND can deadlock the bcGatedFetch semaphore (all BC calls hang)"** [OPEN · MED] — extraction freezes indefinitely at 95% "…pricing" (and worse) when a BC request stalls (connection opens, no response — a black-hole, not a 4xx). ROOT (Marc, code-confirmed): `bcGatedFetch` (`app.jsx:419`) — the single choke point ALL BC calls route through — has **NO timeout / NO AbortController**; it `await fetch()` with only whatever signal the caller passes (pricing-phase BC calls pass none). Two failure modes from one hung request: **(1)** the awaiting pricing phase (Phase 1 PurchasePrices, Phase 5 vendor-backfill loop, etc.) hangs FOREVER → no error, no advance, `bgDone` (`:15348`) never fires → frozen at 95%; **(2) WORSE** — `bcGatedFetch` only `_bcRelease()`s on a settled/thrown response (`:440/445/452`), so a hung fetch NEVER releases its `_bcSemaphore` slot → enough hung calls fill `_bcSemaphore.max` → the `while(inflight>=max)` gate (`:432-434`) backs up → EVERY subsequent BC call queues forever = **total BC deadlock**. PRJ402063's heavy on-open BC churn (B016) + the BC 400 storm is exactly the load to wedge it. PRE-EXISTING + **prod-relevant** (`bcGatedFetch` is prod code); NOT P1/lease (a hang ≠ a rejection; zero permission-denied). Distinct from B013 (401/token = server RESPONDS with an error) — sibling in the BC-reliability family (cross-ref B013/B016). FIX DIRECTION (later): add an AbortController timeout (~30–60s) in `bcGatedFetch` that aborts the fetch AND releases the semaphore in a `finally` → a hung request errors-through (phase proceeds/logs) instead of freezing — single-point fix across the whole BC surface (one-choke-point principle). Confirmed-mechanism / plausible-cause for the 2026-07-09 PRJ402063 95% freeze (a hang logs nothing → not pinned to one request; Jon reloaded before Network-pending capture). Distinct from B019 (cosmetic bounce; this is a real hang). *(source: Jon P1 matrix + Marc code trace, 2026-07-09.)*
- **B019 — "Extraction progress bar bounces (non-monotonic) during BOM extraction"** [OPEN · LOW — cosmetic] — during extraction the progress bar jumps back and forth (observed ~20%→90%→30%→80%→40%→settles) instead of advancing monotonically (Jon, matrix-arc-test re-extract, 2026-07-09). ROOT (Freddy read): `useSmoothProgress` (`src/app.jsx:128`) mixes a TIME-BASED smooth fill toward ~90% (`:142`) with REAL progress checkpoints that jump the bar (`update`/`set` @ `:174`); when a real checkpoint reports a LOWER % than the time-estimate has already reached, the bar snaps BACKWARD — repeating until real progress overtakes the estimate, then settles. FIX DIRECTION (not built): make progress MONOTONIC — clamp so neither the smooth fill nor a checkpoint ever decreases the displayed value (`Math.max` with prior), or reconcile the time-estimate against real checkpoints so the fill can't overshoot. Cosmetic only — no data/functional impact. *(source: Jon 2026-07-09, via Freddy; deferred behind B012 P1.)*
- **B020 — "BC Purchase Price Updates modal re-prompts on every project open"** [OPEN · MED] — opening a project (PRJ402087, 3× in a row, 2026-07-09) re-fires the "💲 BC Purchase Price Updates" modal every time for the same item(s), even after accepting/dismissing. CODE (`PurchasePriceCheckModal` @`19944`; trigger + handlers @`37080`-`37179`): on open (+30s poll) it diffs BOM price vs BC PurchasePrices (>1% AND >$0.10, BC date newer), SKIPPING rows dismissed at the same BC state (`bcPriceCheckDismissed` @`37106`-`37107`). Accept (`applyPriceCheckDiffs` @37128) sets row→BC price + persists; Dismiss (`dismissPriceCheckDiffs` @37156) stamps `bcPriceCheckDismissed` + persists. Both persist via `safeSave` → re-prompting means the choice isn't sticking. TWO candidate roots: **(1)** the persist is FIRE-AND-FORGET (`safeSave(...).catch(warn)` @`37149`/`37177`) → lost/clobbered under the heavy on-open BC churn (whole-doc save, no merge) → dismissal never survives = **B016/B012 family**; **(2)** the skip check uses STRICT equality `dism.bcDate===bcDateMs` @`37107` → if BC's `startingDate` differs in type/format across fetches, a persisted dismissal never matches → re-prompts forever. DECISIVE TEST (DevTools open): click **Accept** once — if it STILL re-prompts → root #1 (save not persisting); if Accept stops it but Dismiss doesn't → root #2 (date-match bug); watch for `[BC] Price-check … save failed`. *(source: Jon PRJ402087, 2026-07-09; Freddy read; cross-ref B016/B012.)*
- **B010 — "Manual 'Upload Supplier Quote' throws on drop (undefined field → Firestore reject)"** [RESOLVED — shipped v1.23.1, 2026-07-07 · release `6e82ea5e` (fix `b3f79473`)] — manual upload crashed on drop (`Unsupported field value: undefined` → import aborted). FIX: `_nullifyUndefined` helper + `??null` coercions in both BC-match branches + belt on the @31669 update payload (undefined→null, no field removal/rename — data-retention preserved). Re-test PASSED live (Jon, PRJ402096: drop → no crash → price-review UI; runtime artifact); Coach-approved data-safe; prod-verified probe-free.
- **B011 — "Harden other supplierQuotes update sites vs undefined fields (same class as B010)"** [Backlog] — the undefined-field Firestore-reject risk B010 fixes at `saveAndMatch` @31669 also lurks at other `supplierQuotes` update sites: **31270 / 31306 / 31619 / 31966 / 32109**. The new module helper `_nullifyUndefined` (recursive undefined→null, added in B010) is available to harden them. Proactive/latent — do before those paths hit an undefined in the wild. **⚠ CAVEAT (Coach B010 review): `_nullifyUndefined` rebuilds any NON-plain object (Date/Map/class instance) as a plain object → would CORRUPT it. Safe on plain line-item data; before reusing it at a site whose payload may carry Date/typed instances, guard the type or use a shallow/typed strip instead.** *(source: Marc B010 follow-up + Coach caveat, 2026-07-07.)* — manual Upload Supplier Quote crashes on file drop: `DocumentReference.update() … Unsupported field value: undefined (supplierQuotes/<id>)` → import aborts, never reaches review (reproduced 2× on test). ROOT CAUSE (Marc, `docs/B009-MARC-REPRO-NOTES.md` 01c2d951): `saveAndMatch` @31669 `update({lineItems:matched,…})` — the BC-match branches (31664 / 31658-60) write `bc.id`/`bc.displayName`/`bc.unitCost` onto line items; any is `undefined` when the BC item lacks it → Firestore rejects. FIX (data-safe, small, GATED): coerce those to null/'' (`bc.unitCost??null` etc.) and/or strip-undefined before the @31669 update. *(source: Marc B009 repro, 2026-07-07; Jon routed to Freddy.)*
- **B001 — "Auth redirect URI carries a trailing dot"** [RESOLVED — shipped v1.23.2, 2026-07-07 · release `9d89f26b` · quick-win batch] — a trailing-dot ARC URL (`matrix-arc.web.app.`) makes `window.location.origin` carry the dot into the OAuth redirect URI → Azure AADSTS50011 redirect-mismatch → BC/Microsoft sign-in fails cryptically. NOT a code bug (URL-entry artifact; clean-reload at the no-dot URL fixes it — confirmed live 2026-07-02). Hardening: strip a trailing dot from the origin when building the auth redirect URI. *(source: Jon 2026-07-02, resolved live.)*
- **B002 — "Approved-state TR block message names an absent button"** [RESOLVED — shipped v1.23.2, 2026-07-07 · release `9d89f26b` · quick-win batch] — on a post-approval re-arm (#199 Tech-Review), the send-block message says "Click Send for Technical Review" but that button isn't rendered in the approved state (reviewer per-row Resolve still works — NO hard dead-end). Fix: state-aware block message when approved ("have an engineer Resolve the flagged line(s)"), or a re-submit affordance by the approved banner. *(source: Coach #199 P3 verify, 2026-07-02.)*
- **B003 — "Supplier RFQ 'Apply' modal shows a noise not-quoted list"** [RESOLVED — shipped v1.23.2, 2026-07-07 · release `9d89f26b` · quick-win batch] — **SCOPE CLARIFIED (Jon, 2026-07-07): NOT the "Review Supplier Quote" modal.** It's the **Supplier RFQ "Apply" modal** — there's a box at the BOTTOM listing parts that were NOT quoted (because they belong to OTHER suppliers). It's just noise; no need to display it. **Fix = remove/hide that bottom not-quoted list.** **LOCATION CONFIRMED (Jon, 2026-07-07):** app.jsx:39065 — the `"{unmatchedBom.length} BOM items not quoted by supplier:"` table, inside the modal with the **"Apply N Items to BOM"** button. (Naming reconciled: Jon's "Apply modal" = the code's internal `quoteReview` / "Review Supplier Quote" modal — same screen, named for its Apply button. The earlier "not the Review modal" exclusion was the naming mismatch, not a different screen.) *(source: Jon 2026-07-02, rescoped + location-confirmed via Intake 2026-07-07.)*
- **B004 — "Portal Apply save is unawaited → reload-race"** [RESOLVED — `41824f6c`, shipped v1.21.25] — `doApplyPortalPrices` persisted via a fire-and-forget `safeSave`, so an immediate post-apply reload could beat the write and revert cross+flag+prices together. Fix: `await safeSave` @app.jsx:38302. Pre-existing since v1.19.722 (affects all portal-apply data, not #199-specific); surfaced during the #199 live pass, fixed + Coach-signed-off (`41ddfc28`), shipped with #199. *(source: Coach #199 persist verify, 2026-07-03.)*
- **B005 — "Resolved TR row can't be manually re-armed"** [Backlog · LOW] — a resolved Tech-Review row's checkbox is read-only, so a purely manual PN edit doesn't re-arm review and it can't be manually re-flagged. Outside the supplier-substitution risk TR targets (a supplier re-cross DOES auto-re-arm @38978); defer to broader TR-tuning. *(source: Coach #199 live pass, 2026-07-03.)*
- **B006 — "Scan Results 'concern' window is persistent with no relevant data"** [RESOLVED — shipped v1.22.2, 2026-07-06 · release `5cb5c392` (build `ab7c2309`)] — the `ScanResultsBanner` (app.jsx:23117) already hides at 0 concerns but was dominated by benign auto-fixed INFO concerns (OCR-merged / audit-corrected / auto-retry), so a clean scan still showed the bar. FIX: added a **"Dismiss" ✕** — option B (per-project dismiss-by-report): ✕ persists the dismissed report's identity + save; a NEW extraction auto-resurfaces it. *(source: Jon 2026-07-06.)*
- **B007 — "TR checkbox reads dim/grey, not bright white (post-v1.22.2)"** [RESOLVED — shipped v1.22.3, 2026-07-06 · release `9bb6388b` (fix `004ac95a`)] — the white fill was correct; root cause = the **0.5 label opacity on unflagged rows** (`opacity:_trFlagged?1:0.5`) made the white checkbox read dim/grey. FIX: dropped that opacity → TR checkbox full-opacity white in both flag states (flag state still shown by checked + yellow row). Reversed the faint-vs-full call from v1.22.2 sign-off. *(source: Jon 2026-07-06.)*
- **B009 — "Supplier-cross TR auto-stamp clears after a few seconds (reload/reprice race)"** [PARKED — NOT currently reproducible (v1.23.1); no fix built — the awaited-save (B004 @38406) prevents the hypothesized stale-input race; Jon "it's good" 2026-07-07. Belt plan HALTED (no active bug). Instrumentation kept on test for opportunistic capture. Cleanup COMPLETE + verified (2026-07-07): synthetic submissions DELETED (6/6); 11 crossed rows on **PRJ402096 (a REAL CUSTOMER project — NOT sandbox, near-miss → escalated G005 + [[feedback_confirm_throwaway_before_test_injection]])** RESTORED via the app's own onSaveImmediate/saveProject handler (guards intact, dry-run + Jon-confirmed), verified 11/11 after reload; legit prior cross on 1032264 CS preserved; no data lost. **2 residuals for Jon:** (i) row 3516000 `leadTimeSource` now reads "supplier" (value 21 NOT overwritten — synthetic was 7; likely just a source-label relabel) → re-price that row if the label wants correcting; (ii) **BC — CONFIRMED writes (correction: earlier "low-risk/blocked" call was WRONG).** The synthetic applies pushed test PURCHASE PRICES into Business Central for **2 confirmed items: B98110019 ($42) + 1032264 CS ($99.99), both today-dated**, plus 9 verify-only candidates. The price-writeback path is NOT vendor-gated the way the lead-time writeback is, so the unresolvable-vendor hard-reject did not block these. **UPDATE (Marc G005 Step-1, 2026-07-07) — likely SANDBOX, not prod BC:** those writes landed in `MATR_SndBx_01152026`, the env the TEST HOST auto-connects to (confirmed via the live "BC CONFIG loaded from Firestore: MATR_SndBx_01152026" log + item lookup returning the $42 synthetic). Name + auto-connect strongly indicate the ISOLATED SANDBOX. **⇒ softens the earlier "reached the real ERP": the B009 BC pollution is probably SANDBOX-ONLY (low severity — Jon's cleanup is optional/sandbox-scoped, NOT urgent prod-BC). PENDING: Jon confirms `MATR_SndBx_01152026` is isolated from the prod BC company.** The confirmed real harm remains the shared-FIRESTORE side (real customer project PRJ402096, restored). → see G005.] — LIVE OBS (Jon, 2026-07-07, prod v1.22.3): uploaded 4 supplier quotes → BOM imported the supplier crosses correctly + auto-stamped the TR checkmark on crossed rows (#199 @38978) → after a few seconds the TR checkboxes CLEARED automatically, rows stayed red. Suspected race on refresh. STRONG echo of **B004** (portal-Apply unawaited-save reload-race, "fixed" `await safeSave` @38302, v1.21.25) — either B004's fix didn't cover the supplier-UPLOAD/auto-stamp path, or a distinct reprice/reload reverts the flag before it persists. Note **F003** (role-diff TR) is on prod (v1.22.0) — check interaction. INVESTIGATE (do NOT fix blind): Debug Logs first (`companies/{cid}/debugLogs`), reproduce + instrument the upload→auto-stamp→save/reload sequence, compare to the B004 fix path. *(source: Jon 2026-07-07, live.)*
  - **TRACE DONE (Coach, `docs/B009-COACH-TRACE.md`, tip 318639e5) — Analyst Review PASS.** MECHANISM = a background **REPRICE/second-save runs ~seconds post-apply and re-saves the BOM off rows that don't carry the flag.** `techReviewFlag` is referenced by ZERO pricing code → survives a reprice ONLY via `...row` spreads; a non-spread rebuild or a run seeded off a pre-stamp bom drops it. Crossed rows are left UNPRICED by the apply (price → supplier PN) → baits the "auto-reprice when a row lacks price" path (24810-11); the "few seconds" = the reprice's async BC/AI calls before its save lands. **HYP#1 (B004-style unawaited save on the apply path) REFUTED with proof** — apply spreads `...row` every branch + `await safeSave` (38393); B004 fix present+sufficient here. **HYP#3 (F003 clears it) REFUTED** — F003 has no clear path; the TELL: Jon saw **RED not YELLOW** (unresolved-TR renders yellow under C8 → red = flag genuinely GONE, a true clear). **FIX (post-repro, NOT another await):** harden `runPricingOnPanel`/the later writer to PRESERVE the 5 TR fields (`techReviewFlag/Source/Resolved/ResolvedBy/ResolvedAt`) on every emitted row per the CLAUDE.md metadata-preservation rule + no post-apply reprice off a pre-stamp snapshot. **AWAITING Marc live repro** (log the flag after stamp / after apply-save / on entry+exit of each runPricingOnPanel+safeSave in the seconds after) to prove ACTIVE + pin the exact clobbering writer before the fix.
  - **PREP-AUDIT (Coach §7, tip 50cc72a9) — refines the fix direction:** `runPricingOnPanel` is internally `...r`-CLEAN (every phase spreads `{...r}`; save `{...panelBase,bom}` @27726) → the flag is carried BY VALUE from the input. So the clobber is **STALE INPUT, not a non-spread rebuild**: `bom=bomOverride||panel.bom` (27176), `panelBase=panelOverride||panelRef.current` (27722) — a post-apply reprice seeded off a PRE-stamp `bomOverride`, or a lagging `panelRef`/prop, faithfully re-saves rows that never had the flag → overwrites the stamp (ref-lag race; fits "few seconds"). **⇒ the naive "add `...row` to runPricingOnPanel" fix would be a NO-OP.** Other post-apply writers mapped (no tunnel-vision): doApplyPortalPrices PRESERVES (proven); SQ onBomUpdate / applyPriceCheckDiffs low; recon-reprice = wrong trigger; `_markProjectBudgetaryForRedRows` writes pricing only (no bom rows) = safe. **FIX shapes (gated on Marc's writer-ID): (1) input-freshness** — seed any post-apply reprice from the post-stamp `projectRef`/`latestPanelRef`, not a captured `bomOverride`/lagging prop; **(2) belt** — save-time merge-preserve the 5 TR fields vs latest-persisted rows (mirror the cross-user `saveProject` guards) — robust vs ANY stale writer, aligns with the CLAUDE.md metadata-preservation rule. **Freddy lean: BOTH** (fix the root writer + the belt so a future stale writer can't re-introduce it).
  - **REPRO PATH (Marc, `docs/B009-MARC-REPRO-NOTES.md` 01c2d951):** the MANUAL upload path CANNOT repro B009 — the supplier-cross auto-stamp (`techReviewFlagSource:"supplier"`) is ONLY at **39085**, inside the RFQ-**portal** quoteReview → "Apply N Items to BOM" flow (manual upload has its own review UI, never calls the stamp). ⇒ B009 needs a **REAL portal submission with a substitute/cross.** OPTIONS (Jon picks on return): **(a)** create an RFQ from a test project → supplier-portal link → submit a substitute PN → Review Supplier Quote → Apply; or **(b)** reuse an existing test project with a submitted portal quote + variance. Refinement (read-only): NO auto-reprice fires on the apply path via unitPrice triggers → the clobberer is likely a **non-reprice save or a differently-keyed reprice** (runtime will name it). Instrumentation deployed TEST-only (`window.__B009=1`, bundle `?v=v1.23.0-b009`); PROD clean at v1.23.0. **BLOCKED on Jon** (path decision + a portal co-drive — supplier-portal live test needs Jon).
  - **REPRO RESULT (Marc + Jon, synthetic injection on PRJ402096, v1.23.0-b010, __B009=1):** a SINGLE apply does NOT reproduce — STAMP→apply-save(TR:true)→NO later save; the flag SURVIVES apply + close/re-open (both a priced cross 3516000→B009CROSSTEST and an unpriced cross 1032264CS→B009UNPRICEDTEST). Matches the static finding (no auto-reprice on the single-apply path; all post-apply writers preserve via fresh-ref+`...r`). **⇒ REFINED MECHANISM: B009 is a MULTI-APPLY / between-applies race** — Jon's original applied **4 quotes in sequence**; a LATER apply re-saves the panel off a snapshot taken BEFORE an earlier apply's stamp → clobbers the earlier flag (exactly Coach's stale-input/ref-lag: the "stale input" = the prior apply's snapshot). A lone apply has no prior stale snapshot → can't repro. NEXT: multi-apply experiment (inject 2-3 synthetic submissions, crosses on different rows, apply in quick succession) → reproduces + names the clobbering writer + yields a repro to VERIFY the fix. **Loose end (G005):** PRJ402096 now carries 2 synthetic imported submissions + 2 crossed rows (3516000, 1032264CS) — cleanable.
  - **DECISIVE NEGATIVE (Marc + Jon, v1.23.1, __B009=1):** 3 scenarios — single priced cross, single unpriced cross, **6 crosses in ONE apply** (matching Jon's "5-6 rows revert within 5s") — ALL CLEAN: flag persists (+ survives close/re-open); the ONLY [B009] safeSave is `doApplyPortalPrices` (TR:true); **ZERO post-apply writers fire** (no reprice, no lead-time re-save). **Jon also cannot manually reproduce his original now.** ⇒ **B009 is NOT confirmable-active in current code** — no clobbering writer to target → do NOT build the targeted input-freshness fix (Marc's rec). Possibly resolved incidentally since v1.22.3, or was env/timing-specific. **Minor gap:** the exact SEQUENTIAL multi-apply (2-3 SEPARATE back-to-back applies) wasn't explicitly isolated — scenario 3 was 6-in-ONE-apply; Jon's manual non-repro likely covers it, and the belt (below) makes it moot. **DECISION (Jon): (A) PARK not-currently-reproducible + keep instrumentation for opportunistic capture; vs (B) ship Coach's writer-agnostic save-time TR-preserve BELT as PREVENTION** (preserve the 5 TR fields on any save vs latest-persisted rows — mirrors the cross-user saveProject guards + CLAUDE.md metadata rule; correct-by-construction, verifiable by review not repro; guards the safety-gate field vs ANY future stale writer). **Freddy lean: B + keep-monitoring** (Jon observed it for real once; it's a send-gate-governing field; belt is cheap insurance).
  - **DECISION (Jon, 2026-07-07): B — ship the defensive save-time TR-preserve BELT as prevention + keep instrumentation on test for opportunistic capture. NO targeted input-freshness fix (no writer to target).** → Coach writes the belt FIX PLAN. **★ Critical design nuance:** the belt must preserve the 5 TR fields against a STALE-snapshot clobber but MUST NOT block LEGITIMATE TR changes (user flags a row; engineer resolves → clears). Mirror the cross-user `saveProject` guard pattern (read latest-persisted; preserve a field a stale/missing incoming write would clobber; allow genuine newer updates). Identify the right save layer (covers supplier-apply + any reprice). Verify: (1) legit flag-set works, (2) engineer resolve still clears, (3) a simulated stale save does NOT clobber a set flag. → Analyst Review → Jon approve → build → verify → deploy.
  - **UPDATE — Jon PARKED B009, but the belt fix plan had already landed (crossed the halt): `docs/B009-COACH-FIX-PLAN.md` (77163e1d). Analyst Review: SOUND.** Recency-stamp `techReviewUpdatedAt` (additive; set at all 4 intentional TR mutations) cleanly discriminates legit set/uncheck/resolve (newer stamp → passes) from a stale clobber (old/absent stamp dropping a still-flagged row → restore the 6-field cluster). One shared PURE helper `_preserveTechReviewFields` in the EXISTING read-and-preserve loops of `saveProject` @8907 + `saveProjectPanel` @9233 (zero extra Firestore reads; mirrors the ownerTakeover/storageUrl guards). ~30 LOC, LOW risk, data-retention-safe (additive field, restore-only), send-gate + F003 untouched, verifiable WITHOUT the repro. **BANKED — ready to ship as-is if B009 recurs or Jon unparks; NOT built (B009 parked as not-active).**
- **B008 — "RFQ History 'Supplier Portal' link opens the pre-submission portal, not the submitted one"** [Backlog] — in RFQ History → View Received Quotes, each quote's "Supplier Portal" link points at the portal BEFORE the supplier entered data (blank/email-state) instead of AFTER submission; should open the SUBMITTED portal so the user sees the pricing + lead times the supplier actually entered. (Jon said "customer" — in the supplier-portal domain the RFQ recipient who fills the portal is the SUPPLIER/vendor.) Bug-adjacent (link points at the wrong state). *(source: Jon 2026-07-07, via Intake.)*

### ✨ Features (F###)
- **F028 — "Admin toggle: RFQ all items ignoring Priced Dates (dual-ERP lag)"** [✅✅ SHIPPED PROD v1.24.1 (2026-07-22, release `b6dc593c`) — INERT (default OFF); Coach APPROVE no-blockers; single choke point `_eligibilityReason`; flag-ON bypasses staleness AND 30d cooldown; exclusions preserved; OBS-1 (customerSupplied lands on forced RFQ = pre-existing) eyeball when toggled ON. Live-test with toggle ON pending Jon.] — Jon (2026-07-22): today RFQs only request pricing for stale/missing-price items; because ARC + legacy M1 run in parallel (timing lag), add an **admin-gated Settings toggle** that disregards Priced Dates and requests pricing for **ALL of a supplier's quotable items** every time (not just stale ones). Add-only `_pricingConfig` flag (e.g. `rfqAllItemsIgnoreStale`, default OFF → existing behavior unchanged), mirrors the pricing-config/Settings pattern; plugs into the RFQ item-selection filter (staleness gate in `buildRfqSupplierGroups`/RFQ modal). "All items" = all *quotable* items (still excludes labor/customer-supplied/contingency/crate-buyoff/Matrix-Systems per `_isExcludedFromPriceCheck`). **Coach scoping** the exact filter site + plumbing. Money-path-adjacent (RFQ inclusion) → Coach review before deploy. *(source: Jon 2026-07-22.)*
- **F026 — "Status-model refactor: split READY TO REVIEW/SEND; reorder IN PRE-REVIEW column; per-status entry timestamps; review→RFQ-return"** [✅✅ SHIPPED PROD v1.24.1 (2026-07-22, release `b6dc593c`) — 8-column split live (READY TO REVIEW · IN PRE-REVIEW between · READY TO SEND); SSOT predicates anyRedRow/issuesCleared/readyToReview/readyToSend; **B044 fixed** (send-blocked reds route to RFQs, not "Ready"); statusChangedAt stamp; Coach APPROVE WITH NITS; tile restructure + width trim folded in; v1 top-strip removed. B018 deferred.] — foundation for F025 v2. Split `evc` "Ready To Review/Send" into **READY TO REVIEW** (all obtainable RFQs in + Issues resolved; may still have red rows/missing LT/pricing) and **READY TO SEND** (clean BOM: no red rows, all pricing + lead times). **Move the IN PRE-REVIEW board column to sit BETWEEN** READY TO REVIEW and READY TO SEND. Rule: a review that completes with red rows remaining → project returns to RFQs SEND/RECEIVE. Add **per-status entry timestamps** (time-in-bucket) for the dashboard timers; define the "Issues cleared" (BC/confidence circles) + "clean BOM" predicates (SSOT, reuse `_isBomRowFlaggedRed`/`_hasFirmLeadTime`/send-block). **Coach scoping** (column split/reorder feasibility @statusToCol ~:44545 + grid). Bucket timer thresholds per Jon's spec (see `docs/F025-V2-TODO-DASHBOARD-REQUIREMENTS.md`). *(source: Jon 2026-07-21.)*
- **F027 — "MANAGER role + manager/admin-only project priority flag"** [✅✅ SHIPPED PROD v1.24.2 (2026-07-22, rules+hosting) — `permissions.manager` flag (Team-UI checkbox, admin-assigned); pin checkbox in project header (manager/admin) → dedicated narrow `ref.update()` works on locked projects via `isOnlyPriorityPinUpdate` carve-out; 📌 tile badge; `_priorityPinCompare` pinned-first sort; preserve-guard. Coach APPROVE WITH NITS (NIT-1 folded: pin allowlist narrowed). Verified via review + established live-testing (no emulator — established practice; existing gate preserved byte-for-byte so no write-path regression). **⏳ Jon live-verify:** assign a manager, pin a locked project, confirm view+manager can't otherwise edit.] — new **MANAGER** permission tier alongside ADMIN (assigned by admin in team-members UI; extends `companies/{cid}/members` role admin/edit/view + `isAdmin()` + `firestore.rules`). MANAGER/ADMIN sees a **priority checkbox** in a project (hidden from others) that pins it to the TOP of the F025 dashboard list, sorted by the prioritization timestamp; re-prioritize via uncheck/recheck. Add-only project field (`priorityPinnedAt`/`priorityBy`?), rules-gated. **Coach scoping** the role model + priority feasibility. *(source: Jon 2026-07-21.)*
- **G013 — "Remove redundant status pills from the 5 board tiles"** [✅✅ SHIPPED PROD v1.24.1 (2026-07-22, release `b6dc593c`) — pills hidden on the 5 self-labeled Sales columns; Ready To Send/Active ECO/Quotes Sent keep pill; LOST always wins.] — remove the status pills from DRAFT / IN PROCESS / RFQs SEND-RECEIVE / READY TO REVIEW / IN PRE-REVIEW tiles on the main Projects page — redundant now that tiles sort into status columns (pills existed only to confirm sort accuracy). Independent quick win. *(source: Jon 2026-07-21.)* [NOTE: labeled G-item but filed under Features section for locality; Freddy to place in General tracker.]
> **★ SCOPED — FEATURES CLUSTER (F004/F005/F007/F008)** → `docs/F004-F005-F007-F008-CLUSTER-BRIEF.md` (Freddy, 2026-07-07, traced @4c20cdb4). All 4 are S-sized; **F008 is ~90% already built** (banner @47343 + `_system/version` broadcast @47154 — delta = confirm Refresh button + reassurance copy) and **F007's sort infra exists** (@10037 updatedAt-desc — delta = add `lastAccessedAt` on open + re-key). F004 (surface existing email-copy) + F005 (Print-Only in the sent-quote overlay @36231) are small adds. Recommend building as ONE batch → Coach review → one deploy, QUEUED behind G005 Phase 1. Next: Coach feasibility/touch-point confirm → Jon approve → Marc build.
> **★ SCOPED — MED FEATURES (F006 / #197 / #198)** → `docs/F006-197-198-SCOPING-BRIEF.md` (Freddy, 2026-07-07, @dec62ad9). Each MED + trace-gated (3 separate builds, not a batch). Grounding corrections: **#197** — ARC DOES compute a ship date (`computeControlPanelLeadTime` @1261, anchored to `today`); #197 re-anchors it to PO-received-date + adds mismatch messaging (not a from-scratch calc). **#198** — there's ALREADY an auto-clear of the review lock (@34140) that contradicts the reported "stuck" state → Coach must trace the EXACT stuck mechanism before design (customer-review vs engineering-review lock). **F006** — `qvHistory[]` metadata already accrues (@33341); the meaty part is a per-send DOCUMENT SNAPSHOT (Storage-on-send vs re-render — Freddy lean snapshot-on-send). Next: Coach code-trace pass (answer the per-feature "Coach must trace" items) → Jon approve per-feature → Marc builds.
- **F025 — "User 'To-Do' Dashboard — RIGHT-SIDE PANE (status-pill grid + timer-sorted project list + ECO list + Quotes-Sent follow-up + idle-flash)"** [OPEN · HIGH · v2 RESHAPE — planning] — **★ RESHAPED by Jon 2026-07-21 (`docs/F025-V2-TODO-DASHBOARD-REQUIREMENTS.md`).** The top-strip (v1, below) is SUPERSEDED → the dashboard is now a **right-side window on the main Projects page** (same size as in-project Panel/Quote Summary panes). Contains: a grid of status **pills** (IN DRAFT · (BOM) IN PROCESS · PENDING RFQs · READY TO REVIEW · IN PRE-REVIEW · ACTIVE ECO · QUOTES SENT) each showing project count + colored GREEN/YELLOW(≥80%)/RED(≥100%) by timeout; a **timer-sorted project list** (PRJ#/Customer/Name, color-coded); a separate **ECO list**; **Quotes-Sent** click→follow-up view (grouped by weeks); per-category timers (Settings, days, tracked to the minute); the **idle-flash** (untouched >40h → RED, entering resets to 24h + re-flash). **Depends on F026** (status buckets + per-status timestamps) + **F027** (manager role + priority). v1 foundation (`statusChangedAt`/`_rfqAwaitingSummary`/`_statusClockStart`/`_attentionThresholdMs`) is REUSED. **Coach scoping in flight** (column split/reorder + timers + role + right-pane placement). Open decisions: idle-timer scope (per-user vs global), manager assignment, build sequence. *(source: Jon 2026-07-21 reshape.)*
  - **F025 v1 (SUPERSEDED, on TEST only) — "attention top strip"** [OPEN · HIGH · scoped, decisions pending] — a glanceable top strip on the Projects board showing the user's current projects that need attention: **(1) pending-RFQ visibility** — after sending RFQs nothing indicates a project is *awaiting supplier responses* (Ryan & Noah pain); **(2) aging/timeout alarm** — flag projects sitting in DRAFT / IN PROCESS / READY-TO-REVIEW / IN PRE-REVIEW / RFQ past a set period (~1 week). **Scope: `docs/F025-ATTENTION-DASHBOARD-SCOPE.md`** (Coach lane + Jon rulings). **Jon ruled:** top-strip placement (reuse `box()` KPI pattern @44628, insert @44664→44686), My-Projects default + team toggle (reuse `myProjectsOnly` @44689), one admin-configurable ~7-day threshold. **Key findings:** RFQ is a *derived* condition not a status → use the panel-badge predicate (`rfqSentDate && !bcPoDate && !unitPrice`, @36894) factored into a shared `_rfqAwaitingSummary(project)` (fixes an existing SSOT drift vs `hasActiveRfqs` @16484); aging clock is MIXED — exact for PRE-REVIEW (`preReviewSubmittedAt`) + RFQ (`rfqSentDate`), DRAFT via `createdAt`, but **IN PROCESS & READY have no status-entry stamp** → staleness proxy via `updatedAt` now, or add `statusChangedAt` to `saveProject` (add-only) for exact. Pure client-side derive, LOW risk, build size **M** (M/L if exact aging everywhere). **Jon ruled (2026-07-21):** EXACT time-in-status (new `statusChangedAt`), READY-TO-REVIEW=`evc`, +return-leg chip. **★ Build-ready plan: `docs/F025-ATTENTION-DASHBOARD-PLAN.md`** (Marc) — 6 pieces: (A) `statusChangedAt`+`_lastEffectiveStatus` stamp in `saveProject`+`saveProjectPanel` [HIGH-care save-path, Coach gate + backward-compat], (B) factor `_rfqAwaitingSummary` + repoint panel badge [SSOT], (C) render-time attention derive [chip#2 source `rfqCounts` already exists @47753 — no new listener], (D) admin-configurable threshold in `_pricingConfig`, (E) top-strip UI w/ id-set deep-link. ~140-160 LOC, minor bump (target v1.24.0). **Jon APPROVED plan (Marc recs).** **✅ BUILT + Coach-reviewed** (master `56a6cae9`, +161/-20, validate PASS): Coach save-path review CHANGES-REQUIRED → 2 blockers FIXED — **B1** rules regression (the every-save `_lastEffectiveStatus` stamp broke `affectedKeys().hasOnly()` carve-outs on locked projects → Request-Unlock/ECO/lease writes silently permission-denied; fixed by adding `_lastEffectiveStatus`+`statusChangedAt` to 4 `firestore.rules` allowlists), **B2** chip deep-link `_attnClickRef` guard. **⏳ AWAITING Jon deploy gate — REQUIRES rules deploy + hosting (v1.24.0 minor)** + live backward-compat test (T-A4 legacy docs, Request-Unlock on locked legacy project, aging-clock transition, chip deep-link). KNOWN LIMITATION: legacy in_progress/evc interim clock re-bases to `updatedAt` until first real transition (self-corrects). *(source: Jon 2026-07-21; Coach scope+review + Marc plan+build+fix lanes.)*
- **F003 — "Role-Differentiated Tech Review"** [RESOLVED — shipped v1.22.0, 2026-07-06 · release `2d24f5a2`] — User sees a checkbox→row turns bright YELLOW ("in review"), locked once sent for review; assigned Engineer (+admin) sees an empty bold GREEN CIRCLE (not the checkbox) only while `preReviewStatus="pending"`→signs off (final/uncheckable)→row reverts + circle ✓; Approve blocked until all yellow rows addressed (replaced the auto-resolve sweep), Reject free; column "Status"→"Issues". Ruled set 1a/2b/3b/4a/5a/6b/keep/none. Full T1–T11 + 4 Rev-A live-verified (Coach-approved `docs/F003-COACH-REVIEW.md`); build `72c5994e`+`dae43068`. Brief: docs/F003-TECH-REVIEW-REDESIGN-BRIEF.md; Plan: docs/F003-COACH-BUILD-PLAN.md; Verify: docs/F003-VERIFY-RESULTS.md. *(source: Jon 2026-07-06, from F002 verify.)*
- **F001 — "Interactive quote-building walkthrough"** [RESOLVED — shipped v1.23.0, 2026-07-07 · release `2d29d5d1`] — gated hands-on training walkthrough over the user's REAL quote; EXTENDED the existing `TourOverlay` engine (not a new build) with gated/narrated/checkpoint step-types + state-driven self-healing resume; 10-step "🧭 Quote Walkthrough" gear entry. Jon rulings: real project (no sandbox); 4Ba+Step7 sends NARRATED (never auto-fire — STRUCTURAL, no `advance` field). Full live-verify passed (5 real UI bugs caught+fixed: A3 spotlight timing, modal-mask, modal-grow, 2 bubble-clips); Coach-approved (docs/F001-COACH-REVIEW.md). Docs: docs/F001-*.md. *(source: Jon 2026-07-06.)*
  - **Forward-items (non-blocking, deferred at ship — capture, not lost):** (1) **focus-trap** on the tour bubble (Esc is done) — minor a11y follow-up; (2) **checkpoint same-step double-advance hardening** — Coach+Marc confirmed LOW-risk, functional-updater guard; (3) **Step 2 narrated + deferred sub-field anchors** — v1 guides at button-level; re-point/finer per-field steps when a pre-quote modal exists or finer guidance is wanted (`np-customer/salesperson/pm/engineer/create`, `prequote-continue`, `verify-page-type/region`, `rfq-vendor-select/preview/send`). *(Freddy 2026-07-07, from Coach's F001 review.)*
- **F004 — "Portal submit confirmation shows ARC user + email-copy notice"** [Backlog] — when a supplier submits a quote from an RFQ, the portal confirmation page AND the confirmation email should display the ARC user's name and state a copy of the quote was emailed to that user ("a copy of your quote has been sent to <Name> @ name@matrixpci.com") — reassures the supplier it reached a real person. *(source: Jon 2026-07-06, via Intake.)*
- **F005 — "Print-Only button in locked-quote (Quote Sent) blocker overlay"** [Backlog] — after a quote is sent/locked, the blocker overlay covers the Print + Send buttons; add a "Print Only" button to the overlay (alongside "Verify with Project Owner & Enable Edits") that prints the quote to PDF — needs NEITHER approval NOR unblocking (read-only output). Thematic sibling to #196 (locked-quote overlay covers a forward/output button; different button/ask). **★ Jon added specifics (2026-07-13):** (a) lets a user print a locked quote to PDF **WITHOUT unlocking**; (b) **must NOT bump the revision** — ★ load-bearing interaction with **B034**: B034 keys the bump/cap on `_lastDeliveredRev=max(quoteRevAtPrint,quoteSentRev)`, and the normal print path (`handleGeneratePdf` @`:36981`) stamps `quoteRevAtPrint`; the Print-Only path must generate the PDF via a variant that does NOT stamp `quoteRevAtPrint` (else it resets the revision cycle / could bump); (c) **PDF only, not email** (no send path). **★ Bundled with B034.** **✅✅ SHIPPED TO PROD v1.23.14** (2026-07-13, release `d6ddbd3e`): "🖨 Print Only" button in the locked sent-quote overlay → prints PDF with NO rev bump / NO unlock (all pre-print persists gated on `!printOnly`), reuses the quote number; works for services-only (B033) locked quotes. Coach money-path APPROVE. **✅ JON VERIFIED ON PROD (2026-07-14): Print Only = PDF, no rev bump, no unlock.** *(source: Jon 2026-07-06 + refined 2026-07-13, via Freddy.)*
- **F008 — "New-version-available notification prompting users to refresh"** [Backlog] — when a new build is pushed, ARC polls the served version (compare the client's loaded `APP_VERSION` vs the currently-served build — `deploy.sh` already bumps `APP_VERSION` in public/index.html) and shows a notification on ALL users' pages that they should refresh to apply the update; message reassures all their work is saved / nothing lost on refresh. *(source: Jon 2026-07-07, via Intake.)*
- **F007 — "Order main-page projects by last-accessed (most-recent on top)"** [Backlog] — on exiting a project, bump it to the TOP of the dashboard list; order the whole list by last-accessed (most-recently-opened first). Needs a per-project last-accessed timestamp (additive/data-safe, written on open and/or exit) + sort the dashboard by it. Distinct from #200 (shifts tile COLOR by quota-age, not order). *(source: Jon 2026-07-07, via Intake.)*
- **F006 — "Qv.## Hist. button — per-quote send history with document previews"** [Backlog] — a "Qv.## Hist." button next to Send/Resend/Print Quote that opens the history of ALL sends for that quote, each entry showing a PREVIEW of the document actually sent. Data feed exists (#193 writes per-send `quote_send` to `project.qvHistory[]`); distinct from #194 (GLOBAL email-metrics/click-tracing consumer). Requires storing/rendering a sent-document snapshot per send. *(source: Jon 2026-07-06, via Intake.)*
- **F009 — "Debug Mode — persistent cross-user activity tracing for troubleshooting"** [Backlog · parked behind Phase B] — an admin-toggled, time-boxed Debug Mode that records the full user-activity stream (not just errors) for troubleshooting, EXTENDING the existing debug-logging pipeline (`companies/{companyId}/debugLogs` + the ~30-event breadcrumb ring buffer). Highest-value piece: a **cross-user, single-project activity TIMELINE** (multiple users' actions on one project, time-ordered with `updatedBy`) — would have surfaced the B012 concurrent-edit clobber immediately. Design guardrails: OFF by default; admin-toggled; scope-able global/per-user/per-project + time-boxed; two-tier (cheap in-memory ring always on → **batched async flush** of the full stream while ON — never per-event, to avoid the observer effect worsening the write-queue contention that amplified B012); log **metadata not verbatim payloads** (row-ids/action-types/updatedBy/timestamps, not pricing/customer values); **TTL/auto-expire** traces (debug data, not a learning DB, so caps are OK). Seeded by the read-only Phase B watcher (its learnings feed this). *(source: Jon 2026-07-09, via Freddy analysis; parked behind Phase B ship.)*
- **F010 — "Suggested alternates — multi-alternate 'ALT' picker (BC Browser) + supplier-portal alternate sub-lines"** [Backlog] — extend the crossed/superseded flow to **SUGGEST additional alternates UNDER a BOM item (additive, NOT replace)**. Two halves: **(A) ARC BOM UI** — an "ALT" button next to the row's search icon opens the BC Item Browser in **multi-select** mode; chosen items append as **bulleted alternates under the primary customer Part# in NOTES**, each showing its Lead Time. **(B) Supplier Portal** — a per-RFQ-line "add alternate" button creates a **SUB-LINE** where the supplier enters the alternate's Part#, Price, Lead Time; ingested back onto the BOM row. **Distinct from the existing single-part cross** (which REPLACES the primary) — this ADDS suggestions alongside it. *Impl sketch:* additive `row.alternates[]` field (preserve-on-save, no cap, per data-retention rules); reuse the BC Item Browser modal with multi-select staging; portal alternate sub-line schema on `rfqUploads/{token}` + ingest via `doApplyPortalPrices`; feeds/relates-to the `alternates` learning DB. MEDIUM; money-path-adjacent (pricing + lead-time) → needs review. *(source: Jon 2026-07-09, via Intake.)*
- **F011 — "CSV BOM export: add Supplier, Lead Time, Priced Date columns"** [RESOLVED — shipped v1.23.4, 2026-07-09 · release `ebe0cbc2`; Jon-confirmed working] — extended `exportCSV()` (`src/app.jsx:27831`) with three columns from existing row fields: **Supplier** (`r.bcVendorName` — mirrors the on-screen supplier), **Lead Time** (`r.leadTimeDays`), **Priced Date** (`r.priceDate`). New order: Qty / Part # / Description / Manufacturer / Unit $ / Priced Date / Cost Source / Supplier / Lead Time / Notes. Additive, no data-model change. *(source: Jon 2026-07-09, via Freddy.)*
- **F012 — "Sort the BOM by column (click-to-sort headers)"** [Backlog] — let users click a BOM column header (Part # / Description / Qty / Unit $ / Supplier / Lead Time / Priced Date / Status) to sort the table asc/desc so they find items faster. KEY DESIGN: make it a **non-destructive VIEW sort** — do NOT mutate the stored `panel.bom` order (preserves the manual drag-reorder, the #/Ref numbering, and data-retention) + a "clear sort → original order" reset. Handle special rows (labor / contingency / buyoff / crate — pin to bottom or a sort rule, don't scatter) and keep ECO-vs-base grouping + the #/Ref column meaningful under a sort. MEDIUM (complexity is the special rows + manual order, not the sort). *(source: Jon 2026-07-09, via Freddy.)*
- **F013 — "Reviewer full control during Tech Review + Admin request/force-takeover flow"** [Backlog] — Jon ruling (2026-07-10, from the L6 owner-priority finding): when a Tech Review is requested, the assigned **Reviewer/engineer has FULL control** of the project — can change anything without guardrails, **regardless of the owner** (exempt from Owner Priority Mode + the edit lock during pending review). If an **ADMIN enters a project-in-review**, they do NOT auto-take-over; instead a modal: *"This Project is in Review and assigned to <Engineer>. You may request Edit rights or force takeover."* → **(a) force-takeover** checkbox → a **CONFIRM** modal; OR **(b) request Edit rights** → does NOT relinquish the reviewer assignment or wipe reviewer notes → shows the **Reviewer** a *"relinquish edit rights to <Admin>? Yes/No"* modal → if **No**, Reviewer adds a **note explaining why** (feedback to the Admin). Overlaps the P2/P3/P4 request-grant/force machinery — likely built on it. **NOTE:** the immediate L6-closing piece (reviewer exempt from Owner Priority Mode during review so they can Approve while the owner watches) is tracked as **B012 P1 gap #3** (separate/smaller); THIS F013 is the fuller admin request/force + reviewer-consent workflow. *(source: Jon 2026-07-10, via Freddy.)*
- **F014 — "Customer-specific payment-terms note on all quotes + BC storage field"** [Backlog · ★ CRITICAL (Jon)] — every quote needs a note showing PAYMENT TERMS specific to the customer (e.g., WTR = **30% ARO / 40% AT Procurement / 30% Shipment** — milestone/progress billing). Two parts: **(A)** surface a per-customer payment-terms note on ALL quote outputs (printed + sent); **(B)** identify a **BC field** to store the per-customer terms so ARC reads it from BC (not hand-entry). Distinct from **#117** (RESOLVED — payment-terms field blank-render bug); this is per-customer MILESTONE terms + the BC-storage-field question. Classified FEAT (quote-output capability + BC integration; Jon tagged GEN). **Slot: TOP of the post-P1 queue** (Jon flagged CRITICAL; no P1-ship disruption intended). Part (B) BC-field ID is read-only research that can start in parallel if Jon wants. **★ F020-B folded in here (Jon 2026-07-13):** the durable BC-seeded `<select>` (new list-fetch of BC `paymentTerms`/`shipmentMethods`, cached, free-text fallback) + per-customer default persisted to `customerDefaults/{bcCustomerNumber}` + company-wide default for new/non-BC customers. Shares the `customerDefaults` store (@`:2243-2250`/`:18078-18106`) with the existing `quoteValidityDays`. F020 Option A (send-modal inline fields + override guard + company default) ships first as the interim patch. *(source: Jon 2026-07-10, via Intake — proactive/CRITICAL surface; F020-B fold 2026-07-13.)*
- **F015 — "Same-user 2nd-tab: block/redirect instead of View-Only"** [Backlog · LOW/UX] — when the same user opens a project already open in another of their tabs (the L8 state-ii "open in another tab" modal), don't leave them in a confusing VIEW-ONLY duplicate. Jon's intent: force the 2nd tab to close + revert to the active tab. **Browser limit:** a page can't reliably close a tab it didn't open (`window.close()` only works on script-opened tabs) nor focus another tab → true force-close isn't reliable. **Jon DECIDED (2026-07-10): a HARD-BLOCKING modal** — "You have this open in another tab — close this browser tab" with **NO close/dismiss button** (only closing the tab clears it; NO View-Only). True force-close isn't browser-reliable, but a non-dismissible block achieves the intent within limits. ★ **DEPENDENCY — ships WITH/AFTER gap #5's ghost-lease fix:** a hard-block on the CURRENT ghost false-positive would trap a user out of their OWN project ~90s (worse than today's view-only escape). So sequence F015 behind gap #5 (fast-follow). Ties to ruling #8 (per-session tab keying) + gap #5. ★ **Coach design caveat (2026-07-10):** gap #5a persists the tab-id in sessionStorage → Chrome "Duplicate Tab" COPIES sessionStorage → a DUPLICATED tab shares `_ARC_TAB_ID` → L8 detection MISSES that specific case (a new/Ctrl-click tab is still detected). F015's hard-block MUST design for it — a duplicated tab wouldn't be hard-blocked / could self-clobber (same-user only; cross-user B012 stays server-enforced per-uid). *(source: Jon 2026-07-10, via Freddy — from L8 re-test; Coach caveat.)*
- **M001 — "User engagement telemetry: page-access, activity cadence, per-project time"** [Backlog] — FIRST **METRICS (M)** item (category est. 2026-07-10). Capture per-user engagement signals: (a) access time / session length; (b) time between clicks (cadence); (c) which project accessed + time-in-project; (d) within-project activity classified **engaged / periodic / no-activity** by click cadence. ⚠ **SCOPE GUARD (privacy) — confirm with Jon at design:** capture activity **CADENCE + COUNTS + timing**, NOT verbatim keystroke **CONTENT** — literal keylogging would capture passwords/customer data (privacy + security hazard) and isn't needed for engagement classification. **Overlaps F009 (Debug Mode)** on the capture mechanism but differs in intent: F009 = ephemeral admin-toggled DEBUG (TTL, metadata-only, batched flush); M001 = PERSISTENT analytics/engagement reporting. Design decision (Coach): shared capture pipeline (M001 rides F009's) vs standalone. Reuse F009's **batched-async-flush** (observer-effect / B012 write-queue), **metadata-not-verbatim**, + a defined **retention/aggregation** policy (persistent — decide raw-vs-rolled-up). Employee-activity data → **transparency/consent** + data-retention considerations. *(source: Jon 2026-07-10, via Intake; scoped by Freddy.)*
- **F016 — "REJECTED REVIEW dashboard column (red header) for rejected-review projects"** [Backlog] — add a new column/section on the main dashboard surfacing projects whose tech review was **REJECTED**, so users immediately see projects needing attention — otherwise a rejected review goes into **LIMBO** (no visible action queue). Header color **RED**, matching the existing RFQs **SEND/RECEIVE** column header styling. Data-driven by the review-reject state (`preReviewStatus`/`postReviewStatus === "rejected"`, F003 reject path). Relates to: the Kanban/Status column system (`docs/kanban-status.md`); the gap #4 reject-path (edit hands back to owner on reject) + **B026** (re-arm a new review after rejection) — F016 surfaces the rejected project so the owner can see + re-review it. *(source: Jon 2026-07-10, via Freddy.)*
- **F017 — "Engineer can notate each row as he approves it (per-row reviewer notes)"** [Backlog] — during Tech Review, let the assigned engineer/reviewer attach a note to EACH row he approves/addresses (not just a single project-level note). Pairs with **F018** (owner enters per-row notes before sending) — together a per-row review-notes exchange. Relates to F003 tech-review + **B027** (persist review notes to history). *(source: Jon 2026-07-10 P1 re-test, via Freddy.)*
- **F018 — "User can enter per-row notes before sending a review"** [Backlog] — before sending a project for Tech Review, let the owner attach a note to each row to give the reviewer context/questions per line. Linked with **F017** (engineer's per-row approval notes) — the two form a per-row review-notes exchange. Relates to F003 + **B027**. *(source: Jon 2026-07-10 P1 re-test, via Freddy.)*
- **F019 — "Background standalone 'Get New Pricing' (survive nav-away + tile progress, like extraction)"** [Backlog] — standalone Get-New-Pricing (runPricingOnPanel @27301) is FOREGROUND / component-lifecycle-tied (drives setAiPricing/setPricingProgress, NO bgStart → never enters _bgTasks/activeExtractions), so navigating away kills its visible progress (the async chain may keep running + write back invisibly, but the user perceives it as killed). Contradicts the Multi-Project / Dashboard-Command-Center / Async-Ownership design ("price project A while working in B"). FIX: register runPricingOnPanel as a backgrounded, project-scoped task modeled on runExtractionTask (bgStart / _bgKey / rbgStart → companies/{cid}/activeExtractions) so pricing survives nav-away + shows the dashboard tile progress. PRE-EXISTING — NOT a P1 regression (P1 diff touches zero pricing/abort code — Marc 2026-07-10); NOT data-loss. Surfaced during the B012 P1 L5 re-run when Jon ran Get-New-Pricing (foreground) instead of extraction (the correct, backgrounded L5 vehicle). ★ DECISIVE RESULT (Jon, 2026-07-10, prod v1.23.5): TRULY KILLED — navigating away during standalone Get-New-Pricing kills it; prices did NOT update (writeback does NOT land). So it's not "invisible-but-running" — the operation is genuinely LOST, and SILENTLY (no indication to the user → they could believe pricing completed when it didn't → could act on stale/incomplete prices). This raises F019's value: the clean fix is backgrounding it (survives nav-away + tile progress); consider an interim guard/warn ("pricing cancelled — you navigated away") if backgrounding is deferred. NO RESIDUAL LEASE GAP for supported workflows (Marc): long STANDALONE pricing while STAYING PUT is covered by the mounted 30s lease heartbeat; EXTRACTION+nav-away is covered by the keep-alive; the ONLY uncovered case is standalone-pricing+nav-away — moot until this F backgrounds it. *(source: Jon 2026-07-10 P1 L5 re-run; Marc diagnosis.)*
- **F020 — "Manual entry for Payment Terms + Shipping Method (new customers not in BC)"** [OPEN · HIGH · scoping] — printing/sending a quote for a NEW customer (not yet in BC) shows a Notice: *"Missing required fields: Payment Terms, Shipping Method. The sent quote would show '---'. Connect to BC or enter the fields manually before sending."* — but Jon reports there is **no way to enter these manually in ARC**. The modal references a manual-entry path that doesn't exist. Need an ARC UI to set Payment Terms + Shipping Method (for customers absent from BC, or to override). **Concrete user-facing half of F014** (F014 = surface per-customer payment terms from BC; ARC already reads `customers.paymentTermsId`→`paymentTerms` via `ensureQuoteFieldsPopulated` per `docs/F014-BC-PAYMENT-TERMS-RESEARCH.md`) — F020 is the gap when BC has nothing. **Scoping via Coach** (2026-07-13): locate the validation (the "Missing required fields" gate), the field names + data flow (BC→project/quote→PDF, what renders "---"), whether any manual-entry UI exists today, and whether values are free-text vs a BC enum (`paymentTerms`/`shipmentMethods`). Likely fix (echo Jon's F014 ruling): a cached ARC-editable field seeded from BC (dropdown or free-text), persisted per-customer. **★ Coach scoped (2026-07-13):** a manual path ALREADY exists (free-text `paymentTerms`/`shippingMethod` inputs in the QuoteTab quote editor @`:20602-20604`) — the real gap is that the SEND hard-block lives in `QuoteSendModal.handleSend` (@`:33493-33503`, OK-only, no fields) so the user is bounced with no inline fix; new (non-BC) customers start blank; and `ensureQuoteFieldsPopulated` (@`:8104`) can let a BC re-fetch CLOBBER a manual entry. **Jon chose (2026-07-13): Option A now + fold B into F014.** **✅ Marc BUILT Option A** → `f020-payment-terms-entry` (`f834fdf8`, +93/−5, Babel validate PASS): (1) inline the two fields in `QuoteSendModal` (resolve-inline, #117 blank-send block KEPT), (2) override guard `&&!q.<field>` in `ensureQuoteFieldsPopulated`, (3) company-wide default in the EXISTING `_pricingConfig` admin UI ("Default Quote Terms"; constants Net-30 / Customer-Handles-Shipping) seeded only into blank fields, visible/editable, gated `!bcProjectNumber` (load-bearing: seeding a BC project would make the override guard block real BC terms). **✅ Coach APPROVE WITH NITS (C151):** #117 send hard-block intact (inline fields fill, never bypass); override guard works by *removing* the field from `autoFields` so spread-order can't clobber; `_seedQuoteTermDefaults` correctly gated `!bcProjectNumber`; `useEffect`-before-`useState` legal (stable order, no TDZ); modal mount-persist safe vs B012 lease via the save-guard. Nits: (1) modal mount-seed writes on open → swallowed permission-denied "Save failed" banner for a read-only-viewer edge (gate on write-eligibility or leave); (2) branch drift — rebase onto current master before landing (no conflict expected). Additive-only, data-retention clean. **✅✅ Option A SHIPPED TO PROD v1.23.13** (2026-07-13, release `d49f882f`; merged with B033 in one release). New/non-BC customers can now set Payment Terms + Shipping Method inline in the send modal; company default seeds blanks; manual entries survive BC re-fetch. **Nit #1 (read-only-viewer mount-persist banner) NOT fixed — deferred** (narrow edge; Jon shipped as-is). **Option B (BC-seeded `<select>` from `paymentTerms`/`shipmentMethods` + per-customer default in `customerDefaults` + company default) folded into F014.** *(source: Jon 2026-07-13, via Freddy; Coach scope.)*
- **F021 — "Customer Project # field (bound to BC External Document No.) + PO-append + header/quote display"** [OPEN · HIGH · scoping] — capture the CUSTOMER's project number in a new field **"CUSTOMER PROJECT #"** and bind it to the BC Project Card **"External Document No."** field (currently used by ARC for the PO#). Requirements (Jon 2026-07-13): (1) New Project flow — add "CUSTOMER PROJECT #" directly under Project Name; on create it populates BC External Document No.; (2) store on the ARC project doc (new additive field, e.g. `customerProjectNumber`); (3) **PO-append** — when a PO is received, append it so BC + ARC read `Project#: <cust#> / PO#: <po#>`; (4) display on EVERY project screen just under the Project Name (under PRJ#); (5) show on the quote where the "Line Items" heading is — **format `<Customer Project #> / <Project Name>`, e.g. "923455698 / Messabi"** (Jon 2026-07-13; NO PO# on quotes; fallback to just Project Name when no cust#). **Absorbs G010.** **★ #1 RISK (Freddy):** External Document No. is CURRENTLY the bare PO# field → making it a composite `Project#: X / PO#: Y` string could break any consumer that reads it expecting a bare PO#. **Scoping via Coach** (2026-07-13): map current External-Doc-No PO write + all read/parse consumers + breakage verdict; recommend the safe structure (keep separate ARC fields `customerProjectNumber`+`poNumber`, compose the composite string only when writing External Document No. / displaying); new-project field insertion + BC create mapping; single top-of-page header insertion; PO-append design; quote-heading plan (parameterized). Money-path/BC-write → needs live BC test. **Sequencing:** quote-heading piece overlaps G010 + the in-flight `b034-f005-quote-revision` branch → build after those land. **★★ Coach scope DONE (C-note):** ★ composite-string risk to ARC = ZERO — `External_Document_No.` is WRITE-ONLY from ARC (single writer `PoReceivedModal.handleSubmit` @`:20036`, ZERO readers/parsers anywhere); ARC's internal PO# is a separate field `project.bcPoNumber` @`:39567`. Safe structure = keep `customerProjectNumber` + `bcPoNumber` separate, compose via a `_composeExternalDocNo(project)` helper only at write/display. Residual risk = BC-SIDE reporting/order-copy expecting a bare PO# → **Jon live-BC verify before F021-3 prod.** **Build breakdown:** **F021-1** New-Project field (`NewProjectModal` @`:43000`, add under Project Name) + `customerProjectNumber` data model (additive, no schema bump — `saveProject`/`migrateProject` pass it through) + BC create mapping (widen `bcCreateProject` @`:4246` to pass it into the `_patchFields` `External_Document_No`); **F021-2** header display — SINGLE insertion in `PanelListView` header @`:35294` under `project.name` (shows on every project screen since ProjectView renders QuoteView/PanelListView only); **F021-3** PO-append — `_composeExternalDocNo` (`cust&&po`→"Project#: X / PO#: Y"; cust-only→pre-PO format TBD; po-only→"PO#: Y") wired into `PoReceivedModal` @`:20036` (offline-queue replays composite fine); **F021-4** quote heading — both sites (`:7173` PDF, `:20774` on-screen) behind one `_quoteHeadingLabel(project)` = "`<cust#> / <name>`". **Size MINOR overall, additive/retention-safe.** Build F021-1/2/3 now (no quote-file contention); F021-4 last (after `b034-f005` + G010). **✅ Sub-decisions (Jon 2026-07-13):** header **inline-editable** (mirrors the customer-name field; lets users backfill older projects; on edit re-writes External Doc No); pre-PO format **prefixed "Project#: X"**. **✅ Marc BUILT F021-1/2/3** → `f021-customer-project-number` (`0580eb84`, +61/−5, validate PASS): `_composeExternalDocNo` helper @`:4251` + new-project field + inline-editable header @`:35349` + PO-append @`:20057`; caught + threaded a 3rd `bcCreateProject` caller (`relinkToBC`). **✅ Coach APPROVE WITH NITS:** External_Document_No still zero readers (composite risk=0); `bcPoNumber` stays bare; 3 callers correct; additive/retention-safe. Nits: clearing cust# actively blanks BC (intended); create-path guards blank / header doesn't (acceptable). **Routable → Jon:** header edit best-effort vs `bcEnqueue` (Coach leans enqueue). **✅✅ SHIPPED TO PROD v1.23.14** (2026-07-13, release `d6ddbd3e`; with B034+F005 in one release). Ship best-effort header BC write; offline-queue deferred → **B037**. **⏳ Jon LIVE-BC test on a DISPOSABLE project** (create→"Project#: X"; PO→"Project#: X / PO#: Y"; header re-edit keeps PO#; legacy→"PO#: Y"; relink; confirm no BC-side report/order-copy chokes on the composite). **✅✅ F021-4 (quote heading "<cust#> / <name>", absorbs G010) SHIPPED TO PROD v1.23.15** (2026-07-13, release `991b2915`): `_quoteHeadingLabel` helper → both quote sites show "923455698 / Messabi" in place of "Line Items", fallback to name. Coach APPROVE. **FULL F021 COMPLETE.** *(source: Jon 2026-07-13, via Freddy; Coach scope.)*
- **F022 — "PO Received modal: drag-and-drop upload for the customer's PO document"** [OPEN · MED · scoping] — the PO Received modal (`PoReceivedModal` ~`:19997`, `handleSubmit` ~`:20036`) needs a **drag-and-drop window** so the user can upload the customer's PO (PDF) when a PO is received. Store the PO doc in Firebase Storage (path TBD — likely `customerPOs/{uid}/{projectId}/...` or reuse an existing attachments area) + an additive project-doc reference; MIME-restrict to `application/pdf`; project-scoped per the Async Ownership Rule. **Open:** whether to also attach to BC (`bcEnqueue('attachPdf')` / quote-to-BC upload path) or v1 stores in ARC only; where the PO is viewable later. **★ Coach scoped (2026-07-13):** reuse the `rfqEmailFile` pattern (handler `:34419`, dropzone `:35633-35649`, display `:35652`); store `pageImages/{uid}/{projectId}/customerPO/…` + `project.customerPoDoc={name,uploadedAt,size,storageUrl,contentType}` (additive, NO storage.rules change — existing `pageImages` rule covers it); PDF-only 25MB client-side; multi-project-safe via `onDone(poNum, poDocMeta)`→ fold into the single existing `saveProject` (`:39746`). **Jon decisions (2026-07-13):** BC-attach **INCLUDED** (Q1 radio said "ARC only" but Jon's explicit note said "push to BC attachments with ARC/BC naming" → honoring the note) via `bcAttachPdfToJob`/`bcEnqueue('attachPdf')` with a PO-prefixed ARC/BC-convention filename; **"View PO" button** — once `bcPoNumber` exists, relabel the PO-Received button to "View PO"; clicking opens the modal with an open/download link to `customerPoDoc`. Money-path (BC-write) → Coach review + live test. **✅✅ SHIPPED TO PROD v1.23.18** (2026-07-14, release `8c537674`; with B038+G012). Coach APPROVE after the Replace-safety fix (versioned filename `PO-[CUSTOMER PO] <po> - <proj> - <ts>-<rand>.pdf` so a same-PO# Replace can't delete the just-uploaded attachment). B037 (offline-queue) follow-up open. **⏳ Jon live-BC test on a DISPOSABLE project:** upload→BC attachment correct name; Replace-same-PO# = exactly ONE attachment; View PO opens it. *(source: Jon 2026-07-13, via Freddy; Coach scope.)*
- **F023 — "Board: click-column-header to filter to that status + project search bar"** [OPEN · MED · scoping] — the project board's column lists will grow large. (1) **Click a column header** (QUOTES SENT, (BOM) IN PROCESS, Draft, etc.) → view shows ONLY that column/status (a focus filter); same for every header; toggle/reset back to all. (2) **Search bar** to find projects (by name / PRJ# / customer). View-only client-side filter — no data writes. Board render ~`app.jsx:44432` (`order`/`labels`/`statusToCol` + column map). **★ Coach scoped (2026-07-14): the SEARCH BAR ALREADY EXISTS** (`projectSearch` deep-search, `app.jsx:44272`/input `:44499`/filter `:44581` — matches name/PRJ#/customer + all fields, across all columns). So part 2 = done; net-new = only the header-click filter (kanban render `:44609-44654`, header `:44638`). **Jon decisions (2026-07-14):** keep the broad deep-search as-is; header-click filter on **ALL** kanban views; focused = full-width `repeat(5,1fr)` grid + "← All columns" reset + click-header toggle + empty-state + reset-on-tab-switch (Coach recs). **✅ Marc BUILT + Coach APPROVE WITH NITS** → `f023-board-column-filter` (`b0744509`, +76/−11, view-only): `focusedCol` state + `key:k` on all 6 kanban branches + clickable header (focus/toggle) + full-width grid when focused + "← All columns" reset + empty-state + reset-on-tab-switch; color-map hoist verified byte-identical (no board regression), customer drag-drop intact, JSX balanced. Nits cosmetic (focused customer-view tile draggability; imperative hover shadow). **✅ DEPLOY-READY.** *(source: Jon 2026-07-14, via Freddy; Coach scope + review.)*
- **F024 — "New board column 'ACTIVE ECO' (between In Pre-Review and Quotes Sent) + route active-ECO projects there"** [OPEN · MED · scoping] — add an **ACTIVE ECO** column to the main sales board, positioned between `pre_review` and `quotes_sent`; any project in an active ECO routes there (active-ECO currently forces `in_progress` → move to the new `active_eco`). **Consequence Jon wants:** "(BOM) IN PROCESS" becomes **pre-Purchase-Order projects only** (ECOs are post-PO changes → out of the pre-PO column). Touch points: `order`/`labels`/`statusToCol` (~`:44432-44434`), `computeProjectEffectiveStatus` ECO routing (~`:16402`), kanban routing (~`:44442`), status color/label maps (~`:44677-44678`/`:45805-45806` + F023-hoisted `_statusColColors`/`_statusColBg`), Badge (~`:16452`). View/routing-only (no data write). **Scoping via Coach** (2026-07-14): complete touch-point enumeration, `_hasActiveEco` predicate, whether removing ECO from in_progress = pre-PO-only (or more leaks), color, + **★ sequence on the F023 branch** (both touch the board render/color-maps → build F024 on F023 to avoid collision). **✅✅ SHIPPED TO PROD v1.23.22** (2026-07-14, release `06f93e00`): any-active-ECO routing (computeActiveEco), RED, (BOM) In Process → pre-PO-only + color-key fix (now yellow); Coach APPROVE WITH NITS; verified live. Deferred nit: purchasing_kanban narrow predicate. *(source: Jon 2026-07-14, via Freddy.)*
- **F002 — "BOM column reorg / indicator cleanup"** [RESOLVED — shipped v1.21.26, 2026-07-06 · `38ffe85c`] — decluttered BOM columns (# Ref TR Qty Status 🔍 Part#…), unified tri-state BC circle (RED>YELLOW>BLUE), AI+manual→grey-italic / BC→white pricing, removed marker/label pills, `data-tour` anchors. All T1–T10 live-passed (2 states code-verified: YELLOW circle, readOnly RED/YELLOW). Brief: docs/F002-BOM-COLUMN-REORG-BRIEF.md; Plan: docs/F002-COACH-SUPPLEMENT-AND-PLAN.md. *(source: Jon 2026-07-06.)*
- **#199 — "Per-line Tech Review flag + hard send-gate"** [RESOLVED — shipped v1.21.25, 2026-07-03] — per-BOM-line Tech-Review checkbox; auto-stamps on supplier crosses (@38978, unconditional → re-cross re-arms); hard send-gate across all 7 send surfaces; reviewer per-row Resolve + approve-sweep. Commits: P1 `13f06fcf`/`66494253`, P2 `a5253d42`, P3 `a0e39335`, MED-3 `c46184aa`, await-fix `41824f6c`, count-fix `107b960b`. Full T1–T18 live-passed; Coach-verified P1/P2/P3 + MED-1/2/3; T3 covered-by-design, T7 superseded, T12 N/A-by-design. (Legacy-continuation #N — kept as #199 to match commits/docs.)
- **#200 — "Quota-aging project-tile color-shift"** [Brief written · queued] — shift dashboard project-tile color as a project ages toward its Sales quota deadline (anchor createdAt, un-quoted-only + sending stops it, business days, fixed offsets from deadline). Brief: docs/200-QUOTA-TILE-AGING-BRIEF.md. (Legacy-continuation #N.)

### 🔧 General (G###)
- **G010 — "Replace the quote's 'Line Items' heading with the Project Name"** [RESOLVED — shipped v1.23.15, 2026-07-13 · release `991b2915` · via F021-4 as "<Cust #> / <Project Name>"] — on the quote, replace the literal heading **"Line Items"** with the **project name** (`project.name`, e.g. "Longonjo", "Messabi"). Two sites confirmed (Freddy, 2026-07-13): the **PDF quote** builder `buildQuotePdfDoc` @`src/app.jsx:7173` (`arcDocText(ctx,"Line Items",…)`) and the **on-screen quote doc** @`:20774` (`<div className="qd-items-heading">Line Items</div>`). Use `project.name || "Line Items"` (safe fallback for a nameless project). NOT the `:23568` "Missing BOM Line Items" extraction warning (unrelated — leave it). Small/cosmetic; batch with other small quote-label changes into one deploy if more land. **★ MERGED INTO F021's quote-heading decision (2026-07-13):** Jon's item-2 (F021) says show the **Customer Project #** in the "Line Items" spot, which conflicts with G010's original "Project Name" — **✅ RESOLVED (Jon 2026-07-13):** the quote heading (in place of "Line Items") reads **`<Customer Project #> / <Project Name>`** — e.g. "923455698 / Messabi" (NO PO# on a quote — that's post-quote). Fallback to just `project.name` when no customer #. **G010 is now fully absorbed into F021's quote-heading piece** (needs F021's `customerProjectNumber` field) — build together, after `b034-f005-quote-revision` lands (shared quote region). *(source: Jon 2026-07-13, via Freddy.)*
- **G007 — "Remove leftover TEST upload section from Upload Supplier Quote modal"** [OPEN · LOW] — the Upload Supplier Quote modal shows a "TEST" upload bar along the bottom (orange: `TEST | Test Upload to BC (PRJ402096) → Crum Electric Supply · 2760726-00 · Crum_Quote_2760726-00.pdf`) — a remnant of old test scaffolding, user-facing. Remove it. ⚠ Hardcodes PRJ402096 (a real customer project) → ties to the G005 test-data-hygiene theme. *(source: Jon 2026-07-07 via Intake; promoted by Freddy 2026-07-08.)*
- **G009 — "Test-environment build versioning (v1.23.x-T### + UI badge + T→SHA log)"** [OPEN · MED — test infra] — the test channel (matrix-arc-test) shows the same `APP_VERSION` on every deploy (e.g. `v1.23.3`) → no way to tell one test build from another (fixed-vs-cached confusion; hit repeatedly during B012 P1, forcing hard-refresh guessing). Jon's scheme (2026-07-10): append a **test-build counter** → `v1.23.3-T001`, `-T002`, … bumped each `hosting:test` deploy. Parts: (a) stamp the T-tag in the bundle (bump a `TEST_BUILD` constant per test deploy); (b) a visible **UI badge** on the test channel so testers see the exact build; (c) a **T### → commit-SHA → what-changed log** (e.g. `docs/TEST-BUILDS.md`) for traceability (T001=`93607beb`, etc.). Marc's build/deploy-tooling lane. **DESIGN complete (Marc, ~1-2h, build post-P1):** core cause = `hosting:test` reuses the same bundle `?v=` (=APP_VERSION) every deploy → browser serves cached bundle; the key fix is **cache-busting the bundle `?v=` per test deploy**, with badge+log on top. (a) `TEST_BUILD` const in `public/index.html` + a new `deploy-test.sh` (mirror of deploy.sh): bump T###, rewrite bundle `?v=` → `${APP_VERSION}-${TEST_BUILD}` (the cache-bust), `validate_jsx`, append `docs/TEST-BUILDS.md`, `firebase deploy --only hosting:test,firestore:rules`, commit bump+log to the feature branch — **NO APP_VERSION bump / no git tag / no prod hosting**. (b) badge gated on **IS_TEST_ENV** (existing G005 hostname flag) → renders ONLY on matrix-arc-test, never prod. (c) `docs/TEST-BUILDS.md`: `T### | short-SHA | change | date`. Prod-safe by construction; keeps human T### + SHA-in-log. Build on Jon's go post-P1. **★ REACTIVATED + REFINED (Jon 2026-07-14):** "clean up testing procedures — never sure whether to test on Prod or Test; test versioning is stale/not tracking; make it identifiable so I can confirm the right ENV + the right VERSION; call test versions distinct like **Test V.###** (single incrementing counter, independent of prod semver)." **🔎 Coach scoping the full cleanup:** (a) refined `Test V.###` scheme (independent counter in `TEST_BUILD`, cache-bust bundle `?v=` per test deploy = the staleness root-cause fix); (b) an UNMISSABLE env+version badge gated on `IS_TEST_ENV` ("🧪 TEST · V.007", prod unaffected); (c) `deploy-test.sh` (bumps counter, cache-busts, `TEST-BUILDS.md` T→SHA log, `hosting:test` only — no APP_VERSION bump / no tag / prod-safe); (d) a DRAFT `docs/TESTING-PROCEDURES.md` for Prod-vs-Test guidance **anchored on the critical fact that matrix-arc-test SHARES prod Firestore+BC** (test = different code, same data → disposable projects only, no destructive real-data edits in either env; true data isolation = separate effort under G005). *(source: Jon 2026-07-10 + reactivated/refined 2026-07-14, via Freddy.)*
- **G008 — "Test channel (matrix-arc-test) not in Storage bucket CORS allowlist → page images fail on test"** [OPEN · MED — test-env infra] — on matrix-arc-test.web.app, every pageImage load fails: `ensureDataUrl failed … blocked by CORS policy: No 'Access-Control-Allow-Origin'` for `firebasestorage.googleapis.com` (bucket `matrix-arc.firebasestorage.app`). The Storage bucket CORS allows the PROD origin (matrix-arc.web.app) but NOT the test channel origin. Impact: image-dependent flows break ONLY on the test channel (thumbnails, image-fallback extraction, any `ensureDataUrl` path) — this confounds test-channel matrix runs (surfaced during B012 P1 L5 extraction, 2026-07-09). NOT a prod bug (prod origin allowed) and NOT P1. FIX: add `https://matrix-arc-test.web.app` to the Storage bucket CORS config (`gsutil cors set`). Cross-ref G005 (test-env isolation). *(source: Jon P1 matrix console, 2026-07-09; Freddy read.)*
- **G006 — "Supplier Portal loading copy → 'Matrix ARC AI is currently scanning your quote'"** [RESOLVED — shipped v1.23.2, 2026-07-07 · release `9d89f26b` · quick-win batch] — on the Supplier Portal quote-analysis loading state (currently labeled "Analyzing Your Quote"), change the copy to "Matrix ARC AI is currently scanning your quote." Trivial one-string wording change. *(source: Jon 2026-07-07, via Intake.)*
- **G005 — "matrix-arc-test shares PROD Firestore (not data-isolated)"** [PHASE 1 SHIPPED — v1.23.3, 2026-07-07 · Functions `firebase deploy --only functions` + client `d373a510`; Phase 2 (separate project/test-user) OUTSTANDING] — the test hosting target is in the same Firebase project as prod → same Firestore + Auth, so data-mutation tests there write the SAME DB as production. **The "safe now, all data is pre-launch/test" premise (2026-07-02) is BROKEN: real customer projects already exist in the DB** — proven 2026-07-07 when a B009 repro injected synthetic supplier-crosses onto 11 BOM rows of **PRJ402096, a REAL CUSTOMER project** (assumed sandbox; fully restored via the app's own save handler, no data lost — see [[feedback_confirm_throwaway_before_test_injection]]). So the shared-Firestore hazard is **LIVE now, not a before-launch concern**: any "test" mutation can hit real customer data. **BC blast radius — CORRECTED (Marc G005 Step-1, 2026-07-07):** the injection's BC writes ($42/$99.99) landed in `MATR_SndBx_01152026` — the env the TEST HOST auto-connects to, **likely the ISOLATED SANDBOX (Jon to confirm isolation from prod BC).** So the earlier "reached the real ERP" is softened → probably sandbox-only. **DESIGN IMPLICATION for Phase 1:** the test host appears to ALREADY route BC to the sandbox (per-company `bcEnvironment`), so G005's sandbox-routing (QB) may be partly in place — BUT the `bcGatedFetch` write-BELT is still the guarantee (it blocks mutating verbs on the test HOST regardless of which project's company-env is loaded; a real prod-env project opened on the test host would otherwise still write to prod BC). Coach/Marc: confirm whether the test host always-sandbox-routes vs uses the open project's company env — the belt covers either way. **The confirmed hazard remains the shared FIRESTORE** (real customer projects present, restored near-miss). Mitigations: (a) real test-env isolation (separate Firebase project/DB) — the proper fix; (b) interim discipline — test-data injection only on a Jon-confirmed disposable project, mutate via app save handlers (guards), never raw writes. *(source: Marc #199 live pass 2026-07-02; escalated by the PRJ402096 near-miss 2026-07-07, via Freddy.)*
  - **Brief:** `docs/G005-TEST-ENV-ISOLATION-BRIEF.md` (Freddy, de8fa5ae). Two-axis framing (Firebase data + external side-effects; BC is orthogonal to any Firebase fix).
  - **DECISION (Jon, 2026-07-07): PHASED.** Phase 1 = `IS_TEST_ENV` side-effect firewall (hostname-gated: BC writes no-op, emails suppressed, TEST-MODE banner) + dedicated test company so test data can't collide with real customer projects. Phase 2 (later) = separate Firebase project for true data isolation (Phase 1 flag reused). → routed to **Coach** for feasibility + Phase 1 build plan (answer Brief §6: BC sandbox availability, enumerate side-effect sites, firebaseConfig-swap mechanism, deploy-pipeline changes). Coach plan → Jon approve → Marc build. HIGH-stakes (data layer + ERP) → full cross-check pipeline.
  - **Coach plan:** `docs/G005-COACH-BUILD-PLAN.md` (dfe9ffa1). Verdict FEASIBLE, MEDIUM. Key finding: ALL BC writes are CLIENT-SIDE (~90% via one `bcGatedFetch` wrapper @408) → a client `IS_TEST_ENV` hostname gate kills BOTH demonstrated harms; server threading (callable `isTest` param + trigger doc-marker) only needed for the secondary supplier-quote-trigger→Teams/email harm. BC sandbox `MATR_SndBx_01152026` already exists + per-company env routing already built.
  - **Freddy Analyst Review: SOUND — approve.** (Corrected my earlier "BC harm is server-side" framing — it's client-side.) Honest limit flagged to Jon: Phase 1 does NOT close the Firestore data-collision risk (test company is a convention/access boundary, not a hard wall — shared Firestore); the firewall stops the EXTERNAL harm regardless of open project; data-collision fully closed only by Phase 2. Build notes: client must pass `isTest` at each callable call-site; Marc re-greps server side-effect sites at build to confirm enumeration completeness.
  - **Jon's §11 rulings (2026-07-07):** QB BC → **route to sandbox + belt** (QA: verify `MATR_SndBx_01152026` is live/writable FIRST — if stale, fall back + escalate); QC email → **suppress entirely**; QD → **create a dedicated test company** (isTest doc-stamp approved); QE Anthropic → **leave uncapped**. All match Coach recs. Functions deploy is a separate step (`firebase deploy --only functions`, prod-safe — isTest defaults false).
  - **STATUS: BUILDING (Marc, started 2026-07-07 after the quick-win batch shipped v1.23.2).** Jon gave the go. Marc: verify MATR_SndBx sandbox liveness FIRST (escalate if stale), then build client gates → Functions → test company + banner per Coach's plan. → verify (§10, incl. near-miss replay on test with prod BC watched) → Coach review → Jon deploy checkpoint (hosting + `firebase deploy --only functions`).
  - **★ BUILD FINDING (Marc re-grep, 2026-07-07) — plan enumeration was a FLOOR, not complete.** Coach's §3 said "2 raw-fetch BC-write strays (3595/5643)"; ACTUAL = **~14 mutating BC calls bypassing `bcGatedFetch`/the belt** — PATCH: 3496,3527,3620,4575,5116,5276,5586,5644,5668,5696,22867 · DELETE: 3568,8481 · POST: 5286. **5276+5286 = `bcPushPurchasePrice` = the exact B009 near-miss money-path** → the belt was POROUS on the very path that bit us. Possible EMAIL strays too (raw Graph fetches at 8462 replyAll + 32962 sendMail may be OUTSIDE `sendGraphEmail`'s single gate). **DIRECTION (Freddy authorized):** (a) route all 14 BC raw-fetches through `bcGatedFetch` → ONE true choke point for ALL BC writes (aligns with CLAUDE.md single-source-of-truth principle); ⚠ prod-behavior delta — these 14 gain `bcGatedFetch`'s 429/semaphore handling on PROD too (not IS_TEST_ENV-gated) → Marc verifies safe/beneficial + flags to Coach as a deliberate change; belt-only-inline for any of the 14 that must NOT be semaphore-queued. (b) **treat ALL of the plan's site counts as a FLOOR** — Marc does exhaustive client+server enumeration (emails incl. 8462/32962, server 12 sgMail/4 Teams/3 FCM) + gates everything found; **Coach re-verifies against Marc's exhaustive list at review, NOT the plan's counts.** This is the "missing a site is the residual risk" catch (Freddy Analyst Review build-note) working as intended.
  - **CLIENT HALF code-complete (Marc, `c01e9a53`, not deployed).** Enumeration confirmed the plan under-counted on MULTIPLE dims: BC 2→**14** (all routed through `bcGatedFetch` = single choke point; incl. bcPushPurchasePrice money-path); client email 1→**3** (sendGraphEmail 8330 + replyAll stray 8465 + CADLink sendMail 32967); + `bcEnqueue` gated (6244), rfqUploads `isTest` stamp (19456), TEST-MODE banner. **Prod-delta reviewed:** the 14 gain bcGatedFetch's 429/semaphore on prod — Marc verified all sequentially-awaited, no reorder dependency → semaphore-safe (deliberate consistency gain; Coach to confirm at review). **2 residual stamps → server-side gate (Freddy endorsed):** debugLogs writer is indirect + customer-review doc is created on the EXTERNAL review page (out of app.jsx) → gate `onIssueReported` + `onCustomerReviewSubmitted` server-side by the test-company/isTest instead of hunting the client writers. **Client half Coach-APPROVED (`bda1c9c7`, COACH.md).** All 4 focus areas independently confirmed: (1) prod-delta BENIGN + beneficial (semaphore preserves per-await-chain completion → no reorder/deadlock; money-path throttles unlimited→6 = fixes latent unhandled-429s); (2) enumeration COMPLETE (re-grepped: 0 raw BC mutations remain — all 14 routed, remaining raw BC fetches are GETs correctly un-belted; all 3 email sends gated, no bypass); (3) belt fake-200 reader-safe — NON-BLOCKING note: in the MISCONFIG path (test + non-sandbox env) the caller sees a false `ok:true` (no prod write) — acceptable since sandbox-routing + QA liveness is the primary protection, belt is last-resort; (4) flag/banner byte-identical on prod. **Marc building the server Functions half next → Coach server review (trigger-gate correctness) → §10 verify → Jon deploy checkpoint.**
  - **CODE-COMPLETE (Marc, server `a23f9ba9` + client `c01e9a53`, NOT deployed; validate_jsx OK, preflight-functions PASS).** Server enumeration (re-grepped, plan counts NOT trusted): sgMail.send=**9** (plan said 12), postToTeams=4, sendPushToUser=3. GATED: triggers `onSupplierQuoteSubmitted` (rfqUploads.isTest), `onIssueReported` (companies/{cid}.isTestCompany — the endorsed server-side gate), `onCustomerReviewSubmitted` (reviewUploads.isTest, engineering/index.js:36+163); callables `sendInviteEmail`(+site 18633), `sendEngineerQuestionEmail`(+site 17784), `sendReviewEmail` (defensive). LEFT ON (deliberate, not test-reachable): monitorAnthropicModels alerts, testTeamsWebhook, scrapers/extraction/Anthropic. purchasing/ has ZERO external sends. **⚠ ADVISORY FALSE-POSITIVE:** the pre-commit advisory flagged onCustomerReviewSubmitted's gate "missing" — its risk-matcher only scanned index.js + app.jsx, NOT `functions/engineering/index.js` (the gate IS committed @36+163). → Coach must review engineering/index.js EXPLICITLY. **REMAINING (data, not code):** test-company Firestore setup (companies/{testCid} isTestCompany:true + bcEnvironment.env→sandbox) — needed for the onIssueReported gate + namespacing; best done at the §10 verify. **★ Test-company setup + §10 near-miss replay BOTH need a live co-drive with Jon.** → Coach server review → §10 verify (co-drive) → Jon deploy (2 steps: hosting + functions).
  - **SERVER-HALF Coach review (`05b16239`): ✅ APPROVE committed gates + ⚠ 1 FIX-BEFORE-DEPLOY finding all 3 enumerations MISSED.** `bulkMfrLookup` (functions/index.js:2192) is an UNGATED **SERVER-SIDE BC WRITE** — POSTs BC Manufacturers (2261) + PATCHes ItemCard.Manufacturer_Code (2267) when `dryRun:false`; client-reachable (Bulk MFR Code Lookup tool @app.jsx:46019). Everyone assumed BC writes are 100% client-side → this one writes BC from the SERVER, so the client `bcGatedFetch` belt CANNOT catch it → under a MISCONFIGURED test company (prod env) it writes REAL BC (breaks the belt guarantee; exactly the near-miss class). FIX (~3 lines, callable pattern): client passes isTest:IS_TEST_ENV at 45998/46019; server forces dry-run when data.isTest. **Everything else server-side CORRECT + complete** (engineering/index.js gates confirmed — advisory "missing" was a false positive; triggers early-return reading right markers; callable isTest threading verified both ends + committed; enumeration complete; purchasing zero BC writes). 2 NON-BLOCKING (prod-preserving): admin-alert emails 165/226/300 left-on company-scoped; onIssueReported isTestCompany gate fails-OPEN on read-error. **DECISION (Jon, 2026-07-07): FIX-FIRST → FIX DONE (Marc, `f4880084`; validate_jsx OK, preflight PASS).** `_skipMfrWrites = dryRun || data.isTest===true` skips the POST+PATCH when isTest (lookup/return still runs → tool works in test, no BC write; status 'dry_run'); both client call sites pass isTest:IS_TEST_ENV (45998/46019). Closes the one exception to "BC writes are client-side." **G005 P1 FULL delta = c01e9a53 (client) + a23f9ba9 (server) + f4880084 (fix).** → Coach re-checks JUST the f4880084 delta → §10 verify (co-drive) → Jon deploy.
  - **DEFERRED as G005 Phase-1 FOLLOW-UPS (Marc + Freddy, prod-preserving, not in this batch):** (a) monitorAnthropicModels admin-alert emails (165/226/300) left-on — company-scoped, contained to test-company admins; a scheduled monitor has no client caller to thread isTest + hard-gating risks suppressing prod ops alerts. (b) onIssueReported isTestCompany gate fails-OPEN on a company-read error — DELIBERATE/prod-safe (fail-closed would suppress real prod admin alerts on a transient Firestore blip; the rare test-issue-leak edge is the lesser evil). Capture as follow-ups; revisit if Phase 2 (separate project) doesn't moot them.
  - **CODE FULLY COACH-APPROVED (`e076b902`).** Delta re-check ✓ (write block skipped when isTest, both client sites thread the flag). **Definitive server-BC-write sweep:** exactly 2 server-side BC writers exist — `bulkMfrLookup` (NOW GATED f4880084) + `writePricesToBC` (codaleScheduler.js:202/218) which is NOT test-reachable (reached only by codaleRunScrape [zero client call sites] + codaleScheduledScrape [cron]; the only client-called Codale callable codaleTestScrape is READ-ONLY) → out of Phase-1 scope. **Latent follow-up:** gate codaleRunScrape if ever UI-wired. **NET: zero test-reachable ungated server-side BC writes.** **STATUS: G005 P1 code COMPLETE + APPROVED (c01e9a53+a23f9ba9+f4880084); §10 LIVE VERIFY IN PROGRESS (Jon+Marc co-drive, started 2026-07-07; Marc drives controlled tab, reports results → Coach results-review → deploy).** **DEPLOY-SEQUENCING (Jon ruled A, 2026-07-07):** client is on TEST hosting; server gates need Functions deployed (shared test+prod, but prod-safe — gates default-false → prod byte-identical, reversible). **A = deploy Functions NOW → run the FULL §10 verify (client + server steps) on test → then the final client HOSTING→prod flip is the last Jon go.** Proves server gates BEFORE the client reaches prod (matches the build's prove-before-ship rigor). Marc deploys Functions + sequences it into the verify; Jon's involvement kept near-zero (one batched inbox/Teams-empty check).
  - **VERIFY RESULTS (Marc, autonomous, 2026-07-07):** ✅ **FUNCTIONS DEPLOY SUCCESS** (all 32 functions incl. gated triggers/callables/bulkMfrLookup; prod-safe default-false; deploy STEP 1 of 2). ✅ **PASS: §10-1** (IS_TEST_ENV true on test), **§10-6 banner**, **★ §10-1+2 CORE BC FIREWALL / money-path** (bcGatedFetch — the single choke point for all 14 BC writes — BLOCKS a non-sandbox mutating write → `_testEnvBlocked`, no real write, "[TEST-ENV] BC write suppressed"; ALLOWS a sandbox write → reaches real BC; verified without touching any real project), **§10-3 bulkMfrLookup** (dryRun:false + isTest:true → patched:0, zero BC writes). ⏳ **PENDING** (same isTest/isTestCompany mechanism on other surfaces, Coach-code-approved): §10-4 client email suppress, §10-5 server triggers, §10-6 callables, §10-7 extraction-works + bcEnqueue, §10-8 prod regression. **Marc near context limit after an exceptionally long session → verify TAIL runs as a fresh focused continuation (new Marc context + re-linked controlled tab) before the final hosting→prod flip.** THE MONEY-PATH (the demonstrated harm) IS PROVEN; Functions safely live.
  - **COACH RESULTS-REVIEW (`ca66efd7`): both ✅.** (1) **Money-path proof SOUND + SUFFICIENT** — bcGatedFetch is the single choke point + enumeration verified complete (all 14 writes funnel there, zero raw-fetch mutations remain), so proving the choke point both directions proves the ENTIRE BC-write class in one test + bulkMfrLookup tested → airtight money-path coverage. ⚠ **PRECISION (don't over-read "harm closed"):** this closes the **BC/ERP-WRITE harm**. The near-miss ALSO had a **Firestore data-collision** (synthetic crosses on PRJ402096) — that's the test-company convention's scope = **Phase-1 PARTIAL / Phase-2 full**, NOT proven by the BC test. Report as: BC/ERP harm = proven closed; data-collision = per-plan partial, unchanged. (2) **Tail SAFE-TO-DEFER** — §10-4/5/6/7/8 exercise the same isTest mechanism already proven live; **the PROD FLIP is prod-safe BY CONSTRUCTION** (IS_TEST_ENV false on prod → gates inert → byte-identical; only deltas = 14 BC writes gaining semaphore [benign] + B001 trailing-dot strip [no-op]) → the flip does NOT depend on the tail for prod safety. Note: §10-4 client-email test requires the gated CLIENT bundle on the test host (MET — Marc deployed it). §10-8 prod-regression post-flip.
  - **TAIL BLOCKER + FINDING (Marc, `docs/G005-VERIFY-TAIL-REPORT.md`, 47bf6053):** re-confirmed money-path LIVE (§10-1/2/6 on the controlled test tab). BUT the mutating tail (§10-4 client email / §10-5 server-trigger inject / §10-6 callables / §10-7 extraction) CANNOT run cleanly — **there is NO isolated test company:** test host = Jon's REAL company "Matrix Systems LLC" (isTestCompany=FALSE), companyId is 1-per-user-profile with NO switcher, matrix-arc-test shares PROD Firestore. Setting isTestCompany:true on the real doc would REGRESS prod (onIssueReported would skip real issue notifications). ⇒ **the Phase-1 "dedicated test company" mitigation is BLOCKED by the single-company-per-user architecture — it needs a separate test USER account (or Phase 2).** So the mutating tail is DEFERRED (covered BY-CONSTRUCTION per Coach: IS_TEST_ENV guard is the first statement of the sole gated choke points + server gates deployed default-false; live email/trigger demo needs a test user). **This is a material G005 finding — strengthens the Phase-2 (separate project + test user) case.** Marc's options: A defer tail → final flip (his rec; Coach-blessed flip-safe-by-construction); B bounded throwaway "ZZ-G005-VERIFY-DELETE" project injection (needs Jon OK); C stand up a test user first.
  - **✅ PHASE 1 SHIPPED (Jon ruled flip-now; Freddy ran deploy.sh) — prod v1.23.3, `d373a510`.** Both deploy steps done (Functions step 1 + client flip step 2). Money-path harm PROVEN CLOSED. **OUTSTANDING for next session / Phase 2:** (1) **§10-8 prod-regression smoke** — FIRST thing next session: confirm on prod that a BC write + an email fire NORMALLY (prod byte-identical); (2) **mutating-tail live demo** (§10-4/5/6/7 email+trigger+extraction isolation) — BLOCKED until a dedicated test USER account exists (1-company-per-user; covered by-construction meanwhile); (3) **Phase 2** — separate Firebase project + test user = the real data-collision fix AND enables the tail; (4) 2 non-blocking follow-ups (monitorAnthropicModels alerts left-on; onIssueReported fail-open-on-read-error); (5) latent: gate codaleRunScrape if ever UI-wired. §10 steps (Coach): 0 setup test-company(sandbox)+banner; 1★ near-miss replay (supplier-apply w/ cross → prod BC untouched, write in sandbox); 2★ belt misconfig proof (non-sandbox env → bcGatedFetch no-ops); 3★ bulkMfrLookup dry-run; 4 client email suppressed; 5 server triggers skip; 6 callables suppressed; 7 left-on (extraction works, bcEnqueue suppressed); 8 PROD regression (byte-identical). Steps 1/2/3 = critical money-path proofs.
- **G004 — "Tool-permission allowlist for suppressible prompts"** [CLOSED — WON'T-DO · Jon 2026-07-06: "this will not work"; its only verify path was the now-cancelled G002 reboot] — pre-populate `.claude/settings.json` `permissions.allow` (committed → every new session inherits it) to cut the SUPPRESSIBLE (non-comm) tool prompts. *(source: Jon 2026-07-02.)* Safe entries only: read-only tools (Read/Grep/Glob), non-destructive git (status/diff/log/show/rev-parse/branch/add/commit/push/pull/fetch/stash), node (validate_jsx/`--check`), `pwsh`. Does NOT touch the `send_message` comm prompt (hardcoded — G001). **VERIFY at the G002 reboot:** sessions boot with it → confirm the target prompts (esp. Marc's PowerShell) actually stop; if `Bash(pwsh:*)` doesn't cover the PowerShell **tool** invocations, Marc adjusts the syntax. No destructive commands allowlisted.
- **G003 — "Dez live status board + progress log"** [Building — Freddy pings; Dez displays + owns STATUS.md] — Dez always shows the current task being worked on (glanceable in her session) + keeps a permanent progress log, so Jon can see team state at a glance. *(source: Jon 2026-07-02, via Freddy.)*
  - **Design:** Freddy (hub) sends Dez a compact status block on each meaningful work-comm / state-change (Marc & Coach route through Freddy → no peer sends; keeps hub-and-spoke). Format: `B/F/G### — Title` / `• one-liner` / `• STATUS: who's doing what now`. Dez **displays** the latest block live (Jon glances at her session) and **appends periodic timestamped snapshots to `STATUS.md`** (Dez sole-writer — one-writer-per-file preserved; NOT TODO.md). First Freddy→Dez ping prompts Jon once then silent (G001); pings go to Dez, never interrupt Jon.
  - **Docs to bake in before the G002 reboot:** Dez role + `STATUS.md` ownership → CLAUDE.md (Coach); Dez onboarding must include the status-board duty so the fresh post-reboot Dez boots as the board (team-startup/Dez-onboarding — note: Dez isn't yet in team-config roles / the startup templates; gap to close as part of G002).
- **G002 — "Automate the 4-session team startup boot"** [CLOSED — WON'T-DO · Jon 2026-07-06: "not moving forward with this" — launcher effort dropped; the standing 4-session model + away-mode/subagents is the settled approach. Prior status retained below for history: BUILT — pending live fresh-boot calibration; 2026-07-03: AHK path baked (`01099977`), desktop shortcut `Boot ARC Team.lnk` + printable `ARC-Team-Startup.html` runbook created, `-WhatIf` clean] — boot the CCD team with minimal human interaction. Jon chose **Option A** (~95% automation, accept ~6 one-time Allow-Once clicks). **Marc delivered `1ba33d58`, then v2 `2d1cb97c`** (`tools/team-boot/`: `team-boot.ps1` + `lib/*.ahk` + `onboarding/*.txt` 4 blocks + README). **v2 addressed all 12 of Coach's static-review findings** (H1 Win32 EnumWindows handle-capture → paste/title hit the exact new window; H2 new-window assertion → aborts instead of stacking under single-instance; H3 session1 = trimmed launcher-mode Freddy block per Freddy's resolution; M1 auto-title OFF by default; M2 clipboard-staged emoji titles; M3 title-before-submit; M4 peer blocks "post in-window, Freddy pings"; M5 README knobs reconciled; L1–L4). Parses clean; `-WhatIf` runs end-to-end. **STILL NOT live-tested** — the empirical CCD-GUI bits (exe spawns a new window? handle-paste hits the right session? title timing) need ONE calibration pass on Jon's desktop (set `$CcdExe`, run → 4 titled+onboarded windows → comms-check; enable `$AutoSetTitle` only after `set-title.ahk` calibrates). **Coach v2 re-review APPROVED for calibration (`20fa8b79`)** — 3 HIGH fixes sound. 2 LOW live watch-items noted.
  - **🔴 CALIBRATION FINDING (2026-07-02) — WINDOW-MODEL MISMATCH → REWORK.** CCD is NOT window-per-session. Jon confirmed: **"New Session" (Ctrl+N, to-confirm) creates a session in the SAME window (switches to it)** — no new OS window. Separate windows only via **manual Shift+drag tear-off** of the session. CCD is also a single-instance Store app (launch-exe won't spawn windows). → The launcher's **window-handle-capture approach (the whole H1/H2 machinery) is built on a wrong model** and must be reworked. NEW approach (routed to Marc): focus CCD → `Ctrl+N` → paste the onboarding block into the now-current session → repeat ×4 in ONE window (no handle diffing). **Tear-off to separate windows + titling stay MANUAL** (Shift+drag is too fragile to automate). Automation scope shrinks to: auto-create + auto-paste the 4 blocks; Jon does window arrangement + titles. **v3 REWORKED (`c18a0d24`):** window-handle machinery dropped; new flow = find the CCD window → per session `Ctrl+N` → paste block → submit ×4; one AHK helper (`new-session-paste.ahk`); preflight requires CCD already open. Tear-off + titling MANUAL (Marc did not auto the tear-off). **Sequencing (approved):** session1-freddy = verify state → PAUSE, ask Jon to tear-off + title peers + reply "go" → THEN comms-check (peers must be titled first since Freddy locates by title). New #1 calibration risk (replaces H1/H2): does `Ctrl+N` reliably create+focus a new session and does the paste land in the NEW session? (knobs: `$DelayAfterNewSession`, `$ClickInputFirst`, `$NewSessionHotkey`=^n to-confirm). Parses + `-WhatIf` clean. Coach v3 re-review APPROVED (77ba2797/83af47d4). **CORE MECHANIC CONFIRMED (2026-07-02, Jon manual test):** Ctrl+N DOES create + focus a new session (stacks it on top in the base CCD window; Shift+drag tears it out to a separate window — the manual step). So the launcher's `Ctrl+N`→paste-into-focused-new-session approach is mechanically sound. **Full launcher run DEFERRED to a clean fresh-boot** (running it now, with the 4 standing windows up + Marc mid-#199, would overlay a live session — a boot-launcher belongs at a teardown). Relay the mechanic-confirmed to Marc when G002 resumes. *(source: Jon 2026-07-02, via Freddy.)*
  - **Calibration sequencing (chicken-and-egg):** the launcher boots a FRESH team, but calibrating it needs Marc alive to iterate on Jon's observations. So calibrate FIRST with the current team still up (Marc tweaks knobs per Jon's runs), THEN close-out → teardown → run the calibrated launcher as the real acceptance test → #199. Coach: static script/README review now; live verification after the calibration pass.
  - **Research (CC-guide, 2026-07-02):** FULL zero-interaction boot is NOT possible — the cross-session `send_message` "Allow Once" prompt is a deliberate, unsuppressible security gate (docs-confirmed; matches G001). Desktop sessions **cannot** be created programmatically with a preloaded prompt (deep-link/CLI initial-prompt works for TERMINAL sessions only, which can't use the send_message bus); agents cannot self-title.
  - **Options:** **(A)** ~95% automation — PowerShell launches the 4 CCD windows + AutoHotkey/Power Automate Desktop pastes each onboarding block + sets titles; human approves ~6 one-time Allow-Once prompts at startup (bounded, one-time-per-pair per G001). Keeps the current architecture (independent windows, cross-session bus, browser control). **(B)** Collapse to ONE session using **Agent Teams** (in-session subagents) → zero Allow prompts, fully automatable — but teammates are **ephemeral** (die on lead-session close), no independent per-role windows, resume/rewind loses them. Bigger architecture change. **(C)** Headless SDK / `claude -p` — loses the cross-session bus + browser control; unsuitable for the interactive workflow.
  - **Freddy rec:** **Option A** — the Allow clicks are a small one-time startup cost, not per-message, so they don't justify losing persistent windows/bus/browser. Build = a Windows launcher script (Marc's lane; NOT ARC app code). GUI-automating the Allow-Once *click* itself is possible but fragile + defeats the security intent — do NOT.
- **G001 — "Suppress the Allow-Once prompt on cross-session sends"** [Verified — NOT fixable; accepted limitation] — goal was to stop Jon being desk-tethered to approve the per-send "Allow Once" `send_message` prompt. *(source: Jon 2026-07-02, via Freddy; captured FEAT, reclassified G — dev-tooling/infra.)*
  - **Feasibility scoping:** native remote approval from phone/web = not supported (Remote Control steers a session but doesn't surface permission prompts remotely). Allowlisting the tool: CC docs claimed generic MCP tools can be allowlisted, but the `send_message` tool description says "ALWAYS prompts" and the 2026-07-01 team lore said "hardcoded, not suppressible."
  - **CLEAN TEST (2026-07-02) — DEFINITIVE, allowlist does NOT work.** Rebooted Coach in a fresh session (no per-target approval memory) WITH the `.claude/settings.json` allow rule committed + loaded, then had it send a reply. **Jon-observed (screenshot): the "Allow Once" prompt STILL fired in Coach's window**, and the prompt UI's own text reads: *"This tool requires explicit approval regardless of permission mode."* → The allow rule / permission mode **cannot** suppress it. The original "hardcoded / not-suppressible" lore was CORRECT. (Earlier "suppressible after reload" reads were a per-target-approval-memory red herring — a *second* send to an already-approved target is silent regardless of any rule; that is not suppression.)
  - **Disposition — ACCEPTED LIMITATION, no config fix.** The FIRST send cannot be pre-approved away (no remote-approval, no allowlist/mode escape). The committed allow rule (`a1e786d3`) is a NO-OP → reverted; SESSION-STATE/CLAUDE.md "correction" reverted (original hardcoded wording stands).
  - **PRACTICAL SEVERITY = MODERATE (corrected 2026-07-02).** An earlier claim of "one-time per pair, then silent" was TOO OPTIMISTIC. The prompt **RECURS**: rapid successive sends to the same target within a short window are silent (why Freddy→Coach's 2nd send didn't prompt), BUT it re-fires after a gap / on reboot / periodically — e.g. **Marc→Freddy re-prompted Jon well into the session** despite many prior Marc→Freddy sends. Exact caching/re-prompt trigger is NOT characterized (mis-modeled twice — not worth more guessing). SOLID: config/allowlist/mode CANNOT suppress it, ever. So the comm-prompt is a **recurring, unavoidable approval cost** of the 4-session model. Mitigations: batch sends; repo-commit handoff for unattended stretches; stuck-on-Allow monitor stays useful. This recurring cost strengthens the eventual case for **G002-Option-B (one-session subagents)** if the friction grows.

## Round 1 (firestore.rules + deploy.sh diff)

1. **RESOLVED** [Verified] — `701d693` (2026-05-07). Firestore rules: `rfqUploads` write access not role-gated.
   CREATE was wide-open to any authenticated user (including view-only members) and allowed
   spoofing someone else's `uid`. UPDATE/DELETE only matched `uid` so teammates with edit role
   couldn't dismiss/delete a coworker's RFQ. Fix added a `_writerIsCompanyWriter(cid)` helper
   inside the `match /rfqUploads/{token}` block; CREATE now requires uid-self-match + non-`view`
   role; UPDATE/DELETE auth path now extends to same-company writers; legacy uid-only docs and
   solo accounts (no companyId) preserved.
2. **RESOLVED** [Verified] — `701d693` (subsumed by #1, verified 2026-05-07). The CREATE rule now reads
   `request.resource.data.get('companyId', null) == null || _writerIsCompanyWriter(request.resource.data.companyId)`.
   The helper does `exists(...members/$(request.auth.uid))`, so a writer setting `companyId`
   to a company they aren't a member of fails the existence check and the create is rejected.
   The legacy/solo bypass (`companyId == null`) is intentional — those docs are uid-only by
   design and don't participate in team-scoped queries.
5. **STALE** [Verified] (verified 2026-05-07) — Firestore rules: "Missing `rfq_history` match rule." The
   path `users/{uid}/rfq_history` is fully covered by the catch-all
   `match /users/{uid}/{document=**}` rule at `firestore.rules:12-14`, which gates read/write
   on `request.auth.uid == uid`. Same pattern as `users/{uid}/projects`, `users/{uid}/config`,
   etc. No gap; no fix needed. Kept as a record of what was checked.

## Round 2 (functions/index.js diff)

6. **OPEN** [Backlog] — Stale API key caching in `_resolveAnthropicKey` (~line 2149). Cached key isn't
   invalidated when an admin rotates the Anthropic key in Settings → API. Calls keep using the
   old key until the function instance is recycled.
7. **OPEN** [Backlog] — Ledger schema mismatch — server vs client. Server writes one shape, client reads
   another, leading to monthly spend being under-counted in the toolbar pill.
8. **STALE** [Verified] (verified 2026-05-07) — "Unawaited `_writeDebugLog` — fire-and-forget risks lost
   writes." The function is actually `logDebugEntry`, defined in `public/index.html:277` and
   `public/modules/shared.js:201`. It is BROWSER-side only — there is no Cloud Function
   equivalent. In browser code, `await`-ing the log write blocks the UI without improving
   durability (tab-close before write completes is solved by `navigator.sendBeacon`, not by
   await). The codebase already awaits at `shared.js:329` (user-reported issue submit) where
   the caller actually needs the write to complete before showing success UI. The mixed
   pattern is deliberate, not a bug.
9. **RESOLVED** [Verified] — `b33df02` (2026-05-07). Prompt injection via `pageNumber`. Note: the original
   finding mis-located the vector in `functions/index.js`. The actual interpolation lives in
   `src/app.jsx:9588` (the `extractBomPage` PDF-native path). Cloud Function `extractBomPage`
   referenced by the client doesn't currently exist in `functions/index.js`. Fix added a
   bounded-positive-integer validator at the top of `extractBomPage` covering both the
   server-callable path and the direct-API path. Hard-throws on invalid input.
10. **OPEN** [Backlog] — Duplicate Firestore member queries in email fan-out. Same `members` collection
    queried twice per recipient when sending engineer-question / supplier-quote notifications.
    Cache once, reuse.

## Round 3 (deploy.sh re-review, 2026-05-07)

Stale Round 1 findings #3, #4, #11 were dropped — they referenced a deploy.sh state that no
longer matches what's committed. Re-reviewed deploy.sh against current reality and found:

12. **RESOLVED** [Verified] — `29bec5d` (2026-05-08). Adds the `node validate_jsx.js` build step before
    `git commit`, plus the bundle `?v=` cache-bust sed (so the bumped bundle URL forces a fresh
    fetch on every deploy). Same commit also rewrote the original DECISION(v1.19.769) comment
    that claimed a nonexistent placeholder-restore step, and added the bundle `?v=` verifier
    tracked separately as #16 below.
13. **OPEN** [Backlog] — Hardcoded `git push origin master` and `git push origin "$NEW_VERSION"` regardless
    of current branch. Running `deploy.sh` from a worktree branch would push the wrong ref or
    refuse the push. Fix: capture `git rev-parse --abbrev-ref HEAD` and either gate on `master`
    or push the current branch.
14. **RESOLVED** [Verified] — `b61eedf` (2026-05-07). Added a post-sed `grep -q` verification that the
    replaced `APP_VERSION="$NEW_VERSION"` actually exists in `public/index.html`. If not,
    aborts with a clear error message naming the expected pattern and the file to inspect,
    rather than letting the failure cascade into a confusing downstream "nothing to commit".
15. **OPEN** [Backlog] (ELEVATED) — No functions deploy + no preflight invocation. `deploy.sh` runs
    `firebase deploy --only hosting`. Cloud Functions changes need a separate manual
    `firebase deploy --only functions` (per CLAUDE.md). The toolkit's `tools/preflight-functions.sh`
    isn't wired in anywhere. Fix: either auto-detect functions changes and run the preflight,
    or add a `--with-functions` flag.
    **Elevation (Coach C22, 2026-06-03):** #82 demonstrated the cost — a full verification
    cycle (Cloud Functions REST API → `generateDownloadUrl` → download deployed source archive
    → byte-for-byte diff) was required to answer "are functions live?" because no deploy audit
    trail exists in the repo. Recommend minimum viable fix: a deployed-vs-committed
    function-hash check runnable from the repo, before any larger "fold functions into
    deploy.sh" work.
16. **RESOLVED** [Verified] — `29bec5d` (2026-05-08, caught during pre-merge review, resolved in same commit).
    Added `grep -q` verification on the bundle `?v=` sed in `deploy.sh`, mirroring #14's APP_VERSION
    verifier. sed exits 0 even with no match, so without this the deploy could silently ship
    without busting the browser cache if the `index.bundle.js?v=` pattern ever shifts (e.g. someone
    moves the bundle to a `<link>` import or drops the query param). Same error-message format
    and abort behavior as the APP_VERSION verifier.

## Round 4 (caught during pre-commit review of merge resolution, 2026-05-08)

17. **RESOLVED** [Verified] — `0651a73c` (2026-07-02, subagent-lane trial: Marc-subagent applied `.catch(()=>{})` @app.jsx:6867, Coach-subagent + pre-commit review both APPROVE; ships on next deploy). Fire-and-forget call to async `_showPopupBlockedFallback` from the synchronous
    `arcDocOpen` helper in `src/app.jsx`. Source commit `3fd29f6`
    ("arcDocOpen: drop features string so window.open returns a normal tab"). The fallback is
    invoked without `await` from a non-async caller, so any rejection inside it (e.g. an
    `arcConfirm` rejection — unlikely in practice but possible if the dialog host unmounts mid-
    prompt) surfaces as an unhandled promise rejection. Low severity — the popup-blocked path is
    rare and the rejection wouldn't corrupt state. Fix: either wrap the call site in
    `.catch(()=>{})` to swallow benign rejections, or refactor `arcDocOpen` itself to be `async`
    and `await` the fallback. Not for the current deploy window.

## Round 5 (orphan Cloud Functions, caught during 2026-05-07 deploy)

18. **RESOLVED** [Verified] — `904a60b`, `edeede1` (2026-05-12, deployed to production) —
    Two Cloud Functions in production had no local source. One (`extractBomPage`) is on
    the active BOM extraction path — pressing Y at firebase's deletion prompt would have
    broken production.

    The orphan functions are `extractBomPage(us-central1)` and
    `monitorAnthropicModels(us-central1)`. `firebase deploy --only functions` prompts to
    delete both on every run. **DO NOT press Y without investigation first.** Until
    resolved, either skip `--only functions` deploys, or always answer N to the deletion
    prompt.

    Investigation needed:
    (a) Where the deployed source for each function originally came from — check
        `git log --all -- functions/index.js` for commits referencing these names
        that may have been later removed/refactored.
    (b) Whether each function is actively called by the app — search `src/app.jsx`
        and `public/` for references to both function names.
    (c) Once known, decide whether to restore source from history or deliberately
        delete from production.

    **Preliminary investigation (2026-05-07):**

    *`functions/index.js` git history (`git log --all --oneline -- functions/index.js | head -20`):*
    Last commit touching `functions/index.js` is `3b90e09` "Diagnostic backlog:
    rules, functions, SW (deployed across v1.19.955-.964)". Nothing after that.
    No commit on any branch references `extractBomPage` or `monitorAnthropicModels`
    in the `functions/` tree. CLAUDE.md attributes `extractBomPage` to v1.19.981 —
    so the function was added to production ~25 releases AFTER the most recent
    `functions/index.js` commit. **The source was deployed via
    `firebase deploy --only functions` from an uncommitted working tree and
    never written back to git.** Same situation almost certainly applies to
    `monitorAnthropicModels`. This is deploy-without-commit drift; the
    deployed function bodies are recoverable only from a Firebase console
    download or whatever local working copy originally produced them.

    *`extractBomPage` references in source (`git grep -n 'extractBomPage'`):*
    **Actively called from production code path.** `src/app.jsx:9702` instantiates
    the callable: `fbFunctions.httpsCallable("extractBomPage", {timeout:300000})`.
    Called via `extractBomPageViaServer` (line 9701), which is the server path
    `extractBomPage` (client wrapper, line 9757) takes when `originalPdfPath`
    + `pageNumber` are present. Falls back to direct Anthropic API only on
    server error. The client wrapper is invoked from at least five extraction
    flows (`src/app.jsx:11973, 11990, 14096, 21661, 21873`) — covers the
    primary "first pass" extract, L3 auto-retry, native-PDF fast path, and
    two re-extract paths. **Deleting the production function would break
    BOM extraction for every user that lands on the server-side path.**
    `storage.rules:11` and `CLAUDE.md:240` also reference it. Restore source
    from history is mandatory before any next `--only functions` deploy.

    *`monitorAnthropicModels` references in source (`git grep -n 'monitorAnthropicModels'`):*
    **Zero matches.** No client code calls it; no docs reference it; no other
    function references it. Most likely a scheduled function that runs
    server-side only on a cron trigger (synthetic Anthropic model-health
    monitor — referenced in earlier session notes as a daily monitor added
    around v1.19.990). If kept, source still needs to be restored from
    whatever working tree originally deployed it. If purpose is no longer
    needed, deletion from production is safe — no caller will break.

    Asymmetric resolution: `extractBomPage` source MUST be restored before
    next functions deploy (production-critical); `monitorAnthropicModels`
    source restoration is optional pending decision on whether the daily
    monitor is still wanted.

    **Session 3 update (2026-05-08, CLEANUP_PLAN Phase 3B):**

    *Latent deploy-blocker discovered and RESOLVED (`ee93e4c`):* The committed
    `functions/index.js:25` was already calling `require('./ecos')`, but
    `functions/ecos/index.js` (Phase-1 ECO Firestore-trigger module — defines
    `onEcoCreatedCompany`, `onEcoCreatedUser`, `onEcoUpdatedCompany`,
    `onEcoUpdatedUser`) was untracked. A `firebase deploy --only functions`
    from a clean checkout would have failed at module load with
    `Cannot find module './ecos'`. Same drift pattern as `validate_jsx.js`
    (Session 2). Committed in `ee93e4c` alongside the orphan-support modules
    `functions/bomPrompt.js` (mirrors `BOM_PROMPT` from `src/app.jsx`,
    consumed by `extractBomPage`) and `functions/models.js` (defines
    `ANTHROPIC_MODELS` + `MONITORED_MODELS`, consumed by
    `monitorAnthropicModels`). `./tools/preflight-functions.sh` now passes
    cleanly.

    *Source recovery for `extractBomPage` and `monitorAnthropicModels` —
    REMAINS OPEN, deferred to a dedicated session:* Phase 3C blocked on the
    main-checkout machine — `gcloud` and `gsutil` are not installed
    (`which gcloud` empty; standard Windows install paths absent;
    `winget list --id Google.CloudSDK` hung). Three documented paths forward
    when ready to resume:

    1. **Install Google Cloud SDK + use `gsutil`/`gcloud`** (recommended).
       Native installer at `https://cloud.google.com/sdk/docs/install#windows`.
       After install + `gcloud auth login`:
       ```
       gcloud functions describe extractBomPage --region us-central1 \
         --project matrix-arc --format=json
       gcloud functions describe monitorAnthropicModels --region us-central1 \
         --project matrix-arc --format=json
       gsutil ls gs://gcf-sources-*matrix-arc*/
       gsutil cp gs://gcf-sources-*/<archive>.zip ./recovered-source.zip
       ```
       Reliable, scriptable, exact bytes of deployed source. ~5 min one-time
       setup; same tooling will be useful for any future Cloud Functions /
       GCS recovery work.

    2. **Firebase Console UI** (zero install). Open
       `https://console.firebase.google.com/project/matrix-arc/functions`,
       click each function, view "Source" tab, copy-paste back into
       `functions/index.js`. Manual; copy-paste error risk; no checksum or
       archive. Faster if gcloud install is undesirable.

    3. **REST API via `firebase login:ci` token**. `sourceUploadUrl` and
       `sourceArchiveUrl` are exposed by the Cloud Functions REST API.
       Workable but more code than option 1 is worth.

    The functional support modules are now committed, so once the consumers
    are recovered, integration into `functions/index.js` should be
    straightforward (`require('./bomPrompt')` and `require('./models')`
    already-importable).

    **Resolution (2026-05-12, deployed to production):**

    Both functions restored in `functions/index.js` and deployed. Firebase
    no longer prompts to delete them on `firebase deploy --only functions`.

    `extractBomPage` (`904a60b`): HTTPS callable, Opus + thinking, PDF-native
    and image-fallback paths, 540s timeout, 1GB memory, max 10 instances.
    pageNumber capped at 50 (server-side). Shared `resolveAnthropicKey`
    helper (company-first, user-fallback) and `recordAnthropicUsage` (atomic
    FieldValue.increment ledger update). Security fix (`edeede1`): `pdfPath`
    scoped to `originalPdfs/{uid}/` — blocks cross-account file reads.

    `monitorAnthropicModels` (`904a60b`): PubSub scheduled daily 06:00 MDT,
    probes each model in `MONITORED_MODELS` with a minimal 1-token call,
    posts failures to Teams webhook if configured. Uses dedicated
    `ANTHROPIC_API_KEY` env var for unattended operation — gracefully skips
    if not set. Env var still needs to be configured in Firebase to activate.

    Remaining housekeeping (non-blocking):
    - Set `ANTHROPIC_API_KEY` env var in Firebase for the monitor
    - Node.js 20 runtime deprecated 2026-04-30, decommissioned 2026-10-30 —
      upgrade `functions/package.json` engines to Node 22 in a future session
    - ~~**WATCH:** On next BOM extraction, check browser console for
      `[BOM EXTRACT/server] ok` confirming the restored `extractBomPage`
      Cloud Function is being hit.~~ **Confirmed working (2026-05-20):**
      Noah's PRJ402101 extraction hit the `bom-region-crop` server path
      successfully. Token limits subsequently bumped 16K→64K (see #37).

## Round 6 (user-reported, 2026-05-08)

19. **RESOLVED** [Verified] (b492069, 64ddd51, deployed in v1.19.1004 / a730a4e) —
    Project Line Item disappears when drawings are dropped onto a freshly-added
    panel. Original capture said "BOM line item" — incorrect; the actual
    symptom is the entire Quote Line / panel card vanishing while the
    "Awaiting confirmation…" bg-task chip persists in the toolbar.

    **Root cause** (verified via Claude-in-Chrome instrumentation hooking
    `DocumentReference.prototype.set/update` plus a React fiber walk):

    1. `addPanel()` at `src/app.jsx:29142` did not call `safeSave` — the new
       panel lived only in React state, never persisted to Firestore.
    2. `addFiles` → `bgStart` → `rbgStart` writes to
       `companies/{cid}/activeExtractions/{uid}_{taskId}` on every drop and
       again on every `rbgUpdate` (~2s heartbeat).
    3. The `activeExtractions` `onSnapshot` listener at line 31147 calls
       `setProjectRemoteTasks(fresh)` with a NEW array reference each time
       (`Object.is([], [])` is false), invalidating the project-doc effect's
       deps `[init.id, uid, projectRemoteTasks]` at line 31480.
    4. The project-doc `onSnapshot` effect re-runs: cleanup unsubs, new
       listener subscribes, Firestore fires the initial snapshot synchronously
       from cache.
    5. The original `let firstSnapshot=true` (effect-instance-scoped, recreated
       on every effect run) treated every re-subscribe as a fresh mount,
       calling `setProject(migrated)` unconditionally with Firestore data —
       which lacked Panel 2 because step (1) never persisted it. Result:
       `ProjectView.state.panels` collapsed to `[P1]`. PanelListView received
       the stale state as a prop and rendered only Panel 1. The chip persisted
       because `_bgTasks[panelId]` is module-scope and outlives the unmounted
       PanelCard.

    **Forensic confirmation:** during repro, the console emitted exactly 8
    `[CONCURRENT] Initial load — synced to Firestore truth` log messages
    spaced ~2s apart — matching the `rbgUpdate` throttle interval and proving
    the firstSnapshot path was firing repeatedly.

    **Fix (v1.19.1004):**
    - **A.** `addPanel` now calls `safeSave(uid, updated)` after `onUpdate`,
      mirroring `addServiceCard`. New panels are persisted to Firestore
      immediately, so any re-subscribe that does fire returns `[P1, P2]`.
    - **C.** `firstSnapshot` promoted from effect-instance `let` to component-
      mount `useRef` (`didInitialFirestoreSyncRef`). "First" now means "first
      ever for this mount of ProjectView", not "first per re-subscribe".
      Also: dedicated `useEffect(()=>{ref.current=false},[init.id])` resets
      the flag if `ProjectView` ever receives a different `init.id` without
      unmounting (defensive — current navigation always unmounts).

20. **OPEN** [Backlog] — `deploy.sh` cache-bust verifier doesn't cover bundle regeneration.
    The `grep -q "index.bundle.js?v=$NEW_VERSION"` check at `deploy.sh:48`
    confirms the HTML's query string was updated, but does not confirm
    `validate_jsx.js` produced a fresh `public/index.bundle.js`. Failure modes
    that would slip past deploy: validate_jsx.js silently exits 0 without
    writing the bundle (the HEAD validate_jsx.js bug — see CLEANUP_PLAN
    Session 2 Phase 2A investigation, fixed in `cdceb17`); babel transform
    emits an empty `compiled` and `fs.writeFileSync` writes a 0-byte bundle;
    bundle write succeeds against an unintended path. In all cases the deploy
    ships a stale or empty bundle with a fresh `?v=` token, forcing every
    client to re-fetch broken content.

    Suggested fix: capture `stat -c %Y public/index.bundle.js` (or a content
    hash) before invoking `node validate_jsx.js`, then re-check after; require
    both that the file exists, that its mtime changed, and that size > some
    threshold (e.g., 100 KB — current bundle is ~2.4 MB). Optionally also
    assert the bundle contains a known marker such as `APP_VERSION` or
    `MTX-Q`.

    Discovered while triaging WIP files in CLEANUP_PLAN Session 2 (Phase 2A);
    HEAD's `validate_jsx.js` was found to silently no-op against the current
    `index.html` structure, with deploys succeeding only because of
    uncommitted WIP. The verifier did not catch the underlying broken script.

## Round 7 (CLEANUP_PLAN follow-up, 2026-05-08)

21. **RESOLVED** [Verified] (no commit SHA — local hook deletion, not tracked in git) —
    Post-commit hook auto-pushing deleted 'main' branch. The
    `.git/hooks/post-commit` hook (31 bytes, created 2026-03-02) ran
    `git push origin main` after every commit. After Session 5 deleted
    `main`, this surfaced as a non-fatal `src refspec main does not match
    any` error on every push. Resolution: hook deleted
    (`.git/hooks/post-commit` removed). Hook was leftover from early-project
    main era.

## Round 8 (discovered while verifying #19 fix, 2026-05-08)

22. **RESOLVED** [Verified] — `b4c6167` (2026-05-08, deployed in v1.19.1005) — `addPanel` does not create the per-panel BC Project Task block
    (20N00 / 20N10 / 20N20 / 20N99) in Business Central. User expected the
    same task-creation behavior as the New Project flow, where
    `bcCreatePanelTaskStructure` lays down all panel task scaffolding at
    once. Adding a Quote Line → Control Panel to an existing project leaves
    the new panel with no BC tasks; downstream sync (planning lines, push
    BOM, sell price patches) targets task numbers that don't exist.

    **Code-path evidence:**
    - `bcCreatePanelTaskStructure` (`src/app.jsx:2711`) is the only function
      that creates the per-panel `20N00..20N99` task scaffolding. It is
      called from exactly three sites: New Project creation
      (`src/app.jsx:36417`), project copy (`src/app.jsx:8243`), and project
      relink (`src/app.jsx:31917`). It is **not** called from `addPanel`.
    - `addPanel` (`src/app.jsx:29142`) has had the same body since v1.19.762
      (Mar 2026): build a panel object, `onUpdate({...project, panels:[...,
      newPanel]})`, and (after v1.19.1004) `safeSave(uid, updated)`. No BC
      side-effects. v1.19.916 added the modal but did not add BC sync.
    - `addServiceCard` (`src/app.jsx:29152`) explicitly calls
      `_syncServiceCardToBc(card, "create")` after `safeSave`. This is what
      makes Engineering/Programming/Commissioning quote lines auto-create
      their BC tasks (the 50100..50399 series). The Control Panel path is
      missing the equivalent call.

    **BC ground-truth verified for PRJ402089 (Lemay Pump Station)** via
    direct ProjectTaskLines OData query during this session — Panel 2 (the
    test panel added during v1.19.1004 verification) has zero BC tasks:

    | Task # | Type        | Description                               | Totaling          |
    |--------|-------------|-------------------------------------------|-------------------|
    | 10000  | Begin-Total | PRJ402089 - Lemay Pump Station            | (empty)           |
    | 20100  | Begin-Total | PRJ402089-100 - Lemay Pump Station        | (empty)           |
    | 20110  | Posting     | PRJ402089-100 Rev - - Lemay Pump Station [1] | (empty)        |
    | 20120  | Posting     | Engineering Design - Lemay Pump Station   | (empty)           |
    | 20199  | End-Total   | TOTAL: PRJ402089-100 - Lemay Pump Station | `20100..20199`    |
    | 99999  | End-Total   | TOTAL: PRJ402089 - Lemay Pump Station     | `10000..99999`    |

    **Design decisions** (resolved this session, ready for implementation):

    **1. 99999 End-Total `Totaling` range** — NO PATCH NEEDED on incremental
    adds. The project End-Total at 99999 already has `Totaling: "10000..99999"`
    which is permissive (inclusive integer range) and covers all future panel
    blocks at 20200, 20300, etc. Adding a new panel only requires creating
    the 4 panel-specific tasks (20N00, 20N10, 20N20, 20N99). Per-panel
    End-Total at 20N99 uses panel-specific range like `"20200..20299"`.

    **2. Existing-project backfill** — Implicit self-heal on first BC sync.
    The two existing per-panel BC sync calls (`bcSyncPanelTaskDescriptions`
    and `bcSyncPanelPlanningLines`) already iterate panels by index and
    construct task numbers via `20000 + panelIdx*100 + offset`. Add a
    pre-check at the top of each: if the target task doesn't exist in BC,
    call the new helper to create the panel's 4-task block first, THEN
    proceed with the sync. This auto-fixes legacy projects without UI churn
    and without firing unexpected writes on project open. New panels added
    via the fixed `addPanel` get their tasks immediately; missing tasks on
    existing panels get filled in on the next sync trigger.

    **3. Partial-failure handling** — Offline queue + per-panel pending flag.
    `bcCreatePanelTaskStructure` already supports two field-name prefixes
    (`Project_*` then `Job_*`) with auto-retry — reuse that logic in the
    extracted helper. If task creation fails on the network/auth layer:
      - Enqueue via existing `bcEnqueue('createPanelTaskBlock', {...},
        'Create panel ${idx} BC tasks')` — matches the labor/PO/PDF queue
        pattern.
      - Set `panel.bcTasksSyncPending: true` on the panel so a future UI
        chip can surface "BC sync pending" without blocking workflow.
        Cleared on successful create (or on idempotent re-create that finds
        the task already exists).
      - Do NOT roll back partial creates. If 2 of 4 tasks land before failure,
        the offline queue retries the helper — which is idempotent (probes
        existing task numbers via OData and skips any already present).

    **Implementation sketch** (single session work, ~1-2 hrs):

    a. Extract helper from `src/app.jsx:2743-2760` (the `buildTasks` loop body):
       ```js
       async function bcCreatePanelTaskBlock(projectNumber, panelIndex, panelData, projectName)
         // panelData: {drawingNo, drawingRev, name, lineQty}
         // panelIndex: 1-based
         // Returns {created, skipped, failed} summary like bcCreatePanelTaskStructure does
       ```
       Internally probes both `Project_No`/`Job_No` field prefixes (existing
       pattern). For each of the 4 tasks (20N00, 20N10, 20N20, 20N99): GET
       to check existence first, POST if missing. PATCH the per-panel End-
       Total's `Totaling` to `"20N00..20N99"` if it was created bare.

    b. Call from `addPanel` (`src/app.jsx:29142`) after `safeSave`:
       ```js
       function addPanel(){
         // ...existing build + onUpdate + safeSave...
         if(project.bcProjectNumber && _bcToken && !_bcEnvMismatched(project)){
           const newIdx = (project.panels||[]).length;  // 1-based after spread
           bcCreatePanelTaskBlock(project.bcProjectNumber, newIdx, newPanel, project.name)
             .catch(e => {
               console.warn('[ADD PANEL] BC task block create failed, queuing:', e.message);
               bcEnqueue('createPanelTaskBlock', {projectNumber: project.bcProjectNumber,
                 panelIndex: newIdx, panelData: newPanel, projectName: project.name},
                 `Create panel ${newIdx} BC tasks`);
             });
         }
       }
       ```

    c. Add backfill check to `bcSyncPanelTaskDescriptions` (`src/app.jsx:3092`)
       and `bcSyncPanelPlanningLines` (`src/app.jsx:3128`) — both compute
       a base task number from `panelIndex`. Before their existing GET-
       and-PATCH loop, run a probe: if the panel's Begin-Total (20N00)
       doesn't exist in BC, call `bcCreatePanelTaskBlock` first. This
       transparently fixes any legacy panel.

    d. Add `bcCreatePanelTaskBlock` to the `bcEnqueue`/`bcProcessQueue`
       handler list (CLAUDE.md mentions queue types: `createPurchaseQuote`,
       `attachPdf`, `patchJob`, `syncTaskDescs` — find the dispatcher and
       add the new type).

    **Test plan** (post-implementation, run against the same sandbox tenant):

    1. **Fresh add:** Open any BC-connected project. Add Quote Line → Control
       Panel. Within ~5s, query `ProjectTaskLines?$filter=Job_No eq
       'PRJ...'` and verify 4 new tasks appeared at 20N00, 20N10, 20N20,
       20N99 with the panel-specific Totaling range on 20N99. Verify 99999
       Totaling is unchanged at `"10000..99999"`.

    2. **Offline path:** Open browser DevTools, set `_bcToken=null` to
       simulate token loss. Add a panel. Observe console: should log
       "[ADD PANEL] BC task block create failed, queuing" and the BC queue
       badge in the toolbar should increment. Restore token (toggle BC
       Connected). Observe queue drain and the new tasks appear.

    3. **Backfill:** Use a project that has a panel without BC tasks
       (e.g., PRJ402089 Panel 2 from this session, before fix). Trigger
       any BC sync — push pricing, save BOM row, etc. Verify the panel's
       BC task block gets created automatically before the sync runs.

    4. **Idempotency:** Run the helper twice in a row for the same panel.
       Second invocation should detect existing tasks via probe and skip
       all four POSTs (just verify, don't error).

    5. **Cross-env mismatch:** Open a project whose `bcEnv` differs from
       the active env (`_bcEnvMismatched(project) === true`). Add a panel.
       The helper should NOT fire (per the existing guard pattern at
       `src/app.jsx:23229` and similar). No queue entry, no BC writes, no
       errors.

    Discovered post-deploy of v1.19.1004 by user testing the bug-fix flow
    (added Panel 2 via Add Quote Line, observed no 20200-series tasks in
    BC). Out of scope for the #19 fix; design is now nailed down — pick up
    in next session and implement the helper + three call-site changes
    above. Reference this BC dump when verifying the test plan.

    **Resolution note (2026-05-08, deployed in v1.19.1005, master `b4c6167`):**
    Implemented exactly per the design sketch in steps (a)–(d) above:

    - (a) New helper `bcCreatePanelTaskBlock(projectNumber, panelIndex, panel,
      projectName)` added at `src/app.jsx` immediately after
      `bcCreatePanelTaskStructure`. Idempotent: probes Begin-Total (20N00)
      first as a fast path; if missing, falls through to per-task GET-by-key
      probe + POST. Same `Project_No` → `Job_No` field-prefix fallback as
      `bcCreatePanelTaskStructure`. Returns `{created, skipped, failed,
      total:4}` summary; throws on partial failure so callers route to the
      offline queue.

    - (b) `addPanel` (in `ProjectView`) now calls `bcCreatePanelTaskBlock`
      after `safeSave` when `project.bcProjectNumber` is set and BC env
      matches. Token-missing path enqueues via
      `bcEnqueue('createPanelTaskBlock', …)`; runtime failure also enqueues
      with the same payload.

    - (c) Backfill probe added to the top of
      `bcSyncPanelTaskDescriptions` and `bcSyncPanelPlanningLines` —
      `await bcCreatePanelTaskBlock(...)` runs first. Idempotent + fast-path
      means already-scaffolded panels pay one GET; legacy panels with
      missing tasks self-heal on first sync.

    - (d) BC offline queue dispatcher (`_bcQueueExecute`) gained a
      `case 'createPanelTaskBlock'` branch that calls the helper with the
      enqueued params.

    `panel.bcTasksSyncPending` flag from design item #3 NOT implemented this
    session — the offline queue + BC queue badge already surface pending
    state, and the helper's idempotency means re-runs don't double-create.
    Defer the per-panel chip to a follow-up if needed once the fix is
    field-tested.

    Test plan from above is the verification path. Run after deploy:
    1. **Fresh add** in any BC-connected project — verify 20N00/20N10/20N20/
       20N99 appear within ~5s. Verify 99999 Totaling unchanged.
    2. **Offline path** with `_bcToken=null` — verify queue badge increments
       and drains on reconnect.
    3. **Backfill** on PRJ402089 Panel 2 (currently has no BC tasks per
       this session's BC dump) — trigger any sync and verify tasks land.
    4. **Idempotency** — call helper twice; second call should report
       skipped=4 from the fast-path probe.
    5. **Cross-env mismatch** — `_bcEnvMismatched(project)===true`: helper
       not invoked, no queue entry, no errors.

23. **OPEN** [Backlog] — Drawing delete/re-drop leaves BC planning line 10000 holding the
    prior sell price until the next pricing run. `removePage` at
    `src/app.jsx:21679` clears `panel.bom`, `pricing`, `laborData`, etc.
    when `remaining.length===0`, but does NOT trigger a `bcSyncPanelPlanningLines`
    push to BC. Result: BC's task Unit Price (sourced from planning line
    10000's `Unit_Price` field, which carries `computePanelSellPrice(panel)`
    at last sync) stays frozen at the pre-delete value through the entire
    re-extraction window. Self-corrects on the next pricing run that fires
    `bcSyncPanelPlanningLines`, so the bug is purely cosmetic / time-bounded —
    but during a long re-extraction it can mislead anyone watching BC for
    project status.

    Discovered 2026-05-08 while smoke-testing the v1.19.1005 TODO #22 fix:
    user re-dropped Panel 2 drawings on PRJ402089; BC continued to show the
    prior $36,049.79 Unit Price on task 20210 throughout the new extraction.

    **Suggested fix:** in `removePage`'s `remaining.length===0` branch
    (after `onUpdate` / `onSaveImmediate`), if `project.bcProjectNumber` is
    set and `_bcEnvMismatched(project)===false`, call
    `bcSyncPanelPlanningLines(bcProjectNumber, panelIndex, updated, project.name)`
    with the now-empty `updated` panel. Since the sync function recreates
    line 10000 with `Unit_Price = computePanelSellPrice(panel)` and the panel's
    BOM is empty + pricing nulled, the new Unit_Price will be 0. Same pattern
    as other post-mutation BC syncs already in the codebase. Token-missing
    path: `bcEnqueue('syncPanelPlanningLines', ...)` — note this queue type
    isn't currently registered (the existing dispatcher has
    `createPurchaseQuote`, `attachPdf`, `patchJob`, `syncTaskDescs`,
    `syncServiceCardTask`, `createPanelTaskBlock`), so adding this fix may
    also need a new queue branch wrapping `bcSyncPanelPlanningLines`.

    Low severity; out of scope for v1.19.1005 deploy. Pick up in a follow-up
    session.

24. **STALE — superseded** [closed 2026-07-07: task declared no-longer-needed; via legacy B/F/G categorization] (was G) — Remove auto-creation of Project Task `20N20 Engineering Design`.
    This task is auto-created on new projects (likely in the BC job/project
    creation path or initial project template), but is no longer needed since
    Engineering Design is now handled as a separate line item on the
    quote/BOM. The auto-created task is now redundant and should be removed
    from whatever code path seeds default project tasks.

## Round 9 (user-reported, 2026-05-08)

25. **RESOLVED** [Verified] — `4da7909` (2026-05-08, deployed in v1.19.1007) — BOM
    extraction silently dropped pages where ENC and BOM share the same
    drawing. The AI page-type detector (`PAGE_TYPE_DETECT_PROMPT` at
    `src/app.jsx:12626`) is instructed via DECISION ORDER to pick ONE
    primary purpose per page — drawing wins over BOM when both are present
    — so a 3-page set with an ENC+BOM combined page returned
    `{"types":["enclosure"]}`. The BOM extraction filter at
    `src/app.jsx:11976` (`_bp.filter(p => getPageTypes(p).includes("bom") && p.dataUrl)`)
    excluded the page entirely; user-drawn BOM regions on that page never
    reached `getExtractionUnits` because the per-page extraction loop is
    only entered for pages that pass the filter.

    Discovered by user testing PRJ402089 Line 3: 3-page drawing set with
    ENC + BOM combined; extraction failed despite a BOM region being
    identified.

    **Fix:** `getPageTypes()` (`src/app.jsx:12727`) now unions AI-detected
    types with classifier-compatible region types (`bom` / `schematic` /
    `backpanel` / `enclosure` / `pid`). User-drawn regions are
    authoritative — they ADD types but never remove them, so pages with
    no regions still rely on the AI classifier. The change is
    centralized: every downstream filter (extraction at 11976, audit at
    12434, validation, UI counters at 20796–20800, ~20+ callsites total)
    automatically sees the user's truth. Multi-page case is handled by
    the per-page nature of `getPageTypes` — N pages each with an ENC
    region all land in `enclosurePages`; same for BOM.

    Region annotation types that aren't classifier-compatible
    (`zoomed_detail`, `label`, `spec`, `other`, `ignore`, `titleblock`)
    are correctly ignored as page-type sources — they remain annotations,
    not page classifications. `getExtractionUnits` (`src/app.jsx:9598`)
    still independently crops user-drawn BOM rectangles, unaffected.

    Side note: v1.19.1006 was an empty version bump — see #26 below for
    the deploy.sh worktree-mismatch root cause.

26. **OPEN** [Backlog] — `deploy.sh` builds from the main checkout
    (`C:\Users\jon\AppDev\MatrixARC\src\app.jsx`), not from the cwd
    worktree's source. If a fix is edited inside a worktree
    (`.claude/worktrees/...`) and `bash deploy.sh` is invoked from that
    worktree, the script silently builds and ships main's stale source
    with only the version bump applied — the actual code change does NOT
    deploy. v1.19.1006 was an empty release for exactly this reason
    (commit `ee7721b`); the fix had to be re-applied in the main checkout
    and re-deployed as v1.19.1007 (`4da7909`).

    Discovered 2026-05-08 while shipping #25. The earlier session's
    `node validate_jsx.js` log even hinted at this — output said "Source
    length: 2747264" against the main checkout's app.jsx, not the
    worktree's — but no abort or warning fired.

    **Fix candidates:**
    a. `deploy.sh` aborts (or prompts) if cwd is a worktree and the
       worktree's `src/app.jsx` differs from the main checkout's. One
       `diff -q` before the build is enough to detect this.
    b. `deploy.sh` rsyncs the cwd's `src/app.jsx` to the main checkout
       before building — riskier, could clobber unrelated edits in main.
    c. Document loudly in CLAUDE.md that worktree edits must be applied
       in main (or merged to master) before running deploy. Cheapest, but
       relies on the operator remembering.

    (a) is the recommended path — it's a 3-line guard, fails closed, and
    makes the failure mode visible the moment it happens instead of after
    the empty version is live.

## Round 10 (user-reported, 2026-05-12)

27. **OPEN** [Backlog] — Status pills in Quote Summary do not match the status pills on the
    Panel Card. The two UI surfaces render panel status independently and their
    styling / label logic has diverged. They should be visually identical for the
    same underlying status value.

28. **RESOLVED** [Verified] — `b077999f` (2026-05-12, deployed in v1.19.1034) — Auto-populating
    Crossed/Superseded list should exclude "CRATES" and "JOB BUYOFF" entries.
    Fix: new `_isBuyoffOrCrate(r)` helper checks `partNumber`, `description`,
    AND `crossedFrom` fields for `/buyoff/` and `/crat(e|ing)/` patterns. Applied
    to all 5 crossed-items filters, `_isExcludedFromPriceCheck`, lead time drivers
    (`_computePanelLeadDriversLine`/`_computeProjectLeadDriversLine`), and
    `computeControlPanelLeadTime`. Earlier attempts using narrow regexes and
    positional last-3 exclusion failed because: (a) `crossedFrom` held the OLD
    part number (e.g. "JOB BUYOFF") while the new `partNumber` was just "BUYOFF";
    (b) these rows weren't always at the end of the BOM array.

29. **OPEN** [Backlog] — Auto-add "ECO FEE STANDARD" line item on ECO creation. When a new
    ECO is created, automatically insert a line item just below the Labor lines
    called "ECO FEE STANDARD". This is an active BC Service Item representing a
    standard fee applied to every ECO. The amount is variable (configurable), with
    a default of $1,500.

30. **OPEN** [Backlog] — Budgetary designation should be project-level, not per-panel. When a
    project is marked as "Budgetary", apply the designation to the entire quote
    rather than each individual panel. Move the "BUDGETARY" pill from inside each
    Panel Line card in Quote Summary to sit next to the total price instead.

## Round 11 (BC integration fixes, 2026-05-12)

31. **RESOLVED** [Verified] — `5d459657` (2026-05-12, deployed in v1.19.1025) — BC+ pills
    (red "+" indicators) not persisting after "Get New Pricing" / "Sync BC".
    Root cause: `bcVerify` stamping in `runPricingOnPanel` ran AFTER the
    Firestore save (`onSaveImmediate`), so stamps only existed in React state
    and were lost on reload. Fix: moved stamping block BEFORE the save.

32. **RESOLVED** [Verified] — `a7c10da6` (2026-05-12, deployed in v1.19.1026) — Item
    Browser USE applying stale Item Card price over Purchase Price. `commitBcItem`
    applied `bcItem.unitCost` (Item Card `Unit_Cost`, often stale) immediately,
    then did an async PP fetch that arrived too late. Fix: made `commitBcItem`
    async, fetches Purchase Prices BEFORE the first save, uses PP
    `directUnitCost` when available (falls back to `unitCost` if PP unavailable).

33. **RESOLVED** [Verified] — `f95d319c` (2026-05-12, deployed in v1.19.1025) — Manual
    price entry via confirmed price dialog set `priceSource:"manual"`, causing
    an "M" pill and exclusion from RFQs. Since the price IS pushed to BC,
    `applyConfirmedPrice` now sets `priceSource:"bc"` with `bcPoDate`. If BC
    push fails, safely reverts to `priceSource:"manual"` with valid `priceDate`.

34. **RESOLVED** [Verified] — `be6ff11f` (2026-05-12, deployed in v1.19.1028) — Panel lead
    time calculation showing less than longest item lead time. When a TRAQS
    absolute production date was earlier than the material chain
    (engineering + approval + longest item lead), `leadDays` could be less than
    `longestItemDays`. Fix: `productionDoneDays` now floored at
    `materialsCompleteDays`.

35. **RESOLVED** [Verified] — `f436d9e6` (2026-05-12, deployed in v1.19.1029) — Admin
    override for AI-estimated lead time budgetary enforcement. Admins can now
    bypass the forced BUDGETARY flag when AI-estimated lead times are present.
    On send: two-step confirm (Cancel → "Override, Send as Firm"). On print:
    "Mark Budgetary" vs "Print as Firm (Admin)" choice. Non-admins retain
    existing forced-budgetary behavior.

## Round 12 (user-reported, 2026-05-14)

36. **OPEN** [Backlog] — Service line items (Commissioning, Programming, Design) need a proper
    status lifecycle. Currently they lack progression tracking. Desired flow:
    **DRAFT** (initial creation) → **READY** (when costs and qty are entered) →
    **IN PRE_REVIEW** (when sent for review) → **QUOTES SENT** (once the quote is
    sent). Status should update automatically based on data completeness and
    workflow actions.

## Round 13 (BOM extraction token truncation, 2026-05-20)

37. **RESOLVED** [Verified] — `48deb1c9` (2026-05-20, deployed in v1.20.1) — BOM extraction
    silently returning 0 items on dense/large BOMs (reported on PRJ402101,
    Clearstream drawing format). Root cause: `max_tokens: 16000` was too low for
    large BOMs — Anthropic returned `stopReason: "max_tokens"` with truncated
    JSON that failed all 4 parse strategies in `_parseAndVerifyBomRaw`, resulting
    in `items: []`. Because the HTTP call succeeded (200), no error was thrown and
    the empty result was accepted silently. Fix: bumped `max_tokens` from 16000
    to 64000 and `budget_tokens` (thinking) from 4000 to 16000 in all three
    extraction paths — Cloud Function `extractBomPage`, client-side crop fallback,
    and client-side PDF fallback. Also added crop-empty safety net: when the
    cropped-BOM path returns 0 items, extraction now retries via the full
    PDF-native path before giving up.

38. **RESOLVED** [Verified] — `48deb1c9` (2026-05-20, deployed in v1.20.1) — Same
    `max_tokens: 16000` truncation affected `extractSupplierQuotePricing` Cloud
    Function (supplier portal quote uploads). Bumped to `max_tokens: 64000`.

39. **RESOLVED** [Verified] — `48deb1c9` (2026-05-20, deployed in v1.20.1) — Added admin
    warning email at 75% token usage. New `warnAdminsTokenUsage()` helper in
    `functions/index.js` resolves the user's companyId, finds admin UIDs, and
    sends a SendGrid alert when `output_tokens >= 0.75 * maxTokens`. Wired into
    both `extractBomPage` and `extractSupplierQuotePricing`. Non-fatal — failures
    are logged but don't block extraction.

## Round 14 (RFQ / Supplier Portal bug fixes, 2026-05-20)

40. **RESOLVED** [Verified] — `52394c87` (2026-05-20, deployed in v1.20.3) — Duct and DIN rail
    items appearing on RFQs. `RFQ_EXCLUDE_ITEMS` regex in `buildRfqSupplierGroups()`
    only excluded job buyoff / crating / crate. Fix: added `\b(din\s*rail|duct)\b`
    to the exclusion pattern. These are bulk cut-to-length consumables sourced
    internally — never belong on supplier RFQs.

41. **RESOLVED** [Verified] — `aa9b45c1` (2026-05-20, deployed in v1.20.3) — Crossed parts
    using stale vendor/manufacturer for RFQs. Auto-cross at `src/app.jsx` line
    ~9014 spreads `{...r, partNumber:alt.replacement.partNumber}` without clearing
    `bcVendorName`/`bcVendorNo`, so the RFQ routes to the original part's supplier
    instead of the crossed part's supplier. Fix: `buildRfqSupplierGroups()` now
    re-resolves vendor from BC for any `isCrossed` item before the existing
    empty-vendor fallback. Falls back to stale vendor if BC lookup fails.

42. **RESOLVED** [Verified] — `c2bba6cf` (2026-05-20, deployed in v1.20.3) — "Default for
    future RFQs" vendor email persistence — three bugs:
    (A) Emails only saved on checkbox toggle — edits made after checking "remember"
    were never persisted. Fix: save all remembered vendor emails at send time in
    `sendAll()`.
    (B) Saved defaults silently discarded when BC had already populated the email
    field. Fix: saved defaults now always override BC-populated contacts.
    (C) Silent `.catch(()=>{})` on Firestore writes swallowed errors. Fix: replaced
    with `console.warn` logging.

43. **RESOLVED** [Verified] — `e61f13ed` (2026-05-20, deployed in v1.20.4) — No admin
    notifications when supplier portal encounters failures. New
    `notifyAdminPortalFailure()` helper in `functions/index.js` sends de-duplicated
    emails (1/hr per alert type) to company admins for: AI extraction errors,
    JSON parse failures, cost-cap triggers, notification pipeline breaks, and
    email delivery failures. Also wrapped `onSupplierQuoteSubmitted` notification
    creation in try/catch to prevent unhandled rejections from killing the trigger.

44. **RESOLVED** [Verified] — `09c1f79b` (2026-05-20, deployed in v1.20.4) — Supplier-facing
    error message shows raw technical error text. Replaced with user-friendly copy:
    "We couldn't auto-extract pricing from your quote — our team has been notified
    and will review it. Please enter prices manually below to keep things moving."
    Raw error still stored in state for console diagnostics.

T1. **OPEN** [Backlog] — Pre-commit hook only inspects `.js` files (`grep -E '\.js$'` skips `.jsx`).
    Most of ARC lives in `src/app.jsx` (~2 MB), so the hook is currently silent on the largest
    surface area of the codebase. `node --check` doesn't parse JSX natively — fixing this needs
    a different syntax-check approach (Babel parse, esbuild --syntax, or a small wrapper).
T2. **RESOLVED** [Verified] — `150f75e` (2026-05-07). Pre-commit hook now collects `.js` and `.jsx`
    files separately. Syntax check still runs on `.js` only (T1 still open — `node --check`
    can't parse JSX). The advisory Claude review now scans both, with `app\.jsx` added
    explicitly to the risk pattern. Re-installed via `./tools/install-hooks.sh`. Note: the
    risk pattern is a basename-style match, so any path containing `app.jsx` qualifies —
    intentional, since the file might be moved or referenced via worktree paths.
T3. **OPEN** [Backlog] — BOM row ordering: JOB BUYOFF and CRATE rows should always sort to the bottom
    of the BOM, just above CONTINGENCY. Currently they can appear at arbitrary positions
    depending on extraction/insertion order, which causes them to show up in crossed-item
    notes and lead-time drivers despite content-based filtering. Fix: enforce a stable
    sort in the BOM display/save path that pins these utility rows to the end.
T4. **OPEN** [Backlog] — `firestore.rules` and other non-JS files (`.rules`, `.json`, `.html`) get no
    coverage from the syntax check or the risk-pattern review. The rfqUploads fix (#1, commit
    `701d693`) committed without any pre-commit feedback. Low priority; add a separate
    rules-syntax check (`firebase deploy --only firestore --dry-run` or similar) if/when it
    becomes a real risk.
T5. **OPEN** [Backlog] — Quote package enhancement: investigate sending the client a copy of the
    ARC-stamped drawings and ARC BOM alongside the quote PDF. Customers may find it valuable
    to receive the stamped drawings (with ARC markups/redlines) and the extracted BOM as part
    of the quote package. Would require bundling or attaching additional PDFs to the quote
    email or print output.
T6. **OPEN** [Backlog] — `extractionReport` not updated on re-extraction. When a user re-extracts a
    panel, the `panel.extractionReport` retains the timestamp and stats from the PREVIOUS
    extraction. Observed on PRJ402101: extractionReport timestamp 2026-05-20T22:23Z is from
    Round 1 extraction, but qvHistory shows `re_extract` at 2026-05-20T21:20Z (Round 2).
    The report should be regenerated on every extraction pass. Root cause: `runExtractionTask`
    builds `extractionReport` at the end of the pipeline but may not overwrite it on re-extract
    if the report-generation code path is skipped or conditional. Fix: ensure `extractionReport`
    is always rebuilt from scratch on every extraction, not merged with prior data.
    Discovered: 2026-05-21 diagnostic session (Issue E).
T7. **OPEN** [Backlog] — Duplicate Firestore documents: 23 BC project numbers have two documents in
    `companies/{companyId}/projects/` — one created manually by a user (with pages/BOM), one
    from BC import (empty, `importedFromBC: true`, panels: 0). No data divergence (all 23
    BC-import docs are empty shells), but the duplicate causes confusion: different users may
    load different documents for the same project number. Root cause: no uniqueness constraint
    on `bcProjectNumber` at creation time. Fix (Layer A): add a duplicate guard that checks
    for existing documents with the same `bcProjectNumber` before creating a new project.
    Remediation: all 23 BC-import docs are safe to delete (0 BOM, 0 pages). See audit data
    from 2026-05-21 diagnostic session.
    Discovered: 2026-05-21 diagnostic session (Issue A root cause).
T8. **OPEN** [Backlog] — Qty inflation (Issue A2): Noah's screenshot of PRJ402101 at 8:30 AM 5/21/2026
    (post-hard-refresh) showed enclosure qty=8 and A/C qty=48, but current Firestore has qty=1
    for both. Extraction completed 4:23 PM 5/20 — no extraction was running at 8:30 AM.
    Investigation paths:
    (a) Firestore offline persistence: RULED OUT — `enablePersistence()` never called in ARC.
        IndexedDB cannot be serving stale data.
    (b) Wrong document: Projects load by document ID, not bcProjectNumber. Two duplicate docs
        exist for PRJ402101. CONSTRAINED by server metadata: the BC-import shell
        (arc-40b43a7c...) server updateTime = createTime = 5/20/2026 11:57:02 AM MDT.
        The shell was NEVER WRITTEN TO after initial creation — it cannot have temporarily
        held BOM data. The `quoteRev:1` and `lastQuoteHash:655853926` were set at creation
        time (part of the initial BC import save), not from a later operation.
        The manual doc (z1QmSG8B...) updateTime = 5/21/2026 9:32:38 AM MDT (1 hour AFTER
        Noah's screenshot, by Jon). Before that write, the manual doc was unchanged since
        the 5:06 PM refresh_pricing on 5/20.
    (c) BOM modification without qvHistory: Exact-dedup SUM (line 12518/22481 in index.bundle.js)
        aggregates qty across pages without per-row qvHistory. Snippet self-correction can also
        modify qty during extraction without separate qvHistory entry. But `bomPageCount:1` and
        no active extraction at 8:30 AM makes this path unlikely.
    Status: no satisfying explanation found. Server metadata rules out the shell as a source
    of stale data (never modified) and rules out a recent write to the manual doc (no write
    between 5:06 PM 5/20 and 9:32 AM 5/21, after the screenshot). Remaining possibilities:
    (i) Noah's screenshot was from a different project, (ii) the screenshot timestamp is
    inaccurate, or (iii) a client-side rendering bug displayed wrong quantities from correct
    data. Need Noah's actual screenshot to cross-reference visible part numbers.
    Discovered: 2026-05-21 diagnostic session.
T9. **OPEN** [Backlog] — Claude-in-Chrome MCP can't navigate to non-prod origins (test/channel)
    even with the extension set to all-sites. The restriction is connector-internal and
    origin-wide: the agent can drive only origins established in-session (prod, opened at
    startup). `navigate`, `screenshot`, and all actions on `matrix-arc-test.web.app` and
    `matrix-arc--*.web.app` preview channels return "Navigation/Permission denied for this
    domain" — prod navigates on the same tab in the same instant, confirming per-origin scope.
    Not an extension setting and not an on-disk allowlist (searched .claude.json,
    settings.local.json, ~/.claude, packaged AppData — none found). Blocks agent-driven non-prod
    gates. WORKAROUND NOW EXISTS: headless harness `tests/extraction-baseline/h5-headless.js`
    runs non-prod H5 gates from Node, no browser (`--project`, `--no-pad`, `--pad-floor N`,
    `--save-tiles`). Connector-level fix still wanted long-term but no longer blocking.
    Owner: Jon to route out-of-band. Discovered: 2026-06-15 (#121 gate).

## Round 15 (diagnostic session fixes, 2026-05-21)

45. **RESOLVED** [Verified] — (firestore.rules deployed 2026-05-21, commit pending) — Issue I: `_snapshots`
    subcollection under `companies/{companyId}/projects/{projectId}` had no matching Firestore
    rule. The `users/{uid}/{document=**}` recursive wildcard covers user-path subcollections,
    but the company-path `match /projects/{projectId}` block only had explicit rules for the
    project document itself and `ecos/{ecoId}` — no rule for `_snapshots/{snapshotId}`.
    Result: `saveSnapshot()` silently failed for ALL company-account projects since the
    snapshot feature was introduced. Every "Restore" safety-net call (before re-extraction,
    Get New Pricing, panel deletion) was non-functional.

    Fix: added `match /_snapshots/{snapshotId}` rule inside the company-path projects block:
    `allow read: if isMember(); allow create: if canWrite(); allow delete: if canWrite();
    allow update: if false;` Snapshots are immutable by design — create and delete only.
    Deployed via `firebase deploy --only firestore:rules` (single Firebase project, applies
    to both test and production hosting targets).

    Verification: triggered Get New Pricing on PRJ402105 Panel 1. Console confirmed
    `SNAPSHOT: saved "Before Get New Pricing" for Panel 1`. UI Restore button shows
    "Before Get New Pricing — 5/21/2026, 6:13:36 PM · 50 BOM items" with working Restore
    button. PASS.

46. **RESOLVED** [Verified] — `ab5f3b91` (v1.20.13, deployed 2026-05-21) — Issue H: BC sync self-conflict — "Another user has already changed the
    record" ETag concurrency errors on valid BC Items during planning line sync.
    Observed on PRJ402105 during pricing run: 3 items (CHCC2DIU, 592273, 2910386) all
    show the same error with different CorrelationIds. All items exist in BC; single user.

    **Root cause (confirmed 2026-05-21):** ARC racing itself via BC server-side cascades
    inside `bcSyncPanelPlanningLines` (`src/app.jsx:3279`). The function captures ETags
    for all ~50 planning lines in one bulk GET (Step 1, line 3356), then runs two
    operations that can invalidate those ETags before the PATCH loop (Step 3) reaches
    the affected lines:

    (A) Step 2b (lines 3425-3443) PATCHes ItemCard posting groups for items with empty
    `Gen_Prod_Posting_Group`/`Inventory_Posting_Group`. BC's business logic revalidates
    planning lines referencing the patched item, bumping their `@odata.etag`.

    (B) Step 3's own sequential PATCHes (300ms spacing, ~30s total loop time) trigger BC
    task-level recalculations that can bump ETags on other lines in the same task. Early
    PATCHes invalidate later PATCHes' Step-1 ETags.

    (C) `bcSyncPanelTaskDescriptions` (line 22208) runs concurrently (fire-and-forget)
    and PATCHes task records in the same project, potentially triggering additional BC
    server-side recalculations.

    `patchLine` (line 3463) retries only on 429 (rate limiting). No re-fetch-ETag-and-
    retry pattern for concurrency conflicts. No re-read-before-write.

    **Proposed fix:** Use `If-Match: "*"` for planning line PATCHes in Step 3, matching
    what `bcSyncPanelTaskDescriptions` already does. Safe because: (a) the sync is a
    full-state overwrite; (b) `bcSyncing` guard prevents overlapping UI-triggered syncs;
    (c) the "other user" is always ARC's own server-side cascade, not a human. Step 2b's
    `bcPatchItemOData` should keep per-item ETags (shared ItemCard records could be
    modified externally). Alternative: re-fetch ETag immediately before each PATCH
    (preserves concurrency safety, costs ~50 extra GETs per sync).

    **Separate sub-issue:** The original diagnostic also captured 4 "Inventory Posting
    Group is read-only" errors (different items, different root cause — ARC's PATCH
    payload includes a read-only field). These may be addressed separately.

    Discovered: 2026-05-21 diagnostic session.

    **Reproduction #2 (2026-05-21 evening, production):** Project CSW1904-121
    (Springfield WWTP, PRJ402105). 7 items failed BC sync:
    - 300-AOD930 (300 NEMA contactor) — "Another user has already changed the record"
    - FNQ-R-1 (Bussmann fuse) — same ETag conflict
    - CHCC2DIU (fuse holder) — same ETag conflict
    - 592273 (enclosure equipment tag) — same ETag conflict
    - 2910386 (surge protective device) — same ETag conflict
    - CRATE — same ETag conflict
    - JOB BUYOFF — "BC item validation error" (different root cause, not ETag)
    Trigger: BC sync after pricing. 6 of 7 are the same ETag self-conflict pattern
    from the original diagnostic. Confirms the issue is reliably reproducible on
    any project with 20+ BOM items syncing to BC.

    **Interim fix (Path B wildcard):** Dropped `existing["@odata.etag"]` from both
    `patchLine` call sites (BASE sync at `src/app.jsx:3499`, ECO sync at
    `src/app.jsx:3656`). `patchLine` defaults to `If-Match: "*"` when no ETag is
    passed. Planning lines are project-specific — ARC is the sole writer, so
    wildcard is safe. `bcPatchItemOData` (shared ItemCards) retains per-item ETags.
    Verified on test: PRJ402105 BC sync completed without ETag errors for all
    previously-failing items. Long-term: if multi-user BC editing is introduced,
    revisit the wildcard assumption (TODO comment in code marks both sites).

47. **RESOLVED** [Verified] — `9987dc4a` (v1.20.12, deployed 2026-05-21) — FIX 2: AI determinism
    + structured output + multi-type page classification.
    Three changes shipped together:
    (a) `apiCall` now defaults `temperature:0` for all AI calls, eliminating
        nondeterministic extraction results. Smart Query chatbot overridden to
        `temperature:1` at its call site to preserve conversational tone.
    (b) `apiCall` response handling now detects `tool_use` blocks and returns
        `JSON.stringify(toolBlock.input)` — enables structured output via Anthropic's
        tool_use schema enforcement.
    (c) `detectPageTypes` now uses `tools` + `tool_choice` (forced tool call) with a
        typed schema (`types: string[]` enum + optional `bomRegion` object). Prompt
        DECISION ORDER replaced with CLASSIFICATION RULES allowing multi-type arrays
        (e.g. `["schematic","bom"]` for pages with both drawing and parts table).
        Deepens the region-merge fix from #25 — AI itself now returns multi-type,
        not just user regions compensating for single-type AI output.
    Relates to: #25 (original DECISION ORDER single-type issue).

## Round 16 (crop-path rollback + scanned PDF quality + progress bar, 2026-05-22)

48. **RESOLVED** [Verified] — `ed1c6a42` (v1.20.14, deployed 2026-05-22) — Crop-path extraction
    regression rollback. Commit `8d984699` (2026-05-20, v1.20.5) reintroduced
    crop-first BOM extraction priority, unknowingly re-enabling the same JPEG
    compression artifact failure mode that caused ~20 wrong part numbers on dense
    D-size BOMs (character-merging: B↔8, I↔1, S↔5, 2↔3). Originally deleted in
    `571105e9` (2026-05-14). Reintroduction was via direct commit to master with
    no PR, no documented rationale, and no test case.

    Discovered 2026-05-22 after PRJ402107 BOM extraction missed most part numbers.
    Diagnostic confirmed the source PDF (CSW1807-121_Rev.D.pdf) contains
    CCITTFaxDecode monochrome fax-scan images (~280 DPI), not vector text.

    Fix: restored PDF-native priority across all three call sites (extractBomPage CF,
    extractBomBatch CF, client-side fallback). Added 6-rule Extraction Path Change
    Protocol to CLAUDE.md to prevent recurrence. Exposure assessment: 87 projects
    scanned, 7 affected, 1 quoted (MTX-Q202018) — manually verified clean.

49. **RESOLVED** [Verified] — `06a0b9ee` (v1.20.15, deployed 2026-05-22) — Scanned PDF quality
    detection and enhanced extraction for degraded source material. Multi-part feature:

    (a) Server-side `assessPdfPageQuality()` helper in `functions/index.js` — inspects
    pdf-lib page XObject resources for CCITTFaxDecode (monochrome fax), DCTDecode
    (JPEG), large FlateDecode images. Returns `{isScanned, isMonochrome, estimatedDpi,
    imageCount, hasVectorText, warningLevel}`.

    (b) Dynamic prompt enhancement: when quality is degraded, injects SCANNED DOCUMENT
    ALERT into the Anthropic prompt instructing maximum character scrutiny, default
    medium confidence, explicit disambiguation rules for B/8, O/0, S/5, I/1.

    (c) PDF-native CropBox: when users draw BOM regions, applies `page.setCropBox()`
    in native PDF coordinates instead of converting to JPEG crop. Preserves vector
    fidelity. Coordinate transform from normalized (0-1, top-left origin) to PDF
    points (bottom-left origin).

    (d) Client-side propagation: `pdfQuality` flows from server response → parsed
    result → `_perPageOutcomes` → `extractionReport.scanQuality` (persisted on panel).

    (e) UI scan-quality warning banner above BOM table — amber for medium, orange for
    high (monochrome fax). Persists across reloads via extractionReport.

    (f) Confidence dot indicators on BOM rows — red (#ef4444) for low confidence,
    amber (#f59e0b) for medium. Tooltip shows "AI confidence: {level}".

50. **RESOLVED** [Verified] — `8a3e8773` (v1.20.16, deployed 2026-05-22) — Pre-extraction scan
    quality warning. New `checkPdfQuality` Cloud Function (30s timeout, 512MB, no AI
    call) — lightweight pre-flight check that downloads PDF and inspects XObjects.
    Client calls it before extraction starts; for re-extractions uses cached
    `extractionReport.scanQuality` instead. Shows warning via progress status bar:
    "Low-quality scanned drawing detected (N fax-scan pages) — extraction will take
    longer and part numbers may need review." Non-blocking (try/catch).

51. **RESOLVED** [Verified] — `4c6581d7` (v1.20.18, deployed 2026-05-22) — Progress bar heartbeat
    during long API calls. Added `bgHeartbeat()` function that ticks the progress bar
    forward every 3 seconds using an asymptotic curve (fast initial progress, slows
    over time, never reaches cap). Wired into 3 stall points: batch extraction, per-page
    fallback, and re-extract batch. Shows elapsed progress like "Batch extracting 3 BOM
    pages… (42%)". v1.20.17 had a scoping bug (function defined inside `runExtractionTask`
    but called from `PanelCard`) — fixed in v1.20.18 by hoisting to module scope.

52. **OPEN** [Backlog] — Progress bar streaming (future improvement). Current heartbeat is synthetic
    — it shows simulated progress, not real extraction progress. The Anthropic API
    supports `stream: true` which could provide token-level progress updates. Would
    require server-side streaming (Cloud Functions → client) or SSE/WebSocket bridge.
    Significantly more complex than the heartbeat approach. Deferred.

53. **OPEN** [Backlog] — ECO page type detection bug (Issue G from 2026-05-22 diagnostic). When an
    ECO is created from a panel, the page type detection may misclassify pages that were
    previously correctly typed. Needs investigation — observed during the PRJ402107
    diagnostic session but not root-caused.

54. **OPEN** [Backlog] — BC sync 400 errors on valid items (Issue J from 2026-05-22 diagnostic).
    Separate from the ETag self-conflict (#46) — these are HTTP 400 validation errors
    where the PATCH payload includes fields that BC considers read-only or invalid for
    the target entity type. Needs investigation to identify which fields in the PATCH
    payload trigger the rejection.

## Round 17 (H9 fuzzy merge fix + Coach post-deploy findings, 2026-05-22)

55. **RESOLVED** [Verified] — `6d47099b` (v1.20.21), `2d707228` (v1.20.22, deployed 2026-05-22) —
    H9: fuzzy merge itemNo guard. Added a 3-line predicate to
    `fuzzyMergeBomItemsWithReport` (app.jsx:9221-9223) that blocks merges when both items
    have different non-empty itemNo values. Prevents false merges of product-family
    variants (e.g. IDEC RH1B/RH2B/RH3B relays, SH1B/SH2B/SH3B sockets) that differ by
    1 character, share the same manufacturer, and have identical descriptions — previously
    passing all 7 existing gates including the v1.19.642 identical-description override of
    the Y-position guard.

    v1.20.22 follow-up fixed keepA alignment in merge report fields (keptItemNo/
    droppedItemNo now track the keepA conditional correctly). Diagnostic-only impact.

    Regression tested across 10 production panels (22 saved merges analyzed), PRJ402104
    reconstructed pre-merge BOM (items 27/28/30 all survived), and 3 single-column BOM
    projects (PRJ402068, PRJ402089, PRJ402096 — zero regressions). Coach signed off: C14.

    Test artifacts: `tests/extraction-baseline/verify-h9-guard.js`,
    `tests/extraction-baseline/prj402104-post-h9.json`,
    `tests/extraction-baseline/prj402104-post-h9-diff.md`.

56. **OPEN** [Backlog] — PRJ402104 re-extraction raw count drop 50→21 (Coach C14). Post-H9
    re-extraction produced items 27-47 only — items 1-26 entirely absent from AI output.
    This is upstream of the fuzzy merge fix (raw count, not pipeline loss). Most likely
    hypothesis: multi-page BOM where page 1 wasn't included in re-extraction batch.
    Pre-H9 raw=47 is consistent with 2-page BOM. Requires: (1) Firestore page data
    inspection (how many "bom" pages?), (2) Cloud Function logs, (3) re-run test for
    determinism check. Not an H9 regression — pipeline preserved all 21 AI items
    (21→21→21→21, zero loss at every stage).

57. **RESOLVED** [Verified] — `4861a967` (v1.20.98, deployed 2026-06-04) — Re-extraction batch path missing bomRegion.
    `app.jsx:22481` constructs batch page objects WITHOUT `bomRegion` — initial extraction
    at line 12305 correctly includes `bomRegion:unit.bomRegion||null`. When
    `extractBomBatchViaServer` maps these pages, `pg.bomRegion` is undefined→null, Cloud
    Function skips CropBox. AI sees full page instead of focused BOM region. One-field
    mechanical fix, but part of broader H10 re-extraction architecture work.

58. **OPEN** [Backlog] — Re-extraction verification gap (Coach C15, CRITICAL, H10). Re-extraction
    path computes per-page verification via `verifyBomExtraction` but silently discards
    the result. The verification object is computed, not read, and never stored. H10 scope:
    (1) bomRegion in batch payload (#57), (2) read extractionVerification result,
    (3) missing-from-start gap detection, (4) L3 retry/gap-fill, (5) verification in
    extractionReport, (6) L3 report fields, (7) shared L3 function. Absorbs H7
    (re-extraction path was previously tracked separately). Monday work.
    RE-SCOPED 2026-06-30 (Freddy): severity CRITICAL→MEDIUM; 5/7 parts closed. REMAINING: Part 2
    (read/persist the computed extractionVerification result — ~1-line fix), Part 4 (L3 retry/gap-fill
    on the re-extract path), Part 7 (shared L3 function). Next-session candidate.

59. **OPEN** [Backlog] — 4 panels with fuzzy merges but no sequence gaps (from H9 regression test).
    PRJ402091, PRJ402083, PRJ402093, PRJ402079 each have 1-3 saved fuzzy merges in
    `extractionReport.fuzzyMerges` but empty `finalSequenceGaps`. These merges were
    legitimate (true duplicates, not product-family variants) — the itemNo guard would
    not have changed the outcome. Worth spot-checking to confirm no false positives exist
    in production merge history beyond the 10 known IDEC-family cases.

60. **OPEN** [Backlog] — Latent identifier scope bugs in existing codebase (discovered by
    `tools/check-scope.js` during Milestone B, v1.20.26). Eight pre-existing identifier
    scope bugs documented as `KNOWN_VIOLATIONS` in the scope checker. Each is the same bug
    class as the v1.20.23 `onArchive` regression (JSX compiles, runtime crashes when code
    path executes). Latent because the code paths aren't hit frequently or only trigger
    under specific conditions.

    Priority order for resolution:
    1. `VendorsPanel` `setMigrateStatus` — Vendor Posting Group migration would crash if
       invoked. Most likely user-visible failure.
    2. `ProjectView` `_doInlineQuoteSend` `onUpdate` — inline quote send would crash.
       ProjectView has `onChange`, not `onUpdate`.
    3. `ProjectView` EcoEditor `onUpdate` prop — same scope mismatch as #2.
    4. `PanelListView` ship-date popover `update` vs `onUpdate` — Enter key handler crash
       in the lead-time override popover.
    5. `ProjectView` `applyPortalPrices` `selectedPanelId` — references PanelListView's
       state. Guarded by `bomIsEmpty` check so only triggers on empty-BOM portal apply.
    6. `EcoEditor` `handleEcoFiles` `projectId` / `_logRemote` — scope mismatch, should
       use `project.id` and the function is from `addFiles` scope.
    7. `reExtractWithFeedback` `fbQs` — block-scoped `let` inside `try{}` block referenced
       after catch. Works only because catch returns early on error.

    Address after Milestone C ships. The `KNOWN_VIOLATIONS` baseline in `tools/check-scope.js`
    ensures these don't get worse, and the scope checker catches any new instances immediately.

61. **RESOLVED** [Verified] (v1.20.36, index deployed separately) — Missing Firestore composite index
    for `loadArchives()` query. The query uses `where('_archiveComplete', '==', true)` combined
    with `orderBy('archivedAt', 'desc')` on `companies/{companyId}/projects_archive`. Firestore
    requires a composite index for any query that filters on one field and orders on a different
    field. Added to `firestore.indexes.json` and deployed via `firebase deploy --only firestore:indexes`.

    **CHECKLIST for future milestones:** Any Firestore query combining `where()` filters with
    `orderBy()` on different fields needs its composite index added to `firestore.indexes.json`
    BEFORE the query goes live. Milestone D may add restore history queries (filtered by user,
    ordered by date) — check index requirements during planning.

62. **OPEN** [Backlog] — BC sync doesn't update BOM row descriptions. BOM rows retain the originally
    scanned (OCR/AI-extracted) descriptions even after BC sync executes. Part numbers and
    pricing sync correctly; descriptions don't. Quote PDFs and downstream BC writes carry the
    scanned text, not the BC ItemCard description.

    Discovered during Milestone C smoke testing — restore preview surfaced "30 with description
    changes" on archived projects that proved to be the cumulative scanned-vs-BC gap present
    since original quote time, not real BC-side drift.

    Impact:
    - Restore preview description drift display surfaces noise rather than signal (structural
      gap masquerading as drift)
    - Quote documents may show scanned descriptions that don't match BC catalog descriptions
      (potential customer-facing issue worth investigating)
    - Milestone D restore execution needs to decide: write scanned descriptions back to BC,
      or fetch BC descriptions for writes

    Root cause likely in: the BC re-verify / pricing sync path — around `bcSyncPanelPlanningLines`
    (~line 3469) or the pricing audit function (~line 5034). Confirm by grepping through `bc*`
    functions for any that update `row.description`.

    Priority: Medium-high. Not blocking Milestone C (read-only preview, Restore button disabled).
    Should be resolved before Milestone D ships so restore execution writes BC-truth descriptions,
    not scanned text.

63. **OPEN** [Backlog] — Archive availability incorrectly gated by project status. Archive option is
    locked/disabled for projects in "Quote Sent" status (and possibly other statuses — needs
    investigation). Archive is a non-destructive snapshot operation that does NOT modify the
    source project. There is no business reason to restrict it by status — it should be
    available in ALL project statuses with no restrictions.

    Investigation needed:
    - Identify all status-based gates on archive availability (button visibility, menu items,
      keyboard shortcuts, action bar conditions)
    - Verify whether the bulk archive admin action has the same status gates
    - Map the full set of statuses that currently block archive

    Fix scope: Remove status checks from archive availability logic. Straightforward once the
    gates are identified.

    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.
    Priority: Defer to Milestone D wind-down or Milestone E.

## Post-Milestone-D BC Housekeeping (discovered during Phase 2.1 smoke test, v1.20.52)

64. **OPEN** [Backlog] — BC concurrency cap and exponential backoff. BC requests fire without
    coordination. Multiple parallel call paths hit 429 simultaneously. Retries don't back off
    correctly — same calls re-hit 429 in tight loops.

    Required behavior: Global concurrency cap (5–10 simultaneous BC requests), exponential
    backoff with jitter on 429, circuit breaker after N consecutive 429s.

    Investigation start: Identify all BC fetch/POST/PATCH call sites, find or build a shared
    throttle/queue layer.

    Effort estimate: Medium (touches many BC call sites OR centralizes through one shared helper).
    Priority: HIGH — first item after Milestone D wind-down.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

65. **OPEN** [Backlog] — Project-open BC sync hygiene. Opening any project triggers cascading BC sync
    work — customer re-sync, BC verify, purchase price fetch, labor sync, progress billing
    patch, panel task block backfill. Multiple parallel BC calls per open. Restored projects
    with partial state continuously try to "catch up" forever, each open firing another sync
    attempt.

    Required behavior: Debounce sync triggers (no re-sync within N seconds of last sync),
    verify F4's bomSyncHash actually prevents re-sync on restored projects, make on-open sync
    lazy/opt-in where possible.

    Related: F4 from Phase 2.1 (v1.20.52) should have addressed this for restored projects,
    but smoke test logs suggest it isn't working as intended — needs verification.

    Investigation start: Find all project-open BC sync trigger points, identify which ones are
    necessary vs. opportunistic.

    Priority: HIGH — second item after Milestone D wind-down.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

66. **OPEN** [Backlog] — bcCreatePanelTaskStructure idempotency gap. When resuming a partial restore,
    `bcCreatePanelTaskBlock` probes for one task (20100) but the wider
    `bcCreatePanelTaskStructure` tries to create all six tasks (10000, 20100, 20110, 20120,
    20199, 99999) sequentially without probing. On resume, the previously-created tasks return
    "EntityWithSameKeyExists" 400 errors.

    Required behavior: Probe-before-create for ALL six task numbers, not just 20100. Pattern
    same as Phase 0 fix for `bcAddEcoTask` and `bcCreateEcoTaskPlanningSkeleton`.

    Effort estimate: Small (~20 LOC, mirrors Phase 0 fix pattern).

    Note: Missed during Milestone D planning. Phase 0 caught the ECO functions but didn't
    audit the panel task function. Lesson for future planning: when adding probe-before-create
    for some BC writes, audit ALL related BC write functions for the same pattern.

    Priority: HIGH — third item after Milestone D wind-down.
    Discovered: Phase 2.1 smoke test (v1.20.52) when retrying PRJ402113 restore, by Jon, 2026-06-01.

67. **OPEN** [Backlog] — Test cleanup utility for smoke-test-restored projects. Each test restore creates
    a real BC project + real Firestore project. They persist forever, each one auto-syncing on
    every open. Compounds BC load over time.

    Required behavior: Way to mark projects as test artifacts and clean them up in batch.
    Either a flag (`_testProject: true`) set during smoke test mode, or a dedicated cleanup
    function that finds and removes recent test restores.

    Priority: MEDIUM — after #64, #65, #66 ship.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

68. **OPEN** [Backlog] — BC rate limit observability. 429 errors are silent (only visible in DevTools
    console). No proactive signal to user when throttling is happening.

    Required behavior: Surface 429 count in UI, optionally log to Firestore for cross-session
    visibility. Could be as simple as a banner that appears when N 429s occur in a window.

    Priority: LOWER — after the actual throttling improvements (#64) ship.
    Discovered: Phase 2.1 smoke test (v1.20.52) by Jon, 2026-06-01.

69. **OPEN** [Backlog] — Posting-group auto-fix fails on service items (BUYOFF, Contingency).
    `bcSyncPanelPlanningLines` attempts to patch Gen. Prod. Posting Group on every planning line
    that mismatches, but service-type items (BUYOFF, Contingency, Crate) have a different posting
    group structure in BC. The PATCH returns 400, logged as "posting group fix failed" in console.
    Non-blocking (sync continues), but generates noisy errors on every sync for panels with
    service items.

    Required behavior: Skip posting-group auto-fix for rows matching `isServiceItem()` criteria
    (same pattern as `scanBomForArchiveIssues`). Already skipped during restore via F3's
    `opts.skipPostingGroupFix`, but the normal open-sync path still fires it.

    Priority: LOW — cosmetic console noise, no data impact.
    Discovered: Phase B investigation, 2026-06-01.

70. **OPEN** [Backlog] — bcFetchCustomerContacts 400 on specific customer C10114. Opening projects tied to
    customer C10114 triggers a 400 from the BC `customerContacts` endpoint. Other customers work
    fine. Likely a data-quality issue in BC (malformed contact record or missing required field on
    the BC side), but ARC doesn't handle the 400 gracefully — it logs a console error and
    silently skips contact population.

    Required behavior: Wrap bcFetchCustomerContacts in a try/catch that degrades gracefully
    (empty contacts array, no error noise). Optionally log the specific customer number to debug
    logs for BC admin follow-up.

    Priority: LOW — only affects one customer, non-blocking.
    Discovered: Phase B investigation, 2026-06-01.

71. **OPEN** [Backlog] — Vendor field source-of-truth audit. `bcVendorNo` and `bcVendorName` are
    independently populated in BOM data. Many projects have `bcVendorName` but no `bcVendorNo`.
    Different code paths check different fields for vendor presence.

    Symptom: PRJ402064 had 18/18 base BOM rows with `bcVendorName` populated but `bcVendorNo`
    empty. `scanBomForArchiveIssues` checked only `bcVendorNo`, flagging all 20 rows (including
    ECO adds) as "missing vendor" despite every row having a vendor name assigned.

    Stopgap shipped (v1.20.63): `scanBomForArchiveIssues` now passes if EITHER `bcVendorNo` OR
    `bcVendorName` has data, plus Matrix Systems vendor exclusion added.

    Audit needed: Identify all code paths reading vendor fields, determine when each is populated
    (BC sync, extraction, manual entry, pricing refresh), recommend canonical field per purpose.
    Investigation scope: Display, BC sync (PO creation, planning lines), search/filter,
    import/export, ECO handling. Action items if audit surfaces issues: Possibly backfill missing
    `bcVendorNo` from `bcVendorName` via BC lookup, or migrate to use `bcVendorName` as canonical
    for validation checks.

    Priority: MEDIUM — no immediate user-facing failures, but indicates systemic data integrity
    gaps worth resolving.
    Discovered: Milestone E Phase 2 smoke test on PRJ402064 (v1.20.62), 2026-06-01.
    Owner for investigation: Coach.

72. **OPEN** [Backlog] — Cannot change customer on existing project from ARC UI.
    After a project is created, ARC's UI allows editing project name and customer contact, but not
    the underlying customer (the `Bill_to_Customer_No` that ties the project to "Ovivo", "FLSmidth",
    etc.).

    Impact: If a customer is wrong at creation time, there's no recovery path within ARC. Limited
    workaround is editing in BC directly, but it's unconfirmed whether BC allows changing
    `Bill_to_Customer_No` on an existing project (may depend on PO activity, planning lines, etc.).

    Why noted: Discovered during Milestone E Phase 3 planning, where this constraint determined that
    Copy needs an upfront customer picker (rather than inheriting and allowing later change).

    Investigation needed: Confirm whether BC allows changing `Bill_to_Customer_No` on an existing
    project. If BC allows it, ARC should expose the change.

    Priority: LOWER — no immediate user-facing issue, but represents a UI gap that could become a
    problem if a customer assignment mistake happens.
    Discovered: Milestone E Phase 3 planning (v1.20.63), 2026-06-01.

73. **OPEN** [Backlog] — BOM extraction warning visibility (Scan Results banner).
    Symptom: When extraction produces issues (missing rows, sequence gaps, dedup-caused gaps),
    warnings appear in the ScanResultsBanner component above the BOM table. But the banner is
    collapsed by default. The collapsed summary shows all concerns on one line separated by
    middots, easy to gloss over.

    Impact: Real extraction problems can be silently ignored by users. Item 18 missing from
    RSD0203-126's extraction was caught by the system (`finalSequenceGaps` included `[18]`) but
    Jon didn't notice the warning during spot-check.

    Additionally: The warning message text says "missed by the AI scan" which is misleading for
    dedup-caused gaps (the AI returned the row, ARC's exact dedup consumed it). Different cause,
    same symptom, different message needed.

    Proposed improvements (Coach to design later):
    - Make the banner expanded by default when concerns exist
    - Promote the most critical issues out of the middot list
    - Distinguish "AI missed" gaps from "dedup-caused" gaps via mergeStats (if rawCount > exactCount,
      at least some gaps came from dedup)
    - Maybe add an inline indicator near affected BOM rows

    Priority: MEDIUM — no immediate data loss now that the dedup fix is shipped (v1.20.67), but
    represents a real product gap. A user could miss other warnings about extractions that the
    system correctly flagged.
    Discovered: RSD0203-126 extraction spot-check after v1.20.66, 2026-06-01.
    Owner for design: Coach.

75. **STALE — superseded** [closed 2026-07-07: overlaps the #52/#127 progress-bar work; via legacy B/F/G categorization] (was B) — Extraction progress bar accuracy.
    Symptom: During extraction, the progress bar does not move smoothly or accurately. User has
    limited visibility into how far along the extraction is.

    Impact: User uncertainty during long extractions (100s+). User doesn't know if extraction is
    still running, stuck, or how much longer to wait.

    Possible causes (to analyze when prioritized):
    - Progress events not fired by Cloud Function during extraction
    - Progress states use static labels instead of percentage updates
    - Client-side timer not synchronized with actual extraction state
    - No granular per-step progress (only "extracting" → "complete")

    Investigation areas:
    - Where is the progress bar driven from? What events update it?
    - Can per-page progress be reported by the Cloud Function?

    Recommended approach (Jon, 2026-06-01):
    - Cloud Function writes progress milestones to Firestore (e.g. `panel.extractionProgress` field)
    - Client subscribes via existing project Firestore listener (no polling)
    - Progress bar maps milestones to percentage and label

    Granularity per page:
    - `queued` → `parsing-pdf` → `ai-extraction` → `parsing-response` → `validation` → `merging` → `saving` → `complete`
    - For multi-page: `pagesTotal`, `pagesComplete`, `currentPage`

    The data already exists in Cloud Functions logs — surface it via Firestore writes for the client
    to consume. This matches ARC's existing subscription pattern and avoids polling overhead.
    Marc + Coach to refine the exact field schema during implementation.

    Priority: LOWER — cosmetic / UX improvement, not data-affecting.
    Discovered: PRJ402109 Line 4 RSD0203-126 re-extractions, 2026-06-01. Jon observed limited
    progress visibility during long extraction runs.
    Owner for design: Coach.

## Development Direction (2026-06-01)

76. **STALE — superseded** [closed 2026-07-07: the CCD `send_message` bus is built; via legacy B/F/G categorization] (was G) — Multi-Claude coordination layer (Freddy ↔ Coach ↔ Marc).
    Symptom: Three-role workflow currently requires Jon to manually copy/paste messages between
    Claude.ai (Freddy Lyst / Analyst), CC Terminal (Sam Wize / Coach), and CCD (Marc Masdev / Dev).
    Each exchange is a forwarded paste. Friction is real: latency, lossy summarization,
    version-tracking mistakes (e.g., one role drafting guidance about a fix that was never actually
    deployed, or referencing a version that another role hasn't seen yet).

    Impact: Slows multi-role work. Increases chance of coordination errors. Limits how complex
    problems can be solved before context drift. Jon spends substantial cognitive load just routing
    messages between sessions.

    Concept: Direct Claude-to-Claude messaging between the three roles, with Jon as facilitator
    rather than message bus.

    Possible directions to explore:
    - Shared SESSION-LOG.md in repo root — all roles read/append, single source of truth
    - MCP-based coordination — dedicated MCP server with a message bus, each Claude instance
      posts updates and reads from a shared queue
    - Repurpose TRAQS infrastructure — CCD hooks already feed into
      ccd-monitor.cloudfunctions.net/ccdHook, could extend to route between sessions
    - Nested sub-agents — Claude Code supports nested agent invocation, Marc could be a
      sub-agent invoked from Coach's terminal instead of a separate session

    Considerations:
    - Each Claude instance has its own context window; persistent shared state needs to live
      somewhere durable (file, Firestore, or external service)
    - Notifications already exist (Pushover via notify.ps1) — could be extended for inter-role
      messages beyond simple alerts
    - Version drift is a real risk — any solution needs to handle "Claude A thought v1.20.X was
      deployed when it was actually v1.20.Y"
    - Conversation log compaction means each session loses context over long conversations;
      coordination layer needs to survive compactions
    - Related: CCD hooks at ccd-monitor.cloudfunctions.net are existing infrastructure that
      could be extended; may overlap with TRAQS direction

    Priority: HIGH — Jon explicitly elevated this. The paste-forwarding workflow has surfaced
    multiple coordination errors during today's multi-role work and is a real bottleneck for
    productive three-session collaboration.
    Discovered: Multiple instances throughout 2026-06-01 work where paste-forwarding caused
    version-tracking confusion and added latency between sessions.
    Owner for design: Coach (with Jon coordination on broader Matrix ARC tooling stack).

77. **RESOLVED** [Verified] (v1.20.80, dfbb2293, field-verified by Jon + Noah — all 5 tests pass incl. navigate-away-return symptom check) — UI bug: page delete renders broken state during pre-extraction phase.
    Root cause: removePage wrote to panel.pages and Firestore instead of pendingPages; Firestore
    save stripped dataUrl, causing black images on fallback. Fix: pre-extraction-aware removePage
    updates pendingPages/cache directly, no Firestore write.
    Design: PRE-EXTRACTION-PAGE-MGMT-DESIGN.md (Coach v3), PRE-EXTRACTION-PAGE-MGMT-ANALYST-REVIEW.md (Freddy).
    Discovered: Noah's workflow feedback during pre-extraction page management (2026-06-02).

78. **RESOLVED** [Verified] (v1.20.80, dfbb2293, field-verified by Jon + Noah — all 5 tests pass) — Feature: pre-extraction page selection/deletion.
    Shipped alongside #77. Delete-based page management per Jon's 5-step flow (drop → scan →
    delete unwanted → confirm types → extract remaining). "Proceed with Extraction" button shows
    live page count after deletions and disables when list is empty. Pre-extraction deletes
    survive in-app navigation (module-scope cache) but not browser refresh (intentional).
    Design: PRE-EXTRACTION-PAGE-MGMT-DESIGN.md (Coach v3), PRE-EXTRACTION-PAGE-MGMT-ANALYST-REVIEW.md (Freddy).
    Discovered: Noah's feedback during pre-extraction page management (2026-06-02).

## BOM Prompt Fix (2026-06-02)

79. **RESOLVED** [Verified] (v1.20.81) — F-1a.3 / F-1d.8: BOM prompt duplicate-merge instruction caused silent data loss.
    The `DUPLICATE PART NUMBERS` prompt instruction told the AI to combine same-PN rows with
    summed qty before returning results. This destroyed data inside the model's response before
    ARC's code dedup (positional → exact → fuzzy merge at line 13884+) could handle it correctly.
    Root cause of the 592273 failure (items 17/18 on RSD0203-126 silently merged during extraction).
    Prompt merge fix shipped in two stages. v1 (4b2ef7a0, Jun 1): merge only if descriptions
    identical — field-verified by Jon on 592273 (different-description case). v2 (v1.20.81,
    4cfaeb81 + 67dd897c, Jun 2): removed all AI-side merging, defers to code dedup. v1.20.81
    is strictly more permissive and inherits the 592273 result for different-description rows,
    Same-PN/same-description case runtime-verified by Marc on v1.20.81 via browser console dedup
    pipeline test: 5 scenarios (same-PN/same-desc/same-itemNo → collapsed qty summed; cross-page
    duplicate → collapsed; same-PN/different-desc → kept separate; same-PN/same-desc/different-itemNo
    → kept separate; unrelated part → untouched). All pass. Verification gap closed.
    Changed at `src/app.jsx:11286` and `functions/bomPrompt.js:215`.
    Discovered: overnight audit F-1a.3 (2026-06-01), diagnosed across v1.20.67-69 dedup fixes.

## Feedback Re-Extract Dedup Key Mismatch (2026-06-02)

80. **OPEN** [Backlog] (HIGH) — Feedback re-extract path uses PN-only dedup key — merges more aggressively
    than first-extract/re-extract paths.
    Feedback re-extract (`app.jsx:24101-24103`) dedups on PN alone, while first-extract (line
    13893) and re-extract (line 23889) key on `PN + itemNo + descNorm`. Consequence: two distinct
    line items sharing a PN but with different descriptions survive the normal paths but get
    silently merged on a feedback re-extract — same data-loss class as the prompt over-merge just
    fixed (F-1d.8/#79). Same BOM dedups differently depending on which extraction path is taken.
    Needs investigation to confirm real-world impact (how often do users trigger feedback
    re-extract on panels with same-PN/different-desc items?).
    Not fixed by F-1g.1 (v1.20.82), which instruments the merge for reporting but does not change
    merge behavior. F-1g.1's exactMerges instrumentation will surface this over-merge when it
    happens, making it visible rather than silent.
    Discovered: Coach trace during F-1g.1 plan (2026-06-02).
    H5 RE-TRIAGE (2026-06-16): NOT addressed by H5 — independent root cause. H5 is a rendering/model
    fidelity change; it doesn't touch dedup-key logic. Still OPEN as-is.

## PRJ402119 Extraction Failure (2026-06-02)

81. **OPEN** [Backlog] (HIGH) — Extraction anomaly detection: warn user when results look suspicious.
    When extraction produces anomalous results, ARC should surface a modal warning instead of
    silently accepting bad data. Anomaly signals (any should trigger):
    - Zero items from a user-asserted BOM region (wrong region/drawing)
    - All/most items have placeholder PNs ("TO BE CONFIRMED", "?", "TBD")
    - Very low confidence scores across the board
    - Descriptions that don't match BOM patterns (no manufacturer, no part-like strings)
    - Column header detection failure flagged by the AI
    Target UX: modal warning after extraction completes, explaining what anomalies were found
    and suggesting the user verify the BOM region / page selection. Not a blocker — user can
    dismiss and keep the results — but makes the problem visible instead of silent.
    Observed on PRJ402119: Line 2 bad region produced items with "TO BE CONFIRMED" as PNs —
    visible enough to signal a problem, but only because the user checked. Lines 1-2 earlier
    had wrong regions with 0 items and ARC said nothing.
    Design: Freddy scope (modal triggers, wording, actions). Not part of F-1g.1.
    Discovered: PRJ402119 diagnostic (2026-06-02).
    H5 RE-TRIAGE (2026-06-16): NOT addressed by H5 — independent root cause (missing warning UI, not a
    fidelity problem). Higher H5 accuracy lowers anomaly frequency but the safety-net surface still
    doesn't exist. Still OPEN.

82. **RESOLVED** [Verified] — `10fdced5` + `4e31f918` (2026-06-02, functions deployed 2026-06-02T21:49:04Z).
    PDF-native extraction bailing on CropBox pages with `noBomReason:"wrong-page-type"`.
    P1: removed noBomReason escape when `pdfCropped===true` (both `extractBomPage` and
    `extractBomBatch`). P2: added scan quality alert to bom-region-crop fallback prompt.
    Deploy status verified definitively by Coach C22 (2026-06-03): byte-for-byte diff of
    deployed source archive vs committed `functions/index.js` = zero diff. Runtime log
    confirmed scanned PDF extracting to completion post-fix.
    Discovered: PRJ402119 diagnostic (2026-06-02).

83. **OPEN** [Backlog] (HIGH) — Image/crop fallback path architecture — replace lossy JPEG with full-res
    PDF region crop or fail visibly.
    The current bom-region-crop fallback sends a canvas-cropped JPEG of the page image. On
    scanned monochrome drawings (166 DPI), JPEG compression destroys edge detail on text
    characters, causing systematic misreads (3→0, G→6/8, 12→L, etc.). Target architecture
    per Jon: PDF-native primary (fixed per #82 P1) → full-res PDF region crop as fallback
    (CropBox on the native PDF, NOT JPEG) → if that fails, FAIL VISIBLY ("couldn't extract
    reliably, verify manually"). Never silently hand the user a low-confidence BOM that looks
    confident. Before removing the JPEG path, need data: how often does image-crop fallback
    produce a GOOD BOM vs garbled? Investigation pending.
    Discovered: PRJ402119 diagnostic (2026-06-02).
    H5 RE-TRIAGE (2026-06-16): SCOPE DOWN to the "fail visibly" half only. H5 (v1.20.112–113) delivered
    the controlled high-DPI region render this ticket called for — 600-DPI region tiles replacing the
    lossy 166-DPI JPEG crop — so the fidelity half is DONE. BUT H5 silently falls through to the old
    PDF-native/crop paths on failure (H5-VERIFICATION-RESULTS.md line 39); the "if it fails, FAIL
    VISIBLY" requirement is still open. Keep OPEN, narrowed to fail-loud-on-fallback.

84. **OPEN** [Backlog] (MEDIUM) — Extraction drops last row(s) on scanned BOMs + misses companion parts.
    On PRJ402119 Sht 3/6 (13-row BOM), the JPEG+P2 path consistently extracts 13/14 items
    (missing LNM40BPK100, the last row) and the companion TYD2CW6 (written as "WITH COVER
    TYD2CW6" on the same line as TYD15X3WPW6, row 8). The splitCompanionParts post-processor
    exists but depends on the AI emitting the companion — on this scan the model only returns
    the primary part. Two sub-issues:
    (a) Last-row drop: BOM table bottom may be clipped by the crop region or the model stops
        reading before the final row. Check if the crop region coordinates include row 13.
    (b) Companion-part miss: the prompt asks for companion splitting but the model doesn't
        always comply on scanned drawings with small text. May need stronger prompt or a
        post-processing pattern match ("WITH COVER", "WITH BASE", "WITH SOCKET").
    Discovered: PRJ402119 variance measurement (2026-06-02).
    **Update (2026-06-03):** Both symptoms NOT REPRODUCED on the post-#94 extraction run
    (v1.20.95). LNM40BPK100 (last row) AND TYD2CW6 (companion part) both extracted. The #94
    inclusion fix changed the image source from in-memory addFiles render to ensureDataUrl
    (Storage-fetched), which may have altered the image the model sees. Truncation and
    companion-miss may have been artifacts of the prior image path rather than systematic
    prompt/model failures. Keep OPEN pending reproduction on another scanned BOM project;
    if not reproduced after 3+ projects, mark STALE. See #95 for fidelity issues on the same
    extraction run.

86. **RESOLVED** [Verified] (CRITICAL) — Cross-project BOM contamination via stale extraction callback + reused ProjectView.
    Root cause: two issues combined. (1) Panel IDs are sequential (`panel-1`, `panel-2`) and
    collide across every project. (2) `<ProjectView>` had no `key` prop, so React reused the
    same component instance when the user navigated directly between projects (e.g., notification
    click). When a long-running extraction completed after the user switched to a different project,
    `onDone` callback wrote PRJ402119's BOM into PRJ402111's React state via panel ID collision.
    The Firestore save inside `runExtractionTask` was always clean (captured projectId in closure);
    contamination was through the React state `onUpdate` → `setProject(prev => ...)` chain where
    `prev` was the new project's data. Auto-pricing then persisted contaminated data via
    `onSaveImmediate`.
    Fix: (a) Added `key={openProject.id}` to `<ProjectView>` — forces unmount/remount on project
    switch, killing all stale closures. (b) Added `_extractionProjectId` guard in `onDone` that
    compares against `_currentProjectId` at completion time — defense-in-depth that blocks
    `onUpdate` and auto-pricing if the active project changed during extraction.
    Follow-up: Panel ID uniqueness (use `panel-${Date.now()}-${random}` instead of sequential
    `panel-1`) would eliminate the collision class entirely. Tracked separately — not part of
    this hotfix due to migration risk on existing projects. Also: `_pendingPagesCache` uses the
    same panel-ID key and could cross-contaminate cached pages between projects (lower severity,
    same class).
    Discovered: 2026-06-03 (PRJ402119 → PRJ402111 contamination reported by Noah).
    Contamination paths: `app.jsx:23208` (onDone→onUpdate), `app.jsx:32955` (panel map by ID),
    `app.jsx:35110` (setProject function updater), `app.jsx:25783` (pricing onSaveImmediate).
    Fix sites: `app.jsx:45160` (key prop), `app.jsx:23209` (extraction guard).

87. **OPEN** [Backlog] (MEDIUM) — Panel IDs are non-unique across projects (follow-up hardening for #86).
    All projects generate panel IDs as `panel-1`, `panel-2`, etc. (`app.jsx:10043`, `app.jsx:39799`).
    Any module-scoped cache or callback keyed by panel.id can cross-contaminate between projects.
    Known affected: `_pendingPagesCache` (app.jsx:433), `_bgTasks` (app.jsx:421).
    Fix: generate unique IDs (`panel-${Date.now()}-${random}`) for new panels. Existing projects
    keep their current IDs (migration not needed — the #86 fix prevents the acute contamination).

88. **OPEN** [Backlog] (MEDIUM) — Async ownership audit: verify all long-running operations have project-scoped
    completion behavior. TODO #86 proved that async completion handlers can write to the wrong
    project if the user navigates away during execution. The extraction path is now fixed, but
    the same class of bug could exist in other async operations.
    Candidate areas to audit:
    - Extraction (`runExtractionTask`, `reExtractWithFeedback`) — FIXED in #86
    - Pricing (`runPricingOnPanel`, auto-pricing after extraction) — check `onSaveImmediate` closure
    - BC sync (`bcSyncPanelPlanningLines`, `bcSyncPanelTaskDescriptions`) — fire-and-forget pattern
    - Archive/Restore — long-running with multiple Firestore writes
    - Copy project — async with storage uploads
    - Attachment processing (`addFiles` → PDF upload → page rendering)
    - Import operations
    Goal: ensure async completion cannot mutate whichever project happens to be active. Each
    operation must capture `projectId` at invocation and validate before writing.
    Related: #86 (root cause), #87 (panel ID uniqueness). See CLAUDE.md "Async Project Ownership
    Rule" and `DIAGNOSTIC-CROSS-PROJECT-CONTAMINATION.md`.
    Discovered: 2026-06-03 (lesson learned from #86 investigation).
    Owner for investigation: Coach.

89. **RESOLVED** [Verified] (HIGH) — Background extraction pricing completion.
    When extraction completes for a project that is no longer the active view, pricing does not
    run. The #86 contamination guard correctly blocks `onDone` → `runPricingOnPanel` to prevent
    cross-project state writes, but the result is that the originating project's BOM is saved
    unpriced — 40 of 42 rows red on PRJ402119 after a navigate-away extraction.
    Product requirement: users must be able to start extraction on one project, navigate away,
    and have that project complete correctly in the background (including pricing).
    Fix: approach (a) — run pricing safely against the originating project using captured
    projectId/panelId closure. When the guard detects a project switch, pricing runs with
    `{background:true}` — suppresses React state setters and UI modals, writes directly to
    Firestore via `onSaveImmediate` (which is correctly project-scoped). Applied to all three
    extraction paths: `confirmAndExtract` (v1.20.89), Re-Extract Drawings + `reExtractWithFeedback`
    (v1.20.90).
    **Validated 2026-06-03 (v1.20.90):** Guard fired correctly, background pricing executed,
    background validation executed, correct project received updates, sentinel project unchanged,
    no forced navigation during test. All three extraction paths pass navigate-away test.
    Discovered: 2026-06-03 (PRJ402119 contamination test).
    Related: #86 (guard that causes this), #88 (async ownership audit), #91 (background workflow
    audit), #92 (UI ownership audit).

90. **OPEN** [Backlog] (MEDIUM) — ARC Cross UX: supersession not visually distinct from extraction error.
    Lead case on PRJ402119: model correctly read `855F-VMS20B24Y3L3Y8Y4Y6` (discontinued
    Allen-Bradley 855F stack light), ARC Cross correctly auto-replaced with `856TC-VMB24Y3Y5Y4`
    (current successor). Both extraction and ARC Cross worked as designed — the original part IS
    discontinued and the replacement IS intentional.
    Problem: an experienced user interpreted the valid supersession as an extraction error because
    the current "from: 855F... / ARC Cross / auto-replace" indicator doesn't clearly communicate
    that this was a deliberate discontinuation replacement vs. an OCR correction vs. a user
    preference. This triggered a false investigation.
    Proposed fix: change the ARC Cross pill/label to communicate intent more clearly. Options:
    - "Superseded — ARC Cross" (communicates discontinuation)
    - "Replaced (discontinued) — ARC Cross" (explicit reason)
    - Add a tooltip showing: "Original part 855F-VMS20B24Y3L3Y8Y4Y6 was recognized correctly.
      Replaced with 856TC-VMB24Y3Y5Y4 because the original is discontinued (per your ARC Cross
      database)."
    Goal: reduce false extraction investigations caused by users interpreting valid ARC Cross
    replacements as extraction errors. The indicator must clearly convey: (1) the original part
    was recognized, (2) the replacement was intentional, (3) the reason was supersession.
    Note: the alternates DB currently stores no reason field (discontinuation vs. preference vs.
    cost). Adding an optional `reason` field to alternate entries would enable context-specific
    labels. Low effort, high UX value.
    Discovered: 2026-06-03 (PRJ402119 BOM diagnostic — Jon initially suspected extraction defect).

91. **OPEN** [Backlog] (MEDIUM) — Background workflow audit: verify all extraction-completion functions are
    background-safe and do not depend on active UI state.
    The #86 contamination fix and #89 pricing fix exposed that pricing was part of the extraction
    completion chain and broke when the user navigated away. We fixed the immediate issue, but
    should verify all background-completion functions are correctly project-scoped.
    When extraction completes after the user navigates away, verify each of these is background-safe:
    1.  Extraction result save (`saveProjectPanel` in `runExtractionTask`)
    2.  Pricing (`runPricingOnPanel` — BC match, AI fallback, lead times)
    3.  BC item lookup (`bcLookupItem`, `bcFuzzyLookup`)
    4.  BC purchase price lookup (`bcFetchPurchasePrices`)
    5.  BC vendor resolution (`bcGetItemVendorNo`, `bcGetVendorName`, vendor backfill)
    6.  BC planning line sync (`bcSyncPanelPlanningLines` — fire-and-forget at end of pricing)
    7.  ARC Cross application (`applyLearnedCorrections` in extraction pipeline)
    8.  Fuzzy match suggestion generation (`setBcFuzzySuggestions` — React state setter)
    9.  Auto-assign behavior (`_autoAssignTriggerSetter` — module-scope, can fire on wrong project)
    10. Firestore listener recovery (does data appear correctly when user returns?)
    11. Task completion/status reporting (`bgDone`, `bgUpdate` — module-scope `_bgTasks`)
    12. Modal/toast/UI side effects (`setPricingReport`, `arcAlert`, progress bar)
    For each function, classify as:
    - Safe as-is (uses captured projectId or explicit args)
    - Requires captured projectId/panelId (currently uses closure but correctly scoped)
    - UI-only, should be suppressed in background mode (React state setters, modals)
    - Unsafe in background mode (references active project or module-scope mutable state)
    - Requires future hardening
    Core rule: no background-completion function should use the currently active project to
    determine where data is saved, synced, or applied.
    Preliminary assessment from C17 analysis (2026-06-03):
    - Items 1-6: safe as-is (explicit projectId args or closure-captured, module-scope BC functions)
    - Item 7: safe (runs inside `runExtractionTask` before `onDone`)
    - Item 8: UI-only, no-op on unmounted component (harmless)
    - Item 9: UNSAFE — `_autoAssignTriggerSetter` is module-scope, can fire on wrong project after
      600ms timeout. Needs `background` flag guard.
    - Item 10: safe — Firestore listener subscribes on mount, gets latest data including pricing
    - Item 11: safe — `_bgTasks` is module-scope but keyed by panelId, used for UI badge only
    - Item 12: UI-only, no-ops on unmounted component (cosmetic React warnings)
    Related: #86 (contamination root cause), #88 (broader async ownership audit), #89 (pricing fix).
    See C17 in COACH.md for detailed analysis.
    Discovered: 2026-06-03 (follow-up from #89 investigation).
    Owner for investigation: Coach.

92. **OPEN** [Backlog] (HIGH) — Background task UI ownership audit: background operations must never seize
    foreground UI control.
    Observed during v1.20.89 testing: background extraction/project updates appear capable of
    pulling the user into another project, screen, panel, or required-input workflow when
    milestones are reached or user attention is requested.
    Core rule: the active user workflow always owns the foreground UI. Background operations may
    request attention but may not seize control.
    Allowed (passive, non-disruptive):
    - Task chip updates (`_bgTasks` status/progress)
    - Notifications (bell badge, Pushover)
    - Badges (amber pills, red dots)
    - Passive status indicators (progress bars within the originating panel's chip)
    - Action-center items (queued for user to act on when ready)
    Not allowed (foreground-seizing):
    - Route changes (navigating to a different project/view)
    - Project switches (changing `openProject` from a background callback)
    - Panel switches (changing `selectedPanelId` from a background callback)
    - Modal opens (`arcAlert`, `arcConfirm`, pricing report, auto-assign, EQ modal)
    - Focus changes (scrolling to a panel, highlighting a row)
    - Screen navigation (switching from dashboard to project view)
    - Required-input interruptions (dialogs that block until user responds)
    Audit scope — identify every path capable of changing foreground UI state from a background
    project's completion handler:
    1.  Extraction completion (`onDone` → modals, EQ modal, auto-assign)
    2.  Re-extraction completion (`reExtractWithFeedback` → same completion chain as extraction)
    3.  Pricing completion (`runPricingOnPanel` → pricing report modal, auto-assign trigger)
    4.  BC sync (`bcSyncPanelPlanningLines` → error modals, posting group fix alerts)
    5.  Imports (supplier portal apply → modal opens, navigation)
    6.  AI jobs (validation completion → status changes that trigger re-renders)
    7.  Task completions (`bgDone` → chip updates are OK, but check for side effects)
    8.  Validation requests (panel validation → status updates, potential modal triggers)
    9.  Required-input requests (EQ modal, confidence review, budgetary enforcement)
    10. Notifications (`onSupplierQuoteSubmitted` listener → auto-navigate to project on click)
    For each path, classify as:
    - Passive (chip/badge/notification) — allowed, no change needed
    - Foreground-seizing — must be suppressed or deferred when the originating project is not active
    - Conditional — safe when originating project is active, must be suppressed otherwise
    Implementation pattern: before any modal open, route change, or focus action, check
    `_currentProjectId === originatingProjectId`. If mismatch, queue the action as a notification
    or deferred item instead of executing it immediately.
    This is an architectural hardening item — not a single bug fix. The goal is to establish and
    enforce the rule that background operations never own the foreground.
    Related: #86 (contamination), #89 (background pricing), #91 (background workflow audit).
    Discovered: 2026-06-03 (v1.20.89 testing — background task pulled user into wrong context).
    Owner for investigation: Coach.

93. **OPEN** [Backlog] (MEDIUM) — Extraction pipeline consolidation: shared completion handler for all three
    extraction paths. Currently `confirmAndExtract`, Re-Extract Drawings, and `reExtractWithFeedback`
    each have their own `onDone` callback with independently implemented guards, background pricing,
    and BC sync logic. The #86/#89 fixes were applied to each path separately — same pattern, three
    copies.
    Recommended: extract a shared `onExtractionComplete(finalPanel, {extractionProjectId, ...})`
    function that owns the project-switch guard, background pricing, BC sync, and UI suppression.
    Each entry point calls `runExtractionTask` with an `onDone` that delegates to the shared function.
    Per-path differences (validation after first extract, feedback merge) happen BEFORE `onDone`.
    Risk: MEDIUM — touches three code sites in a 46K-line file. Requires Coach review before merge.
    Do not start until #89 is validated and #92 audit is understood.
    Related: #86, #89, #91, #92. See C18 in COACH.md for architecture recommendation.
    Discovered: 2026-06-03 (C18 extraction architecture priority plan).
    Owner: Coach (design) → Marc (implement).

94. **RESOLVED** [Verified] — v1.20.95 (2026-06-03). dataUrl-gating bug: BOM extraction silently skipped when pages lack dataUrl.
    `confirmAndExtract` (line 23353) and `runExtractionTask` (line 13512) filtered BOM pages on
    `p.dataUrl` — an ephemeral field stripped by every Firestore save. After a save-reload cycle
    (or component remount during the awaitingConfirm pause), BOM-typed pages with only `storageUrl`
    were silently excluded. The extraction task still completed (title block, layout, validation
    all succeed because they use `p.dataUrl||p.storageUrl`), so the user saw "clean completion"
    with zero BOM items and no error.
    Fix: Sites A (confirmAndExtract 23353) + B (runExtractionTask 13512) changed to
    `(p.dataUrl||p.storageUrl)`; Site B adds `ensureDataUrl` after filter. Site C (zoom
    detection 23242) CARVED OUT — needs `ensureDataUrl` or a `detectZoomedPages` guard;
    tracked as #94a, Coach to design. Root cause PRJ402119 Line 1 (Noah 2026-06-03),
    confirmed Coach C23, Site C correction Freddy.
    94a. **OPEN** [Backlog] (LOW) — Site C follow-up: `detectZoomedPages` reads `pg.dataUrl` directly
         (line 12874) without `ensureDataUrl`. If storageUrl-only pages reach it, zoom detection
         fails silently. Needs either `ensureDataUrl` hydration before the call, or an internal
         guard in `detectZoomedPages`. Low-risk: Site C runs during `addFiles` when pages normally
         have `dataUrl`, but the inconsistency should be fixed for robustness.
    Discovered: 2026-06-03 (PRJ402119 Line 1 empty-BOM trace, Coach C23).
    Owner: Coach (C23) → Marc (implemented A+B).

95. **RESOLVED** [v1.20.112–113 H5/600-DPI; re-validated on PRJ402119 2026-06-16] — PRJ402119 Line 1 PN accuracy: ground truth SETTLED (2026-06-04).
    Marc read the drawing via browser. Score: **7/13 correct (54%), 6/13 wrong (46%).**

    **CONFIRMED ERRORS (against authoritative drawing):**
    - Item 3: 3038338 → 3036038 (8→6 at pos 4, 3→0 at pos 5)
    - Item 5: 3214314 → 3214014 (3→0 at pos 5)
    - Item 7: 0807012 → 0907012 (8→9 at pos 2)
    - Item 8: TYD15X3WPW6 → MPWS (wholesale misread + slash-split pipeline bug, fixed in #97)
    - Item 8 cover: TYD2CW6 → TYD2CWS (6→S)
    - Item 12: LNM25BPK100 → LNMQ3RP-100 (restructured: 25B→Q3R)
    - Item 13: LNM40BPK100 → LNMQ8RP-100 (restructured: 40B→Q8R)
    **CONFIRMED CORRECT:** Items 1,2,4,6,9,10,11. Item 10 SECM25G confirmed correct (Freddy was right).
    Error classes: digit substitution (items 3,5,7) + structural misread (items 8,12,13) on pdf-native.

    Prior "CONTESTED" items resolved — all originally disputed items now scored.
    - Item 10: Marc scored SECM25G as WRONG vs source "SECME5G" — but description says
      "M25 gray" and Hubbell M25 = SECM25G. Extracted value is LIKELY CORRECT; Marc's source
      transcription was the error. The Claudes are misreading the drawing at ~the rate they
      attribute to the model.
    - Item 7: read 3 different ways by 3 sources.

    **ACTION REQUIRED:** Authoritative ground-truth PN list from Jon/engineering source BEFORE
    scoring. Without it, error rates are meaningless.

    **Two hypotheses (both OPEN — neither verified):**
    1. PATH/IMAGE FIDELITY: digit-substitution errors (3→0, 2→3, 6→S) are the signature of a
       VISION model reading a RENDERED IMAGE, not a text layer — text extraction is lossless or
       fails, it doesn't swap digits. The #94 fix routes via storageUrl→ensureDataUrl; if that
       image is lower-res than the addFiles render, it directly explains the digit class. Marc
       asserted "PDF-native vector text" — that assertion needs verification (confirm what the
       model actually receives: text layer vs rendered image vs JPEG crop, at what resolution).
    2. ARC CROSS / AUTO-REPLACE: the structural errors (MPWS, LNMQ#RP-100) may be raw model
       output OR a downstream "known-equivalent" swap (C5 class). Raw model output has NOT been
       inspected — only final UI rows.

    **Next-session trace (Marc, evidence-first, do NOT design fix):**
    a) Confirm the actual image/text the model receives for Line 1's BOM page + resolution.
    b) ONE structural failing PN (start Item 8 / MPWS) end-to-end: raw model output → parsed
       → normalization → ARC Cross/auto-replace → BC lookup → final UI. The right-description/
       wrong-PN signature is the sharpest discriminator between vision error and auto-replace.

    Related: #94 (inclusion fix that changed image source), #84 (same project, truncation/
    companion symptoms NOT reproduced), #85 (Excel cross-check), C5 (auto-cross corruption).
    Discovered: 2026-06-03 (PRJ402119 Line 1 post-#94 validation). Corrected same day after
    Marc's source comparison revealed ground-truth disputes.
    RESOLUTION (2026-06-16): H5 region-targeted 600-DPI tiling + Opus 4.8 (v1.20.112–113) fixed the
    glyph-misread root cause — Hypothesis 1 (image fidelity) CONFIRMED ("the misreads were a DPI
    problem"). PRJ402119 — the ACTUAL #95 case, not just the PRJ402101 verification project — was
    re-extracted and Jon confirmed 100% PN accuracy against ground truth. The 54% misread baseline
    (digit-substitution + phantom-char classes) is resolved. The structural errors (#95 items 8/12/13)
    are also covered — the slash-split × positional-dedup bug behind them was fixed in #97.
    Resolved: 2026-06-16.

96. **STALE — superseded** [closed 2026-07-07: the CCD `send_message` bus supersedes manual relay; via legacy B/F/G categorization] (was F) — Windows facilitator app for three-role Claude workflow.
    Currently Jon manually copy-pastes messages between CCD (Marc), Terminal (Coach), and
    Claude.ai (Freddy). A lightweight Windows desktop app could automate or streamline this
    relay — clipboard monitoring, paste routing, session status dashboard, maybe direct API
    integration for the Claude.ai leg. Would eliminate the primary bottleneck in the
    three-role workflow.
    Discovered: 2026-06-03 (Jon idea during close out).

85. **OPEN** [Backlog] (HIGH) — BC validation cannot disambiguate all misreads — need Excel cross-check.
    On PRJ402119, both 3036338 and 3038338 are valid Phoenix Contact SKUs in BC. A misread
    that lands on ANOTHER valid PN is invisible to BC lookup validation — only the source
    drawing (or the customer's Excel/spreadsheet BOM) can disambiguate. This is the strongest
    case for the Excel cross-check workflow on Ovivo: the spreadsheet contains unambiguous
    typed part numbers, no glyph-reading required. For customers who provide Excel BOMs
    alongside drawings, cross-check extracted PNs against the spreadsheet and flag mismatches.
    Discovered: PRJ402119 diagnostic — Jon confirmed both candidate PNs resolve in BC (2026-06-02).
    H5 RE-TRIAGE (2026-06-16): urgency REDUCED (H5 600-DPI cut misreads sharply — 100% on the
    re-validated cases) but NOT closed. The gap survives any nonzero misread rate: a misread landing on
    ANOTHER valid PN is invisible to BC lookup — the independent-source (Excel) cross-check is still the
    only thing that catches it. Keep OPEN, lower priority.

## Round 18 (extraction pipeline audit, 2026-06-04)

97. **RESOLVED** [Verified] — `5f3a0b21` (v1.20.96, deployed 2026-06-04) — Slash-split × positional-dedup
    destructive interaction. The slash-split code at L11643 split compound PNs at "/" into sibling
    rows sharing identical Y coordinates. Positional dedup then merged these siblings, systematically
    dropping the MAIN part number (segment 0) because the sub-part's description was longer
    (due to appended "(sub-part from above)" text). Deterministic on every compound PN with "/".
    Proven on PRJ402119 Item 8: drawing shows "TYD15X3WPW6" (no slash), model fabricated a "/"
    in its output, slash-split created two rows, positional dedup destroyed the main PN.
    Fix: deleted the slash-split block entirely. Companion splitting is handled safely by
    `splitCompanionParts` via the structured `additionalPartNumbers` array. Also plumbed
    positional-dedup merge reporting into all 3 extraction paths.

98. **OPEN** [Backlog] (HIGH) — Foundational extraction accuracy audit (Step Zero instrumentation shipped).
    Raw model output persistence (v1.20.98-99): `rawModelOutput` captured on all extraction paths,
    stored in `extractionReport.perPageOutcomes`. Stage J (`resolveInternalPartNumbers`) now returns
    `{bom, resolvedLog}` persisted as `internalPnResolutions`. Stage R (BC pricing PN substitution)
    logged via `logDebugEntry` to Debug Logs. Stages M/N/O already had `learnedCorrectionsLog`.
    Full attribution chain: raw output → correction log → final BOM. Any discrepancy explained.
    BLOCKED on ground-truth measurement (BC match is circular). Next: Q3 text-layer measurement
    on D2 sample (PRJ402113, 402100, 402101, 402076, 402092).
    Discovered: 2026-06-04 session — #98 evidence pull showed ARC Cross coverage as primary
    differentiator between good/bad extractions.
    H5 RE-TRIAGE (2026-06-16): NOT addressed by H5 — if anything, H5's "100%" claim is exactly what
    #98's measurement framework exists to validate SYSTEMATICALLY. #95 closing on one project's ground
    truth does NOT mean global extraction accuracy is measured/solved — #98 remains the open rigorous-
    measurement question (still BLOCKED on ground-truth measurement). Still OPEN.

99. **OPEN** [Backlog] (HIGH) — Model partial-read on long single-column BOMs.
    PRJ402114 (47-item BOM, single column, single page): model returned ONLY items 26-47.
    rawModelOutput confirms first item = itemNo:"26", stopReason = "end_turn" (not truncation).
    Ruled out: page-scoping (1 BOM page processed, correct), crop-cutoff (full table within crop
    at x=0.47 y=0.03 w=0.51 h=0.81). The model simply stopped reading partway through the table.
    This is a COMPLETENESS failure distinct from ACCURACY (#95). BC match % can be 100% on a BOM
    missing half its rows — the "good bucket" from #98 evidence pull is compromised.
    The re-extraction path lacks L3 retry/gap-fill (initial path only, L13680-13808). This is the
    root cause of differential completeness between initial and re-extraction.
    Discovered: 2026-06-04 — C28 validation + #99 diagnostic.
    H5 RE-TRIAGE (2026-06-16): NOT addressed by H5 — independent root cause. This is a COMPLETENESS
    failure (model stops at end_turn), orthogonal to image fidelity — higher DPI doesn't make the model
    read more rows. Still OPEN (see #100 interim completeness warning).

100. **OPEN** [Backlog] (MEDIUM) — Completeness guarantee: permanent fix requires text-layer row counting.
     Interim shipped (v1.20.100-101): warn-only completeness flag. PART A: extractionVerification
     (was discarded per C15) now captured on re-extract + feedback paths; completenessWarning flag
     computed and stored. PART B: missing-from-END detection added to `_parseAndVerifyBomRaw`.
     UI: ScanResultsBanner wired into BOM table (was dead code since written), completenessWarning
     rendered as top concern with critical orange styling.
     VALIDATED: fires on PRJ402114 (items 1-25 missing), silent on complete BOMs, warn-only framing.
     SCOPE LIMIT: detects missing-from-start + interior gaps. Clean bottom-truncation (1-22 of 47,
     no gap) NOT detectable by continuity — requires text-layer row count (Pillar 1a, gated on Q3).
     Permanent fix: two pillars — (1) independent row-count expectation via text-layer parsing,
     (2) deterministic targeted recovery (L3 on all paths) + loud flag if unclosable.
     Discovered: 2026-06-04 — Coach C29 supplement + Freddy Brief.

101. **OPEN** [Backlog] (HIGH, future milestone) — Estimator's-Eye Cross-Check Workflow — full multi-region
     quoting intelligence. Encodes a 30-year estimator's cross-check process: customer identification
     drives structural fingerprinting, layout/enclosure scan for buildability and high-cost flags,
     schematic scan for wire integrity and cost-tie, then BOM outlier analysis against all three
     region types. Depends on Layout/Enclosure/Schematic regions maturing beyond primal state and
     on near-term extraction-accuracy foundation being solid. NOT current scope — resurface when
     BOM extraction is stable and non-BOM regions are ready to graduate.
     See `ARC-VISION-ESTIMATOR-REVIEW.md`.
     Captured: 2026-06-05, from Jon.
     H5 RE-TRIAGE (2026-06-16): NOT addressed by H5 — different scope (future multi-region milestone).
     H5 strengthens the BOM-extraction foundation #101 depends on, but the milestone itself is untouched.
     Still OPEN.

102. **OPEN** [Backlog] (MEDIUM, Phase 2 ENTRY GATE) — classifyBomInputTier scan/bitmap leak to vector-stroke.
     The classifier checks `q.isMonochrome` but not `q.isScanned`, and uses `imageCount >= 2` for
     bitmap. A non-monochrome (color/grayscale) single-image scan with 0 text chars would leak to
     `vector-stroke` — the one tier that under-warns AND gets voted on in Phase 2. Fix FIRST thing
     in Phase 2 before any voting code: add `q.isScanned` check; change bitmap signal to
     `imageCount >= 1 AND low/zero region chars`. Masked today only because all census scans are
     monochrome and both bitmaps have `imageCount >= 2`. Becomes a live cost/quality bug the moment
     Phase 2 voting exists.
     Discovered: 2026-06-06, Coach C31 verification of Phase 1b (7/8 pass, PRJ402100 scan-vs-bitmap
     was the miss — gate-equivalent but reveals the leak path).

## Required-BOM-Region Feature (shipped sub-phases, 2026-06-04 → 2026-06-09)

103. **RESOLVED** [Verified] — Phase 0a/0b timeout fix (undici override, v1.20.108-area).
     Server-side extraction timeout hardening. Prerequisite for reliable Phase 1 testing.

104. **RESOLVED** [Verified] — Phase 1e 0-byte hardening (v1.20.102).
     Graceful handling of 0-byte PDF uploads. Sets manualVerifyRequired and routes through
     the Phase 1c gate as Case 5.

105. **RESOLVED** [Verified] — Phase 1b input-tier classifier (v1.20.105).
     `classifyBomInputTier` function: text-layer / vector-stroke / bitmap / scan / no-pdf.
     Feeds Phase 1c gate with extraction tier. See #102 for known leak path.
     Verified: Coach C31.

106. **RESOLVED** [Verified] — Phase 1a detection summary (v1.20.106).
     Pre-extraction scan quality detection and user-facing summary in extraction report.
     Shows tier, page quality details, and scan warnings before extraction starts.

107. **RESOLVED** [Verified] — Phase 1c block-with-override gate (v1.20.107).
     `confirmAndExtract` 5-case tier+region gate. Sets `panel._manualVerifyRequired` on
     Cases 4 (vision+no-region) and 5 (no-PDF). Includes arcConfirm modal with proceed/cancel.
     Verified: Coach C37.

## Sales-Path Trust Layer (2026-06-09)

108. **RESOLVED** [Verified] — B2 manualVerifyRequired carry-forward + B1 send-gate (v1.20.108).
     B2: manualVerifyRequired survives both re-extraction paths (reExtractionReport line 24365,
     fbReport line 24591). B1: findIncompleteQuoteItems blocks send across all three surfaces
     (QuoteSendModal, pre-gate banner, inline send) when manualVerifyRequired=true.
     Verified: Coach C40.

109. **RESOLVED** [Verified] — F3 print warning + F2 BC-failure toast (v1.20.109).
     F3: handlePrintQuote warns on verification block (even when fully priced) via arcConfirm
     with "Print Anyway" option. F2: BC pricing failure surfaces toast with unpriced count
     and 12s auto-dismiss.
     Verified: Coach C41.

110. **RESOLVED** [Verified] — F1/C5 noisy-PN guard + Mark-Verified action (v1.20.110).
     F1: bcFuzzyLookup results held as suggestions (not auto-accepted) when manualVerifyRequired
     AND match type is not "exact". Both foreground and background pricing paths.
     C5: applyLearnedCorrections Path 1 (auto-cross alternates) frozen when manualVerifyRequired;
     Paths 2-4 (corrections/library/description) still apply. All 4 call sites thread the flag.
     bcMatchType field stored on rows (exact/fuzzy/fuzzy-normalized/null).
     "Mark Verified" button clears flag with arcConfirm explaining consequences.
     Verified: Coach C42. Completes the unsupervised-Sales safety net.

## Deferred Items (backlog with activation triggers)

111. **RESOLVED** [Verified] — Required-BOM-Region Phase 1d: no-PDF lazy handling.
     Completed via Phase 1c Case 5 (v1.20.107). Case 5 detects no-PDF at extraction time
     via classifyBomInputTier, shows re-upload/region-image modal, sets manualVerifyRequired
     on the image path, cancel returns user to panel. No residual scope — extraction-time
     detection was always the design intent. Verified: Coach C44.

112. **RESOLVED** [Verified] — Required-BOM-Region Phase 1f: per-company structural learning + L3 wire-up.
     v1.20.111. Region learning context now reaches all single-page extraction paths (pdf-native,
     bom-region-crop, image-fallback) on both server and client. Schema extended with contributedBy
     (uid), inputTierClass (pdf/image), columnLayoutType (structural enum). Per-company pooling
     via _appCtx.configPath confirmed — no migration needed. GAP: batch path (extractBomBatch)
     not wired (#118). Verified: Coach C45. PHASE 1 COMPLETE.

113. **CLOSED** — CropBox bitmap latency+accuracy proof.
     Superseded by H5 (#120). CropBox confirmed counterproductive on low-DPI rasters (0 items
     on PRJ402119 scan-tier, see docs/113-CROPBOX-SCAN-PROOF.md). High-DPI region tiling is
     the shipped approach — renders client-side at controlled DPI instead of relying on CropBox.
     Original question (does CropBox help bitmap-tier?) is moot: H5 bypasses CropBox entirely.

114. **CLOSED** — Phase 2 vector-stroke voting + self-test.
     Killed. #113b proved voting is counterproductive on bitmap-tier (59.3% voting < 64.8% best
     single run). H5 (#120) solved the accuracy problem via resolution (100% on both test drawings)
     — voting is unnecessary when the model reads every glyph correctly at high DPI.
     Dependency #113 closed (superseded by H5); #102 remains open but no longer gates this.

## F1/C5 Guard Follow-ups (2026-06-09)

115. **OPEN** [Backlog] — Held-back-cross review UI.
     C5 guard freezes auto-cross alternates but reHeldBack / fbHeldBack / _heldBackAlternates
     are scaffolding only — assigned to variables and console-logged, not surfaced in UI.
     The scope doc (NOISY-PN-GUARD-SCOPE.md) estimated ~30-40 lines for a per-row indicator
     showing "N learned crosses available pending verification." Freeze is fail-safe as-is
     (withholds the risky action), so this is a usability follow-up, not a safety gap.
     Activation: if field testing shows users confused by held-back crosses.
     Discovered: Coach C42 verification (2026-06-09).

116. **OPEN** [Backlog] — "Mark Verified" auto-re-price question.
     After clicking "Mark Verified", manualVerifyRequired clears but held-back fuzzy matches
     remain unpriced (red) and auto-cross alternates remain unapplied. User must manually
     click "Get New Pricing" or navigate away and back. By design (scope doc note #3), but
     revisit if users find the manual re-price step confusing. Options: auto-trigger pricing
     after Mark Verified, or show a toast prompting re-price.
     Activation: if user testing surfaces confusion.
     Discovered: Coach C42 verification (2026-06-09).

## Quote & Pricing Issues (2026-06-09)

117. **RESOLVED** [Verified] — Payment Terms / Shipping Method missing from quote (intermittent).
     Root cause (superseded C46, confirmed C61): `_bcToken` null silently gates the BC fetch
     inside `ensureQuoteFieldsPopulated`. Azure AD access tokens expire ~60-75 min; token expiry
     → fetch skipped → terms blank → "---" on printed/sent quote. QuoteTab (Path B) is entirely
     unreachable (all setView("quote") paired with autoPrint, height:0 wrap). Path C
     (QuoteSendModal.handleSend) found reachable with no populate.
     Phase 1 (v1.20.115): unified populate into `ensureQuoteFieldsPopulated`, awaited saves,
     #86 guard verified (aggregated never persisted), bcSalespersonCode via unrestricted path.
     Phase 2 (v1.20.116, +51/-2): Fix 3 (bc-unavailable + missing-required-terms warnings in
     shared function), Fix 3c (Path C populate + persist + hard-block in QuoteSendModal),
     Fix 4 (print: unchecked checklist entries; send: arcAlert block). Finding-1 fix
     ({...populated} post-send save). Finding-2 resolved as option (b) — send blocks on MISSING
     terms only, proceeds when fully populated with BC offline.
     Verification: test-1 no-regression confirmed LIVE; terms populate correctly on real quote
     data (user-facing symptom confirmed resolved). Failure-mode cases (2/3/6/9) logic-confirmed
     per Coach C62/C64 matrix — live fixture testing retired by decision (BC can't be toggled
     off, token expiry can't be forced). Full live confirmation of warning/block plumbing
     deferred to ARC Usage Telemetry item.
     Investigation: Coach C46 (initial), C57 (re-confirmation), C58 (plan), C59 (amendment),
     C60 (Phase 1 review), C61 (unreachability + true root cause), C62 (Phase 2 plan),
     C64 (Phase 2 verification). Discovered: 2026-06-09 (user report).

## Phase 1f Follow-ups (2026-06-09)

118. **OPEN** [Backlog] — Batch extraction path missing region learning context.
     `extractBomBatch` (Cloud Function) and `extractBomBatchViaServer` (client) do not send
     or splice regionLearningParts. Same pattern as extractBomPage — destructure, splice before
     content parts. Low priority: batch is pdf-native only (vector text, lower benefit from
     region learning), and batch failures fall back to per-page extractBomPage which HAS it.
     Activation: next extraction reliability pass.
     Discovered: Coach C45 verification (2026-06-09).

## Silent Zero-BOM (2026-06-09)

119. **OPEN** [Discovery] — Legacy panels invisible to Phase 1 safety systems.
     SYSTEMIC: every Phase 1 safety mechanism (ZeroBomBanner, amber chip, send gate, completeness
     warning) is gated on `panel.extractionReport` existing. Projects extracted before v1.19.598
     have no extractionReport — all safety systems silently return null/undefined. PRJ402119
     is the poster child: 0 BOM items, regioned, legible, zero warnings.
     Root cause chain: (1) extracted pre-v1.19.598 → hit C23 dataUrl gating bug → 0 items,
     (2) no extractionReport saved (didn't exist yet), (3) ZeroBomBanner `if(!r)return null`,
     (4) amber chip `panel.extractionReport?.manualVerifyRequired` → undefined.
     Secondary finding: re-extract paths (runExtraction, reExtractWithFeedback) bypass 1c gate.
     Fix scope: (1) legacy ZeroBomBanner fallback ~8 lines, (2) 1c gate on re-extract ~5 lines,
     (3) optional on-load backfill ~10 lines. Fix 1 is minimum viable.
     Investigation: Coach C47 (2026-06-09).

## Extraction Accuracy — High-DPI Rendering (2026-06-09)

120. **RESOLVED** [Verified] — H5: Region-targeted high-DPI rendering for vision-mode BOM pages.
     Shipped v1.20.112 + v1.20.113 (commit 6ea797e4). Model: Claude Opus 4.8 (2576 px ceiling).
     Client-side pdf.js renders BOM region at high DPI as JPEG tiles, sent to API as image blocks.
     Tier gate: `classifyBomInputTier` — text-layer keeps PDF-native, vision tiers use H5 tiles.
     Results: PRJ402101 54/54 = 100% (up from ~36-65% baseline), PRJ402119 14/14 = 100% (up from
     36-50% baseline). Effective DPI ~440 (94%-of-page auto-region) to ~1079 (tight user-drawn
     region), both well above 300 DPI quality threshold. All three Jon-verified anchor PNs resolved.
     v1.20.113 converted 6 Opus call sites from `thinking:{type:"enabled",budget_tokens}` to
     `thinking:{type:"adaptive"}` — required for Opus 4.8 compatibility.
     Does NOT fix: Pattern C (BC data contamination), D (wrong-row reads), F (qty errors).
     Supersedes #113 (CropBox doesn't raise DPI; H5 renders directly).
     Verified: Coach C51 (H5 verification, 2026-06-10), Coach PRJ402119 generalization test.
     Scoping: Coach C48 (proof) + C49 (plan) (2026-06-09).

## H5 Close-Out Findings (2026-06-10 → 2026-06-15)

121. **RESOLVED** [Verified] — `afcfb98b` (v1.20.114, deployed 2026-06-15) — Region edge-padding
     to prevent edge-row clipping. H5 renders the resolved BOM region at high DPI; an over-tight
     user-drawn region silently clips its edge rows (Marc hit this on PRJ402119 — bottom rows cut
     until hand-padded). Fix in `renderBomRegionHighDpi`: before computing render dimensions, pad
     the region on each edge by `max(region_dim * H5_REGION_PAD_FRAC, floor)`, where the floor is
     `H5_REGION_PAD_FLOOR_PTS` converted to a page-fraction via baseVp.width/height; the result is
     asymmetrically clamped to page bounds [0,1] (a region at a page edge pads only inward).
     The absolute FLOOR is the load-bearing term (Freddy analyst review, Coach C54): a clipped row
     is a FIXED height (~one BOM row), so the proportional term alone is weakest on exactly the
     tight regions that clip — on PRJ402119 the proportional-only pad was 2.3pt (a quarter-row),
     insufficient. `H5_REGION_PAD_FLOOR_PTS = 14` (~one BOM row in PDF points); `H5_REGION_PAD_FRAC
     = 0.02` stays as a ceiling for very large regions. Verified by the headless harness re-run
     (Coach C56, tests/extraction-baseline/h5-headless.js): PRJ402119 page 3 → 13/13 rows, 14/14
     PNs exact-match to C52 ground truth, zero phantom rows, ~906 DPI; Y-axis region grew 23.8%
     with no title-block / revision-table bleed. Vertical-pad pollution remains a watch-item — #124.
     Supersedes the bare "region tightly" wording in Phase 1c — guidance is "tight AND complete."
     Discovered: Coach PRJ402119 generalization test (2026-06-10). Implemented: Marc (2026-06-15).

122. **RESOLVED** [Record correction] — #113 ground-truth items 1-2 wrong in answer key.
     #113's answer key (from 95-ITEM8-TRACE-RESULTS.md) listed item 1 as SCE-1413PCW and
     item 2 as SCE-14P13AL. Both are wrong — correct PNs are SCE-1412PCW / SCE-14P12AL,
     confirmed at 2400 DPI by Coach independent reading and consistent with both H5 extraction
     runs. The "12" vs "13" ambiguity is a font rendering issue at low DPI (the vector "2" and
     "3" are near-identical in this drawing's font). H5 read them correctly; the human-verified
     key was wrong. PRJ402119 baseline scoring in #113 is unaffected (both items were wrong
     regardless), but the corrected key must be used for any future regression testing.
     Discovered: Coach PRJ402119 ground-truth exercise (2026-06-10).

123. **RESOLVED** [Record correction] — PRJ402119 is vector content, not a raster fax-scan.
     #113 characterized PRJ402119 page 3 as "168 DPI monochrome fax-scan." This was incorrect.
     The page contains 15,307 vector drawing paths with BOM text rendered as vector outlines,
     plus 1 small embedded monochrome image (1425×472 — the company logo only). The "168 DPI
     fax" label came from assessPdfPageQuality detecting the embedded monochrome image and
     misclassifying the entire page. classifyBomInputTier correctly returns 'vector-stroke'.
     This corrects the record: the "scans are floor-limited by source quality" conclusion from
     #113 was based on a misclassified page. The 36→100% accuracy delta on PRJ402119 was
     entirely send-resolution (same class of fix as PRJ402101), not a scan quality ceiling.
     Discovered: Coach PRJ402119 generalization test (2026-06-10).

124. **OPEN** [Watch-item] — H5 vertical-pad pollution risk (from #121). The #121 Y-axis pad that
     recovers a clipped bottom row can also reach a title block, revision table, or a second
     parts list below the BOM and inject phantom rows. One clean datapoint: PRJ402119 page 3 grew
     Y 23.8% under the 14pt floor and did NOT reach the title block / revision table (Coach C56).
     NOT yet stress-tested against a drawing with a deliberately tight neighbor directly below the
     BOM. Do NOT mark verified-clean — it's one geometry, not a stress test. Retire when a
     tight-neighbor drawing confirms clean, or sooner if one surfaces clean in production.
     Mitigation in place: floor kept to ~1 row (not 2) to limit reach; phantom injection is
     visible at review whereas the clip it fixes is silent (accepted trade).
     Raised: Freddy analyst review (Q3), 2026-06-15.

## BC Token Refresh (2026-06-15)

125. **RESOLVED** [Shipped, v1.20.117] — T-bcTokenRefresh: proactive `acquireBcToken(false)` in `ensureQuoteFieldsPopulated`.
     Add `if(!_bcToken) try{await acquireBcToken(false);}catch(e){}` atop `ensureQuoteFieldsPopulated`
     (before the `needsBcFetch` gate at line 7619). Matches the `verifyBcLineCount` (line 36278) and
     `bcFetchCompanyInfo` (line 4284) pattern. Eliminates ~90% of Phase 2 `bc-unavailable` warnings
     — Azure AD access tokens expire ~60-75 min but MSAL `acquireTokenSilent` can silently refresh
     via the cached refresh token (90-day, sessionStorage). Without this, the Phase 2 warning fires
     ~hourly for users with long sessions. ~1 line. HIGH priority — IMMEDIATE next item after #117.
     Coach confirmation: C65 (4 points verified). Discovered: Coach C62 TTL finding (2026-06-15).

## BC Item Browser Fixes (2026-06-15)

126. **RESOLVED** [Partial, v1.20.118] — BC Item Browser BOM preview regression.
     Root cause (C66): two bugs — (1) `parseInt(itemNo)||0` fallback placed band at table top
     for all empty/non-numeric itemNo, (2) page buttons used tile-relative stored coords.
     Fix shipped v1.20.118: Haiku prompt now locates the specific part by PN string, page
     buttons always call locateInDrawing. Residual placement accuracy (~1 row off for some
     parts) is the inherent ceiling of Haiku-locating on a downsized preview image — NOT being
     patched further per Jon's decision. Residual addressed by #128 (region render).
     Discovered: 2026-06-15. Resolved: 2026-06-15.

127. **OPEN** [Backlog] — Redundant progress bar above the first Line Item during extraction.
     A duplicate of the in-line extraction progress bar appears above the first BOM item.
     Confirm redundancy (same data source, same progress), then remove the duplicate.
     Discovered: 2026-06-15 (user report).

128. **TABLED** [v1.20.120 shipped, band still mispositioned] — BC Item Browser BOM region render preview.
     #128 TABLED v1.20.120. Region render + ny=1 hot path + spinner-race fix shipped and STAY.
     Band placement is wrong but INTERMITTENT — not a fixed offset, not the same miss every time.
     The inconsistency is the key signal: it argues AGAINST a deterministic coordinate-math error
     and TOWARD something stateful/conditional — candidates: a render/coord-resolve race (a spinner-
     race was already found on this surface), branch divergence (ny=1 instant vs ny>1/Haiku fallback
     taking different paths for the same lookup), or stale state between lookups. RESUME STEP: do NOT
     theorize a fix first — instrument and CHARACTERIZE when the band is right vs wrong (which parts,
     which path, repeatable on the same part or varying across attempts) before any change.
     Test parts: 1SFL547002R1311 / 1SDA102947R1 / 8106235.
     **What shipped and STAYS (real value, not reverted):**
     - itemNum=0 collapse fix + tile-relative page-button fix (#126, v1.20.118)
     - ny=1 zero-Haiku hot path + getExtractionUnits cropBounds fix (forward coord fix)
     - Spinner-race fix (v1.20.120)
     Preview is improved vs. original broken state — accuracy residual is what's tabled.
     History: C66 root cause, C67 feasibility, C68 detailed plan.
     Discovered: 2026-06-15. Shipped: v1.20.120. Tabled: 2026-06-15.

## ARC Usage Telemetry (2026-06-15)

129. **OPEN** [Tabled, needs Brief] — ARC Usage Telemetry. Three event types: extraction,
     quote-generation, BC-populate. Append-only Firestore collection (`arcUsage`) via a shared
     `logEvent` helper. Report modal with date-range aggregates + per-user breakdown.
     Absorbs #117 live-confirmation (retroactively confirms Phase 2 warning/block firing in
     production) and quantifies token-null frequency. DISTINCT from TRAQS (Max/Treysen's
     product) — NOT wired to ccdHook. Needs a Brief when it activates.
     Activation: after #128.
     Discovered: 2026-06-15.

## Cleanup & Hardening Candidates (2026-06-15)

130. **OPEN** [Backlog, LOW] — Dead code cleanup: `quoteSendModal` state (line 35309, never set to
     non-null) + inline send handler `_doInlineQuoteSend` (lines 37054-37135, unreachable) +
     dead QuoteTab interactive surface (behind autoPrint height:0 wrap). ~80 lines removable.
     Discovered: Coach C61 (2026-06-15).
     **#133 forward-note (2026-06-16):** If the ProjectView inline send modal is ever
     revived, it should inherit the "Include Quoted BOM" toggle (#133 Change 4a) to match
     QuoteSendModal. The toggle was deliberately NOT added during #133 (Change 4b dropped)
     since the modal is unreachable — see #133 / Coach C73.

131. **OPEN** [Backlog, optional] — Criterion-6 multi-panel hardening. Pre-print checklist
     criterion 6 (quote-field population) currently covers single-panel projects. Multi-panel
     projects with mixed BC/non-BC panels are untested. Harden if multi-panel quoting becomes
     active. Activation: when a multi-panel project hits the quote flow in production.

132. **OPEN** [Deferred] — Post-extraction Engineering Questions suppression (render-gate).
     Engineering Questions that surface after extraction completes are to be SUPPRESSED (UI
     hidden via render gate), NOT deleted — underlying logic stays in place for future
     re-integration. Before implementing: capture trigger conditions, render location, and
     what downstream processes consume the answers. See Coach C63 for full intent log.
     Activation: when Jon schedules with Marc.
     Logged: Coach C63 (2026-06-15).

## Send Traveler BOM to Customer (2026-06-15)

133. **RESOLVED** [Shipped, v1.20.122] — Send Traveler BOM to Customer (shipped customer-facing as "Send Quoted BOM" — renamed per C73).
     Deliver the EXISTING Matrix-generated traveler BOM (the production document with the
     cross column showing BOM differences) to the customer for review/approval before PO.
     NOT a new document — the exact same traveler BOM already generated. BOM only, NOT the
     schematic.
     **Two delivery modes:**
     1. STANDALONE — a separate send action, BOM-only, independent of any quote.
     2. BUNDLED — an option in the Send Quote flow to include the traveler BOM as an
        attachment alongside the quote PDF in one send.
     **Reuses:** existing traveler BOM render + Send Quote send path (Path C, #117).
     **New work:** standalone send trigger + include-toggle in the Send Quote modal.
     **Open scoping (Brief time):**
     - Bundled-mode toggle default: on or off?
     - Whether both modes inherit #117's populate/loud-on-failure guardrails (both email
       a customer — they should).
     - Any record that the approval email went out vs. send-and-reply.
     **Priority:** ELEVATED — gates PO acceptance, customer-facing. Above #127/#129.
     Discovered: 2026-06-15.
     **RESOLVED (2026-06-16):** Shipped standalone + bundled send (Changes 0,1,2,3,4a; 4b
     dropped — targets the dead ProjectView inline modal #130). Customer-facing name renamed
     "Traveler BOM" → "Quoted BOM" (C73). v1.20.122, commit 2c53008b. Verified live on a
     rendered doc (Jon). #130 carries the forward-note to inherit the "Include Quoted BOM"
     toggle if that inline modal is ever revived (confirmed present).
     **Follow-ups (post-RESOLVED):** double-send guard + separated save try/catch on the
     standalone path (v1.20.121, a0906442/0cb3fe1a); rename to "Quoted BOM" (v1.20.122);
     yellow-highlight explainer line added to the Quoted BOM email body — standalone always,
     bundled only when the toggle is ON (v1.20.126, commit 47b7f715).

## Part # confidence dots — what are they? (2026-06-16)

134. **RESOLVED** [Answered — investigation, no code change] — Yellow circles next to Part #s.
     The dots are AI extraction CONFIDENCE indicators, shipped v1.20.15 (2026-05-22) under #49
     (scanned-PDF quality detection). Per-row:
     - Amber (#f59e0b) = medium confidence — ≥1 confusable glyph (S/5, B/8, O/0).
     - Red (#ef4444) = low confidence — multiple doubtful / faded / clipped chars.
     - No dot = high confidence.
     Clear on edit: editing the PN field resets confidence to high and removes the dot
     (`app.jsx:25455`) — the edit IS the verification.
     Distinct from the trust-layer `manualVerifyRequired` panel flag (#103–#112): these dots
     are advisory per-row; that flag is the hard panel-level gate.
     Source: Coach C70. Freddy's trust-layer lead ruled out.
     Logged: 2026-06-16.

## Cover-page BOM table enhancements (2026-06-16)

135. **RESOLVED** [Shipped, v1.20.124] — Yellow highlight on crossed-row PN cells in cover-page BOM table.
     Fill Part # and Original Part # cells with yellow on crossed rows so substitutions are
     scannable at a glance. Shared between production traveler and Quoted BOM (both use
     buildCoverPage). Additive to existing bold/italic styling. Analysis: Coach C75.
     Logged: 2026-06-16.
     **RESOLVED (2026-06-16):** Two PN cells — Part # (always) + Original Part # (only when a
     real differing original) — filled yellow [255,243,176] on crossed rows via the existing
     didParseCell hook; additive to bold/italic. Shared (both docs). v1.20.124, commit 7bb7a608.
     Verified live (Jon).

136. **RESOLVED** [Shipped, v1.20.124] — Hide Supplier column in customer-facing Quoted BOM.
     Production traveler keeps Supplier (shop needs it); customer Quoted BOM drops it via
     `opts.hideSupplierColumn` (same opts decoupling as C73 title rename). Analysis: Coach C75.
     Logged: 2026-06-16.
     **RESOLVED (2026-06-16):** Supplier column dropped from the customer Quoted BOM via
     `opts.hideSupplierColumn` (set only by generateTravelerBomPdf); production traveler keeps it
     byte-for-byte. R2 — `tableWidth:"wrap"`, no column redistribution (gap closes on right).
     v1.20.124, commit 7bb7a608. Verified live (Jon).

## Customer Portal — Quoted BOM Approval Workflow (2026-06-16)

137. **APPROVED — ready to build (two-phase; do NOT start yet)** [Coach C89 / docs/137-SUPPLEMENT.md] — Customer Portal: digital Quoted BOM approval with
     change-request workflow. When the customer portal is built, Quoted BOM approvals (#133)
     route through it instead of email-only. Customers can review the BOM digitally, enter
     any items they wish to change or substitute, and submit changes back to ARC. Matrix
     engineers review and approve/reject the requested changes, then update the quote
     accordingly. Replaces the current out-of-band email approval loop with a structured
     digital workflow — faster turnaround, auditable change trail, no ambiguity about what
     the customer approved vs. requested to change. Builds on the `bomApprovalRequests[]`
     D3 record (#133) as the persistence layer; the `status:"sent"` field becomes a state
     machine (sent → reviewed → approved/changed). Prerequisite: customer portal
     infrastructure (no portal exists today — Brief §2/§8).
     APPROVED 2026-06-16 (Coach C89 / docs/137-SUPPLEMENT.md is the spec). Build is two-phase
     WITHIN this ticket; logged approved-and-ready — do NOT start building yet.
     Gating resolved: `generateTravelerBomPdf` is 100% client-side (jsPDF → base64 → Graph email
     attachment) — there is NO Firebase Storage URL for the BOM doc, and the portal is
     RESPONSE-ONLY (serves no document). Zero IP-leak risk.
     PHASE 1 (security-first): `bomApprovals/{token}` Firestore rules (all 8 security reqs); token
     creation at send (standalone + bundled); portal link in the email body; `BomApprovalPortalPage`
     (response-only); Root URL-param detection.
     PHASE 2: `onBomApprovalResponse` CF trigger; append-only write-back into `bomApprovalRequests[]`;
     bell notification (type `bom_approval`) + deep-link; QUOTE SUMMARY section; Revoke Link action;
     quote-rev stale-approval warning.
     REFINEMENT (fold into Phase 2 surfacing): handle the "expired-unanswered" state explicitly — if a
     token's 14-day `expiresAt` passes with no customer response, QUOTE SUMMARY must show it as a
     distinct "expired, unanswered" state (prompting re-send), NOT let the request go silent/invisible.
     Token-only access, hardened per all 8 security requirements. Diff-gated (customer-facing + IP exposure).
     Logged: 2026-06-16.

## Cover-page data box: Dv.# + Qv.# split (2026-06-16)

138. **RESOLVED** [Shipped, v1.20.123] — Split "REV" data box into Dv.# (Drawing Version) + Qv.# (Quote Version).
     Replace the single REV box in the cover-page info grid with two half-width boxes showing
     `panel.bomVersion` (Dv.#) and `project.quoteRev` (Qv.#, via opts). Customer drawing rev
     stays in the title block (line 7877) — NOT lost. Shared between production traveler and
     Quoted BOM (no decoupling). ~20 new lines. Analysis: Coach C76.
     Logged: 2026-06-16.
     **RESOLVED (2026-06-16):** REV box split into Dv.# (`panel.bomVersion`) | Qv.#
     (`project.quoteRev` via `opts.quoteRev` from both callers). Customer drawing rev stays in
     the title block. Shared (both docs). Code-path C77. v1.20.123, commit 5c776a49. RENDER
     verified live (Jon).
     **Scope note — does NOT close the Dv.# data issue:** the RENDER is resolved; the Dv.#
     DATA seed-gap is NOT. A panel with no qualifying BOM change since the bomVersion feature
     (v1.19.743) has no `bomVersion` and renders "—" (correct graceful fallback). Tracked
     separately as **#139** (PRJ402096 panel 3) — now RESOLVED (seed fix shipped v1.20.125).

## bomVersion seed gap — legacy / never-bumped panels (2026-06-16)

139. **RESOLVED** [Verified] — Dv.# renders "—" on panels missing `bomVersion`.
     Shipped v1.20.125 (commit cfe81579). Fix: Option C — expanded seed condition in
     `_bumpBomVersionIfChanged` (app.jsx:8665), removed `oldCount===0` gate so legacy panels
     (rows but no `bomVersion`, populated pre-v1.19.743) are seeded to v.1 on next save.
     `saveProject` all-panel loop heals non-edited panels organically. Bump path untouched.
     Stale comment at line 9148 revised to document reversed behavior.
     Live-verified: PRJ402096 panel-3 seeded to bomVersion:1 after save, Dv.# now shows "1".
     Analysis: Coach C78. Plan: Coach C79. Verification: Coach C80.
     Forward-ref from: #138. Tie-in: #119. Logged: 2026-06-16.

140. **OPEN** [Watch] — WATCH (post-#139): first-extraction bomVersion seed reliability.
     PRJ402096's 3 panels were extracted same-batch (~1 wk ago, post-v1.19.743) yet panel-3
     was NOT seeded at first extraction while panels 1 & 2 were. #139 self-heals this on
     save, but does NOT explain why first extraction skipped panel-3 in a multi-panel batch.
     **Action:** On the next multi-DRAWING project extraction, verify EVERY panel gets
     `bomVersion` seeded at first extraction. If any panel is skipped, THAT is the live case
     to trace the batch seed path (active-panel-only seeding? oldCount!==0 at seed-check
     from placeholder rows? persist/async gap?). #139 masks the symptom via self-heal; this
     watch confirms whether first-extraction reliability has a real gap.
     Priority: low. Tie-in: #119 (legacy-panel class). Logged: 2026-06-16.

141. **RESOLVED** [Shipped, v1.20.130] — Relocate confidence dots + add "C" glyph on BOM rows.
     Shipped v1.20.130 (commit e4d287a1), supersedes wrong-element build v1.20.127.
     Moved per-row AI confidence dot (amber=medium, red=low) into the `_bc` column as a 24×24
     circle matching the blue "BC" circle exactly. Centered "C" letter, color carries severity.
     Column widened 32→56px, right-justified (flex-end) so BC stays at its original position.
     `flexShrink:0` keeps circles round under the 52px-in-56px exact fit.
     Indicators remain independent (confidence clears on PN edit per #134; BC clears on
     pricing/BC browser match). Placement + glyph only, no logic change.
     Chain: C81 (initial analysis) → C82 (wrong element) → C84 (re-spec to blue circle) →
     C85 (code-path verify) → C86 (right-anchor fix). Live-verified by Jon.
     Logged: 2026-06-16.

## Red "+BC" pill redundancy review (2026-06-16)

142. **TABLED** [Investigation — Coach] — Red "+BC" pill possible redundancy review.
     The BOM row has three BC-related indicators: the red "+BC" pill, the amber "?BC" pill, and
     a separate blue "BC" circle (blue = item not in BC, needs adding). Jon suspects the red
     "+BC" pill may be redundant with another indicator and wants it reviewed for possible
     removal. TABLED — not active.
     **When picked up (owner: Coach — read-only analysis):**
     - Map the exact trigger condition for each of the three indicators (+BC / ?BC / blue-BC).
     - Determine whether "+BC" genuinely DUPLICATES another indicator's meaning (redundant) or
       covers a DISTINCT state (complementary — e.g. "+BC = in BC" vs "blue = not in BC" would
       be opposite states, NOT redundant).
     - Do NOT remove anything until the audit proves duplication.
     **Interaction flag — couples with #141:** #141 placed the confidence "C" pill next to the
     blue BC circle. If "+BC" is later removed, the row's indicator layout changes, so #141's
     "C" placement must be re-checked against the changed row.
     Logged: 2026-06-16.

## Account provisioning + boot resilience (2026-06-16, from RYAN spin-trap incident)

Origin: ryan@matrixpci.com hit an eternal "Loading Projects" spinner on home load.
Root cause (confirmed live + via code/rules): his `users/{uid}/config/profile` carried
`{companyId, role:"edit"}` but he had NO `companies/{cid}/members/{uid}` member doc, so the
boot-time projects read was permission-denied. Resolved for Ryan via the legitimate invite
link → `acceptTeamInvite` (member doc created before load). The incident exposed three
durable defects below. See `tools/reset-user.js` (committed) for a dry-run-gated single-user
reset that surfaced the ground-truth state.

143. **RESOLVED** [Shipped v1.20.131, commit b361d20e — verified] — Boot fragility: un-try/caught
     company-scoped reads hang the home load forever. In the app boot IIFE, `loadProjects`
     (`app.jsx:9209` reads `_appCtx.projectsPath`; called un-guarded at `:45681`) and the
     config `Promise.all` (`:45657`) have NO try/catch. Any permission-denied on a
     company-scoped read at boot → `setLoading(false)` (`:45682`) never runs → permanent
     spinner, with NO error surfaced, NO fallback, and NO debug-log trace (the debugLogs
     create rule itself requires `isMember()` — `firestore.rules:432` — so a non-member's
     failure can't even be logged). This is WHY a misprovisioned account bricks instead of
     degrading. Proposed fix (needs a Brief before build): wrap the boot reads, always clear
     the loading flag, and branch on error code — `permission-denied` → "No access to this
     workspace, contact your admin" modal; anything else → "Couldn't load projects" + Retry.
     Owner: Marc (do NOT route to Coach as active work — his diagnostic role here is done).
     RESOLUTION (v1.20.131, commit b361d20e, 2026-06-16): Extracted the boot IIFE into a named,
     re-entrant-safe `runBoot(user)` — tears down the member onSnapshot (`window._arcPermsUnsub`)
     before re-subscribing and resets state so retries run clean. Wrapped in try/catch:
     `setLoading(false)` on every terminal path; `console.error("[ARC boot]", code, msg)`;
     two-branch INLINE surface in Dashboard (Q5, no modal) — `permission-denied` → "contact
     administrator" (no Retry) vs. everything else → "Couldn't load projects" + Retry. Transient
     codes auto-retry ≤2× (2s apart) before surfacing; manual Retry resets the auto-retry budget.
     VERIFIED (live): happy path (v1.20.131 boots, all projects load, no hang), deployed-bundle
     markers present, `permission-denied` discriminator confirmed via a harmless denied read,
     bounded-retry / no-hang by design. The two error-RENDER branches are INSPECTION-confirmed —
     driving the UI live would require re-orphaning an account (explicitly disallowed), and
     inspection is the authorized fallback.
     NOTE 1 (keep): the offline toggle does NOT trigger the transient branch — Firestore offline
     persistence serves cache, so `loadProjects` returns cached/empty rather than throwing.
     Routine connectivity blips degrade gracefully (cached projects). The transient branch is for
     HARD backend failures only (resource-exhausted / deadline-exceeded / unavailable-without-cache).
     NOTE 2 (known minor, NOT fixing): the `setTimeout(()=>runBoot(user),2000)` retry timer isn't
     cancelled if `user.uid` changes mid-retry (sign-out + back in within the 2s window). Not a
     regression (pre-existing IIFE pattern); the `_arcPermsUnsub` teardown at the top of `runBoot`
     prevents stacked listeners. Trivial future cleanup, not a blocker.
     Logged: 2026-06-16. Resolved: 2026-06-16 (v1.20.131).

144. **RESOLVED** [Shipped 2026-06-16 — functions deploy, commit pending below] — `removeTeamMember` orphans the user profile.
     `removeTeamMember` (`functions/index.js:531`) deletes `companies/{cid}/members/{targetUid}`
     but never clears `users/{targetUid}/config/profile`. The profile retains `{companyId, role}`,
     so on the user's next login the app scopes them to a company they're no longer a member of
     → boot-time permission-denied → the #143 spin trap. Confirmed live by Ryan's history
     (member doc absent, profile intact with invite-derived `role:"edit"`; `acceptTeamInvite`
     is atomic so the orphan can only arise from a post-accept member-doc deletion). Candidate
     fix: in `removeTeamMember`, also delete `users/{uid}/config/profile` (or null its
     `companyId`/`role`). Pairs with #143 — fixing #143 makes the symptom graceful; fixing #144
     prevents the orphan state in the first place.
     RESOLUTION (2026-06-16, functions deploy — Coach C88 / supplement Q2 Option B): `removeTeamMember`
     now runs an ATOMIC batch — `batch.delete(members/{targetUid})` + `batch.set(users/{targetUid}/
     config/profile, {companyId: FieldValue.delete(), role: FieldValue.delete()}, {merge:true})` +
     `batch.commit()`. Both ops commit or both roll back (no window that re-creates the orphan).
     `set({merge:true})`+`FieldValue.delete()` (not `update()`, which would NOT_FOUND on a missing
     profile and roll back the member delete). Preserves `firstName`; caller contract unchanged
     (`{success:true}`). Re-invite from clean state works (`acceptTeamInvite` is atomic + merge —
     #144 supplement Q3). Boot self-heal deliberately NOT added (held as a future ticket #147, not
     #145). Verified safe across all 11 profile read sites (supplement Q1 — every consumer uses
     `profile?.companyId` or an `if(companyId)` gate, so a cleared companyId falls to the personal path).
     AUDIT: `tools/audit-orphans.js` (read-only, committed) ran pre-deploy → 0 existing orphans
     (6 profiles scanned, 5 with companyId, none missing a member doc). RYAN was the only one and
     was already recovered — no cleanup sweep needed. Script retained as an admin shelf tool.
     Logged: 2026-06-16. Resolved: 2026-06-16 (functions deploy).

145. **RESOLVED** [Verified 2026-06-16 — account reactivation, no code change] — SendGrid API key rejected (401). Pulled
     `sendInviteEmail` logs: at 2026-06-16T20:29:34Z the function was reached (callable auth
     VALID, `SENDGRID_KEY` present so the `:594` guard passed), called `sgMail.send()` (`:596`),
     and SendGrid returned **HTTP 401 Unauthorized** → function threw → status 500. The
     configured `SENDGRID_API_KEY` is present but invalid/revoked/expired. SCOPE: every email
     path shares this one key (`functions/index.js:43`) — invites (`:596`), supplier-quote
     notifications (`:226`), engineer questions (`:918`), review emails, issue reports (`:882`),
     BC attachments (`:2916`). So ALL transactional email is currently failing, not just invites.
     Candidate fix: rotate the SendGrid key and re-set `SENDGRID_API_KEY` in `functions/.env`
     (+ verify the `sales@matrixpci.com` sender is still authenticated in SendGrid), redeploy
     functions. Workaround used for Ryan: hand-delivered the `?join=` invite link (works without
     email since the invite doc carries the token).
     RESOLUTION (2026-06-16): SendGrid account reactivated (Essentials 50K paid). The
     existing "MatrixARC" key was unchanged and authenticates again — the 401 was purely
     the expired-account state, not a bad key. Confirmed read-only: `GET /v3/scopes` → 200,
     sender `sales@matrixpci.com` verified. Live end-to-end: deployed `sendInviteEmail` →
     `{success:true}` (status 200, was 500/401); SendGrid Email Activity shows the test
     message to jon@matrixpci.com `status:"delivered"` (opened + clicked), 0 bounces/blocks.
     NO key change, NO redeploy required. All other email paths share the same key so they
     recover too.
     Logged: 2026-06-16.

## Confidence "C" indicator over-firing (2026-06-16)

146. **RESOLVED** [Shipped v1.20.132, commit 86521d03 — verified] — Confidence "C" circles render on nearly every BOM
     line despite extraction now running ~100% accuracy (post-H5 / 600-DPI). The indicator has
     lost its signal value — if it flags everything, it flags nothing (trust-signal noise). Two
     candidate root causes to distinguish BEFORE any fix:
     (a) DISPLAY/THRESHOLD — circles render regardless of confidence, or the threshold is mis-set;
         the "C" should only surface on lines below some confidence bar.
     (b) SCORE CALIBRATION — the confidence algorithm assigns low scores to lines that now extract
         correctly; the scores didn't keep pace with the accuracy gains.
     FIRST STEP (owner: Coach, read-only): read the circle render condition + how the confidence
     value is computed/sourced, to determine (a) vs (b) before any fix is designed. Relates to
     #134 (confidence dots = AI extraction confidence — amber=medium, red=low; clears on PN edit)
     and #141 (the "C" pill relocated next to the blue BC circle).
     Priority MEDIUM — trust-signal noise, not a blocker. Brief being drafted by Freddy.
     RESOLUTION (v1.20.132, commit 86521d03 — Coach C90 + follow-up Q1/Q2): Determination was (a)
     display/threshold — the v1.19.975 post-extraction confusable-glyph regex (`/[S0O8BIZG6...]/i`,
     matched 20/36 alphanumerics) downgraded ~100% of real PNs from the model's "high" → "medium",
     drowning the signal. Replaced with a 3-signal confidence ladder:
       1. EXACT BC match (priceSource:"bc" + bcMatchType:"exact") → "high", authoritative (applied at
          BOTH pricing paths — `runPricingBackground` :14898/:14901 + foreground PanelCard :26376/:26379;
          verified no third BC-apply site). Fuzzy BC deliberately NOT promoted.
       2. pdf-native (genuine text layer) → "high" ONLY when the model didn't itself flag low/medium
          (text-layer clears glyph-uncertainty but does not steamroll genuine model doubt).
       3. vision path ("hi-dpi-tiles" etc.) → trust the model's own high/medium/low.
       4. confusable-glyph + enclosure regex auto-downgrade REMOVED.
     Display-layer only — NO send-gate interaction (the "C" circle is cosmetic; `manualVerifyRequired`
     is the gate — Coach confirmed they don't read each other). Untouched: render condition :28055,
     manual-edit + applyLearnedCorrections restore paths, no field renames.
     VERIFIED (before/after circle-rate reconstruction, 529 rows / 7 recent projects): aggregate
     52% → 10%. Meaningful minority tracking genuine model doubt across all paths — vision (Proctors
     19%), text-layer (Salares 16%, Springfield 50% = model flagged half that small BOM, real signal),
     cleared on exact-BC ground truth + confidently-read text-layer. Not vanish-to-zero, not fires-on-
     everything. #149 (existing-project exact-BC backfill) is now UNBLOCKED — it was gated on this deploy.
     Logged: 2026-06-16. Resolved: 2026-06-16 (v1.20.132).

## reviewUploads permanent Storage-URL exposure (2026-06-16)

148. **OPEN** [LOW — latent flaw on an unfinished feature, no live exposure] — `reviewUploads`
     engineering-review portal embeds PERMANENT, unrevokable Firebase Storage download URLs for
     drawing pages directly in the token doc (`drawingPages: pageUrls`, ~`app.jsx:29119`), generated
     via `getDownloadURL()`. Those URLs carry permanent access tokens — a leaked review-portal link
     exposes the actual drawing images FOREVER, independent of the token's `expiresAt` (likely customer
     IP). The flaw is real in code but NOT a live exposure — see the downgrade note below. Surfaced by
     Coach during the #137 trace (C89 side finding).
     FIRST STEP (owner: Coach, read-only — before ANY fix): trace exactly what `reviewUploads` exposes,
     how the drawing URLs are generated/stored, how widely review-portal links are shared, and what the
     safe replacement is (short-lived SIGNED URL via Admin SDK behind a token-validating CF — NOT
     `getDownloadURL()`). Determine the scope of exposure before designing a fix.
     Priority LOW (downgraded 2026-06-16 from HIGH). Diff-gated (customer-facing + IP exposure).
     DOWNGRADED (2026-06-16): zero customer exposure — the review portal was never finished and has NO
     reviews out with customers (no links in the wild, nothing actually exposed). Latent code flaw on an
     unbuilt feature, NOT an active leak. When addressed, fix as part of completing/redesigning the review
     portal (secure delivery baked into the design), NOT a standalone `getDownloadURL()` patch on a
     half-built feature. Replacement pattern: short-lived SIGNED URL via a token-validating CF, never
     `getDownloadURL()`.
     Logged: 2026-06-16.

## Backfill stale confidence "C" circles on existing projects (2026-06-16)

149. **OPEN** [MEDIUM — UNBLOCKED: #146 core deployed v1.20.132 (2026-06-16); ready to spec] — Backfill stale
     confidence "C" circles on EXISTING projects (exact-BC clear). Companion to #146.
     PROBLEM: #146 core fixes confidence at EXTRACTION time, so it only helps NEW extractions. Existing
     projects still carry the old regex-downgraded "medium" confidence and keep showing stale "C" circles
     on ~every line. We do NOT want to re-extract them all.
     SCOPE (deliberately tight — exact-BC clear only):
     - On project OPEN, recompute confidence for existing rows: any row with an EXACT BC match
       (`priceSource:"bc"` AND `bcMatchType:"exact"`) → set confidence "high" → clears its "C" circle.
     - FUZZY BC matches → do NOT clear (a fuzzy match can mask a misread — same rule as #146 core; exact only).
     - No match → leave as-is (do NOT suppress — a not-in-BC row may be a misread and must stay flagged).
     - OUT of scope: text-layer recompute, and vision-row/raw-model-confidence reconstruction. Exact-BC is
       the single highest-impact, lowest-risk slice and covers the large majority of rows. Keep it simple.
     PERSIST ONCE: write the recomputed confidence back AND flag the project as migrated (e.g.
     `confidence-recomputed-at-vX`) so it runs ONCE per project on first open post-deploy — NOT on every open.
     SEQUENCING: builds AFTER #146 core is deployed (it applies the same exact-BC rule the core fix
     establishes — core must land first). Then normal pipeline: Coach confirms persisting recomputed
     confidence is safe (it's a stored field) + reads the on-open recompute hook point → spec → Jon
     approves → Marc builds, diff-gated.
     Logged: 2026-06-16.

150. **OPEN** [LOW] — Anthropic budget meter: proactive admin alert at 80% of real limit.
     PROBLEM: The "Anthropic Max" in Settings is a user-editable soft cap that has no connection
     to the actual Anthropic billing limit. The meter shows WARNING/CRITICAL but never stops API
     calls — useless for answering "do I need to increase my Anthropic budget?" ARC must NEVER
     stop working due to hitting a budget ceiling — blocking API calls is not acceptable.
     FIX:
     - Make the dollar cap admin-set-once (not freely editable). Value must match the account's
       actual Anthropic console spend limit. Label it clearly: "Anthropic Account Limit (set to
       match your console.anthropic.com spend cap)".
     - At 80% of cap: fire a push notification + in-app notification to all admins:
       "Anthropic spend is at $X of $Y (80%). Increase your limit at console.anthropic.com
       before it runs out, then update this value in ARC Settings."
     - Notification fires ONCE per billing month per threshold crossing (don't spam on every
       API call). Track via a `budgetAlertSentMonth` field on the ledger doc.
     - Remove the casual input field — replace with a locked display + admin "Update Limit"
       action that requires confirmation.
     - ARC never blocks API calls. The goal is to give admins enough runway to increase the
       Anthropic limit before it's hit — not to shut down the tool.
     WHY: Anthropic has no billing API to auto-read the account limit, so ARC can't pull it
     automatically. But ARC CAN alert admins proactively so they increase the limit before
     work is interrupted.
     Logged: 2026-06-16.

## Duplicated BC-apply logic — maintenance hazard (2026-06-16)

151. **OPEN** [LOW — code maintenance] — The BC-match → row-update spread is DUPLICATED byte-for-byte
     at two sites: background pricing `runPricingBackground` (~`app.jsx:14885-14901`) and foreground
     `PanelCard`/`runPricingOnPanel` (~`app.jsx:26360-26379`). Any change to BC-apply behavior must be
     made in BOTH or the two pricing paths silently diverge (path-dependent bugs — same class as #80).
     Surfaced during the #146 diff review: rule #1 (exact-BC → confidence "high") had to be added to
     both sites for path-consistency; the duplication itself was never captured as a cleanup item.
     CANDIDATE FIX: extract the shared row-update spread into one helper (e.g. `_applyBcMatchToRow(r,
     bcEntry)`) called by both paths, so future BC-apply changes touch one place. Low priority — not a
     bug today (both sites are currently in sync), just a latent divergence risk. Verify no behavioral
     difference between the two spreads before unifying (the priceDate guard differs slightly:
     foreground gates on `hasActiveRfq`, background on `hasPrice&&hasPpDate`).
     Logged: 2026-06-16.

## Background save of unopened projects (2026-06-17)

152. **OPEN** [LOW — pre-existing] — Background/onSnapshot save path writes to projects the user has not
     opened. Observed during #149 live verification: PRJ402096 (Salares) had 43 exact-BC rows
     promoted in memory by `migrateProjectShape` on dashboard load. Without the user ever opening
     the project, a subsequent save wrote Salares to Firestore — but since `migrateProjectShape`
     is pure (in-memory only, no Firestore side effects), the save came from a different path.
     The save wrote the project WITHOUT the in-memory promoted confidence values (43→0 promoted
     rows persisted) and WITHOUT the `_confidenceRecomputedAt` flag.
     EVIDENCE: `docs/149-LIVE-VERIFICATION.md` (Marc, 2026-06-17). Salares was the only project
     in the 4-project test set that reverted to 0 without being opened.
     ADJACENCY: This is in #86's neighborhood — the CLAUDE.md "Async Project Ownership Rule"
     states that "the currently open project must never determine where async results are written."
     A background save writing an unopened project is the inverse: a save path reaching a project
     that ISN'T currently active. Both violate project-scoped I/O boundaries. The #86 rule was
     about extraction completion handlers; this is about save paths.
     IMPACT: Low for #149 specifically (in-memory re-promotion is the correctness mechanism, not
     Firestore persistence). Unknown for other data — if a background save writes stale in-memory
     state over fresher Firestore state, that's a broader concern.
     NOT a #149 regression — #149 adds no save paths. Pre-existing behavior surfaced by #149's
     console logging.
     DEFERRED: investigate which save path fires for unopened projects and whether it carries
     stale state. Not urgent — no known data loss.
     Logged: 2026-06-17 (Coach C93).

## Drawing-revision re-extract + BOM/labor diff (2026-06-17)

153. **OPEN** [HIGH — feature, needs Brief/spec] — Drop a revised drawing set onto an existing
     project, re-extract, and DIFF the new BOM + labor against the prior version.
     REQUEST (Jon, 2026-06-17): Let the user drop a new/updated set of drawings into an existing
     project to be extracted. The ORIGINAL drawings + original BOM/labor must be RETAINED (Jon
     believes retention already happens — VERIFY: pages keep `originalPdfPath`/`storageUrl`, and
     prior BOM/labor are preserved, not overwritten). After re-extraction of the new set, compare
     the new extracted BOM and labor against the prior version and surface the delta:
       - BOM table → show items CHANGED (added + modified: qty / PN / description / price / labor
         deltas relative to the prior version, visually flagged).
       - Notes → show items DELETED (present in the prior version, absent from the new extraction).
     INTENT: a drawing-revision comparison workflow — when a customer issues a revised drawing
     package, the estimator sees exactly what changed without re-pricing from scratch or losing the
     original estimate.
     OPEN QUESTIONS FOR SPEC (Coach/Freddy):
       - Where does the "prior version" live — a new ECO, a snapshot of the panel's BOM/labor at
         re-extract time, or the existing Dv (Drawing Version) / bomVersion machinery? Strong
         overlap with the Dv.# system (#138) and ECO flow — reuse vs. new snapshot store.
       - Diff granularity + match key: how to pair "same" line items across revisions (PN? PN+desc?
         itemNo? fuzzy?) so a renamed/re-PN'd part reads as CHANGED, not delete+add.
       - Labor diff presentation: cut/layout/wire hour deltas, lead-time deltas, panel-level totals.
       - Retention guarantee: confirm Data-Retention rules hold — original BOM rows, manual edits
         (`priceSource:"manual"/"bc"`), crosses, corrections, and the original drawing blobs must
         survive re-extraction. Re-extract must NOT silently clobber priced/edited rows (see #86 /
         "Never overwrite user data silently").
       - UX entry point: drop-zone on the existing project vs. "Re-Extract Drawings" (button already
         present on the panel) — and how the compare view is surfaced.
     SEQUENCING: H-item discipline — Freddy Brief → Coach Supplement/spec + retention-safety read →
     Jon approves → Marc builds (diff-gated). Not started.
     Logged: 2026-06-17 (Jon request).

## Confidence "C" circle → clickable BC Item Browser button (2026-06-17)

154. **OPEN** [MEDIUM — UX feature] — Make the confidence "C" circles clickable buttons that open the
     BC Item Browser pre-filled with the row's part number.
     REQUEST (Jon, 2026-06-17): The "C" confidence circle on a BOM row currently is informational only
     (`<span>` with `cursor:help`, `src/app.jsx:~28096`). Turn it into a button: clicking it opens the
     BC Item Browser (`BCItemBrowserModal`) pre-filled with the row's PN so the user can immediately
     verify/match the flagged part against the BC catalog — one click from "this row looks uncertain"
     to "verify it now."
     IMPLEMENTATION POINTER: reuse the existing open pattern — the not-found "+BC" button at
     `src/app.jsx:~28244` already opens the BC Item Browser pre-filled with the row's PN (sets
     `targetRow` + `initialQuery`; modal mounts at `~29251`). The "C" circle just needs the same
     onClick wired in, restyled from `cursor:help` span → button (keep the amber/red severity color,
     the "C" glyph, and the tooltip; add hover affordance).
     CONSIDERATIONS:
       - Preserve the existing tooltip text (AI confidence: low/medium — verify against the drawing).
       - The circle renders only for `confidence` low/medium and non-labor/non-contingency rows — same
         gate stays; only rows that show a circle get the button.
       - Base-locked-in-ECO rows already route field edits through the BC Item Browser (see the
         `_baseLockedInEco` title at `~28130`) — confirm the new button respects ECO scope.
       - Touches the #141 (C84/C86) confidence-circle render block — quick Coach glance for layout +
         the `_bc` cell flex pair, then Marc builds (likely small/diff-gated, may skip full H-item flow).
     Logged: 2026-06-17 (Jon request).

## Bundled quote-send bypasses the manualVerify send-gate (2026-06-17)

155. **RESOLVED** [FALSE POSITIVE — no code change, Coach C98/C99 trace] — The bundled quote-send
     path (`QuoteSendModal`, the "Include Quoted BOM" toggle) was reported as not enforcing the
     manual-verification send-gate. INVESTIGATION (Coach, 2026-06-17): the gate IS enforced
     implicitly through the same `findIncompleteQuoteItems(project)` pipeline. Three enforcement
     points:
       (1) QUOTE SUMMARY "Send" button: `disabled={_sendBlocked}` (line 35335), where
           `_sendBlocked = _incompleteItems.length > 0` and `_incompleteItems` includes
           `isVerificationBlock:true` items from `findIncompleteQuoteItems` (line 15704).
       (2) QuoteSendModal send buttons: `disabled={sending||sendBlocked}` (lines 32702, 32710),
           where `sendBlocked = incompleteItems.length > 0` (line 32385).
       (3) Runtime double-check: `if(sendBlocked){ arcAlert(...); return; }` (line 32390).
     The bundled path is actually STRICTER than standalone — it blocks on verification + pricing,
     whereas standalone `handleBomSend` blocks on verification only (line 33016). Marc's note was
     narrowly true (no explicit `isVerificationBlock` filter in `handleSend`) but the gate is
     enforced one layer up via `sendBlocked`. The warning banner (line 32682) explicitly surfaces
     "Send disabled — BOM verification required" when `_hasVerifyBlock` is true.
     DURABLE RECORD: this trace is preserved so no future session re-flags the same apparent gap.
     Original logged: 2026-06-17 (Marc, #137 Phase 1 build review).
     Resolved: 2026-06-17 (Coach, false-positive trace).

## In-Portal BOM Accuracy Confirmation + Verified Access (2026-06-17)

156. **OPEN** [HIGH — feature, absorbs #137 Phase 2] — In-portal BOM accuracy confirmation with
     verified access. Reframes #137 Phase 2 from quote-approval to BOM-accuracy-confirmation:
     customer verifies ARC read their drawings correctly (parts, quantities, manufacturers),
     references the drawing PDF, flags wrong lines. No pricing exposed.
     ARCHITECTURE: frozen BOM snapshot server-side (`bomApprovalSnapshots/{token}`), CF-mediated
     view-time fetch (token revalidated every request), signed-URL-via-CF for PDF (5-min, Admin
     SDK, never stored download URL), email one-time-code domain-allowed verification, per-line
     response model (flag wrong lines, no global reject verb), DQ3 hard rule (never auto-edit
     BOM from customer input).
     BUILDS ON: #137 Phase 1 (token core, rules, send-path wiring — all live). Retires the
     Phase 1 response-only summary portal (safe — no real customer link ever sent).
     ABSORBS: #137 Phase 2 scope (CF write-back, bell notification, QUOTE SUMMARY display,
     Revoke). #137's Phase 2 description should be considered superseded by this ticket.
     SCOPE: 6 new CFs, 1 new Firestore collection, portal rewrite, 2 ARC modals, QUOTE SUMMARY
     extension, IAM config for signed URLs. Proposed 3 internal phases (A: server infra,
     B: portal rewrite, C: ARC surfacing).
     SUPPLEMENT: `docs/156-SUPPLEMENT.md` (Coach C98) — all Brief assumptions verified, no
     blocking gaps.
     SEQUENCING: H-item discipline — Brief (Jon, chat) → Coach Supplement (C98) → Jon approves →
     Coach Detailed Plan → Jon approves → Marc builds (diff-gated).
     INTERACTION: #155 (bundled send bypasses manualVerify gate) should be resolved before or
     alongside #156 — prevents a verified-BOM-accuracy portal showing an unverified BOM.
     Logged: 2026-06-17 (Jon Brief, Coach C98 Supplement).

## Bundled send: BOM Report PDF uses stale `project` instead of `populated` (2026-06-17)

157. **OPEN** [LOW — pre-existing data-staleness bug] — In `QuoteSendModal.handleSend`, the BOM Report
     PDF builder at line 32500 (`buildBomReportPdfDoc(bomDoc, project)`) and the traveler BOM PDF at
     line 32513 (`generateTravelerBomPdf(project)`) use the stale closure `project` instead of the
     post-BC-sync `populated` object (computed at line 32446 via `ensureQuoteFieldsPopulated`). The
     Quote PDF correctly uses `populated` (line 32490: `buildQuotePdfDoc(pdfDoc, populated)`), so only
     the BOM Report and traveler BOM attachments are affected. Impact: if BC sync populates fields that
     `buildBomReportPdfDoc` or `generateTravelerBomPdf` reference (e.g. payment terms in headers, or
     BC-populated vendor data on rows), the BOM Report / traveler BOM may show pre-sync values.
     Low urgency — the delta is typically small (BC sync primarily populates quote-level fields that the
     BOM Report doesn't display), and the BOM row pricing data is identical on both objects.
     FIX: change line 32500 to `buildBomReportPdfDoc(bomDoc, populated)` and line 32513 to
     `generateTravelerBomPdf(populated)`. Single-line each.
     Surfaced: 2026-06-17 (Coach, #156 send-path investigation). NOT a #156 dependency.

## Region-learning document exceeds Firestore 1MB hard limit (2026-06-17)

158. **RESOLVED** [was HIGH — silent production data-integrity failure] — Region-learning document exceeds
     Firestore 1MB hard limit; learning silently broken.
     DISCOVERED: 2026-06-17 during #153 v1.20.140 testing (console, real prod data).
     `config/region_learning` for company XODxZ8xJc0dQXGZI7jbo exceeds Firestore's 1,048,576-byte
     per-doc hard limit (observed climbing 1,114,178 → 1,179,954 bytes). Every
     `saveRegionLearningEntry` / `updateRegionLearningEntry` now fails (also a 400 on the Firestore
     Write channel). SILENT — `console.warn` caught in `.catch()`, no user indication. HARD CEILING
     — the doc can never be written again until restructured; every future region capture fails.
     DEGRADES EXTRACTION ACCURACY — per-company region targeting is frozen at whatever state the doc
     was in when it crossed 1MB. POSSIBLY related to 3 native-PDF mis-reads Jon saw 2026-06-17
     (unconfirmed; check together).
     SUSPECTED ROOT CAUSE: entire region_learning set stored in a SINGLE doc that grows unbounded →
     inherent 1MB ceiling.
     FIX DIRECTION: shard region_learning across multiple docs (subcollection per learned region /
     per template) and/or prune stale entries; make write-failure LOUD not silent. CRITICAL: the
     existing doc is ALREADY over-limit and frozen — the fix MUST include a migration to split the
     oversized doc, or this company stays broken even after the code fix.
     SCOPE REFS: `saveRegionLearningEntry` / `updateRegionLearningEntry` ~line 3298,
     `_captureRegionForLearning` ~line 4508.
     PRIORITIZE: silent, active, production, accuracy-affecting.
     Logged: 2026-06-17 (Jon, observed in console during #153 testing).

     **RESOLVED 2026-06-29 (v1.21.1).** region_learning single-doc → subcollection + thumbnail cap
     + loud failures. Commits `13787154` (P1-P3) / `f6762a79` (v1.21.1, hosting + firestore rules).
     Frozen doc (companies/XODxZ8xJc0dQXGZI7jbo) migrated: 1,044,339 chars → 132-byte slim manifest
     + 9 entries in `/entries`, thumbnails byte-for-byte preserved, 10-op atomic batch (dry-run
     verified). Phase 5 V1-V4 all PASS (V3 extraction landed 76 BOM items with region-learning in
     path). Haiku `.update()` merge confirmed on subcollection. Learning DB at 13 (4 real OVIVO
     regions kept). Plan: docs/158-REGION-LEARNING-SCOPE.md + docs/158-DETAILED-PLAN.md (C108
     Rev 2); review C109. No APP_SCHEMA_VERSION bump (config data). Root driver was uncapped
     thumbnail height (9 entries blew 1MB), NOT entry count — Phase 1 cap addresses it directly.
     LOOSE ENDS (carry forward):
     - DEFERRED V3 DIRECT CONFIRM (LOW): `regionLearningParts` verified non-empty by invariant +
       read-path proof, not a captured request payload. On the next catchable extraction, glance at
       the actual request payload to close it directly.
     - SANDBOX BC CLEANUP: scratch project PRJ402127's BC project + task structure remain in BC
       (ARC-side deleted; "also delete from BC" left unchecked per scope). Retire alongside the
       other #163 sandbox test artifacts (MTX-01023/24/25, ZZ_TEST items). Harmless sandbox cruft.

## Copy-to-New-Quote: add customer selection + PRJ# (2026-06-17)

159. **OPEN** [HIGH — functional gap, copies permanently stranded] — Copy-to-New-Quote modal creates
     projects with no customer and no PRJ#. Customer is assignable ONLY at creation (no post-creation
     way to change/add it), so copies are permanently stranded customerless. FIX: add the BC customer
     picker (reuse `NewProjectModal`'s `bcLoadAllCustomers` + `bcFilterCustomers` components) to
     `CopyProjectModal` (line 43622). Pre-fill from source project's customer (editable). On copy,
     call `bcCreateProject` to generate PRJ# + BC Job card. ~70 lines, low risk — all BC functions
     already exist. Tension resolved: customer + PRJ# creation is NOT "BC linkage" in the carry-over
     sense — the copy gets its OWN fresh BC identity while source purchasing state stays excluded.
     SCOPE: `docs/159-COPY-CUSTOMER-SCOPE.md` (Coach C104).
     FUTURE: post-creation customer reassignment (broader limitation, separate ticket).
     Logged: 2026-06-17 (Jon, Coach C104 scope).

160. **RESOLVED** [Reject path VERIFIED on real production crossed data] (2026-06-29). Reject button +
     `"rejected"` → `{...m.prior}` carry-forward (Coach C105) confirmed live on PRJ402096 / v1.21.2:
     both Rejected crossed ducts (DUCT,2X3,GREY / crossedFrom 3240199; DUCT,4X4,GREY / crossedFrom
     3240200) committed with **prior qty "12" retained and cross/BC/pricing intact** — exact carry-forward,
     no field drift. First real-data confirm of the #160 fix; the reject path is verified-on-commit.
     (Original FIX as specified: Reject button on changed-row actions; `buildReconciledBom` handles
     `"rejected"` by carrying `{...m.prior}` — prior row exactly as-is, all crosses/pricing/BC preserved.)
     SCOPE: `docs/160-RECON-REJECT-SCOPE.md` (Coach C105). Evidence: `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md`.
     Logged: 2026-06-17 (Jon, Coach C105 scope). Verified: 2026-06-29 (Marc runtime capture; Freddy disposition).

## Miscellaneous (2026-06-17)

161. **OPEN** [LOW — UX] — Mistimed BOM-region tip. The tooltip "Tip: Select BOM Regions for better
     accuracy" fires AFTER the user has selected page types, selected regions, and clicked Proceed —
     i.e. after the advice is actionable. Harmless but useless at that timing. FIX: show it earlier
     (before/during region selection) or remove it entirely. Likely trivial.
     Logged: 2026-06-17 (Jon, observed during testing).

162. **OPEN** [LOW — display/metering] — Header Anthropic spend + token counters don't reset monthly.
     The header "Anthropic $X/$500" and "Tokens XM/8.0M" are at-a-glance month-usage readouts
     (general awareness, NOT the cost-attack gating ledger). They accumulate monotonically and never
     reset (observed over cap: $524/$500, 28.9M/8.0M). FIX: reset at the start of each calendar
     month (Mountain TZ), show current-month vs. cap. IMPORTANT: this is the DISPLAY counter only —
     do NOT touch the `extractSupplierQuotePricing` spend ledger (`rfqUploads/{token}.aiSpendCents`)
     which is the actual cost-control gate.
     Logged: 2026-06-17 (Jon, observed during testing).

163. **DONE** — shipped v1.21.0 (43ab7b14, tag v1.21.0), 2026-06-27. Full PN Integrity via BC Surrogate
     Key. Original problem: Part# >20 chars truncated to BC's Code[20] "No." field → full PN lost.
     SOLUTION: decoupled BC item identity from the part number — BC "No." is now an opaque MTX-#####
     surrogate (auto-assigned by No.-Series); the full PN lives in ARC's `partNumber` + BC's
     `Vendor_Item_No`. Shipped P1-P5 + 3a/3c + C113 (cross regression) + C115 (alternates-dropdown
     regression). Full T1-T10 passed on the test channel. Code-live only — bcEnvironment stays sandbox
     (MATR_SndBx_01152026), NO BC cutover (production BC does not exist yet). Plan:
     docs/163-DETAILED-PLAN.md (Coach C109 Rev 4); review record: docs/163-MARC-REVIEW.md,
     163-BUILD-REPORT.md, 163-COACH-REVIEW.md, 163-CROSS-REGRESSION-TRACE.md. Coach chain C107–C116.

     ── #163 REQUIRED CUTOVER (GATED — do NOT start until a production BC environment exists) ──
     BC mass-rename ALL item No.s → MTX-##### syntax. Establishes the invariant: "any MTX-##### appearing
     in ARC's Part# field = a bug (surrogate leak)." Jon-run via Excel export/edit/reimport.
     PREREQUISITES: (a) production BC environment must exist; (b) long-PN items hand-corrected (true full
     PN into Vendor_Item_No) FIRST, or the rename loses the full PN; (c) developer assessment of what in
     BC references items by No. (open docs, posted history, item references).
     ARC-SIDE (CRITICAL — not a pure BC op): existing ARC BOM rows carry `bcNo` pointing at the current
     BC No.s; renaming synced items ORPHANS those links unless ARC's bcNo values are reconciled in
     lockstep. Needs a Coach trace on ARC-side impact alongside the developer's BC-side review.
     Jon meeting his BC developer Monday — framing: "what to stand up production BC + what the rename
     touches (BC refs-by-No AND ARC bcNo links)."

     ── #163 AGREED MIGRATION APPROACH (BC mass-rename → MTX) — exact plan for next session ──
     Two-system migration: the BC rename and the ARC reconciliation are two halves of ONE operation —
     doing only the BC half ORPHANS ARC's bcNo links. PROCESS (strict order):
     1. PREREQ: production BC environment exists (does NOT yet).
     2. Long-PN hand-corrections FIRST — true full PN into Vendor_Item_No for the handful of long items,
        BEFORE any rename (else the full PN is lost and the mapping breaks).
     3. Developer BC-side assessment (Jon + BC developer, Monday) — what references items by No. (open
        POs/orders, posted history, item references, planning lines); whether BC blocks renaming items
        that have posted history.
     4. BC RENAME — Jon via Excel export/edit/reimport. Every No. → MTX-#####; Vendor_Item_No retains
        the full PN.
     5. JON PRODUCES A MAPPING SHEET (Excel) — authoritative old→new map. AGREED COLUMNS: (a) old BC No.
        exactly as it was in BC's No. field (may be truncated), (b) full Part# / Vendor_Item_No, (c) new
        MTX#. Three columns so the ARC script can join on whichever field is reliable — ARC rows may store
        bcNo as the TRUNCATED value (not the full PN), so the old-BC-No column is the PRIMARY join and the
        full PN is the bridge/fallback.
     6. ARC RECONCILIATION SCRIPT — walks every project's BOM rows, matches each row's bcNo to the mapping
        sheet, rewrites bcNo → new MTX#. This is the half the Excel reimport does NOT cover (ARC's bcNo
        lives in Firestore, not BC). Coach scopes; MARC executes (Firestore write across all projects).
        DRY-RUN FIRST — report what it WOULD change (row count, old→new pairs), NO writes; Jon verifies the
        mapping hits; THEN live run.
     7. VERIFY — spot-check renamed items still price/sync correctly (mini T-suite vs renamed items).
     OPEN QUESTION (Coach trace, BEFORE scoping the script): is `row.bcNo` the ONLY place ARC stores a BC
     No.? If anything else caches it (a lookup map, etc.), the script must update that too. Confirm first.
     NEXT-SESSION TRIGGER: Jon opens a session, says they're preparing the change, provides the Excel
     mapping sheet. FIRST ACTION = Coach trace (bcNo sole-reference confirm + join-field reliability) →
     Coach scopes the script → Marc dry-runs → Jon verifies → Marc runs live.
     WHAT JON BRINGS: the Excel mapping sheet (3 cols above); confirmation the BC rename is done (or
     whether we're scoping before executing); whether long-PN hand-corrections are complete.

     ── #163 SEPARATE TICKETS (filed on GitHub, non-gating, own track) ──
     - GH #2 — Supplier portal: per-row lead times should satisfy submit; block on missing rows via a
       non-overridable modal instead of always requiring a global lead time.
     - GH #3 — Supplier portal: no manual-entry option without uploading a document first (suppliers
       upload junk docs to reach manual entry).
     - GH #4 — BC price-push stacks new vendor prices without end-dating the prior price (duplicate
       open-ended Purchase Prices; money-correctness). Open Q: ARC explicit end-date vs BC supersession
       by latest start date — needs a Coach trace. Lives in the bcPushPurchasePrice path.

     ── #163 NEAR-TERM / CRITICAL UX (fix soon — confusing to users) ──
     - Dedup-hit should WARN ("Part# already in use as a Vendor Part#") instead of silently routing
       through the cross/correct modal. Data outcome already correct (no duplicate created); only the
       user feedback is missing. Found during T6.

     ── #163 POLISH (lower priority) ──
     - RFQ Part Number column auto-width so long PNs stay on one line (cosmetic).
     - Print Traveler internal-preview button — spec'd at docs/PRINT-TRAVELER-BUTTON-SPEC.md (button
       between Transfer and Delete; Line/Project modal; render-on-demand, no email). Build deferred.
     - BC Item Browser search-preview doesn't populate MFR/Vendor in result rows (data correct in BC;
       likely the v2 /items mapper's thinner field set — §1a family). Found during T4.

     Logged: 2026-06-17 (Jon). Resolved DONE: 2026-06-27 (close-out, shipped v1.21.0).

164. **RESOLVED** [NOT-REPRODUCIBLE-ON-MASTER — not "fixed", no code changed] (2026-06-29, live runtime
     confirm on PRJ402096, v1.21.2). The Deleted→"Keep" path does NOT strip crosses on current master.
     EVIDENCE: at ReconciliationModal mount the crossed Deleted-bucket row (DUCT,1X2,GREY / crossedFrom
     F1X2LG6) carried `isCrossed`/`crossedFrom`/`bcNo`/`priceSource`/`unitPrice` **byte-identical across
     `frozenBom`, the `currentBom` prop, and `matchResult.deleted`** — the exact entry Keep operates on.
     Combined with Coach's proven raw `keptDeleted.push(r)` (no commit-side stripping), the cross reaches
     the modal whole and Keep preserves it. The original report's "reverted to pre-cross PN" symptom is
     now attributed to a cross that never cleanly persisted (see #172), or predates the C103 cross-aware
     reconciliation. RESUME TRIGGER: reopens ONLY if a cross **confirmed cleanly persisted** (present in
     the at-rest BOM BEFORE the drawing drop) reverts after a Deleted→Keep COMMIT. A cross that was never
     cleanly applied is #172, not #164. Cite: `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md`.
     Logged: 2026-06-17 (Jon + Marc, observed during #160 live testing). Resolved: 2026-06-29 (Marc
     runtime capture; Freddy disposition).

165. **OPEN** [RE-SCOPED 2026-06-29 — severity likely MEDIUM not HIGH, Jon to confirm at fix-scope] —
     Reconciliation Accept/Reject verbs read BACKWARDS, + Accept-on-crossed safety. In ReconciliationModal
     the Changed-row verbs ("Accept" = take the revision; "Reject" / "Keep Prior" = keep the user's worked
     row) feel inverted — Marc's own instinct read them wrong during the #160 build.
     ── RE-SCOPE (2026-06-29 runtime session, PRJ402096): the data-loss surface is NARROWER than logged. ──
     Established today: `carryChangedPnChanged` (the strip path) fires **ONLY for `pn_changed` rows**.
     All 4 Changed rows this session were `reason:"qty"`, and **qty-Accept routes through
     `carryChangedPnSame` → does NOT strip** (cross-safe by code; the 2 Accepted rows kept correctly,
     the 2 crossed rows were Rejected and preserved). So #165's actual data-loss risk narrows to ONE
     untested path: **a `pn_changed` Changed row that is CROSSED, then Accepted → `carryChangedPnChanged`
     drops `isCrossed`/`crossedFrom`/pricing.** The common qty-change case is PROVEN SAFE.
     PART (A) — verb relabel — SHIPPED v1.21.8 (`fef65fe8`, 2026-06-30, Freddy-routed, Jon-approved).
     DISPLAY-ONLY change in ReconciliationModal: Changed-row buttons relabeled + recolored — "Accept"→
     "Use Revision" (off) / "✓ Using Revision" (on), color green→amber (take-revision strips crosses on
     pn_changed, should NOT read as safe); "Reject"→"Keep Mine" (off) / "✕ Keep Prior"→"✓ Kept Mine" (on),
     color red→green (data-preserving). Footer "Accept All (Changed + New)"→"Use All Revisions (Changed +
     New)". Status span "kept prior — differs"→"kept mine — differs". Admin #165 cross-strip banner verb
     refs (Accept/Reject) updated to match (Marc judgment call, text-only, Jon accepted at close). Resolution
     values STILL "accepted"/"rejected" (verified in bundle) — buildReconciledBom/handlers/counters untouched.
     Added-row buttons left "Accept"/"Reject" (correct for new items, not backwards). PENDING: Jon's live
     visual confirm at the next real reconciliation (display-only, low risk). Lines touched: 23325, 23349,
     23305 (Coach C-trace hints held).
     PART (B) REMAINS OPEN: **Accept-on-crossed safety**, scoped to `pn_changed` ONLY. Needs a dedicated repro:
     force a PN change on a crossed prior row, take the revision ("Use Revision"), re-read the committed row
     for cross survival. Deferred behind C118.
     SEVERITY: given qty-Accept is safe, (B) is arguably MEDIUM not HIGH — Jon to confirm at fix-scope.
     DOWNGRADE BOUNDARY (Freddy — bank the reasoning, don't misread the label): it dropped to MEDIUM
     because `carryChangedPnChanged` fires ONLY on `pn_changed` and we PROVED qty-Accept is cross-safe by
     code, so the COMMON case can't lose a cross. It is MEDIUM because the residual (crossed + pn_changed
     + Accepted) is RARE, **not because it's mild** — if it fires it's still SILENT cross + pricing loss.
     Do NOT let a future session read "MEDIUM" as "low-stakes" and drop part (A) verb-relabel or the
     eventual (B) repro. Both stay on the docket.
     Evidence: `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md`.
     Logged: 2026-06-17 (Jon + Marc, identified during #160 build/testing). Re-scoped: 2026-06-29 (Marc
     runtime; Freddy disposition).
     TOOLING (shipped v1.21.3, commit 65d898e8, 2026-06-29): admin-only cross-strip detector added to
     ReconciliationModal (Coach C117). Predicate `matchResult.changed.filter(m=>m.reason==="pn_changed"
     && m.prior.isCrossed)`, gated `isAdmin() && cands.length>0`, non-blocking inline banner naming the
     at-risk crossed-to PN(s). PURE RENDER — no resolve/commit interaction. Arms the manual Accept-test
     for part (B): when a real pn_changed crossed row appears, the banner flags it so Jon can Accept it
     and confirm whether the cross survives. Force-render verified via isolated harness; negative case
     (no banner on non-pn_changed reconciliation) confirmed by this session's PRJ402096 commit. This is
     #165 tooling, NOT a separate finding. Coach C118 verifies the deployed diff.

> **⚠ Reconciliation-cluster status caveat (#164/#165 build on #160/#153 code) — banked 2026-06-29
> (Freddy close-out reasoning, would otherwise die with the session):** the "OPEN" status on #153/#160
> means **built-but-unverified** — deployed to the TEST channel, awaiting T-suites, never formally
> closed — NOT not-started. #153's TODO body text reading "Not started" is stale 2026-06-17 logging.
> Before building #164/#165 (or any reconciliation-cluster work), have **Coach confirm the C101/C103/
> C105 commits are actually IN MASTER** before treating that code as live — a one-line check that saves
> a future session a confused archaeology dig.

166. **OPEN** [LOW — maintenance / dedup cleanup] — stampFn / drop-handler duplicated logic in the
     #153 revision flow. A deferred cleanup item from the #153 build: the drawing-drop handling and the
     stamp/version logic carry duplicated code that should be consolidated. This was the item earlier
     mis-remembered as "#158" — but #158 was taken by the region_learning 1MB issue, so it went
     unlogged until now. NOT urgent and NO known data-loss (purely a maintenance hazard — duplicated
     code drifts out of sync over time). SCOPE NEEDED: Coach flagged this during #153; the exact call
     sites + what to dedup need Coach's input before implementation (Coach owns the original finding —
     see COACH.md C100–C105 era / SESSION-STATE.md dedup flag). Confirm the precise duplication with
     Coach, then consolidate.
     Logged: 2026-06-17 (Jon, after Marc+Coach confirmed it was unlogged at close-out).

## False alarms (2026-06-26)

167. **NO-BUG** [Verified — FALSE ALARM] (Coach C106) — "PRJ402124 reports 28 AI prices but shows zero AI
     price pills." Reported as a checklist=28 vs pills=0 contradiction over the same `priceSource==="ai"`
     predicate. Marc ran a read-only runtime investigation (in-memory `projectRef.current` + Pre-Print
     Checklist DOM) on the live deployed app: the "28" is NOT AI prices — it is **28 AI-estimated LEAD
     TIMES** (`leadTimeSource==="ai"` / `leadTimeEstimated:true`). The Pre-Print Checklist line reads
     verbatim "28 AI-estimated lead times" and correctly flags the quote BUDGETARY via
     `_markProjectBudgetaryForAiLeads`. Evidence: all 89 BOM rows across the 4 panels are
     `priceSource:"bc"` (0 `"ai"` anywhere — in memory, in `quote`, and across all 16 `qvHistory`
     revisions) → the zero AI-price pills are CORRECT. The 28 ai-lead rows cluster on the two EXTRACTED
     lines (panel-1/Line 1 FLS-1071 = 17; panel-1781728550098/Line 4 FLS-1072 = 11); non-extracted Lines
     2-3 = 0. Sample row `1492-SPM1C030`: `priceSource:"bc"` + `leadTimeSource:"ai"` + `leadTimeDays:10`.
     ROOT CAUSE OF THE ALARM: terminological — "AI-estimated lead times" was read as "AI prices." App is
     behaving as designed; no code change. CORRECTION FOR COACH C106: the checklist count predicate is
     lead-time-based (`leadTimeSource==="ai"`), NOT `priceSource==="ai"` as C106 recorded — so the
     "same-predicate contradiction" framing does not hold. (Note: rules block direct client reads of the
     persisted doc — auto-ID doc not under the readable `users/{uid}/projects` collection — but the
     determination is lead-based and in-memory==loaded-from-Firestore, so the persisted/in-memory split
     is moot: no `priceSource:"ai"` population exists to be stale.)
     Logged: 2026-06-26 (Jon directed; Marc runtime read, v1.20.142).

## Auto BC-sync vs manual BC Sync divergence (2026-06-29)

168. **TABLED** [likely NOT-A-BUG-AS-REPORTED — re-investigated 2026-06-29] — Post-extraction auto
     BC-sync modal "flags valid in-BC items as couldn't sync." Original report: auto-popup lists valid
     in-BC parts as failed; closing it + clicking manual "BC Sync" syncs them all. Re-investigated live
     this session — **the reported symptom did NOT reproduce once the duplicate-trigger race was removed
     (v1.21.2).** The only failure that reproduced on v1.21.2 is a LEGITIMATE one: JOB BUYOFF genuinely
     not in BC → popup correctly tells the user to act. That is the genuine-failure surface working as
     designed, not the bug.
     **Hypotheses DISPROVEN this session:**
     (a) Duplicate-trigger race as the popup cause — the race was real and is now removed (v1.21.2,
         9c885da6), but it NEVER produced the popup: `setSyncFailedAlert` lives only in the KEPT path
         (`syncPlanningLinesToBC`, app.jsx:25214); the deleted Path A only `console.warn`'d.
     (b) Posting-group theory — all three suspect items (CSD242010SS / A24P20 / ALD2QH211DNUG) have
         valid `Gen_Prod_Posting_Group = INVENTORY` and `Inventory_Posting_Group = RAW MAT` in BC
         (Jon verified). The "Inventory Posting Group is read-only" 400 is ARC pointlessly PATCHing an
         already-set field — NOISE, not the cause.
     **Why it LOOKED intermittent / high-volume originally:** failure count scales with how many lines
     already exist in BC. Fresh project POSTs all rows (PRJ402129 = 37 failed); re-sync only POSTs
     new/changed rows (PRJ402130 re-extract = 1 failed). Deterministic per-item, NOT timing. The
     original 37-error storm was inflated by the now-removed race + a fresh-project full POST.
     **SHIPPED v1.21.2 (9c885da6) — separate improvement, NOT the #168 fix:** deleted Path A (the
     fire-and-forget post-pricing `bcSyncPanelPlanningLines`) + its premature POST. Removed a real
     duplicate-trigger race and redundant BC traffic (PROVEN). Verified live: no `Post-pricing BC sync:`
     line, single `bcSyncPlanningLines:` summary, happy path 41 created / 0 failed.
     **NOT proven to fix the #168 symptom — do not mis-remember v1.21.2 as "the #168 fix":** the
     37→1 error drop is mostly explained by PRJ402130 being PRE-POPULATED in BC (re-sync POSTs only
     new/changed rows), NOT by the fix. The one untaken test that would settle it: a FRESH project from
     the SAME drawings on v1.21.2 (none was run — PRJ402129 was deleted).
     **RESUME TRIGGER (crisp condition):** #168 is live again ONLY if the popup flags a part that is
     genuinely IN BC as "couldn't sync." A legitimately-missing item failing (e.g. JOB BUYOFF not in BC)
     is CORRECT behavior, not the bug. When live: resume from docs/168-C110-RUNTIME-EVIDENCE.md (raw
     evidence) + land #170 FIRST (the diagnostics fix that makes the real primary-POST error visible).
     Logged: 2026-06-29 (Jon observed; re-investigated + tabled same session. Freddy endorsed reframe).

## Prior-quote recognition / cross-quote pricing consistency (2026-06-29)

169. **OPEN** [Brief-stage — feature, scope not finalized] — Prior-quote recognition / cross-quote
     pricing consistency. When a new quote contains a panel (or items) ARC has quoted before, ARC
     should recognize the match and suggest the user verify final pricing against the prior quote.
     CUSTOMER-FACING RISK (the driver): the same panel quoted on two separate jobs can come out priced
     slightly differently — most often via LABOR drift (ARC auto-counts labor a little differently run
     to run). A customer who sees two quotes for the same panels at different totals will question why.
     The goal is internal pricing consistency on identical work.

     TWO PROBLEMS HIDING HERE (both must be settled at Brief time):
       (1) DETECTION/FLAGGING — recognize the match, nudge to reconcile. Treats the symptom.
       (2) THE DRIFT ITSELF — why does labor differ on the same BOM? If panels are genuinely identical,
           labor SHOULD be identical. Either the panels aren't actually identical (extraction variance,
           e.g. 54 vs 53 items) or the labor calc is non-deterministic on identical input. Treats the cause.

     OPEN SCOPE DECISIONS (Jon to resolve at Brief — captured so they survive):
       - FORK A (symptom vs cause): when two panels are the same BOM, should price be GUARANTEED
         identical (labor determinism is expected; any drift is a bug Coach must trace), OR is some
         labor variance legitimate (build judgment) and ARC just FLAGS it? Freddy lean: flag-first
         either way (even perfect determinism can't catch a legitimately-different build); whether we
         ALSO chase labor determinism is Jon's call.
       - FORK B (match granularity): panel-level only, or also single line items (same part, different
         price across two quotes)? Freddy lean: panel for v1, line-item as fast-follow — the panel is
         what the customer compares.

     FREDDY'S RECOMMENDED DEFAULT SHAPE (pending Jon's forks):
       - Match unit = PANEL, via a signature (sorted PN+qty).
       - Surface = Pre-Print Checklist (existing pre-send gate). SOFT notice, not a hard block.
       - Scope = across all of the company's quote history; note the matching quote's customer.
       - Action text = "This panel matches Panel X on Quote Q#### ($Y). Verify pricing." with the
         price delta and whether labor or material is driving it.

     Status: parked at Brief-stage — needs Jon to resolve Forks A/B before any Coach/Marc work.
     Logged: 2026-06-29 (Jon, new feature concept; Freddy scoped the open questions).

## BC planning-line sync — residual bugs surfaced during #168 re-investigation (2026-06-29)

170. **OPEN** [LOW — diagnostics, BC sync] — Primary `Type:"Item"` planning-line POST error is
     discarded; only the `Type:"Text"` fallback's rejection is surfaced. In `bcSyncPanelPlanningLines`
     (app.jsx ~3762), when the primary `Type:"Item"` POST to `Project_Planning_Lines_Excel` fails, its
     error body is read into `txt` and **thrown away**; the code then POSTs the `Type:"Text"` fallback
     and, if that also fails, records only the fallback's error (`txt2` = "Type must not be Text") into
     `result.failed[].error`. So ARC masks the TRUE cause of its single most important sync failure
     behind a misleading secondary error. **This is what hid #168's real error string all session** —
     every capture showed the fallback's "Type must not be Text," never the primary's actual 400 reason.
     Fix: retain/log the primary error (prepend it to the failed-row error, or log it). RELATED: the
     `Type:"Text"` fallback on `Project_Planning_Lines_Excel` can never succeed (BC rejects Text on that
     table) — it is dead logic; replace it with a loud, accurate failure ("item <PN> rejected by BC:
     <primary error>"). **Land this BEFORE any future #168 dig** — it's the missing instrument.
     (Coach's held Q2.) Logged: 2026-06-29 (Marc, found in code during #168 re-investigation).

171. **OPEN** [LOW — learning-application] — Auto-cross not applied to default BOM line before BC sync.
     JOB BUYOFF has an auto-cross to BUYOFF in the learning DB, but the cross did not apply to the
     default line before sync — ARC POSTed the pre-cross name. Cosmetic / low stakes (user manually
     crosses), but worth a look whenever the cross-on-default-line path is touched. Surfaced as the
     single legitimate failure during the #168 v1.21.2 repro (PRJ402130).
     Logged: 2026-06-29 (Marc, observed during #168 re-investigation).

172. **OPEN** [observe → leading suspect — possible cross/data-loss] — Cross-apply reverts to the original
     PN. Applying a cross reverted to the pre-cross Part# on 2 of 3 attempts (selection modal re-fired
     each time); took on the 3rd. **Leading suspect for the ORIGINAL #164 report** — same "reverted to
     pre-cross PN" symptom class: a cross that never cleanly persists (distinct from #164, which proved
     a CLEANLY-persisted cross survives Keep). NEW LEAD this session: **no distinct JS error** in the
     console buffer — the reverts were entangled with the BC sync that fires on cross-apply, so the
     eventual trace targets the **cross-apply → BC-sync interaction**, not the cross logic alone. NOT
     traced yet (observe-only this session per parking discipline); next trace candidate after #165's
     fork is decided. Evidence: `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md` (Side Observations).
     Logged: 2026-06-29 (Marc observe; Freddy disposition; PRJ402096 staging).

173. **OPEN** [LOW-MED — #153 flow, UX + correctness hazard] — Dropping a revised drawing set APPENDS
     pages to the existing set instead of superseding. Observed: dropping 25 revised pages produced a
     50-page package (mixed old + new), forcing the user to manually hand-region ONLY the new pages
     while avoiding the old ones. Correctness hazard: region an old page by mistake and the re-extract
     is corrupted (stale pages feed the reconciliation). Needs its own scoping/Brief on intended
     supersede-vs-append behavior for a drawing REVISION (vs. a deliberate add-pages). Not a quick fix.
     Evidence: `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md` (Side Observations).
     Logged: 2026-06-29 (Marc observe; Freddy disposition; PRJ402096 staging).

174. **OPEN** [LOW — input-tier classifier] — Native vector PDFs misclassified as scanned. PRJ402096's
     FLSmidth drawings are native vector PDFs but were flagged "low-level scanned drawing." Extraction
     accuracy was UNAFFECTED here (benign on this project), but the scan-tier classification gates
     downstream behavior (H5 / region-render / block-gate), so a false "scanned" verdict can degrade
     those paths on other projects. EXPLICITLY NOT linked to the RFQ over-selection (#175) — different
     code path; same project is coincidental. Needs a look at what sets the scanned-vs-native tier and
     why vector PDFs trip it. Logged: 2026-06-29 (Marc observe; Freddy disposition; PRJ402096).

175. **RESOLVED** [v1.21.4 / `f264dabe` — live-verified PRJ402096 2026-06-30] — RFQ
     lead-time visibility: a row missing a FIRM lead time does NOT turn red, so the BOM reads "all good,"
     then the RFQ pulls ~47/64 rows and surprises Jon (bit him last week too). FIX DIRECTION: drive row
     warning-color off the SAME `isFirmLT` predicate the RFQ uses (`leadTimeDays!=null && leadTimeSource
     && leadTimeSource!=="ai"`), so "not red" reliably means "won't be RFQ'd for lead time."
     DESIGN REQUIREMENT (Freddy — NOT an implementation detail): row color and RFQ inclusion MUST share
     ONE predicate / single source of truth so they can never disagree again. "No red ⇒ won't be RFQ'd"
     is a GUARANTEE only if both read the same check. A future session wiring red-row off a DIFFERENT
     lead-time check reintroduces exactly the color/RFQ mismatch that bit Jon twice. Same source of truth
     is the requirement.
     OPEN SUB-DECISION (Jon, at start): full-red vs a DISTINCT lead-time-specific marker so missing-price
     and missing-lead-time are tellable apart. Freddy's lean: same-predicate coloring, distinct marker.
     FIRST ACTION tomorrow = Coach reads what currently drives BOM row color + where to hook lead-time
     state in, then scope.
     ── ROOT CAUSE (confirmed active, runtime-proven, PRJ402096 v1.21.3) ──
     `_eligibilityReason` (app.jsx:6314): the lead-time check (6337–6338) is an INDEPENDENT include-
     trigger — no cooldown gate, no sole-gap guard. `isFirmLT = leadTimeDays!=null && leadTimeSource &&
     leadTimeSource!=="ai"`; any non-firm row returns "missingLeadTime" even with valid current pricing.
     Runtime tally: 36 missingLeadTime pulls — **34 are `leadTimeSource==="ai"`** on otherwise firm +
     current + in-cooldown BC-priced rows; 2 are `leadTimeDays==null`. Clincher: 9342550 (BC-priced, 14d
     old, IN 30-day cooldown) still pulled solely on its AI lead time; control 3044076 (firm `bc_vendor`
     LT) correctly excluded. IMPORTANT: these are AI LEAD-TIME estimates, NOT AI prices — prices are real
     BC prices.
     ── PARKED (do not scope yet) ──
     The RFQ-BREADTH policy question (should a firm-priced, in-cooldown row be RFQ'd just to confirm an
     AI lead time?) is PARKED BEHIND the visibility fix. PARKING REASONING (Freddy — load-bearing): the
     hypothesis is that #175 may DISSOLVE this entirely — once non-firm lead times turn the row RED, the
     RFQ pulling those rows stops being a surprise and may be CORRECT as-is. So #175 must be evaluated
     FIRST, and only if a red BOM STILL leaves Jon unhappy with RFQ breadth do we touch `_eligibilityReason`.
     TRAP TO PREVENT: a future session sees the confirmed root cause at 6337 and "fixes" the predicate
     before the visibility fix is proven insufficient — DON'T. No RFQ predicate change until #175 is
     shipped AND judged insufficient.
     Evidence: runtime capture this session (per-row field values + case-a/b breakdown).
     Logged: 2026-06-29 (Marc runtime-confirm; Coach predicate trace; Freddy disposition).
     ── SHIPPED 2026-06-30, v1.21.4 (`f264dabe`) — FULL RED chosen by Jon ── new `_hasFirmLeadTime(r)`
     helper is the single source of truth; both `_eligibilityReason` (6337) and `_isBomRowFlaggedRed`
     (COND 4) call it. Grep gate: `isFirmLT`=0 hits, `leadTimeSource!=="ai"`=1 hit (the helper def).
     T1–T10 harness 20/20; T9 proves RFQ refactor identical over 36 day×source combos. Plan:
     docs/175-DETAILED-PLAN.md (Coach C120). RESOLVED at close-out 2026-06-30: live visual on PRJ402096
     confirmed AI-lead rows render FULL RED, firm-lead rows stay blue, existing price-reds unchanged.
     RFQ-BREADTH QUESTION — RESOLVED (DISSOLVED) 2026-06-30 by Jon. Disposition: the #175 red-row fix IS
     sufficient; the question dissolves as hypothesized. Firm-priced, in-cooldown rows with AI lead times
     stay RFQ-eligible (lead-time-only, reason "missingLeadTime") and are now VISIBLE via the shared
     `_hasFirmLeadTime` predicate (red row ⇔ lead-time RFQ pull). `_eligibilityReason` is LEFT UNTOUCHED —
     excluding these rows would ship quotes with unconfirmed AI lead times and no prompt to verify them, a
     regression against #175's intent. Three reasons it's coherent, not surprising: (1) SSOT visibility —
     any lead-time pull is red, "not red ⇒ won't be RFQ'd for lead time" holds bidirectionally; (2) targeted
     — `"missingLeadTime"`-only auto-enables the per-vendor "Lead Times Only" checkbox (v1.19.699), so the
     supplier confirms LT only, not re-quoting in-cooldown price; (3) price cooldown still suppresses price
     re-asks. Code grounding: app.jsx:6314 (`_eligibilityReason`), :6337 (LT include), :15747 (`_hasFirmLeadTime`),
     :15792 (red COND 4). Residue tracked separately as #176 (DIN/duct cosmetic over-flag) and #177
     (denylist fail-open) — NOT part of this question.

176. **OPEN** [LOW — cosmetic over-flagging, NOT a guarantee break] — DIN rail / duct rows without a firm
     lead time now turn FULL RED after #175 (shipped v1.21.4, `f264dabe`). These are bulk consumables cut
     from stock — lead time is irrelevant — and the RFQ CORRECTLY excludes them via `RFQ_EXCLUDE_ITEMS`,
     so the #175 guarantee still holds ("not red ⇒ won't be RFQ'd for lead time"); the red is just visual
     noise. FIX DIRECTION (if Jon wants it): either widen `_isExcludedFromPriceCheck` to include DIN
     rail/duct (CAUTION: also changes price-check red behavior — may be undesirable) OR add a separate
     `_isExcludedFromLeadTimeCheck` predicate used only by COND 4. NOT a #175 change. Priority TBD by Jon
     after the live look at PRJ402096. Source: docs/175-DETAILED-PLAN.md §6.
     Logged: 2026-06-30 (Freddy disposition; Marc on #175 ship).

177. **OPEN** [LOW — latent under-flagging hazard; no current trigger] — Firm-lead-time predicate
     `_hasFirmLeadTime` is a DENYLIST (`leadTimeSource!=="ai"`), so any FUTURE non-firm `leadTimeSource`
     value added without updating the predicate is silently treated as FIRM — the row won't turn red and
     won't be RFQ'd for lead time. This is the DANGEROUS (under-flagging) direction, opposite of #176's
     harmless over-flagging. No current trigger — "ai" is the only non-firm source today. FIX DIRECTION
     if ever taken: convert to an ALLOWLIST of known-firm sources (bc_vendor, bc_item, supplier, scraper,
     manual) so a new unknown source defaults to NOT-firm (red + RFQ'd) = fail-safe. NOT a #175/#176
     change. Source: Freddy, #175 ship review.
     Logged: 2026-06-30 (Freddy hazard call; Marc logged on #175 ship).

178. **RESOLVED** [v1.21.6 / `80b863c0` — live-verified PRJ402111] — RFQ pre-fill fix cluster (A/B/C).
     Part A: lead-time-only auto-checkbox decoupled from cooldown-masked eligibility counters via new
     `_hasPrice(r)` BOM-row predicate (non-null AND >0). Part B: `referencePrice` now written to the
     Firestore lineItems payload in ALL modes (was leadTimeOnly-only), gated by `_hasPrice`;
     `referencePriceSource` = real per-row source (NOT hardcoded "bc"). Part C: firm lead times pre-fill
     the portal LT inputs + render in email/PDF (same rule as `_hasFirmLeadTime`). §5 merge: AI extraction
     merges over pre-fills so unmatched rows keep reference values. Plan: docs/178-DETAILED-PLAN.md (Coach
     C124). VERIFIED: harness 20/20 (T1-T3 auto-set bug fix, T9 merge, T7/T8 prefill gate); live on
     PRJ402111 v1.21.7 — T4/T5 (Firestore: referencePrice in normal mode; source mixed bc/ai proving the
     hardcode is gone), T6 (portal price prefill), T8 (ai-LT correctly blank), T9 (merge preserved),
     T11/T12/T13 (email+PDF reference cells populated/blank-gated). 10/10 applicable; T7 N/A (no firm-LT
     rows in test RFQ); T14/T15/T16/T10 code-verified untouched.
     Logged/resolved: 2026-06-30.

179. **RESOLVED** [v1.21.5 / `6036a536` — live-verified PRJ402111] — Supplier portal submit validation
     (A/B/C). Replaced the global lead-time hard gate with per-line completeness, driven by two shared
     validity helpers (`_isValidPrice`/`_isValidLT`) so the submit block (§4, reads post-propagation
     effective) and the red indicators (§3, reads React state) can't drift. Part A removed the false
     rejection (global LT no longer required); Part B added the per-line price+LT block (Cannot-Supply
     exempt); Part C added missing-LT red border+bg+⚠. Plan: docs/179-DETAILED-PLAN.md (Coach).
     VERIFIED: harness 19/19; live on PRJ402111 — 12/12 applicable PASS (T1 global-empty + per-line-filled
     → proceeds = the original complaint fixed; T3/T4/T5 block; T6 CS exempt; T8/T9/T10/T12 visual). T11
     N/A (normal-mode token). NOTE (§5 asymmetry, BY DESIGN): a row can show red yet still submit if the
     global "Fill all" field back-fills it at submit time — "no red ⇒ won't block" holds; the reverse does
     not. Logged/resolved: 2026-06-30.

180. **RESOLVED** [v1.21.7 / `5653ccfa` — live-verified PRJ402111] — Long-lead confirmation modal never
     fired. ROOT CAUSE: the portal submit button used `onClick={handleSubmit}`, so React passed the click
     event as the first arg → `bypassLongLeadCheck=<SyntheticEvent>` (truthy) → `if(!bypassLongLeadCheck)`
     always false → the >60-day check was always skipped. Diagnosed live during #179 T13 (a 70-day LT
     submitted with no modal); traced by Coach C125. FIX: `onClick={()=>handleSubmit()}` @48451 (no arg →
     bypassLongLeadCheck=undefined → check runs). The long-lead modal's own confirm button (48489) keeps
     `handleSubmit(true)` — correct bypass-on-resubmit. VERIFIED live on PRJ402111 v1.21.7: modal FIRES on
     a 70-day row (lists it), "← Go Back & Fix" returns to edit preserving values, ≤60 does NOT over-fire,
     submit proceeds. "Confirm & Submit" modal button code-verified. CAUTION (→ COACH.md lesson): an
     advisory review called this fix a "no-op" without tracing handleSubmit's signature — it is NOT.
     Logged/resolved: 2026-06-30.

181. **RESOLVED** [v1.21.9 / `4175ecbd` — HIGH; silent loss of manually-entered customer data, deterministic
     on cross-project nav] — DISCRIMINATOR: `extractionReport` presence (Jon's decision; Coach v1.19.618
     origin trace). FIX: both v1.19.618 mechanisms gated on `extractionReport` so the stale-title cleanup
     fires ONLY on extraction-origin panels and never wipes manual-entry lines. §1 Mechanism 2 +
     `if(!panel.extractionReport)return;` @23528; §2 Mechanism 1 `_titleStale = …===0 && !!panel.extractionReport`
     @23614; §3 comment rewrites (corrected the FALSE deleted-drawing story — `removePage` cascaded drawingNo
     since v1.10.19; real vector = pre-v1.19.738 saves wiping pages but keeping title). Resolution values /
     cleanup body unchanged. Plan: docs/181-DETAILED-PLAN.md (Coach). Diagnostic: docs/181-MANUAL-LINE-DATALOSS-DIAGNOSTIC.md.
     VERIFIED: PRESERVE (the fix's job) live-confirmed on real opens — Jon's PRJ402100 cross-project-nav repro
     + PRJ402124 opened under v1.21.9 with zero [TITLE BLOCK] events, manual lines retained. STILL-CLEANS (T3)
     code-reasoned (additive early-return; extraction-origin path byte-identical) + Coach diff-verify. T4
     code-reasoned (_titleClearRan untouched). T5 grep PASS (1 def + 3 uses). T3 synthetic-live noted INFEASIBLE
     (access boundary: page can only write legacy users/{uid}/projects, which the app doesn't render; live
     company source rules-blocked) — do NOT retry. Legacy coverage floors at v1.19.598 (extractionReport intro);
     pre-field-era extraction panels (2026-03-04→04-21) skipped = cosmetic miss only.
     DATA-LOSS DISPOSITION (FINAL, Jon-confirmed under v1.21.9): No production data loss occurred — fix shipped
     before any real wipe; PRJ402124 lines 1-3 and PRJ402126 confirmed RETAINED by Jon. Rated HIGH because the
     mechanism COULD have caused unrecoverable loss (overwrote title fields with "" + immediate Firestore save);
     in this instance nothing was lost.
     ── ORIGINAL FINDING (as logged 2026-06-30, pre-fix) ──
     Manual DWG#/REV/DESCRIPTION on a drawing-less line is WIPED from React state + Firestore on PanelCard
     remount. CONFIRMED ACTIVE via Jon's live repro (PRJ402100): drawing-less line + manual title fields →
     leave → return IMMEDIATELY = data survives; same line → open a DIFFERENT project → return = data GONE.
     TRIGGER is PanelCard UNMOUNT/REMOUNT (forced by cross-project navigation), NOT project re-open per se —
     this is why field reports (PRJ402124 lines 1-3, PRJ402126 all lines) looked "intermittent" (it's
     navigation-pattern dependent, deterministic per pattern).
     MECHANISM (Coach path map, code-grounded): both carry DECISION(v1.19.618), intended to scrub STALE
     title blocks left after drawing deletion. (1) State init `_titleStale=pages.length===0` forces draft
     inputs to "" regardless of stored values (app.jsx:23613-23616). (2) useEffect `_titleClearRan`
     (app.jsx:23524-23534): on mount, if pages=[] AND any of drawingNo/Desc/Rev populated → writes "" to all
     three + onSaveImmediate to Firestore. `_titleClearRan` is a useRef per instance — survives "return
     immediately" (same mount) but RESETS on real unmount → remount re-fires the wipe. Console signal:
     `[TITLE BLOCK] Cleared stale drawingNo/Desc/Rev on panel with no drawings: <name>`.
     ROOT FLAW: v1.19.618 conflates "stale title block (drawings deleted)" with "legitimate drawing-less
     manual line (valid customer data)" — both are pages.length===0 — and destroys the latter.
     NO FIX YET — fix design GATED behind Coach's v1.19.618 origin trace (the discriminator question: how
     to tell a stale title block from a legitimate drawing-less manual line; is there a signal/flag?).
     ⚠ REGRESSION-TEST SPEC (trap-prevention): the fix MUST be verified with the CROSS-PROJECT-NAVIGATION
     sequence (drawing-less manual line → open a DIFFERENT project → return → data must survive). Do NOT
     verify with "leave and return immediately" — that path PASSES on the broken build (no unmount, no
     re-fire) and gives a FALSE all-clear.
     Diagnostic doc: docs/181-MANUAL-LINE-DATALOSS-DIAGNOSTIC.md.
     Logged: 2026-06-30 (Coach mechanism trace; Jon runtime repro; Freddy analysis; Marc writeup).

182. **RESOLVED** [v1.21.11 `7cf55a82` — Item Vendor EntityWithSameKeyExists on Push-to-BC · T3 VERIFIED LIVE
     2026-07-01: 32 collisions → 0] — Push to BC
     returned 0 created / 0 updated / 32 failed, all 400 Internal_EntityWithSameKeyExists on Item Vendor
     (PRJ402124). ROOT CAUSE (Marc trace `f26ea671` + Coach probe): `bcUpsertItemVendorLeadTime` IS an upsert
     (existence GET @4440) but the PATCH used a 2-part compound key (Item_No, Vendor_No) while BC $metadata
     declares a 3-PART key (Item_No, Vendor_No, Variant_Code) → PATCH 404 → the 404→POST fallthrough nulled
     existingRec → re-POST → 400 collision. One shared write fn, multiple triggers (push button + batched
     flush + portal Apply) — NOT two paths; prior creation = earlier successful POST of the same fn.
     FIX (v1.21.11 / `7cf55a82`): §1 add Variant_Code to GET $select; §2 build 3-part PATCH key URL (vc from
     existingRec, '→'' + encodeURIComponent — probe Test A confirmed 200); §3 DELETE the 404→POST fallthrough
     (PATCH failure now surfaces as auditEntry.error, no silent re-POST); §4 comment updates. GET $filter, POST
     body, fn signature, 4 callers, odataId fallback, audit structure UNTOUCHED. Plan: docs/182-DETAILED-PLAN.md;
     trace: docs/182-ITEMVENDOR-POST-VS-PATCH-TRACE.md; probe: docs/182-bc-probe.js.
     MARC CHECKS PASS: T6 grep (0 "PATCH 404"), 3-part key + vc + $select in deployed bundle, JSX OK, logic
     (PATCH fail → error, no re-POST). T5 code-reasoned (all 476 records single-variant, 0 non-empty
     Variant_Code verified live → vc='' probe-confirmed 200 case; non-empty handled by construction).
     ⚠ NOT FULLY CLOSED — T3 NOT RUN (Jon left before the live Push-to-BC test). FIRST ACTION NEXT SESSION:
     Push to BC on PRJ402124 once → confirm the 0/0/32 EntityWithSameKeyExists alert is GONE (values are
     locked/unchanged, so a clean no-op-200 / updates result = PASS; still-collides = do NOT close — investigate
     or roll back v1.21.11). A PATCH can 200 and no-op — if a value is changed first, eyeball the persisted
     Lead_Time_Calculation in BC.
     Logged: 2026-06-30 (Marc trace; Coach plan+probe; Freddy routing). Fix deployed v1.21.11 (unverified).

183. **RESOLVED** [v1.21.10 / `5043fd1c` — RFQ email recipient field infinite-loop freeze] — The RfqEmailModal
     recipient <textarea> applied a non-identity value transform (";"→";\n" on display, "\n"→"; " on change)
     that self-fed the onChange under React 18 createRoot + Windows \r\n normalization: semicolons grew every
     cycle, synchronous full main-thread freeze. FIX (Option A, docs/183-DETAILED-PLAN.md): REMOVED both
     transforms — plain controlled textarea, RAW newline-delimited state; normalize to "; " ONLY at consumption
     boundaries (new `_normalizeEmails` helper at send/Firestore write); seed normalizer ";"→"\n" at load (§2);
     contacts dropdown appends "\n" + newline-aware dedup (§3); row-count splits on \n (§5). Inverse-check
     confirmed lossless (write "; " ↔ load /;\s*/→\n round-trip). VERIFIED: Marc 10/10 unit tests + T8 grep
     (0 residual transforms); Jon live-confirmed T1 (freeze gone), T2 (one-per-line), T5 (append on empty field).
     NOTE — the "T5 regression" scare was NOT a bug: the dropdown correctly de-dupes contacts already in the
     field, and every seeded vendor's dropdown offers only already-present contacts (saved defaults seed all).
     Marc live-proved append works (Royal/ryan synthetic + real keyboard select); NO handler edit made
     (correctly — editing working code would risk regressing the freeze fix).
     Logged/resolved: 2026-06-30 (Coach trace+plan; Marc impl+verify; Jon live confirm; Freddy routing).

184. **OPEN** [LOW — candidate follow-up, adjacent to #182, NOT causal] — Push concurrency / Firestore
     "resource-exhausted / Write stream exhausted" under a broad Push to BC. `bcUpsertItemVendorLeadTime`
     writes a companies/{cid}/bcLeadTimeWrites audit entry PER ROW (~app.jsx:4508), and a broad push fires
     concurrent bcPatchLaborPlanningLines / bcPatchProgressBilling PATCHes + panel saves — a write burst that
     trips Firestore throttling (seen live 2026-06-30 23:07 on PRJ402124 during the #182 push). Adjacent to
     #182 (surfaced during that trace) but NOT the cause of the 32 collisions. FIX DIRECTION (if taken):
     batch/debounce the per-row audit writes, add a BC-call concurrency cap + backoff. Logged: 2026-06-30 (Marc).

185. **OPEN** [LOW — UX papercut + data cleanup, candidate] — Send RFQ Contacts dropdown looks inert: because
     saved defaults seed ALL of a vendor's BC contacts into the recipient field, every contact the 📇 Contacts
     dropdown offers is already present → clicking correctly de-dupes → nothing visibly happens. NOT a defect
     (append works; proven live under #183). FIX DIRECTION: hide already-present contacts from the dropdown, or
     add an "already added" affordance. RELATED DATA ARTIFACT (cleanup candidate): some saved defaults store
     duplicate emails (e.g. InterMtn = "boyd\nkevin\nkevin") — the current dedup blocks NEW dups but doesn't
     scrub existing storage; a one-time normalize-on-load-and-resave would clean them. Logged: 2026-06-30 (Marc, #183 T5 investigation).
186. **RESOLVED** [v1.21.12 / `f87a40f0` (fix) · release `3d67163b` — locked-quote BC price-check nag] — Opening a
     sent/locked quote (`quoteLocked` → "LOCKED REV NN" pill) fired the "💲 BC Purchase Price Updates" modal
     (`PurchasePriceCheckModal`) on project open + a 30s poll; both Accept AND Dismiss then wrote the frozen quoted
     BOM (Accept overwrote `unitPrice`/`priceDate`/`bcPoDate`+`priceSource:'bc'`; Dismiss stamped
     `bcPriceCheckDismissed`). ROOT CAUSE: the price-check `useEffect` `tryCheck` (src/app.jsx ~36532) had NO
     frozen-quote gate. FIX (Coach C126, Freddy-assigned): added `if(_fp.quoteLocked||_fp.wonAt||_fp.lostAt)return;`
     BEFORE `priceCheckRan` is set (so an in-session unlock re-enables the check on the next poll). `quoteLocked`
     (live frozen field, cleared at unlock) NOT `quoteSentAt` (set-once → would suppress through the whole revision
     window). Only gates whether the check RUNS — no pricing data / modal handlers / thresholds / BC logic changed.
     KNOWN ACCEPTED LIMITATION: an ECO edit can leave `quoteLocked` stale-true, keeping the check suppressed during
     the ECO window (not handled). VERIFY: T1 PASS (live, decisive — PRJ402089 `quoteLocked:true`, 11 real BC diffs,
     no modal), T2 PASS (runtime+code — non-frozen still fires), T3/T4 PASS (code-reasoned — unlock re-enables /
     won-lost suppressed), T5 PASS (grep). Docs: docs/186-LOCKED-QUOTE-PRICECHECK-review.md.
     **POST-SEND EXPOSURE (read-only spot-check, C127 follow-up):** found 5 candidate projects / 35 rows across 84
     real projects (113 docs incl. ~29 `arc-` stubs; 15 frozen). Only **PRJ402091** (OVIVO, Rev 3, 11 rows,
     ~$764 affected-row cost) is real customer-facing; the rest are internal (`noah@matrixpci.com`) or an unsent
     in-progress revision (PRJ402092, Rev 4 > sentRev 3). Exact sell shift UNRECOVERABLE (Accept overwrote
     `unitPrice` with no prior-value field; only `lastQuoteHash`, non-invertible). Count is a proxy — `priceSource:'bc'`
     + post-send date can't be cleanly separated from legit refresh-pricing; the modal-Accept bug is a subset.
     **DISPOSITION: log, no action (Jon, 2026-07-01)** — exposure too small/uncertain, v1.21.12 prevents recurrence;
     no remediation, no data correction, no customer contact. Diagnostic: docs/186-POST-SEND-REPRICE-DIAGNOSTIC.md.
187. **RESOLVED** [v1.21.13→v1.21.18 — quote-validity cascade + valid-until relocation + PDF right-justify] —
     Four-tier cascade (quote-edit → project → customer → global default 30d), single-source `project.quoteExpiresAt`
     drives the printed "PRICES VALID UNTIL" date AND the #186 expiry gate. Phase 1 (global+project+quote-edit+expiry
     gate) v1.21.13 `543e1700`; Phase 2 (customer tier `customerDefaults/{bcCustomerNumber}` + admin CRUD +
     firestore.rules) v1.21.14 `ee085025`. Relocation: combined "{BUDGETARY - }Prices Valid Until <date>" row under
     Total — fixed doubling + PDF page-orphan (v1.21.18 `da6b9da2`), on-screen right-justified (v1.21.16/17), PDF
     right-aligned at bx+bw-2 (v1.21.18). Plans: docs/187-DETAILED-PLAN.md, docs/187-VALID-UNTIL-RELOCATION-TRACE.md,
     docs/187-RELOCATION-FIX-LOCATE.md, docs/187-RIGHT-JUSTIFY-COMPUTED-TRACE.md.
188. **OPEN** [MED — stale/phantom bcVendorNo sent to BC on Push Lead Times; plan APPROVED, build not started] —
     PRJ402124 rows SY50M-26-1A / SY5100-5U1 push vendor V00102 (nonexistent in BC; correct = V00111 SMCUSA). ROOT
     CAUSE: `bcVendorNo` cached at pricing time (runPricingOnPanel ~app.jsx:15064), never revalidated; BC renumbered
     SMCUSA V00102→V00111 after caching; pushAllLeadTimesToBc sends the stored value verbatim. FIX (two-tier
     validate-at-push, #184-safe: Tier1 free cached-name check, Tier2 live re-resolve only on dead vendors, deduped;
     self-heals via resolvedExtra). KNOWN LIMITATION: renumber-to-live-DIFFERENT-vendor silent (per-row live compare
     declined to protect #184). Heals PRJ402124 on next push. Traces: docs/188-VENDOR-NO-STALE-TRACE.md,
     docs/188-VENDOR-PROVENANCE-TRACE.md; plan: docs/188-VALIDATE-AT-PUSH-PLAN.md.
189. **RESOLVED** [not a defect] — Global default `quoteValidityDays` "won't persist" = Jon hadn't clicked "Save
     Defaults" (button reads like a reset). Read-only runtime trace confirmed bundle/path/write all correct. Relabel
     → #190. Trace: docs/189-GLOBAL-DEFAULT-ROUNDTRIP-TRACE.md.
190. **RESOLVED** [shipped v1.23.2, 2026-07-07 · release `9d89f26b` · quick-win batch] — Config modal's "Save Defaults"
     button renamed to "Save". Marc behaviorally confirmed save() commits the FULL modal (savePricingConfig + saveDefaultBomItems + saveLaborRates), not just defaults. From #189.
191. **RESOLVED** [v1.21.20 `896c2e6e` + v1.21.22 `6ed639b5` — quote # missing from sent PDF/filename/subject] —
     Quote # was assigned only by View/Print + Copy, never by the send paths → sending without viewing first
     produced a blank quote # (PDF), "Quote" (filename), "Quote Quote" (subject). FIX: new idempotent
     `ensureQuoteNumber`; ALL 4 quote-PDF paths assign BEFORE build (Print/GenPDF soft-fail warn+proceed; modal-send
     + inline-send hard-fail); subject recompute ("Quote Quote"→"Quote <n>"); #187 stamp ordering preserved.
     Backfilled PRJ402119→MTX-Q202030, PRJ402118→MTX-Q202031. Noah confirms send-flow (backstop, not gate).
     Trace/plan/verify: docs/191-QUOTE-NUMBER-MISSING-TRACE.md, docs/191-QUOTE-NUMBER-FIX-PLAN.md, docs/191-FIX-VERIFICATION.md.
192. **OPEN — 🔴 REGRESSION (TOP PRIORITY next session)** [widen shipped v1.21.19 `a30d975c`; regression followed] —
     WIDEN (DONE): BUDGETARY auto-setter widened from `leadTimeSource==="ai"` to the full red-row predicate
     `_isBomRowFlaggedRed` across 14 sites (any red row → auto-budgetary). REGRESSION: the auto-revert CLEARS
     BUDGETARY on red-row projects on OPEN (Noah watched it uncheck). Mechanism strong-inferred (NOT directly
     observed): background reprice on open transiently drives all-non-red ≥600ms → `_hasRedRows(latest)` false at the
     debounced fire (~app.jsx:37246) → false "Remove Budgetary?" dialog. INSTRUMENTATION LIVE (v1.21.21 `e8b01526`,
     "[#192 REVERT-FIRE]" log at the fire point — the log appearing AT ALL confirms the transient). Awaiting Noah's
     intermittent repro w/ console open. FIX DIRECTION: don't auto-revert on the initial-open/bg-reprice re-fire;
     require a STABLE clean state (re-check after settle) before prompting. STRIP instrumentation (tagged "#192 TEMP
     INSTRUMENTATION") after fix. Traces: docs/192-ISBUDGETARY-AUTO-SET-TRACE.md, docs/192-BUDGETARY-REVERT-REGRESSION-TRACE.md.
     **FIX FIRMED (Freddy, `docs/192-FREDDY-FIX-BRIEF.md`, 2026-07-07):** harden the auto-revert fire path (37586-37630) with TWO correct-by-construction gates before the destructive "Remove Budgetary?" prompt — **Gate 1 SETTLED** (bail if a bg reprice is in-flight for the project; the `_bgTasks` signal is already read by the instrumentation @37605) + **Gate 2 STABLE** (re-confirm `_hasRedRows` false after a ~500ms settle; a mid-reprice transient won't survive). Both only ADD conditions to a destructive auto-action → can't regress the legit path. **DECISION (Jon, 2026-07-07): (A) SHIP-NOW APPROVED** — build the two-gate fix without waiting for a repro (correct-by-construction, LOW-risk, observed-active); keep instrumentation 1 cycle to confirm the false fire stops, then strip. **BUILD ORDER: slot NEXT after G005 Phase 1** (top-priority observed regression → ahead of the feature clusters). Coach/Marc confirm the open-reprice registers in `_bgTasks` at build (else Gate 2 carries it). → Coach quick-review the two-gate diff → Jon deploy checkpoint.
193. **DONE-PENDING-VERIFY** [v1.21.23 `39c8d6ac` — Send-To-Sales tab] — QuoteSendModal defaults to a new
     📩 Send To Sales tab (recipient pre-fills the current user's OWN email, editable); 3-tab bar (Sales/New/Reply)
     swaps the recipient on tab switch (Sales→own email, New→stashed customer email, Reply→thread). Real-send
     semantics apply (handleSend is mode-agnostic → sendGraphEmail); writes a `quote_send` entry to
     `project.qvHistory[]` (feeds #194). Dead inline-send log skipped (amendment B). NEEDS Jon verify + Coach verify.
     VERIFY = "pass" looks like: modal opens defaulting to Send To Sales; recipient = logged-in user's own email,
     editable; tab-switch swaps recipient (Sales↔customer via stashed `_customerTo`); a sales-send is a REAL send
     (locks + #187 stamps + #191 quote # + writes `quote_send` to qvHistory[]). ACCEPTED QUIRK (not a bug, do not
     re-raise): on a Send-To-Sales the body may still read "Dear [customer]" though it goes to the sales user —
     fine (user forwards/saves). Plan: docs/193-SEND-TO-SALES-BUILD-PLAN.md; supplement: docs/193-SEND-TO-SALES-SUPPLEMENT.md.
194. **OPEN** [feature placeholder — global ARC email/metrics + click-tracing] — #193's per-send `quote_send`
     qvHistory log is the first data feed. Needs a Brief.
195. **RESOLVED** [shipped v1.23.2, 2026-07-07 · release `9d89f26b` · quick-win batch] — Print-as-Firm: on an admin
     override of the budgetary flip (`_skipBudgFlip=true`), the pre-print checklist no longer shows the false
     "auto-flagged BUDGETARY" entry. FIX: hoisted `_skipBudgFlip` out of the red-rows if-block (was block-scoped, invisible to the checklist) + guarded the entry with `&&!_skipBudgFlip`.
196. **OPEN** [LOW — latent, not a regression] — the locked-quote overlay covers the Receive PO button; a lock
     shouldn't gate FORWARD workflow (PO receipt). Workaround: unlock. Trace not run. Fix intent: lock gates edits,
     not forward steps like PO receipt.
197. **OPEN** [MED — ship-date on PO Received modal + mismatch messaging] — ANCHOR (decided): estimated ship date =
     PO received date + lead time. RATIONALE: the lead-time clock industrially starts at ORDER PLACEMENT (PO
     received), not quote date. DEEPER FINDING: ARC does NOT compute a calendar ship date at all today — only a
     lead-time DURATION (days); #197 must CREATE the date calc. PO date is MANUALLY ENTERED in the Receive PO modal
     (structured → auto-compare feasible). On mismatch: OA message "PO date ≠ Quoted Ship Date, Quoted applies" +
     request updated PO. PREREQ: Coach reads the lead-time formula → Brief → build.
198. **OPEN** [MED — Client Review has no completion/approval step; project stuck edits-locked] — (renumbered from
     #191 to resolve a collision with the Quote#-missing work; content unchanged.) After a Client Review there is no
     "Approval" action, so the project STUCKs on "Client Review In Progress — Edits Locked" with no way to
     complete/reset it. Add a client-facing "Approved" button that clears the edits-lock and advances state.
     Investigate `onCustomerReviewSubmitted` / engineering review module + the review-lock state. Reported by Jon 2026-07-01.

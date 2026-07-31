# Full Tracker Grading — 2026-07-31 (for Jon's review)

Every tracker item, graded by 3 parallel lanes. Rubric: **CRITICAL** = wrong quote/price/PO to a customer, data loss/corruption, security, or hard-block a core workflow · **HIGH** = significant functional/safety · **MED** = functional w/ workaround or notable UX · **LOW** = cosmetic/tuning. Re-graded on merits (not existing tags). Full critical write-up: `CRITICAL-AUDIT-2026-07-31.md`.

> **Reading guide:** OPEN items graded MED+ are the decision set (below, in full). Resolved/shipped/low are rolled up at the bottom. **★ = SLIPPED** (open High/Critical that was deprioritized).
>
> ⚠ **VERIFICATION CAVEAT (2026-07-31):** the grades were assigned from the tracker's stated status, which is UNRELIABLE — several "open/slipped" items were already fixed but never marked RESOLVED. Code-verified already-shipped (removed from open): **B035, B036, B021** (`1160f508`/`b8610a1b`), **B041** (`b1a92a79`, v1.23.19). Reclassified: **#192** fix is NOT firmed (trace offers 3 options, mechanism unreproduced) → Tier-B decision, not ship-ready. A code-verification pass over the remaining criticals (legacy #80/#119/#99/#60/#159/#198/#188 + B065/B016/B013 + F048/F049/F050/F070/F069/F019/F014) is in progress to separate genuinely-open from already-fixed-but-unmarked before any build.

---

## OPEN — CRITICAL

| ID | Title | Status detail | ★ |
|----|-------|---------------|---|
| F048 | Lock sent BOM + kill auto-repricing on it | Incident "#1 fix"; filed, never built. BC price-check-on-open still live | ★ |
| F050 | Plausibility/magnitude send-block ($12-vs-$6000) | Only catcher for bad-magnitude BC price; sweep on Test, gate not in prod | ★ |
| F070 | Continuous ARC↔BC mismatch detector | "Centerpiece ask"; ~80% built, unshipped | ★ |
| B065 | Positional BC bindings → wrong line PATCH + tail delete | Ph1 DELETE-guard shipped v1.24.40; durable-binding Ph2 deferred; PRJ402141 pending | ★ |
| B016 | Silent BC write-race (edits revert, deletes don't stick) | Safe half shipped v1.24.42; await/confirm core deferred pending Jon | ★ |
| #80 | Re-extract PN-only dedup merges distinct line items → dropped rows | Same class as fixed #79; never fixed | ★ |
| #119 | Legacy panels bypass ALL Phase-1 extraction safety nets | Silent 0/wrong BOM quotable | ★ |
| #192 | BUDGETARY flag cleared on open (fire-time transient) | ⚠ fix NOT firmed — trace offers 3 options, mechanism unreproduced. Needs your approach + likely instrument-to-repro | ★ |

## OPEN — HIGH

| ID | Title | Status detail | ★ |
|----|-------|---------------|---|
| F049 | Snapshot-at-send + PO-receipt reconcile | Makes post-send drift detectable; filed only | ★ |
| F014 | Customer payment-terms note on every quote + BC field | You tagged ★CRITICAL "top of queue"; Backlog | ★ |
| F019 | Background Get-New-Pricing silently killed on nav-away | Writeback never lands, no signal → stale prices | ★ |
| F051 / F052 | Send-time freshness gate / expired-quote PO handling | Filed, unbuilt (F051j cleanup ≠ the gate) | ★ |
| F069 | Hard-block BC op when env ≠ Settings env | Open/unscoped | ★ |
| B013 | ~7 raw BC helpers bypass health gate → silent 401s | Diagnosed 2026-07-22; G1 build awaiting your greenlight | ★ |
| ~~B021~~ | BC fetch no timeout/abort | ✅ **ALREADY SHIPPED** `b8610a1b` — code-verified 2026-07-31 (stale tracker status) | — |
| ~~B035~~ | Send-block ignores $0 service cards | ✅ **ALREADY SHIPPED** `1160f508` — code-verified 2026-07-31 | — |
| ~~B036~~ | quoteSent* preserve-guards | ✅ **ALREADY SHIPPED** `1160f508` — code-verified 2026-07-31 | — |
| #99 | Model partial-read drops half a long BOM → under-quote | Interim warn (#100) misses clean bottom-truncation | ★ |
| #83 / #81 | No fail-loud on fallback / no extraction-anomaly warning | H5 cut frequency; safety surface still absent | ★(mit) |
| #60 | 8 latent identifier-scope bugs that crash at runtime | tools/check-scope.js KNOWN_VIOLATIONS | ★ |
| #159 | Copy-to-New-Quote strands projects customerless | Unrecoverable | ★ |
| #198 | Client Review has no completion step → stuck locked | Workflow hard-block | ★ |
| #188 | Stale bcVendorNo pushes LT to dead BC vendor V00102 | Plan approved, not built | ~ |
| G005-Ph2 | matrix-arc-test still shares PROD Firestore | Ph1 (BC/email harm) closed; data-collision remains | phased |
| B064 | Silent BC-failure surfacing (3 remaining layers) | Aggregator shipped v1.24.41; skeleton/DELETE/queue-drop layers open | roadmap |
| B011 | Latent supplierQuotes undefined-field crash at 5 sites | B010 class; fix-helper misuse can corrupt Date/Map | ~ |

## OPEN — MED (functional w/ workaround, or notable UX)

Bugs: B008 (RFQ-history link opens pre-submission state) · B014 (Codale multi-result parse gap; scrapers off) · B015 (remote-lock reactivity/orphans) · B017 (special-char PN 400s BC lookup) · B020 (BC PP modal re-prompts every open) · B022 (Continue-with-Microsoft misleads existing users) · B024 (reviewer-assignment notification brittle BC-email) · B025 (marked-for-review rows lose checkbox) · B026 (can't start 2nd tech-review) · B027 (revision history drops reviewer notes) · B031 (silent price-clear — against design, needs your behavior pick) · B044 (red projects shown in READY column — presentational) · B059 (archive counters undercount) · B066 (scanned drawings don't auto-attach to BC; manual works) · B068 (hash gap, dormant) · B071 (Auto-Assign not picking Primary — needs repro) · B072 (Item Browser preview accuracy) · B074 (DigiKey stock-status→LT) · B076 (DigiKey RFQ email UI).
Features: F010 (multi-ALT alternates) · F012 (sort BOM by column) · F013 (reviewer full control + takeover) · F016 (REJECTED REVIEW column) · F017/F018 (per-row reviewer/owner notes) · F029 (Outlook A/B/C phases) · F034/F035/F036/F040 (markup epic — F035/F040 engineer-prioritized MED-HIGH) · F059 (Mark-Committed, parked) · F062 (RFQs-to-Accept flip) · F073 (per-panel BC tasks) · F074 (createMissingBcItems — built, dry-run green, awaiting deploy) · F076 (portal manual entry, parked) · F078 (API-on-extraction — cost-gated build) · F080 (RS-Online source) · F081 (per-discipline lines) · F082 (dash-agnostic matching, MED-HIGH).
General: G008 (test CORS allowlist) · G009 (test build versioning) · G014 (markup-list spacing) · G015 (ribbon — shipped v1.24.63).
Legacy (BC/data-integrity cluster): #62 · #64 · #65 · #66 · #71 · #73 · #85 · #87 · #88/#91/#92 · #100 · #131 · #153 · #165B · #172 · #173 · #29 · #53 · #54 · #56 · #26 · #15.

## OPEN — LOW (cosmetic / tuning / infra-hygiene)
B005, B028(tabled), B029, B030, B037, B039, B068, B069(tabled), B073 · G007(shipped v1.24.63), G011 · F004, F006, F007, F008(~90% built), F009, F015, F043(Test), F079 · M001 · legacy #6,7,10,13,20,23,27,30,36,52,59,63,67,68,69,70,72,90,93,102,115,116,118,127,128(tabled),129,130,132,140,142(tabled),148*,149,150,151,152,154,157,161,162,166,170,171,174,176,177,184,185,196,197 · T1,T3–T9.
> ⚠ **#148** (dormant security) — reviewUploads permanent unrevokable Storage URLs; safe only because the review portal isn't built; MUST fix when it ships.

## RESOLVED / SHIPPED (rolled up — done, not for review)
Bugs: B001,B002,B003,B004,B006,B007,B010,B012(core),B018,B023,B032,B033,B034,B038,B040,B042,B043,B045,B046,B047,B048,B049,B050,B051,B058,B060,B061,B062,B063,B067,B070(v1.24.62 today). B041 (v1.23.19 — shipped, grading's "confirm deploy" resolved). F039,B019,G007,G015 shipped v1.24.63 today.
Features: F001,F002,F003,F005,F011,F020,F021,F022,F024,F025,F026,F027,F028,F030,F031,F032,F033,F042,F044,F045,F046,F047,F057,F058,F060,F061,F063,F064,F065,F066,F067,F068,F071,F072,F075,F077. (F029 slice-1 shipped.)
General: G006,G010,G012,G013,G019,G020,G021.
Legacy: ~90 #N items resolved/shipped across Rounds 1–18 (incl. #86 the CRITICAL cross-project contamination, #79, #158, #175/#178/#179 predicates). Unallocated gaps: B052–B057, F053–F056 (never filed).

## In-flight TODAY (not in the above open counts)
- bcFuzzy Fix 1 + NIT-1 → **Test V.081** (awaiting Jon verify) — the money-path match fix for Vendor_Item_No parts (800F-34RE100).
- Tier-A criticals **B035 / B036 / B021** — building now (→ Coach → Test → your verify).
- Secondary-vendor RFQ (F-scope) — scope settled, build-ready.
- B070 backfill — 4 draft projects / 14 rows, recoverable, queued.

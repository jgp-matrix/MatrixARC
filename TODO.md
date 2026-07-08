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

### 🐛 Bugs (B###)
- **B010 — "Manual 'Upload Supplier Quote' throws on drop (undefined field → Firestore reject)"** [RESOLVED — shipped v1.23.1, 2026-07-07 · release `6e82ea5e` (fix `b3f79473`)] — manual upload crashed on drop (`Unsupported field value: undefined` → import aborted). FIX: `_nullifyUndefined` helper + `??null` coercions in both BC-match branches + belt on the @31669 update payload (undefined→null, no field removal/rename — data-retention preserved). Re-test PASSED live (Jon, PRJ402096: drop → no crash → price-review UI; runtime artifact); Coach-approved data-safe; prod-verified probe-free.
- **B011 — "Harden other supplierQuotes update sites vs undefined fields (same class as B010)"** [Backlog] — the undefined-field Firestore-reject risk B010 fixes at `saveAndMatch` @31669 also lurks at other `supplierQuotes` update sites: **31270 / 31306 / 31619 / 31966 / 32109**. The new module helper `_nullifyUndefined` (recursive undefined→null, added in B010) is available to harden them. Proactive/latent — do before those paths hit an undefined in the wild. **⚠ CAVEAT (Coach B010 review): `_nullifyUndefined` rebuilds any NON-plain object (Date/Map/class instance) as a plain object → would CORRUPT it. Safe on plain line-item data; before reusing it at a site whose payload may carry Date/typed instances, guard the type or use a shallow/typed strip instead.** *(source: Marc B010 follow-up + Coach caveat, 2026-07-07.)* — manual Upload Supplier Quote crashes on file drop: `DocumentReference.update() … Unsupported field value: undefined (supplierQuotes/<id>)` → import aborts, never reaches review (reproduced 2× on test). ROOT CAUSE (Marc, `docs/B009-MARC-REPRO-NOTES.md` 01c2d951): `saveAndMatch` @31669 `update({lineItems:matched,…})` — the BC-match branches (31664 / 31658-60) write `bc.id`/`bc.displayName`/`bc.unitCost` onto line items; any is `undefined` when the BC item lacks it → Firestore rejects. FIX (data-safe, small, GATED): coerce those to null/'' (`bc.unitCost??null` etc.) and/or strip-undefined before the @31669 update. *(source: Marc B009 repro, 2026-07-07; Jon routed to Freddy.)*
- **B001 — "Auth redirect URI carries a trailing dot"** [Backlog · LOW] — a trailing-dot ARC URL (`matrix-arc.web.app.`) makes `window.location.origin` carry the dot into the OAuth redirect URI → Azure AADSTS50011 redirect-mismatch → BC/Microsoft sign-in fails cryptically. NOT a code bug (URL-entry artifact; clean-reload at the no-dot URL fixes it — confirmed live 2026-07-02). Hardening: strip a trailing dot from the origin when building the auth redirect URI. *(source: Jon 2026-07-02, resolved live.)*
- **B002 — "Approved-state TR block message names an absent button"** [Backlog · LOW] — on a post-approval re-arm (#199 Tech-Review), the send-block message says "Click Send for Technical Review" but that button isn't rendered in the approved state (reviewer per-row Resolve still works — NO hard dead-end). Fix: state-aware block message when approved ("have an engineer Resolve the flagged line(s)"), or a re-submit affordance by the approved banner. *(source: Coach #199 P3 verify, 2026-07-02.)*
- **B003 — "Review Supplier Quote modal lists unquoted parts"** [Backlog] — on the Review Supplier Quote modal, parts the supplier did NOT quote should be hidden (show only quoted lines) — declutter. Likely a UI refinement rather than a defect. *(source: Jon 2026-07-02, via Intake.)*
- **B004 — "Portal Apply save is unawaited → reload-race"** [RESOLVED — `41824f6c`, shipped v1.21.25] — `doApplyPortalPrices` persisted via a fire-and-forget `safeSave`, so an immediate post-apply reload could beat the write and revert cross+flag+prices together. Fix: `await safeSave` @app.jsx:38302. Pre-existing since v1.19.722 (affects all portal-apply data, not #199-specific); surfaced during the #199 live pass, fixed + Coach-signed-off (`41ddfc28`), shipped with #199. *(source: Coach #199 persist verify, 2026-07-03.)*
- **B005 — "Resolved TR row can't be manually re-armed"** [Backlog · LOW] — a resolved Tech-Review row's checkbox is read-only, so a purely manual PN edit doesn't re-arm review and it can't be manually re-flagged. Outside the supplier-substitution risk TR targets (a supplier re-cross DOES auto-re-arm @38978); defer to broader TR-tuning. *(source: Coach #199 live pass, 2026-07-03.)*
- **B006 — "Scan Results 'concern' window is persistent with no relevant data"** [RESOLVED — shipped v1.22.2, 2026-07-06 · release `5cb5c392` (build `ab7c2309`)] — the `ScanResultsBanner` (app.jsx:23117) already hides at 0 concerns but was dominated by benign auto-fixed INFO concerns (OCR-merged / audit-corrected / auto-retry), so a clean scan still showed the bar. FIX: added a **"Dismiss" ✕** — option B (per-project dismiss-by-report): ✕ persists the dismissed report's identity + save; a NEW extraction auto-resurfaces it. *(source: Jon 2026-07-06.)*
- **B007 — "TR checkbox reads dim/grey, not bright white (post-v1.22.2)"** [RESOLVED — shipped v1.22.3, 2026-07-06 · release `9bb6388b` (fix `004ac95a`)] — the white fill was correct; root cause = the **0.5 label opacity on unflagged rows** (`opacity:_trFlagged?1:0.5`) made the white checkbox read dim/grey. FIX: dropped that opacity → TR checkbox full-opacity white in both flag states (flag state still shown by checked + yellow row). Reversed the faint-vs-full call from v1.22.2 sign-off. *(source: Jon 2026-07-06.)*
- **B009 — "Supplier-cross TR auto-stamp clears after a few seconds (reload/reprice race)"** [Open · INVESTIGATE — potentially HIGH: undermines the TR send-gate] — LIVE OBS (Jon, 2026-07-07, prod v1.22.3): uploaded 4 supplier quotes → BOM imported the supplier crosses correctly + auto-stamped the TR checkmark on crossed rows (#199 @38978) → after a few seconds the TR checkboxes CLEARED automatically, rows stayed red. Suspected race on refresh. STRONG echo of **B004** (portal-Apply unawaited-save reload-race, "fixed" `await safeSave` @38302, v1.21.25) — either B004's fix didn't cover the supplier-UPLOAD/auto-stamp path, or a distinct reprice/reload reverts the flag before it persists. Note **F003** (role-diff TR) is on prod (v1.22.0) — check interaction. INVESTIGATE (do NOT fix blind): Debug Logs first (`companies/{cid}/debugLogs`), reproduce + instrument the upload→auto-stamp→save/reload sequence, compare to the B004 fix path. *(source: Jon 2026-07-07, live.)*
  - **TRACE DONE (Coach, `docs/B009-COACH-TRACE.md`, tip 318639e5) — Analyst Review PASS.** MECHANISM = a background **REPRICE/second-save runs ~seconds post-apply and re-saves the BOM off rows that don't carry the flag.** `techReviewFlag` is referenced by ZERO pricing code → survives a reprice ONLY via `...row` spreads; a non-spread rebuild or a run seeded off a pre-stamp bom drops it. Crossed rows are left UNPRICED by the apply (price → supplier PN) → baits the "auto-reprice when a row lacks price" path (24810-11); the "few seconds" = the reprice's async BC/AI calls before its save lands. **HYP#1 (B004-style unawaited save on the apply path) REFUTED with proof** — apply spreads `...row` every branch + `await safeSave` (38393); B004 fix present+sufficient here. **HYP#3 (F003 clears it) REFUTED** — F003 has no clear path; the TELL: Jon saw **RED not YELLOW** (unresolved-TR renders yellow under C8 → red = flag genuinely GONE, a true clear). **FIX (post-repro, NOT another await):** harden `runPricingOnPanel`/the later writer to PRESERVE the 5 TR fields (`techReviewFlag/Source/Resolved/ResolvedBy/ResolvedAt`) on every emitted row per the CLAUDE.md metadata-preservation rule + no post-apply reprice off a pre-stamp snapshot. **AWAITING Marc live repro** (log the flag after stamp / after apply-save / on entry+exit of each runPricingOnPanel+safeSave in the seconds after) to prove ACTIVE + pin the exact clobbering writer before the fix.
  - **PREP-AUDIT (Coach §7, tip 50cc72a9) — refines the fix direction:** `runPricingOnPanel` is internally `...r`-CLEAN (every phase spreads `{...r}`; save `{...panelBase,bom}` @27726) → the flag is carried BY VALUE from the input. So the clobber is **STALE INPUT, not a non-spread rebuild**: `bom=bomOverride||panel.bom` (27176), `panelBase=panelOverride||panelRef.current` (27722) — a post-apply reprice seeded off a PRE-stamp `bomOverride`, or a lagging `panelRef`/prop, faithfully re-saves rows that never had the flag → overwrites the stamp (ref-lag race; fits "few seconds"). **⇒ the naive "add `...row` to runPricingOnPanel" fix would be a NO-OP.** Other post-apply writers mapped (no tunnel-vision): doApplyPortalPrices PRESERVES (proven); SQ onBomUpdate / applyPriceCheckDiffs low; recon-reprice = wrong trigger; `_markProjectBudgetaryForRedRows` writes pricing only (no bom rows) = safe. **FIX shapes (gated on Marc's writer-ID): (1) input-freshness** — seed any post-apply reprice from the post-stamp `projectRef`/`latestPanelRef`, not a captured `bomOverride`/lagging prop; **(2) belt** — save-time merge-preserve the 5 TR fields vs latest-persisted rows (mirror the cross-user `saveProject` guards) — robust vs ANY stale writer, aligns with the CLAUDE.md metadata-preservation rule. **Freddy lean: BOTH** (fix the root writer + the belt so a future stale writer can't re-introduce it).
  - **REPRO PATH (Marc, `docs/B009-MARC-REPRO-NOTES.md` 01c2d951):** the MANUAL upload path CANNOT repro B009 — the supplier-cross auto-stamp (`techReviewFlagSource:"supplier"`) is ONLY at **39085**, inside the RFQ-**portal** quoteReview → "Apply N Items to BOM" flow (manual upload has its own review UI, never calls the stamp). ⇒ B009 needs a **REAL portal submission with a substitute/cross.** OPTIONS (Jon picks on return): **(a)** create an RFQ from a test project → supplier-portal link → submit a substitute PN → Review Supplier Quote → Apply; or **(b)** reuse an existing test project with a submitted portal quote + variance. Refinement (read-only): NO auto-reprice fires on the apply path via unitPrice triggers → the clobberer is likely a **non-reprice save or a differently-keyed reprice** (runtime will name it). Instrumentation deployed TEST-only (`window.__B009=1`, bundle `?v=v1.23.0-b009`); PROD clean at v1.23.0. **BLOCKED on Jon** (path decision + a portal co-drive — supplier-portal live test needs Jon).
  - **REPRO RESULT (Marc + Jon, synthetic injection on PRJ402096, v1.23.0-b010, __B009=1):** a SINGLE apply does NOT reproduce — STAMP→apply-save(TR:true)→NO later save; the flag SURVIVES apply + close/re-open (both a priced cross 3516000→B009CROSSTEST and an unpriced cross 1032264CS→B009UNPRICEDTEST). Matches the static finding (no auto-reprice on the single-apply path; all post-apply writers preserve via fresh-ref+`...r`). **⇒ REFINED MECHANISM: B009 is a MULTI-APPLY / between-applies race** — Jon's original applied **4 quotes in sequence**; a LATER apply re-saves the panel off a snapshot taken BEFORE an earlier apply's stamp → clobbers the earlier flag (exactly Coach's stale-input/ref-lag: the "stale input" = the prior apply's snapshot). A lone apply has no prior stale snapshot → can't repro. NEXT: multi-apply experiment (inject 2-3 synthetic submissions, crosses on different rows, apply in quick succession) → reproduces + names the clobbering writer + yields a repro to VERIFY the fix. **Loose end (G005):** PRJ402096 now carries 2 synthetic imported submissions + 2 crossed rows (3516000, 1032264CS) — cleanable.
- **B008 — "RFQ History 'Supplier Portal' link opens the pre-submission portal, not the submitted one"** [Backlog] — in RFQ History → View Received Quotes, each quote's "Supplier Portal" link points at the portal BEFORE the supplier entered data (blank/email-state) instead of AFTER submission; should open the SUBMITTED portal so the user sees the pricing + lead times the supplier actually entered. (Jon said "customer" — in the supplier-portal domain the RFQ recipient who fills the portal is the SUPPLIER/vendor.) Bug-adjacent (link points at the wrong state). *(source: Jon 2026-07-07, via Intake.)*

### ✨ Features (F###)
- **F003 — "Role-Differentiated Tech Review"** [RESOLVED — shipped v1.22.0, 2026-07-06 · release `2d24f5a2`] — User sees a checkbox→row turns bright YELLOW ("in review"), locked once sent for review; assigned Engineer (+admin) sees an empty bold GREEN CIRCLE (not the checkbox) only while `preReviewStatus="pending"`→signs off (final/uncheckable)→row reverts + circle ✓; Approve blocked until all yellow rows addressed (replaced the auto-resolve sweep), Reject free; column "Status"→"Issues". Ruled set 1a/2b/3b/4a/5a/6b/keep/none. Full T1–T11 + 4 Rev-A live-verified (Coach-approved `docs/F003-COACH-REVIEW.md`); build `72c5994e`+`dae43068`. Brief: docs/F003-TECH-REVIEW-REDESIGN-BRIEF.md; Plan: docs/F003-COACH-BUILD-PLAN.md; Verify: docs/F003-VERIFY-RESULTS.md. *(source: Jon 2026-07-06, from F002 verify.)*
- **F001 — "Interactive quote-building walkthrough"** [RESOLVED — shipped v1.23.0, 2026-07-07 · release `2d29d5d1`] — gated hands-on training walkthrough over the user's REAL quote; EXTENDED the existing `TourOverlay` engine (not a new build) with gated/narrated/checkpoint step-types + state-driven self-healing resume; 10-step "🧭 Quote Walkthrough" gear entry. Jon rulings: real project (no sandbox); 4Ba+Step7 sends NARRATED (never auto-fire — STRUCTURAL, no `advance` field). Full live-verify passed (5 real UI bugs caught+fixed: A3 spotlight timing, modal-mask, modal-grow, 2 bubble-clips); Coach-approved (docs/F001-COACH-REVIEW.md). Docs: docs/F001-*.md. *(source: Jon 2026-07-06.)*
  - **Forward-items (non-blocking, deferred at ship — capture, not lost):** (1) **focus-trap** on the tour bubble (Esc is done) — minor a11y follow-up; (2) **checkpoint same-step double-advance hardening** — Coach+Marc confirmed LOW-risk, functional-updater guard; (3) **Step 2 narrated + deferred sub-field anchors** — v1 guides at button-level; re-point/finer per-field steps when a pre-quote modal exists or finer guidance is wanted (`np-customer/salesperson/pm/engineer/create`, `prequote-continue`, `verify-page-type/region`, `rfq-vendor-select/preview/send`). *(Freddy 2026-07-07, from Coach's F001 review.)*
- **F004 — "Portal submit confirmation shows ARC user + email-copy notice"** [Backlog] — when a supplier submits a quote from an RFQ, the portal confirmation page AND the confirmation email should display the ARC user's name and state a copy of the quote was emailed to that user ("a copy of your quote has been sent to <Name> @ name@matrixpci.com") — reassures the supplier it reached a real person. *(source: Jon 2026-07-06, via Intake.)*
- **F005 — "Print-Only button in locked-quote (Quote Sent) blocker overlay"** [Backlog] — after a quote is sent, the blocker overlay covers the Print + Send buttons; add a "Print Only" button to the overlay (alongside "Verify with Project Owner & Enable Edits") that prints the quote to PDF — needs NEITHER approval NOR unblocking (read-only output). Thematic sibling to #196 (locked-quote overlay covers a forward/output button; different button/ask). *(source: Jon 2026-07-06, via Intake.)*
- **F008 — "New-version-available notification prompting users to refresh"** [Backlog] — when a new build is pushed, ARC polls the served version (compare the client's loaded `APP_VERSION` vs the currently-served build — `deploy.sh` already bumps `APP_VERSION` in public/index.html) and shows a notification on ALL users' pages that they should refresh to apply the update; message reassures all their work is saved / nothing lost on refresh. *(source: Jon 2026-07-07, via Intake.)*
- **F007 — "Order main-page projects by last-accessed (most-recent on top)"** [Backlog] — on exiting a project, bump it to the TOP of the dashboard list; order the whole list by last-accessed (most-recently-opened first). Needs a per-project last-accessed timestamp (additive/data-safe, written on open and/or exit) + sort the dashboard by it. Distinct from #200 (shifts tile COLOR by quota-age, not order). *(source: Jon 2026-07-07, via Intake.)*
- **F006 — "Qv.## Hist. button — per-quote send history with document previews"** [Backlog] — a "Qv.## Hist." button next to Send/Resend/Print Quote that opens the history of ALL sends for that quote, each entry showing a PREVIEW of the document actually sent. Data feed exists (#193 writes per-send `quote_send` to `project.qvHistory[]`); distinct from #194 (GLOBAL email-metrics/click-tracing consumer). Requires storing/rendering a sent-document snapshot per send. *(source: Jon 2026-07-06, via Intake.)*
- **F002 — "BOM column reorg / indicator cleanup"** [RESOLVED — shipped v1.21.26, 2026-07-06 · `38ffe85c`] — decluttered BOM columns (# Ref TR Qty Status 🔍 Part#…), unified tri-state BC circle (RED>YELLOW>BLUE), AI+manual→grey-italic / BC→white pricing, removed marker/label pills, `data-tour` anchors. All T1–T10 live-passed (2 states code-verified: YELLOW circle, readOnly RED/YELLOW). Brief: docs/F002-BOM-COLUMN-REORG-BRIEF.md; Plan: docs/F002-COACH-SUPPLEMENT-AND-PLAN.md. *(source: Jon 2026-07-06.)*
- **#199 — "Per-line Tech Review flag + hard send-gate"** [RESOLVED — shipped v1.21.25, 2026-07-03] — per-BOM-line Tech-Review checkbox; auto-stamps on supplier crosses (@38978, unconditional → re-cross re-arms); hard send-gate across all 7 send surfaces; reviewer per-row Resolve + approve-sweep. Commits: P1 `13f06fcf`/`66494253`, P2 `a5253d42`, P3 `a0e39335`, MED-3 `c46184aa`, await-fix `41824f6c`, count-fix `107b960b`. Full T1–T18 live-passed; Coach-verified P1/P2/P3 + MED-1/2/3; T3 covered-by-design, T7 superseded, T12 N/A-by-design. (Legacy-continuation #N — kept as #199 to match commits/docs.)
- **#200 — "Quota-aging project-tile color-shift"** [Brief written · queued] — shift dashboard project-tile color as a project ages toward its Sales quota deadline (anchor createdAt, un-quoted-only + sending stops it, business days, fixed offsets from deadline). Brief: docs/200-QUOTA-TILE-AGING-BRIEF.md. (Legacy-continuation #N.)

### 🔧 General (G###)
- **G006 — "Supplier Portal loading copy → 'Matrix ARC AI is currently scanning your quote'"** [Backlog · cosmetic] — on the Supplier Portal quote-analysis loading state (currently labeled "Analyzing Your Quote"), change the copy to "Matrix ARC AI is currently scanning your quote." Trivial one-string wording change. *(source: Jon 2026-07-07, via Intake.)*
- **G005 — "matrix-arc-test shares PROD Firestore (not data-isolated)"** [Backlog · infra] — the test hosting target is in the same Firebase project as prod → same Firestore + Auth, so data-mutation tests there write the SAME DB as production. Safe NOW only because all data is pre-launch/test (Jon confirmed 2026-07-02). BEFORE real customers exist, live mutation tests must use a truly isolated env / dedicated scratch. *(source: Marc #199 live pass, 2026-07-02, via Freddy.)*
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

24. **OPEN** [Backlog] — Remove auto-creation of Project Task `20N20 Engineering Design`.
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

75. **OPEN** [Backlog] — Extraction progress bar accuracy.
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

76. **OPEN** [Backlog] — Multi-Claude coordination layer (Freddy ↔ Coach ↔ Marc).
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

96. **OPEN** [Backlog] (IDEA) — Windows facilitator app for three-role Claude workflow.
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
190. **OPEN** [LOW — relabel "Save Defaults" → "Save"] — Config modal's "Save Defaults" button reads like a reset;
     rename to "Save". Pending Coach confirm it commits the FULL modal (not just defaults). From #189.
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
195. **OPEN** [LOW — cosmetic, pre-existing since v1.19.1028] — Print-as-Firm: when an admin overrides the budgetary
     flip (`_skipBudgFlip=true`), the pre-print checklist still shows an "auto-flagged BUDGETARY" entry (false — the
     flip was skipped). Cosmetic; guard/strip that checklist entry on override.
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

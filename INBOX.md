# 📥 Intake Inbox — awaiting Freddy triage

> **Owner (sole writer): Dez (Dezzie Arnez, Intake).** This is a dedicated single-writer file
> so it cannot collide with TODO.md on the shared working tree (per DOC-OWNERSHIP-PROPOSAL §2 +
> Freddy's INBOX.md-split refinement, approved 2026-07-02).
>
> **Dez:** drop raw bug/feature captures here — timestamped, **un-numbered** — one bullet each,
> dedup-checked against existing `#N` in TODO.md + SESSION-STATE.md first. Commit `-- INBOX.md`
> and push immediately after each capture. Do NOT assign `#N` (Freddy is the sole allocator →
> avoids multi-session number collisions).
>
> **Freddy:** on triage passes, pull from here, dedup-confirm, assign the next `#N`, promote the
> item into the TODO.md numbered tracker, then delete the bullet here. (Freddy edits this file
> only to clear routed bullets; Dez owns all appends.)
>
> Capture format: `- [YYYY-MM-DD] BUG|FEAT|GEN — "<short title>" — <desc> — reported via Intake (source: Jon|Marc|Coach|Freddy)`
>
> Category (B/F/G taxonomy, replace-going-forward, approved 2026-07-02 — Freddy stamps the number at triage):
> `BUG → B###` · `FEAT → F###` · `GEN` (General — neither bug nor feature) `→ G###` · `METRICS → M###` (analytics/engagement telemetry; new category added 2026-07-10, see NUMBERING-CONVENTION.md). Every item carries a short
> identifying title. Existing `#1–#198` keep their numbers (no retroactive renumber; open items get tagged in Freddy's triage pass).

---

_(No items awaiting triage — all promoted to TODO.md as of 2026-07-10.)_

<!-- Triage log:
     2026-07-02 — G001 (Allow-Once → Verified/not-fixable), B001 (trailing-dot redirect URI, LOW), B002 (approved-state TR block message, LOW) promoted by Freddy.
     2026-07-03 — G005 (matrix-arc-test shares PROD Firestore), B003 (Review-Supplier-Quote modal lists unquoted parts), B004 (portal-Apply unawaited-save reload-race → RESOLVED 41824f6c / shipped v1.21.25), B005 (resolved-TR-row can't re-arm, LOW/tuning) promoted by Freddy at #199 close-out.
     2026-07-06 — F004 (Portal submit confirmation shows ARC user + email-copy notice) promoted to TODO.md Features [Backlog] by Freddy. Also back-filled F001/F002/F003 into the Features tracker (were only in SESSION-STATE + docs).
     2026-07-06 — F005 (Print-Only button in locked-quote blocker overlay) promoted to TODO.md Features [Backlog] by Freddy (sibling to #196).
     2026-07-06 — F006 (Qv.## Hist. button — per-quote send history w/ document previews) promoted to TODO.md Features [Backlog] by Freddy (feed = #193 qvHistory; distinct from #194 global metrics).
     2026-07-07 — B008 (RFQ History "Supplier Portal" link opens pre-submission portal, not submitted) promoted to TODO.md Bugs [Backlog] by Freddy (classified BUG: link points at wrong state).
     2026-07-07 — B010 (manual Upload-Supplier-Quote undefined crash) + B011 (harden other supplierQuotes sites) + F007/F008 + G006 (portal loading copy, cosmetic) promoted by Freddy.
     2026-07-07 — F007 (order projects by last-accessed) + F008 (new-version-available refresh notification) promoted to TODO.md Features [Backlog] by Freddy.
     2026-07-07 — F007 (Order main-page projects by last-accessed, most-recent on top) promoted to TODO.md Features [Backlog] by Freddy (distinct from #200 color-by-quota-age).
     2026-07-08 — B013 (BC-401 hidden; from the "61 items could not be pushed" bullet — root cause OAuth token expiry, NOT G005) + B014 (Codale multi-result parse-gap; from the "5 Codale no pricing" bullet) INBOX bullets cleared (both stamped earlier @9a511e07). G007 (remove leftover TEST upload section) promoted to General by Freddy at close-out. INBOX now empty.
     2026-07-09 — F009 (Debug Mode — persistent cross-user activity tracing; parked behind the B012 hard-lock work) + F010 (Suggested alternates — multi-alternate ALT picker + supplier-portal alternate sub-lines) promoted to TODO.md Features [Backlog] by Freddy; both bullets cleared. STILL HELD for a full triage pass: BUG "Login 'Continue with Microsoft' misleads existing users" (2026-07-09, source Jon) — needs B-number + dedup.
     2026-07-10 — All 4 pending bullets TRIAGED + promoted by Freddy (Dez cleared bullets per Freddy's request): F014 (Customer-specific payment-terms note on ALL quotes + BC storage field — CRITICAL, classed FEAT, slotted TOP of post-P1 queue; Jon-flagged critical, Dez proactive-surfaced) · B022 (Login "Continue with Microsoft" misleads existing users, MED) · B023 (Quote Summary line-row overflow clips total price → truncate "IN PRE-REVIEW"→"IN ETR", LOW/cosmetic) · BOM-row-RED-despite-reqs on PRJ402100 3044102 (1-cent clears) FOLDED INTO B018 (decisive repro added; same _isBomRowFlaggedRed priceDate-staleness root; no new number). INBOX now empty.
     2026-07-10 — ★ NEW CATEGORY established by Freddy: METRICS (prefix M) added to NUMBERING-CONVENTION.md (own sequence + ranking, same pattern as B/F/G). Use METRICS/M at intake going forward for analytics/engagement items (Freddy stamps M###). First item promoted: M001 (user engagement telemetry — page-access / activity cadence / per-project time) → TODO.md [Backlog], scoped by Freddy (privacy guard: cadence-not-verbatim-keystrokes; overlaps F009 capture pipeline — design decides shared-vs-standalone). Dez cleared the M001 bullet. INBOX now empty.
     2026-07-23 — F041 (Primary/Secondary supplier matrix — BOM items default to PRIMARY supplier sourcing; Purchasing may source from a secondary) stamped + captured by Freddy (source: Jon). Money-path (supplier/pricing/BC). In ANALYSIS (Coach lane tracing current model + BC capability) — NOT yet promoted to TODO.md as a build item; awaiting synthesis + Jon direction on the Sales↔Purchasing flow.
     2026-07-23 — F042 (To-Do pane NEEDS ATTENTION list: show ALL projects incl. yellow/green sorted by time — not just red; sort by Requested Ship Date + Est. Prod. Done date + untouched-duration) stamped + captured by Freddy (source: Jon). Dashboard UI, low-stakes. In SCOPING (Marc lane) — NOT yet promoted to TODO.md build item; awaiting scope report + Jon sort-tiebreak confirm.
     2026-07-23 — G016 (shrink top To-Do status tiles) BUILT + shipped Test V.040 (source: Jon, live). G017 (To-Do side pane scroll separate from main page — likely the F030 MY DASHBOARD page; standing rail already scrolls independently) + F043 (hover right-pane tile → highlight corresponding project on main screen; F034-family) stamped + captured by Freddy (source: Jon). G017/F043 awaiting Jon surface-confirm before build/scope. -->

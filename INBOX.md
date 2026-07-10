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
> `BUG → B###` · `FEAT → F###` · `GEN` (General — neither bug nor feature) `→ G###`. Every item carries a short
> identifying title. Existing `#1–#198` keep their numbers (no retroactive renumber; open items get tagged in Freddy's triage pass).

---

- [2026-07-09] BUG — "Login box 'Continue with Microsoft' misleads existing users (it's account-setup only)" — On the sign-in screen the Login box shows a "Continue with Microsoft" button, but that path is only for SETTING UP A NEW ACCOUNT. Existing/already-setup users just need to log in — yet they all click "Continue with Microsoft" expecting it to log them in with their Microsoft account, taking the wrong path. Misleading affordance / label. Fix direction (for team triage): relabel/reposition so an already-setup user sees a clear plain "log in" path distinct from new-account Microsoft setup. — reported via Intake (source: Jon)
- [2026-07-10] BUG — "BOM row shows RED despite all requirements met; 1-cent price bump clears it (priced-date read / red-highlight predicate)" — On PRJ402100, item 3044102 rendered a RED-highlighted row even though ALL requirements were met (Priced Date, Lead Time, and BC all satisfied). Decisive repro: Jon changed the price up by ONE CENT and the red cleared. ⇒ points at the red-highlight predicate (`_isBomRowFlaggedRed`) and specifically HOW the Priced Date is read/compared (stale-date check likely mis-evaluating a valid priceDate; the 1-cent edit refreshes priceDate/state and clears the flag). Fix direction (for team triage): audit `_isBomRowFlaggedRed` + the priceDate read/staleness comparison. DEDUP FLAG for Freddy: strongly overlaps B018's SECONDARY open question ("why do non-stale rows render red on PRJ402096 → investigate `_isBomRowFlaggedRed` vs the send-block predicate") — may be the same root cause, but this is a distinct decisive repro on a different project. Freddy to decide: fold into B018 or stamp a new B-number. — reported via Intake (source: Jon)

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
     2026-07-09 — F009 (Debug Mode — persistent cross-user activity tracing; parked behind the B012 hard-lock work) + F010 (Suggested alternates — multi-alternate ALT picker + supplier-portal alternate sub-lines) promoted to TODO.md Features [Backlog] by Freddy; both bullets cleared. STILL HELD for a full triage pass: BUG "Login 'Continue with Microsoft' misleads existing users" (2026-07-09, source Jon) — needs B-number + dedup. -->

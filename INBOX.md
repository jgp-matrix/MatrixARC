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

- [2026-07-06] FEAT — "Print-Only button in locked-quote (Quote Sent) blocker overlay" — After a quote is sent, the blocker overlay covers the Print and Send buttons. Add a "Print Only" button to the overlay (alongside "Verify with Project Owner & Enable Edits") that lets the user print the quote to PDF. Printing to PDF requires NEITHER approval NOR unblocking the project — it's a read-only output. (Thematic sibling to #196 — locked-quote overlay covers a forward/output button; different button/ask.) — reported via Intake (source: Jon)

<!-- Triage log:
     2026-07-02 — G001 (Allow-Once → Verified/not-fixable), B001 (trailing-dot redirect URI, LOW), B002 (approved-state TR block message, LOW) promoted by Freddy.
     2026-07-03 — G005 (matrix-arc-test shares PROD Firestore), B003 (Review-Supplier-Quote modal lists unquoted parts), B004 (portal-Apply unawaited-save reload-race → RESOLVED 41824f6c / shipped v1.21.25), B005 (resolved-TR-row can't re-arm, LOW/tuning) promoted by Freddy at #199 close-out.
     2026-07-06 — F004 (Portal submit confirmation shows ARC user + email-copy notice) promoted to TODO.md Features [Backlog] by Freddy. Also back-filled F001/F002/F003 into the Features tracker (were only in SESSION-STATE + docs). -->


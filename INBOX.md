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

- [2026-07-02] GEN — "matrix-arc-test shares PROD Firestore (not data-isolated)" — the test hosting target is in the same Firebase project as prod → same Firestore + Auth, so data-mutation tests there write the SAME DB as production. Safe NOW only because all data is pre-launch/test (Jon confirmed). BEFORE real customers exist, live mutation tests must use a truly isolated env / dedicated scratch, or they'd violate Data-Retention. Infra follow-up to fix before launch. — reported via Intake (source: Marc, #199 live pass, 2026-07-02; via Freddy)

<!-- Triage log: 2026-07-02 — G001 (Allow-Once remote-approval → Verified/not-fixable), B001 (trailing-dot redirect URI, LOW), B002 (approved-state TR block message, LOW) all promoted to TODO.md by Freddy. -->


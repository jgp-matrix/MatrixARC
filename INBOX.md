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

- [2026-07-02] FEAT — "Remote approval of Allow-Once prompts" — enable Jon to approve the per-send "Allow Once" cross-session permission prompts remotely (e.g. from his phone) so he isn't tethered to the desk to keep the CCD `send_message` bus flowing. — reported via Intake (source: Jon, via Freddy) [Freddy: may reclassify as G###/General — dev-tooling/infra; feasibility scoping in parallel]

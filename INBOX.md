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

- [2026-07-02] BUG — "ARC auth redirect URI carries a trailing dot" — if ARC is loaded at a trailing-dot URL (`matrix-arc.web.app.`), `window.location.origin` carries the dot into the OAuth redirect URI → Azure AADSTS50011 redirect-mismatch → BC/Microsoft sign-in fails with a cryptic error. Root cause = URL-entry artifact (NOT a code bug); clean-reload at the no-dot URL fixes it (confirmed live). Hardening: strip a trailing dot from the origin when building the auth redirect URI so a dotted load can't break BC. LOW priority. — reported via Intake (source: Jon 2026-07-02, resolved live; via Freddy)
- [2026-07-02] BUG — "Approved-state TR block message names an absent button" — on a post-approval re-arm, the send-block message says "Click Send for Technical Review" but that button isn't rendered in the approved state (reviewer per-row Resolve still works — no hard dead-end). Fix: state-aware block message when approved ("have an engineer Resolve the flagged line(s)") or a re-submit affordance by the approved banner. LOW. — reported via Intake (source: Coach P3 verify 2026-07-02; via Freddy)

<!-- Triage log: 2026-07-02 — "Remote approval of Allow-Once prompts" promoted to TODO.md G001 [Discovery] by Freddy. -->


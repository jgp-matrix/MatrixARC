# Proposal — CLAUDE.md + mechanism changes (2026-07-03 close-out)

**Author:** Sam Wize (Coach) · **Status:** DRAFT — awaiting Jon's approval via Freddy (CLAUDE.md-change gate). Nothing applied to CLAUDE.md / mechanism files until approved.
**Source:** Freddy close-out routing (3 CLAUDE.md updates + mechanism follow-up).

---

## Change 1 — Per-phase gating (NEW subsection in CLAUDE.md)

**Where:** Multi-instance workflow, immediately after the "Hybrid work routing" subsection (after current line 351), before "### Intake / Triage session (Dez)".

**Add:**
```
### Per-phase gating (2026-07-03)

Jon runs multi-phase work on an **explicit per-phase gate** so he stays genuinely in the loop:

- **HOLD after every phase.** Each phase (plan→build→verify→deploy, or P1→P2→P3) ends by reporting to Freddy and **holding for Jon's explicit "go"** — no role auto-advances to the next phase; Freddy relays the go.
- **A question to Jon FREEZES the whole team.** When any role has a blocking question/decision for Jon, work **stops team-wide** on that item — no self-solving, guessing, defaulting, or parallel-pathing around it. Resume only when Jon's answer returns via Freddy. (Extends the hub-and-spoke "holds that thread" to "freezes all threads.")
- **Deploy is its own checkpoint.** Code-complete ≠ deploy. Deploy is a separate, explicitly Jon-released step — never bundled into a phase sign-off.
- **"HOLD" / "STOP" freezes everything.** If Jon (or Freddy relaying) says HOLD or STOP, all roles stand down immediately and await an explicit go — no in-flight self-resolution.
- **Freddy minimizes cross-session sends.** Every `send_message` costs a hardcoded per-send Allow-Once prompt (see Team comms), so Freddy batches relays, avoids redundant round-trips, and prefers the pull-based repo/STATUS.md bus for routine sync.
```

---

## Change 2 — Close-outs run from Freddy

**2a. CLAUDE.md shutdown intro (line 141).**
- OLD: `The shutdown is a two-step user command: "Close Out" (surface state) followed by "Closed" (confirm safe to end).`
- NEW: `The shutdown is a two-step user command: "Close Out" (surface state) followed by "Closed" (confirm safe to end). **Freddy (analyst) orchestrates close-out** (Jon ruled 2026-07-03 — symmetric with startup orchestration): Freddy runs the procedure and routes handoff-file approvals to Jon, but **role-owned files are still edited + committed by their owners** (Coach commits CLAUDE.md / COACH.md; Marc commits source; Freddy commits SESSION-STATE/TODO/FREDDY.md).`

*(Freddy's roles-table entry already reads "startup+close-out orchestrator" — no change needed there; confirm at apply-time.)*

**2b. `.claude/commands/team-closeout.md` line 3 (mechanism).**
- OLD: `This skill runs the full close out procedure. The Implementer (you) orchestrates.`
- NEW: `This skill runs the full close out procedure. The **Analyst ({ANALYST_SHORT}) orchestrates** (Jon ruled 2026-07-03 — symmetric with startup). Role-owned files are edited + committed by their owners; the orchestrator drives sequence + routes approvals.`
- Also review the Step-7 notify line + any other "Implementer orchestrates" references in that file for consistency (apply-time pass).

**2c. `.claude/team-config.json` (mechanism).** `orchestrator` is already `"analyst"` (governs startup). Make close-out explicit by adding:
- `"closeoutOrchestrator": "analyst",` (sibling of `"orchestrator"`), OR update the analyst `_note` to state orchestration (startup + close-out) = analyst. Recommend the explicit key for clarity.

---

## Change 3 — Comms note refinement: Allow-Once is per-SEND, not per-target

**Where:** CLAUDE.md line 55 (Team comms note).
- OLD: `Each session stays in **"Ask permissions"** mode so outbound sends fire (per-send "Allow Once" prompt expected, hardcoded, not suppressible).`
- NEW: `Each session stays in **"Ask permissions"** mode so outbound sends fire. The "Allow Once" prompt is **per-SEND, not per-target** (confirmed live 2026-07-03 — there is no remembered per-target approval; *every* `send_message` prompts), and is **hardcoded / not suppressible** by any allowlist or permission mode (G001). The **only** lever to reduce prompts is **fewer sends** — batch relays and prefer the pull-based repo/STATUS.md bus for routine sync.`

*(Also refine the parallel wording in team-config.json's analyst `_note` — "per-send Allow-Once prompt is expected" → add "per-send, not per-target; only lever is fewer sends" — at apply-time.)*

---

## Apply plan (after Jon's approval, per-file, explicit pathspec)
1. CLAUDE.md — Changes 1, 2a, 3 (Coach owns; one commit).
2. `.claude/commands/team-closeout.md` — Change 2b.
3. `.claude/team-config.json` — Change 2c (+ 3 note).
Each committed with explicit pathspec; surfaced-and-approved before commit.

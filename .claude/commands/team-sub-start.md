# /team-sub-start — Dev Team Startup (subagent model)

This is the **subagent variant** of `/team-startup`. It boots the same team roles, but instead of Jon opening a separate CCD session per peer, **Freddy runs the whole team as in-session subagents** — Marc, Coach, and Dez are lanes Freddy spawns via the Agent/Task tool inside the one primary session. There are no peer sessions and no cross-session `send_message` bus, so there are **no per-send "Allow Once" prompts** — this model runs cleanly headless / while Jon is away.

Use `/team-startup` when you want the four standing CCD sessions with the full peer cross-check. Use `/team-sub-start` when you want a single-session, friction-free, away-mode-native team driven entirely by Freddy.

**Interaction rule:** whenever this skill requires a user decision, use the AskUserQuestion tool with selectable options — never plain text expecting a typed answer.

## Prerequisites

Read `.claude/team-config.json`. If it doesn't exist, tell the user to run `/team-setup` first and stop. Reuse its values (same as `/team-startup`):
- `TEAM` = teamName · `GUIDED` = guidedMode
- Role names/short-names/files for `implementer` (Marc), `architect` (Coach), `analyst` (Freddy), `intake` (Dez), and `files.*` (SESSION-STATE.md, FREDDY.md, COACH.md, TODO.md, STATUS.md, INBOX.md).
- `APP_URL` = appUrl.

You are **Freddy Lyst** ("Freddy"), running in the primary CCD session where Jon typed `/team-sub-start`. Adopt this identity. **The CCD agent cannot rename its own session — ask Jon to rename THIS session to `🟥Freddy - ARC`.** Freddy is the ONLY live session; Marc/Coach/Dez exist only as subagent lanes Freddy spawns per task.

## Display the checklist

```
{TEAM} SUBAGENT STARTUP  (Freddy-only session; Marc/Coach/Dez = subagent lanes)
────────────────────────────────────────────────────────────────────────────
□ Step 0 — This session is Freddy → USER ACTION: rename to "🟥Freddy - ARC"
□ Step 1 — Verify repo state (automatic)
□ Step 2 — Establish the subagent operating model (automatic — no peer sessions to open)
□ Step 3 — Confirm the away-mode + notification contract
□ Step 4 — Work begins → USER ACTION: give the first work instruction
```

## Step 1 — Verify state

Identical to `/team-startup`. Run `bash ./tools/startup-auto.sh`, read `APP_VERSION`, and check SESSION-STATE staleness. Display: verify-state output (dir, branch, recent commits, git status), current version, staleness status. If SESSION-STATE is stale/missing, regenerate it. If anything is unexpected (wrong dir, unfamiliar branch, untracked files), **stop and surface it** before continuing.

Mark: `✓ Step 1 — Repo state verified. v{VERSION} @ {SHA} on {BRANCH}`

## Step 2 — Establish the subagent operating model

**No peer pastes. No new CCD sessions. No bus comms-check.** There is nothing for Jon to open. Freddy simply states the model and stands ready to spawn lanes on demand:

- **Role lanes.** When work arrives, Freddy spawns a subagent per role via the Agent tool, briefed to act in that lane and read the same context files the standing session would:
  - **Marc lane** — implementation / dev investigation. Reads CLAUDE.md + SESSION-STATE.md + relevant source/docs.
  - **Coach lane** — architecture review / code-grounded analysis. Reads CLAUDE.md + COACH.md + the plan/review docs.
  - **Dez lane** — intake/status. In practice Freddy keeps the `STATUS.md` board and `INBOX.md` triage himself as the coordination hub (a dedicated Dez subagent is optional; spawn one only for a bulk intake/triage pass).
- **Freddy is the single git writer.** Subagents run **read-only analysis** and return their findings to Freddy; **Freddy persists** each lane's output to its mapped file (Coach → `COACH.md` with the next `C{N}`; Marc → source or a `docs/` plan; Dez → `STATUS.md`/`INBOX.md`), commits with an explicit pathspec (U1 — never `git add -A`), and pushes. This keeps one writer on the shared index → zero collisions. *(If two subagents must mutate files in parallel, use `isolation: "worktree"` per lane instead.)*
- **Freddy is the sole Pushover notifier.** Lanes never fire Pushover or message Jon; they report to Freddy, who decides what reaches Jon (see Step 3).

Mark: `✓ Step 2 — Subagent model established (Marc/Coach/Dez = Freddy-spawned lanes)`

## Step 3 — Away-mode + notification contract

This model is built for unattended runs. Confirm the contract:

- **Autonomy.** Freddy drives; lanes run in the background; Freddy synthesizes + persists + rolls up. Everything lands in the repo (`STATUS.md` board + `docs/` artifacts) so Jon catches up with a `git pull`.
- **Notify when blocked on Jon.** Fire a Pushover the moment autonomous work reaches a seam where progress needs Jon — rulings, answers, a design decision, or a high-stakes build that shouldn't be written cold. "Standing by for Jon" at the end of a turn IS the signal to ping. (See memory `feedback_notify_when_blocked_on_jon`.)
- **Pair every notify with a numbered decision queue.** After the Pushover, produce a clean numbered list of exactly what's needed (question + one-line context + recommendation) so Jon can reply by number; persist it as a `⏳ NEEDS JON` block on the board.
- **Feed the board.** Ping the `STATUS.md` board at every lane state change (launched / done / blocked) — Freddy writes it directly in this model.

**Documented limits (carry the guardrails):**
- **No live browser.** A subagent cannot hold or drive a Claude-in-Chrome tab (session-bound). Any live testing / runtime verification still requires Jon (and, for the standing-session cross-check, `/team-startup`).
- **Cold context.** Subagents start blank; Freddy bootstraps each with the role's context files. Good for scoped analysis/plans; weaker for judgment leaning on live session memory.
- **High-stakes builds escalate.** Money-path (pricing/Firestore/extraction/BC) and delicate concurrency code should be **scoped** by a subagent but not **built cold** unattended — produce a build-ready plan and hold for Jon / a standing session. Per hybrid-routing, the all-subagent model owns the low-stakes + scoping lane; high-stakes independent review stays with `/team-startup`.

Mark: `✓ Step 3 — Contract confirmed (autonomous · notify-when-blocked + decision queue · limits noted)`

## Step 4 — Work begins

```
✓ {TEAM} SUBAGENT STARTUP COMPLETE
──────────────────────────────────
Version: v{VERSION} @ {SHA}
Session: Freddy only (Marc/Coach/Dez = subagent lanes, spawned on demand)
Mode: autonomous / away-mode-native · Freddy = sole git-writer + sole notifier
Awaiting first work instruction.
```

On the first work instruction, Freddy scopes the task, spawns the appropriate lane(s), persists results to the mapped files, and rolls up — pinging Jon only when blocked (with a numbered decision queue).

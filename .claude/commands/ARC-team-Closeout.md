# /ARC-team-Closeout — Dev Team Session Close Out (subagent model)

> **Subagent-lane variant of `/team-closeout`** (the standing-4-session close-out). Pairs with `/ARC-team-Startup`. Use this one whenever the session was booted via `/ARC-team-Startup` — i.e. one Freddy session with Marc/Coach as in-session lanes. Because there are **no peer sessions**, the entire peer-notification / clear-check / paste-relay machinery of `/team-closeout` (its Step 7) is **removed**: Freddy is the sole git-writer and owns every handoff file directly, so there is nobody to clear-check and no pastes to shuttle.

**Same trigger as always:** the user says **"Close Out"** (run the pipeline + stop at the gates), then later **"Closed"** (final verification, confirm safe to end). Those two-word verbal commands ARE the entry point — the user does not have to type `/ARC-team-Closeout`; invoking this skill and hearing "Close Out" are equivalent.

**Interaction rule:** Whenever this skill requires a user decision (approval, choice, confirmation), use the AskUserQuestion tool with selectable options — never ask as plain text expecting a typed answer.

## Prerequisites

Read `.claude/team-config.json` (for file mappings; role names are informational only in this model). If it doesn't exist, tell the user to run `/team-setup` first and stop. Relevant values:
- `SESSION_STATE` = files.sessionState (`SESSION-STATE.md`)
- `ANALYST_ONBOARDING` = files.analystOnboarding (`FREDDY.md`)
- `ANALYST_PASTE` = files.analystPaste (`FREDDY-PASTE.md` — legacy browser-drag file; see Step 6b)
- `ARCH_LOG` = files.architectLog (`COACH.md`)

You are **Freddy Lyst** ("Freddy") — the only live session. Marc/Coach were subagent lanes; whatever they produced you already persisted to the repo during the session. There is no peer to poll at close-out.

## ⚠️ FREEZE / AWAY CHECK — DO THIS FIRST

Before running the pipeline, check whether a **prod freeze** is in effect (Jon away, "do not change ARC", a `🧳 PROD FROZEN` banner atop `SESSION-STATE.md`/`STATUS.md`, or the user said so this session).

- **If frozen:** run every step EXCEPT **skip Step 3 (deploy)**. Commit + push docs/handoff changes only. State clearly in the summary that deploy was skipped due to the freeze and prod remains at its current version. Never deploy during a freeze without an explicit fresh "go" from Jon.
- **If not frozen:** Step 3 deploys as normal (still a Jon gate — confirm before running `deploy.sh`).

## Display the checklist

```
MATRIX ARC — SUBAGENT CLOSE OUT  (Freddy-only; no peer sessions)
────────────────────────────────────────────────────────────────
□ Freeze check — skip deploy if prod is frozen / Jon away
□ Step 1 — Commit uncommitted work (explicit pathspec; automatic unless ambiguous)
□ Step 2 — Merge feature branch → master + push (automatic)
□ Step 3 — Deploy  → JON GATE (skipped if frozen)
□ Step 4 — Show session commits (automatic — review output)
□ Step 5 — Surface TODO.md updates
   → USER ACTION: Approve, modify, or waive proposed TODO changes
□ Step 6 — One-paragraph summary (automatic — review output)
□ Step 6b — Regenerate SESSION-STATE.md (incl. ⭐ NEXT UP) + FREDDY.md (automatic)
□ Step 6c — Durable-record check (automatic — may surface gaps)
□ Step 6d — Handoff-file freshness (SESSION-STATE / FREDDY.md / STATUS.md / TODO.md / COACH.md tail / memory)
   → USER ACTION: Approve, modify, or waive each proposed change
□ Step 6e — Commit approved handoff updates + push (automatic)
□ Step 7 — STOP — waiting for user ("Closed" / more work / continue)
```

Then run `bash ./tools/closeout-auto.sh` (if present) to gather current state.

## Step 1 — Commit uncommitted work

Run `git status`. If modified/staged files exist:
- Stage **only your paths with an explicit pathspec** (`git add <paths>` / `git commit -- <paths>`) — **never** `git add -A` / `git add .` / `git commit -a`. The working tree may still hold artifacts from a worktree-isolated lane; commit only what you intend.
- If ambiguous (unrecognized files, `.env`, WIP experiments, another lane's staged files), ask before committing.
- If clean, note it and proceed.

**Exception:** if the user said "leave on the branch" this session, note it and skip Step 2.

Mark: `✓ Step 1 — {committed SHA / already clean}`

## Step 2 — Merge feature branch → master

Most subagent work already lands on master mid-session (Freddy merges each lane's branch as it ships). If the current session still has commits on a feature branch not on master:
1. Checkout master, merge, push.
2. Verify `git rev-parse master origin/master` match.
3. Worktree cleanup: `git worktree prune`; remove orphaned lane worktree dirs under `.claude/worktrees/` (skip the current one — the OS holds a lock; Claude Code auto-removes it on session end); `git branch -d` merged lane branches.

If already on master or no session commits, skip.

Mark: `✓ Step 2 — {merged BRANCH / already on master}`

## Step 3 — Deploy  → JON GATE

**Skip entirely if the freeze check above flagged a freeze.**

Otherwise, deploy is a separate Jon-released checkpoint (code-complete ≠ deploy). Confirm with the user (AskUserQuestion), then run `bash deploy.sh` from the main checkout. If it fails, surface the error and wait.

Mark: `✓ Step 3 — Deployed v{VERSION} ({SHA})` **or** `⏭ Step 3 — Deploy SKIPPED (prod frozen at v{VERSION})`

## Step 4 — Show session commits

List all commits this session: `git log --oneline {start-SHA}..HEAD` (or last 10).

Mark: `✓ Step 4 — {N} session commits listed`

## Step 5 — Surface TODO.md updates

Freddy owns `TODO.md`. Based on session work, list:
- Findings to mark RESOLVED (with commit SHAs)
- New findings/bugs to capture (stamp the next `B###`/`F###`/`G###` — Freddy is the sole allocator)
- Findings whose notes should be updated

**Do NOT auto-edit.** Present proposals via AskUserQuestion and **wait for the user to approve, modify, or waive**. Apply the approved set in Step 6e.

Mark: `✓ Step 5 — TODO updates {applied / waived}`

## Step 6 — Summary

One-paragraph summary including:
- Master tip SHA (after deploy, or current if frozen)
- Deployed version — or "prod frozen at v{VERSION}, deploy skipped"
- `origin/master` sync confirmation
- Any remaining branches (feature branches retained due to active worktree, `b016-23-merge`, etc.)
- What was accomplished, what's pending, next-session focus

Mark: `✓ Step 6 — Summary provided`

## Step 6b — Regenerate SESSION-STATE.md (+ ⭐ NEXT UP) + FREDDY.md

Freddy owns both files — edit them in-lane (no peer to route through).

Regenerate `SESSION-STATE.md` from current repo state: read `APP_VERSION`, `git log --oneline -15`, audit/findings summary if present, `git status`, OPEN-item count in `TODO.md`, any coordination logs. Include the **operating-model header** (subagent-lane model; boot via `/ARC-team-Startup`) and the current freeze/away state.

**⭐ NEXT UP analysis** — write a `## ⭐ NEXT UP` section: a ranked top-ten of the most critical open items (from `TODO.md`, by priority + readiness — shovel-ready ranks above un-scoped). If one item dominated the session or is mid-flight/pending-verify, put it at #1 and tee it up (what / decisive test or open question / done criteria). Include any new bug surfaced this session that still needs scoping.

Update `FREDDY.md`: "Last updated" date, "Current version" = post-deploy (or frozen) version, "Recently Active Work" reflects this session, plus any new protocol/behavioral note established.

Mark: `✓ Step 6b — SESSION-STATE.md (+ ⭐ NEXT UP) + FREDDY.md regenerated`

## Step 6c — Durable-record check

Verify every design decision, lane review result (Coach C-findings), or scope change from this session exists in a repo file — not just in this chat. Lane output should already be persisted (Coach → `COACH.md`, Marc → source/`docs/`); if anything's still only in conversation, write it now.

Mark: `✓ Step 6c — All session knowledge persisted to repo`

## Step 6d — Handoff-file freshness check  → USER ACTION

**This is a STOP point.** Present all proposed handoff changes via AskUserQuestion and wait for approval. Files Freddy touches directly in this model:

- **SESSION-STATE.md** — already regenerated in 6b; confirm post-deploy/frozen version + all session commits.
- **FREDDY.md** — version reference, recently-active work, new protocols/behavioral notes.
- **STATUS.md (Dez's board)** — Freddy owns Dez's files in this model. Ensure the board reflects the session's END state (shipped items, parked items, freeze note if away).
- **INBOX.md (Dez)** — confirm clear: every captured item triaged/promoted into `TODO.md` (stamped) or explicitly held.
- **TODO.md** — apply the Step 5 approved updates.
- **COACH.md tail** — if a Coach lane ran, confirm its findings/verdicts are recorded (Freddy persisted them during the session). Run `wc -l COACH.md` — if over the ~1,500-line soft budget, flag for a review-pass (do not blind-trim).
- **CLAUDE.md** — only if a rule/convention changed this session (Freddy edits it in the subagent/solo model; keep changes surgical + surfaced).
- **Auto-memory** — save any feedback / project knowledge / user preferences learned this session to `C:\Users\jon\.claude\projects\C--Users-jon-AppDev-MatrixARC\memory\` + add the one-line `MEMORY.md` pointer. Skip anything derivable from code/git/files already updated above.

Present:
```
HANDOFF FILE UPDATES (pending approval)
────────────────────────────────────────
SESSION-STATE.md: regenerated ✓
FREDDY.md:        - [change ...]
STATUS.md:        - [board END state ...]
INBOX.md:         - [clear / N items to promote]
TODO.md:          - [Step 5 approved set]
COACH.md:         - [tail current / N lines / archive-review needed?]
Memory:           - [memories to save, if any]
```

**STOP and wait for approve / modify / waive.**

Mark: `✓ Step 6d — Handoff changes approved`

## Step 6e — Commit handoff updates

Apply approved edits. If `FREDDY-PASTE.md` exists AND is still in use, regenerate it (full `FREDDY.md` + `---` + full `SESSION-STATE.md`) — but note it is a **legacy browser-drag artifact**; in the subagent model the next `/ARC-team-Startup` reads the repo files directly, so it is optional. Then stage with an **explicit pathspec** and push:
```
git add SESSION-STATE.md FREDDY.md STATUS.md INBOX.md TODO.md [COACH.md CLAUDE.md if changed]
git commit -m "Close out {date}: handoff files updated for next session"
git push origin master
```

Mark: `✓ Step 6e — Handoff files committed and pushed ({SHA})`

## Step 7 — STOP

Display the completed checklist, then:

```
MATRIX ARC — SUBAGENT CLOSE OUT COMPLETE
─────────────────────────────────────────
Version: v{VERSION} ({SHA})   [or: prod frozen at v{VERSION}, deploy skipped]
All changes committed and pushed. Handoff files current.
No peer sessions to clear (subagent model).

Waiting for:
  → Additional work instructions, OR
  → "Closed" to confirm safe shutdown, OR
  → Continue working (aborts close-out)
```

## "Closed" verification

When the user types **"Closed"** after Close Out, verify before agreeing:

1. `git status` — clean (apart from `.claude/worktrees/`).
2. `git log master..origin/master` — empty (everything pushed).
3. Commits on master (or intentionally on a feature branch per the user's explicit choice).
4. TODO.md updates applied or waived.
5. Handoff files (SESSION-STATE.md, FREDDY.md, STATUS.md) committed and pushed.
6. If a freeze was in effect: confirm the summary states deploy was skipped and prod version is unchanged.

There is **no peer clear-check** in this model (Step 6 of `/team-closeout` does not apply).

If all pass: `✓ Session closed cleanly. All changes committed and pushed. Handoff files current. Safe to end.`

If any fail: state which check failed, what needs addressing, and do not declare the session closed. Wait for the user to fix it and type "Closed" again.

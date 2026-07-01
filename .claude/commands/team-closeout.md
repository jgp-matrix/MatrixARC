# /team-closeout — Dev Team Session Close Out

This skill runs the full close out procedure. The Implementer (you) orchestrates.

**Interaction rule:** Whenever this skill requires a user decision (approval, choice, confirmation), use the AskUserQuestion tool with selectable options — never ask as plain text expecting a typed answer.

## Prerequisites

Read `.claude/team-config.json`. If it doesn't exist, tell the user to run `/team-setup` first and stop.

Extract config values:
- `TEAM` = teamName
- `GUIDED` = guidedMode (if true, show tips; if false or missing, skip tips)
- `IMPL_SHORT` = roles.implementer.shortName
- `ARCH_SHORT` = roles.architect.shortName
- `ANALYST_SHORT` = roles.analyst.shortName
- `SESSION_STATE` = files.sessionState
- `ANALYST_ONBOARDING` = files.analystOnboarding
- `ANALYST_PASTE` = files.analystPaste (combined onboarding + session state file for drag-and-drop)
- `ARCH_LOG` = files.architectLog

**Guided mode:** If `GUIDED` is true, show the `💡 TIP` blocks below at each step. If the user says "stop handholding", "I got it", "skip tips", or similar at ANY point, set `guidedMode: false` in `.claude/team-config.json` and stop showing tips for the rest of this session and all future sessions.

## Display the checklist

```
{TEAM} CLOSE OUT CHECKLIST
───────────────────────────
□ Step 1 — Commit uncommitted work (automatic unless ambiguous)
□ Step 2 — Merge feature branch to master + push (automatic)
□ Step 3 — Deploy (automatic)
□ Step 4 — Show session commits (automatic — review output)
□ Step 5 — Surface TODO.md updates
   → USER ACTION: Approve, modify, or waive proposed TODO changes
□ Step 6 — One-paragraph summary (automatic — review output)
□ Step 6b — Regenerate {SESSION_STATE} incl. ⭐ NEXT UP analysis (automatic)
□ Step 6c — Durable-record check (automatic — may surface gaps)
□ Step 6d — Handoff file freshness ({ANALYST_ONBOARDING}, {ARCH_LOG}, memory)
   → STOP: {IMPL_SHORT} presents proposed changes and waits
   → USER ACTION: Approve, modify, or waive each proposed change
□ Step 6e — Commit approved handoff file updates + push (automatic)
□ Step 7 — Notify {ARCH_SHORT} + {ANALYST_SHORT} for close-out confirmation
   → USER ACTION: Copy pastes into each session, relay confirmations back
□ Step 8 — STOP — waiting for user
   → USER ACTION: Direct additional work, type "Closed", or continue working
```

Then run `bash ./tools/closeout-auto.sh` to gather current state.

## Step 1 — Commit uncommitted work

**Guided tip (only if GUIDED):**
```
💡 TIP: Close out starts by saving all your work. If there are unsaved file
changes, they get committed now. If anything looks unfamiliar (files you
didn't create), I'll ask before committing.
```

Run `git status`. If modified or staged files:
- Stage relevant files and commit.
- If ambiguous (unrecognized files, .env, WIP), ask before committing.
- If clean, note it and proceed.

**Exception:** If user previously said "leave on the branch" this session, note it and skip Step 2.

Mark complete: `✓ Step 1 — {committed SHA / already clean}`

## Step 2 — Merge feature branch to master

If current branch is not master and has unmerged commits:
1. Checkout master, merge, push
2. Verify `git rev-parse master origin/master` match
3. Worktree cleanup: prune, clean orphaned dirs, delete feature branch

If already on master or no session commits, skip.

Mark complete: `✓ Step 2 — {merged BRANCH / already on master}`

## Step 3 — Deploy

Run the project's deploy command (e.g., `bash deploy.sh`). If it fails, surface the error and wait.

Mark complete: `✓ Step 3 — Deployed v{VERSION} ({SHA})`

## Step 4 — Show session commits

List all commits this session: `git log --oneline {start-SHA}..HEAD` (or last 10).

Mark complete: `✓ Step 4 — {N} session commits listed`

## Step 5 — Surface TODO.md updates

**Guided tip (only if GUIDED):**
```
💡 TIP: This is where we update the project's to-do list based on what
happened this session. I'll propose changes — you approve, modify, or skip.
Nothing gets edited without your say-so.
```

Based on session work, list:
- Findings to mark RESOLVED (with commit SHAs)
- New findings to capture
- Findings whose notes should be updated

Do NOT auto-edit. Present proposals and **wait for user to approve, modify, or waive**.

Mark complete: `✓ Step 5 — TODO updates {applied / waived}`

## Step 6 — Summary

One-paragraph summary including:
- Master tip SHA after deploy
- Deployed version
- origin/master sync confirmation
- Remaining branches
- What was accomplished, what's pending, next session focus

Mark complete: `✓ Step 6 — Summary provided`

## Step 6b — Regenerate session state + analyst paste file

Regenerate `{SESSION_STATE}` from current repo state:
1. Read version from source
2. `git log --oneline -15`
3. Read audit/findings summary if it exists
4. `git status`
5. Count OPEN items in TODO.md
6. Check for overnight/coordination logs
7. Write `{SESSION_STATE}`
8. Write the **⭐ NEXT UP analysis** into `{SESSION_STATE}` (see below) so {ANALYST_SHORT} can take the reins cold at next startup.

### ⭐ NEXT UP analysis (what the analyst starts on)

Write a `## ⭐ NEXT UP — {ANALYST_SHORT} leads` section into `{SESSION_STATE}`. {ANALYST_SHORT} has no repo access, so this section (+ TODO.md) is the analyst's **entire** decision input — curate it deliberately.

**Always write a ranked top-ten** of the most critical open items (from TODO.md OPEN items, by priority + readiness — shovel-ready / already-scoped items rank above un-scoped ones), one line each. Then:

- **If this session was focused on a specific TODO/bug** (one item dominated the work, or an item is mid-flight / pending verification): **put that item at #1 and tee it up** — one-line what, the decisive test or open question, and the pass/fail or done criteria — so it's addressed first. The rest of the ten follow as the ranked fallback.
- **If there was no single focus** (mixed small work, or the focus item closed cleanly with nothing queued behind it): rank purely by priority and hand the choice to {ANALYST_SHORT}.

Include any new bug surfaced this session that {ANALYST_SHORT} still needs to scope.

Then regenerate `{ANALYST_PASTE}` — write the full content of `{ANALYST_ONBOARDING}`, then a `---` separator, then the full content of `{SESSION_STATE}`. This is the drag-and-drop file the analyst uses at next startup.

Mark complete: `✓ Step 6b — {SESSION_STATE} (+ ⭐ NEXT UP) + {ANALYST_PASTE} regenerated`

## Step 6c — Durable-record check

Verify every design decision, review result, or scope change from this session exists in a repo file — not just in conversation. If anything is missing, write it now.

Mark complete: `✓ Step 6c — All session knowledge persisted to repo`

## Step 6d — Handoff file freshness check

**Guided tip (only if GUIDED):**
```
💡 TIP: This is the most important step for cross-session continuity.
The handoff files are what the NEXT session reads to pick up where you
left off. If they're stale, the next team boots with wrong context —
wrong version numbers, missing shipped items, outdated work queue.

I'll check each file and show you exactly what needs updating. You
approve the changes before I touch anything.
```

**This is a STOP point.** Check each file, present findings, and wait for approval.

- **{SESSION_STATE}** — already regenerated. Confirm post-deploy version and session commits.
- **{ANALYST_ONBOARDING}** — check:
  - Version reference — must match post-deploy version
  - Recently active work — must reflect this session's output
  - Any new protocols or behavioral notes established this session
- **{ANALYST_PASTE}** — will be regenerated automatically in step 6e after all handoff edits are approved. No manual check needed here, but flag if `{ANALYST_ONBOARDING}` changes require a re-merge.
- **{ARCH_LOG}** — if Architect was active, verify tail reflects this session. Implementer does not write to {ARCH_LOG} (Architect-owned) but flags staleness.
- **Auto-memory** — save any feedback, project knowledge, or user preferences learned this session to memory files if applicable.

**Present all proposed changes:**

```
HANDOFF FILE UPDATES (pending approval)
────────────────────────────────────────
{ANALYST_ONBOARDING}:
  - [change 1]
  - [change 2]
{ARCH_LOG}:
  - [status: current / stale]
Memory:
  - [memories to save, if any]
{SESSION_STATE}:
  - Already regenerated ✓
```

**STOP and wait for user to approve, modify, or waive each change.**

Mark complete: `✓ Step 6d — Handoff changes approved`

## Step 6e — Commit handoff file updates

Apply approved edits, then regenerate `{ANALYST_PASTE}` (write full content of `{ANALYST_ONBOARDING}` + `---` separator + full content of `{SESSION_STATE}`). Stage, commit, push:
```
git add {SESSION_STATE} {ANALYST_ONBOARDING} {ANALYST_PASTE} [any other changed files]
git commit -m "Update handoff files for next session"
git push origin master
```

Mark complete: `✓ Step 6e — Handoff files committed and pushed ({SHA})`

## Step 7 — Notify other roles

Generate close-out pastes for the other roles so they can wrap up and confirm. The user copies these into each session and relays confirmations back.

### {ARCH_SHORT} close-out paste (for {ARCH_ENV})

```
SESSION CLOSING — {ARCH_SHORT} close out check.

{IMPL_SHORT} has completed the close out procedure. Before ending:
1. Confirm your TODO.md updates are committed and pushed
2. Confirm {ARCH_LOG} tail reflects this session's findings
3. Any orphaned investigation notes that only exist in this chat?
4. Report: "{ARCH_SHORT} clear" or flag what's missing

Current state: v{VERSION} deployed, master at {SHA}, all handoff files updated.
```

### {ANALYST_SHORT} close-out notification (for {ANALYST_ENV})

```
SESSION CLOSING — {ANALYST_SHORT} close out.

All session work has been committed and handoff files updated.
Anything from this session that only lives in your chat and needs
to be captured before we close? If not: "{ANALYST_SHORT} clear."
```

**Wait for both confirmations.** Do not proceed to "Closed" until the user relays "{ARCH_SHORT} clear" and "{ANALYST_SHORT} clear" (or equivalent).

Mark complete: `✓ Step 7 — {ARCH_SHORT} and {ANALYST_SHORT} confirmed clear`

## Step 8 — STOP

Display the completed checklist, then:

```
{TEAM} CLOSE OUT COMPLETE
──────────────────────────
Version: v{VERSION} ({SHA})
All changes committed and pushed.
Handoff files current.
All roles confirmed clear.

Waiting for:
  → Additional work instructions, OR
  → "Closed" to confirm safe shutdown, OR
  → Continue working (aborts close-out)
```

## "Closed" verification

**Guided tip (only if GUIDED):**
```
💡 TIP: "Closed" is the final handshake. I run a quick verification that
everything is committed, pushed, and the handoff files are current. If
anything fails, I'll tell you exactly what to fix. Once all checks pass,
the session is safe to end — the next /team-startup will pick up cleanly.
```

When user types "Closed" after close out:

1. `git status` — must be clean
2. `git log master..origin/master` — must be empty
3. Commits on master (or intentionally on feature branch per user choice)
4. TODO.md updates applied or waived
5. Handoff files ({SESSION_STATE}, {ANALYST_ONBOARDING}, {ANALYST_PASTE}) committed and pushed
6. {ARCH_SHORT} and {ANALYST_SHORT} confirmed clear (Step 7)

If all pass: `✓ Session closed cleanly. All changes committed and pushed. Handoff files current. Safe to end.`

If any fail: state which check failed and wait for resolution.

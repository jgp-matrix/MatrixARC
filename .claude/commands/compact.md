# /compact — Quick context save before /clear

Fast pre-clear checkpoint. NOT a full closeout — just ensures nothing is lost when the context window resets.

## Steps (all automatic, no user prompts)

### 1. Check working tree

Run `git status`. If there are uncommitted changes:
- Stage and commit with message: `Session checkpoint before context compact`
- If ambiguous files exist (unrecognized, .env, secrets), warn the user and skip those files

If clean, note it and continue.

### 2. Update memory

Read the current memory file at `C:\Users\jon\.claude\projects\C--Users-jon\memory\project_matrix-arc-state.md`.

Update it with:
- Current version (read from latest git tag or recent commit messages)
- What was accomplished this session (from recent commits: `git log --oneline -10`)
- Any pending/in-progress work
- Any open findings traced but not yet fixed

Keep the existing format. Don't remove carried-forward items unless they're resolved.

### 3. Report and instruct

Print a short summary:

```
COMPACT READY
─────────────
Git: {clean / committed SHA}
Memory: updated
Tip: {current HEAD SHA}

Type /clear to reset context. Next session picks up from COACH.md + memory.
```

That's it. No deploy, no TODO updates, no role notifications, no closeout ceremony.

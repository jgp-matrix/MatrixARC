# MatrixARC — Development Rules

## Table of Contents
- [Session startup procedure](#session-startup-procedure)
- [Diagnostic session startup (diagstartup)](#diagnostic-session-startup-diagstartup) — read-only investigation mode
- [Session shutdown procedure](#session-shutdown-procedure) — Close Out + Closed two-step
- [Commit destination](#commit-destination)
- [Parallel Claude session workflow](#parallel-claude-session-workflow)
- [Multi-instance workflow](#multi-instance-workflow) — CCD/Coach/Jon roles, file ownership, H-item discipline
- [Pushover notification behavior](#pushover-notification-behavior) — when to fire phone notifications, source prefixes (ARC DEV / COACH / DEPLOY)
- [Superpowers skills](#superpowers-skills-available-manual-load-local)
- [Project Overview](#project-overview) — architecture, deploy, versioning
- [Troubleshooting](#troubleshooting--first-line-of-defence) — always check ARC Debug Logs first
- [Verification toolkit](#verification-toolkit) — tools/, pre-commit hook, TODO.md
- [Data Retention (CRITICAL)](#data-retention-critical) — Firestore paths, learning databases
- [Key Architecture Notes](#key-architecture-notes) — AI models, save guards, JSX fragment rule, lead times
- [Cloud Functions](#cloud-functions-functionsindexjs) — all 32 exported functions
- [Business Central Integration](#business-central-bc-integration) — offline queue, BC API
- [RFQ / Supplier Portal](#rfq--supplier-portal-system)
- [Project Kanban / Status](#project-kanban--status-system)
- [Notification System](#notification-system)
- [Debug Logging](#debug-logging)
- [Quote / Print System](#quote--print-system) — summary; full detail in `docs/quote-print-system.md`
- [Global State](#global-state) — `_appCtx`, owner priority mode, item lead times

## Session startup procedure
**Before any task work, run `./tools/verify-state.sh`** and confirm the output matches expectations:
- `pwd` is the worktree the session was launched in
- `git branch --show-current` matches the expected branch
- `git log --oneline -5` shows the commits you expect (no surprise commits from the parallel CLI session)
- `git status` is clean (or only contains files you know about)
- Report the active site version (the `APP_VERSION` constant in `public/index.html`, e.g. `v1.19.1107`) alongside the verification output so the user knows which deployed build the session is starting from.

If anything looks unexpected — wrong directory, unfamiliar branch, untracked files you didn't create, commits you didn't make — **stop and surface the contradiction to the user before doing any task work**. Do not auto-clean, auto-checkout, or "fix" the state. The parallel testing/review CLI session may have written artifacts you should not touch.

## Diagnostic session startup (diagstartup)

When the user invokes "diagstartup" or says "this is a diagnostic session," apply the following rules for the duration of the session in addition to the standard Session startup procedure above.

**Posture:** investigate, gather evidence, and report. No code changes, no deploys, no data mutations regardless of how clear the fix looks.

**Allowed without asking (use freely, do not request approval):**
- Read, Grep, Glob, View on any file in the repo
- Bash for read-only inspection: git status, git log, git diff, git show, ls, cat, head, tail, grep, find, wc
- PowerShell commands (Windows-native, equivalent to Bash on this machine). Treat PowerShell with the same read-only criteria as Bash: read-only inspection (Get-ChildItem, Get-Content, Select-String, Where-Object, ForEach-Object for inspection) is auto-allowed. Mutations (Remove-Item, New-Item with mutations, Set-Content writes, Invoke-RestMethod with non-GET methods) still require approval per the existing rules.
- Firebase read commands: firestore:get, firestore:list, functions:log, hosting:channel:list, projects:list
- Any MCP read tool (search, get, list, fetch operations)
- Web fetch and web search for documentation or error reference
- Script execution where the script name matches read-only patterns: verify-*, check-*, inspect-*, *-diagnostic*, *-report*, audit-*. Treat these as read-only by convention.

**Stop and ask before ANY of the following:**
- Edit, Write, MultiEdit on any file
- File or directory deletion (rm, mv to delete, git rm)
- Any git mutation: commit, push, branch creation, merge, rebase, reset, checkout to different branch
- Any firebase deploy, firebase functions:delete, firestore:delete, hosting:disable
- Any npm/pip install, publish, or package mutation
- Any script execution where the script name does NOT match the read-only patterns above
- Any Bash command that mutates files, environment, or external services
- Any MCP write/mutate tool

If uncertain whether something is read-only or mutating, stop and ask.

**Reporting posture:**
The user is likely away from the desk during diagnostic sessions. Do not stall on non-blocking clarification questions. Instead:
- If a question doesn't block progress, log it and keep working on parallel diagnostic paths.
- If genuinely blocked, stop and ask with a specific, actionable request.
- At a natural reporting milestone (full diagnostic complete, or blocked on input), produce a consolidated report and stop.

Do NOT produce a fix plan and stop for approval to act. Produce the diagnostic findings AND the proposed plan together, then stop. The user will review the plan separately before any approval to make changes.

**Confirmation:** Acknowledge the diagstartup boundaries explicitly before starting work. State the diagnostic task and your initial plan before pulling first evidence.

## Session shutdown procedure

The shutdown is a two-step user command: "Close Out" (surface state) followed by "Closed" (confirm safe to end).

### "Close Out" — commit, merge, push, deploy, and surface state

When the user says "Close Out" (or any case-insensitive variant: close-out, closeout, etc.), run the following procedure. The default behavior is to **execute** the full commit→merge→push→deploy pipeline, not just surface state. Only pause for user input when something is ambiguous or fails.

1. **Commit uncommitted work**: Run `git status`. If there are modified or staged files:
   - Stage the relevant files and commit with an appropriate message.
   - If the commit message or scope is ambiguous, ask the user before committing.
   - If the working tree is already clean, note that and proceed.

2. **Merge feature branch to master**: If the current session's commits exist on a feature branch (e.g., `claude/<random-name>`) but not on master:
   a. From the main checkout (`C:/Users/jon/AppDev/MatrixARC`):
      ```
      git checkout master
      git merge <feature-branch>
      git push origin master
      ```
   b. After push, verify: `git rev-parse master origin/master` (must match).
   c. **Worktree + branch cleanup**: The current session runs inside its own worktree directory, so the OS holds a file lock on it — `rm` / `git worktree remove` will fail with "Device busy". This is expected and unavoidable. **Do not leave a manual cleanup note** — instead, clean up *other* sessions' orphaned worktrees now, and the current session's directory will be auto-removed by Claude Code when the session ends.
      ```
      git worktree prune
      # Remove any leftover dirs from prior sessions (skip the current one):
      for d in .claude/worktrees/*/; do [ "$d" != ".claude/worktrees/<current-worktree>/" ] && rm -rf "$d"; done
      git branch -d <feature-branch>   # may fail if current worktree still references it — OK
      ```
   d. If commits are already on master (or session produced no commits), skip the merge.

3. **Deploy**: Run `bash deploy.sh` from the main checkout (`C:/Users/jon/AppDev/MatrixARC`). This auto-bumps the patch version, commits the version bump, tags, pushes, and deploys to Firebase hosting.

4. **Show what was committed**: List all commits made this session (use `git log --oneline <start-SHA>..HEAD` or last 10 if unsure of session start).

5. **Identify TODO.md updates**: Based on what was accomplished, list:
   - Findings that should be marked RESOLVED with their commit SHAs
   - New findings that should be captured (with proposed wording)
   - Findings whose investigation notes should be updated
   Do not auto-edit TODO.md — surface the proposed changes for user approval.

6. **Provide a one-paragraph summary**: What was accomplished, what's still pending, what the next logical session would address. Must include:
   - Master's current tip SHA after deploy
   - Deployed version number
   - Confirmation that origin/master matches local
   - Any branches that remain (feature branch retained due to active worktree, etc.)

7. **Stop.** Wait for the user to either:
   - Direct additional actions (update TODO.md, etc.) — execute as instructed
   - Type "Closed" — confirm safe shutdown (see below)
   - Continue working — abort the close-out

**Exceptions** (pause and ask instead of auto-executing):
- If `git status` shows files the user might not want committed (e.g., unrecognized files, .env, WIP experiments), ask before committing.
- If the user previously said "leave on the branch for now" during the session, skip merge and flag it in the summary.
- If `deploy.sh` fails, surface the error and wait for direction.

### "Closed" — final confirmation

When the user says "Closed" (or any case-insensitive variant: closed, close, done) AFTER a Close Out has been run, perform a final verification before treating the session as ended:

1. Re-run `git status` — must be clean (no modified, staged, or untracked files apart from `.claude/worktrees/`).

2. Re-run `git log master..origin/master` — must be empty (everything pushed).

3. **Verify commits are on master (or intentionally on feature branch).** If commits exist on a feature branch but not on master, AND the user did not explicitly choose "no" or "not yet" during Close Out, fail the close-out check with:

   > "Commits remain on feature branch `<name>` and were not merged. Either merge them now, or confirm 'leave on branch' to proceed."

   If user confirmed "leave on branch" during Close Out, allow Closed to proceed but note in the confirmation:

   > "✓ Session closed cleanly. Note: commits remain on feature branch `<name>` per user choice."

4. Confirm any TODO.md updates surfaced in Close Out have been either applied or explicitly waived by the user.

5. If all checks pass: respond "✓ Session closed cleanly. All changes committed and pushed. Safe to end."

6. If any check fails: respond with which specific check failed, what state needs to be addressed, and do not declare the session closed. Wait for the user to address it and type "Closed" again.

The "Closed" command is the user's contract that the session is genuinely done. CCD's job is to verify the state matches that claim before agreeing.

## Commit destination

CCD worktrees check out a feature branch by default (e.g., `claude/<random-name>`). Work landing only on that branch is invisible to master and to future sessions.

The default sequence at the end of any session that produced commits:

1. Commit the work in the CCD worktree (on the feature branch — this is fine and expected).
2. Merge to master and push to origin via the Close Out procedure (see below).

Exceptions (do not auto-merge):
- Investigation-only sessions that produced no commits (no merge needed).
- Work-in-progress sessions where the user explicitly says "leave on the branch for now."
- Multi-day work spanning sessions where the branch is intentionally retained.

## Parallel Claude session workflow
The user runs **two Claude sessions in parallel** against this codebase:

- **Development session (Claude Code IDE / this session)** — owns code edits, deploys (`bash deploy.sh`), Firestore rule changes, Cloud Function deploys (`firebase deploy --only functions:...`), and live verification via Claude in Chrome browser tools. All `Edit`/`Write` operations originate here.
- **Testing / review session (separate CLI)** — runs read-only scans, code review (`tools/review.sh`), test suites, and diagnostic queries. Does NOT modify source files. Generated artifacts (e.g. `TODO.md`) appear in the working tree and are imported into the dev session's todo list.

**Coordination rules for the development session (this one):**
- Re-read files before editing — the testing session may add review artifacts; tag them as input, not as files to ignore.
- Don't assume the working tree is the same as last edit. Quick `git status` before risky changes is cheap insurance.
- If the user says "the CLI is touching X," skip X until they say it's safe.
- Do not run `tools/review.sh` or other test/scan scripts from the dev session — that's the CLI's job, and concurrent runs may corrupt their output files.

## Multi-instance workflow

Three Claude instances plus Jon operate against this codebase with distinct roles.

### Roles

| Instance | Role | Owns |
|----------|------|------|
| **CCD** (Claude Code IDE) | Implementation, empirical investigation, regression testing, deploys | Source code, test artifacts, H{N}-PLAN.md files |
| **Coach** (separate CC terminal) | Architectural review, code-grounded analysis, finding log | COACH.md (all writes) |
| **Jon** | Priority decisions, plan approval, final sign-off | All approval gates |
| **Claude.ai** (browser conversation) | Outside-the-repo strategic perspective | No file ownership |

### File ownership boundaries

| File / path | Writer | Others |
|-------------|--------|--------|
| `COACH.md` | Coach only | CCD and Jon read-only |
| `H{N}-PLAN.md` (repo root) | CCD | Coach reads for review |
| `src/app.jsx`, `functions/index.js`, all source | CCD | Coach reads for review |
| `tests/extraction-baseline/` | CCD | Coach reads for review |
| `TODO.md` | CCD (during Close Out) | Coach references |

### Discipline for non-trivial work items (H-items)

1. **Baseline** — capture regression test data before any changes.
2. **Plan** — CCD drafts `H{N}-PLAN.md` at repo root.
3. **Coach review** — Coach reviews plan, logs verdict as a C-finding in `COACH.md`.
4. **Jon approves** — no implementation until explicit approval.
5. **Implement** — CCD writes code, runs `validate_jsx.js`.
6. **Regression test** — CCD runs tests against affected production panels. All previously-passing cases must still pass; fix-specific success criteria must be met.
7. **Coach review** — Coach reviews test results before finalization.
8. **Jon final-approves** — H-item is closed.

Trivial fixes (typos, single-line config changes, report-field corrections) skip steps 2-4 and 7 — implement directly, test, deploy.

### Naming conventions

- **H{N}**: Work items requiring implementation (H6, H7, H9, etc.)
- **C{N}**: Coach findings logged in `COACH.md` (C1-C13, etc.)
- **H{N}-PLAN.md**: Implementation plan for work item H{N}

## Pushover notification behavior

Fire a Pushover notification at the completion of major tasks so the user knows to return to the desk. All Claude sessions (CCD, Coach) follow these rules.

**Correct mechanism — pwsh via Bash tool:**
```powershell
pwsh -NoProfile -File "C:/Users/jon/.claude/tools/notify.ps1" -Message "[SOURCE]: [description]" -Priority 0
```
Call `notify.ps1` directly through the Bash tool. This fires to Pushover unconditionally regardless of terminal focus or window state. Always works.

**DO NOT USE Claude Code's built-in `PushNotification` tool.** It has focus-aware suppression — it does NOT fire when the terminal has focus, which defeats the purpose. Always use the pwsh/Bash mechanism above instead.

**Credentials:** `C:\Users\jon\.claude\pushover.json` (user_key + api_token). Do not log or echo these values.

### Source prefix (REQUIRED)
Every notification message MUST begin with a source prefix so Jon knows which session sent it and can route to the right interface:
- **`ARC DEV:`** — Claude Code Desktop sessions (implementation, planning documents, code writing, deploys)
- **`COACH:`** — Claude Code Terminal sessions (verification, architecture review, code audit)
- **`DEPLOY:`** — used by `deploy.sh` directly for deploy completions (Priority 1)

### Fire notification for (major tasks):
- Completing a verification report (Coach role)
- Finishing a planning document (supplement, detailed plan, hotfix spec)
- Completing a multi-phase implementation
- Finishing a smoke test analysis
- Completing a substantial codebase audit
- Any task where the user said "text me when done" / "notify me" / "ping me"

### Do NOT fire for:
- Quick replies to simple questions
- Single-file edits
- Status checks or progress updates
- Mid-task confirmations

### Priority levels:
- **Priority 0** (normal): All major task completions listed above
- **Priority 1** (high): Reserved for deploys — handled directly in `deploy.sh`, not via this instruction

### Message format:
`[SOURCE]: [brief description]`. Examples:
- `"COACH: Milestone D verification report complete"`
- `"ARC DEV: Plan v3 with R1-R8 refinements ready"`
- `"ARC DEV: Phase 4 implementation deployed, smoke test pending"`
- `"COACH: Hotfix spec finalized"`
- `"DEPLOY: v1.20.42 deployed (commit a3e4d25e)"`

### Shell helper:
`done` is on the user's PATH (`C:\Users\jon\.claude\tools\done.cmd`). The user can append `&& done` to any terminal command for a notification on success. In Git Bash (e.g., `deploy.sh`), call `pwsh` directly instead of `done.cmd`.

## Superpowers skills available (manual-load, local)
Jesse Vincent's `obra/superpowers` skill pack is cloned at `C:\Users\jon\superpowers\skills\`. The Claude Code plugin system isn't available in this environment, so skills are loaded on-demand via `Read` on `C:\Users\jon\superpowers\skills\<skill-name>\SKILL.md`.

**Claude should proactively offer to load a skill when a task matches:**
- **`systematic-debugging`** — tricky reproducible bug where the cause isn't obvious. Offer before diving in.
- **`writing-plans`** — multi-step feature work (3+ files or 30+ min estimated). Offer before writing code.
- **`brainstorming`** — vague / exploratory feature requests; socratic questioning before committing to a design.
- **`verification-before-completion`** — run before declaring a fix "done", especially for fixes the user explicitly asked to test.
- **`using-git-worktrees`** — when running experimental branches in parallel with mainline work.

Other skills present but lower-utility for this solo/single-file codebase: `subagent-driven-development`, `executing-plans`, `test-driven-development`, `requesting-code-review`, `receiving-code-review`, `dispatching-parallel-agents`, `finishing-a-development-branch`, `writing-skills`, `using-superpowers`.

### Trigger phrases the user may use
- **"use Superpowers"** / **"apply Superpowers"** / **"check Superpowers"** → user doesn't know or care which specific skill; Claude picks the best match for the current task from the list above, loads it, and applies it. If genuinely ambiguous, ask one clarifying question ("the task looks like a debugging problem vs. a design problem — which is it?") then proceed.
- **"use the <skill-name> skill"** → load exactly that skill by name.
- **"Superpowers on this"** / **"Superpower it"** → same as "use Superpowers".
- If multiple skills apply (e.g. a multi-step feature with a bug inside), load them in sequence: plan first, then debug as issues surface.

### User preference: always render spec + plan content inline
When the brainstorming or writing-plans skill produces a design spec or implementation plan document, SAVE it to the standard location (`docs/superpowers/specs/…` or `docs/superpowers/plans/…`) AND ALSO paste the full file content into the chat. User prefers to read specs/plans in the chat directly rather than opening the file. For long files (500+ lines) offer to chunk it into sections rather than a single message — but always show the content inline unless the user explicitly asks to just see the file path.

## Project Overview
- **App**: Firebase-hosted at https://matrix-arc.web.app
- **Architecture**: Source-and-bundle app:
  - `src/app.jsx` — JSX source of truth (~2 MB, **edit this** when changing app behavior).
  - `public/index.html` — HTML shell (~30 KB, references `index.bundle.js`). Edit when changing meta tags, fonts, head scripts, etc.
  - `public/index.bundle.js` — generated by `validate_jsx.js`, gitignored, regenerated on every deploy.
  - Cloud Functions in `functions/index.js`.
  - **Build step:** `bash deploy.sh` runs `node validate_jsx.js` to compile JSX → JS via Babel before deploying. Eliminates the ~1-2 sec in-browser Babel cost. Local Babel toolchain: `@babel/core` + `@babel/preset-react` (classic runtime, matches what babel-standalone used to do in the browser).
- **Deploy hosting**: `bash deploy.sh` — auto-bumps patch version, commits, tags, pushes, deploys hosting
- **Deploy functions**: `firebase deploy --only functions` — must be run separately when `functions/index.js` changes
- **User always wants deploy after changes**
- **Git workflow**: `deploy.sh` handles commit + push + tag automatically. Never manually set a git tag before running deploy.sh (causes double version bump).
- **Versioning**: `vMajor.Minor.Patch` (semver). Current version lives in `APP_VERSION` constant in `public/index.html` — auto-bumped by `deploy.sh`, do not edit by hand.
  - **Patch** (x.x.+1): Bug fixes, cosmetic/wording tweaks, adjusting rates/thresholds, fixing a value that wasn't stored
  - **Minor** (x.+1.0): New AI prompt capabilities, new device types, new labor categories, new UI sections, restructuring data flow — anything that changes what the app can detect or output
  - **Major** (+1.0.0): Schema changes requiring migration, breaking changes to saved data format, `APP_SCHEMA_VERSION` bumps
- **JSX validation**: Run `node validate_jsx.js` before deploying to catch JSX errors early

## Troubleshooting — First Line of Defence

**When investigating any bug, stall, or user-reported issue in ARC, always check the in-app Debug Logs first** before diving into source code. Access via Settings → Open Debug Logs (admin only), or query Firestore directly: `companies/{companyId}/debugLogs` ordered by `createdAt` desc. Filter out `bcFuzzyLookup` noise — look for `error`/`warn` severity entries and extraction/validation-related sources. The logs capture uncaught errors, console.error/warn, and user-reported issues with breadcrumbs, and are often the fastest path to root cause.

## Verification toolkit

Located in `tools/`. Use these alongside development:

- `./tools/check-syntax.sh` — sanity-check that all JS parses; run after pulls or refactors.
- `./tools/review.sh [optional path]` — headless Claude review of uncommitted changes (`claude -p` with a diff). Run before non-trivial commits on pricing / Firestore / functions code.
- `./tools/preflight-functions.sh` — always run before `firebase deploy --only functions`.
- `./tools/install-hooks.sh` — one-time setup per checkout / per worktree. Installs the pre-commit hook into the active git hooks directory (worktree-aware via `git rev-parse --git-common-dir`). Re-run is idempotent.

**Pre-commit hook** (auto-fires on every `git commit` once installed):
- BLOCKS the commit if any staged `.js` file fails `node --check`.
- Runs an advisory Claude review (60s timeout) on staged files matching the risk pattern `pricing|quote|margin|markup|bom|firestore|rules|deploy|functions/index`. Review is advisory only — never blocks the commit.

**Outstanding findings**: see `TODO.md`. Each entry tagged OPEN / RESOLVED (with commit SHA) / STALE. Update when findings change state — don't delete history, mark it.

**Known toolkit gap**: hook only covers `.js`, not `.jsx`. Most of `src/app.jsx` (~2 MB, the bulk of the codebase) is unreviewed by the automated hook. Tracked as deferred toolkit improvement T1/T2 in `TODO.md`.

## Data Retention (CRITICAL)

This app is used for real production projects. **No user data may ever be lost due to code changes.**

### Rules

1. **Never remove or rename Firestore fields.** If a field is no longer needed, stop writing to it but always preserve existing values on read/save.

2. **Never add caps or limits to learning databases.** The following collections grow without bounds:
   - `users/{uid}/config/alternates` — part crosses / superseded parts
   - `users/{uid}/config/corrections` — formatting & extraction error corrections
   - `users/{uid}/config/page_type_learning` — drawing type classification learning
   - `users/{uid}/config/layout_learning` — panel hole / layout analysis corrections
   - `users/{uid}/config/supplierCantSupply` — parts vendors have flagged as cannot-supply
   - `users/{uid}/config/supplierCrossRef` — supplier part number cross-references

3. **Always include `schemaVersion: APP_SCHEMA_VERSION`** in project saves (both `saveProject` and `saveProjectPanel`). If the schema changes, bump `APP_SCHEMA_VERSION` and add migration code in `loadProjects`.

4. **Only strip `dataUrl` on Firestore save** (1MB limit). Never strip any other fields. All metadata flags (`isCrossed`, `crossedFrom`, `isCorrection`, `correctionType`, `priceSource`, `bcFuzzySuggestions`, `bomVerification`, `extractionFeedbackLog`, `cannotSupply`, etc.) must be preserved.

5. **Test backward compatibility** after every change: load an existing project and verify all data renders correctly.

6. **Never overwrite user data silently.** If merging new extraction results with existing BOM, preserve manual edits (rows with `priceSource: "manual"` or `priceSource: "bc"`).

### Firestore Data Locations

| Data | Path | Notes |
|------|------|-------|
| Projects | `users/{uid}/projects/{id}` | Full project + panels |
| Part crosses | `users/{uid}/config/alternates` | Auto-applied on extraction |
| Corrections | `users/{uid}/config/corrections` | Auto-applied on extraction |
| Page type learning | `users/{uid}/config/page_type_learning` | Fed into AI detection prompt |
| Layout learning | `users/{uid}/config/layout_learning` | Fed into layout/enclosure AI prompts |
| Supplier cannot-supply | `users/{uid}/config/supplierCantSupply` | `{records:[{vendorName,partNumber,description,markedAt,rfqNum}]}` |
| Supplier cross-ref | `users/{uid}/config/supplierCrossRef` | Supplier part → BC part mappings |
| RFQ history | `users/{uid}/rfq_history` | Log of all sent RFQ emails |
| Notifications | `users/{uid}/notifications/{id}` | In-app notifications (read/unread) |
| RFQ upload tokens | `rfqUploads/{token}` | Supplier portal session docs |
| Page images | Firebase Storage `pageImages/{uid}/{projectId}/{pageId}.jpg` | Loaded via `ensureDataUrl` |
| Original PDFs | Firebase Storage `originalPdfs/{uid}/{projectId}/{fileId}.pdf` | Retained for native PDF input to Anthropic during BOM extraction. Image-based extraction is the fallback for legacy projects. Page metadata carries `originalPdfPath` + `pageNumber`. |
| Supplier uploads | Firebase Storage `supplierUploads/{token}/{filename}` | PDF uploads from supplier portal — MIME-restricted to `application/pdf` |
| Team members | `companies/{companyId}/members/{uid}` | Role: admin/edit/view |
| Team invites | `companies/{companyId}/pendingInvites/{token}` | Pending email invitations — token generated server-side via `inviteTeamMember` Cloud Function |
| FCM push tokens | `users/{uid}/fcmTokens/{tokenHash}` | Push notification device tokens |
| Quote counter | `users/{uid}/config/quoteCounter` | Sequential quote number (next field) |
| Anthropic spend ledger | `users/{uid}/config/anthropicLedger` | `{monthKey, monthCents, totalCents, lastCallAt, lastCallModel, lastCallCents, lastCallUsage}` — running monthly burn for the toolbar pill. Updated on every API call by `_recordAnthropicUsage`. |
| Debug logs | `companies/{companyId}/debugLogs/{entryId}` | Error captures + user-reported issues; admin-readable |

### Learning Databases

All learning is persisted to Firestore and applied automatically:
- **Alternates**: When a user crosses a part number, it's saved and auto-applied to future BOMs if `autoReplace: true`
- **Corrections**: When a user fixes an OCR/formatting error, the correction is auto-applied to future extractions
- **Page type learning**: When a user corrects AI page type detection, the correction history is included in future AI prompts
- **Layout learning**: When a user corrects panel hole count in the labor estimate, the AI count vs user count is saved and fed into future layout/enclosure analysis prompts
- **Extraction feedback**: When a user provides BOM correction feedback and re-extracts, the feedback is logged in `panel.extractionFeedbackLog`
- **Cannot-supply**: When a supplier marks an item as cannot-supply in the portal, it's saved for future RFQ tracking

## Key Architecture Notes

### Schematic Authority
Schematic is the authority for door device count — layout analysis often misclassifies backpanel devices as door cutouts.

### Wire Counting
AI returns a classified wire list (`internal: true/false`), code filters programmatically. Vertical bus lines, dashed lines, and panel-exiting wires are excluded.

### AI Model Usage
| Task | Model | Input format | Notes |
|------|-------|--------------|-------|
| BOM extraction | Opus + thinking | **Native PDF document** when available; image fallback for legacy projects | Bypasses our render→JPEG→resize→re-encode pipeline for vector-text fidelity. Resolves OCR character-merging on dense D-size BOMs. Prompt cached via `cache_control: ephemeral`. |
| Schematic / layout / pricing analysis | Sonnet | Image | |
| Page detection / part verification | Haiku | Image | |
| Supplier quote price extraction | **Sonnet 4** (via Cloud Function) | Image | Prompt is split into static system block (cached) + dynamic user block (per-token line items). |
| BC Item Browser row locate | Haiku (table boundaries + math) | Image | |

**Model gotcha:** Sonnet 4.6 does NOT support assistant prefill — use Haiku for prefill-based JSON extraction.

### Extraction Path Change Protocol

**Never reintroduce a previously-deleted extraction path without the following:**

1. **Commit message must reference the prior deletion** — cite the commit SHA and reason for the deletion. Example: "Reintroducing crop-path extraction (deleted in 571105e9 due to OCR character-merging on dense BOMs). Changes since deletion: [list what's different]."

2. **Test case must reproduce the original failure mode** — before merging, verify the new implementation does NOT reproduce the failure that motivated the prior deletion. For BOM extraction paths, this means extracting the same project/page that originally failed and comparing part numbers.

3. **Path priority must preserve PDF-native precedence** — when both PDF and image data are available, PDF-native MUST take priority. Image/crop paths are fallbacks only. Any code that checks `hasCroppedBom` or `hasImage` before `hasPdf` is a bug.

4. **Extraction path is logged** — the `extractionPath` field in function log output (`pdf-native`, `bom-region-crop`, `image-fallback`) enables post-deploy auditing. If changing path selection logic, verify the log field still accurately reports the chosen path.

5. **All three call sites must stay in sync** — path priority in `extractBomPage` Cloud Function, `extractBomBatch` Cloud Function, and the client-side `extractBomPage()` fallback chain must use the same precedence order. Changing one without the others creates silent divergence.

6. **Direct commits to master are prohibited** for changes to extraction path priority, page type detection, save path, BC sync logic, or any code path previously deleted for being broken. These changes require either: (a) a PR with description and reviewer, or (b) explicit pre-implementation approval recorded in the commit message (e.g., "Approved per Claude review session 2026-XX-XX").

**Rationale:** On May 14 (571105e9), image-based extraction was deleted because JPEG compression artifacts caused ~20 wrong part numbers on dense D-size BOMs (character-merging: B↔8, I↔1, S↔5, 2↔3). On May 20 (8d984699), crop-based image extraction was reintroduced with crop-first priority, unknowingly re-enabling the same failure mode — via direct commit to master with no PR, no documented rationale, and no test case. Diagnosed May 22 after PRJ402107 stalled at 1% and produced OCR errors. This protocol prevents recurrence.

### Anthropic Cost-Attack Hardening
The supplier portal Cloud Function `extractSupplierQuotePricing` is hardened against cost-attack via leaked tokens:
- Hard-cap `pageImages.length > 25` per call
- Per-image size cap (~5 MB raw)
- Reject when token `status === "submitted" || "dismissed"`
- Per-token call counter (`rfqUploads/{token}.aiCallCount`, max 10 lifetime)
- Per-token spend ledger (`rfqUploads/{token}.aiSpendCents`, max 500¢ = $5 lifetime)
- `maxInstances: 5` on the function — also applied (10 default, 1-3 for heavy scrapers) to every other callable

### Image Persistence
- `ensureDataUrl`: loads storage images via `<img crossOrigin>` + canvas (avoids CORS fetch issues)
- `dataUrl` is stripped on Firestore save (1MB limit), `storageUrl` is preserved
- Thumbnails use `pg.dataUrl || pg.storageUrl`
- Upload happens at end of `addFiles` after extraction/validation

### BOM Row Highlighting
A row gets a red background if ANY of these are true (see `_isBomRowFlaggedRed`):
1. `qty === 0` (excludes labor / customer-supplied)
2. `unitPrice === 0` (excludes labor / customer-supplied)
3. `priceDate` missing OR older than `_pricingConfig.defaultStaleDays` (default 60 days). Only applied to "priceable" rows — excludes labor, customer-supplied, contingency, job-buyoff, crate, Matrix Systems vendor.

### Cross-User Save Guards
- `saveProject` reads current Firestore doc inside its save logic and PRESERVES admin-set fields that the incoming write would clobber:
  - `ownerTakeoverActive` if server has unexpired takeover and incoming write doesn't include it
  - `ownerLockActive` if server has it set and the writer is not the project owner
  - `reviewNotes` / `reviewShapes` (per-page) if incoming save is missing notes that exist on the server
- Same pattern as the storageUrl regression guard — single Firestore read per save, multiple guards layered on top.
- Quote-print lock: `quotePrintLock = {lockedBy, lockedByName, lockedAt, expiresAt}` on the project doc; prevents two users from printing the same quote within a 30-second window.
- ECO transactional create: `+ New ECO` runs inside `runTransaction`; aborts if another draft already exists.

### JSX Fragment Rule (CRITICAL)
When rendering a modal alongside a component's root `<div>`, the return MUST use a fragment:
```jsx
return(<>
  <div>...main content...</div>
  {showModal&&<MyModal .../>}
</>);   // <-- closing </> is REQUIRED
```
Missing `</>` or two root elements = site breaks. Always verify both `<>` AND `</>` match.

### Control Panel Lead Time
`computeControlPanelLeadTime(panel, project)` returns the panel's ship date from `longestItemLeadDays + laborDays + productionDays` (sum-based, not max). Feeds a live chip to the left of each panel's status pill in QUOTE SUMMARY; clicking opens an override popover. `panel.productionDays` is a user-entered duration (0-365 days). `dailyCrewHours` + `leadTimeBatchSeconds` live in `LABOR_RATES`. Full spec: `docs/superpowers/specs/2026-04-24-control-panel-lead-time-design.md`. Plan: `docs/superpowers/plans/2026-04-24-control-panel-lead-time.md`.

### Batched BC Lead-Time Writeback
Cell-level `leadTimeDays` edits enqueue in `_leadTimeBcQueue.current.pending` (Map keyed by rowId, dedupes re-edits) and flush via a 30-second debounced timer. Amber `⏳ N pending BC sync` pill in the BOM toolbar exposes manual force-flush; `visibilitychange` triggers best-effort flush when the tab hides. Configurable via `LABOR_RATES.leadTimeBatchSeconds`. Bulk paths (Push All, supplier portal Apply, Upload Supplier Quote) push immediately — deliberate user-initiated actions on complete data.

## Cloud Functions (`functions/index.js`)

Functions deploy separately from hosting — `firebase deploy --only functions`.

**Team & Admin**

| Function | Trigger | Purpose |
|----------|---------|---------|
| `inviteTeamMember` | HTTPS callable | Creates pending invite, returns token |
| `acceptTeamInvite` | HTTPS callable | Validates token, adds user to company |
| `removeTeamMember` | HTTPS callable | Admin removes a member |
| `updateMemberRole` | HTTPS callable | Admin changes a member's role |
| `resetTeamApiKeys` | HTTPS callable | Resets API keys for team members |
| `sendInviteEmail` | HTTPS callable | Sends invite email via SendGrid |
| `diagnoseMemberApiKey` | HTTPS callable | Debug tool for API key issues |
| `testTeamsWebhook` | HTTPS callable | Test endpoint to verify Teams webhook integration |

**Supplier Portal & RFQ**

| Function | Trigger | Purpose |
|----------|---------|---------|
| `onSupplierQuoteSubmitted` | Firestore trigger on `rfqUploads/{token}` | Fires when status→"submitted": creates notification + sends email to ARC user |
| `extractSupplierQuotePricing` | HTTPS callable | Sends PDF page images to Claude Sonnet 4, returns extracted prices/lead times |
| `sendEngineerQuestionEmail` | HTTPS callable | Sends formatted engineering questions email via SendGrid + push notification |

**BOM Extraction**

| Function | Trigger | Purpose |
|----------|---------|---------|
| `extractBomPage` | HTTPS callable | Server-side BOM extraction (single page). Accepts native PDF (`{pdfPath, pageNumber}`) or image fallback. Client tries this first via `extractBomPageViaServer`; falls back to legacy direct API on error. Prompt mirrored at `functions/bomPrompt.js` — keep in sync with `BOM_PROMPT` in app.jsx. |
| `extractBomBatch` | HTTPS callable | Batch BOM extraction (v1.20.5). Downloads PDF once, slices + extracts multiple pages in parallel (concurrency 4). Client sends all BOM pages sharing a pdfPath in one call via `extractBomBatchViaServer`; per-page fallback for failures. 540s timeout, 2GB, max 20 pages/batch. |

**Purchasing & Engineering**

| Function | Trigger | Purpose |
|----------|---------|---------|
| `poCreateOrder` | HTTPS callable | Creates BC purchase order (via `./purchasing` module) |
| `poUpdateStatus` | HTTPS callable | Updates BC purchase order status (via `./purchasing` module) |
| `onCustomerReviewSubmitted` | Firestore trigger | Fires on customer review submission (via `./engineering` module) |
| `engSendReviewEmail` | HTTPS callable | Sends engineering review email (via `./engineering` module) |

**ECOs** (via `./ecos` module)

| Function | Trigger | Purpose |
|----------|---------|---------|
| `onEcoCreatedCompany` | Firestore trigger | Logs ECO creation at company level |
| `onEcoCreatedUser` | Firestore trigger | Logs ECO creation at user level |
| `onEcoUpdatedCompany` | Firestore trigger | Logs ECO update at company level |
| `onEcoUpdatedUser` | Firestore trigger | Logs ECO update at user level |

**Scrapers & Vendor Pricing**

| Function | Trigger | Purpose |
|----------|---------|---------|
| `codaleRunScrape` | HTTPS callable | On-demand Codale scrape (540s timeout, 2GB) |
| `codaleScheduledScrape` | Pub/Sub schedule | Scheduled Codale price scrape (540s timeout, 2GB) |
| `codaleTestScrape` | HTTPS callable | Test scrape for Codale (300s timeout, 2GB) |
| `customScraperLookup` | HTTPS callable | Single-item custom scraper lookup (300s, 2GB) |
| `customScraperBatch` | HTTPS callable | Batch custom scraper (540s, 2GB) |
| `mouserSearch` | HTTPS callable | Mouser part search (120s) |
| `digikeySearch` | HTTPS callable | DigiKey part search (120s) |
| `searchVendorPricing` | HTTPS callable | Multi-vendor pricing aggregation (300s, 512MB) |
| `bulkMfrList` | HTTPS callable | Bulk manufacturer listing |
| `bulkMfrLookup` | HTTPS callable | Bulk manufacturer part lookup |

**Monitoring & Debug**

| Function | Trigger | Purpose |
|----------|---------|---------|
| `onIssueReported` | Firestore trigger | Fires when a debug log entry is created |
| `monitorAnthropicModels` | Scheduled | Monitors Anthropic model availability/changes |

### Environment Variables (set via Firebase, in `functions/.env`)
- `SENDGRID_API_KEY` — required for email sending
- `APP_URL` — defaults to `https://matrix-arc.web.app`
- `TEAMS_WEBHOOK_URL` — Power Automate webhook URL for Teams channel notifications (optional)
- `ANTHROPIC_API_KEY` — required for server-side AI calls (`extractBomPage`, `extractSupplierQuotePricing`, `monitorAnthropicModels`)
- `CODALE_USERNAME` / `CODALE_PASSWORD` — Codale scraper authentication
- `MOUSER_API_KEY` — Mouser part search API
- `DIGIKEY_CLIENT_ID` / `DIGIKEY_CLIENT_SECRET` — DigiKey part search API
- `OEMSECRETS_API_KEY` — OEMSecrets pricing API

## Business Central (BC) Integration

### BC Offline Queue
When BC is offline, write operations are queued in localStorage (`_arc_bc_queue`) and retried automatically on reconnect.
- `bcEnqueue(type, params, description)` — adds operation to queue
- `bcProcessQueue()` — called on reconnect, retries up to 5 times each
- `_bcQueueCountSetter` — global setter pattern to update toolbar badge
- Queue types: `createPurchaseQuote`, `attachPdf`, `patchJob`, `syncTaskDescs`
- Amber "⏳ N pending" badge shows in toolbar when queue is non-empty

### Company Info from BC
`bcFetchCompanyInfo()` pulls `name`, `address`, `phone` from `/companies(id)` endpoint on connect.
Stored in `_appCtx.company = {name, logoUrl, address, phone}` and Firestore.
Used by all RFQ document builders via `companyInfo` parameter.

### BC API
- Base URL: `BC_API_BASE` constant
- Purchase quotes: `purchaseQuotes`, `purchaseQuoteLines` endpoints
- Company info: `/companies(id)` endpoint

## RFQ / Supplier Portal System

High-level flow:
1. User sends RFQ emails → creates `rfqUploads/{token}` doc in Firestore with lineItems, expiry, etc.
2. Supplier receives email with "Upload Quote →" button link (`?rfqUpload=TOKEN`)
3. Supplier opens portal page, uploads PDF
4. Auto-scan: all PDF pages processed in batches of 20 (Anthropic API limit), no user intervention needed
5. Claude Sonnet 4 extracts prices/lead times with fuzzy part# matching
6. Supplier reviews, corrects, marks "Cannot Supply" for unavailable items, enters lead time
7. On submit: `rfqUploads/{token}` updated to `status: "submitted"`
8. Cloud Function `onSupplierQuoteSubmitted` fires → creates notification + sends email to ARC user
9. Bell badge appears in ARC toolbar; clicking notification navigates to project + opens submissions modal

Helper details (fuzzy matching, cannot-supply tracking, RFQ email structure, button names): see `docs/rfq-supplier-portal.md`.

## Project Kanban / Status System

Five columns (`draft`, `in_progress`, `evc`, `active`, `purchasing`) drive the project board. Routing logic: `bcPoStatus === "purchasing"` → Purchasing In Progress; `bcPoStatus === "Open"` → Active (Ready for Purchasing); otherwise the project's `status` field value. Full column labels, color values, and the source snippets: see `docs/kanban-status.md`.

## Notification System

In-app + push notifications for MatrixARC. Bell icon in the toolbar turns amber with a red badge when unread; clicking a supplier-quote notification navigates to the project and auto-opens `PortalSubmissionsModal`. Push triggers: supplier-quote submissions and engineer-question emails. Optional Teams channel posting via `postToTeams()`. Engineering Questions workflow (`panel.engineeringQuestions[]`, statuses: `open` / `answered` / `skipped` / `on_quote`) drives the pulsing yellow badge in QUOTE SUMMARY and the "Questions for Customer" block on printed quotes. Full schema, FCM token storage, PWA manifest details, and Engineering Questions specifics: see `docs/notification-system.md`.

## Debug Logging

Client-side error capture + user-reported issue pipeline. Captures uncaught errors, promise rejections, and `console.error` / `console.warn` calls automatically; users can also file reports via the floating `🐛 Report Issue` button. Logs are append-only at `companies/{companyId}/debugLogs/{entryId}` (or `users/{uid}/debugLogs/{entryId}` fallback) — admin-readable, immutable. Admins view the stream via **Settings → Debug Logs**. Each entry carries severity, source, breadcrumbs (last ~30 events), and project/panel context. Full schema, client-capture wiring, and UI surfaces: see `docs/debug-logging.md`.

## Quote / Print System

No screen preview — `window.print()` directly from DOM-hidden `#quote-doc`. Quote numbering format `MTX-Q######`, auto-assigned on first print. Full architecture, print CSS, font sizes, BC upload filenames, and constraints: see `docs/quote-print-system.md`.

## Global State

### `_appCtx`
```js
let _appCtx = {
  uid: null,
  companyId: null,
  role: null,
  projectsPath: null,
  configPath: null,
  company: { name: null, logoUrl: null, address: null, phone: null }
};
```
Company info is populated from BC on connect and from Firestore on load.

### Badge Component
`<Badge status={st}/>` — status pill styling used throughout:
- `background`, `borderRadius:20`, `padding:"3px 12px"`, `fontWeight:700`
- Status values: `draft`, `in_progress`, `extracted`, `validated`, `costed`, `quoted`

### Owner Priority Mode
Soft-lockout that activates when the project owner is viewing — sits between Hard Project Lock (task running) and free-for-all. Triggered by owner's `projectPresence.lastSeen` within 90s OR `project.ownerLockActive === true`; overridden by active admin takeover (`project.ownerTakeoverActive`, 15-min auto-expire). Hard-locks 13 destructive actions (re-extract, refresh pricing, send quote, send RFQs, etc.); allows view + row/field edits. Server-side enforcement via Firestore rules helper `isOwnerPriorityLocked(project)`; audit trail at `companies/{companyId}/ownerTakeovers/{id}`. Full spec: `docs/superpowers/specs/2026-04-23-owner-priority-mode-design.md`. Plan: `docs/superpowers/plans/2026-04-23-owner-priority-mode.md`.

### Item Lead Times
Per-item lead times populated from a ranked source precedence on every BOM row: `supplier` → `scraper` → `bc_vendor` → `bc_item` → `ai`; manual edits override all auto-sources until force-refresh. Fields on BOM rows: `leadTimeDays`, `leadTimeSource`, `leadTimeUpdatedAt`, `leadTimeEstimated` (preserved on save). Fetch piggybacks on `runPricingOnPanel`. Writeback to BC `ItemVendorCatalog` happens during `doApplyPortalPrices` (HARD REJECT on blank partNumber); audit at `companies/{companyId}/bcLeadTimeWrites/{id}`. RFQ "Lead Times Only" mode adds a per-vendor checkbox that switches the portal to lead-time-only validation. Full spec: `docs/superpowers/specs/2026-04-23-item-lead-times-design.md`. Plan: `docs/superpowers/plans/2026-04-23-item-lead-times.md`.

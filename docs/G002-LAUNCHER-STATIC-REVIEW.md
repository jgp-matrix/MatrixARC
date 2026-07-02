# G002 team-boot launcher — Coach static review

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** Static (read-only) review — no build
**Scope:** `tools/team-boot/` — `team-boot.ps1`, `lib/{paste-and-submit,send-keys,set-title}.ahk`, `onboarding/session{1..4}-*.txt`, `README.md`
**Verdict:** Sound skeleton, safe by construction (no git ops, no `src/`/`functions/`, never deploys). **3 HIGH issues would make live calibration fail confusingly or land text in the wrong session — fix/decide before Jon burns calibration cycles.** Route to Marc (owner/editor).

---

## HIGH

### H1 — Multi-window activation targets the WRONG session (pastes cross-wired)
`paste-and-submit.ahk:11-14` and `set-title.ahk:14-17`: when `$CcdWinMatch` is calibrated (set), `WinExist(win)` is true, so `win` stays the **match string** and `WinActivate(win)` activates a window by `ahk_exe` match. With **4 identical CCD windows all matching `ahk_exe Claude Code Desktop.exe`**, AHK activates *a* matching window (first/last-found in z-order) — **not reliably the newest one just launched.** The `team-boot.ps1:145` comment ("newest window is foreground") is *defeated* by the explicit `WinActivate(match)`.
- **Failure mode:** after session 2 launches, activation resolves to session 1 → Marc's block pastes into Freddy; titles set on the wrong window.
- **Fix:** capture the new window's unique `ahk_id` at launch and act on that id, OR drop the match entirely and act only on the active window (`"A"`) in the narrow post-launch instant. The current "match-string but assume newest" is the worst of both.
- **Note:** ironically the *uncalibrated* fallback (`win:="A"`) is safer than the calibrated path here.

### H2 — Single-instance CCD collapses all 4 sessions into 1 (no guard)
`team-boot.ps1:84-91` (`Open-NewSession`, `launch-exe`): re-runs `Start-Process $CcdExe` per session. Electron apps are frequently **single-instance** — the 2nd–4th launch just focuses the existing window instead of spawning a new one. Then all four onboarding blocks paste+submit into the **same** session. No detection, no window-count check.
- **Fix / calibration gate:** before real use, confirm CCD spawns a new window per exe launch. If it doesn't, `$NewSessionMethod` MUST be `hotkey` with the real new-session shortcut. Recommend a preflight window-count assertion (count `ahk_exe` matches before/after) so a single-instance build fails loudly instead of silently stacking.

### H3 — `/team-startup` double-orchestration conflict with the launcher
`session1-freddy.txt` = `/team-startup`. But per CLAUDE.md the `/team-startup` skill *itself* (a) generates path-based pastes for Marc + Coach and (b) expects Jon to **open a new session per peer and paste**. The launcher has **already** opened + pasted all 4 sessions. So Freddy will re-generate peer pastes and drive a manual peer-open flow for sessions that already exist → contradictory/confusing boot.
- **Decision needed:** either (a) session 1 gets a plain onboarding block (like the peers) and Freddy runs **only** the comms-check, not full `/team-startup`; or (b) the launcher boots **only** Freddy and lets `/team-startup` orchestrate the rest (defeats "Option A" automation). Can't run both paths as-is. This is a design fork for Freddy + Jon, not a code typo.

---

## MEDIUM

### M1 — Mis-calibrated `set-title.ahk` submits "Rename"+title as CHAT MESSAGES (not benign)
`set-title.ahk:23-31` blind-fires `^+p` → `SendText("Rename")` → `{Enter}` → `SendText(title)` → `{Enter}`. If the command palette does **not** open (wrong build/shortcut), all that text goes to the focused **message input** and both `{Enter}`s **submit it as prompts** into the freshly-onboarded session — polluting context and potentially triggering agent actions. The failure mode of a wrong guess is active, not silent.
- **Fix:** verify a palette/dialog actually opened before typing (e.g. check title/control state), else abort. Or default to **no-op + title-by-hand** rather than a blind sequence that can inject prompts.

### M2 — Emoji titles passed as AHK command-line args risk encoding loss
`team-boot.ps1:118` passes `🟥/🏈/🟩/🟪` titles as `A_Args[2]` to `set-title.ahk`. Non-ASCII/emoji through the PowerShell→AHK arg boundary is codepage-fragile — `SendText(title)` may type mojibake. The onboarding **text** is deliberately staged via clipboard *"reliable for large/unicode content"* (`Paste-Block`, line 105-108) — but the title has the **same** unicode concern and is handled the inconsistent (arg) way.
- **Fix:** stage the title on the clipboard and paste it in the rename field too, mirroring `Paste-Block`.

### M3 — Title-set races the agent's running turn
`team-boot.ps1:157` calls `Set-Title` ~`$DelayTitle` (1200ms) after submitting the block — by then the agent has begun a long read/tool turn and CCD may **disable the input** during generation, so `^+p`/SendText can misfire or land nowhere.
- **Fix:** set titles **before** submitting each block, or after all four are onboarded (a dedicated title pass), not in the ~1.2s window right after submit.

### M4 — Onboarding blocks invite a premature proactive send (out of comms-check order)
`session2-coach.txt:11` and `session3-marc.txt:12` say *"report back (to Freddy)."* On first boot the agent has no Freddy session id yet (discovers via `list_sessions`) and a proactive outbound `send_message` fires an Allow-Once prompt **out of the comms-check sequence**. My own live startup paste used the safer contract: *"post 'ready' in THIS window; Freddy will ping you"* — which is exactly how this reset went. Recommend aligning all peer blocks to **"post readiness in THIS window; Freddy pings you for the comms-check"** so sends happen in-order and Allow-Once prompts cluster predictably at the comms-check.

### M5 — README calibration table lists knobs that don't exist in the script
`README.md:63-69` documents `$RenameMethod` and `$PasteTarget` as config knobs. Neither exists as a `team-boot.ps1` variable — rename lives in `set-title.ahk`; paste-target behavior is `$ClickInputFirst`. A calibrator grepping the script for `$RenameMethod` finds nothing.
- **Fix:** point those rows at `lib/set-title.ahk` and `$ClickInputFirst` respectively.

---

## LOW

- **L1** — `session2-coach.txt` omits the git-discipline reminder that Marc's and Dez's blocks carry (explicit pathspec / never `git add -A`). Coach commits CLAUDE.md, so add it for parity (Coach does read U1–U6 in CLAUDE.md, so minor).
- **L2** — `session4-dez.txt:1` has a "Set this session's name…" self-title line; Coach/Marc blocks don't, and it's a known **no-op** (agents can't self-title) *and* redundant with the external `set-title.ahk`. Make blocks consistent — drop it or add to all with the "Jon sets manually if it doesn't take" caveat.
- **L3** — No window-count / PID verification after launch (`Start-Process … | Out-Null`, line 88). Can't detect a partial boot; acceptance is manual eyeball. Consider an `ahk_exe` count assertion (ties to H2).
- **L4** — `Start-SleepMs $DelayPaste` (line 112) runs even under `-WhatIf` (the paste itself is correctly gated). Harmless — just makes the dry run slower than necessary.

---

## What's GOOD (keep)
- No git operations, no `src/`/`functions/` touch, never deploys — safe by construction; matches the "dev tooling only" claim.
- `-WhatIf`/`ShouldProcess` gating on the real side-effects (Start-Process, clipboard set, AHK invoke).
- Preflight (`team-boot.ps1:128-142`) checks exe/AHK/onboarding-file presence and fails fast; `launch-exe` vs `hotkey` fatal logic is correct.
- `paste-and-submit.ahk` bails (`ExitApp(2)`) rather than paste if it can't confirm focus — good defensive posture (undercut only by H1's wrong-target activation).
- Static onboarding blocks + "recover live state from repo on boot" is the right call (no per-run content drift).
- Marc's block correctly carries the pathspec discipline; Dez's block correctly uses `commit -- STATUS.md`.

## Suggested order for Jon's calibration pass
Resolve **H2** (does the exe spawn new windows?) and **H3** (which boot path) *first* — they gate everything. Then **H1** (window targeting) and **M1/M3** (title mechanics) before trusting `set-title.ahk`. **M2/M4/M5** and the LOWs are cleanups.

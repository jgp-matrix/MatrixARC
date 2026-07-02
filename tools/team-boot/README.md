# team-boot — 4-session CCD team launcher (G002)

Boots the Matrix ARC dev team (Freddy · Coach · Marc · Dez) across four Claude Code
Desktop (CCD) sessions with **minimal clicks**. Implements **G002 / Option A**: ~95%
automation — the launcher opens the windows and pastes each role's onboarding block (and
optionally sets titles); the **human approves the ~6 one-time "Allow Once" prompts** at the
comms-check and (by default) sets the four titles by hand. Those steps are deliberate and
cannot be safely automated away (see below).

> This is **dev tooling**, not ARC app code. It touches nothing under `src/`, `functions/`,
> or the deploy pipeline. Running it never deploys anything.

---

## Why there's still a manual step (don't try to remove it)

Per G001/G002 research (in `TODO.md`), full zero-interaction boot is **not possible**:

- The cross-session `send_message` **"Allow Once" prompt is a hardcoded security gate** —
  its own UI says *"This tool requires explicit approval regardless of permission mode."*
  It cannot be suppressed by settings, permission mode, or an allowlist. GUI-clicking it
  automatically is possible but **fragile and defeats the security intent — do NOT.**
- CCD sessions **cannot** be created with a preloaded prompt via CLI/deep-link (that works
  only for *terminal* sessions, which can't use the `send_message` bus).
- Agents **cannot self-title** their own session — the launcher sets titles from outside.

The Allow-Once cost is **one approval per (sender→target) pair, one time at startup** (not
per message). Under hub-and-spoke that's ~6 clicks total at the comms-check, then the bus
runs silent. Accepted as the ~5% manual step.

---

## What it does

For each session: capture the exact **new window handle** as it spawns (via Win32
`EnumWindows`), then direct every keystroke/paste at that specific handle — so pastes never
cross-wire between the four identical CCD windows (H1). If a launch produces no new window,
the run aborts with single-instance guidance rather than stacking all blocks into one session (H2).

1. **Session 1 → Freddy (launcher mode).** New session, paste `onboarding/session1-freddy.txt`.
   This is a **trimmed** Freddy block, **not** `/team-startup`: the launcher already opened the
   peers, so Freddy just verifies state and runs the **comms-check** against them (no peer-paste
   generation, no wait-for-manual-open — that would double-orchestrate; H3).
2. **Session 2 → Coach.** New session, paste `onboarding/session2-coach.txt`.
3. **Session 3 → Marc.** New session, paste `onboarding/session3-marc.txt`.
4. **Session 4 → Dez.** New session, paste `onboarding/session4-dez.txt`.

**Titles:** default is **auto-title OFF** (`$AutoSetTitle=$false`) — you set the four titles by
hand (`🟥Freddy - ARC` / `🏈Coach - ARC` / `🟩Marc - ARC` / `🟪Dez - ARC`), because a
mis-calibrated rename sequence would type into the chat input and submit it as a prompt (M1).
Once the rename sequence in `lib/set-title.ahk` is confirmed on this build, flip `$AutoSetTitle=$true`
and titles are set automatically (staged via clipboard, emoji-safe, while the input is idle).

Then it prints an operator checklist: (set titles by hand if auto-title is off,) switch each
session to **"Ask permissions"** mode, and approve the ~6 Allow-Once prompts as Freddy runs the
comms-check.

---

## Prerequisites

- **Windows** (this is a `.ps1` + `.ahk` pair).
- **AutoHotkey v2** installed — https://www.autohotkey.com/ (v2, not v1). The launcher uses it
  for reliable window focus + clipboard paste + keystrokes. If `AutoHotkey64.exe` isn't on
  PATH, set its full path in the config block (`$AhkExe`).
- **Claude Code Desktop** installed.

---

## ⚙ CALIBRATION (required once, on the target machine)

I could not drive/verify the CCD GUI from the build session, so these knobs at the top of
`team-boot.ps1` **must be confirmed on Jon's desktop before first real use.** Each is
commented in the script. Run in `-WhatIf` mode first (see below) to dry-check without keystrokes.

| Knob | What to confirm |
|------|-----------------|
| `$CcdExe` | Full path to the CCD executable (Start-menu shortcut → Properties → Target). |
| `$CcdProcName` | Process name (no `.exe`) used to enumerate CCD windows. Confirm with `Get-Process *claude*`. |
| `$NewSessionMethod` | How a NEW session/window is opened — `launch-exe` (relaunch the exe; **only if CCD is multi-window**) or `hotkey` (a shortcut inside CCD). Set `$NewSessionHotkey` if `hotkey`. |
| rename sequence | **Not a `$var`** — lives in `lib/set-title.ahk` (the marked ⚙ block). Only used when `$AutoSetTitle=$true`; verify a palette/dialog actually opens before enabling. |
| `$ClickInputFirst` | Set `$true` if `^v`+`{Enter}` doesn't land in the input box (clicks the input first). |
| `$AutoSetTitle` | Leave `$false` (set titles by hand) until the rename sequence is confirmed; then `$true`. |
| `$NewWindowTimeoutMs` / `$Delay*` | Timing. Raise `$NewWindowTimeoutMs` if windows are slow to appear; raise `$Delay*` if steps race the UI. Most flakiness is timing. |

**Calibration order** (per Coach's static review — resolve gates first): **H2** does the exe
actually spawn a new window? (else set `hotkey`) → **H3** boot path is already handled (launcher
mode) → **H1** window targeting is handle-based (verify pastes hit the right session) → **M1/M3**
only matter once you enable `$AutoSetTitle`. Run `-WhatIf` first.

---

## Run

```powershell
# Dry run — prints every action, sends NO keystrokes/paste (safe to run anytime):
pwsh -File tools/team-boot/team-boot.ps1 -WhatIf

# Real boot:
pwsh -File tools/team-boot/team-boot.ps1
```

## Test (acceptance for G002)

1. Run the real boot on Jon's desktop.
2. Confirm **4 distinct CCD windows** open (not all pasted into one — H2) and each got the
   RIGHT block (Freddy's launcher block in session 1, peers in 2–4 — H1).
3. Set the four titles by hand (or confirm auto-title if `$AutoSetTitle=$true`):
   `🟥Freddy - ARC`, `🏈Coach - ARC`, `🟩Marc - ARC`, `🟪Dez - ARC`.
4. Confirm Freddy (session 1) verifies state and runs the **comms-check** (it must NOT try to
   generate peer pastes or wait for manual opens — that's the H3 fix).
5. Approve the ~6 Allow-Once prompts; confirm all four report "ready / comms OK".

## If it misbehaves — manual fallback

The launcher is a convenience layer over the normal manual startup. If any step fails, just
open the four sessions by hand and paste the blocks from `onboarding/` (or run `/team-startup`
in a fresh session and follow its prompts). Nothing here is load-bearing for the team to work.

---

## Keeping onboarding blocks in sync

`onboarding/session2-coach.txt` and `session3-marc.txt` are the **peer-paste templates from
`.claude/commands/team-startup.md`** with the placeholders filled for this team. If those
templates change, re-fill these. `session4-dez.txt` is the **Freddy-provided Dez block** (Dez has no template in the
skill) — covering Intake/Triage **and** the live Status Board (Dez owns `STATUS.md`); keep it
in sync with the CLAUDE.md Intake/Triage subsection. `session1-freddy.txt` is a **trimmed,
launcher-mode Freddy block** (verify-state + comms-check only) — deliberately NOT `/team-startup`,
which would re-generate peer pastes and wait for manual opens the launcher already did (H3).
The blocks are intentionally **static** — each agent recovers live state from the repo itself on
boot, so the launcher never needs fresh per-run content.

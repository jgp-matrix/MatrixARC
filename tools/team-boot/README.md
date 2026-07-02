# team-boot — 4-session CCD team launcher (G002)

Boots the Matrix ARC dev team (Freddy · Coach · Marc · Dez) across four Claude Code
Desktop (CCD) sessions with **minimal clicks**. Implements **G002 / Option A**: ~95%
automation — the launcher opens the windows, pastes each role's onboarding block, and
sets each session title; the **human approves the ~6 one-time "Allow Once" prompts** at
the comms-check. That last step is deliberate and cannot be automated away (see below).

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

Sequentially, so each freshly-launched window is foreground when we act on it:

1. **Session 1 → Freddy (orchestrator).** Launch a new CCD session, type `/team-startup`,
   set title `🟥Freddy - ARC`. Freddy's skill then drives state-verify + comms-check.
2. **Session 2 → Coach.** New session, paste `onboarding/session2-coach.txt`, title `🏈Coach - ARC`.
3. **Session 3 → Marc.** New session, paste `onboarding/session3-marc.txt`, title `🟩Marc - ARC`.
4. **Session 4 → Dez.** New session, paste `onboarding/session4-dez.txt`, title `🟪Dez - ARC`.

Then it prints an operator checklist: switch each session to **"Ask permissions"** mode and
approve the ~6 Allow-Once prompts as Freddy runs the comms-check.

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
| `$NewSessionMethod` | How a NEW session/window is opened — `launch-exe` (relaunch the exe) or `hotkey` (a keyboard shortcut inside CCD, e.g. `^n`/`^t`). Set `$NewSessionHotkey` if `hotkey`. |
| `$RenameMethod` | How a session title is set — the menu/hotkey step to rename a session. Encoded in `lib/set-title.ahk`; verify the key sequence there. |
| `$PasteTarget` | That `^v` then `{Enter}` lands text in the session input box (some builds need a click into the input first — `$ClickInputFirst=$true`). |
| `$Delay*` | Timing waits (`$DelayAppLaunch`, `$DelayNewSession`, `$DelayPaste`). Bump these up if your machine is slow — most flakiness is timing. |

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
2. Confirm **4 CCD windows** open with titles `🟥Freddy - ARC`, `🏈Coach - ARC`,
   `🟩Marc - ARC`, `🟪Dez - ARC`.
3. Confirm each peer session shows its onboarding block pasted + submitted, and session 1
   shows `/team-startup` running.
4. Let Freddy run the comms-check; approve the ~6 Allow-Once prompts.
5. Confirm all four report "ready / comms OK".

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
in sync with the CLAUDE.md Intake/Triage subsection. `session1-freddy.txt` is just the
`/team-startup` command. The blocks are intentionally **static** — each agent recovers live
state from the repo itself on boot, so the launcher never needs fresh per-run content.

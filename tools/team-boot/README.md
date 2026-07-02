# team-boot — CCD team session launcher (G002)

Creates and onboards the four Matrix ARC team sessions (Freddy · Coach · Marc · Dez) inside
Claude Code Desktop (CCD) with **minimal clicks**. Implements **G002 / Option A**: automate
the tedious part (create session + paste each onboarding block, ×4); the human does the
tear-off into separate windows, the titling, and approves the ~6 one-time "Allow Once"
prompts at the comms-check.

> This is **dev tooling**, not ARC app code. It touches nothing under `src/`, `functions/`,
> or the deploy pipeline. Running it never deploys anything.

---

## How CCD actually works (drives this design)

Confirmed by live calibration (2026-07-02):

- **CCD is single-window / multi-session.** "New Session" (**Ctrl+N** — confirm on your build)
  creates a session **inside the current window** and switches to it. It does **not** open a
  new OS window.
- **Separate windows come from a tear-off**, two ways: the **⋯ (three-dots) → "Open In" →
  "New Window"** menu next to the session (deterministic — recommended), or **Shift+drag** the
  tab out (free-form). Default is **manual**; an opt-in experimental auto path drives the menu
  (see `$AutoTearOff` — ships as a no-op until calibrated, because reliably locating the
  per-session ⋯ across runs is the fragile part).
- **CCD is a single-instance Store app** (WindowsApps) — relaunching the exe won't spawn a
  window. So the launcher does **not** launch CCD; **open CCD yourself first.**

So the launcher's job shrinks to: focus the one CCD window, then per session **Ctrl+N → paste
block → submit**, four times. Everything else is manual (and mostly unavoidable — below).

---

## Why the manual steps can't be automated away

- The cross-session `send_message` **"Allow Once" prompt is a hardcoded security gate** — its
  own UI says *"This tool requires explicit approval regardless of permission mode."* Not
  suppressible; GUI-clicking it is fragile and defeats the intent — **do NOT.** Cost is one
  approval per (sender→target) pair, once at startup (~6 total), then the bus runs silent.
- **Agents can't self-title**, and tear-off titling is a manual drag — so you set titles.

---

## What it does

1. Finds the single CCD window (via the CCD process's main window handle).
2. For each session, in order — **Freddy (launcher mode)**, then **Coach**, **Marc**, **Dez** —
   activate the window, send **Ctrl+N**, wait for the new session's input, paste that role's
   `onboarding/*.txt`, and submit. All four end up as sessions in the one window.
3. Prints the manual checklist: tear off Coach/Marc/Dez into their own windows, title all four,
   set Ask-permissions mode, then reply **`go`** in the Freddy session to run the comms-check.

**Freddy is launcher-mode** (`session1-freddy.txt`): it verifies repo state, then **pauses**
and waits for your `go` — because it locates peers **by title** for the comms-check, and titles
aren't set until you do the tear-off/title step. This avoids a premature comms-check against
untitled/absent peers. It deliberately does **not** run `/team-startup` (which would re-generate
peer pastes and wait for manual opens the launcher already did).

---

## Prerequisites

- **Windows**, with **Claude Code Desktop already open** (the launcher does not start it).
- **AutoHotkey v2** — https://www.autohotkey.com/ (v2, not v1). Used for window focus + Ctrl+N +
  clipboard paste. If `AutoHotkey64.exe` isn't on PATH, set `$AhkExe` to its full path.

---

## ⚙ CALIBRATION (confirm once, on the target machine)

Run `-WhatIf` first (safe — no keystrokes). Then confirm these in `team-boot.ps1`:

| Knob | What to confirm |
|------|-----------------|
| `$CcdProcName` | Process name (no `.exe`) whose main window is CCD. Confirm with `Get-Process *claude*`. |
| `$NewSessionHotkey` | The shortcut that creates a **new session in the current window** (Jon's guess: `^n`). **This is the #1 thing to verify.** |
| `$ClickInputFirst` | Set `$true` if the paste lands in the *previous* session instead of the new one (clicks the input box first). |
| `$DelayAfterNewSession` | Raise if the paste races ahead of the new session's input being ready. |
| `$DelayAfterPaste` / `$DelayBetweenSessions` | Timing cushions — raise on a slow machine. |
| `$AutoTearOff` | EXPERIMENTAL, default `$false`. Opt-in auto tear-off via the ⋯→Open In→New Window menu. Requires calibrating `lib/tearoff-session.ahk` (no-op until you flip its `Calibrated` guard) — keep manual until you've confirmed it live. |

**The key live risk (replaces the old window-handle concern):** does `Ctrl+N` reliably
**create AND focus** a new session, and does the paste land in the **new** session (not the
prior one)? If pastes stack into one session, raise `$DelayAfterNewSession` and/or set
`$ClickInputFirst=$true`, and re-confirm the shortcut.

---

## Run

```powershell
# Dry run — prints the plan, sends NO keystrokes/paste (safe anytime; CCD need not be open):
pwsh -File tools/team-boot/team-boot.ps1 -WhatIf

# Real run — OPEN Claude Code Desktop first, then:
pwsh -File tools/team-boot/team-boot.ps1
```

## Test (acceptance for G002)

1. Open CCD, run the real command.
2. Confirm **4 sessions** were created in the window and each got the RIGHT block (Freddy's
   launcher block first, then Coach/Marc/Dez) — and that pastes landed in the correct (new)
   session each time, not stacked into one.
3. Tear off Coach/Marc/Dez into their own windows; title all four; set Ask-permissions mode.
4. Reply `go` in Freddy; confirm Freddy runs the comms-check (verify-state already done).
5. Approve the ~6 Allow-Once prompts; confirm all four report "ready / comms OK".

## If it misbehaves — manual fallback

The launcher only saves the create+paste keystrokes. If anything is off, open the sessions by
hand and paste the blocks from `onboarding/`. Nothing here is load-bearing for the team to work.

---

## Files & keeping onboarding in sync

- `lib/new-session-paste.ahk` — the core AutoHotkey v2 helper: focus window → Ctrl+N → paste → submit.
- `lib/tearoff-session.ahk` — EXPERIMENTAL, opt-in (`$AutoTearOff`): ⋯→Open In→New Window menu
  tear-off. Ships as a safe no-op until its `Calibrated` guard is flipped.
- `onboarding/session2-coach.txt`, `session3-marc.txt` — the peer-paste templates from
  `.claude/commands/team-startup.md`, filled for this team; re-fill if those templates change.
- `onboarding/session4-dez.txt` — the Freddy-provided Dez block (Intake/Triage + live Status
  Board; Dez owns `STATUS.md`); keep in sync with CLAUDE.md's Intake/Triage subsection.
- `onboarding/session1-freddy.txt` — the **launcher-mode** Freddy block (verify-state → pause
  for `go` → comms-check); deliberately NOT `/team-startup`.

Blocks are intentionally **static** — each agent recovers live state from the repo on boot, so
the launcher never needs fresh per-run content.

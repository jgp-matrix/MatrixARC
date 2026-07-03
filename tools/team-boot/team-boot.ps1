#requires -Version 5.1
<#
.SYNOPSIS
  G002 — Create + onboard the 4 CCD team sessions (Freddy · Coach · Marc · Dez) in ONE window.

.DESCRIPTION
  Live calibration established that Claude Code Desktop is SINGLE-WINDOW / MULTI-SESSION:
  "New Session" (Ctrl+N) creates a session INSIDE the current window; separate OS windows
  happen only when a human Shift+drags a session tab out (tear-off). CCD is also a
  single-instance Store app — relaunching the exe won't spawn a window.

  So this launcher automates the tedious part only: focus the CCD window, then per session
  Ctrl+N → paste the onboarding block → submit, ×4 in the one window. The human does the
  tear-off into separate windows and the titling afterward (Shift+drag to a screen position
  is too fragile to automate reliably).

  Dev tooling only. No git ops, nothing under src/ or functions/. Never deploys.

.PARAMETER WhatIf
  Dry run: prints every planned action but performs NO keystrokes or paste.

.NOTES
  ⚙ CALIBRATE the CONFIG block on the target machine. The key risks to confirm live:
    - Does the new-session shortcut ($NewSessionHotkey) create AND focus a new session?
    - Does the paste land in the NEW session (not the previous one)? If it races, raise
      $DelayAfterNewSession and/or set $ClickInputFirst=$true.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — ⚙ CALIBRATE THESE (see README "CALIBRATION")
# ─────────────────────────────────────────────────────────────────────────────

# Process name (no .exe) used to locate the CCD window. Confirm with: Get-Process *claude*
# (CCD is a single-instance Store app under WindowsApps — there's exactly one window.)
$CcdProcName = "Claude Code Desktop"

# AutoHotkey v2 executable (full path if not on PATH).
$AhkExe = "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"  # v2 installed here, not on PATH (Jon's machine, confirmed 2026-07-03)

# The new-session shortcut INSIDE CCD (creates a session in the current window).
# Jon's best guess is Ctrl+N — CONFIRM on the target build.
$NewSessionHotkey = "^n"

# If the paste lands in the previous session instead of the new one, set $true (clicks the
# input box first) and/or raise $DelayAfterNewSession.
$ClickInputFirst = $false

# EXPERIMENTAL — opt-in auto tear-off of peers into their own windows via the menu path
# (⋯ → Open In → New Window). Default OFF = you tear off + title by hand (safe). The helper
# lib/tearoff-session.ahk ships as a no-op until calibrated; enabling this before calibrating
# it just logs "not calibrated" and falls back to manual. Locating the per-session ⋯ reliably
# is the risky part — only enable once you've confirmed the sequence live.
$AutoTearOff = $false

# Timing (ms). Raise if steps race the UI (most flakiness is timing).
$DelayAfterNewSession = 1500      # wait after Ctrl+N for the new session's input to be ready
$DelayAfterPaste      = 700       # wait after paste before pressing Enter
$DelayBetweenSessions = 1200      # settle between sessions

# ─────────────────────────────────────────────────────────────────────────────
# SESSION PLAN — all created in ONE window (order per Freddy). Session 1 is Freddy in
# launcher mode: verify state, then PAUSE for Jon to tear-off + title the peers and reply
# "go" before running the comms-check (peers aren't titled until Jon does it — see block).
# ─────────────────────────────────────────────────────────────────────────────
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$OnboardDir = Join-Path $ScriptDir "onboarding"
$LibDir     = Join-Path $ScriptDir "lib"

$Sessions = @(
  [pscustomobject]@{ Role="Freddy (launcher mode)"; Title="🟥Freddy - ARC"; File="session1-freddy.txt" }
  [pscustomobject]@{ Role="Coach";                  Title="🏈Coach - ARC";  File="session2-coach.txt"  }
  [pscustomobject]@{ Role="Marc";                   Title="🟩Marc - ARC";   File="session3-marc.txt"   }
  [pscustomobject]@{ Role="Dez";                    Title="🟪Dez - ARC";    File="session4-dez.txt"    }
)

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
function Write-Step($m){ Write-Host "  → $m" -ForegroundColor Cyan }
function Write-Ok($m)  { Write-Host "  ✓ $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Sleep2([int]$ms){ if ($ms -gt 0 -and -not $WhatIfPreference){ Start-Sleep -Milliseconds $ms } }

function Get-CcdWindowHandle {
  # Single-window app → MainWindowHandle is the one window. Returns 0 if CCD isn't open.
  $p = Get-Process -Name $CcdProcName -ErrorAction SilentlyContinue |
       Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if ($p) { return [long]$p.MainWindowHandle }
  return 0
}

function Invoke-Ahk {
  param([string]$Script,[string[]]$AhkArgs=@())
  $full = Join-Path $LibDir $Script
  if ($PSCmdlet.ShouldProcess("$Script $($AhkArgs -join ' ')","AutoHotkey")) {
    & $AhkExe $full @AhkArgs
    if ($LASTEXITCODE -ne 0) { Write-Warn2 "AHK '$Script' exited $LASTEXITCODE (2=focus fail, 3=window not found)" }
  }
}

function New-SessionAndPaste {
  param([long]$Hwnd,[string]$Text)
  if ($PSCmdlet.ShouldProcess("clipboard","Set onboarding text ($($Text.Length) chars)")) { Set-Clipboard -Value $Text }
  $clickArg = if ($ClickInputFirst) { "1" } else { "0" }
  Invoke-Ahk "new-session-paste.ahk" @("$Hwnd", $NewSessionHotkey, $clickArg, "$DelayAfterNewSession", "$DelayAfterPaste")
}

# ─────────────────────────────────────────────────────────────────────────────
# PREFLIGHT
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n=== team-boot (G002) ===" -ForegroundColor White
if ($WhatIfPreference) { Write-Warn2 "DRY RUN (-WhatIf): no keystrokes or paste will occur.`n" }

$fatal = $false
if (-not (Get-Command $AhkExe -ErrorAction SilentlyContinue) -and -not (Test-Path $AhkExe)) {
  Write-Warn2 "AutoHotkey v2 ('$AhkExe') not found → install AHK v2 or set `$AhkExe."
  if (-not $WhatIfPreference) { $fatal = $true }
}
foreach ($s in $Sessions) {
  $p = Join-Path $OnboardDir $s.File
  if (-not (Test-Path $p)) { Write-Warn2 "Missing onboarding file: $p"; $fatal = $true }
}

$hwnd = Get-CcdWindowHandle
if ($hwnd -eq 0) {
  if ($WhatIfPreference) { Write-Warn2 "CCD window not found (fine for dry run) — OPEN CCD before a real run." }
  else { Write-Warn2 "CCD window not found. OPEN Claude Code Desktop first, then re-run."; $fatal = $true }
} else {
  Write-Ok "CCD window found (hwnd $hwnd)."
}
if ($fatal) { Write-Host "`nPreflight failed — resolve the above and re-run.`n" -ForegroundColor Red; exit 1 }
Write-Ok "Preflight passed.`n"

# ─────────────────────────────────────────────────────────────────────────────
# BOOT — one window; per session: Ctrl+N → paste block → submit
# ─────────────────────────────────────────────────────────────────────────────
$i = 0
foreach ($s in $Sessions) {
  $i++
  Write-Host "[$i/4] $($s.Role)" -ForegroundColor White
  $text = (Get-Content -Raw -Path (Join-Path $OnboardDir $s.File)).TrimEnd()
  Write-Step "Ctrl+N (new session) → paste $($s.File) → submit"
  New-SessionAndPaste -Hwnd $hwnd -Text $text
  Sleep2 $DelayBetweenSessions
  Write-Ok "$($s.Role) created + onboarded (in the shared CCD window).`n"
}

# ─────────────────────────────────────────────────────────────────────────────
# OPTIONAL (EXPERIMENTAL) — auto tear-off peers via the ⋯ → Open In → New Window menu
# ─────────────────────────────────────────────────────────────────────────────
if ($AutoTearOff) {
  Write-Host "=== EXPERIMENTAL: auto tear-off (⋯ → Open In → New Window) ===" -ForegroundColor White
  foreach ($s in ($Sessions | Where-Object { $_.Role -notlike 'Freddy*' })) {
    Write-Step "Tear off $($s.Role) → new window (select its session first, then menu)"
    Invoke-Ahk "tearoff-session.ahk" @("$hwnd", "$($s.Role)")
    if (-not $WhatIfPreference -and $LASTEXITCODE -eq 9) {
      Write-Warn2 "tearoff-session.ahk is not calibrated — skipping auto tear-off; do it manually."
      break
    }
    Sleep2 $DelayBetweenSessions
  }
}

# ─────────────────────────────────────────────────────────────────────────────
# OPERATOR CHECKLIST — the manual steps (tear-off + title + Allow-Once)
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "=== NEXT (manual) ===" -ForegroundColor White
@(
  "All 4 sessions now live in the ONE CCD window (session list). To split + label them:"
  "1. For each of Coach / Marc / Dez, move it to its own window. Recommended: click the ⋯"
  "   next to the session → 'Open In' → 'New Window' (deterministic menu). Or SHIFT+DRAG the"
  "   tab out. (Freddy can stay put or be torn off too.)  [auto: set `$AutoTearOff once calibrated]"
  "2. Title the four windows/sessions by hand:"
  "      🟥Freddy - ARC   🏈Coach - ARC   🟩Marc - ARC   🟪Dez - ARC"
  "3. Put each session in 'Ask permissions' mode (needed for send_message to fire)."
  "4. In the FREDDY session, reply 'go' — Freddy verified state and is waiting for the"
  "   peers to be titled before it runs the comms-check (it locates peers by title)."
  "5. Approve the ~6 one-time 'Allow Once' prompts as Freddy messages Coach/Marc/Dez."
  "   Confirm all four report 'ready / comms OK'. Team is up."
) | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

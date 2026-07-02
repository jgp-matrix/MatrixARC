#requires -Version 5.1
<#
.SYNOPSIS
  G002 — Boot the 4-session CCD dev team (Freddy · Coach · Marc · Dez) with minimal clicks.

.DESCRIPTION
  Option A automation: launches four Claude Code Desktop sessions, pastes each role's
  onboarding block, and sets each session title. The ~6 one-time "Allow Once" prompts at
  the comms-check are approved by the human (hardcoded security gate — not automatable).

  Dev tooling only. Touches nothing under src/ or functions/. Never deploys.

.PARAMETER WhatIf
  Dry run: prints every planned action but sends NO keystrokes, paste, or launches.

.NOTES
  ⚙ CALIBRATE the CONFIG block below on the target machine before first real use.
  Most flakiness is timing — increase the $Delay* values if steps race ahead of the UI.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — ⚙ CALIBRATE THESE ON JON'S DESKTOP (see README "CALIBRATION")
# ─────────────────────────────────────────────────────────────────────────────

# Full path to the Claude Code Desktop executable.
# Find via: Start menu → CCD shortcut → right-click → Properties → "Target".
$CcdExe = "$env:LOCALAPPDATA\Programs\claude-code-desktop\Claude Code Desktop.exe"

# AutoHotkey v2 executable. If not on PATH, set the full path (e.g. C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe).
$AhkExe = "AutoHotkey64.exe"

# How a NEW session/window is opened:
#   "launch-exe" → run $CcdExe again to spawn a new window (simplest; works if CCD opens a new window per launch).
#   "hotkey"     → CCD is already open and a keyboard shortcut opens a new session/tab; set $NewSessionHotkey.
$NewSessionMethod  = "launch-exe"
$NewSessionHotkey  = "^n"          # only used when $NewSessionMethod = "hotkey" (AHK Send syntax)

# Some builds need a click into the input box before paste lands. If paste misses, set $true.
$ClickInputFirst   = $false

# Window match string for AutoHotkey (which windows are CCD). Confirm the exe name:
#   in AHK, "ahk_exe <ProcessName>.exe". Default guesses the CCD process name.
$CcdWinMatch       = "ahk_exe Claude Code Desktop.exe"

# Timing (milliseconds). Bump up on slower machines.
$DelayAppLaunch    = 6000          # wait after launching CCD for the window to be ready
$DelayNewSession   = 2500          # wait after opening a new session
$DelayPaste        = 800           # wait after paste before pressing Enter
$DelayTitle        = 1200          # wait after submit before renaming

# ─────────────────────────────────────────────────────────────────────────────
# SESSION PLAN — mirrors team-config.json roles + Dez (intake). Order matters:
# session 1 becomes the orchestrator (Freddy) by running /team-startup.
# ─────────────────────────────────────────────────────────────────────────────
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$OnboardDir  = Join-Path $ScriptDir "onboarding"
$LibDir      = Join-Path $ScriptDir "lib"

$Sessions = @(
  [pscustomobject]@{ Role="Freddy (orchestrator)"; Title="🟥Freddy - ARC"; File="session1-freddy.txt" }
  [pscustomobject]@{ Role="Coach";                 Title="🏈Coach - ARC";  File="session2-coach.txt"  }
  [pscustomobject]@{ Role="Marc";                  Title="🟩Marc - ARC";   File="session3-marc.txt"   }
  [pscustomobject]@{ Role="Dez";                   Title="🟪Dez - ARC";    File="session4-dez.txt"    }
)

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
function Write-Step($msg) { Write-Host "  → $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn2($msg){ Write-Host "  ⚠ $msg" -ForegroundColor Yellow }

function Invoke-Ahk {
  param([string]$Script, [string[]]$AhkArgs = @())
  $full = Join-Path $LibDir $Script
  if ($PSCmdlet.ShouldProcess("$Script $($AhkArgs -join ' ')", "AutoHotkey")) {
    & $AhkExe $full @AhkArgs
    if ($LASTEXITCODE -ne 0) { Write-Warn2 "AHK '$Script' exited $LASTEXITCODE" }
  }
}

function Open-NewSession {
  if ($NewSessionMethod -eq "launch-exe") {
    Write-Step "Launch CCD ($CcdExe)"
    if ($PSCmdlet.ShouldProcess($CcdExe, "Start-Process")) {
      Start-Process -FilePath $CcdExe | Out-Null
    }
    Start-SleepMs $DelayAppLaunch
  }
  else {
    Write-Step "New session via hotkey '$NewSessionHotkey'"
    Invoke-Ahk "send-keys.ahk" @($CcdWinMatch, $NewSessionHotkey)
    Start-SleepMs $DelayNewSession
  }
}

function Start-SleepMs([int]$ms) {
  if ($ms -gt 0) { Start-Sleep -Milliseconds $ms }
}

function Paste-Block {
  param([string]$Text)
  # Stage the clipboard from PowerShell (reliable for large / unicode content),
  # then AHK activates the foreground CCD window and pastes.
  if ($PSCmdlet.ShouldProcess("clipboard", "Set onboarding text ($($Text.Length) chars)")) {
    Set-Clipboard -Value $Text
  }
  $clickArg = if ($ClickInputFirst) { "1" } else { "0" }
  Invoke-Ahk "paste-and-submit.ahk" @($CcdWinMatch, $clickArg)
  Start-SleepMs $DelayPaste
}

function Set-Title {
  param([string]$Title)
  Write-Step "Set session title → '$Title'"
  Invoke-Ahk "set-title.ahk" @($CcdWinMatch, $Title)
  Start-SleepMs $DelayTitle
}

# ─────────────────────────────────────────────────────────────────────────────
# PREFLIGHT
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n=== team-boot (G002) ===" -ForegroundColor White
if ($WhatIfPreference) { Write-Warn2 "DRY RUN (-WhatIf): no launches, keystrokes, or paste will occur.`n" }

$fatal = $false
if (-not (Test-Path $CcdExe)) {
  Write-Warn2 "CCD exe not found at: $CcdExe  → set `$CcdExe (README ⚙ CALIBRATION)."
  if ($NewSessionMethod -eq "launch-exe" -and -not $WhatIfPreference) { $fatal = $true }
}
if (-not (Get-Command $AhkExe -ErrorAction SilentlyContinue) -and -not (Test-Path $AhkExe)) {
  Write-Warn2 "AutoHotkey v2 ('$AhkExe') not found → install AHK v2 or set `$AhkExe. Non-fatal in -WhatIf."
  if (-not $WhatIfPreference) { $fatal = $true }
}
foreach ($s in $Sessions) {
  $p = Join-Path $OnboardDir $s.File
  if (-not (Test-Path $p)) { Write-Warn2 "Missing onboarding file: $p"; $fatal = $true }
}
if ($fatal) { Write-Host "`nPreflight failed — resolve the above and re-run.`n" -ForegroundColor Red; exit 1 }
Write-Ok "Preflight passed.`n"

# ─────────────────────────────────────────────────────────────────────────────
# BOOT — sequential: launch → paste → title → next (newest window is foreground)
# ─────────────────────────────────────────────────────────────────────────────
$i = 0
foreach ($s in $Sessions) {
  $i++
  Write-Host "[$i/4] $($s.Role)" -ForegroundColor White
  $text = (Get-Content -Raw -Path (Join-Path $OnboardDir $s.File)).TrimEnd()

  Open-NewSession
  Write-Step "Paste onboarding block ($($s.File)) + submit"
  Paste-Block -Text $text
  if ($PSCmdlet.ShouldProcess("$($s.Title) input", "Press Enter")) { } # Enter handled inside paste-and-submit.ahk
  Set-Title -Title $s.Title
  Write-Ok "$($s.Role) launched as '$($s.Title)'.`n"
}

# ─────────────────────────────────────────────────────────────────────────────
# OPERATOR CHECKLIST — the accepted ~5% manual step
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "=== NEXT (manual — one-time) ===" -ForegroundColor White
@(
  "1. In EACH session, confirm it's in 'Ask permissions' mode (needed for send_message to fire)."
  "2. Freddy (session 1) is running /team-startup — it will verify state and run the comms-check."
  "3. Approve the ~6 one-time 'Allow Once' prompts as Freddy messages Coach/Marc/Dez."
  "   (One approval per sender→target pair, remembered for the session — NOT per message.)"
  "4. Confirm all four report 'ready / comms OK'. Team is up."
) | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

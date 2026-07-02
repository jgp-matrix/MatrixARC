#requires -Version 5.1
<#
.SYNOPSIS
  G002 — Boot the 4-session CCD dev team (Freddy · Coach · Marc · Dez) with minimal clicks.

.DESCRIPTION
  Option A automation: launches four Claude Code Desktop sessions, pastes each role's
  onboarding block into the CORRECT window, and (optionally) sets each session title.
  The ~6 one-time "Allow Once" prompts at the comms-check are approved by the human
  (hardcoded security gate — not automatable).

  Dev tooling only. No git ops, nothing under src/ or functions/. Never deploys.

  Window targeting (H1 fix): each new window's handle is captured via Win32 EnumWindows
  right after it spawns, and every keystroke/paste is directed at that exact handle —
  not an ambiguous "ahk_exe" match across 4 identical windows.

  Single-instance guard (H2 fix): if a launch produces no NEW window, the run aborts with
  guidance to switch $NewSessionMethod to 'hotkey' — rather than silently stacking all
  four blocks into one session.

.PARAMETER WhatIf
  Dry run: prints every planned action but performs NO launches, keystrokes, or paste.

.NOTES
  ⚙ CALIBRATE the CONFIG block on the target machine before first real use.
  Most flakiness is timing — raise the $Delay* / $NewWindowTimeoutMs values if steps race.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — ⚙ CALIBRATE THESE ON JON'S DESKTOP (see README "CALIBRATION")
# ─────────────────────────────────────────────────────────────────────────────

# Full path to the Claude Code Desktop executable (Start-menu shortcut → Properties → Target).
$CcdExe = "$env:LOCALAPPDATA\Programs\claude-code-desktop\Claude Code Desktop.exe"

# Process name (no .exe) used to enumerate CCD windows. Confirm with: Get-Process *claude*
$CcdProcName = "Claude Code Desktop"

# AutoHotkey v2 executable (full path if not on PATH).
$AhkExe = "AutoHotkey64.exe"

# How a NEW session/window opens:
#   "launch-exe" → run $CcdExe again to spawn a new window (works only if CCD is multi-window).
#   "hotkey"     → CCD already open; a shortcut opens a new session — set $NewSessionHotkey.
$NewSessionMethod = "launch-exe"
$NewSessionHotkey = "^n"          # AHK Send syntax; used only when $NewSessionMethod = "hotkey"

# Paste into the input box. If paste misses the input, set $true (clicks input first).
$ClickInputFirst = $false

# Auto-set session titles? Default OFF (M1): a mis-calibrated rename sequence would inject
# "Rename"+title as CHAT PROMPTS. Leave $false and set titles by hand until the rename
# sequence in lib/set-title.ahk is confirmed on this build; then flip to $true.
$AutoSetTitle = $false

# Timing (ms). Raise on slower machines.
$DelayAfterLaunch    = 1500       # settle time before we start polling for the new window
$NewWindowTimeoutMs  = 15000      # how long to wait for a new CCD window to appear
$NewWindowPollMs     = 400        # poll interval while waiting
$DelayBeforePaste    = 700        # settle after focusing the target window
$DelayAfterTitle     = 800        # settle after a title set

# ─────────────────────────────────────────────────────────────────────────────
# SESSION PLAN — session 1 becomes Freddy (launcher-mode: verify state + comms-check,
# NOT the full /team-startup skill — see H3). Peers: Coach, Marc, Dez.
# ─────────────────────────────────────────────────────────────────────────────
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$OnboardDir = Join-Path $ScriptDir "onboarding"
$LibDir     = Join-Path $ScriptDir "lib"

$Sessions = @(
  [pscustomobject]@{ Role="Freddy (orchestrator)"; Title="🟥Freddy - ARC"; File="session1-freddy.txt" }
  [pscustomobject]@{ Role="Coach";                 Title="🏈Coach - ARC";  File="session2-coach.txt"  }
  [pscustomobject]@{ Role="Marc";                  Title="🟩Marc - ARC";   File="session3-marc.txt"   }
  [pscustomobject]@{ Role="Dez";                   Title="🟪Dez - ARC";    File="session4-dez.txt"    }
)

# ─────────────────────────────────────────────────────────────────────────────
# WIN32 — enumerate visible top-level windows for the CCD process(es)
# ─────────────────────────────────────────────────────────────────────────────
if (-not ("Win32Win" -as [type])) {
  Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Win32Win {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr p);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr h);
  public static List<long> ForPids(HashSet<uint> pids){
    var res = new List<long>();
    EnumWindows((h,p)=>{
      if(!IsWindowVisible(h)) return true;
      if(GetWindowTextLength(h)==0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      if(pids.Contains(pid)) res.Add((long)h);
      return true;
    }, IntPtr.Zero);
    return res;
  }
}
"@
}

function Get-CcdWindowHandles {
  $pids = [System.Collections.Generic.HashSet[uint]]::new()
  foreach ($p in Get-Process -Name $CcdProcName -ErrorAction SilentlyContinue) { [void]$pids.Add([uint]$p.Id) }
  if ($pids.Count -eq 0) { return @() }
  return [Win32Win]::ForPids($pids)
}

# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────
function Write-Step($m){ Write-Host "  → $m" -ForegroundColor Cyan }
function Write-Ok($m)  { Write-Host "  ✓ $m" -ForegroundColor Green }
function Write-Warn2($m){ Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Sleep2([int]$ms){ if ($ms -gt 0 -and -not $WhatIfPreference){ Start-Sleep -Milliseconds $ms } }  # L4: no sleeps in dry run

function Invoke-Ahk {
  param([string]$Script,[string[]]$AhkArgs=@())
  $full = Join-Path $LibDir $Script
  if ($PSCmdlet.ShouldProcess("$Script $($AhkArgs -join ' ')","AutoHotkey")) {
    & $AhkExe $full @AhkArgs
    if ($LASTEXITCODE -ne 0) { Write-Warn2 "AHK '$Script' exited $LASTEXITCODE" }
  }
}

function Open-NewSession {
  param([long]$LastHwnd)
  if ($NewSessionMethod -eq "launch-exe") {
    Write-Step "Launch CCD ($CcdExe)"
    if ($PSCmdlet.ShouldProcess($CcdExe,"Start-Process")) { Start-Process -FilePath $CcdExe | Out-Null }
  } else {
    # hotkey mode assumes CCD is already open. For the first session $LastHwnd is 0 —
    # target the first existing CCD window so the shortcut has somewhere to land.
    $target = $LastHwnd
    if ($target -eq 0) { $target = [long](@(Get-CcdWindowHandles) | Select-Object -First 1) }
    if (-not $target) { Write-Warn2 "hotkey mode needs CCD already open, but no window was found." }
    Write-Step "New session via hotkey '$NewSessionHotkey' (on hwnd $target)"
    Invoke-Ahk "send-keys.ahk" @("$target",$NewSessionHotkey)
  }
}

function Wait-NewWindow {
  param([long[]]$Before)
  # H2/L3: returns the newly-appeared CCD window handle, or 0 if none within the timeout.
  if ($WhatIfPreference) { return 0 }
  $deadline = (Get-Date).AddMilliseconds($NewWindowTimeoutMs)
  while ((Get-Date) -lt $deadline) {
    $now = Get-CcdWindowHandles
    $new = $now | Where-Object { $_ -notin $Before }
    if ($new) { return ([long]($new | Select-Object -First 1)) }
    Start-Sleep -Milliseconds $NewWindowPollMs
  }
  return 0
}

function Paste-Block {
  param([long]$Hwnd,[string]$Text)
  if ($PSCmdlet.ShouldProcess("clipboard","Set onboarding text ($($Text.Length) chars)")) { Set-Clipboard -Value $Text }
  $clickArg = if ($ClickInputFirst) { "1" } else { "0" }
  Invoke-Ahk "paste-and-submit.ahk" @("$Hwnd",$clickArg)
}

function Set-Title {
  param([long]$Hwnd,[string]$Title)
  if (-not $AutoSetTitle) { Write-Warn2 "Title '$Title' — set by hand (auto-title OFF; see README M1)."; return }
  Write-Step "Set title → '$Title' (hwnd $Hwnd)"
  if ($PSCmdlet.ShouldProcess("clipboard","Set title text")) { Set-Clipboard -Value $Title }   # M2: title via clipboard
  Invoke-Ahk "set-title.ahk" @("$Hwnd")
  Sleep2 $DelayAfterTitle
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
  Write-Warn2 "AutoHotkey v2 ('$AhkExe') not found → install AHK v2 or set `$AhkExe."
  if (-not $WhatIfPreference) { $fatal = $true }
}
foreach ($s in $Sessions) {
  $p = Join-Path $OnboardDir $s.File
  if (-not (Test-Path $p)) { Write-Warn2 "Missing onboarding file: $p"; $fatal = $true }
}
if ($fatal) { Write-Host "`nPreflight failed — resolve the above and re-run.`n" -ForegroundColor Red; exit 1 }
if (-not $AutoSetTitle) { Write-Warn2 "Auto-title is OFF — you'll set the 4 titles by hand (safe default; see README)." }
Write-Ok "Preflight passed.`n"

# ─────────────────────────────────────────────────────────────────────────────
# BOOT — capture each new window handle, act only on THAT window (H1)
# ─────────────────────────────────────────────────────────────────────────────
$i = 0; $lastHwnd = 0
foreach ($s in $Sessions) {
  $i++
  Write-Host "[$i/4] $($s.Role)" -ForegroundColor White
  $text = (Get-Content -Raw -Path (Join-Path $OnboardDir $s.File)).TrimEnd()

  $before = @(Get-CcdWindowHandles)
  Open-NewSession -LastHwnd $lastHwnd
  Sleep2 $DelayAfterLaunch

  if ($WhatIfPreference) {
    Write-Step "(WhatIf) would capture the new CCD window handle and act on it"
    $hwnd = 0
  } else {
    $hwnd = Wait-NewWindow -Before $before
    if ($hwnd -eq 0) {
      Write-Host "`n  ✗ No NEW CCD window appeared for '$($s.Role)'." -ForegroundColor Red
      Write-Host "    H2: CCD may be single-instance. Set `$NewSessionMethod='hotkey' with the real" -ForegroundColor Red
      Write-Host "    new-session shortcut, or increase `$NewWindowTimeoutMs. Aborting to avoid stacking." -ForegroundColor Red
      exit 2
    }
    Write-Ok "New window captured: hwnd $hwnd"
  }

  # M3: title while the input is idle (before the block submits and the agent starts a turn).
  Set-Title -Hwnd $hwnd -Title $s.Title
  Sleep2 $DelayBeforePaste
  Write-Step "Paste onboarding block ($($s.File)) + submit → hwnd $hwnd"
  Paste-Block -Hwnd $hwnd -Text $text
  $lastHwnd = $hwnd
  Write-Ok "$($s.Role) onboarded.`n"
}

# ─────────────────────────────────────────────────────────────────────────────
# OPERATOR CHECKLIST — the accepted ~5% manual step
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "=== NEXT (manual — one-time) ===" -ForegroundColor White
$checklist = @()
if (-not $AutoSetTitle) {
  $checklist += "0. Set each session's title by hand (auto-title is OFF):"
  $Sessions | ForEach-Object { $checklist += "      session $([array]::IndexOf($Sessions,$_)+1) → $($_.Title)" }
}
$checklist += @(
  "1. In EACH session, confirm it's in 'Ask permissions' mode (needed for send_message to fire)."
  "2. Freddy (session 1) runs in LAUNCHED mode — it verifies state and runs the comms-check"
  "   directly against the already-booted peers (it does NOT re-generate pastes or wait)."
  "3. Approve the ~6 one-time 'Allow Once' prompts as Freddy messages Coach/Marc/Dez."
  "   (One approval per sender→target pair, remembered for the session — NOT per message.)"
  "4. Confirm all four report 'ready / comms OK'. Team is up."
)
$checklist | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
Write-Host ""

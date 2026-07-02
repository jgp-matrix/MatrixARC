#Requires AutoHotkey v2.0
; tearoff-session.ahk — EXPERIMENTAL, OPT-IN (team-boot.ps1 $AutoTearOff=$true).
; Move the CURRENTLY-SELECTED session into its own window via the menu path:
;   ⋯ (three-dots by the session) → "Open In" → "New Window".
;
; ⚠ Ships as a SAFE NO-OP (ExitApp 9) until you calibrate it. Reason: locating the per-session
; ⋯ button reliably across runs is UI-layout-dependent, and a mis-aimed click could hit the
; wrong control. So this does nothing until you fill in + confirm the sequence and flip the
; $Calibrated guard below to true. Prefer the manual menu path until you've verified this live.
;
; Args: 1 = CCD window handle (decimal ahk_id), 2 = a label for logging (e.g. "Coach")

hwnd  := A_Args.Length >= 1 ? A_Args[1] : "0"
label := A_Args.Length >= 2 ? A_Args[2] : "?"
win := "ahk_id " hwnd

; ── ⚙ CALIBRATION GUARD — leave false until the sequence below is confirmed on this build ──
Calibrated := false
if (!Calibrated)
    ExitApp(9)   ; 9 = "auto-tearoff not calibrated" — team-boot.ps1 treats this as skip

if !WinExist(win)
    ExitApp(3)
WinActivate(win)
if !WinWaitActive(win, , 5)
    ExitApp(2)
Sleep 300

; ── ⚙ CALIBRATE FROM HERE ──────────────────────────────────────────────
; Fill in the real steps for THIS build, e.g. (pseudo — confirm each):
;   1. Open the ⋯ menu for the currently-selected session (find its control/coords, or a hotkey).
;   2. Navigate to "Open In" (arrow keys / hover), then "New Window", and activate.
; Use keyboard navigation where possible (more robust than fixed coordinates). Verify a new
; window actually detaches before trusting it. Example skeleton (DISABLED — replace):
;
;   Send("{AppsKey}")            ; or click the ⋯ control
;   Sleep 400
;   SendText("Open In")
;   Sleep 400
;   Send("{Enter}")
;   Sleep 400
;   SendText("New Window")
;   Sleep 400
;   Send("{Enter}")
; ── ⚙ CALIBRATE TO HERE ────────────────────────────────────────────────

ExitApp(0)

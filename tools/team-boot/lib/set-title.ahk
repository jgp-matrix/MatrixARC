#Requires AutoHotkey v2.0
; set-title.ahk — set a session's title on a SPECIFIC window (by handle).
; Args: 1 = window handle (decimal ahk_id). The new title is staged on the CLIPBOARD by
; team-boot.ps1 (M2: emoji/unicode-safe — passing it as an arg risks codepage mojibake).
;
; ⚠ Only invoked when $AutoSetTitle=$true in team-boot.ps1. Default is OFF because a
; mis-calibrated sequence would type "Rename"+title into the CHAT INPUT and submit them
; as prompts (M1). Calibrate the marked block below and confirm a palette/dialog actually
; opens BEFORE enabling auto-title. If your build has no session-rename, leave auto-title
; off and set titles by hand.

hwnd := A_Args.Length >= 1 ? A_Args[1] : "0"
win := "ahk_id " hwnd

if !WinExist(win)
    ExitApp(3)
WinActivate(win)
if !WinWaitActive(win, , 5)
    ExitApp(2)
Sleep 300

; ── ⚙ CALIBRATE FROM HERE ─────────────────────────────────────────────
Send("^+p")            ; open command palette
Sleep 500
SendText("Rename")     ; filter to the rename-session command (adjust the command name)
Sleep 500
Send("{Enter}")        ; run it
Sleep 500
Send("^v")             ; paste the title (staged on clipboard — emoji-safe)
Sleep 300
Send("{Enter}")        ; confirm
; ── ⚙ CALIBRATE TO HERE ───────────────────────────────────────────────

ExitApp(0)

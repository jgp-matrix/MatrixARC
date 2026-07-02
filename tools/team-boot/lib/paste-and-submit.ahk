#Requires AutoHotkey v2.0
; paste-and-submit.ahk — activate a SPECIFIC window (by handle) and paste+submit the clipboard.
; Args: 1 = window handle (decimal ahk_id, captured by team-boot.ps1), 2 = clickInputFirst ("0"/"1")
; The onboarding text is staged on the clipboard by team-boot.ps1 before this runs.
; Acting on the exact handle (not an ahk_exe match) is the H1 fix — no wrong-window paste.

hwnd := A_Args.Length >= 1 ? A_Args[1] : "0"
clickFirst := A_Args.Length >= 2 ? A_Args[2] : "0"
win := "ahk_id " hwnd

if !WinExist(win)
    ExitApp(3)              ; handle not found — bail rather than paste into the wrong window
WinActivate(win)
if !WinWaitActive(win, , 5)
    ExitApp(2)             ; couldn't confirm focus — bail
Sleep 300

if (clickFirst = "1") {
    WinGetPos(&x, &y, &w, &h, win)
    MouseMove(x + w // 2, y + h - 60)   ; click into the bottom-center input area
    Click
    Sleep 200
}

Send("^v")          ; paste
Sleep 600
Send("{Enter}")     ; submit
ExitApp(0)

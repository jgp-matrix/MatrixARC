#Requires AutoHotkey v2.0
; paste-and-submit.ahk — activate the foreground CCD window, paste the clipboard, submit.
; Args: 1 = window match (e.g. "ahk_exe Claude Code Desktop.exe"), 2 = clickInputFirst ("0"/"1")
; The onboarding text is staged on the clipboard by team-boot.ps1 before this runs.

win := A_Args.Length >= 1 ? A_Args[1] : "A"
clickFirst := A_Args.Length >= 2 ? A_Args[2] : "0"

; If the match string isn't calibrated yet, fall back to the active (newest) window —
; the launcher acts on each session right after launching it, so it's foreground.
if (win != "A" && !WinExist(win))
    win := "A"

WinActivate(win)
if !WinWaitActive(win, , 5) {
    ; Couldn't confirm focus — bail rather than paste into the wrong window.
    ExitApp(2)
}
Sleep 400

if (clickFirst = "1") {
    ; Click into the input area (bottom-center) before pasting — some builds need focus there.
    WinGetPos(&x, &y, &w, &h, win)
    MouseMove(x + w // 2, y + h - 60)
    Click
    Sleep 200
}

Send("^v")          ; paste
Sleep 600
Send("{Enter}")     ; submit
ExitApp(0)

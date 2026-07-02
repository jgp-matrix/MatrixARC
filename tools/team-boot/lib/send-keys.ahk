#Requires AutoHotkey v2.0
; send-keys.ahk — activate a CCD window and send a key sequence (e.g. the new-session hotkey).
; Args: 1 = window match, 2 = keys in AHK Send syntax (e.g. "^n")

win := A_Args.Length >= 1 ? A_Args[1] : "A"
keys := A_Args.Length >= 2 ? A_Args[2] : ""

if (win != "A" && !WinExist(win))
    win := "A"

WinActivate(win)
if !WinWaitActive(win, , 5)
    ExitApp(2)
Sleep 300

if (keys != "")
    Send(keys)
ExitApp(0)

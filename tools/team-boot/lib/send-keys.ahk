#Requires AutoHotkey v2.0
; send-keys.ahk — activate a SPECIFIC window (by handle) and send a key sequence
; (e.g. the new-session hotkey in $NewSessionMethod='hotkey' mode).
; Args: 1 = window handle (decimal ahk_id), 2 = keys in AHK Send syntax (e.g. "^n")

hwnd := A_Args.Length >= 1 ? A_Args[1] : "0"
keys := A_Args.Length >= 2 ? A_Args[2] : ""
win := "ahk_id " hwnd

if !WinExist(win)
    ExitApp(3)
WinActivate(win)
if !WinWaitActive(win, , 5)
    ExitApp(2)
Sleep 300

if (keys != "")
    Send(keys)
ExitApp(0)

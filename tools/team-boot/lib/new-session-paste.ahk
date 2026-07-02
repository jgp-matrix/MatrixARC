#Requires AutoHotkey v2.0
; new-session-paste.ahk — CCD is single-window / multi-session: create a NEW session in the
; current window (Ctrl+N), then paste + submit the onboarding block INTO that new session.
; There is no new OS window to target (that only happens on a manual Shift+drag tear-off),
; so we act on the one CCD window by handle and rely on Ctrl+N switching it to the new session.
;
; Args: 1 = CCD window handle (decimal ahk_id)
;       2 = new-session keys (AHK Send syntax, e.g. "^n")
;       3 = clickInputFirst ("0"/"1")
;       4 = ms to wait after new-session before pasting (input must be ready in the NEW session)
;       5 = ms to wait after paste before submitting
; The onboarding text is staged on the clipboard by team-boot.ps1 before this runs.

hwnd       := A_Args.Length >= 1 ? A_Args[1] : "0"
newKeys    := A_Args.Length >= 2 ? A_Args[2] : "^n"
clickFirst := A_Args.Length >= 3 ? A_Args[3] : "0"
newDelay   := A_Args.Length >= 4 ? Integer(A_Args[4]) : 1500
pasteDelay := A_Args.Length >= 5 ? Integer(A_Args[5]) : 700

win := "ahk_id " hwnd
if !WinExist(win)
    ExitApp(3)                 ; CCD window not found — bail
WinActivate(win)
if !WinWaitActive(win, , 5)
    ExitApp(2)                 ; couldn't confirm focus — bail
Sleep 300

Send(newKeys)                  ; Ctrl+N → new session IN THIS WINDOW (⚙ calibrate the shortcut)
Sleep newDelay                 ; let the new session's input become ready (⚙ calibrate timing)

if (clickFirst = "1") {
    WinGetPos(&x, &y, &w, &h, win)
    MouseMove(x + w // 2, y + h - 60)   ; click into the bottom-center input area
    Click
    Sleep 200
}

Send("^v")                     ; paste the onboarding block into the NEW session
Sleep pasteDelay
Send("{Enter}")                ; submit
ExitApp(0)

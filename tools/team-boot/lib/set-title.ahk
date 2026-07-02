#Requires AutoHotkey v2.0
; set-title.ahk — set the CCD session title (agents can't self-title; we do it from outside).
; Args: 1 = window match, 2 = new title (may contain unicode/emoji)
;
; ⚙ CALIBRATE: this encodes HOW to rename a CCD session. The default tries an Electron-style
; command palette: Ctrl+Shift+P → type "Rename" → Enter → type the title → Enter.
; If your CCD build renames differently (right-click the session → Rename, or a menu item),
; REPLACE the marked block below with that sequence. If the build has no rename at all,
; comment the block out and set titles by hand — the launcher still opens + onboards sessions.

win := A_Args.Length >= 1 ? A_Args[1] : "A"
title := A_Args.Length >= 2 ? A_Args[2] : ""

if (win != "A" && !WinExist(win))
    win := "A"

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
SendText(title)        ; type the new title
Sleep 300
Send("{Enter}")        ; confirm
; ── ⚙ CALIBRATE TO HERE ───────────────────────────────────────────────

ExitApp(0)

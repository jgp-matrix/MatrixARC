# 📊 Team Status Board (live) — owned by Dez

> **Owner (sole writer): Dez.** Freddy (hub) pings Dez a compact status block on each work-state change;
> Dez displays it live in her session (Jon glances **here**) and appends timestamped snapshots to the
> Progress Log below as the permanent record. One-writer-per-file — Dez only (per G003, 2026-07-02).
> Format: `B/F/G### — Title` / `• one-liner` / `• STATUS: who's doing what now`.

## Current
**G002 — Automate the 4-session team startup boot**
- Launcher DELIVERED (`tools/team-boot/`, commit `1ba33d58`) — needs ONE calibration + test pass on Jon's desktop.
- **STATUS:** G002 **BUILT-PENDING-CALIBRATION** — Marc delivered · Coach queued to static-review the script · Jon to run the calibration pass · #199 (Tech-Review flag) still VERIFIED & queued behind the launcher test for Jon's build-gate.

## Progress Log (periodic snapshots, newest first)
- **[2026-07-02 13:43 MDT]** **G002 BUILT-PENDING-CALIBRATION** — Marc DELIVERED the launcher (`tools/team-boot/`, commit `1ba33d58`); needs one calibration + test pass on Jon's desktop. Coach queued to static-review the script; Jon to run calibration; #199 still VERIFIED & queued behind the launcher test for Jon's build-gate.
- **[2026-07-02 13:41 MDT]** Status ping — **G002** in progress: Marc BUILDING the launcher (PowerShell+AutoHotkey, ~6 one-time clicks); Coach idle (verifies after build); Freddy hub-monitoring; #199 (Tech-Review flag) VERIFIED & queued behind G002 for Jon's build-gate.
- **[2026-07-02]** G003 board stood up. G001 CLOSED (Allow-Once prompt hardcoded, accepted limitation). G002 [Decided] Option A → Marc building launcher. #199 verified, queued for Jon's build-gate. Plan: finish G002 → close-out → teardown → fresh boot via launcher (startup test) → #199.

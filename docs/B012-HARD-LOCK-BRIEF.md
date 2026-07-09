# B012 Fix — Hard One-Editor Lock (Editing Lease) — Brief

**To:** Coach (investigation + Detailed Plan)
**Author:** Freddy Lyst, 2026-07-09
**Status:** Brief — awaiting Coach feasibility/architecture pass, then Jon rulings, then build.

---

## Decision (Jon, 2026-07-09)

The **primary** fix for **B012** (concurrent-edit BOM data loss) is a **hard, automatic one-editor-per-project lock** — NOT the Phase B row-merge. When one user is actively editing a project, every other user is **truly read-only until the editor leaves**.

Phase B (PR #5, `claude/phase-b-bom-merge`) is **shelved and retained** — not merged, not deployed — as a *possible future data-safety backstop* (see Phase B disposition below). The live matrix + watcher are stood down.

## Why (grounded in code, not assumption)

- The current guardrail does **not** hard-block concurrent BOM edits:
  - **Owner Priority Mode** blocks 13 destructive bulk actions but, per its spec, **allows view + row/field edits** — a 2nd user can still type into and save BOM rows.
  - The only server-side write-lock, `isOwnerPriorityLocked` (`firestore.rules:202`), rejects a non-owner write **only when the owner manually sets `ownerLockActive = true`**. The 90-second presence lock is **client-side only** (the rules comment notes rules can't read `projectPresence`).
- **B012 occurred with these guardrails in place** — Jon + Andrew concurrently edited PRJ402096 and clobbered rows.
- So "one editor at a time" is currently **policy** (Jon holding sales off ARC), not a technical guarantee. This Brief makes it a technical guarantee.

## Approach — an editing LEASE on the project doc

Store an editing lease **on the project document** (the same pattern as the existing `quotePrintLock = {lockedBy, lockedByName, lockedAt, expiresAt}`). Firestore rules **can** read a field on the project doc (unlike `projectPresence`), so this is **server-enforceable** — which is the entire point.

- On entering the edit context, a user **claims** the lease: `editingBy`, `editingByName`, `editingClaimedAt`, `editingExpiresAt = now + TTL`.
- While a valid (unexpired) lease is held by **someone else**, all other users are **READ-ONLY**: rules reject their project-doc writes; the client disables edit affordances and shows "🔒 `<Name>` is editing — read-only" with a **request-access / take-over** affordance.
- The lease **heartbeats/renews** while the holder is active and **expires after an idle TTL** so a dead session never locks a project forever.
- **Owner/admin force-takeover** reuses the existing `ownerTakeover` audit pattern.

## Requirements / invariants

1. **Server-enforced** (Firestore rules), not client-only — the whole point of the pivot.
2. Data-retention rules still hold: the lock **prevents** an unauthorized write cleanly; it never partially writes or drops fields.
3. **No project deadlock** on session death — TTL + takeover guarantee recovery.
4. Must **not block a project's own legitimate background async writes** (extraction / BC-sync completions) landing under the lease holder's identity — trace against the **Async Project Ownership Rule**.
5. **Reconcile with the existing lock stack** — `ownerLockActive`, `ownerTakeoverActive`, Owner Priority Mode (client 90s presence), `quotePrintLock`. Avoid two overlapping systems; fold or supersede deliberately.

## Open rulings for Jon (surface AFTER Coach's feasibility pass, when tradeoffs are concrete)

1. **Idle TTL** before a lease auto-releases (default 60–90s heartbeat)?
2. **Same-user, two tabs** — block it (per-tab lease) or allow it (per-uid lease)? (If allowed, retained Phase B would be the backstop for that residual.)
3. **Granularity** — per-project (simplest) or per-panel (allows parallel work on different panels of one project)?
4. **Read-only scope** — fully read-only, or allow view + non-persisting local exploration?
5. **Takeover authority** — owner-only, admin-only, or any editor with a warning?

## ✅ FINALIZED RULINGS (Jon, 2026-07-09) — supersede the open questions above

1. **No idle-TTL auto-release.** Lock is **held while the project is open, released on exit.** Heartbeat used only to detect exit/crash + measure inactivity (for the 30-min force threshold), NOT to auto-release at 90s.
2. **Holder = first accessor** (any user, not just owner). Others view-only. **Ownership (`createdBy` / Salesman) is permanent and separate** from the edit lock.
3. **Request access** → holder grants (hand-off).
4. **Force-takeover only after 30 min holder inactivity + a pending request.** Holder gets a **warning + grace window to cancel** (proves presence); if not cancelled, control transfers to the requester.
5. **"Hold priority while I'm away" (`ownerLockActive`) blocks ALL takeovers** including the 30-min force path; **admin-only override.**
6. **Granularity: per-project** (Coach concrete).
7. **Read-only scope: reuse `readOnly`; holder prints only** (no non-holder Print-Only carve-out — dropped).
8. **Two tabs: per-session (`editingTabId`) with a THREE-STATE modal** (Jon 2026-07-09):
   - (i) lease held by a **different uid** → view-only modal: **"🔒 `<HolderName>` is already editing this project in another location."**
   - (ii) lease held by **my uid but a different tab/session id** → modal: **"You already have this project open in another tab — close this one and return to it."** (ARC distinguishes same-user-other-tab via `editingBy == me && editingTabId != mine`.)
   - (iii) lease **free or this tab** → editable.
   - Limit: a browser can't auto-focus the other tab — we instruct the user to close this one. Optional polish: `BroadcastChannel` within the same browser for instant same-tab detection + a "jump to that tab" nudge. Closes the self-clobber residual (Phase B shelved = no merge backstop).

**Scope note:** this is bigger than the original TTL-lease — it adds a request → grant → force-with-warning → priority-hold state machine + UI. Phased build (Coach to plan): **P1** core lock + read-only · **P2** request/grant hand-off · **P3** force-takeover + warning/grace · **P4** priority-hold + admin override. Reuses existing `ownerLockActive` + `ownerTakeover` machinery.

## Coach investigation asks

- Trace the current lock machinery: `ownerLockActive`, `ownerTakeoverActive`, Owner Priority Mode (client 90s presence), `quotePrintLock`, `isOwnerPriorityLocked` (`firestore.rules`).
- Confirm server-enforceability of a doc-field lease + the exact rules changes required.
- Enumerate **every write path** that must respect the lease: `saveProjectPanel` (`~9266`), `saveProject` (`~8940`), background async completions, BC sync, extraction writeback.
- Edge cases: session death, offline/reconnect replay, takeover races, same-user multi-tab.
- Recommend granularity + TTL + how it folds into (or replaces) the existing owner-priority system.
- **Output:** a Detailed Plan + a C-finding verdict.

## Phase B disposition

- **KEEP** branch `claude/phase-b-bom-merge` + PR #5 — do **NOT** delete, merge, or deploy. Retained as a candidate backstop for the same-user-two-tab and background-write residuals **if** Jon later elects "both."
- Live matrix + Marc's read-only watcher: **stood down** (watcher is complete + read-only; parked in `docs/PHASE-B-SAVE-SYNC-MODEL.md`).

## Containment

Manual containment (one editor per project; Jon holding sales off ARC) **stays in force until this hard lock ships** — at which point it becomes the automatic enforcement of that same policy and the manual hold can relax.

## References

- `SESSION-STATE.md`; `docs/PHASE-B-SAVE-SYNC-MODEL.md` (Marc — save/sync timing model + watcher)
- `firestore.rules:202` (`isOwnerPriorityLocked`); CLAUDE.md → Owner Priority Mode, `quotePrintLock`, Async Project Ownership Rule
- Coach C136 (activeExtractions "is editing" banner), C137 (B012 root cause), C138 (Phase B review)

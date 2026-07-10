# gap #5b (close-ghost) + F015 (non-dismissible 2nd-tab hard-block) — Coach Design/Plan

**To:** Freddy (Analyst Review) → Jon (approve) → Marc (build). **Author:** Sam Wize (Coach), 2026-07-10.
**Fast-follow after** B012 P1 (v1.23.5). Design only — NO code yet. Per-phase gated.
**One-line thesis:** a single primitive — **BroadcastChannel same-browser tab-liveness** — solves both halves: it lets a reopening tab tell a *ghost* prior tab (→ adopt) from a *live* 2nd tab (→ block), AND lets a *duplicated* tab (which shares the sessionStorage id) detect the live original and self-regenerate its id. Same-uid adopt is the robust close-ghost fix; the liveness signal is what makes F015's hard-block safe.

---

## 0. Root recap

- **gap #5b — CLOSE-GHOST (Jon hit live on prod).** `_releaseEditingLease` (app.jsx:38094) is an identity-guarded **transaction** (2 round-trips); on a real tab/browser **close** the page dies before it completes → the lease LINGERS with `editingExpiresAt = last-heartbeat + 90s`. Reopening the SAME project within 90s sees the ghost → false "🔒 open in another tab." **Reload/F5 is already fine** (gap #5a persists `_ARC_TAB_ID` in sessionStorage). The trap is **close-then-reopen / browser-restart within 90s.**
- **F015 — NON-DISMISSIBLE 2nd-tab hard-block (Jon wants it).** B012 P1 shipped the same-user other-tab modal DISMISSIBLE ("View read-only" + "Close the tab") precisely to avoid a ≤90s self-trap on the ghost (Coach catch). F015 restores "Close the tab" ONLY (non-dismissible) — but that is **only safe once the ghost can't produce a false positive** (else a user is trapped on their own only-tab ≤90s).
- **The duplicate-tab gap (Coach, gap #5a review).** Chrome "Duplicate Tab" COPIES sessionStorage → the duplicate shares `_ARC_TAB_ID` → the `editingTabId!==_ARC_TAB_ID` compare thinks it's the SAME tab → a genuine duplicate is **not detected** (L8 misses it) and could self-clobber (same-user only; cross-user stays server-enforced). A non-dismissible hard-block MUST detect duplicates, or it's both porous (misses the duplicate) and moot for that path.

**Data-safety invariant (unchanged throughout):** the CROSS-USER guarantee is the Firestore rule `isEditingLeaseLocked` keyed on `editingBy` vs `request.auth.uid` — **per-uid, no tab-id.** Nothing in this pair touches the rules. All of gap #5b/F015 is **same-uid, client-side** — it can reorganize who-among-my-own-tabs holds, and how the UI blocks, but a DIFFERENT uid is always rejected server-side regardless. So every mechanism below is data-safe by construction (same user ⇒ no cross-user clobber).

---

## 1. The unifying primitive — BroadcastChannel tab-liveness (`arc-lease`)

Each open ProjectView joins a same-origin `BroadcastChannel("arc-lease")` (per browser profile; reaches new tabs, duplicated tabs, and reopened tabs in the same browser — NOT other browsers/devices, which are genuinely separate sessions). Each live tab knows its `(uid, _ARC_TAB_ID, projectId, holdsLease)` and answers two queries:

- **`WHO_HOLDS {projectId}`** → any live tab that currently holds that project's lease replies **`HOLDER {projectId, tabId}`**. (Liveness probe for adopt.)
- **`ID_PING {tabId}`** → any live tab whose `_ARC_TAB_ID === tabId` (a duplicate sharing the id) replies **`ID_COLLISION {tabId, since}`**. (Uniqueness for F015.)

Probes are fire-and-collect with a short timeout (~250–400ms): **no reply ⇒ no live peer** (the prior tab is a ghost / the id is unique). Graceful fallback if `BroadcastChannel` is unavailable (see §7).

---

## 2. Chosen mechanisms

### 2a. Tab-id uniqueness — collision-regenerate (F015 prerequisite; lands in gap #5b)
On mount, after reading `_ARC_TAB_ID` from sessionStorage (gap #5a, app.jsx:489), broadcast `ID_PING {_ARC_TAB_ID}`. If a live peer replies `ID_COLLISION` (a duplicate shares my id), **regenerate** `_ARC_TAB_ID` (fresh uuid, overwrite sessionStorage) so this tab is now distinguishable. Tie-break so only the **newer** tab regenerates: the reply carries `since` (the peer's claim time); the tab with the later mount regenerates (the established tab keeps its id). Result: **every LIVE tab has a unique `_ARC_TAB_ID`**, so a duplicated tab is now correctly seen as a genuine 2nd tab (L8 + F015 detect it). Reload-stability (gap #5a) is preserved — a lone reload finds no collision and keeps its id.

### 2b. Same-uid ADOPT — the robust close-ghost fix (gap #5b primary)
Extend `_tryAcquireEditingLease` (app.jsx:38050). Today the other-tab branch (38065) fires when `valid && editingBy===uid && editingTabId && editingTabId!==_ARC_TAB_ID` → `{ok:false,kind:"other-tab"}`. **New:** before returning other-tab, run the `WHO_HOLDS` liveness probe:
- **A live peer replies holding `editingTabId`** → it's a genuine live 2nd tab → return `{ok:false,kind:"other-tab"}` (block; L8 preserved).
- **No reply (timeout)** → the prior tab is a **ghost** → **ADOPT**: `tx.update(editingBy:uid, editingByName, editingTabId:_ARC_TAB_ID, editingClaimedAt:now, editingExpiresAt:now+LEASE_STALE_MS, editingLastActivityAt:now)` → `{ok:true}`. No ≤90s wait.

**Why adopt is always data-safe:** it only fires for `editingBy===uid` (same user). The adopt write is rules-permitted (server `editingBy===uid` ⇒ `isEditingLeaseLocked`=false for me). A DIFFERENT uid never reaches this branch (different-uid stays `kind:"other-user"`, and a different user isn't on my BroadcastChannel anyway). Covers close-release-failure AND browser-restart. Matches Jon's "edit pushes back to the user if they have it open."

Interaction with the pre-tick guard (37b15953): on reopen the guard seeds `leaseReadOnly=true` (init shows my ghost, different tab) → brief read-only until the adopt resolves (~probe + tx, sub-second) → then editable. Acceptable (vs 90s); note-only.

### 2c. Best-effort reliable-release-on-close (latency improvement — NOT the guarantee)
Upgrade the close handler (app.jsx:37504 `beforeunload`) to also fire on **`pagehide`** (fires in more close/navigate/mobile cases than `beforeunload`; keep `beforeunload` as fallback). Keep the **existing identity-guarded transaction** — it completes on in-app navigation and often on `pagehide`; it best-effort reduces the CROSS-USER ghost window after a close. **Do NOT use `visibilitychange:hidden` for release** — a tab-switch/minimize would wrongly drop a live holder's lease. **Recommendation: NO server endpoint** (sendBeacon-to-callable) in this pair — 2b (adopt) fully handles the SAME-user case, and the residual is only a ≤90s CROSS-user handoff delay after a hard close, which degrades gracefully via staleness. (See §6 Q1 — Jon ruling on whether the ≤90s cross-user close-delay is acceptable or worth a future sendBeacon endpoint.)

### 2d. F015 — non-dismissible hard-block (rides on 2a+2b)
Once 2a (duplicates detected) + 2b (ghosts adopted, not blocked) are in: revert the same-user other-tab modal to **"Close the tab" ONLY** (best-effort `window.close()`, non-dismissible otherwise) — reversing the P1 restore (89e289f7). The modal now fires ONLY for a **genuine live 2nd/duplicate tab** (never a ghost — ghosts adopt; never a false duplicate — duplicates regenerate), so it can't self-trap. The cross-user **"Project in use"** modal is UNCHANGED (keeps "View read-only" — viewing another user's project is intended).

---

## 3. Exact touch points

| Change | Location |
|---|---|
| BroadcastChannel join + `WHO_HOLDS`/`ID_PING` responder (new effect, cleanup on unmount) | new, in ProjectView near the lease effect (~app.jsx:37480) |
| Tab-id collision-regenerate (2a) | `_ARC_TAB_ID` init path (app.jsx:489) + a mount-time collision check |
| Same-uid adopt (2b) | `_tryAcquireEditingLease` other-tab branch (app.jsx:38065) — add the `WHO_HOLDS` probe + adopt-vs-block decision |
| Close-release upgrade (2c) | lease-effect `beforeunload` handler (app.jsx:37504) → add `pagehide`; `_releaseEditingLease` (38094) unchanged |
| F015 hard-block (2d) | `leaseModal` render, `kind==="other-tab"` branch (~app.jsx:38970) — remove "View read-only", keep "Close the tab" only |
| Keep-alive / cross-user rules / gap#4 identity-guard | **UNCHANGED** |

---

## 4. Risk / data-safety

- **Cross-user server lock UNCHANGED** — no `firestore.rules` change; `isEditingLeaseLocked` (per-uid) still rejects a different uid regardless of any tab-id logic. A DIFFERENT user is never adopted, never on the BroadcastChannel, always blocked server-side. ✓
- **gap #4 identity-guard preserved** — `_releaseEditingLease` stays identity-guarded (`editingBy===uid && editingTabId===_ARC_TAB_ID`); the pagehide upgrade reuses it. The reviewer-hand-back path (gap #4) is untouched. ✓
- **Adopt is same-uid-only** → no data-loss surface (same user = one editor's own tabs; can't clobber another user). ✓
- **BroadcastChannel is advisory** — used only to choose adopt-vs-block and to de-dupe ids; it NEVER gates a write's data-safety (the rules do). A BC failure degrades to §7 fallback, never to data loss. ✓
- **Collision-regenerate** only changes a client tab-id (sessionStorage); never a Firestore/data field. ✓

---

## 5. Sequencing within the pair

1. **gap #5b first** (2a uniqueness + 2b adopt + 2c close-release). This makes ghosts non-harmful (adopt) and duplicates detectable (unique ids) — the safety preconditions.
2. **F015 second** (2d hard-block), riding on #1. Shipping 2d before #1 re-introduces the exact ≤90s self-trap Coach caught (and Freddy's stated F015-behind-#5b rule). **Both may ship in one release** (v1.23.6) as long as 2d's code depends on 2a+2b being present — but they are gated in this order, and 2d must not merge without 2a+2b.

---

## 6. Jon rulings needed

- **Q1 — cross-user close-handoff latency.** After a hard browser-close, a DIFFERENT user reopening within 90s waits ≤90s for the ghost to expire (adopt is same-uid-only). Accept the ≤90s cross-user delay (recommended — degrades gracefully; no new server surface), OR invest in a `sendBeacon`→HTTP-function guaranteed server-side release now (adds an auth'd endpoint)? **Coach lean: accept ≤90s; defer sendBeacon unless it's a real complaint.**
- **Q2 — same-uid, two GENUINE live tabs under F015.** With 2a+2b, a real 2nd live tab gets the non-dismissible "Close the tab" modal. `window.close()` is best-effort (browsers block it for user-opened tabs) → the user must close it manually. Confirm that's the intended UX (a truly non-dismissible modal that instructs "close this tab"), vs a softer "this tab is read-only; your other tab has edit" persistent lock. **Coach lean: Jon already ruled non-dismissible; confirm it applies to the manual-close case.**
- **Q3 — cross-browser/device same user.** BroadcastChannel does NOT reach another browser/device. Same uid on device A (holds) + device B (opens): device B can't probe A → device B sees a valid same-uid lease it can't confirm live. Adopt (steal from A) or block? **Coach lean: block+adopt-on-staleness like today (treat a cross-device same-uid as "held elsewhere" — don't silently steal across devices); i.e., the adopt fast-path is same-browser-only, cross-device falls back to the 90s-staleness path.** Confirm.

---

## 7. Fallback (no BroadcastChannel)

If `BroadcastChannel` is unavailable (old browser / blocked): the liveness probe can't run. Options for the same-uid-different-tab case: (i) **adopt-anyway** (data-safe — same uid; loses L8 single-tab enforcement for that user on that browser, but no data loss and no self-trap), or (ii) block+90s-wait (preserves L8, reintroduces the same-uid reopen delay). **Coach recommendation: (i) adopt-anyway on the no-BC fallback** — trap-free + data-safe; F015's hard-block simply doesn't engage there (the "2nd tab" adopts and becomes holder). Legacy browsers thus get gap #5a's reload-safety + a trap-free reopen, without F015's single-tab enforcement. Log the fallback path.

---

## 8. Test matrix

| # | Scenario | Expected |
|---|---|---|
| G1 | Close the only tab → reopen SAME project in a NEW tab within 90s | Ghost adopted → **editable immediately**, no "open in another tab" (gap #5b core) |
| G2 | Browser restart → reopen within 90s | Same as G1 (adopt) |
| G3 | Reload/F5 same tab | Editable (gap #5a id-stable; no regression) |
| G4 | Genuine 2nd LIVE tab (new tab, same user, 1st still open) | 2nd tab BLOCKED — non-dismissible "Close the tab" (F015); 1st tab keeps editing |
| G5 | Chrome "Duplicate Tab" | Duplicate regenerates id (2a) → detected as a genuine 2nd tab → BLOCKED (F015) |
| G6 | CROSS-USER: user B opens while user A holds (live) | B read-only, "Project in use" (dismissible, View read-only) — unchanged |
| G7 | CROSS-USER after A closes, B opens within 90s | B read-only ≤90s then claims (Q1: staleness path; no adopt across users) |
| G8 | No-BroadcastChannel browser: close→reopen | Adopt-anyway (§7) → editable, trap-free; F015 not enforced |
| G9 | Data-safety regression: two DIFFERENT users, concurrent edit attempt | Server rules still reject the non-holder (cross-user lock intact) — the whole point of B012 |
| G10 | gap #4 post-review hand-back still works | Reviewer approves → owner adopts/holds → editable (no regression) |

---

## 9. Summary

- **BroadcastChannel liveness** is the enabling primitive for the whole pair.
- **gap #5b = same-uid ADOPT** (ghost → reclaim, no 90s wait) + **tab-id uniqueness** (collision-regenerate) + best-effort **pagehide** release. Robust, same-uid, no rules change.
- **F015 = non-dismissible hard-block** riding safely on the above (ghosts adopt, duplicates detected → the modal only fires for a genuine live 2nd tab → no self-trap).
- **Data-safety:** cross-user server lock + gap#4 identity-guard untouched; every new mechanism is same-uid + client-side + advisory. Sequencing: #5b before/with F015. 3 Jon rulings (Q1 cross-user close latency, Q2 non-dismissible UX confirm, Q3 cross-device same-uid).

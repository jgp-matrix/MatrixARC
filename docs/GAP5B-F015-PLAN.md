# gap #5b (close-ghost) + F015 (non-dismissible 2nd-tab hard-block) — Coach Design/Plan

**To:** Freddy (Analyst Review) → Jon (approve) → Marc (build). **Author:** Sam Wize (Coach), 2026-07-10.
**Fast-follow after** B012 P1 (v1.23.5). **v2 (2026-07-10): Freddy Analyst Review APPROVE (`docs/GAP5B-F015-ANALYST-REVIEW.md`) + Jon's 3 rulings + R1–R4 folded in — ready to build.** Per-phase gated.
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
On mount, **as early as possible** (before any edit/save can fire — see R1), after reading `_ARC_TAB_ID` from sessionStorage (gap #5a, app.jsx:489), broadcast `ID_PING {tabId, since, nonce}`. If a live peer replies `ID_COLLISION` (a duplicate shares my id), **regenerate** `_ARC_TAB_ID` (fresh uuid, overwrite sessionStorage) so this tab is distinguishable, and **synchronously force a `leaseReadOnly` recompute** (the regenerated tab's id no longer matches the holder → it flips to blocked). Result: **every LIVE tab has a unique `_ARC_TAB_ID`** → a duplicated tab is correctly seen as a genuine 2nd tab (L8 + F015 detect it). Reload-stability (gap #5a) preserved — a lone reload finds no collision, keeps its id.
- **Tie-break (R4):** only the **newer** tab regenerates. Compare `since` (mount time); if `since` ties, compare a per-tab random `nonce` (deterministic: e.g. lower nonce regenerates). Guarantees exactly one regenerates — never both (churn) or neither (undetected duplicate).
- **Dup-tab pre-regenerate window (R1):** the pre-tick guard (37b15953) sees the shared id as "my tab holds" → seeds `leaseReadOnly=false` (editable) until the collision reply lands. BroadcastChannel delivery within one browser is near-instant (single-digit ms; the 250–400ms timeout applies only to the *no-reply* ghost/unique case), so a duplicate is blocked within ~ms — before a user could act. **Belt:** gate the save path behind a `_leaseInitResolved` flag (no persist until the first claim/ID_PING round resolves), so even a pathological fast edit can't land in the window. Asserted by test G12.

### 2b. Same-uid ADOPT — the robust close-ghost fix (gap #5b primary)
Extend `_tryAcquireEditingLease` (app.jsx:38050). Today the other-tab branch (38065) fires when `valid && editingBy===uid && editingTabId && editingTabId!==_ARC_TAB_ID` → `{ok:false,kind:"other-tab"}`. **New:** before returning other-tab, run the `WHO_HOLDS` liveness probe:
- **A live peer replies holding `editingTabId`** → a genuine live 2nd tab → `{ok:false,kind:"other-tab"}` (block; L8 preserved).
- **No reply (timeout ~300ms)** → the prior tab is a **ghost / frozen / on another device** → **ADOPT**: `tx.update(editingBy:uid, editingByName, editingTabId:_ARC_TAB_ID, editingClaimedAt:now, editingExpiresAt:now+LEASE_STALE_MS, editingLastActivityAt:now)` → `{ok:true}`. No ≤90s wait.

**Q3 (Jon overrode my block-rec): ADOPT ACROSS DEVICES.** No cross-device guard — same-uid + no live BC reply → adopt. This *naturally* covers another device (device A can't answer device B's `WHO_HOLDS`, so B sees no reply → adopts). The safety cost of a same-uid cross-device dual-write is closed by **relinquish-on-takeover (§2e)** — the load-bearing safeguard Jon accepted the brief residual window for.

**Why adopt is data-safe:** fires only for `editingBy===uid` (same user); the adopt write is rules-permitted (server `editingBy===uid` ⇒ `isEditingLeaseLocked`=false for me). A DIFFERENT uid never reaches this branch (stays `kind:"other-user"`; a different user isn't on my BroadcastChannel). Covers close-release-failure, browser-restart, AND cross-device.

**Simultaneous-adopt race (R3):** two new tabs adopting one ghost — the adopt is inside the Firestore transaction, so it serializes. The tx must **re-check inside the transaction**: adopt only if the lease is still the ghost it saw (`editingTabId` unchanged, or expired/free); if `editingTabId` changed to another id (the other tab won), **abort adopt → return `{ok:false,kind:"other-tab"}`** (block; the winner is now holder). Firestore contention-retry makes this deterministic — exactly one adopts. Test G11.

Interaction with the pre-tick guard (37b15953): on reopen the guard seeds `leaseReadOnly=true` (init shows my ghost, different tab) → brief read-only until the adopt resolves (~probe + tx, sub-second) → then editable. Acceptable (vs 90s); note-only.

### 2e. RELINQUISH-ON-TAKEOVER — the load-bearing shared safeguard (Q3 + R2, unified)
**One mechanism, used by both cross-device adopt (Q3) and frozen-tab demotion (R2).** A tab must STOP writing the instant its lease is taken over by another of the same user's tabs/devices — otherwise two same-uid sessions both pass the (per-uid) rules and clobber each other (the B012 class *within one user's own sessions*).
- **Trigger:** the project-doc `onSnapshot` (and an on-**resume** re-check — `visibilitychange:visible` / `pagehide`-`persisted` bfcache-restore / freeze-resume) observes `valid && editingBy===uid && editingTabId && editingTabId !== _ARC_TAB_ID`. (My uid still holds, but a DIFFERENT tab/device of mine now holds it.)
- **Action:** `setLeaseReadOnly(true)` + indicator **"✋ Editing moved to your other session — read-only here"** + **STOP writing** (readOnly gates the UI; also drop any in-flight/queued save). **Do NOT auto-reclaim** — that would ping-pong two same-uid tabs. The user may explicitly re-take (re-claim action) to move editing back; otherwise this tab stays read-only until the other releases.
- **Consistency with adopt (§2b):** adopt fires only when there is NO live holder (WHO_HOLDS silent). If a live same-uid holder exists (WHO_HOLDS reply, or `editingExpiresAt` advancing), this tab does NOT adopt — it relinquishes/blocks. So adopt (reopen onto a dead lease) and relinquish (my live lease got taken) are the two sides of the same coin, and never ping-pong.
- **R2 frozen-tab:** a frozen holder can't answer `WHO_HOLDS` (Chrome Page-Lifecycle freeze) → a reopening same-uid tab adopts (thinks ghost) → on **un-freeze/resume** the demoted tab hits this relinquish trigger (`editingTabId` moved) → read-only, never blind-writes. Benign (same-uid), and the residual takeover→relinquish window is the tradeoff Jon accepted; **minimize it** (relinquish on the first onSnapshot/resume tick).

### 2c. Best-effort reliable-release-on-close (latency improvement — NOT the guarantee)
Upgrade the close handler (app.jsx:37504 `beforeunload`) to also fire on **`pagehide`** (fires in more close/navigate/mobile cases than `beforeunload`; keep `beforeunload` as fallback). Keep the **existing identity-guarded transaction** — it completes on in-app navigation and often on `pagehide`; it best-effort reduces the CROSS-USER ghost window after a close. **Do NOT use `visibilitychange:hidden` for release** — a tab-switch/minimize would wrongly drop a live holder's lease. **Recommendation: NO server endpoint** (sendBeacon-to-callable) in this pair — 2b (adopt) fully handles the SAME-user case, and the residual is only a ≤90s CROSS-user handoff delay after a hard close, which degrades gracefully via staleness. (See §6 Q1 — Jon ruling on whether the ≤90s cross-user close-delay is acceptable or worth a future sendBeacon endpoint.)

### 2d. F015 — non-dismissible hard-block (rides on 2a+2b) [Q2 confirmed]
Once 2a (duplicates detected) + 2b (ghosts adopted, not blocked) are in: revert the same-user other-tab modal to **"Close the tab" ONLY** (best-effort `window.close()`, non-dismissible otherwise — manual close if the browser blocks it for a user-opened tab) — reversing the P1 restore (89e289f7). The modal now fires ONLY for a **genuine live 2nd/duplicate tab** (never a ghost — ghosts adopt; never a false duplicate — duplicates regenerate), so it can't self-trap. **Q2 (Jon confirmed): non-dismissible, applies to the manual-close case.** The cross-user **"Project in use"** modal is UNCHANGED (keeps "View read-only") — but gains a countdown (§2f).

### 2f. Cross-user "Project in use" modal — countdown + auto-grant (Q1)
The cross-user held state (`kind:"other-user"`) gets a **live countdown + auto-grant** so the waiting user isn't left refreshing. Critical nuance (Jon): the countdown is valid ONLY when the lease is genuinely **AGING** toward a fixed `editingExpiresAt` (holder gone / not renewing); a **live-renewing** holder must NOT show a resetting countdown.
- **Distinguish aging vs live-renewed** from the viewer's `onSnapshot` stream: track the last-seen `editingExpiresAt`. If it **advances** between snapshots (holder heartbeat pushing it forward, ~every 30s) → holder is LIVE → mode **"currently editing"** (indefinite, NO countdown). If it stays **fixed** (no advance across ~one renewal interval) and `now` approaches it → mode **"countdown"**: show "🔒 `<holder>` is editing — available in `##s`" ticking `editingExpiresAt − now`.
- **Auto-grant at 0:** when the countdown reaches 0 (lease expired, holder gone), fire an **immediate claim tick** (don't wait for the 30s interval) → the now-stale lease is claimable → auto-claim + auto-dismiss the modal → editable. (This is the existing tick's stale-claim, triggered eagerly at t=0.)
- Scope: **cross-user only.** Same-user is instant-**adopt** (§2b) — no wait, no countdown. If the holder resumes renewing mid-countdown (`editingExpiresAt` advances), switch back to "currently editing" (cancel the countdown) — never show it resetting.

### 2g. Manual "Edit here" re-take on a RELINQUISHED same-user session (completes Q3's round-trip)
**Why needed:** with Q3 adopt-across-devices + §2e relinquish + NO auto-reclaim, the round-trip strands the loser. User edits on device A → opens B → B adopts, A relinquishes (read-only, "editing moved"). B is now LIVE-RENEWING (`editingExpiresAt` keeps advancing) → never goes stale → A's §2f aging-countdown NEVER triggers → **A is stuck read-only permanently with no path back.** Returning to A, the user can't edit there.
- **Fix:** on the RELINQUISHED same-user state (§2e — "editing moved to your other session"), show an **"✋ Edit here"** affordance ("Take editing on this device"). Click → **unconditional same-uid ADOPT** (reuse §2b's adopt write: `editingTabId=mine`, renew) — **skip the WHO_HOLDS probe** (this is a deliberate user override of a known-live other session, not a reopen-onto-ghost decision). The OTHER session then observes the takeover via §2e `onSnapshot` → IT relinquishes. Clean, user-initiated handoff.
- **No ping-pong:** §2g is MANUAL; §2e's no-auto-reclaim rule stands, so the loser does NOT auto-grab back — it flip-flops only when a user clicks "Edit here" on a device. Same-uid → data-safe (rules permit; the loser relinquishes so no dual-write).
- **Distinct from the F015 hard-block (§2d) and the P2 request/grant:** §2g appears ONLY on the **relinquished** state (a session that USED to hold, adopted-over cross-device/frozen) — NOT on a same-browser 2nd tab that never held (that's §2d's non-dismissible "Close the tab"; a cross-device loser can't "close a tab on another device" so it gets "Edit here" instead). And it needs NO grant from the other side (it's your OWN session) — unlike the cross-USER P2 request→grant. Keep them separate.

---

## 3. Exact touch points

| Change | Location |
|---|---|
| BroadcastChannel join + `WHO_HOLDS`/`ID_PING` responder (new effect, cleanup on unmount) | new, in ProjectView near the lease effect (~app.jsx:37480) |
| Tab-id collision-regenerate + tie-break (2a, R1/R4) | `_ARC_TAB_ID` init path (app.jsx:489) + early mount-time `ID_PING`; `_leaseInitResolved` save-gate |
| Same-uid adopt + in-tx re-check (2b, R3) | `_tryAcquireEditingLease` other-tab branch (app.jsx:38065) — `WHO_HOLDS` probe + adopt-vs-block; adopt tx re-checks `editingTabId` at commit |
| **Relinquish-on-takeover (2e, Q3+R2) — load-bearing** | new: project-doc `onSnapshot` handler + on-resume re-check (`visibilitychange`/bfcache) → if `editingBy===uid && editingTabId!==_ARC_TAB_ID` → read-only + stop writing + indicator; NO auto-reclaim |
| Cross-user countdown + auto-grant (2f, Q1) | `leaseModal` `kind==="other-user"` render — aging-vs-live detection from `editingExpiresAt` stream + eager claim at t=0 |
| **"Edit here" re-take (2g)** — completes Q3 round-trip | the relinquished-state indicator (§2e) — add an "✋ Edit here" button → unconditional same-uid adopt (skip WHO_HOLDS) → other session relinquishes |
| Close-release upgrade (2c) | lease-effect `beforeunload` handler (app.jsx:37504) → add `pagehide`; `_releaseEditingLease` (38094) unchanged (do NOT use `visibilitychange` for release) |
| F015 hard-block (2d, Q2) | `leaseModal` render, `kind==="other-tab"` branch (~app.jsx:38970) — remove "View read-only", keep "Close the tab" only |
| Keep-alive / **cross-user firestore.rules** / **gap#4 identity-guard** | **UNCHANGED** (data-safety invariant) |

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

## 6. Jon rulings — RESOLVED (2026-07-10)

- **Q1 — cross-user close-handoff latency → ACCEPT ≤90s (no sendBeacon endpoint) + ADD A COUNTDOWN.** The cross-user "held" modal shows a live "available in `##s`" countdown that auto-grants (auto-claim + auto-dismiss) at 0 — **but only for an AGING lease** (holder gone); a live-renewing holder shows indefinite "currently editing" (no resetting countdown). See §2f. Same-user is instant-adopt (no wait).
- **Q2 — non-dismissible CONFIRMED.** A genuine live 2nd tab → "Close the tab" only (best-effort `window.close()`, manual close otherwise). See §2d.
- **Q3 — ADOPT ACROSS DEVICES (Jon overrode the block-rec).** Same-uid + no live BC reply → adopt (covers cross-device naturally). **Required safeguard = relinquish-on-takeover (§2e):** the losing device flips to read-only + stops writing when it sees `editingBy===uid` but `editingTabId` moved. Brief takeover→relinquish window is the accepted tradeoff. Cross-device guard DROPPED (simpler).

---

## 7. Fallback (no BroadcastChannel)

If `BroadcastChannel` is unavailable (old browser / blocked): the liveness probe can't run. Options for the same-uid-different-tab case: (i) **adopt-anyway** (data-safe — same uid; loses L8 single-tab enforcement for that user on that browser, but no data loss and no self-trap), or (ii) block+90s-wait (preserves L8, reintroduces the same-uid reopen delay). **Coach recommendation: (i) adopt-anyway on the no-BC fallback** — trap-free + data-safe; F015's hard-block simply doesn't engage there (the "2nd tab" adopts and becomes holder). Legacy browsers thus get gap #5a's reload-safety + a trap-free reopen, without F015's single-tab enforcement. Log the fallback path. **Note:** relinquish-on-takeover (§2e) is `onSnapshot`-driven (observes `editingTabId` moved) and does NOT depend on BroadcastChannel — so even on the no-BC fallback, a losing tab still relinquishes when adopted-over → the same-uid dual-write safeguard holds regardless of BC availability.

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
| G11 | Simultaneous-adopt (R3): TWO new tabs reopen onto one ghost at once | Adopt tx serializes → exactly ONE adopts (editable); the other re-reads live `editingTabId` → blocks |
| G12 | Dup-tab no-self-clobber window (R1): Chrome Duplicate Tab, try to edit instantly | No write lands pre-regenerate (`_leaseInitResolved` gate); duplicate flips to blocked within ~ms |
| G13 | Cross-user countdown + auto-grant (Q1): holder closes, waiter watching | Aging lease → countdown ticks → auto-grants (editable) at 0; if holder resumes renewing → switches to "currently editing", no reset |
| G14 | Cross-device adopt + relinquish (Q3/§2e): device A holds, device B opens same project | B adopts (A silent); A's next onSnapshot/resume → A relinquishes (read-only, "editing moved", stops writing) — no dual-write |
| G15 | Frozen-tab demotion (R2/§2e): background holder frozen >probe-timeout, same-user reopens | Reopener adopts; on un-freeze the frozen tab relinquishes (read-only), never blind-writes |
| G16 | "Edit here" round-trip (§2g): A edits → B adopts → A relinquished → user clicks "Edit here" on A | A re-adopts (unconditional same-uid) → B relinquishes; editable on A; NO ping-pong (B does not auto-grab back) |

---

## 9. Summary

- **BroadcastChannel liveness** is the enabling primitive for the pair.
- **gap #5b = same-uid ADOPT** (ghost/frozen/cross-device → reclaim, no 90s wait) + **tab-id uniqueness** (collision-regenerate, R1/R4) + best-effort **pagehide** release + **relinquish-on-takeover (§2e)** — the load-bearing shared safeguard (Q3 cross-device adopt + R2 frozen-tab demotion, unified: a tab whose lease was taken by another same-uid session flips read-only + stops writing; `onSnapshot`-driven, BC-independent).
- **F015 = non-dismissible hard-block** riding safely on the above (ghosts adopt, duplicates detected → the modal only fires for a genuine live 2nd tab → no self-trap).
- **Cross-user Q1** = countdown + auto-grant on an AGING lease; "currently editing" for a live-renewing holder.
- **§2g "Edit here"** = manual same-uid re-take on a relinquished session — completes Q3's round-trip (a cross-device loser isn't stranded read-only; user-initiated, no ping-pong, no grant needed for your own session).
- **Data-safety:** cross-user server lock + gap#4 identity-guard UNTOUCHED; every new mechanism is same-uid + client-side + advisory; relinquish closes the same-uid cross-session dual-write. Sequencing: #5b before/with F015.
- **Rulings RESOLVED (Jon):** Q1 accept ≤90s + countdown; Q2 non-dismissible confirmed; Q3 adopt-across-devices + relinquish. **R1–R4 folded** (dup-window save-gate; frozen-tab→relinquish; simultaneous-adopt in-tx serialize; tie-break `since`+`nonce`). Test matrix G1–G15.

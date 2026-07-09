# B012 Fix — Hard One-Editor Lock (Editing Lease) — Coach Detailed Plan **v2**

**To:** Freddy (route to Jon) → Marc (build). **Author:** Sam Wize (Coach). **v1:** 2026-07-09 (`d649dc2f`). **v2:** 2026-07-09 (this rev — incorporates Jon's finalized rulings).
**Feeds:** `docs/B012-HARD-LOCK-BRIEF.md` (Brief + FINALIZED RULINGS §48). Pipeline: this plan → Jon approve → Marc build (phased) → Coach review (per phase) → Jon sign-off.
**Verdict:** **FEASIBLE.** **P1 = MEDIUM** and delivers the actual B012 guarantee on its own. **P2–P4 = MEDIUM-HIGH** (a request→grant→force state machine layered on top). No architectural blockers; the model maps cleanly onto existing machinery (`ownerLockActive` = priority-hold, `ownerTakeover` = admin override).

---

## What changed from v1 (C139) — read this first

v1 designed a **TTL lease** (auto-release after 90s idle). Jon's finalized model (Brief §48) is **richer** and replaces the auto-release with a **held-while-open lock + a request/grant/force state machine**:

| # | v1 (C139) | v2 (Jon's ruling) |
|---|---|---|
| Release | 90s idle-TTL auto-release | **Held while project open; released on exit.** No idle release. |
| Heartbeat | drives the TTL release | drives **crash/exit detection** + **inactivity measurement** only |
| Recovery | TTL frees a dead lock | **Request → Grant** (cooperative) OR **Force after 30-min inactivity + warning/grace** |
| Priority-hold | (not modeled) | `ownerLockActive` **blocks all takeovers**; admin-only override |
| Holder | first accessor | first accessor (**confirmed**); ownership is separate + permanent |
| Two tabs | per-uid, Phase B backstop | **per-session** (`editingTabId`) — 2nd tab view-only |
| Granularity | per-project | per-project (**unchanged**) |
| Read-only | reuse `readOnly` (+print sub-q) | reuse `readOnly`; **holder prints only** (print sub-q dropped) |

**The good news:** the core P1 rules barely change from v1 — the heartbeat now renews on *tab-open* (not user-activity), so `editingExpiresAt` keeps advancing while the tab is open and the lock only frees on clean exit or a stopped (crashed) tab. The heavy new work is the P2–P4 state machine.

---

## 1. Lock semantics — the two thresholds (the subtlest point; get this right)

Jon's "no idle-TTL release" + "heartbeat detects exit/crash" + "30-min inactivity for force" reconcile into **two independent timers**:

1. **Heartbeat-staleness (~90s) = crash/hard-exit detection.** The heartbeat fires while the tab is open **regardless of whether the user is typing.** So a holder who opens a project and walks away for hours keeps beating and **keeps the lock** (satisfies "held while open, no idle release"). The lock frees automatically **only** when the tab stops beating (crash, kill, network loss) — after ≤90s the lease is reclaimable. On a **clean exit** the client releases explicitly (immediate free); the 90s window is the crash safety-net, **not** an idle release.
2. **User-inactivity (30 min) = force-eligibility.** A **separate** timestamp `editingLastActivityAt`, stamped on **real edits** (content saves), **not** on the heartbeat. Crossing 30 min never releases the lock — it only makes the lock **eligible for force-takeover** *if* a request is pending (P3).

Keeping these two timers distinct is the crux. `editingExpiresAt` (tab-alive) ≠ `editingLastActivityAt` (user-active).

---

## 2. Data model (project doc — additive, data-retention-safe)

```
// P1 — core lock
editingBy:         string|null   // uid of holder
editingByName:     string|null   // display name for the banner
editingTabId:      string|null   // per-session id (client-side self-clobber guard)
editingClaimedAt:  number|null   // ms — first claim of this hold
editingExpiresAt:  number|null   // ms = last-heartbeat + STALE_MS; VALID iff editingBy!=null && editingExpiresAt>now
// P3 — activity + force
editingLastActivityAt: number|null            // ms — last REAL edit (not heartbeat); drives 30-min force gate
editingForcePending:   {byUid,byName,atMs,graceExpiresAt}|null   // an armed force-takeover in its grace window
// P2 — request/grant
editingAccessRequest:  {byUid,byName,atMs}|null                  // a view-only user's pending access request
// P4 — reuse existing fields (no new field)
ownerLockActive:     bool         // EXISTING — repurposed: "hold priority / block takeovers while away"
ownerTakeoverActive: {byUid,byName,expiresAt,...}|null  // EXISTING — admin override
```

Nulled on new-project / copy / restore alongside the existing `quotePrintLock=null` scrub (`app.jsx:10232` region) — add the lease fields there.

---

## 3. The state machine (P2–P4) — the new heart of the design

```
        ┌─────────────┐  claim (free/stale/clean)   ┌──────────────┐
        │  VIEW-ONLY  │ ──────────────────────────▶ │   HOLDER     │
        │ (non-holder)│                              │ (editing)    │
        └─────────────┘                              └──────────────┘
             │  Request Access                          │   ▲
             │  (writes editingAccessRequest=me)        │   │ heartbeat renews editingExpiresAt
             ▼                                          │   │ edits stamp editingLastActivityAt
        ┌─────────────┐   holder GRANTS (hand-off)      │   │
        │ REQUEST     │ ───────────────────────────────┘   │
        │ PENDING     │   sets editingBy=requester, clears request
        └─────────────┘                                     │
             │  holder inactive ≥30min (editingLastActivityAt)
             │  AND request pending AND NOT priority-hold
             ▼
        ┌─────────────┐  arm force → editingForcePending{graceExpiresAt=now+GRACE}
        │ FORCE ARMED │  holder sees WARNING modal + countdown
        └─────────────┘
             │                         │
   holder CANCELs (proves presence)    grace expires, no cancel
   → clears forcePending,              → requester's client transactionally
     stamps activity, RETAINS            claims: editingBy=requester
             │                         │
             ▼                         ▼
        HOLDER retains            requester becomes HOLDER

  PRIORITY-HOLD (ownerLockActive=true): blocks the "arm force" transition entirely.
  ADMIN OVERRIDE: an admin arms ownerTakeover → bypasses lease AND priority-hold.
```

**Actors & authority:**
- **Holder** = first accessor (any writer). Grants requests; cancels forces; edits.
- **View-only user** = anyone else with write access who opened after the holder. May Request Access; may arm a force **only** after the 30-min inactivity gate.
- **Admin** = may override priority-hold + force immediately via the existing `ownerTakeover` path.
- **Ownership** (`createdBy`/salesman) is **orthogonal** — it grants no edit-lock privilege by itself (an owner who isn't the first accessor is view-only like anyone else, unless they're admin).

---

## 4. Server enforcement — rules per phase (`firestore.rules`, companies-path block @352)

All helpers use `map.get(key, default)` + `request.time.toMillis()` (established safe-access pattern). **Every rule is strictly backward-compatible:** with no lease fields, `editingLeaseValid` is false ⇒ no lock ⇒ behavior identical to today.

### P1 — core lock

```
function editingLeaseValid(p) {
  return p.get('editingBy', null) != null
      && p.get('editingExpiresAt', 0) > request.time.toMillis();   // tab-alive (heartbeat-renewed)
}
function hasLeaseTakeover(p) {   // admin override, reuse ownerTakeover
  let t = p.get('ownerTakeoverActive', null);
  return t != null
      && t.get('byUid', '') == request.auth.uid
      && t.get('expiresAt', 0) > request.time.toMillis();
}
function isEditingLeaseLocked(p) {
  let heldByOther = editingLeaseValid(p) && p.get('editingBy', null) != request.auth.uid;
  return heldByOther && !hasLeaseTakeover(p);
}
// claim (free/stale) / heartbeat / release / GRANT (holder hands off). Requires you may hold.
function isOnlyLeaseUpdate() {
  let allowed = ['editingBy','editingByName','editingTabId','editingClaimedAt','editingExpiresAt',
                 'editingLastActivityAt','editingAccessRequest','editingForcePending','updatedAt','updatedBy'];
  let onlyLease = request.resource.data.diff(resource.data).affectedKeys().hasOnly(allowed);
  let cur = resource.data;
  let mayHold = !editingLeaseValid(cur)                          // free / crashed-stale
             || cur.get('editingBy', null) == request.auth.uid   // I'm the holder (heartbeat/release/grant)
             || hasLeaseTakeover(cur)                            // admin override
             || canForceExecute(cur);                            // P3 grace expired (see below)
  return onlyLease && mayHold;
}
```

Update rule (@370) — add the lease term to the existing chain:
```
allow update: if canWrite()
  && !isOwnerPriorityLocked(resource.data)
  && (!isWonOrLostLocked(resource.data) || isOnlyUnlockRequestUpdate() || isOnlyEcoIndexUpdate())
  && (!isInReviewLocked(resource.data) || isOnlyReviewStateUpdate())
  && (!isEditingLeaseLocked(resource.data)
        || isOnlyLeaseUpdate()
        || isOnlyAccessRequestUpdate()   // P2
        || isOnlyForceArmUpdate()        // P3
        || isOnlyReviewStateUpdate()     // state-machine flips survive the lease
        || isOnlyUnlockRequestUpdate()
        || isOnlyEcoIndexUpdate());
```
**Correctness:** a real content save (full-doc `.set()` @9158/9405) changes `panels`/`bom` ⇒ not `hasOnly(lease fields)` ⇒ for a non-holder none of the carve-outs match ⇒ **REJECTED** (the B012 fix). Holder passes (`editingBy==self`). Stale ex-holder rejected once another claims (no clobber). *(P1 stubs `canForceExecute`→false, `isOnlyAccessRequestUpdate`/`isOnlyForceArmUpdate`→false; they light up in P2/P3.)*

### P2 — Request Access (a view-only, lease-locked user writes ONLY their own request)

```
function isOnlyAccessRequestUpdate() {
  let onlyReq = request.resource.data.diff(resource.data).affectedKeys()
                  .hasOnly(['editingAccessRequest','updatedAt','updatedBy']);
  let req = request.resource.data.get('editingAccessRequest', null);
  let selfOrClear = req == null || req.get('byUid','') == request.auth.uid;   // can't forge a request as someone else
  return onlyReq && selfOrClear;
}
```
**Grant** = the holder writes `editingBy=requester` + clears `editingAccessRequest` → both keys are in `isOnlyLeaseUpdate`'s allowlist and `mayHold` is true (current holder==me) ⇒ permitted.

### P3 — Force-takeover (arm + execute), gated by 30-min inactivity + priority-hold

```
function priorityHold(p) { return p.get('ownerLockActive', false) == true; }
function holderInactive30(p) {
  return request.time.toMillis() - p.get('editingLastActivityAt', 0) > 1800000;   // 30 min
}
// ARM: a requester writes editingForcePending (only) when eligible.
function isOnlyForceArmUpdate() {
  let onlyFp = request.resource.data.diff(resource.data).affectedKeys()
                 .hasOnly(['editingForcePending','updatedAt','updatedBy']);
  let cur = resource.data;
  let fp  = request.resource.data.get('editingForcePending', null);
  let mineOrClear = fp == null || fp.get('byUid','') == request.auth.uid;
  let hasPendingReq = cur.get('editingAccessRequest', null) != null
                   && cur.get('editingAccessRequest', {}).get('byUid','') == request.auth.uid;
  let eligible = holderInactive30(cur) && !priorityHold(cur) && hasPendingReq;
  return onlyFp && mineOrClear && (fp == null || eligible);   // arming needs eligibility; clearing is always ok
}
// EXECUTE: the requester claims after the grace window with no cancel.
function canForceExecute(p) {
  let fp = p.get('editingForcePending', null);
  return fp != null
      && fp.get('byUid','') == request.auth.uid
      && fp.get('graceExpiresAt', 0) < request.time.toMillis()   // grace elapsed
      && holderInactive30(p) && !priorityHold(p);
}
```
`canForceExecute` feeds `isOnlyLeaseUpdate.mayHold`, so the requester's claim-after-grace passes. **Holder CANCEL** = holder stamps `editingLastActivityAt=now` + clears `editingForcePending` → holder is current holder ⇒ `isOnlyLeaseUpdate` permits; and it resets the 30-min gate (proves presence). Cancel vs execute is serialized by `runTransaction` (last-writer-wins; if cancel lands first, the execute tx sees no `forcePending` and aborts).

### P4 — Priority-hold + admin override
- `priorityHold(p)` (= `ownerLockActive`) already blocks arming (P3) and execution (`canForceExecute`). ✅
- **Admin override must be rules-gated to admins** (not just UI): tighten `hasLeaseTakeover` to also require `isAdminMember()` so a non-admin can't bypass priority-hold by writing an `ownerTakeover` record directly. → an admin arms `ownerTakeover` (existing `handleAdminTakeover` @37432) → `hasLeaseTakeover` true → bypasses both the lease and priority-hold.

---

## 5. Client lifecycle (`app.jsx`) per phase

**P1:**
- **`editingTabId`** = a random id generated once at ProjectView mount (module/ref-scoped per tab).
- **Claim** (transactional, mirrors `_tryAcquireQuotePrintLock` @37821): on mount with write access, if lease free/stale/mine → claim (write editingBy/Name/TabId/ClaimedAt/ExpiresAt). If held by another fresh session → read-only. **Fail-open on Firestore error** (like quotePrintLock @37844).
- **Heartbeat** (mirrors presence @36912): every ~30s while the tab is open, `ref.update({editingExpiresAt: now+STALE_MS, updatedBy, updatedAt})`. STALE_MS ≈ 90s. **Runs regardless of user idleness** (that's the point).
- **Release** on unmount / `beforeunload` (mirrors presence cleanup @36930): null the lease fields — **BUT suppressed while a bg task for this project is running** (§7).
- **Activity stamp:** on real content saves (the holder's `saveProjectPanel`/`saveProject`), also write `editingLastActivityAt=now`.
- **`leaseReadOnly`** — ONE added disjunct on the composite `readOnly` (@37349):
  ```
  const _leaseHeldOther = !!project.editingBy && (project.editingExpiresAt||0) > Date.now()
     && !(project.editingBy===_appCtx.uid && project.editingTabId===_myTabId)   // per-session: my other tab still locks me
     && !(project.ownerTakeoverActive?.byUid===_appCtx.uid && project.ownerTakeoverActive?.expiresAt>Date.now());
  const readOnly = isReadOnly()||lockReadOnly||sentReadOnly||reviewReadOnly||customerReviewReadOnly||_baseScopeReadOnly||_ecoScopeReadOnly||_leaseHeldOther;
  ```
- **Three-state open-time modal (ruling #8 refinement, Jon 2026-07-09 — lands in P1).** On project open, after the claim transaction resolves, branch on the `(editingBy, editingTabId)` pair — which gives all three states directly:
  - **(i) `editingBy` is a DIFFERENT uid (fresh lease)** → view-only modal: **"🔒 `<HolderName>` is already editing this project in another location."** (→ read-only; Request Access affordance in P2.)
  - **(ii) `editingBy === my uid` but `editingTabId !== mine` (fresh)** → modal: **"You already have this project open in another tab — close this one and return to it."** (→ read-only; the 2nd tab must not edit.) **Browser limit:** we cannot programmatically focus/switch to the other tab — the copy just instructs the user to close this one.
  - **(iii) lease free/stale, OR held by this exact tab** → editable (this tab claimed or holds).
  - *Optional polish (mention, NOT required for P1):* a `BroadcastChannel` within the same browser gives **instant** same-browser two-tab detection (no wait for the Firestore snapshot) + a "jump to that tab" nudge between tabs. Cross-**browser**/device duplicates still resolve via the Firestore lease + state (ii). Defer unless Jon wants the instant same-browser UX in P1.
  **Note on per-session enforcement:** the RULES are per-**uid** (rules only see `request.auth.uid`, not a tab). So state (ii) — the same user's 2nd tab — is made read-only **client-side** (both tabs share the uid, so rules would allow either; the `editingTabId` compare is what stops the 2nd tab). Acceptable: the same user is not an adversary, so client enforcement closes the self-clobber residual; the **cross-user** guarantee (state (i), the actual B012 case) is server-enforced.
- **Save guards (3):** `saveProject` (@9156, in-memory build) → add a lease-field preserve step next to the takeover guard (@9055); `saveProjectPanel` (@9373, fresh-read build) → already preserves ✅ (add an assertion comment); new/copy/restore scrub (@10232) → null the fields.
- **Reactivity:** lease/request/force fields ride the existing project-doc `onSnapshot` soft-apply (@37226). No new listener. *(Optimization: skip the heavy `setProject` when only lease fields changed, to avoid a 30s re-render tick per viewer — non-blocking.)*

**P2:** "Request Access" button on the read-only banner → writes `editingAccessRequest`. Holder sees "🙋 `<name>` is requesting access — [Grant]" → Grant hands off (transactional lease write to the requester + clear request). Requester's client sees `editingBy===me` on the next snapshot → drops read-only.

**P3:** Holder's client watches `editingForcePending`; on arm, show a **warning modal + live countdown** with **Cancel** (Cancel = stamp activity + clear forcePending). Requester's client, after arming, runs a grace-timer; on expiry with no cancel, runs the force-execute transaction (`canForceExecute`). The 30-min inactivity gate is computed client-side from `editingLastActivityAt` to enable/disable the "Force Access" affordance; the rules re-verify it (never trust the client).

**P4:** Wire the "Hold priority while I'm away" toggle to `ownerLockActive` (existing owner control) with copy clarifying it now blocks takeovers. Admin "Take Over" reuses the `handleAdminTakeover` modal + `ownerTakeovers` audit; rules-gate to admin (§4-P4).

---

## 6. Write-path enumeration — behavior under the lock (the floor; Coach + verifier agent, cross-checked)

**A. Content writers → LEASE-BLOCKED for non-holders (the fix):** `saveProject` `.set` @9158; `saveProjectPanel` `.set` @9405 (+ all bg completions route through these — extraction ~25868, pricing ~25911/27822, BC `onBomUpdate` safeSave @39375, snapshot restore @9208); `deleteEcoDoc` `tx.update` @16301 (rewrites `panels`).

**B. Lease-management writes → the new carve-outs:** claim/heartbeat/release/grant (`isOnlyLeaseUpdate`), request (`isOnlyAccessRequestUpdate`), force-arm/execute (`isOnlyForceArmUpdate`/`canForceExecute`). Activity stamp piggybacks on A (holder's own save; holder isn't blocked).

**C. State-machine flips → existing carve-outs (survive the lock):** pre-review @34529/34544/34563/34669, `onPreReviewInvalidated` @35453/35458, `onReviewerEdit` @35474 (`isOnlyReviewStateUpdate`); ECO index `createEcoDoc` @16249 / unlock @16468 (`isOnlyEcoIndexUpdate`). **Customer-review @30265/34154/34869** write `customerReview*` keys not in any allowlist → **holder-only** under the lock (Jon dropped the non-holder carve-out, ruling #7) — consistent, no new carve-out needed.

**D. New-doc / rare-admin writes → unaffected or deliberate:** restore @10303/10334/10391/10481 + `startCopy` @44491 write a **fresh** doc (no lease) → unaffected; `doTransfer` @44758 + `handleStartFresh` @43823 are owner/admin rare ops → lease-blocked for a non-holder (actor takes over if needed); `deleteProject` @9543 → `allow delete` left open (not in scope).

**E. Server-side (Admin SDK, bypasses lease):** `functions/engineering/index.js:141` (`onCustomerReviewSubmitted`) writes two customer-review timestamps to the **users/** path — bypasses the lease, non-content, benign. No change.

**F. `_logQvHistory` arrayUnion @9224 (holder-only in practice):** if a non-holder somehow fires it, blocked → non-fatal console warn. Leave blocked (a non-holder shouldn't generate qv-history). Confirm at build.

---

## 7. Edge cases

1. **Crash / hard-exit.** Heartbeat stops → `editingExpiresAt` ages out in ≤90s → lease reclaimable. This is exit-detection, **not** an idle release (a present-but-idle tab keeps beating). No 30-min wait for a *crashed* holder (their lease is stale, so `editingLeaseValid` is false → anyone can claim immediately).
2. **Async Project Ownership Rule (load-bearing).** Bg tasks (`_bgTasks` keyed by projectId @475) write back client-side under the launcher's uid. **Release-on-unmount is suppressed while a running bg task for this project exists**, and a module-scoped heartbeat keeps the lease alive until the task ends — else a completing extraction is rules-rejected after another user claims. Lease lifetime = "editing OR has a running bg task for this project."
3. **Offline / reconnect replay.** A queued content save that replays after the lease was lost is **rules-rejected** (no clobber), surfaced by `safeSave`'s fail banner @9175; `onSnapshot` on reconnect drops the client to read-only. Note: the **heartbeat also fails offline** → if offline > STALE_MS the lease expires and another may claim; on reconnect the ex-holder sees they lost it and goes read-only. Correct (an offline tab is indistinguishable from a crashed one).
4. **Force vs cancel race.** Both go through `runTransaction`; last writer wins. Cancel-first → execute tx sees no `forcePending` → aborts. Execute-first → cancel tx sees `editingBy` already changed → holder is now view-only.
5. **Grant vs force race.** Holder grants to requester A while requester B arms a force: transactional; if grant lands, `editingBy=A`, B's force-execute sees a different holder + fresh activity → aborts.
6. **Priority-hold + crash.** If a holder sets `ownerLockActive` (priority-hold) then crashes, the lease still expires in 90s (crash detection is independent of priority-hold — priority-hold blocks *takeovers*, not *expiry*). ✅ No deadlock. **Confirm this is desired** (a crashed holder with priority-hold set: the lock frees on staleness; priority-hold only blocks the *force* path, which requires a live-but-inactive holder). Flagging as a sub-point for Jon.
7. **Two tabs, same user.** 2nd tab reads lease held by (myUid, otherTabId) fresh → client `_leaseHeldOther` true (tabId differs) → 2nd tab read-only. Does NOT steal from tab 1. Server would allow (same uid) — client enforces.

---

## 8. Phased build plan (for Marc)

Each phase is independently shippable + testable. **P1 alone closes B012** (the hard cross-user guarantee); P2–P4 are progressive recovery/UX.

- **P1 — Core lock + read-only + open-time modal (the data-safety fix).** Lease fields; `editingTabId`; claim/heartbeat(tab-open)/release; rules `editingLeaseValid`/`isEditingLeaseLocked`/`isOnlyLeaseUpdate` (with P2/P3 helpers stubbed) added to `allow update`; `leaseReadOnly` disjunct + read-only banner; **three-state open-time modal (i) different-uid / (ii) same-uid-other-tab / (iii) editable**; 3 save guards; new/copy/restore scrub; Async-Ownership hold-while-bg-task; per-session client tab compare. **Ships the guarantee.** MEDIUM.
- **P2 — Request → Grant hand-off.** `editingAccessRequest` + `isOnlyAccessRequestUpdate`; "Request Access" (view-only) + "Grant" (holder) UI + transactional hand-off. MEDIUM.
- **P3 — Force-takeover + warning/grace.** `editingLastActivityAt` (stamp on saves) + `editingForcePending`; `isOnlyForceArmUpdate` + `canForceExecute` + `holderInactive30`; holder warning modal w/ countdown + Cancel; requester grace-timer + execute tx. MEDIUM-HIGH (state machine + rules).
- **P4 — Priority-hold + admin override.** Wire `ownerLockActive` copy = "hold priority / block takeovers"; admin-gate `hasLeaseTakeover` (rules) + `handleAdminTakeover` reuse; retire the now-superseded automatic 90s-presence Owner-Priority read-path (fast-follow — see §9). MEDIUM.

---

## 9. Reconciliation — one system, not two (Brief invariant #5)

- **Lease supersedes the automatic 90s-presence half of Owner Priority Mode** (client-only, allows edits — exactly what B012 proved insufficient). Retire that read-path in **P4** (or a fast-follow), leaving it inert earlier so the P1 diff stays tight.
- **`ownerLockActive` is repurposed** from "owner-priority checkbox" to "**hold priority / block takeovers**" — same field, clearer meaning; drives the P3 force block.
- **`ownerTakeover` becomes the admin override** (rules-gated to admins in P4) — one takeover concept.
- **Presence stays** for the viewer chime + who's-here UI, but is **no longer load-bearing for enforcement.**

---

## 10. Rollout & verification (per phase)

**⚠ Rules deploy is PROJECT-WIDE** (`firebase deploy --only firestore:rules`), not host-scoped — it hits prod immediately. Every rule is backward-compatible by construction (no lease fields ⇒ no lock), and each phase's client + rules ship **together**, test-channel first. Each phase's live matrix uses the `docs/PHASE-B-MATRIX-SCRIPT.md` harness retargeted:

- **P1:** L1 different-uid 2nd user → view-only + modal (i) "🔒 `<Holder>` is already editing…" while 1st holds · L2 clean exit → 2nd claims immediately · L3 crash (kill tab) → 2nd claims in ≤90s · **L5 Async-Ownership: 1st launches extraction, navigates away → writeback lands (lease held through the task), NOT rejected** ← load-bearing · L6 reviewer approve survives the lock · L7 offline stale-writer rejected, no clobber · **L8 SAME user 2nd tab → modal (ii) "already open in another tab — close this one", read-only** · L8b state (iii): reopening in the SAME tab (or after release) → editable.
- **P2:** request → holder grants → hand-off; request auto-clears on grant.
- **P3:** holder idle 30 min + request → force armed → warning+countdown → (a) cancel retains + resets inactivity; (b) no cancel → transfer at grace expiry. Verify a **present** holder (active <30 min) canNOT be forced.
- **P4:** priority-hold blocks the force path; admin override takes over through priority-hold; non-admin canNOT override (rules).

Coach re-reviews **each phase's** rules + client diff before its prod deploy; Jon sign-off per phase.

---

## 11. Phase B disposition (unchanged)

KEEP branch `claude/phase-b-bom-merge` + PR #5 — not merged/deployed. With per-session tab keying (ruling #8) the self-clobber residual is closed **without** the merge, so Phase B is pure defense-in-depth held in reserve.

---

## Appendix — key line references

- Rules: project update chain `firestore.rules:370`; `isOwnerPriorityLocked` :202; carve-outs :241/262/277; `isAdminMember` :191; users-path :13; companies-projects block :352.
- Client: `saveProject` :8940 (set :9158, takeover guard :9055); `saveProjectPanel` :9266 (fresh read :9279, set :9405); `quotePrintLock` acquire :37821 / release :37847; presence effect :36896 (heartbeat :36912, cleanup :36930); Owner-Priority compute :36943; composite `readOnly` :37349; project onSnapshot soft-apply :37226; new/copy/restore scrub :10228-10232; `handleAdminTakeover` :37432; `_bgKey`/`bgStart` :475/477.
- Server: `functions/engineering/index.js:141` (only server project-doc write; users-path, Admin SDK, benign).

# B012 Fix — Hard One-Editor Lock (Editing Lease) — Coach Detailed Plan

**To:** Freddy (route to Jon for the 5 rulings) → Marc (build)
**Author:** Sam Wize (Coach), 2026-07-09
**Feeds:** `docs/B012-HARD-LOCK-BRIEF.md` (Freddy). H-item pipeline: this plan → Jon approve → Marc build → Coach review → Jon sign-off.
**Verdict:** **FEASIBLE — MEDIUM.** Server-enforceable exactly as the Brief hoped; the lease folds cleanly into the existing rules lock-stack and the existing client `readOnly` stack. The real work is (a) the lease lifecycle client-side, (b) three save-path preservation guards, and (c) the Async-Ownership hold-while-bg-task rule. No architectural blockers.

---

## 0. TL;DR for Jon

- A hard one-editor lock is achievable as a **server-enforced editing lease** on the project doc — Firestore rules CAN read a doc field (they cannot read `projectPresence`), so "one editor at a time" becomes a **technical guarantee**, not a policy.
- It **reuses two mechanisms that already exist**: the `quotePrintLock` transactional-claim pattern (for claim/heartbeat/release) and the composite `readOnly` flag at `app.jsx:37349` (for the UI). That keeps the change small and low-risk.
- It **supersedes** the automatic half of Owner Priority Mode (the client-only 90s presence lock that B012 proved insufficient). We keep the manual `ownerLockActive` control + the `ownerTakeover` audit trail and fold them in — **one lock system, not two**.
- **5 rulings** need Jon (§8). My feasibility pass makes 2 of them concrete recommendations already: **granularity = per-project** (the only cleanly server-enforceable option), and **read-only scope = reuse existing `readOnly` semantics**.

---

## 1. Why the current stack does not hard-block concurrent edits (grounded)

Traced the full lock machinery:

| Mechanism | Where | What it does | Why it didn't stop B012 |
|---|---|---|---|
| **Owner Priority Mode** | client compute `app.jsx:36943-36953`; per-button `ownerPriorityActive` gating | Blocks 13 destructive bulk actions when the owner is present (90s presence heartbeat) or `ownerLockActive` is set | **Client-only**, and by spec **allows view + row/field edits** — a 2nd user can still type into and save BOM rows. |
| **`isOwnerPriorityLocked`** | `firestore.rules:202`, in the project `allow update` @370 | The ONLY server write-lock: rejects non-owner writes | Fires **only when the owner manually sets `ownerLockActive=true`**. The 90s presence lock is unreadable by rules (comment @200). Default state = unlocked. |
| **`quotePrintLock`** | `app.jsx:37821` acquire / `37847` release | 30s transactional print lock | Client-only; scoped to printing; not an edit lock. **This is the pattern we generalize.** |
| **Presence** | `app.jsx:36896-36938`, `companies/{cid}/projectPresence/{projectId}_{uid}` | 30s heartbeat, 90s stale window, feeds Owner Priority Mode | A **separate collection**, unreadable by project-doc rules — the root reason the presence lock can't be server-enforced. |
| **Won/Lost lock, Pre/Post-Review lock** | `firestore.rules:223/252`, carve-outs @241/262 | Orthogonal state locks (post-PO / review-pending) with narrow field carve-outs | Not concurrency locks; they compose with the lease (§4). |

**Conclusion:** the only server-enforced lock (`isOwnerPriorityLocked`) requires a manual owner toggle and B012 occurred with it off. Everything automatic is client-only. The lease makes the automatic case server-enforced.

---

## 2. Scope: exactly one rules block matters

- `users/{uid}/{document=**}` (`firestore.rules:13`) is `allow read, write: if request.auth.uid == uid` — **inherently single-writer**. Concurrent multi-user editing is impossible there.
- Multi-user editing only happens on **`companies/{cid}/projects/{projectId}`** (rules block `firestore.rules:352`), where every company member (`canWrite()`) shares write access. **B012 occurred here** (Jon + Andrew, same company).
- **⇒ The rules change is confined to the `companies/.../projects` update rule (@370).** The client `_appCtx.projectsPath` resolves to `companies/{cid}/projects` for company users, so the lease is written to the doc the rule governs. No change needed to the users-path block.

---

## 3. Lease data model (on the project doc — mirrors `quotePrintLock`)

```
editingBy:        string|null   // uid of the current holder
editingByName:    string|null   // display name for the "X is editing" banner
editingClaimedAt: number|null   // ms, first claim of this hold
editingExpiresAt: number|null   // ms; lease is VALID iff editingBy!=null && editingExpiresAt>now
```

- Additive fields, nulled when free (data-retention safe — no removal/rename of anything).
- Nulled on new-project / copy / restore alongside the existing `quotePrintLock=null` scrub (`app.jsx:10232` region) — **add these 4 fields there** so a copied/restored doc never inherits a stale lease.
- **Force-takeover reuses the existing `ownerTakeoverActive` record** (`{byUid, byName, expiresAt, ...}`, written by `handleAdminTakeover` @37432) rather than inventing a parallel takeover — one takeover concept for the whole project (§4, §8-Q5).

---

## 4. Server enforcement — exact rules changes (`firestore.rules`, companies-path block)

Add three helpers and one carve-out, then extend the `allow update` chain. All use `map.get(key, default)` (the established safe-access pattern, per the `isOwnerPriorityLocked` comment @203) and `request.time.toMillis()`.

```
// DECISION(v1.23.x, B012): Server-enforced one-editor lease. A VALID lease held by
// another user makes the project doc read-only for everyone else at the RULE layer —
// the guarantee the client-only presence/quotePrintLock could not provide.
function editingLeaseValid(project) {
  return project.get('editingBy', null) != null
      && project.get('editingExpiresAt', 0) > request.time.toMillis();
}
function hasLeaseTakeover(project) {   // reuse the ownerTakeover record
  let t = project.get('ownerTakeoverActive', null);
  return t != null
      && t.get('byUid', '') == request.auth.uid
      && t.get('expiresAt', 0) > request.time.toMillis();
}
function isEditingLeaseLocked(project) {
  let heldByOther = editingLeaseValid(project)
      && project.get('editingBy', null) != request.auth.uid;
  return heldByOther && !hasLeaseTakeover(project);
}
// A write touching ONLY the lease fields (claim / heartbeat / release). Permitted only
// when the current lease is free/expired, OR already mine, OR I hold a takeover — so a
// LIVE lease can never be stolen through this carve-out.
function isOnlyLeaseUpdate() {
  let allowed = ['editingBy','editingByName','editingClaimedAt','editingExpiresAt','updatedAt','updatedBy'];
  let onlyLease = request.resource.data.diff(resource.data).affectedKeys().hasOnly(allowed);
  let cur = resource.data;
  let canClaim = !editingLeaseValid(cur)
              || cur.get('editingBy', null) == request.auth.uid
              || hasLeaseTakeover(cur);
  return onlyLease && canClaim;
}
```

Extend the project `allow update` (@370):

```
allow update: if canWrite()
  && !isOwnerPriorityLocked(resource.data)
  && (!isWonOrLostLocked(resource.data) || isOnlyUnlockRequestUpdate() || isOnlyEcoIndexUpdate())
  && (!isInReviewLocked(resource.data) || isOnlyReviewStateUpdate())
  && (!isEditingLeaseLocked(resource.data)
        || isOnlyLeaseUpdate()          // claim / heartbeat / release
        || isOnlyReviewStateUpdate()    // reviewer approve/reject must not be lease-blocked
        || isOnlyUnlockRequestUpdate()  // request-unlock stamps
        || isOnlyEcoIndexUpdate());     // ECO index transitions
```

**Why this is correct (the load-bearing argument):**
- A real content save (the two full-doc `.set()` at `app.jsx:9158`/`9405`) changes `panels`/`bom`, so its `diff().affectedKeys()` is NOT hasOnly(lease fields) → `isOnlyLeaseUpdate` is false → for a non-holder, `isEditingLeaseLocked` is true and none of the carve-outs match → **write REJECTED**. This is the B012 fix.
- The **holder's** save: `isEditingLeaseLocked(resource.data)` reads the current server doc where `editingBy==holder==auth.uid` → `heldByOther` false → not locked → **write allowed**. Correct.
- A **stale ex-holder** whose lease another user has since claimed: server doc now has `editingBy=other` (valid) → `heldByOther` true → their save is **rejected** (no silent clobber). Correct — this is precisely the concurrent-clobber that B012 is.
- **State-machine transitions survive**: review approve/reject, request-unlock, ECO-index flips match their `isOnly…` carve-outs (field-level, allow-listed keys, no `panels`) → not lease-blocked, so the workflow can't deadlock behind a lease.
- **Claiming a free lease**: `isOnlyLeaseUpdate` + `canClaim` (current lease free/expired) → allowed even for a brand-new holder. The client also gates this transactionally (§5); the rule is the backstop that prevents stealing a *live* lease.

---

## 5. Client lifecycle (`app.jsx`) — claim / heartbeat / release / takeover

Mirror the `quotePrintLock` + presence patterns; add ~4 small pieces.

**5.1 Claim (transactional, mirrors `_tryAcquireQuotePrintLock` @37821).** On entering the edit context (ProjectView mount with write access — i.e. `!isReadOnly()`), run a `runTransaction`: read the doc; if a valid lease is held by another and I have no takeover → return `{ok:false, by, expiresAt}` (client goes read-only + shows the banner). Else `tx.update` the 4 lease fields with `editingExpiresAt = now + LEASE_TTL_MS`. **Fail-open on a Firestore blip** (same as quotePrintLock @37844) — a transient error must not soft-brick editing.

**5.2 Heartbeat (mirrors presence @36912).** While the holder is in the edit context, `ref.update({editingExpiresAt: now+TTL, updatedBy:uid, updatedAt:now})` every ~30s (interval < TTL). Field-level update, matches `isOnlyLeaseUpdate` (holder).

**5.3 Release.** On unmount / `beforeunload` (mirrors presence cleanup @36930/36936): `ref.update({editingBy:null, editingByName:null, editingClaimedAt:null, editingExpiresAt:null, updatedBy:uid, updatedAt:now})` — **BUT suppressed while a background task for this project is running** (§7 Async-Ownership).

**5.4 Reactivity is free.** Lease fields ride the existing project-doc `onSnapshot` soft-apply (`app.jsx:37226-37244`): another user's claim/release arrives (their `updatedBy≠me`) → `setProject(migrated)` → recompute (5.5). No new listener. (Minor optimization: skip the heavy `setProject` when only lease fields changed, to avoid a 30s re-render tick on every viewer — non-blocking.)

**5.5 UI read-only — one line.** The composite `readOnly` at `app.jsx:37349` already gates every input/affordance in ProjectView:
```
const leaseReadOnly = !!project.editingBy
   && project.editingBy !== _appCtx.uid
   && (project.editingExpiresAt||0) > Date.now()
   && !(project.ownerTakeoverActive?.byUid===_appCtx.uid && project.ownerTakeoverActive?.expiresAt>Date.now());
const readOnly = isReadOnly()||lockReadOnly||sentReadOnly||reviewReadOnly||customerReviewReadOnly||_baseScopeReadOnly||_ecoScopeReadOnly||leaseReadOnly;
```
Add a banner "🔒 `<editingByName>` is editing — read-only" with **Request Access** and (owner/admin) **Take Over** affordances (reuse the `handleAdminTakeover` @37432 modal + `ownerTakeovers` audit).

**5.6 Save-path preservation (CRITICAL — 3 guards).** A full-doc `.set()` must never regress the lease:
- **`saveProject` @9156** builds `data` from the **in-memory** project → add a preserve step in the consolidated server-read block (@9039-9068, next to the takeover guard): copy `editingBy/editingByName/editingClaimedAt/editingExpiresAt` from `_curDoc.data()` onto `data` unless this write is itself a lease op. Without this, a save carrying stale/absent lease fields clobbers the live lease.
- **`saveProjectPanel` @9373** builds `liveProject` from the **fresh server read** (`proj` @9279) → it **already** carries the server lease fields. ✅ No change needed, but add a one-line assertion/comment so a future refactor doesn't break it.
- **New/copy/restore scrub** (@10232 region): null the 4 lease fields (§3).

---

## 6. Write-path enumeration — how every project-doc writer behaves under the lease (the floor)

Independent enumeration (Coach + verifier agent, cross-checked). Grouped by lease behavior:

**A. Content writers — LEASE-BLOCKED for non-holders (this IS the fix):**
- `saveProject` full-doc `.set` **@9158**; `saveProjectPanel` full-doc `.set` **@9405** (the B012 vectors). All background/async completions (extraction save ~25868, post-extract pricing ~25911/27822, BC lead-time `onBomUpdate` safeSave @39375, snapshot restore @9208) route through these — covered transitively.
- `deleteEcoDoc` `tx.update` **@16301** (rewrites `panels`) — content write; correctly blocked for a non-holder (the ECO editor holds the lease; matches today's `ecoEditUnlocked` gating).

**B. State-machine field-flips — CARVED OUT (must not deadlock):**
- Pre-review: **@34529/34544/34563/34669**, `onPreReviewInvalidated` **@35453/35458**, `onReviewerEdit` **@35474** → `isOnlyReviewStateUpdate`.
- Customer-review: **@30265/34154/34869** → these touch `customerReview*` only; **add those keys to a carve-out** (they are NOT in `isOnlyReviewStateUpdate`'s list today — see §6-note).
- ECO index: `createEcoDoc` **@16249**, ECO unlock **@16468** → `isOnlyEcoIndexUpdate`.
- `_logQvHistory` arrayUnion **@9224** (send/print audit) → fire-and-forget; if blocked for a non-holder it's a non-fatal console warn. Acceptable, or add `qvHistory` to a carve-out. **Recommend: leave blocked** (a non-holder shouldn't be generating qv-history) — confirm at build.

**C. New-doc / admin-rare writes — UNAFFECTED or DELIBERATE:**
- `executeRestore` **@10303/10334/10391/10481**, `startCopy` **@44491** → write a **freshly created** doc that has no lease → unaffected.
- `doTransfer` **@44758** (ownership transfer, writes `createdBy`), `handleStartFresh` **@43823** → owner/admin rare ops. **Ruling needed:** lease-block (require takeover) or carve out. Recommend lease-block (rare; the actor can take over).
- `deleteProject` **@9543** → `allow delete` is separate and left open (Brief does not ask to gate delete).

**D. Server-side (Admin SDK, bypasses the lease entirely):**
- `functions/engineering/index.js:141` `onCustomerReviewSubmitted` → writes `customerReviewSubmittedAt/By` to the **`users/` path** (hardcoded @140), not the company doc, and via Admin SDK. Bypasses the lease; writes only two non-content timestamps → **benign, no data-loss surface.** No change.

**§6-note (must-fix at build):** the customer-review `.update()` sites (@30265/34154/34869) write `customerReview*` fields that are **not** in any existing `isOnly…` allowlist. Under the lease they'd be blocked for a non-holder. Since a customer-review send/retract is a legitimate non-content transition, either (a) add a small `isOnlyCustomerReviewStateUpdate()` carve-out, or (b) accept that only the holder sends/retracts customer review. **Recommend (b)** unless Jon wants reviewers to act without the lease — it's simpler and customer-review send is edit-adjacent. Flagging explicitly because it's the one enumeration item that changes behavior beyond the intended block.

---

## 7. Edge cases

1. **Session death / crash.** Heartbeat stops → `editingExpiresAt` ages out → after TTL the lease is free → next user claims. No manual intervention, no permanent deadlock. (This is why TTL exists; §8-Q1.)
2. **Async Project Ownership Rule (Brief invariant #4) — the important one.** Background tasks (`_bgTasks`, keyed by `projectId` @475/480; extraction/pricing/BC-sync) write back **client-side under the launcher's uid** via `saveProjectPanel`. If the launcher navigated away and released the lease, and another user claimed it, the completing write would be **rules-rejected** and the extraction result lost. **Fix: release-on-unmount is suppressed while `Object.values(_bgTasks).some(t=>t.projectId===projectId && t.status==='running')`, and a module-scoped heartbeat keeps the lease alive until the task ends.** This ties lease lifetime to "user is editing **OR** has a running bg task for this project" — the correct Async-Ownership-respecting definition, and it dovetails with the existing `activeExtractions` heartbeat model (C136).
3. **Offline / reconnect replay.** The Firestore SDK queues writes offline and replays on reconnect. A replayed content save that lands after the lease expired + was reclaimed is **rules-rejected** (good — no clobber), surfaced by `safeSave`'s existing fail banner (@9175). On reconnect, `onSnapshot` delivers the current lease → client recomputes `leaseReadOnly` and drops to read-only if the lease was lost. No stale-write clobber survives.
4. **Takeover races.** Claim + takeover both go through `runTransaction` (serialized by Firestore); last writer wins deterministically. Reusing the single `ownerTakeoverActive` record avoids a second racing takeover field.
5. **Same-user, two tabs.** Per-uid lease → both tabs see `editingBy==me` → both editable → they can still clobber each other (the residual). Per-tab lease (add `editingTabId`, compare in `leaseReadOnly` + `isOnlyLeaseUpdate`) → true single-editor but blocks the user's own 2nd tab. **Jon ruling #2 (§8).** If per-uid is chosen, retained **Phase B is the backstop** for this residual.
6. **Lease vs quotePrintLock / Won-Lost / Review locks.** Orthogonal; they stack. Note the print interaction: printing assigns a quote number → a project-doc save → for a non-holder that's lease-blocked. Ties to §8-Q4 (does read-only allow Print-Only? cf. F005). Flagging, not deciding.

---

## 8. Rulings for Jon (my feasibility pass makes 2 concrete)

| # | Ruling | Coach recommendation |
|---|---|---|
| **Q1** | Idle TTL before auto-release | **90s** (heartbeat 30s → 3 missed beats = dead). Matches the presence 90s stale window operators already know. |
| **Q2** | Two tabs: per-uid vs per-tab | **Open — needs Jon.** Per-uid is simpler + matches presence keying, residual covered by retained Phase B. Per-tab is a stricter guarantee at the cost of blocking a user's own 2nd tab. Lean **per-uid + Phase B backstop** unless Jon wants the absolute guarantee. |
| **Q3** | Granularity: per-project vs per-panel | **CONCRETE: per-project.** Per-panel is **not cleanly server-enforceable** — saves are full-doc `.set()` writing the whole `panels` array, so rules see "panels changed", not *which* panel; per-panel would require re-architecting saves to field-level panel writes (large, risky). Per-project is the correct scope. |
| **Q4** | Read-only scope | **CONCRETE: reuse existing `readOnly` semantics** — view everything, no persisting edits. Sub-decision: should a read-only non-holder still **Print** (quote-number assign writes the doc, cf. F005)? Recommend the holder prints; if Jon wants non-holder Print-Only, add a print-path carve-out. |
| **Q5** | Takeover authority | **Owner + admin** force-takeover (reuse `ownerTakeovers` audit + 15-min expiry). Any editor gets **Request Access** (writes a request flag the holder sees) — no silent steal. |

Plus **§6-note** (customer-review carve-out (a) vs holder-only (b)) is a small behavioral sub-ruling I can carry with Q4.

---

## 9. Reconciliation — one lock system, not two (Brief invariant #5)

- **Lease supersedes the automatic half of Owner Priority Mode.** The 90s presence auto-lock (client-only, allows edits) is exactly what B012 proved insufficient; the lease replaces it as the concurrent-edit guard. **Retire the presence-driven `ownerPriorityActive` read-path** once the lease ships (leave the code inert in this change; remove in a fast-follow to avoid two systems computing "read-only" — flagged, not done here, to keep the diff tight).
- **Keep + absorb:** the manual `ownerLockActive` owner control and the `ownerTakeover` audit trail — the takeover becomes the lease's force-takeover (§3). `isOwnerPriorityLocked` stays in the rule chain (harmless; only bites when an owner manually locks).
- Presence itself **stays** (it powers the viewer chime + "who's here" UI) — but it's no longer load-bearing for enforcement.

---

## 10. Rollout & verification (H-item pipeline; money/data + rules path)

1. **Build behind the matrix-arc-test channel first** (rules deploy is global — see caveat below).
2. **⚠ Rules caveat:** `firebase deploy --only firestore:rules` is **project-wide**, not host-scoped — deploying the new rule affects prod immediately. So the rule must be **strictly additive/backward-compatible**: with no lease fields present, `editingLeaseValid` is false → `isEditingLeaseLocked` false → **behavior identical to today**. Verified by construction (all `.get(key, default)`). Deploy rules only after the client claim/heartbeat/release + save guards are in the same release, else a deployed rule with no client writers is a no-op (safe) but a client writing leases with old rules gives no enforcement (also safe, just unguarded). **Recommend: ship client + rules together, client-gated by hostname during test.**
3. **Two-session live matrix (Jon + a 2nd real editor)** — reuse the `docs/PHASE-B-MATRIX-SCRIPT.md` harness, retargeted:
   - **L1** 2nd user opens while 1st holds lease → 2nd is read-only, banner names the 1st. ✅
   - **L2** 1st closes/navigates away → after ≤90s 2nd can claim + edit. ✅
   - **L3** 1st crashes (kill tab) → lease auto-expires in ≤90s, 2nd claims. ✅
   - **L4** owner/admin **Take Over** while 2nd holds → owner claims, 2nd drops to read-only. ✅
   - **L5 (Async-Ownership)** 1st launches an extraction, navigates away → extraction completes and **writes back** (lease held through the bg task), NOT rejected. ✅ **← the load-bearing case.**
   - **L6** reviewer approve/reject while a non-reviewer holds the lease → review-state flip **still works** (carve-out). ✅
   - **L7** offline edit by a stale ex-holder → reconnect → write rejected, no clobber, client drops to read-only. ✅
4. **Coach re-reviews the diff (rules + client)** before prod — rules correctness + the 3 save guards + the §6-note carve-out decision.
5. **Jon prod sign-off** → deploy hosting + rules.

---

## 11. Phase B disposition (unchanged from Brief)

KEEP branch `claude/phase-b-bom-merge` + PR #5 — not merged, not deployed. Retained as the backstop for the **same-user-two-tab** (Q2) and any residual **background-write** race if Jon later elects "both." The lease is the primary fix; Phase B is defense-in-depth held in reserve.

---

## Appendix — key line references

- Rules: project update chain `firestore.rules:370`; `isOwnerPriorityLocked` :202; carve-outs :241/262/277; users-path :13; companies-projects block :352.
- Client: `saveProject` :8940 (set :9158, takeover guard :9055); `saveProjectPanel` :9266 (fresh read :9279, set :9405); `quotePrintLock` acquire :37821 / release :37847; presence effect :36896; Owner Priority compute :36943; composite `readOnly` :37349; project onSnapshot soft-apply :37226; new/copy/restore scrub :10228-10232; `handleAdminTakeover` :37432; `_bgKey`/`bgStart` :475/477.
- Server: `functions/engineering/index.js:141` (only server project-doc write; users-path, Admin SDK, benign).

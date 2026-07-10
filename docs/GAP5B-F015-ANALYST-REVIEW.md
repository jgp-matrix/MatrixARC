# gap #5b + F015 — Freddy Analyst Review of Coach's Design/Plan

**Reviews:** `docs/GAP5B-F015-PLAN.md` (Coach, 62f2ab34). **Author:** Freddy Lyst, 2026-07-10.
**Verdict: SOUND — APPROVE the design direction.** 4 build-time review notes (refinements, not design blockers) + concurrence on the 3 Jon rulings.

---

## Verdict

The design is architecturally sound and I recommend approval. The unifying insight — **one BroadcastChannel `arc-lease` liveness primitive** answering both `WHO_HOLDS` (ghost-vs-live for adopt) and `ID_PING` (duplicate-tab detection) — cleanly solves both halves with a single mechanism, which is the right kind of consolidation (one primitive, two consumers).

**Data-safety invariant independently verified:** the cross-user guarantee is the Firestore rule `isEditingLeaseLocked` keyed on `editingBy` vs `request.auth.uid` (per-uid, no tab-id). This pair changes **no rules** and every new mechanism is **same-uid + client-side + advisory** (BroadcastChannel never gates a write's data-safety — the rules do). A DIFFERENT uid is never adopted, never on the channel, always server-rejected. The gap #4 identity-guard on `_releaseEditingLease` is reused unchanged. ⇒ The whole pair is data-safe by construction; it only reorganizes who-among-one-user's-own-tabs holds and how the UI blocks. Confirmed against the B012 whole point (concurrent cross-user edit) — untouched.

Sequencing is correct (#5b's uniqueness+adopt are the safety preconditions; F015's hard-block must not merge without them). Test matrix G1–G10 is comprehensive and includes the load-bearing cross-user (G6/G7/G9) and gap#4 (G10) regression checks.

---

## Build-time review notes (handle in build; NOT design blockers)

**R1 — Duplicate-tab editable window BEFORE regenerate (tighten).** A Chrome "Duplicate Tab" copies sessionStorage → shares `_ARC_TAB_ID`. On mount, the pre-tick guard (37b15953) seeds `leaseReadOnly` from `init.editingBy`: if the original holds the lease, the duplicate sees `editingTabId === _ARC_TAB_ID` (shared id) → reads as "MY tab holds" → `leaseReadOnly=false` → **editable**, until 2a's `ID_PING` collision resolves, regenerates the id, and re-evaluates. That is a brief (sub-second) window where BOTH the original and the duplicate are editable = a same-user self-clobber window (non-data-loss per the invariant, but real). **Ask Marc/Coach to ensure the collision-regenerate synchronously forces a `leaseReadOnly` recompute (flip the duplicate to blocked) and confirm no write can land in that window.** Ideally run `ID_PING` as early as possible in mount, before edit affordances are live.

**R2 — `WHO_HOLDS` probe vs throttled/frozen background tabs.** Chrome freezes backgrounded tabs (Page Lifecycle API, ~5 min) and heavily throttles timers before that; a frozen holder tab won't answer `WHO_HOLDS` within the 250–400 ms timeout → false "ghost" → the reopening tab ADOPTS → silently demotes the live-but-frozen holder. Same-uid/benign (a frozen tab isn't actively editing, and handing edit to the tab the user is actually looking at matches Jon's "edit pushes back to the user"), BUT define the **un-freeze behavior**: when the demoted tab resumes, it must detect it no longer holds (`editingTabId` moved) → go read-only / re-probe → **never blind-write as if still holder**. Confirm the mounted heartbeat/tick already handles a lease it no longer owns gracefully.

**R3 — Simultaneous-adopt race (add test G11).** Two new tabs opening onto the same ghost at once: the adopt `tx.update` must serialize so **exactly one** wins; the loser's transaction re-reads the now-live `editingTabId` and must fall to block (or re-probe → block), not double-adopt. Firestore transactions give the serialization; verify the loser's post-tx path resolves to blocked. Add as G11.

**R4 — Tie-break determinism in 2a.** The collision tie-break ("later mount regenerates," via `since`) needs a deterministic secondary tie-break if two `since` values tie (instant duplicate) — e.g., compare a random nonce — so exactly one tab regenerates, never both/neither.

None of R1–R4 change the design; they're correctness details for the build + two added test cases (G11 simultaneous-adopt; a duplicate-tab no-self-clobber-window assertion under R1).

---

## Concurrence on the 3 Jon rulings

- **Q1 (cross-user close-handoff ≤90s vs sendBeacon endpoint):** AGREE with Coach — **accept the ≤90s cross-user delay; defer sendBeacon.** It's rare (cross-user close-then-reopen within 90s), degrades gracefully via staleness, is not a regression (matches today), and a sendBeacon→HTTP endpoint adds auth/security surface for marginal gain. Revisit only if it becomes a real complaint.
- **Q2 (non-dismissible UX on manual-close):** AGREE — Jon already ruled non-dismissible; this just confirms it holds for the best-effort-`window.close()` case (user manually closes the tab). No softer fallback.
- **Q3 (cross-device same-uid):** AGREE with Coach — **don't silently steal across devices**; the adopt fast-path is same-browser-only (BroadcastChannel can't reach device A), cross-device same-uid falls to the ≤90s staleness path. Silently stealing a lease from an active other-device session would interrupt real work.

---

## Recommendation

Approve the design + R1–R4 as build notes + Coach's rulings (Q1 accept, Q2 confirm non-dismissible, Q3 block+staleness cross-device). Then: Jon rulings/approval → Marc builds (gap #5b: 2a+2b+2c, then F015 2d — may ship one release v1.23.6) → Coach re-reviews the delta → verify (G1–G11) → Jon deploy checkpoint. Per-phase gated.

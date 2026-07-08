# Scoping Brief — Bugs cluster B008 · B011 · B005

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-07 · **Status:** Brief → Coach trace/feasibility → Jon approve → Marc build
**Traced against tip:** `af3e7dfe`. B008 + B005 need a short Coach trace (exact condition); B011 is well-defined (proactive hardening). All small; could batch, but B011 is money-path-adjacent → treat with care.

---

## B008 — RFQ History "Supplier Portal" link opens the pre-submission portal, not the submitted one
**Ask:** In RFQ History → View Received Quotes, the per-quote "Supplier Portal" link should open the **submitted** portal (showing the pricing + lead times the supplier actually entered), not the blank/email pre-submission state.

**Current state (grounded):**
- The "🔗 Supplier Portal" link is at **app.jsx:20354**: `href={`https://matrix-arc.web.app?rfqUpload=${sub.id}`}`.
- Sibling "Portal ↗" links (20303, 43255) use `e.uploadToken` — **a different key than `sub.id`.**
- The portal (49421+) is token-authed ("the token IS the auth — renders without ARC sign-in") and renders state off the token doc.

**Likely root cause (Coach confirms):** the 20354 link keys off `sub.id` (a submission doc id) rather than the rfqUploads `uploadToken` the portal resolves against — so it lands on a portal that doesn't reflect the submitted state; OR the portal renders pre-submission (email/upload) UI regardless of `status==="submitted"`.

**★ Coach must trace:** (1) is `sub.id` the correct key, or should it be the `uploadToken`? (2) how does the portal choose pre-submission vs submitted rendering — does `rfqUploads/{token}.status==="submitted"` drive a submitted-view, and does the link pass the token that carries that status? Fix follows from which of the two it is (correct the key, or add/route to a submitted view).
**Touch-points:** app.jsx:20354 (the link); the portal render entry (~49421); `rfqUploads` doc status.
**Data-retention:** none (link/routing fix). ✓
**Acceptance:** click "Supplier Portal" on a submitted quote in RFQ History → opens the portal showing the supplier's entered pricing + lead times (not the blank pre-submission state).

---

## B011 — Harden the other `supplierQuotes` update sites vs undefined (same class as B010)
**Ask:** B010 fixed the undefined-field Firestore-reject at `saveAndMatch` (@31707, now uses `_nullifyUndefined`). The same risk lurks at the other `supplierQuotes` `lineItems` writes.

**Current state (grounded — line numbers drifted from the tracker's since B010 shipped):**
- `lineItems` writes NOT yet hardened: **31304, 31340, 32004, 32147** (`.update({lineItems:...})` / `{lineItems:updatedItems}` without the null-coercion).
- Already hardened (B010): **31707** (`lineItems:matched.map(_nullifyUndefined)`).
- Non-`lineItems` writes (lower risk, no line-item undefined exposure): 31653 (`pdfUrl,fileName`), 32021 (`bcAttached...`).

**Proposed design:** apply the same undefined→null coercion used at 31707 to the four un-hardened `lineItems` writes (31304/31340/32004/32147).
**⚠ CAVEAT (carried from the B010 Coach review):** `_nullifyUndefined` rebuilds any NON-plain object (Date/Map/class instance) as a plain object → would CORRUPT it. **Before applying at each site, confirm the payload is plain line-item data** (no Date/typed instances); if a site's payload may carry typed values, use a shallow/typed strip instead of the recursive helper.
**★ Coach/Marc must verify:** the payload shape at each of the 4 sites is plain (safe for `_nullifyUndefined`), per the caveat.
**Touch-points:** app.jsx:31304, 31340, 32004, 32147; the `_nullifyUndefined` helper.
**Data-retention:** undefined→null is canonical/safe — no field removal/rename. ✓
**Acceptance:** each of the 4 sites writes without a Firestore `Unsupported field value: undefined` reject even when a line item lacks a BC field; no line-item data altered beyond undefined→null.
**Note:** money-path-adjacent (supplier quote data) → careful review, not a blind sweep (this is why it was EXCLUDED from the v1.23.2 quick-win batch).

---

## B005 — Resolved Tech-Review row can't be manually re-armed
**Ask:** A resolved TR row's checkbox is read-only, so a purely manual PN edit doesn't re-arm review and the row can't be manually re-flagged.

**Current state (grounded):**
- TR checkbox logic at app.jsx:29074-29116: `_trResolved=!!row.techReviewResolved` (29074); manual-set branch (29101, `techReviewFlag:true, source:"manual"`); resolve branch (29116).
- A supplier re-cross DOES auto-re-arm a resolved row (39124-39125, `source:"supplier"`, resets resolved) — so the substitution-risk path (what TR primarily guards) is covered.
- The gap: a resolved row's checkbox is read-only → no MANUAL re-arm path.

**Proposed design:** allow a manual re-arm of a resolved row — make the resolved-row checkbox interactive (or add a small "re-flag" affordance) that sets `techReviewFlag:true, source:"manual", techReviewResolved:false`.
**★ Coach must trace:** the exact `readOnly`/`disabled` condition on the resolved-row checkbox (29074-29116) that blocks the manual toggle, and confirm re-arming doesn't conflict with the F003 role-differentiated states (a manual re-arm should re-enter the same "in review" flow).
**Touch-points:** app.jsx:29074-29116 (the checkbox + its readOnly gate).
**Data-retention:** state-transition only. ✓
**Acceptance:** on a resolved TR row, the user can manually re-flag it → row re-enters review (yellow / pending) exactly like a fresh manual flag.
**Priority:** LOW / TR-tuning (edge case — outside the supplier-substitution risk that auto-re-arms). Defer under the meatier work.

---

## Routing
B008 + B005 are small but each has a short **Coach trace** (exact condition) before build. B011 is well-defined but **money-path-adjacent** → careful per-site payload verification. Recommend: Coach trace pass (B008 key/state, B005 readOnly condition) + B011 payload-shape verify → Jon approve → Marc build. Could bundle B008 + B005 (both small UI/routing) into a batch; keep B011 as its own careful change. All queued behind G005 + the features clusters.

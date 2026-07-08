# Features Cluster Brief — F004 · F005 · F007 · F008

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-07 · **Status:** Brief → Coach feasibility/touch-point confirm → Jon approve → Marc build (as a batch, queued behind G005 Phase 1)
**Traced against tip:** `4c20cdb4`. All four are SMALL; two are largely already built. Good candidate for a single quick-win-style batch (one patch → one Coach review → one deploy), like the v1.23.2 batch.

> **Freddy scoped requirements + grounded touch-points via read-only grep. Coach confirms exact touch-points + feasibility before build (code-grounded authority).**

---

## F004 — Portal submit confirmation shows ARC user + email-copy notice
**Ask:** When a supplier submits a quote from an RFQ, the portal confirmation page AND the confirmation email should display the ARC user's name and state a copy went to them — e.g. *"A copy of your quote has been sent to <Name> (name@matrixpci.com)."* Reassures the supplier it reached a real person.

**Current state (grounded):** `onSupplierQuoteSubmitted` (functions/index.js:623) already fires on status→submitted and **already emails the ARC user + creates a notification**. So the copy-to-ARC-user already happens — F004 is about *surfacing* that fact to the supplier, not building the send.

**Proposed design:**
- **Portal confirmation page (client):** after submit, show the ARC user's display name + "a copy has been emailed to them." Requires the ARC owner's name/email be available to the portal — the `rfqUploads/{token}` doc carries the owner uid (confirm it also has a display name/email, or resolve it).
- **Confirmation email to the SUPPLIER** (if one is sent today — confirm): add the same line.

**Touch-points (Coach to confirm):** portal submission-confirmation UI (supplier portal page/component); `rfqUploads/{token}` fields (owner name/email availability); the supplier-facing confirmation email builder (if it exists).
**Data-retention:** read-only surfacing; possibly add owner-name to the token doc at RFQ-create time (additive). ✓
**Acceptance:** submit a portal quote → confirmation page + supplier email both name the ARC user and state a copy was sent to them.
**Open Q:** (1) Is a confirmation email sent to the SUPPLIER today, or only the confirmation page? (2) Is the ARC user's display name on the token doc, or must it be resolved from the uid?

---

## F005 — "Print Only" button in the locked-quote blocker overlay
**Ask:** After a quote is sent, the blocker overlay covers Print + Send. Add a **"Print Only"** button that prints the quote to PDF — needs NEITHER approval NOR unblocking (read-only output). Thematic sibling to legacy **#196** (same overlay also covers the Receive PO forward-step).

**Current state (grounded):** the sent-quote soft-block overlay is at app.jsx:36217; its only action is **"Verify with Project Owner & Enable Edits"** (36231); unlock message at 36477. A quote-print path + `quotePrintLock` transaction exist (37799+). So the print capability exists — F005 adds an overlay button that invokes it without unlocking.

**Proposed design:** add a "Print Only" button beside "Verify with Project Owner & Enable Edits" (36231) that calls the existing quote-print path (the `#quote-doc` `window.print()` flow) directly — no state unlock, no approval. Read-only.

**Touch-points (Coach to confirm):** the overlay block at 36217-36231; the existing print handler (locate the print-quote entry point + confirm it's side-effect-free enough to run under the lock — it acquires `quotePrintLock`, a 30s print lock, which is fine).
**Data-retention:** none (read-only print; print-lock is transient). ✓
**Acceptance:** on a sent/locked quote, the overlay shows "Print Only"; clicking prints the quote PDF with the quote still locked (no edit unlock, no approval prompt).
**Open Q:** should "Print Only" respect the 30s `quotePrintLock` (yes — reuse the existing acquire) — confirm no unlock side-effect.

---

## F007 — Order dashboard projects by last-accessed (most-recent on top)
**Ask:** On exiting a project, bump it to the TOP of the dashboard; order the whole list by last-accessed (most-recently-opened first).

**Current state (grounded):** projects are already sorted by a timestamp — app.jsx:10037 `snap.docs.sort((a,b)=>(b.data().updatedAt||0)-(a.data().updatedAt||0))` (updatedAt desc). But `updatedAt` bumps on SAVE (edits), not on OPEN — so merely *viewing* a project doesn't move it. F007's delta = track last-**accessed** (open/exit), not just last-updated.

**Proposed design:**
- Add an additive per-project `lastAccessedAt` timestamp, written on project **open** (and/or exit).
- Change the dashboard sort (10037) to key on `lastAccessedAt` (fall back to `updatedAt` then `createdAt` for legacy projects with no `lastAccessedAt`).

**Touch-points (Coach to confirm):** the project-open handler (write `lastAccessedAt`); the sort at 10037 (confirm it's the dashboard list); legacy fallback ordering.
**Data-retention:** additive field `lastAccessedAt`; sort fallback preserves ordering for projects that never had it. ✓
**Acceptance:** open project A then B then C → dashboard shows C, B, A on top; a legacy project with no `lastAccessedAt` still sorts sensibly (by updatedAt/createdAt).
**Open Q:** write on open, exit, or both? (Rec: on open — simplest, covers "most-recently-opened.") Should a background/async touch (extraction completing) count as "accessed"? (Rec: no — only explicit user open.)

---

## F008 — New-version-available refresh notification  ⭐ ~90% ALREADY BUILT
**Ask:** When a new build is pushed, notify ALL users' pages to refresh; reassure all their work is saved / nothing lost.

**Current state (grounded — this already largely works):**
- `newVersionAvailable` state (app.jsx:46399) + a Firestore `_system/version` **onSnapshot listener** (47154-47163): when the doc's version ≠ the loaded `APP_VERSION`, it sets `newVersionAvailable`.
- A **banner already renders** (47343-47364): *"🚀 New version {X} is available!"* with a "Later" button.
- The `_system/version` doc is written by the **first admin** who loads the new build (47156).

**So the mechanism exists.** F008's delta is a small refinement:
1. **Confirm/add a "Refresh now" button** on the banner (47343+ currently shows "Later" — verify there's a reload action; if not, add one that does `location.reload()`).
2. **Add reassurance copy** — "All your work is saved; refreshing won't lose anything."
3. **(Optional) De-couple the broadcast from admin-first-load:** today non-admins only get notified after an admin loads the new build (which writes `_system/version`). Options: have `deploy.sh` write `_system/version` directly at deploy time, OR let the existing on-load `version.json` freshness check (index.html:243) also update `_system/version`. Decide if this matters for Jon's team (if an admin always loads soon after deploy, it's moot).

**Touch-points (Coach to confirm):** the banner at 47343-47364 (add refresh button + copy); optionally `deploy.sh` or index.html:243 for the broadcast-trigger de-coupling.
**Data-retention:** none. ✓
**Acceptance:** after a deploy, a logged-in user on the old build sees the banner with a working "Refresh now" + reassurance copy; refresh loads the new build with no data loss.
**Open Q:** does the current banner already have a refresh action (vs only "Later")? Does the broadcast need to fire without an admin loading first?

---

## Batch framing & routing
All four are S-sized (F008/F007 partly built; F004/F005 small additions). Recommend building as **one batch → one Coach review → one deploy** (minor version bump if F004/F007 add fields/capability; F005/F008 alone are patch-level). **Queued behind G005 Phase 1** (both touch app.jsx → sequential, no parallel-collision).
**Pipeline:** this Brief → Coach feasibility + touch-point confirm (answers the per-feature Open Qs) → Jon approve → Marc build → Coach review → Jon deploy checkpoint.

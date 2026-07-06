# F003 — Role-Differentiated Tech Review (user-flag / engineer-signoff) — BRIEF

**Author:** Freddy Lyst (Analyst)
**Date:** 2026-07-06
**Status:** Discovery → routing to Coach for FEASIBILITY TRACE + design options
**Category:** F003 (Feature). **Origin:** surfaced during F002 live-verify; Jon redesigned the TR interaction (2026-07-06). **Absorbs** the former F002 Rev 2 C6/C7/C8. **Motivation:** a clear, role-split Tech-Review UX — declutter + unambiguous "who does what," which the **F001** training walkthrough will teach.

---

## 1. The design (Jon, 2026-07-06)

A **role-differentiated** TR control: the *same BOM row* renders a different control depending on who's looking, with a shared **yellow** "in review" signal.

**User (Sales / non-engineer):**
- Sees a **checkbox** only.
- Check → row turns **YELLOW** ("in review — flagged for engineer attention").
- Uncheck → clears yellow, row reverts to current state.

**Assigned Engineer (reviewer):**
- Does **NOT** see the user's checkbox.
- Sees an **empty green circle** + the yellow row ("this row needs my attention").
- Checks the green circle → review satisfied for that row → row reverts to current state + circle shows a **checkmark**.

**Gate:**
- Tech Review **cannot be Approved or Rejected until every yellow row is addressed** (all green circles checked). Replaces the current #199 approve-**sweep** (which auto-resolves all rows on approval) with **per-row engineer sign-off**.

## 2. Likely mechanics (Freddy's framing — Coach to confirm/refine)
This is largely a **role-differentiated re-skin of existing #199 controls + an approve-gate change**, NOT a from-scratch build:
- **User checkbox** ≈ existing `_onTrToggle` (sets/clears `techReviewFlag`) — now shown only to non-engineers / users.
- **Engineer green circle** ≈ existing `_onTrResolve` (stamps `techReviewResolved/By/At`) — shown only to the assigned engineer, restyled as an empty→checked circle.
- **Yellow row** = the F002-C8 hook (`_isUnresolvedTechReviewRow` → yellow rowBg, visual-only).
- **No-TR-text** = the F002-C6 change (bare control, no "TR"/"TR✓" label).
- **Approve/reject gate** = NEW: block approve/reject while any `_isUnresolvedTechReviewRow` exists (replaces the auto-resolve sweep at ~34396–34416).

## 3. Open questions — Coach FEASIBILITY TRACE + Jon rulings
1. **Auto-stamp:** #199 auto-flags rows on supplier crosses (`@38978`, unconditional). Keep auto-flag / drop it (user-manual-only) / keep-but-user-can't-uncheck-auto-flagged? *(Design + feasibility.)*
2. **User uncheck during review:** once out for review (`pending`), can the User still uncheck (pull a row back), or is it locked to the engineer's green circle? *(Design.)*
3. **Role boundaries:** "Engineer" = `preReviewAssignedTo`? What do **admin** and **non-assigned reviewers** see — checkbox, circle, or nothing? *(Design; current `_isTechReviewer` = admin∥reviewer-perm∥assignee.)*
4. **View switch trigger:** does the engineer's green-circle view replace the user's checkbox whenever the viewer is the assigned engineer, or **only while `preReviewStatus==="pending"`** (out for review)? Before send, does anyone see circles? *(Design + feasibility.)*
5. **Green circle control:** restyle/repurpose the existing Resolve ✓ (`_onTrResolve`) into the empty→checked circle, or a new control? *(Feasibility.)*
6. **Approve/reject gate:** replace the approve-sweep (34396–34416) with "blocked until every yellow row addressed." Applies to **reject** too? What's the UX when blocked (disabled button + reason)? *(Feasibility + design.)*
7. **Send-gate:** does an unaddressed yellow row still hard-block quote sends (as #199 does today across 7 surfaces)? *(Presumably yes — confirm no regression.)*
8. **Existing data:** projects already carrying `techReviewFlag`/`techReviewResolved` rows (e.g. PRJ402111 row 8) must render correctly under the new role-split. *(Backward-compat.)*

## 4. Invariants to PROTECT
1. **Data retention** — `techReviewFlag`, `techReviewResolved`, `techReviewResolvedBy/At`, `techReviewFlagSource` preserved on save; **no field removal/rename**. Audit stamp on engineer sign-off preserved.
2. **#199 hard send-gate** — an unaddressed TR row still blocks all 7 send surfaces (Q7). The redesign changes *who resolves and how it's shown*, not *that unresolved blocks sends*.
3. **F002-C8 yellow = visual-only** — `_isBomRowFlaggedRed` + all RFQ/logic predicate consumers unchanged; yellow overrides red at the **display layer only**.
4. **Pre-review flow intact** — `preReviewStatus` (pending/approved/rejected), `preReviewAssignedTo`, "📋 Send for Technical Review" (@34523) still work; only the **approve/reject resolution model** changes (sweep → per-row gate).
5. **No cross-user clobber** — role-based rendering must not let one role's view write another's state incorrectly.

## 5. Relationship to F002 & F001
- **F002** = BOM column reorg + tri-state BC circle + grey-italic pricing (**Rev 1, live-verified + banked**). Stands alone; **shippable independently** — Jon decides ship-now vs bundle-with-F003 at the deploy checkpoint. The former F002 Rev 2 (C6/C7/C8) **moves here into F003**.
- **F001** (walkthrough, blocked) targets the FINAL BOM UI — now gated on **both F002 and F003** shipping. The role-split TR is exactly the kind of flow F001 will teach (different steps for Sales vs Engineer).

## 6. Pipeline (per-phase gated — HOLDS for Jon between phases)
1. **Brief** (this doc) → **Coach FEASIBILITY TRACE** — can the existing #199 + pre-review architecture support this cleanly, what's the lift, and the §3 open Qs returned as **design options** (Coach traces + options; Jon rules).
2. **Analyst Review** (Freddy) → **Jon rules the open Qs + approves the Plan** (no code before this).
3. **Marc builds** (+ `data-tour` anchors for F001) → `validate_jsx.js`.
4. **Live re-verify** on matrix-arc-test — both role views (user checkbox→yellow / engineer circle→resolve), approve/reject gate, send-gate, backward-compat on existing flagged rows.
5. **Coach review → Jon deploy checkpoint.**

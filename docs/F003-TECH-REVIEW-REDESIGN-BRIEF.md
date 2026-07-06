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

---

## 7. ANALYST REVIEW + JON RULINGS (2026-07-06)

**Analyst Review of Coach's feasibility trace (`docs/F003-COACH-FEASIBILITY.md`, tip 3c9df0a7): PASS.** Thorough; recommended option set internally consistent; the one MEDIUM risk (approve-sweep persist side-effect) is well-contained and flagged for the build Plan. Core new logic correctly identified = role-mutual-exclusivity of the two controls. §2 re-skin framing confirmed.

**JON RULED the 8 open questions (all as Coach-recommended — the consistent set):**
| Q | Ruling |
|---|--------|
| Q1 auto-stamp | **1a — KEEP** supplier-cross auto-flag (already the #199 safety net; no code change). |
| Q2 uncheck-during-review | **2b — LOCK** all flags once `preReviewStatus==="pending"`; engineer owns resolution. |
| Q3 signoff authority | **3b — assigned engineer + admin** get the circle; non-assigned reviewers see the checkbox. |
| Q4 view-switch | **4a — engineer circles ONLY while `pending`**; everyone else/other states see the checkbox (also fixes old C7 over-exposure). |
| Q5 green circle | **5a — RESTYLE** the existing Resolve ✓ (`_onTrResolve`) into empty→checked circle (reuse handler + audit stamp). |
| Q6 approve/reject gate | **6b — block APPROVE** while `_hasUnresolvedTechReview`; **remove the sweep**; **Reject/Return stays FREE**. |
| Q7 send-gate | **keep** — unresolved row still hard-blocks all 7 send surfaces (no regression). |
| Q8 existing data | **none** — no migration; PRJ402111 row 8 is the verify fixture. |

**Ruled set = 1a / 2b / 3b / 4a / 5a / 6b / keep / none.** Design LOCKED.

### BUILD PLAN APPROVED (2026-07-06)
- **Coach Build Plan** (`docs/F003-COACH-BUILD-PLAN.md`, tip 8438b727) — **Freddy Analyst Review: PASS** (7 edit sites faithful to the ruled set; MEDIUM-risk sweep-removal verified SAFE in §7 — the sweep's panel-save was redundant to per-row `_onTrResolve` saves; removing it also eliminates the old #199 MED-2 partial-write risk; invariants hold; 11 test criteria).
- **Accepted design consequence (Jon aware):** during an active review the engineer sees only sign-off circles (no checkbox) → cannot flag NEW rows mid-review; path for more review = Reject/Return to Sales. Falls out of 2b + engineer-sees-circle; accepted as-is.
- **Jon: APPROVED the build** → routed to **Marc**. Build per the Plan's 7 sites + build order (§11).
- **Gating:** code-complete ≠ deploy. After build + `validate_jsx.js`, Marc+Jon live-verify on matrix-arc-test (§10 T1–T11, incl. both role views + PRJ402111 row 8 backward-compat), Coach reviews, THEN Jon deploy checkpoint (Jon decides F003-alone vs any bundling).

---

## 8. REV-A — live-pass refinements (Jon, 2026-07-06, during the F003 live verify)
Four small tweaks Jon surfaced watching the live pass. All trivial (cosmetic + one behavior-confirm + a header string) → Marc implements in the F003 build; no separate Coach plan (folds into the F003 diff Coach reviews). Fold the F002 header rename in too (ships with F003).
1. **Brighter yellow (C8 token).** The current `rgba(245,158,11,0.28)` reads brownish over the dark bg. Shift to a brighter, more-yellow hue — start point `rgba(250,204,21,0.40)` (`#facc15`) — **alpha/hue is a live tuning knob; Jon eyeballs.**
2. **Bolder engineer-circle border.** Current `1px solid #4ade80` → thicker (e.g. `2px solid #4ade80`) so the green circle reads as a bold ring.
3. **Sign-off is FINAL (uncheckable).** Once the engineer checks the circle (✓ / resolved), it **cannot be un-checked/toggled back** — matches the Plan's "non-clickable once resolved." Confirm the build enforces this; if currently toggleable, lock it. (Re-opening a signed-off row = Reject/Return.) *(Jon to confirm interpretation.)*
4. **Rename column "Status" → "Issues".** The F002-shipped header "Status" (holds the BC circle + confidence "C" circle) → **"Issues"**. Header string change (F002 header array); folds into the F003 build/deploy. *(Technically an F002 amendment — bundled with F003 for one deploy.)*

### Next: Coach writes the BUILD PLAN
Coach → exact edit sites (feasibility §4 lift breakdown as the skeleton) encoding the ruled set, the `_isReviewSignoffAuthority` helper (3b), the role-mutual-exclusivity branch (4a-gated), the approve-gate swap (6b) **+ resolve the MEDIUM-risk dependency** (confirm nothing else keys off the removed sweep's persist side-effect, §3.4), `data-tour` anchors on BOTH controls (F001), test criteria. → Freddy Analyst Review → **Jon build-approval** → Marc builds. HOLD, no build.

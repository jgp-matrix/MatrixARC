# F003 — Role-Differentiated Tech Review — COACH FEASIBILITY TRACE + OPTIONS

**Author:** Sam Wize (Coach)
**Date:** 2026-07-06
**For:** Freddy (Analyst Review) → Jon (rules the §2 open Qs + approves)
**Traced against tip:** `3eb850d2` (post-F002-Rev1-build). This is a **feasibility trace + design options — NOT a build plan.** Jon rules the open questions; the build Plan comes after.

---

## 0. VERDICT — feasible, clean, LOW–MEDIUM lift

**YES — the existing #199 + pre-review architecture supports F003 cleanly with NO schema change.** Freddy's §2 framing is **correct**: this is a role-differentiated re-skin of the existing `_onTrToggle` / `_onTrResolve` controls + the F002-C6/C8 changes + one genuinely-new piece (the approve/reject gate replacing the sweep). Every field F003 needs already exists and is already persisted.

- **Rough lift:** **~30–50 net LOC**, all in `src/app.jsx`, no `functions/` change, no Firestore schema change.
- **Risk tier:** **LOW–MEDIUM.** The only MEDIUM item is the approve-model change (sweep → per-row gate) — a behavior change with one dependency to verify (§3.4). Everything else is LOW (render re-skin + reuse of existing guarded handlers).
- **One correction to the framing** (§1): today the checkbox and the Resolve ✓ can render **together** on a reviewer's row. F003's core new logic is making them **mutually exclusive by role** — a viewer sees *either* the user checkbox *or* the engineer circle, never both. That role-branch is the heart of the build.

---

## 1. Architecture assessment (confirm/refine Freddy's §2)

| Freddy's framing | Verdict | Detail (current code) |
|---|---|---|
| User checkbox ≈ `_onTrToggle` (sets/clears `techReviewFlag`) | ✅ **Confirmed** | `_onTrToggle` at ~29003; sets `techReviewFlag:true,techReviewFlagSource:"manual",…` (29011) / clears (29010). Same field F003 needs. |
| Engineer green circle ≈ `_onTrResolve` (stamps `techReviewResolved/By/At`) | ✅ **Confirmed** | `_onTrResolve` at ~29021 (29025 stamps resolved/By/At). Restyle its button (29076–29079) into empty→checked circle. |
| Yellow row = F002-C8 hook | ✅ **Confirmed** | `_isUnresolvedTechReviewRow(row)` (module fn, 15872) → yellow `rowBg` at 28967, visual-only. Already specced in F002 §11.2. |
| No "TR"/"TR✓" label = F002-C6 | ✅ **Confirmed** | delete label span at 29072. |
| Approve/reject gate = NEW (replaces sweep 34396–34416) | ✅ **Confirmed + it's the one non-trivial piece** | see §2 Q6 + §3.4. |
| **[Coach adds] role-mutual-exclusivity of the two controls** | ⚠ **New core logic** | Today: checkbox renders for `_trShow&&(_trFlagged||!readOnly)` (29069); Resolve ✓ *additionally* for `_trShow&&_trUnresolved&&_trIsReviewer` (29076). F003: branch so the engineer-in-review sees ONLY the circle, the user sees ONLY the checkbox. |

**Bottom line:** no new data model, no new persistence, no new Cloud Function. The build = (a) a role branch on which control renders, (b) restyle Resolve→circle, (c) C6 label delete, (d) C8 yellow rowBg, (e) swap the approve-sweep for an approve-gate. All five are localized to the BOM-row render (~29069–29079), the rowBg line (28967), and the pre-review approve/reject buttons (~34394–34431).

---

## 2. The 8 open questions → concrete options (Jon rules)

Coach recommends one option per Q, but **all are Jon's call.**

### Q1 — Auto-stamp on supplier cross (38991)
Today: a supplier substitution **unconditionally** sets `techReviewFlag:true, techReviewFlagSource:"supplier", techReviewResolved:false` (38991). Supplier flags are already **user-unclearable** (`_trDisabled` includes `_trFlagged&&_trSupplier`, 28998) — only an engineer clears them.
- **1a — KEEP auto-flag (RECOMMENDED).** Supplier subs → yellow → engineer sign-off required. This IS the #199 safety net (supplier swapped a part → engineer must bless it). Under F003: user sees yellow+checkbox (disabled, can't uncheck a supplier flag); engineer sees yellow+green circle to sign off.
- **1b — drop auto-flag (manual-only).** Loses the supplier-substitution guard. **Not recommended.**
- **1c — keep-but-user-can't-uncheck.** This is *already today's behavior* (supplier flags disabled for users) → functionally == 1a.
- **Coach rec: 1a/1c (keep).** No code change to the auto-stamp; it already produces exactly the "needs engineer sign-off" state F003 wants.

### Q2 — Can the User uncheck during review (`pending`)?
- **2a — user can still uncheck manual flags** (pull a row back) even while pending; supplier flags stay locked. Pro: fix a mis-flag. Con: user yanking rows mid-review confuses the engineer.
- **2b — lock ALL flags once `pending` (RECOMMENDED).** Once "Sent for Technical Review," the engineer owns resolution; the user's checkbox goes read-only. Cleaner ownership; matches "assigned engineer signs off."
- **Feasibility:** both ~1 line (add a `preReviewStatus==="pending"` term to `_trDisabled`/the toggle gate). **Coach rec: 2b.**

### Q3 — Role boundaries (admin / non-assigned reviewer)
"Engineer" today = `preReviewAssignedTo` (or `bcDesignerUid` fallback); `_isTechReviewer` (15880) = admin ∥ reviewer-perm ∥ assignee.
- **3a — engineer-view (circle) ONLY for the assigned engineer;** admin + non-assigned reviewers see the USER checkbox.
- **3b — engineer-view for assignee + admin (RECOMMENDED);** non-assigned reviewers see the checkbox. Admin-can-sign-off matches the app's "admin can do anything" pattern while keeping sign-off authority narrow.
- **3c — engineer-view for the full `_isTechReviewer` set** (assignee + admin + any reviewer-perm). Broadest; closest to today's Resolve visibility. Risk: any reviewer-perm user signing off dilutes "the assigned engineer owns it."
- **Coach rec: 3b.** Feasibility for all three ~1–3 lines (define an `_isReviewSignoffAuthority(project)` helper alongside `_isTechReviewer`).

### Q4 — View-switch trigger (when does the engineer see circles?)
- **4a — circles ONLY while `preReviewStatus==="pending"` (RECOMMENDED).** Before send / after approve, everyone (incl. the engineer) sees the user checkbox. Ties the sign-off UI to an *active* review. This is also the C7 fix (kills the "Resolve on every row mid-quote-build" over-exposure).
- **4b — circles whenever the viewer is the assignee, regardless of status.** Simpler but re-introduces the C7 over-exposure (engineer sees sign-off circles before any review exists). **Not recommended.**
- **Coach rec: 4a (pending-gated).** Feasibility ~1 line (the role branch tests `preReviewStatus==="pending"`).

### Q5 — Green circle: restyle vs new control
- **5a — restyle the existing Resolve ✓ (`_onTrResolve`) into empty→checked green circle (RECOMMENDED).** Reuses the handler + the audit stamp (`resolvedBy/At`). Pure style change (the button at 29077 is already a green circle `#4ade80` — change glyph from "✓" to empty/checked state). ~5–10 lines.
- **5b — new control.** Duplicates `_onTrResolve`. **Not recommended.**
- **Coach rec: 5a.**

### Q6 — Approve/reject gate (replace the sweep)
Today: **Approve** (34396) runs the **approve-sweep** (34399–34416) auto-resolving every flagged row. F003 replaces that with a **block**.
- **Approve:** disable the Approve button while `_hasUnresolvedTechReview(project)` (helper **already exists**, 15873). Tooltip/count like the send-gate: "N line(s) need engineer sign-off before approving." **Remove the sweep block** (34399–34416).
- **Reject/Return (34421–34431):**
  - **6a — reject also blocked** (symmetric). Con: reject = "send back to Sales for fixes"; blocking it could trap the engineer who wants to return *because* of unaddressed rows.
  - **6b — reject NOT blocked (RECOMMENDED).** Approve = "all signed off"; Return is always available. Only Approve requires every row addressed.
- **Coach rec: 6b**, disabled-Approve + reason tooltip. Feasibility LOW (~10–15 net lines: delete ~18 sweep lines, add a `disabled=` guard + tooltip).
- **⚠ Dead-end check (clean):** removing the sweep removes the old "approved project is never permanently un-sendable" guarantee (34399–34401). The **new** guarantee is per-row sign-off: during `pending` the engineer always has the green circle → can clear every row → then Approve unlocks. Backward-compat rows (Q8) clear the same way. No dead-end **provided Q4=4a** (engineer has circles during pending). See §3.4 for the one dependency to verify.

### Q7 — Send-gate (confirm no regression)
**Confirmed — NO regression.** The 7-surface hard send-gate keys on `_isUnresolvedTechReviewRow` → `techReviewResolved`. The engineer's green circle still stamps `techReviewResolved:true` via the reused `_onTrResolve` (5a). So an unaddressed yellow row still hard-blocks all sends. F003 changes *how a row gets resolved* (engineer circle, no more approve-sweep), **not** *that unresolved blocks sends* or *what the gate reads*. One consequence to note: with the sweep gone, sends rely **entirely** on per-row sign-off (no blanket clear) — which is exactly F003's intent. **Coach rec: keep the send-gate as-is (yes, still blocks).**

### Q8 — Existing data (backward-compat)
Existing rows use the **same fields** (`techReviewFlag`/`techReviewResolved`/…) → **no migration.**
- **PRJ402111 row 8** (`800H-AR6A`, flagged+unresolved): renders yellow (C8). If its project is `pending` + viewer is the engineer → empty green circle to sign off. If not `pending` → user checkbox (checked). Resolvable via the normal flow.
- Rows already **resolved** under the old approve-sweep (`techReviewResolved:true`) → render normally (no yellow, no circle). ✅
- Supplier-flagged existing rows → user checkbox disabled, engineer circle clears. Consistent with Q1.
- **Coach rec: no backward-compat work needed** beyond confirming the role-branch renders these correctly at verify (row 8 is the ready-made test fixture).

---

## 3. Invariant risk assessment (Brief §4)

| # | Invariant | Risk | Assessment |
|---|---|---|---|
| 1 | **Data retention** — TR fields preserved, no removal/rename; audit stamp preserved | **LOW** | F003 reads/writes the *same* 5 fields via the *same* handlers. `_onTrResolve` (reused) keeps the `resolvedBy/At` audit stamp. No field churn. |
| 2 | **#199 hard send-gate** | **LOW** | Unchanged — gate reads `techReviewResolved`, still stamped by the circle (Q7). |
| 3 | **F002-C8 yellow = visual-only** | **LOW** | Yellow via `_isUnresolvedTechReviewRow` in `rowBg` (28967); `_isBomRowFlaggedRed` + all RFQ/logic predicates untouched. |
| 4 | **Pre-review flow intact** | **⚠ MEDIUM** | `preReviewStatus`/`preReviewAssignedTo`/Send-for-Review unchanged. BUT the approve **resolution model** changes (sweep → gate). **ONE dependency to verify:** the sweep currently *persists* swept panels (`saveProjectPanel`, 34416). Removing it must not orphan any consumer that assumed "approved ⇒ all rows resolved in Firestore." Since the new gate guarantees all rows are *already* resolved (and saved via each `_onTrResolve`) *before* Approve unlocks, the end-state is equivalent — but Marc must confirm no other code keys off the sweep's side-effect. Flag for the build Plan + verify. |
| 5 | **No cross-user clobber** | **LOW** | The role branch decides *which control renders*, not the write path. Both `_onTrToggle` and `_onTrResolve` write via `latestPanelRef.current` + `onSaveImmediate` — the existing #199 cross-user-guarded save pattern. No new write path. |

**No HIGH-risk items.** The single MEDIUM is the approve-model change (§3.4) — well-contained, one dependency to confirm.

---

## 4. Lift breakdown (~30–50 net LOC, LOW–MEDIUM)

| Piece | Site | ~LOC | Risk |
|---|---|---|---|
| Role branch: render checkbox (user) XOR green circle (engineer-in-review) | 29069–29079 | 10–15 | LOW–MED (core new logic) |
| Restyle Resolve ✓ → empty/checked green circle (Q5a) | 29077–29079 | 5–10 | LOW |
| C6 — delete "TR"/"TR✓" label span | 29072 | −1 | LOW |
| C8 — yellow rowBg override (visual-only) | 28967 | +1 | LOW |
| Approve gate: disable while `_hasUnresolvedTechReview`, remove sweep (Q6) | 34394–34420 | net ~10–15 | **MED** |
| User-uncheck lock during `pending` (Q2b) | ~28998 / toggle gate | 1 | LOW |
| Role-authority helper `_isReviewSignoffAuthority` (Q3b) | near 15880 | 3–5 | LOW |
| `data-tour` anchors on BOTH controls (F001) | 29069–29079 | +2 | LOW |

---

## 5. Notes for the eventual build Plan (not built here)
- **F001 readiness:** the role split needs `data-tour` anchors on **both** the user checkbox and the engineer circle so F001 can teach the two flows separately.
- **Companion wording:** the #199 send-block message (15998 / 33705) says "…or have an engineer resolve the flagged lines" — under F003 that path becomes "engineer signs off via the green circle during review." Revisit the wording (dovetails with **B002**, already logged).
- **Recommended option set for a clean, minimal build:** Q1=1a, Q2=2b, Q3=3b, Q4=4a, Q5=5a, Q6=6b, Q7=keep, Q8=none. This set is internally consistent (engineer owns resolution during `pending`; user flags before send; admin can cover; approve gated, reject free).

## 6. Pipeline / HOLD
This feasibility trace → Freddy Analyst Review → **Jon rules the §2 open Qs + approves a build Plan** → Coach writes the build Plan (or folds into this doc) → Marc builds → live re-verify (both role views, approve/reject gate, send-gate, PRJ402111 row 8 backward-compat) → Coach review → Jon deploy checkpoint. **F002 Rev 1 stays banked/shippable independently.** **HOLDING — no build.**

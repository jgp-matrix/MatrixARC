# B096 fix / TR reviewer-uncheck + approve-gate — build plan

> Coach scope, 2026-08-05 · prod v1.24.90 · MONEY-PATH (send-gate + review process). Anchors vs src/app.jsx.

## Model shift (Jon 2026-08-05)
Today: reviewer "resolves" via a green circle → `techReviewFlag` stays true, `techReviewResolved`→true; gates key on the unresolved composite. New rule: **reviewer UNCHECKS the box** (checked = the blocker); **Approve refused while ANY box checked**; Reject leaves boxes checked. This retires the green-circle resolve in favor of a direct audited uncheck — and thereby FIXES B096 (supplier/resolved flags become reviewer-uncheckable; no more dead-end).

## Current code (verified)
- Predicates: `_isUnresolvedTechReviewRow=flag&&!resolved` (:18247); `_hasUnresolvedTechReview` (:18248); `_isTechReviewer` broad (:18255); `_isReviewSignoffAuthority` = admin OR assigned-to-review, **pending-only** (:18266).
- Row control: `_trDisabled = readOnly||_baseLockedInEco||_trResolved||(flag&&supplier)||preReviewStatus==="pending"` (:33693) — the B096 dead-end. Render branch (:33774-33801): reviewer-during-pending sees green circle (`_onTrResolve` :33716), else checkbox (`_onTrToggle` :33698, disabled by _trDisabled).
- Approve (:39508-31): count `_isUnresolvedTechReviewRow` (:39515) → disabled button + tooltip (:39517), NOT a modal; writes preReviewStatus:"approved". Reject (:39532-42): writes rejected, leaves techReview* intact ✔. Supplier auto-flag (:44980). Send-gate keys on the composite (:18248/:18428/:18714).
- Modal: `arcAlert(msg,{kind,title,okLabel})` (:2217) + ArcDialogHost pre-wrap (:2475) → blocking modal with a newline list, no new component.

## Changes
- **3a `_trDisabled` (:33693):** during pending, enabled ONLY for `_isReviewSignoffAuthority` (assigned reviewer/admin), disabled for all others; pre-submit keeps current rule (see Q1). Reviewer can uncheck ANY checked box (manual/supplier/legacy-resolved).
- **3b render (:33774-33801):** reviewer sees an ENABLED checkbox during pending (not the green circle). Remove the green-circle branch (Q5); all roles fall through to the checkbox, `disabled` doing the gating.
- **3c uncheck handler (:33698/:33704):** on reviewer uncheck set `techReviewFlag:false, techReviewResolved:true, techReviewResolvedBy:uid, techReviewResolvedAt:now` (preserve audit).
- **3d approve-gate (:39508-31):** change count to **`r.techReviewFlag`** (still-checked) building a LIST {panel,line,partNumber}; make the button enabled (except ownerPriority); on click, if list non-empty → `await arcAlert(list,{kind:"warning",title:"Resolve Technical Review flags before approving"})` + return; else proceed to the approve write.
- **3e reject:** no change (verified).
- **SSOT:** add `_isCheckedTechReviewRow=r=>!!r.techReviewFlag` near :18247; use in both approve-gate + row indicator (don't re-inline).

## Jon decisions (defaults I'll build unless corrected)
- **Q1 pre-submit toggling** — DEFAULT: keep current (requestor can check/uncheck manual flags before submit; reviewer-only ONCE SUBMITTED). Matches Jon's wording "once it has been submitted for review, only the reviewer."
- **Q2 supplier flags in approve-gate** — DEFAULT: counted same as manual (both are checked boxes). 
- **Q3 send-gate symmetry (MONEY-PATH — surface)** — send-gate stays on the *unresolved composite* (:18714) vs re-key on *any checked* box to match approve exactly. DEFAULT: keep composite (an unchecked row sets flag:false+resolved:true → clears both consistently); legacy flag:true+resolved:true rows differ. **Confirm with Jon.**
- **Q4 reviewer identity** — DEFAULT: narrow `_isReviewSignoffAuthority` (admin OR assigned-to-review, pending-only), NOT broad `_isTechReviewer`.
- **Q5 green circle** — DEFAULT: remove it; checkbox is the sole control, audit folded into uncheck.

Effort M. Money-path → Coach code-review + Test verify. Version minor.

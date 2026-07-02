# #199 — Per-Line "Tech Review" Flag — DETAILED PLAN

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** Implementation plan (Marc builds)
**Approved by:** Jon (2026-07-02) · **Route:** this plan → Freddy verify → Jon final gate → Marc build
**Inputs:** `docs/199-TECH-REVIEW-FLAG-BRIEF.md` + `docs/199-COACH-SUPPLEMENT.md` + `docs/199-ANALYST-REVIEW.md`
**Base:** v1.21.24 · master `a1e8e4d0`. **Line numbers are current-tip (post-#188); Marc confirms each via the quoted anchor string before editing** (app.jsx shifts frequently).

---

## 0. Summary

Add a per-BOM-row "Tech Review" flag that (a) auto-stamps when a **supplier** crosses a line via the RFQ variance-apply, (b) can be **manually** set by Sales, (c) is **resolved** by a reviewer (per-row or via project approval), and (d) **hard-blocks** quote send/approve while any flagged line is unresolved. All client-side (`src/app.jsx`); **no `functions/` changes, no Functions deploy**. Additive row fields, **no `APP_SCHEMA_VERSION` bump**.

**Phasing (R2 dead-end guard — the gate must never ship without a resolution path):**
- **P1 — Data + capture** (inert without gate; safe to ship alone)
- **P2 — Resolution** (must precede or accompany P3)
- **P3 — Hard gate** (ships **with or after** P2 — never before)

---

## 1. Field model (locked) & shared predicates

### 1.1 Per-row fields (additive)
```
techReviewFlag:       boolean
techReviewFlagSource: "supplier" | "manual"
techReviewResolved:   boolean
techReviewResolvedBy: uid | null
techReviewResolvedAt: ms  | null
```
Absent on legacy rows → predicate reads falsy → treated as unflagged. No migration needed.

### 1.2 Shared predicates — SINGLE SOURCE (place at module scope next to `_isBomRowFlaggedRed`, `src/app.jsx:15854`)
```js
// #199 — one rule, two altitudes (dual-consumer: row indicator + send gate)
const _isUnresolvedTechReviewRow = r => !!r && !!r.techReviewFlag && !r.techReviewResolved;
function _hasUnresolvedTechReview(project){
  return (project && project.panels || []).some(p => (p.bom||[]).some(_isUnresolvedTechReviewRow));
}
```
Every consumer (row checkbox/indicator, gate, counts) calls these — never re-inline `techReviewFlag && !techReviewResolved`. (CLAUDE.md dual-consumer rule.)

### 1.3 Reviewer predicate — factor the EXISTING expression
A reviewer test already exists inline at **`src/app.jsx:26308`**:
```js
_appCtx.role==="admin"||hasPermission("reviewer")||(project.preReviewAssignedTo?project.preReviewAssignedTo===_me:!!(project.bcDesignerUid&&project.bcDesignerUid===_me))
```
and again at **`~37030`**. **Extract it once** into a shared helper and repoint both existing sites to it (prevents drift — same "factor the rule" precedent):
```js
function _isTechReviewer(project){
  return _appCtx.role==="admin" || hasPermission("reviewer")
    || (project && project.preReviewAssignedTo
        ? project.preReviewAssignedTo===_appCtx.uid
        : !!(project && project.bcDesignerUid && project.bcDesignerUid===_appCtx.uid));
}
```
(Confirm `_me` at 26308 resolves to `_appCtx.uid`; if it's a local alias, keep behavior identical. Repointing 26308/37030 is preferred but may be deferred if Marc wants to minimize P1 blast radius — at minimum, define `_isTechReviewer` for #199's own use.)

---

## 2. PHASE 1 — Data + capture (inert; no gate)

### 2.1 Auto-stamp supplier crosses — `src/app.jsx:38841`
The **only** site where a supplier cross lands on a BOM row (verified: `doApplyPortalPrices` skips crossed rows; `supplierCrossRef` is display-only). Current line:
```js
if(cross)return{...r,partNumber:cross.supplierItem.supplierPartNumber||cross.supplierItem.partNumber,crossedFrom:cross.bomPartNumber,isCrossed:true};
```
**Change to:**
```js
if(cross)return{...r,partNumber:cross.supplierItem.supplierPartNumber||cross.supplierItem.partNumber,crossedFrom:cross.bomPartNumber,isCrossed:true,
  techReviewFlag:true,techReviewFlagSource:"supplier",techReviewResolved:false,techReviewResolvedBy:null,techReviewResolvedAt:null};
```
Re-crossing a previously-resolved row re-arms (`resolved:false`) — correct: a new substitution needs fresh review.

### 2.2 Checkbox UI — BOM row render, `src/app.jsx:~28927` (the `rowBg`/row `.map`)
Add a "Tech Review" control in the row (co-locate with the BC/confidence column cluster from #141; do **not** overload the red price-flag styling — R1). Behavior matrix:

| Row state | Sales (non-reviewer) | Reviewer / Admin |
|---|---|---|
| `techReviewFlagSource==="supplier"`, unresolved | checkbox **checked + disabled** (title: "Supplier substitution — requires engineer sign-off") | checked; **Resolve** control available (P2) |
| `techReviewFlagSource==="manual"`, unresolved | checkbox **toggleable** | toggleable; **Resolve** available (P2) |
| unflagged | checkbox unchecked, **checkable** → sets manual | checkable → sets manual |
| resolved | checked, shown resolved (muted/✓); read-only | may re-open (optional) |

onChange handlers (write to the row, then `saveProjectPanel(uid, project.id, panel.id, updatedPanel, true)`):
- **Manual check** (unflagged → flagged): `{techReviewFlag:true, techReviewFlagSource:"manual", techReviewResolved:false, techReviewResolvedBy:null, techReviewResolvedAt:null}`.
- **Manual uncheck** (only if `techReviewFlagSource==="manual"` OR reviewer): `{techReviewFlag:false}`. **Guard:** Sales cannot uncheck `techReviewFlagSource==="supplier"` (checkbox disabled + handler no-ops if `!_isTechReviewer && source==="supplier"`).
- Indicator: distinct glyph/badge (e.g. amber "TR"), separate from red row bg.

### 2.3 Persistence
`saveProject` (`8898`) / `saveProjectPanel` (`9224`) spread the whole object; only `dataUrl` is stripped. Additive fields ride along — **no code change, no schema bump**. (Coach Q4.) Doc-only: add `techReviewFlag`/`techReviewFlagSource`/`techReviewResolved*` to the CLAUDE.md Data-Retention "preserved-metadata" list — **Coach applies to CLAUDE.md on approval** (Coach owns CLAUDE.md).

### 2.4 P1 test criteria
- **T1** — Supplier cross via variance-apply → row gets `techReviewFlag:true, source:"supplier", resolved:false`.
- **T2** — Save → reload → flag + source + resolved survive (all 5 fields).
- **T3** — Reconciliation: unchanged/qty-changed/rejected rows retain the flag; a genuine `pn_changed`-accept drops it (rides `isCrossed` lifecycle — Coach Q5; no `NO_CARRY` edit).
- **T4** — Sales checks an unflagged row → `source:"manual"`; unchecks it → `flag:false`.
- **T5** — Sales sees a supplier-flagged row's checkbox **disabled** (cannot uncheck).
- **T6** — Legacy project (rows lack the fields) renders unflagged, no console errors, `_isUnresolvedTechReviewRow` false.
- **T7** — With no gate yet (P3 not shipped), Send/print behave exactly as today (proves P1 inert).

---

## 3. PHASE 2 — Resolution (must precede or accompany P3)

### 3.1 `_isTechReviewer(project)` helper — §1.3.

### 3.2 Per-row Resolve control — BOM row render (`~28927`)
Rendered only when `_isUnresolvedTechReviewRow(row) && _isTechReviewer(project)`. On click:
```js
{techReviewResolved:true, techReviewResolvedBy:_appCtx.uid, techReviewResolvedAt:Date.now()}
```
then `saveProjectPanel(...)`. Confirm dialog optional (low-risk, reversible). Distinct from Sales' checkbox — a reviewer-only "Resolve" affordance.

### 3.3 Approve-sweep — `src/app.jsx:34271` (approve handler)
Current approve writes project-level `reviewFields = {preReviewStatus:"approved", ...}`. **Extend the approve action** to also sweep BOM rows: build updated panels where every `_isUnresolvedTechReviewRow` gets `{techReviewResolved:true, techReviewResolvedBy:_appCtx.uid, techReviewResolvedAt:Date.now()}`, and persist via the same save the approve already performs (fold the panels update into the project write, or `saveProject` the swept project). Rationale (Analyst P2): approval **is** the engineer's affirmative sign-off on the whole project incl. flagged lines; guarantees an approved project is never permanently un-sendable. Approval is an explicit action, so this is not a silent blessing.

### 3.4 P2 test criteria
- **T8** — Reviewer (assigned engineer or admin) sees the Resolve control; non-reviewer Sales does not.
- **T9** — Resolve sets `resolved:true, resolvedBy, resolvedAt`; persists across reload.
- **T10** — Approving the project sweeps **all** unresolved flagged rows across **all panels** → resolved.
- **T11** — A resolved row is excluded by `_isUnresolvedTechReviewRow` / `_hasUnresolvedTechReview`.
- **T12** — Manual re-check of a resolved row re-arms it (`resolved:false`) — sets up the P3 re-block.

---

## 4. PHASE 3 — Hard gate (ships WITH or AFTER P2 — R2)

### 4.1 Extend `findIncompleteQuoteItems` — `src/app.jsx:15900`
Inside the per-panel loop (after the existing per-row price/verify checks), add:
```js
const _trUnresolved = (pan.bom||[]).filter(_isUnresolvedTechReviewRow);
if(_trUnresolved.length){
  issues.push({
    panelName: pan.name||`Panel ${pi+1}`,
    partNumber: "(Technical Review)",
    description: `${_trUnresolved.length} line(s) require Technical Review sign-off`,
    missing: ["Technical Review sign-off"],
    isTechReviewBlock: true,
    count: _trUnresolved.length,
  });
}
```
This makes `_sendBlocked` (`findIncompleteQuoteItems(project).length>0`) true across all **6** consuming surfaces automatically (32876, 33537, 35847, 37540/42, 38536) — zero new call sites (Q2 Option A).

### 4.2 Distinct block message — `formatIncompleteQuoteAlert` (`src/app.jsx:15950`)
It already splits `isVerificationBlock` from pricing. Add a third split for `isTechReviewBlock` with the required wording (Analyst Q2/R2):
> *"N line(s) require Technical Review sign-off before this quote can be sent. Click 'Send for Technical Review', or have an engineer resolve the flagged lines."*

Also verify the ProjectView send-block **banner** (`~35855`, driven by `_incompleteItems`) renders the tech-review reason (add a branch mirroring `_hasVerify`).

### 4.3 P3 test criteria
- **T13** — Quote with ≥1 unresolved supplier flag → **Send blocked on all surfaces**: modal send (32876/33537), inline send (38536), print (37540/42), Generate-PDF (36353).
- **T14** — Block message names **Technical Review** specifically (not generic "incomplete items").
- **T15** — Resolving all flags (per-row **or** approve-sweep) re-enables Send.
- **T16** — Quote with **no** flags: Send behaves exactly as today (no regression).
- **T17** — `preReviewStatus` gate and the tech-review gate compose independently (a project can be blocked by either or both; clearing one does not clear the other).

---

## 5. Pre-build completeness gate (run before merge)

1. **`grep -n "findIncompleteQuoteItems(" src/app.jsx`** → confirm exactly the 6 known call sites; if a 7th exists, it inherits the block (good) — just verify.
2. **`grep -n "isCrossed:true" src/app.jsx`** → confirm the supplier row-cross site is still only `38841`; the others (`10848`, `24000`, `26635`) are learning-DB/manual and must **NOT** get the supplier auto-stamp.
3. **`grep -n 'preReviewStatus:"approved"' src/app.jsx`** → confirm `34271` is the only approve write (single sweep site).
4. Confirm `_isTechReviewer` behavior matches the pre-existing 26308/37030 expression (no reviewer-scope drift).

---

## 6. Data-retention & sequencing notes

- **Additive fields, no `APP_SCHEMA_VERSION` bump** (Coach Q4). Preserved on save mechanically; add to CLAUDE.md preserved-metadata list (Coach applies).
- **Reconciliation:** flag rides the `isCrossed` lifecycle (Coach Q5) — survives unchanged/qty/rejected, drops on `pn_changed`-accept. No `NO_CARRY` change.
- **R2 (hard constraint):** **P3 must not merge before P2.** P1 may ship independently (inert). Recommended: P1 → P2 → P3, or P2+P3 together after P1.
- Scope: **`src/app.jsx` only.** No `functions/` change, no Functions deploy. Test on `matrix-arc-test` target + scratch projects (per the #163 test-channel precedent).

**Est.:** ~95–120 lines across P1–P3 (P1 ~45, P2 ~35, P3 ~25). Low-medium risk; the money-path gate (P3) is the sensitive part — its 6-surface coverage is the key verification.

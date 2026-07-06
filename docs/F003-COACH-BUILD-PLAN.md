# F003 — Role-Differentiated Tech Review — COACH BUILD PLAN

**Author:** Sam Wize (Coach)
**Date:** 2026-07-06
**For:** Freddy (Analyst Review) → Jon (build-approval) → Marc (build)
**Traced against tip:** `1df7c315` (`src/app.jsx` unchanged since the F002-Rev1 build `c8cbbca7`; all line numbers current). Companion: `docs/F003-COACH-FEASIBILITY.md`.
**Design:** LOCKED — ruled set **1a / 2b / 3b / 4a / 5a / 6b / keep / none** (Brief §7).
**Scope:** all edits in `src/app.jsx`. No `functions/` change, no Firestore schema change. **Absorbs F002 C6/C7/C8** (F002 §11/§12 no longer built piecemeal). **HOLD — no build until Jon's approval.**

---

## 0. Summary of edits (7 sites)
| # | Edit | Site | Ruling |
|---|---|---|---|
| 1 | New helper `_isReviewSignoffAuthority(project)` | near 15880 | 3b + 4a |
| 2 | Role-mutual-exclusivity branch: engineer circle XOR user checkbox | 29069–29079 | 3b/4a/5a/C6 |
| 3 | Q2b — lock user checkbox during `pending` | `_trDisabled`, 28998 | 2b |
| 4 | C8 — yellow rowBg override (visual-only) | 28967 | C8 |
| 5 | Approve gate: disable while unresolved + REMOVE sweep | 34394–34416 | 6b |
| 6 | Reject/Return — **no change** (stays free) | 34421–34431 | 6b |
| 7 | `data-tour` anchors on both controls | 29069–29079 | F001 |

---

## 1. Helper `_isReviewSignoffAuthority` (near line 15880, beside `_isTechReviewer`)
Encodes **3b** (assigned engineer OR admin — NOT generic reviewer-perm) **AND 4a** (only while out for review):
```js
// F003 — who sees the engineer's green sign-off circle: the assigned engineer OR an admin,
// and ONLY while the project is actively out for Technical Review (preReviewStatus==="pending").
// Deliberately EXCLUDES generic hasPermission("reviewer") (3b) and all non-"pending" states (4a),
// which is what fixes the old C7 over-exposure. Everyone else falls to the user checkbox.
function _isReviewSignoffAuthority(project){
  if(!project||project.preReviewStatus!=="pending")return false;
  if(_appCtx.role==="admin")return true;
  return project.preReviewAssignedTo
    ? project.preReviewAssignedTo===_appCtx.uid
    : project.bcDesignerUid===_appCtx.uid;   // same assignee-fallback as _isTechReviewer (15882-15884)
}
```
Add `window._isReviewSignoffAuthority=_isReviewSignoffAuthority;` if the neighboring helpers are window-exposed (match local convention).

## 2. Role-mutual-exclusivity branch (lines 29069–29079) — the core change
**Replace** the current two independent blocks — the user checkbox (29069–29074, incl. the C6 label span at 29072) **and** the Resolve ✓ button (29075–29079) — with a single role-branched control. The predicates `_trShow` (28994), `_trFlagged` (28986), `_trResolved` (28988), `_trUnresolved` (~29011 local), `_trDisabled` (28998), `_trTitle` (28999), and the handlers `_onTrToggle`/`_onTrResolve` are all already computed above and are **reused unchanged**.

```jsx
{_trShow&&(()=>{
  // F003: role-mutual-exclusivity — engineer-in-review sees ONLY the green circle; everyone else ONLY the checkbox.
  if(_isReviewSignoffAuthority(project)){
    // ENGINEER (assignee/admin) during `pending`: green sign-off circle, flagged rows only.
    if(!_trFlagged)return null;                       // nothing to sign off on unflagged rows
    return(
      <button data-tour="bom-tr-engineer-circle"
        title={_trUnresolved?"Sign off — engineer approval for this Technical Review line":"Signed off"}
        onClick={_trUnresolved?_onTrResolve:undefined} disabled={!_trUnresolved}
        style={{background:_trResolved?"#052e16":"transparent",border:"1px solid #4ade80",
          color:"#4ade80",cursor:_trUnresolved?"pointer":"default",fontSize:9,fontWeight:800,
          borderRadius:"50%",width:20,height:20,lineHeight:1,display:"inline-flex",
          alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>
        {_trResolved?"✓":""}
      </button>
    );
  }
  // USER (Sales / non-assignee / any non-`pending` state): checkbox only. C6 = no "TR"/"TR✓" text.
  if(_trFlagged||!readOnly)return(
    <label data-tour="bom-tr-user-checkbox" title={_trTitle}
      style={{display:"inline-flex",alignItems:"center",gap:2,cursor:_trDisabled?"default":"pointer",flexShrink:0,opacity:_trFlagged?1:0.5}}>
      <input type="checkbox" checked={_trFlagged} disabled={_trDisabled} onChange={_onTrToggle}
        style={{width:12,height:12,margin:0,accentColor:"#f59e0b",cursor:_trDisabled?"default":"pointer"}} />
    </label>
  );
  return null;
})()}
```
**Notes:**
- **C6** is satisfied here — the old label span (29072) is simply not carried over (no "TR"/"TR✓" text in either branch).
- **5a** — the green circle reuses `_onTrResolve` (audit stamp intact); empty when `_trUnresolved`, "✓" + filled bg when `_trResolved`, non-clickable once resolved.
- Engineer view shows circles **only on flagged rows**; during `pending` the engineer has no checkbox (can't add flags) — consistent with 2b (flags locked during review).
- Everyone else (Sales, non-assigned reviewers, and ALL viewers when not `pending`) sees the checkbox → this is the **4a** view-switch and the **C7** over-exposure fix in one branch.

## 3. Q2b — lock the user checkbox during `pending` (line 28998, `_trDisabled`)
Add one term so the checkbox is read-only once the project is out for review:
```js
// before:
const _trDisabled=readOnly||_baseLockedInEco||_trResolved||(_trFlagged&&_trSupplier);
// after (2b — engineer owns resolution during review; Sales can still SEE flags, not change them):
const _trDisabled=readOnly||_baseLockedInEco||_trResolved||(_trFlagged&&_trSupplier)||project.preReviewStatus==="pending";
```
(The engineer/admin don't hit this — they render the circle, not the checkbox. This only freezes the checkbox for non-authority viewers during `pending`. Q1 supplier-flag lock is already covered by the existing `_trFlagged&&_trSupplier` term — no change to the auto-stamp at 38991.)

## 4. C8 — yellow rowBg override, visual-only (line 28967)
Insert one term **immediately before the `_isBomRowFlaggedRed` term** (identical to F002 §11.2), using the **module** predicate `_isUnresolvedTechReviewRow` (line 15872) — **not** the local `_trUnresolved`, which is defined *after* line 28967 (TDZ hazard):
```js
const rowBg=bcUpdatedRows.has(String(row.id))?undefined:row.isLaborRow?"#0a1628":_ecoTint?_ecoTint:row.restoreSkipped?"#78350f22":_isUnresolvedTechReviewRow(row)?"rgba(245,158,11,0.28)":_isBomRowFlaggedRed(row,project.bcCustomerNumber,project.bcCustomerName)?"rgba(255,40,40,0.35)":i%2===0?"transparent":"rgba(255,255,255,0.10)";
```
Yellow token `rgba(245,158,11,0.28)` = the TR-accent amber (`#f59e0b`); alpha is a live-verify tuning knob. Precedence: bcUpdated → labor → ECO tint → restoreSkipped → **TR-yellow** → red → zebra. **Visual-only** — `_isBomRowFlaggedRed` and every predicate consumer unchanged (see §7). Auto-reverts on sign-off: once `techReviewResolved`, the predicate is false → falls through to red (if still unpriced) or zebra.

## 5. Q6b — approve gate + REMOVE the sweep (lines 34394–34416)
**(a) Disable Approve while any row is unresolved.** The button at line 34394 currently reads `disabled={ownerPriorityActive}`. Change to reuse the existing `_hasUnresolvedTechReview` helper (15873) and add a reason tooltip with a count. Just before the button (or inline), compute:
```js
const _trOpen=(project.panels||[]).reduce((n,p)=>n+(p.bom||[]).filter(_isUnresolvedTechReviewRow).length,0);
```
Then:
```jsx
<button disabled={ownerPriorityActive||_trOpen>0}
  title={ownerPriorityActive?_OWNER_PRIORITY_TOOLTIP:_trOpen>0?`Resolve ${_trOpen} flagged line${_trOpen>1?"s":""} (green circles) before approving`:""}
  onClick={ownerPriorityActive?_fireOwnerPriorityAlert:async()=>{ ... }}
  style={{...,opacity:(ownerPriorityActive||_trOpen>0)?0.45:1,cursor:(ownerPriorityActive||_trOpen>0)?"not-allowed":"pointer"}}>✓ Approve</button>
```

**(b) Remove the approve-sweep from the onClick body.** Delete the sweep compute + swept-panel save; keep `reviewFields`, the Firestore update, and the post-approve quote_ready stamp. Concretely:
- **Delete lines 34402–34407** (`_trNow`, `_trSweptPanels`, `_trChangedPanels`).
- **Change 34408** `onUpdate({...project,...reviewFields,panels:_trSweptPanels});` → `onUpdate({...project,...reviewFields});`
- **Simplify 34410–34411:** drop `let _trApproveOk=false;` and the `_trApproveOk=true;`; the try becomes `try{await fbDb.collection(_prjPath).doc(project.id).update(reviewFields);}`.
- **Delete lines 34413–34416** (the MED-2 comment + `if(_trApproveOk){for(const _p of _trChangedPanels){…saveProjectPanel…}}`).
- **Keep 34417–34419** (the `bcUploadRef.current({stampMode:"quote_ready"…})` — unrelated to the sweep).

Resulting onClick (approx):
```js
async()=>{
  const reviewFields={preReviewStatus:"approved",preReviewApprovedAt:Date.now(),preReviewApprovedBy:fbAuth.currentUser?.displayName||"Designer",preReviewChangeLog:[],reviewChangeLog:[],reviewRevBumpedThisCycle:false,updatedAt:Date.now(),updatedBy:uid};
  _logQvHistory(project.id,{type:"review_approve"});
  delete _pendingPreReviewOverrides[project.id];
  onUpdate({...project,...reviewFields});
  const _prjPath=_appCtx.projectsPath||`users/${uid}/projects`;
  try{await fbDb.collection(_prjPath).doc(project.id).update(reviewFields);}
  catch(e){console.error("Pre-review approve save failed:",e);onUpdate({...project});}
  if(bcUploadRef?.current){try{await bcUploadRef.current({stampMode:"quote_ready",archiveOld:true});}catch(e){console.warn("QUOTE READY stamp upload failed:",e);}}
}
```

## 6. Reject/Return (lines 34421–34431) — NO CHANGE (6b)
Return stays free — the engineer can send back to Sales regardless of unresolved rows. Leave as-is.

## 7. ★ MEDIUM-RISK DEPENDENCY — sweep removal is SAFE (check performed, documented)
Freddy's flagged risk: does anything key off the removed sweep's persist side-effect (`saveProjectPanel` at 34416) — i.e. assume "approved ⇒ all TR rows resolved in Firestore" beyond what per-row `_onTrResolve` already saves?

**Check performed (grep at tip 1df7c315):**
1. **`preReviewStatus:"approved"` is written in exactly ONE place** — the Approve button (34396). No auto-approve, no alternate path. → Gating that one button (§5a) fully controls entry to the approved state. ✅
2. **No consumer reads `preReviewStatus==="approved"` and assumes rows are resolved.** The only other read (line 35334) clears pre-review fields on re-edit — it does not depend on TR-resolution state. ✅
3. **Every `techReviewResolved` read flows through the shared predicate** `_isUnresolvedTechReviewRow` (15872) → `_hasUnresolvedTechReview` (15873) / the send-gate. No code reads the raw field expecting the sweep to have set it. ✅
4. **The send-gate reads the LIVE flag,** independent of approval status — so it never assumed "approved cleared everything." ✅
5. **Persistence is preserved:** each `_onTrResolve` saves its panel via `onSaveImmediate` (29030); by the time `_trOpen===0` (Approve unlocks), Firestore already reflects every sign-off. The sweep's `saveProjectPanel` (34416) was therefore **redundant** to per-row saves.

**Conclusion:** removing the sweep is safe. The invariant "an approved project has all TR rows resolved in Firestore" is **preserved** — enforced by the §5a gate + per-row `_onTrResolve` saves instead of the blanket sweep. The old #199 MED-2 concern ("partial write leaves resolved flags on a not-approved project") **cannot occur** because approval no longer writes resolution at all — resolution happens per-row, before approval is even possible. No orphaned consumer.

## 8. `data-tour` anchors (F001)
Added in §2: `data-tour="bom-tr-user-checkbox"` (user checkbox) and `data-tour="bom-tr-engineer-circle"` (engineer circle). Confirm the exact anchor names with the F001 walkthrough author.

## 9. Invariants (Brief §4)
| # | Invariant | Status |
|---|---|---|
| 1 | Data retention (5 TR fields, audit stamp) | ✅ same fields/handlers; `_onTrResolve` keeps `resolvedBy/At`. No schema change. |
| 2 | #199 hard send-gate (7 surfaces) | ✅ unchanged — reads `techReviewResolved`, still stamped by the circle (Q7/keep). |
| 3 | C8 yellow = visual-only | ✅ `_isBomRowFlaggedRed` + RFQ/logic predicates untouched (§4). |
| 4 | Pre-review flow intact | ✅ `preReviewStatus`/assignee/Send-for-Review unchanged; only the approve resolution model changes (sweep→gate), verified safe (§7). |
| 5 | No cross-user clobber | ✅ role branch selects WHICH control renders; both write via the existing `latestPanelRef`+`onSaveImmediate` guarded path. |

## 10. Test criteria (matrix-arc-test)
1. **User view (non-engineer / not pending):** flagged row shows a bare amber checkbox (no "TR" text), row yellow; unflagged shows faint checkbox.
2. **Check → yellow:** user checks a row → row turns yellow (`rgba(245,158,11,0.28)`); uncheck → reverts (when not pending).
3. **Q2b lock:** once "Send for Technical Review" (`pending`), the user checkbox is disabled (can't check/uncheck); flags still visible + yellow.
4. **Engineer view (assignee/admin, `pending`):** NO checkbox; flagged rows show an empty green circle; non-flagged rows show nothing.
5. **Sign-off:** engineer clicks the empty circle → row reverts (yellow gone), circle shows "✓" (disabled). Audit stamp (`resolvedBy/At`) written.
6. **Q6b approve gate:** Approve disabled while any unresolved row exists, tooltip shows the count; resolve all → Approve enables. **Reject/Return always enabled.**
7. **No sweep:** approving does NOT blanket-resolve — every row was signed off individually first (verify Firestore shows per-row `resolvedBy`).
8. **Send-gate (no regression):** an unaddressed yellow row still hard-blocks all 7 send surfaces.
9. **Backward-compat (PRJ402111 row 8, `800H-AR6A`, flagged+unresolved):** renders yellow; user sees checked checkbox; engineer (if pending+assignee) sees empty green circle → sign off works.
10. **Role boundary (3b):** a non-assigned reviewer-perm user sees the checkbox (not the circle); admin sees the circle during `pending`.
11. `node validate_jsx.js` clean.

## 11. Lift / sequence / HOLD
~30–50 net LOC (matches feasibility §4). Build order: helper (§1) → row-branch (§2) → `_trDisabled` (§3) → rowBg (§4) → approve gate + sweep removal (§5) → data-tour (§8) → `validate_jsx.js`. Then live re-verify (both role views, gate, send-gate, PRJ402111 row 8) → Coach review → **Jon deploy checkpoint** (Jon decides F003-alone vs bundle-with-banked-F002-Rev1). **HOLDING — no build until Jon's build-approval.**

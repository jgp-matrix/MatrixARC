# #160 Reconciliation Modal: Reject/Keep-Prior for Changed Rows

**Coach (C105) — 2026-06-17**
**Type:** Scoping read + fix plan
**Status:** SCOPED — ready for implementation

---

## Problem

The ReconciliationModal's Changed section offers ONLY "Accept" (take the new
extraction's value). There is no way to reject a change and keep the prior row.
Jon needs per-row adjudication — especially for crossed rows where the prior
contains his deliberate substitution + pricing.

**Current action buttons by section:**

| Section | Actions | Gap? |
|---------|---------|------|
| Changed | Accept only | **YES — no Reject** |
| New | Accept / Reject | No |
| Deleted | Delete / Keep | No |
| Unchanged | auto-carried | No |

---

## Current Implementation (what exists)

### Resolution framework (lines 23099-23117)

The modal tracks resolutions in a `Map<string, string>`:
- Keys: `"changed:0"`, `"added:1"`, `"deleted:2"`, etc.
- Values: `"accepted"`, `"rejected"`, `"deleted"`, `"kept"`

The `unresolved` count (line 23110-23116) already gates commit on changed rows:
```javascript
matchResult.changed.forEach((_,i) => {
  if (!resolutions.get(`changed:${i}`)) n++;  // ← unresolved if NO value set
});
```

So the framework already requires changed rows to be resolved. Both `"accepted"`
and `"rejected"` would satisfy the gate. **No gating changes needed.**

### Changed row render (line 23163-23165)

```jsx
actions={<>
  <span>{m.reason==="pn_changed" ? "PN changed" : "qty"}</span>
  <button onClick={() => setRes(`changed:${i}`, "accepted")}>Accept</button>
</>}
```

Only one button. No reject option.

### Changed row in buildReconciledBom (line 47422)

```javascript
(matchResult.changed||[]).forEach((m,i) => {
  if (resolutions.get(`changed:${i}`) === "accepted")
    changedMerged.push(m.reason==="pn_changed"
      ? carryChangedPnChanged(m.prior, m.extracted)
      : carryChangedPnSame(m.prior, m.extracted));
});
```

Only handles `"accepted"`. Any other resolution value → row is **silently dropped**
from the output BOM. This is the critical bug: if we add a Reject button without
fixing this, rejected changed rows would vanish.

### Accept All (line 23119-23125)

Sets all changed to `"accepted"` and all added to `"accepted"`. Deletions excluded
(resolved individually per Brief).

### Carry-forward functions

| Function | When used | Preserves cross? | Updates position? |
|----------|-----------|-------------------|-------------------|
| `carryUnchanged` | Unchanged rows | YES (`{...prior}`) | YES (from ext) |
| `carryChangedPnSame` | Qty change, accepted | YES (extends carryUnchanged) | YES |
| `carryChangedPnChanged` | PN change, accepted | NO (strips all) | YES |
| *(none)* | Rejected change | — | — |

---

## Fix Plan

### Change 1: Add Reject button to changed rows (~2 lines)

**Location:** Line 23165 (changed row actions)

**Current:**
```jsx
actions={<>
  <span style={{fontSize:10,color:C.yellow,marginRight:6}}>{...}</span>
  <button style={btn("#16a34a",r==="accepted")} onClick={()=>setRes(`changed:${i}`,"accepted")}>
    {r==="accepted"?"✓ Accepted":"Accept"}
  </button>
</>}
```

**Fixed:**
```jsx
actions={<>
  <span style={{fontSize:10,color:C.yellow,marginRight:6}}>{...}</span>
  <button style={btn("#16a34a",r==="accepted")} onClick={()=>setRes(`changed:${i}`,"accepted")}>
    {r==="accepted"?"✓ Accepted":"Accept"}
  </button>
  <button style={btn("#dc2626",r==="rejected")} onClick={()=>setRes(`changed:${i}`,"rejected")}>
    {r==="rejected"?"✕ Keep Prior":"Reject"}
  </button>
</>}
```

Button style reuses the existing `btn()` helper with `#dc2626` (red), matching the
Reject button on New rows and the Delete button on Deleted rows.

**Display when rejected:** Button shows "✕ Keep Prior" (toggled state). Add a small
indicator after the buttons:
```jsx
{r==="rejected"&&<span style={{fontSize:10,color:C.muted,marginLeft:4}}>
  kept prior — differs from revision
</span>}
```

### Change 2: Handle rejected resolution in buildReconciledBom (~2 lines)

**Location:** Line 47422

**Current:**
```javascript
(matchResult.changed||[]).forEach((m,i) => {
  if (resolutions.get(`changed:${i}`) === "accepted")
    changedMerged.push(m.reason==="pn_changed"
      ? carryChangedPnChanged(m.prior, m.extracted)
      : carryChangedPnSame(m.prior, m.extracted));
});
```

**Fixed:**
```javascript
(matchResult.changed||[]).forEach((m,i) => {
  const res = resolutions.get(`changed:${i}`);
  if (res === "accepted")
    changedMerged.push(m.reason==="pn_changed"
      ? carryChangedPnChanged(m.prior, m.extracted)
      : carryChangedPnSame(m.prior, m.extracted));
  else if (res === "rejected")
    changedMerged.push({...m.prior});
});
```

**Reject semantics:** `{...m.prior}` — shallow copy of the prior row, exactly as-is.
No position update, no qty update, no field changes. All crosses, pricing, BC data,
user edits preserved intact. Jon's confirmed intent: "keep the prior row EXACTLY
AS-IS."

**Why no position update for rejects:** For `pn_changed` rejects, the extraction's
position corresponds to the NEW PN's location on the drawing — not the prior PN's.
Updating position would map the prior row to the wrong location. For `qty` rejects,
the position IS correct (same PN), but the simplicity of "exactly as-is" outweighs
the minor position-accuracy gain. Consistent behavior regardless of change reason.

### Change 3: Update Accept All label (~1 line)

**Location:** Line 23189

No behavior change needed — Accept All already only sets `"accepted"`, which the
user can override individually to `"rejected"`. But update the button label for
clarity:

**Current:** `Accept All (Changed + New)`
**Fixed:** `Accept All (Changed + New)` — keep as-is. The label is accurate: it
accepts all, and the user can switch individual rows to Reject after. No change.

### Change 4: Update footer gating text (~1 line)

**Location:** Line 23190

**Current:** `${unresolved} unresolved — resolve all to commit (deletions individually)`
**Fixed:** `${unresolved} unresolved — resolve all to commit`

Remove "(deletions individually)" — with reject available on changed rows, the
parenthetical is no longer the only exception to Accept All. The text is cleaner
without it.

---

## Sizing

| Change | Lines | Risk |
|--------|-------|------|
| Reject button + indicator | ~3 | Trivial — mirrors existing New/Deleted buttons |
| buildReconciledBom reject handling | ~2 | Low — adds one else-if branch |
| Footer text cleanup | ~1 | Trivial |
| **Total** | **~6** | **Very low** |

No new functions. No data model changes. No changes to `reconcileBom`. No changes
to the resolution gating logic (`unresolved` counter already counts unresolved
changed rows). Fully contained within `ReconciliationModal` + `buildReconciledBom`.

---

## Behavior Matrix (after fix)

### Accept a qty change
```
Prior:  PN=ABC  qty=5  isCrossed=true  pricing=✓
Ext:    PN=ABC  qty=8
Action: Accept → carryChangedPnSame
Result: PN=ABC  qty=8  isCrossed=true  pricing=✓  positions updated
```

### Reject a qty change
```
Prior:  PN=ABC  qty=5  isCrossed=true  pricing=✓
Ext:    PN=ABC  qty=8
Action: Reject → {...prior}
Result: PN=ABC  qty=5  isCrossed=true  pricing=✓  (exactly as-is)
Display: "✕ Keep Prior · kept prior — differs from revision"
```

### Accept a PN change
```
Prior:  PN=CROSSED-REPL  crossedFrom=XYZ  isCrossed=true  pricing=✓
Ext:    PN=DEF-NEW
Action: Accept → carryChangedPnChanged
Result: PN=DEF-NEW  (no cross, no pricing — fresh identity)
```

### Reject a PN change
```
Prior:  PN=CROSSED-REPL  crossedFrom=XYZ  isCrossed=true  pricing=✓
Ext:    PN=DEF-NEW
Action: Reject → {...prior}
Result: PN=CROSSED-REPL  crossedFrom=XYZ  isCrossed=true  pricing=✓  (exactly as-is)
Display: "✕ Keep Prior · kept prior — differs from revision"
```

---

## Test Criteria

### T1 — Reject button visible on changed rows
Changed section shows both Accept and Reject buttons. Clicking toggles state.

### T2 — Reject preserves prior exactly
Reject a qty-changed row → commit → verify prior qty, PN, cross, pricing all intact.

### T3 — Reject preserves crossed prior on PN change
Reject a pn_changed row → commit → verify crossedFrom, isCrossed, partNumber
(replacement), pricing all intact.

### T4 — Accept still works as before
Accept a changed row → commit → verify new qty/PN applied per existing behavior.

### T5 — Mixed Accept/Reject
Accept some changed rows, reject others → commit → verify each row got the correct
treatment.

### T6 — Gating requires resolution
Leave a changed row unresolved (no Accept or Reject clicked) → Commit button
should remain disabled. Click either → commit enables.

### T7 — Accept All then individual Reject
Click "Accept All" → all changed rows show "✓ Accepted". Click Reject on one →
it switches to "✕ Keep Prior". Commit → that row uses prior, others use accepted.

### T8 — "differs from revision" indicator
After rejecting, the row shows "kept prior — differs from revision" text so the
user knows this row deliberately diverges from the drawing.

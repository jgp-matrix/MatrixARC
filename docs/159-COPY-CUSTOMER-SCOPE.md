# #159 Copy-to-New-Quote: Add Customer Selection

**Coach (C104) — 2026-06-17**
**Type:** Scoping read + fix plan
**Status:** SCOPED — ready for implementation

---

## Problem

The Copy-to-New-Quote modal creates projects with no customer and no PRJ#. Customer
is assignable ONLY at creation — there is no post-creation way to change or add it.
Copies are permanently stranded: no customer, no PRJ#, no BC Job card.

---

## Current State

### CopyProjectModal (line 43622)
- Single field: project name (pre-filled with "Source Name (Copy)")
- Calls `copyProject()` (line 10356) which:
  - Assigns a fresh quote number via `getNextQuoteNumber()` (MTX-Q format)
  - Flattens ECOs into base BOM
  - Clones panels with fresh IDs, copies page images
  - Creates Firestore doc with NO BC fields (customer, PRJ#, etc.)
- Info text at line 43741: "No BC linkage, no customer data, no purchasing state"
- No BC connection required to copy

### NewProjectModal (line 41375)
- Fields: name, panel count, **customer picker**, contact, salesperson, PM, designer
- Customer picker: text input + dropdown, searches BC customers via `bcLoadAllCustomers()`
  (line 4041), filtered by `bcFilterCustomers()` (line 4111)
- On submit: calls `bcCreateProject(name, customerNumber)` (line 3984) which:
  - Creates BC Job card → returns `{id, number, displayName, customerNumber}`
  - PATCHes defaults: `Bill_to_Customer_No`, `Location_Code`, `Status: "Quote"`, etc.
- Creates `bcCreatePanelTaskStructure()` for panel task lines
- Stores on project: `bcProjectId`, `bcProjectNumber`, `bcEnv`, `bcCustomerNumber`,
  `bcCustomerName`, `bcSalesperson*`, `bcProjectManager*`, `bcDesigner*`, `bcContact*`

---

## Tension Resolution

**Q: Can a BC customer be assigned WITHOUT full BC-project linkage?**

**A: No — and that's fine.** `bcCreateProject()` creates a BC Job card, which IS the
mechanism that assigns the customer and generates the PRJ#. They're inseparable:
customer assignment = BC Job creation = PRJ# generation.

But this is NOT "BC linkage" in the copy modal's original sense. The original intent
was "don't carry over the source's BC purchasing state" — `bomSyncHash`, vendor
assignments, pricing sources, BC item matches. That intent is fully preserved:

| What the copy GETS (new) | What the copy does NOT get (source carry-over) |
|--------------------------|-----------------------------------------------|
| Fresh BC Job card (own PRJ#) | Source's `bomSyncHash` |
| Customer assignment | Source's vendor assignments |
| Fresh quote number | Source's pricing sources/dates |
| Panel task structure | Source's BC item browser matches |

The copy creates its OWN BC identity. No source purchasing state crosses over.

**Update the info text** from "No BC linkage, no customer data" to something like
"Fresh BC project — no purchasing state carried from source."

---

## Fix Plan

### Change 1: Customer picker in CopyProjectModal (~35 lines)

Add state and UI for customer selection in the `preview` phase:

```
State:
  allCustomers, customerQuery, selectedCustomer, showCustomerDropdown

On mount:
  bcLoadAllCustomers() → setAllCustomers  (same call NewProjectModal uses)
  Pre-fill selectedCustomer from source project:
    if (project.bcCustomerNumber && project.bcCustomerName)
      setSelectedCustomer({number: project.bcCustomerNumber, displayName: project.bcCustomerName})
      setCustomerQuery(project.bcCustomerName)

UI (insert after the name input, line 43730):
  - Label: "Customer (from Business Central)"
  - Text input with value=customerQuery, onChange filters allCustomers
  - Dropdown list (max 25, same as NewProjectModal)
  - Green checkmark when selected
  - Pre-filled = source customer (editable — copy time is the only chance)
```

Reuses existing functions: `bcLoadAllCustomers()` (line 4041),
`bcFilterCustomers()` (line 4111). No new BC API code needed.

### Change 2: BC project creation in startCopy (~25 lines)

After `copyProject()` returns, create BC identity for the copy:

```javascript
// In startCopy(), after line 43676 (copyProject returns newProj):
if (selectedCustomer && _bcToken) {
  setProgress({step: "bc", msg: "Creating BC project…", pct: 90});
  const bc = await bcCreateProject(name.trim(), selectedCustomer.number);
  // Store BC fields on the new project
  const projPath = _appCtx.projectsPath || ("users/" + uid + "/projects");
  await fbDb.doc(projPath + "/" + newProj.id).update({
    bcProjectId: bc.id,
    bcProjectNumber: bc.number,
    bcEnv: _bcConfig.env,
    bcCustomerNumber: bc.customerNumber,
    bcCustomerName: bc.customerName || selectedCustomer.displayName,
  });
  newProj.bcProjectNumber = bc.number;
  newProj.bcCustomerNumber = bc.customerNumber;
  newProj.bcCustomerName = bc.customerName || selectedCustomer.displayName;
  // Panel task structure (optional — same as NewProjectModal)
  try {
    await bcCreatePanelTaskStructure(bc.number, name.trim(), newProj.panels || []);
  } catch (e) { console.warn("Copy: BC task structure failed:", e.message); }
}
```

### Change 3: Progress steps update (~3 lines)

Add a "BC project" step to the STEPS array (line 43654):
```javascript
{key: "bc", label: "BC project created"}
```

Insert between "images" and "done".

### Change 4: BC token check (~5 lines)

Before starting the copy, ensure BC is connected (same pattern as NewProjectModal
line 41530):
```javascript
if (selectedCustomer && !_bcToken) {
  await acquireBcToken(true);
  if (!_bcToken) { setError("Could not connect to Business Central."); return; }
}
```

### Change 5: Update info text (line 43741)

From: "No BC linkage, no customer data, no purchasing state."
To: "Fresh BC project with own PRJ#. No purchasing state carried from source."

---

## Sizing

| Change | Lines | Risk |
|--------|-------|------|
| Customer picker UI | ~35 | Low — reuses existing components |
| BC project creation | ~25 | Low — same `bcCreateProject` call |
| Progress steps | ~3 | Trivial |
| BC token check | ~5 | Low — same pattern as New Project |
| Info text | ~1 | Trivial |
| **Total** | **~70** | **Low** |

All BC functions (`bcLoadAllCustomers`, `bcFilterCustomers`, `bcCreateProject`,
`bcCreatePanelTaskStructure`) already exist and are proven in `NewProjectModal`.
No new API calls, no new Firestore collections, no schema changes.

---

## Decision Point for Jon

**Should the customer field be REQUIRED on Copy?**

- If YES: disable "Copy to New Quote" button when no customer selected (same as New
  Project, which requires customer at line 41527). Prevents future stranded copies.
- If NO: allow copy without customer (current behavior preserved as fallback). Useful
  if BC is down or for quick drafts.

**Recommendation:** Required when BC is connected, allowed-without when BC is down
(graceful degradation). Show a warning if no customer: "Copy will have no PRJ# — 
customer cannot be added after creation."

---

## Future Enhancement (flagged, not this fix)

**Post-creation customer reassignment** — Allow changing a project's customer after
creation. Would require: finding/creating new BC Job card, migrating BOM sync
references, updating PRJ# on all downstream docs. Medium-large scope. The copy-modal
fix eliminates the most common trigger (copies stranded without customer) but the
broader limitation remains for projects created without a customer by any path.

---

## Test Criteria

### T1 — Customer pre-fill from source
Open Copy modal on a project with a customer. Customer picker should show the source
customer pre-filled and selected.

### T2 — Customer editable
Clear the pre-filled customer, search for a different one, select it. The copy should
use the newly selected customer.

### T3 — PRJ# generated
After copy completes, the new project should have a PRJ# visible in the project list
and project header.

### T4 — BC Job card created
Verify in BC that a new Job card exists with the correct customer, PRJ#, and panel
task structure.

### T5 — No source carry-over
The copied project should have NO `bomSyncHash`, no source-pricing dates, no vendor
assignments from the source. Fresh BC identity only.

### T6 — Source project unchanged
Verify the source project's customer, PRJ#, and all data are untouched.

### T7 — BC disconnected graceful
If BC is unavailable, the copy should either show an error (if customer required) or
allow copy without customer with a warning (if optional).

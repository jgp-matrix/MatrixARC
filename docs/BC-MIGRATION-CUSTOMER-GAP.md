# BC-Sandbox Migration — Customer Data Gap (2026-07-28 night)

## Symptom
Re-linking **PRJ402142** hard-failed:
```
Failed: OData ProjectCard PATCH failed (400):
Internal_InvalidTableRelation — The field Bill-to Customer No. of table Project contains a value
(C10128) that cannot be found in the related table (Customer).
```

## Root cause
The new sandbox `MATR_SndBx_UAT_070926` was seeded with only **29 customers** (verified via the v2.0
`/customers` endpoint). Customer **`C10128`** (PRJ402142's Bill-to customer) is **not** among them.

`bcCreateProject` (src/app.jsx) Step 2 sets the customer in a **combined** ProjectCard OData PATCH
(`Bill_to_Customer_No` + Global_Dimension_1_Code + Location + Status + posting groups + WIP + dates).
A missing customer 400s the **whole** PATCH → the function's outer `catch` **rolls back (DELETES) the
just-created job** and rethrows. So:
- The failure is a **hard abort** (unlike the soft item-line skips) — the project does **not** link.
- Because of the rollback, **no stranded BC job** is left behind (clean — no manual delete needed).

## Scope (important)
This is **systemic, not a one-off.** With only 29 customers in the sandbox, **any project whose
Bill-to customer isn't among those 29 will hard-fail the re-link** the same way. PRJ402142 is just the
first Jon hit. (Couldn't enumerate exactly how many of the 96 are affected — the browser closed before
the read completed; a `customers`-vs-project-customer diff should be re-run when back.)

## Fixes

### Root fix (Jon / BC-admin) — RECOMMENDED
**Load the full customer list into the new sandbox** (same approach as the item list). Once every
project's Bill-to customer exists there, re-links stop hard-failing on this. This is the clean,
complete fix; ARC can't write BC customers (external financial system; harness-gated).

### Code hardening (built, NOT deployed) — branch `claude/relink-missing-customer-precheck` (`d6a2e184`)
Added a **pre-check** in `bcCreateProject` (after `compId`, before job-create): GET
`customers?$filter=number eq '<customer>'`; on a definitive miss (GET ok + 0 rows) throw an
**actionable** error *before* creating any job:
> `Customer "C10128" is not in this Business Central environment — add the customer in BC (or load the
> sandbox's customer list), then re-link. No BC project was created.`
- Replaces the cryptic `Internal_InvalidTableRelation` + rollback with a clear message, and avoids the
  doomed job-create entirely. GET errors are non-blocking (transient blip won't block a create).
- **Does not by itself unblock** a project with a missing customer — it just makes the block obvious.
  The unblock is the root fix (load customers). **In Coach review; awaiting Jon's deploy decision.**

### Optional (NOT built) — resilient "link without customer"
Alternative: on a missing customer, create the job WITHOUT the Bill-to customer (warn + flag), letting
tasks/lines sync and the customer be added later. **Untested assumption:** whether BC planning lines
can be created without a Bill-to customer (a code comment claims "BC requires customer before task
lines"). If lines DON'T require it, this maximizes throughput; if they DO, it leaves a half-state.
Needs a live test before building. Deferred for Jon's call.

## Status of the migration at this point
- Prod **v1.24.45** live with the full re-link tooling. Sales's **8 needed projects re-linked +
  verified** (626 lines, 0 renumbers) — Sales-ready.
- The customer gap affects the **remaining** on-demand re-links (post-deadline), not Sales's 8.
- ~2340 BOM rows reconciled to MTX + crate/contingency mapped; ~12 item types + the customer gap are
  the known remaining identification/data work.

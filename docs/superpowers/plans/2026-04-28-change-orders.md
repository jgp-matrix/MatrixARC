# Engineering Change Order (ECO) System — Plan

**Date:** 2026-04-28
**Status:** Draft v2 — incorporates user review decisions
**Estimated scope:** 8 deploys, 4–6 weeks of focused work

**Revision log:**
- **v2 (2026-04-28 PM):** User review decisions incorporated. Major shifts:
  - Data model — ECO scope tracked via `ecoTag` field on each BOM row, not as a separate `bomDelta` document
  - Concurrent ECO model — fully isolated, stacked +/-, no conflict resolution logic
  - Approval flow — customer approval is a checkpoint; engineer must explicitly review-and-accept before BC sync fires
  - TRAQS production-state integration — new HOLD trigger + percent-complete query hooks
  - ECO defaults — 40% margin, $65/hr labor, expediting cost (manual)
  - UI — single horizontal separator inside the BOM (original above, ECO items below)
  - Quote header for ECO context — "Engineering Change Order" replaces "QUOTE"
- **v1 (2026-04-28 AM):** Initial draft from inventory + synthesis

---

## Executive summary

After a customer PO is received, customers regularly request changes — added/removed parts, modified quantities, additional labor, delivery delays. Today, ARC has no first-class concept for these changes. The project becomes hard-locked when `wonAt` is set, and the only way to make a change is `editUnlocked: true` (a binary persistent unlock that admins/owners grant). Any edit after that point is **silently overwritten** onto the base project — there is no audit trail of what changed, no separate document for the customer to approve, no incremental pricing record, no BC traceability for what the change cost.

This plan introduces a **first-class ECO concept** that sits as an additive layer on top of the base project. Each ECO has its own number (ECO #1, #2, ...), its own BOM delta, its own labor adjustment, its own delivery impact, its own customer-approval cycle, its own BC planning lines, and its own drawing revisions. Approved ECOs roll up into the project's effective state but are preserved permanently as separate audit records.

The implementation reuses ARC's existing machinery wherever possible:
- **Lock model** — extends the `editUnlocked` carve-out pattern
- **Quote rev tracking** — new `ecoRev` per ECO doc, mirrors `quoteRev`
- **Customer review portal** — same `reviewUploads/{token}` collection, scoped per ECO
- **Drawing pipeline** — same `buildAndAttachPdf` with new `eco_*` stamp modes
- **BC sync** — additive task lines (20N30, 20N31, ... — pattern hinted at by an existing `bcAddEcoTask` stub)
- **Notifications** — same Cloud Function pattern that handles supplier-quote and customer-review submissions

The core architectural decision: **ECOs are immutable, additive layers**. Once approved, an ECO is never modified — subsequent changes go into a new ECO. The project's "current state" is computed as `base + Σ(approved ECOs) + (open ECO if any)`. This preserves a clean audit trail and avoids merging-induced data loss.

---

## Why this matters

Three concrete pain points today:

1. **Audit blindness.** A customer pays for the original quote, then asks for changes during production. Today those changes get edited into the base project. Six months later, when production asks "why does this panel have an extra contactor?", the answer is buried in `_snapshots/{ts}` (panel-level only, max 10 retained) and Firestore version history. No one can quickly say "ECO #2 added that contactor on March 15 because the customer added a feeder circuit."

2. **Cost recovery leakage.** When a customer adds scope, ARC needs to invoice for it. Without ECO tracking, it's manual: someone has to remember the change, calculate the delta cost, and write a separate invoice. With ECOs, the system computes and tracks the delta automatically.

3. **BC mismatch.** After production starts, a change should be reflected in BC's planning lines (so purchasing knows to order extra parts) and on the production traveler (so the shop floor knows what's different). Today, manual BC patches happen ad-hoc with no cross-system linkage.

The user explicitly said this is a regular occurrence ("pretty regular instances where customers require changes"), so the volume justifies the architectural investment.

---

## The problem space

An ECO is fundamentally **a scoped diff against a baseline**. The baseline is whatever the project looked like at PO time. Each ECO captures:

- **Material delta** — added/removed/modified BOM rows, per panel
- **Labor delta** — adjustment to CUT/LAYOUT/WIRE hours (or override)
- **Delivery delta** — schedule shift (later or rarely earlier)
- **Pricing delta** — net $ impact on the project total
- **Approval state** — has the customer signed off?
- **Production state** — has BC received it? Is it being purchased?
- **Document state** — drawings, customer-approval PDF, BC PDF

Conceptually it's similar to a git commit: an immutable snapshot of "what changed" relative to the parent. The project's HEAD = base + all merged commits (approved ECOs).

### Edge cases that drive the design

These edge cases shaped the design choices below:

- **Customer rejects the ECO.** The ECO doc must persist (audit), but it shouldn't affect the project total. Status: `rejected`. Visible in history.
- **Engineer cancels the ECO before sending.** Status: `cancelled`. Less rigorous than rejection (might just have been a mistake).
- **Multiple ECOs in flight.** Customer might say "ECO #1 add A, ECO #2 add B" in rapid succession. The system must handle concurrent open ECOs without conflict. Decision: **only ONE ECO can be in `draft` or `in_review` state at a time per project**. All others must be `approved`, `rejected`, or `cancelled`.
- **ECO #1 partially overlaps ECO #2.** Customer might decide ECO #1 needs further change. ECO #2 references ECO #1 as parent, but each remains separate (no rewriting history).
- **Parts already ordered.** When ECO #1 removes a part that's already in a vendor PO, ARC needs to flag this for purchasing intervention (cancel the line, return goods, etc.).
- **Drawing revs.** ECO #1 may need new drawings. The base drawings should still exist on BC; ECO #1's drawings are added with a new naming convention.
- **Production traveler.** Once an ECO is approved + BC-pushed, the next traveler print must include the ECO's parts/labor/notes.
- **Quote number reuse.** The ECO is "part of" the original quote (same MTX-Q######) but has its own ECO number. The customer signs an "ECO Quote" not a new full quote.

---

## Current state — key findings from inventory

This section summarizes the six parallel investigations. Full reports archived in this repo's task transcripts.

### State machine + locks

- **`computeProjectEffectiveStatus`** (line 9015) — single source of truth for status routing. Emits: `draft`, `in_progress`, `extracted`, `validated`, `costed`, `quoted`, `pushed_to_bc`, `rfqs`, `evc`, `pre_review`, `post_review`, `budgetary_sent`, `firm_sent`. Lifecycle is reasonably linear.
- **Lock fields**: `quoteSentAt` (soft-block), `wonAt` / `lostAt` (hard-block), `preReviewStatus` / `postReviewStatus` (review-pending hard-block, with reviewer carve-out), `editUnlocked` (persistent admin-granted unlock), `ownerLockActive` (concurrent-edit priority).
- **Carve-outs in firestore.rules** are the right pattern to copy: `isOnlyReviewStateUpdate()`, `isOnlyUnlockRequestUpdate()`. ECOs need their own carve-outs.
- **Audit trail is weak**: only `_snapshots/{ts}` (panel-level, max 10) + implicit `updatedAt`/`updatedBy`. No project-level change log.
- **Quote revision** auto-bumps via `_computeQuoteHash()` whenever BOM changes. Hash-based, no per-row delta. New ECOs need their own per-ECO hash so changes within an ECO don't pollute the base project's `quoteRev`.

### BC integration

- **`bcCreateProject` + `bcPatchJobOData`** sync project header fields. Read-only field gotcha (e.g. "Inventory Posting Group is read-only") requires per-field retry on bulk PATCH failure (already handled at line 27193).
- **No automatic BOM sync to BC**. Planning lines are created manually via `PoReceivedModal` → `bcPatchPanelEndDate`. ECO BOM additions will need a new explicit sync function `bcSyncEcoPlanningLines(projectNumber, panelIdx, ecoNumber, ecoBomDelta)`.
- **Labor planning lines** are per-task, not per-labor-category. Posted via OData with `Type:Labor`, `No:laborCode`, `Quantity:hours`. ECO labor delta either modifies existing task line or adds new task line (decision needed — see below).
- **Vendor POs** created via `bcCreatePurchaseQuote` (one quote header per vendor, line items via OData POSTs). ECO additions trigger new quotes for affected vendors.
- **Offline queue** `_arc_bc_queue` already handles the "BC down when ECO approved" case. Existing queue types: `createPurchaseQuote`, `attachPdf`, `patchJob`, `syncTaskDescs`. Need to add: `syncEcoPlanningLines`, `pushEcoPdfs`.
- **Drawing attachment naming** flexible enough to extend: `DWG-[STAMP] DRAWING# - PROJ# - LINE.pdf`. New stamp prefixes: `[ECO N AS-QUOTED]`, `[ECO N CUSTOMER REVIEWED]`, `[ECO N APPROVED TO PRODUCE]`.
- **Cleanup function** at line 1498 archives or deletes old PDFs by name pattern. Needs an exclusion for ECO-prefixed files (don't delete `[ECO 1 AS-QUOTED]` when re-uploading `[AS-QUOTED]` for the base).
- **Stub already exists**: `bcAddEcoTask(projectNumber, panelIndex, ecoNumber, panelName)` at line 1716 — confirms this was being thought about. Investigate what it does today and whether it's wired up.

### Quote + pricing

- **Quote document** at `project.quote = {...}` — stores customer-facing quote fields (number, contact, terms, panelOverrides). NOT the BOM itself; the BOM lives on `panel.bom`.
- **`MTX-Q######`** assigned once, on first print, via Firestore transaction at `users/{uid}/config/quoteCounter.next`. Quote number does NOT change per rev. ECO quotes will reuse the same `MTX-Q` number with an ECO suffix: `MTX-Q202000-ECO1`.
- **`quoteRev`** auto-bumps on BOM hash change. `quoteSentRev` is the immutable snapshot at send time. ECO needs parallel per-ECO `ecoRev` and `ecoSentRev`.
- **`computePanelSellPrice`** (line 618) uses **margin** formula (`cost / (1 - margin%)`), default 30%. ECO must use the same formula on the delta cost. Margin comes from `panel.pricing.markup`.
- **Contingency rows** — auto-appended `partNumber:"Contingency"` rows with `isContingency:true`. ECO's bomDelta should NOT touch contingency rows (those carry over from base).
- **Budgetary auto-flip** triggers when AI lead times present. ECO can inherit base's budgetary state OR be its own quote with its own flip logic. Decision: ECO inherits.
- **Quote PDF** generated client-side via `buildQuotePdfDoc` (line 3849). Per-panel breakdown, T&C single-page. ECO PDF needs an "ECO #N — Change Order Quote" variant that shows: original totals, this ECO's deltas, new running total.
- **Sent quote BC upload**: `QTE_C-[MTX-Q202000 Rev 01]...pdf`. ECO PDF: `QTE_C-[MTX-Q202000-ECO1 Rev 01]...pdf` to file alongside.

### BOM data model

- **BOM row** has 25+ fields; the relevant ones for delta tracking: `partNumber`, `qty`, `unitPrice`, `priceSource`, `leadTimeDays`, `manufacturer`, `description`, `notes`. Identity = `id` (random `Date.now()+Math.random()` at extraction time).
- **Re-extraction is destructive** — replaces panel.bom entirely. Manual edits with `priceSource:"manual"` or `"bc"` are NOT preserved across re-extract; only "is this row priced?" is tracked. This is actually a **bug** I'd flag separately, but for ECO purposes it doesn't matter because ECO BOM additions live in the ECO doc, not the base panel.bom.
- **Auto-managed rows** (`isLaborRow`, `isContingency`, `autoLoaded`) — ECO must distinguish these. Labor rows in particular are rebuilt every save.
- **Crossed parts** retain `crossedFrom` history. Same pattern works for ECO: ECO bomDelta items can have `replacesBaseRowId` to mark "this ECO row replaces base row X".
- **Concurrent edits** handled by save guards (storageUrl, reviewNotes, reviewShapes merge by id). ECO docs need their own merge guard if multiple users can edit one ECO.
- **`panel.bomVersion`** auto-increments per panel BOM change. ECO has its own per-panel-per-ECO bomVersion.

### Drawings + stamps

- **Stamp modes today**: `as_quoted`, `quote_ready`, `ready_to_produce`, `customer_reviewed`, `customer_approved`, `production`. Each has color + label.
- **Drawing version on stamp**: `panel.bomVersion` (e.g. `v.2`) AND `quoteRev` (e.g. `Q-REV 01`). Both burned into the stamp + filename.
- **`buildAndAttachPdf`** (line 14618) builds full PDF: cover + drawing pages + stamps. Single function reused for quote, customer review, customer-reviewed bake-in, production traveler. Highly reusable.
- **`burnNotesCanvas`** (line 7816) bakes notes by color (red engineer, blue customer). `burnShapesCanvas` (line 7880) bakes shapes the same way.
- **Customer review portal** (`reviewUploads/{token}`) handles the back-and-forth feedback. Reusable per ECO with new tokens.
- **No drawing-history UI exists today.** BC's attachment list is the de facto history (filenames embed mode + rev). Drawing Rev B/C/D in the existing todo list addresses this — ECOs build on top.

### Notifications + email

- **SendGrid + Microsoft Graph** both in use. SendGrid for transactional Cloud Function emails (invites, supplier-quote-submitted notifications, customer-review-submitted, engineer questions, issue reports). Graph for user-driven sends (RFQs, customer quote sends, customer review portal links).
- **Bell-icon notifications** at `users/{uid}/notifications/{id}` with types: `supplier_quote`, `customer_review`, `pre_review`, `engineer_question`, `issue_report`. ECO will add: `eco_submitted`, `eco_approved`, `eco_rejected`, `eco_bc_synced`.
- **Push notifications** via FCM token registry. Cloud Functions trigger pushes via `sendPushToUser(uid, ...)`. ECO triggers will follow the same pattern.
- **Teams webhook** already wired for supplier-quote and engineer-question events. ECO events are good candidates too.
- **Customer review email deep-link pattern** (just shipped in v1.19.781): `?openCustomerReview=<projectId>` query param → app auto-opens project + responses modal. ECO will need: `?openEco=<projectId>&ecoNumber=N`.

---

## Conceptual design

### Definition of an ECO

> An **Engineering Change Order (ECO)** is a tagged, customer-approvable scope of changes to a project after PO. Each ECO has its own number (sequential per project — `ECO #1`, `ECO #2`, …), its own approval lifecycle, and its own document trail. ECOs are **independent and isolated** — they do not interact with each other or with prior ECOs except by accumulating tagged BOM rows on the same panel. Once a project has any ECOs, the BC project Status is flipped to `Quote` and stays there until all ECOs reach a terminal state. ECOs are immutable at **completion** (production wraps); pre-completion, they can be edited or extended.

**Status pill format on Project Tile and Project Card:** `PRJ402065-ECO02` (cyan or purple to differentiate from base statuses).

### Lifecycle / state machine

```
              ┌─────────────────────────────────────────┐
              │                                         │
              ▼                                         │
     [created] ──────► draft                           │
                          │                             │
                          ├──► cancelled (terminal)    │
                          │                             │
                          ├──► in_review                │
                          │      │                      │
                          │      ├──► returned ─────────┘
                          │      │
                          │      └──► sent
                          │              │
                          │              ├──► rejected (terminal — kept for audit)
                          │              │
                          │              └──► approved
                          │                       │
                          │                       └──► in_production ──► completed (terminal)
                          │
                          └──► (multiple ECOs can be in flight at once — see "Concurrent ECOs" below)
```

**Multiple concurrent ECOs are explicitly allowed.** A single project can have ECO #1 in customer review while ECO #2 is still in draft (different change driver) and ECO #3 is approved and being purchased. Each ECO is independently scoped; conflict handling between concurrent ECOs is described in [Cross-cutting concerns → Concurrent ECO conflicts](#concurrent-eco-conflicts).

States:

| State | Meaning | Editable? | Affects project total? |
|-|-|-|-|
| `draft` | engineer composing the ECO | yes (engineer) | no |
| `in_review` | submitted for internal pre-review | reviewer only | no |
| `returned` | reviewer kicked it back | engineer can re-edit | no |
| `sent` | quote sent to customer | locked (soft-block) | no |
| `rejected` | customer declined | locked, terminal | no |
| `approved` | customer signed off | locked, awaiting BC sync | yes |
| `in_production` | BC synced, parts being purchased | locked | yes |
| `completed` | done, merged into project totals | locked, terminal | yes |
| `cancelled` | engineer abandoned (pre-customer) | locked, terminal | no |

### Effective project model — single BOM with `ecoTag` rows

There is **one** `panel.bom` array per panel — always. Each row carries an optional `ecoTag` field:

```js
panel.bom = [
  { id, partNumber, qty, unitPrice, ... },                      // original row, ecoTag undefined
  { id, partNumber, qty, unitPrice, ..., ecoTag: 1 },           // added/modified by ECO #1
  { id, partNumber, qty: -1, unitPrice, ..., ecoTag: 2 },       // ECO #2 reducing qty (negative)
  ...
]
```

**Effective state math** is simple:

```
effective_panel.bom[i] = panel.bom.filter(r => {
  if (r.ecoTag == null) return true;                             // always include base rows
  const eco = ecos.find(e => e.number === r.ecoTag);
  return eco && eco.status in {approved, in_production, completed};
})
```

ECOs are **stacked +/−** with no conflict math. If ECO #1 adds 2 of part X (`ecoTag: 1, qty: 2`) and ECO #2 removes 1 (`ecoTag: 2, qty: -1`), the effective qty when both approve is `base + 2 − 1`. If math goes negative, system warns at render but doesn't block — engineer is in the loop.

**Three rendering views:**

- **Effective view** (default post-PO) — base + approved/in_production/completed ECO rows.
- **Pending view** — effective + draft/in_review/sent ECO rows (preview).
- **Single-ECO view** — only rows where `ecoTag === N` (the ECO being edited).

**Single horizontal separator in the BOM table** divides original from ECO additions:

```
┌──────────────────────────────────────────────────────┐
│ PRJ402065 — Panel 1 — Base BOM                       │
├──────────────────────────────────────────────────────┤
│ Part #              Mfr      Qty   Price     Source │
│ ABB ACH580-01...    ABB        1   $920      bc     │
│ SQ-D 9070T1500D1    SQUARE-D   1   $320      bc     │
│ ... (30 rows)                                         │
├═══════════════════════════════════════════════════════│  ← single separator
│ Engineering Change Orders                             │
├──────────────────────────────────────────────────────┤
│ ABB ACH580-01...   [ECO 01] +2   $920    bc          │
│ AB 700-CF310       [ECO 02] +1   $245    bc          │
│ Labor (wiring)     [ECO 02] +6h  $65/hr  manual      │
│ SQ-D 9070T1500D1   [ECO 01] −1   $320    bc          │
└──────────────────────────────────────────────────────┘
```

ECO rows are intermixed below the separator, each with an inline ECO badge (`[ECO 01]` purple pill). Sort order: by ECO number then row id. The badge itself is also a click target — clicking opens that ECO in the Editor.

### Pricing model — separate ECO defaults

Per user direction, ECOs use **different default rates** than base project pricing:

| Setting | Base default | ECO default | Where set |
|-|-|-|-|
| Margin % | 30% | **40%** | `users/{uid}/config/pricing.ecoDefaultMargin` |
| Labor rate $/hr | $45 | **$65** | `users/{uid}/config/pricing.ecoDefaultLaborRate` |

Both are configurable. Each ECO snapshots the values **at creation time** (`eco.marginUsed`, `eco.laborRateUsed`) so later config changes don't retroactively shift the math.

#### Expediting cost

ECOs that bump production schedule may carry an **expediting fee** at salesperson discretion:

- New field: `eco.expediteCost: 0` (default), `eco.expediteReason: null`
- Salesperson enters a flat dollar amount in the ECO Editor (no margin applied — it's a service charge passed directly into `deltaSell`)
- Quote line: rendered as a separate item `"Expediting fee — production reschedule: +$N"`
- v2 enhancement: auto-suggest based on TRAQS percent-complete + impact analysis (deferred)

#### Delta calculation (sums over tagged rows)

Because the data model is "panel.bom rows tagged with ecoTag," the math is a simple aggregation per ECO number:

```
eco.deltaMaterialCost = Σ over panel.bom.filter(r => r.ecoTag === eco.number && !r.isLaborRow):
  r.qty × r.unitPrice × panel.lineQty       // r.qty can be negative for removals/reductions

eco.deltaLaborCost = Σ over panel.bom.filter(r => r.ecoTag === eco.number && r.isLaborRow):
  r.qty × eco.laborRateUsed × panel.lineQty

eco.deltaCost = deltaMaterialCost + deltaLaborCost

eco.deltaSell = (deltaCost / (1 - eco.marginUsed / 100)) + eco.expediteCost
                // margin formula on cost, then expediting added on top
```

The customer-facing ECO quote shows (header is **ENGINEERING CHANGE ORDER**):

```
═════════════════════════════════════════
       ENGINEERING CHANGE ORDER
       MTX-Q202000 - ECO02
─────────────────────────────────────────
For PRJ402065 — Albion Idaho Water
Per your request dated April 27, 2026:

This ECO 02 changes:
  + Add 2× ABB ACH580-01-04A1-4 (drives) ........ +$1,840
  + Add labor (wiring) 6 hr × $65 ................ +$390
  − Remove 1× SQ-D 9070T1500D1 (discontinued)  ... −$320
  + Expediting (production reschedule) ........... +$250

  Net material:  +$1,520
  Net labor:     +$390
  At ECO margin (40%): +$3,183
  Expediting:    +$250
  ─────────────────────
  ECO 02 TOTAL:  +$3,433

  Schedule:      May 14 → May 21 (+1 week)

Original quote (MTX-Q202000 Rev 03):    $48,500
+ ECO 01 (approved Apr 03):             +$2,400
+ ECO 02 (this change):                 +$3,433
─────────────────────
NEW PROJECT TOTAL:                      $54,333
═════════════════════════════════════════
```

---

## Data model

### New Firestore subcollection

`users/{uid}/projects/{projectId}/ecos/{ecoId}` — one doc per ECO.

For company-shared projects, the path is `companies/{companyId}/projects/{projectId}/ecos/{ecoId}` (mirrors existing project storage logic via `_appCtx.projectsPath`).

### ECO document schema

```js
{
  // Identity
  number: 1,                              // sequential per project, never reused
  displayNumber: "ECO #1",
  parentEcoId: null,                      // optional — links to predecessor ECO
  baselineEcoNumbers: [],                 // ECOs that were already approved when this ECO was created.
                                          // Defines this ECO's effective baseline for diff math.
                                          // Empty = ECO is diffed against the original base project.

  // State
  status: "draft" | "in_review" | "returned" | "sent" | "approved" |
          "rejected" | "in_production" | "completed" | "cancelled",
  createdAt: timestamp,
  createdBy: uid,
  createdByName: "Andrew Brunt",
  createdByDesignerCode: "ABRUNT",        // BC user code for designer assignment

  // Description / context
  kind: "customer_change" | "internal_change" | "scope_correction",
                                          // Drives the approval flow:
                                          //   customer_change → requires customer approval (default)
                                          //   internal_change → engineer/admin only, no customer touch
                                          //   scope_correction → no charge, internal review only
  title: "Customer added feeder circuit",  // short
  description: "...",                      // free-text, multi-line
  customerReason: "...",                   // why customer wants the change
  customerRequestDate: timestamp,          // day the change was requested (audit anchor)
  internalNotes: "...",                    // engineer-only

  // Rev tracking — internal hash only, NOT shown to user
  // (The user explicitly said no Rev sub-counters; just use the integer ECO number.)
  lastEcoHash: "djb2-hash",                // for change detection during edits

  // Sent / approval tracking — checkpoint timestamps, not full revisions
  sentAt: null,
  sentBy: null,
  sentTo: null,                            // recipient email(s) on send
  customerApprovedAt: null,
  customerApprovedBy: null,                // customer name from portal
  customerApprovalEmail: null,
  customerApprovalDocUrl: null,            // signed quote PDF in BC or Storage

  // Internal pre-review
  internalReviewStatus: null | "pending" | "approved" | "rejected",
  internalReviewedAt: null,
  internalReviewedBy: null,

  // Pricing — computed from panel rows tagged with this ECO number, snapshotted at approval time
  // Live values are recomputed on render; "Snapshot" values capture what the customer approved.
  deltaMaterialCost: 1520.00,              // live: sum of material from panel rows where ecoTag = this.number
  deltaLaborCost:     270.00,              // live: sum of labor from panel rows where ecoTag = this.number
  deltaCost:         1790.00,
  deltaSell:         2557.14,
  approvedSnapshot: null,                  // { deltaCost, deltaSell, rowCount } captured at customer approval
  marginUsed: 40,                          // % active at ECO creation (snapshotted from config — see ECO Pricing)
  laborRateUsed: 65,
  expediteCost: 0,                         // salesperson-entered manual cost
  expediteReason: null,                    // free-text

  // Customer review portal — same `reviewUploads/{token}` collection, scoped per-ECO
  customerReviewToken: "abc...",
  customerReviewSentAt: timestamp,

  // BC sync — gated by engineer review-and-accept after customer approval
  bcSyncReviewedBy: null,                  // engineer who clicked "Review & Push to BC"
  bcSyncReviewedAt: null,
  bcSyncedAt: null,
  bcTaskNumbers: { [panelId]: "20130" },
  bcPlanningLineIds: [...],
  bcVendorQuoteIds: [...],
  bcSyncErrors: [],

  // Drawing state — uses existing `panel.pages[].reviewNotes/reviewShapes` machinery, scoped via `ecoTag` field on those notes
  drawingsBakedAt: null,
  drawingsBcUploadedAt: null,

  // Linked artifacts
  linkedRfqUploads: [],
  linkedSupplierQuotes: [],

  // Threaded comments — added per user request
  comments: [
    { id, by, byName, at, text, parentId? }
  ],

  // TRAQS production-state snapshot (when ECO was created — used to assess impact)
  traqsSnapshotAtCreation: null,           // { percentComplete, currentStep, holdReason } from TRAQS plug-in

  // Display
  schemaVersion: APP_SCHEMA_VERSION,
  updatedAt: timestamp,
  updatedBy: uid
}
```

### Project-level fields added

```js
project = {
  ...existing fields...,

  // ECO indexing
  ecoCounter: 2,                            // next ECO number to assign (1, 2, 3, ...)
  activeEcoId: "eco_abc123",                // currently-open draft ECO (engineer's working ECO)
  ecoSummary: [                             // denormalized list for fast Panel Tile / Card rendering
    { ecoId, number, status, kind, deltaSell, approvedAt, completedAt, displayLabel: "ECO 02" }
  ],
  effectivePanelTotals: {                   // cached aggregate, recomputed on ECO state change
    [panelId]: { baseSell, ecoSell, totalSell }
  },

  // Audit
  ecoFirstCreatedAt: timestamp,             // when first ECO ever appeared on this project
  ecoEditUnlockedAt: timestamp,             // when admin first allowed ECOs (post-PO)
  ecoEditUnlockedBy: uid
}
```

### BOM row fields added

Each entry in `panel.bom[]` gains an optional `ecoTag` and supporting fields. Original rows do not have `ecoTag` set (treated as base).

```js
{
  // ...existing 25+ row fields (partNumber, qty, unitPrice, priceSource, etc.)...

  ecoTag: 2,                                // which ECO this row belongs to (matches ECO doc number)
  ecoTagAddedAt: timestamp,
  ecoTagAddedBy: uid,
  ecoOp: "add" | "modify" | "remove",       // semantic role of this row within the ECO
                                            //   add → new row introduced by the ECO
                                            //   modify → references a base row by `ecoModifiesBaseRowId`
                                            //   remove → references a base row, qty/price are negative
  ecoModifiesBaseRowId: null | "<row id>",  // when ecoOp === "modify" or "remove"
  ecoOriginalSnapshot: null | { ...row }    // when modify/remove — what the base row looked like at tag time
}
```

### Drawing-overlay (`reviewNotes`/`reviewShapes`) ecoTag

Existing `panel.pages[].reviewNotes` and `reviewShapes` entries gain an `ecoTag` field too, so engineer markup made within an ECO scope is filterable. Engineer notes outside any ECO scope have `ecoTag: undefined`.

### Schema migration

`APP_SCHEMA_VERSION` bump to next major. Migration on `loadProjects`:

```js
if (project.schemaVersion < ECO_INTRODUCED_VERSION) {
  project.ecoCounter = 0;
  project.activeEcoId = null;
  project.ecoSummary = [];
  // Existing edits made via editUnlocked are NOT retroactively converted to ECOs.
  // Instead, mark them with a banner: "Project last unlocked YYYY-MM-DD (untracked edits)".
}
```

### Firestore rules

New rules block for the `ecos` subcollection:

```
match /ecos/{ecoId} {
  // Read: any project member
  allow read: if isMember();

  // Create: project owner, admin, or anyone with reviewer permission, after PO received
  allow create: if (isOwner() || isAdminMember() || hasPermission('reviewer'))
                && incomingProjectIsWonOrInProduction();

  // Update: same gate as create. Carve-outs:
  //   - status changes (review approve/reject, customer approve, BC sync stamp)
  //   - delta edits (only if status == 'draft' or 'returned')
  //   - admin force-update of any field
  allow update: if (
    isAdminMember()
    || (isOwner() && resource.data.status in ['draft','returned'])
    || (hasPermission('reviewer') && isOnlyEcoReviewStateUpdate())
    || (isMember() && isOnlyEcoCustomerStateUpdate())
  );

  // Delete: blocked. ECOs are append-only audit records. Admins can change status to
  // "cancelled" but never delete the doc.
  allow delete: if false;
}

function isOnlyEcoReviewStateUpdate() {
  return request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['status','internalReviewStatus','internalReviewedAt','internalReviewedBy','updatedAt','updatedBy']);
}

function isOnlyEcoCustomerStateUpdate() {
  // Customer can only flip approval state via the portal (which writes via Cloud Function w/ Admin SDK)
  // — but if needed, also allow direct customer review token writes by anyone with the link.
  return request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['customerReviewToken','customerReviewSentAt','updatedAt']);
}
```

---

## UI design

### Where ECOs live in the UI — tab layout above panel cards

When a project has any ECOs, a horizontal **scope tab strip** appears at the top of the Project view, immediately below the project header. Selecting a tab swaps which "scope" the panel cards render under:

```
┌────────────────────────────────────────────────────────────┐
│ Project: PRJ402065 — Albion Idaho Water                    │
│ Status: 🟣 PRJ402065-ECO02 (Sent for Approval)             │
├────────────────────────────────────────────────────────────┤
│ [ Base ▾ ]  [ ECO 01 ✓ +$2,400 ]  [ ECO 02 ⏳ +$1,820 ]  [ + New ]│
├────────────────────────────────────────────────────────────┤
│ ╔══════════════════════════════════════════════════════╗   │
│ ║ Panel 1 — Magino Thickener (showing ECO 02 scope)    ║   │
│ ║   BOM (with single separator):                       ║   │
│ ║   • Base rows (collapsed summary if Base tab not open)║   │
│ ║   ════════════════════════════════════                ║   │
│ ║   • [ECO 02] +1 AB 700-CF310                         ║   │
│ ║   • [ECO 02] +6h Wiring labor                        ║   │
│ ║                                                       ║   │
│ ║ Drawings: ECO 02 markup (red/blue overlays)          ║   │
│ ║ Customer Review: [Send to Customer]                  ║   │
│ ║ BC Sync: not yet pushed (awaiting customer approval) ║   │
│ ╚══════════════════════════════════════════════════════╝   │
├────────────────────────────────────────────────────────────┤
│ QUOTE SUMMARY                                              │
│   Base Quote (MTX-Q202000 Rev 03):    $48,500              │
│   ECO 01 (approved Apr 03):           +$2,400              │
│   ECO 02 (pending):                   +$1,820 (est.)       │
│   ─────────────────────────────────────────────            │
│   Effective Total (approved only):    $50,900              │
│   With Pending:                       $52,720              │
└────────────────────────────────────────────────────────────┘
```

**Tab behavior:**

- **Base ▾** — original panel state. When user clicks, ECO scopes collapse into a one-line summary above each panel card; the panel card itself shows only base rows.
- **ECO N** — the panel card filters to "Effective view scoped to this ECO." BOM shows base rows above the separator and just this ECO's tagged rows below. Drawing overlays filter to this ECO's `reviewNotes/reviewShapes` with matching `ecoTag`. Customer review controls are scoped to this ECO. BC sync status reflects this ECO.
- **+ New** — only visible to admin / owner / reviewer permission, and only when the project's `bcPoStatus === "Open"`. Creates a new ECO doc in `draft` and switches the active tab to it.

**The active ECO tab visually expands** (wider, more prominent) while base + other ECO tabs are narrower, communicating "this is what you're working on right now." Concurrent ECOs are equally accessible via clicking their tab.

Selected ECO state persists in URL: `?eco=2` so deep-links from notification emails work seamlessly.

### ECO Editor (per-ECO actions)

Activates when user clicks an ECO tab. Replaces the standard panel card actions with ECO-scoped ones:

- **Title / description / customer reason / internal notes** — top-of-card editable form
- **BOM editor** — adds rows with `ecoTag = N`, supports add/modify/remove ops; shows separator between base + ECO sections
- **Labor delta** — per-panel hour adjustments tagged with this ECO
- **Delivery delta** — per-panel ship-date shifts
- **Drawings** — engineer can add notes/shapes scoped to this ECO (separate from base markup)
- **Customer Review** — Send to Customer button (uses Outlook reply-to-thread search), portal status, customer responses
- **BC Sync** — visible only after customer approval; engineer review-and-accept gate before push (see [Cross-cutting concerns → BC sync gate](#bc-sync-engineer-review-and-accept-gate))
- **Comments thread** — engineering team can chat about the ECO in-context (per user request)
- **State machine controls** — Submit for Pre-Review / Approve / Return / Send to Customer / Cancel ECO buttons

### ECO Editor

Full-screen modal with tabs:

- **Overview** — title, description, customer reason, internal notes, pricing summary, status timeline
- **BOM Delta** — per-panel diff editor (add/remove/modify rows)
- **Labor Delta** — per-panel hour adjustments
- **Delivery Delta** — per-panel ship-date changes
- **Drawings** — per-panel drawing markup specific to this ECO
- **Customer Review** — same flow as base project's customer review, but scoped to this ECO
- **BC Sync** — status of pushed planning lines, errors, queue

Top bar:

```
[Back to Project]   ECO #2 (DRAFT)   [Submit for Pre-Review]   [Print Quote]   [Send to Customer]
```

Bottom bar:

```
Net Material: +$1,520    Net Labor: +$270    Margin: 30%    Net Sell: +$2,557
```

### BOM Delta editor

Per panel, three columns:

```
   Base (read-only)            Modified (editable)            Diff
─────────────────────────  ─────────────────────────  ──────────────
PN  ABB ACH580-01-04A1-4  PN  ABB ACH580-01-04A1-4   (no change)
qty 1                     qty 3                        +2
$/ea $920                 $/ea $920                    
                                                       Δ +$1,840

PN  SQ-D 9070T1500D1      PN  (REMOVED)               
qty 1                                                  -1
$/ea $320                                              Δ −$320

[+ Add new row to ECO]
```

The "Modified" column initializes to base. Edits create entries in `ecoBomDelta`. Crossed parts on base remain crossed; ECO can also cross parts.

### Customer-facing ECO quote document

The same `buildQuotePdfDoc` machinery is reused but with header + scope adjustments:

- **Header** changes from `QUOTE` (or `BUDGETARY QUOTE`) to **`ENGINEERING CHANGE ORDER`** (purple accent to match CUSTOMER REVIEWED stamp)
- **Quote number format**: `MTX-Q202000 - ECO02`
- **Description section** gets a minimal ECO summary appended as a new sub-section:
  - One-line title (from `eco.title`)
  - Per-line-item: `<part> — original $X → new $Y` (where applicable)
  - Net delta: `+$1,820`
  - Schedule shift if any: `+1 week (May 14 → May 21)`
  - More detailed sections (full BOM table, per-panel breakdown) can be added in v2
- **Body text intro** swaps to: "Per your request dated April 27, 2026, please review and approve the following change to project PRJ402065."

**Filename for BC**: `QTE_C-[MTX-Q202000 - ECO02] - PRJ402065 - Albion Idaho Water.pdf`.

### Send ECO Quote modal — Outlook Reply-To-Thread search

Per user feedback, the ECO send modal **mirrors the existing `QuoteSendModal`** capabilities:

- **New email** mode — type recipient + send fresh
- **Reply to Thread** mode — search Outlook conversations (via Microsoft Graph) for existing threads with the customer; user picks one to reply within. Keeps the customer's email thread context intact, which they prefer for ECOs (continuation of the original quote conversation).

Implementation: extract the existing thread-search logic from `QuoteSendModal` into a shared component / helper used by both. No duplicate logic.

### Customer review portal for ECOs

Reuses `reviewUploads/{token}` collection with `ecoNumber` field added to scope it. Portal renders:

- "ECO #2 — Change Order Review for PRJ402065" header
- Side-by-side: original (read-only) vs proposed (with markup)
- Customer can approve / reject / request changes (with comments)
- Submit → Cloud Function fires → notifies designer + salesperson + admin

### Project tile (dashboard)

Project tiles get an ECO badge:

- 🟢 base (no ECOs)
- 🔄 +1 (one ECO in flight)
- 🔄 +2/3 (2 of 3 ECOs approved, 1 pending)
- 🔥 +1 returned (customer rejected an ECO — needs attention)

---

## Touchpoint map — what changes where

### `src/app.jsx`

| Section | What changes |
|-|-|
| `computeProjectEffectiveStatus` (~line 9015) | Add ECO states; project tile shows `PRJ######-ECO##` when active ECO present |
| `Badge` component (~line 9052) | Render ECO badge variant (purple, with ECO number) |
| `ProjectView` (~line 22457) | Top scope-tab strip (Base / ECO 01 / ECO 02 / + New) below project header |
| `PanelListView` (~line 21079) | Render filtered BOM based on selected scope tab; single-separator layout when ECO rows present |
| `PanelCard` (~line 13730) | New render path showing base rows above separator and ecoTag-matching rows below; per-row `[ECO N]` badge |
| `BomTable` rendering | Add separator row injection logic; sort tagged rows by ECO number then row id |
| `QuoteView` (~line 22473) | Aggregate base + approved ECO rows; Quote Summary panel shows running total |
| `QuoteTab` (~line 11317) | When scoped to ECO: header swaps to "ENGINEERING CHANGE ORDER"; description gets ECO summary appended |
| `QuoteSendModal` (~line 20800) | Refactored — extract Reply-To-Thread + Graph send into shared helper used by base quote and ECO quote |
| `buildAndAttachPdf` (~line 14618) | Accept new stamp modes `eco_as_quoted`, `eco_quote_ready`, `eco_customer_reviewed`, `eco_customer_approved`, `eco_approved_to_produce`. Filename gets `[ECO N ...]` prefix. |
| `burnStampCanvas` (~line 7788) | New color for ECO modes — purple bar with "ECO #N" prefix in stamp label |
| Save guards (~line 4960) | Extend existing storageUrl/reviewNotes/reviewShapes merge guards to cover ECO-tagged rows in `panel.bom` (merge by row id) |
| New: `EcoEditor` component | Per-ECO action surface (replaces panel-card actions when ECO tab is selected) |
| New: `EcoScopeTabs` component | Renders the horizontal scope-tab strip on project view |
| New: `EcoQuotePrintLayout` extension | Reuses `buildQuotePdfDoc` but injects ECO header/summary; not a new component, a modifier flag |
| New: `EcoCommentThread` component | Threaded comments for ECO collaboration |
| New: `EcoBcReviewModal` component | The engineer review-and-accept gate before BC sync |
| `runPanelValidation` (~line 7478) | When viewing an ECO scope, validate the effective panel (base + approved ECOs + active ECO rows) instead of just base |
| `traqsClient.js` (NEW file) | Plug-in helper for TRAQS webhook + percent-complete query, no-op without env vars |

### `firestore.rules`

| Section | What changes |
|-|-|
| `match /projects/{projectId}` | Add ECO-introduced field whitelist: `ecoCounter`, `activeEcoId`, `ecoSummary`, `effectivePanelTotals`, `ecoEditUnlockedAt`, `ecoEditUnlockedBy` |
| New: `match /ecos/{ecoId}` | Full CRUD rules with state-machine carve-outs |
| New: `isOnlyEcoReviewStateUpdate()` helper | Carve-out for reviewer flipping internal review state |

### `functions/`

| File | What changes |
|-|-|
| `functions/index.js` | Export new functions |
| New: `functions/ecos/index.js` | `onEcoSubmittedForReview`, `onEcoSentToCustomer`, `onEcoCustomerApproved`, `onEcoRejected`, `onEcoBcSynced`, `sendEcoQuoteEmail`, `extractEcoBomFromUpload` (if AI-extracting deltas from supplier-provided change order PDFs) |
| `functions/engineering/index.js` (existing customer-review module) | Extend `onCustomerReviewSubmitted` to detect when the review token was for an ECO and route accordingly (different email template, different deep link, different bell-notification type) |

### Cloud Function notification types

New notification types:

- `eco_pending_review` — engineer submitted ECO for internal pre-review → notify reviewer
- `eco_returned` — reviewer returned ECO → notify engineer
- `eco_sent_to_customer` — customer email sent → notify owner+salesperson (FYI)
- `eco_customer_approved` — customer signed off → notify owner+designer+salesperson
- `eco_customer_rejected` — customer declined → notify owner+designer+salesperson
- `eco_bc_sync_failed` — BC push failed → notify admin
- `eco_completed` — ECO done, rolled into project totals → notify owner

### BC integration

| Function | What changes |
|-|-|
| `bcAddEcoTask` (existing stub at line 1716) | Investigate, complete or rewrite. Should create BC task lines numbered 20N30, 20N31, ... where N = panel index, last 2 digits = ECO number |
| New: `bcSyncEcoPlanningLines(projectNumber, panelIdx, ecoNumber, bomDelta, laborDelta)` | Pushes added/modified/removed planning lines to BC. Removed lines: zero out qty (don't delete — preserves audit) |
| New: `bcCreateEcoPurchaseQuote(vendorNo, ecoBomItems, projectId, ecoNumber)` | Creates a vendor quote tagged with ECO context |
| New: `bcSetProjectStatusToQuote(projectNumber)` and `bcSetProjectStatusToOpen(projectNumber)` | Flip the BC project `Status` field via `bcPatchJobOData`. **Status:"Quote"** is set the moment ANY active ECO appears on the project (first ECO transitions to draft). **Status:"Open"** is restored only when ALL active ECOs are resolved (all in `approved`/`completed`/`rejected`/`cancelled`). Tells BC + downstream BI tools that this project is currently under change-order revision and shouldn't be treated as final. |
| `bcCheckAttachmentExists` (line 1439) | Pattern matching extended to recognize `[ECO N ...]` prefixes |
| `bcCleanupDuplicateAttachments` | Skip ECO-prefixed files when cleaning up base files |
| BC offline queue types | Add `syncEcoPlanningLines`, `pushEcoPdfs`, `createEcoPurchaseQuote`, `setProjectStatusToQuote`, `setProjectStatusToOpen` |

### Drawing pipeline

| Section | What changes |
|-|-|
| `burnStampCanvas` (line 7788) | New stamp prefix `ECO #N` for all eco_* modes; purple color for `eco_customer_*` |
| `buildAndAttachPdf` (line 14618) | Accept `ecoNumber` in `uploadOpts`. Filename prefix `[ECO N ...]`. ECO-specific cover page that highlights the delta. |
| Customer review portal (`portal.js`) | Detect when token is for an ECO (via `info.ecoNumber`); render with ECO badge + "Change Order Review" header |
| `reviewUploads/{token}` schema | Add optional `ecoNumber`, `ecoId`, `ecoTitle` fields |

### URL deep-link patterns

New URL params handled by `App` component:

- `?openEco=<projectId>&ecoNumber=N` — opens project, opens ECO #N in editor
- `?openEcoReview=<projectId>&ecoNumber=N` — opens project, opens ECO customer-review modal
- Existing `?openCustomerReview=<projectId>` continues to work for non-ECO reviews

---

## Implementation phases

Each phase is a deployable, testable increment. Estimated 1 deploy per phase, with verification before moving to next.

### Phase 1 — Schema + minimal CRUD (foundational)

**Scope:** Add ECO subcollection schema, CRUD rules, ECO Editor shell with no actual editing logic. Just creates an empty ECO doc and lists existing ECOs on the project view.

**Includes:**
- New Firestore rules block (`match /ecos/{ecoId}`)
- `APP_SCHEMA_VERSION` bump + migration
- `EcoListStrip` rendering (basic, just shows status)
- `+ New ECO` button (visible only post-PO, gated to owner/admin/reviewer)
- Empty `EcoEditor` modal with tabs (Overview, BOM, Labor, Delivery, Drawings, Customer Review, BC Sync)
- ECO doc creation: assigns next number from `project.ecoCounter`, status: `draft`
- ECO listing: queries subcollection, displays in strip
- ECO state machine helpers (status transitions with validation)
- Cloud Functions stubs (no logic yet)

**What works after Phase 1:** Click "+ New ECO" → empty ECO doc created → shows in strip. No real editing yet.

**Verification:** Open a post-PO project, create an ECO, verify it appears, refresh, still there. No regressions on non-ECO projects.

### Phase 2 — BOM editing within an ECO scope (ecoTag rows + two creation methods)

**Scope:** Real BOM editing within an ECO. Rows live on `panel.bom` with `ecoTag = N`. Both creation methods supported.

**Method 1 — manual row entry:**
- Within the ECO Editor, "Add Row" button uses the existing Item Search modal
- Selected item commits as a new `panel.bom` entry with `ecoTag` = current ECO number, `ecoOp: "add"`
- Modify base row: pick a base row → edit qty/price → system creates a new tagged row with delta values (positive or negative qty), `ecoOp: "modify"`, `ecoModifiesBaseRowId` set
- Remove base row: pick a base row → click "Remove" → system creates a tagged row with negative qty matching the base, `ecoOp: "remove"`
- Per-row "revert to base" button for tagged rows: deletes the tagged row, base remains unchanged

**Method 2 — drawing upload + AI extraction with diff-against-existing:**
- Upload new revision drawings to the panel within ECO Editor
- AI extraction runs on the new pages
- System compares extracted items against the existing panel.bom (matched by part number + manufacturer)
- For NEW items (not in existing BOM): auto-create tagged rows with `ecoTag` and `ecoOp:"add"`
- For EXISTING items with qty change: auto-create tagged rows with delta qty and `ecoOp:"modify"`
- For items in existing BOM but missing from new extraction: present as candidate removals; engineer accepts/rejects per row
- Engineer reviews the auto-generated tagged rows before save
- Falls back to Method 1 for any rows that need manual tweaking

**Common (both methods):**
- BOM rendering: single horizontal separator after non-tagged rows; all tagged rows below; each tagged row shows `[ECO N]` badge
- Live cost recompute: `eco.deltaMaterialCost` and `deltaCost` recalculated on every row save (sum over tagged rows)
- Save guards extended for tagged rows: same merge-by-id pattern as reviewNotes

**What works after Phase 2:** Engineer composes ECO scope by either uploading new drawings or manual editing. Pricing live-updates. ECO doc captures the scope via tagged rows.

**Verification:** Create an ECO, upload a new drawing rev → AI extraction proposes tagged rows → engineer accepts → cost matches expected. Or: manually add a row → tagged row appears below separator → cost updates.

### Phase 3 — Labor + delivery delta + ECO pricing

**Scope:** Round out the editable scope with labor adjustments and ship-date shifts.

**Includes:**
- Labor Delta tab — per-panel hour adjustments (CUT, LAYOUT, WIRE, manual override)
- Delivery Delta tab — per-panel ship-date picker showing before/after
- ECO summary card on Overview tab: Net Material, Net Labor, Net Sell, with margin used
- Per-ECO margin override (default inherits panel margin)
- Effective panel ship-date computed = base + sum of approved deliveryDeltas + active deliveryDelta
- Effective project total in Quote Summary section reflects ECOs

**What works after Phase 3:** ECO captures everything that changes — material, labor, schedule. Net dollar impact is visible.

**Verification:** Add labor hours, see total bump. Push ship date out 1 week, see effective ship date update on dashboard.

### Phase 4 — ECO quote generation + customer send

**Scope:** Generate the customer-facing ECO quote PDF, send via Microsoft Graph, track sent/locked state.

**Includes:**
- `EcoQuotePrintLayout` component — customer-facing layout (page 1 summary, page 2 detail)
- New `buildEcoQuotePdfDoc` function — mirrors `buildQuotePdfDoc` but with ECO scope
- `Print ECO Quote` button → generates PDF
- `Send ECO Quote` button → opens send modal (variant of `QuoteSendModal`) → SendGraphEmail with ECO-themed subject/body/attachment
- ECO state transitions: `draft → in_review → returned → in_review → sent`
- Soft-block on ECO once sent (mirrors existing sent-quote soft-block on base project)
- ECO PDF uploaded to BC alongside base quote (separate filename)
- Internal pre-review approval flow within the ECO (engineer submits, reviewer approves/returns)

**What works after Phase 4:** Engineer composes ECO, submits for internal review, reviewer approves, engineer sends to customer. Customer gets a polished PDF in their email.

**Verification:** Send an ECO quote to a test email. Verify PDF renders correctly. Verify state transitions. Verify can't edit after send (without ack).

### Phase 5 — Customer review portal for ECOs

**Scope:** Customer can review and approve/reject the ECO via the existing portal infrastructure.

**Includes:**
- `reviewUploads/{token}` schema extended with `ecoNumber`, `ecoId`, `ecoTitle`, `kind:"eco"|"base_review"`
- Portal HTML/JS detects `kind:"eco"` and renders different layout (ECO badge, change-order header, side-by-side base/proposed)
- New approve / reject / request-changes buttons (vs the more open-ended notes-and-shapes for base reviews)
- Cloud Function `onCustomerReviewSubmitted` extended: if `kind:"eco"`, route to `onEcoCustomerApproved` or `onEcoCustomerRejected` Cloud Function instead of base flow
- ECO state transitions: `sent → approved` or `sent → rejected`
- Email + bell + push notifications for engineer/owner/salesperson on customer response
- Deep link `?openEco=...` handled in app

**What works after Phase 5:** Full customer-approval round-trip. Customer clicks email link, lands on portal, approves, designer gets notified, ECO state advances to `approved`.

**Verification:** End-to-end flow from "compose ECO" to "customer approves" with a test customer email.

### Phase 6 — BC sync + engineer review-and-accept gate + TRAQS hooks

**Scope:** Push approved ECOs to BC, but only after engineer reviews. Wire up the TRAQS HOLD trigger + percent-complete query (with env-var no-op fallback).

**Includes:**
- BC review-and-accept gate UI: yellow banner on `approved` ECO ("Customer approved — Review & Push to BC")
- Modal showing planned BC writes (text-only header line + tagged rows + new vendor quotes); engineer confirms or skips items
- `bcSyncEcoPlanningLines(projectNumber, panelIdx, ecoNumber)` — reads tagged rows from `panel.bom`, posts:
  - Text-only "header" planning line: `[TEXT] PRJ402065 - ECO 02`
  - Each tagged item as planning line under the header (preserves audit grouping)
  - For removed/reduced rows: zero out qty on existing BC line (don't delete)
- `bcCreateEcoPurchaseQuote` — creates vendor PO quotes for items with positive qty deltas
- BC offline queue support: new types `syncEcoPlanningLines`, `setProjectStatusToQuote`, `setProjectStatusToOpen`
- BC project Status flip on first `draft` (Cloud Function trigger on ECO doc create/update)
- ECO state transition: `approved → in_production` only after engineer confirms push AND BC actually accepts the writes
- TRAQS plug-in: `traqsClient.js` helper with `holdProject(payload)` and `getProjectStatus(projectNumber)`. Both no-op when env vars not set.
- TRAQS HOLD trigger fires on ECO `draft` creation if project is in production (`bcPoStatus === "purchasing"` or similar)
- Notification on BC sync failure (5x retries) to admin

**What works after Phase 6:** Approved ECO requires engineer review-and-accept; once pushed, lands in BC with proper grouping. TRAQS receives HOLD signal automatically (when configured).

**Verification:** Approve an ECO via portal; verify BC sync DOES NOT fire automatically; engineer pushes via review modal; BC has `[TEXT] PRJ402065 - ECO 02` header + tagged item rows. Check TRAQS webhook fires (look at outbound Cloud Function logs).

### Phase 7 — Drawing revisions per ECO

**Scope:** Each ECO can carry its own drawing revisions. New stamp modes, new filename patterns, customer review portal renders ECO drawings.

**Includes:**
- New stamp modes: `eco_as_quoted`, `eco_quote_ready`, `eco_customer_reviewed`, `eco_customer_approved`, `eco_approved_to_produce`
- `burnStampCanvas` extended with ECO color (purple) and "ECO #N" prefix in stamp label
- `buildAndAttachPdf` accepts `ecoNumber` in uploadOpts, prefixes filename with `[ECO N ...]`
- Drawings tab in ECO Editor — engineer can mark up drawings specific to this ECO (separate from base notes)
- Customer review portal renders ECO drawings with ECO badge
- Production traveler renders ECO drawings post-approval
- `bcCleanupDuplicateAttachments` updated to NOT delete ECO-prefixed files when cleaning base files

**What works after Phase 7:** Drawings get an ECO #N stamp burn-in, BC archive tracks ECO drawings separately, traveler shows ECO scope.

**Verification:** Create an ECO, add a markup, send to customer, customer reviews, approves, drawings stamped CUSTOMER APPROVED with ECO #N prefix and uploaded to BC.

### Phase 8 — Production traveler + completion + history viewer

**Scope:** Final touches. Production traveler reflects approved ECOs. ECO completion marks the lifecycle done. ECO history viewer for audit purposes.

**Includes:**
- Production traveler builder picks up approved ECOs, includes their drawings (with stamps), includes their BOM deltas in the parts list, includes labor deltas in the time sheet
- `ECO completion` action — admin marks ECO as `completed` (or auto-flips when production wraps)
- ECO History modal — chronological view of all ECOs on a project, filter by status, click to view details
- Project tile badges (🔄 +N) and dashboard summary
- ECO summary in Reports modal (cross-project view)
- Documentation: CLAUDE.md updated, this plan archived

**What works after Phase 8:** Full ECO lifecycle, complete production integration, audit and reporting visibility.

---

## Cross-cutting concerns

### Concurrent ECOs — fully isolated, stacked +/−

**Constraint:** None — any number of ECOs can be in any non-terminal state simultaneously.

**Conflict logic:** None. ECOs are completely independent of each other. Per user direction:

> "ECOs should be completely isolated. If ECO 1 deletes and ECO 2 adds, so be it. ECOs are independent and are stacked plus or minus."

**Implications:**

- Each ECO tags its rows with `ecoTag = N`. They never see each other's rows.
- The effective panel BOM = base rows + sum of all approved-state ECO rows (regardless of order or overlap).
- If ECO #1 reduces part X to 0 while ECO #2 adds 1 of part X, the math just resolves: `base + (-3) + (+1) = (base − 2)`. If that's nonsensical operationally (e.g., goes negative), engineer is in the loop and will flag it manually.
- No "rebase," no "conflict resolution," no "re-baseline" UI. Pure additive math.

**Concurrent edits WITHIN a single ECO** (two engineers editing ECO #2 at once): the existing save-guard pattern protects panel.bom rows — incoming wins per row id; missing-from-incoming rows restored. No new mechanism needed; reuse the merge guard already in place.

### BC sync — engineer review-and-accept gate

**Customer approval does NOT trigger automatic BC sync.** Per user direction, after the customer approves via the portal:

1. ECO status flips from `sent` → `approved`
2. Notification + email + push fires to engineer/owner/salesperson: "Customer approved ECO #2 — review and push to BC"
3. Engineer opens the project, sees a yellow "Review & Push to BC" banner on ECO #2
4. Engineer clicks **Review & Push**:
   - Modal shows the ECO's planned BC writes: text-only header line + each tagged row as a planning line + any new vendor PO quotes
   - Engineer reviews, can adjust BC line ordering or skip specific items
   - Click **Confirm Push** → `bcSyncEcoPlanningLines` fires
5. ECO status flips from `approved` → `in_production`

This gives the engineer one last sanity check before BC is touched. Catches things like "this part is already on a vendor PO that shipped — don't double-order" before BC sync turns into a mess.

**If the engineer doesn't push for >24h**, a reminder notification fires. Admin can also push on behalf of the engineer (admin-override available in the modal).

### TRAQS production-state integration

The ECO system needs to know **how far along production is** to assess impact. This is the integration hook for the TRAQS app being built by Max + Treysen.

**Two integration points:**

#### 1. HOLD trigger (outbound from ARC → TRAQS)

When an ECO is created on a project that's currently in production:

- ARC fires a webhook to a configurable `TRAQS_HOLD_WEBHOOK_URL` (env var) with payload:
  ```json
  {
    "type": "eco_hold",
    "projectId": "...",
    "bcProjectNumber": "PRJ402065",
    "ecoNumber": 2,
    "ecoTitle": "Customer added feeder circuit",
    "createdAt": "2026-04-28T15:30:00Z",
    "createdBy": "Andrew Brunt",
    "expectedDeltaCost": 1820.00,
    "expectedScheduleShift": "+5 days"
  }
  ```
- TRAQS receives this and flags the project for production hold (whatever that means in TRAQS — pause work cell, alert lead, etc.)
- Webhook URL is plug-in style: `null` env var = no-op; once TRAQS exposes a real endpoint, set the env var and the trigger fires automatically. No code change.

#### 2. Percent-complete query (inbound from ARC → TRAQS)

When an ECO is being composed, the engineer needs to know "how far along is this project?" to give the customer realistic delivery + cost estimates.

- ARC calls a configurable `TRAQS_STATUS_API_URL` (env var) with project number, gets back:
  ```json
  {
    "projectNumber": "PRJ402065",
    "percentComplete": 42,
    "currentStep": "wire_routing",
    "stepStartedAt": "2026-04-25T08:00:00Z",
    "estimatedShipDate": "2026-05-14",
    "blockers": []
  }
  ```
- ARC stores the result in `eco.traqsSnapshotAtCreation` for audit
- ECO Editor's **Delivery Delta** tab shows: "Project is 42% complete (currently wire routing). This ECO requires a re-do of step X — adds ~3 days. Recommend new ship date: May 21."
- If TRAQS endpoint not configured, the field is hidden and engineer enters delivery delta manually (current behavior).

**Implementation pattern:** New helper `traqsClient.js` with `holdProject(payload)` and `getProjectStatus(projectNumber)` functions. Both gracefully no-op when env vars aren't set. Phase 6 includes wiring; Phase 8 polishes the UI integration.

### BC project Status flip

Whenever ANY ECO on a project enters a non-terminal active state (`draft`, `in_review`, `returned`, `sent`, `approved`, `in_production`), BC's project `Status` field is flipped to `"Quote"`. Per user decision: **flip on first `draft`** (the moment any ECO appears, even unfinished). When ALL ECOs on the project transition to terminal states (`completed`, `rejected`, `cancelled`), BC `Status` flips back to `"Open"`.

**Implementation:**
- Triggered by Cloud Function on ECO state change (Firestore trigger)
- Idempotent — safe to call multiple times even if BC is already in the target state
- Goes through the BC offline queue if BC is unreachable
- Project doc tracks `bcStatusForcedToQuote: boolean, bcStatusForcedToQuoteAt: ts` so we can audit when this happened and detect drift from BC

**Edge case:** If a user manually flips BC Status outside of ARC (e.g., directly in the BC UI), ARC has no automatic detection. Mitigation: a daily Cloud Scheduler job audits projects with active ECOs and re-asserts `Status:"Quote"` if drifted.

### BC sync resilience

- All BC writes go through the existing offline queue
- Retry up to 5 times with backoff (existing logic)
- After 5 failures, raise a notification to admin with the queue item details
- ECO state stays `approved` until engineer pushes via the review-and-accept gate; once pushed, advances to `in_production` only after BC actually accepts the writes
- Manual "Retry BC Sync" button in ECO Editor for stuck items

### Audit trail integrity

- ECOs are append-only — no delete, only state transitions to terminal states (`cancelled`, `rejected`, `completed`)
- Each state transition stamps timestamp + user id
- BC line-item IDs preserved in ECO doc for cross-system traceability
- Customer approval email saved as PDF in Storage with link in ECO doc
- A change made via `editUnlocked` (the legacy path) doesn't get auto-converted but does trigger a banner: "This project has untracked edits made on YYYY-MM-DD by USER (legacy unlock — pre-ECO system)"

### Customer-facing artifacts

- **ECO quote PDF** — distinct visual identity (purple accents, "Change Order Quote" header) so customer doesn't confuse it with the original quote
- **Approval email subject** — "[ARC] Change Order #N for PRJ#### — please review and approve"
- **Customer's signed approval** — PDF returned via portal, attached to ECO doc + uploaded to BC
- **Updated quote totals letter** — optional auto-generated summary letter after each ECO approval, showing the running grand total

### Pricing edge cases

- **Negative ECO** (customer asks to remove scope, gives a credit) — supported via `op:"remove"` rows. `deltaSell` can be negative.
- **Zero-cost ECO** (e.g., engineering clarification with no material/labor change) — still creates an ECO record with `deltaSell:0`. Useful for tracking scope changes that have no $ impact.
- **Time-and-materials ECO** (out-of-scope but possible) — handle by setting margin=0 on the ECO so cost passes through directly to sell. Out of scope for v1.

### Migration of existing post-PO edits

The codebase has existing projects where engineers used `editUnlocked` to make changes after PO. These are NOT auto-converted to ECOs because:

1. We can't reliably reverse-engineer what changed without a full audit log
2. The customer wasn't asked to formally approve the change
3. BC sync wasn't done with ECO context

Instead:
- A new banner appears on any project where `editUnlocked === true` AND `wonAt < ECO_INTRODUCED_DATE`: "Legacy unlock — changes made before ECO system. Future changes use ECOs."
- The `editUnlocked` flag remains and continues to work for backward compatibility
- Once all legacy projects are completed, the flag can be deprecated

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|-|-|-|-|
| Concurrent ECOs cause data loss | Medium | High | Single-active-ECO constraint enforced server-side + merge-by-id save guards |
| BC sync fails silently | High | Medium | Existing offline queue + admin notification on 5x failure + manual retry button |
| Customer approval email lands in spam | High | Medium | Use existing SendGrid domain (already DKIM/SPF set up) + clear sender address |
| Pricing calc bugs cause wrong invoice | Medium | High | Snapshot margin used at ECO creation time; pricing is recomputed from delta data on every render with audit log |
| Drawing storage bloat | Low | Low | Each ECO adds N pages × revs to Storage; with 25MB file limit and reasonable usage, won't exceed quota for years |
| ECO scope creep (engineer keeps adding to one ECO) | Medium | Low | UX nudge: warn when an ECO crosses 10 row changes "Consider splitting into multiple ECOs for clarity" |
| State machine bugs cause stuck ECOs | Medium | Medium | Comprehensive state-transition unit tests; admin "force state" override for emergencies |
| Customer rejects ECO partially (wants some changes, not others) | High | Medium | Customer must approve or reject the whole ECO. Engineer splits into multiple ECOs upfront if needed (UX guidance) |
| Cloud Function cold starts delay notifications | Low | Low | Acceptable; existing customer-review trigger has same pattern and works fine |
| Race condition: customer approves while engineer is editing | Medium | High | Once status flips to `sent`, ECO is locked client-side. Customer approval API is server-side via Cloud Function, can't conflict with client edits. |
| Migration breaks old projects | Medium | High | Schema migration is additive only (new fields with defaults); old projects work unchanged |

---

## Open questions — resolved + remaining

### Resolved during 2026-04-28 PM review

1. ✅ **One ECO vs multiple concurrent** — multiple in flight. Different drivers ok.
2. ✅ **Customer approval format** — Customer Portal (existing reviewUploads pipeline) + confirmation email with PDF attachment.
3. ✅ **Quote number format** — `MTX-Q202000 - ECO02`. Header text changes from `QUOTE` → `ENGINEERING CHANGE ORDER`.
4. ✅ **ECO margin** — different from base. New configurable defaults: 40% margin, $65/hr labor. Plus salesperson-discretion expediting cost.
5. ✅ **Auto BC sync** — NOT auto on customer approval. Engineer review-and-accept gate before push.
6. ✅ **ECO cancellation email** — deferred (project cancellations as a whole shelved for later discussion).
7. ✅ **Rev sub-counts** — none. ECO numbers are single integers (1, 2, 3, …); internal `lastEcoHash` tracks edits silently.
8. ✅ **Reports tab** — yes, ECO summary in Reports modal. Phase 8.
9. ✅ **Approver permission** — reuse existing `permissions.reviewer` flag.
10. ✅ **Drawing markup carryover** — ECO #2 sees ECO #1's baked drawings as base, can add its own; markup carries `ecoTag`.
11. ✅ **BC Status flip timing** — on first `draft` (any ECO appears).
12. ✅ **Internal-only ECOs flip BC Status** — yes, any active change is a change.
13. ✅ **Concurrent ECO conflict** — none. ECOs are stacked +/− with no rebase logic. Sum it all.
14. ✅ **Single BOM separator** — yes, one horizontal divider per panel; original above, all ECO items below (each row carries its own `[ECO N]` badge).
15. ✅ **Outlook Reply-To-Thread for ECO send** — yes, mirrors existing QuoteSendModal.
16. ✅ **TRAQS production-state hook** — HOLD trigger + percent-complete query, both via env-var-configured webhooks.
17. ✅ **ECO threading comments** — yes, `eco.comments[]` array.
18. ✅ **Email AI monitoring for ECO suggestions** — out of v1 scope, deferred to v2.
19. ✅ **Per-customer ECO templates** — out of scope. One template.
20. ✅ **Multi-currency** — out of scope. USD only.
21. ✅ **Pre-PO ECOs** — disallowed. ECO requires `bcPoStatus === "Open"` (BC project flipped to "Open" by PO receipt).
22. ✅ **ECO creation methods** — (a) drawing upload + AI extraction with diff-against-existing logic, (b) manual row entry. Both supported in v1.

### Remaining open

A. **Default override permission** — should ANY salesperson be able to override `marginUsed` / `laborRateUsed` per ECO, or admin-only? My lean: salesperson can override down (sale concession), admin required to override up (no surprise pricing). Open for confirmation.

B. **Project cancellation** — explicitly shelved per user; will be tackled in a separate plan. Document as "TODO: separate plan."

C. **TRAQS hook payload schema** — need to coordinate with Max + Treysen on exact payload shape (field names, units, error responses). Plan defines a reasonable starting schema; final shape TBD when TRAQS API is implemented.

D. **ECO completion trigger** — what marks an ECO as `completed`? Options:
    - Manual: admin clicks "Mark Completed" when production confirms ECO scope is built
    - Automatic: when project's `bcPoStatus → purchased`/`Completed` AND all ECO items are produced
    - TRAQS-driven: TRAQS reports per-ECO completion via webhook back to ARC
    Lean: manual for v1; automate later via TRAQS (hook).

E. **Drawing approval pipeline reuse** — user said "Use Customer Portal for ECO approvals along with drawing revision approvals, same pipeline." The existing portal's `reviewUploads/{token}` flow handles the data. But the portal's UI text/branding needs to dynamically render either "Drawing Review" or "Engineering Change Order Approval" or "Drawing Revision Approval" based on token kind. Just confirming the implementation approach is "branch on `info.kind`" rather than separate pipelines.

F. **`eco.kind` semantics** — three kinds proposed (customer_change, internal_change, scope_correction). Question: should `internal_change` ECOs still notify customer (FYI email), or stay silent? My lean: silent unless cost > $0; if there IS a charge, it's de-facto customer-change.

---

## Summary table — implementation phases at a glance

| Phase | Scope | New code | Modifies existing | New Firestore | New Cloud Functions | Risk |
|-|-|-|-|-|-|-|
| 1 | Schema + CRUD shell + scope tabs | `EcoScopeTabs`, `EcoEditor` shell, schema migration | rules, project doc, Badge, ProjectView | `ecos/{ecoId}` collection | stubs only | Low |
| 2 | BOM editing (manual + AI-extract diff) within ECO scope | tagged-row UI, separator rendering, AI-extract diff logic | PanelCard, BomTable, save guards, addFiles extraction path | row-level fields | none | Med |
| 3 | Labor + delivery delta + ECO pricing config + comments thread | Labor/delivery tabs, expediting field, comments component | QuoteView aggregation, pricing config | extends ECO schema | none | Low |
| 4 | ECO quote + send (Outlook reply-to-thread) | header swap, ECO summary in description, shared send-helper | QuoteSendModal refactor | none | `sendEcoQuoteEmail` | Med |
| 5 | Customer review portal for ECOs | portal kind branching | reviewUploads schema, portal.js | extends reviewUploads | `onEcoCustomerApproved`, `onEcoCustomerRejected` | Med |
| 6 | BC sync + review-and-accept gate + TRAQS hooks | `EcoBcReviewModal`, `bcSyncEcoPlanningLines`, `traqsClient.js` | queue types, BC cleanup, status flip | none | `onEcoStatusChange` (status-flip + TRAQS hold) | **High** |
| 7 | Drawing revisions per ECO | new stamp modes, ECO drawings tab, ecoTag on reviewNotes/Shapes | `burnStampCanvas`, `buildAndAttachPdf` | extends pages schema | none | Med |
| 8 | Production traveler + completion + history viewer + Reports tab | traveler integration, EcoHistoryModal, Reports `All ECOs` tab | traveler builder, ReportsModal | none | none | Low |

---

## Touchpoint breadth (why this is "significant")

For accountability, here's the count of areas modified:

- **`src/app.jsx`**: ~15 sections modified (state machine, badges, ProjectView, PanelListView, PanelCard, QuoteView, QuoteTab, QuoteSendModal, buildAndAttachPdf, burnStampCanvas, save guards, plus several net new components)
- **`firestore.rules`**: 1 major new section (ECO collection rules) + helpers
- **`functions/`**: 1 new module (`functions/ecos/`) with ~5 new Cloud Functions, plus extensions to existing engineering and core modules
- **`public/modules/engineering/portal.js`**: extended with ECO-aware rendering
- **`public/modules/engineering/portal.html`**: minor (probably just a CSS tweak or two)
- **`storage.rules`**: no change expected (existing rules work for ECO drawings)
- **CLAUDE.md**: significant additions documenting the ECO system

Total phases: 8. Total estimated working time: 4–6 weeks at one phase per few days, with verification time.

---

## What this plan deliberately does NOT include

- **AI-powered ECO suggestion** ("AI looked at your customer's email and suggested an ECO with these parts") — feasible but out of scope for v1.
- **Per-customer ECO templates** ("this customer always orders these change orders") — out of scope.
- **ECO time tracking integration** (link to Tempo or similar) — out of scope.
- **Multi-currency ECO pricing** — out of scope. ECOs use the project's primary currency.
- **ECO collaboration / comments threading** — single text field per ECO is enough for v1.
- **ECO on quotes that haven't reached PO yet** — not an ECO, that's just a quote rev. Refused at the data model level (ECOs require `wonAt` set).

These can be follow-up plans if there's appetite.

---

## Final thought

ECOs are an architectural addition, not a refactor. The plan layers on top of existing systems without replacing any of them:

- The base quote system continues to work for new projects without ECOs
- The base review system continues to work for non-ECO customer reviews
- The base BC sync continues to work for non-ECO planning lines
- The base traveler continues to work for non-ECO production

ECOs are an **opt-in upgrade**: they only exist on projects that have one. Projects without ECOs see no behavior change.

This makes the rollout low-risk — we can ship Phase 1, see how engineers use it on real change orders, and iterate before committing to the more invasive phases (BC sync, drawings).

Recommended starting point when the user is back: **Phase 1**, deployed to a test project, with a real customer change order walked through end-to-end on paper before committing to Phase 2.

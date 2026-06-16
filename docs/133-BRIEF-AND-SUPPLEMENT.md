# #133 Send Traveler BOM to Customer — Brief + Supplement

---

## BRIEF (Author: Freddy Lyst, 2026-06-16, Status: LOCKED)

### 1. PURPOSE
Send the customer the EXISTING Matrix-generated traveler BOM (the production
document with the cross column showing BOM differences) so they can review/
approve the BOM before issuing a PO. Gates PO acceptance, customer-facing.

### 2. WHAT THIS IS NOT (scope boundaries)
- Not a new document — reuse the existing traveler BOM render as-is.
- Not the schematic / full drawing set — BOM only.
- Not an in-app approve/reject workflow — customer responds out of band (email).
- Not a customer portal — ARC has no portal today; this is attachment-only
  delivery. Portal is a SEPARATE future item (see §8).
- Not a Send Quote redesign — one toggle added, nothing restructured.

### 3. DELIVERY MODES (both reuse the existing traveler render + Path C send, #117)
Mode 1 — STANDALONE: a separate send action, BOM-only, independent of any quote.
  Trigger in the quoting stage emails the traveler BOM with its own short
  "for your review/approval" cover message.
Mode 2 — BUNDLED: an option in the Send Quote flow to include the traveler BOM
  as an additional attachment alongside the quote PDF, in a single send.

### 4. NEW WORK (product surface)
- Standalone send trigger/button in the quoting stage. Freddy proposes a home
  alongside the existing quote/send actions on the project quote view — confirm
  a natural placement.
- "Include Traveler BOM" toggle in the Send Quote modal.
- Standalone-mode email copy (subject + short body). Bundled mode uses the
  existing quote email; the BOM rides as an extra attachment.

### 5. LOCKED DECISIONS
D1 — Bundled toggle default: OFF (opt-in). Toggle in the Send Quote modal
     defaults unchecked; user opts in per send.
D2 — Trust gate: YES. Both modes block/hard-warn when the BOM is still flagged
     manualVerifyRequired. Emailing an unverified BOM to a customer for approval
     is exactly the silent-bad-data failure the #103–#112 trust layer prevents.
     The #117 checks (payment terms / shipping method) are QUOTE fields and may
     not all map to a BOM-only send — the PRINCIPLE carries, the exact gate
     mapping for a BOM-only send is yours to define. Tell me the right hook.
D3 — Send record: a FIRST-CLASS approval-request record on the project, NOT a
     throwaway log line. Minimum fields: timestamp, recipient, mode
     (standalone/bundled), and a `status` field set to `sent` now, with
     `approved` / `rejected` / `commented` RESERVED but unused. Rationale: when
     the customer portal is eventually built (§8), customer actions write into a
     record that already exists rather than forcing a retrofit. We are NOT
     building portal write-back now and NOT abstracting the send path toward it —
     only the record shape carries the reservation.

### 6. ASSUMPTIONS TO VERIFY (Supplement)
A1. Traveler BOM exists as an attachable artifact (or cheaply renderable on
    demand) at send time.
A2. Path C (#117) send can carry the traveler BOM as the SOLE attachment
    (standalone) and as an ADDITIONAL attachment (bundled) without a refactor.
A3. manualVerifyRequired (or the right equivalent) is queryable at send time so
    D2's gate fires in both modes.
A4. Quoting stage has a home for the standalone trigger; Send Quote modal can
    host the toggle without restructuring.
A5. D3 record: confirm the right collection/field shape for a project-scoped
    approval-request record with a reserved-status field.

### 7. RISKS TO FLAG
- Any place the traveler BOM render is coupled to the quote pipeline such that a
  standalone (no-quote) send can't reach it.
- Whether bundled mode's attachment plumbing in Path C is additive or assumes a
  single attachment.
- The D2 gate hook: confirm a BOM-only send can read the same verification state
  the quote path reads.
- D3: avoid over-building — reserve the status values, do NOT add portal
  write-back logic or a send-path abstraction targeting the portal.

### 8. OUT OF SCOPE — LOGGED SEPARATELY
Customer Portal (NEW backlog item): hosted customer-facing surface for BOM
review with in-app comments + approve/reject write-back. Net-new infrastructure
(external auth, hosted document views, action write-back, notifications). Its
own milestone, NOT part of #133. #133's D3 record is the only forward-hook;
nothing else is built toward it now.

---

## SUPPLEMENT (Author: Sam Wize / Coach, 2026-06-16)

### Identity Clarification: Which Document Is "the Traveler BOM"?

Two existing BOM documents exist in the codebase. The Brief's phrasing — "the
production document with the cross column showing BOM differences" — resolves
unambiguously to the **cover-page BOM table** inside `buildCoverPage`, NOT the
separate BOM Report.

| Document | Function | Location | Cross column? | Per- |
|----------|----------|----------|---------------|------|
| **Cover-page BOM** (traveler) | `buildCoverPage()` | `app.jsx:7812` | YES — "Original Part #" when `hasCrosses` (line 7988) | Panel |
| **BOM Report** (spreadsheet) | `buildBomReportPdfDoc()` | `app.jsx:7453` | NO — ARC Item # / Ref Dwg # / Qty / Description / MFR | Project |

The cover-page BOM is the document stamped "PANEL PRODUCTION TRAVELER" (line
7839). It includes labor summary, a BOM table with crossed-part highlighting
(bold rows, italic original PN), and flows across pages via autoTable. This is
what the Brief means.

**Architectural consequence:** `buildCoverPage` is per-panel. A multi-panel
project needs one traveler per panel. The send must iterate
`project.panels` and build N cover pages (one per panel) into a single PDF, or
attach N separate PDFs. Recommend: single PDF, all panels sequentially (matches
the existing BC upload flow at `buildAndAttachPdf`, line 24194, which builds
cover + stamped drawings per panel into one doc).

---

### A1 — Traveler BOM: Attachable Artifact or Render-on-Demand?

**VERDICT: Render-on-demand. No stored artifact exists.**

The traveler is NOT pre-built or cached. `buildCoverPage` (line 7812) is called
at two sites:
1. `buildAndAttachPdf` (line 24212) — inside PanelCard, builds cover +
   stamped drawing pages → uploads to BC.
2. Nowhere else.

There is no stored PDF, no Firestore field, no Storage path holding a rendered
traveler. It's always built from live panel data at call time.

**Feasibility:** `buildCoverPage` takes `(doc, panel, bcProjectNumber,
quoteData, lineIdx, W, H, opts)`. All inputs are available from the project
object at send time:
- `panel` → `project.panels[i]`
- `bcProjectNumber` → `project.bcProjectNumber`
- `quoteData` → `project.quote`
- `lineIdx` → panel index
- `W, H` → can use Letter landscape defaults (431.8mm × 279.4mm) since
  we're not matching stamped drawing page sizes

**New function needed:** A thin wrapper that iterates panels and calls
`buildCoverPage` for each, returning a single jsPDF document. ~15 lines.
Pattern mirrors `buildBomReportPdfDoc` which already exists as a standalone
project-level PDF builder at module scope (line 7453). No coupling to PanelCard
component state — `buildCoverPage` is a pure function (takes data, writes to
doc object).

```
async function generateTravelerBomPdf(project) {
  const jsPDF = await ensureJsPDF();
  const doc = new jsPDF({unit:"mm", format:[431.8, 279.4], orientation:"landscape"});
  const panels = project.panels || [];
  for (let i = 0; i < panels.length; i++) {
    if (i > 0) doc.addPage([431.8, 279.4], "landscape");
    await buildCoverPage(doc, panels[i], project.bcProjectNumber,
      project.quote, i, 431.8, 279.4);
  }
  return doc;
}
```

**Risk: None.** `buildCoverPage` is a stateless PDF builder. No component
refs, no hooks, no side effects. The wrapper is mechanical.

---

### A2 — Path C Send: Sole and Additional Attachment Without Refactor

**VERDICT: CONFIRMED. Both paths are refactor-free.**

Two send functions exist, both already support `extraAttachments`:

#### `sendGraphEmail` (line 8103)
Signature: `(graphToken, to, subject, htmlBody, pdfBase64, pdfFilename, extraAttachments)`

The `extraAttachments` parameter (added in v1.19.931 for "Send w/BOM") is an
array of `{pdfBase64, pdfFilename}` objects. The function builds an `atts[]`
array, pushes the primary PDF (if present), then pushes all extra attachments
(lines 8113-8120). The primary PDF is optional — when `pdfBase64` is falsy, it's
simply not pushed (line 8114: `if(pdfBase64)`).

**Standalone mode:** Pass `null` for pdfBase64/pdfFilename, put the traveler
in `extraAttachments`. Or pass the traveler as the primary attachment. Either
works — no refactor.

**Bundled mode:** Quote PDF is the primary attachment, traveler goes into
`extraAttachments`. Exact same pattern as existing "Send w/BOM" (line 31946-31957).

#### `graphReplyToMessage` (line 8213)
Same `extraAttachments` support (lines 8220-8232). Reply-all mode gets the same
multi-attachment treatment.

**Both call sites in `QuoteSendModal.handleSend`** (lines 31974, 31976) already
pass `extraAttachments`. Adding the traveler is additive — push one more object
into the array.

**The inline send path in ProjectView** (line 37264-37272) also supports
`extraAttachments` via `_extraAtts`. Same pattern applies.

**Graph API size limit:** The 4MB inline attachment cap (warned at line 31963)
applies to the total of ALL attachments combined. A traveler cover-page PDF
is typically 50-200KB (text + table, no images). A quote PDF is 100-400KB.
Combined is well under 4MB. No concern here.

**RISK: None.** The plumbing is already multi-attachment. Adding one more
attachment is a push to an existing array.

---

### A3 — D2 Trust Gate: manualVerifyRequired Queryable at Send Time

**VERDICT: CONFIRMED. The exact hook already exists.**

`manualVerifyRequired` lives at `panel.extractionReport.manualVerifyRequired`
(boolean). It's set during extraction (line 14537) and persisted to Firestore
as part of the panel's `extractionReport` object. It survives save-reload
cycles.

The existing gate is `findIncompleteQuoteItems(project)` (line 15541). It:
1. Iterates all panels (line 15550)
2. Checks `pan.extractionReport?.manualVerifyRequired` (line 15555)
3. Returns items with `isVerificationBlock: true` for flagged panels

This function is project-level, takes `project` as input, and returns a flat
array. It's used by:
- `QuoteSendModal.handleSend` (line 31852) — hard-blocks send
- `handlePrintQuote` (line 36254) — soft-warns before print
- The inline ProjectView send (line 37239) — hard-blocks

**For #133 standalone mode:** Call `findIncompleteQuoteItems(project)` and
check `.some(i => i.isVerificationBlock)`. If true, hard-block the BOM send.
This gives exactly D2's intent.

**Gate mapping for BOM-only send:**
The full `findIncompleteQuoteItems` also checks pricing completeness (missing
price, qty, stale priceDate). For a BOM-only send (not a quote), the pricing
checks are irrelevant — the customer is reviewing part numbers, not prices.

**Recommended hook:** Filter to verification blocks only:
```
const issues = findIncompleteQuoteItems(project);
const verifyBlocked = issues.some(i => i.isVerificationBlock);
```
This gates on "is the BOM trustworthy" (D2's intent) without gating on "is
the quote complete" (irrelevant for BOM-only).

For **bundled mode**, the full `findIncompleteQuoteItems` gate fires naturally
because the quote send path already checks everything — no new gate needed.
The traveler just rides along.

**The #117 BC-populate gate** (`ensureQuoteFieldsPopulated`, line 31915) checks
payment terms and shipping method. For standalone BOM send:
- Payment Terms / Shipping Method are quote fields. A BOM-only send doesn't
  need them. **Skip** `ensureQuoteFieldsPopulated` for standalone mode.
- For bundled mode, the gate already fires in the quote send path.

---

### A4 — UI Placement: Standalone Trigger and Bundled Toggle

**VERDICT: Both surfaces exist and can host the new controls without
restructuring.**

#### Standalone trigger — QUOTE SUMMARY (PanelListView)

The quoting-stage action cluster lives in `PanelListView` around line 34659.
The "Send / Print Quote" button (line 34726) occupies the full width of the
action area. Below it: the "sent" confirmation, the sent-quote soft-block
banner, and the edit-enable button.

**Recommended placement:** A new button below the Send/Print Quote button,
styled distinctly (e.g., amber/warm to distinguish from the blue quote send):

```
📋 Send Traveler BOM for Approval
```

This is the same vertical stack pattern as the existing button. The quoting
stage already has a scrollable action area — one more button doesn't crowd it.

**Data availability:** `PanelListView` receives `project` and `uid` as props
(line 32396). All data needed for `buildCoverPage` is accessible. The Graph
token acquisition (`acquireGraphToken`) is module-scope. The recipient email
can default to `project.bcContactEmail` or `project.quote?.email`.

#### Bundled toggle — QuoteSendModal

`QuoteSendModal` (line 31796) has a clean footer with 3 buttons: Cancel, Just
Print, Send, Send w/BOM (lines 32117-32131). The toggle belongs in the modal
body, above the footer buttons. Pattern:

```
☐ Include Traveler BOM
```

A checkbox/toggle in the `<div style={{flex:1,overflow:"auto"}}>` container
(line 32027), below the message textarea. When checked, `handleSend` builds
the traveler PDF and pushes it into `extraAttachments` alongside any BOM
Report (if "Send w/BOM" is also used — they're independent).

The inline ProjectView send path (line 37209) should get the same toggle for
consistency.

**RISK: None.** Both surfaces are additive — no restructuring of existing
components.

---

### A5 — D3 Record Shape

**VERDICT: Project-level array field. Not a subcollection.**

#### Why not a subcollection

ARC's project record is a single Firestore document at
`users/{uid}/projects/{id}` (or `companies/{cid}/projects/{id}`). Metadata
like `quoteSentAt`, `quoteSentRev`, `quoteSentTo`, `quoteLocked` are top-level
fields on this document (line 31994). The project doc is loaded once and kept
in React state — subcollection reads require separate listeners.

A subcollection (`projects/{id}/bomApprovalRequests/{reqId}`) would be
cleaner for the future portal (each request = a doc, portal writes to its own
doc), but it introduces a new listener, new Firestore rules, and crosses the
"don't over-build" boundary in D3's explicit guidance.

#### Recommended shape: `bomApprovalRequests` array on the project doc

```js
project.bomApprovalRequests = [
  {
    id: "bar_<timestamp>",         // stable ID for future portal write-back
    sentAt: 1718553600000,         // Date.now() at send time
    sentTo: "customer@example.com",
    sentBy: "uid",                 // Firebase UID of the sender
    mode: "standalone",            // "standalone" | "bundled"
    panels: ["panel-1"],           // which panels were included
    quoteRev: 0,                   // quote rev at send time (null for standalone)
    status: "sent",                // "sent" now; "approved"/"rejected"/"commented" RESERVED
    // RESERVED fields (portal write-back, not implemented now):
    // respondedAt: null,
    // responseNote: null,
  }
];
```

**Why an array, not a map:** Arrays are simpler to push to (Firestore
`arrayUnion`), simpler to render as a timeline, and the cardinality is low
(a project might have 1-5 BOM sends over its lifetime). A map keyed by ID
would work too, but adds no value at this scale.

**Why `id` with a prefix:** `bar_` (BOM Approval Request) prefix + timestamp
makes IDs grep-friendly and gives the future portal a stable key to write back
to. `arrayUnion` is idempotent on the full object, so double-sends don't
create duplicates.

**Why `panels[]`:** The traveler is per-panel. Recording which panels were
sent lets the future portal scope its review to the right panels. For "all
panels" sends, this is `project.panels.map(p => p.id)`.

**Firestore rules:** No new rules needed — the array lives on the project
document, which is already gated by `request.auth.uid == uid` (user path) or
`canWrite()` (company path).

**Save mechanism:** `safeSave(uid, {...project, bomApprovalRequests:
[...(project.bomApprovalRequests||[]), newRecord]})`. Same pattern as
`quoteSentAt` stamping in `handleSend` (line 31994).

---

### Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| `buildCoverPage` coupled to PanelCard | **None** — it's a stateless function at module scope (line 7812). Takes data args, writes to jsPDF doc. No component refs or hooks. | Wrapper iterates panels, calls directly. |
| Multi-attachment size exceeds 4MB Graph limit | **Low** — traveler PDFs are text-only (50-200KB). Quote + BOM Report + traveler combined would be ~500KB-1MB typically. | Existing 3MB warning (line 31963) covers this. No change needed. |
| Standalone send fires without BC populated fields | **None by design** — BOM-only send doesn't need payment terms or shipping method. Skip `ensureQuoteFieldsPopulated`. | Gate only on `manualVerifyRequired` via `findIncompleteQuoteItems` filtered to `isVerificationBlock`. |
| D3 array grows unbounded | **Negligible** — 1-5 entries per project lifetime. Each entry is ~200 bytes. Firestore 1MB doc limit is not a concern. | No cap needed. |
| Bundled toggle + "Send w/BOM" both active = 3 attachments | **Low** — valid use case (quote + BOM report + traveler). Graph handles it. | Log the attachment count for diagnostics. |
| Standalone path bypasses quote-lock (`quoteLocked`) | **By design** — BOM send is not a quote send. It shouldn't lock the quote. | `bomApprovalRequests` is the separate audit trail. |

---

### Implementation Scope Estimate

| Component | Lines | Complexity |
|-----------|-------|------------|
| `generateTravelerBomPdf(project)` wrapper | ~15 | Low — iterates panels, calls `buildCoverPage` |
| Standalone send handler + modal | ~60-80 | Medium — mirrors existing `handleSend`, simpler (no reply-to-thread, no BC populate, no AI-lead-time check) |
| "Send Traveler BOM" button in PanelListView | ~15 | Low — styled button, onClick opens modal |
| "Include Traveler BOM" toggle in QuoteSendModal | ~10 | Low — checkbox state, push to extraAttachments |
| Same toggle in ProjectView inline send | ~10 | Low — same pattern |
| D3 record write (both paths) | ~15 | Low — build object, push to array, safeSave |
| D2 gate (standalone path) | ~5 | Low — filter findIncompleteQuoteItems |
| **Total** | **~130-150** | **Medium overall** |

Single session, no H-item discipline needed (no extraction/save-path/pricing
changes). Recommend Marc implements with Coach post-deploy review.

---

### Carve-outs (explicit non-scope per Brief §2, §7, §8)

1. No portal write-back logic. `status` field is written once as `"sent"` and
   never updated by #133 code.
2. No send-path abstraction. The standalone handler is its own function, not a
   generalized "send document" framework.
3. No quote email restructuring. Bundled mode pushes one attachment. That's it.
4. No pre-rendered/cached traveler PDF. Render-on-demand is fast enough
   (~100-300ms for a typical panel) and avoids cache-invalidation complexity.

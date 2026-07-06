# F001 — Quote-Building Walkthrough — STEP CONTENT (from Jon)

**Source:** `ARC Training.docx` (Jon, 2026-07-06). **For:** F001 engine + Coach Supplement.
**Format:** each step = WHERE (→ `data-tour` anchor) / WHAT TO DO (instruction) / HOW YOU KNOW (advance trigger).

Below: Jon's steps verbatim + a Freddy **[step-type]** annotation (gated-hands-on / narrated / async-external) — see §Findings.

---

## Step 1 — Create Project in ARC  **[gated]**
- **WHERE:** Home page → **+ New Project** button.
- **WHAT TO DO:** Click **+ New Project** → enter **PROJECT NAME** (customer-provided) → enter **# of Panels** → select **Customer** (or add new) → select **Salesperson** (auto-fills to the user if it's them) → choose **Project Manager** (typically Max Parkinson) → choose **Engineer** (typically Andrew Brunt) → click **Create Project**.
- **HOW YOU KNOW:** New Project pane opens with blank lines; PRJ# assigned; project name shown under the PRJ#; people correctly chosen; # of line items = the number selected.
- *Anchors:* +New Project btn, name field, #panels field, customer dropdown, salesperson, PM, engineer, Create Project btn. Advance on Create → new-project pane appears (navigate/appear).

## Step 2 — Create folders on Network  **[gated — but the action is OUT-OF-APP]**
- **WHERE:** Pre-Quote modal.
- **WHAT TO DO:** A pop-up modal explains the user should now create a folder on the Matrix network and save all customer files to the Quote folder.
- **HOW YOU KNOW:** ARC runs the modal; user selects **"Done…Continue to Project Quote"**.
- *Note:* the folder creation happens on the file system (outside ARC) — the tour instructs; advance on the modal's Done/Continue click.

## Step 3 — Extract Drawings  **[async — hardest to gate]**
- **WHERE:** Project page.
- **WHAT TO DO:** Drag the customer drawings into the **DRAWINGS** section of each line item → extraction begins → ARC asks you to verify page types & region out sections → when extraction finishes, BOM populates.
- **HOW YOU KNOW:** Extraction completes; ARC has pulled vendor pricing + applied AI prices/lead times.
- *Complexity:* drag-drop detection + a LONG async run (minutes) + intermediate verify-page-type / region sub-UIs. Can't be "gated" in real time cleanly.

## Step 4A — Red rows with chips in the "Issues" column  **[narrated]**
- **WHERE:** Project page.
- **WHAT TO DO:** Three possible issues to look for: **Confidence chip** (Red=Low / Yellow=Medium; High hidden), **BC chip** (Blue=in BC, match & link / Yellow=close match, match & link / Red=not in BC, needs match).
- **HOW YOU KNOW:** Issues column is empty when the row is clear.
- *Anchors:* the Issues-column chips — **these EXIST (F002/F003 shipped).** Explanatory, not a click-action → narrated (Next).

## Step 4B — Red row with stale lead time and/or price  **[narrated → leads to 4Ba]**
- **WHERE:** Project page.
- **WHAT TO DO:** Send RFQs to get pricing + lead times from suppliers.
- **HOW YOU KNOW:** Priced Date turns green/yellow; Lead becomes non-italic.

## Step 4Ba — Send RFQs  **[gated]**
- **WHERE:** Project page.
- **WHAT TO DO:** Click **Send/Print RFQs** → select vendors → preview the RFQ → click **Send**.
- **HOW YOU KNOW:** Modal shows **"All RFQs Sent"** with an active Close button.

## Step 4Bb — Receive Supplier Quotes  **[async-external — can't complete in one sitting]**
- **WHERE:** Project page.
- **WHAT TO DO:** User gets an email that a new quote is ready; the project tile shows "# RFQs." Click **Upload Quote**, review the submitted lines, accept to import. Mark any row needing tech review via the **TR checkbox** → puts the quote into Tech-Review-required status; the engineer must approve/reject.
- **HOW YOU KNOW:** Upload Quote button no longer shows a (#).
- *Dependency:* waits on the SUPPLIER emailing a quote back (hours–days). TR checkbox = F003 (exists).

## Step 5 — Send for Technical Review  **[gated]**
- **WHERE:** Project page.
- **WHAT TO DO:** Click **Send for Tech. Review** → choose an engineer.
- **HOW YOU KNOW:** The "In Pre-Review – awaiting…" overlay appears over the Send-for-Tech-Review button. *(F003.)*

## Step 6 — Receive Returned Tech Review  **[async-external — waits on the engineer]**
- **WHERE:** Project page.
- **WHAT TO DO:** The rows the user flagged should come back approved with a green circle checkmark.
- **HOW YOU KNOW:** All flagged TR checkboxes show green checks (approved). *(F003 engineer green-circle.)*
- *Dependency:* waits on the ENGINEER approving (external actor, async).

## Step 7 — Verify BOM rows are clean; Send Quote  **[gated]**
- **WHERE:** Project page.
- **WHAT TO DO:** Verify no red rows / stale prices / stale lead times → click **Send Quote**.
- **HOW YOU KNOW:** Send-Blocked overlay is gone; Send Quote shows. After sending, the project locks with an overlay (customer received the quote; no changes). Sending to yourself still locks it as if sent to the customer.

---

## FINDINGS (Freddy) — these reshape F001 scope; need Jon's read before routing to build

### F1 — The walkthrough spans the WHOLE APP, not just the BOM
Anchors needed across ~7 flows: New-Project modal, pre-quote modal, drawings drop zone, verify-page-type/region UIs, Issues chips (exist), RFQ send/vendor-select/preview, Upload Quote, TR checkbox (exists), Send-for-Tech-Review, engineer green circle (exists), Send Quote, lock overlay. **Only the F002/F003 BOM anchors exist today** — the build must add `data-tour` anchors across the whole quote-build flow (many components). Bigger than the Brief's BOM-centric assumption; the **engine** is unchanged, but the **anchor-tagging surface** is large.

### F2 — Several steps CAN'T be gated in one live sitting (the big one)
The walkthrough is a **multi-day lifecycle**, not a 5-minute click-through:
- **Step 3 (extraction)** — a long async run (minutes) + drag-drop + intermediate sub-UIs.
- **Step 4Bb (receive supplier quotes)** — waits on the supplier emailing a quote back (hours–days).
- **Step 6 (receive tech review)** — waits on the engineer approving (external actor).
Pure "gated hands-on" (D1) can't cover these — the tour would stall waiting on time/other people. **Design options for Jon:**
- **(a) Mixed step-types** — gated for interactive clicks; **narrated** for explanations (4A/4B); **"checkpoint / resume-later"** for the async-external waits (tour pauses at "you'll continue when the quote/review arrives," re-entrant later).
- **(b) Split into phase walkthroughs** — e.g. "Create & Extract," "RFQ & Pricing," "Tech Review & Send" — each a separate tour the user runs at the right time.
- **(c) Two modes** — a full **read-through** guide (all 7 steps, narrated) + a **gated hands-on** only for the single-sitting-safe steps.
- Freddy lean: **(a)** — one re-entrant walkthrough with per-step types (gated / narrated / checkpoint), so it mirrors the real lifecycle without stalling.

### Next
Jon rules F2 (how to handle the async/external steps) → route Brief + these steps to **Coach** for the engine Supplement + `data-tour` anchor inventory across the flow + feasibility of the drag/async/external triggers → Plan → build.

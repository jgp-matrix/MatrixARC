# #193 Send To Sales — Codebase Verification Supplement

**Author:** Sam Wize (Coach)  
**Date:** 2026-07-01  
**Type:** Read-only codebase verification (no code)  
**Scope:** QuoteSendModal tab structure, recipient wiring, send path, audit state, interactions

---

## 1. SEND QUOTE MODAL TAB STRUCTURE

### Active modal: `QuoteSendModal` component (line 32796)

This is the ONLY active send modal. Rendered at line 36019, opened via `setQuoteSendModalPLV`
at line 35877.

**Tab state:** `const [sendMode,setSendMode]=useState("new")` — line 32798. Default is `"new"`.

**Tab bar:** Lines 33078–33089. A flex row with two buttons:

```
┌────────────────┬─────────────────────┐
│  ✉ New Email   │  ↩ Reply to Thread  │
│  (default)     │                     │
└────────────────┴─────────────────────┘
```

| Tab | `sendMode` | Line | Accent |
|-----|-----------|------|--------|
| ✉ New Email | `"new"` | 33079–33083 | `C.accent` (blue) |
| ↩ Reply to Thread | `"reply"` | 33084–33088 | `#4ade80` (green) |

**Tab rendering:** Line 33091 — `{sendMode==="new"?( <New Email form> ):( <Reply search> )}`.
Standard ternary, easily extended to a multi-branch with `sendMode==="sales"` check.

### How to insert "Send To Sales" as the new default

1. **Add a third tab button** at line 33079 (BEFORE "New Email"):

   ```
   ┌──────────────────┬────────────────┬─────────────────────┐
   │  📩 Send To Sales │  ✉ New Email   │  ↩ Reply to Thread  │
   │  (DEFAULT)        │                │                     │
   └──────────────────┴────────────────┴─────────────────────┘
   ```

2. **Change default:** Line 32798 → `useState("sales")` (was `"new"`).

3. **Add tab content branch:** In the render at line 33091, either:
   - **Option A (minimal):** `sendMode==="sales"` renders the SAME form as `"new"` (To/Subject/
     Message/Signature inputs reading `modalData.*`) — just with different initial `to` value.
     No new JSX needed; the "sales" and "new" branches share the same form.
   - **Option B (distinct):** `sendMode==="sales"` renders a custom form with the `To` field
     pre-filled and visually marked (e.g., "Sending to yourself" subtitle). More polish,
     same functional behavior.

   **Recommendation: Option A.** The form is identical. The only difference is the pre-fill.
   The conditional at 33091 becomes:
   ```js
   {(sendMode==="new"||sendMode==="sales")?(
     <div>... same To/Subject/Message form ...</div>
   ):(
     <div>... Reply search ...</div>
   )}
   ```

### Dead code note

An inline send modal at lines 38449–38549 (`quoteSendModal` state, line 36662) exists but
is **unreachable** — `setQuoteSendModal` is never set to a non-null value. No button opens it.
**#193 does NOT need to touch this.** Only `QuoteSendModal` (the component) matters.

---

## 2. LOGGED-IN USER'S EMAIL — CANONICAL SOURCE

### `fbAuth.currentUser?.email`

This is the Firebase Auth user object. Available everywhere in the component tree.
Per-user — resolves to whichever user is logged in.

**Already used in the modal initialization context** (line 35875):
```js
const spEmail = spCached?.E_Mail || q.salesEmail || fbAuth.currentUser?.email || "";
```

**Other confirmed uses:** lines 522, 33053, 36564, 41835 — all resolve per-user.

### Resolution chain for "Send To Sales" `to` field

The cleanest source is **`fbAuth.currentUser?.email`** directly. No salesperson cache lookup
needed — the feature brief says "the LOGGED-IN user's own email," not "the project's assigned
salesperson's email."

**Per-user confirmed:** Each user session has its own `fbAuth.currentUser` object. Two users
on the same project see their own email. No cross-contamination.

### Where to inject

In the modal initialization at line 35877 (`setQuoteSendModalPLV({...})`), the `to` field
is currently `toEmail` (customer contact email). For the "Send To Sales" default tab, the
initial `to` value should be `fbAuth.currentUser?.email||""`.

**Two approaches:**

- **A. Set `to` at open time based on default tab:** If `sendMode` defaults to `"sales"`,
  initialize `to: fbAuth.currentUser?.email||""` in the `setQuoteSendModalPLV` call at
  line 35877. When the user switches tabs to "New Email," repopulate `to` with the customer
  email. This requires an `onClick` handler on each tab that also sets `modalData.to`.

- **B. Store both emails, swap on tab change:** Initialize `modalData` with both
  `salesTo: fbAuth.currentUser?.email||""` and `customerTo: toEmail`. Tab change swaps
  `modalData.to` to the appropriate value. Preserves edits within each tab's context.

  **Recommendation: Approach A** (simpler, matches existing pattern — tabs already call
  `setSendMode`, just extend to also set `to`).

---

## 3. RECIPIENT (SEND TO) FIELD WIRING

### Current wiring — "New Email" tab

**Input:** Line 33093–33094:
```jsx
<label>To</label>
<input value={modalData.to}
  onChange={e=>setModalData(prev=>({...prev,to:e.target.value}))}
  style={{...inp({fontSize:13})}}/>
```

- `modalData` is the state object passed as `modalData` prop (initialized at open time)
- `setModalData` is the state setter passed as `setModalData` prop
- The input is pre-filled with `modalData.to` and freely editable via `onChange`

**Pre-filled-but-editable is EXACTLY how this already works.** The customer email is pre-set
in `modalData.to` at line 35878 — the user can type over it. "Send To Sales" uses the same
mechanism with a different initial value.

### Validation on send

**Line 32899:** `if(sendMode==="new"&&!m.to.trim()){arcAlert("Enter a recipient email.");return;}`

If we treat `sendMode==="sales"` like `"new"` for validation purposes (or add `||sendMode==="sales"`)
to this guard, the same email validation applies. The regex check at lines 32904–32909 also
gates on `sendMode==="new"` — extend similarly.

**No new validation logic needed.** Just extend the existing `sendMode==="new"` guards to
include `"sales"`.

---

## 4. SEND PATH — REAL SEND CONFIRMED

### `handleSend(withBom)` — line 32858

The entire send flow is mode-agnostic except for three guards:

| Line | Guard | What it does | #193 impact |
|------|-------|-------------|-------------|
| 32899 | `sendMode==="new"&&!m.to.trim()` | Empty-recipient check | Extend to `\|\|sendMode==="sales"` |
| 32900 | `sendMode==="reply"&&!selectedThread` | Thread-selected check | No change — "sales" doesn't use threads |
| 32904 | `if(sendMode==="new")` | Email regex validation | Extend to `\|\|sendMode==="sales"` |
| 33019 | `if(sendMode==="reply")` | Reply vs new dispatch | No change — "sales" falls to `else` (same as "new") |

**Line 33019–33022 — the dispatch:**
```js
if(sendMode==="reply"){
  await graphReplyToMessage(graphToken,selectedThread.id,html,...);
}else{
  await sendGraphEmail(graphToken,m.to,_subject,html,...);
}
```

`sendMode==="sales"` hits the `else` branch — `sendGraphEmail` with `m.to` (the sales
user's email). **Identical email send mechanism.**

### Every send-path stamp applies to "Send To Sales"

| Stamp | Line | Applied? |
|-------|------|----------|
| `ensureQuoteFieldsPopulated` | 32915 | YES — runs before mode dispatch |
| `ensureQuoteNumber` (#191) | 32923 | YES — runs before mode dispatch |
| Payment terms / shipping validation | 32931 | YES — mode-agnostic |
| `quoteSentAt` | 33045 | YES — mode-agnostic |
| `quoteSentRev` | 33045 | YES |
| `quoteSentTo` | 33045 | YES — will record the sales user's email |
| `quoteLocked` | 33045 | YES |
| `quoteExpiresAt` (#187) | 33045 | YES — full validity cascade |
| BC sync (planning lines) | 33031 | YES |
| BC PDF attachment | 33067 | YES |
| BOM approval token (#137) | 32953 | YES (if "Include Quoted BOM" checked) |

**Verdict: zero divergence.** A "Send To Sales" send is functionally identical to a customer
send. The only difference is the recipient email address in `m.to`.

### `quoteSentTo` records the sales user's email

Line 33026: `const sentTo=sendMode==="reply"?...:m.to;` — for `sendMode==="sales"`, this
captures `m.to` which is the sales user's email. Then line 33045: `quoteSentTo:sentTo`.

The project dashboard shows `quoteSentTo` at line 35917:
```
✓ Quote sent Rev 00 to jon@matrixpci.com · Jun 30, '26
```

When "Send To Sales" is used, this shows the sales rep's email, not the customer's. **This
is correct per the brief** — the quote WAS sent to that address. If the user then re-sends
to the customer, `quoteSentTo` is overwritten with the customer email.

---

## 5. #194 HOOK — SENT-EMAIL AUDIT STATE

### No per-send log record exists

**Searched for:** `sentEmail`, `emailLog`, `emailHistory`, `emailAudit`, `quoteEmails`,
`sentLog` — **all returned zero matches.**

**`_logQvHistory`** (line 9154) logs events to `project.qvHistory[]` in Firestore. It
records: pricing refreshes, BC push, review submit/approve, supplier apply, re-extract,
review edits. **It does NOT log quote sends.** No `_logQvHistory` call exists anywhere
in `handleSend` or the surrounding send path.

### What IS persisted on send

Only project-level snapshot fields, overwritten on each send:

| Field | Persisted at | Survives re-send? |
|-------|-------------|-------------------|
| `quoteSentAt` | line 33045 | NO — overwritten |
| `quoteSentRev` | line 33045 | NO — overwritten |
| `quoteSentTo` | line 33045 | NO — overwritten |
| `quoteLocked` | line 33045 | Stays `true` |
| `quoteExpiresAt` | line 33045 | NO — overwritten |

**There is no array/subcollection of sent-email records.** Only the LATEST send snapshot
survives. A re-send (same or different rev) overwrites all fields. History of prior sends
(who received Rev 00 vs Rev 01, when) is lost.

### #194 implication

**#193 inherits whatever exists — which is nothing.** A "Send To Sales" send creates the
same snapshot fields as any other send. No audit trail, no email log.

**Flag for Jon:** If #194 needs a per-send log, the natural place is a `_logQvHistory` call
with `type:"quote_send"` inside `handleSend`, at line ~33046 (right after the stamp
assignment, before the try/catch persist). Fields: `{type:"quote_send", sendMode, sentTo,
quoteRev, quoteNumber, withBom, includeTravelerBom}`. This would capture every send
(including "Send To Sales") in the existing `qvHistory` array infrastructure.

**Decision needed:** Add the `_logQvHistory` call as part of #193 (minimal — one line), or
defer to #194 as a separate ticket? Adding it now means every send from this point forward
is logged, including sales sends. Deferring means #194 has to retrofit it and there's a
gap window.

### BOM approval requests ARE logged (different system)

Line 33046–33057: when `includeTravelerBom` is checked, a `bomApprovalRequests[]` array
entry is appended. This IS a durable log (array, not overwritten). But it only covers the
BOM approval flow, not the email send itself.

---

## 6. #187 / #191 INTERACTIONS

### #191 (`ensureQuoteNumber`) — no amplification risk

`ensureQuoteNumber` at line 32923 is idempotent:
- If `quote.number` already exists and matches `MTX-Q######` → returns unchanged
- If missing → assigns from `quoteCounter` and persists

A "Send To Sales" send calls `ensureQuoteNumber` the same as any other send. If the number
was already assigned (prior view/print/send), it's a no-op. If this is the first action on
the quote, it assigns. **No double-assignment risk, no counter waste.**

### #187 (`quoteExpiresAt`) — validity cascade applies to sales sends

Line 33042–33044:
```js
const _sentNow=Date.now();
if(_customerValidityLoadedFor!==populated.bcCustomerNumber)
  await _loadCustomerValidity(populated.bcCustomerNumber);
const _validDays=resolveQuoteValidityDays(populated,_customerValidityDays);
```

The validity cascade resolves: project-level override → customer-level default → global
default (30 days). **This runs on every send, including "Send To Sales."**

**Implication:** A sales-to-self send starts the validity clock. If the user sends to sales
first (Rev 00), the quote expires in `_validDays` from that moment. If they then send to
the customer (also Rev 00), `quoteSentAt` and `quoteExpiresAt` are overwritten — the clock
resets to the customer send time.

**Not a problem:** the brief says "Send To Sales" is a real send. Starting the validity
clock is the correct behavior. The customer send overwrites the timestamps, so the final
expiry is anchored to the customer-facing send.

### Edge case: "Send To Sales" + never send to customer

If the user sends to sales and never sends to the customer, the quote is locked with
`quoteSentTo: sales-user@matrixpci.com`, `quoteExpiresAt` set, `quoteLocked: true`.

The dashboard shows "✓ Quote sent Rev 00 to sales-user@matrixpci.com" — accurate. The
quote expires per the cascade. If the user wants to send to the customer later, they
unlock (ECO/rev bump) or resend.

**This is fine per the brief — no special handling needed.** A sales-to-self send is
a full send, including all consequences.

### `quoteSentRev` snapshot

Line 33045: `quoteSentRev:rev` — captures the current `quoteRev` at send time. If the user
sends to sales at Rev 00 and later sends to the customer at Rev 01 (after a revision), the
dashboard shows Rev 01. The Rev 00 sales-send data is overwritten.

**Not a regression** — this is the existing behavior for any re-send. #194's per-send log
would preserve the history.

---

## 7. COMPLETE STRUCTURAL MAP

### Components to modify

| # | Location | Change |
|---|----------|--------|
| 1 | Line 32798 | Default `sendMode`: `"new"` → `"sales"` |
| 2 | Lines 33078–33089 | Add "Send To Sales" tab button (LEFT of "New Email") |
| 3 | Line 33091 | Extend ternary: `sendMode==="sales"` renders same form as "new" |
| 4 | Line 32899 | Extend empty-recipient guard: `\|\|sendMode==="sales"` |
| 5 | Line 32904 | Extend email regex guard: `\|\|sendMode==="sales"` |
| 6 | Lines 35877–35882 | Initialize `modalData.to` with `fbAuth.currentUser?.email` (for default "sales" tab) |
| 7 | Tab `onClick` handlers | On "New Email" click: swap `modalData.to` to customer email. On "Send To Sales" click: swap to `fbAuth.currentUser?.email`. |

### Components NOT modified

- `handleSend` logic (line 32858) — mode-agnostic, no changes
- `sendGraphEmail` / `graphReplyToMessage` — unchanged
- `ensureQuoteNumber` (#191) — unchanged, idempotent
- #187 validity cascade — unchanged, applies uniformly
- `buildQuotePdfDoc` — unchanged
- Inline send modal (dead code) — untouched
- `QuoteSendModal` close/cancel — unchanged

### Estimated scope

~15 lines added (tab button + tab swap handlers), ~3 lines modified (guards + default).
No new state variables. No new functions. No Firestore schema change.

---

## 8. OPEN DECISIONS FOR JON

1. **#194 audit line:** Add a `_logQvHistory({type:"quote_send",...})` call in #193's scope
   (one line, ~line 33046)? Or defer to #194? See section 5.

2. **Message body for "Send To Sales":** Should the pre-filled message template change when
   sending to self? Currently it says "Please find the attached quote for your review" with
   the customer greeting. The sales user can edit it, but a different default (e.g., "Internal
   copy — [project] [rev]") would be cleaner. Not blocking — purely cosmetic.

3. **Tab label:** "Send To Sales" vs "Internal Copy" vs "Send to Self"? The brief says
   "Send To Sales." Confirm the label.

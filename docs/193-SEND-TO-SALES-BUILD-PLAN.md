# #193 Send To Sales — Build Plan

**Author:** Sam Wize (Coach)  
**Date:** 2026-07-01  
**Type:** Build plan (no code)  
**Prerequisite:** `docs/193-SEND-TO-SALES-SUPPLEMENT.md` (codebase verification)  
**Reviewed by:** [pending Coach review → Jon approval → Marc build]

---

## 0. SCOPE SUMMARY

7 changes in `QuoteSendModal` (line 32796) + 1 change at modal-open init (line 35877).
~25 lines added, ~5 lines modified. No new functions. No Firestore schema change.
Reuses the existing mode-agnostic send path with zero divergence.

---

## 1. DEFAULT sendMode — line 32798

**Change:**

```js
// BEFORE:
const [sendMode,setSendMode]=useState("new");

// AFTER:
const [sendMode,setSendMode]=useState("sales");
```

One-character change. The modal now opens on the "Send To Sales" tab in all cases
(unsent, sent, revised).

---

## 2. TAB BAR — lines 33078–33089

**Insert a new button BEFORE the existing "New Email" button** (left-most position).
Add `borderLeft` to the "New Email" button to separate it from the new tab.

**Replace** lines 33078–33089 with:

```jsx
<div style={{display:"flex",gap:0,marginBottom:14,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
  <button onClick={()=>{setSendMode("sales");setModalData(prev=>({...prev,to:fbAuth.currentUser?.email||""}));}}
    style={{flex:1,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",border:"none",
      background:sendMode==="sales"?"#1a1a2e":"transparent",color:sendMode==="sales"?"#f59e0b":C.muted}}>
    📩 Send To Sales
  </button>
  <button onClick={()=>{setSendMode("new");setModalData(prev=>({...prev,to:prev._customerTo||""}));}}
    style={{flex:1,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",border:"none",borderLeft:`1px solid ${C.border}`,
      background:sendMode==="new"?C.accentDim:"transparent",color:sendMode==="new"?C.accent:C.muted}}>
    ✉ New Email
  </button>
  <button onClick={()=>setSendMode("reply")}
    style={{flex:1,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",border:"none",borderLeft:`1px solid ${C.border}`,
      background:sendMode==="reply"?"#1a2a1a":"transparent",color:sendMode==="reply"?"#4ade80":C.muted}}>
    ↩ Reply to Thread
  </button>
</div>
```

### Tab-switch `to` swap

Each tab's `onClick` sets `sendMode` AND swaps `modalData.to`:

| Tab | `setSendMode` | `setModalData` `to` |
|-----|-------------|---------------------|
| **Send To Sales** | `"sales"` | `fbAuth.currentUser?.email\|\|""` |
| **New Email** | `"new"` | `prev._customerTo\|\|""` (stashed customer email) |
| **Reply to Thread** | `"reply"` | No swap — reply mode uses thread selection, not `to` field |

`_customerTo` is stashed at modal-open time (section 3). It preserves the BC-contact-
resolved customer email across tab switches. User edits to `to` within a tab are
ephemeral — tab switch resets to the tab's default.

### Tab accent

| Tab | Active background | Active text |
|-----|------------------|-------------|
| Send To Sales | `#1a1a2e` (dark indigo) | `#f59e0b` (amber) |
| New Email | `C.accentDim` (existing blue) | `C.accent` (existing blue) |
| Reply to Thread | `#1a2a1a` (existing green) | `#4ade80` (existing green) |

Amber distinguishes the internal/sales send from the customer-facing blue. Marc can
adjust the exact color — this is cosmetic.

---

## 3. MODAL-OPEN INIT — line 35877

**Change** `setQuoteSendModalPLV({...})` to stash the customer email and default `to`
to the sales email:

```js
// BEFORE:
setQuoteSendModalPLV({
  to:toEmail,
  subject:`...`,
  message:`...`,
  signature:`...`
});

// AFTER:
setQuoteSendModalPLV({
  to:fbAuth.currentUser?.email||"",
  _customerTo:toEmail,
  subject:`${isBudg?"Budgetary ":""}Quote ${q.number||"Quote"}${rev>0?" Rev "+String(rev).padStart(2,"0"):""} — ${project.name||"Project"}`,
  message:`${custFirst?custFirst+",\n\n":""}Please find the attached ${isBudg?"budgetary ":""}quote for ${project.bcProjectNumber||""} ${project.name||"your project"} for your review.\n\nIf you have any questions, please don't hesitate to reach out.`,
  signature:`${spName}\n${spEmail}${spPhone?"\n"+spPhone:""}\n\nThis email was auto-generated. If there are any questions, you may reply to this email.`
});
```

Two changes to the object:
1. `to:` → `fbAuth.currentUser?.email||""` (was `toEmail`) — default for "sales" tab
2. `_customerTo:toEmail` — NEW stashed field for "New Email" tab switch

The `subject`, `message`, and `signature` are unchanged. They're shared across all tabs.
The same subject/message template works for a sales-to-self send (it describes the quote
being attached — accurate regardless of recipient).

---

## 4. TAB CONTENT BRANCH — line 33091

**Change** the ternary to include `"sales"`:

```js
// BEFORE:
{sendMode==="new"?(
  <div>... To/Subject form ...</div>
):(
  <div>... Reply search ...</div>
)}

// AFTER:
{(sendMode==="new"||sendMode==="sales")?(
  <div>... To/Subject form ...</div>   // same JSX — identical form
):(
  <div>... Reply search ...</div>
)}
```

One-line change: `sendMode==="new"` → `(sendMode==="new"||sendMode==="sales")`.

The "Send To Sales" tab renders the exact same To/Subject/Message/Signature form as
"New Email." The only difference is the pre-filled `to` value (set by tab-switch handler
in section 2). No new JSX.

---

## 5. GUARD-LINE EXTENSIONS — lines 32899, 32904

Three guards in `handleSend` gate on `sendMode==="new"`. Extend each to include
`"sales"`:

### 5A. Empty-recipient check — line 32899

```js
// BEFORE:
if(sendMode==="new"&&!m.to.trim()){arcAlert("Enter a recipient email.");return;}

// AFTER:
if((sendMode==="new"||sendMode==="sales")&&!m.to.trim()){arcAlert("Enter a recipient email.");return;}
```

### 5B. Email regex validation — line 32904

```js
// BEFORE:
if(sendMode==="new"){

// AFTER:
if(sendMode==="new"||sendMode==="sales"){
```

Lines 32905–32909 (the regex body) are unchanged.

### 5C. No change needed at line 33019

The send dispatch:
```js
if(sendMode==="reply"){
  await graphReplyToMessage(...);
}else{
  await sendGraphEmail(graphToken,m.to,...);
}
```

`sendMode==="sales"` falls through to the `else` branch → `sendGraphEmail`. No change.

### 5D. `sentTo` computation — line 33026

```js
const sentTo=sendMode==="reply"
  ?(selectedThread.to?...)
  :m.to;
```

`sendMode==="sales"` falls through to `:m.to` — records the sales user's email.
No change.

### 5E. Close alert — line 33069

```js
onClose();arcAlert(sendMode==="reply"?"Quote sent as reply to: "+selectedThread.subject:"Quote sent to "+m.to);
```

`sendMode==="sales"` falls through to `"Quote sent to "+m.to` — shows the sales email.
No change.

**Total guard changes: 2 lines modified (32899, 32904). Zero new logic.**

---

## 6. ★ SEND LOG — `_logQvHistory` placement + record shape

### What exists today

No per-send log. Only overwritten snapshot fields (`quoteSentAt`, `quoteSentTo`, etc.) —
last-send-wins, no history.

### `_logQvHistory` — how it works (line 9176)

```js
function _logQvHistory(projectId, entry){
  // Auto-adds to every entry:
  //   id:     Date.now()+random (unique key)
  //   by:     _appCtx.uid (sender's uid)
  //   byName: fbAuth.currentUser?.displayName (sender's name)
  //   at:     Date.now() (timestamp)
  // Then: arrayUnion into project.qvHistory[]
}
```

The auto-added fields give us WHO and WHEN for free. The entry only needs the WHAT.

### Record shape (minimal, generic)

```js
{
  type: "quote_send",
  sendMode: sendMode,                          // "new" | "reply" | "sales"
  to: sentTo,                                  // recipient(s) — string
  quoteNumber: (populated.quote||{}).number||null,
  quoteRev: rev,
  withBom: !!withBom
}
```

| Field | Type | Why |
|-------|------|-----|
| `type` | `"quote_send"` | Joins the existing type vocabulary (`refresh_pricing`, `bc_push_lead_times`, `review_submit`, etc.) |
| `sendMode` | string | Distinguishes customer-new / customer-reply / sales. #194 can key metrics on this. |
| `to` | string | Recipient email(s). Uses `sentTo` (already computed at line 33026) so reply mode captures thread participants. |
| `quoteNumber` | string\|null | Quote reference. Null only if #191 assignment failed (print soft-fail path — but this is the send path, so it's always present). |
| `quoteRev` | number | Revision at send time. Together with `quoteNumber`, uniquely identifies the sent artifact. |
| `withBom` | boolean | Whether the BOM Report PDF was attached. |

### What's deliberately omitted (for #194 to add if needed)

- Email subject / body — volatile, high storage cost, low analytics value
- Attachment sizes — can be derived from the PDF generation logs
- Graph message ID — would require capturing the sendGraphEmail response (currently fire-and-forget)
- `includeTravelerBom` — already captured separately in `bomApprovalRequests[]`
- Salesperson code / customer number — derivable from the project at query time

### Placement — modal send path

**Insert at line ~33057** — after the BOM approval request block (line 33049–33057),
before the `try{persistProject(upd);}` at line 33058. The email is confirmed sent at
this point, `sentTo` and `rev` are computed, `sendMode` is in scope.

```js
// #193/#194: minimal send log — captures the durable facts per send.
_logQvHistory(project.id,{type:"quote_send",sendMode,to:sentTo,quoteNumber:(populated.quote||{}).number||null,quoteRev:rev,withBom:!!withBom});
```

One line. Fire-and-forget (mirrors all other `_logQvHistory` calls). Writes to
`project.qvHistory[]` via Firestore `arrayUnion`.

### Placement — inline send path (dead code, for completeness)

The inline send modal at line 38476 (`_doInlineQuoteSend`) is unreachable (never opened —
see supplement section 1). But for code hygiene, add the same log after line 38537
(stamps computed), before line 38538 (`onUpdate(upd)`):

```js
_logQvHistory(project.id,{type:"quote_send",sendMode:"new",to:m.to,quoteNumber:(_proj.quote||{}).number||null,quoteRev:rev,withBom:!!withBom});
```

Note: `sendMode` is always `"new"` for the inline path (no tabs). If the inline modal
is ever wired up, this log is ready.

---

## 7. COMPLETE CHANGE INVENTORY

| # | File | Line | Change |
|---|------|------|--------|
| 1 | app.jsx | 32798 | Default `sendMode`: `"new"` → `"sales"` |
| 2 | app.jsx | 33078–33089 | REPLACE tab bar: 3 buttons (Sales/New/Reply) with swap handlers |
| 3 | app.jsx | 33091 | `sendMode==="new"` → `(sendMode==="new"\|\|sendMode==="sales")` |
| 4 | app.jsx | 32899 | Extend empty-recipient guard: `\|\|sendMode==="sales"` |
| 5 | app.jsx | 32904 | Extend email regex guard: `\|\|sendMode==="sales"` |
| 6 | app.jsx | 35877–35878 | Init `to:fbAuth.currentUser?.email\|\|""`, add `_customerTo:toEmail` |
| 7 | app.jsx | ~33057 | NEW `_logQvHistory` call (1 line, after email confirmed sent) |
| 8 | app.jsx | ~38537 | NEW `_logQvHistory` call (1 line, inline path — dead code, hygiene) |

**Total: ~25 lines added/changed. No new state variables (reuses `sendMode` + `modalData`).
No new functions. No Firestore schema change. No new fields on project.**

### NOT changed

- `handleSend` logic — mode-agnostic, no changes to send flow
- `sendGraphEmail` / `graphReplyToMessage` — unchanged
- `ensureQuoteNumber` (#191) — unchanged, idempotent
- #187 validity cascade — unchanged, applies uniformly
- `buildQuotePdfDoc` — unchanged
- PDF filename construction — unchanged (reads from `populated`)
- Inline send modal (dead code) — only the log line added
- `_logQvHistory` function — unchanged, existing infrastructure

---

## 8. SEND PATH — ZERO DIVERGENCE CONFIRMATION

Every step of `handleSend(withBom)` applies identically to `sendMode==="sales"`:

```
 1. Owner Priority gate        ← line 32860  — mode-agnostic ✓
 2. Incomplete items gate      ← line 32862  — mode-agnostic ✓
 3. #192 red-row auto-budg     ← line 32873  — mode-agnostic ✓
 4. Recipient validation       ← line 32899  — extended (section 5A) ✓
 5. Email regex                ← line 32904  — extended (section 5B) ✓
 6. ensureQuoteFieldsPopulated ← line 32915  — mode-agnostic ✓
 7. ensureQuoteNumber (#191)   ← line 32923  — mode-agnostic ✓
 8. Terms validation           ← line 32931  — mode-agnostic ✓
 9. Graph token                ← line 32944  — mode-agnostic ✓
10. BOM approval token (#137)  ← line 32953  — mode-agnostic ✓
11. PDF build                  ← line 32972  — mode-agnostic ✓
12. Subject recompute (#191)   ← line 33018  — mode-agnostic ✓
13. ──── EMAIL SEND ────       ← line 33022  — falls to else (sendGraphEmail) ✓
14. sentTo computation         ← line 33026  — falls to m.to ✓
15. BC sync                    ← line 33030  — mode-agnostic ✓
16. #187 stamps                ← line 33045  — mode-agnostic ✓
17. BOM approval record        ← line 33049  — mode-agnostic ✓
18. ★ Send log                 ← NEW         — captures sendMode:"sales" ✓
19. persistProject             ← line 33058  — mode-agnostic ✓
20. BC PDF upload              ← line 33066  — mode-agnostic ✓
21. Close + alert              ← line 33069  — falls to "Quote sent to "+m.to ✓
```

**Real-send semantics are automatic. No special-casing required.**

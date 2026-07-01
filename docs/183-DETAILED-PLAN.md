# #183 Detailed Plan — RFQ Email Recipient Field Infinite-Loop Freeze

**Author:** Sam Wize (Coach)
**Date:** 2026-06-30
**Status:** READY FOR APPROVAL
**Builds on:** Coach trace (Session 10) + Freddy's Analyst Review
**Fix:** Option A — remove the value transform, plain controlled textarea, normalize at consumption only
**Tip:** master `07a29ee9` (v1.21.7)

---

## Overview

The `RfqEmailModal` recipient `<textarea>` (line 19465) applies a non-identity value transform
(`; `→`;\n` on display, `\n`→`"; "` on change) that creates a self-feeding onChange loop under
React 18 `createRoot` + Windows `\r\n` normalization. Semicolons grow every cycle, synchronous,
full main-thread freeze.

Fix: remove both transforms. Store raw text (newlines as typed) in `emails` state. Normalize to
`"; "`-delimited only at consumption boundaries (send, Firestore write). The textarea renders `\n`
natively — no transform needed for multi-line display.

**Seeded-value decision: (a) — normalize to newline-delimited ONCE at load.** Saved defaults and
BC emails arrive semicolon-delimited from Firestore. Converting `;` → `\n` at the moment they
enter state gives the user one-email-per-line display from mount. Under (b), the textarea would
show `a@b.com; c@d.com` as a single line with raw semicolons until first edit — then switch to
multiline, which is jarring. (a) keeps ONE canonical format in state (newline-delimited), ONE
normalization at consumption (`"; "`-delimited).

**Total: ~12 lines changed in `src/app.jsx`, 1 pure helper added. One commit. One deploy.**

---

## §1 — Plain controlled textarea (line 19465)

Remove both transforms. The textarea becomes a standard controlled component.

**Before (line 19465):**
```jsx
<textarea value={(emails[g.vendorName]||"").replace(/;\s*/g,";\n")} onChange={e=>setEmails(prev=>({...prev,[g.vendorName]:e.target.value.replace(/\n/g,"; ")}))}
```

**After:**
```jsx
<textarea value={emails[g.vendorName]||""} onChange={e=>setEmails(prev=>({...prev,[g.vendorName]:e.target.value}))}
```

This is the fix. No transform in `value`, no transform in `onChange`. React 18's value tracker
sees `value === textarea.value` on every commit — no mismatch, no spurious onChange, no loop.
The textarea renders `\n` as visible line breaks natively.

---

## §2 — Seed normalizer: `;` → `\n` at load (lines 19102, 19134)

Seeded values arrive semicolon-delimited from Firestore or BC. Convert to newline-delimited
at the moment they enter state so the display is immediately one-email-per-line.

### §2a — Initial state (line 19102)

**Before:**
```js
const [emails,setEmails]=useState(()=>{const m={};groups.forEach(g=>{m[g.vendorName]=g.vendorEmail||"";});return m;});
```

**After:**
```js
const [emails,setEmails]=useState(()=>{const m={};groups.forEach(g=>{m[g.vendorName]=(g.vendorEmail||"").replace(/;\s*/g,"\n");});return m;});
```

`g.vendorEmail` comes from BC and may contain `"; "` separators. The replace converts them
to `\n` for display. Single-email values (no `;`) pass through unchanged.

### §2b — Saved default load (line 19134)

**Before:**
```js
setEmails(prev=>({...prev,[g.vendorName]:saved[g.vendorName]}));
```

**After:**
```js
setEmails(prev=>({...prev,[g.vendorName]:(saved[g.vendorName]||"").replace(/;\s*/g,"\n")}));
```

Saved defaults in Firestore are stored semicolon-delimited (see §4 — Firestore writes always
normalize back to `"; "`). Convert on read.

### §2c — BC contacts auto-fill (line 19150) — NO CHANGE

```js
setEmails(prev=>{if(prev[g.vendorName])return prev;return{...prev,[g.vendorName]:contacts[0].email};});
```

Single email address, no semicolons. No conversion needed.

---

## §3 — Contacts dropdown: append + dedup (lines 19473–19474)

The dropdown appends a selected contact email to the existing list and checks for duplicates.
Both must use `\n` as the delimiter to match the new state format.

### §3a — Dedup split (line 19473)

**Before:**
```js
if(cur&&!cur.split(/[,;]\s*/).some(x=>x.toLowerCase()===newEmail.toLowerCase())){
```

**After:**
```js
if(cur&&!cur.split(/[\n,;]\s*/).some(x=>x.trim().toLowerCase()===newEmail.toLowerCase())){
```

Added `\n` to the split pattern and `.trim()` on each segment (newline-split segments may
carry leading/trailing whitespace). This handles state in newline format while remaining
backwards-compatible with any residual `;` or `,` the user may type manually.

### §3b — Append delimiter (line 19474)

**Before:**
```js
setEmails(prev=>({...prev,[g.vendorName]:cur+"; "+newEmail}));
```

**After:**
```js
setEmails(prev=>({...prev,[g.vendorName]:cur+"\n"+newEmail}));
```

Appends on a new line. The textarea renders this as a new visible row.

---

## §4 — Send-boundary normalizer (new helper + 4 call sites)

A pure helper that converts raw textarea text (newlines, semicolons, commas, mixed) into the
canonical `"; "`-delimited format expected by `sendGraphEmail` (line 8242) and Firestore.

### Helper definition

Place inside `RfqEmailModal`, before `sendAll` (after line 19167):

```js
const _normalizeEmails=raw=>(raw||"").split(/[\n;,]+/).map(s=>s.trim()).filter(Boolean).join("; ");
```

Splits on any combination of `\n`, `;`, `,` (handles mixed input), trims each segment, drops
empties, joins with `"; "`. Idempotent — calling it twice produces the same result.

### Call site 1 — sendAll `to` (line 19228)

**Before:**
```js
const to=(emails[g.vendorName]||"").trim();
```

**After:**
```js
const to=_normalizeEmails(emails[g.vendorName]);
```

This feeds `sendGraphEmail` which splits on `/[,;]\s*/` (line 8242). The normalized `"; "`
format matches that pattern exactly.

### Call site 2 — rfqUploads Firestore doc (line 19209)

**Before:**
```js
vendorEmail:(emails[g.vendorName]||"").trim(),
```

**After:**
```js
vendorEmail:_normalizeEmails(emails[g.vendorName]),
```

### Call site 3 — history entry for skipped vendors (line 19218)

**Before:**
```js
vendorEmail:emails[g.vendorName]||"",
```

**After:**
```js
vendorEmail:_normalizeEmails(emails[g.vendorName]),
```

### Call site 4 — send-time remember-save (line 19289)

**Before:**
```js
const emailVal=(emails[g.vendorName]||"").trim();
```

**After:**
```js
const emailVal=_normalizeEmails(emails[g.vendorName]);
```

This ensures Firestore always stores canonical `"; "`-delimited format, which §2b then
converts back to `\n` on the next load. Round-trip is clean.

### Call site 5 — Remember checkbox immediate-save (line 19490)

**Before:**
```js
const emailVal=(emails[g.vendorName]||"").trim();
```

**After:**
```js
const emailVal=_normalizeEmails(emails[g.vendorName]);
```

Same rationale as call site 4.

### NOT changed: `hasEmailVendors` check (line 19171)

```js
const hasEmailVendors=groups.some(g=>included[g.vendorName]&&!isApiVendor(g.vendorName)&&(emails[g.vendorName]||"").trim());
```

This is a non-empty check. Works with any format. No change needed.

### NOT changed: `sendGraphEmail` (line 8234)

Already splits on `/[,;]\s*/` at line 8242. Receives clean `"; "`-delimited input from the
normalizer. No modification needed.

---

## §5 — Row count (line 19461)

The textarea `rows` attribute is computed from the email count. Must split on `\n` to match
the new state format.

**Before:**
```js
const emailList=(emails[g.vendorName]||"").split(/[,;]\s*/).filter(e=>e.trim());
```

**After:**
```js
const emailList=(emails[g.vendorName]||"").split(/\n/).filter(e=>e.trim());
```

One line with semicolons (user-typed) → `rows=1` (correct — it IS one line in the textarea).
Multiple newlines → `rows=N` (correct — one row per visible line).

---

## §6 — What is NOT changed

| Item | Why untouched |
|---|---|
| `sendGraphEmail` (line 8234) | Already splits `to` on `/[,;]\s*/`. Gets clean `"; "` input from normalizer. |
| Contacts dropdown structure (19469–19478) | Only the append delimiter and dedup split change (§3). Select logic, reset, dedup guard structure unchanged. |
| Remember checkbox logic (19485–19498) | Only the emailVal normalization changes (§4 site 5). Checkbox logic, Firestore path, merge unchanged. |
| `leadTimeOnly` / `included` state | Unrelated to the email value transform. |
| `sendAll` beyond normalize calls | Send logic, API vendors, history writes, PDF gen, Graph token — all unchanged. |
| `_readSupplierConfig` / `_supplierDocPath` | Read/write paths unchanged. Only the value is normalized. |
| BC contacts fetch (19141–19154) | Fetch logic unchanged. Auto-fill produces single emails (no `;`). |

---

## §7 — Known limitations

1. **No undo for sent garbage.** If the user already triggered the freeze and sent an RFQ
   while the textarea was mid-loop (unlikely — the freeze blocks the Send button), those
   emails contain garbage semicolons. Not recoverable. The fix prevents future occurrences.

2. **User-typed semicolons stay visible.** If the user types `a@b.com; c@d.com` (with `;`)
   instead of using Enter, the textarea shows it as-is on one line. The normalizer at
   send/save handles both formats. This is correct natural textarea behavior.

---

## §8 — Regression surface

### Direct effect of §1 (textarea transform removal)

The transform was the bug. Removing it eliminates the only code path that causes the loop.
No other component reads or depends on the textarea's value transform.

### §2 seed normalizer

Converts incoming `"; "` to `"\n"` at state entry. No downstream consumer of `emails` state
expects semicolons — all consumption goes through `_normalizeEmails` (§4) or the textarea
display (§1). The conversion is invisible to all paths.

### §3 contacts dropdown

The append delimiter change (`"; "` → `"\n"`) matches the new state format. The dedup split
change adds `\n` to the existing pattern — strictly more permissive, catches the same
duplicates plus newline-separated ones.

### §4 send-boundary normalizer

Replaces `.trim()` with `_normalizeEmails()` at all consumption sites. The normalizer is
a superset of `.trim()` (splits, trims each, re-joins). `sendGraphEmail` already splits on
`/[,;]\s*/` — feeding it `"a@b.com; c@d.com"` instead of `"a@b.com\nc@d.com"` produces the
same `toRecipients` array.

### §5 row count

Splits on `\n` instead of `/[,;]\s*/`. Rows match visible textarea lines. Correct.

### Net regression risk

**ZERO unintended behavioral change.** The email send path produces identical `toRecipients`.
Firestore writes store the same canonical `"; "`-delimited format. The only visible difference:
the textarea shows one email per line from mount (cleaner UX than the semicolons-on-one-line
display the user never saw anyway because the bug froze the page).

---

## Test criteria

| # | Test | Method | Expected |
|---|------|--------|----------|
| T1 | **NO LOOP** — type/paste text with `;` and Enter | Open Send RFQ, type `a@b.com`, press Enter, type `c@d.com`. Also paste `a@b.com; c@d.com`. | No freeze, no semicolon runaway. Textarea shows text as typed. |
| T2 | **MULTI-LINE DISPLAY** — seeded defaults render one-per-line | Open Send RFQ for a vendor with a saved multi-email default. | Textarea shows one email per line from mount (not semicolons on one line). |
| T3 | **SEEDED EDITABLE** — edit a seeded multi-email field | On a vendor from T2, add a third email by pressing Enter + typing. Delete one line. | No loop. Textarea accepts edits normally. Row count adjusts. |
| T4 | **SEND CORRECT** — sendAll yields correct recipients | Send an RFQ to a vendor with 2+ emails (newline-separated in textarea). Check sent email in Outlook. | All recipients receive the email. No garbage semicolons in To field. |
| T5 | **CONTACTS APPEND** — dropdown adds without loop | Use the 📇 Contacts dropdown to add a BC contact to an existing email. | Contact appended on new line. No duplicates if already present. No loop. |
| T6 | **WINDOWS** — verify on Windows specifically | Run T1 + T3 on Jon's Windows machine (the `\r\n` trigger platform). | No loop, no freeze. Confirms the fix eliminates the platform-specific trigger. |
| T7 | **REMEMBER ROUND-TRIP** — saved default persists correctly | Check "Remember", send. Close modal, re-open Send RFQ for same vendor. | Same emails appear, one per line. Firestore stores `"; "`-delimited. |
| T8 | **GREP** — no residual transform | `grep "replace.*;\\\\.\\*s" src/app.jsx` in the textarea area (19460–19470). | Zero hits. The old `replace(/;\s*/g,";\n")` and `replace(/\n/g,"; ")` are gone. |

---

## Implementation sequence

1. Marc applies §1 (textarea), §2 (seed normalizer), §3 (contacts dropdown), §4 (helper +
   call sites), §5 (row count) in a single commit.
2. Marc runs T8 (grep verification) before committing.
3. Deploy via `deploy.sh`.
4. Jon runs T1 + T3 + T6 on Windows (the critical platform — `\r\n` trigger).
5. Jon runs T2 + T5 + T7 (seeded defaults, contacts, remember round-trip).
6. Jon runs T4 (send correctness) on a test RFQ.
7. Coach verifies committed diff matches plan.

**Total: ~12 lines changed in `src/app.jsx`. One helper added. One commit. One deploy.**

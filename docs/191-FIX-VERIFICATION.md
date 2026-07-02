# #191 Quote Number Missing — Fix Verification

**Author:** Sam Wize (Coach)  
**Date:** 2026-07-01  
**Version:** v1.21.20 (code 896c2e6e, release c6e12319)  
**Scope:** `ensureQuoteNumber` helper + assign-before-PDF on 3 paths + subject recompute + backfill  
**Verdict:** PASS — all 5 shipped checks confirmed. handleGeneratePdf placement specified for Marc.

---

## 1. HELPER — CONFIRMED

### `ensureQuoteNumber(project, uid)` — line 2377–2388

```js
async function ensureQuoteNumber(project, uid){
  const q=project.quote||{};
  if(q.number&&/^MTX-Q\d{6}$/.test(String(q.number))){
    return {project, assigned:false};
  }
  const qNum=await getNextQuoteNumber(uid);
  const updated={...project,quote:{...q,number:qNum}};
  if(updated.bcProjectNumber&&_bcToken){
    bcPatchJobOData(updated.bcProjectNumber,{Description_2:"Quote "+qNum}).catch(e=>console.warn("BC quote note failed:",e));
  }
  return {project:updated, assigned:true, number:qNum};
}
```

| Property | Expected | Actual | ✓ |
|----------|----------|--------|---|
| **Idempotent** | No-op when number present + MTX-Q pattern | Line 2379: `if(q.number&&/^MTX-Q\d{6}$/.test(...))` → returns `{project, assigned:false}` | ✓ |
| **Throws on failure** | No internal try/catch | Confirmed — `getNextQuoteNumber` propagates. No catch wrapping it. | ✓ |
| **Does NOT persist** | Returns project, caller saves | Returns `{project:updated, assigned:true, number:qNum}` — no `saveProject`/`safeSave`/`onUpdate`/`setProject` inside | ✓ |
| **Does NOT setState** | Same | No React state calls inside | ✓ |
| **BC note** | Fire-and-forget Description_2 | Line 2384–2385: `bcPatchJobOData(...).catch(...)` — non-blocking | ✓ |
| **Window export** | Accessible for console backfill | Line 1584: `window.ensureQuoteNumber=ensureQuoteNumber;` | ✓ |
| **Comment block** | Documents design | Lines 2372–2376: idempotent, no persist, no setState, caller decides policy, throws on failure | ✓ |

**PASS**

---

## 2. CALL SITES — CONFIRMED (all 3 + Flag-1)

### A. Print path — `handlePrintQuote` (line 37518–37530)

```js
// #191: ... SOFT-fail on print — warn but proceed ...
try{
  const{project:_withNum,assigned:_numAssigned}=await ensureQuoteNumber(proj,uid);
  if(_numAssigned){
    proj=_withNum;
    setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);
  }
}catch(e){
  console.error("[QUOTE] Quote number assignment failed:",e);
  try{await arcAlert("Could not assign a quote number — ...",{kind:"warning"});}catch(_){}
}
```

| Check | Status |
|-------|--------|
| Runs BEFORE PDF build (line 37535+ `ensureQuoteFieldsPopulated`, then `buildQuotePdfDoc`) | ✓ |
| Soft-fail: `arcAlert` warning, NO `return` — proceeds to print | ✓ |
| Persists via `setProject` + `projectRef.current` + `onChange` + `saveProject` | ✓ |
| Old swallowed `console.warn("Auto quote number failed:")` gone | ✓ (grep returns 0 matches) |

### B. Modal send — `QuoteSendModal.handleSend` (line 32918–32929)

```js
// #191: ... HARD-fail — never send a customer a numberless quote ...
let _assignedQuoteNumber=null;
try{
  const{project:_withNum,assigned:_numAssigned,number:_qn}=await ensureQuoteNumber(populated,uid);
  if(_numAssigned){populated=_withNum;_assignedQuoteNumber=_qn;await persistProject(populated);}
}catch(e){
  console.error("[QUOTE SEND] Quote number assignment failed:",e);
  arcAlert("Could not assign a quote number. Check your connection and retry.");
  return;
}
```

| Check | Status |
|-------|--------|
| Runs BEFORE PDF build (line 32972 `buildQuotePdfDoc`) | ✓ |
| Hard-fail: `arcAlert` + `return` | ✓ |
| Persists via `persistProject(populated)` | ✓ |
| `populated` carries number downstream | ✓ |

### Flag-1 fix: BOM report filename reads `populated`

**Quote PDF filename** (line 33011–33015):
```js
const q=populated.quote||{};     // ← reads `populated`
...
const pdfName=`QTE_C-[${q.number||"Quote"} ...`;
```
`q.number` comes from `populated.quote.number` → assigned by `ensureQuoteNumber`. ✓

**BOM Report filename** (line 32985–32989):
```js
const _q2=populated.quote||{};   // ← reads `populated`
...
const bomFilename=`BOM_REPORT-[${_q2.number||"Quote"} ...`;
```
`_q2.number` comes from `populated.quote.number`. ✓

**Other fields in BOM filename:**
- `_rev2=project.quoteRev||0` (line 32986) — reads `project`, not `populated`. **Safe:**
  `ensureQuoteNumber` does not modify `quoteRev`. Values are identical.
- `_company2` falls back to `project.bcCustomerName` (line 32987). **Safe:** same reason.
- `_proj2` reads `project.name` (line 32988). **Safe:** same reason.

**Flag-1 verdict: CORRECT AND COMPLETE.** Both filenames (quote + BOM report) read the
number from `populated`, which carries the assigned value.

### C. Inline send — `_doInlineQuoteSend` (line 38492–38501)

```js
// #191: ensure quote number BEFORE PDF/filename. HARD-fail ...
let _assignedQuoteNumber=null;
try{
  const{project:_withNum,assigned:_numAssigned,number:_qn}=await ensureQuoteNumber(_proj,uid);
  if(_numAssigned){_proj=_withNum;_assignedQuoteNumber=_qn;onUpdate(_proj);await safeSave(uid,_proj);}
}catch(e){
  console.error("[INLINE SEND] Quote number assignment failed:",e);
  arcAlert("Could not assign a quote number. Check your connection and retry.");
  return;
}
```

| Check | Status |
|-------|--------|
| Runs BEFORE PDF build (line 38507 `buildQuotePdfDoc(pdfDoc,_proj)`) | ✓ |
| Hard-fail: `arcAlert` + `return` | ✓ |
| Persists via `onUpdate(_proj)` + `await safeSave(uid,_proj)` | ✓ |
| `_proj` carries number to all downstream reads | ✓ |

**Downstream `_proj` threading:**
- PDF build: line 38507 `buildQuotePdfDoc(pdfDoc,_proj)` ✓
- Quote filename: line 38509 `const qq=_proj.quote||{}` → `qq.number` at 38513 ✓
- BOM Report filename: line 38522 `${qq.number||"Quote"}` (same `qq` from `_proj`) ✓
- #187 stamps: line 38537 `{..._proj,...stamps}` — preserves `_proj.quote.number` ✓

**All 3 call sites PASS.**

---

## 3. #187 ORDERING — CONFIRMED

### Modal send path ordering:

```
 1. ensureQuoteFieldsPopulated          ← line 32915
 2. ★ ensureQuoteNumber                 ← line 32923 (assigns number, persists)
 3. Validation gates (terms, etc.)      ← line 32931
 4. setSending(true)                    ← line 32942
 5. PDF build: buildQuotePdfDoc         ← line 32972 (reads populated.quote.number)
 6. Filename: q.number||"Quote"         ← line 33015 (reads populated.quote)
 7. Subject recompute                   ← line 33018
 8. ────── EMAIL SEND ──────            ← line 33022
 9. BC sync                             ← line 33031
10. #187 stamps:                        ← line 33045
    {quoteSentAt, quoteSentRev, quoteSentTo, quoteLocked, quoteExpiresAt}
11. persistProject (lock save)          ← line 33059
```

### Inline send path ordering:

```
 1. Validation (incomplete, email)      ← line 38480–38488
 2. Graph token                         ← line 38490
 3. ★ ensureQuoteNumber                 ← line 38495 (assigns number, persists)
 4. PDF build: buildQuotePdfDoc         ← line 38507 (reads _proj.quote.number)
 5. Filename: qq.number||"Quote"        ← line 38513 (reads _proj.quote)
 6. Subject recompute                   ← line 38515
 7. ────── EMAIL SEND ──────            ← line 38525
 8. BC sync                             ← line 38527
 9. #187 stamps:                        ← line 38537
    {quoteSentAt, quoteSentRev, quoteSentTo, quoteLocked, quoteExpiresAt}
10. onUpdate (persist)                  ← line 38538
```

### Field collision analysis:

| What | Writes to | Collision? |
|------|----------|------------|
| `ensureQuoteNumber` | `project.quote.number` (nested) | — |
| #187 stamps | `quoteSentAt`, `quoteSentRev`, `quoteSentTo`, `quoteLocked`, `quoteExpiresAt` (all top-level) | NO |

### Spread-chain safety:

Both paths build `upd = {...populated_or_proj, ...stamps}`.

- `{...populated}` shallow-copies the `quote` object reference
- Top-level stamp fields (`quoteSentAt`, etc.) don't overlap with `quote.number`
- The assigned number survives the spread — it's inside the `quote` object, untouched

**No collision. Stamps intact. PASS.**

---

## 4. SUBJECT RECOMPUTE — CONFIRMED

### Modal send (line 33016–33018):

```js
// #191 addition: if we just assigned the number, recompute the subject so the customer never
// sees "Quote Quote" (the modal pre-fills the subject on OPEN, before assignment).
const _subject=_assignedQuoteNumber
  ?String(m.subject||"").replace("Quote Quote","Quote "+_assignedQuoteNumber)
  :m.subject;
```

### Inline send (line 38514–38515):

```js
// #191 addition: recompute subject if we just assigned the number (avoid "Quote Quote").
const _subject=_assignedQuoteNumber
  ?String(m.subject||"").replace("Quote Quote","Quote "+_assignedQuoteNumber)
  :m.subject;
```

| Property | Status |
|----------|--------|
| Only fires when `_assignedQuoteNumber` is set (just-assigned) | ✓ |
| Replaces `"Quote Quote"` → `"Quote MTX-Q######"` | ✓ |
| Falls through to `m.subject` unchanged when no assignment needed | ✓ |
| Modal: `_subject` used at line 33022 `sendGraphEmail(...,_subject,...)` | ✓ |
| Inline: `_subject` used at line 38525 `sendGraphEmail(...,_subject,...)` | ✓ |

**Both paths confirmed. PASS.**

---

## 5. ERROR SURFACING — CONFIRMED

### Old behavior (removed):

The old inline print path had `catch(e){console.warn("Auto quote number failed:",e);}` —
silent, invisible to the user. Grep confirms this string is **gone** (0 matches).

### New behavior (all 3 paths):

| Path | Error visibility | Blocks action? | Line |
|------|-----------------|----------------|------|
| **Print** | `console.error` + `arcAlert("Could not assign... print without a number.",{kind:"warning"})` | NO — warns and proceeds | 37528–37529 |
| **Modal send** | `console.error` + `arcAlert("Could not assign... Check your connection and retry.")` | YES — `return` | 32926–32928 |
| **Inline send** | `console.error` + `arcAlert("Could not assign... Check your connection and retry.")` | YES — `return` | 38498–38500 |

**Print soft-fail matches plan** (user may want to preview without number).  
**Both sends hard-fail match plan** (never send a numberless customer doc).

**PASS.**

---

## 6. ★ handleGeneratePdf — PLACEMENT SPECIFIED

### Current code (line 36353–36368):

```js
async function handleGeneratePdf(){
  try{
    const _pop=await ensureQuoteFieldsPopulated(project,uid);
    const populated=_pop.project;                          // line 36356 — const
    onUpdate(populated);
    await saveProject(uid,populated);
    await generateQuotePdf({...aggregated,quote:populated.quote});  // line 36359
    const hash=computeBomHash(populated.panels);
    const printed={...populated,...};
    onUpdate(printed);
    await saveProject(uid,printed);
  }catch(e){...}
}
```

**No `ensureQuoteNumber` call present.** `generateQuotePdf` (line 7704) reads
`project.quote.number` from whatever is passed — currently `populated.quote`, which
may be numberless.

### Correct placement

**Two changes:**

**Change 1:** Line 36356 — `const populated` → `let populated`

This enables reassignment when the number is assigned.

**Change 2:** Insert between line 36358 (`await saveProject(uid,populated)`) and
line 36359 (`await generateQuotePdf(...)`) — AFTER the initial populate-and-save,
BEFORE the PDF render:

```js
// #191: assign quote number if missing (idempotent). Soft-fail — this is a generate/
// preview path (same policy as handlePrintQuote: warn but proceed).
try{
  const{project:_withNum,assigned:_numAssigned}=await ensureQuoteNumber(populated,uid);
  if(_numAssigned){
    populated=_withNum;
    onUpdate(populated);
    await saveProject(uid,populated);
  }
}catch(e){
  console.error("[QUOTE] Quote number assignment failed:",e);
  try{await arcAlert("Could not assign a quote number — check your connection and retry. The PDF will generate without a number.",{kind:"warning"});}catch(_){}
}
```

### Why this placement

```
BEFORE (existing):
  1. ensureQuoteFieldsPopulated   ← line 36355
  2. saveProject                  ← line 36358
  3. generateQuotePdf             ← line 36359  ← reads quote.number

AFTER (with #191 addition):
  1. ensureQuoteFieldsPopulated   ← line 36355
  2. saveProject                  ← line 36358
  3. ★ ensureQuoteNumber          ← NEW (idempotent, soft-fail)
  4. generateQuotePdf             ← line 36359  ← now has the number
```

- **After populate-and-save** so the initial BC field population is complete before
  we check/assign the number. `ensureQuoteNumber` tests `quote.number` from `populated`
  (which carries any BC-populated fields).
- **Before `generateQuotePdf`** so the PDF renders with the assigned number.
- **Soft-fail** (matches print path policy): this is a "Generate PDF" button, not a
  send. The user may want the PDF even without a number. Identical to `handlePrintQuote`.

### Persist pattern matches print path

Same as the print path at line 37523–37525:
- `onUpdate(populated)` → updates React state
- `saveProject(uid,populated)` → persists to Firestore

The `onUpdate` used here (line 36357) is the same `onUpdate` prop used for the initial
populate save. The second `saveProject` (with the number) is a separate await — safe
because the `ensureQuoteNumber` block is inside the outer try/catch and won't leave a
partial state (if save fails, the outer catch fires `arcAlert`).

### Downstream reads

After the insertion, `populated` carries the number. Line 36359:
```js
await generateQuotePdf({...aggregated,quote:populated.quote});
```
The `quote:populated.quote` splice passes the numbered quote to `generateQuotePdf`,
which reads `project.quote.number` at line 7713 (`const quoteNum=q.number||"Quote"`).
The number flows through to the PDF filename and document content. ✓

The post-print hash and save at lines 36360–36363 also use `populated` — they'll carry
the number in the saved project. ✓

### Summary for Marc

| # | Line | Change |
|---|------|--------|
| 1 | 36356 | `const populated` → `let populated` |
| 2 | After 36358 | Insert `ensureQuoteNumber` block (soft-fail, ~8 lines, pattern from print path) |

**Two changes, ~8 lines. Idempotent. Zero risk. Closes the last numberless-PDF path.**

---

## VERDICT: PASS

All 5 shipped checks confirmed:

| Check | Status |
|-------|--------|
| 1. Helper: idempotent, throws, no persist/setState | **PASS** |
| 2. Call sites: 3 paths, number before PDF, Flag-1 filename reads `populated` | **PASS** |
| 3. #187 ordering: no collision, stamps intact, spread preserves nested number | **PASS** |
| 4. Subject recompute: both send paths, "Quote Quote" → "Quote MTX-Q######" | **PASS** |
| 5. Error surfacing: print warns+proceeds, sends hard-fail+return | **PASS** |

### handleGeneratePdf addition:

Placement specified: `let populated` + insert `ensureQuoteNumber` block between
line 36358 and 36359. Soft-fail. Same pattern as print path. ~8 lines, 1 const→let.
Ready for Marc.

### Backfill confirmed (from commit):

- PRJ402119 → MTX-Q202030 ✓
- PRJ402118 → MTX-Q202031 ✓
- Both persisted and confirmed per commit message.

### Live-pending:

Jon eyeball: open an un-viewed quote, click Send (without View/Print first) → confirm
the quote number appears in the PDF, the filename, and the email subject.

# #191 Quote Number Missing — Structural Fix Plan

**Author:** Sam Wize (Coach)  
**Date:** 2026-07-01  
**Type:** Planning only (no code)  
**Reviewed by:** [pending Coach review → Jon approval → Marc build]  
**Prerequisite:** Marc's trace `docs/191-QUOTE-NUMBER-MISSING-TRACE.md`

---

## 1. HELPER: `ensureQuoteNumber(project, uid)`

### Placement

Module-level, at **line ~2364** — immediately after `getNextQuoteNumber` (line 2352–2363).
Same scope neighborhood: both are module-level async functions operating on the quote counter.

### Specification

```js
async function ensureQuoteNumber(project, uid){
  const q = project.quote || {};
  if (q.number && /^MTX-Q\d{6}$/.test(String(q.number))) {
    return { project, assigned: false };
  }
  const qNum = await getNextQuoteNumber(uid);
  const updated = { ...project, quote: { ...q, number: qNum } };
  if (updated.bcProjectNumber && _bcToken) {
    bcPatchJobOData(updated.bcProjectNumber, { Description_2: "Quote " + qNum })
      .catch(e => console.warn("BC quote note failed:", e));
  }
  return { project: updated, assigned: true, number: qNum };
}
```

### Design decisions

| Decision | Rationale |
|----------|-----------|
| **Does NOT persist** | Each call site has a different save mechanism: `saveProject` (print), `persistProject` (modal-send), `onUpdate+safeSave` (inline-send). Caller handles persistence after the helper returns. |
| **Does NOT update React state** | Same reason — `setProject`/`projectRef.current`/`onChange`/`onUpdate` vary by call site. |
| **DOES throw on failure** | No internal try/catch. Caller decides policy: warn-and-continue (print) vs hard-fail (send). |
| **DOES patch BC** | Fire-and-forget `Description_2` note, same as current print path (line 37487). Non-critical — `.catch()` swallows failures. |
| **Idempotent** | If `quote.number` exists and matches the MTX-Q pattern, returns the project unchanged. Safe to call repeatedly. |
| **Uses existing `getNextQuoteNumber`** | The Firestore transaction for atomic increment is already correct. No new counter logic. |

### Window export (for console backfill)

```js
if(typeof window!=="undefined"){
  window.ensureQuoteNumber = ensureQuoteNumber;
}
```

Add alongside the existing exports at line ~1571.

---

## 2. CALL SITES (4 paths, exact insertion points)

### A. Print path — `handlePrintQuote` (line 37479)

**Replace** lines 37481–37491 (the current inline assignment block) with:

```js
// Auto-assign quote number if not yet set
try{
  const{project:_withNum,assigned:_numAssigned}=await ensureQuoteNumber(proj,uid);
  if(_numAssigned){
    proj=_withNum;
    setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);
  }
}catch(e){
  console.error("[QUOTE] Quote number assignment failed:",e);
  try{await arcAlert("Could not assign a quote number — check your connection and retry. The quote will print without a number.",{kind:"warning"});}catch(_){}
}
```

**Insertion point:** Line 37479, right after `setQuotePrinting(true)` (line 37478), before
`ensureQuoteFieldsPopulated` (line 37497). Exactly where the old inline block was.

**Error policy:** Warn, don't block. The user may want to preview even without a number.
The `arcAlert` makes the failure visible (vs the old silent `console.warn`).

### B. Modal send — `QuoteSendModal` (before line 32935)

**Change** line 32893 from `const populated` to `let populated`.

**Insert** between line 32894 (`if(populated!==project)await persistProject(populated);`)
and line 32895 (`const _sq=populated.quote||{};`):

```js
// Ensure quote number assigned before PDF/filename
try{
  const{project:_withNum,assigned:_numAssigned}=await ensureQuoteNumber(populated,uid);
  if(_numAssigned){
    populated=_withNum;
    await persistProject(populated);
  }
}catch(e){
  console.error("[QUOTE SEND] Quote number assignment failed:",e);
  arcAlert("Could not assign a quote number. Check your connection and retry.");
  return;
}
```

**Insertion point:** After `ensureQuoteFieldsPopulated` (which populates BC fields and
persists), before the validation gates (payment terms, shipping method). The quote number
is assigned and persisted before ANY PDF or filename construction.

**Error policy:** Hard-fail. Don't send a quote without a number — the customer gets a
document with no reference and the filename falls back to literal "Quote."

### C. Inline send — `_doInlineQuoteSend` (before line 38454)

**Insert** after line 38451 (`if(!graphToken){...return;}`) and before line 38452
(`const sig=...`). Introduce a mutable `_proj`:

At the top of `_doInlineQuoteSend` (after `const m=quoteSendModal;` at line 38438),
add:
```js
let _proj=project;
```

Then insert the assignment block:
```js
// Ensure quote number assigned before PDF/filename
try{
  const{project:_withNum,assigned:_numAssigned}=await ensureQuoteNumber(_proj,uid);
  if(_numAssigned){_proj=_withNum;onUpdate(_proj);await safeSave(uid,_proj);}
}catch(e){
  console.error("[INLINE SEND] Quote number assignment failed:",e);
  arcAlert("Could not assign a quote number. Check your connection and retry.");
  return;
}
```

Then **replace all downstream `project` references** with `_proj` in lines 38454–38492:

| Line | Current | Change to |
|------|---------|-----------|
| 38457 | `buildQuotePdfDoc(pdfDoc, project)` | `buildQuotePdfDoc(pdfDoc, _proj)` |
| 38459 | `const qq=project.quote\|\|{}` | `const qq=_proj.quote\|\|{}` |
| 38461 | `project.bcCustomerName` | `_proj.bcCustomerName` |
| 38462 | `project.name` | `_proj.name` |
| 38468 | `buildBomReportPdfDoc(bomDoc,project)` | `buildBomReportPdfDoc(bomDoc,_proj)` |
| 38475 | `project.bcProjectNumber` | `_proj.bcProjectNumber` |
| 38476 | `project.panels` | `_proj.panels` |
| 38477 | `project.name` | `_proj.name` |
| 38485 | `{...project,quoteSentAt:...}` | `{..._proj,quoteSentAt:...}` |

Total: 9 `project` → `_proj` substitutions within the function body.

**Error policy:** Hard-fail, same as modal send.

### D. Copy path — `copyProject` (line 10448)

**No change.** The copy path always assigns a FRESH number to a NEW project — it calls
`getNextQuoteNumber(uid)` directly (line 10448). `ensureQuoteNumber` is for the
"assign-if-missing" pattern on existing projects; the copy path's project doesn't exist
yet and always needs a new number.

The existing `getNextQuoteNumber` call is correct and direct. No factoring needed.

---

## 3. ⚠ #187 Interaction — ORDERING GUARANTEE

Both send paths' `ensureQuoteNumber` calls run **well before** the #187 stamps. The
separation is architectural — they're on opposite sides of the email-send operation:

### Modal send path ordering:

```
 1. ensureQuoteFieldsPopulated       ← line 32892
 2. ★ ensureQuoteNumber              ← NEW, line ~32895
 3. Validation gates (terms, etc.)   ← line 32895
 4. setSending(true)                 ← line 32907
 5. Graph token acquisition          ← line 32909
 6. BOM approval token               ← line 32920
 7. HTML + PDF build                 ← line 32934-32937
 8. ────── EMAIL SEND ──────         ← line 32981-32984
 9. BC sync                          ← line 32992
10. #187 stamps (quoteSentAt,        ← line 33004-33007
    quoteLocked, quoteExpiresAt)
11. persistProject (lock save)       ← line 33021
```

### Inline send path ordering:

```
 1. Validation (incomplete, email)   ← line 38439-38448
 2. Graph token acquisition          ← line 38450
 3. ★ ensureQuoteNumber              ← NEW, line ~38452
 4. HTML + PDF build                 ← line 38453-38458
 5. Filename construction            ← line 38459-38463
 6. ────── EMAIL SEND ──────         ← line 38473
 7. BC sync                          ← line 38474-38479
 8. #187 stamps (quoteSentAt,        ← line 38482-38486
    quoteSentRev, quoteSentTo,
    quoteLocked, quoteExpiresAt)
 9. onUpdate (persist)               ← line 38486
```

**Guarantee:** The quote number assignment (step 2-3) and the #187 stamps (step 10/8)
are separated by the entire email-send operation. The number is assigned and persisted
BEFORE the PDF/filename are built. The stamps run AFTER the email is confirmed sent.
These touch DIFFERENT fields on the project object:

- `ensureQuoteNumber` writes: `project.quote.number`
- #187 stamps write: `project.quoteSentAt`, `.quoteSentRev`, `.quoteSentTo`,
  `.quoteLocked`, `.quoteExpiresAt`

No field overlap. No ordering dependency. No collision.

**Spread-chain safety:** Both send paths build `upd = {...project, ...stamps}` for the
#187 persist. Since `ensureQuoteNumber` modifies `project.quote.number` (nested inside
`quote`), and the stamps are top-level fields, the spread preserves the assigned number.
The `{...project}` shallow-copies the `quote` object reference — the number survives.

---

## 4. SWALLOWED ERROR — Error Surfacing

### Current (line 37490):
```js
}catch(e){console.warn("Auto quote number failed:",e);}
```

Silent `console.warn` — invisible to the user. If the Firestore transaction fails (offline,
permissions, counter doc missing), the quote prints/sends with a blank number and nobody
knows until the customer asks "what's the quote reference?"

### Fix (already specified in call sites above):

| Path | Error policy | User sees |
|------|-------------|-----------|
| **Print** | `console.error` + `arcAlert` (warning) | Yellow modal: "Could not assign a quote number — check your connection and retry. The quote will print without a number." Proceeds — user may want to preview. |
| **Modal send** | `console.error` + `arcAlert` + `return` | Red modal: "Could not assign a quote number. Check your connection and retry." Hard-blocks the send. |
| **Inline send** | `console.error` + `arcAlert` + `return` | Same — hard-blocks the send. |

**Why hard-fail on send but soft-fail on print:** A print is a preview (internal). A send
delivers a customer-facing document — sending it without a reference number is worse than
blocking the send and asking the user to retry.

---

## 5. BACKFILL — PRJ402119 & PRJ402118

Two sent quotes with `quote.number` absent (Marc's trace confirmed: `quoteSentAt` set,
`quote.number` missing, sent to noah@matrixpci.com Rev 1).

### Approach: post-deploy console one-liner

After the fix deploys (with `window.ensureQuoteNumber` exported), Marc runs in the
browser console while logged in as admin:

```js
// Backfill the 2 numberless sent quotes
for(const pid of ['PRJ402119','PRJ402118']){
  const snap=await firebase.firestore().doc(
    `companies/${_appCtx.companyId}/projects/${pid}`).get();
  if(!snap.exists){console.log(pid,'not found');continue;}
  const p={...snap.data(),id:pid};
  const{project:upd,assigned,number}=await ensureQuoteNumber(p,_appCtx.uid);
  if(assigned){
    await firebase.firestore().doc(
      `companies/${_appCtx.companyId}/projects/${pid}`).update({'quote.number':number});
    console.log(pid,'→',number);
  }else{console.log(pid,'already has number:',p.quote?.number);}
}
```

**Why this approach (vs on-load auto-assign):**
- **Same mechanism**: uses `ensureQuoteNumber` — no separate backfill code
- **Targeted**: only the 2 known affected projects, not a runtime check on every load
- **No deploy-time cost**: doesn't add a conditional branch to the project-load path
- **No customer-facing action**: runs in the console, no print/send needed
- **Audit trail**: `console.log` shows what was assigned; the Firestore `quoteCounter`
  transaction is atomic, so the numbers are sequentially correct

**If more are found later:** same one-liner, different project IDs. The helper is
idempotent — re-running on an already-numbered project is a no-op.

### Safety notes

- The assigned numbers will NOT match the PDFs already sent (which had blank numbers).
  Jon accepts this — the purpose is populating the stored field for future reference,
  not retroactive PDF correction.
- The `quoteCounter` increments atomically, so the two backfill numbers will be
  sequential and won't conflict with any concurrent quote assignments.
- No `quoteSentAt` / `quoteLocked` / `quoteExpiresAt` changes — only `quote.number` is
  touched.

---

## 6. KNOWN EDGE CASE (not blocking)

### Email subject pre-population

The modal send button's onClick (line 35841) pre-populates the email subject with:
```js
`Quote ${q.number||"Quote"} Rev NN — Project Name`
```

This runs when the modal OPENS, before `ensureQuoteNumber` runs (which happens on
send-click). If the number was missing when the modal opened, the subject shows
"Quote Quote Rev 00 — ..." as a default.

**Not blocking because:**
1. The subject is a user-editable field — the user can fix it before sending
2. The PDF and filename (the customer-facing artifacts) will have the correct number
3. The fix's scope is "ensure the number exists before the PDF/filename are built" —
   the email subject template is a cosmetic default

**Future enhancement if desired:** re-compute the subject line inside the send handler
(after `ensureQuoteNumber`) if a number was just assigned. Minimal effort — replace
`m.subject` with a re-computed version. But this is scope creep for #191.

---

## 7. COMPLETE SITE INVENTORY

| # | Location | What changes |
|---|----------|-------------|
| 1 | Line ~2364 | NEW `ensureQuoteNumber` function definition |
| 2 | Line ~1571 | NEW `window.ensureQuoteNumber` debug export |
| 3 | Lines 37481–37491 | REPLACE inline assignment block → `ensureQuoteNumber` call |
| 4 | Line 32893 | `const populated` → `let populated` |
| 5 | After line 32894 | NEW `ensureQuoteNumber` block (modal send) |
| 6 | Line 38438 | NEW `let _proj=project;` (inline send) |
| 7 | After line 38451 | NEW `ensureQuoteNumber` block (inline send) |
| 8 | Lines 38457–38486 | 9× `project` → `_proj` substitutions |
| 9 | Post-deploy | Console backfill for PRJ402119 + PRJ402118 |

**Total code change:** ~20 lines added, ~12 lines removed, ~9 substitutions. One new
function. No Firestore schema change. No new fields. Sentinel `isBudgetaryAiAutoSet`
unaffected (different subsystem).

### NOT changed:

- `getNextQuoteNumber` — unchanged, still the atomic counter
- `copyProject` (line 10448) — keeps direct `getNextQuoteNumber` call (new projects
  always need fresh numbers)
- `buildQuotePdfDoc` — unchanged, reads `q.number||""` as before
- `quoteCounter` Firestore doc — unchanged schema
- #187 stamp logic — untouched, ordering verified safe

---

## 8. UNBLOCKS

**#193 (Send-To-Sales default)** was gated on #191. Once the quote number is guaranteed
present on both send paths, #193 can safely consume `project.quote.number` for the
send-to-sales default without hitting the blank-number case.

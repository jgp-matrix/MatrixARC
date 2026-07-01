# #187 Detailed Plan — Quote Validity Cascade (Four-Tier Expiration)

**Author:** Sam Wize (Coach)
**Date:** 2026-07-01 (rev 3)
**Status:** READY FOR REVIEW
**Builds on:** Coach C128 (design trace) + Jon's locked design decisions
**Tip:** master `cdd2d3d4` (v1.21.12)
**Depends on:** #186 guard (v1.21.12, already deployed)

---

## Overview

Add a four-tier quote validity cascade that controls the "PRICES VALID UNTIL" date on printed
quotes and drives the #186 frozen-quote expiry gate. The cascade resolves validity days as:

1. **Quote-edit override** — `project.quote.quoteValidityDays` (new numeric field, persisted on
   the quote sub-object). When the user sets a per-quote override on the quote form, this is the
   structured tier-1 value that drives `quoteExpiresAt`. True single source of truth — print and
   gate always agree, even under a manual override.
2. **Project override** — `project.quoteValidityDays` (new field, numeric)
3. **Customer default** — `customerDefaults/{bcCustomerNumber}.quoteValidityDays` (new collection)
4. **Global default** — `_pricingConfig.quoteValidityDays` (new field, default 30)

At send time, the resolved cascade produces `quoteExpiresAt` (epoch ms) stamped on the project
doc. This single timestamp drives BOTH the printed "PRICES VALID UNTIL" date AND the #186
tryCheck expiry gate. Single source of truth — print and gate can never diverge.

**Backfill:** NOT needed. Existing quotes without `quoteExpiresAt` fall through to the live
cascade on next send. Unsent quotes have no expiration concept.

**BC linkage:** Out of scope. Customers are identified by `bcCustomerNumber` string on the
project doc — no ARC-side customer entity exists. The new `customerDefaults` collection is
keyed by `bcCustomerNumber` and lives within the company scope.

**Total: ~110-140 lines changed across `src/app.jsx` + `firestore.rules`. Two phases, two deploys.**

---

## Phase 1 — Global + Project + Quote-Edit + Expiry Gate

Adds the global tier, project override, structured quote-edit override, and wires
`quoteExpiresAt` into the #186 guard and the print path. The customer tier is deferred to
Phase 2 so this phase is self-contained and testable without async Firestore reads.

### §1.1 — Global tier: add `quoteValidityDays` to `_pricingConfig`

**File:** `src/app.jsx`

**1a. Module-scope default (line 2016):**

Add `quoteValidityDays:30` to the `_pricingConfig` initializer.

```js
// BEFORE:
let _pricingConfig={contingencyBOM:1500,contingencyConsumables:400,budgetaryContingencyPct:20,codaleStaleDays:30,bcStaleDays:60,defaultStaleDays:60,ecoDefaultLaborRate:65};

// AFTER:
let _pricingConfig={contingencyBOM:1500,contingencyConsumables:400,budgetaryContingencyPct:20,codaleStaleDays:30,bcStaleDays:60,defaultStaleDays:60,ecoDefaultLaborRate:65,quoteValidityDays:30};
```

**1b. loadPricingConfig (line 2024):**

Add `quoteValidityDays:c.quoteValidityDays??30` to the destructure.

```js
// In the if(d.exists) block, append to the object:
_pricingConfig={..., ecoDefaultLaborRate:c.ecoDefaultLaborRate??65, quoteValidityDays:c.quoteValidityDays??30};
```

**1c. PricingConfigModal state (after line 17735):**

Add a `useState` for `quoteValidityDays`:

```js
const [quoteValidityDays,setQuoteValidityDays]=useState(_pricingConfig.quoteValidityDays??30);
```

**1d. PricingConfigModal save (line 17901):**

Add `quoteValidityDays` to the `savePricingConfig` call object:

```js
// BEFORE:
savePricingConfig(uid,{contingencyBOM:bomVal,contingencyConsumables:consVal,budgetaryContingencyPct:budgPct,codaleStaleDays,bcStaleDays,defaultStaleDays,ecoDefaultLaborRate}),

// AFTER:
savePricingConfig(uid,{contingencyBOM:bomVal,contingencyConsumables:consVal,budgetaryContingencyPct:budgPct,codaleStaleDays,bcStaleDays,defaultStaleDays,ecoDefaultLaborRate,quoteValidityDays}),
```

**1e. PricingConfigModal render — add input:**

In the "Default contingencies" section of the modal's JSX, add a "Quote Validity (days)"
numeric input bound to `quoteValidityDays` / `setQuoteValidityDays`. Place it logically near
the other "days" fields (codaleStaleDays, bcStaleDays, defaultStaleDays). Pattern-match the
existing `type="number" min="1" max="365"` style used at line 17967.

No Firestore rules change needed — `config/{configId}` wildcard at `firestore.rules:460` already
covers `config/pricing` for member-read / writer-write.

### §1.2 — Project override: `quoteValidityDays` on project doc

**File:** `src/app.jsx`

No schema migration needed — Firestore is schemaless. The field is written when the user sets it
and absent otherwise (absent = fall through to customer/global tier).

**2a. Project settings UI:**

Add a "Quote Validity Override (days)" input to the project settings area (near existing project
metadata fields). When set, writes `quoteValidityDays` to the project doc via `persistProject`.
When blank/cleared, deletes the field (or sets to `null`) so cascade falls through.

This is a simple numeric input → `persistProject({...project, quoteValidityDays: val || null})`.

### §1.3 — Quote-edit override: structured numeric field

**File:** `src/app.jsx`

**Design choice: numeric "days" field, NOT a date picker.**

Rationale: A numeric "override days" field integrates cleanly with the cascade — every other
tier is days-based, so the resolver stays uniform (`resolveQuoteValidityDays` returns a number
at every tier). A date picker would require converting a calendar date back to a day-count
relative to the unknown future send time, creating an awkward impedance mismatch (the user picks
"August 15" but the send happens July 3 vs July 10 → different day counts → different
`quoteExpiresAt` values). With a numeric field, the user says "this quote is valid for 45 days"
and the cascade stamps `sentAt + 45 * 86400000` regardless of when they send. The
`toLocaleDateString` print path resolves the epoch to a human-readable date at render time —
no conversion needed.

**3a. Field location:** `project.quote.quoteValidityDays` (numeric, persisted via `setQ`).

Lives on the `quote` sub-object alongside `validUntil`, `salesperson`, `termsText`, etc.
Written by `setQ({quoteValidityDays: val})` which flows through
`onUpdate({...project, quote:{...q, ...updates}})` → `persistProject`. Absent/null/0 = fall
through to project → customer → global tier.

**3b. Replace existing "Prices Valid Until" free-text inputs:**

The existing `validUntil` free-text field is retired as an expiry mechanism. The two input sites
become the structured `quoteValidityDays` input:

**Compact form (line 20206):**

```js
// BEFORE:
{fld("Prices Valid Until","validUntil",defaultValidUntil,160)}

// AFTER — replace with a direct numeric input (fld renders a text input, not suitable for
// type="number"):
<div style={{display:"flex",flexDirection:"column",gap:2,minWidth:160,flex:1}}>
  <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.8px",color:C.muted}}>Quote Validity (days)</label>
  <input type="number" min="1" max="365" value={q.quoteValidityDays||""} onChange={e=>setQ({quoteValidityDays:+e.target.value||null})} placeholder={resolveQuoteValidityDays(project)}
    style={{background:C.cardBg||"#181825",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text||"#e8e8f0",fontSize:13,outline:"none"}}/>
</div>
```

The placeholder shows the cascade-resolved default (project → customer → global), so the user
sees what they'll get if they leave it blank.

**Footer input (line 20747):**

```js
// BEFORE:
<div className="qd-footer-label">Prices Valid Until</div>
<div className="qd-footer-value"><input value={q.validUntil||""} onChange={e=>setQ({validUntil:e.target.value})} placeholder={defaultValidUntil} style={{...qInp({textAlign:"right",color:"#dc2626",fontWeight:500})}}/></div>

// AFTER — show the resolved date as a read-only display (computed from the cascade), with the
// days input for override:
<div className="qd-footer-label">Prices Valid Until</div>
<div className="qd-footer-value" style={{display:"flex",alignItems:"center",gap:6}}>
  <span style={{color:"#dc2626",fontWeight:500}}>{defaultValidUntil}</span>
  <input type="number" min="1" max="365" value={q.quoteValidityDays||""} onChange={e=>setQ({quoteValidityDays:+e.target.value||null})} placeholder={resolveQuoteValidityDays(project)+"d"}
    style={{...qInp({textAlign:"right",width:50})}} title="Override validity days"/>
</div>
```

The footer now shows the computed date (red, read-only span) alongside a narrow days-override
input. The date updates live as the user types a days value — because `defaultValidUntil`
(§1.6b) is computed from the cascade which includes `q.quoteValidityDays`.

**3c. Retire `validUntil` free-text field:**

The old `q.validUntil` field is no longer written by any input. Existing values on old projects
are inert — they won't be read by print or gate. No deletion/migration needed (Firestore
schemaless, field just goes unused). If a separate customer-facing "pricing notes" free-text
field is desired in the future, it should be a NEW field (`q.pricingNote` or similar) that
explicitly does not affect expiry — but that is out of scope for #187.

### §1.4 — Cascade resolver function

**File:** `src/app.jsx` (place near `_pricingConfig` at ~line 2032)

Add a pure helper that resolves the cascade. The quote-edit tier is tier 1:

```js
function resolveQuoteValidityDays(project, customerDays) {
  const q = project.quote || {};
  if (q.quoteValidityDays > 0) return q.quoteValidityDays;
  if (project.quoteValidityDays > 0) return project.quoteValidityDays;
  if (customerDays > 0) return customerDays;
  return _pricingConfig.quoteValidityDays || 30;
}
```

In Phase 1, `customerDays` is always omitted (undefined → skipped). Phase 2 passes it from the
async-loaded ref. The signature is stable across both phases — no call-site changes needed at
Phase 2 integration.

### §1.5 — Stamp `quoteExpiresAt` at send time

**File:** `src/app.jsx`

Both send paths must stamp `quoteExpiresAt` alongside `quoteSentAt` and `quoteLocked`.

**5a. Send path 1 (line 32892):**

```js
// BEFORE:
const upd={...populated,quoteSentAt:Date.now(),quoteSentRev:rev,quoteSentTo:sentTo,quoteLocked:true};

// AFTER:
const _sentNow=Date.now();
const _validDays=resolveQuoteValidityDays(populated);
const upd={...populated,quoteSentAt:_sentNow,quoteSentRev:rev,quoteSentTo:sentTo,quoteLocked:true,quoteExpiresAt:_sentNow+_validDays*86400000};
```

**5b. Send path 2 (line 38345):**

```js
// BEFORE:
const upd={...project,quoteSentAt:Date.now(),quoteSentRev:rev,quoteSentTo:m.to,quoteLocked:true};

// AFTER:
const _sentNow=Date.now();
const _validDays=resolveQuoteValidityDays(project);
const upd={...project,quoteSentAt:_sentNow,quoteSentRev:rev,quoteSentTo:m.to,quoteLocked:true,quoteExpiresAt:_sentNow+_validDays*86400000};
```

### §1.6 — Wire `quoteExpiresAt` into the #186 expiry gate

**File:** `src/app.jsx`

**6a. tryCheck frozen-quote guard (lines 36545-36546):**

After the existing `quoteLocked||wonAt||lostAt` guard, add an expiry check. An expired quote
should have pricing UNLOCKED (the price check should run, because stale prices need refreshing):

```js
// EXISTING GUARD (line 36545-36546):
const _fp=projectRef.current||{};
if(_fp.quoteLocked||_fp.wonAt||_fp.lostAt)return;

// BECOMES:
const _fp=projectRef.current||{};
const _quoteExpired=_fp.quoteExpiresAt&&Date.now()>_fp.quoteExpiresAt;
if((_fp.quoteLocked&&!_quoteExpired)||_fp.wonAt||_fp.lostAt)return;
```

Logic: if `quoteLocked` is true BUT the quote has expired → don't return (let the price check
run). Won/lost always blocks regardless of expiry.

### §1.7 — Print path: single source of truth

**File:** `src/app.jsx`

**CRITICAL: `quoteExpiresAt` canonical location is PROJECT-LEVEL (`project.quoteExpiresAt`),
NOT the quote sub-object.** The send paths (§1.5) stamp it on the project doc. The gate (§1.6)
reads it from `projectRef.current.quoteExpiresAt`. The print path must read from the SAME
project-level location — never from `q.quoteExpiresAt` (which is `project.quote.quoteExpiresAt`
and is never stamped).

**Scope verification:** `buildQuotePdfDoc(doc, project)` (line 6827) receives the full project
object as a parameter. At line 6829: `const q = project.quote || {}`. So `project` (the param)
has `project.quoteExpiresAt` available directly. There is no batch/list print path — both call
sites (`generateQuotePdf` at line 7652, and the auto-print at line 37221) always pass the
currently-open project. The `project` parameter is the correct and safe read target.

**7a. PDF print (line 7429):**

Replace the hardcoded `Date.now()+30*86400000` fallback. Print reads PROJECT-LEVEL
`quoteExpiresAt` when available (post-send = frozen date), otherwise computes from the live
cascade (pre-send preview):

```js
// BEFORE (line 7429):
doc.text(q.validUntil||new Date(Date.now()+30*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}), ...);

// AFTER:
doc.text(new Date(project.quoteExpiresAt||Date.now()+resolveQuoteValidityDays(project)*86400000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}), ...);
```

Post-send: `project.quoteExpiresAt` is set → print shows the FROZEN expiry date (same date the
customer received, same date the gate uses). Reprinting on a later day still shows the original
expiry — no drift.

Pre-send preview: `project.quoteExpiresAt` is undefined → falls through to
`Date.now() + resolveQuoteValidityDays(project) * 86400000` → live cascade preview.

`q.validUntil` is no longer checked. The structured cascade is the sole source of truth for
both print and gate. The old free-text fallback is removed.

**7b. `defaultValidUntil` variable (line 20145) — post-send frozen display:**

The QuoteTab footer shows "Prices Valid Until" and is always rendered (NOT gated on
`sentReadOnly`). For a SENT quote, the footer must show the FROZEN `quoteExpiresAt` date —
not `Date.now() + cascade`, which would drift on later days. For an UNSENT quote, show the
live cascade preview.

```js
// BEFORE (line 20145):
const defaultValidUntil=new Date(Date.now()+30*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

// AFTER:
const defaultValidUntil=new Date(project.quoteExpiresAt||Date.now()+resolveQuoteValidityDays(project||{})*86400000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
```

Behavior:
- **Sent quote** (`project.quoteExpiresAt` is set): displays the frozen expiry date. Matches
  the PDF and the gate. No drift on reopen.
- **Unsent quote** (`project.quoteExpiresAt` is undefined): displays today + cascade-resolved
  days. Reacts live to changes in `q.quoteValidityDays` because `resolveQuoteValidityDays`
  reads `project.quote.quoteValidityDays` as tier 1. When the user types "45" in the days
  input, the displayed date updates immediately to today+45.
- **Unlock→edit window**: `quoteExpiresAt` from the prior send is still on the project doc
  (unlock does not clear it). The footer shows the prior expiry. On re-send, `quoteExpiresAt`
  is overwritten with the new cascade value.

### Phase 1 Test Criteria

| # | Test | Pass condition |
|---|------|---------------|
| T1 | Global default | Set `quoteValidityDays=45` in Configuration modal, save, send a quote. PDF shows "PRICES VALID UNTIL" = today+45 days. Project doc has `quoteExpiresAt` = `quoteSentAt + 45*86400000`. |
| T2 | Project override | Set `quoteValidityDays=14` on a project, send. PDF shows today+14, `quoteExpiresAt` = sentAt+14d. Clear the project override, re-send: falls back to global (45 from T1). |
| T3 | Quote-edit override | Set `quoteValidityDays=7` on the quote form (the numeric days input), send. `quoteExpiresAt` = sentAt+7d. PDF "PRICES VALID UNTIL" = sentAt+7d. The quote-edit value DRIVES both print and gate — no divergence. |
| T4 | Print==Gate (reprint) | Send a quote (any tier). Wait at least one calendar day (or set `quoteExpiresAt` to a date whose calendar day differs from today's). Reprint the quote PDF. The "PRICES VALID UNTIL" date on the reprint MUST match the `quoteExpiresAt` epoch from the Firestore doc — NOT today+N. This proves print reads the STORED `project.quoteExpiresAt`, not a recomputed `Date.now()+cascade`. Also verify the QuoteTab footer "Prices Valid Until" display matches. Same-day send+print masks this bug — the reprint-on-a-later-day is the real test. |
| T5 | Expiry gate | Wait for `quoteExpiresAt` to pass (or manually set it to a past timestamp in Firestore). Open the project. The BC price-check modal SHOULD fire (quoteLocked is true but expired). |
| T6 | Won/lost override | On a Won project with expired `quoteExpiresAt`: price check should NOT fire (won/lost always blocks). |
| T7 | Unlock cycle | Send → unlock → edit → re-send. Second `quoteExpiresAt` overwrites the first. Both sends stamp correctly from the cascade. |
| T8 | No-backfill safety | Open an old project that was sent before #187. It has `quoteSentAt` but no `quoteExpiresAt`. (a) Price check should respect `quoteLocked` (existing #186 guard). No crash, no undefined behavior. (b) Reprint: PDF shows a live-computed date (today + cascade-resolved days) since there is no stored `quoteExpiresAt` — this is expected/acceptable for pre-#187 projects and should not be mistaken for a regression. The gate treats the quote as non-expired (`_quoteExpired` = false) so `quoteLocked` suppresses the price check as before. |
| T9 | Config save roundtrip | Save `quoteValidityDays` in Configuration modal. Close app, reopen. Value persists (loaded from Firestore via `loadPricingConfig`). |
| T10 | Live preview | On the quote form, type "60" in the days override input. The footer date display updates immediately to today+60. Clear the input — the date falls back to the cascade-resolved default. No send required to see the preview. |
| T11 | Cascade priority (Phase 1) | Global=30, project=14, quote-edit=7. Send. `quoteExpiresAt` = sentAt+7d (quote-edit wins). Clear quote-edit, re-send: sentAt+14d (project wins). Clear project override, re-send: sentAt+30d (global wins). |

---

## Phase 2 — Customer Tier

Adds per-customer default validity days, resolved between the project override and the global
default. This phase is its own verifiable unit — Phase 1 must be deployed and tested first.
Both phases ship this build; phasing is sequencing-only, not a deferral.

### §2.1 — Firestore collection: `customerDefaults/{bcCustomerNumber}`

**Path:** `companies/{companyId}/customerDefaults/{bcCustomerNumber}`

Document schema:
```
{
  bcCustomerNumber: string,      // redundant with doc ID, for query convenience
  bcCustomerName: string,        // display label, cached from BC at write time
  quoteValidityDays: number,     // the customer's default validity period
  updatedAt: number,             // epoch ms
  updatedBy: string              // uid
}
```

No ARC-side customer entity exists — `bcCustomerNumber` is a string on each project doc,
sourced from BC. This collection is keyed by that string. No relationship to a BC API call
at read time — it's a pure ARC-side config store.

### §2.2 — Firestore rules

**File:** `firestore.rules`

Add a new `match` block inside `companies/{companyId}` (after the `config/` blocks, around
line 469):

```
match /customerDefaults/{bcCustomerNumber} {
  allow read: if isMember();
  allow write: if isAdminMember();
}
```

Admin-only write — per Jon's decision, only admins set customer-level defaults. Any member
can read (needed for the cascade resolver at project-open time).

### §2.3 — Load customer default at project open (with send-time guard)

**File:** `src/app.jsx`

When a project is opened and has a `bcCustomerNumber`, fire an async read to get the customer
default. Store the result in a ref accessible to the cascade resolver and the send paths.

```js
const customerValidityDays = useRef(null);
const customerValidityLoaded = useRef(false);

useEffect(() => {
  const custNum = project?.bcCustomerNumber;
  if (!custNum || !_appCtx.companyId) {
    customerValidityDays.current = null;
    customerValidityLoaded.current = true;  // no customer = nothing to load
    return;
  }
  customerValidityLoaded.current = false;
  fbDb.doc(`companies/${_appCtx.companyId}/customerDefaults/${custNum}`).get()
    .then(d => {
      customerValidityDays.current = d.exists ? (d.data().quoteValidityDays || null) : null;
      customerValidityLoaded.current = true;
    })
    .catch(() => {
      customerValidityDays.current = null;
      customerValidityLoaded.current = true;
    });
}, [project?.bcCustomerNumber]);
```

A second ref `customerValidityLoaded` tracks whether the async read has completed. This is
consumed by the send-time guard (§2.4).

### §2.4 — Send-time race guard

**Problem:** §2.3 loads `customerValidityDays` asynchronously on project open. If the user
clicks Send before the async read resolves, `customerValidityDays.current` is `null` → the
customer tier is silently skipped → `quoteExpiresAt` falls through to global. This is a
real race on fast-open-then-send.

**Fix:** At both send paths (§1.5a line 32892, §1.5b line 38345), before computing
`_validDays`, check `customerValidityLoaded.current`. If false, await the customer default
inline before proceeding:

```js
// Insert before the _validDays computation in each send path:
if (!customerValidityLoaded.current && project.bcCustomerNumber && _appCtx.companyId) {
  try {
    const cd = await fbDb.doc(`companies/${_appCtx.companyId}/customerDefaults/${project.bcCustomerNumber}`).get();
    customerValidityDays.current = cd.exists ? (cd.data().quoteValidityDays || null) : null;
  } catch(e) { /* fall through to global */ }
  customerValidityLoaded.current = true;
}
const _validDays = resolveQuoteValidityDays(project, customerValidityDays.current);
```

Both send paths are already inside an `async` function, so the `await` is legal. The inline
read adds ~50-100ms latency only on the race-condition path (send before background load
completes). On the normal path (`customerValidityLoaded.current` is true), this is a no-op
boolean check.

### §2.5 — Extend cascade resolver call sites

**File:** `src/app.jsx`

Update all `resolveQuoteValidityDays` call sites to pass `customerValidityDays.current` as the
second argument:

- Send path 1 (line 32892): `resolveQuoteValidityDays(populated, customerValidityDays.current)`
- Send path 2 (line 38345): `resolveQuoteValidityDays(project, customerValidityDays.current)`
- Print path (line 7429): `resolveQuoteValidityDays(project, customerValidityDays.current)` (uses the `project` parameter passed to `buildQuotePdfDoc`, not `projectRef.current`)
- `defaultValidUntil` (line 20145): `resolveQuoteValidityDays(project||{}, customerValidityDays.current)`

The resolver function signature is already stable from §1.4 — the `customerDays` parameter
was defined in Phase 1, just never populated until now.

### §2.6 — Admin UI for customer defaults

**File:** `src/app.jsx`

Add a "Customer Defaults" section to the PricingConfigModal (or a separate modal accessible
from it). The UI:

1. Lists existing `customerDefaults` docs (one row per customer with their `bcCustomerName`
   and `quoteValidityDays`)
2. Allows adding a new customer default — pick from a BC customer search (reuse
   `bcLoadAllCustomers()` at line 4041 which queries the BC API) or type a `bcCustomerNumber`
3. Edit `quoteValidityDays` per customer (simple numeric input)
4. Delete a customer default (removes the doc, cascade falls through to global)

This is the largest single piece of Phase 2 but is self-contained UI work. The data shape is
simple (one field per customer) and the Firestore operations are basic CRUD on the
`customerDefaults` collection.

### §2.7 — tryCheck expiry gate: customer-aware

The `tryCheck` interval callback (line 36534) uses `projectRef.current` — it cannot access
React state. The `customerValidityDays` ref from §2.3 IS reachable because refs don't depend
on render state. No change needed to the expiry gate logic itself — `quoteExpiresAt` was
already stamped at send time using the full cascade (with the race guard ensuring the customer
tier was resolved). The gate just reads the stored timestamp.

### Phase 2 Test Criteria

| # | Test | Pass condition |
|---|------|---------------|
| T12 | Customer default | Set customer default to 60 days for customer X. Open a project for customer X (no project override, no quote-edit override). Send. `quoteExpiresAt` = sentAt+60d. PDF shows today+60. |
| T13 | Full cascade priority | Global=30, customer=60, project=14, quote-edit=7. Send. Validity=7 (quote-edit wins). Clear quote-edit: 14 (project). Clear project: 60 (customer). Delete customer default: 30 (global). |
| T14 | No customer default | Project for a customer with NO default doc. Falls through to global. |
| T15 | Admin-only write | Non-admin user attempts to write to `customerDefaults/{num}`. Firestore rejects. |
| T16 | Customer switch | Change `bcCustomerNumber` on a project. Re-send. `quoteExpiresAt` uses the NEW customer's default (or global if no default exists for the new customer). |
| T17 | CRUD roundtrip | Admin adds a customer default, edits the days value, deletes it. All operations succeed and the list updates correctly. |
| T18 | Send-race guard | Open a project with a customer default set. Immediately click Send before the page fully loads. `quoteExpiresAt` must still reflect the customer default (the send-time guard resolves it inline). Verify by comparing `quoteExpiresAt` against the customer's configured days. |

---

## Risk Flags

### ECO window
An ECO edit can leave `quoteLocked` stale-true. The existing #186 guard comment (line 36543)
documents this as an accepted limitation. #187 does not change this — the expiry gate sits
inside the same `quoteLocked` check. If the quote is expired AND an ECO is active, the price
check will fire (which is the correct behavior — ECO editing should see current prices).

### `quoteExpiresAt` on unlock→re-send
When a quote is unlocked and re-sent, the second send overwrites `quoteExpiresAt` with a
fresh timestamp computed from the cascade at that moment. This is correct — the new quote
has a new validity period.

### Existing projects without `quoteExpiresAt`
Projects sent before #187 have `quoteSentAt` and `quoteLocked` but no `quoteExpiresAt`. The
expiry gate handles this safely: `_fp.quoteExpiresAt` is `undefined`, so
`_fp.quoteExpiresAt && Date.now() > _fp.quoteExpiresAt` evaluates to `false` →
`_quoteExpired` is `false` → the existing `quoteLocked` guard applies unchanged. No crash,
no behavior change for old projects.

### Retired `validUntil` field
The old `q.validUntil` free-text field is no longer read by print or gate. Existing values on
old project docs are inert — no migration or deletion needed (Firestore schemaless). The field
just goes unused. If a separate customer-facing "pricing notes" free-text is desired in the
future, it should be a NEW field (e.g. `q.pricingNote`) that explicitly does not affect
expiry — out of scope for #187.

---

## Files Changed Summary

| File | Phase | Changes |
|------|-------|---------|
| `src/app.jsx` | 1 | ~90 lines: `_pricingConfig` default + load + save, `resolveQuoteValidityDays` helper (4-tier with `customerDays` param), 2 send paths stamp `quoteExpiresAt`, tryCheck expiry gate, print path + `defaultValidUntil` cascade, PricingConfigModal state + input + save, project settings override input, quote form structured days input (replaces free-text `validUntil`), footer date display + days override |
| `src/app.jsx` | 2 | ~50 lines: `customerValidityDays` ref + `customerValidityLoaded` ref + useEffect loader, send-time race guard (inline await), cascade resolver call-site updates (pass `customerValidityDays.current`), PricingConfigModal customer defaults CRUD UI |
| `firestore.rules` | 2 | ~4 lines: `customerDefaults/{bcCustomerNumber}` read/write rules |

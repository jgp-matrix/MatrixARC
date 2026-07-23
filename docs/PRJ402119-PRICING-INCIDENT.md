# PRJ402119 Pricing Incident — Findings & Fix Scope

**Opened:** 2026-07-23 · **Analyst:** Freddy Lyst · **Code trace:** Coach (Sam Wize)
**Incident:** A quote for PRJ402119 was sent with wrong pricing + red rows — a ~$6000 item priced at $12. Major financial loss.
**Status:** INVESTIGATION. Lane 2 (BOM-lock) reported; Lane 1 (pricing attribution + BC-write window) pending. No build until both land + Jon priority. Money-path → Coach review + test + Jon gate before prod.

---

## ⭐ LEADING ROOT-CAUSE HYPOTHESIS (from Lane 2, code-structure; not yet runtime-confirmed)

**Expired-or-unlocked sent quote + auto BC price-check-on-open + a bad BC cost = silent post-send price rewrite, with no snapshot to detect it.**

- Opening a project auto-runs a BC price-check (`src/app.jsx:38341-38411`) that can rewrite `unitPrice`/`priceDate`/`priceSource:'bc'`.
- It has a "FROZEN-QUOTE GUARD (#186)" at `:38368` — but **two escape windows** leave a *sent* quote exposed:
  1. **Expiry:** once `quoteExpiresAt` passes, the guard drops → the check fires and can rewrite quoted prices.
  2. **Unlock-edge:** any genuine edit clears `quoteLocked` (`saveProject` `:9515`), which re-arms the check on reopen.
- A ~$6000 item landing at **$12** is consistent with a BC purchase-price row returning a wrong/units-mismatched cost that the on-open check then propagated as `priceSource:'bc'`. Ties directly to the BC-write-bug window (Lane 1 to confirm the window + whether PRJ402119 falls in it).
- **This is exactly what F048 (suppress auto-pricing on a locked sent BOM) + F049 (snapshot + reconcile) are designed to prevent.**

⚠ Runtime confirmation still required (Lane 1 + live data). The sole ground-truth of what was quoted is the **sent PDF/email** (see next).

---

## KEY DATA-INTEGRITY REALITY: there is NO quoted-BOM snapshot

- `qvHistory` `quote_send` entry stores **metadata only** — `withBom` is a bare boolean, not the rows (`:34505`, `:9638`).
- `bomApprovalRequests` stores panel ids/rev/status — **no costs** (`:34497`).
- `_snapshots` subcollection DOES deep-copy `panel.bom`, but only **before destructive ops** (re-extract `:26715`, "Get New Pricing" `:28296`) — **never on quote-send** — and is capped at 10 with oldest-auto-delete. Not a durable quoted record.
- Quote **PDF** is `window.print()` from a hidden DOM node (optionally uploaded to BC) — not structured/comparable in Firestore.

**⇒ We cannot programmatically compare "quoted vs. current" for PRJ402119. The sent PDF/email is the only record of what was quoted.** Capturing a snapshot at send is a NEW additive capability F049 requires — and it's also the artifact that *would* have answered this incident.

---

## F1 — Is a sent BOM locked today? → NO (soft-only)

Quote-send writes (`:34490` and parallel path `:40469`): `quoteSentAt, quoteSentRev, quoteRevAtPrint, quoteRev, quoteLocked:true, quoteExpiresAt`. **No BOM-freeze field.** Three "lock" concepts exist, none a true post-send freeze:
1. **`_sentSoftBlockActive`** (`:38023`) — soft nag-gate; `sentQuoteAckGiven` is per-session UI state; after the user acks the "Verify with Owner" modal, **the whole BOM is editable**.
2. **`quoteLocked` field** — self-clears to false on the first post-send edit (`:9515`, `:9827`); its ONLY consumer is the auto-price-check guard. Gates no row edit.
3. **Won/Lost hard-lock** (`isProjectLocked=!!(wonAt||lostAt)`, `:38597`) — the ONLY real freeze, **client + Firestore-rules enforced** (`firestore.rules:223-234`) — but engages at **PO receipt (wonAt), not at send.**

**Firestore rules:** locks exist for Owner-Priority, Won/Lost, Review-pending, editing-lease — **NONE keyed on `quoteSentAt`/`quoteLocked`.** Zero backend protection between send and Won.

## F2 — Auto-mutation paths that can change a sent BOM (none gated on "sent"), ranked
1. **Auto BC price-check on open, post-expiry or post-unlock** (`:38368` escape windows) — most likely silent price mover; the hypothesis above.
2. **`runPricingOnPanel`** (`:28268`) auto-invoked on reconciliation/post-extract (`:25891,:26088,:26956,:28921`) — not sent-gated.
3. **`_leadTimeBcQueue`** debounced BC lead-time writeback — not sent-gated (lead-time, not price).
4. Supplier-portal apply (`:39729`) / learned-corrections auto-apply — only if those flows ran.

## F4 — PO-receipt flow (F049 insertion point)
- Entry: `PoReceivedModal` (opened `:40347`, rendered `:40533`); `onDone` (`:40534-40542`) stamps `bcPoStatus:"Open", bcPoNumber, wonAt, wonBy, postReviewStatus:"pending"`.
- **No cost comparison exists at PO receipt today.**
- **F049 hook:** inside `PoReceivedModal.onDone`, BEFORE the `wonAt` write — show quoted-vs-current cost modal, proceed to Won only on confirm. Clean because `wonAt` is the transition to the hard-frozen state.

---

## FIX SCOPE

### F048 — Lock a sent BOM
- New SSOT predicate `_isBomLocked(project)` (true when `quoteSentAt` set & not in a sanctioned-unlock state). **Do NOT overload `quoteLocked`** (load-bearing for price-check-guard + self-clears on edit — reusing regresses B034/B036 rev/divergence machinery). Add a new, non-self-clearing lock.
- **Enforce at ALL sites (enumeration is a floor — re-grep before building):** client edit guards (`updateBomRow:27479`; add a `bomSentLocked` term to the `readOnly` composition at `:38670-38674`); **suppress the auto price-check** (`:38368` — close the expiry + unlock-edge escapes); **skip `runPricingOnPanel` auto-invocations** (`:25891,:26088,:26956,:28921`); skip `_leadTimeBcQueue` flush for locked rows; supplier-portal apply + learned corrections; **Firestore-rules backstop** `isQuoteSentLocked(project)` mirroring `isWonOrLostLocked` (`rules:223-234`).
- Jon's "no auto pricing on open" = enforcement sites #2 (price-check) + #3 (runPricingOnPanel).

### F049 — PO-receipt quoted-vs-current cost confirmation
- **Sub-prerequisite (ships first): snapshot-capture at send** — additive field (e.g. `project.quotedBomSnapshot`, or a qvHistory entry with full rows) written in BOTH send paths (`:34490`, `:40469`): per-row qty/unitPrice/partNumber/leadTime + totals at sent rev. **Additive-only** (data-retention rule).
- Modal at `PoReceivedModal.onDone` pre-`wonAt`; diff snapshot vs current `panels[].bom`; require confirm before accepting PO.

---

## OPEN DECISIONS FOR JON (F048/F049)
- **L1.** Does the sent-lock fully REPLACE the ack-based soft-unlock, or coexist? (i.e., can a user still soft-unlock a sent BOM by acking, or is it a true freeze needing owner/admin session-unlock like Won/Lost?)
- **L2.** Sanctioned unlock paths for a locked sent BOM: owner/admin session-unlock? ECO? And — since **expiry currently *unlocks* the price-check by design** (stale prices need refresh) — should an expired sent quote still auto-reprice, or require an explicit user action?
- **L3.** F049 snapshot granularity: full rows (needed for line-level reconciliation) vs totals-only.

---

# ⭐⭐⭐ FORENSIC CONFIRMATION (live prod read, 2026-07-23, controlled tab)

Read PRJ402119 live via the app's own `loadProjects` (inherited Jon's auth). **The hypothesis was half-right on mechanism but the actual source is simpler and confirmed: bad BC master data, not a poll-revert.**

**Panel 3 ("Line 3"), Row 4 — the incident item:**
- Part **SCE-60XEL4912SS6LP** — "ENCLOSURE SS316, 2DR XEL, 60"X49"" (a large stainless enclosure — the ~$6000 item).
- `unitPrice = 12`, **`priceSource = "bc"`**, `bcVerify = {status:"in-bc", at: 2026-06-19}`, vendor **Galco Industrial Electronics (V00233)**.
- **In ARC the $12 is a BC-sourced price — NOT a manual entry** (`priceSource:"bc"`, not `"manual"`). No human typed $12 in ARC.
- **BC LIVE LOOKUP NOW:** `bcFetchPurchasePrices(['SCE-60XEL4912SS6LP'])` → `directUnitCost: 12`, startingDate 2026-06-19, vendor V00233. **BC itself holds $12 for this enclosure right now.**

**Timeline:** created **2026-06-02** → Row 4 priced **2026-06-19** (BC purchase-price record also dated 06-19) → quote sent **2026-06-22**. All before the B013 fix (July 11), but the mechanism turns out to be simpler than a poll-revert.

**ROOT CAUSE (confirmed):**
1. **BC has bad master data** — a purchase price of **$12** for a ~$6000 SS enclosure (vendor Galco/V00233, dated 06-19). Likely a data-entry or units/UOM error in BC.
2. ARC **faithfully pulled BC's $12** as the price (verified "in-bc") on 06-19.
3. Quote sent 06-22 with $12, because **nothing in ARC flags a magnitude-implausible price** ($12 is non-zero + fresh date + in-bc → not red, not send-blocked).

**WHO:** no one in ARC — the $12 originates in **BC** (whoever created that BC purchase-price record on 06-19, vendor Galco). A BC data question, outside ARC's records. ARC also stamps no author on price writes regardless.

**⚠ REPRIORITIZATION forced by this data:**
- **F050 (plausibility / magnitude check) is now the #1 preventer** — it's the ONLY fix that catches a bad-magnitude price pulled straight from BC. Candidate reference signal: BC price vs. the AI-estimated price (a $12 vs ~$6000 divergence flags loudly).
- **B052 (poll divergence guard, SHIPPED)** would NOT have caught THIS — the price was $12 from the initial BC pull, not a revert from a higher persisted value (B052 fires only on a high→low poll change). Still valid for the revert case.
- **F044 (block-on-red)** would NOT have caught it either ($12 wasn't red).
- **ACTION OUTSIDE ARC (Jon/purchasing):** correct the BC purchase price for SCE-60XEL4912SS6LP (vendor V00233/Galco) — until fixed, ARC will keep pulling $12.
- Other flagged low rows on Panel 3: idx 7 & 11 (OVIVO, $0 → red/price-missing), idx 14 (SCE-LFMTGK mounting kit $12.97 — verify). Labor rows 1-3 ($45) are fine.

---

# LANE 1 — Pricing attribution + BC-write window + red-block / budgetary / audit

## ⭐⭐ THE CONVERGENT ROOT-CAUSE (both lanes agree) — likely NOT human error
**The 5-minute BC price poll (`pollBcPricing`, `:25259`) silently reverted the sent price to a stale/bad BC value during the B013 BC-outage window.**

Mechanism (confirmed in code): every 5 min, for every row with `priceSource==="bc"`, `pollBcPricing` **overwrites `unitPrice` with BC's `directUnitCost` + a fresh `priceDate`** and saves with `_noBumpWrite:true` (**no quoteRev bump** → doesn't trip "quote changed since sent"). If the user's $6000 never persisted to BC (B013 silent 401 write-failure) while the row stayed `priceSource:"bc"`, the poll would **revert the displayed $6000 to BC's stale $12, stamp it fresh, and save it invisibly.** The reverted row is then **not red and not send-blocked** (fresh price + fresh date). This is exactly "showed on screen, didn't persist." ARC even ships a purpose-built detector: **`runPricingAudit` (`:5663`).**

Lane 2's auto-price-check-on-open (`:38341`) is the same family (a second BC→row overwrite path). Either could have done it; the 5-min poll is the stronger fit (fully automatic, no reopen needed, logs nothing).

**Honest caveat:** `applyConfirmedPrice` saves to Firestore first and, on a *detected* dual BC-push failure, reverts the row to `priceSource:"manual"` (`:28058`) — and the poll **skips manual rows** (`:25277`). So the loss requires the BC push to *appear* to succeed (or fail undetected) so the row stayed `"bc"`. A cleanly-reverted-to-manual row would have kept the $6000. ⇒ needs live confirmation.

## A — Attribution: who typed the $12? → NOT RECOVERABLE
**ARC stores no actor on any price write.** `applyConfirmedPrice`, `applyBudgetaryPrice`, portal per-row apply, and the poll all write price with **zero user stamp and no edit-log entry.** The `qvHistory` edit logger DOES stamp `by/byName/at` — but only for **qty / part# / description** (the price `<td>` bypasses it). So:
- ✅ We CAN see **who SENT the quote** (`qvHistory` `quote_send`: `by/byName/at`, `:34505`) and **who last wrote the whole project** (`updatedBy`, last-writer-of-doc, not per-row).
- ❌ We CANNOT see **who set L3 R4/R54's price**. And if the poll-revert hypothesis holds, **no human set $12 — the poll did**, from a stale BC value.

## B — BC-write bug = **B013 (BC-401 / MSAL token expiry)** (`docs/B013-BC-RELIABILITY-DIAGNOSIS.md`)
Symptom = Jon's "failure mode B": pill stays blue/green while BC calls silently 401 and return empty/partial. Fix timeline: B013-1/2/3 shipped **2026-07-11** (v1.23.7 `d6f75153` / v1.23.10 `982e5863`); the raw-fetch mode-B gate (**G1**) shipped **2026-07-22** (`6958dc33`). **Bad window: pricing done before ~2026-07-11 is highest-risk; the mode-B read blind spot persisted to 2026-07-22.**
**Live check for PRJ402119 (esp. L3 R4/R54):** `createdAt/createdBy`, `updatedAt/updatedBy`, row `priceSource` (is it `"bc"` → poll-eligible?), `unitPrice`, `priceDate`, `bcPoDate`, `bcVerify.at`, `quoteSentAt/quoteSentRev` — **then run `runPricingAudit`**.

## C — Hard Fix 1 (block send on any red): would NOT have caught THIS
Red rows do NOT hard-block today: `sendBlocked = findIncompleteQuoteItems (qty=0 / price=0-missing / stale date / unresolved TR / manualVerify) || ownerPriority` (`:34287`). A row red *only* for non-firm lead time → warning path with a **"Continue (Budgetary)"** escape (`:34322`). **Critical gap: a wrong-but-nonzero, freshly-dated $12 with firm lead time is neither incomplete nor red → passes every gate.** Block-on-any-red is good hygiene but the real hole is a **magnitude/plausibility/divergence check, which does not exist anywhere.** SSOT `anyRedRow(project)` (`:16771`) exists; hard-block insertion = `handleSend` (`:34304`) + the `:40469` path. No displayed-vs-stored divergence detection exists.

## D — Hard Fix 2 (budgetary → manager/admin)
`isBudgetary` at `panel.pricing.isBudgetary`; checkbox `:37279-37283` has **no role gate**. Role helper ready: `isManager()` (`:2199`, incl. admin). Client fix easy (`disabled={!isManager()}` + tooltip). **Server-side caveat:** `isBudgetary` is buried in the `panels[]` array which editors rewrite wholesale → Firestore rules can't diff a nested element → **true server enforcement needs a schema change** (hoist a top-level `budgetaryLocked/budgetarySetBy`, like the pin-field precedent `:272`). Client-disable stops the honest-user path now; server enforcement is a follow-up.

## E — Hard Fix 3 (audit trail)
Zero-attribution gaps (priority order): **price writes**, **the 5-min poll** (mutates price, logs nothing — a poll-revert is completely invisible), `updateVendor`, status changes (`statusChangedAt` but no `statusChangedBy`). Gold-standard precedent to mirror: `companies/{cid}/bcLeadTimeWrites` (`:4714` — per-item, per-user, outcome+error, written even on failure). **Cheapest highest-value first step: make `pollBcPricing` log every price it changes (before→after, source) — that alone would have made this incident self-evident.**

## Debug Logs — weak evidence here
BC failures are `console.warn` → **breadcrumb-only, NOT persisted**; only `console.error`/uncaught/user-report persists. A successful price entry and the poll-revert emit nothing. Check `severity:error` + source `bcPushPurchasePrice` around the dates, but expect little.

---

# REFRAMED FIX PRIORITY (by what actually prevents recurrence)
1. **F048 — lock a sent BOM + KILL auto-pricing on it** (suppress the 5-min poll AND the on-open price-check for sent/locked quotes). *This is THE fix that would have prevented the incident.* Highest priority.
2. **Poll/price-write audit logging** (F046 first slice — start with `pollBcPricing` before→after). Makes any future silent revert visible. Fast + high-value.
3. **Plausibility / quoted-vs-current divergence check** (NEW — not in Jon's original list): flag/block when a row's price diverges sharply from the quoted value or from BC by a magnitude threshold. This is the only thing that catches a wrong-magnitude price *regardless of source* — the true hole.
4. **F049 — snapshot at send + PO-receipt reconcile** (the snapshot also would have answered "did PRJ402119 change post-send?").
5. **F044 — block send on any red** (good hygiene; honestly would NOT have caught this $12).
6. **F045 — budgetary → manager/admin** (client now; server needs the schema hoist).
7. **F047 — hover shows approver** (needs F046 attribution to exist first).

# IMMEDIATE LIVE STEP TO CONFIRM (needs Jon's authenticated session)
Run **`runPricingAudit`** on PRJ402119 + read L3 R4/R54 fields (`priceSource`, `unitPrice`, `priceDate`, `quoteSentAt`, `createdAt`) + compare against the **sent PDF**. This confirms/refutes the poll-revert hypothesis and dates it against the B013 window.

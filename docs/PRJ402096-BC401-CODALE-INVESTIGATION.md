# PRJ402096 — Investigation: "BC Sync Incomplete (61)" + 5 Codale items no pricing

**To:** Freddy (Analyst/Hub) · **From:** Marc · **Date:** 2026-07-08 · **Prod v1.23.3 · READ-ONLY — no data written, no fix, no re-push**

Company `XODxZ8xJc0dQXGZI7jbo`. Investigated via the Claude-controlled tab (in-page authenticated Firestore reads of `debugLogs` + the project doc) and `firebase functions:log`. Did **not** re-trigger any BC write / push / re-price.

---

## ISSUE 1 — "BC Sync Incomplete: 61 items could not be pushed to BC"

### Root cause (high confidence): systemic BC **401 auth failure**, NOT unmatched items

**Evidence** — `debugLogs` `console_error` entry at **2026-07-08T17:47:44.509Z**, positively bound to **PRJ402096 / panel-1** (compared the entry's `projectId` to the project doc id in-page → match). Its 30-event breadcrumb trail:
- **19 of 30 crumbs = BC `401 Unauthorized — "The credentials provided are incorrect"`**, across *every* BC op: `bcListVendors`, `bcFetchPurchasePrices` (batch), `bcCreatePanelTaskBlock` (tasks 20100/20110/20120/20199 all POST-fail 401), `bcSyncPanelPlanningLines` (backfill 401), `bcPatchProgressBilling` (GET 401).
- A few `bcFetchPurchasePrices batch failed: 400` at the very start, then 401s dominate.
- Tail: `bcGatedFetch: 429 retry limit (3) reached` ×2 → then the Firestore `resource-exhausted` error.

**Freddy's discriminator answered:** the 61 are the **SAME systemic error (BC token rejected)**, not varied per-item mismatches. The rows have valid BC linkage — all 152 BOM rows across the 3 panels are `priceSource` `bc`(151)/`manual`(1) with `bcVendorNo`/`bcVendorName` populated. The push failed on **auth**, not on matching. The popup count (61) is just "every planning-line POST in this run got 401."

### G005 RULED OUT as the cause
`bcGatedFetch` (`src/app.jsx:419`) only alters behavior when `IS_TEST_ENV` is true (line 427). On prod `IS_TEST_ENV` is false → the suppress block is skipped → it falls straight through to `fetch(url, options)` with the **Authorization header untouched**. The `429 retry limit` crumb is its generic 429-retry belt (lines 443–451) reacting to BC **rate-limiting after the 401 retry storm** — not test-gating, not header tampering.

### Secondary symptoms (downstream of the 401, not separate bugs)
1. **429 rate-limit** — BC throttled after the burst of retried failing calls; `bcGatedFetch` retried 3× then returned the 429.
2. **Firestore `resource-exhausted: Write stream exhausted maximum allowed queued writes`** — on each BC failure the app reverts the row (`"BC push failed — reverted priceSource to manual for 9342250"`) and writes it back to Firestore; ~61 rapid per-row writes overflow the client write-queue. (Only 2 debugLog entries in the last 60 min — both this Firestore error at 17:47:44Z; the 61 BC-POST 401s themselves are NOT written to `debugLogs`, only to `console.warn` → captured as breadcrumbs on the Firestore error.)

### UX / diagnostic gaps worth flagging (for scoping, not fixed)
- The popup text — *"N items could not be pushed to BC. Use the Item Browser to find each item and apply it"* — is **misleading for a 401**: the items are matched and valid; the BC token is dead. It steers the user toward re-matching 61 good items.
- The toolbar **still shows "BC Connected" (green)** right now, even though every BC call 401'd — the indicator reflects "a token exists," not "the token is valid."
- The popup's "Retry Sync" button only renders when `allRateLimit` (all 429). A pure-401 failure likely shows no retry affordance.

### Immediate remedy (NOT applied — holding)
Re-authenticate BC (reconnect / refresh the token), *then* retry the sync. Do **not** blind re-push — confirm re-auth first. (Also: this was a real customer project, so per your safety note I did not touch it.)

---

## ISSUE 2 — "5 Codale-sourced items pulled no pricing"

### Finding: the Codale scraper **never ran** for PRJ402096's Codale items in the retained window; they were priced from **BC**

**Codale model** (`src/app.jsx` 27448–27512): the app scrapes Codale (`codaleTestScrape`) **only** for `bcVendorName ~= /codale/i` rows that **lack a recent BC price**. On a hit it sets `unitPrice` + `priceSource:"bc"` (so Codale-priced rows *look like* `bc`); on a miss → `console.warn("Codale: no price for", pn)` + `codaleMissed`. **Gate @27456 SKIPS the Codale scrape entirely when BC already has a recent price** (`unitPrice>0 && priceDate recent && priceSource==="bc"`).

**PRJ402096 state:** 14 rows with vendor **"Codale Electric Supply"** — **all currently priced** (`priceSource:"bc"`), 13/14 `leadTimeSource:"bc_vendor"` (1 `supplier`). No unpriced rows in the saved doc.

**Function logs:**
- `codaleTestScrape`: only a **2026-07-06** run of a *different* project (parts `LPSC001ID`, `937ZH-DPBN-2`, `800H-*`, `1492-*` — all returned prices) + a **07-08 03:13 deploy audit** (the G005 functions deploy, `maxInstances:2`).
- `codaleRunScrape`: no recent logs.
- **Zero** Codale activity on 07-07 / 07-08. **None** of PRJ402096's Codale PNs (`5069-*`, `800FP-P7PN5W`, `700-HP32Z24`, `800HC-FRXT6B6`, `800T-X646EM`, …) appear in the last 400 log lines.

**Conclusion:** most likely **Codale was never scraped for these items because BC pricing pre-empted it** (gate @27456) — i.e. "no Codale pricing pulled" = "Codale scrape not invoked," **not** a scraper match/parse failure. Cannot fully rule out a since-resolved earlier state, or a live in-browser force-refresh that left no retained server log.

### Blocker / ASK for Jon (via Freddy)
All 14 Codale rows are currently BC-priced, so I **can't uniquely identify which 5** Jon flagged. Need **the 5 exact part numbers** to pull targeted logs / reproduce read-only. Also: was he force-refreshing pricing (which *would* invoke Codale), or looking at the as-saved BOM (BC-priced)? That determines whether this is a scraper miss vs. the BC-pre-empt behavior above.

---

---

## ADDENDUM — Item 3044636 targeted probe (Jon's "21D keeps reverting to 60D")

**CONFIRMED end-to-end — failed lead-time WRITE leaves BC serving the stale value. This is the "write fails → stale read" mechanism, via a 400/404 upsert bug (NOT the 401).**

### Live BC read (sandbox `MATR_SndBx_01152026`, via the app's fresh token)
`ItemVendorCatalog` for 3044636 has **exactly one vendor row**:
`(Item_No='3044636', Vendor_No='V00373', Variant_Code='') → Lead_Time_Calculation: "60D"`.
The BOM row on PRJ402096 (panel-2) reads this via `leadTimeSource: bc_vendor` → shows **60D**. (Note: the 60D lives in **ItemVendorCatalog**, created by ARC — not an "Item Card default." The Item Card query for `No='3044636'` returned empty in sandbox.)

### `bcLeadTimeWrites` audit — all 3 attempts ever for 3044636 (Vendor V00373 Royal Wholesale)
| Date (UTC) | ARC wrote | Outcome | Error |
|------------|-----------|---------|-------|
| 2026-05-12 | 60D | **created** | — (row created AT 60D; prevLt null) |
| 2026-05-13 | 10D | **failed** | `PATCH 404 @ /ItemVendorCatalog(Item_No='3044636',Vendor_No='V00373')` — "The key in the request URI is not valid for resource 'NAV.ItemVendorCatalog'" (prevLt read = 60) |
| 2026-05-18 | 21D | **failed** | `POST 400 Internal_EntityWithSameKeyExists` — "The record in table Item Vendor already exists" (prevLt read = 60) |

**Loop:** row created once at 60D → every UPDATE since failed (PATCH key-form rejected → POST-fallback can't create-over-existing) → BC keeps 60D → every ARC re-price re-reads 60D (`bc_vendor`) and overwrites Jon's manual 21D.

### #182 fix IS present in v1.23.3
`bcUpsertItemVendorLeadTime` (`src/app.jsx` 4536–4569) now PATCHes existing rows with the correct **3-part compound key** `(Item_No, Vendor_No, Variant_Code)`. The live row's `Variant_Code` is `''` — exactly what #182's PATCH URL builds. So a **fresh** 3044636→21D push under v1.23.3 *should* PATCH-succeed **provided BC auth is valid at push time**. All 3 recorded attempts pre-date #182 (May) and there is **no 3044636 push attempt after 2026-05-18** in the audit — so the #182-fixed path has *never actually been exercised* on this item. Today's 401 window would also have blocked it.

### Cross-check vs the "61"
3044636 **is** in PRJ402096 (panel-2). But it currently carries **no persisted per-row sync error** (and 0 rows project-wide do), and the "61 could not be pushed" is the **planning-lines sync** (purchase-quote lines) — a *different* BC write than the ItemVendorCatalog lead-time write. So I have **no direct evidence 3044636 was among today's 61**; its known failures are the older 400/404 lead-time-write failures.

### BC auth is HEALTHY right now (17:47 401 was transient)
`window.bcLookupLeadTime('3044636')` returned HTTP **200** just now (the app's internal token is valid). The raw `window._bcToken` snapshot I can read is stale (returns 401), but the app's own calls succeed → **the 17:47:44Z 401 storm was a transient token expiry mid-push, since recovered.** This *strengthens* the Issue-1 root cause: **BC OAuth token expired mid-operation with no auto-refresh/retry-on-401**, so all 61 planning-line POSTs 401'd in one window.

### Environment observation (for Jon/Freddy to judge)
All BC traffic from **prod** `matrix-arc.web.app` is going to the BC **sandbox** `MATR_SndBx_01152026` / Company `Matrix Systems LLC`. Consistent across the 17:47 burst, the older bcPatch logs, and now. Likely intentional pre-launch, but worth confirming it isn't the "company/env mismatch" the debug warnings mention.

---

---

## DATA-LOSS MECHANISM — concurrent BOM-edit clobber (code-grounded, v1.23.3)

**Symptom:** Jon + Andrew editing PRJ402096 concurrently; each other's added BOM rows disappear ("reverts to a previous state when the other opens").

**Root cause — `saveProjectPanel` replaces `panel.bom` wholesale, with NO merge-by-id** (`src/app.jsx:9266`):
- Reads the whole project (`ref.get()` @9277), replaces the target panel with the **incoming client's** `safeUpdated` (@9361), writes the whole project back.
- It DOES merge, by id, against the Firestore copy: **pages/storageUrl, reviewNotes, reviewShapes** (@9321–9351) — added in v1.19.776 precisely because "Andrew + Jon writing notes simultaneously would lose whichever note was overwritten."
- **There is NO equivalent merge for `bom`.** The target panel's BOM array is taken wholesale from the (possibly stale) incoming client. → Client A saves N+2 rows; Client B (stale, N rows) saves next → overwrites A's panel, dropping A's 2 rows. Classic last-write-wins.
- `updatedBy:uid` IS set (@9373) — so the same-user echo-revert fix (BOM-REVERT-FIX-PLAN) IS shipped. The per-project lock `_panelSaveLocks` (@9270–9273) only serializes **within one client**, not across users.

**The fix pattern already exists in this same function** (merge-by-id for pages/notes/shapes) — it simply was never applied to `bom`. Merge incoming BOM against the Firestore copy by row id, preserving rows the other client added.

**Add→write characterization (Freddy Q1–3):**
- Q1: A manual add = `addBomRow` (@26558) reads `panel` from **React closure**, appends the row, and writes the **whole panel** via `onSaveImmediate` → `saveProjectPanel` (whole-project read + set). **Not per-row writes** — one large whole-project write per add.
- Q2: `addBomRow` swallows save errors (empty `try/catch` @26578). Under `resource-exhausted` ("Write stream exhausted maximum allowed queued writes") the client write QUEUE is full → excess writes rejected → those adds **do not persist** server-side (silent loss on reload); no explicit app-level retry (relies on the SDK queue that is itself exhausted).
- Q3: **Yes** — it is the same wholesale `panel.bom` overwrite; a stale-closure snapshot clobbers concurrent rows (matches Coach C136).

**Two SEPARATE problem domains on PRJ402096 (do not conflate):**
- **(A) BC sync failures (planning lines)** — the "61 items" popup = transient BC **401** auth storm (17:47Z, since recovered); a separate "**2 items**" popup seen live at ~22:59Z = `"Type must not be Text in Project Planning Line"` for **534013 (Eriflex Busbar)** + **Contingency** (Task 20210, Lines 790000/800000) — a #168-family planning-line field-type error. These are BC-write issues; they do NOT lose BOM data.
- **(B) Firestore BOM data-loss** — the concurrent-edit clobber above. THIS is the row disappearance.

**Known-issue cross-refs:** `BOM-REVERT-FIX-PLAN.md`, `BOM-WRITE-PATHS-MAP.md` (W6 `addBomRow`), `ARC-AUDIT-FINDINGS.md` F-2b.1 (CRITICAL, no shared mutex), F-1f.1 (saveProject vs saveProjectPanel race), F-1h.4 (BOM dedup in saveProjectPanel but not saveProject).

## Notes on what I did NOT conflate
- The `bcPatchLaborPlanningLines` / `bcPatchProgressBilling` **404** "planning line not visible to this user … Project_Planning_Lines_Excel" warnings in `debugLogs` are **~14.5h old, from PRJ402134, against sandbox `MATR_SndBx_01152026`** — a separate pre-existing sandbox/OData-page quirk, unrelated to today's PRJ402096 401 issue.
- An **03:27Z** (~14.5h ago) burst shows a *different* signature — `bcPushPurchasePrice POST 400 Internal_InvalidTableRelation` (bad Item/Vendor relation, #188-style) — also not today's 401 issue.

---

## EVENING ADDENDUM (2026-07-08 ~22:40–00:52Z) — live incident: B012 proof, B016 re-scope, B013, rules analysis

All read-only. Company `XODxZ8xJc0dQXGZI7jbo`, prod. PRJ402096 doc id = `2vVsTW9goqJ1G9b8AMDC`; `status:draft`, `preReviewStatus:"rejected"`, no owner-lock/takeover/quote-lock; panels "costed".

### 1. B012 CONCURRENT-CLOBBER — PROVEN (Jon's 2 originals: 534042, 534013)
- **534042 and 534013 are GONE** from the current Firestore BOM (157 rows) — no `534*` PN anywhere — **and were already absent in the 22:59Z snapshot (155 rows).**
- **534013 (Eriflex Busbar) provably existed as a BOM row:** it surfaced in the ~22:59Z "BC Sync Incomplete" popup (`"Type must not be Text in Project Planning Line"`, Task 20210, Lines 790000/800000) → it had been synced to a BC **planning line**, yet is **absent from the Firestore source-of-truth**. Present-in-BC-sync + absent-from-Firestore = the **clobber signature**. Timing fits **Andrew's 22:36–22:50Z concurrent-add burst** (his repeated `resource-exhausted` write-stream errors), before the 22:59 snapshot. ⇒ a row Jon added pre-Andrew was overwritten out of the BOM by concurrent whole-object saves = concrete **B012**, exactly what Phase B (row-merge, PR #5) fixes.
- **Caveat:** 534013's clobber is strongly evidenced (BC artifact + Firestore absence). **534042** is per Jon's report — no independent artifact found (not in either snapshot, no BC trace); clobbered like 534013 or never-persisted (B016). Recovery = re-add both (they still need pricing) once concurrent editing is safe.

### 2. Send-block "2 items incomplete" — NOT phantom; NOT the missing originals
- Applying `findIncompleteQuoteItems`' exact predicate to the current BOM: the 2 blockers are **8660023** (price 186.44, **priceDate null**) and **8617502** (price 48.17, **priceDate null**), both panel-1, Rittal, `priceSource:bc`. Both have a price but **no priceDate** → the block ( #178/#179 pattern: BC Item-Card cost applied, no PurchasePrice Starting_Date).
- The count is computed **live from the current BOM** (`findIncompleteQuoteItems(project)` on the live prop, app.jsx:15973 / called @36141) — **not** a cache/snapshot. So the "block stuck counting the 2 missing originals" theory is **disproven**; the block is accurate to current rows. (Of Jon's 6 visible reds, only the 2 null-priceDate rows actually trip the send-gate; 9345610/8660021/8660022 dated 06-29 (~10d) and 8617500 dated 07-08 are within the 60-day window.)

### 3. B016 "add did nothing" — RE-SCOPED to a DELAY/write-race, NOT a deterministic silent no-op
- Row count went **155 → 157**: Jon's adds **did persist**, just rendered minutes late.
- `firestore.rules` ALLOW analysis **rules OUT permission-denied**: the project-update rule (rules:370) for PRJ402096 evaluates to allow — `canWrite()` true; `isOwnerPriorityLocked` false (`ownerLockActive` null); `isWonOrLostLocked` false; **`isInReviewLocked` false because it triggers only on `preReviewStatus=='pending'` and PRJ402096 is `'rejected'`** (rules:252-256). So the write is NOT rule-blocked for either user.
- ⇒ B016 = intermittent **render/save DELAY under PRJ402096's heavy on-open BC churn** (132-item Purchase Prices, `bcSyncPlanningLines`, `bcPatchProgressBilling` ×3, repeated searches, 400s) starving the UI/save for minutes. The BC Item Browser add path DOES have a latent silent branch (`applyBcItem` @26830 `if(!row)return` before `commitBcItem`'s insert-manually fallback @26644; fire-and-forget save @26817 + empty catch @26578) — but the adds land on retry/settle, so the fix is resilience-under-load + surfacing the outcome, NOT a deterministic applyBcItem patch. (A `projectPresence` update *was* observed `permission-denied` in my tab — a SEPARATE subcollection rule / stale-heartbeat-after-leaving, not the BOM save.)

### 4. B013 — BC connection degrades PER-SESSION (not account/tenant)
- When Jon's BC Item Browser search went fully dead, a BC search from MY controlled tab (authed as Jon, live token) returned **HTTP 200** with results (`8660022`→1, `866`→10). No 401/429 → **BC is healthy at the tenant level.** ⇒ Jon's **session** token/state degraded from hours of heavy churn; **fix = hard-reload + reconnect BC** (the "BC Connected" indicator can lie). Own item (B013-class): the indicator should reflect real session health + auto-reconnect/backoff.

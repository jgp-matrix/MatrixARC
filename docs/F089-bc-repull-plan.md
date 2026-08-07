# F089 — Manual re-run BC match + lead-time pull (one-click "Refresh Pricing + Lead Times")

**Author:** Sam Wize (Coach) · Architecture/scoping lane
**Date:** 2026-08-06 · **Prod:** v1.24.104 · **Classification:** MONEY-PATH (pricing + BC writeback)
**Status:** BUILD-READY scoping plan — NOT built. Requires Jon decisions (see §7) + Coach review + live gate before merge.

> All line anchors below were re-grepped against `src/app.jsx` at v1.24.104. Do NOT trust older line numbers.

---

## 1. Problem (VERIFIED)

The BC-match + BC price + BC vendor-catalog **lead-time pull** live inside `runPricingOnPanel` (`src/app.jsx:31761`). That function is invoked **only** by extraction-adjacent paths — there is **no toolbar button that calls it** (`grep 'onClick=.*runPricingOnPanel'` = 0 hits):

- `validatePanel` → post-validation pricing (`:32688`)
- post-extract pricing (`:30032`)
- recon post-commit re-price, fire-and-forget (`:28829`, `:29049`)

The BOM toolbar's **"📥 Get Prices"** button (`:33609`) calls `runApiPricingOnPanel` (`:32471`) — **Mouser/DigiKey API pricing only**. It performs **no BC matching, no BC price pull, no BC lead-time pull**.

**Consequence:** the B095 lead-time fix (inside `runPricingOnPanel`'s BC-LT pull, `:32000`–`:32046`) only fires on a (re-)extraction. An already-extracted project with unmatched rows or missing lead times has **no one-click way** to re-pull BC match + BC price + BC LT short of re-extracting the whole panel.

---

## 2. Current triggers (code-confirmed)

| Path | Function | What it does | Trigger |
|------|----------|--------------|---------|
| BC match + BC price + BC LT (+ Codale/AI phases, gated OFF) | `runPricingOnPanel` `:31761` | Phase 1 BC match/price (`:31817`+), BC LT pull `:32000`–`:32046` (`bcLookupItemVendorLeadTime`→`bc_vendor`, else `bcLookupLeadTime`→`bc_item`), vendor backfill `:32364`, `bcVerify` stamp `:32389`, commit via `onUpdate`+`saveProjectPanelWithRetry` `:32419`+ | **extraction / validate / recon only — no toolbar** |
| Mouser+DigiKey API pricing, row-apply only | `runApiPricingOnPanel` `:32471` | Batched `digikeySearch`/`mouserSearch`, merge lowest, classify UPDATABLE vs CONFIRMED, apply on-row, open opt-in `apiOptionalModal` for confirmed | **"📥 Get Prices" toolbar** `:33609` + `▾` force-fresh `:33615` |
| Opt-in API→BC price write | `recordOptionalPricesToBc` `:32619` | Writes CHECKED confirmed-row candidates to BC PurchasePrices via `bcPushPurchasePrice` | **`apiOptionalModal` confirm button** `:35647` |
| Combined BC+API refresh | — | **does not exist** | **← F089 builds this** |

Feature flags (`:6398`–`:6411`): `AUTO_PRICING_ENABLED=false`, `API_PRICING_ENABLED=true`, `BC_PRICING_ENABLED=true` (BC match+price+LT = default source of truth), `SCRAPER_PRICING_ENABLED`/`AI_ESTIMATE_PRICING_ENABLED` OFF.

---

## 3. Corrected precedence (Jon's ruling 2026-08-05 — AUTHORITATIVE)

Supersedes any earlier H1/H2 protect-BC recommendations. **Do NOT reintroduce the old protect-BC model.**

1. **API/Supplier pricing = newest + most-accurate truth.** It UPDATES the BOM row (new price + new `priceDate`) AND writes to BC → BC becomes source of truth for internal work. API/RFQ pricing must NEVER take a back seat to BC.
2. **BC confirmed price+LT ALWAYS overwrites budgetary/manual.** Manual entry is only a quick budgetary quote; any BC link = source of truth.
3. **Manual lead times need NO protection** — they are saved to BC on entry, so a BC pull just re-reads them.

**Effective precedence hierarchy:** `API/Supplier price  >  BC-confirmed  >  budgetary/manual`.

**→ DROP:** the `protectBc` clobber-guard (old "H1") **and** the manual/supplier-LT preservation (old "H2"). Both were wrong under this ruling.

---

## 4. Design — one-click "Refresh Pricing + Lead Times"

### 4a. Composition order (BC pass FIRST, then API pass)

```
onRefreshPricingAndLeadTimes():
  1. await runPricingOnPanel(panel.bom, panel, /*no onEpProgress → standalone*/ null, {forceFresh})
        → BC match + BC price + BC LT pull (binds bcNo/vendor, stamps bcVerify, sets priceSource:"bc")
  2. read the BC-pass RESULT bom (see 4b)
  3. await runApiPricingOnPanel(resultBom, resultPanel, {forceFresh, writeBcAsNorm:true})
        → Mouser/DigiKey price overwrites on-row where found (API newest wins) + writes price back to BC
```

**Why BC first:**
- It binds `bcNo` + `bcVendorNo` on each row (`:31878`, vendor backfill `:32364`). The API→BC price writeback needs the BC surrogate (`bcPushPurchasePrice(itemNo=bcNo, vendorNo, …)`, `:6469`) and the vendor number — both produced by the BC pass.
- It pulls BC lead times (F089's whole point) — the API pass does NOT return lead times, so LT can only come from the BC pass.
- Precedence is satisfied naturally: BC fills the baseline, API overwrites on top where it finds a price.

**Final per-row state after refresh:** price = API-where-found → else BC → else existing; LT = BC (`bc_vendor`→`bc_item`) → else existing; BC PurchasePrices receives the API price for every BC-linked, plausibly-priced row.

### 4b. Function composition detail (avoid the stale-bom race)

`runPricingOnPanel` currently **returns nothing** and commits via `onUpdate(updated)` + `saveProjectPanelWithRetry` (`:32419`+). React state / `panelRef.current` are NOT guaranteed fresh synchronously after the `await`. If the API pass reads a stale `panelBase.bom` it will **wipe the BC pass's price+LT+bcNo** on its own save (B104/B078 funnel writes the whole panel).

**Required change:** make `runPricingOnPanel` **return the committed `{...panelBase, bom:updatedBom}`** (or at least `updatedBom`) and have the combined handler pass that object straight into `runApiPricingOnPanel(returnedBom, returnedPanel, …)`. Do **not** rely on ref propagation between the two awaits. This is the single most important correctness detail in the build.

### 4c. Toolbar button

New button in the right-justified action group (`:33599`), sibling to "📥 Get Prices". Gated identically: `API_PRICING_ENABLED && !readOnly && _apiKey && bom.length>0`, **`ownerPriorityActive` → `_fireOwnerPriorityAlert`** (destructive: writes to BC), `disabled` while `aiPricing`. Include a `▾` force-fresh variant (mirrors `:33615`).

Label/placement/scope are Jon decisions (§7).

---

## 5. API→BC writeback change (`recordOptionalPricesToBc` + F071 gate)

### Current state
- API prices are applied **on-row only**. They are written to BC **only** via the opt-in `apiOptionalModal` → `recordOptionalPricesToBc` (`:32619`), and **only** for the CONFIRMED-row "optional candidates" (`:32567`). **UPDATABLE rows get an on-row price but NO BC write at all.**
- `runApiPricingOnPanel` PROTECTS confirmed rows (`_rowConfirmed` `:32487`; `:32565`–`:32569`): never overwrites price/vendor, only offers the opt-in modal.

### Required under ruling #1 (API→BC as the NORM)
1. **Drop the CONFIRMED-protection branch.** Under "API newest wins," a plausibly-priced API hit overwrites the row (price + `priceDate`) regardless of confirmed status — same on-row apply currently used for UPDATABLE (`:32570`–`:32574`, keep-vendor + strip `bcPoDate`).
2. **Write every applied API price to BC inline** (new norm), reusing the exact guard stack already proven in `recordOptionalPricesToBc`:
   - **F071 `bcCommitGate` HARD-BLOCK** (`useBcCommitGate` `:682` / `:25588`): if BC is red/unusable, **skip all BC writes cleanly, never throw** (`:32624`). On-row prices still apply + persist.
   - **`>$0` guard** (`:32642`) and **`≤ _API_PRICE_MAX` plausibility ceiling** (`:32564`, `:32645`) — a wildly-wrong or zero value must never poison BC's shared catalog.
   - **Vendor# resolved from `config/vendorConfig`** (`digikeyVendorNo`/`mouserVendorNo`, `:32633`–`:32637`) — NOT a displayName fuzzy match. Missing vendor# → skip that write + surface the setup notice (`:32658`). (Per memory: DigiKey=V00196, Mouser=V00304, but read live from config.)
   - **`bcNo` required** — `bcPushPurchasePrice` needs the surrogate. Rows that never matched BC (not-in-BC, no `bcNo`) get the on-row price but **cannot** write to BC (adding a PurchasePrice to a non-existent BC item is the F071 "Create in BC" flow — OUT OF SCOPE). Enumerate this: the norm-write covers **BC-linked rows only**.
   - **UoM parity** (`:32651`): resolve base UoM via `bcGetItemBaseUom(bcNo)` when the row carries none.
3. **The opt-in `apiOptionalModal` collapses.** With confirmed-protection gone there are no "optional candidates." Either remove the modal path or repurpose it as a **post-write summary** (Jon decision §7). `recordOptionalPricesToBc`'s guard logic is **reused inline** in `runApiPricingOnPanel`'s apply loop — factor it into one helper so the rule can't drift (Single-Source-of-Truth principle, CLAUDE.md).

### Money-path nuance to confirm with Jon (§7)
runPricingOnPanel's BC eligibility currently **skips `priceSource:"manual"` rows entirely** (`:31843`) and its LT filter skips `manual`/`supplier` LT (`:32004`–`:32006`). Ruling #2/#3 say BC-confirmed **should** overwrite budgetary/manual and manual LT is just re-read from BC. Honoring the ruling means the BC pass must **stop blanket-skipping manual** (match + overwrite budgetary manual). This is a behavioral change beyond "add a button" — auto-overwriting user-typed budgetary prices on a refresh — so it needs an explicit Jon confirm before build.

---

## 6. Money-path risks + invariants

**Risks**
- **Wrong price → BC.** A bad API hit poisons BC's shared catalog for every user. Mitigated by the `≤ _API_PRICE_MAX` ceiling + `>$0` guard on BOTH the row-apply and the BC-write path.
- **Overwriting a good BC price with a stale/zero API value.** The `found && price>0` filter (`:32546`) + ceiling handle zero/implausible; "stale API" is not a concept here (API is fetched live this run).
- **BC down mid-refresh.** F071 `bcCommitGate` must hard-block writes and skip cleanly (never throw) so the row-apply half still succeeds.
- **BC write throttling / cost.** A large refresh writes many PurchasePrices; BC throttles hard on sustained writes (fresh-etag PATCH required). Rely on `_bcSemaphore` (max 6, `:705`) + `bcGatedFetch` retry; consider a soft cap / progress on the write loop.
- **Stale-bom race between the two passes** (§4b) — the top correctness risk; solved by return-value composition.
- **Owner-priority / lock.** Combined action writes to BC → must be gated by `ownerPriorityActive` (destructive), like Push Lead Times / Get Prices.
- **Async project ownership (#86).** Both sub-functions already identity-guard their completion writes (`_apAlive` `:32505`, captured `projectId`/`panelId`, bg-task lease keep-alive). The combined handler must not introduce a fresh unguarded write.
- **`priceSource:"bc"` mislabel** on API-applied rows (`:32572`) — pre-existing deferred follow-up; note but don't fix here.
- **Test-env belt.** `bcGatedFetch` suppresses non-sandbox mutations on the test host with a fake-200 (`:718`) — BC writes won't actually land on Test. Verify F089 on prod or a sandbox env.

**Invariants that MUST hold**
- I1: Never write `$0` or `> _API_PRICE_MAX` to BC.
- I2: Never write to BC when `bcCommitGate` is set (BC unhealthy) — skip cleanly, never throw.
- I3: Never write to BC without a resolved `vendorNo` AND a `bcNo`.
- I4: On-row applied price === price written to BC (parity) for every BC-linked row.
- I5: LT pulled from BC by the BC pass is never regressed by the API pass (the API pass must not touch `leadTimeDays`).
- I6: Both writes target the ORIGINATING project/panel only (Async Ownership Rule).
- I7: BC-pass result bom is the input to the API pass (no stale-bom overwrite).

---

## 7. Open Jon decisions (answer before build)

1. **Confirm API→BC-as-norm.** Every refresh writes applied API prices to BC (not opt-in). Confirmed? (This is the core ruling-#1 change and it writes to BC on every refresh.)
2. **API over freshly-pulled BC-confirmed.** In the same refresh the BC pass may pull a confirmed BC price seconds before the API pass overwrites it. Does "API newest wins" apply even there, or only over stale/budgetary rows? (Ruling reads as: always API wins. Confirm.)
3. **Auto-overwrite budgetary MANUAL prices?** Honoring ruling #2 means the BC pass stops skipping `priceSource:"manual"` and overwrites user-typed budgetary prices on refresh. Confirm this is wanted (it changes existing manual-row behavior).
4. **Opt-in modal fate.** Remove `apiOptionalModal` entirely, or repurpose as a post-write summary of what was written to BC?
5. **Button label + placement.** e.g. "🔄 Refresh Pricing + Lead Times" in the BOM action group. Include the `▾` force-fresh split?
6. **Scope: active panel vs all panels** in the project.
7. **RFQ coupling:** does Refresh only price + pull LT, or also trigger RFQs for still-unpriced / no-LT rows? (Recommend: price/LT only — RFQ stays a separate explicit action.)

---

## 8. Effort + gate

**Effort: M** (leaning M/L). New combined handler + toolbar button (small); return-value refactor of `runPricingOnPanel` (small but load-bearing); rework `runApiPricingOnPanel` to drop confirmed-protection + inline the BC-write-as-norm using the `recordOptionalPricesToBc` guard stack (medium); rework the two `manual`-skip eligibility filters per ruling (medium, high-stakes); collapse/repurpose the opt-in modal (small).

**Gate:** MONEY-PATH + BC writeback → **Coach review of the built diff + a live verification gate on prod (or a BC sandbox env, since the test host blocks BC writes) before merge.** H-item discipline (baseline → plan → Jon approve → implement → regression → Coach review → Jon final).

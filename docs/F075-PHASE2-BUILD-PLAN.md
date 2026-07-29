# F075 Phase 2 — Get Prices: Confirmed/Budgetary-gated apply + record-as-optional

**Author:** Freddy (consolidating Coach's two scoping passes) · 2026-07-29 · Scope: `src/app.jsx` (F075 branch `claude/f075-get-prices`). Base after prod hotfix v1.24.52 (RFQ-send date fix already shipped). Money-path + NEW BC-write from the Get-Prices button.

## Origin — Jon's live test of the restored Get-Prices button (Test) → 4 findings
1. Get Prices **overwrote the Primary Supplier with "DigiKey"** (a distributor that isn't the item's primary). — FIX HERE
2. RFQ-Send price populated but **Priced Date stayed stale**. — ALREADY SHIPPED as prod hotfix v1.24.52 (strip `bcPoDate`).
3. Auto-pricing sending ALL items must **not overwrite the primary supplier unless approved**. — FIX HERE
4. When the API price comes from a non-primary vendor, **add it as a Secondary supplier / optional price** and let the user choose. — FIX HERE

## Jon's reframe (supersedes the old "never overwrite manual" rule)
The blanket "never overwrite a `priceSource:"manual"` row" is **leftover from early dev**. ARC already gates human intent via the **Confirmed vs Budgetary** price-confirm popup (DECISION v1.19.376, `priceConfirmPending` @ `src/app.jsx:26686`). Use THAT classification, not the blunt manual-protect. When an API grab finds a different price, **record it as an optional Item Vendor Catalog entry** rather than fighting over the row.

## Durable per-row signal (Coach-mapped)
No dedicated `costType` field exists; derive from `priceSource` + `priceDate`:

| Row state | `priceSource` | `priceDate` | Meaning | Phase 2 behavior |
|---|---|---|---|---|
| Budgetary | `"manual"` | **null** | planning placeholder | **updatable** — apply API price on-row |
| Confirmed (BC unreachable) | `"manual"` | set | firm intent | **protect** — record API as optional |
| Confirmed (in BC) | `"bc"` | set | firm, pushed to BC | **protect** — record API as optional |
| Empty / $0 / stale | (any) | none/old | needs a price | **apply** API price on-row |

Confirm the exact commit path of `applyConfirmedPrice` (`:30017`) / `applyBudgetaryPrice` (`:30002`) at build time.

## Design — rework `runApiPricingOnPanel` (F075 branch, ~:30954)
1. **Eligibility:** all priceable rows (skip `isLaborRow` / `_isExcludedFromPriceCheck` / blank `partNumber`). Default mode = rows needing a price (budgetary / $0 / stale); `forceFresh` (▾) = all eligible. **Remove** the blanket `priceSource==="manual"` skip (`:30967`) and the manual short-circuit (`:31022`).
2. **Fetch** unchanged — `digikeySearch` + `mouserSearch` only, lower-price-wins merge (the F075 build already does this correctly).
3. **Classify at apply** per the table:
   - **Updatable row** (budgetary / empty / stale) → apply on-row: `unitPrice`, fresh `priceDate`, **KEEP existing `bcVendorName`/`bcVendorNo`** (do NOT stamp `match.source`), **strip `bcPoDate`** (mirror the v1.24.52 hotfix so the date displays). Clears the red flag a null date caused.
   - **Confirmed row** → leave `unitPrice`/`priceDate`/vendor **untouched**; collect `{row, apiVendor(source), price}` into a `optionalCandidates[]` list.
4. **After apply** — if `optionalCandidates.length`, open a **summary + confirm modal** (Jon's choice: NOT auto):
   - Lists each candidate: part, current confirmed price/vendor, the API vendor + price it wants to record as an *optional* Item Vendor Catalog entry.
   - Per-row checkbox + a **"Record N optional prices to BC"** button. Cancel = record nothing (prices already applied to the updatable rows regardless).
   - On confirm → for each checked candidate, write via **`bcPushPurchasePrice`** (F072 machinery), vendor number resolved from **`config/vendorConfig` (`digikeyVendorNo`/`mouserVendorNo`)** — NOT the fragile `displayName.includes` fuzzy match.
   - **Guards (mandatory):** inherit F071 `bcCommitGate` HARD-BLOCK (skip the optional write entirely when BC is down/unverified — never error) + the `>$0` guard. If a distributor's vendor ID isn't set in `config/vendorConfig`, **skip that write and surface** "DigiKey/Mouser not set up in Vendor Sync settings" — do not silently no-op.
5. **Post-run summary pill:** `X priced · Y optional prices recorded to BC · Z skipped (reason)`.
6. **NO per-row prompt / no review modal for the on-row apply** — the Confirmed/Budgetary classification is a decision the user already made, so the on-row apply is deterministic + non-destructive. The only interactive surface is the optional-price confirm modal.

## Explicitly OUT of scope (deferred)
- The `priceSource:"bc"` **mislabeling** of API web prices (the deeper root of finding #2's edge case). Bigger blast radius (pill/row-color key off the label). Track as a follow-up; Phase 2 keeps the hotfix's strip-`bcPoDate` approach.
- **"Make Primary"** (re-pointing the BC Item-Card `Vendor_No`) — a new BC write class F072 never built. Not needed: "choose Primary/Secondary" = which vendor's price the row uses, satisfied by the optional-catalog record.
- RFQ-send `onApiPriced` name/number divergence — flag only; leave attribution as-is (RFQ to a vendor legitimately attributes to it).

## Data-safety checklist (Coach review gate before Test)
- API source NEVER written to a row's `bcVendorName` → primary can't be clobbered (kills #1/#3).
- Confirmed prices never overwritten (protected by the classify step).
- Optional BC write is opt-in (confirm button), F071-gated, $0-guarded, vendor# from canonical config, audit trail consistent with F072/`bcLeadTimeWrites`.
- Manual-preserve behavior change is intentional + gated by Confirmed/Budgetary (satisfies "never overwrite user data silently" — the classification IS the user's prior decision).

## Verification (Test host, disposable project)
Get Prices on a panel with a mix of: empty rows (→ priced on-row), a Budgetary manual row (→ updated on-row), a Confirmed row (→ price/vendor untouched; appears in the optional-record modal). Confirm the modal lists optionals, the confirm-button writes to BC via the right vendor#, BC-down skips cleanly, $0 skipped, manual-Budgetary updates, manual-Confirmed protected. Regression: no Codale/custom-scraper/AI call; no primary overwrite; Priced Date correct.

# F089 BUILD PLAN — "Refresh Pricing and Lead Times" (combined pricing+LT refresh button)

> Coach (Sam Wize), read-only scope, 2026-08-05 · prod v1.24.90 · MONEY-PATH. All anchors verified vs src/app.jsx this session.

## Load-bearing reality (verified)
- The only pricing button today is **"📥 Get Prices"** (`:33280`) → `runApiPricingOnPanel` (`:33277`) = **Mouser/DigiKey API ONLY**. It does NOT touch BC match/price or lead times, and stamps applied rows `priceSource:"bc"` (known mislabel :32250).
- **`runPricingOnPanel`** (`:31439`) = the full BC match + BC price + BC lead-time engine (incl. B095 surrogate bind + B078-3 loud-fail). It's **extraction-only today — no rendered button invokes it standalone**.
- **Scrapers + AI pricing are flag-OFF** (`SCRAPER_PRICING_ENABLED=false :6322`, `AI_ESTIMATE_PRICING_ENABLED=false :6323`). So "slimmed, no triple-checking" is largely already the state of the pricing fns — the heavy verification (Haiku part# check / bomVerification, bomAudit, anomaly/confidence recompute, re-render retries) lives in the EXTRACTION layer, not the pricing fns. **Composing the two pricing fns already excludes all of it — nothing to strip.**

## Combined handler `runRefreshPricingAndLeadTimes` — BC-FIRST
```
1. await runPricingOnPanel(panel.bom, panel, undefined /*standalone*/, {forceFresh})  → BC match+price+LT
2. await runApiPricingOnPanel(freshBom, {...panel,bom:freshBom}, {forceFresh, protectBc:true})  → API gap-fill
```
**⚠ Order = BC-first, NOT API-first (Jon listed API first — that's UNSAFE):** `runApiPricingOnPanel` stamps applied rows `priceSource:"bc"` + fresh `priceDate`, which then matches `runPricingOnPanel`'s stale-skip filter (:31526) → BC (source of truth) would SKIP those rows. BC-first + API-gap-fill-second is the only correct order. **Confirm with Jon.**

Required code changes:
- **A — `runPricingOnPanel` returns its result bom** (`return updated;` after save, ~:32055) so the API step reads the post-BC bom, not a stale `panelRef.current`.
- **B — `protectBc` opt on `runApiPricingOnPanel`**: treat ANY `priceSource:"bc"` row (even without a PP priceDate) as confirmed → API offers optional-only, never overwrites on-row (clobber guard, H1).
- Composition yields 2 snapshots + 2 bg tiles + 2 saves (acceptable; optionally suppress 2nd snapshot).

## Button/UX rename change set
- Label `:33280` "📥 Get Prices"→"🔄 Refresh Pricing and Lead Times" (busy "Getting prices…"→"Refreshing…").
- Main click `:33277` → `runRefreshPricingAndLeadTimes({})`; ▾ dropdown `:33283` → `{forceFresh:true}` + reworded confirm.
- Tooltip `:33276`; render gate `:33274` → `(API_PRICING_ENABLED||BC_PRICING_ENABLED)&&!readOnly&&_apiKey&&bom.length>0`.
- Other "Get Prices" text refs to update: `:17984`, `:32336`, `:32577`, `:55428`, snapshot label `:32191`. (runPricingOnPanel's own "Get New Pricing" strings — unify to new name, cosmetic.)
- Owner-priority gate unchanged (`_fireOwnerPriorityAlert`).

## Money-path decisions for Jon (H1-H6)
- **H4 ORDER (confirm):** BC-first, then API gap-fill (Jon's stated API-first is unsafe — see above). REC: BC-first.
- **H1 clobber (must-fix):** BC always wins; API fills only unmatched/unpriced (Change B `protectBc`). REC: yes.
- **H2 manual/supplier preservation under forceFresh:** the LT piggyback OVERWRITES `leadTimeSource:"manual"`/`"supplier"` when forceFresh (:31677-79), and budgetary manual (no date) prices get API-overwritten. The confirm copy promises "manually-entered rows are preserved" — currently FALSE for LT under force. REC: **never overwrite manual/supplier LT even on forceFresh** (make the manual/supplier skip unconditional) + reconcile copy. **Jon decision.**
- **H5 forceFresh default:** plain button = respect stale thresholds (cheaper); ▾ = force ALL. REC: keep two-tier (matches today). (Jon said "ALL" — could make plain force too.)
- **H3 write burst:** combined path is READ-only vs BC (match/price/LT lookups); only BC writes are the opt-in recordOptionalPricesToBc (user-gated, F071 hard-block) + downstream planning-line sync. REC: no extra governor needed (B078-4 covers Firestore writes anyway).
- **H6 F1 manual-verify guard:** preserved (OCR-noisy fuzzy on MVR panels stays held for review). REC: keep.

## Effort/version
Medium. Version bump = **minor** (new combined flow). No functions/ changes.

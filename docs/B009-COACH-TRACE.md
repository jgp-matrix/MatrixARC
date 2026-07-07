# B009 — Supplier-upload TR auto-stamp self-clears — COACH CODE-TRACE

**Author:** Sam Wize (Coach) · **Date:** 2026-07-07
**For:** Freddy (hub) → Marc (live repro + Debug Logs confirm before any fix).
**Traced against tip:** `46f433ab` (prod v1.22.3). **Trace only — no code changed.**
**Symptom (Jon, live):** uploaded 4 supplier quotes → crosses imported + TR auto-stamped on crossed rows → **a few seconds later the TR checks cleared; rows went RED.**

---

## 0. TL;DR

The auto-stamp itself works and **the apply path persists it correctly** — I proved the quoteReview→`doApplyPortalPrices` path preserves `techReviewFlag` through its awaited save. **So Freddy's hypothesis #1 (B004-style unawaited save on the upload path) is REFUTED for the primary path.** The clear comes from a **LATER writer** — a background **reprice/second save** that rebuilds & re-saves the BOM off a row set that doesn't carry the just-stamped flag. `techReviewFlag` is referenced by **zero** pricing code, so it survives a reprice ONLY via `...row` spreads — and crossed rows are left **unpriced** by the apply, which is exactly the bait for an auto-reprice. **Hypothesis #2 (reprice race) is the surviving mechanism — Marc to confirm which writer lands last.**

**Diagnostic tell (important):** Jon saw **RED**, not **yellow**. Under F003-C8 an *unresolved* TR row renders **yellow** (`rgba(250,204,21,0.40)`). RED means the flag is genuinely **gone** (row reverted to the pricing-red state), not merely restyled — this confirms a true clear, and rules out an F003 render-only glitch. **Hypothesis #3 (F003 clears it) is REFUTED** — F003 has no flag-clearing path; C8 is only what makes the symptom diagnostic.

---

## 1. Which path Jon used
The supplier-cross **auto-stamp exists at exactly ONE site: `app.jsx:39069`** (`techReviewFlag:true,techReviewFlagSource:"supplier",…`) — inside the **"Review Supplier Quote" → "Apply N Items to BOM"** button (39058). (Freddy's `@38978` is the pre-drift line.) Since Jon saw the stamp fire, he went through this quoteReview flow. Sequence:
1. **39064–39072** — for crosses, map panels applying `partNumber=supplierPN, crossedFrom, isCrossed:true` **+ the auto-stamp**, then `update({...projectRef.current,panels:updatedPanels})` (39072). `update` (37671-37675) **synchronously** sets `setProject` **and** `projectRef.current` — so the stamp is live in state + ref. **No save here.**
2. **39084** — `await doApplyPortalPrices(remapped)`.

## 2. What I PROVED preserves the flag (so it's NOT the bug)
`doApplyPortalPrices` (38164):
- Reads `projectRef.current.panels` (38339) — which **already holds the stamp** (step 1 synced the ref).
- Every row-map branch **spreads `...row`**: crossed rows fall to **38382** (`return …{...row,…}:row`) — `techReviewFlag` preserved; priced rows at 38380 (`{...row,unitPrice,…}`) — preserved; skip branch 38359 — preserved.
- Builds `updatedProject={...projectRef.current,panels:updatedPanels}` (38388), `update()` (38389) + **`await safeSave` (38393)** — the B004 fix. The awaited save **persists the flag.**

→ The apply path is clean. **B004's await-save is present and sufficient here; the "upload path missed the B004 fix" theory does not hold.**

## 3. The surviving mechanism — a later reprice/second-writer clobbers the flag
Two code facts make this the mechanism:
1. **`techReviewFlag` appears in NO pricing/reprice code** (grep: only the toggle @29053, the auto-stamp @39069, and the `_isUnresolvedTechReviewRow` reader @15872). So a reprice preserves it **only** if every row it emits spreads `...row`. `runPricingOnPanel` (27174) starts `updatedBom=[...bom]` and patches rows through BC+AI phases — a single non-`...row` rebuild anywhere, **or a run seeded with a pre-stamp `bomOverride`/stale `panel.bom` prop**, drops the flag on save.
2. **Crossed rows are left UNPRICED by the apply** — `doApplyPortalPrices` skips BOM-row pricing for crossed items (their price goes to the supplier PN; 38366 `hit.isCrossed` → not priced). So immediately after apply, the **stamped rows have no `unitPrice`** — which is exactly the trigger for ARC's "auto-reprice when any row lacks a price" pattern (e.g. the recon post-commit reprice at **24810-24811**: `if(bom.some(r=>!r.unitPrice)&&_apiKey) runPricingOnPanel(...)`).

**Mechanism:** after the apply, a background reprice fires (auto-reprice-on-unpriced, or a pricing `useEffect` reacting to the apply's state change). It runs `runPricingOnPanel` off a BOM that either (a) is a **stale pre-stamp snapshot**, or (b) is rebuilt through a branch that doesn't carry `techReviewFlag`, then **saves** — overwriting the stamped rows. The **"a few seconds"** delay = the reprice's async BC/AI calls before its save lands. Result: flag gone → row reverts from yellow (TR) to **red** (unpriced). Matches Jon's symptom exactly.

*(Note the CLAUDE.md data-retention rule — "preserve all metadata flags on save, incl. `techReviewFlag`." A reprice that drops it is precisely that rule being violated on a non-spread path.)*

## 4. What Marc must confirm at runtime (code-read proves POSSIBLE; runtime proves ACTIVE)
1. **Reproduce** on matrix-arc-test: apply a supplier quote with a cross, watch the crossed row go yellow→red over a few seconds with the console open.
2. **Which writer lands last?** Instrument (temporary logs) the `techReviewFlag` of the crossed row IDs at: (a) right after the 39072 stamp; (b) after `doApplyPortalPrices`' `await safeSave` (38393) — expect flag STILL set here (proves §2); (c) on **entry + exit** of every `runPricingOnPanel` call and any `safeSave` in the seconds after apply. The writer whose saved rows lack `techReviewFlag` is the culprit. Watch the existing `[PORTAL APPLY]` (38338) and `[SQ ONBOMUPDATE]` (39314) console lines + `companies/{cid}/debugLogs`.
3. **Confirm the trigger** — is a `runPricingOnPanel` auto-firing post-apply (because crossed rows are unpriced)? Log its `bomOverride`/`panel.bom` source and whether those rows carry the flag on entry (tells stale-snapshot vs non-spread-rebuild).

## 5. Proposed fix (after Marc confirms)
Root cause is a **later writer dropping a metadata flag**, so the fix is NOT another `await` on the apply path — it's **guaranteeing every BOM writer preserves the TR fields** (the CLAUDE.md single-source metadata-preservation discipline):
- **Primary:** harden `runPricingOnPanel` (and any post-apply reprice) to preserve the 5 TR fields — ensure every emitted row spreads `...row` (audit each phase's row construction), OR explicitly carry `{techReviewFlag,techReviewFlagSource,techReviewResolved,techReviewResolvedBy,techReviewResolvedAt}` when rebuilding. This mirrors how #199/#178 already protect flags across paths (factor the preserved-field set once).
- **Belt:** ensure no post-apply reprice runs off a **pre-stamp snapshot** — if an auto-reprice is triggered, seed it from the freshest `projectRef.current` (post-stamp), not a captured `bomOverride`.
- **Consider:** the crossed row being left unpriced is what invites the reprice — confirm that's intended (price legitimately lives on the supplier PN) and, if so, the row shouldn't be treated as "needs (re)pricing" in a way that discards its flags.

**Do NOT ship until Marc's runtime repro + Debug Logs confirm the exact clobbering writer** — the fix targets that specific path.

## 6. Pipeline / HOLD
Trace → Freddy → Marc live repro + Debug Logs (confirm §3/§4) → Coach fix plan (targets the confirmed writer) → Jon approve → build. **HOLDING — no code.**

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

---

## 7. PREP AUDIT (read-only, Freddy-authorized 2026-07-07) — suspect MAPPING, not a fix

> **Gate stands:** the fix plan still GATES on Marc's runtime confirmation of the exact clobbering writer. This is readiness, not a decision.

### 7A. `runPricingOnPanel` (27174) is internally `...r`-CLEAN — the risk is STALE INPUT, not a rebuild
Every row-emitting phase spreads `...r`, so `techReviewFlag` is carried **by value from the input**:
- BC PO-date backfill (~27208): `{...r,bcPoDate}`
- all BC/AI price-match `.map`s: `{...r, …price fields}`
- AI lead-time fallback (27663): `{...r,leadTimeDays,…}`
- vendor backfill (27689): `{...r,...vendorPatches[k]}`
- bcVerify stamp (27711): `{...r,bcVerify}`
- final: `updated={...panelBase,bom:updatedBom}` (27724) → `onSaveImmediate(updated)` (27726).

**→ The clobber is NOT a non-spread rebuild inside the reprice.** It's the INPUT: `bom=bomOverride||panel.bom` (27176) and `panelBase=panelOverride||panelRef.current` (27722). If the reprice is invoked with a **pre-stamp `bomOverride`/`panelOverride`**, or `panelRef.current`/the `panel` prop is **lagging the 39069 stamp** (the stamp lands in PanelListView's `projectRef.current` at 39072, then must propagate down to this PanelCard's `panel` prop / `panelRef.current` — a render-cycle lag), the `...r` spreads faithfully preserve rows that **never had the flag**, and the save at 27726 overwrites the stamped rows. This is the classic ref-lag/stale-closure race and fits the "few seconds" (the reprice's async BC/AI calls) exactly.

**Trigger candidates that feed it stale input post-apply:**
- **Auto-reprice-on-unpriced** — e.g. the recon-path pattern at **24810-24811** (`if(bom.some(r=>!r.unitPrice)&&_apiKey) runPricingOnPanel(latestPanelRef.current.bom,…)`). Crossed rows are left **unpriced** by the apply (§3) → they satisfy `some(!unitPrice)` → prime bait. **Marc: check for an equivalent auto-reprice reachable in the seconds after a supplier apply** (a pricing `useEffect` or a post-apply call), and whether its `bomOverride`/ref is post-stamp.
- **Manual "Get New Pricing"** (28646, `runPricingOnPanel()` → uses the `panel` prop) — only if the user clicks it; less likely unattended, but its input is the prop (lag-prone).

### 7B. Other post-apply BOM writers (so we're not tunnel-visioned) + their pattern
| Writer | Site | `...row` vs rebuild | Fresh source? | Save | Verdict for B009 |
|---|---|---|---|---|---|
| `doApplyPortalPrices` | 38339 | `...row` (all branches) | fresh `projectRef.current` | **awaited** safeSave (38393) | **PRESERVES — proven; the apply path, not the clobberer** |
| `runPricingOnPanel` | 27174 | `...r` (all phases) | `bomOverride`/`panelOverride`/`panelRef.current` | `onSaveImmediate` (27726) | **PRIMARY SUSPECT — clean code, but STALE-INPUT-prone** |
| SQ `onBomUpdate` | 39264-39333 | `...row` (39297) | fresh `projectRef.current` | fire-and-forget safeSave | preserves if ref fresh; **non-portal SQ path, not Jon's** — low |
| `applyPriceCheckDiffs` | 37066-37088 | `{...rest,…}` (rest=row) | fresh `projectRef.current` | safeSave | preserves; **user-triggered (accept diffs), not auto-post-apply** — low |
| Recon post-commit | 24800-24812 | `emap.get(id)||r` preserves + auto-reprice | `latestPanelRef.current` | onSaveImmediate | shares 7A stale-reprice risk but fires on **drawing-revision reconcile, not supplier apply** — wrong trigger |
| `_markProjectBudgetaryForRedRows` | 1574 | writes `panel.pricing.isBudgetary` only | — | — | **writes NO bom rows → cannot drop the flag** — safe |
| `saveBomRow`/`updateBomRow` | (single-row) | `{...r,[f]:v}` spread | user edit | safeSave | not auto-firing post-apply — n/a |

### 7C. What this refines about the fix (still gated)
Because the reprice code is `...r`-clean, the fix is **NOT** "add `...row` to `runPricingOnPanel`." Two candidate fix shapes to choose from once Marc names the writer:
1. **Input freshness** — ensure any post-apply reprice is seeded from the **post-stamp** `projectRef.current`/`latestPanelRef.current` (not a captured `bomOverride` or a lagging prop), and/or defer the reprice until the stamp has propagated.
2. **Save-time preservation (belt)** — have the BOM save path preserve the 5 TR fields by merging against the latest persisted rows (mirror the existing cross-user `saveProject` guards that re-read Firestore and preserve admin-set fields). Robust against ANY stale writer, not just this one — aligns with the CLAUDE.md metadata-preservation rule.

**Marc's runtime result decides which** (is the bad writer a stale-input `runPricingOnPanel`, or something 7B flagged low?). No code until then.

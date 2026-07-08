# B009 — Defensive TR-Preserve Belt — COACH FIX PLAN

**Author:** Sam Wize (Coach) · **Date:** 2026-07-07
**For:** Freddy (Analyst Review) → Jon (approve) → Marc (build).
**Traced against tip:** current master. All edits in `src/app.jsx`.

> ⛔ **PARKED — NOT SHIPPING (Jon, 2026-07-07).** Marc's multi-apply re-test came back conclusively NEGATIVE (4 scenarios incl. 3 sequential back-to-back, all clean). ROOT: `doApplyPortalPrices` **awaits** its `safeSave` (B004 fix @38406) **and** syncs `projectRef` synchronously → there is no pre-stamp snapshot for the stale-input/ref-lag race to hit. Jon confirmed his original sighting was a single pricing+lead-times apply, can't repro it now, and opted **not** to ship this defensive belt (it would guard a race the awaited save already prevents). This plan is retained as a designed-and-vetted option **only if B009 ever recurs** (instrumentation stays on test for opportunistic capture). The stale-input hypothesis was correct; it simply doesn't manifest under the awaited save. **Do not build.**

## 0. Context — this is PREVENTION, not a targeted fix
B009 (TR auto-stamp self-clears after supplier upload) was **non-reproducible in v1.23.1** (Marc+Jon, 3 scenarios incl. 6-in-one-apply; zero post-apply clobbering writer fires; Jon can't manually repro). So there is **no specific stale writer to target** — the input-freshness half of the fix is moot. Jon chose to ship the **defensive save-time belt** as by-construction insurance: the TR flag governs the send-gate (a safety gate he saw fail once), so a belt that makes ANY stale-snapshot write unable to silently drop it is cheap protection independent of which writer might someday regress. Instrumentation stays on test for opportunistic capture.

## 1. The design problem (the whole ballgame)
The belt must **preserve** the 5 TR fields (`techReviewFlag`, `techReviewFlagSource`, `techReviewResolved`, `techReviewResolvedBy`, `techReviewResolvedAt`) against a **stale-snapshot clobber**, but **MUST NOT block a legitimate TR change** — a user flagging a row, a user un-flagging a manual flag, or the engineer resolving (clearing) it. A naive "always restore a persisted flag the incoming write lacks" would re-arm a row the user just intentionally cleared. So the belt needs a way to tell **stale (incoming never saw the current TR state)** from **intentional (incoming deliberately changed it)**.

**A resolve is detectable** (incoming carries `techReviewResolved:true`). **A manual un-check is NOT** distinguishable from a stale drop by field values alone — both yield `techReviewFlag:false`. The clean discriminator is **recency**: an intentional TR change is *newer* than what's persisted; a stale write is *older*.

## 2. Design — a TR recency stamp + a shared preserve helper (mirrors the saveProject guard pattern)

### 2a. Add one additive field: `techReviewUpdatedAt`
Set `techReviewUpdatedAt: Date.now()` at **every intentional TR mutation** (the 4 write points):
| Site | Current write | Add |
|---|---|---|
| `_onTrToggle` SET (app.jsx:29011) | `{...r,techReviewFlag:true,techReviewFlagSource:"manual",techReviewResolved:false,…}` | `,techReviewUpdatedAt:Date.now()` |
| `_onTrToggle` UNCHECK (29010) | `{...r,techReviewFlag:false}` | `,techReviewUpdatedAt:Date.now()` |
| `_onTrResolve` (29026) | `{...r,techReviewResolved:true,techReviewResolvedBy,techReviewResolvedAt:Date.now()}` | `,techReviewUpdatedAt:Date.now()` |
| supplier-cross auto-stamp (39069) | `techReviewFlag:true,techReviewFlagSource:"supplier",techReviewResolved:false,…` | `,techReviewUpdatedAt:Date.now()` |
Additive field → **data-retention safe** (no removal/rename, no `APP_SCHEMA_VERSION` bump; preserved on save like every other metadata flag). It joins the 5 fields as a 6-field TR cluster.

### 2b. Shared pure helper `_preserveTechReviewFields(incomingRow, persistedRow)`
Near the other shared TR predicates (~15872). Pure function → **unit-testable in isolation** (this is what makes test criterion 3 verifiable without the B009 repro):
```js
// B009 belt — restore the TR cluster onto an incoming row when the incoming write is STALE w.r.t. TR
// (older recency stamp than persisted) AND would drop/downgrade an unresolved flag. A genuinely newer
// TR change (higher techReviewUpdatedAt, or a fresh resolve) passes through untouched.
const _TR_FIELDS=["techReviewFlag","techReviewFlagSource","techReviewResolved","techReviewResolvedBy","techReviewResolvedAt","techReviewUpdatedAt"];
function _preserveTechReviewFields(incoming,persisted){
  if(!incoming||!persisted)return incoming;
  const dbV=+persisted.techReviewUpdatedAt||0;
  const inV=+incoming.techReviewUpdatedAt||0;
  const dbFlaggedUnresolved=persisted.techReviewFlag===true&&persisted.techReviewResolved!==true;
  // incoming carries an equal-or-newer intentional TR change → trust it (legit set/uncheck/resolve)
  if(inV>dbV)return incoming;
  // incoming shows a FRESH resolve (covers the legacy stamp-less resolve case) → trust it
  if(incoming.techReviewResolved===true&&incoming.techReviewResolvedAt)return incoming;
  // otherwise, if persisted has an unresolved flag the incoming would drop, RESTORE the cluster
  if(dbFlaggedUnresolved&&incoming.techReviewFlag!==true){
    const merged={...incoming};
    for(const f of _TR_FIELDS)merged[f]=persisted[f];
    return merged;
  }
  return incoming;
}
```
**Why this satisfies the criteria:**
- **Legit flag-SET** → belt never removes a flag the incoming *adds*; incoming has `techReviewFlag:true` → falls to the final `return incoming`. ✓
- **Legit resolve** → incoming has newer `techReviewUpdatedAt` (2a bumps it) **and/or** `techReviewResolved:true`+at → passes through, flag clears. ✓
- **Legit manual un-check** → 2a bumps `techReviewUpdatedAt` on un-check → `inV>dbV` → passes through, un-check sticks. ✓
- **Stale clobber** (reprice/portal-apply built from a pre-stamp snapshot) → its row has an old/absent stamp (`inV<=dbV`) and no fresh resolve, while persisted is flagged-unresolved and incoming dropped the flag → **cluster restored.** ✓ (Fixes the B009 failure mode by construction.)
- **Legacy stamp-less edge (accepted, self-healing):** for a pre-belt flagged row (both stamps 0), a stale drop is caught by the `dbFlaggedUnresolved && incoming.flag!==true` clause (safe), but a legacy *manual un-check* with no stamp would be over-preserved (re-armed). This only affects rows flagged before the belt ships; the first intentional TR touch stamps `techReviewUpdatedAt` and the clean recency path takes over. Erring toward keeping a safety-gate flag armed is the safe direction.

### 2c. WHERE the belt lives — both existing read-and-preserve save layers (zero extra Firestore reads)
Both save paths already `ref.get()` the persisted doc and layer preservation guards — the belt is one more per-row guard in each, calling the 2b helper:
1. **`saveProject` (8907)** — full-project writes; `safeSave` (9133) routes here, so **`doApplyPortalPrices`'s `await safeSave` (38393)** and most saves are covered. Add the belt in the existing `_curDoc`-powered per-panel/per-row loop (~8959–8994) alongside the storageUrl/reviewNotes merges: for each incoming panel row, match the persisted row by `id` (from `curPanels`) and run `_preserveTechReviewFields`.
2. **`saveProjectPanel` (9233)** — panel-level writes; **`runPricingOnPanel`'s `onSaveImmediate` (27726)** and the pre-print/EQ paths use this. Add the belt in its guard block (~9277+) using the `proj`/`existingTarget` read it already does: map `updatedPanel.bom` rows against `existingTarget.bom` by `id` through the same helper.

Single shared helper → **one rule, both call sites** (CLAUDE.md single-source predicate discipline; can't drift). No new reads (both already fetch the doc).

## 3. Invariants
- **Data retention** — one additive field; the 5 existing TR fields never removed/renamed; belt only *restores*, never deletes. ✓
- **Send-gate** — unchanged; the belt keeps the flag readable by `_isUnresolvedTechReviewRow`, so the 7-surface gate behaves exactly as today (and can't be silently disarmed by a stale write). ✓
- **F003 render / role-split** — untouched; belt is save-layer only. ✓
- **No cross-user regression** — the belt only preserves when incoming is stale-and-dropping; a genuine newer write (any user) passes. Consistent with the existing ownerTakeover/storageUrl guards it sits beside. ✓

## 4. Test criteria (all verifiable WITHOUT the B009 repro)
1. **Legit flag-set persists** — check a row's TR box → save → reload → still flagged (belt no-op: incoming adds the flag).
2. **Engineer resolve clears it** — resolve a flagged row → save → reload → resolved (no yellow); send-gate no longer blocks on it.
3. **Simulated stale save does NOT clobber** — unit-exercise `_preserveTechReviewFields`: (a) stale incoming (no flag, `techReviewUpdatedAt` absent/older) + persisted flagged-unresolved → **flag restored**; (b) newer incoming (resolve, or higher stamp) + persisted flagged → **incoming wins** (clears). Pure-function test — no supplier-upload flow needed. (Can also drive live: flag a row, then persist a hand-built stale panel snapshot lacking the flag → confirm the reload still shows it flagged.)
4. **No regression** — normal TR set/resolve, red/yellow row rendering, and the send-gate all behave as pre-belt on a project with no stale writes (belt is a no-op when `inV>=dbV`, the normal case). `validate_jsx.js` clean.

## 5. Lift / risk
~6 one-line stamp additions (2a) + ~15-line helper (2b) + ~2 small per-row guard blocks (2c) ≈ **~30 LOC**. Risk **LOW** — additive field, pure-function discriminator, sits in the proven read-and-preserve guard pattern; the only nuance (legacy stamp-less over-preservation) is documented, self-healing, and errs safe.

## 6. Pipeline / HOLD
Plan → Freddy Analyst Review → Jon approve → Marc builds → verify (§4, incl. the isolated helper test) → Coach review → Jon deploy checkpoint. **HOLDING — no code.**

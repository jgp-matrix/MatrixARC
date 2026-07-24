# F065 — Cross-Line Part# Propagation — BUILD PLAN

**Author:** Marc Masdev (build-scope lane) · **Reviewed-by:** _pending Coach_ · **Date:** 2026-07-24
**Design source:** `docs/F065-CROSS-LINE-PROPAGATION-ANALYSIS.md` (locked design)
**Status:** Jon's decisions LOCKED + **Coach review DONE — APPROVE-WITH-NITS** (see ★ COACH REVIEW below) → build-ready; the build MUST incorporate F1–F5 + the `capturedProjectId` caveat. Pending Jon build-go. NO source edits made — text deliverable. Money-path.

> **Freddy note:** Line refs re-verified against `src/app.jsx` @ v1.24.33 by the Marc lane. The one substantive
> correction to the analysis doc: there are **4 trigger sites, not 3** — vendor edits flow through a separate
> `updateVendor` (`:28595`), not `updateBomRow`. Key architectural finding: the triggers live in the panel-scoped
> `PanelCard`, so the all-panels propagation must delegate to a new `onPropagatePart` callback in the project-scoped
> `ProjectView` (where the proven `doApplyPortalPrices` `saveProject` write already lives). The duplicate index
> persists **for free** inside `saveProjectPanel`'s existing whole-doc write. Open micro-decisions in §12.

---

## ★ DECISIONS LOCKED (Jon, 2026-07-24) — authoritative; override §5/§12 where they differ
1. **Vendor change prompts too, default ON.** Standalone `updateVendor` (`:28595`) IS a trigger (the 4th site — wire it
   in step 10). The prompt pre-includes the other Lines, same as price. (Jon chose max consistency over the
   "only-with-price" recommendation.)
2. **Qty-break: amber note, keep included.** Rows whose `qty` differs from the source show an inline amber warning but
   remain part of "Update all" — informational, not excluded.
3. **Granularity: simple [Update all] / [Skip] — NO per-Line checkboxes.** The modal still RENDERS the other Lines
   (current values, `manual`-protected tags, qty amber notes) as **read-only context**, but the only actions are
   **[Update all]** and **[Skip]**. System rules still apply inside "Update all": `priceSource:"manual"` rows are skipped
   for price (never overwritten), `_isExcludedFromPriceCheck` rows omitted. → §5 drops `selectedRowIds`/checkboxes; §6
   `opts.targetRowIds` = all eligible rows (no per-row selection).
4. **(confirmed) LT from `commitBcItem` not propagated** — its LT is a later async ItemCard fetch; Marc's §12 Q4
   recommendation accepted.
5. **(Coach verify, not a Jon Q) `_computeQuoteHash` must not hash `crossLineDuplicates`** — the build computes the index
   after the hash block; Coach confirms the hash input list.

**Build-affecting deltas vs the body below:** §5 → [Update all]/[Skip] only, no checkboxes (Line list is read-only
context). §4/§10 → `updateVendor` IS wired (default-ON, pre-included). §6 → drop per-row selection, propagate to all
eligible targets. §8 qty amber note unchanged (informational).

---

## ★ COACH REVIEW (Sam Wize, 2026-07-24) — VERDICT: APPROVE-WITH-NITS — build MUST incorporate these
No hard blocker. Architecturally sound, mirrors the proven `doApplyPortalPrices` money-path precedent, data-safe on
every retention/hash/backward-compat axis. **Re-anchor all line refs by SYMBOL, not number — the plan's refs drift ~8
lines low** (e.g. `normPart` is `:51759` not :51751; `partMatch` `:51933`). Required build changes:

- **F1 (MEDIUM, money-path) — don't fan out a `bc` price before its BC push confirms.** In `applyConfirmedPrice`
  (`:28558-28593`) the plan fires the prompt *before* `await bcPatchItemOData` and §6 hardcodes `priceSource:"bc"`. If
  the BC push then FAILS, the source row reverts to `"manual"` (`:28587`) but propagated targets stay `"bc"` →
  poll-eligible while BC holds the OLD price → `pollBcPricing` can silently revert the other Lines (the PRJ402119 shape).
  **Fix:** derive the propagated `priceSource` from the source row's FINAL state (read `latestPanelRef.current` at
  propagation time), OR fire the fan-out only AFTER `bcPushOk` is known.
- **F2 (MEDIUM, money-path display) — render the modal from LIVE state, not cached index scalars.** The index scalars
  (`unitPrice/priceDate/leadTimeDays/priceSource/qty`) go stale between rebuilds (`doApplyPortalPrices`, `pollBcPricing`,
  the F1 revert, send/status writes all skip the rebuild). The *write* stays safe (§6 re-matches live), but the current
  values / `manual`-protected tags / qty-amber a user reads while approving could be wrong. **Fix:** use the index only
  as the GATE (its rowId list); render current values + manual tags + qty notes LIVE from `projectRef.current.panels` by
  rowId at modal-open.
- **F3 (LOW) — reconcile §5/§6 body with the LOCKED decision.** §5 body still describes per-Line checkboxes /
  `[Update selected]` / `selectedRowIds`; the ★DECISIONS #3 override wins → `targetRowIds = all eligible`, no checkbox
  state wired. Fix the body text so a builder doesn't copy the stale version.
- **F4 (LOW) — sent-quote warning is MANDATORY, not optional.** Propagating to a sent quote bumps `quoteRev` + clears
  `quoteLocked` → demotes to In-Process (existing correct behavior, F065 doesn't worsen it). But since a fan-out touches
  Lines the user isn't looking at, the `project.quoteSentAt` modal warning ("this will revise the sent quote") must be
  non-optional.
- **F5 (NIT) — `commitBcItem` vendor may be blank at the fire point.** `bcVendorName` arrives via an async lookup
  (`:28316`) AFTER the `:28391` save where the trigger fires. So a vendor fan-out from `commitBcItem` can carry an empty
  name. **Fix:** skip vendor in the `commitBcItem` trigger (propagate price only there), or fire vendor propagation from
  the async completion.
- **CAVEAT (must-do) — `capturedProjectId` must be captured at EDIT/prompt-open time** and threaded through modal state.
  If re-derived from `projectRef.current` inside `propagatePartAcrossPanels`, the identity guard is a vacuous tautology.
  The human-time gap between edit and [Update all] is exactly why the guard matters.

**Coach confirmed-SAFE (verified live):** quote-hash cannot be perturbed by a new top-level field (`_computeQuoteHash`
`:9662-9715` is a whitelist; index built strictly after) · manual carve-out correctly replicated (price-only skip,
LT/vendor still applied `:40522-40526`) · single `saveProject` matches precedent + preserves all retention guards ·
red-rule is render-time (`_isBomRowFlaggedRed` `:16825`, no persisted flag) · backward-compat no-NPE (all `?.`, lazy
build) · **trigger enumeration holds — NO 5th site missed** (independently swept every `priceSource`/`leadTimeSource`/
`bcVendorName` single-row writer; `updatePrice` contingency branch `:28499` writes only rows the index already excludes)
· vendor default-ON is data-safe (writes only a label + one shared BC Item Card push).

**Bottom line (Coach):** green money-path build once F1+F2 are handled, §5 text reconciled, and `capturedProjectId` is
edit-time-captured.

---

## 0. Architecture seam (read first)
The 3 (→4) trigger handlers all live **inside `PanelCard`** (`:25197`), which is **panel-scoped**: its `onUpdate`
(`:37231`) mutates only *this* panel, `onSaveImmediate` → `saveImmediatePanel(panel.id,…)` (`:36044`). The all-panels
write + `saveProject`/`safeSave`/`projectRef` live in the parent **`ProjectView`** (`:38641`), where the
`doApplyPortalPrices` all-panels precedent (`:40479-40524`) already runs.

**Consequence:** a `PanelCard` trigger cannot write all panels itself — it must call a **new project-scoped callback
prop** (`onPropagatePart`) passed down from `ProjectView`. `PanelCard` already receives `project` (`:37243`) and
`ownerPriorityActive` (`:37208`), so it can *read* the index + gate locally; the *write* delegates upward.

Also verified: **vendor edits do NOT go through `updateBomRow`** — they use `updateVendor(id,vendorName)` (`:28595`),
a **4th trigger site** (§4).

## 1. Index data shape (`crossLineDuplicates`)
Additive top-level project-doc field. Minimal-but-sufficient to render the prompt with no re-scan:

```js
project.crossLineDuplicates = {
  schemaVersion: 1,          // index format version (independent of APP_SCHEMA_VERSION)
  builtAt: 1690000000000,    // Date.now() of last recompute
  parts: {
    "ABB1SVR405611R1000": {                 // key = normPart(partNumber), exact
      displayPart: "1SVR405611R1000",        // first-seen human PN (prompt title)
      rows: [
        { panelId:"panel-1", panelName:"Line 1", panelIdx:0, rowId:12345,
          unitPrice:42.5, priceSource:"bc", priceDate:1689, bcVendorName:"ABB",
          leadTimeDays:14, leadTimeSource:"bc_item", qty:5 },
        { panelId:"panel-2", panelName:"Line 2", panelIdx:1, rowId:67890,
          unitPrice:39.0, priceSource:"manual", priceDate:null, bcVendorName:"",
          leadTimeDays:null, leadTimeSource:undefined, qty:50 }
      ]
    }
    // only parts appearing on >1 DISTINCT panel are stored
  }
};
```
`panelIdx/panelName` → prompt labels; `rowId` → precise "choose" target; price/LT/vendor scalars → shown as current
values; `priceSource` per-row → pre-mark manual rows as protected; `qty` → qty-break warning (§8). Storage: a few KB
even on a 5-Line project.

## 2. Index builder fn
Pure, module-level, next to `normPart` (`:51751`):
```js
function buildCrossLineDuplicates(panels){ /* → {schemaVersion,builtAt,parts} */ }
```
Logic: walk `panels`→`panel.bom`; **exclusion filter** reuse `r.isLaborRow || _isExcludedFromPriceCheck(r)` (`:16792`)
+ junk-PN skip (`""/"?"/"N/A"/"EXTRACTION_FAILED"`, same set as `:28366`); key by `_samePartKey(r.partNumber)` (§3);
keep only keys spanning **≥2 distinct panelIds** (but retain all rows). Return `{schemaVersion:1, builtAt:Date.now(), parts}`.

**Invoked at two hooks:**
- **BOM-save (zero extra write):** inside `saveProjectPanel` (`:10135`), after `panels` finalized (`:10237`), **after the
  quote-hash block** (`:10272-10288`, so it can never feed `_computeQuoteHash` — see §12 Q5) and before `ref.set` (`:10307`):
  `liveProject.crossLineDuplicates = buildCrossLineDuplicates(liveProject.panels);` — persists in the same whole-doc write.
- **Project-open (in-memory, no write):** `ProjectView` mount effect (`:38669`) — compute + stamp into `projectRef`/state
  so the gate is fresh even for pre-F065 projects; persistence follows on the next BOM save. Do NOT put it in
  `migrateProject` (`:11661`) — that runs per-project on dashboard load and would scan every project.

Cost: O(rows), pure in-memory, sub-ms.

## 3. `_samePart` SSOT helper
Module-level, right after `normPart` (`:51751`), before `partMatch` (`:51925`):
```js
// F065 SSOT: EXACT same-part predicate. Deliberately NOT partMatch() — its fuzzy prefix/suffix
// containment over-matches short PNs and must never drive a cross-line price copy.
function _samePartKey(pn){ return normPart(pn); }
function _samePart(a,b){ const ka=_samePartKey(a); return !!ka && ka===_samePartKey(b); }
```
Both consumers call these (builder keys rows; edit-time lookup indexes `parts[_samePartKey(editedPN)]`). Empty-key
guarded so blank PNs never collide.

## 4. Edit-time hooks (4 sites)
Common pattern — each trigger, **after its existing synchronous panel write**, calls a `PanelCard` helper
`_maybePromptCrossLine(rowId, editedPartNumber, patch)`:
1. `if(ownerPriorityActive) return;` (silent skip — the single-Line edit already happened).
2. `const dup = project.crossLineDuplicates?.parts?.[_samePartKey(editedPartNumber)];` absent → return (common, cheap).
3. Filter `dup.rows` to *other* Lines (exclude edited row's panelId+rowId). None → return.
4. Open the prompt (§5); on confirm → call `onPropagatePart` (§6).

| Trigger | fn / line | Insert after | Notes |
|---|---|---|---|
| Cell edit | `updateBomRow` `:28005` | `onUpdate(updated)`+`latestPanelRef.current=updated` (`:28039-28040`) | Only `field==="unitPrice"` or `"leadTimeDays"`. Synchronous — no identity risk. |
| Vendor change | `updateVendor` `:28595` | `onUpdate`+`latestPanelRef` (`:28599-28600`) | **4th site.** `patch={bcVendorName}`. See §12 Q1 (prompt-on-vendor?). |
| BC confirm-push | `applyConfirmedPrice` `:28540` | after local `onSaveImmediate(updated)` (`:28558-28559`), **before** `await bcPatchItemOData` (`:28568`) | Fire off the already-committed local price; no BC await needed. |
| BC cross/commit | `commitBcItem` `:28214` | after synchronous `saveProjectPanel(...)` (`:28391`) | Use the **new** `partNumber` (`updates.partNumber||origPN`) as key (cross changed it). Propagate **price/vendor only, NOT LT** (its LT lands via a later async ItemCard fetch `:28333`). |

`applyBudgetaryPrice` (`:28525`, `priceSource:"manual"`) is intentionally **NOT** a trigger — manual/budgetary is sacred.
**Async-ownership:** prompt opens synchronously (safe); the propagation write (§6) captures `projectId` + re-checks
identity before `saveProject`.

## 5. Prompt component
**Dedicated lightweight modal** (`arcConfirm` `:1931` is boolean-only — can't render the per-Line list or "choose").
Model on the existing small-modal state pattern (e.g. `priceConfirmPending` `:28520`).
State in `PanelCard`: `crossLinePrompt = {editedPartNumber, patch, otherRows, kind}` (`kind∈{price,leadTime,vendor}`).
Body: title `Part# {displayPart} is on {N} other Line(s)` · incoming-value line · per-Line rows table (each →
`Line 2 · current $39.00 (manual) · qty 50` + checkbox, **checked by default except `priceSource:"manual"`** which is
disabled+tagged "manual — protected"; `_isExcludedFromPriceCheck` rows omitted; amber qty note if qty differs §8).
Actions: `[Update all]` · `[Update selected]` (honors checkboxes = per-Line granularity) · `[Skip]`. Modal only collects
`selectedRowIds`+confirm; all writing delegates to `onPropagatePart`.

## 6. Propagation write fn (`propagatePartAcrossPanels`)
In **`ProjectView`** (has `projectRef`/`safeSave`), passed to `PanelCard` as `onPropagatePart`. Mirrors
`doApplyPortalPrices` (`:40479-40524`):
```js
async function propagatePartAcrossPanels(partNumber, patch, opts){
  // patch:{price?,priceDate?,priceSource?,bcVendorName?,leadTimeDays?,leadTimeSource?}
  // opts:{targetRowIds:Set, sourceRowId, capturedProjectId}
}
```
Body: capture `projectId`; `key=_samePartKey(partNumber)`; build `updatedPanels=(panels||[]).map(panel=>({...panel,
bom:bom.map(row=>{…})}))` — skip source row; skip rows not in `targetRowIds`; defensive re-match `_samePartKey`; **skip
PRICE on `priceSource==="manual"`** (Noah's-bug carve-out `:40514` — still allow LT/vendor patch); skip
`_isExcludedFromPriceCheck`. Apply patch: price→`{unitPrice,priceSource||"bc",priceDate??now,bcPoDate (non-manual),
bcVendorName, ..._priceStamp()}` (mirror `:40520`); LT→`{leadTimeDays,leadTimeSource||"supplier",leadTimeUpdatedAt:now,
leadTimeEstimated:false}`; vendor→`{bcVendorName}`. Red-rule re-runs automatically (render-time `_isBomRowFlaggedRed`
`:16825`). Recompute index off new panels. `updatedProject={...projectRef.current,panels:updatedPanels,crossLineDuplicates}`.
**Identity re-check** `if(projectRef.current.id!==capturedProjectId) return;`. `update(updatedProject)` then
`await safeSave(uid,updatedProject)` — **ONE** write (`:40528-40533` pattern). Never loop `saveProjectPanel`.

**F046 stamp (recommend YES):** propagated PRICE rows stamp `priceSetBy`/`priceSetAt` via `_priceStamp()` (`:2212`) as
the current user (deliberate user-confirmed action; matches every other price-write site). LT-only/vendor-only do not stamp.

## 7. Guard integration
- **Owner-priority:** `_maybePromptCrossLine` step 1 silent skip; `ownerPriorityActive` already a `PanelCard` prop (`:37208`).
- **Kill-switches: none gate this, no new one needed.** `AUTO_PRICING_ENABLED`/`AUTO_BC_REPRICE_ENABLED`/
  `SCRAPER_BC_WRITEBACK_ENABLED` (`:5515-5527`) gate *automated silent* price discovery; F065 is user-confirmed (explicit
  modal) = the "manual/portal/import UNAFFECTED" category those comments carve out.
- **Sent-quote/quoteRev (F048):** propagating to a sent BOM bumps `quoteRev`+clears `quoteLocked` (`:10272-10277`) →
  demotes to In-Process. **Flag only** (code comment + optional prompt note if `project.quoteSentAt`), tie to F048 lock later.

## 8. Edge cases
1. **Crossed rows** — `partNumber`=new, `crossedFrom`=old (`:28321-28322`); index groups under replacement PN; `commitBcItem`
   uses the new PN as key.
2. **Manual on one Line, BC on another** — manual row = protected *target* (price skipped, tagged) but valid *source*.
3. **Qty-break** — no stored break basis → per-row amber note when `otherRow.qty!==sourceRow.qty` (leave checkbox on, warned).
   §12 Q2.
4. **Becomes/stops duplicate mid-session** — index refreshes on each `saveProjectPanel`; open-hook covers just-opened state;
   sub-2s debounce staleness window acceptable.
5. **Zero-dup projects** — `parts={}`, one lookup then return. Effectively free.
6. **Large projects** — O(rows) build, O(1) lookup, same all-panels map already shipped in portal-apply.

## 9. Data-safety / backward-compat
Additive, never removed/renamed; `{...}` spreads preserve it. Pre-F065 projects: all reads use `?.` → absent = no prompt,
never throws; open-hook lazily builds in-memory; first save persists. No migration/backfill. Index carries own
`schemaVersion:1` → rebuild-on-mismatch trivial (fully derived).

## 10. Build order (each independently testable)
1. `_samePart`/`_samePartKey` (no behavior change) → 2. `buildCrossLineDuplicates` (pure, node unit-test) →
3. persist hook in `saveProjectPanel` → 4. open-hook in `ProjectView` → 5. `onPropagatePart`/`propagatePartAcrossPanels`
+ prop wiring → 6. prompt modal + `_maybePromptCrossLine` (owner-priority gate) → 7. wire `updateBomRow` (price+LT) →
8. wire `applyConfirmedPrice` → 9. wire `commitBcItem` → 10. wire `updateVendor` (pending §12 Q1) → 11. qty-break + sent-quote notes.

## 11. Verification / test plan
Gates every source-touching step: `node validate_jsx.js` · `node tools/check-scope.js` · `bash tools/check-syntax.sh`.
Functional (Test env, disposable project — confirm throwaway first): **A price** (edit shared PN Line 1 → prompt → Update
all → Line 2 updated, `priceSetBy`=me, red cleared, ONE doc write in network tab) · **B manual carve-out** (Line 2 manual →
protected/disabled, price unchanged, LT patch still applies) · **C lead-time** · **D owner-priority** (no prompt) ·
**E no-dup** (no prompt) · **F skip** (nothing changes) · **backward-compat** (open pre-F065 project → no error, builds
in-memory, save adds field, reload identical). Live-read PRJ402142 first to confirm a real cross-Line divergence exists.

## 12. Open micro-decisions for Jon (needed BEFORE coding the affected step)
1. **Vendor-alone prompt?** Locked design says consistent-for-all-edit-types, but a vendor change with no price change is
   low-value to fan out + vendor legitimately varies per Line. **Marc rec:** prompt on vendor **only when it accompanies a
   price change** (skip standalone `updateVendor`), or include but default its checkboxes **off**. Decides whether step 10 wires it.
2. **Qty-break warning:** soft amber note + leave checkbox on (**rec**) vs auto-uncheck differing-qty rows vs no warning. Money-path.
3. **"Choose per-Line" granularity:** per-row checkboxes (**rec**, confirmed in design) vs simpler all-or-nothing "Update all /
   Skip" (lets us reuse `arcConfirm`, no custom modal).
4. _(Marc-resolved, FYI)_ LT from `commitBcItem` — **not** propagated (its LT is a later async fetch); LT propagation stays on
   `updateBomRow` LT edits + portal. Confirm if you disagree.
5. _(Coach verify, not a Jon Q)_ Confirm `_computeQuoteHash` does not hash `crossLineDuplicates` (plan already computes the
   index after the hash block to be safe).

## Verified anchors
`PanelCard` :25197 · `updateBomRow` :28005 · `commitBcItem` :28214 · `applyBudgetaryPrice` :28525 · `applyConfirmedPrice`
:28540 · `updateVendor` :28595 · `saveProject` :9720 · `saveProjectPanel` :10135 · `saveImmediatePanel` :36044 ·
`migrateProject` :11661 · `ProjectView` :38641 · open-mount effect :38669 · `PanelCard` instantiation :37196 ·
`doApplyPortalPrices` map :40479-40524 · `_isExcludedFromPriceCheck` :16792 · `_isBomRowFlaggedRed` :16825 · `_priceStamp`
:2212 · `arcConfirm` :1931 · `normPart` :51751 · `partMatch` :51925 · kill-switches :5515-5527. New identifiers
`crossLineDuplicates`/`_samePart`/`propagatePartAcrossPanels` confirmed absent.

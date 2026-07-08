# B009 — Runtime repro attempt (Marc, 2026-07-07)

**Env:** matrix-arc-test, instrumented bundle `?v=v1.23.0-b010` (gated `window.__B009=1`). **Prod clean at v1.23.1** (probes uncommitted, test-only).

## ★ FINAL RESULT (2026-07-07, live co-drive with Jon) — B009 NOT REPRODUCIBLE in v1.23.1
Using synthetic-submission injection (write a `rfqUploads` doc with a real differing-base cross so the auto-stamp @39085 fires, then Review→Apply live), we ran **four** faithful scenarios on PRJ402096 with `window.__B009=1`. **In every one the TR flag PERSISTED — no post-apply writer ever clobbered it:**

| # | Scenario | Result |
|---|----------|--------|
| 1 | Single **priced** cross (+ close/re-open) | STAMP → apply-save `TR:true` → APPLY-SAVED → **no later save**. Stayed yellow. |
| 2 | Single **unpriced** cross (baits unpriced-reprice per Coach §3) | Same — flag persisted. Stayed yellow. |
| 3 | **6 crosses in ONE apply** (mirrors Jon's "5–6 rows") | All 6 `TR:true`, apply-saved, **no later save**. All yellow. |
| 4 | **3 SEPARATE submissions applied back-to-back** (the between-applies stale-input race) | 9 saves total; **every save shows all prior applies' rows `TR:true` — `anyFalse:false`**. All 3 yellow. |

**The only `[B009] safeSave` in any run is `doApplyPortalPrices` itself, with `TR:true`.** Zero repricing writers, zero lead-time-flush re-saves, zero stale-input clobbers.

### Why the between-applies race doesn't fire (root reason)
`doApplyPortalPrices` **awaits its `safeSave`** (the B004 fix, [app.jsx:38406](../src/app.jsx)) and `update()` syncs `projectRef.current` synchronously. So apply #2/#3 always read **fresh, post-#1-stamp** state — there is no pre-stamp snapshot to race against. The stale-input/ref-lag mechanism Coach hypothesized (§7A) is architecturally plausible but **does not manifest on this path** because the save is awaited.

### Conclusion + recommendation
Per "prove a bug is ACTIVE with a runtime artifact before fixing it," **B009 cannot be confirmed active in current code** and there is **no clobbering writer to target**. Jon (who saw it on prod v1.22.3) also can't reproduce it now. Recommend:
- **(A) PARK B009** as not-currently-reproducible (env/timing-specific, or resolved incidentally). Leave the instrumentation on test to opportunistically capture a recurrence.
- **(B, optional) Defensive belt only** — save-time preserve of the 5 TR fields (mirror the cross-user `saveProject` guards). Pure prevention (no active bug), aligns with the data-retention rule; guards any future stale writer.

**Do NOT ship the "input-freshness on the specific writer" fix — there is no such writer in current code.**

**Cleanup loose end (G005):** synthetic "B009 REPRO" test data on PRJ402096 — imported submissions (B009 REPRO / REPRO 2 / MULTI / SEQ A-C) + crossed rows (3516000, 1032264 CS, 6× B009MULTI, 3× B009SEQ). Cleanable.

---

## (Earlier) away-mode attempt — superseded by the FINAL RESULT above
**Result: RUNTIME REPRO NOT ACHIEVED — trigger path not reachable in away mode. NOT a confirmation; the exact clobbering writer is still un-pinned.**

## Why the repro couldn't run
1. **Manual "Upload Supplier Quote" path ≠ B009 path.** The supplier-cross auto-stamp (`techReviewFlag:true,techReviewFlagSource:"supplier"`) exists at **exactly one site — [app.jsx:39085](../src/app.jsx)** — inside the RFQ-**portal** `quoteReview` → "Apply N Items to BOM" flow (`setQuoteReview`@38175 ← `applyPortalPrices`; apply → `doApplyPortalPrices`@38178). The manual drop path (`SupplierQuoteImportModal` / `saveAndMatch` 31xxx, and its BOM push `onBomUpdate`@39274) never calls that stamp. `grep techReviewFlag` = 29067 (manual toggle), 39085 (portal stamp), 15886 (reader) — none in the manual path. **Confirmed live:** dropped quotes this session produced NO `[B009] STAMP` (`window.__B009stamped` stayed null).
2. **No portal submission available.** Jon has no pending/submitted RFQ portal quotes to apply, so the real path can't be opened.
3. **Can't synthesize one in away mode.** Creating a portal submission needs a supplier PDF uploaded *through the portal* (Claude-in-Chrome can't upload files — needs Jon's drop). The manual TR toggle (29067) could seed a flag for a controlled writer-test, but it's a React-controlled checkbox that reverts synthetic clicks (needs Jon's real click).

⇒ **A real B009 repro requires Jon:** open/create an RFQ-portal submission with a substitution (cross), then Review Supplier Quote → Apply, with `window.__B009=1`.

## Deepened static analysis (adds to Coach §7B — read-only)
All obvious post-apply auto-writers **preserve** the flag with fresh input, which *strengthens* the STALE-INPUT / ref-lag hypothesis (the clobber is a writer fed a pre-stamp snapshot, not a structurally-broken writer):
- **No auto-reprice fires on the supplier-apply path** via unitPrice triggers: every `runPricingOnPanel` call site is extraction / recon (24811, wrong trigger) / manual buttons (28646/28652). `hasUnpriced`(16047) only feeds kanban status (16062-63), not a reprice.
- **Lead-time BC flush** (`_flushLeadTimeBcQueue`@26468, debounced `setTimeout`): only re-saves when vendors resolve, and reads `latestPanelRef.current` (fresh) + spreads `...r`(26504) → **preserves**.
- **SQ `onBomUpdate`**@39274: fresh `projectRef` + `...row` → **preserves**.
- **`doApplyPortalPrices`**: `...row` all branches + awaited `safeSave` → **preserves** (Coach §2, re-confirmed).

⇒ Since no mapped writer drops the flag with *fresh* input, the culprit is almost certainly a writer invoked with a **stale/pre-stamp `bomOverride` / lagging `panelRef`** in the seconds after apply (Coach §7A). Which one, and its stale source, needs the live `[B009] safeSave … TR:false + CALLER stack` artifact to name — **do NOT finalize fix targeting until that runtime artifact exists.**

## debugLogs
Not queryable here: `collectionGroup('debugLogs')` → `permission-denied` (rules scope reads to `companies/{cid}/debugLogs` with membership; `cid` isn't exposed to the console). Low value regardless — **B009 is a silent metadata overwrite (throws nothing), so it would not be captured** to debug logs.

## Instrumentation (ready for Jon's return)
`src/app.jsx` (test-only, uncommitted), gated `window.__B009=1`:
- `safeSave` master log — every save touching a crossed/TR/stamped row → `{id,pn,crossed,from,TR,src,price}` + caller stack. Tracks stamped ids via `window.__B009stamped` so a full cross-revert is still logged by id.
- `STAMP` anchor (T0) @39085 + APPLY-SAVED marker after `doApplyPortalPrices`.
When Jon opens the real portal-apply path with `window.__B009=1`, the first `safeSave` showing `TR:false` on a stamped id + its CALLER stack = the writer.

## Recommendation
- **Coach** can pre-draft the fix on the stale-input/ref-lag basis (input-freshness on the post-apply writer + the save-time TR-preserve belt) — but keep the *exact writer* slot blank until the runtime artifact names it.
- **On Jon's return:** 5-min live repro via a real portal submission with a cross → captures the writer → Coach finalizes → Jon approves → build.
- **Separate:** the NEW manual-upload undefined-field bug (docs/B009-MARC-REPRO-NOTES.md) still needs a B### + fix decision.

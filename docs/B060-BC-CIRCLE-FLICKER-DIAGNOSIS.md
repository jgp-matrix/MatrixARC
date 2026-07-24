# B060 — BC circle flickers (disappear→reappear) on "Confirm & Push to BC"

**Diagnosed-by:** Marc Masdev (read-only lane) · **Date:** 2026-07-24 · **Severity:** LOW (cosmetic; end state already correct)
**Status:** ROOT-CAUSED. Fix available but it changes `priceSource` semantics on the money path → **Jon decision + Coach review required** (not a trivial patch). Reported on prod v1.24.34 (post-B058).

## Symptom (Jon, live)
Changing a price on a BC-circle item makes the BC circle disappear, then come back.

## Root cause — `applyConfirmedPrice` optimistic-then-revert (NOT a plain price edit)
The flicker is specific to the **"✓ Confirm & Push to BC"** action in the price-confirm popup (a plain in-cell edit → `updatePrice` → popup; the **Budgetary** branch = `applyBudgetaryPrice` sets `priceSource:"manual"` and does NOT flicker — B058 working correctly).

Sequence in `applyConfirmedPrice` (`src/app.jsx:28540`):
1. **`:28553`** — optimistic write stamps `priceSource:"bc"` **and** `bcVerify:{status:"in-bc"}`.
2. **`:28558`** `onUpdate` renders → `_bcCircle` (`:30809`) early-returns `null` on the membership gate (`bcNo||bcVerify=="in-bc"||priceSource=="bc"`) → **circle disappears.**
3. **`:28568`** `await bcPatchItemOData(_bcNo(row), …)`. For a circled row there is **no `bcNo`** (durable `bcNo` is exactly what suppresses the circle), and `_bcNo(row)` (`:4647`) falls back to `partNumber.slice(0,20)` → the PATCH targets an item that isn't in BC → **push fails** → `bcPushOk=false`.
4. **`:28585-28591`** failure branch reverts to `priceSource:"manual"`, `bcVerify:"manual"` → `_bcCircle` falls through to blue (`:30812`) → **circle reappears.**

The ~1-2s BC round-trip between steps 2 and 4 is why it's a visible flicker rather than an imperceptible frame.

**B058 interaction (confirmed):** B058 did not create the transient — it changed the revert's END STATE. Pre-B058 the blue gate was `priceSource!=="manual"`, so after reverting to `"manual"` the circle stayed gone permanently (no visible flicker). Post-B058 the circle is membership-driven, so the reverted `"manual"` row correctly shows a circle again — surfacing the pre-existing optimistic-then-revert as a disappear→reappear. The intermediate `bcVerify:"in-bc"`/`priceSource:"bc"` is genuinely **wrong data** (the item is not in BC and the push is about to fail) — not a benign render artifact.

## Proposed fix — promote-on-success (remove the wrong optimistic state)
Show the typed price immediately as `priceSource:"manual"` (do NOT claim BC membership up front); only promote to `"bc"`/`"in-bc"` **after** a confirmed push. On failure the row simply stays `"manual"` — no second re-render, no flicker. Exact `old_string`/`new_string` captured by the diagnosis lane (the `applyConfirmedPrice` body `:28551-28593`); ready to hand to a build lane if approved.

## ⚠ Money-path caveat (why this is a Jon decision, not a silent fix)
`priceSource` gates **RFQ eligibility and value styling** (grey-italic manual vs white bc; see `:28549`). Under the fix, during the ~1-2s push window the row reads `priceSource:"manual"` (RFQ-eligible, manual styling) and only flips to `bc` once BC confirms. Also, the current code stamps `priceSource:"bc"` even when no push is attempted (no `_bcToken`/`partNumber`) — the fix would leave that `"manual"` unless given an explicit carve-out. Per CLAUDE.md this is a pricing-path change → Coach review, not a direct commit.

## Recommendation
LOW severity, end state already correct. Two defensible paths:
- **Leave as-is** — accept the brief flicker; zero money-path risk. (Cheapest.)
- **Fix via promote-on-success** — removes the wrong-data transient cleanly, but routes through Coach review + a Jon test-push (the money-path `priceSource`-window behavior change). Do NOT CSS-soften — that just blurs a factually-wrong intermediate state.

A CSS-transition "soften" is explicitly NOT recommended (hides wrong data).

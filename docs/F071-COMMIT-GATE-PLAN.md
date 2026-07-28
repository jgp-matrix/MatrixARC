# F071 — BC commit-gate (block money-path commits when BC not usable) — Coach scope

**Coach read-only design · 2026-07-27 · master @ prod v1.24.40 · `src/app.jsx`.** Jon posture LOCKED: block-commits-allow-queued-editing. F071 is the **enforcement** consumer of B064's fault signal (does not detect — reacts). Clones the **owner-priority-lock** pattern (`_OWNER_PRIORITY_TOOLTIP :17186`, `_fireOwnerPriorityAlert :17187`, owner-gate JSX `:30332`) which already gates ~13 destructive actions in exactly this shape.

> ⚠ Existing `bcDisconnected` prop (`PanelCard :25496`, computed `:37977`) means **env-mismatch (F069), NOT connection-down** — today only greys a tile / hides BC-attach. Do NOT overload it; F071 adds a *distinct* usable-gate beside it.

## Gated-action tiers (enumeration is a FLOOR — re-grep all `bcPatch*`/`bcSync*`/`bcCreate*`/`bcAttach*`/`po*`/`send*` at build)
**TIER A — HARD-BLOCK, never queue** (outward/customer-facing / stale-data-dangerous):
- Send Quote email (`QuoteSendModal.handleSend :35627`, `sendBlocked :35626`) + its quote-note patch (`:2620`)
- PO submit (`handleSubmit :21545` → `bcPatchJobOData :21555`/`bcPatchPanelEndDate :21565`/`_attachPoToBc :21573`) — already enqueues on no-token `:21556`; F071 upgrades to the full predicate + visible block
- Push to BC Item Card + Purchase Price (confirm btn `:32820`)
- MFR "Push to BC" bulk writeback (`:50120`/`:50129`)

**TIER B — BLOCK-BUT-OFFER-ENQUEUE** (safe replay via offline-queue):
- Planning-line sync auto+manual (`syncPlanningLinesToBC :27319`, auto-effect `:27290`, retry btns `:30303/30309`, `bcSyncPanelPlanningLines :4019`)
- LineQty resync (`saveLineQty :27424`); sell-price/labor/markup patches (`:27299`, `:36831`, `:36852`)
- Header field patches → `bcEnqueue('patchJob')` (`bcPatchJobOData :37423/37472/37513/37536/37632`)
- Purchase Quote create from RFQ (`bcCreatePurchaseQuote :7048` — already enqueues on no-token)
- Push all lead times (`:30950`); Supplier-portal Apply (`doApplyPortalPrices :41275` — **BC leg gates, Firestore price save must still commit**)
- **`bcCreateProject :4554`** → Coach lean **block-not-queue** (queued create risks duplicate jobs) — Jon Q1/Q4.

**TIER C — NEVER GATE:** all BOM/field edits (Firestore, not BC), all `bcGatedFetch` READS (B064 surfaces read failures, F071 doesn't block them), `bcEnqueue` itself (the escape valve).

## Trigger predicate + debounce (the anti-lockout core)
One module-scoped SSOT predicate `_bcCommitBlocked()` → `{blocked,reason}|falsy`:
- **(a) disconnected:** `_bcHealthState==='red' || !_bcToken`
- **(b) endpoint broken:** B064's `_bcEndpointBroken()` (structural 404, ≥2 faults)
- **(c) unverified:** `!_bcVerifiedOnce` (first `r.ok` in `bcGatedFetch :535` sets it — guards the cold-boot green-by-default window)

**Debounce = the #1 design choice: gate on RED only, never AMBER.** The health state machine already stamps amber for silent-refresh-in-flight / transient 429/5xx (`bcGatedFetch :510`) and red ONLY after silent refresh has failed (`:530`) — so a self-healing blip resolves entirely in amber and never reaches the gate. PLUS a **GRACE_MS settle window** on RED (record `_bcRedSinceAt` on green→red; predicate reports disconnected only after red persists ≥ GRACE_MS). **Coach rec GRACE_MS=8000 (8s)** — Jon Q2. PLUS structural needs B064's N≥2 (a lone probe-404 never gates). Self-clearing: first `r.ok` → green → predicate releases → buttons re-enable within one React tick via the existing `_bcHealthSubs` subscriber `:51517`.

## "Block" UX (visible, never silent — reuse owner-priority idiom `:30332`)
`disabled` + greyed + onClick→explainer + `data-tip`. Copy switches on reason:
- `disconnected` → "BC is offline. Your edits are saved and will sync when BC reconnects." (Tier B) / "…can't send until BC reconnects — click the BC pill." (Tier A; pill is click-to-reconnect `:51882`)
- `endpoint` → "A BC service this action needs is unavailable (endpoint '<seg>'). Notify your admin — reconnecting won't fix it."
- `unverified` → "BC hasn't been verified yet this session. Give it a moment, then retry."
- Tier B variant: allow click → `bcEnqueue` + toast "BC offline — queued, will sync on reconnect" (⏳ badge `:51888`). **Never a silent no-op** (replaces the fire-and-forget `.catch(console.warn)` at `:27314/36836/36854`).

## SSOT enforcement (factor the rule, not the inputs)
1. One predicate `_bcCommitBlocked()` (module scope — callable by non-JSX commit fns). 2. One React mirror `bcCommitBlocked` in the top component (subscribes `_bcHealthSubs :51517` + B064 `_bcEndpointFaultSubs` + `_bcRedSinceAt` timer), threaded as `bcCommitGate` prop **alongside `ownerPriorityActive`** through PanelCard/QuoteSendModal/PO modal/settings. 3. Every Tier-A/B site checks it (module fn bails/enqueues; JSX button reads the prop). 4. One `_fireBcCommitBlockedAlert(reason)` mirroring `_fireOwnerPriorityAlert`.

## Coexistence
- **Offline queue:** Tier B ROUTES THROUGH it (don't abandon); `bcProcessQueue :7222` flushes on reconnect. F071 must not ADD silent drops (Tier A never enqueues → a customer email can't be silently lost).
- **Owner-priority lock:** compose — `disabled = ownerPriorityActive || bcCommitGate`; owner-priority alert takes precedence.
- **F069 env-mismatch:** a 4th "don't commit" condition (`_bcEnvMismatched :370`, already guards most auto-sync effects) — Tier-A blocked if `_bcEnvMismatched(project) || _bcCommitBlocked()`, env-mismatch its own message ("project belongs to env X, you're on Y"). Keep predicates separate.
- **RFQ-only mode:** orthogonal; the #168 unpriced-gate (`:27337`) already short-circuits planning sync often — don't double-alert. **`IS_TEST_ENV`:** Tier-A blocks still apply on test (correct); Tier-B enqueue no-ops as today.

## False-lockout mitigations (ranked)
1. Gate RED not AMBER (self-healing blips invisible by construction). 2. 8s grace on RED. 3. Structural needs N≥2. 4. Reads never gated (app stays usable — only ~6 commits pause). 5. Self-clearing on first ok. 6. Red pill = one-click reconnect + queue flush.

## Gates · repro · dependency
Gates: validate_jsx + Coach cross-check on Tier A/B/C completeness + Test repro + per-phase HOLD. **Hard dep on B064** exposing `_bcEndpointBroken()` — build the disconnected+unverified branches now, wire the structural branch when B064 lands. Repro: `window._arcForceBc401=N` (`:495`) → RED → Tier-A shows visible block, Tier-B enqueues+⏳, reads still work; clear+pill-click → flush + re-enable. Structural: `window._arcForceBc404`×2 → endpoint message.

## ✅ DECISIONS LOCKED (Jon 2026-07-27)
1. **HARD-BLOCK set (never queue):** **Send Quote to customer · PO submit · New BC project create · Item Card + Purchase Price push.** Everything else (planning-line sync, sell-price/labor/markup patches, header field patches, lead-time push) = **block-but-ENQUEUE** (saved locally, auto-syncs on reconnect).
2. **GRACE_MS = 8s** on sustained-RED before commits block (transients resolve in amber and never reach the gate).
3. **Supplier-portal Apply:** the **local Firestore price save ALWAYS commits**; only the BC-writeback leg is gated/queued. Never lose supplier prices to a BC hiccup.
4. **RFQ (Jon):** *"RFQs can go out, but they cannot be Accepted until BC is connected. Otherwise it will not populate pricing."* → **RFQ SEND is allowed when BC is down** (it needs no BC). But the **ACCEPT of a returned supplier quote is gated on BC** — the point of accept is to populate pricing, which needs BC.
   - **★ RECONCILE-AT-BUILD (with #3):** the coherent reading is — on Accept/Apply, the supplier prices **save to ARC/Firestore locally (per #3)**, but the **BC-writeback + any "finalize/accept" step that populates pricing into BC is gated** until BC connects. Confirm at F071 build whether Accept blocks the WHOLE apply or only the BC leg (Coach lean: prices save locally, BC leg queues, and the accept is marked "pending BC" rather than fully blocked). One Jon confirm needed at build time.

**F071 build gated on:** (a) B064 shipping (exposes `_bcEndpointBroken()` — the structural branch) + (b) the one RFQ/Accept reconcile above.

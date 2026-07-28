# B016/B012 — Firestore write-stream exhaustion amplifier — Coach scope

**Coach read-only · 2026-07-27 · master @ prod v1.24.38.** Design only. Advances existing B016/B012.

## Mechanism
Firestore = plain `firebase.firestore()`, **no offline/IndexedDB persistence** (`public/index.html:291`). All `set`/`update`/`add`/txn across all collections share **one gRPC WriteStream**. Enqueue faster than acks (esp. large whole-doc writes) → backend `RESOURCE_EXHAUSTED` → SDK exponential backoff ("maximum backoff delay") → stream pauses → pending writes + the project `onSnapshot` stall → session freezes / edits appear to revert = the "disconnecting." No global Firestore write coordination (`_bcSemaphore` caps BC HTTP only; `_panelSaveLocks` :10147 serializes only `saveProjectPanel`).

## Amplification trace (anchors)
- **A. Every mutation writes the WHOLE project doc** (all panels+BOM, tens–hundreds KB): `saveProject` :9727→`ref.set` :10034 (NOT mutexed); `saveProjectPanel` :10142 (mutexed) →`ref.set` :10318.
- **B. Uncoordinated racing writers:** project `onSaveImmediate`/`safeSave` :42437, bulk on-open :42074, `_logQvHistory` arrayUnion :10100 (fire-and-forget), ECO `.update` :18217, lease keep-alive txn every 30s :596, bg-task markers :694/728/741.
- **C. BC-failure multiplier:** `syncPlanningLinesToBC` writes `bomSyncPending` true→false around each sync (:27089/27150/27157); **OPEN BC SYNC** does 2 whole-doc `saveProjectPanel` per panel (:40239-40289) — and on a 404 the hash never saves so **it re-fires every open, forever**. Sell-price/planning auto-sync (:27048/27036) add marker/hash saves.
- **C′ (self-amplifier — key finding):** the global `console.error` hook (`index.html:354`) → `logDebugEntry` → `fbDb.collection(debugLogs).add()` (:334) = **one Firestore write per distinct console.error.** A BC error storm has varying messages (PNs/lines/status) → distinct 60s-dedup keys → a **burst of debugLogs writes onto the very stream that's failing.** (`_debugSelfError` only brakes 30s AFTER a debug write itself fails; explicit `logDebugEntry` bypasses dedup.)
- **D. Retries:** `safeSave` 2×/2s (:10047), `bcProcessQueue` 5× — add writes under exhaustion.

**Kill-switch note:** `AUTO_BC_REPRICE_ENABLED`/`AUTO_PRICING_ENABLED`=false → the old 132-item price churn is OFF. Today's fuel = **marker churn + per-edit whole-doc saves + per-error debugLogs writes**, uncoordinated. 46 events over 46 distinct minutes = "saturates whenever Ryan works while BC fails," not one burst.

## Ranked fixes (blast radius)
- **D (cheap, isolated, HIGH value):** throttle/batch debug-capture writes (buffer `logDebugEntry`, flush ≤N/interval; cap outstanding; widen `_debugSelfError`). Removes the self-amplifier. LOW risk (index.html debug layer only; not save/money path).
- **C (quick, narrow):** gate OPEN BC SYNC (:40239) so a persistently-failing / `_bcEnvMismatched` endpoint doesn't re-attempt + re-write markers every open; collapse the 2 marker writes. LOW-MED. Ties to B064/F069.
- **B (primary, durable):** route ALL project-doc writes through one coalescing governor — extend `_panelSaveLocks` mutex to cover `saveProject`/`_logQvHistory`/ECO/marker writes + a ~300–800ms debounce collapsing rapid whole-doc saves, keyed by projectId. MED-HIGH risk: MUST keep the `ref.get()` server-read merge + all preserve guards (:9784-10027) on the final coalesced write or a collapsed stale write clobbers.
- **A (B016 core reliability):** await/confirm per mutation; kill fire-and-forget `.catch()`/empty catches (~51 sites) so a bg sync can't silently revert an in-flight edit + surface outcomes. MED-HIGH; layer AFTER B.
- **E (alt to B):** generic Firestore write semaphore — only if B's coalescing proves insufficient.

## Recommended order
1. **B064 BC-admin fix removes THIS trigger** (planning 404) — but ship amplifier hardening regardless (company-wide: jon@/Noah too). 2. **D** (debug-write throttle). 3. **C** (on-open churn gate). 4. **B** (coalescing governor). 5. **A** (await/confirm).

## Gates & data-safety invariants (must survive coalescing)
B & A → PR + Coach money-path review + Jon sign-off + test-channel verify (touch saveProject/saveProjectPanel). C, D lower-risk but Coach-reviewed. Preserve: `ref.get()` server-read merge + all guards; nBom/high-water belt (:9753-9772); **Async-Project-Ownership** (deferred/coalesced write keyed by `_bgKey(projectId:panelId)` at enqueue, never the currently-open project); additive-only (never drop `bomSyncPending`/metadata); no lost-delete window (A).

## Repro (Jon-driven — browser tool can't reach test host)
Throwaway BC-linked test project; instrument a window counter of outstanding writes + writes/sec FIRST. Force failure burst (`window._arcForceBc401=60` :495, or a `_arcForceBc404` sibling) → open project / trigger planning sync (:40239, :27068). Observe: error storm → debugLogs.add storm + marker saves → `resource-exhausted`/max-backoff; edits during window revert/stall. After fix: governed/coalesced writes stay under limit; no exhaustion; edits persist (A surfaces failures).

## Open questions for Jon
1. **Offline persistence is OFF** — enabling IndexedDB persistence changes write-queue behavior (could help or shift overflow to local queue). Decide before touching write path.
2. Acceptable added save latency from a ~300–800ms coalescing window?
3. Should a persistently-failing BC endpoint (B064) hard-disable on-open + auto-sync until reconnect?
4. Confirm shipping amplifier hardening (D/C/B/A) independent of the B064 BC-admin fix (it's company-wide).

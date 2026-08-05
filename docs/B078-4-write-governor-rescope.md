# B078 RE-SCOPE — Firestore write-stream exhaustion, DEEPER ROOT FIX (B078-4)

> Coach (Sam Wize), read-only, 2026-08-05 · prod v1.24.90. Money-path/data-safety → Coach review + Test-channel verify + Jon deploy gate before anything lands. No code changed.

**Why we're back:** B078-1/2/3 shipped (loud-fail+retry on extraction save; a background-autosave COALESCER v1.24.71; loud-fail+retry on the pricing phase). Live on PRJ402505 (2026-08-04) the extraction+pricing burst STILL produced a cluster of `resource-exhausted` and killed the pricing phase (bcVerify unstamped on all 26 rows). **B078-2's coalescer fixed only the background-effect multiplier; it never touched the actual saturation drivers.**

## §1 — Write inventory during a large extract+price burst
`resource-exhausted: Write stream exhausted maximum allowed queued writes` is a **connection-global** limit — it counts ALL un-acked mutations on the single client WriteStream, across every doc. Storage uploads starve the same uplink of the acks that would drain the queue.

Immediate WHOLE-DOC (~1MB) writes, NOT coalesced — the residual:
1. Pre-extraction pages save (`confirmAndExtract`); 2. early storageUrl save (`runExtractionTask` :16588); 3. final extraction save (:17311); 4. error-path fallback (:17333); 5. pricing completion save (runPricingOnPanel :32066/:32079; runPricingBackground :17551).
Coalesced (covered by B078-2): 6. the **10** PanelCard `_noBumpWrite` autosync effects (:27384/27410/27432/27768/27809/27835/27858/27942/28004/28021) — original scope said 7; real count 10, all routed.
Uncoalesced small chatter: 7. `activeExtractions` progress mirror (~45–60/extraction, own 2s throttle); 8. lease heartbeat (30s); 9. presence heartbeat (30s); 10. qvHistory arrayUnion; 11. bcLeadTimeWrites audit; 12. snapshots.
Storage (separate transport, bandwidth thief): PDF + page-image uploads via `parallelMap(...,4)` (:16571 early, :17286 re-stamp, :19779 addFiles).

Worst case (18-page add + re-price on multi-panel): **4–5 back-to-back ~1MB whole-doc writes** (serialized by `_panelSaveLocks` :11004) + 1 PDF + up to 18+18 image uploads @ concurrency 4 + chatter, all on one unbounded WriteStream over ~90–120s.

## §2 — Coalescer coverage vs LEAK
B078-2 (`_bgSaveMap` :11297-11397): per-`projectId:panelId` debouncer, flush 1s, in-flight cap 2, stale-clobber guard. **It only governs writes routed INTO it (the 10 bg effects).** It does NOT see/count/throttle direct `saveProjectPanel`/`saveProject`/`.set`/`.update` or Storage. It debounces+dedups; it does NOT backpressure.
**LEAK SET (residual saturation, all bypass the coalescer):** (1) the five immediate ~1MB whole-doc writes [PRIMARY — write 5 is what killed PRJ402505's pricing]; (2) activeExtractions chatter; (3) lease/presence beats; (4) qvHistory/audit/snapshot; (5) Storage uploads.

## §3 — Core architectural cost (quantified)
**Every content change rewrites the ENTIRE ~1MB project doc.** Panels are an inline ARRAY field; `saveProjectPanel` (:11055) does `ref.get()` → `panels.map(...)` → `ref.set(wholeDoc)` (:11243); `saveProject` identical. Firestore can't patch one array element → any panel change rewrites all panels. ZERO per-panel/per-field content granularity (subcollections exist only for peripheral data). **Storage vs Firestore contention CONFIRMED** — the planned "lower upload concurrency while a critical save pends" half of B078-3 **never shipped** (B078-3 became the pricing loud-fail). 19–37 image put()s @ concurrency 4 saturate the uplink → Firestore acks lag → queue fills → `resource-exhausted`; the immediate ~1MB save is the mutation that trips it.

## §4 — Ranked fix options (TRUE FIX = deterministically prevents; MITIGATION = lowers probability)
- **A — Global Firestore write GOVERNOR (bounded-concurrency serialized queue) · M · Med risk · TRUE FIX (client-side trip).** One module-level async queue ALL Firestore writes pass through, hard cap on in-flight mutations (1–2), FIFO. Bounds the TOTAL (unlike the coalescer's background-only cap) → the SDK's queue can't overflow regardless of ack lag; writes wait in our fast in-memory queue. Wrap ~6 write entry points; fold the coalescer's cap into this shared governor; keep `_panelSaveLocks` for ordering. **Highest-leverage.**
- **B — Per-panel subcollection (shrink payload) · L · High risk · TRUE FIX (cost root).** Move panels array → `…/projects/{id}/panels/{panelId}`; a panel change writes ~1/N. Requires schema migration + `APP_SCHEMA_VERSION` bump + lazy back-compat + rewrite every merge guard + all cross-panel reads. **Data Retention CRITICAL, highest blast radius. Not a first move.**
- **C — Decouple Storage uploads from the Firestore write window · S–M · Low risk · TRUE FIX (bandwidth root).** Drop upload concurrency to 2 (or 1) while a critical save pends; sequence the consolidated save vs the re-stamp upload pass (:17286) so they never overlap; optionally gate uploads through A. This is the un-shipped half of the original B078-3. Localized to the upload sites + a "critical-save-pending" flag.
- **D — Widen coalescer to cover chatter · S · Low risk · MITIGATION only.** Trims small-write noise; leaves the 5 large immediates + upload contention untouched. Insufficient alone.
- **E — Backpressure near the limit · = A.** A governor IS proactive backpressure; implement as one (E ⊆ A).

**GUARANTEE:** **A + C together.** A caps what the client hands the SDK (queue can't overflow); C removes the bandwidth spike that caused the ack lag. B removes the underlying 1MB-per-write COST but isn't required to stop the error and is far riskier. D alone insufficient.

## §5 — Decisions for Jon (with recommendations)
1. **Primary approach → A + C now (as B078-4), defer B.** A closes the §2 leak; C is the un-shipped B078-3 half + removes the trigger. Together deterministically stop the client-side trip at M+S, no schema change.
2. **Subcollection (B) on the table? → NOT now.** Only thing that removes the 1MB cost + future-proofs, but highest-risk under Data Retention. Log as a separate epic (B078-5); do only if A+C prove insufficient at scale.
3. **Governor latency cap → in-flight 2, with a priority lane** so a background beat never delays a user content save. Writes already serialize per-project via `_panelSaveLocks` → near-unchanged perceived latency.
4. **Upload concurrency floor (C) → dynamic: 2 during a pending critical save, 4 otherwise** (preserves speed outside the danger window).
5. **Governor scope → Firestore-only;** handle Storage via C's dynamic concurrency (different transports; one shared cap over-throttles).

## Verify (Test channel, whichever combo)
Reproduce PRJ402505: 18-page add to a fresh panel on a multi-panel project → immediately Get New Pricing on a 26-row BOM. Assert: ZERO `resource-exhausted` (console + debugLogs); reload → BOM + extractionReport + all 26 bcVerify stamps persisted (not blue/unpriced). Regressions: single-page add, re-extract, staging commit, mid-burst offline blip (must surface B078-1/3 banner+retry, never vanish), two-project concurrent extraction (governor must not deadlock).

## Net-new vs original scope
(1) coalescer count is **10** `_noBumpWrite` sites (not 7) — all covered; (2) the upload-decoupling half of B078-3 **never shipped** (= Option C, a big part of the residual); (3) true residual = **~5 immediate ~1MB whole-doc writes contending with concurrency-4 Storage uploads on one unbounded WriteStream** — the coalescer can't touch it (governs background only); (4) recommended = **A + C**, defer B.

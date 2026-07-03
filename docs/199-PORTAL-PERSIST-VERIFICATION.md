# #199 — Supplier-portal apply persistence: deploy-gate code verification

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** CODE-read (read-only), DEPLOY-GATING
**Question (Freddy/Marc live pass):** after a supplier-portal Apply (crosses a row + auto-stamps #199 `techReviewFlag`) then an *immediate* reload, the entire panel write reverted (prices + cross + TR), while only the submission-status write survived. Real persistence gap, or premature-reload artifact?

## Verdict: **REFUTE the persistence gap — CONFIRM Marc's premature-reload theory. BENIGN. #199 is CLEAR TO DEPLOY.**

The cross + TR fields **are** included in the write and **are** preserved by `saveProject`. The revert is a reload-timing artifact of an unawaited async save — not a code gap, and not #199-specific.

---

## Trace (file:line)

**Q1 — does the apply path persist the panel after crossing + stamping?** YES.
- Apply handler (the "Apply" button, `src/app.jsx:~38921`): on crosses it builds `updatedPanels` with `isCrossed` + the 5 TR fields and calls `update({...projectRef.current,panels:updatedPanels})` — **no direct save here** — then `await doApplyPortalPrices(remapped)` (`~38993`).
- `doApplyPortalPrices` (`9…` → def `38076`) ends at **`src/app.jsx:38291-38293`**: `const updatedProject={...projectRef.current,panels:updatedPanels}; update(updatedProject); safeSave(uid,updatedProject).catch(…)`. **`safeSave` is the persist.** (The v1.19.722 comment right above it documents exactly this: "Previously doApplyPortalPrices only updated React state via update() — changes vanished on navigation. Now safeSave fires immediately so the BOM survives a refresh.")

**Q2 — are the TR fields included in that write (or stripped)?** INCLUDED.
- `update(p)` (**`src/app.jsx:37583-37587`**) sets `projectRef.current = p` **synchronously** (not merely `setProject`). So the handler's earlier `update(...cross+TR...)` makes `projectRef.current` carry the cross + TR *before* `doApplyPortalPrices` runs — it reads fresh state.
- `doApplyPortalPrices`'s `updatedPanels` map (`~38246+`) spreads `...row` (or returns `row`) on **every** branch, including the crossed-row path (`hit.isCrossed` is true → falls through to `{...row,...ltPatch,…}` / `row`). So the cross + TR fields ride through into `updatedProject`.
- `safeSave` → `saveProject` strips **only** `dataUrl` and preserves all other row metadata; the 5 TR fields are named in the Data-Retention §4 preserved list (commit `8dc2e89a`). **Not stripped.**

**Q3 — is there a debounce/async window that loses an immediate reload?** YES — and that is the whole explanation.
- `safeSave` (**`src/app.jsx:9124`**) is an **immediate** async write (`await saveProject`, up to 2 retries 2s apart on *failure* only) — **not debounced**.
- BUT at `38293` it is called **fire-and-forget** — `safeSave(uid,updatedProject).catch(…)` with **no `await`** — and `doApplyPortalPrices` returns before the Firestore commit lands. The Apply handler's `await doApplyPortalPrices(...)` therefore also returns before the panel write commits.
- The entire panel state (cross + TR + prices) is in that **single** `updatedProject` write. The submission-status update is a **separate** write (awaited elsewhere) → it survives. So an immediate reload that beats the in-flight `saveProject` loses cross+TR+prices **together** while status persists — **precisely the observed symptom.**

## Why it's benign (not a #199 gap)
- With a normal pause (let the write commit), everything persists — confirmed by the code path above; nothing is dropped or stripped.
- This is a **pre-existing** reload-race on the unawaited `safeSave`, live since v1.19.722 and affecting **all** portal-apply data (prices + cross), **not** introduced by #199. #199's TR fields ride the same write and persist exactly as reliably as prices/cross always have.
- TR is not special-cased anywhere that would drop it; `projectRef` freshness (synchronous `update`) + `saveProject` §4 preservation both hold.

## Recommendation
- **Deploy #199.** No persistence gap; the revert is a reload-timing artifact.
- **Optional, out-of-#199-scope hardening (LOW):** the fire-and-forget `safeSave` at `38293` means *any* immediate reload after a portal apply loses the write. If we want to close the race for all portal-apply data, `await` the `safeSave` in the Apply handler (or hold the `varianceProcessing` spinner / modal until it resolves) before the modal closes. Pre-existing; track separately, not a #199 blocker.

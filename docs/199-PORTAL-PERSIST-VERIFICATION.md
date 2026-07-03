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

---

## SHARPENED (2026-07-02, per Marc's specific-path findings) — exact lines + decisive test + fix

Marc: the cross branch of the "Apply N Items to BOM" handler (`~38967`) sets the cross + TR via `update({...projectRef.current,panels:updatedPanels})` (React state only, **no save in the branch**) and relies on `await doApplyPortalPrices(remapped)` to persist; his team found no save in doApplyPortalPrices' first ~120 lines.

**(a) Does `doApplyPortalPrices` persist the post-cross panel — or only price-matched rows?**
**It persists the ENTIRE project (all panels, all rows — including crossed rows with `isCrossed` + the 5 TR fields), not just price-matched rows.** Exact lines:
- `updatedPanels` — **`src/app.jsx:38251`** — maps over `projectRef.current.panels`; the inner `bom.map(row=>…)` has four return branches (crossedPN-skip `38270`, manual-price `38285`, bc-price-matched `38290`, fallthrough `38297`) and **every one returns `{...row,…}` or `row`** → `isCrossed`/`techReviewFlag`/`techReviewFlagSource`/`techReviewResolved*` (present on `row`) are preserved in **all** cases. (Crossed rows don't even hit the `crossedPNs` skip — after the cross, `row.partNumber` is the *supplier* PN, so `nk` isn't in `crossedPNs` (keyed by the original PN); they land on the fallthrough `…?{...row,...ltPatch,…}:row`, still spreading `...row`.)
- `const updatedProject={...projectRef.current,panels:updatedPanels}` — **`38300`**
- `safeSave(uid,updatedProject).catch(…)` — **`38302`** ← **this is the save Marc's ~120-line read stopped short of (it's ~226 lines into the function).**
- Freshness: `update(p)` (**`37583-37587`**) sets `projectRef.current = p` **synchronously**, so the handler's earlier cross-branch `update(...)` puts the crossed rows + TR into `projectRef.current` *before* `doApplyPortalPrices` reads it at `38251`. `saveProject` strips only `dataUrl`, preserving the §4 TR fields. **So the write does contain the crossed rows + flag.**

**(b) So is it a ship-blocker? NO — but the concern is legitimate; here's the precise status.**
It is **not a persistence gap in code** — the crossed rows + flag *are* written. The revert is because **`safeSave` at `38302` is fire-and-forget (`.catch()`, not `await`ed)**; `doApplyPortalPrices` returns before the Firestore commit, so the handler's `await doApplyPortalPrices(...)` also returns before it commits. All of cross+TR+prices live in that **one** `updatedProject` write, so an immediate reload that beats the commit drops them together, while the **separately-awaited** submission-status write survives — exactly the observed symptom.
- **Pre-existing, NOT #199-introduced:** the `update()`-only cross branch and the unawaited `safeSave` both predate #199 (the save is v1.19.722); prices + cross were always subject to this race. #199 only added the flag to the existing cross object.
- **But #199 raises the stakes:** a lost write → gate reads "no unresolved TR" → quote sendable without sign-off. So on the money-path, the write's *reliability* now matters more than it did for prices alone.
- **DECISIVE test (settles code-read vs. a real gap — run before trusting either):** repeat the supplier apply, **wait ~5 s** (let the async write commit), **then** reload. Code-read predicts everything persists (benign reload-race). If it **still** reverts after waiting → a real gap and a blocker. My read says it persists; the wait-then-reload test confirms it empirically.

**(c) Recommended fix — one word, closes the race and removes all doubt:**
At **`src/app.jsx:38302`**, change
`safeSave(uid,updatedProject).catch(e=>console.warn("safeSave after applyPortalPrices failed:",e));`
→ `await safeSave(uid,updatedProject);`
`safeSave` (`9124`) never throws (it catches + retries internally and returns a bool), so awaiting needs no try/catch. Because the Apply handler already `await`s `doApplyPortalPrices`, this holds the `varianceProcessing` spinner until the Firestore write commits — the user can't reload mid-write. **This closes the reload-race for ALL portal-apply data (prices + cross + TR) and makes the #199 gate reliable.**

**Deploy call:** the gate logic is correct and the data *is* persisted on normal use, so shipping as-is is defensible with the fix as a fast-follow. **But given this is the money-path gate and the fix is a one-word `await` at `38302`, I recommend applying it before deploy** (then a quick re-verify + the wait-then-reload test) rather than relying on "benign unless the user reloads within the write window."

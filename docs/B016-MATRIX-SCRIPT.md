# B016-2/3 Verification Matrix — run instructions (for Jon)

> **Build under test:** `b016-23-merge` (`33b0e5c0`) — the row-merge data-safety core + resilient mutations. Deployed 2026-07-12 to the **test channel**.
> **Where:** **https://matrix-arc-test.web.app** — **HARD REFRESH (Ctrl+Shift+R)** to load the build. (Prod is untouched at v1.23.11.)
> **⚠️ Data:** matrix-arc-test shares PROD Firestore — **use a DISPOSABLE/throwaway project** (make a new scratch project or a known junk one). Do NOT run this on a real customer project.
> **Setup:** have a few BOM rows, some with real BC prices (Priced Date + BC source). Keep DevTools **Console open** to watch for errors.
> **Build-confirm:** you don't need the version number — if **A1/A2 below persist**, you're on the new build (on the old build they'd revert). That's your proof.

## Part A — the F1 fix (the money-path silent-revert Coach caught). Single session; these directly verify the fix.
- **A1 — Clear a BC-priced row:** pick a row with a BC price → **clear its price** → let it save (~1–2s) → **reload** → price **stays cleared** (does NOT snap back to the BC price). *(Pre-fix: it reverted — the bug.)*
- **A2 — Budgetary over a BC row:** pick a BC-priced row → enter a **budgetary price** → save → reload → **stays your budgetary value** (no revert to BC).
- **A3 — AI estimate:** on a non-BC row, apply/keep an **AI estimate** → save → reload → **persists.**
- **A4 — commitBcItem (the primary path):** use the **BC Item Browser** to swap a row → a **BC item** (assigns the BC price) → save → reload → the assigned part + price **persist.**

## Part B — no-regression on normal editing. Single session.
- **B1** — edit **qty / part number / description** on a row → reload → persists.
- **B2** — **add a new row** → reload → present.
- **B3** — **delete a row** → reload → **stays deleted** (not resurrected).
- **B4** — edit a **lead time** → reload → persists.
- **B5** — confirm **untouched rows'** BC prices + lead times are **unchanged** after all the above.

## Part C — concurrency (best-effort; deep cases are unit-test-covered)
> True two-humans-editing-at-once is blocked by the B012 one-editor lock, so this is best-effort. The concurrent add/delete **preservation** logic is already covered deterministically by the **39 passing unit tests** (`tests/b016-merge.test.js`). Part A + B are the critical live checks.
- **C1 — background-write vs your edit:** on a BC-connected project, edit a row (clear a price or change a lead time), then trigger a BC refresh (**"Get New Pricing"** or let the 5-min poll run) → your edit is **not reverted** by the background write, and the background price update also lands (both survive).
- **C2 — (optional, needs a 2nd device/co-driver) lease-handoff stale save:** S1 edits + adds a row, navigates away (releases the lease); S2 opens/adopts → the added row + edits are present, nothing reverts.

## Pass / fail
- **PASS** = all of **A + B** behave as described (every edit persists across reload, nothing silently reverts, no console errors) — C best-effort. → tell Freddy **"matrix passed"** → deploy `b016-23-merge` to prod (**v1.23.12**), closing the BC-reliability chain.
- **FAIL** = note the step + the row + any console output → Freddy diagnoses before any prod deploy.

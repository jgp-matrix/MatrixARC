# Phase B — 2-Session Integration Matrix (Jon-runnable script)

**What this verifies:** the concurrent-safe BOM row merge (PR #5, branch `claude/phase-b-bom-merge`) — that two people editing one project's BOM no longer clobber each other's rows, and single-user editing is unchanged.
**Where:** **https://matrix-arc-test.web.app** (the test channel — has the Phase B build; prod does NOT until sign-off).
**Algorithm already unit-verified:** `tests/bom-merge-phaseb.test.js` = 25/25 pass. This script exercises the *live integrated* app (React state + onSnapshot + Firestore round-trip + two real users) which the unit test can't.

---

## ⚠️ Setup (read first)

1. **Two DISTINCT logins are mandatory.**
   - **Session A** = owner (your normal login, `jon@matrixpci.com`).
   - **Session B** = a **different user** with **edit** role on the same company.
   - ★ **Two tabs of the SAME login will NOT test anything** — the merge logic keys on `updatedBy !== me`; same-uid saves skip the concurrent path entirely and everything will look fine while proving nothing.
   - Use two browsers (or one normal + one incognito) so the two logins don't share a session.
   - **If you don't have a 2nd edit-role user:** tell Freddy — we provision a test user via `inviteTeamMember` (edit role) before running.

2. **Use FRESH throwaway projects** (brand-new = zero customer data = safe even though test shares prod Firestore). **Delete them when done.** Do NOT run this on PRJ402096 or any real job.
   - Create **P-AB** (for the concurrent cases) — both A and B will open this one.
   - Create **P-SOLO** (for the single-user cases).

3. **Add BOM rows MANUALLY** (`+ Add Row`, type a part number) — that's the exact operation under test; no drawing/extraction needed. Give each test row an obvious PN (e.g. `A-R1`, `B-R2`, `X-DEL`) so you can eyeball the result.

4. **After each save, RECORD:** total row count + the list of test PNs present. (Optional deeper check: open DevTools Console — look for `BOM MERGE: preserved N …` warnings, which confirm the merge fired.)

---

## Part 1 — Concurrent cases (Sessions A + B, project **P-AB**)

Both A and B open **P-AB** and the same panel.

| # | Do this | Expected result | Record |
|---|---------|-----------------|--------|
| **T1** | A: add row `A-R1` (don't refresh B). B: add row `B-R2`. A saves, then B saves. | **Both** `A-R1` and `B-R2` present. | rows + PNs |
| **T2** | A: add `A-R1`, save. B (screen still pre-A-R1): edit an existing row `R3`'s description, save. | `A-R1` preserved **and** R3's edit applied. No dup R3. | rows + PNs |
| **T3** ★ | A: delete row `X-DEL`, **save**. **WAIT ~2–3s** until B's screen updates and `X-DEL` disappears there (that's the soft-apply). **THEN** B: add `B-NEW`, save. | `X-DEL` stays **deleted** (not resurrected); `B-NEW` present. | rows + PNs |
| **T4** ★ | Reverse of T3: B deletes `Y-DEL` + save → wait for A's screen to drop `Y-DEL` → A adds `A-NEW` + save. | `Y-DEL` gone, `A-NEW` present. | rows + PNs |
| **T5** | A and B edit **different fields on the same row Z** (A changes qty, B changes description), both save. | Last save wins on the shared row (**documented** last-writer-wins); **no row lost**. | rows + which field stuck |
| **T7** ★ | A: add `A-UNSAVED` but **do NOT save**. B: edit any row + save. Watch A's screen update (soft-apply). | A's unsaved `A-UNSAVED` **survives** on A's screen; B's edit appears. Then A saves → both persist. | rows on A after soft-apply |
| **T9** ★ | Give B's concurrent-add row real metadata: in B, add a row, price it from the BC Item Browser (so it has `priceSource:bc`, a BC vendor, lead time), save. A (stale) saves an unrelated edit. | B's row is preserved **whole** — its price, BC vendor, lead time all intact after A's save. | B-row price/vendor/lead present? |
| **T10** | After any of the above merges, glance at the labor rows. | Labor rows **not duplicated**; labor unchanged by the merge. | labor row count |
| **T11** | In ECO scope: A opens an ECO, adds an ECO row; B concurrently adds a base row; both save. | ECO add preserved; base add preserved; ECO/base separation intact. | rows + ECO tags |

★ = the cases that actually prove the fix — do these carefully, especially the **wait-for-propagation** in T3/T4/T7.

---

## Part 2 — Single-user regression (Session A only, project **P-SOLO**)

| # | Do this | Expected |
|---|---------|----------|
| **T6** (Phase A) | Create P-SOLO (paneled), add 2–3 rows, save. **Close** the project (back to dashboard). **Reopen** it. | All rows intact — **no clobber on open** (this is the Phase A regression check). |
| **T8** | Add a row, edit it, delete it, reorder rows, all with normal saves. | Behaves exactly like today — merge adds no regression for a lone editor. |

**Note on the legacy panel-less Phase A leg:** fresh projects are always paneled, so the *original* Phase A trigger (a legacy no-panels project) can't be created fresh. That leg is **code-verified** (the save-on-open effect is deleted; migration re-applies on load and persists on next edit) + unit-adjacent — no live test needed. T6 confirms no open-time regression on modern paneled projects.

---

## Part 3 — A2 null-baseline (optional, single-user)

**Purpose:** confirm a full-BOM-replace doesn't resurrect old rows, and the degraded null-baseline case biases to preserve + warns.
- **A2a (baseline present — the normal case):** On P-SOLO with rows saved, do an **"Update BOM"** (or re-extract if a drawing-bearing throwaway is handy). → old rows are correctly dropped/replaced, **no duplicates**.
- **A2b (null baseline — degraded):** Hard-reload the page mid-edit (this clears the in-memory baseline), then immediately do the replace. → under bias-to-preserve you may see old rows kept as dups **and** a Console warning `BOM MERGE: baseline unknown — bias-to-preserve …`. That warning firing is the expected safety signal.
- Re-extract needs a PDF; if no throwaway project has drawings, **skip the re-extract variant** — the null-baseline logic is unit-verified (`tests/bom-merge-phaseb.test.js` T12/A2/A2b) + code-verified. Note in your report whether you ran it.

---

## What to send back to Freddy

For each case run: **PASS/FAIL + the recorded row count & PNs** (and any `BOM MERGE` console warnings seen). Call out explicitly:
- **T3/T4** — was the deleted row resurrected? (must be **no**)
- **T9** — did B's concurrent-add row keep its price/BC-vendor/lead-time metadata? (must be **yes**)
- **T7** — did A's unsaved row survive B's remote save? (must be **yes**)
- Any case where a row was **lost** or **duplicated** (there should be none).
- Confirm the two sessions were **different logins** (not two tabs of one).

Freddy relays results; Coach re-reviews the PR; **then** it's Jon's prod deploy checkpoint. **Delete the throwaway projects (P-AB, P-SOLO) after the run.**

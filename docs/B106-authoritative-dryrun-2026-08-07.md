# B106 — AUTHORITATIVE vendor-repair dry-run (BC-map resolved, 2026-08-07, Freddy)

**Method:** read-only. Pulled BC's live vendor master (`bcListVendors`, 364 vendors) from the controlled tab (prod v1.25.0, BC connected), gave me both number→trueName and name→number. Classified every `(bcVendorNo, bcVendorName)` pair across all 103 projects against BC truth. **No writes performed.** Reproduce: `tools/b106-classify-vendor-drift.js` (needs the two BC-map JSONs regenerated via the console snippets in `docs/B106-vendor-drift-scan-2026-08-07.md`).

## Result (2,323 vendor-bearing rows)
| Bucket | Pairs | Rows | Projects | Meaning / action |
|---|---|---|---|---|
| **CORRECT** | 261 | **2,144** | — | number matches name (incl. benign cosmetic variants like "Rittal LLC"=V00366) — no action |
| **REPOINT** | 58 | **141** | 24 | **number is wrong** → re-point `bcVendorNo` to the name's true BC vendor (assumes the *name* is the intended supplier — matches Jon's Crum intent) |
| **AMBIGUOUS** | 10 | **38** | 9 | name isn't a canonical BC vendor → **needs Jon** |

Honors the B102 lesson: BC-truth-grounded count is **~141 real fixes + 38 to-decide**, not the ~600 a naive heuristic would flag.

## REPOINT mappings (number → true vendor by name; assumes name = intent)
Grouped by mapping, biggest first. The known Crum case = the first two rows (V00251 Heitek → V00179 Crum, 40 rows total).

| Re-point | Vendor (by name) | Rows | Projects |
|---|---|---|---|
| V00251→V00179 | Crum Electric (+ "…Supply" variant) | 30 + 10 = **40** | PRJ402502, 402509, 402124 |
| V00261→V00373 | Royal Wholesale | 20 | 402135, 402136, 402096, 402140, 402087 |
| V00374→V00261 | Intermountain Fuse Supply | 15 | 402101, 402096, 402089, 402119 |
| V00030→V00309 | Matrix Systems | 6 | 402096, 402141, 402133, 402135, 402099 |
| V00165→V00373 | Royal Wholesale | 6 | 402109, 402091, 402503, 402143, 402142 |
| V00196→V00373 | Royal Wholesale | 6 | 402135 |
| V00373→V00261 | Intermountain Fuse Supply | 6 | 402143, 402108 |
| V00374→V00373 | Royal Wholesale | 5 | 402119, 402089, 402142 |
| V00373→V00165 | Codale Electric Supply | 4 | 402093, 402141, 402119 |
| V00374→V00404 | TMMI | 3 | 402141, 402143 |
| V00374→V00244 | Grainger Industrial | 3 | 402119 |
| V00309→V00540 | Ovivo | 3 | 402502, 402509 |
| _+ 19 more single/double-row mappings_ | (Digikey, RS-Online, SMCUSA, Galco, Applied Automation, Standard Supply, Precision Digital, Emerson…) | ~11 | various |

Full per-project breakdown: scratchpad `b106-authoritative-dryrun.txt` (or rerun the classifier).

## AMBIGUOUS (38 rows — need Jon)
Almost all are the free-text name **"ROYAL - SALT LAKE CITY"** (not a canonical BC vendor) stamped on 4 different numbers:
| Number (BC true) | Name on row | Rows | Projects |
|---|---|---|---|
| V00373 (Royal Wholesale) | "ROYAL - SALT LAKE CITY" | 29 | 402143, 402093, 402087, 402096, 402118 |
| V00374 (RS-Online) | "ROYAL - SALT LAKE CITY" | 4 | 402096, 402141 |
| V00020 (Royal DIRECT) | "ROYAL - SALT LAKE CITY" | 2 | 402093 |
| V00357 (Rust Automation) | "ROYAL - SALT LAKE CITY" | 1 | 402141 |
| V00470 (Calvin Robertson) | "Hoists Direct" | 2 | 402119 |

**Jon call:** is "ROYAL - SALT LAKE CITY" the same as Royal Wholesale (V00373), Royal DIRECT (V00020), or a distinct vendor needing its own BC record? On V00373 it's arguably already correct (same Royal). And what is "Hoists Direct" (V00470 is "Calvin Robertson" in BC)?

## Execution — money-path, NOT yet run
Re-pointing `bcVendorNo` changes the row's pricing / lead-time / BC-writeback target, so this is a money-path mutation, not a cosmetic fix. It also likely needs the BC **ItemCard `Vendor_No`** re-PATCHed and an **F089 refresh** to re-pull correct price/LT for the new vendor. Options:
1. **Admin backfill** (Freddy runs via `firebase-admin`): surgical read-modify-write of only `bcVendorNo`/`bcVendorName` on matched rows; logs old→new per row; reversible; done when no one is editing. Fast (all 141 at once). **Bypasses the app save funnel → needs Coach money-path review** of the mechanism + whether to also re-PATCH BC ItemCards / re-run F089.
2. **In-app repair tool** (Coach's Option A): routes through `saveProjectPanel(_noBumpWrite)` (safer), but is a build + you click through 24 projects.
3. **Manual re-pick:** 141 rows — impractical at this scale.

## Decisions for Jon
1. **Approve the REPOINT principle** — "the name on the row = the intended vendor; re-point the number to match." (True for the Crum case; confirm it holds generally, or flag any mapping that's actually a name-typo where the *number* was right.)
2. **AMBIGUOUS** — resolve "ROYAL - SALT LAKE CITY" (which Royal?) and "Hoists Direct".
3. **Execution mechanism** — admin backfill (recommended for scale, pending Coach review) vs in-app tool vs manual.
4. **Downstream** — after re-point, re-PATCH BC ItemCards + F089-refresh the affected rows? (Coach to confirm scope.)

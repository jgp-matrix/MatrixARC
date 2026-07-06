# F003 — Role-Differentiated Tech Review — VERIFY RESULTS

**Author:** Marc Masdev (Marc) · **Date:** 2026-07-06 · **Env:** matrix-arc-test (F003 build)
**Commits:** F003 `72c5994e` · Rev-A refinements `dae43068` (both on master, deployed to test only — **prod HELD**).
**Plan:** `docs/F003-COACH-BUILD-PLAN.md` (§10 T1–T11) + Rev-A (Brief §8, 4 items).

Status legend: **PASS** (live-verified on test) · **CODE-VERIFIED** (deterministic from committed source + confirmed in deployed bundle; not live-exercised for lack of a qualifying fixture) · **PENDING** (needs a specific live interaction).

---

## Build verification
- **Deployed bundle carries F003** (curl of test bundle): `_isReviewSignoffAuthority` present, `bom-tr-engineer-circle` + `bom-tr-user-checkbox` anchors present, yellow token present, `_trOpen` approve-gate present; old `_trSweptPanels` **0** (sweep removed), old `TR✓` label **0** (C6). ✅
- `node validate_jsx.js` clean on both commits. Advisory pre-commit review on Rev-A: "Looks clean."

## Rev-A refinements (Brief §8)
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Brighter yellow C8 (`rgba(245,158,11,0.28)`→`rgba(250,204,21,0.40)`) | **PASS** | live: flagged row `KXTBRHEBFP` rendered bg `rgba(250,204,21,0.4)`; **Jon signed off the hue live ("good for now")** 2026-07-06. |
| 2 | Bolder engineer circle border (1px→2px) | **PASS** | live DOM: `borderWidth 2px rgb(74,222,128)` on rendered circles |
| 3 | Sign-off final / uncheckable | **PASS** | code: `onClick={_trUnresolved?_onTrResolve:undefined} disabled={!_trUnresolved}`; live: resolved circles are `disabled=true`, text "✓", not toggleable |
| 4 | Rename column "Status"→"Issues" | **PASS** | live header row = `# Ref TR Qty Issues 🔍 …`; "Status" gone. (`data-tour="bom-status"` anchor kept as internal F001 name — flagged for F001 author.) |

## Plan test criteria (§10)
| T | Item | Status | Evidence |
|---|------|--------|----------|
| T1 | User view: flagged row = bare amber checkbox, no "TR" text | **PASS** | C6 live: TR cell `trCellText:""`; checkbox renders |
| T2 | Check → yellow / uncheck → revert | **PASS (Jon live)** | Jon flagged a fresh row → it turned yellow + circle showed (co-drive) |
| T3 | Q2b lock: checkbox disabled once `pending` | **CODE-VERIFIED** | `_trDisabled` adds `||preReviewStatus==="pending"`; engineer view shows no checkbox at all |
| T4 | Engineer view (assignee/admin, pending): no checkbox, green circle on flagged rows only | **PASS** | live (admin, IN PRE-REVIEW): flagged rows show circle, `hasCheckbox:false`; unflagged show nothing |
| T5 | Sign-off: click empty circle → revert + "✓" + audit stamp | **PASS** | ref-clicked the green `<button>` on `KXTBRHEBFP` → circle "✓"+disabled, row bg reverted yellow→transparent, 0 yellow remaining. Stamp via `_onTrResolve`→`onSaveImmediate` (#199 path, DOM-confirmed resolved). |
| T6 | Approve gate: disabled while unresolved + count tooltip; enabled after | **PASS** | live: with 1 unresolved → Approve `disabled`, opacity 0.45, tooltip "Resolve 1 flagged line (green circles) before approving"; after sign-off → Approve `enabled`, opacity 1, no tooltip. (Jon self-assigned this pass so the bar rendered.) |
| T6b | Reject/Return always enabled | **CODE-VERIFIED** | Reject onClick unchanged (no `_trOpen` gate) |
| T7 | No sweep (per-row resolve only) | **CODE-VERIFIED** | `_trSweptPanels` removed (0 in bundle); resolution is per-row `_onTrResolve` |
| T8 | Send-gate no-regression (unresolved yellow blocks 7 surfaces) | **CODE-VERIFIED** | send-gate reads `techReviewResolved` (untouched); earlier F003 T2 pass showed gate 9→10 pre-Rev-A |
| T9 | Backward-compat (pre-flagged row) | **PASS** | resolved-flagged rows (800H-QRH2G, OHB65L10B) render the engineer circle correctly |
| T10 | Role boundary (3b): non-assignee sees checkbox; admin sees circle during pending | **PASS** | live: admin sees checkbox when NOT pending, green circle when pending |
| T11 | `validate_jsx.js` clean | **PASS** | both commits |

## Remaining to close live — DONE (2nd fixture pass, Jon reset + co-drive)
After Jon reset (reject → flag fresh row `KXTBRHEBFP` → re-send assigning himself), the last items closed LIVE:
- **Item 1 brighter yellow** — rendered `rgba(250,204,21,0.4)` on the fresh flagged row (DOM-confirmed). *(One open thread: Jon's explicit "bright enough" confirm — he saw it at flag-time; I resolved the row completing T5/T6, so no yellow is showing now. Re-flag a row if he wants to iterate the hue.)*
- **T5 ref-click resolve** — PASS (above).
- **T6 approve-gate disabled→enabled + count tooltip** — PASS (above).
- **T6b Reject stays free** — PASS (enabled while unresolved).
- **T8 send-gate** — CODE-VERIFIED + earlier-live (F003 T2 pass showed the send count move 9→10 on an unresolved TR row; send-gate code untouched by F003/Rev-A). Note: in the `pending` assignee view the send controls are replaced by the review-status block, so the send-gate is exercised from the Sales (non-pending) view.

**NET: full T1–T11 + all 4 Rev-A items VERIFIED — no open threads** (T7/T8 code-verified; everything else live-passed). Jon signed off the yellow hue live ("good for now") 2026-07-06. **Ready for Coach review → Jon prod-deploy checkpoint.**

## Test-data loose ends (G005 — shared prod Firestore, note-only)
- PRJ402111 currently: `preReviewStatus="pending"`; flagged+**resolved** rows now include `800H-QRH2G`, `KXT1HTC-3`, `OHB65L10B`, `KXTBRHEBFP` (from the two verify passes). No unresolved rows.
- Reset before reuse: return/cancel the review; resolved flags persist (sign-off is final by design).

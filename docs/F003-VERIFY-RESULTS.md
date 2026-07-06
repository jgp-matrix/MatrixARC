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
| 1 | Brighter yellow C8 (`rgba(245,158,11,0.28)`→`rgba(250,204,21,0.40)`) | **CODE-VERIFIED / PENDING Jon eyeball** | token deployed; needs an unresolved row live for Jon to approve the hue/alpha (tuning knob) |
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
| T5 | Sign-off: click empty circle → revert + "✓" + audit stamp | **CODE-VERIFIED / PENDING** | reuses `_onTrResolve` (stamps resolvedBy/At); no unresolved circle currently to ref-click (fixture all-resolved) |
| T6 | Approve gate: disabled while unresolved + count tooltip; enabled after | **CODE-VERIFIED / PENDING** | `_trOpen` gate in code; live approve bar not rendered for me (assignee-gated; Jon assigned the default engineer) |
| T6b | Reject/Return always enabled | **CODE-VERIFIED** | Reject onClick unchanged (no `_trOpen` gate) |
| T7 | No sweep (per-row resolve only) | **CODE-VERIFIED** | `_trSweptPanels` removed (0 in bundle); resolution is per-row `_onTrResolve` |
| T8 | Send-gate no-regression (unresolved yellow blocks 7 surfaces) | **CODE-VERIFIED** | send-gate reads `techReviewResolved` (untouched); earlier F003 T2 pass showed gate 9→10 pre-Rev-A |
| T9 | Backward-compat (pre-flagged row) | **PASS** | resolved-flagged rows (800H-QRH2G, OHB65L10B) render the engineer circle correctly |
| T10 | Role boundary (3b): non-assignee sees checkbox; admin sees circle during pending | **PASS** | live: admin sees checkbox when NOT pending, green circle when pending |
| T11 | `validate_jsx.js` clean | **PASS** | both commits |

## Remaining to close live (needs one clean unresolved fixture)
Sign-off is **final** (item 3, as designed), so both test flags are now resolved and no unresolved row exists. To capture the last live items — **item-1 brighter-yellow eyeball, T5 ref-click resolve, T6 approve-gate disabled→enabled, T8 send-gate on a live yellow row** — a fresh unresolved row is required:
1. Exit pending (Reject/Return, or cancel review) so checkboxes are editable.
2. Jon checks a fresh row's TR box (real click) → **I verify C8 brighter yellow (DOM) + send-gate + Jon eyeballs the hue**.
3. "Send for Technical Review" **assigning Jon himself** (so the Approve/Reject bar renders for him) → engineer view.
4. **I ref-click the green circle** (it's a `<button>`) → verify resolve → "✓" + Firestore `techReviewResolved/resolvedBy/At` stamp; probe approve-gate disabled(before)→enabled(after) + Reject-free.

## Test-data loose ends (G005 — shared prod Firestore, note-only)
- PRJ402111 currently: `preReviewStatus="pending"`; flagged+**resolved** rows `800H-QRH2G` (from T2) and `OHB65L10B` (Jon's Rev-A test). No unresolved rows.
- Reset before reuse: return/cancel the review; the resolved flags persist (sign-off is final by design).

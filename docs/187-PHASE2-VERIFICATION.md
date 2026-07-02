# #187 Phase 2 Verification — Coach

**Author:** Sam Wize (Coach)
**Date:** 2026-07-01
**Version:** v1.21.14 (ee085025 / release c46e75fd)
**Verdict:** PASS — all 4 checks confirmed

---

## 1. Mechanism Deviation — Module Global

**CONFIRMED: correct and closed.**

Plan §2.3 specified a component `useRef`, but the resolver is called from `buildQuotePdfDoc`
(line 7456) which is MODULE-LEVEL — a component ref would be unreachable there. Marc correctly
used module globals `_customerValidityDays` / `_customerValidityLoadedFor` (lines 2050-2051),
house-consistent with `_pricingConfig` / `_appCtx` / `_bcToken`.

### (a) Reachability — all 4 call sites confirmed

| Call site | Line | Reads `_customerValidityDays` | Module-level reachable? |
|-----------|------|-------------------------------|------------------------|
| Send path 1 | 33002 | `resolveQuoteValidityDays(populated, _customerValidityDays)` | Yes |
| Send path 2 | 38480 | `resolveQuoteValidityDays(project, _customerValidityDays)` | Yes |
| PDF print | 7456 | `resolveQuoteValidityDays(project, _customerValidityDays)` | Yes (module-level fn) |
| `defaultValidUntil` | 20244 | `resolveQuoteValidityDays(project||{}, _customerValidityDays)` | Yes (component reads module global) |

A component ref would have failed at line 7456 (PDF). Module global reaches all four.

### (b) Cross-project bleed — CLOSED

The contamination scenario: user opens Project A (customer X, 60 days) → navigates to Project B
(customer Y, no default) → sends on B. Does B stamp customer X's 60 days?

**Defense mechanism:** `_customerValidityLoadedFor` stores the `bcCustomerNumber` the cached value
was loaded for. Send paths check `_customerValidityLoadedFor !== project.bcCustomerNumber` before
stamping. Three scenarios traced:

**Normal path (useEffect completes before send):**
1. Open A → `_customerValidityLoadedFor="CUSTX"`, `_customerValidityDays=60`
2. Navigate to B ("CUSTY") → useEffect fires `_loadCustomerValidity("CUSTY")` → resolves → `_customerValidityLoadedFor="CUSTY"`, `_customerValidityDays=null`
3. Send on B → guard: `"CUSTY" !== "CUSTY"` = false → skip fetch → resolver gets `null` → falls to global. **Correct.**

**Race path (send before useEffect resolves):**
1. Open A → `_customerValidityLoadedFor="CUSTX"`, `_customerValidityDays=60`
2. Navigate to B → useEffect fires async (pending)
3. Send on B immediately → guard: `"CUSTX" !== "CUSTY"` = **true** → triggers inline `await _loadCustomerValidity("CUSTY")` → fetches CUSTY's default → stamps correctly. **No bleed.**

**Same-customer path:**
Project A and B share the same `bcCustomerNumber` → `_customerValidityLoadedFor` matches → cached value is correct (same customer). **No bleed by definition.**

**Preview-only transient:** The `defaultValidUntil` (line 20244) and PDF preview (line 7456) read
`_customerValidityDays` WITHOUT a guard. During the async window between navigation and useEffect
resolution, the preview may briefly show the prior customer's days. This is:
- Cosmetic only (not persisted)
- Self-correcting on useEffect completion (React re-render)
- Explicitly documented: "Correctness at SEND is guaranteed independently by the §2.4 race guard;
  this effect is UX pre-warming only" (line 36720-36721)

**Verdict: contamination class is fully closed at the persistence boundary (send). Preview
transient is cosmetic, acceptable, and documented.**

---

## 2. Customer Tier Wiring

| Component | Location | Status |
|-----------|----------|--------|
| Firestore rules | `firestore.rules:474-477` | `customerDefaults/{bcCustomerNumber}` read:isMember / write:isAdminMember |
| Module globals | `app.jsx:2050-2051` | `_customerValidityDays` + `_customerValidityLoadedFor` |
| Loader function | `app.jsx:2052-2059` | `_loadCustomerValidity(bcCustomerNumber)` — reads `customerDefaults/{num}`, sets both globals |
| Background preload | `app.jsx:36722` | useEffect on `project?.bcCustomerNumber` — UX pre-warming |
| Race guard (send 1) | `app.jsx:33001` | `if(_customerValidityLoadedFor!==populated.bcCustomerNumber) await _loadCustomerValidity(...)` |
| Race guard (send 2) | `app.jsx:38479` | Same pattern, uses `project.bcCustomerNumber` |
| Resolver tier order | `app.jsx:2038-2043` | q.quoteValidityDays → project.quoteValidityDays → customerDays → global. All 4 call sites pass `_customerValidityDays` as `customerDays`. |
| Admin CRUD UI | `app.jsx:17764-17795` | Load (collection get), save (doc set), delete (doc delete), sorted list. Admin-gated at line 17779. |

---

## 3. Relocation

| Element | Before | After | Status |
|---------|--------|-------|--------|
| On-screen valid-until row | Not present | Line 20839-20841: `{isProjectBudgetary?"BUDGETARY - ":""}Prices Valid Until {defaultValidUntil}` after Total/BUDGETARY in `qd-totals-box` | ADDED |
| On-screen footer date span | Line 20779 | Removed | REMOVED |
| On-screen footer days input | Line 20780 | Removed (single input = compact form at 20306-20310 only) | REMOVED (one input, not duplicated) |
| On-screen footer label | "Prices Valid Until" | Removed (right side of footer now empty, comment at 20853-20854) | REMOVED |
| PDF old valid-until block | Lines 7436-7444 (2 right-aligned lines: grey label + red date) | Removed | REMOVED |
| PDF new valid-until row | Not present | Line 7454-7457: single centered line with BUDGETARY prefix, red, reads `project.quoteExpiresAt` then cascade fallback | ADDED |
| `isProjectBudgetary` (on-screen) | Line 20164 | Unchanged, reused for prefix | OK |
| `isBudg` (PDF) | Line 6844 | Unchanged, reused for prefix | OK |
| `quoteExpiresAt` | Project-level everywhere | Unchanged from Phase 1 | OK |
| Expiry gate | Lines 36668-36673 | Identical to Phase 1 (untouched) | OK |

---

## 4. No Regressions

- **validate_jsx + scope-clean:** Confirmed per Marc's report (not independently run — no build tools in Coach scope).
- **Pricing/margin/sell:** `git diff` of Phase 2 shows zero changes to `computePanelSellPrice`, `computeCustomerPanelSellPrice`, `marginPct`, `unitPrice`, `sellPrice`, `materialCost`, or any pricing formula.
- **#186 expiry gate:** Lines 36668-36673 identical to Phase 1. `quoteExpiresAt` read from `projectRef.current` (project-level). No Phase 2 touch.
- **Phase 2 diff size:** ~120 changed lines (additions + removals), consistent with plan estimate of ~50 lines new + relocation removals.

---

## Live-Pending Tests

These require real UI interaction or quote sends that Coach cannot execute:

| Test | What it needs | Why it's live-only |
|------|--------------|-------------------|
| T12 | Set customer default for customer X, send quote for customer X | Sends real email |
| T13 | Full 4-tier cascade priority test (set all tiers, send, clear each tier, re-send) | Multiple sends |
| T14 | Send for customer with no default doc | Sends email |
| T15 | Non-admin writes to `customerDefaults` | Requires non-admin user session |
| T16 | Switch bcCustomerNumber on project, re-send | Sends email |
| T17 | Admin CRUD roundtrip (add/edit/delete customer defaults) | Requires live PricingConfigModal |
| T18 | Send-race guard (send immediately on project open) | Timing-sensitive live test |
| Relocation visual | Verify the "Prices Valid Until" row renders below Total/BUDGETARY on both the on-screen quote form and the generated PDF | Requires rendered UI + PDF generation |
| Pre-#187 reprint | Open a project sent before v1.21.13 (has quoteSentAt but no quoteExpiresAt), generate PDF — should show today+cascade date, not crash | PDF generation |

T15 (Firestore rules) is code-verifiable from the rules file — `allow write: if isAdminMember()` at line 476 — but a live test with a non-admin user would confirm the deployed rules match.

T17 (admin CRUD) and the relocation visual are the lowest-risk to run first — no emails sent, just UI interaction.

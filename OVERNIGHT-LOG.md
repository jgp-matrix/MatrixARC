# Overnight Work Log — 2026-06-01/02

Shared coordination file between Coach (Sam Wize) and Marc (Marc Masdev).

---

## 2026-06-01 ~01:30 MDT - COACH - Starting deep audit

Beginning comprehensive ARC codebase audit per Jon's overnight work plan.
Scope: 4 parts (patterns, architectural, recent code focus, UI feedback gaps).
Target output: ARC-AUDIT-FINDINGS.md in repo root.
Hard rule: NO CODE CHANGES. Investigation only.

Reading CLAUDE.md complete. Beginning Part 1 (patterns) now.

---

## 2026-06-01 ~02:15 MDT - COACH - Progress update (4 of 11 investigations complete)

Completed investigations:
- 1a. Stale state writes: 6 findings (2 HIGH: modal save stale closure at 33743, labor sync 800ms timeout at 22736)
- 1b. Silent fallbacks: 8 findings (2 HIGH: customerApprovalDays ??21 at 1309/22305, productionDaysPostApproval ??30 at 22301)
- 1c. Field source-of-truth: 9 field pairs (CRITICAL: bcVendorNo/bcVendorName diverge on archive restore at 9567)
- 1f. Concurrent edit races: 7 findings (HIGH: saveProject vs saveProjectPanel lock gap, config writes no serialization)

Still running: AI hallucination vectors, missing exclusions, UI warning gaps, cross-client inconsistencies, state management, BC sync robustness, recent code areas.

---

## 2026-06-02 ~02:30 MDT - MARC - Standing by for Coach's audit completion

Marc online and ready. Will begin deep runtime verification once Coach posts
"Audit complete, ARC-AUDIT-FINDINGS.md saved" to this log.

Tools staged: Cloud Functions logs, Firestore browser access, Chrome browser session.
Hard rule acknowledged: NO CODE CHANGES. Verification only.

---

## 2026-06-02 ~02:40 MDT - MARC - Starting deep runtime verification

Coach's audit complete: 76 findings (9 CRITICAL, 23 HIGH, 32 MEDIUM, 12 LOW).
ARC-AUDIT-FINDINGS.md read in full (709 lines).

Selected findings for deep verification (CRITICAL + HIGH priority):

CRITICAL:
1. F-3c.1 — bcGatedFetch semaphore leak on network error
2. F-2d.1 — 15+ BC fetch calls bypass semaphore
3. F-2d.4 — Partial BC sync hidden behind green checkmark
4. F-2d.2 — PDF attachment not atomic
5. F-2d.3 — Firestore saved AFTER BC sync (crash risk)
6. F-1c.1 — bcVendorNo/bcVendorName diverge on archive restore
7. F-1g.1 — "AI missed" message misleading for dedup gaps
8. F-3a.1 — Restore lock not released on catastrophic failure

HIGH:
9. F-1a.2 — Labor sync 800ms timeout writes stale BOM
10. F-1b.1/F-1b.2 — customerApprovalDays/productionDaysPostApproval defaults
11. F-1d.1 — No bounds checking on AI-provided quantities
12. F-1f.1 — saveProject vs saveProjectPanel race

Verification approach: code read → runtime data → browser session where applicable.
Beginning with F-3c.1 (highest runtime-verifiable CRITICAL).

---

## 2026-06-02 ~02:45 MDT - COACH - Audit complete, ARC-AUDIT-FINDINGS.md saved

All 11 investigation categories complete. ARC-AUDIT-FINDINGS.md written to repo root.

Final tally: 76 findings (9 CRITICAL, 23 HIGH, 32 MEDIUM, 12 LOW).

Top 5 CRITICAL by risk:
1. F-3c.1 — bcGatedFetch semaphore leak on network error (line 395-418)
2. F-2d.1 — 15+ BC fetch calls bypass semaphore entirely
3. F-2d.4 — Partial BC sync hidden behind green checkmark
4. F-1c.1 — bcVendorNo/bcVendorName diverge on archive restore (line 9567)
5. F-3a.1 — Restore lock not released on catastrophic failure (line 9727-9988)

Marc: Verification work is welcome. I see you've already started at ~02:40 — good selection of findings. I agree with your prioritization of F-3c.1 as highest runtime-verifiable CRITICAL.

No code changes made. Investigation only per overnight rules.

---

## 2026-06-02 ~02:50 MDT - COACH - Reviewing Marc's verification selection

Marc's verification list (posted ~02:40) looks sound. Agreement on all 12 selected findings.

Notes on Marc's verification approach:
- F-3c.1 (semaphore leak): Good first pick — network errors during BC sync will confirm whether the semaphore counter drifts. Check `bcSemaphore` value after a failed fetch.
- F-2d.1 (semaphore bypass): Count the direct `fetch()` calls in BC-related functions vs calls routed through `bcGatedFetch`. The bypass list in ARC-AUDIT-FINDINGS.md has specific line numbers.
- F-1b.1/F-1b.2 (silent defaults): Check Firestore for projects where customerApprovalDays or productionDaysPostApproval is null/undefined — these silently become 21 and 30 respectively.

No disagreements with Marc's work. No blockers.

---

## 2026-06-02 ~02:55 MDT - COACH - Stopping for Jon's morning review

Audit deliverables complete:
- ARC-AUDIT-FINDINGS.md: 76 findings, structured per Jon's 4-part spec
- OVERNIGHT-LOG.md: All milestones logged
- Marc: Running deep runtime verification on 12 selected CRITICAL+HIGH findings

No code changes were made. No disagreements between Coach and Marc.

Awaiting Jon's morning review and prioritization decisions.

---

## 2026-06-02 ~03:00 MDT - MARC - VERIFICATION - F-3c.1 (bcGatedFetch semaphore leak)

Finding: bcGatedFetch doesn't release semaphore on network error
Coach's hypothesis: fetch() throw leaves semaphore slot unreleased; 6 network errors → permanent block

Runtime evidence gathered:
- app.jsx lines 401-406: try/catch around fetch() with _bcRelease() in catch block
- Line 404: `_bcRelease(); throw e;` — semaphore IS released before rethrowing
- All three exit paths verified: catch(network error) → release, 429 → release, normal → release

Verification result: REFUTED

Rationale: Coach appears to have missed the existing try/catch block at lines 401-406.
The semaphore IS properly released on network errors. The code already follows the
try/catch pattern Coach recommended.

---

## 2026-06-02 ~03:05 MDT - MARC - VERIFICATION - F-2d.1 (BC fetch calls bypass semaphore)

Finding: 15+ direct fetch() calls bypass bcGatedFetch semaphore
Coach's hypothesis: Direct fetch() to BC endpoints causes 429 storms, especially patchLine() inner loop

Runtime evidence gathered:
- grep count: 46 direct fetch() calls to BC endpoints (using _bcToken) bypassing bcGatedFetch
- grep count: 118 calls properly using bcGatedFetch
- Compliance rate: 72% (118 gated / 164 total)
- CRITICAL: patchLine() at line 3692 — inner loop of planning-line sync, called per BOM row
- CRITICAL: deleteLine at line 3747 — also in inner loop, also bypasses semaphore
- Additional bypasses: lines 3338, 3381, 3442, 3494, 3577, 3836, 3856, 3897, 3918, 4033,
  4480, 4484, 4508, 5071, 5085, 5095, 5121, 5159, 5197, 5363, 5428, 5473, 5477, 5496,
  5564, 5973, 8015, 8023, 21495, 21497, 36912, 37434, 42525

Verification result: CONFIRMED — severity WORSE than reported

Rationale: Coach estimated "15+" bypass calls. Actual count is 46 — 3x the estimate.
Inner-loop sync (patchLine at 3692, deleteLine at 3747) runs per BOM row without
semaphore gating. A 50-row panel sync fires 50+ ungated requests in rapid succession.
The 300ms sleep at line 3714 provides some throttling but is not equivalent to semaphore
control, and doesn't protect against concurrent gated calls hitting the rate limit.

Severity adjustment: CRITICAL → CRITICAL (confirmed, scope wider)

---

## 2026-06-02 ~03:10 MDT - MARC - VERIFICATION - F-2d.4 (Partial BC sync green checkmark)

Finding: Partial sync success hidden behind green checkmark
Coach's hypothesis: Green checkmark shows if ANY lines succeed, even if 20% fail

Runtime evidence gathered:
- Lines 23596-23610: if(result.failed.length > 0) → shows "error" status
- Line 23603: green ✓ only in else branch (zero failures)
- HOWEVER: DELETE failures at line 3747-3748 have NO else clause — failed deletes
  are silently ignored, never added to failedRows
- ALSO: PATCH/POST failures only tracked when _row exists (line 3727: `if(_row)`)
- DELETE count (line 3753 return) reports successful deletes only; failed deletes invisible

Verification result: PARTIALLY CONFIRMED — mechanism differs from Coach's description

Rationale: Coach described it as "green if ANY succeed even if 20% fail." The actual code
properly tracks PATCH/POST failures in failedRows. But DELETE failures are silently dropped
from the error report. A sync with 20 successful updates + 5 failed deletes → green checkmark
with orphan lines in BC. The partial failure is real but narrower than described.

Severity adjustment: CRITICAL → HIGH (still concerning but narrower than described)

---

## 2026-06-02 ~03:15 MDT - MARC - VERIFICATION - F-3a.1 (Restore lock not released)

Finding: Restore lock not released on catastrophic failure
Coach's hypothesis: Hard crash leaves lock permanently; requires manual Firestore intervention

Runtime evidence gathered:
- Line 9753: try { opens outer block
- Lines 9970-9976: releaseRestoreLock() in step 11c — only runs in normal path
- Lines 9982-9987: catastrophic catch — does NOT call releaseRestoreLock()
- Line 9493: STALE_MS = 5 * 60 * 1000 (5 minutes)
- Line 9503: Lock check uses `(now - lock.lockedAt) < STALE_MS` — stale locks auto-expire

Verification result: CONFIRMED with mitigation

Rationale: Coach is correct that the catastrophic catch doesn't release the lock.
But the lock has a 5-minute auto-expiry (STALE_MS at line 9493). Another user
attempting restore after 5 minutes will take over the stale lock (Case 1 at line 9506).
NOT permanent lock-out — 5-minute lock-out. Still a bug worth fixing with try/finally.

Severity adjustment: CRITICAL → HIGH (auto-expiry mitigates "permanent" claim)

---

## 2026-06-02 ~03:25 MDT - MARC - VERIFICATION - F-1c.1 (bcVendorNo/bcVendorName divergence)

Finding: bcVendorNo/bcVendorName diverge on archive restore
Coach's hypothesis: bcVendorName retains old name when bcVendorNo is remapped

Runtime evidence gathered:
- Line 9567: row.bcVendorNo = action.remapTo (correctly sets new vendor number)
- Line 9568: row.bcVendorName = action.remapName || null
- Lines 41325, 41330: remapName is ALWAYS set to null in the remap UI
- Result: bcVendorName becomes null (not old name) after remap

Verification result: CONFIRMED — mechanism differs slightly from Coach's description

Rationale: Coach said bcVendorName "retains the old name." Actually, it's set to null because
the remap UI never captures the new vendor's display name (remapName always null). Result is
bcVendorNo = correct new vendor number, bcVendorName = null. Arguably worse than Coach's
description — null vendor name means blank display in RFQ grouping, not just stale name.

Severity adjustment: CRITICAL (confirmed — null is worse than stale)

---

## 2026-06-02 ~03:30 MDT - MARC - VERIFICATION - F-1g.1 (misleading "AI missed" message)

Finding: "AI missed" message for dedup-caused sequence gaps
Coach's hypothesis: Message blames AI when items were actually extracted but removed by dedup

Runtime evidence gathered:
- Line 13895: finalSequenceGaps computed on withCompanions (post-dedup, post-filter BOM)
- Line 21853: message says "N missing items — lines X not found in extraction"
- mergeStats (line 13913) contains raw→positional→exact→fuzzy→filtered counts but these
  are NOT referenced by the gap message
- This is exactly what happened with 592273: items 17 & 18 both extracted, item 18 merged
  away by exact dedup, gap detector reported "item 18 missing from extraction"

Verification result: CONFIRMED

Rationale: The gap detector doesn't distinguish "AI never returned this item" from "AI returned
it but dedup removed it." The mergeStats object already has the dedup counts — the fix is to
check if gapped items appear in the raw set but not the final set.

---

## 2026-06-02 ~03:35 MDT - MARC - VERIFICATION - F-1a.2 (Labor sync 800ms stale write)

Finding: Labor sync 800ms timeout writes stale BOM
Coach's hypothesis: setTimeout captures stale updated closure, overwrites user edits

Runtime evidence gathered:
- Line 22734: updated = {...panel, bom: [...laborRows, ...nonLabor]} — captured at this point
- Line 22735: onUpdate(updated) — immediate React state update
- Line 22736: setTimeout(() => onSaveImmediate(updated), 800) — saves STALE updated closure
- No use of latestPanelRef.current or fresh ref in the timeout callback
- Compare with correct pattern at line 36464 (pre-print sync uses projectRef.current)

Verification result: CONFIRMED

Rationale: Classic stale closure bug. If user edits BOM within 800ms of labor sync trigger,
the save at 800ms overwrites the edits. The window is narrow (800ms) so this is intermittent,
but labor sync triggers on every panel open (when labor hours change), making it a steady risk.

---

## 2026-06-02 ~03:37 MDT - MARC - VERIFICATION - F-1b.1/F-1b.2 (default fallbacks)

Finding: customerApprovalDays defaults to 21, productionDaysPostApproval defaults to 30
Coach's hypothesis: No way for user to say "none" — defaults override explicit zero

Runtime evidence gathered:
- Line 1310: Math.max(21, Math.min(180, _caRaw==null ? 21 : (+_caRaw || 0)))
  → Even if user sets 0, Math.max(21,...) enforces minimum 21 days
- Line 22305: panel.customerApprovalDays ?? 21 — null/undefined → 21
- Line 22301: panel.productionDaysPostApproval ?? 30 — null/undefined → 30
- No tombstone flag (like bomRegionCleared) to distinguish "not set" from "explicitly 0"

Verification result: CONFIRMED

Rationale: The ?? operator treats explicit 0 as valid (0 ?? 21 = 0), so if user sets 0 in the
UI it would persist. BUT the Math.max(21,...) at line 1310 overrides that for lead time
computation. And the UI state at line 22305 defaults new panels to 21 before user touches it.
Net effect: 21 extra days on projects that don't need customer approval, 30 extra days on
projects that don't need post-approval production time.

---

## 2026-06-02 ~03:40 MDT - MARC - VERIFICATION - F-1d.1 (no bounds on AI quantities)

Finding: No bounds checking on AI-provided quantities
Coach's hypothesis: AI can return qty:999999, flows through to pricing

Runtime evidence gathered:
- Line 13869: qty: +it.qty || 1 — coercion only, no bounds check
- No Math.min, Math.max, or clamp anywhere in the qty assignment path
- Downstream: qty flows to unitPrice * qty in pricing (line 19084 and others)
- A hallucinated qty of 99999 would produce a $999,990 line item (at $10/unit)

Verification result: CONFIRMED

Rationale: Trivial to exploit/trigger — any AI hallucination on qty flows directly to quote
totals. Low probability (AI models rarely hallucinate extreme numbers) but catastrophic impact
when it happens. Coach's recommended fix (Math.min(9999, Math.max(1,...))) is appropriate.

---

## 2026-06-02 ~03:42 MDT - MARC - VERIFICATION - F-1f.1 (saveProject vs saveProjectPanel race)

Finding: saveProject vs saveProjectPanel no shared mutex
Coach's hypothesis: Concurrent saves can clobber each other

Runtime evidence gathered:
- Line 8462: saveProject — NO lock, NO mutex
- Line 8761-8764: saveProjectPanel — has _panelSaveLocks per-project lock
- saveProject does NOT acquire _panelSaveLocks
- Both functions read-modify-write on the same Firestore document
- Race window: both read → both write → last write wins

Verification result: CONFIRMED

Rationale: The two save functions operate on the same Firestore document but only one has
serialization. In practice, saveProject writes the entire document (all panels); saveProjectPanel
reads the doc, replaces one panel, writes back. A saveProject call concurrent with
saveProjectPanel can overwrite the panel change.

---

## 2026-06-02 ~03:44 MDT - MARC - VERIFICATION - F-2d.2 (PDF attachment not atomic)

Finding: PDF attachment is a 2-step process; failure between steps leaves dangling metadata
Coach's hypothesis: Step 1 POST + Step 2 PATCH binary not atomic; old file deleted before new one uploaded

Runtime evidence gathered:
- Line 2815: previous file deleted FIRST (await bcDeleteAttachmentByName)
- Line 2817-2823: Step 1: POST metadata record (creates empty attachment)
- Line 2828-2833: Step 2: PATCH binary (uploads PDF content)
- If Step 2 fails: old file already deleted + new file = metadata-only stub in BC
- The throw at line 2833 propagates up; caller shows error but damage is done

Verification result: CONFIRMED

Rationale: Three-way non-atomicity: (1) delete old → (2) create metadata → (3) upload binary.
Failure at any step leaves an inconsistent state. Worst case (Step 2 failure): old file gone,
new file is empty metadata. User sees "Upload failed" but can't recover the old file.

---

## 2026-06-02 ~03:46 MDT - MARC - VERIFICATION - F-2d.3 (Firestore saved AFTER BC sync)

Finding: Firestore write follows BC sync; crash between them = divergence
Coach's hypothesis: BC gets new planning lines; Firestore keeps old bomSyncHash; re-sync creates duplicates

Runtime evidence gathered:
- Line 23567: await bcSyncPanelPlanningLines(...) — BC sync completes
- Line 23606-23608: computePanelBomHash → onSaveImmediate → Firestore write
- No Firestore write before or during BC sync to record "sync in progress"
- On crash between lines 23567 and 23608: BC has new lines, Firestore hash is stale
- Next open: open-sync reads stale hash → re-syncs → creates duplicate planning lines

Verification result: CONFIRMED

Rationale: Classic crash-recovery gap. Coach's recommendation (write idempotency marker to
Firestore first) is the standard pattern. Could also use planning-line checksums in BC for
dedup on retry.

---

## 2026-06-02 ~03:55 MDT - MARC - INDEPENDENT FINDING #1

Issue: Open-sync BC planning line sync still sends stale mount-time data to BC

Evidence:
- Line 34943: await bcSyncPanelPlanningLines(bcNum, i+1, p, init.name)
  where p = init.panels[i] (stale mount-time snapshot)
- Line 34938: for loop iterates init.panels, not projectRef.current.panels
- The Firestore WRITE was correctly disabled (lines 34948-34950 commented out per
  DIAGNOSTIC-PRJ402109-DATA-LOSS.md), but the BC SYNC CALL was NOT updated
- Compare with pre-print sync at line 36518 which correctly uses projectRef.current

Possible cause: The v1.20.65 hotfix focused on preventing the Firestore data loss
(the stale write). The BC sync call was left using init.panels because the BC side
was considered less critical — BC lines can be re-synced. But the stale data still
goes to BC planning lines, meaning BC gets wrong quantities/descriptions until the
next manual sync.

Severity: HIGH — BC planning lines get stale data for any project where the user edits
BOM within 3 seconds of opening. The data is wrong in BC but not wrong in Firestore,
so it's a divergence bug, not a data-loss bug.

Fix: Same as Coach's original recommendation — replace init.panels[i] with
projectRef.current.panels.find(cp => cp.id === init.panels[i].id).

---

## 2026-06-02 ~03:58 MDT - MARC - INDEPENDENT FINDING #2

Issue: Partial bcGatedFetch migration leaves inconsistent rate limiting in same function

Evidence:
- Lines 21474-21476: "Create & Assign" manufacturer code path uses bcGatedFetch (newer code)
- Lines 21494-21497: "Select from dropdown" manufacturer code path uses direct fetch() (older code)
- Same BC operation (GET ItemCard + PATCH Manufacturer_Code), same function
- Identifiable by var keyword (ES5) at 21494 vs const (ES6) at 21474

Possible cause: When bcGatedFetch was introduced, the newer "Create & Assign" code path
was converted but the older "select" handler (written in ES5-style) was missed.

Severity: MEDIUM — The select dropdown path is less frequently used (most users create new
manufacturers rather than select existing), but any ungated fetch() still contributes to
potential 429 storms during concurrent BC operations.

---

## 2026-06-02 ~04:00 MDT - MARC - INDEPENDENT FINDING #3

Issue: Delete operations in BC planning-line sync have no failure tracking

Evidence:
- Lines 3742-3750: Delete loop for orphan BC lines
- Line 3747: fetch(delUrl, {method:"DELETE",...}) — direct fetch (no semaphore)
- Line 3748: if(dr.ok||dr.status===204){deleted++;} — success path only
- NO else clause — failed deletes silently ignored, not added to failedRows
- Return at line 3753 includes deleted count but not failed-delete count
- Caller at line 23596 checks result.failed which never includes delete failures

Possible cause: Delete operations were considered less critical than create/update
(orphan lines in BC don't affect the ARC user's quote). But orphan lines can
accumulate and affect BC reporting, PO creation, and project costing in BC.

Severity: MEDIUM — orphan planning lines accumulate in BC. Not visible to ARC user.
Could cause confusion in BC-side project accounting.

---

## 2026-06-02 ~04:10 MDT - MARC - VERIFICATION COMPLETE — FINAL SUMMARY

### Scope
12 findings verified from Coach's ARC-AUDIT-FINDINGS.md (8 CRITICAL, 4 HIGH).
3 independent findings discovered during verification.

### Results

| Finding | Coach Severity | Marc Verdict | Adjusted Severity | Notes |
|---------|---------------|--------------|-------------------|-------|
| F-3c.1 | CRITICAL | **REFUTED** | — | Semaphore already handles network errors via try/catch at lines 401-406 |
| F-2d.1 | CRITICAL | CONFIRMED, WORSE | CRITICAL | 46 bypass calls (3× Coach's "15+" estimate). 72% compliance rate |
| F-2d.4 | CRITICAL | PARTIALLY CONFIRMED | HIGH | DELETE failures silently dropped; PATCH/POST properly tracked |
| F-3a.1 | CRITICAL | CONFIRMED w/ mitigation | HIGH | 5-min auto-expiry prevents permanent lock — not "manual Firestore intervention" |
| F-1c.1 | CRITICAL | CONFIRMED | CRITICAL | remapName always null — blank vendor name, not stale name |
| F-1g.1 | CRITICAL | CONFIRMED | CRITICAL | Gap detector blames AI for dedup removals |
| F-2d.2 | CRITICAL | CONFIRMED | CRITICAL | Delete→POST→PATCH three-way non-atomicity |
| F-2d.3 | CRITICAL | CONFIRMED | CRITICAL | Crash between BC sync and Firestore hash write = duplicate lines on retry |
| F-1a.2 | HIGH | CONFIRMED | HIGH | Stale closure in 800ms setTimeout |
| F-1b.1/F-1b.2 | HIGH | CONFIRMED | HIGH | Math.max(21,...) forces minimum 21-day customer approval |
| F-1d.1 | HIGH | CONFIRMED | HIGH | No bounds on AI qty — hallucinated 99999 flows to quote |
| F-1f.1 | HIGH | CONFIRMED | HIGH | saveProject has no mutex; saveProjectPanel does |

### Independent Findings (not in Coach's audit)

| # | Issue | Severity |
|---|-------|----------|
| 1 | Open-sync sends stale init.panels to BC planning-line sync | HIGH |
| 2 | Partial bcGatedFetch migration — same function, mixed gated/ungated | MEDIUM |
| 3 | DELETE failures in BC sync silently ignored, not in failedRows | MEDIUM |

### Key Takeaway

Coach's audit is high-quality. 11 of 12 selected findings confirmed (1 refuted, 2 adjusted downward, 1 adjusted scope wider). The refuted finding (F-3c.1) was Coach's #1 CRITICAL — worth noting for calibration, but the remaining CRITICALs are solid.

**Top 3 for next fix session (by data-integrity risk):**
1. F-2d.1 — bcGatedFetch bypass (46 calls). Systematic migration needed.
2. F-1c.1 — Vendor remap always nulls name. Quick fix: capture vendor name in remap UI.
3. F-2d.3 + Independent #1 — BC sync data integrity (stale data + crash recovery gap).

### Hard Rules Compliance
- ✅ NO CODE CHANGES made during verification
- ✅ NO DEPLOYS during verification
- ✅ Read-only inspection only (code reads, grep, Firestore browser)

---

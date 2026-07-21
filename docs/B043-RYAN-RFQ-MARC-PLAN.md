# B043 — Build-Ready Plan (Marc, SCOPE lane) · 2026-07-21

## RFQ send: surface blank-email vendors + guarantee sender feedback

**Target file (all changes):** `src/app.jsx` — component `RfqEmailModal` (`:19761`). No Cloud Function, no other file. All anchors verified against current code (no drift from the Coach trace in `docs/B043-RYAN-RFQ-COACH-TRACE.md`).

Key anchors: `bcGetVendorEmail`→`""` w/o `_bcToken` `:6282`; modal init/config-override/BC-contacts fill `:19762`/`:19785`/`:19806`; `sendAll()` `:19831`; `hasEmailVendors`+token acquire `:19834`; **silent blank-skip `:19891-19896`**; **confirmation gate `:20053-20068`** (`sentVendors` `:20054`, gate `:20057`, `failedVendors` built-but-never-rendered `:20062`); modal fragment `:20076`/`:20190`, per-vendor row IIFE `:20120`, footer `:20182`.

---

### Change 1 — Surface blank-email vendors (per-vendor marker + pre-send summary)
- **1a. Derived state** (before `return` ~`:20073`): `_blankIncluded` = included, non-API vendors whose `_normalizeEmails(emails[name])` is empty; `_emailVendorCount` = included non-API total. Recomputes each render → live as user types/toggles.
- **1b. Per-vendor marker** (in the `isOn && !api` block ~`:20126`): amber "⚠ No email on file" under the textarea when blank + not loading, **branching on `_bcToken`** for the message ("no email in BC" vs "BC not connected, couldn't auto-fill"). This is also the cheap slice of Coach's Change 3 (BC-vs-no-email distinction).
- **1c. Pre-send banner** (above button row ~`:20181`): "⚠ N of M suppliers have no email address — they will NOT be sent an RFQ: <names>". Amber palette matching the existing RFQ-sent chip.
- **Recommendation: warn-and-continue, no hard-block, no auto-uncheck** (per "no nag-modals for known behavior"). Good vendors still send; blanks visibly flagged before + after.

### Change 2 — Fire sender feedback even on a zero-sent run
- **2a. In-app done-summary (primary, guaranteed-visible)** — footer `:20182`: replace the "✓ All RFQs sent!"-only conditional with sent/failed counts → "✓ K sent · ⚠ M not sent (no email address)" and, when 0 sent, "⚠ 0 RFQs sent — no supplier had an email address on file". Independent of MS365 email delivery.
- **2b. Adapt the Graph confirmation-email gate (secondary, best-effort)** `:20053-20068`: hoist `failedVendors`; widen gate to `(anySent || failedVendors.length>0) && graphToken && fromEmail`; when `!anySent` change subject to "RFQ NOT SENT — no supplier emails on file …" and prepend a red banner into the confirm HTML (the `failedVendors` "✗ Failed" rows block already exists, just never fired). `anySent≥1` path byte-preserved.

### Change 3 — Recipient-resolution robustness (cheap slice only)
Saved-config fallback (`_readSupplierConfig(uid,"vendorEmails")` `:19785`) is already exercised on mount + overrides BC. The real gap = silent undifferentiated blank → covered by 1b's BC-vs-no-email marker. No further BC plumbing (deliberately not over-built).

### Change 4 — Observability (Debug Log on blank recipient)
At the blank-skip `:19892`: guarded `window.logDebugEntry({severity:"warn", source:"rfqSend", message:"Vendor <name> resolved to a blank recipient — RFQ not sent", extra:{vendorName,vendorNo,bcConnected:!!_bcToken,projectId,projectName}})`. Optional summary entry in the zero-sent branch. Makes it self-diagnosing (`companies/{cid}/debugLogs`).

---

### Data-retention / safety
- No Firestore field removed/renamed. `rfq_history` shape **reused unchanged** (blanks already write `{vendorEmail:"", sent:false, skipped:false, error:"No email address"}` `:19894`; confirmation change only *reads* `historyEntries`).
- `rfqUploads` token creation already gated on non-blank email `:19872` → no orphan tokens.
- `vendorEmails` remember-checkbox logic untouched.
- **Not money-path / not save-path** — notification/UI only. **LOW risk.**

### JSX correctness
Modal already returns `<>…</>` `:20076`/`:20190`. Every new element is a child inside an existing container — no new root, no second top-level sibling. 1b/1c/2a use `&&`/IIFE each returning a single node. No fragment risk.

### Test plan
| # | Scenario | Expected | Live send? |
|---|----------|----------|-----------|
| T1 | All-blank (Ryan repro) | banner "N of N"; per-row amber marker; footer "⚠ 0 RFQs sent"; confirm email (if signed in) "RFQ NOT SENT"; all `rfq_history sent:false`; warn Debug Log per vendor | Jon-driven |
| T2 | Partial-blank | good send; blanks flagged; footer "✓ K sent · ⚠ M not sent"; confirmation still fires | Jon-driven |
| T3 | All-good (regression) | no banner/markers; unchanged "✓ All RFQs sent!"; confirmation identical | Jon-driven |
| T4 | BC disconnected | marker flips to "BC not connected…"; saved-config vendors still send | code check + 1 live |
| T5 | Derived-state/render | `_blankIncluded` recomputes live; `node validate_jsx.js` passes | code check |

### Risk + estimate
- **LOW–MED**; ~50–70 LOC across 4 sites, all in `RfqEmailModal`. Only reachy change = widening the confirmation gate (2b), mitigated by byte-preserving the `anySent` path.
- **★ OPEN DECISION for Jon (gates build): hard-block vs warn-and-continue on blank-email vendors.** Marc recommends **warn-and-continue** (clear marker + banner + guaranteed in-app outcome). Hard-block variant = add `disabled={_blankIncluded.length>0}` on Send `:20185` + a "resolve or uncheck" hint (~3-line delta).

*Plan only — no files edited. Build gated on Jon's go + the block-vs-warn ruling.*

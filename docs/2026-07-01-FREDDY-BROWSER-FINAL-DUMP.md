# Freddy browser-session FINAL dump — 2026-07-01 (inheritance for CCD-Freddy)

**Captured by Marc at close-out.** This is the last browser-Freddy session's only-in-chat state,
committed verbatim so it survives the browser→CCD migration (browser chat state does not carry over;
only the repo does). The highest-value operational nuances are also folded into SESSION-STATE.md
(⭐ NEXT UP) and TODO.md (#193/#197). Verbatim record follows.

---

## 1. ROUTING STATE (at close)
- Marc: FREE. Last delivered #193 (v1.21.23). No open request. Committed queue: #188 validate-at-push
  BUILD (plan approved, ready) → #196 Receive-PO overlay TRACE.
- Coach: IDLE (empty queue). Only remaining Coach task = #192 regression FIX PLAN, BLOCKED on the
  instrumentation evidence (Noah's repro). Nothing unblocked for him.
- Nothing mid-route at close; nothing staged-but-unsent except the queues above.
- Terminal-Freddy comms window was a COMMS TEST only — NOT routing (one-live-analyst preserved;
  browser-Freddy remained analyst of record through close).

## 2. PARKED ITEMS (reason + resume trigger)
- #192 real fix — PARKED pending instrumentation capture. Mechanism strong-inferred, NOT observed;
  chose instrument-first. RESUME: Noah's repro produces a [#192 REVERT-FIRE] log line (its appearance
  alone confirms the transient).
- #193 verify (Jon eyeball + Coach verify) — PARKED (Jon at daily limit). RESUME: next session before closing #193.
- #191 send-flow live eyeball — PARKED as "Noah confirms in normal use" (backstop, NOT a gate). #191 otherwise closed.
- #197 — PARKED build-ready; anchor decided. RESUME: Coach reads lead-time formula → Freddy Brief.
- #196 / #190 / #194 / #195 — banked, no active trigger; pull when higher items clear.

## 3. UNWRITTEN DECISIONS / RATIONALE
- #192 FIX DIRECTION: guards are logically correct but act on a TRANSIENT fire-time read. Fix = do NOT
  auto-revert on initial-open / background-reprice re-fire; only on a genuine USER-DRIVEN red→clean
  transition, OR require the clean state to be STABLE (re-check after settle) before prompting. Robust
  REGARDLESS of the exact transient source (stops trusting a single fire-time read).
- #188 TWO-TIER + KNOWN LIMITATION: Tier1 = bcGetVendorName on unique cached numbers (cached=FREE);
  Tier2 = live bcGetItemVendorNo re-resolve ONLY on dead-vendor rows, deduped by item; self-heals via
  resolvedExtra. DECLINED (documented): does NOT catch renumber-to-a-DIFFERENT-LIVE-vendor (cached name
  still resolves → passes Tier1 silently); catching it needs per-row live compare = worsens #184
  throttling; Jon accepted the gap. REVISIT only if a silent wrong-but-valid vendor is observed. V00102
  is a RENUMBER (V00102→V00111), not a true phantom. Open non-blocker: BC-admin confirm SMCUSA history.
- #197 ANCHOR: estimated ship date = PO RECEIVED date + lead time (the lead-time clock starts at ORDER
  PLACEMENT, not quote date). Deeper finding: ARC does NOT currently compute a calendar ship date at all
  — only a lead-time DURATION (days); #197 must CREATE the date calc. PO date is MANUALLY ENTERED in the
  Receive PO modal (structured → auto-compare feasible). On mismatch: OA message "PO date ≠ Quoted Ship
  Date, Quoted applies" + request updated PO.
- #193 VERIFY EXPECTATIONS ("pass"): modal opens defaulting to 📩 Send To Sales; recipient pre-filled
  with logged-in user's OWN email, editable; tab-switch swaps recipient (Sales↔customer via stashed
  _customerTo); a sales-send is a REAL send (locks, #187 stamps, #191 quote #, writes quote_send to
  qvHistory[]). Amendments honored: (A) tab-switch RESETS `to` to tab default (hand-typed edits do NOT
  survive a switch — intended); (B) change #8 SKIPPED (no log on the dead inline-send path).
- #191 SUBJECT-RECOMPUTE: folded IN. After ensureQuoteNumber assigns on send, subject recomputed so a
  numberless-at-open quote never emails as "Quote Quote."
- #193 QUIRK (accepted, NOT a bug): on a Send-To-Sales, the message body may still read "Dear [customer]"
  though it goes to the sales user. Fine — user forwards/saves. Not worth fixing.
- #195: Print-as-Firm (_skipBudgFlip=true) still pushes the "auto-flagged BUDGETARY" checklist entry.
  Pre-existing since v1.19.1028, cosmetic, NOT introduced by #192.
- INFRA (not a bug): mid-session prod outage = Fastly Denver POP (DEN) edge timeout. Origin healthy,
  config clean. Confirm-and-wait, never redeploy for a CDN edge failure.

## 4. QUEUE VIEW (Freddy's ranking + dependencies)
1. #192 regression — #1, but GATED on Noah's repro capture (not team-actionable until then).
2. #188 validate-at-push BUILD — top UNBLOCKED, team-actionable. If #192 evidence hasn't landed, START
   HERE (Marc builds from approved plan).
3. #193 verify (Jon + Coach).  4. #196 Receive-PO overlay trace.  5. #197 (Coach lead-time formula → Brief).
6. #190 Save Defaults relabel (Coach confirm).  7. #194 metrics (scope when ready).  8. #195 cosmetic.
NUANCE: #192 is #1 but evidence-blocked → the first TEAM action next session is likely #188 build. Run
#188 in PARALLEL while waiting on the #192 capture; don't let #192's #1 priority idle Marc.

## 5. ONLY-IN-CHAT INHERITANCE FOR CCD-FREDDY
- Routing discipline that paid off: single-open-request per person; resolve-questions-then-generate-once
  (paste discipline); confirm who's actually free before routing (ASK, don't assume — Jon corrected
  "already sent"/"still working" several times).
- Jon relays between instances; when Jon says a paste "wasn't sent," treat prior routing as not-yet-real
  and reconfirm state before re-routing.
- The #192 instrumentation is TEMP (tagged "#192 TEMP INSTRUMENTATION", both blocks) — STRIP after the fix.
- Meta-lesson: code-read proves POSSIBLE, runtime/rendered proves ACTIVE — for visual/timing/hydration
  bugs get the rendered/runtime truth before scoping (underlies FREDDY.md lessons #1/#2).
- CCD-Freddy's FIRST operational task: establish the CCD startup mechanics WITH MARC (how Freddy launches,
  how Coach/Marc outputs reach Freddy, whether repo-read replaces paste-relay). The one TBD in FREDDY.md.

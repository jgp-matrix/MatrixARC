# Session State — 2026-06-30 MDT (#165A / #181 / #183 shipped+verified · #182 fix deployed, T3 pending)

## Version
**v1.21.11** (deployed 2026-06-30, PRODUCTION). Four patch bumps this session over v1.21.7:
- v1.21.8 = #165(A) reconciliation verb relabel (built, pending Jon eyeball)
- v1.21.9 = #181 manual-line title data-loss fix (RESOLVED)
- v1.21.10 = #183 RFQ email recipient infinite-loop freeze fix (RESOLVED)
- v1.21.11 = #182 Item Vendor 3-part-key PATCH fix (RESOLVED-PENDING-T3)

## Deploy State
- **Master tip:** `5cc930fe` ("Close-out TODO updates…"). Latest code/deploy: `7cf55a82` (#182) → release v1.21.11.
- **`master == origin/master`** (in sync). No feature branches.
- Production hosting: **https://matrix-arc.web.app** serving v1.21.11.
- **ROLLBACK POINT for #182:** if T3 shows the collision persists, roll back v1.21.11 (`git revert 7cf55a82`-era app.jsx change to `bcUpsertItemVendorLeadTime`) and redeploy. Recent lineage:
  v1.21.11=#182 · v1.21.10=#183 · v1.21.9=#181 · v1.21.8=#165A · v1.21.7=#180.

## ⭐ NEXT SESSION — FIRST TASK: #182 T3 verify
**Push to BC on PRJ402124 once** → confirm the "0 created / 0 updated / 32 failed" `EntityWithSameKeyExists`
alert is **GONE**. Values are locked/unchanged, so a clean no-op-200 / updates result = PASS; **still-collides
= do NOT close #182 — investigate or roll back v1.21.11.** A PATCH can 200 and no-op: if a lead-time value is
changed first, eyeball the persisted `Lead_Time_Calculation` in BC (don't trust the count alone). This closes #182.
**Then:** #159 — Copy-to-New-Quote customerless/PRJ#-less stranding (shovel-ready HIGH, ~70 lines, scoped
Coach C104 / docs/159-COPY-CUSTOMER-SCOPE.md).

## What shipped this session
- **#165(A) (v1.21.8 / `fef65fe8`) — reconciliation verb relabel.** ReconciliationModal Changed-row verbs:
  "Accept"→"Use Revision" (amber), "Reject"→"Keep Mine" (green), footer "Use All Revisions", status span +
  admin cross-strip banner wording. Resolution values unchanged. **BUILT — PENDING Jon's live eyeball at next
  reconciliation** (not fully closed). Part (B) Accept-on-crossed safety stays parked behind Coach C118.
- **#181 (v1.21.9 / `4175ecbd`) — manual-line title data-loss.** `extractionReport` gate on both v1.19.618
  PanelCard mechanisms so the stale-title cleanup fires ONLY on extraction-origin panels, never manual lines.
  Live PRESERVE-confirmed (PRJ402100 repro + PRJ402124 under fix, zero wipe). STILL-CLEANS code-reasoned +
  Coach diff-verify. **No production data loss occurred** — 124/126 confirmed retained. RESOLVED.
- **#183 (v1.21.10 / `5043fd1c`) — RFQ email recipient infinite-loop freeze.** Option A: removed the
  non-identity textarea value transform; raw newline state, normalize to "; " only at send/Firestore boundary.
  Marc 10/10 unit tests + Jon live T1/T2/T5. The "T5 regression" was correct dedup on pre-seeded fields — NOT
  a bug, NO handler edit made. RESOLVED.
- **#182 (v1.21.11 / `7cf55a82`) — Item Vendor EntityWithSameKeyExists.** Root cause: PATCH used a 2-part key
  but BC declares a 3-part key (Item_No, Vendor_No, Variant_Code) → 404 → fallthrough re-POST → 400 collision.
  Fix: 3-part PATCH key + Variant_Code in GET $select + deleted the 404→POST fallthrough. Marc code-checks pass;
  **T3 (live Push-to-BC) NOT RUN.** RESOLVED-PENDING-T3 (see NEXT SESSION above).

## New findings logged this session
- **#184 (LOW)** — push concurrency / Firestore "resource-exhausted / Write stream exhausted" under broad Push
  (per-row bcLeadTimeWrites audit @~4508 + concurrent bcPatch bursts). Adjacent to #182, NOT causal. Candidate.
- **#185 (LOW)** — Send RFQ Contacts dropdown looks inert (saved defaults seed all of a vendor's contacts, so
  the dropdown offers only already-present ones → correct dedup → nothing). + data artifact: InterMtn saved
  default stores a duplicate email. UX papercut + cleanup candidate, not a defect.

## Parked / dispositions
- **RFQ-breadth (under #175) — DISSOLVED** (Jon, 2026-06-30). `_eligibilityReason` LEFT UNTOUCHED. TODO #175.
- **#58/C15 — re-scoped CRITICAL→MEDIUM** (Freddy). 5/7 H10 parts closed; REMAINING: Part 2 (persist the
  computed extractionVerification result, ~1 line), Part 4 (L3 retry/gap-fill on re-extract), Part 7 (shared
  L3 function). Next-session candidate.
- **#176 / #177** — LOW, unchanged (DIN/duct cosmetic over-flag; denylist fail-open hazard).

## Coach-owned items outstanding (flagged at close-out — carry forward)
- **C118** — #165 detector-diff verification (`git show 65d898e8 -- src/app.jsx` vs C117 scope). Still open;
  gates #165 Part (B). Also gate-B wording fix in `docs/175-DETAILED-PLAN.md` (T11 grep criterion).
- **COACH.md** — verify tail reflects this session (Marc doesn't write COACH.md; flag only).

## Session infrastructure lessons
- **Controlled-tab instability:** heavy in-page JS (recursive React-fiber scans, large JSON.stringify dumps)
  FREEZES/kills the Claude-in-Chrome tab. Keep probes lightweight (small DOM queries, bounded returns). Reading
  Firestore/company data: capture companyId via a lightweight `firebase.firestore().collection/doc` path-logger
  patch, then read `companies/{cid}/…` directly (the app renders from the company-scoped source, NOT
  `users/{uid}/projects` — that's a legacy set; a synthetic panel staged there won't render).
- **Separate tabs share Firestore data but NOT in-memory state** — Jon's app session and Marc's controlled tab
  are distinct; durable evidence (debug logs, project docs) is readable cross-tab, live UI state is not.

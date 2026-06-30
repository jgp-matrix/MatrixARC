# Session State — 2026-06-30 MDT (RFQ portal cluster: #175/#179/#178/#180 shipped + live-verified)

## Version
**v1.21.7** (deployed 2026-06-30, PRODUCTION). Four patch bumps over v1.21.3 this session.
- v1.21.4 = #175 (RFQ lead-time visibility, FULL RED)
- v1.21.5 = #179 (supplier portal submit validation A/B/C)
- v1.21.6 = #178 (RFQ pre-fill fix cluster A/B/C)
- v1.21.7 = #180 (long-lead confirmation modal fix)

## Deploy State
- **Master tip:** `07a29ee9` ("Close out v1.21.7…"). Latest code/deploy: `5653ccfa` (#180) → release `c08e1108`.
- **`master == origin/master`** (in sync). **Tags `v1.21.5` / `v1.21.6` / `v1.21.7`** all on origin.
- Production hosting: **https://matrix-arc.web.app** serving v1.21.7.
- **ROLLBACK POINT:** `master → 0f8a61fb`, redeploy v1.20.142 (#160-era). Recent lineage:
  v1.21.7=#180 · v1.21.6=#178 · v1.21.5=#179 · v1.21.4=#175 · v1.21.3=#165.

## ⭐ NEXT SESSION — FIRST TASK: new-supplier RFQs
#178 was the last enabling piece. The pre-fill cluster (referencePrice in normal mode, firm-LT
pre-fill, email/PDF reference cells) is shipped + verified, so the new-supplier RFQ workflow can
proceed. Also surface the **parked RFQ-breadth question** (under #175) for Jon's disposition early.

## What shipped + verified this session
- **#175 (v1.21.4 / `f264dabe`) — RFQ lead-time visibility, FULL RED.** New `_hasFirmLeadTime(r)`
  single-source-of-truth predicate; both `_eligibilityReason` (RFQ) and `_isBomRowFlaggedRed`
  (row color) call it. Harness 20/20; live on PRJ402096 (AI-lead rows red, firm-lead blue,
  price-reds unchanged). RESOLVED.
- **#179 (v1.21.5 / `6036a536`) — supplier portal submit validation (A/B/C).** Per-line completeness
  replaces the global LT hard gate; shared `_isValidPrice`/`_isValidLT` drive both submit-block (§4)
  and red indicators (§3). Harness 19/19; live PRJ402111 12/12 applicable. T11 N/A. §5 asymmetry
  noted (red row can submit via global back-fill — "no red ⇒ won't block" holds, reverse doesn't,
  by design). RESOLVED.
- **#178 (v1.21.6 / `80b863c0`) — RFQ pre-fill fix cluster (A/B/C).** New `_hasPrice(r)`; auto-set
  decoupled from cooldown-masked counters (Part A bug); `referencePrice` written in ALL modes with
  real `referencePriceSource` (Part B); firm-LT pre-fill + email/PDF reference cells (Part C); §5
  merge preserves unmatched pre-fills. Harness 20/20; live PRJ402111 10/10 applicable (T4/T5
  Firestore, T6/T8 portal, T9 merge, T11/T12/T13 email+PDF). T7 N/A. RESOLVED.
- **#180 (v1.21.7 / `5653ccfa`) — long-lead modal never fired.** `onClick={handleSubmit}` passed the
  event as `bypassLongLeadCheck` (truthy) → check always skipped. Fix: `onClick={()=>handleSubmit()}`
  @48451. Live PRJ402111: fires on 70-day row, ≤60 no over-fire, Go-Back preserves values. Traced
  Coach C125. RESOLVED.

## New findings logged (LOW)
- **#176** — DIN rail/duct rows without firm LT now turn red after #175 (cosmetic over-flag, NOT a
  guarantee break; RFQ excludes them). Priority LOW pending Jon.
- **#177** — DENYLIST FAIL-OPEN: `_hasFirmLeadTime` is `!=="ai"` (denylist), so a FUTURE non-firm
  `leadTimeSource` added without updating it is silently treated as firm (under-flagging). LOW, no
  current trigger. Fix direction: allowlist of known-firm sources.

## Parked / pending
- **RFQ-breadth policy question (under #175) — RESOLVED (DISSOLVED) 2026-06-30 by Jon.** The #175
  red-row fix is sufficient; firm-priced in-cooldown rows with AI lead times stay RFQ-eligible
  (lead-time-only) and are now visible via shared `_hasFirmLeadTime`. `_eligibilityReason` LEFT
  UNTOUCHED — excluding them would ship quotes with unconfirmed AI lead times. Full rationale in
  TODO.md #175. Residue: #176/#177 (LOW, separate).

## Coach-owned items outstanding (flagged at close-out)
- **C118** — #165 detector-diff verification (`git show 65d898e8 -- src/app.jsx` vs C117 scope) STILL
  outstanding from the prior session.
- **Gate-B wording fix** in `docs/175-DETAILED-PLAN.md` — correct T11 grep-gate criterion to "exactly
  1 hit, and it's the `_hasFirmLeadTime` def" (not "0 hits").
- **COACH.md lesson** — an advisory "no-op" verdict must trace the function signature before
  dismissing a binding change (the #180 near-miss).
- **CLAUDE.md** — document the new `/compact` quick-save command (`.claude/commands/compact.md`,
  now tracked): commits uncommitted work + snapshots version/state before a context reset; distinct
  from `/team-closeout` (no deploy, no TODO, no notifications).

## Test infrastructure note
Live portal testing pattern this session: Jon sends a test RFQ to himself → Marc pulls the portal
link from Outlook (`outlook_email_search` + `read_resource`) → navigates the Claude-in-Chrome
controlled tab → Jon uploads the PDF → Marc drives the review-table tests + reads the `rfqUploads`
doc via the page's Firebase SDK (`javascript_tool`, `firebase` is global v8). Each successful submit
consumes the token (terminal). Closing the controlled tab kills the MCP tab group — navigate, don't close.

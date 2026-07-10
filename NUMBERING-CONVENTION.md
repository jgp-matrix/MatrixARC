# ARC Work Item Numbering Convention

## The rule
Every work item has ONE stable ID, assigned once, never reused, never renamed. The ID is
permanent identity; a **short title** makes it recognizable at a glance; meaning lives in a
description; stage lives in a status field. Neither the ID, title, nor description changes as the
item advances — only the status moves.

Written form:  `<PREFIX><NNN> — "<short title>" — description [Status]`
Example:       `B012 — "Quote # missing from PDF" — quote number absent on sent PDF/filename [Verified]`

## Categories (B/F/G/M) — B/F/G adopted 2026-07-02, M added 2026-07-10
New intake is classified into four categories, **each its own number sequence with its own
priority ranking**:

| Prefix | Category | Meaning |
|--------|----------|---------|
| **B###** | **Bug** | Something is broken / behaving wrong. |
| **F###** | **Feature** | New capability or enhancement request. |
| **G###** | **General** | Anything else (process, docs, infra, one-off telemetry, cleanup). |
| **M###** | **Metrics** | Usage/engagement analytics + metrics reporting (the standing analytics track; persistent, consumer-facing). Distinct from G's one-off infra/telemetry. Added 2026-07-10 (Jon directive). |

- Each category ranks independently. Jon may request **"top 5 of each"** (B/F/G/M) — display the
  ranked shortlists on request.
- Every item carries a **short identifying title** so lists are scannable.

## Allocation (single-allocator rule)
- **Freddy is the sole number allocator.** Freddy assigns the next `B###`/`F###`/`G###` in the
  relevant sequence at triage — this prevents multi-session collisions on the shared checkout.
- **Dez (Intake) captures category + title only, NOT numbers.** Dez appends to `INBOX.md`:
  `- [YYYY-MM-DD] BUG|FEAT|GEN — "<short title>" — <desc> — reported via Intake (source: ...)`.
- On a triage pass, Freddy pulls from `INBOX.md`, dedup-confirms, stamps the category number,
  promotes the item into the TODO.md tracker, and clears the Inbox bullet.

## Relationship to the legacy `#N` scheme
The unified single-integer `#N` scheme (items **#1–#198**) is **retired for new items** — B/F/G
replaces it going forward (decided 2026-07-02).

Existing `#1–#198` are handled **no-renumber, tag-open-only**:
- **Never renumbered.** `#N` stays each item's stable ID, preserving the hundreds of cross-references
  in COACH.md / TODO.md / docs. (A mass renumber would churn history — explicitly avoided.)
- **Still-OPEN items** get a **B/F/G category label + short title** added (so they participate in the
  per-group rankings). Closed/RESOLVED/STALE items are left untouched.
- Result: the tracker temporarily carries both styles — legacy `#N` (category-tagged if open) and new
  `B/F/G###` — with no renumbering. *(Retroactive tagging of open `#N` items is a queued triage pass.)*

## Status values (lifecycle order never reverses; stages may be skipped)
- [Backlog]   — not active; a concern, deferral, or unstarted request. Has an activation trigger.
- [Discovery] — under investigation/audit/measurement. Produces findings.
- [Decided]   — investigated, a ruling/spec exists (Brief/Analyst Review/Plan approved). Ready to build.
- [Building]  — implementation in progress.
- [Verified]  — built AND confirmed by Coach. Done.
Skip paths: a confirmed fix skips [Discovery]; a trivial fix skips [Discovery] and [Decided].
Status is orthogonal to category — a B/F/G item moves through the same lifecycle.

## Not covered by this convention
- COACH.md C## entries: Coach's session journal (findings diary), a separate artifact. Leave as-is.
- Decisions/rulings: recorded in the relevant Brief/Analyst Review, referenced by the item they constrain.

## Numbering history (notable)
- **B/F/G taxonomy adopted 2026-07-02** (Jon directive via Dez). Replaces the unified `#N` scheme for
  new items; existing #1–#198 retained (no renumber), open items category-tagged.
- **M (Metrics) category added 2026-07-10** (Jon directive via Dez). New standing analytics/telemetry track, own sequence + ranking. First item = **M001** (user engagement telemetry). Dez uses `METRICS`/`M` at intake going forward; Freddy stamps `M###`.
- **#177 = denylist fail-open hazard** (firm-LT predicate `!=="ai"`). During the 2026-06-30 session,
  #177 was briefly used as a working label for the RFQ pre-fill cluster, but that cluster landed as
  **#178**. The repo's #177 is, and stays, the denylist hazard — no collision in the registry.
- **#178 = RFQ pre-fill cluster** (outbound: referencePrice / firm-LT pre-fill, email/PDF reference cells).
- **#179 = Supplier Portal submit validation** (inbound). Coach caught a transient #178 double-assignment
  mid-session (RFQ cluster vs portal issue both briefly labeled #178) and renumbered the portal issue to
  #179. Final mapping is stable; older chat artifacts labeling the portal issue "#178" are superseded.
- **#199 / #200** = last items allocated under the legacy `#N` scheme (Tech-Review flag; quota-tile aging)
  — allocated just before the B/F/G cutover; they keep their `#N` IDs.

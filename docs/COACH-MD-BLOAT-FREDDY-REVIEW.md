# Freddy — Analyst Review Request: COACH.md Bloat & Archiving Strategy

**From:** Marc (with Coach)
**Date:** 2026-06-29
**Decision already taken by Jon:** Coach will archive older findings (Coach owns COACH.md). This request asks for your review of *how* to do it safely, not whether to do it.

---

## The problem

`COACH.md` — Coach's append-only session log — has grown to:

| Metric | Value |
|--------|-------|
| Size | 636 KB |
| Lines | 8,893 |
| Findings | C1 … C111+ |

Claude Code's `Read` tool pulls ~2,000 lines per call by default, so the file now truncates on a single read. At startup Coach could not ingest the full file; it had to tail-read the last ~500 lines to get recent context.

For comparison, the other startup files are healthy:

| File | Size | Lines |
|------|------|-------|
| COACH.md | 636 KB | 8,893 ⚠️ |
| TODO.md | 219 KB | 3,038 |
| CLAUDE.md | 66 KB | 882 |
| FREDDY-PASTE.md | 50 KB | 557 |
| SESSION-STATE.md | 5 KB | 70 |

## Why it matters

COACH.md is the durable record of architectural findings across the whole project history — it's what lets a fresh Coach recover cross-session reasoning. If we archive carelessly we risk:

- **Losing resume triggers** — e.g. #168's resume condition and the C110/C111 trace are recent and load-bearing; they must stay in the live file.
- **Breaking finding cross-references** — later findings cite earlier C-numbers; an archive split can leave dangling references.
- **Dropping verdicts/SHAs** — resolved findings still carry the commit SHA and the reasoning that justified closing them; that history must relocate, not vanish.

## The plan on the table (Coach to execute)

1. Create `COACH-ARCHIVE.md`; move RESOLVED / superseded / closed C-findings into it, preserving SHAs and verdicts.
2. Keep `COACH.md` scoped to recent + still-active findings (target: well under 2,000 lines).
3. Top-of-file pointer in COACH.md → "Older/resolved findings: see COACH-ARCHIVE.md".
4. Commit both (Coach-owned) and push.

## What I'd like your read on

1. **Cut line — what stays live vs. archived?** Is "RESOLVED/superseded → archive, OPEN/recent → keep" the right rule, or should recency (e.g. last N sessions) also keep a *resolved* finding live if it's still being referenced?
2. **Cross-reference integrity** — best lightweight convention so an archived C-finding cited by a live one stays followable (e.g. keep a one-line stub + SHA in COACH.md pointing into the archive)?
3. **Resume-trigger safety** — anything beyond #168/C110/C111 you'd insist stays in the live file regardless of resolved status?
4. **Recurrence** — should we set a soft size budget (e.g. archive at every N lines / each Close Out checks size) so this doesn't silently regrow to 9k lines again? Worth a CLAUDE.md note in the shutdown procedure?
5. **Same risk for TODO.md?** It's 3,038 lines / 219 KB and also append-with-status. Is it close enough to the cliff to fold into the same archiving convention, or leave it (it's read with "skim", not full-ingest)?

No rush — both work lanes are open and nothing is in flight. This is a maintenance/hygiene call, not a blocker.

# Document-Ownership Scheme — Four-Session Team (PROPOSAL)

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** Process/architecture proposal (read-only analysis; NO doc edits applied — this file is the only artifact)
**Requested by:** Jon (via Freddy work order) · **Route back to:** Freddy (hub) for verification → Jon approval before any doc changes
**Base version:** v1.21.24 · master `53d76f8a`

---

## 0. The problem in one sentence

Four CCD sessions now share **one working tree and one git index**, so any doc with more than one writer risks (a) two sessions editing the same region and (b) one session's commit sweeping another's staged changes — which already happened once today (my CLAUDE.md edits landed inside Marc's `68317abe` #188 commit).

**The fix is structural, not procedural:** give **every file exactly one writer** (or, where unavoidable, one writer *per disjoint section*), and layer a small universal git discipline on top. Hub-and-spoke actually *helps* here — because specialists now route through Freddy, several docs that had multiple writers collapse naturally to one.

---

## 1. Design principles

1. **One writer per file.** A single writer cannot collide with itself. This is the whole game.
2. **Author owns their artifact.** Whoever produces a `docs/#N-*` file owns and commits it. No shared editing of analysis artifacts.
3. **Coordination docs go to their most role-aligned single owner** — not necessarily the hub. Solving the collision only needs *one* writer; it does not require that writer be Freddy. So assign each coordination doc to the role whose job it already is.
4. **Where a file genuinely needs two writers (only TODO.md), split by section** — append-only in the section you don't own.
5. **Hub verifies; owner commits.** Under hub-and-spoke a specialist proposing a change to a file it does NOT own drafts the text, routes it to Freddy for verification, and the *owner* applies it. Cross-talk stays off the peer channel.
6. **Universal git discipline** (§4) closes the shared-index race for the cases where sequencing is unavoidable (e.g. close-out).

---

## 2. Ownership matrix

**Legend:** Writer = the single session that edits + commits. Everyone reads everything. "Commit" = that writer, always via explicit pathspec + immediate push (§4).

### Coordination / handoff docs

| Doc | Writer | Conflict-avoidance |
|---|---|---|
| `CLAUDE.md` | **Coach** | Process/architecture doc = Coach's lane. Single writer ends today's multi-writer drift. Changes drafted by any role route through Freddy (hub) for verification; Coach commits. |
| `TODO.md` — numbered tracker (all `#N` items, statuses, resolutions) | **Freddy** | Freddy is sole `#N` allocator + router + close-out orchestrator. Marc no longer edits TODO.md directly — he reports status to Freddy, who updates the tracker. Reduces TODO.md from 3 writers → 2. |
| `TODO.md` — `## 📥 Inbox` section | **Dez** (append-only) | Disjoint section from the tracker. Dez only ever *appends* bullets; Freddy *consumes + clears* them during triage. The two writers never touch the same lines. Both commit `-- TODO.md` (§4) so neither sweeps the other. |
| `SESSION-STATE.md` | **Freddy** | Freddy orchestrates startup + close-out and curates the ⭐ NEXT UP queue. He regenerates it (was: whoever closed out). Specialists feed content via the hub, not by editing. |
| `FREDDY.md` | **Freddy** | Self-owned under the new config (was: Marc at close-out). Freddy boots from it, so he keeps it current — no second-hand staleness. |
| `FREDDY-PASTE.md`, `FREDDY-SESSION-BRIEF.md` | **Freddy** | Freddy's onboarding artifacts; regenerated at close-out by Freddy. |
| `NUMBERING-CONVENTION.md` | **Freddy** | Freddy is the `#N` authority. Low churn. |
| `TODO-ARCHIVE.md` | **Freddy** | Follows TODO.md ownership (was: Marc). |
| `COACH.md`, `COACH-ARCHIVE.md` | **Coach** | Unchanged. Single writer already. |

### Work artifacts (`docs/#N-*` — author owns)

| Artifact type | Writer | Naming |
|---|---|---|
| Briefs, Analyst Reviews | **Freddy** | `docs/#N-BRIEF.md`, `docs/#N-ANALYST-REVIEW.md` |
| Supplements, Detailed Plans, Verifications, Traces, Fix-Plans | **Coach** | `docs/#N-SUPPLEMENT.md`, `docs/#N-DETAILED-PLAN.md`, `docs/#N-*-VERIFICATION.md`, `docs/#N-*-TRACE.md` |
| Build Plans, Build Reports, implementer reviews | **Marc** | `docs/#N-BUILD-PLAN.md`, `docs/#N-BUILD-REPORT.md`, `docs/#N-MARC-REVIEW.md` |
| This proposal | **Coach** | `docs/DOC-OWNERSHIP-PROPOSAL.md` |

Author = owner = committer. No artifact has two writers. If a plan needs a co-author's input, that input is routed through Freddy and the owner incorporates it — the file is never edited by two sessions.

### Source & subsystem docs

| Doc / path | Writer | Note |
|---|---|---|
| `src/**`, `functions/**`, `H{N}-PLAN.md`, `tests/**` | **Marc** | Unchanged. |
| `docs/` subsystem reference (`debug-logging.md`, `kanban-status.md`, `notification-system.md`, `quote-print-system.md`, `rfq-supplier-portal.md`, etc.) | **Marc** | Source-of-truth for shipped systems; low churn; Marc updates when the code changes. |
| `ARC-AUDIT-FINDINGS.md` | **Freddy** | Largely frozen/legacy; if refreshed, orchestrator owns it (feeds SESSION-STATE). |
| `OVERNIGHT-LOG.md` | **append-only**, by whichever session runs an unattended/overnight pass | Append-only by construction; each session appends its own dated block, never rewrites prior. |

---

## 3. The four hotspots Freddy flagged — explicit resolutions

### 3.1 TODO.md — three writers → two, section-disjoint
- **Before:** Marc (numbered tracker at close-out) + Dez (Inbox appends) + Freddy (Inbox→tracker promotion, `#N` stamp, bullet clear).
- **After:** **Freddy owns the entire numbered tracker + Inbox promotion; Dez owns the `## 📥 Inbox` section append-only.** Marc drops out entirely — under hub-and-spoke he reports status to Freddy, who edits the tracker. Two writers, two disjoint sections, both using `git commit -- TODO.md`. The append-only rule in Dez's section means even simultaneous edits touch different line ranges (mechanical git-mergeable), and the pathspec rule means neither commit sweeps the other's staged work.

### 3.2 SESSION-STATE.md — owner + regenerator
- **Owner: Freddy.** He orchestrates startup (consumes it) and close-out (regenerates it), and curates the ⭐ NEXT UP ranking. The old model (whoever ran close-out, usually Marc) is replaced by the orchestrator. Marc/Coach feed their session output to Freddy via the hub; Freddy folds it into the regeneration. Single writer → zero stale-handoff ambiguity about "who updates state."

### 3.3 FREDDY.md — maintainer
- **Owner: Freddy (self).** Was Marc-at-close-out (CLAUDE.md step 6d). Self-ownership is correct now: Freddy is the one who boots cold from FREDDY.md, so he has the strongest incentive and best knowledge to keep it accurate, and it removes a Marc→Freddy handoff hop. (Guard against the self-review blind spot: at close-out Freddy diffs FREDDY.md against the session's shipped work and surfaces the proposed update to Jon, same approval gate as before.)

### 3.4 Freddy Briefs / Analyst Reviews — placement + naming
- **Placement: `docs/`** (not repo root). **Naming: `docs/#N-BRIEF.md`, `docs/#N-ANALYST-REVIEW.md`** — already the de-facto pattern (`199-TECH-REVIEW-FLAG-BRIEF.md`, `199-ANALYST-REVIEW.md`). Standardize it. See §5 for the root-vs-`docs/` cleanup.

---

## 4. Universal git discipline (applies to every session, every commit)

These are the procedural backstops for the unavoidable sequencing (close-out, where several owners commit near-simultaneously):

- **U1 — Explicit pathspec, always.** `git commit -- <your paths>`. **Never** `git add -A` / `git add .` / `git commit -a`. This is the direct fix for today's sweep. *(Marc has already adopted + memorized this.)*
- **U2 — `git status` before you stage.** See what else is already staged in the shared index; if another session's files are staged, do not include them — commit only your pathspec.
- **U3 — Pull before edit, push right after commit.** No lingering local-only commits on a shared tree (they cause the next session to branch its edits off an unpushed base). Immediate push keeps origin == working tree.
- **U4 — Verify session ids via `list_sessions`, never from a pasted string.** (The Dez re-announce incident — a body-pasted id was wrong.) The authoritative id↔title map is `list_sessions` + the `from=` field on inbound messages.
- **U5 — Section ownership on the one shared file (TODO.md).** Append-only in the section you don't own; never rewrite the other owner's section.
- **U6 — Owner-commits rule under hub-and-spoke.** To change a file you don't own, draft the text → route to Freddy → the **owner** applies + commits. No editing another role's file directly.

---

## 5. Fold-in: exact CLAUDE.md wording for hub-and-spoke (supersedes the earlier narrow work order)

Two committed passages contradict the new topology. Proposed exact replacements (to be applied by the CLAUDE.md owner — **Coach** — after Jon approves this scheme):

### 5.1 Team comms (currently ~line 55)
> **REPLACE** the sentence framing it as a direct bus with:
>
> **★ Team comms (HUB-AND-SPOKE through Freddy):** All four roles run in CCD (Desktop), but cross-role messaging is **not** peer-to-peer — it routes through **Freddy (the hub/router)**. Marc, Coach, and Dez send their outputs, requests, and questions **to Freddy**, who verifies and routes to the correct recipient and returns the answer. Direct peer sends (Coach↔Marc, Coach↔Dez, Marc↔Dez) happen **only when Freddy authorizes a specific case**. Jon may message any session directly. Sessions discover ids via `list_sessions` (match by title) + the `from=` id on inbound messages — never trust an id pasted into a message body. Each session stays in **"Ask permissions"** mode so outbound sends fire (per-send "Allow Once" prompt expected, hardcoded). Terminal CLI cannot receive cross-session messages — CCD Desktop only. Repo (git) is the durable fallback bus.

### 5.2 Intake / Triage (Dez) subsection (currently ~line 322)
> **REPLACE** "teammates … `send_message` the report to Dez" with:
>
> **Dez owns all bug/feature intake.** **Jon** reports directly to Dez. **Teammates (Marc/Coach/Freddy)** who spot a net-new bug/feature in passing route the report **to Freddy (hub)**, who forwards it to Dez for capture — consistent with hub-and-spoke; no direct teammate→Dez sends unless Freddy authorizes. Dez dedup-checks, appends an un-numbered timestamped bullet to the `## 📥 Inbox` section of TODO.md, and commits `-- TODO.md` + pushes immediately. Freddy pulls the Inbox on routing passes, assigns the next `#N`, promotes into the numbered tracker, and clears the bullet.

*(Also update the "four-way direct bus" phrasing wherever else it appears, and the roles/file-ownership tables to reflect §2.)*

---

## 6. Root-vs-`docs/` placement cleanup (recommendation, low-priority)

The repo has ~50 legacy artifacts at root (`92-*`, `95-*`, `98-*`, `ARCHIVE-*-PLAN.md`, `*-BRIEF.md`, `*-AUDIT.md`, …) and 98 newer ones in `docs/`. Recommendation:
- **Going forward:** every new `#N` artifact lands in **`docs/`** with the `#N-TYPE.md` convention. No new artifacts at root.
- **Legacy:** leave existing root artifacts in place — a mass `git mv` churns history for little gain and risks breaking the many cross-references in COACH.md/TODO.md. Migrate opportunistically only if a doc is actively revised.
- **Structural docs stay at root** (CLAUDE.md, TODO.md, COACH.md, SESSION-STATE.md, FREDDY*.md, NUMBERING-CONVENTION.md, `*-ARCHIVE.md`) — they're the well-known entry points startup reads.

---

## 7. Recommendation (optimizing collisions / stale-handoff / one-writer)

**Adopt §2 as written.** It yields:
- **One writer per file** for every doc except TODO.md, which is two writers on two disjoint sections. → Write-collisions structurally eliminated, not just mitigated.
- **Coordination docs consolidated under their role-owner** — Freddy owns the session/handoff cluster (SESSION-STATE, FREDDY*, TODO tracker, NUMBERING, TODO-ARCHIVE, ARC-AUDIT); Coach owns the process/architecture cluster (CLAUDE.md, COACH*); Marc owns code + subsystem refs; Dez owns the Inbox. → Minimal stale-handoff risk: exactly one session is accountable for each handoff surface.
- **§4 universal git discipline** covers the residual close-out sequencing race.
- **Hub-and-spoke folded into the docs** (§5) so the committed record stops contradicting the live topology.

**Open decision for Jon** (the one place I see a legitimate either/or):
- **CLAUDE.md owner = Coach (recommended)** vs **= Freddy.** I recommend Coach (process/architecture alignment; hub still verifies before commit). Freddy-owns-all-coordination is the alternative if you'd rather the hub be the sole committer of every shared doc. Either satisfies one-writer; the choice is role-alignment vs. hub-centralization.

Everything here is analysis only — no existing doc has been edited. On Jon's approval (routed via Freddy), the CLAUDE.md §5 edits + the roles/ownership-table updates get applied by their owners in one coordinated, pathspec-committed close-out pass.

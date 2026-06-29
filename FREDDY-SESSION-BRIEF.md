# Freddy — Session Starter Brief (2026-06-29)

Freddy — here's the lay of the land for this session so you can route/triage with full context. The full `TODO.md` (findings #1–#167 + toolkit T1–T9) is the source of truth; this is the working set. If you want the complete list, Jon can drag `TODO.md` itself into your window — it's ~2920 lines, so this digest is usually enough.

## Current state
- **Version:** v1.21.0 (deployed 2026-06-27, production). master `fdad5f36`, clean, == origin.
- **BC env:** `MATR_SndBx_01152026` (SANDBOX) — the only BC env that exists. No production BC yet.
- **Just shipped:** #163 Full PN Integrity via BC surrogate key. BC "No." is now an opaque `MTX-#####`; full manufacturer PN lives in ARC `partNumber` + BC `Vendor_Item_No`. Code-live only — **no BC cutover occurred** (prod BC doesn't exist yet).
- **Last close:** #167 closed as NO-BUG (the "28 AI prices" was 28 AI-estimated *lead times*).

## Top of queue — GATED (not actionable today)
**#163 production cutover.** Strict order, nothing starts until step 1 lands:
1. Stand up a production BC environment (gates everything).
2. Scope the cutover with the BC developer — "what to stand up for prod BC + what the rename touches (BC references-by-No. AND ARC `bcNo` links)."
3. Hand-correct long-PN items into `Vendor_Item_No` BEFORE any rename (or the rename loses the full PN).
4. BC mass-rename (No.→`MTX-#####`) + ARC `bcNo` reconciliation **in lockstep** — a BC-only rename orphans ARC's links.

**First action when Jon brings the Excel mapping sheet:** Coach trace to confirm `row.bcNo` is the ONLY place ARC stores a BC No., then Coach scopes the reconciliation script, Marc dry-runs, Jon verifies, Marc runs live.

## 90 OPEN findings total. The actionable HIGH ones (no gate):

| # | Risk | Summary |
|---|------|---------|
| #158 | Silent prod failure | `region_learning` doc exceeds Firestore 1MB → writes fail silently |
| #164 | Data loss | Reconciliation Deleted→"Keep" may strip crosses (untested branch) |
| #165 | Data-loss-adjacent UX | Reconciliation Accept/Reject verbs read backwards |
| #80 | Extraction accuracy | Feedback re-extract uses PN-only dedup key — over-merges |
| #92 | Concurrency correctness | Background-task UI ownership audit (multi-project focus-steal) |
| #153 | Feature (needs Brief) | Drop a revised drawing set onto an existing project |
| #156 | Feature | In-portal BOM accuracy confirmation (absorbs #137 Phase 2) |
| #159 | Functional gap | Copy-to-New-Quote customer selection — **scope ready** (`docs/159-COPY-CUSTOMER-SCOPE.md`) |
| #160 | UX gap | ReconciliationModal Changed rows offer only "Accept", no reject |

## Long tail (lower priority, grouped)
- **Extraction accuracy cluster** (#81, #83, #84, #85, #98–#102) — completeness / partial-read; permanent fix needs text-layer row counting.
- **BC integration polish** (#54, #62, #64–#66, #68–#72) — sync hygiene, rate-limit observability, descriptions not updating.
- **`deploy.sh` hardening** (#13, #15, #20, #26) — #26 (worktree-build mismatch) is sharpest; has silently shipped empty releases before.
- **Non-gating #163 follow-ups (GitHub-tracked):** GH #2 (portal per-row lead times satisfy submit), GH #3 (no manual-entry without uploading a doc first), GH #4 (BC price-push stacks prices without end-dating prior — money-correctness).
- **Toolkit gaps** (T1–T9) — pre-commit hook doesn't cover `.jsx`; 23 duplicate BC project docs.
- **UX/cosmetic** (#27, #30, #90, #127, #161, #162).

## Marc's recommendation for this session
With the cutover gated, the highest-value non-gated work is **#158** (silently breaks prod, no symptom until it fails) or **#159** (lowest-effort win — scope already written). Either way, an H-item-discipline Coach trace runs before any code.

What we pick up is Jon's call — this brief is so you can route and weigh in.

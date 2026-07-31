# BC-Binding Coordinated Build Plan — wire `resolveBcBindings` to close B065-Ph2 + F070 + F069

Coach scope (2026-07-31, read-only). Closes three verified-open money-path criticals by wiring the built-but-dormant `resolveBcBindings` primitive. Line numbers verified live against current `src/app.jsx` (drifted from the older B065/F069/BC-INTEGRITY docs, which this reconciles + supersedes where they conflict). **Plan only — no code written.**

## 1. What `resolveBcBindings` does today (`src/app.jsx:4192–4298`)
Read-only BC reconciler. `resolveBcBindings(projectNumber, panels, opts)`, `opts.mode` = `audit`(default)|`resolve`. Window-exposed `:4298`. Two gated GETs (tasks `:4218`, planning lines `:4224`), detects Project_/Job_ field naming, indexes posting tasks via `/^20\d+10$/`, resolves each panel's task# (stored `bcTaskNo` → Description-token → positional `20000+N*100+10`) and each row's Line_No (stored `bcLineNo` → discovered by part#). Returns a plan `{panels:[{taskNo,taskSource,rows:[{lineNo,lineSource}]}],ambiguous,…}`.

**It ONLY reads + returns a plan.** `audit` and `resolve` modes currently produce the IDENTICAL object — `mode` is never branched on. No persist, no diff-count, no write. **Zero callers** (dormant).

### Missing to make it usable
- Zero callers; no persist/apply wrapper (nothing stamps `bcTaskNo`/`bcLineNo`); no audit consumer (no field-diff of Qty/Cost/Desc/No); **S2 populate-at-create not done** (create fns don't return task#s; sync doesn't write `bcLineNo` on 2xx POST) → `stored` bindings never exist → always degrades to Description/positional today.

### MUST-FIX before wiring (flag to Jon)
- **(a) Description-discriminator misalignment = the Ryan case.** Panel keys on `_leadToken(drawingNo||name)` `:4255`; BC Description uses `pfx=PRJ###-{N*100}` `:3538`. No-drawingNo panels never match → silent positional degrade, AND the unique pfx tokens mean the ambiguity guard **doesn't fire on Ryan's exact case.** Both sides must key the same normalized field before `resolve` is trusted. **Hard precondition for Phase 2/migration.**
- **(b)** `descTokenCounts` `:4238` is dead code (computed, never read).
- **(c)** `structuralMismatch` `:4244` can be inflated by a phantom `20010` from the relink off-by-one → false ambiguity.
- **(d) Cross-task Line_No collision (MUST-FIX before persist).** `_b065RowBound` `:4617` / `_b065EcoRowBound` `:4791` scan ALL `panel.bom` for `bcLineNo===ln`; base+ECO both number from 60000 → an ECO row bound to 60000 would falsely protect a base orphan. Scope each scan to its own task's rows.
- **(e)** Resolver field-detection (tier-1 probe only `:4206`) is weaker than `bcSyncPanelPlanningLines` (`$metadata`+filtered fallbacks `:4356`) → on a legacy `Job_No` sandbox it filters to nothing and reports "BC empty." Must reuse the sync path's full detection before it's an authority.

## 2. Phases (exact insertion points)
Design: resolve/guard at per-op **chokepoints** (the sync/write fns), not the ~17 call sites. Pass the **panel object** in.

**Phase 1 — populate/persist bindings (S2). Independently shippable (additive, dormant on read side).** M ~0.5d.
- `bcCreatePanelTaskStructure.postTasks` `:3549` + `bcCreatePanelTaskBlock` `:3608` return created posting# (20N10). Callers persist `panel.bcTaskNo`.
- `bcSyncPanelPlanningLines` POST arm `:4586` — on 2xx write `row.bcLineNo=line.Line_No`; caller persists. `bcTaskNo`/`bcLineNo` additive, already preserved on save + cleared on copy `:12130`/relink `:42183`.

**Phase 2 — route PATCH/DELETE through bindings (S3 — the money-path fix). Depends on P1 + MUST-FIX(a)(d)(e). Highest risk.** L ~1.5–2d.
- `bcSyncPanelPlanningLines` `:4300` — replace positional `taskNo=base+10` `:4321` with `resolvePanelTaskNo` `:4169`; assign each row's Line_No from `row.bcLineNo` (allocate fresh only when unbound) instead of positional `:4471/:4481`; PATCH by bound Line_No (`patchLine` `:4544`). Tighten DELETE guard `:4616`; fix MUST-FIX(d). Fail-loud self-heal on 404 (re-resolve by part# in task, else `result.failed`). Mirror into `bcSyncEcoPanelPlanningLines` `:4658`. Hard-refuse destructive writes when `bcBindingUnresolved`.

**Phase 3 — audit detector + report UI (F070). Report half independently shippable after P1; migration-persist needs P2.** L ~1.5–2d.
- Diff layer on `audit`: compare ARC-desired No/Qty/Unit_Cost/Description vs fetched `out.lines`; rank wrong-part# > qty/count > money > desc (reuse `:4558`). Triggers: on-open `:41886` (record `bcReconciledAt`), **send-time gate `:40214`/`:37199` (build first)**, manual "Verify BC sync" button. Surface: `BC in sync ✓ / N mismatches ⚠` chip, drill-down from `syncFailedAlert` `:29992`. Migration (S6): `resolve` persists real task#s (self-heals B065); ambiguity guard sets `bcBindingUnresolved` + blocks destructive writes until Jon reconciles.

**Phase 4 — F069 surfaced env hard-block. Independently shippable, orthogonal.** M ~0.5–1d.
- Factored `_assertBcProjectEnv(projectNumber,project,opLabel)` after `:384`, throws on `project.bcEnv !== _bcConfig.env`. Enforce at chokepoints (`:4300`,`:4658`, create fns). **Currently-UNGUARDED user-initiated sites:** manual ⇅ Sync `:28351`, QUOTE SEND loop `:37199`/`:43539`, pre-print syncs `:42616`/`:44115`; **confirm `poCreateOrder` client call site during build.** Guarded already: `saveLineQty` `:28456`, on-open `:41890`. Once-per-gesture toast. Catalog "Create in BC" buttons OUT of scope (no project env).

## 3. Decisions for Jon (rec in italics)
- **D1** F070 audit report-only vs auto-heal? *Report-first; additive fixes opt-in one-click; destructive fixes always confirmed; never silent.*
- **D2** F069 env-mismatch on a user gesture: hard-block vs confirm-override? *Hard-block (writing wrong env corrupts a same-numbered job); reads stay soft-skip.*
- **D3** Env-guard Phase-1 binding writes + lazy-stamp `bcEnv` on legacy? *Yes both — only stamp on confirmed same-env 2xx.*
- **D4** Migration lazy-on-open vs one-time script? *Lazy-on-open (resolve once/project, additive).*
- **D5** Ambiguous/unresolvable projects (Ryan/PRJ402141)? *Bind unambiguous panels only, set `bcBindingUnresolved`, block destructive writes, surface until Jon reconciles. Never auto-guess.* (Jon-locked in B065-DURABLE-BINDING-PLAN §DECISIONS — confirm holds.)
- **D6** Send-time gate severity? *Hard-block structural mismatch; soft-warn field diffs.*
- **D7** Always-on sweep? *Client reconcile-on-open + "not verified in N days" flag now; server sweep later needs app-only BC creds (today auth = delegated user-MSAL, no server credential).*
- **D8** Fix resolver Description-discriminator (MUST-FIX-a) how? *Compute the same pfx token on the panel side — correctness precondition for trusting resolve.*

## 4. Risks / staging
Writes to BC + gates customer sends = highest stakes. P2 read-authority is the danger zone (a bug breaks EVERY sync). Ambiguity guard is the safety net — (a) is a hard precondition or it silently fails on Ryan's case. DELETE `If-Match:"*"` `:4627` has no concurrency guard → bias toward keep over delete. **Staging (non-negotiable):** (1) audit-first dry-run — ship P3 `audit` reporting + observe live divergences BEFORE any resolve-persist/P2 write-routing; (2) Test channel on a ≥3-panel/≥3-row bound project; (3) Jon live-verify each phase vs the B065-DURABLE-BINDING-PLAN §Repro; (4) Coach review + Jon deploy gate per phase.

## 5. Effort / sequence
| Phase | Effort | Independently shippable |
|---|---|---|
| 1 populate/persist | M ~0.5d | Yes (additive) |
| 2 route PATCH/DELETE | L ~1.5–2d | No (needs P1 + MUST-FIX) |
| 3 audit+report | L ~1.5–2d | Yes for report (after P1) |
| 4 F069 hard-block | M ~0.5–1d | Yes (orthogonal — can ship first) |

**Recommended:** MUST-FIX(a–e) → P1 → **P3 audit-report (dry-run, observe live)** → P2 → P3 migration → P4. P4 can ship first if Jon wants the env hard-block sooner.

## MUST-FIX status (2026-07-31) — branch `marc/resolvebcbindings-mustfixes` `4b5f033d`
- **(b) DONE** — removed dead `descTokenCounts` (~4237; would over-flag if wired; per-panel `cands.length>1` is the real ambiguity signal).
- **(c) DONE** — phantom-`20010` guard: `postingTasks` filter now excludes `tn==="20010"` (~4238) so the relink off-by-one phantom can't inflate `structuralMismatch`.
- **(d) DONE (safety-critical)** — task-scoped the Line_No collision scans: base `_b065RowBound` (~4628) now `&& !isLaborRow && !ecoTag`; ECO `_b065EcoRowBound` (~4808) now scans `ecoRows` not all `panel.bom`. Prevents a cross-task 60000 match falsely protecting an orphan. **Inert in practice today** (no row carries `bcLineNo` until P1), but it edits the live B065 delete guard → **Coach review + Test before P1 ships.** (Flag: base scan uses `!isLaborRow&&!ecoTag`, not exact `bomRows` parity incl. `!restoreSkipped` — biased toward keep; confirm parity preference.)
- **(a) FIX READY (not cold-coded)** — at ~4262 replace `const disc=_leadToken(panel&&(panel.drawingNo||panel.drawingDesc||panel.name));` with `const disc=_leadToken((panel&&panel.drawingNo)||\`${projectNumber}-${panelIndex*100}\`);` so the panel side mirrors BC's `drawingNo||pfx` (fixes Ryan's no-drawingNo silent-positional degrade + makes the ambiguity guard fire). Caveat: assumes ARC-authored BC Descriptions; drawingNo edited post-create drifts (surface in F070 audit).
- **(e) FIX READY (not cold-coded)** — extract the sync path's 3-tier field detection (`bcSyncPanelPlanningLines` ~4334-4390: $top probe + $metadata + filtered probe, cache-only-when-detected) into a module helper `_bcDetectPlanFields(planPage)`; call it from BOTH `bcSyncPanelPlanningLines` and `resolveBcBindings` (~4206, replacing the weak tier-1-only block that falsely reports "BC empty" on a legacy Job_No sandbox). Preserve the cache-only-when-detected NIT + the gated/raw fetch split. (Bonus: `bcSyncEcoPanelPlanningLines` ~4684 could adopt it too.)

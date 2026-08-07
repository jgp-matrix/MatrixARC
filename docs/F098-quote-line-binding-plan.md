# F098 — Customer-facing Quote Line # + B065 Phase-2 activation (durable ARC↔BC binding), NEW-JOBS FORWARD-ONLY

**Coach (Sam Wize) · architecture lane · READ-ONLY design · master @ v1.25.1 · `src/app.jsx`.** Design only — no code. Supersedes/absorbs F097. Builds directly on `docs/B065-DURABLE-BINDING-PLAN.md` (Phase 1 SHIPPED; Phase 2 DEFERRED). **Money-path — HIGH stakes** (wrong-line PATCH / dropped-part DELETE). Every LOCKED decision from B065 §"DECISIONS LOCKED (Jon 2026-07-27)" is honored verbatim below.

> **Scope fence:** NEW JOBS FORWARD-ONLY. Existing-job retrofit (B065 S6 lazy migration of legacy bindings) is an explicitly DEFERRED later phase. This plan says exactly what legacy jobs do in the meantime (§8) but does not fully design the retrofit.

---

## 1. Problem recap

Two independent gaps, one shared root (position-as-identity):

- **No durable customer-facing line number.** A panel is built in `addPanel` :39577 as `{id:'panel-'+Date.now(), name:'Panel '+_seq, …}` (:39584) with **no line/order field**. Every "Line N" the user or customer sees is recomputed from a **timestamp sort** at render time: the in-app line list (:40843, `_ts` = `createdAt` or the 12-digit id timestamp), the printed quote (:24027, `Line {idx+1}` at :24062), and the PDF/quote-summary (:8742). Reorder or a clock-skewed `createdAt` silently renumbers the customer's quote. Service cards interleave into the same sequence by `createdAt`.
- **No durable ARC↔BC binding (B065 core defect).** BC task# `20000+N*100+10` (:3718–3719, :4428–4429) and line# `60000+…` are pure functions of array position, recomputed each sync; the read-back diff keys on the recomputed number with `If-Match:"*"` and no part-identity guard → an insert/delete/reorder PATCHes the wrong BC line and DELETEs the tail = **wrong part ordered / real part dropped, silent** (Ryan 20510). B065 Phase 1 shipped the **dormant** storage + helpers to fix this; Phase 2 (activation) is deferred.

**F098 unifies them:** the customer-facing `quoteLineNo` is the *same frozen integer N* that derives the BC posting task `20000+N*100+10`, so a single number is the source of truth for the quote line, the BC task binding, and the extraction/drawing association. This is the recommendation to confirm at approval (§9).

**What Phase 1 already shipped (dormant, do not re-build):**
- Storage contract: `panel.bcTaskNo`, `row.bcLineNo` (additive, survive save/load).
- Allocators: `allocatePanelBcTaskNo(panels)` :4248 (lowest-unused 20N10), `allocateRowBcLineNo(rows,alsoUsed)` :4262 (lowest-unused 60000-step).
- Read authority: `resolvePanelTaskNo(project,panel,panelIndex)` :4277 (stored `bcTaskNo` → positional), and the shared read-only `resolveBcBindings(projectNumber,panels,{mode})` :4300 (1 GET tasks + 1 GET lines; stored→Description→positional task match; stored→discovered row match with part#+Description+residual-order tiebreak; sets `ambiguous`/`unresolvedReason`; never writes).
- Money-path DELETE part-identity guard (S3c) in both sync loops: `_b065RowBound` :4725 / `_b065EcoRowBound` :4899 bias toward keeping any line whose part# matches a live row.
- Copy/relink binding-clear: `createProjectCopy` newPanels map :12814 strips `row.bcLineNo` (:12822) and omits `panel.bcTaskNo` from the include-list.

Phase 2 activation (S2 populate, S3 read-authority + Line_No-from-binding, S4 ~27 call-site conversions) is dormant/deferred. F098 activates the **forward-only slice** and adds the `quoteLineNo`.

---

## 2. The `quoteLineNo` model + allocator + stamp sites

### 2.1 Model
`quoteLineNo` = a **stable, per-line, 1-based integer assigned at line CREATION** (up front, before any BC round-trip), persisted on the panel object (and on service cards, since they share the customer line sequence). It is **frozen for the life of the line** — never recomputed, never reused after delete (monotonic high-water, add-after-delete-safe), mirroring the existing `panelSeq` :39583 name-counter and the service-card `bcProjectTaskNo` slot allocator :1649.

`quoteLineNo` is the **single frozen N** that derives the BC posting task `20000 + quoteLineNo*100 + 10`. B065's `panel.bcTaskNo` is then *populated from the confirmed 2xx create keyed to that N* (§5, S2) — so `quoteLineNo` is the human/authoritative anchor and `bcTaskNo` is its BC-confirmed echo. If a create never confirms, `quoteLineNo` still exists (drives the quote + the *expected* task#); `bcTaskNo` stays null until confirmed (fail-loud, never phantom).

### 2.2 Allocator (new, mirrors `panelSeq` :39583 + `allocateServiceCardBcSlot` :1649)
`allocateQuoteLineNo(project)` → returns `Math.max(project.quoteLineSeq||0, <max existing quoteLineNo across panels+serviceCards>, <count>) + 1`, and the caller persists the bumped `project.quoteLineSeq`. Seeding from the max of the stored counter, the max existing stamped value, AND the count reproduces the exact defense `panelSeq` uses so (a) existing projects don't restart at 1 and (b) a delete-then-add can't reuse a live number ("three Panel 4s" bug, :39579–39581). **Delete does not decrement the seq** → deletes leave a permanent gap in `quoteLineNo` (this is the tension — §3).

### 2.3 Stamp sites (all must stamp on creation, forward-only)
| Site | Anchor | Action |
|---|---|---|
| `addPanel` | :39584 | `quoteLineNo:allocateQuoteLineNo(project)` on `newPanel`; bump `project.quoteLineSeq` alongside `panelSeq` in `updated` (:39585). The existing positional `n` (:39578) becomes a **discovery hint only**; `quoteLineNo` drives the BC task block create call (:39595). |
| New-project panel seed | new-project flow → `bcCreatePanelTaskStructure` caller :49372 (also :12596) | Stamp `quoteLineNo` 1..k on the initial panels **in creation order** as they're built, before/at the task-structure create. |
| `addServiceCard` / `createServiceCard` | :39611 / :1664 | Stamp `quoteLineNo` from the same `project` sequence so panels and service cards share one contiguous customer line space. (`createServiceCard` already allocates `bcProjectTaskNo` :1684 — add `quoteLineNo` beside it; pass `project`/seq in.) |
| `createProjectCopy` | newPanels map :12814 | **Re-assign FRESH `quoteLineNo` 1..k** for the new BC project (do not carry source values), exactly as it already re-IDs panels (`id:"panel-"+(i+1)` :12817) and strips `bcLineNo` :12822. Reset `project.quoteLineSeq` to k. The copy calls `bcCreatePanelTaskStructure` at :12853 — that create must key on the fresh `quoteLineNo`. |

**Save-survival:** `saveProject` :10814 full-spreads `{...project}` (:10841 additive-field survival confirmed), so `quoteLineNo`/`quoteLineSeq` persist with zero serializer work. **Action item:** add `quoteLineNo`, `quoteLineSeq` to the preserved-flags comment and confirm no panel-sanitizer/BOM-normalizer strips unknown keys (same audit B065 S1 did for `bcTaskNo`).

---

## 3. THE CORE TENSION — options + recommendation (Jon call)

B065 LOCKED decision #2: "row reorder → keep BC bindings STABLE." Extended to lines: a **deleted line leaves a permanent gap** in BC task numbers (correct for BC — a posting task with cost/PO history must never be renumbered or reused). But a **customer-facing Quote Line # usually wants contiguous 1..n** on the printed quote. These conflict *only if they are the same rendered field*.

**Option A — one frozen number everywhere.** `quoteLineNo` shows on the printed quote as-is. After deleting line 2 of 4, the customer sees **Lines 1, 3, 4** (gap).
- Money-path: safest (zero divergence between what the customer sees, what ARC stores, and the BC task). Zero renumber logic = zero wrong-line risk.
- Cost: customer sees gaps; sales may dislike "why does my quote skip Line 2?"

**Option B — two numbers (RECOMMENDED).** Frozen `quoteLineNo` (the binding key; derives `bcTaskNo`; never changes; internal + BC) **plus** a **render-time contiguous display ordinal** computed at print (1..n over the stored `quoteLineNo` sort). Customer always sees 1..n contiguous; ARC/BC always use the frozen key.
- Money-path: the frozen `quoteLineNo` is the *only* thing that ever touches BC, so the DELETE/PATCH path is identical to Option A — safe. The contiguous ordinal is display-only, never persisted, never sent to BC.
- Cost: the printed "Line 3" ≠ the internal `quoteLineNo 4`. Mitigate by showing the stable key discreetly where ops need it (BC-task chip already renders `bcProjectTaskNo` on service cards :39102) and keeping the big customer-facing number contiguous. Acknowledge-prompt/F097 keys on the **frozen** `quoteLineNo` (stable across the panel's life), not the display ordinal.

**Option C — frozen key + explicit "display-renumber" action** that rewrites a separate `displayLineNo` on user command, never touching `bcTaskNo`/`quoteLineNo`.
- Money-path: safe (BC untouched) but adds a stateful field + a user action + a new "display vs binding drift" surface to reason about. More moving parts than B for no added safety.

**Recommendation: Option B.** It fully satisfies both masters with the least new persisted state: the customer sees a clean 1..n; BC and the binding layer see an immutable key that is *never* renumbered (honoring LOCKED #2 exactly). The contiguous ordinal is a pure function of the stored order at render time — the same shape as today's sort, minus the timestamp fragility. **Money-path reasoning:** the invariant "nothing that renumbers is ever sent to BC" is preserved by construction; the display ordinal lives only in the three render sites (§7) and cannot reach a PATCH/DELETE.

---

## 4. The N≥10 problem (concrete defect found)

The comment at :4251 (`201010 (N=10)`) reflects a mistaken digit-concatenation mental model; the actual arithmetic `20000+n*100+10` gives **21010** for N=10, and blocks are 100 apart so panels never arithmetically collide up to the 99999 project End-Total ceiling. But there are **three real breaks at N≥10**, one of them money-path:

1. **MONEY-PATH — resolver regex blinds itself to N≥10 posting tasks.** `resolveBcBindings` filters posting tasks with `postingTasks=out.tasks.filter(t=>/^20\d+10$/.test(_taskNoOf(t)))` (:4342). `^20…` matches N=1..9 (20110–20910) but **fails on 21010 (N=10), 21110 (N=11), …** — every posting task from the 10th line onward is invisible to the resolver, so those panels can never resolve `taskSource:'stored'/'description'` and fall through to positional/missing → exactly the wrong-line-write exposure Phase 2 exists to kill. **This regex MUST be fixed before Phase 2 activates on any ≥10-line job.** Correct predicate: a posting slot is any panel-band task where `(num-10) % 100 === 0 && 20110 ≤ num ≤ <cap>` (e.g. `/^2\d{4}$/` with the mod-100 test), not a literal `^20` prefix.
2. **Readability / any 3rd-char-is-panel assumption** breaks at N=10 (21010 is still 5 digits but "20"+N+"10" no longer reads off). Cosmetic; audit for any code that parses the panel index out of the task string.
3. **Ceiling.** N≥100 → 30010+ leaves the 2xxxx panel namespace; `base+99` must stay < 99999 (project End-Total) → hard arithmetic ceiling ≈ N=798.

**Recommendation: hard cap at 99 quote lines/panels per project.** Task band 20110–29910, clean 5 digits, ECO sub-slots (`base+30..+39` :3746/§S7) and eng (`base+20`)/end (`base+99`) all intact, zero collision, comfortably under 99999. 99 is far beyond any real ARC job. **Enforcement:** `allocateQuoteLineNo` / `allocatePanelBcTaskNo` return null past the cap; `addPanel` :39577 blocks the 100th add with a clear message (never silently mint an out-of-band task). Also **fix the misleading :4251 comment** and the resolver regex (#1). This is a Jon-confirm at approval (§9).

---

## 5. Activate B065 Phase 2 — forward-only slice

Each step has a **LIVE-BC GATE** (must be validated on a real ≥3-panel bound BC project before merge — a wrong binding baked in blind = Ryan's exact bug; per B065 Phase-2 preamble).

**S2 — Populate bindings from confirmed 2xx (forward-only).**
- `bcCreatePanelTaskBlock` :3716 (per-`addPanel` create) and `bcCreatePanelTaskStructure` :3603 (new-project + copy + relink) must **return the created posting task# from the 2xx** and callers persist `panel.bcTaskNo = postingNo`, keyed on `quoteLineNo` (not array index). Stamp `panel.bcTaskNo` only after a confirmed create; on failure leave null + route to the existing offline queue (:39599).
- `bcSyncPanelPlanningLines` :4408: on a new-line 2xx, persist `row.bcLineNo = line.Line_No`.
- **Audit for stray `bcTaskNo` carry** on the `addPanel`/duplicate-panel paths (B065 S1 note) — copy already strips at :12814/:12822; verify no other clone path carries it.
- **LIVE-BC GATE:** create a new 3-panel project → confirm each `panel.bcTaskNo` matches the 2xx task# and equals `20000+quoteLineNo*100+10`.

**S3 — Binding-driven money-path sync (the wrong-line fix).**
- In `bcSyncPanelPlanningLines` :4408 and `bcSyncEcoPanelPlanningLines` :4766: resolve the task via `resolvePanelTaskNo(project,panel,panelIndex)` :4277 (stored binding first), **not** the positional recompute at :4428–4429. Assign each row's `Line_No` from `row.bcLineNo`; allocate fresh via `allocateRowBcLineNo` :4262 **only if unbound**; remove the positional counter as authority.
- **DELETE guard (LOCKED #2/#3):** DELETE a BC line only if no ARC row is bound to it **AND** its part# matches no live row — the shipped `_b065RowBound` :4725 / `_b065EcoRowBound` :4899 guards, with MUST-FIX #2 applied (§6). On per-line 404, re-resolve by part#+Description+residual-order within the task (LOCKED #3 tiebreak), rebind, else push to `result.failed` (feeds B067/B064). Anchor `Line_No` (LOCKED #4 — no SystemId/GUID exists; do not trust `@odata.etag`).
- **LIVE-BC GATE:** on a bound ≥3-panel×≥3-row project — insert a BOM row → existing rows keep `bcLineNo`, only the new row gets a fresh Line_No, **no existing BC line PATCHed to a different part, no tail DELETE** (the money-path assertion). Reorder rows → BC lines untouched.

**S4 — Convert the forward-correctness call sites.** Convert the task-compute and panelIndex-passing sites B065 S4 enumerated **to the extent needed for forward correctness** (new-project, addPanel, both planning-line syncs, relink). **Recommended shape (B065 S4):** pass the **panel OBJECT** (now carrying `bcTaskNo` + `quoteLineNo`) into sync/patch fns and resolve inside; keep `panelIndex` only as a discovery hint so a caller *cannot* pass "just a number." Full ~27-site sweep can trail as cleanup, but the create + both sync paths + relink must be converted in this phase.
- **LIVE-BC GATE:** relink (§6 MUST-FIX #3) → tasks 1-based, no phantom 20010, old bindings cleared first.

**S6 — DEFERRED (legacy lazy migration).** Not built here. See §8 for legacy behavior in the meantime. The **ambiguity guard + `project.bcBindingUnresolved` destructive-write block** (LOCKED #1) is *designed and code-present in the dormant resolver* (:4373/:4402) — F098 does **not** wire it to the on-open path (that's S6/retrofit). But S3's per-op self-heal already honors `bcBindingUnresolved` if present (block destructive writes, require Jon reconcile).

---

## 6. The 4 B065 MUST-FIX items (folded in, at current v1.25.1 anchors)

1. **[MED, gate S3 read-authority] Description-discriminator.** Posting-task Description is `${panel.drawingNo||pfx} Rev … [qty]` (:3744; `pfx=PRJ###-{N*100}`). The resolver keys the task side on `_leadToken(t.Description)` (:4344, used :4365) and the panel side on `_leadToken(panel.drawingNo||drawingDesc||name)` (:4363). A **no-drawingNo panel** → task desc leads with the unique `pfx` while the panel side leads with name/desc → they never match, degrades to positional, AND the unique `pfx` tokens defeat the ambiguity flag → Ryan's no-drawingNo/duplicate case would auto-bind positionally, defeating LOCKED #1. **Fix:** key both sides on the same normalized field (compute the `pfx` panel-side, or match on the panel-name segment that actually appears in the Description) before making the resolver the read authority.
2. **[MED, before S2] cross-task Line_No collision.** `_b065RowBound` :4725 and `_b065EcoRowBound` :4899 scan the panel's **entire `panel.bom`** for `bcLineNo===ln`; base lines and ECO lines both number from 60000+ independently, so once populated an ECO row bound to 60000 would falsely "protect" a base orphan at 60000 (and vice-versa) — a DELETE-guard false-positive that leaves a stale BC line. **Fix:** scope each scan to the task's own rows (base loop → non-ECO rows; ECO loop → that ECO's rows).
3. **[LOW, before S2] relink clears bindings AFTER the sync loop.** In `relinkToBC` :43667 (task-structure create at :43771), the old-binding clear must move **ahead of** the sync loop — harmless today (dormant), stale once S2 populates. Clear all `bcTaskNo`/`bcLineNo` first (fresh BC project), then re-create/re-stamp with fresh `quoteLineNo` 1..k.
4. **[NIT] `descTokenCounts` dead code.** Computed at :4346–4347 but the ambiguity decision uses the `usedTaskNos`/`cands.length>1` path (:4367), not `descTokenCounts`. Drop it, or wire it into the ambiguity signal as originally intended.

---

## 7. UI + printed-quote display (replace timestamp sorts)

Replace the three `_ts` timestamp-sort blocks with the stored order, rendering the **contiguous display ordinal** (Option B) computed over the `quoteLineNo` sort:
- In-app line list :40843 (`_ts` at :40844, sort :40852) → sort by `quoteLineNo`; display ordinal = `idx+1`.
- Printed quote :24027 (`Line {idx+1}` at :24062) → same.
- PDF / quote-summary :8742 (`pi` loop :8751) → same.
Keep the panel/service-card interleave, but on `quoteLineNo` (shared sequence) instead of `createdAt`. Fallback for any not-yet-stamped line: retain the `createdAt`/id-timestamp `_ts` as a tiebreaker only (legacy safety, §8).

**F097 subsumed:** F097's acknowledge-prompt label should key on the **frozen** `quoteLineNo` (stable for the panel's life), making the prompt stable across reorders/deletes — F097 becomes trivial once `quoteLineNo` exists. Note this in the F097 record.

---

## 8. What legacy jobs do pre-retrofit (forward-only guarantee)

Existing projects have **no `quoteLineNo` and no `bcTaskNo`/`bcLineNo`** (S6 migration deferred). They MUST NOT break:
- **Display:** the render sites (§7) fall back to the existing `createdAt`/id-timestamp sort when `quoteLineNo` is absent (keep the `_ts` helper as the fallback branch). Legacy quotes render exactly as today.
- **BC sync:** with no stored bindings, `resolvePanelTaskNo` :4277 returns the **positional** task# (its existing fallback) — identical to today's behavior. Legacy jobs stay positional (status quo, including the known positional-drift risk) until the retrofit phase.
- **No auto-migration, no auto-bind-then-write.** Legacy jobs are never silently bound-and-PATCHed. The `bcBindingUnresolved` block (LOCKED #1) remains the retrofit-phase gate. A legacy job that gets a *new* panel added post-F098 will stamp `quoteLineNo` on the new panel (from the seq seeded off max-existing), but existing panels stay unstamped until retrofit — acceptable because display falls back and BC stays positional. **Flag, don't fix:** mixed-state jobs (some panels stamped, some not) are a retrofit-phase concern; note on the project chip but do not migrate here.

---

## 9. DECISIONS Jon must make at approval

1. **Tension A/B/C** — recommend **B** (frozen `quoteLineNo` binding key + render-time contiguous customer ordinal). Confirm.
2. **N≥10 cap** — recommend **hard cap 99 lines/panels/project**, fix resolver regex :4342 + comment :4251. Confirm the cap value and the block-vs-warn behavior at the 100th add.
3. **`quoteLineNo` = frozen N that derives `bcTaskNo`** — confirm the single-number model (`bcTaskNo = 20000+quoteLineNo*100+10`, populated from the confirmed 2xx) vs. two independent sequences.
4. **Service cards share the customer line sequence** — confirm panels + service cards draw from one `quoteLineSeq` (recommended, matches current interleave) vs. separate sequences.

---

## 10. Repro / acceptance suite (extends B065's)

Carry B065's 7 assertions (reorder-stable, insert-no-shift/no-tail-delete [money-path], row-delete-only-bound, delete+re-add panel fresh task, manual-BC-delete re-discover/fail-loud, relink 1-based no-phantom, legacy-open no-op). **Add for F098:**
- **A1 (allocator monotonic):** add 3 lines → 1,2,3; delete line 2; add → line **4** (never reuses 2); reload → order + numbers stable.
- **A2 (frozen key vs display, Option B):** delete line 2 of 4 → stored `quoteLineNo` = 1,3,4; **printed quote shows 1,2,3 contiguous**; each panel's `bcTaskNo` unchanged (no BC renumber).
- **A3 (N≥10 money-path):** create 10+ panels → panel 10's posting task 21010 is **found by the resolver** (regex fix) and binds `stored`, not positional; sync touches only its own lines.
- **A4 (cap):** 100th add is blocked with a clear message; no out-of-band BC task minted.
- **A5 (copy re-assigns):** `createProjectCopy` → fresh `quoteLineNo` 1..k, `quoteLineSeq`=k, `bcTaskNo`/`bcLineNo` cleared, new BC project's tasks key on the fresh numbers.
- **A6 (extraction binding, §11):** drop a drawing package on line 3 → pages inherit line 3's `quoteLineNo`; add-line-then-drop is the documented order.
- **A7 (legacy):** open a pre-F098 job → renders via `createdAt` fallback, BC sync positional, no migration, no crash.
- **A8 (service-card interleave):** panel(1), service(2), panel(3) by shared `quoteLineNo`; printed + PDF + in-app agree.

---

## 11. Extraction binding

A dropped drawing package (`addFiles` :28434) appends pages to a specific panel — the closure already carries `panel?.id`/`panelId` (:28448, :28455). **Pages inherit the panel's `quoteLineNo` implicitly** (they live under `panel.pages`; no separate stamp needed — the panel is the line). Extraction/BOM produced from those pages therefore associates to the same `quoteLineNo` → same `bcTaskNo`. **Intended order: add the quote line (panel) first, then drop drawings onto it** (matches today's UX — you drop onto an existing panel card). If a future "drop first, auto-create line" flow is wanted, that new panel goes through `addPanel`'s stamp (§2.3) and inherits a fresh `quoteLineNo` — no special case. Confirm no drawings can be dropped onto a not-yet-created line (they can't today; the drop target is a panel).

---

### Anchor index (current v1.25.1, `src/app.jsx`)
`addPanel` 39577 · positional n 39578 · `panelSeq` seed 39583 · `newPanel` 39584 · addPanel BC create 39595 · `addServiceCard` 39611 · `createServiceCard` 1664 (bcProjectTaskNo 1684) · `allocateServiceCardBcSlot` 1649 · `createProjectCopy` newPanels 12814 (strip bcLineNo 12822, copy task-structure 12853) · `saveProject` 10814 (spread 10841) · `bcCreatePanelTaskStructure` 3603 (callers 12596/12853/43771/49372) · `bcCreatePanelTaskBlock` 3716 (task math 3718, posting desc 3744) · `bcSyncPanelPlanningLines` 4408 (task recompute 4428) · `bcSyncEcoPanelPlanningLines` 4766 · `allocatePanelBcTaskNo` 4248 (N≥10 comment 4251) · `allocateRowBcLineNo` 4262 · `resolvePanelTaskNo` 4277 · `resolveBcBindings` 4300 (posting regex 4342, `_leadToken` 4344, `descTokenCounts` 4346–4347, panel disc 4363, ambiguity 4367/4373, unresolvedReason 4402) · DELETE guards `_b065RowBound` 4725 / `_b065EcoRowBound` 4899 · `relinkToBC` 43667 · display sorts: in-app 40843, printed quote 24027 (`Line` 24062), PDF/summary 8742 · service-card BC chip 39102.

> **Note on line drift:** B065 was authored at v1.24.38; its cited anchors have shifted. All anchors above are re-verified at current v1.25.1.

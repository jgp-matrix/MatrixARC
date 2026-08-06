# B107 / F095 — Labor Calculation Analysis + Build-Ready Plan

**Author:** Sam Wize (Coach) — architecture/analysis lane
**Date:** 2026-08-06
**Version analyzed:** v1.24.102 (`src/app.jsx`, 57,541 lines)
**Scope:** Money-path — panel labor cost → quote-line total → printed quote. Analysis only; no code changed.

> **Posture note:** the F095 divergence mechanism and the SSOT map below are **code-confirmed** (exact lines cited). The B107 *observed symptom* has a code-confirmed structural cause (surface has no working write path) but the precise surface Jon touched should be confirmed with a 30-second live repro before build — see B107 §"Decisive test." Per standing rule (never assume without a decisive artifact), do not build B107 until that repro pins the surface.

---

## 1. Current flow — code-confirmed data flow vs Jon's 6-step model

### The single source of truth
`computeLaborEstimate(panel)` (**:1095**) is the **one** function that turns labor inputs into `{lines, groups:{cut,layout,wire}, totalHours, totalCost}`. Every downstream labor consumer derives from it:

| Consumer | Line | Reads |
|---|---|---|
| Panel Summary LABOR palette (right pane, QuoteView) | :40834 | `computeLaborEstimate(sp)` → `.lines`, `.totalHours`, `.totalCost`, `.groups` |
| BOM labor rows (CUT/LAYOUT/WIRE) in the BOM table | :33737 → `_freshLabor` | `computeLaborEstimate(panel).groups` → row `qty = grp.hours`, `unitPrice = laborRate` |
| `buildLaborBomRows` (stored bom labor rows) | :1659 | same `.groups` |
| **Panel quote-line total** `computePanelSellPrice` | :1486, labor at **:1508** | `laborEst.totalCost` (NOT the BOM rows) |
| QuoteTab total | :23701–23706 | `project._quoteLabor` (aggregated per-panel `computeLaborEstimate`) or direct |
| **Printed quote PDF** labor summary | :9744 | `computeLaborEstimate(panel).lines` |
| Quote aggregation `_quoteLabor` | :42024–42047 | `panels.map(computeLaborEstimate)` summed |

**Crux answer (the money-path question):** the quote-line labor total and the printed quote read **`computeLaborEstimate(...).totalCost`**, *not* the sum of the BOM labor rows' `qty × unitPrice`. The BOM labor rows are a **derived display** of the same `computeLaborEstimate.groups`. Because both derive from one function, they currently agree — SSOT holds today (see §4).

### Mapping Jon's 6 steps to code

| # | Jon's model | Code reality | Verdict |
|---|---|---|---|
| 1 | Labor Categories auto-populated from extraction | `analyzeSchematicAndLayout` builds `panel.laborData.counts` (:16116–16171); `computeLaborEstimate` reads `counts` via `val()` (:1154) | **CONFIRM** |
| 2 | Category time → labor hrs in LABOR palette | palette (:41037) sums `laborEst.lines[].hours` into CUT/LAYOUT/WIRE (GDEF) | **CONFIRM** |
| 3 | Pre-added BOM rows (CUT/LAYOUT/WIRE) auto-populated with palette hour totals | `_freshLabor` (:33739) / `buildLaborBomRows` (:1668) set `qty = est.groups[k].hours` | **CONFIRM** |
| 4 | Each labor row: `Qty × Unit Cost = Ext$`, Unit shows "— auto" | Unit $ cell renders `— auto` for labor rows (:34345); Ext $ = `(unitPrice||0)*(qty||1)` (:34367); `unitPrice = laborRate` | **CONFIRM** (with a caveat, below) |
| 5 | Labor totaled in palette + added to materials → panel Quote Line total | `computePanelSellPrice` (:1497 materials, :1508–1511 labor, :1511 grandTotal, :1517 margin) | **CONFIRM** |
| 6 | Quote Line total on QUOTE SUMMARY + printed quote | palette sell (:41016), quote PDF (:9744+) | **CONFIRM** |

**The one divergence from Jon's mental model (important for F095):** In step 4/5 Jon pictures the quote total being *built up from* the BOM labor rows (Qty × Unit Cost, summed). **It is not.** The quote total is computed **independently** by `computeLaborEstimate` and the BOM rows are a *parallel derived view*. They match only because both read the same `groups`. **Any edit made to a BOM labor row's `qty` that does not flow back into `computeLaborEstimate` will change the displayed row Ext$ but NOT the quote total** — that is precisely the F095 hazard (§3).

### Rounding detail (ARC↔BC parity)
`groups` round **per group**: `cut.hours = Math.ceil(cutHrs)`, `cost = ceil(hours) × laborRate` (:1198–1200). BOM row `qty` = the already-ceiled group hours, so row Ext$ = `ceil(hrs)×rate` = group cost = the total's contribution. This per-group ceil is deliberate (DECISION v1.19.438/439) so the BOM Ext$ equals the palette total exactly. **Any F095 manual-entry must preserve this ceil-then-×rate discipline or ARC and BC labor planning lines will drift.**

---

## 2. B107 — "labor hrs/cost not updating when adjusting the right-pane Labor Category numbers"

### Where labor is editable today (complete enumeration)
1. **QuoteView Panel Summary → LABOR palette → "More Info" table** — the ONLY working labor-category editor. Editable `qty` input per category (:41078–41083) → `saveSelectedLaborOverride(l.field, v)` (:39559). Writes `laborData.overrides[field]`, calls `syncLaborBomRows`, `onUpdate`, `saveImmediatePanel`. **This path is code-correct on read** — the override wins in `val()` (`overrides[field] ?? counts[field] ?? …`, :1154), recompute happens every render, palette + total + BOM rows all re-derive.
2. **QuoteView palette top summary** (GDEF CUT/LAYOUT/WIRE hrs, :41037–41046) — **read-only display.**
3. **BOM table labor rows** (CUT/LAYOUT/WIRE) — **read-only for schematic panels**: the qty input is gated `readOnly = readOnly || (row.isLaborRow && !row._manualLabor)` (**:34288**), and `_manualLabor` is only `true` when `laborData === null` (:33743 sets it to `!!_est.isManual`; `isManual` is only set on the `!ld` branch, :1138). So on any panel that HAS schematic labor data, the BOM labor rows cannot be typed into.
4. **`saveLaborOverride` (:31489) in the PanelCard/FeedbackView — DEAD CODE.** Defined but never called and never passed as a prop (verified: only reference is the definition). **The main BOM editing view has NO functional labor-category editor and no labor palette** (PanelCard never calls `computeLaborEstimate` except to render the read-only BOM labor rows at :33737).

### Root cause (ranked)

**Primary (code-confirmed structural cause):** the surfaces where a user would *naturally* try to adjust labor have **no write path**:
- the palette's default CUT/LAYOUT/WIRE numbers are read-only (:41037) — the editable inputs are hidden behind the collapsed **"More Info"** toggle (:41056);
- the BOM labor rows are read-only on schematic panels (:34288);
- the FeedbackView labor editor is dead code (:31489).

So a user "adjusting the numbers under Labor Category" on any of those three surfaces sees **nothing update, because nothing is wired.** The only place edits take effect is the buried More-Info table in the Quote view.

**Secondary (must be excluded by live repro):** a genuine runtime state-propagation failure inside the working More-Info path (`saveSelectedLaborOverride`). Static read shows it correct, so if the repro shows Jon *was* in the More-Info table and it still didn't update, escalate to a runtime investigation (ARC Debug Logs first, then instrument `onUpdate`/`saveImmediatePanel` in the controlled tab).

### Decisive test (do this before building B107)
In the controlled tab, on a **schematic** panel (has `laborData`): (a) open QuoteView → Panel Summary → click **"More Info"** → change a category Qty (e.g. Panel Holes) → blur. **Expected if code-correct:** that line's Hrs/Cost, the CUT/LAYOUT/WIRE summary, the palette TOTAL, the panel sell price, and the BOM CUT row Qty all change together. (b) Then try to type into the **BOM CUT/LAYOUT/WIRE Qty** directly. **Expected:** read-only (no edit). Whichever surface Jon reported becomes the confirmed B107 surface. Most likely outcome: (a) works, (b) is read-only → **B107 is really "no editable labor at the surface I use," which F095 resolves directly.**

---

## 3. F095 — allow manual entry of BOM labor Qty (hours), safely

### The goal restated in code terms
Make the BOM labor rows' Qty editable such that, when edited, `computeLaborEstimate` **starts from those manual hours** (Jon's steps 1–3 become no-ops) and everything downstream (palette, quote line, printed quote, BC) reads the **same one number**. Auto mode (no manual entry) is unchanged.

### What broke last time — diagnosed
The earlier attempt is the **`_manualLabor` legacy path** (DECISION v1.19.816, :1108–1139). Its fatal limitation: the manual branch is **inside `if(!ld)`** (:1109) — it only runs when the panel has **no** `laborData`. Consequences on a schematic panel (the common case):
1. If BOM labor rows were made editable and stored `_manualLabor`/`qty` into `panel.bom`, `computeLaborEstimate` **ignored them** (it took the full `laborData` path at :1147) → the palette, panel sell price, and printed quote kept showing the **auto** labor cost while the **BOM row showed the edited qty** → the two **diverged**. That is exactly "messed up the labor cost reporting on the quote" — the on-screen BOM said one thing, the quote total said another.
2. The two auto-sync effects — PanelCard `[panel.id]` (:27619) and `[_laborSyncKey]` (:28229, key = `laborData`+`laborRate`+`laborHoursOverride`) — **rebuild the stored bom labor rows from `computeLaborEstimate` and would overwrite** any manual qty the moment `laborData`/rate changed.

So the previous design created a **second labor-total path** (BOM rows) that the quote didn't honor, and an overwrite race. Both violate the SSOT principle.

### F095 safe design — make the manual override a FIRST-CLASS branch of the ONE function

**Principle:** never sum BOM labor rows for the quote (already true). Instead, route manual entry **into `computeLaborEstimate`** so it remains the single producer.

**Recommended mechanism (Option A — per-category override, mirrors existing `overrides`):**

1. **Storage (additive, per-panel):** introduce a manual group-hours override, e.g. `panel.laborData.manualGroupHours = { cut, layout, wire }` (or `panel.pricing.manualLaborGroups`). Additive field; never removes existing data; preserved on save (data-retention §5). Also works for `laborData === null` panels (create a minimal `laborData` shell holding only the override).

2. **`computeLaborEstimate` new branch — placed ABOVE the `laborData` math**, after the `laborHoursOverride` total-override check (so precedence is: total override → **manual groups** → laborData auto → legacy `_manualLabor` → fallback):
   ```
   if manualGroupHours present:
     groups = { cut:{hours:mgh.cut, cost:ceil(mgh.cut)*rate}, layout:{…}, wire:{…} }
     build 3 synthetic lines (CUT/LAYOUT/WIRE) so palette + PDF render
     totalHours/totalCost from groups
     return { …, groups, isManualGroups:true }
   ```
   Keep the same **per-group ceil-then-×rate** as :1198–1200 for BC parity.

3. **BOM rows become the edit surface:** change the read-only gate at :34288 so labor-row `qty` is editable when the panel is in "manual labor" mode (not only when `_manualLabor`/`laborData===null`). On blur, **write the entered hours into `manualGroupHours[group]`** (map partNumber 1012→cut, 1013→layout, 1014→wire) — do **not** just mutate the bom row's qty. `_freshLabor`/`buildLaborBomRows` will then re-derive the row qty from the override on the next render, so the displayed row and the estimate can never disagree.

4. **Suppress the overwrite race:** in the two auto-sync effects (:27619, :28229) and in `syncLaborBomRows`, when `isManualGroups` is active the rows are still built *from the override* (which is the source), so there is no clobber — but confirm the effects don't reset the override. (Because the rows derive from the override, the "same?" guards at :27625/:28233 will already see no change.)

5. **Mode toggle + revert:** a small "Manual / Auto" affordance on the palette (badge already exists at :41025 — add a "Manual" state). Entering a manual value flips to manual; a "Revert to auto" clears `manualGroupHours` and steps 1–3 resume. This satisfies "manual DISREGARDS steps 1–3, starts at step 4."

**Why this is the single-source-of-truth guarantee:** every consumer in the §1 table still calls `computeLaborEstimate` and reads `.groups`/`.totalCost`. Manual mode only changes *what `computeLaborEstimate` returns*, not *who reads it*. There is no second total path; the BOM rows remain a derived view; the printed quote and QUOTE SUMMARY read the identical number in both modes.

**Alternative (Option B — single total override):** reuse the existing `laborHoursOverride` (:1102) which already bypasses everything and feeds one "Total Override" line. Simpler, but loses CUT/LAYOUT/WIRE granularity (BOM would show one labor line, not three) and doesn't match Jon's "labor Qty rows" framing. **Not recommended** unless Jon wants a single lump labor number.

---

## 4. SSOT check (CLAUDE.md "Single Source of Truth for Dual-Consumer Predicates")

- **Today:** labor total is produced once by `computeLaborEstimate`; palette, BOM rows, panel sell price, QuoteTab, and printed PDF are all dual+ consumers of that one function. **Compliant.**
- **Watch item:** `computePanelSellPrice` labor (:1508) and the palette display (:40836/40863) re-inline the *same expression* `hasAutoLabor ? totalCost : manualLaborCost` in three places (also QuoteTab :23706, PDF path). This is a mild re-inline — acceptable today because they read the same `laborEst`, but F095 must **not** add a fourth variant. Keep the manual-mode decision *inside* `computeLaborEstimate` (via `isManualGroups`) so these call sites don't each grow a manual branch. That is the SSOT-preserving move.

---

## 5. Data-retention (CLAUDE.md CRITICAL)

- `manualGroupHours` (or `manualLaborGroups`) is **additive** — never rename/remove existing `laborData.counts/overrides/accepted`.
- Must be **preserved on save**: add it to the panel-save field allow-list wherever `laborData` is persisted (:11024, :11093, :11158, and the pricing-snapshot fields near :10646). Verify it survives the save→reload cycle (it lives under `laborData`, which is already preserved, if stored there — preferred).
- **Per-panel scoped** (multi-project rule): it's on `panel.laborData`, so inherently per-panel. No module-scoped cache involved.
- Stripping rule: only `dataUrl` is stripped on save — `manualGroupHours` is metadata and must never be stripped.

---

## 6. Regression risks + quote-total assertions that MUST hold

**Assertions (add to the test plan; these are the money-path invariants):**
1. **A1 — quote parity:** `computePanelSellPrice(panel)` used by QUOTE SUMMARY == the value used by the printed PDF, in BOTH auto and manual modes. (Both must read `computeLaborEstimate`.)
2. **A2 — no divergence:** `Σ (BOM labor row Ext$)` == `computeLaborEstimate(panel).totalCost` for every panel, both modes. This is the exact invariant the last attempt broke.
3. **A3 — ceil parity:** manual hours flow through per-group `Math.ceil(hrs)×rate`, so ARC labor == BC labor planning lines (`bcPatchLaborPlanningLines`, :28253/:39573).
4. **A4 — revert restores auto:** clearing the manual override reproduces the pre-F095 auto totals bit-for-bit (regression baseline).
5. **A5 — ECO isolation:** ECO labor (`computeAllEcoLaborTotal`, :1247; ECO labor rows) is separate and additive; manual BASE labor must not double-count or alter ECO deltas (the ECO breakdown at :40986 reads its own path).

**Top regression risk (single most dangerous):** a manual edit that updates the **BOM row display** but not `computeLaborEstimate` → the on-screen BOM and the **printed customer quote total disagree** (assertion A2). This is the exact failure of the prior attempt and the reason to route edits into the override consumed by `computeLaborEstimate`, never into a standalone bom-row qty the quote ignores.

**Other risks:**
- Auto-sync effects (:27619, :28229) overwriting the manual value → mitigate per §3.4.
- `_quoteLabor` aggregation (:42024) sums per-panel `computeLaborEstimate` — inherits manual automatically if the branch is inside the function (good) — but verify the multi-panel quote reflects each panel's mode.
- BC lead-time / `computeControlPanelLeadTime` uses `computeLaborEstimate(...).totalHours` for `laborDays` (:1697) — manual hours will (correctly) change the ship date; confirm that's desired (Jon decision Q3).
- The dead `saveLaborOverride` (:31489) should be removed or wired as part of this work to avoid future confusion (out-of-scope cleanup candidate).

---

## 7. Test plan

1. **Baseline capture** (auto mode) on a schematic panel + a BOM-only panel: record palette CUT/LAYOUT/WIRE hrs, palette TOTAL cost, each BOM labor row Ext$, panel sell price, printed-quote labor block, BC labor planning lines. (Assertion A4 baseline.)
2. **B107 repro** (§2 decisive test) — confirm the surface.
3. **Manual entry** — edit each of CUT/LAYOUT/WIRE Qty in the BOM; assert A1–A3 after each edit (palette, BOM Ext$, sell price, PDF, BC all move together and agree).
4. **Save→reload** — reopen the project; assert manual values persisted (data-retention) and totals unchanged.
5. **Revert to auto** — assert A4 (exact pre-F095 auto totals return).
6. **Multi-panel quote** — one manual panel + one auto panel; assert the aggregated quote total = sum of each panel's `computePanelSellPrice` (A1 across panels).
7. **ECO panel** — assert A5 (ECO labor unaffected).
8. **BOM-only panel** (laborData null) — assert the legacy `_manualLabor` path and the new override don't conflict (pick one path; recommend the new override supersede legacy `_manualLabor`).

---

## 8. Effort + gate

- **B107:** **S** once the surface is confirmed. If it's "no editable surface where Jon looks" (most likely) → it's **subsumed by F095**, no separate fix. If the More-Info path shows a real runtime break → **S–M** runtime fix.
- **F095:** **M.** Touches `computeLaborEstimate` (one new branch), the BOM labor-row read-only gate + write path (:34288), the two auto-sync guards, a palette Manual/Auto affordance + revert, save allow-list, and BC labor sync verification. No new total path.
- **Gate:** money-path — full H-item discipline. Baseline → plan → **Coach review** → Jon approve → build → regression (assertions A1–A5) → Coach review → Jon final-approve → deploy (separate Jon-released checkpoint). Live verification in the controlled tab on both a schematic and a BOM-only panel, comparing the on-screen quote to the printed PDF.

### Jon decisions needed before build
- **Q1 — granularity:** manual override per-category (CUT/LAYOUT/WIRE, Option A — recommended, matches "labor Qty rows") or a single total (Option B, reuses `laborHoursOverride`)?
- **Q2 — revert UX:** explicit "Revert to Auto" button, or does clearing all three rows to blank restore auto?
- **Q3 — downstream:** should manual labor hours also drive **BC labor planning lines** and the **lead-time `laborDays`/ship date** (they will if routed through `computeLaborEstimate`), or should manual affect the quote dollars only?
- **Q4 — BOM-only panels:** supersede the legacy `_manualLabor` path with the new override (recommended, one mechanism), or keep both?

---

# B107 read-only-lockout investigation

**Added:** 2026-08-06 (Coach) — Jon dropped F095; B107 relabeled as "the labor-category editor was TRANSIENTLY frozen (reproduced once, worked on retry, then persisted). Find + fix/instrument the momentary read-only state." Analysis only.

## 0. The labor editor gates on ONE thing: the composite `readOnly`
The category Qty inputs Jon adjusts (QuoteView Panel Summary -> LABOR palette -> "More Info" table) render at **:41078** as `{l.field && !readOnly ? <input...> : <span>{l.qty}</span>}`. There is **no labor-specific enable flag** and **no per-field disable** — the input either renders (editable) or collapses to a static span, driven solely by the component-level `readOnly`. (The palette `$/hr` rate and margin inputs, :41010/:41030, gate on the same `readOnly`. The BOM-table labor rows have the extra `_manualLabor` gate at :34288, but those aren't the palette editor Jon uses.) So "what froze the labor editor" == "what made `readOnly` true."

## 1. Full enumeration of the `readOnly` composite (QuoteView, :41994)
```
_structuralReadOnly = isReadOnly() || lockReadOnly || sentReadOnly || reviewReadOnly
                       || customerReviewReadOnly || _baseScopeReadOnly || _ecoScopeReadOnly   (:42857)
readOnly            = _structuralReadOnly || leaseReadOnly                                     (:42861)
```

| # | Term | Line | Definition | Transient? |
|---|---|---|---|---|
| 1 | `isReadOnly()` | :2500 | `_appCtx.role==="view"` (view-only permission) | No — static per session |
| 2 | `lockReadOnly` | :42801 | `isProjectLocked(wonAt/lostAt) && !editUnlockedForAll && !(iAmOwnerOrAdmin&&lockOverrideSession)` (Won/Lost freeze) | No — needs a won/lost flip; session-unlock persists |
| 3 | `sentReadOnly` | :42802 | `_sentSoftBlockActive` = `quoteSentAt && !ack && !isProjectLocked` (sent-quote soft-block) | No — shows a confirm modal, persists until explicit ACK |
| 4 | `reviewReadOnly` | :42811 | pre/post review `pending` && not-assignee && no override | No — persists through the review |
| 5 | `customerReviewReadOnly` | :42814 | `customerReviewStatus==="pending"` | Mild — flips with an onSnapshot when a client-review opens/closes |
| 6 | `_baseScopeReadOnly` | :42841 | base scope + ECOs exist + `!baseUnlocked` | ECO-only |
| 7 | `_ecoScopeReadOnly` | :42842 | ECO scope + not the active draft | Yes (documented race) — see section 2 |
| 8 | `leaseReadOnly` | :42322 / :42719 / :42887 | B012 editing lease held by another uid **or my own other tab** | Yes — prime suspect — see section 2 |

**Owner-priority is NOT in this composite — REFUTED as a labor-editor gate.** `ownerPriorityActive` (:42307) is computed separately and passed as its own prop; it gates the 13 destructive actions (re-extract, refresh pricing, send, etc.), **not** field/labor edits. The labor input never reads it. So owner-priority soft-lock cannot freeze the labor editor. (Caveat: owner-*presence* can seed an editing *lease* — see 2.3 — but that surfaces via `leaseReadOnly`, term #8, not via owner-priority.)

**`manualVerifyRequired`, `bcDisconnected`, hard-project-lock (task running), `_baseLockedInEco`:** none appear in the labor-editor gate. `_baseLockedInEco` (:33936) is per-BOM-row in the table, not the palette. BC connection state does not gate labor edits. So all four are REFUTED for this editor.

## 2. Ranked transient culprits (confirmed against code)

### #1 — `leaseReadOnly` (B012 editing lease) — CONFIRMED textbook match
- Constants (:856-857): `LEASE_STALE_MS = 90000` (90s reclaim-after-last-heartbeat / crash window), `LEASE_HEARTBEAT_MS = 30000` (30s renew).
- `leaseReadOnly` is TRUE when a **live** lease (`editingExpiresAt > now`) is held by **another uid OR my own other tab** — init seed (:42322-42324), authoritative mount-snapshot guard (:42719), and the claim/heartbeat tick (:42887). The tick auto-**re-acquires** the moment the holder cleanly exits (`beforeunload` release, :42896) or the lease goes stale (>90s no heartbeat), then flips `leaseReadOnly=false`.
- **Why it matches Jon's symptom exactly:** if Jon had ARC open in a second tab/session — **including the Claude-controlled tab**, or a tab that was closed uncleanly (browser discard / crash / no `beforeunload`) — that tab's lease persists up to **90s**. During that window his editing tab is `leaseReadOnly=true` -> labor editor (and everything) read-only. On retry after the stale lease expires (<=90s) or the other tab releases, the 30s tick re-acquires -> editable, and stays editable ("persisted"). Reproduced-once-then-worked-then-persisted is the exact signature of a stale-lease reclaim.
- **Caveat that must be checked with Jon:** the lease freezes the **entire** BOM/pricing surface, not just labor. If Jon saw only the *labor* number stuck while other fields were editable, it was **not** the lease — jump to 2.3 (input-remount).
- A genuine other-holder lease also pops the `leaseModal` (:44757, "another user / your other tab is editing"). The **init-seed and mount-guard paths (:42322/:42719) set `leaseReadOnly=true` WITHOUT the modal** — so a *silent* read-only flash with no modal points at those seed paths (e.g. the 2.3 self-owned-null-tab case), whereas a modal means the tick saw a real foreign holder.

### #2 — ECO-scope onSnapshot lag (`_ecoScopeReadOnly` / `_baseScopeReadOnly`) — CONFIRMED, ECO-only
- Documented race at :42827-42839: right after **+ New ECO**, the optimistic `activeScope` flips to the new ECO immediately but Firestore's `ecoSummary` snapshot lands ~500ms-1s later; in that gap `_activeEcoIsCurrentDraft` is false -> panels grey out / edits go read-only, then auto-clear when the snapshot arrives. Already partially mitigated by the `_maxDraftNum` loosening. Only fires on ECO projects. Secondary.

### #3 — labor-specific uncontrolled-input remount race — the only "labor-only" explanation
- The palette qty input is uncontrolled: `defaultValue={l.qty} key={l.field+"-"+l.qty}` (:41079). If an `onSnapshot` soft-apply (or any parent re-render that changes `l.qty`) lands **while Jon is mid-edit**, the changed `key` **remounts** the input and discards his in-progress typed value -> "the number won't change." No concurrent snapshot on retry -> it commits. This is the **only** candidate that would freeze labor *without* freezing other fields. It self-corrects, consistent with "then it worked." Not a hard read-only — an input-identity race.

## 3. Fix-vs-instrument recommendation

**The structural terms (#1-#8 in section 1) are deliberate data-safety locks — do NOT loosen them.** The lease (#8) is the specific guard against two tabs/users clobbering one project; won/lost/sent/review freeze genuinely protected states (Firestore rules enforce the backend half). Loosening any to "make labor reliably editable" would risk enabling edits during a real lock -> data clobber (see section 4). So there is **no safe deterministic "open the gate" fix** for the lease/lock terms.

**Primary recommendation: INSTRUMENT** (the honest answer, since it's not currently reproducible). Capture the exact gate breakdown the next time the editor is read-only, to ARC Debug Logs.
- **Where:** immediately after `const readOnly=...` at **:42861**, add a `useEffect` that fires when `readOnly` transitions **false->true** (dedupe — log once per transition, not per render), writing an `info`/`warn` Debug Log entry with the full term vector + lease identity:
  `{isRO:isReadOnly(), lock:lockReadOnly, sent:sentReadOnly, review:reviewReadOnly, custRev:customerReviewReadOnly, baseRO:_baseScopeReadOnly, ecoRO:_ecoScopeReadOnly, lease:leaseReadOnly, editingBy:project.editingBy, editingByName:project.editingByName, editingTabId:project.editingTabId, editingExpiresAt:project.editingExpiresAt, myTab:_ARC_TAB_ID, myUid:uid, ts:Date.now(), projectId:project.id}`
  Use the existing debug-logging pipeline (`companies/{cid}/debugLogs`, per CLAUDE.md "Debug Logging" — check Debug Logs first). This deterministically tells us which term fired the next time Jon (or anyone) hits it — no guessing.
- Optional companion: log on the read-only **span** render branch at :41078 when `l.field && readOnly` (i.e. the user is looking at a would-be-editable labor cell that's locked), so we also capture *labor-cell-specifically-blocked* events.

**Secondary (narrow deterministic fix, safe): the self-owned null-tab lease false-positive.** The seed/guard checks (:42323, :42719) treat a lease `editingBy===uid && editingTabId===null` as "someone else" (`!(uid===uid && null===_ARC_TAB_ID)` -> true -> read-only), even though the tick (:43784) is designed to **adopt** a null-tab self-lease. This bites after a review hand-back to the owner (:39709 writes `editingBy:createdBy, editingTabId:null`): the owner's first render flashes read-only until the async tick adopts. **Fix:** in :42322/:42719, also treat `editingBy===uid && !editingTabId` as adoptable (not read-only). This only ever loosens the lock for **my own** untab-bound lease — never another user's — so it's data-safe. Narrow (review-handback only); likely not Jon's everyday case, but a real correctness bug worth folding in.

## 4. Data-safety concern with loosening any read-only gate
The labor editor writes `panel.laborData.overrides` and re-syncs BOM labor rows -> **money-path**. Enabling it during a genuine lock is exactly what these gates prevent:
- **Editing lease (#8):** two tabs/users editing the same project concurrently = last-write-wins clobber of BOM/pricing/labor. The lease is the client half of a server-enforced guard (`firestore.rules isEditingLeaseLocked`). Do not bypass it broadly.
- **Won/Lost & sent-quote (#2/#3):** editing a frozen/sent quote silently changes numbers a customer already holds.
- **Review locks (#4/#5):** only the assigned reviewer (or admin override) may edit during review.
So the fix must be **instrument-then-target**, or the surgical self-lease correction in section 3 — **never** a blanket relaxation of `readOnly` for the labor inputs. Any future targeted fix must keep the invariant: the labor editor is enabled **iff** the same rule allows editing every other BOM/pricing field (single composite `readOnly` — do not fork a labor-only enable path, which would violate the SSOT principle and could enable labor edits during a real lock).

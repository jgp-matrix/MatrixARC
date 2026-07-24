# Session State — 2026-07-23 MDT · prod ACTIVE at v1.24.32 · PRJ402119 pricing-incident firefight + big feature batch

## Operating model (READ FIRST)
**Subagent-lane model is the default** (Jon's standing preference). One Freddy session in CCD with full repo access spawns **Marc** (build/fix) + **Coach** (review/diagnose/scope) as in-session Agent-tool lanes, **role-announced every spawn**; Freddy is sole git-writer + sole notifier, owns Dez's files (STATUS.md/INBOX.md) directly. Money-path/data-safety = Coach review before prod; high-blast-radius writes get a Jon controlled-test-push before trusted live. Startup: `/ARC-team-Startup`; close-out: `/ARC-team-Closeout`. Full spec: FREDDY.md + memory `feedback_subagent_lane_model_preferred`.

## ★ CRITICAL — pricing is RFQ-ONLY right now (do NOT "fix" the disabled auto-pricing)
After the PRJ402119 junk-price incident, **auto-pricing is intentionally OFF** via kill-switches (all `false`, ~`src/app.jsx:5506-5518`): `SCRAPER_BC_WRITEBACK_ENABLED`, `AUTO_BC_REPRICE_ENABLED`, `AUTO_PRICING_ENABLED`. "Get New Pricing"/"Refresh All" alert "paused — send an RFQ"; the 5-min poll + on-open price-check are gated off. **This is deliberate — Jon: "we won't re-enable auto-pricing for a while... just use RFQs."** See memory `project_rfq_only_pricing_mode`. RFQ path audited GO.

## Version
**v1.24.33** (PRODUCTION) — 2026-07-23. Session ran **v1.24.13 → v1.24.33** (~110+ commits). `master == origin/master`, working tree clean. Prod ACTIVE (Jon back, no freeze).

## The PRJ402119 pricing incident (root cause + resolution)
A quote shipped with wrong pricing (a ~$6000 item quoted at $12). **Root cause:** the Royal Wholesale (V00373) scraper's "first `$` on the page" extraction wrote garbage **$0.71** (+ **$1.24**) into BC PurchasePrice records across many parts; ARC's fetch (newest-Starting_Date-across-vendors) picked the junk. **Resolved:** contained (all auto-pricing OFF, RFQ-only), junk cleaned (F051j — expired in the connected sandbox BC), write-path prevention shipped (B057), primary-vendor selection live (F041 core).

## Shipped this session (all committed + deployed to prod; money-path items Coach-reviewed + Jon-verified)
- **Containment kill-switches** — auto-pricing/scraper/AI-estimate all disabled (RFQ-only).
- **B052** — 5-min BC poll divergence guard (don't auto-apply a large downward swing; flag `bcPollDivergence`, now a red-row trigger).
- **F045** — Budgetary checkbox = Manager/Admin only.
- **F057 (+ext)** — customer-supplied / vendor=customer $0 rows show **"CS"** instead of $0.00 (internal BOM only).
- **F058** — removed the misleading per-line-card + service-card status pills (Quote Summary is the status SSOT).
- **F059** — **"Mark Committed (no re-send)"** button: re-anchors a sent+diverged quote back to Quotes-Sent without emailing (clears the IN-PROCESS drift backlog).
- **F060** — To-Do/Dashboard restructure: Needs-Attention top-5 (rail) / full (dashboard), new **QUOTES EXPIRING** list, dashboard = 3 equal cols (Needs Attention | Quotes Expiring | ARC Notifications; email col removed), $ totals, "5 of N" header link.
- **F061** — removed the ACTIVE ECO status column; ECO projects route to their real columns (red tile border retained).
- **F051j** — **Expire Junk BC Prices** admin tool (scan → key-verify → expire); cleaned the $0.71/$1.24 junk on the connected BC.
- **B057** — BC PurchasePrice write path now **supersedes + expires the old price** (fixes the composite-key PATCH + fresh-etag; manager-override on nothing here — this is the write path). Verified via Jon test push.
- **F044** — block quote Send on ANY red row (manager/admin get a destructive force-send override; non-managers hard-blocked; print + BOM-review send left un-gated per Jon).
- **F046/F047** — per-row `priceSetBy`/`priceSetAt` stamp (~35 write sites) + hover "Priced by {who} · {date} · {source}" (forward-only; old rows show "not recorded").
- **B056** — trailing-dot hostname boot guard (index.html) — self-corrects a dotted host before load (that cascade broke the whole app + BC this session; can't recur).
- **B055** — BC Item Browser results-table overflow fixed (far-right toggle reachable; vendor cell ellipsis).
- **G018** — Debug Logs from/to date-window filter (reach entries past the 500-row cap).
- **G016/G017/F042** — To-Do UI (shrink tiles, independent rail scroll, all-projects Needs-Attention).
- **RFQs-to-Send** — rail "Pending RFQs" → "RFQs to Send".
- **G019** — hid all Engineering Questions UI behind `QUESTIONS_ENABLED=false` (reversible; data untouched).
- **F063** — QUOTES SENT column OFF the default Sales board (a **"SHOW SENT"** header toggle re-appends it) + a new **QUOTES SENT** column on MY DASHBOARD (between Quotes Expiring and ARC Notifications → 4 cols).
- **F064** — active-ECO projects sort to the TOP of their status column (stable sort preserves the rest).

## Open items (full detail + status in INBOX.md triage log)
- **gap5b-f015** — editing-lease ghost fix (the "read-only / cross won't save" trap that hit Jon today). BUILT + reviewed on branch `gap5b-f015`; held for a multi-device verify (Jon + Andrew + 2nd device). **Highest value-for-effort.** (Same-user reopen half is solo-testable.)
- **Quote Lifecycle & Lock epic** (`docs/QUOTE-LIFECYCLE-LOCK-EPIC.md`): **F048** (truly lock a sent BOM — the real prevention for the IN-PROCESS drift F059 cleans up) + **F049** (PO-receipt reconcile) + **F051** (send-time freshness gate) + **F052** (expired-quote at PO). Scoped, needs D1–D5 decisions.
- **F050** — send-time price-plausibility gate (read-only sweep tool exists; wire the send-gate).
- **F062** — dynamic "RFQs to Send" → "RFQs to Accept" (needs supplier-submission status plumbed into the rail).
- **Parked:** B053 (auto-check repeat-nag, mostly moot now), B054 (auto-assign non-existent "ROYAL - SALT LAKE CITY" vendor).
- **Deferred — pricing re-enable prereqs (per "not for a while"):** F041b skip-expired fetch, write-side plausibility gate, scraper extraction fix, F041 dormant edges + broader Primary/Secondary supplier matrix.

## Pending Jon / notes
- **F051j BC scope:** the cleanup hit the **connected sandbox** BC (`MATR_SndBx`). Jon plans a batch Item-DB move to the prod DB; if the target's PurchasePrices are separate, re-run F051j connected to it (tool is reusable + preview-first).
- **F046/F047 are forward-only** — can't retroactively trace who set pre-deploy prices.
- Marc flagged a separate dead `showAiQuestions` modal (out of G019 scope) — sweep later if desired.

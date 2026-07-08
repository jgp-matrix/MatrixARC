# G005 — Test Environment Isolation — Analyst Brief

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-07 · **Status:** Brief → awaiting Jon's strategic direction → Coach feasibility/build plan
**Priority:** ⚠ ESCALATED (2026-07-07) — was "backlog infra, safe for now"; the PRJ402096 near-miss proved the hazard is LIVE.

---

## 1. Problem statement

`matrix-arc-test.web.app` is **not an isolated test environment**. It is a second Firebase *hosting target* inside the single `matrix-arc` project, serving the **same `public/` bundle** with the **same hardcoded `firebaseConfig`** (`projectId: "matrix-arc"`). Therefore test shares with prod:

- **Firestore** (same DB — all `users/`, `companies/`, projects, learning DBs)
- **Auth** (same user pool)
- **Storage** (same buckets — page images, PDFs)
- **Cloud Functions** (same deployed functions)

There is **no test-vs-prod detection anywhere in the code** (confirmed: no `hostname` check, no `IS_TEST_ENV` flag). The test build is byte-identical to prod.

### Why it's now urgent (not pre-launch-theoretical)
The 2026-07-02 assumption "safe for now, all data is pre-launch/test" is **broken**: real customer projects already exist in the DB. Proven 2026-07-07 — a B009 repro on `matrix-arc-test` injected synthetic supplier-crosses onto **11 BOM rows of PRJ402096, a real customer project** (restored, no data lost), **and pushed synthetic purchase prices into Business Central** for 2 real items (B98110019 $42, 1032264 CS $99.99). A "test" action reached real customer data **and** the accounting system of record.

## 2. Two axes of isolation (both required)

| Axis | Systems | Current state |
|------|---------|---------------|
| **A. Firebase data** | Firestore, Auth, Storage | Fully shared with prod |
| **B. External side-effects** | Business Central (ERP), SendGrid (email), Anthropic (API spend) | Fully shared — **BC bit us hardest; orthogonal to any Firebase fix** |

**Key insight:** solving Axis A alone (e.g. a separate Firebase project) does NOT stop test actions from writing real BC / sending real emails. Axis B needs a test-mode routing story regardless of the Axis-A choice.

## 3. Options for Axis A (Firebase data isolation)

### Option A1 — Separate Firebase project (`matrix-arc-test` as its own project)
- **Isolation:** Full — separate Firestore, Auth, Storage, Functions.
- **Work:** New Firebase/GCP project; test bundle must load a **different `firebaseConfig`** (select by hostname at runtime); deploy Functions + rules + indexes to BOTH projects (ongoing sync burden); separate API keys/secrets; optional seed/copy of realistic test data.
- **Cost:** A second set of Cloud Functions + second Anthropic/SendGrid usage (test volume low). Ongoing: keep two projects in sync.
- **Verdict:** The "proper" long-term fix. Highest isolation, highest setup + maintenance.

### Option A2 — Named Firestore database (multi-DB in same project)
- **Isolation:** Firestore data only. **Auth + Storage still shared.** Firestore **triggers are per-database** — every trigger (`onSupplierQuoteSubmitted`, ECO triggers, etc.) would need re-registration for the test DB. Does **nothing** for BC/email.
- **Work:** Runtime DB-name switch (`getFirestore(app,'test')`) threaded through every Firestore instantiation + all trigger registrations.
- **Verdict:** Partial + fiddly (trigger duplication). Doesn't close the blast radius. Not recommended as the primary fix.

### Option A3 — Firebase Emulator Suite (local)
- **Isolation:** Full, local, free, zero prod risk.
- **Work:** Run emulator locally; seed data.
- **Trade-off:** **No hosted URL** — breaks Jon's "open the test site in any browser and click around" workflow; doesn't exercise the real deploy path. Best as a *dev/automated-test* tool, not a replacement for a hittable test URL.
- **Verdict:** Complementary, not a substitute for hosted test.

### Option A4 — Test-mode guards + dedicated test company (same backend, hostname-gated)
- **Isolation:** No true DB isolation (same Firestore), BUT: (a) a runtime `IS_TEST_ENV` flag (hostname === test) namespaces all test work under a **dedicated test company/user** so it structurally cannot touch real customer projects; (b) same flag hard-disables/sandboxes external side-effects (Axis B).
- **Work:** One flag + guards at each external-side-effect site + a test-company convention + a visible "TEST MODE" banner.
- **Trade-off:** Relies on guard correctness (the very class of thing that bit us) — but a small, auditable set of choke points.
- **Verdict:** Cheapest meaningful improvement; directly targets the two real harms.

## 4. Axis B (external side-effects) — required under every Axis-A choice

Introduce a single `IS_TEST_ENV` flag (runtime, `location.hostname === 'matrix-arc-test.web.app'`), then:
- **BC writes** → no-op in test (or route to a BC sandbox *company* if one exists — open question for Coach). Covers purchase-price push, lead-time writeback, PO create/patch.
- **SendGrid emails** → suppressed / redirected to a test inbox in test.
- **Anthropic** → allowed (needed to test extraction) but consider a lower spend cap.
- **Visible TEST-MODE banner** so anyone on the test URL knows.

## 5. Recommendation — phased

**Phase 1 (fast, stops the bleeding): A4 + Axis-B firewall.**
Add `IS_TEST_ENV`, gate all external destructive side-effects behind it (BC no-op, email suppressed), namespace test work under a dedicated test company, show a TEST-MODE banner. This directly prevents both harms from the near-miss (real-data collision + real BC writes) at modest cost, without a new project.

**Phase 2 (proper, later): A1 separate Firebase project.**
When justified, stand up `matrix-arc-test` as its own project with a hostname-selected `firebaseConfig` and dual-deploy of Functions/rules/indexes. Full data isolation. Phase 1's `IS_TEST_ENV` flag is reused (still needed for BC/email).

Rationale: Phase 1 closes the actual, demonstrated risk quickly; Phase 2 is the durable architecture for when there's a real customer base and higher test volume. They compose — Phase 1 is not throwaway.

## 6. Open questions for Coach feasibility pass
1. Does BC have a **sandbox/test company** available, or is "disable BC writes in test" the only Phase-1 option?
2. Enumerate **every external-side-effect site** (BC: price push, LT writeback, PO create/patch; SendGrid: which callables; Anthropic: extraction + supplier + monitor) to size the Axis-B guard surface.
3. Confirm the `firebaseConfig` swap mechanism for Phase 2 (bake test config, select by hostname) — any hardcoded `matrix-arc` refs beyond index.html?
4. Deploy-pipeline changes: `deploy.sh` currently only deploys `hosting:production`; how does test get its build + (Phase 2) its own functions/rules?

## 7. Routing
Freddy Brief (this doc) → **Jon picks strategic direction** (phased / full-now / guards-only / emulator) → **Coach** feasibility + build plan (answers §6, sizes the guard surface) → Jon approves → **Marc** builds → verify → deploy. High-stakes (entire data layer + ERP) → full cross-check pipeline, standing sessions.

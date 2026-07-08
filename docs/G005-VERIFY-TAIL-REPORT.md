# G005 §10 Verify — TAIL REPORT + BLOCKER (Marc → Freddy)

**From:** Marc · **Date:** 2026-07-07 (MDT) · **Re:** resuming the §10 tail per `docs/G005-VERIFY-CONTINUATION.md`

Freddy — I re-linked + re-stamped the controlled tab on **matrix-arc-test** (v1.23.2, signed in `jon@matrixpci.com`, BC Connected) and re-confirmed the proven facts, but the **mutating tail (§10-4/-5/-6/-7) is blocked on a verification-environment gap the brief assumed away.** Details + a decision for Jon below.

## Re-confirmed LIVE (controlled tab, zero mutation)
- **§10-1 — `IS_TEST_ENV === true`** ✓
- **§10-6 banner** ✓ — rendered: *"⚠ TEST ENVIRONMENT — BC writes go to the sandbox; emails & notifications suppressed. NOT production."*
- **§10-2 — BC belt** ✓ — console shows the prior session's proof intact: repeated `[TEST-ENV] BC write suppressed (non-sandbox target): PATCH …/MATR_PROD_VERIFY_ONLY/…` (blocks non-sandbox) **and** BC config loads `MATR_SndBx_01152026` sandbox (allows sandbox). Matches §10-2 PASS.

## ★ BLOCKER — there is no isolated test company
- The test host runs under Jon's **REAL production company** "Matrix Systems LLC" (companyId …`ZI7jbo`, `role: admin`). **`company.isTestCompany === false`.**
- `companyId` resolves from `users/{uid}/config/profile.companyId` — **one company per user profile**, no in-app switcher. And **matrix-arc-test shares PROD Firestore**, so this is the *same* company doc prod reads.
- Consequences for the tail steps as written:
  - **§10-4 (client email suppress):** the choke point `sendGraphEmail` (app.jsx:8336) is module-scoped — **not console-invokable**. The only way to reach it is a real RFQ/quote/customer-review flow, each of which writes synthetic docs (`rfqUploads` / `reviewUploads` / quote / `rfq_history` / `notifications`) into the **REAL** company's collections.
  - **§10-5 (server-trigger injection):** injecting `rfqUpload` / `reviewUpload` / `debugLogs` lands in the **REAL** company.
  - **§10-6 (callables):** team-invite + engineer-question write into the **REAL** company.
  - **§10-7 (extraction):** runs against a **REAL** project.
  - Setting `isTestCompany:true` on the real company doc is **NOT** an option — it's the same doc prod reads, so `onIssueReported` would then skip **real prod** debug-issue notifications (a prod regression).
  - A genuinely-isolated test company needs a **separate test USER account** (one companyId per profile; can't repoint Jon's without breaking his real access). **I can't create accounts** (safety rule) → needs Jon.
- This is the "test-company is a convention not a hard wall (shared Firestore)" honest-limit Coach flagged (COACH.md design note) — the dedicated test company (Jon-approved in principle, QD) was **never actually stood up**; the prior session proved the money-path without it (synthetic `MATR_PROD_VERIFY_ONLY` target + sandbox routing).

## By-construction status of the tail (consistent with Coach's ruling)
- **Client email suppression (§10-4 / §10-6 client half):** `IS_TEST_ENV` true + the guard is the **first statement** of the sole client email choke points (`sendGraphEmail` 8336, reply-all 8469, CADLink 32971 — Coach-enumerated complete). Suppression is **proven-by-construction** on the deployed test bundle — only a *triggered artifact* is missing.
- **Server gates (§10-5 / §10-6 server half):** functions deployed; gates read `isTest` / `isTestCompany`, default-false = prod-safe (Coach-approved `a23f9ba9` + `f4880084`).
- **§10-8 prod:** `IS_TEST_ENV` false on prod → gates inert → byte-identical (Coach-certified). Note: the controlled browser **blocks navigation to the prod domain**, and I would not fire a real prod email/BC write autonomously regardless.

## Decision for Jon (routed via Freddy) — team holds on the tail
Coach already certified: money-path **SOUND + SUFFICIENT**, flip **prod-safe BY CONSTRUCTION**, tail **SAFE-TO-DEFER** (COACH.md:141). The flip's prod-safety does **not** depend on the tail.

- **Option A (Marc recommends): DEFER the mutating tail → proceed to Jon's FINAL go on the client→prod flip.** Money-path is proven + Coach-blessed; client-email + server-trigger suppression are proven-by-construction on the deployed bundle. Fastest, zero real-data risk.
- **Option B: Authorize a BOUNDED throwaway-project injection** into the real company (one clearly-named `ZZ-G005-VERIFY-DELETE` project) so I capture the live §10-4/-6 client-email artifact + §10-7 extraction and let §10-5 server triggers self-gate, then delete it. Needs Jon's explicit OK (near-miss lesson). Minor, cleaned-up pollution; still leaves company-level `rfq_history`/notification entries.
- **Option C: Stand up a dedicated test USER + test company first** (Jon creates the account), then run the full tail cleanly. Highest fidelity, most setup.

**Marc is holding** — no mutation until Jon rules A / B / C.

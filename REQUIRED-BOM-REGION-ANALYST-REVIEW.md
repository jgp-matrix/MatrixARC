# REQUIRED BOM REGION — ANALYST REVIEW (FINAL SPEC)

**Author:** Freddy Lyst (Analyst), with Jon's resolved decisions
**Date:** 2026-06-05
**Status:** Final spec — Detailed Plan authored by Coach

---

## Resolved decisions (Jon)

- Modal copy (1c): use the "tell them why" versions below.
- No-PDF backfill (1d): LAZY. Mostly test projects — no proactive mass-flagging.
- Voting N (2): N=3 default, CONVERGENCE-based extension. After pass 3, if consensus
  is still rising (3rd pass resolved >=1 previously-divergent row, OR item-aligned
  agreement rose materially pass 2->3), run pass 4; reapply test 4->5; hard cap N=5;
  plateau by pass 3 -> stop. NOT monotonic. Caveat baked in: raises consensus not
  correctness; correlated misreads survive/strengthen; UI must NOT claim "verified."

---

## PHASE 0 — Large-PDF timeout (SPLIT into 0a diagnose / 0b fix)

0a. DIAGNOSE FIRST (no fix prescribed):
    - Add stage-timing instrumentation (Date.now() deltas: download / parse / slice /
      prompt / API call) per Coach Supplement. Deploy, re-extract PRJ402101, read where
      the 480s+ actually goes.
    - Simultaneous cheap try: bump extractBomPage memory 1GB->2GB (match extractBomBatch,
      line 2323). If the same PDF succeeds under 2GB, memory was the answer.

0b. FIX (mechanism determined by 0a):
    - If download/parse/memory bound -> page-scoped load / memory / buffer-surgery.
    - If MODEL-LATENCY bound on the large embedded bitmap -> the fix is CropBox
      (Phase 1 viewport reduction). THIS INVERTS SHIP ORDER: Phase 0b would ship WITH
      Phase 1, not before. Decide ship order AFTER 0a reports.
    - L1 (Coach concern): move the AbortController start to function entry, not the
      fetch call — current 480s AC on a 540s CF leaves no margin if pre-API work runs
      long. Fold into 0b regardless of bottleneck.

ACCEPTANCE: 2.9MB/20+ page PDF extracts one BOM page well under 540s with margin for
a future N=3 (to N=5) voting pass.

NOTE: ship-order of Phase 0b vs Phase 1 is now CONDITIONAL on 0a. Flag for Jon once
0a data exists.

---

## PHASE 1 — Required BOM region + quality gate + 0-byte hardening

### 1a. Detection report
Detection EXISTS (detectPageTypes, 5 types, per-page tags + pre-extraction banner
already surfaced). Build only the MISSING piece: an aggregate summary
("Auto-detected: N BOM, N SCH, ..."). Gate reads existing page.types /
page.aiBomRegion — NO new detection pass.

### 1b. Branch engine — CORRECTED per Coach blindspot finding
Do NOT route off assessPdfPageQuality alone — it is BLIND to vector-stroke
(hasVectorText:true, isScanned:false, warningLevel:'none' on geometry-rendered BOMs).
REQUIRED: supplementary text-extraction check — pdf.js getTextContent() on the BOM
region, count chars:
  - chars present (real BOM text) -> text-layer tier
  - zero chars + hasVectorText -> VECTOR-STROKE tier
  - embedded image / isScanned -> bitmap/scan tier
  - no valid PDF -> no-PDF path (1d)
This is the load-bearing classifier for the whole gate.

### 1c. Block-with-override gate (Jon: confirmed)
  - text-layer/clean + region present -> PROCEED silent.
  - vision-mode + no region -> BLOCK; modal requires a drawn region OR conscious
    "Extract anyway — manual verification required" ack.
  - Modal copy (FINAL):
    * clear/readable, region missing: "This drawing's BOM is clear and readable, and
      ARC is extracting at high accuracy. To increase accuracy further, please region
      the BOM area."
    * low-res/image-based: "This drawing has a low-res or image-based BOM that
      requires more thought. Please region the BOM as tightly as possible to maximize
      accuracy. Results will need manual verification due to the poor source quality."
  - Override tags result manual-verify-required.
  - Start STRICT (block by default), relax on feedback.

### 1d. No-PDF/0-byte (12 projects)
LAZY. On extraction attempt only, detect missing/0-byte PDF -> prompt re-upload OR
region+image-extract (manual verify). No proactive backfill.

### 1e. 0-byte hardening — CORRECTED
  - Add buf.length===0 guard in BOTH CF functions: extractBomPage (line 2370-2371)
    AND extractBomBatch (line 2582, per Coach L4).
  - Mirror the client guard's actionable message (app.jsx:10164).
  - DROP the Brief's "no PDF path message" fix as mis-scoped — that message
    (app.jsx:11891) fires on no-path-at-all, NOT the 0-byte case.
  - Amber "Image fallback / Degraded input" pill alongside the existing green
    "PDF native" pill (app.jsx:26849) — surface the BAD path, not just the good one.
  - Cleanup test file originalPdfs/test-zero-byte/test-0byte-probe4.pdf via
    admin/gsutil.

### 1f. Structural learning — EXTENSION of existing region_learning
Extend the schema with: text-layer-vs-vision class per drawing, column-structure hint.
HARD RULES: per-DRAWING not per-customer; STRUCTURE not content (no C5 rebuild);
weight by human-confirmed signal.
INCLUDE L3 FIX: wire buildRegionLearningContext into pdf-native + bom-region-crop
paths too, not just image-fallback.
NOTE: learning is currently per-user. Per-customer vs per-user is a design question
for the Detailed Plan.

---

## PHASE 2 — Vector-stroke voting (vector-first; bitmap STAGED)

- Vector-stroke only. N=3 -> convergence-extend to 5. Item-aligned majority vote.
- INCLUDE L2 TEST: add vector-stroke quality alert to prompt, measure impact.
- Honesty constraint: consensus != correctness; no "verified" claim in UI.
- Bitmap voting STAGED: needs item-alignment strategy first. Defer with #85.

---

## PARKED — explicitly OUT of this feature

- L5: dead autoDetect() — revive or delete, separate decision.
- L6: client-side full-parse inefficiency — mirror Phase 0b optimization later.
- #85 Excel cross-check — the accuracy oracle for the bitmap tier.
- C5 auto-cross freeze; Layout/Enclosure/Schematic + estimator's-eye (TODO #101).

---

## PHASE / SHIP ORDER

  Phase 0a (diagnose)      — ships first, standalone
  Phase 0b (fix)           — mechanism conditional on 0a; may ship WITH Phase 1
  Phase 1 (regioning+gate) — the core feature
  Phase 2 (vector voting)  — after Phase 0b
  Bitmap voting + #85      — staged, separate effort

# Session State — 2026-06-15 MDT

## Version
v1.20.113 (deployed 2026-06-10). H5 high-DPI region tiling + Opus 4.8 model bump. Stable.

## Deploy State
- Master tip: 6ea797e4 ("H5: high-DPI region tiles + Opus 4.8 (functions side) + verification doc")
- Local master == origin/master (synced)
- Latest tag: v1.20.113
- No code changes since deploy — close-out commit adds only investigation artifacts and record updates

## Recent Commits (last 15)
- 6ea797e4 H5: high-DPI region tiles + Opus 4.8 (functions side) + verification doc
- 1465d2e0 Release v1.20.113
- 003cb014 Release v1.20.112
- 590d1ff4 Release v1.20.111
- d7ff88a5 Release v1.20.110
- c1c6f9c3 Release v1.20.109
- 240081c5 Release v1.20.108
- e420f538 Release v1.20.107
- 0c03599c Release v1.20.106
- 74748d7b Release v1.20.105
- c84a4aa2 Release v1.20.104
- dce38c77 Release v1.20.103
- 345d7963 Release v1.20.102
- cf05391b Add ARC Vision: Estimator's-Eye Cross-Check Workflow (#101)
- d15faa97 Update handoff files for next session

## Headline: Vision-Mode Resolution Problem SOLVED

H5 (region-targeted high-DPI rendering) shipped and verified. 2-for-2 at 100% on worst-case drawings:
- **PRJ402101:** 54/54 = 100% (up from ~36-65% baseline). 3×2 grid, ~440 DPI.
- **PRJ402119:** 14/14 = 100% (up from 36-50% baseline). 2×1 grid, ~1079 DPI.

Model: Claude Opus 4.8 (2576 px ceiling). v1.20.113 converted 6 Opus call sites to `thinking:{type:"adaptive"}`. All 8 Opus call sites verified clean (Coach C51). Text-layer pages completely unaffected.

## Shipped Since Last SESSION-STATE (v1.20.101 → v1.20.113)

### Required-BOM-Region Feature (#103-#112) — PHASE 1 COMPLETE
- #103 Phase 0a/0b timeout fix (v1.20.108-area)
- #104 Phase 1e 0-byte hardening (v1.20.102)
- #105 Phase 1b input-tier classifier (v1.20.105)
- #106 Phase 1a detection summary (v1.20.106)
- #107 Phase 1c block-with-override gate (v1.20.107)
- #108 B2 carry-forward + B1 send-gate (v1.20.108)
- #109 F3 print warning + F2 toast (v1.20.109)
- #110 F1/C5 noisy-PN guard + Mark Verified (v1.20.110)
- #111 Phase 1d no-PDF handling (via 1c Case 5)
- #112 Phase 1f region learning + L3 wire-up (v1.20.111)
All verified by Coach (C31-C45).

### Sales-Path Trust Layer — COMPLETE
B1 send-gate, B2 carry-forward, F1 noisy-PN guard, F2 BC-failure toast, F3 print warning, C5 auto-cross freeze, Mark Verified action. Coach C40-C42.

### H5 High-DPI Rendering (#120) — RESOLVED
v1.20.112 (H5 build) + v1.20.113 (Opus 4.8 thinking fix). Coach C51 verified.

### Closed
- #113 CropBox bitmap proof — superseded by H5
- #114 Phase 2 voting — killed (voting counterproductive; resolution was the lever)

## No Open Threads Blocking
The H5 generalization test came back positive. No in-flight work, no pending merges, no feature branches.

## Parked Backlog (priority order)
1. **#121** Region edge-padding fix — pad resolved region ~2% before rendering to prevent edge-row clipping. ~5 lines. [Backlog]
2. **#117** Quote Payment Terms / Shipping Method intermittent missing — root-caused (two print paths diverge), ~20 lines. [Decided]
3. **#115** Held-back-cross review UI — scaffolding exists, needs per-row indicator. [Backlog]
4. **#85** Internal Excel fast-quote — audited (EXCEL-BOM-IMPORT-AUDIT.md), needs Brief. [Backlog]
5. **#119** Legacy panels invisible to Phase 1 safety systems — extractionReport gating. [Discovery]
6. **#118** Batch extraction path missing region learning context. [Backlog]
7. Item 16 / BC-fill cluster (long-standing)

## Open TODOs
~68 OPEN findings in TODO.md (includes backlog items with activation triggers).

## Working Tree
- Branch: master (up to date with origin/master)
- Close-out commit pending: COACH.md, TODO.md, CLAUDE.md, SESSION-STATE.md, + 20 investigation docs

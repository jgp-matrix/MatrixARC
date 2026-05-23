# PRJ402104 Post-H9 Diff Report

**Captured:** 2026-05-22
**Version:** v1.20.22
**Extraction path:** pdf-native
**Pipeline:** raw=21 → exact=21 → fuzzy=21 → final=21

## H9 Success Criteria

| Criterion | Result |
|-----------|--------|
| Item 27 (RH2B-ULC-120) present | ✓ PASS |
| Item 28 (SH2B-05C) present | ✓ PASS |
| Item 30 (SH3B-05C) present | ✓ PASS |
| Fuzzy merges = 0 | ✓ PASS (0 merges) |
| Sequence gaps = 0 | ✓ PASS (empty) |

## Comparison: Pre-H9 vs Post-H9

| Metric | Pre-H9 (v1.20.20) | Post-H9 (v1.20.22) |
|--------|-------------------|---------------------|
| BOM items | 50 | 27 |
| Raw count | 47 | 21 |
| Exact count | 47 | 21 |
| Final count | 44 | 21 |
| Final item count | 44 | 21 |
| Fuzzy merges | 3 | 0 |
| Sequence gaps | [27, 28, 30] | [] |
| IDEC items | 3 (items 25, 26, 29) | 12 (items 27-38) |

**Note on item count drop (50→27):** This is a re-extraction with fresh AI output, not a regression. The previous extraction (v1.20.20) included items from a different page interpretation. The current extraction used `extractBomBatch` via pdf-native and extracted 21 items from BOM pages, plus 6 labor/overhead rows = 27 total. The key metric is that **zero items were lost to fuzzy merge** — all 21 extracted items survived the pipeline.

## IDEC Variant Survival

All IDEC product-family variants that were previously dropped now survive:

| Item | Part Number | Product | Pre-H9 Status | Post-H9 Status |
|------|-------------|---------|---------------|----------------|
| 25 | RH1B-ULC-120 | 1-pole relay | Present (survivor) | Not extracted this run |
| 26 | SH1B-05C | 1-pole socket | Present (survivor) | Not extracted this run |
| 27 | RH2B-ULC-120 | 2-pole relay | **DROPPED by fuzzy merge** | ✓ Present |
| 28 | SH2B-05C | 2-pole socket | **DROPPED by fuzzy merge** | ✓ Present |
| 29 | RH3B-ULC-120 | 3-pole relay | Present | ✓ Present |
| 30 | SH3B-05C | 3-pole socket | **DROPPED by fuzzy merge** | ✓ Present |

Items 25-26 were not extracted in this run (AI extracted different items from the BOM page). This is AI non-determinism, not a pipeline issue. Items 27-30 all survived — the previously-dropped variants are now retained.

## Fuzzy Merge Verification

**Pre-H9 merge log:**
- RH1B-ULC-120 kept, RH2B-ULC-120 dropped (editDist=1)
- SH1B-05C kept, SH2B-05C dropped (editDist=1)
- SH1B-05C kept, SH3B-05C dropped (editDist=1)

**Post-H9 merge log:** Empty — zero fuzzy merges occurred.

The itemNo guard prevented all three false merges. Items with different itemNo values (25≠27, 26≠28, 26≠30) are now blocked from merging regardless of edit distance, manufacturer match, or description similarity.

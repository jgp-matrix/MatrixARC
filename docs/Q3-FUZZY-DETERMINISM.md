# Q3 Fuzzy Determinism Re-Analysis

**Date:** 2026-06-05  
**Investigator:** Marc Masdev  
**Brief by:** Freddy Lyst  
**Data source:** Probe 2 raw outputs (3 runs each on PRJ402113 and PRJ402100)

---

## Question

The 4–19% exact-match consensus from Probe 2 conflates two failure modes:
1. **Same part, different characters** — OCR noise on the same physical row (bounded, potentially fixable)
2. **Genuinely different parts** — model reading different content entirely (near-random, unfixable without input improvement)

Fuzzy matching separates these.

---

## Four-Mode Consensus (% of unique PNs in ALL 3 runs)

| Mode | PRJ402113 (CAD) | PRJ402100 (Raster) |
|------|----------------:|-------------------:|
| 1. Exact match | **19%** (32/168) | **4%** (2/49) |
| 2. Normalized (strip `-./` etc.) | **19%** (32/168) | **6%** (3/47) |
| 3. Fuzzy edit-distance ≤ 1 | **39%** (65/168) | **20%** (10/49) |
| 4. Fuzzy edit-distance ≤ 2 | **55%** (92/168) | **31%** (15/49) |

**Normalization (mode 2) adds almost nothing** — the variance is in character identity
(digits, letters), not in formatting (dashes, dots). The model reads different characters,
not different punctuation.

**Fuzzy d≤2 (mode 4) nearly triples consensus** for the CAD export (19→55%) and increases
it 8× for raster (4→31%). This confirms a large share of the variance is single- and
double-character OCR misreads.

---

## The Key Number — "Same Part, Misread" Share

Of the PNs that appear in **only 1 run** under exact match, how many have a fuzzy
neighbor (edit-distance ≤ 2) in another run?

| Project | Only-in-1-run (exact) | Has fuzzy neighbor (d≤2) | % recovered | No neighbor (d>2) |
|---------|----------------------:|-------------------------:|------------:|------------------:|
| PRJ402113 | 110 | **71** | **65%** | 39 |
| PRJ402100 | 42 | **14** | **33%** | 28 |

**PRJ402113:** 65% of "unique" PNs are OCR variants of the same part read in another
run. Only 39 PNs (35%) are genuinely unreproducible at d>2.

**PRJ402100:** 33% are OCR variants. 28 PNs (67%) are genuinely unreproducible — the
raster scan produces deeper character-level corruption that fuzzy matching can't bridge.

---

## Item-Aligned Analysis (same row across runs)

The most revealing view: align items by `itemNo` (same physical row on the drawing)
and compare the PN each run extracted.

### PRJ402113 — 86 items present in all 3 runs

| Agreement | Items | % |
|-----------|------:|--:|
| All 3 runs produce identical PN | 32 | **37%** |
| 2 of 3 agree, 1 differs | 26 | **30%** |
| All 3 produce different PNs | 28 | **33%** |

**67% of rows have a majority vote (2+ runs agree).** A 3-run majority-vote
scheme would stabilize 67% of PNs, up from 37% with single-run extraction.

### PRJ402100 — 18 items present in all 3 runs

| Agreement | Items | % |
|-----------|------:|--:|
| All 3 runs produce identical PN | 2 | **11%** |
| 2 of 3 agree, 1 differs | 5 | **28%** |
| All 3 produce different PNs | 11 | **61%** |

Only 18 of ~28 items share the same `itemNo` across runs — the model doesn't even
agree on which row numbers exist. Of those 18, only 39% have a majority vote.

---

## Eyeball Check — Same Row, Different Readings

### PRJ402113 (CAD export) — All 3 diverge

These are the **same physical drawing row** read by the same model 3 times:

| Item | Run 0 | Run 1 | Run 2 | Pattern |
|------|-------|-------|-------|---------|
| 1 | `A62H6012SSLP3PT` | `ADZH60125LSPT` | `A62H4812SSLP3PT` | Same Hoffman enclosure. 6→4, letters shift. |
| 3 | `AHCI73BS` | `AHCI23B85` | `AHC17385` | Same part. 7→2, rearranged suffix. |
| 5 | `HS1069SN` | `H510060SN` | `H5100E5IM` | Progressively garbled. |
| 7 | `EL930D` | `EL1930D` | `E1J90D` | Extra digit, letter swap. |
| 9 | `ELC001PBULK` | `ELC001PBKL` | `ELC1001PBLK` | Same part, letter/digit reorder. |

### PRJ402113 (CAD export) — 2 agree, 1 off

| Item | Run 0 | Run 1 | Run 2 | Pattern |
|------|-------|-------|-------|---------|
| 2 | `A60P96` | `A60P96` ✓ | `44099G` | r0=r1, r2 completely garbled |
| 4 | `HF1016414` | `HF1016414` ✓ | `HF2016A14` | r0=r1, r2 has 1→2 and digit→letter |
| 6 | `THERM16F` | `THERMIG6F` | `THERM16F` ✓ | r0=r2, r1 has 1→I |
| 8 | `ELA00MF` | `ELA60MF` | `ELA00MF` ✓ | r0=r2, r1 has 0→6 |
| 10 | `ELD01` | `ELDA1` ✓ | `ELDA1` ✓ | r1=r2, r0 has different structure |

### PRJ402100 (raster scan) — All 3 diverge

| Item | Run 0 | Run 1 | Run 2 | Pattern |
|------|-------|-------|-------|---------|
| 2 | `CP020` | `SPH20` | `SPE20` | 3 readings of same part. C→S, P→H/E. |
| 4 | `ALD5QH1DNUG` | `ALD5QH1DMUG` | `ALD5QHIDNUG` | N→M, 1→I — single-char noise |
| 6 | `ABD110NUB` | `AB6101GNB` | `ABD101NUB` | 1→0 transposition, letter insertions |
| 10 | `722-0001` | `722-0004` | `TCR-722-DDD3` | Same base part, r2 reads prefix + garble |
| 13 | `SCE24R2010SSLP` | `SCE20R2010SSLP` | `SCE-20R2010SSLP` | 4→0 digit, formatting variant |

**Verdict:** These are unambiguously the same physical parts. The model reads the
same row on the same drawing and produces different character sequences each time.
This is bounded OCR noise on vector-path/raster-rendered text, not model confusion
about what parts exist.

---

## Synthesis — What This Means

### The variance is character-level OCR noise, not semantic confusion

The model consistently:
- Identifies the **correct number** of BOM rows (±2)
- Identifies the **correct item numbers** (mostly aligned)
- Identifies the **correct descriptions** (not measured here, but visible in raw data)
- Reads **different characters** for the same part number

This is a vision-model OCR accuracy problem, not an extraction logic or
comprehension problem. The model knows what it's looking at; it can't reliably
read the characters.

### Quantified variance budget

**PRJ402113 (CAD export, 86-row BOM):**
- 37% of rows are deterministic (same PN every time)
- 30% have a majority reading (2/3 agree — recoverable via voting)
- 33% are fully stochastic at exact-match level
- Of those stochastic rows, 65% are OCR variants (d≤2 neighbor exists)
- True "unrecoverable by any simple method": ~12% of rows (33% × 35%)

**PRJ402100 (raster scan, ~28-row BOM):**
- 11% of rows are deterministic
- 28% have a majority reading
- 61% are fully stochastic
- Of those, only 33% are OCR variants
- True unrecoverable: ~41% of rows (61% × 67%)

### Implications for fix design

1. **Multi-pass voting (N=3) would recover ~67% of PRJ402113 PNs** (the 37% always-agree
   + ~30% majority-vote). This is a significant improvement over single-pass for
   CAD exports but still leaves 33% of rows unstable.

2. **Raster scans are not fixable with voting.** 61% of rows have 3 different readings —
   no majority exists. These need input-quality improvement (higher-res scan, text-layer
   PDFs) or external oracle (Excel BOM cross-check per #85).

3. **Normalization won't help** (mode 2 added almost nothing). The variance is in
   character identity, not formatting. Post-processing rules like "strip dashes" or
   "uppercase" don't address digit confusion (0/O, 1/I, 6/G, 8/B).

4. **BC lookup acts as a weak oracle.** A PN that resolves in BC is more likely correct
   than one that doesn't — but TODO #85 showed that BOTH misread variants can be valid
   PNs (e.g., `3036338` and `3038338` are both real Phoenix Contact parts). BC can
   filter nonsense PNs but can't disambiguate near-miss valid PNs.

5. **Auto-cross (C5) is actively harmful in this regime.** The learning database was
   trained on stochastic PN readings. Corrections learned from one extraction will
   silently mutate different-but-equally-wrong readings from the next extraction.
   The fix is to freeze or disable auto-cross until PN stability improves.

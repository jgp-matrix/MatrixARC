# #113b — Bitmap-Voting Proof on PRJ402101

**Author:** Marc Masdev  
**Date:** 2026-06-09  
**Version:** v1.20.111  
**Status:** MEASUREMENT COMPLETE — no code changes, no saves

---

## Executive Summary

**3-way majority voting is COUNTERPRODUCTIVE on bitmap-tier PDFs.**

On PRJ402101 (CAD-exported bitmap PDF), 3-way voting scores **32/54 = 59.3%** — 
5.5 percentage points WORSE than the best single run (35/54 = 64.8%). Voting 
overrules 3 correct answers while only recovering 7 items that at least one run 
missed. 15 items are locked into wrong answers by consistent misreads that 
survive majority consensus.

**Decision: Do NOT build voting (#114) for bitmap tier.** The error profile is 
dominated by consistent misreads (same wrong character in 2-3 out of 3 runs), 
not random variance. Voting amplifies these consistent errors by giving them 
democratic legitimacy. The correct path is prompt engineering or model-tier 
improvements, not redundant runs.

---

## Source Document Profile

| Property | Value |
|----------|-------|
| Project | PRJ402101 — Redmond Wetlands WWTP - Screen System Package |
| Drawing type | CAD-exported PDF with embedded bitmap (NOT scanned) |
| Page | 10 of 23 (BOM page) |
| PDF tier | **Bitmap** — rasterized CAD content, no usable text layer |
| aiBomRegion | `{x:0.03, y:0.03, w:0.94, h:0.92}` (94% of page) |
| Extraction path | `bom-region-crop` (full-page JPEG to Cloud Function) |
| Model | Claude Opus 4.6 with thinking (8K budget) |
| Ground truth items | 54 (drawing items 1-42, 51-62; items 43-50 do not exist) |

### Why Bitmap Tier, Not Scan Tier

PRJ402101 is CAD-exported — the PDF was generated from a `.dwg` file, not 
scanned from paper. The bitmap content is the CAD system's rasterized output, 
typically higher resolution and cleaner than a scanner. Despite this, there is 
no extractable text layer — the PDF-native path returns 0 items. The only 
viable extraction path sends a JPEG image to the API.

This is a different tier from PRJ402119 (#113, scan-tier proof), which was a 
168 DPI monochrome fax-scan. Bitmap tier is expected to have higher baseline 
accuracy and more potential for voting recovery — making it the best-case 
scenario for voting viability.

---

## Ground Truth

Established by Marc via multi-level zoom inspection of the source PDF in 
Chrome. Cross-validated against Jon's 3 hand-verified items (all matched).

| # | Part Number | # | Part Number |
|---|-------------|---|-------------|
| 1 | SCE-90EL4820SSFSD | 28 | 2320283 |
| 2 | SCE-90P48F1 | 29 | 1348516 |
| 3 | SCE-AC3400B460VSS | 30 | 2320788 |
| 4 | SCE-LF18 | 31 | 2904601 |
| 5 | SCE-LSA | 32 | 2905744 |
| 6 | XT1SU3060AFF000XXX | 33 | IM1-451EX-R |
| 7 | KXTARHES500 (+KXTARHEHST) | 34 | 2080-L70E-24QWB |
| 8 | KXTBRHEBFP | 35 | 2085-IQ16 |
| 9 | 1SDA066921R1 | 36 | 2085-OB16 |
| 10 | 2903528 | 37 | 2080-IF4 |
| 11 | 2910386 | 38 | 2085-ECR |
| 12 | KA2U | 39 | 2711R-T10T |
| 13 | MS132-10 (+MS132-SK1-11) | 40 | NT116 |
| 14 | MS132-4.0 (+MS132-SK1-11) | 41 | AVD301NUR |
| 15 | 150-C16NBD | 42 | GRAVOPLY ULTRA |
| 16 | 25B-D2P3N114 | 51 | 3044665 |
| 17 | CHCC2DIU | 52 | 3047293 |
| 18 | FNQ-R-5 | 53 | 0800886 |
| 19 | SU202M-K13 | 54 | 0807012 |
| 20 | SU201M-K30 | 55 | 3038338 |
| 21 | SU201M-K10 | 56 | TYD1X3WPW6 (+TYD1CPW6) |
| 22 | SU201M-K3 | 57 | TYD2X3WPW6 (+TYD2CPW6) |
| 23 | SU201M-K2 | 58 | TYD3X3WPW6 (+TYD3CPW6) |
| 24 | SU201M-K1 | 59 | 679001 |
| 25 | SU201M-K0.5 | 60 | 49046A |
| 26 | SP2000ACP | 61 | 592273 |
| 27 | SPFG1 | 62 | BY FABRICATOR |

**Notes:**
- Items 43-50 do NOT exist in the drawing BOM. The model consistently 
  fabricates 8 "phantom" items from schematic/notes visible elsewhere on 
  the page (contactors, relays, terminal blocks from the schematic area).
- Items with (+secondary) have a paired part on the same BOM line. Scoring 
  uses the primary PN only.
- Jon's 3 hand-verified items confirmed: #6 (XT1SU3060AFF000XXX), 
  #1 (SCE-90EL4820SSFSD), #2 (SCE-90P48F1).

---

## Three Extraction Runs

All runs used the same JPEG image (full-page render of BOM page 10) sent 
to the `extractBomPage` Cloud Function via `bom-region-crop` path.

| Metric | Run D | Run E | Run G |
|--------|:-----:|:-----:|:-----:|
| Items returned | 62 | 62 | 62 |
| Correct (of 54 GT) | **35** | **33** | **28** |
| Accuracy | **64.8%** | **61.1%** | **51.9%** |
| Phantom items (43-50) | 8 | 8 | 8 |
| Elapsed | ~195s | ~195s | 194.6s |

---

## Full Error Table (29 items with at least one wrong run)

| # | Ground Truth | Run D | Run E | Run G | Vote | Vote OK? |
|---|-------------|-------|-------|-------|------|:--------:|
| 1 | SCE-90EL4820SSFSD | **✓** | SCE-90EL4020S2FD | SCE-90EL4020SSPD | ??? | — |
| 2 | SCE-90P48F1 | **✓** | SCE-90BHBFS1 | SCE-90P4E1 | ??? | — |
| 3 | SCE-AC3400B460V**SS** | V**3S** | V**3S** | V**3S** | V3S | **✗** |
| 4 | SCE-LF**18** | SCE-L**P20** | SCE-LF**3A** | SCE-LF**3A** | LF3A | **✗** |
| 7 | KXTARHES500 | KITARHE5500 | **✓** | KIT4RH+E5500 | ??? | — |
| 8 | KXTBRHEBFP | K**IT**BRHEBFP | **✓** | **✓** | ✓ | **✓** |
| 12 | KA2U | **✓** | **✓** | KA**3**U | ✓ | **✓** |
| 13 | MS132-10 | **✓** | **✓** | M**1312**-10 | ✓ | **✓** |
| 14 | MS132-4.0 | **✓** | **✓** | M**1312**-4.0 | ✓ | **✓** |
| 16 | 25B-D**2P3**N114 | D**3P0** | D**3P0** | D**3P9** | D3P0 | **✗** |
| 17 | CH**CC**2DIU | **✓** | CH**C**2DIU | CH**C**2DIU | CHC2DIU | **✗ OVERRULE** |
| 20 | SU20**1**M-K30 | SU20**3**M | SU20**3**M | SU20**3**M | SU203M | **✗** |
| 27 | SP**FG**1 | S**FG**1 | SP**F6**1 | SP**F0**1 | ??? | — |
| 28 | 232028**3** | 232032**2** | 232032**2** | 232009**3** | 2320322 | **✗** |
| 29 | 134**8**516 | 134**6**516 | 134**6**516 | 134**6**516 | 1346516 | **✗** |
| 30 | 2320788 | **✓** | 2320**7**38 | **✓** | ✓ | **✓** |
| 33 | IM**1-451**EX-R | IM**E1-401**EX-R | IM**E-40**EX-R | IM**S-4DI-**EX-R | ??? | — |
| 34 | 2080-L**7**0E-24QWB | L**C7**0E | L**C7**0E | L**C7**0E | LC70E | **✗** |
| 35 | 2085-I**Q**16 | I**D**16 | I**D**16 | I**D**16 | ID16 | **✗** |
| 41 | AVD**301**NUR | AVD**310**NUR | **✓** | AVD**901**NUR | ??? | — |
| 42 | GRAVOPLY ULTRA | **✓** | **✓** | PB452 | ✓ | **✓** |
| 52 | 30**47**293 | 3**24**7053 | 30**24**753 | 3**24**7053 | 3247053 | **✗** |
| 53 | 080**08**86 | 080**29**86 | 080**20**86 | **D8C**0886 | ??? | — |
| 54 | 0807012 | **✓** | **✓** | **D**807012 | ✓ | **✓** |
| 55 | 30**38**338 | 30**36**338 | 30**36**338 | **✓** | 3036338 | **✗ OVERRULE** |
| 56 | TYD1X3**W**PW**6** | **SW**PW**6** | **SW**PW**6** | **SW**P0**6** | SWPW6 | **✗** |
| 57 | TYD2X3**W**PW**6** | **SW**PW**6** | **SW**PW**6** | **SW**P0**6** | SWPW6 | **✗** |
| 58 | TYD3X3**W**PW**6** | **SW**PW**6** | **SW**PW**6** | **SW**P0**6** | SWPW6 | **✗** |
| 62 | BY FABRICATOR | **✓** | (empty) | (empty) | (empty) | **✗ OVERRULE** |

**Legend:** ✓ = matches ground truth. ??? = no consensus (all 3 different). 
Bold difference markers show the specific characters that differ from ground truth.

---

## Voting Outcome Summary

| Category | Count | % | Description |
|----------|:-----:|:-:|-------------|
| **All 3 correct** | 25 | 46.3% | No error in any run |
| **Vote recovers** | 7 | 13.0% | ≥2 runs correct → vote picks correct |
| **No consensus** | 7 | 13.0% | All 3 different → can't vote |
| **Vote locks wrong** | 10 | 18.5% | ≥2 runs agree on WRONG answer |
| **All 3 same wrong** | 5 | 9.3% | Floor-limited — identical misread every run |
| **Total** | **54** | 100% | |

### Accuracy Comparison

| Method | Correct | Accuracy | API Cost | Latency |
|--------|:-------:|:--------:|:--------:|:-------:|
| Run D (best single) | **35** | **64.8%** | ~$0.25 | ~195s |
| Run E | 33 | 61.1% | ~$0.25 | ~195s |
| Run G (worst single) | 28 | 51.9% | ~$0.25 | ~195s |
| Average single run | 32 | 59.3% | ~$0.25 | ~195s |
| **3-way majority vote** | **32** | **59.3%** | **~$0.75** | **~585s** |

**Voting produces average-run accuracy at 3× the cost.**  
It is 5.5 points WORSE than the best single run.

### Why Voting Fails

Voting requires errors to be **independent and random** — different wrong 
answer each run, so the correct answer can win by majority. On bitmap-tier 
PDFs, the dominant error mode is **consistent misreads**: the same ambiguous 
glyph is misread the same way every time.

**15 items (27.8%) have ≥2 runs agreeing on the wrong answer.** Voting 
locks these in. Three examples:

1. **#29 (1348516)**: The `8` is read as `6` in all 3 runs. The bitmap 
   glyph for `8` in this font renders ambiguously. Voting can NEVER fix 
   this — you'd get `1346516` no matter how many runs you do.

2. **#35 (2085-IQ16)**: The `Q` is read as `D` in all 3 runs. At bitmap 
   resolution, Q and D are nearly identical glyphs. Same result at N=100.

3. **#17 (CHCC2DIU)**: Run D correctly reads the double-C, but Runs E and G 
   both drop one C. Voting OVERRULES the correct answer with the wrong one.

### Overruled Correct Answers (Voting Makes It Worse)

Three items where a single run got the correct answer but voting picked 
the wrong majority:

| # | Truth | Correct Run | Vote (wrong) | Error |
|---|-------|:-----------:|-------------|-------|
| 17 | CHCC2DIU | D | CHC2DIU | Dropped a C |
| 55 | 3038338 | G | 3036338 | 8→6 |
| 62 | BY FABRICATOR | D | (empty) | Description dropped |

These represent the **voting tax** — the price of democracy when the 
majority is wrong. Run D alone got all 3 right.

---

## Error Classification: RANDOM vs CONSISTENT

Per Jon's requested framework — classifying every error by whether voting 
could theoretically fix it.

### CONSISTENT Errors (voting CANNOT fix) — 15 items

These produce the same (or functionally same) wrong answer in ≥2 of 3 runs. 
Voting locks them in.

| # | GT | Misread | Glyph Confusion | All 3 Same? |
|---|----|---------|-----------------|-----------:|
| 3 | VSS → V3S | S→3 | S/3 ambiguous | Yes |
| 16 | D2P3 → D3P0/D3P9 | 2→3, 3→0/9 | Multiple digits | 2/3 same |
| 20 | SU201M → SU203M | 1→3 | 1/3 ambiguous | Yes |
| 28 | 2320283 → 2320322 | 8→3, 3→2 | Digit confusion | 2/3 same |
| 29 | 1348516 → 1346516 | 8→6 | 8/6 ambiguous | Yes |
| 34 | L70E → LC70E | Phantom C inserted | Stroke misread | Yes |
| 35 | IQ16 → ID16 | Q→D | Q/D nearly identical | Yes |
| 52 | 3047293 → 3247053 | Multiple digits | Systematic | 2/3 same |
| 56 | WPW6 → SWPW6 | Phantom S inserted | Stroke misread | 2/3 same |
| 57 | WPW6 → SWPW6 | Phantom S inserted | Stroke misread | 2/3 same |
| 58 | WPW6 → SWPW6 | Phantom S inserted | Stroke misread | 2/3 same |
| 4 | LF18 → LF3A/LP20 | 1→3/P, 8→A/0 | 2/3 agree on LF3A | 2/3 same |
| 17 | CHCC → CHC | Dropped character | 2/3 drop the C | 2/3 same |
| 55 | 3038 → 3036 | 8→6 | 8/6 ambiguous | 2/3 same |
| 62 | BY FABRICATOR → empty | Description dropped | 2/3 drop it | 2/3 same |

**Dominant glyph confusions on bitmap tier:**
- `8` ↔ `6` (items 29, 55) — rounded digits at bitmap resolution
- `S` ↔ `3` (item 3) — similar stroke shape
- `Q` ↔ `D` (item 35) — Q's tail lost at resolution
- `1` ↔ `3` (item 20) — vertical strokes ambiguous
- Phantom `C` or `S` insertion (items 34, 56-58) — stray bitmap artifacts read as characters

### RANDOM Errors (voting MIGHT fix — but often can't) — 7 items

All 3 runs produce different wrong answers. No majority exists.

| # | GT | Run D | Run E | Run G |
|---|-------|-------|-------|-------|
| 1 | SCE-90EL4820SSFSD | ✓ | 4020S2FD | 4020SSPD |
| 2 | SCE-90P48F1 | ✓ | 90BHBFS1 | 90P4E1 |
| 7 | KXTARHES500 | KITARHE5500 | ✓ | KIT4RH+E5500 |
| 27 | SPFG1 | SFG1 | SPF61 | SPF01 |
| 33 | IM1-451EX-R | IME1-401EX-R | IME-40EX-R | IMS-4DI-EX-R |
| 41 | AVD301NUR | AVD310NUR | ✓ | AVD901NUR |
| 53 | 0800886 | 0802986 | 0802086 | D8C0886 |

Of these 7 items, **4 had the correct answer in exactly 1 run** (#1, #2, #7, #41) 
but voting can't identify which run was right because there's no agreement. 
With 5-way voting these MIGHT converge — but at 5× cost (~$1.25) and ~16 
minutes of extraction time.

### RANDOM and Votable — 7 items recovered

These had ≥2 correct runs and voting correctly picks the majority:

| # | GT | Wrong Run(s) | Error |
|---|-------|-------------|-------|
| 8 | KXTBRHEBFP | D (KIT→KXT) | X→I |
| 12 | KA2U | G (KA3U) | 2→3 |
| 13 | MS132-10 | G (M1312-10) | S1→13 |
| 14 | MS132-4.0 | G (M1312-4.0) | S1→13 |
| 30 | 2320788 | E (2320738) | 8→3 |
| 42 | GRAVOPLY ULTRA | G (PB452) | Complete misread |
| 54 | 0807012 | G (D807012) | 0→D |

These 7 items show genuine RANDOM variance — one run misreads while 
the others get it right. **But 6 of 7 were Run G errors** — Run G was 
the weakest run. These items were already correct in 2 of 3 runs without 
voting.

---

## Net Voting Value Analysis

### vs Best Single Run (D = 35/54)

| Effect | Items | Net |
|--------|:-----:|:---:|
| Voting recovers (D was wrong) | +1 (#8) | +1 |
| Voting overrules (D was right) | -2 (#17, #62) | -2 |
| No consensus (D was right) | -2 (#1, #2) | -2 |
| **Net change** | | **-3** |

**Voting takes the best run from 35 to 32 correct. Net LOSS of 3 items.**

### vs Average Single Run (32/54)

Voting matches average-run accuracy exactly (32/54). Zero net benefit 
at 3× cost.

### Break-even Analysis

For voting to match the best single run (35/54), you would need:
- The 3 overruled items to stop being overruled (impossible with 3-way vote)
- The 7 no-consensus items to converge (requires 5+ runs)
- The 15 locked-wrong items to stop being consistent (requires different 
  model or prompt, not more runs)

**There is no number of runs that fixes consistent errors.** Even at 
N=100, items #3, #20, #29, #34, #35 will be wrong every single time.

---

## Phantom Items (43-50)

All 3 runs consistently extract 8 items that do not exist in the drawing's 
BOM table. These come from the schematic area visible on the same page:

| # | Extracted PN | Source |
|---|-------------|--------|
| 43 | AFS09-30-22-11 | Contactor from schematic |
| 44 | RH2B-ULCDC24V (×2) | Relay from schematic |
| 45 | RH2B-ULCDC24V (×2) | Relay from schematic |
| 46 | RH2B-ULCDC24V (×7) | Relay from schematic |
| 47 | 2966171 | Terminal block from schematic |
| 48 | 1263626 | Terminal block from schematic |
| 49 | 2770011 | Terminal block from schematic |
| 50 | 2770024 | Terminal block from schematic |

**Consistent across all runs.** The model is reading real content — just 
from the wrong area of the page. This is a separate problem from PN accuracy 
and would be addressed by better BOM region isolation (bomRegion is 94% of 
page on this project).

---

## Side Note: Item 16 BC-Fill Observation (#117/F2)

Item 16 (25B-D2P3N114, Allen-Bradley PowerFlex 525 VFD) has the correct part 
number in the drawing but was noted as having BC not fill its data. All 3 
extraction runs read it as `25B-D3P0N114` or `25B-D3P9N114` — a consistent 
misread of `D2P3` as `D3P0`/`D3P9`. Even if the PN were extracted correctly, 
the BC-fill issue is a separate problem in the #117/F2 family.

---

## Conclusions

### Primary Finding

**Majority voting is counterproductive on bitmap-tier PDFs.** The error 
profile is dominated by consistent glyph confusions (27.8% of items), not 
random variance. Voting at N=3 produces accuracy equal to the average single 
run and 5.5 points worse than the best single run — at 3× cost.

### Decision Matrix

| Approach | Verdict | Rationale |
|----------|---------|-----------|
| **Voting (#114)** | **✗ REJECTED for bitmap** | 3× cost, -5.5% vs best run, overrules 3 correct answers |
| Prompt engineering | ? Worth testing | Could address phantom items (43-50) and consistent misreads |
| Higher-res image | ? Worth testing | CAD PDFs can render at >72 DPI; may resolve glyph ambiguity |
| Sonnet 4 instead of Opus | ? Worth testing | Different model may have different glyph biases |
| BC fuzzy lookup | ✓ Already exists | Post-extraction correction via BC catalog match |

### Comparison with Scan Tier (#113)

| Metric | Scan (#113, PRJ402119) | Bitmap (#113b, PRJ402101) |
|--------|:----------------------:|:------------------------:|
| Best single-run accuracy | 50% (7/14) | **64.8%** (35/54) |
| Worst single-run accuracy | 36% (5/14) | 51.9% (28/54) |
| Run-to-run variance | ±14 pts | ±12.9 pts |
| Consistent errors | 14% (2/14) | **27.8%** (15/54) |
| Random errors | 43% (6/14) | 13.0% (7/54) |
| Voting verdict | ✗ Not worth it | **✗ Makes it worse** |
| Recommended path | Excel oracle (#85) | Prompt/model improvements |

**Key difference:** Scan tier has high random variance (voting could 
theoretically help but at extreme cost). Bitmap tier has low random variance 
but high consistent error rate (voting is actively harmful).

### Updated Tier Matrix

| Input Tier | Voting Verdict | Recommended Path |
|------------|:--------------:|-----------------|
| Text-layer (vector PDF) | N/A (accuracy ~95%+) | PDF-native extraction |
| **Bitmap (CAD raster)** | **✗ HARMFUL** | Prompt engineering, higher-res render, BC fuzzy match |
| Scan (monochrome ≤200 DPI) | ✗ Not cost-effective | Excel oracle (#85) |

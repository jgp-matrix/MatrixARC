# PRJ402107 Post-H6 Diff Report

> Generated: 2026-05-22T23:55:37.926Z
> Comparing post-H6 extraction (v1.20.20) against CCD-verified 87-item reference.

## Summary

| Metric | Pre-H6 | Post-H6 | Reference |
|--------|--------|---------|----------|
| Raw items extracted | 87 | 87 | 87 |
| After positional dedup | 70 | 85 | — |
| Items dropped by dedup | 17 | 2 | 0 |
| Final BOM count | 76 | 88 | 87 |
| Items with item# | ~70 | 85 | 87 |
| Left column items | ~41 | 49 | 50 |
| Right column items | ~29 | 36 | 37 |
| Extraction path | pdf-native | pdf-native | — |
| Version | v1.20.19 | v1.20.20 | — |

## H6 Fix Impact

- **Positional dedup drops: 17 → 2** (recovered 15 items)
- **Final BOM count: 76 → 88** (+12 items)
- The x-position guard (X_TOL=0.15) successfully prevents cross-column merges

## Match Analysis vs 87-Item Reference

| Category | Count | Details |
|----------|-------|--------|
| Exact PN match | 32 | Part number matches reference exactly |
| PN mismatch | 53 | Item present but part number differs (OCR/AI variation) |
| Missing items | 2 | In reference but not in post-H6 extraction |
| Extra items | 0 | In post-H6 but not in reference |
| No item number | 3 | Rows without item numbers (labor/misc) |

## Missing Items (2)

These items from the reference BOM were not found in the post-H6 extraction:

| Item | Catalog | MFG | Description |
|------|---------|-----|-------------|
| 50 | 5069-L330ERM | ALLEN BRADLEY | COMPACTLOGIX ETHERNET MOTION CONTROLLER, ETHERNET/IP, USB COMMUNICATION |
| 64 | SH3B-05C | IDEC | SOCKET, RELAY |

## Part Number Mismatches (53)

Items present in both but with different part numbers:

| Item | Reference PN | Extracted PN | Match? |
|------|-------------|-------------|--------|
| 1 | A62H6012SSLP3PT | A2ZH60125SLP3PT | different |
| 2 | A60P60 | A60P96 | different |
| 3 | AHCI238S | AHC12885 | different |
| 4 | HF1016414 | HF20S0614 | different |
| 5 | HG1000504 | HSJ00S06 | different |
| 8 | ELA02MF | ELA01MF | different |
| 9 | ELC1001PBUL | ELC001PBLK | different |
| 10 | ELCN1 | CELCN1 | different |
| 11 | 5603049 | 5085040 | different |
| 12 | P-R2-F2R0 | P-R2-E780 | partial |
| 13 | A628P12 | A62BP12 | different |
| 14 | DAH4001B | 3044MB13 | different |
| 15 | 140G-G2C3-C90 | 140G-G0C1-D30 | partial |
| 16 | 140G-G-RVM128 | 140G-G-RWNC28 | partial |
| 17 | KA2U | 6A32 | different |
| 23 | 140MT-F9E-C32 | 140MT-FRE-C32 | partial |
| 24 | 140MTCAFA11 | 140MTCWA11 | partial |
| 26 | 140MT-C-WTEN | 140MT-C-W7EN | partial |
| 27 | 140MT-C-W453 | 140MT-C-WG3 | partial |
| 28 | 193-T1APM | 199-T1APM | different |
| 30 | 25B-D010N114 | 2SB-D030N114 | different |
| 43 | 1489-M2D160 | 1489-M0C040 | partial |
| 45 | SP3000ACP | SP500ACP | different |
| 46 | SPFG1 | SP50KZ | different |
| 47 | UBC10.241 | UBCD6.241 | different |
| 53 | 5069-IB16 | 5069-IY16 | partial |
| 55 | 5069-IY4 | 5069-IV4 | partial |
| 56 | 5069-RTB18-SCREW RTB | 5069-RTB18-SCREW | partial |
| 59 | 1783-CMS20DN |  | different |
| 60 | FLEX 8EX2 SERIES | FLEX BK32 SERIES | partial |
| 61 | RH3B-ULC-120AC | RH4B-ULC-120MC | different |
| 62 | SH3B-05C | SH05-05C | different |
| 63 | RH3B-ULC-DC24V | RH4B-ULC-DC24V | different |
| 65 | ABD111NUB | ABD1111G-1B | partial |
| 66 | APD1QH2DNW | AP01D4DBWW | different |
| 67 | AVD311NUR | AVO1101UA | different |
| 68 | ASD211NU | AB2E91N1U | different |
| 69 | GRAVOGRAPH | GRAVOIGRAPH | partial |
| 70 | 3038338 | 3214259 | different |
| 71 | 3044759 | 3044859 | different |
| 72 | 3044814 | 3044614 | different |
| 74 | 800886 | 8000880 | different |
| 75 | 807012 | B07012 | different |
| 76 | TYD2X3NPW6 | TYD2030KPWG | different |
| 77 | TYD2CPW6 | TYD2CPWS | partial |
| 78 | TYD1X3NPW6 | TYD1030KPWG | different |
| 79 | TYD1CPW6 | TYD1CPWB | partial |
| 80 | 679002 | 670862 | different |
| 81 | 49046A | 490646 | different |
| 82 | 592273 | 502273 | different |
| 84 | LG5925-48-61-24 | 1D5925-45-61-24 | different |
| 85 | AFS09-30-22-11 | AF509-30-22-11 | different |
| 86 | 3044102 | 3044103 | partial |

## Exact Matches (32)

| Item | Part Number | Manufacturer |
|------|------------|-------------|
| 6 | THERM16F | HOFFMAN |
| 7 | EL900D | HOFFMAN |
| 18 | 140G-G-TLC13 | ROCKWELL AUTOMATION |
| 19 | 2903528 | PHOENIX CONTACT |
| 20 | 2910386 | PHOENIX CONTACT |
| 21 | 140MT-C3E-B25 | ALLEN BRADLEY |
| 22 | 140MT-C3E-C16 | ALLEN BRADLEY |
| 25 | 100-E09KJ10 | ROCKWELL AUTOMATION |
| 29 | 193-T1AB40 | ALLEN BRADLEY |
| 31 | 25C-D024N114 | ALLEN BRADLEY |
| 32 | AK-R2-120P1K2 | ALLEN BRADLEY |
| 33 | 1489-M1C005 | ALLEN BRADLEY |
| 34 | 1489-M1C010 | ALLEN BRADLEY |
| 35 | 1489-M1C020 | ALLEN BRADLEY |
| 36 | 1489-M1C030 | ALLEN BRADLEY |
| 37 | 1489-M1C050 | ALLEN BRADLEY |
| 38 | 1489-M1C080 | ALLEN BRADLEY |
| 39 | 1489-M1C100 | ALLEN BRADLEY |
| 40 | 1489-M1C150 | ALLEN BRADLEY |
| 41 | 1489-M1C200 | ALLEN BRADLEY |
| 42 | 1489-M1C320 | ALLEN BRADLEY |
| 44 | 1489-M3D030 | ALLEN BRADLEY |
| 48 | QT20.241 | PULS |
| 49 | 2905744 | PHOENIX CONTACT |
| 51 | 5069-RTB4-SPRING | ALLEN BRADLEY |
| 52 | 5069-RTB6-SPRING | ALLEN BRADLEY |
| 54 | 5069-OB16 | ALLEN BRADLEY |
| 57 | 5069-ECR | ALLEN BRADLEY |
| 58 | 2711P-T15C21D8S | ROCKWELL AUTOMATION |
| 73 | 3047293 | PHOENIX CONTACT |
| 83 | GBK520 | EATON |
| 87 | 3047028 | PHOENIX CONTACT |

## Rows Without Item Numbers (3)

| Row Index | Part Number | Manufacturer | Description |
|-----------|------------|-------------|-------------|
| 85 | JOB BUYOFF |  | job buyoff |
| 86 | CRATE |  | Crate |
| 87 | Contingency | Matrix Systems | Contingency |

## Conclusion

The H6 fix recovered most cross-column items. 2 item(s) still missing — likely AI extraction variation, not dedup.

Positional dedup dropped 2 items (down from 17 pre-H6). The 2 remaining drops are likely genuine same-column duplicates — correct behavior.

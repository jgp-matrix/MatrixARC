# PRJ402107 Pre-H5 BOM Diff Report
> ARC production extraction vs CCD-verified reference BOM
> Generated: 2026-05-22

---

## 1. Summary Statistics

| Metric | Count |
|--------|-------|
| Reference BOM items | 87 |
| ARC production items (with item number) | 70 |
| ARC extra rows (no item number: labor, buyoff, crate, contingency) | 6 |
| Items matched by item number | 70 |
| Exact catalog/part number matches | 32 |
| **Wrong part numbers (silent failures)** | **38** |
| Missing from ARC output | 17 |
| Extra items in ARC (not in reference) | 0 |
| Qty mismatches (among matched items) | 7 |
| Manufacturer mismatches (among matched items) | 5 |

---

## 2. Exact Matches (32 items)

These items have identical catalog/part numbers (case-insensitive) between ARC and reference.

| Item | Part Number | Manufacturer |
|------|-------------|-------------|
| 5 | HG1000504 | HOFFMAN |
| 6 | THERM16F | HOFFMAN |
| 13 | A628P12 | HOFFMAN |
| 15 | 140G-G2C3-C90 | ROCKWELL AUTOMATION |
| 22 | 140MT-C3E-C16 | ALLEN BRADLEY |
| 27 | 140MT-C-W453 | ALLEN BRADLEY |
| 31 | 25C-D024N114 | ALLEN BRADLEY |
| 33 | 1489-M1C005 | ALLEN BRADLEY |
| 34 | 1489-M1C010 | ALLEN BRADLEY |
| 35 | 1489-M1C020 | ALLEN BRADLEY |
| 36 | 1489-M1C030 | ALLEN BRADLEY |
| 37 | 1489-M1C050 | ALLEN BRADLEY |
| 39 | 1489-M1C100 | ALLEN BRADLEY |
| 40 | 1489-M1C150 | ALLEN BRADLEY |
| 41 | 1489-M1C200 | ALLEN BRADLEY |
| 42 | 1489-M1C320 | ALLEN BRADLEY |
| 43 | 1489-M2D160 | ALLEN BRADLEY |
| 44 | 1489-M3D030 | ALLEN BRADLEY |
| 46 | SPFG1 | HAMMOND |
| 47 | UBC10.241 | PULS |
| 48 | QT20.241 | PULS |
| 49 | 2905744 | PHOENIX CONTACT |
| 50 | 5069-L330ERM | ALLEN BRADLEY |
| 53 | 5069-IB16 | ALLEN BRADLEY |
| 54 | 5069-OB16 | ALLEN BRADLEY |
| 57 | 5069-ECR | ALLEN BRADLEY |
| 58 | 2711P-T15C21D8S | ROCKWELL AUTOMATION |
| 67 | AVD311NUR | IDEC |
| 71 | 3044759 | PHOENIX CONTACT |
| 72 | 3044814 | PHOENIX CONTACT |
| 73 | 3047293 | PHOENIX CONTACT |
| 83 | GBK520 | EATON |

---

## 3. Wrong Part Numbers (38 items) -- CRITICAL

ARC found the correct item number but extracted a different catalog/part number. These are **silent failures** -- the BOM looks complete but contains wrong parts.

| Item | ARC Part Number | Reference Part Number | Manufacturer | Notes |
|------|-----------------|----------------------|-------------|-------|
| 1 | `A626H6125LP3PT` | `A62H6012SSLP3PT` | HOFFMAN | Length differs (14 vs 15); 9 char diff(s) |
| 2 | `A60P36` | `A60P60` | HOFFMAN | 2 char difference(s) at pos 4,5 |
| 3 | `AHCI3885` | `AHCI238S` | HOFFMAN | 3 char difference(s) at pos 4,5,7 |
| 7 | `EL500D` | `EL900D` | HOFFMAN | 1 char difference(s) at pos 2 |
| 11 | `5600049` | `5603049` | PHOENIX CONTACT | 1 char difference(s) at pos 3 |
| 12 | `P-R2-F2RD` | `P-R2-F2R0` | GRACEPORT | 1 char difference(s) at pos 8 |
| 14 | `D64890018` | `DAH4001B` | HOFFMAN | Length differs (9 vs 8); 6 char diff(s) |
| 16 | `140G-G-RVM12B` | `140G-G-RVM128` | ROCKWELL AUTOMATION | 1 char difference(s) at pos 12 |
| 17 | `KAJU` | `KA2U` | BURNDY | 1 char difference(s) at pos 2 |
| 21 | `140MT-C3E-B15` | `140MT-C3E-B25` | ALLEN BRADLEY | 1 char difference(s) at pos 11 |
| 23 | `140MT-F8E-C32` | `140MT-F9E-C32` | ALLEN BRADLEY | 1 char difference(s) at pos 7 |
| 26 | `140MT-C-W7EN` | `140MT-C-WTEN` | ALLEN BRADLEY | 1 char difference(s) at pos 9 |
| 28 | `193-T1JAP4` | `193-T1APM` | ALLEN BRADLEY | Length differs (10 vs 9); 3 char diff(s) |
| 29 | `193-T1AB60` | `193-T1AB40` | ALLEN BRADLEY | 1 char difference(s) at pos 8 |
| 30 | `25B-D030N114` | `25B-D010N114` | ALLEN BRADLEY | 1 char difference(s) at pos 6 |
| 32 | `AK-R3-120P162` | `AK-R2-120P1K2` | ALLEN BRADLEY | 2 char difference(s) at pos 4,11 |
| 38 | `1489-M1C0B0` | `1489-M1C080` | ALLEN BRADLEY | 1 char difference(s) at pos 9 |
| 45 | `SP3000AC7` | `SP3000ACP` | HAMMOND | 1 char difference(s) at pos 8 |
| 52 | `5069-RT86-SPRING` | `5069-RTB6-SPRING` | ALLEN BRADLEY | 1 char difference(s) at pos 7 |
| 56 | `5069-RT818-SCREW RTB` | `5069-RTB18-SCREW RTB` | ALLEN BRADLEY | 1 char difference(s) at pos 7 |
| 59 | `1783-CM5200N` | `1783-CMS20DN` | ALLEN BRADLEY | 2 char difference(s) at pos 7,10 |
| 60 | `null` | `FLEX 8EX2 SERIES` | MAGNETEK MATERIAL HANDLING | ARC has null/empty part number |
| 61 | `RH8B-ULC-120AC` | `RH3B-ULC-120AC` | IDEC | 1 char difference(s) at pos 2 |
| 63 | `RH8B-ULC-DC24V` | `RH3B-ULC-DC24V` | IDEC | 1 char difference(s) at pos 2 |
| 66 | `APD182DNW` | `APD1QH2DNW` | IDEC | Length differs (9 vs 10); 5 char diff(s) |
| 68 | `ASS21NU` | `ASD211NU` | IDEC | Length differs (7 vs 8); 3 char diff(s) |
| 70 | `3214259` | `3038338` | PHOENIX CONTACT | 6 char difference(s) at pos 1,2,3,4,5,6 |
| 75 | `0807012` | `807012` | PHOENIX CONTACT | Length differs (7 vs 6); 6 char diff(s) |
| 76 | `DUCT,2X3,GREY` | `TYD2X3NPW6` | THOMAS & BETTS | Length differs (13 vs 10); 10 char diff(s) |
| 77 | `DUCT,COVER,2,GREY` | `TYD2CPW6` | THOMAS & BETTS | Length differs (17 vs 8); 8 char diff(s) |
| 78 | `DUCT,1X3,GREY` | `TYD1X3NPW6` | THOMAS & BETTS | Length differs (13 vs 10); 10 char diff(s) |
| 79 | `DUCT,COVER,1,GREY` | `TYD1CPW6` | THOMAS & BETTS | Length differs (17 vs 8); 8 char diff(s) |
| 80 | `670032` | `679002` | OVIVO | 2 char difference(s) at pos 2,4 |
| 81 | `4904684` | `49046A` | OVIVO | Length differs (7 vs 6); 1 char diff(s) |
| 82 | `5932271` | `592273` | OVIVO | Length differs (7 vs 6); 3 char diff(s) |
| 84 | `LC09S-4B-61-24` | `LG5925-48-61-24` | AUTOMATIONDIRECT | Length differs (14 vs 15); 12 char diff(s) |
| 85 | `AF509-30-22-11` | `AFS09-30-22-11` | ABB | 1 char difference(s) at pos 2 |
| 86 | `3044107` | `3044102` | PHOENIX CONTACT | 1 char difference(s) at pos 6 |

---

## 4. Missing Items (17 items)

Reference BOM items not found in ARC output at all (by item number).

| Item | Catalog | MFG | Qty | Tags | Description |
|------|---------|-----|-----|------|-------------|
| 4 | HF1016414 | HOFFMAN | 1 | FAN1235 | HF10 SIDE-MOUNT FILTER FAN, 115V 159CFM, LT GRAY |
| 8 | ELA02MF | HOFFMAN | 2 | LT1255, LT1256 | MAGNETS FOR MAGNETIC MOUNTING |
| 9 | ELC1001PBUL | HOFFMAN | 2 | LT1255, LT1256 | CABLE, INFEED FOR EL LED ENCLOSURE LIGHTS, 1.0 METERS, 100-240 VAC, 3-POLE, BLAC |
| 10 | ELCN1 | HOFFMAN | 2 | LT1255, LT1256 | CONNECTORS FOR EL LED ENCLOSURE LIGHT, AC, 250V, 16A, BLACK |
| 18 | 140G-G-TLC13 | ROCKWELL AUTOMATION | 1 | CB102 | TERMINAL LUGS FOR MCCB, COPPER |
| 19 | 2903528 | PHOENIX CONTACT | 1 | PM1005 | PHASE MONITORING RELAY, FOR PHASE SEQUENCE AND ASYMMETRY OF 3-PHASE VOLTAGES 480 |
| 20 | 2910386 | PHOENIX CONTACT | 1 | SUP1009 | TYPE 2 SURGE PROTECTION DEVICE, 3-CHANNEL WITH REMOTE INDICATOR CONTACT FOR 480  |
| 24 | 140MTCAFA11 | ALLEN BRADLEY | 6 | CB1040, CB1076, CB1118, CB1123, CB1128, CB1153 | 140MT AUXILIARY CONTACT WITH 1NO CONTACT AND 1NC CONTACT FRONT MOUNT |
| 25 | 100-E09KJ10 | ROCKWELL AUTOMATION | 4 | M1474, M1476, M1478, M1486 | 100-E-MCS-E CONTACTOR, 9A, AC3 DUTY, 24-60V AC, 20-60V DC ELECTRONIC COIL, 1 N.O |
| 51 | 5069-RTB4-SPRING | ALLEN BRADLEY | 1 | PLC1344 | REMOVABLE TERMINAL BLOCK FOR CONTROLLER MOD POWER, 4-PIN |
| 55 | 5069-IY4 | ALLEN BRADLEY | 1 | PLC1545 | COMPACTLOGIX 4-POINT ANALOG INPUT MODULE, CURRENT/VOLTAGE |
| 62 | SH3B-05C | IDEC | 1 | CR1245 | SOCKET, RELAY |
| 64 | SH3B-05C | IDEC | 5 | CR1470, CR1472, CR1480, CR1482, CR1484 | SOCKET, RELAY |
| 65 | ABD111NUB | IDEC | 1 | PR1364 | PUSH BUTTON - MOMENTARY, NEMA 4/4X, BLACK, WITH 1 N.O. + 1 N.C. CONTACT BLOCKS |
| 69 | GRAVOGRAPH | GRAVOPLY ULTRA | 4 | PB1364, LT1259, PB1362, SS1390 | GENERIC OPERATOR TAG - ENGRAVE AS SHOWN |
| 74 | 800886 | PHOENIX CONTACT | 30 | TB ACCESSORY | END BRACKET - E/NS 35 N, ACCESSORY, END BRACKET, GRAY, FOR THE NS 35 DIN RAIL, 9 |
| 87 | 3047028 | PHOENIX CONTACT | 4 | TB-M | D-UT 2.5/10 END COVER |

---

## 5. Extra Items in ARC

### Items with item numbers not in reference (0)

_None_

### Rows with no item number (6)

| Part Number | Description | Qty | Notes |
|-------------|-------------|-----|-------|
| 1012 | CUT | 6 | Labor row |
| 1013 | LAYOUT | 14 | Labor row |
| 1014 | WIRE | 69 | Labor row |
| BUYOFF | Buyoff/Service | 2 | Buyoff/Service |
| CRATE LG 56X48X16 | Crate, 56"x48"x16", MTX Large (inside dimensions) | 1 | Crate |
| Contingency | Contingency | 1 | Contingency |

---

## 6. Other Discrepancies

### Qty Mismatches (7)

| Item | Part Number | ARC Qty | Reference Qty | Difference |
|------|-------------|---------|--------------|------------|
| 16 | 140G-G-RVM128 | 5 | 1 | +4 |
| 43 | 1489-M2D160 | 4 | 1 | +3 |
| 57 | 5069-ECR | 2 | 1 | +1 |
| 58 | 2711P-T15C21D8S | 2 | 1 | +1 |
| 59 | 1783-CMS20DN | 2 | 1 | +1 |
| 73 | 3047293 | 60 | 10 | +50 |
| 86 | 3044102 | 1 | 4 | -3 |

### Manufacturer Mismatches (5)

| Item | Part Number | ARC MFG | Reference MFG |
|------|-------------|---------|---------------|
| 17 | KA2U | BURNDY/ROCKWELL AUTOMATION | BURNDY |
| 60 | FLEX 8EX2 SERIES | MAGNETEK/MATERIAL HANDLING | MAGNETEK MATERIAL HANDLING |
| 80 | 679002 | ONVO | OVIVO |
| 81 | 49046A | ONVO | OVIVO |
| 82 | 592273 | ONVO | OVIVO |

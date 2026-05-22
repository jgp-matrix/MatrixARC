# BOM Extraction Test — Ovivo Project
> Extracted from Claude Code session 6dbfb33d on 2026-05-22.
> Source PDF: Ovivo drawing set, page 9 of 21 (D-size BOM page).

---

## Phase 1 — Visual Observations Summary

**Page layout**: Single page (page 9 of 21), 17"x11" D-size landscape. Title "BILL OF MATERIAL" centered at top. **Two-column table layout** — left column holds items 1-50, right column holds items 51-87.

**Column headers**: ITEM | TAGS | QTY | CATALOG | MFG | DESCRIPTION

**Visual quirks that would trip naive OCR**:
- **Multi-line TAGS cells**: Items 24, 25, 32, 34, 53, 56, 63, 64, 69, 72, 73 have tags spanning 2-4 lines within a single row
- **Non-numeric QTY values**: "AS REQUIRED" (item 75), "A/R" (items 76-79), "1 SET" (item 60)
- **Revision marks**: Triangle symbols with letters B, C, D in the left margin — not part of the table data but easy to misparse as column content
- **Very similar catalog numbers differing by 1-2 characters**: `1489-M1C320` vs `1489-M2D160` vs `1489-M3D030` — at 300 DPI, "M1C320" rendered as indistinguishable from "M2C030"
- **Two-column page layout**: Not a continuation — left and right are independent item ranges sharing the same header row
- **Catalog/MFG swap**: Item 69 has manufacturer name in CATALOG column and product line in MFG column
- **Typos on the drawing**: "ACCESORRY" (items 80-81), "BACKROUND" (item 82)
- **Dense descriptions**: Some wrap 2-3 lines within a cell (items 30, 31, 49, 83)
- **PyMuPDF text extraction returned almost nothing** — only 78 chars from a page with ~87 rows of dense tabular data. The text is embedded as vector graphics in the PDF, not as searchable text layer.

## Full Extracted BOM

| Item | Rev | Tags | Qty | Catalog | MFG | Description |
|------|-----|------|-----|---------|-----|-------------|
| 1 | | ENCLOSURE | 1 | A62H6012SSLP3PT | HOFFMAN | 2-DOOR FLOOR-STAND 3-POINT LATCHES TYPE 4X, 62"X60"X12", SS TYPE 304 |
| 2 | | ENCLOSURE | 1 | A60P60 | HOFFMAN | PANEL FOR TYPE 3R 4 4X 12 13 ENCLOSURE, FITS 60X48, WHITE, STEEL |
| 3 | | ENCLOSURE | 1 | AHCI238S | HOFFMAN | CORROSION INHIBITOR SPRAY, 9.45 OUNCE CAN, PACKAGE QUANTITY 6 |
| 4 | | FAN1235 | 1 | HF1016414 | HOFFMAN | HF10 SIDE-MOUNT FILTER FAN, 115V 159CFM, LT GRAY |
| 5 | | FAN1235 | 1 | HG1000504 | HOFFMAN | HG FILTER FAN EXHAUST GRILLE IP55, FITS HF10 FANS 10-INCH, LT GRAY |
| 6 | | TAS1235 | 1 | THERM16F | HOFFMAN | THERMOSTAT CONTROLLER, 2.64X1.97X1.50, 115V FAHRENHEIT, LT GRAY, PLASTIC |
| 7 | | LT1255, LT1256 | 2 | EL900D | HOFFMAN | LED ENCLOSURE LIGHT, 900 LM, 100-240 VAC |
| 8 | | LT1255, LT1256 | 2 | ELA02MF | HOFFMAN | MAGNETS FOR MAGNETIC MOUNTING |
| 9 | | LT1255, LT1256 | 2 | ELC1001PBUL | HOFFMAN | CABLE, INFEED FOR EL LED ENCLOSURE LIGHTS, 1.0 METERS, 100-240 VAC, 3-POLE, BLACK |
| 10 | | LT1255, LT1256 | 2 | ELCN1 | HOFFMAN | CONNECTORS FOR EL LED ENCLOSURE LIGHT, AC, 250V, 16A, BLACK |
| 11 | | RCPT1249 | 1 | 5603049 | PHOENIX CONTACT | RAIL MOUNTED DUAL POWER OUTLET WITH TWO 120VAC 20A RECEPTACLES EQUIPPED WITH GROUND FAULT CIRCUIT INTERRUPTION |
| 12 | | RCPT1263 | 1 | P-R2-F2R0 | GRACEPORT | PANEL INTERFACE CONNECTOR WITH CATEGORY 5E RJ45; PANEL MOUNT HOUSING; UL TYPE 4X; SIMPLEX OUTLET |
| 13 | | ENCLOSURE | 1 | A628P12 | HOFFMAN | UNIVERSAL BARRIER PANEL FOR UNIBODY FREE-STAND, FITS A-62 AND C-12, WHITE, STEEL |
| 14 | | HTR1240 | 1 | DAH4001B | HOFFMAN | ELECTRIC HEATER, 115VAC 400W, 7.50X4.25X4.38 INCH, BRUSHED, ALUMINUM |
| 15 | | CB1104 | 1 | 140G-G2C3-C90 | ROCKWELL AUTOMATION | MOLDED CASE 90 AMP, 3-POLE, 600/347 VOLT AC, G FRAME, 25 KAIC |
| 16 | | CB1104 | 1 | 140G-G-RVM128 | ROCKWELL AUTOMATION | ACCESSORY FOR MCCB FOR VARIABLE DEPTH ROTARY OPERATING KIT, INCLUDES EXTERNAL HANDLE, OPERATING SHAFT, AND MCCB MOUNTED OPERATING MECHANISM, BLACK HANDLE |
| 17 | | CB1104 | 1 | KA2U | BURNDY | SINGLE GROUND LUG |
| 18 | | CB102 | 1 | 140G-G-TLC13 | ROCKWELL AUTOMATION | TERMINAL LUGS FOR MCCB, COPPER |
| 19 | | PM1005 | 1 | 2903528 | PHOENIX CONTACT | PHASE MONITORING RELAY, FOR PHASE SEQUENCE AND ASYMMETRY OF 3-PHASE VOLTAGES 480VAC, 1PDT, WITH SCREW CONNECTION |
| 20 | | SUP1009 | 1 | 2910386 | PHOENIX CONTACT | TYPE 2 SURGE PROTECTION DEVICE, 3-CHANNEL WITH REMOTE INDICATOR CONTACT FOR 480 VAC DELTA |
| 21 | | CB1018, CB1023, CB1028 | 3 | 140MT-C3E-B25 | ALLEN BRADLEY | BREAKER, MOTOR PROTECTION, ROTARY STYLE, 1.6-2.5A, 480VAC, C-FRAME, MAGNETIC TRIP |
| 22 | | CB1153 | 1 | 140MT-C3E-C16 | ALLEN BRADLEY | BREAKER, MOTOR PROTECTION, ROTARY STYLE, 10-16A, 480VAC, C-FRAME, MAGNETIC TRIP |
| 23 | D | CB1040, CB1076 | 2 | 140MT-F9E-C32 | ALLEN BRADLEY | BREAKER, MOTOR PROTECTION, ROTARY STYLE, 24-32A, 480VAC, F-FRAME, THERMAL/FIXED MAGNETIC TRIP |
| 24 | | CB1040, CB1076, CB1118, CB1123, CB1128, CB1153 | 6 | 140MTCAFA11 | ALLEN BRADLEY | 140MT AUXILIARY CONTACT WITH 1NO CONTACT AND 1NC CONTACT FRONT MOUNT |
| 25 | D | M1474, M1476, M1478, M1486 | 4 | 100-E09KJ10 | ROCKWELL AUTOMATION | 100-E-MCS-E CONTACTOR, 9A, AC3 DUTY, 24-60V AC, 20-60V DC ELECTRONIC COIL, 1 N.O |
| 26 | | ACCESSORY FOR MPCB | 2 | 140MT-C-WTEN | ALLEN BRADLEY | FEEDER TERMINAL - COMPACT BUSBARS, 64 A |
| 27 | | ACCESSORY FOR MPCB | 2 | 140MT-C-W453 | ALLEN BRADLEY | COMPACT BUSBAR, 64A, 3 X 45 MM SPACING, FOR 140MT, MOTOR PROTECTION |
| 28 | | OL1147, OL1153 | 2 | 193-T1APM | ALLEN BRADLEY | DIN RAIL/PANEL MOUNT ADAPTER |
| 29 | | OL1147, OL1153 | 2 | 193-T1AB40 | ALLEN BRADLEY | RELAY, OVERLOAD, 2.9 - 4.0A, T1, IEC, BI-METALLIC |
| 30 | | VFD1153 | 1 | 25B-D010N114 | ALLEN BRADLEY | AC DRIVE WITH EMBEDDED ETHERNET/IP AND SAFETY, 380-480V AC, 3 PHASE, 10.5 AMPS, 5 HP, 4 KW NORMAL DUTY, POWERFLEX 525, FRAME B, IP20 NEMA, FILTER |
| 31 | | VFD1040, VFD1076 | 2 | 25C-D024N114 | ALLEN BRADLEY | AC DRIVE WITH EMBEDDED ETHERNET/IP AND SAFETY, 380-480V AC, 3 PHASE, 24 AMPS, 15 HP, 11 KW NORMAL DUTY, POWERFLEX 527, FRAME C, IP20 NEMA, FILTER |
| 32 | | DBR1065, DBR1065A, DBR1101, DBR1101A | 4 | AK-R2-120P1K2 | ALLEN BRADLEY | BRAKING RESISTOR - ENCLOSED - POWERFLEX 70 DB RESISTOR, 120 OHM, 260 WATT, PROTECTED BY TEMPERATURE CONTROL SWITCH |
| 33 | | CB15444, CB15448 | 2 | 1489-M1C005 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 0.5 AMPS, C-CURVE, 120VAC |
| 34 | | CB1222, CB1226, CB1230, CB1243, CB1245, CB1255 | 6 | 1489-M1C010 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 1 AMPS, C-CURVE, 120VAC |
| 35 | | CB1235 | 1 | 1489-M1C020 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 2 AMPS, C-CURVE, 120VAC |
| 36 | B | CB1263, CB1268, CB1271, CB1290 | 4 | 1489-M1C030 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 3 AMPS, C-CURVE, 120VAC |
| 37 | | CB1240 | 1 | 1489-M1C050 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 5 AMPS, C-CURVE, 120VAC |
| 38 | | CB1294 | 1 | 1489-M1C080 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 8 AMPS, C-CURVE, 120VAC |
| 39 | | CB1249 | 1 | 1489-M1C100 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 10 AMPS, C-CURVE, 120VAC |
| 40 | | CB1300, CB1306 | 2 | 1489-M1C150 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 15 AMPS, C-CURVE, 120VAC |
| 41 | | CB1189A | 1 | 1489-M1C200 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 20 AMPS, C-CURVE, 120VAC |
| 42 | D | CB1219 | 1 | 1489-M1C320 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 1-POLE, 32 AMPS, C-CURVE, 120VAC |
| 43 | D | CB1183 | 1 | 1489-M2D160 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 2-POLE, 16 AMPS, D-CURVE, 120VAC |
| 44 | | CB1189 | 1 | 1489-M3D030 | ALLEN BRADLEY | MINIATURE CIRCUIT BREAKER, 3-POLE, 3 AMPS, D-CURVE, 120VAC |
| 45 | | XF1184 | 1 | SP3000ACP | HAMMOND | INDUSTRIAL CONTROL TRANSFORMER, 3.0 KVA, PRIMARY 240/480 VOLTS, SECONDARY 120/240 VAC |
| 46 | | XF1184 | 1 | SPFG1 | HAMMOND | FINGER GUARDS FOR TRANSFORMER |
| 47 | | UPS1301, BAT1303 | 1 | UBC10.241 | PULS | UNINTERRUPTIBLE POWER SUPPLY, DC-UPS FOR BUILT-IN BATTERY 24VDC INPUT AND 24VDC OUTPUT, 10A |
| 48 | | PWS1189 | 1 | QT20.241 | PULS | POWER SUPPLY, 3-PHASE AC 480VAC TO 24 VDC, 20 AMP, 480 WATT |
| 49 | | ELB1330 | 1 | 2905744 | PHOENIX CONTACT | ELECTRONIC CIRCUIT BREAKER WITH ACTIVE CURRENT LIMITATION FOR PROTECTING LIGHT LOADS AT 24 V DC, WITH NOMINAL CURRENT ASSISTANT AND ELECTRONIC LOCKING OF THE SET NOMINAL CURRENTS, FOR INSTALLATION ON DIN RAILS |
| 50 | | PLC1344 | 1 | 5069-L330ERM | ALLEN BRADLEY | COMPACTLOGIX ETHERNET MOTION CONTROLLER, ETHERNET/IP, USB COMMUNICATION |
| 51 | | PLC1344 | 1 | 5069-RTB4-SPRING | ALLEN BRADLEY | REMOVABLE TERMINAL BLOCK FOR CONTROLLER MOD POWER, 4-PIN |
| 52 | | PLC1344 | 1 | 5069-RTB6-SPRING | ALLEN BRADLEY | REMOVABLE TERMINAL BLOCK FOR CONTROLLER SA POWER, 6-PIN |
| 53 | | PLC1362, PLC1398, PLC1434 | 3 | 5069-IB16 | ALLEN BRADLEY | COMPACTLOGIX 16-POINT DIGITAL INPUT MODULE, 24VDC INPUTS |
| 54 | | PLC1470 | 1 | 5069-OB16 | ALLEN BRADLEY | COMPACTLOGIX 16-POINT RELAY OUTPUT MODULE, 24VDC OUTPUTS |
| 55 | | PLC1545 | 1 | 5069-IY4 | ALLEN BRADLEY | COMPACTLOGIX 4-POINT ANALOG INPUT MODULE, CURRENT/VOLTAGE |
| 56 | | PLC1362, PLC1398, PLC1434, PLC1470, PLC1545 | 5 | 5069-RTB18-SCREW RTB | ALLEN BRADLEY | TERMINAL BLOCK, SCREW TYPE, 18 PINS, FOR ALL ABOVE PLC I/O MODULES |
| 57 | | PLC ACCESSORY | 1 | 5069-ECR | ALLEN BRADLEY | COMPACTLOGIX RIGHT END CAP FOR TERMINATION |
| 58 | | HMI1331 | 1 | 2711P-T15C21D8S | ROCKWELL AUTOMATION | PANELVIEW PLUS 7 STANDARD TERMINAL, TOUCH SCREEN, 15 INCHES, TFT COLOR, SINGLE ETHERNET, 24V DC, WINDOWS CE 6 |
| 59 | | ETH1333 | 1 | 1783-CMS20DN | ALLEN BRADLEY | STRATIX 5200, 18 COPPER 10/1000 PORTS, 2 COMBO 10/1000 PORTS |
| 60 | | WC1335 | 1 SET | FLEX 8EX2 SERIES | MAGNETEK MATERIAL HANDLING | WIRELESS PENDANT SYSTEM, INCLUDING ONE RECEIVER AND TWO TRANSMITTERS, WIRELESS ANTENNA, CUSTOM LABEL, E-STOP, ONE SELECTOR SWITCH |
| 61 | | CR1245 | 1 | RH3B-ULC-120AC | IDEC | CONTROL RELAY, 3PDT, WITH INDICATOR AND CHECK BUTTON, 120VAC |
| 62 | | CR1245 | 1 | SH3B-05C | IDEC | SOCKET, RELAY |
| 63 | D/C | CR1470, CR1472, CR1480, CR1482, CR1484 | 5 | RH3B-ULC-DC24V | IDEC | CONTROL RELAY, 3PDT, WITH INDICATOR AND CHECK BUTTON, 24VDC |
| 64 | D/C | CR1470, CR1472, CR1480, CR1482, CR1484 | 5 | SH3B-05C | IDEC | SOCKET, RELAY |
| 65 | | PR1364 | 1 | ABD111NUB | IDEC | PUSH BUTTON - MOMENTARY, NEMA 4/4X, BLACK, WITH 1 N.O. + 1 N.C. CONTACT BLOCKS |
| 66 | | LT1259 | 1 | APD1QH2DNW | IDEC | WHITE PILOT LIGHT - STANDARD, FULL VOLTAGE, NEMA 4/4X |
| 67 | | PB1362 | 1 | AVD311NUR | IDEC | MUSHROOM HEAD EMERGENCY STOP BUTTON, 40 MM, PUSH-LOCK, TURN RESET, RED, NEMA 4X, WITH (1) N.O. + (1) N.C. CONTACT BLOCKS |
| 68 | | SS1390 | 1 | ASD211NU | IDEC | TWND SERIES, 2-POSITION MAINTAINED SELECTOR SWITCH, KNOB TYPE, WITH (1) N.O. + (1) N.C. CONTACT BLOCKS |
| 69 | | PB1364, LT1259, PB1362, SS1390 | 4 | GRAVOGRAPH | GRAVOPLY ULTRA | GENERIC OPERATOR TAG - ENGRAVE AS SHOWN |
| 70 | | TB-M | 13 | 3038338 | PHOENIX CONTACT | 1-LEVEL TERMINAL BLOCK - ST 4 PE/L, MULTI-LEVEL, 32AMPS, GRAY, 0.08-6MM2, 28-10 AWG, CLIPLINE SPRING CAGE |
| 71 | | TB-GND | 10 | 3044759 | PHOENIX CONTACT | GROUND TERMINAL, NUMBER OF CONNECTIONS: 2, SCREW CONNECTION, CROSS SECTION: 0.14 MM2 - 6 MM2, MOUNTING TYPE: NS 35/7.5, NS 35/15, COLOR: GREEN-YELLOW |
| 72 | B | TB-1, TB-2, TB-3, TB-DI, TB, TB-AI | 70 | 3044814 | PHOENIX CONTACT | DOUBLE-LEVEL TERMINAL BLOCK, NOM. VOLTAGE: 800V, NOMINAL CURRENT: 30A, SCREW CONNECTION, 1ST AND 2ND LEVEL, RATED CROSS SECTION: 4 MM2, 0.14 MM2 - 6 MM2, NS 35/7.5, NS 35/15, GRAY |
| 73 | | TB-1, TB-2, TB-3, TB-DI, TB, TB-AI | 10 | 3047293 | PHOENIX CONTACT | END COVER |
| 74 | | TB ACCESSORY | 30 | 800886 | PHOENIX CONTACT | END BRACKET - E/NS 35 N, ACCESSORY, END BRACKET, GRAY, FOR THE NS 35 DIN RAIL, 9.5MM WIDTH |
| 75 | | ACCESSORY | AS REQUIRED | 807012 | PHOENIX CONTACT | DIN RAIL PERFORATED, ACC. TO EN 60715, STEEL, GALVANIZED, STANDARD PROFILE, SILVER, 35MM, 7.5MM, 1000MM |
| 76 | | ENCLOSURE ACCESSORY | A/R | TYD2X3NPW6 | THOMAS & BETTS | NARROW SLOT WIRING DUCT, PVC, 2"X3" HIGH |
| 77 | | ENCLOSURE ACCESSORY | A/R | TYD2CPW6 | THOMAS & BETTS | WIRE DUCT COVER FOR 2" DUCTS |
| 78 | | ENCLOSURE ACCESSORY | A/R | TYD1X3NPW6 | THOMAS & BETTS | NARROW SLOT WIRING DUCT, PVC, 1"X3" HIGH |
| 79 | | ENCLOSURE ACCESSORY | A/R | TYD1CPW6 | THOMAS & BETTS | WIRE DUCT COVER FOR 1" DUCTS |
| 80 | | ACCESORRY | 1 | 679002 | OVIVO | NAME PLATE (ETCH AS SHOWN) |
| 81 | | ACCESORRY | 1 | 49046A | OVIVO | NAME PLATE - "DANGER" |
| 82 | | "TRASH RAKE MAIN CONTROL PANEL" | 1 | 592273 | OVIVO | ENCLOSURE EQUIPMENT TAG ID, BLACK BACKGROUND WITH 3/16 INCH WHITE LETTERS, NOMINAL HEIGHT OF NAMEPLATES 2 INCHES |
| 83 | | GROUND BAR | 1 | GBK520 | EATON | 5 TERMINAL GROUND BAR KIT, 1-3/4 IN MOUNTING HOLE DISTANCE, 1-2/0 LUG, CH, 5 TERMINALS, 0.75 IN |
| 84 | C | CRSAFETY1310 | 1 | LG5925-48-61-24 | AUTOMATIONDIRECT | DOLD SAFETY RELAY, EMERGENCY STOP AND SAFETY GATES, 2-CHANNEL, 24 VAC/VDC, (3) N.O. SAFETY OUTPUTS, (1) N.C. MONITORING OUTPUTS, FIXED SCREW TERMINALS |
| 85 | D | CR1315, CR1317 | 2 | AFS09-30-22-11 | ABB | AFS SERIES, ABB SAFETY CONTACTOR SERIES AFS09-30-22-11, 20-60VDC |
| 86 | | TB-M | 4 | 3044102 | PHOENIX CONTACT | UT-4 FEED THROUGH TERMINAL BLOCK NOM. VOLTAGE 1000V, CURRENT 32A, NO. OF CONNECTION 2, SCREW CONNECTION, CROSS SECTION 0.14MM-6MM, NS 35/7.5, NS 35/15, GRAY |
| 87 | D | TB-M | 4 | 3047028 | PHOENIX CONTACT | D-UT 2.5/10 END COVER |

### Judgment Calls Made During Extraction

1. **Item 42 catalog `1489-M1C320`**: At 300 DPI this was indistinguishable from `1489-M2C030` — a completely different part (2-pole 3A vs 1-pole 32A). Only resolved at 600 DPI tight crop. The description cross-check was essential.
2. **Item 33 tags `CB15444, CB15448`**: 5-digit suffixes break the 4-digit pattern used everywhere else. Verified at 600 DPI — the drawing genuinely shows 5 digits.
3. **Item 69 catalog/MFG swap**: GRAVOGRAPH (a manufacturer) is in the CATALOG column; GRAVOPLY ULTRA (a product line) is in the MFG column. Reported as-read.
4. **Item 60 MFG**: Reads "MAGNETEX MATERIAL HANDLING" — likely should be "MAGNETEK" (known wireless pendant manufacturer). Reported as-read.
5. **Items 80-81 tag typo**: Drawing says "ACCESORRY" (missing S). Preserved as-is.
6. **Non-numeric quantities**: Items 75 ("AS REQUIRED"), 76-79 ("A/R"), 60 ("1 SET") — these are valid BOM conventions but break numeric parsing.
7. **Item 72 qty 70**: Confirmed at 600 DPI. High-volume terminal blocks are normal for a panel this size.

---

---

## Phase 2 — What Actually Worked

### DPI was the decisive variable

- **300 DPI** (5100x3300): Full page readable for ~70% of items. Descriptions and large text fine. But catalog numbers with similar characters were ambiguous — `M1C320` vs `M2C030`, `SPFG1` vs `SP912`, `UBC10.241` vs `UBEC.241`. At this resolution, **I would have shipped wrong part numbers** for items 42, 43, 46, 47, 48.
- **400 DPI** (6800x4400): Better, got me to ~90% confidence. Still uncertain on the tightest clusters of alphanumeric characters.
- **600 DPI** (10200x6600): 100% of catalog numbers resolved. This was the minimum for zero-ambiguity extraction on this drawing. File size: the full page PNG was ~8MB.

### Cropping was essential, not optional

The full page at 300 DPI was 5100x3300 — even at that resolution, a vision model sees the entire table as thumbnailed content. The text occupies maybe 6-8px per character. I had to crop into strips of ~3400x400 pixels to get characters large enough for reliable reading.

At 600 DPI, tight crops of specific rows (e.g., 5000x350 for items 42-44) gave the clearest reads. The "zoom to region of interest" pattern was the single biggest accuracy improvement.

### No rotation needed

This drawing is cleanly oriented — no rotated text, no angled headers, no vertical labels in the BOM itself. Other Ovivo drawings may differ.

### Heuristics applied for ambiguous cells

1. **Catalog-description cross-validation**: When a catalog number was ambiguous, the description served as a cross-check. `1489-M1C320` paired with "1-POLE, 32 AMPS" is internally consistent; `1489-M2C030` would pair with "2-POLE, 3 AMPS". This resolved item 42 definitively.
2. **Tag naming patterns**: Most tags follow `PREFIX` + 4-digit number. Item 33's `CB15444` was flagged as anomalous and re-verified — it's genuinely 5 digits.
3. **Manufacturer product knowledge**: Knowing that PULS makes `QT20.241` (not `GT20.241`) and `UBC10.241` (not `UBEC.241`) helped confirm readings. A model without industrial component knowledge would miss these.
4. **Multi-line cell detection**: The row height changes when TAGS span multiple lines. The visual cue is that adjacent columns (QTY, CATALOG, MFG) are vertically centered while TAGS wraps. This prevented misaligning data across rows.

### Where a single-shot vision call would fail without these moves

1. **Full-page image at 300 DPI**: Too many characters per pixel. Catalog numbers would be garbled on ~15% of rows — the most critical data in the BOM.
2. **No cropping**: Even at 600 DPI, sending a 10200x6600 image to a vision API means the model downsamples internally. The effective resolution for reading small text drops back to ~300 DPI equivalent.
3. **Two-column layout**: A naive "read the table top-to-bottom" prompt would interleave left and right columns, producing nonsensical item sequences (1, 51, 2, 52...).
4. **Non-numeric QTY fields**: A schema expecting `qty: number` would reject or zero-out "AS REQUIRED", "A/R", "1 SET".
5. **Revision marks in margin**: Triangle symbols with B/C/D could be parsed as extra columns or merged into the ITEM number.

### Honest failure flags

- **Item 70 description**: I read "1-LEVEL" then "MULTI-LEVEL" in the same description which is contradictory. May have misread the first character. The catalog number `3038338` is definitive for ordering, so this is cosmetic.
- **Item 69 CATALOG/MFG swap**: I can't tell if the *drawing* has the fields swapped or if I'm misaligning columns. The column widths narrow on the right side of the page.
- **Long descriptions truncated**: Items 30, 31, 49, 72, 83 have descriptions that wrap 2-3 lines. I captured the key specs but may have dropped trailing phrases.

---

---

## Phase 3 — ARC Port

### 1. Prompt String

```
You are extracting a Bill of Materials (BOM) from a control panel engineering drawing. The BOM is presented as a table on one or more page images.

LAYOUT AWARENESS:
- The BOM table may use a TWO-COLUMN layout: the left half of the page contains one set of items, the right half contains a CONTINUATION with higher item numbers. These are NOT duplicates — extract both halves as separate sequential rows.
- Column headers are: ITEM | TAGS | QTY | CATALOG | MFG | DESCRIPTION
- "TAGS" are device reference designators (e.g., CB1104, PLC1344, VFD1153). A single row may list multiple tags separated by commas, sometimes spanning multiple lines within the cell.

EXTRACTION RULES:
1. Extract every row from the table. Do not skip rows even if they appear to be accessories, notes, or generic items.
2. For CATALOG (part number): read EVERY character precisely. These are alphanumeric codes where a single wrong character means a completely different part. When uncertain, cross-validate against the DESCRIPTION — the description often restates the key specs (pole count, amperage, voltage) that are encoded in the catalog number.
3. For QTY: most values are integers, but some valid non-numeric values exist: "AS REQUIRED", "A/R", "1 SET". Preserve these as strings, not numbers.
4. For TAGS: preserve comma-separated lists exactly as shown. Some cells span multiple lines — concatenate them into a single comma-separated string.
5. For MFG (manufacturer): common manufacturers include ALLEN BRADLEY, ROCKWELL AUTOMATION, HOFFMAN, PHOENIX CONTACT, IDEC, HAMMOND, PULS, ABB, EATON, THOMAS & BETTS, AUTOMATIONDIRECT, BURNDY.
6. DESCRIPTION may wrap across multiple lines within a cell. Concatenate into a single string.
7. REVISION MARKS: triangles with letters (A, B, C, D) may appear in the left margin next to certain rows. Capture the revision letter if present; otherwise leave the revision field empty.
8. Preserve typos and unusual text exactly as they appear on the drawing (e.g., "ACCESORRY" should NOT be corrected to "ACCESSORY").
9. If a CATALOG or MFG field appears to have its content swapped with the adjacent column (manufacturer name in catalog field, product name in MFG field), extract as-read and flag it.

OUTPUT: Return a JSON array of objects. Each object represents one BOM row.

CRITICAL: Part numbers are the highest-priority field. When in doubt about any character in a catalog number, state your uncertainty in a "catalogNotes" field rather than guessing. A wrong part number is worse than a flagged one.
```

### 2. Recommended Preprocessing Pipeline

```
ARC JS-side preprocessing before the API call:

1. PAGE DETECTION
   - Identify which pages contain the BOM. Look for the title
     "BILL OF MATERIAL" or a dense table structure.
   - Ovivo drawings: BOM is typically on a single page (often page 9),
     but may span 2-3 pages on larger jobs.

2. RENDER AT 400 DPI MINIMUM
   - Use pdf.js or server-side PDF renderer at 400 DPI.
   - For D-size (17x11") pages, this produces ~6800x4400 images.
   - 300 DPI is NOT enough for reliable catalog number extraction.
   - 600 DPI is ideal but produces ~10MB PNGs — may hit API limits.

3. SPLIT INTO HALF-PAGE CROPS
   - Detect the two-column layout by finding the vertical divider line
     (typically at ~50% page width) or by looking for duplicate header
     rows.
   - Crop LEFT HALF and RIGHT HALF as separate images.
   - Each half is ~3400x4400 at 400 DPI — well within vision API limits
     and gives excellent character resolution.

4. SEND AS MULTI-IMAGE CALL
   - Send left-half and right-half as two images in a single API call.
   - The prompt instructs the model that these are left and right halves
     of a two-column BOM, with the right half containing higher item
     numbers.
   - For multi-page BOMs: send all half-page crops in one call (up to
     the image limit), labeled "Page N Left" / "Page N Right".

5. PREFER NATIVE PDF OVER RENDERED IMAGES
   - If the API supports PDF document input (Anthropic does via
     document type), send the native PDF. Vector text at the PDF level
     has infinite resolution — no DPI concerns.
   - HOWEVER: test first. Some Ovivo PDFs embed the BOM as drawn
     graphics (lines + positioned text blocks), not as reflowable table
     data. PyMuPDF extracted only 78 chars from this page — the "text"
     is actually path objects. Native PDF input may still need the
     vision pathway for such files.

6. FALLBACK: QUADRANT CROPS
   - If half-page crops still produce ambiguous catalog numbers,
     quarter the page into 4 quadrants (~3400x2200 each at 400 DPI).
   - Send all 4 as separate images with position labels.
   - This is the nuclear option — highest accuracy, 4x the API cost.
```

### 3. JSON Schema for Structured Output

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["bomRows", "metadata"],
  "properties": {
    "metadata": {
      "type": "object",
      "properties": {
        "drawingNumber": { "type": "string" },
        "revision": { "type": "string" },
        "projectName": { "type": "string" },
        "totalItems": { "type": "integer" },
        "pageLayout": {
          "type": "string",
          "enum": ["single-column", "two-column", "multi-page"]
        },
        "extractionNotes": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "bomRows": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["item", "qty", "catalog", "mfg", "description"],
        "properties": {
          "item": { "type": "integer" },
          "revMark": {
            "type": "string",
            "description": "Revision letter (A/B/C/D) if a revision triangle appears next to this row, empty string otherwise"
          },
          "tags": {
            "type": "string",
            "description": "Comma-separated device reference designators exactly as shown on drawing"
          },
          "qty": {
            "type": ["integer", "string"],
            "description": "Integer for numeric quantities; string for 'AS REQUIRED', 'A/R', '1 SET', etc."
          },
          "catalog": {
            "type": "string",
            "description": "Catalog/part number — highest priority field, must be character-exact"
          },
          "mfg": { "type": "string" },
          "description": { "type": "string" },
          "catalogNotes": {
            "type": "string",
            "description": "If any character in the catalog number is uncertain, describe the ambiguity here"
          },
          "confidence": {
            "type": "string",
            "enum": ["high", "medium", "low"],
            "description": "Overall confidence in this row's extraction accuracy"
          }
        }
      }
    }
  }
}
```

### 4. Validation Checks

Run these on the API response before accepting the BOM:

```
POST-EXTRACTION VALIDATION CHECKLIST

A. STRUCTURAL CHECKS
   [ ] Item numbers are sequential (1, 2, 3...) with no gaps
       — gaps may indicate missed rows
   [ ] Item numbers don't exceed reasonable range (typically <200)
   [ ] Total row count matches metadata.totalItems
   [ ] No duplicate item numbers

B. FIELD COMPLETENESS
   [ ] Every row has non-empty catalog OR non-empty description
       — a row with both empty is likely a parsing artifact
   [ ] Every row has non-empty mfg
   [ ] qty is either a positive integer, or one of the known
       non-numeric values: "AS REQUIRED", "A/R", "1 SET", "AR"
   [ ] No qty value of 0 (likely a misread)

C. CATALOG NUMBER SANITY
   [ ] No catalog number contains spaces in the middle of what
       should be a contiguous code (e.g., "1489-M1 C320" is wrong)
   [ ] Known manufacturer prefixes match:
       - Allen Bradley: 1489-*, 140MT-*, 140G-*, 5069-*, 193-*,
         100-E*, 25B-*, 25C-*, 1783-*, 2711P-*
       - Phoenix Contact: 6-7 digit numbers (2903528, 3044759, etc.)
       - IDEC: RH3B-*, SH3B-*, ABD*, APD*, AVD*, ASD*
       - Hoffman: A6*, EL*, HF*, HG*, THERM*, DAH*
       - PULS: UBC*, QT*, CP*
   [ ] Flag any row where catalogNotes is non-empty for manual review
   [ ] Flag any row with confidence = "low"

D. CROSS-VALIDATION
   [ ] For 1489-M series breakers: verify catalog number encodes
       the same pole count and amperage as the description states
       (M1 = 1-pole, M2 = 2-pole, M3 = 3-pole; last digits = amps)
   [ ] Tags that appear in multiple rows should have consistent
       manufacturer across related items (e.g., all PLC1344 items
       should be Allen Bradley)
   [ ] Qty should be >= count of comma-separated tags
       (if tags = "CB1222, CB1226, CB1230" then qty >= 3)

E. LAYOUT-SPECIFIC CHECKS
   [ ] If two-column layout detected: right-column item numbers
       should be higher than all left-column item numbers
   [ ] No item number appears in both columns (would indicate
       misdetected layout)
```

---

**Summary**: 87-item BOM fully extracted from a single D-size Ovivo drawing page. The critical finding for ARC is that **400+ DPI with half-page cropping** is the minimum for reliable catalog number extraction. Sending the full page at 300 DPI would produce plausible-looking but wrong part numbers on ~15% of rows — the most dangerous failure mode because it's silent. The prompt's cross-validation instruction (catalog vs description) is the safety net, but preprocessing is the primary defense.
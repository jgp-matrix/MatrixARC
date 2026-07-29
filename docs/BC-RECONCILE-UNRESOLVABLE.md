# BC #No. Reconciliation — Unresolvable Items (refined dry-run)

> Generated from the **refined** `reconcileBcNos` dry-run against the new sandbox
> `MATR_SndBx_UAT_070926`. Non-item pseudo-rows (CRATE / CONTINGENCY / WIRE & CONS /
> JOB BUYOFF, labor, buyoff) are now bucketed as **nonItem** and excluded from this list.
> This file is Jon's BC-check worklist for the migration reconciliation.

## Dry-run totals (2638 BOM rows across 95 projects)

| Bucket | Rows | Meaning |
|--------|------|---------|
| resolvable | 1844 | old Part# → MTX# resolved cleanly via `ItemCard?$filter=Vendor_Item_No eq …` |
| alreadyMtx | 202 | row `bcNo` already an `MTX-#####` |
| laborOrNull | 215 | labor / no part# — nothing to resolve |
| **nonItem** | **306** | pseudo-parts (crate, contingency, wire&cons, job buyoff, buyoffs) — skipped by design |
| **unresolvable** | **71 rows / 56 distinct** | ItemCard returned no match on `Vendor_Item_No` — **the list below** |
| ambiguous | 1 | multiple ItemCard hits (see bottom) |

**94% of real item rows resolve.** Only the 56 distinct parts below need eyes.

---

## Category A — REVISED after reading actual row data (2026-07-28)

> **Correction:** my first pass mis-categorized 3 real, priced items as "garbage." Reading the
> live Firestore rows moved them to Category B (real → check in BC). What remains in A splits into
> **A1 (truly non-BC → Text-line is correct, no data fix)** and **A2 (real part, broken part# →
> needs a correct value only Jon/the drawing can supply)**.

### A1 — truly non-BC (relink correctly degrades to a descriptive Text line; NO fix needed)

| # | Value in ARC | Mfr | Description | Row state |
|---|---|---|---|---|
| 7 | `Custom Bracket` | Precision Digital | Custom mounting bracket (×2 rows) | qty 1, no BC item — custom-fabricated |
| 8 | `679031` | OVIVO PROPRIETARY TAG | Enclosure nameplate | qty 1 — proprietary |
| 56 | `GRAVORY ULTRA` | GRAVOGRAPH | Door operator tag | qty 1 — engraving stock |
| 29 | `TP-1X4` | Matrix Systems | Panel Tag Plate 1x4, custom text | qty 2 @ $3.50 — in-house tag |

### A2 — real part, broken part# (needs correct value; can't be invented)

> **Jon ruling (2026-07-28): LEAVE AS-IS for now** — "I haven't defined what these need to be yet."
> They ride as descriptive Text lines at Re-link (qty + description, no BC item link, no cost in the
> BC budget) until Jon defines the correct part#. Not a blocker for the migration.

| # | Value in ARC | Mfr | Description | Row state |
|---|---|---|---|---|
| 35 | `1492-D2Cxxx` | Allen-Bradley | DC mini breaker | **qty 26**, PRJ402142 — `xxx`=missing amp code; Jon crossed another instance → `2907662` in F068 |
| 6 | `Unkown` | Nvent Hoffman | Side mounted exhaust | qty 1 @ $35 (PRJ402108) + qty 1 (PRJ402111) — literal typo |

### Moved A → B (real, priced items — check in BC)

| Was # | Value | Mfr | Row state — why it's real |
|---|---|---|---|
| 33 | `EVMFL8551G321DC24/DCK` | ASCO (Royal Wholesale) | qty 2 @ **$1033**, `priceSource: bc` — 25-char part# vs `_bcNo` 20-char truncation = formatting miss |
| 45 | `TYO1CPW6` | T&B by ABB | qty 1 @ $18 — real duct **cover** |
| 47 | `TYO2CPW6` | T&B by ABB | qty 1 @ $25 — real duct **cover** |

## Category B — real catalog parts to check in BC (your worklist)

Likely exist in the new sandbox under a different `Vendor_Item_No` (formatting variant,
missing hyphen, truncation, or distributor #). Please confirm/correct in BC.

| # | Rows | Value in ARC | Mfr | Description | Projects |
|---|---|---|---|---|---|
| 1 | 5 | `5069-RTB18-SCREW` | Allen-Bradley | Compact 5000 18 Screw RTB | 402096, 402109, 402089, 402076, 402143 |
| 2 | 4 | `129752` | Chromolax | Rack Heater | 402142 |
| 3 | 4 | `FT19R-3U` | States | FMS 19" Rack Mount 30 Pole, 3U | 402142 |
| 4 | 3 | `1002` | HUBBELL | RIGID LOCKNUT | 402109, 402119 |
| 5 | 2 | `8018445` | Rittal | Window Kits Stainless steel | 402111, 402108 |
| 9 | 1 | `1263628` | Phoenix Contact | Double socket (GFO) Class A1 15A | 402101 |
| 10 | 1 | `1340516` | Phoenix Contact | Energy storage (battery) for UPS 24VDC 20AH | 402101 |
| 11 | 1 | `2320788` | Phoenix Contact | Battery mounting kit | 402101 |
| 12 | 1 | `2910396` | Phoenix Contact | Type 2 surge protection | 402101 |
| 13 | 1 | `DCT880-1` | ABB | SCR, Power Controller | 402096 |
| 14 | 1 | `1032264 CS` | Phoenix Contact | Touchscreen PC 15.6" (CUSTOMER SUPPLIED) | 402096 |
| 15 | 1 | `CBL-PWR-5.5DC - 2.1` | Superlogistics | DC plug 2.1x5.5mm female jack | 402065 |
| 16 | 1 | `CBL-PWR-5.5DC-2.5` | Superlogistics | DC plug 2.5x5.5mm male jack | 402065 |
| 17 | 1 | `KA43688A` | ? | Panel mounting gasket kit, NEMA 4 | 402117 |
| 18 | 1 | `PB-204` | ALL ELECTRONICS | Momentary pushbutton (1 N.O.) | 402117 |
| 19 | 1 | `480-6328-ND` | DIGI-KEY | Potentiometer 2M-Ohm | 402117 |
| 20 | 1 | `0206 351.16` | ENTRELEC | End stop | 402117 |
| 21 | 1 | `1489-M1CD30` | Allen-Bradley | Bulletin 1489 MCB, 1-pole, C-curve, 3A | 402111 |
| 22 | 1 | `6ES7507-0RA00-0AB0` | SIEMENS | S7-1500 system power supply PS 60W | 402087 |
| 23 | 1 | `6ES7531-7NF00-0AB0` | SIEMENS | S7-1500 analog input AI 8xU/I HF | 402087 |
| 24 | 1 | `6GK5416-4GS00-2AM2` | SIEMENS | SCALANCE XM416-4C managed switch | 402087 |
| 25 | 1 | `09310062701` | HARTING | Insert, screw term, female, 16B, 6 contacts | 402098 |
| 26 | 1 | `19000005098` | HARTING | Cable gland M40 | 402098 |
| 27 | 1 | `19300160428` | HARTING | Hood, 16B, high, double locking lever | 402098 |
| 28 | 1 | `2471N5` | McMaster Carr | Static-control pull handle, black nylon | 402098 |
| 30 | 1 | `SCE-60EL6018LPPL` | SAGINAW | EL LPPL double-door enclosure 60x60x18 | 402143 |
| 31 | 1 | `SCE-N12FA66LG` | SAGINAW | Filter fan (115V) Type 12 RAL 7035 | 402143 |
| 32 | 1 | `TI-G80` | TRENDnet | 8-port hardened industrial gigabit DIN switch | 402143 |
| 34 | 1 | `RH4B-ULCAC120V` | IDEC | Relay DPDT 4-pole 120VAC coil | 402108 |
| 36 | 1 | `SCE-90EL4820SSFD` | SAGINAW | SS EL PDD double-door enclosure 90x48x20 NEMA 4X | 402101 |
| 37 | 1 | `SCE-90P4BF` | SAGINAW | Sub-panel, full, 78"x44" | 402101 |
| 38 | 1 | `SCE-ACS400E460VSS` | SAGINAW | Air conditioner 3440 BTU/hr 460VAC | 402101 |
| 39 | 1 | `SCE-UF18` | SAGINAW | LED light fixture 120VAC | 402101 |
| 40 | 1 | `XT1US060MFF000XXX` | ABB | MCCB 3-pole thermal-mag 60A 480VAC XT1 | 402101 |
| 41 | 1 | `KXT4PHES500` | ABB | Adjustable depth/rotary handle rod | 402101 |
| 42 | 1 | `KXT4RHEHGT` | ABB | Rotary handle extended RHE | 402101 |
| 43 | 1 | `0802886` | Phoenix Contact | End clamp | 402101 |
| 44 | 1 | `0801012` | Phoenix Contact | DIN rail NS 35/7.5 perforated 1M | 402101 |
| 46 | 1 | `TYO2X3MWP6` | T&B by ABB | Wide slot wiring duct 2x3 white w/cover | 402101 |
| 48 | 1 | `TYD3X3MWP6` | T&B by ABB | Wide slot wiring duct 3x3 white w/cover | 402101 |
| 49 | 1 | `150-C16NBD` | Rockwell | Soft starter SMC-3 480VAC 5-10HP | 402101 |
| 50 | 1 | `SU202M-K13` | ABB | MCB 2-pole 13A K-curve | 402101 |
| 51 | 1 | `SU201M-K30` | ABB | MCB 1-pole 30A K-curve | 402101 |
| 52 | 1 | `2080-L70E-24QWB` | Rockwell | Micro870 24-point Ethernet controller | 402101 |
| 53 | 1 | `2085-OB16` | Rockwell | Micro800 output module 16-pt 12/24VDC | 402101 |
| 54 | 1 | `RH1B-ULCDC24V` | IDEC | Control relay SPDT 10A 24VDC | 402108 |
| 55 | 1 | `SHOB-05` | IDEC | Companion of RH1B-ULCDC24V (socket) | 402108 |

## Ambiguous (1)

| Value | Mfr | Description | Note |
|---|---|---|---|
| `1002` | HUBBELL | RIGID LOCKNUT | ItemCard returned multiple hits — needs a specific MTX# picked |

*(Note: `1002` appears in both the unresolvable and ambiguous buckets across different rows —
same generic value, different match outcomes per project.)*

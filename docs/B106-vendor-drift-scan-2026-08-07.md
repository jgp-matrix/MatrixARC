# B106 — vendor name↔number drift scan (2026-08-07, Freddy)

**Read-only scan of all projects** via `tools/b106-vendor-drift-scan.js` (admin service-account). Reproduce: `NODE_PATH=functions/node_modules node tools/b106-vendor-drift-scan.js`. Full per-project breakdown = the script's output; this doc is the summary + the actionable conflict table.

## Headline
The vendor number↔name drift is **systemic, not the 12 Crum rows**:
- **103 projects scanned · 2,323 BOM rows carry both a vendor# and a name.**
- **14 vendor numbers appear under >1 name; ~11 carry genuinely-different companies** (not just cosmetic string variants).
- **~47 projects touched · ~144 rows** sit in a minority name-bucket (candidate mislabels).

## Why a BC-free scan can't be the final list (B102 lesson)
A scan can flag a **conflict** but not **which side is right** — a number can be *consistently* mislabeled. Proof: on **PRJ402509, V00251 shows "Crum Electric" on 12 rows and "Heitek Automation" on 6** — yet V00251 IS Heitek in BC, so the 12-row *majority* is the wrong one. Any "majority wins" / "minority = drift" heuristic gets this backwards. **The authoritative fix list requires BC's vendor number→name map** (`bcListVendors`), which only a live BC session has.

## The 14 conflicting vendor numbers (reliable signal — one number, multiple names)
Truth column: ✅ = known authoritatively (memory/Jon); ❓ = needs BC map.

| Vendor# | Names seen in ARC | BC truth | Note |
|---|---|---|---|
| **V00251** | Crum Electric, Crum Electric Supply, **Heitek Automation**, Royal Wholesale | ✅ **Heitek** (Jon) | 12 "Crum" rows on PRJ402509 = mislabeled; Jon's intent = re-point to Crum **V00179** |
| **V00179** | Crum Electric, Crum Electric Supply | ✅ **Crum** (Jon) | cosmetic variant — benign |
| **V00196** | **Digikey**, Royal Wholesale | ✅ **DigiKey** (F075) | "Royal Wholesale" on PRJ402135 (6 rows) = wrong |
| V00373 | Royal Wholesale, ROYAL - SALT LAKE CITY, Codale Electric Supply, Intermountain Fuse Supply, Digikey, Standard Supply Electronics | ❓ | 6 companies under one # — widest |
| V00374 | RS-Online, Crum Electric, ROYAL - SALT LAKE CITY, Intermountain Fuse Supply, TMMI, Royal Wholesale, Crum Electric Supply, Digikey, Galco Industrial Electronics, Grainger Industrial | ❓ | 10 companies — worst |
| V00261 | Intermountain Fuse Supply, Royal Wholesale, RS-Online, Applied Automation | ❓ | |
| V00165 | Codale Electric Supply, Royal Wholesale, Intermountain Fuse Supply | ❓ | |
| V00213 | RS-Online, Emerson Online, Royal Wholesale, DigiKey | ❓ | |
| V00309 | Matrix Systems, Ovivo | ❓ | |
| V00030 | Jepco, Matrix Systems | ❓ | |
| V00357 | Rust Automation and controls Inc., ROYAL - SALT LAKE CITY | ❓ | |
| V00090 | Digikey, Automation Direct | ❓ | |
| V00020 | Royal DIRECT, ROYAL - SALT LAKE CITY | ❓ | both "Royal" — likely cosmetic |
| V00366 | Rittal North America,LLC, Rittal LLC | ❓ | cosmetic variant — likely benign |

## Two sub-populations (the fix differs per type)
1. **Number correct, name-string drifted** → mechanical fix: re-stamp `bcVendorName = bcName(number)`. Auto-repairable once we have the BC map. (Cosmetic variants + wrong-name-right-number.)
2. **Number wrong, name reflects intent** (the 12 Crum rows on V00251=Heitek → intent Crum V00179) → **cannot be auto-inferred**; needs Jon's per-vendor intent (re-point the number).

## What I need from Jon to produce the authoritative list
The BC vendor number→name map from a live BC session. One console paste in the BC-connected tab:
```js
(async()=>{const vs=await bcListVendors();copy(JSON.stringify(vs.map(v=>({n:v.number,name:v.displayName}))));console.log(vs.length+" vendors copied to clipboard");})()
```
Paste the JSON back. Then I re-run the scan with authoritative resolution → an exact per-project/per-row list of every row whose stored name disagrees with its number's true BC name, split into the two sub-populations above.

## Forward plan (pending Jon)
- **Scale changes the approach:** ~144 rows across ~47 projects is impractical to hand-fix row-by-row. Options: (a) I run a **one-time admin backfill** (safe for sub-population #1 — re-stamp name-from-number; logged, reversible, change-only); (b) build the reusable in-app **repair tool** (surfaces name≠number for one-click re-select — needed for sub-population #2's intent calls); (c) both.
- **Sub-population #2** (number wrong) still needs Jon's intent per vendor (e.g. "V00251 Crum rows → V00179").

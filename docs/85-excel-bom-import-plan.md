# #85 — Excel/CSV → BOM DIRECT IMPORT (column-mapping modal)

**Coach (Sam Wize) · build-ready design · prod baseline v1.25.1 · `src/app.jsx`.** Design only — no code.
**Scope (Jon 2026-08-07, locked):** DIRECT import (Option A) — the uploaded file *is* the BOM, parsed straight into `panel.bom`. Not the cross-check oracle. Column-mapping modal with intelligent auto-detect. Excel (.xlsx) + CSV.
**Design principle:** Clone `SupplierPricingUploadModal` (:49600) and swap three things: (a) add SheetJS `.xlsx` read, (b) map to BOM fields not pricing fields, (c) output rows into `panel.bom` via the panel save funnel instead of the BC lookup/write flow.

---

## 1. Entry point / hook
**Recommendation: a dedicated "Import BOM from file" button + its own modal — do NOT extend the extraction dropzone (`addFiles`).** The extraction input (:33354) is hard-scoped to `image/*,application/pdf` and `addFiles` (:28434) is a heavyweight AI pipeline (API-key gate :28473, read-only :28487, revision #153 :28493, page-type detect/confirm, bgStart). Routing spreadsheets through it = high blast radius on the most safety-critical entry path. A separate control mirrors every other modal-driven BOM writer (CPD :35426).

**Mounts inside `PanelCard`** (owns `addFiles`, `panel`, `onUpdate`, `onSaveImmediate`, `readOnly`, `uid`). Trigger button in the DRAWINGS/BOM toolbar (~:33074–33095). Gate `!readOnly`. New state `showBomImport`; mount alongside CPD modal at :35426 with an `onImportBom` funnel byte-identical to CPD's:
```
onImportBom={rows=>{const newBom=[...(panel.bom||[]),...rows];const updated={...panel,bom:newBom};onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}setShowBomImport(false);}}
```

## 2. Parse layer
New `BomFileImportModal`, cloned from `SupplierPricingUploadModal` (:49600). Reuse `parseCSV` (:49614) for CSV. Add XLSX read (app has **no** `XLSX.read` today, only `writeFile`) via the on-demand loader from :32820/:36098, then `XLSX.read(buf,{type:'array'})` + `XLSX.utils.sheet_to_json(ws,{header:1,blankrows:false,defval:''})`. Rewrite `handleFile` (:49632, CSV-only, rejects at :49635) to branch by extension (.csv → readAsText; .xlsx/.xls → readAsArrayBuffer; else error "Please upload a CSV or Excel file"). Normalize both to `{headers:[],rows:[[]]}`: first non-empty row = headers; pad ragged rows; `defval:''` for empty/merged cells. **Multi-sheet:** default first sheet; if >1, show a small sheet-picker (nice-to-have).

## 3. Auto-detect + mapping modal
Mappable ARC BOM targets (from canonical row shapes CPD :36007 / ECO :20012 / companion :13693):

| ARC field | Required | Auto-detect regex (extend :49645–49648) |
|---|---|---|
| `partNumber` | **yes** | `/part\s*#|part.*num|item.*num|catalog|sku|^pn$|^item$|^number$|mfr.*part|mpn/i` |
| `description` | no | `/desc|^name$|nomenclature/i` |
| `qty` | no | `/qty|quantity|^ea$|count/i` |
| `manufacturer` | no | `/mfr|manufacturer|brand|vendor|make/i` |
| `unitPrice` | no | `/unit.*(cost|price)|^cost$|^price$|each|list/i` |
| `notes` | no | `/note|remark|comment/i` |

`colMap` shape → those 6 fields. Modal (clone :49753–49782): one `<select>` of file headers per ARC field, prefilled by auto-detect, with a `— none —` option; required guard on `partNumber` only (disabled button + inline error, mirror :49655/:49777); first-5-rows preview color-coded by mapping. Primary button "Import N rows into BOM →".

## 4. Row construction + merge
Replace `runLookup` (:49654) with a synchronous `buildRows()` — **no BC calls**. Per row: skip if no part#; qty = parsed or default **1**; unitPrice = strip `$ ,` etc then parseFloat (null if NaN). Row shape: `{id:'imp-…', partNumber, description, qty, manufacturer, notes, unitPrice, priceSource, priceDate, imported:true, importedAt}` — **NO bcNo/bcVendorNo/bcPoDate** (unmatched until Refresh).

**priceSource for imported prices — money-path decision (Jon):** recommend a NEW value **`"import"`** (not `"manual"`). `"manual"` is treated as user-confirmed-sticky and is SKIPPED by the pricing refresh (:17642) + reads as user-confirmed; `"import"` keeps unverified file prices from masquerading as confirmed AND leaves them correctable by Refresh. **Cost of `"import"`: 3 downstream touch-ups** (branch on priceSource string): pricing-eligibility filter :17642 (confirm import rows ARE eligible — they will be), source tally :18106 (add an import bucket or it drops from the count), source labels :35439 (add "Imported from file"). Fallback `"manual"` = zero changes but sticky + masquerades.

**Merge — recommend APPEND + duplicate warning (v1).** Append to `panel.bom` (CPD pattern :35426); never auto-replace (destructive on money path). In-file dedup keep-first + warning (mirror `seen` Set :49658). Dedup-vs-existing (normalize via `normPart` :13690): v1 = append-all + a duplicate-count warning; skip/replace options as fast-follow. Write only via `onImportBom`→`onUpdate`+`onSaveImmediate`.

## 5. Post-import
Import writes identity+qty+optional-preliminary-price ONLY. **Do NOT auto-fire BC match/pricing** — remove the pricing modal's BC token/fetch calls (:49657/:49676) from the clone. Imported rows land unmatched (like extraction output); the normal **Refresh (F089)** matches + prices + stamps `priceSource:"bc"` afterward. Optional toast: "N rows imported — run Refresh to match & price against BC."

## 6. Edge cases (all handled)
Empty/header-only → existing "no data" guard (:49639). No part# column → required guard blocks. Blank part# rows skipped. Duplicate part#s (in-file + vs existing) → keep-first/append + warning. Non-numeric qty → default 1. Non-numeric/blank price → null, row imports without price. Excel currency/thousands text → strip+parse. Huge files → **row cap 5,000** (block with message; protects the single-doc panel save). Wrong-surface drop → both dropzones reject cleanly. SheetJS CDN blocked → "Failed to load XLSX library"; CSV still works offline.

**Money-path/retention flags:** (1) imported prices MUST be `priceSource:"import"` (+3 touch-ups) so they never read as confirmed — top correctness item; (2) never auto-replace panel.bom (append only); (3) all writes via `onUpdate`+`onSaveImmediate` (no direct mutation).

## Reuse map
**Copy verbatim** from `SupplierPricingUploadModal` (:49600): modal/overlay styles (:49723–49726), phase machine + state (:49601–49612), `parseCSV` (:49614), upload dropzone JSX (:49737–49751), mapping grid/preview JSX (:49753–49782), disabled-button/inline-error (:49655/:49777). **Change:** `handleFile` (+xlsx branch), `colMap` (6 BOM fields), auto-detect regexes (§3), `runLookup`→`buildRows()` (delete BC token/fetch :49657/49674–49689), phases→single `onImportBom` commit, new props `panel`/`onImportBom`, mount inside PanelCard (drop the standalone mount :55889). **Reuse elsewhere:** SheetJS loader :32820/:36098; `_priceStamp` :2583; `normPart` :13690; CPD funnel :35426.

## Repro / acceptance
1. New "Import BOM from file" control visible in the BOM toolbar (hidden when readOnly). 2. Drop a CSV `Part Number,Description,Qty,Mfr,Unit Price` → mapping auto-fills, preview color-coded, confirm → rows append + auto-save. 3. .xlsx multi-sheet → SheetJS loads on demand, first sheet + picker, same flow. 4. No part# header → button disabled + "Part Number column is required". 5. `$1,234.50`/blank prices → 1234.5 / null; priced rows `priceSource:"import"`, never `"bc"`. 6. Imported rows unmatched until Refresh (F089) → then match/price → `"bc"`. 7. Empty/header-only → "no data found". 8. Duplicates → warning, keep-first/append. 9. Panel-scoped (import into A doesn't touch B).

## DECISIONS for Jon at build-approval
1. **`priceSource:"import"`** (new value + 3 downstream touch-ups) vs `"manual"` (no changes, but sticky + masquerades as confirmed). Recommend **"import"**.
2. **Merge = append + duplicate-count warning** for v1 (skip/replace options as fast-follow). Confirm.
3. **Entry point = dedicated "Import BOM from file" button/modal** (not extend extraction dropzone). Confirm.
4. **Row cap 5,000** + first-sheet-default (multi-sheet picker as nice-to-have). Confirm.

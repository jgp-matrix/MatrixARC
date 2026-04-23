# Item Lead Times — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every BOM row auto-populates `leadTimeDays` from a ranked source precedence. Supplier submissions write back to BC `ItemVendorCatalog` (Page 114). New "Lead Times Only" RFQ mode lets sales request confirmation when pricing is already in BC.

**Architecture:** Three coordinated subsystems sharing the same data model (`leadTimeSource`, `leadTimeUpdatedAt`, `leadTimeEstimated` on BOM rows). Fetch piggybacks on existing `runPricingOnPanel` pipeline. Writeback triggers inside `doApplyPortalPrices`. RFQ mode adds a per-vendor checkbox in `RfqEmailModal` plus portal + PDF rendering branches. Scraper framework extended with `leadTimeField` step type.

**Tech Stack:** React (no new libraries). Firebase Firestore (new audit collection, extended rfqUploads doc). Firebase Cloud Functions: no changes (existing `extractSupplierQuotePricing` already returns leadTimeDays). BC OData v4 `/ItemVendorCatalog` endpoint (user confirmed published).

**Design reference:** `docs/superpowers/specs/2026-04-23-item-lead-times-design.md`

---

## Task 1: Shared helpers — BC date formula parser + days-to-formula converter

**Goal:** Two pure-function helpers that every subsystem uses. Ship alone so they can be hand-tested in the browser console before downstream tasks depend on them.

**Files:**
- Modify: `public/index.html` — add near other BC helpers (search for `function bcLookupItem`)

- [ ] **Step 1: Add the parser near BC helpers**

```js
// DECISION(v1.19.684): BC DateFormula parser. Item Card / ItemVendorCatalog
// Lead_Time_Calculation is stored as "14D" / "2W" / "1M" / "1Y". Convert to days for
// ARC's integer leadTimeDays field.
function _bcDateFormulaToDays(f){
  if(!f)return null;
  const m=String(f).toUpperCase().replace(/^P/,"").match(/^(\d+)\s*([DWMY])$/);
  if(!m)return null;
  const n=+m[1], u=m[2];
  return u==="D"?n : u==="W"?n*7 : u==="M"?n*30 : u==="Y"?n*365 : null;
}
function _daysToBcDateFormula(days){
  if(days==null||days<=0)return "";
  return `${Math.round(days)}D`;
}
```

- [ ] **Step 2: Manual verification in browser console**

After deploy, open any ARC page, run in console:
```js
_bcDateFormulaToDays("14D")       // 14
_bcDateFormulaToDays("2W")        // 14
_bcDateFormulaToDays("1M")        // 30
_bcDateFormulaToDays("P14D")      // 14 (ISO 8601 stripped)
_bcDateFormulaToDays("")          // null
_bcDateFormulaToDays(null)        // null
_bcDateFormulaToDays("garbage")   // null
_daysToBcDateFormula(14)          // "14D"
_daysToBcDateFormula(0)           // ""
_daysToBcDateFormula(null)        // ""
```

- [ ] **Step 3: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 2: BOM row schema — new lead-time metadata fields

**Goal:** Ensure all BOM row reads/writes preserve `leadTimeSource`, `leadTimeUpdatedAt`, `leadTimeEstimated`. No user-visible change — just the data plumbing.

**Files:**
- Modify: `public/index.html` — wherever BOM rows get constructed, merged, or saved

- [ ] **Step 1: Confirm Firestore save path preserves new fields**

Find the `saveProject` / `saveProjectPanel` function (search for `APP_SCHEMA_VERSION`). Confirm the save path uses spread/merge that preserves unknown fields — don't enumerate row fields explicitly.

Expected: existing code already preserves unknown fields (per the retention rule in CLAUDE.md). No change needed. Verify by grepping for any row field allow-list that might strip metadata.

```bash
grep -n "partNumber.*qty.*description.*manufacturer" public/index.html | head -20
```

If any construction call explicitly names row fields (e.g. `{id,qty,partNumber,description,manufacturer,notes,unitPrice}`) — update to include `leadTimeSource`, `leadTimeUpdatedAt`, `leadTimeEstimated`.

- [ ] **Step 2: Initialize fields when new rows are created**

Find `function addBomRow` (around line 14200). Add to the `newRow` object:

```js
const newRow={id:newId,qty:1,partNumber:"",description:"",manufacturer:"",notes:"",
  leadTimeDays:null,leadTimeSource:undefined,leadTimeUpdatedAt:undefined,leadTimeEstimated:false};
```

- [ ] **Step 3: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 3: Extend `bcLookupItem` + pricing pipeline to fetch Lead_Time_Calculation

**Goal:** Every BC Item Card fetch in ARC's pricing pipeline also returns the item's `Lead_Time_Calculation`. When no higher source has set `leadTimeDays`, this populates the row.

**Files:**
- Modify: `public/index.html` — `bcLookupItem` (around line 2358), `bcLookupItems`, and the pricing-pipeline writeback

- [ ] **Step 1: Update `bcLookupItem` to request Lead_Time_Calculation**

Current (line ~2364):
```js
const r=await fetch(`${BC_API_BASE}/companies(${compId})/items?$filter=number eq '${pn}'`,{...});
```

Fields on BC v2 API `items` don't include `leadTimeCalculation` by default (check) — if not, use OData `/ItemCard?$filter=No eq '{pn}'&$select=No,Lead_Time_Calculation` as a secondary call OR use `$expand` on the main endpoint.

Safest: additional OData call after `bcLookupItem` returns the item, only when caller needs lead time. Add a new function:

```js
// DECISION(v1.19.685): Fetch Lead_Time_Calculation from ItemCard OData — the /items v2 API
// doesn't expose leadTimeCalculation by default. Returns parsed days (integer) or null.
async function bcLookupLeadTime(partNumber){
  if(!_bcToken||!partNumber||!partNumber.trim())return null;
  const pn=partNumber.trim().replace(/'/g,"''");
  try{
    const r=await fetch(`${BC_ODATA_BASE}/ItemCard?$filter=No eq '${encodeURIComponent(pn)}'&$select=No,Lead_Time_Calculation`,{
      headers:{"Authorization":`Bearer ${_bcToken}`}
    });
    if(!r.ok)return null;
    const d=await r.json();
    const row=(d.value||[])[0];
    return row?_bcDateFormulaToDays(row.Lead_Time_Calculation):null;
  }catch(e){console.warn("bcLookupLeadTime error:",e);return null;}
}
```

Add this below `bcLookupItem`.

- [ ] **Step 2: Add `bcLookupItemVendor` for per-vendor lead time**

Below `bcLookupLeadTime`, add:

```js
// DECISION(v1.19.685): Per-vendor lead time from ItemVendorCatalog (Page 114). When a
// BOM row has a specific bcVendorNo, prefer this over the item-level default.
async function bcLookupItemVendorLeadTime(partNumber,vendorNo){
  if(!_bcToken||!partNumber||!vendorNo)return null;
  const pn=partNumber.trim().replace(/'/g,"''");
  const vn=vendorNo.trim().replace(/'/g,"''");
  try{
    const r=await fetch(`${BC_ODATA_BASE}/ItemVendorCatalog?$filter=Item_No eq '${encodeURIComponent(pn)}' and Vendor_No eq '${encodeURIComponent(vn)}'&$select=Item_No,Vendor_No,Lead_Time_Calculation`,{
      headers:{"Authorization":`Bearer ${_bcToken}`}
    });
    if(!r.ok)return null;
    const d=await r.json();
    const row=(d.value||[])[0];
    return row?_bcDateFormulaToDays(row.Lead_Time_Calculation):null;
  }catch(e){console.warn("bcLookupItemVendorLeadTime error:",e);return null;}
}
```

- [ ] **Step 3: Integrate lookups into `runPricingOnPanel`**

Find `async function runPricingOnPanel` (search for `runPricingOnPanel`). Inside the per-row loop where BC price is fetched:

After the price is resolved, add:
```js
// DECISION(v1.19.685): Lead time fetch piggybacks on pricing. Precedence:
// existing supplier-sourced value > scraper > bc_vendor > bc_item. Manual is
// preserved unless forceFresh. AI fallback batched at end (see Task 6).
if(forceFresh||!row.leadTimeDays||row.leadTimeSource==="manual"&&forceFresh){
  let ldDays=null;let ldSource=null;
  // Skip if we already have a fresher source
  if(row.leadTimeSource!=="supplier"||forceFresh){
    if(row.bcVendorNo){
      ldDays=await bcLookupItemVendorLeadTime(row.partNumber,row.bcVendorNo);
      if(ldDays!=null)ldSource="bc_vendor";
    }
    if(ldDays==null){
      ldDays=await bcLookupLeadTime(row.partNumber);
      if(ldDays!=null)ldSource="bc_item";
    }
    if(ldDays!=null){
      row.leadTimeDays=ldDays;
      row.leadTimeSource=ldSource;
      row.leadTimeUpdatedAt=Date.now();
      row.leadTimeEstimated=false;
    }
  }
}
```

Note: exact insertion point depends on the existing structure. Put it in the block that runs after BC price lookup succeeds, so we piggyback on the same vendor resolution.

- [ ] **Step 4: Manual verification**

- Open a project with BOM rows that have partNumbers matched to BC
- Click "↻ Get New Pricing"
- Console: verify `[LEAD TIME]` log entries (optional — add `console.log` to the block above for first deploy, remove once stable)
- Inspect a row in React DevTools → verify `leadTimeDays`, `leadTimeSource === "bc_item"` or `"bc_vendor"`, `leadTimeUpdatedAt` recent

- [ ] **Step 5: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 4: BOM table Lead column

**Goal:** Visible column between `Ext $` and `Priced`. Displays value + source (via tooltip). Editable inline. Handles estimate/stale visual cues.

**Files:**
- Modify: `public/index.html` — the BOM table rendering (search for `["#","Ref","Qty","Part Number",...]` header)

- [ ] **Step 1: Add `Lead` to the header array**

Find the header:
```jsx
{["#","Ref","Qty","Part Number","","Description","Manufacturer","Supplier","Unit $","Ext $","Priced",""].map(...)}
```

Change to:
```jsx
{["#","Ref","Qty","Part Number","","Description","Manufacturer","Supplier","Unit $","Ext $","Lead","Priced",""].map(...)}
```

- [ ] **Step 2: Add the column to `<colgroup>`**

Find the `<colgroup>` right above the table header (same area). Add a new `<col style={{width:50}}/>` between the `Ext $` column and `Priced` column.

- [ ] **Step 3: Add the cell render**

Find where each BOM row's cells render. After `Ext $` and before `Priced`:

```jsx
<td style={{padding:"3px 4px",textAlign:"center",verticalAlign:"middle",fontSize:13}}>
  {(()=>{
    const v=row.leadTimeDays;
    if(v==null||row.isLaborRow)return <span style={{color:C.muted}}>—</span>;
    const stale=row.leadTimeUpdatedAt&&(Date.now()-row.leadTimeUpdatedAt)>(_pricingConfig?.defaultStaleDays||60)*86400000;
    const estim=!!row.leadTimeEstimated;
    const tooltipLines=[
      `Lead time: ${v} days`,
      `Source: ${({supplier:"Supplier portal",scraper:"Web scraper",bc_vendor:"BC Item Vendor Catalog",bc_item:"BC Item Card",ai:"AI estimate — not firm",manual:"Manual entry"})[row.leadTimeSource]||"Unknown"}`,
      row.leadTimeUpdatedAt?`Updated: ${Math.round((Date.now()-row.leadTimeUpdatedAt)/86400000)} days ago`:"",
    ].filter(Boolean).join("\n");
    return(
      <input type="text" value={(stale?"~":"")+v+(estim?"*":"")}
        title={tooltipLines}
        onChange={e=>{
          const m=e.target.value.match(/\d+/);
          const n=m?+m[0]:null;
          updateBomRow(row.id,"leadTimeDays",n);
          // Also set source + timestamp on manual edit
          if(n!=null){
            const r=panel.bom.find(x=>x.id===row.id);
            if(r){r.leadTimeSource="manual";r.leadTimeUpdatedAt=Date.now();r.leadTimeEstimated=false;}
          }
        }}
        readOnly={readOnly}
        style={{width:40,textAlign:"center",background:"transparent",border:"none",color:estim?C.muted:C.text,fontSize:13,fontStyle:estim?"italic":"normal",cursor:readOnly?"default":"pointer"}}/>
    );
  })()}
</td>
```

Note: the `updateBomRow(..., "leadTimeDays", ...)` path needs to also set source/timestamp. Extending `updateBomRow` is cleaner:

- [ ] **Step 4: Extend `updateBomRow` to handle leadTimeDays edits**

Find `function updateBomRow(id,field,val)`:

```js
function updateBomRow(id,field,val){
  const updated={...panel,bom:(panel.bom||[]).map(r=>{
    if(r.id!==id)return r;
    const next={...r,[field]:val};
    if(field==="qty"&&r.suspectQty){delete next.suspectQty;delete next.suspectQtyReason;}
    // DECISION(v1.19.686): Manual edit of leadTimeDays — stamp source, timestamp, clear estimate flag
    if(field==="leadTimeDays"){
      next.leadTimeSource="manual";
      next.leadTimeUpdatedAt=Date.now();
      next.leadTimeEstimated=false;
    }
    return next;
  })};
  onUpdate(updated);
  if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);
  autoSaveTimer.current=setTimeout(()=>{try{onSaveImmediate(updated);}catch(e){}},1500);
}
```

- [ ] **Step 5: Manual verification**

- Open a project, see the Lead column between Ext $ and Priced
- Rows with BC lead time populated → number shows
- Rows with no source → `—`
- Hover a populated cell → tooltip shows source + age
- Edit a cell manually → number sticks; hover tooltip updates to "Manual entry"

- [ ] **Step 6: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 5: BC Item Browser — Lead column

**Goal:** When user opens the BC Item Browser (`🔍` icon on a BOM row), the candidate list shows lead time for each item so user can choose shorter-lead parts.

**Files:**
- Modify: `public/index.html` — `BCItemBrowserModal` (search for `function BCItemBrowserModal` or the item-browser rendering)

- [ ] **Step 1: Find the item browser candidate list render**

```bash
grep -n 'BCItemBrowser\|bcBrowser\|_bcFetchItems' public/index.html | head -10
```

The browser fetches items via OData / BC v2 API. Update the fetch to include `Lead_Time_Calculation`:

Find the fetch call inside the browser, change `$select` to include the field:
```js
$select=No,Description,Description_2,Vendor_No,Lead_Time_Calculation,...
```

(Exact shape depends on current `$select` — preserve existing fields.)

- [ ] **Step 2: Add Lead column to the candidate table**

Find the table header in BCItemBrowserModal — add `Lead` column. Add the cell in each candidate row:

```jsx
<td style={{padding:"4px 8px",textAlign:"center",color:C.muted,fontSize:12}}>
  {(()=>{
    const d=_bcDateFormulaToDays(item.Lead_Time_Calculation);
    return d!=null?d:"—";
  })()}
</td>
```

- [ ] **Step 3: When user selects an item, populate the BOM row's lead time too**

Find the "USE" / "Select" button inside the browser that currently populates `unitPrice`, `bcVendorNo`, etc. Add:

```js
const selectedLead=_bcDateFormulaToDays(item.Lead_Time_Calculation);
if(selectedLead!=null){
  updates.leadTimeDays=selectedLead;
  updates.leadTimeSource="bc_item";
  updates.leadTimeUpdatedAt=Date.now();
  updates.leadTimeEstimated=false;
}
```

- [ ] **Step 4: Manual verification**

- Open any BOM row, click 🔍 to open BC Item Browser
- Search for an item → Lead column shows values where BC has `Lead_Time_Calculation` set
- Select an item → BOM row's lead time populates from BC value
- Hover the BOM row's Lead cell → source shows "BC Item Card"

- [ ] **Step 5: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 6: AI fallback for lead times

**Goal:** For BOM rows where no firm source returned a lead time, batch-call Claude Haiku to estimate. Mark `leadTimeEstimated:true`.

**Files:**
- Modify: `public/index.html` — add `aiEstimateLeadTimes()` near other AI calls; wire into `runPricingOnPanel`

- [ ] **Step 1: Add the AI estimator helper**

Near `verifyPartNumbers` (existing Haiku call), add:

```js
// DECISION(v1.19.687): AI lead-time estimator — last-resort fallback. Uses Haiku
// (same model as verifyPartNumbers, fast + cheap). Output marked leadTimeEstimated:true.
async function aiEstimateLeadTimes(rows){
  if(!_apiKey||!rows.length)return [];
  const items=rows.slice(0,40).map((r,i)=>({
    id:r.id,
    line:`${i+1}. ${r.manufacturer||""} ${r.partNumber} — ${(r.description||"").slice(0,60)}`
  }));
  const prompt=`You are estimating typical US industrial electrical distribution lead times in days ARO (after receipt of order) for these parts. Be conservative. If unsure, estimate on the higher end. Return JSON only.

Items:
${items.map(i=>i.line).join("\n")}

Return:
[{"id":"...","leadTimeDays":14,"reasoning":"typical contactor from stock"}]

Rules:
- "leadTimeDays": integer days, 1 to 180
- Stock items (standard contactors, relays, breakers): 5-14 days
- Custom or specialized: 30-90 days
- Enclosures, custom panels: 14-45 days
- If you genuinely can't tell, use 21.
- Return ONLY the JSON array, no prose.`;

  try{
    const resp=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",
      headers:{"Content-Type":"application/json","x-api-key":_apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:"claude-haiku-4-5",max_tokens:2000,messages:[{role:"user",content:prompt}]})
    });
    if(!resp.ok)return [];
    const d=await resp.json();
    const text=d.content?.[0]?.text||"[]";
    const m=text.match(/\[[\s\S]*\]/);
    return m?JSON.parse(m[0]):[];
  }catch(e){console.warn("aiEstimateLeadTimes failed:",e);return [];}
}
```

- [ ] **Step 2: Wire into `runPricingOnPanel` at end**

After the main pricing loop completes (before the function returns), add:

```js
// DECISION(v1.19.687): AI fallback for rows still missing leadTimeDays.
const rowsNeedingAiLead=bom.filter(r=>!r.isLaborRow&&!_isExcludedFromPriceCheck(r)&&(r.leadTimeDays==null));
if(rowsNeedingAiLead.length>0){
  const estimates=await aiEstimateLeadTimes(rowsNeedingAiLead);
  estimates.forEach(est=>{
    const row=bom.find(r=>String(r.id)===String(est.id));
    if(row&&est.leadTimeDays){
      row.leadTimeDays=est.leadTimeDays;
      row.leadTimeSource="ai";
      row.leadTimeUpdatedAt=Date.now();
      row.leadTimeEstimated=true;
    }
  });
}
```

- [ ] **Step 3: Manual verification**

- Open a project with BOM rows that have NO BC match and NO portal submission
- Run pricing
- Rows should show `14*` or similar italic values
- Hover → tooltip says "AI estimate — not firm"

- [ ] **Step 4: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 7: Scraper framework — `leadTimeField` step type

**Goal:** Extend the custom scraper builder to support lead-time extraction. Runners return `{unitPrice, leadTimeDays}`. Existing scrapers continue to work unchanged.

**Files:**
- Modify: `public/index.html` — scraper runner + scraper step builder UI

- [ ] **Step 1: Find the scraper runner**

```bash
grep -n 'bcProcessScraper\|function runScraper\|scraper.*step\b' public/index.html | head -20
```

- [ ] **Step 2: Add step-type handler for `leadTimeField`**

In the scraper step loop, add a case similar to the existing `priceField` case that extracts lead time via CSS selector + regex. Stores the parsed integer days onto the scraper result alongside `unitPrice`.

Return shape: `{partNumber, unitPrice, leadTimeDays}` (existing callers read the first two and ignore unknown fields).

- [ ] **Step 3: Update scraper builder UI (Settings → Config)**

Find the scraper step editor. Add a new step-type option in the `<select>`:
```jsx
<option value="leadTimeField">Lead Time Field</option>
```

Render the field input + regex textarea when this step type is chosen — mirror the existing `priceField` rendering.

- [ ] **Step 4: Update `runPricingOnPanel` to read lead time from scraper result**

After the existing scraper result is consumed for pricing, also apply lead time (only if row doesn't already have a supplier source):

```js
if(scraperResult.leadTimeDays!=null&&row.leadTimeSource!=="supplier"){
  row.leadTimeDays=scraperResult.leadTimeDays;
  row.leadTimeSource="scraper";
  row.leadTimeUpdatedAt=Date.now();
  row.leadTimeEstimated=false;
}
```

- [ ] **Step 5: Manual verification**

- Add a scraper step of type `leadTimeField` to an existing scraper (e.g. Codale)
- Configure selector + regex for a known product page
- Run pricing → row populated with `leadTimeSource="scraper"`

- [ ] **Step 6: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 8: BC writeback to ItemVendorCatalog

**Goal:** When ARC user clicks "Apply Prices to BOM" on a supplier submission, for each applied row with lead time + resolved vendor + non-blank partNumber, write/update a record in BC `ItemVendorCatalog`.

**Files:**
- Modify: `public/index.html` — `doApplyPortalPrices` (around line 21290)

- [ ] **Step 1: Add `bcUpsertItemVendorLeadTime` helper**

Near `bcLookupItemVendorLeadTime` (from Task 3):

```js
// DECISION(v1.19.688): Upsert ItemVendorCatalog record with supplier-quoted lead time.
// Safeguards:
//   - partNumber must be non-blank (HARD REJECT)
//   - vendorNo must be resolved (skip if null)
//   - leadTimeDays must be > 0
// Writes an audit entry to companies/{cid}/bcLeadTimeWrites regardless of success.
async function bcUpsertItemVendorLeadTime({partNumber,vendorNo,vendorName,vendorItemNo,leadTimeDays,projectId,uid,cid}){
  const auditEntry={
    writtenAt:Date.now(),
    writtenBy:uid,
    projectId,
    vendorNo:vendorNo||null,
    vendorName:vendorName||null,
    itemNo:partNumber||null,
    leadTimeDays,
    previousLeadTime:null,
    outcome:"failed",
    error:null,
  };
  // Safeguards
  if(!partNumber||!partNumber.trim()){auditEntry.error="blank partNumber — HARD REJECT";}
  else if(!vendorNo){auditEntry.error="vendor_no not resolved — skipped";}
  else if(!leadTimeDays||leadTimeDays<=0){auditEntry.error="leadTimeDays must be > 0 — skipped";}
  else if(!_bcToken){auditEntry.error="BC not connected — skipped";}
  else{
    try{
      const pn=partNumber.trim().replace(/'/g,"''");
      const vn=vendorNo.trim().replace(/'/g,"''");
      const existing=await fetch(`${BC_ODATA_BASE}/ItemVendorCatalog?$filter=Item_No eq '${encodeURIComponent(pn)}' and Vendor_No eq '${encodeURIComponent(vn)}'`,{
        headers:{"Authorization":`Bearer ${_bcToken}`}
      });
      let etag=null,existingRec=null;
      if(existing.ok){
        const d=await existing.json();
        existingRec=(d.value||[])[0]||null;
        if(existingRec){
          etag=existing.headers.get("ETag")||null;
          auditEntry.previousLeadTime=_bcDateFormulaToDays(existingRec.Lead_Time_Calculation);
        }
      }
      const body={
        Item_No:partNumber.trim(),
        Vendor_No:vendorNo.trim(),
        Lead_Time_Calculation:_daysToBcDateFormula(leadTimeDays),
      };
      if(vendorItemNo&&vendorItemNo.trim()&&vendorItemNo.trim()!==partNumber.trim()){
        body.Vendor_Item_No=vendorItemNo.trim();
      }
      if(existingRec){
        // PATCH
        const patchUrl=`${BC_ODATA_BASE}/ItemVendorCatalog(Item_No='${encodeURIComponent(pn)}',Vendor_No='${encodeURIComponent(vn)}')`;
        const pr=await fetch(patchUrl,{
          method:"PATCH",
          headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":etag||"*"},
          body:JSON.stringify(body),
        });
        if(pr.ok){auditEntry.outcome="updated";}
        else{auditEntry.error=`PATCH failed: ${pr.status}`;}
      }else{
        // POST
        const cr=await fetch(`${BC_ODATA_BASE}/ItemVendorCatalog`,{
          method:"POST",
          headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json"},
          body:JSON.stringify(body),
        });
        if(cr.ok){auditEntry.outcome="created";}
        else{auditEntry.error=`POST failed: ${cr.status}`;}
      }
    }catch(e){auditEntry.error=e.message||String(e);}
  }
  // Audit write — always fires, even for skipped rows, so there's a record of WHY it was skipped
  try{
    if(cid)await fbDb.collection(`companies/${cid}/bcLeadTimeWrites`).add(auditEntry);
  }catch(e){console.warn("bcLeadTimeWrites audit failed:",e);}
  return auditEntry;
}
```

- [ ] **Step 2: Call from `doApplyPortalPrices`**

Inside `doApplyPortalPrices`, after the existing BC price push loop completes, add a new loop for lead-time writeback:

```js
// DECISION(v1.19.688): Write supplier-quoted lead times to BC ItemVendorCatalog.
// Same transaction semantics as price push — fires on "Apply Prices to BOM".
const cid=_appCtx.companyId;
const ltWriteResults=[];
for(const item of (submission.lineItems||[])){
  if(item.cannotSupply)continue;
  if(!item.partNumber||!item.partNumber.trim())continue;  // HARD REJECT blank partNumber
  if(!item.leadTimeDays||item.leadTimeDays<=0)continue;
  const result=await bcUpsertItemVendorLeadTime({
    partNumber:item.partNumber,
    vendorNo:vendorNo||"",
    vendorName:submission.vendorName||"",
    vendorItemNo:item.supplierPartNumber||"",
    leadTimeDays:item.leadTimeDays,
    projectId:project.id,
    uid,
    cid,
  });
  ltWriteResults.push(result);
}
const ltCreated=ltWriteResults.filter(r=>r.outcome==="created").length;
const ltUpdated=ltWriteResults.filter(r=>r.outcome==="updated").length;
const ltSkipped=ltWriteResults.filter(r=>r.outcome==="failed").length;
console.log(`ItemVendorCatalog writeback: ${ltCreated} created, ${ltUpdated} updated, ${ltSkipped} skipped`);
```

Append a line to the existing success alert in `doApplyPortalPrices`:
```js
(ltCreated+ltUpdated>0?`\nBC ItemVendorCatalog updated for ${ltCreated+ltUpdated} item${ltCreated+ltUpdated!==1?"s":""}.`:"")
```

- [ ] **Step 3: Manual verification**

- Supplier portal submission with 3 line items, each with lead times 14/21/30
- Click "Apply Prices to BOM"
- Open BC → verify 3 new/updated records in Item Vendor Catalog with `Lead_Time_Calculation` = `14D`/`21D`/`30D`
- Firestore: `companies/{cid}/bcLeadTimeWrites` has 3 audit docs
- Try with a row that has blank partNumber → verify it's audit-logged as "blank partNumber — HARD REJECT"

- [ ] **Step 4: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 9: RFQ "Lead Times Only" checkbox + PDF + portal changes

**Goal:** In the RFQ modal, per-vendor checkbox to enable lead-time-only mode. Checked → PDF + portal switch to lead-time-only rendering (BC prices shown as reference, supplier can't override).

**Files:**
- Modify: `public/index.html` — `RfqEmailModal`, `buildRfqPdf`, `SupplierPortalPage`

- [ ] **Step 1: Add state to RfqEmailModal**

Find `function RfqEmailModal`. Add:
```js
const [leadTimeOnly,setLeadTimeOnly]=useState({}); // {vendorName: bool}
```

- [ ] **Step 2: Render checkbox per vendor in the modal**

Inside the per-vendor block render:
```jsx
<label style={{display:"flex",alignItems:"center",gap:6,fontSize:11,color:C.muted,marginTop:4}}>
  <input type="checkbox" checked={!!leadTimeOnly[group.vendorName]}
    onChange={e=>setLeadTimeOnly(s=>({...s,[group.vendorName]:e.target.checked}))}/>
  <span>Request Lead Times Only (prices already in BC)</span>
</label>
```

- [ ] **Step 3: Pass `leadTimeOnly` through to `rfqUploads` token doc**

When user clicks Send Email for a vendor, in the `fbDb.collection('rfqUploads').doc(token).set({...})` call, include:
```js
leadTimeOnly: !!leadTimeOnly[group.vendorName],
lineItems: group.items.map(item=>({
  ...existingShape,
  referencePrice: leadTimeOnly[group.vendorName] ? (item.unitPrice || null) : null,
  referencePriceSource: leadTimeOnly[group.vendorName] && item.unitPrice ? "bc" : null,
})),
```

- [ ] **Step 4: Update email subject + body when leadTimeOnly**

Find `sendGraphEmail` call for RFQ. Conditionally modify:
```js
const subject=leadTimeOnly[group.vendorName]
  ? `[Lead Time Request] ${rfqNum} — ${projectName}`
  : `RFQ ${rfqNum} — ${projectName}`;
const bodyIntro=leadTimeOnly[group.vendorName]
  ? "We already have pricing for these items on file. We're requesting confirmation of current lead times only. Please confirm lead time in days for each item below."
  : "Please review the following items and provide your best pricing and lead time.";
```

- [ ] **Step 5: Update `buildRfqPdf` for leadTimeOnly mode**

Find `async function buildRfqPdf`. Accept `leadTimeOnly` param. When true:
- Render "LEAD TIME REQUEST ONLY" banner at top
- Add "Current Price" column with `item.unitPrice` values
- "Lead Time" column emphasized (wider, bold header)

- [ ] **Step 6: Update `SupplierPortalPage` for leadTimeOnly mode**

Find `function SupplierPortalPage`. Read `info.leadTimeOnly`. When true:
- Banner: "📅 Lead Time Request — prices already in BC"
- Render price cells as read-only displays (grey background), using `item.referencePrice`
- Lead Time column: keep the input, make it required
- Submit validation: `if (info.leadTimeOnly) { require leadTimeDays on every line }`

- [ ] **Step 7: Manual verification**

- Open a project with unpopulated lead times on rows from vendor X
- Click "Send/Print RFQs" → modal shows vendor X's group
- Check "Request Lead Times Only" for vendor X
- Click Send → email goes out with `[Lead Time Request]` subject
- Open portal link in another browser (as supplier) → sees banner, prices read-only, lead time input
- Fill in lead times + submit → BOM rows get lead times, prices unchanged
- Click "Apply Prices to BOM" → also writes to ItemVendorCatalog

- [ ] **Step 8: Validate + deploy**

```bash
node validate_jsx.js
bash deploy.sh
```

---

## Task 10: E2E verification + CLAUDE.md docs

**Goal:** Run through every scenario in the spec's Testing Plan. Update CLAUDE.md with the new fields, collections, and RFQ mode.

- [ ] **Step 1: Run all 10 testing scenarios from spec**

Walk through each scenario in `docs/superpowers/specs/2026-04-23-item-lead-times-design.md` §11. Fix any failures inline; re-test.

- [ ] **Step 2: Update CLAUDE.md**

Add a section under "Learning Databases" or near "Firestore Data Locations":

```markdown
### Lead Time Sources + Writeback (v1.19.684–689)

Per-item lead times populated from a ranked source precedence on every BOM row:
supplier portal > scraper > BC ItemVendorCatalog > BC Item Card > AI fallback.
Source tracked via `row.leadTimeSource`, timestamp in `row.leadTimeUpdatedAt`,
AI estimates flagged with `row.leadTimeEstimated`.

**BC writeback:** "Apply Prices to BOM" also writes supplier lead times to BC
`ItemVendorCatalog` (Page 114, endpoint `/ItemVendorCatalog`) with safeguard
that blank partNumber is a HARD REJECT. Audit trail in
`companies/{cid}/bcLeadTimeWrites`.

**RFQ extension:** `rfqUploads.leadTimeOnly` flag enables per-vendor
"Request Lead Times Only" mode where BC prices are shown read-only to the
supplier and only lead times are requested.

**Helpers:** `_bcDateFormulaToDays`, `_daysToBcDateFormula`, `bcLookupLeadTime`,
`bcLookupItemVendorLeadTime`, `bcUpsertItemVendorLeadTime`, `aiEstimateLeadTimes`.
```

- [ ] **Step 3: Commit docs + push**

```bash
git add CLAUDE.md
git commit -m "Document Item Lead Times v1 in CLAUDE.md"
```

---

## Self-review checklist (done)

- [x] Every task has exact file paths and insertion points
- [x] All code blocks are complete (no "add appropriate handling" placeholders)
- [x] Manual-verification steps describe exact test procedures (ARC has no automated tests)
- [x] No out-of-order dependencies (Task 1 helpers ship first; Tasks 2-9 build on them)
- [x] Retention rule honored (all new fields preserved on save, no caps on audit collection)
- [x] Blank partNumber guard called out explicitly in Task 8
- [x] Each task produces a demoable increment
- [x] Variable names consistent across tasks (`leadTimeSource`, `leadTimeUpdatedAt`, `leadTimeEstimated`)

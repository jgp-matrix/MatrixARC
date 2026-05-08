# Control Panel Lead Time — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute a defensible Control Panel ship date from `longestItemLeadDays + laborDays + productionDays`. Surface it live in Quote Summary. Auto-populate a "Lead drivers" note in the quote with any BOM item above the BOM average. Refactor the BC lead-time writeback from per-row 2s debounce into a 30-second batched queue.

**Architecture:** A single pure function `computeControlPanelLeadTime(panel, project)` does the math; a `useMemo` in the panel view wires it live. The QUOTE SUMMARY row gets a compact chip per panel with the lead days + tooltip. A new popover owns override/revert. Driver note is appended/refreshed in `project.quote.notes` at compute time. A new module-level queue (`_leadTimeBcQueue`) centralizes all cell-level BC writes behind a 30s flush; the existing per-row 2s debounce is deleted.

**Tech Stack:** React (no new libraries). Firebase Firestore (extends panel + quote docs additively). No Cloud Functions changes. No BC API changes.

**Design reference:** `docs/superpowers/specs/2026-04-24-control-panel-lead-time-design.md`

**Resolved open questions (from spec):**
1. Per-panel primary, project rollup = max of panel ship dates. ✅
2. All labor categories included (computeLaborEstimate sums everything). ✅
3. Driver note goes in `project.quote.notes` (the printed Notes field). ✅
4. Override UX: inline popover attached to the chip. ✅
5. Multi-panel driver rollup: combine panels' drivers, then apply above-average filter to the combined list. ✅

---

## Task 1: Pure compute function + data model

**Goal:** Ship the math as a pure function that can be tested standalone in the browser console. No UI yet.

**Files:**
- Modify: `public/index.html` — add near `computeLaborEstimate` (~line 916)

- [ ] **Step 1: Define the helpers**

```js
// DECISION(v1.19.70X): Control Panel Lead Time compute. Pure function — takes panel
// + project, returns { shipDate, leadDays, breakdown, drivers, largestContributor }.
// All three durations sum sequentially (material arrives → labor builds → production
// finishes) to give the soonest possible ship date.
const _ONE_DAY_MS=24*60*60*1000;
function _startOfDay(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime();}
function _isoDate(ts){const d=new Date(ts);return d.toISOString().slice(0,10);}

function computeControlPanelLeadTime(panel,project){
  const today=_startOfDay(Date.now());
  const bom=(panel.bom||[]).filter(r=>!r.isLaborRow&&!_isExcludedFromPriceCheck(r)&&(+r.leadTimeDays||0)>0);
  const longestItemDays=bom.reduce((m,r)=>Math.max(m,+r.leadTimeDays||0),0);
  const lab=computeLaborEstimate(panel);
  const laborConfigRaw=project?.laborConfig||{};
  const dailyCrewHours=+laborConfigRaw.dailyCrewHours||8;
  const laborDays=Math.ceil((lab.totalHours||0)/dailyCrewHours);
  const productionDays=Math.max(0,Math.min(365,+panel.productionDays||0));
  const totalDays=longestItemDays+laborDays+productionDays;
  const shipDate=today+totalDays*_ONE_DAY_MS;

  // Largest contributor
  let largestContributor="material",largest=longestItemDays;
  if(laborDays>largest){largestContributor="labor";largest=laborDays;}
  if(productionDays>largest){largestContributor="production";largest=productionDays;}

  // Drivers = items above BOM average (of priced items only)
  const ldValues=bom.map(r=>+r.leadTimeDays||0).filter(n=>n>0);
  const avg=ldValues.length?ldValues.reduce((s,n)=>s+n,0)/ldValues.length:0;
  const tooSmallForDrivers=ldValues.length<3;
  const drivers=tooSmallForDrivers?[]:[...bom]
    .filter(r=>(+r.leadTimeDays||0)>avg)
    .sort((a,b)=>(+b.leadTimeDays||0)-(+a.leadTimeDays||0))
    .map(r=>({partNumber:r.partNumber||"",description:r.description||"",leadTimeDays:+r.leadTimeDays,source:r.leadTimeSource||"unknown"}));

  return{shipDate:_isoDate(shipDate),leadDays:totalDays,longestItemDays,laborDays,productionDays,averageItemLeadDays:Math.round(avg*10)/10,drivers,largestContributor,hasAiLeads:bom.some(r=>r.leadTimeSource==="ai"),noDataWarning:longestItemDays===0};
}
```

- [ ] **Step 2: Expose to console for testing**

Add near the function: `if(typeof window!=="undefined")window.computeControlPanelLeadTime=computeControlPanelLeadTime;`

- [ ] **Step 3: Validate + deploy + test in console**

```bash
node validate_jsx.js && bash deploy.sh
```

After deploy, open a real project, run in console:
```js
const p=_appCtx._debug?.project||await (await fbDb.collection(_appCtx.projectsPath).doc(YOUR_PROJECT_ID).get()).data();
const panel=p.panels[0];
computeControlPanelLeadTime(panel,p)
// Should return a sensible object with shipDate, leadDays, drivers[], etc.
```

Verify math against manual calculation. Expected: longestItemDays + laborDays + productionDays === leadDays.

---

## Task 2: Production Days input field

**Goal:** New number input on the panel detail form (quote form + panel card) next to Requested Ship Date.

**Files:**
- Modify: `public/index.html` — panel form section (search for `draftShipDate` state → ~line 13089) and quote form (~line 10684)

- [ ] **Step 1: Add state + persist handler in the panel form**

Near the existing `draftShipDate` state:
```js
const [draftProductionDays,setDraftProductionDays]=useState(panel.productionDays??"");
```

In the save handler (where `requestedShipDate:draftShipDate` is set):
```js
productionDays:draftProductionDays===""?null:Math.max(0,Math.min(365,+draftProductionDays||0)),
```

- [ ] **Step 2: Render input next to Req. Ship Date**

Match the existing date input's styling. Add tooltip: `"Days production needs AFTER panel assembly (testing, QA, shipping prep). Enter what production tells you."`

```jsx
<label style={{fontSize:11,color:C.muted,fontWeight:600}}>Production Days</label>
<input type="number" min="0" max="365" step="1" value={draftProductionDays}
  onChange={e=>setDraftProductionDays(e.target.value)}
  placeholder="e.g. 7"
  title="Days production needs AFTER panel assembly (testing, QA, shipping prep). Enter what production tells you."
  style={{...inputStyle,width:80}}/>
```

- [ ] **Step 3: Also expose on the quote form**

Find the quote field list (`["Req. Ship Date", q.requestedShipDate...]` — ~line 10684) and add:
```js
["Prod Days", q.productionDays??"", v=>setQ({productionDays:v===""?null:Math.max(0,Math.min(365,+v||0))}), "0-365"],
```

- [ ] **Step 4: Validate + deploy**

```bash
node validate_jsx.js && bash deploy.sh
```

Verify: open a project → edit a panel → type `7` in the new field → save → reload → value persists as `7`. Type `1000` → clamps to `365`.

---

## Task 3: Quote Summary chip + tooltip

**Goal:** Compact `56d` chip in each Quote Summary panel row, to the LEFT of the status pill, with a full-breakdown tooltip.

**Files:**
- Modify: `public/index.html` — Quote Summary panel row rendering (~line 20690)

- [ ] **Step 1: Wrap the compute in useMemo per panel**

Inside the `.map((p,pi)=>{...})` block for each panel row, add near the other per-panel calculations (after `ple`, `pmat`, `pgt` etc):
```js
const cplt=React.useMemo(()=>computeControlPanelLeadTime(p,project),[
  p.bom,p.laborData,p.validation?.wireCount,p.pricing?.laborHoursOverride,p.productionDays,p.controlPanelShipDateOverride,p.controlPanelShipDate,project.laborConfig?.dailyCrewHours
]);
```

Note: `React.useMemo` inside `.map()` is OK here because the map produces a fixed list of keyed elements per render — memo keys are stable as long as panel order doesn't churn. If lint complains, extract into a small `<PanelSummaryRow/>` component.

- [ ] **Step 2: Render the chip to the left of the status pill**

In the existing row JSX, insert between the panel name and the status-pill `(()=>{const openEqs...})()`:

```jsx
{(()=>{
  const effectiveDays=p.controlPanelShipDateOverride?Math.ceil((new Date(p.controlPanelShipDate).getTime()-_startOfDay(Date.now()))/_ONE_DAY_MS):cplt.leadDays;
  const effectiveShipDate=p.controlPanelShipDateOverride?p.controlPanelShipDate:cplt.shipDate;
  const overrideGap=p.controlPanelShipDateOverride?effectiveDays-cplt.leadDays:0;
  const color=p.controlPanelShipDateOverride&&overrideGap>14?"#ef4444":
              cplt.hasAiLeads?"#fcd34d":
              cplt.longestItemDays===0&&cplt.productionDays===0?"#64748b":
              "#22d3ee";
  const bg=p.controlPanelShipDateOverride&&overrideGap>14?"#2a0a0a":
           cplt.hasAiLeads?"#3a2800":
           cplt.longestItemDays===0&&cplt.productionDays===0?"#1a1a2e":
           "#08253a";
  const tip=`Ship date: ${effectiveShipDate} · ${cplt.longestItemDays}d material + ${cplt.laborDays}d labor + ${cplt.productionDays}d production · largest: ${cplt.largestContributor}${cplt.hasAiLeads?" · includes AI estimates":""}${p.controlPanelShipDateOverride?` · OVERRIDDEN (computed: ${cplt.leadDays}d)`:""}`;
  return <button onClick={e=>{e.stopPropagation();setShipDatePopoverFor(p.id);}}
    title={tip}
    style={{background:bg,border:`1px solid ${color}44`,borderRadius:10,color,padding:"2px 8px",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,fontVariantNumeric:"tabular-nums"}}>
    {effectiveDays}d
  </button>;
})()}
```

- [ ] **Step 3: Add `shipDatePopoverFor` state at the component level**

Near other UI state:
```js
const [shipDatePopoverFor,setShipDatePopoverFor]=useState(null);
```

- [ ] **Step 4: Validate + deploy**

```bash
node validate_jsx.js && bash deploy.sh
```

Verify:
- Open a project with lead-time data → chip shows e.g. `56d` with correct cyan color
- Hover → tooltip shows breakdown
- Edit a lead time in BOM → chip updates within 500ms
- Add an AI estimate → chip flips to amber
- Zero-out all lead times + productionDays → chip flips to muted grey

---

## Task 4: Override popover

**Goal:** Click the chip → small inline popover with breakdown + override input + revert-to-computed link.

**Files:**
- Modify: `public/index.html` — render near existing modals

- [ ] **Step 1: Build the popover component inline**

Near where other floating UI renders, add a conditional:

```jsx
{shipDatePopoverFor&&(()=>{
  const p=(project.panels||[]).find(x=>x.id===shipDatePopoverFor);
  if(!p)return null;
  const cplt=computeControlPanelLeadTime(p,project);
  const [draftDate,setDraftDate]=/*lift to component state: overrideDraft*/[overrideDraft||cplt.shipDate,setOverrideDraft];
  return(
    <div onClick={e=>e.stopPropagation()}
      style={{position:"absolute",background:"#0d0d1a",border:`1px solid ${C.accent}`,borderRadius:10,padding:"14px 18px",zIndex:100,minWidth:280,boxShadow:"0 4px 20px rgba(0,0,0,0.6)",right:20,bottom:80}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6}}>📦 Control Panel Ship Date</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:10}}>{p.controlPanelShipDateOverride?p.controlPanelShipDate:cplt.shipDate} · {p.controlPanelShipDateOverride?Math.ceil((new Date(p.controlPanelShipDate)-_startOfDay(Date.now()))/_ONE_DAY_MS):cplt.leadDays} calendar days</div>
      <div style={{fontSize:11,color:C.sub,lineHeight:1.6,marginBottom:10}}>
        <div>{cplt.longestItemDays}d material{cplt.drivers.length?` (longest: ${cplt.drivers[0].partNumber} — ${cplt.drivers[0].leadTimeDays}d)`:""}</div>
        <div>{cplt.laborDays}d labor ({Math.round((computeLaborEstimate(p).totalHours||0))} hrs ÷ {project.laborConfig?.dailyCrewHours||8} hrs/day)</div>
        <div>{cplt.productionDays}d production</div>
      </div>
      {p.controlPanelShipDateOverride&&<div style={{fontSize:11,color:"#f59e0b",marginBottom:8}}>Overridden — computed value was {cplt.shipDate} ({cplt.leadDays}d)</div>}
      <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:8}}>
        <input type="date" value={draftDate} onChange={e=>setOverrideDraft(e.target.value)}
          style={{background:"#0a0a18",border:`1px solid ${C.border}`,borderRadius:4,color:C.text,fontSize:12,padding:"4px 8px",flex:1}}/>
        <button onClick={()=>{saveSelectedPanel({controlPanelShipDate:draftDate,controlPanelShipDateOverride:true});setShipDatePopoverFor(null);}}
          style={{background:"#1e1b4b",border:`1px solid ${C.accent}`,color:C.accent,padding:"4px 10px",borderRadius:4,fontSize:11,fontWeight:700,cursor:"pointer"}}>Override</button>
      </div>
      {p.controlPanelShipDateOverride&&<button onClick={()=>{saveSelectedPanel({controlPanelShipDate:null,controlPanelShipDateOverride:false});setShipDatePopoverFor(null);}}
        style={{background:"none",border:"none",color:"#38bdf8",fontSize:11,cursor:"pointer",padding:0,textDecoration:"underline"}}>↩ Revert to computed</button>}
      <button onClick={()=>setShipDatePopoverFor(null)}
        style={{position:"absolute",top:4,right:8,background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16}}>✕</button>
    </div>
  );
})()}
```

(Adjust positioning based on what fits the existing layout. The popover itself can be simple — just clicks outside close it.)

- [ ] **Step 2: Close on outside click**

Add a `useEffect` that listens for clicks outside the popover and calls `setShipDatePopoverFor(null)`.

- [ ] **Step 3: Validate + deploy**

```bash
node validate_jsx.js && bash deploy.sh
```

Verify: click chip → popover opens. Pick a date → click Override → popover closes, chip reflects new date, overridden style if > 14d gap. Click Revert → override cleared, chip back to computed.

---

## Task 5: Auto-populated Lead Drivers quote note

**Goal:** When the quote is composed (or re-rendered), append or refresh a `Lead drivers (> {avg}d avg): PN1 (45d) · PN2 (28d) · ...` line in `project.quote.notes`.

**Files:**
- Modify: `public/index.html` — quote compose / render flow

- [ ] **Step 1: Helper to format drivers line**

```js
function _formatLeadDriversNote(drivers,avg){
  if(!drivers.length)return "";
  const anyAi=drivers.some(d=>d.source==="ai");
  const list=drivers.map(d=>`${d.partNumber} (${d.leadTimeDays}d${d.source==="ai"?"*":""})`).join(" · ");
  return`Lead drivers (> ${avg}d avg): ${list}${anyAi?" — *AI estimate":""}`;
}
```

- [ ] **Step 2: Compose across panels + append/refresh**

```js
// Called on quote compose and on any control panel ship date change
function _refreshLeadDriverNote(project){
  // Aggregate drivers across panels → apply above-average filter to combined list
  const allBomRows=[];
  for(const p of (project.panels||[])){
    for(const r of (p.bom||[])){
      if(!r.isLaborRow&&!_isExcludedFromPriceCheck(r)&&(+r.leadTimeDays||0)>0){
        allBomRows.push(r);
      }
    }
  }
  if(allBomRows.length<3)return project; // too small for meaningful avg
  const vals=allBomRows.map(r=>+r.leadTimeDays).filter(n=>n>0);
  const avg=vals.length?vals.reduce((s,n)=>s+n,0)/vals.length:0;
  const drivers=[...allBomRows].filter(r=>(+r.leadTimeDays||0)>avg)
    .sort((a,b)=>(+b.leadTimeDays||0)-(+a.leadTimeDays||0))
    .map(r=>({partNumber:r.partNumber||"",description:r.description||"",leadTimeDays:+r.leadTimeDays,source:r.leadTimeSource||"unknown"}));
  const line=_formatLeadDriversNote(drivers,Math.round(avg*10)/10);
  const existingNotes=project.quote?.notes||"";
  // Match any line starting with "Lead drivers" (with or without avg) — replace in place
  const driversRe=/^Lead drivers[^\n]*$/m;
  let newNotes;
  if(driversRe.test(existingNotes)){
    newNotes=line?existingNotes.replace(driversRe,line):existingNotes.replace(driversRe,"").replace(/\n\n+/g,"\n\n").trim();
  }else if(line){
    newNotes=(existingNotes?existingNotes+"\n":"")+line;
  }else{
    newNotes=existingNotes;
  }
  return{...project,quote:{...(project.quote||{}),notes:newNotes}};
}
```

- [ ] **Step 3: Wire to compute triggers**

When any of these change, call `_refreshLeadDriverNote` and persist:
- A BOM row's `leadTimeDays` changes
- A panel's `bom` changes (add/remove row)

Simplest approach: in the `useEffect` that already fires on BOM changes (find via `project.panels` dep in existing effects), add:
```js
useEffect(()=>{
  if(!uid||!projectRef.current)return;
  const updated=_refreshLeadDriverNote(projectRef.current);
  if(updated.quote?.notes!==projectRef.current.quote?.notes){
    update(updated);
  }
},[JSON.stringify((projectRef.current?.panels||[]).map(p=>(p.bom||[]).map(r=>[r.id,r.leadTimeDays]).join(";")))]);
```

- [ ] **Step 4: Respect user edits**

Add a "Refresh lead driver note" button next to the quote Notes field (small, unobtrusive). Only that button re-fires the refresh — the useEffect above does initial append but doesn't overwrite a line that doesn't match `^Lead drivers`.

Actually reconsider: the regex match IS the "respect user edits" rule — if the user deletes the line entirely, we re-add; if they edit the line to say something different, the regex doesn't match so we append a new one, creating duplication. Better pattern: only append if the line doesn't exist AND user hasn't set a `leadDriversNoteDismissed` flag. Add that flag to quote state, toggled by a small ✕ button next to the auto-added line.

Simpler v1: always refresh in-place via regex. Defer user-edit handling to v2 if it becomes a real issue.

- [ ] **Step 5: Validate + deploy**

```bash
node validate_jsx.js && bash deploy.sh
```

Verify:
- Project with 10 BOM items, avg lead 14d, one item 45d → notes line appended
- Change the 45d item to 50d → line updated in place (not duplicated)
- Delete all lead times → line removed
- 2-item BOM → no line at all (below threshold)

---

## Task 6: Batched BC writeback — queue + 30s flush

**Goal:** Replace per-row 2s debounce (`_leadTimeWriteTimers` from v1.19.693) with a single queue that flushes 30 seconds after the LAST cell edit.

**Files:**
- Modify: `public/index.html` — the manual-edit lead-time debounced push inside `updateBomRow` (~line 14478) + add queue + pill

- [ ] **Step 1: Add module-level queue ref**

At the top of the panel component, near `_leadTimeWriteTimers.current`:
```js
const _leadTimeBcQueue=useRef({pending:new Map(),flushTimer:null,flushing:false});
const [pendingSyncCount,setPendingSyncCount]=useState(0);
```

- [ ] **Step 2: Replace the per-row timer logic**

Find the block that starts `if(field==="leadTimeDays"&&editedRow&&_bcToken)` (~line 14476). Replace with:

```js
if(field==="leadTimeDays"&&editedRow&&_bcToken){
  const row=editedRow;
  const pn=(row.partNumber||"").trim();
  const ld=+row.leadTimeDays;
  if(pn&&ld>0&&!row.isLaborRow&&!_isExcludedFromPriceCheck(row)){
    // Enqueue — Map key=rowId, later edits replace earlier
    _leadTimeBcQueue.current.pending.set(id,{
      rowId:id,partNumber:pn,vendorNo:row.bcVendorNo||"",vendorName:row.bcVendorName||"",
      vendorItemNo:row.supplierPartNumber||"",leadTimeDays:ld,editedAt:Date.now(),
    });
    setPendingSyncCount(_leadTimeBcQueue.current.pending.size);
    // Reset flush timer — slides forward on every edit
    if(_leadTimeBcQueue.current.flushTimer)clearTimeout(_leadTimeBcQueue.current.flushTimer);
    const windowSec=+(_appCtx._laborConfig?.leadTimeBatchSeconds)||30;
    _leadTimeBcQueue.current.flushTimer=setTimeout(()=>_flushLeadTimeBcQueue(),windowSec*1000);
  }
}
```

- [ ] **Step 3: Build `_flushLeadTimeBcQueue`**

```js
async function _flushLeadTimeBcQueue(){
  if(_leadTimeBcQueue.current.flushing)return;
  const queue=_leadTimeBcQueue.current;
  if(queue.pending.size===0)return;
  queue.flushing=true;
  const batch=[...queue.pending.values()];
  queue.pending.clear();
  queue.flushTimer=null;
  setPendingSyncCount(0);
  const cid=_appCtx.companyId;
  let ok=0,failed=0;
  const errors=[];
  for(const w of batch){
    try{
      // Live vendor resolution fallback — same pattern as pushAllLeadTimesToBc
      let vn=w.vendorNo;
      let vname=w.vendorName;
      if(!vn){
        vn=await bcGetItemVendorNo(w.partNumber).catch(()=>"");
        if(vn&&!vname)vname=await bcGetVendorName(vn).catch(()=>"");
      }
      if(!vn){failed++;errors.push(`${w.partNumber}: no BC vendor`);continue;}
      const res=await bcUpsertItemVendorLeadTime({
        partNumber:w.partNumber,vendorNo:vn,vendorName:vname||"",
        vendorItemNo:w.vendorItemNo,leadTimeDays:w.leadTimeDays,
        projectId:projectId,uid,cid,
      });
      if(res.outcome==="created"||res.outcome==="updated")ok++;
      else{failed++;errors.push(`${w.partNumber}: ${res.error||"unknown"}`);}
    }catch(e){failed++;errors.push(`${w.partNumber}: ${e.message||String(e)}`);}
  }
  queue.flushing=false;
  // If new edits arrived during the flush, kick another timer
  if(queue.pending.size>0){
    const windowSec=+(_appCtx._laborConfig?.leadTimeBatchSeconds)||30;
    queue.flushTimer=setTimeout(()=>_flushLeadTimeBcQueue(),windowSec*1000);
  }
  // Toast
  if(ok>0||failed>0){
    console.log(`[LEAD TIME BATCH] ${ok} synced to BC${failed>0?`, ${failed} failed`:""}`);
    // Lightweight toast via existing toast infrastructure (or console.log if none)
    if(typeof _toast==="function")_toast(`✓ ${ok} lead time${ok!==1?"s":""} synced${failed>0?`, ${failed} failed`:""}`,failed>0?"warning":"success");
  }
}
```

- [ ] **Step 4: Validate + deploy**

```bash
node validate_jsx.js && bash deploy.sh
```

Verify:
- Edit one lead time → no BC call for 30s → after 30s, ONE BC write fires
- Edit 5 lead times in quick succession → timer keeps resetting → 30s after the LAST → ONE batch of 5
- Edit row A, wait 20s, edit row A again → only the second value goes to BC

---

## Task 7: Pending-sync pill + "Sync now" button

**Goal:** Visible `⏳ N pending BC sync` pill in the BOM toolbar; clicking flushes immediately.

**Files:**
- Modify: `public/index.html` — BOM header toolbar area (near the `📤 Push Lead Times to BC` button ~line 16018)

- [ ] **Step 1: Render the pill when count > 0**

Near the existing Push button:

```jsx
{pendingSyncCount>0&&(
  <button onClick={()=>_flushLeadTimeBcQueue()}
    title={`${pendingSyncCount} lead-time edit${pendingSyncCount!==1?"s":""} waiting to sync to BC. Click to sync now.`}
    style={{background:"#3a2800",border:"1px solid #fcd34d",borderRadius:10,color:"#fcd34d",padding:"3px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",animation:"pulseYellow 2s ease-in-out infinite"}}>
    ⏳ {pendingSyncCount} pending BC sync
  </button>
)}
```

- [ ] **Step 2: Validate + deploy**

```bash
node validate_jsx.js && bash deploy.sh
```

Verify:
- Edit a lead time → pill appears showing `⏳ 1 pending BC sync`
- Edit 2 more → count goes to 3
- Click the pill → immediate flush, pill disappears, toast shows result
- Wait 30s without clicking → pill disappears automatically when flush fires

---

## Task 8: Unload flush + config wiring

**Goal:** Fire a best-effort flush on page unload / tab visibility change so pending edits don't hang. Wire `leadTimeBatchSeconds` config.

**Files:**
- Modify: `public/index.html` — add `visibilitychange` listener in the panel component; add config field loading

- [ ] **Step 1: Add visibility/unload handler**

```js
useEffect(()=>{
  const onVisibilityChange=()=>{
    if(document.visibilityState==="hidden"&&_leadTimeBcQueue.current.pending.size>0){
      // Best-effort: fire but don't await
      _flushLeadTimeBcQueue().catch(()=>{});
    }
  };
  document.addEventListener("visibilitychange",onVisibilityChange);
  return()=>document.removeEventListener("visibilitychange",onVisibilityChange);
},[]);
```

- [ ] **Step 2: Load `leadTimeBatchSeconds` from config**

In the config loader (search for where `laborRates` is read), ensure `leadTimeBatchSeconds` is pulled into `_appCtx._laborConfig`.

- [ ] **Step 3: Add config UI in Settings → Config**

Simple number input with label "Lead time batch window (seconds)", default 30, range 5-300. Same pattern as other config fields.

- [ ] **Step 4: Wire dailyCrewHours in the same config block**

Number input "Daily crew hours", default 8, range 1-24. This is the input that feeds `laborDays` in Task 1's compute.

- [ ] **Step 5: Validate + deploy**

```bash
node validate_jsx.js && bash deploy.sh
```

Verify:
- Edit lead time → close tab within 30s → open `bcLeadTimeWrites` audit collection in Firestore → recent entry (or at least an attempt) exists
- Change `leadTimeBatchSeconds` to 10 in Settings → edit lead time → flush after 10s instead of 30
- Change `dailyCrewHours` to 6 → chip recomputes → `laborDays` now uses /6 in the breakdown

---

## Task 9: Regression + end-to-end tests

**Goal:** Confirm no existing flow broke.

- [ ] **Step 1: Regression — bulk push button still works**

Open a project with multiple lead-time-bearing rows → click **📤 Push Lead Times to BC** → verify all still go through immediately (not queued).

- [ ] **Step 2: Regression — supplier portal Apply Prices still pushes lead times**

Submit a supplier quote via portal → Apply Prices → verify BC ItemVendorCatalog entries created/updated for all lines (not queued, fires immediately).

- [ ] **Step 3: Regression — Upload Supplier Quote push still works**

Upload a supplier quote PDF via the internal modal → Push to BC → verify lead times land in BC ItemVendorCatalog immediately.

- [ ] **Step 4: New flow — editing lead times dynamically**

1. Open a project with 10+ BOM rows, no lead times set
2. Edit 5 rows rapidly — each one's chip updates within 500ms
3. Pill shows `⏳ 5 pending BC sync`
4. Wait 30s → pill disappears → toast `✓ 5 lead times synced`
5. BC shows new ItemVendorCatalog entries

- [ ] **Step 5: New flow — ship date drives quote note**

1. Add productionDays=7 to panel
2. BOM has 10 items; avg lead = 14d; 3 items exceed avg (45d, 28d, 21d)
3. Quote Summary chip shows `56d` (today + 45 + 4 + 7)
4. Open quote → Notes field has `Lead drivers (> 14d avg): A303012LP (45d) · 800H-1HVX7M1 (28d) · 140G-G6C3-C20 (21d)`

- [ ] **Step 6: New flow — override + revert**

1. Click chip → popover → set date 30d in future
2. Chip turns red (> 14d gap vs computed)
3. Tooltip shows "OVERRIDDEN (computed: 56d)"
4. Click Revert → chip back to 56d cyan

---

## Task 10: Documentation + CLAUDE.md update

**Goal:** Document the feature in CLAUDE.md so future Claude instances don't undo the batching.

**Files:**
- Modify: `C:\Users\jon\AppDev\MatrixARC\CLAUDE.md`

- [ ] **Step 1: Add section under "Architecture Notes"**

```md
### Control Panel Lead Time (v1.19.70X)

`computeControlPanelLeadTime(panel, project)` returns the panel's ship date from
`longestItemLeadDays + laborDays + productionDays`. Sum-based, not max-based.
Dynamic via useMemo in QUOTE SUMMARY; chip to the left of each panel's status pill.

### Batched BC Lead-Time Writeback (v1.19.70X — replaces v1.19.693)

Cell-level leadTimeDays edits are queued into `_leadTimeBcQueue` (module-level
useRef). A 30-second debounced timer (configurable via
`laborRates.leadTimeBatchSeconds`) flushes the whole queue in a single sequential
batch. Map key = rowId so rapid re-edits to the same row collapse. User sees
`⏳ N pending BC sync` pill in the BOM toolbar; clicking forces immediate flush.
Unload / visibilitychange fires a best-effort flush.

Bulk paths (Push All, supplier portal Apply, Upload Supplier Quote) remain
immediate — they are deliberate user-initiated actions.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md && git commit -m "docs: Control Panel Lead Time + Batched BC Writeback"
```

---

## Out of scope (punt to v2)

- Lead-driver-dismissed flag (quote-side override of the auto-note)
- Business-day calendar
- Expedite suggestions ("which item would most compress the date")
- Per-panel ship-date divergence tracking
- Standard deviation / median driver selection
- Retry-on-failure queue for BC batch flushes (currently single-shot)

## Out of scope (won't do)

- Multi-tab sync of the queue (each tab has its own queue; multi-tab editing converges via Firestore — by design)
- Expose the pending queue to other users of the same project (local-only by design)

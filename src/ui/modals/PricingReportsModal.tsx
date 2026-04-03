// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function PricingReportsModal({uid,onClose}){
  const [runs,setRuns]=useState([]);
  const [loading,setLoading]=useState(true);
  const [expandedId,setExpandedId]=useState(null);

  useEffect(()=>{
    fbDb.collection(`users/${uid}/pricingSyncLog`).orderBy("runAt","desc").limit(50).get()
      .then(snap=>{
        const docs=[];
        snap.forEach(d=>docs.push({id:d.id,...d.data()}));
        setRuns(docs);
      }).catch(e=>console.warn("Failed to load sync log:",e))
      .finally(()=>setLoading(false));
  },[uid]);

  function exportRunCSV(run){
    const header=["Part Number","Vendor","Price","UOM","Availability","Manufacturer","Product Name","Status","Error","Sync Date"];
    const dateStr=new Date(run.runAt).toLocaleDateString();
    const rows=(run.results||[]).map(r=>[
      r.partNumber, run.vendor, r.found?r.price:"", r.uom||"", (r.availability||"").replace(/[\n\r,]/g," "),
      r.manufacturer||"", (r.productName||"").replace(/,/g," "), r.found?"Found":"Error", r.error||"", dateStr
    ]);
    const csv=[header,...rows].map(r=>r.map(c=>`"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`${run.vendor}_pricing_${new Date(run.runAt).toISOString().slice(0,10)}.csv`;
    a.click();
  }

  function exportAllLatest(){
    // Aggregate most recent price per part across all runs
    const latest={};
    // runs are already sorted by runAt desc — first occurrence wins (most recent)
    runs.forEach(run=>{
      (run.results||[]).forEach(r=>{
        if(r.found&&r.price&&!latest[r.partNumber+"_"+run.vendor]){
          latest[r.partNumber+"_"+run.vendor]={partNumber:r.partNumber,vendor:run.vendor,price:r.price,uom:r.uom||"EA",availability:r.availability||"",manufacturer:r.manufacturer||"",productName:r.productName||"",date:new Date(run.runAt).toLocaleDateString()};
        }
      });
    });
    const rows=Object.values(latest).sort((a,b)=>a.partNumber.localeCompare(b.partNumber));
    const header=["Part Number","Vendor","Price","UOM","Availability","Manufacturer","Product Name","Last Sync Date"];
    const csv=[header,...rows.map(r=>[r.partNumber,r.vendor,r.price,r.uom,(r.availability||"").replace(/[\n\r,]/g," "),r.manufacturer,(r.productName||"").replace(/,/g," "),r.date])].map(r=>r.map(c=>`"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`all_latest_pricing_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  }

  function fmtDuration(ms){
    if(!ms)return"—";
    const s=Math.round(ms/1000);
    if(s<60)return s+"s";
    const m=Math.floor(s/60),rs=s%60;
    return m+"m "+rs+"s";
  }

  return(<div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.7)"}} onClick={onClose}>
    <div style={{background:"#0f0f1a",borderRadius:12,border:`1px solid ${C.border}`,width:800,maxWidth:"95vw",maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:15,fontWeight:700,color:"#e2e8f0"}}>Pricing Sync Reports</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {runs.length>0&&<button onClick={exportAllLatest} style={{background:"#16a34a",color:"#fff",border:"none",borderRadius:6,padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer"}}>Export All Latest Prices (CSV)</button>}
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"2px 6px"}}>✕</button>
        </div>
      </div>
      {/* Body */}
      <div style={{flex:1,overflowY:"auto",padding:"14px 18px"}}>
        {loading?<div style={{color:C.muted,fontSize:13,padding:20,textAlign:"center"}}>Loading sync history…</div>
        :runs.length===0?<div style={{color:C.muted,fontSize:13,padding:20,textAlign:"center"}}>No pricing sync runs yet. Run a Codale or Mouser update to see results here.</div>
        :<div>
          {runs.map(run=>{
            const expanded=expandedId===run.id;
            const dt=new Date(run.runAt);
            return(<div key={run.id} style={{marginBottom:8,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
              {/* Run summary row */}
              <div onClick={()=>setExpandedId(expanded?null:run.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",cursor:"pointer",flexWrap:"wrap"}}>
                <span style={{fontWeight:700,color:run.vendor==="Codale"?"#22d3ee":"#a78bfa",fontSize:12,minWidth:60}}>{run.vendor}</span>
                <span style={{color:"#94a3b8",fontSize:12}}>{dt.toLocaleDateString()} {dt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                <span style={{color:"#22c55e",fontSize:12,fontWeight:600}}>{run.found} found</span>
                {run.errors>0&&<span style={{color:"#ef4444",fontSize:12,fontWeight:600}}>{run.errors} errors</span>}
                <span style={{color:"#94a3b8",fontSize:12}}>{run.totalItems} total</span>
                {run.writtenToBC>0&&<span style={{color:"#60a5fa",fontSize:12}}>→ {run.writtenToBC} written to BC</span>}
                <span style={{color:"#94a3b8",fontSize:11}}>{fmtDuration(run.durationMs)}</span>
                <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
                  <button onClick={e=>{e.stopPropagation();exportRunCSV(run);}} style={{background:"#334155",color:"#e2e8f0",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>CSV</button>
                  <span style={{color:"#94a3b8",fontSize:14}}>{expanded?"▲":"▼"}</span>
                </div>
              </div>
              {/* Expanded results */}
              {expanded&&<div style={{borderTop:`1px solid ${C.border}`,padding:"8px 14px",maxHeight:400,overflowY:"auto"}}>
                {(run.results||[]).length===0?<div style={{color:C.muted,fontSize:12}}>No detailed results stored.</div>
                :(run.results||[]).map((r,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",borderBottom:`1px solid rgba(255,255,255,0.03)`,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{fontWeight:700,color:r.found?"#22c55e":"#ef4444",minWidth:140}}>{r.partNumber}</span>
                  {r.found?<>
                    <span style={{color:"#22c55e",fontWeight:700,minWidth:80}}>${Number(r.price).toLocaleString("en-US",{minimumFractionDigits:2})}</span>
                    <span style={{color:"#94a3b8"}}>{r.uom||"EA"}</span>
                    {r.manufacturer&&<span style={{color:"#94a3b8"}}>| {r.manufacturer}</span>}
                    {r.productName&&<span style={{color:"#94a3b8",fontSize:11}}>{r.productName}</span>}
                  </>:<span style={{color:"#94a3b8"}}>{r.error||"Not found"}</span>}
                </div>)}
              </div>}
            </div>);
          })}
        </div>}
      </div>
    </div>
  </div>);
}

// ── DIGIKEY TEST PANEL ──
function DigikeyTestPanel({uid}){
  const [parts,setParts]=useState("25B-D4P0N114:Allen Bradley, LM358:Texas Instruments");
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);

  async function runTest(){
    setLoading(true);setError(null);setResults(null);
    try{
      // Support "PartNumber:Manufacturer" format per line/comma entry
      const items=parts.split(",").map(s=>s.trim()).filter(Boolean).map(entry=>{
        const colon=entry.indexOf(":");
        if(colon>0)return{partNumber:entry.slice(0,colon).trim(),manufacturer:entry.slice(colon+1).trim()||undefined};
        return{partNumber:entry};
      });
      if(!items.length){setError("Enter at least one part number");setLoading(false);return;}
      const fn=firebase.functions().httpsCallable("digikeySearch",{timeout:120000});
      const r=await fn({items});
      setResults(r.data.results||[]);
    }catch(e){setError(e.message||"Search failed");}
    setLoading(false);
  }

  return(<div>
    <div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Format: <code style={{background:"#1e293b",padding:"1px 4px",borderRadius:3}}>PartNum</code> or <code style={{background:"#1e293b",padding:"1px 4px",borderRadius:3}}>PartNum:Manufacturer</code> — comma-separated</div>
    <input value={parts} onChange={e=>setParts(e.target.value)} placeholder="e.g. 25B-D4P0N114:Allen Bradley, LM358"
      style={{width:"100%",boxSizing:"border-box",background:"#111",border:`1px solid #333`,borderRadius:6,padding:"8px 10px",color:"#e2e8f0",fontSize:12,marginBottom:8,fontFamily:"inherit"}}/>
    <button onClick={runTest} disabled={loading}
      style={{background:loading?"#334155":"#f97316",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:loading?"wait":"pointer",opacity:loading?0.7:1,fontFamily:"inherit"}}>
      {loading?"Searching…":"Test DigiKey Search"}
    </button>
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:8,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{error}</div>}
    {results&&<div style={{marginTop:10,maxHeight:400,overflowY:"auto"}}>
      {results.map((r,i)=><div key={i} style={{background:r.found?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`1px solid ${r.found?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:6,padding:"8px 10px",marginBottom:4,fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:r.found?"#22c55e":"#ef4444"}}>{r.partNumber}</span>
          {r.found?<>
            <span style={{color:"#22c55e",fontWeight:700}}>${r.price.toLocaleString("en-US",{minimumFractionDigits:2})}</span>
            {r.manufacturer&&<span style={{color:"#94a3b8"}}>| {r.manufacturer}</span>}
            {r.availability&&<span style={{color:"#94a3b8"}}>| {r.availability}</span>}
            {r.mfrWarning&&<span style={{color:"#f59e0b",fontSize:11}}>⚠ {r.mfrWarning}</span>}
          </>:<>
            <span style={{color:"#94a3b8",wordBreak:"break-word"}}>{r.error||"Not found"}</span>
            {r.manufacturer&&<span style={{color:"#94a3b8",fontSize:11}}>DigiKey MFR: {r.manufacturer}</span>}
          </>}
        </div>
        {r.found&&r.description&&<div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>{r.description}</div>}
        {r.found&&r.priceBreaks&&r.priceBreaks.length>1&&<div style={{color:"#94a3b8",fontSize:10,marginTop:2}}>
          Price breaks: {r.priceBreaks.map(pb=>`${pb.quantity}+: $${pb.price.toFixed(2)}`).join(" | ")}
        </div>}
      </div>)}
    </div>}
  </div>);
}

// ── DIGIKEY FULL UPDATE PANEL ──
function DigikeyUpdatePanel({uid}){
  const [vendorNo,setVendorNo]=useState(()=>localStorage.getItem('_arc_dk_vendor')||'');
  const [running,setRunning]=useState(false);
  const [status,setStatus]=useState(null);
  const [result,setResult]=useState(null);
  const [error,setError]=useState(null);
  const [showResults,setShowResults]=useState(false);

  function saveVendor(v){setVendorNo(v);localStorage.setItem('_arc_dk_vendor',v);}

  async function runUpdate(){
    if(!_bcToken){setError("Connect to Business Central first");return;}
    if(!vendorNo.trim()){setError("Enter a DigiKey vendor number from BC");return;}
    const vendor=vendorNo.trim();
    const _syncStart=Date.now();
    setRunning(true);setError(null);setResult(null);setStatus(null);setShowResults(false);

    try{
      // Step 1: Fetch all BC items
      setStatus({phase:"Fetching all BC items…",fetched:0,total:0,searched:0,found:0,written:0,errors:0});
      const allItems=[];
      let skip=0;
      while(true){
        const url=`${BC_ODATA_BASE}/ItemCard?$select=No,Description,Manufacturer_Code&$top=200&$skip=${skip}`;
        const r=await fetch(url,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok)break;
        const d=await r.json();
        const batch=d.value||[];
        if(!batch.length)break;
        allItems.push(...batch);
        skip+=200;
        setStatus(prev=>({...prev,phase:`Fetching BC items… ${allItems.length} so far`,fetched:allItems.length}));
        if(batch.length<200)break;
      }
      if(!allItems.length){setError("No items found in BC");setRunning(false);return;}
      setStatus(prev=>({...prev,phase:`Found ${allItems.length} items. Searching DigiKey…`,total:allItems.length}));

      // Step 2: Build items array with manufacturer names for MFR validation
      const searchItems=allItems.map(i=>({
        partNumber:i.No,
        manufacturer:i.Manufacturer_Code?BC_MFR_CODE_NAMES[i.Manufacturer_Code]||null:null
      }));

      // Step 3: Search DigiKey in batches of 15
      const BATCH=15;
      const allResults=[];
      const fn=firebase.functions().httpsCallable("digikeySearch",{timeout:120000});
      for(let i=0;i<searchItems.length;i+=BATCH){
        const batch=searchItems.slice(i,i+BATCH);
        const batchNum=Math.floor(i/BATCH)+1;
        const totalBatches=Math.ceil(searchItems.length/BATCH);
        setStatus(prev=>({...prev,phase:`DigiKey batch ${batchNum}/${totalBatches}…`,
          detail:batch.map(b=>b.partNumber).join(', ').slice(0,80)}));
        try{
          const r=await fn({items:batch});
          allResults.push(...(r.data.results||[]));
        }catch(e){
          console.error("DIGIKEY BATCH ERROR:",e.message);
          batch.forEach(b=>allResults.push({partNumber:b.partNumber,found:false,error:e.message}));
        }
        const found=allResults.filter(r=>r.found).length;
        const errors=allResults.filter(r=>!r.found).length;
        setStatus(prev=>({...prev,searched:allResults.length,found,errors}));
      }

      // Step 4: Write found prices to BC
      const priced=allResults.filter(r=>r.found&&r.price>0);
      setStatus(prev=>({...prev,phase:`Writing ${priced.length} prices to BC…`,detail:""}));
      let written=0;
      for(const r of priced){
        try{
          await bcPushPurchasePrice(r.partNumber,vendor,r.price,Date.now(),r.uom||"EA");
          written++;
          setStatus(prev=>({...prev,written}));
        }catch(e){
          console.warn("DigiKey BC price write failed:",r.partNumber,e.message);
        }
      }

      const durationMs=Date.now()-_syncStart;
      const finalErrors=allResults.filter(r=>!r.found).length;
      setStatus({phase:"Complete",total:allItems.length,searched:allResults.length,found:priced.length,written,errors:finalErrors,detail:""});
      setResult({totalItems:allItems.length,found:priced.length,written,errors:finalErrors,durationMs,results:allResults});

      // Step 5: Save sync log
      try{
        await fbDb.collection(`users/${uid}/pricingSyncLog`).add({
          vendor:"DigiKey",runAt:Date.now(),totalItems:allItems.length,
          found:priced.length,errors:finalErrors,writtenToBC:written,durationMs,
          results:allResults.map(r=>({partNumber:r.partNumber,found:!!r.found,price:r.price||null,
            manufacturer:r.manufacturer||null,error:r.error||null,mfrWarning:r.mfrWarning||null}))
        });
      }catch(e){console.warn("Failed to save DigiKey sync log:",e);}
    }catch(e){setError(e.message||"Update failed");}
    setRunning(false);
  }

  const statusColor=status?.phase==="Complete"?"#22c55e":"#94a3b8";

  return(<div style={{marginTop:12,borderTop:"1px solid #1e293b",paddingTop:12}}>
    <div style={{fontSize:12,color:"#94a3b8",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Full BC Price Update</div>
    <div style={{fontSize:12,color:"#94a3b8",marginBottom:8,lineHeight:1.6}}>
      Searches all BC items on DigiKey, validates manufacturer, and writes purchase prices to BC under the selected vendor.
    </div>
    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
      <input value={vendorNo} onChange={e=>saveVendor(e.target.value)} placeholder="BC Vendor No (e.g. V00999)"
        style={{background:"#111",border:"1px solid #333",borderRadius:6,padding:"6px 10px",color:"#e2e8f0",fontSize:12,width:160,fontFamily:"inherit"}}/>
      <button onClick={runUpdate} disabled={running}
        style={{background:running?"#334155":"#f97316",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:running?"wait":"pointer",opacity:running?0.7:1}}>
        {running?"Updating…":"Update All DigiKey Prices"}
      </button>
    </div>
    {status&&<div style={{fontSize:12,marginBottom:6}}>
      <span style={{color:statusColor}}>{status.phase}</span>
      {status.total>0&&<span style={{color:"#94a3b8",marginLeft:8}}>
        {status.searched||0}/{status.total} searched — {status.found||0} found — {status.written||0} written to BC — {status.errors||0} errors
      </span>}
      {status.detail&&<div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>{status.detail}</div>}
    </div>}
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:8}}>{error}</div>}
    {result&&<div style={{marginTop:8,fontSize:12}}>
      <div style={{color:"#22c55e",marginBottom:4}}>
        ✓ {result.found} prices found, <strong>{result.written}</strong> written to BC
        <span style={{color:"#94a3b8",marginLeft:8}}>| {result.errors} not found | {Math.round(result.durationMs/1000)}s</span>
      </div>
      <button onClick={()=>setShowResults(v=>!v)}
        style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>
        {showResults?"Hide":"Show"} all results
      </button>
      {showResults&&<div style={{marginTop:6,maxHeight:300,overflowY:"auto"}}>
        {result.results.map((r,i)=><div key={i} style={{
          padding:"2px 0",fontSize:11,
          color:r.found?"#22c55e":r.error?.includes("mismatch")?"#f59e0b":"#475569"
        }}>
          {r.found?`✓ ${r.partNumber} — $${r.price?.toFixed(2)} | ${r.manufacturer||''}`:
           `✗ ${r.partNumber} — ${r.error||'not found'}`}
        </div>)}
      </div>}
    </div>}
  </div>);
}

// ── VENDOR PRICING SYNC — MODULE-LEVEL STATE ──
// Sync runs independently of any component. Components subscribe via useVendorSyncState().
let _vSync={running:false,status:null,result:null,error:null,abort:false,uid:null};
const _vSyncListeners=new Set();
function _vSyncNotify(){const s={..._vSync};for(const fn of _vSyncListeners)fn(s);}
function useVendorSyncState(){
  const[s,set]=useState({..._vSync});
  useEffect(()=>{_vSyncListeners.add(set);return()=>_vSyncListeners.delete(set);},[]);
  return s;
}

async function startVendorSync(uid,dkVendor,mouserVendor){
  if(_vSync.running)return;
  _vSync={running:true,status:null,result:null,error:null,abort:false,uid};
  _vSyncNotify();
  const _start=Date.now();
  try{
    // 1. Fetch all BC items
    _vSync.status={phase:"Fetching BC items…",total:0,searched:0,dkFound:0,mouserFound:0,dkWritten:0,mouserWritten:0,errors:0};
    _vSyncNotify();
    const allItems=[];let skip=0;
    while(!_vSync.abort){
      const r=await fetch(`${BC_ODATA_BASE}/ItemCard?$select=No,Description,Manufacturer_Code&$top=200&$skip=${skip}`,
        {headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(!r.ok)break;
      const batch=(await r.json()).value||[];
      if(!batch.length)break;
      allItems.push(...batch);skip+=200;
      _vSync.status={..._vSync.status,phase:`Fetching BC items… ${allItems.length} so far`};
      _vSyncNotify();
      if(batch.length<200)break;
    }
    if(!allItems.length){_vSync.error="No items found in BC";_vSync.running=false;_vSyncNotify();return;}

    const searchItems=allItems.map(i=>({
      partNumber:i.No,
      manufacturer:i.Manufacturer_Code?BC_MFR_CODE_NAMES[i.Manufacturer_Code]||null:null
    }));
    _vSync.status={..._vSync.status,phase:`Searching ${allItems.length} items…`,total:allItems.length};
    _vSyncNotify();

    // 2. Batch through Cloud Function (10 items, Mouser rate-limited)
    const BATCH=10;
    const fn=firebase.functions().httpsCallable("searchVendorPricing",{timeout:300000});
    const allResults=[];
    let dkFound=0,mouserFound=0,dkWritten=0,mouserWritten=0,errors=0;

    for(let i=0;i<searchItems.length&&!_vSync.abort;i+=BATCH){
      const batch=searchItems.slice(i,i+BATCH);
      const batchNum=Math.floor(i/BATCH)+1;
      const totalBatches=Math.ceil(searchItems.length/BATCH);
      _vSync.status={..._vSync.status,
        phase:`Batch ${batchNum}/${totalBatches} — DigiKey & Mouser…`,
        detail:batch.map(b=>b.partNumber).join(', ').slice(0,80)};
      _vSyncNotify();
      let batchResults=[];
      try{
        const r=await fn({items:batch});
        batchResults=r.data.results||[];
      }catch(e){
        console.error("VENDOR BATCH ERROR:",e.message);
        batch.forEach(b=>batchResults.push({partNumber:b.partNumber,
          digikey:{found:false,error:e.message},mouser:{found:false,error:e.message}}));
      }
      // Write found prices to BC immediately
      for(const res of batchResults){
        allResults.push(res);
        const dk=res.digikey||{};const mo=res.mouser||{};
        if(dk.found&&dk.price>0&&dkVendor){
          dkFound++;
          try{await bcPushPurchasePrice(res.partNumber,dkVendor,dk.price,Date.now(),"EA");dkWritten++;}
          catch(e){errors++;console.warn("DK write failed:",res.partNumber,e.message);}
        }
        if(mo.found&&mo.price>0&&mouserVendor){
          mouserFound++;
          try{await bcPushPurchasePrice(res.partNumber,mouserVendor,mo.price,Date.now(),"EA");mouserWritten++;}
          catch(e){errors++;console.warn("Mouser write failed:",res.partNumber,e.message);}
        }
      }
      _vSync.status={..._vSync.status,searched:allResults.length,dkFound,mouserFound,dkWritten,mouserWritten,errors};
      _vSyncNotify();
    }

    const durationMs=Date.now()-_start;
    _vSync.status={phase:"Complete",total:allItems.length,searched:allResults.length,dkFound,mouserFound,dkWritten,mouserWritten,errors,detail:""};
    _vSync.result={totalItems:allItems.length,dkFound,mouserFound,dkWritten,mouserWritten,errors,durationMs,results:allResults};
    _vSyncNotify();

    // Save sync log
    try{
      await fbDb.collection(`users/${uid}/pricingSyncLog`).add({
        vendor:"DigiKey+Mouser",runAt:Date.now(),totalItems:allItems.length,
        found:dkFound+mouserFound,errors,writtenToBC:dkWritten+mouserWritten,durationMs,
        dkFound,mouserFound,dkWritten,mouserWritten,
        results:allResults.map(r=>({
          partNumber:r.partNumber,
          dkFound:!!(r.digikey?.found),dkPrice:r.digikey?.price||null,dkMfr:r.digikey?.manufacturer||null,dkError:r.digikey?.error||null,
          mouserFound:!!(r.mouser?.found),mouserPrice:r.mouser?.price||null,mouserMfr:r.mouser?.manufacturer||null,mouserError:r.mouser?.error||null,
        }))
      });
    }catch(e){console.warn("Failed to save vendor sync log:",e);}
  }catch(e){_vSync.error=e.message||"Sync failed";_vSyncNotify();}
  _vSync.running=false;
  _vSyncNotify();
}

// ── VENDOR PRICING SYNC PANEL (UI only — reads module state) ──
function VendorPricingSyncPanel({uid}){
  const[dkVendor,setDkVendor]=useState('');
  const[mouserVendor,setMouserVendor]=useState('');
  const[vendors,setVendors]=useState([]); // [{No,Name}] from BC
  const[loadingVendors,setLoadingVendors]=useState(false);
  const[vendorLoadErr,setVendorLoadErr]=useState(null);
  const[showLog,setShowLog]=useState(false);
  const sync=useVendorSyncState();

  // Load vendor config from Firestore + auto-detect from BC on mount
  useEffect(()=>{
    if(!uid)return;
    fbDb.doc(`users/${uid}/config/vendorConfig`).get().then(d=>{
      if(d.exists){
        const dat=d.data();
        if(dat.digikeyVendorNo)setDkVendor(dat.digikeyVendorNo);
        if(dat.mouserVendorNo)setMouserVendor(dat.mouserVendorNo);
      }
    });
    // Always attempt — component only mounts when panel is opened so BC should be connected
    fetchVendors();
  },[uid]);

  async function fetchVendors(){
    if(!_bcToken){setVendorLoadErr("Not connected to Business Central — connect first then retry.");return;}
    setLoadingVendors(true);
    setVendorLoadErr(null);
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find(n=>/^vendor/i.test(n))||'Vendor';
      // Try PARTS-filtered list first; fall back to all vendors if PARTS group not yet set up
      const partsR=await fetch(
        `${BC_ODATA_BASE}/${vPage}?$select=No,Name,Vendor_Posting_Group&$top=500&$filter=Vendor_Posting_Group eq 'PARTS'`,
        {headers:{"Authorization":`Bearer ${_bcToken}`}});
      const partsList=partsR.ok?(await partsR.json()).value||[]:[];
      let list=partsList;
      let partsFiltered=partsList.length>0;
      if(!partsFiltered){
        // PARTS group not set up yet — load all vendors
        const r=await fetch(`${BC_ODATA_BASE}/${vPage}?$select=No,Name,Vendor_Posting_Group&$top=500`,
          {headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok){const txt=await r.text();setVendorLoadErr(`BC ${r.status}: ${txt.slice(0,200)}`);setLoadingVendors(false);return;}
        list=(await r.json()).value||[];
      }
      setVendors(list);
      setVendorLoadErr(partsFiltered?null:`ℹ PARTS posting group not set up yet — showing all ${list.length} vendors.`);
      // Auto-detect DigiKey and Mouser by name
      const norm=s=>(s||'').toLowerCase().replace(/[\s\-\.]/g,'');
      const dk=list.find(v=>norm(v.Name).includes('digikey'));
      const mo=list.find(v=>norm(v.Name).includes('mouser'));
      if(dk)setDkVendor(prev=>prev||dk.No);
      if(mo)setMouserVendor(prev=>prev||mo.No);
      if(!dk&&!mo)console.log("VendorSync: no DigiKey/Mouser found:",list.map(v=>v.Name));
    }catch(e){
      setVendorLoadErr(`Error loading vendors: ${e.message}`);
      console.warn("fetchVendors error:",e);
    }
    setLoadingVendors(false);
  }

  async function saveVendors(dk,m){
    const newDk=dk!==undefined?dk:dkVendor;
    const newM=m!==undefined?m:mouserVendor;
    if(dk!==undefined)setDkVendor(dk);
    if(m!==undefined)setMouserVendor(m);
    try{
      await fbDb.doc(`users/${uid}/config/vendorConfig`).set(
        {digikeyVendorNo:newDk,mouserVendorNo:newM},{merge:true});
    }catch(e){console.warn("saveVendors error:",e);}
  }

  function handleStart(){
    if(!_bcToken){alert("Connect to Business Central first");return;}
    if(!dkVendor.trim()&&!mouserVendor.trim()){alert("No vendor IDs set — connect to BC to auto-detect, or select manually");return;}
    startVendorSync(uid,dkVendor.trim(),mouserVendor.trim());
  }

  const{running,status,result,error}=sync;
  const statusColor=status?.phase==="Complete"?"#22c55e":"#94a3b8";
  const norm=s=>(s||'').toLowerCase().replace(/[\s\-\.]/g,'');
  const dkMatch=vendors.find(v=>norm(v.Name).includes('digikey'));
  const moMatch=vendors.find(v=>norm(v.Name).includes('mouser'));

  return(<div>
    <div style={{fontSize:12,color:"#94a3b8",marginBottom:10,lineHeight:1.6}}>
      Searches all BC items on DigiKey and Mouser with manufacturer validation and writes
      prices to BC as alternate vendor purchase prices. Runs in the background — you can
      switch tabs while it runs.
    </div>
    {/* Vendor load status */}
    {vendorLoadErr&&<div style={{marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:12,color:"#f87171"}}>⚠ {vendorLoadErr}</span>
      <button onClick={fetchVendors} disabled={loadingVendors}
        style={{background:"#1e3a5f",color:"#93c5fd",border:"1px solid #3b6aad",borderRadius:4,
          padding:"3px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>
        {loadingVendors?"Loading…":"↺ Retry"}
      </button>
    </div>}
    {loadingVendors&&!vendorLoadErr&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>Loading BC vendors…</div>}

    <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
      {/* DigiKey vendor selector */}
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>DigiKey Vendor:</span>
        {vendors.length>0?(
          <select value={dkVendor} onChange={e=>saveVendors(e.target.value,undefined)} disabled={running}
            style={{background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:dkVendor?"#e2e8f0":"#475569",fontSize:12,fontFamily:"inherit",minWidth:160}}>
            <option value="">— not set —</option>
            {vendors.map(v=><option key={v.No} value={v.No}>{v.No} — {v.Name}</option>)}
          </select>
        ):(
          <input value={dkVendor} onChange={e=>saveVendors(e.target.value,undefined)} disabled={running}
            placeholder={loadingVendors?"Loading…":"Enter vendor No manually"}
            style={{width:160,background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
        )}
        {dkMatch&&dkVendor===dkMatch.No&&<span style={{fontSize:11,color:"#22c55e"}}>✓ auto-detected</span>}
      </div>
      {/* Mouser vendor selector */}
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>Mouser Vendor:</span>
        {vendors.length>0?(
          <select value={mouserVendor} onChange={e=>saveVendors(undefined,e.target.value)} disabled={running}
            style={{background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:mouserVendor?"#e2e8f0":"#475569",fontSize:12,fontFamily:"inherit",minWidth:160}}>
            <option value="">— not set —</option>
            {vendors.map(v=><option key={v.No} value={v.No}>{v.No} — {v.Name}</option>)}
          </select>
        ):(
          <input value={mouserVendor} onChange={e=>saveVendors(undefined,e.target.value)} disabled={running}
            placeholder={loadingVendors?"Loading…":"Enter vendor No manually"}
            style={{width:160,background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
        )}
        {moMatch&&mouserVendor===moMatch.No&&<span style={{fontSize:11,color:"#22c55e"}}>✓ auto-detected</span>}
      </div>
      {/* Manual reload button (always visible so user can re-fetch if needed) */}
      {!loadingVendors&&<button onClick={fetchVendors} title="Reload vendor list from BC"
        style={{background:"none",border:"1px solid #334155",borderRadius:4,
          padding:"4px 8px",fontSize:11,color:"#94a3b8",cursor:"pointer"}}>↺</button>}
      <button onClick={running?()=>{_vSync.abort=true;}:handleStart}
        style={{background:running?"#7f1d1d":"#0d9488",color:"#fff",border:"none",borderRadius:6,
          padding:"7px 18px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
        {running?"⏹ Stop":"🔄 Sync DigiKey & Mouser Prices"}
      </button>
    </div>
    {status&&<div style={{fontSize:12,marginBottom:6}}>
      <span style={{color:statusColor,fontWeight:600}}>{status.phase}</span>
      {status.total>0&&<span style={{color:"#94a3b8",marginLeft:8}}>
        {status.searched||0}/{status.total} searched
        {" · "}DK: {status.dkFound||0}/{status.dkWritten||0} written
        {" · "}Mouser: {status.mouserFound||0}/{status.mouserWritten||0} written
        {status.errors>0&&<span style={{color:"#f59e0b"}}> · {status.errors} errors</span>}
      </span>}
      {status.detail&&<div style={{color:"#94a3b8",fontSize:11,marginTop:2,fontFamily:"monospace"}}>{status.detail}</div>}
    </div>}
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:6}}>{error}</div>}
    {result&&<div style={{marginTop:8,fontSize:12}}>
      <div style={{color:"#22c55e",marginBottom:4}}>
        ✓ Complete — DigiKey: <strong>{result.dkWritten}</strong> · Mouser: <strong>{result.mouserWritten}</strong> written to BC
        <span style={{color:"#94a3b8",marginLeft:8}}>| {result.errors} errors | {Math.round(result.durationMs/1000)}s</span>
      </div>
      <button onClick={()=>setShowLog(v=>!v)}
        style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>
        {showLog?"Hide":"Show"} Results ({result.results.length} items)
      </button>
      {showLog&&<div style={{marginTop:6,maxHeight:300,overflowY:"auto",fontSize:11,fontFamily:"monospace"}}>
        {result.results.map((r,i)=>{
          const dk=r.digikey||{};const mo=r.mouser||{};
          const hasDk=dk.found&&dk.price>0;const hasMo=mo.found&&mo.price>0;
          if(!hasDk&&!hasMo)return null;
          return(<div key={i} style={{padding:"1px 0",color:hasDk&&hasMo?"#34d399":hasDk?"#93c5fd":hasMo?"#fbbf24":"#475569"}}>
            {r.partNumber}
            {hasDk&&<span style={{color:"#93c5fd"}}> · DK ${dk.price?.toFixed(2)} ({dk.manufacturer||'?'})</span>}
            {hasMo&&<span style={{color:"#fbbf24"}}> · Mouser ${mo.price?.toFixed(2)} ({mo.manufacturer||'?'})</span>}
          </div>);
        })}
      </div>}
    </div>}
  </div>);
}

// ── VENDOR SYNC FLOATER — persistent progress pill visible from any tab ──
function VendorSyncFloater({onSwitchToItems}){
  const sync=useVendorSyncState();
  if(!sync.running&&!sync.result)return null;
  const st=sync.status||{};
  const done=st.phase==="Complete";
  return(<div style={{
    position:"fixed",bottom:20,right:20,zIndex:2000,
    background:done?"#064e3b":"#0f172a",
    border:`1px solid ${done?"#10b981":"#0d9488"}`,
    borderRadius:12,padding:"10px 16px",
    boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
    display:"flex",flexDirection:"column",gap:4,minWidth:280,maxWidth:360,
    fontSize:12,color:"#e2e8f0"
  }}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
      <span style={{fontWeight:700,color:done?"#34d399":"#2dd4bf"}}>
        {done?"✓ Vendor Sync Complete":"🔄 Vendor Sync Running…"}
      </span>
      <div style={{display:"flex",gap:6}}>
        {!done&&<button onClick={()=>{_vSync.abort=true;}}
          style={{background:"#7f1d1d",color:"#fca5a5",border:"none",borderRadius:4,
            padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>Stop</button>}
        <button onClick={()=>{onSwitchToItems();}}
          style={{background:"#1e3a5f",color:"#93c5fd",border:"none",borderRadius:4,
            padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>View</button>
        {done&&<button onClick={()=>{_vSync.result=null;_vSync.status=null;_vSyncNotify();}}
          style={{background:"transparent",color:"#94a3b8",border:"none",cursor:"pointer",
            fontSize:13,lineHeight:1,padding:"0 2px"}}>✕</button>}
      </div>
    </div>
    {st.total>0&&<div style={{color:"#94a3b8",fontSize:11}}>
      {st.searched||0}/{st.total} items
      {" · "}DK {st.dkWritten||0} written
      {" · "}Mouser {st.mouserWritten||0} written
      {st.errors>0&&<span style={{color:"#f59e0b"}}> · {st.errors} err</span>}
    </div>}
    {sync.error&&<div style={{color:"#f87171",fontSize:11}}>{sync.error}</div>}
  </div>);
}

export default PricingReportsModal;

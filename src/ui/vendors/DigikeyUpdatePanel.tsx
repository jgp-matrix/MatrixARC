import React, { useState } from 'react';
import { fbDb, _bcToken } from '@/core/globals';

declare const firebase: any;
declare const BC_ODATA_BASE: string;
declare const BC_MFR_CODE_NAMES: Record<string, string>;
declare function bcPushPurchasePrice(partNumber: string, vendor: string, price: number, date: number, uom: string): Promise<void>;

export default function DigikeyUpdatePanel({uid}: any){
  const [vendorNo,setVendorNo]=useState(()=>localStorage.getItem('_arc_dk_vendor')||'');
  const [running,setRunning]=useState(false);
  const [status,setStatus]=useState<any>(null);
  const [result,setResult]=useState<any>(null);
  const [error,setError]=useState<string|null>(null);
  const [showResults,setShowResults]=useState(false);

  function saveVendor(v: string){setVendorNo(v);localStorage.setItem('_arc_dk_vendor',v);}

  async function runUpdate(){
    if(!_bcToken){setError("Connect to Business Central first");return;}
    if(!vendorNo.trim()){setError("Enter a DigiKey vendor number from BC");return;}
    const vendor=vendorNo.trim();
    const _syncStart=Date.now();
    setRunning(true);setError(null);setResult(null);setStatus(null);setShowResults(false);

    try{
      // Step 1: Fetch all BC items
      setStatus({phase:"Fetching all BC items\u2026",fetched:0,total:0,searched:0,found:0,written:0,errors:0});
      const allItems: any[]=[];
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
        setStatus((prev: any)=>({...prev,phase:`Fetching BC items\u2026 ${allItems.length} so far`,fetched:allItems.length}));
        if(batch.length<200)break;
      }
      if(!allItems.length){setError("No items found in BC");setRunning(false);return;}
      setStatus((prev: any)=>({...prev,phase:`Found ${allItems.length} items. Searching DigiKey\u2026`,total:allItems.length}));

      // Step 2: Build items array with manufacturer names for MFR validation
      const searchItems=allItems.map((i: any)=>({
        partNumber:i.No,
        manufacturer:i.Manufacturer_Code?BC_MFR_CODE_NAMES[i.Manufacturer_Code]||null:null
      }));

      // Step 3: Search DigiKey in batches of 15
      const BATCH=15;
      const allResults: any[]=[];
      const fn=firebase.functions().httpsCallable("digikeySearch",{timeout:120000});
      for(let i=0;i<searchItems.length;i+=BATCH){
        const batch=searchItems.slice(i,i+BATCH);
        const batchNum=Math.floor(i/BATCH)+1;
        const totalBatches=Math.ceil(searchItems.length/BATCH);
        setStatus((prev: any)=>({...prev,phase:`DigiKey batch ${batchNum}/${totalBatches}\u2026`,
          detail:batch.map((b: any)=>b.partNumber).join(', ').slice(0,80)}));
        try{
          const r=await fn({items:batch});
          allResults.push(...(r.data.results||[]));
        }catch(e: any){
          console.error("DIGIKEY BATCH ERROR:",e.message);
          batch.forEach((b: any)=>allResults.push({partNumber:b.partNumber,found:false,error:e.message}));
        }
        const found=allResults.filter((r: any)=>r.found).length;
        const errors=allResults.filter((r: any)=>!r.found).length;
        setStatus((prev: any)=>({...prev,searched:allResults.length,found,errors}));
      }

      // Step 4: Write found prices to BC
      const priced=allResults.filter((r: any)=>r.found&&r.price>0);
      setStatus((prev: any)=>({...prev,phase:`Writing ${priced.length} prices to BC\u2026`,detail:""}));
      let written=0;
      for(const r of priced){
        try{
          await bcPushPurchasePrice(r.partNumber,vendor,r.price,Date.now(),r.uom||"EA");
          written++;
          setStatus((prev: any)=>({...prev,written}));
        }catch(e: any){
          console.warn("DigiKey BC price write failed:",r.partNumber,e.message);
        }
      }

      const durationMs=Date.now()-_syncStart;
      const finalErrors=allResults.filter((r: any)=>!r.found).length;
      setStatus({phase:"Complete",total:allItems.length,searched:allResults.length,found:priced.length,written,errors:finalErrors,detail:""});
      setResult({totalItems:allItems.length,found:priced.length,written,errors:finalErrors,durationMs,results:allResults});

      // Step 5: Save sync log
      try{
        await fbDb.collection(`users/${uid}/pricingSyncLog`).add({
          vendor:"DigiKey",runAt:Date.now(),totalItems:allItems.length,
          found:priced.length,errors:finalErrors,writtenToBC:written,durationMs,
          results:allResults.map((r: any)=>({partNumber:r.partNumber,found:!!r.found,price:r.price||null,
            manufacturer:r.manufacturer||null,error:r.error||null,mfrWarning:r.mfrWarning||null}))
        });
      }catch(e){console.warn("Failed to save DigiKey sync log:",e);}
    }catch(e: any){setError(e.message||"Update failed");}
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
        {running?"Updating\u2026":"Update All DigiKey Prices"}
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
        &#10003; {result.found} prices found, <strong>{result.written}</strong> written to BC
        <span style={{color:"#94a3b8",marginLeft:8}}>| {result.errors} not found | {Math.round(result.durationMs/1000)}s</span>
      </div>
      <button onClick={()=>setShowResults(v=>!v)}
        style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>
        {showResults?"Hide":"Show"} all results
      </button>
      {showResults&&<div style={{marginTop:6,maxHeight:300,overflowY:"auto"}}>
        {result.results.map((r: any,i: number)=><div key={i} style={{
          padding:"2px 0",fontSize:11,
          color:r.found?"#22c55e":r.error?.includes("mismatch")?"#f59e0b":"#475569"
        }}>
          {r.found?`\u2713 ${r.partNumber} \u2014 $${r.price?.toFixed(2)} | ${r.manufacturer||''}`:
           `\u2717 ${r.partNumber} \u2014 ${r.error||'not found'}`}
        </div>)}
      </div>}
    </div>}
  </div>);
}

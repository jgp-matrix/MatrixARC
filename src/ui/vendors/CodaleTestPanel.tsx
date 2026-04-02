import React, { useState } from 'react';
import { fbDb, _bcToken } from '@/core/globals';

declare const firebase: any;
declare const BC_ODATA_BASE: string;
declare function bcPushPurchasePrice(partNumber: string, vendor: string, price: number, date: number, uom: string): Promise<void>;

export default function CodaleTestPanel({uid}: any){
  const [parts,setParts]=useState("25B-D4P0N114, 5069-OB16, 1734-AENTR");
  const [results,setResults]=useState<any[]|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  // Full update state
  const [updating,setUpdating]=useState(false);
  const [updateStatus,setUpdateStatus]=useState<any>(null); // {phase,detail,scraped,written,total,errors}

  async function runTest(){
    setLoading(true);setError(null);setResults(null);
    try{
      const pns=parts.split(",").map(s=>s.trim()).filter(Boolean);
      if(!pns.length){setError("Enter at least one part number");setLoading(false);return;}
      const fn=firebase.functions().httpsCallable("codaleTestScrape",{timeout:300000});
      const r=await fn({partNumbers:pns});
      setResults(r.data.results||[]);
    }catch(e: any){setError(e.message||"Scrape failed");}
    setLoading(false);
  }

  async function runFullUpdate(){
    if(!_bcToken){setError("Connect to Business Central first");return;}
    const _syncStart=Date.now();
    setUpdating(true);setError(null);setResults(null);setUpdateStatus({phase:"Fetching Codale items from BC\u2026",detail:"",scraped:0,written:0,total:0,errors:0});
    try{
      // Step 1: Fetch all items with Vendor_No = V00165 from BC via OData ItemCard
      const allItems: any[]=[];
      let skip=0;
      while(true){
        const url=`${BC_ODATA_BASE}/ItemCard?$filter=Vendor_No eq 'V00165'&$select=No,Description,Vendor_No&$top=100&$skip=${skip}`;
        const r=await fetch(url,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok)break;
        const d=await r.json();
        const batch=d.value||[];
        if(!batch.length)break;
        allItems.push(...batch.map((i: any)=>({number:i.No,description:i.Description||""})));
        skip+=100;
        if(batch.length<100)break;
      }
      if(!allItems.length){setError("No items found with vendor V00165 in BC");setUpdating(false);setUpdateStatus(null);return;}
      setUpdateStatus({phase:`Found ${allItems.length} Codale items. Scraping prices\u2026`,detail:"This may take several minutes.",scraped:0,written:0,total:allItems.length,errors:0});

      // Step 2: Scrape in batches of 5 via Cloud Function
      const BATCH=5;
      const allResults: any[]=[];
      for(let i=0;i<allItems.length;i+=BATCH){
        const batch=allItems.slice(i,i+BATCH).map((it: any)=>it.number);
        const batchNum=Math.floor(i/BATCH)+1;
        const totalBatches=Math.ceil(allItems.length/BATCH);
        setUpdateStatus((prev: any)=>({...prev,phase:`Scraping batch ${batchNum}/${totalBatches}\u2026`,detail:batch.join(", ")}));
        try{
          const fn=firebase.functions().httpsCallable("codaleTestScrape",{timeout:300000});
          const r=await fn({partNumbers:batch});
          console.log("CODALE BATCH RESPONSE:",JSON.stringify(r.data));
          const batchResults=r.data.results||[];
          allResults.push(...batchResults);
          const scraped=allResults.length;
          const errors=allResults.filter((r: any)=>!r.found).length;
          setUpdateStatus((prev: any)=>({...prev,scraped,errors}));
        }catch(e: any){
          console.error("CODALE BATCH ERROR:",e.code,e.message,e.details,JSON.stringify(e));
          batch.forEach((pn: any)=>allResults.push({partNumber:pn,found:false,error:e.message}));
          setUpdateStatus((prev: any)=>({...prev,scraped:allResults.length,errors:allResults.filter((r: any)=>!r.found).length}));
        }
      }

      // Step 3: Write prices to BC Purchase Prices
      const found=allResults.filter((r: any)=>r.found&&r.price>0);
      setUpdateStatus((prev: any)=>({...prev,phase:`Writing ${found.length} prices to BC\u2026`,detail:""}));
      let written=0;
      for(const r of found){
        try{
          await bcPushPurchasePrice(r.partNumber,"V00165",r.price,Date.now(),r.uom||"EA");
          written++;
          setUpdateStatus((prev: any)=>({...prev,written}));
        }catch(e: any){
          console.warn("BC price write failed:",r.partNumber,e.message);
        }
      }

      const finalErrors=allResults.filter((r: any)=>!r.found).length;
      setUpdateStatus({phase:"Complete",detail:`Scraped ${allResults.length} items, ${found.length} prices found, ${written} written to BC.`,scraped:allResults.length,written,total:allItems.length,errors:finalErrors});
      setResults(allResults);
      // Save sync log to Firestore
      try{
        await fbDb.collection(`users/${uid}/pricingSyncLog`).add({
          vendor:"Codale",runAt:Date.now(),totalItems:allItems.length,
          found:found.length,errors:finalErrors,writtenToBC:written,
          durationMs:Date.now()-_syncStart,
          results:allResults.map((r: any)=>({partNumber:r.partNumber,found:!!r.found,price:r.price||null,uom:r.uom||null,availability:r.availability||null,manufacturer:r.manufacturer||null,productName:r.productName||null,error:r.error||null}))
        });
      }catch(e){console.warn("Failed to save pricing sync log:",e);}
    }catch(e: any){setError(e.message||"Update failed");}
    setUpdating(false);
  }

  return(<div>
    {/* Test scrape */}
    <input value={parts} onChange={e=>setParts(e.target.value)} placeholder="Part numbers, comma-separated"
      style={{width:"100%",boxSizing:"border-box",background:"#111",border:`1px solid #333`,borderRadius:6,padding:"8px 10px",color:"#e2e8f0",fontSize:12,marginBottom:8,fontFamily:"inherit"}}/>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <button onClick={runTest} disabled={loading||updating}
        style={{background:loading?"#334155":"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:loading?"wait":"pointer",opacity:loading?0.7:1,fontFamily:"inherit"}}>
        {loading?"Scraping\u2026":"Test Scrape"}
      </button>
      <button onClick={runFullUpdate} disabled={loading||updating}
        style={{background:updating?"#334155":"#16a34a",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:updating?"wait":"pointer",opacity:updating?0.7:1,fontFamily:"inherit"}}>
        {updating?"Updating\u2026":"Update All Codale Prices"}
      </button>
    </div>
    {/* Progress */}
    {updateStatus&&<div style={{background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.25)",borderRadius:6,padding:"8px 10px",marginBottom:8,fontSize:12}}>
      <div style={{fontWeight:600,color:"#60a5fa"}}>{updateStatus.phase}</div>
      {updateStatus.detail&&<div style={{color:"#94a3b8",marginTop:2}}>{updateStatus.detail}</div>}
      {updateStatus.total>0&&<div style={{color:"#94a3b8",marginTop:4,display:"flex",gap:12}}>
        <span>Scraped: {updateStatus.scraped}/{updateStatus.total}</span>
        <span style={{color:"#22c55e"}}>Written: {updateStatus.written}</span>
        {updateStatus.errors>0&&<span style={{color:"#ef4444"}}>Errors: {updateStatus.errors}</span>}
      </div>}
    </div>}
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:8}}>{error}</div>}
    {results&&<div style={{marginTop:10,maxHeight:400,overflowY:"auto"}}>
      {results.map((r: any,i: number)=><div key={i} style={{background:r.found?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`1px solid ${r.found?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:6,padding:"8px 10px",marginBottom:4,fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:700,color:r.found?"#22c55e":"#ef4444"}}>{r.partNumber}</span>
          {r.found?<span style={{color:"#22c55e",fontWeight:700}}>${r.price.toLocaleString("en-US",{minimumFractionDigits:2})}/{r.uom||"EA"}</span>
          :<span style={{color:"#94a3b8"}}>{r.error||"Not found"}{r.debug&&<div style={{color:"#94a3b8",fontSize:10,marginTop:2,whiteSpace:"pre-wrap",maxHeight:60,overflow:"hidden"}}>{r.debug}</div>}</span>}
          {r.availability&&<span style={{color:"#94a3b8",fontSize:11,marginLeft:"auto"}}>{r.availability}</span>}
        </div>
      </div>)}
    </div>}
  </div>);
}

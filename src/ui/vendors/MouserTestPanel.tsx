import React, { useState } from 'react';

declare const firebase: any;

export default function MouserTestPanel({uid}: any){
  const [parts,setParts]=useState("");
  const [results,setResults]=useState<any[]|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function runTest(){
    setLoading(true);setError(null);setResults(null);
    try{
      const pns=parts.split(",").map(s=>s.trim()).filter(Boolean);
      if(!pns.length){setError("Enter at least one part number");setLoading(false);return;}
      const fn=firebase.functions().httpsCallable("mouserSearch",{timeout:120000});
      const r=await fn({partNumbers:pns});
      setResults(r.data.results||[]);
    }catch(e: any){setError(e.message||"Search failed");}
    setLoading(false);
  }

  return(<div>
    <input value={parts} onChange={e=>setParts(e.target.value)} placeholder="Part numbers, comma-separated"
      style={{width:"100%",boxSizing:"border-box",background:"#111",border:`1px solid #333`,borderRadius:6,padding:"8px 10px",color:"#e2e8f0",fontSize:12,marginBottom:8,fontFamily:"inherit"}}/>
    <button onClick={runTest} disabled={loading}
      style={{background:loading?"#334155":"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:loading?"wait":"pointer",opacity:loading?0.7:1,fontFamily:"inherit"}}>
      {loading?"Searching\u2026":"Search Mouser"}
    </button>
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:8}}>{error}</div>}
    {results&&<div style={{marginTop:10,maxHeight:400,overflowY:"auto"}}>
      {results.map((r: any,i: number)=><div key={i} style={{background:r.found?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`1px solid ${r.found?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:6,padding:"8px 10px",marginBottom:4,fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:r.found?"#22c55e":"#ef4444"}}>{r.partNumber}</span>
          {r.found?<>
            <span style={{color:"#22c55e",fontWeight:700}}>${r.price.toLocaleString("en-US",{minimumFractionDigits:2})}</span>
            {r.manufacturer&&<span style={{color:"#94a3b8"}}>| {r.manufacturer}</span>}
            {r.availability&&<span style={{color:"#94a3b8"}}>| {r.availability}</span>}
            {r.leadTime&&<span style={{color:"#94a3b8"}}>| Lead: {r.leadTime}</span>}
          </>:<span style={{color:"#94a3b8"}}>{r.error||"Not found"}</span>}
        </div>
        {r.found&&r.description&&<div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>{r.description}</div>}
        {r.found&&r.priceBreaks&&r.priceBreaks.length>1&&<div style={{color:"#94a3b8",fontSize:10,marginTop:2}}>
          Price breaks: {r.priceBreaks.map((pb: any)=>`${pb.quantity}+: $${pb.price.toFixed(2)}`).join(" | ")}
        </div>}
      </div>)}
    </div>}
  </div>);
}

import React, { useState, useEffect } from 'react';
import { fbDb, _bcToken } from '@/core/globals';
import { useVendorSyncState, startVendorSync, _vSync, _vSyncNotify } from './useVendorSyncState';

declare const BC_ODATA_BASE: string;
import { discoverODataPages as bcDiscoverODataPages } from '@/services/businessCentral/client';

export default function VendorPricingSyncPanel({uid}: any){
  const[dkVendor,setDkVendor]=useState('');
  const[mouserVendor,setMouserVendor]=useState('');
  const[vendors,setVendors]=useState<any[]>([]); // [{No,Name}] from BC
  const[loadingVendors,setLoadingVendors]=useState(false);
  const[vendorLoadErr,setVendorLoadErr]=useState<string|null>(null);
  const[showLog,setShowLog]=useState(false);
  const sync=useVendorSyncState();

  // Load vendor config from Firestore + auto-detect from BC on mount
  useEffect(()=>{
    if(!uid)return;
    fbDb.doc(`users/${uid}/config/vendorConfig`).get().then((d: any)=>{
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
    if(!_bcToken){setVendorLoadErr("Not connected to Business Central \u2014 connect first then retry.");return;}
    setLoadingVendors(true);
    setVendorLoadErr(null);
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find((n: string)=>/^vendor/i.test(n))||'Vendor';
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
      setVendorLoadErr(partsFiltered?null:`\u2139 PARTS posting group not set up yet \u2014 showing all ${list.length} vendors.`);
      // Auto-detect DigiKey and Mouser by name
      const norm=(s: string)=>(s||'').toLowerCase().replace(/[\s\-\.]/g,'');
      const dk=list.find((v: any)=>norm(v.Name).includes('digikey'));
      const mo=list.find((v: any)=>norm(v.Name).includes('mouser'));
      if(dk)setDkVendor(prev=>prev||dk.No);
      if(mo)setMouserVendor(prev=>prev||mo.No);
      if(!dk&&!mo)console.log("VendorSync: no DigiKey/Mouser found:",list.map((v: any)=>v.Name));
    }catch(e: any){
      setVendorLoadErr(`Error loading vendors: ${e.message}`);
      console.warn("fetchVendors error:",e);
    }
    setLoadingVendors(false);
  }

  async function saveVendors(dk?: string,m?: string){
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
    if(!dkVendor.trim()&&!mouserVendor.trim()){alert("No vendor IDs set \u2014 connect to BC to auto-detect, or select manually");return;}
    startVendorSync(uid,dkVendor.trim(),mouserVendor.trim());
  }

  const{running,status,result,error}=sync;
  const statusColor=status?.phase==="Complete"?"#22c55e":"#94a3b8";
  const norm=(s: string)=>(s||'').toLowerCase().replace(/[\s\-\.]/g,'');
  const dkMatch=vendors.find((v: any)=>norm(v.Name).includes('digikey'));
  const moMatch=vendors.find((v: any)=>norm(v.Name).includes('mouser'));

  return(<div>
    <div style={{fontSize:12,color:"#94a3b8",marginBottom:10,lineHeight:1.6}}>
      Searches all BC items on DigiKey and Mouser with manufacturer validation and writes
      prices to BC as alternate vendor purchase prices. Runs in the background — you can
      switch tabs while it runs.
    </div>
    {/* Vendor load status */}
    {vendorLoadErr&&<div style={{marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
      <span style={{fontSize:12,color:"#f87171"}}>{"\u26A0"} {vendorLoadErr}</span>
      <button onClick={fetchVendors} disabled={loadingVendors}
        style={{background:"#1e3a5f",color:"#93c5fd",border:"1px solid #3b6aad",borderRadius:4,
          padding:"3px 10px",fontSize:11,cursor:"pointer",fontWeight:600}}>
        {loadingVendors?"Loading\u2026":"\u21BA Retry"}
      </button>
    </div>}
    {loadingVendors&&!vendorLoadErr&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>Loading BC vendors\u2026</div>}

    <div style={{display:"flex",gap:10,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
      {/* DigiKey vendor selector */}
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>DigiKey Vendor:</span>
        {vendors.length>0?(
          <select value={dkVendor} onChange={e=>saveVendors(e.target.value,undefined)} disabled={running}
            style={{background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:dkVendor?"#e2e8f0":"#475569",fontSize:12,fontFamily:"inherit",minWidth:160}}>
            <option value="">— not set —</option>
            {vendors.map((v: any)=><option key={v.No} value={v.No}>{v.No} — {v.Name}</option>)}
          </select>
        ):(
          <input value={dkVendor} onChange={e=>saveVendors(e.target.value,undefined)} disabled={running}
            placeholder={loadingVendors?"Loading\u2026":"Enter vendor No manually"}
            style={{width:160,background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
        )}
        {dkMatch&&dkVendor===dkMatch.No&&<span style={{fontSize:11,color:"#22c55e"}}>{"\u2713"} auto-detected</span>}
      </div>
      {/* Mouser vendor selector */}
      <div style={{display:"flex",gap:6,alignItems:"center"}}>
        <span style={{fontSize:11,color:"#94a3b8",whiteSpace:"nowrap"}}>Mouser Vendor:</span>
        {vendors.length>0?(
          <select value={mouserVendor} onChange={e=>saveVendors(undefined,e.target.value)} disabled={running}
            style={{background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:mouserVendor?"#e2e8f0":"#475569",fontSize:12,fontFamily:"inherit",minWidth:160}}>
            <option value="">— not set —</option>
            {vendors.map((v: any)=><option key={v.No} value={v.No}>{v.No} — {v.Name}</option>)}
          </select>
        ):(
          <input value={mouserVendor} onChange={e=>saveVendors(undefined,e.target.value)} disabled={running}
            placeholder={loadingVendors?"Loading\u2026":"Enter vendor No manually"}
            style={{width:160,background:"#111",border:"1px solid #333",borderRadius:4,padding:"5px 8px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
        )}
        {moMatch&&mouserVendor===moMatch.No&&<span style={{fontSize:11,color:"#22c55e"}}>{"\u2713"} auto-detected</span>}
      </div>
      {/* Manual reload button (always visible so user can re-fetch if needed) */}
      {!loadingVendors&&<button onClick={fetchVendors} title="Reload vendor list from BC"
        style={{background:"none",border:"1px solid #334155",borderRadius:4,
          padding:"4px 8px",fontSize:11,color:"#94a3b8",cursor:"pointer"}}>{"\u21BA"}</button>}
      <button onClick={running?()=>{_vSync.abort=true;}:handleStart}
        style={{background:running?"#7f1d1d":"#0d9488",color:"#fff",border:"none",borderRadius:6,
          padding:"7px 18px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
        {running?"\u23F9 Stop":"\uD83D\uDD04 Sync DigiKey & Mouser Prices"}
      </button>
    </div>
    {status&&<div style={{fontSize:12,marginBottom:6}}>
      <span style={{color:statusColor,fontWeight:600}}>{status.phase}</span>
      {status.total>0&&<span style={{color:"#94a3b8",marginLeft:8}}>
        {status.searched||0}/{status.total} searched
        {" \u00B7 "}DK: {status.dkFound||0}/{status.dkWritten||0} written
        {" \u00B7 "}Mouser: {status.mouserFound||0}/{status.mouserWritten||0} written
        {status.errors>0&&<span style={{color:"#f59e0b"}}> {"\u00B7"} {status.errors} errors</span>}
      </span>}
      {status.detail&&<div style={{color:"#94a3b8",fontSize:11,marginTop:2,fontFamily:"monospace"}}>{status.detail}</div>}
    </div>}
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:6}}>{error}</div>}
    {result&&<div style={{marginTop:8,fontSize:12}}>
      <div style={{color:"#22c55e",marginBottom:4}}>
        {"\u2713"} Complete — DigiKey: <strong>{result.dkWritten}</strong> {"\u00B7"} Mouser: <strong>{result.mouserWritten}</strong> written to BC
        <span style={{color:"#94a3b8",marginLeft:8}}>| {result.errors} errors | {Math.round(result.durationMs/1000)}s</span>
      </div>
      <button onClick={()=>setShowLog(v=>!v)}
        style={{background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>
        {showLog?"Hide":"Show"} Results ({result.results.length} items)
      </button>
      {showLog&&<div style={{marginTop:6,maxHeight:300,overflowY:"auto",fontSize:11,fontFamily:"monospace"}}>
        {result.results.map((r: any,i: number)=>{
          const dk=r.digikey||{};const mo=r.mouser||{};
          const hasDk=dk.found&&dk.price>0;const hasMo=mo.found&&mo.price>0;
          if(!hasDk&&!hasMo)return null;
          return(<div key={i} style={{padding:"1px 0",color:hasDk&&hasMo?"#34d399":hasDk?"#93c5fd":hasMo?"#fbbf24":"#475569"}}>
            {r.partNumber}
            {hasDk&&<span style={{color:"#93c5fd"}}> {"\u00B7"} DK ${dk.price?.toFixed(2)} ({dk.manufacturer||'?'})</span>}
            {hasMo&&<span style={{color:"#fbbf24"}}> {"\u00B7"} Mouser ${mo.price?.toFixed(2)} ({mo.manufacturer||'?'})</span>}
          </div>);
        })}
      </div>}
    </div>}
  </div>);
}

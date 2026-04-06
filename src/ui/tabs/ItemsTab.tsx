// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION, setBcToken } from '@/core/globals';

function ItemsTab({uid}){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(false);
  const [search,setSearch]=useState("");
  const [skip,setSkip]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [editingMfr,setEditingMfr]=useState(null); // {no, val}
  const [savingMfr,setSavingMfr]=useState(null);
  const [error,setError]=useState(null);
  const [showVendorSync,setShowVendorSync]=useState(false);
  const [manufacturers,setManufacturers]=useState([]);
  const [vendorMap,setVendorMap]=useState({});
  const [priceDateMap,setPriceDateMap]=useState({}); // {itemNo: mostRecentStartingDateMs}
  const [showMfrLookup,setShowMfrLookup]=useState(false);
  const [mfrLookupRunning,setMfrLookupRunning]=useState(false);
  const [mfrLookupResult,setMfrLookupResult]=useState(null);
  const [mfrLookupProgress,setMfrLookupProgress]=useState("");
  const PAGE=100;

  async function fetchPurchasePriceDates(itemNos){
    if(!_bcToken||!itemNos.length)return;
    try{
      const allPages=await bcDiscoverODataPages();
      const ppPage=allPages.find(p=>/purchaseprice/i.test(p));
      if(!ppPage){console.warn('ItemsTab: PurchasePrice OData page not found');return;}
      // Batch into groups of 15 to stay within URL limits
      const BATCH=15;
      const map={};
      const batches=[];
      for(let i=0;i<itemNos.length;i+=BATCH)batches.push(itemNos.slice(i,i+BATCH));
      await Promise.all(batches.map(async batch=>{
        const f=batch.map(n=>`Item_No eq '${n.replace(/'/g,"''")}'`).join(' or ');
        const r=await fetch(
          `${BC_ODATA_BASE}/${ppPage}?$select=Item_No,Starting_Date&$filter=(${f})&$top=500`,
          {headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok)return;
        const rows=(await r.json()).value||[];
        for(const row of rows){
          if(!row.Starting_Date)continue;
          const ms=new Date(row.Starting_Date).getTime();
          if(!map[row.Item_No]||ms>map[row.Item_No])map[row.Item_No]=ms;
        }
      }));
      setPriceDateMap(prev=>({...prev,...map}));
    }catch(e){console.warn('fetchPurchasePriceDates:',e);}
  }

  // ── Column resize ──
  const COL_LS_KEY='arc_items_col_widths';
  const COL_DEFAULTS=[110,340,140,160,100,120]; // ITEM NO, DESC, MFR, VENDOR, LAST COST, PRICED DATE
  const [colWidths,setColWidths]=useState(()=>{
    try{const s=JSON.parse(localStorage.getItem(COL_LS_KEY));if(s&&s.length===6)return s;}catch{}
    return COL_DEFAULTS;
  });
  const colResizing=useRef(null);
  function onColResizeStart(e,colIdx){
    e.preventDefault();
    const startX=e.clientX,startW=colWidths[colIdx];
    colResizing.current={colIdx,startX,startW};
    function onMove(ev){
      if(!colResizing.current)return;
      const newW=Math.max(48,startW+(ev.clientX-startX));
      setColWidths(prev=>{const n=[...prev];n[colIdx]=newW;return n;});
    }
    function onUp(){
      setColWidths(prev=>{localStorage.setItem(COL_LS_KEY,JSON.stringify(prev));return prev;});
      colResizing.current=null;
      document.removeEventListener('mousemove',onMove);
      document.removeEventListener('mouseup',onUp);
    }
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
  }

  useEffect(()=>{if(_bcToken){
    load(0,"");
    bcFetchManufacturers().then(setManufacturers);
    bcFetchVendorMap().then(setVendorMap);
  }},[]);

  // Live search — debounced 350ms
  useEffect(()=>{
    if(!_bcToken)return;
    const t=setTimeout(()=>load(0,search),350);
    return()=>clearTimeout(t);
  },[search]);

  async function load(sk,q){
    setLoading(true);setError(null);
    const base=`${BC_ODATA_BASE}/ItemCard?$select=No,Description,Manufacturer_Code,Vendor_No,Last_Direct_Cost&$top=${PAGE}&$orderby=No asc`;
    const hdrs={"Authorization":`Bearer ${_bcToken}`};
    try{
      if(q&&q.trim()){
        // Two parallel queries — BC doesn't support OR across field types
        const s=q.trim().replace(/'/g,"''");
        const [rNo,rDesc]=await Promise.all([
          fetch(`${base}&$filter=startswith(No,'${s}')`,{headers:hdrs}),
          fetch(`${base}&$filter=contains(Description,'${s}')`,{headers:hdrs})
        ]);
        const noItems=rNo.ok?(await rNo.json()).value||[]:[];
        const descItems=rDesc.ok?(await rDesc.json()).value||[]:[];
        const seen=new Set();
        const merged=[...noItems,...descItems].filter(i=>{if(seen.has(i.No))return false;seen.add(i.No);return true;});
        setItems(merged);
        setHasMore(false);
        fetchPurchasePriceDates(merged.map(i=>i.No));
      }else{
        const r=await fetch(`${base}&$skip=${sk}`,{headers:hdrs});
        if(!r.ok)throw new Error(`BC ${r.status}`);
        const batch=(await r.json()).value||[];
        if(sk===0)setItems(batch);
        else setItems(prev=>[...prev,...batch]);
        setHasMore(batch.length===PAGE);
        setSkip(sk);
        fetchPurchasePriceDates(batch.map(i=>i.No));
      }
    }catch(e){setError(e.message);}
    setLoading(false);
  }

  function doSearch(){load(0,search);}

  async function saveMfr(no,val){
    setSavingMfr(no);
    try{
      const code=val.trim().slice(0,10).toUpperCase();
      if(!code){await bcPatchItemOData(no,{Manufacturer_Code:''});setItems(prev=>prev.map(i=>i.No===no?{...i,Manufacturer_Code:''}:i));setSavingMfr(null);return;}
      // Ensure manufacturer record exists in BC before patching item
      const allPages=await bcDiscoverODataPages();
      const mPage=allPages.find(n=>n==='Manufacturer'||n==='Manufacturers');
      if(mPage){
        const chk=await fetch(`${BC_ODATA_BASE}/${mPage}?$filter=Code eq '${code}'&$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(chk.ok){
          const existing=(await chk.json()).value||[];
          if(!existing.length){
            const mfrName=BC_MFR_MAP.find(m=>m.code===code)?.terms[0]||code;
            const name=mfrName.split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ');
            await fetch(`${BC_ODATA_BASE}/${mPage}`,{method:'POST',headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json"},body:JSON.stringify({Code:code,Name:name})});
          }
        }
      }
      await bcPatchItemOData(no,{Manufacturer_Code:code});
      setItems(prev=>prev.map(i=>i.No===no?{...i,Manufacturer_Code:code}:i));
      _bcManufacturers=null; // refresh dropdown on next load
      setEditingMfr(null);
    }catch(e){setError("Save failed: "+e.message);}
    setSavingMfr(null);
  }

  if(!_bcToken)return(<div style={{padding:48,textAlign:"center"}}>
    <div style={{fontSize:40,marginBottom:12,opacity:0.4}}>📦</div>
    <div style={{color:C.muted,fontSize:14}}>Connect to Business Central to browse items.</div>
  </div>);

  return(<div style={{padding:"20px 32px",maxWidth:1600,margin:"0 auto",boxSizing:"border-box"}}>
    {/* Toolbar */}
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
      <h2 style={{margin:0,fontSize:20,fontWeight:800,color:C.text,letterSpacing:0.5}}>Items</h2>
      <div style={{flex:1,minWidth:180,maxWidth:380,display:"flex",gap:6}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search by item no or description…"
          style={{flex:1,...inp(),padding:"6px 10px",fontSize:13,fontFamily:"inherit"}}/>
        {loading&&<span style={{color:C.muted,fontSize:12,whiteSpace:"nowrap",alignSelf:"center"}}>searching…</span>}
      </div>
      <button onClick={()=>setShowVendorSync(v=>!v)}
        style={{background:showVendorSync?C.teal:C.accentDim,color:showVendorSync?"#fff":C.accent,
          border:`1px solid ${showVendorSync?C.teal:C.accent}`,borderRadius:6,padding:"6px 14px",fontSize:12,
          fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
        🔄 Sync Pricing
      </button>
      <button onClick={()=>setShowMfrLookup(v=>!v)}
        style={{background:showMfrLookup?C.accent:C.accentDim,color:"#fff",
          border:`1px solid ${showMfrLookup?C.accent:C.border}`,borderRadius:6,padding:"6px 14px",fontSize:12,
          fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
        🔍 Lookup MFR Codes
      </button>
    </div>

    {/* Collapsible panels */}
    {showVendorSync&&<div style={{...card(),marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>🔄 DigiKey & Mouser Vendor Pricing Sync</div>
      <VendorPricingSyncPanel uid={uid}/>
    </div>}
    {showMfrLookup&&<div style={{...card(),marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>🔍 Bulk MFR Code Lookup (DigiKey + Mouser)</div>
      <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.6}}>
        Finds BC items with empty Manufacturer Code, looks up each part number on DigiKey/Mouser to identify the manufacturer, then pushes the BC manufacturer code back to the Item Card.
      </div>
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:12}}>
        <button disabled={mfrLookupRunning} onClick={async()=>{
          setMfrLookupRunning(true);setMfrLookupResult(null);setMfrLookupProgress("Fetching items from BC…");
          try{
            const listFn=firebase.functions().httpsCallable('bulkMfrList',{timeout:300000});
            const listR=await listFn({bcToken:_bcToken,bcODataBase:BC_ODATA_BASE});
            const allItems=listR.data.items||[];
            setMfrLookupProgress(`Found ${allItems.length} items. Looking up MFR (dry run)…`);
            const BATCH=3;const allResults=[];const allUnknown=[];
            const lookupFn=firebase.functions().httpsCallable('bulkMfrLookup',{timeout:300000});
            for(let i=0;i<allItems.length;i+=BATCH){
              const batch=allItems.slice(i,i+BATCH);
              setMfrLookupProgress(`Dry run: ${i+1}–${Math.min(i+BATCH,allItems.length)} of ${allItems.length}…`);
              const r=await lookupFn({bcToken:_bcToken,bcODataBase:BC_ODATA_BASE,dryRun:true,items:batch});
              allResults.push(...(r.data.results||[]));
              allUnknown.push(...(r.data.unknownMfr||[]));
            }
            setMfrLookupResult({totalInBC:allItems.length,found:allResults.filter(r=>r.manufacturer).length,notFound:allResults.filter(r=>r.status==='not_found').length,patched:0,unknownMfr:allUnknown,results:allResults,allItems});
            setMfrLookupProgress("");
          }catch(e){setMfrLookupProgress("Error: "+e.message);}
          setMfrLookupRunning(false);
        }} style={btn(mfrLookupRunning?C.border:C.accentDim,C.accent,{fontSize:12,fontWeight:600,border:`1px solid ${C.accent}55`})}>
          {mfrLookupRunning?"Running…":"Preview (Dry Run)"}
        </button>
        <button disabled={mfrLookupRunning||!mfrLookupResult} onClick={async()=>{
          if(!confirm("This will write Manufacturer Codes to BC for all matched items. Continue?"))return;
          setMfrLookupRunning(true);
          try{
            const matchedItems=(mfrLookupResult.results||[]).filter(r=>r.code).map(r=>({no:r.itemNo,desc:r.desc}));
            const BATCH=3;const allResults=[];let totalPatched=0;
            const lookupFn=firebase.functions().httpsCallable('bulkMfrLookup',{timeout:300000});
            for(let i=0;i<matchedItems.length;i+=BATCH){
              const batch=matchedItems.slice(i,i+BATCH);
              setMfrLookupProgress(`Pushing ${i+1}–${Math.min(i+BATCH,matchedItems.length)} of ${matchedItems.length}…`);
              const r=await lookupFn({bcToken:_bcToken,bcODataBase:BC_ODATA_BASE,dryRun:false,items:batch});
              allResults.push(...(r.data.results||[]));
              totalPatched+=r.data.patched||0;
            }
            setMfrLookupResult(prev=>({...prev,results:allResults,patched:totalPatched}));
            setMfrLookupProgress(`Done! Patched ${totalPatched} items.`);
          }catch(e){setMfrLookupProgress("Error: "+e.message);}
          setMfrLookupRunning(false);
        }} style={btn(mfrLookupRunning||!mfrLookupResult?C.border:C.greenDim,mfrLookupResult?C.green:C.muted,{fontSize:12,fontWeight:600,border:`1px solid ${mfrLookupResult?C.green:C.border}`})}>
          Push to BC
        </button>
        {mfrLookupProgress&&<span style={{fontSize:11,color:mfrLookupProgress.startsWith("Error")?C.red:C.accent}}>{mfrLookupProgress}</span>}
      </div>
      {mfrLookupResult&&<div>
        <div style={{fontSize:12,color:C.muted,marginBottom:8}}>
          {mfrLookupResult.totalInBC} items missing MFR in BC · Found: {mfrLookupResult.found} · Not found: {mfrLookupResult.notFound} · Patched: {mfrLookupResult.patched||0}
        </div>
        {mfrLookupResult.unknownMfr?.length>0&&<div style={{marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:C.yellow,marginBottom:4}}>Unknown manufacturers (no BC code mapping):</div>
          {mfrLookupResult.unknownMfr.map((u,i)=><div key={i} style={{fontSize:11,color:C.muted}}>{u.itemNo} → {u.manufacturer}</div>)}
        </div>}
        <div style={{maxHeight:300,overflowY:"auto",border:`1px solid ${C.border}`,borderRadius:6}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead><tr style={{background:C.bg}}>
              <th style={{padding:"5px 8px",textAlign:"left",color:C.sub,fontWeight:700}}>ITEM</th>
              <th style={{padding:"5px 8px",textAlign:"left",color:C.sub,fontWeight:700}}>MANUFACTURER</th>
              <th style={{padding:"5px 8px",textAlign:"left",color:C.sub,fontWeight:700}}>CODE</th>
              <th style={{padding:"5px 8px",textAlign:"left",color:C.sub,fontWeight:700}}>SOURCE</th>
              <th style={{padding:"5px 8px",textAlign:"left",color:C.sub,fontWeight:700}}>STATUS</th>
            </tr></thead>
            <tbody>{(mfrLookupResult.results||[]).map((r,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:r.status==="patched"||r.status==="dry_run"?"rgba(34,197,94,0.06)":r.status==="not_found"?"rgba(239,68,68,0.06)":"rgba(251,191,36,0.06)"}}>
                <td style={{padding:"4px 8px",color:C.accent,fontFamily:"monospace"}}>{r.itemNo}</td>
                <td style={{padding:"4px 8px",color:C.text}}>{r.manufacturer||"—"}</td>
                <td style={{padding:"4px 8px",color:r.code?C.green:C.red,fontWeight:700}}>{r.code||"—"}</td>
                <td style={{padding:"4px 8px",color:C.muted}}>{r.source||"—"}</td>
                <td style={{padding:"4px 8px",color:r.status==="patched"?C.green:r.status==="not_found"?C.red:C.yellow}}>{r.status}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>}
    </div>}

    {error&&<div style={{color:C.red,fontSize:12,marginBottom:10}}>{error}</div>}

    {/* Two-column layout: Items left, Vendors right */}
    <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>

      {/* LEFT — Items table */}
      <div style={{flex:"0 0 75%",minWidth:0,maxHeight:"calc(100vh - 240px)",overflowY:"auto"}}>
        <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,tableLayout:"fixed"}}>
            <colgroup>{colWidths.map((w,i)=><col key={i} style={{width:w}}/>)}</colgroup>
            <thead>
              <tr style={{background:C.bg,borderBottom:`2px solid ${C.border}`}}>
                {["ITEM NO","DESCRIPTION","MFR CODE","VENDOR","LAST COST","PRICED DATE"].map((h,i)=>(
                  <th key={h} style={{position:"relative",padding:"9px 12px",
                    textAlign:i===4?"right":"left",
                    color:C.sub,fontWeight:700,fontSize:11,letterSpacing:1,
                    whiteSpace:"nowrap",userSelect:"none",overflow:"hidden"}}>
                    {h}
                    {/* Resize handle */}
                    <div onMouseDown={e=>onColResizeStart(e,i)}
                      onDoubleClick={()=>{setColWidths(prev=>{const n=[...prev];n[i]=COL_DEFAULTS[i];localStorage.setItem(COL_LS_KEY,JSON.stringify(n));return n;});}}
                      style={{position:"absolute",right:0,top:0,height:"100%",width:6,
                        cursor:"col-resize",zIndex:2,
                        background:"transparent",
                        borderRight:"2px solid transparent",
                        transition:"border-color 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderRightColor=C.accent}
                      onMouseLeave={e=>e.currentTarget.style.borderRightColor="transparent"}
                      title="Drag to resize · Double-click to reset"/>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item,idx)=>{
                const priceMs=priceDateMap[item.No]??null;
                const daysSince=priceMs!=null
                  ?Math.floor((Date.now()-priceMs)/(1000*60*60*24))
                  :null;
                const priceColor=daysSince===null?C.red:daysSince<=30?C.green:C.red;
                const priceBold=700; // always bold — red when no/stale date, green when fresh
                const pricedDate=priceMs!=null
                  ?new Date(priceMs).toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"2-digit"})
                  :"—";
                const vendorName=vendorMap[item.Vendor_No]||item.Vendor_No||"—";
                return(
                <tr key={item.No} style={{borderBottom:`1px solid ${C.border}`,
                  background:idx%2===0?C.card:C.bg}}>
                  <td style={{padding:"7px 12px",color:C.accent,fontFamily:"monospace",fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.No}</td>
                  <td style={{padding:"7px 12px",color:C.text,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    title={item.Description}>{item.Description}</td>
                  <td style={{padding:"4px 12px",whiteSpace:"nowrap"}}>
                    {manufacturers.length>0?(
                      editingMfr?.no===item.No?(
                        <select value={editingMfr.val||""} autoFocus
                          onChange={e=>{const v=e.target.value;setEditingMfr(null);saveMfr(item.No,v);}}
                          onBlur={()=>{setTimeout(()=>setEditingMfr(prev=>prev?.no===item.No?null:prev),150);}}
                          style={{background:C.input,border:`1px solid ${C.accent}`,
                            borderRadius:4,padding:"3px 6px",
                            color:C.text,
                            fontSize:11,fontFamily:"inherit",width:"100%",maxWidth:120,cursor:"pointer"}}>
                          <option value="">— none —</option>
                          {manufacturers.map(m=><option key={m.Code} value={m.Code}>{m.Code} — {m.Name}</option>)}
                        </select>
                      ):(
                        <span onClick={()=>setEditingMfr({no:item.No,val:item.Manufacturer_Code||""})}
                          style={{cursor:"pointer",display:"inline-block",padding:"2px 7px",
                            borderRadius:4,border:"1px solid transparent",fontSize:12,
                            color:item.Manufacturer_Code?C.accent:C.muted,
                            background:item.Manufacturer_Code?C.accentDim:"transparent",
                            fontWeight:item.Manufacturer_Code?700:400}}
                          title={item.Manufacturer_Code?manufacturers.find(m=>m.Code===item.Manufacturer_Code)?.Name||"Click to change":"Click to set"}>
                          {savingMfr===item.No?"…":item.Manufacturer_Code||"—"}
                        </span>
                      )
                    ):(
                      <span onClick={()=>setEditingMfr({no:item.No,val:item.Manufacturer_Code||""})}
                        title="Click to edit"
                        style={{cursor:"pointer",display:"inline-block",minWidth:52,padding:"2px 7px",
                          borderRadius:4,border:"1px solid transparent",fontSize:13,
                          color:item.Manufacturer_Code?C.accent:C.muted,
                          background:item.Manufacturer_Code?C.accentDim:"transparent",
                          fontWeight:item.Manufacturer_Code?600:400}}>
                        {editingMfr?.no===item.No?(
                          <input value={editingMfr.val}
                            onChange={e=>setEditingMfr({no:item.No,val:e.target.value})}
                            onKeyDown={e=>{if(e.key==="Enter")saveMfr(item.No,editingMfr.val);if(e.key==="Escape")setEditingMfr(null);}}
                            maxLength={10} autoFocus
                            style={{width:80,background:C.input,border:`1px solid ${C.accent}`,borderRadius:4,
                              padding:"3px 6px",color:C.text,fontSize:13,fontFamily:"inherit",textTransform:"uppercase"}}/>
                        ):item.Manufacturer_Code||"—"}
                      </span>
                    )}
                  </td>
                  <td style={{padding:"7px 12px",fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}
                    title={vendorName!==item.Vendor_No?`${item.Vendor_No} — ${vendorName}`:vendorName}>
                    <span style={{color:C.muted}}>{vendorName}</span>
                  </td>
                  <td style={{padding:"7px 12px",textAlign:"right",fontFamily:"monospace",fontSize:13,whiteSpace:"nowrap",
                    color:item.Last_Direct_Cost>0?priceColor:C.muted,fontWeight:item.Last_Direct_Cost>0?priceBold:400}}>
                    {item.Last_Direct_Cost>0?`$${Number(item.Last_Direct_Cost).toFixed(2)}`:"—"}
                  </td>
                  <td style={{padding:"7px 12px",fontSize:13,whiteSpace:"nowrap",
                    color:priceColor,fontWeight:priceBold}}>
                    {pricedDate}{daysSince!==null&&<span style={{fontSize:10,opacity:0.7,marginLeft:4}}>({daysSince}d)</span>}
                  </td>
                </tr>
                );
              })}
              {items.length===0&&!loading&&(
                <tr><td colSpan={6} style={{padding:32,textAlign:"center",color:C.muted,fontSize:13}}>No items found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginTop:10,fontSize:12,color:C.muted}}>
          <span>{items.length} items loaded</span>
          {hasMore&&<button onClick={()=>load(skip+PAGE,search)} disabled={loading}
            style={{...btn(),padding:"5px 16px",fontSize:12,color:C.text}}>
            {loading?"Loading…":"Load More"}
          </button>}
        </div>
      </div>

      {/* RIGHT — Vendors */}
      <div style={{flex:"0 0 25%",maxHeight:"calc(100vh - 240px)",overflowY:"auto"}}>
        <div style={{...card(),padding:"14px 16px"}}>
          <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:12}}>🏢 Vendors</div>
          <VendorsPanel uid={uid} onVendorAdded={()=>{_bcVendorMap=null;bcFetchVendorMap().then(setVendorMap);}}/>
        </div>
      </div>

    </div>
  </div>);
}

// ── APP ──
function App({user}){
  const [projects,setProjects]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("dashboard");
  const [navTab,setNavTab]=useState("projects");
  const [navPinned,setNavPinned]=useState(true);
  const [openProject,setOpenProject]=useState(null);
  const [revWarnModal,setRevWarnModal]=useState(null); // {project, pendingAction}
  const [revSnoozed,setRevSnoozed]=useState({}); // {[projectId]: true} per session
  const [showNew,setShowNew]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showAbout,setShowAbout]=useState(false);
  const [showConfig,setShowConfig]=useState(false);
  const [companyId,setCompanyId]=useState(null);
  const [userRole,setUserRole]=useState(null);
  const [companyName,setCompanyName]=useState(null);
  const [companyLogo,setCompanyLogo]=useState(null);
  const [companyAddress,setCompanyAddress]=useState(null);
  const [companyPhone,setCompanyPhone]=useState(null);
  const [showTeam,setShowTeam]=useState(false);
  const [showSetup,setShowSetup]=useState(false);
  const [setupDismissed,setSetupDismissed]=useState(false);
  const [deleteConfirm,setDeleteConfirm]=useState(null); // {id, name}
  const [transferProject,setTransferProject]=useState(null); // project object
  const [copyProject_,setCopyProject]=useState(null); // project object for copy modal
  const [userFirstName,setUserFirstName]=useState("");
  const [memberMap,setMemberMap]=useState({}); // uid → {email, firstName}
  const [bcOnline,setBcOnline]=useState(!!_bcToken);
  const [bcLostAlert,setBcLostAlert]=useState(false);
  const bcOnlinePrev=useRef(!!_bcToken);
  const [bcQueueCount,setBcQueueCount]=useState(()=>_bcQGet().length);
  const [connStatus,setConnStatus]=useState("good"); // "good"|"slow"|"offline"
  const bgTasks=useBgTasks();
  const bgRunning=Object.values(bgTasks).filter(t=>t.status==="running");
  const [sqQuery,setSqQuery]=useState('');
  const [sqResults,setSqResults]=useState(null);
  const [sqSearching,setSqSearching]=useState(false);
  const [sqAnswer,setSqAnswer]=useState(''); // AI conversational answer
  const [sqHistory,setSqHistory]=useState([]); // chat history [{role,content}]
  // NIQ uses module-level _niqCache via loadNIQ() and searchNIQ()
  const sqInputRef=useRef();
  const [tourStep,setTourStep]=useState(null); // null=off, 0-N=active step
  const TOUR_KEY='arc_tour_step_'+user.uid;
  const [showGearMenu,setShowGearMenu]=useState(false);
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [showBellMenu,setShowBellMenu]=useState(false);
  const [notifications,setNotifications]=useState([]);
  const [pendingPortalOpen,setPendingPortalOpen]=useState(null); // projectId to auto-open portal modal
  const [pushEnabled,setPushEnabled]=useState(()=>{try{return localStorage.getItem('arc_push_'+user.uid)==='1';}catch(e){return false;}});
  const [pushLoading,setPushLoading]=useState(false);
  async function togglePush(){
    if(pushLoading)return;
    setPushLoading(true);
    try{
      if(pushEnabled){
        await unsubscribePushNotifications(user.uid);
        setPushEnabled(false);
        try{localStorage.setItem('arc_push_'+user.uid,'0');}catch(e){}
      }else{
        await initPushNotifications(user.uid);
        setPushEnabled(true);
        try{localStorage.setItem('arc_push_'+user.uid,'1');}catch(e){}
      }
    }catch(e){console.error('Push toggle error:',e);alert('Push notification error: '+e.message);}
    setPushLoading(false);
  }
  const [showSearch,setShowSearch]=useState(false);
  const [showReports,setShowReports]=useState(false);
  const [showSupplierPricing,setShowSupplierPricing]=useState(false);
  function saveTourStep(s){try{if(s===null)localStorage.removeItem(TOUR_KEY);else localStorage.setItem(TOUR_KEY,String(s));}catch(e){}}
  function startTour(){
    let saved=null;
    try{const v=localStorage.getItem(TOUR_KEY);if(v!==null){const n=parseInt(v);if(!isNaN(n)&&n>=0&&n<TOUR_STEPS.length)saved=n;}}catch(e){}
    const step=saved!==null?saved:0;
    setTourStep(step);saveTourStep(step);
  }
  function tourNext(){setTourStep(prev=>{const n=Math.min(prev+1,TOUR_STEPS.length-1);saveTourStep(n);return n;});}
  function tourPrev(){setTourStep(prev=>{const n=Math.max(prev-1,0);saveTourStep(n);return n;});}
  function tourDone(){setTourStep(null);saveTourStep(null);}
  function tourSkip(){setTourStep(null);}

  // Notifications listener
  useEffect(()=>{
    if(!user.uid)return;
    const unsub=fbDb.collection(`users/${user.uid}/notifications`).where('read','==',false).orderBy('createdAt','desc').limit(50).onSnapshot(snap=>{
      setNotifications(snap.docs.map(d=>({id:d.id,...d.data()})));
    },()=>{});
    return()=>unsub();
  },[user.uid]);

  // RFQ pending counts per project (for dashboard cards)
  const [rfqCounts,setRfqCounts]=useState({});
  useEffect(()=>{
    if(!user.uid)return;
    const unsub=fbDb.collection('rfqUploads').where('uid','==',user.uid).where('status','==','submitted').onSnapshot(snap=>{
      const counts={};
      snap.docs.forEach(d=>{const pid=d.data().projectId;if(pid)counts[pid]=(counts[pid]||0)+1;});
      setRfqCounts(counts);
    },()=>{setRfqCounts({});});
    return()=>unsub();
  },[user.uid]);

  function handleNotifClick(notif){
    fbDb.doc(`users/${user.uid}/notifications/${notif.id}`).update({read:true}).catch(()=>{});
    setShowBellMenu(false);
    if(notif.type==='supplier_quote'&&notif.projectId){
      const proj=projects.find(p=>p.id===notif.projectId);
      if(proj){handleOpen(proj);setPendingPortalOpen(notif.projectId);}
    }
  }

  function markAllNotifsRead(){
    notifications.forEach(n=>fbDb.doc(`users/${user.uid}/notifications/${n.id}`).update({read:true}).catch(()=>{}));
  }

  function closeSearch(){setShowSearch(false);}
  function openProjectFromSearch(p){handleOpen(p);closeSearch();}
  const sqRowRef=useRef(null);
  const sqScrollRef=useRef(null);

  function buildArcContext(){
    // Build rich context from all loaded projects
    const projCtx=projects.slice(0,30).map(p=>{
      const panels=(p.panels||[]);
      const bomCount=panels.reduce((s,pan)=>(pan.bom||[]).length+s,0);
      const totalPrice=panels.reduce((s,pan)=>(pan.bom||[]).reduce((ss,r)=>ss+(r.qty||0)*(r.unitPrice||0),0)+s,0);
      const statuses=panels.map(pan=>pan.status||'draft');
      return`- ${p.bcProjectNumber||'(no BC#)'} "${p.name}" Customer:${p.bcCustomerName||'—'} Status:${projectStatus(p)} Panels:${panels.length} BOM_items:${bomCount} Total:$${totalPrice.toFixed(0)} Panel_statuses:[${statuses.join(',')}]${p.bcPoNumber?' PO:'+p.bcPoNumber:''}`;
    }).join('\n');

    // Summarize BOM parts across all projects
    const partMap={};
    projects.forEach(p=>(p.panels||[]).forEach(pan=>(pan.bom||[]).forEach(r=>{
      if(r.partNumber&&!r.isLaborRow){
        const k=r.partNumber.toUpperCase();
        if(!partMap[k])partMap[k]={pn:r.partNumber,desc:r.description||'',mfr:r.manufacturer||'',count:0,avgPrice:0,total:0};
        partMap[k].count++;
        if(r.unitPrice){partMap[k].total+=r.unitPrice;partMap[k].avgPrice=partMap[k].total/partMap[k].count;}
      }
    })));
    const topParts=Object.values(partMap).sort((a,b)=>b.count-a.count).slice(0,50);
    const partsCtx=topParts.map(p=>`${p.pn} (${p.mfr||'?'}) "${p.desc}" used:${p.count}x avg:$${p.avgPrice.toFixed(2)}`).join('\n');

    return{projCtx,partsCtx,projectCount:projects.length};
  }

  // NIQ functions use module-level loadNIQ() and searchNIQ()

  async function runAiSearch(q){
    if(!q||q.trim().length<2)return;
    setSqSearching(true);setSqAnswer('');setSqResults(null);
    try{
      const{projCtx,partsCtx,projectCount}=buildArcContext();

      // Fetch ARC Neural IQ and find relevant sections
      const niqDocs=await loadNIQ();
      const niqContext=searchNIQ(niqDocs,q.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>=3));

      const systemPrompt=`You are ARC AI — the expert assistant built into the ARC (Automated Review & Costing) platform by RedPill Software, powered by ARC Neural IQ (NIQ).

ABOUT MATRIX SYSTEMS:
Matrix Systems (Matrix Panel & Control Inc.) is a UL508A and CSA C22.2 No. 286 certified industrial control panel shop. They design, build, wire, and certify custom industrial control panels for clients across manufacturing, water/wastewater, HVAC, and industrial automation. Their work includes:
- Reading electrical schematics and BOMs from engineering drawings
- Sourcing components (PLCs, VFDs, contactors, breakers, terminal blocks, enclosures, etc.)
- Panel layout design, backpanel drilling, DIN rail and wire duct placement
- Wiring, labeling, and functional testing
- UL508A listing and labeling for each panel built
- Quoting labor and materials for new projects
The users of ARC are Matrix Systems employees — panel designers, engineers, estimators, and inspectors. Assume they have a working knowledge of industrial controls, components, and panel building.

YOUR ROLE:
You are a Control Panel Designer, Engineer, Inspector, and Control Panel Expert. You speak with authority on:
- UL508A (Standard for Industrial Control Panels) — construction, listing, labeling, SCCR, wiring methods, overcurrent protection, enclosure requirements, component spacing, temperature testing, marking requirements
- CSA C22.2 No. 286 (Canadian equivalent) — harmonized requirements and delta differences from UL508A
- UL508A Supplement, FUII (Follow-Up Inspection Instructions), and Certification Manual requirements
- NEC/NFPA 70 Articles 409 (Industrial Control Panels), 430 (Motors), 440 (A/C equipment)
- Industrial automation components: PLCs (Allen-Bradley, Siemens, AutomationDirect), VFDs, motor starters, contactors, relays, terminal blocks, wire duct, DIN rail, HMIs, enclosures (Hoffman, Rittal, Saginaw), circuit breakers, MCCBs, disconnect switches, fuse holders, power supplies
- Control panel design: layout best practices, wire sizing per UL508A tables, short circuit current ratings (SCCR), thermal management, labeling requirements, spacing requirements
- Inspection: what an inspector looks for during a UL508A listing inspection, common non-conformances, corrective actions
- Pricing knowledge for industrial components (approximate ranges from major distributors)
- Business Central ERP integration and purchasing workflows
${niqContext?`
ARC NEURAL IQ — STANDARDS, LEARNING & EXTRACTION INTELLIGENCE:
The following are sourced from ARC Neural IQ (NIQ) — the AI learning engine that stores authoritative standard excerpts (UL508A, CSA C22.2 No. 286, Supplement, FUII, Certification Manual), plus learning records from past panel extractions including user notes, corrections, compliance findings, and component data. Standards excerpts are your PRIMARY source of truth — always prefer these over general knowledge when answering standards questions. Cite the document source and page numbers. Learning records contain project-specific intelligence — use them to answer questions about past projects, common patterns, typical components, and lessons learned.
${niqContext}
`:''}
USER'S ARC DATA:

PROJECTS (${projectCount} total):
${projCtx||'(none loaded)'}

FREQUENTLY USED PARTS (top 50):
${partsCtx||'(none yet)'}

INSTRUCTIONS:
- Answer as a fellow panel shop expert — knowledgeable, practical, and direct.
- When asked about standards (UL508A, C22.2, FUII, etc.), cite specific clauses/sections/tables. When ARC Neural IQ excerpts are provided, quote them directly and cite the source document and page number.
- When asked about panel design, wiring, or inspection topics, give actionable guidance that a panel builder or inspector can use immediately.
- When asked about specific projects, reference them by name and BC project number.
- When asked about parts, include part numbers and approximate pricing when relevant.
- When asked "how to" do something in ARC, explain the workflow step by step.
- If the question is a simple search (e.g. "find project X" or "show me quotes from Y"), identify matching projects/quotes and present them clearly.
- Format responses with markdown: use **bold**, bullet points, and headers for readability.
- Keep answers focused and practical — this is a work tool used by professionals, not a general chatbot.
- If you don't have the specific standard text in ARC Neural IQ, say so and provide your best knowledge with a note that the user should verify against the actual standard.`;

      // Build messages with conversation history (keep last 6 exchanges)
      const historySlice=sqHistory.slice(-12);
      const messages=[...historySlice,{role:'user',content:q}];

      const answer=(await apiCall({model:'claude-sonnet-4-6',max_tokens:2000,system:systemPrompt,messages})).trim();
      setSqAnswer(answer);
      setSqHistory(prev=>[...prev,{role:'user',content:q},{role:'assistant',content:answer}].slice(-12));

      // Also do quick project/quote matching for clickable results
      const qLow=q.toLowerCase();
      const matchedProjects=projects.filter(p=>
        (p.name||'').toLowerCase().includes(qLow)||
        (p.bcCustomerName||'').toLowerCase().includes(qLow)||
        (p.bcProjectNumber||'').toLowerCase().includes(qLow)
      ).slice(0,5);
      setSqResults({quotes:[],projects:matchedProjects});
    }catch(e){
      setSqAnswer('');
      setSqResults({quotes:[],projects:[],error:e.message});
    }
    setSqSearching(false);
    setSqQuery('');
    setTimeout(()=>{if(sqScrollRef.current)sqScrollRef.current.scrollTop=sqScrollRef.current.scrollHeight;},100);
  }

  // Load user preferences from Firestore on mount
  useEffect(()=>{
    fbDb.collection('users').doc(user.uid).collection('config').doc('preferences').get()
      .then(snap=>{
        if(snap.exists){
          const v=snap.data().tooltipsEnabled;
          if(v!==undefined&&v!==_tooltipsEnabled){_tooltipsEnabled=v;document.body.classList.toggle('no-tips',!v);}
        }
      }).catch(()=>{});
  },[]);

  // Periodic BC connectivity ping every 5 minutes
  useEffect(()=>{
    const CHECK_MS=300000;
    const checkBc=async()=>{
      if(!_bcToken){
        const t=await acquireBcToken(false);
        if(!t){bcOnlinePrev.current=false;setBcOnline(false);return;}
      }
      try{
        const r=await fetch(`${BC_API_BASE}/companies?$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(r.status===401){
          // Token expired — try silent refresh before alarming user
          const t=await acquireBcToken(false);
          if(t){setBcOnline(true);bcOnlinePrev.current=true;return;}
          setBcToken(null);_odataPageCache=null;bcOnlinePrev.current=false;setBcOnline(false);setBcLostAlert(true);return;
        }
        const ok=r.ok;
        if(ok&&!bcOnlinePrev.current){
          setBcOnline(true);
          // BC just came back online — refresh company info, salesperson cache, and process queue
          // DECISION(v1.19.360): Include E_Mail and Phone_No in salesperson cache so Send Quote
          // signature can show the correct salesperson email/phone without an extra BC lookup.
          fetch(BC_ODATA_BASE+"/Salesperson?$select=Code,Name,Job_Title,E_Mail,Phone_No&$filter=Blocked eq false",{headers:{"Authorization":"Bearer "+_bcToken}}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(d)window._arcSalespersonCache=d.value||[];}).catch(function(){});
          bcFetchCompanyInfo().then(info=>{
            if(info&&_appCtx.companyId){
              const merged={...(_appCtx.company||{}),name:info.name||_appCtx.company?.name,address:info.address||_appCtx.company?.address,phone:info.phone||_appCtx.company?.phone};
              _appCtx.company=merged;
              if(info.address||info.phone||info.name){
                fbDb.doc(`companies/${_appCtx.companyId}`).update({...(info.name?{name:info.name}:{}),address:info.address||"",phone:info.phone||""}).catch(()=>{});
              }
            }
          }).catch(()=>{});
          bcProcessQueue();
        }
        else if(!ok&&bcOnlinePrev.current){setBcOnline(false);setBcLostAlert(true);}
        bcOnlinePrev.current=ok;
      }catch(e){
        // Network error — try silent token refresh before alerting
        const t=await acquireBcToken(false).catch(()=>null);
        if(t){setBcOnline(true);bcOnlinePrev.current=true;}
        else if(bcOnlinePrev.current){setBcOnline(false);setBcLostAlert(true);bcOnlinePrev.current=false;}
      }
    };
    const interval=setInterval(checkBc,CHECK_MS);
    return()=>{clearInterval(interval);};
  },[]);

  // Connection quality monitor
  useEffect(()=>{
    const determine=()=>{
      if(!navigator.onLine)return "offline";
      const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
      if(c){
        const et=c.effectiveType;
        if(et==="slow-2g"||et==="2g"||(c.downlink!==undefined&&c.downlink<0.5))return "slow";
      }
      return null; // unknown — defer to ping
    };
    const apply=s=>setConnStatus(prev=>prev!==s?s:prev);
    const onOnline=()=>{const s=determine();apply(s||"good");};
    const onOffline=()=>apply("offline");
    const onConnChange=()=>{const s=determine();if(s)apply(s);};
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    if(conn)conn.addEventListener("change",onConnChange);
    // Firestore latency ping every 30s
    const ping=async()=>{
      if(!navigator.onLine){apply("offline");return;}
      const t0=Date.now();
      try{
        const p=new Promise((_,rej)=>setTimeout(()=>rej("timeout"),10000));
        await Promise.race([firebase.firestore().collection("_ping").doc("test").get(),p]);
        const ms=Date.now()-t0;
        const net=determine();
        if(net==="offline")apply("offline");
        else if(net==="slow"||ms>5000)apply("slow");
        else apply("good");
      }catch(e){
        if(e==="timeout")apply("offline");
        else if(!navigator.onLine)apply("offline");
        // permission-denied / not-found = Firestore reachable → connection is good
        else if(e?.code==="unavailable"||e?.code==="resource-exhausted")apply("slow");
        else apply("good");
      }
    };
    const iv=setInterval(ping,30000);
    setTimeout(ping,5000); // initial check after 5s
    return()=>{
      window.removeEventListener("online",onOnline);
      window.removeEventListener("offline",onOffline);
      if(conn)conn.removeEventListener("change",onConnChange);
      clearInterval(iv);
    };
  },[]);

  // Splash screen state: "loading" → "shrinking" → "done"
  const [splash,setSplash]=useState("loading");
  const [splashPct,setSplashPct]=useState(0);
  const splashStartRef=useRef(Date.now());
  useEffect(()=>{
    const duration=3000;
    let raf;
    function tick(){
      const elapsed=Date.now()-splashStartRef.current;
      const pct=Math.min(100,Math.round((elapsed/duration)*100));
      setSplashPct(pct);
      if(elapsed<duration){raf=requestAnimationFrame(tick);}
      else{setSplash("shrinking");setTimeout(()=>setSplash("done"),800);}
    }
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[]);

  useEffect(()=>{
    (async()=>{
      _appCtx.uid=user.uid;
      const profile=await loadUserProfile(user.uid);
      if(profile?.companyId){
        _appCtx.companyId=profile.companyId;
        _appCtx.role=profile.role;
        _appCtx.projectsPath=`companies/${profile.companyId}/projects`;
        _appCtx.configPath=`companies/${profile.companyId}/config`;
        setCompanyId(profile.companyId);
        setUserRole(profile.role);
        try{
          const cd=await fbDb.doc(`companies/${profile.companyId}`).get();
          if(cd.exists){
            const cdat=cd.data();
            setCompanyName(cdat.name||null);
            setCompanyLogo(cdat.logoUrl||null);
            setCompanyAddress(cdat.address||null);
            setCompanyPhone(cdat.phone||null);
            _appCtx.company={name:cdat.name||null,logoUrl:cdat.logoUrl||null,logoDarkUrl:cdat.logoDarkUrl||null,address:cdat.address||null,phone:cdat.phone||null};
            _appCtx.termsAndConditions=cdat.termsAndConditions||"";
            // Load BC environment config from Firestore
            await loadBcConfig(profile.companyId);
            // Also try to pull fresh company data from BC
            if(_bcToken){
              bcFetchCompanyInfo().then(info=>{
                if(info){
                  const merged={...(_appCtx.company||{}),name:info.name||_appCtx.company?.name,address:info.address||_appCtx.company?.address,phone:info.phone||_appCtx.company?.phone};
                  _appCtx.company=merged;
                  if(info.address)setCompanyAddress(info.address);
                  if(info.phone)setCompanyPhone(info.phone);
                  if(info.name)setCompanyName(info.name);
                  if(info.address||info.phone||info.name){
                    fbDb.doc(`companies/${_appCtx.companyId}`).update({...(info.name?{name:info.name}:{}),address:info.address||"",phone:info.phone||""}).catch(()=>{});
                  }
                }
              }).catch(()=>{});
            }
          }
        }catch(e){}
      } else {
        _appCtx.projectsPath=`users/${user.uid}/projects`;
      }
      await Promise.all([loadApiKey(user.uid),loadPricingConfig(user.uid),loadDefaultBomItems(user.uid),loadLaborRates(user.uid)]);
      fbDb.doc(`users/${user.uid}/config/profile`).get().then(d=>{if(d.exists)setUserFirstName(d.data().firstName||"");}).catch(()=>{});
      // Load company members → uid→name map for project ownership display
      if(profile?.companyId){
        loadCompanyMembers(profile.companyId).then(async mems=>{
          const map={};
          const profileDocs=await Promise.all(mems.map(m=>fbDb.doc(`users/${m.uid}/config/profile`).get().catch(()=>null)));
          mems.forEach((m,i)=>{
            const pd=profileDocs[i];
            const fn=pd&&pd.exists?pd.data().firstName||"":"";
            map[m.uid]={email:m.email||"",firstName:fn};
          });
          setMemberMap(map);
        }).catch(()=>{});
      }
      if(!_defaultBomItems.length){
        _defaultBomItems=[
          {partNumber:"JOB-BUYOFF",description:"Job Buyoff",manufacturer:"",qty:1,unitPrice:0,priceSource:null,priceDate:Date.now()},
          {partNumber:"",description:"Crate",manufacturer:"",qty:1,unitPrice:0,priceSource:null,priceDate:Date.now()}
        ];
        saveDefaultBomItems(user.uid,_defaultBomItems).catch(()=>{});
      }
      console.log("API key loaded:",_apiKey?"YES ("+_apiKey.slice(0,8)+"…)":"NO — set in Settings");
      setProjects(await loadProjects(user.uid));
      setLoading(false);
      // Auto-connect BC silently in background
      if(!_bcToken){acquireBcToken(false).then(async t=>{if(t){console.log("BC auto-connected silently");setBcOnline(true);bcOnlinePrev.current=true;bcProcessQueue();setProjects(ps=>[...ps]);fetch(BC_ODATA_BASE+"/Salesperson?$select=Code,Name,Job_Title,E_Mail,Phone_No&$filter=Blocked eq false",{headers:{"Authorization":"Bearer "+_bcToken}}).then(function(r){return r.ok?r.json():null;}).then(function(d){if(d)window._arcSalespersonCache=d.value||[];}).catch(function(){});}}).catch(()=>{});}
    })();
  },[user.uid]);

  // Register handler so background extraction tasks can update App state after navigation
  useEffect(()=>{
    _appProjectUpdateFn=(liveProject)=>{
      setProjects(ps=>ps.map(x=>x.id===liveProject.id?liveProject:x));
      setOpenProject(prev=>prev?.id===liveProject.id?liveProject:prev);
    };
    return()=>{_appProjectUpdateFn=null;};
  },[]);

  // Register BC queue badge setter
  useEffect(()=>{
    _bcQueueCountSetter=setBcQueueCount;
    return()=>{_bcQueueCountSetter=null;};
  },[]);

  // Poll BC every 5 minutes and import any projects not yet in ARC
  useEffect(()=>{
    if(!user?.uid)return;
    async function syncBcProjects(){
      if(!_bcToken){setBcToken(await acquireBcToken(false)||null);}
      if(!_bcToken)return;
      try{
        const [bcProjects,bcCustomers,odataProjects]=await Promise.all([bcLoadAllProjects(),bcLoadAllCustomers(),bcLoadAllProjectsOData()]);
        // Build OData lookup by project No for rich customer fields
        const odataByNo=Object.fromEntries(odataProjects.filter(op=>op.No).map(op=>[op.No,op]));
        const bcById=Object.fromEntries(bcProjects.filter(bp=>bp.id).map(bp=>[bp.id,bp]));
        const custByNumber=Object.fromEntries(bcCustomers.map(c=>[c.number,c.displayName]));
        function extractCustomer(bp){
          const odata=odataByNo[bp.number]||{};
          const custNo=odata.Sell_to_Customer_No||odata.CCS_Sell_to_Customer_No||odata.Bill_to_Customer_No||bp.billToCustomerNumber||bp.billToCustomerNo||"";
          const custName=odata.Sell_to_Customer_Name||odata.Bill_to_Name||bp.billToName||bp.billToCustomerName||(custNo?custByNumber[custNo]||"":"");
          return{bcCustomerNumber:custNo,bcCustomerName:custName};
        }
        setProjects(ps=>{
          const existingBcIds=new Set(ps.map(p=>p.bcProjectId).filter(Boolean));
          // Import new projects
          const toImport=bcProjects.filter(bp=>bp.id&&!existingBcIds.has(bp.id));
          const newProjects=toImport.map(bp=>({
            id:"arc-"+bp.id.replace(/-/g,""),
            name:bp.displayName||bp.number||"Imported Project",
            bcProjectId:bp.id,
            bcProjectNumber:bp.number||"",
            bcEnv:_bcConfig.env,
            ...extractCustomer(bp),
            importedFromBC:true,
            status:"draft",
            panels:[],
            createdAt:Date.now(),
            updatedAt:Date.now()
          }));
          if(newProjects.length){console.log(`BC sync: importing ${newProjects.length} new project(s)`);newProjects.forEach(p=>saveProject(user.uid,p).catch(e=>console.warn("BC import save failed:",e)));}
          // Re-sync customer name on BC-linked projects missing it
          const toUpdate=ps.filter(p=>p.bcProjectId&&!p.bcCustomerName&&bcById[p.bcProjectId]);
          const updatedPs=ps.map(p=>{
            if(!p.bcProjectId||p.bcCustomerName)return p;
            const bp=bcById[p.bcProjectId];
            // Also try direct customer number lookup even without a bp match
            const custNo=p.bcCustomerNumber||"";
            const nameFromCustomers=custNo?custByNumber[custNo]||"":"";
            if(!bp&&!nameFromCustomers)return p;
            const cust=bp?extractCustomer(bp):{bcCustomerNumber:custNo,bcCustomerName:nameFromCustomers};
            if(!cust.bcCustomerName)return p;
            const updated={...p,...cust,updatedAt:Date.now()};
            saveProject(user.uid,updated).catch(e=>console.warn("BC customer resync failed:",e));
            return updated;
          });
          if(toUpdate.length)console.log(`BC sync: re-synced customer on ${toUpdate.length} project(s)`);
          return newProjects.length||toUpdate.length?[...newProjects,...updatedPs]:ps;
        });
      }catch(e){console.warn("BC project sync error:",e);}
    }
    // Run immediately on load (delay slightly to allow silent BC auth to complete)
    const initialTimer=setTimeout(syncBcProjects,3000);
    const interval=setInterval(syncBcProjects,5*60*1000);
    return()=>{clearTimeout(initialTimer);clearInterval(interval);};
  },[user?.uid]);

  function checkQuoteRevWarn(action){
    if(!openProject){action();return;}
    const p=openProject;
    if(p.lastPrintedBomHash&&(p.quoteRev||0)>(p.quoteRevAtPrint||0)){
      if(revSnoozed[p.id]){action();return;}
      if(p.quoteRevAcknowledgedAt&&p.quoteRevAcknowledgedAt>=(p.lastQuotePrintedAt||0)){action();return;}
      setRevWarnModal({project:p,pendingAction:action});return;
    }
    action();
  }
  function handleOpen(p){
    checkQuoteRevWarn(()=>{setRevSnoozed(s=>{const n={...s};delete n[openProject?.id];return n;});setOpenProject(p);setView("project");setNavTab("projects");});
  }
  function handleCreated(p){setShowNew(false);setProjects(ps=>[p,...ps]);setOpenProject(p);setView("project");setNavTab("projects");}
  function handleChange(p){setProjects(ps=>ps.map(x=>x.id===p.id?p:x));setOpenProject(p);}
  function handleDelete(id,name,bcProjectId,bcProjectNumber,project){setDeleteConfirm({id,name,bcProjectId,bcProjectNumber,project});}
  async function confirmDelete(deleteFromBC){
    if(!deleteConfirm)return;
    if(deleteFromBC&&deleteConfirm.bcProjectId){
      try{
        await bcDeleteProject(deleteConfirm.bcProjectId);
      }catch(e){
        const msg=e.message||"Unknown error";
        const skip=confirm(`⚠ Could not delete from Business Central:\n\n${msg}\n\nDelete from ARC anyway?`);
        if(!skip){setDeleteConfirm(null);return;}
      }
    }
    await deleteProject(user.uid,deleteConfirm.id);
    setProjects(ps=>ps.filter(x=>x.id!==deleteConfirm.id));
    if(view==="project"&&openProject?.id===deleteConfirm.id){setView("dashboard");setOpenProject(null);}
    setDeleteConfirm(null);
  }
  function handleTransferDone(id){
    setProjects(ps=>ps.filter(p=>p.id!==id));
    if(view==="project"&&openProject?.id===id){setView("dashboard");setOpenProject(null);}
    setTransferProject(null);
  }

  async function handleAccept(id){
    const path=_appCtx.projectsPath||`users/${user.uid}/projects`;
    await fbDb.doc(`${path}/${id}`).update({
      transferred:firebase.firestore.FieldValue.delete(),
      transferredTo:firebase.firestore.FieldValue.delete(),
      transferredFrom:firebase.firestore.FieldValue.delete(),
      createdBy:user.uid,
    });
    setProjects(ps=>ps.map(p=>p.id===id?{...p,transferred:undefined,transferredTo:undefined,transferredFrom:undefined,createdBy:user.uid}:p));
  }

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
      {/* ── SPLASH SCREEN ── */}
      {splash!=="done"&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          transition:"opacity 0.5s ease",opacity:splash==="shrinking"?0:1,pointerEvents:splash==="shrinking"?"none":"auto"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",
            transition:"all 0.7s cubic-bezier(0.4,0,0.2,1)",
            transform:splash==="shrinking"?"translateY(-44vh) scale(0.38)":"translateY(0) scale(1)"}}>
            <img src="/parallax_logo.svg" alt="Parallax Software" style={{height:200,objectFit:"contain",marginBottom:16}}/>
            <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:80,fontWeight:900,letterSpacing:8,marginBottom:4,lineHeight:1,color:C.accent}}>ARC</span>
            <span style={{fontSize:15,color:C.muted,letterSpacing:2,marginBottom:32}}>Powered by <span style={{color:C.accent,fontWeight:700}}>ARC Neural IQ</span></span>
          </div>
          {splash==="loading"&&(
            <div style={{width:280,height:4,background:C.border,borderRadius:4,overflow:"hidden",transition:"opacity 0.3s",opacity:splash==="loading"?1:0}}>
              <div style={{height:"100%",background:`linear-gradient(90deg,${C.accent},${C.purple})`,borderRadius:4,transition:"width 0.15s linear",width:splashPct+"%"}}/>
            </div>
          )}
        </div>
      )}
      {/* ── TOP MENU BAR ── */}
      <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,pointerEvents:"none"}}>
        {/* Main toolbar row */}
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"0 24px",display:"flex",alignItems:"center",height:78,gap:6,position:"relative",pointerEvents:"auto"}}>
          {/* RedPill logo — left side */}
          <img src="/parallax_logo.svg" alt="Parallax Software" style={{width:220,maxHeight:60,objectFit:"contain",cursor:"pointer",flexShrink:0}} onClick={()=>checkQuoteRevWarn(()=>{setRevSnoozed(s=>{const n={...s};delete n[openProject?.id];return n;});setView("dashboard");setOpenProject(null);})}/>
          {/* ARC branding — centered */}
          <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1,pointerEvents:"none"}}>
            <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:28,fontWeight:900,letterSpacing:5,color:C.accent,lineHeight:1}}>ARC</span>
            <span style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginTop:4,fontWeight:600}}>Powered by <span style={{color:C.accent,fontWeight:700,letterSpacing:2}}>ARC Neural IQ</span></span>
            <span style={{fontSize:10,fontWeight:600,color:C.muted,letterSpacing:0.3,marginTop:3}}>{APP_VERSION}</span>
          </div>
          {/* Flex spacer */}
          <div style={{flex:1}}/>
          {/* Status indicators */}
          {bgRunning.length>0&&(
            <div title={bgRunning.map(t=>t.panelName+": "+t.msg).join("\n")}
              style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",height:36,borderRadius:10,background:C.greenDim,border:`1px solid ${C.green}99`,cursor:"default",flexShrink:0}}>
              <span className="spin" style={{fontSize:12,color:C.green,lineHeight:1}}>◌</span>
              <span style={{fontSize:12,fontWeight:600,color:C.green,whiteSpace:"nowrap"}}>{bgRunning.length} processing</span>
            </div>
          )}
          {connStatus!=="good"&&(
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",height:36,borderRadius:10,flexShrink:0,
              background:connStatus==="offline"?C.redDim:C.yellowDim,border:`1px solid ${connStatus==="offline"?C.red+"66":C.yellow+"66"}`}}>
              <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:connStatus==="offline"?C.red:C.yellow,boxShadow:`0 0 4px ${connStatus==="offline"?C.red:C.yellow}`,animation:"pulse 2s ease-in-out infinite"}}/>
              <span style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",color:connStatus==="offline"?C.red:C.yellow}}>{connStatus==="offline"?"Offline":"Slow"}</span>
            </div>
          )}
          <div title={bcOnline?"Business Central is connected":"Click to connect to Business Central"}
            onClick={bcOnline?undefined:async()=>{const t=await acquireBcToken(true);if(t){setBcOnline(true);bcOnlinePrev.current=true;bcProcessQueue();}}}
            style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",height:36,borderRadius:10,flexShrink:0,background:bcOnline?C.accentDim:C.redDim,border:`1px solid ${bcOnline?C.accent+"99":C.red+"88"}`,cursor:bcOnline?"default":"pointer"}}>
            <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:bcOnline?C.accent:C.red,boxShadow:`0 0 5px ${bcOnline?C.accent:C.red}`}}/>
            <span style={{fontSize:12,fontWeight:600,color:bcOnline?C.accent:C.red,whiteSpace:"nowrap"}}>{bcOnline?"BC Connected":"BC Offline — Click to connect"}</span>
          </div>
          {bcQueueCount>0&&(
            <div title={`${bcQueueCount} BC operation${bcQueueCount>1?'s':''} pending — will retry when connected`}
              style={{background:C.yellowDim,color:C.yellow,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,cursor:"default",flexShrink:0}}>
              ⏳ {bcQueueCount} pending
            </div>
          )}
          {/* Company logo — between BC status and search */}
          {(companyLogo||companyName)&&<>
            <div style={{width:1,height:36,background:C.border,marginLeft:2,flexShrink:0}}/>
            <div style={{display:"flex",alignItems:"center",flexShrink:0,padding:"0 4px"}}>
              {companyLogo?(<img src={companyLogo} alt="Company logo" style={{maxHeight:44,maxWidth:170,objectFit:"contain"}}/>):(<span style={{color:C.accent,fontSize:21,fontWeight:700}}>⬡ {companyName}</span>)}
            </div>
          </>}
          <div style={{width:1,height:36,background:C.border,marginLeft:2,flexShrink:0}}/>
          {/* ✨ ARC AI Assistant */}
          <button title="ARC AI Assistant — Ask about projects, UL508A, C22, parts, pricing" onClick={()=>setShowSearch(v=>!v)} style={{background:showSearch?C.accentDim:"none",border:showSearch?`1px solid ${C.accent}44`:"none",borderRadius:8,color:showSearch?C.accent:C.muted,cursor:"pointer",fontSize:22,width:47,height:47,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>✨</button>
          {/* 🔔 Bell icon */}
          <div style={{position:"relative",flexShrink:0}}>
            <button title="Notifications" onClick={()=>{setShowBellMenu(v=>!v);setShowGearMenu(false);setShowUserMenu(false);}} style={{background:showBellMenu?C.accentDim:"none",border:showBellMenu?`1px solid ${C.accent}44`:"none",borderRadius:8,color:showBellMenu?C.accent:notifications.length>0?C.yellow:C.muted,cursor:"pointer",fontSize:22,width:47,height:47,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>🔔</button>
            {notifications.length>0&&<div style={{position:"absolute",top:5,right:5,background:C.red,color:"#fff",borderRadius:"50%",fontSize:10,fontWeight:800,minWidth:17,height:17,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,pointerEvents:"none"}}>{notifications.length>9?"9+":notifications.length}</div>}
            {showBellMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 0",minWidth:320,maxWidth:380,boxShadow:"0 4px 20px rgba(0,0,0,0.12)",zIndex:600}}>
              <div style={{padding:"10px 16px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,flex:1}}>Notifications {notifications.length>0&&`(${notifications.length})`}</span>
                {notifications.length>0&&<button onClick={markAllNotifsRead} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:600,padding:0}}>Mark all read</button>}
              </div>
              <div style={{maxHeight:360,overflowY:"auto"}}>
                {notifications.length===0&&<div style={{padding:"20px 16px",textAlign:"center",color:C.muted,fontSize:13}}>No new notifications</div>}
                {notifications.map(n=>(
                  <div key={n.id} style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}`,cursor:n.type==='supplier_quote'?"pointer":"default"}}
                    onClick={()=>n.type==='supplier_quote'?handleNotifClick(n):undefined}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                      <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{n.type==='supplier_quote'?'📥':'🔔'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2,lineHeight:1.3}}>{n.title||"Notification"}</div>
                        <div style={{fontSize:12,color:C.muted,lineHeight:1.4,marginBottom:4}}>{n.body||""}</div>
                        {n.type==='supplier_quote'&&<span style={{fontSize:11,fontWeight:700,color:C.accent}}>Click to Review Quote →</span>}
                        <div style={{fontSize:10,color:C.muted,marginTop:3}}>{n.createdAt?new Date(n.createdAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):""}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Push notification toggle */}
              {fbMessaging&&<div style={{padding:"8px 16px",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:C.muted,flex:1}}>{pushEnabled?"Push notifications on":"Push notifications off"}</span>
                <button onClick={togglePush} disabled={pushLoading} style={{background:pushEnabled?C.green:C.border,border:"none",borderRadius:12,width:40,height:22,cursor:pushLoading?"wait":"pointer",position:"relative",transition:"background 0.2s",flexShrink:0,opacity:pushLoading?0.5:1}}>
                  <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:pushEnabled?21:3,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
                </button>
              </div>}
              {pushEnabled&&<div style={{padding:"4px 16px 8px"}}>
                <button onClick={()=>{if(_swRegistration&&Notification.permission==='granted'){_swRegistration.showNotification('MatrixARC',{body:'Push notifications are working!',icon:'/icons/icon-192.png',tag:'arc-test',renotify:true,requireInteraction:true});}}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,padding:"4px 10px",cursor:"pointer",width:"100%"}}>Send test notification</button>
              </div>}
            </div>)}
          </div>
          {/* ⚙ Gear menu */}
          <div style={{position:"relative",flexShrink:0}}>
            <button data-tour="config-btn" data-tour-training="training-btn" title="Settings & Tools" onClick={()=>{setShowGearMenu(v=>!v);setShowUserMenu(false);}} style={{background:showGearMenu?C.accentDim:"none",border:showGearMenu?`1px solid ${C.accent}44`:"none",borderRadius:8,color:showGearMenu?C.accent:C.muted,cursor:"pointer",fontSize:23,width:47,height:47,display:"flex",alignItems:"center",justifyContent:"center"}}>⚙</button>
            {showGearMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 0",minWidth:230,boxShadow:"0 4px 20px rgba(0,0,0,0.12)",zIndex:600}}>
              <div style={{padding:"10px 16px 8px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                <div style={{fontSize:13,fontWeight:800,color:C.text,letterSpacing:0.3}}>ARC Software</div>
                <div style={{fontSize:11,color:C.accent,fontWeight:600,marginTop:2,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{APP_VERSION}</div>
              </div>
              <button onClick={()=>{setShowSettings(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={e=>e.target.style.background=C.bg} onMouseLeave={e=>e.target.style.background="none"}>⚙ Settings</button>
              <button data-tour="config-btn" onClick={()=>{setShowConfig(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={e=>e.target.style.background=C.bg} onMouseLeave={e=>e.target.style.background="none"}>🔧 Configuration</button>
              <div style={{height:1,background:C.border,margin:"4px 0"}}/>
              <button data-tour="training-btn" onClick={()=>{startTour();setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:tourStep!==null?C.accentDim:"none",border:"none",color:tourStep!==null?C.accent:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:tourStep!==null?700:500}} onMouseEnter={e=>{if(tourStep===null)e.target.style.background=C.bg;}} onMouseLeave={e=>{if(tourStep===null)e.target.style.background="none";}}>{(()=>{try{const v=localStorage.getItem(TOUR_KEY);if(v!==null&&tourStep===null){const n=parseInt(v);if(!isNaN(n)&&n>0)return`📋 Resume Training (${n+1}/${TOUR_STEPS.length})`;}return null;}catch(e){return null;}})()??'📋 Training'}</button>
              <button onClick={()=>{setShowReports(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={e=>e.target.style.background=C.bg} onMouseLeave={e=>e.target.style.background="none"}>📊 Reports</button>
              <button onClick={()=>{setShowSupplierPricing(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={e=>e.target.style.background=C.bg} onMouseLeave={e=>e.target.style.background="none"}>📥 Upload Supplier Pricing</button>
              {userRole==="admin"&&<button onClick={()=>{setView("aidb");setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:view==="aidb"?C.accentDim:"none",border:"none",color:C.purple,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:700}} onMouseEnter={e=>{if(view!=="aidb")e.target.style.background=C.bg;}} onMouseLeave={e=>{if(view!=="aidb")e.target.style.background="none";}}>🧠 ARC AI Database</button>}
              <div style={{height:1,background:C.border,margin:"4px 0"}}/>
              <button onClick={()=>{setShowAbout(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.muted,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={e=>e.target.style.background=C.bg} onMouseLeave={e=>e.target.style.background="none"}>ℹ About</button>
            </div>)}
          </div>
          {/* 👤 User menu */}
          <div style={{position:"relative",flexShrink:0}}>
            <div data-tour="team-btn" title={user.email} onClick={()=>{setShowUserMenu(v=>!v);setShowGearMenu(false);}} style={{width:44,height:44,borderRadius:"50%",background:showUserMenu?C.accentDim:C.border,border:showUserMenu?`2px solid ${C.accent}`:`2px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,fontWeight:800,color:showUserMenu?C.accent:C.muted,flexShrink:0,userSelect:"none",letterSpacing:0}}>
              {user.email?user.email[0].toUpperCase():"?"}
            </div>
            {showUserMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 0",minWidth:230,boxShadow:"0 4px 20px rgba(0,0,0,0.12)",zIndex:600}}>
              <div style={{padding:"12px 16px 10px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6,wordBreak:"break-all"}}>{user.email}</div>
                {userRole&&<span style={{fontSize:11,fontWeight:700,padding:"2px 10px",borderRadius:8,background:userRole==="admin"?C.accentDim:userRole==="edit"?C.greenDim:C.border,color:userRole==="admin"?C.accent:userRole==="edit"?C.green:C.muted}}>{userRole}</span>}
              </div>
              <button data-tour="team-btn" onClick={()=>{setShowTeam(true);setShowUserMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={e=>e.target.style.background=C.bg} onMouseLeave={e=>e.target.style.background="none"}>👥 Team & Permissions</button>
              <div style={{height:1,background:C.border,margin:"4px 0"}}/>
              <button onClick={()=>{fbAuth.signOut();setShowUserMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.red,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:600}} onMouseEnter={e=>e.target.style.background=C.redDim} onMouseLeave={e=>e.target.style.background="none"}>Sign Out</button>
            </div>)}
          </div>
        </div>
        {/* Dropdown backdrop — closes menus when clicking outside */}
        {(showGearMenu||showUserMenu||showBellMenu)&&<div style={{position:"fixed",inset:0,zIndex:590}} onClick={()=>{setShowGearMenu(false);setShowUserMenu(false);setShowBellMenu(false);}}/>}
      </div>
      {/* Horizontal tab bar — fixed below header */}
      <div style={{position:"fixed",top:78,left:0,right:0,zIndex:490,background:C.nav,borderBottom:`2px solid ${C.accent}`,display:"flex",alignItems:"flex-end",paddingLeft:16,gap:4,height:50}}>
        {NAV_TABS.map(t=>{
          const active=navTab===t.id;
          const hasOpenProject=view==="project"&&openProject;
          // Show "BACK TO SALES" only when sales tab is active AND viewing a project
          const isBackBtn=t.id==="projects"&&hasOpenProject&&active;
          // Show project name on sales tab when on another tab with project open
          const isReturnBtn=t.id==="projects"&&hasOpenProject&&!active;
          return(
          <button key={t.id} onClick={()=>{
            if(isBackBtn){checkQuoteRevWarn(()=>{setRevSnoozed(s=>{const n={...s};delete n[openProject?.id];return n;});setView("dashboard");setOpenProject(null);});return;}
            // Switching tabs
            setNavTab(t.id);
          }}
            style={{cursor:"pointer",padding:"0 24px",
              height:active?46:38,
              fontSize:12,fontWeight:700,letterSpacing:isBackBtn?1:isReturnBtn?1:2,textTransform:"uppercase",
              color:isBackBtn?C.yellow:isReturnBtn?C.navText:active?"#fff":C.navText,
              background:isBackBtn?C.yellowDim:active?"rgba(255,255,255,0.07)":C.nav,
              borderTop:isBackBtn?`2px solid ${C.yellow}`:active?`2px solid ${C.accent}`:`1px solid ${C.navBorder}`,
              borderLeft:isBackBtn?`1px solid ${C.yellow}`:active?`1px solid ${C.accent}`:`1px solid ${C.navBorder}`,
              borderRight:isBackBtn?`1px solid ${C.yellow}`:active?`1px solid ${C.accent}`:`1px solid ${C.navBorder}`,
              borderBottom:active?`2px solid rgba(255,255,255,0.07)`:`1px solid ${C.nav}`,
              borderRadius:"8px 8px 0 0",
              marginBottom:active?"-2px":0,
              position:"relative",zIndex:active?1:0,
              transition:"color 0.15s,height 0.15s"}}>
            {isBackBtn?"← BACK TO SALES":isReturnBtn?`← ${(openProject.name||"PROJECT").slice(0,20).toUpperCase()}`:t.label}
          </button>);
        })}
      </div>
      {/* Content — padded below fixed header + tab bar */}
      <div style={{flex:1,paddingTop:122,display:"flex",height:"100vh",overflow:"hidden"}}>
      <div style={{flex:1,minWidth:0,overflowY:"auto"}}>
      <VendorSyncFloater onSwitchToItems={()=>{setNavTab("items");}}/>
      {navTab==="production"&&<Dashboard uid={user.uid} userFirstName={userFirstName} memberMap={memberMap} projects={projects} loading={loading} onOpen={handleOpen} onNew={()=>setShowNew(true)} onDelete={handleDelete} onAccept={handleAccept} onTransfer={companyId?setTransferProject:undefined} onUpdateProject={async p=>{await saveProject(user.uid,p);setProjects(ps=>ps.map(x=>x.id===p.id?p:x));}} sqQuery={sqQuery} sqResults={sqResults} sqSearching={sqSearching} rfqCounts={rfqCounts} forceView="production"/>}
      {navTab==="purchasing"&&<Dashboard uid={user.uid} userFirstName={userFirstName} memberMap={memberMap} projects={projects} loading={loading} onOpen={handleOpen} onNew={()=>setShowNew(true)} onDelete={handleDelete} onAccept={handleAccept} onTransfer={companyId?setTransferProject:undefined} onUpdateProject={async p=>{await saveProject(user.uid,p);setProjects(ps=>ps.map(x=>x.id===p.id?p:x));}} sqQuery={sqQuery} sqResults={sqResults} sqSearching={sqSearching} rfqCounts={rfqCounts} forceView="purchasing"/>}
      {navTab==="items"&&<ItemsTab uid={user.uid}/>}
      {navTab==="projects"&&<>
      {/* BC Connection Lost popup */}
      {bcLostAlert&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{...card(),maxWidth:400,width:"100%",border:`1px solid ${C.red}55`,boxShadow:"0 4px 20px rgba(0,0,0,0.12)"}}>
            <div style={{fontSize:22,fontWeight:700,marginBottom:8,color:C.red}}>⚠ BC Connection Lost</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.6}}>The connection to Business Central has timed out. This can happen when the app is left open overnight. BC features (projects, customers, items) are unavailable until you reconnect.</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setBcLostAlert(false)} style={btn(C.border,C.muted,{fontSize:13})}>Dismiss</button>
              <button onClick={async()=>{
                setBcLostAlert(false);
                const t=await acquireBcToken(true);
                if(t){setBcOnline(true);bcOnlinePrev.current=true;bcProcessQueue();}
              }} style={btn(C.accent,"#fff",{fontSize:13})}>Reconnect to BC</button>
            </div>
          </div>
        </div>
      )}
      {view==="dashboard"&&(
        <>
          {/* Company setup banner */}
          {!companyId&&!setupDismissed&&(
            <div style={{background:C.accentDim,borderBottom:`1px solid ${C.accent}`,padding:"8px 32px",display:"flex",alignItems:"center",gap:12,fontSize:13,flexWrap:"wrap"}}>
              <span style={{color:C.sub,flex:1}}>Set up a Company workspace to collaborate with your team.</span>
              <button onClick={()=>setShowSetup(true)} style={btn(C.accent,"#fff",{fontSize:12,padding:"5px 14px"})}>Set up Company</button>
              <button onClick={()=>setSetupDismissed(true)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,padding:"4px 8px"}}>Not now</button>
            </div>
          )}
          <Dashboard uid={user.uid} userFirstName={userFirstName} memberMap={memberMap} projects={projects} loading={loading} onOpen={handleOpen} onNew={()=>setShowNew(true)} onDelete={handleDelete} onAccept={handleAccept} onTransfer={companyId?setTransferProject:undefined} onUpdateProject={async p=>{await saveProject(user.uid,p);setProjects(ps=>ps.map(x=>x.id===p.id?p:x));}} sqQuery={sqQuery} sqResults={sqResults} sqSearching={sqSearching} rfqCounts={rfqCounts}/>
        </>
      )}
      {view==="project"&&openProject&&(
        <ErrorBoundary onBack={()=>setView("dashboard")}>
          <ProjectView project={openProject} uid={user.uid} onBack={()=>checkQuoteRevWarn(()=>{setRevSnoozed(s=>{const n={...s};delete n[openProject?.id];return n;});setView("dashboard");})} onChange={handleChange} onDelete={()=>handleDelete(openProject.id,openProject.name,openProject.bcProjectId,openProject.bcProjectNumber,openProject)} onTransfer={companyId?()=>setTransferProject(openProject):undefined} onCopy={()=>setCopyProject(openProject)} autoOpenPortal={pendingPortalOpen===openProject.id} onPortalOpened={()=>setPendingPortalOpen(null)}/>
        </ErrorBoundary>
      )}
      {view==="aidb"&&userRole==="admin"&&(
        <AIDatabasePage uid={user.uid} onBack={()=>setView("dashboard")}/>
      )}
      {showNew&&<NewProjectModal uid={user.uid} onCreated={handleCreated} onClose={()=>setShowNew(false)}/>}
      {deleteConfirm&&<DeleteConfirmModal projectName={deleteConfirm.name} bcProjectNumber={deleteConfirm.bcProjectNumber} isAdmin={userRole==="admin"} project={deleteConfirm.project} onConfirm={confirmDelete} onCancel={()=>setDeleteConfirm(null)}/>}
      {transferProject&&<TransferProjectModal project={transferProject} companyId={companyId} uid={user.uid} userEmail={user.email} onTransferred={handleTransferDone} onClose={()=>setTransferProject(null)}/>}
      {copyProject_&&<CopyProjectModal project={copyProject_} uid={user.uid} onCopied={p=>{setCopyProject(null);setProjects(ps=>[p,...ps]);handleOpen(p);}} onClose={()=>setCopyProject(null)}/>}
      {showSettings&&<SettingsModal uid={user.uid} onClose={()=>setShowSettings(false)} onNameChange={n=>setUserFirstName(n)}/>}
      {showReports&&<ReportsModal uid={user.uid} onClose={()=>setShowReports(false)}/>}
      {showConfig&&<PricingConfigModal uid={user.uid} onClose={()=>setShowConfig(false)} onLogoChange={url=>{setCompanyLogo(url||null);_appCtx.company={...(_appCtx.company||{}),logoUrl:url||null};}}/>}
      {showTeam&&<TeamModal uid={user.uid} companyId={companyId} userRole={userRole} onClose={()=>setShowTeam(false)}/>}
      {showAbout&&<AboutModal onClose={()=>setShowAbout(false)}/>}
      {showSupplierPricing&&<SupplierPricingUploadModal uid={user.uid} onClose={()=>setShowSupplierPricing(false)}/>}
      {showSetup&&<CompanySetupModal uid={user.uid} email={user.email} onDone={(cid,role,name)=>{setCompanyId(cid);setUserRole(role);setCompanyName(name||null);setShowSetup(false);}} onClose={()=>setShowSetup(false)}/>}
      {revWarnModal&&(()=>{const rm=revWarnModal;const rev=rm.project.quoteRev||0;return React.createElement("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"},onClick:e=>{if(e.target===e.currentTarget){rm.pendingAction();setRevWarnModal(null);}}},
        React.createElement("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"32px 36px",maxWidth:440,width:"90%",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:28,marginBottom:12}},"⚠️"),
          React.createElement("div",{style:{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}},"Quote Revision "+rev+" Unsent"),
          React.createElement("div",{style:{fontSize:13,color:C.sub,lineHeight:1.6,marginBottom:24}},"The BOM has changed since the last quote was printed. Rev "+rev+" has not been sent to the client."),
          React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:10}},
            React.createElement("button",{onClick:()=>{setRevSnoozed(s=>({...s,[rm.project.id]:true}));rm.pendingAction();setRevWarnModal(null);},style:{background:C.accentDim,color:C.accent,border:`1px solid ${C.accent}44`,borderRadius:20,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}},"Snooze — Remind Next Time I Open This Project"),
            React.createElement("button",{onClick:()=>{const upd={...rm.project,quoteRevAcknowledgedAt:Date.now()};handleChange(upd);saveProject(user.uid,upd);rm.pendingAction();setRevWarnModal(null);},style:{background:C.redDim,color:C.red,border:`1px solid ${C.red}44`,borderRadius:20,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}},"Don't Remind Until Next Change"),
            React.createElement("button",{onClick:()=>{rm.pendingAction();setRevWarnModal(null);},style:{background:C.surface,color:C.muted,border:`1px solid ${C.border}`,borderRadius:20,padding:"8px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}},"Dismiss")
          )
        )
      );})()}
      </>}{/* end projects tab */}
      </div>{/* end main content column */}
      {/* ARC AI Assistant — right slide-out panel */}
      <div ref={sqRowRef} style={{width:showSearch?420:0,flexShrink:0,transition:"width 0.3s ease",overflow:"hidden",borderLeft:showSearch?`1px solid ${C.border}`:"none",background:C.bg,position:"relative"}}>
        <div style={{width:420,height:"100%",display:"flex",flexDirection:"column",visibility:showSearch?"visible":"hidden"}}>
          {/* Header */}
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>✨</span>
            <span style={{fontSize:14,fontWeight:700,color:C.text,flex:1}}>ARC AI Assistant</span>
            {sqHistory.length>0&&!sqSearching&&<button onClick={()=>{setSqHistory([]);setSqAnswer('');setSqResults(null);_niqCache=null;}} title="Clear chat" style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,fontWeight:600,padding:"2px 8px"}}>Clear</button>}
            <button onClick={()=>setShowSearch(false)} title="Close" style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>×</button>
          </div>
          {/* Chat history */}
          <div ref={sqScrollRef} style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
            {sqHistory.length===0&&!sqSearching&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted}}>
              <div style={{fontSize:32,marginBottom:12}}>✨</div>
              <div style={{fontSize:14,fontWeight:600,color:C.sub,marginBottom:8}}>ARC AI Assistant</div>
              <div style={{fontSize:12,lineHeight:1.7}}>Ask about projects, UL508A, C22.2,<br/>parts, pricing, or how to use ARC.</div>
            </div>}
            {sqHistory.map((msg,i)=>(
              <div key={i} style={{display:"flex",gap:10,marginBottom:14,alignItems:"flex-start"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:msg.role==='user'?C.accent:C.purple,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0,marginTop:2}}>{msg.role==='user'?'Y':'AI'}</div>
                <div style={{flex:1,minWidth:0}}>
                  {msg.role==='user'
                    ?<div style={{fontSize:13,color:C.text,fontWeight:600}}>{msg.content}</div>
                    :<div style={{fontSize:13,color:C.sub,lineHeight:1.7}} dangerouslySetInnerHTML={{__html:(()=>{
                      let html=msg.content
                        .replace(/\*\*(.+?)\*\*/g,`<strong style="color:${C.text}">$1</strong>`)
                        .replace(/\*(.+?)\*/g,'<em>$1</em>')
                        .replace(/`([^`]+)`/g,`<code style="background:${C.border};padding:1px 5px;border-radius:3px;font-size:12px">$1</code>`)
                        .replace(/^### (.+)$/gm,`<div style="font-size:13px;font-weight:700;color:${C.text};margin:8px 0 4px">$1</div>`)
                        .replace(/^## (.+)$/gm,`<div style="font-size:14px;font-weight:700;color:${C.text};margin:10px 0 4px">$1</div>`)
                        .replace(/^- (.+)$/gm,'<div style="padding-left:12px">• $1</div>')
                        .replace(/^\d+\. (.+)$/gm,(m,p1)=>'<div style="padding-left:12px">'+m.match(/^\d+/)[0]+'. '+p1+'</div>')
                        .replace(/\n{2,}/g,'<br/><br/>')
                        .replace(/\n/g,'<br/>');
                      return html;
                    })()}}/>
                  }
                </div>
              </div>
            ))}
            {sqSearching&&<div style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:C.purple,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}} className="spin">◌</div>
              <span style={{fontSize:13,color:C.muted}}>Thinking…</span>
            </div>}
          </div>
          {/* Matched projects — clickable chips */}
          {sqResults&&sqResults.projects.length>0&&<div style={{display:"flex",gap:6,padding:"6px 16px",overflowX:"auto",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            {sqResults.projects.map(p=>(
              <div key={p.id} onClick={()=>openProjectFromSearch(p)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontSize:11}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <span style={{fontWeight:700,color:C.accent,marginRight:4}}>{p.bcProjectNumber||'—'}</span>
                <span style={{color:C.text}}>{p.name}</span>
              </div>
            ))}
          </div>}
          {sqResults&&sqResults.error&&<div style={{fontSize:11,color:C.red,padding:"4px 16px"}}>{sqResults.error}</div>}
          {/* Input bar */}
          <div style={{padding:"8px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",background:C.input,border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
              <input ref={sqInputRef} value={sqQuery} placeholder={sqHistory.length?"Follow up…":"Ask a question…"} autoFocus
                onChange={e=>setSqQuery(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();runAiSearch(sqQuery);}}}
                style={{flex:1,background:"none",border:"none",outline:"none",color:C.text,fontSize:13,padding:"10px 12px",minWidth:0}}/>
              <button onClick={()=>runAiSearch(sqQuery)} disabled={sqSearching||!sqQuery.trim()} style={{background:C.accent,border:"none",color:"#fff",padding:"10px 14px",cursor:sqSearching?"wait":"pointer",fontSize:12,fontWeight:700,flexShrink:0,opacity:sqSearching||!sqQuery.trim()?0.5:1}}>{sqSearching?"…":"Ask"}</button>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end flex row wrapper */}
      {tourStep!==null&&<TourOverlay stepIdx={tourStep} onNext={tourNext} onPrev={tourPrev} onDone={tourDone} onSkip={tourSkip} onMinimize={()=>setTourStep(null)}/>}
    </div>
  );
}

// ── INTERACTIVE TRAINING TOUR ──

const TOUR_PHASES=['Overview','Create a Project','Upload Drawings','ARC AI Extraction','Review the BOM','Generate a Quote','Send RFQs','PO Received'];

const TOUR_STEPS=[
  // ── OVERVIEW ──
  {phase:'Overview',title:'Welcome to the ARC Walkthrough 👋',
   body:'This walkthrough guides you through a complete panel quote from start to finish — creating a project, uploading drawings, extracting the BOM, pricing, quoting, sending RFQs, and recording a customer PO.\n\nFollow each step at your own pace. Action steps will tell you exactly what to do before moving on.',
   target:null},

  {phase:'Overview',title:'Your Projects Dashboard',
   body:'This is your home screen. Every job lives here as a card showing the project name, panels, current status, and last update.\n\nStatus colors show workflow progress at a glance — orange = Draft, yellow = In Progress, teal = Validated, purple = Costed, green = Quoted.',
   target:'[data-tour="project-list"]',placement:'center'},

  {phase:'Overview',title:'Before You Begin — Settings',
   body:'Two things must be configured before your first extraction:\n\n• ⚙ Config — Set labor rates, pricing contingencies, and default BOM items\n• ⚙ Settings — Enter your Anthropic API key (required for AI extraction)\n\nBoth are accessible from the menu bar at any time.',
   target:'[data-tour="config-btn"]',placement:'bottom'},

  // ── CREATE A PROJECT ──
  {phase:'Create a Project',title:'Step 1 — Create a New Project',
   body:'Every panel job starts with a project. ARC links each project to a Business Central customer and can auto-create the corresponding BC Job.\n\nClick "+ New Project" in the top right, select your customer, enter a project name, then click Create.',
   target:'[data-tour="new-project-btn"]',placement:'bottom',
   action:true,actionLabel:'👆 Click + New Project now. Select a customer from BC, name the project, and click Create. Return here when done.'},

  {phase:'Create a Project',title:'Step 2 — Add a Panel',
   body:'Your project opens to the Panel List. Each panel represents a separate electrical assembly in the job.\n\nMost jobs have one panel. For multi-panel jobs (MCCs, systems with multiple cabinets), add one panel per assembly with a descriptive name that matches the drawing title block.',
   target:null,
   action:true,actionLabel:'👆 Click + Add Panel. Give it a name (e.g. "Main Control Panel"), then click Add. Return here when done.'},

  // ── UPLOAD DRAWINGS ──
  {phase:'Upload Drawings',title:'Step 3 — Open the Panel',
   body:'Click on your new panel to open its workspace. This is where you\'ll manage drawings, review the BOM, and track the panel through the quoting workflow.',
   target:null,
   action:true,actionLabel:'👆 Click on your panel to open it. Return here once you\'re inside the panel workspace.'},

  {phase:'Upload Drawings',title:'Step 4 — Upload Your Drawing Set',
   body:'Drop your complete UL508A drawing PDF here — or click Browse to select a file. Upload the full drawing set in one go (BOM pages, schematics, layouts, enclosure drawings all together).\n\nHigher-quality PDFs (vector, not scanned) produce significantly better extraction results.',
   target:'[data-tour="add-files-zone"]',placement:'right',
   action:true,actionLabel:'👆 Drop your drawing PDF onto this zone or click to browse. Wait for the upload to finish, then return here.'},

  {phase:'Upload Drawings',title:'How Page Detection Works',
   body:'ARC automatically classifies every page using AI:\n\n• BOM — parts table (will be extracted)\n• Schematic — wiring diagram (wire count, device tags)\n• Backpanel — component layout (DIN rail, duct footage)\n• Enclosure — door view (cutouts, dimensions)\n\nEach page thumbnail shows a colored badge with its detected type.'},

  {phase:'Upload Drawings',title:'Step 5 — Verify Page Classifications',
   body:'Scan the page thumbnails. If a page was misclassified, click its thumbnail and select the correct type from the dropdown.\n\nAccurate classification is important — the schematic drives wire count labor and the layout drives door device labor. ARC learns from your corrections.',
   target:null,
   action:true,actionLabel:'👆 Review each page thumbnail. Correct any misclassified pages, then return here.'},

  // ── AI EXTRACTION ──
  {phase:'ARC AI Extraction',title:'Step 6 — Extraction Runs Automatically',
   body:'Once drawings are uploaded and classified, ARC processes everything in the background:\n\n• Claude reads the BOM table and extracts every line item with quantities and part numbers\n• The schematic is analyzed for internal wire connections\n• The layout is analyzed for door cutouts, backpanel devices, and DIN rail/duct footage\n\nExtraction typically takes 1–5 minutes. A progress bar appears while it runs.'},

  {phase:'ARC AI Extraction',title:'The BOM Is Populated',
   body:'When complete, the BOM table fills with extracted parts. The panel status advances to Extracted.\n\nThe first three rows — CUT, LAYOUT, and WIRE — are auto-generated labor estimates calculated from the wire count and layout analysis. These drive the labor section of your quote.',
   target:'[data-tour="bom-table"]',placement:'top'},

  // ── REVIEW THE BOM ──
  {phase:'Review the BOM',title:'Step 7 — Review Extracted Items',
   body:'Scroll through the BOM and verify the extracted data. Common issues to look for:\n\n• Misread part numbers (OCR errors on low-quality scans)\n• Wrong quantities\n• Missing items (check against the drawing BOM)\n\nClick any cell to edit it directly. Changes save automatically.',
   target:'[data-tour="bom-table"]',placement:'top',
   action:true,actionLabel:'👆 Review the BOM table. Fix any extraction errors by clicking and editing cells. Return here when done.'},

  {phase:'Review the BOM',title:'Red Rows Need Attention',
   body:'Rows highlighted in red have qty = 0 or unit price = $0. These will make your quote inaccurate.\n\nFor each red row: either fix the quantity/price, look up pricing from BC, or delete the row if the item shouldn\'t be on the BOM.',
   target:'[data-tour="bom-table"]',placement:'top'},

  {phase:'Review the BOM',title:'Step 8 — Get Pricing from Business Central',
   body:'For rows without a price, click the 🔍 icon to open the BC Item Browser. Search by part number or description, review the results, and click USE to pull the price and vendor info directly from BC.\n\nPriced items show today\'s date in green in the Priced column. Green = within 60 days, Red = stale pricing over 60 days old.',
   target:'[data-tour="bom-table"]',placement:'top',
   action:true,actionLabel:'👆 Use the BC Item Browser (🔍) to price unpriced rows. Return here when pricing is complete.'},

  // ── GENERATE A QUOTE ──
  {phase:'Generate a Quote',title:'Step 9 — Review the Labor Estimate',
   body:'Scroll to the Pricing section below the BOM. ARC has calculated labor hours from the drawing analysis:\n\n• CUT — panel drilling and machining\n• LAYOUT — component mounting and assembly\n• WIRE — panel wiring\n\nVerify the totals are reasonable for the scope of work. Labor rates are configurable in ⚙ Config.',
   target:null,
   action:true,actionLabel:'👆 Scroll down to the Pricing section and review the CUT/LAYOUT/WIRE hours. Return here when done.'},

  {phase:'Generate a Quote',title:'Step 10 — Open the Quote Editor',
   body:'Click "Print Client Quote" to open the quote editor. Fill in or verify:\n\n• Salesperson name\n• Requested ship date\n• Quote notes (optional)\n• Markup % — the sell price recalculates instantly\n\nThe sell price = (BOM + Labor + Contingencies) × (1 + markup%).',
   target:'[data-tour="print-quote-btn"]',placement:'top',
   action:true,actionLabel:'👆 Click Print Client Quote. Review all fields and the sell price. Adjust markup if needed. Return here when done.'},

  {phase:'Generate a Quote',title:'Step 11 — Print to PDF',
   body:'Inside the quote editor, click the Print Client Quote button to open the browser print dialog. Select "Save as PDF" to export.\n\nThe quote includes:\n• Company header with logo\n• Labor summary with bar charts\n• BOM table (configurable)\n• Terms & Conditions page\n\nUse Edge or Chrome for best print formatting.',
   target:'[data-tour="print-quote-btn"]',placement:'top'},

  // ── SEND RFQs ──
  {phase:'Send RFQs',title:'Step 12 — Open the RFQ Modal',
   body:'An RFQ (Request for Quote) is sent to vendors to get pricing on your BOM items. ARC automatically groups BOM items by supplier and generates a separate, formatted RFQ document for each vendor.\n\nClick "Send/Print RFQ\'s" to open the RFQ modal.',
   target:'[data-tour="rfq-btn"]',placement:'top',
   action:true,actionLabel:'👆 Click Send/Print RFQ\'s to open the RFQ modal. Return here once it\'s open.'},

  {phase:'Send RFQs',title:'Step 13 — Preview an RFQ',
   body:'In the RFQ modal, you\'ll see one row per vendor. Click 👁 Preview next to any vendor to review the full RFQ document before it goes out.\n\nVerify the part list, quantities, RFQ number, and response deadline look correct.',
   target:'[data-tour="rfq-btn"]',placement:'top',
   action:true,actionLabel:'👆 Click 👁 Preview on at least one vendor. Review the document, then return here.'},

  {phase:'Send RFQs',title:'Step 14 — Send the RFQ',
   body:'Click "Send Email" next to a vendor to send the RFQ. The vendor receives:\n\n• The RFQ as a PDF attachment\n• A direct link to submit pricing via the ARC supplier portal (no login required)\n\nWhen the supplier submits pricing, the "📥 Upload Supplier Quote" button shows a badge count. Click it to review and apply their prices to your BOM.',
   target:'[data-tour="rfq-btn"]',placement:'top',
   action:true,actionLabel:'👆 Send the RFQ to at least one vendor. Return here when done.'},

  // ── PO RECEIVED ──
  {phase:'PO Received',title:'When the Customer Issues a PO',
   body:'Once the customer accepts your quote and issues a Purchase Order, you\'ll record it in ARC. This writes the PO information directly to Business Central.\n\nThe "📬 PO Received" button is located below Print Quote on the Panel List — it only appears when a BC Project Number is linked.'},

  {phase:'PO Received',title:'Step 15 — Record the PO',
   body:'Click "📬 PO Received" and enter:\n\n• Customer PO Number — written to BC as External Document No.\n• Ship Date — pushed to BC planning lines as the panel Ending Date\n\nFor multi-panel jobs, click "Set per-panel dates →" to assign individual ship dates per panel.\n\nClicking Submit PO sets the BC project status to Open.',
   target:null,
   action:true,actionLabel:'👆 When you have a real PO in hand: click 📬 PO Received, enter the PO number and ship date, then click Submit PO. Return here after.'},

  {phase:'PO Received',title:'Workflow Complete 🎉',
   body:'You\'ve completed the full ARC panel quote process:\n\n✓ Created a project and panel\n✓ Uploaded drawings and ran AI extraction\n✓ Reviewed and priced the BOM\n✓ Generated a customer quote\n✓ Sent RFQs to vendors\n✓ Recorded the customer PO in BC\n\nFor detailed reference on any feature, see the ARC Training Manual.',
   target:null},
];

function useTourRect(target){
  const[rect,setRect]=useState(null);
  useEffect(()=>{
    if(!target){setRect(null);return;}
    function measure(){
      const el=document.querySelector(target);
      if(!el){setRect(null);return;}
      const r=el.getBoundingClientRect();
      setRect({top:r.top,left:r.left,width:r.width,height:r.height});
      el.scrollIntoView({behavior:'smooth',block:'center'});
    }
    measure();
    const t=setTimeout(measure,320);
    return()=>clearTimeout(t);
  },[target]);
  return rect;
}

export default ItemsTab;

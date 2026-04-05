// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION, setBcToken } from '@/core/globals';
import { useSmoothProgress } from '@/core/useSmoothProgress';
import { bcLookupItem, searchItems as bcSearchItems, bcFuzzyLookup, createItem as bcCreateItem, patchItemOData as bcPatchItemOData, bcListItemCategories, bcListUnitsOfMeasure, bcListGenProdPostingGroups, bcListInventoryPostingGroups } from '@/services/businessCentral/items';
import { getAllVendors as bcListVendors, getItemVendorNo as bcGetItemVendorNo, getVendorName as bcGetVendorName, getLastPurchase as bcGetLastPurchase, bcCreateVendor } from '@/services/businessCentral/vendors';
import { pushPurchasePrice as bcPushPurchasePrice } from '@/services/businessCentral/prices';
import { discoverODataPages as bcDiscoverODataPages, getCompanyId as bcGetCompanyId } from '@/services/businessCentral/client';
import { bcNormalizeMfrCode } from '@/core/helpers';
import Badge from '@/ui/shared/Badge';
import DrawingLightbox from '@/ui/shared/DrawingLightbox';
import CPDSearchModal from '@/ui/modals/CPDSearchModal';
import UpdateBomInBCModal from '@/ui/modals/UpdateBomInBCModal';

function BCItemBrowserModal({onSelect,onClose,initialQuery,targetRow,pages,syncError}){
  const [query,setQuery]=useState(initialQuery||"");
  const [field,setField]=useState("both");
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [skip,setSkip]=useState(0);
  const [searched,setSearched]=useState(false);
  const debounceRef=useRef(null);
  const PAGE=25;
  const [showCreate,setShowCreate]=useState(false);
  const [createNumber,setCreateNumber]=useState(initialQuery||"");
  const [createName,setCreateName]=useState(targetRow&&targetRow.description?targetRow.description:"");
  const [createCost,setCreateCost]=useState("");
  const [createCategory,setCreateCategory]=useState("PARTS");
  const [createUom,setCreateUom]=useState("EA");
  const [createVendor,setCreateVendor]=useState("");
  const [creating,setCreating]=useState(false);
  const [createErr,setCreateErr]=useState("");
  const [bcCategories,setBcCategories]=useState([]);
  const [bcUoms,setBcUoms]=useState([]);
  const [bcVendors,setBcVendors]=useState([]);
  const [bcGenProdGroups,setBcGenProdGroups]=useState([]);
  const [bcInvPostingGroups,setBcInvPostingGroups]=useState([]);
  const [createGenProd,setCreateGenProd]=useState("INVENTORY");
  const [createInvPosting,setCreateInvPosting]=useState("RAW MAT");
  const [dropdownsLoaded,setDropdownsLoaded]=useState(false);
  const [bcManufacturers,setBcManufacturers]=useState([]);
  const [createMfr,setCreateMfr]=useState(()=>bcNormalizeMfrCode(targetRow?.manufacturer||"")||"");
  const [showNewVendor,setShowNewVendor]=useState(false);
  const [newVendorName,setNewVendorName]=useState("");
  const [newVendorPhone,setNewVendorPhone]=useState("");
  const [newVendorEmail,setNewVendorEmail]=useState("");
  const [newVendorGenBus,setNewVendorGenBus]=useState("TRADE");
  const [newVendorPostGroup,setNewVendorPostGroup]=useState("PARTS");
  const [newVendorTaxArea,setNewVendorTaxArea]=useState("NONTAXABLE");
  const [creatingVendor,setCreatingVendor]=useState(false);
  const [newVendorErr,setNewVendorErr]=useState("");
  const [croppedDataUrl,setCroppedDataUrl]=useState(null);
  const [locating,setLocating]=useState(false);
  const [drawingPageIdx,setDrawingPageIdx]=useState(0);
  const [vendorNames,setVendorNames]=useState({});
  const [purchaseData,setPurchaseData]=useState({});
  const [customerSupplied,setCustomerSupplied]=useState(false);
  const [editVendorItem,setEditVendorItem]=useState(null); // item.number being edited
  const [editVendorNo,setEditVendorNo]=useState("");
  const [savingVendor,setSavingVendor]=useState(false);
  const [vendorSaveErr,setVendorSaveErr]=useState("");
  const [vendorListLoaded,setVendorListLoaded]=useState(false);
  const [mfrCodes,setMfrCodes]=useState({}); // {itemNumber: mfrCode}
  const [editMfrItem,setEditMfrItem]=useState(null);
  const [editMfrCode,setEditMfrCode]=useState("");
  const [savingMfr,setSavingMfr]=useState(false);
  const [showNewMfr,setShowNewMfr]=useState(false);
  const [newMfrCode,setNewMfrCode]=useState("");
  const [newMfrName,setNewMfrName]=useState("");
  const [creatingMfr,setCreatingMfr]=useState(false);
  const [newMfrErr,setNewMfrErr]=useState("");
  // Inline create forms for search results edit mode
  const [inlineMfrCreate,setInlineMfrCreate]=useState(null); // item.number currently showing inline MFR create
  const [inlineMfrCode,setInlineMfrCode]=useState("");
  const [inlineMfrName,setInlineMfrName]=useState("");
  const [inlineMfrCreating,setInlineMfrCreating]=useState(false);
  const [inlineMfrErr,setInlineMfrErr]=useState("");
  const [inlineVendorCreate,setInlineVendorCreate]=useState(null); // item.number currently showing inline vendor create
  const [inlineVendorName,setInlineVendorName]=useState("");
  const [inlineVendorCreating,setInlineVendorCreating]=useState(false);
  const [inlineVendorErr,setInlineVendorErr]=useState("");
  const bomPages=((pages||[]).filter(p=>getPageTypes(p).includes('bom')&&(p.dataUrl||p.storageUrl)));

  async function locateInDrawing(pgIdx){
    const idx=pgIdx!=null?pgIdx:drawingPageIdx;
    const pg=bomPages[idx];
    if(!pg||!_apiKey)return;
    setLocating(true);setCroppedDataUrl(null);
    try{
      let dataUrl=pg.dataUrl;
      if(!dataUrl&&pg.storageUrl){const loaded=await ensureDataUrl(pg);dataUrl=loaded.dataUrl;}
      if(!dataUrl)return;
      const b64=dataUrl.split(',')[1];
      if(!b64)return;
      const pn=(targetRow?.partNumber||initialQuery||'').trim();
      const refLine=(targetRow?.itemNo||'').trim();
      // Ask Haiku for TABLE boundaries + total row count + part number column position (easier than finding one row)
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":_apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-haiku-4-5-20251001",max_tokens:80,messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
          {type:"text",text:`This drawing has a BOM table. Return JSON with: table_top (y fraction where FIRST data row starts), table_bottom (y fraction where LAST data row ends), total_rows (count of data rows), pn_x (x fraction of center of part number/catalog column). All fractions of image dimensions 0.0-1.0.`}
        ]},{role:"assistant",content:[{type:"text",text:"{"}]}]})
      });
      const data=await resp.json();
      const rawText=data.content?.[0]?.text||'';
      const text='{'+rawText;
      const m=text.match(/\{[\s\S]*?\}/);
      if(m){
        const r=JSON.parse(m[0]);
        const itemNum=parseInt(refLine)||0;
        const totalRows=r.total_rows||1;
        const tTop=r.table_top||0.1;
        const tBot=r.table_bottom||0.9;
        const rowHeight=(tBot-tTop)/totalRows;
        // Item number maps directly to row index — nudge down half a row to center on the row
        const rowIdx=Math.max(0,itemNum-0.5);
        const y_top=tTop+(rowIdx*rowHeight);
        const y_bottom=y_top+rowHeight;
        // Clamp pn_x — varies by customer; use AI value but cap range
        const pnX=r.pn_x!=null?Math.min(0.60,Math.max(0.35,r.pn_x)):0.50;
        await cropRowFromImage(dataUrl,y_top,y_bottom,pnX);
      }
    }catch(e){console.warn('locateInDrawing:',e);}
    finally{setLocating(false);}
  }

  const _cropRowCenter=useRef({scrollToY:0,scrollToX:0});
  function cropRowFromImage(dataUrl,yTop,yBottom,pnX){
    return new Promise(resolve=>{
      const img=new Image();
      img.onload=()=>{
        const W=img.naturalWidth,H=img.naturalHeight;
        // Show full drawing — user can scroll in any direction
        // Scale so the row height renders at ~50px tall for readability
        const srcRowH=Math.round((yBottom-yTop)*H);
        const scale=Math.max(1,50/Math.max(srcRowH,1));
        const canvasW=Math.round(W*scale);
        const canvasH=Math.round(H*scale);
        const canvas=document.createElement('canvas');
        canvas.width=canvasW;canvas.height=canvasH;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,W,H,0,0,canvasW,canvasH);
        // Highlight the row
        const rowTopC=Math.round(yTop*canvasH);
        const rowBotC=Math.round(yBottom*canvasH);
        const rowH=Math.max(3,rowBotC-rowTopC);
        ctx.fillStyle='rgba(253,224,71,0.22)';
        ctx.fillRect(0,rowTopC,canvasW,rowH);
        ctx.strokeStyle='#fde047';ctx.lineWidth=2;
        ctx.strokeRect(1,rowTopC+1,canvasW-2,rowH-2);
        // Store scroll targets so onLoad can center the highlighted row + part number column
        const scrollX=pnX!=null?Math.max(0,Math.round(pnX*canvasW)-200):Math.round(canvasW*0.55);
        _cropRowCenter.current={scrollToY:Math.max(0,rowTopC-80),scrollToX:scrollX};
        setCroppedDataUrl(canvas.toDataURL('image/jpeg',0.95));
        resolve();
      };
      img.onerror=resolve;
      img.src=dataUrl;
    });
  }

  useEffect(()=>{
    // Always use Haiku to locate the part number — it returns pn_x for accurate horizontal scroll
    if(bomPages.length&&_apiKey){
      const pgIdx=targetRow?.sourcePageIdx??0;
      locateInDrawing(pgIdx);
    } else {
      // Fallback: use stored coords if no API key
      const hasValidCoords=bomPages.length&&targetRow?.y_top!=null&&targetRow?.y_bottom!=null&&(targetRow.y_bottom-targetRow.y_top)>0.001;
      if(hasValidCoords){
        const pgIdx=targetRow.sourcePageIdx??0;
        setDrawingPageIdx(pgIdx);
        const pg=bomPages[pgIdx]||bomPages[0];
        if(pg){
          setLocating(true);
          const doLoad=async()=>{
            try{
              let dataUrl=pg.dataUrl;
              if(!dataUrl&&pg.storageUrl){const loaded=await ensureDataUrl(pg);dataUrl=loaded.dataUrl;}
              if(dataUrl)await cropRowFromImage(dataUrl,targetRow.y_top,targetRow.y_bottom,targetRow.pn_x);
            }catch(e){console.warn('cropRowFromImage:',e);}finally{setLocating(false);}
          };
          doLoad();
        }
      }
    }
  },[]);

  async function doSearch(append=false,overrideQuery){
    const q=overrideQuery!==undefined?overrideQuery:query;
    const s=append?skip:0;
    if(!q.trim()||q.trim().length<3){
      if(!append){setResults([]);setSearched(false);setHasMore(false);}
      return;
    }
    setLoading(true);
    console.log("BC_BROWSER doSearch:",q,"field:",field,"skip:",s,"append:",append);
    const r=await bcSearchItems(q,{field,top:PAGE,skip:s});
    console.log("BC_BROWSER results:",r.items.length,"hasMore:",r.hasMore);
    if(append){setResults(prev=>[...prev,...r.items]);}
    else{setResults(r.items);setSkip(0);}
    setHasMore(r.hasMore);
    setSkip(s+PAGE);
    setSearched(true);
    setLoading(false);
    // Enrich with vendor names in background
    const items=append?[...results,...r.items]:r.items;
    enrichVendorNames(items);
  }

  async function enrichVendorNames(items){
    if(!_bcToken||!items.length)return;
    const toFetch=items.filter(it=>it.number&&vendorNames[it.number]===undefined);
    if(!toFetch.length)return;
    const vBatch={};const pBatch={};
    const mBatch={};
    for(const it of toFetch){
      const vNo=await bcGetItemVendorNo(it.number);
      vBatch[it.number]=vNo?await bcGetVendorName(vNo):"";
      const lp=await bcGetLastPurchase(it.number);
      pBatch[it.number]=lp||null;
      // Fetch manufacturer code from OData
      try{
        const allPages=await bcDiscoverODataPages();const iPage=allPages.find(n=>/^ItemCard$/i.test(n));
        if(iPage){const mr=await fetch(`${BC_ODATA_BASE}/${iPage}?$filter=No eq '${it.number}'&$select=No,Manufacturer_Code&$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
          if(mr.ok){const md=((await mr.json()).value||[])[0];if(md)mBatch[it.number]=md.Manufacturer_Code||"";}}
      }catch(e){}
    }
    setVendorNames(prev=>({...prev,...vBatch}));
    setPurchaseData(prev=>({...prev,...pBatch}));
    setMfrCodes(prev=>({...prev,...mBatch}));
  }

  function onQueryChange(val){
    setQuery(val);
    if(debounceRef.current)clearTimeout(debounceRef.current);
    if(val.trim().length>=3){
      debounceRef.current=setTimeout(()=>doSearch(false,val),350);
    } else {
      setResults([]);setSearched(false);setHasMore(false);
    }
  }

  useEffect(()=>{if(initialQuery&&initialQuery.trim().length>=3)doSearch(false,initialQuery);},[]);
  useEffect(()=>()=>{if(debounceRef.current)clearTimeout(debounceRef.current);},[]);

  function fmtDate(iso){
    if(!iso)return"—";
    try{const d=new Date(iso);return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}catch(e){return"—";}
  }

  async function startEditVendor(item){
    setVendorSaveErr("");
    setEditVendorNo(vendorNames[item.number]?"":item.vendorNo||"");
    setEditVendorItem(item.number);
    if(!vendorListLoaded){
      setVendorListLoaded(true);
      const v=await bcListVendors();
      if(v.length)setBcVendors(v);else setVendorListLoaded(false);
    }
  }

  async function saveVendorEdit(itemNo,vendorNo){
    setSavingVendor(true);setVendorSaveErr("");
    try{
      await bcPatchItemOData(itemNo,{Vendor_No:vendorNo});
      const name=vendorNo?(bcVendors.find(v=>v.number===vendorNo)||{}).displayName||vendorNo:"";
      setVendorNames(prev=>({...prev,[itemNo]:name}));
      setEditVendorItem(null);
    }catch(e){
      setVendorSaveErr(e.message||"Failed to update vendor");
    }
    setSavingVendor(false);
  }

  const backdropMdRef=useRef(false);
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onMouseDown={e=>{backdropMdRef.current=e.target===e.currentTarget;}}
      onClick={e=>{if(backdropMdRef.current)onClose();}}>
      <div style={{...card(),width:"100%",maxWidth:860,maxHeight:"90vh",display:"flex",flexDirection:"column",overflow:"hidden"}} onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:12,flexShrink:0}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>BC Item Browser</div>
            {targetRow&&(targetRow.partNumber||targetRow.description)&&(
              <div style={{display:"flex",alignItems:"baseline",gap:10,background:"#0a0a18",border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 12px",flexWrap:"wrap"}}>
                <span style={{fontSize:11,color:C.muted,fontWeight:600,letterSpacing:0.5,whiteSpace:"nowrap"}}>ORIGINAL</span>
                {targetRow.partNumber&&<span style={{fontSize:13,fontWeight:700,color:C.yellow,fontFamily:"monospace"}}>{targetRow.partNumber}</span>}
                {targetRow.description&&<span style={{fontSize:12,color:C.sub}}>{targetRow.description}</span>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,flexShrink:0}}>✕</button>
        </div>
        {/* BC Sync Error banner */}
        {syncError&&(()=>{
          const e=syncError.error||"";
          const isBcSetup=/Posting Group/i.test(e);
          const isMissing=/must select an existing item/i.test(e);
          function friendlyErr(e){
            if(/must select an existing item/i.test(e))return"This part number does not exist in BC. Search for the correct item below, or create a new item.";
            if(/Gen\.?\s*Prod\.?\s*Posting Group must have a value/i.test(e))return"The BC item is missing its Gen. Prod. Posting Group.";
            if(/Inventory Posting Group must have a value/i.test(e))return"The BC item is missing its Inventory Posting Group.";
            if(/posting group/i.test(e))return"The BC item is missing a required Posting Group field.";
            if(/429|Too Many/i.test(e))return"BC rate limit was hit during sync — retry sync from the panel.";
            if(/field.*validation/i.test(e))return"A required BC item field failed validation.";
            const m=e.match(/"message":"([^"]{0,160})/);
            return m?m[1]:"BC returned an error when pushing this item.";
          }
          const msg=friendlyErr(e);
          return(
            <div style={{marginBottom:10,background:isBcSetup?"#1a0900":"#160a0a",border:`1px solid ${C.red}`,borderRadius:8,padding:"10px 14px",fontSize:12,display:"flex",flexDirection:"column",gap:4}}>
              <div style={{fontWeight:700,color:C.red,fontSize:13}}>⚠ Last sync failed for this item</div>
              <div style={{color:"#ffb3a7"}}>{msg}</div>
              {isBcSetup&&(
                <div style={{marginTop:4,padding:"6px 10px",background:"#2a1000",borderRadius:6,border:`1px solid ${C.red}55`,color:C.yellow,fontSize:11,fontWeight:600}}>
                  This is a BC data setup issue. The item exists in BC but is missing required posting group fields. You or a BC administrator must open this item in Business Central and fill in the missing Posting Group values before it can be included on a project planning line.
                </div>
              )}
              {isMissing&&(
                <div style={{marginTop:4,color:C.muted,fontSize:11}}>Search for the correct BC item below and select it to replace the part on this BOM row.</div>
              )}
            </div>
          );
        })()}
        {/* Customer Supplied banner */}
        {customerSupplied&&(
          <div style={{marginBottom:10,background:"#1a0d2a",border:`1px solid #a78bfa`,borderRadius:8,padding:"7px 14px",fontSize:12,color:"#a78bfa",fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
            ✔ Customer Supplied — $0 cost will be accepted; row will not highlight red
          </div>
        )}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <input value={query} onChange={e=>onQueryChange(e.target.value)} placeholder="Search items (min 3 chars)…"
            onKeyDown={e=>{if(e.key==="Enter"){if(debounceRef.current)clearTimeout(debounceRef.current);doSearch();}}}
            style={{...inp(),flex:1,minWidth:200}} autoFocus/>
          <select value={field} onChange={e=>{setField(e.target.value);if(query.trim().length>=3)setTimeout(()=>doSearch(false),50);}}
            style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13}}>
            <option value="both">All Fields</option>
            <option value="number">Part # Only</option>
            <option value="displayName">Description Only</option>
          </select>
          <button onClick={()=>doSearch()} disabled={loading||query.trim().length<3}
            style={btn(C.accent,"#fff",{padding:"9px 20px",opacity:loading||query.trim().length<3?0.5:1})}>
            {loading?"Searching…":"Search"}
          </button>
          <button onClick={()=>{setShowCreate(true);setCreateNumber(query||"");setCreateErr("");
            if(!dropdownsLoaded){setDropdownsLoaded(true);
              Promise.all([
                bcListItemCategories().then(v=>{if(v.length)setBcCategories(v);else setDropdownsLoaded(false);}),
                bcListUnitsOfMeasure().then(v=>{if(v.length)setBcUoms(v);else setDropdownsLoaded(false);}),
                bcListVendors().then(v=>{if(v.length)setBcVendors(v);else setDropdownsLoaded(false);}),
                bcListGenProdPostingGroups().then(v=>{if(v.length)setBcGenProdGroups(v);else setDropdownsLoaded(false);}),
                bcListInventoryPostingGroups().then(v=>{if(v.length)setBcInvPostingGroups(v);else setDropdownsLoaded(false);}),
                bcFetchManufacturers().then(v=>{if(v.length)setBcManufacturers(v);}),
              ]);
            }}}
            style={btn("#1a2a1a","#4ade80",{padding:"9px 16px",border:"1px solid #4ade8044",fontSize:13,fontWeight:600})}>
            + New Item
          </button>
          <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",padding:"9px 12px",background:customerSupplied?"#1a0d2a":"transparent",border:`1px solid ${customerSupplied?"#a78bfa":"#3a3a54"}`,borderRadius:8,userSelect:"none",flexShrink:0}}>
            <input type="checkbox" checked={customerSupplied} onChange={e=>setCustomerSupplied(e.target.checked)}
              style={{width:15,height:15,accentColor:"#a78bfa",cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:600,color:customerSupplied?"#a78bfa":C.muted,whiteSpace:"nowrap"}}>Customer Supplied</span>
          </label>
          {customerSupplied&&(
            <button onClick={()=>onSelect({_customerSupplied:true,unitCost:0})}
              style={btn("#1a0d2a","#a78bfa",{padding:"9px 16px",border:"1px solid #a78bfa66",fontSize:13,fontWeight:700,flexShrink:0})}>
              Done ✓
            </button>
          )}
        </div>
        {showCreate&&(
          <div style={{marginBottom:14,padding:14,borderRadius:8,border:`1px solid ${C.border}`,background:"#0a0a12"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:C.text}}>Create New BC Item</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              <div style={{flex:1,minWidth:140}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Part Number</label>
                <input value={createNumber} onChange={e=>setCreateNumber(e.target.value)} placeholder="e.g. MTX-1234"
                  style={{...inp(),width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{flex:2,minWidth:200}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Description</label>
                <input value={createName} onChange={e=>setCreateName(e.target.value)} placeholder="Item description"
                  style={{...inp(),width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{minWidth:110}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Unit Cost</label>
                <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                  <span style={{position:"absolute",left:10,color:C.muted,fontSize:13,pointerEvents:"none"}}>$</span>
                  <input type="text" value={createCost}
                    onChange={e=>setCreateCost(e.target.value.replace(/[^0-9.]/g,''))}
                    onBlur={e=>{const v=parseFloat(e.target.value);setCreateCost(isNaN(v)?'0.00':v.toFixed(2));}}
                    onFocus={e=>e.target.select()}
                    placeholder="0.00"
                    style={{...inp(),width:"100%",boxSizing:"border-box",paddingLeft:22}}/>
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              <div style={{flex:1,minWidth:160}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Item Category</label>
                <select value={createCategory} onChange={e=>setCreateCategory(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcCategories.map(c=><option key={c.code} value={c.code}>{c.code}{c.description?` — ${c.description}`:""}</option>)}
                </select>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Unit of Measure</label>
                <select value={createUom} onChange={e=>setCreateUom(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcUoms.map(u=><option key={u.code} value={u.code}>{u.code}{u.displayName&&u.displayName!==u.code?` — ${u.displayName}`:""}</option>)}
                </select>
              </div>
              <div style={{flex:1,minWidth:180}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <label style={{fontSize:11,color:C.muted}}>Manufacturer</label>
                  {!showNewMfr&&<button type="button" onClick={()=>{setShowNewMfr(true);setNewMfrCode("");setNewMfrName("");setNewMfrErr("");}} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,padding:0,fontWeight:600}}>+ New MFR</button>}
                </div>
                {showNewMfr?(
                  <div style={{background:C.accentDim,border:"1px solid "+C.accent,borderRadius:8,padding:10}}>
                    <input value={newMfrCode} onChange={e=>{setNewMfrCode(e.target.value.toUpperCase());setNewMfrErr("");}} placeholder="Code (e.g. AB) *" maxLength={10} style={{...inp({marginBottom:6,fontSize:12})}}/>
                    {(()=>{const dup=newMfrCode.trim()&&bcManufacturers.find(m=>m.Code.toUpperCase()===newMfrCode.trim().toUpperCase());return dup?<div style={{color:C.yellow,fontSize:11,marginBottom:4}}>⚠ Code "{dup.Code}" already exists — {dup.Name}</div>:null;})()}
                    <input value={newMfrName} onChange={e=>setNewMfrName(e.target.value)} placeholder="Name (e.g. Allen-Bradley) *" style={{...inp({marginBottom:6,fontSize:12})}}/>
                    {newMfrErr&&<div style={{color:C.red,fontSize:11,marginBottom:4}}>{newMfrErr}</div>}
                    <div style={{display:"flex",gap:6}}>
                      <button type="button" disabled={creatingMfr||!newMfrCode.trim()||!newMfrName.trim()||bcManufacturers.some(m=>m.Code.toUpperCase()===newMfrCode.trim().toUpperCase())} onClick={async()=>{
                        setCreatingMfr(true);setNewMfrErr("");
                        try{
                          const code=newMfrCode.trim().slice(0,10);const name=newMfrName.trim();
                          const allPages=await bcDiscoverODataPages();
                          const mPage=allPages.find(n=>n==='Manufacturer'||n==='Manufacturers');
                          if(!mPage)throw new Error("Manufacturer OData page not found in BC");
                          const r=await fetch(`${BC_ODATA_BASE}/${mPage}`,{method:"POST",headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json"},body:JSON.stringify({Code:code,Name:name})});
                          if(!r.ok){const txt=await r.text();throw new Error(`BC error (${r.status}): ${txt}`);}
                          _bcManufacturers=null;
                          const fresh=await bcFetchManufacturers();setBcManufacturers(fresh);
                          setCreateMfr(code);setShowNewMfr(false);
                        }catch(e){setNewMfrErr(e.message||"Failed to create manufacturer");}
                        setCreatingMfr(false);
                      }} style={btn(C.accent,"#fff",{padding:"5px 12px",fontSize:11,fontWeight:700,opacity:creatingMfr||!newMfrCode.trim()||!newMfrName.trim()?0.5:1})}>
                        {creatingMfr?"Creating…":"Create MFR"}
                      </button>
                      <button type="button" onClick={()=>setShowNewMfr(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.muted,fontSize:11,cursor:"pointer"}}>Cancel</button>
                    </div>
                  </div>
                ):(
                  <select value={createMfr} onChange={e=>setCreateMfr(e.target.value)}
                    style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                    <option value="">— None —</option>
                    {bcManufacturers.map(m=><option key={m.Code} value={m.Code}>{m.Code} — {m.Name}</option>)}
                  </select>
                )}
              </div>
              <div style={{flex:1,minWidth:180}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3}}>
                  <label style={{fontSize:11,color:C.muted}}>Vendor</label>
                  {!showNewVendor&&<button type="button" onClick={()=>setShowNewVendor(true)} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,padding:0,fontWeight:600}}>+ New Vendor</button>}
                </div>
                {showNewVendor?(
                  <div style={{background:C.accentDim,border:"1px solid "+C.accent,borderRadius:8,padding:10}}>
                    <input value={newVendorName} onChange={e=>setNewVendorName(e.target.value)} placeholder="Vendor Name *" style={{...inp({marginBottom:6,fontSize:12})}}/>
                    <input value={newVendorPhone} onChange={e=>setNewVendorPhone(e.target.value)} placeholder="Phone (optional)" style={{...inp({marginBottom:6,fontSize:12})}}/>
                    <input value={newVendorEmail} onChange={e=>setNewVendorEmail(e.target.value)} placeholder="Email (optional)" style={{...inp({marginBottom:6,fontSize:12})}}/>
                    <div style={{display:"flex",gap:4,marginBottom:6}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,color:C.muted,marginBottom:2}}>Gen. Bus. Post. Group</div>
                        <select value={newVendorGenBus} onChange={e=>setNewVendorGenBus(e.target.value)} style={{...inp({fontSize:11,padding:"5px 6px",width:"100%",boxSizing:"border-box"})}}>
                          <option value="TRADE">TRADE</option>
                          <option value="DOMESTIC">DOMESTIC</option>
                          <option value="FOREIGN">FOREIGN</option>
                        </select>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,color:C.muted,marginBottom:2}}>Vendor Post. Group</div>
                        <select value={newVendorPostGroup} onChange={e=>setNewVendorPostGroup(e.target.value)} style={{...inp({fontSize:11,padding:"5px 6px",width:"100%",boxSizing:"border-box"})}}>
                          <option value="PARTS">PARTS</option>
                          <option value="TRADE">TRADE</option>
                          <option value="SERVICES">SERVICES</option>
                        </select>
                      </div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,color:C.muted,marginBottom:2}}>Tax Area Code</div>
                        <select value={newVendorTaxArea} onChange={e=>setNewVendorTaxArea(e.target.value)} style={{...inp({fontSize:11,padding:"5px 6px",width:"100%",boxSizing:"border-box"})}}>
                          <option value="NONTAXABLE">NONTAXABLE</option>
                          <option value="">— None —</option>
                        </select>
                      </div>
                    </div>
                    {newVendorErr&&<div style={{fontSize:11,color:C.red,marginBottom:6}}>{newVendorErr}</div>}
                    <div style={{display:"flex",gap:6}}>
                      <button type="button" onClick={()=>{setShowNewVendor(false);setNewVendorName("");setNewVendorPhone("");setNewVendorEmail("");setNewVendorErr("");}} style={btn(C.border,C.sub,{flex:1,fontSize:11,padding:"5px 8px"})}>Cancel</button>
                      <button type="button" disabled={!newVendorName.trim()||creatingVendor} onClick={async()=>{
                        setCreatingVendor(true);setNewVendorErr("");
                        try{
                          const v=await bcCreateVendor(newVendorName.trim(),newVendorPhone.trim(),newVendorEmail.trim(),{genBusPostGroup:newVendorGenBus,vendorPostGroup:newVendorPostGroup,taxAreaCode:newVendorTaxArea});
                          setBcVendors(prev=>[...prev,v].sort((a,b)=>(a.displayName||"").localeCompare(b.displayName||"")));
                          setCreateVendor(v.number);
                          setShowNewVendor(false);setNewVendorName("");setNewVendorPhone("");setNewVendorEmail("");
                        }catch(e){setNewVendorErr(e.message||"Failed");}
                        setCreatingVendor(false);
                      }} style={btn(C.accent,"#fff",{flex:2,fontSize:11,padding:"5px 8px",opacity:!newVendorName.trim()||creatingVendor?0.5:1})}>{creatingVendor?"Creating…":"Create in BC"}</button>
                    </div>
                  </div>
                ):(
                  <select value={createVendor} onChange={e=>setCreateVendor(e.target.value)}
                    style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                    <option value="">— None —</option>
                    {bcVendors.map(v=><option key={v.number} value={v.number}>{v.displayName} ({v.number})</option>)}
                  </select>
                )}
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <div style={{flex:1}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Gen. Prod. Posting Group <span style={{color:C.red}}>*</span></label>
                <select value={createGenProd} onChange={e=>setCreateGenProd(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcGenProdGroups.map(g=><option key={g.code} value={g.code}>{g.code}{g.description?` — ${g.description}`:""}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Inventory Posting Group <span style={{color:C.red}}>*</span></label>
                <select value={createInvPosting} onChange={e=>setCreateInvPosting(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcInvPostingGroups.map(g=><option key={g.code} value={g.code}>{g.code}{g.description?` — ${g.description}`:""}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button disabled={creating||!createNumber.trim()} onClick={async()=>{
                setCreating(true);setCreateErr("");
                try{
                  const created=await bcCreateItem({number:createNumber.trim(),displayName:createName.trim(),unitCost:createCost||undefined,itemCategoryCode:createCategory||undefined,baseUnitOfMeasureCode:createUom||undefined,vendorNo:createVendor||undefined,genProdPostingGroup:createGenProd||undefined,inventoryPostingGroup:createInvPosting||undefined,manufacturerCode:createMfr||undefined});
                  const vendorName=createVendor?((bcVendors.find(v=>v.number===createVendor)||{}).displayName||""):"";
                  // If price entered + vendor selected, prompt to push to BC Purchase Prices
                  if(createCost&&parseFloat(createCost)>0&&createVendor){
                    const pushPrice=confirm(`The price $${parseFloat(createCost).toFixed(2)} was entered for this item.\n\nIs this price from ${vendorName||createVendor}?\n\nClick OK to save this as a Purchase Price in BC.`);
                    if(pushPrice){
                      bcPushPurchasePrice(created.number,createVendor,parseFloat(createCost),Date.now(),"EA")
                        .then(()=>console.log(`[BC] Purchase Price written: ${created.number} @ $${createCost} from ${vendorName}`))
                        .catch(e=>console.warn("[BC] Purchase Price write failed:",e.message));
                    }
                  }
                  onSelect(customerSupplied?{...created,_created:true,_vendorName:vendorName,unitCost:0,_customerSupplied:true}:{...created,_created:true,_vendorName:vendorName});
                }catch(e){setCreateErr(e.message||"Failed to create item");}
                finally{setCreating(false);}
              }} disabled={creating||!createNumber.trim()||!createGenProd||!createInvPosting} style={btn("#166534","#4ade80",{padding:"8px 20px",fontWeight:700,fontSize:13,opacity:creating||!createNumber.trim()||!createGenProd||!createInvPosting?0.5:1})}>
                {creating?"Creating…":"Create in BC"}
              </button>
              <button onClick={()=>{setShowCreate(false);setCreateErr("");}}
                style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,textDecoration:"underline"}}>Cancel</button>
              {createErr&&<div style={{color:C.red,fontSize:12,flex:1}}>{createErr}</div>}
            </div>
          </div>
        )}
        <div style={{flex:1,overflow:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead style={{position:"sticky",top:0,zIndex:1}}>
              <tr style={{background:"#0a0a12"}}>
                {["Part #","Description","MFR","Vendor","Unit Cost","Last Purchased",""].map(h=>(
                  <th key={h} style={{padding:"9px 10px",textAlign:h==="Unit Cost"?"right":"left",color:C.muted,fontWeight:700,fontSize:12,whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((item,i)=>(
                <tr key={item.number+"-"+i}
                  style={{borderBottom:`1px solid ${C.border}33`,background:i%2===0?"transparent":"rgba(255,255,255,0.015)",cursor:"pointer"}}
                  onClick={()=>{const vn=vendorNames[item.number];const it=vn?{...item,_vendorName:vn}:item;onSelect(customerSupplied?{...it,unitCost:0,_customerSupplied:true}:it);}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.accentDim+"44"}
                  onMouseLeave={e=>e.currentTarget.style.background=i%2===0?"transparent":"rgba(255,255,255,0.015)"}>
                  <td style={{padding:"7px 10px",fontWeight:600,whiteSpace:"nowrap"}}>{item.number}</td>
                  <td style={{padding:"7px 10px",color:C.sub}}>{item.displayName}</td>
                  <td style={{padding:"4px 6px",fontSize:11,whiteSpace:"nowrap",minWidth:80}} onClick={e=>e.stopPropagation()}>
                    {inlineMfrCreate===item.number?(
                      <div style={{background:C.accentDim,border:"1px solid "+C.accent,borderRadius:6,padding:6,minWidth:140}}>
                        <input value={inlineMfrCode} onChange={e=>{setInlineMfrCode(e.target.value.toUpperCase());setInlineMfrErr("");}} placeholder="Code *" maxLength={10} autoFocus
                          style={{background:"#0a0a12",border:"1px solid "+C.border,borderRadius:4,padding:"3px 6px",color:C.text,fontSize:11,width:"100%",boxSizing:"border-box",marginBottom:4}}/>
                        {(()=>{const dup=inlineMfrCode.trim()&&bcManufacturers.find(m=>m.Code.toUpperCase()===inlineMfrCode.trim().toUpperCase());return dup?<div style={{color:"#f59e0b",fontSize:10,marginBottom:3}}>⚠ "{dup.Code}" exists — {dup.Name}</div>:null;})()}
                        <input value={inlineMfrName} onChange={e=>setInlineMfrName(e.target.value)} placeholder="Name *"
                          style={{background:"#0a0a12",border:"1px solid "+C.border,borderRadius:4,padding:"3px 6px",color:C.text,fontSize:11,width:"100%",boxSizing:"border-box",marginBottom:4}}/>
                        {inlineMfrErr&&<div style={{color:C.red,fontSize:10,marginBottom:3}}>{inlineMfrErr}</div>}
                        <div style={{display:"flex",gap:4}}>
                          <button disabled={inlineMfrCreating||!inlineMfrCode.trim()||!inlineMfrName.trim()||bcManufacturers.some(m=>m.Code.toUpperCase()===inlineMfrCode.trim().toUpperCase())} onClick={async()=>{
                            setInlineMfrCreating(true);setInlineMfrErr("");
                            try{
                              const code=inlineMfrCode.trim().slice(0,10);const name=inlineMfrName.trim();
                              const allPages=await bcDiscoverODataPages();
                              const mPage=allPages.find(n=>n==='Manufacturer'||n==='Manufacturers');
                              if(!mPage)throw new Error("Manufacturer page not found");
                              const r=await fetch(`${BC_ODATA_BASE}/${mPage}`,{method:"POST",headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json"},body:JSON.stringify({Code:code,Name:name})});
                              if(!r.ok){const txt=await r.text();throw new Error(txt.slice(0,120));}
                              _bcManufacturers=null;const fresh=await bcFetchManufacturers();setBcManufacturers(fresh);
                              // Now assign it to the item
                              const iPage=allPages.find(n=>/^ItemCard$/i.test(n));
                              if(iPage){const gr=await fetch(`${BC_ODATA_BASE}/${iPage}?$filter=No eq '${item.number}'`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
                                if(gr.ok){const rec=((await gr.json()).value||[])[0];if(rec){const etag=rec["@odata.etag"]||"*";
                                  await fetch(`${BC_ODATA_BASE}/${iPage}('${item.number}')`,{method:"PATCH",headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":etag},body:JSON.stringify({Manufacturer_Code:code})});}}}
                              setMfrCodes(prev=>({...prev,[item.number]:code}));
                              setInlineMfrCreate(null);
                            }catch(e){setInlineMfrErr(e.message||"Failed");}
                            setInlineMfrCreating(false);
                          }} style={{background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",opacity:inlineMfrCreating||!inlineMfrCode.trim()||!inlineMfrName.trim()?0.5:1}}>
                            {inlineMfrCreating?"…":"Create & Assign"}
                          </button>
                          <button onClick={()=>setInlineMfrCreate(null)} style={{background:"none",border:"1px solid "+C.border,borderRadius:4,padding:"2px 6px",fontSize:10,color:C.muted,cursor:"pointer"}}>✕</button>
                        </div>
                      </div>
                    ):editMfrItem===item.number?(
                      <div>
                        {React.createElement("select",{value:editMfrCode,autoFocus:true,disabled:savingMfr,
                          onChange:async function(e){
                            var code=e.target.value;
                            if(code==="__NEW__"){setEditMfrItem(null);setInlineMfrCreate(item.number);setInlineMfrCode("");setInlineMfrName("");setInlineMfrErr("");return;}
                            setEditMfrCode(code);setSavingMfr(true);
                            try{var allPages=await bcDiscoverODataPages();var iPage=allPages.find(function(n){return /^ItemCard$/i.test(n);});
                              if(iPage){var gr=await fetch(BC_ODATA_BASE+"/"+iPage+"?$filter=No eq '"+item.number+"'",{headers:{"Authorization":"Bearer "+_bcToken}});
                                if(gr.ok){var gd=await gr.json();var rec=(gd.value||[])[0];if(rec){var etag=rec["@odata.etag"]||"*";
                                  await fetch(BC_ODATA_BASE+"/"+iPage+"('"+item.number+"')",{method:"PATCH",headers:{"Authorization":"Bearer "+_bcToken,"Content-Type":"application/json","If-Match":etag},body:JSON.stringify({Manufacturer_Code:code})});
                                }}}
                              setMfrCodes(function(prev){var n=Object.assign({},prev);n[item.number]=code;return n;});
                            }catch(ex){console.warn("MFR save failed:",ex);}
                            setSavingMfr(false);setEditMfrItem(null);
                          },
                          onBlur:function(){if(!savingMfr)setEditMfrItem(null);},
                          style:{background:"#0a0a12",border:"1px solid "+C.accent,borderRadius:6,padding:"3px 6px",color:C.text,fontSize:11,width:"100%",opacity:savingMfr?0.6:1}},
                          React.createElement("option",{value:""},"—"),
                          React.createElement("option",{value:"__NEW__",style:{color:"#38bdf8",fontWeight:700}},"+ New MFR…"),
                          ...(bcManufacturers.map(function(m){return React.createElement("option",{key:m.Code,value:m.Code},m.Code);}))
                        )}
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:4,cursor:"default"}}>
                        <span style={{color:mfrCodes[item.number]?C.sub:C.muted,fontSize:11}}>{mfrCodes[item.number]||"—"}</span>
                        <button title="Edit manufacturer" onClick={function(){setEditMfrItem(item.number);setEditMfrCode(mfrCodes[item.number]||"");if(!bcManufacturers.length)bcFetchManufacturers().then(function(v){setBcManufacturers(v);});}}
                          style={{background:"none",border:"1px solid "+C.border,borderRadius:4,padding:"1px 4px",fontSize:9,color:C.muted,cursor:"pointer",opacity:0.7}}
                          onMouseEnter={function(e){e.target.style.borderColor=C.accent;e.target.style.color=C.accent;e.target.style.opacity=1;}}
                          onMouseLeave={function(e){e.target.style.borderColor=C.border;e.target.style.color=C.muted;e.target.style.opacity=0.7;}}>✎</button>
                      </div>
                    )}
                  </td>
                  <td style={{padding:"4px 6px",fontSize:12,whiteSpace:"nowrap",minWidth:160}} onClick={e=>e.stopPropagation()}>
                    {inlineVendorCreate===item.number?(
                      <div style={{background:C.accentDim,border:"1px solid "+C.accent,borderRadius:6,padding:6,minWidth:160}}>
                        <input value={inlineVendorName} onChange={e=>setInlineVendorName(e.target.value)} placeholder="Vendor Name *" autoFocus
                          style={{background:"#0a0a12",border:"1px solid "+C.border,borderRadius:4,padding:"3px 6px",color:C.text,fontSize:11,width:"100%",boxSizing:"border-box",marginBottom:4}}/>
                        {inlineVendorErr&&<div style={{color:C.red,fontSize:10,marginBottom:3}}>{inlineVendorErr}</div>}
                        <div style={{display:"flex",gap:4}}>
                          <button disabled={inlineVendorCreating||!inlineVendorName.trim()} onClick={async()=>{
                            setInlineVendorCreating(true);setInlineVendorErr("");
                            try{
                              const v=await bcCreateVendor(inlineVendorName.trim(),"","",{genBusPostGroup:"TRADE",vendorPostGroup:"PARTS",taxAreaCode:"NONTAXABLE"});
                              // Refresh vendor list
                              const fresh=await bcListVendors();if(fresh.length)setBcVendors(fresh);
                              // Assign to item
                              await saveVendorEdit(item.number,v.number);
                              setVendorNames(prev=>({...prev,[item.number]:v.displayName||inlineVendorName.trim()}));
                              setInlineVendorCreate(null);
                            }catch(e){setInlineVendorErr(e.message||"Failed");}
                            setInlineVendorCreating(false);
                          }} style={{background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",opacity:inlineVendorCreating||!inlineVendorName.trim()?0.5:1}}>
                            {inlineVendorCreating?"…":"Create & Assign"}
                          </button>
                          <button onClick={()=>setInlineVendorCreate(null)} style={{background:"none",border:"1px solid "+C.border,borderRadius:4,padding:"2px 6px",fontSize:10,color:C.muted,cursor:"pointer"}}>✕</button>
                        </div>
                      </div>
                    ):editVendorItem===item.number?(
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        <select value={editVendorNo} autoFocus
                          onChange={async e=>{const no=e.target.value;
                            if(no==="__NEW__"){setEditVendorItem(null);setInlineVendorCreate(item.number);setInlineVendorName("");setInlineVendorErr("");return;}
                            setEditVendorNo(no);await saveVendorEdit(item.number,no);}}
                          onBlur={()=>{if(!savingVendor){setEditVendorItem(null);setVendorSaveErr("");}}}
                          disabled={savingVendor}
                          style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 8px",color:C.text,fontSize:12,width:"100%",opacity:savingVendor?0.6:1}}>
                          <option value="">— None —</option>
                          <option value="__NEW__" style={{color:"#38bdf8",fontWeight:700}}>+ New Vendor…</option>
                          {bcVendors.map(v=><option key={v.number} value={v.number}>{v.displayName} ({v.number})</option>)}
                        </select>
                        {savingVendor&&<span style={{fontSize:10,color:C.muted}}>Saving…</span>}
                        {vendorSaveErr&&<span style={{color:C.red,fontSize:10}}>{vendorSaveErr}</span>}
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:6,cursor:"default"}}>
                        <span style={{color:vendorNames[item.number]?C.sub:C.muted}}>{vendorNames[item.number]||"—"}</span>
                        <button title="Edit vendor in BC" onClick={()=>startEditVendor(item)}
                          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 6px",fontSize:10,color:C.muted,cursor:"pointer",flexShrink:0,opacity:0.7}}
                          onMouseEnter={e=>{e.target.style.borderColor=C.accent;e.target.style.color=C.accent;e.target.style.opacity=1;}}
                          onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.muted;e.target.style.opacity=0.7;}}>
                          ✎
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
                    {purchaseData[item.number]?.directUnitCost!=null?(
                      <span title="Last PO cost">${purchaseData[item.number].directUnitCost.toFixed(2)}</span>
                    ):item.unitCost!=null?"$"+item.unitCost.toFixed(2):"—"}
                  </td>
                  <td style={{padding:"7px 10px",color:C.muted,fontSize:12,whiteSpace:"nowrap"}}>
                    {purchaseData[item.number]?.postingDate?fmtDate(purchaseData[item.number].postingDate):(purchaseData[item.number]===null?"No POs":"…")}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <button onClick={e=>{e.stopPropagation();const vn=vendorNames[item.number];const it=vn?{...item,_vendorName:vn}:item;onSelect(customerSupplied?{...it,unitCost:0,_customerSupplied:true}:it);}}
                      style={btn(C.accentDim,C.accent,{fontSize:11,padding:"3px 12px",border:`1px solid ${C.accent}55`})}>Use</button>
                  </td>
                </tr>
              ))}
              {results.length===0&&searched&&!loading&&(
                <tr><td colSpan={6} style={{padding:30,textAlign:"center",color:C.muted}}>No items found.</td></tr>
              )}
              {results.length===0&&!searched&&!loading&&(
                <tr><td colSpan={6} style={{padding:30,textAlign:"center",color:C.muted}}>Enter a search term and click Search.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {hasMore&&(
          <button onClick={()=>doSearch(true)} disabled={loading}
            style={btn(C.border,C.sub,{marginTop:10,width:"100%",textAlign:"center",opacity:loading?0.5:1})}>
            {loading?"Loading…":"Load More"}
          </button>
        )}
        {/* Drawing reference — full-width strip at bottom */}
        {bomPages.length>0&&(
          <div style={{borderTop:`1px solid ${C.border}`,marginTop:10}}>
            <div style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:0.5}}>DRAWING REFERENCE</span>
              {locating&&<span style={{fontSize:11,color:C.yellow,animation:"pulse 1s ease-in-out infinite"}}>🔍 Scanning for {targetRow?.partNumber||initialQuery}…</span>}
              {!locating&&croppedDataUrl&&<span style={{fontSize:11,color:"#4ade80",fontWeight:600}}>✓ Row found</span>}
              {!locating&&!croppedDataUrl&&_apiKey&&<span style={{fontSize:11,color:C.muted}}>Row not found in drawing</span>}
              {bomPages.length>1&&(
                <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
                  {bomPages.map((_,i)=>(
                    <button key={i} onClick={()=>{setDrawingPageIdx(i);const pg=bomPages[i];if(targetRow?.y_top!=null&&targetRow?.y_bottom!=null&&(targetRow.y_bottom-targetRow.y_top)>0.001&&pg){setLocating(true);const doLoad=async()=>{try{let du=pg.dataUrl;if(!du&&pg.storageUrl){const l=await ensureDataUrl(pg);du=l.dataUrl;}if(du)await cropRowFromImage(du,targetRow.y_top,targetRow.y_bottom,targetRow.pn_x);}catch(e){}finally{setLocating(false);}};doLoad();}else locateInDrawing(i);}}
                      style={{background:drawingPageIdx===i?C.accentDim:"transparent",border:`1px solid ${drawingPageIdx===i?C.accent:C.border}`,color:drawingPageIdx===i?C.accent:C.muted,borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>
                      Pg {i+1}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div
              onMouseDown={e=>{const c=e.currentTarget;c._drag={x:e.clientX,y:e.clientY,sl:c.scrollLeft,st:c.scrollTop};c.style.cursor='grabbing';e.preventDefault();}}
              onMouseMove={e=>{const c=e.currentTarget;if(!c._drag)return;c.scrollLeft=c._drag.sl-(e.clientX-c._drag.x);c.scrollTop=c._drag.st-(e.clientY-c._drag.y);}}
              onMouseUp={e=>{e.currentTarget._drag=null;e.currentTarget.style.cursor='grab';}}
              onMouseLeave={e=>{e.currentTarget._drag=null;e.currentTarget.style.cursor='grab';}}
              style={{overflow:"auto",background:"#020208",borderRadius:"0 0 8px 8px",minHeight:locating?60:croppedDataUrl?undefined:0,maxHeight:300,cursor:"grab",userSelect:"none"}}>
              {locating&&!croppedDataUrl&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:60,color:C.muted,fontSize:12,gap:8}}>
                  <span style={{animation:"pulse 1s ease-in-out infinite"}}>🔍</span> Locating row in drawing…
                </div>
              )}
              {croppedDataUrl&&(
                <img src={croppedDataUrl} alt="BOM row" draggable={false}
                  onLoad={e=>{const c=e.target.parentElement;if(c){c.scrollLeft=_cropRowCenter.current.scrollToX;c.scrollTop=_cropRowCenter.current.scrollToY;}}}
                  style={{display:"block",maxWidth:"none",height:"auto",pointerEvents:"none"}}/>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default BCItemBrowserModal;

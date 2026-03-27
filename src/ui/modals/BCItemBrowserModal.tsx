import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _apiKey, _bcToken } from '@/core/globals';
import { getPageTypes } from '@/core/helpers';
import { ensureDataUrl } from '@/scanning/pdfExtractor';
import {
  searchItems as bcSearchItems,
  createItem as bcCreateItem,
  patchItemOData as bcPatchItemOData,
  bcListItemCategories,
  bcListUnitsOfMeasure,
  bcListGenProdPostingGroups,
  bcListInventoryPostingGroups,
} from '@/services/businessCentral/items';
import {
  getItemVendorNo as bcGetItemVendorNo,
  getVendorName as bcGetVendorName,
  getLastPurchase as bcGetLastPurchase,
  getAllVendors as bcListVendors,
} from '@/services/businessCentral/vendors';

function BCItemBrowserModal({onSelect,onClose,initialQuery,targetRow,pages,syncError}: any){
  const [query,setQuery]=useState(initialQuery||"");
  const [field,setField]=useState("both");
  const [results,setResults]=useState<any[]>([]);
  const [loading,setLoading]=useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [skip,setSkip]=useState(0);
  const [searched,setSearched]=useState(false);
  const debounceRef=useRef<any>(null);
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
  const [bcCategories,setBcCategories]=useState<any[]>([]);
  const [bcUoms,setBcUoms]=useState<any[]>([]);
  const [bcVendors,setBcVendors]=useState<any[]>([]);
  const [bcGenProdGroups,setBcGenProdGroups]=useState<any[]>([]);
  const [bcInvPostingGroups,setBcInvPostingGroups]=useState<any[]>([]);
  const [createGenProd,setCreateGenProd]=useState("INVENTORY");
  const [createInvPosting,setCreateInvPosting]=useState("RAW MAT");
  const [dropdownsLoaded,setDropdownsLoaded]=useState(false);
  const [croppedDataUrl,setCroppedDataUrl]=useState<string|null>(null);
  const [locating,setLocating]=useState(false);
  const [drawingPageIdx,setDrawingPageIdx]=useState(0);
  const [vendorNames,setVendorNames]=useState<any>({});
  const [purchaseData,setPurchaseData]=useState<any>({});
  const [customerSupplied,setCustomerSupplied]=useState(false);
  const [editVendorItem,setEditVendorItem]=useState<any>(null);
  const [editVendorNo,setEditVendorNo]=useState("");
  const [savingVendor,setSavingVendor]=useState(false);
  const [vendorSaveErr,setVendorSaveErr]=useState("");
  const [vendorListLoaded,setVendorListLoaded]=useState(false);
  const bomPages=((pages||[]).filter((p: any)=>getPageTypes(p).includes('bom')&&(p.dataUrl||p.storageUrl)));

  async function locateInDrawing(pgIdx?: any){
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
      const refHint=refLine?`\nIMPORTANT: The BOM line/item number for this row is "${refLine}". Find this number in the first column (labeled ITEM, REF, LINE, #, or similar) — it uniquely identifies the row.`:'';
      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","x-api-key":_apiKey!,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:"claude-sonnet-4-5-20250514",max_tokens:200,messages:[{role:"user",content:[
          {type:"image",source:{type:"base64",media_type:"image/jpeg",data:b64}},
          {type:"text",text:`This is a BOM (Bill of Materials) table from an electrical panel drawing. I need you to find the EXACT row for part number "${pn}".${refHint}

INSTRUCTIONS:
1. First, find the BOM table in the image. It usually has columns like ITEM, QTY, PART NUMBER/CATALOG NUMBER, DESCRIPTION, MFR.
2. Scan through the rows to find the one matching the part number above${refLine?' (or matching item number '+refLine+')':''}.
3. Measure PRECISELY: y_top = fraction from image top to the TOP EDGE of that row's horizontal gridline. y_bottom = fraction from image top to the BOTTOM EDGE of that row's horizontal gridline.
4. pn_x = fraction from image left edge to the CENTER of the part number text in that row.

Return ONLY JSON: {"found":true,"y_top":0.45,"y_bottom":0.47,"pn_x":0.60}
If the part is not visible in this image: {"found":false}`}
        ]}]})
      });
      const data=await resp.json();
      const text=data.content?.[0]?.text||'';
      const m=text.match(/\{[\s\S]*?\}/);
      if(m){
        const r=JSON.parse(m[0]);
        if(r.found&&r.y_top!=null&&r.y_bottom!=null){
          await cropRowFromImage(dataUrl,r.y_top,r.y_bottom,r.pn_x);
        }
      }
    }catch(e){console.warn('locateInDrawing:',e);}
    finally{setLocating(false);}
  }

  const _cropRowCenter=useRef({scrollToY:0,scrollToX:0});
  function cropRowFromImage(dataUrl: string,yTop: number,yBottom: number,pnX?: number){
    return new Promise<void>(resolve=>{
      const img=new Image();
      img.onload=()=>{
        const W=img.naturalWidth,H=img.naturalHeight;
        const srcRowH=Math.round((yBottom-yTop)*H);
        const scale=Math.max(1,50/Math.max(srcRowH,1));
        const canvasW=Math.round(W*scale);
        const canvasH=Math.round(H*scale);
        const canvas=document.createElement('canvas');
        canvas.width=canvasW;canvas.height=canvasH;
        const ctx=canvas.getContext('2d')!;
        ctx.drawImage(img,0,0,W,H,0,0,canvasW,canvasH);
        const rowTopC=Math.round(yTop*canvasH);
        const rowBotC=Math.round(yBottom*canvasH);
        const rowH=Math.max(3,rowBotC-rowTopC);
        ctx.fillStyle='rgba(253,224,71,0.22)';
        ctx.fillRect(0,rowTopC,canvasW,rowH);
        ctx.strokeStyle='#fde047';ctx.lineWidth=2;
        ctx.strokeRect(1,rowTopC+1,canvasW-2,rowH-2);
        const scrollX=pnX!=null?Math.max(0,Math.round(pnX*canvasW)-200):Math.round(canvasW*0.55);
        _cropRowCenter.current={scrollToY:Math.max(0,rowTopC-80),scrollToX:scrollX};
        setCroppedDataUrl(canvas.toDataURL('image/jpeg',0.95));
        resolve();
      };
      img.onerror=()=>resolve();
      img.src=dataUrl;
    });
  }

  useEffect(()=>{
    if(bomPages.length&&_apiKey){
      const pgIdx=targetRow?.sourcePageIdx??0;
      locateInDrawing(pgIdx);
    } else {
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

  async function doSearch(append=false,overrideQuery?: any){
    const q=overrideQuery!==undefined?overrideQuery:query;
    const s=append?skip:0;
    if(!q.trim()||q.trim().length<3){
      if(!append){setResults([]);setSearched(false);setHasMore(false);}
      return;
    }
    setLoading(true);
    const r=await bcSearchItems(q,{field: field as any,top:PAGE,skip:s});
    if(append){setResults(prev=>[...prev,...r.items]);}
    else{setResults(r.items);setSkip(0);}
    setHasMore(r.hasMore);
    setSkip(s+PAGE);
    setSearched(true);
    setLoading(false);
    const items=append?[...results,...r.items]:r.items;
    enrichVendorNames(items);
  }

  async function enrichVendorNames(items: any[]){
    if(!_bcToken||!items.length)return;
    const toFetch=items.filter((it: any)=>it.number&&vendorNames[it.number]===undefined);
    if(!toFetch.length)return;
    const vBatch: any={};const pBatch: any={};
    for(const it of toFetch){
      const vNo=await bcGetItemVendorNo(it.number);
      vBatch[it.number]=vNo?await bcGetVendorName(vNo):"";
      const lp=await bcGetLastPurchase(it.number);
      pBatch[it.number]=lp||null;
    }
    setVendorNames((prev: any)=>({...prev,...vBatch}));
    setPurchaseData((prev: any)=>({...prev,...pBatch}));
  }

  function onQueryChange(val: string){
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

  function fmtDate(iso: string){
    if(!iso)return"\u2014";
    try{const d=new Date(iso);return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}catch(e){return"\u2014";}
  }

  async function startEditVendor(item: any){
    setVendorSaveErr("");
    setEditVendorNo(vendorNames[item.number]?"":item.vendorNo||"");
    setEditVendorItem(item.number);
    if(!vendorListLoaded){
      setVendorListLoaded(true);
      const v=await bcListVendors();
      if(v.length)setBcVendors(v);else setVendorListLoaded(false);
    }
  }

  async function saveVendorEdit(itemNo: string,vendorNo: string){
    setSavingVendor(true);setVendorSaveErr("");
    try{
      await bcPatchItemOData(itemNo,{Vendor_No:vendorNo});
      const name=vendorNo?(bcVendors.find((v: any)=>v.number===vendorNo)||{}).displayName||vendorNo:"";
      setVendorNames((prev: any)=>({...prev,[itemNo]:name}));
      setEditVendorItem(null);
    }catch(e: any){
      setVendorSaveErr(e.message||"Failed to update vendor");
    }
    setSavingVendor(false);
  }

  const backdropMdRef=useRef(false);
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onMouseDown={(e: any)=>{backdropMdRef.current=e.target===e.currentTarget;}}
      onClick={(e: any)=>{if(backdropMdRef.current)onClose();}}>
      <div style={{...card(),width:"100%",maxWidth:860,maxHeight:"90vh",display:"flex",flexDirection:"column"}} onClick={(e: any)=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:12}}>
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
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,flexShrink:0}}>&#10005;</button>
        </div>
        {/* BC Sync Error banner */}
        {syncError&&(()=>{
          const e=syncError.error||"";
          const isBcSetup=/Posting Group/i.test(e);
          const isMissing=/must select an existing item/i.test(e);
          function friendlyErr(e: string){
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
              <div style={{fontWeight:700,color:C.red,fontSize:13}}>&#9888; Last sync failed for this item</div>
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
            &#10004; Customer Supplied — $0 cost will be accepted; row will not highlight red
          </div>
        )}
        <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
          <input value={query} onChange={(e: any)=>onQueryChange(e.target.value)} placeholder="Search items (min 3 chars)..."
            onKeyDown={(e: any)=>{if(e.key==="Enter"){if(debounceRef.current)clearTimeout(debounceRef.current);doSearch();}}}
            style={{...inp(),flex:1,minWidth:200}} autoFocus/>
          <select value={field} onChange={(e: any)=>{setField(e.target.value);if(query.trim().length>=3)setTimeout(()=>doSearch(false),50);}}
            style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13}}>
            <option value="both">All Fields</option>
            <option value="number">Part # Only</option>
            <option value="displayName">Description Only</option>
          </select>
          <button onClick={()=>doSearch()} disabled={loading||query.trim().length<3}
            style={btn(C.accent,"#fff",{padding:"9px 20px",opacity:loading||query.trim().length<3?0.5:1})}>
            {loading?"Searching...":"Search"}
          </button>
          <button onClick={()=>{setShowCreate(true);setCreateNumber(query||"");setCreateErr("");
            if(!dropdownsLoaded){setDropdownsLoaded(true);
              Promise.all([
                bcListItemCategories().then((v: any[])=>{if(v.length)setBcCategories(v);else setDropdownsLoaded(false);}),
                bcListUnitsOfMeasure().then((v: any[])=>{if(v.length)setBcUoms(v);else setDropdownsLoaded(false);}),
                bcListVendors().then((v: any[])=>{if(v.length)setBcVendors(v);else setDropdownsLoaded(false);}),
                bcListGenProdPostingGroups().then((v: any[])=>{if(v.length)setBcGenProdGroups(v);else setDropdownsLoaded(false);}),
                bcListInventoryPostingGroups().then((v: any[])=>{if(v.length)setBcInvPostingGroups(v);else setDropdownsLoaded(false);}),
              ]);
            }}}
            style={btn("#1a2a1a","#4ade80",{padding:"9px 16px",border:"1px solid #4ade8044",fontSize:13,fontWeight:600})}>
            + New Item
          </button>
          <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",padding:"9px 12px",background:customerSupplied?"#1a0d2a":"transparent",border:`1px solid ${customerSupplied?"#a78bfa":"#3a3a54"}`,borderRadius:8,userSelect:"none",flexShrink:0}}>
            <input type="checkbox" checked={customerSupplied} onChange={(e: any)=>setCustomerSupplied(e.target.checked)}
              style={{width:15,height:15,accentColor:"#a78bfa",cursor:"pointer"}}/>
            <span style={{fontSize:12,fontWeight:600,color:customerSupplied?"#a78bfa":C.muted,whiteSpace:"nowrap"}}>Customer Supplied</span>
          </label>
          {customerSupplied&&(
            <button onClick={()=>onSelect({_customerSupplied:true,unitCost:0})}
              style={btn("#1a0d2a","#a78bfa",{padding:"9px 16px",border:"1px solid #a78bfa66",fontSize:13,fontWeight:700,flexShrink:0})}>
              Done &#10003;
            </button>
          )}
        </div>
        {showCreate&&(
          <div style={{marginBottom:14,padding:14,borderRadius:8,border:`1px solid ${C.border}`,background:"#0a0a12"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:C.text}}>Create New BC Item</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              <div style={{flex:1,minWidth:140}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Part Number</label>
                <input value={createNumber} onChange={(e: any)=>setCreateNumber(e.target.value)} placeholder="e.g. MTX-1234"
                  style={{...inp(),width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{flex:2,minWidth:200}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Description</label>
                <input value={createName} onChange={(e: any)=>setCreateName(e.target.value)} placeholder="Item description"
                  style={{...inp(),width:"100%",boxSizing:"border-box"}}/>
              </div>
              <div style={{minWidth:110}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Unit Cost</label>
                <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                  <span style={{position:"absolute",left:10,color:C.muted,fontSize:13,pointerEvents:"none"}}>$</span>
                  <input type="text" value={createCost}
                    onChange={(e: any)=>setCreateCost(e.target.value.replace(/[^0-9.]/g,''))}
                    onBlur={(e: any)=>{const v=parseFloat(e.target.value);setCreateCost(isNaN(v)?'0.00':v.toFixed(2));}}
                    onFocus={(e: any)=>e.target.select()}
                    placeholder="0.00"
                    style={{...inp(),width:"100%",boxSizing:"border-box",paddingLeft:22}}/>
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              <div style={{flex:1,minWidth:160}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Item Category</label>
                <select value={createCategory} onChange={(e: any)=>setCreateCategory(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcCategories.map((c: any)=><option key={c.code} value={c.code}>{c.code}{c.description?` — ${c.description}`:""}</option>)}
                </select>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Unit of Measure</label>
                <select value={createUom} onChange={(e: any)=>setCreateUom(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcUoms.map((u: any)=><option key={u.code} value={u.code}>{u.code}{u.displayName&&u.displayName!==u.code?` — ${u.displayName}`:""}</option>)}
                </select>
              </div>
              <div style={{flex:1,minWidth:180}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Vendor</label>
                <select value={createVendor} onChange={(e: any)=>setCreateVendor(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcVendors.map((v: any)=><option key={v.number} value={v.number}>{v.displayName} ({v.number})</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <div style={{flex:1}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Gen. Prod. Posting Group</label>
                <select value={createGenProd} onChange={(e: any)=>setCreateGenProd(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcGenProdGroups.map((g: any)=><option key={g.code} value={g.code}>{g.code}{g.description?` — ${g.description}`:""}</option>)}
                </select>
              </div>
              <div style={{flex:1}}>
                <label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>Inventory Posting Group</label>
                <select value={createInvPosting} onChange={(e: any)=>setCreateInvPosting(e.target.value)}
                  style={{background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"9px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"}}>
                  <option value="">— None —</option>
                  {bcInvPostingGroups.map((g: any)=><option key={g.code} value={g.code}>{g.code}{g.description?` — ${g.description}`:""}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <button disabled={creating||!createNumber.trim()} onClick={async()=>{
                setCreating(true);setCreateErr("");
                try{
                  const created=await bcCreateItem({number:createNumber.trim(),displayName:createName.trim(),unitCost:createCost?parseFloat(createCost):undefined,itemCategoryCode:createCategory||undefined,baseUnitOfMeasureCode:createUom||undefined,vendorNo:createVendor||undefined,genProdPostingGroup:createGenProd||undefined,inventoryPostingGroup:createInvPosting||undefined});
                  const vendorName=createVendor?((bcVendors.find((v: any)=>v.number===createVendor)||{}).displayName||""):"";
                  onSelect(customerSupplied?{...created,_created:true,_vendorName:vendorName,unitCost:0,_customerSupplied:true}:{...created,_created:true,_vendorName:vendorName});
                }catch(e: any){setCreateErr(e.message||"Failed to create item");}
                finally{setCreating(false);}
              }} style={btn("#166534","#4ade80",{padding:"8px 20px",fontWeight:700,fontSize:13,opacity:creating||!createNumber.trim()?0.5:1})}>
                {creating?"Creating...":"Create in BC"}
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
                {["Part #","Description","Vendor","Unit Cost","Last Purchased",""].map((h: string)=>(
                  <th key={h} style={{padding:"9px 10px",textAlign:h==="Unit Cost"?"right":"left",color:C.muted,fontWeight:700,fontSize:12,whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.map((item: any,i: number)=>(
                <tr key={item.number+"-"+i}
                  style={{borderBottom:`1px solid ${C.border}33`,background:i%2===0?"transparent":"rgba(255,255,255,0.015)",cursor:"pointer"}}
                  onClick={()=>{const vn=vendorNames[item.number];const it=vn?{...item,_vendorName:vn}:item;onSelect(customerSupplied?{...it,unitCost:0,_customerSupplied:true}:it);}}
                  onMouseEnter={(e: any)=>e.currentTarget.style.background=C.accentDim+"44"}
                  onMouseLeave={(e: any)=>e.currentTarget.style.background=i%2===0?"transparent":"rgba(255,255,255,0.015)"}>
                  <td style={{padding:"7px 10px",fontWeight:600,whiteSpace:"nowrap"}}>{item.number}</td>
                  <td style={{padding:"7px 10px",color:C.sub}}>{item.displayName}</td>
                  <td style={{padding:"4px 6px",fontSize:12,whiteSpace:"nowrap",minWidth:160}} onClick={(e: any)=>e.stopPropagation()}>
                    {editVendorItem===item.number?(
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        <select value={editVendorNo} autoFocus
                          onChange={async(e: any)=>{const no=e.target.value;setEditVendorNo(no);await saveVendorEdit(item.number,no);}}
                          onBlur={()=>{if(!savingVendor){setEditVendorItem(null);setVendorSaveErr("");}}}
                          disabled={savingVendor}
                          style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:6,padding:"4px 8px",color:C.text,fontSize:12,width:"100%",opacity:savingVendor?0.6:1}}>
                          <option value="">— None —</option>
                          {bcVendors.map((v: any)=><option key={v.number} value={v.number}>{v.displayName} ({v.number})</option>)}
                        </select>
                        {savingVendor&&<span style={{fontSize:10,color:C.muted}}>Saving...</span>}
                        {vendorSaveErr&&<span style={{color:C.red,fontSize:10}}>{vendorSaveErr}</span>}
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",gap:6,cursor:"default"}}>
                        <span style={{color:vendorNames[item.number]?C.sub:C.muted}}>{vendorNames[item.number]||"\u2014"}</span>
                        <button title="Edit vendor in BC" onClick={()=>startEditVendor(item)}
                          style={{background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 6px",fontSize:10,color:C.muted,cursor:"pointer",flexShrink:0,opacity:0.7}}
                          onMouseEnter={(e: any)=>{e.target.style.borderColor=C.accent;e.target.style.color=C.accent;e.target.style.opacity='1';}}
                          onMouseLeave={(e: any)=>{e.target.style.borderColor=C.border;e.target.style.color=C.muted;e.target.style.opacity='0.7';}}>
                          &#9998;
                        </button>
                      </div>
                    )}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"right",fontVariantNumeric:"tabular-nums"}}>
                    {purchaseData[item.number]?.directUnitCost!=null?(
                      <span title="Last PO cost">${purchaseData[item.number].directUnitCost.toFixed(2)}</span>
                    ):item.unitCost!=null?"$"+item.unitCost.toFixed(2):"\u2014"}
                  </td>
                  <td style={{padding:"7px 10px",color:C.muted,fontSize:12,whiteSpace:"nowrap"}}>
                    {purchaseData[item.number]?.postingDate?fmtDate(purchaseData[item.number].postingDate):(purchaseData[item.number]===null?"No POs":"...")}
                  </td>
                  <td style={{padding:"7px 10px",textAlign:"center"}}>
                    <button onClick={(e: any)=>{e.stopPropagation();const vn=vendorNames[item.number];const it=vn?{...item,_vendorName:vn}:item;onSelect(customerSupplied?{...it,unitCost:0,_customerSupplied:true}:it);}}
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
            {loading?"Loading...":"Load More"}
          </button>
        )}
        {/* Drawing reference — full-width strip at bottom */}
        {bomPages.length>0&&(
          <div style={{borderTop:`1px solid ${C.border}`,marginTop:10}}>
            <div style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:11,fontWeight:700,color:C.muted,letterSpacing:0.5}}>DRAWING REFERENCE</span>
              {locating&&<span style={{fontSize:11,color:C.yellow,animation:"pulse 1s ease-in-out infinite"}}>&#128269; Scanning for {targetRow?.partNumber||initialQuery}...</span>}
              {!locating&&croppedDataUrl&&<span style={{fontSize:11,color:"#4ade80",fontWeight:600}}>&#10003; Row found</span>}
              {!locating&&!croppedDataUrl&&_apiKey&&<span style={{fontSize:11,color:C.muted}}>Row not found in drawing</span>}
              {bomPages.length>1&&(
                <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
                  {bomPages.map((_: any,i: number)=>(
                    <button key={i} onClick={()=>{setDrawingPageIdx(i);const pg=bomPages[i];if(targetRow?.y_top!=null&&targetRow?.y_bottom!=null&&(targetRow.y_bottom-targetRow.y_top)>0.001&&pg){setLocating(true);const doLoad=async()=>{try{let du=pg.dataUrl;if(!du&&pg.storageUrl){const l=await ensureDataUrl(pg);du=l.dataUrl;}if(du)await cropRowFromImage(du,targetRow.y_top,targetRow.y_bottom,targetRow.pn_x);}catch(e){}finally{setLocating(false);}};doLoad();}else locateInDrawing(i);}}
                      style={{background:drawingPageIdx===i?C.accentDim:"transparent",border:`1px solid ${drawingPageIdx===i?C.accent:C.border}`,color:drawingPageIdx===i?C.accent:C.muted,borderRadius:4,padding:"2px 8px",fontSize:11,cursor:"pointer"}}>
                      Pg {i+1}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div
              onMouseDown={(e: any)=>{const c=e.currentTarget;c._drag={x:e.clientX,y:e.clientY,sl:c.scrollLeft,st:c.scrollTop};c.style.cursor='grabbing';e.preventDefault();}}
              onMouseMove={(e: any)=>{const c=e.currentTarget;if(!c._drag)return;c.scrollLeft=c._drag.sl-(e.clientX-c._drag.x);c.scrollTop=c._drag.st-(e.clientY-c._drag.y);}}
              onMouseUp={(e: any)=>{e.currentTarget._drag=null;e.currentTarget.style.cursor='grab';}}
              onMouseLeave={(e: any)=>{e.currentTarget._drag=null;e.currentTarget.style.cursor='grab';}}
              style={{overflow:"auto",background:"#020208",borderRadius:"0 0 8px 8px",minHeight:locating?60:croppedDataUrl?undefined:0,maxHeight:300,cursor:"grab",userSelect:"none"}}>
              {locating&&!croppedDataUrl&&(
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:60,color:C.muted,fontSize:12,gap:8}}>
                  <span style={{animation:"pulse 1s ease-in-out infinite"}}>&#128269;</span> Locating row in drawing...
                </div>
              )}
              {croppedDataUrl&&(
                <img src={croppedDataUrl} alt="BOM row" draggable={false}
                  onLoad={(e: any)=>{const c=e.target.parentElement;if(c){c.scrollLeft=_cropRowCenter.current.scrollToX;c.scrollTop=_cropRowCenter.current.scrollToY;}}}
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

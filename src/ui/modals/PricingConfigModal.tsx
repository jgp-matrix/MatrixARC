import { useState, useEffect, useRef } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import {
  fbDb, _appCtx, _pricingConfig, _defaultBomItems, _bcToken,
  saveDefaultBomItems,
} from '@/core/globals';
import firebase from 'firebase/compat/app';
import 'firebase/compat/storage';

// ── Inline stubs for functions not yet extracted ──
const fbStorage = firebase.storage();

const LABOR_RATE_DEFAULTS: any = {
  pmMinPerUnit:60, buyoffMinPerUnit:60, cratingMinPerUnit:60,
  wireMinPerPoint:10, doorDeviceMinPerDevice:11, mountingMinPerDevice:4,
  ductDinMinPerFoot:10, holesMinPerHole:15, hmiHoleEquivalent:25,
  squareCutoutMinPerCut:180,
};
let LABOR_RATES: any = {...LABOR_RATE_DEFAULTS};

function isAdmin(): boolean { return !!_appCtx.companyId && _appCtx.role === "admin"; }

async function savePricingConfig(uid: any, cfg: any) {
  (_pricingConfig as any).contingencyBOM = cfg.contingencyBOM;
  (_pricingConfig as any).contingencyConsumables = cfg.contingencyConsumables;
  (_pricingConfig as any).budgetaryContingencyPct = cfg.budgetaryContingencyPct;
  const path = _appCtx.configPath ? `${_appCtx.configPath}/pricing` : `users/${uid}/config/pricing`;
  await fbDb.doc(path).set(cfg);
}

async function saveLaborRates(uid: any, rates: any) {
  Object.assign(LABOR_RATES, rates);
  const path = _appCtx.configPath ? `${_appCtx.configPath}/laborRates` : `users/${uid}/config/laborRates`;
  await fbDb.doc(path).set(rates);
}

async function bcSearchItems(q: string, opts?: any): Promise<any> { return { items: [], hasMore: false }; }

function TooltipToggle() {
  return null; // stub — tooltip toggle not yet migrated
}

export default function PricingConfigModal({uid,onClose,onLogoChange}: any){
  const [bomVal,setBomVal]=useState((_pricingConfig as any).contingencyBOM);
  const [consVal,setConsVal]=useState((_pricingConfig as any).contingencyConsumables);
  const [budgPct,setBudgPct]=useState((_pricingConfig as any).budgetaryContingencyPct??20);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  // Auto-Add BOM Items state
  const [defaultItems,setDefaultItems]=useState<any[]>(()=>[..._defaultBomItems]);
  const [bcQuery,setBcQuery]=useState("");
  const [bcResults,setBcResults]=useState<any[]>([]);
  const [bcSearching,setBcSearching]=useState(false);
  const bcDebounce=useRef<any>(null);
  const [manualDesc,setManualDesc]=useState("");
  const [manualPrice,setManualPrice]=useState("");

  // Labor rates state (admin only)
  const [laborRates,setLaborRates]=useState<any>(()=>({...LABOR_RATES}));

  // Logo upload (admin + company only)
  const canUploadLogo=!!(_appCtx.companyId&&_appCtx.role==="admin");
  const [logoUrl,setLogoUrl]=useState<any>(null);
  const [logoUploading,setLogoUploading]=useState(false);
  const [logoErr,setLogoErr]=useState("");
  const logoInputRef=useRef<any>(null);
  useEffect(()=>{
    if(!_appCtx.companyId)return;
    fbDb.doc(`companies/${_appCtx.companyId}`).get().then((d: any)=>{
      if(d.exists){
        setLogoUrl(d.data().logoUrl||null);
      }
    }).catch(()=>{});
  },[]);
  async function uploadLogo(file: any){
    if(!file)return;
    setLogoErr("");setLogoUploading(true);
    try{
      const ref=fbStorage.ref(`companies/${_appCtx.companyId}/logo`);
      await ref.put(file,{contentType:file.type});
      const url=await ref.getDownloadURL();
      await fbDb.doc(`companies/${_appCtx.companyId}`).update({logoUrl:url});
      setLogoUrl(url);
      if(onLogoChange)onLogoChange(url);
    }catch(e: any){setLogoErr("Upload failed: "+(e.message||e));}
    setLogoUploading(false);
  }
  async function removeLogo(){
    setLogoErr("");
    try{
      await fbDb.doc(`companies/${_appCtx.companyId}`).update({logoUrl:firebase.firestore.FieldValue.delete()});
      setLogoUrl(null);
      if(onLogoChange)onLogoChange(null);
    }catch(e: any){setLogoErr("Remove failed: "+(e.message||e));}
  }
  function fmtDate(iso: any){
    if(!iso)return"—";
    try{const d=new Date(iso);return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}catch(e){return"—";}
  }

  async function doBcSearch(q: any){
    if(!q||q.trim().length<3){setBcResults([]);return;}
    setBcSearching(true);
    const r=await bcSearchItems(q.trim(),{top:10});
    setBcResults(r.items||[]);
    setBcSearching(false);
  }

  function onBcQueryChange(val: any){
    setBcQuery(val);
    if(bcDebounce.current)clearTimeout(bcDebounce.current);
    if(val.trim().length>=3){
      bcDebounce.current=setTimeout(()=>doBcSearch(val),350);
    } else {setBcResults([]);}
  }

  function addBcItem(item: any){
    if(bcDebounce.current){clearTimeout(bcDebounce.current);bcDebounce.current=null;}
    const exists=defaultItems.some((d: any)=>(d.description||"").toLowerCase()===((item.displayName||"").toLowerCase()));
    if(!exists){
      setDefaultItems((prev: any)=>[...prev,{partNumber:item.number||"",description:item.displayName||"",manufacturer:"",qty:1,unitPrice:item.unitCost??item.unitPrice??0,priceSource:"bc",priceDate:Date.now()}]);
    }
    setBcQuery("");setBcResults([]);setBcSearching(false);
  }

  function addManualItem(){
    const desc=manualDesc.trim();
    if(!desc)return;
    const exists=defaultItems.some((d: any)=>(d.description||"").toLowerCase()===desc.toLowerCase());
    if(exists)return;
    setDefaultItems((prev: any)=>[...prev,{partNumber:"",description:desc,manufacturer:"",qty:1,unitPrice:+manualPrice||0,priceSource:null,priceDate:Date.now()}]);
    setManualDesc("");setManualPrice("");
  }

  function removeItem(idx: any){setDefaultItems((prev: any)=>prev.filter((_: any,i: any)=>i!==idx));}

  async function save(){
    setSaving(true);
    await Promise.all([
      savePricingConfig(uid,{contingencyBOM:bomVal,contingencyConsumables:consVal,budgetaryContingencyPct:budgPct}),
      saveDefaultBomItems(uid,defaultItems),
      isAdmin()?saveLaborRates(uid,laborRates):Promise.resolve()
    ]);
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),2000);
  }

  useEffect(()=>()=>{if(bcDebounce.current)clearTimeout(bcDebounce.current);},[]);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{...card(),width:"100%",maxWidth:540,maxHeight:"90vh",overflowY:"auto"}} onClick={(e: any)=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
          <div style={{fontSize:18,fontWeight:700}}>Pricing Configuration</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:"0 2px",lineHeight:1}}>✕</button>
        </div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Default contingencies applied when opening a new project</div>
        {([
          ["BOM Contingency","Default amount added to every quote for miscellaneous BOM items","$",bomVal,setBomVal,"number","50"],
          ["Wire / Zip Ties / etc.","Default amount for consumables (wire, zip ties, sticky backs, etc.)","$",consVal,setConsVal,"number","50"],
        ] as any[]).map(([label,desc,prefix,val,setter,type,step]: any)=>(
          <div key={label} style={{marginBottom:16}}>
            <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>{label}</label>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:C.muted,fontSize:14}}>{prefix}</span>
              <input type={type} min="0" step={step} value={val} onChange={(e: any)=>setter(Math.max(0,+e.target.value||0))} style={{...inp(),width:140,textAlign:"right" as const}}/>
            </div>
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>{desc}</div>
          </div>
        ))}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>Budgetary Contingency %</label>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <input type="number" min="0" max="100" step="1" value={budgPct} onChange={(e: any)=>setBudgPct(Math.max(0,+e.target.value||0))} style={{...inp(),width:140,textAlign:"right" as const}}/>
            <span style={{color:C.muted,fontSize:14}}>%</span>
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:4}}>Hidden buffer added to budgetary sell price (default 20%)</div>
        </div>

        {/* ── AUTO-ADD BOM ITEMS ── */}
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:16,marginBottom:16}}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>Auto-Add BOM Items</label>
          <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Items below are automatically added to every BOM after extraction</div>

          {/* BC search */}
          <div style={{marginBottom:10}}>
            <input value={bcQuery} onChange={(e: any)=>onBcQueryChange(e.target.value)}
              placeholder={_bcToken?"Search BC items (min 3 chars)…":"Connect BC to search items"}
              disabled={!_bcToken}
              onKeyDown={(e: any)=>{if(e.key==="Enter"&&bcQuery.trim().length>=3){if(bcDebounce.current)clearTimeout(bcDebounce.current);doBcSearch(bcQuery);}}}
              style={{...inp(),width:"100%",boxSizing:"border-box" as const,fontSize:13,opacity:_bcToken?1:0.5}}/>
            {bcSearching&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>Searching…</div>}
            {bcResults.length>0&&(
              <div style={{border:`1px solid ${C.border}`,borderRadius:8,marginTop:6,maxHeight:200,overflowY:"auto" as const,background:C.bg}}>
                <div style={{display:"grid",gridTemplateColumns:"110px 1fr 80px 90px",gap:0,fontSize:10,color:C.muted,fontWeight:600,padding:"5px 10px",borderBottom:`1px solid ${C.border}`,textTransform:"uppercase" as const,letterSpacing:0.3,position:"sticky" as const,top:0,background:C.bg}}>
                  <div>Part #</div><div>Description</div><div style={{textAlign:"right" as const}}>Unit Cost</div><div style={{textAlign:"right" as const}}>Modified</div>
                </div>
                {bcResults.map((item: any,i: any)=>(
                  <div key={i} onClick={()=>addBcItem(item)} style={{display:"grid",gridTemplateColumns:"110px 1fr 80px 90px",gap:0,padding:"7px 10px",cursor:"pointer",borderBottom:`1px solid ${C.border}22`,fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={(e: any)=>e.currentTarget.style.background=C.accent+"22"} onMouseLeave={(e: any)=>e.currentTarget.style.background="transparent"}>
                    <div style={{color:C.accent,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{item.number}</div>
                    <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const,paddingRight:8}}>{item.displayName}</div>
                    <div style={{textAlign:"right" as const,color:C.green}}>{item.unitCost!=null?"$"+item.unitCost.toFixed(2):"—"}</div>
                    <div style={{textAlign:"right" as const,color:C.muted}}>{fmtDate(item.lastModifiedDateTime)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual add */}
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            <input value={manualDesc} onChange={(e: any)=>setManualDesc(e.target.value)} placeholder="Description (manual)" style={{...inp(),flex:1,fontSize:12}}
              onKeyDown={(e: any)=>{if(e.key==="Enter")addManualItem();}}/>
            <div style={{display:"flex",alignItems:"center",gap:2}}>
              <span style={{color:C.muted,fontSize:12}}>$</span>
              <input type="number" min="0" step="0.01" value={manualPrice} onChange={(e: any)=>setManualPrice(e.target.value)} placeholder="0.00" style={{...inp(),width:80,fontSize:12,textAlign:"right" as const}}
                onFocus={(e: any)=>e.target.select()}
                onKeyDown={(e: any)=>{if(e.key==="Enter")addManualItem();}}/>
            </div>
            <button onClick={addManualItem} disabled={!manualDesc.trim()} style={btn(C.accent,"#fff",{padding:"6px 14px",fontSize:12,opacity:manualDesc.trim()?1:0.4})}>Add</button>
          </div>

          {/* Saved defaults list */}
          {defaultItems.length>0&&(
            <div style={{border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"50px 100px 1fr 80px 32px",gap:0,fontSize:10,color:C.muted,fontWeight:600,padding:"5px 10px",background:C.bg,textTransform:"uppercase" as const,letterSpacing:0.3,borderBottom:`1px solid ${C.border}`}}>
                <div>Qty</div><div>Part #</div><div>Description</div><div style={{textAlign:"right" as const}}>Price</div><div></div>
              </div>
              {defaultItems.map((item: any,i: any)=>{
                const zeroPrice=!item.unitPrice;
                return(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"50px 100px 1fr 80px 32px",gap:0,padding:"4px 10px",fontSize:12,borderBottom:i<defaultItems.length-1?`1px solid ${C.border}22`:"none",background:zeroPrice?"#ff000011":"transparent",alignItems:"center"}}>
                    <input type="number" min="1" step="1" value={item.qty||1} onChange={(e: any)=>{const q=Math.max(1,+e.target.value||1);setDefaultItems((prev: any)=>prev.map((it: any,j: any)=>j===i?{...it,qty:q}:it));}} onFocus={(e: any)=>e.target.select()} style={{...inp(),width:40,fontSize:12,textAlign:"center" as const,padding:"3px 4px"}}/>
                    <div style={{color:C.accent,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{item.partNumber||"—"}</div>
                    <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" as const}}>{item.description}</div>
                    <div style={{textAlign:"right" as const,color:zeroPrice?C.red:C.green}}>{item.unitPrice?"$"+Number(item.unitPrice).toFixed(2):"$0.00"}</div>
                    <button onClick={()=>removeItem(i)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:0,lineHeight:1}} title="Remove">✕</button>
                  </div>
                );
              })}
            </div>
          )}
          {defaultItems.length===0&&<div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>No auto-add items configured</div>}
        </div>

        {canUploadLogo&&(
          <div style={{marginTop:20,paddingTop:16,borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:13,fontWeight:700,color:C.sub,marginBottom:10}}>Company Logo</div>
            <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" as const}}>
              {logoUrl?(
                <img src={logoUrl} alt="Company logo" style={{maxHeight:56,maxWidth:160,objectFit:"contain" as const,borderRadius:6,border:`1px solid ${C.border}`,background:"#fff",padding:4}}/>
              ):(
                <div style={{width:100,height:56,borderRadius:6,border:`1px dashed ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontSize:11}}>No logo</div>
              )}
              <div style={{display:"flex",flexDirection:"column" as const,gap:6}}>
                <input ref={logoInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={(e: any)=>uploadLogo(e.target.files[0])}/>
                <button onClick={()=>logoInputRef.current.click()} disabled={logoUploading} style={btn(C.accent,"#fff",{fontSize:12,padding:"6px 14px",opacity:logoUploading?0.6:1})}>
                  {logoUploading?"Uploading…":"Upload Logo"}
                </button>
                {logoUrl&&<button onClick={removeLogo} style={btn(C.border,C.red,{fontSize:12,padding:"6px 14px"})}>Remove</button>}
              </div>
            </div>
            {logoErr&&<div style={{fontSize:12,color:C.red,marginTop:6}}>{logoErr}</div>}
            <div style={{fontSize:11,color:C.muted,marginTop:6}}>PNG, JPG, or SVG recommended. Displayed in the header top-left.</div>
          </div>
        )}

        {/* ── LABOR RATES (admin only) ── */}
        {isAdmin()&&(
          <div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:16,marginBottom:4}}>
            <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:4,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>Labor Category Rates <span style={{fontSize:9,color:C.red,fontWeight:700,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",borderRadius:4,padding:"1px 5px",marginLeft:6,verticalAlign:"middle"}}>ADMIN ONLY</span></label>
            <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Minutes per unit for each labor category. Changes apply to all future estimates.</div>
            {([
              ["wireMinPerPoint","Wire Time","min / wire point"],
              ["doorDeviceMinPerDevice","Door Wiring","min / device"],
              ["mountingMinPerDevice","Device Mounting","min / device"],
              ["ductDinMinPerFoot","Duct & DIN Rail","min / foot"],
              ["holesMinPerHole","Panel Holes","min / hole"],
              ["hmiHoleEquivalent","HMI Hole Equivalent","holes per HMI cutout"],
              ["squareCutoutMinPerCut","Square Cutout","min / cutout"],
              ["pmMinPerUnit","Project Mgmt","min / session"],
              ["cratingMinPerUnit","Crating","min / crate"],
            ] as any[]).map(([key,label,unit]: any)=>(
              <div key={key} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <div style={{flex:1,fontSize:12,color:C.text,fontWeight:500}}>{label}</div>
                <input type="number" min="0" step="1" value={laborRates[key]??LABOR_RATE_DEFAULTS[key]}
                  onChange={(e: any)=>setLaborRates((prev: any)=>({...prev,[key]:Math.max(0,+e.target.value||0)}))}
                  onFocus={(e: any)=>e.target.select()}
                  style={{...inp(),width:70,textAlign:"right" as const,fontSize:12,padding:"4px 6px"}}/>
                <div style={{fontSize:11,color:C.muted,width:120}}>{unit}</div>
              </div>
            ))}
            <button onClick={()=>setLaborRates({...LABOR_RATE_DEFAULTS})}
              style={{...btn(C.border,C.muted,{fontSize:11,padding:"4px 10px",marginTop:4})}}>
              Reset to Defaults
            </button>
          </div>
        )}

        {/* ── UI PREFERENCES ── */}
        <div style={{borderTop:`1px solid ${C.border}`,marginTop:8,paddingTop:16,marginBottom:4}}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:8,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>UI Preferences</label>
          <TooltipToggle/>
        </div>

        <div style={{display:"flex",gap:10,marginTop:16}}>
          <button onClick={onClose} style={btn(C.border,C.sub,{flex:1})}>Cancel</button>
          <button onClick={save} disabled={saving} style={btn(saved?C.green:C.accent,"#fff",{flex:2,opacity:saving?0.6:1})}>
            {saving?"Saving…":saved?"✓ Saved":"Save Defaults"}
          </button>
        </div>
        <button onClick={onClose} style={{display:"block",width:"100%",marginTop:10,background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 0",color:C.muted,cursor:"pointer",fontSize:13}}>Close</button>
      </div>
    </div>
  );
}

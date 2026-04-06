// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';
import { bcPatchPanelEndDate } from '@/services/businessCentral/projects';

function PoReceivedModal({project,bcProjectNumber,onClose,onDone}){
  const panels=project.panels||[];
  const [poNumber,setPoNumber]=useState('');
  const [globalDate,setGlobalDate]=useState('');
  const [perPanel,setPerPanel]=useState(false);
  const [shipDates,setShipDates]=useState(()=>{const m={};panels.forEach((p,i)=>{m[i]=p.requestedShipDate||'';});return m;});
  const [saving,setSaving]=useState(false);
  const [done,setDone]=useState(false);
  const [errors,setErrors]=useState([]);

  // When global date changes, pre-fill any per-panel slot that hasn't been individually set
  function handleGlobalDate(val){
    setGlobalDate(val);
    if(!perPanel)return;
    setShipDates(prev=>{
      const next={...prev};
      panels.forEach((_,i)=>{if(!next[i]||next[i]===globalDate)next[i]=val;});
      return next;
    });
  }

  // Switching to per-panel mode seeds all rows with the current global date
  function enablePerPanel(){
    if(globalDate){
      setShipDates(prev=>{
        const next={...prev};
        panels.forEach((_,i)=>{if(!next[i])next[i]=globalDate;});
        return next;
      });
    }
    setPerPanel(true);
  }

  async function handleSubmit(){
    if(!poNumber.trim()){alert("Please enter a PO number.");return;}
    if(!bcProjectNumber){alert("No BC Project Number on this project. Cannot write to BC.");return;}
    setSaving(true);setErrors([]);
    const errs=[];
    try{
      const _poFields={External_Document_No:poNumber.trim(),Status:"Open"};
      await bcPatchJobOData(bcProjectNumber,_poFields).catch(e=>{
        if(!_bcToken)bcEnqueue('patchJob',{projectNumber:bcProjectNumber,fields:_poFields},`Update BC project ${bcProjectNumber}`);
        else throw e;
      });
    }catch(e){errs.push("Project header: "+(e.message||e));}
    // Determine which date to use per panel
    for(let i=0;i<panels.length;i++){
      const d=perPanel?(shipDates[i]||globalDate):globalDate;
      if(!d)continue;
      try{
        await bcPatchPanelEndDate(bcProjectNumber,i+1,d);
      }catch(e){errs.push(`Panel ${i+1} end date: `+(e.message||e));}
    }
    setSaving(false);
    if(errs.length>0){setErrors(errs);}
    else{setDone(true);if(onDone)onDone(poNumber.trim());}
  }
  const inp=(extra={})=>({width:"100%",boxSizing:"border-box",background:"#0a0a18",border:"1px solid #3d6090",borderRadius:4,padding:"6px 8px",color:"#f1f5f9",fontSize:12,fontFamily:"inherit",outline:"none",...extra});
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:480,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:4}}>📬 PO Received</div>
        <div style={{fontSize:12,color:"#94a3b8",marginBottom:18}}>Writes PO# to BC External Document No, sets project status to Open, and updates panel ship dates.</div>
        {done?(
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:22,marginBottom:8}}>✅</div>
            <div style={{fontSize:14,color:"#4ade80",fontWeight:700,marginBottom:4}}>PO Recorded in BC</div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:20}}>PO# <strong style={{color:"#f1f5f9"}}>{poNumber}</strong> written to project {bcProjectNumber}.</div>
            <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 20px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Close</button>
          </div>
        ):(
          <>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,color:"#94a3b8",marginBottom:5,fontWeight:600}}>Customer PO Number</div>
              <input value={poNumber} onChange={e=>setPoNumber(e.target.value)} placeholder="e.g. PO-12345" style={inp()} autoFocus/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>
                  {perPanel?"Ship Dates by Panel":"Requested Ship Date"}
                </div>
                {panels.length>1&&(
                  <button onClick={perPanel?()=>setPerPanel(false):enablePerPanel}
                    style={{background:perPanel?"#1a1a2a":"#0d1a2a",border:`1px solid ${perPanel?"#475569":"#3b82f6"}`,color:perPanel?"#94a3b8":"#60a5fa",fontSize:11,fontWeight:700,cursor:"pointer",padding:"3px 10px",borderRadius:5,fontFamily:"inherit",letterSpacing:0.3}}>
                    {perPanel?"Single Date":"Separate Dates"}
                  </button>
                )}
              </div>
              {!perPanel?(
                <input type="date" value={globalDate} onChange={e=>handleGlobalDate(e.target.value)}
                  style={inp({colorScheme:"dark"})}/>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:220,overflowY:"auto"}}>
                  {panels.map((p,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"#111128",border:"1px solid #3d6090",borderRadius:6,padding:"8px 10px"}}>
                      <span style={{flex:1,fontSize:12,color:"#f1f5f9",fontWeight:600,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.drawingDesc||p.drawingNo||p.name||`Panel ${i+1}`}</span>
                      <input type="date" value={shipDates[i]||''}
                        onChange={e=>setShipDates(prev=>({...prev,[i]:e.target.value}))}
                        style={inp({width:140,flex:"none",colorScheme:"dark"})}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {errors.length>0&&(
              <div style={{background:"#1a0a0a",border:"1px solid #f87171",borderRadius:6,padding:"8px 10px",marginBottom:12}}>
                {errors.map((e,i)=><div key={i} style={{fontSize:11,color:"#f87171"}}>{e}</div>)}
              </div>
            )}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={onClose} disabled={saving} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Cancel</button>
              <button onClick={handleSubmit} disabled={saving||!poNumber.trim()} style={{background:"#0d2010",border:"1px solid #4ade80",color:"#4ade80",padding:"7px 20px",borderRadius:6,cursor:saving?"not-allowed":"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700,opacity:saving||!poNumber.trim()?0.6:1}}>{saving?"Writing to BC…":"Submit PO"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  ,document.body);
}

export default PoReceivedModal;

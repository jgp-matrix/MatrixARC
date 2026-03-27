import { useState, useEffect } from 'react';
import React from 'react';
import { C, btn, inp, card } from '@/core/constants';
import {
  _bcConfig, _pricingConfig, _apiKey,
  saveProject,
} from '@/core/globals';
import { ErrorBoundary } from '@/ui/stubs';
import PanelCard from '@/ui/panels/PanelCard';
import ConfidenceBar from '@/ui/shared/ConfidenceBar';
import ContingencyInput from '@/ui/shared/ContingencyInput';
import Badge from '@/ui/shared/Badge';
import EngineeringQuestionsModal from '@/ui/modals/EngineeringQuestionsModal';
import { computeLaborEstimate } from '@/bom/laborEstimator';
import { getPageTypes, appendDefaultBomItems } from '@/core/helpers';
import { runPanelValidation } from '@/bom/validator';

// ─── Stub functions not yet extracted ────────────────────────────────────────
function useCustomerLogo(name: any): string | null { return null; }
function isAdmin(): boolean { return true; }
function isReadOnly(): boolean { return false; }
async function bcUpdateProject(bcProjectId: string, name: string): Promise<boolean> { return false; }

export default function PanelListView({project,uid,readOnly,onBack,onViewQuote,onPrintRfq,onSendRfqEmails,onShowRfqHistory,rfqLoading,onUpdate,onDelete,onTransfer,onCopy,onOpenSupplierQuote,pendingRfqUploads,onPoReceived,relinking,relinkMsg,onRelink}: any){
  const [editingName,setEditingName]=useState(false);
  const [draftName,setDraftName]=useState(project.name||"");
  const [bcSyncMsg,setBcSyncMsg]=useState<any>(null);
  const [validating,setValidating]=useState(false);
  const [validateMsg,setValidateMsg]=useState("");
  const [showDeleteAdminWarn,setShowDeleteAdminWarn]=useState(false);
  const customerLogo=useCustomerLogo(project.bcCustomerName||null);
  const isBcDisconnected=!!((project as any).bcEnv&&(project as any).bcEnv!==(_bcConfig as any)?.env);
  const [selectedPanelId,setSelectedPanelId]=useState(()=>(project.panels||[])[0]?.id||null);
  const [eqModalPanelId,setEqModalPanelId]=useState<any>(null);
  const [fbLaborMoreInfo,setFbLaborMoreInfo]=useState(false);
  const [fbcConnecting,setFbcConnecting]=useState(false);
  const [fbcError,setFbcError]=useState("");
  useEffect(()=>{
    const ids=(project.panels||[]).map((p: any)=>p.id);
    if(!selectedPanelId||!ids.includes(selectedPanelId))setSelectedPanelId(ids[0]||null);
  },[project.panels]);

  function addPanel(){
    const n=(project.panels||[]).length+1;
    const newPanel={id:'panel-'+Date.now(),name:`Panel ${n}`,pages:[],bom:[],validation:null,pricing:null,budgetaryQuote:null,status:'draft'};
    onUpdate({...project,panels:[...(project.panels||[]),newPanel]});
  }
  function deletePanel(id: string){
    if(!window.confirm("Delete this panel and all its data?"))return;
    onUpdate({...project,panels:(project.panels||[]).filter((p: any)=>p.id!==id)});
  }
  async function saveImmediatePanel(panelId: string,updatedPanel: any){
    const newPanels=(project.panels||[]).map((p: any)=>p.id===panelId?updatedPanel:p);
    const updatedProject={...project,panels:newPanels};
    await saveProject(uid,updatedProject);
    onUpdate(updatedProject);
  }
  function saveSelectedPricing(patch: any){
    const sp=(project.panels||[]).find((p: any)=>p.id===selectedPanelId);
    if(!sp)return;
    const updated={...sp,pricing:{...(sp.pricing||{}),...patch}};
    saveImmediatePanel(sp.id,updated);
  }
  function saveSelectedLaborOverride(field: string,value: any){
    const sp=(project.panels||[]).find((p: any)=>p.id===selectedPanelId);
    if(!sp)return;
    const ld=sp.laborData||{};
    const updated={...sp,laborData:{...ld,overrides:{...(ld.overrides||{}),[field]:value}}};
    saveImmediatePanel(sp.id,updated);
  }
  function saveSelectedLaborAccepted(category: string,accepted: boolean){
    const sp=(project.panels||[]).find((p: any)=>p.id===selectedPanelId);
    if(!sp)return;
    const ld=sp.laborData||{};
    const updated={...sp,laborData:{...ld,accepted:{...(ld.accepted||{}),[category]:accepted}}};
    saveImmediatePanel(sp.id,updated);
  }
  function selectedOnUpdate(updatedPanel: any){
    const newPanels=(project.panels||[]).map((p: any)=>p.id===updatedPanel.id?updatedPanel:p);
    onUpdate({...project,panels:newPanels});
  }
  function selectedOnSaveImmediate(updatedPanel: any){
    saveImmediatePanel(updatedPanel.id,updatedPanel);
  }
  async function saveName(){
    if(!draftName.trim())return;
    const updated={...project,name:draftName.trim()};
    onUpdate(updated);
    await saveProject(uid,updated);
    setEditingName(false);
    if(project.bcProjectId){
      setBcSyncMsg({ok:null,text:"Syncing to BC\u2026"});
      const ok=await bcUpdateProject(project.bcProjectId,draftName.trim());
      setBcSyncMsg({ok,text:ok?"\u2713 Name synced to Business Central":"\u26A0 BC sync failed \u2014 check connection"});
      setTimeout(()=>setBcSyncMsg(null),4000);
    }
  }
  async function validateAll(){
    if(!_apiKey)return;
    setValidating(true);
    let panels=[...(project.panels||[])];
    for(let i=0;i<panels.length;i++){
      const p=panels[i];
      const hasSchOrLayout=(p.pages||[]).some((pg: any)=>(getPageTypes(pg).includes("schematic")||getPageTypes(pg).includes("layout")||getPageTypes(pg).includes("backpanel")||getPageTypes(pg).includes("enclosure"))&&(pg.dataUrl||pg.storageUrl));
      if(!hasSchOrLayout)continue;
      setValidateMsg(`Validating ${p.name||"Panel "+(i+1)}\u2026`);
      const result: any=await runPanelValidation(p);
      if(result.validation||result.laborData){const bom=await appendDefaultBomItems(p.bom||[]);panels[i]={...p,bom,...(result.validation?{validation:result.validation}:{}),...(result.laborData?{laborData:result.laborData}:{}),status:"validated"};}
    }
    const updatedProject={...project,panels};
    onUpdate(updatedProject);
    await saveProject(uid,updatedProject);
    setValidating(false);
    setValidateMsg("");
  }
  const panels=project.panels||[];
  return(<>
    <div style={{height:"calc(100vh - 88px)",display:"flex",flexDirection:"column",background:C.bg}}>
      <div style={{background:C.bg,borderBottom:`1px solid ${C.border}`,padding:"6px 24px",display:"flex",alignItems:"center",gap:12,minHeight:40,flexShrink:0}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:6,background:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,cursor:"pointer",borderRadius:8,padding:"8px 18px",fontSize:14,fontWeight:700,whiteSpace:"nowrap",flexShrink:0}}>{"\u2190"} Back to Projects</button>
        {readOnly&&<span style={{background:C.border,color:C.muted,borderRadius:20,padding:"2px 10px",fontSize:13,fontWeight:700}}>VIEW ONLY</span>}
      </div>
      <div style={{flex:1,display:"flex",minHeight:0}}>
        <div style={{flex:1,overflowY:"auto",padding:24,minWidth:0}}>
        <div style={{maxWidth:1400,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
            <div>
              {editingName?(
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <input value={draftName} onChange={e=>setDraftName(e.target.value)} autoFocus
                    style={{...inp(),fontSize:18,fontWeight:700,padding:"4px 10px",minWidth:240}}
                    onKeyDown={e=>{if(e.key==="Enter")saveName();if(e.key==="Escape")setEditingName(false);}}/>
                  <button onClick={saveName} style={btn(C.accent,"#fff",{fontSize:13,padding:"4px 12px"})}>{"\u2713"}</button>
                  <button onClick={()=>setEditingName(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  {customerLogo && (<img src={customerLogo} alt="" style={{width:36,height:36,objectFit:"contain",borderRadius:6,background:"#fff",padding:2,flexShrink:0}} onError={(e: any)=>{(e.target as any).style.display="none";}}/>)}
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    {(project.bcProjectNumber||project.bcCustomerName)&&(
                      <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                        {project.bcProjectNumber&&<span style={{fontSize:26,fontWeight:800,color:project.bcEnv&&project.bcEnv!==(_bcConfig as any)?.env?"#64748b":C.accent,lineHeight:1}}>{project.bcProjectNumber}</span>}
                        {isBcDisconnected&&<span style={{fontSize:11,fontWeight:700,color:C.yellow,background:"rgba(234,179,8,0.1)",border:"1px solid rgba(234,179,8,0.3)",borderRadius:12,padding:"2px 10px",whiteSpace:"nowrap"}} title={"Linked to "+project.bcEnv}>{"\u26A0"} BC Disconnected</span>}
                        {isBcDisconnected&&!readOnly&&onRelink&&<button onClick={(e: any)=>{e.stopPropagation();onRelink();}} disabled={relinking} style={{fontSize:11,fontWeight:700,color:"#38bdf8",background:"rgba(56,189,248,0.08)",border:"1px solid rgba(56,189,248,0.3)",borderRadius:12,padding:"2px 10px",cursor:relinking?"wait":"pointer",whiteSpace:"nowrap",opacity:relinking?0.6:1}}>{relinking?"Re-linking\u2026":"\uD83D\uDD17 Re-link to BC"}</button>}
                        {project.bcCustomerName&&<span style={{fontSize:18,fontWeight:700,color:C.text}}>{project.bcCustomerName}</span>}
                      </div>
                    )}
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:20,fontWeight:700,color:C.text}}>{project.name}</span>
                      {!readOnly&&<button onClick={()=>{setDraftName(project.name);setEditingName(true);}} title="Edit project name" style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>{"\u270F\uFE0F"}</button>}
                      {project.importedFromBC&&<Badge status="imported"/>}
                    </div>
                    <span style={{fontSize:13,color:C.muted}}>Created: {project.createdAt?new Date(project.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):project.updatedAt?new Date(project.updatedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"\u2014"}</span>
                  </div>
                </div>
              )}
              {bcSyncMsg&&<div style={{fontSize:12,color:bcSyncMsg.ok===null?C.muted:bcSyncMsg.ok?C.green:C.yellow,marginBottom:2}}>{bcSyncMsg.text}</div>}
              {relinkMsg&&<div style={{fontSize:12,color:relinkMsg.startsWith("\u2713")?C.green:relinkMsg.startsWith("Failed")?C.red:C.muted,marginBottom:2}}>{relinkMsg}</div>}
              <div style={{fontSize:13,color:C.muted}}>{panels.length} panel{panels.length!==1?"s":""}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={!readOnly?addPanel:undefined} disabled={readOnly} style={btn(C.accent,"#fff",{fontSize:13,opacity:readOnly?0.4:1})}>+ Add Panel</button>
              {!readOnly&&onCopy&&(
                <button onClick={onCopy} style={btn(C.accentDim,C.accent,{border:`1px solid ${C.accent}`,fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>{"\u29C9"} Copy</button>
              )}
              {!readOnly&&onTransfer&&(
                <button onClick={onTransfer} style={btn(C.accentDim,C.accent,{border:`1px solid ${C.accent}`,fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>{"\u21C4"} Transfer</button>
              )}
              {!readOnly&&onDelete&&(
                <button onClick={()=>{if(isAdmin())onDelete();else setShowDeleteAdminWarn(true);}} style={btn(C.redDim,C.red,{border:`1px solid ${C.red}44`,fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>{"\uD83D\uDDD1"} Delete</button>
              )}
            </div>
          </div>
          {panels.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
              <div style={{fontSize:52,marginBottom:16,opacity:0.3}}>{"\uD83D\uDDC2\uFE0F"}</div>
              <div style={{fontSize:18,fontWeight:700,color:C.sub,marginBottom:8}}>No panels yet</div>
              <div style={{fontSize:13,marginBottom:24,lineHeight:1.7}}>Add a panel to start uploading drawings and quoting this job.</div>
              {!readOnly&&<button onClick={addPanel} style={btn(C.accent,"#fff")}>+ Add First Panel</button>}
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {panels.map((panel: any,idx: number)=>(
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  idx={idx}
                  uid={uid}
                  projectId={project.id}
                  projectName={project.name||''}
                  bcProjectNumber={project.bcProjectNumber||null}
                  bcDisconnected={!!(project.bcEnv&&project.bcEnv!==(_bcConfig as any)?.env)}
                  quoteData={project.quote||{}}
                  quoteRev={project.quoteRev||0}
                  readOnly={readOnly}
                  isSelected={panel.id===selectedPanelId}
                  onSelect={()=>setSelectedPanelId(panel.id)}
                  onDelete={()=>deletePanel(panel.id)}
                  onUpdate={(updatedPanel: any)=>{
                    const newPanels=panels.map((p: any)=>p.id===panel.id?updatedPanel:p);
                    onUpdate({...project,panels:newPanels});
                  }}
                  onSaveImmediate={(updatedPanel: any)=>saveImmediatePanel(panel.id,updatedPanel)}
                  onViewQuote={onViewQuote}
                  onPrintRfq={onPrintRfq}
                  onSendRfqEmails={onSendRfqEmails}
                  rfqLoading={rfqLoading}
                  onOpenSupplierQuote={onOpenSupplierQuote}
                />
              ))}
            </div>
          )}
        </div>
        </div>
        <div style={{width:380,flexShrink:0,display:"flex",flexDirection:"column",borderLeft:`1px solid ${C.border}`,background:"#080810"}}>
          {(()=>{
            const sp=(project.panels||[]).find((p: any)=>p.id===selectedPanelId)||(project.panels||[])[0]||null;
            if(!sp)return <div style={{color:C.muted,fontSize:13,textAlign:"center",marginTop:40}}>No panels</div>;
            const pr=sp.pricing||{};
            const markup=pr.markup??30;
            const laborRate=pr.laborRate??45;
            const cBOM=pr.contingencyBOM??_pricingConfig.contingencyBOM;
            const cCons=pr.contingencyConsumables??_pricingConfig.contingencyConsumables;
            const laborEst=computeLaborEstimate(sp);
            const bom=sp.bom||[];
            const pricedCount=bom.filter((r: any)=>r.unitPrice!=null).length;
            const matCost=bom.reduce((s: number,r: any)=>s+(r.unitPrice||0)*(r.qty||1),0);
            const grandTotal=matCost+laborEst.totalCost+cBOM+cCons;
            const sellPrice=grandTotal*(1+markup/100);
            const fmt=(n: number)=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
            const pendingBcCount=bom.filter((r: any)=>(r.partNumber||"").trim()&&r.priceSource!=="bc"&&r.priceSource!=="manual").length;
            const laborAccepted=sp.laborData?.accepted||{};
            const acceptedCount=laborEst.lines.filter((l: any)=>laborAccepted[l.category]).length;
            const GDEF=[
              {label:"CUT",color:"#f97316",cats:["Panel Holes","Side Devices","HVAC/Fans"]},
              {label:"LAYOUT",color:"#a78bfa",cats:["Device Mounting","Duct & DIN Rail","Labels"]},
              {label:"WIRE",color:"#38bdf8",cats:["Wire Time","Door Wiring"]},
            ];
            return(<>
              <div style={{flex:1,overflowY:"auto",minHeight:0,padding:16,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:17,fontWeight:800,color:C.text,letterSpacing:0.5,marginBottom:2}}>PANEL SUMMARY</div>
              {/* Selected panel name header */}
              <div style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>Line {(project.panels||[]).indexOf(sp)+1}</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.accent,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{sp.drawingNo||sp.name||`Panel ${(project.panels||[]).indexOf(sp)+1}`}</div>
                  {sp.requestedShipDate&&<div style={{fontSize:12,color:C.green,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>Ship: {sp.requestedShipDate}</div>}
                </div>
                {sp.drawingRev&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,fontSize:12}}>
                  <span style={{color:C.muted}}><span style={{color:C.sub,fontWeight:600}}>Rev</span> {sp.drawingRev}</span>
                </div>}
                {sp.drawingDesc&&<div style={{fontSize:12,color:C.muted,marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sp.drawingDesc}</div>}
              </div>

              {/* Pricing Summary */}
              <div style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:12,color:C.muted,fontWeight:700,letterSpacing:0.7,marginBottom:10}}>PRICING SUMMARY</div>
                {([
                  ["Materials",fmt(matCost),"#fff",null,null],
                  ["BOM Contingency",null,"#fff",cBOM,"contingencyBOM"],
                  ["Consumables",null,"#fff",cCons,"contingencyConsumables"],
                  ["Labor",fmt(laborEst.totalCost),"#fff",null,null],
                  ["Total",fmt(grandTotal),"#fff",null,null],
                ] as any[]).map(([label,val,color,numVal,key]: any)=>(
                  <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,fontSize:13}}>
                    <span style={{color:label==="Total"?"#fff":C.muted}}>{label}</span>
                    <div style={{display:"flex",alignItems:"center"}}>
                      <span style={{color:"#fff",fontSize:12,marginRight:2,alignSelf:"center"}}>$</span>
                      {key?(
                        <ContingencyInput value={numVal} readOnly={readOnly} color={color} onSave={(v: any)=>saveSelectedPricing({[key]:v})}/>
                      ):(
                        <span style={{color,fontWeight:label==="Total"?700:400,fontVariantNumeric:"tabular-nums",width:80,textAlign:"right",display:"inline-block"}}>{val?.slice(1)}</span>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{borderTop:"1px solid #fff",paddingTop:10,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:C.sub,fontSize:13}}>Margin</span>
                    <input type="number" min="0" step="1" value={markup} readOnly={readOnly}
                      onChange={e=>saveSelectedPricing({markup:Math.max(0,+e.target.value||0)})}
                      onFocus={e=>e.target.select()}
                      style={{...inp({padding:"3px 6px",fontSize:13,width:55,textAlign:"right"}),color:"#fff"}}/>
                    <span style={{color:"#fff",fontSize:13}}>%</span>
                  </div>
                  <span style={{fontWeight:800,color:"#fff",fontSize:18,fontVariantNumeric:"tabular-nums"}}>{fmt(sellPrice)}</span>
                </div>
              </div>

              {/* Labor */}
              <div style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:0.5}}>LABOR</div>
                  <span style={{background:laborEst.isLegacy?C.yellowDim:laborEst.hasLayoutData?C.greenDim:C.accentDim,color:laborEst.isLegacy?C.yellow:laborEst.hasLayoutData?C.green:C.accent,borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>
                    {laborEst.isOverride?"Override":laborEst.isLegacy?"Legacy":laborEst.hasLayoutData?"Auto":"Schematic"}
                  </span>
                  {acceptedCount===laborEst.lines.length&&laborEst.lines.length>0&&<span style={{background:C.greenDim,color:C.green,borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>{"\u2713"} All</span>}
                  <div style={{flex:1}}/>
                  <span style={{fontSize:11,color:C.muted}}>$/hr</span>
                  <input type="number" min="0" step="1" readOnly={readOnly} value={laborRate}
                    onChange={e=>saveSelectedPricing({laborRate:Math.max(0,+e.target.value||0)})}
                    onFocus={e=>e.target.select()}
                    style={{...inp({padding:"2px 4px",fontSize:12,width:46,textAlign:"right",border:"1px solid #888"})}}/>
                </div>
                {!laborEst.isOverride&&laborEst.lines.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                    {GDEF.map(({label,color,cats})=>{
                      const hrs=laborEst.lines.filter((l: any)=>cats.includes(l.category)).reduce((s: number,l: any)=>s+l.hours,0);
                      return(
                        <div key={label} style={{display:"flex",alignItems:"center",gap:0,fontSize:13}}>
                          <span style={{fontWeight:700,color,letterSpacing:0.5,fontSize:11,width:52}}>{label}</span>
                          <span style={{color:"#fff",fontWeight:700,fontVariantNumeric:"tabular-nums",width:32,textAlign:"right"}}>{Math.ceil(hrs)}</span>
                          <span style={{color:C.muted,fontWeight:400,fontSize:11,marginLeft:4}}>hrs</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {laborEst.lines.length>0&&(
                  <button onClick={()=>setFbLaborMoreInfo(v=>!v)}
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,cursor:"pointer",fontSize:11,padding:"3px 10px",width:"100%",textAlign:"left",display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10}}>{fbLaborMoreInfo?"\u25B2":"\u25BC"}</span>
                    {fbLaborMoreInfo?"Hide Detail":"More Info"}
                  </button>
                )}
                {fbLaborMoreInfo&&laborEst.lines.length>0&&(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginTop:8}}>
                    <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                      <th style={{textAlign:"center",padding:"3px 4px",color:C.muted,fontWeight:600,fontSize:11,width:24}}>{"\u2713"}</th>
                      <th style={{textAlign:"left",padding:"3px 4px",color:C.muted,fontWeight:600,fontSize:11}}>Category</th>
                      <th style={{textAlign:"right",padding:"3px 4px",color:C.muted,fontWeight:600,fontSize:11}}>Qty</th>
                      <th style={{textAlign:"right",padding:"3px 4px",color:C.muted,fontWeight:600,fontSize:11}}>Hrs</th>
                      <th style={{textAlign:"right",padding:"3px 4px",color:C.muted,fontWeight:600,fontSize:11}}>Cost</th>
                    </tr></thead>
                    <tbody>
                      {laborEst.lines.map((l: any,i: number)=>{
                        const isAcc=!!laborAccepted[l.category];
                        return(
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}22`,background:isAcc?"#0a1a0a":"transparent"}}>
                          <td style={{padding:"3px 4px",textAlign:"center"}}>
                            <input type="checkbox" checked={isAcc} disabled={readOnly}
                              onChange={e=>saveSelectedLaborAccepted(l.category,e.target.checked)}
                              style={{accentColor:C.green,cursor:readOnly?"default":"pointer",margin:0}}/>
                          </td>
                          <td style={{padding:"3px 4px",color:isAcc?C.green:C.sub,whiteSpace:"nowrap"}}>{l.category}</td>
                          <td style={{padding:"3px 4px",textAlign:"right",whiteSpace:"nowrap"}}>
                            {l.field&&!readOnly?(
                              <input type="text" inputMode="decimal" defaultValue={l.qty} key={l.field+"-"+l.qty}
                                onFocus={e=>e.target.select()}
                                onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)&&v!==l.qty)saveSelectedLaborOverride(l.field,Math.max(0,v));}}
                                onKeyDown={e=>{if(e.key==="Enter")(e.target as HTMLInputElement).blur();}}
                                style={{background:"transparent",border:"1px solid #888",borderRadius:4,color:C.text,padding:"1px 4px",fontSize:12,width:44,textAlign:"right"}}/>
                            ):(
                              <span style={{color:C.text}}>{l.qty}</span>
                            )}
                            {" "}<span style={{color:C.muted,fontSize:11}}>{l.unit}</span>
                          </td>
                          <td style={{padding:"3px 4px",textAlign:"right",color:C.muted,fontSize:11}}>{l.hours.toFixed(1)}</td>
                          <td style={{padding:"3px 4px",textAlign:"right",color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmt(l.cost)}</td>
                        </tr>);
                      })}
                      <tr style={{borderTop:`1px solid ${C.border}`}}>
                        <td style={{padding:"3px 4px",textAlign:"center",fontSize:10,color:C.muted}}>{acceptedCount}/{laborEst.lines.length}</td>
                        <td style={{padding:"3px 4px",fontWeight:700,color:C.text,fontSize:12}}>TOTAL</td>
                        <td></td>
                        <td style={{padding:"3px 4px",textAlign:"right",fontWeight:700,color:C.text,fontSize:12}}>{laborEst.totalHours.toFixed(1)}</td>
                        <td style={{padding:"3px 4px",textAlign:"right",fontWeight:700,color:C.accent,fontVariantNumeric:"tabular-nums",fontSize:12}}>{fmt(laborEst.totalCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Level of Confidence */}
              <ConfidenceBar panel={sp} readOnly={readOnly} onUpdate={selectedOnUpdate} onSaveImmediate={selectedOnSaveImmediate} compact/>
              </div>

              {/* Quote Summary -- third pane, locked to bottom */}
              <div style={{flexShrink:0,borderTop:`2px solid ${C.accent}`,background:"#06060f",padding:"12px 16px 16px",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:2}}>
                  <span style={{fontSize:17,fontWeight:800,color:C.text,letterSpacing:0.5}}>QUOTE SUMMARY{project.quoteRev>0?` \u2014 Rev ${String(project.quoteRev).padStart(2,'0')}`:""}</span>
                  {(project.quoteRev||0)>(project.quoteRevAtPrint||0)&&<span style={{fontSize:10,fontWeight:700,color:"#f59e0b",letterSpacing:0.3}}>unsent revision</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {(project.panels||[]).map((p: any,pi: number)=>{
                  const ppr=p.pricing||{};
                  const pmk=ppr.markup??30;
                  const pcb=ppr.contingencyBOM??_pricingConfig.contingencyBOM;
                  const pcc=ppr.contingencyConsumables??_pricingConfig.contingencyConsumables;
                  const ple=computeLaborEstimate(p);
                  const pmat=(p.bom||[]).reduce((s: number,r: any)=>s+(r.unitPrice||0)*(r.qty||1),0);
                  const pgt=pmat+ple.totalCost+pcb+pcc;
                  const psp=pgt*(1+pmk/100);
                  const pfmt=(n: number)=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
                  const pqty=p.qty||1;
                  return(
                    <div key={p.id} onClick={()=>setSelectedPanelId(p.id)}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:6,background:p.id===selectedPanelId?"#1a1a2e":"transparent",border:`1px solid ${p.id===selectedPanelId?C.accent:C.border}`,cursor:"pointer"}}>
                      <input type="number" min="1" className="no-spin" value={pqty} onClick={(e: any)=>e.stopPropagation()}
                        onChange={e=>{const q=Math.max(1,+e.target.value||1);saveImmediatePanel(p.id,{...p,qty:q});}}
                        style={{width:32,fontSize:12,fontWeight:700,textAlign:"center",background:"transparent",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 4px",color:"#fff",outline:"none"}}/>
                      <span style={{fontSize:12,color:p.id===selectedPanelId?C.accent:C.sub,fontWeight:p.id===selectedPanelId?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>{p.drawingNo||p.name||`Panel ${pi+1}`}</span>
                      {(()=>{const openEqs=(p.engineeringQuestions||[]).filter((q: any)=>q.status==="open").length;return openEqs>0?
                        React.createElement("button",{onClick:(e: any)=>{e.stopPropagation();setEqModalPanelId(p.id);},style:{background:"none",border:"1px solid #fde04766",borderRadius:20,padding:"3px 12px",fontSize:13,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap",cursor:"pointer",color:"#fde047",animation:"pulseYellow 2s ease-in-out infinite"}},openEqs+" ?"):
                        React.createElement("span",{onClick:(e: any)=>{e.stopPropagation();setEqModalPanelId(p.id);},style:{cursor:"pointer"}},React.createElement(Badge,{status:p.status||"draft"}));})()}
                      <span style={{fontSize:13,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums",flexShrink:0,minWidth:72,textAlign:"right"}}>{pfmt(psp*pqty)}</span>
                    </div>
                  );
                })}
                {(project.panels||[]).length>1&&(()=>{
                  const total=(project.panels||[]).reduce((sum: number,p: any)=>{
                    const ppr=p.pricing||{};
                    const pmk=ppr.markup??30;
                    const pcb=ppr.contingencyBOM??_pricingConfig.contingencyBOM;
                    const pcc=ppr.contingencyConsumables??_pricingConfig.contingencyConsumables;
                    const ple=computeLaborEstimate(p);
                    const pmat=(p.bom||[]).reduce((s: number,r: any)=>s+(r.unitPrice||0)*(r.qty||1),0);
                    return sum+((pmat+ple.totalCost+pcb+pcc)*(1+(ppr.markup??30)/100))*(p.qty||1);
                  },0);
                  const pfmt=(n: number)=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
                  return(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",marginTop:4,borderTop:"1px solid #fff"}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:0.5}}>PROJECT TOTAL</span>
                      <span style={{fontSize:16,fontWeight:800,color:"#fff",fontVariantNumeric:"tabular-nums"}}>{pfmt(total)}</span>
                    </div>
                  );
                })()}
              </div>

              {/* Action buttons */}
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4,paddingTop:8,borderTop:`1px solid ${C.border}33`}}>
                <button data-tour="rfq-btn" onClick={onSendRfqEmails} disabled={rfqLoading} style={btn("#1e1b4b","#818cf8",{fontSize:13,padding:"6px 18px",width:"100%",opacity:rfqLoading?0.5:1})}>{rfqLoading?"Building\u2026":"Send/Print RFQ's"}</button>
                <div style={{display:"flex",gap:6,alignItems:"stretch"}}>
                  <button onClick={()=>onOpenSupplierQuote(sp.bom||[])} style={btn("#0d1f0d","#4ade80",{fontSize:14,padding:"8px 12px",flex:3,border:"1px solid #4ade8044",fontWeight:700})}>{"\uD83D\uDCE5"} Upload Supplier Quote{pendingRfqUploads>0?` (${pendingRfqUploads})`:""}</button>
                  <button onClick={onShowRfqHistory} title="View RFQ send history" style={btn("#111128","#64748b",{fontSize:11,padding:"6px 8px",flex:1,whiteSpace:"nowrap"})}>{"\uD83D\uDCDC"} History</button>
                </div>
                <button data-tour="print-quote-btn" onClick={onViewQuote} style={btn(C.greenDim,C.green,{fontSize:13,padding:"6px 18px",width:"100%"})}>{"\uD83D\uDDA8"} Print Client Quote{(project.quoteRev||0)>(project.quoteRevAtPrint||0)?` (Rev ${project.quoteRev} \u26A0 unsent)`:project.quoteRev>0?` (Rev ${project.quoteRev})`:""}</button>
                {!readOnly&&project.bcProjectNumber&&!(project.bcEnv&&project.bcEnv!==(_bcConfig as any)?.env)&&<button onClick={onPoReceived} style={btn("#0d1a10","#4ade80",{fontSize:13,padding:"6px 18px",width:"100%",border:"1px solid #4ade8044"})}>{"\uD83D\uDCEC"} PO Received</button>}
                {!readOnly&&sp.bcItemNumber&&(
                  <button onClick={()=>{}} disabled={pendingBcCount>0}
                    title={pendingBcCount>0?`${pendingBcCount} unverified BC parts \u2014 resolve blue circles first`:`Update Assembly BOM for item ${sp.bcItemNumber}`}
                    style={{background:pendingBcCount>0?"#111":"#0d1f3c",border:'1px solid '+(pendingBcCount>0?"#444":"#38bdf866"),color:pendingBcCount>0?"#555":"#38bdf8",cursor:pendingBcCount>0?"not-allowed":"pointer",borderRadius:20,padding:"5px 16px",fontSize:12,fontWeight:700,whiteSpace:"nowrap",letterSpacing:0.3,opacity:pendingBcCount>0?0.5:1,textAlign:"center"}}>
                    {"\uD83D\uDD04"} Update BOM in BC (Item# {sp.bcItemNumber})
                  </button>
                )}
              </div>
              </div>
            </>);
          })()}
        </div>
      </div>
    </div>
    {showDeleteAdminWarn&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
        onClick={()=>setShowDeleteAdminWarn(false)}>
        <div style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:10,padding:"28px 32px",maxWidth:380,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}} onClick={(e: any)=>e.stopPropagation()}>
          <div style={{fontSize:18,fontWeight:800,color:C.red,marginBottom:10}}>Admin Required</div>
          <div style={{fontSize:13,color:C.sub,lineHeight:1.6,marginBottom:20}}>
            Only an <strong style={{color:C.accent}}>Admin</strong> can delete a project. Please contact your administrator to have this project removed.
          </div>
          <button onClick={()=>setShowDeleteAdminWarn(false)}
            style={btn(C.accentDim,C.accent,{width:"100%",fontWeight:700,fontSize:13})}>
            OK
          </button>
        </div>
      </div>
    )}
    {eqModalPanelId&&(()=>{const ep=(project.panels||[]).find((p: any)=>p.id===eqModalPanelId);return ep?React.createElement(EngineeringQuestionsModal,{panel:ep,uid,
      onUpdate:(updated: any)=>onUpdate({...project,panels:(project.panels||[]).map((p: any)=>p.id===updated.id?updated:p)}),
      onSave:(updated: any)=>{const proj={...project,panels:(project.panels||[]).map((p: any)=>p.id===updated.id?updated:p)};saveProject(uid,proj);},
      onClose:()=>setEqModalPanelId(null),memberMap:null}):null;})()}
  </>);
}

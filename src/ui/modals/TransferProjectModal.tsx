// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function TransferProjectModal({project,companyId,uid,userEmail,onTransferred,onClose}){
  const [members,setMembers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [recipientUid,setRecipientUid]=useState("");
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{
    if(!companyId){setLoading(false);return;}
    fbDb.collection(`companies/${companyId}/members`).get()
      .then(snap=>{
        const all=snap.docs.map(d=>({uid:d.id,...d.data()})).filter(m=>m.uid!==uid);
        setMembers(all);setLoading(false);
      })
      .catch(e=>{setErr("Failed to load members: "+e.message);setLoading(false);});
  },[companyId]);

  async function doTransfer(){
    if(!recipientUid)return;
    setSaving(true);setErr("");
    try{
      const path=_appCtx.projectsPath||`users/${uid}/projects`;
      await fbDb.doc(`${path}/${project.id}`).update({
        transferred:true,
        transferredTo:recipientUid,
        transferredFrom:{uid,email:userEmail},
        createdBy:recipientUid,
      });
      onTransferred(project.id);
    }catch(e){setErr(e.message);setSaving(false);}
  }

  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:12,padding:24,width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:16}}>
        <div style={{fontSize:16,fontWeight:700,color:C.text}}>Transfer Project</div>
        <div style={{fontSize:13,color:C.sub}}>
          Move <span style={{color:C.accent,fontWeight:600}}>{project.name}</span> to another team member. They'll receive it in their Transferred Projects section.
        </div>
        {loading?(
          <div style={{fontSize:13,color:C.muted}}>Loading members…</div>
        ):!companyId?(
          <div style={{fontSize:13,color:C.red}}>You must be in a Company workspace to transfer projects.</div>
        ):members.length===0?(
          <div style={{fontSize:13,color:C.muted}}>No other team members found.</div>
        ):(
          <>
            <div>
              <div style={{fontSize:12,color:C.muted,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Transfer To</div>
              <select value={recipientUid} onChange={e=>setRecipientUid(e.target.value)}
                style={{width:"100%",background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:recipientUid?C.text:C.muted,fontSize:14}}>
                <option value="">Select a team member…</option>
                {members.map(m=>(
                  <option key={m.uid} value={m.uid}>{m.email} ({m.role})</option>
                ))}
              </select>
            </div>
            {recipientUid&&<div style={{fontSize:11,color:C.muted}}>The project will move out of your list immediately. The recipient can accept it from their dashboard.</div>}
          </>
        )}
        {err&&<div style={{fontSize:12,color:C.red}}>{err}</div>}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button onClick={onClose} disabled={saving} style={btn(C.border,C.sub)}>Cancel</button>
          <button onClick={doTransfer} disabled={saving||!recipientUid||loading}
            style={btn(C.accent,"#fff",{opacity:(saving||!recipientUid||loading)?0.5:1})}>
            {saving?"Transferring…":"Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PROJECT TILE ──
function ProjectTile({p,onOpen,onDelete,onTransfer,onUpdateStatus,userFirstName,memberMap,draggable:isDraggable,onDragStart,onDragEnd,rfqCount}){
  const bgTasks=useBgTasks();
  const customerLogo=useCustomerLogo(p.bcCustomerName||null);
  const activeTask=Object.values(bgTasks).find(t=>t.projectId===p.id&&(t.status==="running"||t.status==="done"||t.status==="error"));
  const st=projectStatus(p);
  const bcDisconnected=p.bcEnv&&p.bcEnv!==_bcConfig.env;
  const statusColors={draft:C.muted,in_progress:C.yellow,extracted:C.green,validated:C.green,costed:C.green};
  const statusLabels={draft:"DRAFT",in_progress:"PROCESSING",extracted:"READY",validated:"READY",costed:"READY"};
  return(
  <div className="fade-in" onClick={()=>onOpen(p)}
    draggable={isDraggable||false}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    style={{...card({padding:"4px 10px"}),border:"1px solid #4a5080",cursor:isDraggable?"grab":"pointer",transition:"border-color 0.15s,transform 0.15s",position:"relative",display:"flex",flexDirection:"column",gap:1}}
    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.accent+"99";e.currentTarget.style.transform="translateY(-2px)";}}
    onMouseLeave={e=>{e.currentTarget.style.borderColor="#4a5080";e.currentTarget.style.transform="none";}}>
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
      {customerLogo&&<img src={customerLogo} alt="" style={{width:22,height:22,objectFit:"contain",borderRadius:3,background:"#fff",padding:2,flexShrink:0}} onError={e=>e.target.style.display="none"}/>}
      <div style={{fontSize:14,fontWeight:800,color:bcDisconnected?"#64748b":C.accent,whiteSpace:"nowrap",visibility:p.bcProjectNumber?"visible":"hidden",flexShrink:0}}>{p.bcProjectNumber||"–"}{bcDisconnected&&<span style={{fontSize:9,color:C.yellow,fontWeight:600,marginLeft:4,verticalAlign:"middle"}} title={"Linked to "+p.bcEnv}>⚠</span>}</div>
      <div style={{fontSize:14,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,visibility:p.bcCustomerName?"visible":"hidden"}}>{p.bcCustomerName||"–"}</div>
      {(()=>{const owner=memberMap&&p.createdBy&&memberMap[p.createdBy];const name=owner?owner.firstName||owner.email.split("@")[0]:userFirstName;return name?<div style={{fontSize:9,color:C.muted,fontWeight:600,letterSpacing:0.3,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textTransform:"uppercase",flexShrink:0}}>{name}</div>:null;})()}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
      <div style={{fontSize:17,fontWeight:700,color:C.green,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.name}</div>
      {rfqCount>0&&<span style={{background:C.redDim,color:C.red,borderRadius:20,padding:"3px 12px",fontSize:13,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap",flexShrink:0}}>{rfqCount} RFQ{rfqCount>1?"S":""}</span>}
      <div style={{flexShrink:0,fontSize:"0.75em"}}><Badge status={p.importedFromBC?"imported":st} project={p}/></div>
    </div>
    {activeTask&&(
      <div style={{marginTop:4}}>
        <div style={{fontSize:10,color:activeTask.status==="error"?C.red:C.accent,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeTask.msg}</div>
        {activeTask.status!=="error"?(
          <div style={{width:"100%",height:4,background:C.border,borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:(activeTask.pct||0)+"%",background:`linear-gradient(90deg,${C.accent},#818cf8)`,borderRadius:4,transition:"width 0.4s"}}/>
          </div>
        ):null}
      </div>
    )}
  </div>
  );
}

// ── LEFT NAV SIDEBAR ──
const NAV_TABS=[
  {id:"projects",  label:"SALES",       icon:"◫"},
  {id:"purchasing",label:"PURCHASING",  icon:"⬡"},
  {id:"production",label:"PRODUCTION",  icon:"⚙"},
  {id:"items",     label:"ITEMS/VENDORS",icon:"⬢"},
];

export default TransferProjectModal;

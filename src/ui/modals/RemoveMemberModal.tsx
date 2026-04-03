// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function RemoveMemberModal({uid,companyId,member,members,onRemoved,onClose}){
  const [transferTo,setTransferTo]=useState("");
  const [memberProjects,setMemberProjects]=useState([]);
  const [loadingProjects,setLoadingProjects]=useState(true);
  const [removing,setRemoving]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{
    fbDb.collection(`companies/${companyId}/projects`)
      .where("createdBy","==",member.uid)
      .get()
      .then(snap=>{setMemberProjects(snap.docs.map(d=>d.data()));setLoadingProjects(false);})
      .catch(()=>setLoadingProjects(false));
  },[]);

  async function doRemove(){
    setRemoving(true);setErr("");
    try{
      if(transferTo&&memberProjects.length>0){
        const batch=fbDb.batch();
        memberProjects.forEach(p=>{
          batch.update(fbDb.doc(`companies/${companyId}/projects/${p.id}`),{
            transferred:true,
            transferredTo:transferTo,
            transferredFrom:{uid:member.uid,email:member.email},
            createdBy:transferTo,
          });
        });
        await batch.commit();
      }
      await fbFunctions.httpsCallable("removeTeamMember")({targetUid:member.uid,companyId});
      onRemoved(member.uid);
    }catch(ex){setErr(ex.message);}
    setRemoving(false);
  }

  const recipients=members.filter(m=>m.uid!==member.uid);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{...card(),width:"100%",maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Remove Member</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Removing <strong style={{color:C.text}}>{member.email}</strong> from the workspace.</div>
        {err&&<div style={{background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.red}}>{err}</div>}
        {loadingProjects?(
          <div style={{color:C.muted,fontSize:13,padding:"20px 0",textAlign:"center"}}>Checking projects…</div>
        ):(
          <>
            {memberProjects.length>0?(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,color:C.sub,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Their Projects ({memberProjects.length})</div>
                <div style={{background:"#0a0a12",borderRadius:8,padding:10,marginBottom:14,maxHeight:130,overflow:"auto"}}>
                  {memberProjects.map(p=>(
                    <div key={p.id} style={{fontSize:13,color:C.text,padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}>{p.name}</div>
                  ))}
                </div>
                <div style={{fontSize:13,color:C.sub,marginBottom:8}}>Transfer projects to:</div>
                <select value={transferTo} onChange={e=>setTransferTo(e.target.value)}
                  style={{width:"100%",background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:transferTo?C.text:C.muted,fontSize:14,marginBottom:6}}>
                  <option value="">Leave in workspace (no specific owner)</option>
                  {recipients.map(m=>(
                    <option key={m.uid} value={m.uid}>{m.email} ({m.role})</option>
                  ))}
                </select>
                {transferTo&&<div style={{fontSize:11,color:C.muted}}>Projects will appear in the recipient's Transferred Projects section.</div>}
              </div>
            ):(
              <div style={{background:"#0a0a12",borderRadius:8,padding:14,marginBottom:20,fontSize:13,color:C.muted}}>This member has no projects.</div>
            )}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={onClose} disabled={removing} style={btn(C.border,C.sub)}>Cancel</button>
              <button onClick={doRemove} disabled={removing} style={btn(C.red,"#fff",{opacity:removing?0.6:1})}>
                {removing?"Removing…":transferTo?"Transfer & Remove":"Remove Member"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default RemoveMemberModal;

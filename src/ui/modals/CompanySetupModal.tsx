// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

// Stub: createCompany is expected to be provided by the app's company management module
async function createCompany(uid, email, companyName) {
  const doc = await fbDb.collection('companies').add({ name: companyName, createdBy: uid, createdAt: Date.now() });
  await fbDb.doc(`companies/${doc.id}/members/${uid}`).set({ email, role: 'admin', joinedAt: Date.now() });
  return doc.id;
}

function CompanySetupModal({uid,email,onDone,onClose}){
  const [name,setName]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  async function create(e){
    e.preventDefault();if(!name.trim())return;setLoading(true);setErr("");
    try{
      const cid=await createCompany(uid,email,name.trim());
      _appCtx.companyId=cid;_appCtx.role="admin";
      _appCtx.projectsPath=`companies/${cid}/projects`;
      _appCtx.configPath=`companies/${cid}/config`;
      onDone(cid,"admin",name.trim());
    }catch(ex){setErr(ex.message);setLoading(false);}
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{...card(),width:"100%",maxWidth:440}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>Set Up Company Workspace</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Create a shared workspace so your team can collaborate on projects.</div>
        <form onSubmit={create}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Company Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Matrix Systems, Inc." style={{...inp(),marginBottom:16}} autoFocus/>
          {err&&<div style={{color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}
          <div style={{display:"flex",gap:10}}>
            <button type="button" onClick={onClose} style={btn(C.border,C.sub,{flex:1})}>Cancel</button>
            <button type="submit" disabled={!name.trim()||loading} style={btn(C.accent,"#fff",{flex:2,opacity:!name.trim()||loading?0.5:1})}>
              {loading?"Creating…":"Create Company"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CompanySetupModal;

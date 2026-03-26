import { useState } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx } from '@/core/globals';
import { createCompany } from '@/services/firebase/firestore';

export default function CompanySetupModal({uid,email,onDone,onClose}: any){
  const [name,setName]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");

  async function create(e: any){
    e.preventDefault();if(!name.trim())return;setLoading(true);setErr("");
    try{
      const cid=await createCompany(uid,email,name.trim());
      _appCtx.companyId=cid;(_appCtx as any).role="admin";
      (_appCtx as any).projectsPath=`companies/${cid}/projects`;
      (_appCtx as any).configPath=`companies/${cid}/config`;
      onDone(cid,"admin",name.trim());
    }catch(ex: any){setErr(ex.message);setLoading(false);}
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{...card(),width:"100%",maxWidth:440}} onClick={(e: any)=>e.stopPropagation()}>
        <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>Set Up Company Workspace</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Create a shared workspace so your team can collaborate on projects.</div>
        <form onSubmit={create}>
          <label style={{fontSize:12,color:C.sub,display:"block",marginBottom:6,fontWeight:600,textTransform:"uppercase" as const,letterSpacing:0.5}}>Company Name</label>
          <input value={name} onChange={(e: any)=>setName(e.target.value)} placeholder="e.g. Matrix Systems, Inc." style={{...inp(),marginBottom:16}} autoFocus/>
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

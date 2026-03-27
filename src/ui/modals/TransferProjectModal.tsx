import { useState, useEffect } from 'react';
import { C, btn } from '@/core/constants';
import { fbDb, _appCtx } from '@/core/globals';

function TransferProjectModal({project,companyId,uid,userEmail,onTransferred,onClose}: any){
  const [members,setMembers]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [recipientUid,setRecipientUid]=useState("");
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{
    if(!companyId){setLoading(false);return;}
    fbDb.collection(`companies/${companyId}/members`).get()
      .then((snap: any)=>{
        const all=snap.docs.map((d: any)=>({uid:d.id,...d.data()})).filter((m: any)=>m.uid!==uid);
        setMembers(all);setLoading(false);
      })
      .catch((e: any)=>{setErr("Failed to load members: "+e.message);setLoading(false);});
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
    }catch(e: any){setErr(e.message);setSaving(false);}
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
              <select value={recipientUid} onChange={(e: any)=>setRecipientUid(e.target.value)}
                style={{width:"100%",background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:recipientUid?C.text:C.muted,fontSize:14}}>
                <option value="">Select a team member…</option>
                {members.map((m: any)=>(
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

export default TransferProjectModal;

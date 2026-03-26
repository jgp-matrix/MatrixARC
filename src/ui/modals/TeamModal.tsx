import { useState, useEffect } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import { fbDb, fbAuth, fbFunctions, loadCompanyMembers } from '@/core/globals';

// ── REMOVE MEMBER MODAL (inline) ──
function RemoveMemberModal({uid,companyId,member,members,onRemoved,onClose}: any){
  const [transferTo,setTransferTo]=useState("");
  const [memberProjects,setMemberProjects]=useState<any[]>([]);
  const [loadingProjects,setLoadingProjects]=useState(true);
  const [removing,setRemoving]=useState(false);
  const [err,setErr]=useState("");

  useEffect(()=>{
    fbDb.collection(`companies/${companyId}/projects`)
      .where("createdBy","==",member.uid)
      .get()
      .then((snap: any)=>{setMemberProjects(snap.docs.map((d: any)=>d.data()));setLoadingProjects(false);})
      .catch(()=>setLoadingProjects(false));
  },[]);

  async function doRemove(){
    setRemoving(true);setErr("");
    try{
      if(transferTo&&memberProjects.length>0){
        const batch=fbDb.batch();
        memberProjects.forEach((p: any)=>{
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
    }catch(ex: any){setErr(ex.message);}
    setRemoving(false);
  }

  const recipients=members.filter((m: any)=>m.uid!==member.uid);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{...card(),width:"100%",maxWidth:480}} onClick={(e: any)=>e.stopPropagation()}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Remove Member</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Removing <strong style={{color:C.text}}>{member.email}</strong> from the workspace.</div>
        {err&&<div style={{background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.red}}>{err}</div>}
        {loadingProjects?(
          <div style={{color:C.muted,fontSize:13,padding:"20px 0",textAlign:"center"}}>Checking projects…</div>
        ):(
          <>
            {memberProjects.length>0?(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,color:C.sub,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:10}}>Their Projects ({memberProjects.length})</div>
                <div style={{background:"#0a0a12",borderRadius:8,padding:10,marginBottom:14,maxHeight:130,overflow:"auto"}}>
                  {memberProjects.map((p: any)=>(
                    <div key={p.id} style={{fontSize:13,color:C.text,padding:"5px 0",borderBottom:`1px solid ${C.border}22`}}>{p.name}</div>
                  ))}
                </div>
                <div style={{fontSize:13,color:C.sub,marginBottom:8}}>Transfer projects to:</div>
                <select value={transferTo} onChange={(e: any)=>setTransferTo(e.target.value)}
                  style={{width:"100%",background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:transferTo?C.text:C.muted,fontSize:14,marginBottom:6}}>
                  <option value="">Leave in workspace (no specific owner)</option>
                  {recipients.map((m: any)=>(
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

// ── TEAM MODAL ──
export default function TeamModal({uid,companyId,userRole,onClose}: any){
  const [members,setMembers]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [inviteEmail,setInviteEmail]=useState("");
  const [inviteRole,setInviteRole]=useState("edit");
  const [inviting,setInviting]=useState(false);
  const [generatedLinks,setGeneratedLinks]=useState<any[]>([]); // [{email,role,url}]
  const [copied,setCopied]=useState<any>("");
  const [err,setErr]=useState("");
  const [removingMember,setRemovingMember]=useState<any>(null);

  useEffect(()=>{
    if(!companyId){setLoading(false);return;}
    loadCompanyMembers(companyId)
      .then((m: any)=>{
        // Ensure the current user always appears; repair missing member doc if needed
        if(!m.some((x: any)=>x.uid===uid)){
          const self={uid,email:fbAuth.currentUser?.email||"",role:userRole};
          fbDb.doc(`companies/${companyId}/members/${uid}`).set(self,{merge:true}).catch(()=>{});
          m=[self,...m];
        }
        setMembers(m);setLoading(false);
      })
      .catch((e: any)=>{setErr("Failed to load members: "+e.message);setLoading(false);});
  },[companyId]);

  async function sendInvite(e: any){
    e.preventDefault();if(!inviteEmail.trim())return;
    setInviting(true);setErr("");
    try{
      const email=inviteEmail.trim();
      const payload=btoa(JSON.stringify({c:companyId,r:inviteRole,e:email}));
      const url=`${window.location.origin}${window.location.pathname}?join=${payload}`;
      await fbFunctions.httpsCallable("sendInviteEmail")({to:email,inviteUrl:url,role:inviteRole});
      setGeneratedLinks((l: any)=>[...l,{email,role:inviteRole,url,sent:true}]);
      setInviteEmail("");
    }catch(ex: any){setErr(ex.message);}
    setInviting(false);
  }

  function handleMemberRemoved(targetUid: any){
    setMembers((m: any)=>m.filter((x: any)=>x.uid!==targetUid));
    setRemovingMember(null);
  }

  async function changeRole(targetUid: any,role: any){
    try{
      await fbFunctions.httpsCallable("updateMemberRole")({targetUid,role,companyId});
      setMembers((m: any)=>m.map((x: any)=>x.uid===targetUid?{...x,role}:x));
    }catch(ex: any){setErr(ex.message);}
  }

  const admin=userRole==="admin";
  const roleBadge: any={admin:[C.accentDim,C.accent],edit:[C.greenDim,C.green],view:[C.border,C.muted]};

  return(<>
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{...card(),width:"100%",maxWidth:560,maxHeight:"80vh",overflow:"auto"}} onClick={(e: any)=>e.stopPropagation()}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Team</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Manage company workspace members</div>
        {loading&&<div style={{color:C.muted,fontSize:13,padding:"20px 0",textAlign:"center"}}>Loading…</div>}
        {err&&<div style={{background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:10,marginBottom:12,fontSize:13,color:C.red}}>{err}</div>}

        {!loading&&(
          <>
            {/* Members */}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:12,color:C.sub,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:10}}>Members ({members.length})</div>
              {members.map((m: any)=>{
                const [bg,col]=roleBadge[m.role]||roleBadge.view;
                return(
                  <div key={m.uid} style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"8px 12px",background:"#0a0a12",borderRadius:8}}>
                    <div style={{flex:1,fontSize:13,color:C.text}}>{m.email}</div>
                    {admin&&m.uid!==uid?(
                      <select value={m.role} onChange={(e: any)=>changeRole(m.uid,e.target.value)}
                        style={{background:C.card,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",fontSize:12,cursor:"pointer"}}>
                        <option value="admin">admin</option>
                        <option value="edit">edit</option>
                        <option value="view">view</option>
                      </select>
                    ):(
                      <span style={{background:bg,color:col,borderRadius:10,padding:"2px 10px",fontSize:11,fontWeight:700}}>{m.role}</span>
                    )}
                    {admin&&m.uid!==uid&&(
                      <button onClick={()=>setRemovingMember(m)} style={{background:C.redDim,color:C.red,border:"none",borderRadius:6,padding:"4px 8px",fontSize:12,cursor:"pointer"}}>Remove</button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Generated invite links (this session) */}
            {generatedLinks.length>0&&(
              <div style={{marginBottom:20}}>
                <div style={{fontSize:12,color:C.sub,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:10}}>Invite Links</div>
                {generatedLinks.map((inv: any,i: any)=>(
                  <div key={i} style={{marginBottom:8,padding:"8px 12px",background:"#0a0a12",borderRadius:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{flex:1,fontSize:13,color:C.text}}>{inv.email}</div>
                      <span style={{background:C.yellowDim,color:C.yellow,borderRadius:10,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap" as const}}>{inv.role}</span>
                      {inv.sent&&<span style={{color:C.green,fontSize:11,fontWeight:700}}>✓ Email sent</span>}
                      <button
                        onClick={()=>{navigator.clipboard.writeText(inv.url);setCopied(i);setTimeout(()=>setCopied(""),2000);}}
                        style={btn(copied===i?C.greenDim:C.border,copied===i?C.green:C.muted,{fontSize:11,padding:"3px 10px"})}>
                        {copied===i?"✓ Copied":"Copy Link"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invite form — admin only */}
            {admin&&(
              <div>
                <div style={{fontSize:12,color:C.sub,fontWeight:700,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:10}}>Invite Member</div>
                <form onSubmit={sendInvite}>
                  <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap" as const}}>
                    <input value={inviteEmail} onChange={(e: any)=>setInviteEmail(e.target.value)} type="email" placeholder="email@company.com" style={{...inp(),flex:"2 1 180px"}}/>
                    <select value={inviteRole} onChange={(e: any)=>setInviteRole(e.target.value)}
                      style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:14}}>
                      <option value="admin">Admin</option>
                      <option value="edit">Edit</option>
                      <option value="view">View</option>
                    </select>
                    <button type="submit" disabled={!inviteEmail.trim()||inviting} style={btn(C.accent,"#fff",{opacity:!inviteEmail.trim()||inviting?0.5:1})}>
                      {inviting?"Sending…":"Send Invite"}
                    </button>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginTop:4}}>Sends an invite email automatically. Link also appears below if you need to share it manually.</div>
                </form>
              </div>
            )}
          </>
        )}

        <div style={{marginTop:20,display:"flex",justifyContent:"flex-end"}}>
          <button onClick={onClose} style={btn(C.border,C.sub)}>Close</button>
        </div>
      </div>
    </div>
    {removingMember&&(
      <RemoveMemberModal
        uid={uid} companyId={companyId} member={removingMember} members={members}
        onRemoved={handleMemberRemoved} onClose={()=>setRemovingMember(null)}/>
    )}
  </>);
}

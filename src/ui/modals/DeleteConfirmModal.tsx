import { useState } from 'react';
import { C, btn, inp, card } from '@/core/constants';

export default function DeleteConfirmModal({projectName,bcProjectNumber,isAdmin,project,onConfirm,onCancel}: any){
  const [deleteBC,setDeleteBC]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [confirmText,setConfirmText]=useState("");

  // Forbidden if any panel has status quoted or pushed_to_bc
  const sentStatuses=new Set(["quoted","pushed_to_bc"]);
  const quoteSent=(project?.panels||[]).some((p: any)=>sentStatuses.has(p.status||""));

  async function handleConfirm(){
    if(quoteSent||confirmText!=="DELETE")return;
    setDeleting(true);
    await onConfirm(deleteBC);
    setDeleting(false);
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:400,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onCancel}>
      <div style={{...card(),width:"100%",maxWidth:440,border:`1px solid ${quoteSent?C.red+"66":C.red+"44"}`}} onClick={(e: any)=>e.stopPropagation()}>

        {quoteSent?(
          <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:22}}>🚫</span>
              <div style={{fontSize:18,fontWeight:800,color:C.red}}>Deletion Forbidden</div>
            </div>
            <div style={{fontSize:13,color:C.sub,lineHeight:1.7,marginBottom:16}}>
              A quote has already been sent for project <strong style={{color:C.text}}>{projectName}</strong>.
              Once a quote is issued, this project is a permanent record and <strong style={{color:C.red}}>cannot be deleted</strong>.
            </div>
            <div style={{fontSize:12,color:C.muted,background:C.redDim,borderRadius:8,padding:"10px 14px",marginBottom:20,lineHeight:1.6}}>
              If this project needs to be closed or cancelled, change its status accordingly. Contact an administrator if you believe this is an error.
            </div>
            <button onClick={onCancel} style={btn(C.border,C.sub,{width:"100%",fontWeight:700})}>Close</button>
          </>
        ):(
          <>
            <div style={{fontSize:18,fontWeight:800,color:C.red,marginBottom:6}}>Delete Project?</div>
            <div style={{fontSize:13,color:C.sub,marginBottom:8}}>This will permanently delete from ARC:</div>
            <div style={{fontSize:14,fontWeight:700,color:C.text,background:C.border,borderRadius:8,padding:"10px 14px",marginBottom:14}}>{projectName}</div>

            <div style={{background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>⚠️</span>
              <div style={{fontSize:12,color:C.red,lineHeight:1.7,fontWeight:600}}>
                This action is <strong>permanent and not recoverable.</strong> All panels, drawings, BOM data, and history will be lost forever.
              </div>
            </div>

            {isAdmin&&bcProjectNumber&&(
              <div onClick={()=>setDeleteBC((v: any)=>!v)} style={{display:"flex",alignItems:"center",gap:10,background:deleteBC?C.redDim:"transparent",border:`1px solid ${deleteBC?C.red+"66":C.border}`,borderRadius:8,padding:"10px 14px",marginBottom:12,cursor:"pointer"}}>
                <div style={{width:18,height:18,borderRadius:4,border:`2px solid ${deleteBC?C.red:C.muted}`,background:deleteBC?C.red:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {deleteBC&&<span style={{color:"#fff",fontSize:11,fontWeight:700,lineHeight:1}}>✓</span>}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:deleteBC?C.red:C.sub}}>Also delete from Business Central</div>
                  <div style={{fontSize:11,color:C.muted}}>Project {bcProjectNumber} will be permanently removed from BC</div>
                </div>
              </div>
            )}

            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:6}}>Type <strong style={{color:C.red,fontFamily:"monospace",letterSpacing:1}}>DELETE</strong> to confirm:</div>
              <input
                value={confirmText}
                onChange={(e: any)=>setConfirmText(e.target.value.toUpperCase())}
                placeholder="DELETE"
                autoFocus
                style={{width:"100%",boxSizing:"border-box" as const,background:"#0d0d1a",border:`1px solid ${confirmText==="DELETE"?C.red:C.border}`,borderRadius:8,padding:"9px 12px",color:confirmText==="DELETE"?C.red:C.text,fontSize:14,fontWeight:700,fontFamily:"monospace",letterSpacing:2,outline:"none"}}
              />
            </div>

            <div style={{display:"flex",gap:10}}>
              <button onClick={onCancel} disabled={deleting} style={btn(C.border,C.sub,{flex:1})}>Cancel</button>
              <button onClick={handleConfirm} disabled={deleting||confirmText!=="DELETE"}
                style={btn(C.red,"#fff",{flex:1,fontWeight:700,opacity:(deleting||confirmText!=="DELETE")?0.4:1,cursor:confirmText!=="DELETE"?"not-allowed":"pointer"})}>
                {deleting?"Deleting…":"Delete Forever"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

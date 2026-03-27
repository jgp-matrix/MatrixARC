import { useState } from 'react';
import ReactDOM from 'react-dom';
import { C } from '@/core/constants';

import { copyProject } from '@/core/globals';

function CopyProjectModal({project,uid,onCopied,onClose}: any){
  const [name,setName]=useState((project.name||"")+" (Copy)");
  const [copying,setCopying]=useState(false);
  const [progress,setProgress]=useState<any>(null);
  const [error,setError]=useState("");

  async function handleCopy(){
    if(!name.trim())return;
    setCopying(true);setError("");
    try{
      const newProj=await copyProject(uid,{...project,name:name.trim()},(p: any)=>setProgress(p));
      onCopied(newProj);
    }catch(e: any){
      setError(e.message||"Copy failed");
      setCopying(false);setProgress(null);
    }
  }

  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
      onMouseDown={(e: any)=>{if(!copying&&e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0d0d1a",border:"1px solid "+C.accent+"66",borderRadius:10,padding:"24px 28px",width:420,boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:15,fontWeight:800,color:C.accent,marginBottom:12}}>Copy Project</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12,lineHeight:1.5}}>
          Creates a new BC project with all panels, BOM data, drawings, tasks, and planning lines copied from <strong style={{color:C.text}}>{project.bcProjectNumber}</strong>.
        </div>
        <label style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4,display:"block"}}>New Project Name</label>
        <input value={name} onChange={(e: any)=>setName(e.target.value)} disabled={copying}
          style={{width:"100%",boxSizing:"border-box",background:C.card,border:"1px solid "+C.border,borderRadius:6,padding:"8px 10px",color:C.text,fontSize:14,marginBottom:12,outline:"none"}}
          onFocus={(e: any)=>e.target.style.borderColor=C.accent} onBlur={(e: any)=>e.target.style.borderColor=C.border}/>
        <div style={{fontSize:12,color:C.sub,marginBottom:12}}>
          Customer: <strong style={{color:C.text}}>{project.bcCustomerName||"\u2014"}</strong>
        </div>
        {progress&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:progress.step==="done"?C.green:C.accent,marginBottom:4}}>{progress.msg}</div>
            <div style={{width:"100%",height:6,background:C.border,borderRadius:4,overflow:"hidden"}}>
              <div style={{height:"100%",width:(progress.pct||0)+"%",background:progress.step==="done"?C.green:`linear-gradient(90deg,${C.accent},#818cf8)`,borderRadius:4,transition:"width 0.4s"}}/>
            </div>
          </div>
        )}
        {error&&<div style={{fontSize:12,color:C.red,marginBottom:8}}>{error}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          {!copying&&<button onClick={onClose} style={{background:"transparent",border:"1px solid "+C.border,borderRadius:6,padding:"8px 16px",color:C.muted,fontSize:13,cursor:"pointer"}}>Cancel</button>}
          <button onClick={handleCopy} disabled={copying||!name.trim()}
            style={{background:copying?"#1e293b":C.accent,color:"#fff",border:"none",borderRadius:6,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:copying?"default":"pointer",opacity:copying?0.7:1}}>
            {copying?"Copying…":"Copy Project"}
          </button>
        </div>
      </div>
    </div>,document.body
  );
}

export default CopyProjectModal;

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { fbDb } from '@/core/globals';

export default function RfqHistoryModal({uid,onClose}: any){
  const [history,setHistory]=useState<any>(null);
  useEffect(()=>{
    fbDb.collection(`users/${uid}/rfq_history`).orderBy("sentAt","desc").limit(100).get()
      .then((snap: any)=>{setHistory(snap.docs.map((d: any)=>({id:d.id,...d.data()})));})
      .catch(()=>setHistory([]));
  },[uid]);
  const fmtDate=(ts: any)=>ts?new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"—";
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onMouseDown={(e: any)=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0d0d1a",border:"1px solid #2a2a3e",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:640,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",flex:1}}>RFQ Send History</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {history===null&&<div style={{color:"#64748b",fontSize:13}}>Loading…</div>}
          {history&&history.length===0&&<div style={{color:"#64748b",fontSize:13}}>No RFQ emails sent yet.</div>}
          {history&&history.map((h: any)=>(
            <div key={h.id} style={{background:"#0a0a18",border:"1px solid #2a2a3e",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                <span style={{fontWeight:700,color:"#818cf8",fontSize:13}}>{h.rfqNum}</span>
                <span style={{fontSize:11,color:"#64748b"}}>{fmtDate(h.sentAt)}</span>
                <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>{h.projectName||"—"}</span>
              </div>
              {h.sentFrom&&<div style={{fontSize:11,color:"#64748b",marginBottom:6}}>From: {h.sentFrom}</div>}
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {(h.entries||[]).map((e: any,i: any)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                    <span style={{color:e.sent?"#4ade80":e.skipped?"#64748b":"#f87171",fontWeight:700,width:14,textAlign:"center",flexShrink:0}}>{e.sent?"✓":e.skipped?"–":"✗"}</span>
                    <span style={{color:"#f1f5f9",fontWeight:600,minWidth:160}}>{e.vendorName}</span>
                    <span style={{color:"#64748b",flex:1}}>{e.vendorEmail||"no email"}</span>
                    <span style={{color:"#475569",fontSize:11}}>{(e.items||[]).length} item{(e.items||[]).length!==1?"s":""}</span>
                    {e.error&&<span style={{color:"#f87171",fontSize:10}} title={e.error}>failed</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{paddingTop:12,textAlign:"right"}}>
          <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #2a2a3e",color:"#94a3b8",padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>
  ,document.body);
}

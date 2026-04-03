// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function RfqHistoryModal({uid,onClose}){
  const [history,setHistory]=useState(null);
  const [submissions,setSubmissions]=useState(null);
  const [tab,setTab]=useState("sent"); // "sent"|"received"
  const [expandedItems,setExpandedItems]=useState({});
  useEffect(()=>{
    fbDb.collection(`users/${uid}/rfq_history`).orderBy("sentAt","desc").limit(100).get()
      .then(snap=>{setHistory(snap.docs.map(d=>({id:d.id,...d.data()})));})
      .catch(()=>setHistory([]));
    fbDb.collection('rfqUploads').where('uid','==',uid).orderBy('sentAt','desc').limit(100).get()
      .then(snap=>{setSubmissions(snap.docs.map(d=>({id:d.id,...d.data()})).filter(s=>s.status==='submitted'||s.status==='imported'||s.status==='dismissed'));})
      .catch(()=>setSubmissions([]));
  },[uid]);
  const fmtDate=ts=>ts?new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):"—";
  const fmtPrice=p=>p!=null?"$"+Number(p).toFixed(2):"—";
  const tabBtn=(id,label,count)=>React.createElement("button",{key:id,onClick:()=>setTab(id),style:{background:tab===id?"#1e293b":"transparent",color:tab===id?"#fff":"#94a3b8",border:tab===id?"1px solid #3b82f6":"1px solid transparent",borderRadius:6,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}},label+(count>0?` (${count})`:""));
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:700,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",flex:1}}>RFQ History</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {tabBtn("sent","Sent RFQs",(history||[]).length)}
          {tabBtn("received","Received Quotes",(submissions||[]).length)}
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {tab==="sent"&&<>
            {history===null&&<div style={{color:"#94a3b8",fontSize:13}}>Loading…</div>}
            {history&&history.length===0&&<div style={{color:"#94a3b8",fontSize:13}}>No RFQ emails sent yet.</div>}
            {history&&history.map(h=>(
              <div key={h.id} style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{fontWeight:700,color:"#818cf8",fontSize:13}}>{h.rfqNum}</span>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{fmtDate(h.sentAt)}</span>
                  <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>{h.projectName||"—"}</span>
                </div>
                {h.sentFrom&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:6}}>From: {h.sentFrom}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(h.entries||[]).map((e,i)=>(
                    <div key={i}>
                      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                        <span style={{color:e.sent?"#4ade80":e.skipped?"#64748b":"#f87171",fontWeight:700,width:14,textAlign:"center",flexShrink:0}}>{e.sent?"✓":e.skipped?"–":"✗"}</span>
                        <span style={{color:"#f1f5f9",fontWeight:600,minWidth:160}}>{e.vendorName}</span>
                        <span style={{color:"#94a3b8",flex:1}}>{e.vendorEmail||"no email"}</span>
                        {(e.items||[]).length>0&&<button onClick={()=>setExpandedItems(prev=>({...prev,[h.id+"-"+i]:!prev[h.id+"-"+i]}))} style={{background:"none",border:"1px solid #3d6090",borderRadius:4,color:"#94a3b8",cursor:"pointer",fontSize:10,padding:"1px 6px"}}>{(e.items||[]).length} item{(e.items||[]).length!==1?"s":""} {expandedItems[h.id+"-"+i]?"▴":"▾"}</button>}
                        {e.uploadToken&&<a href={`https://matrix-arc.web.app?rfqUpload=${e.uploadToken}`} target="_blank" rel="noopener noreferrer" style={{color:"#38bdf8",fontSize:10,fontWeight:600,textDecoration:"none"}}>Portal ↗</a>}
                        {e.error&&<span style={{color:"#f87171",fontSize:10}} title={e.error}>⚠ failed</span>}
                      </div>
                      {expandedItems[h.id+"-"+i]&&(e.items||[]).length>0&&<div style={{marginLeft:22,marginTop:4,marginBottom:4,background:"#0a0a14",border:"1px solid #3d609044",borderRadius:4,padding:"4px 8px",fontSize:10}}>
                        <table style={{width:"100%",borderCollapse:"collapse"}}>
                          <thead><tr style={{color:"#94a3b8"}}><th style={{textAlign:"left",padding:"2px 6px",fontWeight:600}}>Part #</th><th style={{textAlign:"left",padding:"2px 6px",fontWeight:600}}>Qty</th></tr></thead>
                          <tbody>{(e.items||[]).map((it,j)=><tr key={j}><td style={{padding:"1px 6px",color:"#e2e8f0"}}>{it.partNumber||"—"}</td><td style={{padding:"1px 6px",color:"#94a3b8"}}>{it.qty||1}</td></tr>)}</tbody>
                        </table>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>}
          {tab==="received"&&<>
            {submissions===null&&<div style={{color:"#94a3b8",fontSize:13}}>Loading…</div>}
            {submissions&&submissions.length===0&&<div style={{color:"#94a3b8",fontSize:13}}>No supplier quotes received yet.</div>}
            {submissions&&submissions.map(sub=>(
              <div key={sub.id} style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{fontWeight:700,color:"#818cf8",fontSize:13}}>{sub.vendorName||"—"}</span>
                  <span style={{fontSize:11,color:sub.status==="imported"?"#4ade80":sub.status==="dismissed"?"#64748b":"#fbbf24",fontWeight:600}}>{sub.status==="imported"?"✓ Applied":sub.status==="dismissed"?"Dismissed":"Pending"}</span>
                  <span style={{fontSize:11,color:"#94a3b8"}}>{sub.rfqNum||""}</span>
                  <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>{fmtDate(sub.submittedAt)}</span>
                </div>
                {sub.leadTimeDays!=null&&<div style={{fontSize:11,color:"#94a3b8",marginBottom:4}}>Lead time: {sub.leadTimeDays} days</div>}
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:6}}>
                  <thead><tr style={{background:"#111128"}}>
                    <th style={{padding:"4px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600}}>Part #</th>
                    <th style={{padding:"4px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600}}>Supplier PN</th>
                    <th style={{padding:"4px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600}}>Description</th>
                    <th style={{padding:"4px 8px",textAlign:"right",color:"#94a3b8",fontWeight:600}}>Price</th>
                    <th style={{padding:"4px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600}}>Notes</th>
                  </tr></thead>
                  <tbody>{(sub.lineItems||[]).map((item,i)=>(
                    <tr key={i} style={{borderTop:"1px solid #1a1a2e",opacity:item.cannotSupply?0.5:1}}>
                      <td style={{padding:"3px 8px",fontFamily:"monospace",fontWeight:600,color:item.isVariance?"#3b82f6":"#f1f5f9",fontSize:10}}>{item.isVariance?item.supplierCorrectedPN:item.partNumber||"—"}{item.isVariance&&<span style={{color:"#ef4444",textDecoration:"line-through",marginLeft:4,fontSize:9}}>{item.originalPartNumber}</span>}</td>
                      <td style={{padding:"3px 8px",fontFamily:"monospace",color:"#94a3b8",fontSize:10}}>{item.supplierPartNumber||"—"}</td>
                      <td style={{padding:"3px 8px",color:"#94a3b8",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description||"—"}</td>
                      <td style={{padding:"3px 8px",textAlign:"right",color:item.cannotSupply?"#ef4444":item.unitPrice!=null?"#4ade80":"#475569",fontWeight:700}}>{item.cannotSupply?"N/A":fmtPrice(item.unitPrice)}</td>
                      <td style={{padding:"3px 8px",color:"#94a3b8",fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.supplierNote||"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{display:"flex",gap:10}}>
                  {sub.storageUrl&&<a href={sub.storageUrl} target="_blank" rel="noopener noreferrer" style={{color:"#38bdf8",fontSize:11,fontWeight:600,textDecoration:"none"}}>📄 View PDF</a>}
                  <a href={`https://matrix-arc.web.app?rfqUpload=${sub.id}`} target="_blank" rel="noopener noreferrer" style={{color:"#a78bfa",fontSize:11,fontWeight:600,textDecoration:"none"}}>🔗 Supplier Portal</a>
                </div>
              </div>
            ))}
          </>}
        </div>
        <div style={{paddingTop:12,textAlign:"right"}}>
          <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>
  ,document.body);
}

export default RfqHistoryModal;

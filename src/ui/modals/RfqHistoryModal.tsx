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
  const tabBtn=(id,label,count)=>React.createElement("button",{key:id,onClick:()=>setTab(id),style:{background:tab===id?C.accentDim:"transparent",color:tab===id?C.accent:C.muted,border:tab===id?`1px solid ${C.accent}`:"1px solid transparent",borderRadius:6,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}},label+(count>0?` (${count})`:""));
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:700,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 4px 20px rgba(0,0,0,0.12)"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:C.text,flex:1}}>RFQ History</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:12}}>
          {tabBtn("sent","Sent RFQs",(history||[]).length)}
          {tabBtn("received","Received Quotes",(submissions||[]).length)}
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {tab==="sent"&&<>
            {history===null&&<div style={{color:C.muted,fontSize:13}}>Loading…</div>}
            {history&&history.length===0&&<div style={{color:C.muted,fontSize:13}}>No RFQ emails sent yet.</div>}
            {history&&history.map(h=>(
              <div key={h.id} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{fontWeight:700,color:C.purple,fontSize:13}}>{h.rfqNum}</span>
                  <span style={{fontSize:11,color:C.muted}}>{fmtDate(h.sentAt)}</span>
                  <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>{h.projectName||"—"}</span>
                </div>
                {h.sentFrom&&<div style={{fontSize:11,color:C.muted,marginBottom:6}}>From: {h.sentFrom}</div>}
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {(h.entries||[]).map((e,i)=>(
                    <div key={i}>
                      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                        <span style={{color:e.sent?C.green:e.skipped?C.muted:C.red,fontWeight:700,width:14,textAlign:"center",flexShrink:0}}>{e.sent?"✓":e.skipped?"–":"✗"}</span>
                        <span style={{color:C.text,fontWeight:600,minWidth:160}}>{e.vendorName}</span>
                        <span style={{color:C.muted,flex:1}}>{e.vendorEmail||"no email"}</span>
                        {(e.items||[]).length>0&&<button onClick={()=>setExpandedItems(prev=>({...prev,[h.id+"-"+i]:!prev[h.id+"-"+i]}))} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:4,color:C.muted,cursor:"pointer",fontSize:10,padding:"1px 6px"}}>{(e.items||[]).length} item{(e.items||[]).length!==1?"s":""} {expandedItems[h.id+"-"+i]?"▴":"▾"}</button>}
                        {e.uploadToken&&<a href={`https://matrix-arc.web.app?rfqUpload=${e.uploadToken}`} target="_blank" rel="noopener noreferrer" style={{color:C.accent,fontSize:10,fontWeight:600,textDecoration:"none"}}>Portal ↗</a>}
                        {e.error&&<span style={{color:C.red,fontSize:10}} title={e.error}>⚠ failed</span>}
                      </div>
                      {expandedItems[h.id+"-"+i]&&(e.items||[]).length>0&&<div style={{marginLeft:22,marginTop:4,marginBottom:4,background:C.bg,border:`1px solid ${C.border}44`,borderRadius:4,padding:"4px 8px",fontSize:10}}>
                        <table style={{width:"100%",borderCollapse:"collapse"}}>
                          <thead><tr style={{color:C.muted}}><th style={{textAlign:"left",padding:"2px 6px",fontWeight:600}}>Part #</th><th style={{textAlign:"left",padding:"2px 6px",fontWeight:600}}>Qty</th></tr></thead>
                          <tbody>{(e.items||[]).map((it,j)=><tr key={j}><td style={{padding:"1px 6px",color:C.text}}>{it.partNumber||"—"}</td><td style={{padding:"1px 6px",color:C.muted}}>{it.qty||1}</td></tr>)}</tbody>
                        </table>
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>}
          {tab==="received"&&<>
            {submissions===null&&<div style={{color:C.muted,fontSize:13}}>Loading…</div>}
            {submissions&&submissions.length===0&&<div style={{color:C.muted,fontSize:13}}>No supplier quotes received yet.</div>}
            {submissions&&submissions.map(sub=>(
              <div key={sub.id} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{fontWeight:700,color:C.purple,fontSize:13}}>{sub.vendorName||"—"}</span>
                  <span style={{fontSize:11,color:sub.status==="imported"?C.green:sub.status==="dismissed"?C.muted:C.yellow,fontWeight:600}}>{sub.status==="imported"?"✓ Applied":sub.status==="dismissed"?"Dismissed":"Pending"}</span>
                  <span style={{fontSize:11,color:C.muted}}>{sub.rfqNum||""}</span>
                  <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>{fmtDate(sub.submittedAt)}</span>
                </div>
                {sub.leadTimeDays!=null&&<div style={{fontSize:11,color:C.muted,marginBottom:4}}>Lead time: {sub.leadTimeDays} days</div>}
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginBottom:6}}>
                  <thead><tr style={{background:C.accentDim}}>
                    <th style={{padding:"4px 8px",textAlign:"left",color:C.muted,fontWeight:600}}>Part #</th>
                    <th style={{padding:"4px 8px",textAlign:"left",color:C.muted,fontWeight:600}}>Supplier PN</th>
                    <th style={{padding:"4px 8px",textAlign:"left",color:C.muted,fontWeight:600}}>Description</th>
                    <th style={{padding:"4px 8px",textAlign:"right",color:C.muted,fontWeight:600}}>Price</th>
                    <th style={{padding:"4px 8px",textAlign:"left",color:C.muted,fontWeight:600}}>Notes</th>
                  </tr></thead>
                  <tbody>{(sub.lineItems||[]).map((item,i)=>(
                    <tr key={i} style={{borderTop:`1px solid ${C.border}`,opacity:item.cannotSupply?0.5:1}}>
                      <td style={{padding:"3px 8px",fontFamily:"monospace",fontWeight:600,color:item.isVariance?C.accent:C.text,fontSize:10}}>{item.isVariance?item.supplierCorrectedPN:item.partNumber||"—"}{item.isVariance&&<span style={{color:C.red,textDecoration:"line-through",marginLeft:4,fontSize:9}}>{item.originalPartNumber}</span>}</td>
                      <td style={{padding:"3px 8px",fontFamily:"monospace",color:C.muted,fontSize:10}}>{item.supplierPartNumber||"—"}</td>
                      <td style={{padding:"3px 8px",color:C.muted,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description||"—"}</td>
                      <td style={{padding:"3px 8px",textAlign:"right",color:item.cannotSupply?C.red:item.unitPrice!=null?C.green:C.muted,fontWeight:700}}>{item.cannotSupply?"N/A":fmtPrice(item.unitPrice)}</td>
                      <td style={{padding:"3px 8px",color:C.muted,fontSize:10,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.supplierNote||"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{display:"flex",gap:10}}>
                  {sub.storageUrl&&<a href={sub.storageUrl} target="_blank" rel="noopener noreferrer" style={{color:C.accent,fontSize:11,fontWeight:600,textDecoration:"none"}}>📄 View PDF</a>}
                  <a href={`https://matrix-arc.web.app?rfqUpload=${sub.id}`} target="_blank" rel="noopener noreferrer" style={{color:C.purple,fontSize:11,fontWeight:600,textDecoration:"none"}}>🔗 Supplier Portal</a>
                </div>
              </div>
            ))}
          </>}
        </div>
        <div style={{paddingTop:12,textAlign:"right"}}>
          <button onClick={onClose} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.muted,padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>
  ,document.body);
}

export default RfqHistoryModal;

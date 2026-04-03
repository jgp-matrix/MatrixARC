// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function PortalSubmissionsModal({submissions,onClose,onApplyPrices,onImportPdf}){
  const [applying,setApplying]=useState(null); // submission.id being applied
  const fmtDate=ts=>ts?new Date(ts).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—";
  const fmtPrice=p=>p!=null?"$"+Number(p).toFixed(2):"—";
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:680,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",flex:1}}>📥 Supplier Quote Submissions</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {submissions.length===0&&<div style={{color:"#94a3b8",fontSize:13,textAlign:"center",padding:"30px 0"}}>No submissions yet.</div>}
          {submissions.map(sub=>(
            <div key={sub.id} style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:8,padding:"14px 16px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontWeight:700,color:"#818cf8",fontSize:14}}>{sub.vendorName||"—"}</span>
                <span style={{fontSize:11,color:"#94a3b8"}}>{sub.rfqNum||""}</span>
                <span style={{fontSize:11,color:"#94a3b8",marginLeft:"auto"}}>Submitted {fmtDate(sub.submittedAt)}</span>
              </div>
              {sub.leadTimeDays!=null&&<div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>Lead time: <strong style={{color:"#f1f5f9"}}>{sub.leadTimeDays} days ARO</strong></div>}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:10}}>
                <thead>
                  <tr style={{background:"#111128"}}>
                    <th style={{padding:"5px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600}}>Part #</th>
                    <th style={{padding:"5px 8px",textAlign:"left",color:"#94a3b8",fontWeight:600}}>Description</th>
                    <th style={{padding:"5px 8px",textAlign:"center",color:"#94a3b8",fontWeight:600}}>Qty</th>
                    <th style={{padding:"5px 8px",textAlign:"right",color:"#4ade80",fontWeight:700}}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(sub.lineItems||[]).filter(item=>(item.partNumber||'').trim()||(item.unitPrice!=null)||(item.description||'').trim()).map((item,i)=>(
                    <tr key={i} style={{borderTop:"1px solid #1a1a2e",opacity:item.cannotSupply?0.5:1}}>
                      <td style={{padding:"5px 8px",fontWeight:600,color:item.cannotSupply?"#64748b":item.isVariance?"#3b82f6":"#f1f5f9",fontFamily:"monospace",fontSize:11,textDecoration:item.cannotSupply?"line-through":undefined}}>
                        {item.partNumber||"—"}
                        {item.supplierPartNumber&&normPart(item.supplierPartNumber)!==normPart(item.partNumber||"")&&<span style={{color:"#a78bfa",fontSize:10,marginLeft:4}}>→ {item.supplierPartNumber}</span>}
                      </td>
                      <td style={{padding:"5px 8px",color:"#94a3b8",textDecoration:item.cannotSupply?"line-through":undefined}}>{item.description||"—"}</td>
                      <td style={{padding:"5px 8px",textAlign:"center",color:"#94a3b8"}}>{item.qty||1}</td>
                      <td style={{padding:"5px 8px",textAlign:"right",color:item.cannotSupply?"#ef4444":item.unitPrice!=null?"#4ade80":"#475569",fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{item.cannotSupply?"Cannot Supply":fmtPrice(item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {(sub.lineItems||[]).some(i=>i.unitPrice!=null)&&(
                  <button disabled={applying===sub.id} onClick={async()=>{setApplying(sub.id);await onApplyPrices(sub);setApplying(null);}} style={{background:"#0d2010",border:"1px solid #4ade80",color:"#4ade80",padding:"5px 14px",borderRadius:6,cursor:applying===sub.id?"wait":"pointer",fontSize:12,fontFamily:"inherit",fontWeight:700,opacity:applying===sub.id?0.6:1}}>{applying===sub.id?"Pushing to BC…":"✓ Apply Prices to BOM"}</button>
                )}
                {sub.storageUrl&&<a href={sub.storageUrl} target="_blank" rel="noopener noreferrer" style={{background:"#0d1520",border:"1px solid #0284c7",color:"#38bdf8",padding:"5px 14px",borderRadius:6,fontSize:12,fontFamily:"inherit",fontWeight:600,textDecoration:"none"}}>📄 View PDF</a>}
                {sub.fileName&&!sub.storageUrl&&<span style={{fontSize:11,color:"#94a3b8"}}>📄 {sub.fileName}</span>}
                <button onClick={()=>{if(confirm("Dismiss this submission? It will no longer appear here."))fbDb.collection('rfqUploads').doc(sub.id).update({status:'dismissed'}).catch(e=>console.warn("dismiss failed:",e));}} style={{marginLeft:"auto",background:"none",border:`1px solid #475569`,color:"#94a3b8",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Dismiss</button>
                <button onClick={()=>{if(confirm("Reset this submission so the supplier can re-upload? The supplier's link will work again."))fbDb.collection('rfqUploads').doc(sub.id).update({status:'pending',submittedAt:null,lineItems:sub.lineItems?.map(item=>({partNumber:item.partNumber,description:item.description,qty:item.qty,manufacturer:item.manufacturer}))}).catch(e=>console.warn("reset failed:",e));}} style={{background:"none",border:"1px solid #f59e0b44",color:"#f59e0b",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Reset for Re-upload</button>
                <button onClick={()=>{if(confirm("DELETE this RFQ submission permanently? This cannot be undone."))fbDb.collection('rfqUploads').doc(sub.id).delete().catch(e=>console.warn("delete failed:",e));}} style={{background:"none",border:"1px solid #ef444444",color:"#ef4444",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{paddingTop:12,display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onImportPdf} style={{background:"#1a1a2a",border:"1px solid #4f46e5",color:"#a5b4fc",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>📤 Import PDF Instead</button>
          <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>
  ,document.body);
}

export default PortalSubmissionsModal;

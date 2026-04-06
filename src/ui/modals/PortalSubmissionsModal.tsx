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
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:680,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 4px 20px rgba(0,0,0,0.12)"}}>
        <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:800,color:C.text,flex:1}}>📥 Supplier Quote Submissions</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {submissions.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",padding:"30px 0"}}>No submissions yet.</div>}
          {submissions.map(sub=>(
            <div key={sub.id} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontWeight:700,color:C.purple,fontSize:14}}>{sub.vendorName||"—"}</span>
                <span style={{fontSize:11,color:C.muted}}>{sub.rfqNum||""}</span>
                <span style={{fontSize:11,color:C.muted,marginLeft:"auto"}}>Submitted {fmtDate(sub.submittedAt)}</span>
              </div>
              {sub.leadTimeDays!=null&&<div style={{fontSize:12,color:C.muted,marginBottom:8}}>Lead time: <strong style={{color:C.text}}>{sub.leadTimeDays} days ARO</strong></div>}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,marginBottom:10}}>
                <thead>
                  <tr style={{background:C.bg}}>
                    <th style={{padding:"5px 8px",textAlign:"left",color:C.muted,fontWeight:600}}>Part #</th>
                    <th style={{padding:"5px 8px",textAlign:"left",color:C.muted,fontWeight:600}}>Description</th>
                    <th style={{padding:"5px 8px",textAlign:"center",color:C.muted,fontWeight:600}}>Qty</th>
                    <th style={{padding:"5px 8px",textAlign:"right",color:C.green,fontWeight:700}}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(sub.lineItems||[]).filter(item=>(item.partNumber||'').trim()||(item.unitPrice!=null)||(item.description||'').trim()).map((item,i)=>(
                    <tr key={i} style={{borderTop:`1px solid ${C.border}`,opacity:item.cannotSupply?0.5:1}}>
                      <td style={{padding:"5px 8px",fontWeight:600,color:item.cannotSupply?C.muted:item.isVariance?C.accent:C.text,fontFamily:"monospace",fontSize:11,textDecoration:item.cannotSupply?"line-through":undefined}}>
                        {item.partNumber||"—"}
                        {item.supplierPartNumber&&normPart(item.supplierPartNumber)!==normPart(item.partNumber||"")&&<span style={{color:C.purple,fontSize:10,marginLeft:4}}>→ {item.supplierPartNumber}</span>}
                      </td>
                      <td style={{padding:"5px 8px",color:C.muted,textDecoration:item.cannotSupply?"line-through":undefined}}>{item.description||"—"}</td>
                      <td style={{padding:"5px 8px",textAlign:"center",color:C.muted}}>{item.qty||1}</td>
                      <td style={{padding:"5px 8px",textAlign:"right",color:item.cannotSupply?C.red:item.unitPrice!=null?C.green:C.muted,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{item.cannotSupply?"Cannot Supply":fmtPrice(item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                {(sub.lineItems||[]).some(i=>i.unitPrice!=null)&&(
                  <button disabled={applying===sub.id} onClick={async()=>{setApplying(sub.id);await onApplyPrices(sub);setApplying(null);}} style={{background:C.greenDim,border:`1px solid ${C.green}`,color:C.green,padding:"5px 14px",borderRadius:6,cursor:applying===sub.id?"wait":"pointer",fontSize:12,fontFamily:"inherit",fontWeight:700,opacity:applying===sub.id?0.6:1}}>{applying===sub.id?"Pushing to BC…":"✓ Apply Prices to BOM"}</button>
                )}
                {sub.storageUrl&&<a href={sub.storageUrl} target="_blank" rel="noopener noreferrer" style={{background:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,padding:"5px 14px",borderRadius:6,fontSize:12,fontFamily:"inherit",fontWeight:600,textDecoration:"none"}}>📄 View PDF</a>}
                {sub.fileName&&!sub.storageUrl&&<span style={{fontSize:11,color:C.muted}}>📄 {sub.fileName}</span>}
                <button onClick={()=>{if(confirm("Dismiss this submission? It will no longer appear here."))fbDb.collection('rfqUploads').doc(sub.id).update({status:'dismissed'}).catch(e=>console.warn("dismiss failed:",e));}} style={{marginLeft:"auto",background:"none",border:`1px solid ${C.border}`,color:C.muted,padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Dismiss</button>
                <button onClick={()=>{if(confirm("Reset this submission so the supplier can re-upload? The supplier's link will work again."))fbDb.collection('rfqUploads').doc(sub.id).update({status:'pending',submittedAt:null,lineItems:sub.lineItems?.map(item=>({partNumber:item.partNumber,description:item.description,qty:item.qty,manufacturer:item.manufacturer}))}).catch(e=>console.warn("reset failed:",e));}} style={{background:"none",border:`1px solid ${C.yellow}44`,color:C.yellow,padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Reset for Re-upload</button>
                <button onClick={()=>{if(confirm("DELETE this RFQ submission permanently? This cannot be undone."))fbDb.collection('rfqUploads').doc(sub.id).delete().catch(e=>console.warn("delete failed:",e));}} style={{background:"none",border:`1px solid ${C.red}44`,color:C.red,padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:"inherit",fontWeight:600}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
        <div style={{paddingTop:12,display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onImportPdf} style={{background:C.accentDim,border:`1px solid ${C.accent}`,color:C.accent,padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>📤 Import PDF Instead</button>
          <button onClick={onClose} style={{background:C.bg,border:`1px solid ${C.border}`,color:C.muted,padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>
  ,document.body);
}

export default PortalSubmissionsModal;

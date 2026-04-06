// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function CADLinkSendModal({project,onClose}){
  const [toEmail,setToEmail]=useState("");
  const [messageText,setMessageText]=useState("");
  const [sending,setSending]=useState(false);
  const [downloading,setDownloading]=useState(false);
  const panels=(project.panels||[]).filter(p=>(p.bom||[]).some(r=>!r.isLaborRow));
  const bcNum=project.bcProjectNumber||"PRJ";
  const projName=project.name||"Project";

  function buildCADLinkRows(pan,panIdx){
    const n=panIdx+1;
    const lineSuffix=String(n*100);
    const taskPN=`${bcNum}-${lineSuffix}`;
    const desc=(pan.drawingNo?`${pan.drawingNo} Rev ${pan.drawingRev||"-"} - `:"")+(projName||pan.drawingDesc||pan.name||`Panel ${n}`);
    const allBomRows=(pan.bom||[]).filter(r=>!r.isLaborRow);
    const isTailRow=r=>CONTINGENCY_PNS.has((r.partNumber||"").trim().toUpperCase())||/^job.?buyoff$/i.test(r.partNumber)||/^crat(e|ing)$/i.test((r.description||"").trim());
    const isContingencyRow=r=>CONTINGENCY_PNS.has((r.partNumber||"").trim().toUpperCase());
    const isBottomRow=r=>/^job.?buyoff$/i.test(r.partNumber)||/^crat(e|ing)$/i.test((r.description||"").trim());
    const header=["Level","Part number","Part Revision","Short Description","Long Description","QtyPer","Part Type","UOM","Unit Cost"];
    const rows=[header];
    rows.push([0,taskPN,1,desc.slice(0,50),"",1,2,"EA",""]);
    allBomRows.filter(isContingencyRow).forEach(r=>rows.push([1,(r.partNumber||"").trim(),1,(r.description||"").slice(0,50),"",r.qty||1,1,"EA",r.unitPrice!=null?Number(r.unitPrice).toFixed(2):""]));
    allBomRows.filter(r=>!isTailRow(r)).forEach(r=>rows.push([1,(r.partNumber||"").trim(),1,(r.description||"").slice(0,50),"",r.qty||1,1,"EA",r.unitPrice!=null?Number(r.unitPrice).toFixed(2):""]));
    allBomRows.filter(isBottomRow).forEach(r=>rows.push([1,(r.partNumber||"").trim(),1,(r.description||"").slice(0,50),"",r.qty||1,1,"EA",r.unitPrice!=null?Number(r.unitPrice).toFixed(2):""]));
    return{rows,taskPN,fileName:`CADLink_${taskPN.replace(/[^a-z0-9\-]/gi,"_")}.xls`};
  }

  async function ensureXLSX(){
    if(!window.XLSX){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');s.src='https://unpkg.com/xlsx/dist/xlsx.full.min.js';
        s.onload=res;s.onerror=()=>rej(new Error('Failed to load XLSX library'));document.head.appendChild(s);
      });
    }
    return window.XLSX;
  }

  async function handleDownload(){
    setDownloading(true);
    try{
      const XL=await ensureXLSX();
      panels.forEach((pan,i)=>{
        const{rows,fileName}=buildCADLinkRows(pan,i);
        const ws=XL.utils.aoa_to_sheet(rows);
        const wb=XL.utils.book_new();
        XL.utils.book_append_sheet(wb,ws,"BOM");
        XL.writeFile(wb,fileName,{bookType:"biff8"});
      });
    }catch(e){alert("Download failed: "+e.message);}
    setDownloading(false);
  }

  async function handleSend(){
    if(!toEmail.trim()){alert("Enter a recipient email.");return;}
    setSending(true);
    try{
      const graphToken=await acquireGraphToken();
      if(!graphToken){alert("Could not get Microsoft 365 token.");setSending(false);return;}
      const XL=await ensureXLSX();
      // Build all XLS files as base64 attachments
      const attachments=panels.map((pan,i)=>{
        const{rows,fileName}=buildCADLinkRows(pan,i);
        const ws=XL.utils.aoa_to_sheet(rows);
        const wb=XL.utils.book_new();
        XL.utils.book_append_sheet(wb,ws,"BOM");
        const xlsData=XL.write(wb,{bookType:"biff8",type:"base64"});
        return{"@odata.type":"#microsoft.graph.fileAttachment",name:fileName,contentType:"application/vnd.ms-excel",contentBytes:xlsData};
      });
      const q=project.quote||{};
      const subject=`CADLink BOMs — ${bcNum} ${projName}`;
      // Build rich email with all project + panel info
      const panelRows=panels.map((p,i)=>{
        const bomCount=(p.bom||[]).filter(r=>!r.isLaborRow).length;
        const sell=computePanelSellPrice(p);
        return`<tr style="border-bottom:1px solid #e2e8f0">
          <td style="padding:6px 10px;font-weight:700">Line ${i+1}</td>
          <td style="padding:6px 10px">${p.drawingNo||p.name||"Panel "+(i+1)}</td>
          <td style="padding:6px 10px">${p.drawingDesc||p.name||"—"}</td>
          <td style="padding:6px 10px">${p.drawingRev||"—"}</td>
          <td style="padding:6px 10px;text-align:center">${p.lineQty??1}</td>
          <td style="padding:6px 10px;text-align:right">${bomCount} items</td>
        </tr>`;
      }).join("");
      const htmlBody=`<div style="font-family:-apple-system,sans-serif;font-size:14px;color:#1e293b;line-height:1.7">
        <p>Attached are the CADLink BOM files for import.</p>
        ${messageText?`<p style="margin:12px 0;padding:10px 14px;background:#f8fafc;border-left:3px solid #2563eb;border-radius:0 4px 4px 0">${messageText.split("\n").map(l=>l.trim()||"<br/>").join("<br/>")}</p>`:""}
        <table style="border-collapse:collapse;margin:16px 0;font-size:13px;width:100%;max-width:600px">
          <tr style="background:#f1f5f9;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">
            <td colspan="6" style="padding:10px;font-size:14px;letter-spacing:0">Project Information</td>
          </tr>
          <tr><td style="padding:4px 10px;color:#64748b;width:120px">Project #</td><td colspan="5" style="padding:4px 10px;font-weight:600">${bcNum}</td></tr>
          <tr><td style="padding:4px 10px;color:#64748b">Project Name</td><td colspan="5" style="padding:4px 10px;font-weight:600">${projName}</td></tr>
          <tr><td style="padding:4px 10px;color:#64748b">Customer</td><td colspan="5" style="padding:4px 10px">${project.bcCustomerName||q.company||"—"}</td></tr>
          <tr><td style="padding:4px 10px;color:#64748b">Contact</td><td colspan="5" style="padding:4px 10px">${project.bcContactName||q.contact||"—"}</td></tr>
          <tr><td style="padding:4px 10px;color:#64748b">Salesperson</td><td colspan="5" style="padding:4px 10px">${project.bcSalesperson||q.salesperson||"—"}</td></tr>
          <tr><td style="padding:4px 10px;color:#64748b">PM</td><td colspan="5" style="padding:4px 10px">${project.bcProjectManager||"—"}</td></tr>
          ${q.paymentTerms?`<tr><td style="padding:4px 10px;color:#64748b">Payment Terms</td><td colspan="5" style="padding:4px 10px">${q.paymentTerms}</td></tr>`:""}
          ${q.requestedShipDate||panels.find(p=>p.requestedShipDate)?`<tr><td style="padding:4px 10px;color:#64748b">Req. Ship Date</td><td colspan="5" style="padding:4px 10px">${q.requestedShipDate||panels.find(p=>p.requestedShipDate)?.requestedShipDate||"TBD"}</td></tr>`:""}
        </table>
        <table style="border-collapse:collapse;margin:16px 0;font-size:13px;width:100%;max-width:600px;border:1px solid #e2e8f0">
          <tr style="background:#f1f5f9;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">
            <td style="padding:6px 10px">Line</td><td style="padding:6px 10px">DWG #</td><td style="padding:6px 10px">Description</td><td style="padding:6px 10px">Rev</td><td style="padding:6px 10px;text-align:center">Qty</td><td style="padding:6px 10px;text-align:right">BOM</td>
          </tr>
          ${panelRows}
        </table>
        <p style="font-size:12px;color:#64748b;margin-top:16px">${panels.length} file${panels.length!==1?"s":""} attached. Generated by ARC.</p>
      </div>`;
      const msg={subject,body:{contentType:"HTML",content:htmlBody},toRecipients:toEmail.split(/[,;]\s*/).filter(e=>e.trim()).map(e=>({emailAddress:{address:e.trim()}})),attachments};
      const r=await fetch("https://graph.microsoft.com/v1.0/me/sendMail",{method:"POST",headers:{"Authorization":`Bearer ${graphToken}`,"Content-Type":"application/json"},body:JSON.stringify({message:msg,saveToSentItems:true})});
      if(!r.ok){const err=await r.text();throw new Error(err);}
      onClose();alert("CADLink BOMs sent to "+toEmail);
    }catch(e){alert("Send failed: "+e.message);}
    setSending(false);
  }

  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"24px 28px",width:"95%",maxWidth:500,boxShadow:"0 4px 20px rgba(0,0,0,0.12)"}}>
        <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:4}}>📦 CADLink BOM Export</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:14}}>{bcNum} — {projName}</div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Panels ({panels.length})</div>
          {panels.map((p,i)=>(
            <div key={p.id||i} style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.sub,padding:"3px 0",borderBottom:`1px solid ${C.border}22`}}>
              <span>Line {i+1}: {p.drawingNo||p.name||"Panel "+(i+1)}</span>
              <span style={{color:C.muted}}>{(p.bom||[]).filter(r=>!r.isLaborRow).length} items</span>
            </div>
          ))}
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>Send To (separate multiple with commas)</label>
          {/* BC user quick-select chips */}
          {(()=>{const users=(window._arcSalespersonCache||[]).filter(s=>s.E_Mail);
            return users.length>0?(
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:6}}>
                {users.map(s=>{
                  const isSelected=toEmail.toLowerCase().includes(s.E_Mail.toLowerCase());
                  return <button key={s.Code} type="button" onClick={()=>{
                    if(isSelected){
                      // Remove this email
                      const emails=toEmail.split(/[,;]\s*/).filter(e=>e.trim().toLowerCase()!==s.E_Mail.toLowerCase()).join(", ");
                      setToEmail(emails);
                    }else{
                      // Add this email
                      setToEmail(prev=>prev.trim()?(prev.trim().replace(/[,;]\s*$/,"")+", "+s.E_Mail):s.E_Mail);
                    }
                  }} style={{background:isSelected?C.greenDim:"transparent",border:`1px solid ${isSelected?C.green:C.border}`,borderRadius:12,padding:"2px 8px",fontSize:10,color:isSelected?C.green:C.muted,cursor:"pointer",fontWeight:isSelected?700:400}}>
                    {isSelected?"✓ ":""}{s.Name}{s.Job_Title?" ("+s.Job_Title+")":""}
                  </button>;
                })}
              </div>
            ):null;
          })()}
          <input value={toEmail} onChange={e=>setToEmail(e.target.value)} placeholder="engineering@matrixpci.com, cad@matrixpci.com"
            onKeyDown={e=>{if(e.key==="Enter"&&toEmail.trim())handleSend();}}
            style={{...inp({fontSize:13}),width:"100%",boxSizing:"border-box"}}/>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>Message (optional)</label>
          <textarea value={messageText} onChange={e=>setMessageText(e.target.value)} placeholder="Add notes or instructions for the recipient…" rows={3}
            style={{...inp({fontSize:13,resize:"vertical",lineHeight:1.6}),width:"100%",boxSizing:"border-box"}}/>
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={handleDownload} disabled={downloading}
            style={btn(C.greenDim,C.green,{flex:1,fontSize:13,fontWeight:700,border:`1px solid ${C.green}66`,opacity:downloading?0.5:1})}>
            {downloading?"Downloading…":`⬇ Download ${panels.length} File${panels.length!==1?"s":""}`}
          </button>
          <button onClick={handleSend} disabled={sending||!toEmail.trim()}
            style={btn(C.accentDim,C.accent,{flex:1,fontSize:13,fontWeight:700,border:`1px solid ${C.accent}`,opacity:sending||!toEmail.trim()?0.5:1})}>
            {sending?"Sending…":"✉ Send via Email"}
          </button>
        </div>
        <div style={{textAlign:"right",marginTop:8}}>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Cancel</button>
        </div>
      </div>
    </div>
  ,document.body);
}

export default CADLinkSendModal;

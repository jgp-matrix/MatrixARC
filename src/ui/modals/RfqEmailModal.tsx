import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import firebase from 'firebase/compat/app';
import { _appCtx, fbAuth, fbDb } from '@/core/globals';

import { vendorCode } from '@/services/supplierQuote';
import { acquireGraphToken, sendGraphEmail } from '@/services/graphEmail';
import { buildRfqEmailHtml, buildRfqPdf } from '@/services/rfq';

export default function RfqEmailModal({groups,projectName,projectId,bcProjectNumber,uid,userEmail,onClose,onSent,onPrint}: any){
  const [emails,setEmails]=useState(()=>{const m: any={};groups.forEach((g: any)=>{m[g.vendorName]=g.vendorEmail||"";});return m;});
  const [included,setIncluded]=useState(()=>{const m: any={};groups.forEach((g: any)=>{m[g.vendorName]=true;});return m;});
  const [statuses,setStatuses]=useState<any>({});
  const [sending,setSending]=useState(false);
  const [done,setDone]=useState(false);
  const [previewGroup,setPreviewGroup]=useState<any>(null);
  const fromEmail=userEmail||fbAuth.currentUser?.email||"your Outlook account";
  const _today=new Date();
  const _rfqBase=bcProjectNumber||Date.now().toString(36).toUpperCase().slice(-6);
  const _makeRfqNum=(vendor: any)=>`${vendorCode(vendor)}-${_rfqBase}`;
  const _rfqDate=_today.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const _responseBy=new Date(_today.getTime()+14*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  async function sendAll(shouldPrint=false){
    setSending(true);
    const graphToken=await acquireGraphToken();
    if(!graphToken){setSending(false);alert("Could not get Microsoft 365 token. Make sure you are signed in to your Microsoft account.");return;}
    const today=_today;
    const rfqBase=_rfqBase;
    const makeRfqNum=_makeRfqNum;
    const rfqDate=_rfqDate;
    const responseBy=_responseBy;
    // Generate per-vendor upload tokens and store in Firestore
    const vendorTokens: any={};
    const uploadExpiry=Date.now()+30*24*60*60*1000;
    const currentUid=uid||fbAuth.currentUser?.uid||"";
    for(const group of groups){
      if(included[group.vendorName]&&(emails[group.vendorName]||"").trim()){
        const rfqNum=makeRfqNum(group.vendorName);
        const tok=Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b: any)=>b.toString(16).padStart(2,'0')).join('');
        vendorTokens[group.vendorName]=tok;
        fbDb.collection('rfqUploads').doc(tok).set({uid:currentUid,projectId:projectId||"",projectName:projectName||"",vendorName:group.vendorName,vendorNumber:group.vendorNo||"",vendorEmail:(emails[group.vendorName]||"").trim(),rfqNum,lineItems:group.items.map((i: any)=>({partNumber:i.partNumber||"",description:i.description||"",qty:i.qty||1,manufacturer:i.manufacturer||""})),sentAt:Date.now(),expiresAt:uploadExpiry,status:"pending",companyName:_appCtx.company?.name||"",companyLogoUrl:_appCtx.company?.logoUrl||"",companyAddress:_appCtx.company?.address||"",companyPhone:_appCtx.company?.phone||""}).catch((e: any)=>console.warn("rfqUpload save failed:",e));
      }
    }
    const sentItemIds: any[]=[];
    const historyEntries: any[]=[];
    for(const group of groups){
      if(!included[group.vendorName]){
        setStatuses((prev: any)=>({...prev,[group.vendorName]:{state:"skipped"}}));
        historyEntries.push({vendorName:group.vendorName,vendorEmail:emails[group.vendorName]||"",items:group.items.map((i: any)=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:false,skipped:true});
        continue;
      }
      const to=(emails[group.vendorName]||"").trim();
      if(!to){
        setStatuses((prev: any)=>({...prev,[group.vendorName]:{state:"error",msg:"No email address"}}));
        historyEntries.push({vendorName:group.vendorName,vendorEmail:"",items:group.items.map((i: any)=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:false,skipped:false,error:"No email address"});
        continue;
      }
      setStatuses((prev: any)=>({...prev,[group.vendorName]:{state:"sending"}}));
      try{
        let rfqNum=makeRfqNum(group.vendorName);
        const uploadToken=vendorTokens[group.vendorName];
        const uploadUrl=uploadToken?`https://matrix-arc.web.app?rfqUpload=${uploadToken}`:null;
        const subject=`Request for Quote — ${projectName||"Project"} — ${rfqNum}`;
        const html=buildRfqEmailHtml(group,projectName,rfqNum,rfqDate,responseBy,uploadUrl,_appCtx.company);
        const pdfBase64=await buildRfqPdf(group,projectName,rfqNum,rfqDate,responseBy,_appCtx.company).catch(()=>null);
        const pdfName=`${rfqNum}-${(group.vendorName||"Supplier").replace(/[^a-z0-9]/gi,"_")}.pdf`;
        await sendGraphEmail(graphToken,to,subject,html,pdfBase64,pdfName);
        setStatuses((prev: any)=>({...prev,[group.vendorName]:{state:"sent"}}));
        group.items.forEach((item: any)=>sentItemIds.push(item.id));
        historyEntries.push({rfqNum,vendorName:group.vendorName,vendorEmail:to,items:group.items.map((i: any)=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:true,skipped:false});
      }catch(e: any){
        setStatuses((prev: any)=>({...prev,[group.vendorName]:{state:"error",msg:String(e.message||e)}}));
        historyEntries.push({rfqNum:makeRfqNum(group.vendorName),vendorName:group.vendorName,vendorEmail:to,items:group.items.map((i: any)=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:false,skipped:false,error:String(e.message||e)});
      }
    }
    // Save to Firestore history
    if(uid&&historyEntries.length>0){
      const sessionRfqNum=historyEntries.find((e: any)=>e.sent)?.rfqNum||`RFQ-${rfqBase}`;
      fbDb.collection(`users/${uid}/rfq_history`).add({rfqNum:sessionRfqNum,sentAt:Date.now(),projectId:projectId||"",projectName:projectName||"",sentFrom:fromEmail,entries:historyEntries}).catch((e: any)=>console.warn("RFQ history save failed:",e));
      // Save supplier part cross-reference for crossed items
      const allCrossings: any[]=[];
      historyEntries.filter((e: any)=>e.sent).forEach((entry: any)=>{
        const grp=groups.find((g: any)=>g.vendorName===entry.vendorName);
        if(!grp)return;
        grp.items.filter((i: any)=>i.crossedFrom).forEach((i: any)=>{
          allCrossings.push({origPartNumber:i.crossedFrom,bcPartNumber:i.partNumber,description:i.description||"",manufacturer:i.manufacturer||"",vendorName:grp.vendorName,rfqNum:entry.rfqNum||"",rfqDate:Date.now()});
        });
      });
      if(allCrossings.length>0){
        fbDb.doc(`users/${uid}/config/supplierCrossRef`).set({records:(firebase.firestore.FieldValue as any).arrayUnion(...allCrossings)},{merge:true}).catch((e: any)=>console.warn("CrossRef save failed:",e));
      }
    }
    setSending(false);setDone(true);
    if(sentItemIds.length>0&&onSent)onSent(sentItemIds);
    if(shouldPrint&&onPrint)onPrint(groups);
  }
  const stColors: any={sent:"#4ade80",error:"#f87171",skipped:"#64748b",sending:"#818cf8"};
  const stLabel=(st: any)=>st?.state==="sending"?"Sending…":st?.state==="sent"?"Sent":st?.state==="error"?`${st.msg||"Failed"}`:st?.state==="skipped"?"— Skipped":null;
  return ReactDOM.createPortal(
    <>
    {previewGroup&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:10001,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{width:"100%",maxWidth:1440,background:"#fff",borderRadius:10,overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.8)",display:"flex",flexDirection:"column",maxHeight:"calc(100vh - 80px)"}}>
          <div style={{background:"#1e1b4b",padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#a5b4fc",fontWeight:700,fontSize:13,flex:1}}>Preview: {previewGroup.vendorName} — {_makeRfqNum(previewGroup.vendorName)}</span>
            <button onClick={()=>setPreviewGroup(null)} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:18,lineHeight:1,padding:"2px 6px"}}>✕</button>
          </div>
          <iframe srcDoc={buildRfqEmailHtml(previewGroup,projectName,_makeRfqNum(previewGroup.vendorName),_rfqDate,_responseBy,null,_appCtx.company)} style={{flex:1,border:"none",minHeight:1000}} title="RFQ Preview"/>
        </div>
        <div style={{marginTop:12}}>
          <button onClick={()=>setPreviewGroup(null)} style={{background:"#1e1b4b",border:"1px solid #4f46e5",color:"#a5b4fc",padding:"7px 24px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:600}}>Close Preview</button>
        </div>
      </div>
    )}
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:"#0d0d1a",border:"1px solid #2a2a3e",borderRadius:10,padding:"24px 28px",minWidth:480,maxWidth:600,boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:8}}>Send RFQ Emails</div>
        <div style={{background:"#0a0a18",border:"1px solid #2a2a3e",borderRadius:6,padding:"7px 10px",marginBottom:14,fontSize:12,display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#64748b"}}>From:</span>
          <span style={{color:"#93c5fd",fontWeight:600}}>{fromEmail}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:12,color:"#64748b"}}>Uncheck any supplier to skip their email this send.</div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setIncluded((_prev: any)=>{const m: any={};groups.forEach((g: any)=>{m[g.vendorName]=true;});return m;})} disabled={sending||done} style={{background:"none",border:"1px solid #2a2a3e",color:"#94a3b8",borderRadius:4,padding:"2px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Check All</button>
            <button onClick={()=>setIncluded((_prev: any)=>{const m: any={};groups.forEach((g: any)=>{m[g.vendorName]=false;});return m;})} disabled={sending||done} style={{background:"none",border:"1px solid #2a2a3e",color:"#94a3b8",borderRadius:4,padding:"2px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Uncheck All</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18,maxHeight:360,overflowY:"auto"}}>
          {groups.map((g: any)=>{
            const st=statuses[g.vendorName];
            const isOn=!!included[g.vendorName];
            const lbl=stLabel(st);
            return(
              <div key={g.vendorName} style={{background:isOn?"#111128":"#090910",border:`1px solid ${isOn?"#2a2a3e":"#151520"}`,borderRadius:6,padding:"10px 12px",opacity:isOn?1:0.55,transition:"opacity 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:isOn?6:0}}>
                  <input type="checkbox" checked={isOn} disabled={sending||done} onChange={(e: any)=>setIncluded((prev: any)=>({...prev,[g.vendorName]:e.target.checked}))} style={{cursor:"pointer",accentColor:"#818cf8",width:14,height:14,flexShrink:0}}/>
                  <span style={{fontWeight:700,color:"#f1f5f9",fontSize:13,flex:1}}>{g.vendorName}</span>
                  <button onClick={()=>setPreviewGroup(g)} title="Preview email" style={{background:"#0d1520",border:"1px solid #0284c7",borderRadius:4,color:"#38bdf8",cursor:"pointer",fontSize:11,padding:"1px 6px",fontFamily:"inherit"}}>Preview</button>
                  <span style={{fontSize:11,color:lbl?stColors[st.state]:"#64748b"}}>{lbl||`${g.items.length} item${g.items.length!==1?"s":""}`}</span>
                </div>
                {isOn&&<input value={emails[g.vendorName]||""} onChange={(e: any)=>setEmails((prev: any)=>({...prev,[g.vendorName]:e.target.value}))}
                  placeholder="supplier@email.com" disabled={sending||done}
                  onKeyDown={(e: any)=>{if(e.key==='Enter')e.target.blur();}}
                  style={{width:"100%",boxSizing:"border-box",background:"#0a0a18",border:"1px solid #2a2a3e",borderRadius:4,padding:"5px 8px",color:"#f1f5f9",fontSize:12,fontFamily:"inherit",outline:"none"}}/>}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
          {done&&groups.filter((g: any)=>included[g.vendorName]).every((g: any)=>statuses[g.vendorName]?.state==="sent")&&<span style={{fontSize:12,color:"#4ade80",marginRight:"auto"}}>All RFQs sent!</span>}
          <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #2a2a3e",color:"#94a3b8",padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>{done?"Close":"Cancel"}</button>
          {!sending&&!done&&<button onClick={()=>{if(onPrint)onPrint(groups);onClose();}} style={{background:"#1a1a2a",border:"1px solid #4f46e5",color:"#a5b4fc",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>Print</button>}
          {!sending&&!done&&<button onClick={()=>sendAll(false)} disabled={groups.length===0} style={{background:"#0d1520",border:"1px solid #0284c7",color:"#38bdf8",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>Email</button>}
          {!sending&&!done&&<button onClick={()=>sendAll(true)} disabled={groups.length===0} style={{background:"#1e1b4b",border:"none",color:"#818cf8",padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>Print & Send</button>}
          {sending&&<span style={{fontSize:12,color:"#818cf8"}}>Sending…</span>}
        </div>
      </div>
    </div>
    </>
  ,document.body);
}

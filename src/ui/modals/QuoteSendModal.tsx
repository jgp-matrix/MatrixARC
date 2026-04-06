// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';
import { bcAttachPdfQueued, bcAttachPdfToJob } from '@/services/businessCentral/projects';
import { acquireGraphToken, sendGraphEmail } from '@/services/graphEmail';
import { buildQuotePdfDoc } from '@/core/arcDoc';
import { ensureJsPDF } from '@/core/helpers';

function QuoteSendModal({project,uid,modalData,setModalData,onUpdate,onClose}){
  const [sendMode,setSendMode]=useState("new");
  const [threadSearch,setThreadSearch]=useState(project.quote?.company||project.bcCustomerName||project.name||"");
  const [threadResults,setThreadResults]=useState([]);
  const [threadSearching,setThreadSearching]=useState(false);
  const [selectedThread,setSelectedThread]=useState(null);
  const [sending,setSending]=useState(false);
  const [previewEmail,setPreviewEmail]=useState(null); // {subject,from,date,bodyHtml} or null
  const [previewLoading,setPreviewLoading]=useState(false);

  const searchDebounceRef=useRef(null);

  async function searchThreads(q){
    if(!q||q.length<2){setThreadResults([]);return;}
    setThreadSearching(true);
    const token=await acquireGraphToken();
    if(token){const results=await graphSearchEmails(token,q,20);setThreadResults(results);}
    setThreadSearching(false);
  }

  // Debounced live search as user types (500ms delay)
  useEffect(()=>{
    if(sendMode!=="reply")return;
    if(searchDebounceRef.current)clearTimeout(searchDebounceRef.current);
    if(!threadSearch||threadSearch.length<2){setThreadResults([]);return;}
    searchDebounceRef.current=setTimeout(()=>searchThreads(threadSearch),500);
    return()=>{if(searchDebounceRef.current)clearTimeout(searchDebounceRef.current);};
  },[threadSearch,sendMode]);

  async function loadEmailPreview(msg){
    setPreviewLoading(true);setPreviewEmail({subject:msg.subject,from:msg.from,date:msg.date,bodyHtml:null});
    try{
      const token=await acquireGraphToken();
      if(!token){setPreviewLoading(false);return;}
      const r=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${msg.id}?$select=subject,body,from,receivedDateTime,toRecipients,ccRecipients`,{
        headers:{"Authorization":`Bearer ${token}`}
      });
      if(r.ok){
        const d=await r.json();
        setPreviewEmail({subject:d.subject||msg.subject,from:msg.from,fromEmail:msg.fromEmail,
          to:(d.toRecipients||[]).map(t=>t.emailAddress?.name||t.emailAddress?.address).join(", "),
          cc:(d.ccRecipients||[]).map(t=>t.emailAddress?.name||t.emailAddress?.address).join(", "),
          date:d.receivedDateTime||msg.date,bodyHtml:d.body?.content||""});
      }
    }catch(e){console.warn("Email preview fetch failed:",e);}
    setPreviewLoading(false);
  }

  // Auto-search handled by debounce effect above — no separate useEffect needed

  function fmtDate(iso){if(!iso)return"";try{return new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit",hour:"numeric",minute:"2-digit"});}catch(e){return"";}}

  async function handleSend(){
    const m=modalData;
    if(sendMode==="new"&&!m.to.trim()){alert("Enter a recipient email.");return;}
    if(sendMode==="reply"&&!selectedThread){alert("Select an email thread to reply to.");return;}
    setSending(true);
    try{
      const graphToken=await acquireGraphToken();
      if(!graphToken){alert("Could not get Microsoft 365 token.");setSending(false);return;}
      const sig=m.signature.split("\n").filter(Boolean).join("<br/>");
      const html=`<div style="font-family:-apple-system,sans-serif;font-size:14px;color:#1e293b;line-height:1.7">${m.message.split("\n").map(l=>l.trim()?`<p>${l}</p>`:"<br/>").join("")}<p style="margin-top:16px">Best regards,<br/>${sig}</p></div>`;
      const jsPDF=await ensureJsPDF();
      const pdfDoc=new jsPDF({unit:"mm",format:"letter"});
      await buildQuotePdfDoc(pdfDoc,project);
      const pdfBase64=pdfDoc.output("datauristring").split(",")[1];
      console.log("[SEND QUOTE] PDF generated, base64 length:",pdfBase64?.length||0,"mode:",sendMode);
      const q=project.quote||{};
      const rev=project.quoteRev||0;
      const company=(q.company||project.bcCustomerName||"Customer").replace(/[^a-zA-Z0-9&\s-]/g,"").trim();
      const projName=(project.name||"Project").replace(/[^a-zA-Z0-9&\s-]/g,"").trim();
      const pdfName=`QTE_C-[${q.number||"Quote"} Rev ${String(rev).padStart(2,"0")}] - ${company} - ${projName}.pdf`;
      if(sendMode==="reply"){
        await graphReplyToMessage(graphToken,selectedThread.id,html,pdfBase64,pdfName);
      }else{
        await sendGraphEmail(graphToken,m.to,m.subject,html,pdfBase64,pdfName);
      }
      // DECISION(v1.19.368): For reply mode, show who the reply went to (the original thread participants),
      // not just the original sender. For new email, show the To field. Always save to Firestore.
      const sentTo=sendMode==="reply"
        ?(selectedThread.to?selectedThread.from+", "+selectedThread.to:selectedThread.fromEmail||selectedThread.from)
        :m.to;
      const upd={...project,quoteSentAt:Date.now(),quoteSentRev:rev,quoteSentTo:sentTo};
      onUpdate(upd);saveProject(uid,upd).catch(()=>{});
      if(project.bcProjectNumber&&_bcToken){
        bcAttachPdfToJob(project.bcProjectNumber,pdfName,pdfDoc.output("arraybuffer"),null).catch(e=>console.warn("[QUOTE] BC upload on send failed:",e.message));
      }
      onClose();alert(sendMode==="reply"?"Quote sent as reply to: "+selectedThread.subject:"Quote sent to "+m.to);
    }catch(e){alert("Send failed: "+e.message);}
    setSending(false);
  }

  return ReactDOM.createPortal(<>
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:10,padding:"24px 28px",width:"95%",maxWidth:640,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:12}}>✉ Send Quote</div>
        <div style={{display:"flex",gap:0,marginBottom:14,borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
          <button onClick={()=>setSendMode("new")}
            style={{flex:1,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",border:"none",
              background:sendMode==="new"?C.accentDim:"transparent",color:sendMode==="new"?C.accent:C.muted}}>
            ✉ New Email
          </button>
          <button onClick={()=>setSendMode("reply")}
            style={{flex:1,padding:"8px 12px",fontSize:12,fontWeight:700,cursor:"pointer",border:"none",borderLeft:`1px solid ${C.border}`,
              background:sendMode==="reply"?"#1a2a1a":"transparent",color:sendMode==="reply"?"#4ade80":C.muted}}>
            ↩ Reply to Thread
          </button>
        </div>
        <div style={{flex:1,overflow:"auto"}}>
        {sendMode==="new"?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div><label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>To</label>
            <input value={modalData.to} onChange={e=>setModalData(prev=>({...prev,to:e.target.value}))} style={{...inp({fontSize:13})}}/></div>
            <div><label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>Subject</label>
            <input value={modalData.subject} onChange={e=>setModalData(prev=>({...prev,subject:e.target.value}))} style={{...inp({fontSize:13})}}/></div>
          </div>
        ):(
          <div>
            <div style={{position:"relative",marginBottom:10}}>
              <input value={threadSearch} onChange={e=>setThreadSearch(e.target.value)}
                placeholder="Search emails by customer, project, subject…" autoFocus
                style={{...inp({fontSize:13}),width:"100%",boxSizing:"border-box",paddingRight:threadSearching?30:12}}/>
              {threadSearching&&<div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",fontSize:11,color:C.accent}}>⏳</div>}
            </div>
            <div style={{maxHeight:240,overflow:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
              {threadResults.length===0&&!threadSearching&&(
                <div style={{padding:20,textAlign:"center",color:C.muted,fontSize:12}}>
                  {threadSearch?"No results — try a different search":"Search for recent emails with this customer"}
                </div>
              )}
              {threadSearching&&<div style={{padding:20,textAlign:"center",color:C.accent,fontSize:12}}>Searching Outlook…</div>}
              {threadResults.map((t,i)=>(
                <div key={t.id} onClick={()=>setSelectedThread(t)}
                  style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}33`,cursor:"pointer",
                    background:selectedThread?.id===t.id?"#0c2a1a":i%2===0?"transparent":"rgba(255,255,255,0.015)"}}
                  onMouseEnter={e=>{if(selectedThread?.id!==t.id)e.currentTarget.style.background=C.accentDim+"44";}}
                  onMouseLeave={e=>{if(selectedThread?.id!==t.id)e.currentTarget.style.background=i%2===0?"transparent":"rgba(255,255,255,0.015)";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:selectedThread?.id===t.id?700:600,color:selectedThread?.id===t.id?"#4ade80":C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</div>
                      <div style={{fontSize:11,color:C.muted,marginTop:2}}>{t.from}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                      <button title="Preview full email" onClick={e=>{e.stopPropagation();loadEmailPreview(t);}}
                        style={{background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 6px",fontSize:10,color:C.muted,cursor:"pointer"}}
                        onMouseEnter={e=>{e.target.style.borderColor=C.accent;e.target.style.color=C.accent;}}
                        onMouseLeave={e=>{e.target.style.borderColor=C.border;e.target.style.color=C.muted;}}>👁</button>
                      <div style={{fontSize:10,color:C.muted,whiteSpace:"nowrap"}}>{fmtDate(t.date)}</div>
                    </div>
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",opacity:0.7}}>{t.preview}</div>
                  {selectedThread?.id===t.id&&<div style={{fontSize:10,color:"#4ade80",fontWeight:700,marginTop:4}}>✓ Selected — will reply to this thread</div>}
                </div>
              ))}
            </div>
            {selectedThread&&(
              <div style={{marginTop:8,background:"#0c2a1a",border:"1px solid #4ade8044",borderRadius:6,padding:"8px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#4ade80",textTransform:"uppercase",letterSpacing:0.5}}>↩ Reply All</div>
                  <div style={{fontSize:9,color:"#4ade80",opacity:0.7}}>— all original recipients will be included</div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:C.text}}>{selectedThread.subject}</div>
                <div style={{fontSize:11,color:C.muted}}>From: {selectedThread.from} · {fmtDate(selectedThread.date)}</div>
                {selectedThread.to&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>To: {selectedThread.to}</div>}
              </div>
            )}
          </div>
        )}
        <div style={{marginTop:10}}>
          <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>Message</label>
          <textarea value={modalData.message} onChange={e=>setModalData(prev=>({...prev,message:e.target.value}))} rows={4} style={{...inp({fontSize:13,resize:"vertical",lineHeight:1.6})}}/>
        </div>
        <div style={{background:"#0a0a18",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",fontSize:11,color:C.muted,lineHeight:1.5,whiteSpace:"pre-line",marginTop:6}}>{modalData.signature}</div>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14,flexShrink:0}}>
          <button onClick={onClose} style={btn("#1a1a2a",C.muted,{fontSize:13,border:`1px solid ${C.border}`})}>Cancel</button>
          <button onClick={handleSend} disabled={sending}
            style={btn(sendMode==="reply"?"#0d2a1a":"#0c2233",sendMode==="reply"?"#4ade80":"#38bdf8",{fontSize:13,fontWeight:700,border:`1px solid ${sendMode==="reply"?"#4ade80":"#38bdf8"}`,opacity:sending?0.5:1})}>
            {sending?"Sending…":sendMode==="reply"?"↩ Reply All with Quote":"✉ Send"}
          </button>
        </div>
      </div>
    </div>
    {/* Email Preview Overlay */}
    {previewEmail&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}
        onClick={()=>setPreviewEmail(null)}>
        <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:10,width:"95%",maxWidth:800,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 0 60px 15px rgba(56,189,248,0.5)"}}
          onClick={e=>e.stopPropagation()}>
          {/* Preview Header */}
          <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>{previewEmail.subject}</div>
                <div style={{fontSize:12,color:C.sub}}>From: <span style={{fontWeight:600}}>{previewEmail.from}</span>{previewEmail.fromEmail?` <${previewEmail.fromEmail}>`:""}</div>
                {previewEmail.to&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>To: {previewEmail.to}</div>}
                {previewEmail.cc&&<div style={{fontSize:11,color:C.muted}}>Cc: {previewEmail.cc}</div>}
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>{fmtDate(previewEmail.date)}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>{const t=threadResults.find(r=>r.subject===previewEmail.subject);if(t)setSelectedThread(t);setPreviewEmail(null);}}
                  style={btn("#0d2a1a","#4ade80",{fontSize:11,fontWeight:700,border:"1px solid #4ade8066",padding:"5px 12px"})}>
                  ↩ Select & Reply
                </button>
                <button onClick={()=>setPreviewEmail(null)}
                  style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",color:C.muted,fontSize:14,cursor:"pointer"}}>✕</button>
              </div>
            </div>
          </div>
          {/* Preview Body */}
          <div style={{flex:1,overflow:"auto",padding:"16px 20px"}}>
            {previewLoading?(
              <div style={{textAlign:"center",color:C.accent,padding:40,fontSize:13}}>Loading email…</div>
            ):previewEmail.bodyHtml?(
              <div style={{background:"#fff",borderRadius:6,padding:16,fontSize:13,lineHeight:1.6,color:"#1e293b",maxWidth:"100%",overflow:"auto"}}
                dangerouslySetInnerHTML={{__html:previewEmail.bodyHtml}}/>
            ):(
              <div style={{textAlign:"center",color:C.muted,padding:40,fontSize:12}}>Could not load email body</div>
            )}
          </div>
        </div>
      </div>
    )}
  </>,document.body);
}


export default QuoteSendModal;

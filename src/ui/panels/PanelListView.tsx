/* eslint-disable */
// @ts-nocheck
// PanelListView.tsx — Verbatim extraction from monolith index.html v1.19.376 lines 14630-15541.
// Includes QuoteSendModal (inline helper) and PanelListView.
// DO NOT EDIT — re-extract from monolith if changes are needed.

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import {
  fbAuth, _apiKey, _bcToken, _bcConfig, _appCtx,
  saveProject, saveProjectPanel, bcPatchJobOData, useBgTasks,
  bgDone, isAdmin,
} from '@/core/globals';
import { getPageTypes, appendDefaultBomItems, normPart } from '@/core/helpers';
import { computeLaborEstimate } from '@/bom/laborEstimator';
import { runPanelValidation } from '@/bom/validator';
import { bcCheckAttachmentExists, bcUpdateProject } from '@/services/businessCentral/projects';
import { getCompanyId as bcGetCompanyId } from '@/services/businessCentral/client';
import { bcFetchCustomerContacts, bcCreateContact } from '@/services/businessCentral/vendors';
import { acquireGraphToken, sendGraphEmail, tryGraphTokenSilent } from '@/services/graphEmail';

import PanelCard from '@/ui/panels/PanelCard';
import Badge from '@/ui/shared/Badge';
import ConfidenceBar from '@/ui/shared/ConfidenceBar';
import ContingencyInput from '@/ui/shared/ContingencyInput';
import CADLinkSendModal from '@/ui/modals/CADLinkSendModal';
import EngineeringQuestionsModal from '@/ui/modals/EngineeringQuestionsModal';
import useCustomerLogo from '@/ui/hooks/useCustomerLogo';

// ─── Monolith functions not yet extracted into services ──────────────────────
declare function isReadOnly(): boolean;
declare var _bgTasks: Record<string, any>;
declare function _bgNotify(): void;

// BC API base — referenced directly in fetch calls within PanelListView
declare var BC_API_BASE: string;
declare var BC_TENANT: string;

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

function PanelListView({project,uid,readOnly,onBack,onViewQuote,onPrintRfq,onSendRfqEmails,onShowRfqHistory,rfqLoading,onUpdate,onDelete,onTransfer,onCopy,onOpenSupplierQuote,pendingRfqUploads,onPoReceived,relinking,relinkMsg,onRelink,bcUploadRef}){
  const [editingName,setEditingName]=useState(false);
  const [draftName,setDraftName]=useState(project.name||"");
  const [bcSyncMsg,setBcSyncMsg]=useState(null);
  const [validating,setValidating]=useState(false);
  const [validateMsg,setValidateMsg]=useState("");
  const [showDeleteAdminWarn,setShowDeleteAdminWarn]=useState(false);
  const [quoteSendModalPLV,setQuoteSendModalPLV]=useState(null);
  const customerLogo=useCustomerLogo(project.bcCustomerName||null);
  const isBcDisconnected=!!(project.bcEnv&&project.bcEnv!==_bcConfig.env);
  const bgTasks=useBgTasks();
  const activeBgTasks=Object.values(bgTasks).filter(t=>t.projectId===project.id&&t.status==="running");
  const [selectedPanelId,setSelectedPanelId]=useState(()=>(project.panels||[])[0]?.id||null);
  const [eqModalPanelId,setEqModalPanelId]=useState(null);
  const [fbLaborMoreInfo,setFbLaborMoreInfo]=useState(false);
  const [showCADLinkModal,setShowCADLinkModal]=useState(false);
  // Contact person dropdown state
  const [contactPersons,setContactPersons]=useState([]);
  const [showNewContact,setShowNewContact]=useState(false);
  const [newContactName,setNewContactName]=useState("");
  const [newContactEmail,setNewContactEmail]=useState("");
  const [newContactPhone,setNewContactPhone]=useState("");
  const [creatingContact,setCreatingContact]=useState(false);
  const [newContactErr,setNewContactErr]=useState("");
  // Fetch contacts when project has a customer number
  useEffect(()=>{
    if(!project.bcCustomerNumber||!_bcToken)return;
    bcFetchCustomerContacts(project.bcCustomerNumber).then(c=>{if(c.length)setContactPersons(c);});
  },[project.bcCustomerNumber]);
  // DECISION(v1.19.351): Sync BC customer name on project open — if the company was renamed in BC,
  // the project header and quote should reflect the current name, not the stale one from creation.
  useEffect(()=>{
    if(!project.bcCustomerNumber||!_bcToken||isBcDisconnected)return;
    (async()=>{
      try{
        const compId=await bcGetCompanyId();
        if(!compId)return;
        const r=await fetch(`${BC_API_BASE}/companies(${compId})/customers?$filter=number eq '${project.bcCustomerNumber}'&$select=number,displayName&$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok)return;
        const cust=((await r.json()).value||[])[0];
        if(cust&&cust.displayName&&cust.displayName!==project.bcCustomerName){
          console.log("BC_SYNC: Customer name changed:",project.bcCustomerName,"→",cust.displayName);
          const upd={...project,bcCustomerName:cust.displayName,quote:{...(project.quote||{}),company:cust.displayName}};
          onUpdate(upd);saveProject(uid,upd).catch(()=>{});
        }
      }catch(e){}
    })();
  },[project.id]);
  const [fbcConnecting,setFbcConnecting]=useState(false);
  const [fbcError,setFbcError]=useState("");
  useEffect(()=>{
    const ids=(project.panels||[]).map(p=>p.id);
    if(!selectedPanelId||!ids.includes(selectedPanelId))setSelectedPanelId(ids[0]||null);
  },[project.panels]);

  // DECISION(v1.19.319): One-time scrub on project open — clears false crosses where crossedFrom===partNumber.
  // A bug in applyPortalPrices was marking items as crossed to themselves (e.g. "2903148 → 2903148").
  // This polluted the Crossed/Superseded notes on quotes. The scrub runs once per project open,
  // cleans the data, and saves. Combined with the normPart guard in saveAlternateEntry, prevents recurrence.
  useEffect(()=>{
    let dirty=false;
    const cleaned=(project.panels||[]).map(panel=>{
      const bom=(panel.bom||[]).map(r=>{
        if(r.isCrossed&&r.crossedFrom&&normPart(r.crossedFrom)===normPart(r.partNumber)){
          dirty=true;
          const u={...r};delete u.isCrossed;delete u.crossedFrom;delete u.autoReplaced;return u;
        }
        return r;
      });
      return bom!==panel.bom?{...panel,bom}:panel;
    });
    if(dirty){
      console.log("SCRUB: clearing dupe crosses from",project.name);
      const updated={...project,panels:cleaned};
      onUpdate(updated);
      saveProject(uid,updated).catch(()=>{});
    }
  },[project.id]);

  function addPanel(){
    const n=(project.panels||[]).length+1;
    const newPanel={id:'panel-'+Date.now(),name:`Panel ${n}`,pages:[],bom:[],validation:null,pricing:null,budgetaryQuote:null,status:'draft'};
    onUpdate({...project,panels:[...(project.panels||[]),newPanel]});
  }
  function deletePanel(id){
    if(!window.confirm("Delete this panel and all its data?"))return;
    // Cancel any background task for this panel
    if(_bgTasks[id]){bgDone(id,"Cancelled — panel deleted");delete _bgTasks[id];_bgNotify();}
    // Mark panel as deleted so saveProjectPanel won't re-add it
    if(!window._deletedPanelIds)window._deletedPanelIds=new Set();
    window._deletedPanelIds.add(id);
    onUpdate({...project,panels:(project.panels||[]).filter(p=>p.id!==id)});
  }
  async function saveImmediatePanel(panelId,updatedPanel){
    // Skip notify — local state is already correct from onUpdate, don't overwrite with Firestore read
    await saveProjectPanel(uid,project.id,panelId,updatedPanel,true);
  }
  function saveSelectedPricing(patch){
    const sp=(project.panels||[]).find(p=>p.id===selectedPanelId);
    if(!sp)return;
    const updated={...sp,pricing:{...(sp.pricing||{}),...patch}};
    const updatedPanels=(project.panels||[]).map(p=>p.id===sp.id?updated:p);
    onUpdate({...project,panels:updatedPanels});
    saveImmediatePanel(sp.id,updated);
  }
  function saveSelectedLaborOverride(field,value){
    const sp=(project.panels||[]).find(p=>p.id===selectedPanelId);
    if(!sp)return;
    const ld=sp.laborData||{};
    const updated={...sp,laborData:{...ld,overrides:{...(ld.overrides||{}),[field]:value}}};
    const updatedPanels=(project.panels||[]).map(p=>p.id===sp.id?updated:p);
    onUpdate({...project,panels:updatedPanels});
    saveImmediatePanel(sp.id,updated);
  }
  function saveSelectedLaborAccepted(category,accepted){
    const sp=(project.panels||[]).find(p=>p.id===selectedPanelId);
    if(!sp)return;
    const ld=sp.laborData||{};
    const updated={...sp,laborData:{...ld,accepted:{...(ld.accepted||{}),[category]:accepted}}};
    const updatedPanels=(project.panels||[]).map(p=>p.id===sp.id?updated:p);
    onUpdate({...project,panels:updatedPanels});
    saveImmediatePanel(sp.id,updated);
  }
  function selectedOnUpdate(updatedPanel){
    const newPanels=(project.panels||[]).map(p=>p.id===updatedPanel.id?updatedPanel:p);
    onUpdate({...project,panels:newPanels});
  }
  function selectedOnSaveImmediate(updatedPanel){
    saveImmediatePanel(updatedPanel.id,updatedPanel);
  }
  async function saveName(){
    if(!draftName.trim())return;
    const updated={...project,name:draftName.trim()};
    onUpdate(updated);
    await saveProject(uid,updated);
    setEditingName(false);
    if(project.bcProjectId){
      setBcSyncMsg({ok:null,text:"Syncing to BC…"});
      const ok=await bcUpdateProject(project.bcProjectId,draftName.trim());
      setBcSyncMsg({ok,text:ok?"✓ Name synced to Business Central":"⚠ BC sync failed — check connection"});
      setTimeout(()=>setBcSyncMsg(null),4000);
    }
  }
  async function validateAll(){
    if(!_apiKey)return;
    setValidating(true);
    let panels=[...(project.panels||[])];
    for(let i=0;i<panels.length;i++){
      const p=panels[i];
      const hasSchOrLayout=(p.pages||[]).some(pg=>(getPageTypes(pg).includes("schematic")||getPageTypes(pg).includes("layout")||getPageTypes(pg).includes("backpanel")||getPageTypes(pg).includes("enclosure"))&&(pg.dataUrl||pg.storageUrl));
      if(!hasSchOrLayout)continue;
      setValidateMsg(`Validating ${p.name||"Panel "+(i+1)}…`);
      const result=await runPanelValidation(p);
      if(result.validation||result.laborData){const bom=appendDefaultBomItems(p.bom||[]);panels[i]={...p,bom,...(result.validation?{validation:result.validation}:{}),...(result.laborData?{laborData:result.laborData}:{}),status:"validated"};}
    }
    const updatedProject={...project,panels};
    onUpdate(updatedProject);
    await saveProject(uid,updatedProject);
    setValidating(false);
    setValidateMsg("");
  }
  const panels=project.panels||[];
  return(<>
    <div style={{height:"calc(100vh - 130px)",display:"flex",background:C.bg,overflow:"hidden"}}>
        <div style={{flex:1,overflowY:"auto",padding:24,minWidth:0}}>
        {readOnly&&<div style={{marginBottom:12}}><span style={{background:C.border,color:C.muted,borderRadius:20,padding:"2px 10px",fontSize:13,fontWeight:700}}>VIEW ONLY</span></div>}
        <div style={{maxWidth:1400,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24,flexWrap:"wrap",gap:12}}>
            <div>
              {editingName?(
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <input value={draftName} onChange={e=>setDraftName(e.target.value)} autoFocus
                    style={{...inp(),fontSize:18,fontWeight:700,padding:"4px 10px",minWidth:240}}
                    onKeyDown={e=>{if(e.key==="Enter")saveName();if(e.key==="Escape")setEditingName(false);}}/>
                  <button onClick={saveName} style={btn(C.accent,"#fff",{fontSize:13,padding:"4px 12px"})}>✓</button>
                  <button onClick={()=>setEditingName(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13}}>Cancel</button>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
                  {customerLogo&&<img src={customerLogo} alt="" style={{width:36,height:36,objectFit:"contain",borderRadius:6,background:"#fff",padding:2,flexShrink:0}} onError={e=>e.target.style.display="none"}/>}
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    {(project.bcProjectNumber||project.bcCustomerName)&&(
                      <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                        {project.bcProjectNumber&&<span style={{fontSize:26,fontWeight:800,color:project.bcEnv&&project.bcEnv!==_bcConfig.env?"#64748b":C.accent,lineHeight:1}}>{project.bcProjectNumber}</span>}
                        {isBcDisconnected&&<span style={{fontSize:11,fontWeight:700,color:C.yellow,background:"rgba(234,179,8,0.1)",border:"1px solid rgba(234,179,8,0.3)",borderRadius:12,padding:"2px 10px",whiteSpace:"nowrap"}} title={"Linked to "+project.bcEnv}>⚠ BC Disconnected</span>}
                        {isBcDisconnected&&!readOnly&&onRelink&&<button onClick={e=>{e.stopPropagation();onRelink();}} disabled={relinking} style={{fontSize:11,fontWeight:700,color:"#38bdf8",background:"rgba(56,189,248,0.08)",border:"1px solid rgba(56,189,248,0.3)",borderRadius:12,padding:"2px 10px",cursor:relinking?"wait":"pointer",whiteSpace:"nowrap",opacity:relinking?0.6:1}}>{relinking?"Re-linking…":"🔗 Re-link to BC"}</button>}
                        {project.bcCustomerName&&!readOnly?(
                          <span style={{fontSize:18,fontWeight:700,color:C.text,cursor:"text",borderBottom:"1px dashed transparent"}}
                            contentEditable suppressContentEditableWarning
                            onFocus={e=>{e.target.style.borderBottomColor=C.accent;e.target.style.outline="none";}}
                            onBlur={e=>{
                              e.target.style.borderBottomColor="transparent";
                              const val=(e.target.textContent||"").trim();
                              if(val&&val!==project.bcCustomerName){
                                const upd={...project,bcCustomerName:val,quote:{...(project.quote||{}),company:val}};
                                onUpdate(upd);saveProject(uid,upd).catch(()=>{});
                                // Update BC project card customer name if connected
                                if(project.bcProjectNumber&&_bcToken)bcPatchJobOData(project.bcProjectNumber,{Bill_to_Name:val}).catch(()=>{});
                              }
                            }}
                            onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.target.blur();}if(e.key==="Escape"){e.target.textContent=project.bcCustomerName;e.target.blur();}}}
                            title="Click to edit customer name"
                          >{project.bcCustomerName}</span>
                        ):project.bcCustomerName?<span style={{fontSize:18,fontWeight:700,color:C.text}}>{project.bcCustomerName}</span>:null}
                      </div>
                    )}
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:20,fontWeight:700,color:C.text}}>{project.name}</span>
                      {!readOnly&&<button onClick={()=>{setDraftName(project.name);setEditingName(true);}} title="Edit project name" style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>✏️</button>}
                      {project.importedFromBC&&<Badge status="imported"/>}
                    </div>
                    <span style={{fontSize:13,color:C.muted}}>Created: {project.createdAt?new Date(project.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):project.updatedAt?new Date(project.updatedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}</span>
                    <span style={{fontSize:11,color:C.muted}}>{(project.panels||[]).length} panel{(project.panels||[]).length!==1?"s":""}</span>
                  </div>
                </div>
              )}
              {/* Contact Person dropdown — DECISION(v1.19.347) */}
              {project.bcCustomerNumber&&!isBcDisconnected&&(
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Contact:</span>
                  {readOnly?(
                    <span style={{fontSize:11,color:C.sub}}>{project.bcContactName||project.quote?.contact||"—"}</span>
                  ):showNewContact?(
                    <div style={{display:"inline-flex",gap:4,alignItems:"center",flexWrap:"wrap"}}>
                      <input value={newContactName} onChange={e=>setNewContactName(e.target.value)} placeholder="Name *" style={{background:"#0d1526",border:"1px solid "+C.accent,borderRadius:4,color:C.text,fontSize:11,padding:"2px 6px",width:110}}/>
                      <input value={newContactEmail} onChange={e=>setNewContactEmail(e.target.value)} placeholder="Email" style={{background:"#0d1526",border:"1px solid "+C.border,borderRadius:4,color:C.text,fontSize:11,padding:"2px 6px",width:130}}/>
                      <input value={newContactPhone} onChange={e=>setNewContactPhone(e.target.value)} placeholder="Phone" style={{background:"#0d1526",border:"1px solid "+C.border,borderRadius:4,color:C.text,fontSize:11,padding:"2px 6px",width:100}}/>
                      {newContactErr&&<span style={{fontSize:10,color:C.red}}>{newContactErr}</span>}
                      <button onClick={async()=>{
                        if(!newContactName.trim())return;setCreatingContact(true);setNewContactErr("");
                        try{
                          const c=await bcCreateContact(newContactName.trim(),project.bcCustomerNumber,newContactEmail.trim(),newContactPhone.trim());
                          const fresh=await bcFetchCustomerContacts(project.bcCustomerNumber);setContactPersons(fresh);
                          // Auto-select the new contact
                          const upd={...project,bcContactNo:c.number,bcContactName:c.displayName,bcContactEmail:c.email,bcContactPhone:c.phone,
                            quote:{...(project.quote||{}),contact:c.displayName,email:c.email||project.quote?.email,phone:c.phone||project.quote?.phone}};
                          onUpdate(upd);saveProject(uid,upd).catch(()=>{});
                          if(project.bcProjectNumber&&_bcToken)bcPatchJobOData(project.bcProjectNumber,{Sell_to_Contact_No:c.number}).catch(()=>{});
                          setShowNewContact(false);setNewContactName("");setNewContactEmail("");setNewContactPhone("");
                        }catch(e){setNewContactErr(e.message||"Failed");}
                        setCreatingContact(false);
                      }} disabled={creatingContact||!newContactName.trim()}
                        style={{background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",opacity:creatingContact||!newContactName.trim()?0.5:1}}>
                        {creatingContact?"…":"Create"}
                      </button>
                      <button onClick={()=>{setShowNewContact(false);setNewContactErr("");}} style={{background:"none",border:"1px solid "+C.border,borderRadius:4,padding:"1px 6px",fontSize:10,color:C.muted,cursor:"pointer"}}>✕</button>
                    </div>
                  ):(
                    <div style={{display:"inline-flex",alignItems:"center",gap:4}}>
                      <select value={project.bcContactNo||""}
                        onFocus={()=>{if(project.bcCustomerNumber&&_bcToken)bcFetchCustomerContacts(project.bcCustomerNumber).then(c=>{if(c.length)setContactPersons(c);});}}
                        onChange={e=>{
                        const no=e.target.value;
                        if(no==="__NEW__"){setShowNewContact(true);setNewContactName("");setNewContactEmail("");setNewContactPhone("");setNewContactErr("");return;}
                        const c=contactPersons.find(p=>p.number===no);
                        const upd={...project,bcContactNo:no,bcContactName:c?c.displayName:"",bcContactEmail:c?c.email:"",bcContactPhone:c?c.phone:"",
                          quote:{...(project.quote||{}),contact:c?c.displayName:"",email:c?.email||project.quote?.email,phone:c?.phone||project.quote?.phone}};
                        onUpdate(upd);saveProject(uid,upd).catch(()=>{});
                        if(project.bcProjectNumber&&_bcToken&&no)bcPatchJobOData(project.bcProjectNumber,{Sell_to_Contact_No:no}).catch(()=>{});
                      }} style={{background:"#0d1526",border:"1px solid "+C.border,borderRadius:4,color:C.text,fontSize:11,padding:"2px 6px",cursor:"pointer",minWidth:220,maxWidth:360}}>
                        <option value="">— Select Person —</option>
                        <option value="__NEW__" style={{color:"#38bdf8",fontWeight:700}}>+ New Contact…</option>
                        {contactPersons.map(c=><option key={c.number} value={c.number}>{c.displayName}{c.email?" ("+c.email+")":""}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
              <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap",marginTop:4}}>
                {["Sales","PM","Designer"].map(function(label,li){
                  var keys=[["bcSalesperson","bcSalespersonCode","CCS_Salesperson_Code"],["bcProjectManager","bcProjectManagerCode","Person_Responsible"],["bcDesigner","bcDesignerCode",null]][li];
                  var nm=project[keys[0]]||"";
                  var codeKey=keys[1];var bcField=keys[2];
                  if(readOnly)return React.createElement("div",{key:label,style:{display:"flex",alignItems:"center",gap:4,fontSize:11}},React.createElement("span",{style:{color:C.muted,fontWeight:600}},label+":"),React.createElement("span",{style:{color:C.sub}},nm||"—"));
                  var opts=[React.createElement("option",{key:"_",value:""},"—")];
                  (window._arcSalespersonCache||[]).forEach(function(s){opts.push(React.createElement("option",{key:s.Code,value:s.Code},s.Name));});
                  return React.createElement("div",{key:label,style:{display:"flex",alignItems:"center",gap:4,fontSize:11}},
                    React.createElement("span",{style:{color:C.muted,fontWeight:600}},label+":"),
                    React.createElement("select",{value:project[codeKey]||"",onChange:function(e){
                      var code=e.target.value;var cache=window._arcSalespersonCache||[];
                      var cached=cache.find(function(s){return s.Code===code;});
                      // DECISION(v1.19.367): Must saveProject after updating Sales/PM/Designer so changes persist.
                      // Previously only called onUpdate (React state) — changes were lost on navigation.
                      var upd=Object.assign({},project);upd[codeKey]=code;upd[keys[0]]=cached?cached.Name:code;onUpdate(upd);saveProject(uid,upd).catch(function(){});
                      if(bcField&&project.bcProjectNumber&&_bcToken){var patch={};patch[bcField]=code;bcPatchJobOData(project.bcProjectNumber,patch).catch(function(){});}
                    },style:{background:"#0d1526",border:"1px solid "+C.border,borderRadius:4,color:C.text,fontSize:11,padding:"2px 6px",cursor:"pointer",maxWidth:150}},opts)
                  );
                })}
              </div>
              {bcSyncMsg&&<div style={{fontSize:12,color:bcSyncMsg.ok===null?C.muted:bcSyncMsg.ok?C.green:C.yellow,marginBottom:2}}>{bcSyncMsg.text}</div>}
              {relinkMsg&&<div style={{fontSize:12,color:relinkMsg.startsWith("✓")?C.green:relinkMsg.startsWith("Failed")?C.red:C.muted,marginBottom:2}}>{relinkMsg}</div>}
              <div style={{fontSize:13,color:C.muted}}>{panels.length} panel{panels.length!==1?"s":""}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <button onClick={!readOnly?addPanel:undefined} disabled={readOnly} style={btn(C.accent,"#fff",{fontSize:13,opacity:readOnly?0.4:1})}>+ Add Panel</button>
              {panels.some(p=>(p.bom||[]).some(r=>!r.isLaborRow))&&(
                <button onClick={()=>setShowCADLinkModal(true)} style={btn("#0d1a2a","#38bdf8",{fontSize:13,border:"1px solid #38bdf844"})}>📦 Send CADLink BOM's</button>
              )}
              {!readOnly&&onCopy&&(
                <button onClick={onCopy} style={btn(C.accentDim,C.accent,{border:`1px solid ${C.accent}`,fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>⧉ Copy</button>
              )}
              {!readOnly&&onTransfer&&(
                <button onClick={onTransfer} style={btn(C.accentDim,C.accent,{border:`1px solid ${C.accent}`,fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>⇄ Transfer</button>
              )}
              {!readOnly&&onDelete&&(
                <button onClick={()=>{if(isAdmin())onDelete();else setShowDeleteAdminWarn(true);}} style={btn(C.redDim,C.red,{border:`1px solid ${C.red}44`,fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>🗑 Delete</button>
              )}
            </div>
          </div>
          {/* Active background tasks banner */}
          {activeBgTasks.length>0&&(
            <div style={{background:C.accentDim,border:"1px solid "+C.accent+"66",borderRadius:8,padding:"10px 14px",marginBottom:12,animation:"pulseYellow 2s ease-in-out infinite"}}>
              {activeBgTasks.map(t=>(
                <div key={t.taskId} style={{display:"flex",alignItems:"center",gap:10,marginBottom:activeBgTasks.length>1?6:0}}>
                  <div className="spin" style={{fontSize:14,color:C.accent}}>◌</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:C.accent}}>{t.panelName||"Panel"}: {t.msg||"Processing…"}</div>
                    <div style={{width:"100%",height:4,background:C.border,borderRadius:4,overflow:"hidden",marginTop:4}}>
                      <div style={{height:"100%",width:(t.pct||0)+"%",background:"linear-gradient(90deg,"+C.accent+",#818cf8)",borderRadius:4,transition:"width 0.4s"}}/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {panels.length===0?(
            <div style={{textAlign:"center",padding:"60px 20px",color:C.muted}}>
              <div style={{fontSize:52,marginBottom:16,opacity:0.3}}>🗂️</div>
              <div style={{fontSize:18,fontWeight:700,color:C.sub,marginBottom:8}}>No panels yet</div>
              <div style={{fontSize:13,marginBottom:24,lineHeight:1.7}}>Add a panel to start uploading drawings and quoting this job.</div>
              {!readOnly&&<button onClick={addPanel} style={btn(C.accent,"#fff")}>+ Add First Panel</button>}
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              {panels.map((panel,idx)=>(
                <PanelCard
                  key={panel.id}
                  panel={panel}
                  idx={idx}
                  uid={uid}
                  projectId={project.id}
                  projectName={project.name||''}
                  bcProjectNumber={project.bcProjectNumber||null}
                  bcDisconnected={!!(project.bcEnv&&project.bcEnv!==_bcConfig.env)}
                  quoteData={project.quote||{}}
                  quoteRev={project.quoteRev||0}
                  readOnly={readOnly}
                  isSelected={panel.id===selectedPanelId}
                  onSelect={()=>setSelectedPanelId(panel.id)}
                  onDelete={()=>deletePanel(panel.id)}
                  onUpdate={updatedPanel=>{
                    const newPanels=panels.map(p=>p.id===panel.id?updatedPanel:p);
                    onUpdate({...project,panels:newPanels});
                  }}
                  onSaveImmediate={updatedPanel=>saveImmediatePanel(panel.id,updatedPanel)}
                  onViewQuote={onViewQuote}
                  onPrintRfq={onPrintRfq}
                  onSendRfqEmails={onSendRfqEmails}
                  rfqLoading={rfqLoading}
                  onOpenSupplierQuote={onOpenSupplierQuote}
                  bcUploadRef={bcUploadRef}
                />
              ))}
            </div>
          )}
        </div>
        </div>
        <div style={{width:380,flexShrink:0,display:"flex",flexDirection:"column",borderLeft:`1px solid ${C.border}`,background:"#080810",overflow:"hidden"}}>
          {(()=>{
            const sp=(project.panels||[]).find(p=>p.id===selectedPanelId)||(project.panels||[])[0]||null;
            if(!sp)return <div style={{color:C.muted,fontSize:13,textAlign:"center",marginTop:40}}>No panels</div>;
            const pr=sp.pricing||{};
            const markup=pr.markup??30;
            const laborRate=pr.laborRate??45;
            const laborEst=computeLaborEstimate(sp);
            const hasAutoLabor=laborEst.totalHours>0;
            const laborCost=hasAutoLabor?laborEst.totalCost:(pr.manualLaborCost||0);
            const bom=sp.bom||[];
            const pricedCount=bom.filter(r=>r.unitPrice!=null).length;
            const matCost=bom.reduce((s,r)=>s+(r.unitPrice||0)*(r.qty||1),0);
            const grandTotal=matCost+laborCost;
            const sellPrice=grandTotal*(1+markup/100);
            const fmt=n=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
            const pendingBcCount=bom.filter(r=>(r.partNumber||"").trim()&&r.priceSource!=="bc"&&r.priceSource!=="manual").length;
            const laborAccepted=sp.laborData?.accepted||{};
            const acceptedCount=laborEst.lines.filter(l=>laborAccepted[l.category]).length;
            const GDEF=[
              {label:"CUT",color:"#f97316",cats:["Panel Holes","Side Devices","HVAC/Fans"]},
              {label:"LAYOUT",color:"#a78bfa",cats:["Device Mounting","Duct & DIN Rail","Labels"]},
              {label:"WIRE",color:"#38bdf8",cats:["Wire Time","Door Wiring"]},
            ];
            return(<>
              <div style={{flex:1,overflowY:"auto",minHeight:0,padding:16,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{fontSize:17,fontWeight:800,color:C.text,letterSpacing:0.5,marginBottom:2}}>PANEL SUMMARY</div>
              {/* Selected panel name header */}
              <div style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:6}}>Line {(project.panels||[]).indexOf(sp)+1}</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                  <div style={{fontSize:14,fontWeight:800,color:C.accent,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{sp.drawingNo||sp.name||`Panel ${(project.panels||[]).indexOf(sp)+1}`}</div>
                  {sp.requestedShipDate&&<div style={{fontSize:12,color:C.green,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>Ship: {sp.requestedShipDate}</div>}
                </div>
                {sp.drawingRev&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:6,fontSize:12}}>
                  <span style={{color:C.muted}}><span style={{color:C.sub,fontWeight:600}}>Rev</span> {sp.drawingRev}</span>
                </div>}
                {sp.drawingDesc&&<div style={{fontSize:12,color:C.muted,marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sp.drawingDesc}</div>}
              </div>

              {/* Pricing Summary */}
              <div style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:12,color:C.muted,fontWeight:700,letterSpacing:0.7,marginBottom:10}}>PRICING SUMMARY</div>
                {[
                  ["Materials",fmt(matCost),"#fff",null,null],
                  hasAutoLabor?["Labor",fmt(laborCost),"#fff",null,null]:["Labor",null,"#fff",laborCost,"manualLaborCost"],
                  ["Total",fmt(grandTotal),"#fff",null,null],
                ].map(([label,val,color,numVal,key])=>(
                  <div key={label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,fontSize:13}}>
                    <span style={{color:label==="Total"?"#fff":C.muted}}>{label}</span>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",minWidth:110}}>
                      <span style={{color:"#fff",fontSize:12,marginRight:2,alignSelf:"center"}}>$</span>
                      {key?(
                        <ContingencyInput value={numVal} readOnly={readOnly} color={color} onSave={v=>saveSelectedPricing({[key]:v})}/>
                      ):(
                        <span style={{color,fontWeight:label==="Total"?700:400,fontVariantNumeric:"tabular-nums",width:80,textAlign:"right",display:"inline-block"}}>{val.slice(1)}</span>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{borderTop:"1px solid #fff",paddingTop:10,marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:C.sub,fontSize:13}}>Margin</span>
                    <input type="number" min="0" step="1" value={markup} readOnly={readOnly}
                      onChange={e=>saveSelectedPricing({markup:Math.max(0,+e.target.value||0)})}
                      onFocus={e=>e.target.select()}
                      style={{...inp({padding:"3px 6px",fontSize:13,width:55,textAlign:"right"}),color:"#fff"}}/>
                    <span style={{color:"#fff",fontSize:13}}>%</span>
                  </div>
                  <span style={{fontWeight:800,color:"#fff",fontSize:18,fontVariantNumeric:"tabular-nums"}}>{fmt(sellPrice)}</span>
                </div>
              </div>

              {/* Labor */}
              <div style={{background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:8,padding:"10px 12px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,letterSpacing:0.5}}>LABOR</div>
                  <span style={{background:laborEst.isLegacy?C.yellowDim:laborEst.hasLayoutData?C.greenDim:C.accentDim,color:laborEst.isLegacy?C.yellow:laborEst.hasLayoutData?C.green:C.accent,borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>
                    {laborEst.isOverride?"Override":laborEst.isLegacy?"Legacy":laborEst.hasLayoutData?"Auto":"Schematic"}
                  </span>
                  {acceptedCount===laborEst.lines.length&&laborEst.lines.length>0&&<span style={{background:C.greenDim,color:C.green,borderRadius:10,padding:"1px 6px",fontSize:10,fontWeight:700}}>✓ All</span>}
                  <div style={{flex:1}}/>
                  <span style={{fontSize:11,color:C.muted}}>$/hr</span>
                  <input type="number" min="0" step="1" readOnly={readOnly} value={laborRate}
                    onChange={e=>saveSelectedPricing({laborRate:Math.max(0,+e.target.value||0)})}
                    onFocus={e=>e.target.select()}
                    style={{...inp({padding:"2px 4px",fontSize:12,width:46,textAlign:"right",border:"1px solid #888"})}}/>
                </div>
                {!laborEst.isOverride&&laborEst.lines.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:8}}>
                    {GDEF.map(({label,color,cats})=>{
                      const hrs=laborEst.lines.filter(l=>cats.includes(l.category)).reduce((s,l)=>s+l.hours,0);
                      return(
                        <div key={label} style={{display:"flex",alignItems:"center",gap:0,fontSize:13}}>
                          <span style={{fontWeight:700,color,letterSpacing:0.5,fontSize:11,width:52}}>{label}</span>
                          <span style={{color:"#fff",fontWeight:700,fontVariantNumeric:"tabular-nums",width:32,textAlign:"right"}}>{Math.ceil(hrs)}</span>
                          <span style={{color:C.muted,fontWeight:400,fontSize:11,marginLeft:4}}>hrs</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {laborEst.lines.length>0&&(
                  <button onClick={()=>setFbLaborMoreInfo(v=>!v)}
                    style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,cursor:"pointer",fontSize:11,padding:"3px 10px",width:"100%",textAlign:"left",display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10}}>{fbLaborMoreInfo?"▲":"▼"}</span>
                    {fbLaborMoreInfo?"Hide Detail":"More Info"}
                  </button>
                )}
                {fbLaborMoreInfo&&laborEst.lines.length>0&&(
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,marginTop:8,tableLayout:"fixed"}}>
                    <colgroup><col style={{width:22}}/><col/><col style={{width:68}}/><col style={{width:34}}/><col style={{width:44}}/></colgroup>
                    <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                      <th style={{textAlign:"center",padding:"2px 2px",color:C.muted,fontWeight:600,fontSize:10,width:22}}>✓</th>
                      <th style={{textAlign:"left",padding:"2px 3px",color:C.muted,fontWeight:600,fontSize:10}}>Category</th>
                      <th style={{textAlign:"right",padding:"2px 3px",color:C.muted,fontWeight:600,fontSize:10}}>Qty</th>
                      <th style={{textAlign:"right",padding:"2px 2px",color:C.muted,fontWeight:600,fontSize:10}}>Hrs</th>
                      <th style={{textAlign:"right",padding:"2px 2px",color:C.muted,fontWeight:600,fontSize:10}}>Cost</th>
                    </tr></thead>
                    <tbody>
                      {laborEst.lines.map((l,i)=>{
                        const isAcc=!!laborAccepted[l.category];
                        return(
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}22`,background:isAcc?"#0a1a0a":"transparent"}}>
                          <td style={{padding:"3px 4px",textAlign:"center"}}>
                            <input type="checkbox" checked={isAcc} disabled={readOnly}
                              onChange={e=>saveSelectedLaborAccepted(l.category,e.target.checked)}
                              style={{accentColor:C.green,cursor:readOnly?"default":"pointer",margin:0}}/>
                          </td>
                          <td style={{padding:"2px 3px",color:isAcc?C.green:C.sub,fontSize:11,overflow:"hidden",textOverflow:"ellipsis"}}>{l.category}</td>
                          <td style={{padding:"2px 3px",textAlign:"right"}}>
                            {l.field&&!readOnly?(
                              <input type="text" inputMode="decimal" defaultValue={l.qty} key={l.field+"-"+l.qty}
                                onFocus={e=>e.target.select()}
                                onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)&&v!==l.qty)saveSelectedLaborOverride(l.field,Math.max(0,v));}}
                                onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}}
                                style={{background:"transparent",border:"1px solid #888",borderRadius:4,color:C.text,padding:"1px 2px",fontSize:11,width:36,textAlign:"right"}}/>
                            ):(
                              <span style={{color:C.text,fontSize:11}}>{l.qty}</span>
                            )}
                            <span style={{color:C.muted,fontSize:9,marginLeft:1}}>{l.unit}</span>
                          </td>
                          <td style={{padding:"2px 2px",textAlign:"right",color:C.muted,fontSize:10}}>{l.hours.toFixed(1)}</td>
                          <td style={{padding:"2px 2px",textAlign:"right",color:C.text,fontVariantNumeric:"tabular-nums",fontSize:10}}>{fmt(l.cost)}</td>
                        </tr>);
                      })}
                      <tr style={{borderTop:`1px solid ${C.border}`}}>
                        <td style={{padding:"2px 2px",textAlign:"center",fontSize:9,color:C.muted}}>{acceptedCount}/{laborEst.lines.length}</td>
                        <td style={{padding:"2px 3px",fontWeight:700,color:C.text,fontSize:11}}>TOTAL</td>
                        <td></td>
                        <td style={{padding:"2px 2px",textAlign:"right",fontWeight:700,color:C.text,fontSize:11}}>{laborEst.totalHours.toFixed(1)}</td>
                        <td style={{padding:"2px 2px",textAlign:"right",fontWeight:700,color:C.accent,fontVariantNumeric:"tabular-nums",fontSize:11}}>{fmt(laborEst.totalCost)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Level of Confidence */}
              <ConfidenceBar panel={sp} readOnly={readOnly} onUpdate={selectedOnUpdate} onSaveImmediate={selectedOnSaveImmediate} compact/>
              </div>

              {/* Quote Summary — third pane, locked to bottom */}
              <div style={{flexShrink:0,borderTop:`2px solid ${C.accent}`,background:"#06060f",padding:"12px 16px 16px",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:2}}>
                  <span style={{fontSize:17,fontWeight:800,color:C.text,letterSpacing:0.5}}>QUOTE SUMMARY{project.quoteRev>0?` — Rev ${String(project.quoteRev).padStart(2,'0')}`:""}</span>
                  {(project.quoteRev||0)>(project.quoteRevAtPrint||0)&&<span style={{fontSize:10,fontWeight:700,color:"#f59e0b",letterSpacing:0.3}}>unsent revision</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {(project.panels||[]).map((p,pi)=>{
                  const ppr=p.pricing||{};
                  const pmk=ppr.markup??30;
                  const ple=computeLaborEstimate(p);
                  const plc=ple.totalHours>0?ple.totalCost:(ppr.manualLaborCost||0);
                  const pmat=(p.bom||[]).reduce((s,r)=>s+(r.unitPrice||0)*(r.qty||1),0);
                  const pgt=pmat+plc;
                  const psp=pgt*(1+pmk/100);
                  const pfmt=n=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
                  const pqty=p.lineQty??p.qty??1;
                  return(
                    <div key={p.id} onClick={()=>setSelectedPanelId(p.id)}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:6,background:p.id===selectedPanelId?"#1a1a2e":"transparent",border:`1px solid ${p.id===selectedPanelId?C.accent:C.border}`,cursor:"pointer"}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#fff",minWidth:20,textAlign:"center"}}>{pqty}</span>
                      <span style={{fontSize:12,color:p.id===selectedPanelId?C.accent:C.sub,fontWeight:p.id===selectedPanelId?700:400,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,minWidth:0}}>{p.drawingNo||p.name||`Panel ${pi+1}`}</span>
                      {(()=>{const openEqs=(p.engineeringQuestions||[]).filter(q=>q.status==="open").length;return openEqs>0?
                        React.createElement("button",{onClick:e=>{e.stopPropagation();setEqModalPanelId(p.id);},style:{background:"none",border:"1px solid #fde04766",borderRadius:20,padding:"3px 12px",fontSize:13,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap",cursor:"pointer",color:"#fde047",animation:"pulseYellow 2s ease-in-out infinite"}},openEqs+" ?"):
                        React.createElement("span",{onClick:e=>{e.stopPropagation();setEqModalPanelId(p.id);},style:{cursor:"pointer"}},React.createElement(Badge,{status:p.status||"draft"}));})()}
                      {ppr.isBudgetary&&<span style={{fontSize:9,fontWeight:700,color:"#f59e0b",background:"#3a1f00",borderRadius:4,padding:"1px 5px",flexShrink:0}}>BUDGETARY</span>}
                      <span style={{fontSize:13,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums",flexShrink:0,minWidth:72,textAlign:"right"}}>{pfmt(psp*pqty)}</span>
                    </div>
                  );
                })}
                {(project.panels||[]).length>1&&(()=>{
                  const total=(project.panels||[]).reduce((sum,p)=>{
                    const ppr=p.pricing||{};
                    const pmk=ppr.markup??30;
                    const ple=computeLaborEstimate(p);
                    const plc=ple.totalHours>0?ple.totalCost:(ppr.manualLaborCost||0);
                    const pmat=(p.bom||[]).reduce((s,r)=>s+(r.unitPrice||0)*(r.qty||1),0);
                    return sum+((pmat+plc)*(1+(ppr.markup??30)/100))*(p.lineQty??p.qty??1);
                  },0);
                  const pfmt=n=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
                  return(
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",marginTop:4,borderTop:"1px solid #fff"}}>
                      <span style={{fontSize:12,fontWeight:700,color:C.muted,letterSpacing:0.5}}>PROJECT TOTAL</span>
                      <span style={{fontSize:16,fontWeight:800,color:"#fff",fontVariantNumeric:"tabular-nums"}}>{pfmt(total)}</span>
                    </div>
                  );
                })()}
                {(()=>{const sp=(project.panels||[]).find(p=>p.id===selectedPanelId);if(!sp)return null;const isBudg=(sp.pricing||{}).isBudgetary||false;
                  return <label style={{display:"flex",alignItems:"center",gap:6,padding:"6px 10px",cursor:"pointer",fontSize:11,color:isBudg?"#f59e0b":"#64748b",marginTop:2}}>
                    <input type="checkbox" checked={isBudg} onChange={e=>saveSelectedPricing({isBudgetary:e.target.checked})} style={{accentColor:"#f59e0b",width:13,height:13,cursor:"pointer"}}/>
                    {isBudg?"Budgetary Quote — pricing is estimated":"Mark as Budgetary Quote"}
                  </label>;
                })()}
              </div>

              {/* Action buttons */}
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:4,paddingTop:8,borderTop:`1px solid ${C.border}33`}}>
                {(()=>{
                  const now=Date.now();
                  const RFQ_EXPIRED_MS=5*24*60*60*1000; // 5 days
                  const RFQ_COOLDOWN_MS=30*24*60*60*1000;
                  const allBom=(project.panels||[]).flatMap(p=>p.bom||[]).filter(r=>!r.isLaborRow&&r.rfqSentDate);
                  const pending=allBom.filter(r=>r.rfqSentDate&&(now-r.rfqSentDate)<RFQ_COOLDOWN_MS&&!r.bcPoDate&&(!r.unitPrice||r.unitPrice===0));
                  const expired=pending.filter(r=>(now-r.rfqSentDate)>RFQ_EXPIRED_MS);
                  const awaitingCount=pending.length-expired.length;
                  // Group by vendor for count
                  const pendingVendors=new Set(pending.map(r=>r.bcVendorName||"Unknown"));
                  const expiredVendors=new Set(expired.map(r=>r.bcVendorName||"Unknown"));
                  const badge=expired.length>0?`⚠ ${expiredVendors.size} Expired RFQ${expiredVendors.size!==1?"s":""}`:awaitingCount>0?`${pendingVendors.size} RFQ${pendingVendors.size!==1?"s":""} Awaiting Response`:null;
                  return <div>
                    <button data-tour="rfq-btn" onClick={onSendRfqEmails} disabled={rfqLoading} style={btn("#1e1b4b","#818cf8",{fontSize:13,padding:"6px 18px",width:"100%",opacity:rfqLoading?0.5:1})}>{rfqLoading?"Building…":"Send/Print RFQ's"}</button>
                    {badge&&<div style={{fontSize:10,fontWeight:700,textAlign:"center",marginTop:3,color:expired.length>0?"#f59e0b":"#38bdf8"}}>{badge}</div>}
                  </div>;
                })()}
                <div style={{display:"flex",gap:6,alignItems:"stretch"}}>
                  <button onClick={()=>onOpenSupplierQuote(sp.bom||[],sp.id)} style={btn("#0d1f0d","#4ade80",{fontSize:14,padding:"8px 12px",flex:3,border:"1px solid #4ade8044",fontWeight:700})}>📥 Upload Supplier Quote{pendingRfqUploads>0?` (${pendingRfqUploads})`:""}</button>
                  <button onClick={onShowRfqHistory} title="View RFQ send history" style={btn("#111128","#64748b",{fontSize:11,padding:"6px 8px",flex:1,whiteSpace:"nowrap"})}>📜 History</button>
                </div>
                <button data-tour="print-quote-btn" onClick={onViewQuote} style={btn(C.greenDim,C.green,{fontSize:13,padding:"6px 18px",width:"100%"})}>🖨 Print Client Quote{(project.quoteRev||0)>(project.quoteRevAtPrint||0)?` (Rev ${project.quoteRev} ⚠ unsent)`:project.quoteRev>0?` (Rev ${project.quoteRev})`:""}</button>
                {!readOnly&&<button onClick={async()=>{
                  const q=project.quote||{};
                  const rev=project.quoteRev||0;
                  const isBudg=(project.panels||[]).some(pan=>(pan.pricing||{}).isBudgetary);
                  // DECISION(v1.19.360): Re-fetch contacts from BC to get latest email/phone before
                  // opening the modal. This handles cases where email was added to BC after initial load.
                  let contactName=project.bcContactName||q.contact||"";
                  let toEmail=project.bcContactEmail||q.email||"";
                  if(project.bcCustomerNumber&&_bcToken&&project.bcContactNo){
                    try{
                      const freshContacts=await bcFetchCustomerContacts(project.bcCustomerNumber);
                      if(freshContacts.length)setContactPersons(freshContacts);
                      const match=freshContacts.find(c=>c.number===project.bcContactNo);
                      if(match){
                        if(match.email&&!toEmail)toEmail=match.email;
                        if(match.displayName)contactName=match.displayName;
                        // Update project if email was missing
                        if(match.email&&!project.bcContactEmail){
                          onUpdate({...project,bcContactEmail:match.email,quote:{...(project.quote||{}),email:match.email}});
                        }
                      }
                    }catch(e){}
                  }
                  const custFirst=(contactName).split(" ")[0]||"";
                  // Resolve salesperson info — check cached salesperson list for current bcSalespersonCode
                  const spCode=project.bcSalespersonCode||"";
                  const spCached=spCode&&window._arcSalespersonCache?window._arcSalespersonCache.find(s=>s.Code===spCode):null;
                  const spName=spCached?.Name||project.bcSalesperson||q.salesperson||"Matrix Systems";
                  const spEmail=spCached?.E_Mail||q.salesEmail||fbAuth.currentUser?.email||"";
                  const spPhone=spCached?.Phone_No||q.salesPhone||"";
                  setQuoteSendModalPLV({
                    to:toEmail,
                    subject:`${isBudg?"Budgetary ":""}Quote ${q.number||"Quote"}${rev>0?" Rev "+String(rev).padStart(2,"0"):""} — ${project.name||"Project"}`,
                    message:`${custFirst?custFirst+",\n\n":""}Please find the attached ${isBudg?"budgetary ":""}quote for ${project.bcProjectNumber||""} ${project.name||"your project"} for your review.\n\nIf you have any questions, please don't hesitate to reach out.`,
                    signature:`${spName}\n${spEmail}${spPhone?"\n"+spPhone:""}\n\nThis email was auto-generated. If there are any questions, you may reply to this email.`
                  });
                }} style={btn("#0c2233","#38bdf8",{fontSize:13,padding:"6px 18px",width:"100%",border:"1px solid #38bdf844"})}>✉ Send Quote{project.quoteSentAt?" (Resend)":""}</button>}
                {project.quoteSentAt&&<div style={{fontSize:11,color:"#38bdf8",textAlign:"center",fontWeight:600}}>✓ Quote sent Rev {String(project.quoteSentRev||0).padStart(2,"0")} to {project.quoteSentTo||"client"} · {new Date(project.quoteSentAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"})}</div>}
                {!readOnly&&project.bcProjectNumber&&!(project.bcEnv&&project.bcEnv!==_bcConfig.env)&&<button onClick={onPoReceived} style={btn("#0d1a10","#4ade80",{fontSize:13,padding:"6px 18px",width:"100%",border:"1px solid #4ade8044"})}>📬 PO Received</button>}
                {!readOnly&&sp.bcItemNumber&&(
                  <button onClick={()=>{}} disabled={pendingBcCount>0}
                    title={pendingBcCount>0?`${pendingBcCount} unverified BC parts — resolve blue circles first`:`Update Assembly BOM for item ${sp.bcItemNumber}`}
                    style={{background:pendingBcCount>0?"#111":"#0d1f3c",border:'1px solid '+(pendingBcCount>0?"#444":"#38bdf866"),color:pendingBcCount>0?"#555":"#38bdf8",cursor:pendingBcCount>0?"not-allowed":"pointer",borderRadius:20,padding:"5px 16px",fontSize:12,fontWeight:700,whiteSpace:"nowrap",letterSpacing:0.3,opacity:pendingBcCount>0?0.5:1,textAlign:"center"}}>
                    🔄 Update BOM in BC (Item# {sp.bcItemNumber})
                  </button>
                )}
              </div>
              </div>
            </>);
          })()}
        </div>
    </div>
    {showDeleteAdminWarn&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
        onClick={()=>setShowDeleteAdminWarn(false)}>
        <div style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:10,padding:"28px 32px",maxWidth:380,width:"100%",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:18,fontWeight:800,color:C.red,marginBottom:10}}>Admin Required</div>
          <div style={{fontSize:13,color:C.sub,lineHeight:1.6,marginBottom:20}}>
            Only an <strong style={{color:C.accent}}>Admin</strong> can delete a project. Please contact your administrator to have this project removed.
          </div>
          <button onClick={()=>setShowDeleteAdminWarn(false)}
            style={btn(C.accentDim,C.accent,{width:"100%",fontWeight:700,fontSize:13})}>
            OK
          </button>
        </div>
      </div>
    )}
    {eqModalPanelId&&(()=>{const ep=(project.panels||[]).find(p=>p.id===eqModalPanelId);return ep?React.createElement(EngineeringQuestionsModal,{panel:ep,uid,
      onUpdate:updated=>onUpdate({...project,panels:(project.panels||[]).map(p=>p.id===updated.id?updated:p)}),
      onSave:updated=>{const proj={...project,panels:(project.panels||[]).map(p=>p.id===updated.id?updated:p)};saveProject(uid,proj);},
      onClose:()=>setEqModalPanelId(null),memberMap:null}):null;})()}
    {quoteSendModalPLV&&<QuoteSendModal project={project} uid={uid} modalData={quoteSendModalPLV} setModalData={setQuoteSendModalPLV} onUpdate={onUpdate} onClose={()=>setQuoteSendModalPLV(null)}/>}
    {showCADLinkModal&&<CADLinkSendModal project={project} onClose={()=>setShowCADLinkModal(false)}/>}
  </>);
}


// ── QUOTE VIEW (aggregates all panels) ──

export default PanelListView;

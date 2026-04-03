// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

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
function QuoteView({project,uid,onBack,onUpdate}){
  const panels=project.panels||[];
  const allBom=mergeBoms(panels.map(p=>p.bom||[]));
  const totalWireCount=panels.reduce((s,p)=>s+(p.validation?.wireCount||0),0);
  // Compute labor for each panel individually (preserves overrides), then sum
  const perPanelLabor=panels.map(p=>computeLaborEstimate(p));
  const totalLaborHours=perPanelLabor.reduce((s,l)=>s+l.totalHours,0);
  const totalLaborCost=perPanelLabor.reduce((s,l)=>s+l.totalCost,0);
  const hasLayoutData=perPanelLabor.some(l=>l.hasLayoutData);
  // Merge labor lines by category
  const laborLineMap={};
  perPanelLabor.forEach(l=>l.lines.forEach(line=>{
    if(laborLineMap[line.category]){laborLineMap[line.category].qty+=line.qty;laborLineMap[line.category].hours+=line.hours;laborLineMap[line.category].cost+=line.cost;}
    else{laborLineMap[line.category]={...line};}
  }));
  const aggregatedLaborLines=Object.values(laborLineMap);
  // Use first panel's pricing as source of truth (that's where user edits markup/contingency)
  const firstPanelPricing=panels.find(p=>p.pricing)?.pricing||{};
  const derivedPricing={...firstPanelPricing};
  // Build a fake laborData so computeLaborEstimate produces matching results for QuoteTab
  // But actually override QuoteTab's computation — pass pre-computed values via pricing
  const aggregated={
    ...project,
    bom:allBom,
    validation:{wireCount:totalWireCount},
    laborData:null, // null triggers legacy path, but we override via _quoteLabor
    pricing:derivedPricing,
    pages:panels.flatMap(p=>p.pages||[]),
    _quoteLabor:{lines:aggregatedLaborLines,totalHours:totalLaborHours,totalCost:totalLaborCost,hasLayoutData,isLegacy:false,isOverride:false},
  };
  function handleQuoteUpdate(upd){
    // Sync pricing back to all panels so panel cards stay consistent with quote
    const updatedPanels=(project.panels||[]).map(p=>({...p,pricing:{...(p.pricing||{}),...(upd.pricing||{})}}));
    onUpdate({...project,panels:updatedPanels,quote:upd.quote,pricing:upd.pricing,budgetaryQuote:upd.budgetaryQuote});
  }
  const fmtMoney=n=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",background:C.bg}}>
      <div style={{background:C.bg,borderBottom:`1px solid ${C.border}`,padding:"6px 24px",display:"flex",alignItems:"center",gap:12,minHeight:40,flexShrink:0}}>
        <button onClick={onBack} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:6,padding:"0",whiteSpace:"nowrap"}}>← Panels</button>
        <div style={{width:1,height:16,background:C.border}}/>
        <div style={{fontSize:15,fontWeight:700,color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{project.name}</div>
        <span style={{background:C.greenDim,color:C.green,borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>COMBINED QUOTE</span>
        <div style={{fontSize:11,color:C.muted,whiteSpace:"nowrap"}}>{allBom.length} items · {totalWireCount} wires</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:24}}>
        <div style={{maxWidth:1400,margin:"0 auto"}}>
          {panels.length>0&&(
            <div style={{...card({padding:"12px 16px"}),marginBottom:20}} className="no-print">
              <div style={{fontSize:12,color:C.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Panel Breakdown</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {panels.map(p=>{
                  const mats=(p.bom||[]).reduce((s,r)=>s+(r.unitPrice||0)*(r.qty||1),0);
                  return(
                    <div key={p.id} style={{...card({padding:"10px 14px"}),minWidth:170}}>
                      <div style={{fontSize:13,fontWeight:700,marginBottom:4}}>{p.name}</div>
                      <div style={{fontSize:12,color:C.muted}}>{(p.bom||[]).length} items · {(p.pages||[]).length} pages</div>
                      {p.validation?.wireCount>0&&<div style={{fontSize:12,color:C.muted}}>{p.validation.wireCount} wires</div>}
                      {p.complianceReview?.concerns?.length>0&&(()=>{const cc=p.complianceReview.concerns;const crit=cc.filter(c=>c.severity==='critical').length;const warn=cc.filter(c=>c.severity==='warning').length;return <div style={{fontSize:11,marginTop:2}}>{crit>0&&<span style={{color:'#ef4444',fontWeight:700,marginRight:4}}>{crit} critical</span>}{warn>0&&<span style={{color:'#f59e0b',fontWeight:600}}>{warn} warning{warn>1?'s':''}</span>}</div>;})()}
                      {mats>0&&<div style={{fontSize:12,color:C.green,marginTop:4}}>Materials: {fmtMoney(mats)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <QuoteTab project={aggregated} onUpdate={handleQuoteUpdate}/>
        </div>
      </div>
    </div>
  );
}

// ── ERROR BOUNDARY ──
class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={error:null};}
  static getDerivedStateFromError(e){return{error:e};}
  componentDidCatch(e,info){console.error("ErrorBoundary caught:",e,info);}
  render(){
    if(this.state.error){
      return(
        <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:32}}>
          <div style={{fontSize:40,marginBottom:16}}>⚠️</div>
          <div style={{fontSize:18,fontWeight:700,color:C.red,marginBottom:8}}>Something went wrong</div>
          <div style={{fontSize:13,color:C.muted,marginBottom:24,maxWidth:600,textAlign:"center",wordBreak:"break-all"}}>{this.state.error?.message||String(this.state.error)}</div>
          <button onClick={()=>{this.setState({error:null});if(this.props.onBack)this.props.onBack();}}
            style={{background:"#383850",border:"1.5px solid #7a7a9a",color:"#d4d8e0",cursor:"pointer",fontSize:15,fontWeight:600,padding:"8px 20px",borderRadius:8}}>← Back to Projects</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── PROJECT VIEW ──
function ProjectView({project:init,uid,onBack,onChange,onDelete,onTransfer,onCopy,autoOpenPortal,onPortalOpened}){
  const [project,setProject]=useState(()=>migrateProject(init));
  const projectRef=useRef(migrateProject(init));
  const [view,setView]=useState("panels"); // "panels"|"quote"
  const [autoPrint,setAutoPrint]=useState(false);
  const [rfqLoading,setRfqLoading]=useState(false);
  const [rfqGroups,setRfqGroups]=useState(null);
  const [autoPrintRfq,setAutoPrintRfq]=useState(false);
  const [rfqEmailModal,setRfqEmailModal]=useState(null);
  const [quoteSendModal,setQuoteSendModal]=useState(null); // {to, subject, message, signature}
  const [showRfqHistory,setShowRfqHistory]=useState(false);
  const [quoteWarnRows,setQuoteWarnRows]=useState(null); // null=hidden, array=showing
  const [eqWarnOpen,setEqWarnOpen]=useState(null); // null=hidden, array of open engineering questions
  const [eqWarnPriceRows,setEqWarnPriceRows]=useState(null); // stacked price warnings after eq warning
  const [bcCountMismatch,setBcCountMismatch]=useState(null); // null=hidden, {arcCount,bcCount,missing:[]}
  const [showBcUploadPrompt,setShowBcUploadPrompt]=useState(false);
  const [bcUploading,setBcUploading]=useState(false);
  const [showProductionUpload,setShowProductionUpload]=useState(null); // null=hidden, {poNumber,dueDate}
  const bcUploadRef=useRef(null); // ref to selected PanelCard's buildAndAttachPdf — shared with PanelListView
  const [showSqModal,setShowSqModal]=useState(false);
  const [sqPanelBom,setSqPanelBom]=useState(null);
  const [sqPanelId,setSqPanelId]=useState(null);
  const [pendingRfqUploads,setPendingRfqUploads]=useState(0);
  const [portalSubmissions,setPortalSubmissions]=useState([]);
  const [showPortalModal,setShowPortalModal]=useState(false);
  const [showPoModal,setShowPoModal]=useState(false);
  const [showPriceCheckModal,setShowPriceCheckModal]=useState(false);
  const [priceCheckDiffs,setPriceCheckDiffs]=useState(null);
  // Compare BOM prices against BC Purchase Prices on project open
  const priceCheckRan=useRef(false);
  useEffect(()=>{
    if(priceCheckRan.current)return;
    function tryCheck(){
      if(priceCheckRan.current||!_bcToken)return;
      priceCheckRan.current=true;
      (async()=>{
        const panels=projectRef.current.panels||[];
        const pnSet=new Set();
        panels.forEach(p=>(p.bom||[]).forEach(r=>{
          if(!r.isLaborRow&&(r.partNumber||'').trim())pnSet.add((r.partNumber||'').trim());
        }));
        if(!pnSet.size)return;
        const bcPrices=await bcFetchPurchasePrices([...pnSet]);
        if(!bcPrices.size)return;
        const diffs=[];
        panels.forEach((p,pi)=>(p.bom||[]).forEach(r=>{
          if(r.isLaborRow)return;
          const pn=(r.partNumber||'').trim();
          const bc=bcPrices.get(pn);
          if(!bc)return;
          const bomPrice=r.unitPrice||0;
          const bcPrice=bc.directUnitCost;
          const bcDateMs=bc.startingDate||null;
          const bomDateMs=r.bcPoDate||r.priceDate||null;
          const priceDiff=Math.abs(bomPrice-bcPrice)>0.005;
          // Only flag if BC price is newer than BOM price — avoids repeat prompts for known differences
          const bcNewer=bcDateMs&&(!bomDateMs||bcDateMs>bomDateMs);
          if(priceDiff&&bcNewer){
            diffs.push({panelIdx:pi,panelName:p.name||'Panel '+(pi+1),rowId:r.id,partNumber:pn,
              description:r.description||'',bomPrice,bomDate:bomDateMs,
              bcPrice,bcDate:bcDateMs,bcVendor:bc.vendorNo||''});
          }
        }));
        if(diffs.length>0){console.log("[BC] Purchase Price diffs found:",diffs.length);setPriceCheckDiffs(diffs);setShowPriceCheckModal(true);}
        else{console.log("[BC] Purchase Prices match BOM — no updates needed");}
      })().catch(e=>console.warn("Purchase price check error:",e));
    }
    tryCheck();
    const iv=setInterval(tryCheck,3000);
    return()=>clearInterval(iv);
  },[]);
  function applyPriceCheckDiffs(selectedDiffs){
    const diffMap={};
    selectedDiffs.forEach(d=>{
      if(!diffMap[d.panelIdx])diffMap[d.panelIdx]={};
      diffMap[d.panelIdx][String(d.rowId)]=d;
    });
    const updatedPanels=(projectRef.current.panels||[]).map((p,pi)=>{
      if(!diffMap[pi])return p;
      return{...p,bom:(p.bom||[]).map(r=>{
        const d=diffMap[pi][String(r.id)];
        if(!d)return r;
        return{...r,unitPrice:d.bcPrice,priceDate:d.bcDate,bcPoDate:d.bcDate,priceSource:'bc'};
      })};
    });
    update({...projectRef.current,panels:updatedPanels});
    setShowPriceCheckModal(false);setPriceCheckDiffs(null);
    console.log("[BC] Applied",selectedDiffs.length,"Purchase Price updates to BOM");
  }
  useEffect(()=>{
    if(!uid||!init.id){setPendingRfqUploads(0);setPortalSubmissions([]);return;}
    const unsub=fbDb.collection('rfqUploads').where('uid','==',uid).onSnapshot(snap=>{
      const matching=snap.docs.filter(d=>{
        const data=d.data();
        return data.projectId===init.id&&data.status==='submitted';
      });
      console.log('PORTAL SUBS: project',init.id,'total docs',snap.size,'matching',matching.length,matching.map(d=>d.id));
      setPendingRfqUploads(matching.length);
      setPortalSubmissions(matching.map(d=>({id:d.id,...d.data()})));
    },err=>{console.error('PORTAL SUBS error:',err);setPendingRfqUploads(0);setPortalSubmissions([]);});
    return()=>unsub();
  },[uid,init.id]);
  // Auto-open portal modal when navigated from a notification
  useEffect(()=>{
    if(autoOpenPortal&&portalSubmissions.length>0){
      setShowPortalModal(true);
      onPortalOpened?.();
    }
  },[autoOpenPortal,portalSubmissions.length]);
  const saveTimer=useRef(null);
  const readOnly=isReadOnly();
  const isBcDisconnected=!!(project.bcEnv&&project.bcEnv!==_bcConfig.env);
  const didMigrate=useRef(!init.panels);

  // Keep ref in sync with state for use in callbacks
  useEffect(()=>{projectRef.current=project;},[project]);

  // Save migrated project immediately on first open
  useEffect(()=>{
    if(didMigrate.current){
      didMigrate.current=false;
      saveProject(uid,migrateProject(init)).catch(()=>{});
    }
  },[]);

  // Listen for live updates from background extraction tasks (survives navigation)
  useEffect(()=>onProjectUpdated(project.id,p=>{setProject(p);projectRef.current=p;onChange(p);}),[project.id]);

  const revBumpTimer=useRef(null);
  function update(p){
    // Auto-bump quote revision when BOM changes after a print (debounced to avoid stacking)
    if(p.lastPrintedBomHash){
      const curHash=computeBomHash(p.panels);
      if(curHash!==p.lastPrintedBomHash&&(p.quoteRev||0)===(p.quoteRevAtPrint||0)){
        p={...p,quoteRev:(p.quoteRev||0)+1};
        // Save the revision bump after a short delay (prevents stacking from rapid updates)
        if(revBumpTimer.current)clearTimeout(revBumpTimer.current);
        revBumpTimer.current=setTimeout(()=>{saveProject(uid,projectRef.current).catch(()=>{});},2000);
      }
    }
    setProject(p);projectRef.current=p;onChange(p);
  }

  const [relinking,setRelinking]=useState(false);
  const [relinkMsg,setRelinkMsg]=useState(null);
  async function relinkToBC(){
    if(!_bcToken){alert("Connect to Business Central first.");return;}
    if(!confirm("This will create a NEW BC project in the current environment ("+_bcConfig.env+") and re-link this project. Continue?"))return;
    setRelinking(true);setRelinkMsg("Creating BC project…");
    try{
      const bc=await bcCreateProject(project.name,project.bcCustomerNumber||null);
      setRelinkMsg("Creating task structure…");
      const panels=project.panels||[];
      await bcCreatePanelTaskStructure(bc.number,project.name,panels).catch(e=>console.warn("Relink task structure error:",e));
      for(let i=0;i<panels.length;i++){
        setRelinkMsg(`Syncing planning lines (panel ${i+1}/${panels.length})…`);
        await bcSyncPanelPlanningLines(bc.number,i,panels[i],project.name).catch(e=>console.warn("Relink planning lines error panel",i,e));
      }
      const updated={...projectRef.current,bcProjectNumber:bc.number,bcProjectId:bc.id,bcEnv:_bcConfig.env,bcPdfAttached:false,bcPdfFileName:null};
      // Reset per-panel bc attachment flags
      if(updated.panels)updated.panels=updated.panels.map(pan=>({...pan,bcPdfAttached:false,bcPdfFileName:null}));
      setProject(updated);projectRef.current=updated;onChange(updated);
      await saveProject(uid,updated);
      setRelinkMsg("✓ Re-linked to "+bc.number);
      setTimeout(()=>setRelinkMsg(null),3000);
    }catch(e){
      console.error("Relink error:",e);
      setRelinkMsg("Failed: "+(e.message||e));
    }
    setRelinking(false);
  }

  // Auto-print: wait for quote DOM to render, trigger print, then go back
  useEffect(()=>{
    if(autoPrint&&view==="quote"){
      const t=setTimeout(async()=>{await generateQuotePdf(projectRef.current);const hash=computeBomHash(projectRef.current.panels);const upd={...projectRef.current,lastPrintedBomHash:hash,lastQuotePrintedAt:Date.now(),quoteRevAtPrint:projectRef.current.quoteRev||0};setProject(upd);projectRef.current=upd;onChange(upd);saveProject(uid,upd);setAutoPrint(false);setView("panels");},400);
      return()=>clearTimeout(t);
    }
  },[autoPrint,view]);

  async function onPrintRfq(){
    setRfqLoading(true);
    try{
      const allBom=mergeBoms((projectRef.current.panels||[]).map(p=>p.bom||[]));
      const result=await buildRfqSupplierGroups(allBom);
      if(result.noItems){setRfqLoading(false);alert("No items eligible for RFQ. Items qualify if they show 'No POs' or have a price date older than 60 days (manual-priced items are excluded).");return;}
      setRfqGroups(result.groups);
      setAutoPrintRfq(true);
    }catch(e){console.error("RFQ build error:",e);alert("Failed to build RFQ: "+(e.message||e));}
    setRfqLoading(false);
  }

  async function onSendRfqEmails(){
    setRfqLoading(true);
    try{
      const allBom=mergeBoms((projectRef.current.panels||[]).map(p=>p.bom||[]));
      const result=await buildRfqSupplierGroups(allBom);
      if(result.noItems){setRfqLoading(false);alert("No items eligible for RFQ email. Items qualify if they show 'No POs' or have a price date older than 60 days.");return;}
      const groupsWithEmail=await Promise.all(result.groups.map(async g=>{
        const email=g.vendorNo?await bcGetVendorEmail(g.vendorNo):"";
        return{...g,vendorEmail:email};
      }));
      setRfqEmailModal({groups:groupsWithEmail,projectName:projectRef.current.name||""});
    }catch(e){console.error("RFQ email build error:",e);alert("Failed to build RFQ: "+(e.message||e));}
    setRfqLoading(false);
  }

  async function handlePrintQuote(){
    // Auto-assign quote number if not yet set
    let proj=projectRef.current;
    if(!proj.quote?.number||!/^MTX-Q\d{6}$/.test(String(proj.quote.number))){
      try{
        const qNum=await getNextQuoteNumber(uid);
        proj={...proj,quote:{...(proj.quote||{}),number:qNum}};
        setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);
        // Note in BC
        if(proj.bcProjectNumber&&_bcToken){
          bcPatchJobOData(proj.bcProjectNumber,{Description_2:"Quote "+qNum}).catch(e=>console.warn("BC quote note failed:",e));
        }
      }catch(e){console.warn("Auto quote number failed:",e);}
    }
    // Auto-populate quote fields from panel data and BC project card if empty
    const panels=proj.panels||[];
    const q=proj.quote||{};
    const firstPanel=panels[0]||{};
    const autoFields={};
    if(!q.description&&firstPanel.drawingDesc)autoFields.description=firstPanel.drawingDesc;
    if(!q.drawingRev&&firstPanel.drawingRev)autoFields.drawingRev=firstPanel.drawingRev;
    if(!q.projectNumber&&proj.bcProjectNumber)autoFields.projectNumber=proj.bcProjectNumber;
    // Fetch contact and salesperson from BC project card
    if(proj.bcProjectNumber&&_bcToken){
      try{
        const allPages=await bcDiscoverODataPages();
        const projectPage=allPages.find(n=>/^project(card)?$/i.test(n));
        if(projectPage){
          const pr=await fetch(`${BC_ODATA_BASE}/${projectPage}?$filter=No eq '${proj.bcProjectNumber}'&$select=Sell_to_Contact,Sell_to_Contact_No,Sell_to_Customer_No,Sell_to_Customer_Name,Sell_to_Address,Sell_to_Address_2,Sell_to_City,Sell_to_County,Sell_to_Post_Code,SellToPhoneNo,SellToEmail,Person_Responsible,CCS_Salesperson_Code,Payment_Terms_Code,CCS_Shipment_Method_Code`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
          if(pr.ok){
            const bc=((await pr.json()).value||[])[0];
            if(bc){
              // DECISION(v1.19.346): Always re-populate company/salesperson/contact from BC if the quote
              // fields are empty. Previous versions had timing bugs where these didn't get saved.
              if(!q.company&&bc.Sell_to_Customer_Name)autoFields.company=bc.Sell_to_Customer_Name;
              let addr=[bc.Sell_to_Address,bc.Sell_to_Address_2,bc.Sell_to_City&&bc.Sell_to_County?`${bc.Sell_to_City}, ${bc.Sell_to_County} ${bc.Sell_to_Post_Code||""}`.trim():bc.Sell_to_City].filter(Boolean).join("\n");
              // Fallback: if project card address is empty, fetch from Customer card
              if(!addr&&bc.Sell_to_Customer_No){
                try{
                  const compId2=await bcGetCompanyId();
                  const custR=await fetch(`${BC_API_BASE}/companies(${compId2})/customers?$filter=number eq '${bc.Sell_to_Customer_No}'&$select=addressLine1,addressLine2,city,state,postalCode,phoneNumber,email,taxAreaDisplayName`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
                  if(custR.ok){
                    const cust=((await custR.json()).value||[])[0];
                    if(cust){
                      addr=[cust.addressLine1,cust.addressLine2,cust.city&&cust.state?`${cust.city}, ${cust.state} ${cust.postalCode||""}`.trim():cust.city].filter(Boolean).join("\n");
                      if(!q.phone&&cust.phoneNumber)autoFields.phone=cust.phoneNumber;
                      if(!q.email&&cust.email)autoFields.email=cust.email;
                      if(cust.taxAreaDisplayName)autoFields.taxAreaCode=cust.taxAreaDisplayName;
                    }
                  }
                }catch(e){console.warn("Customer card fetch failed:",e);}
              }
              if(!q.address&&addr)autoFields.address=addr;
              // Get contact details from BC Contact Card — find person with email/phone under the company
              const compId=await bcGetCompanyId();
              const contactNo=bc.Sell_to_Contact_No||"";
              const custName=bc.Sell_to_Customer_Name||"";
              if(compId&&(contactNo||custName)&&(!q.contact||!q.phone||!q.email)){
                try{
                  // Find all contacts under this company — prefer ones with email
                  const cFilter=custName?`companyName eq '${custName.replace(/'/g,"''")}'`:`number eq '${contactNo}'`;
                  const cr=await fetch(`${BC_API_BASE}/companies(${compId})/contacts?$filter=${cFilter}&$select=number,displayName,email,phoneNumber,companyName&$top=10`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
                  if(cr.ok){
                    const contacts=(await cr.json()).value||[];
                    // Find best contact: person with email, or first person (not company record)
                    const people=contacts.filter(c=>c.displayName!==c.companyName);
                    const withEmail=people.filter(c=>c.email);
                    const bestContact=withEmail[0]||people[0]||contacts[0];
                    if(bestContact){
                      if(!q.contact&&bestContact.displayName&&bestContact.displayName!==custName)autoFields.contact=bestContact.displayName;
                      else if(!q.contact&&bc.Sell_to_Contact)autoFields.contact=bc.Sell_to_Contact;
                      if(!q.phone&&bestContact.phoneNumber)autoFields.phone=bestContact.phoneNumber;
                      else if(!q.phone&&bc.SellToPhoneNo)autoFields.phone=bc.SellToPhoneNo;
                      if(!q.email&&bestContact.email)autoFields.email=bestContact.email;
                      else if(!q.email&&bc.SellToEmail)autoFields.email=bc.SellToEmail;
                    }
                  }
                }catch(e){console.warn("BC contact lookup failed:",e);}
              }
              if(!q.contact&&!autoFields.contact&&bc.Sell_to_Contact)autoFields.contact=bc.Sell_to_Contact;
              if(!q.phone&&!autoFields.phone&&bc.SellToPhoneNo)autoFields.phone=bc.SellToPhoneNo;
              if(!q.email&&!autoFields.email&&bc.SellToEmail)autoFields.email=bc.SellToEmail;
              if(bc.Payment_Terms_Code)autoFields.paymentTerms=bc.Payment_Terms_Code;
              if(bc.CCS_Shipment_Method_Code)autoFields.shippingMethod=bc.CCS_Shipment_Method_Code;
              // DECISION(v1.19.346): Use salesperson code from BC project card OR from the project's
              // bcSalespersonCode (set via the Sales dropdown in PanelListView). BC card may not always
              // have Person_Responsible populated even when the dropdown was set.
              const spCode=bc.Person_Responsible||bc.CCS_Salesperson_Code||proj.bcSalespersonCode||"";
              if(spCode&&!proj.bcSalespersonCode){
                proj={...proj,bcSalespersonCode:spCode};
              }
              if(spCode&&(!q.salesperson||q.salesperson===spCode||/^S-/i.test(q.salesperson||""))){
                // Resolve salesperson name — try published Salesperson OData page first, then SalesOrders fallback
                let spResolved=false;
                const spPageNames=["Salesperson_Purchaser","SalespersonPurchaser","Salesperson","Salesperson_Card","SalespersonCard"];
                for(const spn of spPageNames){
                  try{
                    const spR=await fetch(`${BC_ODATA_BASE}/${spn}?$filter=Code eq '${spCode}'&$select=Code,Name,E_Mail,Phone_No&$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
                    if(spR.ok){
                      const spRec=((await spR.json()).value||[])[0];
                      if(spRec){
                        if(spRec.Name)autoFields.salesperson=spRec.Name;
                        if(!q.salesEmail&&spRec.E_Mail)autoFields.salesEmail=spRec.E_Mail;
                        if(!q.salesPhone&&spRec.Phone_No)autoFields.salesPhone=spRec.Phone_No;
                        spResolved=true;break;
                      }
                    }
                  }catch(e){}
                }
                if(!spResolved){
                  // Fallback: SalesOrdersBySalesPerson (only has name, no phone/email)
                  try{
                    const spR=await fetch(`${BC_ODATA_BASE}/SalesOrdersBySalesPerson?$filter=SalesPersonCode eq '${spCode}'&$select=SalesPersonCode,SalesPersonName&$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
                    if(spR.ok){const spName=((await spR.json()).value||[])[0]?.SalesPersonName||"";if(spName)autoFields.salesperson=spName;}
                  }catch(e){}
                }
                if(!autoFields.salesperson&&!q.salesperson)autoFields.salesperson=spCode;
                // Load cached salesperson info from Firestore
                try{
                  const spDoc=await fbDb.doc(`${_appCtx.configPath||"users/"+uid+"/config"}/salespersonInfo`).get();
                  if(spDoc.exists){
                    const spInfo=(spDoc.data().people||{})[spCode];
                    if(spInfo){
                      if(!q.salesPhone&&spInfo.phone)autoFields.salesPhone=spInfo.phone;
                      if(!q.salesEmail&&spInfo.email)autoFields.salesEmail=spInfo.email;
                    }
                  }
                }catch(e){}
              }
            }
          }
        }
      }catch(e){console.warn("BC project card fetch for quote failed:",e);}
    }
    if(Object.keys(autoFields).length){
      proj={...proj,quote:{...q,...autoFields}};
      setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);
    }
    const now=Date.now();
    const staleMs=60*24*60*60*1000;
    const allBom=(projectRef.current.panels||[]).flatMap(p=>p.bom||[]);
    const warn=[];
    allBom.forEach(r=>{
      if(r.isLaborRow||r.customerSupplied)return;
      if(/matrix\s*systems/i.test(r.bcVendorName||"")||/^job.?buyoff$/i.test(r.partNumber||"")||/crate/i.test(r.description||"")||r.isContingency)return;
      const zeroCost=(r.unitPrice===0||r.unitPrice==null)&&r.priceSource!=="manual";
      const aiPrice=r.priceSource==="ai";
      const isBC=r.priceSource==="bc"&&"bcPoDate"in r;
      const noPo=isBC&&!r.bcPoDate;
      const dt=isBC?r.bcPoDate:r.priceDate;
      const stale=dt&&dt<now-staleMs&&!zeroCost&&!aiPrice&&!noPo;
      const reason=zeroCost?"ZERO":aiPrice?"AI":noPo?"NoPO":stale?"OLD":null;
      if(reason)warn.push({...r,_warnReason:reason});
    });
    // Check for unanswered engineering questions
    const openEqs=(projectRef.current.panels||[]).flatMap(p=>(p.engineeringQuestions||[]).filter(q=>q.status==="open"));
    if(openEqs.length>0){setEqWarnOpen(openEqs);if(warn.length>0)setEqWarnPriceRows(warn);return;}
    if(warn.length>0){setQuoteWarnRows(warn);}
    else{await verifyBcLineCount();}
  }

  async function verifyBcLineCount(){
    const proj=projectRef.current;
    const bcNum=proj.bcProjectNumber;
    if(!_bcToken)try{await acquireBcToken(false);}catch(e){}
    if(!bcNum){setAutoPrint(true);setView("quote");return;}
    if(!_bcToken){
      // No BC token but project has BC number — still show upload prompt if previously uploaded
      const hasUpload=(proj.panels||[]).some(p=>p.bcPdfAttached);
      if(hasUpload||bcNum){setShowBcUploadPrompt(true);return;}
      setAutoPrint(true);setView("quote");return;
    }
    try{
      const allPages=await bcDiscoverODataPages();
      const planPage=allPages.find(p=>/^project.?planning/i.test(p))||allPages.find(p=>/job.?planning/i.test(p));
      if(!planPage){setAutoPrint(true);setView("quote");return;}
      let FP_NO="Project_No";
      const pr=await fetch(`${BC_ODATA_BASE}/${planPage}?$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(pr.ok){const pd=await pr.json();const rec=(pd.value||[])[0];if(rec&&"Job_No"in rec&&!("Project_No"in rec))FP_NO="Job_No";}
      const allBom=(proj.panels||[]).flatMap(p=>(p.bom||[]).filter(r=>!r.isLaborRow));
      // Check all panel tasks
      let totalBcBom=0;const allMissing=[];
      for(let i=0;i<(proj.panels||[]).length;i++){
        const n=i+1,taskNo=String(20000+n*100+10);
        const bcR=await fetch(`${BC_ODATA_BASE}/${planPage}?$filter=${FP_NO} eq '${bcNum}' and ${FP_NO==="Project_No"?"Project_Task_No":"Job_Task_No"} eq '${taskNo}'&$select=Line_No,No`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!bcR.ok)continue;
        const bcLines=(await bcR.json()).value||[];
        const bcBomLines=bcLines.filter(l=>l.Line_No>=60000);
        totalBcBom+=bcBomLines.length;
        const bcNos=new Set(bcBomLines.map(l=>(l.No||'').trim().toUpperCase()));
        const panelBom=(proj.panels[i].bom||[]).filter(r=>!r.isLaborRow);
        panelBom.forEach(r=>{if(!bcNos.has((r.partNumber||'').trim().toUpperCase()))allMissing.push({pn:r.partNumber,desc:r.description});});
      }
      if(allMissing.length>0){setBcCountMismatch({arcCount:allBom.length,bcCount:totalBcBom,missing:allMissing});return;}
    }catch(e){console.warn("BC line count check failed:",e);}
    // All checks passed — show BC upload prompt only if current revision hasn't been uploaded yet
    // Skip if no panels have drawing pages (nothing to upload)
    const hasDrawings=(proj.panels||[]).some(p=>(p.pages||[]).length>0);
    if(!hasDrawings){setAutoPrint(true);setView("quote");return;}
    const currentRev=proj.quoteRev||0;
    const alreadyUploaded=(proj.panels||[]).every(p=>(p.bcUploadQuoteRev||0)>=currentRev);
    if(bcNum&&_bcToken&&!alreadyUploaded){setShowBcUploadPrompt(true);return;}
    if(!alreadyUploaded){const hasUpload=(proj.panels||[]).some(p=>p.bcPdfAttached);if(hasUpload){setShowBcUploadPrompt(true);return;}}
    setAutoPrint(true);setView("quote");
  }

  function onRfqPrint(groups){
    setRfqGroups(groups);
    setAutoPrintRfq(true);
  }

  function onRfqSent(sentItemIds){
    const sentSet=new Set(sentItemIds);
    const now=Date.now();
    const updatedPanels=(projectRef.current.panels||[]).map(panel=>({
      ...panel,
      bom:(panel.bom||[]).map(row=>sentSet.has(row.id)?{...row,rfqSentDate:now}:row)
    }));
    update({...projectRef.current,panels:updatedPanels});
  }

  const [quoteReview,setQuoteReview]=useState(null); // null | {submission, matches:[{bomRow,supplierItem,action}]}
  const [varianceProcessing,setVarianceProcessing]=useState(false);

  async function applyPortalPrices(submission){
    // Build a review screen: match supplier items to BOM rows
    const items=(submission.lineItems||[]).filter(item=>(item.partNumber||'').trim()||(item.unitPrice!=null)||(item.description||'').trim());
    submission={...submission,lineItems:items};
    const bomRows=(projectRef.current.panels||[]).flatMap(p=>(p.bom||[]).filter(r=>!r.isLaborRow));
    const bomIsEmpty=bomRows.length===0;

    // If BOM is empty, create BOM rows from supplier quote items first, then proceed to review
    if(bomIsEmpty&&items.length>0){
      const now=Date.now();
      const targetPanel=(projectRef.current.panels||[]).find(p=>p.id===selectedPanelId)||(projectRef.current.panels||[])[0];
      if(targetPanel){
        const newBomRows=items.filter(si=>!si.cannotSupply&&(si.partNumber||"").trim()).map((si,i)=>{
          const pn=stripMfrPrefix((si.partNumber||"").trim());
          return{
            id:now+i+Math.random(),
            qty:si.qty||1,
            partNumber:pn,
            description:(si.description||"").trim(),
            manufacturer:si.manufacturer||"",
            notes:si.notes||"",
            unitPrice:si.unitPrice||0,
            priceSource:"bc",
            priceDate:now,
            bcPoDate:now,
            bcVendorName:submission.vendorName||""
          };
        });
        const updatedPanels=(projectRef.current.panels||[]).map(p=>{
          if(p.id!==targetPanel.id)return p;
          return{...p,bom:[...(p.bom||[]),...newBomRows],status:"extracted"};
        });
        const updatedProject={...projectRef.current,panels:updatedPanels};
        update(updatedProject);
        // Now try to match each new row to BC items and flag unmatched for creation
        const unmatchedForBc=[];
        for(const row of newBomRows){
          const bcItem=await bcLookupItemForQuote((row.partNumber||"").trim()).catch(()=>null);
          if(!bcItem){unmatchedForBc.push(row);}
        }
        if(unmatchedForBc.length>0){
          alert(`${newBomRows.length} item${newBomRows.length!==1?"s":""} added to BOM from ${submission.vendorName||"supplier"} quote.\n\n${unmatchedForBc.length} item${unmatchedForBc.length!==1?"s":""} not found in BC — use the BC Item Browser (🔍) on each row to create them.`);
        }else{
          alert(`${newBomRows.length} item${newBomRows.length!==1?"s":""} added to BOM from ${submission.vendorName||"supplier"} quote. All items matched in BC.`);
        }
      }
      return;
    }

    // Auto-match: for each supplier item with a price, find the BOM row it belongs to
    const matches=[];
    const usedBomIds=new Set();
    for(const si of items){
      if(si.cannotSupply)continue;
      const siPN=normPart(si.partNumber);
      const siSPN=normPart(si.supplierPartNumber);
      // Try exact match on matrix PN
      let bomRow=bomRows.find(r=>!usedBomIds.has(r.id)&&normPart(r.partNumber)===siPN);
      // Try fuzzy match
      if(!bomRow)bomRow=bomRows.find(r=>!usedBomIds.has(r.id)&&partMatch(normPart(r.partNumber),siPN));
      // Try match on supplier PN against BOM
      if(!bomRow&&siSPN)bomRow=bomRows.find(r=>!usedBomIds.has(r.id)&&partMatch(normPart(r.partNumber),siSPN));

      const isVariance=bomRow&&si.supplierPartNumber&&normPart(stripMfrPrefix(si.supplierPartNumber))!==normPart(bomRow.partNumber)&&normPart(si.supplierPartNumber)!==normPart(bomRow.partNumber);
      if(bomRow)usedBomIds.add(bomRow.id);
      matches.push({
        supplierItem:si,
        bomRowId:bomRow?.id||null,
        bomPartNumber:bomRow?.partNumber||null,
        bomDescription:bomRow?.description||null,
        isVariance:isVariance||false,
        action:bomRow&&si.unitPrice!=null?"apply":"skip", // default action
      });
    }
    // Add unmatched BOM rows (requested but supplier didn't price)
    const unmatchedBom=bomRows.filter(r=>!usedBomIds.has(r.id));

    setQuoteReview({submission,matches,unmatchedBom});
  }

  async function doApplyPortalPrices(submission){
    try{
    // Save cannot-supply records to Firestore for future tracking
    const cantItems=(submission.lineItems||[]).filter(item=>item.cannotSupply&&item.partNumber);
    if(cantItems.length>0){
      const records=cantItems.map(item=>({
        vendorName:submission.vendorName||'',
        partNumber:(item.partNumber||'').trim(),
        description:item.description||'',
        markedAt:Date.now(),
        rfqNum:submission.rfqNum||'',
      }));
      fbDb.doc(`users/${uid}/config/supplierCantSupply`).set({records:firebase.firestore.FieldValue.arrayUnion(...records)},{merge:true}).catch(e=>console.warn("supplierCantSupply save failed:",e));
    }
    // Save confirmed supplier PN → Matrix PN crossings to sqCrossings for future auto-matching
    const crossings=submission.confirmedCrossings||[];
    if(crossings.length>0){
      const crossData={};
      crossings.forEach(c=>{
        const key=c.supplierPartNumber.toLowerCase().trim();
        crossData[key]={bcItemNumber:c.matrixPartNumber,bcItemDescription:c.description||'',confirmedAt:Date.now(),source:'supplier_portal'};
      });
      fbDb.doc(`users/${uid}/config/sqCrossings`).set(crossData,{merge:true}).catch(e=>console.warn("sqCrossings save failed:",e));
      console.log('PORTAL CROSSINGS: saved',crossings.length,'confirmed supplier→Matrix part crossings');
    }
    // Build normalized part# → price map (skip cannot-supply items)
    const priceMap={};
    (submission.lineItems||[]).forEach(item=>{
      if(item.cannotSupply)return;
      if(item.unitPrice!=null&&item.partNumber){
        priceMap[normPart(item.partNumber)]={price:item.unitPrice,partNumber:(item.partNumber||'').trim(),uom:item.uom||''};
      }
    });
    const now=Date.now();
    // Use BC vendor number from rfqUpload doc (set when RFQ was sent), fall back to fuzzy match
    let vendorNo=submission.vendorNumber||null;
    if(!vendorNo&&_bcToken&&submission.vendorName){
      try{
        const vendors=await bcListVendors();
        const svName=(submission.vendorName||'').toLowerCase().trim();
        const svWords=svName.replace(/[^a-z0-9]/g,' ').split(/\s+/).filter(w=>w.length>2);
        const vMatch=vendors.find(v=>v.displayName===submission.vendorName)
          ||vendors.find(v=>(v.displayName||'').toLowerCase().includes(svName))
          ||vendors.find(v=>svName.includes((v.displayName||'').toLowerCase()))
          ||vendors.find(v=>{const vWords=(v.displayName||'').toLowerCase().replace(/[^a-z0-9]/g,' ').split(/\s+/).filter(w=>w.length>2);return svWords.some(sw=>vWords.some(vw=>vw.includes(sw)||sw.includes(vw)));});
        if(vMatch)vendorNo=vMatch.number;
      }catch(e){console.warn("Vendor lookup for portal prices failed:",e);}
    }
    if(vendorNo)console.log("applyPortalPrices: vendor",vendorNo,submission.vendorName);
    // Push each price (and vendor if resolved) to BC item card
    const bcPushes=Object.values(priceMap).map(({price,partNumber})=>{
      const patch={Unit_Cost:price};
      if(vendorNo)patch.Vendor_No=vendorNo;
      return bcPatchItemOData(partNumber,patch).catch(e=>console.warn("BC price push failed:",partNumber,e));
    });
    await Promise.all(bcPushes);
    // Push Purchase Prices to BC (vendor, direct unit cost, starting date = priced date)
    if(vendorNo&&_bcToken){
      const ppResults=await Promise.all(Object.values(priceMap).map(async({price,partNumber,uom})=>{
        try{return await bcPushPurchasePrice(partNumber,vendorNo,price,now,uom);}
        catch(e){console.warn("BC purchase price push failed:",partNumber,e);return{ok:false,reason:'error'};}
      }));
      const missingItems=ppResults.filter(r=>r&&r.reason==='item_not_found').map(r=>r.itemNo);
      if(missingItems.length>0){
        setTimeout(()=>alert(`${missingItems.length} item${missingItems.length>1?'s':''} not found in BC:\n${missingItems.join(', ')}\n\nUse the "Upload Supplier Quote" tool in Settings to create these items in BC first, then re-apply.`),200);
      }
    }
    // Apply to BOM — priceSource:'bc', bcPoDate:now so rows don't get flagged
    let matched=0;
    const updatedPanels=(projectRef.current.panels||[]).map(panel=>({
      ...panel,
      bom:(panel.bom||[]).map(row=>{
        const nk=normPart(row.partNumber);
        // Try exact normalized match first, then fuzzy contains/prefix match
        let hit=priceMap[nk];
        if(!hit){
          const supplierKey=Object.keys(priceMap).find(sk=>partMatch(nk,sk));
          if(supplierKey)hit=priceMap[supplierKey];
        }
        if(hit){
          matched++;
          return{...row,unitPrice:hit.price,priceSource:'bc',priceDate:now,bcPoDate:now,bcVendorName:submission.vendorName||row.bcVendorName};
        }
        return row;
      })
    }));
    update({...projectRef.current,panels:updatedPanels});
    // Attach supplier quote PDF to BC project
    const bcNum=projectRef.current.bcProjectNumber;
    if(bcNum&&_bcToken&&submission.storageUrl){
      try{
        const pdfResp=await fetch(submission.storageUrl);
        if(pdfResp.ok){
          const pdfBytes=await pdfResp.arrayBuffer();
          const vc=typeof vendorCode==="function"?vendorCode(submission.vendorName):(submission.vendorName||"SUPPLIER").slice(0,10).toUpperCase();
          const dateStr=new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"2-digit"}).replace(/\//g,"-");
          const quotePdfName=`QTE_S-[SUPPLIER QUOTE] ${vc} - ${submission.rfqNum||"RFQ"} - ${dateStr}.pdf`;
          await bcAttachPdfQueued(bcNum,quotePdfName,pdfBytes);
          console.log("Supplier quote PDF attached to BC:",quotePdfName);
        }
      }catch(e){console.warn("Failed to attach supplier quote to BC:",e);}
    }
    const cantCount=cantItems.length;
    alert(`Prices applied to ${matched} BOM row${matched!==1?'s':''} and pushed to BC Item Cards.${vendorNo?`\nVendor ${submission.vendorName} set on all matched items.\nPurchase Prices updated in BC.`:''}\nBC planning lines will auto-sync in a few seconds.${cantCount>0?`\n${cantCount} item${cantCount!==1?'s':''} marked "Cannot Supply" by vendor — skipped and recorded.`:''}\nSupplier quote PDF attached to BC project.`);
    }catch(e){
      console.error("applyPortalPrices error:",e);
      alert("Error applying prices: "+e.message+"\nPrices may have been partially applied. Check console for details.");
    }
    // Always close modal and mark as imported
    fbDb.collection('rfqUploads').doc(submission.id).update({status:'imported',importedAt:Date.now()}).catch(()=>{});
    setShowPortalModal(false);
  }

  // Auto-print RFQ
  useEffect(()=>{
    if(autoPrintRfq&&rfqGroups){
      const t=setTimeout(()=>{
        document.body.dataset.printTarget="rfq";
        window.print();
        delete document.body.dataset.printTarget;
        setAutoPrintRfq(false);setRfqGroups(null);
      },400);
      return()=>clearTimeout(t);
    }
  },[autoPrintRfq,rfqGroups]);

  return(
    <>
      {view==="quote"?(
        <div style={autoPrint?{height:0,overflow:"hidden"}:undefined}>
          <QuoteView project={project} uid={uid} onBack={()=>setView("panels")} onUpdate={update}/>
        </div>
      ):(
        <>
          <PanelListView
            project={project}
            uid={uid}
            readOnly={readOnly}
            onBack={onBack}
            onViewQuote={handlePrintQuote}
            onPrintRfq={onPrintRfq}
            onSendRfqEmails={onSendRfqEmails}
            onShowRfqHistory={()=>setShowRfqHistory(true)}
            rfqLoading={rfqLoading}
            onUpdate={update}
            onDelete={onDelete}
            onTransfer={onTransfer}
            onCopy={onCopy}
            onOpenSupplierQuote={(bom,panelId)=>{if(portalSubmissions.length>0){setShowPortalModal(true);}else{setSqPanelBom(bom);setSqPanelId(panelId||null);setShowSqModal(true);}}}
            pendingRfqUploads={pendingRfqUploads}
            onPoReceived={()=>setShowPoModal(true)}
            relinking={relinking}
            relinkMsg={relinkMsg}
            onRelink={relinkToBC}
            bcUploadRef={bcUploadRef}
          />
          {rfqGroups&&<div style={{height:0,overflow:"hidden"}}><RfqDocument groups={rfqGroups} projectName={project.name}/></div>}
          {quoteSendModal&&ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:10,padding:"24px 28px",width:"95%",maxWidth:560,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
                <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:12}}>✉ Send Quote</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div>
                    <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>To</label>
                    <input value={quoteSendModal.to} onChange={e=>setQuoteSendModal(prev=>({...prev,to:e.target.value}))} style={{...inp({fontSize:13})}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>Subject</label>
                    <input value={quoteSendModal.subject} onChange={e=>setQuoteSendModal(prev=>({...prev,subject:e.target.value}))} style={{...inp({fontSize:13})}}/>
                  </div>
                  <div>
                    <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:0.8,color:C.muted,marginBottom:3,display:"block"}}>Message</label>
                    <textarea value={quoteSendModal.message} onChange={e=>setQuoteSendModal(prev=>({...prev,message:e.target.value}))} rows={5} style={{...inp({fontSize:13,resize:"vertical",lineHeight:1.6})}}/>
                  </div>
                  <div style={{background:"#0a0a18",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",fontSize:11,color:C.muted,lineHeight:1.5,whiteSpace:"pre-line"}}>
                    {quoteSendModal.signature}
                  </div>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
                  <button onClick={()=>setQuoteSendModal(null)} style={btn("#1a1a2a",C.muted,{fontSize:13,border:`1px solid ${C.border}`})}>Cancel</button>
                  <button onClick={async()=>{
                    const m=quoteSendModal;
                    if(!m.to.trim()){alert("Enter a recipient email.");return;}
                    const graphToken=await acquireGraphToken();
                    if(!graphToken){alert("Could not get Microsoft 365 token.");return;}
                    const sig=m.signature.split("\n").filter(Boolean).join("<br/>");
                    const html=`<div style="font-family:-apple-system,sans-serif;font-size:14px;color:#1e293b;line-height:1.7">${m.message.split("\n").map(l=>l.trim()?`<p>${l}</p>`:"<br/>").join("")}<p style="margin-top:16px">Best regards,<br/>${sig}</p></div>`;
                    try{
                      const jsPDF=await ensureJsPDF();
                      const pdfDoc=new jsPDF({unit:"mm",format:"letter"});
                      await buildQuotePdfDoc(pdfDoc,project);
                      const pdfBase64=pdfDoc.output("datauristring").split(",")[1];
                      const qq=project.quote||{};
                      const rev=project.quoteRev||0;
                      const co=(qq.company||project.bcCustomerName||"Customer").replace(/[^a-zA-Z0-9&\s-]/g,"").trim();
                      const pn=(project.name||"Project").replace(/[^a-zA-Z0-9&\s-]/g,"").trim();
                      const pdfName=`QTE_C-[${qq.number||"Quote"} Rev ${String(rev).padStart(2,"0")}] - ${co} - ${pn}.pdf`;
                      await sendGraphEmail(graphToken,m.to,m.subject,html,pdfBase64,pdfName);
                      const upd={...project,quoteSentAt:Date.now(),quoteSentRev:rev,quoteSentTo:m.to};
                      onUpdate(upd);
                      if(project.bcProjectNumber&&_bcToken){
                        bcAttachPdfToJob(project.bcProjectNumber,pdfName,pdfDoc.output("arraybuffer"),null).catch(e=>console.warn("[QUOTE] BC upload on send failed:",e.message));
                      }
                      setQuoteSendModal(null);
                      alert("Quote sent to "+m.to);
                    }catch(e){alert("Send failed: "+e.message);}
                  }} style={btn("#0c2233","#38bdf8",{fontSize:13,fontWeight:700,border:"1px solid #38bdf8"})}>✉ Send</button>
                </div>
              </div>
            </div>
          ,document.body)}
          {rfqEmailModal&&<RfqEmailModal groups={rfqEmailModal.groups} projectName={rfqEmailModal.projectName} projectId={project.id} bcProjectNumber={project.bcProjectNumber||""} uid={uid} userEmail={fbAuth.currentUser?.email||""} onClose={()=>setRfqEmailModal(null)} onSent={onRfqSent} onPrint={onRfqPrint} onApiPriced={(vendorName,vendorNo,results)=>{
            // Apply API-fetched prices to BOM rows — use source from cross-vendor check
            const panels=[...(projectRef.current.panels||[])];
            let applied=0;
            panels.forEach((p,pi)=>{
              const bom=(p.bom||[]).map(r=>{
                if(r.isLaborRow)return r;
                const pn=(r.partNumber||"").trim().toUpperCase();
                const match=results.find(res=>(res.partNumber||"").trim().toUpperCase()===pn);
                if(match&&match.price>0){
                  applied++;
                  return{...r,unitPrice:match.price,priceDate:Date.now(),priceSource:"bc",bcVendorName:match.source||vendorName,bcVendorNo:vendorNo};
                }
                return r;
              });
              panels[pi]={...p,bom};
            });
            if(applied>0)update({...projectRef.current,panels});
          }} onApiAlternates={async(altSources)=>{
            // Write alternate vendor prices to BC Purchase Prices
            if(!_bcToken)return;
            try{
              // Fetch all vendors from BC to resolve names → numbers
              const compId=await bcGetCompanyId();
              const vr=await fetch(`${BC_API_BASE}/companies(${compId})/vendors?$select=number,displayName&$top=500`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
              const vendors=vr.ok?(await vr.json()).value||[]:[];
              for(const alt of altSources){
                if(!alt.chosenPrice||alt.chosenPrice<=0)continue;
                try{
                  const altVendor=vendors.find(v=>(v.displayName||"").toLowerCase().includes((alt.chosenSource||"").toLowerCase()));
                  if(altVendor){
                    await bcPushPurchasePrice(alt.partNumber,altVendor.number,alt.chosenPrice,Date.now(),"EA");
                    console.log(`[API] Wrote alternate price for ${alt.partNumber}: ${alt.chosenSource} $${alt.chosenPrice} (vendor ${altVendor.number})`);
                  }else{console.warn(`[API] Vendor not found in BC for "${alt.chosenSource}"`);}
                }catch(e){console.warn(`[API] Failed to write alternate price for ${alt.partNumber}:`,e.message);}
              }
            }catch(e){console.warn("[API] Failed to fetch vendors for alternate pricing:",e.message);}
          }}/>}
          {showRfqHistory&&<RfqHistoryModal uid={uid} onClose={()=>setShowRfqHistory(false)}/>}
          {showPoModal&&<PoReceivedModal project={project} bcProjectNumber={project.bcProjectNumber||""} onClose={()=>setShowPoModal(false)} onDone={async(poNum)=>{
            setShowPoModal(false);
            const firstPanel=(projectRef.current.panels||[])[0];
            const dueDate=firstPanel?.requestedShipDate||"";
            const updated={...projectRef.current,bcPoStatus:"Open",bcPoNumber:poNum,updatedAt:Date.now()};
            setProject(updated);projectRef.current=updated;onChange&&onChange(updated);
            try{await saveProject(uid,updated);}catch(e){console.warn("PO save failed:",e);}
            // Prompt to upload production drawings
            setShowProductionUpload({poNumber:poNum,dueDate});
          }}/>}
          {showPriceCheckModal&&priceCheckDiffs&&<PurchasePriceCheckModal diffs={priceCheckDiffs} onAccept={applyPriceCheckDiffs} onClose={()=>{setShowPriceCheckModal(false);setPriceCheckDiffs(null);}}/>}
          {showPortalModal&&<PortalSubmissionsModal submissions={portalSubmissions} onClose={()=>setShowPortalModal(false)} onApplyPrices={applyPortalPrices} onImportPdf={()=>{setShowPortalModal(false);setSqPanelBom((projectRef.current.panels||[])[0]?.bom||[]);setShowSqModal(true);}}/>}
          {quoteReview&&ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:"#0d0d1a",border:`1px solid ${C.accent}`,borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:900,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexShrink:0}}>
                  <span style={{fontSize:22}}>📥</span>
                  <div>
                    <div style={{fontSize:15,fontWeight:800,color:C.text}}>Review Supplier Quote — {quoteReview.submission.vendorName}</div>
                    <div style={{fontSize:12,color:C.muted}}>{quoteReview.matches.length} supplier items · {quoteReview.matches.filter(m=>m.action==="apply").length} matched · {quoteReview.unmatchedBom.length} BOM items without pricing</div>
                  </div>
                  <button onClick={()=>setQuoteReview(null)} style={{marginLeft:"auto",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>✕</button>
                </div>
                <div style={{fontSize:12,color:C.sub,marginBottom:10,lineHeight:1.6,flexShrink:0}}>
                  Review each line. Toggle "Apply" to include/exclude. For mismatched items, select the correct BOM row from the dropdown.
                </div>
                <div style={{flex:1,overflowY:"auto",marginBottom:12}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead style={{position:"sticky",top:0,zIndex:1}}><tr style={{background:"#111128"}}>
                      <th style={{padding:"6px 8px",textAlign:"center",color:C.muted,fontWeight:700,width:50}}>Action</th>
                      <th style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:700}}>Supplier Item</th>
                      <th style={{padding:"6px 8px",textAlign:"right",color:C.muted,fontWeight:700,width:70}}>Price</th>
                      <th style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:700}}>→ BOM Match</th>
                      <th style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:700,width:80}}>Status</th>
                    </tr></thead>
                    <tbody>
                      {quoteReview.matches.map((m,i)=>{
                        const si=m.supplierItem;
                        const isApply=m.action==="apply";
                        const bomRows=(projectRef.current.panels||[]).flatMap(p=>(p.bom||[]).filter(r=>!r.isLaborRow));
                        return(
                        <tr key={i} style={{borderTop:`1px solid ${C.border}33`,background:isApply?"rgba(34,197,94,0.04)":si.cannotSupply?"rgba(239,68,68,0.04)":"transparent",opacity:si.cannotSupply?0.5:1}}>
                          <td style={{padding:"6px 8px",textAlign:"center"}}>
                            {!si.cannotSupply&&si.unitPrice!=null&&<input type="checkbox" checked={isApply} onChange={e=>{
                              setQuoteReview(prev=>({...prev,matches:prev.matches.map((mm,j)=>j===i?{...mm,action:e.target.checked?"apply":"skip"}:mm)}));
                            }} style={{accentColor:C.green,cursor:"pointer"}}/>}
                            {si.cannotSupply&&<span style={{color:C.red,fontSize:10,fontWeight:700}}>N/A</span>}
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            <div style={{fontFamily:"monospace",fontWeight:600,color:C.text,fontSize:12}}>{si.partNumber||"—"}</div>
                            {si.supplierPartNumber&&si.supplierPartNumber!==si.partNumber&&<div style={{fontSize:10,color:"#a78bfa"}}>Supplier PN: {si.supplierPartNumber}</div>}
                            <div style={{fontSize:10,color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{si.description||""}</div>
                            {si.supplierNote&&<div style={{fontSize:10,color:C.yellow,fontStyle:"italic"}}>Note: {si.supplierNote}</div>}
                          </td>
                          <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,color:si.unitPrice!=null?C.green:C.muted,fontVariantNumeric:"tabular-nums"}}>
                            {si.unitPrice!=null?"$"+Number(si.unitPrice).toFixed(2):si.cannotSupply?"N/A":"—"}
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            <select value={m.bomRowId||""} onChange={e=>{
                              const newId=e.target.value||null;
                              const newRow=newId?bomRows.find(r=>r.id==newId):null;
                              setQuoteReview(prev=>({...prev,matches:prev.matches.map((mm,j)=>j===i?{...mm,bomRowId:newId,bomPartNumber:newRow?.partNumber||null,bomDescription:newRow?.description||null,action:newId&&si.unitPrice!=null?"apply":"skip",isVariance:newId&&normPart(stripMfrPrefix(si.partNumber||""))!==normPart(newRow?.partNumber||"")&&normPart(si.partNumber||"")!==normPart(newRow?.partNumber||"")}:mm)}));
                            }} style={{background:"#1e293b",border:`1px solid ${m.isVariance?C.yellow:m.bomRowId?C.green:C.border}`,borderRadius:4,color:C.text,fontSize:11,padding:"3px 5px",width:"100%",maxWidth:200}}>
                              <option value="">— No match —</option>
                              {bomRows.map(r=><option key={r.id} value={r.id}>{r.partNumber} — {(r.description||"").slice(0,30)}</option>)}
                            </select>
                            {m.isVariance&&<div style={{fontSize:9,color:C.yellow,marginTop:2}}>⚠ Cross: {m.bomPartNumber} → {si.partNumber||si.supplierPartNumber}</div>}
                          </td>
                          <td style={{padding:"6px 8px"}}>
                            {si.cannotSupply?<span style={{fontSize:10,fontWeight:700,color:C.red}}>Cannot Supply</span>
                            :isApply?<span style={{fontSize:10,fontWeight:700,color:m.isVariance?C.yellow:C.green}}>{m.isVariance?"Cross & Apply":"Apply"}</span>
                            :!m.bomRowId&&si.unitPrice!=null?<button onClick={async()=>{
                              // Close review, add placeholder to BOM — strip MFR prefix
                              const pn=stripMfrPrefix(si.supplierPartNumber||si.partNumber||"");
                              const newId=Date.now()+Math.random();
                              const newRow={id:newId,qty:si.qty||1,partNumber:pn.trim().toUpperCase(),description:si.description||"",manufacturer:"",notes:"",unitPrice:si.unitPrice||0};
                              const panel=(projectRef.current.panels||[])[0];
                              if(panel){
                                const bom=[...(panel.bom||[])];
                                const tailIdx=bom.findIndex(r=>!r.isLaborRow&&(/^job.?buyoff$/i.test(r.partNumber)||/^crat(e|ing)$/i.test((r.description||"").trim())||CONTINGENCY_PNS.has((r.partNumber||"").trim().toUpperCase())));
                                if(tailIdx>=0)bom.splice(tailIdx,0,newRow);else bom.push(newRow);
                                const updatedPanel={...panel,bom};
                                const updatedPanels=(projectRef.current.panels||[]).map(p=>p.id===panel.id?updatedPanel:p);
                                update({...projectRef.current,panels:updatedPanels});
                                saveProjectPanel(uid,projectRef.current.id,panel.id,updatedPanel,true).catch(()=>{});
                              }
                              setQuoteReview(null);
                              alert(`Item "${pn}" added to BOM. Use the 🔍 icon on the BOM row to create it in BC with the proper setup fields.`);
                            }} style={{background:"#0d1a10",border:"1px solid #4ade8044",color:"#4ade80",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                              + Add to BOM
                            </button>
                            :<span style={{fontSize:10,fontWeight:700,color:C.muted}}>Skip</span>}
                          </td>
                        </tr>);
                      })}
                    </tbody>
                  </table>
                  {quoteReview.unmatchedBom.length>0&&<div style={{marginTop:10,padding:"8px 10px",background:"#1a0a0a",border:`1px solid ${C.red}44`,borderRadius:6}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:4}}>{quoteReview.unmatchedBom.length} BOM items not quoted by supplier:</div>
                    <div style={{fontSize:10,color:C.muted}}>{quoteReview.unmatchedBom.map(r=>r.partNumber||r.description).join(", ")}</div>
                  </div>}
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexShrink:0}}>
                  <button onClick={()=>setQuoteReview(null)} style={{background:"#1a1a2a",border:`1px solid ${C.border}`,color:C.muted,padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13}}>Cancel</button>
                  <button disabled={varianceProcessing} onClick={async()=>{
                    setVarianceProcessing(true);
                    // Build updated submission with only the "apply" matches
                    const toApply=quoteReview.matches.filter(m=>m.action==="apply"&&m.bomRowId);
                    // For crosses, update BOM part numbers first
                    const crosses=toApply.filter(m=>m.isVariance);
                    if(crosses.length>0){
                      const updatedPanels=(projectRef.current.panels||[]).map(p=>({...p,bom:(p.bom||[]).map(r=>{
                        const cross=crosses.find(c=>c.bomRowId===r.id);
                        if(cross)return{...r,partNumber:cross.supplierItem.partNumber||cross.supplierItem.supplierPartNumber,crossedFrom:cross.bomPartNumber,isCrossed:true};
                        return r;
                      })}));
                      update({...projectRef.current,panels:updatedPanels});
                    }
                    // Remap submission lineItems: replace partNumber with the matched BOM partNumber for proper apply
                    const remapped={...quoteReview.submission,lineItems:toApply.map(m=>({...m.supplierItem,partNumber:m.bomPartNumber||m.supplierItem.partNumber}))};
                    await doApplyPortalPrices(remapped);
                    setVarianceProcessing(false);
                    setQuoteReview(null);
                  }} style={{background:varianceProcessing?"#334155":C.accent,color:"#fff",border:"none",padding:"7px 18px",borderRadius:6,cursor:varianceProcessing?"wait":"pointer",fontSize:13,fontWeight:700}}>
                    {varianceProcessing?"Applying…":`Apply ${quoteReview.matches.filter(m=>m.action==="apply").length} Items to BOM`}
                  </button>
                </div>
              </div>
            </div>
          ,document.body)}
          {eqWarnOpen&&ReactDOM.createPortal(
            React.createElement("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
              React.createElement("div",{style:{background:"#0d0d1a",border:"1px solid #f59e0b",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:520,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}},
                React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:8}},
                  React.createElement("span",{style:{fontSize:22}},"❓"),
                  React.createElement("div",{style:{fontSize:15,fontWeight:800,color:"#fbbf24"}},"Unanswered Engineering Questions")
                ),
                React.createElement("div",{style:{fontSize:13,color:"#94a3b8",marginBottom:14,lineHeight:1.6}},
                  React.createElement("strong",{style:{color:"#f1f5f9"}},eqWarnOpen.length+" question"+(eqWarnOpen.length!==1?"s":""))," still need"+(eqWarnOpen.length===1?"s":"")+" answers before this quote is finalized. Printing without answering may result in an inaccurate or incomplete quote."
                ),
                React.createElement("div",{style:{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:6,maxHeight:200,overflowY:"auto",marginBottom:16}},
                  eqWarnOpen.map((q,i)=>React.createElement("div",{key:q.id||i,style:{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderBottom:i<eqWarnOpen.length-1?"1px solid #1a1a2e":"none",fontSize:12}},
                    React.createElement("span",{style:{color:q.severity==="critical"?"#ef4444":q.severity==="warning"?"#f59e0b":"#818cf8",fontWeight:700,fontSize:9,textTransform:"uppercase",minWidth:40,paddingTop:2}},q.severity),
                    React.createElement("span",{style:{color:C.text,flex:1,lineHeight:1.4}},q.question)
                  ))
                ),
                React.createElement("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
                  React.createElement("button",{onClick:()=>{setEqWarnOpen(null);setEqWarnPriceRows(null);},style:{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}},"Go Back"),
                  React.createElement("button",{onClick:()=>{setEqWarnOpen(null);if(eqWarnPriceRows){setQuoteWarnRows(eqWarnPriceRows);setEqWarnPriceRows(null);}else{verifyBcLineCount();}},style:{background:"#7c2d12",border:"1px solid #b45309",color:"#fbbf24",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}},"Acknowledge & Proceed")
                )
              )
            ),document.body
          )}
          {quoteWarnRows&&ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:"#0d0d1a",border:"1px solid #b45309",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:520,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:22}}>⚠️</span>
                  <div style={{fontSize:15,fontWeight:800,color:"#fbbf24"}}>Item Errors to Correct</div>
                </div>
                <div style={{fontSize:13,color:"#94a3b8",marginBottom:14,lineHeight:1.6}}>
                  {(()=>{const zero=quoteWarnRows.filter(r=>r._warnReason==="ZERO");const ai=quoteWarnRows.filter(r=>r._warnReason==="AI");const nopo=quoteWarnRows.filter(r=>r._warnReason==="NoPO");const old=quoteWarnRows.filter(r=>r._warnReason==="OLD");return(<>
                    {zero.length>0&&<div style={{marginBottom:4}}>• <strong style={{color:"#f1f5f9"}}>{zero.length} item{zero.length!==1?"s":""}</strong> with <strong style={{color:"#ef4444"}}>$0 cost</strong> — no pricing assigned.</div>}
                    {ai.length>0&&<div style={{marginBottom:4}}>• <strong style={{color:"#f1f5f9"}}>{ai.length} item{ai.length!==1?"s":""}</strong> with <strong style={{color:"#c084fc"}}>AI-estimated pricing</strong> — not confirmed from a real source.</div>}
                    {nopo.length>0&&<div style={{marginBottom:4}}>• <strong style={{color:"#f1f5f9"}}>{nopo.length} item{nopo.length!==1?"s":""}</strong> with <strong style={{color:"#fbbf24"}}>No POs</strong> — no purchase order pricing on record.</div>}
                    {old.length>0&&<div>• <strong style={{color:"#f1f5f9"}}>{old.length} item{old.length!==1?"s":""}</strong> with pricing <strong style={{color:"#fb923c"}}>older than 60 days</strong>.</div>}
                  </>);})()}
                </div>
                <div style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:6,maxHeight:180,overflowY:"auto",marginBottom:16}}>
                  {quoteWarnRows.map((r,i)=>(
                    <div key={r.id||i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 10px",borderBottom:i<quoteWarnRows.length-1?"1px solid #1a1a2e":"none",fontSize:12}}>
                      <span style={{color:r._warnReason==="ZERO"?"#ef4444":r._warnReason==="AI"?"#c084fc":r._warnReason==="NoPO"?"#fbbf24":"#fb923c",fontWeight:700,fontSize:10,minWidth:34}}>{r._warnReason==="ZERO"?"$0":r._warnReason}</span>
                      <span style={{color:"#fde68a",fontWeight:600,fontFamily:"monospace",minWidth:120}}>{r.partNumber||"—"}</span>
                      <span style={{color:"#94a3b8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description||""}</span>
                      <span style={{color:"#94a3b8",fontSize:10,whiteSpace:"nowrap"}}>{r.priceSource==="ai"?"ARC AI est.":r.bcPoDate||r.priceDate?new Date(r.bcPoDate||r.priceDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}):"no date"}</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Fix $0 items in the BC Item Browser, run <strong style={{color:"#f1f5f9"}}>Refresh Pricing</strong> for stale prices, or acknowledge and proceed.</div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setQuoteWarnRows(null)} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Cancel</button>
                  <button onClick={()=>{setQuoteWarnRows(null);verifyBcLineCount();}} style={{background:"#7c2d12",border:"1px solid #b45309",color:"#fbbf24",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>Acknowledge &amp; Proceed</button>
                </div>
              </div>
            </div>
          ,document.body)}
        </>
      )}
      <SupplierQuoteImportModal show={showSqModal} uid={uid} panelBom={sqPanelBom} bcProjectNumber={project.bcProjectNumber||null} projectId={init.id} onClose={()=>setShowSqModal(false)} onBomUpdate={(newRows)=>{
        const targetPanel=(projectRef.current.panels||[]).find(p=>p.id===sqPanelId)||(projectRef.current.panels||[])[0];
        if(!targetPanel)return;
        const updatedPanels=(projectRef.current.panels||[]).map(p=>{
          if(p.id!==targetPanel.id)return p;
          return{...p,bom:[...(p.bom||[]),...newRows],status:p.status==="draft"?"extracted":p.status};
        });
        update({...projectRef.current,panels:updatedPanels});
      }}/>
      {bcCountMismatch&&ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#0d0d1a",border:"1px solid #ef4444",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:520,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
              <span style={{fontSize:22}}>⚠️</span>
              <div style={{fontSize:15,fontWeight:800,color:"#ef4444"}}>BC Planning Lines Mismatch</div>
            </div>
            <div style={{fontSize:13,color:"#94a3b8",marginBottom:10,lineHeight:1.6}}>
              ARC has <strong style={{color:"#f1f5f9"}}>{bcCountMismatch.arcCount} BOM items</strong> but BC only has <strong style={{color:"#f1f5f9"}}>{bcCountMismatch.bcCount} planning lines</strong>. The following items are missing from BC:
            </div>
            <div style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:6,maxHeight:180,overflowY:"auto",marginBottom:16}}>
              {bcCountMismatch.missing.map((m,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 10px",borderBottom:i<bcCountMismatch.missing.length-1?"1px solid #1a1a2e":"none",fontSize:12}}>
                  <span style={{color:"#ef4444",fontWeight:700,fontSize:10,minWidth:34}}>MISSING</span>
                  <span style={{color:"#fde68a",fontWeight:600,fontFamily:"monospace",minWidth:120}}>{m.pn||"—"}</span>
                  <span style={{color:"#94a3b8",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.desc||""}</span>
                </div>
              ))}
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Click <strong style={{color:"#f1f5f9"}}>Sync BC</strong> on the BOM toolbar to push missing items, or proceed anyway.</div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button onClick={()=>setBcCountMismatch(null)} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Go Back</button>
              <button onClick={()=>{setBcCountMismatch(null);setShowBcUploadPrompt(true);}} style={{background:"#7c2d12",border:"1px solid #b45309",color:"#fbbf24",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>Proceed Anyway</button>
            </div>
          </div>
        </div>
      ,document.body)}
      {showBcUploadPrompt&&ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#0d0d1a",border:`1px solid ${C.accent}`,borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:520,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
            {(()=>{
              const firstPanel=(project.panels||[])[0];
              const rev=project.quoteRev||0;
              const isReUpload=rev>0&&firstPanel?.bcPdfAttached;
              const dwg=firstPanel?.drawingNo||"NoDWG";
              const revTag=rev>0?` REV ${String(rev).padStart(2,'0')}`:"";
              const fileName=`DWG-[AS-QUOTED${revTag}] ${dwg} - ${project.bcProjectNumber||"NoProject"}.pdf`;
              return(<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <span style={{fontSize:22}}>{isReUpload?"⚠️":"✅"}</span>
                  <div style={{fontSize:15,fontWeight:800,color:isReUpload?"#fbbf24":"#22c55e"}}>{isReUpload?"BOM Changed Since Last Upload":"All BOM Items Verified"}</div>
                </div>
                <div style={{fontSize:13,color:"#94a3b8",marginBottom:14,lineHeight:1.6}}>
                  {isReUpload
                    ?"The BOM has changed since the last drawing package was uploaded to BC. Would you like to upload a new version?"
                    :"Would you like to push the drawing package to Business Central as the quoted version?"}
                </div>
                <div style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:6,padding:"10px 14px",marginBottom:16}}>
                  <div style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>File</div>
                  <div style={{fontSize:13,color:C.accent,fontWeight:700,fontFamily:"monospace"}}>{fileName}</div>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>{setShowBcUploadPrompt(false);setAutoPrint(true);setView("quote");}}
                    style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
                    Skip & Print
                  </button>
                  <button disabled={bcUploading} onClick={async()=>{
                    setBcUploading(true);
                    try{
                      if(bcUploadRef.current){await bcUploadRef.current();console.log("BC upload completed via ref");}
                      else console.warn("BC upload skipped — bcUploadRef.current is null");
                    }catch(e){console.warn("BC upload failed:",e);}
                    setBcUploading(false);
                    setShowBcUploadPrompt(false);
                    setAutoPrint(true);setView("quote");
                  }}
                    style={{background:bcUploading?"#334155":"#166534",border:`1px solid ${bcUploading?"#475569":"#22c55e"}`,color:bcUploading?"#94a3b8":"#4ade80",padding:"7px 18px",borderRadius:6,cursor:bcUploading?"wait":"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>
                    {bcUploading?"Uploading…":isReUpload?"Upload New Version & Print":"Upload & Print"}
                  </button>
                </div>
              </>);
            })()}
          </div>
        </div>
      ,document.body)}
      {showProductionUpload&&ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#0d0d1a",border:"1px solid #22c55e",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:520,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
            {(()=>{
              const firstPanel=(project.panels||[])[0];
              const dwg=firstPanel?.drawingNo||"NoDWG";
              const lineSuffix=String(1*100);
              const fileName=`DWG-[APPROVED TO PRODUCE] ${dwg} - ${project.bcProjectNumber||"NoProject"} - ${lineSuffix}.pdf`;
              return(<>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <span style={{fontSize:22}}>✅</span>
                  <div style={{fontSize:15,fontWeight:800,color:"#22c55e"}}>PO Recorded — Upload Production Drawings?</div>
                </div>
                <div style={{display:"flex",gap:16,marginBottom:14}}>
                  <div><span style={{fontSize:11,color:"#64748b"}}>PO #</span><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{showProductionUpload.poNumber}</div></div>
                  <div><span style={{fontSize:11,color:"#64748b"}}>Due Date</span><div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{showProductionUpload.dueDate||"—"}</div></div>
                </div>
                <div style={{fontSize:13,color:"#94a3b8",marginBottom:14,lineHeight:1.6}}>
                  Upload stamped production drawings to Business Central with "APPROVED TO PRODUCE" designation?
                </div>
                <div style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:6,padding:"10px 14px",marginBottom:16}}>
                  <div style={{fontSize:11,color:"#64748b",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>File</div>
                  <div style={{fontSize:13,color:"#22c55e",fontWeight:700,fontFamily:"monospace"}}>{fileName}</div>
                </div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setShowProductionUpload(null)}
                    style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>
                    Skip
                  </button>
                  <button disabled={bcUploading} onClick={async()=>{
                    setBcUploading(true);
                    try{
                      if(bcUploadRef.current)await bcUploadRef.current({
                        mode:"production",
                        poNumber:showProductionUpload.poNumber,
                        dueDate:showProductionUpload.dueDate,
                        poReceivedDate:new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"})
                      });
                    }catch(e){console.warn("Production upload failed:",e);}
                    setBcUploading(false);
                    setShowProductionUpload(null);
                  }}
                    style={{background:bcUploading?"#334155":"#166534",border:`1px solid ${bcUploading?"#475569":"#22c55e"}`,color:bcUploading?"#94a3b8":"#4ade80",padding:"7px 18px",borderRadius:6,cursor:bcUploading?"wait":"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>
                    {bcUploading?"Uploading…":"Upload Production Drawings"}
                  </button>
                </div>
              </>);
            })()}
          </div>
        </div>
      ,document.body)}
    </>
  );
}

// ── CODALE PRICE PANEL ──
function CodaleTestPanel({uid}){
  const [parts,setParts]=useState("25B-D4P0N114, 5069-OB16, 1734-AENTR");
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);
  // Full update state
  const [updating,setUpdating]=useState(false);
  const [updateStatus,setUpdateStatus]=useState(null); // {phase,detail,scraped,written,total,errors}

  async function runTest(){
    setLoading(true);setError(null);setResults(null);
    try{
      const pns=parts.split(",").map(s=>s.trim()).filter(Boolean);
      if(!pns.length){setError("Enter at least one part number");setLoading(false);return;}
      const fn=firebase.functions().httpsCallable("codaleTestScrape",{timeout:300000});
      const r=await fn({partNumbers:pns});
      setResults(r.data.results||[]);
    }catch(e){setError(e.message||"Scrape failed");}
    setLoading(false);
  }

  async function runFullUpdate(){
    if(!_bcToken){setError("Connect to Business Central first");return;}
    const _syncStart=Date.now();
    setUpdating(true);setError(null);setResults(null);setUpdateStatus({phase:"Fetching Codale items from BC…",detail:"",scraped:0,written:0,total:0,errors:0});
    try{
      // Step 1: Fetch all items with Vendor_No = V00165 from BC via OData ItemCard
      const allItems=[];
      let skip=0;
      while(true){
        const url=`${BC_ODATA_BASE}/ItemCard?$filter=Vendor_No eq 'V00165'&$select=No,Description,Vendor_No&$top=100&$skip=${skip}`;
        const r=await fetch(url,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok)break;
        const d=await r.json();
        const batch=d.value||[];
        if(!batch.length)break;
        allItems.push(...batch.map(i=>({number:i.No,description:i.Description||""})));
        skip+=100;
        if(batch.length<100)break;
      }
      if(!allItems.length){setError("No items found with vendor V00165 in BC");setUpdating(false);setUpdateStatus(null);return;}
      setUpdateStatus({phase:`Found ${allItems.length} Codale items. Scraping prices…`,detail:"This may take several minutes.",scraped:0,written:0,total:allItems.length,errors:0});

      // Step 2: Scrape in batches of 5 via Cloud Function
      const BATCH=5;
      const allResults=[];
      for(let i=0;i<allItems.length;i+=BATCH){
        const batch=allItems.slice(i,i+BATCH).map(it=>it.number);
        const batchNum=Math.floor(i/BATCH)+1;
        const totalBatches=Math.ceil(allItems.length/BATCH);
        setUpdateStatus(prev=>({...prev,phase:`Scraping batch ${batchNum}/${totalBatches}…`,detail:batch.join(", ")}));
        try{
          const fn=firebase.functions().httpsCallable("codaleTestScrape",{timeout:300000});
          const r=await fn({partNumbers:batch});
          console.log("CODALE BATCH RESPONSE:",JSON.stringify(r.data));
          const batchResults=r.data.results||[];
          allResults.push(...batchResults);
          const scraped=allResults.length;
          const errors=allResults.filter(r=>!r.found).length;
          setUpdateStatus(prev=>({...prev,scraped,errors}));
        }catch(e){
          console.error("CODALE BATCH ERROR:",e.code,e.message,e.details,JSON.stringify(e));
          batch.forEach(pn=>allResults.push({partNumber:pn,found:false,error:e.message}));
          setUpdateStatus(prev=>({...prev,scraped:allResults.length,errors:allResults.filter(r=>!r.found).length}));
        }
      }

      // Step 3: Write prices to BC Purchase Prices
      const found=allResults.filter(r=>r.found&&r.price>0);
      setUpdateStatus(prev=>({...prev,phase:`Writing ${found.length} prices to BC…`,detail:""}));
      let written=0;
      for(const r of found){
        try{
          await bcPushPurchasePrice(r.partNumber,"V00165",r.price,Date.now(),r.uom||"EA");
          written++;
          setUpdateStatus(prev=>({...prev,written}));
        }catch(e){
          console.warn("BC price write failed:",r.partNumber,e.message);
        }
      }

      const finalErrors=allResults.filter(r=>!r.found).length;
      setUpdateStatus({phase:"Complete",detail:`Scraped ${allResults.length} items, ${found.length} prices found, ${written} written to BC.`,scraped:allResults.length,written,total:allItems.length,errors:finalErrors});
      setResults(allResults);
      // Save sync log to Firestore
      try{
        await fbDb.collection(`users/${uid}/pricingSyncLog`).add({
          vendor:"Codale",runAt:Date.now(),totalItems:allItems.length,
          found:found.length,errors:finalErrors,writtenToBC:written,
          durationMs:Date.now()-_syncStart,
          results:allResults.map(r=>({partNumber:r.partNumber,found:!!r.found,price:r.price||null,uom:r.uom||null,availability:r.availability||null,manufacturer:r.manufacturer||null,productName:r.productName||null,error:r.error||null}))
        });
      }catch(e){console.warn("Failed to save pricing sync log:",e);}
    }catch(e){setError(e.message||"Update failed");}
    setUpdating(false);
  }

  return(<div>
    {/* Test scrape */}
    <input value={parts} onChange={e=>setParts(e.target.value)} placeholder="Part numbers, comma-separated"
      style={{width:"100%",boxSizing:"border-box",background:"#111",border:`1px solid #333`,borderRadius:6,padding:"8px 10px",color:"#e2e8f0",fontSize:12,marginBottom:8,fontFamily:"inherit"}}/>
    <div style={{display:"flex",gap:8,marginBottom:10}}>
      <button onClick={runTest} disabled={loading||updating}
        style={{background:loading?"#334155":"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:loading?"wait":"pointer",opacity:loading?0.7:1,fontFamily:"inherit"}}>
        {loading?"Scraping…":"Test Scrape"}
      </button>
      <button onClick={runFullUpdate} disabled={loading||updating}
        style={{background:updating?"#334155":"#16a34a",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:updating?"wait":"pointer",opacity:updating?0.7:1,fontFamily:"inherit"}}>
        {updating?"Updating…":"Update All Codale Prices"}
      </button>
    </div>
    {/* Progress */}
    {updateStatus&&<div style={{background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.25)",borderRadius:6,padding:"8px 10px",marginBottom:8,fontSize:12}}>
      <div style={{fontWeight:600,color:"#60a5fa"}}>{updateStatus.phase}</div>
      {updateStatus.detail&&<div style={{color:"#94a3b8",marginTop:2}}>{updateStatus.detail}</div>}
      {updateStatus.total>0&&<div style={{color:"#94a3b8",marginTop:4,display:"flex",gap:12}}>
        <span>Scraped: {updateStatus.scraped}/{updateStatus.total}</span>
        <span style={{color:"#22c55e"}}>Written: {updateStatus.written}</span>
        {updateStatus.errors>0&&<span style={{color:"#ef4444"}}>Errors: {updateStatus.errors}</span>}
      </div>}
    </div>}
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:8}}>{error}</div>}
    {results&&<div style={{marginTop:10,maxHeight:400,overflowY:"auto"}}>
      {results.map((r,i)=><div key={i} style={{background:r.found?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`1px solid ${r.found?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:6,padding:"8px 10px",marginBottom:4,fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontWeight:700,color:r.found?"#22c55e":"#ef4444"}}>{r.partNumber}</span>
          {r.found?<span style={{color:"#22c55e",fontWeight:700}}>${r.price.toLocaleString("en-US",{minimumFractionDigits:2})}/{r.uom||"EA"}</span>
          :<span style={{color:"#94a3b8"}}>{r.error||"Not found"}{r.debug&&<div style={{color:"#94a3b8",fontSize:10,marginTop:2,whiteSpace:"pre-wrap",maxHeight:60,overflow:"hidden"}}>{r.debug}</div>}</span>}
          {r.availability&&<span style={{color:"#94a3b8",fontSize:11,marginLeft:"auto"}}>{r.availability}</span>}
        </div>
      </div>)}
    </div>}
  </div>);
}

// ── MOUSER TEST PANEL ──
function MouserTestPanel({uid}){
  const [parts,setParts]=useState("");
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(null);

  async function runTest(){
    setLoading(true);setError(null);setResults(null);
    try{
      const pns=parts.split(",").map(s=>s.trim()).filter(Boolean);
      if(!pns.length){setError("Enter at least one part number");setLoading(false);return;}
      const fn=firebase.functions().httpsCallable("mouserSearch",{timeout:120000});
      const r=await fn({partNumbers:pns});
      setResults(r.data.results||[]);
    }catch(e){setError(e.message||"Search failed");}
    setLoading(false);
  }

  return(<div>
    <input value={parts} onChange={e=>setParts(e.target.value)} placeholder="Part numbers, comma-separated"
      style={{width:"100%",boxSizing:"border-box",background:"#111",border:`1px solid #333`,borderRadius:6,padding:"8px 10px",color:"#e2e8f0",fontSize:12,marginBottom:8,fontFamily:"inherit"}}/>
    <button onClick={runTest} disabled={loading}
      style={{background:loading?"#334155":"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:loading?"wait":"pointer",opacity:loading?0.7:1,fontFamily:"inherit"}}>
      {loading?"Searching…":"Search Mouser"}
    </button>
    {error&&<div style={{color:"#ef4444",fontSize:12,marginTop:8}}>{error}</div>}
    {results&&<div style={{marginTop:10,maxHeight:400,overflowY:"auto"}}>
      {results.map((r,i)=><div key={i} style={{background:r.found?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`1px solid ${r.found?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:6,padding:"8px 10px",marginBottom:4,fontSize:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:r.found?"#22c55e":"#ef4444"}}>{r.partNumber}</span>
          {r.found?<>
            <span style={{color:"#22c55e",fontWeight:700}}>${r.price.toLocaleString("en-US",{minimumFractionDigits:2})}</span>
            {r.manufacturer&&<span style={{color:"#94a3b8"}}>| {r.manufacturer}</span>}
            {r.availability&&<span style={{color:"#94a3b8"}}>| {r.availability}</span>}
            {r.leadTime&&<span style={{color:"#94a3b8"}}>| Lead: {r.leadTime}</span>}
          </>:<span style={{color:"#94a3b8"}}>{r.error||"Not found"}</span>}
        </div>
        {r.found&&r.description&&<div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>{r.description}</div>}
        {r.found&&r.priceBreaks&&r.priceBreaks.length>1&&<div style={{color:"#94a3b8",fontSize:10,marginTop:2}}>
          Price breaks: {r.priceBreaks.map(pb=>`${pb.quantity}+: $${pb.price.toFixed(2)}`).join(" | ")}
        </div>}
      </div>)}
    </div>}
  </div>);
}

export default QuoteSendModal;

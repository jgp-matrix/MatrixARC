// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function RfqEmailModal({groups,projectName,projectId,bcProjectNumber,uid,userEmail,onClose,onSent,onPrint,onApiPriced,onApiAlternates}){
  const [emails,setEmails]=useState(()=>{const m={};groups.forEach(g=>{m[g.vendorName]=g.vendorEmail||"";});return m;});
  const [included,setIncluded]=useState(()=>{const m={};groups.forEach(g=>{m[g.vendorName]=true;});return m;});
  const [vendorContacts,setVendorContacts]=useState({}); // {vendorName: [{name,email,type}]}
  const [contactsLoading,setContactsLoading]=useState(true);
  const [remember,setRemember]=useState({});
  // Load saved vendor emails + fetch BC contacts on mount
  useEffect(()=>{
    (async()=>{
      // Load saved default emails from Firestore
      const currentUid=uid||fbAuth.currentUser?.uid;
      if(currentUid){
        try{
          const doc=await fbDb.doc(`users/${currentUid}/config/vendorEmails`).get();
          const saved=doc.exists?doc.data():{};
          const rem={};
          groups.forEach(g=>{
            if(saved[g.vendorName]){
              setEmails(prev=>prev[g.vendorName]?prev:{...prev,[g.vendorName]:saved[g.vendorName]});
              rem[g.vendorName]=true;
            }
          });
          setRemember(rem);
        }catch(e){}
      }
      // Fetch BC contacts
      const results={};
      for(const g of groups){
        if(isApiVendor(g.vendorName))continue;
        {
          const contacts=await bcFetchVendorContacts(g.vendorNo,g.vendorName);
          if(contacts.length>0){
            results[g.vendorName]=contacts;
            // Auto-fill email only if still empty (saved emails take priority)
            setEmails(prev=>{if(prev[g.vendorName])return prev;return{...prev,[g.vendorName]:contacts[0].email};});
          }
        }
      }
      setVendorContacts(results);
      setContactsLoading(false);
    })();
  },[]);
  const [statuses,setStatuses]=useState({});
  const [sending,setSending]=useState(false);
  const [done,setDone]=useState(false);
  const [previewGroup,setPreviewGroup]=useState(null);
  const fromEmail=userEmail||fbAuth.currentUser?.email||"your Outlook account";
  const _today=new Date();
  const _rfqBase=bcProjectNumber||Date.now().toString(36).toUpperCase().slice(-6);
  const _makeRfqNum=vendor=>`${vendorCode(vendor)}-${_rfqBase}`;
  const _rfqDate=_today.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const _responseBy=new Date(_today.getTime()+14*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  async function sendAll(shouldPrint=false){
    setSending(true);
    // Check if we have any non-API vendors that need email
    const hasEmailVendors=groups.some(g=>included[g.vendorName]&&!isApiVendor(g.vendorName)&&(emails[g.vendorName]||"").trim());
    let graphToken=null;
    if(hasEmailVendors){
      graphToken=await acquireGraphToken();
      if(!graphToken){setSending(false);alert("Could not get Microsoft 365 token. Make sure you are signed in to your Microsoft account.");return;}
    }
    const today=_today;
    const rfqBase=_rfqBase;
    const makeRfqNum=_makeRfqNum;
    const rfqDate=_rfqDate;
    const responseBy=_responseBy;
    // Generate per-vendor upload tokens and store in Firestore
    const vendorTokens={};
    const uploadExpiry=Date.now()+30*24*60*60*1000;
    const currentUid=uid||fbAuth.currentUser?.uid||"";
    for(const group of groups){
      if(included[group.vendorName]&&(emails[group.vendorName]||"").trim()){
        const rfqNum=makeRfqNum(group.vendorName);
        const tok=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('');
        vendorTokens[group.vendorName]=tok;
        fbDb.collection('rfqUploads').doc(tok).set({uid:currentUid,projectId:projectId||"",projectName:projectName||"",vendorName:group.vendorName,vendorNumber:group.vendorNo||"",vendorEmail:(emails[group.vendorName]||"").trim(),rfqNum,lineItems:group.items.map(i=>({partNumber:i.partNumber||"",description:i.description||"",qty:i.qty||1,manufacturer:i.manufacturer||""})),sentAt:Date.now(),expiresAt:uploadExpiry,status:"pending",companyName:_appCtx.company?.name||"",companyLogoUrl:_appCtx.company?.logoUrl||"",companyAddress:_appCtx.company?.address||"",companyPhone:_appCtx.company?.phone||""}).catch(e=>console.warn("rfqUpload save failed:",e));
      }
    }
    const sentItemIds=[];
    const historyEntries=[];
    const apiGroups=[]; // collect API vendor groups for post-send processing
    for(const group of groups){
      if(!included[group.vendorName]){
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"skipped"}}));
        historyEntries.push({vendorName:group.vendorName,vendorEmail:emails[group.vendorName]||"",items:group.items.map(i=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:false,skipped:true});
        continue;
      }
      // API vendors — skip email, queue for auto-fetch
      const apiInfo=isApiVendor(group.vendorName);
      if(apiInfo){
        apiGroups.push({group,apiInfo});
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"sending"}}));
        continue;
      }
      const to=(emails[group.vendorName]||"").trim();
      if(!to){
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"error",msg:"No email address"}}));
        historyEntries.push({vendorName:group.vendorName,vendorEmail:"",items:group.items.map(i=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:false,skipped:false,error:"No email address"});
        continue;
      }
      setStatuses(prev=>({...prev,[group.vendorName]:{state:"sending"}}));
      try{
        // RFQ number: vendor code + project number (e.g. ROY-PRJ402010)
        // Future: integrate with BC Requisition Worksheets for proper purchasing flow
        let rfqNum=makeRfqNum(group.vendorName);
        const uploadToken=vendorTokens[group.vendorName];
        const uploadUrl=uploadToken?`https://matrix-arc.web.app?rfqUpload=${uploadToken}`:null;
        const subject=`Request for Quote — ${projectName||"Project"} — ${rfqNum}`;
        const html=buildRfqEmailHtml(group,projectName,rfqNum,rfqDate,responseBy,uploadUrl,_appCtx.company);
        const pdfBase64=await buildRfqPdf(group,projectName,rfqNum,rfqDate,responseBy,_appCtx.company).catch(()=>null);
        const pdfName=`${rfqNum}-${(group.vendorName||"Supplier").replace(/[^a-z0-9]/gi,"_")}.pdf`;
        await sendGraphEmail(graphToken,to,subject,html,pdfBase64,pdfName);
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"sent"}}));
        group.items.forEach(item=>sentItemIds.push(item.id));
        historyEntries.push({rfqNum,vendorName:group.vendorName,vendorEmail:to,items:group.items.map(i=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:true,skipped:false,uploadToken:uploadToken||null});
      }catch(e){
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"error",msg:String(e.message||e)}}));
        historyEntries.push({rfqNum:makeRfqNum(group.vendorName),vendorName:group.vendorName,vendorEmail:to,items:group.items.map(i=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:false,skipped:false,error:String(e.message||e)});
      }
    }
    // Save to Firestore history
    if(uid&&historyEntries.length>0){
      const sessionRfqNum=historyEntries.find(e=>e.sent)?.rfqNum||`RFQ-${rfqBase}`;
      fbDb.collection(`users/${uid}/rfq_history`).add({rfqNum:sessionRfqNum,sentAt:Date.now(),projectId:projectId||"",projectName:projectName||"",sentFrom:fromEmail,entries:historyEntries}).catch(e=>console.warn("RFQ history save failed:",e));
      // Save supplier part cross-reference for crossed items
      const allCrossings=[];
      historyEntries.filter(e=>e.sent).forEach(entry=>{
        const grp=groups.find(g=>g.vendorName===entry.vendorName);
        if(!grp)return;
        grp.items.filter(i=>i.crossedFrom).forEach(i=>{
          allCrossings.push({origPartNumber:i.crossedFrom,bcPartNumber:i.partNumber,description:i.description||"",manufacturer:i.manufacturer||"",vendorName:grp.vendorName,rfqNum:entry.rfqNum||"",rfqDate:Date.now()});
        });
      });
      if(allCrossings.length>0){
        fbDb.doc(`users/${uid}/config/supplierCrossRef`).set({records:firebase.firestore.FieldValue.arrayUnion(...allCrossings)},{merge:true}).catch(e=>console.warn("CrossRef save failed:",e));
      }
    }
    // Process API vendor groups — auto-fetch pricing with cross-vendor check
    console.log("[RFQ-API] API groups to process:",apiGroups.length,apiGroups.map(a=>a.group.vendorName));
    async function searchVendorBatch(fnName,items){
      const fn=firebase.functions().httpsCallable(fnName,{timeout:120000});
      const BATCH=10;const results=[];
      for(let i=0;i<items.length;i+=BATCH){
        const batch=items.slice(i,i+BATCH);
        try{const r=await fn({items:batch});results.push(...(r.data.results||r.data||[]));}
        catch(e){batch.forEach(b=>results.push({partNumber:b.partNumber,found:false,error:e.message}));}
      }
      return results;
    }
    for(const{group,apiInfo}of apiGroups){
      try{
        console.log("[RFQ-API] Processing vendor:",group.vendorName,"type:",apiInfo.type,"items:",group.items.length);
        const items=group.items.map(i=>({partNumber:(i.partNumber||"").trim(),manufacturer:i.manufacturer||""}));
        // Determine which APIs to call: primary first, then cross-check the other
        const searchPlan=[];
        if(apiInfo.type==="digikey"){searchPlan.push({fn:"digikeySearch",label:"DigiKey",name:"DigiKey"});searchPlan.push({fn:"mouserSearch",label:"Mouser",name:"Mouser"});}
        else if(apiInfo.type==="mouser"){searchPlan.push({fn:"mouserSearch",label:"Mouser",name:"Mouser"});searchPlan.push({fn:"digikeySearch",label:"DigiKey",name:"DigiKey"});}
        else{/* RS-Online: no API, search both DK and Mouser */searchPlan.push({fn:"digikeySearch",label:"DigiKey",name:"DigiKey"});searchPlan.push({fn:"mouserSearch",label:"Mouser",name:"Mouser"});}

        // Search primary vendor
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"sending",msg:`Searching ${searchPlan[0].label}…`}}));
        const primaryResults=await searchVendorBatch(searchPlan[0].fn,items);

        // Identify items NOT found or priced by primary
        const notFoundPNs=new Set();
        const primaryMap={};
        primaryResults.forEach(r=>{
          primaryMap[(r.partNumber||"").trim().toUpperCase()]={...r,source:searchPlan[0].name};
          if(!r.found||!r.price||r.price<=0)notFoundPNs.add((r.partNumber||"").trim().toUpperCase());
        });
        items.forEach(i=>{if(!primaryMap[i.partNumber.toUpperCase()])notFoundPNs.add(i.partNumber.toUpperCase());});

        // Cross-check: search ALL items on secondary to find better prices + fill gaps
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"sending",msg:`Cross-checking ${searchPlan[1].label}…`}}));
        const secondaryResults=await searchVendorBatch(searchPlan[1].fn,items);
        const secondaryMap={};
        secondaryResults.forEach(r=>{secondaryMap[(r.partNumber||"").trim().toUpperCase()]={...r,source:searchPlan[1].name};});

        // Merge: use best price, prefer primary if equal, fill gaps from secondary
        const finalResults=[];
        const altSources=[]; // items where secondary was cheaper
        items.forEach(i=>{
          const pn=i.partNumber.toUpperCase();
          const pri=primaryMap[pn];const sec=secondaryMap[pn];
          const priOk=pri&&pri.found&&pri.price>0;
          const secOk=sec&&sec.found&&sec.price>0;
          if(priOk&&secOk){
            if(sec.price<pri.price){
              // Secondary is cheaper — use it, record alternate
              finalResults.push({...sec,partNumber:i.partNumber,source:sec.source});
              altSources.push({partNumber:i.partNumber,primarySource:pri.source,primaryPrice:pri.price,chosenSource:sec.source,chosenPrice:sec.price,savings:pri.price-sec.price});
            }else{
              finalResults.push({...pri,partNumber:i.partNumber,source:pri.source});
              if(sec.price>0)altSources.push({partNumber:i.partNumber,primarySource:pri.source,primaryPrice:pri.price,altSource:sec.source,altPrice:sec.price,note:"primary cheaper"});
            }
          }else if(priOk){
            finalResults.push({...pri,partNumber:i.partNumber,source:pri.source});
          }else if(secOk){
            finalResults.push({...sec,partNumber:i.partNumber,source:sec.source});
            altSources.push({partNumber:i.partNumber,primarySource:searchPlan[0].name,primaryPrice:0,chosenSource:sec.source,chosenPrice:sec.price,note:"not found at primary"});
          }else{
            finalResults.push({partNumber:i.partNumber,found:false,price:0,source:"none"});
          }
        });

        const priced=finalResults.filter(r=>r.found&&r.price>0);
        if(priced.length>0&&onApiPriced){
          onApiPriced(group.vendorName,group.vendorNo||"",priced);
        }
        // Push alternate vendor prices to BC Purchase Prices
        if(altSources.length>0&&onApiAlternates){
          onApiAlternates(altSources);
        }
        group.items.forEach(item=>sentItemIds.push(item.id));
        const failCount=finalResults.filter(r=>!r.found).length;
        const altCount=altSources.filter(a=>a.chosenSource).length;
        const checkedNames=searchPlan.map(s=>s.name).join(" and ");
        let msg=`Checked ${checkedNames} — `;
        if(priced.length>0)msg+=`${priced.length} priced`;
        if(altCount>0)msg+=`${priced.length>0?", ":""}${altCount} from alternate source`;
        if(failCount>0&&priced.length>0)msg+=`, ${failCount} not found at either`;
        else if(failCount>0&&priced.length===0)msg+=`${failCount} item${failCount!==1?"s":""} not found at either supplier`;
        if(priced.length===0&&failCount===0)msg+="no items to check";
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"sent",msg}}));
        historyEntries.push({vendorName:group.vendorName,vendorEmail:"API",items:group.items.map(i=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:true,skipped:false,apiVendor:apiInfo.type,apiResults:{priced:priced.length,notFound:failCount,alternates:altCount}});
      }catch(e){
        setStatuses(prev=>({...prev,[group.vendorName]:{state:"error",msg:String(e.message||e)}}));
        historyEntries.push({vendorName:group.vendorName,vendorEmail:"API",items:group.items.map(i=>({partNumber:i.partNumber,qty:i.qty,id:i.id})),sent:false,skipped:false,error:String(e.message||e),apiVendor:apiInfo.type});
      }
    }
    // Send confirmation email to ARC user
    const sentVendors=historyEntries.filter(e=>e.sent&&e.vendorEmail!=="API");
    const apiVendorResults=historyEntries.filter(e=>e.sent&&e.vendorEmail==="API");
    if(!graphToken)try{graphToken=await acquireGraphToken();}catch(e){}
    if((sentVendors.length>0||apiVendorResults.length>0)&&graphToken&&fromEmail){
      try{
        const now=new Date().toLocaleString("en-US",{month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
        let rows=sentVendors.map(v=>`<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${v.vendorName}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${v.vendorEmail}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#16a34a">✓ Sent</td></tr>`).join("");
        rows+=apiVendorResults.map(v=>`<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${v.vendorName}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">API Auto-Pricing</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#2563eb">✓ ${v.apiResults?v.apiResults.priced+" priced":"Complete"}</td></tr>`).join("");
        const failedVendors=historyEntries.filter(e=>!e.sent&&!e.skipped);
        if(failedVendors.length>0)rows+=failedVendors.map(v=>`<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${v.vendorName}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${v.vendorEmail||"—"}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;color:#dc2626">✗ Failed: ${v.error||"Unknown"}</td></tr>`).join("");
        const confirmHtml=`<div style="font-family:-apple-system,'Inter',sans-serif;max-width:600px;margin:0 auto;color:#1e293b"><div style="background:#f1f5f9;padding:24px 32px;border-bottom:2px solid #2563eb"><h2 style="margin:0;color:#2563eb;font-size:20px">RFQ Send Confirmation</h2></div><div style="padding:24px 32px"><p style="margin:0 0 8px;font-size:14px"><strong>Project:</strong> ${projectName||"—"}</p><p style="margin:0 0 8px;font-size:14px"><strong>BC Project:</strong> ${bcProjectNumber||"—"}</p><p style="margin:0 0 16px;font-size:14px"><strong>Sent:</strong> ${now}</p><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #2563eb;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b">Supplier</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #2563eb;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b">Sent To</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #2563eb;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b">Status</th></tr></thead><tbody>${rows}</tbody></table><p style="margin:16px 0 0;font-size:12px;color:#94a3b8">This is an automated confirmation from ARC.</p></div></div>`;
        await sendGraphEmail(graphToken,fromEmail,`RFQ Confirmation — ${projectName||bcProjectNumber||"Project"}`,confirmHtml);
        console.log("[RFQ] Confirmation email sent to",fromEmail);
      }catch(e){console.warn("[RFQ] Confirmation email failed:",e.message);}
    }
    setSending(false);setDone(true);
    if(sentItemIds.length>0&&onSent)onSent(sentItemIds);
    if(shouldPrint&&onPrint)onPrint(groups);
  }
  const stColors={sent:"#4ade80",error:"#f87171",skipped:"#64748b",sending:"#818cf8"};
  const stLabel=st=>st?.state==="sending"?(st.msg?`⏳ ${st.msg}`:"⏳ Sending…"):st?.state==="sent"?(st.msg?`✓ ${st.msg}`:"✓ Sent"):st?.state==="error"?`✗ ${st.msg||"Failed"}`:st?.state==="skipped"?"— Skipped":null;
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
      <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:10,padding:"24px 28px",minWidth:560,maxWidth:720,width:"95%",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{fontSize:15,fontWeight:800,color:"#f1f5f9",marginBottom:8}}>Send RFQ Emails</div>
        <div style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:6,padding:"7px 10px",marginBottom:14,fontSize:12,display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#94a3b8"}}>From:</span>
          <span style={{color:"#93c5fd",fontWeight:600}}>{fromEmail}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:12,color:"#94a3b8"}}>Uncheck any supplier to skip their email this send.</div>
          <div style={{display:"flex",gap:6}}>
            <button onClick={()=>setIncluded(prev=>{const m={};groups.forEach(g=>{m[g.vendorName]=true;});return m;})} disabled={sending||done} style={{background:"none",border:"1px solid #3d6090",color:"#94a3b8",borderRadius:4,padding:"2px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Check All</button>
            <button onClick={()=>setIncluded(prev=>{const m={};groups.forEach(g=>{m[g.vendorName]=false;});return m;})} disabled={sending||done} style={{background:"none",border:"1px solid #3d6090",color:"#94a3b8",borderRadius:4,padding:"2px 10px",fontSize:11,cursor:"pointer",fontFamily:"inherit"}}>Uncheck All</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:18,maxHeight:360,overflowY:"auto"}}>
          {groups.map(g=>{
            const st=statuses[g.vendorName];
            const isOn=!!included[g.vendorName];
            const lbl=stLabel(st);
            const lastSent=g.items.reduce((max,it)=>Math.max(max,it.rfqSentDate||0),0);
            return(
              <div key={g.vendorName} style={{background:isOn?"#111128":"#090910",border:`1px solid ${isOn?"#3d6090":"#151520"}`,borderRadius:6,padding:"10px 12px",opacity:isOn?1:0.55,transition:"opacity 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:isOn?6:0}}>
                  <input type="checkbox" checked={isOn} disabled={sending||done} onChange={e=>setIncluded(prev=>({...prev,[g.vendorName]:e.target.checked}))} style={{cursor:"pointer",accentColor:"#818cf8",width:14,height:14,flexShrink:0}}/>
                  <span style={{fontWeight:700,color:"#f1f5f9",fontSize:13,flex:1}}>{g.vendorName}</span>
                  {lastSent>0&&<span style={{fontSize:10,color:"#f59e0b",fontWeight:600,background:"#3a1f00",borderRadius:4,padding:"1px 6px"}}>RFQ Sent {new Date(lastSent).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                  <button onClick={()=>setPreviewGroup(g)} title="Preview email" style={{background:"#0d1520",border:"1px solid #0284c7",borderRadius:4,color:"#38bdf8",cursor:"pointer",fontSize:11,padding:"1px 6px",fontFamily:"inherit"}}>👁 Preview</button>
                  <span style={{fontSize:11,color:lbl?stColors[st.state]:"#64748b"}}>{lbl||`${g.items.length} item${g.items.length!==1?"s":""}`}</span>
                </div>
                {isOn&&(()=>{
                  const api=isApiVendor(g.vendorName);
                  if(api)return <div style={{fontSize:11,color:"#4ade80",fontWeight:600,padding:"4px 0"}}>⚡ Pricing will be obtained automatically via {api.label}</div>;
                  const contacts=vendorContacts[g.vendorName]||[];
                  const emailList=(emails[g.vendorName]||"").split(/[,;]\s*/).filter(e=>e.trim());
                  const rows=Math.max(1,emailList.length);
                  return <div>
                    <div style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                      <textarea value={(emails[g.vendorName]||"").replace(/;\s*/g,";\n")} onChange={e=>setEmails(prev=>({...prev,[g.vendorName]:e.target.value.replace(/\n/g,"; ")}))}
                        placeholder={contactsLoading?"Loading contacts…":"supplier@email.com"} disabled={sending||done}
                        rows={rows}
                        style={{flex:1,boxSizing:"border-box",background:"#0a0a18",border:"1px solid #3d6090",borderRadius:4,padding:"5px 8px",color:"#f1f5f9",fontSize:12,fontFamily:"inherit",outline:"none",resize:"vertical",lineHeight:1.6}}/>
                      {contacts.length>0&&<select disabled={sending||done} value="" onChange={e=>{
                        if(!e.target.value)return;
                        const cur=(emails[g.vendorName]||"").trim();
                        const newEmail=e.target.value;
                        if(cur&&!cur.split(/[,;]\s*/).some(x=>x.toLowerCase()===newEmail.toLowerCase())){
                          setEmails(prev=>({...prev,[g.vendorName]:cur+"; "+newEmail}));
                        }else if(!cur){
                          setEmails(prev=>({...prev,[g.vendorName]:newEmail}));
                        }
                        e.target.value="";
                      }} style={{background:"#0a0a18",border:"1px solid #3d6090",borderRadius:4,padding:"5px 4px",color:"#93c5fd",fontSize:10,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>
                        <option value="">📇 Contacts</option>
                        {contacts.map((c,ci)=><option key={ci} value={c.email}>{c.name} — {c.email}</option>)}
                      </select>}
                    </div>
                    <label style={{display:"flex",alignItems:"center",gap:4,marginTop:3,cursor:"pointer",fontSize:10,color:remember[g.vendorName]?"#4ade80":"#64748b"}}>
                      <input type="checkbox" checked={!!remember[g.vendorName]} onChange={e=>{
                        const checked=e.target.checked;
                        setRemember(prev=>({...prev,[g.vendorName]:checked}));
                        const currentUid=uid||fbAuth.currentUser?.uid;
                        if(currentUid){
                          const emailVal=(emails[g.vendorName]||"").trim();
                          if(checked&&emailVal){
                            fbDb.doc(`users/${currentUid}/config/vendorEmails`).set({[g.vendorName]:emailVal},{merge:true}).catch(()=>{});
                          }else if(!checked){
                            fbDb.doc(`users/${currentUid}/config/vendorEmails`).set({[g.vendorName]:firebase.firestore.FieldValue.delete()},{merge:true}).catch(()=>{});
                          }
                        }
                      }} style={{accentColor:"#4ade80",width:12,height:12,cursor:"pointer"}}/>
                      {remember[g.vendorName]?"Default for future RFQs":"Remember for future RFQs"}
                    </label>
                  </div>;
                })()}
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
          {done&&groups.filter(g=>included[g.vendorName]).every(g=>statuses[g.vendorName]?.state==="sent")&&<span style={{fontSize:12,color:"#4ade80",marginRight:"auto"}}>✓ All RFQs sent!</span>}
          <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>{done?"Close":"Cancel"}</button>
          {!sending&&!done&&<button onClick={()=>{if(onPrint)onPrint(groups);onClose();}} style={{background:"#1a1a2a",border:"1px solid #4f46e5",color:"#a5b4fc",padding:"6px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit",fontWeight:600}}>📋 Print</button>}
          {!sending&&!done&&<button onClick={()=>sendAll(false)} disabled={groups.length===0} style={{background:"#1e1b4b",border:"none",color:"#818cf8",padding:"6px 16px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>✉ Send</button>}
          {sending&&<span style={{fontSize:12,color:"#818cf8"}}>Sending…</span>}
        </div>
      </div>
    </div>
    </>
  ,document.body);
}

export default RfqEmailModal;

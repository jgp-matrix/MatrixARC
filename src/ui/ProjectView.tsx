/* eslint-disable */
// @ts-nocheck
// ProjectView.tsx — Verbatim extraction from monolith index.html v1.19.376 lines 15637-16724.
// DO NOT EDIT — re-extract from monolith if changes are needed.

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import {
  fbDb, fbAuth, _bcToken, _bcConfig, _appCtx,
  saveProject, saveProjectPanel, bcPatchJobOData, acquireBcToken,
  migrateProject, isReadOnly, onProjectUpdated,
} from '@/core/globals';
import { normPart, partMatch, mergeBoms } from '@/bom/deduplicator';
import { computeBomHash } from '@/core/helpers';
// Lazy import to avoid circular initialization with arcDoc
const generateQuotePdf = async (...args: any[]) => {
  const { generateQuotePdf: fn } = await import('@/core/arcDoc');
  return fn(...args);
};
import { buildRfqSupplierGroups, getNextQuoteNumber } from '@/services/rfq';
import { bcCreateProject, bcSyncPanelPlanningLines, bcCreatePanelTaskStructure } from '@/services/businessCentral/projects';
import { bcListVendors, bcGetVendorEmail } from '@/services/businessCentral/vendors';
import { fetchPurchasePrices as bcFetchPurchasePrices } from '@/services/businessCentral/prices';

import PanelListView from '@/ui/panels/PanelListView';
import QuoteView from '@/ui/QuoteView';
import RfqDocument from '@/ui/modals/RfqDocument';
import RfqEmailModal from '@/ui/modals/RfqEmailModal';
import RfqHistoryModal from '@/ui/modals/RfqHistoryModal';
import PoReceivedModal from '@/ui/modals/PoReceivedModal';
import PurchasePriceCheckModal from '@/ui/modals/PurchasePriceCheckModal';
import PortalSubmissionsModal from '@/ui/modals/PortalSubmissionsModal';
import SupplierQuoteImportModal from '@/ui/modals/SupplierQuoteImportModal';

// ─── Monolith functions not yet extracted ────────────────────────────────────
declare function isAdmin(): boolean;

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
  const isBcDisconnected=!!(project.bcEnv&&_bcConfig&&project.bcEnv!==_bcConfig.env);
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


export default ProjectView;

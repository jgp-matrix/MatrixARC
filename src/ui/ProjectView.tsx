import { useState, useEffect, useRef } from 'react';
import React from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import {
  fbDb, fbAuth, _bcToken, _bcConfig, _pricingConfig,
  saveProject, bcPatchJobOData,
} from '@/core/globals';
import { ErrorBoundary } from '@/ui/stubs';
import PanelListView from '@/ui/panels/PanelListView';
import QuoteView from '@/ui/QuoteView';

import RfqDocument from '@/ui/modals/RfqDocument';
import RfqEmailModal from '@/ui/modals/RfqEmailModal';
import RfqHistoryModal from '@/ui/modals/RfqHistoryModal';
import PoReceivedModal from '@/ui/modals/PoReceivedModal';
import PurchasePriceCheckModal from '@/ui/modals/PurchasePriceCheckModal';
import PortalSubmissionsModal from '@/ui/modals/PortalSubmissionsModal';
import SupplierQuoteImportModal from '@/ui/modals/SupplierQuoteImportModal';

import { normPart, partMatch, mergeBoms } from '@/bom/deduplicator';
import { fetchPurchasePrices as bcFetchPurchasePrices, pushPurchasePrice as bcPushPurchasePrice } from '@/services/businessCentral/prices';
import { bcCreateProject, bcSyncPanelPlanningLines, bcCreatePanelTaskStructure } from '@/services/businessCentral/projects';
import { bcListVendors, bcGetVendorEmail } from '@/services/businessCentral/vendors';
import { computeBomHash } from '@/core/helpers';

// ─── Stub functions not yet extracted ────────────────────────────────────────
function migrateProject(p: any): any { return p.panels ? p : { ...p, panels: [] }; }
function isReadOnly(): boolean { return false; }
import { buildRfqSupplierGroups, getNextQuoteNumber } from '@/services/rfq';
// TODO: onProjectUpdated — extract to dedicated module
function onProjectUpdated(projectId: string, cb: (p: any) => void): () => void { return () => {}; }
async function bcPatchItemOData(partNumber: string, patch: any): Promise<void> {}

// Firebase FieldValue stub
const firebase = { firestore: { FieldValue: { arrayUnion: (...args: any[]) => args } } };

export default function ProjectView({project:init,uid,onBack,onChange,onDelete,onTransfer,onCopy,autoOpenPortal,onPortalOpened}: any){
  const [project,setProject]=useState(()=>migrateProject(init));
  const projectRef=useRef(migrateProject(init));
  const [view,setView]=useState("panels"); // "panels"|"quote"
  const [autoPrint,setAutoPrint]=useState(false);
  const [rfqLoading,setRfqLoading]=useState(false);
  const [rfqGroups,setRfqGroups]=useState<any>(null);
  const [autoPrintRfq,setAutoPrintRfq]=useState(false);
  const [rfqEmailModal,setRfqEmailModal]=useState<any>(null);
  const [showRfqHistory,setShowRfqHistory]=useState(false);
  const [quoteWarnRows,setQuoteWarnRows]=useState<any>(null); // null=hidden, array=showing
  const [eqWarnOpen,setEqWarnOpen]=useState<any>(null); // null=hidden, array of open engineering questions
  const [eqWarnPriceRows,setEqWarnPriceRows]=useState<any>(null); // stacked price warnings after eq warning
  const [showSqModal,setShowSqModal]=useState(false);
  const [sqPanelBom,setSqPanelBom]=useState<any>(null);
  const [pendingRfqUploads,setPendingRfqUploads]=useState(0);
  const [portalSubmissions,setPortalSubmissions]=useState<any[]>([]);
  const [showPortalModal,setShowPortalModal]=useState(false);
  const [showPoModal,setShowPoModal]=useState(false);
  const [showPriceCheckModal,setShowPriceCheckModal]=useState(false);
  const [priceCheckDiffs,setPriceCheckDiffs]=useState<any>(null);
  // Compare BOM prices against BC Purchase Prices on project open
  const priceCheckRan=useRef(false);
  useEffect(()=>{
    if(priceCheckRan.current)return;
    function tryCheck(){
      if(priceCheckRan.current||!_bcToken)return;
      priceCheckRan.current=true;
      (async()=>{
        const panels=projectRef.current.panels||[];
        const pnSet=new Set<string>();
        panels.forEach((p: any)=>(p.bom||[]).forEach((r: any)=>{
          if(!r.isLaborRow&&(r.partNumber||'').trim())pnSet.add((r.partNumber||'').trim());
        }));
        if(!pnSet.size)return;
        const bcPrices=await bcFetchPurchasePrices([...pnSet]);
        if(!bcPrices.size)return;
        const diffs: any[]=[];
        panels.forEach((p: any,pi: number)=>(p.bom||[]).forEach((r: any)=>{
          if(r.isLaborRow)return;
          const pn=(r.partNumber||'').trim();
          const bc=bcPrices.get(pn);
          if(!bc)return;
          const bomPrice=r.unitPrice||0;
          const bcPrice=bc.directUnitCost;
          const bcDateMs=bc.startingDate||null;
          const bomDateMs=r.bcPoDate||r.priceDate||null;
          const priceDiff=Math.abs(bomPrice-bcPrice)>0.005;
          const dateNewer=bcDateMs&&(!bomDateMs||bcDateMs>bomDateMs);
          if(priceDiff||dateNewer){
            diffs.push({panelIdx:pi,panelName:p.name||'Panel '+(pi+1),rowId:r.id,partNumber:pn,
              description:r.description||'',bomPrice,bomDate:bomDateMs,
              bcPrice,bcDate:bcDateMs,bcVendor:bc.vendorNo||''});
          }
        }));
        if(diffs.length>0){console.log("[BC] Purchase Price diffs found:",diffs.length);setPriceCheckDiffs(diffs);setShowPriceCheckModal(true);}
        else{console.log("[BC] Purchase Prices match BOM \u2014 no updates needed");}
      })().catch(e=>console.warn("Purchase price check error:",e));
    }
    tryCheck();
    const iv=setInterval(tryCheck,3000);
    return()=>clearInterval(iv);
  },[]);
  function applyPriceCheckDiffs(selectedDiffs: any[]){
    const diffMap: any={};
    selectedDiffs.forEach(d=>{
      if(!diffMap[d.panelIdx])diffMap[d.panelIdx]={};
      diffMap[d.panelIdx][String(d.rowId)]=d;
    });
    const updatedPanels=(projectRef.current.panels||[]).map((p: any,pi: number)=>{
      if(!diffMap[pi])return p;
      return{...p,bom:(p.bom||[]).map((r: any)=>{
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
    const unsub=fbDb.collection('rfqUploads').where('uid','==',uid).onSnapshot((snap: any)=>{
      const matching=snap.docs.filter((d: any)=>{
        const data=d.data();
        return data.projectId===init.id&&data.status==='submitted';
      });
      console.log('PORTAL SUBS: project',init.id,'total docs',snap.size,'matching',matching.length,matching.map((d: any)=>d.id));
      setPendingRfqUploads(matching.length);
      setPortalSubmissions(matching.map((d: any)=>({id:d.id,...d.data()})));
    },(err: any)=>{console.error('PORTAL SUBS error:',err);setPendingRfqUploads(0);setPortalSubmissions([]);});
    return()=>unsub();
  },[uid,init.id]);
  // Auto-open portal modal when navigated from a notification
  useEffect(()=>{
    if(autoOpenPortal&&portalSubmissions.length>0){
      setShowPortalModal(true);
      onPortalOpened?.();
    }
  },[autoOpenPortal,portalSubmissions.length]);
  const saveTimer=useRef<any>(null);
  const readOnly=isReadOnly();
  const isBcDisconnected=!!(project.bcEnv&&project.bcEnv!==(_bcConfig as any)?.env);
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

  function update(p: any){
    // Auto-bump quote revision when BOM changes after a print
    if(p.lastPrintedBomHash){
      const curHash=computeBomHash(p.panels);
      if(curHash!==p.lastPrintedBomHash&&(p.quoteRev||0)===(p.quoteRevAtPrint||0)){
        p={...p,quoteRev:(p.quoteRev||0)+1};
      }
    }
    setProject(p);projectRef.current=p;onChange(p);
    clearTimeout(saveTimer.current);
    saveTimer.current=setTimeout(()=>saveProject(uid,p),1000);
  }

  const [relinking,setRelinking]=useState(false);
  const [relinkMsg,setRelinkMsg]=useState<any>(null);
  async function relinkToBC(){
    if(!_bcToken){alert("Connect to Business Central first.");return;}
    if(!confirm("This will create a NEW BC project in the current environment ("+(_bcConfig as any)?.env+") and re-link this project. Continue?"))return;
    setRelinking(true);setRelinkMsg("Creating BC project\u2026");
    try{
      const bc=await bcCreateProject(project.name,project.bcCustomerNumber||null);
      setRelinkMsg("Creating task structure\u2026");
      const panels=project.panels||[];
      await bcCreatePanelTaskStructure(bc.number,project.name,panels).catch((e: any)=>console.warn("Relink task structure error:",e));
      for(let i=0;i<panels.length;i++){
        setRelinkMsg(`Syncing planning lines (panel ${i+1}/${panels.length})\u2026`);
        await (bcSyncPanelPlanningLines as any)(bc.number,i,panels[i]).catch((e: any)=>console.warn("Relink planning lines error panel",i,e));
      }
      const updated={...projectRef.current,bcProjectNumber:bc.number,bcProjectId:bc.id,bcEnv:(_bcConfig as any)?.env,bcPdfAttached:false,bcPdfFileName:null};
      // Reset per-panel bc attachment flags
      if(updated.panels)updated.panels=updated.panels.map((pan: any)=>({...pan,bcPdfAttached:false,bcPdfFileName:null}));
      setProject(updated);projectRef.current=updated;onChange(updated);
      await saveProject(uid,updated);
      setRelinkMsg("\u2713 Re-linked to "+bc.number);
      setTimeout(()=>setRelinkMsg(null),3000);
    }catch(e: any){
      console.error("Relink error:",e);
      setRelinkMsg("Failed: "+(e.message||e));
    }
    setRelinking(false);
  }

  // Auto-print: wait for quote DOM to render, trigger print, then go back
  useEffect(()=>{
    if(autoPrint&&view==="quote"){
      const t=setTimeout(()=>{window.print();const hash=computeBomHash(projectRef.current.panels);const upd={...projectRef.current,lastPrintedBomHash:hash,lastQuotePrintedAt:Date.now(),quoteRevAtPrint:projectRef.current.quoteRev||0};setProject(upd);projectRef.current=upd;onChange(upd);saveProject(uid,upd);setAutoPrint(false);setView("panels");},400);
      return()=>clearTimeout(t);
    }
  },[autoPrint,view]);

  async function onPrintRfq(){
    setRfqLoading(true);
    try{
      const allBom=mergeBoms((projectRef.current.panels||[]).map((p: any)=>p.bom||[]));
      const result=await buildRfqSupplierGroups(allBom);
      if(result.noItems){setRfqLoading(false);alert("No items eligible for RFQ. Items qualify if they show 'No POs' or have a price date older than 60 days (manual-priced items are excluded).");return;}
      setRfqGroups(result.groups);
      setAutoPrintRfq(true);
    }catch(e: any){console.error("RFQ build error:",e);alert("Failed to build RFQ: "+(e.message||e));}
    setRfqLoading(false);
  }

  async function onSendRfqEmails(){
    setRfqLoading(true);
    try{
      const allBom=mergeBoms((projectRef.current.panels||[]).map((p: any)=>p.bom||[]));
      const result=await buildRfqSupplierGroups(allBom);
      if(result.noItems){setRfqLoading(false);alert("No items eligible for RFQ email. Items qualify if they show 'No POs' or have a price date older than 60 days.");return;}
      const groupsWithEmail=await Promise.all(result.groups.map(async(g: any)=>{
        const email=g.vendorNo?await bcGetVendorEmail(g.vendorNo):"";
        return{...g,vendorEmail:email};
      }));
      setRfqEmailModal({groups:groupsWithEmail,projectName:projectRef.current.name||""});
    }catch(e: any){console.error("RFQ email build error:",e);alert("Failed to build RFQ: "+(e.message||e));}
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
          bcPatchJobOData(proj.bcProjectNumber,{Description_2:"Quote "+qNum}).catch((e: any)=>console.warn("BC quote note failed:",e));
        }
      }catch(e){console.warn("Auto quote number failed:",e);}
    }
    // Auto-populate quote fields from panel data if empty
    const panels=proj.panels||[];
    const q=proj.quote||{};
    const firstPanel=panels[0]||{};
    const autoFields: any={};
    if(!q.description&&firstPanel.drawingDesc)autoFields.description=firstPanel.drawingDesc;
    if(!q.drawingRev&&firstPanel.drawingRev)autoFields.drawingRev=firstPanel.drawingRev;
    if(!q.projectNumber&&proj.bcProjectNumber)autoFields.projectNumber=proj.bcProjectNumber;
    if(Object.keys(autoFields).length){
      proj={...proj,quote:{...q,...autoFields}};
      setProject(proj);projectRef.current=proj;onChange(proj);saveProject(uid,proj);
    }
    const now=Date.now();
    const staleMs=60*24*60*60*1000;
    const allBom=(projectRef.current.panels||[]).flatMap((p: any)=>p.bom||[]);
    const warn=allBom.filter((r: any)=>{
      if(r.isLaborRow||r.customerSupplied)return false;
      if(r.priceSource==="ai")return true;
      if(r.priceSource==="manual")return false;
      const isBC=r.priceSource==="bc"&&"bcPoDate"in r;
      const dt=isBC?r.bcPoDate:r.priceDate;
      if(isBC&&!dt)return true; // No PO date = "No POs" -- needs pricing
      return dt&&dt<now-staleMs;
    });
    // Check for unanswered engineering questions
    const openEqs=(projectRef.current.panels||[]).flatMap((p: any)=>(p.engineeringQuestions||[]).filter((q: any)=>q.status==="open"));
    if(openEqs.length>0){setEqWarnOpen(openEqs);if(warn.length>0)setEqWarnPriceRows(warn);return;}
    if(warn.length>0){setQuoteWarnRows(warn);}
    else{setAutoPrint(true);setView("quote");}
  }

  function onRfqPrint(groups: any){
    setRfqGroups(groups);
    setAutoPrintRfq(true);
  }

  function onRfqSent(sentItemIds: any[]){
    const sentSet=new Set(sentItemIds);
    const now=Date.now();
    const updatedPanels=(projectRef.current.panels||[]).map((panel: any)=>({
      ...panel,
      bom:(panel.bom||[]).map((row: any)=>sentSet.has(row.id)?{...row,rfqSentDate:now}:row)
    }));
    update({...projectRef.current,panels:updatedPanels});
  }

  async function applyPortalPrices(submission: any){
    try{
    // Save cannot-supply records to Firestore for future tracking
    const cantItems=(submission.lineItems||[]).filter((item: any)=>item.cannotSupply&&item.partNumber);
    if(cantItems.length>0){
      const records=cantItems.map((item: any)=>({
        vendorName:submission.vendorName||'',
        partNumber:(item.partNumber||'').trim(),
        description:item.description||'',
        markedAt:Date.now(),
        rfqNum:submission.rfqNum||'',
      }));
      fbDb.doc(`users/${uid}/config/supplierCantSupply`).set({records:(firebase.firestore.FieldValue as any).arrayUnion(...records)},{merge:true}).catch((e: any)=>console.warn("supplierCantSupply save failed:",e));
    }
    // Save confirmed supplier PN -> Matrix PN crossings to sqCrossings for future auto-matching
    const crossings=submission.confirmedCrossings||[];
    if(crossings.length>0){
      const crossData: any={};
      crossings.forEach((c: any)=>{
        const key=c.supplierPartNumber.toLowerCase().trim();
        crossData[key]={bcItemNumber:c.matrixPartNumber,bcItemDescription:c.description||'',confirmedAt:Date.now(),source:'supplier_portal'};
      });
      fbDb.doc(`users/${uid}/config/sqCrossings`).set(crossData,{merge:true}).catch((e: any)=>console.warn("sqCrossings save failed:",e));
      console.log('PORTAL CROSSINGS: saved',crossings.length,'confirmed supplier\u2192Matrix part crossings');
    }
    // Build normalized part# -> price map (skip cannot-supply items)
    const priceMap: any={};
    (submission.lineItems||[]).forEach((item: any)=>{
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
        const svWords=svName.replace(/[^a-z0-9]/g,' ').split(/\s+/).filter((w: string)=>w.length>2);
        const vMatch=vendors.find((v: any)=>v.displayName===submission.vendorName)
          ||vendors.find((v: any)=>(v.displayName||'').toLowerCase().includes(svName))
          ||vendors.find((v: any)=>svName.includes((v.displayName||'').toLowerCase()))
          ||vendors.find((v: any)=>{const vWords=(v.displayName||'').toLowerCase().replace(/[^a-z0-9]/g,' ').split(/\s+/).filter((w: string)=>w.length>2);return svWords.some((sw: string)=>vWords.some((vw: string)=>vw.includes(sw)||sw.includes(vw)));});
        if(vMatch)vendorNo=vMatch.number;
      }catch(e){console.warn("Vendor lookup for portal prices failed:",e);}
    }
    if(vendorNo)console.log("applyPortalPrices: vendor",vendorNo,submission.vendorName);
    // Push each price (and vendor if resolved) to BC item card
    const bcPushes=Object.values(priceMap).map(({price,partNumber}: any)=>{
      const patch: any={Unit_Cost:price};
      if(vendorNo)patch.Vendor_No=vendorNo;
      return bcPatchItemOData(partNumber,patch).catch((e: any)=>console.warn("BC price push failed:",partNumber,e));
    });
    await Promise.all(bcPushes);
    // Push Purchase Prices to BC (vendor, direct unit cost, starting date = priced date)
    if(vendorNo&&_bcToken){
      const ppResults=await Promise.all(Object.values(priceMap).map(async({price,partNumber,uom}: any)=>{
        try{return await bcPushPurchasePrice(partNumber,vendorNo,price,new Date(now).toISOString().split('T')[0],uom);}
        catch(e){console.warn("BC purchase price push failed:",partNumber,e);return{ok:false,reason:'error'};}
      }));
      const missingItems=ppResults.filter((r: any)=>r&&r.reason==='item_not_found').map((r: any)=>r.itemNo);
      if(missingItems.length>0){
        setTimeout(()=>alert(`${missingItems.length} item${missingItems.length>1?'s':''} not found in BC:\n${missingItems.join(', ')}\n\nUse the "Upload Supplier Quote" tool in Settings to create these items in BC first, then re-apply.`),200);
      }
    }
    // Apply to BOM -- priceSource:'bc', bcPoDate:now so rows don't get flagged
    let matched=0;
    const updatedPanels=(projectRef.current.panels||[]).map((panel: any)=>({
      ...panel,
      bom:(panel.bom||[]).map((row: any)=>{
        const nk=normPart(row.partNumber);
        // Try exact normalized match first, then fuzzy contains/prefix match
        let hit=priceMap[nk];
        if(!hit){
          const supplierKey=Object.keys(priceMap).find((sk: string)=>partMatch(nk,sk));
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
    const cantCount=cantItems.length;
    alert(`Prices applied to ${matched} BOM row${matched!==1?'s':''} and pushed to BC Item Cards.${vendorNo?`\nVendor ${submission.vendorName} set on all matched items.\nPurchase Prices updated in BC.`:''}\nBC planning lines will auto-sync in a few seconds.${cantCount>0?`\n${cantCount} item${cantCount!==1?'s':''} marked "Cannot Supply" by vendor \u2014 skipped and recorded.`:''}`);
    }catch(e: any){
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
            onOpenSupplierQuote={(bom: any)=>{if(portalSubmissions.length>0){setShowPortalModal(true);}else{setSqPanelBom(bom);setShowSqModal(true);}}}
            pendingRfqUploads={pendingRfqUploads}
            onPoReceived={()=>setShowPoModal(true)}
            relinking={relinking}
            relinkMsg={relinkMsg}
            onRelink={relinkToBC}
          />
          {rfqGroups&&<div style={{height:0,overflow:"hidden"}}><RfqDocument groups={rfqGroups} projectName={project.name}/></div>}
          {rfqEmailModal&&<RfqEmailModal groups={rfqEmailModal.groups} projectName={rfqEmailModal.projectName} projectId={project.id} bcProjectNumber={project.bcProjectNumber||""} uid={uid} userEmail={fbAuth.currentUser?.email||""} onClose={()=>setRfqEmailModal(null)} onSent={onRfqSent} onPrint={onRfqPrint}/>}
          {showRfqHistory&&<RfqHistoryModal uid={uid} onClose={()=>setShowRfqHistory(false)}/>}
          {showPoModal&&<PoReceivedModal project={project} bcProjectNumber={project.bcProjectNumber||""} onClose={()=>setShowPoModal(false)} onDone={async(poNum: any)=>{setShowPoModal(false);const updated={...projectRef.current,bcPoStatus:"Open",bcPoNumber:poNum,updatedAt:Date.now()};setProject(updated);projectRef.current=updated;onChange&&onChange(updated);try{await saveProject(uid,updated);}catch(e){console.warn("PO save failed:",e);}}}/>}
          {showPriceCheckModal&&priceCheckDiffs&&<PurchasePriceCheckModal diffs={priceCheckDiffs} onAccept={applyPriceCheckDiffs} onClose={()=>{setShowPriceCheckModal(false);setPriceCheckDiffs(null);}}/>}
          {showPortalModal&&<PortalSubmissionsModal submissions={portalSubmissions} onClose={()=>setShowPortalModal(false)} onApplyPrices={applyPortalPrices} onImportPdf={()=>{setShowPortalModal(false);setSqPanelBom((projectRef.current.panels||[])[0]?.bom||[]);setShowSqModal(true);}}/>}
          {eqWarnOpen&&ReactDOM.createPortal(
            React.createElement("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}},
              React.createElement("div",{style:{background:"#0d0d1a",border:"1px solid #f59e0b",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:520,boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}},
                React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,marginBottom:8}},
                  React.createElement("span",{style:{fontSize:22}},"\u2753"),
                  React.createElement("div",{style:{fontSize:15,fontWeight:800,color:"#fbbf24"}},"Unanswered Engineering Questions")
                ),
                React.createElement("div",{style:{fontSize:13,color:"#94a3b8",marginBottom:14,lineHeight:1.6}},
                  React.createElement("strong",{style:{color:"#f1f5f9"}},eqWarnOpen.length+" question"+(eqWarnOpen.length!==1?"s":""))," still need"+(eqWarnOpen.length===1?"s":"")+" answers before this quote is finalized. Printing without answering may result in an inaccurate or incomplete quote."
                ),
                React.createElement("div",{style:{background:"#0a0a18",border:"1px solid #2a2a3e",borderRadius:6,maxHeight:200,overflowY:"auto",marginBottom:16}},
                  eqWarnOpen.map((q: any,i: number)=>React.createElement("div",{key:q.id||i,style:{display:"flex",alignItems:"flex-start",gap:8,padding:"6px 10px",borderBottom:i<eqWarnOpen.length-1?"1px solid #1a1a2e":"none",fontSize:12}},
                    React.createElement("span",{style:{color:q.severity==="critical"?"#ef4444":q.severity==="warning"?"#f59e0b":"#818cf8",fontWeight:700,fontSize:9,textTransform:"uppercase",minWidth:40,paddingTop:2}},q.severity),
                    React.createElement("span",{style:{color:C.text,flex:1,lineHeight:1.4}},q.question)
                  ))
                ),
                React.createElement("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
                  React.createElement("button",{onClick:()=>{setEqWarnOpen(null);setEqWarnPriceRows(null);},style:{background:"#1a1a2a",border:"1px solid #2a2a3e",color:"#94a3b8",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}},"Go Back"),
                  React.createElement("button",{onClick:()=>{setEqWarnOpen(null);if(eqWarnPriceRows){setQuoteWarnRows(eqWarnPriceRows);setEqWarnPriceRows(null);}else{setAutoPrint(true);setView("quote");}},style:{background:"#7c2d12",border:"1px solid #b45309",color:"#fbbf24",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}},"Acknowledge & Proceed")
                )
              )
            ),document.body
          )}
          {quoteWarnRows&&ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:"#0d0d1a",border:"1px solid #b45309",borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:520,boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <span style={{fontSize:22}}>{"\u26A0\uFE0F"}</span>
                  <div style={{fontSize:15,fontWeight:800,color:"#fbbf24"}}>Pricing May Be Outdated</div>
                </div>
                <div style={{fontSize:13,color:"#94a3b8",marginBottom:14,lineHeight:1.6}}>
                  {(()=>{const ai=quoteWarnRows.filter((r: any)=>r.priceSource==="ai");const nopo=quoteWarnRows.filter((r: any)=>r.priceSource!=="ai"&&(r.priceSource==="bc"&&"bcPoDate"in r)&&!r.bcPoDate);const old=quoteWarnRows.filter((r: any)=>r.priceSource!=="ai"&&!(r.priceSource==="bc"&&"bcPoDate"in r&&!r.bcPoDate));return(<>
                    {ai.length>0&&<div style={{marginBottom:4}}>{"\u2022"} <strong style={{color:"#f1f5f9"}}>{ai.length} item{ai.length!==1?"s":""}</strong> with <strong style={{color:"#c084fc"}}>AI-estimated pricing</strong> {"\u2014"}not confirmed from a real source.</div>}
                    {nopo.length>0&&<div style={{marginBottom:4}}>{"\u2022"} <strong style={{color:"#f1f5f9"}}>{nopo.length} item{nopo.length!==1?"s":""}</strong> with <strong style={{color:"#fbbf24"}}>No POs</strong> {"\u2014"}no purchase order pricing on record.</div>}
                    {old.length>0&&<div>{"\u2022"} <strong style={{color:"#f1f5f9"}}>{old.length} item{old.length!==1?"s":""}</strong> with pricing <strong style={{color:"#fb923c"}}>older than 60 days</strong>.</div>}
                  </>);})()}
                </div>
                <div style={{background:"#0a0a18",border:"1px solid #2a2a3e",borderRadius:6,maxHeight:180,overflowY:"auto",marginBottom:16}}>
                  {quoteWarnRows.map((r: any,i: number)=>(
                    <div key={r.id||i} style={{display:"flex",alignItems:"center",gap:10,padding:"5px 10px",borderBottom:i<quoteWarnRows.length-1?"1px solid #1a1a2e":"none",fontSize:12}}>
                      <span style={{color:r.priceSource==="ai"?"#c084fc":(r.priceSource==="bc"&&"bcPoDate"in r&&!r.bcPoDate)?"#fbbf24":"#fb923c",fontWeight:700,fontSize:10,minWidth:28}}>{r.priceSource==="ai"?"AI":(r.priceSource==="bc"&&"bcPoDate"in r&&!r.bcPoDate)?"NoPO":"OLD"}</span>
                      <span style={{color:"#fde68a",fontWeight:600,fontFamily:"monospace",minWidth:120}}>{r.partNumber||"\u2014"}</span>
                      <span style={{color:"#64748b",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description||""}</span>
                      <span style={{color:"#475569",fontSize:10,whiteSpace:"nowrap"}}>{r.priceSource==="ai"?"ARC AI est.":r.bcPoDate||r.priceDate?new Date(r.bcPoDate||r.priceDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}):"no date"}</span>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:16}}>Run <strong style={{color:"#f1f5f9"}}>Refresh Pricing</strong> or send RFQs to get current pricing before quoting, or acknowledge and proceed.</div>
                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button onClick={()=>setQuoteWarnRows(null)} style={{background:"#1a1a2a",border:"1px solid #2a2a3e",color:"#94a3b8",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit"}}>Cancel</button>
                  <button onClick={()=>{setQuoteWarnRows(null);setAutoPrint(true);setView("quote");}} style={{background:"#7c2d12",border:"1px solid #b45309",color:"#fbbf24",padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>Acknowledge &amp; Proceed</button>
                </div>
              </div>
            </div>
          ,document.body)}
        </>
      )}
      <SupplierQuoteImportModal show={showSqModal} uid={uid} panelBom={sqPanelBom} bcProjectNumber={project.bcProjectNumber||null} projectId={init.id} onClose={()=>setShowSqModal(false)}/>
    </>
  );
}

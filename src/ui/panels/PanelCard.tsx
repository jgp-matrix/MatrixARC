/* eslint-disable */
// @ts-nocheck
// PanelCard.tsx — Verbatim extraction from monolith index.html v1.19.376 lines 9686-12336.
// DO NOT EDIT — re-extract from monolith if changes are needed.

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import {
  fbAuth, fbStorage, _apiKey, _bcToken, _appCtx, _bcConfig,
  saveProjectPanel, useBgTasks, apiCall,
  bgStart, bgSetPct, bgUpdate, bgDone, bgError, bgDismiss,
  notifyProjectListeners,
} from '@/core/globals';
import { getPageTypes, appendDefaultBomItems, isPanelBudgetary, categorizePart } from '@/core/helpers';
import { normPart } from '@/bom/deduplicator';
import { computeFallbackLaborHours, computeLaborEstimate, buildLaborBomRows, syncLaborBomRows } from '@/bom/laborEstimator';
import { computePanelSellPrice } from '@/bom/quoteBuilder';
import { loadAlternates, loadCorrectionDB, saveAlternateEntry, setAltAutoReplace, saveCorrectionEntry, guessCorrection, findPartSuggestion, applyPartCorrections, loadPageTypeLearning, savePageTypeLearningEntry, loadLayoutLearning, saveLayoutLearningEntry } from '@/bom/partLibrary';
import { runPanelValidation, calcConfidence } from '@/bom/validator';
import { extractBomPage, verifyPartNumbers, cropRegionFromImage, buildRegionContext, getExtractionUnits } from '@/bom/extractor';
import { runExtractionTask } from '@/bom/extractionPipeline';
import { estimatePrices } from '@/bom/pricer';
import { extractPdfPages, extractImagePage, resizeImage, ensureDataUrl, detectSheetMm, resizeForAnalysis } from '@/scanning/pdfExtractor';
import { classifyPages, detectZoomedPages, extractPanelMetadata } from '@/scanning/pageClassifier';
import { burnStampCanvas } from '@/scanning/imageUtils';
import { buildPageRegionNotes, buildAllRegionSummary, buildLayoutLearningHint, buildLearningHint, buildDeviceClassificationHint, mergeLayoutResults } from '@/scanning/drawingAnalyzer';
import { lookupItem as bcLookupItem, searchItems as bcSearchItems, bcFuzzyLookup, patchItemOData as bcPatchItemOData } from '@/services/businessCentral/items';
import { bcCheckAttachmentExists, bcSyncPanelPlanningLines, bcCreatePanelTaskStructure } from '@/services/businessCentral/projects';
import { bcGetVendorMap, bcResolveVendorName } from '@/services/businessCentral/vendors';
import { fetchPurchasePrices as bcFetchPurchasePrices } from '@/services/businessCentral/prices';

import Badge from '@/ui/shared/Badge';
import DrawingLightbox from '@/ui/shared/DrawingLightbox';
import BCItemBrowserModal from '@/ui/modals/BCItemBrowserModal';
import CPDSearchModal from '@/ui/modals/CPDSearchModal';
import UpdateBomInBCModal from '@/ui/modals/UpdateBomInBCModal';
import EngineeringQuestionsModal from '@/ui/modals/EngineeringQuestionsModal';

// ─── Monolith functions not yet extracted into services ──────────────────────
import { loadPartLibrary, loadPartCorrections } from '@/services/firebase/firestore';
async function bcAttachPdfToJob(...args: any[]) { console.warn('bcAttachPdfToJob stub'); }
async function bcDeleteAttachmentByName(...args: any[]) { console.warn('bcDeleteAttachmentByName stub'); }
import { useSmoothProgress } from '@/core/useSmoothProgress';

// ─── Monolith inline helpers referenced but defined at module scope ──────────
import { isReadOnly, isAdmin } from '@/core/globals';

function PanelCard({panel,idx,uid,projectId,projectName,bcProjectNumber,bcDisconnected,readOnly,onDelete,onUpdate,onSaveImmediate,onViewQuote,onPrintRfq,onSendRfqEmails,rfqLoading,onOpenSupplierQuote,isSelected,onSelect,quoteData,quoteRev,bcUploadRef}){
  const [dragging,setDragging]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [processingMsg,setProcessingMsg]=useState("");
  const [docDragging,setDocDragging]=useState(false);
  const [docUploading,setDocUploading]=useState(false);
  const docFileRef=useRef(null);
  async function uploadOtherDoc(files){
    if(!files||!files.length||!bcProjectNumber||!_bcToken)return;
    setDocUploading(true);
    const newDocs=[...(panel.otherDocs||[])];
    for(const file of files){
      try{
        const arrayBuf=await file.arrayBuffer();
        // DECISION(v1.19.375): REF- prefix for reference/other documents.
        const fileName=`REF-${file.name}`;
        await bcAttachPdfToJob(bcProjectNumber,fileName,arrayBuf,null);
        // Also upload to Firebase Storage for preview
        let storageUrl=null;
        try{
          const storagePath=`pageImages/${uid}/${projectId}/docs/${Date.now()}_${file.name}`;
          const ref=fbStorage.ref(storagePath);
          await ref.put(file,{contentType:file.type});
          storageUrl=await ref.getDownloadURL();
        }catch(e){console.warn("Storage upload for doc preview failed:",e.message);}
        newDocs.push({name:file.name,bcFileName:fileName,uploadedAt:Date.now(),size:file.size,storageUrl});
      }catch(e){console.warn("Other doc upload failed:",file.name,e.message);}
    }
    const updated={...panel,otherDocs:newDocs};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
    setDocUploading(false);
  }
  function removeOtherDoc(idx){
    const doc=(panel.otherDocs||[])[idx];
    if(!doc)return;
    if(!confirm(`Remove "${doc.name}" from the list?`))return;
    // Delete from BC if possible
    if(doc.bcFileName&&bcProjectNumber)bcDeleteAttachmentByName(bcProjectNumber,doc.bcFileName).catch(()=>{});
    const updated={...panel,otherDocs:(panel.otherDocs||[]).filter((_,i)=>i!==idx)};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
  }
  const [detecting,setDetecting]=useState(false);
  const [detectProgress,setDetectProgress]=useState("");
  const [awaitingConfirm,setAwaitingConfirm]=useState(false);
  const [extractionNotes,setExtractionNotes]=useState(panel.extractionNotes||"");
  const pendingNewItemsRef=useRef([]);
  const pageTypeChangesRef=useRef({});
  const learningExamplesRef=useRef([]);
  const latestPanelRef=useRef(panel);
  const eqModalShownRef=useRef(false);
  const [reasonPickerFor,setReasonPickerFor]=useState(null);
  const [extracting,setExtracting]=useState(false);
  const ep=useSmoothProgress();
  const bgTasks=useBgTasks();
  const bgTask=bgTasks[panel.id];
  // Restore extracting spinner if a bg task is still running when this panel mounts
  useEffect(()=>{if(bgTask?.status==="running")setExtracting(true);},[]);
  // Progress bar: use bgTask (persists navigation) or ep (for re-extract/validate flows)
  const extractProgress=(bgTask?.status==="running"||bgTask?.status==="done")?{pct:bgTask.pct||0,msg:bgTask.msg}:ep.progress;
  // Unified progress: pricing takes priority when active, then extraction, then null
  const _showExtract=extractProgress&&(!awaitingConfirm||detecting);
  // When aiPricing=true, guarantee a non-null value even if pricingProgress state hasn't synced yet
  // NOTE: aiPricing and pricingProgress are declared below but referenced here.
  // In the monolith, Babel converts const→var (hoisted). In ESM builds, const has TDZ.
  // We use var here to match monolith behavior.
  var [aiPricing,setAiPricing]=useState(false);
  var [pricingProgress,setPricingProgress]=useState(null);
  const _activePricing=aiPricing?(pricingProgress||{msg:"Getting prices…",pct:5}):pricingProgress;
  const _rawUnified=_activePricing||(_showExtract?extractProgress:null);
  const unifiedProgress=_rawUnified?{..._rawUnified,isError:_rawUnified.isError||bgTask?.status==="error"}:null;
  const [lightboxId,setLightboxId]=useState(null);
  const [showCompliance,setShowCompliance]=useState(false);
  const [draftName,setDraftName]=useState(panel.name||"");
  const [draftNo,setDraftNo]=useState((panel.drawingNo||"").slice(0,25));
  const [draftDesc,setDraftDesc]=useState(panel.drawingDesc||"");
  const [draftRev,setDraftRev]=useState(panel.drawingRev||"");
  const [draftShipDate,setDraftShipDate]=useState(panel.requestedShipDate||"");
  const [draftLineQty,setDraftLineQty]=useState(panel.lineQty??1);
  const [bcSyncing,setBcSyncing]=useState(false);
  const [bcSyncStatus,setBcSyncStatus]=useState(null); // null | "ok" | "error"
  const [unpricedAlert,setUnpricedAlert]=useState(null); // null | array of unpriced rows
  const [syncFailedAlert,setSyncFailedAlert]=useState(null); // null | array of failed rows
  const [bcSyncErrors,setBcSyncErrors]=useState({}); // rowId -> {partNumber,description,error} — persists after modal closes
  const [panelCollapsed,setPanelCollapsed]=useState(false);
  const bcAutoSyncTimer=useRef(null);
  const bcPrevSyncCount=useRef(-1);
  const [draftNoWarn,setDraftNoWarn]=useState(false);
  const draftNoWarnTimer=useRef(null);
  const pricingClearTimer=useRef(null);
  const [extractingTitle,setExtractingTitle]=useState(false);
  const [tagsChanged,setTagsChanged]=useState(false);
  const [aiFeedback,setAiFeedback]=useState("");
  const [reExtracting,setReExtracting]=useState(false);
  const [feedbackSaved,setFeedbackSaved]=useState(false);
  const [showAiQuestions,setShowAiQuestions]=useState(false);
  const [showEqModal,setShowEqModal]=useState(false);
  const [aiAnswers,setAiAnswers]=useState({});
  const [err,setErr]=useState("");
  const [reExtractWarn,setReExtractWarn]=useState(false);
  const [attachingPdf,setAttachingPdf]=useState(false);
  const [attachPdfMsg,setAttachPdfMsg]=useState("");
  const [bcPdfMissing,setBcPdfMissing]=useState(false);
  useEffect(()=>{
    if(!panel.bcPdfAttached||!panel.bcPdfFileName||!bcProjectNumber||!_bcToken)return;
    setBcPdfMissing(false);
    bcCheckAttachmentExists(bcProjectNumber,panel.bcPdfFileName).then(exists=>{
      if(exists===false)setBcPdfMissing(true);
    });
  },[panel.bcPdfAttached,panel.bcPdfFileName,bcProjectNumber]);
  const [partLibrary,setPartLibrary]=useState([]);
  const [partCorrections,setPartCorrections]=useState([]);
  // aiPricing and pricingProgress declared earlier (before _activePricing)
  const [bcConnecting,setBcConnecting]=useState(false);
  const [bcError,setBcError]=useState("");
  const [validatingPanel,setValidatingPanel]=useState(false);
  const [valPct,setValPct]=useState(0);
  const valTarget=useRef(0);
  const valRaf=useRef(null);
  const [bcFuzzySuggestions,setBcFuzzySuggestions]=useState(panel.bcFuzzySuggestions||{});
  const [bcBrowserOpen,setBcBrowserOpen]=useState(false);
  const [laborMoreInfo,setLaborMoreInfo]=useState(false);
  const [showUpdateBom,setShowUpdateBom]=useState(false);
  const [deleteConfirmId,setDeleteConfirmId]=useState(null);
  const [priceTooltip,setPriceTooltip]=useState(null); // {x,y,vendor,date,price,source}
  const [aiSourceTooltip,setAiSourceTooltip]=useState(null); // {x,y,sources:[{name,url,type}]}
  const aiSourceTooltipTimer=useRef(null);
  const [bcBrowserTarget,setBcBrowserTarget]=useState(null);
  const [bcNewlyCreated,setBcNewlyCreated]=useState(new Set());
  const [bcUpdatedRows,setBcUpdatedRows]=useState(new Set());
  const [bcUpdateNotif,setBcUpdateNotif]=useState(false);
  const [bcBrowserQuery,setBcBrowserQuery]=useState("");
  const [pendingPages,setPendingPages]=useState([]);
  const [alternates,setAlternates]=useState([]);
  const [crossOrCorrectPending,setCrossOrCorrectPending]=useState(null);
  // DECISION(v1.19.376): Price confirmation popup — when user manually enters a price,
  // ask if it's confirmed (push to BC Purchase Price + Item Card) or budgetary (BOM only, no BC update, no priceDate).
  const [priceConfirmPending,setPriceConfirmPending]=useState(null); // {id, partNumber, price, row}
  const [priceConfirmVendor,setPriceConfirmVendor]=useState("");
  const [cpdQuery,setCpdQuery]=useState("");
  const [showCpdSearch,setShowCpdSearch]=useState(false);
  const [bomVendorList,setBomVendorList]=useState([]);
  const bomVendorListLoaded=useRef(false);
  const altAutoApplied=useRef(false);
  const feedbackRef=useRef(null);
  const fileRef=useRef(null);
  const autoSaveTimer=useRef(null);
  const panelRef=useRef(panel);
  useEffect(()=>{panelRef.current=panel;},[panel]);
  const bomEditRef=useRef({});
  useEffect(()=>{
    loadPartLibrary(uid).then(setPartLibrary);
    loadPartCorrections(uid).then(setPartCorrections);
  },[uid]);
  useEffect(()=>()=>{if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);},[]);

  // Load alternates + corrections and auto-apply on mount
  useEffect(()=>{
    const normPN=s=>s.replace(/[-\s./\\]/g,'').toUpperCase();
    Promise.all([loadAlternates(uid),loadCorrectionDB(uid)]).then(([alts,corrs])=>{
      setAlternates(alts);
      if(altAutoApplied.current)return;
      altAutoApplied.current=true;
      const bom=panel.bom||[];
      let changed=false;
      const newBom=bom.map(r=>{
        if(r.isLaborRow||r.isCrossed||r.isCorrection)return r;
        const pn=(r.partNumber||"").trim();
        if(!pn)return r;
        // Auto-replace: exact match first, then normalized match (catches format variants)
        const alt=alts.find(a=>a.autoReplace&&(a.originalPN===pn||normPN(a.originalPN)===normPN(pn)));
        if(alt){
          changed=true;
          return{...r,partNumber:alt.replacement.partNumber,description:alt.replacement.description||r.description,unitPrice:alt.replacement.unitCost??r.unitPrice,priceSource:"bc",priceDate:Date.now(),isCrossed:true,crossedFrom:pn,autoReplaced:true};
        }
        // Auto-correct: apply known corrections (exact or normalized match)
        const corr=corrs.find(c=>c.badPN===pn||normPN(c.badPN)===normPN(pn));
        if(corr){
          changed=true;
          return{...r,partNumber:corr.correctedPN,isCorrection:true,correctionType:corr.type||'extraction',correctionFrom:pn};
        }
        return r;
      });
      if(changed){const updated={...panel,bom:newBom};onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}}
    }).catch(()=>{});
  },[uid]);

  // Backfill bcVendorName for BC-priced rows that are missing it
  // Retries every 3s until BC connects (auto-connect is async)
  const vendorBackfillRan=useRef(false);
  useEffect(()=>{
    if(vendorBackfillRan.current)return;
    function tryBackfill(){
      if(vendorBackfillRan.current)return;
      if(!_bcToken){console.log("VENDOR BACKFILL: waiting for BC…");return;}
      const bom=panel.bom||[];
      const needVendor=bom.filter(r=>!r.isLaborRow&&r.priceSource==="bc"&&!r.bcVendorName&&(r.partNumber||"").trim());
      if(!needVendor.length){vendorBackfillRan.current=true;return;}
      vendorBackfillRan.current=true;
      (async()=>{
        try{
          const pnVendor={};
          for(const row of needVendor){
            const pn=(row.partNumber||"").trim();
            if(pnVendor[pn]!==undefined)continue;
            const vNo=await bcGetItemVendorNo(pn);
            pnVendor[pn]=vNo?await bcGetVendorName(vNo):"";
            console.log("VENDOR BACKFILL:",pn,"→ vendorNo=",vNo,"→ name=",pnVendor[pn]);
          }
          let changed=false;
          const newBom=bom.map(r=>{
            if(!r.isLaborRow&&r.priceSource==="bc"&&!r.bcVendorName){
              const pn=(r.partNumber||"").trim();
              const name=pnVendor[pn];
              if(name){changed=true;return{...r,bcVendorName:name};}
            }
            return r;
          });
          if(changed){
            const updated={...panel,bom:newBom};
            onUpdate(updated);
            try{onSaveImmediate(updated);}catch(e){}
            console.log("VENDOR BACKFILL: updated",newBom.filter(r=>r.bcVendorName&&!bom.find(o=>o.id===r.id&&o.bcVendorName)).length,"rows for panel",panel.name);
          }
        }catch(e){console.warn("Vendor backfill error:",e);}
      })();
    }
    tryBackfill();
    const iv=setInterval(tryBackfill,3000);
    return()=>clearInterval(iv);
  },[uid]);

  // Backfill priceDate for rows that have a price but no priceDate
  const priceDateBackfillRan=useRef(false);
  useEffect(()=>{
    if(priceDateBackfillRan.current)return;
    const bom=panel.bom||[];
    const needDate=bom.filter(r=>r.unitPrice!=null&&r.priceSource&&r.priceSource!=="ai"&&!r.priceDate);
    if(!needDate.length)return;
    priceDateBackfillRan.current=true;
    const fallbackDate=panel.updatedAt||panel.createdAt||Date.now();
    const newBom=bom.map(r=>{
      if(r.unitPrice!=null&&r.priceSource&&r.priceSource!=="ai"&&!r.priceDate)return{...r,priceDate:fallbackDate};
      return r;
    });
    const updated={...panel,bom:newBom};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
    console.log("PRICEDATE BACKFILL:",needDate.length,"rows for panel",panel.name);
  },[]);

  // Backfill bcPoDate for BC-priced rows — batch via Purchase Prices OData
  const bcNeedingPoDate=(panel.bom||[]).filter(r=>r.priceSource==="bc"&&!r.isLaborRow&&!("bcPoDate"in r)&&(r.partNumber||"").trim());
  useEffect(()=>{
    if(!bcNeedingPoDate.length)return;
    let cancelled=false;
    function tryBackfill(){
      if(!_bcToken)return;
      (async()=>{
        const partNums=[...new Set(bcNeedingPoDate.map(r=>(r.partNumber||"").trim()).filter(Boolean))];
        const ppMap=await bcFetchPurchasePrices(partNums);
        if(cancelled)return;
        const newBom=(panel.bom||[]).map(r=>{
          if(r.priceSource!=="bc"||r.isLaborRow||("bcPoDate"in r))return r;
          const pn=(r.partNumber||"").trim();
          const pp=ppMap.get(pn);
          return pp&&pp.startingDate?{...r,bcPoDate:pp.startingDate}:r;
        });
        const updated={...panel,bom:newBom};
        onUpdate(updated);
        try{onSaveImmediate(updated);}catch(e){}
      })().catch(()=>{});
    }
    tryBackfill();
    const iv=setInterval(()=>{if(_bcToken){clearInterval(iv);tryBackfill();}},3000);
    return()=>{cancelled=true;clearInterval(iv);};
  },[bcNeedingPoDate.length]);

  // Dismiss BC update notification on any click
  useEffect(()=>{
    if(!bcUpdateNotif)return;
    const dismiss=()=>setBcUpdateNotif(false);
    document.addEventListener("click",dismiss,{once:true});
    return()=>document.removeEventListener("click",dismiss);
  },[bcUpdateNotif]);

  // Poll BC every 5 minutes to keep bcPoDate and unitPrice current — uses batch Purchase Prices OData
  const bcPollRunning=useRef(false);
  useEffect(()=>{
    const POLL_MS=5*60*1000;
    async function pollBcPricing(){
      if(bcPollRunning.current||!_bcToken)return;
      bcPollRunning.current=true;
      try{
        const p=latestPanelRef.current;
        const rows=(p.bom||[]).filter(r=>r.priceSource==="bc"&&!r.isLaborRow&&(r.partNumber||"").trim());
        if(!rows.length)return;
        const partNums=[...new Set(rows.map(r=>(r.partNumber||"").trim()).filter(Boolean))];
        const ppMap=await bcFetchPurchasePrices(partNums);
        // Only update rows where bcPoDate or unitPrice actually changed
        const fresh=latestPanelRef.current;
        let changed=false;
        const changedIds=[];
        const newBom=(fresh.bom||[]).map(r=>{
          if(r.priceSource!=="bc"||r.isLaborRow)return r;
          const pn=(r.partNumber||"").trim();
          const pp=ppMap.get(pn);
          if(!pp)return r;
          const bcPoDate=pp.startingDate||null;
          const unitPrice=pp.directUnitCost||null;
          const newPoDate=(bcPoDate!=null&&(r.bcPoDate==null||bcPoDate>r.bcPoDate))?bcPoDate:r.bcPoDate;
          const priceChanged=unitPrice!==null&&r.unitPrice!==unitPrice;
          const dateChanged=newPoDate!==r.bcPoDate;
          if(!priceChanged&&!dateChanged)return r;
          changed=true;
          changedIds.push(String(r.id));
          return{...r,bcPoDate:newPoDate,...(priceChanged?{unitPrice}:{})};
        });
        if(changed){
          const updated={...fresh,bom:newBom};
          onUpdate(updated);
          try{onSaveImmediate(updated);}catch(e){}
          setBcUpdatedRows(new Set(changedIds));
          setBcUpdateNotif(true);
          setTimeout(()=>setBcUpdatedRows(new Set()),4000);
        }
      }finally{bcPollRunning.current=false;}
    }
    const iv=setInterval(pollBcPricing,POLL_MS);
    return()=>clearInterval(iv);
  },[]);

  // Load vendor list for BOM supplier dropdown (retry until BC connects)
  useEffect(()=>{
    if(bomVendorListLoaded.current)return;
    function tryLoad(){
      if(bomVendorListLoaded.current||!_bcToken)return;
      bomVendorListLoaded.current=true;
      bcListVendors().then(v=>{if(v.length)setBomVendorList(v);else bomVendorListLoaded.current=false;}).catch(()=>{bomVendorListLoaded.current=false;});
    }
    tryLoad();
    const iv=setInterval(tryLoad,3000);
    return()=>clearInterval(iv);
  },[]);

  // Background CPD cataloging — runs on panel load, silently logs BOM + metadata to CPD database
  useEffect(()=>{
    const bom=panel.bom||[];
    const items=bom.filter(r=>!r.isLaborRow&&r.partNumber);
    if(!items.length)return;
    const pgs=panel.pages||[];
    const categorized=items.map(r=>({...r,cpdCategory:r.cpdCategory||categorizePart(r.partNumber,r.description)}));
    // Log BOM immediately (no metadata yet)
    logPanelToCPD(uid,panel,categorized).then(async()=>{
      // Extract metadata from drawings in background (only if API key + pages available)
      if(_apiKey&&pgs.length){
        const metadata=await extractPanelMetadata(pgs).catch(()=>null);
        if(metadata)await logPanelToCPD(uid,panel,categorized,metadata).catch(()=>{});
      }
      // Enrich products that haven't been enriched yet
      if(_apiKey){
        const cpd=await loadCPD(uid).catch(()=>null);
        if(cpd){
          const unenriched=(cpd.products||[]).filter(p=>!p.enriched&&p.partNumber);
          for(const p of unenriched.slice(0,4)){
            await enrichProductDetails(uid,p.partNumber,p.description,p.category).catch(()=>{});
          }
        }
      }
    }).catch(()=>{});
  },[panel.id]);

  // BC item pulse check — verify bcItemNumber still exists in BC on mount
  useEffect(()=>{
    if(!panel.bcItemNumber)return;
    (async()=>{
      try{
        if(!_bcToken){await acquireBcToken(false);}
        if(!_bcToken)return;
        const item=await bcLookupItem(panel.bcItemNumber);
        if(!item){
          const updated={...panel,bcItemNumber:null,status:panel.status==="pushed_to_bc"?"costed":panel.status,updatedAt:Date.now()};
          onUpdate(updated);
          try{await onSaveImmediate(updated);}catch(e){}
        }
      }catch(e){console.warn("BC item pulse check failed:",e);}
    })();
  },[panel.bcItemNumber]);

  // Auto-sync labor BOM rows whenever labor data or pricing changes
  const _laborSyncKey=JSON.stringify([panel.laborData,panel.pricing?.laborRate,panel.pricing?.laborHoursOverride]);
  useEffect(()=>{
    const laborRows=buildLaborBomRows(panel);
    if(!laborRows.length)return;
    const curLabor=(panel.bom||[]).filter(r=>r.isLaborRow);
    const same=laborRows.length===curLabor.length&&laborRows.every((lr,i)=>curLabor[i]&&curLabor[i].qty===lr.qty&&curLabor[i].partNumber===lr.partNumber);
    if(same)return;
    const nonLabor=(panel.bom||[]).filter(r=>!r.isLaborRow);
    const updated={...panel,bom:[...laborRows,...nonLabor]};
    onUpdate(updated);
    const t=setTimeout(()=>onSaveImmediate(updated).catch(()=>{}),800);
    return()=>clearTimeout(t);
  },[_laborSyncKey]);

  // Keep latestPanelRef current so async closures always have fresh panel data
  latestPanelRef.current=panel;

  const savedPages=panel.pages||[];
  const pages=pendingPages.length>0?pendingPages:savedPages;
  const typeColors={bom:C.accent,schematic:C.green,backpanel:C.purple,enclosure:C.teal||"#0d9488",layout:C.purple,pid:C.muted};
  const SHORT={bom:"BOM",schematic:"SCH",backpanel:"BP",enclosure:"ENC",layout:"LAY",pid:"P&ID"};
  const bomCount=pages.filter(p=>getPageTypes(p).includes("bom")).length;
  const schCount=pages.filter(p=>getPageTypes(p).includes("schematic")).length;
  const backpanelCount=pages.filter(p=>getPageTypes(p).includes("backpanel")).length;
  const enclosureCount=pages.filter(p=>getPageTypes(p).includes("enclosure")).length;
  const layoutCount=pages.filter(p=>getPageTypes(p).includes("layout")).length; // legacy

  async function addFiles(files){
    console.log("ADDFILES: start, files="+files.length+", apiKey="+(!!_apiKey));
    setProcessing(true);setErr("");
    bgStart(panel.id, panel.name||("Panel "+(idx+1)), projectId);
    let updated;
    try{
    const newItems=[];
    let livePages=[...savedPages];
    for(const f of Array.from(files)){
      if(f.type==="application/pdf"){
        await window.pdfjsReady;
        const pdfjs=window._pdfjs;
        const buf=await f.arrayBuffer();
        const pdf=await pdfjs.getDocument({data:buf}).promise;
        for(let pg=1;pg<=pdf.numPages;pg++){
          setProcessingMsg(`${f.name} p${pg}/${pdf.numPages}`);
          const page=await pdf.getPage(pg);
          const vp=page.getViewport({scale:4.0});
          const canvas=document.createElement("canvas");
          canvas.width=vp.width;canvas.height=vp.height;
          await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
          let srcCanvas=canvas;
          if(canvas.height>canvas.width){
            const rot=document.createElement("canvas");rot.width=canvas.height;rot.height=canvas.width;
            const rctx=rot.getContext("2d");rctx.translate(0,rot.height);rctx.rotate(-Math.PI/2);rctx.drawImage(canvas,0,0);
            canvas.width=0;canvas.height=0;srcCanvas=rot;
          }
          const dataUrl=srcCanvas.toDataURL("image/jpeg",0.95);
          srcCanvas.width=0;srcCanvas.height=0;
          const resized=await resizeImage(dataUrl,3800);
          const item={id:Date.now()+Math.random(),name:`${f.name} — p${pg}`,dataUrl:resized,types:[]};
          newItems.push(item);
          livePages=[...livePages,item];
          setPendingPages([...livePages]);
        }
      } else if(f.type.startsWith("image/")){
        setProcessingMsg(f.name);
        const reader=new FileReader();
        const dataUrl=await new Promise(r=>{reader.onload=e=>r(e.target.result);reader.readAsDataURL(f);});
        const resized=await resizeImage(dataUrl,3800);
        const item={id:Date.now()+Math.random(),name:f.name,dataUrl:resized,types:[]};
        newItems.push(item);
        livePages=[...livePages,item];
        setPendingPages([...livePages]);
      }
    }
    setProcessing(false);setProcessingMsg("");
    if(_apiKey&&newItems.length){
      // Load learning examples once before detection
      const learningEx=await loadPageTypeLearning(uid).catch(()=>[]);
      learningExamplesRef.current=learningEx;
      setDetecting(true);
      let done=0;
      await parallelMap(newItems,async(item,i)=>{
        const info=await detectPageTypes(item.dataUrl,learningEx);
        newItems[i].types=info.types;
        newItems[i].aiDetectedTypes=info.types; // store original AI result
        newItems[i].sheetNo=info.sheetNo;
        done++;
        const msg=`🤖 Detecting page types — ${done}/${newItems.length}…`;
        setDetectProgress(msg);bgUpdate(panel.id,msg);
        livePages=livePages.map(p=>p.id===item.id?{...p,types:info.types,aiDetectedTypes:info.types,sheetNo:info.sheetNo}:p);
        setPendingPages([...livePages]);
      },4);
      // Zoomed-page cross-check for types with 2+ pages
      const zoomMsg="🤖 Checking for zoomed/duplicate pages…";
      setDetectProgress(zoomMsg);bgUpdate(panel.id,zoomMsg);
      for(const t of["backpanel","enclosure","bom"]){
        const ofType=livePages.filter(p=>getPageTypes(p).includes(t)&&p.dataUrl);
        if(ofType.length<2)continue;
        const zoomedIds=await detectZoomedPages(ofType);
        if(zoomedIds.length){
          livePages=livePages.map(p=>{
            if(!zoomedIds.includes(p.id))return p;
            const filtered=(p.types||[]).filter(x=>x!==t);
            return{...p,types:filtered,isZoomedSection:true,zoomedSectionType:t};
          });
          setPendingPages([...livePages]);
        }
      }
      setDetecting(false);setDetectProgress("");
    }
    // Pause for user to review detected page types before extraction begins
    pendingNewItemsRef.current=newItems;
    if(!_apiKey){
      // No extraction possible — just save
      updated={...panel,pages:livePages};
      onUpdate(updated);setPendingPages([]);
      try{await onSaveImmediate(updated);}catch(e){}
      bgDone(panel.id,"Complete");
    }else if(newItems.length>0){
      bgUpdate(panel.id,"Awaiting confirmation…");
      setAwaitingConfirm(true);
    }else{
      bgDone(panel.id,"Complete");
    }
    }catch(ex){
      console.error("addFiles error:",ex);
      setErr(`Error processing files: ${ex.message}`);
      bgError(panel.id,ex.message.slice(0,60));
      setProcessing(false);setProcessingMsg("");setDetecting(false);setDetectProgress("");setExtracting(false);setValidatingPanel(false);setPendingPages([]);setAwaitingConfirm(false);
      bgDone(panel.id,"Error");return;
    }
    setProcessing(false);setProcessingMsg("");setDetecting(false);setDetectProgress("");
  }

  async function confirmAndExtract(){
    setAwaitingConfirm(false);
    eqModalShownRef.current=false;
    bgUpdate(panel.id,"Starting extraction…");bgSetPct(panel.id,0,"Starting extraction…");
    // Save learning DB corrections for any page where user changed AI-detected types
    const changes=pageTypeChangesRef.current;
    const uid2=fbAuth.currentUser?.uid;
    if(uid2&&Object.keys(changes).length){
      const allPages=pendingPages.length>0?pendingPages:(panel.pages||[]);
      for(const[pid,{aiTypes,confirmedTypes,reason}]of Object.entries(changes)){
        const pg=allPages.find(p=>p.id===pid);
        if(!pg)continue;
        savePageTypeLearningEntry(uid2,{
          aiTypes,confirmedTypes,reason:reason||null,
          pageId:pid,panelId:panel.id,
          timestamp:Date.now()
        }).catch(()=>{}); // fire-and-forget — never block extraction on a DB write
      }
      pageTypeChangesRef.current={};
    }
    setReasonPickerFor(null);
    const livePages=pendingPages.length>0?pendingPages:(panel.pages||[]);
    const newItems=pendingNewItemsRef.current||[];
    const notes=extractionNotes.trim();
    const updated={...panel,pages:livePages,...(notes?{extractionNotes:notes}:{})};
    onUpdate(updated);
    setPendingPages([]);
    onSaveImmediate(updated).catch(()=>{});
    // Fire title block extraction in background — don't block extraction start
    if(_apiKey&&newItems.length>0){
      const firstWithData=newItems.find(i=>i.dataUrl);
      if(firstWithData){
        extractTitleBlock(firstWithData.dataUrl).then(tb=>{
          if(!tb)return;
          const fresh=latestPanelRef.current;
          const v=tb.voltages||{};
          const patched={...fresh,drawingNo:(tb.drawingNo||"").slice(0,25),drawingDesc:tb.drawingDesc||"",drawingRev:tb.drawingRev||"",...(v.lineVoltage&&v.lineVoltage!=="unknown"?{supplyVoltage:v.lineVoltage}:{}),...(v.controlVoltage&&v.controlVoltage!=="unknown"?{controlVoltage:v.controlVoltage}:{})};
          onUpdate(patched);
          setDraftNo((tb.drawingNo||"").slice(0,25));setDraftDesc(tb.drawingDesc||"");setDraftRev(tb.drawingRev||"");
          onSaveImmediate(patched).catch(()=>{});
        }).catch(()=>{});
      }
    }
    // Start background extraction
    const bomPages=updated.pages.filter(p=>getPageTypes(p).includes("bom")&&p.dataUrl);
    const hasSchOrLayout=updated.pages.some(p=>(getPageTypes(p).includes("schematic")||getPageTypes(p).includes("layout")||getPageTypes(p).includes("backpanel")||getPageTypes(p).includes("enclosure"))&&(p.dataUrl||p.storageUrl));
    const willValidate=_apiKey&&hasSchOrLayout;
    if(!bomPages.length&&!willValidate){bgDone(panel.id,"Complete");return;}
    const valPageCount=(updated.pages||[]).filter(p=>["schematic","backpanel","enclosure","layout"].some(t=>getPageTypes(p).includes(t))&&(p.dataUrl||p.storageUrl)).length;
    const totalEst=Math.max(30,bomPages.length*15+valPageCount*20);
    setExtracting(bomPages.length>0);setValidatingPanel(willValidate);
    const _stampPanel=updated;
    const _stampBcProjNo=bcProjectNumber;
    runExtractionTask(uid,projectId,updated,{
      projectName,bcProjectNumber,
      onDone:(finalPanel)=>{
        try{onUpdate(finalPanel);}catch(e){}
        try{setExtracting(false);setValidatingPanel(false);}catch(e){}
        // Show AI questions if any (guarded to prevent double-trigger from notifyProjectListeners)
        if(!eqModalShownRef.current){
          eqModalShownRef.current=true;
          if((finalPanel.engineeringQuestions||[]).some(q=>q.status==="open")){try{setShowEqModal(true);}catch(e){}}
          else if(finalPanel.aiQuestions?.length>0){try{setShowAiQuestions(true);setAiAnswers({});}catch(e){}}
        }
        // Auto-run pricing after extraction — keep bg bar alive through pricing
        if((finalPanel.bom||[]).length>0&&_apiKey){
          bgUpdate(panel.id,"Getting prices…");
          runPricingOnPanel(finalPanel.bom,finalPanel,pct=>{
            bgSetPct(panel.id,95+Math.round(pct*0.04));
          }).then(()=>{
            bgDone(panel.id,"✓ Complete");
          }).catch(()=>{
            bgDone(panel.id,"✓ Extraction done");
          });
        }else{
          bgDone(panel.id,(finalPanel.bom||[]).length>0?`✓ ${(finalPanel.bom||[]).length} items`:"✓ Complete");
        }
        // BC sync + PDF upload deferred until after pricing completes (see runPricingOnPanel)
      },
      stampFn:async(dataUrl,pgIdx,total)=>{
        const d=new Date();
        const mon=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
        const scanned=`Scanned ${String(d.getFullYear()).slice(2)}-${mon}-${String(d.getDate()).padStart(2,'0')}`;
        const rev=quoteRev||0;
        const stampLabel=rev===0?`AS-QUOTED · ${scanned}`:`AS-QUOTED REV ${String(rev).padStart(2,'0')} · ${scanned}`;
        return burnStampCanvas(dataUrl,{
          left:stampLabel,
          center:`${pgIdx+1} of ${total}`,
          right:[_stampBcProjNo?`${_stampBcProjNo} - ${String((idx+1)*100)}`:null,_stampPanel.drawingNo,_stampPanel.requestedShipDate].filter(Boolean).join(' · ')
        });
      }
    });
  }

  async function autoExtractTitle(){
    const firstWithData=pages.find(p=>p.dataUrl||p.storageUrl);
    if(!firstWithData||!_apiKey)return;
    setExtractingTitle(true);
    const ensured=await ensureDataUrl(firstWithData);
    const tb=await extractTitleBlock(ensured.dataUrl);
    setExtractingTitle(false);
    if(tb){
      setDraftNo((tb.drawingNo||"").slice(0,25));setDraftDesc(tb.drawingDesc||"");setDraftRev(tb.drawingRev||"");
      const fresh=latestPanelRef.current;
      const updated={...fresh,drawingNo:(tb.drawingNo||"").slice(0,25),drawingDesc:tb.drawingDesc||"",drawingRev:tb.drawingRev||""};
      onUpdate(updated);
      try{onSaveImmediate(updated);}catch(e){}
    }
  }

  function saveTitleFields(){
    const updated={...panel,drawingNo:draftNo.trim(),drawingDesc:draftDesc.trim(),drawingRev:draftRev.trim(),requestedShipDate:draftShipDate};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
  }

  // Expose buildAndAttachPdf to parent via ref (supports opts for production mode)
  useEffect(()=>{if(bcUploadRef)bcUploadRef.current=buildAndAttachPdf;});
  async function buildAndAttachPdf(uploadOpts={}){
    if(!pages.length||!bcProjectNumber)return;
    setAttachingPdf(true);
    setAttachPdfMsg("Building PDF…");
    try{
      const JsPDF=await ensureJsPDF();
      // Ensure all page dataUrls are loaded
      const loaded=await Promise.all(pages.map(pg=>ensureDataUrl(pg)));
      // Detect size from first drawing page so cover matches
      const allDims=await Promise.all(loaded.map(pg=>pg.dataUrl
        ?new Promise(res=>{const img=new Image();img.onload=()=>res({w:img.naturalWidth,h:img.naturalHeight});img.onerror=()=>res(null);img.src=pg.dataUrl;})
        :Promise.resolve(null)
      ));
      const firstDims=allDims.find(d=>d!=null)||{w:1584,h:1056}; // default B-size landscape
      const coverMm=detectSheetMm(firstDims.w,firstDims.h);
      const coverOrient=coverMm.mmW>=coverMm.mmH?"landscape":"portrait";
      const doc=new JsPDF({unit:"mm",format:[coverMm.mmW,coverMm.mmH],orientation:coverOrient,compress:true});
      setAttachPdfMsg("Building cover page…");
      await buildCoverPage(doc,panel,bcProjectNumber,quoteData,idx,coverMm.mmW,coverMm.mmH,uploadOpts);
      // DECISION(v1.19.320): These vars MUST be declared BEFORE the stamp loop below.
      // Previously they were declared AFTER the loop — Babel hoisted const→var as undefined,
      // so stamps burned with wrong values and filenames were malformed (e.g. "500 - PRJ402065").
      // DECISION(v1.19.333): dwg must sanitize /\:*?"<>| chars to dashes — BC API rejects slashes
      // in filenames (e.g. LCP-100/200/500 → LCP-100-200-500). Without this, uploads silently fail
      // and the "Deleted — Re-Upload" warning triggers endlessly.
      const rev=quoteRev||0;
      const revTag=rev>0?` REV ${String(rev).padStart(2,'0')}`:"";
      const dwg=(panel.drawingNo||"NoDWG").replace(/[\/\\:*?"<>|]/g,"-");
      const lineSuffix=String((idx+1)*100);
      const isProduction=uploadOpts.mode==="production";
      // Add drawing pages — burn stamp FIRST, then add to PDF
      const totalPg=loaded.filter(p=>p.dataUrl).length;
      setAttachPdfMsg("Stamping drawings…");
      for(let i=0;i<loaded.length;i++){
        const pg=loaded[i];
        if(!pg.dataUrl)continue;
        const dims=allDims[i]||firstDims;
        const orient=dims.w>dims.h?"landscape":"portrait";
        const {mmW,mmH}=detectSheetMm(dims.w,dims.h);
        doc.addPage([mmW,mmH],orient);
        let imgData=pg.dataUrl;
        if(isProduction&&uploadOpts.poNumber){
          const d=new Date();
          const mon=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
          const dateStr=`${String(d.getFullYear()).slice(2)}-${mon}-${String(d.getDate()).padStart(2,'0')}`;
          const dueStr=uploadOpts.dueDate||panel.requestedShipDate||"";
          imgData=await burnStampCanvas(pg.dataUrl,{
            left:`APPROVED TO PRODUCE · PO: ${uploadOpts.poNumber} · ${dateStr}`,
            center:`${i+1} of ${totalPg}`,
            right:[bcProjectNumber?`${bcProjectNumber} - ${lineSuffix}`:null,panel.drawingNo,dueStr?`Due: ${dueStr}`:null].filter(Boolean).join(' · ')
          });
        }else{
          // As-Quoted mode — burn AS-QUOTED stamp
          const d=new Date();
          const mon=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()];
          const scanned=`Scanned ${String(d.getFullYear()).slice(2)}-${mon}-${String(d.getDate()).padStart(2,'0')}`;
          const stampLabel=rev===0?`AS-QUOTED · ${scanned}`:`AS-QUOTED REV ${String(rev).padStart(2,'0')} · ${scanned}`;
          imgData=await burnStampCanvas(pg.dataUrl,{
            left:stampLabel,
            center:`${i+1} of ${totalPg}`,
            right:[bcProjectNumber?`${bcProjectNumber} - ${lineSuffix}`:null,panel.drawingNo,panel.requestedShipDate].filter(Boolean).join(' · ')
          });
        }
        doc.addImage(imgData,"JPEG",0,0,mmW,mmH,undefined,"FAST");
      }
      if(loaded.filter(p=>p.dataUrl).length===0)throw new Error("No pages with images");
      // DECISION(v1.19.375): BC file naming convention — DWG- prefix for all drawings.
      // Sorts drawings together in BC Attached Documents list.
      const fileName=isProduction
        ?`DWG-[APPROVED TO PRODUCE${revTag}] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}.pdf`
        :`DWG-[AS-QUOTED${revTag}] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}.pdf`;
      setAttachPdfMsg("Uploading to BC…");
      const pdfBytes=doc.output("arraybuffer");
      // Clean up old bad-formatted files from previous code bugs
      // Old patterns: "500 - PRJ402065", "[AS-QUOTED] NoDWG - PRJ402065", "[AS-QUOTED REV 01] NoDWG - PRJ402065"
      const rawDwg=panel.drawingNo||"NoDWG"; // may contain slashes
      const oldBadNames=[
        `${lineSuffix} - ${bcProjectNumber}`,                               // bare "500 - PRJ402065"
        `[AS-QUOTED] NoDWG - ${bcProjectNumber||"NoProject"}`,               // missing drawingNo, no lineSuffix
        `[AS-QUOTED] NoDWG - ${bcProjectNumber||"NoProject"} - ${lineSuffix}`,// missing drawingNo
      ];
      // If drawingNo had slashes, old uploads used unsanitized name — clean those up too
      if(rawDwg!==dwg){
        oldBadNames.push(`[AS-QUOTED${revTag}] ${rawDwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}`);
        oldBadNames.push(`[AS-QUOTED${revTag}] ${rawDwg} - ${bcProjectNumber||"NoProject"}`);
      }
      if(panel.bcPdfFileName){const old=panel.bcPdfFileName.replace(/\.pdf$/i,"");if(!oldBadNames.includes(old))oldBadNames.push(old);}
      for(const badName of oldBadNames){try{await bcDeleteAttachmentByName(bcProjectNumber,badName);}catch(e){}}
      // Build previous rev filename to delete — check both DWG- prefixed and old non-prefixed formats
      const prevRev=rev-1;
      let previousFile=null;
      if(prevRev>0){
        const prevRevTag=` REV ${String(prevRev).padStart(2,'0')}`;
        previousFile=isProduction
          ?`DWG-[APPROVED TO PRODUCE${prevRevTag}] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}.pdf`
          :`DWG-[AS-QUOTED${prevRevTag}] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}.pdf`;
        // Also clean old non-prefixed version
        const oldPrev=isProduction?`[APPROVED TO PRODUCE${prevRevTag}] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}`:`[AS-QUOTED${prevRevTag}] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}`;
        try{await bcDeleteAttachmentByName(bcProjectNumber,oldPrev);}catch(e){}
      }else if(prevRev===0){
        previousFile=isProduction
          ?`DWG-[APPROVED TO PRODUCE] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}.pdf`
          :`DWG-[AS-QUOTED] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}.pdf`;
        const oldPrev=isProduction?`[APPROVED TO PRODUCE] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}`:`[AS-QUOTED] ${dwg} - ${bcProjectNumber||"NoProject"} - ${lineSuffix}`;
        try{await bcDeleteAttachmentByName(bcProjectNumber,oldPrev);}catch(e){}
      }
      // Also delete old format without DWG- prefix and without lineSuffix
      const oldNoSuffix=isProduction
        ?`[APPROVED TO PRODUCE] ${dwg} - ${bcProjectNumber||"NoProject"}`
        :`[AS-QUOTED] ${dwg} - ${bcProjectNumber||"NoProject"}`;
      try{await bcDeleteAttachmentByName(bcProjectNumber,oldNoSuffix);}catch(e){}
      await bcAttachPdfQueued(bcProjectNumber,fileName,pdfBytes,previousFile);
      const updated={...panel,bcPdfAttached:true,bcPdfFileName:fileName,bcUploadCount:(panel.bcUploadCount||0)+1,bcUploadQuoteRev:quoteRev||0};
      onUpdate(updated);
      try{onSaveImmediate(updated);}catch(e){}
      setBcPdfMissing(false);
      setAttachPdfMsg("✓ Uploaded — cleaning duplicates…");
      // Run bulk duplicate cleanup in background (non-blocking)
      bcCleanupDuplicateAttachments(bcProjectNumber,[fileName.replace(/\.pdf$/i,"")]).then(r=>{
        if(r.deleted>0)setAttachPdfMsg(`✓ Uploaded + cleaned ${r.deleted} old file${r.deleted>1?"s":""}`);
        else setAttachPdfMsg("✓ Uploaded: "+fileName);
        setTimeout(()=>setAttachPdfMsg(""),5000);
      }).catch(()=>{setAttachPdfMsg("✓ Uploaded: "+fileName);setTimeout(()=>setAttachPdfMsg(""),5000);});
    }catch(e){
      console.error("Attach PDF failed:",e);
      setAttachPdfMsg("✗ "+e.message);
      setTimeout(()=>setAttachPdfMsg(""),6000);
    }
    setAttachingPdf(false);
  }

  // Auto-sync to BC when BC-confirmed item count INCREASES (user priced something) — debounced 3s
  // Only auto-syncs when ALL non-labor rows are already priced (bc or manual) — avoids triggering on initial extraction
  useEffect(()=>{
    if(!bcProjectNumber)return;
    const bom=panel.bom||[];
    const bcCount=bom.filter(r=>r.priceSource==='bc').length;
    if(bcPrevSyncCount.current===-1){bcPrevSyncCount.current=bcCount;return;}
    if(bcCount<=bcPrevSyncCount.current){bcPrevSyncCount.current=bcCount;return;}
    bcPrevSyncCount.current=bcCount;
    // Only auto-sync if all non-labor rows are priced — otherwise it's still initial pricing
    const unpriced=bom.filter(r=>!r.isLaborRow&&r.priceSource!=="bc"&&r.priceSource!=="manual");
    if(unpriced.length>0)return;
    if(bcAutoSyncTimer.current)clearTimeout(bcAutoSyncTimer.current);
    bcAutoSyncTimer.current=setTimeout(()=>syncPlanningLinesToBC(),3000);
    return()=>{if(bcAutoSyncTimer.current)clearTimeout(bcAutoSyncTimer.current);};
  },[JSON.stringify((panel.bom||[]).map(r=>r.id+'|'+r.priceSource))]);

  async function syncPlanningLinesToBC(){
    if(!bcProjectNumber||bcSyncing)return;
    // Guard: all non-labor BOM rows (including auto-replaced) must have a BC or manual price
    const unpriced=(panel.bom||[]).filter(r=>!r.isLaborRow&&r.priceSource!=="bc"&&r.priceSource!=="manual");
    if(unpriced.length){setUnpricedAlert(unpriced);return;}
    setBcSyncing(true);setBcSyncStatus(null);setSyncFailedAlert(null);
    try{
      if(!_bcToken){await acquireBcToken(true);}
      if(!_bcToken)throw new Error("Could not connect to Business Central");
      const result=await bcSyncPanelPlanningLines(bcProjectNumber,idx+1,panel,projectName);
      // Always sync task descriptions so existing projects get updated
      bcSyncPanelTaskDescriptions(bcProjectNumber,idx+1,panel,projectName).catch(e=>console.warn("task desc sync failed:",e));
      if(result.failed&&result.failed.length>0){
        setBcSyncStatus("error");
        setSyncFailedAlert(result.failed);
        // persist errors on rows so pill shows after modal is dismissed
        const errs={};result.failed.forEach(f=>{if(f.rowId)errs[f.rowId]=f;});
        setBcSyncErrors(prev=>({...prev,...errs}));
      }else{
        setBcSyncStatus("ok");
        setBcSyncErrors({});
        setTimeout(()=>setBcSyncStatus(null),4000);
      }
    }catch(e){
      console.error("bcSyncPlanningLines failed:",e);
      setBcSyncStatus("error");
      setTimeout(()=>setBcSyncStatus(null),6000);
    }
    setBcSyncing(false);
  }
  function saveLineQty(){
    const q=Math.max(1,Math.min(20,parseInt(draftLineQty)||1));
    setDraftLineQty(q);
    const updated={...panel,lineQty:q};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
    // Auto-resync planning lines to BC when panel qty changes
    if(bcProjectNumber&&_bcToken&&(updated.bom||[]).length>0){
      bcSyncPanelPlanningLines(bcProjectNumber,idx+1,updated,projectName).then(result=>{
        if(result.failed?.length>0)console.warn("LineQty BC sync: "+result.failed.length+" items failed");
        else console.log("LineQty BC sync: planning lines updated for qty="+q);
      }).catch(e=>console.warn("LineQty BC sync failed:",e));
    }
  }
  function savePanelName(){
    if(!draftName.trim())return;
    const updated={...panel,name:draftName.trim()};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
  }

  function tagPage(id,types,reason=null){
    const pg=pages.find(p=>p.id===id);
    if(pendingPages.length>0)setPendingPages(pp=>pp.map(p=>p.id===id?{...p,types}:p));
    onUpdate({...panel,pages:pages.map(p=>p.id===id?{...p,types}:p)});
    setTagsChanged(true);
    // During confirm phase: track changes vs AI detection
    if(awaitingConfirm&&pg){
      const aiTypes=pg.aiDetectedTypes||getPageTypes(pg);
      const removedTypes=aiTypes.filter(t=>!types.includes(t));
      const addedTypes=types.filter(t=>!aiTypes.includes(t));
      if(removedTypes.length||addedTypes.length){
        pageTypeChangesRef.current[id]={aiTypes,confirmedTypes:types,reason:reason||pageTypeChangesRef.current[id]?.reason||null};
        // Ask for reason only when removing an AI-detected type and no reason given yet
        if(removedTypes.length&&!reason&&reasonPickerFor!==id){
          setReasonPickerFor(id);
        }
      }else{
        delete pageTypeChangesRef.current[id];
        if(reasonPickerFor===id)setReasonPickerFor(null);
      }
    }
  }
  function removePage(id){
    const remaining=pages.filter(p=>p.id!==id);
    let updated={...panel,pages:remaining};
    if(remaining.length===0){
      updated={...updated,drawingNo:"",drawingDesc:"",drawingRev:"",bom:[],validation:null,pricing:null,budgetaryQuote:null,status:"draft"};
      setDraftNo("");setDraftDesc("");setDraftRev("");ep.stop();setErr("");
    }
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
  }

  async function autoDetect(){
    if(!_apiKey)return;
    let untagged=pages.filter(p=>getPageTypes(p).length===0&&(p.dataUrl||p.storageUrl));
    if(!untagged.length)return;
    setDetecting(true);
    untagged=await Promise.all(untagged.map(ensureDataUrl));
    let updatedPages=[...pages];
    let done=0;
    await parallelMap(untagged,async(page)=>{
      const info=await detectPageTypes(page.dataUrl);
      updatedPages=updatedPages.map(p=>p.id===page.id?{...p,types:info.types,sheetNo:info.sheetNo}:p);
      done++;setDetectProgress(`Detecting ${done}/${untagged.length}…`);
    },4);
    const updated={...panel,pages:updatedPages};
    onUpdate(updated);
    setDetecting(false);setDetectProgress("");
  }

  async function runExtraction(startMsg){
    let bomPages=pages.filter(p=>getPageTypes(p).includes("bom"));
    if(!bomPages.length){setErr("No pages tagged BOM yet.");return;}
    setExtracting(true);setErr("");ep.start(startMsg||"Extracting BOM…",bomPages.length*15);
    const noData=bomPages.find(pg=>!pg.dataUrl&&!pg.storageUrl);
    if(noData){setErr(`"${noData.name}" has no image — re-upload.`);setExtracting(false);ep.stop();return;}
    bomPages=await Promise.all(bomPages.map(ensureDataUrl));
    const rgnCtx=buildRegionContext(pages);
    const rgnNotes=(panel.extractionNotes||"")+rgnCtx;
    let all=[];let bomDone=0;let reQs=[];
    try{
      const bomResults=await parallelMap(bomPages,async(pg,pgIdx)=>{
        bomDone++;
        ep.set(Math.round((bomDone/bomPages.length)*60),`Extracting BOM — page ${bomDone}/${bomPages.length}…`);
        const units=await getExtractionUnits(pg);
        console.log(`[RE-EXTRACT] Page ${pgIdx+1}: ${units.length} extraction unit(s), dataUrl=${!!pg.dataUrl}, regions=${(pg.regions||[]).filter(r=>r.type==="bom").length} BOM regions`);
        let pageItems=[],pageQs=[];
        for(const unit of units){
          const notes=unit.regionNote?(rgnNotes+"\nThis image is a cropped BOM region: "+unit.regionNote):rgnNotes;
          const result=await extractBomPage(unit.dataUrl,"",notes);
          const items=result.items||result;
          console.log(`[RE-EXTRACT] Page ${pgIdx+1} unit: ${items.length} items, ${(result.questions||[]).length} questions`);
          pageItems.push(...items);
          const qs=(result.questions||[]).map(q=>({...q,pageIdx:pgIdx,pageName:pg.name||`Page ${pgIdx+1}`}));
          if(qs.length)pageQs.push(...qs);
        }
        if(pageQs.length)reQs.push(...pageQs);
        return pageItems;
      },3);
      all=bomResults.flat();
      reQs=reQs.slice(0,10);
      console.log(`[RE-EXTRACT] Total: ${all.length} items, ${reQs.length} questions across all pages`);
    }catch(ex){console.error("[RE-EXTRACT] Failed:",ex);setErr(`Failed: ${ex.message}`);setExtracting(false);ep.stop();return;}
    ep.set(65,"Merging results…");
    const map={};
    all.forEach(item=>{
      const pn=(item.partNumber||"").replace(/[\s\-\.\/\u00a0]+/g,"").toUpperCase();
      const key=pn||("desc:"+(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40));
      if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);console.log(`BOM MERGE: "${item.partNumber}" qty ${item.qty} → merged (now qty ${map[key].qty})`);}
      else{map[key]={...item,id:Date.now()+Math.random(),qty:+item.qty||1};}
    });
    console.log(`BOM MERGE: ${all.length} raw items → ${Object.keys(map).length} unique items`);
    const bom=appendDefaultBomItems(applyPartCorrections(partCorrections,Object.values(map).map(row=>{
      const sugg=findPartSuggestion(partLibrary,row);
      return sugg?{...row,suggestedPartNumber:sugg}:row;
    })));
    ep.set(80,"Saving BOM…");
    const reEqs=mergeEngineeringQuestions([],reQs,null); // fresh questions on re-extract
    let updated={...latestPanelRef.current,bom,...(typeof reQs!=='undefined'&&reQs.length?{aiQuestions:reQs}:{}),engineeringQuestions:reEqs,status:"extracted",updatedAt:Date.now()};
    try{await onSaveImmediate(updated);}catch(e){}
    onUpdate(updated);
    setTagsChanged(false);
    if(!eqModalShownRef.current){
      eqModalShownRef.current=true;
      if((updated.engineeringQuestions||[]).some(q=>q.status==="open")){setShowEqModal(true);}
      else if(updated.aiQuestions?.length>0){setShowAiQuestions(true);setAiAnswers({});}
    }
    // Re-run validation (schematic/layout analysis) if applicable
    const valPages=(pages||[]).filter(p=>["schematic","backpanel","enclosure","layout"].some(t=>getPageTypes(p).includes(t))&&(p.dataUrl||p.storageUrl));
    if(valPages.length>0&&_apiKey){
      ep.set(65,"Validating drawings…");
      setValidatingPanel(true);
      try{
        const result=await runPanelValidation(latestPanelRef.current,pct=>{ep.set(65+Math.round(pct*0.15),"Validating…");});
        if(result?.validation||result?.laborData){
          updated={...latestPanelRef.current,...(result.validation?{validation:result.validation}:{}),...(result.laborData?{laborData:result.laborData}:{}),status:"validated"};
          onUpdate(updated);
          try{await onSaveImmediate(updated);}catch(e){}
        }
      }catch(valEx){console.warn("Re-extract validation failed:",valEx);}
      setValidatingPanel(false);
    }
    // Auto-run pricing after re-extraction
    if(bom.length>0&&_apiKey){
      ep.set(82,"Getting prices…");
      try{await runPricingOnPanel(bom,updated,pct=>{ep.set(82+Math.round(pct*0.16),null);});}catch(e){console.warn("Post-extract pricing failed:",e);}
    }
    ep.finish(`✓ ${bom.length} items extracted`);
    setExtracting(false);
    // BC drawing upload deferred until user prints quote (As-Quoted flow)
    // Background: extract panel metadata from drawings and log to CPD
    if(_apiKey&&pages.length){
      const categorized=bom.filter(r=>!r.isLaborRow&&r.partNumber).map(r=>({...r,cpdCategory:categorizePart(r.partNumber,r.description)}));
      extractPanelMetadata(pages).then(metadata=>{
        return logPanelToCPD(uid,updated,categorized,metadata||undefined);
      }).catch(()=>{});
    }
  }

  function parseLaborFeedback(text){
    const updates={};
    const t=text.toLowerCase();
    // Wire count: "X wires", "base labor off X wires", "wire count is X", "X wire terminations"
    const wireMatch=t.match(/\b(\d+)\s*wire(?:s|[\s-]terminations?|[\s-]count)?/);
    if(wireMatch){
      const wires=parseInt(wireMatch[1]);
      const hours=computeFallbackLaborHours(wires);
      updates.laborHoursOverride=hours;
      updates._wiresUsed=wires;
    }
    // Direct hour override: "X hours", "use X labor hours", "set hours to X"
    const hoursMatch=t.match(/\b(\d+(?:\.\d+)?)\s*(?:labor\s+)?hours?\b/);
    if(hoursMatch&&!wireMatch){
      updates.laborHoursOverride=parseFloat(hoursMatch[1]);
    }
    // Labor rate: "$X/hr", "rate is $X", "labor rate X"
    const rateMatch=t.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:\/\s*h(?:ou)?r|per\s+hour)/)||
                    t.match(/labor\s+rate\s+(?:is\s+)?(?:\$)?(\d+(?:\.\d+)?)/)||
                    t.match(/rate\s+(?:is\s+)?(?:\$)?(\d+(?:\.\d+)?)\s*(?:\/\s*h(?:ou)?r)?/);
    if(rateMatch){updates.laborRate=parseFloat(rateMatch[1]);}
    const {_wiresUsed,...pricingUpdates}=updates;
    return Object.keys(pricingUpdates).length>0?{pricingUpdates,wires:_wiresUsed||null}:null;
  }

  async function reExtractWithFeedback(){
    eqModalShownRef.current=false;
    let bomPages=pages.filter(p=>getPageTypes(p).includes("bom")&&(p.dataUrl||p.storageUrl));
    if(!aiFeedback.trim())return;

    // Apply labor corrections immediately regardless of whether BOM re-extraction runs
    const laborResult=parseLaborFeedback(aiFeedback);
    let latestPanel=panel;
    if(laborResult){
      const newPricing={...(panel.pricing||{}),...laborResult.pricingUpdates};
      latestPanel={...panel,pricing:newPricing};
      onUpdate(latestPanel);
      try{onSaveImmediate(latestPanel);}catch(e){}
    }

    // If no BOM pages, just save the labor fix and clear
    if(!bomPages.length){
      if(laborResult){
        const msg=laborResult.wires!=null
          ?`✓ Labor updated — using ${laborResult.wires} wires → ${laborResult.pricingUpdates.laborHoursOverride} hrs`
          :"✓ Labor settings updated";
        ep.finish(msg);
        setFeedbackSaved(true);setTimeout(()=>setFeedbackSaved(false),3000);
        setAiFeedback("");
      } else {
        setErr("No BOM-tagged pages to re-extract.");
      }
      return;
    }

    setReExtracting(true);setErr("");ep.start("Extracting BOM — applying feedback…",bomPages.length*12);
    bomPages=await Promise.all(bomPages.map(ensureDataUrl));
    const fbRgnCtx=buildRegionContext(pages);
    let all=[];let bomDone=0;
    try{
      let fbQs=[];
      const bomResults=await parallelMap(bomPages,async(pg,pgIdx)=>{
        ep.update(`Extracting BOM — page ${++bomDone}/${bomPages.length}…`);
        const units=await getExtractionUnits(pg);
        let pageItems=[],pageQs=[];
        for(const unit of units){
          const notes=unit.regionNote?("Cropped BOM region: "+unit.regionNote+fbRgnCtx):fbRgnCtx;
          const result=await extractBomPage(unit.dataUrl,aiFeedback,notes);
          const items=result.items||result;
          pageItems.push(...items);
          const qs=(result.questions||[]).map(q=>({...q,pageIdx:pgIdx,pageName:pg.name||`Page ${pgIdx+1}`}));
          if(qs.length)pageQs.push(...qs);
        }
        if(pageQs.length)fbQs.push(...pageQs);
        return pageItems;
      },3);
      all=bomResults.flat();
      fbQs=fbQs.slice(0,10);
    }catch(ex){setErr(`Failed: ${ex.message}`);setReExtracting(false);return;}
    const map={};
    all.forEach(item=>{
      const pn=(item.partNumber||"").replace(/[\s\-\.\/\u00a0]+/g,"").toUpperCase();
      const key=pn||("desc:"+(item.description||"").replace(/\s+/g," ").trim().toLowerCase().slice(0,40));
      if(map[key]){map[key].qty=(+map[key].qty||1)+(+item.qty||1);}
      else{map[key]={...item,id:Date.now()+Math.random(),qty:+item.qty||1};}
    });
    const bom=appendDefaultBomItems(applyPartCorrections(partCorrections,Object.values(map).map(row=>{
      const sugg=findPartSuggestion(partLibrary,row);
      return sugg?{...row,suggestedPartNumber:sugg}:row;
    })));
    const logEntry={timestamp:Date.now(),feedback:aiFeedback,itemCount:bom.length};
    const feedbackLog=[...((latestPanel.extractionFeedbackLog)||[]),logEntry];
    const fbEqs=mergeEngineeringQuestions([],fbQs,null);
    const updated={...latestPanel,bom,...(typeof fbQs!=='undefined'&&fbQs.length?{aiQuestions:fbQs}:{}),engineeringQuestions:fbEqs,status:"extracted",extractionFeedbackLog:feedbackLog,updatedAt:Date.now()};
    try{await onSaveImmediate(updated);}catch(e){}
    onUpdate(updated);
    const laborMsg=laborResult?.wires!=null?` · labor set to ${updated.pricing?.laborHoursOverride} hrs`:"";
    ep.finish(`✓ ${bom.length} items extracted${laborMsg}`);
    setFeedbackSaved(true);setTimeout(()=>setFeedbackSaved(false),3000);
    setAiFeedback("");
    setReExtracting(false);
  }

  function updateBomRow(id,field,val){
    const updated={...panel,bom:(panel.bom||[]).map(r=>r.id===id?{...r,[field]:val}:r)};
    onUpdate(updated);
    if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current=setTimeout(()=>{try{onSaveImmediate(updated);}catch(e){}},1500);
  }
  function saveBomRow(updated){
    try{onSaveImmediate(updated);}catch(e){}
  }
  function addBomRow(){
    const newId=Date.now()+Math.random();
    const newRow={id:newId,qty:1,partNumber:"",description:"",manufacturer:"",notes:""};
    const bom=[...(panel.bom||[])];
    // Insert before JOB BUYOFF / Crate rows (always keep them at the end)
    const tailIdx=bom.findIndex(r=>!r.isLaborRow&&(/^job.?buyoff$/i.test(r.partNumber)||/^crat(e|ing)$/i.test((r.description||"").trim())||CONTINGENCY_PNS.has((r.partNumber||"").trim().toUpperCase())));
    if(tailIdx>=0)bom.splice(tailIdx,0,newRow);else bom.push(newRow);
    const updated={...panel,bom};
    onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}
    // Open BC browser after a short delay to let React re-render with the new row first
    if(_bcToken){setTimeout(()=>{setBcBrowserTarget(newId);setBcBrowserQuery("");setBcBrowserOpen(true);},300);}
  }
  function deleteBomRow(id){
    const updated={...panel,bom:(panel.bom||[]).filter(r=>r.id!==id)};
    onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}
  }
  function confirmSuggestion(id){
    const row=(panel.bom||[]).find(r=>r.id===id);
    if(!row||!row.suggestedPartNumber)return;
    const bom=(panel.bom||[]).map(r=>r.id===id?{...r,partNumber:r.suggestedPartNumber,suggestedPartNumber:null,learnedPartNumber:true}:r);
    const updated={...panel,bom};
    onUpdate(updated);saveBomRow(updated);
    // Reinforce this description→partNumber link in the library
    savePartLibraryEntry(uid,{manufacturer:row.manufacturer||"",description:row.description||"",partNumber:row.suggestedPartNumber})
      .then(()=>loadPartLibrary(uid).then(setPartLibrary)).catch(()=>{});
  }
  function dismissSuggestion(id){
    const bom=(panel.bom||[]).map(r=>r.id===id?{...r,suggestedPartNumber:null}:r);
    onUpdate({...panel,bom});
  }
  // DECISION(v1.19.315): commitBcItem has 5 params. skipLearning=true is the "Just Apply — No Learning" option
  // from the cross/correction dialog. It applies the BC item without saving to alternates or corrections DB,
  // and without setting isCrossed/isCorrection flags. This gives users an escape hatch when BC returns a
  // different part number but it's not truly a cross or correction (e.g. cosmetic differences).
  function commitBcItem(bomRowId,bcItem,asCross,correctionType=null,skipLearning=false){
    const livePanel=latestPanelRef.current;
    let liveBom=livePanel.bom||[];
    // If row not found (stale ref from addBomRow race), find it in any panel version
    if(!liveBom.some(r=>r.id===bomRowId)){
      // Row was added by addBomRow but latestPanelRef hasn't caught up — insert it
      const tailIdx=liveBom.findIndex(r=>!r.isLaborRow&&(/^job.?buyoff$/i.test(r.partNumber)||/^crat(e|ing)$/i.test((r.description||"").trim())));
      const newRow={id:bomRowId,qty:1,partNumber:"",description:"",manufacturer:"",notes:""};
      liveBom=[...liveBom];
      if(tailIdx>=0)liveBom.splice(tailIdx,0,newRow);else liveBom.push(newRow);
      console.log("commitBcItem: row not in latestPanelRef, inserted manually");
    }
    const bom=liveBom.map(r=>{
      if(r.id!==bomRowId)return r;
      const origPN=(r.crossedFrom||r.correctionFrom||r.partNumber||"").trim();
      const newPN=bcItem.number;
      const now=Date.now();
      const updates={...r,...(newPN?{partNumber:newPN}:{}),unitPrice:bcItem.unitCost??r.unitPrice??0,priceSource:"bc",priceDate:now,bcPoDate:now};
      if(bcItem._customerSupplied){updates.customerSupplied=true;updates.unitPrice=0;}
      if(bcItem._vendorName)updates.bcVendorName=bcItem._vendorName;
      // Async vendor lookup — uses latestPanelRef to avoid stale overwrites
      if(!updates.bcVendorName&&newPN){(async()=>{const vNo=await bcGetItemVendorNo(newPN);if(vNo){const name=await bcGetVendorName(vNo);if(name){const lp=latestPanelRef.current;const bom2=(lp.bom||[]).map(r2=>r2.id===bomRowId?{...r2,bcVendorName:name}:r2);const u2={...lp,bom:bom2};latestPanelRef.current=u2;onUpdate(u2);saveProjectPanel(uid,projectId,panel.id,u2,true).catch(()=>{});}}})().catch(()=>{});}
      if(skipLearning){
        // "Just Apply" — no cross or correction flags, no learning
        delete updates.isCrossed;delete updates.crossedFrom;
        delete updates.isCorrection;delete updates.correctionType;delete updates.correctionFrom;
      }else if(asCross&&normPart(newPN)!==normPart(origPN)){
        updates.isCrossed=true;updates.crossedFrom=origPN;
        delete updates.isCorrection;delete updates.correctionType;delete updates.correctionFrom;
      }else{
        updates.isCorrection=true;updates.correctionType=correctionType;updates.correctionFrom=origPN;
        delete updates.isCrossed;delete updates.crossedFrom;
      }
      if(bcItem.displayName)updates.description=bcItem.displayName;
      if(bcItem._vendorName)updates.bcVendorName=bcItem._vendorName;
      // Update manufacturer from BC item — async lookup
      if(newPN){(async()=>{try{
        const allPages=await bcDiscoverODataPages();const iPage=allPages.find(n=>/^ItemCard$/i.test(n));
        if(iPage){const mr=await fetch(`${BC_ODATA_BASE}/${iPage}?$filter=No eq '${newPN}'&$select=No,Manufacturer_Code&$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
          if(mr.ok){const md=((await mr.json()).value||[])[0];if(md&&md.Manufacturer_Code){
            const mfrs=await bcFetchManufacturers();const mfr=mfrs.find(m=>m.Code===md.Manufacturer_Code);
            const mfrName=mfr?mfr.Name:md.Manufacturer_Code;
            const lp=latestPanelRef.current;const bom2=(lp.bom||[]).map(r2=>r2.id===bomRowId?{...r2,manufacturer:mfrName}:r2);
            const u2={...lp,bom:bom2};latestPanelRef.current=u2;onUpdate(u2);saveProjectPanel(uid,projectId,panel.id,u2,true).catch(()=>{});
          }}}
      }catch(e){}})();}
      if(!skipLearning){
        if(asCross){
          // autoReplace:true — ARC selection immediately trains the learning database
          saveAlternateEntry(uid,origPN,{partNumber:newPN,description:bcItem.displayName||r.description||"",unitCost:bcItem.unitCost},true)
            .then(alts=>setAlternates([...alts])).catch(()=>{});
        }else if(correctionType){
          saveCorrectionEntry(uid,origPN,newPN,correctionType).then(()=>{}).catch(()=>{});
        }
      }
      return updates;
    });
    // Clear fuzzy suggestion for this row before saving
    const cleanedFuzzy={...(livePanel.bcFuzzySuggestions||{})};delete cleanedFuzzy[bomRowId];
    const updated={...livePanel,bom,bcFuzzySuggestions:Object.keys(cleanedFuzzy).length?cleanedFuzzy:undefined};
    // Update local state AND save directly to Firestore (bypass parent chain to avoid stale state)
    latestPanelRef.current=updated;
    onUpdate(updated);
    saveProjectPanel(uid,projectId,panel.id,updated,true).catch(e=>console.warn("commitBcItem save failed:",e));
    setBcFuzzySuggestions(prev=>{const next={...prev};delete next[bomRowId];return next;});
    // Clear any BC sync error for this row — item has been fixed via Item Browser
    setBcSyncErrors(prev=>{const next={...prev};delete next[bomRowId];return next;});
    // Prompt user to sync BC planning lines after item browser selection
    if(bcProjectNumber&&_bcToken){
      setBcSyncStatus("pending");
    }
  }
  function applyBcItem(bomRowId,bcItem){
    const row=(latestPanelRef.current.bom||[]).find(r=>r.id===bomRowId);
    if(!row)return;
    if(bcItem._customerSupplied&&!bcItem.number){commitBcItem(bomRowId,bcItem,false);return;}
    const origPN=(row.crossedFrom||row.partNumber||"").trim();
    const newPN=bcItem.number;
    const isCrossing=origPN&&origPN!==newPN;
    if(isCrossing){
      setCrossOrCorrectPending({bomRowId,bcItem,origPN,newPN});
    }else{
      commitBcItem(bomRowId,bcItem,false);
    }
  }
  // DECISION(v1.19.376): Manual price entry shows a confirmation popup asking if the cost is
  // Confirmed (push to BC Item Card + Purchase Price) or Budgetary (BOM only, no BC, no priceDate).
  function updatePrice(id,val){
    const parsed=val===""?null:parseFloat(val);
    const row=(panel.bom||[]).find(r=>r.id===id);
    if(parsed==null||isNaN(parsed)){
      // Clearing price — no popup needed
      const updatedBom=(panel.bom||[]).map(r=>r.id===id?{...r,unitPrice:null,priceSource:null,priceDate:null}:r);
      const updated={...panel,bom:updatedBom};onUpdate(updated);
      if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current=setTimeout(()=>{try{onSaveImmediate(updated);}catch(e){}},500);
      return;
    }
    const pn=(row?.partNumber||"").trim();
    // Show confirmation popup
    setPriceConfirmPending({id,partNumber:pn,price:parsed,row});
    setPriceConfirmVendor(row?.bcVendorName||"");
  }
  function applyBudgetaryPrice(){
    if(!priceConfirmPending)return;
    const{id,price}=priceConfirmPending;
    // Budgetary: update BOM only, no BC push, no priceDate (show as dashed/unpriced)
    const updatedBom=(panel.bom||[]).map(r=>r.id===id?{...r,unitPrice:price,priceSource:"manual",priceDate:null}:r);
    const updated={...panel,bom:updatedBom};onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
    setPriceConfirmPending(null);
  }
  async function applyConfirmedPrice(){
    if(!priceConfirmPending)return;
    const{id,partNumber,price}=priceConfirmPending;
    const vendorName=priceConfirmVendor.trim();
    // Confirmed: update BOM with priceDate, push to BC Item Card + Purchase Price
    const now=Date.now();
    const updatedBom=(panel.bom||[]).map(r=>r.id===id?{...r,unitPrice:price,priceSource:"manual",priceDate:now,bcVendorName:vendorName||r.bcVendorName}:r);
    const updated={...panel,bom:updatedBom};onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
    setPriceConfirmPending(null);
    // Push to BC Item Card
    if(partNumber&&_bcToken){
      try{
        await bcPatchItemOData(partNumber,{Unit_Cost:price});
        const bcItem=await bcLookupItem(partNumber);
        if(bcItem){
          const confirmedCost=bcItem.unitCost??price;
          const cur=panelRef.current;
          const bom2=(cur.bom||[]).map(r=>r.id===id?{...r,unitPrice:confirmedCost,priceSource:"bc",priceDate:now,bcVendorName:vendorName||r.bcVendorName}:r);
          const u2={...cur,bom:bom2};onUpdate(u2);try{onSaveImmediate(u2);}catch(e){}
        }
      }catch(e){console.warn("BC unit cost update failed:",partNumber,e);}
      // Push to Purchase Price card if vendor provided
      if(vendorName){
        try{
          // Resolve vendor number from name
          const vendors=await bcListVendors();
          const v=vendors.find(v=>v.displayName===vendorName);
          if(v?.number){
            await bcPushPurchasePrice(partNumber,v.number,price,new Date().toISOString().split('T')[0],"EA");
            console.log("BC PURCHASE PRICE pushed:",partNumber,v.number,price);
          }
        }catch(e){console.warn("BC purchase price push failed:",partNumber,e);}
      }
    }
  }
  function updateVendor(id,vendorName){
    const row=(panel.bom||[]).find(r=>r.id===id);
    const updatedBom=(panel.bom||[]).map(r=>r.id===id?{...r,bcVendorName:vendorName}:r);
    const updated={...panel,bom:updatedBom};
    onUpdate(updated);
    if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current=setTimeout(()=>{try{onSaveImmediate(updated);}catch(e){}},1500);
    // Write vendor back to BC item card
    const pn=(row?.partNumber||"").trim();
    if(pn&&_bcToken&&vendorName){
      const vendor=bomVendorList.find(v=>v.displayName===vendorName);
      if(vendor){bcPatchItemOData(pn,{Vendor_No:vendor.number}).then(()=>console.log("BC VENDOR UPDATE:",pn,"→",vendor.number,vendorName)).catch(e=>console.warn("BC vendor update failed:",pn,e));}
    }
  }
  function savePricing(updates){
    const updated={...panel,pricing:{...(panel.pricing||{}),...updates}};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
    // If markup changed and panel is synced to BC, update the PROGRESS BILLING line Unit_Price
    if("markup"in updates&&bcProjectNumber&&_bcToken){
      const newSellPrice=computePanelSellPrice(updated);
      const taskNo=String(20000+(idx+1)*100+10);
      bcPatchProgressBillingLine(bcProjectNumber,taskNo,newSellPrice)
        .catch(e=>console.warn("bcPatchProgressBilling failed:",e));
    }
  }
  function saveLaborOverride(field,value){
    const ld=panel.laborData||{};
    const updated={...panel,laborData:{...ld,overrides:{...(ld.overrides||{}),[field]:value}}};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
    // Save layout learning when user corrects panel holes
    if(field==="panelHoles"&&uid){
      const aiCount=ld.counts?.panelHoles??0;
      const la=ld.layoutAnalysis||{};
      saveLayoutLearningEntry(uid,{
        aiPanelHoles:aiCount,
        userPanelHoles:value,
        doorCutoutCount:la.doorDeviceCount??null,
        topBeaconCount:la.topBeaconCount??null,
        doorCutouts:(la.doorCutouts||[]).map(d=>d.type).join(","),
        hasLayoutData:!!ld.hasLayoutData
      }).catch(()=>{});
    }
  }
  function saveLaborAccepted(category,accepted){
    const ld=panel.laborData||{};
    const updated={...panel,laborData:{...ld,accepted:{...(ld.accepted||{}),[category]:accepted}}};
    onUpdate(updated);
    try{onSaveImmediate(updated);}catch(e){}
  }
  async function runPricingOnPanel(bomOverride,panelOverride,onEpProgress){
    const bom=bomOverride||panel.bom||[];
    if(!bom.length||!_apiKey)return;
    if(pricingClearTimer.current){clearTimeout(pricingClearTimer.current);pricingClearTimer.current=null;}
    const _pp=(o)=>{setPricingProgress(o);if(onEpProgress)onEpProgress(o.pct);};
    setAiPricing(true);_pp({msg:"Getting prices…",pct:5});
    let updatedBom=[...bom];
    let bcCount=0;

    // Phase 1: Business Central lookup
    if(!_bcToken){
      _pp({msg:"Trying silent BC login…",pct:5});
      try{await Promise.race([acquireBcToken(false),new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),5000))]);}
      catch(e){_pp({msg:"BC silent login skipped — using AI…",pct:5});}
    }
    if(_bcToken){
      _pp({msg:"BC: Getting company ID…",pct:5});
      try{
        const compId=await bcGetCompanyId();
        if(!compId){
          _pp({msg:"BC: Company not found — falling back to AI…",pct:10});
        }else{
          // Rows already BC-priced but missing bcPoDate — just backfill PO date, no re-match
          const needPoDate=bom.filter(r=>r.priceSource==="bc"&&!r.isLaborRow&&!("bcPoDate"in r)&&(r.partNumber||"").trim());
          if(needPoDate.length){
            _pp({msg:`BC: Backfilling PO dates for ${needPoDate.length} items…`,pct:7});
            const poMap={};
            for(let i=0;i<needPoDate.length;i++){
              const pn=(needPoDate[i].partNumber||"").trim();
              _pp({msg:`BC: PO date ${i+1}/${needPoDate.length}: ${pn}`,pct:7+Math.round((i/needPoDate.length)*20)});
              const lp=await bcGetLastPurchase(pn);
              poMap[String(needPoDate[i].id)]=lp?new Date(lp.postingDate).getTime():null;
            }
            updatedBom=updatedBom.map(r=>{const key=String(r.id);return key in poMap?{...r,bcPoDate:poMap[key]}:r;});
          }
          // When called from Refresh button (no bomOverride), re-check bc rows too so updated costs are picked up
          const eligible=bom.filter(r=>{if(r.isLaborRow)return false;const ps=r.priceSource;if(ps==="manual"&&bomOverride)return false;if(ps==="bc"&&bomOverride)return false;return true;});
          _pp({msg:`BC: Fuzzy-matching ${eligible.length} items…`,pct:27});
          await bcGetVendorMap();
          const bcMap={};
          const fuzzySugg={};
          for(let i=0;i<eligible.length;i++){
            const row=eligible[i];
            const pn=(row.partNumber||"").trim();
            if(!pn)continue;
            _pp({msg:`BC: ${row.priceSource==="bc"?"Refreshing":"Fuzzy lookup"} ${i+1}/${eligible.length}: ${pn}`,pct:27+Math.round((i/eligible.length)*20)});
            // Already bc-priced: exact lookup to get current cost (don't fuzzy-match, avoid changing part number)
            if(row.priceSource==="bc"){
              const exact=await bcLookupItem(pn);
              if(exact&&exact.unitCost!=null){
                const vNo=await bcGetItemVendorNo(pn);
                const lp=await bcGetLastPurchase(pn);
                bcMap[String(row.id)]={unitPrice:exact.unitCost,source:"bc",bcDisplayName:exact.displayName,bcInventory:exact.inventory,bcNumber:pn,bcVendorName:vNo?await bcGetVendorName(vNo):"",bcPoDate:lp?new Date(lp.postingDate).getTime():null};
              }
              continue;
            }
            const result=await bcFuzzyLookup(pn);
            if(result.match&&result.match.unitCost!=null){
              const matchNo=result.match.number||pn;
              const vNo=await bcGetItemVendorNo(matchNo);
              const lp=await bcGetLastPurchase(matchNo);
              bcMap[String(row.id)]={unitPrice:result.match.unitCost,source:"bc",bcDisplayName:result.match.displayName,bcInventory:result.match.inventory,bcNumber:matchNo,bcVendorName:vNo?await bcGetVendorName(vNo):"",bcPoDate:lp?new Date(lp.postingDate).getTime():null};
            } else if(result.suggestions.length>0){
              fuzzySugg[String(row.id)]=result.suggestions;
            }
          }
          bcCount=Object.keys(bcMap).length;
          updatedBom=updatedBom.map(r=>{
            const key=String(r.id);
            if(key in bcMap){
              const hasActiveRfq=r.rfqSentDate&&(!r.unitPrice||r.unitPrice===0);
              return{...r,partNumber:bcMap[key].bcNumber||r.partNumber,unitPrice:bcMap[key].unitPrice,priceSource:"bc",
                ...(hasActiveRfq?{}:{priceDate:Date.now(),bcPoDate:bcMap[key].bcPoDate}),
                bcVendorName:bcMap[key].bcVendorName||r.bcVendorName||""};
            }
            return r;
          });
          if(Object.keys(fuzzySugg).length>0){
            setBcFuzzySuggestions(prev=>({...prev,...fuzzySugg}));
          }
          const fuzzyCount=Object.keys(fuzzySugg).length;
          _pp({msg:`BC: ${bcCount} matched${fuzzyCount>0?`, ${fuzzyCount} need review`:""} of ${eligible.length}. AI for the rest…`,pct:40});
        }
      }catch(ex){
        console.warn("BC pricing phase failed:",ex);
        _pp({msg:`BC failed: ${ex.message||ex} — falling back to AI…`,pct:10});
      }
    }

    // Phase 1b: Codale auto-pricing for ALL items with Codale vendor (refresh all prices)
    const codaleItems=updatedBom.filter(r=>!r.isLaborRow&&/codale/i.test(r.bcVendorName||""));
    if(codaleItems.length>0){
      _pp({msg:`Codale: Fetching live prices for ${codaleItems.length} items…`,pct:45});
      try{
        const pns=codaleItems.map(r=>(r.partNumber||"").trim()).filter(Boolean);
        const fn=firebase.functions().httpsCallable("codaleTestScrape",{timeout:300000});
        const cr=await fn({partNumbers:pns});
        const codaleResults=(cr.data.results||[]);
        const codaleMap={};
        codaleResults.forEach(function(r){if(r.price>0)codaleMap[(r.partNumber||"").toUpperCase()]={price:r.price};});
        let codaleCount=0;
        updatedBom=updatedBom.map(r=>{
          const pn=(r.partNumber||"").trim().toUpperCase();
          if(codaleMap[pn]){codaleCount++;const hasActiveRfq=r.rfqSentDate&&(!r.unitPrice||r.unitPrice===0);return{...r,unitPrice:codaleMap[pn].price,priceSource:"bc",...(hasActiveRfq?{}:{priceDate:Date.now(),bcPoDate:Date.now()})};}
          return r;
        });
        if(codaleCount>0){bcCount+=codaleCount;_pp({msg:`Codale: ${codaleCount} prices obtained`,pct:48});}
        else{_pp({msg:"Codale: no prices found",pct:48});}
      }catch(e){console.warn("Codale pricing failed:",e);_pp({msg:"Codale: failed — "+e.message,pct:48});}
    }

    // Phase 2: AI fallback for items not priced by BC
    const unpricedBom=updatedBom.filter(r=>r.priceSource!=="bc"&&r.priceSource!=="manual");
    if(unpricedBom.length>0){
      const BATCH=20;
      const total=Math.ceil(unpricedBom.length/BATCH);
      for(let i=0;i<unpricedBom.length;i+=BATCH){
        const batchIdx=Math.floor(i/BATCH);
        const basePct=_bcToken?45:5;
        const pctRange=_bcToken?45:90;
        _pp({msg:`AI pricing ${i+1}–${Math.min(i+BATCH,unpricedBom.length)} of ${unpricedBom.length} remaining items…`,pct:basePct+Math.round((batchIdx/total)*pctRange)});
        const batch=unpricedBom.slice(i,i+BATCH);
        try{
          const map=await estimatePrices(batch);
          updatedBom=updatedBom.map(r=>{
            const key=String(r.id);
            if(key in map&&r.priceSource!=="bc"&&r.priceSource!=="manual"){
              const ai=map[key];
              return{...r,unitPrice:ai.unitPrice,priceSource:ai.unitPrice!=null?"ai":r.priceSource||null,aiSources:ai.sources||[],aiBasis:ai.basis||""};
            }
            return r;
          });
        }catch(ex){setAiPricing(false);_pp({msg:`Pricing error: ${(ex.message||"failed").slice(0,60)}`,pct:0,isError:true});return;}
      }
    }

    const panelBase=panelOverride||panelRef.current;
    const mergedFuzzy={...(panelBase.bcFuzzySuggestions||{}),...bcFuzzySuggestions};
    const updated={...panelBase,bom:updatedBom,status:"costed",bcFuzzySuggestions:Object.keys(mergedFuzzy).length?mergedFuzzy:undefined};
    onUpdate(updated);
    try{await onSaveImmediate(updated);}catch(e){}
    const aiCount=updatedBom.filter(r=>r.priceSource==="ai").length;
    const totalPriced=updatedBom.filter(r=>r.unitPrice!=null).length;
    _pp({msg:`✓ ${totalPriced} of ${bom.length} priced${bcCount>0?` (${bcCount} BC, ${aiCount} AI est.)`:""}.`,pct:100});
    setAiPricing(false);
    pricingClearTimer.current=setTimeout(()=>{setPricingProgress(null);pricingClearTimer.current=null;},4000);
    // Auto-sync to BC after pricing is complete (not during extraction)
    if(bcProjectNumber&&_bcToken&&updatedBom.length>0){
      bcSyncPanelPlanningLines(bcProjectNumber,idx+1,updated,projectName).then(result=>{
        if(result.failed?.length>0)console.warn("Post-pricing BC sync: "+result.failed.length+" items failed");
        else console.log("Post-pricing BC sync: planning lines synced");
        bcSyncPanelTaskDescriptions(bcProjectNumber,idx+1,updated,projectName).catch(e=>console.warn("Post-pricing task desc sync failed:",e));
      }).catch(e=>console.warn("Post-pricing BC sync failed:",e));
      // BC drawing upload deferred until user prints quote (As-Quoted flow)
    }
  }
  async function validatePanel(){
    if(!_apiKey)return;
    setValidatingPanel(true);
    const valPages=(panel.pages||[]).filter(p=>["schematic","backpanel","enclosure","layout"].some(t=>getPageTypes(p).includes(t))&&(p.dataUrl||p.storageUrl));
    ep.start("Validating…",valPages.length*20);
    try{
      const result=await runPanelValidation(latestPanelRef.current,pct=>{ep.set(Math.round(pct*0.45),"Validating…");});
      let updated=latestPanelRef.current;
      if(result.validation||result.laborData){
        const bom=appendDefaultBomItems(updated.bom||[]);
        updated={...updated,bom,...(result.validation?{validation:result.validation}:{}),...(result.laborData?{laborData:result.laborData}:{}),status:"validated"};
        onUpdate(updated);
        try{await onSaveImmediate(updated);}catch(e){}
      }
      setValidatingPanel(false);
      // Continue into pricing — keep ep alive, no gap in the bar
      if((updated.bom||[]).length>0&&_apiKey){
        ep.set(48,"Getting prices…");
        try{await runPricingOnPanel(updated.bom,updated,pct=>{ep.set(48+Math.round(pct*0.50),null);});}catch(e){}
      }
      ep.finish("✓ Complete");
    }catch(e){
      console.error("Validation error:",e);
      ep.finish("Validation failed");
      setValidatingPanel(false);
    }
  }
  function exportCSV(){
    const sourceLabel=s=>s==="bc"?"BC":s==="ai"?"AI":s==="manual"?"Manual":"";
    const header=["Qty","Part Number","Description","Manufacturer","Unit $","Cost Source","Notes"];
    const rows=[header,...(panel.bom||[]).map(r=>[
      r.qty,r.partNumber,r.description,r.manufacturer,
      r.unitPrice!=null?"$"+Number(r.unitPrice).toFixed(2):"",
      sourceLabel(r.priceSource),
      r.notes
    ])];
    const csv=rows.map(r=>r.map(c=>`"${String(c||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download=`${(panel.drawingNo||panel.name||"BOM").replace(/[^a-z0-9]/gi,"_")}_BOM.csv`;
    a.click();
  }

  async function exportCADLinkBOM(){
    const n=idx+1;
    const lineSuffix=String(n*100);
    const taskPN=`${bcProjectNumber||"PRJ"}-${lineSuffix}`;
    const desc=(panel.drawingNo?`${panel.drawingNo} Rev ${panel.drawingRev||"-"} - `:"")+(projectName||panel.drawingDesc||panel.name||`Panel ${n}`);
    const panelQty=1; // Always 1 per panel for CADLink (not multiplied)
    const allBomRows=(panel.bom||[]).filter(r=>!r.isLaborRow);
    const isTailRow=r=>CONTINGENCY_PNS.has((r.partNumber||"").trim().toUpperCase())||/^job.?buyoff$/i.test(r.partNumber)||/^crat(e|ing)$/i.test((r.description||"").trim());
    const isContingencyRow=r=>CONTINGENCY_PNS.has((r.partNumber||"").trim().toUpperCase());
    const isBottomRow=r=>/^job.?buyoff$/i.test(r.partNumber)||/^crat(e|ing)$/i.test((r.description||"").trim());
    const contingencyRows=allBomRows.filter(isContingencyRow);
    const regularRows=allBomRows.filter(r=>!isTailRow(r));
    const bottomRows=allBomRows.filter(isBottomRow);

    const header=["Level","Part number","Part Revision","Short Description","Long Description","QtyPer","Part Type","UOM","Unit Cost"];
    const rows=[header];
    // Level 0 — parent assembly
    rows.push([0,taskPN,1,desc.slice(0,50),"",panelQty,2,"EA",""]);
    // Level 1 — Contingency items first
    contingencyRows.forEach(r=>{
      rows.push([1,(r.partNumber||"").trim(),1,(r.description||"").slice(0,50),"",r.qty||1,1,"EA",r.unitPrice!=null?Number(r.unitPrice).toFixed(2):""]);
    });
    // Level 1 — Regular BOM items
    regularRows.forEach(r=>{
      rows.push([1,(r.partNumber||"").trim(),1,(r.description||"").slice(0,50),"",r.qty||1,1,"EA",r.unitPrice!=null?Number(r.unitPrice).toFixed(2):""]);
    });
    // Level 1 — Job Buyoff and Crate at bottom
    bottomRows.forEach(r=>{
      rows.push([1,(r.partNumber||"").trim(),1,(r.description||"").slice(0,50),"",r.qty||1,1,"EA",r.unitPrice!=null?Number(r.unitPrice).toFixed(2):""]);
    });

    // Build proper XLSX using SheetJS (loaded on demand)
    if(!window.XLSX){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://unpkg.com/xlsx/dist/xlsx.full.min.js';
        s.onload=res;s.onerror=()=>rej(new Error('Failed to load XLSX library'));
        document.head.appendChild(s);
      });
    }
    const XL=window.XLSX;
    const ws=XL.utils.aoa_to_sheet(rows);
    const wb=XL.utils.book_new();
    XL.utils.book_append_sheet(wb,ws,"BOM");
    XL.writeFile(wb,`CADLink_${taskPN.replace(/[^a-z0-9\-]/gi,"_")}.xls`,{bookType:"biff8"});
  }

  return(
    <div className="fade-in" onClick={()=>{if(onSelect)onSelect();}} style={{...card(),border:`2px solid ${isSelected?C.accent:C.border}`,cursor:"pointer"}}>
      {/* Combined header + title block */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div style={{background:C.accentDim,color:C.accent,borderRadius:6,padding:"4px 12px",fontSize:13,fontWeight:800,letterSpacing:1,flexShrink:0,alignSelf:"stretch",display:"flex",alignItems:"center",justifyContent:"center"}}>LINE {idx+1}</div>
        <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
          <div style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase"}}>Qty</div>
          <input type="text" inputMode="numeric" value={draftLineQty} readOnly={readOnly}
            onChange={e=>{const v=e.target.value.replace(/[^0-9]/g,'');setDraftLineQty(v);}}
            onFocus={e=>{e.target.select();e.target.style.borderColor=C.accent;e.target.style.background=C.card;}}
            onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";saveLineQty();}}
            onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){setDraftLineQty(panel.lineQty??1);e.target.blur();}}}
            style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"2px 5px",color:C.text,fontSize:15,fontWeight:700,outline:"none",width:"4ch",fontFamily:"inherit",textAlign:"center"}}/>
        </div>
        {/* Panel name + title block identity */}
        <div style={{flex:1,display:"flex",alignItems:"flex-start",gap:20,minWidth:0,flexWrap:"wrap"}}>
          <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0,position:"relative"}}>
            <div style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase"}}>DWG #</div>
            <input value={draftNo} onChange={e=>{
                const v=e.target.value;
                if(v.length>25){
                  setDraftNo(v.slice(0,25));
                  setDraftNoWarn(true);
                  clearTimeout(draftNoWarnTimer.current);
                  draftNoWarnTimer.current=setTimeout(()=>setDraftNoWarn(false),3000);
                }else{
                  setDraftNo(v);
                  if(draftNoWarn){setDraftNoWarn(false);clearTimeout(draftNoWarnTimer.current);}
                }
              }} placeholder="—" readOnly={readOnly}
              onFocus={e=>{e.target.style.borderColor=C.accent;e.target.style.background=C.card;}}
              onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";saveTitleFields();}}
              onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){setDraftNo(panel.drawingNo||"");e.target.blur();}}}
              style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"2px 5px",color:C.text,fontSize:15,fontWeight:700,outline:"none",width:Math.max(5,(draftNo||"").length+2)+"ch",fontFamily:"inherit"}}/>
            {draftNoWarn&&<div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:"#1a0a0a",border:"1px solid "+C.red,borderRadius:6,padding:"5px 10px",fontSize:12,color:C.red,whiteSpace:"nowrap",zIndex:100}}>Max 25 characters (BC limit)</div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0,minWidth:40}}>
            <div style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase"}}>Rev</div>
            <input value={draftRev} onChange={e=>setDraftRev(e.target.value)} placeholder="—" readOnly={readOnly}
              onFocus={e=>{e.target.style.borderColor=C.accent;e.target.style.background=C.card;}}
              onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";saveTitleFields();}}
              onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){setDraftRev(panel.drawingRev||"");e.target.blur();}}}
              style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"2px 5px",color:C.yellow,fontSize:15,fontWeight:700,outline:"none",width:Math.max(3,(draftRev||"").length+2)+"ch",fontFamily:"inherit"}}/>
          </div>
          <div style={{display:"flex",gap:8,flex:1,minWidth:160,alignItems:"flex-start"}}>
            <div style={{display:"flex",flexDirection:"column",gap:3,flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase"}}>Description</div>
              <input value={draftDesc} onChange={e=>setDraftDesc(e.target.value)} placeholder="—" readOnly={readOnly}
                onFocus={e=>{e.target.style.borderColor=C.accent;e.target.style.background=C.card;}}
                onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";saveTitleFields();}}
                onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){setDraftDesc(panel.drawingDesc||"");e.target.blur();}}}
                style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"2px 5px",color:C.sub,fontSize:14,outline:"none",width:"100%",fontFamily:"inherit"}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:3,flexShrink:0}}>
              <div style={{fontSize:11,color:C.accent,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase"}}>Requested Ship Date</div>
              <input type="date" value={draftShipDate} onChange={e=>setDraftShipDate(e.target.value)} readOnly={readOnly}
                onBlur={()=>saveTitleFields()}
                style={{background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"2px 5px",color:C.green,fontSize:13,fontWeight:700,outline:"none",fontFamily:"inherit",colorScheme:"dark"}}/>
            </div>
          </div>
        </div>
        {/* Right-side controls */}
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          {unpricedAlert&&ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:C.card,border:`1px solid ${C.red}`,borderRadius:10,padding:24,maxWidth:480,width:"100%"}}>
                <div style={{fontSize:16,fontWeight:700,color:C.red,marginBottom:8}}>BC Sync Blocked</div>
                <div style={{fontSize:13,color:C.text,marginBottom:12}}>
                  {unpricedAlert.length} item{unpricedAlert.length>1?"s":""} must be priced in Business Central before syncing:
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 12px",maxHeight:200,overflowY:"auto",marginBottom:16}}>
                  {unpricedAlert.map((r,i)=>(
                    <div key={i} style={{fontSize:12,color:C.muted,padding:"2px 0",borderBottom:`1px solid ${C.border}33`}}>
                      <span style={{color:C.text,fontWeight:600}}>{r.partNumber||"(no part #)"}</span>
                      {r.description?<span style={{marginLeft:8}}>{r.description.slice(0,60)}{r.description.length>60?"…":""}</span>:null}
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:C.muted,marginBottom:16}}>Use "Get BC Prices" to price these items, or mark them manually before syncing.</div>
                <button onClick={()=>setUnpricedAlert(null)}
                  style={{background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"8px 24px",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%"}}>
                  OK
                </button>
              </div>
            </div>
          ,document.body)}
          {syncFailedAlert&&(()=>{
            function parseBcError(err){
              if(!err)return"Unknown error";
              if(/must select an existing item/i.test(err))return"Not found in BC catalog — use Item Browser to find the correct item";
              if(/Gen\.?\s*Prod\.?\s*Posting Group must have a value/i.test(err))return"BC item setup incomplete (Gen. Prod. Posting Group missing)";
              if(/Inventory Posting Group must have a value/i.test(err))return"BC item setup incomplete (Inventory Posting Group missing)";
              if(/posting group/i.test(err))return"BC item setup incomplete (posting group missing)";
              if(/429|Too Many/i.test(err))return"BC rate limit — retry sync";
              if(/field.*validation/i.test(err))return"BC item validation error";
              const m=err.match(/"message":"([^"]{0,120})/);
              return m?m[1]:"BC error — see console for details";
            }
            const allRateLimit=syncFailedAlert.every(r=>/429|Too Many/i.test(r.error||""));
            return ReactDOM.createPortal(
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:C.card,border:`2px solid ${C.red}`,borderRadius:10,padding:24,maxWidth:560,width:"100%"}}>
                <div style={{fontSize:16,fontWeight:700,color:C.red,marginBottom:4}}>⚠ BC Sync Incomplete</div>
                <div style={{fontSize:13,color:C.text,marginBottom:12}}>
                  {syncFailedAlert.length} item{syncFailedAlert.length>1?"s":""} could not be pushed to BC. Use the Item Browser to find each item and apply it, then retry sync.
                </div>
                <div style={{background:C.bg,borderRadius:6,padding:"8px 12px",maxHeight:280,overflowY:"auto",marginBottom:12}}>
                  {syncFailedAlert.map((r,i)=>(
                    <div key={i} style={{padding:"8px 0",borderBottom:`1px solid ${C.border}33`,display:"flex",flexDirection:"column",gap:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{color:C.yellow,fontWeight:700,fontFamily:"monospace",fontSize:12}}>{r.partNumber||"(no part #)"}</span>
                        {r.description?<span style={{color:C.muted,fontSize:11}}>{r.description.slice(0,60)}{r.description.length>60?"…":""}</span>:null}
                      </div>
                      <div style={{fontSize:11,color:C.accent,marginBottom:2}}>{parseBcError(r.error)}</div>
                      {!/429|Too Many/i.test(r.error||"")&&r.rowId&&(
                        <button onClick={()=>{
                          setSyncFailedAlert(prev=>{const remaining=(prev||[]).filter(x=>x.rowId!==r.rowId);return remaining.length?remaining:null;});
                          setBcBrowserTarget(r.rowId);setBcBrowserQuery(r.partNumber||"");setBcBrowserOpen(true);
                        }}
                          style={{alignSelf:"flex-start",background:C.accent,color:"#fff",border:"none",borderRadius:5,padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          Fix in Item Browser
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {allRateLimit&&(
                    <button onClick={()=>{setSyncFailedAlert(null);syncPlanningLinesToBC();}}
                      style={{flex:1,background:C.accent,color:"#fff",border:"none",borderRadius:6,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                      Retry Sync
                    </button>
                  )}
                  <button onClick={()=>setSyncFailedAlert(null)}
                    style={{flex:1,background:"#333",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                    Close
                  </button>
                </div>
              </div>
            </div>
            ,document.body);
          })()}
          <button onClick={()=>setPanelCollapsed(v=>!v)} title={panelCollapsed?"Expand panel":"Collapse panel"}
            style={{background:"#1a1a2a",border:`1px solid ${C.border}`,color:panelCollapsed?C.accent:C.sub,borderRadius:6,padding:"4px 10px",fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,letterSpacing:0.3}}>
            {panelCollapsed?"▶ Expand":"▼ Collapse"}
          </button>
          <Badge status={panel.status||"draft"}/>
          {!readOnly&&<button data-tip="Delete this panel" onClick={onDelete} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:15,padding:"2px 6px",borderRadius:4}} onMouseEnter={e=>e.target.style.color=C.red} onMouseLeave={e=>e.target.style.color=C.muted}>✕</button>}
        </div>
      </div>

      {!panelCollapsed&&<>
      {/* CPD Search bar — hidden after drawings have been extracted */}
      {!((panel.bom&&panel.bom.length>0)||["extracted","validated","costed","quoted"].includes(panel.status))&&<div style={{marginBottom:12}}>
        <div style={{display:"flex",gap:0,borderRadius:8,overflow:"hidden",border:`1px solid ${C.accent}55`,background:"#0a0a16"}}>
          <input
            value={cpdQuery}
            onChange={e=>setCpdQuery(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&cpdQuery.trim())setShowCpdSearch(true);}}
            placeholder="Type what you need in a panel and I will attempt to create a BOM for you without drawings"
            style={{flex:1,background:"transparent",border:"none",outline:"none",padding:"10px 14px",fontSize:12,color:C.text,fontStyle:cpdQuery?"normal":"italic"}}
          />
          <button
            onClick={()=>{if(cpdQuery.trim())setShowCpdSearch(true);}}
            style={{background:C.accentDim,border:"none",borderLeft:`1px solid ${C.accent}55`,padding:"10px 16px",color:C.accent,fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",letterSpacing:0.5}}>
            CPD Search
          </button>
        </div>
      </div>}

      {/* 5 stat boxes */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:14}}>
        {[
          {label:"Total",count:pages.length,color:C.sub,dim:C.border+"44"},
          {label:"BOM",count:bomCount,color:C.accent,dim:C.accentDim},
          {label:"Schematic",count:schCount,color:C.green,dim:C.greenDim},
          {label:"Back Panel",count:backpanelCount+layoutCount,color:C.purple,dim:"#2e1a4a"},
          {label:"Enclosure",count:enclosureCount,color:C.teal||"#0d9488",dim:"#042f2e"},
        ].map(s=>(
          <div key={s.label} style={{background:s.dim,border:`1px solid ${s.color}44`,borderRadius:8,padding:"10px 6px",textAlign:"center"}}>
            <div style={{fontSize:24,fontWeight:800,color:s.color,lineHeight:1}}>{s.count}</div>
            <div style={{fontSize:12,color:s.color,fontWeight:700,marginTop:4,letterSpacing:0.5,opacity:0.85}}>{s.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Drawings section */}
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,flexWrap:"wrap"}}>
          <div style={{fontSize:12,color:C.muted,fontWeight:700,letterSpacing:0.7,marginRight:2}}>DRAWINGS</div>
          {!readOnly&&(panel.bom||[]).some(r=>!r.isLaborRow)&&(
            <button data-tip="Re-run AI extraction on tagged BOM pages — uses region crops if defined" onClick={()=>{
              if(localStorage.getItem("_arc_skip_reextract_warn")){runExtraction();return;}
              setReExtractWarn(true);
            }} disabled={extracting}
              style={{background:"none",border:`1px solid ${C.accent}88`,color:C.accent,cursor:"pointer",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",opacity:extracting?0.6:1}}>
              {extracting?"Extracting…":"Re-Extract Drawings"}
            </button>
          )}
          {(()=>{const eqOpen=(panel.engineeringQuestions||[]).filter(q=>q.status==="open").length;const eqTotal=(panel.engineeringQuestions||[]).length;
            return eqTotal>0?React.createElement("button",{onClick:()=>setShowEqModal(true),
              style:{background:eqOpen>0?"#451a03":"none",border:`1px solid ${eqOpen>0?"#f59e0b88":C.accent+"88"}`,color:eqOpen>0?"#f59e0b":C.accent,cursor:"pointer",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",animation:eqOpen>0?"pulseYellow 2s ease-in-out infinite":"none"}},
              eqOpen>0?`❓ ${eqOpen} Question${eqOpen!==1?"s":""}`:`✓ ${eqTotal} Answered`):null;})()}
          {/* DECISION(v1.19.336): Main upload button is disabled when green (current upload exists) to prevent
              accidental re-uploads that create duplicates in BC. A small ↻ button appears next to it for intentional
              re-uploads + duplicate cleanup. This was briefly made always-clickable in v1.19.335 but reverted because
              every click re-uploads the same file, defeating the purpose of the duplicate prevention. */}
          {pages.length>0&&!readOnly&&bcProjectNumber&&!bcDisconnected&&!extracting&&!aiPricing&&!validatingPanel&&(panel.bom||[]).some(r=>!r.isLaborRow)&&(()=>{
            const hasUnsent=panel.bcPdfAttached&&!bcPdfMissing&&(quoteRev||0)>(panel.bcUploadQuoteRev||0);
            const needsUpload=hasUnsent||bcPdfMissing||(!panel.bcPdfAttached);
            return(
            <span style={{display:"inline-flex",alignItems:"center",gap:0}}>
            <button data-tip={bcPdfMissing?"File deleted from BC — click to re-upload":hasUnsent?"BOM changed — click to upload updated drawings to BC":panel.bcPdfAttached&&!bcPdfMissing?`Uploaded: ${panel.bcPdfFileName||"PDF"}`:"Upload drawings to BC"}
              onClick={needsUpload?()=>buildAndAttachPdf():undefined} disabled={attachingPdf||!needsUpload}
              style={{background:bcPdfMissing?"#3a0a0a":hasUnsent?"#3a1f00":panel.bcPdfAttached&&!bcPdfMissing?C.greenDim:"none",
                border:`1px solid ${bcPdfMissing?"#ef444488":hasUnsent?"#f59e0b88":panel.bcPdfAttached&&!bcPdfMissing?C.green+"88":"#38bdf888"}`,
                color:bcPdfMissing?C.red:hasUnsent?"#f59e0b":panel.bcPdfAttached&&!bcPdfMissing?C.green:"#38bdf8",
                cursor:needsUpload?"pointer":"default",borderRadius:needsUpload?20:"20px 0 0 20px",padding:"2px 10px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",
                opacity:attachingPdf?0.5:1,animation:needsUpload&&!attachingPdf?"pulseYellow 2s ease-in-out infinite":"none"}}>
              {attachingPdf?"Uploading…":bcPdfMissing?"⚠ Deleted — Click to Re-Upload":hasUnsent?"⚠ Unsent Revision — Click to Update":panel.bcPdfAttached&&!bcPdfMissing?"✓ Uploaded to BC":"📎 Upload to BC"}
            </button>
            {panel.bcPdfAttached&&!bcPdfMissing&&!needsUpload&&!attachingPdf&&(
              <button data-tip="Force re-upload drawings & clean duplicates in BC" onClick={()=>buildAndAttachPdf()}
                style={{background:C.greenDim,border:`1px solid ${C.green}88`,borderLeft:"none",color:C.green,cursor:"pointer",borderRadius:"0 20px 20px 0",padding:"2px 6px",fontSize:11,fontWeight:700}}>↻</button>
            )}
            </span>);
          })()}
          {attachPdfMsg&&<span style={{fontSize:11,color:attachPdfMsg.startsWith("✓")?C.green:attachPdfMsg.startsWith("✗")?C.red:C.muted,fontWeight:600}}>{attachPdfMsg}</span>}
        </div>

        {/* Thumbnail strip + drop tile */}
        <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:6,alignItems:"flex-start"}}>
          {(()=>{
            const extracted=["extracted","validated","costed","quoted"].includes(panel.status);
            const statusLabel=panel.status==="quoted"||panel.status==="costed"?"QUOTE":panel.status==="validated"?"VALIDATED":panel.status==="extracted"?"EXTRACTED":"DRAFT";
            const qd=quoteData||{};
            return pages.map((pg,pgIdx)=>{
            const types=getPageTypes(pg);
            return(
              <div key={pg.id} style={{flexShrink:0,width:420,display:"flex",flexDirection:"column",gap:6}}>
                <div style={{position:"relative",cursor:"zoom-in"}} onClick={()=>setLightboxId(pg.id)}>
                  <img src={pg.dataUrl||pg.storageUrl} alt={pg.name} style={{width:420,height:381,objectFit:"contain",borderRadius:6,background:"#080810",display:"block"}}/>
                  {!readOnly&&<button data-tip="Remove this drawing page" onClick={e=>{e.stopPropagation();removePage(pg.id);}} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.75)",border:"none",color:C.red,cursor:"pointer",borderRadius:4,padding:"1px 7px",fontSize:13,lineHeight:"20px"}}>✕</button>}
                </div>
                <div style={{lineHeight:1.4}}>
                  {(panel.drawingNo||panel.drawingDesc)?(
                    <>
                      <div style={{fontSize:12,color:C.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:600}}>
                        {[panel.drawingNo,panel.drawingDesc].filter(Boolean).join("  ")}
                      </div>
                      {panel.drawingRev&&<div style={{fontSize:11,color:C.yellow,fontWeight:700}}>Rev {panel.drawingRev}</div>}
                    </>
                  ):(
                    <div style={{fontSize:12,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pg.name}</div>
                  )}
                  {pg.sheetNo&&<div style={{fontSize:11,color:C.teal,fontWeight:700,marginTop:1}}>Sht {pg.sheetNo}</div>}
                </div>
                <div style={{display:"flex",gap:3,flexWrap:"wrap",alignItems:"center"}}>
                  {pg.isZoomedSection&&(
                    <span style={{background:"rgba(250,204,21,0.15)",color:"#fde047",border:"1px solid rgba(250,204,21,0.4)",borderRadius:10,padding:"2px 8px",fontSize:11,fontWeight:700}}>
                      Zoomed Section
                    </span>
                  )}
                  {pg.regions?.length>0&&(
                    <span style={{background:"rgba(99,102,241,0.15)",color:"#818cf8",border:"1px solid rgba(99,102,241,0.4)",borderRadius:10,padding:"2px 8px",fontSize:11,fontWeight:700}}>
                      {pg.regions.length} region{pg.regions.length>1?"s":""}
                    </span>
                  )}
                  {["bom","schematic","backpanel","enclosure","pid"].map(t=>{
                    const active=types.includes(t);
                    return(
                      <button key={t} data-tip={active?`Remove "${SHORT[t]}" tag from this page`:`Tag this page as ${SHORT[t]}`} disabled={readOnly} onClick={()=>tagPage(pg.id,active?types.filter(x=>x!==t):[...types,t])}
                        style={{background:active?typeColors[t]+"33":"transparent",color:active?typeColors[t]:C.muted,border:`1px solid ${active?typeColors[t]+"88":C.border}`,borderRadius:10,padding:"2px 8px",fontSize:12,fontWeight:700,cursor:readOnly?"default":"pointer",transition:"all 0.1s"}}>
                        {SHORT[t]}
                      </button>
                    );
                  })}
                </div>
                {awaitingConfirm&&reasonPickerFor===pg.id&&(
                  <div style={{marginTop:4,background:"rgba(250,204,21,0.08)",border:"1px solid rgba(250,204,21,0.35)",borderRadius:6,padding:"8px 10px"}}>
                    <div style={{fontSize:11,color:"#fde047",fontWeight:700,marginBottom:5}}>Why was this type removed?</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {["Zoomed section","Wrong type","No useful content","Other"].map(r=>(
                        <button key={r} onClick={()=>{
                          const ch=pageTypeChangesRef.current[pg.id];
                          if(ch){pageTypeChangesRef.current[pg.id]={...ch,reason:r};}
                          setReasonPickerFor(null);
                        }} style={{background:"rgba(250,204,21,0.12)",color:"#fde047",border:"1px solid rgba(250,204,21,0.4)",borderRadius:8,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer"}}>
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          });})()}

          {/* Drop zone tile */}
          {!readOnly&&(
            <div
              onDragOver={e=>{e.preventDefault();setDragging(true);}}
              onDragLeave={()=>setDragging(false)}
              onDrop={e=>{e.preventDefault();setDragging(false);if(!awaitingConfirm)addFiles(e.dataTransfer.files);}}
              onClick={()=>!processing&&!detecting&&!awaitingConfirm&&fileRef.current?.click()}
              data-tour="add-files-zone"
              style={{flexShrink:0,width:420,height:381,border:`2px dashed ${dragging?C.accent:C.border}`,borderRadius:6,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:processing||detecting?"default":"pointer",transition:"all 0.15s",background:dragging?C.accentDim+"33":"transparent",textAlign:"center",padding:12,gap:8}}>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" onChange={e=>{addFiles(e.target.files);e.target.value="";}} style={{display:"none"}}/>
              <div style={{fontSize:32,opacity:processing||detecting?1:0.35}}>{processing||detecting?"⏳":"+"}</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.6,whiteSpace:"pre-line"}}>{processing?processingMsg:"Drop or click\nPDF · JPG · PNG"}</div>
            </div>
          )}
        </div>
      </div>

      {/* Other Documents */}
      <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
          <div style={{fontSize:12,color:C.muted,fontWeight:700,letterSpacing:0.7}}>OTHER DOCUMENTS{(panel.otherDocs||[]).length>0?` — ${(panel.otherDocs||[]).length}`:""}</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start"}}>
          {(panel.otherDocs||[]).map((doc,di)=>(
            <div key={di} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",fontSize:11,display:"flex",alignItems:"center",gap:6,maxWidth:240,cursor:doc.storageUrl?"pointer":"default"}} onClick={()=>{if(doc.storageUrl)window.open(doc.storageUrl,"_blank");}}>
              <span style={{color:"#94a3b8"}}>📄</span>
              <span style={{color:doc.storageUrl?"#38bdf8":C.text,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,textDecoration:doc.storageUrl?"underline":"none"}} title={doc.name}>{doc.name}</span>
              {!readOnly&&<button onClick={e=>{e.stopPropagation();removeOtherDoc(di);}} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:14,padding:0,lineHeight:1,opacity:0.6}} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=0.6}>✕</button>}
            </div>
          ))}
          {!readOnly&&bcProjectNumber&&_bcToken&&(
            <div
              onDragOver={e=>{e.preventDefault();setDocDragging(true);}}
              onDragLeave={()=>setDocDragging(false)}
              onDrop={e=>{e.preventDefault();setDocDragging(false);uploadOtherDoc(e.dataTransfer.files);}}
              onClick={()=>!docUploading&&docFileRef.current?.click()}
              style={{width:140,height:60,border:`2px dashed ${docDragging?C.accent:C.border}`,borderRadius:6,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:docUploading?"default":"pointer",transition:"all 0.15s",background:docDragging?C.accentDim+"33":"transparent",textAlign:"center",padding:6}}>
              <input ref={docFileRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" onChange={e=>{uploadOtherDoc(e.target.files);e.target.value="";}} style={{display:"none"}}/>
              <div style={{fontSize:18,opacity:docUploading?1:0.35}}>{docUploading?"⏳":"+"}</div>
              <div style={{fontSize:10,color:C.muted}}>{docUploading?"Uploading…":"Specs · PDFs · Docs"}</div>
            </div>
          )}
          {!bcProjectNumber&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic"}}>Connect to BC project to upload reference documents</div>}
        </div>
      </div>

      {/* Confirm page types banner */}
      {awaitingConfirm&&!detecting&&(
        <div style={{border:"1px solid",borderRadius:8,padding:"12px 16px",marginBottom:12,animation:"pulseYellow 1.6s ease-in-out infinite"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:"#fde047",marginBottom:3,animation:"pulse 1.6s ease-in-out infinite"}}>Review drawing types before extracting</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>Check that each page above is tagged correctly — <span style={{color:C.accent,fontWeight:600}}>BOM</span>, <span style={{color:C.green,fontWeight:600}}>SCH</span>, <span style={{color:C.purple,fontWeight:600}}>BP</span>, <span style={{color:C.teal||"#0d9488",fontWeight:600}}>ENC</span>, <span style={{color:C.muted,fontWeight:600}}>P&amp;ID</span>. Click a tag to add or remove it, then proceed.</div>
              {(()=>{const rCount=(pendingPages.length>0?pendingPages:pages).reduce((n,p)=>(p.regions||[]).filter(r=>r.type==="bom").length+n,0);return rCount>0?(
                <div style={{fontSize:12,color:"#818cf8",fontWeight:600,marginTop:4}}>{rCount} BOM region{rCount>1?"s":""} defined — extraction will use cropped regions for better accuracy</div>
              ):null;})()}
            </div>
            <button data-tip="Confirm drawing types are correct and begin BOM extraction, validation, and pricing" onClick={confirmAndExtract} style={{flexShrink:0,background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
              Proceed with Extraction
            </button>
          </div>
          <div style={{marginTop:10}}>
            <div style={{fontSize:11,fontWeight:600,color:C.muted,marginBottom:4,letterSpacing:0.3}}>EXTRACTION NOTES <span style={{fontWeight:400,fontStyle:"italic"}}>(optional — hints for AI about these drawings)</span></div>
            <textarea value={extractionNotes} onChange={e=>setExtractionNotes(e.target.value)} placeholder='e.g. "P6 has a zoomed BOM section on the right side — only extract from that section" or "BOM spans pages 3-5, ignore parts list on page 2"' rows={2} style={{width:"100%",background:"rgba(255,255,255,0.04)",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",color:C.text,fontSize:12,lineHeight:1.5,resize:"vertical",outline:"none",fontFamily:"inherit"}}/>
          </div>
        </div>
      )}

      {/* Error */}
      {err&&<div style={{background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:"10px 14px",fontSize:13,color:C.red,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>{err}<button onClick={()=>setErr("")} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:15,lineHeight:1}}>✕</button></div>}

      {/* Unified progress bar — extraction, validation, and pricing all share this one bar */}
      {unifiedProgress&&(()=>{
        const pct=unifiedProgress.pct;
        const isErr=unifiedProgress.isError;
        const barBg=isErr?`linear-gradient(90deg,${C.red},#b91c1c)`:`linear-gradient(90deg,${C.accent},#818cf8)`;
        const dismiss=()=>{if(pricingProgress?.isError)setPricingProgress(null);else bgDismiss(panel.id);};
        return(
        <div style={{marginBottom:12}}>
          <div style={{width:"100%",height:38,background:isErr?C.redDim:C.border,borderRadius:10,overflow:"hidden",position:"relative"}}>
            <div style={{height:"100%",background:barBg,borderRadius:10,transition:"width 0.25s linear",width:(isErr?100:pct)+"%",position:"relative",overflow:"hidden"}}>
              {!isErr&&pct<100&&<div style={{position:"absolute",top:0,bottom:0,width:"25%",background:"linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)",animation:"shimmer 1.6s ease-in-out infinite",pointerEvents:"none"}}/>}
            </div>
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px"}}>
              <span style={{display:"flex",alignItems:"baseline",gap:8,minWidth:0,overflow:"hidden"}}>
                <span style={{fontSize:14,fontWeight:700,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.5)",whiteSpace:"nowrap"}}>{unifiedProgress.msg||"Processing…"}</span>
                {!isErr&&pct<100&&<span style={{fontSize:11,color:"rgba(255,255,255,0.65)",fontWeight:500,whiteSpace:"nowrap",fontStyle:"italic"}}>{unifiedProgress.wentBack?"Whoops! I need more time on this!":"Working on it…"}</span>}
              </span>
              {isErr
                ?<button onClick={dismiss} style={{background:"none",border:"1px solid rgba(255,255,255,0.4)",borderRadius:6,color:"#fff",cursor:"pointer",fontSize:13,fontWeight:700,padding:"3px 10px",lineHeight:1}}>Dismiss</button>
                :<span style={{fontSize:16,fontWeight:800,color:"#fff",textShadow:"0 1px 3px rgba(0,0,0,0.5)",fontVariantNumeric:"tabular-nums"}}>{pct}%</span>
              }
            </div>
          </div>
        </div>);})()}

      {/* Joke popup while waiting */}
      {unifiedProgress&&!unifiedProgress.isError&&unifiedProgress.pct<100&&unifiedProgress.pct>5&&(()=>{
        const joke=getNextJoke();
        if(!joke)return null;
        return(
          <div style={{marginBottom:12,background:"rgba(99,102,241,0.08)",border:`1px solid ${C.accent}33`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"flex-start",gap:12}}>
            <span style={{fontSize:22,lineHeight:1,flexShrink:0}}>&#128516;</span>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontSize:12,fontWeight:700,color:C.accent,marginBottom:4,letterSpacing:0.3}}>WHILE WE'RE WAITING...</div>
              <div style={{fontSize:13,color:C.text,fontWeight:600}}>{joke.setup}</div>
              <div style={{fontSize:13,color:C.yellow,fontStyle:"italic",marginTop:4}}>{joke.punchline}</div>
            </div>
          </div>
        );
      })()}

      {/* Compliance Review */}
      {panel.complianceReview&&panel.complianceReview.concerns?.length>0&&(()=>{
        const cr=panel.complianceReview;
        const sevColors={critical:'#ef4444',warning:'#f59e0b',info:'#38bdf8'};
        const sevLabels={critical:'CRITICAL',warning:'WARNING',info:'INFO'};
        const sevIcons={critical:'\u26D4',warning:'\u26A0\uFE0F',info:'\u2139\uFE0F'};
        const critCount=cr.concerns.filter(c=>c.severity==='critical').length;
        const warnCount=cr.concerns.filter(c=>c.severity==='warning').length;
        const infoCount=cr.concerns.filter(c=>c.severity==='info').length;
        const headerColor=critCount>0?'#ef4444':warnCount>0?'#f59e0b':'#38bdf8';
        return <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,cursor:"pointer"}} onClick={()=>setShowCompliance(prev=>!prev)}>
            <div style={{fontSize:12,color:headerColor,fontWeight:700,letterSpacing:0.7}}>
              UL508A / C22.2 COMPLIANCE REVIEW
            </div>
            {critCount>0&&<span style={{fontSize:10,fontWeight:700,color:'#fff',background:'#ef4444',borderRadius:10,padding:'1px 7px'}}>{critCount} critical</span>}
            {warnCount>0&&<span style={{fontSize:10,fontWeight:700,color:'#1a1a2e',background:'#f59e0b',borderRadius:10,padding:'1px 7px'}}>{warnCount} warning{warnCount>1?'s':''}</span>}
            {infoCount>0&&<span style={{fontSize:10,fontWeight:700,color:'#fff',background:'#38bdf8',borderRadius:10,padding:'1px 7px'}}>{infoCount} info</span>}
            <div style={{flex:1}}/>
            <span style={{fontSize:11,color:C.muted,fontWeight:600}}>{showCompliance?'Hide':'Show'}</span>
          </div>
          {showCompliance&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
            {cr.concerns.map((c,i)=><div key={i} style={{background:c.severity==='critical'?'rgba(239,68,68,0.08)':c.severity==='warning'?'rgba(245,158,11,0.08)':'rgba(56,189,248,0.06)',border:`1px solid ${c.severity==='critical'?'rgba(239,68,68,0.25)':c.severity==='warning'?'rgba(245,158,11,0.25)':'rgba(56,189,248,0.2)'}`,borderRadius:8,padding:'10px 12px'}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{fontSize:10,fontWeight:800,color:sevColors[c.severity],background:c.severity==='critical'?'rgba(239,68,68,0.15)':c.severity==='warning'?'rgba(245,158,11,0.15)':'rgba(56,189,248,0.12)',borderRadius:4,padding:'1px 6px',letterSpacing:0.5}}>{sevLabels[c.severity]}</span>
                <span style={{fontSize:10,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:0.5}}>{(c.category||'').replace(/_/g,' ')}</span>
              </div>
              <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3}}>{c.title}</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.5}}>{c.detail}</div>
              {c.reference&&<div style={{fontSize:11,color:'#818cf8',marginTop:4,fontWeight:600}}>{c.reference}{c.page?' (p.'+c.page+')':''}</div>}
            </div>)}
            {cr.checklist?.length>0&&<div style={{background:'rgba(99,102,241,0.06)',border:'1px solid rgba(99,102,241,0.15)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:11,fontWeight:700,color:'#818cf8',letterSpacing:0.5,marginBottom:6}}>INSPECTION CHECKLIST</div>
              {cr.checklist.map((item,i)=><div key={i} style={{fontSize:12,color:C.muted,padding:'2px 0',display:'flex',gap:6,alignItems:'flex-start'}}>
                <span style={{color:'#818cf8',fontSize:14,lineHeight:1}}>{'☐'}</span>
                <span>{item}</span>
              </div>)}
            </div>}
            {cr.observations?.length>0&&<div style={{fontSize:11,color:C.muted,fontStyle:'italic',padding:'4px 0'}}>
              {cr.observations.map((o,i)=><div key={i} style={{padding:'1px 0'}}>• {o}</div>)}
            </div>}
          </div>}
        </div>;
      })()}

      {/* BOM Table */}
      {true&&(
        <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14,marginBottom:14,position:"relative"}}>
          {(extracting||aiPricing||validatingPanel)&&(panel.bom||[]).length>0&&(
            <div style={{position:"absolute",inset:0,background:"rgba(13,13,20,0.7)",zIndex:5,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,background:C.card,border:`1px solid ${C.accent}`,borderRadius:8,padding:"12px 20px",boxShadow:"0 0 20px rgba(56,189,248,0.3)"}}>
                <div className="spin" style={{fontSize:18,color:C.accent}}>◌</div>
                <span style={{fontSize:13,fontWeight:700,color:C.accent}}>{extracting?"Extracting BOM…":aiPricing?"Getting prices…":"Validating…"}</span>
              </div>
            </div>
          )}
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10,flexWrap:"wrap"}}>
            <div style={{fontSize:12,color:C.muted,fontWeight:700,letterSpacing:0.7,marginRight:6}}>
              BILL OF MATERIALS — {(panel.bom||[]).length} items
            </div>
            {!readOnly&&_apiKey&&(panel.bom||[]).length>0&&(
              <button data-tip="Re-run AI pricing on all BOM rows to fetch current prices from Business Central" onClick={()=>runPricingOnPanel()} disabled={aiPricing}
                style={btn(C.accentDim,C.accent,{fontSize:12,padding:"4px 12px",opacity:aiPricing?0.5:1,cursor:aiPricing?"default":"pointer"})}>
                {aiPricing?"Refreshing…":"↻ Re-Extract Pricing"}
              </button>
            )}
            {bcProjectNumber&&!readOnly&&(
              <button data-tip="Push BOM and labor costs to Business Central job planning lines" onClick={syncPlanningLinesToBC} disabled={bcSyncing}
                style={btn(bcSyncStatus==="ok"?C.greenDim:bcSyncStatus==="error"?"#2a0a0a":bcSyncStatus==="pending"?"#3a1f00":C.accentDim, bcSyncStatus==="ok"?C.green:bcSyncStatus==="error"?C.red:bcSyncStatus==="pending"?"#f59e0b":C.accent,{fontSize:12,padding:"4px 12px",opacity:bcSyncing?0.5:1,animation:bcSyncStatus==="pending"?"pulseYellow 2s ease-in-out infinite":"none"})}>
                {bcSyncing?"Syncing…":bcSyncStatus==="ok"?"✓ Synced":bcSyncStatus==="error"?"✗ Sync Failed":bcSyncStatus==="pending"?"⚠ Push Update to BC":"⇅ Sync BC"}
              </button>
            )}
            {(panel.bom||[]).length>0&&<button onClick={exportCSV} style={btn(C.greenDim,C.green,{fontSize:12,padding:"4px 12px"})}>⬇ CSV</button>}
            {(panel.bom||[]).length>0&&<button onClick={exportCADLinkBOM} style={btn("#0d1a2a","#38bdf8",{fontSize:12,padding:"4px 12px",border:"1px solid #38bdf844"})}>⬇ CADLink BOM</button>}
          </div>
          {(panel.bom||[]).length>0&&<div data-tour="bom-table" style={{borderRadius:8,border:`1px solid ${C.border}`,overflowX:"hidden"}}>
            <table style={{borderCollapse:"collapse",fontSize:13,width:"100%",tableLayout:"fixed"}}>
              <colgroup>
                <col style={{width:42}}/><col style={{width:42}}/><col style={{width:34}}/>
                <col style={{width:"18%"}}/><col style={{width:28}}/><col style={{width:"22%"}}/>
                <col style={{width:"10%"}}/><col style={{width:"11%"}}/>
                <col style={{width:82}}/><col style={{width:72}}/><col style={{width:60}}/><col style={{width:40}}/>
              </colgroup>
              <thead>
                <tr style={{background:"#0a0a12"}}>
                  {["#","Ref","Qty","Part Number","","Description","Manufacturer","Supplier","Unit $","Ext $","Priced",""].map((h,hi)=>(
                    <th key={h||"bc"+hi} style={{padding:"9px 4px",textAlign:h==="Unit $"||h==="Ext $"?"right":hi<3?"center":"left",color:C.muted,fontWeight:700,fontSize:11,whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(()=>{
                  const sortedBom=(panel.bom||[]).slice().sort((a,b)=>{
                    if(a.isLaborRow&&!b.isLaborRow)return -1;
                    if(!a.isLaborRow&&b.isLaborRow)return 1;
                    if(a.isLaborRow&&b.isLaborRow)return(a.partNumber||"").localeCompare(b.partNumber||"");
                    if(!a.itemNo&&!b.itemNo)return 0;
                    if(!a.itemNo)return 1;
                    if(!b.itemNo)return -1;
                    const an=parseFloat(a.itemNo),bn=parseFloat(b.itemNo);
                    if(!isNaN(an)&&!isNaN(bn))return an-bn;
                    return (a.itemNo||"").localeCompare(b.itemNo||"");
                  });
                  return sortedBom.map((row,i)=>{
                  const rowBg=bcUpdatedRows.has(String(row.id))?undefined:row.isLaborRow?"#0a1628":(!row.isLaborRow&&!row.customerSupplied&&(+row.qty===0||+row.unitPrice===0))?"rgba(255,40,40,0.35)":i%2===0?"transparent":"rgba(255,255,255,0.015)";
                  return(
                  <tr key={row.id} className={bcUpdatedRows.has(String(row.id))?"bc-row-updated":undefined} style={{borderBottom:i<sortedBom.length-1?`1px solid ${C.border}33`:"none",background:rowBg}}>
                    <td style={{padding:"3px 4px",whiteSpace:"nowrap",textAlign:"center",fontSize:13,fontWeight:700,color:C.muted,userSelect:"none",position:"relative"}}>
                      {i+1}
                      {bcUpdatedRows.has(String(row.id))&&bcUpdateNotif&&(
                        <div onClick={e=>{e.stopPropagation();setBcUpdateNotif(false);}} style={{position:"absolute",top:-26,left:0,zIndex:200,background:"#052e16",border:"1px solid #4ade80",borderRadius:6,padding:"3px 10px",color:"#4ade80",fontSize:11,fontWeight:600,whiteSpace:"nowrap",boxShadow:"0 2px 12px rgba(0,0,0,0.6)",cursor:"pointer",animation:"fadeIn 0.2s ease-out",display:"flex",alignItems:"center",gap:5}}>
                          <span>↻</span><span>BC price updated</span>
                        </div>
                      )}
                    </td>
                    <td style={{padding:"3px 4px",whiteSpace:"nowrap",textAlign:"center",fontSize:12,color:row.itemNo?C.accent:C.muted,userSelect:"none"}}>{row.itemNo||"—"}</td>
                    {[["qty",56],["partNumber",0,"fit"],["_bc",32],["description",220],["manufacturer",0,"fit"],["_supplier",0,"fit"]].map(([f,w,mode])=>(
                      f==="_bc"?(
                        <td key="_bc" style={{padding:"3px 2px",width:32,textAlign:"center"}}>
                          {!readOnly&&_bcToken&&row.priceSource!=="bc"&&row.priceSource!=="manual"&&(
                            <button data-tip="Auto-match this part number in Business Central — click to find the best match or open the item browser" title="Fuzzy BC lookup" onClick={async()=>{
                              const pn=(row.partNumber||"").trim();
                              if(!pn)return;
                              const result=await bcFuzzyLookup(pn);
                              if(result.match)applyBcItem(row.id,result.match);
                              else if(result.suggestions.length>0)setBcFuzzySuggestions(prev=>({...prev,[row.id]:result.suggestions}));
                              else{setBcBrowserTarget(row.id);setBcBrowserQuery(pn);setBcBrowserOpen(true);}
                            }} style={{background:"#2563eb",border:"none",color:"#fff",cursor:"pointer",fontSize:9,fontWeight:800,borderRadius:"50%",width:24,height:24,lineHeight:1,display:"inline-flex",alignItems:"center",justifyContent:"center",padding:0}}>BC</button>
                          )}
                        </td>
                      ):f==="_supplier"?(
                        <td key="_supplier" title={row.bcVendorName||""} style={{padding:"3px 5px",fontSize:11}}>
                          <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.isLaborRow?"—":<span style={{color:row.bcVendorName?C.sub:C.muted}}>{row.bcVendorName||"—"}</span>}</div>
                        </td>
                      ):
                      <td key={f} title={f==="description"||f==="manufacturer"?row[f]||"":undefined} style={{padding:"3px 5px",...(f==="partNumber"?{overflow:"hidden",whiteSpace:"nowrap"}:{overflow:"hidden",whiteSpace:"nowrap"})}}>
                        {mode==="fit"?(
                          <div>
                          <div style={{display:"flex",alignItems:"center"}}>
                          {f==="partNumber"&&!readOnly&&!row.isLaborRow&&_bcToken&&(
                            <button data-tip="Search and select a replacement part number from the Business Central catalog" title="Browse BC items" onClick={()=>{setBcBrowserTarget(row.id);setBcBrowserQuery(row.partNumber||row.description||"");setBcBrowserOpen(true);}}
                              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"2px 4px",lineHeight:1,opacity:0.85,flexShrink:0,filter:"brightness(1.8)"}}
                              onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=0.85}>🔍</button>
                          )}
                          <div style={{position:"relative",display:"inline-flex",alignItems:"center",minWidth:80}}>
                            <span style={{visibility:"hidden",whiteSpace:"pre",fontSize:13,fontFamily:"inherit",padding:"5px 20px 5px 7px",display:"block",pointerEvents:"none"}}>{row[f]||"\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0"}</span>
                            <input value={row[f]||""} readOnly={readOnly||row.isLaborRow}
                              onChange={e=>!row.isLaborRow&&updateBomRow(row.id,f,e.target.value)}
                              onBlur={e=>{
                                e.target.style.borderColor="transparent";
                                const val=e.target.value;
                                const updatedBom=(panel.bom||[]).map(r=>r.id===row.id?{...r,[f]:val}:r);
                                saveBomRow({...panel,bom:updatedBom});
                                if(f==="partNumber"&&val.trim()){
                                  savePartLibraryEntry(uid,{manufacturer:row.manufacturer||"",description:row.description||"",partNumber:val.trim()})
                                    .then(()=>loadPartLibrary(uid).then(setPartLibrary)).catch(()=>{});
                                }
                              }}
                              onFocus={e=>{e.target.style.borderColor=C.accent;if(f==="partNumber")bomEditRef.current[row.id]=row[f]||"";}}
                              onKeyDown={e=>{
                                if(f==="partNumber"&&e.key==="Enter"&&!readOnly){
                                  e.preventDefault();
                                  const newVal=e.target.value.trim();
                                  const origVal=bomEditRef.current[row.id]||"";
                                  if(newVal&&newVal!==origVal){
                                    const label=row.itemNo||(i+1);
                                    const desc=row.description?` - "${row.description}"`:"";
                                    const was=origVal?` (was: ${origVal})`:"";
                                    const line=`Item ${label} - correct part number is ${newVal}${was}${desc}`;
                                    setAiFeedback(prev=>(prev.trim()?prev.trim()+"\n":"")+line);
                                    const updatedBom=(panel.bom||[]).map(r=>r.id===row.id?{...r,[f]:newVal}:r);
                                    const updatedPanel={...panel,bom:updatedBom};
                                    onUpdate(updatedPanel);
                                    saveBomRow(updatedPanel);
                                    if(origVal.trim()){
                                      savePartCorrection(uid,{wrongValue:origVal,correctValue:newVal,description:row.description||"",manufacturer:row.manufacturer||""})
                                        .then(()=>loadPartCorrections(uid).then(setPartCorrections)).catch(()=>{});
                                    }
                                    e.target.blur();
                                    setTimeout(()=>{feedbackRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"});feedbackRef.current?.focus();},80);
                                  } else {
                                    e.target.blur();
                                  }
                                }
                              }}
                              style={{...inp({padding:"5px 14px 5px 7px",fontSize:13,borderColor:"transparent",background:"transparent",borderRadius:5}),position:"absolute",inset:0,width:"100%",minWidth:0}}
                            />
                            {f==="partNumber"&&(row.learnedPartNumber||row.correctedByLibrary)&&(
                              <span style={{position:"absolute",top:3,right:3,fontSize:9,color:row.correctedByLibrary?C.yellow:C.teal,pointerEvents:"none",fontWeight:800}}>{row.correctedByLibrary?"🔧":"📚"}</span>
                            )}
                          </div>
                          {f==="partNumber"&&row.autoLoaded&&(
                            <span style={{fontSize:10,color:C.red,fontWeight:700,marginLeft:6,whiteSpace:"nowrap"}}>Auto-Loaded</span>
                          )}
                          {f==="partNumber"&&row.isCrossed&&row.crossedFrom&&normPart(row.crossedFrom)!==normPart(row.partNumber)&&(
                            <span style={{fontSize:10,color:C.red,fontWeight:700,marginLeft:6,whiteSpace:"nowrap"}}>{row.autoReplaced?"ARC crossed":"crossed item"}</span>
                          )}
                          {f==="partNumber"&&row.isCorrection&&(
                            <span style={{fontSize:10,color:C.red,fontWeight:700,marginLeft:6,whiteSpace:"nowrap"}}>
                              {row.correctionType==='extraction'?'extraction corrected':row.correctionType==='formatting'?'formatting error':row.correctionType==='format'?'format corrected':'corrected'}
                            </span>
                          )}
                          </div>
                          {f==="partNumber"&&row.isCrossed&&row.crossedFrom&&normPart(row.crossedFrom)!==normPart(row.partNumber)&&!readOnly&&(()=>{
                            const alt=alternates.find(a=>a.originalPN===row.crossedFrom);
                            return(
                              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:2,paddingLeft:2}}>
                                <span style={{fontSize:10,color:C.muted}}>from: <span style={{color:C.red}}>{row.crossedFrom}</span></span>
                                {alt&&(
                                  <label style={{display:"flex",alignItems:"center",gap:3,fontSize:10,color:C.muted,cursor:"pointer"}}>
                                    <input type="checkbox" checked={alt.autoReplace||false}
                                      onChange={e=>setAltAutoReplace(uid,row.crossedFrom,e.target.checked).then(alts=>setAlternates([...alts])).catch(()=>{})}
                                      style={{accentColor:C.accent,width:10,height:10,cursor:"pointer"}}/>
                                    auto-replace
                                  </label>
                                )}
                              </div>
                            );
                          })()}
                          {f==="partNumber"&&!row.isLaborRow&&!row.isCrossed&&!readOnly&&(()=>{
                            const pn=(row.partNumber||"").trim();
                            const avail=pn?alternates.filter(a=>a.originalPN===pn):[];
                            if(!avail.length)return null;
                            return(
                              <div style={{marginTop:3,maxWidth:"100%",overflow:"hidden"}}>
                                <select onChange={e=>{
                                  if(!e.target.value)return;
                                  const alt=avail.find(a=>a.replacement.partNumber===e.target.value);
                                  if(alt)applyBcItem(row.id,{number:alt.replacement.partNumber,unitCost:alt.replacement.unitCost,displayName:alt.replacement.description});
                                  e.target.value="";
                                }} style={{fontSize:10,background:"#1a1040",border:`1px solid ${C.accent}`,borderRadius:4,color:C.accent,padding:"1px 4px",cursor:"pointer",maxWidth:"100%",boxSizing:"border-box"}}>
                                  <option value="">⇄ Alternates…</option>
                                  {avail.map(a=>(
                                    <option key={a.replacement.partNumber} value={a.replacement.partNumber}>
                                      {a.replacement.partNumber}{a.autoReplace?" ✓ auto":""} — {a.replacement.description}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })()}
                          {f==="partNumber"&&row.suggestedPartNumber&&!row.partNumber&&!readOnly&&(
                            <div style={{display:"flex",alignItems:"center",gap:4,marginTop:3,paddingLeft:2,flexWrap:"nowrap",maxWidth:"100%",overflow:"hidden"}}>
                              <span style={{fontSize:10,color:C.teal}}>📚</span>
                              <span style={{fontSize:11,color:C.teal,fontWeight:700}}>{row.suggestedPartNumber}</span>
                              <button onClick={()=>confirmSuggestion(row.id)} style={{fontSize:10,color:"#000",background:C.teal,border:"none",borderRadius:3,padding:"1px 7px",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>Use</button>
                              <button onClick={()=>dismissSuggestion(row.id)} style={{fontSize:11,color:C.muted,background:"none",border:"none",cursor:"pointer",lineHeight:1}}>✕</button>
                            </div>
                          )}
                          {f==="partNumber"&&bcFuzzySuggestions[row.id]&&!readOnly&&(
                            <div style={{marginTop:4,background:"#0a0a12",border:`1px solid ${C.accent}`,borderRadius:6,padding:6,maxHeight:140,overflow:"auto",maxWidth:"100%",minWidth:0,boxSizing:"border-box"}}>
                              <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
                                <div style={{fontSize:10,color:C.accent,fontWeight:700,flex:1}}>BC FUZZY MATCHES</div>
                                <button onClick={()=>setBcFuzzySuggestions(prev=>{const next={...prev};delete next[row.id];return next;})}
                                  style={{fontSize:10,color:C.text,background:C.border,border:"none",cursor:"pointer",padding:"2px 10px",lineHeight:1,fontWeight:600,borderRadius:20}}
                                  onMouseEnter={e=>e.target.style.background=C.muted} onMouseLeave={e=>e.target.style.background=C.border}>Close</button>
                              </div>
                              {bcFuzzySuggestions[row.id].map((s,si)=>(
                                <div key={s.number+si} onClick={()=>applyBcItem(row.id,s)}
                                  style={{display:"flex",alignItems:"center",gap:6,padding:"3px 4px",cursor:"pointer",borderRadius:4,fontSize:11}}
                                  onMouseEnter={e=>e.currentTarget.style.background=C.accentDim+"66"}
                                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                  <span style={{color:C.text,fontWeight:600,whiteSpace:"nowrap"}}>{s.number}</span>
                                  <span style={{color:C.muted,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.displayName}</span>
                                  <span style={{color:C.green,fontWeight:600,whiteSpace:"nowrap"}}>{s.unitCost!=null?"$"+s.unitCost.toFixed(2):""}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          </div>
                        ):(
                          <input defaultValue={row[f]||""} key={row.id+"-"+f+"-"+(row[f]??"")} readOnly={readOnly||row.isLaborRow}
                            onBlur={e=>{
                              e.target.style.borderColor="transparent";
                              if(autoSaveTimer.current){clearTimeout(autoSaveTimer.current);autoSaveTimer.current=null;}
                              const val=e.target.value;
                              if(val===String(row[f]||""))return;
                              const updatedBom=(panel.bom||[]).map(r=>r.id===row.id?{...r,[f]:val}:r);
                              const updated={...panel,bom:updatedBom};
                              onUpdate(updated);
                              saveBomRow(updated);
                              if(f==="partNumber"&&val.trim()){
                                savePartLibraryEntry(uid,{manufacturer:row.manufacturer||"",description:row.description||"",partNumber:val.trim()})
                                  .then(()=>loadPartLibrary(uid).then(setPartLibrary)).catch(()=>{});
                              }
                            }}
                            style={{...inp({padding:"5px 14px 5px 7px",fontSize:13,borderColor:"transparent",background:"transparent",borderRadius:5}),width:"100%",minWidth:0,boxSizing:"border-box"}}
                            onFocus={e=>{e.target.style.borderColor=C.accent;if(f==="qty")e.target.select();}}
                          />
                        )}
                      </td>
                    ))}
                    <td style={{padding:"3px 5px",textAlign:"right",width:110}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4}}>
                        {row.isLaborRow&&<span style={{background:"#1e3a5f",color:"#38bdf8",borderRadius:8,padding:"1px 5px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>LABOR</span>}
                        {!row.isLaborRow&&row.priceSource==="bc"&&<span style={{background:"#2563eb22",color:"#5b9aff",borderRadius:8,padding:"1px 5px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>BC</span>}
                        {!row.isLaborRow&&row.priceSource==="ai"&&<span style={{background:C.teal+"22",color:C.teal,borderRadius:8,padding:"1px 5px",fontSize:11,fontWeight:700,whiteSpace:"nowrap",cursor:"pointer"}}
                          onMouseEnter={e=>{clearTimeout(aiSourceTooltipTimer.current);setAiSourceTooltip({x:e.clientX,y:e.clientY,sources:row.aiSources||[],basis:row.aiBasis||""});}}
                          onMouseLeave={()=>{aiSourceTooltipTimer.current=setTimeout(()=>setAiSourceTooltip(null),200);}}
                        >ARC AI</span>}
                        {!row.isLaborRow&&row.priceSource==="manual"&&<span style={{background:C.accentDim,color:C.accent,borderRadius:8,padding:"1px 5px",fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>M</span>}
                        {bcSyncErrors[row.id]&&(()=>{const ef=bcSyncErrors[row.id];function parsePillErr(e){if(!e)return"Sync error";if(/must select an existing item/i.test(e))return"Not in BC";if(/Posting Group/i.test(e))return"BC setup";if(/429|Too Many/i.test(e))return"Rate limit";return"BC error";}return(<button title={parsePillErr(ef.error)+"\nClick to fix in Item Browser"} onClick={()=>{setBcBrowserTarget(row.id);setBcBrowserQuery(row.partNumber||"");setBcBrowserOpen(true);}} style={{background:C.red,color:"#fff",border:"none",borderRadius:8,padding:"1px 6px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>⚠ {parsePillErr(ef.error)}</button>);})()}
                        <div style={{display:"inline-flex",alignItems:"center",gap:0,marginLeft:"auto"}}>
                        {row.isLaborRow?<span style={{color:C.muted,fontSize:13,minWidth:70,textAlign:"right"}}>— auto</span>:<>
                        <span style={{color:C.muted,fontSize:13,lineHeight:1}}>$</span>
                        <input type="text" inputMode="decimal" readOnly={readOnly}
                          defaultValue={row.unitPrice!=null?parseFloat(row.unitPrice).toFixed(2):""}
                          key={row.id+"-"+(row.priceSource||"")+(row.unitPrice??"")}
                          placeholder="—"
                          style={{background:"transparent",border:"1px solid transparent",borderRadius:5,padding:"5px 2px 5px 0",color:C.text,fontSize:13,outline:"none",textAlign:"left",width:70,minWidth:50}}
                          onFocus={e=>{e.target.style.borderColor=C.accent;e.target.style.background=C.card;e.target.select();}}
                          onBlur={e=>{e.target.style.borderColor="transparent";e.target.style.background="transparent";const v=e.target.value.trim();if(v===""){if(row.unitPrice!=null)updatePrice(row.id,"");}else{const n=parseFloat(v);if(!isNaN(n)){e.target.value=n.toFixed(2);if(n!==row.unitPrice)updatePrice(row.id,String(n));}else{e.target.value=row.unitPrice!=null?parseFloat(row.unitPrice).toFixed(2):"";}}}}
                          onKeyDown={e=>{if(e.key==="Enter")e.target.blur();if(e.key==="Escape"){e.target.value=row.unitPrice!=null?parseFloat(row.unitPrice).toFixed(2):"";e.target.blur();}}}
                        />
                        </>}
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"3px 8px",textAlign:"right",width:80,fontSize:13,color:row.unitPrice!=null?C.text:C.muted,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>
                      {row.isLaborRow?"—":row.unitPrice!=null?"$"+((row.unitPrice||0)*(row.qty||1)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):"—"}
                    </td>
                    <td style={{padding:"3px 5px",textAlign:"center",width:76,fontSize:10,whiteSpace:"nowrap",cursor:(!row.isLaborRow&&row.unitPrice!=null)?"help":"default",...(()=>{
                      if(row.isLaborRow)return{color:C.muted};
                      if(/matrix\s*systems/i.test(row.bcVendorName||"")||/^job.?buyoff$/i.test(row.partNumber||"")||/crate/i.test(row.description||"")||row.isContingency)return{color:"#4ade80",fontWeight:700};
                      const d=row.priceSource==="bc"&&"bcPoDate"in row?row.bcPoDate:row.priceDate;
                      if(!d)return{color:C.muted};
                      const age=Date.now()-d;
                      if(age<=30*24*60*60*1000)return{color:"#4ade80",fontWeight:700};
                      return{color:"#f87171",fontWeight:700};
                    })()}}
                    onMouseEnter={(!row.isLaborRow&&row.unitPrice!=null)?e=>{
                      const d=row.priceSource==="bc"&&"bcPoDate"in row?row.bcPoDate:row.priceDate;
                      const vendor=row.bcVendorName||(row.priceSource==="manual"?"Manual Entry":null);
                      setPriceTooltip({x:e.clientX,y:e.clientY,vendor,date:d,price:row.unitPrice,source:row.priceSource});
                    }:undefined}
                    onMouseMove={(!row.isLaborRow&&row.unitPrice!=null)?e=>{
                      setPriceTooltip(prev=>prev?{...prev,x:e.clientX,y:e.clientY}:prev);
                    }:undefined}
                    onMouseLeave={(!row.isLaborRow&&row.unitPrice!=null)?()=>setPriceTooltip(null):undefined}>
                      {row.isLaborRow?"—":(/matrix\s*systems/i.test(row.bcVendorName||"")||/^job.?buyoff$/i.test(row.partNumber||"")||/crate/i.test(row.description||"")||row.isContingency)?"Matrix":row.priceSource==="bc"&&"bcPoDate"in row?(row.bcPoDate?new Date(row.bcPoDate).toLocaleDateString("en-US",{month:"short",day:"numeric"}):row.rfqSentDate?"RFQ Sent":"No POs"):row.priceDate?new Date(row.priceDate).toLocaleDateString("en-US",{month:"short",day:"numeric"}):row.rfqSentDate?"RFQ Sent":"—"}
                    </td>
                    <td style={{padding:"3px 10px 3px 6px",textAlign:"center",width:44}}>
                      {!readOnly&&!row.isLaborRow&&<button onClick={()=>setDeleteConfirmId(row.id)} style={{background:"none",border:"none",color:"#ff3333",cursor:"pointer",fontSize:18,opacity:0.6,padding:"0",width:24,height:24,display:"inline-flex",alignItems:"center",justifyContent:"center",lineHeight:1}} onMouseEnter={e=>e.target.style.opacity=1} onMouseLeave={e=>e.target.style.opacity=0.6}>✕</button>}
                    </td>
                  </tr>
                  );});
                })()}
              </tbody>
            </table>
          </div>}
          {!readOnly&&<div style={{display:"flex",gap:8,marginTop:8}}>
            <button onClick={addBomRow} style={btn("transparent",C.accent,{fontSize:12,padding:"8px 12px",border:`1px dashed ${C.accent}66`,flex:1})}>+ Add Row</button>
          </div>}
          {/* BOM Notes */}
          {(()=>{
            const crossedItems=(panel.bom||[]).filter(r=>r.isCrossed&&r.crossedFrom&&normPart(r.crossedFrom)!==normPart(r.partNumber));
            const formatCorrections=(panel.bom||[]).filter(r=>r.isCorrection&&(r.correctionType==='format'||r.correctionType==='formatting')&&r.correctionFrom);
            return(
              <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                {crossedItems.length>0&&(
                  <div style={{marginBottom:8,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.red,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Crossed / Superseded</div>
                    {crossedItems.map((r,i)=>(
                      <div key={r.id} style={{fontSize:12,color:C.sub,marginBottom:2}}>
                        <span style={{color:C.muted}}>{i+1}.</span>{" "}
                        {r.autoReplaced&&<span style={{fontSize:10,color:"#a78bfa",fontWeight:700,marginRight:4}}>[ARC]</span>}
                        <span style={{color:C.red,fontWeight:600}}>{r.crossedFrom}</span>
                        <span style={{color:C.muted}}> → </span>
                        <span style={{color:C.accent,fontWeight:600}}>{r.partNumber}</span>
                        {r.description&&<span style={{color:C.muted,fontSize:11}}> ({r.description})</span>}
                      </div>
                    ))}
                  </div>
                )}
                {formatCorrections.length>0&&(
                  <div style={{marginBottom:8,background:"#0a0a12",border:"1px solid #f0c04044",borderRadius:6,padding:"8px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:"#f0c040",textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Format Corrections</div>
                    {formatCorrections.map((r,i)=>(
                      <div key={r.id} style={{fontSize:12,color:C.sub,marginBottom:2}}>
                        <span style={{color:C.muted}}>{i+1}.</span>{" "}
                        <span style={{color:"#f0c040",fontWeight:600}}>{r.correctionFrom}</span>
                        <span style={{color:C.muted}}> → </span>
                        <span style={{color:C.accent,fontWeight:600}}>{r.partNumber}</span>
                        {r.description&&<span style={{color:C.muted,fontSize:11}}> ({r.description})</span>}
                        <span style={{color:C.muted,fontSize:10}}> — {r.correctionType==='formatting'?'formatting error':'format corrected'}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Notes</div>
                  <textarea
                    value={panel.bomNotes||""}
                    onChange={e=>{const updated={...panel,bomNotes:e.target.value};onUpdate(updated);if(autoSaveTimer.current)clearTimeout(autoSaveTimer.current);autoSaveTimer.current=setTimeout(()=>{try{onSaveImmediate(updated);}catch(ex){}},1000);}}
                    readOnly={readOnly}
                    rows={3}
                    placeholder="Additional notes about this panel's BOM…"
                    style={{width:"100%",background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,padding:"6px 8px",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box",outline:"none"}}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Action row */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",borderTop:`1px solid ${C.border}`,paddingTop:12}}>
        <div style={{flex:1}}/>
        {(panel.bom||[]).length>0&&<div style={{fontSize:13,color:C.muted}}>{panel.bom.length} BOM items{panel.validation?.wireCount>0?` · ${panel.validation.wireCount} wires`:""}</div>}
      </div>

      {lightboxId&&(
        <DrawingLightbox
          pages={pages.filter(p=>p.dataUrl||p.storageUrl)}
          startId={lightboxId}
          onClose={()=>setLightboxId(null)}
          onRegionsChange={(pgId,newRegions)=>{
            const fresh=latestPanelRef.current;
            const updated={...fresh,pages:(fresh.pages||[]).map(p=>p.id===pgId?{...p,regions:newRegions}:p)};
            onUpdate(updated);
            try{onSaveImmediate(updated);}catch(e){}
            // Also update pendingPages so regions persist during review phase
            setPendingPages(pp=>pp.length>0?pp.map(p=>p.id===pgId?{...p,regions:newRegions}:p):pp);
          }}
        />
      )}
      {showEqModal&&React.createElement(EngineeringQuestionsModal,{panel,uid,onUpdate,onSave:onSaveImmediate,onClose:()=>setShowEqModal(false),memberMap:null})}
      {showAiQuestions&&(panel.aiQuestions||[]).length>0&&ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.85)"}}>
          <div style={{background:"#12121f",border:`1px solid ${C.border}`,borderRadius:12,padding:"24px 28px",maxWidth:560,width:"90%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 12px 48px rgba(0,0,0,0.6)"}}>
            <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:4}}>AI has questions about this BOM</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16,lineHeight:1.5}}>The extraction AI wasn't sure about a few items. Your answers will improve accuracy.</div>
            {(panel.aiQuestions||[]).map((q,qi)=>(
              <div key={qi} style={{marginBottom:14,padding:"10px 14px",background:"rgba(99,102,241,0.06)",border:`1px solid rgba(99,102,241,0.15)`,borderRadius:8}}>
                <div style={{fontSize:12,color:"#818cf8",fontWeight:700,marginBottom:2}}>{q.pageName||"BOM"} — {q.rowRef||"Item"}</div>
                <div style={{fontSize:13,color:C.text,marginBottom:8,lineHeight:1.5}}>{q.question}</div>
                {q.options&&q.options.length>0?(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
                    {q.options.map((opt,oi)=>(
                      <button key={oi} onClick={()=>setAiAnswers(a=>({...a,[qi]:opt}))}
                        style={{background:aiAnswers[qi]===opt?C.accent+"33":"rgba(255,255,255,0.04)",color:aiAnswers[qi]===opt?C.accent:C.sub,
                          border:`1px solid ${aiAnswers[qi]===opt?C.accent:C.border}`,borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",transition:"all 0.1s"}}>
                        {opt}
                      </button>
                    ))}
                  </div>
                ):null}
                <input value={aiAnswers[qi]||""} onChange={e=>setAiAnswers(a=>({...a,[qi]:e.target.value}))}
                  placeholder="Type your answer..."
                  style={{width:"100%",background:"#0d0d14",border:`1px solid ${C.border}`,color:C.text,borderRadius:5,padding:"5px 10px",fontSize:12,outline:"none",boxSizing:"border-box",marginTop:4}}/>
              </div>
            ))}
            <div style={{display:"flex",gap:10,marginTop:16}}>
              <button onClick={()=>{
                // Build feedback string from answers and re-apply
                const feedback=(panel.aiQuestions||[]).map((q,qi)=>{
                  const ans=aiAnswers[qi];
                  return ans?`Q: ${q.question} → A: ${ans}`:"";
                }).filter(Boolean).join("\n");
                if(feedback){
                  // Save answers as extraction notes for future re-extracts
                  const existingNotes=panel.extractionNotes||"";
                  const answerNotes="\n\nAI Q&A ANSWERS:\n"+feedback;
                  const updated={...panel,extractionNotes:existingNotes+answerNotes,aiQuestions:[]};
                  onUpdate(updated);
                  try{onSaveImmediate(updated).then(()=>{
                    // Auto re-extract with the new answers
                    runExtraction("Re-extracting BOM using your answers for better accuracy…");
                  });}catch(e){}
                }
                setShowAiQuestions(false);setAiAnswers({});
              }} style={{flex:1,background:C.accent,color:"#fff",border:"none",borderRadius:7,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                Save Answers &amp; Re-Extract
              </button>
              <button onClick={()=>{
                const updated={...panel,aiQuestions:[]};
                onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}
                setShowAiQuestions(false);setAiAnswers({});
              }} style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 16px",fontSize:13,cursor:"pointer"}}>
                Dismiss
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {bcBrowserOpen&&(
        <BCItemBrowserModal
          initialQuery={bcBrowserQuery}
          targetRow={bcBrowserTarget?(panel.bom||[]).find(r=>r.id===bcBrowserTarget)||null:null}
          pages={panel.pages||[]}
          syncError={bcBrowserTarget?bcSyncErrors[bcBrowserTarget]||null:null}
          onClose={()=>{setBcBrowserOpen(false);setBcBrowserTarget(null);setBcBrowserQuery("");}}
          onSelect={item=>{
            if(bcBrowserTarget){
              applyBcItem(bcBrowserTarget,item);
              if(item._created)setBcNewlyCreated(prev=>{const s=new Set(prev);s.add(bcBrowserTarget);return s;});
            }
            setBcBrowserOpen(false);setBcBrowserTarget(null);setBcBrowserQuery("");
          }}
        />
      )}
      {showCpdSearch&&<CPDSearchModal query={cpdQuery} uid={uid} panel={panel} onClose={()=>setShowCpdSearch(false)} onImportBom={rows=>{const newBom=[...(panel.bom||[]),...rows];const updated={...panel,bom:newBom};onUpdate(updated);try{onSaveImmediate(updated);}catch(e){}setShowCpdSearch(false);setCpdQuery("");}}/>}
      {showUpdateBom&&<UpdateBomInBCModal panel={panel} onClose={()=>setShowUpdateBom(false)} onUpdate={onUpdate} onSaveImmediate={onSaveImmediate}/>}
      {priceTooltip&&ReactDOM.createPortal(
        <div style={{position:"fixed",left:priceTooltip.x+14,top:priceTooltip.y-8,zIndex:99999,pointerEvents:"none",
          background:"#0d0d1a",border:"1px solid #334155",borderRadius:10,boxShadow:"0 6px 28px rgba(0,0,0,0.7)",
          padding:"10px 14px",minWidth:180,maxWidth:260,fontSize:12,lineHeight:1.6}}>
          <div style={{fontWeight:700,color:"#f1f5f9",marginBottom:4,fontSize:13}}>
            {priceTooltip.vendor||"Unknown Vendor"}
          </div>
          {priceTooltip.date&&(
            <div style={{color:"#94a3b8",marginBottom:2}}>
              <span style={{color:"#94a3b8",fontSize:11,textTransform:"uppercase",letterSpacing:0.5,marginRight:6}}>Quoted</span>
              {new Date(priceTooltip.date).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
            </div>
          )}
          <div style={{color:"#4ade80",fontWeight:700,fontSize:15,marginTop:2}}>
            ${(priceTooltip.price||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
            <span style={{color:"#94a3b8",fontWeight:400,fontSize:11,marginLeft:4}}>/ ea</span>
          </div>
          {priceTooltip.source&&(
            <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #1e293b",fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>
              Source: {priceTooltip.source==="bc"?"BC (Approved)":priceTooltip.source==="manual"?"Manual Entry":priceTooltip.source==="ai"?"ARC AI Estimated":priceTooltip.source}
            </div>
          )}
        </div>,document.body
      )}
      {aiSourceTooltip&&ReactDOM.createPortal(
        <div style={{position:"fixed",left:aiSourceTooltip.x+14,top:aiSourceTooltip.y-8,zIndex:99999,pointerEvents:"auto",
          background:"#0d0d1a",border:"1px solid "+C.teal+"44",borderRadius:10,boxShadow:"0 6px 28px rgba(0,0,0,0.7)",
          padding:"10px 14px",minWidth:200,maxWidth:300,fontSize:12,lineHeight:1.6}}
          onMouseEnter={()=>{clearTimeout(aiSourceTooltipTimer.current);}}
          onMouseLeave={()=>{setAiSourceTooltip(null);}}>
          <div style={{fontWeight:700,color:C.teal,marginBottom:6,fontSize:12,textTransform:"uppercase",letterSpacing:0.5}}>ARC AI Price Sources</div>
          {aiSourceTooltip.basis&&<div style={{color:"#c0c4cc",fontSize:11,marginBottom:6,lineHeight:1.4,fontStyle:"italic"}}>{aiSourceTooltip.basis}</div>}
          {aiSourceTooltip.sources.length>0?aiSourceTooltip.sources.map((s,i)=>(
            <div key={i} style={{marginBottom:i<aiSourceTooltip.sources.length-1?4:0}}>
              <a href={s.url} target="_blank" rel="noopener noreferrer"
                style={{color:s.type==="direct"?"#4ade80":"#38bdf8",textDecoration:"none",fontSize:12,fontWeight:600}}
                onMouseOver={e=>e.target.style.textDecoration="underline"}
                onMouseOut={e=>e.target.style.textDecoration="none"}>
                {s.type==="search"?"Search on "+s.name:s.name}
              </a>
              <span style={{color:"#94a3b8",fontSize:10,marginLeft:6}}>{s.type==="direct"?"Product page":"Search results"}</span>
            </div>
          )):<div style={{color:"#94a3b8",fontSize:11,lineHeight:1.5}}>No source links available.<br/>Re-run AI pricing to generate sources.</div>}
        </div>,document.body
      )}
      {deleteConfirmId&&ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
          onMouseDown={e=>{if(e.target===e.currentTarget)setDeleteConfirmId(null);}}>
          <div style={{background:"#0d0d1a",border:"1px solid #ef444466",borderRadius:10,padding:"24px 28px",width:340,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
            <div style={{fontSize:15,fontWeight:800,color:"#f87171",marginBottom:8}}>Delete BOM Row?</div>
            <div style={{fontSize:13,color:"#94a3b8",marginBottom:20,lineHeight:1.5}}>
              {(()=>{const r=(panel.bom||[]).find(x=>x.id===deleteConfirmId);return r?<><strong style={{color:"#f1f5f9",fontFamily:"monospace"}}>{r.partNumber||"(no part #)"}</strong>{r.description?<span style={{color:"#94a3b8"}}> — {r.description}</span>:null}</>:"This row";})()}
              <span style={{display:"block",marginTop:6,color:"#94a3b8",fontSize:12}}>This cannot be undone.</span>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setDeleteConfirmId(null)} style={{background:"#1e1e2e",border:"1px solid #3d6090",color:"#94a3b8",borderRadius:6,padding:"7px 18px",fontSize:13,cursor:"pointer",fontWeight:600}}>Cancel</button>
              <button onClick={()=>{deleteBomRow(deleteConfirmId);setDeleteConfirmId(null);}} style={{background:"#450a0a",border:"1px solid #ef444466",color:"#f87171",borderRadius:6,padding:"7px 18px",fontSize:13,cursor:"pointer",fontWeight:700}}>Delete</button>
            </div>
          </div>
        </div>,document.body
      )}
      {reExtractWarn&&ReactDOM.createPortal(
        React.createElement("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"},onMouseDown:e=>{if(e.target===e.currentTarget)setReExtractWarn(false);}},
          React.createElement("div",{style:{background:"#0d0d1a",border:"1px solid #f59e0b66",borderRadius:10,padding:"24px 28px",width:380,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}},
            React.createElement("div",{style:{fontSize:15,fontWeight:800,color:"#f59e0b",marginBottom:8}},"Re-Extract Drawings?"),
            React.createElement("div",{style:{fontSize:13,color:"#94a3b8",marginBottom:20,lineHeight:1.6}},"This will overwrite the current BOM, pricing, and validation data with a fresh extraction. Any manual edits will be lost."),
            React.createElement("div",{style:{display:"flex",gap:10,justifyContent:"flex-end",flexWrap:"wrap"}},
              React.createElement("label",{style:{display:"flex",alignItems:"center",gap:6,fontSize:11,color:"#94a3b8",cursor:"pointer",marginRight:"auto"}},
                React.createElement("input",{type:"checkbox",id:"_reextract_dismiss",style:{accentColor:C.accent}}),
                "Don't show this again"
              ),
              React.createElement("button",{onClick:()=>setReExtractWarn(false),style:{background:"#1e1e2e",border:"1px solid #3d6090",color:"#94a3b8",borderRadius:6,padding:"7px 18px",fontSize:13,cursor:"pointer",fontWeight:600}},"Cancel"),
              React.createElement("button",{onClick:()=>{
                if(document.getElementById("_reextract_dismiss")?.checked)localStorage.setItem("_arc_skip_reextract_warn","1");
                setReExtractWarn(false);runExtraction();
              },style:{background:"#451a03",border:"1px solid #f59e0b66",color:"#f59e0b",borderRadius:6,padding:"7px 18px",fontSize:13,cursor:"pointer",fontWeight:700}},"Re-Extract")
            )
          )
        ),document.body
      )}
      {priceConfirmPending&&ReactDOM.createPortal(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
          onMouseDown={e=>{if(e.target===e.currentTarget){applyBudgetaryPrice();}}}>
          <div style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:10,padding:"28px 32px",minWidth:400,maxWidth:480,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
            <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>Price Entry — {priceConfirmPending.partNumber||"Item"}</div>
            <div style={{fontSize:22,fontWeight:800,color:C.accent,marginBottom:12}}>${Number(priceConfirmPending.price).toFixed(2)}</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:16}}>Is this a confirmed cost or a budgetary estimate?</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
              <button onClick={applyBudgetaryPrice}
                style={{padding:"11px 14px",background:"#1a1a0a",border:"1px solid #f59e0b66",borderRadius:7,color:C.text,textAlign:"left",cursor:"pointer"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#f59e0b",marginBottom:3}}>Budgetary Estimate</div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>Update BOM price only. No update to BC. Price date will show as unconfirmed (—).</div>
              </button>
              <div style={{background:"#0a1a12",border:"1px solid #4ade8066",borderRadius:7,padding:"11px 14px"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#4ade80",marginBottom:6}}>Confirmed Cost</div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.4,marginBottom:8}}>Push to BC Item Card + Purchase Price. Sets today's date as price date.</div>
                <div style={{marginBottom:8}}>
                  <label style={{fontSize:10,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3,display:"block"}}>Supplier / Vendor</label>
                  <input value={priceConfirmVendor} onChange={e=>setPriceConfirmVendor(e.target.value)} placeholder="Enter vendor name"
                    style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text,fontSize:12,width:"100%",boxSizing:"border-box"}}/>
                </div>
                <button onClick={applyConfirmedPrice}
                  style={{padding:"8px 16px",background:"#166534",border:"1px solid #4ade80",borderRadius:6,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",width:"100%"}}>
                  ✓ Confirm & Push to BC
                </button>
              </div>
            </div>
            <button onClick={()=>setPriceConfirmPending(null)}
              style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:12,cursor:"pointer"}}>
              Cancel
            </button>
          </div>
        </div>
      ,document.body)}
      {crossOrCorrectPending&&(()=>{
        const aiSug=guessCorrection(crossOrCorrectPending.origPN,crossOrCorrectPending.newPN);
        const dismiss=()=>setCrossOrCorrectPending(null);
        return ReactDOM.createPortal(
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
            onMouseDown={e=>{if(e.target===e.currentTarget)dismiss();}}>
            <div style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:10,padding:"28px 32px",minWidth:400,maxWidth:520,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
              <div style={{fontSize:15,fontWeight:800,color:C.text,marginBottom:6}}>ARC — Part Number Change Detected</div>
              <div style={{fontSize:13,color:C.muted,marginBottom:12}}>
                <span style={{color:C.red,fontWeight:700}}>{crossOrCorrectPending.origPN}</span>
                <span style={{color:C.muted}}> → </span>
                <span style={{color:C.accent,fontWeight:700}}>{crossOrCorrectPending.newPN}</span>
              </div>
              <div style={{fontSize:11,background:"#120a2a",border:"1px solid #a78bfa",borderRadius:6,padding:"7px 10px",marginBottom:16,display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:13}}>🤖</span>
                <span style={{color:"#a78bfa",fontWeight:700}}>ARC suggests: </span>
                <span style={{color:C.text,fontWeight:600}}>{aiSug==='format'?'Formatting Error':'Bad Extraction'}</span>
                <span style={{color:C.muted,fontSize:10,marginLeft:2}}>— based on part number similarity</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                <button onClick={()=>{commitBcItem(crossOrCorrectPending.bomRowId,crossOrCorrectPending.bcItem,true);dismiss();}}
                  style={{padding:"11px 14px",background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:7,color:C.text,textAlign:"left",cursor:"pointer"}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.accent,marginBottom:3}}>Crossed / Superseded</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>An alternate product intentionally replacing the original. Saved to Alternates DB. Shown in BOM notes and on quote.</div>
                </button>
                <button onClick={()=>{commitBcItem(crossOrCorrectPending.bomRowId,crossOrCorrectPending.bcItem,false,'extraction');dismiss();}}
                  style={{padding:"11px 14px",background:"#1a0a0a",border:`1px solid ${C.red}`,borderRadius:7,color:C.text,textAlign:"left",cursor:"pointer"}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.red,marginBottom:3}}>Bad Extraction</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>AI misread the part number entirely. Fixed quietly — logged for AI learning. No note on quote.</div>
                </button>
                <button onClick={()=>{commitBcItem(crossOrCorrectPending.bomRowId,crossOrCorrectPending.bcItem,false,'formatting');dismiss();}}
                  style={{padding:"11px 14px",background:"#0a1a12",border:"1px solid #4ade80",borderRadius:7,color:C.text,textAlign:"left",cursor:"pointer"}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#4ade80",marginBottom:3}}>Formatting Error</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>Part number is correct but formatted differently (dashes, spacing). Auto-corrected on future extractions. Noted on quote.</div>
                </button>
                <button onClick={()=>{commitBcItem(crossOrCorrectPending.bomRowId,crossOrCorrectPending.bcItem,false,null,true);dismiss();}}
                  style={{padding:"11px 14px",background:"#111118",border:`1px solid ${C.border}`,borderRadius:7,color:C.text,textAlign:"left",cursor:"pointer"}}>
                  <div style={{fontWeight:700,fontSize:13,color:C.muted,marginBottom:3}}>Just Apply — No Learning</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.4}}>Apply the BC item without recording a cross or correction. Nothing saved to learning databases.</div>
                </button>
              </div>
              <button onClick={dismiss}
                style={{padding:"7px 14px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:12,cursor:"pointer"}}>
                Cancel
              </button>
            </div>
          </div>,
          document.body
        );
      })()}
      </>}
    </div>
  );
}

export default PanelCard;

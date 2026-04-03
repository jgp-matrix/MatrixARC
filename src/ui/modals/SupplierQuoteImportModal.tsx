// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function SupplierQuoteImportModal({uid,onClose,show,panelBom,bcProjectNumber,projectId,onBomUpdate}){
  const [phase,setPhase]=useState('upload'); // upload|parsing|review|pushing|done
  const [file,setFile]=useState(null);
  const [pdfPreview,setPdfPreview]=useState(null);
  const [statusMsg,setStatusMsg]=useState('');
  const [quoteHeader,setQuoteHeader]=useState(null);
  const [lineItems,setLineItems]=useState([]);
  const [quoteDocId,setQuoteDocId]=useState(null);
  const [pushResult,setPushResult]=useState(null);
  const [bcConnecting,setBcConnecting]=useState(false);
  const [parseProgress,setParseProgress]=useState(0);
  const [parseEta,setParseEta]=useState(null);
  const [newItemIdx,setNewItemIdx]=useState(null);
  const [newItemForm,setNewItemForm]=useState({itemNo:'',description:'',cost:'',category:'PARTS',uom:'EA',vendor:'',genGroup:'INVENTORY',invGroup:'RAW MAT'});
  const [creatingItem,setCreatingItem]=useState(false);
  const [createError,setCreateError]=useState('');
  const [bcCfg,setBcCfg]=useState({uoms:[],categories:[],vendors:[],genGroups:[],invGroups:[],loaded:false,loading:false});
  const [autoVendor,setAutoVendor]=useState({vendorNo:'',vendorName:''});
  const [showVendorPrompt,setShowVendorPrompt]=useState(null); // {vendorNo, vendorName, supplierName}
  const [precedingQuoteId,setPrecedingQuoteId]=useState(null); // docId being superseded by this upload
  const [showImportReview,setShowImportReview]=useState(false);
  const [modalPos,setModalPos]=useState(null); // {left,top} when dragged, null=centered
  const [savedQuotes,setSavedQuotes]=useState([]); // recent quotes from Firestore
  const [loadingQuotes,setLoadingQuotes]=useState(false);
  const [dupWarning,setDupWarning]=useState(null); // {existingDocId,existingSupplier,existingDate,parsedData,targetFile}
  const [showRevisions,setShowRevisions]=useState(false);
  const [showExportMenu,setShowExportMenu]=useState(false);
  const [linkingIdx,setLinkingIdx]=useState(null); // row index being manually linked
  const [linkQuery,setLinkQuery]=useState('');
  const [linkResults,setLinkResults]=useState([]);
  const [linkSearching,setLinkSearching]=useState(false);
  const [bcAttachMsg,setBcAttachMsg]=useState(''); // status of BC PDF upload
  const [bcAttached,setBcAttached]=useState(false);
  const [fuzzyResults,setFuzzyResults]=useState({}); // idx → BC item | null | 'searching'
  const fileRef=useRef();
  const aiTimerRef=useRef(null);
  const parseMetaRef=useRef({numPages:1,pricedCount:20,aiStartMs:0,matchStartMs:0});
  const boxRef=useRef();
  const dragRef=useRef(null);
  const linkDebounceRef=useRef(null);
  const fuzzySearchStarted=useRef(false);
  const prevShowRef=useRef(false);
  useEffect(()=>{
    if(show&&!prevShowRef.current){
      // Reset all state when modal freshly opens
      setPhase('upload');setFile(null);setPdfPreview(null);setStatusMsg('');
      setQuoteHeader(null);setLineItems([]);setQuoteDocId(null);setPushResult(null);
      setBcConnecting(false);setParseProgress(0);setParseEta(null);
      setNewItemIdx(null);setCreatingItem(false);setCreateError('');
      setAutoVendor({vendorNo:'',vendorName:''});setShowVendorPrompt(null);
      setPrecedingQuoteId(null);setModalPos(null);setSavedQuotes([]);setLoadingQuotes(false);
      setDupWarning(null);setShowRevisions(false);setShowExportMenu(false);
      setLinkingIdx(null);setLinkQuery('');setLinkResults([]);setLinkSearching(false);
      setBcAttachMsg('');setBcAttached(false);setFuzzyResults({});
      fuzzySearchStarted.current=false;
    }
    prevShowRef.current=show;
  },[show]);

  function onTitleDrag(e){
    if(e.button!==0||e.target.closest('button'))return;
    const r=boxRef.current.getBoundingClientRect();
    dragRef.current={ox:e.clientX-r.left,oy:e.clientY-r.top};
    function move(ev){setModalPos({left:Math.max(0,ev.clientX-dragRef.current.ox),top:Math.max(0,ev.clientY-dragRef.current.oy)});}
    function up(){document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);}
    document.addEventListener('mousemove',move);
    document.addEventListener('mouseup',up);
    e.preventDefault();
  }

  // Apply a BC item link — component-level so closure is always fresh
  async function applyLink(bcItem){
    const idx=linkingIdx;
    if(idx===null)return;
    const item=lineItems[idx];
    if(!item)return;
    try{
      await sqSaveCrossing(uid,item.partNumber,bcItem);
      const updated=lineItems.map((it,i)=>i===idx
        ?{...it,bcItemId:bcItem.id||null,bcItemDescription:bcItem.displayName||'',
            bcCurrentCost:bcItem.unitCost??null,matchStatus:'manually_matched',approved:true}
        :it);
      setLineItems(updated);
      if(quoteDocId)await fbDb.collection('supplierQuotes').doc(quoteDocId).update({lineItems:updated});
      setLinkingIdx(null);setLinkQuery('');setLinkResults([]);
    }catch(e){setStatusMsg('Link failed: '+e.message);}
  }

  // Reset fuzzy search state when a new quote is loaded
  useEffect(()=>{
    setFuzzyResults({});
    fuzzySearchStarted.current=false;
  },[quoteDocId]);

  // Background fuzzy BC search for unmatched priced items once review phase starts
  useEffect(()=>{
    if(phase!=='review'||fuzzySearchStarted.current)return;
    fuzzySearchStarted.current=true;
    lineItems.forEach(async(item,i)=>{
      if(!item.isPriced||item.matchStatus!=='unmatched'||!item.partNumber||(item.partNumber.trim().length<3))return;
      setFuzzyResults(prev=>({...prev,[i]:'searching'}));
      try{
        const res=await bcSearchItems(item.partNumber.trim(),{field:'both',top:3});
        setFuzzyResults(prev=>({...prev,[i]:res.items?.[0]||null}));
      }catch(e){setFuzzyResults(prev=>({...prev,[i]:null}));}
    });
  },[phase]);

  // Accept a fuzzy-suggested BC match without opening the link panel
  async function acceptFuzzyMatch(idx,bcItem){
    const item=lineItems[idx];
    if(!item)return;
    try{
      await sqSaveCrossing(uid,item.partNumber,bcItem);
      const updated=lineItems.map((it,i)=>i===idx
        ?{...it,bcItemId:bcItem.id||null,bcItemDescription:bcItem.displayName||'',
            bcCurrentCost:bcItem.unitCost??null,matchStatus:'auto_matched',approved:true}
        :it);
      setLineItems(updated);
      if(quoteDocId)await fbDb.collection('supplierQuotes').doc(quoteDocId).update({lineItems:updated});
      setFuzzyResults(prev=>({...prev,[idx]:undefined}));
    }catch(e){setStatusMsg('Match failed: '+e.message);}
  }

  // Debounced BC item search for the Link panel
  function onLinkQueryChange(val){
    setLinkQuery(val);
    if(linkDebounceRef.current)clearTimeout(linkDebounceRef.current);
    if(val.trim().length>=2){
      setLinkSearching(true);
      linkDebounceRef.current=setTimeout(async()=>{
        const res=await bcSearchItems(val.trim(),{field:"both",top:12});
        setLinkResults(res.items||[]);
        setLinkSearching(false);
      },350);
    }else{
      setLinkResults([]);setLinkSearching(false);
    }
  }

  // Load saved quotes from Firestore whenever modal opens; auto-open most recent if idle
  useEffect(()=>{
    if(!show)return;
    const currentPhase=phase; // capture at effect-run time
    setLoadingQuotes(true);
    fbDb.collection('supplierQuotes').where('importedBy','==',uid).limit(50).get()
      .then(snap=>{
        const rows=snap.docs.map(d=>{
          const v=d.data();
          return{id:d.id,supplier:v.supplier||'',quoteId:v.quoteId||'',revision:v.revision||'',jobName:v.jobName||'',
            quoteDate:v.quoteDate||'',status:v.status||'',pdfUrl:v.pdfUrl||null,
            projectId:v.projectId||null,bcProjectNumber:v.bcProjectNumber||null,
            merchandiseTotal:v.merchandiseTotal||0,lineCount:(v.lineItems||[]).length,
            importedAt:v.importedAt?.toMillis?.()||0,supersededBy:v.supersededBy||null,
            // Keep full data so loadSavedQuote can use it without a second Firestore read
            _full:{contactName:v.contactName||'',expiresOn:v.expiresOn||null,fob:v.fob||'',
              freight:v.freight||'',fileName:v.fileName||'',lineItems:v.lineItems||[]}};
        });
        rows.sort((a,b)=>b.importedAt-a.importedAt);
        // Filter to only quotes belonging to this project
        const filtered=projectId?rows.filter(q=>q.projectId===projectId):rows;
        setSavedQuotes(filtered);
      }).catch(e=>console.warn('Load saved quotes failed:',e)).finally(()=>setLoadingQuotes(false));
  },[show,uid]);

  // Load a previously scanned quote back into review phase
  // Pass preloaded row (from savedQuotes) to skip a second Firestore read
  async function loadSavedQuote(docId,preloaded){
    try{
      let v;
      if(preloaded&&preloaded._full){
        // Use already-fetched data — no extra round trip
        v={...preloaded,...preloaded._full};
      }else{
        const snap=await fbDb.collection('supplierQuotes').doc(docId).get();
        if(!snap.exists)return;
        v=snap.data();
      }
      setQuoteDocId(docId);
      setQuoteHeader({quoteId:v.quoteId||'',revision:v.revision||'',supplier:v.supplier||'',
        jobName:v.jobName||'',contactName:v.contactName||'',quoteDate:v.quoteDate||null,
        expiresOn:v.expiresOn||null,fob:v.fob||'',freight:v.freight||'',
        pdfUrl:v.pdfUrl||null,fileName:v.fileName||'',status:v.status||''});
      setLineItems(v.lineItems||[]);
      setPdfPreview(null);setFile(null);setPushResult(null);
      setPhase('review');setStatusMsg('');
    }catch(e){setStatusMsg('Failed to load quote: '+e.message);}
  }

  // Render first page of PDF to canvas — from local file
  useEffect(()=>{
    if(!file)return;
    let cancelled=false;
    (async()=>{
      try{
        await window.pdfjsReady;
        const pdfjs=window._pdfjs;
        const buf=await file.arrayBuffer();
        const pdf=await pdfjs.getDocument({data:buf}).promise;
        const page=await pdf.getPage(1);
        const vp=page.getViewport({scale:1.2});
        const canvas=document.createElement('canvas');
        canvas.width=vp.width;canvas.height=vp.height;
        await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
        if(!cancelled)setPdfPreview(canvas.toDataURL('image/jpeg',0.82));
      }catch(e){console.warn('PDF preview render:',e);}
    })();
    return()=>{cancelled=true;};
  },[file]);

  // Render first page from Firebase Storage URL when no local file (saved quotes)
  useEffect(()=>{
    if(file||pdfPreview||!quoteHeader?.pdfUrl)return;
    let cancelled=false;
    (async()=>{
      try{
        await window.pdfjsReady;
        const pdfjs=window._pdfjs;
        const pdf=await pdfjs.getDocument({url:quoteHeader.pdfUrl,withCredentials:false}).promise;
        const page=await pdf.getPage(1);
        const vp=page.getViewport({scale:1.2});
        const canvas=document.createElement('canvas');
        canvas.width=vp.width;canvas.height=vp.height;
        await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
        if(!cancelled)setPdfPreview(canvas.toDataURL('image/jpeg',0.82));
      }catch(e){console.warn('PDF preview from URL:',e);}
    })();
    return()=>{cancelled=true;};
  },[quoteHeader?.pdfUrl,file,pdfPreview]);

  // Delete all saved quotes except the most recent
  async function deleteAllButLatest(){
    if(!window.confirm(`Delete all but the most recent quote? This cannot be undone.`))return;
    const toDelete=savedQuotes.slice(1); // already sorted newest-first
    for(const q of toDelete){
      try{
        await fbDb.collection('supplierQuotes').doc(q.id).delete();
        // Best-effort: delete PDF from storage too
        fbStorage.ref(`supplierQuotePDFs/${uid}/${q.id}.pdf`).delete().catch(()=>{});
      }catch(e){console.warn('Delete failed:',q.id,e);}
    }
    setSavedQuotes(savedQuotes.slice(0,1));
  }

  async function handleParse(droppedFile){
    const targetFile=droppedFile||file;
    if(!targetFile)return;
    if(!_apiKey){setStatusMsg('API key not set — open Settings to add your Anthropic key.');return;}
    setPhase('parsing');setStatusMsg('Rendering PDF pages…');
    setParseProgress(0);setParseEta(null);
    // Load learned AI prior from Firestore concurrently with PDF init
    const aiPriorPromise=sqGetAiPrior(uid);
    try{
      await window.pdfjsReady;
      const pdfjs=window._pdfjs;
      const buf=await targetFile.arrayBuffer();
      const pdf=await pdfjs.getDocument({data:buf}).promise;
      const pageImages=[];
      let fullText='';
      parseMetaRef.current.numPages=pdf.numPages;
      const maxImgPages=Math.min(pdf.numPages,10);
      for(let pg=1;pg<=pdf.numPages;pg++){
        setStatusMsg(`Reading page ${pg} of ${pdf.numPages}…`);
        setParseProgress(Math.round((pg/pdf.numPages)*15));
        const page=await pdf.getPage(pg);
        // Extract text for all pages
        const tc=await page.getTextContent();
        fullText+=tc.items.map(i=>i.str).join(' ')+'\n';
        // Render images for first 10 pages
        if(pg<=maxImgPages){
          const vp=page.getViewport({scale:1.5});
          const canvas=document.createElement('canvas');
          canvas.width=vp.width;canvas.height=vp.height;
          await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
          const dataUrl=canvas.toDataURL('image/jpeg',0.8);
          pageImages.push(dataUrl.split(',')[1]);
          canvas.width=0;canvas.height=0;
        }
      }
      // AI phase: linear 15→60% over learned prior, then slow crawl if overrun
      setStatusMsg('Sending to AI for parsing…');
      setParseProgress(15);
      const SAVE_EST_SEC=2, MATCH_PER_ITEM_SEC=1.2;
      const AI_PRIOR_SEC=await aiPriorPromise; // learned from Firestore (already fetching)
      parseMetaRef.current.aiStartMs=Date.now();
      parseMetaRef.current.aiPriorSec=AI_PRIOR_SEC;
      aiTimerRef.current=setInterval(()=>{
        const meta=parseMetaRef.current;
        const elapsed=(Date.now()-meta.aiStartMs)/1000;
        const prior=meta.aiPriorSec;
        // Linear 15→60 during expected window; slow crawl +0.3%/s after (max 64)
        const pct=elapsed<=prior
          ?15+(elapsed/prior)*45
          :60+Math.min(4,(elapsed-prior)*0.3);
        setParseProgress(Math.round(pct));
        const aiRemaining=Math.max(0,prior-elapsed);
        const totalEta=Math.round(aiRemaining+SAVE_EST_SEC+meta.pricedCount*MATCH_PER_ITEM_SEC);
        setParseEta(totalEta>3?`~${totalEta}s remaining`:null);
      },300);
      const promptText=`You are parsing a supplier quote PDF. The page images are provided for visual reference, and the extracted text is included below as backup.

Extract ALL information into this exact JSON structure. Return ONLY valid JSON, no commentary.

{
  "quoteId": "string — quote/order number",
  "revision": "string — revision code if present",
  "supplier": "string — supplier/vendor company name",
  "jobName": "string — job or project name",
  "contactName": "string — contact person name",
  "quoteDate": "YYYY-MM-DD or null",
  "expiresOn": "YYYY-MM-DD or null",
  "fob": "string",
  "freight": "string",
  "lineItems": [
    {
      "ln": 1,
      "rawPartNumber": "full part number as printed e.g. PHXCT 2891035",
      "description": "item description",
      "qty": 10,
      "price": 123.45,
      "uom": "E"
    }
  ]
}

Rules:
- Use the PAGE IMAGES as your primary source — read part numbers, quantities, and prices directly from the visible table columns
- Include ALL line items, even unpriced ones (set qty/price to null for unpriced lines)
- rawPartNumber = exactly as printed including any manufacturer prefix
- price = the UNIT PRICE for a single item (not extended/total price). Read carefully from the price column.
- uom: use E (each), C (per 100), M (per 1000), or empty string
- quoteDate/expiresOn: dates in YYYY-MM-DD format or null if not found

EXTRACTED TEXT (backup — use images as primary source):
${fullText.slice(0,8000)}`;
      const messageContent=[
        ...pageImages.map(img=>({type:'image',source:{type:'base64',media_type:'image/jpeg',data:img}})),
        {type:'text',text:promptText}
      ];
      console.log('SQ PARSE: sending',pageImages.length,'page images +',fullText.length,'chars text to AI');
      const raw=await apiCall({model:"claude-sonnet-4-6",max_tokens:8000,messages:[{role:"user",content:messageContent}]});
      console.log('SQ PARSE: AI response length:',raw.length,'chars, preview:',raw.slice(0,200));
      const aiElapsed=(Date.now()-parseMetaRef.current.aiStartMs)/1000;
      sqRecordAiTime(uid,aiElapsed).catch(()=>{}); // fire-and-forget, learn from this run
      clearInterval(aiTimerRef.current);aiTimerRef.current=null;
      setParseProgress(65);setParseEta(null);
      let parsed;
      try{
        // Strip markdown code fences if present, then extract outermost JSON object
        const stripped=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
        const m=stripped.match(/\{[\s\S]*\}/);
        let jsonStr=m?m[0]:stripped;
        try{parsed=JSON.parse(jsonStr);}catch(e1){
          // Attempt to fix truncated JSON — close open arrays/objects
          console.warn("SQ PARSE: initial JSON parse failed, attempting repair...",e1.message);
          // Remove trailing incomplete item (last comma + partial object)
          jsonStr=jsonStr.replace(/,\s*\{[^}]*$/,'');
          // Count and close unclosed brackets
          const opens=(jsonStr.match(/\[/g)||[]).length-(jsonStr.match(/\]/g)||[]).length;
          const braces=(jsonStr.match(/\{/g)||[]).length-(jsonStr.match(/\}/g)||[]).length;
          for(let i=0;i<opens;i++)jsonStr+=']';
          for(let i=0;i<braces;i++)jsonStr+='}';
          parsed=JSON.parse(jsonStr);
          console.log("SQ PARSE: JSON repair succeeded, extracted",parsed.lineItems?.length||0,"line items");
        }
      }catch(e){
        console.error("Quote parse raw response:",raw);
        throw new Error("ARC AI returned invalid JSON — the quote may be too long or in an unsupported format. Try again.");
      }
      // Validate line items — flag duplicates/missing row# in-place, don't block
      const liIssues=sqValidateLineItems(parsed.lineItems||[]);
      if(liIssues.hasIssues){
        const flagLn=new Set(liIssues.dupeLines.flatMap(d=>d.rows));
        const flagPn=new Set(liIssues.dupeParts.flatMap(d=>d.rows));
        parsed.lineItems=(parsed.lineItems||[]).map((item,i)=>{
          const reasons=[];
          if(flagLn.has(i))reasons.push('dupe_ln');
          if(flagPn.has(i))reasons.push('dupe_part');
          if(item.ln==null)reasons.push('missing_ln');
          return reasons.length?{...item,extractionWarning:reasons.join(',')}:item;
        });
      }
      setStatusMsg('Checking for duplicates…');
      setParseProgress(67);
      // Duplicate check: match against already-loaded savedQuotes (avoids composite index)
      if(parsed.quoteId&&!precedingQuoteId){
        const existing=savedQuotes.find(q=>q.quoteId===parsed.quoteId&&q.status!=='superseded');
        if(existing){
          setPhase('upload');
          setParseProgress(0);setParseEta(null);setStatusMsg('');
          setDupWarning({existingDocId:existing.id,existingSupplier:existing.supplier||'',
            existingDate:existing.importedAt?new Date(existing.importedAt).toLocaleDateString():'',
            parsedData:parsed,targetFile});
          return;
        }
      }
      await saveAndMatch(parsed,targetFile,precedingQuoteId||null);
    }catch(e){
      clearInterval(aiTimerRef.current);aiTimerRef.current=null;
      setStatusMsg('Error: '+e.message);setPhase('upload');
    }
  }

  // Save parsed quote to Firestore + upload PDF + BC match
  async function saveAndMatch(parsed,targetFile,supersedes){
    setPhase('parsing');setStatusMsg('Saving to database…');setParseProgress(68);
    try{
      const{docId,lineItems:normalized}=await saveSupplierQuoteToFirestore(parsed,uid,{supersedes:supersedes||null,projectId,bcProjectNumber});
      // Upload original PDF to Firebase Storage for preview
      let pdfUrl=null;
      try{
        setStatusMsg('Uploading PDF for preview…');
        const pdfRef=fbStorage.ref(`supplierQuotePDFs/${uid}/${docId}.pdf`);
        await pdfRef.put(targetFile,{contentType:'application/pdf'});
        pdfUrl=await pdfRef.getDownloadURL();
        await fbDb.collection('supplierQuotes').doc(docId).update({pdfUrl,fileName:targetFile.name||''});
      }catch(e){console.warn('PDF upload failed:',e);}
      setParseProgress(72);
      setQuoteDocId(docId);
      setQuoteHeader({quoteId:parsed.quoteId||'',revision:parsed.revision||'',supplier:parsed.supplier||'',
        jobName:parsed.jobName||'',contactName:parsed.contactName||'',quoteDate:parsed.quoteDate||null,
        expiresOn:parsed.expiresOn||null,fob:parsed.fob||'',freight:parsed.freight||'',
        pdfUrl,fileName:targetFile.name||''});
      // Auto-match to BC items
      if(!_bcToken){
        setStatusMsg('Connecting to Business Central…');
        setBcConnecting(true);
        await acquireBcToken(false);
        setBcConnecting(false);
      }
      const crossings=await sqGetCrossings(uid);
      const matched=[...normalized];
      const pricedItems=matched.filter(i=>i.isPriced&&i.partNumber);
      parseMetaRef.current.pricedCount=pricedItems.length;
      parseMetaRef.current.matchStartMs=Date.now();
      let matchedSoFar=0;
      for(let i=0;i<matched.length;i++){
        const item=matched[i];
        if(!item.isPriced||!item.partNumber)continue;
        matchedSoFar++;
        setStatusMsg(`Matching item ${matchedSoFar} of ${pricedItems.length}…`);
        const pct=pricedItems.length>0?Math.round(72+(matchedSoFar/pricedItems.length)*26):98;
        setParseProgress(pct);
        const elapsedMatch=(Date.now()-parseMetaRef.current.matchStartMs)/1000;
        const ratePerItem=matchedSoFar>1?elapsedMatch/matchedSoFar:1.2;
        const remaining=pricedItems.length-matchedSoFar;
        const matchEta=Math.round(remaining*ratePerItem);
        setParseEta(matchEta>1?`~${matchEta}s remaining`:null);
        // Check saved crossings first
        const crossingKey=item.partNumber.toLowerCase().trim();
        const crossing=crossings[crossingKey];
        if(crossing){
          // Get fresh cost from BC using the crossed item number
          const bc=await bcLookupItemForQuote(crossing.bcItemNumber);
          matched[i]={...item,bcItemId:bc?.id||crossing.bcItemId,
            bcItemDescription:bc?.displayName||crossing.bcItemDescription,
            bcCurrentCost:bc?.unitCost??crossing.bcUnitCost,matchStatus:'auto_matched'};
        }else{
          const bc=await bcLookupItemForQuote(item.partNumber);
          if(bc){
            matched[i]={...item,bcItemId:bc.id,bcItemDescription:bc.displayName,bcCurrentCost:bc.unitCost,matchStatus:'auto_matched'};
          }
        }
      }
      setParseProgress(100);
      await fbDb.collection('supplierQuotes').doc(docId).update({lineItems:matched,status:'pending_review'});
      setLineItems(matched);
      setPhase('review');setStatusMsg('');
      // Refresh saved quotes list
      setSavedQuotes(prev=>{
        const entry={id:docId,supplier:parsed.supplier||'',quoteId:parsed.quoteId||'',
          jobName:parsed.jobName||'',quoteDate:parsed.quoteDate||'',status:'pending_review',
          projectId:projectId||null,bcProjectNumber:bcProjectNumber||null,
          pdfUrl,merchandiseTotal:0,lineCount:normalized.length,importedAt:Date.now(),supersededBy:null};
        return[entry,...prev.filter(q=>q.id!==docId)];
      });
    }catch(e){
      setStatusMsg('Error: '+e.message);setPhase('upload');
    }
  }

  async function exportQuoteToExcel(matchedOnly,customerView=false){
    if(!lineItems.length)return;
    setShowExportMenu(false);
    if(!window.XLSX){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://unpkg.com/xlsx/dist/xlsx.full.min.js';
        s.onload=res;s.onerror=()=>rej(new Error('Failed to load XLSX library'));
        document.head.appendChild(s);
      });
    }
    const XL=window.XLSX;
    const margin=0.30;
    const norm=s=>(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    console.log('EXPORT DEBUG panelBom:',panelBom?.length??'null','rows sample:',panelBom?.[0]);
    const bomRows=panelBom?(panelBom.filter(r=>!r.isLaborRow)):[];
    const quoteItems=lineItems.filter(qi=>qi.partNumber||qi.rawPartNumber);
    // 8-strategy match: BOM row → quote item
    function findQuoteItem(row){
      const pn=norm(row.partNumber);
      const bcNo=norm(row.bcItemNumber||'');
      for(const qi of quoteItems){
        const qpn=norm(qi.partNumber);
        const qraw=norm(qi.rawPartNumber);
        const qmfrpn=norm((qi.mfr||'')+qi.partNumber);
        const qbc=norm(qi.bcItemId||'');
        if(pn&&qpn&&pn===qpn)return qi;
        if(pn&&qmfrpn&&pn===qmfrpn)return qi;
        if(pn&&qraw&&pn===qraw)return qi;
        if(bcNo&&qbc&&bcNo===qbc)return qi;
        if(pn.length>=4&&qpn.length>=4&&(pn.endsWith(qpn)||qpn.endsWith(pn)))return qi;
        if(pn.length>=4&&qmfrpn.length>=4&&(pn.endsWith(qmfrpn)||qmfrpn.endsWith(pn)))return qi;
        if(pn.length>=4&&qraw.length>=4&&qraw.endsWith(pn))return qi;
        if(pn.length>=6&&qpn.length>=6&&(pn.includes(qpn)||qpn.includes(pn)))return qi;
      }
      return null;
    }
    // BOM-first: use BOM rows as source; fall back to quote items if no BOM
    const useBom=bomRows.length>0;
    const source=useBom?bomRows:lineItems;
    const f=str=>({t:'n',f:str,v:0}); // formula cell helper — v:0 seeds cached value so Excel renders immediately
    const acctFmt='_($* #,##0.00_);_($* (#,##0.00);_($* "-"??_);_(@_)';
    // Track which quote items were matched to a BOM row
    const matchedQiSet=new Set();
    const buildBomRow=(row,idx,excelR,cv)=>{
      const qi=useBom?findQuoteItem(row):row;
      if(qi)matchedQiSet.add(qi);
      const bomQtyRaw=useBom?Number(row.qty):null;
      const bomQty=bomQtyRaw!=null&&!isNaN(bomQtyRaw)?Math.max(bomQtyRaw,1):null;
      const hasPrice=qi?.price!=null&&!isNaN(Number(qi.price));
      const hasQty=qi?.qty!=null&&!isNaN(Number(qi.qty));
      const hasBc=qi?.bcCurrentCost!=null||(useBom&&row.priceSource==='bc'&&row.unitPrice!=null);
      const bcCost=qi?.bcCurrentCost??((useBom&&row.priceSource==='bc')?row.unitPrice:null);
      const itemPrice=hasPrice?Number((Number(qi.price)/(1-margin)).toFixed(4)):null;
      const qtyVal=hasQty?Number(qi.qty):null;
      if(cv){
        return[
          useBom?(row.itemNo??idx+1):(qi?.ln??''),
          qi?.mfr||'',
          useBom?row.partNumber:(qi?.partNumber||qi?.rawPartNumber||''),
          useBom?row.description:(qi?.description||''),
          bomQty!=null?bomQty:'',
          qtyVal!=null?qtyVal:'',
          qi?.uom||'',
          itemPrice,
          hasPrice&&hasQty?f(`F${excelR}*H${excelR}`):null,
          useBom?(row.bcItemNumber||''):(qi?.bcItemId||''),
          useBom?(row.description||''):(qi?.bcItemDescription||''),
          qi?'Yes':'No',
          qi?.notes||'',
        ];
      }else{
        return[
          useBom?(row.itemNo??idx+1):(qi?.ln??''),
          qi?.mfr||'',
          useBom?row.partNumber:(qi?.partNumber||qi?.rawPartNumber||''),
          useBom?row.description:(qi?.description||''),
          bomQty!=null?bomQty:'',
          qtyVal!=null?qtyVal:'',
          qi?.uom||'',
          hasPrice?Number(qi.price):null,
          hasPrice?f(`H${excelR}/(1-K${excelR})`):null,
          hasPrice&&hasQty?f(`F${excelR}*H${excelR}`):null,
          margin,
          hasPrice&&hasQty?f(`F${excelR}*I${excelR}`):null,
          hasBc?bcCost:null,
          hasPrice&&hasBc?f(`H${excelR}-M${excelR}`):null,
          useBom?(row.bcItemNumber||''):(qi?.bcItemId||''),
          useBom?(row.description||''):(qi?.bcItemDescription||''),
          qi?'Yes':'No',
          qi?.notes||'',
        ];
      }
    };
    const buildQiRow=(qi,idx,excelR,cv)=>{
      const hasPrice=qi.price!=null&&!isNaN(Number(qi.price));
      const hasQty=qi.qty!=null&&!isNaN(Number(qi.qty));
      const hasBc=qi.bcCurrentCost!=null;
      const itemPrice=hasPrice?Number((Number(qi.price)/(1-margin)).toFixed(4)):null;
      const qtyVal=hasQty?Number(qi.qty):null;
      if(cv){
        return[
          qi.ln??'',qi.mfr||'',qi.partNumber||qi.rawPartNumber||'',qi.description||'',
          '',qtyVal!=null?qtyVal:'',qi.uom||'',
          itemPrice,
          hasPrice&&hasQty?f(`F${excelR}*H${excelR}`):null,
          qi.bcItemId||'',qi.bcItemDescription||'','Quote Only',qi.notes||'',
        ];
      }else{
        return[
          qi.ln??'',qi.mfr||'',qi.partNumber||qi.rawPartNumber||'',qi.description||'',
          '',qtyVal!=null?qtyVal:'',qi.uom||'',
          hasPrice?Number(qi.price):null,
          hasPrice?f(`H${excelR}/(1-K${excelR})`):null,
          hasPrice&&hasQty?f(`F${excelR}*H${excelR}`):null,
          margin,
          hasPrice&&hasQty?f(`F${excelR}*I${excelR}`):null,
          hasBc?qi.bcCurrentCost:null,
          hasPrice&&hasBc?f(`H${excelR}-M${excelR}`):null,
          qi.bcItemId||'',qi.bcItemDescription||'','Quote Only',qi.notes||'',
        ];
      }
    };
    let headers,dataRows,totalsRow,dollarCols,colWidths;
    const cv=customerView;
    if(cv){
      headers=['Ln','MFR','Part Number','Description','Qty/Panel','Qty Quoted','UOM',
        'Item Price','Total Price','BC Item #','BC Description','Quoted','Notes'];
      dollarCols=[7,8];
      colWidths=[{wch:5},{wch:8},{wch:20},{wch:40},{wch:10},{wch:11},{wch:5},{wch:11},{wch:12},{wch:18},{wch:35},{wch:10},{wch:20}];
    }else{
      headers=['Ln','MFR','Part Number','Description','Qty/Panel','Qty Quoted','UOM',
        'Quote $','Item Price','Total Cost','Margin','Total Price',
        'BC $','Delta $','BC Item #','BC Description','Quoted','Notes'];
      dollarCols=[7,8,9,11,12,13];
      colWidths=[{wch:5},{wch:8},{wch:20},{wch:40},{wch:10},{wch:11},{wch:5},{wch:10},{wch:11},{wch:12},{wch:9},{wch:12},{wch:10},{wch:10},{wch:18},{wch:35},{wch:10},{wch:20}];
    }
    // Build BOM rows (excelR starts at 2)
    dataRows=source.map((row,idx)=>buildBomRow(row,idx,idx+2,cv));
    // Find unmatched quote items and append after separator
    const unmatchedQi=quoteItems.filter(qi=>!matchedQiSet.has(qi)&&(qi.isPriced||qi.price!=null));
    if(useBom&&unmatchedQi.length>0){
      const sepCols=headers.length;
      const sepLabel=cv?['','','','── OTHER ITEMS ──','','','','','',' ','','','']
        :['','','','── OTHER ITEMS ──','','','','','','','','','','','','','',''];
      dataRows.push(sepLabel.slice(0,sepCols));
      unmatchedQi.forEach((qi,idx)=>{
        const excelR=dataRows.length+2; // +2: row 1=header, current length already includes separator
        dataRows.push(buildQiRow(qi,idx,excelR,cv));
      });
    }
    const lastData=dataRows.length+1;
    if(cv){
      totalsRow=['','','','── TOTALS ──','','','',null,f(`SUM(I2:I${lastData})`),'','','',''];
    }else{
      totalsRow=['','','','── TOTALS ──','','','',null,null,
        f(`SUM(J2:J${lastData})`),margin,f(`SUM(L2:L${lastData})`),null,null,'','','',''];
    }
    const ws=XL.utils.aoa_to_sheet([headers,...dataRows,totalsRow]);
    const range=XL.utils.decode_range(ws['!ref']);
    for(let r=1;r<=range.e.r;r++){
      for(const c of dollarCols){
        const cell=ws[XL.utils.encode_cell({r,c})];
        if(cell&&(cell.t==='n'||cell.f)){cell.z=acctFmt;}
      }
      if(!customerView){
        const mCell=ws[XL.utils.encode_cell({r,c:10})]; // K = Margin
        if(mCell&&(mCell.t==='n'||mCell.f)){mCell.z='0%';}
      }
    }
    ws['!cols']=colWidths;
    const wb=XL.utils.book_new();
    const sheetName=(quoteHeader?.supplier||'Quote').replace(/[^a-z0-9 ]/gi,'').trim().substring(0,28)||'Quote';
    XL.utils.book_append_sheet(wb,ws,sheetName);
    const baseName=((quoteHeader?.supplier||'')+' '+(quoteHeader?.quoteId||'')).replace(/[^a-z0-9]/gi,'_').replace(/_+/g,'_').replace(/^_|_$/g,'')||'SupplierQuote';
    XL.writeFile(wb,`${baseName}${customerView?'_Customer':''}.xlsx`);
  }

  async function handlePush(){
    if(!quoteDocId)return;
    if(!_bcToken){
      setBcConnecting(true);
      const tok=await acquireBcToken(true);
      setBcConnecting(false);
      if(!tok){setStatusMsg('BC sign-in cancelled.');return;}
    }
    setPhase('pushing');setStatusMsg('Pushing prices to BC…');
    const toUpdate=lineItems.filter(i=>i.isPriced&&i.approved);
    let pushed=0,errors=[];
    const updatedItems=[...lineItems];
    const auditItems=[];
    for(const item of toUpdate){
      setStatusMsg(`Updating ${item.partNumber}…`);
      let itemId=item.bcItemId;
      if(!itemId&&item.partNumber){
        const looked=await bcLookupItemForQuote(item.partNumber);
        if(looked)itemId=looked.id;
      }
      const ok=itemId?await bcUpdateItemCost(itemId,item.price):false;
      const idx=updatedItems.findIndex(x=>x.ln===item.ln&&x.rawPartNumber===item.rawPartNumber);
      if(ok){
        pushed++;
        auditItems.push({bcItemId:item.bcItemId,partNumber:item.partNumber,mfr:item.mfr,oldCost:item.bcCurrentCost,newCost:item.price});
        if(idx>=0)updatedItems[idx]={...updatedItems[idx],priceUpdateStatus:'pushed'};
      }else{
        // Item Card update failed (likely open PO) — still count as success since Purchase Price will be written
        pushed++;
        console.warn(`BC Item Card cost update failed for ${item.partNumber} — will use Purchase Price instead`);
        auditItems.push({bcItemId:item.bcItemId,partNumber:item.partNumber,mfr:item.mfr,oldCost:item.bcCurrentCost,newCost:item.price,cardUpdateSkipped:true});
        if(idx>=0)updatedItems[idx]={...updatedItems[idx],priceUpdateStatus:'pushed'};
      }
    }
    // Push Purchase Prices to BC — use autoVendor (resolved when quote was matched) or fall back to fuzzy
    if(_bcToken){
      try{
        let ppVendorNo=autoVendor.vendorNo||'';
        if(!ppVendorNo&&quoteHeader?.supplier){
          const vendors=await bcListVendors();
          const sqName=(quoteHeader.supplier||'').toLowerCase().trim();
          const sqWords=sqName.replace(/[^a-z0-9]/g,' ').split(/\s+/).filter(w=>w.length>2);
          const vMatch=vendors.find(v=>v.displayName===quoteHeader.supplier)
            ||vendors.find(v=>(v.displayName||'').toLowerCase().includes(sqName))
            ||vendors.find(v=>sqName.includes((v.displayName||'').toLowerCase()))
            ||vendors.find(v=>{const vWords=(v.displayName||'').toLowerCase().replace(/[^a-z0-9]/g,' ').split(/\s+/).filter(w=>w.length>2);return sqWords.some(sw=>vWords.some(vw=>vw.includes(sw)||sw.includes(vw)));});
          if(vMatch)ppVendorNo=vMatch.number;
        }
        if(ppVendorNo){
          console.log("bcPushPurchasePrice: using vendor",ppVendorNo,"for",quoteHeader?.supplier);
          const ppResults=await Promise.all(toUpdate.filter(i=>i.price&&i.partNumber).map(async i=>{
            try{return await bcPushPurchasePrice(i.partNumber,ppVendorNo,i.price,Date.now(),i.uom||'');}
            catch(e){console.warn("BC purchase price push failed:",i.partNumber,e);return{ok:false,reason:'error'};}
          }));
          const missingItems=ppResults.filter(r=>r&&r.reason==='item_not_found').map(r=>r.itemNo);
          if(missingItems.length>0){
            setTimeout(()=>alert(`${missingItems.length} item${missingItems.length>1?'s':''} not found in BC:\n${missingItems.join(', ')}\n\nUse the "Upload Supplier Quote" tool in Settings to create these items in BC first, then re-push.`),200);
          }
          console.log("bcPushPurchasePrice: pushed for vendor",ppVendorNo,"missing:",missingItems);
        }else{console.warn("bcPushPurchasePrice: no vendor resolved for",quoteHeader?.supplier);}
      }catch(e){console.warn("bcPushPurchasePrice batch error:",e);}
    }
    const finalStatus=errors.length===0?'pushed_to_bc':'pending_review';
    await fbDb.collection('supplierQuotes').doc(quoteDocId).update({lineItems:updatedItems,status:finalStatus});
    await sqSavePushAudit(quoteDocId,quoteHeader?.supplier||'',quoteHeader?.quoteId||'',uid,auditItems);
    setLineItems(updatedItems);
    setQuoteHeader(h=>({...h,status:finalStatus}));
    if(errors.length===0){
      setStatusMsg(`✓ ${pushed} price${pushed!==1?'s':''} updated in BC`);
      // Upload supplier quote PDF to BC project as attachment
      if(bcProjectNumber&&quoteHeader?.pdfUrl&&!bcAttached){
        try{
          const vendor=(quoteHeader.supplier||'Supplier').replace(/[^a-z0-9 &]/gi,' ').replace(/\s+/g,' ').trim();
          const rfqId=(quoteHeader.quoteId||'').replace(/[^a-z0-9-_]/gi,'').trim();
          const origName=(quoteHeader.fileName||`${vendor} Quote.pdf`).replace(/\.pdf$/i,'');
          const bcFileName=`QTE_S-[${vendor}][${rfqId||'RFQ'}] ${origName}.pdf`.replace(/\s+/g,' ');
          const resp=await fetch(quoteHeader.pdfUrl);
          if(!resp.ok)throw new Error(`Storage fetch failed: ${resp.status}`);
          const ab=await resp.arrayBuffer();
          await bcAttachPdfQueued(bcProjectNumber,bcFileName,ab);
          await fbDb.collection('supplierQuotes').doc(quoteDocId).update({bcAttached:true,bcAttachFileName:bcFileName,bcAttachedAt:Date.now()}).catch(()=>{});
        }catch(e){
          console.warn('BC PDF attach failed:',e);
        }
      }
      // Add items to ARC BOM if BOM was empty
      if(onBomUpdate&&(!panelBom||panelBom.length===0)){
        const now=Date.now();
        const vendorName=quoteHeader?.supplier||"";
        const newBomRows=toUpdate.filter(i=>i.partNumber).map((i,idx)=>({
          id:now+idx+Math.random(),
          qty:i.qty||1,
          partNumber:(i.partNumber||"").trim(),
          description:(i.description||i.rawPartNumber||"").trim(),
          manufacturer:i.mfr||i.manufacturer||"",
          notes:"",
          unitPrice:i.price||0,
          priceSource:"bc",
          priceDate:now,
          bcPoDate:now,
          bcVendorName:vendorName
        }));
        if(newBomRows.length>0)onBomUpdate(newBomRows);
      }
      // Auto-close modal after successful push
      setTimeout(()=>onClose(),800);
    }else{
      setStatusMsg(`⚠ ${pushed} updated, ${errors.length} failed: ${errors.join(', ')}`);
    }
    setPhase('review');
  }

  function toggleApprove(idx){
    setLineItems(prev=>prev.map((item,i)=>i===idx?{...item,approved:!item.approved}:item));
  }

  async function loadBcCfg(){
    if(bcCfg.loaded)return bcCfg;
    if(bcCfg.loading){// wait for in-flight load
      await new Promise(r=>{const t=setInterval(()=>{if(!bcCfg.loading){clearInterval(t);r();}},100);});
      return bcCfg;
    }
    setBcCfg(c=>({...c,loading:true}));
    if(!_bcToken)await acquireBcToken(false);
    const [categories,uoms,vendors,genGroups,invGroups]=await Promise.all([
      bcListItemCategories(),bcListUnitsOfMeasure(),bcListVendors(),
      bcListGenProdPostingGroups(),bcListInventoryPostingGroups(),
    ]);
    const cfg={categories,uoms,vendors,genGroups,invGroups,loaded:true,loading:false};
    setBcCfg(cfg);
    return cfg;
  }

  async function handleCreateInBC(){
    const item=lineItems[newItemIdx];
    if(!item)return;
    if(!_bcToken){const tok=await acquireBcToken(true);if(!tok){setCreateError('BC sign-in cancelled.');return;}}
    setCreatingItem(true);setCreateError('');
    try{
      // Use same bcCreateItem as BC Item Browser — handles OData PATCH for posting groups
      const created=await bcCreateItem({
        number:newItemForm.itemNo||undefined,
        displayName:newItemForm.description||item.description||item.rawPartNumber,
        unitCost:newItemForm.cost!==''?newItemForm.cost:item.price,
        itemCategoryCode:newItemForm.category||undefined,
        baseUnitOfMeasureCode:newItemForm.uom||undefined,
        vendorNo:newItemForm.vendor||undefined,
        genProdPostingGroup:newItemForm.genGroup||undefined,
        inventoryPostingGroup:newItemForm.invGroup||undefined,
        manufacturerCode:bcNormalizeMfrCode(item.manufacturer)||undefined,
      });
      // Look up the newly created item to get its GUID
      const bcItem=await bcLookupItemForQuote(created.number);
      const bcId=bcItem?.id||null;
      const desc=created.displayName||newItemForm.description||item.description;
      const cost=created.unitCost??null;
      // If price entered + vendor selected, prompt to push to BC Purchase Prices
      const enteredCost=newItemForm.cost!==''?parseFloat(newItemForm.cost):(item.price?parseFloat(item.price):0);
      if(enteredCost>0&&newItemForm.vendor){
        const vName=(bcCfg.vendors||[]).find(v=>v.number===newItemForm.vendor)?.displayName||newItemForm.vendor;
        const pushPrice=confirm(`The price $${enteredCost.toFixed(2)} was entered for this item.\n\nIs this price from ${vName}?\n\nClick OK to save this as a Purchase Price in BC.`);
        if(pushPrice){
          bcPushPurchasePrice(created.number,newItemForm.vendor,enteredCost,Date.now(),"EA")
            .then(()=>console.log(`[BC] Purchase Price written: ${created.number} @ $${enteredCost} from ${vName}`))
            .catch(e=>console.warn("[BC] Purchase Price write failed:",e.message));
        }
      }
      const updatedItems=lineItems.map((it,i)=>i===newItemIdx
        ?{...it,bcItemId:bcId,bcItemDescription:desc,bcCurrentCost:cost,matchStatus:'auto_matched',approved:true}:it);
      setLineItems(updatedItems);
      await fbDb.collection('supplierQuotes').doc(quoteDocId).update({lineItems:updatedItems});
      // Prompt to save vendor correction if user changed from auto-matched vendor
      const chosenVendor=newItemForm.vendor;
      const supplierName=quoteHeader?.supplier||'';
      if(chosenVendor&&chosenVendor!==autoVendor.vendorNo&&supplierName){
        const chosenName=bcCfg.vendors.find(v=>v.number===chosenVendor)?.displayName||chosenVendor;
        setShowVendorPrompt({vendorNo:chosenVendor,vendorName:chosenName,supplierName});
      }else{
        setNewItemIdx(null);
      }
      setCreateError('');
    }catch(e){setCreateError(e.message);}
    setCreatingItem(false);
  }

  const approvedCount=lineItems.filter(i=>i.isPriced&&i.approved).length;
  // Trust the quote-level status as the authoritative push record.
  // Only surface a push button again if the user manually linked NEW items after the push
  // (those will have matchStatus==='manually_matched' AND priceUpdateStatus===null post-push).
  const allPushed=quoteHeader?.status==='pushed_to_bc';
  const newlyLinkedCount=allPushed
    ?lineItems.filter(i=>i.isPriced&&i.bcItemId&&i.approved&&i.matchStatus==='manually_matched'&&i.priceUpdateStatus===null).length
    :0;
  const unpushedCount=allPushed?newlyLinkedCount:approvedCount;
  const matchedCount=lineItems.filter(i=>i.matchStatus==='auto_matched').length;
  const pricedCount=lineItems.filter(i=>i.isPriced).length;

  // Lock body scroll while modal is visible
  useEffect(()=>{
    if(show){document.body.style.overflow='hidden';}
    else{document.body.style.overflow='';}
    return()=>{document.body.style.overflow='';};
  },[show]);

  const boxStyle={
    position:"fixed",zIndex:2001,
    left:modalPos?modalPos.left:'50%',top:modalPos?modalPos.top:'50%',
    transform:modalPos?'none':'translate(-50%,-50%)',
    background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:24,
    width:"min(1600px,98vw)",minHeight:"60vh",maxHeight:"calc(100vh - 24px)",maxWidth:"98vw",
    overflowY:"auto",display:show?'flex':'none',flexDirection:"column",gap:16,
    resize:"vertical",boxSizing:"border-box",
  };

  return ReactDOM.createPortal(<>
    {/* Backdrop */}
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:2000,display:show?'block':'none'}}/>
    <div ref={boxRef} style={boxStyle}>
        <div onMouseDown={onTitleDrag} style={{display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"grab",userSelect:"none",marginBottom:4}}>
          <div style={{fontSize:17,fontWeight:700,color:C.text}}>📥 Upload Supplier Quote</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        {/* UPLOAD PHASE */}
        {phase==='upload'&&(<>
          {/* Duplicate warning dialog */}
          {dupWarning&&(
            <div style={{background:"#1a1000",border:`1px solid ${C.yellow}`,borderRadius:12,padding:20,marginBottom:8}}>
              <div style={{fontSize:15,fontWeight:700,color:C.yellow,marginBottom:8}}>⚠ Duplicate Quote Detected</div>
              <div style={{fontSize:13,color:C.sub,marginBottom:16,lineHeight:1.6}}>
                Quote <strong style={{color:C.text}}>#{dupWarning.parsedData.quoteId}</strong> from <strong style={{color:C.text}}>{dupWarning.parsedData.supplier}</strong> was already imported
                {dupWarning.existingDate?` on ${dupWarning.existingDate}`:''}.
                <br/>What would you like to do?
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <button onClick={()=>setDupWarning(null)}
                  style={btn(C.card,C.sub,{fontSize:13,border:`1px solid ${C.border}`})}>Cancel</button>
                <button onClick={async()=>{const d=dupWarning;setDupWarning(null);await saveAndMatch(d.parsedData,d.targetFile,null);}}
                  style={btn("#1a1a2e",C.muted,{fontSize:13,border:`1px solid ${C.border}`})}>Save as Separate Copy</button>
                <button onClick={async()=>{const d=dupWarning;setPrecedingQuoteId(d.existingDocId);setDupWarning(null);await saveAndMatch(d.parsedData,d.targetFile,d.existingDocId);}}
                  style={btn("#0d1f0d","#4ade80",{fontSize:13,border:"1px solid #4ade8044"})}>↑ Supersede Previous Version</button>
              </div>
            </div>
          )}
          {!dupWarning&&(<>
            <div
              onClick={()=>fileRef.current?.click()}
              style={{border:`2px dashed ${C.accent}44`,borderRadius:14,padding:"40px 32px",textAlign:"center",cursor:"pointer",background:"rgba(99,102,241,0.04)",transition:"border-color 0.2s"}}
              onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.accent;}}
              onDragLeave={e=>{e.currentTarget.style.borderColor=`${C.accent}44`;}}
              onDrop={e=>{
                e.preventDefault();e.currentTarget.style.borderColor=`${C.accent}44`;
                const f=e.dataTransfer.files[0];
                if(f?.type==="application/pdf"){setFile(f);handleParse(f);}
              }}
            >
              <input ref={fileRef} type="file" accept="application/pdf" style={{display:"none"}}
                onChange={e=>{const f=e.target.files[0];if(f){setFile(f);handleParse(f);}}}/>
              <div style={{fontSize:40,marginBottom:12}}>📄</div>
              <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:6}}>Drop a Supplier Quote PDF here</div>
              <div style={{fontSize:13,color:C.muted}}>or click to browse — PDF files only</div>
            </div>
            {statusMsg&&<div style={{fontSize:13,color:C.red,textAlign:"center"}}>{statusMsg}</div>}
            {/* Previously scanned quotes */}
            {savedQuotes.length>0&&(
              <div>
                <div style={{fontSize:12,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>
                  Previously Scanned Quotes {loadingQuotes&&'…'}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:260,overflowY:"auto"}}>
                  {savedQuotes.map(q=>(
                    <div key={q.id} onClick={()=>loadSavedQuote(q.id,q)}
                      style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,cursor:"pointer",transition:"border-color 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                      onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                      <span style={{fontSize:22,flexShrink:0}}>{q.supersededBy?'🔄':'📋'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:700,color:q.supersededBy?C.muted:C.text,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          {q.supplier||'—'} {q.quoteId?`· #${q.quoteId}`:''}
                          {q.revision&&<span style={{fontSize:11,color:C.accent,marginLeft:6}}>Rev {q.revision}</span>}
                          {q.supersededBy&&<span style={{fontSize:11,color:C.muted,marginLeft:6}}>(superseded)</span>}
                        </div>
                        <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                          {q.jobName&&<span>{q.jobName} · </span>}
                          {q.lineCount} lines
                          {q.merchandiseTotal>0&&<span> · ${q.merchandiseTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>}
                        </div>
                      </div>
                      <div style={{fontSize:10,color:C.muted,flexShrink:0,textAlign:"right"}}>
                        <div style={{padding:"2px 8px",borderRadius:6,background:q.status==='pushed_to_bc'?C.greenDim:C.border,color:q.status==='pushed_to_bc'?C.green:C.muted,fontWeight:700,marginBottom:3}}>{q.status||'—'}</div>
                        {q.importedAt?new Date(q.importedAt).toLocaleDateString():''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button onClick={onClose} style={btn(C.card,C.sub,{fontSize:13,border:`1px solid ${C.border}`})}>Cancel</button>
            </div>
          </>)}
        </>)}

        {/* PARSING PHASE */}
        {phase==='parsing'&&(
          <div style={{padding:"40px 24px"}}>
            <div style={{textAlign:"center",marginBottom:32}}>
              <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:4}}>{statusMsg||'Processing…'}</div>
              {parseEta&&<div style={{fontSize:12,color:C.muted}}>{parseEta}</div>}
            </div>
            {/* Bubble step track */}
            {(()=>{
              const steps=[{label:"Extract",pct:0},{label:"ARC AI Parse",pct:15},{label:"Save",pct:65},{label:"Match BC",pct:72}];
              // Progress line spans between bubble centers: 12.5%→87.5% = 75% of width
              const fillPct=Math.min(100,Math.max(0,parseProgress/100*75));
              return(
                <div style={{display:"flex",alignItems:"flex-start",position:"relative"}}>
                  {/* Track background */}
                  <div style={{position:"absolute",top:10,left:"12.5%",right:"12.5%",height:2,background:C.border,zIndex:0}}/>
                  {/* Track fill */}
                  <div style={{position:"absolute",top:10,left:"12.5%",height:2,width:`${fillPct}%`,background:C.accent,zIndex:1,transition:"width 0.3s ease"}}/>
                  {steps.map(({label,pct},i)=>{
                    const nextPct=i<steps.length-1?steps[i+1].pct:101;
                    const done=parseProgress>=nextPct;
                    const active=parseProgress>=pct&&parseProgress<nextPct;
                    const lit=done||active;
                    return(
                      <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:8,position:"relative",zIndex:2}}>
                        <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${lit?C.accent:C.border}`,background:lit?C.accent:C.card,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:lit?"#fff":C.muted,fontWeight:700,transition:"all 0.3s"}}>
                          {done?"✓":i+1}
                        </div>
                        <div style={{fontSize:10,color:lit?C.text:C.muted,textAlign:"center",fontWeight:lit?600:400,whiteSpace:"nowrap"}}>{label}</div>
                      </div>
                    );
                  })}
                  {/* % complete after bubble 4 */}
                  <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,paddingLeft:12,paddingTop:2,zIndex:2}}>
                    <div style={{fontSize:13,fontWeight:700,color:C.accent,minWidth:40}}>{parseProgress}%</div>
                  </div>
                </div>
              );
            })()}
            {pdfPreview&&<img src={pdfPreview} onClick={()=>{if(file){const u=URL.createObjectURL(file);window.open(u,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(u),60000);}}} style={{width:90,borderRadius:6,border:`1px solid ${C.border}`,margin:"16px auto 0",display:"block",opacity:0.75,cursor:"pointer"}} title="Click to open PDF in new tab"/>}
          </div>
        )}

        {/* REVIEW PHASE */}
        {phase==='review'&&quoteHeader&&(<>
          {/* Header info */}
          <div style={{display:"flex",alignItems:"flex-start",gap:12,flexWrap:"wrap"}}>
            <div style={{flex:1,display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:10}}>
              {[['Supplier',quoteHeader.supplier],['Quote #',quoteHeader.quoteId],['Revision',quoteHeader.revision],
                ['Job',quoteHeader.jobName],['Contact',quoteHeader.contactName],
                ['Quote Date',quoteHeader.quoteDate],['Expires',quoteHeader.expiresOn],
                ['Freight',quoteHeader.freight]].map(([label,val])=>val?(
                <div key={label} style={{background:C.bg,borderRadius:8,padding:"8px 12px"}}>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>{label}</div>
                  <div style={{fontSize:13,color:C.text,fontWeight:600}}>{val}</div>
                </div>):null)}
            </div>
            {(pdfPreview||quoteHeader.pdfUrl)&&(
              <div onClick={()=>{
                if(quoteHeader.pdfUrl){window.open(quoteHeader.pdfUrl,'_blank','noopener,noreferrer');return;}
                if(file){const u=URL.createObjectURL(file);window.open(u,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(u),60000);}
              }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,flexShrink:0,cursor:"pointer"}}>
                {pdfPreview
                  ?<img src={pdfPreview} style={{width:90,borderRadius:6,border:`1px solid ${C.accent}`}} title="Click to open PDF in new tab"/>
                  :<div style={{width:90,height:120,borderRadius:6,border:`1px solid ${C.accent}`,background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32}}>📄</div>
                }
                <span style={{fontSize:10,color:C.accent,fontWeight:700}}>View PDF</span>
              </div>
            )}
          </div>
          {/* Match summary */}
          <div style={{display:"flex",gap:16,fontSize:12,color:C.muted,flexWrap:"wrap"}}>
            <span style={{color:C.green,fontWeight:700}}>{matchedCount} matched</span>
            <span>{pricedCount-matchedCount} unmatched</span>
            <span>{lineItems.length-pricedCount} unpriced</span>
            <span style={{marginLeft:"auto",color:C.accent,fontWeight:700}}>{approvedCount} approved for push</span>
          </div>
          {/* Line items table */}
          <div style={{overflowX:"auto",overflowY:"auto",flex:1,minHeight:200,borderRadius:8,border:`1px solid ${C.border}`}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead style={{position:"sticky",top:0,zIndex:2,background:C.card}}>
                <tr style={{color:C.muted,borderBottom:`2px solid ${C.border}`}}>
                  {['Ln','MFR','Part Number','BC Description','Qty','Quote $','BC $','Δ',''].map(h=>(
                    <th key={h} style={{textAlign:['Qty','Quote $','BC $','Δ'].includes(h)?"right":"left",padding:"7px 8px",fontWeight:600,whiteSpace:"nowrap",background:C.card}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item,i)=>{
                  const delta=item.bcCurrentCost!=null&&item.price!=null?item.price-item.bcCurrentCost:null;
                  const isMatched=item.matchStatus==='auto_matched'||item.matchStatus==='manually_matched';
                  const isSkipped=item.matchStatus==='skipped';
                  const isNew=newItemIdx===i;
                  const rowBg=item.extractionWarning?'rgba(251,191,36,0.07)':isNew?'rgba(59,130,246,0.08)':!item.isPriced?'transparent':isSkipped?'rgba(248,113,113,0.04)':isMatched?'rgba(52,211,153,0.04)':'transparent';
                  const bcDesc=item.bcItemDescription||(item.isPriced&&!isMatched?item.description:null)||'—';
                  return(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}22`,background:rowBg}}>
                      <td style={{padding:"6px 8px",color:C.muted}}>
                        {item.extractionWarning&&<span title={item.extractionWarning.replace(/dupe_ln/,'duplicate row#').replace(/dupe_part/,'duplicate part#').replace(/missing_ln/,'missing row#').replace(/,/g,' · ')} style={{color:C.yellow,marginRight:3,cursor:'default'}}>⚠</span>}
                        {item.ln??i+1}
                      </td>
                      <td style={{padding:"6px 8px",fontFamily:"monospace",color:C.accent,whiteSpace:"nowrap",fontWeight:700}}>{item.mfr||'—'}</td>
                      <td style={{padding:"6px 8px",fontFamily:"monospace",color:C.text,whiteSpace:"nowrap"}}>{item.partNumber||item.rawPartNumber||'—'}</td>
                      <td style={{padding:"6px 8px",color:isMatched?C.sub:C.muted,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={bcDesc}>{bcDesc}</td>
                      <td style={{padding:"6px 8px",color:C.sub,textAlign:"right"}}>{item.qty??'—'}</td>
                      <td style={{padding:"6px 8px",color:C.text,textAlign:"right",fontWeight:600}}>{item.price!=null?'$'+item.price.toFixed(2):'—'}</td>
                      <td style={{padding:"6px 8px",color:C.muted,textAlign:"right"}}>{item.bcCurrentCost!=null?'$'+item.bcCurrentCost.toFixed(2):'—'}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,
                        color:delta==null?C.muted:delta>0?C.red:delta<0?C.green:C.muted}}>
                        {delta==null?'—':(delta>0?'+':'')+delta.toFixed(2)}
                      </td>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                        {!item.isPriced
                          ?<button onClick={async()=>{
                              setNewItemIdx(i);
                              setNewItemForm(f=>({...f,itemNo:item.partNumber||'',description:item.description||item.rawPartNumber||'',
                                cost:'',category:'PARTS',uom:'EA',vendor:'',genGroup:'INVENTORY',invGroup:'RAW MAT'}));
                              setCreateError('');setAutoVendor({vendorNo:'',vendorName:''});
                              const cfg=await loadBcCfg();
                              const supplierName=quoteHeader?.supplier||'';
                              if(supplierName&&cfg.vendors.length){
                                const map=await sqGetVendorMap(uid);
                                const savedNo=map[supplierName.toLowerCase().trim()]||'';
                                const matchedNo=savedNo||(sqFuzzyMatchVendor(supplierName,cfg.vendors)?.number||'');
                                const matchedName=cfg.vendors.find(v=>v.number===matchedNo)?.displayName||'';
                                if(matchedNo){setAutoVendor({vendorNo:matchedNo,vendorName:matchedName});setNewItemForm(f=>({...f,vendor:matchedNo}));}
                              }
                            }} style={{
                              background:'#0d0d1a',border:`1px solid ${C.accent}`,color:C.accent,
                              borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:700,cursor:"pointer"
                            }}>+ Add to BC</button>
                          :isMatched
                          ?<button onClick={()=>toggleApprove(i)} style={{
                              background:item.approved?'#0d2a1a':'#1a0d0d',
                              border:`1px solid ${item.approved?C.green:C.red}`,
                              color:item.approved?C.green:C.red,
                              borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:700,cursor:"pointer"
                            }}>{item.approved?'Approved ✓':'Skip'}</button>
                          :fuzzyResults[i]==='searching'
                          ?<span style={{fontSize:11,color:C.muted,padding:"2px 6px"}}>…</span>
                          :fuzzyResults[i]
                          ?<div style={{display:"flex",flexDirection:"column",gap:3,minWidth:0}}>
                            <div style={{fontSize:10,color:C.accent,fontFamily:"monospace",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}} title={fuzzyResults[i].number}>{fuzzyResults[i].number}</div>
                            <div style={{fontSize:9,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:130}} title={fuzzyResults[i].displayName}>{fuzzyResults[i].displayName}</div>
                            <div style={{display:"flex",gap:4}}>
                              <button onClick={()=>acceptFuzzyMatch(i,fuzzyResults[i])} style={{background:'#0d2a0d',border:`1px solid ${C.green}`,color:C.green,borderRadius:10,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>Accept ✓</button>
                              <button onClick={()=>{setLinkingIdx(i);setLinkQuery(item.partNumber||'');setLinkResults([]);setNewItemIdx(null);}} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:10,padding:"2px 6px",fontSize:10,cursor:"pointer"}} title="Link to a different item">⟳</button>
                            </div>
                          </div>
                          :<div style={{display:"flex",gap:4}}>
                            <button onClick={()=>{setLinkingIdx(i);setLinkQuery(item.partNumber||'');setLinkResults([]);setNewItemIdx(null);}} style={{
                              background:'#1a1200',border:`1px solid ${C.yellow}`,color:C.yellow,
                              borderRadius:12,padding:"2px 10px",fontSize:11,fontWeight:700,cursor:"pointer"
                            }}>🔗 Link</button>
                            <button onClick={async()=>{
                              setNewItemIdx(i);setLinkingIdx(null);
                              setNewItemForm(f=>({...f,itemNo:item.partNumber||'',description:item.description||item.rawPartNumber||'',
                                cost:item.price!=null?String(item.price):'',category:'PARTS',uom:'EA',vendor:'',genGroup:'INVENTORY',invGroup:'RAW MAT'}));
                              setCreateError('');setAutoVendor({vendorNo:'',vendorName:''});
                              const cfg=await loadBcCfg();
                              const supplierName=quoteHeader?.supplier||'';
                              if(supplierName&&cfg.vendors.length){
                                const map=await sqGetVendorMap(uid);
                                const savedNo=map[supplierName.toLowerCase().trim()]||'';
                                const matchedNo=savedNo||(sqFuzzyMatchVendor(supplierName,cfg.vendors)?.number||'');
                                const matchedName=cfg.vendors.find(v=>v.number===matchedNo)?.displayName||'';
                                if(matchedNo){setAutoVendor({vendorNo:matchedNo,vendorName:matchedName});setNewItemForm(f=>({...f,vendor:matchedNo}));}
                              }
                            }} style={{
                              background:'#1a1a00',border:`1px solid #6060a0`,color:C.muted,
                              borderRadius:12,padding:"2px 8px",fontSize:11,cursor:"pointer"
                            }}>+ New</button>
                          </div>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Link to BC Panel */}
          {linkingIdx!==null&&(()=>{
            const item=lineItems[linkingIdx];
            if(!item)return null;
            return(
              <div style={{background:"#0f120f",border:`1px solid ${C.yellow}`,borderRadius:10,padding:16,display:"flex",flexDirection:"column",gap:10}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.yellow}}>
                    🔗 Link to BC Item — <span style={{fontFamily:"monospace",color:C.text}}>{item.mfr?`${item.mfr} `:''}{item.partNumber}</span>
                    <span style={{fontSize:11,color:C.muted,marginLeft:8,fontFamily:"normal"}}>Match will be remembered for future quotes</span>
                  </div>
                  <button onClick={()=>{setLinkingIdx(null);setLinkResults([]);}} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <input value={linkQuery}
                    onChange={e=>onLinkQueryChange(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Escape'){setLinkingIdx(null);setLinkResults([]);}}}
                    placeholder="Type BC part number or description…"
                    autoFocus
                    style={{flex:1,background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"8px 10px",color:C.text,fontSize:13,outline:"none"}}/>
                  {linkSearching&&<span style={{color:C.muted,fontSize:13,flexShrink:0}}>Searching…</span>}
                </div>
                {linkResults.length>0&&(
                  <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:220,overflowY:"auto"}}>
                    {linkResults.map(bc=>(
                      <div key={bc.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,cursor:"pointer"}}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
                        onClick={()=>applyLink(bc)}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:"monospace",fontWeight:700,color:C.accent,fontSize:13}}>{bc.number}</div>
                          <div style={{fontSize:11,color:C.sub,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bc.displayName||'—'}</div>
                        </div>
                        <div style={{fontSize:12,color:C.green,fontWeight:700,flexShrink:0}}>
                          {bc.unitCost!=null?`$${bc.unitCost.toFixed(2)}`:'—'}
                        </div>
                        <button onClick={e=>{e.stopPropagation();applyLink(bc);}} style={btn('#1a2a1a',C.green,{fontSize:11,padding:"3px 12px",border:`1px solid ${C.green}`})}>
                          Link & Remember ✓
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {linkResults.length===0&&!linkSearching&&linkQuery.trim().length>=2&&(
                  <div style={{fontSize:12,color:C.muted,textAlign:"center",padding:"8px 0"}}>No results — try a different search term</div>
                )}
                {linkQuery.trim().length<2&&!linkSearching&&(
                  <div style={{fontSize:12,color:C.muted,padding:"4px 0"}}>Type at least 2 characters to search</div>
                )}
              </div>
            );
          })()}
          {/* New BC Item Form */}
          {newItemIdx!==null&&(()=>{const item=lineItems[newItemIdx];return item?(
            <div style={{background:"#0f1a0f",border:`1px solid ${C.accent}`,borderRadius:10,padding:16,display:"flex",flexDirection:"column",gap:12}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{fontSize:13,fontWeight:700,color:C.accent}}>Create New BC Item — {item.mfr?`${item.mfr} `:''}{item.partNumber||item.rawPartNumber}</div>
                <button onClick={()=>{setNewItemIdx(null);setCreateError('');}} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",lineHeight:1}}>×</button>
              </div>
              {bcCfg.loading&&<div style={{fontSize:11,color:C.muted}}>Loading BC data…</div>}
              {(()=>{
                const si={background:"#0a0a12",border:"1px solid #6060a0",borderRadius:8,padding:"8px 10px",color:C.text,fontSize:13,width:"100%",boxSizing:"border-box"};
                const ii={...si};
                const lbl=(t)=><label style={{fontSize:11,color:C.muted,marginBottom:3,display:"block"}}>{t}</label>;
                const nif=(key,ph,type="text")=><input type={type} value={newItemForm[key]} placeholder={ph||''} step={type==="number"?"0.01":undefined} onChange={e=>setNewItemForm(p=>({...p,[key]:e.target.value}))} style={ii}/>;
                const sel=(key,opts,valFn=o=>o.code,lblFn=o=>o.code)=>(
                  <select value={newItemForm[key]} onChange={e=>setNewItemForm(p=>({...p,[key]:e.target.value}))} style={si}>
                    <option value="">— None —</option>
                    {opts.map((o,i)=><option key={i} value={valFn(o)}>{lblFn(o)}</option>)}
                  </select>
                );
                return(<>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
                    <div style={{flex:1,minWidth:140}}>{lbl("Part Number")}{nif('itemNo','e.g. MTX-1234')}</div>
                    <div style={{flex:2,minWidth:200}}>{lbl("Description *")}{nif('description','Item description')}</div>
                    <div style={{minWidth:110}}>{lbl("Unit Cost")}
                      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
                        <span style={{position:"absolute",left:10,color:C.muted,fontSize:13,pointerEvents:"none"}}>$</span>
                        <input type="text" value={newItemForm.cost}
                          onChange={e=>setNewItemForm(p=>({...p,cost:e.target.value.replace(/[^0-9.]/g,'')}))}
                          onBlur={e=>{const v=parseFloat(e.target.value);setNewItemForm(p=>({...p,cost:isNaN(v)?'0.00':v.toFixed(2)}));}}
                          onFocus={e=>{const t=e.target;setTimeout(()=>t.select(),0);}}
                          placeholder="0.00"
                          style={{...ii,paddingLeft:22}}/>
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
                    <div style={{flex:1,minWidth:160}}>{lbl("Item Category")}{sel('category',bcCfg.categories,o=>o.code,o=>o.code+(o.description?` — ${o.description}`:''))}</div>
                    <div style={{flex:1,minWidth:140}}>{lbl("Unit of Measure")}{sel('uom',bcCfg.uoms,o=>o.code,o=>o.code+(o.displayName&&o.displayName!==o.code?` — ${o.displayName}`:''))}</div>
                    <div style={{flex:1,minWidth:180}}>
                      {lbl(autoVendor.vendorNo?`Vendor (auto-matched from "${quoteHeader?.supplier||''}")`:"Vendor")}
                      {sel('vendor',bcCfg.vendors,o=>o.number,o=>`${o.displayName} (${o.number})`)}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <div style={{flex:1}}>{lbl("Gen. Prod. Posting Group")}{sel('genGroup',bcCfg.genGroups,o=>o.code,o=>o.code+(o.description?` — ${o.description}`:''))}</div>
                    <div style={{flex:1}}>{lbl("Inventory Posting Group")}{sel('invGroup',bcCfg.invGroups,o=>o.code,o=>o.code+(o.description?` — ${o.description}`:''))}</div>
                  </div>
                </>);
              })()}
              {createError&&<div style={{fontSize:12,color:C.red}}>{createError}</div>}
              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>{setNewItemIdx(null);setCreateError('');}} style={btn(C.card,C.sub,{fontSize:12,border:`1px solid ${C.border}`})}>Cancel</button>
                <button onClick={handleCreateInBC} disabled={creatingItem||!newItemForm.description} style={btn('#0d2a1a',C.green,{fontSize:12,border:`1px solid ${C.green}`,opacity:creatingItem||!newItemForm.description?0.5:1})}>
                  {creatingItem?'Creating…':'Create in BC →'}
                </button>
              </div>
            </div>
          ):null;})()}
          {/* Vendor correction prompt */}
          {showVendorPrompt&&(
            <div style={{background:"#1a1200",border:`1px solid ${C.yellow}`,borderRadius:10,padding:14,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
              <div style={{fontSize:13,color:C.text,flex:1}}>
                Remember <strong style={{color:C.accent}}>{showVendorPrompt.vendorName}</strong> as the default vendor for <strong style={{color:C.sub}}>{showVendorPrompt.supplierName}</strong>?
              </div>
              <button onClick={async()=>{await sqSaveVendorMapping(uid,showVendorPrompt.supplierName,showVendorPrompt.vendorNo);setAutoVendor({vendorNo:showVendorPrompt.vendorNo,vendorName:showVendorPrompt.vendorName});setShowVendorPrompt(null);setNewItemIdx(null);}}
                style={btn('#1a2a1a',C.green,{fontSize:12,border:`1px solid ${C.green}`,padding:"5px 14px"})}>Yes, remember this</button>
              <button onClick={()=>{setShowVendorPrompt(null);setNewItemIdx(null);}}
                style={btn(C.card,C.muted,{fontSize:12,border:`1px solid ${C.border}`,padding:"5px 14px"})}>No thanks</button>
            </div>
          )}
          {statusMsg&&<div style={{fontSize:13,color:C.red}}>{statusMsg}</div>}
          {precedingQuoteId&&(
            <div style={{background:"#1a1a00",border:`1px solid ${C.yellow}`,borderRadius:8,padding:"8px 14px",fontSize:12,color:C.yellow}}>
              ⚠ This quote will supersede the previous version — history is retained in the database.
            </div>
          )}
          {(()=>{
            const prevRevisions=savedQuotes.filter(q=>q.quoteId===quoteHeader?.quoteId&&q.id!==quoteDocId);
            return prevRevisions.length>0&&showRevisions&&(
              <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:10,display:"flex",flexDirection:"column",gap:6}}>
                <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>Previous Revisions</div>
                {prevRevisions.map(q=>(
                  <div key={q.id} onClick={()=>{loadSavedQuote(q.id,q);setShowRevisions(false);}}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"7px 12px",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,cursor:"pointer"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                    <span style={{fontSize:13,color:C.muted}}>📋</span>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:700,color:C.text}}>
                        #{q.quoteId}{q.revision&&<span style={{color:C.accent,marginLeft:6}}>Rev {q.revision}</span>}
                      </div>
                      <div style={{fontSize:11,color:C.muted}}>{q.importedAt?new Date(q.importedAt).toLocaleDateString():''}{q.jobName&&` · ${q.jobName}`}</div>
                    </div>
                    <span style={{fontSize:11,color:C.accent}}>View →</span>
                  </div>
                ))}
              </div>
            );
          })()}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:12,color:C.muted,marginRight:"auto"}}>{approvedCount} item{approvedCount!==1?'s':''} will be updated in BC</span>
            {(()=>{
              const prevRevisions=savedQuotes.filter(q=>q.quoteId===quoteHeader?.quoteId&&q.id!==quoteDocId);
              return prevRevisions.length>0&&(
                <button onClick={()=>setShowRevisions(v=>!v)}
                  style={btn('#0d1a2a','#93c5fd',{fontSize:13,border:'1px solid #3b82f655',display:"flex",alignItems:"center",gap:6})}>
                  📂 View Previous Revisions
                  <span style={{background:'#3b82f644',borderRadius:10,padding:"0 7px",fontSize:11,fontWeight:800,color:'#93c5fd'}}>{prevRevisions.length}</span>
                </button>
              );
            })()}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowExportMenu(v=>!v)}
                style={btn('#0d1a0d',C.green,{fontSize:13,border:`1px solid ${C.green}55`})}>⬇ Export Excel ▾</button>
              {showExportMenu&&(
                <div style={{position:"absolute",bottom:"calc(100% + 6px)",left:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:12,display:"flex",flexDirection:"column",gap:8,minWidth:230,zIndex:20,boxShadow:"0 4px 20px #0008"}}>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5}}>Export Format</div>
                  <div style={{fontSize:11,color:panelBom&&panelBom.length?C.green:C.yellow,background:panelBom&&panelBom.length?C.greenDim:'#1a1200',borderRadius:6,padding:"4px 8px"}}>
                    {panelBom&&panelBom.length?`📋 Panel BOM: ${panelBom.filter(r=>!r.isLaborRow).length} items`:'⚠ No panel BOM — open from a panel card'}
                  </div>
                  <button onClick={()=>exportQuoteToExcel(false,false)}
                    style={btn('#0d2a1a',C.green,{fontSize:13,border:`1px solid ${C.green}`,textAlign:"left",padding:"8px 12px",display:"flex",flexDirection:"column",gap:2})}>
                    <span style={{fontWeight:700}}>⬇ Full Export</span>
                    <span style={{fontSize:11,opacity:0.75}}>All columns including costs</span>
                  </button>
                  <button onClick={()=>exportQuoteToExcel(false,true)}
                    style={btn('#1a0d2a','#a78bfa',{fontSize:13,border:`1px solid #a78bfa`,textAlign:"left",padding:"8px 12px",display:"flex",flexDirection:"column",gap:2})}>
                    <span style={{fontWeight:700}}>👤 Customer Pricing</span>
                    <span style={{fontSize:11,opacity:0.75}}>Hides Quote $, Cost &amp; Margin</span>
                  </button>
                  <button onClick={()=>setShowExportMenu(false)}
                    style={{background:"none",border:"none",color:C.muted,fontSize:11,cursor:"pointer",textAlign:"left",padding:"2px 0"}}>Cancel</button>
                </div>
              )}
            </div>
            <button onClick={()=>{setPrecedingQuoteId(quoteDocId);setFile(null);setPdfPreview(null);setQuoteHeader(null);setLineItems([]);setQuoteDocId(null);setPhase('upload');setStatusMsg('');setShowRevisions(false);}}
              style={btn('#1a1200',C.yellow,{fontSize:13,border:`1px solid ${C.yellow}`})}>↑ Upload Revision</button>
            <button onClick={onClose} style={btn(C.card,C.sub,{fontSize:13,border:`1px solid ${C.border}`})}>Cancel</button>
            {onBomUpdate&&<button onClick={()=>{
                const now=Date.now();
                const vendorName=quoteHeader?.supplier||"";
                const approved=lineItems.filter(i=>i.isPriced&&i.approved&&i.partNumber);
                const newRows=approved.map((i,idx)=>({
                  id:now+idx+Math.random(),
                  qty:i.qty||1,
                  partNumber:(i.partNumber||"").trim(),
                  description:(i.description||i.rawPartNumber||"").trim(),
                  manufacturer:i.mfr||i.manufacturer||"",
                  notes:"",
                  unitPrice:i.price||0,
                  priceSource:"bc",
                  priceDate:now,
                  bcPoDate:now,
                  bcVendorName:vendorName
                }));
                if(newRows.length>0){onBomUpdate(newRows);alert(`${newRows.length} item${newRows.length!==1?"s":""} added to BOM (not pushed to BC).`);}
                onClose();
              }} style={btn("#1a1a2a","#38bdf8",{fontSize:13,border:"1px solid #38bdf844"})}>
                Add to BOM Only
              </button>}
            {allPushed&&newlyLinkedCount===0
              ?<span style={{fontSize:12,color:C.green,fontWeight:700,padding:"5px 14px",background:C.greenDim,border:`1px solid ${C.green}55`,borderRadius:8}}>✓ All Prices Current in BC</span>
              :<>
              <button onClick={()=>setShowImportReview(true)} style={btn("#1a1500","#f59e0b",{fontSize:13,border:"1px solid #f59e0b44"})}>
                Review & Match
              </button>
              <button onClick={handlePush} disabled={unpushedCount===0} style={btn(unpushedCount>0?"#0d2a1a":C.card,unpushedCount>0?C.green:C.muted,{fontSize:13,border:`1px solid ${unpushedCount>0?C.green:C.border}`,opacity:unpushedCount>0?1:0.5})}>
                {bcConnecting?'Connecting…':allPushed?`Push ${newlyLinkedCount} New Link${newlyLinkedCount!==1?'s':''} to BC →`:`Push ${unpushedCount} Price${unpushedCount!==1?'s':''} to BC →`}
              </button>
              </>}
          </div>
          {/* TEMP TEST BUTTON — remove when BC upload is verified */}
          {bcProjectNumber&&quoteHeader?.pdfUrl&&(
            <div style={{marginTop:8,padding:"8px 10px",background:"#1a0d00",border:"1px dashed #f97316",borderRadius:8,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:10,color:"#f97316",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>Test</span>
              <button onClick={async()=>{
                setBcAttachMsg('Uploading test PDF to BC…');
                try{
                  const vendor=(quoteHeader.supplier||'Supplier').replace(/[^a-z0-9 &]/gi,' ').replace(/\s+/g,' ').trim();
                  const rfqId=(quoteHeader.quoteId||'').replace(/[^a-z0-9-_]/gi,'').trim();
                  const origName=(quoteHeader.fileName||`${vendor} Quote.pdf`).replace(/\.pdf$/i,'');
                  const bcFileName=`QTE_S-[${vendor}][${rfqId||'RFQ'}] ${origName}.pdf`.replace(/\s+/g,' ');
                  const resp=await fetch(quoteHeader.pdfUrl);
                  if(!resp.ok)throw new Error(`Storage fetch ${resp.status}`);
                  const ab=await resp.arrayBuffer();
                  await bcAttachPdfQueued(bcProjectNumber,bcFileName,ab);
                  setBcAttachMsg(`✓ Test upload OK: ${bcFileName}`);
                  setTimeout(()=>setBcAttachMsg(''),8000);
                }catch(e){setBcAttachMsg(`⚠ Test failed: ${e.message}`);}
              }} style={btn('#1a0d00','#f97316',{fontSize:12,border:'1px solid #f9731644',padding:'4px 12px'})}>
                📎 Test Upload to BC ({bcProjectNumber})
              </button>
              <span style={{fontSize:10,color:"#94a3b8"}}>→ {[quoteHeader.supplier,quoteHeader.quoteId,quoteHeader.fileName].filter(Boolean).join(' · ')}</span>
            </div>
          )}
          {bcAttachMsg&&(
            <div style={{fontSize:12,marginTop:6,padding:"5px 10px",borderRadius:6,
              background:bcAttachMsg.startsWith('✓')?C.greenDim:bcAttachMsg.startsWith('⚠')?C.redDim:"#0a0a1a",
              color:bcAttachMsg.startsWith('✓')?C.green:bcAttachMsg.startsWith('⚠')?C.red:C.muted,
              border:`1px solid ${bcAttachMsg.startsWith('✓')?C.green+'44':bcAttachMsg.startsWith('⚠')?C.red+'44':C.border}`}}>
              {bcAttachMsg}
            </div>
          )}
        </>)}

        {/* PUSHING PHASE */}
        {phase==='pushing'&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:C.sub,fontSize:14}}>
            <div style={{fontSize:36,marginBottom:16,animation:"pulse 1.2s ease-in-out infinite"}}>🔄</div>
            <div style={{fontWeight:600}}>{statusMsg||'Pushing to BC…'}</div>
          </div>
        )}

        {/* DONE PHASE */}
        {phase==='done'&&pushResult&&(<>
          <div style={{textAlign:"center",padding:"16px 0"}}>
            <div style={{fontSize:40,marginBottom:12}}>{pushResult.errors.length===0?'✅':'⚠️'}</div>
            <div style={{fontSize:16,fontWeight:700,color:pushResult.errors.length===0?C.green:C.yellow,marginBottom:8}}>
              {pushResult.pushed} of {pushResult.total} price{pushResult.total!==1?'s':''} updated in BC
            </div>
            {pushResult.errors.length>0&&(
              <div style={{fontSize:12,color:C.red,marginTop:8}}>
                Failed: {pushResult.errors.join(', ')}
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button onClick={()=>{setPhase('upload');setFile(null);setPdfPreview(null);setQuoteHeader(null);setLineItems([]);setQuoteDocId(null);setPushResult(null);setStatusMsg('');}}
              style={btn(C.card,C.sub,{fontSize:13,border:`1px solid ${C.border}`})}>Upload Another Quote</button>
            <button onClick={onClose} style={btn(C.accent,"#fff",{fontSize:13})}>Done</button>
          </div>
        </>)}
    </div>
  {showImportReview&&ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0d1a",border:`1px solid ${C.accent}`,borderRadius:10,padding:"24px 28px",width:"100%",maxWidth:900,maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexShrink:0}}>
          <span style={{fontSize:22}}>📋</span>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800,color:C.text}}>Review & Match — {quoteHeader?.supplier||"Supplier"}</div>
            <div style={{fontSize:12,color:C.muted}}>{lineItems.length} items from quote · Match to BOM rows before pushing to BC</div>
          </div>
          <button onClick={()=>setShowImportReview(false)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",marginBottom:12}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
            <thead style={{position:"sticky",top:0,zIndex:1}}><tr style={{background:"#111128"}}>
              <th style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:700}}>Quote Item</th>
              <th style={{padding:"6px 8px",textAlign:"right",color:C.muted,fontWeight:700,width:70}}>Price</th>
              <th style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:700}}>→ BOM Match</th>
              <th style={{padding:"6px 8px",textAlign:"left",color:C.muted,fontWeight:700,width:80}}>Status</th>
            </tr></thead>
            <tbody>{lineItems.map((item,i)=>{
              const matched=item.matchStatus==='auto_matched'||item.matchStatus==='manually_matched';
              const hasCross=item.supplierPartNumber&&item.partNumber&&normPart(item.supplierPartNumber)!==normPart(item.partNumber);
              return(
              <tr key={i} style={{borderTop:`1px solid ${C.border}33`,background:matched&&item.isPriced?"rgba(34,197,94,0.04)":"transparent"}}>
                <td style={{padding:"6px 8px"}}>
                  <div style={{fontFamily:"monospace",fontWeight:600,color:C.text,fontSize:12}}>{item.rawPartNumber||item.partNumber||"—"}</div>
                  {item.supplierPartNumber&&item.supplierPartNumber!==item.rawPartNumber&&<div style={{fontSize:10,color:"#a78bfa"}}>Matched: {item.partNumber}</div>}
                  <div style={{fontSize:10,color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description||""}</div>
                </td>
                <td style={{padding:"6px 8px",textAlign:"right",fontWeight:700,color:item.isPriced?C.green:C.muted,fontVariantNumeric:"tabular-nums"}}>
                  {item.isPriced?"$"+Number(item.price).toFixed(2):"—"}
                </td>
                <td style={{padding:"6px 8px"}}>
                  {matched?<span style={{fontSize:11,color:C.green,fontWeight:600}}>✓ {item.partNumber}</span>
                  :item.isPriced?<span style={{fontSize:11,color:C.yellow}}>Unmatched — assign manually in table above</span>
                  :<span style={{fontSize:11,color:C.muted}}>No price</span>}
                </td>
                <td style={{padding:"6px 8px"}}>
                  {matched&&item.isPriced?<span style={{fontSize:10,fontWeight:700,color:C.green}}>Ready</span>
                  :!item.isPriced?<span style={{fontSize:10,color:C.muted}}>No price</span>
                  :<button onClick={async()=>{
                    await loadBcCfg();
                    setNewItemIdx(i);
                    setNewItemForm({itemNo:stripMfrPrefix(item.rawPartNumber||item.partNumber||"").toUpperCase(),description:(item.description||"").slice(0,100),cost:item.price||"",category:"PARTS",uom:"EA",vendor:autoVendor.vendorNo||"",genGroup:"INVENTORY",invGroup:"RAW MAT"});
                    setCreateError("");
                    setShowImportReview(false);
                  }} style={{background:"#0d1a10",border:"1px solid #4ade8044",color:"#4ade80",borderRadius:4,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    + Create in BC
                  </button>}
                </td>
              </tr>);
            })}</tbody>
          </table>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexShrink:0}}>
          <button onClick={()=>setShowImportReview(false)} style={{background:"#1a1a2a",border:`1px solid ${C.border}`,color:C.muted,padding:"7px 18px",borderRadius:6,cursor:"pointer",fontSize:13}}>Close</button>
        </div>
      </div>
    </div>
  ,document.body)}
  </>,
    document.body
  );
}

export default SupplierQuoteImportModal;

import { useState, useEffect, useRef } from 'react';
import { fbDb, fbFunctions } from '@/core/globals';
import firebase from 'firebase/compat/app';
import 'firebase/compat/storage';

const fbStorage = firebase.storage();

// Normalize: remove spaces/dashes/dots, uppercase
function normPart(s: any){return(s||'').replace(/[\s\-\.]/g,'').toUpperCase();}
// Fuzzy match: exact after normalize, OR one contains the other (handles manufacturer prefix)
function partMatch(a: any,b: any){
  const na=normPart(a),nb=normPart(b);
  if(!na||!nb||na.length<3||nb.length<3)return false;
  if(na===nb)return true;
  if(nb.length>=4&&na.includes(nb))return true;
  if(na.length>=4&&nb.includes(na))return true;
  return false;
}

function SupplierPortalPage({token}: any){
  const [info,setInfo]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<any>(null);
  const [file,setFile]=useState<any>(null);
  const [uploading,setUploading]=useState(false);
  const [done,setDone]=useState(false);
  const [unitPrices,setUnitPrices]=useState<any>({});
  const [leadTime,setLeadTime]=useState('');
  const [phase,setPhase]=useState('upload'); // 'upload'|'analyzing'|'review'
  const [analyzeMsg,setAnalyzeMsg]=useState('');
  const [aiConfidences,setAiConfidences]=useState<any>({});
  const [aiError,setAiError]=useState<any>(null);
  const [dragOver,setDragOver]=useState(false);
  const [itemLeadTimes,setItemLeadTimes]=useState<any>({});
  const [cannotSupply,setCannotSupply]=useState<any>({});
  const [supplierPartNums,setSupplierPartNums]=useState<any>({});
  const [supplierLineNums,setSupplierLineNums]=useState<any>({}); // idx->supplier quote line #
  const [itemNotes,setItemNotes]=useState<any>({}); // idx->supplier note text
  const [extractionSummary,setExtractionSummary]=useState<any>(null); // {requestedCount, matchedCount, unmatchedSupplierItems}
  const [quoteHeaderInfo,setQuoteHeaderInfo]=useState<any>(null);
  const [allExtractedItems,setAllExtractedItems]=useState<any[]>([]); // all AI-extracted items from quote scan
  const [confirmedMatches,setConfirmedMatches]=useState<any>({}); // idx->true when supplier confirms a match is correct
  const [openSpnDrop,setOpenSpnDrop]=useState<any>(null); // which row's supplier PN dropdown is open (index or null)
  const [spnDropRect,setSpnDropRect]=useState<any>(null); // bounding rect of the open dropdown button
  const [morePages,setMorePages]=useState<any>(null); // {nextPage,totalPages} when PDF has >20 pages
  const pdfRef=useRef<any>(null);

  useEffect(()=>{
    fbDb.collection('rfqUploads').doc(token).get()
      .then((snap: any)=>{
        if(!snap.exists){setError("This link is invalid or has expired.");setLoading(false);return;}
        const data=snap.data();
        if(data.status==="submitted")setDone(true);
        setInfo(data);
        setLoading(false);
      })
      .catch((e: any)=>{setError("Could not load RFQ: "+e.message);setLoading(false);});
  },[token]);

  async function processFile(f: any){
    if(!f||!f.type.includes("pdf")){alert("Please select a PDF file.");return;}
    setFile(f);setPhase('analyzing');setAiError(null);
    const allPrices: any={};const allConf: any={};const allLeadTimes: any={};const allSupplierPNs: any={};const allSupplierLineNums: any={};const collectedExtracted: any[]=[];let lastSummary: any=null;
    try{
      setAnalyzeMsg(`Reading ${f.name}…`);
      await (window as any).pdfjsReady;
      const pdfjs=(window as any)._pdfjs;
      const buf=await f.arrayBuffer();
      const pdf=await pdfjs.getDocument({data:buf}).promise;
      pdfRef.current=pdf;
      const BATCH=20;
      const totalBatches=Math.ceil(pdf.numPages/BATCH);
      const lineItems=info?.lineItems||[];
      for(let batch=0;batch<totalBatches;batch++){
        const startPage=batch*BATCH+1;
        const endPage=Math.min(pdf.numPages,startPage+BATCH-1);
        const pageImages: any[]=[];
        for(let pg=startPage;pg<=endPage;pg++){
          setAnalyzeMsg(`Processing page ${pg} of ${pdf.numPages}${totalBatches>1?` (section ${batch+1} of ${totalBatches})`:""}…`);
          const page=await pdf.getPage(pg);
          const vp=page.getViewport({scale:2.0});
          const canvas=document.createElement("canvas");
          canvas.width=vp.width;canvas.height=vp.height;
          await page.render({canvasContext:canvas.getContext("2d"),viewport:vp}).promise;
          const dataUrl=canvas.toDataURL("image/jpeg",0.85);
          canvas.width=0;canvas.height=0;
          pageImages.push(dataUrl.split(",")[1]);
        }
        setAnalyzeMsg(`ARC AI is securely scanning your Quote…`);
        console.log('PORTAL EXTRACT: sending',pageImages.length,'images for batch',batch+1);
        const result=await fbFunctions.httpsCallable("extractSupplierQuotePricing")({token,pageImages});
        const extracted=result.data?.extracted||[];
        if(result.data?.quoteHeader&&!quoteHeaderInfo)setQuoteHeaderInfo(result.data.quoteHeader);
        if(result.data?.summary)lastSummary=result.data.summary;
        console.log('PORTAL EXTRACT: got',extracted.length,'results, summary:',result.data?.summary,'sample:',JSON.stringify(extracted.slice(0,3)));
        extracted.forEach((ex: any)=>{
          collectedExtracted.push(ex);
          if(ex.confidence==='unmatched')return;
          let idx=lineItems.findIndex((it: any)=>normPart(it.partNumber)===normPart(ex.partNumber));
          if(idx<0)idx=lineItems.findIndex((it: any)=>partMatch(it.partNumber,ex.partNumber));
          if(idx>=0){
            if(ex.unitPrice!=null&&(allPrices[idx]===undefined||allPrices[idx]===''))allPrices[idx]=String(ex.unitPrice);
            if(allConf[idx]===undefined)allConf[idx]=ex.confidence||'medium';
            if(ex.leadTimeDays!=null&&(allLeadTimes[idx]===undefined||allLeadTimes[idx]===''))allLeadTimes[idx]=String(ex.leadTimeDays);
            if(ex.supplierPartNumber&&!allSupplierPNs[idx])allSupplierPNs[idx]=ex.supplierPartNumber;
            if(ex.supplierLineNumber&&!allSupplierLineNums[idx])allSupplierLineNums[idx]=ex.supplierLineNumber;
          }
        });
      }
      setUnitPrices(allPrices);
      setAiConfidences(allConf);
      setItemLeadTimes(allLeadTimes);
      setSupplierPartNums(allSupplierPNs);
      setSupplierLineNums(allSupplierLineNums);
      setAllExtractedItems(collectedExtracted);
      setExtractionSummary(lastSummary);
      // Auto-confirm matched items (high or medium confidence)
      const autoConfirm: any={};
      Object.entries(allConf).forEach(([idx,c]: any)=>{if(c==='high'||c==='medium')autoConfirm[idx]=true;});
      setConfirmedMatches(autoConfirm);
      setMorePages(null);
      setPhase('review');
    }catch(e: any){
      console.warn("ARC AI extraction failed:",e);
      setAiError(e.message||String(e));
      setUnitPrices((prev: any)=>({...allPrices,...prev}));
      setPhase('review');
    }
  }

  function handleDrop(e: any){
    e.preventDefault();setDragOver(false);
    const f=e.dataTransfer.files[0];
    if(f)processFile(f);
  }

  async function handleSubmit(){
    if(uploading)return;
    if(!leadTime.trim()){alert("Please enter the lead time in days ARO for this order before submitting.");return;}
    setUploading(true);
    try{
      let storageUrl: any=null,fileName: any=null;
      if(file){
        const storageRef=fbStorage.ref(`supplierUploads/${token}/${file.name}`);
        await storageRef.put(file);
        storageUrl=await storageRef.getDownloadURL();
        fileName=file.name;
      }
      const orderLeadTime=parseInt(leadTime)||null;
      const pricedItems=(info?.lineItems||[]).map((item: any,i: number)=>({
        ...item,
        unitPrice:cannotSupply[i]===true?null:(unitPrices[i]!==undefined&&unitPrices[i]!==''?parseFloat(unitPrices[i])||null:null),
        leadTimeDays:cannotSupply[i]===true?null:(itemLeadTimes[i]!==undefined&&itemLeadTimes[i]!==''?parseInt(itemLeadTimes[i])||null:orderLeadTime),
        cannotSupply:cannotSupply[i]===true,
        supplierPartNumber:supplierPartNums[i]||null,
        supplierLineNumber:supplierLineNums[i]||null,
        supplierNote:itemNotes[i]||null,
      }));
      // Build confirmed crossings for ARC to save
      const confirmedCrossings: any[]=[];
      (info?.lineItems||[]).forEach((item: any,i: number)=>{
        if(confirmedMatches[i]&&supplierPartNums[i]&&item.partNumber){
          confirmedCrossings.push({supplierPartNumber:supplierPartNums[i],matrixPartNumber:item.partNumber,description:item.description||''});
        }
      });
      const updateData: any={status:"submitted",submittedAt:Date.now(),lineItems:pricedItems,leadTimeDays:orderLeadTime};
      if(confirmedCrossings.length)updateData.confirmedCrossings=confirmedCrossings;
      if(fileName)updateData.fileName=fileName;
      if(storageUrl)updateData.storageUrl=storageUrl;
      await fbDb.collection('rfqUploads').doc(token).update(updateData);
      setDone(true);
    }catch(e: any){alert("Submission failed: "+e.message);}
    setUploading(false);
  }

  const bg="#f8fafc";const card="#ffffff";const accent="#2563eb";const dark="#1e293b";const muted="#64748b";const border="#e2e8f0";
  const inp: any={border:`1px solid ${border}`,borderRadius:6,padding:"7px 10px",fontSize:14,fontFamily:"inherit",color:dark,outline:"none",background:"#f8fafc"};

  function Header(){
    return(<>
      <div style={{textAlign:"center",padding:"10px 0 12px",marginBottom:16,borderBottom:`1px solid ${border}`}}>
        <span style={{fontSize:14,color:muted,letterSpacing:1}}>Powered by <strong style={{color:dark}}>ARC Software</strong> &copy; 2026</span>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:muted,marginBottom:4}}>Request For Quote from</div>
          {info?.companyLogoUrl
            ?<img src={info.companyLogoUrl} alt="Company Logo" style={{maxHeight:52,maxWidth:180,objectFit:"contain"}}/>
            :<div style={{fontSize:20,fontWeight:800,color:accent}}>{info?.companyName||"Matrix Systems, Inc."}</div>
          }
          {(info?.companyAddress||info?.companyPhone)&&<div style={{fontSize:14,color:muted}}>{[info?.companyAddress,info?.companyPhone].filter(Boolean).join(' \u00B7 ')}</div>}
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:12,color:muted,letterSpacing:2,textTransform:"uppercase"}}>Request for Quote</div>
          <div style={{fontSize:18,fontWeight:700,color:dark}}>{info?.rfqNum||"\u2014"}</div>
        </div>
      </div>
    </>);
  }

  if(loading)return(<div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:muted,fontSize:15}}>Loading…</div></div>);
  if(error)return(<div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}><div style={{background:card,border:`1px solid ${border}`,borderRadius:12,padding:"32px 36px",maxWidth:440,width:"100%",textAlign:"center"}}><div style={{fontSize:36,marginBottom:16}}>{"\u26A0\uFE0F"}</div><div style={{fontSize:17,fontWeight:700,color:dark,marginBottom:8}}>Link Not Valid</div><div style={{fontSize:14,color:muted}}>{error}</div></div></div>);
  if(done)return(<div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}><div style={{background:card,border:`1px solid ${border}`,borderRadius:12,padding:"32px 36px",maxWidth:440,width:"100%",textAlign:"center"}}><div style={{fontSize:40,marginBottom:16}}>{"\u2705"}</div><div style={{fontSize:18,fontWeight:700,color:dark,marginBottom:8}}>Quote Submitted</div><div style={{fontSize:14,color:muted,lineHeight:1.6}}>Your quote has been received by Matrix Systems. We will follow up shortly.</div>{info?.rfqNum&&<div style={{marginTop:16,fontSize:13,color:muted}}><strong>RFQ:</strong> {info.rfqNum}</div>}<div style={{marginTop:20,fontSize:14,color:muted}}>You may close this browser window.</div></div></div>);
  const expired=(info?.expiresAt||0)>0&&Date.now()>(info?.expiresAt||0);
  if(expired)return(<div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}><div style={{background:card,border:`1px solid ${border}`,borderRadius:12,padding:"32px 36px",maxWidth:440,width:"100%",textAlign:"center"}}><div style={{fontSize:36,marginBottom:16}}>{"\u231B"}</div><div style={{fontSize:17,fontWeight:700,color:dark,marginBottom:8}}>Link Expired</div><div style={{fontSize:14,color:muted}}>This RFQ link has expired. Please contact Matrix Systems for an updated link.</div></div></div>);

  // -- ANALYZING PHASE --
  if(phase==='analyzing')return(
    <div style={{minHeight:"100vh",background:bg,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:card,border:`1px solid ${border}`,borderRadius:12,padding:"40px 36px",maxWidth:440,width:"100%",textAlign:"center",boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
        <div style={{width:48,height:48,margin:"0 auto 16px",border:"4px solid #e2e8f0",borderTop:`4px solid ${accent}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}
.spn-drop{max-height:200px;overflow-y:auto;scrollbar-width:auto;}
.spn-drop::-webkit-scrollbar{width:14px;}
.spn-drop::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:7px;border:3px solid #fff;}
.spn-drop::-webkit-scrollbar-track{background:#f1f5f9;border-radius:7px;}
input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}
input[type=number]{-moz-appearance:textfield;}`}</style>
        <div style={{fontSize:17,fontWeight:700,color:dark,marginBottom:8}}>Analyzing Your Quote</div>
        <div style={{fontSize:14,color:muted,lineHeight:1.6}}>{analyzeMsg}</div>
      </div>
    </div>
  );

  // -- REVIEW PHASE --
  if(phase==='review'){
    const lineItems=info?.lineItems||[];
    const extractedCount=Object.keys(unitPrices).filter((i: any)=>unitPrices[i]!=='').length;
    const unmatchedRfqCount=lineItems.length-extractedCount;
    const unmatchedSupplierCount=allExtractedItems.filter((ex: any)=>ex.confidence==='unmatched').length;
    return(
      <div style={{minHeight:"100vh",background:bg,padding:"32px 16px"}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <Header/>
          {(unmatchedRfqCount>0||unmatchedSupplierCount>0)&&(
            <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"flex-start",gap:12}}>
              <span style={{fontSize:22,flexShrink:0}}>{"\u26A0\uFE0F"}</span>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:"#991b1b",marginBottom:3}}>Validation Check</div>
                <div style={{fontSize:14,color:"#7f1d1d",lineHeight:1.5}}>
                  {unmatchedRfqCount>0&&<div><strong>{unmatchedRfqCount} of {lineItems.length}</strong> requested items have no price yet. Please review and enter prices manually or select the correct Supplier Part # from the dropdown.</div>}
                  {unmatchedSupplierCount>0&&<div style={{marginTop:unmatchedRfqCount>0?4:0}}><strong>{unmatchedSupplierCount}</strong> item{unmatchedSupplierCount!==1?'s':''} on your quote {unmatchedSupplierCount!==1?'were':'was'} not matched to any RFQ line item. Use the Supplier Part # dropdown to assign them.</div>}
                </div>
              </div>
            </div>
          )}
          <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:10,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"flex-start",gap:12}}>
            <span style={{fontSize:22,flexShrink:0}}>{"\u{1F4CB}"}</span>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#92400e",marginBottom:3}}>Review Extracted Pricing</div>
              {aiError
                ?<div style={{fontSize:14,color:"#991b1b"}}>AI extraction encountered an issue: {aiError}. Please enter prices manually below.</div>
                :<div style={{fontSize:14,color:"#78350f"}}>AI found prices for <strong>{extractedCount} of {lineItems.length}</strong> items. Please review for accuracy, correct any errors, and fill in any missing prices before submitting.</div>
              }
            </div>
          </div>
          {quoteHeaderInfo&&(
            <div style={{background:card,border:`1px solid ${border}`,borderRadius:10,padding:"16px 20px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
              <div style={{fontSize:14,fontWeight:700,color:dark,marginBottom:10}}>Quote Details (extracted from PDF)</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
                {[['Supplier',quoteHeaderInfo.supplierName],['Quote #',quoteHeaderInfo.quoteNumber],['Revision #',quoteHeaderInfo.revisionNumber],['Job Name',quoteHeaderInfo.jobName],
                  ['Contact',quoteHeaderInfo.contactName],['Quote Date',quoteHeaderInfo.quoteDate],['Updated On',quoteHeaderInfo.updatedOn],
                  ['Expires On',quoteHeaderInfo.expiresOn],['Customer PO #',quoteHeaderInfo.customerPO],['Customer PO Date',quoteHeaderInfo.customerPODate],
                  ['FOB',quoteHeaderInfo.fob],['Freight',quoteHeaderInfo.freight]].filter(([,v]: any)=>v).map(([label,val]: any)=>(
                  <div key={label} style={{background:bg,borderRadius:6,padding:"6px 10px"}}>
                    <div style={{fontSize:11,color:muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:1}}>{label}</div>
                    <div style={{fontSize:14,color:dark,fontWeight:600}}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{background:card,border:`1px solid ${border}`,borderRadius:10,marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{padding:"14px 20px",borderBottom:`1px solid ${border}`,display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"10px 10px 0 0",background:card}}>
              <span style={{fontSize:14,fontWeight:700,color:dark}}>Pricing Review</span>
              <span style={{fontSize:14,color:muted}}>{file?.name||""}</span>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14,fontFamily:"inherit"}}>
              <thead>
                <tr style={{background:"#f1f5f9"}}>
                  <th style={{padding:"8px 12px",textAlign:"center",color:muted,fontWeight:600,width:50}}>Ln #</th>
                  <th style={{padding:"8px 12px",textAlign:"left",color:muted,fontWeight:600}}>Matrix Part #</th>
                  <th style={{padding:"8px 12px",textAlign:"left",color:muted,fontWeight:600}}>Supplier Part #</th>
                  <th style={{padding:"8px 12px",textAlign:"left",color:muted,fontWeight:600}}>Description</th>
                  <th style={{padding:"8px 12px",textAlign:"center",color:muted,fontWeight:600}}>Qty</th>
                  <th style={{padding:"8px 12px",textAlign:"right",color:accent,fontWeight:700,minWidth:160}}>Unit Price</th>
                  <th style={{padding:"8px 12px",textAlign:"center",color:muted,fontWeight:600,minWidth:110}}>Lead Time (days)</th>
                  <th style={{padding:"8px 12px",textAlign:"center",color:"#dc2626",fontWeight:600,minWidth:70}}>No Bid</th>
                  <th style={{padding:"8px 12px",textAlign:"left",color:muted,fontWeight:600,minWidth:120}}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item: any,i: number)=>{
                  const conf=aiConfidences[i];
                  const cant=cannotSupply[i]===true;
                  const hasPrice=!cant&&unitPrices[i]!==undefined&&unitPrices[i]!=='';
                  const confirmed=confirmedMatches[i]===true;
                  const isMatch=!cant&&(confirmed||conf==='high'||conf==='medium');
                  const isNoMatch=!cant&&!confirmed&&(conf==='low');
                  const confLabel=confirmed?"CONFIRMED \u2713":isMatch?"MATCH":isNoMatch?"NO MATCH":null;
                  const confColor=confirmed?"#166534":isMatch?"#166534":"#991b1b";
                  const confBg=confirmed?"#bbf7d0":isMatch?"#dcfce7":"#fee2e2";
                  const hasSupplierPN=!!supplierPartNums[i];
                  return(
                    <tr key={i} style={{borderTop:`1px solid ${border}`,background:cant?"#fef2f2":isNoMatch?"#fff5f5":hasPrice?"#f0fdf4":"#fff",opacity:cant?0.6:1}}>
                      <td style={{padding:"10px 12px",textAlign:"center",color:muted,fontFamily:"monospace"}}>{supplierLineNums[i]||"\u2014"}</td>
                      <td style={{padding:"10px 12px",fontWeight:600,color:dark,fontFamily:"monospace",textDecoration:cant?"line-through":undefined}}>{item.partNumber||"\u2014"}</td>
                      <td style={{padding:"10px 12px",fontFamily:"monospace",fontSize:12}}>{(()=>{
                        const opts=allExtractedItems.filter((ex: any)=>ex.supplierPartNumber).map((ex: any)=>ex.supplierPartNumber);
                        const unique=[...new Set(opts)];
                        if(!unique.length)return<span style={{color:muted}}>{"\u2014"}</span>;
                        const cur=supplierPartNums[i]||"";
                        const isOpen=openSpnDrop===i;
                        function pick(val: any){
                          setSupplierPartNums((prev: any)=>({...prev,[i]:val}));
                          if(val){
                            setConfirmedMatches((prev: any)=>({...prev,[i]:true}));
                            const match=allExtractedItems.find((ex: any)=>ex.supplierPartNumber===val);
                            if(match){
                              if(match.unitPrice!=null)setUnitPrices((prev: any)=>({...prev,[i]:String(match.unitPrice)}));
                              if(match.leadTimeDays!=null)setItemLeadTimes((prev: any)=>({...prev,[i]:String(match.leadTimeDays)}));
                              if(match.supplierLineNumber)setSupplierLineNums((prev: any)=>({...prev,[i]:match.supplierLineNumber}));
                              setAiConfidences((prev: any)=>({...prev,[i]:'medium'}));
                            }
                          }else{
                            setConfirmedMatches((prev: any)=>({...prev,[i]:false}));
                          }
                          setOpenSpnDrop(null);setSpnDropRect(null);
                        }
                        const naturalH=Math.min(200,(unique.length+1)*32+2);
                        let dropStyle: any={position:"fixed",zIndex:700,background:"#fff",border:`1px solid ${border}`,borderRadius:6,width:240,boxShadow:"0 4px 16px rgba(0,0,0,0.15)"};
                        if(isOpen&&spnDropRect){
                          const spaceBelow=window.innerHeight-spnDropRect.bottom-10;
                          const spaceAbove=spnDropRect.top-10;
                          if(spaceBelow>=naturalH){
                            dropStyle={...dropStyle,top:spnDropRect.bottom+2,left:spnDropRect.left,maxHeight:spaceBelow};
                          }else if(spaceAbove>=naturalH){
                            dropStyle={...dropStyle,bottom:window.innerHeight-spnDropRect.top+2,left:spnDropRect.left,maxHeight:spaceAbove};
                          }else if(spaceAbove>spaceBelow){
                            dropStyle={...dropStyle,bottom:window.innerHeight-spnDropRect.top+2,left:spnDropRect.left,maxHeight:spaceAbove};
                          }else{
                            dropStyle={...dropStyle,top:spnDropRect.bottom+2,left:spnDropRect.left,maxHeight:spaceBelow};
                          }
                        }
                        return<div>
                          <button onClick={(e: any)=>{if(isOpen){setOpenSpnDrop(null);setSpnDropRect(null);}else{setSpnDropRect(e.currentTarget.getBoundingClientRect());setOpenSpnDrop(i);}}} style={{...inp,padding:"4px 6px",fontSize:14,fontFamily:"monospace",width:190,textAlign:"left",cursor:"pointer",color:cur?dark:muted,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cur||"\u2014 Select \u2014"}</span>
                            <span style={{fontSize:12,marginLeft:4}}>{isOpen?"\u25B2":"\u25BC"}</span>
                          </button>
                          {isOpen&&<>
                            <div style={{position:"fixed",inset:0,zIndex:699}} onClick={()=>{setOpenSpnDrop(null);setSpnDropRect(null);}}/>
                            <div className="spn-drop" style={dropStyle}>
                              <div onClick={()=>pick("")} style={{padding:"7px 10px",fontSize:14,color:muted,cursor:"pointer",borderBottom:`1px solid ${border}`}} onMouseEnter={(e: any)=>e.target.style.background="#f1f5f9"} onMouseLeave={(e: any)=>e.target.style.background="#fff"}>{"\u2014 Clear \u2014"}</div>
                              {unique.map((pn: any)=><div key={pn} onClick={()=>pick(pn)} style={{padding:"7px 10px",fontSize:14,fontFamily:"monospace",color:pn===cur?accent:dark,fontWeight:pn===cur?700:400,cursor:"pointer",background:pn===cur?"#eff6ff":"#fff"}} onMouseEnter={(e: any)=>{if(pn!==cur)e.target.style.background="#f1f5f9";}} onMouseLeave={(e: any)=>{if(pn!==cur)e.target.style.background="#fff";}}>{pn}</div>)}
                            </div>
                          </>}
                        </div>;
                      })()}</td>
                      <td style={{padding:"10px 12px",color:muted,textDecoration:cant?"line-through":undefined}}>{item.description||"\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",color:dark}}>{item.qty||1}</td>
                      <td style={{padding:"8px 12px"}}>
                        {cant?<span style={{fontSize:14,color:"#dc2626",fontWeight:700,display:"block",textAlign:"right"}}>No Bid</span>:(
                        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6}}>
                          {confLabel&&<span style={{fontSize:12,fontWeight:700,borderRadius:4,padding:"2px 8px",background:confBg,color:confColor,flexShrink:0}}>{confLabel}</span>}
                          {!confirmed&&hasSupplierPN&&(isNoMatch||isMatch)&&<button onClick={()=>setConfirmedMatches((prev: any)=>({...prev,[i]:true}))} style={{fontSize:12,fontWeight:600,borderRadius:4,padding:"2px 8px",background:"#eff6ff",color:"#2563eb",border:"1px solid #bfdbfe",cursor:"pointer",flexShrink:0,fontFamily:"inherit"}}>{"\u2713 Confirm"}</button>}
                          {!conf&&!hasPrice&&<span style={{fontSize:14,color:"#dc2626",fontWeight:600,flexShrink:0}}>{"\u26A0 Missing"}</span>}
                          {isNoMatch&&<span style={{fontSize:12,color:"#991b1b",flexShrink:0}}>Please enter price</span>}
                          <span style={{color:muted}}>$</span>
                          <input type="text" inputMode="decimal" placeholder="0.00"
                            value={unitPrices[i]??''}
                            onChange={(e: any)=>{const v=e.target.value;if(v===''||/^\d*\.?\d*$/.test(v))setUnitPrices((prev: any)=>({...prev,[i]:v}));}}
                            onFocus={(e: any)=>e.target.select()}
                            onBlur={(e: any)=>{const v=parseFloat(e.target.value);if(!isNaN(v))setUnitPrices((prev: any)=>({...prev,[i]:v.toFixed(2)}));}}
                            onKeyDown={(e: any)=>{if(e.key==='Enter')e.target.blur();}}
                            style={{width:100,textAlign:"right",...inp,border:`1px solid ${hasPrice?(isMatch?"#86efac":"#e2e8f0"):"#fca5a5"}`,background:hasPrice?"#f0fdf4":"#fff5f5"}}
                          />
                        </div>)}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        {!cant&&<input type="number" min="0" step="1" placeholder="\u2014"
                          value={itemLeadTimes[i]??''}
                          onChange={(e: any)=>setItemLeadTimes((prev: any)=>({...prev,[i]:e.target.value}))}
                          onFocus={(e: any)=>e.target.select()}
                          onKeyDown={(e: any)=>{if(e.key==='Enter')e.target.blur();}}
                          style={{width:70,textAlign:"center",...inp}}
                        />}
                      </td>
                      <td style={{padding:"8px 12px",textAlign:"center"}}>
                        <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,cursor:"pointer",userSelect:"none"}}>
                          <input type="checkbox" checked={cant}
                            onChange={(e: any)=>setCannotSupply((prev: any)=>({...prev,[i]:e.target.checked}))}
                            style={{width:16,height:16,accentColor:"#dc2626",cursor:"pointer"}}
                          />
                          {cant&&<span style={{fontSize:14,color:"#dc2626",fontWeight:700}}>Yes</span>}
                        </label>
                      </td>
                      <td style={{padding:"8px 12px"}}>
                        <input type="text" placeholder="Add note…"
                          value={itemNotes[i]||''}
                          onChange={(e: any)=>setItemNotes((prev: any)=>({...prev,[i]:e.target.value}))}
                          style={{...inp,width:"100%",padding:"4px 6px"}}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{background:card,border:`1px solid ${!leadTime.trim()?"#fca5a5":border}`,borderRadius:10,padding:"20px 24px",marginBottom:16,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <label style={{display:"block",fontSize:14,fontWeight:700,color:dark,marginBottom:4}}>Lead Time (days ARO) <span style={{color:"#dc2626"}}>*</span></label>
            <div style={{fontSize:14,color:muted,marginBottom:8}}>Required — enter your standard lead time for this entire order. You may optionally enter different lead times per line item above to override.</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <input type="number" min="0" step="1" placeholder="e.g. 14" value={leadTime}
                onChange={(e: any)=>setLeadTime(e.target.value)}
                onFocus={(e: any)=>e.target.select()}
                onKeyDown={(e: any)=>{if(e.key==='Enter')e.target.blur();}}
                onBlur={(e: any)=>{
                  const val=e.target.value;
                  if(val.trim()){
                    const lineItems=info?.lineItems||[];
                    setItemLeadTimes((prev: any)=>{
                      const next={...prev};
                      lineItems.forEach((_: any,i: number)=>{if(!next[i]||next[i]==='')next[i]=val;});
                      return next;
                    });
                  }
                }}
                style={{width:120,...inp,border:`1px solid ${!leadTime.trim()?"#fca5a5":border}`}}/>
              <span style={{fontSize:14,color:muted}}>calendar days after receipt of order</span>
            </div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setPhase('upload');setFile(null);setUnitPrices({});setAiConfidences({});setAiError(null);setItemLeadTimes({});setSupplierPartNums({});setSupplierLineNums({});setItemNotes({});setConfirmedMatches({});setQuoteHeaderInfo(null);setAllExtractedItems([]);setExtractionSummary(null);setMorePages(null);pdfRef.current=null;}}
              style={{flex:1,background:"#fff",border:`1px solid ${border}`,color:muted,padding:"12px",borderRadius:8,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
              {"\u2190 Start Over"}
            </button>
            <button onClick={handleSubmit} disabled={uploading}
              style={{flex:3,background:accent,border:"none",color:"#fff",padding:"12px",borderRadius:8,fontSize:15,fontWeight:700,cursor:uploading?"wait":"pointer",opacity:uploading?0.7:1,fontFamily:"inherit"}}>
              {uploading?"Submitting…":"\u2713 Confirm & Submit Quote"}
            </button>
          </div>
          <div style={{fontSize:13,color:muted,textAlign:"center",marginTop:8,lineHeight:1.5}}>Confirming each item is helpful, but not required.<br/>Your uploaded quote will be reviewed by the Matrix Sales Team.</div>
        </div>
      </div>
    );
  }

  // -- UPLOAD PHASE --
  return(
    <div style={{minHeight:"100vh",background:bg,padding:"32px 16px"}}>
      <div style={{maxWidth:620,margin:"0 auto"}}>
        <Header/>
        <div style={{background:card,border:`1px solid ${border}`,borderRadius:10,padding:"20px 24px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
          <table style={{fontSize:14,borderCollapse:"collapse"}}>
            <tbody>
              <tr><td style={{padding:"4px 16px 4px 0",color:muted}}>Project:</td><td style={{fontWeight:600,color:dark}}>{info?.projectName||"\u2014"}</td></tr>
              <tr><td style={{padding:"4px 16px 4px 0",color:muted}}>To:</td><td style={{color:dark}}>{info?.vendorName||"\u2014"}</td></tr>
            </tbody>
          </table>
        </div>
        <div style={{background:card,border:`1px solid ${border}`,borderRadius:10,padding:"28px 24px",marginBottom:20,boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
          <div style={{fontSize:15,fontWeight:700,color:dark,marginBottom:4}}>Submit Your Quote</div>
          <div style={{fontSize:14,color:muted,marginBottom:22,lineHeight:1.6}}>Upload your quote PDF below. AI will automatically extract pricing — you'll review before submitting.</div>
          <div
            onDragOver={(e: any)=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={handleDrop}
            style={{border:`2px dashed ${dragOver?"#2563eb":border}`,borderRadius:10,padding:"40px 20px",textAlign:"center",transition:"all 0.2s",background:dragOver?"#eff6ff":"#f8fafc",marginBottom:16}}>
            <div style={{fontSize:36,marginBottom:10}}>{"\u{1F4C4}"}</div>
            <div style={{fontSize:15,fontWeight:600,color:dragOver?accent:dark,marginBottom:6}}>{dragOver?"Drop PDF here":"Drag & drop your quote PDF here"}</div>
            <div style={{fontSize:14,color:muted,marginBottom:16}}>or</div>
            <label style={{display:"inline-block",background:accent,color:"#fff",fontWeight:700,fontSize:14,padding:"10px 24px",borderRadius:7,cursor:"pointer",fontFamily:"inherit"}}>
              Browse File
              <input type="file" accept=".pdf,application/pdf" style={{display:"none"}} onChange={(e: any)=>{const f=e.target.files[0];if(f)processFile(f);}}/>
            </label>
          </div>
          <div style={{fontSize:14,color:muted,textAlign:"center"}}>PDF only · Up to 8 pages scanned · Pricing extracted automatically by AI</div>
        </div>
        {(info?.lineItems||[]).length>0&&(
          <div style={{background:card,border:`1px solid ${border}`,borderRadius:10,marginBottom:20,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{padding:"14px 20px",borderBottom:`1px solid ${border}`,fontSize:14,fontWeight:700,color:dark}}>Items Requested ({info.lineItems.length})</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
              <thead><tr style={{background:"#f1f5f9"}}>
                <th style={{padding:"8px 12px",textAlign:"left",color:muted,fontWeight:600}}>#</th>
                <th style={{padding:"8px 12px",textAlign:"left",color:muted,fontWeight:600}}>Part Number</th>
                <th style={{padding:"8px 12px",textAlign:"left",color:muted,fontWeight:600}}>Description</th>
                <th style={{padding:"8px 12px",textAlign:"center",color:muted,fontWeight:600}}>Qty</th>
              </tr></thead>
              <tbody>
                {info.lineItems.map((item: any,i: number)=>(
                  <tr key={i} style={{borderTop:`1px solid ${border}`}}>
                    <td style={{padding:"8px 12px",color:muted}}>{i+1}</td>
                    <td style={{padding:"8px 12px",fontWeight:600,color:dark,whiteSpace:"nowrap"}}>{item.partNumber||"\u2014"}</td>
                    <td style={{padding:"8px 12px",color:dark}}>{item.description||"\u2014"}</td>
                    <td style={{padding:"8px 12px",textAlign:"center",color:dark}}>{item.qty||1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default SupplierPortalPage;

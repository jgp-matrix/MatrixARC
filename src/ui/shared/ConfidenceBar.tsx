import { useState, useEffect, useRef } from 'react';
import { C } from '@/core/constants';
import { calcConfidence } from '@/bom/validator';
import { verifyPartNumbers } from '@/bom/extractor';

// ─── ConfidenceBar Component ─────────────────────────────────────────────────

function ConfidenceBar({panel,readOnly,onUpdate,onSaveImmediate,compact}: any){
  const conf=calcConfidence(panel);
  const {pricing,wiring,bomExt,overall,pricingDetail,wiringDetail,bomDetail}=conf;
  const bom=panel.bom||[];
  const validation=panel.validation||null;
  const [expanded,setExpanded]=useState<string|null>(null);
  const [verifying,setVerifying]=useState(false);
  const barRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!expanded)return;
    function handleClick(e: any){if(barRef.current&&!barRef.current.contains(e.target))setExpanded(null);}
    document.addEventListener("mousedown",handleClick);
    return()=>document.removeEventListener("mousedown",handleClick);
  },[expanded]);
  async function runVerify(){
    if(verifying||!bom.length)return;
    setVerifying(true);
    try{
      const results=await verifyPartNumbers(bom);
      if(results.length>0){
        const updated={...panel,bomVerification:results,updatedAt:Date.now()};
        onUpdate(updated);
        if(onSaveImmediate)try{await onSaveImmediate(updated);}catch(e){}
      }
    }catch(e){console.error("Verify failed:",e);}
    setVerifying(false);
  }
  if(!bom.length&&!validation)return null;
  const barColor=(v: number)=>v>=80?C.green:v>=50?C.yellow:v>0?C.red:C.border;
  const items=[
    {label:"Pricing",val:pricing,key:"pricing"},
    {label:"Wiring",val:wiring,key:"wiring"},
    {label:"BOM",val:bomExt,key:"bom"}
  ];
  function toggleWiringAccepted(itemId: any){
    if(readOnly||!onUpdate)return;
    const arr=panel.wiringAccepted||[];
    const id=String(itemId);
    const updated=arr.includes(id)?arr.filter((x: any)=>x!==id):[...arr,id];
    const newPanel={...panel,wiringAccepted:updated};
    onUpdate(newPanel);
    if(onSaveImmediate)try{onSaveImmediate(newPanel);}catch(e){}
  }
  const acceptedSet=new Set((panel.wiringAccepted||[]).map(String));
  return(
    <div ref={barRef} style={{background:C.card,border:compact?`1px solid ${C.accent}`:`1px solid #3a3a55`,borderRadius:compact?8:10,padding:compact?"8px 12px":"14px 20px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
        <span style={{fontSize:compact?14:17,color:C.sub,fontWeight:700,letterSpacing:0.3,whiteSpace:"nowrap"}}>OVERALL CONFIDENCE</span>
        <span style={{fontSize:compact?18:23,color:barColor(overall),fontWeight:800}}>{overall}%</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        {items.map(it=>(
          <div key={it.key} onClick={()=>setExpanded(expanded===it.key?null:it.key)}
            style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",userSelect:"none"}} title={`${it.label}: ${it.val}% — click for details`}>
            <span style={{fontSize:14,color:C.muted,fontWeight:600}}>{it.label}</span>
            <span style={{fontSize:14,color:barColor(it.val),fontWeight:700}}>{it.val}%</span>
          </div>
        ))}
      </div>
      {expanded==="pricing"&&(
        <div style={{marginTop:12,padding:"10px 14px",background:"#0d0d14",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13}}>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {pricingDetail.bcCount>0&&<div style={{color:C.green}}>{pricingDetail.bcCount} item{pricingDetail.bcCount!==1?"s":""} BC-priced ✓</div>}
            {pricingDetail.manualCount>0&&<div style={{color:C.green}}>{pricingDetail.manualCount} item{pricingDetail.manualCount!==1?"s":""} manual ✓</div>}
            {pricingDetail.aiCount>0&&<div style={{color:C.yellow}}>{pricingDetail.aiCount} item{pricingDetail.aiCount!==1?"s":""} AI-priced ⚠</div>}
            {pricingDetail.unpricedCount>0&&<div style={{color:C.red}}>{pricingDetail.unpricedCount} item{pricingDetail.unpricedCount!==1?"s":""} unpriced ✗</div>}
            {pricingDetail.total===0&&<div style={{color:C.muted}}>No BOM items yet</div>}
          </div>
          <div style={{marginTop:8,color:C.muted,fontSize:12,fontStyle:"italic"}}>Set prices manually or run Get Prices to improve this score</div>
        </div>
      )}
      {expanded==="wiring"&&(
        <div style={{marginTop:12,padding:"10px 14px",background:"#0d0d14",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13}}>
          {!validation?<div style={{color:C.muted}}>No validation data — run Re-Validate</div>:(
            <div>
              <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:8}}>
                <span style={{color:C.green}}>{wiringDetail.matched} matched ✓</span>
                <span style={{color:wiringDetail.missing.length-wiringDetail.accepted>0?C.red:C.green}}>{wiringDetail.missing.length-wiringDetail.accepted} missing ✗</span>
                {wiringDetail.accepted>0&&<span style={{color:C.accent}}>{wiringDetail.accepted} accepted</span>}
                <span style={{color:C.muted}}>{wiringDetail.notTraceable} not traceable —</span>
              </div>
              {wiringDetail.missing.length>0&&(
                <div style={{maxHeight:180,overflowY:"auto",borderTop:`1px solid ${C.border}`,paddingTop:6}}>
                  {wiringDetail.missing.map((m: any)=>{
                    const id=String(m.id);
                    const isAccepted=acceptedSet.has(id);
                    return(
                      <div key={id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",borderBottom:`1px solid ${C.border}33`}}>
                        <span style={{color:isAccepted?C.accent:C.red,fontWeight:600,flex:1,fontSize:12}}>{m.partNumber||m.description||"Item #"+m.id}</span>
                        {m.notes&&<span style={{color:C.muted,fontSize:11}}>{m.notes}</span>}
                        <button onClick={()=>toggleWiringAccepted(m.id)} disabled={readOnly}
                          style={{background:isAccepted?C.accentDim:"transparent",color:isAccepted?C.accent:C.muted,border:`1px solid ${isAccepted?C.accent:C.border}`,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600,cursor:readOnly?"default":"pointer",opacity:readOnly?0.5:1,whiteSpace:"nowrap"}}>
                          {isAccepted?"Accepted ✓":"Accept ✓"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{marginTop:8,color:C.muted,fontSize:12,fontStyle:"italic"}}>Accept items you've verified or Re-Validate to rescan</div>
            </div>
          )}
        </div>
      )}
      {expanded==="bom"&&(
        <div style={{marginTop:12,padding:"10px 14px",background:"#0d0d14",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13}}>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{color:C.text}}>{bomDetail.bomPages} BOM page{bomDetail.bomPages!==1?"s":""} detected</div>
            <div style={{color:C.text}}>{bomDetail.itemCount} item{bomDetail.itemCount!==1?"s":""} extracted</div>
            {bomDetail.cleanCount>0&&<div style={{color:C.green}}>{bomDetail.cleanCount} item{bomDetail.cleanCount!==1?"s":""} clean ✓</div>}
            {bomDetail.flaggedRows.length>0&&<div style={{color:C.yellow}}>{bomDetail.flaggedRows.length} item{bomDetail.flaggedRows.length!==1?"s":""} flagged ⚠</div>}
          </div>
          {(bomDetail.verifiedCount>0||bomDetail.plausibleCount>0||bomDetail.suspectCount>0||bomDetail.uncheckedCount>0)&&(
            <div style={{display:"flex",gap:12,flexWrap:"wrap",marginTop:8,paddingTop:6,borderTop:`1px solid ${C.border}`}}>
              <span style={{fontSize:12,color:C.muted,fontWeight:600}}>Part # Check:</span>
              {bomDetail.verifiedCount>0&&<span style={{color:C.green,fontSize:12}}>{bomDetail.verifiedCount} verified ✓</span>}
              {bomDetail.plausibleCount>0&&<span style={{color:C.yellow,fontSize:12}}>{bomDetail.plausibleCount} plausible ~</span>}
              {bomDetail.suspectCount>0&&<span style={{color:C.red,fontSize:12}}>{bomDetail.suspectCount} not found ✗</span>}
              {bomDetail.uncheckedCount>0&&<span style={{color:C.muted,fontSize:12}}>{bomDetail.uncheckedCount} unchecked</span>}
              {bomDetail.uncheckedCount>0&&!readOnly&&<button onClick={runVerify} disabled={verifying} style={{background:C.accentDim,color:C.accent,border:`1px solid ${C.accent}55`,borderRadius:6,padding:"1px 8px",fontSize:11,fontWeight:600,cursor:verifying?"default":"pointer",opacity:verifying?0.5:1}}>{verifying?"Checking…":"Verify Now"}</button>}
            </div>
          )}
          {bomDetail.flaggedRows.length>0&&(
            <div style={{maxHeight:180,overflowY:"auto",borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:8}}>
              {bomDetail.flaggedRows.map((f: any)=>{
                const vColor=f.verifStatus==="verified"?C.green:f.verifStatus==="plausible"?C.yellow:f.verifStatus==="suspect"?C.red:null;
                return(
                <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"3px 0",borderBottom:`1px solid ${C.border}33`}}>
                  <span style={{color:f.score>=70?C.yellow:C.red,fontWeight:600,fontSize:12,minWidth:0,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.partNumber||"(empty)"}</span>
                  {vColor&&<span style={{color:vColor,fontSize:10,fontWeight:700}}>{f.verifStatus==="verified"?"✓":f.verifStatus==="plausible"?"~":"✗"}</span>}
                  <span style={{color:C.muted,fontSize:11,whiteSpace:"nowrap"}}>{f.issues.join(", ")}</span>
                  <span style={{color:f.score>=70?C.yellow:C.red,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{f.score}%</span>
                </div>
                );
              })}
            </div>
          )}
          <div style={{marginTop:8,color:C.muted,fontSize:12,fontStyle:"italic"}}>Part numbers are verified against known manufacturers. Correct suspect items to improve score.</div>
        </div>
      )}
    </div>
  );
}

export default ConfidenceBar;

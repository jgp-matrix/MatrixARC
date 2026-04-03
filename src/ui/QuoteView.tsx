/* eslint-disable */
// @ts-nocheck
// QuoteView.tsx — Verbatim extraction from monolith index.html v1.19.376 lines 15542-15613.
// DO NOT EDIT — re-extract from monolith if changes are needed.

import React from 'react';
import { C, card } from '@/core/constants';
import { mergeBoms } from '@/bom/deduplicator';
import { computeLaborEstimate } from '@/bom/laborEstimator';
import QuoteTab from '@/ui/tabs/QuoteTab';

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

export default QuoteView;

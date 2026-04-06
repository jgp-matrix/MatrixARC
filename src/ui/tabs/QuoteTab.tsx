// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function QuoteTab({project,onUpdate}){
  const [quoteTab,setQuoteTab]=useState("formal");
  const pr=project.pricing||{};
  const bom=project.bom||[];
  // Use pre-computed labor from QuoteView (sums each panel individually, preserving overrides)
  // Fall back to computing from project directly for single-panel or non-aggregated use
  const laborEst=project._quoteLabor||computeLaborEstimate(project);
  const laborHours=laborEst.totalHours;
  const laborRate=pr.laborRate??45;
  const markup=pr.markup??30;
  const materialCost=bom.reduce((s,r)=>s+(r.unitPrice||0)*(r.qty||1),0);
  const laborCost=laborHours>0?laborEst.totalCost:(pr.manualLaborCost||0);
  const grandTotal=materialCost+laborCost;
  const sellPrice=grandTotal*(1+markup/100);
  const hasSellPrice=sellPrice>0;

  // BUDGETARY: true if any panel has at least one BOM item not yet confirmed in BC
  const isProjectBudgetary=(project.panels||[project]).some(isPanelBudgetary);

  const q=project.quote||{};
  function setQ(updates){onUpdate({...project,quote:{...q,...updates}});}

  const today=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const defaultValidUntil=new Date(Date.now()+30*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const fmtMoney=n=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});

  const defaultTerms="Standard Payment Terms for Panel Builds (Order Total over $30,000): 30% ARO; 40% @ Procurement, 30% @ Readiness To Ship\nStandard Payment Terms for Engineering / Programming: 50% ARO / 50% due @ Completion of Work";
  const qInp=(x={})=>({background:"transparent",border:"none",borderBottom:`1px dashed ${C.border}`,outline:"none",color:C.text,fontSize:"inherit",fontFamily:"inherit",padding:"1px 2px",width:"100%",...x});

  return(
    <div>
      {/* Formal Quote */}
      {true&&<div>
      {/* Compact editing form */}
      <div className="no-print" style={{marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Formal Quote</div>
            <div style={{fontSize:13,color:C.muted}}>
              {hasSellPrice?`Sell price: ${fmtMoney(sellPrice)}`:"Complete pricing first to populate sell price."}
            </div>
          </div>
          <button onClick={async()=>{await generateQuotePdf(project);const hash=computeBomHash(project.panels);onUpdate({...project,lastPrintedBomHash:hash,lastQuotePrintedAt:Date.now(),quoteRevAtPrint:project.quoteRev||0});}} style={btn(C.accent,"#fff",{fontSize:14,padding:"10px 24px"})}>🖨 Generate PDF</button>
        </div>
        {(()=>{
          const fld=(label,key,ph,w)=>(
            <div key={key} style={{display:"flex",flexDirection:"column",gap:2,minWidth:w||180,flex:1}}>
              <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.8px",color:C.muted}}>{label}</label>
              <input value={q[key]||""} onChange={e=>setQ({[key]:e.target.value})} placeholder={ph}
                style={{background:C.input,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text,fontSize:13,outline:"none"}}/>
            </div>
          );
          return(
            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {fld("Quote #","number","MTX-Q2#####",160)}
                {fld("Contact Name","contact","Contact name")}
                {fld("Company","company","Company")}
                {fld("Address","address","Address")}
                {fld("Phone","phone","(___) ___-____",140)}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {fld("Salesperson","salesperson","Salesperson name")}
                {fld("Sales Email","salesEmail","email@matrixpci.com")}
                {fld("Sales Phone","salesPhone","(___) ___-____",140)}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {fld("Project #","projectNumber",project.name)}
                {fld("Payment Terms","paymentTerms","Net 30 Days")}
                {fld("Shipping Method","shippingMethod","Customer Handles Shipping")}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {fld("Description","description",project.name)}
                {fld("Panel ID","panelId",project.name,140)}
                {fld("Drawing Rev","drawingRev","A",80)}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {fld("Plant Name","plantName","",180)}
                {fld("Supply Voltage","supplyVoltage","",120)}
                {fld("Control Voltage","controlVoltage","",120)}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {fld("Quantity","qty","1.00",80)}
                {fld("Lead Time (days)","leadTime","—",100)}
                {fld("Prices Valid Until","validUntil",defaultValidUntil,160)}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.8px",color:C.muted}}>Payment Terms Text</label>
                <textarea value={q.termsText!=null?q.termsText:defaultTerms} onChange={e=>setQ({termsText:e.target.value})} rows={2}
                  style={{background:C.input,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text,fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.8px",color:C.muted}}>Line Item Notes</label>
                <textarea value={q.lineNotes||""} onChange={e=>setQ({lineNotes:e.target.value})} placeholder="e.g. Grey duct quoted instead of white." rows={1}
                  style={{background:C.input,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text,fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Hidden quote document — only visible in print */}
      <div id="quote-doc" style={{maxWidth:900,margin:"0 auto"}}>
        {/* Print-only fixed footer — position:fixed renders at bottom of every printed page */}
        <div className="qd-print-footer">
          <div className="qd-foot-left"><strong>Matrix Systems</strong><br/>5591 Leo Park Rd · West Jordan, UT 84081</div>
          <div className="qd-foot-right">(801) 930-9492<br/>sales@matrixpci.com</div>
        </div>
        <div className="qd-page">

          {/* Header */}
          <div className="qd-header" style={{borderBottom:"2px solid #fff"}}>
            <div className="qd-brand" style={{flexDirection:"column",alignItems:"flex-start",gap:4}}>
              {(_appCtx.company?.logoDarkUrl||_appCtx.company?.logoUrl)?<img src={_appCtx.company.logoDarkUrl||_appCtx.company.logoUrl} alt="Logo" style={{maxHeight:60,maxWidth:220,objectFit:"contain"}}/>:<h1>Matrix Systems</h1>}
              <div className="qd-addr">{_appCtx.company?.address||"5591 Leo Park Road, West Jordan, UT 84081 US"}</div>
            </div>
            <div className="qd-hdr-right">
              <div className="qd-qlabel" style={isProjectBudgetary?{fontSize:22,fontWeight:800,color:C.red,letterSpacing:2}:{}}>{isProjectBudgetary?"BUDGETARY QUOTE":"Quote"}</div>
              <div className="qd-qnum"><input value={q.number||""} onChange={e=>setQ({number:e.target.value})} placeholder="MTX-Q2#####" style={{...qInp({width:220,fontSize:28,fontWeight:800,textAlign:"right",letterSpacing:"-0.5px"})}}/></div>
              <div style={{textAlign:"right",fontSize:13,fontWeight:700,color:(project.quoteRev||0)>(project.quoteRevAtPrint||0)?C.yellow:C.muted,letterSpacing:0.3}}>Rev {String(project.quoteRev||0).padStart(2,'0')}{(project.quoteRev||0)>(project.quoteRevAtPrint||0)?" — unsent":""}</div>
              {(()=>{const hasEq=(project.panels||[]).some(p=>(p.engineeringQuestions||[]).some(eq=>eq.status==="on_quote"));const totalPages=1+(hasEq?1:0)+1;return <div className="qd-qmeta">{q.date||today}<br/>Page 1 of {totalPages}</div>;})()}
            </div>
          </div>

          {/* Info Grid */}
          <div className="qd-info-grid">
            <div>
              <div className="qd-info-label">Attention</div>
              <div className="qd-info-name"><input value={q.contact||""} onChange={e=>setQ({contact:e.target.value})} placeholder="Contact name" style={qInp({fontWeight:700,fontSize:18})}/></div>
              <div className="qd-info-detail">
                <strong><input value={q.company||""} onChange={e=>setQ({company:e.target.value})} placeholder="Company" style={qInp({fontWeight:600,color:C.text,marginBottom:2})}/></strong>
                <input value={q.address||""} onChange={e=>setQ({address:e.target.value})} placeholder="Address" style={qInp({marginBottom:2})}/>
                <div>Phone: <input value={q.phone||""} onChange={e=>setQ({phone:e.target.value})} placeholder="—" style={{...qInp({display:"inline",width:"60%"})}}/></div>
              </div>
            </div>
            <div>
              <div className="qd-info-label">Prepared By</div>
              <div className="qd-info-name"><input value={q.salesperson||""} onChange={e=>setQ({salesperson:e.target.value})} placeholder="Salesperson name" style={qInp({fontWeight:700,fontSize:18})}/></div>
              <div className="qd-info-detail">
                Salesperson<br/>
                <input value={q.salesEmail||""} onChange={e=>setQ({salesEmail:e.target.value})} placeholder="email@matrixpci.com" onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}} onBlur={()=>{
                  const spCode=project.bcSalespersonCode;if(spCode&&q.salesEmail){const path=`${_appCtx.configPath||"users/"+(_appCtx.uid||"")+"/config"}/salespersonInfo`;fbDb.doc(path).set({people:{[spCode]:{email:q.salesEmail||"",phone:q.salesPhone||""}}},{merge:true}).catch(()=>{});}
                }} style={qInp({marginBottom:2})}/>
                <input value={(()=>{const p=q.salesPhone||"";const d=p.replace(/\D/g,"");return d.length===10?`${d.slice(0,3)}-${d.slice(3,6)}-${d.slice(6)}`:p;})()} onChange={e=>setQ({salesPhone:e.target.value})} placeholder="(___) ___-____" onBlur={()=>{
                  const spCode=project.bcSalespersonCode;if(spCode&&q.salesPhone){const path=`${_appCtx.configPath||"users/"+(_appCtx.uid||"")+"/config"}/salespersonInfo`;fbDb.doc(path).set({people:{[spCode]:{email:q.salesEmail||"",phone:q.salesPhone||""}}},{merge:true}).catch(()=>{});}
                }} style={qInp({})}/>
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="qd-proj">
            {[
              ["Project #",q.projectNumber,v=>setQ({projectNumber:v}),project.name],
              ["Req. Ship Date",q.requestedShipDate||(project.panels||[]).find(p=>p.requestedShipDate)?.requestedShipDate||"",v=>setQ({requestedShipDate:v}),"YYYY-MM-DD"],
              ["Pmt. Terms",q.paymentTerms,v=>setQ({paymentTerms:v}),"Net 30 Days"],
              ["Shipping Method",q.shippingMethod,v=>setQ({shippingMethod:v}),"Customer Handles Shipping"],
            ].map(([label,val,setter,ph])=>(
              <div key={label}>
                <div className="qd-proj-label">{label}</div>
                <div className="qd-proj-value"><input value={val||""} onChange={e=>setter(e.target.value)} placeholder={ph} style={qInp({fontSize:17,fontWeight:600})}/></div>
              </div>
            ))}
          </div>

          {/* Terms Banner */}
          <div className="qd-terms">
            <textarea value={q.termsText!=null?q.termsText:defaultTerms} onChange={e=>setQ({termsText:e.target.value})} rows={3} style={{...qInp({display:"block",width:"100%",resize:"vertical",fontSize:"14px",lineHeight:"1.7",color:C.muted,borderBottom:"none"})}}/>
          </div>

          {/* Line Items */}
          <div className="qd-items">
            <div className="qd-items-heading">Line Items</div>
            {(project.panels||[project]).map((pan,pi)=>{
              const panPr=pan.pricing||{};
              const panSell=computePanelSellPrice(pan);
              const panHasSell=panSell>0;
              const panQty=pan.lineQty??1;
              const panBom=pan.bom||[];
              const qp=(q.panelOverrides||{})[pan.id]||{};
              const setQP=(updates)=>{const po={...(q.panelOverrides||{}),[pan.id]:{...qp,...updates}};setQ({panelOverrides:po});};
              const crossedItems=panBom.filter(r=>r.isCrossed&&r.crossedFrom&&normPart(r.crossedFrom)!==normPart(r.partNumber));
              return(
              <div key={pan.id||pi} style={{marginBottom:12}}>
              {/* Main line item box — kept together on one page */}
              <div className="qd-li">
              <div className="qd-li-hdr">
                <span className="qd-li-num">Line {pi+1}</span>
                <span className="qd-li-part">Part #: {pan.drawingNo||qp.panelId||pan.name||`Panel ${pi+1}`}</span>
              </div>
              <div className="qd-li-body">
                <div>
                  <div className="qd-li-title">{qp.description||pan.drawingDesc||pan.name||`Panel ${pi+1}`}</div>
                  <div className="qd-specs">
                    {[
                      ["Project",q.projectNumber||project.bcProjectNumber||project.name],
                      ["Drawing Rev",pan.drawingRev||"—"],
                      ["Panel ID",pan.drawingNo||pan.name||"—"],
                      ["Plant Name",qp.plantName||q.plantName||""],
                      ["Supply Voltage",qp.supplyVoltage||q.supplyVoltage||pan.supplyVoltage||""],
                      ["Control Voltage",qp.controlVoltage||q.controlVoltage||pan.controlVoltage||""],
                    ].map(([label,val])=>(
                      <div key={label} className="qd-spec">
                        <b>{label}:</b> {val||"—"}
                      </div>
                    ))}
                  </div>
                  {pan.bomNotes&&<div className="qd-li-notes">
                    <span>NOTES: </span>{pan.bomNotes}
                  </div>}
                  <div className="qd-li-notes" style={{borderLeftColor:C.accent}}>
                    <span>QUOTE NOTES: </span>
                    <textarea value={qp.lineNotes||""} onChange={e=>setQP({lineNotes:e.target.value})} placeholder="Additional quote-specific notes…" rows={1} style={{...qInp({display:"inline-block",width:"80%",resize:"vertical",fontSize:13,verticalAlign:"top",borderBottom:"none"})}}/>
                  </div>
                </div>
              </div>

              {/* Pricing Row */}
              <div className="qd-li-pricing">
                <div>
                  <div className="qd-plabel">Quantity</div>
                  <div className="qd-pval">{panQty} EA</div>
                </div>
                <div>
                  <div className="qd-plabel">Unit Price</div>
                  <div className="qd-pval">{panHasSell?fmtMoney(panSell):"—"}</div>
                </div>
                <div>
                  <div className="qd-plabel">Lead Time</div>
                  <div className="qd-pval">{qp.leadTime||q.leadTime||"—"} days</div>
                </div>
                <div>
                  <div className="qd-plabel">Discount</div>
                  <div className="qd-pval">—</div>
                </div>
                <div>
                  <div className="qd-plabel">Total Price</div>
                  <div className={"qd-pval qd-total-val"}>{panHasSell?fmtMoney(panSell*panQty):"—"}</div>
                </div>
              </div>
              </div>
              {/* Crossed items — outside the bordered box so .qd-li stays compact and doesn't page-break */}
              {crossedItems.length>0&&(
                <div style={{padding:"4px 44px 8px",fontSize:12}}>
                  <div className="qd-crossed-title" style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4,color:C.muted,marginBottom:4}}>Crossed / Superseded — Alternate Products Used</div>
                  {crossedItems.map((item,i)=>(
                    <div key={item.id||i} style={{fontSize:9,color:C.sub,marginBottom:1}}>
                      {i+1}. <span style={{color:C.muted}}>Scanned:</span> <strong>{item.crossedFrom}</strong> <span style={{color:C.muted}}> → Replaced with:</span> <strong>{item.partNumber}</strong>{item.description?<span style={{color:C.muted}}> ({item.description})</span>:null}
                    </div>
                  ))}
                </div>
              )}
              </div>);
            })}
          </div>

          {/* Validity Notice + Totals — kept together on same page */}
          {(()=>{
            const totalPrice=(project.panels||[]).reduce((s,pan)=>s+computePanelSellPrice(pan)*(pan.lineQty??1),0);
            const hasTotalPrice=totalPrice>0;
            return(
          <div style={{breakInside:"avoid",pageBreakInside:"avoid"}}>
          <div style={{padding:"8px 44px",fontSize:11,color:C.muted,lineHeight:1.6,fontStyle:"italic",borderTop:`2px solid ${C.border}`,marginTop:8}}>
            Budgetary quotes are provided for planning purposes only and do not represent a firm or binding price. Firm quoted prices are valid for 30 days from the date of issue unless otherwise noted. All prices are subject to change without notice and do not constitute a binding contract until a purchase order is accepted and confirmed by Matrix Systems. Lead times and material availability are estimated and subject to supplier confirmation at time of order.
          </div>
          <div className="qd-totals-bar">
            <div className="qd-totals-box">
              <div className="qd-totals-row"><span>Subtotal</span><span>{hasTotalPrice?fmtMoney(totalPrice):"—"}</span></div>
              <div className="qd-totals-row"><span>Tax</span><span>$0</span></div>
              <div className="qd-totals-row qd-grand"><span>Total</span><span className="qd-amt">{hasTotalPrice?fmtMoney(totalPrice):"—"}</span></div>
              {isProjectBudgetary&&<div style={{textAlign:"center",padding:"6px 0",fontSize:14,fontWeight:800,color:C.red,letterSpacing:2,textTransform:"uppercase"}}>BUDGETARY</div>}
            </div>
          </div>
          </div>);
          })()}

          {/* Footer Info */}
          <div className="qd-footer-info">
            <div>
              <div className="qd-footer-label">Salesperson</div>
              <div className="qd-footer-value">{q.salesperson||"—"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="qd-footer-label">Prices Valid Until</div>
              <div className="qd-footer-value"><input value={q.validUntil||""} onChange={e=>setQ({validUntil:e.target.value})} placeholder={defaultValidUntil} style={{...qInp({textAlign:"right",color:C.red,fontWeight:500})}}/></div>
            </div>
          </div>

          {/* Bottom Bar — hidden in print, replaced by fixed qd-print-footer */}
          <div className="qd-bottom-bar">
            <div className="qd-foot-left"><strong>Matrix Systems</strong><br/>5591 Leo Park Rd · West Jordan, UT 84081</div>
            <div className="qd-foot-right">(801) 930-9492<br/>sales@matrixpci.com</div>
          </div>
          <div className="qd-continued" style={{textAlign:"center",fontStyle:"italic",fontSize:10,color:C.muted,padding:"8px 0",display:"none"}}>continued on next page...</div>
        </div>

        {/* ═══ QUESTIONS FOR CUSTOMER (if any on_quote) ═══ */}
        {(()=>{const onQ=(project.panels||[]).flatMap(p=>(p.engineeringQuestions||[]).filter(q=>q.status==="on_quote"));
          return onQ.length>0?React.createElement("div",{className:"qd-page"},
            React.createElement("div",{className:"qd-header-cont"},
              React.createElement("div",{className:"qd-hc-name"},"Matrix Systems"),
              React.createElement("div",{className:"qd-hc-right"},(q.date||today)+"\nPage 2 of "+((project.panels||[]).some(p=>(p.engineeringQuestions||[]).some(eq=>eq.status==="on_quote"))?3:2))
            ),
            React.createElement("div",{style:{padding:"24px 44px"}},
              React.createElement("div",{style:{fontSize:16,fontWeight:700,color:C.text,marginBottom:4,textTransform:"uppercase",letterSpacing:1,textAlign:"center"}},"Questions for Customer"),
              React.createElement("div",{style:{fontSize:11,color:C.muted,textAlign:"center",marginBottom:20}},"The following items require clarification before final quote acceptance."),
              React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:12}},
                onQ.map((eq,i)=>React.createElement("div",{key:eq.id||i,style:{padding:"10px 14px",border:`1px solid ${C.border}`,borderRadius:6}},
                  React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:4}},
                    React.createElement("span",{style:{fontSize:10,fontWeight:700,color:eq.severity==="critical"?C.red:C.yellow,textTransform:"uppercase"}},eq.severity),
                    React.createElement("span",{style:{fontSize:10,color:C.muted,fontWeight:600}},eq.category)
                  ),
                  React.createElement("div",{style:{fontSize:12,color:C.text,lineHeight:1.6}},String(i+1)+". "+eq.question),
                  React.createElement("div",{style:{marginTop:6,borderTop:`1px dashed ${C.border}`,paddingTop:6}},
                    React.createElement("span",{style:{fontSize:10,color:C.muted}},"Answer: "),
                    React.createElement("span",{style:{borderBottom:`1px solid ${C.border}`,display:"inline-block",minWidth:200,fontSize:11}}," ")
                  )
                ))
              )
            ),
            React.createElement("div",{className:"qd-footer"},
              React.createElement("div",{className:"qd-foot-left"},"Matrix Systems, LLC"),
              React.createElement("div",{className:"qd-foot-right"},"(801) 930-9492",React.createElement("br"),"sales@matrixpci.com")
            ),
            React.createElement("div",{className:"qd-continued",style:{textAlign:"center",fontStyle:"italic",fontSize:10,color:C.muted,padding:"8px 0",display:"none"}},"continued on next page...")
          ):null;
        })()}

        {/* ═══ PAGE 2: TERMS & CONDITIONS ═══ */}
        <div className="qd-page">
          <div className="qd-header-cont">
            <div className="qd-hc-name">Matrix Systems</div>
            {(()=>{const hasEq=(project.panels||[]).some(p=>(p.engineeringQuestions||[]).some(eq=>eq.status==="on_quote"));const totalPages=1+(hasEq?1:0)+1;return <div className="qd-hc-right">{q.date||today}<br/>Page {totalPages} of {totalPages}</div>;})()}
          </div>

          <div className="qd-tc">
            <div className="qd-tc-title">Standard Terms and Conditions of Sale</div>
            <div className="qd-tc-sub">Matrix Systems, LLC</div>
            <div className="qd-tc-body">
              {(()=>{
                const raw=_appCtx.termsAndConditions||"";
                if(!raw.trim())return <div className="qd-tc-item"><p style={{fontStyle:"italic",color:C.muted}}>No Terms & Conditions configured. Go to Settings to add your T&C.</p></div>;
                // Pre-process: split sections that are crammed onto the same line
                // Insert newline before patterns like "2." or "12." that appear mid-text (preceded by space or sentence-ending punctuation)
                const preprocessed=raw.replace(/(\D)(\d{1,2})[.\)]\s*([A-Z])/g,function(m,pre,num,letter){return pre+"\n"+num+". "+letter;});
                const lines=preprocessed.split("\n");
                const sections=[];
                let current=null;
                for(const line of lines){
                  const trimmed=line.trim();
                  if(!trimmed)continue;
                  // Detect section start: "1. Title" or "1) Title" or "1. Title: body" or "Section Title: body"
                  const numMatch=trimmed.match(/^(\d+)[.\)]\s*(.+)/);
                  if(numMatch){
                    if(current)sections.push(current);
                    const rest=numMatch[2];
                    const colonIdx=rest.indexOf(":");
                    if(colonIdx>0&&colonIdx<60){
                      current={num:parseInt(numMatch[1]),title:`${numMatch[1]}. ${rest.slice(0,colonIdx).trim()}`,body:rest.slice(colonIdx+1).trim()};
                    }else{
                      current={num:parseInt(numMatch[1]),title:`${numMatch[1]}. ${rest.trim()}`,body:""};
                    }
                  }else if(!current){
                    // Non-numbered line before any section — treat as standalone
                    const colonMatch=trimmed.match(/^([^:]{3,60}):\s*(.+)$/);
                    if(colonMatch)sections.push({num:9999+sections.length,title:colonMatch[1],body:colonMatch[2]});
                    else sections.push({num:9999+sections.length,title:"",body:trimmed});
                  }else{
                    // Continuation line — append to current section body
                    current.body+=(current.body?" ":"")+trimmed;
                  }
                }
                if(current)sections.push(current);
                // Sort by section number
                sections.sort((a,b)=>a.num-b.num);
                return sections.map((s,i)=>(
                  <div key={i} className="qd-tc-item">
                    {s.title&&<h4>{s.title}</h4>}
                    {s.body&&<p>{s.body}</p>}
                  </div>
                ));
              })()}
            </div>
          </div>

          <div className="qd-bottom-bar">
            <div className="qd-foot-left"><strong>Matrix Systems</strong><br/>5591 Leo Park Rd · West Jordan, UT 84081</div>
            <div className="qd-foot-right">(801) 930-9492<br/>sales@matrixpci.com</div>
          </div>
        </div>

      </div>
      </div>}
    </div>
  );
}

// ── PLACEHOLDER TAB ──
function PlaceholderTab({icon,title,desc,coming}){
  return(
    <div style={{textAlign:"center",padding:"60px 20px",color:C.muted,maxWidth:520,margin:"0 auto"}}>
      <div style={{fontSize:52,marginBottom:16,opacity:0.3}}>{icon}</div>
      <div style={{fontSize:20,fontWeight:700,color:C.sub,marginBottom:10}}>{title}</div>
      <div style={{fontSize:14,lineHeight:1.8,marginBottom:28}}>{desc}</div>
      <div style={{textAlign:"left",display:"inline-block"}}>
        {coming.map((c,i)=>(
          <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:10,fontSize:13}}>
            <span style={{color:C.accent,marginTop:1}}>◦</span>
            <span style={{color:C.sub}}>{c}</span>
          </div>
        ))}
      </div>
      <div style={{marginTop:28,display:"inline-block",background:C.accentDim,color:C.accent,borderRadius:20,padding:"4px 16px",fontSize:12,fontWeight:700,letterSpacing:0.5}}>COMING SOON</div>
    </div>
  );
}

// ── TITLE BLOCK EXTRACTOR ──
async function extractTitleBlock(dataUrl){
  if(!_apiKey||!dataUrl)return null;
  try{
    const text=await apiCall({
      max_tokens:200,
      messages:[{role:"user",content:[
        {type:"image",source:{type:"base64",media_type:"image/jpeg",data:dataUrl.split(",")[1]}},
        {type:"text",text:`Look at the title block of this engineering drawing (typically in the bottom-right corner).
Extract exactly three fields:
- Drawing number (labeled DWG NO., DRAWING NO., JOB NO., DWG #, SHEET, or similar)
- Drawing title or description (the main name/description of what is shown)
- Revision (labeled REV, REVISION, REV NO., REV LETTER — typically a letter like A, B, C or a number; empty string if not shown)
Return ONLY valid JSON, no extra text: {"drawingNo":"...","drawingDesc":"...","drawingRev":"..."}`}
      ]}]
    });
    const m=text.replace(/```json|```/g,"").trim().match(/\{[\s\S]*?\}/);
    if(!m)return null;
    return JSON.parse(m[0]);
  }catch(e){return null;}
}

// ── CPD PANEL METADATA EXTRACTION ──
// Analyzes ALL pages in batches of 8, merges results into one metadata object
async function extractPanelMetadata(pages){
  if(!_apiKey||!pages||!pages.length)return null;
  const allPages=pages.filter(p=>(p.dataUrl||p.storageUrl));
  if(!allPages.length)return null;
  const BATCH=8;
  const prompt=`Analyze these control panel engineering drawings (schematics, layouts, title blocks, BOM pages — all page types). Extract every detail you can find.
Return ONLY valid JSON (no markdown):
{
  "panelType": "e.g. Motor Control Panel / PLC Panel / Junction Box / Heater Control / Relay Panel / MCC / Automation Panel",
  "controlledEquipment": "comma-separated list of all equipment mentioned e.g. Clarifier, Thickener, Kiln, Generator, Pump, Conveyor, Trash Rake, Heater, Fan",
  "voltages": {
    "lineVoltage": "e.g. 480V 3PH or 208V 3PH or unknown",
    "controlVoltage": "e.g. 120VAC or 24VDC or unknown",
    "motorVoltage": "e.g. 460V or unknown"
  },
  "plcBrand": "e.g. Allen-Bradley, Siemens, AutomationDirect, or none/unknown",
  "enclosureType": "e.g. NEMA 12, NEMA 4X, or unknown",
  "inputCount": 0,
  "outputCount": 0,
  "motorCount": 0,
  "additionalNotes": "any other relevant details: customer name, project name, location, special requirements, certifications required, environmental conditions"
}`;
  try{
    // Ensure all pages have dataUrl
    const ensured=await Promise.all(allPages.map(ensureDataUrl));
    const withData=ensured.filter(p=>p.dataUrl);
    if(!withData.length)return null;
    // Process in batches, collect partial results
    const partials=[];
    for(let i=0;i<withData.length;i+=BATCH){
      const batch=withData.slice(i,i+BATCH);
      const imageContents=batch.map(p=>({
        type:"image",source:{type:"base64",media_type:"image/jpeg",data:p.dataUrl.split(",")[1]}
      }));
      try{
        const resp=await apiCall({
          max_tokens:700,
          messages:[{role:"user",content:[...imageContents,{type:"text",text:prompt}]}]
        });
        const raw=resp.content[0].text.replace(/```json|```/g,'').trim();
        const m=raw.match(/\{[\s\S]*\}/);
        if(m)partials.push(JSON.parse(m[0]));
      }catch(e){}
    }
    if(!partials.length)return null;
    // Merge: prefer first non-unknown value for each field, sum counts, combine equipment lists
    const merged=partials[0];
    for(let i=1;i<partials.length;i++){
      const p=partials[i];
      if((!merged.panelType||merged.panelType==='unknown')&&p.panelType)merged.panelType=p.panelType;
      if(p.controlledEquipment){
        const existing=new Set((merged.controlledEquipment||'').split(/,\s*/).filter(Boolean));
        p.controlledEquipment.split(/,\s*/).filter(Boolean).forEach(e=>existing.add(e.trim()));
        merged.controlledEquipment=[...existing].join(', ');
      }
      if((!merged.voltages?.lineVoltage||merged.voltages.lineVoltage==='unknown')&&p.voltages?.lineVoltage&&p.voltages.lineVoltage!=='unknown')merged.voltages={...merged.voltages,...p.voltages};
      if((!merged.plcBrand||merged.plcBrand==='unknown')&&p.plcBrand&&p.plcBrand!=='unknown')merged.plcBrand=p.plcBrand;
      if((!merged.enclosureType||merged.enclosureType==='unknown')&&p.enclosureType&&p.enclosureType!=='unknown')merged.enclosureType=p.enclosureType;
      if(p.inputCount>0&&(!merged.inputCount||merged.inputCount<p.inputCount))merged.inputCount=p.inputCount;
      if(p.outputCount>0&&(!merged.outputCount||merged.outputCount<p.outputCount))merged.outputCount=p.outputCount;
      if(p.motorCount>0&&(!merged.motorCount||merged.motorCount<p.motorCount))merged.motorCount=p.motorCount;
      if(p.additionalNotes&&p.additionalNotes!==merged.additionalNotes){
        merged.additionalNotes=[merged.additionalNotes,p.additionalNotes].filter(Boolean).join(' | ');
      }
    }
    return merged;
  }catch(e){return null;}
}

export default QuoteTab;

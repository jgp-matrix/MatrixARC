import { useState, useEffect, useRef } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import { _pricingConfig, _appCtx } from '@/core/globals';

// ─── Inline stubs for functions not yet extracted ────────────────────────────

function computeLaborEstimate(project: any): any {
  // stub — real implementation lives in monolith
  return { totalHours: 0, totalCost: 0 };
}

function isPanelBudgetary(panel: any): boolean {
  // stub — real implementation lives in monolith
  const bom = panel.bom || [];
  return bom.some((r: any) => !r.priceSource || r.priceSource === 'ai');
}

function computeBomHash(panels: any[]): string {
  // stub — real implementation lives in monolith
  try {
    return JSON.stringify((panels || []).map((p: any) => (p.bom || []).map((r: any) => r.partNumber + ':' + r.qty + ':' + r.unitPrice))).slice(0, 64);
  } catch { return ''; }
}

// ─── QuoteTab Component ──────────────────────────────────────────────────────

function QuoteTab({project,onUpdate}: any){
  const [quoteTab,setQuoteTab]=useState("formal");
  const pr=project.pricing||{};
  const bom=project.bom||[];
  // Use pre-computed labor from QuoteView (sums each panel individually, preserving overrides)
  // Fall back to computing from project directly for single-panel or non-aggregated use
  const laborEst=project._quoteLabor||computeLaborEstimate(project);
  const laborHours=laborEst.totalHours;
  const laborRate=pr.laborRate??45;
  const markup=pr.markup??30;
  const contingencyBOM=pr.contingencyBOM??_pricingConfig.contingencyBOM;
  const contingencyConsumables=pr.contingencyConsumables??_pricingConfig.contingencyConsumables;
  const materialCost=bom.reduce((s: number,r: any)=>s+(r.unitPrice||0)*(r.qty||1),0);
  const laborCost=laborEst.totalCost;
  const grandTotal=materialCost+laborCost+contingencyBOM+contingencyConsumables;
  const sellPrice=grandTotal*(1+markup/100);
  const hasSellPrice=sellPrice>0;

  // BUDGETARY: true if any panel has at least one BOM item not yet confirmed in BC
  const isProjectBudgetary=(project.panels||[project]).some(isPanelBudgetary);

  const q=project.quote||{};
  function setQ(updates: any){onUpdate({...project,quote:{...q,...updates}});}

  const today=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const defaultValidUntil=new Date(Date.now()+30*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const fmtMoney=(n: number)=>"$"+n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

  const defaultTerms="Standard Payment Terms for Panel Builds (Order Total over $30,000): 30% ARO; 40% @ Procurement, 30% @ Readiness To Ship\nStandard Payment Terms for Engineering / Programming: 50% ARO / 50% due @ Completion of Work";
  const qInp=(x: any={})=>({background:"transparent",border:"none",borderBottom:"1px dashed #cbd5e1",outline:"none",color:"#1e293b",fontSize:"inherit",fontFamily:"inherit",padding:"1px 2px",width:"100%",...x});

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
          <button onClick={()=>{window.print();const hash=computeBomHash(project.panels);onUpdate({...project,lastPrintedBomHash:hash,lastQuotePrintedAt:Date.now(),quoteRevAtPrint:project.quoteRev||0});}} style={btn(C.accent,"#fff",{fontSize:14,padding:"10px 24px"})}>🖨 Print / Save PDF</button>
        </div>
        {(()=>{
          const fld=(label: string,key: string,ph: string,w?: number)=>(
            <div key={key} style={{display:"flex",flexDirection:"column",gap:2,minWidth:w||180,flex:1}}>
              <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.8px",color:C.muted}}>{label}</label>
              <input value={q[key]||""} onChange={(e: any)=>setQ({[key]:e.target.value})} placeholder={ph}
                style={{background:(C as any).cardBg||"#181825",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text||"#e8e8f0",fontSize:13,outline:"none"}}/>
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
                {fld("Supply Voltage","supplyVoltage","480VAC",120)}
                {fld("Control Voltage","controlVoltage","120VAC",120)}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                {fld("Quantity","qty","1.00",80)}
                {fld("Lead Time (days)","leadTime","—",100)}
                {fld("Prices Valid Until","validUntil",defaultValidUntil,160)}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.8px",color:C.muted}}>Payment Terms Text</label>
                <textarea value={q.termsText!=null?q.termsText:defaultTerms} onChange={(e: any)=>setQ({termsText:e.target.value})} rows={2}
                  style={{background:(C as any).cardBg||"#181825",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text||"#e8e8f0",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:2}}>
                <label style={{fontSize:10,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.8px",color:C.muted}}>Line Item Notes</label>
                <textarea value={q.lineNotes||""} onChange={(e: any)=>setQ({lineNotes:e.target.value})} placeholder="e.g. Grey duct quoted instead of white." rows={1}
                  style={{background:(C as any).cardBg||"#181825",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",color:C.text||"#e8e8f0",fontSize:13,outline:"none",resize:"vertical",fontFamily:"inherit"}}/>
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
          <div className="qd-foot-right">(801) 930-9492<br/>info@matrixpci.com</div>
        </div>
        <div className="qd-page">

          {/* Header */}
          <div className="qd-header">
            <div className="qd-brand">
              <div style={{fontSize:43,lineHeight:1}}>⚙</div>
              <div>
                <h1>Matrix Systems</h1>
                <div className="qd-addr">5591 Leo Park Road<br/>West Jordan, UT 84081 US</div>
              </div>
            </div>
            <div className="qd-hdr-right">
              <div className="qd-qlabel">{isProjectBudgetary?"BUDGETARY QUOTE":"Quote"}</div>
              <div className="qd-qnum"><input value={q.number||""} onChange={(e: any)=>setQ({number:e.target.value})} placeholder="MTX-Q2#####" style={{...qInp({width:220,fontSize:28,fontWeight:800,textAlign:"right",letterSpacing:"-0.5px"})}}/></div>
              <div style={{textAlign:"right",fontSize:13,fontWeight:700,color:(project.quoteRev||0)>(project.quoteRevAtPrint||0)?"#f59e0b":"#64748b",letterSpacing:0.3}}>Rev {String(project.quoteRev||0).padStart(2,'0')}{(project.quoteRev||0)>(project.quoteRevAtPrint||0)?" — unsent":""}</div>
              <div className="qd-qmeta">{q.date||today}<br/>Page 1 of 2</div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="qd-info-grid">
            <div>
              <div className="qd-info-label">Attention</div>
              <div className="qd-info-name"><input value={q.contact||""} onChange={(e: any)=>setQ({contact:e.target.value})} placeholder="Contact name" style={qInp({fontWeight:700,fontSize:18})}/></div>
              <div className="qd-info-detail">
                <strong><input value={q.company||""} onChange={(e: any)=>setQ({company:e.target.value})} placeholder="Company" style={qInp({fontWeight:600,color:"#0f172a",marginBottom:2})}/></strong>
                <input value={q.address||""} onChange={(e: any)=>setQ({address:e.target.value})} placeholder="Address" style={qInp({marginBottom:2})}/>
                <div>Phone: <input value={q.phone||""} onChange={(e: any)=>setQ({phone:e.target.value})} placeholder="—" style={{...qInp({display:"inline",width:"60%"})}}/></div>
              </div>
            </div>
            <div>
              <div className="qd-info-label">Prepared By</div>
              <div className="qd-info-name"><input value={q.salesperson||""} onChange={(e: any)=>setQ({salesperson:e.target.value})} placeholder="Salesperson name" style={qInp({fontWeight:700,fontSize:18})}/></div>
              <div className="qd-info-detail">
                Salesperson<br/>
                <input value={q.salesEmail||""} onChange={(e: any)=>setQ({salesEmail:e.target.value})} placeholder="email@matrixpci.com" onKeyDown={(e: any)=>{if(e.key==='Enter')e.target.blur();}} style={qInp({marginBottom:2})}/>
                <input value={q.salesPhone||""} onChange={(e: any)=>setQ({salesPhone:e.target.value})} placeholder="(___) ___-____" style={qInp({})}/>
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="qd-proj">
            {[
              ["Project #",q.projectNumber,(v: string)=>setQ({projectNumber:v}),project.name],
              ["Req. Ship Date",q.requestedShipDate||(project.panels||[]).find((p: any)=>p.requestedShipDate)?.requestedShipDate||"",(v: string)=>setQ({requestedShipDate:v}),"YYYY-MM-DD"],
              ["Pmt. Terms",q.paymentTerms,(v: string)=>setQ({paymentTerms:v}),"Net 30 Days"],
              ["Shipping Method",q.shippingMethod,(v: string)=>setQ({shippingMethod:v}),"Customer Handles Shipping"],
            ].map(([label,val,setter,ph]: any)=>(
              <div key={label}>
                <div className="qd-proj-label">{label}</div>
                <div className="qd-proj-value"><input value={val||""} onChange={(e: any)=>setter(e.target.value)} placeholder={ph} style={qInp({fontSize:17,fontWeight:600})}/></div>
              </div>
            ))}
          </div>

          {/* Terms Banner */}
          <div className="qd-terms">
            <textarea value={q.termsText!=null?q.termsText:defaultTerms} onChange={(e: any)=>setQ({termsText:e.target.value})} rows={3} style={{...qInp({display:"block",width:"100%",resize:"vertical",fontSize:"14px",lineHeight:"1.7",color:"#334155",borderBottom:"none"})}}/>
            <div className="qd-tnote"><strong>All quotes expire 30 days from date of issue unless otherwise noted. Prices subject to change without notice.</strong></div>
          </div>

          {/* Line Items */}
          <div className="qd-items">
            <div className="qd-items-heading">Line Items</div>
            <div className="qd-li">
              <div className="qd-li-hdr">
                <span className="qd-li-num">Line 1</span>
                <span className="qd-li-part">Part #: <input value={q.panelId||""} onChange={(e: any)=>setQ({panelId:e.target.value})} placeholder={project.name} style={{...qInp({display:"inline",width:200,fontWeight:700,fontSize:14})}}/></span>
              </div>
              <div className="qd-li-body">
                <div>
                  <div className="qd-li-title"><input value={q.description||""} onChange={(e: any)=>setQ({description:e.target.value})} placeholder={project.name} style={qInp({fontWeight:600,fontSize:16})}/></div>
                  <div className="qd-specs">
                    {[
                      ["Project",q.projectNumber,(v: string)=>setQ({projectNumber:v}),project.name],
                      ["Drawing Rev",q.drawingRev,(v: string)=>setQ({drawingRev:v}),"A"],
                      ["Panel ID",q.panelId,(v: string)=>setQ({panelId:v}),project.name],
                      ["Plant Name",q.plantName,(v: string)=>setQ({plantName:v}),""],
                      ["Supply Voltage",q.supplyVoltage,(v: string)=>setQ({supplyVoltage:v}),"480VAC"],
                      ["Control Voltage",q.controlVoltage,(v: string)=>setQ({controlVoltage:v}),"120VAC"],
                    ].map(([label,val,setter,ph]: any)=>(
                      <div key={label} className="qd-spec">
                        <b>{label}:</b>{" "}
                        <input value={val||""} onChange={(e: any)=>setter(e.target.value)} placeholder={ph} style={{...qInp({display:"inline",width:"55%",fontSize:13})}}/>
                      </div>
                    ))}
                  </div>
                  <div className="qd-li-notes">
                    <span>NOTES: </span>
                    <textarea value={q.lineNotes||""} onChange={(e: any)=>setQ({lineNotes:e.target.value})} placeholder="e.g. Grey duct quoted instead of white." rows={1} style={{...qInp({display:"inline-block",width:"85%",resize:"vertical",fontSize:13,verticalAlign:"top",borderBottom:"none"})}}/>
                  </div>
                  {(()=>{
                    const crossedItems=(bom||[]).filter((r: any)=>r.isCrossed&&r.crossedFrom);
                    if(!crossedItems.length)return null;
                    return(
                      <div className="qd-crossed">
                        <div className="qd-crossed-title">Crossed / Superseded — Alternate Products Used</div>
                        {crossedItems.map((item: any,i: number)=>(
                          <div key={item.id||i} className="qd-crossed-row">
                            {i+1}. <span className="qd-muted">Scanned:</span> <strong>{item.crossedFrom}</strong> <span className="qd-muted">→ Replaced with:</span> <strong>{item.partNumber}</strong>{item.description?<span className="qd-muted"> ({item.description})</span>:null}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  {(()=>{
                    const formatCorrs=(bom||[]).filter((r: any)=>r.isCorrection&&(r.correctionType==='format'||r.correctionType==='formatting')&&r.correctionFrom);
                    if(!formatCorrs.length)return null;
                    return(
                      <div className="qd-crossed">
                        <div className="qd-crossed-title">Part Number Format Corrections</div>
                        {formatCorrs.map((item: any,i: number)=>(
                          <div key={item.id||i} className="qd-crossed-row">
                            {i+1}. <span className="qd-muted">{item.correctionType==='formatting'?'Formatting error:':'Extracted as:'}</span> <strong>{item.correctionFrom}</strong> <span className="qd-muted">→ Corrected to:</span> <strong>{item.partNumber}</strong>{item.description?<span className="qd-muted"> ({item.description})</span>:null}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Missing Data */}
              {(()=>{
                const v=project.validation;
                if(!v)return null;
                const lb=project.bom||[];
                const missing=(v.missingFromSchematic||[]).filter((i: any)=>lb.find((r: any)=>r.id===i.id)?.validationAction!=="ignored");
                const noId=(v.notTraceable||[]).filter((i: any)=>lb.find((r: any)=>r.id===i.id)?.validationAction!=="ignored");
                if(!missing.length&&!noId.length)return null;
                return(
                  <div className="qd-missing">
                    <div className="qd-missing-title">Missing Data</div>
                    {missing.length>0&&(
                      <div style={{marginBottom:2}}>
                        <div className="qd-missing-sub">In BOM — not found in schematic</div>
                        <table>
                          <thead><tr>{["Part Number","Description","Ref Tags"].map((h: string)=><th key={h}>{h}</th>)}</tr></thead>
                          <tbody>
                            {missing.map((item: any,i: number)=>(
                              <tr key={item.id||i}>
                                <td style={{color:"#64748b"}}>{item.partNumber||"—"}</td>
                                <td style={{color:"#334155"}}>{item.description||"—"}</td>
                                <td style={{color:"#94a3b8"}}>{item.notes||"—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {noId.length>0&&(
                      <div>
                        <div className="qd-missing-sub">No device ID (AS SHOWN — field verification required)</div>
                        <table>
                          <thead><tr>{["Part Number","Description","Qty"].map((h: string)=><th key={h}>{h}</th>)}</tr></thead>
                          <tbody>
                            {noId.map((item: any,i: number)=>(
                              <tr key={item.id||i}>
                                <td style={{color:"#64748b"}}>{item.partNumber||"—"}</td>
                                <td style={{color:"#334155"}}>{item.description||"—"}</td>
                                <td style={{color:"#94a3b8"}}>{item.qty||1}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Pricing Row */}
              <div className="qd-li-pricing">
                <div>
                  <div className="qd-plabel">Quantity</div>
                  <div className="qd-pval"><input value={q.qty||"1.00"} onChange={(e: any)=>setQ({qty:e.target.value})} onFocus={(e: any)=>e.target.select()} style={{...qInp({width:50,textAlign:"center",fontSize:14,fontWeight:600})}}/> EA</div>
                </div>
                <div>
                  <div className="qd-plabel">Unit Price</div>
                  <div className="qd-pval">{hasSellPrice?fmtMoney(sellPrice):"—"}</div>
                </div>
                <div>
                  <div className="qd-plabel">Lead Time</div>
                  <div className="qd-pval"><input value={q.leadTime||""} onChange={(e: any)=>setQ({leadTime:e.target.value})} placeholder="—" style={{...qInp({width:50,textAlign:"center",fontSize:14,fontWeight:600})}}/> days</div>
                </div>
                <div>
                  <div className="qd-plabel">Discount</div>
                  <div className="qd-pval">—</div>
                </div>
                <div>
                  <div className="qd-plabel">Total Price</div>
                  <div className={"qd-pval qd-total-val"}>{hasSellPrice?fmtMoney(sellPrice*(parseFloat(q.qty)||1)):"—"} {hasSellPrice&&<span style={{fontWeight:400,color:"#94a3b8"}}>*</span>}</div>
                </div>
              </div>
            </div>
            <div style={{fontSize:13,color:"#94a3b8",marginTop:-4,marginBottom:16}}>* Indicates which quantity price is included in the Total</div>
          </div>

          {/* Totals */}
          <div className="qd-totals-bar">
            <div className="qd-totals-box">
              <div className="qd-totals-row"><span>Subtotal</span><span>{hasSellPrice?fmtMoney(sellPrice*(parseFloat(q.qty)||1)):"—"}</span></div>
              <div className="qd-totals-row"><span>Tax</span><span>$0.00</span></div>
              <div className="qd-totals-row qd-grand"><span>Total</span><span className="qd-amt">{hasSellPrice?fmtMoney(sellPrice*(parseFloat(q.qty)||1)):"—"}</span></div>
            </div>
          </div>

          {/* Footer Info */}
          <div className="qd-footer-info">
            <div>
              <div className="qd-footer-label">Salesperson</div>
              <div className="qd-footer-value">{q.salesperson||"—"}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div className="qd-footer-label">Prices Valid Until</div>
              <div className="qd-footer-value"><input value={q.validUntil||""} onChange={(e: any)=>setQ({validUntil:e.target.value})} placeholder={defaultValidUntil} style={{...qInp({textAlign:"right",color:"#dc2626",fontWeight:500})}}/></div>
            </div>
          </div>

          {/* Bottom Bar — hidden in print, replaced by fixed qd-print-footer */}
          <div className="qd-bottom-bar">
            <div className="qd-foot-left"><strong>Matrix Systems</strong><br/>5591 Leo Park Rd · West Jordan, UT 84081</div>
            <div className="qd-foot-right">(801) 930-9492<br/>info@matrixpci.com</div>
          </div>
        </div>

        {/* QUESTIONS FOR CUSTOMER (if any on_quote) */}
        {(()=>{const onQ=(project.panels||[]).flatMap((p: any)=>(p.engineeringQuestions||[]).filter((eq: any)=>eq.status==="on_quote"));
          return onQ.length>0?(
            <div className="qd-page">
              <div className="qd-header-cont">
                <div className="qd-hc-name">Matrix Systems</div>
                <div className="qd-hc-right">{q.date||today}</div>
              </div>
              <div style={{padding:"24px 44px"}}>
                <div style={{fontSize:16,fontWeight:700,color:"#0f172a",marginBottom:4,textTransform:"uppercase",letterSpacing:1,textAlign:"center"}}>Questions for Customer</div>
                <div style={{fontSize:11,color:"#94a3b8",textAlign:"center",marginBottom:20}}>The following items require clarification before final quote acceptance.</div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {onQ.map((eq: any,i: number)=>(
                    <div key={eq.id||i} style={{padding:"10px 14px",border:"1px solid #e2e8f0",borderRadius:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                        <span style={{fontSize:10,fontWeight:700,color:eq.severity==="critical"?"#dc2626":"#d97706",textTransform:"uppercase"}}>{eq.severity}</span>
                        <span style={{fontSize:10,color:"#64748b",fontWeight:600}}>{eq.category}</span>
                      </div>
                      <div style={{fontSize:12,color:"#1e293b",lineHeight:1.6}}>{String(i+1)+". "+eq.question}</div>
                      <div style={{marginTop:6,borderTop:"1px dashed #e2e8f0",paddingTop:6}}>
                        <span style={{fontSize:10,color:"#94a3b8"}}>Answer: </span>
                        <span style={{borderBottom:"1px solid #cbd5e1",display:"inline-block",minWidth:200,fontSize:11}}> </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="qd-footer">
                <div className="qd-foot-left">Matrix Systems, LLC</div>
                <div className="qd-foot-right">(801) 930-9492<br/>info@matrixpci.com</div>
              </div>
            </div>
          ):null;
        })()}

        {/* PAGE 2: TERMS & CONDITIONS */}
        <div className="qd-page">
          <div className="qd-header-cont">
            <div className="qd-hc-name">Matrix Systems</div>
            <div className="qd-hc-right">{q.date||today}<br/>Page 2 of 2</div>
          </div>

          <div className="qd-tc">
            <div className="qd-tc-title">Standard Terms and Conditions of Sale</div>
            <div className="qd-tc-sub">Matrix Systems, LLC</div>
            <div className="qd-tc-body">
              <div className="qd-tc-item"><h4>1. Definitions</h4><p>(a) "Matrix" shall mean Matrix Systems LLC. (b) "Buyer" shall mean the purchaser, its representatives and/or agents. (c) "Product" shall mean any equipment, Software and/or Firmware, machinery, parts, materials, products or services provided for in this proposal. (d) "Software and/or Firmware" shall mean the programming for the computer component of the Product. (e) "Proprietary Data" shall mean engineering, drawings, specifications and/or instructions created by Matrix.</p></div>
              <div className="qd-tc-item"><h4>2. Prevailing Documentation</h4><p>(a) Matrix's proposal, including these terms and conditions, shall constitute the contract. No course of dealing or usage of trade may add or amend the terms. (b) These terms embody the entire understanding between Matrix and Buyer. The Contract may only be amended by a written Change Order. (c) Unless otherwise stated, the proposal is valid for thirty (30) days. (d) Matrix's obligation shall not commence until any required down payment and Letter of Credit have been received.</p></div>
              <div className="qd-tc-item"><h4>3. Engineering and Drawings</h4><p>(a) Buyer shall furnish Matrix with all information and drawings on which performance is dependent. (b) Matrix will submit drawings for Buyer's approval if required. (c) Unless Buyer advises otherwise within fourteen (14) days, drawings are deemed approved. (d) Matrix will furnish electronic copies in PDF format only. (e) Changes may result in price and delivery adjustments. (f) All Proprietary Data remains the sole property of Matrix.</p></div>
              <div className="qd-tc-item"><h4>4. Confidential Information</h4><p>All drawings, specifications, and information provided by Matrix shall remain Matrix's exclusive property and shall not be disclosed by Buyer to any third party. Matrix grants Buyer a non-exclusive license to utilize Proprietary Data for design, installation, and maintenance of the Product.</p></div>
              <div className="qd-tc-item"><h4>5. Title and Risk of Loss</h4><p>Matrix shall retain title to the Product until full purchase price has been paid. Risk of loss passes to Buyer at the delivery point stated in the proposal.</p></div>
              <div className="qd-tc-item"><h4>6. Change Orders</h4><p>Either party may request changes via written Change Order, provided changes are within scope, do not impair Matrix's obligations, and do not adversely affect design integrity. Matrix shall submit proposed adjustments within a reasonable time.</p></div>
              <div className="qd-tc-item"><h4>7. Safety Devices</h4><p>Matrix shall not be required to furnish safety devices except those stated in the proposal. Buyer shall install and operate Product in accordance with all applicable safety laws and regulations.</p></div>
              <div className="qd-tc-item"><h4>8. Weights, Packing and Freight</h4><p>Weights are estimated and subject to fluctuation. Product will be packed per Matrix's standard commercial practice. Freight will be invoiced to and paid by Buyer.</p></div>
              <div className="qd-tc-item"><h4>9. Permits, Laws and Regulations</h4><p>Buyer will secure all construction, operating, environmental and similar permits and will pay for all governmental charges and fees necessary for installation or operation of the Product.</p></div>
              <div className="qd-tc-item"><h4>10. Inspection</h4><p>Buyer may inspect Product at mutually agreed times. Failure to inspect timely may delay progress and increase costs.</p></div>
              <div className="qd-tc-item"><h4>11. Delivery / Delay / Extension of Time</h4><p>Delivery dates represent Matrix's best estimate and are not guaranteed. If delivery is prevented or postponed by Buyer or Force Majeure, Product may be stored at Buyer's expense. Force Majeure includes fires, Acts of God, war, strikes, and unavailability of parts.</p></div>
              <div className="qd-tc-item"><h4>12. Short Shipments</h4><p>Claims for short shipments are excluded unless made in writing within a reasonable time after delivery.</p></div>
              <div className="qd-tc-item"><h4>13. Returned Product</h4><p>Product may not be returned except by prior written approval of Matrix.</p></div>
              <div className="qd-tc-item"><h4>14. Services</h4><p>Product shall be installed, erected and commissioned by Buyer at Buyer's expense unless otherwise specified.</p></div>
              <div className="qd-tc-item"><h4>15. Taxes</h4><p>Buyer shall reimburse Matrix for all taxes, duties, and charges in connection with production, sale, transportation, and use of Product.</p></div>
              <div className="qd-tc-item"><h4>16. Terms of Payment</h4><p>Invoices are payable per proposal terms. If payment is not current, interest will be charged at 5% above the prime rate of Citibank, N.A., or the maximum legal rate, whichever is lower.</p></div>
              <div className="qd-tc-item"><h4>17. Limited Warranty</h4><p>Matrix warrants Product free from defects in labor and workmanship for one (1) year from date of shipment. Warranty excludes ordinary wear and tear, improper loading of software, corrosion, erosion, unauthorized modifications, or application outside design limitations. EXCEPT FOR THE EXPRESS WARRANTY STATED HEREIN, MATRIX DISCLAIMS ALL OTHER WARRANTIES, WHETHER EXPRESS, IMPLIED, OR STATUTORY.</p></div>
              <div className="qd-tc-item"><h4>18. Patent Indemnification</h4><p>Matrix shall defend and hold harmless Buyer against claims for infringement of valid US patents with respect to the Product. Buyer must notify Matrix within ten (10) days of any such claim.</p></div>
              <div className="qd-tc-item"><h4>19. Indemnification</h4><p>Each party shall indemnify the other from third-person claims for damages directly resulting from personal injury or death and damage to tangible property caused by the indemnifying party's negligence or willful misconduct.</p></div>
              <div className="qd-tc-item"><h4>20. Insurance</h4><p>Matrix shall maintain Workers' Compensation, Commercial General Liability ($1M per occurrence / $2M aggregate), and Automobile Liability Insurance ($1M per occurrence).</p></div>
              <div className="qd-tc-item"><h4>21. Termination and Suspension</h4><p>Buyer may terminate if Matrix becomes bankrupt or materially breaches the Contract. Matrix may suspend for Buyer's non-payment. Cancellation charges: 25% before engineering submittals; 100% after authorization to proceed with manufacturing.</p></div>
              <div className="qd-tc-item"><h4>22. Limitation of Liability</h4><p>Neither party shall be liable for loss of profits, anticipated revenue, or consequential damages. Matrix's maximum aggregate liability shall be limited to ten percent (10%) of the Contract price and shall terminate upon expiration of the warranty period.</p></div>
              <div className="qd-tc-item"><h4>23. Governing Law and Dispute Resolution</h4><p>The Contract shall be governed by Utah law. Disputes shall be resolved through binding arbitration by the AAA in Salt Lake City, Utah. The prevailing party shall be awarded attorneys' fees.</p></div>
              <div className="qd-tc-item"><h4>24–30. Additional Provisions</h4><p><b>24. Notice:</b> Service via mail, courier, fax, or email. <b>25. Assignment:</b> Neither party may assign without consent. <b>26. Waiver of Breach:</b> No waiver constitutes waiver of other breaches. <b>27. Independent Contractor:</b> Matrix is an independent contractor. <b>28. Severability:</b> Invalid provisions shall be adjusted equitably. <b>29. Survival:</b> Articles 4, 15, 18, 19, 22, 23, and 26 survive termination. <b>30. License Agreements:</b> Buyer agrees to execute Matrix's software license agreements prior to delivery.</p></div>
              <div className="qd-tc-item"><h4>Supply Chain Statement</h4><p>Matrix cannot confirm or commit to any delivery dates or be liable for any liquidated damages as a result. Please refer to Matrix Supply Chain Statement for further details.</p></div>
            </div>
          </div>

          <div className="qd-bottom-bar">
            <div className="qd-foot-left"><strong>Matrix Systems</strong><br/>5591 Leo Park Rd · West Jordan, UT 84081</div>
            <div className="qd-foot-right">(801) 930-9492<br/>info@matrixpci.com</div>
          </div>
        </div>

      </div>
      </div>}
    </div>
  );
}

export default QuoteTab;

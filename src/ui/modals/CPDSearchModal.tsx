// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function CPDSearchModal({query,uid,panel,onClose,onImportBom}){
  const isQuoteMode=isBomQuoteAnalysis(query);
  const [phase,setPhase]=useState(isQuoteMode?"analyzeQuote":"thinking"); // thinking | result | error | analyzeQuote | quoteResult
  const [result,setResult]=useState(null);
  const [selected,setSelected]=useState(new Set());
  const [errorMsg,setErrorMsg]=useState("");
  const [quoteAnalysis,setQuoteAnalysis]=useState(null); // {quote,results,totalPanels,matchedCount}
  const [marginPct,setMarginPct]=useState(30);

  const [similarPanels,setSimilarPanels]=useState([]);

  // Find similar panels from CPD database
  useEffect(()=>{
    loadCPD(uid).then(cpd=>{
      const panels=cpd.panels||[];
      if(!panels.length)return;
      const q=query.toLowerCase();
      const scored=panels.map(p=>{
        let score=0;
        const haystack=((p.panelType||'')+(p.controlledEquipment||'')+(p.panelName||'')+(p.additionalNotes||'')).toLowerCase();
        q.split(/\s+/).forEach(word=>{if(word.length>2&&haystack.includes(word))score++;});
        // Bonus for voltage match
        const vLine=(p.voltages?.lineVoltage||'').toLowerCase();
        if(q.includes('480')&&vLine.includes('480'))score+=2;
        if(q.includes('208')&&vLine.includes('208'))score+=2;
        return{...p,_score:score};
      }).filter(p=>p._score>0).sort((a,b)=>b._score-a._score).slice(0,3);
      setSimilarPanels(scored);
    }).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(isQuoteMode)return; // handled by quote analysis effect
    let cancelled=false;
    async function run(){
      try{
        const cpd=await loadCPD(uid);
        // Build context from CPD catalog including panel metadata
        const topCategories={};
        (cpd.products||[]).forEach(p=>{topCategories[p.category]=(topCategories[p.category]||0)+1;});
        const panelCount=(cpd.panels||[]).length;
        const panelSummaries=(cpd.panels||[]).slice(-5).map(p=>`${p.panelType||'Panel'} for ${p.controlledEquipment||'unknown equipment'} (${p.specs?.motorCount||0} motors, PLC I/O: ${p.specs?.plcInputs||0}in/${p.specs?.plcOutputs||0}out, ${p.voltages?.lineVoltage||'unknown voltage'})`).join('; ');
        const catalogContext=panelCount>0
          ?`The system has cataloged ${panelCount} control panel(s). Recent panels: ${panelSummaries}. Common components: ${Object.entries(topCategories).map(([k,v])=>`${k} (${v} unique parts)`).join(', ')}.`
          :`No prior panel scans in the database yet — generating BOM from expert knowledge.`;

        const systemPrompt=`You are an expert industrial control panel designer specializing in UL508A panels. You have deep knowledge of PLCs (Allen-Bradley, Siemens, Automation Direct), motor control, field instruments, and control panel BOM creation.

${catalogContext}

When given a panel description, generate a realistic preliminary Bill of Materials. Return ONLY valid JSON array, no markdown, no explanation. Each item: {"partNumber":"","description":"","qty":1,"manufacturer":"","category":"","unitPrice":0}

Categories: PLC Processor, PLC I/O Module, VFD, Contactor, Relay, MCCB, Circuit Breaker, Wire Duct, DIN Rail, Terminal Block, Heater, Air Conditioner, Horn/Beacon, Enclosure, HMI, Pilot Light/Operator, Other

Use realistic part numbers (Allen-Bradley, Phoenix Contact, Schneider, etc.) where confident. Set unitPrice to 0 if unknown.`;

        const resp=await apiCall({
          model:"claude-sonnet-4-6",
          max_tokens:4096,
          system:systemPrompt,
          messages:[{role:"user",content:`Generate a BOM for: ${query}`}]
        });
        if(cancelled)return;
        const raw=resp.content[0].text.trim();
        const json=raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'');
        const rows=JSON.parse(json);
        const bomRows=rows.map((r,i)=>({
          id:`cpd-${Date.now()}-${i}`,
          partNumber:r.partNumber||'',
          description:r.description||'',
          qty:r.qty||1,
          manufacturer:r.manufacturer||'',
          unitPrice:r.unitPrice||null,
          priceSource:r.unitPrice?'ai':null,priceDate:Date.now(),
          cpdCategory:r.category||'Other',
          cpdGenerated:true
        }));
        setResult(bomRows);
        setSelected(new Set(bomRows.map(r=>r.id)));
        setPhase("result");
      }catch(e){
        if(!cancelled){setErrorMsg(e.message||"Failed to generate BOM.");setPhase("error");}
      }
    }
    run();
    return()=>{cancelled=true;};
  },[]);

  // Quote analysis: compare panel BOM vs most recent supplier quote
  useEffect(()=>{
    if(!isQuoteMode)return;
    let cancelled=false;
    async function run(){
      try{
        const snap=await fbDb.collection('supplierQuotes').where('importedBy','==',uid).limit(50).get();
        if(snap.empty)throw new Error('No supplier quotes found. Import a supplier quote first.');
        const quotes=snap.docs.map(d=>({id:d.id,...d.data(),_ms:d.data().importedAt?.toMillis?.()||0}))
          .sort((a,b)=>b._ms-a._ms);
        const q=quotes[0];
        const quoteItems=(q.lineItems||[]).filter(qi=>qi.isPriced&&(qi.partNumber||qi.rawPartNumber));
        const bomRows=(panel.bom||[]).filter(r=>!r.isLaborRow&&(r.partNumber||'').trim());
        if(!bomRows.length)throw new Error('This panel has no BOM items. Extract a BOM from drawings first.');
        // Normalize: strip all non-alphanumeric chars and lowercase for fuzzy comparison
        const norm=s=>(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
        const results=bomRows.map(row=>{
          const pn=norm(row.partNumber);
          const bcNo=norm(row.bcItemNumber||'');
          let match=null;
          for(const qi of quoteItems){
            const qpn=norm(qi.partNumber);
            const qraw=norm(qi.rawPartNumber);
            const qmfrpn=norm((qi.mfr||'')+qi.partNumber); // e.g. "phxct2891035"
            const qbc=norm(qi.bcItemId||qi.bcItemNumber||'');
            // 1. Exact normalized part number
            if(pn&&qpn&&pn===qpn){match=qi;break;}
            // 2. BOM PN equals mfr+pn from quote (e.g. BOM "PHXCT2891035")
            if(pn&&qmfrpn&&pn===qmfrpn){match=qi;break;}
            // 3. BOM PN equals full normalized raw quote PN
            if(pn&&qraw&&pn===qraw){match=qi;break;}
            // 4. BC item number cross-reference
            if(bcNo&&qbc&&bcNo===qbc){match=qi;break;}
            // 5. One PN ends with the other (handles mfr prefixes like "PHXCT-2891035" → "2891035")
            if(pn.length>=4&&qpn.length>=4&&(pn.endsWith(qpn)||qpn.endsWith(pn))){match=qi;break;}
            // 6. BOM PN ends with mfr+pn or vice versa
            if(pn.length>=4&&qmfrpn.length>=4&&(pn.endsWith(qmfrpn)||qmfrpn.endsWith(pn))){match=qi;break;}
            // 7. Normalized raw ends with BOM PN (e.g. raw "phxct2891035" ends with "2891035")
            if(pn.length>=4&&qraw.length>=4&&qraw.endsWith(pn)){match=qi;break;}
            // 8. Substring containment for longer part numbers (min 6 chars to avoid false positives)
            if(pn.length>=6&&qpn.length>=6&&(pn.includes(qpn)||qpn.includes(pn))){match=qi;break;}
          }
          const bomQty=Number(row.qty)||1;
          const quotedQty=match!=null?Number(match.qty):null;
          const panelsFromItem=quotedQty!=null&&bomQty>0?Math.floor(quotedQty/bomQty):null;
          return{
            partNumber:row.partNumber||'—',
            description:row.description||match?.description||'',
            unitPrice:row.unitPrice??match?.price??null,
            bomQty,quotedQty,panelsFromItem,matched:!!match,
          };
        });
        const matched=results.filter(r=>r.panelsFromItem!==null);
        const totalPanels=matched.length>0?Math.min(...matched.map(r=>r.panelsFromItem)):null;
        if(cancelled)return;
        setQuoteAnalysis({
          quote:{supplier:q.supplier||'',quoteId:q.quoteId||'',revision:q.revision||''},
          results,totalPanels,matchedCount:matched.length,
        });
        setPhase('quoteResult');
      }catch(e){if(!cancelled){setErrorMsg(e.message);setPhase('error');}}
    }
    run();
    return()=>{cancelled=true;};
  },[]);

  // Excel download using SheetJS loaded on demand
  async function downloadExcel(){
    if(!window.XLSX){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://unpkg.com/xlsx/dist/xlsx.full.min.js';
        s.onload=res;s.onerror=()=>rej(new Error('Failed to load XLSX library'));
        document.head.appendChild(s);
      });
    }
    const XL=window.XLSX;
    const{results,totalPanels,quote}=quoteAnalysis;
    const margin=marginPct/100;
    const dataRows=results.map(r=>({
      'Part #':r.partNumber,
      'Description':r.description,
      'Unit Price':r.unitPrice!=null?Number(r.unitPrice.toFixed(4)):null,
      'BOM Qty (per panel)':r.bomQty,
      'Qty Quoted':r.quotedQty!=null?r.quotedQty:'',
      'Panels Buildable':r.panelsFromItem!=null?r.panelsFromItem:'—',
      'Margin %':marginPct,
      'Sale Price':r.unitPrice!=null?Number((r.unitPrice/(1-margin)).toFixed(4)):null,
    }));
    const salePriceTotal=results.reduce((s,r)=>s+(r.unitPrice!=null?r.unitPrice/(1-margin):0),0);
    dataRows.push({
      'Part #':'',
      'Description':'── TOTAL ──',
      'Unit Price':null,
      'BOM Qty (per panel)':'',
      'Qty Quoted':'',
      'Panels Buildable':totalPanels!=null?`${totalPanels} complete panels`:'',
      'Margin %':'',
      'Sale Price':Number(salePriceTotal.toFixed(4)),
    });
    const ws=XL.utils.json_to_sheet(dataRows);
    // Column widths
    ws['!cols']=[{wch:18},{wch:40},{wch:12},{wch:18},{wch:12},{wch:18},{wch:10},{wch:12}];
    const wb=XL.utils.book_new();
    XL.utils.book_append_sheet(wb,ws,'BOM vs Quote');
    const name=(panel.drawingNo||panel.name||'BOM').replace(/[^a-z0-9]/gi,'_');
    XL.writeFile(wb,`${name}_QuoteAnalysis.xlsx`);
  }

  const catColors={'PLC Processor':'#93c5fd','PLC I/O Module':'#818cf8','VFD':'#fb923c','Contactor':'#f472b6','Relay':'#a78bfa','MCCB':'#ef4444','Circuit Breaker':'#f87171','Wire Duct':'#6b7280','DIN Rail':'#9ca3af','Terminal Block':'#d1d5db','Heater':'#fb923c','Air Conditioner':'#22d3ee','Horn/Beacon':'#facc15','Enclosure':'#a3e635','HMI':'#34d399','Pilot Light/Operator':'#f9a8d4','Other':'#6b7280'};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,width:"100%",maxWidth:isQuoteMode?1100:780,maxHeight:"88vh",display:"flex",flexDirection:"column",boxShadow:"0 4px 20px rgba(0,0,0,0.12)"}}>
        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexShrink:0}}>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:C.accent,letterSpacing:1,marginBottom:4}}>CPD SEARCH — AI BOM GENERATOR</div>
            <div style={{fontSize:12,color:C.muted,fontStyle:"italic",lineHeight:1.5}}>"{query}"</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:18,cursor:"pointer",padding:"0 4px",flexShrink:0}}>✕</button>
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
          {similarPanels.length>0&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,fontWeight:700,color:C.purple,textTransform:"uppercase",letterSpacing:0.7,marginBottom:8}}>Similar Panels in Database</div>
              {similarPanels.map((p,i)=>(
                <div key={p.panelId||i} style={{background:C.bg,border:`1px solid ${C.purple}44`,borderRadius:7,padding:"9px 12px",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.purple}}>{p.panelType||'Control Panel'}</span>
                    {p.controlledEquipment&&<span style={{fontSize:10,color:C.muted}}>— {p.controlledEquipment}</span>}
                  </div>
                  <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                    {p.voltages?.lineVoltage&&<span style={{fontSize:10,color:C.sub}}>⚡ {p.voltages.lineVoltage}</span>}
                    {p.specs?.motorCount>0&&<span style={{fontSize:10,color:C.sub}}>⚙ {p.specs.motorCount} motors</span>}
                    {(p.specs?.plcInputs||p.specs?.plcOutputs)&&<span style={{fontSize:10,color:C.sub}}>PLC {p.specs.plcInputs||0}in/{p.specs.plcOutputs||0}out</span>}
                    {p.plcBrand&&<span style={{fontSize:10,color:C.sub}}>{p.plcBrand}</span>}
                    <span style={{fontSize:10,color:C.muted}}>{p.panelName}</span>
                  </div>
                  {p.additionalNotes&&<div style={{fontSize:10,color:C.muted,marginTop:3,fontStyle:"italic"}}>{p.additionalNotes.slice(0,120)}</div>}
                </div>
              ))}
            </div>
          )}
          {phase==="analyzeQuote"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 0",gap:14}}>
              <div style={{fontSize:36,animation:"spin 1.2s linear infinite",display:"inline-block"}}>📊</div>
              <div style={{fontSize:13,color:C.muted}}>Comparing BOM against supplier quote…</div>
            </div>
          )}
          {phase==="quoteResult"&&quoteAnalysis&&(()=>{
            const{quote,results,totalPanels,matchedCount}=quoteAnalysis;
            const margin=marginPct/100;
            const salePriceTotal=results.reduce((s,r)=>s+(r.unitPrice!=null?r.unitPrice/(1-margin):0),0);
            const unmatchedCount=results.filter(r=>!r.matched).length;
            return(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {/* Summary bar */}
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                  <div style={{background:C.greenDim,border:`1px solid ${C.green}44`,borderRadius:8,padding:"8px 16px"}}>
                    <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>Complete Panels Buildable</div>
                    <div style={{fontSize:28,fontWeight:800,color:C.green,lineHeight:1.1}}>{totalPanels!=null?totalPanels:'—'}</div>
                  </div>
                  <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 16px"}}>
                    <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>BOM Items Matched</div>
                    <div style={{fontSize:20,fontWeight:700,color:C.accent}}>{matchedCount} / {results.length}</div>
                  </div>
                  {unmatchedCount>0&&(
                    <div style={{background:C.yellowDim,border:`1px solid ${C.yellow}44`,borderRadius:8,padding:"8px 16px"}}>
                      <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>Unmatched (no quote data)</div>
                      <div style={{fontSize:20,fontWeight:700,color:C.yellow}}>{unmatchedCount}</div>
                    </div>
                  )}
                  <div style={{marginLeft:"auto",fontSize:11,color:C.muted,textAlign:"right",lineHeight:1.6}}>
                    Quote: <span style={{color:C.sub}}>{quote.supplier}</span><br/>
                    {quote.quoteId&&<>{quote.quoteId}{quote.revision?` Rev ${quote.revision}`:''}</>}
                  </div>
                </div>
                {/* Margin control */}
                <div style={{display:"flex",alignItems:"center",gap:10,background:C.bg,borderRadius:8,padding:"8px 14px",border:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12,color:C.muted,flexShrink:0}}>Gross Margin %</span>
                  <input type="number" min={0} max={99} value={marginPct}
                    onChange={e=>setMarginPct(Math.max(0,Math.min(99,Number(e.target.value)||0)))}
                    style={{width:60,background:C.input,border:`1px solid ${C.accent}55`,borderRadius:6,padding:"3px 8px",color:C.accent,fontSize:13,fontWeight:700,outline:"none",textAlign:"center"}}/>
                  <span style={{fontSize:11,color:C.muted}}>Sale Price = Unit Cost ÷ (1 − margin)</span>
                  <button onClick={downloadExcel}
                    style={{marginLeft:"auto",background:C.greenDim,border:`1px solid ${C.green}`,color:C.green,borderRadius:8,padding:"5px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    ⬇ Download Excel
                  </button>
                </div>
                {/* Table */}
                <div style={{overflowX:"auto",border:`1px solid ${C.border}`,borderRadius:8}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:700}}>
                    <thead>
                      <tr style={{background:C.card,color:C.muted,borderBottom:`2px solid ${C.border}`}}>
                        {['Part #','Description','Unit Price','BOM Qty','Qty Quoted','Panels','Margin %','Sale Price'].map(h=>(
                          <th key={h} style={{padding:"8px 10px",textAlign:h==='Description'?'left':'center',fontWeight:700,fontSize:11,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r,i)=>{
                        const sp=r.unitPrice!=null?r.unitPrice/(1-margin):null;
                        const panelOk=r.panelsFromItem!=null&&r.panelsFromItem>=totalPanels;
                        return(
                          <tr key={i} style={{borderBottom:`1px solid ${C.border}33`,background:r.matched?"transparent":C.yellowDim+"44"}}>
                            <td style={{padding:"7px 10px",fontFamily:"monospace",color:C.accent,fontWeight:700,whiteSpace:"nowrap"}}>{r.partNumber}</td>
                            <td style={{padding:"7px 10px",color:C.sub,maxWidth:280,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</td>
                            <td style={{padding:"7px 10px",textAlign:"center",color:C.text}}>{r.unitPrice!=null?'$'+r.unitPrice.toFixed(2):'—'}</td>
                            <td style={{padding:"7px 10px",textAlign:"center",color:C.text}}>{r.bomQty}</td>
                            <td style={{padding:"7px 10px",textAlign:"center",color:r.matched?C.text:C.muted}}>{r.quotedQty!=null?r.quotedQty:'—'}</td>
                            <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:r.panelsFromItem!=null?(panelOk?C.green:C.yellow):C.red}}>
                              {r.panelsFromItem!=null?r.panelsFromItem:'—'}
                            </td>
                            <td style={{padding:"7px 10px",textAlign:"center",color:C.muted}}>{marginPct}%</td>
                            <td style={{padding:"7px 10px",textAlign:"center",color:C.green,fontWeight:600}}>{sp!=null?'$'+sp.toFixed(2):'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{background:C.card,borderTop:`2px solid ${C.border}`}}>
                        <td colSpan={7} style={{padding:"8px 10px",textAlign:"right",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>Total Sale Price</td>
                        <td style={{padding:"8px 10px",textAlign:"center",fontWeight:800,color:C.green,fontSize:14}}>${salePriceTotal.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {unmatchedCount>0&&(
                  <div style={{fontSize:11,color:C.yellow,background:C.yellowDim,border:`1px solid ${C.yellow}33`,borderRadius:6,padding:"8px 12px"}}>
                    ⚠ {unmatchedCount} BOM item{unmatchedCount!==1?'s':''} had no matching line in the supplier quote — shown as "—" for quoted qty and panels buildable.
                  </div>
                )}
              </div>
            );
          })()}
          {phase==="thinking"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"48px 0",gap:14}}>
              <div style={{fontSize:36,animation:"spin 1.2s linear infinite",display:"inline-block"}}>⚙</div>
              <div style={{fontSize:13,color:C.muted}}>ARC is generating your preliminary BOM…</div>
            </div>
          )}
          {phase==="error"&&(
            <div style={{color:C.red,fontSize:13,padding:"24px 0"}}>{errorMsg}</div>
          )}
          {phase==="result"&&result&&(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:12,color:C.muted}}>{result.length} items generated — check the items you want to import</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setSelected(new Set(result.map(r=>r.id)))} style={{fontSize:11,background:"none",border:`1px solid ${C.accent}`,borderRadius:4,color:C.accent,padding:"3px 8px",cursor:"pointer"}}>All</button>
                  <button onClick={()=>setSelected(new Set())} style={{fontSize:11,background:"none",border:`1px solid ${C.border}`,borderRadius:4,color:C.muted,padding:"3px 8px",cursor:"pointer"}}>None</button>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {result.map(r=>{
                  const checked=selected.has(r.id);
                  const col=catColors[r.cpdCategory]||C.muted;
                  return(
                    <div key={r.id} onClick={()=>setSelected(prev=>{const s=new Set(prev);checked?s.delete(r.id):s.add(r.id);return s;})}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:6,background:checked?C.accentDim:C.bg,border:`1px solid ${checked?C.accent+'44':C.border}`,cursor:"pointer"}}>
                      <div style={{width:16,height:16,borderRadius:3,border:`2px solid ${checked?C.accent:C.muted}`,background:checked?C.accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {checked&&<span style={{color:"#000",fontSize:10,fontWeight:800,lineHeight:1}}>✓</span>}
                      </div>
                      <div style={{fontSize:9,fontWeight:700,color:col,background:col+'22',borderRadius:3,padding:"2px 5px",whiteSpace:"nowrap",flexShrink:0}}>{r.cpdCategory}</div>
                      <div style={{fontSize:12,fontWeight:700,color:C.accent,minWidth:120,flexShrink:0}}>{r.partNumber||<span style={{color:C.muted,fontStyle:"italic"}}>TBD</span>}</div>
                      <div style={{fontSize:12,color:C.sub,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description}</div>
                      <div style={{fontSize:11,color:C.muted,flexShrink:0}}>Qty: {r.qty}</div>
                      {r.unitPrice>0&&<div style={{fontSize:11,color:C.green,flexShrink:0}}>${r.unitPrice.toFixed(2)}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{fontSize:11,color:C.muted,marginTop:12,padding:"8px 10px",background:C.bg,borderRadius:6,border:`1px solid ${C.border}`,lineHeight:1.5}}>
                ⚠ This is an AI-generated preliminary BOM. Part numbers and pricing should be verified before quoting. All items are marked as AI-generated in the BOM.
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {phase==="result"&&(
          <div style={{padding:"14px 24px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end",flexShrink:0}}>
            <button onClick={onClose} style={btn(C.border,C.muted,{fontSize:13})}>Cancel</button>
            <button onClick={()=>onImportBom(result.filter(r=>selected.has(r.id)))}
              disabled={selected.size===0}
              style={btn(C.accentDim,C.accent,{fontSize:13,fontWeight:700,opacity:selected.size===0?0.4:1})}>
              Import {selected.size} Item{selected.size!==1?"s":""} into BOM
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default CPDSearchModal;

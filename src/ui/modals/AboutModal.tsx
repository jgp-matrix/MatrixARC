// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION, setBcToken } from '@/core/globals';
import Badge from '@/ui/shared/Badge';
const ProjectTile = (props: any) => null; // TODO: extract from Dashboard and share

function AboutModal({onClose}){
  const changelog=[
    {ver:"v1.17.298",changes:["Add quote header details to portal pricing review","Add submission verification disclaimer text","Enrich supplier part numbers from cross-reference databases"]},
    {ver:"v1.17.297",changes:["Move Submit Your Quote box above Items Requested on supplier portal"]},
    {ver:"v1.17.296",changes:["Add 'Powered by ARC Software' header to supplier portal"]},
    {ver:"v1.17.295",changes:["Add Supplier Part # column to RFQ portal review table"]},
    {ver:"v1.17.294",changes:["Replace progress bar with spinning circle on portal analyzing phase"]},
    {ver:"v1.17.293",changes:["Fix supplier quote extraction for large quotes (increased capacity)","Increase extraction token limit for better accuracy"]},
    {ver:"v1.17.292",changes:["Use hybrid vision+text approach for supplier quote parsing"]},
    {ver:"v1.17.291",changes:["Widen supplier portal review page for better column visibility"]},
    {ver:"v1.17.290",changes:["Rename 'Cannot Supply' to 'No Bid' on supplier RFQ portal"]},
    {ver:"v1.17.289",changes:["Switch supplier quote parsing to vision-based extraction"]},
    {ver:"v1.17.288",changes:["Widen Supplier Quote Import modal for more columns"]},
    {ver:"v1.17.287",changes:["Update supplier quote extraction prompt for fuzzy part number matching"]},
    {ver:"v1.17.260",changes:["Add Cloud Functions for team management and supplier notifications"]},
    {ver:"v1.17.259",changes:["Fix slow connection false positive detection","Auto-reacquire BC token on search failure"]},
    {ver:"v1.17.254",changes:["BC polling: pulse updated rows green with dismissible notification"]},
    {ver:"v1.17.250",changes:["Poll BC every 5 min to keep BOM pricing and PO dates live"]},
    {ver:"v1.17.245",changes:["Add Gen. Prod. and Inventory Posting Group dropdowns to Create Item form"]},
    {ver:"v1.17.240",changes:["Add Refresh Pricing button to BOM","Backfill BC PO dates for priced rows"]},
    {ver:"v1.17.237",changes:["Show actual BC last PO date in BOM Priced column"]},
    {ver:"v1.17.234",changes:["Add vendor selection dropdown in BOM for priced items","Write vendor selection back to BC Item Card"]},
    {ver:"v1.17.230",changes:["Add Supplier and Last Price Date columns to BOM table","Add vendor name backfill from BC purchase invoices"]},
    {ver:"v1.17.225",changes:["Add RFQ (Request for Quote) feature — send quotes to suppliers"]},
    {ver:"v1.16.0",changes:["Admin-configurable labor category rates"]},
    {ver:"v1.15.0",changes:["Quote print system overhaul: compact layout, fixed footer, auto-print flow"]},
    {ver:"v1.14.0",changes:["ARC AI part number verification and BOM confidence scoring"]},
    {ver:"v1.13.0",changes:["Add labor category checkboxes and inline qty editing","Harmonize labor box font sizes"]},
    {ver:"v1.12.0",changes:["Multi-panel project support","Structured BOM extraction prompt with column mapping"]},
    {ver:"v1.11.0",changes:["Project transfer flow for team management","Team member role management via Cloud Functions"]},
    {ver:"v1.10.0",changes:["Price, Quote, and Validation action tabs","Wire counting and enclosure validation"]},
    {ver:"v1.9.0",changes:["PDF support and improved BOM extraction resolution"]},
    {ver:"v1.0.0",changes:["Initial release: BOM extraction, project management, Firebase auth"]},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,width:"min(700px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column",overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>About ARC Software</div>
            <div style={{fontSize:13,color:C.accent,fontWeight:600,marginTop:4,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{APP_VERSION}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:22}}>✕</button>
        </div>
        <div style={{padding:"16px 24px",overflowY:"auto",flex:1}}>
          <div style={{fontSize:14,color:C.muted,marginBottom:16}}>Version history and release notes</div>
          {changelog.map((entry,i)=>(
            <div key={i} style={{marginBottom:16,paddingBottom:16,borderBottom:i<changelog.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:6,fontFamily:"'Orbitron',monospace",letterSpacing:0.5}}>{entry.ver}</div>
              <ul style={{margin:0,paddingLeft:20}}>
                {entry.changes.map((c,j)=><li key={j} style={{fontSize:13,color:C.text,lineHeight:1.6,marginBottom:2}}>{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── DASHBOARD ──
// ── ARC AI DATABASE PAGE (admin only) ──
function AIDatabasePage({uid,onBack}){
  const [cpd,setCpd]=useState(null);
  const [loading,setLoading]=useState(true);
  const [editingId,setEditingId]=useState(null);
  const [editNotes,setEditNotes]=useState("");
  const [saving,setSaving]=useState(false);
  const [filter,setFilter]=useState("");
  const [catalogOpen,setCatalogOpen]=useState(false);

  useEffect(()=>{
    loadCPD(uid).then(data=>{setCpd(data);setLoading(false);}).catch(()=>setLoading(false));
  },[uid]);

  async function saveAdminNotes(panelId){
    setSaving(true);
    const panels=(cpd.panels||[]).map(p=>p.panelId===panelId?{...p,adminNotes:editNotes}:p);
    const updated={...cpd,panels};
    await saveCPD(uid,updated);
    setCpd(updated);
    setSaving(false);
    setEditingId(null);
  }

  if(loading)return<div style={{padding:40,color:C.muted,fontSize:14}}>Loading ARC AI Database…</div>;
  const panels=cpd?.panels||[];
  const products=cpd?.products||[];

  // Group panels by controlled equipment
  const groups={};
  panels.forEach(p=>{
    const equip=(p.controlledEquipment||'Unclassified').split(/,\s*/)[0].trim()||'Unclassified';
    if(!groups[equip])groups[equip]=[];
    groups[equip].push(p);
  });
  const sorted=Object.entries(groups).sort((a,b)=>a[0].localeCompare(b[0]));
  const filterLow=filter.toLowerCase();
  const filteredSorted=filter?sorted.map(([g,ps])=>[g,ps.filter(p=>{
    const hay=JSON.stringify(p).toLowerCase();
    return hay.includes(filterLow);
  })]).filter(([,ps])=>ps.length):sorted;

  return(
    <div style={{padding:"24px 32px",maxWidth:1400,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:12,padding:"5px 12px",cursor:"pointer"}}>← Back</button>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#a78bfa",letterSpacing:1}}>🧠 ARC AI DATABASE</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{panels.length} panels cataloged · {products.length} unique parts</div>
        </div>
        <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter by any field…"
          style={{marginLeft:"auto",background:"#0a0a16",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,padding:"6px 12px",width:240,outline:"none"}}/>
      </div>

      {filteredSorted.length===0&&(
        <div style={{color:C.muted,fontSize:13,padding:"40px 0",textAlign:"center"}}>No panel data yet. Extractions will appear here automatically as panels are scanned.</div>
      )}

      {filteredSorted.map(([equipType,panelGroup])=>(
        <div key={equipType} style={{marginBottom:32}}>
          <div style={{fontSize:13,fontWeight:800,color:"#a78bfa",textTransform:"uppercase",letterSpacing:1,marginBottom:10,paddingBottom:6,borderBottom:`1px solid #a78bfa33`,display:"flex",alignItems:"center",gap:8}}>
            <span>⚡</span>{equipType}
            <span style={{fontSize:11,fontWeight:400,color:C.muted}}>({panelGroup.length} panel{panelGroup.length!==1?"s":""})</span>
          </div>
          {panelGroup.map(p=>(
            <div key={p.panelId} style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:16,flexWrap:"wrap"}}>
                {/* Panel identity */}
                <div style={{minWidth:200,flex:"0 0 auto"}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:2}}>{p.panelName||p.drawingNo||'Unnamed Panel'}</div>
                  <div style={{fontSize:11,color:C.muted}}>{p.drawingNo&&<span style={{color:C.accent}}>{p.drawingNo} </span>}{p.panelType&&<span style={{color:C.sub}}>{p.panelType}</span>}</div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{p.scannedAt?new Date(p.scannedAt).toLocaleDateString():''}</div>
                </div>
                {/* Equipment + voltages */}
                <div style={{flex:1,minWidth:180}}>
                  {p.controlledEquipment&&<div style={{fontSize:11,color:C.sub,marginBottom:3}}><span style={{color:C.muted}}>Equipment: </span>{p.controlledEquipment}</div>}
                  {p.voltages&&(p.voltages.lineVoltage||p.voltages.controlVoltage)&&(
                    <div style={{fontSize:11,color:C.sub,marginBottom:3}}>
                      {p.voltages.lineVoltage&&p.voltages.lineVoltage!=='unknown'&&<span style={{marginRight:10}}><span style={{color:C.muted}}>Line: </span>{p.voltages.lineVoltage}</span>}
                      {p.voltages.controlVoltage&&p.voltages.controlVoltage!=='unknown'&&<span style={{marginRight:10}}><span style={{color:C.muted}}>Control: </span>{p.voltages.controlVoltage}</span>}
                      {p.voltages.motorVoltage&&p.voltages.motorVoltage!=='unknown'&&<span><span style={{color:C.muted}}>Motor: </span>{p.voltages.motorVoltage}</span>}
                    </div>
                  )}
                  {p.enclosureType&&p.enclosureType!=='unknown'&&<div style={{fontSize:11,color:C.sub,marginBottom:3}}><span style={{color:C.muted}}>Enclosure: </span>{p.enclosureType}</div>}
                  {p.plcBrand&&p.plcBrand!=='unknown'&&<div style={{fontSize:11,color:C.sub}}><span style={{color:C.muted}}>PLC: </span>{p.plcBrand}</div>}
                </div>
                {/* Specs */}
                <div style={{flex:"0 0 auto",display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-start"}}>
                  {[
                    {label:"Items",val:p.specs?.itemCount,color:C.accent},
                    {label:"Motors",val:p.specs?.motorCount,color:"#fb923c"},
                    {label:"PLC In",val:p.specs?.plcInputs,color:C.green},
                    {label:"PLC Out",val:p.specs?.plcOutputs,color:"#f472b6"},
                    {label:"Processors",val:p.specs?.plcProcessors,color:"#93c5fd"},
                  ].filter(s=>s.val>0).map(s=>(
                    <div key={s.label} style={{background:s.color+'18',border:`1px solid ${s.color}44`,borderRadius:6,padding:"4px 8px",textAlign:"center",minWidth:52}}>
                      <div style={{fontSize:14,fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
                      <div style={{fontSize:9,color:s.color,opacity:0.8,marginTop:2,letterSpacing:0.3}}>{s.label.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BOM categories summary */}
              {p.bomSummary&&p.bomSummary.length>0&&(()=>{
                const cats={};
                p.bomSummary.forEach(r=>{cats[r.category]=(cats[r.category]||0)+1;});
                return(
                  <div style={{marginTop:10,display:"flex",gap:5,flexWrap:"wrap"}}>
                    {Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,cnt])=>(
                      <span key={cat} style={{fontSize:10,background:"#1a1a2e",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 7px",color:C.muted}}>
                        {cat} <span style={{color:C.sub,fontWeight:700}}>{cnt}</span>
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Additional notes from extraction */}
              {p.additionalNotes&&(
                <div style={{marginTop:8,fontSize:11,color:C.muted,fontStyle:"italic",lineHeight:1.5,borderTop:`1px solid ${C.border}`,paddingTop:6}}>
                  {p.additionalNotes}
                </div>
              )}

              {/* Admin notes */}
              <div style={{marginTop:10,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                {editingId===p.panelId?(
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:"#a78bfa",marginBottom:4}}>Admin Notes</div>
                    <textarea value={editNotes} onChange={e=>setEditNotes(e.target.value)} rows={3} autoFocus
                      placeholder="Add additional details, corrections, or learning notes for this panel…"
                      style={{width:"100%",background:"#0a0814",border:"1px solid #a78bfa66",borderRadius:6,color:C.text,fontSize:12,padding:"7px 10px",resize:"vertical",fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
                    <div style={{display:"flex",gap:8,marginTop:6}}>
                      <button onClick={()=>saveAdminNotes(p.panelId)} disabled={saving}
                        style={btn("#1a0a2a","#a78bfa",{fontSize:12,border:"1px solid #a78bfa66",opacity:saving?0.5:1})}>
                        {saving?"Saving…":"Save Notes"}
                      </button>
                      <button onClick={()=>setEditingId(null)} style={btn(C.border,C.muted,{fontSize:12})}>Cancel</button>
                    </div>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                    {p.adminNotes?(
                      <div style={{flex:1,fontSize:11,color:"#c4b5fd",lineHeight:1.5,background:"#1a0a2a",borderRadius:6,padding:"6px 10px",border:"1px solid #a78bfa33"}}>
                        <span style={{fontSize:10,fontWeight:700,color:"#a78bfa",marginRight:6}}>ADMIN:</span>{p.adminNotes}
                      </div>
                    ):(
                      <div style={{flex:1,fontSize:11,color:C.muted,fontStyle:"italic"}}>No admin notes yet</div>
                    )}
                    <button onClick={()=>{setEditingId(p.panelId);setEditNotes(p.adminNotes||"");}}
                      style={{background:"none",border:`1px solid ${C.border}`,borderRadius:5,color:"#a78bfa",fontSize:11,padding:"3px 10px",cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
                      {p.adminNotes?"Edit Notes":"+ Add Notes"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Products summary */}
      {products.length>0&&(
        <div style={{marginTop:16,paddingTop:24,borderTop:`1px solid ${C.border}`}}>
          <div onClick={()=>setCatalogOpen(o=>!o)}
            style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:catalogOpen?12:0}}>
            <span style={{fontSize:13,transition:"transform 0.15s",display:"inline-block",transform:catalogOpen?"rotate(90deg)":"none",color:"#a78bfa"}}>▸</span>
            <div style={{fontSize:13,fontWeight:800,color:"#a78bfa",textTransform:"uppercase",letterSpacing:1}}>📦 Product Catalog</div>
            <span style={{fontSize:11,color:C.muted,fontWeight:400}}>({products.length} parts)</span>
          </div>
          {catalogOpen&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:8}}>
                {products.filter(p=>!filter||JSON.stringify(p).toLowerCase().includes(filterLow)).slice(0,100).map(p=>(
                  <div key={p.partNumber} style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:6,padding:"9px 12px",fontSize:11}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <span style={{fontWeight:700,color:C.accent}}>{p.partNumber}</span>
                      <span style={{fontSize:9,background:C.border,borderRadius:3,padding:"1px 5px",color:C.muted}}>{p.category}</span>
                      {p.seenCount>1&&<span style={{fontSize:9,color:C.green}}>×{p.seenCount}</span>}
                      {p.enriched&&<span style={{fontSize:9,color:"#a78bfa"}}>✓ enriched</span>}
                    </div>
                    <div style={{color:C.sub,marginBottom:2}}>{p.description}</div>
                    {p.manufacturer&&<div style={{color:C.muted}}>MFR: {p.manufacturer}</div>}
                    {p.shortSpec&&<div style={{color:C.muted,fontStyle:"italic",marginTop:2}}>{p.shortSpec}</div>}
                    {p.enriched&&(p.approvals?.ul||p.approvals?.ce||p.approvals?.csa)&&(
                      <div style={{marginTop:3,display:"flex",gap:4}}>
                        {['ul','ce','csa'].filter(k=>p.approvals[k]&&p.approvals[k]!=='unknown').map(k=>(
                          <span key={k} style={{fontSize:9,background:p.approvals[k]==='yes'?"#14532d":"#1a1a1a",border:`1px solid ${p.approvals[k]==='yes'?"#22c55e":C.border}`,borderRadius:3,padding:"1px 5px",color:p.approvals[k]==='yes'?"#4ade80":C.muted,textTransform:"uppercase"}}>{k}: {p.approvals[k]}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {products.length>100&&<div style={{fontSize:11,color:C.muted,marginTop:8}}>Showing first 100 of {products.length} parts. Use filter to search.</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── REPORTS MODAL ──
function ReportsModal({uid,onClose}){
  const [records,setRecords]=useState(null);
  const [loading,setLoading]=useState(true);
  const [activeReport,setActiveReport]=useState("crossref");
  useEffect(()=>{
    if(!uid)return;
    fbDb.doc(`users/${uid}/config/supplierCrossRef`).get()
      .then(d=>{setRecords(d.exists?(d.data().records||[]):[]);setLoading(false);})
      .catch(()=>{setRecords([]);setLoading(false);});
  },[uid]);
  const byVendor={};
  (records||[]).forEach(r=>{if(!byVendor[r.vendorName])byVendor[r.vendorName]=[];byVendor[r.vendorName].push(r);});
  const vendorNames=Object.keys(byVendor).sort();
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0d1a",border:"1px solid #3d6090",borderRadius:12,width:"100%",maxWidth:960,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{padding:"18px 24px",borderBottom:"1px solid #3d6090",display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9",flex:1}}>📊 Reports</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}}>✕</button>
        </div>
        <div style={{display:"flex",borderBottom:"1px solid #1e293b"}}>
          <button onClick={()=>setActiveReport("crossref")} style={{padding:"10px 20px",background:"none",border:"none",borderBottom:activeReport==="crossref"?"2px solid #3b82f6":"2px solid transparent",color:activeReport==="crossref"?"#60a5fa":"#64748b",cursor:"pointer",fontSize:13,fontWeight:activeReport==="crossref"?700:500}}>Supplier Part Cross-Reference</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
          {activeReport==="crossref"&&(<>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:16,lineHeight:1.6}}>
              This report tracks the relationship between supplier part numbers (as quoted) and Matrix BC part numbers.<br/>
              It is automatically populated when RFQs are sent for items where a part number crossing exists.<br/>
              <span style={{color:"#94a3b8",fontSize:11}}>Note: In a future release, this data will be stored in Business Central.</span>
            </div>
            {loading?(
              <div style={{textAlign:"center",padding:40,color:"#94a3b8"}}>Loading…</div>
            ):vendorNames.length===0?(
              <div style={{textAlign:"center",padding:40,color:"#94a3b8",fontSize:13}}>
                No cross-reference data yet.<br/>
                <span style={{fontSize:12,color:"#94a3b8"}}>This report auto-populates when RFQs are sent for items with crossed (BC) part numbers.</span>
              </div>
            ):vendorNames.map(vendor=>(
              <div key={vendor} style={{marginBottom:28}}>
                <div style={{fontSize:14,fontWeight:700,color:"#60a5fa",marginBottom:8,paddingBottom:6,borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:8}}>
                  <span>🏭</span><span>{vendor}</span>
                  <span style={{fontSize:11,color:"#94a3b8",fontWeight:400}}>({byVendor[vendor].length} item{byVendor[vendor].length!==1?"s":""})</span>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"#0a0a18"}}>
                      {[["Supplier Part #","20%"],["Matrix BC Part #","20%"],["Description","30%"],["RFQ #","15%"],["Date","15%"]].map(([h,w])=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#94a3b8",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:0.5,width:w}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byVendor[vendor].sort((a,b)=>(b.rfqDate||0)-(a.rfqDate||0)).map((r,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid #0f1520",background:i%2===0?"transparent":"#0a0a14"}}>
                        <td style={{padding:"7px 10px",fontWeight:700,color:"#f1f5f9",fontFamily:"monospace",fontSize:11}}>{r.origPartNumber||"—"}</td>
                        <td style={{padding:"7px 10px",color:"#60a5fa",fontFamily:"monospace",fontSize:11}}>{r.bcPartNumber||"—"}</td>
                        <td style={{padding:"7px 10px",color:"#94a3b8"}}>{r.description||"—"}</td>
                        <td style={{padding:"7px 10px",color:"#94a3b8",fontFamily:"monospace",fontSize:11}}>{r.rfqNum||"—"}</td>
                        <td style={{padding:"7px 10px",color:"#94a3b8",whiteSpace:"nowrap"}}>{r.rfqDate?new Date(r.rfqDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>)}
        </div>
        <div style={{padding:"12px 24px",borderTop:"1px solid #3d6090",display:"flex",justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #3d6090",color:"#94a3b8",padding:"7px 20px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Dashboard({uid,userFirstName,memberMap,projects,loading,onOpen,onNew,onDelete,onAccept,onTransfer,onUpdateProject,sqQuery,sqResults,sqSearching,rfqCounts,forceView}){
  const [groupBy,setGroupBy]=useState(forceView==="production"?"production":forceView==="purchasing"?"purchasing":"status");
  const [projectSearch,setProjectSearch]=useState("");
  const [dragProjectId,setDragProjectId]=useState(null);
  const [dropTarget,setDropTarget]=useState(null);
  const bgTasks=useBgTasks();

  function groupProjects(list){
    if(groupBy==="customer"){
      const map={};
      list.forEach(p=>{
        const key=p.bcCustomerName||"No Customer";
        if(!map[key])map[key]=[];
        map[key].push(p);
      });
      return Object.keys(map).sort((a,b)=>a==="No Customer"?1:b==="No Customer"?-1:a.localeCompare(b)).map(k=>({label:k,items:map[k],customerNumber:map[k].find(p=>p.bcCustomerNumber)?.bcCustomerNumber||null}));
    }
    if(groupBy==="date"){
      const map={};
      const maxTs={};
      list.forEach(p=>{
        const d=p.createdAt||p.updatedAt||0;
        const key=d?new Date(d).toLocaleDateString("en-US",{month:"long",year:"numeric"}):"Unknown Date";
        if(!map[key])map[key]=[];
        map[key].push(p);
        if(d>=(maxTs[key]||0))maxTs[key]=d;
      });
      return Object.keys(map).sort((a,b)=>{
        if(a==="Unknown Date")return 1;
        if(b==="Unknown Date")return -1;
        return (maxTs[b]||0)-(maxTs[a]||0);
      }).map(k=>({label:k,items:map[k]}));
    }
    if(groupBy==="projectnum"){
      const sorted=[...list].sort((a,b)=>{
        const an=a.bcProjectNumber||"";
        const bn=b.bcProjectNumber||"";
        if(!an&&!bn)return 0;
        if(!an)return 1;
        if(!bn)return -1;
        return bn.localeCompare(an,undefined,{numeric:true});
      });
      return [{label:null,items:sorted}];
    }
    if(groupBy==="purchasing"){
      const order=["tobepurchased","inprocess","completed"];
      const labels={tobepurchased:"To Be Purchased",inprocess:"Purchasing In Process",completed:"Purchasing Completed"};
      const map={};
      list.forEach(p=>{
        if(p.bcPoStatus==="purchasing"){if(!map.inprocess)map.inprocess=[];map.inprocess.push(p);}
        else if(p.bcPoStatus==="Open"){if(!map.tobepurchased)map.tobepurchased=[];map.tobepurchased.push(p);}
        else if(p.bcPoStatus==="purchased"||p.bcPoStatus==="Completed"){if(!map.completed)map.completed=[];map.completed.push(p);}
      });
      return order.map(k=>({label:labels[k],items:map[k]||[]}));
    }
    if(groupBy==="production"){
      const order=["partsopen","inproduction"];
      const labels={partsopen:"Parts Orders Open",inproduction:"In Production"};
      const map={};
      list.forEach(p=>{
        if(p.bcPoStatus==="purchasing"){if(!map.partsopen)map.partsopen=[];map.partsopen.push(p);}
        if(p.bcPoStatus==="purchasing"||p.bcPoStatus==="Open"){if(!map.inproduction)map.inproduction=[];map.inproduction.push(p);}
      });
      return order.map(k=>({label:labels[k],items:map[k]||[]}));
    }
    if(groupBy==="status"){
      const order=["draft","in_progress","process_rfq","evc","quotes_sent"];
      const labels={draft:"Draft",in_progress:"In Process",process_rfq:"RFQ's Send/Receive",evc:"Ready To Review/Send",quotes_sent:"Quotes Sent"};
      const map={};
      list.forEach(p=>{
        if(p.bcPoStatus==="purchasing"||p.bcPoStatus==="Open")return; // skip — shown in PURCHASING/PRODUCTION tabs
        // Quotes Sent = user explicitly marked quote as sent to client
        if(p.quoteSentAt){if(!map.quotes_sent)map.quotes_sent=[];map.quotes_sent.push(p);return;}
        // Process RFQs = has BOM items that are unpriced (unitPrice 0/null or no priceDate)
        const allPanels=p.panels||[];
        const hasBom=allPanels.some(pan=>(pan.bom||[]).length>0);
        const hasUnpriced=hasBom&&allPanels.some(pan=>(pan.bom||[]).filter(r=>!r.isLaborRow&&!r.customerSupplied).some(r=>!r.unitPrice||r.unitPrice===0||!r.priceDate));
        if(hasUnpriced){if(!map.process_rfq)map.process_rfq=[];map.process_rfq.push(p);return;}
        // If has BOM and all items are priced → Ready To Review/Send
        if(hasBom&&!hasUnpriced){if(!map.evc)map.evc=[];map.evc.push(p);return;}
        let st=projectStatus(p);if(st==="extracted"||st==="validated"||st==="costed"||st==="quoted"||st==="pushed_to_bc")st="evc";if(!map[st])map[st]=[];map[st].push(p);
      });
      return order.map(k=>({label:labels[k],items:map[k]||[]}));
    }
    if(groupBy==="budgetary"){
      return [{label:"Budgetary Quotes",items:list.filter(p=>(p.panels||[]).some(pan=>(pan.pricing||{}).isBudgetary))}];
    }
    if(groupBy==="imported"){
      return [{label:null,items:list.filter(p=>p.importedFromBC)}];
    }
    if(groupBy==="active"){
      return [{label:"Open Orders (Purchasing)",items:list.filter(p=>p.bcPoStatus==="Open")}];
    }
    if(groupBy==="purchasing"){
      return [{label:"Open Orders (In Production)",items:list.filter(p=>p.bcPoStatus==="purchasing")}];
    }
    return [{label:null,items:list}];
  }

  async function assignCustomer(projectId,customerName,customerNumber){
    const proj=projects.find(p=>p.id===projectId);
    if(!proj||proj.bcCustomerName)return;
    const updated={...proj,bcCustomerName:customerName,bcCustomerNumber:customerNumber,updatedAt:Date.now()};
    await onUpdateProject(updated);
    if(proj.bcProjectNumber&&customerNumber){
      try{
        if(!_bcToken){setBcToken(await acquireBcToken(false)||null);}
        if(!_bcToken){setBcToken(await acquireBcToken(true)||null);}
        const _custFields={Bill_to_Customer_No:customerNumber};
        await bcPatchJobOData(proj.bcProjectNumber,_custFields).catch(e=>{
          if(!_bcToken)bcEnqueue('patchJob',{projectNumber:proj.bcProjectNumber,fields:_custFields},`Update BC project ${proj.bcProjectNumber}`);
          else throw e;
        });
      }catch(e){console.warn("BC customer assign failed:",e);}
    }
  }
  const filterBtn=(label,val)=>(
    <button key={val} onClick={()=>setGroupBy(val)} style={{background:groupBy===val?C.accent:"#383850",color:groupBy===val?"#fff":C.muted,border:groupBy===val?`1.5px solid ${C.accent}`:"1.5px solid #7a7a9a",borderRadius:8,padding:"8px 20px",fontSize:14,cursor:"pointer",fontWeight:600,transition:"all 0.15s"}}>
      {label}
    </button>
  );

  return(
    <div style={{maxWidth:2100,margin:"0 auto",padding:32,minWidth:0,width:"100%",boxSizing:"border-box"}}>

      {!forceView&&<div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button data-tip="Start a new panel extraction project" data-tour="new-project-btn" onClick={onNew} style={btn(C.accent,"#fff",{display:"flex",alignItems:"center",gap:8,fontSize:14})}>
          <span style={{fontSize:18,lineHeight:1}}>+</span> New Project
        </button>
        <div style={{position:"relative",flex:1,maxWidth:400}}>
          <input value={projectSearch} onChange={e=>setProjectSearch(e.target.value)} placeholder="🔍 Search projects…"
            style={{...inp({fontSize:13,padding:"9px 12px 9px 12px",borderRadius:8,width:"100%",boxSizing:"border-box"})}}/>
          {projectSearch&&<button onClick={()=>setProjectSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>✕</button>}
        </div>
      </div>}

      {!forceView&&<div style={{display:"flex",gap:8,marginBottom:groupBy!=="imported"?8:24}}>
        {filterBtn("By Status","status")}
        {filterBtn("By Customer","customer")}
        {filterBtn("By Date","date")}
        {filterBtn("By Project #","projectnum")}
        {filterBtn("Budgetary","budgetary")}
        {filterBtn("Imported","imported")}
        {filterBtn("All","all")}
      </div>}

      {loading&&(
        <div style={{textAlign:"center",padding:80,color:C.muted}}>
          <div className="spin" style={{fontSize:24,marginBottom:12}}>◌</div>
          <div>Loading projects…</div>
        </div>
      )}

      {(()=>{
        let myProjects=projects.filter(p=>(!p.transferred||p.transferredTo!==uid)&&(groupBy==="imported"||groupBy==="active"||groupBy==="purchasing"||groupBy==="budgetary"||groupBy==="production"||forceView==="purchasing"||!p.importedFromBC));
        // Apply search filter
        if(projectSearch.trim()){
          const q=projectSearch.trim().toLowerCase();
          myProjects=myProjects.filter(p=>{
            const fields=[p.name,p.bcProjectNumber,p.customerName,p.drawingNo,
              ...(p.panels||[]).flatMap(pan=>[pan.name,pan.drawingNo,pan.drawingDesc,
                ...(pan.bom||[]).map(r=>r.partNumber),...(pan.bom||[]).map(r=>r.description),...(pan.bom||[]).map(r=>r.bcVendorName)])];
            return fields.some(f=>(f||"").toLowerCase().includes(q));
          });
        }
        const transferred=projects.filter(p=>p.transferred&&p.transferredTo===uid);
        const groups=groupProjects(myProjects);
        return(<>
          {!loading&&myProjects.length===0&&transferred.length===0&&(
            <div style={{textAlign:"center",padding:80,color:C.muted}}>
              <div style={{fontSize:52,marginBottom:16,opacity:0.2}}>⬡</div>
              <div style={{fontSize:18,fontWeight:700,color:C.sub,marginBottom:8}}>No projects yet</div>
              <div style={{fontSize:13,marginBottom:24,lineHeight:1.7}}>Upload scanned UL508A drawings to extract<br/>BOM data, validate schematics, and generate quotes.</div>
              <button onClick={onNew} style={btn(C.accent,"#fff")}>Create First Project</button>
            </div>
          )}
          {(groupBy==="customer"||groupBy==="status"||groupBy==="production"||groupBy==="purchasing")?(
            <div style={{display:"flex",gap:16,alignItems:"flex-start",width:"100%",paddingBottom:8}}>
              {groups.map((g,gi)=>{
                const statusColColors={Draft:C.muted,"In Process":C.yellow,"RFQ's Send/Receive":C.red,"Ready To Review/Send":C.green,"Quotes Sent":"#38bdf8","To Be Purchased":"#f59e0b","Purchasing In Process":"#38bdf8","Purchasing Completed":"#10b981","Parts Orders Open":"#f59e0b","In Production":"#a78bfa"};
                const statusColBg={Draft:C.border,"In Process":C.yellowDim,"RFQ's Send/Receive":C.redDim,"Ready To Review/Send":C.greenDim,"Quotes Sent":"#0c2233","To Be Purchased":"#3a1f00","Purchasing In Process":"#0c2233","Purchasing Completed":C.greenDim,"Parts Orders Open":"#3a1f00","In Production":"#1a1033"};
                const colColor=(groupBy==="status"||groupBy==="production"||groupBy==="purchasing")?(statusColColors[g.label]||C.muted):C.sub;
                const colBg=(groupBy==="status"||groupBy==="production"||groupBy==="purchasing")?(statusColBg[g.label]||C.border):"#3d6090";
                const isNoCustomer=groupBy==="customer"&&g.label==="No Customer";
                const isDropTarget=groupBy==="customer"&&!isNoCustomer&&!!g.customerNumber&&!!dragProjectId;
                const isOver=dropTarget===gi;
                return(
                <div key={gi} style={{flex:"1 1 0",minWidth:180}}
                  onDragOver={isDropTarget?e=>{e.preventDefault();setDropTarget(gi);}:undefined}
                  onDragLeave={isDropTarget?e=>{if(!e.currentTarget.contains(e.relatedTarget))setDropTarget(null);}:undefined}
                  onDrop={isDropTarget?e=>{e.preventDefault();setDropTarget(null);if(dragProjectId)assignCustomer(dragProjectId,g.label,g.customerNumber);setDragProjectId(null);}:undefined}>
                  {g.label&&<div style={{background:isOver?C.accent:colBg,color:isOver?"#fff":colColor,borderRadius:8,fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10,textAlign:"center",height:44,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxSizing:"border-box",width:"100%",transition:"background 0.15s,color 0.15s",outline:isDropTarget&&dragProjectId?(isOver?"2px solid "+C.accent:"2px dashed "+C.accent+"66"):"none",outlineOffset:2}}><span>{g.label}</span><span style={{opacity:0.6,fontWeight:400}}>({g.items.length})</span></div>}
                  <div style={{display:"flex",flexDirection:"column",gap:8,borderRadius:8,padding:isOver?"6px":"0",background:isOver?"#1e2e1e":"transparent",transition:"background 0.15s,padding 0.15s"}}>
                    {g.items.map(p=>(
                      <ProjectTile key={p.id} p={p} onOpen={onOpen} onDelete={onDelete} onTransfer={onTransfer}
                        onUpdateStatus={onUpdateProject?async(proj,newStatus)=>{const u={...proj,bcPoStatus:newStatus,updatedAt:Date.now()};await onUpdateProject(u);}:undefined}
                        userFirstName={userFirstName} memberMap={memberMap} rfqCount={rfqCounts?.[p.id]||0}
                        draggable={isNoCustomer}
                        onDragStart={isNoCustomer?e=>{e.dataTransfer.effectAllowed="move";setDragProjectId(p.id);}:undefined}
                        onDragEnd={isNoCustomer?()=>{setDragProjectId(null);setDropTarget(null);}:undefined}/>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:32}}>
              {groups.map((g,gi)=>(
                <div key={gi}>
                  {g.label&&<div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>{g.label}</div>}
                  <div data-tour="project-list" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
                    {g.items.map(p=>(
                      <ProjectTile key={p.id} p={p} onOpen={onOpen} onDelete={onDelete} onTransfer={onTransfer} userFirstName={userFirstName} memberMap={memberMap} rfqCount={rfqCounts?.[p.id]||0}/>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {transferred.length>0&&(
            <div style={{marginTop:48}}>
              <div style={{fontSize:14,fontWeight:700,color:C.yellow,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Transferred Projects</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:20}}>These projects were transferred to you. Accept them to add them to your project list.</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
                {transferred.map(p=>{
                  const activeTask=Object.values(bgTasks).find(t=>t.projectId===p.id&&(t.status==="running"||t.status==="done"||t.status==="error"));
                  const st=projectStatus(p);
                  const statusColors={draft:C.muted,in_progress:C.yellow,extracted:C.green,validated:C.green,costed:C.green,pushed_to_bc:"#38bdf8"};
                  const statusLabels={draft:"DRAFT",in_progress:"PROCESSING",extracted:"READY",validated:"READY",costed:"READY",pushed_to_bc:"PUSHED TO BC"};
                  return(
                  <div key={p.id} className="fade-in" onClick={()=>onOpen(p)}
                    style={{...card({padding:"10px 14px"}),cursor:"pointer",borderColor:C.yellow+"44",transition:"border-color 0.15s,transform 0.15s",display:"flex",flexDirection:"column"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.yellow;e.currentTarget.style.transform="translateY(-2px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.yellow+"44";e.currentTarget.style.transform="none";}}>
                    <div style={{fontSize:10,color:C.yellow,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>From {p.transferredFrom?.email||"a removed member"}</div>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.3,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    {p.bcCustomerName&&<div style={{fontSize:11,color:C.teal,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.bcCustomerName}</div>}
                    <div style={{fontSize:11,color:C.muted,marginBottom:"auto"}}>{p.createdAt?new Date(p.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):p.updatedAt?new Date(p.updatedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}</div>
                    {activeTask&&(
                      <div style={{marginTop:6}}>
                        <div style={{fontSize:10,color:activeTask.status==="error"?C.red:C.accent,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeTask.msg}</div>
                        {activeTask.status!=="error"?(
                          <div style={{width:"100%",height:4,background:C.border,borderRadius:4,overflow:"hidden"}}>
                            <div style={{height:"100%",width:(activeTask.pct||0)+"%",background:`linear-gradient(90deg,${C.accent},#818cf8)`,borderRadius:4,transition:"width 0.4s"}}/>
                          </div>
                        ):null}
                      </div>
                    )}
                    <div style={{marginTop:5,marginBottom:6}}><Badge status={st} project={p}/></div>
                    <button onClick={e=>{e.stopPropagation();onAccept(p.id);}}
                      style={btn(C.accentDim,C.accent,{width:"100%",fontSize:12,padding:"6px 0",fontWeight:700,border:`1px solid ${C.accent}88`})}>
                      Accept into My Projects
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </>);
      })()}
    </div>
  );
}

export default AboutModal;

import { useState, useEffect } from 'react';
import { C, btn } from '@/core/constants';
import { fbDb, _appCtx } from '@/core/globals';

// ── CPD (Control Panel Design) DATABASE ──
let _cpdCache: any=null;
function _cpdPath(uid: any){return (_appCtx.configPath||`users/${uid}/config`)+"/cpd_catalog";}
async function loadCPD(uid: any){
  if(_cpdCache)return _cpdCache;
  try{const d=await fbDb.doc(_cpdPath(uid)).get();_cpdCache=d.exists?{products:[],panels:[],...d.data()}:{products:[],panels:[]};}
  catch(e){_cpdCache={products:[],panels:[]};}
  return _cpdCache;
}
async function saveCPD(uid: any,data: any){
  _cpdCache={..._cpdCache,...data};
  await fbDb.doc(_cpdPath(uid)).set(_cpdCache);
}

function AIDatabasePage({uid,onBack}: any){
  const [cpd,setCpd]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [editingId,setEditingId]=useState<any>(null);
  const [editNotes,setEditNotes]=useState("");
  const [saving,setSaving]=useState(false);
  const [filter,setFilter]=useState("");
  const [catalogOpen,setCatalogOpen]=useState(false);

  useEffect(()=>{
    loadCPD(uid).then((data: any)=>{setCpd(data);setLoading(false);}).catch(()=>setLoading(false));
  },[uid]);

  async function saveAdminNotes(panelId: any){
    setSaving(true);
    const panels=(cpd.panels||[]).map((p: any)=>p.panelId===panelId?{...p,adminNotes:editNotes}:p);
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
  const groups: any={};
  panels.forEach((p: any)=>{
    const equip=(p.controlledEquipment||'Unclassified').split(/,\s*/)[0].trim()||'Unclassified';
    if(!groups[equip])groups[equip]=[];
    groups[equip].push(p);
  });
  const sorted=Object.entries(groups).sort((a: any,b: any)=>a[0].localeCompare(b[0]));
  const filterLow=filter.toLowerCase();
  const filteredSorted=filter?sorted.map(([g,ps]: any)=>[g,(ps as any[]).filter((p: any)=>{
    const hay=JSON.stringify(p).toLowerCase();
    return hay.includes(filterLow);
  })]).filter(([,ps]: any)=>ps.length):sorted;

  return(
    <div style={{padding:"24px 32px",maxWidth:1400,margin:"0 auto"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24}}>
        <button onClick={onBack} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:12,padding:"5px 12px",cursor:"pointer"}}>{"\u2190 Back"}</button>
        <div>
          <div style={{fontSize:20,fontWeight:800,color:"#a78bfa",letterSpacing:1}}>{"\u{1F9E0} ARC AI DATABASE"}</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{panels.length} panels cataloged · {products.length} unique parts</div>
        </div>
        <input value={filter} onChange={(e: any)=>setFilter(e.target.value)} placeholder="Filter by any field…"
          style={{marginLeft:"auto",background:"#0a0a16",border:`1px solid ${C.border}`,borderRadius:6,color:C.text,fontSize:12,padding:"6px 12px",width:240,outline:"none"}}/>
      </div>

      {filteredSorted.length===0&&(
        <div style={{color:C.muted,fontSize:13,padding:"40px 0",textAlign:"center"}}>No panel data yet. Extractions will appear here automatically as panels are scanned.</div>
      )}

      {filteredSorted.map(([equipType,panelGroup]: any)=>(
        <div key={equipType} style={{marginBottom:32}}>
          <div style={{fontSize:13,fontWeight:800,color:"#a78bfa",textTransform:"uppercase",letterSpacing:1,marginBottom:10,paddingBottom:6,borderBottom:`1px solid #a78bfa33`,display:"flex",alignItems:"center",gap:8}}>
            <span>{"\u26A1"}</span>{equipType}
            <span style={{fontSize:11,fontWeight:400,color:C.muted}}>({panelGroup.length} panel{panelGroup.length!==1?"s":""})</span>
          </div>
          {panelGroup.map((p: any)=>(
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
                  ].filter((s: any)=>s.val>0).map((s: any)=>(
                    <div key={s.label} style={{background:s.color+'18',border:`1px solid ${s.color}44`,borderRadius:6,padding:"4px 8px",textAlign:"center",minWidth:52}}>
                      <div style={{fontSize:14,fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
                      <div style={{fontSize:9,color:s.color,opacity:0.8,marginTop:2,letterSpacing:0.3}}>{s.label.toUpperCase()}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* BOM categories summary */}
              {p.bomSummary&&p.bomSummary.length>0&&(()=>{
                const cats: any={};
                p.bomSummary.forEach((r: any)=>{cats[r.category]=(cats[r.category]||0)+1;});
                return(
                  <div style={{marginTop:10,display:"flex",gap:5,flexWrap:"wrap"}}>
                    {Object.entries(cats).sort((a: any,b: any)=>b[1]-a[1]).map(([cat,cnt]: any)=>(
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
                    <textarea value={editNotes} onChange={(e: any)=>setEditNotes(e.target.value)} rows={3} autoFocus
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
          <div onClick={()=>setCatalogOpen((o: any)=>!o)}
            style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:catalogOpen?12:0}}>
            <span style={{fontSize:13,transition:"transform 0.15s",display:"inline-block",transform:catalogOpen?"rotate(90deg)":"none",color:"#a78bfa"}}>{"\u25B8"}</span>
            <div style={{fontSize:13,fontWeight:800,color:"#a78bfa",textTransform:"uppercase",letterSpacing:1}}>{"\u{1F4E6} Product Catalog"}</div>
            <span style={{fontSize:11,color:C.muted,fontWeight:400}}>({products.length} parts)</span>
          </div>
          {catalogOpen&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:8}}>
                {products.filter((p: any)=>!filter||JSON.stringify(p).toLowerCase().includes(filterLow)).slice(0,100).map((p: any)=>(
                  <div key={p.partNumber} style={{background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:6,padding:"9px 12px",fontSize:11}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                      <span style={{fontWeight:700,color:C.accent}}>{p.partNumber}</span>
                      <span style={{fontSize:9,background:C.border,borderRadius:3,padding:"1px 5px",color:C.muted}}>{p.category}</span>
                      {p.seenCount>1&&<span style={{fontSize:9,color:C.green}}>{"×"}{p.seenCount}</span>}
                      {p.enriched&&<span style={{fontSize:9,color:"#a78bfa"}}>{"\u2713 enriched"}</span>}
                    </div>
                    <div style={{color:C.sub,marginBottom:2}}>{p.description}</div>
                    {p.manufacturer&&<div style={{color:C.muted}}>MFR: {p.manufacturer}</div>}
                    {p.shortSpec&&<div style={{color:C.muted,fontStyle:"italic",marginTop:2}}>{p.shortSpec}</div>}
                    {p.enriched&&(p.approvals?.ul||p.approvals?.ce||p.approvals?.csa)&&(
                      <div style={{marginTop:3,display:"flex",gap:4}}>
                        {['ul','ce','csa'].filter((k: any)=>p.approvals[k]&&p.approvals[k]!=='unknown').map((k: any)=>(
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

export default AIDatabasePage;

// ─── Dashboard ───────────────────────────────────────────────────────────────
// Extracted verbatim from monolith v1.19.376 lines 18909-19173, 19305-19344

import React, { useState } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _bcToken, _bcConfig, acquireBcToken, bcPatchJobOData, bcEnqueue, projectStatus, useBgTasks } from '@/core/globals';
import Badge from './shared/Badge';
import useCustomerLogo from './hooks/useCustomerLogo';

// ── PROJECT TILE ──
function ProjectTile({p,onOpen,onDelete,onTransfer,onUpdateStatus,userFirstName,memberMap,draggable:isDraggable,onDragStart,onDragEnd,rfqCount}: any){
  const bgTasks=useBgTasks();
  const customerLogo=useCustomerLogo(p.bcCustomerName||null);
  const activeTask=Object.values(bgTasks).find((t: any)=>t.projectId===p.id&&(t.status==="running"||t.status==="done"||t.status==="error")) as any;
  const st=projectStatus(p);
  const bcDisconnected=p.bcEnv&&_bcConfig&&p.bcEnv!==_bcConfig.env;
  const statusColors: any={draft:C.muted,in_progress:C.yellow,extracted:C.green,validated:C.green,costed:C.green};
  const statusLabels: any={draft:"DRAFT",in_progress:"PROCESSING",extracted:"READY",validated:"READY",costed:"READY"};
  return(
  <div className="fade-in" onClick={()=>onOpen(p)}
    draggable={isDraggable||false}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    style={{...card({padding:"4px 10px"}),border:`1px solid ${C.border}`,cursor:isDraggable?"grab":"pointer",transition:"border-color 0.15s,transform 0.15s",position:"relative",display:"flex",flexDirection:"column",gap:1}}
    onMouseEnter={(e: any)=>{e.currentTarget.style.borderColor=C.accent+"99";e.currentTarget.style.transform="translateY(-2px)";}}
    onMouseLeave={(e: any)=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="none";}}>
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
      {customerLogo&&<img src={customerLogo} alt="" style={{width:22,height:22,objectFit:"contain",borderRadius:3,background:"#fff",padding:2,flexShrink:0}} onError={(e: any)=>{e.target.style.display="none";}}/>}
      <div style={{fontSize:14,fontWeight:800,color:bcDisconnected?"#64748b":C.accent,whiteSpace:"nowrap",visibility:p.bcProjectNumber?"visible":"hidden",flexShrink:0}}>{p.bcProjectNumber||"\u2013"}{bcDisconnected&&<span style={{fontSize:9,color:C.yellow,fontWeight:600,marginLeft:4,verticalAlign:"middle"}} title={"Linked to "+p.bcEnv}>{"\u26A0"}</span>}</div>
      <div style={{fontSize:14,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,visibility:p.bcCustomerName?"visible":"hidden"}}>{p.bcCustomerName||"\u2013"}</div>
      {(()=>{const owner=memberMap&&p.createdBy&&memberMap[p.createdBy];const name=owner?owner.firstName||owner.email.split("@")[0]:userFirstName;return name?<div style={{fontSize:9,color:C.muted,fontWeight:600,letterSpacing:0.3,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textTransform:"uppercase",flexShrink:0}}>{name}</div>:null;})()}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
      <div style={{fontSize:17,fontWeight:700,color:C.green,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.name}</div>
      {rfqCount>0&&<span style={{background:C.redDim,color:C.red,borderRadius:20,padding:"3px 12px",fontSize:13,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap",flexShrink:0}}>{rfqCount} RFQ{rfqCount>1?"S":""}</span>}
      <div style={{flexShrink:0,fontSize:"0.75em"}}><Badge status={p.importedFromBC?"imported":st} project={p}/></div>
    </div>
    {activeTask&&(
      <div style={{marginTop:4}}>
        <div style={{fontSize:10,color:activeTask.status==="error"?C.red:C.accent,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeTask.msg}</div>
        {activeTask.status!=="error"?(
          <div style={{width:"100%",height:4,background:C.border,borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:(activeTask.pct||0)+"%",background:`linear-gradient(90deg,${C.accent},${C.purple})`,borderRadius:4,transition:"width 0.4s"}}/>
          </div>
        ):null}
      </div>
    )}
  </div>
  );
}

// ── DASHBOARD ──
export default function Dashboard({uid,userFirstName,memberMap,projects,loading,onOpen,onNew,onDelete,onAccept,onTransfer,onUpdateProject,sqQuery,sqResults,sqSearching,rfqCounts,forceView}: any){
  const [groupBy,setGroupBy]=useState(forceView==="production"?"production":forceView==="purchasing"?"purchasing":"status");
  const [projectSearch,setProjectSearch]=useState("");
  const [dragProjectId,setDragProjectId]=useState<any>(null);
  const [dropTarget,setDropTarget]=useState<any>(null);
  const bgTasks=useBgTasks();

  function groupProjects(list: any[]){
    if(groupBy==="customer"){
      const map: any={};
      list.forEach((p: any)=>{
        const key=p.bcCustomerName||"No Customer";
        if(!map[key])map[key]=[];
        map[key].push(p);
      });
      return Object.keys(map).sort((a,b)=>a==="No Customer"?1:b==="No Customer"?-1:a.localeCompare(b)).map(k=>({label:k,items:map[k],customerNumber:map[k].find((p: any)=>p.bcCustomerNumber)?.bcCustomerNumber||null}));
    }
    if(groupBy==="date"){
      const map: any={};
      const maxTs: any={};
      list.forEach((p: any)=>{
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
      const sorted=[...list].sort((a: any,b: any)=>{
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
      const labels: any={tobepurchased:"To Be Purchased",inprocess:"Purchasing In Process",completed:"Purchasing Completed"};
      const map: any={};
      list.forEach((p: any)=>{
        if(p.bcPoStatus==="purchasing"){if(!map.inprocess)map.inprocess=[];map.inprocess.push(p);}
        else if(p.bcPoStatus==="Open"){if(!map.tobepurchased)map.tobepurchased=[];map.tobepurchased.push(p);}
        else if(p.bcPoStatus==="purchased"||p.bcPoStatus==="Completed"){if(!map.completed)map.completed=[];map.completed.push(p);}
      });
      return order.map(k=>({label:labels[k],items:map[k]||[]}));
    }
    if(groupBy==="production"){
      const order=["partsopen","inproduction"];
      const labels: any={partsopen:"Parts Orders Open",inproduction:"In Production"};
      const map: any={};
      list.forEach((p: any)=>{
        if(p.bcPoStatus==="purchasing"){if(!map.partsopen)map.partsopen=[];map.partsopen.push(p);}
        if(p.bcPoStatus==="purchasing"||p.bcPoStatus==="Open"){if(!map.inproduction)map.inproduction=[];map.inproduction.push(p);}
      });
      return order.map(k=>({label:labels[k],items:map[k]||[]}));
    }
    if(groupBy==="status"){
      const order=["draft","in_progress","process_rfq","evc","quotes_sent"];
      const labels: any={draft:"Draft",in_progress:"In Process",process_rfq:"RFQ's Send/Receive",evc:"Ready To Review/Send",quotes_sent:"Quotes Sent"};
      const map: any={};
      list.forEach((p: any)=>{
        if(p.bcPoStatus==="purchasing"||p.bcPoStatus==="Open")return; // skip -- shown in PURCHASING/PRODUCTION tabs
        // Quotes Sent = user explicitly marked quote as sent to client
        if(p.quoteSentAt){if(!map.quotes_sent)map.quotes_sent=[];map.quotes_sent.push(p);return;}
        // Process RFQs = has BOM items that are unpriced (unitPrice 0/null or no priceDate)
        const allPanels=p.panels||[];
        const hasBom=allPanels.some((pan: any)=>(pan.bom||[]).length>0);
        const hasUnpriced=hasBom&&allPanels.some((pan: any)=>(pan.bom||[]).filter((r: any)=>!r.isLaborRow&&!r.customerSupplied).some((r: any)=>!r.unitPrice||r.unitPrice===0||!r.priceDate));
        if(hasUnpriced){if(!map.process_rfq)map.process_rfq=[];map.process_rfq.push(p);return;}
        // If has BOM and all items are priced -> Ready To Review/Send
        if(hasBom&&!hasUnpriced){if(!map.evc)map.evc=[];map.evc.push(p);return;}
        let st=projectStatus(p);if(st==="extracted"||st==="validated"||st==="costed"||st==="quoted"||st==="pushed_to_bc")st="evc";if(!map[st])map[st]=[];map[st].push(p);
      });
      return order.map(k=>({label:labels[k],items:map[k]||[]}));
    }
    if(groupBy==="budgetary"){
      return [{label:"Budgetary Quotes",items:list.filter((p: any)=>(p.panels||[]).some((pan: any)=>(pan.pricing||{}).isBudgetary))}];
    }
    if(groupBy==="imported"){
      return [{label:null,items:list.filter((p: any)=>p.importedFromBC)}];
    }
    if(groupBy==="active"){
      return [{label:"Open Orders (Purchasing)",items:list.filter((p: any)=>p.bcPoStatus==="Open")}];
    }
    return [{label:null,items:list}];
  }

  async function assignCustomer(projectId: any,customerName: any,customerNumber: any){
    const proj=projects.find((p: any)=>p.id===projectId);
    if(!proj||proj.bcCustomerName)return;
    const updated={...proj,bcCustomerName:customerName,bcCustomerNumber:customerNumber,updatedAt:Date.now()};
    await onUpdateProject(updated);
    if(proj.bcProjectNumber&&customerNumber){
      try{
        let token=_bcToken;
        if(!token){token=await acquireBcToken(false)||null;}
        if(!token){token=await acquireBcToken(true)||null;}
        const _custFields={Bill_to_Customer_No:customerNumber};
        await bcPatchJobOData(proj.bcProjectNumber,_custFields).catch((e: any)=>{
          if(!_bcToken)bcEnqueue('patchJob',{projectNumber:proj.bcProjectNumber,fields:_custFields},`Update BC project ${proj.bcProjectNumber}`);
          else throw e;
        });
      }catch(e){console.warn("BC customer assign failed:",e);}
    }
  }
  const filterBtn=(label: string,val: string)=>(
    <button key={val} onClick={()=>setGroupBy(val)} style={{background:groupBy===val?C.accent:C.bg,color:groupBy===val?"#fff":C.muted,border:groupBy===val?`1.5px solid ${C.accent}`:`1.5px solid ${C.border}`,borderRadius:8,padding:"8px 20px",fontSize:14,cursor:"pointer",fontWeight:600,transition:"all 0.15s"}}>
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
          <input value={projectSearch} onChange={(e: any)=>setProjectSearch(e.target.value)} placeholder="\uD83D\uDD0D Search projects\u2026"
            style={{...inp({fontSize:13,padding:"9px 12px 9px 12px",borderRadius:8,width:"100%",boxSizing:"border-box"})}}/>
          {projectSearch&&<button onClick={()=>setProjectSearch("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:16,lineHeight:1,padding:0}}>{"\u2715"}</button>}
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
          <div className="spin" style={{fontSize:24,marginBottom:12}}>{"\u25CC"}</div>
          <div>Loading projects\u2026</div>
        </div>
      )}

      {(()=>{
        let myProjects=projects.filter((p: any)=>(!p.transferred||p.transferredTo!==uid)&&(groupBy==="imported"||groupBy==="active"||groupBy==="purchasing"||groupBy==="budgetary"||groupBy==="production"||forceView==="purchasing"||!p.importedFromBC));
        // Apply search filter
        if(projectSearch.trim()){
          const q=projectSearch.trim().toLowerCase();
          myProjects=myProjects.filter((p: any)=>{
            const fields=[p.name,p.bcProjectNumber,p.customerName,p.drawingNo,
              ...(p.panels||[]).flatMap((pan: any)=>[pan.name,pan.drawingNo,pan.drawingDesc,
                ...(pan.bom||[]).map((r: any)=>r.partNumber),...(pan.bom||[]).map((r: any)=>r.description),...(pan.bom||[]).map((r: any)=>r.bcVendorName)])];
            return fields.some((f: any)=>(f||"").toLowerCase().includes(q));
          });
        }
        const transferred=projects.filter((p: any)=>p.transferred&&p.transferredTo===uid);
        const groups=groupProjects(myProjects);
        return(<>
          {!loading&&myProjects.length===0&&transferred.length===0&&(
            <div style={{textAlign:"center",padding:80,color:C.muted}}>
              <div style={{fontSize:52,marginBottom:16,opacity:0.2}}>{"\u2B21"}</div>
              <div style={{fontSize:18,fontWeight:700,color:C.sub,marginBottom:8}}>No projects yet</div>
              <div style={{fontSize:13,marginBottom:24,lineHeight:1.7}}>Upload scanned UL508A drawings to extract<br/>BOM data, validate schematics, and generate quotes.</div>
              <button onClick={onNew} style={btn(C.accent,"#fff")}>Create First Project</button>
            </div>
          )}
          {(groupBy==="customer"||groupBy==="status"||groupBy==="production"||groupBy==="purchasing")?(
            <div style={{display:"flex",gap:16,alignItems:"flex-start",width:"100%",paddingBottom:8}}>
              {groups.map((g: any,gi: number)=>{
                const statusColColors: any={Draft:C.muted,"In Process":C.yellow,"RFQ's Send/Receive":C.red,"Ready To Review/Send":C.green,"Quotes Sent":C.accent,"To Be Purchased":C.yellow,"Purchasing In Process":C.accent,"Purchasing Completed":C.green,"Parts Orders Open":C.yellow,"In Production":C.purple};
                const statusColBg: any={Draft:C.border,"In Process":C.yellowDim,"RFQ's Send/Receive":C.redDim,"Ready To Review/Send":C.greenDim,"Quotes Sent":C.accentDim,"To Be Purchased":C.yellowDim,"Purchasing In Process":C.accentDim,"Purchasing Completed":C.greenDim,"Parts Orders Open":C.yellowDim,"In Production":"#f3f0ff"};
                const colColor=(groupBy==="status"||groupBy==="production"||groupBy==="purchasing")?(statusColColors[g.label]||C.muted):C.sub;
                const colBg=(groupBy==="status"||groupBy==="production"||groupBy==="purchasing")?(statusColBg[g.label]||C.border):C.accentDim;
                const isNoCustomer=groupBy==="customer"&&g.label==="No Customer";
                const isDropTarget_=groupBy==="customer"&&!isNoCustomer&&!!g.customerNumber&&!!dragProjectId;
                const isOver=dropTarget===gi;
                return(
                <div key={gi} style={{flex:"1 1 0",minWidth:180}}
                  onDragOver={isDropTarget_?(e: any)=>{e.preventDefault();setDropTarget(gi);}:undefined}
                  onDragLeave={isDropTarget_?(e: any)=>{if(!e.currentTarget.contains(e.relatedTarget))setDropTarget(null);}:undefined}
                  onDrop={isDropTarget_?(e: any)=>{e.preventDefault();setDropTarget(null);if(dragProjectId)assignCustomer(dragProjectId,g.label,g.customerNumber);setDragProjectId(null);}:undefined}>
                  {g.label&&<div style={{background:isOver?C.accent:colBg,color:isOver?"#fff":colColor,borderRadius:8,fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10,textAlign:"center",height:44,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxSizing:"border-box",width:"100%",transition:"background 0.15s,color 0.15s",outline:isDropTarget_&&dragProjectId?(isOver?"2px solid "+C.accent:"2px dashed "+C.accent+"66"):"none",outlineOffset:2}}><span>{g.label}</span><span style={{opacity:0.6,fontWeight:400}}>({g.items.length})</span></div>}
                  <div style={{display:"flex",flexDirection:"column",gap:8,borderRadius:8,padding:isOver?"6px":"0",background:isOver?C.accentDim:"transparent",transition:"background 0.15s,padding 0.15s"}}>
                    {g.items.map((p: any)=>(
                      <ProjectTile key={p.id} p={p} onOpen={onOpen} onDelete={onDelete} onTransfer={onTransfer}
                        onUpdateStatus={onUpdateProject?async(proj: any,newStatus: any)=>{const u={...proj,bcPoStatus:newStatus,updatedAt:Date.now()};await onUpdateProject(u);}:undefined}
                        userFirstName={userFirstName} memberMap={memberMap} rfqCount={rfqCounts?.[p.id]||0}
                        draggable={isNoCustomer}
                        onDragStart={isNoCustomer?(e: any)=>{e.dataTransfer.effectAllowed="move";setDragProjectId(p.id);}:undefined}
                        onDragEnd={isNoCustomer?()=>{setDragProjectId(null);setDropTarget(null);}:undefined}/>
                    ))}
                  </div>
                </div>
                );
              })}
            </div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:32}}>
              {groups.map((g: any,gi: number)=>(
                <div key={gi}>
                  {g.label&&<div style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:12,paddingBottom:6,borderBottom:`1px solid ${C.border}`}}>{g.label}</div>}
                  <div data-tour="project-list" style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
                    {g.items.map((p: any)=>(
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
                {transferred.map((p: any)=>{
                  const activeTask=Object.values(bgTasks).find((t: any)=>t.projectId===p.id&&(t.status==="running"||t.status==="done"||t.status==="error")) as any;
                  const st=projectStatus(p);
                  const statusColors: any={draft:C.muted,in_progress:C.yellow,extracted:C.green,validated:C.green,costed:C.green,pushed_to_bc:C.accent};
                  const statusLabels: any={draft:"DRAFT",in_progress:"PROCESSING",extracted:"READY",validated:"READY",costed:"READY",pushed_to_bc:"PUSHED TO BC"};
                  return(
                  <div key={p.id} className="fade-in" onClick={()=>onOpen(p)}
                    style={{...card({padding:"10px 14px"}),cursor:"pointer",borderColor:C.yellow+"44",transition:"border-color 0.15s,transform 0.15s",display:"flex",flexDirection:"column"}}
                    onMouseEnter={(e: any)=>{e.currentTarget.style.borderColor=C.yellow;e.currentTarget.style.transform="translateY(-2px)";}}
                    onMouseLeave={(e: any)=>{e.currentTarget.style.borderColor=C.yellow+"44";e.currentTarget.style.transform="none";}}>
                    <div style={{fontSize:10,color:C.yellow,fontWeight:700,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>From {p.transferredFrom?.email||"a removed member"}</div>
                    <div style={{fontSize:14,fontWeight:700,color:C.text,lineHeight:1.3,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    {p.bcCustomerName&&<div style={{fontSize:11,color:C.teal,marginBottom:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.bcCustomerName}</div>}
                    <div style={{fontSize:11,color:C.muted,marginBottom:"auto"}}>{p.createdAt?new Date(p.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):p.updatedAt?new Date(p.updatedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"\u2014"}</div>
                    {activeTask&&(
                      <div style={{marginTop:6}}>
                        <div style={{fontSize:10,color:activeTask.status==="error"?C.red:C.accent,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeTask.msg}</div>
                        {activeTask.status!=="error"?(
                          <div style={{width:"100%",height:4,background:C.border,borderRadius:4,overflow:"hidden"}}>
                            <div style={{height:"100%",width:(activeTask.pct||0)+"%",background:`linear-gradient(90deg,${C.accent},${C.purple})`,borderRadius:4,transition:"width 0.4s"}}/>
                          </div>
                        ):null}
                      </div>
                    )}
                    <div style={{marginTop:5,marginBottom:6}}><Badge status={st} project={p}/></div>
                    <button onClick={(e: any)=>{e.stopPropagation();onAccept(p.id);}}
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

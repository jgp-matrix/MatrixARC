import { useState } from 'react';
import { C, btn, card } from '@/core/constants';
import { _appCtx, _bcToken, _bcConfig, acquireBcToken, bcPatchJobOData, bcEnqueue, projectStatus, useBgTasks } from '@/core/globals';

function Badge({status}: any) {
  const colors: any = {draft:C.muted, extracted:C.green, validated:C.green, costed:C.purple, pushed_to_bc:'#38bdf8', complete:C.green};
  const labels: any = {draft:'DRAFT', in_progress:'PROCESSING', extracted:'EXTRACTED', validated:'VALIDATED', costed:'COSTED', pushed_to_bc:'IN BC', complete:'COMPLETE'};
  return <span style={{fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, color:colors[status]||C.muted}}>{labels[status]||status}</span>;
}

function ProjectTile({p,onOpen,onDelete,onTransfer,onUpdateStatus,userFirstName,memberMap,draggable:isDraggable,onDragStart,onDragEnd,rfqCount}: any){
  const bgTasks=useBgTasks();
  const activeTask=Object.values(bgTasks).find((t: any)=>t.projectId===p.id&&(t.status==="running"||t.status==="done"||t.status==="error")) as any;
  const st=projectStatus(p);
  const bcDisconnected=p.bcEnv&&_bcConfig&&p.bcEnv!==_bcConfig.env;
  return(
  <div className="fade-in" onClick={()=>onOpen(p)}
    draggable={isDraggable||false}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    style={{...card({padding:"4px 10px"}),border:"1px solid #4a5080",cursor:isDraggable?"grab":"pointer",transition:"border-color 0.15s,transform 0.15s",position:"relative",display:"flex",flexDirection:"column",gap:1}}
    onMouseEnter={e=>{(e.currentTarget as any).style.borderColor=C.accent+"99";(e.currentTarget as any).style.transform="translateY(-2px)";}}
    onMouseLeave={e=>{(e.currentTarget as any).style.borderColor="#4a5080";(e.currentTarget as any).style.transform="none";}}>
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
      <div style={{fontSize:14,fontWeight:800,color:bcDisconnected?"#64748b":C.accent,whiteSpace:"nowrap",visibility:p.bcProjectNumber?"visible":"hidden",flexShrink:0}}>{p.bcProjectNumber||"–"}{bcDisconnected&&<span style={{fontSize:9,color:C.yellow,fontWeight:600,marginLeft:4,verticalAlign:"middle"}} title={"Linked to "+p.bcEnv}>⚠</span>}</div>
      <div style={{fontSize:14,color:C.text,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1,visibility:p.bcCustomerName?"visible":"hidden"}}>{p.bcCustomerName||"–"}</div>
      {(()=>{const owner=memberMap&&p.createdBy&&memberMap[p.createdBy];const name=owner?owner.firstName||owner.email.split("@")[0]:userFirstName;return name?<div style={{fontSize:9,color:C.muted,fontWeight:600,letterSpacing:0.3,maxWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textTransform:"uppercase",flexShrink:0}}>{name}</div>:null;})()}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
      <div style={{fontSize:17,fontWeight:700,color:C.green,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.name}</div>
      {rfqCount>0&&<span style={{background:C.redDim,color:C.red,borderRadius:20,padding:"3px 12px",fontSize:13,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap",flexShrink:0}}>{rfqCount} RFQ{rfqCount>1?"S":""}</span>}
      <div style={{flexShrink:0,fontSize:"0.75em"}}><Badge status={p.importedFromBC?"imported":st}/></div>
    </div>
    {activeTask&&(
      <div style={{marginTop:4}}>
        <div style={{fontSize:10,color:activeTask.status==="error"?C.red:C.accent,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{activeTask.msg}</div>
        {activeTask.status!=="error"?(
          <div style={{width:"100%",height:4,background:C.border,borderRadius:4,overflow:"hidden"}}>
            <div style={{height:"100%",width:(activeTask.pct||0)+"%",background:`linear-gradient(90deg,${C.accent},#818cf8)`,borderRadius:4,transition:"width 0.4s"}}/>
          </div>
        ):null}
      </div>
    )}
  </div>
  );
}

export default function Dashboard({uid,userFirstName,memberMap,projects,loading,onOpen,onNew,onDelete,onAccept,onTransfer,onUpdateProject,sqQuery,sqResults,sqSearching,rfqCounts}: any){
  const [groupBy,setGroupBy]=useState("status");
  const [dragProjectId,setDragProjectId]=useState<string|null>(null);
  const [dropTarget,setDropTarget]=useState<number|null>(null);
  const bgTasks=useBgTasks();

  function groupProjects(list: any[]){
    if(groupBy==="customer"){
      const map: any={};
      list.forEach(p=>{
        const key=p.bcCustomerName||"No Customer";
        if(!map[key])map[key]=[];
        map[key].push(p);
      });
      return Object.keys(map).sort((a,b)=>a==="No Customer"?1:b==="No Customer"?-1:a.localeCompare(b)).map(k=>({label:k,items:map[k],customerNumber:map[k].find((p: any)=>p.bcCustomerNumber)?.bcCustomerNumber||null}));
    }
    if(groupBy==="date"){
      const map: any={};
      const maxTs: any={};
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
      return [{label:null as any,items:sorted}];
    }
    if(groupBy==="status"){
      const order=["draft","in_progress","evc","process_rfq","active","purchasing"];
      const labels: any={draft:"Draft",in_progress:"In Progress",evc:"Ready",process_rfq:"Process RFQs",active:"Active (Ready for Purchasing)",purchasing:"Purchasing In Progress"};
      const map: any={};
      list.forEach(p=>{
        if((rfqCounts?.[p.id]||0)>0){if(!map.process_rfq)map.process_rfq=[];map.process_rfq.push(p);return;}
        if(p.bcPoStatus==="purchasing"){if(!map.purchasing)map.purchasing=[];map.purchasing.push(p);return;}
        if(p.bcPoStatus==="Open"){if(!map.active)map.active=[];map.active.push(p);return;}
        let st=projectStatus(p);if(st==="extracted"||st==="validated"||st==="costed"||st==="quoted"||st==="pushed_to_bc")st="evc";if(!map[st])map[st]=[];map[st].push(p);
      });
      return order.map(k=>({label:labels[k],items:map[k]||[]}));
    }
    if(groupBy==="imported"){
      return [{label:null as any,items:list.filter(p=>p.importedFromBC)}];
    }
    if(groupBy==="active"){
      return [{label:"Active (Ready for Purchasing)",items:list.filter(p=>p.bcPoStatus==="Open")}];
    }
    if(groupBy==="purchasing"){
      return [{label:"Purchasing In Progress",items:list.filter(p=>p.bcPoStatus==="purchasing")}];
    }
    return [{label:null as any,items:list}];
  }

  async function assignCustomer(projectId: string,customerName: string,customerNumber: string){
    const proj=projects.find((p: any)=>p.id===projectId);
    if(!proj||proj.bcCustomerName)return;
    const updated={...proj,bcCustomerName:customerName,bcCustomerNumber:customerNumber,updatedAt:Date.now()};
    await onUpdateProject(updated);
    if(proj.bcProjectNumber&&customerNumber){
      try{
        let token = _bcToken;
        if(!token){token=await acquireBcToken(false)||null;}
        if(!token){token=await acquireBcToken(true)||null;}
        const _custFields={Bill_to_Customer_No:customerNumber};
        await bcPatchJobOData(proj.bcProjectNumber,_custFields).catch((e: any)=>{
          if(!token)bcEnqueue('patchJob',{projectNumber:proj.bcProjectNumber,fields:_custFields},`Update BC project ${proj.bcProjectNumber}`);
          else throw e;
        });
      }catch(e){console.warn("BC customer assign failed:",e);}
    }
  }

  const filterBtn=(label: string,val: string)=>(
    <button key={val} onClick={()=>setGroupBy(val)} style={{background:groupBy===val?C.accent:"#383850",color:groupBy===val?"#fff":C.muted,border:groupBy===val?`1.5px solid ${C.accent}`:"1.5px solid #7a7a9a",borderRadius:8,padding:"8px 20px",fontSize:14,cursor:"pointer",fontWeight:600,transition:"all 0.15s"}}>
      {label}
    </button>
  );

  return(
    <div style={{maxWidth:2100,margin:"0 auto",padding:32,minWidth:0,width:"100%",boxSizing:"border-box"}}>

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <div style={{fontSize:26,fontWeight:800,letterSpacing:-0.5}}>Projects</div>
        <button data-tip="Start a new panel extraction project" data-tour="new-project-btn" onClick={onNew} style={btn(C.accent,"#fff",{display:"flex",alignItems:"center",gap:8,fontSize:14})}>
          <span style={{fontSize:18,lineHeight:1}}>+</span> New Project
        </button>
      </div>

      {/* AI Search results are now shown in the floating chat panel above */}

      <div style={{display:"flex",gap:8,marginBottom:groupBy!=="imported"?8:24}}>
        {filterBtn("By Status","status")}
        {filterBtn("By Customer","customer")}
        {filterBtn("By Date","date")}
        {filterBtn("By Project #","projectnum")}
        {filterBtn("Active (Ready for Purchasing)","active")}
        {filterBtn("Purchasing In Progress","purchasing")}
        {filterBtn("Imported","imported")}
        {filterBtn("All","all")}
      </div>

      {loading&&(
        <div style={{textAlign:"center",padding:80,color:C.muted}}>
          <div className="spin" style={{fontSize:24,marginBottom:12}}>◌</div>
          <div>Loading projects…</div>
        </div>
      )}

      {(()=>{
        const myProjects=projects.filter((p: any)=>(!p.transferred||p.transferredTo!==uid)&&(groupBy==="imported"||groupBy==="active"||groupBy==="purchasing"||!p.importedFromBC));
        const transferred=projects.filter((p: any)=>p.transferred&&p.transferredTo===uid);
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
          {(groupBy==="customer"||groupBy==="status")?(
            <div style={{display:"flex",gap:16,alignItems:"flex-start",width:"100%",paddingBottom:8}}>
              {groups.map((g: any,gi: number)=>{
                const statusColColors: any={Draft:C.muted,"In Progress":C.yellow,Ready:C.green,"Process RFQs":C.red,"Active (Ready for Purchasing)":"#38bdf8","Purchasing In Progress":"#f59e0b"};
                const statusColBg: any={Draft:C.border,"In Progress":C.yellowDim,Ready:C.greenDim,"Process RFQs":C.redDim,"Active (Ready for Purchasing)":"#0c2233","Purchasing In Progress":"#1c1200"};
                const colColor=groupBy==="status"?(statusColColors[g.label]||C.muted):C.sub;
                const colBg=groupBy==="status"?(statusColBg[g.label]||C.border):"#2a2a3e";
                const isNoCustomer=groupBy==="customer"&&g.label==="No Customer";
                const isDropTarget=groupBy==="customer"&&!isNoCustomer&&!!g.customerNumber&&!!dragProjectId;
                const isOver=dropTarget===gi;
                return(
                <div key={gi} style={{flex:"1 1 0",minWidth:180}}
                  onDragOver={isDropTarget?e=>{e.preventDefault();setDropTarget(gi);}:undefined}
                  onDragLeave={isDropTarget?e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDropTarget(null);}:undefined}
                  onDrop={isDropTarget?e=>{e.preventDefault();setDropTarget(null);if(dragProjectId)assignCustomer(dragProjectId,g.label,g.customerNumber);setDragProjectId(null);}:undefined}>
                  {g.label&&<div style={{background:isOver?C.accent:colBg,color:isOver?"#fff":colColor,borderRadius:8,fontSize:13,fontWeight:700,textTransform:"uppercase",letterSpacing:0.6,marginBottom:10,textAlign:"center",height:44,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxSizing:"border-box",width:"100%",transition:"background 0.15s,color 0.15s",outline:isDropTarget&&dragProjectId?(isOver?"2px solid "+C.accent:"2px dashed "+C.accent+"66"):"none",outlineOffset:2}}><span>{g.label}</span><span style={{opacity:0.6,fontWeight:400}}>({g.items.length})</span></div>}
                  <div style={{display:"flex",flexDirection:"column",gap:8,borderRadius:8,padding:isOver?"6px":"0",background:isOver?"#1e2e1e":"transparent",transition:"background 0.15s,padding 0.15s"}}>
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
                  return(
                  <div key={p.id} className="fade-in" onClick={()=>onOpen(p)}
                    style={{...card({padding:"10px 14px"}),cursor:"pointer",borderColor:C.yellow+"44",transition:"border-color 0.15s,transform 0.15s",display:"flex",flexDirection:"column"}}
                    onMouseEnter={e=>{(e.currentTarget as any).style.borderColor=C.yellow;(e.currentTarget as any).style.transform="translateY(-2px)";}}
                    onMouseLeave={e=>{(e.currentTarget as any).style.borderColor=C.yellow+"44";(e.currentTarget as any).style.transform="none";}}>
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
                    <div style={{marginTop:5,marginBottom:6}}><Badge status={st}/></div>
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

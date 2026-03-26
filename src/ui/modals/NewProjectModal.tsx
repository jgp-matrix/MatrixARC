import { useState, useEffect } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import {
  _bcToken, _bcConfig, acquireBcToken, bcLoadAllCustomers, saveProject,
} from '@/core/globals';

// ── Inline stubs for BC functions not yet extracted ──
async function bcCreateProject(name: string, customerNumber: string): Promise<any> { return { number: '', id: '', customerNumber, customerName: '' }; }
async function bcCreatePanelTaskStructure(bcNo: string, name: string, panels: any[]): Promise<any> { return 0; }
function bcFilterCustomers(all: any[], query: string): any[] {
  if (!query.trim()) return all.slice(0, 25);
  const q = query.toLowerCase();
  return all.filter((c: any) => (c.displayName || '').toLowerCase().includes(q) || (c.number || '').toLowerCase().includes(q)).slice(0, 25);
}
async function bcCreateCustomer(name: string, phone: string, email: string): Promise<any> { return { number: '', displayName: name }; }

export default function NewProjectModal({uid,onCreated,onClose}: any){
  const [name,setName]=useState("");
  const [panelCount,setPanelCount]=useState(1);
  const [loading,setLoading]=useState(false);
  const [bcStatus,setBcStatus]=useState<any>(null);
  const [createErr,setCreateErr]=useState("");
  const [customerQuery,setCustomerQuery]=useState("");
  const [allCustomers,setAllCustomers]=useState<any[]>([]);
  const [customerResults,setCustomerResults]=useState<any[]>([]);
  const [customerSearching,setCustomerSearching]=useState(false);
  const [selectedCustomer,setSelectedCustomer]=useState<any>(null);
  const [showDropdown,setShowDropdown]=useState(false);
  const [bcConnected,setBcConnected]=useState(!!_bcToken);
  const [showNewCust,setShowNewCust]=useState(false);
  const [newCustName,setNewCustName]=useState("");
  const [newCustPhone,setNewCustPhone]=useState("");
  const [newCustEmail,setNewCustEmail]=useState("");
  const [creatingCust,setCreatingCust]=useState(false);
  const [newCustErr,setNewCustErr]=useState("");

  useEffect(()=>{
    if(_bcToken){loadCustomers();return;}
    acquireBcToken(false).then((t: any)=>{
      if(t){setBcConnected(true);loadCustomers();}
    }).catch(()=>{});
  },[]);

  // Block Escape key — modal must only close via Cancel or Create buttons
  useEffect(()=>{
    function blockEsc(e: any){if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();}}
    window.addEventListener("keydown",blockEsc,{capture:true});
    return()=>window.removeEventListener("keydown",blockEsc,{capture:true});
  },[]);

  async function loadCustomers(){
    setCustomerSearching(true);
    const all=await bcLoadAllCustomers();
    setAllCustomers(all);
    setCustomerResults(all.slice(0,25));
    setCustomerSearching(false);
  }

  async function connectBC(){
    setCustomerSearching(true);
    const t=await acquireBcToken(true);
    if(t){setBcConnected(true);await loadCustomers();}
    setCustomerSearching(false);
  }

  function handleCustomerInput(val: any){
    setCustomerQuery(val);
    setSelectedCustomer(null);
    setShowDropdown(true);
    setCustomerResults(bcFilterCustomers(allCustomers,val));
  }

  function selectCustomer(c: any){
    setSelectedCustomer(c);
    setCustomerQuery(c.displayName);
    setShowDropdown(false);
  }

  async function createNewCustomer(){
    if(!newCustName.trim())return;
    setCreatingCust(true);setNewCustErr("");
    try{
      const c=await bcCreateCustomer(newCustName.trim(),newCustPhone.trim(),newCustEmail.trim());
      selectCustomer(c);
      const all=await bcLoadAllCustomers();
      setAllCustomers(all);
      setShowNewCust(false);setNewCustName("");setNewCustPhone("");setNewCustEmail("");
    }catch(err: any){setNewCustErr(err.message||"Failed to create customer in BC");}
    setCreatingCust(false);
  }

  async function create(e: any){
    e.preventDefault();
    if(!name.trim()||!selectedCustomer)return;
    setLoading(true);setCreateErr("");
    const trimmed=name.trim();
    if(!_bcToken){setBcStatus("connecting");await acquireBcToken(true);}
    if(!_bcToken){setCreateErr("Could not connect to Business Central. Please try again.");setLoading(false);return;}
    try{
      setBcStatus("creating");
      const bc=await bcCreateProject(trimmed,selectedCustomer.number);
      const panelList=Array.from({length:Math.max(1,panelCount)},(_: any,i: any)=>({id:`panel-${i+1}`,name:`Panel ${i+1}`}));
      setBcStatus("tasks");
      let taskWarn: any=null;
      try{
        const taskCount=await bcCreatePanelTaskStructure(bc.number,trimmed,panelList);
        console.log(`bcCreatePanelTaskStructure: ${taskCount} tasks created`);
      }catch(te: any){
        console.error("bcCreatePanelTaskStructure failed:",te.message);
        taskWarn=te.message;
      }
      setBcStatus(taskWarn?"taskwarn":"ok");
      const p=await saveProject(uid,{
        name:trimmed,
        bcProjectId:bc.id,
        bcProjectNumber:bc.number,
        bcEnv:(_bcConfig as any)?.env,
        bcCustomerNumber:bc.customerNumber,
        bcCustomerName:bc.customerName||selectedCustomer.displayName,
        status:"draft",
        panels:panelList.map((panel: any)=>({...panel,pages:[],bom:[],validation:null,pricing:null,budgetaryQuote:null,status:'draft'})),
        createdAt:Date.now(),updatedAt:Date.now()
      });
      if(taskWarn){
        setCreateErr(`Project created, but BC task structure failed: ${taskWarn} — ensure 'ProjectTaskLines' (page 1002) is published in BC Web Services.`);
        setLoading(false);
        return; // don't auto-navigate — let user see the warning
      }
      onCreated(p);
    }catch(e: any){
      setBcStatus(null);
      setCreateErr(e.message||"Failed to create project in Business Central.");
      setLoading(false);
    }
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={(e: any)=>e.stopPropagation()} onMouseDown={(e: any)=>e.stopPropagation()}>
      <div style={{...card(),width:"100%",maxWidth:460}}>
        <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>New Project</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Name this control panel quote</div>
        <form onSubmit={create}>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:6}}>Project Name</div>
          <input value={name} onChange={(e: any)=>setName(e.target.value)} placeholder="e.g. Conveyor Control Panel" style={{...inp(),marginBottom:16}} autoFocus/>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase" as const,letterSpacing:0.5,marginBottom:6}}>Number of Panels</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <button type="button" onClick={()=>setPanelCount((c: any)=>Math.max(1,c-1))} style={{width:32,height:32,borderRadius:6,border:`1px solid ${C.border}`,background:C.border,color:C.text,fontSize:18,cursor:"pointer",lineHeight:1}}>−</button>
            <span style={{fontSize:20,fontWeight:700,minWidth:32,textAlign:"center" as const}}>{panelCount}</span>
            <button type="button" onClick={()=>setPanelCount((c: any)=>Math.min(20,c+1))} style={{width:32,height:32,borderRadius:6,border:`1px solid ${C.border}`,background:C.border,color:C.text,fontSize:18,cursor:"pointer",lineHeight:1}}>+</button>
            <span style={{fontSize:12,color:C.muted}}>{panelCount===1?"1 panel will be created":`${panelCount} panels will be created`}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase" as const,letterSpacing:0.5}}>Customer <span style={{color:C.border,fontWeight:400,textTransform:"none" as const,letterSpacing:0}}>(from Business Central)</span></div>
            {bcConnected&&!showNewCust&&<button type="button" onClick={()=>setShowNewCust(true)} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,padding:0,fontWeight:600}}>+ New Customer</button>}
          </div>
          {showNewCust&&(
            <div style={{background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:8,padding:14,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:10}}>Create New BC Customer</div>
              <input value={newCustName} onChange={(e: any)=>setNewCustName(e.target.value)} placeholder="Customer Name *" style={{...inp(),marginBottom:8}}/>
              <input value={newCustPhone} onChange={(e: any)=>setNewCustPhone(e.target.value)} placeholder="Phone (optional)" style={{...inp(),marginBottom:8}}/>
              <input value={newCustEmail} onChange={(e: any)=>setNewCustEmail(e.target.value)} placeholder="Email (optional)" onKeyDown={(e: any)=>{if(e.key==='Enter')e.target.blur();}} style={{...inp(),marginBottom:10}}/>
              {newCustErr&&<div style={{fontSize:11,color:C.red,marginBottom:8}}>{newCustErr}</div>}
              <div style={{display:"flex",gap:8}}>
                <button type="button" onClick={()=>{setShowNewCust(false);setNewCustName("");setNewCustPhone("");setNewCustEmail("");setNewCustErr("");}} style={btn(C.border,C.sub,{flex:1,fontSize:12})}>Cancel</button>
                <button type="button" onClick={createNewCustomer} disabled={!newCustName.trim()||creatingCust} style={btn(C.accent,"#fff",{flex:2,fontSize:12,opacity:!newCustName.trim()||creatingCust?0.5:1})}>{creatingCust?"Creating in BC…":"Create in BC"}</button>
              </div>
            </div>
          )}
          {!bcConnected?(
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,background:C.border,borderRadius:8,padding:"10px 14px"}}>
              <span style={{fontSize:12,color:C.muted,flex:1}}>Connect to BC to pick a customer</span>
              <button type="button" onClick={connectBC} disabled={customerSearching}
                style={btn(C.accent,"#fff",{fontSize:12,padding:"6px 14px",opacity:customerSearching?0.5:1})}>
                {customerSearching?"Connecting…":"Connect BC"}
              </button>
            </div>
          ):(
            <div style={{position:"relative",marginBottom:16}}>
              <input
                value={customerQuery}
                onChange={(e: any)=>handleCustomerInput(e.target.value)}
                onFocus={()=>setShowDropdown(true)}
                onBlur={()=>setTimeout(()=>setShowDropdown(false),150)}
                onKeyDown={(e: any)=>{if(e.key==="Tab"&&customerResults.length===1){e.preventDefault();selectCustomer(customerResults[0]);}}}
                placeholder={customerSearching?"Loading customers…":"Search by name or number…"}
                style={{...inp()}}
              />
              {selectedCustomer&&<div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:C.green,fontSize:14}}>✓</div>}
              {showDropdown&&customerResults.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,zIndex:10,maxHeight:200,overflowY:"auto" as const,marginTop:4,boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}>
                  {customerResults.map((c: any)=>(
                    <div key={c.number} onMouseDown={()=>selectCustomer(c)}
                      style={{padding:"9px 12px",cursor:"pointer",display:"flex",gap:10,alignItems:"center"}}
                      onMouseEnter={(e: any)=>e.currentTarget.style.background=C.border}
                      onMouseLeave={(e: any)=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:11,color:C.muted,minWidth:60,fontFamily:"monospace"}}>{c.number}</span>
                      <span style={{fontSize:13,color:C.text}}>{c.displayName}</span>
                    </div>
                  ))}
                </div>
              )}
              {showDropdown&&!customerSearching&&customerResults.length===0&&customerQuery&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.card,border:`1px solid ${C.border}`,borderRadius:8,zIndex:10,padding:"10px 12px",marginTop:4,fontSize:12,color:C.muted}}>No customers found</div>
              )}
            </div>
          )}
          {bcStatus==="connecting"&&<div style={{fontSize:12,color:C.muted,marginBottom:10}}>Connecting to Business Central...</div>}
          {bcStatus==="creating"&&<div style={{fontSize:12,color:C.muted,marginBottom:10}}>Creating project in Business Central…</div>}
          {bcStatus==="tasks"&&<div style={{fontSize:12,color:C.muted,marginBottom:10}}>Building project task structure in BC…</div>}
          {bcStatus==="taskwarn"&&<div style={{fontSize:12,color:C.yellow,marginBottom:10}}>Project created — task structure pending (see error below)</div>}
          {createErr&&<div style={{fontSize:12,color:C.red,background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:"10px 12px",marginBottom:12}}>{createErr}</div>}
          {!selectedCustomer&&name.trim()&&<div style={{fontSize:12,color:C.yellow,marginBottom:10}}>A customer is required to create a project.</div>}
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <button type="button" onClick={onClose} style={btn(C.border,C.sub,{flex:1})}>Cancel</button>
            <button type="submit" disabled={!name.trim()||!selectedCustomer||loading} style={btn(C.accent,"#fff",{flex:2,opacity:!name.trim()||!selectedCustomer||loading?0.5:1})}>
              {loading?"Creating…":"Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

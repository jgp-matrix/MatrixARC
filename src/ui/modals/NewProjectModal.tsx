// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';
import { bcCreateProject, bcCreatePanelTaskStructure, bcFilterCustomers, bcCreateCustomer } from '@/services/businessCentral/projects';
import { bcFetchCustomerContacts, bcCreateContact } from '@/services/businessCentral/vendors';

function NewProjectModal({uid,onCreated,onClose}){
  const [name,setName]=useState("");
  const [panelCount,setPanelCount]=useState(1);
  const [loading,setLoading]=useState(false);
  const [bcStatus,setBcStatus]=useState(null);
  const [createErr,setCreateErr]=useState("");
  const [customerQuery,setCustomerQuery]=useState("");
  const [allCustomers,setAllCustomers]=useState([]);
  const [customerResults,setCustomerResults]=useState([]);
  const [customerSearching,setCustomerSearching]=useState(false);
  const [selectedCustomer,setSelectedCustomer]=useState(null);
  const [showDropdown,setShowDropdown]=useState(false);
  const [bcConnected,setBcConnected]=useState(!!_bcToken);
  const [showNewCust,setShowNewCust]=useState(false);
  const [newCustName,setNewCustName]=useState("");
  const [newCustPhone,setNewCustPhone]=useState("");
  const [newCustEmail,setNewCustEmail]=useState("");
  const [creatingCust,setCreatingCust]=useState(false);
  const [newCustErr,setNewCustErr]=useState("");
  const [salespersons,setSalespersons]=useState([]);
  const [selectedSalesperson,setSelectedSalesperson]=useState("");
  const [selectedPM,setSelectedPM]=useState("");
  const [selectedDesigner,setSelectedDesigner]=useState("");
  // Contact person state
  const [contactPersons,setContactPersons]=useState([]);
  const [selectedContact,setSelectedContact]=useState("");
  const [showNewContact,setShowNewContact]=useState(false);
  const [newContactName,setNewContactName]=useState("");
  const [newContactEmail,setNewContactEmail]=useState("");
  const [newContactPhone,setNewContactPhone]=useState("");
  const [creatingContact,setCreatingContact]=useState(false);
  const [newContactErr,setNewContactErr]=useState("");

  useEffect(()=>{
    if(_bcToken){loadCustomers();return;}
    acquireBcToken(false).then(t=>{
      if(t){setBcConnected(true);loadCustomers();}
    }).catch(()=>{});
  },[]);

  // Block Escape key — modal must only close via Cancel or Create buttons
  useEffect(()=>{
    function blockEsc(e){if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();}}
    window.addEventListener("keydown",blockEsc,{capture:true});
    return()=>window.removeEventListener("keydown",blockEsc,{capture:true});
  },[]);

  async function loadCustomers(){
    setCustomerSearching(true);
    const all=await bcLoadAllCustomers();
    setAllCustomers(all);
    setCustomerResults(all.slice(0,25));
    setCustomerSearching(false);
    // Load salespersons from BC OData
    try{
      const spR=await fetch(`${BC_ODATA_BASE}/Salesperson?$select=Code,Name,Job_Title,E_Mail,Phone_No&$filter=Blocked eq false`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(spR.ok){
        const spData=(await spR.json()).value||[];
        setSalespersons(spData);
        // Default salesperson to current user match
        const userEmail=fbAuth.currentUser?.email||"";
        const match=spData.find(s=>(s.E_Mail||"").toLowerCase()===userEmail.toLowerCase());
        if(match)setSelectedSalesperson(match.Code);
      }
    }catch(e){console.warn("Load salespersons failed:",e);}
  }

  async function connectBC(){
    setCustomerSearching(true);
    const t=await acquireBcToken(true);
    if(t){setBcConnected(true);await loadCustomers();}
    setCustomerSearching(false);
  }

  function handleCustomerInput(val){
    setCustomerQuery(val);
    setSelectedCustomer(null);
    setShowDropdown(true);
    setCustomerResults(bcFilterCustomers(allCustomers,val));
  }

  function selectCustomer(c){
    setSelectedCustomer(c);
    setCustomerQuery(c.displayName);
    setShowDropdown(false);
    // Auto-fetch contacts for selected customer
    setContactPersons([]);setSelectedContact("");
    if(c.number)bcFetchCustomerContacts(c.number).then(contacts=>{if(contacts.length)setContactPersons(contacts);});
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
    }catch(err){setNewCustErr(err.message||"Failed to create customer in BC");}
    setCreatingCust(false);
  }

  async function create(e){
    e.preventDefault();
    if(!name.trim()||!selectedCustomer)return;
    setLoading(true);setCreateErr("");
    const trimmed=name.trim();
    if(!_bcToken){setBcStatus("connecting");await acquireBcToken(true);}
    if(!_bcToken){setCreateErr("Could not connect to Business Central. Please try again.");setLoading(false);return;}
    try{
      setBcStatus("creating");
      const bc=await bcCreateProject(trimmed,selectedCustomer.number);
      const panelList=Array.from({length:Math.max(1,panelCount)},(_,i)=>({id:`panel-${i+1}`,name:`Panel ${i+1}`}));
      setBcStatus("tasks");
      let taskWarn=null;
      try{
        const taskCount=await bcCreatePanelTaskStructure(bc.number,trimmed,panelList);
        console.log(`bcCreatePanelTaskStructure: ${taskCount} tasks created`);
      }catch(te){
        console.error("bcCreatePanelTaskStructure failed:",te.message);
        taskWarn=te.message;
      }
      setBcStatus(taskWarn?"taskwarn":"ok");
      // Write salesperson/PM/designer/contact to BC project card
      if(selectedSalesperson||selectedPM||selectedDesigner||selectedContact){
        const spFields={};
        if(selectedSalesperson)spFields.CCS_Salesperson_Code=selectedSalesperson;
        if(selectedPM)spFields.Person_Responsible=selectedPM;
        if(selectedContact)spFields.Sell_to_Contact_No=selectedContact;
        bcPatchJobOData(bc.number,spFields).catch(e=>console.warn("BC role assignment failed:",e));
      }
      const spName=salespersons.find(s=>s.Code===selectedSalesperson)?.Name||"";
      const pmName=salespersons.find(s=>s.Code===selectedPM)?.Name||"";
      const designerName=salespersons.find(s=>s.Code===selectedDesigner)?.Name||"";
      const p=await saveProject(uid,{
        name:trimmed,
        bcProjectId:bc.id,
        bcProjectNumber:bc.number,
        bcEnv:_bcConfig.env,
        bcCustomerNumber:bc.customerNumber,
        bcCustomerName:bc.customerName||selectedCustomer.displayName,
        bcSalespersonCode:selectedSalesperson||"",
        bcSalesperson:spName,
        bcProjectManager:pmName,
        bcProjectManagerCode:selectedPM||"",
        bcDesigner:designerName,
        bcDesignerCode:selectedDesigner||"",
        bcContactNo:selectedContact||"",
        bcContactName:(contactPersons.find(c=>c.number===selectedContact)||{}).displayName||"",
        bcContactEmail:(contactPersons.find(c=>c.number===selectedContact)||{}).email||"",
        bcContactPhone:(contactPersons.find(c=>c.number===selectedContact)||{}).phone||"",
        quote:selectedContact?{contact:(contactPersons.find(c=>c.number===selectedContact)||{}).displayName||"",
          email:(contactPersons.find(c=>c.number===selectedContact)||{}).email||"",
          phone:(contactPersons.find(c=>c.number===selectedContact)||{}).phone||""}:undefined,
        status:"draft",
        panels:panelList.map(panel=>({...panel,pages:[],bom:[],validation:null,pricing:null,budgetaryQuote:null,status:'draft'})),
        createdAt:Date.now(),updatedAt:Date.now()
      });
      if(taskWarn){
        setCreateErr(`Project created, but BC task structure failed: ${taskWarn} — ensure 'ProjectTaskLines' (page 1002) is published in BC Web Services.`);
        setLoading(false);
        return; // don't auto-navigate — let user see the warning
      }
      onCreated(p);
    }catch(e){
      setBcStatus(null);
      setCreateErr(e.message||"Failed to create project in Business Central.");
      setLoading(false);
    }
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
      <div style={{...card(),width:"100%",maxWidth:460}}>
        <div style={{fontSize:20,fontWeight:700,marginBottom:4}}>New Project</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:20}}>Name this control panel quote</div>
        <form onSubmit={create}>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Project Name</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Conveyor Control Panel" style={{...inp(),marginBottom:16}} autoFocus/>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Number of Panels</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <button type="button" onClick={()=>setPanelCount(c=>Math.max(1,c-1))} style={{width:32,height:32,borderRadius:6,border:`1px solid ${C.border}`,background:C.border,color:C.text,fontSize:18,cursor:"pointer",lineHeight:1}}>−</button>
            <span style={{fontSize:20,fontWeight:700,minWidth:32,textAlign:"center"}}>{panelCount}</span>
            <button type="button" onClick={()=>setPanelCount(c=>Math.min(20,c+1))} style={{width:32,height:32,borderRadius:6,border:`1px solid ${C.border}`,background:C.border,color:C.text,fontSize:18,cursor:"pointer",lineHeight:1}}>+</button>
            <span style={{fontSize:12,color:C.muted}}>{panelCount===1?"1 panel will be created":`${panelCount} panels will be created`}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>Customer <span style={{color:C.border,fontWeight:400,textTransform:"none",letterSpacing:0}}>(from Business Central)</span></div>
            {bcConnected&&!showNewCust&&<button type="button" onClick={()=>setShowNewCust(true)} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,padding:0,fontWeight:600}}>+ New Customer</button>}
          </div>
          {showNewCust&&(
            <div style={{background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:8,padding:14,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:10}}>Create New BC Customer</div>
              <input value={newCustName} onChange={e=>setNewCustName(e.target.value)} placeholder="Customer Name *" style={{...inp(),marginBottom:8}}/>
              <input value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="Phone (optional)" style={{...inp(),marginBottom:8}}/>
              <input value={newCustEmail} onChange={e=>setNewCustEmail(e.target.value)} placeholder="Email (optional)" onKeyDown={e=>{if(e.key==='Enter')e.target.blur();}} style={{...inp(),marginBottom:10}}/>
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
                onChange={e=>handleCustomerInput(e.target.value)}
                onFocus={()=>setShowDropdown(true)}
                onBlur={()=>setTimeout(()=>setShowDropdown(false),150)}
                onKeyDown={e=>{if(e.key==="Tab"&&customerResults.length===1){e.preventDefault();selectCustomer(customerResults[0]);}}}
                placeholder={customerSearching?"Loading customers…":"Search by name or number…"}
                style={{...inp()}}
              />
              {selectedCustomer&&<div style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",color:C.green,fontSize:14}}>✓</div>}
              {showDropdown&&customerResults.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#2a4a6e",border:`1px solid ${C.accent}55`,borderRadius:8,zIndex:10,maxHeight:200,overflowY:"auto",marginTop:4,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}>
                  {customerResults.map(c=>(
                    <div key={c.number} onMouseDown={()=>selectCustomer(c)}
                      style={{padding:"9px 12px",cursor:"pointer",display:"flex",gap:10,alignItems:"center",borderBottom:`1px solid ${C.border}33`}}
                      onMouseEnter={e=>e.currentTarget.style.background="#345880"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:11,color:C.muted,minWidth:60,fontFamily:"monospace"}}>{c.number}</span>
                      <span style={{fontSize:13,color:C.text}}>{c.displayName}</span>
                    </div>
                  ))}
                </div>
              )}
              {showDropdown&&!customerSearching&&customerResults.length===0&&customerQuery&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#2a4a6e",border:`1px solid ${C.accent}55`,borderRadius:8,zIndex:10,padding:"10px 12px",marginTop:4,fontSize:12,color:C.muted}}>No customers found</div>
              )}
            </div>
          )}
          {/* Contact Person dropdown */}
          {selectedCustomer&&contactPersons.length>0&&(
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>Contact Person</div>
                {!showNewContact&&<button type="button" onClick={()=>{setShowNewContact(true);setNewContactName("");setNewContactEmail("");setNewContactPhone("");setNewContactErr("");}} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,padding:0,fontWeight:600}}>+ New Contact</button>}
              </div>
              {showNewContact?(
                <div style={{background:C.accentDim,border:`1px solid ${C.accent}`,borderRadius:8,padding:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:10}}>Add Contact to {selectedCustomer.displayName}</div>
                  <input value={newContactName} onChange={e=>setNewContactName(e.target.value)} placeholder="Contact Name *" style={{...inp(),marginBottom:8}}/>
                  <input value={newContactEmail} onChange={e=>setNewContactEmail(e.target.value)} placeholder="Email (optional)" style={{...inp(),marginBottom:8}}/>
                  <input value={newContactPhone} onChange={e=>setNewContactPhone(e.target.value)} placeholder="Phone (optional)" style={{...inp(),marginBottom:10}}/>
                  {newContactErr&&<div style={{fontSize:11,color:C.red,marginBottom:8}}>{newContactErr}</div>}
                  <div style={{display:"flex",gap:8}}>
                    <button type="button" onClick={()=>{setShowNewContact(false);setNewContactErr("");}} style={btn(C.border,C.sub,{flex:1,fontSize:12})}>Cancel</button>
                    <button type="button" onClick={async()=>{
                      if(!newContactName.trim())return;setCreatingContact(true);setNewContactErr("");
                      try{
                        const c=await bcCreateContact(newContactName.trim(),selectedCustomer.number,newContactEmail.trim(),newContactPhone.trim());
                        const fresh=await bcFetchCustomerContacts(selectedCustomer.number);setContactPersons(fresh);
                        setSelectedContact(c.number);setShowNewContact(false);setNewContactName("");setNewContactEmail("");setNewContactPhone("");
                      }catch(e){setNewContactErr(e.message||"Failed to create contact");}
                      setCreatingContact(false);
                    }} disabled={!newContactName.trim()||creatingContact} style={btn(C.accent,"#fff",{flex:2,fontSize:12,opacity:!newContactName.trim()||creatingContact?0.5:1})}>{creatingContact?"Creating…":"Create Contact"}</button>
                  </div>
                </div>
              ):(
                <select value={selectedContact} onChange={e=>setSelectedContact(e.target.value)} style={{...inp({fontSize:12,padding:"8px 10px"})}}>
                  <option value="">— Select Contact Person —</option>
                  {contactPersons.map(c=><option key={c.number} value={c.number}>{c.displayName}{c.email?" ("+c.email+")":""}</option>)}
                </select>
              )}
            </div>
          )}
          {/* Salesperson / PM / Designer dropdowns */}
          {bcConnected&&salespersons.length>0&&(
            <div style={{display:"flex",gap:10,marginBottom:16}}>
              {[["Salesperson",selectedSalesperson,setSelectedSalesperson],["Project Manager",selectedPM,setSelectedPM],["Designer",selectedDesigner,setSelectedDesigner]].map(([label,val,setter])=>(
                <div key={label} style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>{label}</div>
                  <select value={val} onChange={e=>setter(e.target.value)} style={{...inp({fontSize:12,padding:"8px 10px"})}}>
                    <option value="">— Select —</option>
                    {salespersons.map(s=><option key={s.Code} value={s.Code}>{s.Name}{s.Job_Title?` (${s.Job_Title})`:""}</option>)}
                  </select>
                </div>
              ))}
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

export default NewProjectModal;

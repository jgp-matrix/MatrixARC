// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function PurchasingTab(){
  return(<div style={{padding:48,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:400}}>
    <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>⬡</div>
    <div style={{fontSize:20,fontWeight:700,color:"#94a3b8",marginBottom:8}}>Purchasing</div>
    <div style={{fontSize:14,color:"#94a3b8",textAlign:"center",maxWidth:360,lineHeight:1.7}}>
      Purchase order management, RFQ workflow, and BC purchase quote integration coming soon.
    </div>
  </div>);
}

// ── VENDOR CLASSIFIER — used by migration tool and sync panel ──
function classifyVendor(name){
  const n=(name||'').toLowerCase().trim();
  if(!n)return 'TRADE';
  // Person-name check (2-3 words, each capitalized, no company suffixes)
  const words=name.trim().split(/\s+/);
  if(words.length>=2&&words.length<=3
    &&!/\b(inc|llc|ltd|corp|co\.|supply|electric|systems|controls|solutions|services|technologies|industrial|automation)\b/i.test(name)
    &&words.every(w=>/^[A-Z][a-z]{1,}$/.test(w)))return 'TRADE';
  // Hard exclusions
  if(/steakhouse|chick.fil|chilis|cafe rio|cafe zupas|costa vida|cooler runnings|black angus|restaurant|food vendor|airline|american airlines|delta air|cache valley bank|american express|chase ihg|insurance|janitorial|cleaning|restoration|shred|construction company|builders|concept kitchen|custom audio|alphagraphics|diamond rental|dell computer|dhl express|comcast|dominion energy|gas station|appliance exchange|cal ranch|best buy|costco|amazon|palo alto software/.test(n))return 'TRADE';
  // Known parts brands & distributors
  if(/digikey|digi.key|mouser|beckhoff|siemens|rockwell|allen.bradley|schneider|phoenix contact|wago|cognex|keyence|ifm efector|pepperl|turck|balluff|smcusa|ametek|bender|c3 controls|codale|ced corp|crescent electric|crum electric|cache valley electric|db roberts|jepco|thermal.edge|dbk usa|rittal|navepoint|datapro|cable ties|ctc connection|precision digital|stored energy|anti vibration|bolt & nut|mcnichols|anr fabrication|avatar metal|arduino store|batteries \+|cate industrial|clarion safety|crane.controls|control equipment|ddl traffic|royal direct|css america|newark|platt electric|plc central|rust automation|northeast electrical|orange electric|products for automation|lesman|jmc instrument|inmotion controls|industrial networking|instrumentors|industrial power|intermountain fuse|ifm efector|gordon electric|hope industrial|industrial automation|electric motion|electro.sensor|standard supply|trc electronics|true cable|wiautomation|waterford systems|marshall.s industrial|onlinecomponents|lgg industrial/.test(n))return 'PARTS';
  // General keywords
  if(/\belectric\b|\belectrical\b|\belectronics\b|controls|automation|industrial|instruments?|sensors?|\bwire\b|\bwiring\b|\bcable\b|connectors?|drives|vfd|inverter|relays?|breakers?|fuses?|contactor|transformer|switchgear|enclosure|pneumatic|hydraulic|\bplc\b|\bhmi\b|\bscada\b|fabrication|metal works|fastener|power supply|power systems|certification lab|components?|safety systems|anti.vibration|transmitter|transducer/.test(n))return 'PARTS';
  return 'TRADE';
}

// ── VENDORS PANEL ──
function VendorsPanel({uid,onVendorAdded}){
  const[vendors,setVendors]=useState([]);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState(null);
  const[newNo,setNewNo]=useState('');
  const[newName,setNewName]=useState('');
  const[adding,setAdding]=useState(false);
  const[addErr,setAddErr]=useState(null);
  const[vendorCodes,setVendorCodes]=useState({}); // {vendorNo: shortCode}
  const[editingCode,setEditingCode]=useState(null); // vendorNo being edited
  const[editVal,setEditVal]=useState('');
  const[dupScan,setDupScan]=useState(null); // null | {loading,groups,error}
  const[dupRemoving,setDupRemoving]=useState(false);
  const[dupProgress,setDupProgress]=useState('');
  const[dupConfirmed,setDupConfirmed]=useState(false);
  const[showAll,setShowAll]=useState(false);
  const[vpgSaving,setVpgSaving]=useState({}); // {vendorNo: true} while PATCH in flight
  const[lastCreated,setLastCreated]=useState(null); // {no,name} — success banner
  // Posting group fields for new vendor form
  const[genBusGroups,setGenBusGroups]=useState([]);
  const[vendorPostingGroups,setVendorPostingGroups]=useState([]);
  const[taxAreas,setTaxAreas]=useState([]);
  const[newGenBus,setNewGenBus]=useState('');
  const[newVendorPosting,setNewVendorPosting]=useState('PARTS');
  const[newTaxArea,setNewTaxArea]=useState('');
  const[newCode,setNewCode]=useState('');
  const defaultsSetRef=useRef(false);

  useEffect(()=>{
    // Load saved vendor config from Firestore
    if(uid)fbDb.doc(`users/${uid}/config/vendorConfig`).get().then(d=>{
      if(d.exists){
        const dat=d.data();
        setVendorCodes(dat.vendorCodes||{});
      }
    });
    if(_bcToken)fetchVendors();
  },[uid]);

  function autoGenerateCode(name,existingCodes){
    if(!name||!name.trim())return'UNK';
    const stripped=name.replace(/\b(electric|electronics|electrical|supply|supplies|inc|llc|ltd|corp|corporation|company|co|gmbh|ag|usa|intl|international)\b\.?/gi,'').trim();
    const words=stripped.split(/[\s\-]+/).filter(w=>w&&w.length>0);
    let base;
    if(!words.length){base=(name.replace(/[^A-Za-z0-9]/g,'').slice(0,3)||'UNK').toUpperCase();}
    else if(words.length===1){base=words[0].slice(0,3).toUpperCase();}
    else if(words.length===2){base=(words[0].slice(0,2)+(words[1]?.[0]||'')).toUpperCase();}
    else{base=words.slice(0,3).map(w=>w[0]||'').join('').toUpperCase();}
    if(base.length<3)base=(stripped.replace(/[^A-Za-z0-9]/g,'').slice(0,3)||'UNK').toUpperCase();
    if(base.length<3)base=base+'X'.repeat(3-base.length);
    base=base.slice(0,3);
    if(existingCodes){
      const usedSet=new Set(Object.values(existingCodes).map(c=>(c||'').toUpperCase()));
      if(usedSet.has(base)){
        const prefix=base.slice(0,2);
        for(let i=2;i<=9;i++){if(!usedSet.has(prefix+i)){base=prefix+i;break;}}
      }
    }
    return base.slice(0,3);
  }

  // Auto-generate codes for vendors that don't have one yet (runs once when vendors load)
  const vendorCodesRef=useRef(vendorCodes);
  vendorCodesRef.current=vendorCodes;
  useEffect(()=>{
    if(!vendors.length)return;
    const cur=vendorCodesRef.current;
    const generated={};
    // Build running set of all codes (existing + newly generated) for dedup
    const running={...cur};
    vendors.forEach(v=>{
      if(!cur[v.No]){
        const code=autoGenerateCode(v.Name,running);
        generated[v.No]=code;
        running[v.No]=code;
      }
    });
    if(Object.keys(generated).length){
      const merged={...cur,...generated};
      setVendorCodes(merged);
      if(uid)fbDb.doc(`users/${uid}/config/vendorConfig`).set({vendorCodes:merged},{merge:true});
    }
  },[vendors]);

  async function saveVendorCode(vendorNo,code){
    const clean=code.trim().toUpperCase().slice(0,10);
    const updated={...vendorCodes,[vendorNo]:clean};
    setVendorCodes(updated);
    setEditingCode(null);
    // Save to Firestore
    await fbDb.doc(`users/${uid}/config/vendorConfig`).set({vendorCodes:updated},{merge:true});
    // Mirror to BC Search_Name field
    if(_bcToken&&clean){
      try{
        const allPages=await bcDiscoverODataPages();
        const vPage=allPages.find(n=>/^vendor/i.test(n))||'Vendor';
        await fetch(`${BC_ODATA_BASE}/${vPage}('${vendorNo}')`,{
          method:'PATCH',
          headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":"*"},
          body:JSON.stringify({Search_Name:clean})
        });
      }catch(e){console.warn('Search_Name BC sync failed:',e.message);}
    }
  }

  async function saveVendorPostingGroup(vendorNo,newVPG){
    setVpgSaving(s=>({...s,[vendorNo]:true}));
    // Optimistic update
    setVendors(prev=>prev.map(v=>v.No===vendorNo?{...v,Vendor_Posting_Group:newVPG}:v));
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find(n=>/^vendor/i.test(n))||'Vendor';
      const r=await fetch(`${BC_ODATA_BASE}/${vPage}('${vendorNo}')`,{
        method:'PATCH',
        headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":"*"},
        body:JSON.stringify({Vendor_Posting_Group:newVPG})
      });
      if(!r.ok){
        const txt=await r.text();
        console.warn(`VPG patch failed for ${vendorNo}:`,txt);
        // Revert optimistic update
        setVendors(prev=>prev.map(v=>v.No===vendorNo?{...v,Vendor_Posting_Group:v._prevVPG||'TRADE'}:v));
        setError(`Could not update ${vendorNo}: ${txt.slice(0,120)}`);
      }
    }catch(e){
      console.warn('saveVendorPostingGroup error:',e);
      setError(e.message);
    }
    setVpgSaving(s=>{const n={...s};delete n[vendorNo];return n;});
  }

  function normVendorName(s){
    return (s||'').toLowerCase()
      .replace(/\b(electric|electronics|supply|inc|llc|ltd|corp|co|gmbh|ag)\b\.?/g,'')
      .replace(/[^a-z0-9]/g,'').trim();
  }

  async function scanForDuplicates(){
    setDupScan({loading:true,groups:[],error:null});
    setDupConfirmed(false);
    try{
      const compId=await bcGetCompanyId();
      if(!compId)throw new Error("Could not resolve BC company");
      // Fetch all vendors via REST API v2.0 (returns id GUID needed for DELETE)
      let allVendors=[];
      let url=`${BC_API_BASE}/companies(${compId})/vendors?$top=500&$select=id,number,displayName`;
      while(url){
        const r=await fetch(url,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok)throw new Error(`BC REST ${r.status}`);
        const j=await r.json();
        allVendors=allVendors.concat(j.value||[]);
        url=j['@odata.nextLink']||null;
      }
      // Group by normalized display name
      const byNorm={};
      for(const v of allVendors){
        const k=normVendorName(v.displayName||'');
        if(!k)continue;
        if(!byNorm[k])byNorm[k]=[];
        byNorm[k].push(v);
      }
      // Find groups with duplicates
      const groups=[];
      for(const grp of Object.values(byNorm)){
        if(grp.length<2)continue;
        // Keep the vendor with the lowest/earliest vendor number
        const sorted=[...grp].sort((a,b)=>(a.number||'').localeCompare(b.number||''));
        groups.push({keep:sorted[0],remove:sorted.slice(1)});
      }
      setDupScan({loading:false,groups,error:null});
    }catch(e){
      setDupScan({loading:false,groups:[],error:e.message});
    }
  }

  async function executeRemoveDuplicates(){
    if(!dupScan||!dupScan.groups.length)return;
    setDupRemoving(true);
    try{
      const compId=await bcGetCompanyId();
      const toRemove=dupScan.groups.flatMap(g=>g.remove);
      const removedNos=[];
      for(let i=0;i<toRemove.length;i++){
        const v=toRemove[i];
        setDupProgress(`Removing ${i+1}/${toRemove.length}: ${v.number||v.displayName}…`);
        try{
          const r=await fetch(`${BC_API_BASE}/companies(${compId})/vendors(${v.id})`,{
            method:"DELETE",
            headers:{"Authorization":`Bearer ${_bcToken}`}
          });
          if(r.ok||r.status===204)removedNos.push(v.number);
          else{const t=await r.text();console.warn(`Delete vendor ${v.number} failed ${r.status}:`,t.slice(0,200));}
        }catch(e){console.warn('Delete vendor failed:',v.number,e.message);}
      }
      // Clean up Firestore vendorCodes for removed vendors
      if(removedNos.length&&uid){
        const updated={...vendorCodes};
        removedNos.forEach(no=>delete updated[no]);
        setVendorCodes(updated);
        await fbDb.doc(`users/${uid}/config/vendorConfig`).set({vendorCodes:updated},{merge:true});
      }
      setDupProgress(`Done — removed ${removedNos.length} duplicate vendor${removedNos.length!==1?'s':''}.`);
      setTimeout(()=>{
        setDupScan(null);setDupConfirmed(false);setDupProgress('');
        fetchVendors();
      },2000);
    }catch(e){
      setDupProgress(`Error: ${e.message}`);
    }
    setDupRemoving(false);
  }

  async function runMigration(){
    setMigrateStatus({running:true,total:0,patched:0,errors:[],needsSetup:false,log:[]});
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find(n=>/^vendor/i.test(n))||'Vendor_Card_Excel';
      // Fetch all vendors
      const r=await fetch(`${BC_ODATA_BASE}/${vPage}?$select=No,Name,Vendor_Posting_Group&$top=500`,
        {headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(!r.ok)throw new Error(`BC ${r.status}`);
      const all=(await r.json()).value||[];
      const toPatch=all.filter(v=>classifyVendor(v.Name)==='PARTS'&&v.Vendor_Posting_Group!=='PARTS');
      setMigrateStatus(s=>({...s,total:toPatch.length}));
      let patched=0;const errors=[];const log=[];
      for(let i=0;i<toPatch.length;i++){
        const v=toPatch[i];
        const pr=await fetch(`${BC_ODATA_BASE}/${vPage}('${v.No}')`,{
          method:'PATCH',
          headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":"*"},
          body:JSON.stringify({Vendor_Posting_Group:'PARTS'})
        });
        if(pr.ok||pr.status===204){
          patched++;log.push(`✓ ${v.No} — ${v.Name}`);
          setMigrateStatus(s=>({...s,patched,log:[...log]}));
        }else{
          const txt=await pr.text();
          // Detect "PARTS posting group doesn't exist" error
          if(/posting group|does not exist|invalid.*parts|parts.*invalid/i.test(txt)){
            setMigrateStatus(s=>({...s,running:false,needsSetup:true,
              log:[...log,`✗ ${v.No}: PARTS posting group not found in BC`]}));
            return;
          }
          errors.push(`${v.No}: ${txt.slice(0,120)}`);
          log.push(`✗ ${v.No} — ${v.Name}: error`);
          setMigrateStatus(s=>({...s,errors:[...errors],log:[...log]}));
        }
        if(i<toPatch.length-1)await new Promise(res=>setTimeout(res,150));
      }
      setMigrateStatus({running:false,done:true,total:toPatch.length,patched,errors,needsSetup:false,log});
      await fetchVendors();
    }catch(e){
      setMigrateStatus(s=>({...s,running:false,errors:[e.message]}));
    }
  }

  async function fetchVendors(){
    setLoading(true);setError(null);
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find(n=>/^vendor/i.test(n))||'Vendor';
      const r=await fetch(
        `${BC_ODATA_BASE}/${vPage}?$select=No,Name,Search_Name,Phone_No,Gen_Bus_Posting_Group,Vendor_Posting_Group,Tax_Area_Code&$top=500&$orderby=Name asc`,
        {headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(!r.ok)throw new Error(`BC ${r.status} — page: ${vPage}`);
      const vs=(await r.json()).value||[];
      setVendors(vs);
      // Auto-detect posting group defaults from existing vendors (once per session)
      if(!defaultsSetRef.current&&vs.length){
        const count=(arr,key)=>{
          const m={};arr.forEach(v=>{const k=v[key];if(k)m[k]=(m[k]||0)+1;});
          return Object.entries(m).sort((a,b)=>b[1]-a[1]);
        };
        const gbTop=count(vs,'Gen_Bus_Posting_Group');
        const vpTop=count(vs,'Vendor_Posting_Group');
        const taTop=count(vs,'Tax_Area_Code');
        setGenBusGroups(gbTop.map(([k])=>k));
        const vpList=vpTop.map(([k])=>k);
        // Ensure PARTS is always an option even if not yet assigned to any vendor
        if(!vpList.includes('PARTS'))vpList.unshift('PARTS');
        setVendorPostingGroups(vpList);
        setTaxAreas(taTop.map(([k])=>k));
        if(gbTop.length)setNewGenBus(gbTop[0][0]);
        // Default to PARTS; fall back to most-common if PARTS not available
        setNewVendorPosting(vpList.includes('PARTS')?'PARTS':vpTop[0]?.[0]||'');
        if(taTop.length)setNewTaxArea(taTop[0][0]);
        defaultsSetRef.current=true;
      }
    }catch(e){setError(e.message);}
    setLoading(false);
  }

  // Real-time duplicate detection — runs on every render, no debounce needed (local data)
  function getDupMatch(){
    const input=newName.trim();
    if(input.length<2)return null;

    // Strip noise words, punctuation → bare alphanumeric string
    const stopRx=/\b(electric|electrical|electronics|electro|supply|supplies|industrial|automation|controls|systems|solutions|technologies|services|group|company|co|inc|llc|ltd|corp|gmbh|ag|north america|usa|u\.s\.a)\b\.?/gi;
    const norm=s=>s.toLowerCase().replace(stopRx,'').replace(/[^a-z0-9]/g,'').trim();

    // Trigram similarity — catches abbreviations + typos
    function trigramSim(a,b){
      if(!a||!b)return 0;
      if(a===b)return 1;
      const tg=s=>{const t=new Set();for(let i=0;i<=s.length-3;i++)t.add(s.slice(i,i+3));return t;};
      const ta=tg(a),tb=tg(b);
      if(!ta.size||!tb.size)return 0;
      let inter=0;for(const t of ta)if(tb.has(t))inter++;
      return(2*inter)/(ta.size+tb.size);
    }

    // Token overlap — catches "Crescent Elec" vs "Crescent Electric Supply"
    function tokenOverlap(a,b){
      const toks=s=>s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2);
      const ta=new Set(toks(a)),tb=new Set(toks(b));
      if(!ta.size||!tb.size)return 0;
      let shared=0;for(const t of ta)if(tb.has(t))shared++;
      return shared/Math.min(ta.size,tb.size);
    }

    const normInput=norm(input);
    let best=null;
    for(const v of vendors){
      const vName=v.Name||'';
      const normV=norm(vName);
      // Exact normalized match → hard block
      if(normInput&&normV&&normInput===normV)
        return{type:'error',msg:`Exact match: ${v.No} — ${v.Name}`};
      // Contains check
      if(normInput.length>=4&&normV.length>=4&&(normInput.includes(normV)||normV.includes(normInput))){
        if(!best||best.score<0.9)best={score:0.9,v};
        continue;
      }
      // Trigram + token scoring
      const tg=trigramSim(normInput,normV);
      const tok=tokenOverlap(input,vName);
      const score=Math.max(tg,tok);
      if(score>=0.45&&(!best||score>best.score))best={score,v};
    }
    if(best)return{type:'warn',score:best.score,
      msg:`Similar vendor exists: ${best.v.No} — ${best.v.Name}`};
    return null;
  }
  const dupMatch=getDupMatch();

  function getCodeDupMatch(){
    const code=newCode.trim().toUpperCase();
    if(!code)return null;
    for(const[vNo,vCode] of Object.entries(vendorCodes)){
      if((vCode||'').trim().toUpperCase()===code){
        const vName=vendors.find(v=>v.No===vNo)?.Name||vNo;
        return{type:'error',msg:`Code "${code}" already used by ${vName} (${vNo})`};
      }
    }
    return null;
  }
  const codeDupMatch=getCodeDupMatch();

  async function addVendor(){
    if(!newName.trim()){setAddErr("Vendor name is required");return;}
    if(!newCode.trim()){setAddErr("Vendor code is required");return;}
    if(dupMatch?.type==='error'){setAddErr(dupMatch.msg);return;}
    if(codeDupMatch){setAddErr(codeDupMatch.msg);return;}
    setAdding(true);setAddErr(null);
    try{
      const compId=await bcGetCompanyId();
      if(!compId)throw new Error("Could not resolve BC company");
      // Step 1 — Create vendor via REST API v2.0 (OData POST is read-only for vendors)
      const body={displayName:newName.trim().slice(0,100)};
      const r=await fetch(`${BC_API_BASE}/companies(${compId})/vendors`,{
        method:"POST",
        headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json"},
        body:JSON.stringify(body)
      });
      if(r.status===409||r.status===400){
        const t=await r.text();
        if(/already exists|duplicate/i.test(t))throw new Error(`Vendor "${newName}" already exists in BC`);
        throw new Error(t.slice(0,200));
      }
      if(!r.ok){const t=await r.text();throw new Error(t.slice(0,200));}
      const created=await r.json();
      const createdNo=created.number||'';
      // Step 2 — PATCH posting groups + tax area via OData (REST v2.0 doesn't expose these fields)
      if(createdNo&&(newGenBus||newVendorPosting||newTaxArea)){
        try{
          const allPages=await bcDiscoverODataPages();
          const vPage=allPages.find(n=>/^vendor/i.test(n))||'Vendor';
          const patch={};
          if(newGenBus)patch.Gen_Bus_Posting_Group=newGenBus;
          if(newVendorPosting)patch.Vendor_Posting_Group=newVendorPosting;
          if(newTaxArea)patch.Tax_Area_Code=newTaxArea;
          if(newCode.trim())patch.Search_Name=newCode.trim().toUpperCase().slice(0,10);
          const pr=await fetch(`${BC_ODATA_BASE}/${vPage}('${createdNo}')`,{
            method:"PATCH",
            headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":"*"},
            body:JSON.stringify(patch)
          });
          if(!pr.ok){const pt=await pr.text();console.warn(`Posting group patch ${pr.status}:`,pt.slice(0,200));}
        }catch(pe){console.warn('Posting group patch failed:',pe.message);}
      }
      // Save vendor code to Firestore if provided
      if(newCode.trim()&&createdNo){
        const updated={...vendorCodes,[createdNo]:newCode.trim().toUpperCase().slice(0,10)};
        setVendorCodes(updated);
        if(uid)fbDb.doc(`users/${uid}/config/vendorConfig`).set({vendorCodes:updated},{merge:true});
      }
      setLastCreated({no:createdNo,name:newName.trim(),code:newCode.trim().toUpperCase()||null});
      setNewName('');setNewCode('');
      await fetchVendors();
      onVendorAdded?.();
    }catch(e){setAddErr(e.message);}
    setAdding(false);
  }

  return(<div>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,gap:8}}>
      <span style={{fontSize:12,color:"#94a3b8",lineHeight:1.6}}>Vendors from Business Central. Click a code to edit it.</span>
    </div>

    {/* Add Vendor form */}
    {(()=>{
    const hasName=!!newName.trim();
    const hasCode=!!newCode.trim();
    const nameOk=hasName&&dupMatch?.type!=='error';
    const codeOk=hasCode&&!codeDupMatch;
    const canAdd=nameOk&&codeOk&&!adding;
    return(
    <div style={{marginBottom:14,border:`1px solid ${canAdd?"#166534":"#1e3a5f"}`,borderRadius:6,padding:"10px 12px",background:"#0d1926",transition:"border-color 0.2s"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Add New Vendor</div>
      {/* Row 1 — Name + Code */}
      <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap",marginBottom:8}}>
        <div style={{display:"flex",flexDirection:"column",gap:2,flex:1,minWidth:160}}>
          <label style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>Vendor Name <span style={{color:"#ef4444"}}>*</span></label>
          <input value={newName} onChange={e=>{setNewName(e.target.value);setLastCreated(null);setAddErr(null);}} placeholder="Vendor Name"
            onKeyDown={e=>e.key==="Enter"&&addVendor()}
            style={{width:"100%",background:"#0f172a",
              border:`1px solid ${dupMatch?.type==='warn'?"#f59e0b":"#334155"}`,
              borderRadius:4,padding:"5px 9px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>
            Vendor Code <span style={{color:"#94a3b8"}}>(ARC short code)</span>
          </label>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <input value={newCode} onChange={e=>{setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''));setAddErr(null);}}
              placeholder="e.g. CODALE" maxLength={10}
              onKeyDown={e=>e.key==="Enter"&&addVendor()}
              style={{width:110,background:"#0f172a",
                border:`1px solid ${codeDupMatch?"#ef4444":canAdd?"#22c55e":"#334155"}`,
                borderRadius:4,padding:"5px 9px",color:"#34d399",fontSize:12,
                fontFamily:"monospace",fontWeight:700,textTransform:"uppercase"}}/>
            {codeDupMatch&&<span style={{fontSize:11,color:"#f87171",whiteSpace:"nowrap"}}>🚫 {codeDupMatch.msg}</span>}
            {!codeDupMatch&&hasName&&!hasCode&&<span style={{fontSize:11,color:"#f59e0b",whiteSpace:"nowrap"}}>⚠ Code required</span>}
            {canAdd&&<span style={{fontSize:12,fontWeight:700,color:"#22c55e",whiteSpace:"nowrap"}}>✅ Ready to add</span>}
          </div>
        </div>
      </div>
      {/* Row 2 — Posting groups + Tax area */}
      <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap",marginBottom:8}}>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>Gen. Bus. Posting Group <span style={{color:"#ef4444"}}>*</span></label>
          {genBusGroups.length>0?(
            <select value={newGenBus} onChange={e=>setNewGenBus(e.target.value)}
              style={{background:"#0f172a",border:`1px solid ${newGenBus?"#3b82f6":"#ef4444"}`,borderRadius:4,
                padding:"5px 9px",color:newGenBus?"#e2e8f0":"#94a3b8",fontSize:12,fontFamily:"inherit",minWidth:140}}>
              <option value="">— select —</option>
              {genBusGroups.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          ):(
            <input value={newGenBus} onChange={e=>setNewGenBus(e.target.value.toUpperCase())} placeholder="e.g. DOMESTIC"
              style={{width:140,background:"#0f172a",border:`1px solid ${newGenBus?"#3b82f6":"#ef4444"}`,
                borderRadius:4,padding:"5px 9px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>Vendor Posting Group <span style={{color:"#ef4444"}}>*</span></label>
          {vendorPostingGroups.length>0?(
            <select value={newVendorPosting} onChange={e=>setNewVendorPosting(e.target.value)}
              style={{background:"#0f172a",border:`1px solid ${newVendorPosting?"#3b82f6":"#ef4444"}`,borderRadius:4,
                padding:"5px 9px",color:newVendorPosting?"#e2e8f0":"#94a3b8",fontSize:12,fontFamily:"inherit",minWidth:130}}>
              <option value="">— select —</option>
              {vendorPostingGroups.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          ):(
            <input value={newVendorPosting} onChange={e=>setNewVendorPosting(e.target.value.toUpperCase())} placeholder="e.g. VENDORS"
              style={{width:130,background:"#0f172a",border:`1px solid ${newVendorPosting?"#3b82f6":"#ef4444"}`,
                borderRadius:4,padding:"5px 9px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
          )}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          <label style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase",letterSpacing:0.5}}>Tax Area Code</label>
          {taxAreas.length>0?(
            <select value={newTaxArea} onChange={e=>setNewTaxArea(e.target.value)}
              style={{background:"#0f172a",border:"1px solid #334155",borderRadius:4,
                padding:"5px 9px",color:newTaxArea?"#e2e8f0":"#94a3b8",fontSize:12,fontFamily:"inherit",minWidth:120}}>
              <option value="">— none —</option>
              {taxAreas.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          ):(
            <input value={newTaxArea} onChange={e=>setNewTaxArea(e.target.value.toUpperCase())} placeholder="e.g. PA"
              style={{width:120,background:"#0f172a",border:"1px solid #334155",
                borderRadius:4,padding:"5px 9px",color:"#e2e8f0",fontSize:12,fontFamily:"inherit"}}/>
          )}
        </div>
        <button onClick={addVendor} disabled={!canAdd}
          style={{background:canAdd?"#2563eb":"#1e293b",color:canAdd?"#fff":"#475569",
            border:`1px solid ${canAdd?"#2563eb":"#334155"}`,borderRadius:5,
            padding:"6px 14px",fontSize:12,fontWeight:600,alignSelf:"flex-end",marginBottom:1,
            cursor:canAdd?"pointer":"not-allowed",transition:"all 0.15s"}}>
          {adding?"Adding…":"+ Add Vendor"}
        </button>
      </div>
      {/* Success banner */}
      {lastCreated&&<div style={{marginTop:6,padding:"6px 10px",background:"#052e16",border:"1px solid #22c55e",
        borderRadius:5,fontSize:11,color:"#86efac",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        ✓ Created: <strong>{lastCreated.name}</strong>
        {lastCreated.no&&<span style={{fontFamily:"monospace",background:"#064e3b",padding:"1px 7px",borderRadius:3,color:"#6ee7b7"}}>
          {lastCreated.no}
        </span>}
        {lastCreated.code&&<span style={{fontFamily:"monospace",background:"#064e3b",padding:"1px 7px",borderRadius:3,color:"#34d399"}}>
          code: {lastCreated.code}
        </span>}
      </div>}
      {/* Duplicate warnings */}
      {dupMatch&&<div style={{marginTop:4,fontSize:11,display:"flex",alignItems:"center",gap:5,
        color:dupMatch.type==='error'?"#f87171":"#fbbf24"}}>
        {dupMatch.type==='error'?"🚫 Duplicate — ":"⚠️ Similar name — "}{dupMatch.msg}
        {dupMatch.type==='warn'&&<>
          {dupMatch.score&&<span style={{color:"#94a3b8",fontFamily:"monospace"}}>({Math.round(dupMatch.score*100)}% match)</span>}
          <span style={{color:"#94a3b8"}}>· add anyway if intentional</span>
        </>}
      </div>}
      {(!newGenBus||!newVendorPosting)&&newName.trim()&&<div style={{marginTop:4,fontSize:11,color:"#fbbf24"}}>
        ⚠ Gen. Bus. Posting Group and Vendor Posting Group are required in BC — vendor may be unusable without them.
      </div>}
      {addErr&&<div style={{marginTop:4,color:"#f87171",fontSize:11}}>⚠ {addErr}</div>}
    </div>
    );})()}

    {/* Vendor list header + filter */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <span style={{fontSize:11,color:"#94a3b8"}}>{vendors.filter(v=>showAll||v.Vendor_Posting_Group==='PARTS').length} vendors</span>
      <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:11,color:showAll?"#a78bfa":"#94a3b8"}}>
        <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} style={{accentColor:"#7c3aed"}}/>
        Show all
      </label>
    </div>
    {error&&<div style={{color:"#f87171",fontSize:12,marginBottom:8}}>{error}</div>}
    {loading?<div style={{color:"#94a3b8",fontSize:12,padding:"8px 0"}}>Loading vendors…</div>:(
      <div style={{border:`1px solid ${C.border}`,borderRadius:6,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"auto"}}>
          <thead>
            <tr style={{background:"#111d30",borderBottom:`2px solid ${C.border}`}}>
              <th style={{padding:"7px 10px",textAlign:"left",color:"#94a3b8",fontWeight:700,fontSize:10,letterSpacing:1,width:1,whiteSpace:"nowrap"}}>CODE</th>
              <th style={{padding:"7px 10px",textAlign:"left",color:"#94a3b8",fontWeight:700,fontSize:10,letterSpacing:1,width:1,whiteSpace:"nowrap"}}>NO</th>
              <th style={{padding:"7px 10px",textAlign:"left",color:"#94a3b8",fontWeight:700,fontSize:10,letterSpacing:1}}>NAME</th>
              <th style={{padding:"7px 10px",textAlign:"left",color:"#94a3b8",fontWeight:700,fontSize:10,letterSpacing:1,width:1,whiteSpace:"nowrap"}}>POST. GROUP</th>
            </tr>
          </thead>
          <tbody>
            {vendors.length===0&&<tr><td colSpan={4} style={{padding:"16px 10px",color:"#94a3b8",textAlign:"center",fontSize:12}}>
              No vendors — connect to BC or add one above.
            </td></tr>}
            {vendors.filter(v=>showAll||v.Vendor_Posting_Group==='PARTS').map((v,idx)=>(
              <tr key={v.No} style={{borderBottom:`1px solid ${C.border}`,
                background:idx%2===0?"#1a2235":"#162040"}}>
                <td style={{padding:"4px 10px",whiteSpace:"nowrap"}}>
                  {editingCode===v.No?(
                    <input autoFocus value={editVal}
                      onChange={e=>setEditVal(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter")saveVendorCode(v.No,editVal);if(e.key==="Escape")setEditingCode(null);}}
                      onBlur={()=>saveVendorCode(v.No,editVal)}
                      maxLength={10}
                      style={{width:70,background:"#1e293b",border:"1px solid #3b82f6",borderRadius:4,
                        padding:"2px 6px",color:C.text,fontSize:12,fontFamily:"monospace",fontWeight:700}}/>
                  ):(
                    <span onClick={()=>{setEditingCode(v.No);setEditVal(vendorCodes[v.No]||'');}}
                      style={{cursor:"pointer",color:"#34d399",fontFamily:"monospace",fontWeight:700}}>
                      {vendorCodes[v.No]||"—"}
                    </span>
                  )}
                </td>
                <td style={{padding:"6px 10px",color:"#93c5fd",fontFamily:"monospace",fontSize:11,whiteSpace:"nowrap"}}>{v.No}</td>
                <td style={{padding:"6px 10px",color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:0}} title={v.Name}>
                  {v.Name}
                </td>
                <td style={{padding:"4px 8px",whiteSpace:"nowrap"}}>
                  {vpgSaving[v.No]
                    ? <span style={{fontSize:10,color:"#94a3b8"}}>saving…</span>
                    : <select
                        value={v.Vendor_Posting_Group||''}
                        onChange={e=>saveVendorPostingGroup(v.No,e.target.value)}
                        style={{background:"#1e293b",border:"1px solid #334155",borderRadius:4,
                          padding:"2px 5px",color:v.Vendor_Posting_Group==='PARTS'?"#a78bfa":
                            v.Vendor_Posting_Group==='TRADE'?"#60a5fa":"#94a3b8",
                          fontSize:10,fontWeight:700,fontFamily:"monospace",cursor:"pointer"}}>
                        <option value="">—</option>
                        <option value="PARTS">PARTS</option>
                        <option value="TRADE">TRADE</option>
                        <option value="GOVERNMENT">GOVERNMENT</option>
                        {v.Vendor_Posting_Group&&!['PARTS','TRADE','GOVERNMENT',''].includes(v.Vendor_Posting_Group)&&
                          <option value={v.Vendor_Posting_Group}>{v.Vendor_Posting_Group}</option>}
                      </select>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>);
}

let _bcVendorMap = null; // {No: Name}
async function bcFetchVendorMap(){
  if(_bcVendorMap)return _bcVendorMap;
  if(!_bcToken)return{};
  try{
    const allPages=await bcDiscoverODataPages();
    const vPage=allPages.find(n=>/^vendor/i.test(n))||'Vendor';
    const r=await fetch(`${BC_ODATA_BASE}/${vPage}?$select=No,Name&$top=500`,
      {headers:{"Authorization":`Bearer ${_bcToken}`}});
    if(!r.ok)return{};
    const list=(await r.json()).value||[];
    _bcVendorMap=Object.fromEntries(list.map(v=>[v.No,v.Name]));
    return _bcVendorMap;
  }catch(e){return{};}
}

let _bcManufacturers = null; // [{Code, Name}]
async function bcFetchManufacturers(){
  if(_bcManufacturers)return _bcManufacturers;
  if(!_bcToken)return[];
  // Pull from BC Manufacturers table + merge with BC_MFR_MAP so all known codes appear
  const bcCodes=new Map();
  try{
    const allPages=await bcDiscoverODataPages();
    const mPage=allPages.find(n=>n==='Manufacturer'||n==='Manufacturers');
    if(mPage){
      const r=await fetch(`${BC_ODATA_BASE}/${mPage}?$select=Code,Name&$top=500`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(r.ok)(await r.json()).value?.forEach(m=>bcCodes.set(m.Code,m.Name));
    }
  }catch(e){}
  // Merge: BC codes + any BC_MFR_MAP codes not yet in BC
  const mfrNames=Object.fromEntries(BC_MFR_MAP.map(m=>[m.code,m.terms[0].split(' ').map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')]));
  BC_MFR_MAP.forEach(m=>{if(!bcCodes.has(m.code))bcCodes.set(m.code,mfrNames[m.code]||m.code);});
  _bcManufacturers=Array.from(bcCodes.entries()).map(([Code,Name])=>({Code,Name})).sort((a,b)=>a.Code.localeCompare(b.Code));
  return _bcManufacturers;
}

export default PurchasingTab;

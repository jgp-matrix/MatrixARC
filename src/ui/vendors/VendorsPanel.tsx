import React, { useState, useEffect, useRef } from 'react';
import { C } from '@/core/constants';
import { fbDb, _bcToken } from '@/core/globals';

declare const BC_ODATA_BASE: string;
declare const BC_API_BASE: string;
import { discoverODataPages as bcDiscoverODataPages, getCompanyId as bcGetCompanyId } from '@/services/businessCentral/client';
import { classifyVendor } from '@/core/helpers';

export default function VendorsPanel({uid,onVendorAdded}: any){
  const[vendors,setVendors]=useState<any[]>([]);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState<string|null>(null);
  const[newNo,setNewNo]=useState('');
  const[newName,setNewName]=useState('');
  const[adding,setAdding]=useState(false);
  const[addErr,setAddErr]=useState<string|null>(null);
  const[vendorCodes,setVendorCodes]=useState<Record<string,string>>({});
  const[editingCode,setEditingCode]=useState<string|null>(null);
  const[editVal,setEditVal]=useState('');
  const[dupScan,setDupScan]=useState<any>(null);
  const[dupRemoving,setDupRemoving]=useState(false);
  const[dupProgress,setDupProgress]=useState('');
  const[dupConfirmed,setDupConfirmed]=useState(false);
  const[showAll,setShowAll]=useState(false);
  const[vpgSaving,setVpgSaving]=useState<Record<string,boolean>>({});
  const[lastCreated,setLastCreated]=useState<any>(null);
  const[migrateStatus,setMigrateStatus]=useState<any>(null);
  // Posting group fields for new vendor form
  const[genBusGroups,setGenBusGroups]=useState<string[]>([]);
  const[vendorPostingGroups,setVendorPostingGroups]=useState<string[]>([]);
  const[taxAreas,setTaxAreas]=useState<string[]>([]);
  const[newGenBus,setNewGenBus]=useState('');
  const[newVendorPosting,setNewVendorPosting]=useState('PARTS');
  const[newTaxArea,setNewTaxArea]=useState('');
  const[newCode,setNewCode]=useState('');
  const defaultsSetRef=useRef(false);

  useEffect(()=>{
    // Load saved vendor config from Firestore
    if(uid)fbDb.doc(`users/${uid}/config/vendorConfig`).get().then((d: any)=>{
      if(d.exists){
        const dat=d.data();
        setVendorCodes(dat.vendorCodes||{});
      }
    });
    if(_bcToken)fetchVendors();
  },[uid]);

  function autoGenerateCode(name: string, existingCodes?: Record<string,string>){
    if(!name||!name.trim())return'UNK';
    const stripped=name.replace(/\b(electric|electronics|electrical|supply|supplies|inc|llc|ltd|corp|corporation|company|co|gmbh|ag|usa|intl|international)\b\.?/gi,'').trim();
    const words=stripped.split(/[\s\-]+/).filter(w=>w&&w.length>0);
    let base: string;
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
    const generated: Record<string,string>={};
    // Build running set of all codes (existing + newly generated) for dedup
    const running={...cur};
    vendors.forEach((v: any)=>{
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

  async function saveVendorCode(vendorNo: string, code: string){
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
        const vPage=allPages.find((n: string)=>/^vendor/i.test(n))||'Vendor';
        await fetch(`${BC_ODATA_BASE}/${vPage}('${vendorNo}')`,{
          method:'PATCH',
          headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":"*"},
          body:JSON.stringify({Search_Name:clean})
        });
      }catch(e: any){console.warn('Search_Name BC sync failed:',e.message);}
    }
  }

  async function saveVendorPostingGroup(vendorNo: string, newVPG: string){
    setVpgSaving(s=>({...s,[vendorNo]:true}));
    // Optimistic update
    setVendors(prev=>prev.map(v=>v.No===vendorNo?{...v,Vendor_Posting_Group:newVPG}:v));
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find((n: string)=>/^vendor/i.test(n))||'Vendor';
      const r=await fetch(`${BC_ODATA_BASE}/${vPage}('${vendorNo}')`,{
        method:'PATCH',
        headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":"*"},
        body:JSON.stringify({Vendor_Posting_Group:newVPG})
      });
      if(!r.ok){
        const txt=await r.text();
        console.warn(`VPG patch failed for ${vendorNo}:`,txt);
        // Revert optimistic update
        setVendors(prev=>prev.map(v=>v.No===vendorNo?{...v,Vendor_Posting_Group:(v as any)._prevVPG||'TRADE'}:v));
        setError(`Could not update ${vendorNo}: ${txt.slice(0,120)}`);
      }
    }catch(e: any){
      console.warn('saveVendorPostingGroup error:',e);
      setError(e.message);
    }
    setVpgSaving(s=>{const n={...s};delete n[vendorNo];return n;});
  }

  function normVendorName(s: string){
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
      let allVendors: any[]=[];
      let url: string|null=`${BC_API_BASE}/companies(${compId})/vendors?$top=500&$select=id,number,displayName`;
      while(url){
        const r=await fetch(url,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(!r.ok)throw new Error(`BC REST ${r.status}`);
        const j=await r.json();
        allVendors=allVendors.concat(j.value||[]);
        url=j['@odata.nextLink']||null;
      }
      // Group by normalized display name
      const byNorm: Record<string,any[]>={};
      for(const v of allVendors){
        const k=normVendorName(v.displayName||'');
        if(!k)continue;
        if(!byNorm[k])byNorm[k]=[];
        byNorm[k].push(v);
      }
      // Find groups with duplicates
      const groups: any[]=[];
      for(const grp of Object.values(byNorm)){
        if(grp.length<2)continue;
        // Keep the vendor with the lowest/earliest vendor number
        const sorted=[...grp].sort((a,b)=>(a.number||'').localeCompare(b.number||''));
        groups.push({keep:sorted[0],remove:sorted.slice(1)});
      }
      setDupScan({loading:false,groups,error:null});
    }catch(e: any){
      setDupScan({loading:false,groups:[],error:e.message});
    }
  }

  async function executeRemoveDuplicates(){
    if(!dupScan||!dupScan.groups.length)return;
    setDupRemoving(true);
    try{
      const compId=await bcGetCompanyId();
      const toRemove=dupScan.groups.flatMap((g: any)=>g.remove);
      const removedNos: string[]=[];
      for(let i=0;i<toRemove.length;i++){
        const v=toRemove[i];
        setDupProgress(`Removing ${i+1}/${toRemove.length}: ${v.number||v.displayName}\u2026`);
        try{
          const r=await fetch(`${BC_API_BASE}/companies(${compId})/vendors(${v.id})`,{
            method:"DELETE",
            headers:{"Authorization":`Bearer ${_bcToken}`}
          });
          if(r.ok||r.status===204)removedNos.push(v.number);
          else{const t=await r.text();console.warn(`Delete vendor ${v.number} failed ${r.status}:`,t.slice(0,200));}
        }catch(e: any){console.warn('Delete vendor failed:',v.number,e.message);}
      }
      // Clean up Firestore vendorCodes for removed vendors
      if(removedNos.length&&uid){
        const updated={...vendorCodes};
        removedNos.forEach(no=>delete updated[no]);
        setVendorCodes(updated);
        await fbDb.doc(`users/${uid}/config/vendorConfig`).set({vendorCodes:updated},{merge:true});
      }
      setDupProgress(`Done \u2014 removed ${removedNos.length} duplicate vendor${removedNos.length!==1?'s':''}.`);
      setTimeout(()=>{
        setDupScan(null);setDupConfirmed(false);setDupProgress('');
        fetchVendors();
      },2000);
    }catch(e: any){
      setDupProgress(`Error: ${e.message}`);
    }
    setDupRemoving(false);
  }

  async function runMigration(){
    setMigrateStatus({running:true,total:0,patched:0,errors:[],needsSetup:false,log:[]});
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find((n: string)=>/^vendor/i.test(n))||'Vendor_Card_Excel';
      // Fetch all vendors
      const r=await fetch(`${BC_ODATA_BASE}/${vPage}?$select=No,Name,Vendor_Posting_Group&$top=500`,
        {headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(!r.ok)throw new Error(`BC ${r.status}`);
      const all=(await r.json()).value||[];
      const toPatch=all.filter((v: any)=>classifyVendor(v.Name)==='PARTS'&&v.Vendor_Posting_Group!=='PARTS');
      setMigrateStatus((s: any)=>({...s,total:toPatch.length}));
      let patched=0;const errors: string[]=[];const log: string[]=[];
      for(let i=0;i<toPatch.length;i++){
        const v=toPatch[i];
        const pr=await fetch(`${BC_ODATA_BASE}/${vPage}('${v.No}')`,{
          method:'PATCH',
          headers:{"Authorization":`Bearer ${_bcToken}`,"Content-Type":"application/json","If-Match":"*"},
          body:JSON.stringify({Vendor_Posting_Group:'PARTS'})
        });
        if(pr.ok||pr.status===204){
          patched++;log.push(`\u2713 ${v.No} \u2014 ${v.Name}`);
          setMigrateStatus((s: any)=>({...s,patched,log:[...log]}));
        }else{
          const txt=await pr.text();
          // Detect "PARTS posting group doesn't exist" error
          if(/posting group|does not exist|invalid.*parts|parts.*invalid/i.test(txt)){
            setMigrateStatus((s: any)=>({...s,running:false,needsSetup:true,
              log:[...log,`\u2717 ${v.No}: PARTS posting group not found in BC`]}));
            return;
          }
          errors.push(`${v.No}: ${txt.slice(0,120)}`);
          log.push(`\u2717 ${v.No} \u2014 ${v.Name}: error`);
          setMigrateStatus((s: any)=>({...s,errors:[...errors],log:[...log]}));
        }
        if(i<toPatch.length-1)await new Promise(res=>setTimeout(res,150));
      }
      setMigrateStatus({running:false,done:true,total:toPatch.length,patched,errors,needsSetup:false,log});
      await fetchVendors();
    }catch(e: any){
      setMigrateStatus((s: any)=>({...s,running:false,errors:[e.message]}));
    }
  }

  async function fetchVendors(){
    setLoading(true);setError(null);
    try{
      const allPages=await bcDiscoverODataPages();
      const vPage=allPages.find((n: string)=>/^vendor/i.test(n))||'Vendor';
      const r=await fetch(
        `${BC_ODATA_BASE}/${vPage}?$select=No,Name,Search_Name,Phone_No,Gen_Bus_Posting_Group,Vendor_Posting_Group,Tax_Area_Code&$top=500&$orderby=Name asc`,
        {headers:{"Authorization":`Bearer ${_bcToken}`}});
      if(!r.ok)throw new Error(`BC ${r.status} \u2014 page: ${vPage}`);
      const vs=(await r.json()).value||[];
      setVendors(vs);
      // Auto-detect posting group defaults from existing vendors (once per session)
      if(!defaultsSetRef.current&&vs.length){
        const count=(arr: any[],key: string)=>{
          const m: Record<string,number>={};arr.forEach((v: any)=>{const k=v[key];if(k)m[k]=(m[k]||0)+1;});
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
    }catch(e: any){setError(e.message);}
    setLoading(false);
  }

  // Real-time duplicate detection
  function getDupMatch(): any{
    const input=newName.trim();
    if(input.length<2)return null;

    const stopRx=/\b(electric|electrical|electronics|electro|supply|supplies|industrial|automation|controls|systems|solutions|technologies|services|group|company|co|inc|llc|ltd|corp|gmbh|ag|north america|usa|u\.s\.a)\b\.?/gi;
    const norm=(s: string)=>s.toLowerCase().replace(stopRx,'').replace(/[^a-z0-9]/g,'').trim();

    function trigramSim(a: string,b: string){
      if(!a||!b)return 0;
      if(a===b)return 1;
      const tg=(s: string)=>{const t=new Set<string>();for(let i=0;i<=s.length-3;i++)t.add(s.slice(i,i+3));return t;};
      const ta=tg(a),tb=tg(b);
      if(!ta.size||!tb.size)return 0;
      let inter=0;for(const t of ta)if(tb.has(t))inter++;
      return(2*inter)/(ta.size+tb.size);
    }

    function tokenOverlap(a: string,b: string){
      const toks=(s: string)=>s.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(w=>w.length>2);
      const ta=new Set(toks(a)),tb=new Set(toks(b));
      if(!ta.size||!tb.size)return 0;
      let shared=0;for(const t of ta)if(tb.has(t))shared++;
      return shared/Math.min(ta.size,tb.size);
    }

    const normInput=norm(input);
    let best: any=null;
    for(const v of vendors){
      const vName=v.Name||'';
      const normV=norm(vName);
      if(normInput&&normV&&normInput===normV)
        return{type:'error',msg:`Exact match: ${v.No} \u2014 ${v.Name}`};
      if(normInput.length>=4&&normV.length>=4&&(normInput.includes(normV)||normV.includes(normInput))){
        if(!best||best.score<0.9)best={score:0.9,v};
        continue;
      }
      const tg=trigramSim(normInput,normV);
      const tok=tokenOverlap(input,vName);
      const score=Math.max(tg,tok);
      if(score>=0.45&&(!best||score>best.score))best={score,v};
    }
    if(best)return{type:'warn',score:best.score,
      msg:`Similar vendor exists: ${best.v.No} \u2014 ${best.v.Name}`};
    return null;
  }
  const dupMatch=getDupMatch();

  function getCodeDupMatch(): any{
    const code=newCode.trim().toUpperCase();
    if(!code)return null;
    for(const[vNo,vCode] of Object.entries(vendorCodes)){
      if((vCode||'').trim().toUpperCase()===code){
        const vName=vendors.find((v: any)=>v.No===vNo)?.Name||vNo;
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
      // Step 1 -- Create vendor via REST API v2.0
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
      // Step 2 -- PATCH posting groups + tax area via OData
      if(createdNo&&(newGenBus||newVendorPosting||newTaxArea)){
        try{
          const allPages=await bcDiscoverODataPages();
          const vPage=allPages.find((n: string)=>/^vendor/i.test(n))||'Vendor';
          const patch: any={};
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
        }catch(pe: any){console.warn('Posting group patch failed:',pe.message);}
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
    }catch(e: any){setAddErr(e.message);}
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
      {/* Row 1 -- Name + Code */}
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
            {codeDupMatch&&<span style={{fontSize:11,color:"#f87171",whiteSpace:"nowrap"}}>{"\uD83D\uDEAB"} {codeDupMatch.msg}</span>}
            {!codeDupMatch&&hasName&&!hasCode&&<span style={{fontSize:11,color:"#f59e0b",whiteSpace:"nowrap"}}>{"\u26A0"} Code required</span>}
            {canAdd&&<span style={{fontSize:12,fontWeight:700,color:"#22c55e",whiteSpace:"nowrap"}}>{"\u2705"} Ready to add</span>}
          </div>
        </div>
      </div>
      {/* Row 2 -- Posting groups + Tax area */}
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
          {adding?"Adding\u2026":"+ Add Vendor"}
        </button>
      </div>
      {/* Success banner */}
      {lastCreated&&<div style={{marginTop:6,padding:"6px 10px",background:"#052e16",border:"1px solid #22c55e",
        borderRadius:5,fontSize:11,color:"#86efac",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        {"\u2713"} Created: <strong>{lastCreated.name}</strong>
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
        {dupMatch.type==='error'?"\uD83D\uDEAB Duplicate \u2014 ":"\u26A0\uFE0F Similar name \u2014 "}{dupMatch.msg}
        {dupMatch.type==='warn'&&<>
          {dupMatch.score&&<span style={{color:"#94a3b8",fontFamily:"monospace"}}>({Math.round(dupMatch.score*100)}% match)</span>}
          <span style={{color:"#94a3b8"}}>{"\u00B7"} add anyway if intentional</span>
        </>}
      </div>}
      {(!newGenBus||!newVendorPosting)&&newName.trim()&&<div style={{marginTop:4,fontSize:11,color:"#fbbf24"}}>
        {"\u26A0"} Gen. Bus. Posting Group and Vendor Posting Group are required in BC — vendor may be unusable without them.
      </div>}
      {addErr&&<div style={{marginTop:4,color:"#f87171",fontSize:11}}>{"\u26A0"} {addErr}</div>}
    </div>
    );})()}

    {/* Vendor list header + filter */}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <span style={{fontSize:11,color:"#94a3b8"}}>{vendors.filter((v: any)=>showAll||v.Vendor_Posting_Group==='PARTS').length} vendors</span>
      <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:11,color:showAll?"#a78bfa":"#94a3b8"}}>
        <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} style={{accentColor:"#7c3aed"}}/>
        Show all
      </label>
    </div>
    {error&&<div style={{color:"#f87171",fontSize:12,marginBottom:8}}>{error}</div>}
    {loading?<div style={{color:"#94a3b8",fontSize:12,padding:"8px 0"}}>Loading vendors\u2026</div>:(
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
            {vendors.filter((v: any)=>showAll||v.Vendor_Posting_Group==='PARTS').map((v: any,idx: number)=>(
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
                      {vendorCodes[v.No]||"\u2014"}
                    </span>
                  )}
                </td>
                <td style={{padding:"6px 10px",color:"#93c5fd",fontFamily:"monospace",fontSize:11,whiteSpace:"nowrap"}}>{v.No}</td>
                <td style={{padding:"6px 10px",color:"#e2e8f0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:0}} title={v.Name}>
                  {v.Name}
                </td>
                <td style={{padding:"4px 8px",whiteSpace:"nowrap"}}>
                  {vpgSaving[v.No]
                    ? <span style={{fontSize:10,color:"#94a3b8"}}>saving\u2026</span>
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

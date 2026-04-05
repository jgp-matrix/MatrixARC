// @ts-nocheck
// Extracted from monolith public/index.html — function APISetupModal (lines 17807-18302)

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, fbAuth, fbDb, fbFunctions, acquireBcToken, loadBcConfig, setApiKey, APP_VERSION } from '@/core/globals';
import { getCompanyId as bcGetCompanyId, clearCompanyCache } from '@/services/businessCentral/client';
import { saveBcConfig } from '@/services/firebase/firestore';
import CodaleTestPanel from '@/ui/vendors/CodaleTestPanel';
import MouserTestPanel from '@/ui/vendors/MouserTestPanel';
import DigikeyTestPanel from '@/ui/vendors/DigikeyTestPanel';
import DigikeyUpdatePanel from '@/ui/vendors/DigikeyUpdatePanel';
import PricingReportsModal from '@/ui/modals/PricingReportsModal';

// Graph token stubs — TODO: extract real MS Graph auth module
async function tryGraphTokenSilent(): Promise<any> { return null; }
async function acquireGraphToken(): Promise<any> { return null; }

const firebase: any = (window as any).firebase || {};
let _bcCompanyId: any = null;

function APISetupModal({uid,onClose}){
  const [key,setKey]=useState("");
  const [loading,setLoading]=useState(true);
  const [saved,setSaved]=useState(false);
  const [apiTestMsg,setApiTestMsg]=useState(null);
  const [apiTesting,setApiTesting]=useState(false);
  const [showPricingReports,setShowPricingReports]=useState(false);
  // Custom scraper configs — stored at company level in Firestore
  const [customScrapers,setCustomScrapers]=useState([]);
  const [scrapersLoading,setScrapersLoading]=useState(true);
  const [editScraper,setEditScraper]=useState(null); // null=list, {}=new, {id:...}=editing
  const [scraperSaving,setScraperSaving]=useState(false);
  const [testingId,setTestingId]=useState(null);
  const [testResult,setTestResult]=useState({});
  const [lookupPart,setLookupPart]=useState({}); // {id: "partNumber"}
  const [lookupResult,setLookupResult]=useState({}); // {id: {loading,results}}
  const [lookupExpanded,setLookupExpanded]=useState({}); // {id: bool}

  async function lookupPartNumber(s){
    const pn=(lookupPart[s.id]||"").trim();
    if(!pn){return;}
    setLookupResult(prev=>({...prev,[s.id]:{loading:true,results:null,error:null}}));
    try{
      if(s.category==="api"){
        // API integration — try GET request with part number in query
        const url=s.baseUrl+(s.baseUrl.includes("?")?"&":"?")+"q="+encodeURIComponent(pn);
        const headers={"Accept":"application/json"};
        if(s.apiKey)headers["Authorization"]="Bearer "+s.apiKey;
        try{if(s.headers){Object.assign(headers,JSON.parse(s.headers));}}catch(e){}
        const r=await fetch(url,{headers});
        if(r.ok){
          const d=await r.json();
          setLookupResult(prev=>({...prev,[s.id]:{loading:false,results:d,error:null}}));
        }else{
          setLookupResult(prev=>({...prev,[s.id]:{loading:false,results:null,error:`API returned ${r.status}`}}));
        }
      }else{
        // Scraper — call Cloud Function if available, otherwise show placeholder
        try{
          const fn=firebase.functions().httpsCallable("customScraperLookup",{timeout:120000});
          const r=await fn({scraperId:s.id,partNumber:pn,config:{username:s.username,password:s.password,accountId:s.accountId||""},steps:s.steps||[]});
          setLookupResult(prev=>({...prev,[s.id]:{loading:false,results:r.data,error:null}}));
        }catch(e){
          setLookupResult(prev=>({...prev,[s.id]:{loading:false,results:null,error:"Scraper function not deployed yet. Configure the Cloud Function 'customScraperLookup' to enable live lookups."}}));
        }
      }
    }catch(e){
      setLookupResult(prev=>({...prev,[s.id]:{loading:false,results:null,error:e.message||"Lookup failed"}}));
    }
  }

  async function testConnection(s){
    setTestingId(s.id);setTestResult(prev=>({...prev,[s.id]:null}));
    try{
      const url=s.category==="api"?s.baseUrl:s.portalUrl||s.loginUrl;
      if(!url){setTestResult(prev=>({...prev,[s.id]:{ok:false,msg:"No URL configured"}}));setTestingId(null);return;}
      const r=await fetch(url,{method:"HEAD",mode:"no-cors"}).catch(()=>null);
      if(r!==null){
        setTestResult(prev=>({...prev,[s.id]:{ok:true,msg:`${s.category==="api"?"API endpoint":"Portal"} is reachable`}}));
      }else{
        setTestResult(prev=>({...prev,[s.id]:{ok:false,msg:"Could not reach URL — check the address"}}));
      }
    }catch(e){
      setTestResult(prev=>({...prev,[s.id]:{ok:false,msg:e.message||"Connection failed"}}));
    }
    setTestingId(null);
  }

  useEffect(()=>{
    const path=_appCtx.configPath||`users/${uid}/config`;
    fbDb.doc(`${path}/customScrapers`).get().then(d=>{
      if(d.exists)setCustomScrapers(d.data().scrapers||[]);
      setScrapersLoading(false);
    }).catch(()=>setScrapersLoading(false));
  },[]);

  async function saveScraperConfig(scraper){
    setScraperSaving(true);
    try{
      const path=_appCtx.configPath||`users/${uid}/config`;
      const updated=scraper.id
        ?customScrapers.map(s=>s.id===scraper.id?{...scraper,updatedAt:Date.now()}:s)
        :[...customScrapers,{...scraper,id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),createdAt:Date.now()}];
      await fbDb.doc(`${path}/customScrapers`).set({scrapers:updated});
      setCustomScrapers(updated);setEditScraper(null);
    }catch(e){alert("Save failed: "+e.message);}
    setScraperSaving(false);
  }
  async function deleteScraperConfig(id){
    if(!confirm("Delete this scraper configuration?"))return;
    const path=_appCtx.configPath||`users/${uid}/config`;
    const updated=customScrapers.filter(s=>s.id!==id);
    await fbDb.doc(`${path}/customScrapers`).set({scrapers:updated});
    setCustomScrapers(updated);
  }

  // BC Environment config
  const [bcEnvName,setBcEnvName]=useState(_bcConfig.env);
  const [bcCompName,setBcCompName]=useState(_bcConfig.companyName);
  const [bcClientIdVal,setBcClientIdVal]=useState(_bcConfig.clientId);
  const [bcSaving,setBcSaving]=useState(false);
  const [bcSaved,setBcSaved]=useState(false);
  const [bcErr,setBcErr]=useState("");
  const [bcConfirm,setBcConfirm]=useState(false);
  const [bcConnStatus,setBcConnStatus]=useState(()=>_bcToken?"connected":"unknown");
  const [bcConnDetail,setBcConnDetail]=useState("");

  useEffect(()=>{fbDb.doc(`users/${uid}/config/api`).get().then(d=>{if(d.exists)setKey(d.data().key||"");setLoading(false);}).catch(()=>setLoading(false));},[]);

  async function save(){await fbDb.doc(`users/${uid}/config/api`).set({key});setApiKey(key);setSaved(true);setTimeout(()=>setSaved(false),2000);}
  async function testApiKey(){
    const k=key.trim()||_apiKey;if(!k){setApiTestMsg({ok:false,text:"No API key entered"});return;}
    setApiTesting(true);setApiTestMsg(null);
    try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":k,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:20,messages:[{role:"user",content:"Say OK"}]})});
      const d=await r.json();if(r.ok)setApiTestMsg({ok:true,text:"API key is working — "+d.model});else setApiTestMsg({ok:false,text:(d.error?.message||"Error "+r.status)});
    }catch(e){setApiTestMsg({ok:false,text:e.message});}setApiTesting(false);
  }
  async function testBcConnection(){
    setBcConnStatus("testing");setBcConnDetail("");
    try{const token=await acquireBcToken(true);if(!token){setBcConnStatus("failed");setBcConnDetail("Could not acquire token");return;}
      _bcCompanyId=null;const compId=await bcGetCompanyId();
      if(compId){setBcConnStatus("connected");setBcConnDetail(_bcConfig.companyName);}
      else{setBcConnStatus("failed");setBcConnDetail("Company '"+_bcConfig.companyName+"' not found");}
    }catch(e){setBcConnStatus("failed");setBcConnDetail(e.message||"Connection error");}
  }

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"flex-start",justifyContent:"center",overflowY:"auto",padding:"16px"}} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{...card(),width:"100%",maxWidth:900,margin:"16px 0"}} onMouseDown={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:36,fontWeight:900,flex:1}}>🔌 API Setup</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px",borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.muted}>✕</button>
        </div>
        <div style={{fontSize:12,color:C.muted,marginBottom:20}}>API keys, connections, and price scrapers — Admin only</div>

        {/* Anthropic API Key */}
        <div style={{marginBottom:20,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Anthropic API Key</div>
          {loading?<div style={{color:C.muted,fontSize:13,padding:"9px 0"}}>Loading…</div>
            :<input value={key} onChange={e=>setKey(e.target.value)} type="text" placeholder="sk-ant-…" style={inp()}/>}
          <div style={{fontSize:11,color:C.muted,marginTop:6}}>Stored in Firebase. Shared across all team members.</div>
          <div style={{display:"flex",gap:10,marginTop:8}}>
            <button onClick={testApiKey} disabled={apiTesting||loading} style={btn("#1e3a5f","#93c5fd",{flex:1,opacity:apiTesting||loading?0.5:1,fontSize:12})}>{apiTesting?"Testing…":"Test Key"}</button>
            <button onClick={save} disabled={loading||!key.trim()} style={btn(saved?C.green:C.accent,"#fff",{flex:1,opacity:loading||!key.trim()?0.5:1,fontSize:12})}>{saved?"✓ Saved":"Save Key"}</button>
          </div>
          {apiTestMsg&&<div style={{fontSize:12,color:apiTestMsg.ok?C.green:C.red,marginTop:6,padding:"6px 10px",background:apiTestMsg.ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",border:`1px solid ${apiTestMsg.ok?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`,borderRadius:6}}>{apiTestMsg.text}</div>}
        </div>

        {/* BC Environment */}
        <div style={{marginBottom:20,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Business Central Environment</div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"6px 10px",background:C.surface,borderRadius:6,flexWrap:"wrap"}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:bcConnStatus==="connected"?C.green:bcConnStatus==="failed"?C.red:bcConnStatus==="testing"?C.yellow:C.muted,flexShrink:0}}/>
            <span style={{fontSize:12,color:C.text,flex:1}}>Current: <strong>{_bcConfig.env}</strong></span>
            <span style={{fontSize:11,fontWeight:700,borderRadius:20,padding:"2px 10px",
              background:bcConnStatus==="connected"?C.greenDim:bcConnStatus==="failed"?"rgba(239,68,68,0.1)":"rgba(100,116,139,0.1)",
              color:bcConnStatus==="connected"?C.green:bcConnStatus==="failed"?C.red:C.muted}}>
              {bcConnStatus==="connected"?"Connected":bcConnStatus==="failed"?"Failed":bcConnStatus==="testing"?"Testing…":"Not Tested"}
            </span>
            {bcConnStatus!=="testing"&&<button onClick={testBcConnection} style={{fontSize:11,color:C.accent,background:"none",border:"none",cursor:"pointer",fontWeight:600,padding:0}}>Test</button>}
          </div>
          {bcConnDetail&&bcConnStatus==="failed"&&<div style={{fontSize:11,color:C.red,marginBottom:8}}>{bcConnDetail}</div>}
          <div style={{display:"grid",gap:8,marginBottom:12}}>
            <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Environment Name</label><input value={bcEnvName} onChange={e=>setBcEnvName(e.target.value)} style={inp()} placeholder="e.g. Production"/></div>
            <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Company Name</label><input value={bcCompName} onChange={e=>setBcCompName(e.target.value)} style={inp()} placeholder="e.g. Matrix Systems LLC"/></div>
            <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Client ID (Azure App)</label><input value={bcClientIdVal} onChange={e=>setBcClientIdVal(e.target.value)} style={inp()} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></div>
          </div>
          {bcErr&&<div style={{color:C.red,fontSize:12,marginBottom:8}}>{bcErr}</div>}
          {bcSaved&&<div style={{color:C.green,fontSize:12,marginBottom:8}}>✓ BC environment updated.</div>}
          {!bcConfirm?(
            <button onClick={()=>{setBcErr("");setBcSaved(false);if(!bcEnvName.trim()||!bcCompName.trim()||!bcClientIdVal.trim()){setBcErr("All fields required.");return;}if(bcEnvName===_bcConfig.env&&bcCompName===_bcConfig.companyName&&bcClientIdVal===_bcConfig.clientId){setBcErr("No changes.");return;}setBcConfirm(true);}} disabled={bcSaving} style={btn("#334155","#fff",{fontSize:12})}>Save Environment</button>
          ):(
            <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:12}}>
              <div style={{fontSize:13,color:C.red,fontWeight:600,marginBottom:6}}>⚠ Confirm Environment Change</div>
              <div style={{fontSize:12,color:C.muted,marginBottom:10}}>Switch from <strong style={{color:C.text}}>{_bcConfig.env}</strong> to <strong style={{color:C.text}}>{bcEnvName}</strong>? All existing projects will be disconnected.</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{setBcSaving(true);setBcErr("");try{await saveBcConfig(_appCtx.companyId,{env:bcEnvName.trim(),companyName:bcCompName.trim(),clientId:bcClientIdVal.trim()});setBcSaved(true);setBcConfirm(false);testBcConnection();}catch(ex){setBcErr("Failed: "+ex.message);}setBcSaving(false);}} disabled={bcSaving} style={btn(C.red,"#fff",{fontSize:12,opacity:bcSaving?0.6:1})}>{bcSaving?"Saving…":"Yes, Switch"}</button>
                <button onClick={()=>setBcConfirm(false)} style={btn(C.surface,C.text,{fontSize:12})}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* ═══ API INTEGRATIONS SECTION ═══ */}
        <div style={{marginBottom:10,marginTop:20,borderTop:`1px solid ${C.border}`,paddingTop:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:14,fontWeight:800,color:"#38bdf8",letterSpacing:0.3}}>🔗 API Integrations</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>Official vendor APIs with structured endpoints and API keys</div></div>
            {(!editScraper||editScraper.category!=="api")&&<button onClick={()=>setEditScraper({category:"api",name:"",type:"api_key",baseUrl:"",apiKey:"",headers:"",notes:"",enabled:true})}
              style={{background:"rgba(56,189,248,0.1)",color:"#38bdf8",border:"1px solid #38bdf866",borderRadius:6,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Add API Integration</button>}
          </div>
        </div>

        {/* Built-in: Mouser */}
        <div style={{marginBottom:12,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0}}/>
            <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Mouser Electronics</div>
            <span style={{fontSize:9,color:C.muted,background:C.surface,borderRadius:10,padding:"1px 6px"}}>Built-in</span>
          </div>
          <MouserTestPanel uid={uid}/>
        </div>

        {/* Built-in: DigiKey */}
        <div style={{marginBottom:12,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0}}/>
            <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>DigiKey</div>
            <span style={{fontSize:9,color:C.muted,background:C.surface,borderRadius:10,padding:"1px 6px"}}>Built-in</span>
          </div>
          <DigikeyTestPanel uid={uid}/>
          <DigikeyUpdatePanel uid={uid}/>
        </div>

        {/* Custom API entries */}
        {customScrapers.filter(s=>s.category==="api").map(s=>{const lr=lookupResult[s.id];return(
          <div key={s.id} style={{marginBottom:12,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:s.enabled?C.green:C.muted,flexShrink:0}}/>
              <div style={{fontSize:12,color:C.sub,fontWeight:600,flex:1}}>{s.name}</div>
              <button onClick={()=>setLookupExpanded(p=>({...p,[s.id]:!p[s.id]}))}
                style={{background:"none",border:`1px solid #38bdf844`,borderRadius:4,padding:"2px 8px",fontSize:10,color:"#38bdf8",cursor:"pointer"}}>🔍 Lookup</button>
              <button onClick={()=>testConnection(s)} disabled={testingId===s.id}
                style={{background:"none",border:`1px solid ${C.accent}44`,borderRadius:4,padding:"2px 8px",fontSize:10,color:C.accent,cursor:"pointer",opacity:testingId===s.id?0.5:1}}>{testingId===s.id?"Testing…":"Test"}</button>
              <button onClick={()=>setEditScraper({...s})} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 8px",fontSize:10,color:C.muted,cursor:"pointer"}}>Edit</button>
              <button onClick={()=>deleteScraperConfig(s.id)} style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:4,padding:"2px 8px",fontSize:10,color:C.red,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontSize:11,color:C.muted}}>{s.baseUrl||"No URL"}</div>
            {s.notes&&<div style={{fontSize:10,color:C.muted,marginTop:4,fontStyle:"italic"}}>{s.notes}</div>}
            {testResult[s.id]&&<div style={{fontSize:11,marginTop:6,color:testResult[s.id].ok?C.green:C.red,padding:"4px 8px",background:testResult[s.id].ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",borderRadius:4}}>{testResult[s.id].ok?"✓ ":"✗ "}{testResult[s.id].msg}</div>}
            {lookupExpanded[s.id]&&(
              <div style={{marginTop:8,padding:"8px 10px",background:"#0d1526",border:`1px solid #38bdf833`,borderRadius:6}}>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  <input value={lookupPart[s.id]||""} onChange={e=>setLookupPart(p=>({...p,[s.id]:e.target.value}))}
                    placeholder="Enter part number…" onKeyDown={e=>{if(e.key==="Enter")lookupPartNumber(s);}}
                    style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",color:C.text,fontSize:12,flex:1}}/>
                  <button onClick={()=>lookupPartNumber(s)} disabled={lr?.loading||!(lookupPart[s.id]||"").trim()}
                    style={btn("#38bdf8","#0d0d1a",{fontSize:11,fontWeight:700,padding:"4px 12px",opacity:lr?.loading||!(lookupPart[s.id]||"").trim()?0.5:1})}>
                    {lr?.loading?"Searching…":"Search"}
                  </button>
                </div>
                {lr?.error&&<div style={{fontSize:11,color:C.red,padding:"4px 0"}}>{lr.error}</div>}
                {lr?.results&&(()=>{
                  const d=lr.results;
                  const r=d.results||d;
                  const price=r.price||r.Price||null;
                  const desc=r.description||r.Description||r.productName||null;
                  const avail=r.availability||r.Availability||r.stock||null;
                  const pn=d.partNumber||null;
                  if(price||desc||avail){
                    return(<div style={{background:"#0a1a0a",border:"1px solid #4ade8044",borderRadius:6,padding:"10px 12px",marginTop:4}}>
                      {pn&&<div style={{fontSize:11,color:C.muted,marginBottom:4}}>Part: <span style={{fontWeight:700,color:C.text}}>{pn}</span></div>}
                      {price&&<div style={{fontSize:20,fontWeight:800,color:"#4ade80"}}>{price}</div>}
                      {desc&&<div style={{fontSize:12,color:C.sub,marginTop:4}}>{desc}</div>}
                      {avail&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>Availability: {avail}</div>}
                    </div>);
                  }
                  return <pre style={{fontSize:10,color:C.sub,background:"#080810",border:`1px solid ${C.border}`,borderRadius:4,padding:8,maxHeight:200,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all",margin:0}}>{typeof d==="string"?d:JSON.stringify(d,null,2)}</pre>;
                })()}
              </div>
            )}
          </div>
        );})}

        {/* Add API form */}
        {editScraper&&editScraper.category==="api"&&(
          <div style={{marginBottom:12,border:"1px solid #38bdf8",borderRadius:8,padding:14,background:"rgba(56,189,248,0.05)"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#38bdf8",marginBottom:12}}>{editScraper.id?"Edit API Integration":"New API Integration"}</div>
            <div style={{display:"grid",gap:8,marginBottom:12}}>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Provider Name *</label>
              <input value={editScraper.name} onChange={e=>setEditScraper(p=>({...p,name:e.target.value}))} placeholder="e.g. Newark, Arrow, Octopart" style={inp()}/></div>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>API Endpoint URL *</label>
              <input value={editScraper.baseUrl} onChange={e=>setEditScraper(p=>({...p,baseUrl:e.target.value}))} placeholder="https://api.provider.com/v1/search" style={inp()}/></div>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>API Key</label>
              <input value={editScraper.apiKey||""} onChange={e=>setEditScraper(p=>({...p,apiKey:e.target.value}))} placeholder="Enter API key" type="password" style={inp()}/></div>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Custom Headers (JSON, optional)</label>
              <input value={editScraper.headers||""} onChange={e=>setEditScraper(p=>({...p,headers:e.target.value}))} placeholder='{"X-Custom-Header": "value"}' style={inp()}/></div>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Notes</label>
              <textarea value={editScraper.notes||""} onChange={e=>setEditScraper(p=>({...p,notes:e.target.value}))} placeholder="API docs link, rate limits, etc." rows={2} style={{...inp(),resize:"vertical"}}/></div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setEditScraper(null)} style={btn(C.border,C.muted,{fontSize:12})}>Cancel</button>
              <button onClick={()=>saveScraperConfig(editScraper)} disabled={scraperSaving||!editScraper.name?.trim()||!editScraper.baseUrl?.trim()}
                style={btn("#38bdf8","#0d0d1a",{fontSize:12,fontWeight:700,opacity:scraperSaving||!editScraper.name?.trim()||!editScraper.baseUrl?.trim()?0.5:1})}>
                {scraperSaving?"Saving…":editScraper.id?"Save Changes":"Add API Integration"}
              </button>
            </div>
          </div>
        )}

        {/* ═══ PRICE SCRAPERS SECTION ═══ */}
        <div style={{marginBottom:10,marginTop:24,borderTop:`1px solid ${C.border}`,paddingTop:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:14,fontWeight:800,color:"#f59e0b",letterSpacing:0.3}}>🕷 Price Scrapers</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>Supplier portal logins — browser automation to extract pricing</div></div>
            {(!editScraper||editScraper.category!=="scraper")&&<button onClick={()=>setEditScraper({category:"scraper",name:"",type:"login",portalUrl:"",loginUrl:"",username:"",password:"",notes:"",enabled:true})}
              style={{background:"rgba(245,158,11,0.1)",color:"#f59e0b",border:"1px solid #f59e0b66",borderRadius:6,padding:"5px 14px",fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Add Scraper</button>}
          </div>
        </div>

        {/* Built-in: Codale */}
        <div style={{marginBottom:12,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:C.green,flexShrink:0}}/>
            <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Codale Electric Supply</div>
            <span style={{fontSize:9,color:C.muted,background:C.surface,borderRadius:10,padding:"1px 6px"}}>Built-in</span>
          </div>
          <CodaleTestPanel uid={uid}/>
        </div>

        {/* Custom scraper entries */}
        {customScrapers.filter(s=>s.category==="scraper").map(s=>{const lr=lookupResult[s.id];return(
          <div key={s.id} style={{marginBottom:12,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:s.enabled?C.green:C.muted,flexShrink:0}}/>
              <div style={{fontSize:12,color:C.sub,fontWeight:600,flex:1}}>{s.name}</div>
              <button onClick={()=>setLookupExpanded(p=>({...p,[s.id]:!p[s.id]}))}
                style={{background:"none",border:`1px solid #f59e0b44`,borderRadius:4,padding:"2px 8px",fontSize:10,color:"#f59e0b",cursor:"pointer"}}>🔍 Lookup</button>
              <button onClick={()=>testConnection(s)} disabled={testingId===s.id}
                style={{background:"none",border:`1px solid #f59e0b44`,borderRadius:4,padding:"2px 8px",fontSize:10,color:"#f59e0b",cursor:"pointer",opacity:testingId===s.id?0.5:1}}>{testingId===s.id?"Testing…":"Test"}</button>
              <button onClick={()=>setEditScraper({...s})} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:4,padding:"2px 8px",fontSize:10,color:C.muted,cursor:"pointer"}}>Edit</button>
              <button onClick={()=>deleteScraperConfig(s.id)} style={{background:"none",border:`1px solid ${C.red}44`,borderRadius:4,padding:"2px 8px",fontSize:10,color:C.red,cursor:"pointer"}}>✕</button>
            </div>
            <div style={{fontSize:11,color:C.muted}}>{s.portalUrl||"No URL"} · {s.username||"No login"}</div>
            {s.notes&&<div style={{fontSize:10,color:C.muted,marginTop:4,fontStyle:"italic"}}>{s.notes}</div>}
            {testResult[s.id]&&<div style={{fontSize:11,marginTop:6,color:testResult[s.id].ok?C.green:C.red,padding:"4px 8px",background:testResult[s.id].ok?"rgba(34,197,94,0.08)":"rgba(239,68,68,0.08)",borderRadius:4}}>{testResult[s.id].ok?"✓ ":"✗ "}{testResult[s.id].msg}</div>}
            {lookupExpanded[s.id]&&(
              <div style={{marginTop:8,padding:"8px 10px",background:"#1a1408",border:`1px solid #f59e0b33`,borderRadius:6}}>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  <input value={lookupPart[s.id]||""} onChange={e=>setLookupPart(p=>({...p,[s.id]:e.target.value}))}
                    placeholder="Enter part number…" onKeyDown={e=>{if(e.key==="Enter")lookupPartNumber(s);}}
                    style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 8px",color:C.text,fontSize:12,flex:1}}/>
                  <button onClick={()=>lookupPartNumber(s)} disabled={lr?.loading||!(lookupPart[s.id]||"").trim()}
                    style={btn("rgba(245,158,11,0.15)","#f59e0b",{fontSize:11,fontWeight:700,padding:"4px 12px",border:"1px solid #f59e0b66",opacity:lr?.loading||!(lookupPart[s.id]||"").trim()?0.5:1})}>
                    {lr?.loading?"Searching…":"Search"}
                  </button>
                </div>
                {lr?.error&&<div style={{fontSize:11,color:C.red,padding:"4px 0"}}>{lr.error}</div>}
                {lr?.results&&(()=>{
                  const d=lr.results;
                  const r=d.results||d;
                  const price=r.price||r.Price||null;
                  const desc=r.description||r.Description||r.productName||null;
                  const avail=r.availability||r.Availability||r.stock||null;
                  const pn=d.partNumber||null;
                  if(price||desc||avail){
                    return(<div style={{background:"#0a1a0a",border:"1px solid #4ade8044",borderRadius:6,padding:"10px 12px",marginTop:4}}>
                      {pn&&<div style={{fontSize:11,color:C.muted,marginBottom:4}}>Part: <span style={{fontWeight:700,color:C.text}}>{pn}</span></div>}
                      {price&&<div style={{fontSize:20,fontWeight:800,color:"#4ade80"}}>{price}</div>}
                      {desc&&<div style={{fontSize:12,color:C.sub,marginTop:4}}>{desc}</div>}
                      {avail&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>Availability: {avail}</div>}
                    </div>);
                  }
                  return <pre style={{fontSize:10,color:C.sub,background:"#080810",border:`1px solid ${C.border}`,borderRadius:4,padding:8,maxHeight:200,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all",margin:0}}>{typeof d==="string"?d:JSON.stringify(d,null,2)}</pre>;
                })()}
              </div>
            )}
          </div>
        );})}

        {/* Add scraper form */}
        {/* DECISION(v1.19.387): Step-based scraper configuration. Admin defines browser automation steps
            (navigate, fill, click, wait, extract) that the Cloud Function executes with Puppeteer.
            No code changes needed to add new suppliers — fully configurable from the UI. */}
        {editScraper&&editScraper.category==="scraper"&&(()=>{
          const steps=editScraper.steps||[];
          const setSteps=newSteps=>setEditScraper(p=>({...p,steps:newSteps}));
          const addStep=type=>{
            const defaults={navigate:{type:"navigate",url:""},fill:{type:"fill",selector:"",value:""},click:{type:"click",selector:""},wait:{type:"wait",seconds:3,selector:""},extract:{type:"extract",selector:"",field:""},extractPageText:{type:"extractPageText",field:"price"},verifyAccount:{type:"verifyAccount"}};
            setSteps([...steps,{...defaults[type],_id:Date.now()}]);
          };
          const updateStep=(idx,updates)=>setSteps(steps.map((s,i)=>i===idx?{...s,...updates}:s));
          const removeStep=idx=>setSteps(steps.filter((_,i)=>i!==idx));
          const moveStep=(idx,dir)=>{const ns=[...steps];const t=ns[idx];ns[idx]=ns[idx+dir];ns[idx+dir]=t;setSteps(ns);};
          const stepColors={navigate:"#38bdf8",fill:"#a78bfa",click:"#4ade80",wait:"#f59e0b",extract:"#f472b6",extractPageText:"#ec4899",verifyAccount:"#06b6d4"};
          return(
          <div style={{marginBottom:12,border:"1px solid #f59e0b",borderRadius:8,padding:14,background:"rgba(245,158,11,0.05)"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#f59e0b",marginBottom:12}}>{editScraper.id?"Edit Price Scraper":"New Price Scraper"}</div>
            {/* Basic info */}
            <div style={{display:"grid",gap:8,marginBottom:12}}>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Supplier Name *</label>
              <input value={editScraper.name} onChange={e=>setEditScraper(p=>({...p,name:e.target.value}))} placeholder="e.g. Royal Wholesale, Graybar" style={inp()}/></div>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Vendor Match (comma-separated names to match in BOM)</label>
              <input value={editScraper.vendorMatch||""} onChange={e=>setEditScraper(p=>({...p,vendorMatch:e.target.value}))} placeholder="e.g. Royal,Royal Wholesale,Royal A&C" style={inp()}/></div>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1}}><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Username</label>
                <input value={editScraper.username||""} onChange={e=>setEditScraper(p=>({...p,username:e.target.value}))} placeholder="Portal username" style={inp()}/></div>
                <div style={{flex:1}}><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Password</label>
                <input value={editScraper.password||""} onChange={e=>setEditScraper(p=>({...p,password:e.target.value}))} placeholder="Portal password" type="password" style={inp()}/></div>
              </div>
              <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Customer Account ID (verified after login)</label>
              <input value={editScraper.accountId||""} onChange={e=>setEditScraper(p=>({...p,accountId:e.target.value}))} placeholder="e.g. 62103 or 71119" style={inp()}/></div>
            </div>
            {/* Steps builder */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:11,fontWeight:700,color:C.sub,textTransform:"uppercase",letterSpacing:0.5}}>Automation Steps ({steps.length})</div>
              </div>
              <div style={{fontSize:10,color:C.muted,marginBottom:8,lineHeight:1.5}}>
                Placeholders: <code style={{color:"#f59e0b"}}>{"{partNumber}"}</code> <code style={{color:"#a78bfa"}}>{"{username}"}</code> <code style={{color:"#a78bfa"}}>{"{password}"}</code>
              </div>
              {steps.map((step,si)=>(
                <div key={step._id||si} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:6,padding:"6px 8px",background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:6}}>
                  <div style={{fontSize:10,color:C.muted,fontWeight:700,minWidth:16,paddingTop:4}}>{si+1}.</div>
                  <span style={{fontSize:9,fontWeight:700,color:stepColors[step.type]||C.muted,background:(stepColors[step.type]||C.muted)+"22",borderRadius:4,padding:"2px 6px",textTransform:"uppercase",flexShrink:0,marginTop:2}}>{step.type}</span>
                  <div style={{flex:1,display:"grid",gap:4}}>
                    {step.type==="navigate"&&(
                      <input value={step.url||""} onChange={e=>updateStep(si,{url:e.target.value})} placeholder="URL (e.g. https://portal.com/login)" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11}}/>
                    )}
                    {step.type==="fill"&&(<>
                      <input value={step.selector||""} onChange={e=>updateStep(si,{selector:e.target.value})} placeholder="CSS selector (e.g. #username, input[name='email'])" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11}}/>
                      <input value={step.value||""} onChange={e=>updateStep(si,{value:e.target.value})} placeholder="Value (e.g. {username}, {partNumber})" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11}}/>
                    </>)}
                    {step.type==="click"&&(
                      <input value={step.selector||""} onChange={e=>updateStep(si,{selector:e.target.value})} placeholder="CSS selector (e.g. button[type='submit'], .search-btn)" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11}}/>
                    )}
                    {step.type==="wait"&&(
                      <div style={{display:"flex",gap:6}}>
                        <input value={step.selector||""} onChange={e=>updateStep(si,{selector:e.target.value})} placeholder="CSS selector to wait for (optional)" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11,flex:1}}/>
                        <input type="number" value={step.seconds||""} onChange={e=>updateStep(si,{seconds:parseInt(e.target.value)||0})} placeholder="sec" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11,width:50}}/>
                      </div>
                    )}
                    {step.type==="extract"&&(<>
                      <input value={step.selector||""} onChange={e=>updateStep(si,{selector:e.target.value})} placeholder="CSS selector (e.g. .price-cell, #availability)" style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11}}/>
                      <select value={step.field||""} onChange={e=>updateStep(si,{field:e.target.value})} style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11}}>
                        <option value="">— Save as field —</option>
                        <option value="price">Price</option>
                        <option value="availability">Availability</option>
                        <option value="description">Description</option>
                        <option value="leadTime">Lead Time</option>
                        <option value="uom">UOM</option>
                        <option value="partNumber">Part Number</option>
                      </select>
                    </>)}
                    {step.type==="extractPageText"&&(
                      <select value={step.field||""} onChange={e=>updateStep(si,{field:e.target.value})} style={{background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:3,padding:"3px 6px",color:C.text,fontSize:11}}>
                        <option value="price">First Price ($)</option>
                        <option value="allPrices">All Prices</option>
                        <option value="pageText">Full Page Text</option>
                      </select>
                    )}
                    {step.type==="verifyAccount"&&(
                      <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>Checks page for Customer Account ID and switches if needed</div>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:2,flexShrink:0}}>
                    {si>0&&<button onClick={()=>moveStep(si,-1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:10,padding:0}}>▲</button>}
                    {si<steps.length-1&&<button onClick={()=>moveStep(si,1)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:10,padding:0}}>▼</button>}
                    <button onClick={()=>removeStep(si)} style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:10,padding:0}}>✕</button>
                  </div>
                </div>
              ))}
              {/* Add step buttons */}
              <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>
                {[["navigate","Navigate"],["fill","Fill Field"],["click","Click"],["wait","Wait"],["verifyAccount","Verify Account"],["extract","Extract"],["extractPageText","Extract from Page"]].map(([type,label])=>(
                  <button key={type} onClick={()=>addStep(type)}
                    style={{background:(stepColors[type]||C.muted)+"15",border:`1px solid ${(stepColors[type]||C.muted)}44`,borderRadius:4,padding:"3px 8px",fontSize:10,color:stepColors[type]||C.muted,cursor:"pointer",fontWeight:600}}>
                    + {label}
                  </button>
                ))}
              </div>
            </div>
            <div><label style={{fontSize:11,color:C.sub,display:"block",marginBottom:3}}>Notes</label>
            <textarea value={editScraper.notes||""} onChange={e=>setEditScraper(p=>({...p,notes:e.target.value}))} placeholder="Portal quirks, tips, etc." rows={2} style={{...inp(),resize:"vertical"}}/></div>
            <div style={{display:"flex",gap:8,marginTop:10}}>
              <button onClick={()=>setEditScraper(null)} style={btn(C.border,C.muted,{fontSize:12})}>Cancel</button>
              <button onClick={()=>saveScraperConfig(editScraper)} disabled={scraperSaving||!editScraper.name?.trim()}
                style={btn("rgba(245,158,11,0.15)","#f59e0b",{fontSize:12,fontWeight:700,border:"1px solid #f59e0b66",opacity:scraperSaving||!editScraper.name?.trim()?0.5:1})}>
                {scraperSaving?"Saving…":editScraper.id?"Save Changes":"Add Price Scraper"}
              </button>
            </div>
          </div>);
        })()}

        {/* Pricing Reports — shared across both sections */}
        <div style={{marginTop:24,marginBottom:20,background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 14px"}}>
          <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Pricing Sync Reports</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>View history of all pricing sync runs with detailed results and CSV export.</div>
          <button onClick={()=>setShowPricingReports(true)} style={{background:"#2563eb",color:"#fff",border:"none",borderRadius:6,padding:"7px 18px",fontSize:12,fontWeight:600,cursor:"pointer"}}>View Pricing Reports</button>
        </div>
        {showPricingReports&&<PricingReportsModal uid={uid} onClose={()=>setShowPricingReports(false)}/>}

        <div style={{marginTop:24,textAlign:"center"}}>
          <button onClick={onClose} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"10px 48px",fontSize:14,fontWeight:600,cursor:"pointer"}}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default APISetupModal;

// ─── App Shell ───────────────────────────────────────────────────────────────
// Extracted verbatim from monolith v1.19.376 lines 19347-19392, 20480-21359

import React, { useState, useEffect, useRef } from 'react';
import { C, btn, inp, card } from '@/core/constants';
import {
  APP_VERSION, fbAuth, fbDb, _appCtx, _apiKey, _bcToken, _bcConfig,
  _tooltipsEnabled, _defaultBomItems, _appProjectUpdateFn, _bcQueueCountSetter,
  setAppProjectUpdateFn, setBcQueueCountSetter, setTooltipsEnabled, clearNiqCache, setBcToken, setDefaultBomItems,
  loadUserProfile, loadApiKey, loadPricingConfig, loadBcConfig,
  loadCompanyMembers, loadLaborRates, loadDefaultBomItems, saveDefaultBomItems,
  saveProject, loadProjects, deleteProject,
  acquireBcToken, bcFetchCompanyInfo, bcProcessQueue,
  bcLoadAllProjects, bcLoadAllCustomers, bcLoadAllProjectsOData,
  bcPatchJobOData, bcDeleteProject, bcEnqueue, _bcQGet,
  projectStatus, useBgTasks, loadNIQ, searchNIQ, apiCall,
  initPushNotifications, unsubscribePushNotifications,
} from '@/core/globals';
import Dashboard from './Dashboard';
import ProjectView from './ProjectView';
import ItemsTab from './tabs/ItemsTab';
import VendorSyncFloater from './vendors/VendorSyncFloater';
import {
  NewProjectModal, DeleteConfirmModal, TransferProjectModal,
  CopyProjectModal, SettingsModal, ReportsModal, PricingConfigModal,
  TeamModal, AboutModal, SupplierPricingUploadModal, CompanySetupModal,
  TourOverlay, AIDatabasePage, ErrorBoundary,
} from './stubs';
import Badge from './shared/Badge';

// ─── Stubs for globals not yet available in modules ─────────────────────────
const fbMessaging: any = null;
const _swRegistration: any = null;
// Dynamic BC API base URL -- reads from bcConfig loaded from Firestore
const BC_TENANT = 'd1f2c7f7-fab2-40b5-85c1-06a715e6a157';
const BC_API_BASE = { toString() {
  if (_bcConfig?.env) return `https://api.businesscentral.dynamics.com/v2.0/${BC_TENANT}/${_bcConfig.env}/api/v2.0`;
  return '';
}} as any;
const BC_ODATA_BASE = { toString() {
  if (_bcConfig?.env && _bcConfig?.companyName) return `https://api.businesscentral.dynamics.com/v2.0/${BC_TENANT}/${_bcConfig.env}/ODataV4/Company('${encodeURIComponent(_bcConfig.companyName)}')`;
  return '';
}} as any;
const TOUR_STEPS: any[] = [];
const TOUR_PHASES: any[] = [];
let _niqCache: any = null;
let _odataPageCache: any = null;
const firebase: any = (window as any).firebase || { firestore: { FieldValue: { delete: () => ({}) } } };

// ── NAV TABS ──
const NAV_TABS=[
  {id:"projects",  label:"SALES",       icon:"\u25EB"},
  {id:"purchasing",label:"PURCHASING",  icon:"\u2B21"},
  {id:"production",label:"PRODUCTION",  icon:"\u2699"},
  {id:"items",     label:"ITEMS/VENDORS",icon:"\u2B22"},
];

// ── LEFT NAV SIDEBAR ──
function LeftNav({tab,onTabChange,pinned,onPinChange}: any){
  const [hovered,setHovered]=useState(false);
  const isOpen=pinned||hovered;
  return(<>
    {/* Flex spacer -- pushes main content right when pinned */}
    <div style={{width:pinned?50:0,flexShrink:0,transition:"width 0.25s ease"}}/>
    {/* Fixed sidebar */}
    <div
      onMouseEnter={()=>{if(!pinned)setHovered(true);}}
      onMouseLeave={()=>{if(!pinned)setHovered(false);}}
      style={{position:"fixed",top:78,left:isOpen?0:-42,width:50,height:"calc(100vh - 78px)",
        background:"#bfdbfe",borderRight:"1px solid #93c5fd",zIndex:450,
        transition:"left 0.25s ease",display:"flex",flexDirection:"column",userSelect:"none"}}
    >
      {/* Pin toggle */}
      <div style={{display:"flex",justifyContent:"center",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #93c5fd",minHeight:36}}>
        <button onClick={()=>onPinChange(!pinned)} title={pinned?"Unpin sidebar (auto-hide)":"Pin sidebar"}
          style={{background:"none",border:"none",cursor:"pointer",padding:"2px",borderRadius:4,
            color:pinned?"#1e3a8a":"#6b7280",fontSize:13,lineHeight:1,transition:"color 0.15s"}}
        >{pinned?"\uD83D\uDCCC":"\uD83D\uDCCD"}</button>
      </div>
      {/* Tab buttons */}
      <div style={{flex:1,display:"flex",flexDirection:"column",paddingTop:12,gap:2}}>
        {NAV_TABS.map(t=>(
          <button key={t.id} onClick={()=>onTabChange(t.id)}
            style={{width:"100%",border:"none",cursor:"pointer",
              borderLeft:tab===t.id?"3px solid #1e3a8a":"3px solid transparent",
              color:tab===t.id?"#93c5fd":"#e2e8f0",
              display:"flex",flexDirection:"column",alignItems:"center",
              padding:"18px 0",gap:0,transition:"background 0.15s, color 0.15s",
              background:tab===t.id?"rgba(30,58,138,0.12)":"#9ca3af"}}
          >
            <span style={{writingMode:"vertical-lr",fontSize:tab===t.id?24:20,fontWeight:800,letterSpacing:3,
              textTransform:"uppercase",transition:"font-size 0.15s"}}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  </>);
}

export default function App({user}: any){
  const [projects,setProjects]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("dashboard");
  const [navTab,setNavTab]=useState("projects");
  const [navPinned,setNavPinned]=useState(true);
  const [openProject,setOpenProject]=useState<any>(null);
  const [revWarnModal,setRevWarnModal]=useState<any>(null); // {project, pendingAction}
  const [revSnoozed,setRevSnoozed]=useState<any>({}); // {[projectId]: true} per session
  const [showNew,setShowNew]=useState(false);
  const [showSettings,setShowSettings]=useState(false);
  const [showAbout,setShowAbout]=useState(false);
  const [showConfig,setShowConfig]=useState(false);
  const [companyId,setCompanyId]=useState<any>(null);
  const [userRole,setUserRole]=useState<any>(null);
  const [companyName,setCompanyName]=useState<any>(null);
  const [companyLogo,setCompanyLogo]=useState<any>(null);
  const [companyAddress,setCompanyAddress]=useState<any>(null);
  const [companyPhone,setCompanyPhone]=useState<any>(null);
  const [showTeam,setShowTeam]=useState(false);
  const [showSetup,setShowSetup]=useState(false);
  const [setupDismissed,setSetupDismissed]=useState(false);
  const [deleteConfirm,setDeleteConfirm]=useState<any>(null); // {id, name}
  const [transferProject,setTransferProject]=useState<any>(null); // project object
  const [copyProject_,setCopyProject]=useState<any>(null); // project object for copy modal
  const [userFirstName,setUserFirstName]=useState("");
  const [memberMap,setMemberMap]=useState<any>({}); // uid -> {email, firstName}
  const [bcOnline,setBcOnline]=useState(!!_bcToken);
  const [bcLostAlert,setBcLostAlert]=useState(false);
  const bcOnlinePrev=useRef(!!_bcToken);
  const [bcQueueCount,setBcQueueCount]=useState(()=>_bcQGet().length);
  const [connStatus,setConnStatus]=useState("good"); // "good"|"slow"|"offline"
  const bgTasks=useBgTasks();
  const bgRunning=Object.values(bgTasks).filter((t: any)=>t.status==="running");
  const [sqQuery,setSqQuery]=useState('');
  const [sqResults,setSqResults]=useState<any>(null);
  const [sqSearching,setSqSearching]=useState(false);
  const [sqAnswer,setSqAnswer]=useState(''); // AI conversational answer
  const [sqHistory,setSqHistory]=useState<any[]>([]); // chat history [{role,content}]
  // NIQ uses module-level _niqCache via loadNIQ() and searchNIQ()
  const sqInputRef=useRef<any>(null);
  const [tourStep,setTourStep]=useState<any>(null); // null=off, 0-N=active step
  const TOUR_KEY='arc_tour_step_'+user.uid;
  const [showGearMenu,setShowGearMenu]=useState(false);
  const [showUserMenu,setShowUserMenu]=useState(false);
  const [showBellMenu,setShowBellMenu]=useState(false);
  const [notifications,setNotifications]=useState<any[]>([]);
  const [pendingPortalOpen,setPendingPortalOpen]=useState<any>(null); // projectId to auto-open portal modal
  const [pushEnabled,setPushEnabled]=useState(()=>{try{return localStorage.getItem('arc_push_'+user.uid)==='1';}catch(e){return false;}});
  const [pushLoading,setPushLoading]=useState(false);
  async function togglePush(){
    if(pushLoading)return;
    setPushLoading(true);
    try{
      if(pushEnabled){
        await unsubscribePushNotifications(user.uid);
        setPushEnabled(false);
        try{localStorage.setItem('arc_push_'+user.uid,'0');}catch(e){}
      }else{
        await initPushNotifications(user.uid);
        setPushEnabled(true);
        try{localStorage.setItem('arc_push_'+user.uid,'1');}catch(e){}
      }
    }catch(e: any){console.error('Push toggle error:',e);alert('Push notification error: '+e.message);}
    setPushLoading(false);
  }
  const [showSearch,setShowSearch]=useState(false);
  const [showReports,setShowReports]=useState(false);
  const [showSupplierPricing,setShowSupplierPricing]=useState(false);
  function saveTourStep(s: any){try{if(s===null)localStorage.removeItem(TOUR_KEY);else localStorage.setItem(TOUR_KEY,String(s));}catch(e){}}
  function startTour(){
    let saved: any=null;
    try{const v=localStorage.getItem(TOUR_KEY);if(v!==null){const n=parseInt(v);if(!isNaN(n)&&n>=0&&n<TOUR_STEPS.length)saved=n;}}catch(e){}
    const step=saved!==null?saved:0;
    setTourStep(step);saveTourStep(step);
  }
  function tourNext(){setTourStep((prev: any)=>{const n=Math.min(prev+1,TOUR_STEPS.length-1);saveTourStep(n);return n;});}
  function tourPrev(){setTourStep((prev: any)=>{const n=Math.max(prev-1,0);saveTourStep(n);return n;});}
  function tourDone(){setTourStep(null);saveTourStep(null);}
  function tourSkip(){setTourStep(null);}

  // Notifications listener
  useEffect(()=>{
    if(!user.uid)return;
    const unsub=fbDb.collection(`users/${user.uid}/notifications`).where('read','==',false).orderBy('createdAt','desc').limit(50).onSnapshot((snap: any)=>{
      setNotifications(snap.docs.map((d: any)=>({id:d.id,...d.data()})));
    },()=>{});
    return()=>unsub();
  },[user.uid]);

  // RFQ pending counts per project (for dashboard cards)
  const [rfqCounts,setRfqCounts]=useState<any>({});
  useEffect(()=>{
    if(!user.uid)return;
    const unsub=fbDb.collection('rfqUploads').where('uid','==',user.uid).where('status','==','submitted').onSnapshot((snap: any)=>{
      const counts: any={};
      snap.docs.forEach((d: any)=>{const pid=d.data().projectId;if(pid)counts[pid]=(counts[pid]||0)+1;});
      setRfqCounts(counts);
    },()=>{setRfqCounts({});});
    return()=>unsub();
  },[user.uid]);

  function handleNotifClick(notif: any){
    fbDb.doc(`users/${user.uid}/notifications/${notif.id}`).update({read:true}).catch(()=>{});
    setShowBellMenu(false);
    if(notif.type==='supplier_quote'&&notif.projectId){
      const proj=projects.find((p: any)=>p.id===notif.projectId);
      if(proj){handleOpen(proj);setPendingPortalOpen(notif.projectId);}
    }
  }

  function markAllNotifsRead(){
    notifications.forEach((n: any)=>fbDb.doc(`users/${user.uid}/notifications/${n.id}`).update({read:true}).catch(()=>{}));
  }

  function closeSearch(){setShowSearch(false);}
  function openProjectFromSearch(p: any){handleOpen(p);closeSearch();}
  const sqRowRef=useRef<any>(null);
  const sqScrollRef=useRef<any>(null);

  function buildArcContext(){
    // Build rich context from all loaded projects
    const projCtx=projects.slice(0,30).map((p: any)=>{
      const panels=(p.panels||[]);
      const bomCount=panels.reduce((s: number,pan: any)=>(pan.bom||[]).length+s,0);
      const totalPrice=panels.reduce((s: number,pan: any)=>(pan.bom||[]).reduce((ss: number,r: any)=>ss+(r.qty||0)*(r.unitPrice||0),0)+s,0);
      const statuses=panels.map((pan: any)=>pan.status||'draft');
      return`- ${p.bcProjectNumber||'(no BC#)'} "${p.name}" Customer:${p.bcCustomerName||'\u2014'} Status:${projectStatus(p)} Panels:${panels.length} BOM_items:${bomCount} Total:$${totalPrice.toFixed(0)} Panel_statuses:[${statuses.join(',')}]${p.bcPoNumber?' PO:'+p.bcPoNumber:''}`;
    }).join('\n');

    // Summarize BOM parts across all projects
    const partMap: any={};
    projects.forEach((p: any)=>(p.panels||[]).forEach((pan: any)=>(pan.bom||[]).forEach((r: any)=>{
      if(r.partNumber&&!r.isLaborRow){
        const k=r.partNumber.toUpperCase();
        if(!partMap[k])partMap[k]={pn:r.partNumber,desc:r.description||'',mfr:r.manufacturer||'',count:0,avgPrice:0,total:0};
        partMap[k].count++;
        if(r.unitPrice){partMap[k].total+=r.unitPrice;partMap[k].avgPrice=partMap[k].total/partMap[k].count;}
      }
    })));
    const topParts=Object.values(partMap).sort((a: any,b: any)=>b.count-a.count).slice(0,50);
    const partsCtx=topParts.map((p: any)=>`${p.pn} (${p.mfr||'?'}) "${p.desc}" used:${p.count}x avg:$${p.avgPrice.toFixed(2)}`).join('\n');

    return{projCtx,partsCtx,projectCount:projects.length};
  }

  // NIQ functions use module-level loadNIQ() and searchNIQ()

  async function runAiSearch(q: string){
    if(!q||q.trim().length<2)return;
    setSqSearching(true);setSqAnswer('');setSqResults(null);
    try{
      const{projCtx,partsCtx,projectCount}=buildArcContext();

      // Fetch ARC Neural IQ and find relevant sections
      const niqDocs=await loadNIQ();
      const niqContext=searchNIQ(niqDocs,q.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter((w: string)=>w.length>=3));

      const systemPrompt=`You are ARC AI \u2014 the expert assistant built into the ARC (Automated Review & Costing) platform by RedPill Software, powered by ARC Neural IQ (NIQ).

ABOUT MATRIX SYSTEMS:
Matrix Systems (Matrix Panel & Control Inc.) is a UL508A and CSA C22.2 No. 286 certified industrial control panel shop. They design, build, wire, and certify custom industrial control panels for clients across manufacturing, water/wastewater, HVAC, and industrial automation. Their work includes:
- Reading electrical schematics and BOMs from engineering drawings
- Sourcing components (PLCs, VFDs, contactors, breakers, terminal blocks, enclosures, etc.)
- Panel layout design, backpanel drilling, DIN rail and wire duct placement
- Wiring, labeling, and functional testing
- UL508A listing and labeling for each panel built
- Quoting labor and materials for new projects
The users of ARC are Matrix Systems employees \u2014 panel designers, engineers, estimators, and inspectors. Assume they have a working knowledge of industrial controls, components, and panel building.

YOUR ROLE:
You are a Control Panel Designer, Engineer, Inspector, and Control Panel Expert. You speak with authority on:
- UL508A (Standard for Industrial Control Panels) \u2014 construction, listing, labeling, SCCR, wiring methods, overcurrent protection, enclosure requirements, component spacing, temperature testing, marking requirements
- CSA C22.2 No. 286 (Canadian equivalent) \u2014 harmonized requirements and delta differences from UL508A
- UL508A Supplement, FUII (Follow-Up Inspection Instructions), and Certification Manual requirements
- NEC/NFPA 70 Articles 409 (Industrial Control Panels), 430 (Motors), 440 (A/C equipment)
- Industrial automation components: PLCs (Allen-Bradley, Siemens, AutomationDirect), VFDs, motor starters, contactors, relays, terminal blocks, wire duct, DIN rail, HMIs, enclosures (Hoffman, Rittal, Saginaw), circuit breakers, MCCBs, disconnect switches, fuse holders, power supplies
- Control panel design: layout best practices, wire sizing per UL508A tables, short circuit current ratings (SCCR), thermal management, labeling requirements, spacing requirements
- Inspection: what an inspector looks for during a UL508A listing inspection, common non-conformances, corrective actions
- Pricing knowledge for industrial components (approximate ranges from major distributors)
- Business Central ERP integration and purchasing workflows
${niqContext?`
ARC NEURAL IQ \u2014 STANDARDS, LEARNING & EXTRACTION INTELLIGENCE:
The following are sourced from ARC Neural IQ (NIQ) \u2014 the AI learning engine that stores authoritative standard excerpts (UL508A, CSA C22.2 No. 286, Supplement, FUII, Certification Manual), plus learning records from past panel extractions including user notes, corrections, compliance findings, and component data. Standards excerpts are your PRIMARY source of truth \u2014 always prefer these over general knowledge when answering standards questions. Cite the document source and page numbers. Learning records contain project-specific intelligence \u2014 use them to answer questions about past projects, common patterns, typical components, and lessons learned.
${niqContext}
`:''}
USER'S ARC DATA:

PROJECTS (${projectCount} total):
${projCtx||'(none loaded)'}

FREQUENTLY USED PARTS (top 50):
${partsCtx||'(none yet)'}

INSTRUCTIONS:
- Answer as a fellow panel shop expert \u2014 knowledgeable, practical, and direct.
- When asked about standards (UL508A, C22.2, FUII, etc.), cite specific clauses/sections/tables. When ARC Neural IQ excerpts are provided, quote them directly and cite the source document and page number.
- When asked about panel design, wiring, or inspection topics, give actionable guidance that a panel builder or inspector can use immediately.
- When asked about specific projects, reference them by name and BC project number.
- When asked about parts, include part numbers and approximate pricing when relevant.
- When asked "how to" do something in ARC, explain the workflow step by step.
- If the question is a simple search (e.g. "find project X" or "show me quotes from Y"), identify matching projects/quotes and present them clearly.
- Format responses with markdown: use **bold**, bullet points, and headers for readability.
- Keep answers focused and practical \u2014 this is a work tool used by professionals, not a general chatbot.
- If you don't have the specific standard text in ARC Neural IQ, say so and provide your best knowledge with a note that the user should verify against the actual standard.`;

      // Build messages with conversation history (keep last 6 exchanges)
      const historySlice=sqHistory.slice(-12);
      const messages=[...historySlice,{role:'user',content:q}];

      const answer=(await apiCall({model:'claude-sonnet-4-6',max_tokens:2000,system:systemPrompt,messages})).trim();
      setSqAnswer(answer);
      setSqHistory((prev: any)=>[...prev,{role:'user',content:q},{role:'assistant',content:answer}].slice(-12));

      // Also do quick project/quote matching for clickable results
      const qLow=q.toLowerCase();
      const matchedProjects=projects.filter((p: any)=>
        (p.name||'').toLowerCase().includes(qLow)||
        (p.bcCustomerName||'').toLowerCase().includes(qLow)||
        (p.bcProjectNumber||'').toLowerCase().includes(qLow)
      ).slice(0,5);
      setSqResults({quotes:[],projects:matchedProjects});
    }catch(e: any){
      setSqAnswer('');
      setSqResults({quotes:[],projects:[],error:e.message});
    }
    setSqSearching(false);
    setSqQuery('');
    setTimeout(()=>{if(sqScrollRef.current)sqScrollRef.current.scrollTop=sqScrollRef.current.scrollHeight;},100);
  }

  // Load user preferences from Firestore on mount
  useEffect(()=>{
    fbDb.collection('users').doc(user.uid).collection('config').doc('preferences').get()
      .then((snap: any)=>{
        if(snap.exists){
          const v=snap.data().tooltipsEnabled;
          if(v!==undefined&&v!==_tooltipsEnabled){setTooltipsEnabled(v);document.body.classList.toggle('no-tips',!v);}
        }
      }).catch(()=>{});
  },[]);

  // Periodic BC connectivity ping every 5 minutes
  useEffect(()=>{
    const CHECK_MS=300000;
    const checkBc=async()=>{
      if(!_bcToken){
        const t=await acquireBcToken(false);
        if(!t){bcOnlinePrev.current=false;setBcOnline(false);return;}
      }
      try{
        const r=await fetch(`${BC_API_BASE}/companies?$top=1`,{headers:{"Authorization":`Bearer ${_bcToken}`}});
        if(r.status===401){
          // Token expired -- try silent refresh before alarming user
          const t=await acquireBcToken(false);
          if(t){setBcOnline(true);bcOnlinePrev.current=true;return;}
          setBcToken(null);_odataPageCache=null;bcOnlinePrev.current=false;setBcOnline(false);setBcLostAlert(true);return;
        }
        const ok=r.ok;
        if(ok&&!bcOnlinePrev.current){
          setBcOnline(true);
          // BC just came back online -- refresh company info, salesperson cache, and process queue
          fetch(BC_ODATA_BASE+"/Salesperson?$select=Code,Name,Job_Title,E_Mail,Phone_No&$filter=Blocked eq false",{headers:{"Authorization":"Bearer "+_bcToken}}).then(function(r){return r.ok?r.json():null;}).then(function(d: any){if(d)(window as any)._arcSalespersonCache=d.value||[];}).catch(function(){});
          bcFetchCompanyInfo().then((info: any)=>{
            if(info&&_appCtx.companyId){
              const merged={...(_appCtx.company||{}),name:info.name||_appCtx.company?.name,address:info.address||_appCtx.company?.address,phone:info.phone||_appCtx.company?.phone};
              _appCtx.company=merged;
              if(info.address||info.phone||info.name){
                fbDb.doc(`companies/${_appCtx.companyId}`).update({...(info.name?{name:info.name}:{}),address:info.address||"",phone:info.phone||""}).catch(()=>{});
              }
            }
          }).catch(()=>{});
          bcProcessQueue();
        }
        else if(!ok&&bcOnlinePrev.current){setBcOnline(false);setBcLostAlert(true);}
        bcOnlinePrev.current=ok;
      }catch(e){
        // Network error -- try silent token refresh before alerting
        const t=await acquireBcToken(false).catch(()=>null);
        if(t){setBcOnline(true);bcOnlinePrev.current=true;}
        else if(bcOnlinePrev.current){setBcOnline(false);setBcLostAlert(true);bcOnlinePrev.current=false;}
      }
    };
    const interval=setInterval(checkBc,CHECK_MS);
    return()=>{clearInterval(interval);};
  },[]);

  // Connection quality monitor
  useEffect(()=>{
    const determine=()=>{
      if(!navigator.onLine)return "offline";
      const c=(navigator as any).connection||(navigator as any).mozConnection||(navigator as any).webkitConnection;
      if(c){
        const et=c.effectiveType;
        if(et==="slow-2g"||et==="2g"||(c.downlink!==undefined&&c.downlink<0.5))return "slow";
      }
      return null; // unknown -- defer to ping
    };
    const apply=(s: string)=>setConnStatus((prev: any)=>prev!==s?s:prev);
    const onOnline=()=>{const s=determine();apply(s||"good");};
    const onOffline=()=>apply("offline");
    const onConnChange=()=>{const s=determine();if(s)apply(s);};
    window.addEventListener("online",onOnline);
    window.addEventListener("offline",onOffline);
    const conn=(navigator as any).connection||(navigator as any).mozConnection||(navigator as any).webkitConnection;
    if(conn)conn.addEventListener("change",onConnChange);
    // Firestore latency ping every 30s
    const ping=async()=>{
      if(!navigator.onLine){apply("offline");return;}
      const t0=Date.now();
      try{
        const p=new Promise((_,rej)=>setTimeout(()=>rej("timeout"),10000));
        await Promise.race([(window as any).firebase?.firestore?.().collection("_ping").doc("test").get?.() || Promise.resolve(),p]);
        const ms=Date.now()-t0;
        const net=determine();
        if(net==="offline")apply("offline");
        else if(net==="slow"||ms>5000)apply("slow");
        else apply("good");
      }catch(e: any){
        if(e==="timeout")apply("offline");
        else if(!navigator.onLine)apply("offline");
        // permission-denied / not-found = Firestore reachable -> connection is good
        else if(e?.code==="unavailable"||e?.code==="resource-exhausted")apply("slow");
        else apply("good");
      }
    };
    const iv=setInterval(ping,30000);
    setTimeout(ping,5000); // initial check after 5s
    return()=>{
      window.removeEventListener("online",onOnline);
      window.removeEventListener("offline",onOffline);
      if(conn)conn.removeEventListener("change",onConnChange);
      clearInterval(iv);
    };
  },[]);

  // Splash screen state: "loading" -> "shrinking" -> "done"
  const [splash,setSplash]=useState("loading");
  const [splashPct,setSplashPct]=useState(0);
  const splashStartRef=useRef(Date.now());
  useEffect(()=>{
    const duration=3000;
    let raf: any;
    function tick(){
      const elapsed=Date.now()-splashStartRef.current;
      const pct=Math.min(100,Math.round((elapsed/duration)*100));
      setSplashPct(pct);
      if(elapsed<duration){raf=requestAnimationFrame(tick);}
      else{setSplash("shrinking");setTimeout(()=>setSplash("done"),800);}
    }
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[]);

  useEffect(()=>{
    (async()=>{
      _appCtx.uid=user.uid;
      const profile=await loadUserProfile(user.uid);
      if(profile?.companyId){
        _appCtx.companyId=profile.companyId;
        _appCtx.role=profile.role;
        _appCtx.projectsPath=`companies/${profile.companyId}/projects`;
        _appCtx.configPath=`companies/${profile.companyId}/config`;
        setCompanyId(profile.companyId);
        setUserRole(profile.role);
        try{
          const cd=await fbDb.doc(`companies/${profile.companyId}`).get();
          if(cd.exists){
            const cdat=cd.data();
            setCompanyName(cdat.name||null);
            setCompanyLogo(cdat.logoUrl||null);
            setCompanyAddress(cdat.address||null);
            setCompanyPhone(cdat.phone||null);
            _appCtx.company={name:cdat.name||null,logoUrl:cdat.logoUrl||null,logoDarkUrl:cdat.logoDarkUrl||null,address:cdat.address||null,phone:cdat.phone||null};
            (_appCtx as any).termsAndConditions=cdat.termsAndConditions||"";
            // Load BC environment config from Firestore
            await loadBcConfig(profile.companyId);
            // Also try to pull fresh company data from BC
            if(_bcToken){
              bcFetchCompanyInfo().then((info: any)=>{
                if(info){
                  const merged={...(_appCtx.company||{}),name:info.name||_appCtx.company?.name,address:info.address||_appCtx.company?.address,phone:info.phone||_appCtx.company?.phone};
                  _appCtx.company=merged;
                  if(info.address)setCompanyAddress(info.address);
                  if(info.phone)setCompanyPhone(info.phone);
                  if(info.name)setCompanyName(info.name);
                  if(info.address||info.phone||info.name){
                    fbDb.doc(`companies/${_appCtx.companyId}`).update({...(info.name?{name:info.name}:{}),address:info.address||"",phone:info.phone||""}).catch(()=>{});
                  }
                }
              }).catch(()=>{});
            }
          }
        }catch(e){}
      } else {
        _appCtx.projectsPath=`users/${user.uid}/projects`;
      }
      await Promise.all([loadApiKey(user.uid),loadPricingConfig(user.uid),loadDefaultBomItems(user.uid),loadLaborRates(user.uid)]);
      fbDb.doc(`users/${user.uid}/config/profile`).get().then((d: any)=>{if(d.exists)setUserFirstName(d.data().firstName||"");}).catch(()=>{});
      // Load company members -> uid->name map for project ownership display
      if(profile?.companyId){
        loadCompanyMembers(profile.companyId).then(async(mems: any)=>{
          const map: any={};
          const profileDocs=await Promise.all(mems.map((m: any)=>fbDb.doc(`users/${m.uid}/config/profile`).get().catch(()=>null)));
          mems.forEach((m: any,i: number)=>{
            const pd=profileDocs[i];
            const fn=pd&&pd.exists?pd.data().firstName||"":"";
            map[m.uid]={email:m.email||"",firstName:fn};
          });
          setMemberMap(map);
        }).catch(()=>{});
      }
      if(!_defaultBomItems.length){
        setDefaultBomItems([
          {partNumber:"JOB-BUYOFF",description:"Job Buyoff",manufacturer:"",qty:1,unitPrice:0,priceSource:null,priceDate:Date.now()},
          {partNumber:"",description:"Crate",manufacturer:"",qty:1,unitPrice:0,priceSource:null,priceDate:Date.now()}
        ]);
        saveDefaultBomItems(user.uid,_defaultBomItems).catch(()=>{});
      }
      console.log("API key loaded:",_apiKey?"YES ("+_apiKey.slice(0,8)+"\u2026)":"NO \u2014 set in Settings");
      setProjects(await loadProjects(user.uid));
      setLoading(false);
      // Auto-connect BC silently in background
      if(!_bcToken){acquireBcToken(false).then(async(t: any)=>{if(t){console.log("BC auto-connected silently");setBcOnline(true);bcOnlinePrev.current=true;bcProcessQueue();setProjects((ps: any)=>[...ps]);fetch(BC_ODATA_BASE+"/Salesperson?$select=Code,Name,Job_Title,E_Mail,Phone_No&$filter=Blocked eq false",{headers:{"Authorization":"Bearer "+_bcToken}}).then(function(r){return r.ok?r.json():null;}).then(function(d: any){if(d)(window as any)._arcSalespersonCache=d.value||[];}).catch(function(){});}}).catch(()=>{});}
    })();
  },[user.uid]);

  // Register handler so background extraction tasks can update App state after navigation
  useEffect(()=>{
    setAppProjectUpdateFn((liveProject: any)=>{
      setProjects((ps: any)=>ps.map((x: any)=>x.id===liveProject.id?liveProject:x));
      setOpenProject((prev: any)=>prev?.id===liveProject.id?liveProject:prev);
    });
    return()=>{setAppProjectUpdateFn(null);};
  },[]);

  // Register BC queue badge setter
  useEffect(()=>{
    setBcQueueCountSetter(setBcQueueCount);
    return()=>{setBcQueueCountSetter(null);};
  },[]);

  // Poll BC every 5 minutes and import any projects not yet in ARC
  useEffect(()=>{
    if(!user?.uid)return;
    async function syncBcProjects(){
      if(!_bcToken){const t=await acquireBcToken(false);if(!t)return;}
      try{
        const [bcProjects,bcCustomers,odataProjects]=await Promise.all([bcLoadAllProjects(),bcLoadAllCustomers(),bcLoadAllProjectsOData()]);
        // Build OData lookup by project No for rich customer fields
        const odataByNo=Object.fromEntries(odataProjects.filter((op: any)=>op.No).map((op: any)=>[op.No,op]));
        const bcById=Object.fromEntries(bcProjects.filter((bp: any)=>bp.id).map((bp: any)=>[bp.id,bp]));
        const custByNumber=Object.fromEntries(bcCustomers.map((c: any)=>[c.number,c.displayName]));
        function extractCustomer(bp: any){
          const odata=odataByNo[bp.number]||{};
          const custNo=odata.Sell_to_Customer_No||odata.CCS_Sell_to_Customer_No||odata.Bill_to_Customer_No||bp.billToCustomerNumber||bp.billToCustomerNo||"";
          const custName=odata.Sell_to_Customer_Name||odata.Bill_to_Name||bp.billToName||bp.billToCustomerName||(custNo?custByNumber[custNo]||"":"");
          return{bcCustomerNumber:custNo,bcCustomerName:custName};
        }
        setProjects((ps: any)=>{
          const existingBcIds=new Set(ps.map((p: any)=>p.bcProjectId).filter(Boolean));
          // Import new projects
          const toImport=bcProjects.filter((bp: any)=>bp.id&&!existingBcIds.has(bp.id));
          const newProjects=toImport.map((bp: any)=>({
            id:"arc-"+bp.id.replace(/-/g,""),
            name:bp.displayName||bp.number||"Imported Project",
            bcProjectId:bp.id,
            bcProjectNumber:bp.number||"",
            bcEnv:_bcConfig?.env,
            ...extractCustomer(bp),
            importedFromBC:true,
            status:"draft",
            panels:[],
            createdAt:Date.now(),
            updatedAt:Date.now()
          }));
          if(newProjects.length){console.log(`BC sync: importing ${newProjects.length} new project(s)`);newProjects.forEach((p: any)=>saveProject(user.uid,p).catch((e: any)=>console.warn("BC import save failed:",e)));}
          // Re-sync customer name on BC-linked projects missing it
          const toUpdate=ps.filter((p: any)=>p.bcProjectId&&!p.bcCustomerName&&bcById[p.bcProjectId]);
          const updatedPs=ps.map((p: any)=>{
            if(!p.bcProjectId||p.bcCustomerName)return p;
            const bp=bcById[p.bcProjectId];
            // Also try direct customer number lookup even without a bp match
            const custNo=p.bcCustomerNumber||"";
            const nameFromCustomers=custNo?custByNumber[custNo]||"":"";
            if(!bp&&!nameFromCustomers)return p;
            const cust=bp?extractCustomer(bp):{bcCustomerNumber:custNo,bcCustomerName:nameFromCustomers};
            if(!cust.bcCustomerName)return p;
            const updated={...p,...cust,updatedAt:Date.now()};
            saveProject(user.uid,updated).catch((e: any)=>console.warn("BC customer resync failed:",e));
            return updated;
          });
          if(toUpdate.length)console.log(`BC sync: re-synced customer on ${toUpdate.length} project(s)`);
          return newProjects.length||toUpdate.length?[...newProjects,...updatedPs]:ps;
        });
      }catch(e){console.warn("BC project sync error:",e);}
    }
    // Run immediately on load (delay slightly to allow silent BC auth to complete)
    const initialTimer=setTimeout(syncBcProjects,3000);
    const interval=setInterval(syncBcProjects,5*60*1000);
    return()=>{clearTimeout(initialTimer);clearInterval(interval);};
  },[user?.uid]);

  function checkQuoteRevWarn(action: any){
    if(!openProject){action();return;}
    const p=openProject;
    if(p.lastPrintedBomHash&&(p.quoteRev||0)>(p.quoteRevAtPrint||0)){
      if(revSnoozed[p.id]){action();return;}
      if(p.quoteRevAcknowledgedAt&&p.quoteRevAcknowledgedAt>=(p.lastQuotePrintedAt||0)){action();return;}
      setRevWarnModal({project:p,pendingAction:action});return;
    }
    action();
  }
  function handleOpen(p: any){
    checkQuoteRevWarn(()=>{setRevSnoozed((s: any)=>{const n={...s};delete n[openProject?.id];return n;});setOpenProject(p);setView("project");setNavTab("projects");});
  }
  function handleCreated(p: any){setShowNew(false);setProjects((ps: any)=>[p,...ps]);setOpenProject(p);setView("project");setNavTab("projects");}
  function handleChange(p: any){setProjects((ps: any)=>ps.map((x: any)=>x.id===p.id?p:x));setOpenProject(p);}
  function handleDelete(id: any,name: any,bcProjectId: any,bcProjectNumber: any,project: any){setDeleteConfirm({id,name,bcProjectId,bcProjectNumber,project});}
  async function confirmDelete(deleteFromBC: any){
    if(!deleteConfirm)return;
    if(deleteFromBC&&deleteConfirm.bcProjectId){
      try{
        await bcDeleteProject(deleteConfirm.bcProjectId);
      }catch(e: any){
        const msg=e.message||"Unknown error";
        const skip=confirm(`\u26A0 Could not delete from Business Central:\n\n${msg}\n\nDelete from ARC anyway?`);
        if(!skip){setDeleteConfirm(null);return;}
      }
    }
    await deleteProject(user.uid,deleteConfirm.id);
    setProjects((ps: any)=>ps.filter((x: any)=>x.id!==deleteConfirm.id));
    if(view==="project"&&openProject?.id===deleteConfirm.id){setView("dashboard");setOpenProject(null);}
    setDeleteConfirm(null);
  }
  function handleTransferDone(id: any){
    setProjects((ps: any)=>ps.filter((p: any)=>p.id!==id));
    if(view==="project"&&openProject?.id===id){setView("dashboard");setOpenProject(null);}
    setTransferProject(null);
  }

  async function handleAccept(id: any){
    const path=_appCtx.projectsPath||`users/${user.uid}/projects`;
    await fbDb.doc(`${path}/${id}`).update({
      transferred:firebase.firestore.FieldValue.delete(),
      transferredTo:firebase.firestore.FieldValue.delete(),
      transferredFrom:firebase.firestore.FieldValue.delete(),
      createdBy:user.uid,
    });
    setProjects((ps: any)=>ps.map((p: any)=>p.id===id?{...p,transferred:undefined,transferredTo:undefined,transferredFrom:undefined,createdBy:user.uid}:p));
  }

  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column"}}>
      {/* -- SPLASH SCREEN -- */}
      {splash!=="done"&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
          transition:"opacity 0.5s ease",opacity:splash==="shrinking"?0:1,pointerEvents:splash==="shrinking"?"none":"auto"}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",
            transition:"all 0.7s cubic-bezier(0.4,0,0.2,1)",
            transform:splash==="shrinking"?"translateY(-44vh) scale(0.38)":"translateY(0) scale(1)"}}>
            <img src="/parallax_logo.svg" alt="Parallax Software" style={{height:200,objectFit:"contain",marginBottom:16}}/>
            <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:80,fontWeight:900,letterSpacing:8,marginBottom:4,lineHeight:1,color:C.accent}}>ARC</span>
            <span style={{fontSize:15,color:C.muted,letterSpacing:2,marginBottom:32}}>Powered by <span style={{color:C.accent,fontWeight:700}}>ARC Neural IQ</span></span>
          </div>
          {splash==="loading"&&(
            <div style={{width:280,height:4,background:C.border,borderRadius:4,overflow:"hidden",transition:"opacity 0.3s",opacity:splash==="loading"?1:0}}>
              <div style={{height:"100%",background:`linear-gradient(90deg,${C.accent},#818cf8)`,borderRadius:4,transition:"width 0.15s linear",width:splashPct+"%"}}/>
            </div>
          )}
        </div>
      )}
      {/* -- TOP MENU BAR -- */}
      <div style={{position:"fixed",top:0,left:0,right:0,zIndex:500,pointerEvents:"none"}}>
        {/* Main toolbar row */}
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"0 24px",display:"flex",alignItems:"center",height:78,gap:6,position:"relative",pointerEvents:"auto"}}>
          {/* RedPill logo -- left side */}
          <img src="/parallax_logo.svg" alt="Parallax Software" style={{width:220,maxHeight:60,objectFit:"contain",cursor:"pointer",flexShrink:0}} onClick={()=>checkQuoteRevWarn(()=>{setRevSnoozed((s: any)=>{const n={...s};delete n[openProject?.id];return n;});setView("dashboard");setOpenProject(null);})}/>
          {/* ARC branding -- centered */}
          <div style={{position:"absolute",left:"50%",transform:"translateX(-50%)",display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1,pointerEvents:"none"}}>
            <span style={{fontFamily:"'Orbitron',sans-serif",fontSize:28,fontWeight:900,letterSpacing:5,color:C.accent,lineHeight:1}}>ARC</span>
            <span style={{fontSize:10,color:C.muted,letterSpacing:1.5,marginTop:4,fontWeight:600}}>Powered by <span style={{color:C.accent,fontWeight:700,letterSpacing:2}}>ARC Neural IQ</span></span>
            <span style={{fontSize:10,fontWeight:600,color:"#ffffff",opacity:0.5,letterSpacing:0.3,marginTop:3}}>{APP_VERSION}</span>
          </div>
          {/* Flex spacer */}
          <div style={{flex:1}}/>
          {/* Status indicators */}
          {bgRunning.length>0&&(
            <div title={bgRunning.map((t: any)=>t.panelName+": "+t.msg).join("\n")}
              style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",height:36,borderRadius:10,background:"#0d2a0d",border:"1px solid #22c55e99",cursor:"default",flexShrink:0}}>
              <span className="spin" style={{fontSize:12,color:"#86efac",lineHeight:1}}>{"\u25CC"}</span>
              <span style={{fontSize:12,fontWeight:600,color:"#86efac",whiteSpace:"nowrap"}}>{bgRunning.length} processing</span>
            </div>
          )}
          {connStatus!=="good"&&(
            <div style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",height:36,borderRadius:10,flexShrink:0,
              background:connStatus==="offline"?"#3b080844":"#3a1f0044",border:`1px solid ${connStatus==="offline"?"#ef444466":"#f59e0b66"}`}}>
              <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:connStatus==="offline"?C.red:C.yellow,boxShadow:`0 0 4px ${connStatus==="offline"?C.red:C.yellow}`,animation:"pulse 2s ease-in-out infinite"}}/>
              <span style={{fontSize:12,fontWeight:600,whiteSpace:"nowrap",color:connStatus==="offline"?"#fca5a5":"#fcd34d"}}>{connStatus==="offline"?"Offline":"Slow"}</span>
            </div>
          )}
          <div title={bcOnline?"Business Central is connected":"Click to connect to Business Central"}
            onClick={bcOnline?undefined:async()=>{const t=await acquireBcToken(true);if(t){setBcOnline(true);bcOnlinePrev.current=true;bcProcessQueue();}}}
            style={{display:"flex",alignItems:"center",gap:5,padding:"0 10px",height:36,borderRadius:10,flexShrink:0,background:bcOnline?"#1e4a8a55":"#3a1a1a44",border:`1px solid ${bcOnline?"#3b82f699":"#7f1d1d88"}`,cursor:bcOnline?"default":"pointer"}}>
            <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,background:bcOnline?"#3b82f6":"#ef4444",boxShadow:bcOnline?"0 0 5px #3b82f6":"0 0 5px #ef4444"}}/>
            <span style={{fontSize:12,fontWeight:600,color:bcOnline?"#93c5fd":"#fca5a5",whiteSpace:"nowrap"}}>{bcOnline?"BC Connected":"BC Offline \u2014 Click to connect"}</span>
          </div>
          {bcQueueCount>0&&(
            <div title={`${bcQueueCount} BC operation${bcQueueCount>1?'s':''} pending \u2014 will retry when connected`}
              style={{background:"#78350f",color:"#fde68a",borderRadius:20,padding:"2px 10px",fontSize:11,fontWeight:700,cursor:"default",flexShrink:0}}>
              {"\u23F3"} {bcQueueCount} pending
            </div>
          )}
          {/* Company logo -- between BC status and search */}
          {(companyLogo||companyName)&&<>
            <div style={{width:1,height:36,background:C.border,marginLeft:2,flexShrink:0}}/>
            <div style={{display:"flex",alignItems:"center",flexShrink:0,padding:"0 4px"}}>
              {companyLogo?(<img src={companyLogo} alt="Company logo" style={{maxHeight:44,maxWidth:170,objectFit:"contain"}}/>):(<span style={{color:C.accent,fontSize:21,fontWeight:700}}>{"\u2B21"} {companyName}</span>)}
            </div>
          </>}
          <div style={{width:1,height:36,background:C.border,marginLeft:2,flexShrink:0}}/>
          {/* ARC AI Assistant */}
          <button title="ARC AI Assistant \u2014 Ask about projects, UL508A, C22, parts, pricing" onClick={()=>setShowSearch(v=>!v)} style={{background:showSearch?C.accentDim:"none",border:showSearch?`1px solid ${C.accent}44`:"none",borderRadius:8,color:showSearch?C.accent:C.muted,cursor:"pointer",fontSize:22,width:47,height:47,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{"\u2728"}</button>
          {/* Bell icon */}
          <div style={{position:"relative",flexShrink:0}}>
            <button title="Notifications" onClick={()=>{setShowBellMenu(v=>!v);setShowGearMenu(false);setShowUserMenu(false);}} style={{background:showBellMenu?C.accentDim:"none",border:showBellMenu?`1px solid ${C.accent}44`:"none",borderRadius:8,color:showBellMenu?C.accent:notifications.length>0?"#fbbf24":C.muted,cursor:"pointer",fontSize:22,width:47,height:47,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{"\uD83D\uDD14"}</button>
            {notifications.length>0&&<div style={{position:"absolute",top:5,right:5,background:"#dc2626",color:"#fff",borderRadius:"50%",fontSize:10,fontWeight:800,minWidth:17,height:17,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,pointerEvents:"none"}}>{notifications.length>9?"9+":notifications.length}</div>}
            {showBellMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 0",minWidth:320,maxWidth:380,boxShadow:"0 0 30px 8px rgba(56,189,248,0.6),0 8px 30px rgba(0,0,0,0.8)",zIndex:600}}>
              <div style={{padding:"10px 16px 8px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5,flex:1}}>Notifications {notifications.length>0&&`(${notifications.length})`}</span>
                {notifications.length>0&&<button onClick={markAllNotifsRead} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,fontWeight:600,padding:0}}>Mark all read</button>}
              </div>
              <div style={{maxHeight:360,overflowY:"auto"}}>
                {notifications.length===0&&<div style={{padding:"20px 16px",textAlign:"center",color:"#94a3b8",fontSize:13}}>No new notifications</div>}
                {notifications.map((n: any)=>(
                  <div key={n.id} style={{padding:"10px 16px",borderBottom:`1px solid ${C.border}22`,cursor:n.type==='supplier_quote'?"pointer":"default"}}
                    onClick={()=>n.type==='supplier_quote'?handleNotifClick(n):undefined}>
                    <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                      <span style={{fontSize:16,flexShrink:0,marginTop:1}}>{n.type==='supplier_quote'?'\uD83D\uDCE5':'\uD83D\uDD14'}</span>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",marginBottom:2,lineHeight:1.3}}>{n.title||"Notification"}</div>
                        <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.4,marginBottom:4}}>{n.body||""}</div>
                        {n.type==='supplier_quote'&&<span style={{fontSize:11,fontWeight:700,color:C.accent}}>Click to Review Quote {"\u2192"}</span>}
                        <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>{n.createdAt?new Date(n.createdAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):""}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Push notification toggle */}
              {fbMessaging&&<div style={{padding:"8px 16px",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:C.muted,flex:1}}>{pushEnabled?"Push notifications on":"Push notifications off"}</span>
                <button onClick={togglePush} disabled={pushLoading} style={{background:pushEnabled?"#16a34a":"#334155",border:"none",borderRadius:12,width:40,height:22,cursor:pushLoading?"wait":"pointer",position:"relative",transition:"background 0.2s",flexShrink:0,opacity:pushLoading?0.5:1}}>
                  <div style={{width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:3,left:pushEnabled?21:3,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/>
                </button>
              </div>}
              {pushEnabled&&<div style={{padding:"4px 16px 8px"}}>
                <button onClick={()=>{if(_swRegistration&&Notification.permission==='granted'){_swRegistration.showNotification('MatrixARC',{body:'Push notifications are working!',icon:'/icons/icon-192.png',tag:'arc-test',renotify:true,requireInteraction:true});}}} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:6,color:C.muted,fontSize:11,padding:"4px 10px",cursor:"pointer",width:"100%"}}>Send test notification</button>
              </div>}
            </div>)}
          </div>
          {/* Gear menu */}
          <div style={{position:"relative",flexShrink:0}}>
            <button data-tour="config-btn" data-tour-training="training-btn" title="Settings & Tools" onClick={()=>{setShowGearMenu(v=>!v);setShowUserMenu(false);}} style={{background:showGearMenu?C.accentDim:"none",border:showGearMenu?`1px solid ${C.accent}44`:"none",borderRadius:8,color:showGearMenu?C.accent:C.muted,cursor:"pointer",fontSize:23,width:47,height:47,display:"flex",alignItems:"center",justifyContent:"center"}}>{"\u2699"}</button>
            {showGearMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 0",minWidth:230,boxShadow:"0 0 30px 8px rgba(56,189,248,0.6),0 8px 30px rgba(0,0,0,0.8)",zIndex:600}}>
              <div style={{padding:"10px 16px 8px",borderBottom:`1px solid ${C.border}`,marginBottom:4}}>
                <div style={{fontSize:13,fontWeight:800,color:C.text,letterSpacing:0.3}}>ARC Software</div>
                <div style={{fontSize:11,color:C.accent,fontWeight:600,marginTop:2,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{APP_VERSION}</div>
              </div>
              <button onClick={()=>{setShowSettings(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={(e: any)=>e.target.style.background="#1a1a2e"} onMouseLeave={(e: any)=>e.target.style.background="none"}>{"\u2699"} Settings</button>
              <button data-tour="config-btn" onClick={()=>{setShowConfig(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={(e: any)=>e.target.style.background="#1a1a2e"} onMouseLeave={(e: any)=>e.target.style.background="none"}>{"\uD83D\uDD27"} Configuration</button>
              <div style={{height:1,background:C.border,margin:"4px 0"}}/>
              <button data-tour="training-btn" onClick={()=>{startTour();setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:tourStep!==null?"#172554":"none",border:"none",color:tourStep!==null?"#93c5fd":C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:tourStep!==null?700:500}} onMouseEnter={(e: any)=>{if(tourStep===null)e.target.style.background="#1a1a2e";}} onMouseLeave={(e: any)=>{if(tourStep===null)e.target.style.background="none";}}>{(()=>{try{const v=localStorage.getItem(TOUR_KEY);if(v!==null&&tourStep===null){const n=parseInt(v);if(!isNaN(n)&&n>0)return`\uD83D\uDCCB Resume Training (${n+1}/${TOUR_STEPS.length})`;}return null;}catch(e){return null;}})()??'\uD83D\uDCCB Training'}</button>
              <button onClick={()=>{setShowReports(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={(e: any)=>e.target.style.background="#1a1a2e"} onMouseLeave={(e: any)=>e.target.style.background="none"}>{"\uD83D\uDCCA"} Reports</button>
              <button onClick={()=>{setShowSupplierPricing(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={(e: any)=>e.target.style.background="#1a1a2e"} onMouseLeave={(e: any)=>e.target.style.background="none"}>{"\uD83D\uDCE5"} Upload Supplier Pricing</button>
              {userRole==="admin"&&<button onClick={()=>{setView("aidb");setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:view==="aidb"?"#1a0a2a":"none",border:"none",color:"#a78bfa",cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:700}} onMouseEnter={(e: any)=>{if(view!=="aidb")e.target.style.background="#1a1a2e";}} onMouseLeave={(e: any)=>{if(view!=="aidb")e.target.style.background="none";}}>{"\uD83E\uDDE0"} ARC AI Database</button>}
              <div style={{height:1,background:C.border,margin:"4px 0"}}/>
              <button onClick={()=>{setShowAbout(true);setShowGearMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.muted,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={(e: any)=>e.target.style.background="#1a1a2e"} onMouseLeave={(e: any)=>e.target.style.background="none"}>{"\u2139"} About</button>
            </div>)}
          </div>
          {/* User menu */}
          <div style={{position:"relative",flexShrink:0}}>
            <div data-tour="team-btn" title={user.email} onClick={()=>{setShowUserMenu(v=>!v);setShowGearMenu(false);}} style={{width:44,height:44,borderRadius:"50%",background:showUserMenu?"#1e3a5f":C.border,border:showUserMenu?`2px solid ${C.accent}`:`2px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:18,fontWeight:800,color:showUserMenu?C.accent:"#94a3b8",flexShrink:0,userSelect:"none",letterSpacing:0}}>
              {user.email?user.email[0].toUpperCase():"?"}
            </div>
            {showUserMenu&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#0d0d1a",border:`1px solid ${C.border}`,borderRadius:10,padding:"6px 0",minWidth:230,boxShadow:"0 0 30px 8px rgba(56,189,248,0.6),0 8px 30px rgba(0,0,0,0.8)",zIndex:600}}>
              <div style={{padding:"12px 16px 10px",borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6,wordBreak:"break-all"}}>{user.email}</div>
                {userRole&&<span style={{fontSize:11,fontWeight:700,padding:"2px 10px",borderRadius:8,background:userRole==="admin"?C.accentDim:userRole==="edit"?C.greenDim:C.border,color:userRole==="admin"?"#93c5fd":userRole==="edit"?C.green:C.muted}}>{userRole}</span>}
              </div>
              <button data-tour="team-btn" onClick={()=>{setShowTeam(true);setShowUserMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:C.text,cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:500}} onMouseEnter={(e: any)=>e.target.style.background="#1a1a2e"} onMouseLeave={(e: any)=>e.target.style.background="none"}>{"\uD83D\uDC65"} Team & Permissions</button>
              <div style={{height:1,background:C.border,margin:"4px 0"}}/>
              <button onClick={()=>{fbAuth.signOut();setShowUserMenu(false);}} style={{display:"block",width:"100%",textAlign:"left",background:"none",border:"none",color:"#f87171",cursor:"pointer",padding:"8px 16px",fontSize:13,fontWeight:600}} onMouseEnter={(e: any)=>e.target.style.background="#1a0a0a"} onMouseLeave={(e: any)=>e.target.style.background="none"}>Sign Out</button>
            </div>)}
          </div>
        </div>
        {/* Dropdown backdrop -- closes menus when clicking outside */}
        {(showGearMenu||showUserMenu||showBellMenu)&&<div style={{position:"fixed",inset:0,zIndex:590}} onClick={()=>{setShowGearMenu(false);setShowUserMenu(false);setShowBellMenu(false);}}/>}
      </div>
      {/* Horizontal tab bar -- fixed below header */}
      <div style={{position:"fixed",top:78,left:0,right:0,zIndex:490,background:"#253354",borderBottom:"2px solid #3b82f6",display:"flex",alignItems:"flex-end",paddingLeft:16,gap:4,height:50}}>
        {NAV_TABS.map(t=>{
          const active=navTab===t.id;
          const hasOpenProject=view==="project"&&openProject;
          // Show "BACK TO SALES" only when sales tab is active AND viewing a project
          const isBackBtn=t.id==="projects"&&hasOpenProject&&active;
          // Show project name on sales tab when on another tab with project open
          const isReturnBtn=t.id==="projects"&&hasOpenProject&&!active;
          return(
          <button key={t.id} onClick={()=>{
            if(isBackBtn){checkQuoteRevWarn(()=>{setRevSnoozed((s: any)=>{const n={...s};delete n[openProject?.id];return n;});setView("dashboard");setOpenProject(null);});return;}
            // Switching tabs
            setNavTab(t.id);
          }}
            style={{cursor:"pointer",padding:"0 24px",
              height:active?46:38,
              fontSize:12,fontWeight:700,letterSpacing:isBackBtn?1:isReturnBtn?1:2,textTransform:"uppercase",
              color:isBackBtn?"#fbbf24":isReturnBtn?"#93c5fd":active?"#fff":"#93c5fd",
              background:isBackBtn?"#1a1500":active?"#1e293b":"#1a2d4a",
              borderTop:isBackBtn?"2px solid #b45309":active?"2px solid #3b82f6":"1px solid #3b5a8a",
              borderLeft:isBackBtn?"1px solid #b45309":active?"1px solid #3b82f6":"1px solid #3b5a8a",
              borderRight:isBackBtn?"1px solid #b45309":active?"1px solid #3b82f6":"1px solid #3b5a8a",
              borderBottom:active?"2px solid #1e293b":"1px solid #253354",
              borderRadius:"8px 8px 0 0",
              marginBottom:active?"-2px":0,
              position:"relative",zIndex:active?1:0,
              transition:"color 0.15s,height 0.15s"}}>
            {isBackBtn?"\u2190 BACK TO SALES":isReturnBtn?`\u2190 ${(openProject.name||"PROJECT").slice(0,20).toUpperCase()}`:t.label}
          </button>);
        })}
      </div>
      {/* Content -- padded below fixed header + tab bar */}
      <div style={{flex:1,paddingTop:122,display:"flex",height:"100vh",overflow:"hidden"}}>
      <div style={{flex:1,minWidth:0,overflowY:"auto"}}>
      <VendorSyncFloater onSwitchToItems={()=>{setNavTab("items");}}/>
      {navTab==="production"&&<Dashboard uid={user.uid} userFirstName={userFirstName} memberMap={memberMap} projects={projects} loading={loading} onOpen={handleOpen} onNew={()=>setShowNew(true)} onDelete={handleDelete} onAccept={handleAccept} onTransfer={companyId?setTransferProject:undefined} onUpdateProject={async(p: any)=>{await saveProject(user.uid,p);setProjects((ps: any)=>ps.map((x: any)=>x.id===p.id?p:x));}} sqQuery={sqQuery} sqResults={sqResults} sqSearching={sqSearching} rfqCounts={rfqCounts} forceView="production"/>}
      {navTab==="purchasing"&&<Dashboard uid={user.uid} userFirstName={userFirstName} memberMap={memberMap} projects={projects} loading={loading} onOpen={handleOpen} onNew={()=>setShowNew(true)} onDelete={handleDelete} onAccept={handleAccept} onTransfer={companyId?setTransferProject:undefined} onUpdateProject={async(p: any)=>{await saveProject(user.uid,p);setProjects((ps: any)=>ps.map((x: any)=>x.id===p.id?p:x));}} sqQuery={sqQuery} sqResults={sqResults} sqSearching={sqSearching} rfqCounts={rfqCounts} forceView="purchasing"/>}
      {navTab==="items"&&<ItemsTab uid={user.uid}/>}
      {navTab==="projects"&&<>
      {/* BC Connection Lost popup */}
      {bcLostAlert&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.65)",zIndex:900,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{...card(),maxWidth:400,width:"100%",border:"1px solid #ef444455",boxShadow:"0 0 40px #ef444422"}}>
            <div style={{fontSize:22,fontWeight:700,marginBottom:8,color:"#fca5a5"}}>{"\u26A0"} BC Connection Lost</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:20,lineHeight:1.6}}>The connection to Business Central has timed out. This can happen when the app is left open overnight. BC features (projects, customers, items) are unavailable until you reconnect.</div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setBcLostAlert(false)} style={btn(C.border,C.muted,{fontSize:13})}>Dismiss</button>
              <button onClick={async()=>{
                setBcLostAlert(false);
                const t=await acquireBcToken(true);
                if(t){setBcOnline(true);bcOnlinePrev.current=true;bcProcessQueue();}
              }} style={btn(C.accent,"#fff",{fontSize:13})}>Reconnect to BC</button>
            </div>
          </div>
        </div>
      )}
      {view==="dashboard"&&(
        <>
          {/* Company setup banner */}
          {!companyId&&!setupDismissed&&(
            <div style={{background:"#1a1a3e",borderBottom:`1px solid ${C.accent}`,padding:"8px 32px",display:"flex",alignItems:"center",gap:12,fontSize:13,flexWrap:"wrap"}}>
              <span style={{color:C.sub,flex:1}}>Set up a Company workspace to collaborate with your team.</span>
              <button onClick={()=>setShowSetup(true)} style={btn(C.accent,"#fff",{fontSize:12,padding:"5px 14px"})}>Set up Company</button>
              <button onClick={()=>setSetupDismissed(true)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:12,padding:"4px 8px"}}>Not now</button>
            </div>
          )}
          <Dashboard uid={user.uid} userFirstName={userFirstName} memberMap={memberMap} projects={projects} loading={loading} onOpen={handleOpen} onNew={()=>setShowNew(true)} onDelete={handleDelete} onAccept={handleAccept} onTransfer={companyId?setTransferProject:undefined} onUpdateProject={async(p: any)=>{await saveProject(user.uid,p);setProjects((ps: any)=>ps.map((x: any)=>x.id===p.id?p:x));}} sqQuery={sqQuery} sqResults={sqResults} sqSearching={sqSearching} rfqCounts={rfqCounts}/>
        </>
      )}
      {view==="project"&&openProject&&(
        <ErrorBoundary onBack={()=>setView("dashboard")}>
          <ProjectView project={openProject} uid={user.uid} onBack={()=>checkQuoteRevWarn(()=>{setRevSnoozed((s: any)=>{const n={...s};delete n[openProject?.id];return n;});setView("dashboard");})} onChange={handleChange} onDelete={()=>handleDelete(openProject.id,openProject.name,openProject.bcProjectId,openProject.bcProjectNumber,openProject)} onTransfer={companyId?()=>setTransferProject(openProject):undefined} onCopy={()=>setCopyProject(openProject)} autoOpenPortal={pendingPortalOpen===openProject.id} onPortalOpened={()=>setPendingPortalOpen(null)}/>
        </ErrorBoundary>
      )}
      {view==="aidb"&&userRole==="admin"&&(
        <AIDatabasePage uid={user.uid} onBack={()=>setView("dashboard")}/>
      )}
      {deleteConfirm&&<DeleteConfirmModal projectName={deleteConfirm.name} bcProjectNumber={deleteConfirm.bcProjectNumber} isAdmin={userRole==="admin"} project={deleteConfirm.project} onConfirm={confirmDelete} onCancel={()=>setDeleteConfirm(null)}/>}
      {transferProject&&<TransferProjectModal project={transferProject} companyId={companyId} uid={user.uid} userEmail={user.email} onTransferred={handleTransferDone} onClose={()=>setTransferProject(null)}/>}
      {copyProject_&&<CopyProjectModal project={copyProject_} uid={user.uid} onCopied={(p: any)=>{setCopyProject(null);setProjects((ps: any)=>[p,...ps]);handleOpen(p);}} onClose={()=>setCopyProject(null)}/>}
      {revWarnModal&&(()=>{const rm=revWarnModal;const rev=rm.project.quoteRev||0;return React.createElement("div",{style:{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"},onClick:(e: any)=>{if(e.target===e.currentTarget){rm.pendingAction();setRevWarnModal(null);}}},
        React.createElement("div",{style:{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:"32px 36px",maxWidth:440,width:"90%",textAlign:"center"}},
          React.createElement("div",{style:{fontSize:28,marginBottom:12}},"\u26A0\uFE0F"),
          React.createElement("div",{style:{fontSize:16,fontWeight:700,color:C.text,marginBottom:8}},"Quote Revision "+rev+" Unsent"),
          React.createElement("div",{style:{fontSize:13,color:C.sub,lineHeight:1.6,marginBottom:24}},"The BOM has changed since the last quote was printed. Rev "+rev+" has not been sent to the client."),
          React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:10}},
            React.createElement("button",{onClick:()=>{setRevSnoozed((s: any)=>({...s,[rm.project.id]:true}));rm.pendingAction();setRevWarnModal(null);},style:{background:"#1e1b4b",color:"#818cf8",border:"1px solid #818cf844",borderRadius:20,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}},"Snooze \u2014 Remind Next Time I Open This Project"),
            React.createElement("button",{onClick:()=>{const upd={...rm.project,quoteRevAcknowledgedAt:Date.now()};handleChange(upd);saveProject(user.uid,upd);rm.pendingAction();setRevWarnModal(null);},style:{background:"#1a0d0d",color:"#f87171",border:"1px solid #f8717144",borderRadius:20,padding:"8px 20px",fontSize:13,fontWeight:700,cursor:"pointer"}},"Don't Remind Until Next Change"),
            React.createElement("button",{onClick:()=>{rm.pendingAction();setRevWarnModal(null);},style:{background:C.card,color:C.muted,border:`1px solid ${C.border}`,borderRadius:20,padding:"8px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}},"Dismiss")
          )
        )
      );})()}
      </>}{/* end projects tab */}
      {/* Global modals -- rendered outside tab conditionals so they work from any tab */}
      {showNew&&<NewProjectModal uid={user.uid} onCreated={handleCreated} onClose={()=>setShowNew(false)}/>}
      {showSettings&&<SettingsModal uid={user.uid} onClose={()=>setShowSettings(false)} onNameChange={(n: any)=>setUserFirstName(n)}/>}
      {showReports&&<ReportsModal uid={user.uid} onClose={()=>setShowReports(false)}/>}
      {showConfig&&<PricingConfigModal uid={user.uid} onClose={()=>setShowConfig(false)} onLogoChange={(url: any)=>{setCompanyLogo(url||null);_appCtx.company={...(_appCtx.company||{}),logoUrl:url||null};}}/>}
      {showTeam&&<TeamModal uid={user.uid} companyId={companyId} userRole={userRole} onClose={()=>setShowTeam(false)}/>}
      {showAbout&&<AboutModal onClose={()=>setShowAbout(false)}/>}
      {showSupplierPricing&&<SupplierPricingUploadModal uid={user.uid} onClose={()=>setShowSupplierPricing(false)}/>}
      {showSetup&&<CompanySetupModal uid={user.uid} email={user.email} onDone={(cid: any,role: any,name: any)=>{setCompanyId(cid);setUserRole(role);setCompanyName(name||null);setShowSetup(false);}} onClose={()=>setShowSetup(false)}/>}
      </div>{/* end main content column */}
      {/* ARC AI Assistant -- right slide-out panel */}
      <div ref={sqRowRef} style={{width:showSearch?420:0,flexShrink:0,transition:"width 0.3s ease",overflow:"hidden",borderLeft:showSearch?`1px solid ${C.border}`:"none",background:"#0a0a14",position:"relative"}}>
        <div style={{width:420,height:"100%",display:"flex",flexDirection:"column",visibility:showSearch?"visible":"hidden"}}>
          {/* Header */}
          <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:18}}>{"\u2728"}</span>
            <span style={{fontSize:14,fontWeight:700,color:C.text,flex:1}}>ARC AI Assistant</span>
            {sqHistory.length>0&&!sqSearching&&<button onClick={()=>{setSqHistory([]);setSqAnswer('');setSqResults(null);clearNiqCache();}} title="Clear chat" style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:11,fontWeight:600,padding:"2px 8px"}}>Clear</button>}
            <button onClick={()=>setShowSearch(false)} title="Close" style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:18,padding:"0 4px",lineHeight:1}}>{"\u00D7"}</button>
          </div>
          {/* Chat history */}
          <div ref={sqScrollRef} style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
            {sqHistory.length===0&&!sqSearching&&<div style={{textAlign:"center",padding:"40px 16px",color:C.muted}}>
              <div style={{fontSize:32,marginBottom:12}}>{"\u2728"}</div>
              <div style={{fontSize:14,fontWeight:600,color:C.sub,marginBottom:8}}>ARC AI Assistant</div>
              <div style={{fontSize:12,lineHeight:1.7}}>Ask about projects, UL508A, C22.2,<br/>parts, pricing, or how to use ARC.</div>
            </div>}
            {sqHistory.map((msg: any,i: number)=>(
              <div key={i} style={{display:"flex",gap:10,marginBottom:14,alignItems:"flex-start"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:msg.role==='user'?C.accent:'#6366f1',display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0,marginTop:2}}>{msg.role==='user'?'Y':'AI'}</div>
                <div style={{flex:1,minWidth:0}}>
                  {msg.role==='user'
                    ?<div style={{fontSize:13,color:C.text,fontWeight:600}}>{msg.content}</div>
                    :<div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.7}} dangerouslySetInnerHTML={{__html:(()=>{
                      let html=msg.content
                        .replace(/\*\*(.+?)\*\*/g,'<strong style="color:#f1f5f9">$1</strong>')
                        .replace(/\*(.+?)\*/g,'<em>$1</em>')
                        .replace(/`([^`]+)`/g,'<code style="background:#1e293b;padding:1px 5px;border-radius:3px;font-size:12px">$1</code>')
                        .replace(/^### (.+)$/gm,'<div style="font-size:13px;font-weight:700;color:#f1f5f9;margin:8px 0 4px">$1</div>')
                        .replace(/^## (.+)$/gm,'<div style="font-size:14px;font-weight:700;color:#f1f5f9;margin:10px 0 4px">$1</div>')
                        .replace(/^- (.+)$/gm,'<div style="padding-left:12px">\u2022 $1</div>')
                        .replace(/^\d+\. (.+)$/gm,(m: any,p1: any)=>'<div style="padding-left:12px">'+m.match(/^\d+/)[0]+'. '+p1+'</div>')
                        .replace(/\n{2,}/g,'<br/><br/>')
                        .replace(/\n/g,'<br/>');
                      return html;
                    })()}}/>
                  }
                </div>
              </div>
            ))}
            {sqSearching&&<div style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0"}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:"#6366f1",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}} className="spin">{"\u25CC"}</div>
              <span style={{fontSize:13,color:C.muted}}>Thinking\u2026</span>
            </div>}
          </div>
          {/* Matched projects -- clickable chips */}
          {sqResults&&sqResults.projects.length>0&&<div style={{display:"flex",gap:6,padding:"6px 16px",overflowX:"auto",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            {sqResults.projects.map((p: any)=>(
              <div key={p.id} onClick={()=>openProjectFromSearch(p)}
                style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,fontSize:11}}
                onMouseEnter={(e: any)=>e.currentTarget.style.borderColor=C.accent}
                onMouseLeave={(e: any)=>e.currentTarget.style.borderColor=C.border}>
                <span style={{fontWeight:700,color:C.accent,marginRight:4}}>{p.bcProjectNumber||'\u2014'}</span>
                <span style={{color:C.text}}>{p.name}</span>
              </div>
            ))}
          </div>}
          {sqResults&&sqResults.error&&<div style={{fontSize:11,color:C.red,padding:"4px 16px"}}>{sqResults.error}</div>}
          {/* Input bar */}
          <div style={{padding:"8px 12px",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",background:"#1a1a2e",border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
              <input ref={sqInputRef} value={sqQuery} placeholder={sqHistory.length?"Follow up\u2026":"Ask a question\u2026"} autoFocus
                onChange={(e: any)=>setSqQuery(e.target.value)}
                onKeyDown={(e: any)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();runAiSearch(sqQuery);}}}
                style={{flex:1,background:"none",border:"none",outline:"none",color:C.text,fontSize:13,padding:"10px 12px",minWidth:0}}/>
              <button onClick={()=>runAiSearch(sqQuery)} disabled={sqSearching||!sqQuery.trim()} style={{background:C.accent,border:"none",color:"#fff",padding:"10px 14px",cursor:sqSearching?"wait":"pointer",fontSize:12,fontWeight:700,flexShrink:0,opacity:sqSearching||!sqQuery.trim()?0.5:1}}>{sqSearching?"\u2026":"Ask"}</button>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end flex row wrapper */}
      {tourStep!==null&&<TourOverlay stepIdx={tourStep} onNext={tourNext} onPrev={tourPrev} onDone={tourDone} onSkip={tourSkip} onMinimize={()=>setTourStep(null)}/>}
    </div>
  );
}

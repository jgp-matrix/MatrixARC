// #153 test harness — reconcileBom() + buildReconciledBom() pure functions.
// The two functions below are written EXACTLY as they'll be inserted into
// src/app.jsx near normPart() (they call module-global normPart +
// sortBomByDrawingPosition, stubbed here to match the real ones). Covers the
// pure-function-testable load-bearing criteria from docs/153-PHASE1-PLAN.md (C96)
// + docs/153-PLAN-ADDENDUM.md (C97). Run: node tests/153-reconcile-harness.js

// ---- stubs matching the real module globals (src/app.jsx:46777 / :10748) ----
function normPart(s){return(s||'').replace(/[\s\-\.]/g,'').toUpperCase();}
function sortBomByDrawingPosition(bom){
  if(!Array.isArray(bom)||bom.length<2)return bom;
  const positioned=[],unpositioned=[];
  for(const r of bom){
    if(r.isLaborRow||r.isContingency){unpositioned.push(r);continue;}
    if(typeof r.y_top==="number"&&!isNaN(r.y_top)){positioned.push(r);}else{unpositioned.push(r);}
  }
  positioned.sort((a,b)=>{
    const pa=+a.sourcePageIdx||0,pb=+b.sourcePageIdx||0;
    if(pa!==pb)return pa-pb;
    const yDiff=(a.y_top||0)-(b.y_top||0);
    if(Math.abs(yDiff)>0.002)return yDiff;
    return (a.x_left||0)-(b.x_left||0);
  });
  return [...positioned,...unpositioned];
}

// ============================================================================
// VERBATIM (insert near normPart in src/app.jsx)
// ============================================================================
// #153 Phase B/C: shared passthrough predicate (C97 fix) — exact complement of
// matchable. A row is passthrough (carried unconditionally, never matched) iff
// it is labor, ECO-tagged, contingency, or auto-loaded.
function _isReconPassthrough(r){return !!(r&&(r.isLaborRow||r.ecoTag||r.isContingency||r.autoLoaded));}

// #153 Phase B: three-pass reconciliation match engine. Pure — no side effects.
function reconcileBom(currentBom,newExtraction){
  const matchableCurrent=(currentBom||[]).filter(r=>r&&!_isReconPassthrough(r));
  const extraction=(newExtraction||[]).filter(Boolean);
  const unchanged=[],changed=[],matchLog=[];
  const matchedCur=new Set(),matchedExt=new Set();

  // description similarity — token Jaccard with exact-match shortcut
  const descSim=(a,b)=>{
    a=(a||'').trim().toLowerCase();b=(b||'').trim().toLowerCase();
    if(!a&&!b)return 1;if(!a||!b)return 0;if(a===b)return 1;
    const ta=new Set(a.split(/[^a-z0-9]+/).filter(Boolean)),tb=new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
    if(!ta.size||!tb.size)return 0;
    let inter=0;ta.forEach(t=>{if(tb.has(t))inter++;});
    return inter/(ta.size+tb.size-inter);
  };

  // ---- Pass 1: normPN exact, with duplicate-PN disambiguation ----
  const curByPN=new Map(),extByPN=new Map();
  matchableCurrent.forEach(r=>{const np=normPart(r.partNumber);if(!np)return;if(!curByPN.has(np))curByPN.set(np,[]);curByPN.get(np).push(r);});
  extraction.forEach(it=>{const np=normPart(it.partNumber);if(!np)return;if(!extByPN.has(np))extByPN.set(np,[]);extByPN.get(np).push(it);});

  // disambiguate a normPN group: positional (same page, |y_top|<=0.05) → itemNo → index order
  const pairGroup=(curArr,extArr)=>{
    const pairs=[],cl=[...curArr],el=[...extArr];
    // positional
    for(let ei=el.length-1;ei>=0;ei--){
      const ext=el[ei];if(typeof ext.y_top!=='number')continue;
      let best=-1,bestD=0.05+1e-9;
      for(let ci=0;ci<cl.length;ci++){
        const c=cl[ci];
        if((c.sourcePageIdx??-1)!==(ext.sourcePageIdx??-2))continue;
        if(typeof c.y_top!=='number')continue;
        const d=Math.abs(c.y_top-ext.y_top);
        if(d<=0.05&&d<bestD){bestD=d;best=ci;}
      }
      if(best>=0){pairs.push({cur:cl[best],ext});cl.splice(best,1);el.splice(ei,1);}
    }
    // itemNo
    for(let ei=el.length-1;ei>=0;ei--){
      const ext=el[ei];const ino=(ext.itemNo||'').toString().trim();if(!ino)continue;
      const ci=cl.findIndex(c=>(c.itemNo||'').toString().trim()===ino);
      if(ci>=0){pairs.push({cur:cl[ci],ext});cl.splice(ci,1);el.splice(ei,1);}
    }
    // index order
    while(cl.length&&el.length){pairs.push({cur:cl.shift(),ext:el.shift()});}
    return pairs;
  };

  // #153 (C103 Part 2): cross-aware pre-pass — match crossed prior rows by crossedFrom
  const _crossByOrig=new Map();
  matchableCurrent.forEach(r=>{
    if(!r.isCrossed||!r.crossedFrom)return;
    const np=normPart(r.crossedFrom);if(!np)return;
    if(!_crossByOrig.has(np))_crossByOrig.set(np,[]);
    _crossByOrig.get(np).push(r);
  });
  _crossByOrig.forEach((curArr,np)=>{
    const extArr=extByPN.get(np);if(!extArr||!extArr.length)return;
    const pairs=pairGroup(curArr,extArr);
    pairs.forEach(({cur,ext})=>{
      if(matchedCur.has(cur)||matchedExt.has(ext))return;
      matchedCur.add(cur);matchedExt.add(ext);
      if((+cur.qty||0)===(+ext.qty||0)){unchanged.push({prior:cur,extracted:ext});matchLog.push({pass:'cross',action:'cross-match',cls:'unchanged',pn:np});}
      else{changed.push({prior:cur,extracted:ext,reason:'qty'});matchLog.push({pass:'cross',action:'cross-match',cls:'changed-qty',pn:np});}
    });
  });
  curByPN.forEach((curArr,np)=>{
    const extArr=extByPN.get(np);if(!extArr||!extArr.length)return;
    const pairs=pairGroup(curArr,extArr);
    const ambiguous=curArr.length>1||extArr.length>1;
    pairs.forEach(({cur,ext})=>{
      if(matchedCur.has(cur)||matchedExt.has(ext))return;
      matchedCur.add(cur);matchedExt.add(ext);
      if((+cur.qty||0)===(+ext.qty||0)){unchanged.push({prior:cur,extracted:ext});matchLog.push({pass:1,action:ambiguous?'ambiguous':'match',cls:'unchanged',pn:np});}
      else{changed.push({prior:cur,extracted:ext,reason:'qty'});matchLog.push({pass:1,action:ambiguous?'ambiguous':'match',cls:'changed-qty',pn:np});}
    });
  });

  // ---- Pass 2: position + description fallback → pn_changed ----
  let unmatchedExt=extraction.filter(e=>!matchedExt.has(e));
  let unmatchedCur=matchableCurrent.filter(r=>!matchedCur.has(r));
  unmatchedExt.forEach(ext=>{
    if(typeof ext.y_top!=='number')return;
    let best=null,bestSim=0.7;
    unmatchedCur.forEach(cur=>{
      if(matchedCur.has(cur))return;
      if((cur.sourcePageIdx??-1)!==(ext.sourcePageIdx??-2))return;
      if(typeof cur.y_top!=='number')return;
      if(Math.abs(cur.y_top-ext.y_top)>0.08)return;
      const sim=descSim(cur.description,ext.description);
      if(sim>bestSim){bestSim=sim;best=cur;}
    });
    if(best){matchedCur.add(best);matchedExt.add(ext);changed.push({prior:best,extracted:ext,reason:'pn_changed'});matchLog.push({pass:2,action:'match',cls:'pn_changed'});unmatchedCur=unmatchedCur.filter(c=>c!==best);}
  });

  // ---- Pass 3: residuals ----
  const added=extraction.filter(e=>!matchedExt.has(e));
  const deleted=matchableCurrent.filter(r=>!matchedCur.has(r));
  added.forEach(()=>matchLog.push({pass:3,action:'unmatched',cls:'added'}));
  deleted.forEach(()=>matchLog.push({pass:3,action:'unmatched',cls:'deleted'}));
  return{unchanged,changed,deleted,added,matchLog};
}

// #153 Phase C: carry-forward merge. Pure. resolutions: Map<key,decision>.
function buildReconciledBom(matchResult,resolutions,currentBom){
  const passthroughRows=(currentBom||[]).filter(r=>r&&_isReconPassthrough(r));
  // Fields that MUST NOT carry forward from the prior extraction (post-spread clear).
  const NO_CARRY=['confidence','_confDowngradeReason','suspectQty','suspectQtyReason','autoAddedCompanion','companionOfPartNumber','snippetCorrected','additionalPartNumbers'];
  const carryUnchanged=(prior,ext)=>{
    const m={...prior,y_top:ext.y_top,y_bottom:ext.y_bottom,x_left:ext.x_left,x_right:ext.x_right,sourcePageIdx:ext.sourcePageIdx,sourcePageId:ext.sourcePageId};
    NO_CARRY.forEach(f=>delete m[f]);
    return m;
  };
  const carryChangedPnSame=(prior,ext)=>{
    const m=carryUnchanged(prior,ext);
    m.qty=ext.qty;
    if(ext.description&&ext.description!==prior.description)m.description=ext.description;
    return m;
  };
  const carryChangedPnChanged=(prior,ext)=>({
    id:prior.id,partNumber:ext.partNumber,qty:ext.qty,
    description:ext.description||prior.description,manufacturer:ext.manufacturer||"",
    itemNo:ext.itemNo||prior.itemNo,
    y_top:ext.y_top,y_bottom:ext.y_bottom,x_left:ext.x_left,x_right:ext.x_right,
    sourcePageIdx:ext.sourcePageIdx,sourcePageId:ext.sourcePageId,
  });
  const buildNewRow=ext=>({
    id:"row-"+Date.now()+"-"+Math.random().toString(36).slice(2,8),
    partNumber:ext.partNumber,qty:ext.qty||1,description:ext.description||"",
    manufacturer:ext.manufacturer||"",itemNo:ext.itemNo||"",
    y_top:ext.y_top,y_bottom:ext.y_bottom,x_left:ext.x_left,x_right:ext.x_right,
    sourcePageIdx:ext.sourcePageIdx,sourcePageId:ext.sourcePageId,
  });
  const unchangedMerged=(matchResult.unchanged||[]).map(p=>carryUnchanged(p.prior,p.extracted));
  const changedMerged=[];
  (matchResult.changed||[]).forEach((m,i)=>{const res=resolutions.get(`changed:${i}`);if(res==="accepted")changedMerged.push(m.reason==="pn_changed"?carryChangedPnChanged(m.prior,m.extracted):carryChangedPnSame(m.prior,m.extracted));else if(res==="rejected")changedMerged.push({...m.prior});});
  const acceptedNew=[];
  (matchResult.added||[]).forEach((ext,i)=>{if(resolutions.get(`added:${i}`)==="accepted")acceptedNew.push(buildNewRow(ext));});
  const keptDeleted=[];
  (matchResult.deleted||[]).forEach((r,i)=>{if(resolutions.get(`deleted:${i}`)==="kept")keptDeleted.push(r);});
  return[...sortBomByDrawingPosition([...unchangedMerged,...changedMerged,...acceptedNew]),...keptDeleted,...passthroughRows];
}

// ============================================================================
// TESTS
// ============================================================================
let pass=0,fail=0;
const ok=(n,c)=>{console.log(`  ${c?"✓":"✗ FAIL"} — ${n}`);c?pass++:fail++;};
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);

// ---- T18 reconcile: duplicate-PN positional disambiguation ----
console.log("\n=== T18 — duplicate-PN positional disambiguation ===");
{
  const cur=[
    {id:'a',partNumber:'WIRE-12',qty:100,description:'Wire RED',sourcePageIdx:0,y_top:0.20},
    {id:'b',partNumber:'WIRE-12',qty:50,description:'Wire BLACK',sourcePageIdx:0,y_top:0.60},
  ];
  const ext=[
    {partNumber:'WIRE12',qty:100,description:'Wire RED',sourcePageIdx:0,y_top:0.205},
    {partNumber:'WIRE12',qty:75,description:'Wire BLACK',sourcePageIdx:0,y_top:0.595},
  ];
  const r=reconcileBom(cur,ext);
  const red=r.unchanged.find(u=>u.prior.id==='a');
  const black=r.changed.find(c=>c.prior.id==='b');
  ok("RED row (qty 100=100) → unchanged, matched to top extract",!!red&&red.extracted.y_top===0.205);
  ok("BLACK row (qty 50→75) → changed, matched to bottom extract",!!black&&black.reason==='qty'&&black.extracted.y_top===0.595);
  ok("no deleted / no added",r.deleted.length===0&&r.added.length===0);
}

// ---- T19 reconcile: corrected-PN Pass 2 fallback ----
console.log("\n=== T19 — corrected-PN Pass 2 → pn_changed ===");
{
  const cur=[{id:'x',partNumber:'ABB-T1N100',qty:2,description:'Breaker 100A 3P',isCorrection:true,correctionFrom:'A88T1N1OO',sourcePageIdx:1,y_top:0.40,unitPrice:120,priceSource:'bc'}];
  const ext=[{partNumber:'A88T1N1OO',qty:2,description:'Breaker 100A 3P',sourcePageIdx:1,y_top:0.41}];
  const r=reconcileBom(cur,ext);
  ok("matched via Pass 2 as changed/pn_changed",r.changed.length===1&&r.changed[0].reason==='pn_changed');
  ok("not Delete+Add",r.deleted.length===0&&r.added.length===0);
  ok("matchLog records pass 2",r.matchLog.some(l=>l.pass===2));
}

// ---- T4 build: UNCHANGED carries edit-work, clears no-carry ----
console.log("\n=== T4 — UNCHANGED carries edit-work, confidence cleared ===");
{
  const prior={id:'r1',partNumber:'P1',qty:3,description:'Old desc',bcMatchType:'exact',priceSource:'bc',unitPrice:42.5,bcVendorName:'Acme',leadTimeDays:14,isCrossed:true,crossedFrom:'P0',confidence:'medium',_confDowngradeReason:'glyph',suspectQty:true,suspectQtyReason:'x',autoAddedCompanion:true,companionOfPartNumber:'P9',snippetCorrected:true,additionalPartNumbers:['P8'],y_top:0.10,sourcePageIdx:0};
  const ext={partNumber:'P1',qty:3,description:'Old desc',y_top:0.55,y_bottom:0.6,x_left:0.1,x_right:0.9,sourcePageIdx:2,sourcePageId:'pg2'};
  const r=reconcileBom([prior],[ext]);
  ok("classified UNCHANGED",r.unchanged.length===1&&r.changed.length===0);
  const m=buildReconciledBom(r,new Map(),[prior])[0];
  ok("bcMatchType carried",m.bcMatchType==='exact');
  ok("priceSource/unitPrice carried",m.priceSource==='bc'&&m.unitPrice===42.5);
  ok("bcVendorName/leadTimeDays carried",m.bcVendorName==='Acme'&&m.leadTimeDays===14);
  ok("isCrossed/crossedFrom carried",m.isCrossed===true&&m.crossedFrom==='P0');
  ok("position OVERRIDDEN from extraction",m.y_top===0.55&&m.sourcePageIdx===2&&m.sourcePageId==='pg2');
  ok("confidence CLEARED",!has(m,'confidence'));
  ok("_confDowngradeReason CLEARED",!has(m,'_confDowngradeReason'));
  ok("suspectQty/Reason CLEARED",!has(m,'suspectQty')&&!has(m,'suspectQtyReason'));
  ok("companion flags CLEARED",!has(m,'autoAddedCompanion')&&!has(m,'companionOfPartNumber'));
  ok("snippetCorrected/additionalPartNumbers CLEARED",!has(m,'snippetCorrected')&&!has(m,'additionalPartNumbers'));
}

// ---- T5 build: CHANGED qty (PN same) carries cross/price, qty updated ----
console.log("\n=== T5 — CHANGED qty (PN same) carries D1 fields ===");
{
  const prior={id:'r2',partNumber:'P2',qty:2,description:'D',isCrossed:true,crossedFrom:'P0',unitPrice:10,priceSource:'bc',bcMatchType:'exact',leadTimeDays:7,confidence:'low',y_top:0.2,sourcePageIdx:0};
  const ext={partNumber:'P2',qty:5,description:'D',y_top:0.25,sourcePageIdx:0};
  const r=reconcileBom([prior],[ext]);
  ok("classified CHANGED reason qty",r.changed.length===1&&r.changed[0].reason==='qty');
  const res=new Map([['changed:0','accepted']]);
  const m=buildReconciledBom(r,res,[prior])[0];
  ok("qty updated to new",m.qty===5);
  ok("cross carried",m.isCrossed===true&&m.crossedFrom==='P0');
  ok("price + BC + lead carried",m.unitPrice===10&&m.bcMatchType==='exact'&&m.leadTimeDays===7);
  ok("confidence cleared",!has(m,'confidence'));
}

// ---- T6 build: CHANGED PN-changed clears cross/BC/lead ----
console.log("\n=== T6 — CHANGED PN-changed clears D1 fields ===");
{
  const prior={id:'r3',partNumber:'OLDPN',qty:1,description:'Relay',isCrossed:true,crossedFrom:'X',unitPrice:99,priceSource:'bc',bcMatchType:'exact',leadTimeDays:21,bcVendorName:'V',y_top:0.30,sourcePageIdx:0};
  const ext={partNumber:'NEWPN',qty:1,description:'Relay',y_top:0.31,sourcePageIdx:0};
  const r=reconcileBom([prior],[ext]);
  ok("classified pn_changed (Pass 2)",r.changed.length===1&&r.changed[0].reason==='pn_changed');
  const m=buildReconciledBom(r,new Map([['changed:0','accepted']]),[prior])[0];
  ok("keeps row id",m.id==='r3');
  ok("new PN",m.partNumber==='NEWPN');
  ok("cross CLEARED",!has(m,'isCrossed')&&!has(m,'crossedFrom'));
  ok("BC pricing CLEARED",!has(m,'unitPrice')&&!has(m,'priceSource')&&!has(m,'bcMatchType')&&!has(m,'bcVendorName'));
  ok("lead time CLEARED",!has(m,'leadTimeDays'));
}

// ---- T17 + T23: passthrough (labor / ECO / contingency-auto / contingency-manual) ----
console.log("\n=== T17/T23 — passthrough completeness ===");
{
  const labor={id:'L',isLaborRow:true,description:'Assembly labor',qty:1};
  const eco={id:'E',ecoTag:'ECO-01',partNumber:'PE',qty:1};
  const contAuto={id:'CA',isContingency:true,autoLoaded:true,partNumber:'CTG',qty:1};
  const contManual={id:'CM',isContingency:true,autoLoaded:false,partNumber:'CTGM',qty:1}; // T23 case
  const real={id:'R',partNumber:'RP',qty:1,description:'Real part',y_top:0.5,sourcePageIdx:0};
  const cur=[labor,eco,contAuto,contManual,real];
  const ext=[{partNumber:'RP',qty:1,description:'Real part',y_top:0.5,sourcePageIdx:0}];
  const r=reconcileBom(cur,ext);
  ok("only the real row is matchable (1 unchanged)",r.unchanged.length===1&&r.unchanged[0].prior.id==='R');
  ok("no passthrough row appears in deleted",!r.deleted.some(d=>['L','E','CA','CM'].includes(d.id)));
  const out=buildReconciledBom(r,new Map(),cur);
  const ids=out.map(x=>x.id);
  ok("labor passthrough survives",ids.includes('L'));
  ok("ECO passthrough survives",ids.includes('E'));
  ok("auto contingency survives",ids.includes('CA'));
  ok("T23: MANUAL contingency (isContingency,!autoLoaded) survives",ids.includes('CM'));
  ok("real row survives",ids.includes('R'));
  // complement check: no row both matchable AND passthrough
  const both=cur.filter(x=>!_isReconPassthrough(x)===_isReconPassthrough(x));
  ok("isPassthrough exact complement (no row in both/neither)",both.length===0);
}

// ---- added accept/reject + deleted delete/keep + assembly order ----
console.log("\n=== added/deleted/kept + assembly order ===");
{
  const prior=[{id:'u',partNumber:'U',qty:1,description:'keep',y_top:0.10,sourcePageIdx:0},
               {id:'d',partNumber:'GONE',qty:1,description:'removed',y_top:0.90,sourcePageIdx:0}];
  const ext=[{partNumber:'U',qty:1,description:'keep',y_top:0.12,sourcePageIdx:0},
             {partNumber:'NEW1',qty:2,description:'added one',y_top:0.05,sourcePageIdx:0},
             {partNumber:'NEW2',qty:3,description:'added two',y_top:0.50,sourcePageIdx:0}];
  const r=reconcileBom(prior,ext);
  ok("1 unchanged, 2 added, 1 deleted",r.unchanged.length===1&&r.added.length===2&&r.deleted.length===1);
  // accept NEW1, reject NEW2, keep the deleted row
  const idxNew1=r.added.findIndex(a=>a.partNumber==='NEW1');
  const idxNew2=r.added.findIndex(a=>a.partNumber==='NEW2');
  const res=new Map([[`added:${idxNew1}`,'accepted'],[`added:${idxNew2}`,'rejected'],['deleted:0','kept']]);
  const out=buildReconciledBom(r,res,prior);
  const pns=out.map(x=>x.partNumber);
  ok("accepted NEW1 present",pns.includes('NEW1'));
  ok("rejected NEW2 absent",!pns.includes('NEW2'));
  ok("kept deleted row present",pns.includes('GONE'));
  // assembly: matched/accepted sorted by position (NEW1 y0.05 before U y0.12), kept-deleted appended after
  ok("sorted by position then kept-deleted last",pns[0]==='NEW1'&&pns[1]==='U'&&pns[pns.length-1]==='GONE');

  // delete (not keep) variant
  const out2=buildReconciledBom(r,new Map([[`added:${idxNew1}`,'accepted'],[`added:${idxNew2}`,'accepted'],['deleted:0','deleted']]),prior);
  ok("deleted (not kept) row absent",!out2.map(x=>x.partNumber).includes('GONE'));
}

// ---- empty / no-PN robustness ----
console.log("\n=== robustness ===");
{
  ok("empty inputs → empty result",(()=>{const r=reconcileBom([],[]);return r.unchanged.length===0&&r.added.length===0&&r.deleted.length===0;})());
  ok("no-PN current row → deleted candidate (not crash)",(()=>{const r=reconcileBom([{id:'n',partNumber:'',qty:1,description:'x',y_top:0.1,sourcePageIdx:0}],[]);return r.deleted.length===1;})());
}

// ---- C103 cross-aware pre-pass (Scenarios A / B / E / D) ----
console.log("\n=== C103 — cross-aware pre-pass ===");
{
  // Scenario A: drawing unchanged — crossed prior matches RAW extraction by crossedFrom → UNCHANGED, cross preserved
  const priorA={id:'cA',partNumber:'ABC-REPL',crossedFrom:'XYZ-ORIG',isCrossed:true,qty:5,description:'Relay',unitPrice:42,priceSource:'bc',bcMatchType:'exact',y_top:0.20,sourcePageIdx:0};
  const extA={partNumber:'XYZ-ORIG',qty:5,description:'Relay',y_top:0.22,sourcePageIdx:0}; // raw (Part 1: no auto-cross)
  const rA=reconcileBom([priorA],[extA]);
  ok("A: cross-matched as UNCHANGED (not deleted+new)",rA.unchanged.length===1&&rA.deleted.length===0&&rA.added.length===0);
  ok("A: matchLog records cross pass",rA.matchLog.some(l=>l.pass==='cross'));
  const mA=buildReconciledBom(rA,new Map(),[priorA])[0];
  ok("A: cross PRESERVED (isCrossed + crossedFrom + replacement PN)",mA.isCrossed===true&&mA.crossedFrom==='XYZ-ORIG'&&mA.partNumber==='ABC-REPL');
  ok("A: pricing/BC carried",mA.unitPrice===42&&mA.bcMatchType==='exact');
  ok("A: position updated from new drawing",mA.y_top===0.22);

  // Scenario E: qty change on a crossed row → CHANGED(qty), cross preserved, qty updated
  const priorE={id:'cE',partNumber:'ABC-REPL',crossedFrom:'XYZ-ORIG',isCrossed:true,qty:5,description:'Relay',unitPrice:42,priceSource:'bc',y_top:0.30,sourcePageIdx:0};
  const extE={partNumber:'XYZ-ORIG',qty:8,description:'Relay',y_top:0.31,sourcePageIdx:0};
  const rE=reconcileBom([priorE],[extE]);
  ok("E: cross-matched as CHANGED/qty",rE.changed.length===1&&rE.changed[0].reason==='qty'&&rE.unchanged.length===0);
  const mE=buildReconciledBom(rE,new Map([['changed:0','accepted']]),[priorE])[0];
  ok("E: cross PRESERVED + qty updated",mE.isCrossed===true&&mE.crossedFrom==='XYZ-ORIG'&&mE.partNumber==='ABC-REPL'&&mE.qty===8);

  // Scenario B: drawing PN genuinely changed → NOT cross-matched; Pass 2 → pn_changed → cross STRIPPED on accept
  const priorB={id:'cB',partNumber:'ABC-REPL',crossedFrom:'XYZ-ORIG',isCrossed:true,qty:1,description:'Breaker 100A',unitPrice:99,priceSource:'bc',y_top:0.40,sourcePageIdx:0};
  const extB={partNumber:'DEF-NEW',qty:1,description:'Breaker 100A',y_top:0.41,sourcePageIdx:0}; // different part, same position+desc
  const rB=reconcileBom([priorB],[extB]);
  ok("B: NOT cross-matched (crossedFrom XYZ-ORIG absent) → Pass 2 pn_changed",rB.changed.length===1&&rB.changed[0].reason==='pn_changed');
  const mB=buildReconciledBom(rB,new Map([['changed:0','accepted']]),[priorB])[0];
  ok("B: cross STRIPPED, new PN, pricing cleared",mB.partNumber==='DEF-NEW'&&!('isCrossed'in mB)&&!('crossedFrom'in mB)&&!('unitPrice'in mB));

  // Scenario D: non-crossed row, same PN — pre-pass skips it, Pass 1 matches by partNumber
  const priorD={id:'cD',partNumber:'XYZ-ORIG',qty:1,description:'Wire',y_top:0.50,sourcePageIdx:0};
  const extD={partNumber:'XYZ-ORIG',qty:1,description:'Wire',y_top:0.51,sourcePageIdx:0};
  const rD=reconcileBom([priorD],[extD]);
  ok("D: non-crossed same-PN → UNCHANGED via Pass 1 (no regression)",rD.unchanged.length===1&&rD.matchLog.some(l=>l.pass===1));
}

// ---- #160 (C105) Reject / Keep-Prior on Changed rows ----
console.log("\n=== #160 — reject keeps prior (no silent drop) ===");
{
  // Reject a qty-changed crossed row → prior carried EXACTLY as-is, NOT dropped
  const priorQ={id:'rQ',partNumber:'ABC-REPL',crossedFrom:'XYZ-ORIG',isCrossed:true,qty:5,description:'Relay',unitPrice:42,priceSource:'bc',bcMatchType:'exact',y_top:0.20,sourcePageIdx:0};
  const extQ={partNumber:'XYZ-ORIG',qty:8,description:'Relay',y_top:0.22,sourcePageIdx:0};
  const rQ=reconcileBom([priorQ],[extQ]);
  ok("qty change present in changed bucket",rQ.changed.length===1&&rQ.changed[0].reason==='qty');
  const mergedQ=buildReconciledBom(rQ,new Map([['changed:0','rejected']]),[priorQ]);
  ok("reject: row NOT dropped (silent-drop bug fixed)",mergedQ.length===1);
  const mQ=mergedQ[0];
  ok("reject qty: prior kept EXACTLY (qty/PN/cross/pricing as-is)",mQ.qty===5&&mQ.partNumber==='ABC-REPL'&&mQ.crossedFrom==='XYZ-ORIG'&&mQ.isCrossed===true&&mQ.unitPrice===42&&mQ.bcMatchType==='exact');
  ok("reject qty: position NOT updated from revision",mQ.y_top===0.20);

  // Reject a pn_changed crossed row → cross + pricing preserved (NOT stripped)
  const priorP={id:'rP',partNumber:'CROSSED-REPL',crossedFrom:'XYZ',isCrossed:true,qty:1,description:'Breaker 100A',unitPrice:99,priceSource:'bc',y_top:0.40,sourcePageIdx:0};
  const extP={partNumber:'DEF-NEW',qty:1,description:'Breaker 100A',y_top:0.41,sourcePageIdx:0};
  const rP=reconcileBom([priorP],[extP]);
  ok("pn change present in changed bucket",rP.changed.length===1&&rP.changed[0].reason==='pn_changed');
  const mP=buildReconciledBom(rP,new Map([['changed:0','rejected']]),[priorP])[0];
  ok("reject pn: cross PRESERVED (vs accept which strips it)",mP.partNumber==='CROSSED-REPL'&&mP.crossedFrom==='XYZ'&&mP.isCrossed===true&&mP.unitPrice===99);

  // Contrast: unresolved (neither accept nor reject) STILL drops — but gating prevents commit.
  // Verify the prior behavior only fires when nothing is set (documents the gate's necessity).
  const mNone=buildReconciledBom(rQ,new Map(),[priorQ]);
  ok("unresolved changed row drops (gate blocks this state at commit)",mNone.length===0);

  // Mixed: one accept, one reject in same batch → each treated correctly
  const pA={id:'mA',partNumber:'AAA',qty:2,description:'Term',y_top:0.10,sourcePageIdx:0};
  const pB={id:'mB',partNumber:'BBB-REPL',crossedFrom:'BBB',isCrossed:true,qty:3,description:'Lug',unitPrice:7,y_top:0.50,sourcePageIdx:0};
  const eA={partNumber:'AAA',qty:9,description:'Term',y_top:0.11,sourcePageIdx:0}; // qty change
  const eB={partNumber:'BBB',qty:3,description:'Lug',y_top:0.51,sourcePageIdx:0};   // raw matches crossedFrom → cross pre-pass, but qty same → unchanged; force a changed by qty diff
  const eB2={partNumber:'BBB',qty:6,description:'Lug',y_top:0.51,sourcePageIdx:0};
  const rMix=reconcileBom([pA,pB],[eA,eB2]);
  ok("mixed: two changed rows",rMix.changed.length===2);
  const idxA=rMix.changed.findIndex(c=>c.prior.id==='mA');const idxB=rMix.changed.findIndex(c=>c.prior.id==='mB');
  const resMix=new Map();resMix.set(`changed:${idxA}`,'accepted');resMix.set(`changed:${idxB}`,'rejected');
  const mergedMix=buildReconciledBom(rMix,resMix,[pA,pB]);
  const outA=mergedMix.find(r=>r.id==='mA');const outB=mergedMix.find(r=>r.id==='mB');
  ok("mixed: accepted row takes revision qty",outA&&outA.qty===9);
  ok("mixed: rejected row keeps prior qty + cross",outB&&outB.qty===3&&outB.isCrossed===true&&outB.crossedFrom==='BBB'&&outB.partNumber==='BBB-REPL');
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail?1:0);

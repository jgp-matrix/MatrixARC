// Phase B algorithm unit tests — verbatim copies of the shipped logic (src/app.jsx).
// Verifies the merge/decision core that the browser matrix would exercise end-to-end.
let WARNS=[]; const _warn=(m)=>WARNS.push(m);

// ---- verbatim: _mergeBomRows (save-merge, M2) ----
function _mergeBomRows(bom,serverBom,baselineSet){
  const incoming=bom||[];
  const incomingIds=new Set(incoming.map(r=>String(r.id)));
  const preserved=[];
  for(const s of (serverBom||[])){
    if(s.isLaborRow)continue;
    const sid=String(s.id);
    if(incomingIds.has(sid))continue;
    if(baselineSet&&baselineSet.has(sid))continue;
    preserved.push(s);
  }
  if(preserved.length&&!baselineSet)_warn(`BOM MERGE: baseline unknown — bias-to-preserve kept ${preserved.length}`);
  return preserved.length?[...incoming,...preserved]:incoming;
}
// ---- verbatim: M3 soft-apply localAdds filter + inject ----
function m3SoftApply(remoteBom, localBom, baselineSet){
  const remoteIds=new Set((remoteBom||[]).map(r=>String(r.id)));
  const localAdds=(localBom||[]).filter(r=>!r.isLaborRow&&!remoteIds.has(String(r.id))&&!(baselineSet&&baselineSet.has(String(r.id))));
  return localAdds.length?[...(remoteBom||[]),...localAdds]:(remoteBom||[]);
}
const S=arr=>new Set(arr.map(String));
const ids=arr=>arr.map(r=>r.id);
let pass=0,fail=0; const R=(name,cond,detail)=>{ if(cond){pass++;console.log(`  PASS  ${name}`);} else {fail++;console.log(`  FAIL  ${name} — ${detail||''}`);} };

// base rows shared pre-edit
const B1={id:'r-base1',partNumber:'AAA'}, B2={id:'r-base2',partNumber:'BBB'};
const LAB={id:'r-lab',isLaborRow:true,partNumber:'LABOR'};

console.log('T1  both add (unsaved) → both save: B saves after A');
{ // B incoming = base + R2 ; server (A saved first) = base + R1 ; baseline = base
  const R1={id:'r-A1',partNumber:'A1'},R2={id:'r-B2',partNumber:'B2'};
  const out=_mergeBomRows([B1,B2,R2],[B1,B2,R1],S(['r-base1','r-base2']));
  R('R1 (A concurrent-add) preserved', ids(out).includes('r-A1'));
  R('R2 (B own) present', ids(out).includes('r-B2'));
  R('append-at-end (preserved after incoming)', ids(out).indexOf('r-A1')>ids(out).indexOf('r-B2'));
}
console.log('T2  A adds R1+saves; B (stale) edits R3+saves');
{ const R1={id:'r-A1',partNumber:'A1'}; const R3old={id:'r-3',partNumber:'OLD'},R3new={id:'r-3',partNumber:'EDITED'};
  const out=_mergeBomRows([B1,R3new],[B1,R1,R3old],S(['r-base1','r-3']));
  R('R1 preserved', ids(out).includes('r-A1'));
  R('R3 incoming edit wins', out.find(r=>r.id==='r-3').partNumber==='EDITED');
  R('R3 not duplicated', out.filter(r=>r.id==='r-3').length===1);
}
console.log('T3  delete-safety D1 (SAVER deleted X)');
{ // A deletes X: incoming lacks X, X on server, X in baseline → honor delete
  const X={id:'r-X',partNumber:'X'};
  const out=_mergeBomRows([B1],[B1,X],S(['r-base1','r-X']));
  R('X stays deleted (honored, not resurrected)', !ids(out).includes('r-X'));
}
console.log('T3/T4 delete-safety D2 (OTHER user deleted X; stale client) — via M3 soft-apply');
{ // remote (X deleted) = base ; local (stale) = base + X + local-add La ; baseline = base + X
  const X={id:'r-X',partNumber:'X'},La={id:'r-La',partNumber:'La'};
  const soft=m3SoftApply([B1],[B1,X,La],S(['r-base1','r-X']));
  R('X dropped from stale client after soft-apply', !ids(soft).includes('r-X'));
  R('local unsaved add La survives soft-apply', ids(soft).includes('r-La'));
  // then B saves incoming=soft (no X) vs server=base → X stays gone
  const out=_mergeBomRows(soft,[B1],S(['r-base1']));
  R('after B saves, X still gone', !ids(out).includes('r-X'));
}
console.log('T7  M3: A has unsaved new row; B saves an edit → A soft-applies');
{ const remoteEdit=[{id:'r-base1',partNumber:'AAA-edited'},B2]; const localWithAdd=[B1,B2,{id:'r-Anew',partNumber:'Anew'}];
  const soft=m3SoftApply(remoteEdit,localWithAdd,S(['r-base1','r-base2']));
  R('A unsaved add survives remote save', ids(soft).includes('r-Anew'));
  R('remote edit applied', soft.find(r=>r.id==='r-base1').partNumber==='AAA-edited');
}
console.log('T9  metadata preservation — concurrent-add row carries ALL flags WHOLE');
{ const rich={id:'r-rich',partNumber:'RICH',priceSource:'manual',isCrossed:true,crossedFrom:'OLDPN',techReviewFlag:true,techReviewResolvedBy:'jon',leadTimeDays:14,leadTimeSource:'supplier',bcVendorNo:'V001',bomVerification:{ok:true}};
  const out=_mergeBomRows([B1],[B1,rich],S(['r-base1'])); // rich ∉ baseline → preserved
  const p=out.find(r=>r.id==='r-rich');
  R('rich row preserved', !!p);
  R('priceSource intact', p&&p.priceSource==='manual');
  R('isCrossed/crossedFrom intact', p&&p.isCrossed===true&&p.crossedFrom==='OLDPN');
  R('techReview* intact', p&&p.techReviewFlag===true&&p.techReviewResolvedBy==='jon');
  R('leadTime* intact', p&&p.leadTimeDays===14&&p.leadTimeSource==='supplier');
  R('bcVendorNo + bomVerification intact', p&&p.bcVendorNo==='V001'&&p.bomVerification&&p.bomVerification.ok===true);
  R('preserved WHOLE (same object ref, not reconstructed)', p===rich);
}
console.log('T10 labor rows — never preserved/duplicated (incoming wins)');
{ const out=_mergeBomRows([B1,LAB],[B1,LAB,{id:'r-lab2',isLaborRow:true}],S(['r-base1']));
  R('no server labor row preserved', out.filter(r=>r.isLaborRow).length===1);
}
console.log('T12/A2  null baseline (degraded) → bias-to-preserve + warn');
{ WARNS=[]; const X={id:'r-X',partNumber:'X'};
  const out=_mergeBomRows([B1],[B1,X],null);
  R('server-only row preserved under null baseline', ids(out).includes('r-X'));
  R('null-baseline warn fired', WARNS.some(w=>/baseline unknown/.test(w)));
}
console.log('A2b  full-BOM-replace with baseline PRESENT → old rows honored (dropped), no dup');
{ // "Update BOM"/re-extract replaces rows; old ids ∈ baseline, absent from incoming → honored
  const out=_mergeBomRows([{id:'r-new1',partNumber:'NEW'}],[B1,B2],S(['r-base1','r-base2']));
  R('old rows dropped (∈baseline, honored)', !ids(out).includes('r-base1')&&!ids(out).includes('r-base2'));
  R('no resurrection when baseline present', ids(out).length===1&&ids(out).includes('r-new1'));
}
console.log('EDGE  incoming-wins never removes an incoming row');
{ const out=_mergeBomRows([B1,B2],[],S([])); R('empty server → incoming unchanged', ids(out).join()==='r-base1,r-base2'); }

console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);

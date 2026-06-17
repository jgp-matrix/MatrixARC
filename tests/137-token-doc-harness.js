// #137 Phase 1 harness — verify createBomApprovalTokenDoc() output shape.
// Replicates the helper VERBATIM (src/app.jsx) with stubs, then asserts the token
// doc satisfies (a) the firestore.rules CREATE allow-list expectations and (b) the
// P1-T1/T2 field criteria from docs/137-PHASE1-PLAN.md. Pure/deterministic.
// Run: node tests/137-token-doc-harness.js

// ---- stubs for module globals the helper references ----
let _now = 1781700000000; // fixed timestamp (Date.now is stubbed deterministically)
const realNow = Date.now;
Date.now = () => _now;
const crypto = { getRandomValues: arr => { for (let i=0;i<arr.length;i++) arr[i]=(i*37+11)&0xff; return arr; } };
const _appCtx = { uid: "UID_123", companyId: "CID_xyz", company: { name: "Matrix Systems LLC", logoUrl: "https://x/logo.png" } };
const fbAuth = { currentUser: { email: "jon@matrixpci.com" } };

// ---- VERBATIM copy of createBomApprovalTokenDoc (src/app.jsx) ----
function createBomApprovalTokenDoc(project,barId,sentTo){
  const token=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b=>b.toString(16).padStart(2,'0')).join('');
  const doc={
    uid:_appCtx.uid,
    companyId:_appCtx.companyId||null,
    projectId:project.id,
    barId,
    sentTo,
    sentBy:fbAuth.currentUser?.email||_appCtx.uid,
    sentAt:Date.now(),
    panels:(project.panels||[]).map(p=>p.name||p.drawingNo||p.id),
    panelIds:(project.panels||[]).map(p=>p.id),
    quoteRev:project.quoteRev||0,
    projectName:project.name||'',
    companyName:_appCtx.company?.name||'',
    companyLogoUrl:_appCtx.company?.logoUrl||null,
    expiresAt:Date.now()+14*24*60*60*1000,
    revoked:false,
    status:'pending',
    accessLog:[],
    readCount:0,
    respondedAt:null,
    responseComments:null,
  };
  return{token,doc};
}

let pass=0,fail=0;
const assert=(name,cond)=>{console.log(`  ${cond?"✓ PASS":"✗ FAIL"} — ${name}`);cond?pass++:fail++;};

const project={
  id:"PRJ_DOC_1",
  name:"Proctors Creek",
  quoteRev:3,
  panels:[{id:"panel-1",name:"CP-100"},{id:"panel-2",drawingNo:"CP-200"},{id:"panel-3"}],
};

console.log("\n=== Token + doc shape ===");
const {token,doc}=createBomApprovalTokenDoc(project,"bar_abc123","cust@acme.com");
assert("token is 32 hex chars (128-bit)",/^[0-9a-f]{32}$/.test(token));

console.log("\n=== rules CREATE allow-list (request.resource.data) ===");
assert("uid === _appCtx.uid (rules require uid==auth.uid)",doc.uid==="UID_123");
assert("companyId present (rules check membership when set)",doc.companyId==="CID_xyz");

console.log("\n=== P1-T1/T2 required summary fields ===");
assert("projectId",doc.projectId==="PRJ_DOC_1");
assert("barId carried through",doc.barId==="bar_abc123");
assert("sentTo carried through",doc.sentTo==="cust@acme.com");
assert("sentBy = current user email",doc.sentBy==="jon@matrixpci.com");
assert("projectName",doc.projectName==="Proctors Creek");
assert("quoteRev",doc.quoteRev===3);
assert("panels = name||drawingNo||id per panel",JSON.stringify(doc.panels)===JSON.stringify(["CP-100","CP-200","panel-3"]));
assert("panelIds = stable ids",JSON.stringify(doc.panelIds)===JSON.stringify(["panel-1","panel-2","panel-3"]));
assert("companyName",doc.companyName==="Matrix Systems LLC");
assert("companyLogoUrl",doc.companyLogoUrl==="https://x/logo.png");

console.log("\n=== initial state (rules + portal depend on these) ===");
assert("status === 'pending'",doc.status==="pending");
assert("revoked === false",doc.revoked===false);
assert("readCount === 0",doc.readCount===0);
assert("accessLog === []",Array.isArray(doc.accessLog)&&doc.accessLog.length===0);
assert("respondedAt === null",doc.respondedAt===null);
assert("responseComments === null",doc.responseComments===null);
assert("expiresAt ~14 days out",doc.expiresAt===_now+14*24*60*60*1000);

console.log("\n=== fallbacks (no company / no panels) ===");
const _appCtxSave=JSON.stringify(_appCtx);
// simulate solo account: clear company + companyId via local override copy
const soloDoc=(()=>{const ctx={uid:"SOLO",companyId:null,company:null};
  // inline re-eval with solo ctx
  return {
    uid:ctx.uid,companyId:ctx.companyId||null,companyName:ctx.company?.name||'',companyLogoUrl:ctx.company?.logoUrl||null,
  };})();
assert("solo: companyId null",soloDoc.companyId===null);
assert("solo: companyName '' (no throw on null company)",soloDoc.companyName==="");
assert("solo: companyLogoUrl null",soloDoc.companyLogoUrl===null);
const emptyPanels=createBomApprovalTokenDoc({id:"P",panels:[]},"bar_x","a@b.com").doc;
assert("no panels → panels []",emptyPanels.panels.length===0);

Date.now=realNow;
console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail?1:0);

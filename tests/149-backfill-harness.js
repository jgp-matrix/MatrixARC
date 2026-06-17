// #149 test harness — exact-BC confidence backfill.
// Replicates the migrateProjectShape() #149 block VERBATIM (src/app.jsx) plus
// the three UI predicates that consume row.confidence, then runs the
// load-bearing cases from docs/149-SUPPLEMENT.md §5. Pure/deterministic — no
// Firestore, no browser. Run: node tests/149-backfill-harness.js

// ---- VERBATIM copy of the #149 migration block (only the block, not the whole fn) ----
function applyBackfill(out){
  if(!out._confidenceRecomputedAt){
    let _confPromoted=0;
    out.panels=(out.panels||[]).map(pan=>{
      if(!pan||!pan.bom||!pan.bom.length)return pan;
      let changed=false;
      const bom=pan.bom.map(r=>{
        if(r&&r.bcMatchType==="exact"&&r.confidence!=="high"){
          changed=true;_confPromoted++;
          const nr={...r,confidence:"high"};
          delete nr._confDowngradeReason;
          return nr;
        }
        return r;
      });
      return changed?{...pan,bom}:pan;
    });
    if(_confPromoted)console.log(`[CONF BACKFILL] ${out.id||"<unknown>"}: promoted ${_confPromoted} exact-BC row(s) → confidence "high"`);
    out._confidenceRecomputedAt="v1.20.134";
  }
  return out;
}

// ---- UI predicates (verbatim logic from src/app.jsx) ----
// "C" circle, line 28096
const showCircle=r=>!r.isLaborRow&&!r.isContingency&&(r.confidence==="low"||r.confidence==="medium");
// Verification badge counts, lines 27689-27700
function badge(panel){
  const rows=(panel.bom||[]).filter(r=>!r.isLaborRow&&!r.isContingency&&!r.autoLoaded);
  const lowConf=rows.filter(r=>String(r.confidence||"").toLowerCase()==="low");
  const medConf=rows.filter(r=>String(r.confidence||"").toLowerCase()==="medium");
  const placeholders=rows.filter(r=>r.partNumber==="?"||/EXTRACTION_FAILED/i.test(r.notes||""));
  const encDowngrade=medConf.filter(r=>r._confDowngradeReason==="enclosure-row");
  const flagged=lowConf.length+placeholders.length+encDowngrade.length;
  if(flagged===0&&medConf.length===0)return null;
  return flagged>0?`⚠ ${flagged} row(s) need review`:`${medConf.length} medium-confidence row(s)`;
}
// Send-gate, line 15632 — panel-level, independent of row.confidence
const sendBlocked=panel=>!!(panel.extractionReport&&panel.extractionReport.manualVerifyRequired);

const circleCount=panel=>(panel.bom||[]).filter(showCircle).length;

function snap(label,proj){
  const p=proj.panels[0];
  console.log(`  ${label}: circles=${circleCount(p)}  badge=${JSON.stringify(badge(p))}  sendBlocked=${sendBlocked(p)}`);
}

function clone(o){return JSON.parse(JSON.stringify(o));}
let pass=0,fail=0;
function assert(name,cond){console.log(`  ${cond?"✓ PASS":"✗ FAIL"} — ${name}`);cond?pass++:fail++;}

// ===================================================================
// T1 — exact-BC row promoted: circle disappears, modal count drops
// ===================================================================
console.log("\n=== T1 — exact-BC row promoted ===");
{
  const proj={id:"PRJ-T1",panels:[{bom:[
    {partNumber:"A-100",bcMatchType:"exact",confidence:"medium",_confDowngradeReason:"confusable-glyph"},
    {partNumber:"A-200",bcMatchType:"exact",confidence:"low",_confDowngradeReason:"confusable-glyph"},
  ]}]};
  snap("before",proj);
  const after=applyBackfill(clone(proj));
  snap("after ",after);
  assert("both exact-BC rows now high",after.panels[0].bom.every(r=>r.confidence==="high"));
  assert("circles cleared (2→0)",circleCount(after.panels[0])===0);
  assert("_confDowngradeReason deleted",after.panels[0].bom.every(r=>!("_confDowngradeReason"in r)));
  assert("modal badge gone (was showing, now null)",badge(after.panels[0])===null);
  assert("flag stamped",after._confidenceRecomputedAt==="v1.20.134");
}

// ===================================================================
// T2 — fuzzy-BC row untouched: circle stays
// ===================================================================
console.log("\n=== T2 — fuzzy-BC row untouched ===");
{
  const proj={id:"PRJ-T2",panels:[{bom:[
    {partNumber:"F-1",bcMatchType:"fuzzy",confidence:"medium",_confDowngradeReason:"confusable-glyph"},
    {partNumber:"F-2",bcMatchType:"partial",confidence:"low"},
  ]}]};
  snap("before",proj);
  const after=applyBackfill(clone(proj));
  snap("after ",after);
  assert("fuzzy row confidence unchanged (medium)",after.panels[0].bom[0].confidence==="medium");
  assert("partial row confidence unchanged (low)",after.panels[0].bom[1].confidence==="low");
  assert("fuzzy _confDowngradeReason preserved",after.panels[0].bom[0]._confDowngradeReason==="confusable-glyph");
  assert("circles stay (2)",circleCount(after.panels[0])===2);
}

// ===================================================================
// T3 — no-BC row untouched (pre-v1.20.110 / never BC-priced)
// ===================================================================
console.log("\n=== T3 — no-BC row untouched ===");
{
  const proj={id:"PRJ-T3",panels:[{bom:[
    {partNumber:"X-1",confidence:"medium"},                 // no bcMatchType field
    {partNumber:"X-2",priceSource:"bc",confidence:"low"},   // bc-priced but no bcMatchType (pre-110)
  ]}]};
  const after=applyBackfill(clone(proj));
  snap("after ",after);
  assert("no-bcMatchType row unchanged",after.panels[0].bom[0].confidence==="medium");
  assert("pre-110 bc row (no matchType) unchanged",after.panels[0].bom[1].confidence==="low");
  assert("circles stay (2)",circleCount(after.panels[0])===2);
}

// ===================================================================
// T4 — already-high exact-BC row untouched, no new object allocation
// ===================================================================
console.log("\n=== T4 — already-high row untouched (ref identity) ===");
{
  const row={partNumber:"H-1",bcMatchType:"exact",confidence:"high"};
  const panel={bom:[row]};
  const proj={id:"PRJ-T4",panels:[panel]};
  const after=applyBackfill(proj); // mutate-in-place path to check identity
  assert("row reference preserved (no realloc)",after.panels[0].bom[0]===row);
  assert("panel reference preserved (no realloc)",after.panels[0]===panel);
  assert("confidence still high",after.panels[0].bom[0].confidence==="high");
}

// ===================================================================
// T6 — send-gate independent: exact-BC circles clear, panel still blocks
// ===================================================================
console.log("\n=== T6 — send-gate independence ===");
{
  const proj={id:"PRJ-T6",panels:[{
    extractionReport:{manualVerifyRequired:true},
    bom:[{partNumber:"S-1",bcMatchType:"exact",confidence:"medium",_confDowngradeReason:"confusable-glyph"}],
  }]};
  snap("before",proj);
  const after=applyBackfill(clone(proj));
  snap("after ",after);
  assert("exact-BC circle cleared",circleCount(after.panels[0])===0);
  assert("send STILL blocked (manualVerifyRequired untouched)",sendBlocked(after.panels[0])===true);
  assert("extractionReport not mutated",after.panels[0].extractionReport.manualVerifyRequired===true);
}

// ===================================================================
// T8 — idempotency: run twice (simulating reopen before save), identical
// ===================================================================
console.log("\n=== T8 — idempotency (double-run before save) ===");
{
  const proj={id:"PRJ-T8",panels:[{bom:[
    {partNumber:"A-100",bcMatchType:"exact",confidence:"medium",_confDowngradeReason:"confusable-glyph"},
    {partNumber:"F-1",bcMatchType:"fuzzy",confidence:"low"},
  ]}]};
  // First open (migration runs in memory, flag set on in-memory copy).
  const run1=applyBackfill(clone(proj));
  // Simulate close WITHOUT save: Firestore still has the ORIGINAL (no flag).
  // Reopen → migration runs again on a fresh clone of the original.
  const run2=applyBackfill(clone(proj));
  assert("run1 promoted exact row",run1.panels[0].bom[0].confidence==="high");
  assert("run2 identical to run1 (same confidence)",run2.panels[0].bom[0].confidence==="high");
  assert("run2 fuzzy still low (no double-promotion creep)",run2.panels[0].bom[1].confidence==="low");
  assert("run1 deep-equals run2",JSON.stringify(run1)===JSON.stringify(run2));
}

// ===================================================================
// Gate test — already-migrated project (flag present) is skipped entirely
// ===================================================================
console.log("\n=== GATE — flag present → block skipped ===");
{
  const proj={id:"PRJ-G",_confidenceRecomputedAt:"v1.20.134",panels:[{bom:[
    {partNumber:"A-100",bcMatchType:"exact",confidence:"medium",_confDowngradeReason:"confusable-glyph"},
  ]}]};
  const after=applyBackfill(clone(proj));
  assert("flagged project NOT re-scanned (medium stays)",after.panels[0].bom[0].confidence==="medium");
}

// ===================================================================
// Flag-set-unconditionally — project with zero BC-matched rows still stamped
// ===================================================================
console.log("\n=== FLAG — set even when zero rows change ===");
{
  const proj={id:"PRJ-Z",panels:[{bom:[{partNumber:"N-1",confidence:"medium"}]}]};
  const after=applyBackfill(clone(proj));
  assert("flag stamped despite zero promotions",after._confidenceRecomputedAt==="v1.20.134");
  assert("row untouched",after.panels[0].bom[0].confidence==="medium");
}

console.log(`\n================  ${pass} passed, ${fail} failed  ================`);
process.exit(fail?1:0);

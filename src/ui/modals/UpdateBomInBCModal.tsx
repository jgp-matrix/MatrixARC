import React, { useState, useEffect } from 'react';
import { C, btn, card } from '@/core/constants';
import { _bcToken, acquireBcToken, setBcToken } from '@/core/globals';
import {
  lookupItem as bcLookupItem,
  bcCheckItemInUse,
  bcCheckItemOnProjects,
  bcReplaceAssemblyBOMLines,
} from '@/services/businessCentral/items';

function UpdateBomInBCModal({panel,onClose,onUpdate,onSaveImmediate}: any){
  const [phase,setPhase]=useState("checking"); // checking | confirm | in_use | updating | done | error | missing_items
  const [progress,setProgress]=useState("");
  const [result,setResult]=useState<any>(null);
  const [projectWarning,setProjectWarning]=useState<string[]>([]);
  const [missingItems,setMissingItems]=useState<string[]>([]);
  const itemNo=panel.bcItemNumber||"";
  const mergedBom=(panel.bom||[]).filter((r: any)=>(r.partNumber||"").trim()).slice().sort((a: any,b: any)=>{
    if(a.isLaborRow&&!b.isLaborRow)return -1;
    if(!a.isLaborRow&&b.isLaborRow)return 1;
    return (a.partNumber||"").localeCompare(b.partNumber||"");
  });
  const pendingBcCount=mergedBom.filter((r: any)=>r.priceSource!=="bc"&&r.priceSource!=="manual").length;
  const overlay: any={position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:24};
  const modalCard: any={...card({padding:28}),width:"100%",maxWidth:560,display:"flex",flexDirection:"column",gap:16};

  useEffect(()=>{
    (async()=>{
      try{
        if(!_bcToken){await acquireBcToken(false);}
        const[{inUse},{onProjects,projects}]=await Promise.all([
          bcCheckItemInUse(itemNo),
          bcCheckItemOnProjects(itemNo)
        ]);
        if(onProjects)setProjectWarning(projects);
        setPhase(inUse?"in_use":"confirm");
      }catch(e){setPhase("confirm");}
    })();
  },[]);

  async function handleUpdate(){
    setPhase("updating");
    setProgress("Connecting to Business Central...");
    try{
      let token = _bcToken;
      if(!token){token=await acquireBcToken(false)||null;setBcToken(token);}
      if(!token){token=await acquireBcToken(true)||null;setBcToken(token);}
      if(!token)throw new Error("Not connected to Business Central");

      // Pre-validate: all BOM part numbers must exist in BC
      if(mergedBom.length>0){
        setProgress("Validating BOM items exist in BC...");
        const missing: string[]=[];
        for(const row of mergedBom){
          const pn=(row.partNumber||"").trim();
          if(!pn)continue;
          const found=await bcLookupItem(pn);
          if(!found)missing.push(pn);
        }
        if(missing.length>0){
          setMissingItems(missing);
          setPhase("missing_items");
          return;
        }
      }

      const res=await bcReplaceAssemblyBOMLines(
        itemNo,mergedBom,
        (i: number,total: number,pn: string)=>setProgress(i===-1?"Clearing existing BOM lines...":`Adding BOM line ${i+1}/${total}: ${pn}...`)
      );
      const success=res.added>0&&res.errors.length===0&&!res.warning;
      setResult({...res,success});
      if(success&&onUpdate&&onSaveImmediate){
        const updated={...panel,status:"pushed_to_bc",updatedAt:Date.now()};
        onUpdate(updated);
        try{await onSaveImmediate(updated);}catch(se: any){console.warn("Status save failed:",se);}
      }
      setPhase("done");
    }catch(e: any){
      setResult({error:e.message});
      setPhase("error");
    }
  }

  return(
    <div style={overlay} onClick={(e: any)=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={modalCard}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:18,fontWeight:700}}>Update BOM in BC</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:20}}>&#10005;</button>
        </div>

        {phase==="checking"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"20px 0"}}>
            <div style={{width:36,height:36,border:"3px solid #38bdf844",borderTop:"3px solid #38bdf8",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <div style={{fontSize:13,color:C.sub}}>Checking item usage in Business Central...</div>
          </div>
        )}

        {phase==="in_use"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:"#451a0355",border:"1px solid #f9731644",borderRadius:8,padding:"14px 16px",display:"flex",alignItems:"flex-start",gap:12}}>
              <span style={{fontSize:22,flexShrink:0}}>&#9888;&#65039;</span>
              <div>
                <div style={{fontWeight:700,color:"#f97316",fontSize:14,marginBottom:6}}>Item {itemNo} is already in use on a BC Project</div>
                <div style={{fontSize:13,color:C.sub,lineHeight:1.6}}>This item has ledger entries in Business Central and cannot be edited. To update the BOM, you must create a new item with the revised components.</div>
              </div>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={onClose} style={btn("#383850",C.muted,{fontSize:13})}>Cancel</button>
            </div>
          </div>
        )}

        {phase==="confirm"&&(<>
          {pendingBcCount>0&&(
            <div style={{background:"#450a0a55",border:"1px solid #ef444466",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"flex-start",gap:10}}>
              <span style={{fontSize:18,flexShrink:0}}>&#128683;</span>
              <div>
                <div style={{fontWeight:700,color:"#f87171",fontSize:13,marginBottom:3}}>{pendingBcCount} part{pendingBcCount>1?"s":""} not yet verified in BC</div>
                <div style={{fontSize:12,color:C.sub}}>Resolve all blue BC circles before updating.</div>
              </div>
            </div>
          )}
          {projectWarning.length>0&&(
            <div style={{background:"#422006aa",border:"1px solid #f9731655",borderRadius:8,padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:10}}>
              <span style={{fontSize:18,flexShrink:0}}>&#9888;&#65039;</span>
              <div>
                <div style={{fontWeight:700,color:"#fb923c",fontSize:13,marginBottom:4}}>Item {itemNo} is assigned to {projectWarning.length} BC Project{projectWarning.length>1?"s":""}</div>
                <div style={{fontSize:12,color:C.sub,marginBottom:6,lineHeight:1.5}}>Updating the Assembly BOM will affect this item on the following project{projectWarning.length>1?"s":""}. Only proceed if you are sure the change is intentional.</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                  {projectWarning.map((p: string)=><span key={p} style={{background:"#f9731622",color:"#fb923c",borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:700,fontFamily:"monospace"}}>{p}</span>)}
                </div>
              </div>
            </div>
          )}
          <div style={{background:"#0d1f3c",border:"1px solid #38bdf844",borderRadius:8,padding:"14px 16px"}}>
            <div style={{fontSize:13,color:C.sub,marginBottom:4}}>BC Item: <span style={{fontFamily:"monospace",color:"#38bdf8",fontWeight:700}}>{itemNo}</span></div>
            <div style={{fontSize:13,color:C.sub}}>This will <strong style={{color:"#f87171"}}>delete all existing Assembly BOM lines</strong> for this item and replace them with the current ARC BOM ({mergedBom.length} component{mergedBom.length!==1?"s":""}).</div>
          </div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:4}}>
            <button onClick={onClose} style={btn("#383850",C.muted,{fontSize:13})}>Cancel</button>
            <button onClick={handleUpdate} disabled={pendingBcCount>0}
              style={btn("#0d1f3c","#38bdf8",{fontSize:13,opacity:pendingBcCount>0?0.4:1,border:"1px solid #38bdf866"})}>
              Replace BOM in BC
            </button>
          </div>
        </>)}

        {phase==="updating"&&(
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,padding:"20px 0"}}>
            <div style={{width:40,height:40,border:`3px solid ${"#38bdf8"}44`,borderTop:`3px solid ${"#38bdf8"}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <div style={{fontSize:14,color:C.sub,textAlign:"center"}}>{progress}</div>
          </div>
        )}

        {phase==="done"&&result&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {result.success?(
              <div style={{background:"#0d1f3c",border:"1px solid #38bdf844",borderRadius:8,padding:16}}>
                <div style={{fontSize:15,fontWeight:700,color:"#38bdf8",marginBottom:6}}>&#10003; BOM Updated Successfully</div>
                <div style={{fontSize:13,color:C.sub}}>Removed <strong>{result.deleted}</strong> old line{result.deleted!==1?"s":""} · Added <strong>{result.added}</strong> new line{result.added!==1?"s":""}</div>
              </div>
            ):(
              <div style={{background:C.yellowDim,border:`1px solid ${C.yellow}44`,borderRadius:8,padding:16}}>
                <div style={{fontSize:15,fontWeight:700,color:C.yellow,marginBottom:6}}>&#9888; Partial Update</div>
                <div style={{fontSize:13,color:C.sub}}>Removed {result.deleted} · Added {result.added} · {result.skipped} skipped</div>
              </div>
            )}
            {result.warning&&<div style={{fontSize:12,color:C.yellow,background:C.yellowDim,borderRadius:6,padding:"8px 12px"}}>{result.warning}</div>}
            {result.errors&&result.errors.length>0&&(
              <div style={{fontSize:12,color:C.red,background:C.redDim,borderRadius:6,padding:"8px 12px",maxHeight:120,overflowY:"auto"}}>
                <div style={{fontWeight:700,marginBottom:4}}>Errors ({result.errors.length}):</div>
                {result.errors.map((e: any,i: number)=><div key={i} style={{marginBottom:2}}>&#8226; {e}</div>)}
              </div>
            )}
            <div style={{textAlign:"right"}}><button onClick={onClose} style={btn(C.accent,"#fff",{fontSize:13})}>Close</button></div>
          </div>
        )}

        {phase==="error"&&result&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:16}}>
              <div style={{fontSize:15,fontWeight:700,color:C.red,marginBottom:6}}>&#10007; Update Failed</div>
              <div style={{fontSize:13,color:C.sub}}>{result.error}</div>
            </div>
            <div style={{textAlign:"right"}}><button onClick={onClose} style={btn(C.accent,"#fff",{fontSize:13})}>Close</button></div>
          </div>
        )}

        {phase==="missing_items"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:C.redDim,border:`1px solid ${C.red}44`,borderRadius:8,padding:16}}>
              <div style={{fontSize:15,fontWeight:700,color:C.red,marginBottom:6}}>&#9940; Missing Items in BC</div>
              <div style={{fontSize:13,color:C.sub,marginBottom:10}}>The following item{missingItems.length>1?"s":""} must be added to Business Central before you can update this BOM:</div>
              <div style={{fontFamily:"monospace",fontSize:13,display:"flex",flexDirection:"column",gap:4}}>
                {missingItems.map((pn: string)=><div key={pn} style={{color:C.red}}>&#8226; {pn}</div>)}
              </div>
            </div>
            <div style={{textAlign:"right"}}>
              <button onClick={onClose} style={btn(C.accent,"#fff",{fontSize:13})}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UpdateBomInBCModal;

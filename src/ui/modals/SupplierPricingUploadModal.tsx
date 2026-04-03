// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function SupplierPricingUploadModal({uid,onClose}){
  const [phase,setPhase]=useState('upload'); // upload|mapping|review|processing|done
  const [dragOver,setDragOver]=useState(false);
  const [rawRows,setRawRows]=useState([]);
  const [headers,setHeaders]=useState([]);
  const [colMap,setColMap]=useState({partNumber:-1,description:-1,unitCost:-1});
  const [reviewRows,setReviewRows]=useState([]);
  const [checked,setChecked]=useState({});
  const [lookupProgress,setLookupProgress]=useState(null);
  const [progress,setProgress]=useState(null);
  const [results,setResults]=useState(null);
  const [parseError,setParseError]=useState('');
  const fileRef=useRef(null);

  function parseCSV(text){
    const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/);
    const rows=[];
    for(const line of lines){
      if(!line.trim())continue;
      const row=[];let cur='';let inQ=false;
      for(let i=0;i<line.length;i++){
        const ch=line[i];
        if(inQ){if(ch==='"'&&line[i+1]==='"'){cur+='"';i++;}else if(ch==='"'){inQ=false;}else{cur+=ch;}}
        else{if(ch==='"'){inQ=true;}else if(ch===','){row.push(cur.trim());cur='';}else{cur+=ch;}}
      }
      row.push(cur.trim());
      rows.push(row);
    }
    if(rows.length<2)return{headers:[],rows:[]};
    return{headers:rows[0],rows:rows.slice(1)};
  }

  function handleFile(f){
    if(!f)return;
    setParseError('');
    if(!/\.csv$/i.test(f.name)){setParseError('Please upload a CSV file (.csv)');return;}
    const reader=new FileReader();
    reader.onload=e=>{
      const{headers:h,rows:r}=parseCSV(e.target.result);
      if(!h.length||!r.length){setParseError('Could not parse file — no data found');return;}
      setHeaders(h);setRawRows(r);
      // Auto-detect columns
      const map={partNumber:-1,description:-1,unitCost:-1};
      h.forEach((col,i)=>{
        const lc=col.toLowerCase();
        if(map.partNumber===-1&&(/part\s*#|part.*num|item.*num|catalog|sku|^pn$|^item$|^number$/i.test(col)))map.partNumber=i;
        if(map.description===-1&&(/desc|^name$/i.test(lc)))map.description=i;
        if(map.unitCost===-1&&(/cost|price|unit/i.test(lc)))map.unitCost=i;
      });
      setColMap(map);setPhase('mapping');
    };
    reader.readAsText(f);
  }

  async function runLookup(){
    if(colMap.partNumber===-1||colMap.unitCost===-1){setParseError('Part Number and Unit Cost columns are required');return;}
    setPhase('review');setLookupProgress({current:0,total:rawRows.length});
    if(!_bcToken){try{await acquireBcToken(true);}catch(e){}}
    const rows=[];const seen=new Set();
    for(let i=0;i<rawRows.length;i++){
      setLookupProgress({current:i+1,total:rawRows.length});
      const r=rawRows[i];
      const pn=(r[colMap.partNumber]||'').trim();
      const desc=colMap.description>=0?(r[colMap.description]||'').trim():'';
      const costStr=(r[colMap.unitCost]||'').replace(/[^0-9.\-]/g,'');
      const cost=parseFloat(costStr);
      if(!pn||isNaN(cost))continue;
      if(seen.has(pn.toUpperCase())){
        const existing=rows.find(x=>x.partNumber.toUpperCase()===pn.toUpperCase());
        if(existing){existing.newCost=cost;existing.description=desc||existing.description;}
        continue;
      }
      seen.add(pn.toUpperCase());
      let bcItem=null;
      if(_bcToken){
        try{
          const compId=await bcGetCompanyId();
          if(compId){
            const items=await _bcFetchItems(compId,`number eq '${pn.replace(/'/g,"''")}'`,1,0);
            if(items&&items.length)bcItem=items[0];
          }
        }catch(e){}
      }
      rows.push({partNumber:pn,description:desc,newCost:cost,bcItem,status:bcItem?'update':'new'});
    }
    setReviewRows(rows);
    const chk={};rows.forEach((_,i)=>{chk[i]=true;});setChecked(chk);
    setLookupProgress(null);
  }

  async function runBatch(){
    setPhase('processing');
    const toProcess=reviewRows.filter((_,i)=>checked[i]);
    const prog={total:toProcess.length,current:0,updated:0,created:0,skipped:0,errors:[]};
    setProgress({...prog});
    if(!_bcToken){try{await acquireBcToken(true);}catch(e){}}
    for(let i=0;i<toProcess.length;i++){
      const row=toProcess[i];
      prog.current=i+1;setProgress({...prog});
      try{
        if(row.status==='update'){
          await bcPatchItemOData(row.partNumber,{Unit_Cost:row.newCost});
          prog.updated++;
        }else{
          await bcCreateItem({number:row.partNumber,displayName:row.description||row.partNumber,unitCost:row.newCost});
          prog.created++;
        }
      }catch(e){
        prog.errors.push({partNumber:row.partNumber,message:e.message||String(e)});
      }
      setProgress({...prog});
      if(i<toProcess.length-1)await new Promise(r=>setTimeout(r,200));
    }
    setResults(prog);setPhase('done');
  }

  const overlay={position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center"};
  const modal={background:C.card,borderRadius:14,width:900,maxWidth:"96vw",maxHeight:"85vh",display:"flex",flexDirection:"column",border:`1px solid ${C.border}`,boxShadow:"0 0 40px 10px rgba(56,189,248,0.7),0 8px 40px rgba(0,0,0,0.6)"};
  const hdr={padding:"18px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"};
  const body={flex:1,overflowY:"auto",padding:"20px 24px"};

  return(
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e=>e.stopPropagation()}>
        <div style={hdr}>
          <div style={{fontSize:16,fontWeight:800,color:C.text}}>📥 Upload Supplier Pricing</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={body}>

        {phase==='upload'&&(<>
          <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6}}>Upload a CSV file with supplier pricing to batch update or create items in Business Central. Your CSV should include columns for Part Number, Description, and Unit Cost.</div>
          <div
            onDragOver={e=>{e.preventDefault();setDragOver(true);}}
            onDragLeave={()=>setDragOver(false)}
            onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleFile(f);}}
            onClick={()=>fileRef.current?.click()}
            style={{border:`2px dashed ${dragOver?C.accent:C.border}`,borderRadius:14,padding:"48px 32px",textAlign:"center",cursor:"pointer",background:dragOver?C.accentDim+"44":"transparent",transition:"all 0.2s"}}>
            <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)handleFile(f);}}/>
            <div style={{fontSize:40,marginBottom:12}}>📥</div>
            <div style={{fontSize:16,fontWeight:700,color:dragOver?C.accent:C.text,marginBottom:6}}>Drop a pricing spreadsheet here</div>
            <div style={{fontSize:13,color:C.muted}}>or click to browse — CSV files supported</div>
          </div>
          {parseError&&<div style={{marginTop:12,color:C.red,fontSize:13,fontWeight:600}}>{parseError}</div>}
        </>)}

        {phase==='mapping'&&(<>
          <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Map the columns from your CSV to the required fields. Found <strong style={{color:C.text}}>{rawRows.length}</strong> rows and <strong style={{color:C.text}}>{headers.length}</strong> columns.</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
            {[['Part Number','partNumber',true],['Description','description',false],['Unit Cost','unitCost',true]].map(([label,key,req])=>(
              <div key={key} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:12}}>
                <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>{label} {req&&<span style={{color:C.red}}>*</span>}</div>
                <select value={colMap[key]} onChange={e=>setColMap(prev=>({...prev,[key]:parseInt(e.target.value)}))}
                  style={{width:"100%",background:"#0a0a12",border:`1px solid ${C.border}`,borderRadius:6,padding:"8px 10px",color:C.text,fontSize:13,fontFamily:"inherit"}}>
                  <option value={-1}>— Select column —</option>
                  {headers.map((h,i)=><option key={i} value={i}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{fontSize:12,fontWeight:700,color:C.muted,marginBottom:8}}>Preview (first 5 rows)</div>
          <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:16}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr style={{background:"#0a0a12"}}>{headers.map((h,i)=><th key={i} style={{padding:"6px 10px",textAlign:"left",color:i===colMap.partNumber?C.accent:i===colMap.unitCost?C.green:i===colMap.description?C.yellow:C.muted,fontWeight:700,whiteSpace:"nowrap",borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
              <tbody>{rawRows.slice(0,5).map((row,ri)=><tr key={ri}>{row.map((cell,ci)=><td key={ci} style={{padding:"5px 10px",color:C.text,borderBottom:`1px solid ${C.border}22`,whiteSpace:"nowrap"}}>{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {parseError&&<div style={{marginBottom:12,color:C.red,fontSize:13,fontWeight:600}}>{parseError}</div>}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setPhase('upload');setParseError('');}} style={{padding:"10px 20px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>← Back</button>
            <button onClick={runLookup} disabled={colMap.partNumber===-1||colMap.unitCost===-1}
              style={{flex:1,padding:"10px 20px",background:C.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:(colMap.partNumber===-1||colMap.unitCost===-1)?0.5:1}}>
              Look Up Items in BC →
            </button>
          </div>
        </>)}

        {phase==='review'&&lookupProgress&&(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{width:48,height:48,margin:"0 auto 16px",border:"4px solid #e2e8f0",borderTop:`4px solid ${C.accent}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:6}}>Looking up items in Business Central…</div>
            <div style={{fontSize:13,color:C.muted}}>{lookupProgress.current} of {lookupProgress.total}</div>
          </div>
        )}

        {phase==='review'&&!lookupProgress&&(<>
          <div style={{fontSize:13,color:C.muted,marginBottom:12}}>
            <strong style={{color:C.text}}>{reviewRows.filter(r=>r.status==='update').length}</strong> items to update, <strong style={{color:C.accent}}>{reviewRows.filter(r=>r.status==='new').length}</strong> new items to create. Uncheck rows to skip them.
          </div>
          <div style={{overflowX:"auto",borderRadius:8,border:`1px solid ${C.border}`,marginBottom:16,maxHeight:400,overflowY:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead><tr style={{background:"#0a0a12",position:"sticky",top:0,zIndex:1}}>
                <th style={{padding:"8px 10px",width:36}}><input type="checkbox" checked={reviewRows.every((_,i)=>checked[i])} onChange={e=>{const v=e.target.checked;const c={};reviewRows.forEach((_,i)=>{c[i]=v;});setChecked(c);}} style={{accentColor:C.accent}}/></th>
                <th style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:700}}>Status</th>
                <th style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:700}}>Part Number</th>
                <th style={{padding:"8px 10px",textAlign:"left",color:C.muted,fontWeight:700}}>Description</th>
                <th style={{padding:"8px 10px",textAlign:"right",color:C.muted,fontWeight:700}}>Current Cost</th>
                <th style={{padding:"8px 10px",textAlign:"right",color:C.muted,fontWeight:700}}>New Cost</th>
                <th style={{padding:"8px 10px",textAlign:"right",color:C.muted,fontWeight:700}}>Δ</th>
              </tr></thead>
              <tbody>{reviewRows.map((row,i)=>{
                const cur=row.bcItem?.unitCost;
                const diff=cur!=null?(row.newCost-cur):null;
                const noChange=cur!=null&&Math.abs(diff)<0.005;
                return(
                  <tr key={i} style={{borderBottom:`1px solid ${C.border}22`,opacity:checked[i]?1:0.4}}>
                    <td style={{padding:"6px 10px",textAlign:"center"}}><input type="checkbox" checked={!!checked[i]} onChange={e=>setChecked(prev=>({...prev,[i]:e.target.checked}))} style={{accentColor:C.accent}}/></td>
                    <td style={{padding:"6px 10px"}}><span style={{fontSize:11,fontWeight:700,borderRadius:6,padding:"2px 8px",background:row.status==='update'?(noChange?"#334155":C.greenDim):C.accentDim,color:row.status==='update'?(noChange?C.muted:C.green):C.accent}}>{row.status==='update'?(noChange?"No Change":"Update"):"New"}</span></td>
                    <td style={{padding:"6px 10px",fontWeight:600,color:C.text,fontFamily:"monospace"}}>{row.partNumber}</td>
                    <td style={{padding:"6px 10px",color:C.muted,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.description||row.bcItem?.displayName||"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.muted,fontVariantNumeric:"tabular-nums"}}>{cur!=null?"$"+cur.toFixed(2):"—"}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",color:C.text,fontWeight:600,fontVariantNumeric:"tabular-nums"}}>${row.newCost.toFixed(2)}</td>
                    <td style={{padding:"6px 10px",textAlign:"right",fontWeight:600,fontVariantNumeric:"tabular-nums",color:diff==null?C.muted:diff>0?C.red:diff<0?C.green:C.muted}}>{diff!=null?(diff>0?"+":"")+"$"+diff.toFixed(2):"—"}</td>
                  </tr>);
              })}</tbody>
            </table>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setPhase('mapping');setReviewRows([]);}} style={{padding:"10px 20px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,color:C.muted,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>← Back</button>
            <button onClick={runBatch} disabled={!Object.values(checked).some(v=>v)}
              style={{flex:1,padding:"10px 20px",background:C.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",opacity:Object.values(checked).some(v=>v)?1:0.5}}>
              Apply {Object.values(checked).filter(v=>v).length} Items to BC →
            </button>
          </div>
        </>)}

        {phase==='processing'&&progress&&(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{width:48,height:48,margin:"0 auto 16px",border:"4px solid #e2e8f0",borderTop:`4px solid ${C.accent}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>Updating Business Central…</div>
            <div style={{fontSize:13,color:C.muted,marginBottom:12}}>{progress.current} of {progress.total}</div>
            <div style={{display:"flex",justifyContent:"center",gap:20,fontSize:13}}>
              <span style={{color:C.green}}>✓ {progress.updated} updated</span>
              <span style={{color:C.accent}}>+ {progress.created} created</span>
              {progress.errors.length>0&&<span style={{color:C.red}}>✗ {progress.errors.length} errors</span>}
            </div>
          </div>
        )}

        {phase==='done'&&results&&(<>
          <div style={{textAlign:"center",padding:"20px 0 24px"}}>
            <div style={{fontSize:40,marginBottom:12}}>{results.errors.length===0?"✅":"⚠️"}</div>
            <div style={{fontSize:18,fontWeight:700,color:C.text,marginBottom:16}}>Pricing Upload Complete</div>
            <div style={{display:"flex",justifyContent:"center",gap:24,fontSize:14,marginBottom:20}}>
              <div><span style={{fontWeight:800,color:C.green,fontSize:22}}>{results.updated}</span><div style={{color:C.muted,fontSize:12,marginTop:2}}>Updated</div></div>
              <div><span style={{fontWeight:800,color:C.accent,fontSize:22}}>{results.created}</span><div style={{color:C.muted,fontSize:12,marginTop:2}}>Created</div></div>
              {results.errors.length>0&&<div><span style={{fontWeight:800,color:C.red,fontSize:22}}>{results.errors.length}</span><div style={{color:C.muted,fontSize:12,marginTop:2}}>Errors</div></div>}
            </div>
          </div>
          {results.errors.length>0&&(
            <div style={{background:"#1a0a0a",border:`1px solid ${C.red}44`,borderRadius:8,padding:12,marginBottom:16,maxHeight:200,overflowY:"auto"}}>
              <div style={{fontSize:12,fontWeight:700,color:C.red,marginBottom:8}}>Errors</div>
              {results.errors.map((err,i)=>(
                <div key={i} style={{fontSize:12,color:C.muted,marginBottom:4,display:"flex",gap:8}}>
                  <span style={{color:C.text,fontWeight:600,fontFamily:"monospace",flexShrink:0}}>{err.partNumber}</span>
                  <span style={{color:C.red}}>{err.message}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={onClose} style={{width:"100%",padding:"12px",background:C.accent,border:"none",borderRadius:8,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Done</button>
        </>)}

        </div>
      </div>
    </div>
  );
}

export default SupplierPricingUploadModal;

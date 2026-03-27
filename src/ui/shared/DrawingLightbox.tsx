import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C } from '@/core/constants';

// Stub — not yet extracted
function getPageTypes(page: any): string[] {
  const types: string[] = [];
  if (page.types && page.types.length) return page.types;
  if (page.aiDetectedTypes && page.aiDetectedTypes.length) return page.aiDetectedTypes;
  if (page.type) return [page.type];
  return types;
}

function DrawingLightbox({pages,startId,onClose,onRegionsChange}: any){
  const [idx,setIdx]=useState(()=>{const i=pages.findIndex((p: any)=>p.id===startId);return i>=0?i:0;});
  const pg=pages[idx]||pages[0];
  const typeColors: any={bom:C.accent,schematic:C.green,backpanel:C.purple,enclosure:C.teal||"#0d9488",layout:C.purple,pid:C.muted,zoomed_detail:"#fde047",label:"#f97316",spec:"#38bdf8",other:"#a78bfa",ignore:"#6b7280"};
  const typeLabels: any={bom:"BOM",schematic:"Schematic",backpanel:"Back Panel",enclosure:"Enclosure",layout:"Layout",pid:"P&ID",zoomed_detail:"Zoomed Detail",label:"Label",spec:"Spec",other:"Other",ignore:"Ignore"};
  const regionTypeShort: any={bom:"BOM",schematic:"SCH",backpanel:"BP",enclosure:"ENC",pid:"P&ID",zoomed_detail:"Zoom",label:"Label",spec:"Spec",other:"Other",ignore:"Ignore"};

  // Region drawing state
  const [regionMode,setRegionMode]=useState(false);
  const [drawStart,setDrawStart]=useState<any>(null);
  const [drawCurrent,setDrawCurrent]=useState<any>(null);
  const [regions,setRegions]=useState<any[]>(pg.regions||[]);
  const [pendingRect,setPendingRect]=useState<any>(null);
  const [pendingType,setPendingType]=useState<any>(null);
  const [pendingNote,setPendingNote]=useState("");
  const [selectedRegion,setSelectedRegion]=useState<any>(null);
  const [editingRegion,setEditingRegion]=useState<any>(null);
  const [editNote,setEditNote]=useState("");
  const imgRef=useRef<any>(null);
  const noteInputRef=useRef<any>(null);
  const editNoteRef=useRef<any>(null);

  // Sync regions when page index changes (not on every pages prop update)
  const prevIdxRef=useRef(idx);
  useEffect(()=>{
    if(prevIdxRef.current!==idx){
      prevIdxRef.current=idx;
      const p=pages[idx]||pages[0];
      setRegions(p?.regions||[]);
      setPendingRect(null);setDrawStart(null);setDrawCurrent(null);setSelectedRegion(null);setEditingRegion(null);setEditNote("");
    }
  },[idx,pages]);

  // Save regions to parent
  function saveRegions(newRegions: any[]){
    setRegions(newRegions);
    if(onRegionsChange&&pg)onRegionsChange(pg.id,newRegions);
  }

  // Get normalized coords from mouse event relative to image
  function getNormCoords(e: any){
    if(!imgRef.current)return null;
    const r=imgRef.current.getBoundingClientRect();
    return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};
  }

  function onImgMouseDown(e: any){
    if(!regionMode||pendingRect)return;
    // Don't start drawing if clicking inside an edit panel or region
    if(e.target.closest&&(e.target.closest('[data-region-panel]')||e.target.closest('[data-region-box]')))return;
    e.preventDefault();e.stopPropagation();
    const c=getNormCoords(e);if(!c)return;
    setDrawStart(c);setDrawCurrent(c);setSelectedRegion(null);
  }
  function onImgMouseMove(e: any){
    if(!drawStart)return;
    e.preventDefault();
    const c=getNormCoords(e);if(c)setDrawCurrent(c);
  }
  function onImgMouseUp(e: any){
    if(!drawStart||!drawCurrent)return;
    e.preventDefault();e.stopPropagation();
    const x=Math.min(drawStart.x,drawCurrent.x),y=Math.min(drawStart.y,drawCurrent.y);
    const w=Math.abs(drawCurrent.x-drawStart.x),h=Math.abs(drawCurrent.y-drawStart.y);
    setDrawStart(null);setDrawCurrent(null);
    if(w<0.02||h<0.02)return; // too small, ignore
    setPendingRect({x,y,w,h});
  }

  function assignType(type: any){
    if(!pendingRect)return;
    setPendingType(type);setPendingNote("");
    setTimeout(()=>{if(noteInputRef.current)noteInputRef.current.focus();},50);
  }

  function finishRegion(overrideNote?: any){
    if(!pendingRect||!pendingType)return;
    const note=typeof overrideNote==="string"?overrideNote:pendingNote;
    const region={id:Date.now()+Math.random(),x:pendingRect.x,y:pendingRect.y,w:pendingRect.w,h:pendingRect.h,
      type:pendingType,label:regionTypeShort[pendingType]||pendingType,note:note.trim()||""};
    saveRegions([...regions,region]);
    setPendingRect(null);setPendingType(null);setPendingNote("");
  }

  function startEditRegion(rid: any){
    const r=regions.find((x: any)=>x.id===rid);if(!r)return;
    setEditingRegion(rid);setEditNote(r.note||"");setSelectedRegion(rid);
    setTimeout(()=>{if(editNoteRef.current)editNoteRef.current.focus();},50);
  }

  function saveEditRegion(){
    if(!editingRegion)return;
    saveRegions(regions.map((r: any)=>r.id===editingRegion?{...r,note:editNote.trim()||""}:r));
    setEditingRegion(null);setEditNote("");
  }

  function changeRegionType(rid: any,newType: any){
    saveRegions(regions.map((r: any)=>r.id===rid?{...r,type:newType,label:regionTypeShort[newType]||newType}:r));
  }

  function deleteRegion(rid: any){
    saveRegions(regions.filter((r: any)=>r.id!==rid));
    if(selectedRegion===rid)setSelectedRegion(null);
    if(editingRegion===rid){setEditingRegion(null);setEditNote("");}
  }

  useEffect(()=>{
    function onKey(e: any){
      if(e.key==="Escape"){
        if(editingRegion){setEditingRegion(null);setEditNote("");return;}
        if(pendingType){setPendingType(null);setPendingNote("");return;}
        if(pendingRect){setPendingRect(null);return;}
        if(regionMode){setRegionMode(false);return;}
        onClose();
      }
      if(e.key==="Enter"&&pendingType){finishRegion();return;}
      if(e.key==="Enter"&&editingRegion){saveEditRegion();return;}
      if(!regionMode){
        if(e.key==="ArrowRight"||e.key==="ArrowDown")setIdx((i: number)=>Math.min(i+1,pages.length-1));
        if(e.key==="ArrowLeft"||e.key==="ArrowUp")setIdx((i: number)=>Math.max(i-1,0));
      }
      if(e.key==="Delete"&&selectedRegion&&!editingRegion){deleteRegion(selectedRegion);}
    }
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[pages.length,onClose,regionMode,pendingRect,pendingType,selectedRegion,editingRegion,regions]);

  if(!pg)return null;
  const types=getPageTypes(pg);
  const hasFilmstrip=pages.length>1;

  // Build rubber-band rect style
  const rubberBand=drawStart&&drawCurrent?{
    left:(Math.min(drawStart.x,drawCurrent.x)*100)+"%",
    top:(Math.min(drawStart.y,drawCurrent.y)*100)+"%",
    width:(Math.abs(drawCurrent.x-drawStart.x)*100)+"%",
    height:(Math.abs(drawCurrent.y-drawStart.y)*100)+"%"
  }:null;

  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",flexDirection:"column",background:"rgba(0,0,0,0.97)"}}>

      {/* Top bar */}
      <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:12,padding:"12px 20px",background:"#0d0d14",borderBottom:`1px solid ${C.border}`}}>
        <div style={{flex:1,fontSize:15,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pg.name}</div>
        <div style={{display:"flex",gap:6}}>
          {types.map((t: any)=>(
            <span key={t} style={{background:typeColors[t]+"33",color:typeColors[t],border:`1px solid ${typeColors[t]}66`,borderRadius:10,padding:"3px 10px",fontSize:13,fontWeight:700}}>
              {typeLabels[t]}
            </span>
          ))}
        </div>
        {regions.length>0&&<span style={{fontSize:12,color:"#818cf8",fontWeight:600}}>{regions.length} region{regions.length>1?"s":""}</span>}
        <button onClick={()=>{setRegionMode((m: boolean)=>!m);setPendingRect(null);setDrawStart(null);setSelectedRegion(null);}}
          style={{background:regionMode?C.accent+"33":"transparent",color:regionMode?C.accent:C.muted,border:`1px solid ${regionMode?C.accent:C.border}`,borderRadius:6,padding:"6px 14px",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.15s"}}>
          {regionMode?"Exit Regions":"Regions"}
        </button>
        <div style={{fontSize:13,color:C.muted,whiteSpace:"nowrap"}}>{idx+1} / {pages.length}</div>
        <button onClick={onClose} style={{background:C.border,border:"none",color:C.text,cursor:"pointer",borderRadius:6,padding:"6px 16px",fontSize:14,fontWeight:600}}>Close</button>
      </div>

      {/* Region mode hint bar */}
      {regionMode&&!pendingRect&&!drawStart&&(
        <div style={{flexShrink:0,padding:"6px 20px",background:"rgba(99,102,241,0.08)",borderBottom:`1px solid rgba(99,102,241,0.3)`,fontSize:12,color:"#818cf8",fontWeight:600,textAlign:"center"}}>
          Draw to create a region &middot; Click a region to edit type, note, or delete &middot; Esc to exit
        </div>
      )}

      {/* Image area */}
      <div onClick={(e: any)=>{if(!regionMode)onClose();}} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",padding:"16px 64px"}}>
        <div style={{position:"relative",display:"inline-block",maxWidth:"100%",maxHeight:"100%"}}>
          <img ref={imgRef} onClick={(e: any)=>e.stopPropagation()} src={pg.dataUrl||pg.storageUrl} alt={pg.name}
            draggable={false}
            style={{maxWidth:"100%",maxHeight:"calc(100vh - 180px)",objectFit:"contain",borderRadius:6,boxShadow:"0 4px 40px rgba(0,0,0,0.8)",display:"block",userSelect:"none"}}/>

          {/* Region drawing overlay */}
          {regionMode&&(
            <div
              onMouseDown={onImgMouseDown} onMouseMove={onImgMouseMove} onMouseUp={onImgMouseUp}
              style={{position:"absolute",inset:0,cursor:pendingRect?"default":"crosshair",zIndex:2}}>

              {/* Existing regions */}
              {regions.map((r: any)=>(
                <div key={r.id} data-region-box="1" onClick={(e: any)=>{e.stopPropagation();if(e.target.closest&&e.target.closest('[data-region-panel]'))return;setSelectedRegion(selectedRegion===r.id?null:r.id);if(editingRegion&&editingRegion!==r.id)saveEditRegion();}}
                  onDoubleClick={(e: any)=>{e.stopPropagation();startEditRegion(r.id);}}
                  style={{position:"absolute",left:(r.x*100)+"%",top:(r.y*100)+"%",width:(r.w*100)+"%",height:(r.h*100)+"%",
                    border:`2px solid ${typeColors[r.type]||C.accent}`,background:(typeColors[r.type]||C.accent)+"22",
                    borderRadius:3,cursor:"pointer",boxSizing:"border-box",transition:"box-shadow 0.1s",
                    boxShadow:selectedRegion===r.id?`0 0 0 2px ${typeColors[r.type]||C.accent}`:"none"}}>
                  <span style={{position:"absolute",top:-1,left:-1,background:typeColors[r.type]||C.accent,color:"#fff",fontSize:10,fontWeight:700,
                    padding:"1px 6px",borderRadius:"3px 0 3px 0",lineHeight:"16px",whiteSpace:"nowrap"}}>
                    {r.label||regionTypeShort[r.type]||r.type}
                  </span>
                  {r.note&&(
                    <div style={{position:"absolute",bottom:2,left:2,right:2,background:"rgba(0,0,0,0.75)",color:"#e2e8f0",fontSize:10,
                      padding:"2px 5px",borderRadius:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",pointerEvents:"none"}}>
                      {r.note}
                    </div>
                  )}
                  {/* Edit panel for selected region — rendered as portal to avoid overflow clipping */}
                  {selectedRegion===r.id&&(()=>{
                    const imgRect=imgRef.current?.getBoundingClientRect();
                    if(!imgRect)return null;
                    const regionLeftPx=imgRect.left+r.x*imgRect.width;
                    const regionBottomPx=imgRect.top+(r.y+r.h)*imgRect.height;
                    const regionTopPx=imgRect.top+r.y*imgRect.height;
                    const spaceBelow=window.innerHeight-regionBottomPx;
                    const spaceAbove=regionTopPx;
                    const showAbove=spaceBelow<240&&spaceAbove>240;
                    const panelTop=showAbove?undefined:Math.min(regionBottomPx+6,window.innerHeight-260);
                    const panelBottom=showAbove?(window.innerHeight-regionTopPx+6):undefined;
                    const panelLeft=Math.max(8,Math.min(regionLeftPx,window.innerWidth-330));
                    return ReactDOM.createPortal(
                    <div data-region-panel="1" onMouseDown={(e: any)=>e.stopPropagation()} onClick={(e: any)=>e.stopPropagation()} style={{position:"fixed",left:panelLeft,
                      ...(showAbove?{bottom:panelBottom}:{top:panelTop}),
                      zIndex:10001,background:"#1a1a2e",border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",
                      boxShadow:"0 8px 32px rgba(0,0,0,0.6)",minWidth:240,maxWidth:320}}>
                      {/* Type row */}
                      <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Type</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}>
                        {["bom","schematic","backpanel","enclosure","pid","zoomed_detail","label","spec","other","ignore"].map((t: any)=>(
                          <button key={t} onClick={()=>changeRegionType(r.id,t)}
                            style={{background:r.type===t?(typeColors[t]||C.accent)+"44":(typeColors[t]||C.accent)+"15",
                              color:typeColors[t]||C.accent,border:`1px solid ${r.type===t?(typeColors[t]||C.accent):(typeColors[t]||C.accent)+"44"}`,
                              borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",transition:"all 0.1s"}}>
                            {regionTypeShort[t]}
                          </button>
                        ))}
                      </div>
                      {/* Note row */}
                      <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Description</div>
                      <div style={{display:"flex",gap:4,marginBottom:8}}>
                        <input ref={editingRegion===r.id?editNoteRef:undefined} value={editingRegion===r.id?editNote:(r.note||"")}
                          onFocus={()=>{if(editingRegion!==r.id)startEditRegion(r.id);}}
                          onChange={(e: any)=>{if(editingRegion===r.id)setEditNote(e.target.value);}}
                          placeholder='e.g. "9 operators on DIN rail"'
                          onKeyDown={(e: any)=>{if(e.key==="Enter"){e.preventDefault();saveEditRegion();}if(e.key==="Escape"){e.stopPropagation();setEditingRegion(null);}}}
                          style={{flex:1,background:"#0d0d14",border:`1px solid ${C.border}`,color:C.text,borderRadius:4,padding:"5px 8px",fontSize:12,outline:"none"}}/>
                        {editingRegion===r.id&&(
                          <button onClick={saveEditRegion}
                            style={{background:C.accent,color:"#fff",border:"none",borderRadius:4,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                            Save
                          </button>
                        )}
                      </div>
                      {/* Delete */}
                      <button onClick={(e: any)=>{e.stopPropagation();deleteRegion(r.id);}}
                        style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.3)",borderRadius:6,
                          padding:"4px 12px",fontSize:11,fontWeight:700,cursor:"pointer",width:"100%"}}>
                        Delete Region
                      </button>
                    </div>,document.body);
                    })()}
                </div>
              ))}

              {/* Rubber-band preview */}
              {rubberBand&&(
                <div style={{position:"absolute",...rubberBand,border:`2px dashed ${C.accent}`,background:C.accent+"18",borderRadius:3,pointerEvents:"none"}}/>
              )}
            </div>
          )}

          {/* Show regions as faint overlays even when not in region mode */}
          {!regionMode&&regions.length>0&&(
            <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:1}}>
              {regions.map((r: any)=>(
                <div key={r.id} title={r.note||""} style={{position:"absolute",left:(r.x*100)+"%",top:(r.y*100)+"%",width:(r.w*100)+"%",height:(r.h*100)+"%",
                  border:`1px solid ${(typeColors[r.type]||C.accent)}55`,background:(typeColors[r.type]||C.accent)+"0a",borderRadius:3}}>
                  <span style={{position:"absolute",top:-1,left:-1,background:(typeColors[r.type]||C.accent)+"88",color:"#fff",fontSize:9,fontWeight:700,
                    padding:"0px 5px",borderRadius:"3px 0 3px 0",lineHeight:"14px",whiteSpace:"nowrap",opacity:0.7}}>
                    {r.label||regionTypeShort[r.type]||r.type}{r.note?" — "+r.note:""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Type picker popup — two-step: pick type, then optional note — portal to avoid overflow */}
          {pendingRect&&(()=>{
            const imgRect=imgRef.current?.getBoundingClientRect();
            if(!imgRect)return null;
            const centerPx=imgRect.left+(pendingRect.x+pendingRect.w/2)*imgRect.width;
            const bottomPx=imgRect.top+(pendingRect.y+pendingRect.h)*imgRect.height;
            const topPx=imgRect.top+pendingRect.y*imgRect.height;
            const spaceBelow=window.innerHeight-bottomPx;
            const showAbove=spaceBelow<280&&topPx>280;
            const pLeft=Math.max(8,Math.min(centerPx-120,window.innerWidth-260));
            const pTop=showAbove?undefined:Math.min(bottomPx+8,window.innerHeight-280);
            const pBottom=showAbove?(window.innerHeight-topPx+8):undefined;
            return ReactDOM.createPortal(
            <div onClick={(e: any)=>e.stopPropagation()} onMouseDown={(e: any)=>e.stopPropagation()}
              style={{position:"fixed",left:pLeft,...(showAbove?{bottom:pBottom}:{top:pTop}),
                zIndex:10001,background:"#1a1a2e",border:`1px solid ${C.border}`,borderRadius:8,
                padding:"10px 12px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)",minWidth:200}}>
              {!pendingType?(
                <>
                  <div style={{fontSize:11,color:C.muted,fontWeight:700,marginBottom:6,textTransform:"uppercase",letterSpacing:0.5}}>Region Type</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {["bom","schematic","backpanel","enclosure","pid","zoomed_detail","label","spec","other","ignore"].map((t: any)=>(
                      <button key={t} onClick={()=>assignType(t)}
                        style={{background:typeColors[t]+"22",color:typeColors[t],border:`1px solid ${typeColors[t]}66`,borderRadius:8,
                          padding:"4px 10px",fontSize:12,fontWeight:700,cursor:"pointer",transition:"all 0.1s",whiteSpace:"nowrap"}}>
                        {regionTypeShort[t]}
                      </button>
                    ))}
                  </div>
                  <button onClick={()=>{setPendingRect(null);setPendingType(null);}}
                    style={{marginTop:8,background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,
                      padding:"3px 10px",fontSize:11,cursor:"pointer",width:"100%"}}>
                    Cancel
                  </button>
                </>
              ):(
                <>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                    <span style={{background:typeColors[pendingType]+"33",color:typeColors[pendingType],border:`1px solid ${typeColors[pendingType]}66`,
                      borderRadius:8,padding:"3px 8px",fontSize:11,fontWeight:700}}>{regionTypeShort[pendingType]}</span>
                    <button onClick={()=>{setPendingType(null);setPendingNote("");}} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:11}}>change</button>
                  </div>
                  <div style={{fontSize:11,color:pendingType==="other"?"#a78bfa":C.muted,fontWeight:600,marginBottom:4}}>
                    {pendingType==="other"?"Describe what you see (required)":"Describe what you see (optional)"}
                  </div>
                  <input ref={noteInputRef} value={pendingNote} onChange={(e: any)=>setPendingNote(e.target.value)}
                    placeholder={pendingType==="other"?'e.g. "voltage schedule 480V/3ph", "wire termination table", "grounding diagram"':'e.g. "9 operators on DIN rail" or "AC unit detail"'}
                    onKeyDown={(e: any)=>{if(e.key==="Enter"){e.preventDefault();if(pendingType==="other"&&!pendingNote.trim())return;finishRegion();}if(e.key==="Escape"){e.stopPropagation();setPendingType(null);setPendingNote("");}}}
                    style={{width:"100%",background:"#0d0d14",border:`1px solid ${pendingType==="other"&&!pendingNote.trim()?"#a78bfa66":C.border}`,color:C.text,borderRadius:5,padding:"6px 10px",fontSize:12,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>{if(pendingType==="other"&&!pendingNote.trim())return;finishRegion();}}
                      style={{flex:1,background:pendingType==="other"&&!pendingNote.trim()?"#333":C.accent,color:"#fff",border:"none",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:pendingType==="other"&&!pendingNote.trim()?"default":"pointer"}}>
                      Save Region
                    </button>
                    {pendingType!=="other"&&(
                      <button onClick={()=>finishRegion("")}
                        style={{background:"transparent",color:C.muted,border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 10px",fontSize:11,cursor:"pointer",whiteSpace:"nowrap"}}>
                        Skip
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>,document.body);
          })()}
        </div>

        {idx>0&&!regionMode&&(
          <button onClick={(e: any)=>{e.stopPropagation();setIdx((i: number)=>i-1);}}
            style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.1)",border:`1px solid ${C.border}`,color:C.text,cursor:"pointer",borderRadius:8,padding:"10px 14px",fontSize:26,lineHeight:1}}>
            &#8249;
          </button>
        )}
        {idx<pages.length-1&&!regionMode&&(
          <button onClick={(e: any)=>{e.stopPropagation();setIdx((i: number)=>i+1);}}
            style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,0.1)",border:`1px solid ${C.border}`,color:C.text,cursor:"pointer",borderRadius:8,padding:"10px 14px",fontSize:26,lineHeight:1}}>
            &#8250;
          </button>
        )}
      </div>

      {/* Filmstrip */}
      {hasFilmstrip&&(
        <div style={{flexShrink:0,display:"flex",gap:8,padding:"10px 16px",overflowX:"auto",background:"#0d0d14",borderTop:`1px solid ${C.border}`}}>
          {pages.map((p: any,i: number)=>(
            <img key={p.id} src={p.dataUrl||p.storageUrl} alt={p.name} onClick={()=>setIdx(i)}
              style={{height:64,width:104,objectFit:"contain",borderRadius:4,cursor:"pointer",border:`2px solid ${i===idx?C.accent:C.border}`,background:"#080810",flexShrink:0,opacity:i===idx?1:0.55,transition:"all 0.15s"}}/>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

export default DrawingLightbox;

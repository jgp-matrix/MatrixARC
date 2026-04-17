// @ts-nocheck
// Extracted verbatim from monolith public/index.html
// TODO: Add proper TypeScript types and replace global references with imports

import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { C, btn, inp, card } from '@/core/constants';
import { _appCtx, _apiKey, _bcToken, _bcConfig, _pricingConfig, _defaultBomItems, fbAuth, fbDb, fbFunctions, fbStorage, isAdmin, isReadOnly, saveProject, loadCompanyMembers, acquireBcToken, bcPatchJobOData, bcEnqueue, saveDefaultBomItems, APP_VERSION } from '@/core/globals';

function LeftNav({tab,onTabChange,pinned,onPinChange}){
  const [hovered,setHovered]=useState(false);
  const isOpen=pinned||hovered;
  return(<>
    {/* Flex spacer — pushes main content right when pinned */}
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
        >{pinned?"📌":"📍"}</button>
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

export default LeftNav;

import { useState } from 'react';
import { C } from '@/core/constants';
import { _tooltipsEnabled, setTooltipsEnabled } from '@/core/globals';

function TooltipToggle(){
  const [on,setOn]=useState(_tooltipsEnabled);
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0"}}>
      <div>
        <div style={{fontSize:13,fontWeight:600,color:C.text}}>Button Tooltips</div>
        <div style={{fontSize:11,color:C.muted,marginTop:2}}>Show helpful hints when hovering over buttons</div>
      </div>
      <button onClick={()=>{const next=!on;setOn(next);setTooltipsEnabled(next);}}
        style={{flexShrink:0,width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",background:on?C.accent:C.border,position:"relative",transition:"background 0.2s"}}>
        <div style={{position:"absolute",top:3,left:on?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.4)"}}/>
      </button>
    </div>
  );
}

export default TooltipToggle;

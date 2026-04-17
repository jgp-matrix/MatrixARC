import { useState } from 'react';
import { C } from '@/core/constants';

function ContingencyInput({value,readOnly,color,onSave}: any){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState('');
  const displayed=editing?draft:(+value).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0});
  return(
    <input type="text" readOnly={readOnly} value={displayed} className="no-spin"
      onChange={(e: any)=>setDraft(e.target.value)}
      onFocus={(e: any)=>{setEditing(true);setDraft(String(Math.round(+value||0)));e.target.style.borderColor=C.accent;setTimeout(()=>e.target.select(),0);}}
      onBlur={(e: any)=>{const parsed=Math.max(0,Math.round(parseFloat(draft.replace(/[^0-9.]/g,''))||0));onSave(parsed);setEditing(false);e.target.style.borderColor="transparent";}}
      style={{width:80,textAlign:"right",background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"3px 5px",fontSize:13,fontFamily:"inherit",color:color||"#fff",fontVariantNumeric:"tabular-nums",outline:"none"}}/>
  );
}

export default ContingencyInput;

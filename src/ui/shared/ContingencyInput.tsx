import { useState } from 'react';
import { C } from '@/core/constants';

function ContingencyInput({value,readOnly,color,onSave}: any){
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState('');
  const displayed=editing?draft:(+value).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  return(
    <input type="text" readOnly={readOnly} value={displayed} className="no-spin"
      onChange={(e: any)=>setDraft(e.target.value)}
      onFocus={(e: any)=>{setEditing(true);setDraft(String(+value||0));e.target.style.borderColor=C.accent;e.target.select();}}
      onBlur={(e: any)=>{const parsed=Math.max(0,parseFloat(draft.replace(/[^0-9.]/g,''))||0);onSave(parsed);setEditing(false);e.target.style.borderColor="transparent";}}
      style={{width:80,textAlign:"right",background:"transparent",border:"1px solid transparent",borderRadius:4,padding:"3px 5px",fontSize:13,fontFamily:"inherit",color:color||"#fff",fontVariantNumeric:"tabular-nums",outline:"none"}}/>
  );
}

export default ContingencyInput;

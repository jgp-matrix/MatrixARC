import React from 'react';
import { C } from '@/core/constants';
import { useVendorSyncState, _vSync, _vSyncNotify } from './useVendorSyncState';

export default function VendorSyncFloater({onSwitchToItems}: any){
  const sync=useVendorSyncState();
  if(!sync.running&&!sync.result)return null;
  const st=sync.status||{};
  const done=st.phase==="Complete";
  return(<div style={{
    position:"fixed",bottom:20,right:20,zIndex:2000,
    background:done?C.greenDim:C.card,
    border:`1px solid ${done?C.green:C.teal}`,
    borderRadius:12,padding:"10px 16px",
    boxShadow:"0 4px 20px rgba(0,0,0,0.12)",
    display:"flex",flexDirection:"column",gap:4,minWidth:280,maxWidth:360,
    fontSize:12,color:C.text
  }}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
      <span style={{fontWeight:700,color:done?C.green:C.teal}}>
        {done?"\u2713 Vendor Sync Complete":"\uD83D\uDD04 Vendor Sync Running\u2026"}
      </span>
      <div style={{display:"flex",gap:6}}>
        {!done&&<button onClick={()=>{_vSync.abort=true;}}
          style={{background:C.redDim,color:C.red,border:"none",borderRadius:4,
            padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>Stop</button>}
        <button onClick={()=>{onSwitchToItems();}}
          style={{background:C.accentDim,color:C.accent,border:"none",borderRadius:4,
            padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>View</button>
        {done&&<button onClick={()=>{_vSync.result=null;_vSync.status=null;_vSyncNotify();}}
          style={{background:"transparent",color:C.muted,border:"none",cursor:"pointer",
            fontSize:13,lineHeight:1,padding:"0 2px"}}>{"\u2715"}</button>}
      </div>
    </div>
    {st.total>0&&<div style={{color:C.muted,fontSize:11}}>
      {st.searched||0}/{st.total} items
      {" \u00B7 "}DK {st.dkWritten||0} written
      {" \u00B7 "}Mouser {st.mouserWritten||0} written
      {st.errors>0&&<span style={{color:C.yellow}}> {"\u00B7"} {st.errors} err</span>}
    </div>}
    {sync.error&&<div style={{color:C.red,fontSize:11}}>{sync.error}</div>}
  </div>);
}

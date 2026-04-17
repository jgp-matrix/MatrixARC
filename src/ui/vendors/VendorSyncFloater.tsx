import React from 'react';
import { useVendorSyncState, _vSync, _vSyncNotify } from './useVendorSyncState';

export default function VendorSyncFloater({onSwitchToItems}: any){
  const sync=useVendorSyncState();
  if(!sync.running&&!sync.result)return null;
  const st=sync.status||{};
  const done=st.phase==="Complete";
  return(<div style={{
    position:"fixed",bottom:20,right:20,zIndex:2000,
    background:done?"#064e3b":"#0f172a",
    border:`1px solid ${done?"#10b981":"#0d9488"}`,
    borderRadius:12,padding:"10px 16px",
    boxShadow:"0 4px 20px rgba(0,0,0,0.5)",
    display:"flex",flexDirection:"column",gap:4,minWidth:280,maxWidth:360,
    fontSize:12,color:"#e2e8f0"
  }}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
      <span style={{fontWeight:700,color:done?"#34d399":"#2dd4bf"}}>
        {done?"\u2713 Vendor Sync Complete":"\uD83D\uDD04 Vendor Sync Running\u2026"}
      </span>
      <div style={{display:"flex",gap:6}}>
        {!done&&<button onClick={()=>{_vSync.abort=true;}}
          style={{background:"#7f1d1d",color:"#fca5a5",border:"none",borderRadius:4,
            padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>Stop</button>}
        <button onClick={()=>{onSwitchToItems();}}
          style={{background:"#1e3a5f",color:"#93c5fd",border:"none",borderRadius:4,
            padding:"2px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>View</button>
        {done&&<button onClick={()=>{_vSync.result=null;_vSync.status=null;_vSyncNotify();}}
          style={{background:"transparent",color:"#94a3b8",border:"none",cursor:"pointer",
            fontSize:13,lineHeight:1,padding:"0 2px"}}>{"\u2715"}</button>}
      </div>
    </div>
    {st.total>0&&<div style={{color:"#94a3b8",fontSize:11}}>
      {st.searched||0}/{st.total} items
      {" \u00B7 "}DK {st.dkWritten||0} written
      {" \u00B7 "}Mouser {st.mouserWritten||0} written
      {st.errors>0&&<span style={{color:"#f59e0b"}}> {"\u00B7"} {st.errors} err</span>}
    </div>}
    {sync.error&&<div style={{color:"#f87171",fontSize:11}}>{sync.error}</div>}
  </div>);
}

import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { fbDb } from '@/core/globals';

function ReportsModal({uid,onClose}: any){
  const [records,setRecords]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [activeReport,setActiveReport]=useState("crossref");
  useEffect(()=>{
    if(!uid)return;
    fbDb.doc(`users/${uid}/config/supplierCrossRef`).get()
      .then((d: any)=>{setRecords(d.exists?(d.data().records||[]):[]);setLoading(false);})
      .catch(()=>{setRecords([]);setLoading(false);});
  },[uid]);
  const byVendor: any={};
  (records||[]).forEach((r: any)=>{if(!byVendor[r.vendorName])byVendor[r.vendorName]=[];byVendor[r.vendorName].push(r);});
  const vendorNames=Object.keys(byVendor).sort();
  return ReactDOM.createPortal(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0d0d1a",border:"1px solid #2a2a3e",borderRadius:12,width:"100%",maxWidth:960,maxHeight:"90vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 40px rgba(0,0,0,0.7)"}}>
        <div style={{padding:"18px 24px",borderBottom:"1px solid #2a2a3e",display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:16,fontWeight:800,color:"#f1f5f9",flex:1}}>{"\u{1F4CA} Reports"}</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:20,lineHeight:1,padding:"2px 6px"}}>{"\u2715"}</button>
        </div>
        <div style={{display:"flex",borderBottom:"1px solid #1e293b"}}>
          <button onClick={()=>setActiveReport("crossref")} style={{padding:"10px 20px",background:"none",border:"none",borderBottom:activeReport==="crossref"?"2px solid #3b82f6":"2px solid transparent",color:activeReport==="crossref"?"#60a5fa":"#64748b",cursor:"pointer",fontSize:13,fontWeight:activeReport==="crossref"?700:500}}>Supplier Part Cross-Reference</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
          {activeReport==="crossref"&&(<>
            <div style={{fontSize:12,color:"#64748b",marginBottom:16,lineHeight:1.6}}>
              This report tracks the relationship between supplier part numbers (as quoted) and Matrix BC part numbers.<br/>
              It is automatically populated when RFQs are sent for items where a part number crossing exists.<br/>
              <span style={{color:"#475569",fontSize:11}}>Note: In a future release, this data will be stored in Business Central.</span>
            </div>
            {loading?(
              <div style={{textAlign:"center",padding:40,color:"#64748b"}}>Loading…</div>
            ):vendorNames.length===0?(
              <div style={{textAlign:"center",padding:40,color:"#64748b",fontSize:13}}>
                No cross-reference data yet.<br/>
                <span style={{fontSize:12,color:"#475569"}}>This report auto-populates when RFQs are sent for items with crossed (BC) part numbers.</span>
              </div>
            ):vendorNames.map((vendor: any)=>(
              <div key={vendor} style={{marginBottom:28}}>
                <div style={{fontSize:14,fontWeight:700,color:"#60a5fa",marginBottom:8,paddingBottom:6,borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:8}}>
                  <span>{"\u{1F3ED}"}</span><span>{vendor}</span>
                  <span style={{fontSize:11,color:"#475569",fontWeight:400}}>({byVendor[vendor].length} item{byVendor[vendor].length!==1?"s":""})</span>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                  <thead>
                    <tr style={{background:"#0a0a18"}}>
                      {[["Supplier Part #","20%"],["Matrix BC Part #","20%"],["Description","30%"],["RFQ #","15%"],["Date","15%"]].map(([h,w]: any)=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:"left",color:"#64748b",fontWeight:700,fontSize:11,textTransform:"uppercase",letterSpacing:0.5,width:w}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byVendor[vendor].sort((a: any,b: any)=>(b.rfqDate||0)-(a.rfqDate||0)).map((r: any,i: number)=>(
                      <tr key={i} style={{borderBottom:"1px solid #0f1520",background:i%2===0?"transparent":"#0a0a14"}}>
                        <td style={{padding:"7px 10px",fontWeight:700,color:"#f1f5f9",fontFamily:"monospace",fontSize:11}}>{r.origPartNumber||"\u2014"}</td>
                        <td style={{padding:"7px 10px",color:"#60a5fa",fontFamily:"monospace",fontSize:11}}>{r.bcPartNumber||"\u2014"}</td>
                        <td style={{padding:"7px 10px",color:"#94a3b8"}}>{r.description||"\u2014"}</td>
                        <td style={{padding:"7px 10px",color:"#64748b",fontFamily:"monospace",fontSize:11}}>{r.rfqNum||"\u2014"}</td>
                        <td style={{padding:"7px 10px",color:"#64748b",whiteSpace:"nowrap"}}>{r.rfqDate?new Date(r.rfqDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"\u2014"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </>)}
        </div>
        <div style={{padding:"12px 24px",borderTop:"1px solid #2a2a3e",display:"flex",justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{background:"#1a1a2a",border:"1px solid #2a2a3e",color:"#94a3b8",padding:"7px 20px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:"inherit"}}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ReportsModal;

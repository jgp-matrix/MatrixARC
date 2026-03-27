import { _appCtx } from '@/core/globals';

export default function RfqDocument({groups,projectName}: any){
  const rfqNum="RFQ-"+Date.now().toString(36).toUpperCase().slice(-6);
  const today=new Date();
  const rfqDate=today.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  const responseBy=new Date(today.getTime()+14*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
  return(
    <div id="rfq-doc" style={{fontFamily:"'Inter',-apple-system,sans-serif",color:"#1e293b",lineHeight:1.5}}>
      {groups.map((group: any,gi: any)=>(
        <div key={gi} className="qd-page" style={{pageBreakAfter:gi<groups.length-1?"always":"auto"}}>
          <div className="qd-header">
            <div style={{fontSize:22,fontWeight:900,color:"#1e293b",marginBottom:8}}>Request For Quote from</div>
            <div className="qd-brand">
              <div>
                <h1 style={{fontSize:29,fontWeight:800,color:"#2563eb",letterSpacing:-0.3,margin:0}}>
                  {_appCtx.company?.logoUrl
                    ?<img src={_appCtx.company.logoUrl} alt="Company Logo" style={{maxHeight:52,maxWidth:180,objectFit:"contain"}}/>
                    :(_appCtx.company?.name||"Matrix Systems, Inc.")
                  }
                </h1>
                {(_appCtx.company?.address||_appCtx.company?.phone)&&
                  <div className="qd-addr">{[_appCtx.company.address,_appCtx.company.phone].filter(Boolean).join(' · ')}</div>}
              </div>
            </div>
            <div className="qd-hdr-right">
              <div className="qd-qlabel">Request for Quote</div>
              <div className="qd-qnum">{rfqNum}</div>
            </div>
          </div>
          <div className="qd-info-grid">
            <div>
              <div className="qd-info-label">To: Supplier</div>
              <div className="qd-info-name">{group.vendorName}</div>
            </div>
            <div>
              <div className="qd-info-label">From</div>
              <div className="qd-info-name">{_appCtx.company?.name||"Matrix Systems, Inc."}</div>
              <div className="qd-info-detail">purchasing@matrixpci.com</div>
            </div>
          </div>
          <div className="qd-proj">
            <div><div className="qd-proj-label">Project</div><div className="qd-proj-value">{projectName||"—"}</div></div>
            <div><div className="qd-proj-label">RFQ Date</div><div className="qd-proj-value">{rfqDate}</div></div>
            <div><div className="qd-proj-label">Response By</div><div className="qd-proj-value">{responseBy}</div></div>
          </div>
          <div style={{padding:"20px 44px"}}>
            <table className="rfq-table">
              <thead>
                <tr>
                  <th style={{width:30}}>#</th>
                  <th>Part Number</th>
                  <th>Description</th>
                  <th>Manufacturer</th>
                  <th style={{textAlign:"center",width:50}}>Qty</th>
                  <th style={{textAlign:"right",width:90}}>Unit Price</th>
                  <th style={{textAlign:"center",width:90}}>Lead Time</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item: any,ii: any)=>(
                  <tr key={ii}>
                    <td>{ii+1}</td>
                    <td style={{fontWeight:600}}>
                      {(()=>{const orig=item.crossedFrom||item.partNumber||"—";const ref=item.crossedFrom?item.partNumber:null;return(<><div>{orig}</div>{ref&&<div style={{fontSize:10,color:"#94a3b8",fontWeight:400,marginTop:2}}>Matrix Part #: {ref}</div>}</>);})()}
                    </td>
                    <td>{item.description||"—"}</td>
                    <td>{item.manufacturer||"—"}</td>
                    <td style={{textAlign:"center"}}>{item.qty||1}</td>
                    <td style={{borderBottom:"1px dotted #94a3b8",textAlign:"right"}}></td>
                    <td style={{borderBottom:"1px dotted #94a3b8",textAlign:"center"}}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{padding:"16px 44px",borderTop:"1px solid #e2e8f0",marginTop:16,fontSize:13,color:"#475569",lineHeight:1.7}}>
            Please return completed RFQ to <strong>purchasing@matrixpci.com</strong>
          </div>
          <div className="qd-print-footer">
            <div>{rfqNum} · {projectName}</div>
            <div>{_appCtx.company?.name||"Matrix Systems, Inc."} · Confidential</div>
          </div>
        </div>
      ))}
    </div>
  );
}

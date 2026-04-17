import { C } from '@/core/constants';

function Badge({status,project}: any){
  let effectiveStatus=status;
  if(project){
    const isBudgetary=(project.panels||[]).some((pan: any)=>(pan.pricing||{}).isBudgetary);
    const quoteSent=!!project.quoteSentAt;
    const allPanels=project.panels||[];
    const hasBom=allPanels.some((pan: any)=>(pan.bom||[]).length>0);
    const hasUnpriced=hasBom&&allPanels.some((pan: any)=>(pan.bom||[]).filter((r: any)=>!r.isLaborRow&&!r.customerSupplied).some((r: any)=>!r.unitPrice||r.unitPrice===0||!r.priceDate));
    if(quoteSent)effectiveStatus=isBudgetary?"budgetary_sent":"firm_sent";
    else if(hasUnpriced&&hasBom)effectiveStatus="rfqs";
    else if(hasBom&&!hasUnpriced)effectiveStatus="extracted";
  }
  const map: any={
    draft:["#3d1a00","#f97316","Draft"],
    in_progress:[C.yellowDim,C.yellow,"In Process"],
    rfqs:[C.redDim,C.red,"RFQ's"],
    extracted:[C.greenDim,C.green,"Ready"],
    validated:[C.greenDim,C.green,"Ready"],
    costed:[C.greenDim,C.green,"Ready"],
    quoted:[C.greenDim,C.green,"Ready"],
    budgetary_sent:["#0c2233","#38bdf8","Budgetary"+(project?.quoteSentRev?" Rev "+String(project.quoteSentRev).padStart(2,"0"):"")],
    firm_sent:["#0c2233","#38bdf8","Firm"+(project?.quoteSentRev?" Rev "+String(project.quoteSentRev).padStart(2,"0"):"")],
    pushed_to_bc:["#0d1f3c","#38bdf8","Pushed to BC"],
    imported:["#1a1040","#a78bfa","Imported"]
  };
  const [bg,col,label]=map[effectiveStatus]||map[status]||map.draft;
  return<span style={{background:bg,color:col,borderRadius:20,padding:"3px 12px",fontSize:13,fontWeight:700,letterSpacing:0.5,whiteSpace:"nowrap"}}>{label.toUpperCase()}</span>;
}

export default Badge;

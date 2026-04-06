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
  const map: Record<string,{bg:string;col:string;border:string;label:string}>={
    draft:       {bg:C.bg,        col:C.muted,   border:C.border,             label:'Draft'},
    in_progress: {bg:C.yellowDim, col:C.yellow,  border:C.yellow+'44',        label:'In Process'},
    rfqs:        {bg:C.redDim,    col:C.red,      border:C.red+'44',           label:"RFQ's"},
    extracted:   {bg:C.accentDim, col:C.accent,  border:C.accent+'44',        label:'Ready'},
    validated:   {bg:C.greenDim,  col:C.green,   border:C.green+'44',         label:'Validated'},
    costed:      {bg:C.accentDim, col:C.accent,  border:C.accent+'44',        label:'Costed'},
    quoted:      {bg:C.greenDim,  col:C.green,   border:C.green+'44',         label:'Quoted'},
    budgetary_sent:{bg:C.accentDim,col:C.accent, border:C.accent+'44',        label:'Budgetary'+(project?.quoteSentRev?' Rev '+String(project.quoteSentRev).padStart(2,'0'):'')},
    firm_sent:   {bg:C.accentDim, col:C.accent,  border:C.accent+'44',        label:'Firm'+(project?.quoteSentRev?' Rev '+String(project.quoteSentRev).padStart(2,'0'):'')},
    pushed_to_bc:{bg:C.accentDim, col:C.accent,  border:C.accent+'44',        label:'Pushed to BC'},
    imported:    {bg:'#f3f0ff',   col:C.purple,  border:C.purple+'44',        label:'Imported'},
  };
  const {bg,col,border,label}=map[effectiveStatus]||map[status]||map.draft;
  return<span style={{background:bg,color:col,border:`1px solid ${border}`,borderRadius:999,padding:'2px 8px',fontSize:11,fontWeight:500,letterSpacing:0.2,whiteSpace:'nowrap'}}>{label}</span>;
}

export default Badge;

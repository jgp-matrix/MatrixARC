import { C } from '@/core/constants';
import { APP_VERSION } from '@/core/globals';

export default function AboutModal({onClose}: any){
  const changelog=[
    {ver:"v1.17.298",changes:["Add quote header details to portal pricing review","Add submission verification disclaimer text","Enrich supplier part numbers from cross-reference databases"]},
    {ver:"v1.17.297",changes:["Move Submit Your Quote box above Items Requested on supplier portal"]},
    {ver:"v1.17.296",changes:["Add 'Powered by ARC Software' header to supplier portal"]},
    {ver:"v1.17.295",changes:["Add Supplier Part # column to RFQ portal review table"]},
    {ver:"v1.17.294",changes:["Replace progress bar with spinning circle on portal analyzing phase"]},
    {ver:"v1.17.293",changes:["Fix supplier quote extraction for large quotes (increased capacity)","Increase extraction token limit for better accuracy"]},
    {ver:"v1.17.292",changes:["Use hybrid vision+text approach for supplier quote parsing"]},
    {ver:"v1.17.291",changes:["Widen supplier portal review page for better column visibility"]},
    {ver:"v1.17.290",changes:["Rename 'Cannot Supply' to 'No Bid' on supplier RFQ portal"]},
    {ver:"v1.17.289",changes:["Switch supplier quote parsing to vision-based extraction"]},
    {ver:"v1.17.288",changes:["Widen Supplier Quote Import modal for more columns"]},
    {ver:"v1.17.287",changes:["Update supplier quote extraction prompt for fuzzy part number matching"]},
    {ver:"v1.17.260",changes:["Add Cloud Functions for team management and supplier notifications"]},
    {ver:"v1.17.259",changes:["Fix slow connection false positive detection","Auto-reacquire BC token on search failure"]},
    {ver:"v1.17.254",changes:["BC polling: pulse updated rows green with dismissible notification"]},
    {ver:"v1.17.250",changes:["Poll BC every 5 min to keep BOM pricing and PO dates live"]},
    {ver:"v1.17.245",changes:["Add Gen. Prod. and Inventory Posting Group dropdowns to Create Item form"]},
    {ver:"v1.17.240",changes:["Add Refresh Pricing button to BOM","Backfill BC PO dates for priced rows"]},
    {ver:"v1.17.237",changes:["Show actual BC last PO date in BOM Priced column"]},
    {ver:"v1.17.234",changes:["Add vendor selection dropdown in BOM for priced items","Write vendor selection back to BC Item Card"]},
    {ver:"v1.17.230",changes:["Add Supplier and Last Price Date columns to BOM table","Add vendor name backfill from BC purchase invoices"]},
    {ver:"v1.17.225",changes:["Add RFQ (Request for Quote) feature — send quotes to suppliers"]},
    {ver:"v1.16.0",changes:["Admin-configurable labor category rates"]},
    {ver:"v1.15.0",changes:["Quote print system overhaul: compact layout, fixed footer, auto-print flow"]},
    {ver:"v1.14.0",changes:["ARC AI part number verification and BOM confidence scoring"]},
    {ver:"v1.13.0",changes:["Add labor category checkboxes and inline qty editing","Harmonize labor box font sizes"]},
    {ver:"v1.12.0",changes:["Multi-panel project support","Structured BOM extraction prompt with column mapping"]},
    {ver:"v1.11.0",changes:["Project transfer flow for team management","Team member role management via Cloud Functions"]},
    {ver:"v1.10.0",changes:["Price, Quote, and Validation action tabs","Wire counting and enclosure validation"]},
    {ver:"v1.9.0",changes:["PDF support and improved BOM extraction resolution"]},
    {ver:"v1.0.0",changes:["Initial release: BOM extraction, project management, Firebase auth"]},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,width:"min(700px,95vw)",maxHeight:"85vh",display:"flex",flexDirection:"column" as const,overflow:"hidden"}} onClick={(e: any)=>e.stopPropagation()}>
        <div style={{padding:"20px 24px 16px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>About ARC Software</div>
            <div style={{fontSize:13,color:C.accent,fontWeight:600,marginTop:4,fontFamily:"'Orbitron',monospace",letterSpacing:1}}>{APP_VERSION}</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:22}}>✕</button>
        </div>
        <div style={{padding:"16px 24px",overflowY:"auto" as const,flex:1}}>
          <div style={{fontSize:14,color:C.muted,marginBottom:16}}>Version history and release notes</div>
          {changelog.map((entry,i)=>(
            <div key={i} style={{marginBottom:16,paddingBottom:16,borderBottom:i<changelog.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:6,fontFamily:"'Orbitron',monospace",letterSpacing:0.5}}>{entry.ver}</div>
              <ul style={{margin:0,paddingLeft:20}}>
                {entry.changes.map((c,j)=><li key={j} style={{fontSize:13,color:C.text,lineHeight:1.6,marginBottom:2}}>{c}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { C } from '@/core/constants';

const TOUR_STEPS: any[]=[
  // -- OVERVIEW --
  {phase:'Overview',title:'Welcome to the ARC Walkthrough \u{1F44B}',
   body:'This walkthrough guides you through a complete panel quote from start to finish \u2014 creating a project, uploading drawings, extracting the BOM, pricing, quoting, sending RFQs, and recording a customer PO.\n\nFollow each step at your own pace. Action steps will tell you exactly what to do before moving on.',
   target:null},

  {phase:'Overview',title:'Your Projects Dashboard',
   body:'This is your home screen. Every job lives here as a card showing the project name, panels, current status, and last update.\n\nStatus colors show workflow progress at a glance \u2014 orange = Draft, yellow = In Progress, teal = Validated, purple = Costed, green = Quoted.',
   target:'[data-tour="project-list"]',placement:'center'},

  {phase:'Overview',title:'Before You Begin \u2014 Settings',
   body:'Two things must be configured before your first extraction:\n\n\u2022 \u2699 Config \u2014 Set labor rates, pricing contingencies, and default BOM items\n\u2022 \u2699 Settings \u2014 Enter your Anthropic API key (required for AI extraction)\n\nBoth are accessible from the menu bar at any time.',
   target:'[data-tour="config-btn"]',placement:'bottom'},

  // -- CREATE A PROJECT --
  {phase:'Create a Project',title:'Step 1 \u2014 Create a New Project',
   body:'Every panel job starts with a project. ARC links each project to a Business Central customer and can auto-create the corresponding BC Job.\n\nClick "+ New Project" in the top right, select your customer, enter a project name, then click Create.',
   target:'[data-tour="new-project-btn"]',placement:'bottom',
   action:true,actionLabel:'\u{1F446} Click + New Project now. Select a customer from BC, name the project, and click Create. Return here when done.'},

  {phase:'Create a Project',title:'Step 2 \u2014 Add a Panel',
   body:'Your project opens to the Panel List. Each panel represents a separate electrical assembly in the job.\n\nMost jobs have one panel. For multi-panel jobs (MCCs, systems with multiple cabinets), add one panel per assembly with a descriptive name that matches the drawing title block.',
   target:null,
   action:true,actionLabel:'\u{1F446} Click + Add Panel. Give it a name (e.g. "Main Control Panel"), then click Add. Return here when done.'},

  // -- UPLOAD DRAWINGS --
  {phase:'Upload Drawings',title:'Step 3 \u2014 Open the Panel',
   body:'Click on your new panel to open its workspace. This is where you\'ll manage drawings, review the BOM, and track the panel through the quoting workflow.',
   target:null,
   action:true,actionLabel:'\u{1F446} Click on your panel to open it. Return here once you\'re inside the panel workspace.'},

  {phase:'Upload Drawings',title:'Step 4 \u2014 Upload Your Drawing Set',
   body:'Drop your complete UL508A drawing PDF here \u2014 or click Browse to select a file. Upload the full drawing set in one go (BOM pages, schematics, layouts, enclosure drawings all together).\n\nHigher-quality PDFs (vector, not scanned) produce significantly better extraction results.',
   target:'[data-tour="add-files-zone"]',placement:'right',
   action:true,actionLabel:'\u{1F446} Drop your drawing PDF onto this zone or click to browse. Wait for the upload to finish, then return here.'},

  {phase:'Upload Drawings',title:'How Page Detection Works',
   body:'ARC automatically classifies every page using AI:\n\n\u2022 BOM \u2014 parts table (will be extracted)\n\u2022 Schematic \u2014 wiring diagram (wire count, device tags)\n\u2022 Backpanel \u2014 component layout (DIN rail, duct footage)\n\u2022 Enclosure \u2014 door view (cutouts, dimensions)\n\nEach page thumbnail shows a colored badge with its detected type.'},

  {phase:'Upload Drawings',title:'Step 5 \u2014 Verify Page Classifications',
   body:'Scan the page thumbnails. If a page was misclassified, click its thumbnail and select the correct type from the dropdown.\n\nAccurate classification is important \u2014 the schematic drives wire count labor and the layout drives door device labor. ARC learns from your corrections.',
   target:null,
   action:true,actionLabel:'\u{1F446} Review each page thumbnail. Correct any misclassified pages, then return here.'},

  // -- AI EXTRACTION --
  {phase:'ARC AI Extraction',title:'Step 6 \u2014 Extraction Runs Automatically',
   body:'Once drawings are uploaded and classified, ARC processes everything in the background:\n\n\u2022 Claude reads the BOM table and extracts every line item with quantities and part numbers\n\u2022 The schematic is analyzed for internal wire connections\n\u2022 The layout is analyzed for door cutouts, backpanel devices, and DIN rail/duct footage\n\nExtraction typically takes 1\u20135 minutes. A progress bar appears while it runs.'},

  {phase:'ARC AI Extraction',title:'The BOM Is Populated',
   body:'When complete, the BOM table fills with extracted parts. The panel status advances to Extracted.\n\nThe first three rows \u2014 CUT, LAYOUT, and WIRE \u2014 are auto-generated labor estimates calculated from the wire count and layout analysis. These drive the labor section of your quote.',
   target:'[data-tour="bom-table"]',placement:'top'},

  // -- REVIEW THE BOM --
  {phase:'Review the BOM',title:'Step 7 \u2014 Review Extracted Items',
   body:'Scroll through the BOM and verify the extracted data. Common issues to look for:\n\n\u2022 Misread part numbers (OCR errors on low-quality scans)\n\u2022 Wrong quantities\n\u2022 Missing items (check against the drawing BOM)\n\nClick any cell to edit it directly. Changes save automatically.',
   target:'[data-tour="bom-table"]',placement:'top',
   action:true,actionLabel:'\u{1F446} Review the BOM table. Fix any extraction errors by clicking and editing cells. Return here when done.'},

  {phase:'Review the BOM',title:'Red Rows Need Attention',
   body:'Rows highlighted in red have qty = 0 or unit price = $0. These will make your quote inaccurate.\n\nFor each red row: either fix the quantity/price, look up pricing from BC, or delete the row if the item shouldn\'t be on the BOM.',
   target:'[data-tour="bom-table"]',placement:'top'},

  {phase:'Review the BOM',title:'Step 8 \u2014 Get Pricing from Business Central',
   body:'For rows without a price, click the \u{1F50D} icon to open the BC Item Browser. Search by part number or description, review the results, and click USE to pull the price and vendor info directly from BC.\n\nPriced items show today\'s date in green in the Priced column. Green = within 60 days, Red = stale pricing over 60 days old.',
   target:'[data-tour="bom-table"]',placement:'top',
   action:true,actionLabel:'\u{1F446} Use the BC Item Browser (\u{1F50D}) to price unpriced rows. Return here when pricing is complete.'},

  // -- GENERATE A QUOTE --
  {phase:'Generate a Quote',title:'Step 9 \u2014 Review the Labor Estimate',
   body:'Scroll to the Pricing section below the BOM. ARC has calculated labor hours from the drawing analysis:\n\n\u2022 CUT \u2014 panel drilling and machining\n\u2022 LAYOUT \u2014 component mounting and assembly\n\u2022 WIRE \u2014 panel wiring\n\nVerify the totals are reasonable for the scope of work. Labor rates are configurable in \u2699 Config.',
   target:null,
   action:true,actionLabel:'\u{1F446} Scroll down to the Pricing section and review the CUT/LAYOUT/WIRE hours. Return here when done.'},

  {phase:'Generate a Quote',title:'Step 10 \u2014 Open the Quote Editor',
   body:'Click "Print Client Quote" to open the quote editor. Fill in or verify:\n\n\u2022 Salesperson name\n\u2022 Requested ship date\n\u2022 Quote notes (optional)\n\u2022 Markup % \u2014 the sell price recalculates instantly\n\nThe sell price = (BOM + Labor + Contingencies) \u00d7 (1 + markup%).',
   target:'[data-tour="print-quote-btn"]',placement:'top',
   action:true,actionLabel:'\u{1F446} Click Print Client Quote. Review all fields and the sell price. Adjust markup if needed. Return here when done.'},

  {phase:'Generate a Quote',title:'Step 11 \u2014 Print to PDF',
   body:'Inside the quote editor, click the Print Client Quote button to open the browser print dialog. Select "Save as PDF" to export.\n\nThe quote includes:\n\u2022 Company header with logo\n\u2022 Labor summary with bar charts\n\u2022 BOM table (configurable)\n\u2022 Terms & Conditions page\n\nUse Edge or Chrome for best print formatting.',
   target:'[data-tour="print-quote-btn"]',placement:'top'},

  // -- SEND RFQs --
  {phase:'Send RFQs',title:'Step 12 \u2014 Open the RFQ Modal',
   body:'An RFQ (Request for Quote) is sent to vendors to get pricing on your BOM items. ARC automatically groups BOM items by supplier and generates a separate, formatted RFQ document for each vendor.\n\nClick "Send/Print RFQ\'s" to open the RFQ modal.',
   target:'[data-tour="rfq-btn"]',placement:'top',
   action:true,actionLabel:'\u{1F446} Click Send/Print RFQ\'s to open the RFQ modal. Return here once it\'s open.'},

  {phase:'Send RFQs',title:'Step 13 \u2014 Preview an RFQ',
   body:'In the RFQ modal, you\'ll see one row per vendor. Click \u{1F441} Preview next to any vendor to review the full RFQ document before it goes out.\n\nVerify the part list, quantities, RFQ number, and response deadline look correct.',
   target:'[data-tour="rfq-btn"]',placement:'top',
   action:true,actionLabel:'\u{1F446} Click \u{1F441} Preview on at least one vendor. Review the document, then return here.'},

  {phase:'Send RFQs',title:'Step 14 \u2014 Send the RFQ',
   body:'Click "Send Email" next to a vendor to send the RFQ. The vendor receives:\n\n\u2022 The RFQ as a PDF attachment\n\u2022 A direct link to submit pricing via the ARC supplier portal (no login required)\n\nWhen the supplier submits pricing, the "\u{1F4E5} Upload Supplier Quote" button shows a badge count. Click it to review and apply their prices to your BOM.',
   target:'[data-tour="rfq-btn"]',placement:'top',
   action:true,actionLabel:'\u{1F446} Send the RFQ to at least one vendor. Return here when done.'},

  // -- PO RECEIVED --
  {phase:'PO Received',title:'When the Customer Issues a PO',
   body:'Once the customer accepts your quote and issues a Purchase Order, you\'ll record it in ARC. This writes the PO information directly to Business Central.\n\nThe "\u{1F4EC} PO Received" button is located below Print Quote on the Panel List \u2014 it only appears when a BC Project Number is linked.'},

  {phase:'PO Received',title:'Step 15 \u2014 Record the PO',
   body:'Click "\u{1F4EC} PO Received" and enter:\n\n\u2022 Customer PO Number \u2014 written to BC as External Document No.\n\u2022 Ship Date \u2014 pushed to BC planning lines as the panel Ending Date\n\nFor multi-panel jobs, click "Set per-panel dates \u2192" to assign individual ship dates per panel.\n\nClicking Submit PO sets the BC project status to Open.',
   target:null,
   action:true,actionLabel:'\u{1F446} When you have a real PO in hand: click \u{1F4EC} PO Received, enter the PO number and ship date, then click Submit PO. Return here after.'},

  {phase:'PO Received',title:'Workflow Complete \u{1F389}',
   body:'You\'ve completed the full ARC panel quote process:\n\n\u2713 Created a project and panel\n\u2713 Uploaded drawings and ran AI extraction\n\u2713 Reviewed and priced the BOM\n\u2713 Generated a customer quote\n\u2713 Sent RFQs to vendors\n\u2713 Recorded the customer PO in BC\n\nFor detailed reference on any feature, see the ARC Training Manual.',
   target:null},
];

function useTourRect(target: any){
  const[rect,setRect]=useState<any>(null);
  useEffect(()=>{
    if(!target){setRect(null);return;}
    function measure(){
      const el=document.querySelector(target);
      if(!el){setRect(null);return;}
      const r=el.getBoundingClientRect();
      setRect({top:r.top,left:r.left,width:r.width,height:r.height});
      el.scrollIntoView({behavior:'smooth',block:'center'});
    }
    measure();
    const t=setTimeout(measure,320);
    return()=>clearTimeout(t);
  },[target]);
  return rect;
}

function TourOverlay({stepIdx,onNext,onPrev,onDone,onSkip,onMinimize}: any){
  const step=TOUR_STEPS[stepIdx];
  const PAD=12;const PW=480;
  const rect=useTourRect(step?.target||null);
  const[popStyle,setPopStyle]=useState<any>({});

  useEffect(()=>{
    const vw=window.innerWidth;const vh=window.innerHeight;
    if(!rect||!step?.target){
      setPopStyle({position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:PW});
      return;
    }
    const cx=rect.left+rect.width/2;
    const sp=step.placement||'bottom';
    let top: number,left: number;
    if(sp==='bottom'){
      top=rect.top+rect.height+PAD+16;
      left=Math.max(16,Math.min(cx-PW/2,vw-PW-16));
    }else if(sp==='top'){
      top=rect.top-PAD-380;
      left=Math.max(16,Math.min(cx-PW/2,vw-PW-16));
    }else if(sp==='right'){
      top=Math.max(16,Math.min(rect.top+rect.height/2-180,vh-380));
      left=Math.min(rect.left+rect.width+PAD+16,vw-PW-16);
    }else if(sp==='center'){
      top=Math.max(16,Math.min(rect.top+rect.height/2-180,vh-380));
      left=Math.max(16,Math.min(cx-PW/2,vw-PW-16));
    }else{
      top=Math.max(16,Math.min(rect.top-PAD-380,vh-380));
      left=Math.max(16,Math.min(cx-PW/2,vw-PW-16));
    }
    setPopStyle({position:'fixed',top:Math.max(10,top),left:Math.max(10,left),width:PW});
  },[rect,step,stepIdx]);

  const isFirst=stepIdx===0;const isLast=stepIdx===TOUR_STEPS.length-1;
  const phasePct=Math.round(((stepIdx+1)/TOUR_STEPS.length)*100);

  return(
    <div style={{position:'fixed',inset:0,zIndex:99997,pointerEvents:'all'}}>
      {!rect&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.75)'}}/>}
      {rect&&<div style={{position:'fixed',top:rect.top-PAD,left:rect.left-PAD,width:rect.width+PAD*2,height:rect.height+PAD*2,borderRadius:12,boxShadow:'0 0 0 9999px rgba(0,0,0,0.75)',border:`2px solid ${C.accent}`,pointerEvents:'none',zIndex:99998,transition:'top 0.25s ease,left 0.25s ease,width 0.25s ease,height 0.25s ease'}}/>}
      <div style={{...popStyle,zIndex:99999,background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:'hidden',boxShadow:'0 16px 56px rgba(0,0,0,0.18)',color:C.text,pointerEvents:'all'}}>
        {/* Phase + progress header */}
        <div style={{background:C.bg,padding:'13px 20px',borderBottom:`1px solid ${C.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <span style={{fontSize:13,fontWeight:700,color:C.accent,letterSpacing:0.5,textTransform:'uppercase'}}>{step.phase}</span>
          <div style={{flex:1,height:4,background:C.border,borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:phasePct+'%',background:C.accent,borderRadius:2,transition:'width 0.3s ease'}}/>
          </div>
          <span style={{fontSize:13,color:C.muted,flexShrink:0,fontWeight:600}}>{stepIdx+1} / {TOUR_STEPS.length}</span>
          <button onClick={onMinimize} title="Minimize \u2014 your progress is saved" style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,cursor:'pointer',fontSize:13,lineHeight:1,padding:'3px 10px',borderRadius:5,flexShrink:0,fontFamily:'inherit'}}>{"\u2013 Hide"}</button>
        </div>
        {/* Body */}
        <div style={{padding:'22px 26px'}}>
          <div style={{fontSize:18,fontWeight:700,color:C.accent,lineHeight:1.3,marginBottom:14}}>{step.title}</div>
          <div style={{fontSize:15,color:C.sub,lineHeight:1.75,whiteSpace:'pre-line',marginBottom:step.action?16:22}}>{step.body}</div>
          {/* Action prompt */}
          {step.action&&(
            <div style={{background:C.greenDim,border:`1px solid ${C.green}`,borderRadius:10,padding:'14px 18px',marginBottom:18}}>
              <div style={{fontSize:13,fontWeight:700,color:C.green,marginBottom:4}}>{"\u{1F446} Your Turn"}</div>
              <div style={{fontSize:14,color:C.green,lineHeight:1.7}}>{step.actionLabel}</div>
            </div>
          )}
          {/* Navigation */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
            <button onClick={onSkip} style={{background:'none',border:'none',color:C.muted,cursor:'pointer',fontSize:13,padding:0,fontFamily:'inherit',textDecoration:'underline'}}>End tour</button>
            <div style={{display:'flex',gap:10}}>
              {!isFirst&&<button onClick={onPrev} style={{background:'none',border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:'9px 20px',cursor:'pointer',fontSize:14,fontFamily:'inherit'}}>{"\u2190 Back"}</button>}
              {isLast
                ?<button onClick={onDone} style={{background:C.green,border:'none',color:'#fff',borderRadius:8,padding:'9px 24px',cursor:'pointer',fontSize:15,fontWeight:700,fontFamily:'inherit'}}>{"Finish \u2713"}</button>
                :<button onClick={onNext} style={{background:C.accent,border:'none',color:'#fff',borderRadius:8,padding:'9px 24px',cursor:'pointer',fontSize:15,fontWeight:700,fontFamily:'inherit'}}>{step.action?'Done, Next \u2192':'Next \u2192'}</button>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TourOverlay;

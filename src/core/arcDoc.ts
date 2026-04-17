// ── ARC Document Framework ──
// PDF generation utilities using jsPDF for quotes, cover pages, and RFQ documents.

import { _appCtx } from '@/core/globals';
import { computeBomHash, ensureJsPDF } from '@/core/helpers';
import { computePanelSellPrice } from '@/bom/quoteBuilder';
import { computeLaborEstimate } from '@/bom/laborEstimator';

declare const window: any;
declare function bcAttachPdfToJob(bcNum: string, fileName: string, pdfBytes: ArrayBuffer, existingAttachmentId: string | null): Promise<void>;

export const ARC_DOC = {
  W:215.9,H:279.4,
  margin:{top:15,bottom:20,left:15,right:15},
  colors:{brand:[37,99,246] as number[],black:[15,23,42] as number[],grey:[100,116,139] as number[],lightGrey:[148,163,184] as number[],red:[220,38,38] as number[],white:[255,255,255] as number[]},
  fonts:{heading:16,subheading:11,body:9,small:7.5,tiny:6}
};

export function arcDocCreate(doc: any){
  const cw=ARC_DOC.W-ARC_DOC.margin.left-ARC_DOC.margin.right;
  return{doc,y:ARC_DOC.margin.top,pageNum:1,contentBottom:ARC_DOC.H-ARC_DOC.margin.bottom,contentWidth:cw,headerOpts:null as any};
}

export function arcDocNewPage(ctx: any){
  ctx.doc.addPage();ctx.pageNum++;ctx.y=ARC_DOC.margin.top;
  if(ctx.headerOpts)arcDocHeaderCompact(ctx,ctx.headerOpts);
}

export function arcDocCheckBreak(ctx: any,height: number){
  if(ctx.y+height>ctx.contentBottom){arcDocNewPage(ctx);return true;}
  return false;
}

export async function arcDocLoadLogo(){
  const url=_appCtx.company?.logoDarkUrl||_appCtx.company?.logoUrl;
  if(!url)return null;
  try{
    return await new Promise<any>((res,rej)=>{const img=new Image();img.crossOrigin="anonymous";img.onload=()=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d")!.drawImage(img,0,0);res({data:c.toDataURL("image/png"),w:img.naturalWidth,h:img.naturalHeight});};img.onerror=()=>res(null);img.src=url;});
  }catch(e){return null;}
}

export function arcDocHeader(ctx: any,opts: any){
  const{doc}=ctx;const m=ARC_DOC.margin;const W=ARC_DOC.W;
  ctx.headerOpts=opts;
  let y=m.top;
  // Logo -- preserve aspect ratio, max 45mm wide, 14mm tall
  const logoMaxW=45,logoMaxH=14;
  if(opts.logo&&opts.logo.data){
    try{
      const ar=opts.logo.w/opts.logo.h;
      let lw=logoMaxW,lh=lw/ar;
      if(lh>logoMaxH){lh=logoMaxH;lw=lh*ar;}
      doc.addImage(opts.logo.data,"PNG",m.left,y,lw,lh);
    }catch(e){}
  }
  // Company address + phone under logo
  doc.setFontSize(7);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.grey);
  doc.text(_appCtx.company?.address||"5591 Leo Park Road, West Jordan, UT 84081 US",m.left,y+17);
  doc.text(_appCtx.company?.phone||"(801) 930-9492",m.left,y+20);
  // Right side -- doc type + number + date
  const rx=W-m.right;
  doc.setFontSize(opts.budgetary?18:13);doc.setFont("helvetica","bold");
  doc.setTextColor(...(opts.budgetary?ARC_DOC.colors.red:ARC_DOC.colors.grey));
  doc.text(opts.docType||"Quote",rx,y+3,{align:"right"});
  doc.setFontSize(22);doc.setTextColor(...ARC_DOC.colors.black);
  doc.text(opts.docNumber||"",rx,y+10,{align:"right"});
  doc.setFontSize(8);doc.setTextColor(...ARC_DOC.colors.grey);
  if(opts.rev!=null)doc.text("Rev "+String(opts.rev).padStart(2,"0"),rx,y+14,{align:"right"});
  doc.text(opts.date||"",rx,y+18,{align:"right"});
  // Blue line under header
  y+=22;
  doc.setDrawColor(...ARC_DOC.colors.brand);doc.setLineWidth(0.5);
  doc.line(m.left,y,W-m.right,y);
  ctx.y=y+5;
}

export function arcDocHeaderCompact(ctx: any,opts: any){
  const{doc}=ctx;const m=ARC_DOC.margin;const W=ARC_DOC.W;
  let y=m.top;
  doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.brand);
  doc.text(_appCtx.company?.name||"Matrix Systems",m.left,y);
  doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.grey);
  doc.text(`${opts.docType||"Quote"} ${opts.docNumber||""} \u00B7 ${opts.date||""}`,W-m.right,y,{align:"right"});
  y+=3;
  doc.setDrawColor(...ARC_DOC.colors.brand);doc.setLineWidth(0.4);
  doc.line(m.left,y,W-m.right,y);
  ctx.y=y+4;
}

export function arcDocStampFooters(ctx: any,opts: any){
  const{doc}=ctx;const totalPages=ctx.pageNum;const m=ARC_DOC.margin;const W=ARC_DOC.W;
  for(let p=1;p<=totalPages;p++){
    doc.setPage(p);
    const fy=ARC_DOC.H-10;
    // Blue line
    doc.setDrawColor(...ARC_DOC.colors.brand);doc.setLineWidth(0.4);
    doc.line(m.left,fy-4,W-m.right,fy-4);
    // Left: company
    doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.grey);
    doc.text(opts.companyName||"Matrix Systems",m.left,fy);
    doc.setFont("helvetica","normal");doc.setFontSize(6);
    doc.text(opts.address||"5591 Leo Park Rd \u00B7 West Jordan, UT 84081",m.left,fy+3);
    // Center: page number + continued
    doc.setFontSize(7);doc.setFont("helvetica","normal");
    doc.text(`Page ${p} of ${totalPages}`,W/2,fy,{align:"center"});
    if(p<totalPages){
      doc.setFontSize(6);doc.setFont("helvetica","italic");doc.setTextColor(...ARC_DOC.colors.lightGrey);
      doc.text("continued on next page...",W/2,fy+3,{align:"center"});
    }
    // Right: phone/email
    doc.setFontSize(6);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.grey);
    doc.text(opts.phone||"(801) 930-9492",W-m.right,fy,{align:"right"});
    doc.text(opts.email||"sales@matrixpci.com",W-m.right,fy+3,{align:"right"});
  }
}

export function arcDocText(ctx: any,text: string,opts: any={}){
  if(!text)return;
  const{doc}=ctx;const m=ARC_DOC.margin;
  const fs=opts.fontSize||ARC_DOC.fonts.body;
  const maxW=opts.maxWidth||ctx.contentWidth;
  doc.setFontSize(fs);
  doc.setFont("helvetica",opts.bold?"bold":opts.italic?"italic":"normal");
  doc.setTextColor(...(opts.color||ARC_DOC.colors.black));
  const lines=doc.splitTextToSize(String(text),maxW);
  const lineH=fs*0.5;
  const ascent=fs*0.35;
  const blockH=lines.length*lineH;
  arcDocCheckBreak(ctx,blockH+ascent+2);
  const x=opts.align==="right"?ARC_DOC.W-m.right:opts.align==="center"?ARC_DOC.W/2:m.left+(opts.indent||0);
  lines.forEach((line: string,i: number)=>{doc.text(line,x,ctx.y+ascent+i*lineH,{align:opts.align||"left"});});
  ctx.y+=ascent+blockH+(opts.gap!=null?opts.gap:3);
}

export function arcDocLabel(ctx: any,label: string,opts: any={}){
  arcDocText(ctx,(label||"").toUpperCase(),{fontSize:ARC_DOC.fonts.tiny,bold:true,color:ARC_DOC.colors.grey,gap:1,...opts});
}

export function arcDocValue(ctx: any,value: string,opts: any={}){
  arcDocText(ctx,value||"\u2014",{fontSize:ARC_DOC.fonts.body,...opts});
}

export function arcDocHLine(ctx: any,opts: any={}){
  const{doc}=ctx;const m=ARC_DOC.margin;
  doc.setDrawColor(...(opts.color||ARC_DOC.colors.black));doc.setLineWidth(opts.width||0.4);
  doc.line(m.left,ctx.y,ARC_DOC.W-m.right,ctx.y);
  ctx.y+=2;
}

export function arcDocInfoGrid(ctx: any,leftLines: any[],rightLines: any[]){
  const{doc}=ctx;const m=ARC_DOC.margin;
  const colW=ctx.contentWidth/2-6;
  const startY=ctx.y;
  const lh=3.5;
  function renderCol(lines: any[],x: number,startY: number){
    let cy=startY+2;
    for(const{label,value,bold}of lines){
      if(label){
        doc.setFontSize(ARC_DOC.fonts.tiny);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.brand);
        doc.text((label).toUpperCase(),x,cy);cy+=4;
      }
      if(value){
        const fs=bold?12:ARC_DOC.fonts.body;
        const vlh=bold?5:lh;
        doc.setFontSize(fs);doc.setFont("helvetica",bold?"bold":"normal");doc.setTextColor(...ARC_DOC.colors.black);
        const vLines=doc.splitTextToSize(String(value||""),colW);
        if(bold)cy+=2;
        vLines.forEach((vl: string,vi: number)=>{doc.text(vl,x,cy+vi*vlh);});
        cy+=vLines.length*vlh+1.5;
      }
    }
    return cy;
  }
  const ly=renderCol(leftLines,m.left,startY);
  const ry=renderCol(rightLines,ARC_DOC.W/2+4,startY);
  ctx.y=Math.max(ly,ry)+3;
}

export function arcDocKeyValueRow(ctx: any,items: any[]){
  const{doc}=ctx;const m=ARC_DOC.margin;
  const itemW=ctx.contentWidth/items.length;
  arcDocCheckBreak(ctx,12);
  items.forEach((it: any,i: number)=>{
    const x=m.left+i*itemW;
    doc.setFontSize(ARC_DOC.fonts.tiny);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.grey);
    doc.text((it.label||"").toUpperCase(),x,ctx.y);
    doc.setFontSize(8);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.black);
    doc.text(String(it.value||"\u2014"),x,ctx.y+4);
  });
  ctx.y+=10;
}

export function arcDocOpen(doc: any){
  const blob=doc.output("blob");
  const url=URL.createObjectURL(blob);
  window.open(url,"_blank");
}

export function arcDocBase64(doc: any){
  return doc.output("datauristring").split(",")[1];
}

// ── QUOTE PDF BUILDER ──
export function arcFmtMoney(n: number){return"$"+Math.round(n).toLocaleString("en-US");}
export function arcFmtPhone(p: string){const d=(p||"").replace(/\D/g,"");return d.length===10?d.slice(0,3)+"-"+d.slice(3,6)+"-"+d.slice(6):p||"";}

export async function buildQuotePdfDoc(doc: any,project: any){
  const ctx=arcDocCreate(doc);
  const q=project.quote||{};
  const panels=project.panels||[];
  const isBudg=panels.some((pan: any)=>(pan.pricing||{}).isBudgetary);
  const logo=await arcDocLoadLogo();
  const today=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

  // ── PAGE 1: HEADER ──
  arcDocHeader(ctx,{
    logo,
    docType:isBudg?"BUDGETARY QUOTE":"Quote",
    docNumber:q.number||"",
    date:q.date||today,
    rev:project.quoteRev||0,
    budgetary:isBudg
  });

  // ── INFO GRID: Attention / Prepared By ──
  const addrLines=[q.company,q.address,q.phone?"Phone: "+q.phone:"",q.email].filter(Boolean).join("\n");
  const salesLines=["Salesperson",q.salesEmail?arcFmtPhone(q.salesPhone):"",q.salesEmail||""].filter(Boolean).join("\n");
  arcDocInfoGrid(ctx,
    [{label:"Attention",value:q.contact||"\u2014",bold:true},{label:"",value:addrLines}],
    [{label:"Prepared By",value:q.salesperson||"\u2014",bold:true},{label:"",value:salesLines}]
  );

  // ── PROJECT DETAILS ROW (boxed) ──
  {const projY=ctx.y;
  ctx.y+=2;
  arcDocKeyValueRow(ctx,[
    {label:"Project #",value:q.projectNumber||project.bcProjectNumber||""},
    {label:"Req. Ship Date",value:q.requestedShipDate||(panels.find((p: any)=>p.requestedShipDate)||{}).requestedShipDate||"TBD"},
    {label:"Pmt. Terms",value:q.paymentTerms||"Net 30 Days"},
    {label:"Shipping Method",value:q.shippingMethod||"Customer Handles Shipping"}
  ]);
  doc.setDrawColor(...ARC_DOC.colors.lightGrey);doc.setLineWidth(0.3);
  doc.roundedRect(ARC_DOC.margin.left,projY,ctx.contentWidth,ctx.y-projY,2,2);
  ctx.y+=1;}

  // ── PAYMENT TERMS TEXT ──
  const defaultTerms="Standard Payment Terms for Panel Builds (Order Total over $30,000): 30% ARO; 40% @ Procurement, 30% @ Readiness To Ship\nStandard Payment Terms for Engineering / Programming: 50% ARO / 50% due @ Completion of Work";
  const termsText=q.termsText!=null?q.termsText:defaultTerms;
  if(termsText){
    doc.setFontSize(7.5);doc.setFont("helvetica","normal");
    const tLines=doc.splitTextToSize(termsText,ctx.contentWidth-6);
    const tlh=3.2;
    const tH=tLines.length*tlh+6;
    arcDocCheckBreak(ctx,tH);
    doc.setFillColor(239,246,255);doc.setDrawColor(226,232,240);
    doc.roundedRect(ARC_DOC.margin.left,ctx.y,ctx.contentWidth,tH,1,1,"FD");
    doc.setTextColor(...ARC_DOC.colors.black);
    tLines.forEach((tl: string,ti: number)=>{doc.text(tl,ARC_DOC.margin.left+3,ctx.y+4+ti*tlh);});
    ctx.y+=tH+3;
  }

  // ── LINE ITEMS ──
  arcDocText(ctx,"Line Items",{fontSize:ARC_DOC.fonts.subheading,bold:true,gap:3});

  for(let pi=0;pi<panels.length;pi++){
    const pan=panels[pi];
    const panSell=computePanelSellPrice(pan);
    const panQty=pan.lineQty??1;
    const qp=(q.panelOverrides||{})[pan.id]||{};
    const panBom=pan.bom||[];

    arcDocCheckBreak(ctx,40);
    const lineItemStartY=ctx.y;
    const lineItemStartPage=ctx.pageNum;

    // Line header bar
    doc.setFillColor(248,250,252);doc.setDrawColor(226,232,240);
    doc.roundedRect(ARC_DOC.margin.left,ctx.y,ctx.contentWidth,7,2,2,"FD");
    doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.brand);
    doc.text("Line "+(pi+1),ARC_DOC.margin.left+3,ctx.y+4.5);
    doc.setTextColor(...ARC_DOC.colors.black);
    doc.text("Part #: "+(pan.drawingNo||qp.panelId||pan.name||"Panel "+(pi+1)),ARC_DOC.margin.left+22,ctx.y+4.5);
    ctx.y+=9;

    arcDocText(ctx,qp.description||pan.drawingDesc||pan.name||"Panel "+(pi+1),{fontSize:11,bold:true,gap:2,indent:2,maxWidth:ctx.contentWidth-4});

    // Specs grid (2 columns)
    const specs: [string,string][]=[
      ["Project",q.projectNumber||project.bcProjectNumber||project.name||""],
      ["Drawing Rev",pan.drawingRev||"\u2014"],
      ["Panel ID",pan.drawingNo||pan.name||"\u2014"],
      ["Plant Name",qp.plantName||q.plantName||""],
      ["Supply Voltage",qp.supplyVoltage||q.supplyVoltage||pan.supplyVoltage||""],
      ["Control Voltage",qp.controlVoltage||q.controlVoltage||pan.controlVoltage||""]
    ];
    const specColW=ctx.contentWidth/2;
    const specLabelW=26;
    arcDocCheckBreak(ctx,Math.ceil(specs.length/2)*4.5);
    for(let si=0;si<specs.length;si+=2){
      const x1=ARC_DOC.margin.left+2;const x2=ARC_DOC.margin.left+specColW+2;
      doc.setFontSize(7.5);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.grey);
      doc.text(specs[si][0]+":",x1,ctx.y);
      doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.black);
      doc.text(String(specs[si][1]||"\u2014"),x1+specLabelW,ctx.y);
      if(si+1<specs.length){
        doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.grey);
        doc.text(specs[si+1][0]+":",x2,ctx.y);
        doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.black);
        doc.text(String(specs[si+1][1]||"\u2014"),x2+specLabelW,ctx.y);
      }
      ctx.y+=4.5;
    }
    ctx.y+=1;

    // BOM Notes
    if(pan.bomNotes){
      doc.setFontSize(6.5);doc.setFont("helvetica","normal");
      const nLines=doc.splitTextToSize("Notes: "+pan.bomNotes,ctx.contentWidth-8);
      const nlh=2.5;
      const nH=nLines.length*nlh+3;
      arcDocCheckBreak(ctx,nH+2);
      doc.setFillColor(255,251,235);doc.setDrawColor(245,158,11);doc.setLineWidth(0.3);
      doc.roundedRect(ARC_DOC.margin.left+0.3,ctx.y,ctx.contentWidth-0.6,nH,1,1);
      doc.line(ARC_DOC.margin.left+0.3,ctx.y,ARC_DOC.margin.left+0.3,ctx.y+nH);
      doc.setTextColor(...ARC_DOC.colors.black);
      nLines.forEach(function(nl: string,ni: number){doc.text(nl,ARC_DOC.margin.left+3,ctx.y+2.5+ni*nlh);});
      ctx.y+=nH+1;
    }

    // Quote Notes
    if(qp.lineNotes){
      doc.setFontSize(6.5);doc.setFont("helvetica","italic");doc.setTextColor(...ARC_DOC.colors.brand);
      const qnLines=doc.splitTextToSize("Quote Notes: "+qp.lineNotes,ctx.contentWidth-6);
      const qnlh=2.5;
      arcDocCheckBreak(ctx,qnLines.length*qnlh+2);
      qnLines.forEach(function(ql: string,qi: number){doc.text(ql,ARC_DOC.margin.left+2,ctx.y+qi*qnlh);});
      ctx.y+=qnLines.length*3.5+2;
    }

    // Crossed items
    const crossed=panBom.filter((r: any)=>r.isCrossed&&r.crossedFrom);
    if(crossed.length>0){
      const maxCrossedW=ctx.contentWidth-8;
      doc.setFontSize(5.5);doc.setFont("helvetica","normal");
      var clh=2.2;
      let crossH=3.5;
      crossed.forEach(function(item: any,i: number){
        var txt=(i+1)+". "+item.crossedFrom+" > "+item.partNumber+(item.description?" ("+item.description+")":"");
        crossH+=doc.splitTextToSize(txt,maxCrossedW).length*clh;
      });
      arcDocCheckBreak(ctx,crossH);
      doc.setFontSize(6);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.grey);
      doc.text("Crossed / Superseded - Alternate Products Used",ARC_DOC.margin.left+2,ctx.y);ctx.y+=3;
      doc.setFont("helvetica","normal");doc.setFontSize(5.5);doc.setTextColor(...ARC_DOC.colors.black);
      crossed.forEach(function(item: any,i: number){
        var txt=(i+1)+". "+item.crossedFrom+" > "+item.partNumber+(item.description?" ("+item.description+")":"");
        var lines=doc.splitTextToSize(txt,maxCrossedW);
        lines.forEach(function(ln: string,li: number){doc.text(ln,ARC_DOC.margin.left+3,ctx.y+li*clh);});
        ctx.y+=lines.length*clh;
      });
      ctx.y+=2;
    }

    // Pricing row
    arcDocCheckBreak(ctx,14);
    doc.setFillColor(248,250,252);doc.setDrawColor(248,250,252);
    doc.rect(ARC_DOC.margin.left+0.3,ctx.y,ctx.contentWidth-0.6,12,"FD");
    const pw=ctx.contentWidth/5;const py=ctx.y;
    [{l:"Quantity",v:panQty+" EA"},{l:"Unit Price",v:panSell>0?arcFmtMoney(panSell):"\u2014"},{l:"Lead Time",v:(qp.leadTime||q.leadTime||"\u2014")+" days"},{l:"Discount",v:"\u2014"},{l:"Total Price",v:panSell>0?arcFmtMoney(panSell*panQty):"\u2014"}].forEach((col,ci)=>{
      const cx=ARC_DOC.margin.left+ci*pw+pw/2;
      doc.setFontSize(6);doc.setFont("helvetica","italic");doc.setTextColor(...ARC_DOC.colors.grey);
      doc.text(col.l,cx,py+4,{align:"center"});
      doc.setFontSize(10);doc.setFont("helvetica","bold");doc.setTextColor(...(ci===4?ARC_DOC.colors.brand:ARC_DOC.colors.black));
      doc.text(col.v,cx,py+9,{align:"center"});
    });
    ctx.y=py+13;
    if(ctx.pageNum===lineItemStartPage){
      doc.setDrawColor(...ARC_DOC.colors.lightGrey);doc.setLineWidth(0.3);
      doc.roundedRect(ARC_DOC.margin.left,lineItemStartY,ctx.contentWidth,ctx.y-lineItemStartY,2,2);
    }
    ctx.y+=3;
  }

  // ── VALIDITY DISCLAIMER ──
  if(ctx.y+50>ctx.contentBottom){
    arcDocText(ctx,"Order total continued on next page...",{fontSize:8,italic:true,color:ARC_DOC.colors.lightGrey,align:"center",gap:2});
  }
  arcDocCheckBreak(ctx,30);
  arcDocHLine(ctx,{color:ARC_DOC.colors.black,width:0.5});
  arcDocText(ctx,"Budgetary quotes are provided for planning purposes only and do not represent a firm or binding price. Firm quoted prices are valid for 30 days from the date of issue unless otherwise noted. All prices are subject to change without notice and do not constitute a binding contract until a purchase order is accepted and confirmed by Matrix Systems. Lead times and material availability are estimated and subject to supplier confirmation at time of order.",{fontSize:7.5,italic:true,color:ARC_DOC.colors.grey,gap:4});

  // ── TOTALS BOX ──
  const totalPrice=panels.reduce((s: number,pan: any)=>computePanelSellPrice(pan)*(pan.lineQty??1)+s,0);
  arcDocCheckBreak(ctx,25);
  const bx=ARC_DOC.W-ARC_DOC.margin.right-60;const bw=60;
  const isNonTaxable=/nontax|non.?tax/i.test(q.taxAreaCode||"");
  [{l:"Subtotal",v:arcFmtMoney(totalPrice),bold:false},{l:"Tax",v:isNonTaxable?"Non-Taxable":"$0",bold:false},{l:"Total",v:arcFmtMoney(totalPrice),bold:true}].forEach((row,ri)=>{
    const ry=ctx.y+ri*7;
    if(row.bold){doc.setDrawColor(...ARC_DOC.colors.black);doc.setLineWidth(0.5);doc.line(bx,ry,bx+bw,ry);}
    doc.setFontSize(row.bold?12:9);doc.setFont("helvetica",row.bold?"bold":"normal");doc.setTextColor(...ARC_DOC.colors.black);
    doc.text(row.l,bx+2,ry+5);
    doc.setTextColor(...(row.bold?ARC_DOC.colors.brand:ARC_DOC.colors.black));
    doc.text(row.v,bx+bw-2,ry+5,{align:"right"});
  });
  ctx.y+=24;
  if(isBudg){
    doc.setFontSize(11);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.red);
    doc.text("BUDGETARY",bx+bw/2,ctx.y,{align:"center"});ctx.y+=6;
  }

  // ── PRICES VALID UNTIL ──
  arcDocCheckBreak(ctx,8);
  doc.setFontSize(7);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.grey);
  doc.text("PRICES VALID UNTIL",ARC_DOC.W-ARC_DOC.margin.right,ctx.y,{align:"right"});
  ctx.y+=3.5;
  doc.setFontSize(9);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.red);
  doc.text(q.validUntil||new Date(Date.now()+30*24*60*60*1000).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}),ARC_DOC.W-ARC_DOC.margin.right,ctx.y,{align:"right"});
  ctx.y+=6;

  // ── T&C PAGE ──
  const tcRaw=(_appCtx as any).termsAndConditions||"";
  if(tcRaw.trim()){
    arcDocNewPage(ctx);
    doc.setFontSize(8);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.black);
    doc.text("STANDARD TERMS AND CONDITIONS OF SALE",ARC_DOC.W/2,ctx.y,{align:"center"});ctx.y+=3;
    doc.setFontSize(6);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.grey);
    doc.text(_appCtx.company?.name||"Matrix Systems, LLC",ARC_DOC.W/2,ctx.y,{align:"center"});ctx.y+=4;
    // Parse sections
    const preprocessed=tcRaw.replace(/(\D)(\d{1,2})[.\)]\s*([A-Z])/g,function(mt: string,pre: string,num: string,letter: string){return pre+"\n"+num+". "+letter;});
    const tcLines=preprocessed.split("\n");
    const sections: any[]=[];let cur: any=null;
    for(const line of tcLines){
      const trimmed=line.trim();if(!trimmed)continue;
      const numMatch=trimmed.match(/^(\d+)[.\)]\s*(.+)/);
      if(numMatch){
        if(cur)sections.push(cur);
        const rest=numMatch[2];const ci=rest.indexOf(":");
        if(ci>0&&ci<60)cur={num:parseInt(numMatch[1]),title:numMatch[1]+". "+rest.slice(0,ci).trim(),body:rest.slice(ci+1).trim()};
        else cur={num:parseInt(numMatch[1]),title:numMatch[1]+". "+rest.trim(),body:""};
      }else if(!cur){
        const cm=trimmed.match(/^([^:]{3,60}):\s*(.+)$/);
        if(cm)sections.push({num:9999+sections.length,title:cm[1],body:cm[2]});
        else sections.push({num:9999+sections.length,title:"",body:trimmed});
      }else{cur.body+=(cur.body?" ":"")+trimmed;}
    }
    if(cur)sections.push(cur);
    sections.sort((a,b)=>a.num-b.num);
    // Render in two columns
    const colW=(ctx.contentWidth-6)/2;const colX=[ARC_DOC.margin.left,ARC_DOC.margin.left+colW+6];
    let col=0;let colY=[ctx.y,ctx.y];
    for(const sec of sections){
      doc.setPage(ctx.pageNum);
      const titleH=sec.title?2.5:0;
      doc.setFontSize(4.5);
      const bodyLines=sec.body?doc.splitTextToSize(sec.body,colW):[];
      const bodyH=bodyLines.length*2;
      const secH=titleH+bodyH+1.5;
      if(colY[col]+secH>ctx.contentBottom){
        if(col===0){col=1;}
        else{arcDocNewPage(ctx);col=0;colY=[ctx.y,ctx.y];}
      }
      const sy=colY[col];const sx=colX[col];
      if(sec.title){
        doc.setFontSize(5);doc.setFont("helvetica","bold");doc.setTextColor(...ARC_DOC.colors.brand);
        doc.text(sec.title,sx,sy);colY[col]+=2.5;
      }
      if(bodyLines.length){
        doc.setFontSize(4.5);doc.setFont("helvetica","normal");doc.setTextColor(...ARC_DOC.colors.black);
        bodyLines.forEach((bl: string,bi: number)=>{doc.text(bl,sx,colY[col]+bi*2);});
        colY[col]+=bodyLines.length*2;
      }
      colY[col]+=1;
    }
    ctx.y=Math.max(colY[0],colY[1]);
  }

  // ── STAMP ALL FOOTERS ──
  arcDocStampFooters(ctx,{
    companyName:_appCtx.company?.name||"Matrix Systems",
    address:_appCtx.company?.address||"5591 Leo Park Rd \u00B7 West Jordan, UT 84081",
    phone:"(801) 930-9492",
    email:"sales@matrixpci.com"
  });
}

export async function generateQuotePdf(project: any){
  const jsPDF=await ensureJsPDF();
  const doc=new jsPDF({unit:"mm",format:"letter"});
  await buildQuotePdfDoc(doc,project);
  arcDocOpen(doc);
  // Auto-upload to BC (non-blocking)
  const bcNum=project.bcProjectNumber;
  const q=project.quote||{};
  const rev=project.quoteRev||0;
  if(bcNum&&(window as any)._bcToken){
    const quoteNum=q.number||"Quote";
    const company=(q.company||project.bcCustomerName||"Customer").replace(/[^a-zA-Z0-9&\s-]/g,"").trim();
    const projName=(project.name||"Project").replace(/[^a-zA-Z0-9&\s-]/g,"").trim();
    const fileName=`[${quoteNum} Rev ${String(rev).padStart(2,"0")}] - ${company} - ${projName}.pdf`;
    const pdfBytes=doc.output("arraybuffer");
    bcAttachPdfToJob(bcNum,fileName,pdfBytes,null).then(()=>{
      console.log("[QUOTE] PDF uploaded to BC:",fileName);
    }).catch((e: any)=>{console.warn("[QUOTE] BC upload failed:",e.message);});
  }
  return{printed:true,hash:computeBomHash(project.panels)};
}

export async function buildCoverPage(doc: any,panel: any,bcProjectNumber: string,quoteData: any,lineIdx: number,W: number,H: number,opts: any={}){
  if(!W||!H){W=431.8;H=279.4;}
  const sc=Math.min(W/431.8,H/279.4);
  const m=(v: number)=>v*sc;
  const fs=(v: number)=>Math.max(4,Math.round(v*sc*10)/10);
  const margin=m(12);

  const q=quoteData||{};
  const black: number[]=[0,0,0];
  const dark: number[]=[30,30,30];
  const mid: number[]=[80,80,80];
  const generated=new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  const scannedDate=new Date().toLocaleDateString("en-US",{month:"2-digit",day:"2-digit",year:"numeric"});
  const lineSuffix=String((lineIdx+1)*100);
  const isProduction=opts.mode==="production";
  const poNumber=opts.poNumber||"";
  const dueDate=opts.dueDate||"";
  const poReceivedDate=opts.poReceivedDate||generated;

  // ── Header bar ──
  const hdrH=m(24);
  doc.setDrawColor(...black);doc.setLineWidth(m(0.8));
  doc.rect(0,m(1),W,hdrH);
  doc.setFontSize(fs(17));doc.setFont("helvetica","bold");doc.setTextColor(...black);
  doc.text("Matrix Systems, Inc.",margin,m(16));
  doc.setFontSize(fs(12));doc.setFont("helvetica","bold");doc.setTextColor(...mid);
  doc.text(isProduction?"APPROVED TO PRODUCE":"PANEL PRODUCTION TRAVELER",W-margin,m(16),{align:"right"});

  // ── Title block ──
  const projectNum=q.projectNumber||bcProjectNumber||"\u2014";
  doc.setFontSize(fs(30));doc.setFont("helvetica","bold");doc.setTextColor(...black);
  doc.text(projectNum,margin,m(34));
  const dwgTitle=[panel.drawingNo,panel.drawingRev?"Rev "+panel.drawingRev:""].filter(Boolean).join("  \u00B7  ");
  doc.setFontSize(fs(18));doc.setFont("helvetica","bold");doc.setTextColor(...mid);
  doc.text(dwgTitle,margin,m(42));
  let descEndY=m(42);
  if(panel.drawingDesc){
    doc.setFontSize(fs(11));doc.setFont("helvetica","normal");doc.setTextColor(...mid);
    doc.text(panel.drawingDesc,margin,m(49),{maxWidth:W-margin*2});
    descEndY=m(49);
  }

  // ── Info grid: 4 columns ──
  const infoY=descEndY+m(6);
  const rowH=m(12);
  const fields: [string,string][]=isProduction?[
    ["MATRIX PROJECT #",bcProjectNumber||"\u2014"],
    ["QUOTE LINE #","Line "+(lineIdx+1)+" ("+lineSuffix+")"],
    ["DWG #",panel.drawingNo||"\u2014"],
    ["REV",panel.drawingRev||"\u2014"],
    ["PO #",poNumber||"\u2014"],
    ["PO RECEIVED",poReceivedDate],
    ["DUE DATE",dueDate||panel.requestedShipDate||"\u2014"],
    ["SALESPERSON",q.salesperson||"\u2014"],
    ["GENERATED",generated],
    ["SCANNED DATE",scannedDate],
    ["STATUS","APPROVED"],
    ["",""]
  ]:[
    ["MATRIX PROJECT #",bcProjectNumber||"\u2014"],
    ["QUOTE LINE #","Line "+(lineIdx+1)+" ("+lineSuffix+")"],
    ["DWG #",panel.drawingNo||"\u2014"],
    ["REV",panel.drawingRev||"\u2014"],
    ["REQUESTED SHIP DATE",panel.requestedShipDate||q.requestedShipDate||"\u2014"],
    ["SALESPERSON",q.salesperson||"\u2014"],
    ["GENERATED",generated],
    ["SCANNED DATE",scannedDate],
    ["STATUS",(panel.status||"draft").toUpperCase()],
  ];
  const cols=4;
  const cellW=(W-margin*2)/cols;
  fields.forEach(([lbl,val],i)=>{
    const col=i%cols;
    const row=Math.floor(i/cols);
    const x=margin+col*cellW;
    const y=infoY+row*rowH;
    doc.setDrawColor(...black);doc.setLineWidth(m(0.3));
    doc.rect(x,y-m(4),cellW-m(1),rowH-m(1));
    doc.setFontSize(fs(7));doc.setFont("helvetica","normal");doc.setTextColor(...mid);
    doc.text(lbl,x+m(2),y);
    doc.setFontSize(fs(11));doc.setFont("helvetica","bold");doc.setTextColor(...black);
    doc.text(String(val).slice(0,28),x+m(2),y+m(6));
  });

  // Divider
  const gridRows=Math.ceil(fields.length/cols);
  const divY=infoY+gridRows*rowH+m(2);
  doc.setDrawColor(...black);doc.setLineWidth(m(0.5));doc.line(margin,divY,W-margin,divY);

  // ── Labor summary ──
  const laborEst=computeLaborEstimate(panel);
  const LABOR_GROUPS=[
    {label:"CUT",   cats:new Set(["Panel Holes","Side-Mounted Components","HVAC/Fans","Side Devices"])},
    {label:"LAYOUT", cats:new Set(["Device Mounting","Duct & DIN Rail","Labels"])},
    {label:"WIRE",  cats:new Set(["Wire Time","Door Wiring"])},
  ];
  const groupHrs=LABOR_GROUPS.map(g=>({
    label:g.label,
    hrs:laborEst.lines.filter((l: any)=>g.cats.has(l.category)).reduce((s: number,l: any)=>s+l.hours,0),
  }));
  const otherHrs=laborEst.lines.filter((l: any)=>!LABOR_GROUPS.some(g=>g.cats.has(l.category))).reduce((s: number,l: any)=>s+l.hours,0);
  const laborY=divY+m(6);

  doc.setFontSize(fs(9));doc.setFont("helvetica","bold");doc.setTextColor(...black);
  doc.text("LABOR ESTIMATE",margin,laborY);

  const laborRows=[
    ...groupHrs,
    {label:"OTHER",hrs:otherHrs},
    {label:"TOTAL",hrs:laborEst.totalHours},
  ];
  const lrH=m(8);
  const lrY=laborY+m(6);
  const hrsColX=margin+m(52);
  const rowW=hrsColX-margin+m(10);

  laborRows.forEach((g,i)=>{
    const y=lrY+i*lrH;
    const isTotal=g.label==="TOTAL";
    doc.setDrawColor(...black);doc.setLineWidth(m(0.2));
    doc.rect(margin,y-m(5),rowW,lrH);
    if(isTotal){doc.setFillColor(220,220,220);doc.rect(margin,y-m(5),rowW,lrH,"F");doc.rect(margin,y-m(5),rowW,lrH);}
    doc.setFontSize(fs(isTotal?11:10));doc.setFont("helvetica",isTotal?"bold":"normal");doc.setTextColor(...black);
    doc.text(g.label,margin+m(2),y);
    doc.setFont("helvetica","bold");
    doc.text(`${Math.ceil(g.hrs)} hrs`,hrsColX,y,{align:"right"});
  });

  const laborDivY=lrY+laborRows.length*lrH+m(4);
  doc.setDrawColor(...black);doc.setLineWidth(m(0.3));doc.line(margin,laborDivY,W-margin,laborDivY);

  // ── BOM section label ──
  doc.setFontSize(fs(9));doc.setFont("helvetica","bold");doc.setTextColor(...black);
  doc.text("BILL OF MATERIALS",margin,laborDivY+m(7));
  const bom=(panel.bom||[]).filter((r: any)=>!r.isLaborRow).slice().sort((a: any,b: any)=>{
    if(!a.itemNo&&!b.itemNo)return 0;
    if(!a.itemNo)return 1;
    if(!b.itemNo)return -1;
    const an=parseFloat(a.itemNo),bn=parseFloat(b.itemNo);
    if(!isNaN(an)&&!isNaN(bn))return an-bn;
    return(a.itemNo||"").localeCompare(b.itemNo||"");
  });
  const hasCrosses=bom.some((r: any)=>r.isCrossed&&r.crossedFrom);
  doc.setFontSize(fs(8));doc.setFont("helvetica","normal");doc.setTextColor(...mid);
  doc.text(`${bom.length} items${hasCrosses?` \u00B7 ${bom.filter((r: any)=>r.isCrossed).length} crossed`:""}`,W-margin,laborDivY+m(7),{align:"right"});

  // ── BOM table ──
  const tableStart=laborDivY+m(10);
  const baseFontSize=fs(8);
  const fontSize=baseFontSize;
  const cellPad=m(1.8);

  const colStyles: any=hasCrosses?{
    0:{cellWidth:m(7),halign:"center"},
    1:{cellWidth:m(11),halign:"center"},
    2:{cellWidth:m(38)},
    3:{cellWidth:m(30)},
    4:{cellWidth:m(100)},
    5:{cellWidth:m(32)},
    6:{cellWidth:m(34)},
  }:{
    0:{cellWidth:m(8),halign:"center"},
    1:{cellWidth:m(13),halign:"center"},
    2:{cellWidth:m(42)},
    3:{cellWidth:m(110)},
    4:{cellWidth:m(36)},
    5:{cellWidth:m(38)},
  };
  const head=hasCrosses
    ?[["#","Qty","Part #","Original Part #","Description","MFR","Supplier"]]
    :[["#","Qty","Part #","Description","MFR","Supplier"]];
  const body=bom.map((r: any,i: number)=>hasCrosses
    ?[i+1,r.qty||1,r.partNumber||"\u2014",r.isCrossed?(r.crossedFrom||"\u2014"):"",r.description||"\u2014",r.manufacturer||"\u2014",r.bcVendorName||"\u2014"]
    :[i+1,r.qty||1,r.partNumber||"\u2014",r.description||"\u2014",r.manufacturer||"\u2014",r.bcVendorName||"\u2014"]
  );

  let coverPageCount=0;
  doc.autoTable({
    startY:tableStart,
    margin:{left:margin,right:margin,bottom:m(12)},
    tableWidth:"wrap",
    headStyles:{fillColor:[220,220,220],textColor:[0,0,0],fontStyle:"bold",fontSize:fontSize+m(0.5),cellPadding:cellPad,lineWidth:m(0.2),lineColor:[0,0,0]},
    bodyStyles:{fontSize,cellPadding:cellPad,lineWidth:m(0.1),lineColor:[180,180,180],textColor:[0,0,0]},
    alternateRowStyles:{fillColor:[245,245,245]},
    styles:{overflow:"ellipsize"},
    columnStyles:colStyles,
    head,
    body,
    didParseCell:(data: any)=>{
      if(hasCrosses&&data.section==="body"){
        const row=bom[data.row.index];
        if(row&&row.isCrossed){
          data.cell.styles.fontStyle="bold";
          if(data.column.index===3){data.cell.styles.fontStyle="bolditalic";}
        }
      }
    },
    didDrawPage:(data: any)=>{
      coverPageCount++;
      doc.setFontSize(fs(7.5));doc.setFont("helvetica","normal");doc.setTextColor(100,100,100);
      const ph=doc.internal.pageSize.getHeight();
      doc.text(`${panel.drawingNo||bcProjectNumber}  \u00B7  ${bom.length} items  \u00B7  ${generated}`,margin,ph-m(5));
      doc.text(`Cover ${data.pageNumber}`,W-margin,ph-m(5),{align:"right"});
    }
  });
}

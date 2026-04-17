// ─── RFQ (Request For Quote) Services ─────────────────────────────────────────
// Build supplier groups, email HTML, PDF attachments, and quote numbering.

declare const require: any;

import { _appCtx, fbDb } from '@/core/globals';
import { computeLaborEstimate } from '@/bom/laborEstimator';

// ── Stubs for BC functions not yet extracted ──
const _bcToken: string | null = null;
async function bcGetItemVendorNo(_pn: string): Promise<string> { return ''; }
async function bcGetVendorName(_no: string): Promise<string> { return ''; }

const RFQ_STALE_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

/**
 * Group BOM items by vendor for RFQ, filtering to stale/unpriced items.
 */
export async function buildRfqSupplierGroups(bom: any[]): Promise<any> {
  const now = Date.now();
  const eligible = bom.filter((r: any) => {
    if (r.isLaborRow || r.priceSource === 'manual') return false;
    const isBC = r.priceSource === 'bc' && 'bcPoDate' in r;
    const displayDate = isBC ? r.bcPoDate : r.priceDate;
    return !displayDate || displayDate < now - RFQ_STALE_MS;
  });
  if (!eligible.length) return { groups: [], noItems: true };
  const groupMap: any = {};
  for (const item of eligible) {
    let vendorName = item.bcVendorName || '';
    let vendorNo = '';
    if (!vendorName && _bcToken) {
      const pn = (item.partNumber || '').trim();
      if (pn) { vendorNo = await bcGetItemVendorNo(pn); vendorName = vendorNo ? await bcGetVendorName(vendorNo) : ''; }
    }
    if (!vendorName) vendorName = 'Unknown Supplier';
    if (!groupMap[vendorName]) groupMap[vendorName] = { vendorName, vendorNo, items: [] };
    groupMap[vendorName].items.push(item);
  }
  return { groups: Object.values(groupMap).sort((a: any, b: any) => a.vendorName.localeCompare(b.vendorName)), noItems: false };
}

/**
 * Build HTML email body for an RFQ.
 */
export function buildRfqEmailHtml(
  group: any, projectName: string, rfqNum: string, rfqDate: string,
  responseBy: string, uploadUrl: string | null = null, companyInfo: any = null
): string {
  const rows = group.items.map((item: any, i: number) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${i + 1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">${item.partNumber || '\u2014'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${item.description || '\u2014'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">${item.manufacturer || '\u2014'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:center">${item.qty || 1}</td>
      <td style="padding:6px 10px;border-bottom:1px dotted #94a3b8;text-align:right">&nbsp;</td>
      <td style="padding:6px 10px;border-bottom:1px dotted #94a3b8;text-align:center">&nbsp;</td>
    </tr>`).join('');
  const co = companyInfo || {};
  const coHeader = co.logoUrl
    ? `<img src="${co.logoUrl}" alt="Company Logo" style="max-height:52px;max-width:180px;object-fit:contain"/>`
    : `<h2 style="margin:0;color:#2563eb;font-size:22px">${co.name || 'Matrix Systems, Inc.'}</h2>`;
  const coAddr = (co.address || co.phone)
    ? `<p style="margin:4px 0 0;color:#64748b;font-size:13px">${[co.address, co.phone].filter(Boolean).join(' \u00b7 ')}</p>`
    : '';
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#1e293b;max-width:820px;margin:0 auto;padding:24px">
  <div style="font-size:22px;font-weight:900;color:#1e293b;margin-bottom:12px;letter-spacing:-0.3px">Request For Quote from</div>
  <table style="width:100%;margin-bottom:16px"><tr>
    <td>${coHeader}${coAddr}</td>
    <td style="text-align:right;vertical-align:top">
      <div style="font-size:11px;color:#64748b;letter-spacing:2px;text-transform:uppercase">Request for Quote</div>
      <div style="font-size:18px;font-weight:700;color:#1e293b">${rfqNum}</div>
    </td>
  </tr></table>
  <table style="margin-bottom:20px;font-size:13px">
    <tr><td style="padding:3px 12px 3px 0;color:#64748b">To:</td><td style="font-weight:700">${group.vendorName}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#64748b">Project:</td><td>${projectName || '\u2014'}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#64748b">RFQ Date:</td><td>${rfqDate}</td></tr>
    <tr><td style="padding:3px 12px 3px 0;color:#64748b">Response By:</td><td style="font-weight:600">${responseBy}</td></tr>
  </table>
  ${uploadUrl ? `<div style="margin-bottom:24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 20px;text-align:center">
    <div style="font-size:13px;color:#1e40af;font-weight:700;margin-bottom:6px">&#x1F4E4; Submit Your Quote Online</div>
    <div style="font-size:12px;color:#3b82f6;margin-bottom:10px">Upload your completed quote directly to our purchasing portal \u2014 no email required.</div>
    <a href="${uploadUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:6px;text-decoration:none">Upload Quote &#x2192;</a>
  </div>` : ''}

  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#f1f5f9">
      <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1">#</th>
      <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1">Part Number</th>
      <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1">Description</th>
      <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1">Manufacturer</th>
      <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #cbd5e1">Qty</th>
      <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #cbd5e1">Unit Price</th>
      <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #cbd5e1">Lead Time</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:20px;color:#475569;font-size:13px">Please reply to this email or send completed pricing to <strong>purchasing@matrixpci.com</strong></p>
  ${uploadUrl ? `<div style="margin-top:24px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px 20px;text-align:center">
    <div style="font-size:13px;color:#1e40af;font-weight:700;margin-bottom:6px">&#x1F4E4; Submit Your Quote Online</div>
    <div style="font-size:12px;color:#3b82f6;margin-bottom:12px">Upload your completed quote directly to our purchasing portal \u2014 no email required.</div>
    <a href="${uploadUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;font-weight:700;font-size:13px;padding:10px 24px;border-radius:6px;text-decoration:none">Upload Quote &#x2192;</a>
    <div style="font-size:11px;color:#93c5fd;margin-top:8px">Link valid for 30 days</div>
  </div>` : ''}
  </body></html>`;
}

/**
 * Build RFQ PDF attachment via jsPDF.
 */
export async function buildRfqPdf(
  group: any, projectName: string, rfqNum: string, rfqDate: string,
  responseBy: string, companyInfo: any = null
): Promise<string> {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ format: 'letter', unit: 'mm' });
  const W = doc.internal.pageSize.getWidth();
  const co = companyInfo || {};
  // Header — company name/logo
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text('Request For Quote from', 14, 12);
  if (co.logoUrl) {
    try {
      const imgData: string = await new Promise((res: any, rej: any) => {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d')!.drawImage(img, 0, 0); res(c.toDataURL('image/png')); };
        img.onerror = rej; img.src = co.logoUrl;
      });
      const logoH = 14; const logoW = logoH * 3;
      doc.addImage(imgData, 'PNG', 14, 17, Math.min(logoW, 60), logoH);
    } catch (e) { doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235); doc.text(co.name || 'Company', 14, 19); }
  } else {
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(37, 99, 235);
    doc.text(co.name || 'Matrix Systems, Inc.', 14, 19);
  }
  if (co.address || co.phone) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text([co.address, co.phone].filter(Boolean).join('  \u00b7  '), 14, 26);
  }
  // RFQ label — right
  doc.setFontSize(9); doc.setTextColor(100, 116, 139);
  doc.text('REQUEST FOR QUOTE', W - 14, 18, { align: 'right' });
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59);
  doc.text(rfqNum, W - 14, 25, { align: 'right' });
  // Divider
  doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.3); doc.line(14, 29, W - 14, 29);
  // Info block
  const iy = 36; doc.setFontSize(10);
  const infoRows: [string, string][] = [['To:', group.vendorName], ['Project:', projectName || '\u2014'], ['RFQ Date:', rfqDate], ['Response By:', responseBy]];
  infoRows.forEach(([lbl, val], i) => {
    doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139); doc.text(lbl, 14, iy + i * 6);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 41, 59); doc.text(val, 42, iy + i * 6);
  });
  // Items table
  doc.autoTable({
    startY: iy + infoRows.length * 6 + 4,
    head: [['#', 'Part Number', 'Description', 'Manufacturer', 'Qty', 'Unit Price', 'Lead Time']],
    body: group.items.map((item: any, i: number) => [i + 1, item.partNumber || '\u2014', item.description || '\u2014', item.manufacturer || '\u2014', item.qty || 1, '', '']),
    styles: { fontSize: 9, cellPadding: 2.5, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold', lineColor: [203, 213, 225], lineWidth: 0.3 },
    columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 32, fontStyle: 'bold' }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 34 }, 4: { cellWidth: 12, halign: 'center' }, 5: { cellWidth: 24, halign: 'right' }, 6: { cellWidth: 22, halign: 'center' } },
    theme: 'grid', tableLineColor: [203, 213, 225], tableLineWidth: 0.3
  });
  // Footer
  const fy = doc.lastAutoTable.finalY || 180;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text('Please return completed RFQ to purchasing@matrixpci.com', 14, fy + 10);
  doc.setDrawColor(226, 232, 240); doc.line(14, doc.internal.pageSize.getHeight() - 16, W - 14, doc.internal.pageSize.getHeight() - 16);
  doc.setFontSize(8); doc.text(`${rfqNum}  \u00b7  ${projectName || ''}  \u00b7  ${co.name || 'Matrix Systems, Inc.'}  \u00b7  Confidential`, 14, doc.internal.pageSize.getHeight() - 10);
  return doc.output('datauristring').split(',')[1];
}

/**
 * Build a PDF cover page (panel production traveler) using jsPDF.
 */
export async function buildCoverPage(
  doc: any, panel: any, bcProjectNumber: string, quoteData: any,
  lineIdx: number, W: number, H: number
): Promise<void> {
  if (!W || !H) { W = 431.8; H = 279.4; }
  const sc = Math.min(W / 431.8, H / 279.4);
  const m = (v: number) => v * sc;
  const fs = (v: number) => Math.max(4, Math.round(v * sc * 10) / 10);
  const margin = m(12);

  const q = quoteData || {};
  const accent = [30, 64, 175];
  const dark = [15, 23, 42];
  const mid = [71, 85, 105];
  const light = [241, 245, 249];
  const orange = [234, 88, 12];
  const generated = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Header bar
  const hdrH = m(24);
  doc.setFillColor(...accent); doc.rect(0, 0, W, hdrH, 'F');
  doc.setFontSize(fs(17)); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('Matrix Systems, Inc.', margin, m(16));
  doc.setFontSize(fs(12)); doc.setFont('helvetica', 'normal');
  doc.text('PANEL PRODUCTION TRAVELER', W - margin, m(16), { align: 'right' });

  // Title block
  const projectNum = q.projectNumber || bcProjectNumber || '\u2014';
  doc.setFontSize(fs(30)); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
  doc.text(projectNum, margin, m(32));
  const dwgTitle = [panel.drawingNo, panel.drawingRev ? 'Rev ' + panel.drawingRev : ''].filter(Boolean).join('  \u00b7  ');
  doc.setFontSize(fs(18)); doc.setFont('helvetica', 'bold'); doc.setTextColor(...mid);
  doc.text(dwgTitle, margin, m(40));
  let descEndY = m(40);
  if (panel.drawingDesc) {
    doc.setFontSize(fs(11)); doc.setFont('helvetica', 'normal'); doc.setTextColor(...mid);
    doc.text(panel.drawingDesc, margin, m(47), { maxWidth: W - margin * 2 });
    descEndY = m(47);
  }

  // Info grid: 4 columns
  const infoY = descEndY + m(6);
  const rowH = m(12);
  const fields: [string, string][] = [
    ['BC JOB #', bcProjectNumber || '\u2014'],
    ['LINE #', 'Line ' + (lineIdx + 1)],
    ['DWG #', panel.drawingNo || '\u2014'],
    ['REV', panel.drawingRev || '\u2014'],
    ['SHIP DATE', panel.requestedShipDate || q.requestedShipDate || '\u2014'],
    ['SALESPERSON', q.salesperson || '\u2014'],
    ['GENERATED', generated],
    ['STATUS', (panel.status || 'draft').toUpperCase()],
  ];
  const cols = 4;
  const cellW = (W - margin * 2) / cols;
  fields.forEach(([lbl, val], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = margin + col * cellW;
    const y = infoY + row * rowH;
    if (row % 2 === 0) { doc.setFillColor(...light); doc.rect(x, y - m(4), cellW - m(1), rowH - m(1), 'F'); }
    doc.setFontSize(fs(8)); doc.setFont('helvetica', 'normal'); doc.setTextColor(...mid);
    doc.text(lbl, x + m(2), y);
    doc.setFontSize(fs(11)); doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark);
    doc.text(String(val).slice(0, 28), x + m(2), y + m(6));
  });

  // Divider
  const gridRows = Math.ceil(fields.length / cols);
  const divY = infoY + gridRows * rowH + m(2);
  doc.setDrawColor(...accent); doc.setLineWidth(m(0.5)); doc.line(margin, divY, W - margin, divY);

  // Labor summary
  const laborEst = computeLaborEstimate(panel);
  const LABOR_GROUPS = [
    { label: 'CUT', color: [249, 115, 22], cats: new Set(['Panel Holes', 'Side-Mounted Components', 'HVAC/Fans', 'Side Devices']) },
    { label: 'LAYOUT', color: [167, 139, 250], cats: new Set(['Device Mounting', 'Duct & DIN Rail', 'Labels']) },
    { label: 'WIRE', color: [56, 189, 248], cats: new Set(['Wire Time', 'Door Wiring']) },
  ];
  const groupHrs = LABOR_GROUPS.map(g => ({
    label: g.label, color: g.color,
    hrs: laborEst.lines.filter((l: any) => g.cats.has(l.category)).reduce((s: number, l: any) => s + l.hours, 0),
  }));
  const otherHrs = laborEst.lines.filter((l: any) => !LABOR_GROUPS.some(g => g.cats.has(l.category))).reduce((s: number, l: any) => s + l.hours, 0);
  const laborY = divY + m(8);

  doc.setFontSize(fs(9)); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent);
  doc.text('LABOR ESTIMATE', margin, laborY);
  doc.setDrawColor(...accent); doc.setLineWidth(m(0.3)); doc.line(margin, laborY + m(2), margin + m(55), laborY + m(2));

  const laborRows = [
    ...groupHrs,
    { label: 'OTHER', color: mid, hrs: otherHrs },
    { label: 'TOTAL', color: accent, hrs: laborEst.totalHours },
  ];
  const lrH = m(9);
  const lrY = laborY + m(5);
  const barW = m(2.5);
  const hrsColX = margin + m(52);
  const rowW = hrsColX - margin + m(10);

  laborRows.forEach((g: any, i: number) => {
    const y = lrY + i * lrH;
    const isTotal = g.label === 'TOTAL';
    if (isTotal) { doc.setFillColor(30, 64, 175); doc.rect(margin, y - m(6), rowW, lrH, 'F'); }
    else if (i % 2 === 0) { doc.setFillColor(...light); doc.rect(margin, y - m(6), rowW, lrH, 'F'); }
    if (!isTotal) { doc.setFillColor(...g.color); doc.rect(margin, y - m(6), barW, lrH, 'F'); }
    doc.setFontSize(fs(isTotal ? 11 : 10)); doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
    if (isTotal) { doc.setTextColor(255, 255, 255); } else { doc.setTextColor(...g.color); }
    doc.text(g.label, margin + barW + m(2), y);
    doc.setFont('helvetica', 'bold');
    if (isTotal) { doc.setTextColor(255, 255, 255); } else { doc.setTextColor(...dark); }
    doc.text(`${Math.ceil(g.hrs)} hrs`, hrsColX, y, { align: 'right' });
  });

  const laborDivY = lrY + laborRows.length * lrH + m(5);
  doc.setDrawColor(...accent); doc.setLineWidth(m(0.3)); doc.line(margin, laborDivY, W - margin, laborDivY);

  // BOM section label
  doc.setFontSize(fs(9)); doc.setFont('helvetica', 'bold'); doc.setTextColor(...accent);
  doc.text('BILL OF MATERIALS', margin, laborDivY + m(7));
  const bom = (panel.bom || []).filter((r: any) => !r.isLaborRow).slice().sort((a: any, b: any) => {
    if (!a.itemNo && !b.itemNo) return 0;
    if (!a.itemNo) return 1;
    if (!b.itemNo) return -1;
    const an = parseFloat(a.itemNo), bn = parseFloat(b.itemNo);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return (a.itemNo || '').localeCompare(b.itemNo || '');
  });
  const hasCrosses = bom.some((r: any) => r.isCrossed && r.crossedFrom);
  doc.setFontSize(fs(8)); doc.setFont('helvetica', 'normal'); doc.setTextColor(...mid);
  doc.text(`${bom.length} items${hasCrosses ? ` \u00b7 ${bom.filter((r: any) => r.isCrossed).length} crossed` : ''}`, W - margin, laborDivY + m(7), { align: 'right' });

  // BOM table
  const tableStart = laborDivY + m(10);
  const baseFontSize = fs(8);
  const fontSize = baseFontSize;
  const cellPad = m(1.8);

  const colStyles: any = hasCrosses ? {
    0: { cellWidth: m(7), halign: 'center' },
    1: { cellWidth: m(11), halign: 'center' },
    2: { cellWidth: m(38) },
    3: { cellWidth: m(30) },
    4: { cellWidth: m(100) },
    5: { cellWidth: m(32) },
    6: { cellWidth: m(34) },
  } : {
    0: { cellWidth: m(8), halign: 'center' },
    1: { cellWidth: m(13), halign: 'center' },
    2: { cellWidth: m(42) },
    3: { cellWidth: m(110) },
    4: { cellWidth: m(36) },
    5: { cellWidth: m(38) },
  };
  const head = hasCrosses
    ? [['#', 'Qty', 'Part #', 'Original Part #', 'Description', 'MFR', 'Supplier']]
    : [['#', 'Qty', 'Part #', 'Description', 'MFR', 'Supplier']];
  const body = bom.map((r: any, i: number) => hasCrosses
    ? [i + 1, r.qty || 1, r.partNumber || '\u2014', r.isCrossed ? (r.crossedFrom || '\u2014') : '', r.description || '\u2014', r.manufacturer || '\u2014', r.bcVendorName || '\u2014']
    : [i + 1, r.qty || 1, r.partNumber || '\u2014', r.description || '\u2014', r.manufacturer || '\u2014', r.bcVendorName || '\u2014']
  );

  let _coverPageCount = 0;
  doc.autoTable({
    startY: tableStart,
    margin: { left: margin, right: margin, bottom: m(12) },
    tableWidth: 'wrap',
    headStyles: { fillColor: accent, textColor: 255, fontStyle: 'bold', fontSize: fontSize + m(0.5), cellPadding: cellPad },
    bodyStyles: { fontSize, cellPadding: cellPad },
    alternateRowStyles: { fillColor: light },
    styles: { overflow: 'ellipsize' },
    columnStyles: colStyles,
    head,
    body,
    didParseCell: (data: any) => {
      if (hasCrosses && data.section === 'body') {
        const row = bom[data.row.index];
        if (row && row.isCrossed) {
          if (data.column.index === 2) { data.cell.styles.textColor = accent; }
          if (data.column.index === 3) { data.cell.styles.textColor = orange; data.cell.styles.fontStyle = 'italic'; }
        }
      }
    },
    didDrawPage: (data: any) => {
      _coverPageCount++;
      doc.setFontSize(fs(7.5)); doc.setFont('helvetica', 'normal'); doc.setTextColor(...mid);
      const ph = doc.internal.pageSize.getHeight();
      doc.text(`${panel.drawingNo || bcProjectNumber}  \u00b7  ${bom.length} items  \u00b7  ${generated}`, margin, ph - m(5));
      doc.text(`Cover ${data.pageNumber}`, W - margin, ph - m(5), { align: 'right' });
    }
  });
}

/**
 * Get next sequential quote number from Firestore (atomic increment).
 */
export async function getNextQuoteNumber(uid: string): Promise<string> {
  const path = (_appCtx.configPath || `users/${uid}/config`) + '/quoteCounter';
  const ref = fbDb.doc(path);
  const num = await fbDb.runTransaction(async (tx: any) => {
    const doc = await tx.get(ref);
    const stored = doc.exists ? (doc.data().next || 0) : 0;
    const next = Math.max(stored, 202000);
    tx.set(ref, { next: next + 1 });
    return next;
  });
  return 'MTX-Q' + String(num);
}

// ── Internal: load jsPDF ──

let _jsPdfReady = false;
async function ensureJsPDF(): Promise<any> {
  if (_jsPdfReady && (window as any).jspdf) return (window as any).jspdf.jsPDF;
  if (!(window as any).jspdf) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  if (!(window as any).jspdf?.jsPDF?.prototype?.autoTable) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  _jsPdfReady = true;
  return (window as any).jspdf.jsPDF;
}

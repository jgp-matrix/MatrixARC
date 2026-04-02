// ─── RFQ Email & PDF Builder ────────────────────────────────────────────────
// Extracted from monolith index.html lines ~2724-3648.
// Builds supplier groups, email HTML, PDF attachments for RFQ workflow.

import { CONTINGENCY_PNS, RFQ_STALE_MS, RFQ_SENT_COOLDOWN } from '@/core/constants';

declare const require: any;
let _globals: any = null;
function globals() { if (!_globals) _globals = require('@/core/globals'); return _globals; }

// ── Stubs for BC functions not yet extracted ──
async function bcGetItemVendorNo(pn: string): Promise<string> { return ''; }
async function bcGetVendorName(no: string): Promise<string> { return ''; }

// ── Internal: load jsPDF dynamically ──

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

// ── RFQ Exclusion Patterns ──────────────────────────────────────────────────

const RFQ_EXCLUDE_ITEMS = /job\s*buy.?off|crating|^crate$/i;
const RFQ_EXCLUDE_VENDORS = /^matrix\s*systems|crate|job\s*buyoff|job\s*buy.?off/i;

// ── Exported Functions ──────────────────────────────────────────────────────

/**
 * Group BOM items by vendor for RFQ, filtering to stale/unpriced items.
 * Matches monolith version with CONTINGENCY_PNS filtering.
 */
export async function buildRfqSupplierGroups(bom: any[]): Promise<{ groups: any[]; noItems: boolean }> {
  const now = Date.now();
  const bcToken = globals()._bcToken;

  const eligible = bom.filter((r: any) => {
    if (r.isLaborRow || r.priceSource === 'manual') return false;
    // Exclude contingency items
    if (r.isContingency || CONTINGENCY_PNS.has((r.partNumber || '').trim().toUpperCase())) return false;
    // Exclude items whose description matches non-RFQ categories
    if (RFQ_EXCLUDE_ITEMS.test(r.description || '') || RFQ_EXCLUDE_ITEMS.test(r.partNumber || '')) return false;
    // Exclude items with a recent RFQ sent (within cooldown period)
    if (r.rfqSentDate && (now - r.rfqSentDate) < RFQ_SENT_COOLDOWN) return false;
    // Include zero-cost items regardless of date
    if (!r.unitPrice || r.unitPrice === 0) return true;
    // Use the same date shown in the Priced column
    const isBC = r.priceSource === 'bc' && 'bcPoDate' in r;
    const displayDate = isBC ? r.bcPoDate : r.priceDate;
    // Include if no date (No POs / never priced) OR if older than 60 days
    return !displayDate || displayDate < now - RFQ_STALE_MS;
  });
  if (!eligible.length) return { groups: [], noItems: true };

  // Group by vendor
  const groupMap: Record<string, any> = {};
  for (const item of eligible) {
    let vendorName = item.bcVendorName || '';
    let vendorNo = '';
    if (!vendorName && bcToken) {
      const pn = (item.partNumber || '').trim();
      if (pn) { vendorNo = await bcGetItemVendorNo(pn); vendorName = vendorNo ? await bcGetVendorName(vendorNo) : ''; }
    }
    if (!vendorName) vendorName = 'Unknown Supplier';
    if (!groupMap[vendorName]) groupMap[vendorName] = { vendorName, vendorNo, items: [] };
    groupMap[vendorName].items.push(item);
  }
  const filtered = (Object.values(groupMap) as any[]).filter((g: any) => !RFQ_EXCLUDE_VENDORS.test(g.vendorName));
  return { groups: filtered.sort((a: any, b: any) => a.vendorName.localeCompare(b.vendorName)), noItems: !filtered.length };
}

/**
 * Derives a 3-letter supplier code from the vendor name.
 * Single word -> first 3 letters (Royal->ROY).
 * Two words -> first 2 of word1 + first of word2 (Allen Bradley->ALB).
 * 3+ words -> first letter of each of first 3 words (Automation Direct Inc->ADI).
 */
export function vendorCode(vendorName: string): string {
  const skip = /^(inc|llc|corp|co|ltd|the|and|&)$/i;
  const words = (vendorName || '').trim().split(/[\s\-,&]+/).filter((w: string) => w.length > 0 && !skip.test(w));
  if (words.length === 0) return 'SUP';
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase().padEnd(3, 'X');
  if (words.length === 2) return (words[0].slice(0, 2) + words[1].slice(0, 1)).toUpperCase().padEnd(3, 'X');
  return words.slice(0, 3).map((w: string) => w[0]).join('').toUpperCase();
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
 * Returns base64-encoded PDF content.
 */
export async function buildRfqPdf(
  group: any, projectName: string, rfqNum: string, rfqDate: string,
  responseBy: string, companyInfo: any = null
): Promise<string> {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ format: 'letter', unit: 'mm' });
  const W = doc.internal.pageSize.getWidth();
  const co = companyInfo || {};

  // Header -- company name/logo
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
  // RFQ label -- right
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
    theme: 'grid', tableLineColor: [203, 213, 225], tableLineWidth: 0.3,
  });
  // Footer
  const fy = doc.lastAutoTable.finalY || 180;
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
  doc.text('Please return completed RFQ to purchasing@matrixpci.com', 14, fy + 10);
  doc.setDrawColor(226, 232, 240); doc.line(14, doc.internal.pageSize.getHeight() - 16, W - 14, doc.internal.pageSize.getHeight() - 16);
  doc.setFontSize(8); doc.text(`${rfqNum}  \u00b7  ${projectName || ''}  \u00b7  ${co.name || 'Matrix Systems, Inc.'}  \u00b7  Confidential`, 14, doc.internal.pageSize.getHeight() - 10);
  return doc.output('datauristring').split(',')[1];
}

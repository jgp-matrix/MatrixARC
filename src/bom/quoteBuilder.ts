// ─── Quote Builder ───────────────────────────────────────────────────────────
// Cost rollup, markup calculation, budgetary and formal quotes.

import type { Panel, PanelExport, ExportBomItem, LaborBreakdown, BomRow } from '@/core/types';
import { PRICING_DEFAULTS } from '@/core/constants';

/**
 * Compute the total material cost for a panel's BOM.
 */
export function computeMaterialCost(bom: BomRow[]): number {
  return bom.reduce((sum, row) => {
    if (row.isLaborRow || row.isCrossed) return sum;
    return sum + (row.unitPrice || 0) * (row.qty || 0);
  }, 0);
}

/**
 * Compute labor hours from labor data or wire count.
 */
export function computeLaborHours(panel: Panel): number {
  if (panel.pricing?.laborHoursOverride) return panel.pricing.laborHoursOverride;
  if (panel.laborData) {
    // Sum all accepted labor categories
    // This is a simplified version — the full implementation in the monolith
    // has detailed category-by-category computation
    const wireCount = panel.laborData.counts?.wireCount || 0;
    return Math.ceil(wireCount / 10); // simplified
  }
  const wireCount = panel.validation?.wireCount || 0;
  return Math.ceil(wireCount / 10); // fallback
}

/**
 * Compute the sell price for a panel.
 */
export function computePanelSellPrice(panel: Panel): number {
  const bom = panel.bom || [];
  const pricing = panel.pricing || {};
  const laborRate = pricing.laborRate || PRICING_DEFAULTS.laborRate;
  const contingencyBOM = pricing.contingencyBOM ?? PRICING_DEFAULTS.contingencyBOM;
  const contingencyConsumables = pricing.contingencyConsumables ?? PRICING_DEFAULTS.contingencyConsumables;

  const materialCost = computeMaterialCost(bom);
  const laborHours = computeLaborHours(panel);
  const laborCost = laborHours * laborRate;
  const grandTotal = materialCost + laborCost + contingencyBOM + contingencyConsumables;

  // Markup not applied here — sell price IS grand total for planning lines
  return grandTotal;
}

/**
 * Build a PanelExport for the BC sync layer.
 */
export function buildPanelExport(panel: Panel, panelIndex: number): PanelExport {
  const items: ExportBomItem[] = (panel.bom || [])
    .filter(r => !r.isLaborRow && !r.isCrossed)
    .map(r => ({
      partNumber: r.partNumber || '',
      description: r.description || '',
      manufacturer: r.manufacturer || '',
      quantity: r.qty || 1,
      unitPrice: r.unitPrice,
      priceSource: r.priceSource,
      uom: 'EA', // default; could be enhanced
    }));

  const wireCount = panel.validation?.wireCount || panel.laborData?.counts?.wireCount || 0;
  const laborHours = computeLaborHours(panel);

  const labor: LaborBreakdown = {
    engineering: 0, // TODO: extract from laborData if available
    cut: 0,
    layout: 0,
    wire: laborHours,
    totalHours: laborHours,
    wireCount,
  };

  return {
    panelName: panel.name || `Panel ${panelIndex + 1}`,
    panelIndex,
    lineQty: panel.lineQty || 1,
    sellPrice: computePanelSellPrice(panel),
    items,
    labor,
  };
}

/**
 * Export BOM as CSV string.
 */
export function exportBomCsv(bom: BomRow[], projectName: string): string {
  const header = 'Qty,Part Number,Description,Manufacturer,Notes';
  const rows = bom
    .filter(r => !r.isLaborRow && !r.isCrossed)
    .map(r => {
      const escape = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
      return `${r.qty || 1},${escape(r.partNumber)},${escape(r.description)},${escape(r.manufacturer)},${escape(r.notes)}`;
    });
  return [header, ...rows].join('\n');
}

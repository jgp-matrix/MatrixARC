import { describe, it, expect } from 'vitest';
import { computeMaterialCost, computeLaborHours, computePanelSellPrice, exportBomCsv, buildPanelExport } from '@/bom/quoteBuilder';
import type { BomRow, Panel } from '@/core/types';
import { PRICING_DEFAULTS } from '@/core/constants';

function row(overrides: Partial<BomRow> = {}): BomRow {
  return {
    id: 'r1', partNumber: '', description: '', manufacturer: '',
    qty: 1, unitPrice: null, priceSource: null, notes: '',
    ...overrides,
  };
}

function panel(overrides: Partial<Panel> = {}): Panel {
  return {
    id: 'p1', name: 'Test Panel', pages: [], bom: [],
    validation: null, pricing: null, status: 'draft',
    ...overrides,
  };
}

// ─── computeMaterialCost ─────────────────────────────────────────────────────

describe('computeMaterialCost', () => {
  it('sums unitPrice * qty for all rows', () => {
    const bom = [
      row({ unitPrice: 10, qty: 5 }),
      row({ unitPrice: 25.50, qty: 2 }),
    ];
    expect(computeMaterialCost(bom)).toBe(101); // 50 + 51
  });

  it('treats null unitPrice as 0', () => {
    const bom = [
      row({ unitPrice: null, qty: 5 }),
      row({ unitPrice: 10, qty: 2 }),
    ];
    expect(computeMaterialCost(bom)).toBe(20);
  });

  it('skips labor rows', () => {
    const bom = [
      row({ unitPrice: 100, qty: 1 }),
      row({ unitPrice: 45, qty: 8, isLaborRow: true }),
    ];
    expect(computeMaterialCost(bom)).toBe(100);
  });

  it('skips crossed-out rows', () => {
    const bom = [
      row({ unitPrice: 100, qty: 1 }),
      row({ unitPrice: 200, qty: 1, isCrossed: true }),
    ];
    expect(computeMaterialCost(bom)).toBe(100);
  });

  it('returns 0 for empty BOM', () => {
    expect(computeMaterialCost([])).toBe(0);
  });

  it('handles qty of 0', () => {
    const bom = [row({ unitPrice: 100, qty: 0 })];
    expect(computeMaterialCost(bom)).toBe(0);
  });
});

// ─── computeLaborHours ───────────────────────────────────────────────────────

describe('computeLaborHours', () => {
  it('uses laborHoursOverride when set', () => {
    const p = panel({ pricing: { laborHoursOverride: 40 } });
    expect(computeLaborHours(p)).toBe(40);
  });

  it('computes from laborData wireCount', () => {
    const p = panel({
      laborData: {
        counts: { wireCount: 50, wireTerminations: 0, doorDevices: 0, allDevices: 0, panelHoles: 0, ductDinFeet: 0, sideTopSmallCount: 0, sideTopLargeCount: 0, squareCutoutCount: 0, sideDeviceHours: 0, sideDeviceCount: 0 },
        overrides: {},
        defaults: { pmUnits: 2, buyoffUnits: 2, cratingUnits: 1, labelHours: 4 },
        hasLayoutData: false,
      },
    });
    expect(computeLaborHours(p)).toBe(5); // ceil(50/10)
  });

  it('falls back to validation wireCount', () => {
    const p = panel({
      validation: {
        runAt: 0, schematicTags: [], wireCount: 30,
        matched: [], missingFromSchematic: [], notTraceable: [],
        unaccountedTags: [], confidence: 'medium',
      },
    });
    expect(computeLaborHours(p)).toBe(3); // ceil(30/10)
  });

  it('returns 0 when no data available', () => {
    expect(computeLaborHours(panel())).toBe(0); // ceil(0/10) = 0
  });
});

// ─── computePanelSellPrice ───────────────────────────────────────────────────

describe('computePanelSellPrice', () => {
  it('computes grand total with defaults', () => {
    const p = panel({
      bom: [row({ unitPrice: 1000, qty: 1 })],
      validation: { runAt: 0, schematicTags: [], wireCount: 100, matched: [], missingFromSchematic: [], notTraceable: [], unaccountedTags: [], confidence: 'high' },
    });
    // material: 1000
    // labor: ceil(100/10) * 45 = 10 * 45 = 450
    // contingencyBOM: 1500 (default)
    // contingencyConsumables: 400 (default)
    // total: 1000 + 450 + 1500 + 400 = 3350
    expect(computePanelSellPrice(p)).toBe(3350);
  });

  it('uses custom pricing overrides', () => {
    const p = panel({
      bom: [row({ unitPrice: 500, qty: 2 })],
      pricing: {
        laborRate: 60,
        laborHoursOverride: 20,
        contingencyBOM: 1000,
        contingencyConsumables: 200,
      },
    });
    // material: 500 * 2 = 1000
    // labor: 20 * 60 = 1200
    // contingencyBOM: 1000
    // contingencyConsumables: 200
    // total: 1000 + 1200 + 1000 + 200 = 3400
    expect(computePanelSellPrice(p)).toBe(3400);
  });

  it('returns contingencies only for empty BOM with no wire count', () => {
    const p = panel();
    // material: 0, labor: 0, contingencyBOM: 1500, contingencyConsumables: 400
    expect(computePanelSellPrice(p)).toBe(1900);
  });
});

// ─── exportBomCsv ────────────────────────────────────────────────────────────

describe('exportBomCsv', () => {
  it('generates CSV with header and rows', () => {
    const bom = [
      row({ partNumber: 'AF09-30', description: 'Contactor', manufacturer: 'ABB', qty: 2, notes: 'M1' }),
    ];
    const csv = exportBomCsv(bom, 'Test Project');
    const lines = csv.split('\n');

    expect(lines[0]).toBe('Qty,Part Number,Description,Manufacturer,Notes');
    expect(lines[1]).toBe('2,"AF09-30","Contactor","ABB","M1"');
  });

  it('escapes double quotes in CSV values', () => {
    const bom = [
      row({ partNumber: 'TEST-"001"', description: 'A "special" part', manufacturer: 'MFG', qty: 1, notes: '' }),
    ];
    const csv = exportBomCsv(bom, 'Test');
    const lines = csv.split('\n');

    expect(lines[1]).toContain('"TEST-""001"""');
    expect(lines[1]).toContain('"A ""special"" part"');
  });

  it('skips labor rows and crossed rows', () => {
    const bom = [
      row({ partNumber: 'GOOD', qty: 1 }),
      row({ partNumber: 'LABOR', qty: 8, isLaborRow: true }),
      row({ partNumber: 'OLD', qty: 2, isCrossed: true }),
    ];
    const csv = exportBomCsv(bom, 'Test');
    const lines = csv.split('\n');

    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[1]).toContain('GOOD');
  });

  it('returns header only for empty BOM', () => {
    const csv = exportBomCsv([], 'Test');
    expect(csv).toBe('Qty,Part Number,Description,Manufacturer,Notes');
  });

  it('defaults qty to 1 when qty is 0 or undefined', () => {
    const bom = [row({ partNumber: 'X', qty: 0 })];
    const csv = exportBomCsv(bom, 'Test');
    expect(csv.split('\n')[1].startsWith('1,')).toBe(true);
  });
});

// ─── buildPanelExport ────────────────────────────────────────────────────────

describe('buildPanelExport', () => {
  it('builds export with correct structure', () => {
    const p = panel({
      name: 'MCC-1',
      bom: [
        row({ partNumber: 'AF09-30', description: 'Contactor', manufacturer: 'ABB', qty: 2, unitPrice: 50, priceSource: 'bc' }),
        row({ partNumber: 'LABOR', isLaborRow: true, qty: 8 }),
      ],
      lineQty: 3,
      validation: { runAt: 0, schematicTags: [], wireCount: 20, matched: [], missingFromSchematic: [], notTraceable: [], unaccountedTags: [], confidence: 'high' },
    });

    const exp = buildPanelExport(p, 0);

    expect(exp.panelName).toBe('MCC-1');
    expect(exp.panelIndex).toBe(0);
    expect(exp.lineQty).toBe(3);
    expect(exp.items).toHaveLength(1); // labor row excluded
    expect(exp.items[0].partNumber).toBe('AF09-30');
    expect(exp.items[0].quantity).toBe(2);
    expect(exp.items[0].uom).toBe('EA');
    expect(exp.labor.wireCount).toBe(20);
    expect(exp.labor.totalHours).toBe(2); // ceil(20/10)
    expect(exp.sellPrice).toBeGreaterThan(0);
  });

  it('uses default panel name when name is empty', () => {
    const p = panel({ name: '' });
    const exp = buildPanelExport(p, 2);
    expect(exp.panelName).toBe('Panel 3');
  });

  it('defaults lineQty to 1', () => {
    const p = panel();
    const exp = buildPanelExport(p, 0);
    expect(exp.lineQty).toBe(1);
  });
});

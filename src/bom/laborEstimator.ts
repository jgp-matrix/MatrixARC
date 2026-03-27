// ─── Labor Estimation ────────────────────────────────────────────────────────
// Central labor hour calculation from wire counts and device counts.

import type { Panel, LaborEstimateLine } from '@/core/types';

// ─── Labor Rate Defaults ────────────────────────────────────────────────────

export const LABOR_RATE_DEFAULTS: Record<string, number> = {
  pmMinPerUnit: 60,            // Project management: 60 min/session
  buyoffMinPerUnit: 60,        // Buyoff/QC: 60 min/session
  cratingMinPerUnit: 60,       // Crating: 60 min/crate
  wireMinPerPoint: 10,         // Per wire point: 10 min
  doorDeviceMinPerDevice: 11,  // Door-mounted device wiring: 11 min
  mountingMinPerDevice: 4,     // Device mounting: 4 min
  ductDinMinPerFoot: 10,       // Duct & DIN rail: 10 min/ft
  holesMinPerHole: 15,         // Panel holes: 15 min/hole
  hmiHoleEquivalent: 25,       // 1 HMI cutout = 25 standard holes
  squareCutoutMinPerCut: 180,  // Square side cutout (horn, etc.): 3 hrs each
};

// Mutable copy of labor rates (can be overridden by config)
let LABOR_RATES: Record<string, number> = { ...LABOR_RATE_DEFAULTS };

export function setLaborRates(rates: Record<string, number>) {
  LABOR_RATES = { ...LABOR_RATE_DEFAULTS, ...rates };
}

export function getLaborRates(): Record<string, number> {
  return { ...LABOR_RATES };
}

// ─── Labor BOM Group Mapping ────────────────────────────────────────────────

export const LABOR_BOM_GROUPS = [
  { partNumber: '1012', description: 'CUT', cats: ['Panel Holes', 'Side-Mounted Components'] },
  { partNumber: '1013', description: 'LAYOUT', cats: ['Device Mounting', 'Duct & DIN Rail', 'Labels'] },
  { partNumber: '1014', description: 'WIRE', cats: ['Wire Time', 'Door Wiring'] },
];

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LaborEstimate {
  lines: LaborEstimateLine[];
  totalCost: number;
  totalHours: number;
  inputs: Record<string, number>;
  hasLayoutData: boolean;
  isLegacy: boolean;
  isOverride: boolean;
}

// ─── Fallback Labor Hours ───────────────────────────────────────────────────

/**
 * Fallback labor hour calculation when no detailed labor data is available.
 * Uses only wire count with a simple averaging formula.
 */
export function computeFallbackLaborHours(wireCount: number): number {
  if (!wireCount) return 0;
  return Math.round((Math.ceil(wireCount / 12) + Math.ceil(wireCount / 8)) / 2);
}

// ─── Main Labor Estimate ────────────────────────────────────────────────────

/**
 * Compute full labor estimate from panel data.
 * Handles three modes: override, legacy fallback, and full estimation.
 */
export function computeLaborEstimate(panel: Panel): LaborEstimate {
  const pr = panel.pricing || {} as any;
  const laborRate = pr.laborRate ?? 45;
  const ld = panel.laborData || null;
  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Total override: laborHoursOverride bypasses everything
  if ((pr.laborHoursOverride ?? null) !== null) {
    const hrs = pr.laborHoursOverride;
    const cost = hrs * laborRate;
    return {
      lines: [{ category: 'Total Override', qty: hrs, unit: 'hr', hours: hrs, cost }],
      totalCost: cost, totalHours: hrs, inputs: {},
      hasLayoutData: false, isLegacy: false, isOverride: true,
    };
  }

  // Legacy fallback: no laborData
  if (!ld) {
    const wireCount = panel.validation?.wireCount || 0;
    if (!wireCount) {
      return { lines: [], totalCost: 0, totalHours: 0, inputs: {}, hasLayoutData: false, isLegacy: true, isOverride: false };
    }
    const hrs = computeFallbackLaborHours(wireCount);
    const cost = hrs * laborRate;
    return {
      lines: [{ category: 'Wire Time (legacy)', qty: wireCount, unit: 'wires', hours: hrs, cost }],
      totalCost: cost, totalHours: hrs, inputs: { wireCount },
      hasLayoutData: false, isLegacy: true, isOverride: false,
    };
  }

  // Full labor estimation from laborData
  const counts = ld.counts || {} as any;
  const overrides = ld.overrides || {};
  const defaults = ld.defaults || {} as any;
  const hasLayout = ld.hasLayoutData || false;

  // Helper: override > auto > default
  const val = (field: string, def: number): number =>
    (overrides as any)[field] ?? (counts as any)[field] ?? (defaults as any)[field] ?? def;

  const wireCount = val('wireCount', 0);
  const wireTerminations = val('wireTerminations', 0);
  const doorDevices = val('doorDevices', 0);
  const allDevices = val('allDevices', 0);
  const panelHoles = val('panelHoles', 0);
  const ductDinFeet = val('ductDinFeet', 0);
  const sideTopSmallCount = val('sideTopSmallCount', 0);
  const sideTopLargeCount = val('sideTopLargeCount', 0);
  const squareCutoutCount = val('squareCutoutCount', 0);
  const sideDeviceHours = val('sideDeviceHours', 0);
  const sideDeviceCount = val('sideDeviceCount', 0);
  const pmUnits = val('pmUnits', 2);
  const buyoffUnits = val('buyoffUnits', 2);
  const cratingUnits = val('cratingUnits', 1);
  const labelHours = val('labelHours', 4);

  const lines: LaborEstimateLine[] = [];
  const addLine = (category: string, qty: number, minPerUnit: number, unit: string, field: string) => {
    const hours = qty * minPerUnit / 60;
    const cost = hours * laborRate;
    lines.push({ category, qty, unit, minPerUnit, hours, cost, field });
  };

  addLine('Wire Time', wireCount, LABOR_RATES.wireMinPerPoint, 'wires', 'wireCount');
  addLine('Door Wiring', doorDevices, LABOR_RATES.doorDeviceMinPerDevice, 'devices', 'doorDevices');
  addLine('Device Mounting', allDevices, LABOR_RATES.mountingMinPerDevice, 'devices', 'allDevices');
  addLine('Duct & DIN Rail', ductDinFeet, LABOR_RATES.ductDinMinPerFoot, 'feet', 'ductDinFeet');
  addLine('Panel Holes', panelHoles, LABOR_RATES.holesMinPerHole, 'holes', 'panelHoles');

  // Side-mounted components (unified: fans, ACs, fan shrouds, horns, etc.)
  if (sideDeviceHours > 0) {
    lines.push({
      category: 'Side-Mounted Components', qty: sideDeviceHours, unit: 'hours',
      minPerUnit: 60, hours: sideDeviceHours, cost: sideDeviceHours * laborRate, field: 'sideDeviceHours',
    });
  }

  // Labels: stored as hours directly
  lines.push({
    category: 'Labels', qty: labelHours, unit: 'hours',
    minPerUnit: 60, hours: labelHours, cost: labelHours * laborRate, field: 'labelHours',
  });

  addLine('Project Mgmt', pmUnits, LABOR_RATES.pmMinPerUnit, 'sessions', 'pmUnits');
  addLine('Crating Time', cratingUnits, LABOR_RATES.cratingMinPerUnit, 'crates', 'cratingUnits');

  const totalHours = lines.reduce((s, l) => s + l.hours, 0);
  const totalCost = totalHours * laborRate;

  return {
    lines, totalCost, totalHours,
    inputs: {
      wireCount, wireTerminations, doorDevices, allDevices, panelHoles,
      ductDinFeet, sideTopSmallCount, sideTopLargeCount, squareCutoutCount,
      sideDeviceHours, sideDeviceCount, pmUnits, buyoffUnits, cratingUnits, labelHours,
    },
    hasLayoutData: hasLayout,
    isLegacy: false,
    isOverride: false,
  };
}

// ─── Build Labor BOM Rows ───────────────────────────────────────────────────

/**
 * Create labor line items from the labor estimate.
 * Maps labor categories to the three labor BOM part numbers (1012/1013/1014).
 */
export function buildLaborBomRows(panel: Panel): any[] {
  const est = computeLaborEstimate(panel);
  if (!est.lines.length) return [];
  return LABOR_BOM_GROUPS.map(g => {
    const hrs = est.lines
      .filter(l => g.cats.includes(l.category))
      .reduce((s, l) => s + l.hours, 0);
    return {
      id: `labor-${g.partNumber}`,
      isLaborRow: true,
      partNumber: g.partNumber,
      description: g.description,
      qty: Math.ceil(hrs) || 0,
      unitPrice: null,
      priceSource: 'bc' as const,
      priceDate: Date.now(),
      manufacturer: '',
      notes: '',
    };
  });
}

// ─── Sync Labor BOM Rows ────────────────────────────────────────────────────

/**
 * Sync labor hours between the estimate and BOM.
 * Replaces existing labor rows with freshly computed ones.
 */
export function syncLaborBomRows(panel: Panel): Panel {
  const laborRows = buildLaborBomRows(panel);
  if (!laborRows.length) return panel;
  const nonLabor = (panel.bom || []).filter(r => !r.isLaborRow);
  return { ...panel, bom: [...laborRows, ...nonLabor] };
}

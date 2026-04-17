// ─── CPD (Component Product Database) Service ────────────────────────────────
// Manages the CPD catalog: panel specs, product details, and enrichment.

// Lazy accessors — avoids importing globals.ts at module load
declare const require: any;
let _globals: any = null;
function globals() {
  if (!_globals) _globals = require('@/core/globals');
  return _globals;
}
function fbDb() { return globals().fbDb; }
function appCtx() { return globals()._appCtx; }
function apiKey() { return globals()._apiKey; }
function apiCall(body: any) { return globals().apiCall(body); }

let _cpdCache: any = null;

function _cpdPath(uid: string): string {
  return (appCtx().configPath || `users/${uid}/config`) + '/cpd_catalog';
}

/**
 * Load CPD catalog from Firestore.
 */
export async function loadCPD(uid: string): Promise<any> {
  if (_cpdCache) return _cpdCache;
  try {
    const d = await fbDb().doc(_cpdPath(uid)).get();
    _cpdCache = d.exists ? { products: [], panels: [], ...d.data() } : { products: [], panels: [] };
  } catch {
    _cpdCache = { products: [], panels: [] };
  }
  return _cpdCache;
}

/**
 * Save CPD catalog data to Firestore.
 */
export async function saveCPD(uid: string, data: any): Promise<void> {
  _cpdCache = { ..._cpdCache, ...data };
  await fbDb().doc(_cpdPath(uid)).set(_cpdCache);
}

/**
 * Log a panel's BOM to the CPD catalog.
 */
export async function logPanelToCPD(
  uid: string,
  panel: any,
  categorizedBom: any[],
  metadata: any = null
): Promise<void> {
  const cpd = await loadCPD(uid);
  const plcProc = categorizedBom.filter((r: any) => r.cpdCategory === 'PLC Processor').length;
  const plcIn = categorizedBom.filter((r: any) => r.cpdCategory === 'PLC I/O Module' && /(input|DI|AI)/i.test(r.description || '')).length;
  const plcOut = categorizedBom.filter((r: any) => r.cpdCategory === 'PLC I/O Module' && /(output|DO|AO)/i.test(r.description || '')).length;
  const motors = categorizedBom.filter((r: any) => ['VFD', 'Contactor'].includes(r.cpdCategory)).length;
  const existing = cpd.panels || [];
  const prev = existing.find((p: any) => p.panelId === panel.id) || {};
  const baseSpecs: any = {
    plcProcessors: plcProc,
    plcInputs: plcIn,
    plcOutputs: plcOut,
    motorCount: motors,
    itemCount: categorizedBom.filter((r: any) => !r.isLaborRow).length,
  };
  // Apply metadata overrides to specs
  if (metadata) {
    if (metadata.inputCount > 0) baseSpecs.plcInputs = metadata.inputCount;
    if (metadata.outputCount > 0) baseSpecs.plcOutputs = metadata.outputCount;
    if (metadata.motorCount > 0) baseSpecs.motorCount = metadata.motorCount;
  }
  const spec: any = {
    ...prev,
    panelId: panel.id,
    panelName: panel.name || panel.drawingNo || 'Panel',
    projectId: panel.projectId || '',
    drawingNo: panel.drawingNo || '',
    specs: baseSpecs,
    bomSummary: categorizedBom.filter((r: any) => !r.isLaborRow).map((r: any) => ({
      category: r.cpdCategory || 'Other',
      partNumber: r.partNumber,
      description: r.description,
      qty: r.qty || 1,
    })),
    ...(metadata ? {
      panelType: metadata.panelType || prev.panelType || '',
      controlledEquipment: metadata.controlledEquipment || prev.controlledEquipment || '',
      voltages: metadata.voltages || prev.voltages || {},
      plcBrand: metadata.plcBrand || prev.plcBrand || '',
      enclosureType: metadata.enclosureType || prev.enclosureType || '',
      additionalNotes: metadata.additionalNotes || prev.additionalNotes || '',
    } : {}),
    scannedAt: Date.now(),
  };
  const panels = [...(cpd.panels || []).filter((p: any) => p.panelId !== panel.id), spec];
  // Merge new products
  const existingProds = cpd.products || [];
  const newProds = [...existingProds];
  categorizedBom.filter((r: any) => !r.isLaborRow && r.partNumber).forEach((r: any) => {
    const pn = (r.partNumber || '').trim();
    if (!pn) return;
    const idx = newProds.findIndex((p: any) => p.partNumber === pn);
    if (idx >= 0) {
      newProds[idx] = { ...newProds[idx], seenCount: (newProds[idx].seenCount || 1) + 1, lastSeen: Date.now() };
    } else {
      newProds.push({
        partNumber: pn,
        description: r.description || '',
        manufacturer: r.manufacturer || '',
        category: r.cpdCategory || 'Other',
        approvals: { ul: '', ce: '', csa: '' },
        seenCount: 1,
        lastSeen: Date.now(),
      });
    }
  });
  await saveCPD(uid, { panels, products: newProds });
}

// Background product enrichment — looks up specs for parts without details
// Throttled: max 4 parts per session to avoid excessive API usage
let _enrichSessionCount = 0;

/**
 * Enrich product details using AI for a specific part number.
 */
export async function enrichProductDetails(
  uid: string,
  partNumber: string,
  description: string,
  category: string
): Promise<void> {
  if (!apiKey() || _enrichSessionCount >= 4) return;
  _enrichSessionCount++;
  try {
    const resp = await apiCall({
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are an industrial parts expert. For this part: "${partNumber}" (${description || 'no description'}, category: ${category || 'unknown'}), provide technical specifications.
Return ONLY valid JSON (no markdown):
{"voltageRating":"","currentRating":"","brand":"","series":"","ul":"yes/no/unknown","ce":"yes/no/unknown","csa":"yes/no/unknown","shortSpec":"one sentence description of what this part is and its key specs"}`,
      }],
    });
    const raw = resp.content[0].text.replace(/```json|```/g, '').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return;
    const specs = JSON.parse(m[0]);
    const cpd = await loadCPD(uid);
    const products = (cpd.products || []).map((p: any) =>
      p.partNumber === partNumber ? {
        ...p,
        manufacturer: specs.brand || p.manufacturer,
        approvals: { ul: specs.ul || '', ce: specs.ce || '', csa: specs.csa || '' },
        voltageRating: specs.voltageRating || '',
        currentRating: specs.currentRating || '',
        shortSpec: specs.shortSpec || '',
        enriched: true,
        enrichedAt: Date.now(),
      } : p
    );
    await saveCPD(uid, { products });
  } catch { /* ignore enrichment failures */ }
}

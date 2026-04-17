// ─── Page Type Classification ────────────────────────────────────────────────
// Classifies drawing pages as BOM, schematic, layout, etc. using Claude vision.

import { visionCall, apiCall } from '@/services/anthropic/client';
import { _apiKey } from '@/core/globals';
import { ensureDataUrl } from '@/scanning/pdfExtractor';
import type { PageType, ClassifiedPage } from '@/core/types';

const PAGE_TYPE_DETECT_PROMPT = `Classify this page from a UL508A industrial control panel drawing set.
Return ONLY valid JSON:
{"types":["bom"],"sheetNo":"1 of 5"}

Valid types (can return multiple): "bom", "schematic", "layout", "backpanel", "enclosure", "pid", "wiring"
- bom: Bill of Materials table (parts list with columns for qty, part number, description)
- schematic: Electrical wiring diagram with component symbols and wire connections
- layout: Physical arrangement / dimensional drawing showing component placement
- backpanel: Back panel or subpanel layout showing mounting locations
- enclosure: Enclosure / cabinet drawing with dimensions and cutouts
- pid: Process & Instrumentation Diagram
- wiring: Point-to-point wiring schedule or terminal connection list

If a page contains multiple content types (e.g., a BOM table alongside a schematic), return ALL applicable types.
sheetNo: extract sheet number if visible (e.g., "3 of 12", "Sheet 3"). Use "" if not visible.`;

/**
 * Classify a single page image using AI vision.
 */
export async function classifyPage(imageBase64: string): Promise<{ types: PageType[]; sheetNo: string }> {
  const raw = await visionCall(imageBase64, PAGE_TYPE_DETECT_PROMPT, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
  });

  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      types: Array.isArray(parsed.types) ? parsed.types : [],
      sheetNo: parsed.sheetNo || '',
    };
  } catch {
    console.warn('Page classification parse error:', raw);
    return { types: [], sheetNo: '' };
  }
}

/**
 * Classify multiple pages in sequence.
 */
export async function classifyPages(
  pages: { id: string; imageData: string }[],
  onProgress?: (idx: number, total: number) => void
): Promise<ClassifiedPage[]> {
  const results: ClassifiedPage[] = [];

  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i, pages.length);
    const pg = pages[i];
    const b64 = pg.imageData.includes(',') ? pg.imageData.split(',')[1] : pg.imageData;

    try {
      const { types, sheetNo } = await classifyPage(b64);
      results.push({ id: pg.id, imageData: pg.imageData, types: types as PageType[], sheetNo });
    } catch (e) {
      console.warn(`Classification failed for page ${pg.id}:`, e);
      results.push({ id: pg.id, imageData: pg.imageData, types: ['unknown'], sheetNo: '' });
    }
  }

  onProgress?.(pages.length, pages.length);
  return results;
}

/**
 * Detect zoomed/duplicate pages among same-type pages.
 * Uses Haiku vision to identify pages that are zoomed-in detail sections
 * duplicating content already visible on another page.
 * Returns array of page IDs that are zoomed.
 */
export async function detectZoomedPages(pagesOfType: any[]): Promise<string[]> {
  if (!_apiKey || pagesOfType.length < 2) return [];
  try {
    const batch = pagesOfType.slice(0, 6);
    const imageContent = batch.map((pg: any, i: number) => [
      { type: 'text', text: `Page ${i + 1}:` },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: (pg.dataUrl || '').split(',')[1] } }
    ]).flat();
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': _apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 200,
        messages: [{ role: 'user', content: [
          ...imageContent,
          { type: 'text', text: `These ${batch.length} drawing pages are all tagged as the same type. Identify any that are clearly zoomed-in detail sections showing just a portion of content that already appears in full on another page. These zoomed pages duplicate information and should be excluded from processing.\nReturn ONLY JSON array: [{"idx":0,"isZoomed":false},{"idx":1,"isZoomed":true},...] for all ${batch.length} pages. If uncertain, set isZoomed:false.` }
        ] }]
      })
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text || '';
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const results = JSON.parse(m[0]);
    return results.filter((r: any) => r.isZoomed).map((r: any) => batch[r.idx]?.id).filter(Boolean);
  } catch (e) { console.warn('detectZoomedPages:', e); return []; }
}

/**
 * Extract panel metadata from pages using AI (multi-page batching).
 * Analyzes ALL pages in batches of 8, merges results into one metadata object.
 */
export async function extractPanelMetadata(pages: any[]): Promise<any> {
  if (!_apiKey || !pages || !pages.length) return null;
  const allPages = pages.filter((p: any) => (p.dataUrl || p.storageUrl));
  if (!allPages.length) return null;
  const BATCH = 8;
  const prompt = `Analyze these control panel engineering drawings (schematics, layouts, title blocks, BOM pages — all page types). Extract every detail you can find.
Return ONLY valid JSON (no markdown):
{
  "panelType": "e.g. Motor Control Panel / PLC Panel / Junction Box / Heater Control / Relay Panel / MCC / Automation Panel",
  "controlledEquipment": "comma-separated list of all equipment mentioned e.g. Clarifier, Thickener, Kiln, Generator, Pump, Conveyor, Trash Rake, Heater, Fan",
  "voltages": {
    "lineVoltage": "e.g. 480V 3PH or 208V 3PH or unknown",
    "controlVoltage": "e.g. 120VAC or 24VDC or unknown",
    "motorVoltage": "e.g. 460V or unknown"
  },
  "plcBrand": "e.g. Allen-Bradley, Siemens, AutomationDirect, or none/unknown",
  "enclosureType": "e.g. NEMA 12, NEMA 4X, or unknown",
  "inputCount": 0,
  "outputCount": 0,
  "motorCount": 0,
  "additionalNotes": "any other relevant details: customer name, project name, location, special requirements, certifications required, environmental conditions"
}`;
  try {
    // Ensure all pages have dataUrl
    const ensured = await Promise.all(allPages.map(ensureDataUrl));
    const withData = ensured.filter((p: any) => p.dataUrl);
    if (!withData.length) return null;
    // Process in batches, collect partial results
    const partials: any[] = [];
    for (let i = 0; i < withData.length; i += BATCH) {
      const batch = withData.slice(i, i + BATCH);
      const imageContents = batch.map((p: any) => ({
        type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.dataUrl.split(',')[1] }
      }));
      try {
        const text = await apiCall({
          model: 'claude-sonnet-4-6',
          max_tokens: 700,
          messages: [{ role: 'user', content: [...imageContents, { type: 'text', text: prompt }] }]
        });
        const raw = text.replace(/```json|```/g, '').trim();
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) partials.push(JSON.parse(m[0]));
      } catch (e) { /* skip batch errors */ }
    }
    if (!partials.length) return null;
    // Merge: prefer first non-unknown value for each field, sum counts, combine equipment lists
    const merged = partials[0];
    for (let i = 1; i < partials.length; i++) {
      const p = partials[i];
      if ((!merged.panelType || merged.panelType === 'unknown') && p.panelType) merged.panelType = p.panelType;
      if (p.controlledEquipment) {
        const existing = new Set((merged.controlledEquipment || '').split(/,\s*/).filter(Boolean));
        p.controlledEquipment.split(/,\s*/).filter(Boolean).forEach((e: string) => existing.add(e.trim()));
        merged.controlledEquipment = [...existing].join(', ');
      }
      if ((!merged.voltages?.lineVoltage || merged.voltages.lineVoltage === 'unknown') && p.voltages?.lineVoltage && p.voltages.lineVoltage !== 'unknown') merged.voltages = { ...merged.voltages, ...p.voltages };
      if ((!merged.plcBrand || merged.plcBrand === 'unknown') && p.plcBrand && p.plcBrand !== 'unknown') merged.plcBrand = p.plcBrand;
      if ((!merged.enclosureType || merged.enclosureType === 'unknown') && p.enclosureType && p.enclosureType !== 'unknown') merged.enclosureType = p.enclosureType;
      if (p.inputCount > 0 && (!merged.inputCount || merged.inputCount < p.inputCount)) merged.inputCount = p.inputCount;
      if (p.outputCount > 0 && (!merged.outputCount || merged.outputCount < p.outputCount)) merged.outputCount = p.outputCount;
      if (p.motorCount > 0 && (!merged.motorCount || merged.motorCount < p.motorCount)) merged.motorCount = p.motorCount;
      if (p.additionalNotes && p.additionalNotes !== merged.additionalNotes) {
        merged.additionalNotes = [merged.additionalNotes, p.additionalNotes].filter(Boolean).join(' | ');
      }
    }
    return merged;
  } catch (e) { return null; }
}

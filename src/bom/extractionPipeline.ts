/* eslint-disable */
// @ts-nocheck
// ─── Extraction Pipeline ─────────────────────────────────────────────────────
// Orchestrates the full panel extraction: BOM extraction, validation,
// part verification, compliance review, and image upload.

// Lazy accessors to avoid circular deps at module load
declare const require: any;
let _globals: any = null;
function globals() {
  if (!_globals) _globals = require('@/core/globals');
  return _globals;
}
function fbDb() { return globals().fbDb; }
function appCtx() { return globals()._appCtx; }

import { extractBomPage, verifyPartNumbers, getExtractionUnits, buildRegionContext } from '@/bom/extractor';
import { runPanelValidation } from '@/bom/validator';
import {
  getPageTypes,
  appendDefaultBomItems,
  mergeEngineeringQuestions,
  parallelMap,
} from '@/core/helpers';

/**
 * Run the full extraction pipeline for a panel.
 */
export async function runExtractionTask(
  uid: string,
  projectId: string,
  panel: any,
  cbs: any = {}
): Promise<void> {
  const { bgSetPct, bgUpdate, bgDone, bgError, saveProjectPanel, uploadPageImage, apiCall, _apiKey, loadNIQ, searchNIQ, clearNiqCache } = globals();
  const { onDone, stampFn, projectName, bcProjectNumber } = cbs;
  let latestPanel = panel;
  try {
    latestPanel = { ...panel };
    const bomPages = (panel.pages || []).filter((p: any) => getPageTypes(p).includes('bom') && p.dataUrl);
    const hasSchOrLayout = (panel.pages || []).some((p: any) =>
      (getPageTypes(p).includes('schematic') || getPageTypes(p).includes('layout') || getPageTypes(p).includes('backpanel') || getPageTypes(p).includes('enclosure')) && (p.dataUrl || p.storageUrl)
    );
    const willValidate = !!_apiKey && hasSchOrLayout;
    const regionContext = buildRegionContext(panel.pages || []);
    const userNotes = (panel.extractionNotes || '') + regionContext;
    const save = async (p: any) => {
      latestPanel = p;
      await saveProjectPanel(uid, projectId, panel.id, p).catch((e: any) => console.warn('bg save:', e));
    };

    // Calculate phase weights for progress
    const hasBom = _apiKey && bomPages.length > 0;
    const hasVal = willValidate;
    const hasVerify = _apiKey;
    const hasCompliance = _apiKey;
    const hasUpload = (panel.pages || []).some((pg: any) => pg.dataUrl && !pg.storageUrl);
    let phases: any[] = [];
    if (hasBom) phases.push({ name: 'bom', weight: 40 });
    if (hasVal) phases.push({ name: 'val', weight: 25 });
    if (hasVerify) phases.push({ name: 'verify', weight: 10 });
    if (hasCompliance) phases.push({ name: 'compliance', weight: 15 });
    if (hasUpload) phases.push({ name: 'upload', weight: 10 });
    if (!phases.length) phases.push({ name: 'done', weight: 100 });
    const totalWeight = phases.reduce((s: number, p: any) => s + p.weight, 0);
    let cumWeight = 0;
    const phaseRange: any = {};
    for (const p of phases) {
      const start = Math.round((cumWeight / totalWeight) * 100);
      cumWeight += p.weight;
      phaseRange[p.name] = { start, end: Math.round((cumWeight / totalWeight) * 100) };
    }
    function phasePct(name: string, frac: number) {
      const r = phaseRange[name];
      if (!r) return;
      const pct = r.start + Math.round(frac * (r.end - r.start));
      bgSetPct(panel.id, Math.min(pct, 99));
    }

    bgSetPct(panel.id, 0, hasBom ? 'Extracting BOM...' : hasVal ? 'Validating...' : 'Processing...');

    // BOM extraction
    let bomMergePromise: Promise<any> = Promise.resolve([]);
    if (hasBom) {
      let bomDone = 0;
      let allQuestions: any[] = [];
      bomMergePromise = parallelMap(bomPages, async (pg: any, pgIdx: number) => {
        bomDone++;
        phasePct('bom', bomDone / bomPages.length);
        bgUpdate(panel.id, `Extracting BOM \u2014 page ${bomDone}/${bomPages.length}...`);
        const units = await getExtractionUnits(pg);
        let pageItems: any[] = [], pageQs: any[] = [];
        for (const unit of units) {
          const notes = unit.regionNote ? (userNotes + '\nThis image is a cropped BOM region: ' + unit.regionNote) : userNotes;
          const result = await extractBomPage(unit.dataUrl, '', notes);
          const items = result.items || result;
          pageItems.push(...items);
          const qs = (result.questions || []).map((q: any) => ({ ...q, pageIdx: pgIdx, pageName: pg.name || `Page ${pgIdx + 1}` }));
          if (qs.length) pageQs.push(...qs);
        }
        if (pageQs.length) allQuestions.push(...pageQs);
        return pageItems.map((item: any) => ({ ...item, sourcePageIdx: pgIdx }));
      }, 3).then(async (results: any[][]) => {
        const all = results.flat();
        if (!all.length) return { bom: [], questions: allQuestions };
        const map: any = {};
        all.forEach((item: any) => {
          const pn = (item.partNumber || '').replace(/[\s\-\.\/\u00a0]+/g, '').toUpperCase();
          const key = pn || ('desc:' + (item.description || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 40));
          if (map[key]) {
            map[key].qty = (+map[key].qty || 1) + (+item.qty || 1);
            console.log(`BOM MERGE: "${item.partNumber}" qty ${item.qty} -> merged with existing (now qty ${map[key].qty})`);
          } else {
            map[key] = { ...item, id: Date.now() + Math.random(), qty: +item.qty || 1 };
          }
        });
        console.log(`BOM MERGE: ${all.length} raw items -> ${Object.keys(map).length} unique items`);
        return { bom: await appendDefaultBomItems(Object.values(map)), questions: allQuestions.slice(0, 10) };
      }).catch((ex: any) => { console.error('BOM extraction failed:', ex); return { bom: [], questions: [] }; });
    }

    // Validation (parallel with BOM)
    let valPromise: Promise<any> = Promise.resolve(null);
    if (hasVal) {
      valPromise = runPanelValidation(latestPanel, (pct: number) => { phasePct('val', pct / 100); bgUpdate(panel.id, 'Validating...'); }, bomMergePromise);
    }

    // Await BOM and save
    const bomResult = await bomMergePromise;
    const mergedBom = bomResult.bom || bomResult;
    const aiQuestions = (bomResult.questions || []).slice(0, 10);
    const eqs = mergeEngineeringQuestions(latestPanel.engineeringQuestions, aiQuestions, null);
    if (mergedBom.length > 0) {
      await save({
        ...latestPanel, bom: mergedBom,
        ...(aiQuestions.length ? { aiQuestions } : {}),
        engineeringQuestions: eqs,
        status: 'extracted', updatedAt: Date.now(),
      });
    }

    // Await validation and save
    if (hasVal) {
      try {
        const result = await valPromise;
        if (result?.validation || result?.laborData) {
          await save({
            ...latestPanel,
            ...(result.validation ? { validation: result.validation } : {}),
            ...(result.laborData ? { laborData: result.laborData } : {}),
            status: 'validated', updatedAt: Date.now(),
          });
        }
      } catch (valEx: any) { console.error('Validation failed:', valEx); }
    }

    // Part number verification
    const bomToVerify = (latestPanel.bom || []).slice();
    if (bomToVerify.length > 0 && hasVerify) {
      phasePct('verify', 0);
      bgUpdate(panel.id, 'Verifying part numbers...');
      try {
        const vr = await verifyPartNumbers(bomToVerify);
        phasePct('verify', 1);
        if (vr?.length > 0) await save({ ...latestPanel, bomVerification: vr, updatedAt: Date.now() });
      } catch (e: any) { console.warn('Part verification failed:', e); }
    }

    // Compliance review
    if (hasCompliance && (latestPanel.bom?.length > 0 || latestPanel.validation)) {
      phasePct('compliance', 0);
      bgUpdate(panel.id, 'Compliance review...');
      try {
        const cr = await runComplianceReview(latestPanel);
        phasePct('compliance', 1);
        if (cr) {
          const eqs2 = mergeEngineeringQuestions(latestPanel.engineeringQuestions, null, cr.questions);
          await save({ ...latestPanel, complianceReview: cr, engineeringQuestions: eqs2, updatedAt: Date.now() });
        }
      } catch (e: any) { console.warn('Compliance review failed:', e); }
    }

    // Upload page images
    const pagesNeedingUpload = latestPanel.pages.filter((pg: any) => pg.dataUrl && !pg.storageUrl);
    if (pagesNeedingUpload.length > 0 && projectId) {
      phasePct('upload', 0);
      bgUpdate(panel.id, 'Uploading drawings...');
      try {
        const urlMap: any = {};
        const totalPages = latestPanel.pages.length;
        let upDone = 0;
        await parallelMap(pagesNeedingUpload, async (pg: any) => {
          let dataUrl = pg.dataUrl;
          if (stampFn) {
            const pgIdx = latestPanel.pages.findIndex((p: any) => p.id === pg.id);
            try { dataUrl = await stampFn(dataUrl, pgIdx, totalPages) || dataUrl; } catch (e: any) { console.warn('Stamp failed:', e); }
          }
          urlMap[pg.id] = await uploadPageImage(uid, projectId, pg.id, dataUrl);
          upDone++;
          phasePct('upload', upDone / pagesNeedingUpload.length);
        }, 4);
        const pagesWithUrls = latestPanel.pages.map((pg: any) => urlMap[pg.id] ? { ...pg, storageUrl: urlMap[pg.id] } : pg);
        await save({ ...latestPanel, pages: pagesWithUrls });
      } catch (e: any) { console.warn('Storage upload failed:', e); }
    }

    const itemCount = (latestPanel.bom || []).length;
    bgDone(panel.id, itemCount > 0 ? `\u2713 ${itemCount} items` : '\u2713 Complete');
    // Save learning record to ARC Neural IQ
    saveExtractionLearning(uid, projectId, latestPanel, projectName || '', bcProjectNumber || '');
  } catch (ex: any) {
    console.error('runExtractionTask error:', ex);
    bgError(panel.id, ex.message.slice(0, 60));
  } finally {
    try { if (onDone) onDone(latestPanel); } catch { /* ignore */ }
  }
}

// ─── Compliance Review ──────────────────────────────────────────────────────

async function runComplianceReview(panel: any): Promise<any> {
  const { apiCall, loadNIQ, searchNIQ } = globals();
  const bom = panel.bom || [];
  const val = panel.validation || {};
  const ld = panel.laborData || {};
  const counts = ld.counts || {};
  const layout = ld.layoutAnalysis || {};

  const bomSummary = bom.slice(0, 60).map((r: any) => `${r.qty || 1}x ${r.manufacturer || ''} ${r.partNumber || ''} \u2014 ${(r.description || '').slice(0, 60)} [tag:${r.notes || ''}]`).join('\n');
  const deviceTypes: any = {};
  (val.schematicTags || []).forEach((t: any) => { const type = typeof t === 'string' ? 'other' : (t.type || 'other'); deviceTypes[type] = (deviceTypes[type] || 0) + 1; });
  const deviceSummary = Object.entries(deviceTypes).map(([t, c]) => `${t}: ${c}`).join(', ');

  const allPages = panel.pages || [];
  const regionAnnotations = allPages.flatMap((pg: any) => (pg.regions || []).filter((r: any) => r.note).map((r: any) => ({ page: pg.name || 'Page', type: r.label || r.type, note: r.note })));
  const specRegions = regionAnnotations.filter((r: any) => r.type === 'Spec' || r.type === 'spec');
  const labelRegions = regionAnnotations.filter((r: any) => r.type === 'Label' || r.type === 'label');
  const otherRegions = regionAnnotations.filter((r: any) => r.type !== 'Spec' && r.type !== 'spec' && r.type !== 'Label' && r.type !== 'label' && r.type !== 'Ignore' && r.type !== 'ignore' && r.type !== 'BOM' && r.type !== 'bom');

  const searchTerms = ['UL508A', 'branch circuit', 'overcurrent', 'SCCR', 'short circuit', 'wiring', 'marking', 'labeling', 'enclosure', 'spacing', 'grounding', 'bonding'];
  if (deviceTypes.drive || deviceTypes.vfd) searchTerms.push('variable frequency drive', 'motor circuit', 'overload');
  if (deviceTypes.transformer) searchTerms.push('transformer', 'control circuit', 'secondary');
  if (deviceTypes.disconnect) searchTerms.push('disconnect', 'supply circuit', 'panelboard');
  if (deviceTypes.plc_io) searchTerms.push('PLC', 'programmable', 'controller');
  if (deviceTypes.e_stop) searchTerms.push('emergency stop', 'red mushroom', 'operator safety');
  if (counts.wireCount > 50) searchTerms.push('wire bending', 'wire duct fill', 'raceway');
  if (layout.enclosure) searchTerms.push('enclosure type', 'NEMA', 'ventilation', 'thermal');
  for (const r of [...specRegions, ...labelRegions]) {
    const words = r.note.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w: string) => w.length >= 3);
    searchTerms.push(...words.slice(0, 8));
    if (/volt|480|600|208|120|277/i.test(r.note)) searchTerms.push('voltage rating', 'supply circuit');
    if (/amp|breaker|fuse/i.test(r.note)) searchTerms.push('overcurrent', 'branch circuit protection');
    if (/sccr|short.?circuit/i.test(r.note)) searchTerms.push('SCCR', 'short circuit current rating');
    if (/nema|ip\d/i.test(r.note)) searchTerms.push('enclosure rating', 'NEMA type');
    if (/phase|3ph|1ph/i.test(r.note)) searchTerms.push('power supply', 'phase');
  }

  const niqDocs = await loadNIQ();
  const niqContext = searchNIQ(niqDocs, searchTerms);

  const prompt = `You are a UL508A certified panel shop inspector and compliance reviewer. Analyze the data below for potential compliance concerns, design issues, and things the panel builder should verify.

EXTRACTED PANEL DATA:
- Wire Count: ${counts.wireCount || 0} internal wires, ${counts.wireTerminations || 0} terminations
- Door Devices: ${counts.doorDevices || 0}
- Backpanel Devices: ${(counts.allDevices || 0) - (counts.doorDevices || 0)}
- Total Devices: ${counts.allDevices || 0}
- Panel Holes: ${counts.panelHoles || 0}
- Duct & DIN Rail: ${counts.ductDinFeet || 0} feet
${layout.enclosure ? `- Enclosure: ${layout.enclosure.width || '?'}x${layout.enclosure.height || '?'}x${layout.enclosure.depth || '?'} ${layout.enclosure.unit || 'in'}` : '- Enclosure: dimensions not extracted'}

SCHEMATIC DEVICE BREAKDOWN:
${deviceSummary || 'No devices identified'}

BOM (${bom.length} items):
${bomSummary || 'No BOM extracted'}

VALIDATION:
- Schematic tags found: ${(val.schematicTags || []).length}
- BOM-to-schematic match confidence: ${val.confidence || 'N/A'}
- Missing from schematic: ${(val.missingFromSchematic || []).length} items
- Unaccounted tags: ${(val.unaccountedTags || []).join(', ') || 'none'}
${panel.extractionNotes ? `\nUSER NOTES:\n${panel.extractionNotes}\n` : ''}${specRegions.length ? `\nSPEC REGIONS:\n${specRegions.map((r: any) => `- [${r.page}] ${r.note}`).join('\n')}\n` : ''}${labelRegions.length ? `\nLABEL REGIONS:\n${labelRegions.map((r: any) => `- [${r.page}] ${r.note}`).join('\n')}\n` : ''}${otherRegions.length ? `\nOTHER ANNOTATIONS:\n${otherRegions.map((r: any) => `- [${r.type} on ${r.page}] ${r.note}`).join('\n')}\n` : ''}${niqContext ? `\nARC NEURAL IQ REFERENCE:\n${niqContext}\n` : ''}
Return ONLY valid JSON with: concerns[], observations[], checklist[], questions[]
Severity levels: critical, warning, info
Categories: SCCR, overcurrent_protection, wiring, grounding, spacing, marking, enclosure, thermal, emergency_stop, motor_circuit, control_circuit, component_rating, general`;

  try {
    const raw = await apiCall({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: 'You are a UL508A panel shop inspector. Return only valid JSON.',
      messages: [{ role: 'user', content: prompt }],
    });
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON in response');
    const result = JSON.parse(m[0]);
    return {
      runAt: Date.now(),
      concerns: result.concerns || [],
      observations: result.observations || [],
      checklist: result.checklist || [],
      questions: result.questions || [],
      deviceSummary,
      niqDocsUsed: niqDocs.length,
    };
  } catch (e: any) {
    console.error('Compliance review failed:', e);
    return null;
  }
}

// ─── Save Extraction Learning ───────────────────────────────────────────────

async function saveExtractionLearning(
  uid: string,
  projectId: string,
  panel: any,
  projectName: string,
  bcProjectNumber: string
): Promise<void> {
  const _appCtx = appCtx();
  if (!_appCtx.companyId) return;
  try {
    const pages = panel.pages || [];
    const drawingTypes = [...new Set(pages.flatMap((p: any) => getPageTypes(p)))].join(', ');
    const bom = panel.bom || [];
    const val = panel.validation || {};
    const ld = panel.laborData || {};
    const counts = ld.counts || {};
    const layout = ld.layoutAnalysis || {};
    const cr = panel.complianceReview || {};
    const deviceTypes: any = {};
    (val.schematicTags || []).forEach((t: any) => { const type = typeof t === 'string' ? 'other' : (t.type || 'other'); deviceTypes[type] = (deviceTypes[type] || 0) + 1; });
    let content = `=== Extraction Summary ===\nProject: ${bcProjectNumber || '(no BC#)'} "${projectName || ''}" \u2014 Panel: ${panel.name || 'Unnamed'}\nDrawing types: ${drawingTypes || 'none detected'}\nBOM items: ${bom.length}`;
    if (counts.allDevices) content += `, Devices: ${counts.allDevices} (${counts.doorDevices || 0} door, ${(counts.allDevices || 0) - (counts.doorDevices || 0)} backpanel)`;
    content += '\n';
    if (counts.wireCount) content += `Wires: ${counts.wireCount}, Terminations: ${counts.wireTerminations || 0}\n`;
    if (layout.enclosure) content += `Enclosure: ${layout.enclosure.width || '?'}x${layout.enclosure.height || '?'}x${layout.enclosure.depth || '?'} ${layout.enclosure.unit || 'in'}\n`;
    if (cr.concerns?.length) {
      const crit = cr.concerns.filter((c: any) => c.severity === 'critical').length;
      const warn = cr.concerns.filter((c: any) => c.severity === 'warning').length;
      content += `Compliance concerns: ${crit} critical, ${warn} warning\n`;
    }
    if (panel.extractionNotes) content += `\n=== User Notes ===\n${panel.extractionNotes}\n`;
    const regionEntries = pages.flatMap((pg: any) => (pg.regions || []).filter((r: any) => r.note).map((r: any) => ({ page: pg.name || 'Page', type: r.label || r.type, note: r.note })));
    if (regionEntries.length) {
      content += `\n=== User Region Annotations ===\n`;
      content += regionEntries.map((e: any) => `[${e.type}] on ${e.page}: ${e.note}`).join('\n') + '\n';
    }
    if (panel.extractionFeedbackLog?.length) {
      content += `\n=== Extraction Feedback History ===\n`;
      panel.extractionFeedbackLog.forEach((entry: any) => {
        const date = new Date(entry.timestamp).toISOString().slice(0, 10);
        content += `[${date}] "${(entry.feedback || '').slice(0, 200)}" \u2014 re-extracted ${entry.itemCount || '?'} items\n`;
      });
    }
    if (cr.concerns?.length) {
      content += `\n=== Compliance Concerns ===\n`;
      cr.concerns.forEach((c: any) => { content += `[${c.severity}] ${c.title || c.category || ''}: ${(c.detail || '').slice(0, 200)}\n`; });
    }
    if (Object.keys(deviceTypes).length) {
      content += `\n=== Device Breakdown ===\n`;
      content += Object.entries(deviceTypes).map(([t, c]) => `${t}: ${c}`).join(', ') + '\n';
    }
    if (bom.length > 0) {
      content += `\n=== Key Components ===\n`;
      content += bom.filter((r: any) => r.partNumber && !r.isLaborRow).slice(0, 30).map((r: any) => `${r.qty || 1}x ${r.manufacturer || ''} ${r.partNumber} \u2014 ${(r.description || '').slice(0, 60)}`).join('\n') + '\n';
    }
    await fbDb().collection(`companies/${_appCtx.companyId}/knowledgeBase`).add({
      type: 'niq_learning', source: 'ARC Neural IQ', createdAt: Date.now(),
      projectName: projectName || '', panelName: panel.name || '', projectId, panelId: panel.id,
      bcProjectNumber: bcProjectNumber || '', content,
    });
    globals().clearNiqCache(); // Invalidate cache
    console.log('[NIQ] Saved Neural IQ learning record');
  } catch (e: any) { console.warn('[NIQ] Failed to save learning record:', e); }
}

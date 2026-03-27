// ─── BOM Validation ──────────────────────────────────────────────────────────
// Cross-reference BOM items against schematic tags and wire counts.

import type { BomRow, ValidationResult, Panel } from '@/core/types';
import { visionCall } from '@/services/anthropic/client';
import { getPageTypes } from '@/core/helpers';

const SCHEMATIC_PROMPT = `You are reading a UL508A electrical control panel schematic page.

Extract and return ONLY valid JSON:
{
  "tags": [{"tag":"CB100","type":"breaker"}, {"tag":"PB1","type":"pushbutton"}],
  "wires": [
    {"w":"L1 bus to CB1 top","internal":true},
    {"w":"CB1 bottom to T1 H1","internal":true},
    {"w":"TB1-3 to output signal","internal":false}
  ]
}

tags: Every unique device reference designator visible (CB1, M2, OL1, PB3, SS1, H1, T1, CR1, PS1, etc.)
  - tag: the reference designator exactly as printed
  - type: breaker, contactor, overload, pushbutton, selector, pilot_light, transformer, relay, power_supply, terminal_block, disconnect, drive, plc, sensor, meter, fuse, other

wires: Every distinct wire or conductor connection you can identify
  - w: brief description of the connection path
  - internal: true if both endpoints are inside the panel; false if one endpoint exits to external equipment

Count EVERY wire segment carefully. Each line between two connection points is one wire.`;

/**
 * Analyze a schematic page for device tags and wire count.
 */
export async function analyzeSchematicPage(
  imageBase64: string,
  regionNotes = ''
): Promise<{ tags: { tag: string; type: string }[]; wireCount: number }> {
  const prompt = SCHEMATIC_PROMPT + regionNotes;
  const raw = await visionCall(imageBase64, prompt, {
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
  });

  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t: any) => (typeof t === 'string' ? { tag: t, type: 'other' } : t))
      : [];
    const wires = Array.isArray(parsed.wires) ? parsed.wires : [];
    return { tags, wireCount: wires.filter((w: any) => w.internal !== false).length };
  } catch {
    console.warn('Schematic analysis parse error:', raw);
    return { tags: [], wireCount: 0 };
  }
}

/**
 * Run panel validation: cross-reference BOM notes against schematic tags.
 */
export async function runPanelValidation(
  panel: Panel,
  onProgress?: (msg: string) => void
): Promise<ValidationResult> {
  const schematicPages = panel.pages.filter(p =>
    (p.types || []).includes('schematic') || p.type === 'schematic'
  );

  const allTags: { tag: string; type: string }[] = [];
  let totalWireCount = 0;

  for (let i = 0; i < schematicPages.length; i++) {
    const pg = schematicPages[i];
    onProgress?.(`Analyzing schematic ${i + 1}/${schematicPages.length}...`);

    if (!pg.dataUrl) continue;
    const b64 = pg.dataUrl.includes(',') ? pg.dataUrl.split(',')[1] : pg.dataUrl;
    const result = await analyzeSchematicPage(b64);
    allTags.push(...result.tags);
    totalWireCount += result.wireCount;
  }

  // Deduplicate tags
  const uniqueTags = new Map<string, { tag: string; type: string }>();
  for (const t of allTags) {
    const key = t.tag.toUpperCase();
    if (!uniqueTags.has(key)) uniqueTags.set(key, t);
  }

  const tagSet = new Set([...uniqueTags.keys()]);
  const matched: any[] = [];
  const missingFromSchematic: any[] = [];
  const notTraceable: any[] = [];
  const matchedTags = new Set<string>();

  for (const item of panel.bom) {
    if (item.isLaborRow || item.isCrossed) continue;
    const notes = (item.notes || '').trim();

    if (/as\s*shown|enclosure|din\s*rail|duct|wire|grommet/i.test(notes) || !notes) {
      notTraceable.push(item);
      continue;
    }

    const itemTags = notes.split(/[\s,;]+/).map(t => t.trim().toUpperCase()).filter(Boolean);
    const found = itemTags.filter(t => tagSet.has(t));

    if (found.length > 0) {
      matched.push({ item, found });
      found.forEach(t => matchedTags.add(t));
    } else {
      missingFromSchematic.push(item);
    }
  }

  const unaccountedTags = [...tagSet].filter(t => !matchedTags.has(t));
  const total = matched.length + missingFromSchematic.length + notTraceable.length;
  const confidence: ValidationResult['confidence'] =
    missingFromSchematic.length === 0 && unaccountedTags.length <= 2
      ? 'high'
      : missingFromSchematic.length <= 3
        ? 'medium'
        : 'low';

  return {
    runAt: Date.now(),
    schematicTags: [...uniqueTags.values()],
    wireCount: totalWireCount,
    matched,
    missingFromSchematic,
    notTraceable,
    unaccountedTags,
    confidence,
  };
}

/**
 * Calculate confidence scores for a panel (overall, pricing, wiring, BOM extraction).
 */
export function calcConfidence(panel: any): any {
  const bom = panel.bom || [];
  const pages = panel.pages || [];
  const validation = panel.validation || null;

  // Pricing: BC/Manual=100%, AI=50%, Unpriced=0%
  let pricing = 0;
  let bcCount = 0, manualCount = 0, aiCount = 0, unpricedCount = 0;
  if (bom.length) {
    bom.forEach((r: any) => {
      if (r.priceSource === 'bc') { bcCount++; }
      else if (r.priceSource === 'manual') { manualCount++; }
      else if (r.priceSource === 'ai') { aiCount++; }
      else { unpricedCount++; }
    });
    const total = bcCount * 100 + manualCount * 100 + aiCount * 50;
    pricing = Math.round(total / bom.length);
  }

  // Wiring: derive from match data, factoring in accepted items
  let wiring = 0;
  const acceptedArr = panel.wiringAccepted || [];
  const acceptedSet = new Set(acceptedArr.map(String));
  let matchedCount = 0, missingArr: any[] = [], acceptedInMissing = 0, ntCount = 0, wiringTotal = 0;
  if (validation) {
    const matched = Array.isArray(validation.matched) ? validation.matched : [];
    const missing = Array.isArray(validation.missingFromSchematic) ? validation.missingFromSchematic : [];
    const nt = Array.isArray(validation.notTraceable) ? validation.notTraceable : [];
    matchedCount = matched.length;
    missingArr = missing;
    ntCount = nt.length;
    acceptedInMissing = missing.filter((m: any) => acceptedSet.has(String(m.id))).length;
    const effectiveMatched = matchedCount + acceptedInMissing;
    const effectiveMissing = missing.length - acceptedInMissing;
    const traceable = effectiveMatched + effectiveMissing;
    wiringTotal = traceable + ntCount;
    const matchPct = traceable > 0 ? effectiveMatched / traceable : 1;
    const conf = matchPct >= 0.9 ? 'high' : matchPct >= 0.7 ? 'medium' : 'low';
    wiring = conf === 'high' ? 100 : conf === 'medium' ? 70 : conf === 'low' ? 40 : 0;
  }

  // BOM Extraction: quality-scored per row + part number verification
  let bomExt = 0;
  const bomPages = pages.filter((p: any) => getPageTypes(p).includes('bom'));
  const ocrBadChars = /[|{}~`\\^]/;
  const verif = panel.bomVerification || [];
  const verifMap: any = {}; verif.forEach((v: any) => { verifMap[String(v.id)] = v; });
  let cleanCount = 0, flaggedRows: any[] = [];
  let verifiedCount = 0, plausibleCount = 0, suspectCount = 0, uncheckedCount = 0;
  if (bom.length > 0) {
    let totalPts = 0;
    bom.forEach((r: any) => {
      let pts = 100; const issues: string[] = [];
      const pn = (r.partNumber || '').trim();
      const desc = (r.description || '').trim();
      if (!pn && desc) { pts = 0; issues.push('no part # with description'); }
      else if (!pn) { pts -= 40; issues.push('no part #'); }
      else {
        if (pn.length <= 2) { pts -= 30; issues.push('part # very short'); }
        else if (/^\d{1,3}$/.test(pn)) { pts -= 20; issues.push('part # looks numeric'); }
        if (ocrBadChars.test(pn)) { pts -= 20; issues.push('suspect OCR chars'); }
      }
      if (!desc) { pts -= 15; issues.push('no description'); }
      if (!r.qty || +r.qty === 0) { pts -= 10; issues.push('missing qty'); }
      // Part number verification scoring
      const vr = verifMap[String(r.id)];
      if (vr) {
        if (vr.status === 'verified') { verifiedCount++; }
        else if (vr.status === 'plausible') { plausibleCount++; pts -= 10; issues.push('part # plausible but unverified'); }
        else if (vr.status === 'suspect') { suspectCount++; pts -= 30; issues.push('part # not recognized'); }
      } else if (pn.length >= 3) { uncheckedCount++; }
      pts = Math.max(pts, 0);
      totalPts += pts;
      if (issues.length) flaggedRows.push({ id: r.id, partNumber: pn, issues, score: pts, verifStatus: vr?.status || null });
      else cleanCount++;
    });
    bomExt = Math.round(totalPts / bom.length);
  } else if (bomPages.length > 0) {
    bomExt = 0;
  }

  const overall = Math.round((pricing + wiring + bomExt) / 3);
  return {
    pricing, wiring, bomExt, overall,
    pricingDetail: { bcCount, manualCount, aiCount, unpricedCount, total: bom.length },
    wiringDetail: { matched: matchedCount, missing: missingArr, accepted: acceptedInMissing, notTraceable: ntCount, total: wiringTotal },
    bomDetail: { bomPages: bomPages.length, itemCount: bom.length, cleanCount, flaggedRows, verifiedCount, plausibleCount, suspectCount, uncheckedCount }
  };
}

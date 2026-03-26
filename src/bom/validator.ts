// ─── BOM Validation ──────────────────────────────────────────────────────────
// Cross-reference BOM items against schematic tags and wire counts.

import type { BomRow, ValidationResult, Panel } from '@/core/types';
import { visionCall } from '@/services/anthropic/client';

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

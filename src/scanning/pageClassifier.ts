// ─── Page Type Classification ────────────────────────────────────────────────
// Classifies drawing pages as BOM, schematic, layout, etc. using Claude vision.

import { visionCall } from '@/services/anthropic/client';
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

// ─── Title Block Reader ──────────────────────────────────────────────────────
// Extract panel name, drawing number, and revision from title blocks.

import { visionCall } from '@/services/anthropic/client';

const TITLE_BLOCK_PROMPT = `Look at the title block of this engineering drawing (usually bottom-right corner).
Extract ONLY valid JSON:
{"drawingNo":"","drawingDesc":"","drawingRev":"","panelName":""}

- drawingNo: The drawing number (e.g., "E-1001", "DWG-200")
- drawingDesc: The drawing description or title
- drawingRev: The revision level (e.g., "A", "Rev 2", "R0")
- panelName: The panel or assembly name if visible (e.g., "MCC-1", "Panel A")

Return "" for any field not found.`;

export interface TitleBlockInfo {
  drawingNo: string;
  drawingDesc: string;
  drawingRev: string;
  panelName: string;
}

/**
 * Extract title block information from a drawing page.
 */
export async function readTitleBlock(imageBase64: string): Promise<TitleBlockInfo> {
  const raw = await visionCall(imageBase64, TITLE_BLOCK_PROMPT, {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
  });

  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      drawingNo: parsed.drawingNo || '',
      drawingDesc: parsed.drawingDesc || '',
      drawingRev: parsed.drawingRev || '',
      panelName: parsed.panelName || '',
    };
  } catch {
    console.warn('Title block parse error:', raw);
    return { drawingNo: '', drawingDesc: '', drawingRev: '', panelName: '' };
  }
}

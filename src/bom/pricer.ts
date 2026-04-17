// ─── AI Price Estimation ─────────────────────────────────────────────────────
// Batch AI pricing of BOM items using Anthropic API.

import { apiCall } from '@/services/anthropic/client';
import { parallelMap } from '@/core/helpers';

// ─── Pricing Prompt ─────────────────────────────────────────────────────────

const PRICING_PROMPT = `You are a pricing assistant for industrial electrical control panel components.
Estimate US distributor market prices (Grainger, AutomationDirect, Allied, DigiKey, etc.)
Return ONLY a valid JSON array, same order as input:
[{"id":"...","unitPrice":12.50,"basis":"Known AutomationDirect catalog price for LC1D09","sources":[{"name":"AutomationDirect","url":"https://www.automationdirect.com/adc/shopping/catalog/...","type":"direct"}]}]
Each item must include:
- "basis": brief explanation of how the price was determined (e.g. "Known Grainger list price", "Estimated from similar ABB contactors in this range", "Based on DigiKey pricing for this exact part")
- "sources": array of 1-2 distributor references, each with "name", "url" (direct product URL or search URL), and "type" ("direct" or "search")
Use null unitPrice for any item you cannot price. No explanation outside JSON.

Items:`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface PricingInput {
  id: string;
  partNumber: string;
  description: string;
  manufacturer: string;
}

interface PriceSource {
  name: string;
  url: string;
  type: 'direct' | 'search';
}

interface PriceResult {
  unitPrice: number | null;
  sources: PriceSource[];
  basis: string;
}

// ─── Estimate Prices ────────────────────────────────────────────────────────

/**
 * Estimate prices for BOM items using AI. Batches items in groups of 10
 * and processes up to 3 batches in parallel.
 */
export async function estimatePrices(items: PricingInput[]): Promise<Record<string, PriceResult>> {
  const BATCH = 10;
  const result: Record<string, PriceResult> = {};
  const batches: PricingInput[][] = [];

  for (let i = 0; i < items.length; i += BATCH) {
    batches.push(items.slice(i, i + BATCH));
  }

  await parallelMap(batches, async (batch: PricingInput[]) => {
    const payload = batch.map(r => ({
      id: String(r.id),
      partNumber: r.partNumber || '',
      description: r.description || '',
      manufacturer: r.manufacturer || '',
    }));

    try {
      const raw = await apiCall({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        messages: [{ role: 'user', content: `${PRICING_PROMPT}\n${JSON.stringify(payload)}` }],
      });
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const m = cleaned.match(/\[[\s\S]*\]/);
      if (m) {
        const arr = JSON.parse(m[0]);
        arr.forEach((r: any) => {
          result[r.id] = {
            unitPrice: r.unitPrice ?? null,
            sources: r.sources || [],
            basis: r.basis || '',
          };
        });
      }
    } catch (e) {
      console.error('Pricing batch error:', e);
    }
  }, 3);

  return result;
}

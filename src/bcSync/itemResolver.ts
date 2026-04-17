// ─── BC Item Resolver ────────────────────────────────────────────────────────
// Lookup or create items in BC catalog from BOM data.

import { lookupItem, createItem, normalizeUom, normalizePart } from '@/services/businessCentral/items';
import type { ExportBomItem } from '@/core/types';
import type { BCItem, BCCreateItemRequest } from '@/services/businessCentral/types';

export interface ResolveResult {
  resolved: { bomItem: ExportBomItem; bcItem: BCItem }[];
  missing: ExportBomItem[];
  errors: { bomItem: ExportBomItem; error: string }[];
}

/**
 * Resolve BOM items against BC catalog.
 * Returns resolved items (found in BC), missing items, and errors.
 */
export async function resolveItems(
  items: ExportBomItem[],
  onProgress?: (msg: string, idx: number, total: number) => void
): Promise<ResolveResult> {
  const resolved: ResolveResult['resolved'] = [];
  const missing: ExportBomItem[] = [];
  const errors: ResolveResult['errors'] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(`Looking up ${item.partNumber}...`, i, items.length);

    if (!item.partNumber.trim()) {
      missing.push(item);
      continue;
    }

    try {
      const bcItem = await lookupItem(item.partNumber);
      if (bcItem) {
        resolved.push({ bomItem: item, bcItem });
      } else {
        missing.push(item);
      }
    } catch (e: any) {
      errors.push({ bomItem: item, error: e.message });
    }
  }

  return { resolved, missing, errors };
}

/**
 * Create missing items in BC and return results.
 */
export async function createMissingItems(
  items: ExportBomItem[],
  defaults: { vendorNo?: string; genProdPostingGroup?: string; inventoryPostingGroup?: string } = {},
  onProgress?: (msg: string, idx: number, total: number) => void
): Promise<{ created: BCItem[]; failed: { item: ExportBomItem; error: string }[] }> {
  const created: BCItem[] = [];
  const failed: { item: ExportBomItem; error: string }[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    onProgress?.(`Creating ${item.partNumber}...`, i, items.length);

    try {
      const req: BCCreateItemRequest = {
        number: item.partNumber,
        displayName: item.description || item.partNumber,
        unitCost: item.unitPrice || 0,
        baseUnitOfMeasureCode: normalizeUom(item.uom),
        ...defaults,
      };
      const bcItem = await createItem(req);
      created.push(bcItem);
    } catch (e: any) {
      failed.push({ item, error: e.message });
    }
  }

  return { created, failed };
}

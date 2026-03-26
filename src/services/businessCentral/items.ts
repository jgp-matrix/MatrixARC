// ─── BC Item Operations ──────────────────────────────────────────────────────

import { bcGet, bcPost, bcPatch, companyApiUrl, getOdataBase } from './client';
import { BC_UOM_MAP } from './types';
import type { BCItem, BCSearchResult, BCCreateItemRequest, BCFuzzyLookupResult } from './types';

/**
 * Exact lookup by part number.
 */
export async function lookupItem(partNumber: string): Promise<BCItem | null> {
  const base = await companyApiUrl();
  const url = `${base}/items?$filter=number eq '${encodeURIComponent(partNumber)}'&$top=1`;
  const data = await bcGet(url);
  const items = (data.value || []).map(mapItem);
  return items[0] || null;
}

/**
 * Search items by number and/or displayName (contains match).
 */
export async function searchItems(
  query: string,
  options: { field?: 'number' | 'displayName' | 'both'; top?: number; skip?: number } = {}
): Promise<BCSearchResult> {
  const { field = 'both', top = 25, skip = 0 } = options;
  const base = await companyApiUrl();
  const q = query.replace(/'/g, "''");

  if (field === 'both') {
    const [byNum, byName] = await Promise.all([
      fetchItems(base, `contains(number,'${q}')`, top, skip),
      fetchItems(base, `contains(displayName,'${q}')`, top, skip),
    ]);
    // Deduplicate by number
    const seen = new Set<string>();
    const items: BCItem[] = [];
    for (const item of [...byNum.items, ...byName.items]) {
      if (!seen.has(item.number)) {
        seen.add(item.number);
        items.push(item);
      }
    }
    return { items: items.slice(0, top), hasMore: byNum.hasMore || byName.hasMore };
  }

  return fetchItems(base, `contains(${field},'${q}')`, top, skip);
}

async function fetchItems(base: string, filter: string, top: number, skip: number): Promise<BCSearchResult> {
  const url = `${base}/items?$filter=${filter}&$top=${top}&$skip=${skip}&$orderby=number`;
  const data = await bcGet(url);
  const items = (data.value || []).map(mapItem);
  return { items, hasMore: items.length >= top };
}

/**
 * Create a new item in BC (v2.0 API + OData PATCH for extended fields).
 */
export async function createItem(req: BCCreateItemRequest): Promise<BCItem> {
  const base = await companyApiUrl();

  // Phase 1: POST to v2.0 API
  const body: any = { displayName: req.displayName };
  if (req.number) body.number = req.number;
  if (req.unitCost) body.unitCost = req.unitCost;
  if (req.itemCategoryCode) body.itemCategoryCode = req.itemCategoryCode;
  if (req.baseUnitOfMeasureCode) body.baseUnitOfMeasureCode = req.baseUnitOfMeasureCode;

  let item: any;
  try {
    item = await bcPost(`${base}/items`, body);
  } catch (e: any) {
    if (e.status === 409 || (e.status === 400 && /duplicate|already exists/i.test(e.body || ''))) {
      const err: any = new Error('Item already exists');
      err.isDuplicate = true;
      throw err;
    }
    throw e;
  }

  // Phase 2: OData PATCH for extended fields (Vendor_No, posting groups)
  const oDataFields: Record<string, string> = {};
  if (req.vendorNo) oDataFields.Vendor_No = req.vendorNo;
  if (req.genProdPostingGroup) oDataFields.Gen_Prod_Posting_Group = req.genProdPostingGroup;
  if (req.inventoryPostingGroup) oDataFields.Inventory_Posting_Group = req.inventoryPostingGroup;

  if (Object.keys(oDataFields).length) {
    // Retry OData patch — new items may not immediately appear in OData index
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await patchItemOData(item.number || req.number!, oDataFields);
        break;
      } catch {
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
      }
    }
  }

  return mapItem(item);
}

/**
 * Patch item extended fields via OData (GET ETag → PATCH).
 */
export async function patchItemOData(itemNo: string, fields: Record<string, any>): Promise<void> {
  const base = getOdataBase();
  const url = `${base}/ItemCard?$filter=No eq '${encodeURIComponent(itemNo)}'&$top=1`;
  const data = await bcGet(url);
  const record = (data.value || [])[0];
  if (!record) throw new Error(`Item ${itemNo} not found in OData`);

  const etag = record['@odata.etag'];
  const patchUrl = `${base}/ItemCard('${encodeURIComponent(itemNo)}')`;
  await bcPatch(patchUrl, fields, etag);
}

/**
 * Normalize unit of measure to BC standard.
 */
export function normalizeUom(uom: string): string {
  const upper = (uom || 'EA').trim().toUpperCase();
  return BC_UOM_MAP[upper] || upper;
}

/**
 * Normalize a part number for fuzzy matching (strip spaces, dashes, dots, uppercase).
 */
export function normalizePart(s: string): string {
  return (s || '').replace(/[\s\-.]/g, '').toUpperCase();
}

/**
 * Fuzzy match two part numbers.
 */
export function partsMatch(a: string, b: string): boolean {
  const na = normalizePart(a);
  const nb = normalizePart(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function mapItem(raw: any): BCItem {
  return {
    number: raw.number || '',
    displayName: raw.displayName || '',
    unitCost: raw.unitCost ?? null,
    unitPrice: raw.unitPrice ?? null,
    inventory: raw.inventory ?? 0,
    lastModifiedDateTime: raw.lastModifiedDateTime,
    vendorNo: raw.vendorNo || raw.Vendor_No || '',
    id: raw.id,
  };
}

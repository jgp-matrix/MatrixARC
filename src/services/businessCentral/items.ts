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

// ─── Fuzzy Lookup ───────────────────────────────────────────────────────────

/**
 * Fuzzy item lookup — tries exact match, stripped search, contains search,
 * then core substring (strip common prefixes/suffixes).
 */
export async function bcFuzzyLookup(partNumber: string): Promise<BCFuzzyLookupResult> {
  if (!partNumber?.trim()) return { match: null, type: null, suggestions: [] };
  const pn = partNumber.trim();

  // 1. Exact match
  const exact = await lookupItem(pn);
  if (exact && exact.unitCost != null) return { match: exact, type: 'exact', suggestions: [] };

  // 2. Stripped search — remove dashes, spaces, special chars
  const stripped = pn.replace(/[-\s\/\\.#_]+/g, '');
  if (stripped.length >= 3) {
    const r2 = await searchItems(stripped, { field: 'number', top: 10 });
    if (r2.items.length === 1) return { match: r2.items[0], type: 'fuzzy', suggestions: [] };
    if (r2.items.length > 1) return { match: null, type: 'fuzzy', suggestions: r2.items.slice(0, 8) };
  }

  // 3. Original as contains search
  if (pn.length >= 3) {
    const r3 = await searchItems(pn, { field: 'number', top: 10 });
    if (r3.items.length === 1) return { match: r3.items[0], type: 'fuzzy', suggestions: [] };
    if (r3.items.length > 1) return { match: null, type: 'fuzzy', suggestions: r3.items.slice(0, 8) };
  }

  // 4. Core substring — strip common prefixes/suffixes
  const core = pn.replace(/^(mtx|mat|mx|ms)[-\s]*/i, '').replace(/[-\s]*(rev[a-z0-9]*|v\d+)$/i, '').trim();
  if (core.length >= 3 && core !== pn && core !== stripped) {
    const r4 = await searchItems(core, { field: 'number', top: 10 });
    if (r4.items.length === 1) return { match: r4.items[0], type: 'fuzzy', suggestions: [] };
    if (r4.items.length > 1) return { match: null, type: 'fuzzy', suggestions: r4.items.slice(0, 8) };
  }

  return { match: null, type: null, suggestions: [] };
}

// ─── Reference Data Lists ───────────────────────────────────────────────────

/**
 * List all item categories from BC.
 */
export async function bcListItemCategories(): Promise<{ code: string; description: string }[]> {
  try {
    const base = await companyApiUrl();
    const url = `${base}/itemCategories?$top=250&$orderby=code`;
    const d = await bcGet(url);
    return (d.value || []).map((c: any) => ({ code: c.code || '', description: c.description || '' }));
  } catch (e) {
    console.warn('bcListItemCategories error:', e);
    return [];
  }
}

/**
 * List all units of measure from BC.
 */
export async function bcListUnitsOfMeasure(): Promise<{ code: string; displayName: string }[]> {
  try {
    const base = await companyApiUrl();
    const url = `${base}/unitsOfMeasure?$top=250&$orderby=code`;
    const d = await bcGet(url);
    return (d.value || []).map((u: any) => ({ code: u.code || '', displayName: u.displayName || '' }));
  } catch (e) {
    console.warn('bcListUnitsOfMeasure error:', e);
    return [];
  }
}

/**
 * List all general product posting groups.
 */
export async function bcListGenProdPostingGroups(): Promise<{ code: string; description: string }[]> {
  try {
    const base = await companyApiUrl();
    const url = `${base}/generalProductPostingGroups?$top=250&$orderby=code`;
    const d = await bcGet(url);
    return (d.value || []).map((g: any) => ({ code: g.code || '', description: g.description || '' }));
  } catch (e) {
    console.warn('bcListGenProdPostingGroups error:', e);
    return [];
  }
}

/**
 * List all inventory posting groups.
 */
export async function bcListInventoryPostingGroups(): Promise<{ code: string; description: string }[]> {
  try {
    const base = await companyApiUrl();
    const url = `${base}/inventoryPostingGroups?$top=250&$orderby=code`;
    const d = await bcGet(url);
    return (d.value || []).map((g: any) => ({ code: g.code || '', description: g.description || '' }));
  } catch (e) {
    console.warn('bcListInventoryPostingGroups error:', e);
    return [];
  }
}

// ─── Item Cost Update ───────────────────────────────────────────────────────

/**
 * Update item unit cost by BC item GUID.
 */
export async function bcUpdateItemCost(itemId: string, newCost: number): Promise<boolean> {
  try {
    const base = await companyApiUrl();
    const url = `${base}/items(${itemId})`;
    await bcPatch(url, { unitCost: newCost }, '*');
    return true;
  } catch (e) {
    console.warn('bcUpdateItemCost:', e);
    return false;
  }
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

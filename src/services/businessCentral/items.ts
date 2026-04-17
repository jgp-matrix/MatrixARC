// ─── BC Item Operations ──────────────────────────────────────────────────────

import { bcGet, bcPost, bcPatch, bcDelete, companyApiUrl, getOdataBase } from './client';
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
 * Lookup an item for quoting — tries by number, then by vendorItemNo.
 */
export async function bcLookupItemForQuote(partNumber: string): Promise<BCItem | null> {
  if (!partNumber?.trim()) return null;
  const pn = partNumber.trim().replace(/'/g, "''");
  const base = await companyApiUrl();
  try {
    for (const filter of [`number eq '${pn}'`, `vendorItemNo eq '${pn}'`]) {
      const data = await bcGet(`${base}/items?$filter=${filter}`);
      const item = (data.value || [])[0];
      if (item) return mapItem(item);
    }
  } catch (e) {
    console.warn('bcLookupItemForQuote:', e);
  }
  return null;
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

// ─── Item Usage Checks ──────────────────────────────────────────────────────

/**
 * Check if an item has ledger entries (is "in use").
 */
export async function bcCheckItemInUse(itemNo: string): Promise<{ inUse: boolean; count: number }> {
  if (!itemNo) return { inUse: false, count: 0 };
  try {
    const base = await companyApiUrl();
    const url = `${base}/itemLedgerEntries?$filter=itemNumber eq '${encodeURIComponent(itemNo)}'&$top=1&$select=itemNumber`;
    const d = await bcGet(url);
    const count = (d.value || []).length;
    return { inUse: count > 0, count };
  } catch (e) {
    console.warn('bcCheckItemInUse error:', e);
    return { inUse: false, count: 0 };
  }
}

/**
 * Check which projects reference this item in job planning lines.
 */
export async function bcCheckItemOnProjects(itemNo: string): Promise<{ onProjects: boolean; projects: string[] }> {
  if (!itemNo) return { onProjects: false, projects: [] };
  try {
    const base = await companyApiUrl();
    const url = `${base}/jobPlanningLines?$filter=No eq '${encodeURIComponent(itemNo)}'&$top=10&$select=No,jobNumber,description`;
    const d = await bcGet(url);
    const lines = d.value || [];
    const projects: string[] = [...new Set(lines.map((l: any) => l.jobNumber).filter(Boolean) as string[])];
    return { onProjects: projects.length > 0, projects };
  } catch (e) {
    console.warn('bcCheckItemOnProjects error:', e);
    return { onProjects: false, projects: [] };
  }
}

// ─── Assembly BOM Operations ────────────────────────────────────────────────

/**
 * Clear all assembly BOM lines for a parent item on a given OData page.
 */
async function bcClearAssemblyBOMLines(parentItemNo: string, bomPage: string): Promise<{ deleted: number; total: number; errors: string[] }> {
  const base = getOdataBase();
  const getUrl = `${base}/${bomPage}?$filter=Parent_Item_No eq '${encodeURIComponent(parentItemNo)}'`;
  const gr = await bcGet(getUrl);
  const lines = (gr.value || []) as any[];
  let deleted = 0;
  const errors: string[] = [];
  for (const line of lines) {
    const lineNo = line.Line_No;
    const etag = line['@odata.etag'];
    const delUrl = `${base}/${bomPage}(Parent_Item_No='${encodeURIComponent(parentItemNo)}',Line_No=${lineNo})`;
    try {
      await bcDelete(delUrl, etag || '*');
      deleted++;
    } catch (e: any) {
      errors.push(`Line ${lineNo}: ${(e.message || '').slice(0, 80)}`);
    }
  }
  return { deleted, total: lines.length, errors };
}

/**
 * Add assembly BOM lines for a parent item.
 */
async function bcAddAssemblyBOMLines(
  parentItemNo: string,
  bomRows: any[],
  onProgress?: (idx: number, total: number, partNumber: string) => void,
  _bomPage?: string
): Promise<{ added: number; skipped: number; errors: string[]; warning: string }> {
  const result = { added: 0, skipped: 0, errors: [] as string[], warning: '' };
  if (!bomRows || !bomRows.length) return result;

  const base = getOdataBase();
  let bomPage = _bomPage || null;
  if (!bomPage) {
    const { discoverODataPages } = await import('./client');
    const allPages = await discoverODataPages();
    bomPage = allPages.find((n: string) => /assembly.*bom|bom.*comp/i.test(n)) || null;
  }
  if (!bomPage) {
    result.warning = 'No Assembly BOM OData page found. In BC, go to Web Services → New → Object Type: Page, Object ID: 36, Service Name: AssemblyBOM, Published: true.';
    return result;
  }

  for (let i = 0; i < bomRows.length; i++) {
    const row = bomRows[i];
    const pn = (row.partNumber || '').trim();
    if (!pn) { result.skipped++; continue; }
    if (onProgress) onProgress(i, bomRows.length, pn);
    try {
      await bcPost(`${base}/${bomPage}`, {
        Parent_Item_No: parentItemNo,
        Type: 'Item',
        No: pn,
        Quantity_per: +(row.qty || 1),
      });
      result.added++;
    } catch (e: any) {
      result.errors.push(`${pn}: ${(e.message || '').slice(0, 120)}`);
      result.skipped++;
    }
  }
  return result;
}

/**
 * Replace all assembly BOM lines for a parent item.
 * Clears existing lines, then adds new ones. Discovers the OData page automatically.
 */
export async function bcReplaceAssemblyBOMLines(
  parentItemNo: string,
  bomRows: any[],
  onProgress?: (idx: number, total: number, msg: string) => void
): Promise<{ deleted: number; added: number; skipped: number; errors: string[]; warning: string }> {
  const result = { deleted: 0, added: 0, skipped: 0, errors: [] as string[], warning: '' };

  const { discoverODataPages } = await import('./client');
  const allPages = await discoverODataPages();
  const bomPage = allPages.find((n: string) => /assembly.*bom|bom.*comp/i.test(n)) || null;
  if (!bomPage) {
    result.warning = 'No Assembly BOM OData page found. In BC, go to Web Services → New → Object Type: Page, Object ID: 36, Service Name: AssemblyBOM, Published: true.';
    return result;
  }

  if (onProgress) onProgress(-1, bomRows.length, 'Clearing existing BOM lines…');
  try {
    const clear = await bcClearAssemblyBOMLines(parentItemNo, bomPage);
    result.deleted = clear.deleted;
    if (clear.errors.length) result.errors.push(...clear.errors.map(e => '[clear] ' + e));
  } catch (ce: any) {
    result.errors.push('[clear] ' + ce.message);
  }

  const addResult = await bcAddAssemblyBOMLines(parentItemNo, bomRows, onProgress, bomPage);
  result.added = addResult.added;
  result.skipped = addResult.skipped;
  result.errors.push(...addResult.errors);
  result.warning = addResult.warning;
  return result;
}

// Aliases for callers that use the bcLookupItem naming convention
export const bcLookupItem = lookupItem;

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

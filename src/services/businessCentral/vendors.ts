// ─── BC Vendor Operations ────────────────────────────────────────────────────

import { bcGet, companyApiUrl, getOdataBase } from './client';

const _vendorCache = new Map<string, string>();

/**
 * Get vendor display name by vendor number (cached).
 */
export async function getVendorName(vendorNo: string): Promise<string> {
  if (!vendorNo) return '';
  if (_vendorCache.has(vendorNo)) return _vendorCache.get(vendorNo)!;

  const base = await companyApiUrl();
  const url = `${base}/vendors?$filter=number eq '${encodeURIComponent(vendorNo)}'&$top=1`;

  try {
    const data = await bcGet(url);
    const vendor = (data.value || [])[0];
    const name = vendor?.displayName || vendorNo;
    _vendorCache.set(vendorNo, name);
    return name;
  } catch {
    return vendorNo;
  }
}

/**
 * Get vendor number for an item via OData ItemCard.
 */
export async function getItemVendorNo(itemNo: string): Promise<string> {
  const base = getOdataBase();
  const url = `${base}/ItemCard?$filter=No eq '${encodeURIComponent(itemNo)}'&$top=1&$select=Vendor_No`;

  try {
    const data = await bcGet(url);
    return (data.value || [])[0]?.Vendor_No || '';
  } catch {
    return '';
  }
}

/**
 * Get all vendors (for dropdowns).
 */
export async function getAllVendors(): Promise<{ number: string; displayName: string }[]> {
  const base = await companyApiUrl();
  const url = `${base}/vendors?$top=500&$orderby=displayName`;

  try {
    const data = await bcGet(url);
    return (data.value || []).map((v: any) => ({
      number: v.number,
      displayName: v.displayName,
    }));
  } catch {
    return [];
  }
}

/**
 * Get last purchase info for an item (from posted purchase invoices).
 */
export async function getLastPurchase(itemNo: string): Promise<{ directUnitCost: number; postingDate: string } | null> {
  const base = await companyApiUrl();
  const url = `${base}/purchaseInvoiceLines?$filter=lineObjectNumber eq '${encodeURIComponent(itemNo)}'&$orderby=postingDate desc&$top=1`;

  try {
    const data = await bcGet(url);
    const line = (data.value || [])[0];
    if (!line) return null;
    return { directUnitCost: line.directUnitCost || 0, postingDate: line.postingDate || '' };
  } catch {
    return null;
  }
}

// ─── Aliases & Convenience ──────────────────────────────────────────────────

/** Alias for getAllVendors — matches legacy monolith name. */
export const bcListVendors = getAllVendors;

/**
 * Build a vendor number → display name map from all vendors.
 */
let _vendorMapCache: Record<string, string> | null = null;

export async function bcGetVendorMap(): Promise<Record<string, string>> {
  if (_vendorMapCache) return _vendorMapCache;
  const vendors = await getAllVendors();
  if (!vendors.length) return {};
  _vendorMapCache = {};
  vendors.forEach(v => { _vendorMapCache![v.number] = v.displayName; });
  return _vendorMapCache;
}

/**
 * Resolve a vendor number to display name from the cached map.
 */
export function bcResolveVendorName(vendorNo: string): string {
  if (!vendorNo || !_vendorMapCache) return '';
  return _vendorMapCache[vendorNo] || '';
}

/**
 * Get vendor email address by vendor number.
 */
const _vendorEmailCache: Record<string, string> = {};

export async function bcGetVendorEmail(vendorNo: string): Promise<string> {
  if (!vendorNo) return '';
  if (_vendorEmailCache[vendorNo] !== undefined) return _vendorEmailCache[vendorNo];

  try {
    const base = await companyApiUrl();
    const url = `${base}/vendors?$filter=number eq '${encodeURIComponent(vendorNo)}'&$select=number,email`;
    const d = await bcGet(url);
    const v = (d.value || [])[0];
    const email = v?.email || '';
    _vendorEmailCache[vendorNo] = email;
    return email;
  } catch {
    return '';
  }
}

export function clearVendorCache() {
  _vendorCache.clear();
  _vendorMapCache = null;
  Object.keys(_vendorEmailCache).forEach(k => delete _vendorEmailCache[k]);
}

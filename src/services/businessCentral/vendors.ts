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

export function clearVendorCache() {
  _vendorCache.clear();
}

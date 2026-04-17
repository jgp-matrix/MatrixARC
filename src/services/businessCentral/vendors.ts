// ─── BC Vendor Operations ────────────────────────────────────────────────────

import { bcGet, bcPost, bcPatch, companyApiUrl, getOdataBase, discoverODataPages } from './client';

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

// ─── Vendor CRUD ───────────────────────────────────────────────────────────

/**
 * Create a new vendor in BC, optionally patching posting groups via OData.
 */
export async function bcCreateVendor(
  displayName: string,
  phone?: string,
  email?: string,
  opts: { genBusPostGroup?: string; vendorPostGroup?: string; taxAreaCode?: string } = {}
): Promise<{ number: string; displayName: string }> {
  const base = await companyApiUrl();
  const body: any = { displayName };
  if (phone) body.phoneNumber = phone;
  if (email) body.email = email;

  const d = await bcPost(`${base}/vendors`, body);
  const vendorNo = d.number || '';

  // Patch posting groups via OData if provided
  if (vendorNo && (opts.genBusPostGroup || opts.vendorPostGroup || opts.taxAreaCode)) {
    try {
      const patch: Record<string, string> = {};
      if (opts.genBusPostGroup) patch.Gen_Bus_Posting_Group = opts.genBusPostGroup;
      if (opts.vendorPostGroup) patch.Vendor_Posting_Group = opts.vendorPostGroup;
      if (opts.taxAreaCode) patch.Tax_Area_Code = opts.taxAreaCode;
      const odataBase = getOdataBase();
      const gd = await bcGet(`${odataBase}/Vendor_Card_Excel?$filter=No eq '${vendorNo}'`);
      const rec = (gd.value || [])[0];
      if (rec) {
        const etag = rec['@odata.etag'] || '*';
        await bcPatch(`${odataBase}/Vendor_Card_Excel('${vendorNo}')`, patch, etag);
      }
    } catch (e) {
      console.warn('Vendor posting group patch failed:', e);
    }
  }

  return { number: vendorNo, displayName: d.displayName || displayName };
}

// ─── Vendor Contacts ───────────────────────────────────────────────────────

/**
 * Fetch the vendor's main email + linked contacts from BC.
 * Returns an array of { name, email, type } objects.
 */
export async function bcFetchVendorContacts(
  vendorNo: string,
  vendorName?: string
): Promise<{ name: string; email: string; type: string }[]> {
  try {
    const base = await companyApiUrl();

    // Resolve vendorNo from name if not provided
    if (!vendorNo && vendorName) {
      const nr = await bcGet(`${base}/vendors?$filter=displayName eq '${(vendorName || '').replace(/'/g, "''")}'&$select=number,displayName,email,phoneNumber&$top=1`);
      const nd = (nr.value || [])[0];
      if (nd) vendorNo = nd.number;
    }
    if (!vendorNo) return [];

    // Get vendor main email
    const vr = await bcGet(`${base}/vendors?$filter=number eq '${encodeURIComponent(vendorNo)}'&$select=number,displayName,email,phoneNumber`);
    const contacts: { name: string; email: string; type: string }[] = [];
    const vd = (vr.value || [])[0];
    if (vd?.email) contacts.push({ name: vd.displayName || 'Main', email: vd.email, type: 'vendor' });

    // Fetch contacts linked to vendor by companyName
    const vendorDisplayName = contacts[0]?.name || vendorName || '';
    try {
      const cr = await bcGet(`${base}/contacts?$filter=companyName eq '${(vendorDisplayName).replace(/'/g, "''")}'&$select=number,displayName,email,companyName&$top=20`);
      const cd = cr.value || [];
      cd.forEach((c: any) => {
        if (c.email && !contacts.some(x => x.email.toLowerCase() === c.email.toLowerCase())) {
          contacts.push({ name: c.displayName || 'Contact', email: c.email, type: 'contact' });
        }
      });
    } catch (e) {
      console.log('[BC] Contacts API not available, using vendor email only');
    }
    return contacts;
  } catch (e: any) {
    console.warn('[BC] fetchVendorContacts error:', e.message);
    return [];
  }
}

// ─── Customer Contacts ─────────────────────────────────────────────────────

/**
 * Fetch contacts linked to a BC customer by customer number.
 * Uses OData Customer_Card to resolve company contact number, then queries contacts API.
 */
export async function bcFetchCustomerContacts(
  customerNumber: string
): Promise<{ number: string; displayName: string; email: string; phone: string; companyName: string }[]> {
  if (!customerNumber) return [];
  try {
    const base = await companyApiUrl();

    // Step 1: Get the company contact number via OData Customer Card
    let companyContactNo = '';
    let custName = '';
    try {
      const allPages = await discoverODataPages();
      const custPage = allPages.find(n => /^Customer_Card/i.test(n));
      if (custPage) {
        const odataBase = getOdataBase();
        const cd = await bcGet(`${odataBase}/${custPage}?$filter=No eq '${customerNumber}'&$select=No,Primary_Contact_No,Contact_No,Name&$top=1`);
        const rec = (cd.value || [])[0];
        if (rec) {
          companyContactNo = rec.Primary_Contact_No || rec.Contact_No || '';
          custName = rec.Name || '';
        }
      }
    } catch { /* fallback below */ }

    // Fallback: REST API customer -> use displayName
    if (!companyContactNo && !custName) {
      try {
        const cd = await bcGet(`${base}/customers?$filter=number eq '${customerNumber}'&$select=number,displayName&$top=1`);
        const rec = (cd.value || [])[0];
        if (rec) custName = rec.displayName || '';
      } catch { /* skip */ }
    }

    // Step 2: Fetch contacts by companyNumber or companyName
    let filterParam = '';
    if (companyContactNo) {
      filterParam = `$filter=companyNumber eq '${companyContactNo}'`;
    } else if (custName) {
      filterParam = '$filter=' + encodeURIComponent(`companyName eq '${custName.replace(/'/g, "''")}'`);
    }
    if (!filterParam) {
      console.warn('bcFetchCustomerContacts: no filter for', customerNumber);
      return [];
    }

    const d = await bcGet(`${base}/contacts?${filterParam}&$select=number,displayName,email,phoneNumber,companyName,type&$top=50&$orderby=displayName`);
    return (d.value || [])
      .filter((c: any) => c.type === 'Person' || (c.displayName && c.displayName !== c.companyName))
      .map((c: any) => ({
        number: c.number || '',
        displayName: c.displayName || '',
        email: c.email || '',
        phone: c.phoneNumber || '',
        companyName: c.companyName || '',
      }));
  } catch (e) {
    console.warn('bcFetchCustomerContacts error:', e);
    return [];
  }
}

// ─── Create Contact ────────────────────────────────────────────────────────

/**
 * Create a person-type contact in BC linked to a customer.
 * Resolves the company contact number (CT######) from the customer number (C#####)
 * since BC contacts API's companyNumber field expects the company-type contact number.
 */
export async function bcCreateContact(
  displayName: string,
  customerNumber: string,
  email?: string,
  phone?: string
): Promise<{ number: string; displayName: string; email: string; phone: string }> {
  const base = await companyApiUrl();

  // Resolve company contact number from customer number
  let companyContactNo = '';
  try {
    const allPages = await discoverODataPages();
    const custPage = allPages.find(n => /^Customer_Card/i.test(n));
    if (custPage) {
      const odataBase = getOdataBase();
      const cd = await bcGet(`${odataBase}/${custPage}?$filter=No eq '${customerNumber}'&$select=No,Primary_Contact_No,Contact_No&$top=1`);
      const rec = (cd.value || [])[0];
      if (rec) companyContactNo = rec.Primary_Contact_No || rec.Contact_No || '';
    }
  } catch { /* fallback below */ }

  // Fallback: find the company-type contact by customer name
  if (!companyContactNo) {
    try {
      const cd = await bcGet(`${base}/customers?$filter=number eq '${customerNumber}'&$select=number,displayName&$top=1`);
      const cust = (cd.value || [])[0];
      if (cust?.displayName) {
        const filterParam = '$filter=' + encodeURIComponent(`companyName eq '${cust.displayName.replace(/'/g, "''")}' and type eq 'Company'`);
        const ccd = await bcGet(`${base}/contacts?${filterParam}&$select=number&$top=1`);
        const rec = (ccd.value || [])[0];
        if (rec) companyContactNo = rec.number || '';
      }
    } catch { /* skip */ }
  }

  if (!companyContactNo) {
    console.warn('bcCreateContact: could not resolve company contact number for customer', customerNumber);
  }

  const body: any = { displayName, type: 'Person' };
  if (companyContactNo) body.companyNumber = companyContactNo;
  if (email) body.email = email;
  if (phone) body.phoneNumber = phone;

  const d = await bcPost(`${base}/contacts`, body);
  return {
    number: d.number || '',
    displayName: d.displayName || displayName,
    email: d.email || email || '',
    phone: d.phoneNumber || phone || '',
  };
}

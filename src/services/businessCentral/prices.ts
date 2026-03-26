// ─── BC Purchase Price Operations ────────────────────────────────────────────

import { bcGet, bcPost, bcPatch, getOdataBase } from './client';
import type { BCPurchasePrice, BCPricePushResult } from './types';

/**
 * Batch-fetch purchase prices for multiple part numbers (30 per request).
 */
export async function fetchPurchasePrices(partNumbers: string[]): Promise<Map<string, BCPurchasePrice>> {
  const result = new Map<string, BCPurchasePrice>();
  const base = getOdataBase();
  const BATCH = 30;

  for (let i = 0; i < partNumbers.length; i += BATCH) {
    const batch = partNumbers.slice(i, i + BATCH);
    const filter = batch.map(pn => `Item_No eq '${pn.replace(/'/g, "''")}'`).join(' or ');
    const url = `${base}/PurchasePrices?$filter=${encodeURIComponent(filter)}&$orderby=Starting_Date desc`;

    try {
      const data = await bcGet(url);
      for (const rec of data.value || []) {
        const itemNo = rec.Item_No;
        // Keep most recent price per item
        if (!result.has(itemNo)) {
          result.set(itemNo, {
            vendorNo: rec.Vendor_No || '',
            directUnitCost: rec.Direct_Unit_Cost || 0,
            startingDate: rec.Starting_Date || '',
            uom: rec.Unit_of_Measure_Code || '',
          });
        }
      }
    } catch (e) {
      console.warn('fetchPurchasePrices batch error:', e);
    }
  }

  return result;
}

/**
 * Push a purchase price to BC (create or update).
 */
export async function pushPurchasePrice(
  itemNo: string,
  vendorNo: string,
  unitCost: number,
  startingDate: string,
  uom?: string
): Promise<BCPricePushResult> {
  const base = getOdataBase();

  try {
    // Check if record exists
    const filter = `Item_No eq '${itemNo.replace(/'/g, "''")}' and Vendor_No eq '${vendorNo.replace(/'/g, "''")}'`;
    const url = `${base}/PurchasePrices?$filter=${encodeURIComponent(filter)}&$top=1`;
    const data = await bcGet(url);
    const existing = (data.value || [])[0];

    if (existing) {
      // PATCH existing
      const etag = existing['@odata.etag'];
      const patchUrl = `${base}/PurchasePrices(Item_No='${encodeURIComponent(itemNo)}',Vendor_No='${encodeURIComponent(vendorNo)}',Starting_Date='${existing.Starting_Date}',Currency_Code='',Variant_Code='',Unit_of_Measure_Code='${existing.Unit_of_Measure_Code || ''}')`;
      await bcPatch(patchUrl, {
        Direct_Unit_Cost: unitCost,
        Starting_Date: startingDate,
      }, etag);
    } else {
      // POST new
      const body: any = {
        Item_No: itemNo,
        Vendor_No: vendorNo,
        Direct_Unit_Cost: unitCost,
        Starting_Date: startingDate,
      };
      if (uom) body.Unit_of_Measure_Code = uom;
      await bcPost(`${base}/PurchasePrices`, body);
    }

    return { ok: true };
  } catch (e: any) {
    console.error('pushPurchasePrice error:', e);
    return { ok: false, reason: 'error' };
  }
}

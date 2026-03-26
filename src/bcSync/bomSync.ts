// ─── BC Assembly BOM Sync ────────────────────────────────────────────────────
// Replace assembly BOM lines in BC.

import { bcGet, bcPost, bcDelete, companyApiUrl, getOdataBase } from '@/services/businessCentral/client';
import type { ExportBomItem } from '@/core/types';
import type { BCBomSyncResult } from '@/services/businessCentral/types';

/**
 * Check if an item has ledger entries (is "in use").
 */
export async function checkItemInUse(itemNo: string): Promise<boolean> {
  const base = await companyApiUrl();
  const url = `${base}/itemLedgerEntries?$filter=itemNumber eq '${encodeURIComponent(itemNo)}'&$top=1`;
  try {
    const data = await bcGet(url);
    return (data.value || []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Check which projects reference this item in planning lines.
 */
export async function checkItemOnProjects(itemNo: string): Promise<string[]> {
  const base = await companyApiUrl();
  const url = `${base}/jobPlanningLines?$filter=no eq '${encodeURIComponent(itemNo)}'&$select=jobNo&$top=50`;
  try {
    const data = await bcGet(url);
    const projects = new Set<string>();
    for (const line of data.value || []) {
      if (line.jobNo) projects.add(line.jobNo);
    }
    return [...projects];
  } catch {
    return [];
  }
}

/**
 * Replace all assembly BOM lines for a parent item.
 * Deletes existing lines, then adds new ones.
 */
export async function replaceAssemblyBomLines(
  parentItemNo: string,
  items: ExportBomItem[],
  onProgress?: (msg: string) => void
): Promise<BCBomSyncResult> {
  const odataBase = getOdataBase();
  let deleted = 0;
  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Step 1: Delete existing lines
  onProgress?.('Clearing existing assembly BOM lines...');
  try {
    const filter = `Parent_Item_No eq '${parentItemNo.replace(/'/g, "''")}'`;
    const url = `${odataBase}/AssemblyBOM?$filter=${encodeURIComponent(filter)}`;
    const data = await bcGet(url);

    for (const line of data.value || []) {
      try {
        const etag = line['@odata.etag'];
        const key = `Parent_Item_No='${encodeURIComponent(parentItemNo)}',Line_No=${line.Line_No}`;
        await bcDelete(`${odataBase}/AssemblyBOM(${key})`, etag);
        deleted++;
      } catch (e: any) {
        errors.push(`Delete line ${line.Line_No}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
  } catch (e: any) {
    errors.push(`Clear existing lines: ${e.message}`);
  }

  // Step 2: Add new lines
  let lineNo = 10000;
  for (const item of items) {
    if (!item.partNumber.trim()) {
      skipped++;
      continue;
    }

    onProgress?.(`Adding ${item.partNumber}...`);

    try {
      await bcPost(`${odataBase}/AssemblyBOM`, {
        Parent_Item_No: parentItemNo,
        Line_No: lineNo,
        Type: 'Item',
        No: item.partNumber,
        Description: (item.description || '').slice(0, 100),
        Quantity_Per: item.quantity || 1,
        Unit_of_Measure_Code: item.uom || 'EA',
      });
      added++;
    } catch (e: any) {
      errors.push(`Add ${item.partNumber}: ${e.message}`);
    }

    lineNo += 10000;
    await new Promise(r => setTimeout(r, 100));
  }

  return { deleted, added, skipped, errors };
}

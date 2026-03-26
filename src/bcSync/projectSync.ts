// ─── BC Project & Planning Line Sync ─────────────────────────────────────────
// Create BC projects, sync planning lines for panels.

import { bcGet, bcPost, bcPatch, bcDelete, companyApiUrl, getOdataBase } from '@/services/businessCentral/client';
import type { PanelExport } from '@/core/types';
import type { BCProject, BCSyncResult } from '@/services/businessCentral/types';

/**
 * Create a new project in Business Central.
 */
export async function createProject(
  displayName: string,
  customerNumber: string
): Promise<BCProject> {
  const base = await companyApiUrl();

  // Step 1: POST to v2.0 API
  const project = await bcPost(`${base}/projects`, { displayName });

  // Step 2: PATCH defaults via OData
  try {
    const odataBase = getOdataBase();
    const filterUrl = `${odataBase}/ProjectCard?$filter=No eq '${project.number}'&$top=1`;
    const data = await bcGet(filterUrl);
    const record = (data.value || [])[0];
    if (record) {
      const etag = record['@odata.etag'];
      const today = new Date().toISOString().split('T')[0];
      await bcPatch(`${odataBase}/ProjectCard('${project.number}')`, {
        Bill_to_Customer_No: customerNumber,
        Global_Dimension_1_Code: project.number,
        Location_Code: 'MAIN',
        Status: 'Quote',
        Job_Posting_Group: 'DEFAULT',
        WIP_Method: 'COMPLETED CONTRACT',
        Bin_Code: 'PROJ-IN',
        Starting_Date: today,
      }, etag);
    }
  } catch (e) {
    console.warn('OData patch for project defaults failed:', e);
  }

  return {
    id: project.id,
    number: project.number,
    displayName: project.displayName || displayName,
    customerNumber,
  };
}

/**
 * Sync planning lines for a panel to a BC project.
 *
 * Planning line structure:
 *   10000 — PROGRESS BILLING (Billable, Item, qty=lineQty, price=sellPrice)
 *   20000 — ENGINEERING (Budget, Resource R0020)
 *   30000 — CUT (Budget, Resource R0020, qty=cut hours)
 *   40000 — LAYOUT (Budget, Resource R0020, qty=layout hours)
 *   50000 — WIRE (Budget, Resource R0020, qty=wire hours)
 *   60000+ — BOM Items (Budget, Item type, step 10000)
 */
export async function syncPanelPlanningLines(
  projectNumber: string,
  panel: PanelExport,
  onProgress?: (msg: string) => void
): Promise<BCSyncResult> {
  const odataBase = getOdataBase();
  const taskNo = String(20000 + panel.panelIndex * 100 + 10);
  const today = new Date().toISOString().split('T')[0];

  // Detect whether BC uses "Project_No" or "Job_No" field
  const fieldNames = await detectFieldNames(odataBase, projectNumber);
  const FP_NO = fieldNames.projectField;
  const FP_TASK_NO = fieldNames.taskField;

  // Step 1: Delete existing lines for this task
  onProgress?.('Clearing existing planning lines...');
  await clearPlanningLines(odataBase, FP_NO, FP_TASK_NO, projectNumber, taskNo);

  // Step 2: Build new lines
  const lines: any[] = [];

  // Progress Billing line
  lines.push({
    [FP_NO]: projectNumber,
    [FP_TASK_NO]: taskNo,
    Line_No: 10000,
    Planning_Date: today,
    Line_Type: 'Billable',
    Type: 'Item',
    No: '', // placeholder — will be set to panel item number if available
    Description: `${panel.panelName} - Progress Billing`,
    Quantity: panel.lineQty,
    Unit_Price: panel.sellPrice,
    Location_Code: 'MAIN',
  });

  // Labor lines
  const laborCategories = [
    { lineNo: 20000, name: 'ENGINEERING', hours: panel.labor.engineering },
    { lineNo: 30000, name: 'CUT', hours: panel.labor.cut },
    { lineNo: 40000, name: 'LAYOUT', hours: panel.labor.layout },
    { lineNo: 50000, name: 'WIRE', hours: panel.labor.wire },
  ];

  for (const cat of laborCategories) {
    lines.push({
      [FP_NO]: projectNumber,
      [FP_TASK_NO]: taskNo,
      Line_No: cat.lineNo,
      Planning_Date: today,
      Line_Type: 'Budget',
      Type: 'Resource',
      No: 'R0020',
      Description: cat.name,
      Quantity: cat.hours,
      Unit_Price: 0,
      Location_Code: 'MAIN',
    });
  }

  // BOM item lines
  let lineNo = 60000;
  for (const item of panel.items) {
    lines.push({
      [FP_NO]: projectNumber,
      [FP_TASK_NO]: taskNo,
      Line_No: lineNo,
      Planning_Date: today,
      Line_Type: 'Budget',
      Type: 'Item',
      No: item.partNumber,
      Description: (item.description || '').slice(0, 100),
      Quantity: item.quantity || 1,
      Unit_Price: item.unitPrice || 0,
      Location_Code: 'MAIN',
    });
    lineNo += 10000;
  }

  // Step 3: POST lines with retry
  let created = 0;
  const failed: BCSyncResult['failed'] = [];

  for (const line of lines) {
    onProgress?.(`Posting line ${line.Line_No}: ${line.Description}...`);

    try {
      await bcPost(`${odataBase}/ProjectPlanningLines`, line);
      created++;
    } catch (e: any) {
      // Fallback: try as text line
      try {
        await bcPost(`${odataBase}/ProjectPlanningLines`, { ...line, Type: 'Text', No: '' });
        created++;
      } catch (e2: any) {
        failed.push({
          partNumber: line.No,
          description: line.Description,
          rowId: '',
          lineNo: line.Line_No,
          error: e2.message,
        });
      }
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 150));
  }

  return { created, total: lines.length, failed };
}

async function clearPlanningLines(
  odataBase: string,
  fpNo: string,
  fpTaskNo: string,
  projectNumber: string,
  taskNo: string
): Promise<void> {
  const filter = `${fpNo} eq '${projectNumber}' and ${fpTaskNo} eq '${taskNo}'`;
  const url = `${odataBase}/ProjectPlanningLines?$filter=${encodeURIComponent(filter)}`;

  try {
    const data = await bcGet(url);
    for (const line of data.value || []) {
      const etag = line['@odata.etag'];
      if (etag) {
        const key = `${fpNo}='${projectNumber}',${fpTaskNo}='${taskNo}',Line_No=${line.Line_No}`;
        await bcDelete(`${odataBase}/ProjectPlanningLines(${key})`, etag);
        await new Promise(r => setTimeout(r, 100));
      }
    }
  } catch (e) {
    console.warn('clearPlanningLines error:', e);
  }
}

async function detectFieldNames(
  odataBase: string,
  projectNumber: string
): Promise<{ projectField: string; taskField: string }> {
  // Try "Project_No" first, fall back to "Job_No"
  try {
    const url = `${odataBase}/ProjectPlanningLines?$filter=Project_No eq '${projectNumber}'&$top=1`;
    await bcGet(url);
    return { projectField: 'Project_No', taskField: 'Project_Task_No' };
  } catch {
    return { projectField: 'Job_No', taskField: 'Job_Task_No' };
  }
}

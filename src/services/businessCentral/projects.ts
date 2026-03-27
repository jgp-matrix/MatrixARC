// ─── BC Project, Customer & Task Operations ─────────────────────────────────

import {
  bcGet, bcPost, bcPatch, bcDelete,
  companyApiUrl, getOdataBase,
  discoverODataPages, getPlanPageMeta,
} from './client';
import type { BCProject } from './types';

// ─── Project CRUD ───────────────────────────────────────────────────────────

/**
 * Create a new project in Business Central with defaults patched via OData.
 */
export async function bcCreateProject(
  displayName: string,
  customerNumber: string
): Promise<BCProject> {
  if (!customerNumber) throw new Error('A customer must be selected');
  const base = await companyApiUrl();

  let projectId: string | null = null;
  try {
    // Step 1: POST project
    const project = await bcPost(`${base}/projects`, { displayName });
    projectId = project.id;

    // Step 2: PATCH defaults via OData
    const today = new Date().toISOString().split('T')[0];
    const patchFields: Record<string, string> = {
      Bill_to_Customer_No: customerNumber,
      Global_Dimension_1_Code: project.number,
      Location_Code: 'MAIN',
      Status: 'Quote',
      Job_Posting_Group: 'DEFAULT',
      Bin_Code: 'PROJ-IN',
      WIP_Method: 'COMPLETED CONTRACT',
      WIP_Posting_Method: 'Per Project',
      Starting_Date: today,
    };

    try {
      await bcPatchJobOData(project.number, patchFields);
    } catch (e) {
      console.warn('bcCreateProject: OData defaults patch failed:', e);
    }

    return {
      id: project.id,
      number: project.number,
      displayName: project.displayName || displayName,
      customerNumber,
      customerName: undefined,
    };
  } catch (e) {
    // Rollback: delete the BC project if it was created
    if (projectId) {
      try {
        const g = await bcGet(`${base}/projects(${projectId})`);
        const etag = g['@odata.etag'] || '*';
        await bcDelete(`${base}/projects(${projectId})`, etag);
        console.log('bcCreateProject: rolled back BC project', projectId);
      } catch (re) {
        console.warn('bcCreateProject: rollback failed', re);
      }
    }
    throw e;
  }
}

/**
 * Delete a BC project by its GUID.
 */
export async function bcDeleteProject(bcProjectId: string): Promise<void> {
  const base = await companyApiUrl();
  const g = await bcGet(`${base}/projects(${bcProjectId})`);
  const etag = g['@odata.etag'] || '*';
  await bcDelete(`${base}/projects(${bcProjectId})`, etag);
}

/**
 * Load all projects from BC v2.0 API.
 */
export async function bcLoadAllProjects(): Promise<any[]> {
  try {
    const base = await companyApiUrl();
    const d = await bcGet(`${base}/projects?$top=1000`);
    return d.value || [];
  } catch (e) {
    console.warn('bcLoadAllProjects error:', e);
    return [];
  }
}

/**
 * Load all projects via OData (includes Bill_to_Customer_No, Bill_to_Name, etc.).
 */
export async function bcLoadAllProjectsOData(): Promise<any[]> {
  try {
    const allPages = await discoverODataPages();
    const projectPage = allPages.find(n => /^project(card)?$/i.test(n)) || null;
    if (!projectPage) { console.warn('bcLoadAllProjectsOData: no project OData page found'); return []; }
    const odataBase = getOdataBase();
    const d = await bcGet(`${odataBase}/${projectPage}`);
    return d.value || [];
  } catch (e) {
    console.warn('bcLoadAllProjectsOData error:', e);
    return [];
  }
}

// ─── Project OData Patching ─────────────────────────────────────────────────

/**
 * PATCH a BC project via OData ProjectCard (or JobCard).
 * Discovers the correct OData page automatically.
 */
export async function bcPatchJobOData(jobNo: string, fields: Record<string, any>): Promise<void> {
  if (!jobNo || !fields || !Object.keys(fields).length) return;

  const allPages = await discoverODataPages();
  const projectPage = allPages.find(n => /^(project(card)?|job(card)?)$/i.test(n)) || null;
  if (!projectPage) {
    console.warn('bcPatchJobOData: No project OData page found. Publish page 88 as "ProjectCard" in BC Web Services.');
    return;
  }

  const odataBase = getOdataBase();
  const filterUrl = `${odataBase}/${projectPage}?$filter=No eq '${encodeURIComponent(jobNo)}'`;
  const gd = await bcGet(filterUrl);
  const rec = (gd.value || [])[0];
  if (!rec) throw new Error(`Project '${jobNo}' not found in OData page '${projectPage}'`);

  const etag = rec['@odata.etag'] || '*';
  const patchUrl = `${odataBase}/${projectPage}('${encodeURIComponent(jobNo)}')`;
  await bcPatch(patchUrl, fields, etag);
}

// ─── Job GUID Resolution ────────────────────────────────────────────────────

async function bcGetJobGuid(jobNumber: string): Promise<{ compId: string; jobId: string }> {
  const base = await companyApiUrl();
  const url = `${base}/projects?$filter=number eq '${encodeURIComponent(jobNumber)}'&$select=id,number`;
  const d = await bcGet(url);
  const job = (d.value || [])[0];
  if (!job) throw new Error(`BC project '${jobNumber}' not found`);
  // Extract compId from the base URL (it's embedded)
  const compId = base.match(/companies\(([^)]+)\)/)?.[1] || '';
  return { compId, jobId: job.id };
}

// ─── Attachment Check ───────────────────────────────────────────────────────

/**
 * Check if a PDF attachment exists on a BC project.
 * Returns true if exact filename match found, or if any PDF exists. Null on error.
 */
export async function bcCheckAttachmentExists(jobNumber: string, fileName: string): Promise<boolean | null> {
  try {
    const base = await companyApiUrl();
    const { jobId } = await bcGetJobGuid(jobNumber);
    const compId = base.match(/companies\(([^)]+)\)/)?.[1] || '';

    // Exact filename match
    const url = `https://api.businesscentral.dynamics.com${base.replace(/.*\/v2\.0/, '/v2.0')}/projects(${jobId})/documentAttachments?$filter=fileName eq '${encodeURIComponent(fileName)}'`;
    try {
      const d = await bcGet(`${base.split('/companies')[0].replace(/companies.*/, '')}/../../../${base}/projects(${jobId})/documentAttachments?$filter=fileName eq '${encodeURIComponent(fileName)}'`);
      if ((d.value || []).length > 0) return true;
    } catch { /* fall through to generic check */ }

    // Fallback: any PDF on the project
    try {
      const apiBase = base;
      const d2 = await bcGet(`${apiBase}/projects(${jobId})/documentAttachments`);
      return (d2.value || []).some((a: any) => /\.pdf$/i.test(a.fileName || ''));
    } catch { return null; }
  } catch {
    return null;
  }
}

// ─── Task Structure ─────────────────────────────────────────────────────────

/**
 * Create the ARC-defined BC Job Task hierarchy for a new project.
 *
 * Numbering scheme:
 *   10000   = Project header (Begin-Total)
 *   20N00   = Panel N Begin-Total
 *   20N10   = Panel N BOM / Drawing work (Posting)
 *   20N20   = Engineering / Design (Posting)
 *   20N99   = Panel N End-Total
 *   99999   = Project End-Total
 */
export async function bcCreatePanelTaskStructure(
  projectNumber: string,
  projectName: string,
  panels: { drawingDesc?: string; name?: string; drawingNo?: string; drawingRev?: string }[]
): Promise<number> {
  const allPages = await discoverODataPages();
  const taskPage = allPages.find(n => /^project.?task/i.test(n))
    || allPages.find(n => /job.?task/i.test(n)) || null;
  if (!taskPage) {
    const msg = `No Project Task OData page found (available: ${allPages.join(', ') || 'none'}). Publish BC web service page 1002 as 'ProjectTaskLines'.`;
    console.warn('bcCreatePanelTaskStructure:', msg);
    throw new Error(msg);
  }

  const odataBase = getOdataBase();

  function makeTask(prefix: string, noVal: string, taskNoVal: string, desc: string, type: string, extra: Record<string, any> = {}) {
    return { [`${prefix}_No`]: noVal, [`${prefix}_Task_No`]: taskNoVal, Description: desc, [`${prefix}_Task_Type`]: type, ...extra };
  }

  function buildTasks(prefix: string) {
    const t: Record<string, any>[] = [];
    t.push(makeTask(prefix, projectNumber, '10000', `${projectNumber} - ${projectName}`, 'Begin-Total'));
    for (let i = 0; i < panels.length; i++) {
      const n = i + 1, base = 20000 + n * 100, suffix = n * 100;
      const beginNo = String(base), endNo = String(base + 99), postingNo = String(base + 10), engNo = String(base + 20);
      const panelDesc = panels[i].drawingDesc || panels[i].name || `Panel ${n}`;
      const rev = panels[i].drawingRev || '-';
      const pfx = `${projectNumber}-${suffix}`;
      t.push(makeTask(prefix, projectNumber, beginNo, `${pfx} - ${panelDesc}`, 'Begin-Total'));
      t.push(makeTask(prefix, projectNumber, postingNo, `${panels[i].drawingNo || pfx} Rev ${rev} - ${panelDesc}`, 'Posting'));
      t.push(makeTask(prefix, projectNumber, engNo, `Engineering Design - ${panelDesc}`, 'Posting'));
      t.push(makeTask(prefix, projectNumber, endNo, `TOTAL: ${pfx} - ${panelDesc}`, 'End-Total', { Totaling: `${beginNo}..${endNo}` }));
    }
    t.push(makeTask(prefix, projectNumber, '99999', `TOTAL: ${projectNumber} - ${projectName}`, 'End-Total', { Totaling: '10000..99999' }));
    return t;
  }

  async function postTasks(prefix: string): Promise<number> {
    const tasks = buildTasks(prefix);
    const taskNoField = `${prefix}_Task_No`;
    let created = 0;
    for (const task of tasks) {
      try {
        await bcPost(`${odataBase}/${taskPage}`, task);
        created++;
      } catch (e: any) {
        const txt = e.body || e.message || '';
        if (created === 0 && prefix === 'Project' && txt.includes("'Project_No' does not exist")) {
          return postTasks('Job');
        }
        console.warn(`bcCreatePanelTaskStructure: task ${task[taskNoField]} failed:`, txt);
      }
    }
    return created;
  }

  return postTasks('Project');
}

// ─── Task Description Sync ──────────────────────────────────────────────────

/**
 * PATCH the description fields on the four task lines for a specific panel.
 */
export async function bcSyncPanelTaskDescriptions(
  projectNumber: string,
  panelIndex: number,
  panel: { drawingDesc?: string; name?: string; drawingNo?: string; drawingRev?: string }
): Promise<void> {
  const n = panelIndex;
  const suffix = n * 100;
  const pfx = `${projectNumber}-${suffix}`;
  const panelDesc = panel.drawingDesc || panel.name || `Panel ${n}`;
  const rev = panel.drawingRev || '-';
  const base = 20000 + n * 100;
  const taskDescs: Record<string, string> = {
    [String(base)]:      `${pfx} - ${panelDesc}`,
    [String(base + 10)]: `${panel.drawingNo || pfx} Rev ${rev} - ${panelDesc}`,
    [String(base + 20)]: `Engineering Design - ${panelDesc}`,
    [String(base + 99)]: `TOTAL: ${pfx} - ${panelDesc}`,
  };

  const allPages = await discoverODataPages();
  const taskPage = allPages.find(p => /^project.?task/i.test(p))
    || allPages.find(p => /job.?task/i.test(p)) || null;
  if (!taskPage) { console.warn('bcSyncPanelTaskDescriptions: no task page found'); return; }

  const odataBase = getOdataBase();

  // Probe field names
  let FP_NO = 'Project_No', FP_TASK_NO = 'Project_Task_No';
  try {
    const pd = await bcGet(`${odataBase}/${taskPage}?$top=1`);
    const rec = (pd.value || [])[0];
    if (rec && 'Job_No' in rec && !('Project_No' in rec)) {
      FP_NO = 'Job_No'; FP_TASK_NO = 'Job_Task_No';
    }
  } catch { /* use defaults */ }

  for (const [taskNo, desc] of Object.entries(taskDescs)) {
    const url = `${odataBase}/${taskPage}(${FP_NO}='${encodeURIComponent(projectNumber)}',${FP_TASK_NO}='${encodeURIComponent(taskNo)}')`;
    try {
      await bcPatch(url, { Description: desc }, '*');
    } catch (e) {
      console.warn(`bcSyncPanelTaskDescriptions: task ${taskNo} PATCH failed:`, e);
    }
  }
}

// ─── Planning Line Sync (from monolith) ─────────────────────────────────────

/**
 * Full sync of BC Job Planning Lines for a panel task.
 * Re-exported from bcSync/projectSync.ts for the modular build;
 * the monolith version lives in index.html.
 *
 * This is a simplified re-export — the full implementation with BOM rows,
 * labor hours, etc. lives in src/bcSync/projectSync.ts as syncPanelPlanningLines().
 */
export { syncPanelPlanningLines as bcSyncPanelPlanningLines } from '@/bcSync/projectSync';

// ─── Panel End Date ─────────────────────────────────────────────────────────

/**
 * Patch the Ending_Date on a panel's progress billing planning line.
 */
export async function bcPatchPanelEndDate(
  projectNumber: string,
  panelIndex: number,
  endDate: string
): Promise<void> {
  if (!projectNumber || !panelIndex || !endDate) return;
  const taskNo = String(20000 + panelIndex * 100 + 10);
  const meta = await getPlanPageMeta();
  if (!meta) return;

  const { planPage, FP_NO, FP_TASK_NO } = meta;
  const odataBase = getOdataBase();
  const lineUrl = `${odataBase}/${planPage}(${FP_NO}='${encodeURIComponent(projectNumber)}',${FP_TASK_NO}='${encodeURIComponent(taskNo)}',Line_No=10000)`;

  try {
    const rec = await bcGet(lineUrl);
    const etag = rec['@odata.etag'] || '*';
    await bcPatch(lineUrl, { Ending_Date: endDate }, etag);
  } catch (e) {
    console.warn('bcPatchPanelEndDate failed:', e);
  }
}

// ─── PDF Attachment ─────────────────────────────────────────────────────────

/**
 * Attach a PDF to a BC project (direct upload).
 * Creates an attachment record, then uploads the binary content.
 */
async function bcAttachPdfToJob(jobNumber: string, fileName: string, pdfArrayBuffer: ArrayBuffer): Promise<any> {
  const { compId, jobId } = await bcGetJobGuid(jobNumber);
  const base = await companyApiUrl();

  // Check for existing attachment with same filename
  const checkUrl = `${base}/projects(${jobId})/documentAttachments?$filter=fileName eq '${encodeURIComponent(fileName)}'`;
  try {
    const existing = await bcGet(checkUrl);
    if ((existing.value || []).length > 0) {
      throw new Error(`Duplicate: "${fileName}" already exists in BC. Remove it first or re-stamp to generate a new filename.`);
    }
  } catch (e: any) {
    if (e.message?.includes('Duplicate')) throw e;
    // Non-fatal check failure — continue with upload
  }

  // Step 1: create attachment record
  const att = await bcPost(`${base}/projects(${jobId})/documentAttachments`, { fileName });
  const editLink = att['attachmentContent@odata.mediaEditLink'];
  if (!editLink) throw new Error('BC did not return mediaEditLink for attachment');

  // Step 2: upload binary content via raw fetch (bcPatch doesn't handle binary)
  const { acquireToken } = await import('./auth');
  const token = await acquireToken();
  const etag = att['@odata.etag'] || '*';
  const ur = await fetch(editLink, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf', 'If-Match': etag },
    body: pdfArrayBuffer,
  });
  if (!ur.ok) {
    const t = await ur.text().catch(() => '');
    throw new Error(`BC attachment upload failed (${ur.status}): ${t}`);
  }
  return att;
}

/**
 * Attach a PDF to a BC project, falling back to offline queue if BC is unavailable.
 */
export async function bcAttachPdfQueued(jobNumber: string, fileName: string, pdfArrayBuffer: ArrayBuffer): Promise<void> {
  const { hasToken } = await import('./auth');
  if (!hasToken() || !jobNumber) {
    if (jobNumber && fileName && pdfArrayBuffer) {
      try {
        const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfArrayBuffer)));
        // Use global bcEnqueue if available
        const { bcEnqueue } = await import('@/core/globals');
        bcEnqueue('attachPdf', { jobNumber, fileName, pdfBase64 }, `Attach "${fileName}" to BC project ${jobNumber}`);
      } catch (e) { console.warn('Could not queue PDF attachment:', e); }
    }
    return;
  }
  try {
    await bcAttachPdfToJob(jobNumber, fileName, pdfArrayBuffer);
  } catch (e: any) {
    const { hasToken: stillHasToken } = await import('./auth');
    if (!stillHasToken() && jobNumber && fileName && pdfArrayBuffer) {
      try {
        const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfArrayBuffer)));
        const { bcEnqueue } = await import('@/core/globals');
        bcEnqueue('attachPdf', { jobNumber, fileName, pdfBase64 }, `Attach "${fileName}" to BC project ${jobNumber}`);
      } catch (e2) { console.warn('Could not queue PDF attachment:', e2); }
    } else {
      throw e;
    }
  }
}

// ─── Progress Billing ───────────────────────────────────────────────────────

/**
 * Patch the Unit_Price on a panel's progress billing planning line.
 */
export async function bcPatchProgressBillingLine(
  projectNumber: string,
  taskNo: string,
  unitPrice: number
): Promise<void> {
  if (!projectNumber || !taskNo) return;
  const meta = await getPlanPageMeta();
  if (!meta) return;

  const { planPage, FP_NO, FP_TASK_NO } = meta;
  const odataBase = getOdataBase();
  const lineUrl = `${odataBase}/${planPage}(${FP_NO}='${encodeURIComponent(projectNumber)}',${FP_TASK_NO}='${encodeURIComponent(taskNo)}',Line_No=10000)`;

  try {
    const rec = await bcGet(lineUrl);
    const etag = rec['@odata.etag'] || '*';
    await bcPatch(lineUrl, { Unit_Price: unitPrice }, etag);
    console.log('bcPatchProgressBillingLine: Unit_Price updated →', unitPrice, 'for task', taskNo);
  } catch (e) {
    console.warn('bcPatchProgressBillingLine: failed', e);
  }
}

// ─── Project Update ─────────────────────────────────────────────────────────

/**
 * Update a BC project's display name (or other fields) by its GUID.
 */
export async function bcUpdateProject(bcProjectId: string, displayName: string): Promise<boolean> {
  if (!bcProjectId) return false;
  try {
    const { acquireToken } = await import('./auth');
    let token = await acquireToken(false);
    if (!token) token = await acquireToken(true);
    if (!token) return false;

    const base = await companyApiUrl();
    const url = `${base}/projects(${bcProjectId})`;
    const g = await bcGet(url);
    const etag = g['@odata.etag'] || '*';
    await bcPatch(url, { displayName }, etag);
    return true;
  } catch (e) {
    console.warn('bcUpdateProject error:', e);
    return false;
  }
}

// ─── Customer Operations ────────────────────────────────────────────────────

/**
 * Load all customers from BC.
 */
export async function bcLoadAllCustomers(): Promise<{ number: string; displayName: string }[]> {
  try {
    const base = await companyApiUrl();
    const d = await bcGet(`${base}/customers?$top=500&$orderby=displayName`);
    return (d.value || []).map((r: any) => ({ number: r.number || '', displayName: r.displayName || '' }));
  } catch (e) {
    console.warn('bcLoadAllCustomers error:', e);
    return [];
  }
}

/**
 * Client-side filter of pre-loaded customers by query string.
 */
export function bcFilterCustomers(
  allCustomers: { number: string; displayName: string }[],
  query: string
): { number: string; displayName: string }[] {
  if (!query.trim()) return allCustomers.slice(0, 25);
  const q = query.trim().toLowerCase();
  return allCustomers.filter(c =>
    c.displayName.toLowerCase().includes(q) || c.number.toLowerCase().includes(q)
  ).slice(0, 25);
}

/**
 * Create a new customer in BC.
 */
export async function bcCreateCustomer(
  displayName: string,
  phone?: string,
  email?: string
): Promise<{ number: string; displayName: string }> {
  const base = await companyApiUrl();
  const body: any = { displayName };
  if (phone) body.phoneNumber = phone;
  if (email) body.email = email;

  const d = await bcPost(`${base}/customers`, body);
  return { number: d.number || '', displayName: d.displayName || displayName };
}

// ─── Company Info ───────────────────────────────────────────────────────────

/**
 * Fetch the BC company info (name, address, phone, email).
 */
export async function bcFetchCompanyInfo(): Promise<{
  name: string;
  address: string;
  phone: string;
  email: string;
} | null> {
  try {
    const base = await companyApiUrl();
    const d = await bcGet(base);
    const parts = [d.addressLine1, d.addressLine2].filter(Boolean);
    const cityLine = [d.city, d.state, d.postalCode].filter(Boolean).join(' ');
    if (cityLine) parts.push(cityLine);
    const address = parts.join(', ');
    return {
      name: d.name || '',
      address,
      phone: d.phoneNumber || '',
      email: d.email || '',
    };
  } catch (e) {
    console.warn('bcFetchCompanyInfo failed:', e);
    return null;
  }
}

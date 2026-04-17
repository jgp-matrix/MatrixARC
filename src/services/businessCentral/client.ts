// ─── Business Central API Client ─────────────────────────────────────────────
// Low-level HTTP client for BC v2.0 REST API and OData endpoints.
// Handles 401 (token refresh) and 429 (rate limiting) automatically.

import { acquireToken, clearToken } from './auth';
import type { BCConfig } from './types';

let _bcCompanyId: string | null = null;
let _bcConfig: BCConfig | null = null;

export function setClientConfig(config: BCConfig | null) {
  _bcConfig = config;
  _bcCompanyId = null;
}

export function clearCompanyCache() {
  _bcCompanyId = null;
}

const BC_TENANT = 'd1f2c7f7-fab2-40b5-85c1-06a715e6a157';

function apiBase(): string {
  if (!_bcConfig) throw new Error('BC config not set');
  return `https://api.businesscentral.dynamics.com/v2.0/${BC_TENANT}/${_bcConfig.env}/api/v2.0`;
}

function odataBase(): string {
  if (!_bcConfig) throw new Error('BC config not set');
  return `https://api.businesscentral.dynamics.com/v2.0/${BC_TENANT}/${_bcConfig.env}/ODataV4/Company('${encodeURIComponent(_bcConfig.companyName)}')`;
}

/**
 * Make an authenticated GET request to BC API.
 * Auto-refreshes token on 401, retries on 429.
 */
export async function bcGet(url: string, retried = false): Promise<any> {
  const token = await acquireToken();
  if (!token) throw new Error('BC authentication required');

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  if (resp.status === 401 && !retried) {
    clearToken();
    return bcGet(url, true);
  }

  if (resp.status === 429) {
    await sleep(2000);
    return bcGet(url, retried);
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`BC API ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp.json();
}

/**
 * Make an authenticated POST request to BC API.
 */
export async function bcPost(url: string, body: any, retried = false): Promise<any> {
  const token = await acquireToken();
  if (!token) throw new Error('BC authentication required');

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 && !retried) {
    clearToken();
    return bcPost(url, body, true);
  }

  if (resp.status === 429) {
    await sleep(2000);
    return bcPost(url, body, retried);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err: any = new Error(`BC POST ${resp.status}: ${text.slice(0, 200)}`);
    err.status = resp.status;
    err.body = text;
    throw err;
  }

  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Make an authenticated PATCH request to BC OData.
 */
export async function bcPatch(url: string, body: any, etag: string, retried = false): Promise<any> {
  const token = await acquireToken();
  if (!token) throw new Error('BC authentication required');

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'If-Match': etag,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401 && !retried) {
    clearToken();
    return bcPatch(url, body, etag, true);
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`BC PATCH ${resp.status}: ${text.slice(0, 200)}`);
  }

  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

/**
 * Make an authenticated DELETE request to BC OData.
 */
export async function bcDelete(url: string, etag: string, retried = false): Promise<void> {
  const token = await acquireToken();
  if (!token) throw new Error('BC authentication required');

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'If-Match': etag,
    },
  });

  if (resp.status === 401 && !retried) {
    clearToken();
    return bcDelete(url, etag, true);
  }

  if (!resp.ok && resp.status !== 204) {
    const text = await resp.text().catch(() => '');
    throw new Error(`BC DELETE ${resp.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Resolve the BC company GUID from the company name.
 */
export async function getCompanyId(): Promise<string> {
  if (_bcCompanyId) return _bcCompanyId;
  if (!_bcConfig) throw new Error('BC config not set');

  const url = `${apiBase()}/companies?$filter=name eq '${encodeURIComponent(_bcConfig.companyName)}'`;
  const data = await bcGet(url);
  const companies = data.value || [];
  if (!companies.length) throw new Error(`BC company "${_bcConfig.companyName}" not found`);

  _bcCompanyId = companies[0].id;
  return _bcCompanyId!;
}

/**
 * Get the v2.0 API base URL with company ID.
 */
export async function companyApiUrl(): Promise<string> {
  const compId = await getCompanyId();
  return `${apiBase()}/companies(${compId})`;
}

/**
 * Get the OData base URL.
 */
export function getOdataBase(): string {
  return odataBase();
}

/**
 * Discover available OData web-service pages published in BC.
 * Tries company-level URL first, falls back to root OData.
 */
export async function discoverODataPages(): Promise<string[]> {
  const base = odataBase();
  const rootBase = (() => {
    if (!_bcConfig) return '';
    return `https://api.businesscentral.dynamics.com/v2.0/${_bcConfig.env}/ODataV4/`;
  })();

  const urls = [base + '/', ...(rootBase ? [rootBase] : [])];
  for (const url of urls) {
    try {
      const data = await bcGet(url);
      const names = (data.value || []).map((e: any) => e.name || e.url || '').filter(Boolean);
      if (names.length) return names;
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Cached plan page metadata (page name + field name prefix).
 */
let _planPageCache: { planPage: string; FP_NO: string; FP_TASK_NO: string } | null = null;

export async function getPlanPageMeta(): Promise<{ planPage: string; FP_NO: string; FP_TASK_NO: string } | null> {
  if (_planPageCache) return _planPageCache;
  const allPages = await discoverODataPages();
  const planPage = allPages.find(p => /^project.?planning/i.test(p)) || allPages.find(p => /^job.?planning/i.test(p)) || null;
  if (!planPage) return null;

  let FP_NO = 'Project_No';
  let FP_TASK_NO = 'Project_Task_No';
  try {
    const data = await bcGet(`${odataBase()}/${planPage}?$top=1`);
    const rec = (data.value || [])[0];
    if (rec && 'Job_No' in rec && !('Project_No' in rec)) {
      FP_NO = 'Job_No';
      FP_TASK_NO = 'Job_Task_No';
    }
  } catch { /* use defaults */ }

  _planPageCache = { planPage, FP_NO, FP_TASK_NO };
  return _planPageCache;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

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

function apiBase(): string {
  if (!_bcConfig) throw new Error('BC config not set');
  return `https://api.businesscentral.dynamics.com/v2.0/${_bcConfig.env}/api/v2.0`;
}

function odataBase(): string {
  if (!_bcConfig) throw new Error('BC config not set');
  return `https://api.businesscentral.dynamics.com/v2.0/${_bcConfig.env}/ODataV4/Company('${encodeURIComponent(_bcConfig.companyName)}')`;
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

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

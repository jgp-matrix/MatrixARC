// ─── Business Central MSAL Authentication ────────────────────────────────────
// Centralized token lifecycle. All BC API calls go through acquireToken().

import type { BCConfig } from './types';

declare const window: Window & { _msalScript?: HTMLScriptElement };
declare const msal: any;

let _msalInstance: any = null;
let _msalReady = false;
let _bcToken: string | null = null;
let _bcConfig: BCConfig | null = null;

export function setBcConfig(config: BCConfig | null) {
  if (JSON.stringify(config) !== JSON.stringify(_bcConfig)) {
    _bcConfig = config;
    _bcToken = null;
    _msalInstance = null;
    _msalReady = false;
  }
}

export function getBcConfig(): BCConfig | null {
  return _bcConfig;
}

export function clearToken() {
  _bcToken = null;
}

export function hasToken(): boolean {
  return !!_bcToken;
}

/**
 * Load MSAL v2.28.1 from Azure CDN on demand.
 */
async function loadMsalScript(): Promise<void> {
  if (typeof msal !== 'undefined') return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://alcdn.msauth.net/browser/2.28.1/js/msal-browser.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load MSAL'));
    document.head.appendChild(s);
  });
}

/**
 * Initialize MSAL PublicClientApplication.
 */
async function ensureMsal(): Promise<any> {
  if (_msalReady && _msalInstance) return _msalInstance;
  if (!_bcConfig?.clientId) return null;

  await loadMsalScript();

  _msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: _bcConfig.clientId,
      authority: `https://login.microsoftonline.com/common`,
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });

  await _msalInstance.initialize();
  _msalReady = true;
  return _msalInstance;
}

/**
 * Acquire a BC access token. Three-step: silent → SSO → popup.
 */
export async function acquireToken(interactive = true): Promise<string | null> {
  if (_bcToken) return _bcToken;

  const instance = await ensureMsal();
  if (!instance) return null;

  const scopes = ['https://api.businesscentral.dynamics.com/.default'];
  const accounts = instance.getAllAccounts();

  // Step 1: Silent token (cached)
  if (accounts.length) {
    try {
      const result = await instance.acquireTokenSilent({ scopes, account: accounts[0] });
      _bcToken = result.accessToken;
      return _bcToken;
    } catch { /* fall through */ }
  }

  // Step 2: SSO silent
  try {
    const result = await instance.ssoSilent({ scopes });
    _bcToken = result.accessToken;
    return _bcToken;
  } catch { /* fall through */ }

  // Step 3: Interactive popup
  if (!interactive) return null;
  try {
    const result = await instance.loginPopup({ scopes });
    _bcToken = result.accessToken;
    return _bcToken;
  } catch {
    return null;
  }
}

/**
 * Get the current token or acquire one silently. Returns null if not authenticated.
 */
export async function getToken(): Promise<string | null> {
  return _bcToken || acquireToken(false);
}

// ─── Microsoft Graph Email Service ────────────────────────────────────────────
// MSAL token acquisition and email sending via MS Graph API.

import { _bcConfig } from '@/core/globals';

declare const msal: any;

let _msalInstance: any = null;
let _msalReady = false;
let _graphToken: string | null = null;
const GRAPH_MAIL_SCOPES = ['https://graph.microsoft.com/Mail.Send'];

async function loadMsalScript(): Promise<void> {
  if (typeof msal !== 'undefined') return;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load MSAL'));
    document.head.appendChild(s);
  });
}

async function ensureMsal(): Promise<any> {
  if (_msalReady && _msalInstance) return _msalInstance;
  if (!_bcConfig?.clientId) return null;

  await loadMsalScript();

  _msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: _bcConfig.clientId,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: window.location.origin,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });

  await _msalInstance.initialize();
  _msalReady = true;
  return _msalInstance;
}

/**
 * Try to acquire a Graph token silently (from cache).
 * Returns token string or null if not available.
 */
export async function tryGraphTokenSilent(): Promise<string | null> {
  try {
    const inst = await ensureMsal();
    if (!inst) return null;
    const accounts = inst.getAllAccounts();
    if (!accounts.length) return null;
    const resp = await inst.acquireTokenSilent({ scopes: GRAPH_MAIL_SCOPES, account: accounts[0] });
    _graphToken = resp.accessToken;
    return _graphToken;
  } catch (e) { return null; }
}

/**
 * Acquire a Graph token, with popup fallback if silent fails.
 */
export async function acquireGraphToken(): Promise<string | null> {
  const inst = await ensureMsal();
  if (!inst) return null;
  try {
    const accounts = inst.getAllAccounts();
    if (accounts.length > 0) {
      const resp = await inst.acquireTokenSilent({ scopes: GRAPH_MAIL_SCOPES, account: accounts[0] });
      _graphToken = resp.accessToken;
      return _graphToken;
    }
  } catch (e) { /* fall through to popup */ }
  try {
    const resp = await inst.acquireTokenPopup({ scopes: GRAPH_MAIL_SCOPES });
    _graphToken = resp.accessToken;
    return _graphToken;
  } catch (e) { console.warn('Graph token acquisition failed:', e); return null; }
}

/**
 * Send an email via MS Graph API.
 */
export async function sendGraphEmail(
  graphToken: string, to: string, subject: string, htmlBody: string,
  pdfBase64?: string | null, pdfFilename?: string
): Promise<void> {
  const msg: any = {
    subject,
    body: { contentType: 'HTML', content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }]
  };
  if (pdfBase64) {
    msg.attachments = [{
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: pdfFilename || 'RFQ.pdf',
      contentType: 'application/pdf',
      contentBytes: pdfBase64
    }];
  }
  const r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${graphToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, saveToSentItems: true })
  });
  if (!r.ok) { const err = await r.text(); throw new Error(err); }
}

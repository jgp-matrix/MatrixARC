/**
 * ARC Module Shared Context Bridge
 *
 * Provides shared services to all ARC modules (purchasing, etc.)
 * Loaded by module HTML pages to access Firebase, BC API, and app context
 * without duplicating initialization code.
 *
 * Usage in module HTML:
 *   <script src="/modules/shared.js"></script>
 *   <script>
 *     arcModuleReady.then(ctx => {
 *       console.log('Company:', ctx.companyId);
 *       console.log('User:', ctx.uid);
 *       console.log('BC Token:', ctx.bcToken ? 'connected' : 'disconnected');
 *     });
 *   </script>
 */

// If running inside an iframe in the main ARC app, inherit context from parent
// If running standalone (/purchasing/ direct nav), initialize Firebase independently

(function() {
  'use strict';

  let _resolve;
  window.arcModuleReady = new Promise(r => { _resolve = r; });

  // Module context object — populated on init
  window.arcCtx = {
    uid: null,
    companyId: null,
    role: null,
    userEmail: null,
    userName: null,
    bcToken: null,
    bcODataBase: null,
    bcApiBase: null,
    bcEnv: null,
    company: { name: null, logoUrl: null, address: null, phone: null },
    firebase: null,
    db: null,
    auth: null,
    storage: null,
  };

  // Color palette (matches main ARC theme)
  window.arcColors = {
    bg: '#0d0d1a',
    card: '#151525',
    border: '#2a2a3e',
    text: '#f1f5f9',
    sub: '#94a3b8',
    muted: '#64748b',
    accent: '#38bdf8',
    accentDim: '#0c2a46',
    green: '#4ade80',
    greenDim: '#0a2a10',
    red: '#ef4444',
    yellow: '#fbbf24',
    yellowDim: '#3a2800',
    purple: '#a78bfa',
  };

  // Check if we're in an iframe inside the main ARC app
  const isIframe = window.parent !== window;

  if (isIframe) {
    // Request context from parent via postMessage
    window.addEventListener('message', function(e) {
      if (e.data?.type === 'arc-module-context') {
        Object.assign(window.arcCtx, e.data.ctx);
        // Initialize Firebase with the same config if not already initialized
        if (!window.arcCtx.db && window.firebase) {
          window.arcCtx.db = firebase.firestore();
          window.arcCtx.auth = firebase.auth();
          window.arcCtx.storage = firebase.storage();
        }
        console.log('[ARC Module] Context received from parent:', window.arcCtx.uid, window.arcCtx.companyId);
        _resolve(window.arcCtx);
      }
    });
    // Ask parent for context
    window.parent.postMessage({ type: 'arc-module-request-context' }, '*');
    // Timeout fallback — if parent doesn't respond in 3s, try standalone init
    setTimeout(function() {
      if (!window.arcCtx.uid) {
        console.warn('[ARC Module] Parent did not respond — falling back to standalone init');
        standaloneInit();
      }
    }, 3000);
  } else {
    // Standalone mode — initialize Firebase directly
    standaloneInit();
  }

  async function standaloneInit() {
    // Wait for Firebase SDK to be available
    if (!window.firebase) {
      console.error('[ARC Module] Firebase SDK not loaded');
      _resolve(window.arcCtx);
      return;
    }

    // Firebase should already be initialized from the HTML page
    const auth = firebase.auth();
    const db = firebase.firestore();
    const storage = firebase.storage();

    window.arcCtx.auth = auth;
    window.arcCtx.db = db;
    window.arcCtx.storage = storage;
    window.arcCtx.firebase = firebase;

    // Wait for auth state
    auth.onAuthStateChanged(async function(user) {
      if (!user) {
        console.warn('[ARC Module] Not signed in — redirecting to main app');
        window.location.href = '/';
        return;
      }

      window.arcCtx.uid = user.uid;
      window.arcCtx.userEmail = user.email;
      window.arcCtx.userName = user.displayName || user.email;

      // Load user profile to get companyId
      try {
        const profileDoc = await db.doc('users/' + user.uid + '/config/profile').get();
        if (profileDoc.exists) {
          const p = profileDoc.data();
          window.arcCtx.companyId = p.companyId || null;
          window.arcCtx.role = p.role || null;
        }
      } catch (e) { console.warn('[ARC Module] Profile load failed:', e); }

      // Load BC config from localStorage (set by main ARC app)
      try {
        const bcConfig = JSON.parse(localStorage.getItem('_arc_bc_config') || '{}');
        window.arcCtx.bcEnv = bcConfig.env || null;
        window.arcCtx.bcODataBase = bcConfig.odataBase || null;
        window.arcCtx.bcApiBase = bcConfig.apiBase || null;
      } catch (e) {}

      // Load company info
      if (window.arcCtx.companyId) {
        try {
          const compDoc = await db.doc('companies/' + window.arcCtx.companyId).get();
          if (compDoc.exists) {
            const c = compDoc.data();
            window.arcCtx.company = {
              name: c.name || null,
              logoUrl: c.logoUrl || null,
              address: c.address || null,
              phone: c.phone || null,
            };
          }
        } catch (e) {}
      }

      console.log('[ARC Module] Standalone init complete:', window.arcCtx.uid, window.arcCtx.companyId);
      _resolve(window.arcCtx);
    });
  }

  // Helper: navigate back to main ARC app
  window.arcNavigateBack = function() {
    if (isIframe) {
      window.parent.postMessage({ type: 'arc-module-navigate-back' }, '*');
    } else {
      window.location.href = '/';
    }
  };

  // Helper: show a toast notification
  window.arcToast = function(msg, type) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:99999;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;font-family:-apple-system,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:opacity 0.3s;';
    t.style.background = type === 'error' ? '#7f1d1d' : type === 'success' ? '#052e16' : '#1e293b';
    t.style.color = type === 'error' ? '#fca5a5' : type === 'success' ? '#4ade80' : '#f1f5f9';
    t.style.border = '1px solid ' + (type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6');
    document.body.appendChild(t);
    setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { t.remove(); }, 300); }, 3000);
  };
})();

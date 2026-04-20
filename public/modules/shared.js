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

  // ── DEBUG LOGGING — DECISION(v1.19.584) ──
  // Capture errors + user-reported issues from module pages and ship to
  // companies/{companyId}/debugLogs for admin review.
  const _breadcrumbs = [];
  const BREADCRUMB_MAX = 30;
  const _seen = new Map();
  let _selfErr = false;
  const _origError = console.error.bind(console);
  const _origWarn = console.warn.bind(console);
  function addBreadcrumb(type, message) {
    try {
      _breadcrumbs.push({ t: Date.now(), type: type, message: String(message || '').slice(0, 500) });
      while (_breadcrumbs.length > BREADCRUMB_MAX) _breadcrumbs.shift();
    } catch (e) {}
  }
  async function logDebugEntry(opts) {
    if (_selfErr) return;
    if (!window.arcCtx || !window.arcCtx.uid || !window.arcCtx.db) return;
    try {
      const ctx = window.arcCtx;
      const entry = {
        createdAt: Date.now(),
        createdBy: ctx.uid,
        userEmail: ctx.userEmail || '',
        userName: ctx.userName || '',
        severity: opts.severity || 'error',
        source: opts.source || 'module',
        message: String(opts.message || '').slice(0, 2000),
        stack: String(opts.stack || '').slice(0, 5000),
        url: location.href.slice(0, 500),
        userAgent: (navigator.userAgent || '').slice(0, 500),
        appVersion: 'module:' + (location.pathname.split('/')[2] || '?'),
        projectId: null,
        panelId: null,
        breadcrumbs: opts.breadcrumbs || _breadcrumbs.slice(-BREADCRUMB_MAX),
        description: opts.description || null,
      };
      if (ctx.companyId) {
        await ctx.db.collection('companies/' + ctx.companyId + '/debugLogs').add(entry);
      } else {
        await ctx.db.collection('users/' + ctx.uid + '/debugLogs').add(entry);
      }
    } catch (e) {
      _selfErr = true;
      setTimeout(function() { _selfErr = false; }, 30000);
      _origWarn('Debug log emit failed:', e.message);
    }
  }
  function _emitErr(source, message, stack) {
    try {
      const key = source + '|' + String(message || '').slice(0, 200);
      const now = Date.now();
      const last = _seen.get(key);
      if (last && now - last < 60000) return;
      _seen.set(key, now);
      logDebugEntry({ severity: 'error', source: source, message: message, stack: stack });
    } catch (e) {}
  }
  // Hook console.error (also emits)
  console.error = function() {
    try {
      const args = Array.prototype.slice.call(arguments);
      const msg = args.map(function(a) {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') { try { return JSON.stringify(a).slice(0, 500); } catch (e) { return '[obj]'; } }
        return String(a).slice(0, 500);
      }).join(' ');
      addBreadcrumb('console.error', msg);
      _emitErr('console_error', msg);
    } catch (e) {}
    _origError.apply(console, arguments);
  };
  console.warn = function() {
    try {
      const args = Array.prototype.slice.call(arguments);
      const msg = args.map(function(a) { return typeof a === 'object' ? (function(){try{return JSON.stringify(a).slice(0,300);}catch(e){return '[obj]';}})() : String(a).slice(0, 300); }).join(' ');
      addBreadcrumb('console.warn', msg);
    } catch (e) {}
    _origWarn.apply(console, arguments);
  };
  window.addEventListener('error', function(ev) {
    try {
      const err = ev.error;
      const msg = ev.message || (err && err.message) || 'Unknown error';
      const stack = (err && err.stack) || ('at ' + ev.filename + ':' + ev.lineno + ':' + ev.colno);
      addBreadcrumb('uncaught', msg);
      _emitErr('uncaught', msg, stack);
    } catch (e) {}
  });
  window.addEventListener('unhandledrejection', function(ev) {
    try {
      const reason = ev.reason;
      const msg = (reason && reason.message) || (typeof reason === 'string' ? reason : '[promise rejection]');
      const stack = (reason && reason.stack) || '';
      addBreadcrumb('promise_rejection', msg);
      _emitErr('promise_rejection', msg, stack);
    } catch (e) {}
  });

  // Floating "Report Issue" button + modal (pure DOM)
  function injectReportIssueButton() {
    if (document.getElementById('arc-report-issue-btn-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'arc-report-issue-btn-wrap';
    wrap.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99997;display:flex;align-items:center;gap:6px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    const btn = document.createElement('button');
    btn.textContent = '🐛 Report Issue';
    btn.title = 'Report an issue — send recent activity to the admin';
    btn.style.cssText = 'background:#1a1033;color:#c4b5fd;border:1px solid #a78bfa55;border-radius:20px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
    const dismiss = document.createElement('button');
    dismiss.textContent = '×';
    dismiss.title = 'Hide for this session';
    dismiss.style.cssText = 'background:transparent;color:#64748b;border:1px solid #2a2a3e;border-radius:50%;width:24px;height:24px;font-size:12px;cursor:pointer;line-height:1;';
    dismiss.onclick = function() { wrap.remove(); };
    btn.onclick = function() { showReportIssueModal(); };
    wrap.appendChild(btn);
    wrap.appendChild(dismiss);
    document.body.appendChild(wrap);
  }
  function showReportIssueModal() {
    if (document.getElementById('arc-report-issue-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'arc-report-issue-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99998;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';
    const modal = document.createElement('div');
    modal.style.cssText = 'background:#151525;border:1px solid #2a2a3e;border-radius:16px;padding:24px 28px;max-width:480px;width:90%;color:#f1f5f9;';
    modal.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><div style="font-size:16px;font-weight:700">🐛 Report an Issue</div><button id="arc-rim-close" style="background:none;border:none;color:#64748b;font-size:18px;cursor:pointer">×</button></div>'
      + '<div style="font-size:13px;color:#94a3b8;margin-bottom:12px;line-height:1.5">Describe what went wrong. Recent activity will be attached automatically.</div>'
      + '<textarea id="arc-rim-desc" autofocus rows="6" placeholder="e.g. Clicked on purchasing dashboard and got a blank page…" style="width:100%;box-sizing:border-box;background:#0a0a14;border:1px solid #2a2a3e;border-radius:8px;padding:10px 12px;color:#f1f5f9;font-size:13px;font-family:inherit;resize:vertical"></textarea>'
      + '<div id="arc-rim-err" style="margin-top:8px;font-size:12px;color:#f87171;display:none"></div>'
      + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button id="arc-rim-cancel" style="background:none;color:#64748b;border:1px solid #2a2a3e;border-radius:20px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer">Cancel</button><button id="arc-rim-send" style="background:#38bdf8;color:#fff;border:none;border-radius:20px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer">Send Report</button></div>';
    overlay.appendChild(modal);
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
    document.body.appendChild(overlay);
    document.getElementById('arc-rim-close').onclick = function() { overlay.remove(); };
    document.getElementById('arc-rim-cancel').onclick = function() { overlay.remove(); };
    document.getElementById('arc-rim-send').onclick = async function() {
      const desc = document.getElementById('arc-rim-desc').value.trim();
      const errEl = document.getElementById('arc-rim-err');
      if (!desc) { errEl.textContent = 'Please describe what happened'; errEl.style.display = 'block'; return; }
      const sendBtn = document.getElementById('arc-rim-send');
      sendBtn.disabled = true; sendBtn.textContent = 'Sending…';
      try {
        await logDebugEntry({ severity: 'user_reported', source: 'manual', message: desc.slice(0, 200), description: desc });
        modal.innerHTML = '<div style="text-align:center;padding:24px 0"><div style="font-size:32px;margin-bottom:8px">✓</div><div style="font-size:14px;color:#4ade80;font-weight:700">Report submitted to admin.</div></div>';
        setTimeout(function() { overlay.remove(); }, 2000);
      } catch (e) {
        errEl.textContent = 'Failed to submit: ' + (e.message || 'unknown'); errEl.style.display = 'block';
        sendBtn.disabled = false; sendBtn.textContent = 'Send Report';
      }
    };
  }

  // Inject Report Issue button once the module context is ready
  window.arcModuleReady.then(function() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectReportIssueButton);
    } else {
      injectReportIssueButton();
    }
  });
})();

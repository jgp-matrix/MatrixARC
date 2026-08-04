const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

admin.initializeApp();

const { runCodaleScrape } = require('./codaleScheduler');
const { scrapeBatch: codaleScrapeBatch } = require('./codaleScraper');
const { mouserSearchPart, mouserSearchBatch } = require('./mouserApi');
const { digikeySearchPart, digikeySearchBatch } = require('./digikeyApi');
const { BOM_PROMPT } = require('./bomPrompt');
const { ANTHROPIC_MODELS, MONITORED_MODELS } = require('./models');
const { PDFDocument, PDFName, PDFRef } = require('pdf-lib');
const { Agent: UndiciAgent } = require('undici');
const _anthropicAgent = new UndiciAgent({ headersTimeout: 520000, bodyTimeout: 520000 });

// ── B080 — anthropicFetchWithRetry — deadline-aware retry/backoff wrapper ──
// Retries transient Anthropic failures (429 / 5xx / network throw) with
// exponential backoff + FULL JITTER, honoring Retry-After. The CRITICAL guard:
// never sleep into the 540s function hard-kill — `sleepBackoff` refuses to sleep
// when the delay would land within DEADLINE_MARGIN_MS of `deadlineMs`. On
// retries-exhausted or a non-retryable status it RETURNS the last response
// unchanged, so every caller's existing `!response.ok` handler fires exactly as
// before. Happy path (200) is a single fetch — behavior identical to the
// pre-B080 direct call.
const ANTHROPIC_RETRY = {
  MAX_ATTEMPTS: 4,
  BASE_MS: 1000,
  CAP_MS: 20000,
  DEADLINE_MARGIN_MS: 15000,     // refuse to retry if we'd land within 15s of the kill
  ATTEMPT_ABORT_CAP_MS: 520000,  // never exceed undici's 520s header/body timeout
  ATTEMPT_ABORT_MARGIN_MS: 5000, // leave 5s headroom under the remaining budget
};
const ANTHROPIC_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504, 529]);

// Full-jitter backoff. `attempt` is 1-based (the attempt that just failed).
// Honors a numeric Retry-After (seconds) when present, capped at CAP_MS.
function anthropicBackoffDelay(attempt, retryAfterHeader) {
  const ra = Number(retryAfterHeader);
  if (Number.isFinite(ra) && ra >= 0) {
    return Math.min(ra * 1000, ANTHROPIC_RETRY.CAP_MS);
  }
  const capped = Math.min(ANTHROPIC_RETRY.BASE_MS * Math.pow(2, attempt - 1), ANTHROPIC_RETRY.CAP_MS);
  return Math.floor(Math.random() * capped); // full jitter: [0, capped)
}

// Sleeps `delayMs` and returns true — UNLESS doing so would land within
// DEADLINE_MARGIN_MS of `deadlineMs`, in which case it sleeps nothing and
// returns false (the guard against retrying into the 540s hard kill).
async function sleepBackoff(delayMs, deadlineMs) {
  if (Date.now() + delayMs + ANTHROPIC_RETRY.DEADLINE_MARGIN_MS > deadlineMs) return false;
  await new Promise(r => setTimeout(r, delayMs));
  return true;
}

// bodyObj: the JSON message body (model/max_tokens/system/messages/thinking…).
// opts: { deadlineMs, extraHeaders, label }. `deadlineMs` is absolute wall-clock
// (Date.now()+budget) computed by the caller at function entry.
async function anthropicFetchWithRetry(bodyObj, apiKey, opts = {}) {
  const {
    deadlineMs = Date.now() + 510000,
    extraHeaders = {},
    label = 'anthropic',
  } = opts;
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    ...extraHeaders,
  };
  const body = JSON.stringify(bodyObj);
  let lastResponse = null;

  for (let attempt = 1; attempt <= ANTHROPIC_RETRY.MAX_ATTEMPTS; attempt++) {
    const remaining = deadlineMs - Date.now();
    // Per-attempt abort budget: leave 5s headroom, never exceed undici's 520s ceiling.
    const attemptTimeout = Math.min(
      remaining - ANTHROPIC_RETRY.ATTEMPT_ABORT_MARGIN_MS,
      ANTHROPIC_RETRY.ATTEMPT_ABORT_CAP_MS
    );
    if (attemptTimeout <= 0) {
      // No wall-clock budget left to even start an attempt.
      if (lastResponse) return lastResponse;
      const e = new Error(`${label}: deadline budget exhausted before attempt ${attempt}`);
      e.name = 'AbortError';
      throw e;
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), attemptTimeout);
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ac.signal,
        dispatcher: _anthropicAgent,
        headers,
        body,
      });
    } catch (fetchErr) {
      clearTimeout(timer);
      // Our own per-attempt abort → deadline territory, non-retryable: surface.
      if (fetchErr.name === 'AbortError') throw fetchErr;
      // Genuine network throw → retryable if attempts + deadline budget remain.
      if (attempt < ANTHROPIC_RETRY.MAX_ATTEMPTS) {
        const delay = anthropicBackoffDelay(attempt, null);
        if (await sleepBackoff(delay, deadlineMs)) {
          functions.logger.warn(`${label}: network error, retried (attempt ${attempt}/${ANTHROPIC_RETRY.MAX_ATTEMPTS})`, { error: fetchErr.message });
          continue;
        }
      }
      throw fetchErr;
    }
    clearTimeout(timer);
    lastResponse = response;

    // Success OR a non-retryable status → hand back so the caller's !ok fires.
    if (response.ok || !ANTHROPIC_RETRYABLE_STATUS.has(response.status)) {
      return response;
    }
    // Retryable status, but out of attempts → return the last (failing) response.
    if (attempt >= ANTHROPIC_RETRY.MAX_ATTEMPTS) {
      functions.logger.warn(`${label}: status ${response.status} — attempts exhausted, surfacing to caller`);
      return response;
    }
    const delay = anthropicBackoffDelay(attempt, response.headers.get('retry-after'));
    // Drain the body to free the socket before sleeping/retrying.
    try { await response.text(); } catch (_) {}
    if (!(await sleepBackoff(delay, deadlineMs))) {
      functions.logger.warn(`${label}: status ${response.status} but retry would cross deadline — surfacing`);
      return response;
    }
    functions.logger.warn(`${label}: status ${response.status}, retrying (attempt ${attempt}/${ANTHROPIC_RETRY.MAX_ATTEMPTS})`);
  }
  return lastResponse;
}

// B080 unit-test hook — exported only when the test harness sets this env var,
// so firebase's function discovery never sees these during `firebase deploy`.
if (process.env.ARC_TEST_EXPORTS === '1') {
  module.exports.anthropicFetchWithRetry = anthropicFetchWithRetry;
  module.exports.sleepBackoff = sleepBackoff;
  module.exports.anthropicBackoffDelay = anthropicBackoffDelay;
}

// Purchasing module functions
const purchasing = require('./purchasing');
exports.poCreateOrder = purchasing.createPurchaseOrder;
exports.poUpdateStatus = purchasing.updatePurchaseOrderStatus;

// Engineering module functions
const engineering = require('./engineering');
exports.onCustomerReviewSubmitted = engineering.onCustomerReviewSubmitted;
exports.engSendReviewEmail = engineering.sendReviewEmail;

// DECISION(v1.19.785): ECO module — Phase 1 of the ECO rollout. Triggers log only;
// Phase 6 will wire BC Status flip + TRAQS HOLD webhook. See plan at
// docs/superpowers/plans/2026-04-28-change-orders.md.
const ecos = require('./ecos');
exports.onEcoCreatedCompany = ecos.onEcoCreatedCompany;
exports.onEcoCreatedUser = ecos.onEcoCreatedUser;
exports.onEcoUpdatedCompany = ecos.onEcoUpdatedCompany;
exports.onEcoUpdatedUser = ecos.onEcoUpdatedUser;

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
const MOUSER_API_KEY = process.env.MOUSER_API_KEY || '';
const DIGIKEY_CLIENT_ID = process.env.DIGIKEY_CLIENT_ID || '';
const DIGIKEY_CLIENT_SECRET = process.env.DIGIKEY_CLIENT_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://matrix-arc.web.app';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

const db = admin.firestore();

// ── ANTHROPIC HELPERS (shared by extractBomPage + monitorAnthropicModels) ──

const ANTHROPIC_PRICING = {
  opus:   { in: 1500, out: 7500, cacheWrite: 1875, cacheRead: 150 },
  sonnet: { in: 300,  out: 1500, cacheWrite: 375,  cacheRead: 30 },
  haiku:  { in: 100,  out: 500,  cacheWrite: 125,  cacheRead: 10 },
};

function modelPriceFamily(model) {
  const m = String(model || '').toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('haiku')) return 'haiku';
  return 'sonnet';
}

function computeAnthropicCents(model, usage) {
  if (!usage) return 0;
  const p = ANTHROPIC_PRICING[modelPriceFamily(model)] || ANTHROPIC_PRICING.sonnet;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens || 0;
  const cacheReadTokens = usage.cache_read_input_tokens || 0;
  return Math.ceil(
    (inputTokens / 1_000_000) * p.in +
    (outputTokens / 1_000_000) * p.out +
    (cacheWriteTokens / 1_000_000) * p.cacheWrite +
    (cacheReadTokens / 1_000_000) * p.cacheRead
  );
}

async function resolveAnthropicKey(uid) {
  const profileDoc = await db.doc(`users/${uid}/config/profile`).get();
  const companyId = profileDoc.exists ? profileDoc.data().companyId : null;
  if (companyId) {
    try {
      const compApi = await db.doc(`companies/${companyId}/config/api`).get();
      if (compApi.exists && compApi.data().key) return compApi.data().key;
    } catch (_) {}
  }
  const userApi = await db.doc(`users/${uid}/config/api`).get();
  if (userApi.exists && userApi.data().key) return userApi.data().key;
  return null;
}

async function recordAnthropicUsage(uid, model, usage) {
  try {
    const cents = computeAnthropicCents(model, usage);
    if (cents <= 0) return;
    const ref = db.doc(`users/${uid}/config/anthropicLedger`);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let existingMonth = null;
    try { const s = await ref.get(); if (s.exists) existingMonth = s.data().monthKey || null; } catch (_) {}
    const isRollover = existingMonth && existingMonth !== monthKey;
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const cacheTok = (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
    await ref.set({
      monthKey,
      lastCallAt: Date.now(),
      lastCallModel: model || 'unknown',
      lastCallCents: cents,
      lastCallUsage: {
        input: inTok,
        output: outTok,
        cacheWrite: usage.cache_creation_input_tokens || 0,
        cacheRead: usage.cache_read_input_tokens || 0,
      },
      monthCents: isRollover ? cents : admin.firestore.FieldValue.increment(cents),
      totalCents: admin.firestore.FieldValue.increment(cents),
      // DECISION(v1.20.8): Cumulative token counters for the admin usage meter.
      monthInputTokens: isRollover ? inTok : admin.firestore.FieldValue.increment(inTok),
      monthOutputTokens: isRollover ? outTok : admin.firestore.FieldValue.increment(outTok),
      monthCacheTokens: isRollover ? cacheTok : admin.firestore.FieldValue.increment(cacheTok),
      totalInputTokens: admin.firestore.FieldValue.increment(inTok),
      totalOutputTokens: admin.firestore.FieldValue.increment(outTok),
      totalCacheTokens: admin.firestore.FieldValue.increment(cacheTok),
    }, { merge: true });
  } catch (e) {
    functions.logger.warn('recordAnthropicUsage failed (non-fatal):', e.message);
  }
}

async function warnAdminsTokenUsage(uid, functionName, usage, maxTokens) {
  try {
    const outputTokens = usage?.output_tokens || 0;
    const threshold = Math.round(maxTokens * 0.75);
    if (outputTokens < threshold) return;
    const pct = Math.round((outputTokens / maxTokens) * 100);
    functions.logger.warn(`${functionName} token warning: ${outputTokens}/${maxTokens} (${pct}%)`, { uid, outputTokens, maxTokens, pct });
    if (!SENDGRID_KEY) return;
    const profileDoc = await db.doc(`users/${uid}/config/profile`).get();
    const companyId = profileDoc.exists ? profileDoc.data().companyId : null;
    if (!companyId) return;
    const membersSnap = await db.collection(`companies/${companyId}/members`).get();
    const adminUids = membersSnap.docs.filter(d => d.data().role === 'admin').map(d => d.id);
    if (!adminUids.length) return;
    let userName = 'Unknown user';
    try { const u = await admin.auth().getUser(uid); userName = (u.displayName || u.email || uid).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]); } catch (_) {}
    const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1e293b">
      <h2 style="color:#d97706;margin:0 0 8px 0;font-size:20px">⚠️ AI Token Usage Warning</h2>
      <p style="color:#64748b;margin:0 0 20px 0;font-size:13px"><strong>${functionName}</strong> used <strong>${pct}%</strong> of the token limit during extraction.</p>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:4px;margin-bottom:16px">
        <table style="border-collapse:collapse;font-size:13px;color:#422006">
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Output tokens:</td><td>${outputTokens.toLocaleString()} / ${maxTokens.toLocaleString()}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Usage:</td><td>${pct}%</td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">User:</td><td>${userName}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Function:</td><td>${functionName}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Input tokens:</td><td>${(usage?.input_tokens || 0).toLocaleString()}</td></tr>
        </table>
      </div>
      <p style="color:#64748b;font-size:12px;line-height:1.5">If this reaches 100%, the AI response will be truncated and extraction may return incomplete or zero results. Consider whether the drawing package has unusually large BOM tables.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">MatrixARC automated warning</p>
    </div>`;
    for (const adminUid of adminUids) {
      try {
        const rec = await admin.auth().getUser(adminUid);
        if (!rec.email) continue;
        await sgMail.send({
          to: rec.email,
          from: 'sales@matrixpci.com',
          subject: `⚠️ ARC Token Warning: ${functionName} at ${pct}% capacity`,
          html: emailHtml,
        });
      } catch (e) { functions.logger.warn(`Token warning email failed for ${adminUid}:`, e.message); }
    }
  } catch (e) {
    functions.logger.warn('warnAdminsTokenUsage failed (non-fatal):', e.message);
  }
}

// ── MODEL FALLBACK ADMIN NOTIFICATION ──
// DECISION(v1.20.1): Fire-and-forget email to company admins when a model 404
// triggers a fallback. Goal: admin updates models.js before the fallback model
// is also deprecated. De-duplicated via Firestore timestamp — at most one email
// per 60 minutes per function/model pair.

async function notifyAdminModelFallback(functionName, failedModel, fallbackModel, uid) {
  try {
    if (!SENDGRID_KEY) return;
    // De-duplicate: check last notification timestamp
    const dedupRef = db.doc('config/modelFallbackAlerts');
    const dedupKey = `${functionName}_${failedModel}`;
    const dedupDoc = await dedupRef.get();
    const dedupData = dedupDoc.exists ? dedupDoc.data() : {};
    const lastSent = dedupData[dedupKey] || 0;
    if (Date.now() - lastSent < 60 * 60 * 1000) return; // 1 hour window
    await dedupRef.set({ [dedupKey]: Date.now() }, { merge: true });

    // Find company admins to notify
    const profileDoc = await db.doc(`users/${uid}/config/profile`).get();
    const companyId = profileDoc.exists ? profileDoc.data().companyId : null;
    const adminEmails = [];
    if (companyId) {
      const membersSnap = await db.collection(`companies/${companyId}/members`).get();
      const adminUids = membersSnap.docs.filter(d => d.data().role === 'admin').map(d => d.id);
      for (const aUid of adminUids) {
        try { const u = await admin.auth().getUser(aUid); if (u.email) adminEmails.push(u.email); } catch (_) {}
      }
    }
    if (!adminEmails.length) return;

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1e293b">
      <h2 style="color:#f59e0b;margin:0 0 8px 0;font-size:20px">⚠️ AI Model Fallback Triggered</h2>
      <p style="color:#64748b;margin:0 0 20px 0;font-size:13px">The supplier portal automatically recovered, but the primary model needs to be updated.</p>
      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:14px 18px;border-radius:4px;margin-bottom:16px">
        <table style="border-collapse:collapse;font-size:13px;color:#422006">
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Function:</td><td>${functionName}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Failed model:</td><td><code style="background:#fde68a;padding:1px 6px;border-radius:3px">${failedModel}</code> (returned 404)</td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Fallback used:</td><td><code style="background:#d1fae5;padding:1px 6px;border-radius:3px">${fallbackModel}</code></td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Time (MDT):</td><td>${now}</td></tr>
        </table>
      </div>
      <p style="color:#1e293b;font-size:13px;line-height:1.6"><strong>Action required:</strong> Update the model constant in <code>functions/models.js</code> and redeploy. The fallback model may be more expensive or could also be deprecated.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">MatrixARC automated alert · de-duplicated (1 email per hour max)</p>
    </div>`;

    for (const email of adminEmails) {
      await sgMail.send({
        to: email,
        from: 'sales@matrixpci.com',
        subject: `⚠️ ARC Model Fallback: ${failedModel} → ${fallbackModel}`,
        html,
      });
    }
    functions.logger.info(`notifyAdminModelFallback: emailed ${adminEmails.length} admin(s)`);
  } catch (e) {
    functions.logger.warn('notifyAdminModelFallback failed (non-fatal):', e.message);
  }
}

// ── PORTAL FAILURE ADMIN NOTIFICATION ──
// DECISION(v1.20.3): Fire-and-forget email to company admins when the supplier
// portal encounters a failure the supplier can't resolve (AI extraction error,
// JSON parse failure, notification pipeline break, cost-cap trigger). Uses the
// same de-duplication pattern as notifyAdminModelFallback — at most one email
// per 60 minutes per errorType.

async function notifyAdminPortalFailure(uid, errorType, details) {
  try {
    if (!SENDGRID_KEY) return;
    // De-duplicate via same doc as model fallback alerts
    const dedupRef = db.doc('config/modelFallbackAlerts');
    const dedupKey = `portal_${errorType}`;
    const dedupDoc = await dedupRef.get();
    const dedupData = dedupDoc.exists ? dedupDoc.data() : {};
    const lastSent = dedupData[dedupKey] || 0;
    if (Date.now() - lastSent < 60 * 60 * 1000) return; // 1 hour window
    await dedupRef.set({ [dedupKey]: Date.now() }, { merge: true });

    // Find company admins
    const profileDoc = await db.doc(`users/${uid}/config/profile`).get();
    const companyId = profileDoc.exists ? profileDoc.data().companyId : null;
    const adminEmails = [];
    if (companyId) {
      const membersSnap = await db.collection(`companies/${companyId}/members`).get();
      const adminUids = membersSnap.docs.filter(d => d.data().role === 'admin').map(d => d.id);
      for (const aUid of adminUids) {
        try { const u = await admin.auth().getUser(aUid); if (u.email) adminEmails.push(u.email); } catch (_) {}
      }
    }
    if (!adminEmails.length) adminEmails.push('jon@matrixpci.com'); // fallback

    const now = new Date().toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const safeDetails = Object.entries(details || {}).map(([k, v]) =>
      `<tr><td style="padding:3px 12px 3px 0;font-weight:700">${String(k).replace(/[<>&"]/g, '')}</td><td>${String(v).replace(/[<>&"]/g, '')}</td></tr>`
    ).join('');

    const severityColors = {
      ai_extraction_error: { bg: '#fef2f2', border: '#ef4444', icon: '🔴', label: 'AI Extraction Failed' },
      json_parse_failure:  { bg: '#fef2f2', border: '#ef4444', icon: '🔴', label: 'AI Response Unparseable' },
      cost_cap_reached:    { bg: '#fefce8', border: '#eab308', icon: '🟡', label: 'Cost Cap Triggered' },
      notification_failed: { bg: '#fff7ed', border: '#f97316', icon: '🟠', label: 'Notification Pipeline Failed' },
      email_failed:        { bg: '#fff7ed', border: '#f97316', icon: '🟠', label: 'Email Delivery Failed' },
    };
    const sev = severityColors[errorType] || { bg: '#fef2f2', border: '#ef4444', icon: '🔴', label: errorType };

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1e293b">
      <h2 style="color:${sev.border};margin:0 0 8px 0;font-size:20px">${sev.icon} Supplier Portal Alert: ${sev.label}</h2>
      <p style="color:#64748b;margin:0 0 20px 0;font-size:13px">A supplier may need manual assistance with their quote submission.</p>
      <div style="background:${sev.bg};border-left:4px solid ${sev.border};padding:14px 18px;border-radius:4px;margin-bottom:16px">
        <table style="border-collapse:collapse;font-size:13px;color:#1e293b">
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Alert type:</td><td>${sev.label}</td></tr>
          <tr><td style="padding:3px 12px 3px 0;font-weight:700">Time (MDT):</td><td>${now}</td></tr>
          ${safeDetails}
        </table>
      </div>
      <p style="color:#1e293b;font-size:13px;line-height:1.6"><strong>Action:</strong> Check the supplier portal submission and contact the supplier if they need help entering prices manually.</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">MatrixARC automated alert · de-duplicated (1 email per hour max per alert type)</p>
    </div>`;

    for (const email of adminEmails) {
      await sgMail.send({
        to: email,
        from: 'sales@matrixpci.com',
        subject: `${sev.icon} ARC Portal Alert: ${sev.label}`,
        html,
      });
    }
    functions.logger.info(`notifyAdminPortalFailure[${errorType}]: emailed ${adminEmails.length} admin(s)`);
  } catch (e) {
    functions.logger.warn('notifyAdminPortalFailure failed (non-fatal):', e.message);
  }
}

// ── PUSH NOTIFICATION HELPER ──

/**
 * Send push notification to all FCM tokens registered for a user.
 * Automatically cleans up invalid/expired tokens.
 * @param {string} uid - Firestore user ID
 * @param {object} notification - { title, body, data: { url, projectId, ... } }
 */
async function sendPushToUser(uid, notification) {
  try {
    const tokensSnap = await db.collection(`users/${uid}/fcmTokens`).get();
    if (tokensSnap.empty) return;

    const tokensToDelete = [];
    const sendPromises = [];

    tokensSnap.docs.forEach(doc => {
      const { token } = doc.data();
      if (!token) { tokensToDelete.push(doc.ref); return; }

      const message = {
        token,
        notification: {
          title: notification.title || 'MatrixARC',
          body: notification.body || '',
        },
        data: {},
        webpush: {
          fcmOptions: {
            link: notification.data?.url || '/',
          },
        },
      };
      // FCM data values must be strings
      if (notification.data) {
        for (const [k, v] of Object.entries(notification.data)) {
          if (v != null) message.data[k] = String(v);
        }
      }

      sendPromises.push(
        admin.messaging().send(message).catch(err => {
          const code = err?.code || err?.errorInfo?.code || '';
          // Clean up invalid tokens
          if (code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/invalid-argument') {
            tokensToDelete.push(doc.ref);
          }
          console.warn(`FCM send failed for token ${doc.id}:`, code, err.message);
        })
      );
    });

    await Promise.all(sendPromises);

    // Clean up stale tokens
    if (tokensToDelete.length > 0) {
      const batch = db.batch();
      tokensToDelete.forEach(ref => batch.delete(ref));
      await batch.commit();
      console.log(`Cleaned up ${tokensToDelete.length} invalid FCM token(s) for user ${uid}`);
    }
  } catch (e) {
    console.warn('sendPushToUser error:', e.message);
  }
}

// ── TEAMS WEBHOOK HELPER ──

/**
 * Post a notification card to Microsoft Teams via Incoming Webhook.
 * @param {object} opts - { title, body, url, facts: [{name,value}] }
 */
async function postToTeams(opts) {
  if (!TEAMS_WEBHOOK_URL) return;
  try {
    // Power Automate "Post to channel" expects Adaptive Card format
    const factsBody = (opts.facts || []).map(f => ({
      type: "TextBlock", text: `**${f.name}:** ${f.value}`, wrap: true, size: "small"
    }));
    const card = {
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            { type: "TextBlock", text: opts.title || "MatrixARC", weight: "Bolder", size: "Medium", color: "Accent" },
            { type: "TextBlock", text: opts.body || "", wrap: true },
            ...factsBody,
          ],
          actions: opts.url ? [{ type: "Action.OpenUrl", title: "Open in ARC", url: opts.url }] : [],
        }
      }]
    };
    const https = require('https');
    const url = new URL(TEAMS_WEBHOOK_URL);
    const payload = JSON.stringify(card);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: url.hostname, port: url.port || 443, path: url.pathname + url.search,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
      }, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d)); });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    console.log('Teams webhook posted:', opts.title);
  } catch (e) {
    console.warn('Teams webhook error:', e.message);
  }
}

// Test endpoint for Teams webhook
// DECISION(v1.19.955, cost-attack hardening): maxInstances cap added to every callable.
// Prevents accidental fan-out on auth-required functions and bounds the worst-case
// invocation rate on the public extractSupplierQuotePricing.
exports.testTeamsWebhook = functions.runWith({ maxInstances: 5 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  // DECISION(v1.19.963, security audit L-4): Admin-only. Previously any signed-in user
  // could spam the Teams channel with test messages.
  const { companyId } = data || {};
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId required');
  const member = await db.doc(`companies/${companyId}/members/${context.auth.uid}`).get();
  if (!member.exists || member.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  await postToTeams({
    title: 'MatrixARC Test',
    body: 'Teams webhook is working!',
    url: APP_URL,
    facts: [{ name: 'Triggered by', value: context.auth.token.email || context.auth.uid }],
  });
  return { success: true };
});

// ── ONE-OFF MIGRATION HELPER (2026-07-28): stamp every project with the current BC env ──
// Purpose: before pointing ARC at a new BC sandbox, ensure EVERY project carries a `bcEnv`
// stamp so that after the switch they ALL flag env-mismatched (grey + "Re-link to BC") instead
// of silently 404'ing against the new env (unstamped projects are treated as "matching" and would
// try to sync). SAFETY: additive + idempotent — sets `bcEnv` ONLY on projects that are missing it;
// NEVER overwrites an existing bcEnv (a project already on a different env is reported, not clobbered).
// Admin-only; derives company + target env from the caller's profile so no client params are needed.
// Supports { dryRun: true } to return the counts WITHOUT writing (run dry first, then for real).
exports.stampProjectsBcEnv = functions.runWith({ maxInstances: 1 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const uid = context.auth.uid;
  const profileSnap = await db.doc(`users/${uid}/config/profile`).get();
  const companyId = profileSnap.exists ? profileSnap.data().companyId : null;
  if (!companyId) throw new functions.https.HttpsError('failed-precondition', 'No company workspace for caller');
  const memberSnap = await db.doc(`companies/${companyId}/members/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }
  // Target env: caller-supplied override, else the company's configured BC env.
  let env = (data && typeof data.env === 'string' && data.env.trim()) ? data.env.trim() : null;
  if (!env) {
    const cfgSnap = await db.doc(`companies/${companyId}/config/bcEnvironment`).get();
    env = cfgSnap.exists ? (cfgSnap.data().env || null) : null;
  }
  if (!env) throw new functions.https.HttpsError('failed-precondition', 'No BC environment configured');
  const dryRun = !!(data && data.dryRun);
  const snap = await db.collection(`companies/${companyId}/projects`).get();
  let total = 0, toStamp = 0, alreadyStamped = 0, otherEnv = 0;
  const otherEnvSamples = [];
  let batch = db.batch(), n = 0, committed = 0;
  for (const d of snap.docs) {
    total++;
    const cur = d.data().bcEnv;
    if (cur === env) { alreadyStamped++; continue; }
    if (cur) { // already stamped with a DIFFERENT env — never clobber; report only
      otherEnv++;
      if (otherEnvSamples.length < 25) otherEnvSamples.push({ id: d.id, bcEnv: cur, name: d.data().name || d.data().bcProjectNumber || null });
      continue;
    }
    toStamp++;
    if (!dryRun) {
      batch.update(d.ref, { bcEnv: env });
      n++;
      if (n >= 400) { await batch.commit(); committed += n; batch = db.batch(); n = 0; }
    }
  }
  if (!dryRun && n > 0) { await batch.commit(); committed += n; }
  console.log(`[stampProjectsBcEnv] company=${companyId} env=${env} total=${total} ${dryRun ? 'wouldStamp' : 'stamped'}=${toStamp} already=${alreadyStamped} otherEnv=${otherEnv} dryRun=${dryRun}`);
  return { companyId, env, total, stamped: dryRun ? 0 : committed, wouldStamp: toStamp, alreadyStamped, otherEnv, otherEnvSamples, dryRun };
});

// ── Shared BC #No. resolver (used by reconcileBcNos + createMissingBcItems) ──────────────
// Resolve an old Part#/bcNo value → the new sandbox's MTX "No." via ItemCard Vendor_Item_No.
// STRICT SUPERSET of reconcileBcNos's original resolver: steps 1 & 2 are byte-for-byte the original
// (1 = exact eq `$top=1`, take value[0] unconditionally; 2 = single-hit startswith on the RAW value,
// `$top=2`, accept iff exactly one else mark ambiguous) — so every value that resolved before still
// resolves to the SAME MTX#, and the proven 1844 mappings are unchanged (Coach C-review finding #2,
// 2026-07-28). Step 3 adds normalized-eq RESCUES (strip spaces / tighten " - "→"-" / strip trailing
// " CS" or a parenthetical) reached ONLY when 1 & 2 both miss — these can never override an earlier
// hit; they only rescue formatting-only variants that were previously unresolvable (e.g. "1032264 CS"
// → the item stored under Vendor_Item_No "1032264"). NEVER guesses: any >1-hit filter marks the value
// ambiguous (unresolvable), it is not silently picked. Returns { mtx, ambiguous, sawNon2xx, error }.
async function _cfResolveVendorItemNo(v, bcODataBase, bcHeaders) {
  const q = (s) => String(s).replace(/'/g, "''");
  let sawNon2xx = false, ambiguous = false;
  try {
    // 1. exact — ORIGINAL behavior byte-for-byte: $top=1, take value[0] unconditionally.
    const r1 = await fetch(`${bcODataBase}/ItemCard?$filter=${encodeURIComponent(`Vendor_Item_No eq '${q(v)}'`)}&$select=No,Vendor_Item_No&$top=1`, { headers: bcHeaders });
    if (r1.ok) { const row = ((await r1.json()).value || [])[0]; if (row && row.No) return { mtx: String(row.No).trim(), ambiguous: false, sawNon2xx }; }
    else sawNon2xx = true;
    // 2. single-hit startswith on the RAW value — ORIGINAL truncation fallback ($top=2, single-hit; >1 ambiguous).
    const r2 = await fetch(`${bcODataBase}/ItemCard?$filter=${encodeURIComponent(`startswith(Vendor_Item_No,'${q(v)}')`)}&$select=No,Vendor_Item_No&$top=2`, { headers: bcHeaders });
    if (r2.ok) { const vals = (await r2.json()).value || []; if (vals.length === 1 && vals[0].No) return { mtx: String(vals[0].No).trim(), ambiguous: false, sawNon2xx }; if (vals.length > 1) ambiguous = true; }
    else sawNon2xx = true;
    // 3. normalized-eq RESCUES — reached ONLY if 1 & 2 miss; additive, never overrides an earlier hit.
    const noSpace = v.replace(/\s+/g, '');
    const dash = v.replace(/\s*-\s*/g, '-').trim();
    const stripSuf = v.replace(/\s*\(.*?\)\s*$/, '').replace(/\s+(CS|cs)$/, '').trim();
    for (const cand of [noSpace, dash, stripSuf]) {
      if (!cand || cand === v) continue;
      const g = await fetch(`${bcODataBase}/ItemCard?$filter=${encodeURIComponent(`Vendor_Item_No eq '${q(cand)}'`)}&$select=No,Vendor_Item_No&$top=2`, { headers: bcHeaders });
      if (!g.ok) { sawNon2xx = true; continue; }
      const vals = (await g.json()).value || [];
      if (vals.length === 1 && vals[0].No) return { mtx: String(vals[0].No).trim(), ambiguous: false, sawNon2xx };
      if (vals.length > 1) ambiguous = true;
    }
  } catch (e) {
    return { mtx: null, ambiguous, sawNon2xx: true, error: e && e.message };
  }
  return { mtx: null, ambiguous, sawNon2xx };
}

// ── Server-side port of app.jsx bcCreateItem (:5800), #163-correct ───────────────────────
// POST omits No. → BC's item No.-Series auto-assigns MTX-#####; the full Part# is written to
// Vendor_Item_No via a follow-up OData PATCH; posting groups / UoM / category are set to the
// copied-item convention (EA / INVENTORY / RAW MAT / PARTS — measured from the existing MTX items).
// Vendor is intentionally NOT set (Jon 2026-07-28) — vendor + purchase price arrive via the normal
// RFQ / F072 flow. IDEMPOTENT: a pre-POST Vendor_Item_No dedup + adopt-if-exists means a re-run or
// partial-run never spawns a duplicate (Vendor_Item_No is not unique-constrained, so we guard it
// ourselves — mirrors bcCreateItem's #163/B038 handling). B038 transient empty-No. retry ported.
// Returns { no, vinWritten }: `no` = assigned MTX "No." (string) or null on total POST failure;
// `vinWritten` = whether the Vendor_Item_No dedup key landed (false ⇒ caller records the orphan No.).
async function _cfCreateBcItem(fullPN, meta, compId, bcApiBase, bcODataBase, bcHeaders, sleep) {
  const q = (s) => String(s).replace(/'/g, "''");
  const postHeaders = Object.assign({}, bcHeaders, { 'Content-Type': 'application/json' });
  const findExisting = async () => {
    const r = await fetch(`${bcODataBase}/ItemCard?$filter=${encodeURIComponent(`Vendor_Item_No eq '${q(fullPN)}'`)}&$select=No&$top=1`, { headers: bcHeaders });
    if (!r.ok) return null;
    const row = ((await r.json()).value || [])[0];
    return row && row.No ? String(row.No).trim() : null;
  };
  const pre = await findExisting();
  if (pre) return { no: pre, vinWritten: true }; // already exists (found BY Vendor_Item_No) — adopt, never duplicate

  const body = { displayName: String(meta.description || fullPN).slice(0, 100), itemCategoryCode: 'PARTS', baseUnitOfMeasureCode: 'EA' };
  const _isTransientEmptyNo = (txt) => /Internal_DataNotFoundFilter/i.test(txt || '') && /No\.:\s*''/.test(txt || '');
  let assignedNo = null;
  const MAX = 3;
  for (let tryN = 0; tryN < MAX; tryN++) {
    if (tryN > 0) await sleep(800 * tryN);
    const r = await fetch(`${bcApiBase}/companies(${compId})/items`, { method: 'POST', headers: postHeaders, body: JSON.stringify(body) });
    if (r.status === 401) throw new Error('BC session expired');
    if (r.ok) { const it = await r.json(); assignedNo = it && it.number ? String(it.number).trim() : null; break; }
    const txt = await r.text().catch(() => '');
    if (_isTransientEmptyNo(txt)) {
      const adopt = await findExisting(); if (adopt) return { no: adopt, vinWritten: true }; // partial persist → adopt
      if (tryN < MAX - 1) continue;
      throw new Error('BC empty-No. auto-numbering failed after retries');
    }
    if ((r.status === 409 || r.status === 400) && /already exists|duplicate/i.test(txt)) { const adopt = await findExisting(); if (adopt) return { no: adopt, vinWritten: true }; }
    throw new Error(txt || `BC item POST returned ${r.status}`);
  }
  if (!assignedNo) return { no: null, vinWritten: false };

  // The item now exists in BC under `assignedNo`. The full Part# → Vendor_Item_No is the DEDUP KEY,
  // so write it in its OWN retried PATCH FIRST (must-succeed for idempotency). Posting groups go in a
  // SEPARATE best-effort PATCH so a bad posting-group code can never block the Vendor_Item_No write.
  // (Coach C-review finding #1, 2026-07-28: the old combined PATCH threw on any 400 → left the item
  // with an auto-No. but NO Vendor_Item_No, so a re-run couldn't find it → duplicate creation.)
  // NEITHER patch throws: on POST success the item is committed; we return its No. so the caller maps
  // the ARC row to it (Re-link keys planning lines on No., not Vendor_Item_No). vinWritten=false is
  // surfaced by the caller into createErrors WITH the No. so the orphan is cleaned up by No., never
  // blind-recreated.
  await sleep(3000); // newly-created item needs a moment to index before OData PATCH
  const patchItem = async (fields) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(4000);
      try {
        const gr = await fetch(`${bcODataBase}/ItemCard?$filter=${encodeURIComponent(`No eq '${q(assignedNo)}'`)}`, { headers: bcHeaders });
        if (!gr.ok) { if (attempt === 2) return false; continue; }
        const rec = ((await gr.json()).value || [])[0];
        const etag = rec && rec['@odata.etag'];
        const pr = await fetch(`${bcODataBase}/ItemCard('${q(assignedNo)}')`, { method: 'PATCH', headers: Object.assign({}, postHeaders, { 'If-Match': etag || '*' }), body: JSON.stringify(fields) });
        if (pr.ok || pr.status === 204) return true;
        if (attempt === 2) return false;
      } catch (e) { if (attempt === 2) return false; }
    }
    return false;
  };
  const vinWritten = await patchItem({ Vendor_Item_No: fullPN });                                  // critical (dedup key)
  await patchItem({ Gen_Prod_Posting_Group: 'INVENTORY', Inventory_Posting_Group: 'RAW MAT' });    // best-effort
  return { no: assignedNo, vinWritten };
}

// ── reconcileBcNos — #163 BC-sandbox migration reconciliation ────────────────────────────
// Walks every project's BOM rows and reconciles the cached BC item "No." (old mfr Part#) to the
// new sandbox's MTX-##### surrogate. In the #163 sandbox, item No. → MTX-##### and the full Part#
// moved into Vendor_Item_No, so a planning-line POST keyed on the old Part# gets BC 400. This CF
// resolves each old value → MTX No. via ItemCard?$filter=Vendor_Item_No and rewrites the row caches.
//
// Templated on stampProjectsBcEnv (admin-gate + company project-walk + dryRun + report skeleton)
// and bulkMfrLookup (client delegates its BC bearer token + bcODataBase; server-side ItemCard
// resolution; dryRun DEFAULT TRUE; isTest force-dry; assertBcODataBase SSRF pin).
//
// DATA-SAFETY (Data-Retention #1/#4/#6): dry-run default TRUE; resolution phase is READ-ONLY;
// apply phase does a FIELD-LEVEL read-modify-write per project doc (update({panels}) — never a
// whole-doc set), rewriting ONLY the reconciled row fields in place and preserving every other
// field (schemaVersion, storageUrl, admin fields) + all other collections. Unresolvable rows are
// LEFT UNCHANGED and flagged (never guessed). bcItemId/bcVerify are NULLED (env-specific), not
// fabricated. Applied old→MTX pairs are persisted to companies/{cid}/bcReconcileRuns/{ts} (audit +
// reverse-run/rollback map). Config learning-DBs (sqCrossings / supplierCrossRef) are NOT touched
// in this run (deferred, per plan). isTestCompany is skipped/forced-dry.
exports.reconcileBcNos = functions.runWith({ timeoutSeconds: 540, memory: '512MB', maxInstances: 1 }).https.onCall(async (data, context) => {
  // Admin gate — mirror stampProjectsBcEnv
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const uid = context.auth.uid;
  const profileSnap = await db.doc(`users/${uid}/config/profile`).get();
  const companyId = profileSnap.exists ? profileSnap.data().companyId : null;
  if (!companyId) throw new functions.https.HttpsError('failed-precondition', 'No company workspace for caller');
  const memberSnap = await db.doc(`companies/${companyId}/members/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Admin only');
  }

  const { bcToken, bcODataBase } = data || {};
  if (!bcToken || !bcODataBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken and bcODataBase required');
  assertBcODataBase(bcODataBase);

  // dryRun DEFAULT TRUE — only an explicit dryRun:false applies writes. isTest / isTestCompany
  // force dry (writes suppressed) but the read-only resolution + classification still run so the
  // report is produced — mirrors bulkMfrLookup's _skipMfrWrites honesty.
  const companySnap = await db.doc(`companies/${companyId}`).get();
  const isTestCompany = !!(companySnap.exists && companySnap.data() && companySnap.data().isTestCompany);
  const dryRun = !(data && data.dryRun === false);
  const forceDry = dryRun || isTestCompany || !!(data && data.isTest === true);

  // Durable run report — the dry-run walk can exceed the client callable window; the client polls
  // this fixed doc so the computed report survives a timeout. Written 'running' now, 'done' with the
  // full report at the end, 'error' in the catch so failures are visible too. (maxInstances:1 keeps
  // this a strictly one-at-a-time op — a concurrent invoke can't collide on this doc.)
  const statusRef = db.doc(`companies/${companyId}/config/bcReconcileStatus`);
  const startedAt = Date.now();
  await statusRef.set({ status: 'running', dryRun: forceDry, startedAt, by: uid });

  try {
  const bcHeaders = { 'Authorization': `Bearer ${bcToken}`, 'Accept': 'application/json' };
  const MTX_RE = /^MTX-/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Non-item / non-priceable row predicate — PORTED VERBATIM from ARC's SSOT
  // _isExcludedFromPriceCheck / _isBuyoffOrCrate (src/app.jsx :17358 / :17354), the same predicate
  // that drives BOM red-flagging (see CLAUDE.md "BOM Row Highlighting": labor, customer-supplied,
  // contingency, buyoff/crate, Matrix Systems vendor are excluded). These are pseudo-parts (CRATE,
  // CONTINGENCY, WIRE & CONSUMABLES, JOB BUYOFF, etc.), NOT real BC items — they carry no
  // Vendor_Item_No and must not be flagged unresolvable. The CF can't cross-call app.jsx, so the
  // logic is replicated (SSOT-by-replication). CONTINGENCY_PNS mirrors app.jsx's contingency part#
  // set (:12417) so legacy contingency rows recognized by part# (not the isContingency flag) — e.g.
  // "WIRE & CONSUMABLES" — are also caught, matching ARC's own `r.isContingency||CONTINGENCY_PNS`
  // idiom (:7660/:8902). Text-matching here is ARC's OWN heuristic, not a new one.
  const CONTINGENCY_PNS = new Set(['CONTINGENCY', 'BOM CONTINGENCY', 'WIRE & CONSUMABLES']);
  const _cfIsBuyoffOrCrate = (r) => {
    const pn = (r.partNumber || '').toLowerCase(), desc = (r.description || '').toLowerCase(), cf = (r.crossedFrom || '').toLowerCase();
    return /buyoff/i.test(pn) || /buyoff/i.test(desc) || /buyoff/i.test(cf) || /crat(e|ing)/i.test(pn) || /crat(e|ing)/i.test(desc) || /crat(e|ing)/i.test(cf);
  };
  const _cfIsNonItem = (r) => {
    if (!r) return false;
    const isContingency = r.isContingency || CONTINGENCY_PNS.has((r.partNumber || '').trim().toUpperCase());
    return !!r.isLaborRow || !!r.customerSupplied || isContingency || /matrix\s*systems/i.test(r.bcVendorName || '') || _cfIsBuyoffOrCrate(r);
  };

  const snap = await db.collection(`companies/${companyId}/projects`).get();

  // ── Phase 1 (READ-ONLY): dedupe the unique set of resolvable values across all BOM rows ──
  // Resolvable candidate = (row.bcNo || row.partNumber), non-blank, not already MTX, not a non-item
  // row (labor/contingency/crate/buyoff/customer-supplied/Matrix-Systems — never real BC items).
  const uniqueVals = new Set();
  const valueMeta = {}; // value -> {description, manufacturer} (first occurrence, for enriching lists)
  for (const d of snap.docs) {
    const pd = d.data() || {};
    for (const panel of (pd.panels || [])) {
      for (const row of (panel.bom || [])) {
        // Jon 2026-07-28: crate / contingency / buyoff / wire&consumables have a Part# in BC "just
        // like everything else" — they're merely NON-INVENTORY items. So map EVERY non-labor row by
        // Vendor_Item_No; do NOT pre-exclude the price-check pseudo-parts (the old _cfIsNonItem gate
        // wrongly skipped real BC items, e.g. BOM CONTINGENCY → MTX-114570). Labor rows are Resource
        // lines (not items) and are handled separately below.
        if (!row || row.isLaborRow) continue;
        const v = ((row.bcNo || row.partNumber) || '').toString().trim();
        if (!v || MTX_RE.test(v)) continue;
        uniqueVals.add(v);
        if (!valueMeta[v]) valueMeta[v] = { description: row.description || null, manufacturer: row.manufacturer || null };
      }
    }
  }

  // ── Resolve each unique value → MTX "No." via the shared _cfResolveVendorItemNo helper ──
  // exact → single-hit startswith (truncation) → normalized-eq rescues (LAST). The first two
  // strategies reproduce this CF's original resolver byte-for-byte (proven 1844 mappings unchanged);
  // the normalized rescues only add resolutions for formatting-only variants that were previously
  // unresolvable (e.g. "1032264 CS"). >1-hit ⇒ ambiguous (unresolvable), never guessed.
  const oldToMtx = {};   // v -> MTX No.
  const ambiguous = [];  // v with >1 hit (unresolvable)
  const resolveErrors = []; // v where the OData lookup errored (unresolvable)
  for (const v of uniqueVals) {
    const res = await _cfResolveVendorItemNo(v, bcODataBase, bcHeaders);
    if (res.mtx) oldToMtx[v] = res.mtx;
    else if (res.ambiguous) ambiguous.push(v);
    if (res.error) resolveErrors.push({ value: v, error: res.error });
    if (res.sawNon2xx) await sleep(15); // back off ONLY after an error response — successful runs stay fast
  }
  // manualMap — operator-supplied {oldValue: 'MTX-#####'} overrides for rows that cannot auto-resolve by
  // Vendor_Item_No but whose correct BC item the operator has identified (e.g. crate/contingency whose ARC
  // description differs from the BC item naming: Jon 2026-07-28 CRATE→MTX-114825, CONTINGENCY→MTX-114763).
  // Only accept explicit MTX-prefixed targets (guard against typos); these seed oldToMtx so Phase 2 rewrites
  // those rows exactly like an auto-resolved one, and they land in the audit pairs.
  const manualMap = (data && data.manualMap && typeof data.manualMap === 'object') ? data.manualMap : {};
  for (const k of Object.keys(manualMap)) {
    const tgt = String(manualMap[k] || '').trim();
    if (MTX_RE.test(tgt)) oldToMtx[k] = tgt;
  }

  // ── Phase 2: classify + report every row; apply field-level RMW when live ──
  let total = 0, resolvable = 0, alreadyMtx = 0, laborOrNull = 0, nonItem = 0, unresolvable = 0;
  let appliedProjects = 0, appliedRows = 0, panelFieldsRewritten = 0;
  const unresolvableList = [];
  const appliedPairs = {}; // old -> MTX actually written (audit / reverse map)
  const pairs = Object.keys(oldToMtx).map((k) => ({ old: k, mtx: oldToMtx[k] }));

  for (const d of snap.docs) {
    const pd = d.data() || {};
    const projectId = d.id;
    const projectNumber = pd.bcProjectNumber || pd.number || null;
    const panels = pd.panels || [];
    let docChanged = false;
    for (let pi = 0; pi < panels.length; pi++) {
      const panel = panels[pi] || {};
      const bom = panel.bom || [];
      for (const row of bom) {
        total++;
        if (row && row.isLaborRow) { laborOrNull++; continue; }
        const raw = ((row && (row.bcNo || row.partNumber)) || '').toString().trim();
        if (!raw) { laborOrNull++; continue; }
        if (MTX_RE.test(raw)) { alreadyMtx++; continue; }
        // Jon 2026-07-28: crate/contingency/buyoff/wire&cons are real BC items (Non-Inventory), so they
        // are NO LONGER bucketed out as "nonItem" — every non-labor row flows through the resolver and
        // is mapped (e.g. BOM CONTINGENCY → MTX-114570) or flagged unresolvable if its Vendor_Item_No
        // doesn't match (e.g. a crate whose ARC description differs from the BC crate naming → a user
        // identifies it, like any unmatched part). The `nonItem` counter is retained (now ~0) for the
        // report's shape/back-compat.
        const mtx = oldToMtx[raw];
        if (mtx) {
          resolvable++;
          if (!forceDry) {
            // Field-level rewrite on the resolvable row — mirrors applyRemaps (app.jsx :11485).
            row.bcNo = mtx;
            row.bcItemNumber = mtx;
            row.bcPartNumber = mtx;
            row.bcItemId = null;  // BC GUID is env-specific — invalid in the new sandbox
            row.bcVerify = null;  // needs re-verification against the new env
            appliedRows++;
            appliedPairs[raw] = mtx;
            docChanged = true;
          }
        } else {
          unresolvable++;
          // Enrich with description + manufacturer (pulled from the same row — no extra reads) so
          // Jon can identify each flagged item in BC.
          unresolvableList.push({ projectId, projectNumber, panel: pi + 1, rowId: (row && row.id) || null, value: raw, description: (row && row.description) || null, manufacturer: (row && row.manufacturer) || null });
          if (!forceDry) { row._bcReconcileFlag = true; docChanged = true; } // leave value unchanged, flag for manual
        }
      }
      // panel.bcItemNumber — secondary cache, rewrite where present (panels pushed as assembly items)
      const pv = (panel.bcItemNumber || '').toString().trim();
      if (pv && !MTX_RE.test(pv) && oldToMtx[pv] && !forceDry) {
        panel.bcItemNumber = oldToMtx[pv];
        panelFieldsRewritten++;
        docChanged = true;
      }
    }
    if (!forceDry && docChanged) {
      // FIELD-LEVEL read-modify-write: update ONLY the `panels` field (we mutated it in place),
      // preserving every other project-doc field. Never a whole-doc set.
      await d.ref.update({ panels });
      appliedProjects++;
    }
  }

  // Enrich the ambiguous value list (>1 prefix hit) with description/manufacturer from the first
  // row that carried each value — same identify-in-BC aid as unresolvableList.
  const ambiguousList = ambiguous.map((v) => ({ value: v, description: (valueMeta[v] && valueMeta[v].description) || null, manufacturer: (valueMeta[v] && valueMeta[v].manufacturer) || null }));

  // ── Audit doc (live runs only) — old→MTX map + counts for reverse-run/rollback ──
  let auditDocPath = null;
  if (!forceDry) {
    const ts = Date.now();
    auditDocPath = `companies/${companyId}/bcReconcileRuns/${ts}`;
    await db.doc(auditDocPath).set({
      ts,
      runAt: admin.firestore.FieldValue.serverTimestamp(),
      by: uid,
      bcODataBase,
      appliedProjects, appliedRows, panelFieldsRewritten,
      resolvable, alreadyMtx, laborOrNull, nonItem, unresolvable, total,
      pairs: appliedPairs,                        // old -> MTX (reverse map)
      unresolvableSample: unresolvableList.slice(0, 500),
    });
  }

  console.log(`[reconcileBcNos] company=${companyId} dryRun=${forceDry} total=${total} resolvable=${resolvable} alreadyMtx=${alreadyMtx} laborOrNull=${laborOrNull} nonItem=${nonItem} unresolvable=${unresolvable} ambiguous=${ambiguous.length} appliedProjects=${appliedProjects} appliedRows=${appliedRows}`);

  const result = {
    dryRun: forceDry,                 // honest: true whenever no writes were applied
    total, resolvable, alreadyMtx, laborOrNull, nonItem, unresolvable,
    pairs,                            // [{old,mtx}] — full resolvable map
    unresolvableList,                 // [{projectId,projectNumber,panel,rowId,value,description,manufacturer}]
    ambiguousList,                    // [{value,description,manufacturer}] — >1 prefix hit (unresolvable)
    ambiguous: ambiguous.length,      // count of ambiguous values
    resolveErrors,                    // values whose OData lookup errored (unresolvable)
    panelFieldsRewritten,
    applied: forceDry ? null : { projects: appliedProjects, rows: appliedRows, panelFields: panelFieldsRewritten, auditDoc: auditDocPath },
  };

  // Durable 'done' report — client polls this doc, so it survives a callable timeout. pairs are
  // CAPPED to keep the doc under Firestore's 1 MB limit; the COMPLETE old→MTX map still lands in
  // the bcReconcileRuns/{ts} audit doc on live applies. Counts + FULL unresolvable/ambiguous lists
  // are kept whole (those drive Jon's verify + the truncation-join decision).
  await statusRef.set({
    status: 'done', dryRun: forceDry, startedAt, finishedAt: Date.now(), by: uid,
    report: {
      total, resolvable, alreadyMtx, laborOrNull, nonItem, unresolvable,
      ambiguous: ambiguous.length, resolveErrors: resolveErrors.length,
      panelFieldsRewritten,
      applied: result.applied,
      pairsTotal: pairs.length,
      pairsSample: pairs.slice(0, 200),      // capped — full map is in bcReconcileRuns/{ts} on live runs
      unresolvableList,                       // FULL [{...,description,manufacturer}]
      ambiguousList,                          // FULL [{value,description,manufacturer}]
      resolveErrorsList: resolveErrors,       // FULL (small)
    },
  }, { merge: true });

  return result;
  } catch (err) {
    // Surface failures on the status doc too (a client timeout would otherwise hide them).
    await statusRef.set({ status: 'error', dryRun: forceDry, startedAt, finishedAt: Date.now(), error: (err && err.message) || String(err) }, { merge: true }).catch(() => {});
    throw err;
  }
});

// ── createMissingBcItems — #163 BC-sandbox migration: create the items the new sandbox lacks ──
// The new sandbox was seeded from an Items export that predates ~50 parts still referenced by ARC
// BOMs (proven 2026-07-28: 48/50 Category-B parts returned 200-with-zero-results). This CF creates
// each genuinely-missing item in the new sandbox (MTX auto-numbered, full Part# → Vendor_Item_No),
// then rewrites the referencing ARC BOM rows' bcNo → the new MTX so a later Re-link resolves them
// as real Item planning lines (not cost-less Text-line fallbacks). Companion to reconcileBcNos:
// reconcile maps parts that ALREADY exist; this creates the ones that DON'T. Run reconcile FIRST so
// its resolvable rows are already MTX (skipped as candidates here) → this CF's candidate set is just
// the leftover unresolved distinct values, keeping the resolve+create walk well within 540s.
//
// DATA-SAFETY: dryRun DEFAULT TRUE (only dryRun:false creates + rewrites); isTestCompany/isTest
// force-dry. The dry run does the full read-only scan + existence resolve and REPORTS the exact
// create list (with descriptions) — a safe preview. Creates are IDEMPOTENT (pre-POST Vendor_Item_No
// dedup + adopt-if-exists — never a duplicate on re-run). Row rewrite is a FIELD-LEVEL
// update({panels}) per project doc (never a whole-doc set), mirroring reconcileBcNos. Vendor is NOT
// set on create (Jon 2026-07-28). A durable status doc (config/bcItemCreateStatus) survives the
// callable timeout; a live-run audit lands in companies/{cid}/bcItemCreateRuns/{ts}.
// assertBcODataBase pins BOTH bases to the BC domain prefix (SSRF guard). Admin-only.
exports.createMissingBcItems = functions.runWith({ timeoutSeconds: 540, memory: '512MB', maxInstances: 1 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const uid = context.auth.uid;
  const profileSnap = await db.doc(`users/${uid}/config/profile`).get();
  const companyId = profileSnap.exists ? profileSnap.data().companyId : null;
  if (!companyId) throw new functions.https.HttpsError('failed-precondition', 'No company workspace for caller');
  const memberSnap = await db.doc(`companies/${companyId}/members/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data().role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'Admin only');

  const { bcToken, bcODataBase, bcApiBase } = data || {};
  if (!bcToken || !bcODataBase || !bcApiBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken, bcODataBase, bcApiBase required');
  assertBcODataBase(bcODataBase);
  assertBcODataBase(bcApiBase); // same BC domain-prefix pin (SSRF guard)

  const companySnap = await db.doc(`companies/${companyId}`).get();
  const isTestCompany = !!(companySnap.exists && companySnap.data() && companySnap.data().isTestCompany);
  const dryRun = !(data && data.dryRun === false);
  const forceDry = dryRun || isTestCompany || !!(data && data.isTest === true);
  // Safety cap on creates/run. Each create carries a hard ~3s pre-PATCH index wait (+ fetches/retries),
  // so ~100 creates ≈ the 540s process ceiling (Coach finding #3). Default 100, hard ceiling 120. The
  // real backlog is ~48 (one run). Larger backlogs are split across invocations — safe because creates
  // are idempotent (pre-POST Vendor_Item_No dedup + adopt) and rows are rewritten as each item lands,
  // so a re-run resumes where the last left off. missingOverflow is logged, never silently dropped.
  const MAX_CREATE = Math.min(Number(data && data.maxCreate) || 100, 120);
  // excludeValues — explicit skip-list of Part#/bcNo values that must NOT be created (nor row-mapped).
  // The CF resolves purely against BC and can't know a human disposition, so the dry-run surfaced that
  // the raw "missing" set includes non-catalog / bad-data rows the team already decided to leave as
  // Re-link Text lines (e.g. "Custom Bracket", "Unkown", the "1492-D2Cxxx" placeholder). Passing them
  // here keeps the create set to genuine catalog parts only. Excluded values are reported, never
  // silently dropped, and their rows are left untouched (they ride as Text lines at Re-link).
  const excludeSet = new Set((Array.isArray(data && data.excludeValues) ? data.excludeValues : []).map((s) => String(s).trim()).filter(Boolean));

  const statusRef = db.doc(`companies/${companyId}/config/bcItemCreateStatus`);
  const startedAt = Date.now();
  await statusRef.set({ status: 'running', dryRun: forceDry, startedAt, by: uid });

  try {
    const bcHeaders = { 'Authorization': `Bearer ${bcToken}`, 'Accept': 'application/json' };
    const MTX_RE = /^MTX-/i;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Non-item predicate — ported VERBATIM from reconcileBcNos (SSOT: app.jsx _isExcludedFromPriceCheck).
    const CONTINGENCY_PNS = new Set(['CONTINGENCY', 'BOM CONTINGENCY', 'WIRE & CONSUMABLES']);
    const _cfIsBuyoffOrCrate = (r) => {
      const pn = (r.partNumber || '').toLowerCase(), desc = (r.description || '').toLowerCase(), cf = (r.crossedFrom || '').toLowerCase();
      return /buyoff/i.test(pn) || /buyoff/i.test(desc) || /buyoff/i.test(cf) || /crat(e|ing)/i.test(pn) || /crat(e|ing)/i.test(desc) || /crat(e|ing)/i.test(cf);
    };
    const _cfIsNonItem = (r) => {
      if (!r) return false;
      const isContingency = r.isContingency || CONTINGENCY_PNS.has((r.partNumber || '').trim().toUpperCase());
      return !!r.isLaborRow || !!r.customerSupplied || isContingency || /matrix\s*systems/i.test(r.bcVendorName || '') || _cfIsBuyoffOrCrate(r);
    };

    // Resolve the BC company GUID from the API base (env is encoded in the base; company is a path
    // arg on the items POST). Prefer the exact company named in the OData base, else the sole company.
    let compId = null;
    {
      const wantName = decodeURIComponent(((bcODataBase.match(/Company\('([^']+)'\)/) || [])[1]) || '').trim();
      const cr = await fetch(`${bcApiBase}/companies?$select=id,name,displayName`, { headers: bcHeaders });
      if (!cr.ok) throw new functions.https.HttpsError('failed-precondition', `BC companies GET failed: ${cr.status}`);
      const comps = (await cr.json()).value || [];
      const pick = comps.find((c) => c.name === wantName || c.displayName === wantName) || (comps.length === 1 ? comps[0] : null);
      if (!pick || !pick.id) throw new functions.https.HttpsError('failed-precondition', `Could not resolve BC company id (wanted '${wantName}', got ${comps.length})`);
      compId = pick.id;
    }

    const snap = await db.collection(`companies/${companyId}/projects`).get();

    // Phase 1 (READ-ONLY): unique candidate values + canonical metadata (best description / first
    // real cost / manufacturer). Candidate = (bcNo||partNumber), non-blank, not already MTX, not a
    // non-item pseudo-row. Already-MTX rows are skipped — so after a live reconcile, the candidate
    // set is just the leftover unresolved values.
    const uniqueVals = new Set();
    const meta = {}; // v -> { description, unitCost, manufacturer }
    for (const d of snap.docs) {
      const pd = d.data() || {};
      for (const panel of (pd.panels || [])) {
        for (const row of (panel.bom || [])) {
          if (!row || _cfIsNonItem(row)) continue;
          const v = ((row.bcNo || row.partNumber) || '').toString().trim();
          if (!v || MTX_RE.test(v)) continue;
          uniqueVals.add(v);
          const m = meta[v] || (meta[v] = { description: null, unitCost: null, manufacturer: null });
          if (!m.description && row.description) m.description = String(row.description);
          if (m.unitCost == null && Number(row.unitPrice) > 0) m.unitCost = Number(row.unitPrice);
          if (!m.manufacturer && row.manufacturer) m.manufacturer = String(row.manufacturer);
        }
      }
    }

    // Phase 2 (READ-ONLY): classify each unique value via the shared resolver.
    const existing = {};        // v -> MTX (already in BC → map, don't create)
    const ambiguousList = [];   // >1 hit — skip create (it exists), Jon disambiguates
    const missing = [];         // v with no match → create
    const excludedList = [];    // v in the explicit skip-list — not created, not row-mapped
    for (const v of uniqueVals) {
      if (excludeSet.has(v)) { excludedList.push(v); continue; } // explicit skip — no create, no map, no resolve
      const res = await _cfResolveVendorItemNo(v, bcODataBase, bcHeaders);
      if (res.mtx) existing[v] = res.mtx;
      else if (res.ambiguous) ambiguousList.push({ value: v, description: (meta[v] && meta[v].description) || null, manufacturer: (meta[v] && meta[v].manufacturer) || null });
      else missing.push(v);
      if (res.sawNon2xx) await sleep(15);
    }

    // Phase 3 (WRITE, live only): create the missing items, capped.
    const created = {};          // v -> new MTX
    const createErrors = [];     // { value, error }
    let createdCount = 0;
    const toCreate = missing.slice(0, MAX_CREATE);
    const missingOverflow = missing.length - toCreate.length; // logged, never silently dropped
    if (!forceDry) {
      for (const v of toCreate) {
        try {
          const res = await _cfCreateBcItem(v, meta[v] || {}, compId, bcApiBase, bcODataBase, bcHeaders, sleep);
          if (res && res.no) {
            created[v] = res.no; createdCount++;
            // vinWritten=false ⇒ item created but the Vendor_Item_No dedup key didn't land. The ARC
            // row IS still mapped to res.no below (Re-link works), but record the orphan No. so it can
            // be cleaned up by No. and never blind-recreated (Coach C-review finding #1).
            if (!res.vinWritten) createErrors.push({ value: v, no: res.no, error: 'created but Vendor_Item_No PATCH failed — row mapped; clean up orphan by No.' });
          } else {
            createErrors.push({ value: v, error: 'no No. returned' });
          }
          // Incremental persist (Coach finding #3): a 540s process-kill mid-loop must not lose the
          // created→MTX map. Every 5 creates, checkpoint it to the status doc so a re-run/human can
          // recover; the re-run itself is idempotent (findExisting adopts by the now-written VIN).
          if (createdCount % 5 === 0) await statusRef.set({ status: 'running', progress: { attempted: createdCount, total: toCreate.length }, partialCreated: created }, { merge: true }).catch(() => {});
        } catch (e) {
          createErrors.push({ value: v, error: (e && e.message) || String(e) });
        }
      }
    }

    // Phase 4 (WRITE, live only): rewrite ARC rows for created + already-existing → MTX (field-level
    // RMW, mirrors reconcileBcNos). This is what makes the created/mapped items resolve at Re-link.
    const applyMap = Object.assign({}, existing, created); // v -> MTX
    let appliedProjects = 0, appliedRows = 0;
    if (!forceDry && Object.keys(applyMap).length) {
      for (const d of snap.docs) {
        const pd = d.data() || {};
        const panels = pd.panels || [];
        let docChanged = false;
        for (const panel of panels) {
          for (const row of (panel.bom || [])) {
            if (!row) continue;
            const raw = ((row.bcNo || row.partNumber) || '').toString().trim();
            if (!raw || MTX_RE.test(raw)) continue;
            const mtx = applyMap[raw];
            if (mtx) {
              row.bcNo = mtx; row.bcItemNumber = mtx; row.bcPartNumber = mtx;
              row.bcItemId = null; row.bcVerify = null;         // env-specific — invalid in new sandbox
              if (row._bcReconcileFlag) row._bcReconcileFlag = null; // clear any prior reconcile flag
              appliedRows++; docChanged = true;
            }
          }
        }
        if (docChanged) { await d.ref.update({ panels }); appliedProjects++; }
      }
    }

    // Audit (live runs only) — created + existingMapped + counts for reverse-run/rollback.
    let auditDocPath = null;
    if (!forceDry) {
      const ts = Date.now();
      auditDocPath = `companies/${companyId}/bcItemCreateRuns/${ts}`;
      await db.doc(auditDocPath).set({
        ts, runAt: admin.firestore.FieldValue.serverTimestamp(), by: uid,
        bcODataBase, bcApiBase, createdCount, created, existingMapped: existing,
        appliedProjects, appliedRows, createErrors,
      });
    }

    const missingList = toCreate.map((v) => ({ value: v, description: (meta[v] && meta[v].description) || null, manufacturer: (meta[v] && meta[v].manufacturer) || null, unitCost: (meta[v] && meta[v].unitCost) || null }));
    console.log(`[createMissingBcItems] company=${companyId} dryRun=${forceDry} candidates=${uniqueVals.size} excluded=${excludedList.length} alreadyExists=${Object.keys(existing).length} ambiguous=${ambiguousList.length} missing=${missing.length} created=${createdCount} appliedRows=${appliedRows}`);

    const result = {
      dryRun: forceDry,
      candidates: uniqueVals.size,
      excluded: excludedList.length,
      alreadyExists: Object.keys(existing).length,
      ambiguous: ambiguousList.length,
      missing: missing.length,
      wouldCreate: forceDry ? toCreate.length : null, // null (not undefined) — Firestore rejects undefined in the status-doc write
      created: forceDry ? 0 : createdCount,
      createErrors,
      missingOverflow,
      applied: forceDry ? null : { projects: appliedProjects, rows: appliedRows, auditDoc: auditDocPath },
    };
    await statusRef.set({
      status: 'done', dryRun: forceDry, startedAt, finishedAt: Date.now(), by: uid,
      report: Object.assign({}, result, { missingList, ambiguousList, excludedList, createdPairs: forceDry ? null : created }),
    }, { merge: true });
    return result;
  } catch (err) {
    await statusRef.set({ status: 'error', dryRun: forceDry, startedAt, finishedAt: Date.now(), error: (err && err.message) || String(err) }, { merge: true }).catch(() => {});
    throw err;
  }
});

// ── loadBcPurchasePrices — one-time bulk load of Item purchase costs into BC PurchasePrices ────────
// Reads the bundled ppPurchasePriceData.json (rows exported from the MTX-keyed Item Master:
// {no: MTX item No., vendorNo, uom, cost}) and, per item+vendor, mirrors the app's proven
// bcPushPurchasePrice (F072): writes a Direct_Unit_Cost record at startingDate (default 2026-01-01)
// and expires the pre-existing $0 placeholder line (Ending_Date = startingDate-1) — exactly the
// mechanism validated live on the 10-item pilot (2026-07-29). Admin-gated; dryRun DEFAULT TRUE;
// processes a slice [offset, offset+limit) so the client drives it in chunks within the 540s window;
// concurrency-limited; idempotent on re-run (a same-day record is PATCHed, not duplicated).
// isTestCompany forces dry. Data rides in the deploy bundle → no fragile client-side transport.
// The Starting_Date OData key order (Item_No,Vendor_No,Currency_Code,Starting_Date,Variant_Code,
// Unit_of_Measure_Code,Minimum_Quantity) was verified live against MATR_SndBx_UAT_070926.
function _cfPpKeyUrl(baseUrl, k) {
  const q = (s) => encodeURIComponent(String(s == null ? '' : s).replace(/'/g, "''")); // parity with app _bcPpKeyUrl
  return `${baseUrl}(Item_No='${q(k.itemNo)}',Vendor_No='${q(k.vendorNo)}',Currency_Code='${q(k.currencyCode)}',Starting_Date=${k.startingDate},Variant_Code='${q(k.variantCode)}',Unit_of_Measure_Code='${q(k.uom)}',Minimum_Quantity=${Number(k.minQty) || 0})`;
}
const _cfDateUnset = (d) => !d || String(d).slice(0, 10) === '0001-01-01';
// Mirror app.jsx _bcPatchWithFreshEtag (:6261): this NAV tenant 409s on If-Match:* AND on a stale
// list-metadata etag — so read a FRESH etag via a keyed GET immediately before the PATCH. (The 10-item
// CF spot-check 2026-07-29 confirmed the list etag → 409 on the expire PATCH; POST/create is unaffected.)
async function _cfPatchFreshEtag(keyUrl, body, bcHeaders) {
  let etag = '';
  try {
    const gr = await fetch(keyUrl, { headers: bcHeaders });
    if (gr.ok) { let gb = null; try { gb = await gr.json(); } catch (_) {} etag = (gb && gb['@odata.etag']) || (gr.headers && gr.headers.get && gr.headers.get('ETag')) || ''; }
  } catch (_) {}
  if (!etag) return { ok: false, status: 0 };
  const pr = await fetch(keyUrl, { method: 'PATCH', headers: Object.assign({}, bcHeaders, { 'Content-Type': 'application/json', 'If-Match': etag }), body: JSON.stringify(body) });
  return { ok: pr.ok, status: pr.status };
}

exports.loadBcPurchasePrices = functions.runWith({ timeoutSeconds: 540, memory: '512MB', maxInstances: 1 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const uid = context.auth.uid;
  const profileSnap = await db.doc(`users/${uid}/config/profile`).get();
  const companyId = profileSnap.exists ? profileSnap.data().companyId : null;
  if (!companyId) throw new functions.https.HttpsError('failed-precondition', 'No company workspace for caller');
  const memberSnap = await db.doc(`companies/${companyId}/members/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data().role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'Admin only');

  const { bcToken, bcODataBase } = data || {};
  if (!bcToken || !bcODataBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken and bcODataBase required');
  assertBcODataBase(bcODataBase);

  const companySnap = await db.doc(`companies/${companyId}`).get();
  const isTestCompany = !!(companySnap.exists && companySnap.data() && companySnap.data().isTestCompany);
  const dryRun = !(data && data.dryRun === false);
  const forceDry = dryRun || isTestCompany || !!(data && data.isTest === true);

  const startingDate = (data && typeof data.startingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.startingDate)) ? data.startingDate : '2026-01-01';
  const _pd = new Date(startingDate + 'T00:00:00Z'); _pd.setUTCDate(_pd.getUTCDate() - 1);
  const expireDate = _pd.toISOString().slice(0, 10);

  const PP_DATA = require('./ppPurchasePriceData.json'); // lazy (cached) — only this fn loads the 650KB list
  const total = PP_DATA.length;
  const offset = Math.max(0, parseInt((data && data.offset) || 0, 10) || 0);
  const limit = Math.min(2000, Math.max(1, parseInt((data && data.limit) || 1000, 10) || 1000));
  const slice = PP_DATA.slice(offset, offset + limit);

  const statusRef = db.doc(`companies/${companyId}/config/bcPpLoadStatus`);
  const startedAt = Date.now();
  await statusRef.set({ status: 'running', dryRun: forceDry, startingDate, offset, limit, total, startedAt, by: uid }, { merge: true });

  try {
    const baseUrl = `${bcODataBase}/PurchasePrices`;
    const bcHeaders = { 'Authorization': `Bearer ${bcToken}`, 'Accept': 'application/json' };
    const postHeaders = Object.assign({}, bcHeaders, { 'Content-Type': 'application/json' });
    const q = (s) => String(s == null ? '' : s).replace(/'/g, "''");
    const sd = (r) => r.Starting_Date ? String(r.Starting_Date).slice(0, 10) : '';

    let created = 0, updated = 0, expired = 0, expireFailed = 0, failed = 0, skipped = 0;
    const failures = [];

    async function processOne(rec) {
      const itemNo = String(rec.no || '').trim();
      const vendorNo = String(rec.vendorNo || '').trim();
      const uom = String(rec.uom || '').trim();
      const cost = Number(rec.cost);
      if (!itemNo || !vendorNo || !(cost > 0)) { skipped++; return; }
      // Read existing PurchasePrices rows for this item+vendor (default metadata → carries @odata.etag).
      const filter = `Item_No eq '${q(itemNo)}' and Vendor_No eq '${q(vendorNo)}'`;
      const gr = await fetch(`${baseUrl}?$filter=${encodeURIComponent(filter)}&$select=Item_No,Vendor_No,Currency_Code,Starting_Date,Variant_Code,Unit_of_Measure_Code,Minimum_Quantity,Direct_Unit_Cost,Ending_Date`, { headers: bcHeaders });
      if (!gr.ok) { failed++; failures.push({ itemNo, vendorNo, error: `GET existing ${gr.status}` }); return; }
      const existing = ((await gr.json()).value || []);
      // Scoped lane (mirror bcPushPurchasePrice F1): our default write lane = matching UoM + Currency''
      // + Variant'' + MinQty 0. A same-day record in that lane is UPDATED in place (never duplicated).
      const scopedSameDay = existing.find((r) => sd(r) === startingDate && (r.Unit_of_Measure_Code || '') === uom && (r.Currency_Code || '') === '' && (r.Variant_Code || '') === '' && (Number(r.Minimum_Quantity) || 0) === 0);
      const wouldExpire = existing.filter((r) => Number(r.Direct_Unit_Cost) === 0 && sd(r) && sd(r) < startingDate && (_cfDateUnset(r.Ending_Date) || String(r.Ending_Date).slice(0, 10) >= startingDate));
      if (forceDry) { if (scopedSameDay) updated++; else created++; expired += wouldExpire.length; return; }
      // LIVE — write the cost record first (POST new, or PATCH the same-day record in place).
      if (scopedSameDay) {
        const keyUrl = _cfPpKeyUrl(baseUrl, { itemNo, vendorNo, currencyCode: '', startingDate, variantCode: '', uom, minQty: 0 });
        const pr = await _cfPatchFreshEtag(keyUrl, { Direct_Unit_Cost: cost }, bcHeaders);
        if (!pr.ok) { failed++; failures.push({ itemNo, vendorNo, error: `same-day PATCH ${pr.status}` }); return; }
        updated++;
      } else {
        const payload = { Item_No: itemNo, Vendor_No: vendorNo, Starting_Date: startingDate, Direct_Unit_Cost: cost };
        if (uom) payload.Unit_of_Measure_Code = uom;
        const cr = await fetch(baseUrl, { method: 'POST', headers: postHeaders, body: JSON.stringify(payload) });
        if (!cr.ok) { const t = await cr.text().catch(() => ''); failed++; failures.push({ itemNo, vendorNo, error: `POST ${cr.status} ${t.slice(0, 100)}` }); return; }
        created++;
      }
      // Best-effort: retire the pre-existing $0 placeholder line(s) (older + still active). `existing`
      // was read before the POST, so it never includes the record we just wrote. An expire failure is
      // non-fatal (matches bcPushPurchasePrice — never leave the item price-less over a cleanup miss).
      for (const r of wouldExpire) {
        const keyUrl = _cfPpKeyUrl(baseUrl, { itemNo, vendorNo, currencyCode: r.Currency_Code || '', startingDate: sd(r), variantCode: r.Variant_Code || '', uom: r.Unit_of_Measure_Code || '', minQty: Number(r.Minimum_Quantity) || 0 });
        const er = await _cfPatchFreshEtag(keyUrl, { Ending_Date: expireDate }, bcHeaders);
        if (er.ok) { expired++; } else { expireFailed++; failures.push({ itemNo, vendorNo, error: `expire PATCH ${er.status} (non-fatal — price written)` }); }
      }
    }

    // Bounded concurrency over the slice.
    const CONC = 6;
    let idx = 0;
    const worker = async () => { while (idx < slice.length) { const my = idx++; try { await processOne(slice[my]); } catch (e) { failed++; failures.push({ error: (e && e.message) || String(e) }); } } };
    await Promise.all(Array.from({ length: Math.min(CONC, slice.length || 1) }, worker));

    const nextOffset = (offset + limit < total) ? (offset + limit) : null;
    const result = { dryRun: forceDry, total, offset, limit, processed: slice.length, created, updated, expired, expireFailed, failed, skipped, failures: failures.slice(0, 50), nextOffset };
    if (!forceDry) {
      const ts = Date.now();
      await db.doc(`companies/${companyId}/bcPpLoadRuns/${ts}`).set({ ts, runAt: admin.firestore.FieldValue.serverTimestamp(), by: uid, startingDate, offset, limit, created, updated, expired, expireFailed, failed, skipped, failures: failures.slice(0, 100) });
    }
    await statusRef.set({ status: 'done', dryRun: forceDry, startingDate, offset, limit, total, finishedAt: Date.now(), by: uid, report: result }, { merge: true });
    return result;
  } catch (err) {
    await statusRef.set({ status: 'error', finishedAt: Date.now(), error: (err && err.message) || String(err) }, { merge: true }).catch(() => {});
    throw err;
  }
});

// ── reconcileArcBcPrices — STEP 2: one-time ARC→BC price reconcile ────────────────────────────────
// Design + locked decisions: docs/STEP2-ARC-BC-PRICE-RECONCILE-PLAN.md (Jon 2026-07-29).
// Walks every project's BOM rows, computes the winning ARC price per (bcNo, vendorNo), compares it to
// BC's current PurchasePrices Direct_Unit_Cost, and where they differ pushes ARC's value (ARC = source
// of truth, this once). Reuses the Step-1 write core (_cfPpKeyUrl + _cfPatchFreshEtag + $0-expire).
//   Collision rule (D): rank manual/bc/supplier ABOVE scraper/ai/'' ; within the top rank present, if the
//     prices agree (spread <= tolerance) the NEWEST wins; if they DISAGREE beyond tolerance → CONFLICT
//     (reported, NOT pushed). Item+vendors with ONLY low-source rows → low-source-only (reported, NOT pushed).
//   Match tolerance: |arc - bc| <= tolerance (default 0.005) → already matches, skip.
//   Field: row.unitPrice (the per-unit COST). $0/missing price → skip+report; missing vendor → skip+report.
//   Write: same-day PATCH-in-place of the 2026-01-01 record (Step 1 wrote it); if no such record exists for
//     a priced item+vendor (not in the Excel load), POST it + expire any $0 placeholder. Fresh-etag PATCH
//     (this NAV tenant 409s on stale/`*` etag). dryRun DEFAULT TRUE; resumable slices; audit = rollback map.
const _cfPriceMs = (d) => {
  if (d == null) return 0;
  if (typeof d === 'number') return d;
  if (typeof d === 'string') { const t = Date.parse(d); return isNaN(t) ? 0 : t; }
  if (typeof d === 'object') { if (typeof d.toMillis === 'function') { try { return d.toMillis(); } catch (_) {} } if (typeof d.seconds === 'number') return d.seconds * 1000; }
  return 0;
};
// Mirror app.jsx _effectivePriceDate (:17496): bcPoDate for priceSource 'bc', else priceDate.
const _cfEffectivePriceMs = (r) => _cfPriceMs(((r.priceSource || '').toLowerCase() === 'bc' && r.bcPoDate) ? r.bcPoDate : r.priceDate);
// Price-source trust ranking (Jon 2026-07-29): supplier(RFQ quotes) > manual > bc (carries the PRJ402119
// $0.71 junk residue) > scraper/ai/'' (never auto-pushed). Lower = more trusted.
const _cfPriceRank = (src) => { const s = (src || '').toLowerCase(); if (s === 'supplier') return 0; if (s === 'manual') return 1; if (s === 'bc') return 2; return 3; };

exports.reconcileArcBcPrices = functions.runWith({ timeoutSeconds: 540, memory: '512MB', maxInstances: 1 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const uid = context.auth.uid;
  const profileSnap = await db.doc(`users/${uid}/config/profile`).get();
  const companyId = profileSnap.exists ? profileSnap.data().companyId : null;
  if (!companyId) throw new functions.https.HttpsError('failed-precondition', 'No company workspace for caller');
  const memberSnap = await db.doc(`companies/${companyId}/members/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data().role !== 'admin') throw new functions.https.HttpsError('permission-denied', 'Admin only');

  const { bcToken, bcODataBase } = data || {};
  if (!bcToken || !bcODataBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken and bcODataBase required');
  assertBcODataBase(bcODataBase);

  const companySnap = await db.doc(`companies/${companyId}`).get();
  const isTestCompany = !!(companySnap.exists && companySnap.data() && companySnap.data().isTestCompany);
  const dryRun = !(data && data.dryRun === false);
  const forceDry = dryRun || isTestCompany || !!(data && data.isTest === true);

  const startingDate = (data && typeof data.startingDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.startingDate)) ? data.startingDate : '2026-01-01';
  const _pd = new Date(startingDate + 'T00:00:00Z'); _pd.setUTCDate(_pd.getUTCDate() - 1);
  const expireDate = _pd.toISOString().slice(0, 10);
  const TOL = (data && data.tolerance != null && !isNaN(+data.tolerance)) ? Math.abs(+data.tolerance) : 0.005;
  const offset = Math.max(0, parseInt((data && data.offset) || 0, 10) || 0);
  const limit = Math.min(2000, Math.max(1, parseInt((data && data.limit) || 1000, 10) || 1000));

  const statusRef = db.doc(`companies/${companyId}/config/bcPpReconcileStatus`);
  const startedAt = Date.now();
  await statusRef.set({ status: 'running', dryRun: forceDry, startingDate, tolerance: TOL, offset, limit, startedAt, by: uid }, { merge: true });

  try {
    // Non-item exclusion — same idiom as reconcileBcNos _cfIsNonItem (labor/customer-supplied/contingency/
    // Matrix Systems/buyoff/crate are not priceable BC catalog items).
    const CONTINGENCY_PNS = new Set(['CONTINGENCY', 'BOM CONTINGENCY', 'WIRE & CONSUMABLES']);
    const _isBuyoffOrCrate = (r) => { const pn = (r.partNumber || '').toLowerCase(), desc = (r.description || '').toLowerCase(), cf = (r.crossedFrom || '').toLowerCase(); return /buyoff/i.test(pn) || /buyoff/i.test(desc) || /buyoff/i.test(cf) || /crat(e|ing)/i.test(pn) || /crat(e|ing)/i.test(desc) || /crat(e|ing)/i.test(cf); };
    const _isNonItem = (r) => { const isC = r.isContingency || CONTINGENCY_PNS.has((r.partNumber || '').trim().toUpperCase()); return !!r.isLaborRow || !!r.customerSupplied || isC || /matrix\s*systems/i.test(r.bcVendorName || '') || _isBuyoffOrCrate(r); };

    // ── Phase 1 (READ-ONLY): walk projects → group priced rows by (bcNo, vendorNo) ──
    const buildIndex = !!(data && data.buildIndex); // PRE-PASS mode: build RFQ price index only, no reconcile
    const groups = new Map();
    let scanRows = 0, skipZero = 0, noVendor = 0, noBcNo = 0;
    if (!buildIndex) {
      const snap = await db.collection(`companies/${companyId}/projects`).get();
      for (const d of snap.docs) {
        const pd = d.data() || {};
        const projNum = pd.bcProjectNumber || pd.number || d.id; // provenance for failure/diagnostic reporting
        for (const panel of (pd.panels || [])) {
          for (const row of (panel.bom || [])) {
            if (!row || row.isLaborRow || _isNonItem(row)) continue;
            const bcNo = ((row.bcNo) || '').toString().trim();
            if (!bcNo) { noBcNo++; continue; }
            const price = Number(row.unitPrice);
            if (!(price > 0)) { skipZero++; continue; }
            const vendorNo = ((row.bcVendorNo) || '').toString().trim();
            if (!vendorNo) { noVendor++; continue; }
            scanRows++;
            const key = bcNo + ' ' + vendorNo;
            let g = groups.get(key);
            if (!g) { g = { bcNo, vendorNo, rows: [], projects: new Set() }; groups.set(key, g); }
            g.projects.add(projNum);
            g.rows.push({ price, rank: _cfPriceRank(row.priceSource), date: _cfEffectivePriceMs(row), source: (row.priceSource || '').toLowerCase() });
          }
        }
      }
    }

    // ── Phase 1b: fold in accurate RFQ quotes (Jon 2026-07-29) ──────────────────────────────────
    // Supplier-quoted prices aren't tagged on BOM rows, so mine the submitted rfqUploads directly:
    // each line's supplier unitPrice is a real quote. Key by (part#→MTX, vendorNumber), source 'supplier'
    // (rank 0 = top trust). Part#→MTX resolution is expensive (a BC lookup each), so the index is BUILT on
    // the first slice (offset 0) and cached in config/bcRfqPriceIndex; later slices read it. Legacy RFQs
    // lacking companyId are not swept (documented limit).
    const bcHeaders = { 'Authorization': `Bearer ${bcToken}`, 'Accept': 'application/json' }; // needed by Phase 1b (RFQ resolve) — declared before use
    let rfqQuotes = 0, rfqResolved = 0, rfqUnresolved = 0, rfqInjected = 0, rfqDocs = 0;
    let rfqStatusCounts = {};
    const idxRef = db.doc(`companies/${companyId}/config/bcRfqPriceIndex`);
    let rfqIndex = [];
    if (buildIndex) {
      const partToMtx = {};
      // Gather this company's RFQ docs via BOTH companyId AND each member's uid — legacy pre-v1.19.994
      // docs carry only `uid` (no companyId), so a companyId-only query misses them (the app's OR-fallback).
      const seen = {}; const docs = [];
      const addDocs = (snap) => { for (const dd of ((snap && snap.docs) || [])) { if (!seen[dd.id]) { seen[dd.id] = 1; docs.push(dd); } } };
      addDocs(await db.collection('rfqUploads').where('companyId', '==', companyId).get().catch(() => null));
      const memSnap = await db.collection(`companies/${companyId}/members`).get().catch(() => null);
      for (const m of ((memSnap && memSnap.docs) || [])) addDocs(await db.collection('rfqUploads').where('uid', '==', m.id).get().catch(() => null));
      rfqDocs = docs.length;
      const raw = [];
      for (const d of docs) {
        const rd = d.data() || {};
        const st = rd.status || '(none)'; rfqStatusCounts[st] = (rfqStatusCounts[st] || 0) + 1; // diagnostic
        if (rd.isTest) continue;                                 // skip test-env submissions
        if (st === 'dismissed' || st === 'pending') continue;    // pending=not-yet-quoted; dismissed=discarded
        const vno = (rd.vendorNumber || '').toString().trim();
        const date = _cfPriceMs(rd.sentAt);
        for (const li of (rd.lineItems || [])) {
          if (!li || li.cannotSupply) continue;
          const p = Number(li.unitPrice);                        // supplier's quoted price (not our referencePrice)
          const part = (li.partNumber || '').toString().trim();
          if (!part || !(p > 0) || !vno) continue;
          rfqQuotes++;
          raw.push({ part, vendorNo: vno, price: p, date });
        }
      }
      for (const item of raw) {
        if (!(item.part in partToMtx)) {
          const res = await _cfResolveVendorItemNo(item.part, bcODataBase, bcHeaders);
          partToMtx[item.part] = (res && res.mtx) || null;
        }
        const mtx = partToMtx[item.part];
        if (mtx) { rfqResolved++; rfqIndex.push({ mtx, vendorNo: item.vendorNo, price: item.price, date: item.date }); }
        else rfqUnresolved++;
      }
      await idxRef.set({ builtAt: Date.now(), by: uid, rfqDocs, statusCounts: rfqStatusCounts, quotes: rfqQuotes, resolved: rfqResolved, unresolved: rfqUnresolved, index: rfqIndex.slice(0, 5000) }).catch(() => {});
      // PRE-PASS complete: index staged. No reconcile/writes in this mode — return so write-slices run separately.
      await statusRef.set({ status: 'done', mode: 'buildIndex', rfqDocs, quotes: rfqQuotes, resolved: rfqResolved, unresolved: rfqUnresolved, statusCounts: rfqStatusCounts, finishedAt: Date.now(), by: uid }, { merge: true });
      return { mode: 'buildIndex', rfqDocs, rfqQuotes, rfqResolved, rfqUnresolved, rfqStatusCounts };
    }
    // Reconcile mode: ALWAYS read the cached index (built by a prior pre-pass) — never rebuild in a write slice.
    { const idxDoc = await idxRef.get().catch(() => null);
      if (idxDoc && idxDoc.exists) rfqIndex = (idxDoc.data() || {}).index || []; }
    // Merge RFQ quotes into the groups as rank-0 'supplier' rows (creates a group if the item+vendor
    // isn't in any current BOM — an RFQ price is still accurate and worth reconciling to BC).
    for (const qr of rfqIndex) {
      const key = qr.mtx + ' ' + qr.vendorNo;
      let g = groups.get(key);
      if (!g) { g = { bcNo: qr.mtx, vendorNo: qr.vendorNo, rows: [] }; groups.set(key, g); }
      g.rows.push({ price: Number(qr.price), rank: 0, date: qr.date || 0, source: 'supplier' });
      rfqInjected++;
    }

    // Collision rule D (re-ranked 2026-07-29) — take the BEST trusted tier present (supplier>manual>bc);
    // within it, disagreement>TOL = conflict; else newest wins. Rank-3-only (scraper/ai/'') = low-source.
    // A winning price that IS the junk signature ($0.71) → junkZero (zero the BC record + re-price, never push).
    const JUNK = new Set([0.71]); // PRJ402119 junk-price signature (Jon 2026-07-29)
    const resolve = (g) => {
      // N1 (Coach): drop $0.71 junk BEFORE ranking, so a junk row in a higher tier can't mask a real price
      // in a lower trusted tier. $0.71 is never a valid winner.
      const usable = g.rows.filter((r) => !JUNK.has(r.price));
      if (!usable.length) return { action: 'noRealArc' }; // all rows junk → BC state decides
      const best = Math.min(...usable.map((r) => r.rank));
      if (best === 3) return { action: 'low-source-only' };
      const cand = usable.filter((r) => r.rank === best);
      const prices = cand.map((r) => r.price);
      if (Math.max(...prices) - Math.min(...prices) > TOL) return { action: 'conflict', spread: [Math.min(...prices), Math.max(...prices)] };
      cand.sort((a, b) => b.date - a.date); // newest first
      return { action: 'resolved', winner: cand[0].price, source: cand[0].source };
    };

    const keys = [...groups.keys()].sort();
    const total = keys.length;
    const slice = keys.slice(offset, offset + limit);

    const baseUrl = `${bcODataBase}/PurchasePrices`;
    const postHeaders = Object.assign({}, bcHeaders, { 'Content-Type': 'application/json' });
    const q = (s) => String(s == null ? '' : s).replace(/'/g, "''");
    const sdf = (r) => r.Starting_Date ? String(r.Starting_Date).slice(0, 10) : '';

    let matched = 0, updated = 0, created = 0, expired = 0, expireFailed = 0, conflicts = 0, lowSourceOnly = 0, failed = 0;
    let junkZeroed = 0, junkNoBc = 0, keptBc = 0; // junk-$0.71 handling (Jon 2026-07-29): zero BC-junk / no-BC / kept-good-BC
    const bySource = { supplier: 0, manual: 0, bc: 0 }; // recovery report: which trusted source filled each reconciled price
    const samples = [], conflictList = [], failures = [], junkList = [];
    // B1 (Coach): rollback map — EVERY live update/create records old→new so the run is reversible.
    // Uncapped: bounded per-call by the slice (<= limit <= 2000), well under the 1MB Firestore doc cap.
    // Distinct from `samples` (60-cap display preview).
    const rollback = [];

    async function processGroup(key) {
      const g = groups.get(key);
      const res = resolve(g);
      if (res.action === 'low-source-only') { lowSourceOnly++; if (conflictList.length < 1000) conflictList.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, reason: 'low-source-only (scraper/ai/untagged only)' }); return; }
      if (res.action === 'conflict') { conflicts++; if (conflictList.length < 1000) conflictList.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, reason: 'trusted prices disagree', spread: res.spread }); return; }
      // Current BC record(s) for this item+vendor.
      const gr = await fetch(`${baseUrl}?$filter=${encodeURIComponent(`Item_No eq '${q(g.bcNo)}' and Vendor_No eq '${q(g.vendorNo)}'`)}&$select=Item_No,Vendor_No,Currency_Code,Starting_Date,Variant_Code,Unit_of_Measure_Code,Minimum_Quantity,Direct_Unit_Cost,Ending_Date`, { headers: bcHeaders });
      if (!gr.ok) { failed++; failures.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, projects: g.projects ? [...g.projects] : [], error: `GET existing ${gr.status}` }); return; }
      const existing = ((await gr.json()).value || []);
      const scopedSameDay = existing.find((r) => sdf(r) === startingDate && (r.Currency_Code || '') === '' && (r.Variant_Code || '') === '' && (Number(r.Minimum_Quantity) || 0) === 0);
      const bcCost = scopedSameDay ? Number(scopedSameDay.Direct_Unit_Cost) : null;
      // No usable ARC price (top tier all junk). Only zero when BC ITSELF is the junk $0.71 (Jon's
      // directive) → re-prices at quote time. A real/zero BC price is LEFT — never destroy a good value.
      if (res.action === 'noRealArc') {
        if (!scopedSameDay) { junkNoBc++; return; }        // no BC record → already unpriced → re-prices
        if (JUNK.has(Number(bcCost))) {                    // BC is $0.71 junk with no better ARC price → zero it
          if (junkList.length < 1000) junkList.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, bc: bcCost });
          junkZeroed++;
          if (forceDry) return;
          const keyUrl = _cfPpKeyUrl(baseUrl, { itemNo: g.bcNo, vendorNo: g.vendorNo, currencyCode: '', startingDate, variantCode: '', uom: scopedSameDay.Unit_of_Measure_Code || '', minQty: 0 });
          const pr = await _cfPatchFreshEtag(keyUrl, { Direct_Unit_Cost: 0 }, bcHeaders);
          if (!pr.ok) { failed++; failures.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, projects: g.projects ? [...g.projects] : [], error: `junk-zero PATCH ${pr.status}` }); return; }
          rollback.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, old: bcCost, new: 0, src: 'bc-junk', act: 'junk-zero' });
        } else { keptBc++; } // BC has a real (or $0) price + no better ARC → leave it untouched
        return;
      }
      const arc = res.winner;
      if (scopedSameDay && Math.abs(arc - bcCost) <= TOL) { matched++; if (res.source && bySource[res.source] != null) bySource[res.source]++; return; } // already matches → skip
      if (res.source && bySource[res.source] != null) bySource[res.source]++; // recovery: which source filled this price
      if (samples.length < 60) samples.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, arc, bc: bcCost, src: res.source, act: scopedSameDay ? 'update' : 'create' });
      if (forceDry) { if (scopedSameDay) updated++; else created++; return; }
      // LIVE
      if (scopedSameDay) {
        const keyUrl = _cfPpKeyUrl(baseUrl, { itemNo: g.bcNo, vendorNo: g.vendorNo, currencyCode: '', startingDate, variantCode: '', uom: scopedSameDay.Unit_of_Measure_Code || '', minQty: 0 });
        const pr = await _cfPatchFreshEtag(keyUrl, { Direct_Unit_Cost: arc }, bcHeaders);
        if (!pr.ok) { failed++; failures.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, projects: g.projects ? [...g.projects] : [], error: `PATCH ${pr.status}` }); return; }
        updated++;
        rollback.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, old: bcCost, new: arc, src: res.source, act: 'update' }); // B1 rollback map
      } else {
        // Priced in ARC but no 2026-01-01 BC record (item+vendor not in the Step-1 Excel load) → POST it.
        const payload = { Item_No: g.bcNo, Vendor_No: g.vendorNo, Starting_Date: startingDate, Direct_Unit_Cost: arc, Unit_of_Measure_Code: 'EA' };
        const cr = await fetch(baseUrl, { method: 'POST', headers: postHeaders, body: JSON.stringify(payload) });
        if (!cr.ok) { const t = await cr.text().catch(() => ''); failed++; failures.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, projects: g.projects ? [...g.projects] : [], error: `POST ${cr.status} ${t.slice(0, 100)}` }); return; }
        created++;
        rollback.push({ bcNo: g.bcNo, vendorNo: g.vendorNo, old: null, new: arc, src: res.source, act: 'create' }); // B1 rollback map (no prior BC record)
        for (const r of existing) { // retire any $0 placeholder (older, active)
          if (Number(r.Direct_Unit_Cost) !== 0) continue; const rsd = sdf(r);
          if (!rsd || rsd >= startingDate || !(_cfDateUnset(r.Ending_Date) || String(r.Ending_Date).slice(0, 10) >= startingDate)) continue;
          const ku = _cfPpKeyUrl(baseUrl, { itemNo: g.bcNo, vendorNo: g.vendorNo, currencyCode: r.Currency_Code || '', startingDate: rsd, variantCode: r.Variant_Code || '', uom: r.Unit_of_Measure_Code || '', minQty: Number(r.Minimum_Quantity) || 0 });
          const er = await _cfPatchFreshEtag(ku, { Ending_Date: expireDate }, bcHeaders);
          if (er.ok) { expired++; } else { expireFailed++; }
        }
      }
    }

    const CONC = 6; let idx = 0;
    const worker = async () => { while (idx < slice.length) { const my = idx++; try { await processGroup(slice[my]); } catch (e) { failed++; failures.push({ error: (e && e.message) || String(e) }); } } };
    await Promise.all(Array.from({ length: Math.min(CONC, slice.length || 1) }, worker));

    const nextOffset = (offset + limit < total) ? (offset + limit) : null;
    const result = { dryRun: forceDry, startingDate, tolerance: TOL, total, offset, limit, processed: slice.length, scanRows, skipZero, noVendor, noBcNo, rfqDocs, rfqStatusCounts, rfqQuotes, rfqResolved, rfqUnresolved, rfqInjected, matched, updated, created, expired, expireFailed, conflicts, lowSourceOnly, junkZeroed, junkNoBc, keptBc, bySource, failed, samples: samples.slice(0, 60), conflictList: conflictList.slice(0, 1000), junkList: junkList.slice(0, 300), failures: failures.slice(0, 50), nextOffset };
    if (!forceDry) {
      const ts = Date.now();
      // B1: `rollback` (uncapped, <= slice size) is the reversal map — old→new per live update/create/junk-zero.
      await db.doc(`companies/${companyId}/bcPpReconcileRuns/${ts}`).set({ ts, runAt: admin.firestore.FieldValue.serverTimestamp(), by: uid, startingDate, tolerance: TOL, offset, limit, matched, updated, created, expired, expireFailed, conflicts, lowSourceOnly, junkZeroed, junkNoBc, keptBc, bySource, failed, rollback, conflictList: conflictList.slice(0, 1000), junkList: junkList.slice(0, 1000), failures: failures.slice(0, 100) });
    }
    await statusRef.set({ status: 'done', dryRun: forceDry, startingDate, tolerance: TOL, offset, limit, total, finishedAt: Date.now(), by: uid, report: result }, { merge: true });
    return result;
  } catch (err) {
    await statusRef.set({ status: 'error', finishedAt: Date.now(), error: (err && err.message) || String(err) }, { merge: true }).catch(() => {});
    throw err;
  }
});

// ── TEAM MANAGEMENT ──

exports.inviteTeamMember = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { email, role, companyId } = data;
  if (!email || !role || !companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');

  // Verify caller is an admin of this company
  const callerMember = await admin.firestore().doc(`companies/${companyId}/members/${context.auth.uid}`).get();
  if (!callerMember.exists || callerMember.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can invite members');
  }

  const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  await admin.firestore().doc(`companies/${companyId}/pendingInvites/${token}`).set({
    email: email.toLowerCase().trim(),
    role,
    createdAt: Date.now(),
    createdBy: context.auth.uid,
  });
  return { token };
});

exports.acceptTeamInvite = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { token } = data;
  if (!token) throw new functions.https.HttpsError('invalid-argument', 'Missing token');

  // Find invite across all companies
  const companies = await admin.firestore().collection('companies').get();
  let found = null;
  for (const company of companies.docs) {
    const invite = await admin.firestore().doc(`companies/${company.id}/pendingInvites/${token}`).get();
    if (invite.exists) { found = { companyId: company.id, ...invite.data() }; break; }
  }
  if (!found) throw new functions.https.HttpsError('not-found', 'Invite not found or expired');
  if (found.email !== context.auth.token.email?.toLowerCase()) {
    throw new functions.https.HttpsError('permission-denied', 'This invite is for a different email address');
  }

  const batch = admin.firestore().batch();
  batch.set(admin.firestore().doc(`companies/${found.companyId}/members/${context.auth.uid}`), {
    email: context.auth.token.email,
    role: found.role,
    addedAt: Date.now(),
  });
  batch.set(admin.firestore().doc(`users/${context.auth.uid}/config/profile`), {
    companyId: found.companyId,
    role: found.role,
  }, { merge: true });
  batch.delete(admin.firestore().doc(`companies/${found.companyId}/pendingInvites/${token}`));
  await batch.commit();

  // DECISION(v1.19.491): Copy company API key to new member's user config so extraction works immediately.
  try {
    const compApi = await admin.firestore().doc(`companies/${found.companyId}/config/api`).get();
    if (compApi.exists && compApi.data()?.key) {
      await admin.firestore().doc(`users/${context.auth.uid}/config/api`).set({ key: compApi.data().key });
      console.log(`acceptTeamInvite: Copied company API key to user ${context.auth.uid}`);
    }
  } catch (e) { console.warn('acceptTeamInvite: API key copy failed:', e.message); }

  return { companyId: found.companyId, role: found.role };
});

exports.removeTeamMember = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { targetUid, companyId } = data;
  if (!targetUid || !companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing fields');

  const callerMember = await admin.firestore().doc(`companies/${companyId}/members/${context.auth.uid}`).get();
  if (!callerMember.exists || callerMember.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can remove members');
  }
  if (targetUid === context.auth.uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot remove yourself');
  }

  // #144: atomic cleanup — delete the member doc AND clear the orphaning companyId/role
  // from the target's profile in one batch (both commit or both roll back). Using
  // set({merge:true}) + FieldValue.delete() rather than update() so a missing profile doc
  // doesn't throw NOT_FOUND and roll back the member delete. Preserves firstName. This is
  // what prevents the orphaned-profile boot spin-trap (#143/#144).
  const batch = admin.firestore().batch();
  batch.delete(admin.firestore().doc(`companies/${companyId}/members/${targetUid}`));
  batch.set(admin.firestore().doc(`users/${targetUid}/config/profile`), {
    companyId: admin.firestore.FieldValue.delete(),
    role: admin.firestore.FieldValue.delete(),
  }, { merge: true });
  await batch.commit();
  return { success: true };
});

exports.updateMemberRole = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { targetUid, role, companyId } = data;
  if (!targetUid || !role || !companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing fields');

  const callerMember = await admin.firestore().doc(`companies/${companyId}/members/${context.auth.uid}`).get();
  if (!callerMember.exists || callerMember.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can change roles');
  }
  if (targetUid === context.auth.uid) {
    throw new functions.https.HttpsError('invalid-argument', 'Cannot change your own role');
  }

  await admin.firestore().doc(`companies/${companyId}/members/${targetUid}`).update({ role });
  return { success: true };
});

// DECISION(v1.19.899): Admin-invoked wipe of all team members' user-level
// Anthropic API key docs (users/{uid}/config/api). Forces every member to
// fall back to the company-level key on next loadApiKey, eliminating stale
// personal-key overrides like the one Noah had that was hitting an exhausted
// Anthropic billing account. Admin-only; the caller's own user-level doc is
// also wiped so they're consistent with the rest of the team.
exports.resetTeamApiKeys = functions.runWith({ maxInstances: 5 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { companyId } = data;
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'Missing companyId');

  // Verify caller is admin of the company
  const callerMember = await admin.firestore().doc(`companies/${companyId}/members/${context.auth.uid}`).get();
  if (!callerMember.exists || callerMember.data().role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can reset team API keys');
  }

  // List members and delete users/{uid}/config/api for each
  const membersSnap = await admin.firestore().collection(`companies/${companyId}/members`).get();
  let cleared = 0;
  let skipped = 0;
  const errors = [];
  for (const m of membersSnap.docs) {
    const memberUid = m.id;
    try {
      const apiRef = admin.firestore().doc(`users/${memberUid}/config/api`);
      const apiDoc = await apiRef.get();
      if (!apiDoc.exists) { skipped++; continue; }
      await apiRef.delete();
      cleared++;
    } catch (e) {
      errors.push({ uid: memberUid, error: e.message });
    }
  }
  return { success: true, cleared, skipped, totalMembers: membersSnap.size, errors };
});

// DECISION(v1.19.404): Added auth check — previously missing, allowing unauthenticated email sends.
exports.sendInviteEmail = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { to, inviteUrl, role } = data;
  if (!to || !inviteUrl) throw new functions.https.HttpsError('invalid-argument', 'Missing fields');
  if (!SENDGRID_KEY) throw new functions.https.HttpsError('failed-precondition', 'Email not configured');
  // G005 Phase 1: the test client passes isTest:true → skip the real invite email. Default false = prod-safe.
  if (data && data.isTest === true) { functions.logger.info('[TEST-ENV] sendInviteEmail suppressed', to); return { success: true, suppressed: true }; }

  await sgMail.send({
    to,
    from: 'sales@matrixpci.com',
    subject: 'You\'ve been invited to Matrix ARC',
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1e293b;margin-bottom:8px">You\'re invited to Matrix ARC</h2>
      <p style="color:#64748b;margin-bottom:24px">You\'ve been invited to join a team as <strong>${role}</strong>.</p>
      <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">Accept Invitation →</a>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">If you didn\'t expect this invitation, you can ignore this email.</p>
    </div>`,
  });
  return { success: true };
});

// ── SUPPLIER QUOTE SUBMITTED TRIGGER ──

exports.onSupplierQuoteSubmitted = functions.firestore
  .document('rfqUploads/{token}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status || after.status !== 'submitted') return null;
    // G005 Phase 1: test-env submissions are stamped isTest:true by the client at rfqUploads create.
    // Skip ALL side-effects (bell notif + push + Teams + email) so a test supplier-quote can't fire
    // real notifications. Prod: isTest is absent/false → normal. (Default-false = prod-safe.)
    if (after.isTest === true) { functions.logger.info('[TEST-ENV] onSupplierQuoteSubmitted skipped (isTest rfqUpload)', context.params.token); return null; }

    const uid = after.uid;
    const projectName = after.projectName || '';
    const vendorName = after.vendorName || 'Supplier';
    const rfqNum = after.rfqNum || '';
    const token = context.params.token;

    // Create notification
    const notifBody = `${vendorName} submitted a quote${projectName ? ` for "${projectName}"` : ''}${rfqNum ? ` (${rfqNum})` : ''}.`;
    try {
      await admin.firestore().collection(`users/${uid}/notifications`).add({
        type: 'supplier_quote',
        title: `New Quote from ${vendorName}`,
        body: notifBody,
        createdAt: Date.now(),
        read: false,
        projectId: after.projectId || '',
        rfqUploadId: token,
        rfqNum,
        vendorName,
        projectName,
      });
    } catch (notifErr) {
      functions.logger.error('onSupplierQuoteSubmitted: notification creation failed:', notifErr.message);
      notifyAdminPortalFailure(uid, 'notification_failed', {
        Stage: 'Bell notification creation',
        Error: notifErr.message,
        Vendor: vendorName,
        Project: projectName,
        RFQ: rfqNum,
      }).catch(() => {});
    }

    // Send push notification
    await sendPushToUser(uid, {
      title: `New Quote from ${vendorName}`,
      body: notifBody,
      data: {
        url: APP_URL,
        projectId: after.projectId || '',
        type: 'supplier_quote',
        tag: `quote_${token}`,
      },
    });

    await postToTeams({
      title: `New Supplier Quote — ${vendorName}`,
      body: notifBody,
      url: APP_URL,
      facts: [
        { name: 'Project', value: after.projectName || after.projectId || '' },
        { name: 'Vendor', value: vendorName },
        { name: 'RFQ', value: after.rfqNum || '' },
      ],
    });

    // Send emails if SendGrid configured
    if (!SENDGRID_KEY) return null;

    // 1) Notify ARC user — include supplier PDF attachment if available
    try {
      const userRecord = await admin.auth().getUser(uid);
      const userEmail = userRecord.email;
      if (userEmail) {
        const emailMsg = {
          to: userEmail,
          from: 'sales@matrixpci.com',
          subject: `New Supplier Quote: ${vendorName}${rfqNum ? ' — ' + rfqNum : projectName ? ' — ' + projectName : ''}`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#1e293b;margin-bottom:8px">New Supplier Quote Received</h2>
            <p style="color:#64748b;margin-bottom:16px"><strong>${vendorName}</strong> has submitted a quote${projectName ? ` for <strong>${projectName}</strong>` : ''}${rfqNum ? ` (RFQ: ${rfqNum})` : ''}.</p>
            ${after.storageUrl ? '<p style="color:#334155;margin-bottom:16px">📎 Supplier quote PDF is attached to this email.</p>' : ''}
            <a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">Open ARC to Review &#x2192;</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">Log in to ARC and click the notification bell 🔔 to review and approve the quote.</p>
          </div>`,
        };
        // DECISION(v1.19.498): Attach supplier's quote PDF if they uploaded one
        if (after.storageUrl) {
          try {
            const https = require('https');
            const pdfBuffer = await new Promise((resolve, reject) => {
              https.get(after.storageUrl, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
              }).on('error', reject);
            });
            const pdfFileName = after.fileName || `${vendorName.replace(/[^a-zA-Z0-9]/g, '_')}_Quote_${rfqNum || 'RFQ'}.pdf`;
            emailMsg.attachments = [{
              content: pdfBuffer.toString('base64'),
              filename: pdfFileName,
              type: 'application/pdf',
              disposition: 'attachment',
            }];
            console.log('Attached supplier PDF:', pdfFileName, pdfBuffer.length, 'bytes');
          } catch (pdfErr) {
            console.warn('Failed to attach supplier PDF:', pdfErr.message);
          }
        }
        await sgMail.send(emailMsg);
      }
    } catch (e) {
      console.warn('ARC user notification email failed:', e.message);
      notifyAdminPortalFailure(uid, 'email_failed', {
        Stage: 'ARC user notification email',
        Error: e.message,
        Vendor: vendorName,
        Project: projectName,
        RFQ: rfqNum,
      }).catch(() => {});
    }

    // 2) Send confirmation to supplier
    const vendorEmail = after.vendorEmail || '';
    const companyName = after.companyName || 'Matrix Systems';
    if (vendorEmail) {
      try {
        await sgMail.send({
          to: vendorEmail,
          from: 'sales@matrixpci.com',
          subject: `Quote Received — ${companyName}${rfqNum ? ' (' + rfqNum + ')' : ''}`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#1e293b;margin-bottom:8px">Quote Received</h2>
            <p style="color:#334155;margin-bottom:16px;line-height:1.7">Thank you for using the ${companyName} Quote Upload tool. Your submission${rfqNum ? ' for <strong>' + rfqNum + '</strong>' : ''} has been received.</p>
            <p style="color:#334155;margin-bottom:16px;line-height:1.7">You will be notified if we have any questions regarding your Quote.</p>
            <p style="color:#334155;margin-bottom:4px;line-height:1.7">Thank you,</p>
            <p style="color:#1e293b;font-weight:700;margin-bottom:0">${companyName} Sales Team</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px"/>
            <p style="color:#94a3b8;font-size:11px;margin:0">This is an automated confirmation. Please do not reply to this email.</p>
          </div>`,
        });
      } catch (e) {
        console.warn('Supplier confirmation email failed:', e.message);
      }
    }

    return null;
  });

// ── B064: BC STRUCTURAL-FAULT COMPANY-WIDE AGGREGATOR ──
// The client (B064, prod v1.24.41) writes ONE debugLog per broken BC endpoint per SESSION
// (severity:"error", source:"bcStructuralFault"). A single user's in-session chip cannot
// catch a company-wide, multi-week silent breakage (the Ryan 404 incident) — so this
// server-side aggregator fires ONE admin alert (Teams + push) when the SAME endpoint stays
// broken across the company past a threshold in 24h. It is HARD-deduped to one alert per
// company+endpoint per cooldown window via a marker doc, because the parent trigger fires on
// EVERY debugLog create.
const BC_FAULT_ALERT_THRESHOLD = 5;                     // fire when distinct-users OR total fault entries in the window reach this
const BC_FAULT_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;   // 24h look-back for counting faults
const BC_FAULT_ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // at most one alert per company+endpoint per 24h

async function _maybeAlertBcStructuralFault(companyId, entry) {
  const extra = (entry && entry.extra) || {};
  // Guardrail 1: never alert on test-env faults (matrix-arc-test).
  if (extra.isTestEnv === true) return;
  const endpoint = String(extra.endpoint || extra.urlPattern || '').trim();
  if (!endpoint) return; // Guardrail 2: nothing to key/dedupe on.

  // Company lookup + test-company guard (a test company must not alert real admins).
  let companyName = String(extra.companyName || 'MatrixARC');
  try {
    const cDoc = await db.doc(`companies/${companyId}`).get();
    if (cDoc.exists) {
      const cd = cDoc.data() || {};
      if (cd.isTestCompany === true) { functions.logger.info('[bcFaultAggregator] skip (test company)', companyId); return; }
      if (cd.name) companyName = cd.name;
    }
  } catch (e) { /* proceed with fallback name */ }

  const now = Date.now();
  const windowStart = now - BC_FAULT_ALERT_WINDOW_MS;

  // Count recent faults for THIS endpoint across the company. Query the single, already
  // auto-indexed createdAt field (no composite index needed — same pattern as DebugLogsModal),
  // then filter source + endpoint in memory. .limit() bounds the read.
  let total = 0;
  const users = new Set();
  let firstAt = extra.firstAt || new Date(now).toISOString();
  let lastAt = extra.lastAt || new Date(now).toISOString();
  try {
    const snap = await db.collection(`companies/${companyId}/debugLogs`)
      .where('createdAt', '>=', windowStart)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();
    snap.forEach(d => {
      const x = d.data() || {};
      if (x.source !== 'bcStructuralFault') return;
      const xe = x.extra || {};
      if (xe.isTestEnv === true) return; // don't let test-env entries inflate the count
      const ep = String(xe.endpoint || xe.urlPattern || '').trim();
      if (ep !== endpoint) return;
      total++;
      users.add(x.createdBy || x.userEmail || d.id);
      if (xe.firstAt && String(xe.firstAt) < String(firstAt)) firstAt = xe.firstAt;
      if (xe.lastAt && String(xe.lastAt) > String(lastAt)) lastAt = xe.lastAt;
    });
  } catch (e) {
    functions.logger.warn('[bcFaultAggregator] fault query failed:', e.message);
    return;
  }

  const distinctUsers = users.size;
  // Threshold: distinct-users OR total entries. The client dedupes to one entry per
  // endpoint per session, so distinctUsers ≈ affected users; total also catches a single
  // user hitting it across many sessions.
  if (distinctUsers < BC_FAULT_ALERT_THRESHOLD && total < BC_FAULT_ALERT_THRESHOLD) return;

  // Hard dedupe: at most one alert per company+endpoint per cooldown window. Transaction on a
  // single marker doc (map keyed by a sanitized endpoint key) so concurrent fault writes from
  // different users can't both fire. Fail closed on transaction error (never risk a storm).
  const endpointKey = (endpoint.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)) || 'endpoint';
  const markerRef = db.doc(`companies/${companyId}/config/bcFaultAlerts`);
  let shouldAlert = false;
  try {
    await db.runTransaction(async tx => {
      const mSnap = await tx.get(markerRef);
      const data = mSnap.exists ? (mSnap.data() || {}) : {};
      const endpoints = data.endpoints || {};
      const prev = endpoints[endpointKey];
      if (prev && prev.lastAlertedAt && (now - prev.lastAlertedAt) < BC_FAULT_ALERT_COOLDOWN_MS) {
        shouldAlert = false; // still in cooldown — suppress
        return;
      }
      endpoints[endpointKey] = { lastAlertedAt: now, endpoint, env: extra.env || '', faultCount: total, distinctUsers };
      tx.set(markerRef, { endpoints }, { merge: true });
      shouldAlert = true;
    });
  } catch (e) {
    functions.logger.warn('[bcFaultAggregator] dedupe transaction failed:', e.message);
    return; // fail closed
  }
  if (!shouldAlert) return;

  // Admin uids for push (same lookup as onIssueReported).
  let adminUids = [];
  try {
    const membersSnap = await db.collection(`companies/${companyId}/members`).get();
    adminUids = membersSnap.docs.filter(d => d.data().role === 'admin').map(d => d.id);
  } catch (e) { /* ignore — Teams still posts */ }

  const env = extra.env || 'unknown';
  const alertBody = `⚠ BC endpoint '${endpoint}' has failed ${total} time(s) across ${distinctUsers} user(s) in the last 24h (env ${env}) — ARC↔BC sync for this endpoint is silently failing. Investigate the BC web service / task mapping.`;

  // 1) Teams webhook (once).
  await postToTeams({
    title: `⚠ BC Sync Degraded — ${companyName}`,
    body: alertBody,
    url: APP_URL,
    facts: [
      { name: 'Endpoint', value: endpoint },
      { name: 'Environment', value: env },
      { name: 'Fault count (24h)', value: String(total) },
      { name: 'Distinct users', value: String(distinctUsers) },
      { name: 'First seen', value: String(firstAt) },
      { name: 'Last seen', value: String(lastAt) },
    ],
  });

  // 2) Push to each admin.
  const notifTitle = '⚠ BC Sync Degraded';
  const notifBody = `Endpoint '${endpoint}' failing across ${distinctUsers} user(s) — BC sync silently broken.`;
  for (const adminUid of adminUids) {
    await sendPushToUser(adminUid, {
      title: notifTitle,
      body: notifBody,
      data: { url: APP_URL + '?openDebugLogs=1', type: 'bc_structural_fault', tag: `bcfault_${endpointKey}` },
    });
  }
  functions.logger.info(`[bcFaultAggregator] alert fired — company ${companyId}, endpoint '${endpoint}' (${total} faults, ${distinctUsers} users, env ${env})`);
}

// ── USER-REPORTED ISSUE NOTIFICATIONS ──
// DECISION(v1.19.594): When a user clicks "Report Issue", notify all admins of the
// company via in-app bell, push, email, and Teams. Only fires for severity='user_reported'
// so we don't spam for auto-captured console errors (those are visible in-app only).

exports.onIssueReported = functions.firestore
  .document('companies/{companyId}/debugLogs/{logId}')
  .onCreate(async (snap, context) => {
    const entry = snap.data() || {};

    // B064: BC structural-fault aggregator runs BEFORE the user_reported gate below
    // (these entries are severity:"error", not "user_reported"). Fire a company-wide admin
    // alert when an endpoint stays broken past threshold, then stop — the rest of this
    // trigger (issue-report email/bell) does not apply to auto-captured BC faults.
    if (entry.source === 'bcStructuralFault') {
      try { await _maybeAlertBcStructuralFault(context.params.companyId, entry); }
      catch (e) { functions.logger.warn('[bcFaultAggregator] error:', e.message); }
      return null;
    }

    if (entry.severity !== 'user_reported') return null;

    const companyId = context.params.companyId;
    const logId = context.params.logId;
    // G005 Phase 1: skip issue notifications for the dedicated TEST company (companies/{cid}.isTestCompany:true)
    // — a test user filing an issue must not email/Teams/push real admins. Prod companies lack the flag → normal.
    try { const _tc = await db.doc(`companies/${companyId}`).get(); if (_tc.exists && _tc.data().isTestCompany === true) { functions.logger.info('[TEST-ENV] onIssueReported skipped (test company)', companyId); return null; } } catch (e) { /* company read failed → proceed normally */ }
    const reporterEmail = entry.userEmail || '';
    const reporterName = entry.userName || reporterEmail.split('@')[0] || 'A user';
    const description = (entry.description || entry.message || '').toString();
    const shortDesc = description.length > 160 ? description.slice(0, 157) + '…' : description;
    const appVersion = entry.appVersion || '';
    const url = entry.url || APP_URL;

    // Look up company name + admin members
    let companyName = 'MatrixARC';
    try {
      const companyDoc = await db.doc(`companies/${companyId}`).get();
      if (companyDoc.exists) companyName = companyDoc.data().name || companyName;
    } catch (e) { /* ignore */ }

    const membersSnap = await db.collection(`companies/${companyId}/members`).get();
    const adminUids = membersSnap.docs
      .filter(d => d.data().role === 'admin')
      .map(d => d.id);

    if (adminUids.length === 0) {
      console.log('No admins found for company', companyId, '- skipping issue notification');
      return null;
    }

    const notifTitle = `Issue Reported by ${reporterName}`;
    const notifBody = shortDesc;

    // 1) In-app bell notification + push per admin
    for (const adminUid of adminUids) {
      try {
        await db.collection(`users/${adminUid}/notifications`).add({
          type: 'issue_report',
          title: notifTitle,
          body: notifBody,
          createdAt: Date.now(),
          read: false,
          debugLogId: logId,
          reporterEmail,
          reporterName,
          companyId,
          appVersion,
        });
      } catch (e) {
        console.warn(`Notification write failed for ${adminUid}:`, e.message);
      }
      await sendPushToUser(adminUid, {
        title: notifTitle,
        body: notifBody,
        data: {
          url: APP_URL + '?openDebugLogs=1',
          type: 'issue_report',
          debugLogId: logId,
          tag: `issue_${logId}`,
        },
      });
    }

    // 2) Teams webhook (once)
    await postToTeams({
      title: `🐛 Issue Reported — ${companyName}`,
      body: shortDesc,
      url: APP_URL,
      facts: [
        { name: 'Reporter', value: `${reporterName} (${reporterEmail})` },
        { name: 'App Version', value: appVersion },
        { name: 'Page', value: url },
      ],
    });

    // 3) Email each admin via SendGrid
    if (!SENDGRID_KEY) {
      console.log('SENDGRID_KEY not set - skipping issue report email');
      return null;
    }

    const breadcrumbs = Array.isArray(entry.breadcrumbs) ? entry.breadcrumbs.slice(-15) : [];
    const breadcrumbsHtml = breadcrumbs.length
      ? `<div style="margin-top:16px;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
          <div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Recent Activity</div>
          <pre style="margin:0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;color:#334155;line-height:1.5;white-space:pre-wrap;word-break:break-word">${breadcrumbs.map(b => {
            const ts = new Date(b.t || Date.now()).toLocaleTimeString();
            const msg = (b.message || '').toString().slice(0, 180).replace(/</g, '&lt;');
            return `${ts}  [${b.type || '?'}] ${msg}`;
          }).join('\n')}</pre>
        </div>`
      : '';

    const emailHtml = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1e293b">
      <h2 style="color:#1e293b;margin:0 0 8px 0;font-size:20px">🐛 Issue Report</h2>
      <p style="color:#64748b;margin:0 0 20px 0;font-size:13px"><strong>${reporterName}</strong> (${reporterEmail}) reported an issue in ${companyName}.</p>
      <div style="background:#fef9c3;border-left:4px solid #eab308;padding:14px 18px;border-radius:4px;margin-bottom:16px">
        <div style="font-size:11px;color:#854d0e;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Description</div>
        <div style="font-size:14px;color:#422006;line-height:1.55;white-space:pre-wrap">${(description || '(no description)').replace(/</g, '&lt;')}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;font-size:12px">
        <tr><td style="padding:4px 0;color:#64748b;width:110px">Page URL:</td><td style="padding:4px 0;color:#1e293b;word-break:break-all">${url.replace(/</g, '&lt;')}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">App Version:</td><td style="padding:4px 0;color:#1e293b">${appVersion || '(unknown)'}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b">Project / Panel:</td><td style="padding:4px 0;color:#1e293b">${entry.projectId || '—'}${entry.panelId ? ' / ' + entry.panelId : ''}</td></tr>
      </table>
      ${breadcrumbsHtml}
      <div style="margin-top:24px">
        <a href="${APP_URL}?openDebugLogs=1" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;font-size:14px;padding:11px 24px;border-radius:8px;text-decoration:none">Open Debug Logs in ARC &rarr;</a>
      </div>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px">You are receiving this because you are an admin of ${companyName} in MatrixARC.</p>
    </div>`;

    for (const adminUid of adminUids) {
      try {
        const adminRecord = await admin.auth().getUser(adminUid);
        const adminEmail = adminRecord.email;
        if (!adminEmail) continue;
        await sgMail.send({
          to: adminEmail,
          from: 'sales@matrixpci.com',
          subject: `🐛 ARC Issue: ${shortDesc.slice(0, 90) || 'User-reported issue'}`,
          html: emailHtml,
        });
      } catch (e) {
        console.warn(`Issue report email failed for admin ${adminUid}:`, e.message);
      }
    }

    return null;
  });

// ── ENGINEERING QUESTIONS EMAIL ──

exports.sendEngineerQuestionEmail = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  if (!SENDGRID_KEY) throw new functions.https.HttpsError('failed-precondition', 'Email not configured');
  const { to, projectName, bcProjectNumber, panelName, questions, recipientUid } = data;
  if (!to || !questions?.length) throw new functions.https.HttpsError('invalid-argument', 'Missing recipient or questions');
  // G005 Phase 1: the test client passes isTest:true → skip the engineer-question email + Teams post + push. Default false = prod-safe.
  if (data && data.isTest === true) { functions.logger.info('[TEST-ENV] sendEngineerQuestionEmail suppressed', to); return { success: true, suppressed: true }; }

  const senderRecord = await admin.auth().getUser(context.auth.uid);
  const senderEmail = senderRecord.email || 'ARC System';
  const senderName = senderRecord.displayName || senderEmail.split('@')[0];

  const questionsHtml = questions.map((q, i) => `
    <tr style="border-bottom:1px solid #e2e8f0">
      <td style="padding:8px 12px;font-size:13px;color:#1e293b;vertical-align:top">${i + 1}.</td>
      <td style="padding:8px 12px">
        <div style="font-size:13px;color:#1e293b;line-height:1.5">${q.question}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">${q.severity?.toUpperCase() || 'INFO'} — ${q.category || 'General'}${q.rowRef ? ' — ' + q.rowRef : ''}</div>
      </td>
    </tr>
  `).join('');

  await sgMail.send({
    to,
    from: 'sales@matrixpci.com',
    replyTo: senderEmail,
    subject: `Engineering Questions — ${projectName || bcProjectNumber || panelName || 'ARC Project'}`,
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1e293b;margin-bottom:4px">Engineering Questions</h2>
      <p style="color:#64748b;margin-bottom:16px;font-size:14px">
        <strong>${senderName}</strong> has requested your review on <strong>${projectName || 'a project'}</strong>${bcProjectNumber ? ' (' + bcProjectNumber + ')' : ''}${panelName ? ' — ' + panelName : ''}.
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:20px">
        <thead><tr style="background:#f8fafc"><th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600">#</th><th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748b;font-weight:600">Question</th></tr></thead>
        <tbody>${questionsHtml}</tbody>
      </table>
      <a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">Open ARC to Answer &#x2192;</a>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Log in to ARC, open the project, and click the question button next to the panel status badge to answer.</p>
    </div>`,
  });

  // Send push notification to recipient if uid provided
  if (recipientUid) {
    await sendPushToUser(recipientUid, {
      title: `Engineering Questions from ${senderName}`,
      body: `${questions.length} question(s) on ${projectName || bcProjectNumber || panelName || 'a project'}`,
      data: {
        url: APP_URL,
        type: 'engineer_question',
        tag: `eng_q_${Date.now()}`,
      },
    });
  }

  await postToTeams({
    title: `Engineering Questions — ${projectName || bcProjectNumber || 'Project'}`,
    body: `${senderName} sent ${questions.length} question(s) for ${panelName || 'a panel'}`,
    url: APP_URL,
    facts: [
      { name: 'Project', value: projectName || bcProjectNumber || '' },
      { name: 'Panel', value: panelName || '' },
      { name: 'Questions', value: String(questions.length) },
    ],
  });

  return { success: true };
});

// ── SUPPLIER QUOTE AI EXTRACTION ──

// DECISION(v1.19.955, cost-attack hardening): Hard caps on the public supplier-portal
// callable. Without these, a leaked supplier-portal token plus a synthetic 500-page
// PDF could burn ~$13 of Sonnet spend per upload. Scripted at one upload per 30 seconds
// for an hour, that's ~$1,560 in damage on a single ARC user's Anthropic key.
// Caps are conservative — legitimate supplier quotes are typically 1-15 pages and
// never approach 25.
const SUPPLIER_PORTAL_MAX_PAGES = 25;             // Hard cap on pages per call
const SUPPLIER_PORTAL_MAX_IMAGE_CHARS = 6_900_000; // ~5 MB raw / base64 chars
const SUPPLIER_PORTAL_MAX_CALLS = 10;             // Lifetime per-token cap
const SUPPLIER_PORTAL_MAX_SPEND_CENTS = 500;      // $5 lifetime per-token spend cap

exports.extractSupplierQuotePricing = functions
  .runWith({ timeoutSeconds: 120, memory: '512MB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
  const { token, pageImages } = data;
  if (!token || !Array.isArray(pageImages) || !pageImages.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing token or images');
  }
  // B080: retry/backoff budget — 120s function timeout minus a 10s margin.
  const deadlineMs = Date.now() + 110000;

  // DECISION(v1.19.955): Page-count cap. Legitimate quotes are 1-15 pages.
  if (pageImages.length > SUPPLIER_PORTAL_MAX_PAGES) {
    functions.logger.warn(
      'extractSupplierQuotePricing rejected: page count exceeds cap',
      { token, pageCount: pageImages.length, cap: SUPPLIER_PORTAL_MAX_PAGES }
    );
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Too many pages: ${pageImages.length}. Maximum ${SUPPLIER_PORTAL_MAX_PAGES} pages per call.`
    );
  }

  // DECISION(v1.19.955): Per-image size cap. Stops base64 inflation attacks.
  for (let i = 0; i < pageImages.length; i++) {
    if (typeof pageImages[i] !== 'string') {
      throw new functions.https.HttpsError('invalid-argument', `Page ${i + 1} is not a string`);
    }
    if (pageImages[i].length > SUPPLIER_PORTAL_MAX_IMAGE_CHARS) {
      functions.logger.warn(
        'extractSupplierQuotePricing rejected: image exceeds size cap',
        { token, pageIndex: i, sizeChars: pageImages[i].length }
      );
      throw new functions.https.HttpsError(
        'invalid-argument',
        `Page ${i + 1} exceeds size limit (~5 MB max per image).`
      );
    }
  }

  // Validate token
  const tokenRef = admin.firestore().collection('rfqUploads').doc(token);
  const tokenDoc = await tokenRef.get();
  if (!tokenDoc.exists) throw new functions.https.HttpsError('not-found', 'Invalid token');
  const tokenData = tokenDoc.data();
  if ((tokenData.expiresAt || 0) < Date.now()) throw new functions.https.HttpsError('failed-precondition', 'Token expired');

  // DECISION(v1.19.955): Refuse calls on already-finalized tokens. Once a supplier
  // submits a quote (status=submitted) or the user dismisses it (status=dismissed),
  // there is no legitimate reason to keep extracting from that token.
  if (tokenData.status === 'submitted' || tokenData.status === 'dismissed') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Token is ${tokenData.status} — no further AI extraction allowed.`
    );
  }

  // DECISION(v1.19.955): Per-token call counter. A single supplier quote requires
  // 1-3 batches of extraction. Cap of 10 lifetime allows for re-extracts and
  // multi-batch PDFs while bounding abuse.
  const currentCallCount = tokenData.aiCallCount || 0;
  if (currentCallCount >= SUPPLIER_PORTAL_MAX_CALLS) {
    functions.logger.warn(
      'extractSupplierQuotePricing rejected: per-token call cap reached',
      { token, currentCallCount, cap: SUPPLIER_PORTAL_MAX_CALLS }
    );
    notifyAdminPortalFailure(tokenData.uid, 'cost_cap_reached', {
      Cap: 'Call count',
      Calls: `${currentCallCount} / ${SUPPLIER_PORTAL_MAX_CALLS}`,
      Token: token,
      Vendor: tokenData.vendorName || '',
      Project: tokenData.projectName || '',
    }).catch(() => {});
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'This token has reached its call limit. Contact ARC if you need to re-extract.'
    );
  }

  // DECISION(v1.19.955): Per-token spend ledger. Tracks accumulated Anthropic spend
  // (in cents) attributable to this token; blocks new calls once the cap is hit.
  // The cap is much higher than a legitimate single supplier quote ever needs.
  const currentSpendCents = tokenData.aiSpendCents || 0;
  if (currentSpendCents >= SUPPLIER_PORTAL_MAX_SPEND_CENTS) {
    functions.logger.warn(
      'extractSupplierQuotePricing rejected: per-token spend cap reached',
      { token, currentSpendCents, cap: SUPPLIER_PORTAL_MAX_SPEND_CENTS }
    );
    notifyAdminPortalFailure(tokenData.uid, 'cost_cap_reached', {
      Cap: 'Spend',
      Spend: `$${(currentSpendCents / 100).toFixed(2)} / $${(SUPPLIER_PORTAL_MAX_SPEND_CENTS / 100).toFixed(2)}`,
      Token: token,
      Vendor: tokenData.vendorName || '',
      Project: tokenData.projectName || '',
    }).catch(() => {});
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'This token has reached its spend limit.'
    );
  }

  const uid = tokenData.uid;
  const lineItems = tokenData.lineItems || [];

  // Get user's Anthropic API key
  const apiDoc = await admin.firestore().doc(`users/${uid}/config/api`).get();
  if (!apiDoc.exists || !apiDoc.data().key) {
    throw new functions.https.HttpsError('failed-precondition', 'No Anthropic API key configured in ARC settings');
  }
  const apiKey = apiDoc.data().key;

  const itemList = lineItems.map((item, i) =>
    `${i + 1}. Part#: ${item.partNumber || '—'}, Description: ${item.description || '—'}, Qty: ${item.qty || 1}`
  ).join('\n');

  // DECISION(v1.19.963, cost report A4): Split the supplier extraction prompt into a
  // STATIC system block (OCR rules, matching rules, distributor-specific lead time
  // patterns, return format spec — ~3 KB stable text) and a per-call user block
  // (line item list, page image data). The static portion is cacheable across batches
  // of the same supplier upload (multi-batch PDFs hit cache after the first batch)
  // and across multiple supplier uploads within 5 min on the same Anthropic key.
  // Cache hit rate is high because: (1) batches of one supplier upload reuse the
  // exact same prompt, (2) different supplier uploads within 5 min reuse the static
  // portion. Cost: cached read = ~10% of normal input cost; cache write = 1.25x
  // (one-time penalty per fresh cache entry).
  const STATIC_PROMPT = `CRITICAL OCR RULES — READ CAREFULLY:
- Read each character on the PDF very carefully. Common OCR mistakes: K↔R, B↔R, S↔5, 0↔O, I↔1, U↔V. Double-check every character against the PDF.
- "supplierPartNumber" = the part# EXACTLY as printed on the supplier's PDF. Copy character by character. Do NOT guess or autocorrect.
- If the supplier quoted an ALTERNATE or SUBSTITUTE part (different part number than requested), capture it in "supplierPartNumber" and set confidence to "alternate".

MATCHING RULES:
- Ignore spaces, dashes, case: "ARL 449" = "ARL449"
- Strip manufacturer prefixes: "HOFF CEL550M" → "CEL550M", "PHXCT 2891035" → "2891035", "ABB 1SVR405..." → "1SVR405..."
- Substring match: requested part# inside supplier part# = match
- Match by description if part numbers differ but item is clearly the same
- "partNumber" = ALWAYS use the exact part# from the requested list (never the supplier's version)
- "supplierPartNumber" = part# exactly as printed on supplier's quote (may differ from requested)
- "supplierLineNumber" = line/item number from the supplier's quote document
- Confidence: "high" = exact match, "medium" = fuzzy/prefix match, "alternate" = supplier quoted a different part as substitute, "low" = uncertain, "unmatched" = supplier item not matching any request

NOTES — VERY IMPORTANT:
- "notes" = capture ANY notes, comments, remarks, conditions, or annotations the supplier wrote for each line item. This includes: lead time notes, minimum order quantities, special conditions, "call for pricing", "alternate suggested", obsolete warnings, etc.
- Also capture any general notes at the top or bottom of the quote in the header "notes" field.

DISTRIBUTOR-SPECIFIC LEAD TIME PATTERNS (apply when matched, treat conservatively):
- **Codale** (look for "CODALE" in supplier name OR Codale-style line markers): the Description column has lead-time annotations BELOW the part description, separated by "===" rows. Patterns:
   • "## IN SLC" (e.g. "24 IN SLC", "5 IN SLC", "1 IN SLC") → in stock locally → leadTimeDays = 1
   • "FACTORY STOCK" → leadTimeDays = 14 (typical factory ship)
   • "MM/DD/YY ESD" (e.g. "05/12/26 ESD") → Estimated Ship Date. Compute: (ESD − quoteDate in days) + 10 shipping days = leadTimeDays. If quoteDate missing, default to (ESD − today) + 10. Clamp ≥ 1.
   • If MULTIPLE patterns appear on the same line (rare), prefer the slowest one (most conservative).
- For Codale items, also IGNORE these markers (not lead times): "N/S Item: Mfg Return Policy Applies", "**MUST ORDER QTY ##**", separator rows like "==========".

CODALE PART NUMBER EXTRACTION:
- Codale's Description column starts with "MFR PARTNUMBER" (e.g. "A-B 800FP-F2 BLACK 22MM PB MOM"). The token after the manufacturer (A-B, SQD, ABB, etc.) is the part number. The 12-digit UPC column is NOT the part number.
- Use this part number to match against the requested list (with normal fuzzy/prefix-strip rules).

CODALE STOCK SNAPSHOT — when "## IN SLC" pattern is matched, capture the qty into "supplierStockQty" (e.g. "24 IN SLC" → supplierStockQty=24, supplierStockSource="Codale SLC"). Leave both null for FACTORY STOCK / ESD / non-Codale items.

Return ONLY JSON:
{"header":{"supplierName":null,"quoteNumber":null,"revisionNumber":null,"quoteDate":null,"updatedOn":null,"expiresOn":null,"jobName":null,"contactName":null,"customerPO":null,"customerPODate":null,"fob":null,"freight":null,"notes":null},"lineItems":[{"partNumber":"...","supplierPartNumber":"...","supplierLineNumber":"1","unitPrice":0.00,"leadTimeDays":null,"supplierStockQty":null,"supplierStockSource":null,"confidence":"high","notes":""}]}

Set unitPrice to null if not found. Convert lead time weeks to days (*7), months to days (*30). Look for "ARO", "days ARO", "weeks", "delivery", AND the distributor-specific patterns above. Set header fields to null if not found. Dates as YYYY-MM-DD.

You MUST return one entry per requested item. Also include extra supplier items not matching any request (partNumber=null, confidence="unmatched").`;

  const messageContent = [
    ...pageImages.slice(0, 20).map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: img }
    })),
    {
      type: 'text',
      text: `Extract pricing from this supplier quote. ${lineItems.length} items were requested:\n\n${itemList}`
    }
  ];

  // DECISION(v1.20.1): Model fallback chain. If the primary model returns 404
  // (deprecated/retired), automatically try the next model in the chain instead
  // of breaking the portal. Sends admin email on first fallback trigger so the
  // registry can be updated proactively. Belt-and-suspenders with the daily
  // monitorAnthropicModels probe.
  const SUPPLIER_PORTAL_FALLBACK_CHAIN = [
    ANTHROPIC_MODELS.SONNET,  // Primary — cost-effective for quote extraction
    ANTHROPIC_MODELS.OPUS,    // Fallback — more expensive but reliable
  ];
  let response = null;
  let modelUsed = SUPPLIER_PORTAL_FALLBACK_CHAIN[0];
  for (let fi = 0; fi < SUPPLIER_PORTAL_FALLBACK_CHAIN.length; fi++) {
    const tryModel = SUPPLIER_PORTAL_FALLBACK_CHAIN[fi];
    // B080: retry 429/5xx/network within this model attempt (deadline-aware).
    // The 404 model-fallback loop below is preserved unchanged — 404 is
    // non-retryable, so the wrapper returns it and the fallback still fires.
    try {
      response = await anthropicFetchWithRetry({
        model: tryModel,
        max_tokens: 64000,
        system: [{ type: 'text', text: STATIC_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: messageContent }],
      }, apiKey, { deadlineMs, label: `extractSupplierQuotePricing ${tryModel}` });
    } catch (fetchErr) {
      const isTimeout = fetchErr.name === 'AbortError' || fetchErr.cause?.code === 'UND_ERR_HEADERS_TIMEOUT';
      functions.logger.error('extractSupplierQuotePricing API error', { model: tryModel, error: fetchErr.message, isTimeout });
      throw new functions.https.HttpsError('deadline-exceeded', `Anthropic API ${isTimeout ? 'timed out' : 'network error'}: ${fetchErr.message}`);
    }
    if (response.ok) {
      modelUsed = tryModel;
      if (fi > 0) {
        functions.logger.warn(`extractSupplierQuotePricing: primary model ${SUPPLIER_PORTAL_FALLBACK_CHAIN[0]} returned 404, fell back to ${tryModel}`);
        // Fire-and-forget admin alert so registry gets updated
        notifyAdminModelFallback('extractSupplierQuotePricing', SUPPLIER_PORTAL_FALLBACK_CHAIN[0], tryModel, uid).catch(() => {});
      }
      break;
    }
    if (response.status === 404 && fi < SUPPLIER_PORTAL_FALLBACK_CHAIN.length - 1) {
      functions.logger.warn(`extractSupplierQuotePricing: model ${tryModel} returned 404, trying next fallback…`);
      // B080-F2: drain the unconsumed 404 body to free the socket before the next attempt
      // (mirrors the retry-path drain in anthropicFetchWithRetry).
      try { await response.text(); } catch (_) {}
      continue;
    }
    // Non-404 error or last fallback exhausted — throw
    notifyAdminPortalFailure(uid, 'ai_extraction_error', {
      Function: 'extractSupplierQuotePricing',
      'HTTP status': response.status,
      'Model tried': tryModel,
      Token: token,
      Vendor: tokenData.vendorName || '',
      Project: tokenData.projectName || '',
    }).catch(() => {});
    throw new functions.https.HttpsError('internal', `AI API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || '{}';
  // DECISION(v1.19.664): Log only length — no content preview. Previously the first 300 chars
  // of the AI response were logged to Cloud Logging on every call, which leaks the parsed
  // supplier part numbers / pricing data into log infrastructure. Length alone is enough to
  // detect truncation issues without exposing the content.
  functions.logger.info('extractSupplierQuotePricing AI response length:', text.length);

  warnAdminsTokenUsage(uid, 'extractSupplierQuotePricing', result.usage, 64000).catch(() => {});

  // DECISION(v1.19.955): Update per-token usage ledger after the Anthropic call so future
  // calls on this token can be capped against the running totals. Sonnet 4 pricing as of
  // early 2026: $3 / M input tokens, $15 / M output tokens. Costs are stored in CENTS to
  // avoid float precision drift. Failure to update the ledger does NOT fail the extraction
  // — extraction has already happened and the supplier should still get their result; we
  // just lose one ledger row, which is acceptable.
  const usage = (result && result.usage) || {};
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const callCents = Math.ceil(
    (inputTokens / 1_000_000) * 300 +    // 300 cents/M input
    (outputTokens / 1_000_000) * 1500    // 1500 cents/M output
  );
  try {
    await tokenRef.update({
      aiCallCount: admin.firestore.FieldValue.increment(1),
      aiSpendCents: admin.firestore.FieldValue.increment(callCents),
      aiLastCallAt: Date.now(),
    });
    functions.logger.info(
      `extractSupplierQuotePricing usage tracked: in=${inputTokens}, out=${outputTokens}, cents=${callCents}, cumulativeCents=${currentSpendCents + callCents}, cumulativeCalls=${currentCallCount + 1}`
    );
  } catch (e) {
    functions.logger.warn('Failed to update token usage ledger (non-fatal):', e.message);
  }

  let extracted = [];
  let quoteHeader = null;
  let summary = null;
  try {
    const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    // Try parsing as object with header+lineItems first, fall back to array
    const objMatch = stripped.match(/\{[\s\S]*\}/);
    const arrMatch = stripped.match(/\[[\s\S]*\]/);
    if (objMatch) {
      const parsed = JSON.parse(objMatch[0]);
      if (parsed.lineItems && Array.isArray(parsed.lineItems)) {
        extracted = parsed.lineItems;
        quoteHeader = parsed.header || null;
        summary = parsed.summary || null;
      } else if (Array.isArray(parsed)) {
        extracted = parsed;
      }
    } else if (arrMatch) {
      extracted = JSON.parse(arrMatch[0]);
    }
    if (!Array.isArray(extracted)) extracted = [];
  } catch (e) {
    // DECISION(v1.19.664): On parse failure, log first 120 chars only (usually enough to see
    // "missing brace" or "unexpected token X" context without leaking the whole response).
    functions.logger.warn('extractSupplierQuotePricing JSON parse failed:', e.message, 'raw_head:', text.slice(0, 120));
    notifyAdminPortalFailure(uid, 'json_parse_failure', {
      Function: 'extractSupplierQuotePricing',
      Error: e.message,
      'Response length': text.length,
      Token: token,
      Vendor: tokenData.vendorName || '',
      Project: tokenData.projectName || '',
    }).catch(() => {});
    extracted = [];
  }

  // DECISION(v1.19.664): Track whether cross-ref enrichment succeeded so the client can show
  // a non-blocking notice to the supplier. Previously the failure was silently logged; the
  // supplier had no way to know their extraction was less accurate than usual.
  let crossRefEnriched = false;
  let crossRefSkipReason = null;
  // Enrich with saved cross-references: sqCrossings maps supplierPN→{bcItemNumber}
  // Build reverse map bcItemNumber→supplierPN so we can fill missing supplierPartNumbers
  try {
    const [crossSnap, xrefSnap] = await Promise.all([
      admin.firestore().doc(`users/${uid}/config/sqCrossings`).get(),
      admin.firestore().doc(`users/${uid}/config/supplierCrossRef`).get(),
    ]);
    const bcToSupplier = {}; // normalized bcPartNumber → original supplier PN
    // sqCrossings: { "supplier_pn_lower": { bcItemNumber: "ARL449", ... } }
    if (crossSnap.exists) {
      const data = crossSnap.data();
      for (const [supplierPN, val] of Object.entries(data)) {
        if (val && val.bcItemNumber) {
          const bcKey = val.bcItemNumber.toLowerCase().replace(/[\s\-\.]/g, '');
          if (!bcToSupplier[bcKey]) bcToSupplier[bcKey] = supplierPN;
        }
      }
    }
    // supplierCrossRef: { records: [{ origPartNumber, bcPartNumber, ... }] }
    if (xrefSnap.exists) {
      const records = xrefSnap.data().records || [];
      for (const rec of records) {
        if (rec.origPartNumber && rec.bcPartNumber) {
          const bcKey = rec.bcPartNumber.toLowerCase().replace(/[\s\-\.]/g, '');
          if (!bcToSupplier[bcKey]) bcToSupplier[bcKey] = rec.origPartNumber;
        }
      }
    }
    // Fill in missing supplierPartNumber from cross-ref
    for (const item of extracted) {
      if (!item.supplierPartNumber && item.partNumber) {
        const key = item.partNumber.toLowerCase().replace(/[\s\-\.]/g, '');
        if (bcToSupplier[key]) item.supplierPartNumber = bcToSupplier[key];
      }
    }
    crossRefEnriched = true;
  } catch (e) {
    crossRefSkipReason = e.message || 'unknown error';
    functions.logger.warn('Cross-ref enrichment failed:', crossRefSkipReason);
  }

  // Validation: log count comparison
  const matchedCount = extracted.filter(e => e.partNumber && e.confidence !== 'unmatched').length;
  const unmatchedCount = extracted.filter(e => e.confidence === 'unmatched').length;
  functions.logger.info(`extractSupplierQuotePricing: requested=${lineItems.length}, matched=${matchedCount}, unmatched_supplier_items=${unmatchedCount}, total_extracted=${extracted.length}, crossRefEnriched=${crossRefEnriched}`);

  return {
    extracted,
    quoteHeader,
    summary: summary || { requestedCount: lineItems.length, matchedCount, unmatchedSupplierItems: unmatchedCount },
    // DECISION(v1.19.664): Flag so the client can show a non-blocking warning if enrichment
    // was skipped. The BOM matching in ARC still works — it just misses the saved supplier
    // PN crossings from previous extractions.
    crossRefEnriched,
    ...(crossRefSkipReason ? { crossRefSkipReason } : {}),
  };
});

// ── CODALE PRICE SCRAPER ──

/**
 * Manual trigger — callable from ARC UI "Run Codale Scrape" button
 * Requires auth. Accepts optional { maxItems } to limit batch size.
 */
exports.codaleRunScrape = functions.runWith({ timeoutSeconds: 540, memory: '2GB', maxInstances: 2 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const uid = context.auth.uid;
  const maxItems = data?.maxItems || 30;

  try {
    const result = await runCodaleScrape(uid, { maxItems });
    return { success: true, ...result };
  } catch (e) {
    console.error('codaleRunScrape error:', e.message);
    throw new functions.https.HttpsError('internal', e.message);
  }
});

/**
 * Scheduled trigger — runs via Cloud Scheduler / Pub/Sub
 * Finds the first user with Codale items configured and runs the scrape.
 * Schedule: every 6 hours (configure via Cloud Scheduler in GCP console)
 */
exports.codaleScheduledScrape = functions.runWith({ timeoutSeconds: 540, memory: '2GB', maxInstances: 1 }).pubsub
  .topic('codale-price-scrape')
  .onPublish(async (message) => {
    // Find users with codaleItems configured
    const usersSnap = await admin.firestore().collectionGroup('codaleItems').limit(10).get();
    // codaleItems is stored at users/{uid}/config/codaleItems — extract uid from path
    const uids = new Set();
    // Alternative: scan for users with config/codaleItems doc
    const allUsers = await admin.firestore().collection('users').get();
    for (const userDoc of allUsers.docs) {
      const codaleDoc = await admin.firestore().doc(`users/${userDoc.id}/config/codaleItems`).get();
      if (codaleDoc.exists && (codaleDoc.data().items || []).length > 0) {
        uids.add(userDoc.id);
      }
    }

    for (const uid of uids) {
      try {
        console.log(`Scheduled Codale scrape for user ${uid}`);
        await runCodaleScrape(uid, { maxItems: 30 });
      } catch (e) {
        console.error(`Scheduled scrape failed for ${uid}:`, e.message);
      }
    }

    return null;
  });

// TEMPORARY: Admin diagnostic — check and fix team member API key access
exports.diagnoseMemberApiKey = functions.runWith({ maxInstances: 5 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const targetEmail = data?.email;
  if (!targetEmail) throw new functions.https.HttpsError('invalid-argument', 'Provide email');
  const db = admin.firestore();
  const auth = admin.auth();
  try {
    const user = await auth.getUserByEmail(targetEmail);
    const result = { uid: user.uid, email: user.email, displayName: user.displayName };

    const profile = await db.doc(`users/${user.uid}/config/profile`).get();
    result.profileExists = profile.exists;
    result.profile = profile.exists ? profile.data() : null;

    const userApi = await db.doc(`users/${user.uid}/config/api`).get();
    result.userApiKeyExists = userApi.exists;
    result.userApiKeyLength = userApi.exists ? (userApi.data()?.key?.length || 0) : 0;

    const companyId = profile.exists ? profile.data()?.companyId : null;
    result.companyId = companyId;

    if (companyId) {
      const compApi = await db.doc(`companies/${companyId}/config/api`).get();
      result.companyApiKeyExists = compApi.exists;
      result.companyApiKeyLength = compApi.exists ? (compApi.data()?.key?.length || 0) : 0;

      const member = await db.doc(`companies/${companyId}/members/${user.uid}`).get();
      result.memberExists = member.exists;
      result.memberRole = member.exists ? member.data()?.role : null;

      // If company key exists but user key doesn't, copy it
      if (compApi.exists && compApi.data()?.key && !userApi.exists) {
        await db.doc(`users/${user.uid}/config/api`).set({ key: compApi.data().key });
        result.fixApplied = 'Copied company API key to user config';
      } else if (!compApi.exists || !compApi.data()?.key) {
        // Company key missing — find the admin's key and copy it to company + user
        const adminMembers = await db.collection(`companies/${companyId}/members`).where('role', '==', 'admin').get();
        let adminKey = null;
        for (const mem of adminMembers.docs) {
          const adminApi = await db.doc(`users/${mem.id}/config/api`).get();
          if (adminApi.exists && adminApi.data()?.key) { adminKey = adminApi.data().key; break; }
        }
        if (adminKey) {
          await db.doc(`companies/${companyId}/config/api`).set({ key: adminKey });
          if (!userApi.exists) await db.doc(`users/${user.uid}/config/api`).set({ key: adminKey });
          result.fixApplied = 'Copied admin API key to company config + user config';
        } else {
          result.fixNeeded = 'No API key found on any admin — must set in Settings';
        }
      }
    }
    return result;
  } catch (e) {
    throw new functions.https.HttpsError('internal', e.message);
  }
});

/**
 * Test endpoint — scrape specific part numbers from Codale with login (customer pricing)
 * Call with { partNumbers: ["25B-D4P0N114", "5069-OB16"] }
 */
exports.codaleTestScrape = functions.runWith({ timeoutSeconds: 300, memory: '2GB', maxInstances: 2 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const partNumbers = data?.partNumbers;
  if (!Array.isArray(partNumbers) || !partNumbers.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Provide partNumbers array');
  }
  const username = process.env.CODALE_USERNAME;
  const password = process.env.CODALE_PASSWORD;
  if (!username || !password) {
    throw new functions.https.HttpsError('failed-precondition', 'Codale credentials not configured');
  }
  try {
    // DECISION(v1.19.482): Increased batch limit from 10 to 30 — most panels have 20-50 Codale items
    const results = await codaleScrapeBatch(partNumbers.slice(0, 30), username, password);
    return { success: true, results };
  } catch (e) {
    throw new functions.https.HttpsError('internal', 'Scrape failed: ' + e.message);
  }
});

// ── CUSTOM SCRAPER LOOKUP (Step-Based) ──
// DECISION(v1.19.387): Generic scraper that executes admin-defined browser automation steps.
// Steps are configured in ARC UI and stored in Firestore. Puppeteer runs each step sequentially.
// Supports: navigate, fill, click, wait, extract. Placeholders: {partNumber}, {username}, {password}.
// DECISION(v1.19.590): Harden puppeteer page against third-party JS errors.
// Many vendor sites (Royal Wholesale, etc.) try to register for push notifications
// on page load. In headless Chrome with no active push service, PushManager.subscribe
// throws and breaks the site's init JS — preventing login/search forms from rendering
// and causing our scraper to time out or surface the cryptic "Failed to execute
// 'subscribe' on 'PushManager'" error as if scraping itself failed.
// This stubs PushManager/Notification before the vendor page loads AND swallows
// pageerror events so a broken vendor init-script doesn't fail our whole batch.
async function hardenScraperPage(page, label) {
  const tag = label || 'scraper';
  page.on('pageerror', err => {
    console.warn(`[${tag}] page JS error (swallowed):`, String(err && err.message || err).slice(0, 200));
  });
  page.on('console', msg => {
    const t = msg.type();
    if (t !== 'error' && t !== 'warning') return;
    const txt = (msg.text() || '').slice(0, 160);
    if (/PushManager|Service Worker|Notification|push subscription|subscribe/i.test(txt)) return;
    console.log(`[${tag}] console.${t}:`, txt);
  });
  await page.evaluateOnNewDocument(() => {
    try {
      if (typeof PushManager !== 'undefined' && PushManager.prototype) {
        PushManager.prototype.subscribe = function() { return Promise.reject(new Error('push disabled in headless scraper')); };
        PushManager.prototype.getSubscription = function() { return Promise.resolve(null); };
        PushManager.prototype.permissionState = function() { return Promise.resolve('denied'); };
      }
      if (typeof Notification !== 'undefined') {
        try { Object.defineProperty(Notification, 'permission', { get: () => 'denied', configurable: true }); } catch(_) {}
        try { Notification.requestPermission = () => Promise.resolve('denied'); } catch(_) {}
      }
      // Silence "PushManager subscribe failed" log spam so real scraper errors stand out.
      const origErr = console.error;
      console.error = function() {
        const first = String(arguments[0] || '');
        if (/PushManager|subscribe|push subscription|service worker/i.test(first)) return;
        return origErr.apply(console, arguments);
      };
    } catch (e) {}
  });
}

exports.customScraperLookup = functions.runWith({ timeoutSeconds: 300, memory: '2GB', maxInstances: 5 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { partNumber, config, steps } = data || {};
  if (!partNumber) throw new functions.https.HttpsError('invalid-argument', 'partNumber is required');
  if (!steps || !steps.length) throw new functions.https.HttpsError('invalid-argument', 'No automation steps configured for this scraper');

  const username = config?.username || '';
  const password = config?.password || '';
  const accountId = config?.accountId || '';

  // Replace placeholders in a string
  function replacePlaceholders(str) {
    return (str || '')
      .replace(/\{partNumber\}/gi, partNumber)
      .replace(/\{username\}/gi, username)
      .replace(/\{password\}/gi, password)
      .replace(/\{accountId\}/gi, accountId);
  }

  // DECISION(v1.19.392): After login, verify/select the correct customer account.
  // Checks page text for the accountId. If not found, clicks the account dropdown
  // and selects the matching option.
  async function verifyAccount(page, targetAccountId) {
    if (!targetAccountId) return { ok: true, msg: 'No account ID configured — skipping verification' };
    const pageText = await page.evaluate(() => document.body.innerText || '');
    if (pageText.includes(targetAccountId)) {
      return { ok: true, msg: 'Account ' + targetAccountId + ' already selected' };
    }
    // Account not selected — try to find and click the dropdown, then select the right account
    console.log('Account', targetAccountId, 'not found on page, attempting to switch...');
    try {
      // Click the account dropdown button (shadow DOM: button.secondary-add)
      const clicked = await page.evaluate((targetId) => {
        function deepQueryAll(root, sel) {
          let results = [...root.querySelectorAll(sel)];
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) results.push(...deepQueryAll(el.shadowRoot, sel));
          }
          return results;
        }
        // Find and click the account dropdown button
        const btns = deepQueryAll(document, 'button');
        const accountBtn = btns.find(b => (b.textContent || '').includes('Customer Account'));
        if (accountBtn) { accountBtn.click(); return 'clicked dropdown'; }
        return 'dropdown not found';
      });
      console.log('Account dropdown:', clicked);
      await new Promise(r => setTimeout(r, 2000));
      // Now find and click the account option matching targetAccountId
      const selected = await page.evaluate((targetId) => {
        function deepQueryAll(root, sel) {
          let results = [...root.querySelectorAll(sel)];
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) results.push(...deepQueryAll(el.shadowRoot, sel));
          }
          return results;
        }
        // Look for any clickable element containing the account ID
        const allEls = deepQueryAll(document, '*');
        const match = allEls.find(el => {
          const text = (el.textContent || '').trim();
          return text.includes(targetId) && (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'LI' || el.tagName === 'DIV' || el.tagName === 'SPAN') && text.length < 200;
        });
        if (match) { match.click(); return 'selected ' + targetId; }
        return 'account option not found for ' + targetId;
      }, targetAccountId);
      console.log('Account selection:', selected);
      await new Promise(r => setTimeout(r, 3000));
      // Verify after switch
      const verifyText = await page.evaluate(() => document.body.innerText || '');
      if (verifyText.includes(targetAccountId)) return { ok: true, msg: 'Switched to account ' + targetAccountId };
      return { ok: false, msg: 'Account switch attempted but ' + targetAccountId + ' not confirmed on page' };
    } catch (e) {
      return { ok: false, msg: 'Account switch failed: ' + e.message };
    }
  }

  let browser = null;
  try {
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1366, height: 768 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await hardenScraperPage(page, 'customScraperLookup');

    const extracted = {};
    const stepLog = [];

    // Helper: find element by CSS selector, piercing shadow DOMs
    // Supports ">>>" as shadow DOM piercing separator (e.g. "host-element >>> .inner-class")
    // Also tries document-level first, then recursively searches shadow roots
    async function findInShadow(sel) {
      // First try native selector (works for non-shadow elements)
      let el = await page.$(sel).catch(() => null);
      if (el) return el;
      // Try piercing shadow DOMs via page.evaluate
      const handle = await page.evaluateHandle((selector) => {
        function deepQuery(root, sel) {
          let found = root.querySelector(sel);
          if (found) return found;
          // Search inside shadow roots
          const allEls = root.querySelectorAll('*');
          for (const el of allEls) {
            if (el.shadowRoot) {
              found = deepQuery(el.shadowRoot, sel);
              if (found) return found;
            }
          }
          return null;
        }
        // Handle ">>>" piercing syntax
        if (selector.includes('>>>')) {
          const parts = selector.split('>>>').map(s => s.trim());
          let current = document;
          for (const part of parts) {
            const el = current.querySelector(part);
            if (!el) return null;
            current = el.shadowRoot || el;
          }
          return current === document ? null : current;
        }
        return deepQuery(document, selector);
      }, sel);
      const el2 = handle.asElement();
      return el2;
    }

    // Helper: wait for element with shadow DOM support
    async function waitForShadow(sel, timeout = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const el = await findInShadow(sel);
        if (el) return el;
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error(`Timeout waiting for: ${sel}`);
    }

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      try {
        switch (step.type) {
          case 'navigate': {
            const url = replacePlaceholders(step.url);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            stepLog.push({ step: i + 1, type: 'navigate', url, ok: true });
            break;
          }
          case 'fill': {
            const selector = replacePlaceholders(step.selector);
            const value = replacePlaceholders(step.value);
            const el = await waitForShadow(selector);
            if (!el) throw new Error('Element not found: ' + selector);
            await el.click({ clickCount: 3 });
            await el.type(value, { delay: 50 });
            stepLog.push({ step: i + 1, type: 'fill', selector, ok: true });
            break;
          }
          case 'click': {
            const selector = replacePlaceholders(step.selector);
            const el = await waitForShadow(selector);
            if (!el) throw new Error('Element not found: ' + selector);
            await el.click();
            await new Promise(r => setTimeout(r, 1500));
            stepLog.push({ step: i + 1, type: 'click', selector, ok: true });
            break;
          }
          case 'wait': {
            if (step.selector) {
              const selector = replacePlaceholders(step.selector);
              await waitForShadow(selector, 15000);
              stepLog.push({ step: i + 1, type: 'wait', selector, ok: true });
            } else {
              const secs = Math.min(step.seconds || 3, 30);
              await new Promise(r => setTimeout(r, secs * 1000));
              stepLog.push({ step: i + 1, type: 'wait', seconds: secs, ok: true });
            }
            break;
          }
          case 'verifyAccount': {
            const result = await verifyAccount(page, accountId || step.accountId || '');
            stepLog.push({ step: i + 1, type: 'verifyAccount', ...result });
            break;
          }
          case 'extract': {
            const selector = replacePlaceholders(step.selector);
            const field = step.field || 'value';
            try {
              const el = await waitForShadow(selector, 10000);
              if (!el) throw new Error('not found');
              const text = await page.evaluate(e => (e.textContent || e.value || '').trim(), el);
              extracted[field] = text;
              stepLog.push({ step: i + 1, type: 'extract', field, value: text, ok: true });
            } catch (e) {
              extracted[field] = null;
              stepLog.push({ step: i + 1, type: 'extract', field, ok: false, error: 'Element not found: ' + selector });
            }
            break;
          }
          case 'extractPageText': {
            // Extract data from full page text using regex — works even with Shadow DOM
            const field = step.field || 'value';
            try {
              // Use innerText which Chrome resolves through shadow DOMs for visible content
              // Falls back to textContent if innerText is empty
              const allText = await page.evaluate(() => {
                return document.body.innerText || document.body.textContent || '';
              });
              // Extract first price pattern
              if (field === 'price') {
                const m = allText.match(/\$[\d,]+\.\d{2}/);
                extracted[field] = m ? m[0] : null;
                stepLog.push({ step: i + 1, type: 'extractPageText', field, value: extracted[field], ok: !!m });
              } else if (field === 'allPrices') {
                const ms = allText.match(/\$[\d,]+\.\d{2}/g) || [];
                extracted[field] = ms;
                stepLog.push({ step: i + 1, type: 'extractPageText', field, value: ms.slice(0,5).join(', '), ok: ms.length > 0 });
              } else {
                // Generic: save full page text (truncated)
                extracted[field] = allText.substring(0, 2000);
                stepLog.push({ step: i + 1, type: 'extractPageText', field, ok: true });
              }
            } catch (e) {
              extracted[field] = null;
              stepLog.push({ step: i + 1, type: 'extractPageText', field, ok: false, error: e.message });
            }
            break;
          }
          default:
            stepLog.push({ step: i + 1, type: step.type, ok: false, error: 'Unknown step type' });
        }
      } catch (e) {
        stepLog.push({ step: i + 1, type: step.type, ok: false, error: e.message });
        if (step.type === 'navigate') break;
      }
    }

    await browser.close();
    browser = null;

    return {
      success: true,
      partNumber,
      results: extracted,
      stepLog,
      stepsExecuted: stepLog.length,
      totalSteps: steps.length
    };
  } catch (e) {
    if (browser) try { await browser.close(); } catch (_) {}
    throw new functions.https.HttpsError('internal', 'Scraper failed: ' + e.message);
  }
});

// ── CUSTOM SCRAPER BATCH ──
// DECISION(v1.19.390): Batch version of customScraperLookup. Logs in ONCE, then searches
// multiple part numbers in the same browser session. Used by "Get New Pricing" to auto-price
// all items from a vendor (Royal, etc.) in one go.
exports.customScraperBatch = functions.runWith({ timeoutSeconds: 540, memory: '2GB', maxInstances: 3 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { partNumbers, config, steps } = data || {};
  if (!partNumbers || !partNumbers.length) throw new functions.https.HttpsError('invalid-argument', 'partNumbers array required');
  if (!steps || !steps.length) throw new functions.https.HttpsError('invalid-argument', 'No steps configured');

  const username = config?.username || '';
  const password = config?.password || '';
  const accountId = config?.accountId || '';

  function replacePlaceholders(str, partNumber) {
    return (str || '').replace(/\{partNumber\}/gi, partNumber).replace(/\{username\}/gi, username).replace(/\{password\}/gi, password).replace(/\{accountId\}/gi, accountId);
  }

  let browser = null;
  try {
    const chromium = require('@sparticuz/chromium');
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({
      args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1366, height: 768 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await hardenScraperPage(page, 'customScraperBatch');

    // Shadow DOM helper
    async function findInShadow(sel) {
      let el = await page.$(sel).catch(() => null);
      if (el) return el;
      const handle = await page.evaluateHandle((selector) => {
        function deepQuery(root, sel) {
          let found = root.querySelector(sel);
          if (found) return found;
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) { found = deepQuery(el.shadowRoot, sel); if (found) return found; }
          }
          return null;
        }
        return deepQuery(document, selector);
      }, sel);
      return handle.asElement();
    }
    async function waitForShadow(sel, timeout = 10000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const el = await findInShadow(sel);
        if (el) return el;
        await new Promise(r => setTimeout(r, 500));
      }
      return null;
    }

    // Step 1: Execute login steps (everything before the first {partNumber} reference)
    const loginSteps = [];
    const searchSteps = [];
    let foundPartRef = false;
    for (const step of steps) {
      const hasPartRef = JSON.stringify(step).includes('{partNumber}');
      if (hasPartRef) foundPartRef = true;
      if (foundPartRef) searchSteps.push(step);
      else loginSteps.push(step);
    }

    // Execute login
    for (const step of loginSteps) {
      try {
        if (step.type === 'navigate') await page.goto(replacePlaceholders(step.url, ''), { waitUntil: 'networkidle2', timeout: 30000 });
        else if (step.type === 'fill') { const el = await waitForShadow(replacePlaceholders(step.selector, '')); if (el) { await el.click({ clickCount: 3 }); await el.type(replacePlaceholders(step.value, ''), { delay: 50 }); } }
        else if (step.type === 'click') { const el = await waitForShadow(replacePlaceholders(step.selector, '')); if (el) { await el.click(); await new Promise(r => setTimeout(r, 1500)); } }
        else if (step.type === 'wait') { if (step.selector) await waitForShadow(replacePlaceholders(step.selector, ''), 15000); else await new Promise(r => setTimeout(r, (step.seconds || 3) * 1000)); }
      } catch (e) { console.warn('Login step failed:', step.type, e.message); }
    }
    // Verify/select the correct customer account after login
    if (accountId) {
      const pageText = await page.evaluate(() => document.body.innerText || '');
      if (!pageText.includes(accountId)) {
        console.log('Batch: account', accountId, 'not selected, attempting switch...');
        // Click account dropdown
        await page.evaluate(() => {
          function deepQueryAll(root, sel) {
            let results = [...root.querySelectorAll(sel)];
            for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) results.push(...deepQueryAll(el.shadowRoot, sel)); }
            return results;
          }
          const btn = deepQueryAll(document, 'button').find(b => (b.textContent || '').includes('Customer Account'));
          if (btn) btn.click();
        });
        await new Promise(r => setTimeout(r, 2000));
        // Select the target account
        await page.evaluate((targetId) => {
          function deepQueryAll(root, sel) {
            let results = [...root.querySelectorAll(sel)];
            for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) results.push(...deepQueryAll(el.shadowRoot, sel)); }
            return results;
          }
          const match = deepQueryAll(document, '*').find(el => (el.textContent || '').includes(targetId) && ['A','BUTTON','LI','DIV','SPAN'].includes(el.tagName) && (el.textContent||'').length < 200);
          if (match) match.click();
        }, accountId);
        await new Promise(r => setTimeout(r, 3000));
        const verifyText = await page.evaluate(() => document.body.innerText || '');
        console.log('Batch: account switch', verifyText.includes(accountId) ? 'SUCCESS' : 'FAILED', 'for', accountId);
      } else {
        console.log('Batch: account', accountId, 'already selected');
      }
    }
    console.log('Batch scraper: logged in, searching', partNumbers.length, 'parts');

    // Step 2: For each part number, execute the search+extract steps
    const results = {};
    const limit = Math.min(partNumbers.length, 50); // Cap at 50 per batch
    for (let pi = 0; pi < limit; pi++) {
      const pn = partNumbers[pi].trim();
      if (!pn) continue;
      try {
        for (const step of searchSteps) {
          if (step.type === 'navigate') await page.goto(replacePlaceholders(step.url, pn), { waitUntil: 'networkidle2', timeout: 30000 });
          else if (step.type === 'wait') { if (step.selector) await waitForShadow(replacePlaceholders(step.selector, pn), 15000); else await new Promise(r => setTimeout(r, (step.seconds || 3) * 1000)); }
          else if (step.type === 'extractPageText') {
            const allText = await page.evaluate(() => document.body.innerText || document.body.textContent || '');
            if (step.field === 'price') {
              const m = allText.match(/\$[\d,]+\.\d{2}/);
              if (!results[pn.toUpperCase()]) results[pn.toUpperCase()] = {};
              results[pn.toUpperCase()].price = m ? m[0] : null;
            }
          }
          else if (step.type === 'extract') {
            const el = await findInShadow(replacePlaceholders(step.selector, pn));
            if (el) {
              const text = await page.evaluate(e => (e.textContent || '').trim(), el);
              if (!results[pn.toUpperCase()]) results[pn.toUpperCase()] = {};
              results[pn.toUpperCase()][step.field || 'value'] = text;
            }
          }
        }
        console.log(`Batch ${pi + 1}/${limit}: ${pn} → ${results[pn.toUpperCase()]?.price || 'no price'}`);
        // Brief delay between searches to avoid rate limiting
        if (pi < limit - 1) await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        console.warn(`Batch search failed for ${pn}:`, e.message);
        results[pn.toUpperCase()] = { price: null, error: e.message };
      }
    }

    await browser.close();
    return { success: true, results, totalSearched: limit };
  } catch (e) {
    if (browser) try { await browser.close(); } catch (_) {}
    throw new functions.https.HttpsError('internal', 'Batch scraper failed: ' + e.message);
  }
});

// ── MOUSER API ──

/**
 * Search parts via Mouser API — returns real-time pricing and availability
 * Call with { partNumbers: ["LM358", "STM32F407VET6"] }
 */
exports.mouserSearch = functions.runWith({ timeoutSeconds: 120, memory: '256MB', maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  if (!MOUSER_API_KEY) throw new functions.https.HttpsError('failed-precondition', 'Mouser API key not configured');
  const partNumbers = data?.partNumbers;
  if (!Array.isArray(partNumbers) || !partNumbers.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Provide partNumbers array');
  }
  try {
    const results = await mouserSearchBatch(partNumbers.slice(0, 20), MOUSER_API_KEY);
    return { success: true, results };
  } catch (e) {
    throw new functions.https.HttpsError('internal', 'Mouser search failed: ' + e.message);
  }
});

/**
 * Search parts via DigiKey API — returns real-time pricing and availability
 * Call with { items: [{partNumber, manufacturer}] } or { partNumbers: ["..."] }
 */
exports.digikeySearch = functions.runWith({ timeoutSeconds: 120, memory: '256MB', maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  if (!DIGIKEY_CLIENT_ID || !DIGIKEY_CLIENT_SECRET) throw new functions.https.HttpsError('failed-precondition', 'DigiKey credentials not configured');
  // Accept either items array [{partNumber, manufacturer}] or legacy partNumbers array
  const items = data?.items || (data?.partNumbers || []).map(pn => ({ partNumber: pn }));
  if (!Array.isArray(items) || !items.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Provide items array');
  }
  try {
    const results = await digikeySearchBatch(items.slice(0, 20), DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET);
    return { success: true, results };
  } catch (e) {
    throw new functions.https.HttpsError('internal', 'DigiKey search failed: ' + e.message);
  }
});

/**
 * Search both DigiKey AND Mouser for a batch of parts, with MFR validation.
 * Returns per-item results for both vendors — frontend writes prices to BC under each vendor.
 * Call with { items: [{partNumber, manufacturer}] } — max 10 items per call (Mouser rate limit).
 */
exports.searchVendorPricing = functions.runWith({ timeoutSeconds: 300, memory: '512MB', maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const items = (data?.items || []).slice(0, 10);
  if (!items.length) return { success: true, results: [] };

  const dkReady = !!(DIGIKEY_CLIENT_ID && DIGIKEY_CLIENT_SECRET);
  const mouserReady = !!MOUSER_API_KEY;
  const results = [];

  for (let i = 0; i < items.length; i++) {
    const { partNumber, manufacturer } = items[i];
    console.log(`VendorPricing ${i + 1}/${items.length}: ${partNumber}${manufacturer ? ` (${manufacturer})` : ''}`);

    const [dkResult, mouserResult] = await Promise.all([
      dkReady
        ? digikeySearchPart(partNumber, DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET, manufacturer || null)
            .catch(e => ({ partNumber, found: false, error: e.message }))
        : Promise.resolve({ partNumber, found: false, error: 'DigiKey not configured' }),
      mouserReady
        ? mouserSearchPart(partNumber, MOUSER_API_KEY, manufacturer || null)
            .catch(e => ({ partNumber, found: false, error: e.message }))
        : Promise.resolve({ partNumber, found: false, error: 'Mouser not configured' }),
    ]);

    results.push({ partNumber, manufacturer: manufacturer || null, digikey: dkResult, mouser: mouserResult });

    if (i < items.length - 1) {
      // 2.5s delay between items to respect Mouser rate limit (30 req/min)
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  return { success: true, results };
});

// ── BULK MFR CODE LOOKUP ──
// Fetches BC items with empty Manufacturer_Code, looks up MFR via DigiKey/Mouser,
// maps to BC code, and optionally patches back to BC.

const BC_MFR_MAP = [
  {code:'AB',terms:['allen-bradley','allen bradley','rockwell automation','rockwell']},
  {code:'SE',terms:['schneider electric','schneider','square d','modicon','telemecanique']},
  {code:'SIEMENS',terms:['siemens']},
  {code:'ABB',terms:['abb']},
  {code:'EATON',terms:['eaton','cutler-hammer','cutler hammer','moeller']},
  {code:'HOFFMAN',terms:['hoffman','pentair']},
  {code:'RITTAL',terms:['rittal']},
  {code:'HAMMOND',terms:['hammond']},
  {code:'SAGINAW',terms:['saginaw','saginaw control']},
  {code:'PHX',terms:['phoenix contact','phoenix','phoenixcontact','phxct']},
  {code:'WEIDMULLER',terms:['weidmuller','weidmüller']},
  {code:'TURCK',terms:['turck','banner']},
  {code:'OMRON',terms:['omron']},
  {code:'PILZ',terms:['pilz']},
  {code:'IDEC',terms:['idec']},
  {code:'PANDUIT',terms:['panduit']},
  {code:'BRADY',terms:['brady']},
  {code:'HUBBELL',terms:['hubbell','kellems']},
  {code:'LEVITON',terms:['leviton']},
  {code:'BELDEN',terms:['belden']},
  {code:'LAPP',terms:['lapp']},
  {code:'PF',terms:['pepperl','pepperl+fuchs','pepperl fuchs']},
  {code:'SICK',terms:['sick']},
  {code:'KEYENCE',terms:['keyence']},
  {code:'AUTOMDIR',terms:['automation direct','automationdirect']},
  {code:'MURR',terms:['murr','murr elektronik']},
  {code:'WAGO',terms:['wago']},
  {code:'LEUZE',terms:['leuze']},
  {code:'COGNEX',terms:['cognex']},
  {code:'TE',terms:['te connectivity','tyco','amp','raychem']},
  {code:'MOLEX',terms:['molex']},
  {code:'3M',terms:['3m']},
  {code:'LITTELF',terms:['littelfuse']},
  {code:'VISHAY',terms:['vishay']},
  {code:'TI',terms:['texas instruments']},
  {code:'MEANWL',terms:['mean well','meanwell']},
];

function mapMfrToCode(rawMfr) {
  if (!rawMfr || !rawMfr.trim()) return null;
  const s = rawMfr.trim().toLowerCase();
  for (const entry of BC_MFR_MAP) {
    for (const term of entry.terms) {
      if (s.includes(term) || term.includes(s)) return entry.code;
    }
  }
  return null;
}

// ── Google search fallback for manufacturer lookup ──
async function googleSearchMfr(partNumber) {
  try {
    const q = encodeURIComponent(`${partNumber} manufacturer datasheet`);
    const r = await fetch(`https://www.google.com/search?q=${q}&num=5`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html' },
    });
    if (!r.ok) return null;
    const html = await r.text();
    const lower = html.toLowerCase();
    for (const entry of BC_MFR_MAP) {
      for (const term of entry.terms) {
        if (term.length >= 4 && lower.includes(term)) return { manufacturer: entry.terms[0], code: entry.code, source: 'google' };
      }
    }
    return null;
  } catch (e) { return null; }
}

// ── OEMSecrets API fallback (limited to 10/day on free tier) ──
const OEMSECRETS_API_KEY = process.env.OEMSECRETS_API_KEY || '';
let _oemCallsToday = 0;
async function oemsecretsSearchMfr(partNumber) {
  if (!OEMSECRETS_API_KEY || _oemCallsToday >= 10) return null;
  try {
    _oemCallsToday++;
    const url = `https://oemsecretsapi.com/partsearch?apiKey=${OEMSECRETS_API_KEY}&searchTerm=${encodeURIComponent(partNumber)}&currency=USD&countryCode=US`;
    const r = await fetch(url);
    if (r.status === 401) { _oemCallsToday = 10; return null; } // limit hit
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.stock || !d.stock.length) return null;
    const allText = d.stock.map(s => `${s.distributor?.common_name||''} ${s.distributor?.name||''} ${s.part_number||''}`).join(' ').toLowerCase();
    for (const entry of BC_MFR_MAP) {
      for (const term of entry.terms) {
        if (term.length >= 4 && allText.includes(term)) return { manufacturer: entry.terms[0], code: entry.code, source: 'oemsecrets' };
      }
    }
    return null;
  } catch (e) { return null; }
}

// Two functions: one to list items needing MFR, one to process a small batch

// DECISION(v1.19.734): Security audit finding H-3 — both bulkMfrList and bulkMfrLookup
// accept a client-supplied `bcODataBase` URL and forward the caller's BC bearer token in
// the Authorization header. Without validation, any authenticated caller could direct
// the function to send their token to an attacker-controlled host (credential theft),
// or probe internal / cloud-metadata endpoints via SSRF. We pin the prefix to Microsoft's
// Business Central OData domain to close both attack paths.
const BC_ODATA_ALLOWED_PREFIX = 'https://api.businesscentral.dynamics.com/';
function assertBcODataBase(bcODataBase) {
  if (typeof bcODataBase !== 'string' || !bcODataBase.startsWith(BC_ODATA_ALLOWED_PREFIX)) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'bcODataBase must begin with ' + BC_ODATA_ALLOWED_PREFIX
    );
  }
}

exports.bulkMfrList = functions.runWith({
  timeoutSeconds: 300,
  memory: '256MB',
  maxInstances: 5,
}).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { bcToken, bcODataBase } = data || {};
  if (!bcToken || !bcODataBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken and bcODataBase required');
  assertBcODataBase(bcODataBase);

  const bcHeaders = { 'Authorization': `Bearer ${bcToken}`, 'Accept': 'application/json' };
  const allItems = [];
  let skip = 0;
  while (true) {
    const url = `${bcODataBase}/ItemCard?$filter=Manufacturer_Code eq ''&$select=No,Description&$top=200&$skip=${skip}`;
    const r = await fetch(url, { headers: bcHeaders });
    if (!r.ok) break;
    const batch = (await r.json()).value || [];
    if (!batch.length) break;
    allItems.push(...batch.map(i => ({ no: i.No, desc: i.Description })));
    skip += 200;
    if (batch.length < 200) break;
  }
  return { success: true, items: allItems };
});

exports.bulkMfrLookup = functions.runWith({
  timeoutSeconds: 540,
  memory: '512MB',
  maxInstances: 3,
}).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

  const { bcToken, bcODataBase, dryRun = true, items: inputItems } = data || {};
  // G005 Phase 1: bulkMfrLookup is the ONE server-side BC-writer (POST Manufacturers + PATCH ItemCard).
  // The client bcGatedFetch belt can't catch it, so the test client passes isTest:true → force dry-run
  // for the WRITE portion (lookup/return still runs so the tool works in test; just no BC write).
  const _skipMfrWrites = dryRun || (data && data.isTest === true);
  if (!bcToken || !bcODataBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken and bcODataBase required');
  assertBcODataBase(bcODataBase);
  if (!Array.isArray(inputItems) || !inputItems.length) throw new functions.https.HttpsError('invalid-argument', 'items array required');

  const dkReady = !!(DIGIKEY_CLIENT_ID && DIGIKEY_CLIENT_SECRET);
  const mouserReady = !!MOUSER_API_KEY;

  const bcHeaders = { 'Authorization': `Bearer ${bcToken}`, 'Accept': 'application/json', 'Content-Type': 'application/json' };
  const results = [];
  let patched = 0;
  const unknownMfr = [];

  // Process items passed by client (small batch, ~20-30 items)
  for (let i = 0; i < inputItems.length; i++) {
    const { no: pn, desc } = inputItems[i];
    let manufacturer = null;
    let source = null;

    if (dkReady) {
      try {
        const dk = await digikeySearchPart(pn, DIGIKEY_CLIENT_ID, DIGIKEY_CLIENT_SECRET);
        if (dk.found && dk.manufacturer) { manufacturer = dk.manufacturer; source = 'digikey'; }
      } catch (e) { /* continue to mouser */ }
    }

    if (!manufacturer && mouserReady) {
      try {
        const ms = await mouserSearchPart(pn, MOUSER_API_KEY);
        if (ms.found && ms.manufacturer) { manufacturer = ms.manufacturer; source = 'mouser'; }
      } catch (e) { /* skip */ }
    }

    // Google search fallback
    let fallbackResult = null;
    if (!manufacturer) {
      fallbackResult = await googleSearchMfr(pn);
      if (fallbackResult) { manufacturer = fallbackResult.manufacturer; source = 'google'; }
    }
    // OEMSecrets last resort (10/day limit on free tier)
    if (!manufacturer) {
      fallbackResult = await oemsecretsSearchMfr(pn);
      if (fallbackResult) { manufacturer = fallbackResult.manufacturer; source = 'oemsecrets'; }
    }

    if (!manufacturer) {
      results.push({ itemNo: pn, desc, manufacturer: null, code: null, source: null, status: 'not_found' });
    } else {
      const code = fallbackResult?.code || mapMfrToCode(manufacturer);
      if (!code) {
        unknownMfr.push({ itemNo: pn, manufacturer });
        results.push({ itemNo: pn, desc, manufacturer, code: null, source, status: 'unknown_mfr' });
      } else {
        if (!_skipMfrWrites) {
          try {
            // Ensure manufacturer record exists in BC before patching item
            const mfrChk = await fetch(`${bcODataBase}/Manufacturers?$filter=Code eq '${code}'&$top=1`, { headers: bcHeaders });
            if (mfrChk.ok) {
              const existing = (await mfrChk.json()).value || [];
              if (!existing.length) {
                const mfrEntry = BC_MFR_MAP.find(m => m.code === code);
                const mfrName = mfrEntry ? mfrEntry.terms[0].split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : code;
                await fetch(`${bcODataBase}/Manufacturers`, {
                  method: 'POST', headers: { ...bcHeaders, 'If-Match': '*' },
                  body: JSON.stringify({ Code: code, Name: mfrName }),
                });
              }
            }
            const patchUrl = `${bcODataBase}/ItemCard('${encodeURIComponent(pn)}')`;
            const pr = await fetch(patchUrl, {
              method: 'PATCH',
              headers: { ...bcHeaders, 'If-Match': '*' },
              body: JSON.stringify({ Manufacturer_Code: code }),
            });
            if (pr.ok || pr.status === 204) patched++;
          } catch (e) { /* continue */ }
        }
        results.push({ itemNo: pn, desc, manufacturer, code, source, status: _skipMfrWrites ? 'dry_run' : 'patched' });
      }
    }

    if (i < inputItems.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  return { success: true, found: results.filter(r => r.manufacturer).length, patched, unknownMfr, results };
});

// ── PDF page quality assessment ──
// Inspects a pdf-lib page's XObject resources for scanned/degraded indicators:
// CCITTFaxDecode (fax scans), DCTDecode (embedded JPEG), low-DPI raster images.
function assessPdfPageQuality(pdfPage, context) {
  const result = { isScanned: false, isMonochrome: false, estimatedDpi: null, imageCount: 0, hasVectorText: false, warningLevel: 'none' };
  try {
    const rawRes = pdfPage.node.get(PDFName.of('Resources'));
    if (!rawRes) return result;
    const resDict = rawRes instanceof PDFRef ? context.lookup(rawRes) : rawRes;
    if (!resDict || typeof resDict.get !== 'function') return result;

    const rawFonts = resDict.get(PDFName.of('Font'));
    if (rawFonts) {
      const fontDict = rawFonts instanceof PDFRef ? context.lookup(rawFonts) : rawFonts;
      if (fontDict && typeof fontDict.entries === 'function') {
        result.hasVectorText = [...fontDict.entries()].length > 0;
      }
    }

    const rawXo = resDict.get(PDFName.of('XObject'));
    if (!rawXo) return result;
    const xoDict = rawXo instanceof PDFRef ? context.lookup(rawXo) : rawXo;
    if (!xoDict || typeof xoDict.entries !== 'function') return result;

    const pageSize = pdfPage.getSize();
    for (const [, val] of xoDict.entries()) {
      const obj = val instanceof PDFRef ? context.lookup(val) : val;
      if (!obj || !obj.dict) continue;
      const subtype = obj.dict.get(PDFName.of('Subtype'));
      if (!subtype || subtype.toString() !== '/Image') continue;
      result.imageCount++;
      const filter = obj.dict.get(PDFName.of('Filter'));
      const filterStr = filter ? filter.toString() : '';
      const width = obj.dict.get(PDFName.of('Width'));
      const height = obj.dict.get(PDFName.of('Height'));
      const w = width ? Number(width.toString()) : 0;
      const h = height ? Number(height.toString()) : 0;
      if (filterStr.includes('CCITTFax')) { result.isScanned = true; result.isMonochrome = true; }
      if (filterStr.includes('DCTDecode')) { result.isScanned = true; }
      if (filterStr.includes('FlateDecode') && w > 1000 && h > 1000) { result.isScanned = true; }
      if (w > 0 && pageSize.width > 0) {
        const dpi = Math.round(w / (pageSize.width / 72));
        if (!result.estimatedDpi || dpi < result.estimatedDpi) result.estimatedDpi = dpi;
      }
    }

    if (result.isMonochrome) result.warningLevel = 'high';
    else if (result.isScanned && result.estimatedDpi && result.estimatedDpi < 200) result.warningLevel = 'high';
    else if (result.isScanned) result.warningLevel = 'medium';
  } catch (e) {
    functions.logger.warn('assessPdfPageQuality error', { error: e.message });
  }
  return result;
}

// ── extractBomPage — Server-side BOM extraction (v1.19.981) ──
// Client tries this first via extractBomPageViaServer; falls back to direct
// Anthropic API on error. Accepts native PDF ({pdfPath, pageNumber}) or
// image fallback ({imageBase64, imageMediaType}). Prompt mirrored at
// functions/bomPrompt.js — keep in sync with BOM_PROMPT in src/app.jsx.

exports.extractBomPage = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB', maxInstances: 10 })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const uid = context.auth.uid;
  // B080: retry/backoff budget — 540s function kill minus a 30s margin. The
  // wrapper manages its own per-attempt AbortControllers off this deadline.
  const deadlineMs = Date.now() + 510000;
  const { pdfPath, pageNumber, imageBase64, imageMediaType, feedback, userNotes, regionLearningParts, croppedBomImage, croppedBomMediaType, bomRegion, tiledBomImages, tiledBomMediaType } = data || {};

  const hasPdf = !!(pdfPath && pageNumber != null);
  const hasImage = !!(imageBase64 && imageMediaType);
  const hasCroppedBom = !!(croppedBomImage && croppedBomMediaType);
  // H5 (C49): high-DPI BOM region tiles rendered client-side via pdf.js.
  const hasTiles = Array.isArray(tiledBomImages) && tiledBomImages.length > 0;
  if (hasTiles) {
    if (tiledBomImages.length > 6) {
      throw new functions.https.HttpsError('invalid-argument', `Too many BOM tiles (max 6, got ${tiledBomImages.length})`);
    }
    for (const t of tiledBomImages) {
      if (typeof t !== 'string' || !t.length) {
        throw new functions.https.HttpsError('invalid-argument', 'Each BOM tile must be a non-empty base64 string');
      }
      if (t.length > 7_000_000) {
        throw new functions.https.HttpsError('invalid-argument', 'BOM tile too large (>5MB)');
      }
    }
  }
  if (croppedBomImage && croppedBomImage.length > 7_000_000) {
    throw new functions.https.HttpsError('invalid-argument', 'Cropped BOM image too large (>5MB)');
  }
  if (!hasTiles && !hasCroppedBom && !hasPdf && !hasImage) {
    throw new functions.https.HttpsError('invalid-argument', 'Provide {tiledBomImages}, {croppedBomImage}, {pdfPath, pageNumber}, or {imageBase64, imageMediaType}');
  }

  if (pageNumber != null) {
    const n = Number(pageNumber);
    if (!Number.isInteger(n) || n < 1 || n > 75) {
      throw new functions.https.HttpsError('invalid-argument', `Invalid pageNumber: expected integer 1-75, got ${pageNumber}`);
    }
  }

  if (hasPdf && !pdfPath.startsWith('originalPdfs/')) {
    throw new functions.https.HttpsError('permission-denied', 'Invalid PDF path');
  }

  const apiKey = await resolveAnthropicKey(uid);
  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'No Anthropic API key configured — set one in Settings → API');
  }

  let extractionPath;
  let userContent;
  let pdfQuality = null;
  let _t0, _t1, _t2, _t3, _pdfBufLen, _slicedLen, _pdfWasCropped;

  // Phase 1f: region learning context — STRUCTURAL ONLY (never part-number content).
  // Spliced into ALL extraction paths so 73% of vision-mode projects on pdf-native benefit.
  const regionParts = Array.isArray(regionLearningParts) ? regionLearningParts : [];

  if (hasTiles) {
    // H5 (C48/C49): high-DPI tile path for vision-mode pages. The client rendered
    // the BOM region via pdf.js at a DPI that exactly fills the model's image
    // ceiling per tile — no API downsampling, ~600 effective DPI. No noBomReason
    // escape here: tiles are by definition a known BOM region (#82 P1 rationale).
    extractionPath = 'hi-dpi-tiles';
    const feedbackSection = feedback
      ? `\n\nCORRECTION INSTRUCTIONS FROM USER:\n${feedback}\nApply these corrections carefully and exactly as described.` : '';
    const notesSection = userNotes
      ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}\nKeep these notes in mind while extracting.` : '';
    const tileQualityAlert = `\n\nThis is a HIGH-RESOLUTION render — characters should be legible. Still apply the character-count check to EVERY part number, and for any character that could be B/8, O/0, S/5, I/1, 3/8, G/6, examine the surrounding pattern before committing.\n`;
    const tileIntro = tiledBomImages.length > 1
      ? `These ${tiledBomImages.length} images are OVERLAPPING high-resolution tiles of the SAME BOM table region from a UL508A control panel drawing, split into a grid for resolution. Adjacent tiles overlap by ~5%, so rows or columns near a tile edge may appear in two tiles — extract items from ALL tiles and combine into a single deduplicated result (one entry per itemNo).`
      : `This image is a high-resolution render of the BOM table region from a UL508A control panel drawing.`;
    const pageHint = `${tileIntro} Extract ALL items from this table.${tileQualityAlert}\n\n`;
    const tileBlocks = tiledBomImages.map(t => ({
      type: 'image',
      source: { type: 'base64', media_type: tiledBomMediaType || 'image/jpeg', data: t },
    }));
    userContent = [
      ...regionParts,
      ...tileBlocks,
      { type: 'text', text: pageHint + feedbackSection + notesSection },
    ];
    const tileKB = Math.round(tiledBomImages.reduce((s, t) => s + t.length, 0) * 0.75 / 1024);
    functions.logger.info('extractBomPage using high-DPI tiles (H5)', { uid, tileCount: tiledBomImages.length, totalTileKB: tileKB, pageNumber: pageNumber || null });
  } else if (hasPdf) {
    extractionPath = 'pdf-native';
    const bucket = admin.storage().bucket();
    const file = bucket.file(pdfPath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new functions.https.HttpsError('not-found', `PDF not found: ${pdfPath}`);
    }
    _t0 = Date.now();
    const [buf] = await file.download();
    if (!buf.length) {
      throw new functions.https.HttpsError('failed-precondition', 'PDF file is empty (0 bytes) — re-upload the source PDF.');
    }
    _t1 = Date.now();
    const fullPdf = await PDFDocument.load(buf);
    _t2 = Date.now();
    const totalPages = fullPdf.getPageCount();
    if (pageNumber > totalPages) {
      throw new functions.https.HttpsError('invalid-argument', `Page ${pageNumber} exceeds PDF page count (${totalPages})`);
    }
    const singlePagePdf = await PDFDocument.create();
    const [copiedPage] = await singlePagePdf.copyPages(fullPdf, [pageNumber - 1]);
    singlePagePdf.addPage(copiedPage);

    // PDF-native region crop: if user drew a BOM region, apply CropBox to focus
    // the AI on just the BOM table while preserving native PDF quality.
    // bomRegion = {x, y, w, h} in normalized 0-1 coordinates (origin top-left).
    let pdfCropped = false;
    if (bomRegion && bomRegion.x != null && bomRegion.y != null && bomRegion.w > 0 && bomRegion.h > 0) {
      try {
        const pg = singlePagePdf.getPage(0);
        const { width: pgW, height: pgH } = pg.getSize();
        // Convert normalized coords (origin top-left) to PDF points (origin bottom-left)
        const cropX = Math.round(bomRegion.x * pgW);
        const cropY = Math.round((1 - bomRegion.y - bomRegion.h) * pgH);
        const cropW = Math.round(bomRegion.w * pgW);
        const cropH = Math.round(bomRegion.h * pgH);
        pg.setCropBox(cropX, cropY, cropW, cropH);
        pdfCropped = true;
        functions.logger.info('extractBomPage PDF region crop applied', { cropX, cropY, cropW, cropH, pgW, pgH });
      } catch (cropErr) {
        functions.logger.warn('extractBomPage PDF region crop failed, using full page', { error: cropErr.message });
      }
    }

    const singlePageBytes = await singlePagePdf.save();
    _t3 = Date.now();
    _pdfBufLen = buf.length;
    _slicedLen = singlePageBytes.length;
    _pdfWasCropped = pdfCropped;
    const pdfBase64 = Buffer.from(singlePageBytes).toString('base64');
    pdfQuality = assessPdfPageQuality(fullPdf.getPage(pageNumber - 1), fullPdf.context);
    functions.logger.info('extractBomPage PDF sliced', { totalPages, extractedPage: pageNumber, fullSizeKB: Math.round(buf.length / 1024), slicedSizeKB: Math.round(singlePageBytes.length / 1024), pdfQuality, pdfCropped });

    const feedbackSection = feedback
      ? `\n\nCORRECTION INSTRUCTIONS FROM USER:\n${feedback}\nApply these corrections carefully and exactly as described.` : '';
    const notesSection = userNotes
      ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}\nKeep these notes in mind while extracting. They describe specific characteristics of this drawing set.` : '';
    const qualityAlert = pdfQuality.warningLevel !== 'none'
      ? `\n\n⚠️ SCANNED DOCUMENT ALERT: This page is a ${pdfQuality.isMonochrome ? 'monochrome (black-and-white) fax-quality' : 'scanned'} image at ~${pdfQuality.estimatedDpi || 'unknown'} DPI embedded in a PDF. The BOM table is a bitmap, NOT vector text. Characters WILL be ambiguous.\n\nAPPLY MAXIMUM SCRUTINY:\n- Perform the character-count check on EVERY part number, not just long ones\n- Default ALL rows to confidence "medium" unless the glyph is crystal clear\n- For any character that could be B/8, O/0, S/5, I/1 — examine the surrounding pattern for clues\n- Count total BOM rows TWICE before starting extraction — scanned tables are easy to under-count\n- If the BOM spans multiple image regions on this page, explicitly note how many sections you found\n` : '';
    const cropHintText = pdfCropped ? 'This PDF has been cropped to show ONLY the BOM table region. ' : '';
    // FIX(#82 P1): When CropBox is applied, we KNOW there's a BOM region — don't offer the
    // noBomReason escape. On scanned monochrome PDFs, the model takes the easy out ("no BOM
    // here") instead of trying to parse the bitmap. Removing the escape forces extraction.
    // Keep the escape for uncropped pages where the model genuinely needs to classify.
    const noBomEscape = pdfCropped ? '' : ' If this page does not contain a BOM table, return {"items":[],"questions":[],"noBomReason":"wrong-page-type"}.';
    const pageHint = `${cropHintText}Extract ALL Bill of Materials (BOM) items from this page.${qualityAlert}${noBomEscape}\n\n`;

    userContent = [
      ...regionParts,
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
      { type: 'text', text: pageHint + feedbackSection + notesSection },
    ];
  } else if (hasCroppedBom) {
    extractionPath = 'bom-region-crop';
    const feedbackSection = feedback
      ? `\n\nCORRECTION INSTRUCTIONS FROM USER:\n${feedback}\nApply these corrections carefully and exactly as described.` : '';
    const notesSection = userNotes
      ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}\nKeep these notes in mind while extracting.` : '';
    // FIX(#82 P2): Add scan quality alert to crop fallback — was missing, causing garbled PNs
    const cropQualityAlert = `\n\n⚠️ SCANNED IMAGE ALERT: This is a cropped image from a scanned drawing. Characters WILL be ambiguous. APPLY MAXIMUM SCRUTINY:\n- Perform the character-count check on EVERY part number\n- Default ALL rows to confidence "medium" unless every glyph is crystal clear\n- For any character that could be B/8, O/0, S/5, I/1, 3/8, G/6 — examine the surrounding pattern\n- Count total BOM rows TWICE before starting extraction\n`;
    const pageHint = `This image is a CROPPED region showing ONLY the BOM table from a UL508A control panel drawing. Extract ALL items from this table.${cropQualityAlert}\n\n`;
    userContent = [
      ...regionParts,
      { type: 'image', source: { type: 'base64', media_type: croppedBomMediaType, data: croppedBomImage } },
      { type: 'text', text: pageHint + feedbackSection + notesSection },
    ];
    functions.logger.info('extractBomPage using cropped BOM region (PDF unavailable)', { uid, croppedSizeKB: Math.round(croppedBomImage.length * 0.75 / 1024) });
  } else {
    extractionPath = 'image-fallback';
    const feedbackSection = feedback
      ? `\n\nCORRECTION INSTRUCTIONS FROM USER:\n${feedback}\nApply these corrections carefully and exactly as described.` : '';
    const notesSection = userNotes
      ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}\nKeep these notes in mind while extracting. They describe specific characteristics of this drawing set.` : '';

    userContent = [
      ...regionParts,
      { type: 'image', source: { type: 'base64', media_type: imageMediaType, data: imageBase64 } },
      { type: 'text', text: feedbackSection + notesSection },
    ];
  }

  functions.logger.info('extractBomPage starting', { uid, extractionPath, hasPdf, pageNumber: pageNumber || null });

  const t4 = Date.now();
  let response;
  try {
    // B080: route through the deadline-aware retry wrapper. Keep the
    // interleaved-thinking beta header via extraHeaders. The wrapper owns the
    // per-attempt AbortController + dispatcher.
    response = await anthropicFetchWithRetry({
      model: ANTHROPIC_MODELS.OPUS,
      max_tokens: 64000,
      // H5/Opus 4.8: adaptive thinking only — {type:'enabled', budget_tokens} returns 400 on 4.7+.
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: BOM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userContent }],
    }, apiKey, {
      deadlineMs,
      extraHeaders: { 'anthropic-beta': 'interleaved-thinking-2025-05-14' },
      label: 'extractBomPage',
    });
  } catch (fetchErr) {
    const isTimeout = fetchErr.name === 'AbortError' || fetchErr.cause?.code === 'UND_ERR_HEADERS_TIMEOUT';
    functions.logger.error('extractBomPage API timeout/network error', { uid, extractionPath, pageNumber: pageNumber || null, error: fetchErr.message, isTimeout });
    throw new functions.https.HttpsError('deadline-exceeded', `Anthropic API ${isTimeout ? 'timed out' : 'network error'}: ${fetchErr.message}`);
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    functions.logger.error('extractBomPage Anthropic API error', { status: response.status, error: errBody.error?.message });
    throw new functions.https.HttpsError('internal', `Anthropic API error: ${response.status} — ${errBody.error?.message || 'unknown'}`);
  }

  const t5 = Date.now();
  const result = await response.json();
  const raw = (result.content || []).find(b => b.type === 'text')?.text || '';
  const modelUsed = result.model || ANTHROPIC_MODELS.OPUS;
  const stopReason = result.stop_reason || 'unknown';

  if (_t0) {
    functions.logger.info('extractBomPage timing', {
      uid, extractionPath,
      downloadMs: _t1 - _t0, parseMs: _t2 - _t1, sliceMs: _t3 - _t2,
      promptMs: t4 - _t3, apiMs: t5 - t4, totalMs: t5 - _t0,
      pdfSizeKB: Math.round(_pdfBufLen / 1024),
      slicedSizeKB: Math.round(_slicedLen / 1024),
      pdfCropped: _pdfWasCropped
    });
  }

  functions.logger.info('extractBomPage complete', { uid, extractionPath, rawChars: raw.length, modelUsed, stopReason });

  recordAnthropicUsage(uid, modelUsed, result.usage).catch(() => {});
  warnAdminsTokenUsage(uid, 'extractBomPage', result.usage, 64000).catch(() => {});

  return { raw, extractionPath, modelUsed, stopReason, usage: result.usage || {}, pdfQuality };
});

// ── checkPdfQuality — Lightweight pre-flight quality check (v1.20.15) ──
// Downloads the PDF and inspects page XObject resources for scan quality
// indicators. Returns in 1-2 seconds — no AI call. Client uses this to
// show a warning before the slow extraction call starts.
exports.checkPdfQuality = functions
  .runWith({ timeoutSeconds: 30, memory: '512MB', maxInstances: 10 })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const { pdfPath, pageNumbers } = data || {};
  if (!pdfPath || !pdfPath.startsWith('originalPdfs/')) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid pdfPath required');
  }
  if (!Array.isArray(pageNumbers) || pageNumbers.length === 0 || pageNumbers.length > 30) {
    throw new functions.https.HttpsError('invalid-argument', 'pageNumbers must be 1-30 entries');
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(pdfPath);
  const [exists] = await file.exists();
  if (!exists) return { quality: [] };
  const [buf] = await file.download();
  const fullPdf = await PDFDocument.load(buf);
  const totalPages = fullPdf.getPageCount();

  const quality = pageNumbers.map(pn => {
    const n = Number(pn);
    if (!Number.isInteger(n) || n < 1 || n > totalPages) return { pageNumber: n, error: 'invalid' };
    return { pageNumber: n, ...assessPdfPageQuality(fullPdf.getPage(n - 1), fullPdf.context) };
  });

  return { quality, totalPages, pdfSizeKB: Math.round(buf.length / 1024) };
});

// ── extractBomBatch — Batch BOM extraction (v1.20.5) ──
// Downloads the PDF ONCE and extracts multiple pages in parallel, eliminating
// the per-page PDF download overhead that caused repeated deadline-exceeded
// timeouts on large drawing packages (e.g. 23-page PDF with 11 BOM pages).
// Client sends all BOM pages in one call; server fans out Anthropic calls
// with controlled concurrency. Falls back gracefully: pages that fail
// individually still return in the results array with an error field.

exports.extractBomBatch = functions
  .runWith({ timeoutSeconds: 540, memory: '2GB', maxInstances: 5 })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const uid = context.auth.uid;
  // B080: single shared retry/backoff budget for the whole batch — 540s kill
  // minus a 30s margin. All concurrent workers race the same wall-clock
  // deadline, so a page that starts late naturally gets less retry room.
  const deadlineMs = Date.now() + 510000;
  const { pdfPath, pages, feedback, userNotes } = data || {};

  if (!pdfPath || !pdfPath.startsWith('originalPdfs/')) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid pdfPath required');
  }
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 20) {
    throw new functions.https.HttpsError('invalid-argument', 'pages must be an array of 1-20 entries');
  }
  for (const pg of pages) {
    const n = Number(pg.pageNumber);
    if (!Number.isInteger(n) || n < 1 || n > 75) {
      throw new functions.https.HttpsError('invalid-argument', `Invalid pageNumber: ${pg.pageNumber}`);
    }
  }

  const apiKey = await resolveAnthropicKey(uid);
  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'No Anthropic API key configured');
  }

  // Download PDF once
  const bucket = admin.storage().bucket();
  const file = bucket.file(pdfPath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new functions.https.HttpsError('not-found', `PDF not found: ${pdfPath}`);
  }
  const [buf] = await file.download();
  if (!buf.length) {
    throw new functions.https.HttpsError('failed-precondition', 'PDF file is empty (0 bytes) — re-upload the source PDF.');
  }
  const fullPdf = await PDFDocument.load(buf);
  const totalPages = fullPdf.getPageCount();
  functions.logger.info('extractBomBatch PDF loaded', { uid, pdfPath, totalPages, pdfSizeKB: Math.round(buf.length / 1024), requestedPages: pages.length });

  const feedbackSection = feedback
    ? `\n\nCORRECTION INSTRUCTIONS FROM USER:\n${feedback}\nApply these corrections carefully and exactly as described.` : '';
  const notesSection = userNotes
    ? `\n\nUSER NOTES ABOUT THESE DRAWINGS:\n${userNotes}\nKeep these notes in mind while extracting. They describe specific characteristics of this drawing set.` : '';
  // FIX(#82 P1): noBomReason escape built per-page below — only offered when uncropped
  const pageHintBase = `Extract ALL Bill of Materials (BOM) items from this page.`;
  const noBomEscapeText = ` If this page does not contain a BOM table, return {"items":[],"questions":[],"noBomReason":"wrong-page-type"}.`;

  // Process pages with controlled concurrency
  // B080: 4→3 — worst-case concurrent Opus calls drop from 5×4=20 to 5×3=15,
  // easing the org rate-limit pool with negligible throughput loss.
  const CONCURRENCY = 3;
  const results = new Array(pages.length);
  let idx = 0;
  let totalUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };

  const workers = Array.from({ length: Math.min(CONCURRENCY, pages.length) }, async () => {
    while (idx < pages.length) {
      const i = idx++;
      const pg = pages[i];
      const pageNumber = Number(pg.pageNumber);
      try {
        // Slice single page from already-loaded PDF
        if (pageNumber > totalPages) {
          results[i] = { pageNumber, error: `Page ${pageNumber} exceeds PDF page count (${totalPages})` };
          continue;
        }
        const singlePagePdf = await PDFDocument.create();
        const [copiedPage] = await singlePagePdf.copyPages(fullPdf, [pageNumber - 1]);
        singlePagePdf.addPage(copiedPage);

        // PDF-native region crop for batch
        let batchPdfCropped = false;
        const pgRegion = pg.bomRegion;
        if (pgRegion && pgRegion.x != null && pgRegion.y != null && pgRegion.w > 0 && pgRegion.h > 0) {
          try {
            const spg = singlePagePdf.getPage(0);
            const { width: pgW, height: pgH } = spg.getSize();
            const cropX = Math.round(pgRegion.x * pgW);
            const cropY = Math.round((1 - pgRegion.y - pgRegion.h) * pgH);
            const cropW = Math.round(pgRegion.w * pgW);
            const cropH = Math.round(pgRegion.h * pgH);
            spg.setCropBox(cropX, cropY, cropW, cropH);
            batchPdfCropped = true;
          } catch (cropErr) {
            functions.logger.warn('extractBomBatch PDF region crop failed', { pageNumber, error: cropErr.message });
          }
        }

        const singlePageBytes = await singlePagePdf.save();
        const pdfBase64 = Buffer.from(singlePageBytes).toString('base64');
        const pgQuality = assessPdfPageQuality(fullPdf.getPage(pageNumber - 1), fullPdf.context);

        // Build user content — cropped BOM image if provided AND no PDF, otherwise PDF
        let userContent;
        let extractionPath;
        if (pg.croppedBomImage && !pdfBase64) {
          extractionPath = 'bom-region-crop';
          const cropHint = `This image is a CROPPED region showing ONLY the BOM table from a UL508A control panel drawing. Extract ALL items from this table.\n\n`;
          userContent = [
            { type: 'image', source: { type: 'base64', media_type: pg.croppedBomMediaType || 'image/jpeg', data: pg.croppedBomImage } },
            { type: 'text', text: cropHint + feedbackSection + notesSection },
          ];
        } else {
          extractionPath = 'pdf-native';
          const batchQualityAlert = pgQuality.warningLevel !== 'none'
            ? `\n\n⚠️ SCANNED DOCUMENT ALERT: This page is a ${pgQuality.isMonochrome ? 'monochrome (black-and-white) fax-quality' : 'scanned'} image at ~${pgQuality.estimatedDpi || 'unknown'} DPI. Characters WILL be ambiguous. Default ALL rows to confidence "medium" unless every glyph is crystal clear. Perform character-count checks on EVERY part number.\n` : '';
          const batchCropHint = batchPdfCropped ? 'This PDF has been cropped to show ONLY the BOM table region. ' : '';
          const batchPageHint = `${pageHintBase}${batchPdfCropped ? '' : noBomEscapeText}\n\n`;
          userContent = [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: batchCropHint + batchPageHint + batchQualityAlert + (pg.notes ? `\n\n${pg.notes}` : '') + feedbackSection + notesSection },
          ];
        }

        let response;
        try {
          // B080: deadline-aware retry wrapper, sharing the batch-wide deadline.
          response = await anthropicFetchWithRetry({
            model: ANTHROPIC_MODELS.OPUS,
            max_tokens: 64000,
            // H5/Opus 4.8: adaptive thinking only — {type:'enabled', budget_tokens} returns 400 on 4.7+.
            thinking: { type: 'adaptive' },
            system: [{ type: 'text', text: BOM_PROMPT, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content: userContent }],
          }, apiKey, {
            deadlineMs,
            extraHeaders: { 'anthropic-beta': 'interleaved-thinking-2025-05-14' },
            label: `extractBomBatch p${pageNumber}`,
          });
        } catch (fetchErr) {
          const isTimeout = fetchErr.name === 'AbortError' || fetchErr.cause?.code === 'UND_ERR_HEADERS_TIMEOUT';
          functions.logger.error('extractBomBatch page API timeout', { uid, pageNumber: pg.pageNumber, error: fetchErr.message, isTimeout });
          // B080 latent-bug fix: was `pageResults.push(...)` (undefined var →
          // ReferenceError → dead branch). Correct sink is `results[i]`.
          results[i] = { pageNumber, error: `API ${isTimeout ? 'timeout' : 'network error'}: ${fetchErr.message}`, extractionPath };
          continue;
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          functions.logger.error('extractBomBatch page error', { pageNumber, status: response.status, error: errBody.error?.message });
          results[i] = { pageNumber, error: `API error: ${response.status} — ${errBody.error?.message || 'unknown'}`, extractionPath };
          continue;
        }

        const result = await response.json();
        const raw = (result.content || []).find(b => b.type === 'text')?.text || '';
        const modelUsed = result.model || ANTHROPIC_MODELS.OPUS;
        const stopReason = result.stop_reason || 'unknown';
        const usage = result.usage || {};

        // Accumulate usage
        totalUsage.input_tokens += usage.input_tokens || 0;
        totalUsage.output_tokens += usage.output_tokens || 0;
        totalUsage.cache_creation_input_tokens += usage.cache_creation_input_tokens || 0;
        totalUsage.cache_read_input_tokens += usage.cache_read_input_tokens || 0;

        recordAnthropicUsage(uid, modelUsed, usage).catch(() => {});

        results[i] = { pageNumber, raw, extractionPath, modelUsed, stopReason, usage, pdfQuality: pgQuality };
      } catch (pageErr) {
        functions.logger.error('extractBomBatch page exception', { pageNumber, error: pageErr.message });
        results[i] = { pageNumber, error: pageErr.message };
      }
    }
  });

  await Promise.all(workers);

  warnAdminsTokenUsage(uid, 'extractBomBatch', totalUsage, 64000 * pages.length).catch(() => {});

  functions.logger.info('extractBomBatch complete', {
    uid, pdfPath, pagesRequested: pages.length,
    pagesSucceeded: results.filter(r => r && r.raw).length,
    pagesFailed: results.filter(r => r && r.error).length,
  });

  return { results, pdfPath, totalPages };
});

// ── monitorAnthropicModels — Daily synthetic probe of model aliases ──
// Detects deprecation/outage before it breaks production extraction.
// Uses ANTHROPIC_API_KEY env var (not a user key) so it runs unattended.

exports.monitorAnthropicModels = functions
  .runWith({ timeoutSeconds: 60, memory: '256MB', maxInstances: 1 })
  .pubsub.schedule('every day 06:00')
  .timeZone('America/Denver')
  .onRun(async () => {
  if (!ANTHROPIC_API_KEY) {
    functions.logger.warn('monitorAnthropicModels skipped: ANTHROPIC_API_KEY not set');
    return null;
  }

  const results = [];
  for (const model of MONITORED_MODELS) {
    const t0 = Date.now();
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
      });
      const elapsed = Date.now() - t0;
      if (resp.ok) {
        results.push({ model, status: 'ok', elapsed });
        functions.logger.info(`monitorAnthropicModels: ${model} OK (${elapsed}ms)`);
      } else {
        const body = await resp.json().catch(() => ({}));
        results.push({ model, status: 'error', httpStatus: resp.status, error: body.error?.message, elapsed });
        functions.logger.error(`monitorAnthropicModels: ${model} FAILED`, { httpStatus: resp.status, error: body.error?.message, elapsed });
      }
    } catch (e) {
      const elapsed = Date.now() - t0;
      results.push({ model, status: 'error', error: e.message, elapsed });
      functions.logger.error(`monitorAnthropicModels: ${model} EXCEPTION`, { error: e.message, elapsed });
    }
  }

  const failures = results.filter(r => r.status !== 'ok');
  if (failures.length > 0) {
    const lines = failures.map(f => `- **${f.model}**: ${f.error || `HTTP ${f.httpStatus}`}`);

    // Teams webhook (existing)
    if (TEAMS_WEBHOOK_URL) {
      try {
        await fetch(TEAMS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `⚠️ **Anthropic Model Monitor** — ${failures.length} model(s) failed:\n${lines.join('\n')}`,
          }),
        });
      } catch (e) {
        functions.logger.warn('monitorAnthropicModels: Teams webhook post failed', { error: e.message });
      }
    }

    // DECISION(v1.20.1): Email alert to all company admins on model probe failure.
    // The daily monitor runs at 6 AM MDT — gives the admin time to update models.js
    // before the workday starts. Uses the ANTHROPIC_API_KEY owner's profile to find
    // the company; falls back to direct email to jon@matrixpci.com if no company found.
    if (SENDGRID_KEY) {
      try {
        const now = new Date().toLocaleString('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        const failRows = failures.map(f =>
          `<tr><td style="padding:4px 10px;border-bottom:1px solid #fde68a;font-family:ui-monospace,monospace;font-size:12px">${f.model}</td>` +
          `<td style="padding:4px 10px;border-bottom:1px solid #fde68a;color:${f.httpStatus === 404 ? '#dc2626' : '#92400e'}">${f.httpStatus ? `HTTP ${f.httpStatus}` : 'Exception'}</td>` +
          `<td style="padding:4px 10px;border-bottom:1px solid #fde68a;font-size:12px">${f.error || '—'}</td></tr>`
        ).join('');
        const okModels = results.filter(r => r.status === 'ok').map(r => r.model).join(', ') || 'none';
        const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1e293b">
          <h2 style="color:#dc2626;margin:0 0 8px 0;font-size:20px">🚨 Anthropic Model Monitor — ${failures.length} Failure${failures.length > 1 ? 's' : ''}</h2>
          <p style="color:#64748b;margin:0 0 16px 0;font-size:13px">Daily probe at ${now} MDT detected model issues. Affected models may break AI extraction if not updated.</p>
          <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:16px">
            <thead><tr style="background:#fef3c7"><th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400e">Model</th><th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400e">Status</th><th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#92400e">Error</th></tr></thead>
            <tbody>${failRows}</tbody>
          </table>
          <p style="font-size:12px;color:#64748b;margin:0 0 8px">Models passing: <strong>${okModels}</strong></p>
          <p style="font-size:13px;color:#1e293b;line-height:1.6"><strong>Action:</strong> If the failed model is used in production, update <code>functions/models.js</code> and redeploy. The supplier portal has automatic 404 fallback, but BOM extraction may need a manual fix.</p>
          <p style="color:#94a3b8;font-size:11px;margin-top:24px">MatrixARC daily model monitor · runs 6 AM MDT</p>
        </div>`;

        // Find admin emails — try company lookup, fall back to hardcoded
        let adminEmails = [];
        try {
          // Scan all companies for admin members (monitor uses env key, not a user key)
          const companiesSnap = await db.collectionGroup('members').where('role', '==', 'admin').limit(20).get();
          const uidSet = new Set();
          companiesSnap.docs.forEach(d => uidSet.add(d.id));
          for (const aUid of uidSet) {
            try { const u = await admin.auth().getUser(aUid); if (u.email) adminEmails.push(u.email); } catch (_) {}
          }
        } catch (_) {}
        if (!adminEmails.length) adminEmails = ['jon@matrixpci.com'];

        for (const email of adminEmails) {
          await sgMail.send({
            to: email,
            from: 'sales@matrixpci.com',
            subject: `🚨 ARC Model Monitor: ${failures.length} model${failures.length > 1 ? 's' : ''} failed`,
            html,
          });
        }
        functions.logger.info(`monitorAnthropicModels: emailed ${adminEmails.length} admin(s)`);
      } catch (e) {
        functions.logger.warn('monitorAnthropicModels: email alert failed', { error: e.message });
      }
    }
  }

  return null;
});

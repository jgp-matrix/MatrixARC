const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

admin.initializeApp();

const { runCodaleScrape } = require('./codaleScheduler');
const { scrapeBatch: codaleScrapeBatch } = require('./codaleScraper');
const { mouserSearchPart, mouserSearchBatch } = require('./mouserApi');
const { digikeySearchPart, digikeySearchBatch } = require('./digikeyApi');

// Purchasing module functions
const purchasing = require('./purchasing');
exports.poCreateOrder = purchasing.createPurchaseOrder;
exports.poUpdateStatus = purchasing.updatePurchaseOrderStatus;

// Engineering module functions
const engineering = require('./engineering');
exports.onCustomerReviewSubmitted = engineering.onCustomerReviewSubmitted;
exports.engSendReviewEmail = engineering.sendReviewEmail;

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
const MOUSER_API_KEY = process.env.MOUSER_API_KEY || '';
const DIGIKEY_CLIENT_ID = process.env.DIGIKEY_CLIENT_ID || '';
const DIGIKEY_CLIENT_SECRET = process.env.DIGIKEY_CLIENT_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://matrix-arc.web.app';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';
if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

const db = admin.firestore();

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
exports.testTeamsWebhook = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  await postToTeams({
    title: 'MatrixARC Test',
    body: 'Teams webhook is working!',
    url: APP_URL,
    facts: [{ name: 'Triggered by', value: context.auth.token.email || context.auth.uid }],
  });
  return { success: true };
});

// ── TEAM MANAGEMENT ──

exports.inviteTeamMember = functions.https.onCall(async (data, context) => {
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

exports.acceptTeamInvite = functions.https.onCall(async (data, context) => {
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

exports.removeTeamMember = functions.https.onCall(async (data, context) => {
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

  await admin.firestore().doc(`companies/${companyId}/members/${targetUid}`).delete();
  return { success: true };
});

exports.updateMemberRole = functions.https.onCall(async (data, context) => {
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

// DECISION(v1.19.404): Added auth check — previously missing, allowing unauthenticated email sends.
exports.sendInviteEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { to, inviteUrl, role } = data;
  if (!to || !inviteUrl) throw new functions.https.HttpsError('invalid-argument', 'Missing fields');
  if (!SENDGRID_KEY) throw new functions.https.HttpsError('failed-precondition', 'Email not configured');

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

    const uid = after.uid;
    const projectName = after.projectName || '';
    const vendorName = after.vendorName || 'Supplier';
    const rfqNum = after.rfqNum || '';
    const token = context.params.token;

    // Create notification
    const notifBody = `${vendorName} submitted a quote${projectName ? ` for "${projectName}"` : ''}${rfqNum ? ` (${rfqNum})` : ''}.`;
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

// ── USER-REPORTED ISSUE NOTIFICATIONS ──
// DECISION(v1.19.594): When a user clicks "Report Issue", notify all admins of the
// company via in-app bell, push, email, and Teams. Only fires for severity='user_reported'
// so we don't spam for auto-captured console errors (those are visible in-app only).

exports.onIssueReported = functions.firestore
  .document('companies/{companyId}/debugLogs/{logId}')
  .onCreate(async (snap, context) => {
    const entry = snap.data() || {};
    if (entry.severity !== 'user_reported') return null;

    const companyId = context.params.companyId;
    const logId = context.params.logId;
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

exports.sendEngineerQuestionEmail = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  if (!SENDGRID_KEY) throw new functions.https.HttpsError('failed-precondition', 'Email not configured');
  const { to, projectName, bcProjectNumber, panelName, questions, recipientUid } = data;
  if (!to || !questions?.length) throw new functions.https.HttpsError('invalid-argument', 'Missing recipient or questions');

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

exports.extractSupplierQuotePricing = functions.runWith({ timeoutSeconds: 120, memory: '512MB' }).https.onCall(async (data, context) => {
  const { token, pageImages } = data;
  if (!token || !Array.isArray(pageImages) || !pageImages.length) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing token or images');
  }

  // Validate token
  const tokenDoc = await admin.firestore().collection('rfqUploads').doc(token).get();
  if (!tokenDoc.exists) throw new functions.https.HttpsError('not-found', 'Invalid token');
  const tokenData = tokenDoc.data();
  if ((tokenData.expiresAt || 0) < Date.now()) throw new functions.https.HttpsError('failed-precondition', 'Token expired');

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

  const messageContent = [
    ...pageImages.slice(0, 20).map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: img }
    })),
    {
      type: 'text',
      text: `Extract pricing from this supplier quote. ${lineItems.length} items were requested:\n\n${itemList}\n\nCRITICAL OCR RULES — READ CAREFULLY:\n- Read each character on the PDF very carefully. Common OCR mistakes: K↔R, B↔R, S↔5, 0↔O, I↔1, U↔V. Double-check every character against the PDF.\n- "supplierPartNumber" = the part# EXACTLY as printed on the supplier's PDF. Copy character by character. Do NOT guess or autocorrect.\n- If the supplier quoted an ALTERNATE or SUBSTITUTE part (different part number than requested), capture it in "supplierPartNumber" and set confidence to "alternate".\n\nMATCHING RULES:\n- Ignore spaces, dashes, case: "ARL 449" = "ARL449"\n- Strip manufacturer prefixes: "HOFF CEL550M" → "CEL550M"\n- Substring match: requested part# inside supplier part# = match\n- Match by description if part numbers differ but item is clearly the same\n- "partNumber" = ALWAYS use the exact part# from the requested list above (never the supplier's version)\n- "supplierPartNumber" = part# exactly as printed on supplier's quote (may differ from requested)\n- "supplierLineNumber" = line/item number from the supplier's quote document\n- Confidence: "high" = exact match, "medium" = fuzzy/prefix match, "alternate" = supplier quoted a different part as substitute, "low" = uncertain, "unmatched" = supplier item not matching any request\n\nNOTES — VERY IMPORTANT:\n- "notes" = capture ANY notes, comments, remarks, conditions, or annotations the supplier wrote for each line item. This includes: lead time notes, minimum order quantities, special conditions, "call for pricing", "alternate suggested", obsolete warnings, etc.\n- Also capture any general notes at the top or bottom of the quote in the header "notes" field.\n\nYou MUST return one entry per requested item (${lineItems.length} total). Also include extra supplier items not matching any request (partNumber=null, confidence="unmatched").\n\nReturn ONLY JSON:\n{"header":{"supplierName":null,"quoteNumber":null,"revisionNumber":null,"quoteDate":null,"updatedOn":null,"expiresOn":null,"jobName":null,"contactName":null,"customerPO":null,"customerPODate":null,"fob":null,"freight":null,"notes":null},"lineItems":[{"partNumber":"...","supplierPartNumber":"...","supplierLineNumber":"1","unitPrice":0.00,"leadTimeDays":null,"confidence":"high","notes":""}]}\n\nSet unitPrice to null if not found. Convert lead time weeks to days (*7). Look for "ARO", "days ARO", "weeks", "delivery". Set header fields to null if not found. Dates as YYYY-MM-DD.`
    }
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 16000,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!response.ok) {
    throw new functions.https.HttpsError('internal', `AI API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || '{}';
  // DECISION(v1.19.664): Log only length — no content preview. Previously the first 300 chars
  // of the AI response were logged to Cloud Logging on every call, which leaks the parsed
  // supplier part numbers / pricing data into log infrastructure. Length alone is enough to
  // detect truncation issues without exposing the content.
  functions.logger.info('extractSupplierQuotePricing AI response length:', text.length);

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
exports.codaleRunScrape = functions.runWith({ timeoutSeconds: 540, memory: '2GB' }).https.onCall(async (data, context) => {
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
exports.codaleScheduledScrape = functions.runWith({ timeoutSeconds: 540, memory: '2GB' }).pubsub
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
exports.diagnoseMemberApiKey = functions.https.onCall(async (data, context) => {
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
exports.codaleTestScrape = functions.runWith({ timeoutSeconds: 300, memory: '2GB' }).https.onCall(async (data, context) => {
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

exports.customScraperLookup = functions.runWith({ timeoutSeconds: 300, memory: '2GB' }).https.onCall(async (data, context) => {
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
exports.customScraperBatch = functions.runWith({ timeoutSeconds: 540, memory: '2GB' }).https.onCall(async (data, context) => {
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
exports.mouserSearch = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).https.onCall(async (data, context) => {
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
exports.digikeySearch = functions.runWith({ timeoutSeconds: 120, memory: '256MB' }).https.onCall(async (data, context) => {
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
exports.searchVendorPricing = functions.runWith({ timeoutSeconds: 300, memory: '512MB' }).https.onCall(async (data, context) => {
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
  {code:'PHX',terms:['phoenix contact','phoenix','phoenixcontact']},
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

exports.bulkMfrList = functions.runWith({
  timeoutSeconds: 300,
  memory: '256MB',
}).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { bcToken, bcODataBase } = data || {};
  if (!bcToken || !bcODataBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken and bcODataBase required');

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
}).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

  const { bcToken, bcODataBase, dryRun = true, items: inputItems } = data || {};
  if (!bcToken || !bcODataBase) throw new functions.https.HttpsError('invalid-argument', 'bcToken and bcODataBase required');
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
        if (!dryRun) {
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
        results.push({ itemNo: pn, desc, manufacturer, code, source, status: dryRun ? 'dry_run' : 'patched' });
      }
    }

    if (i < inputItems.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  return { success: true, found: results.filter(r => r.manufacturer).length, patched, unknownMfr, results };
});

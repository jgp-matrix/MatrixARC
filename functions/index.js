const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

admin.initializeApp();

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
const APP_URL = process.env.APP_URL || 'https://matrix-arc.web.app';
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

exports.sendInviteEmail = functions.https.onCall(async (data, context) => {
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

    // Send emails if SendGrid configured
    if (!SENDGRID_KEY) return null;

    // 1) Notify ARC user
    try {
      const userRecord = await admin.auth().getUser(uid);
      const userEmail = userRecord.email;
      if (userEmail) {
        await sgMail.send({
          to: userEmail,
          from: 'sales@matrixpci.com',
          subject: `New Supplier Quote: ${vendorName}${rfqNum ? ' — ' + rfqNum : projectName ? ' — ' + projectName : ''}`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#1e293b;margin-bottom:8px">New Supplier Quote Received</h2>
            <p style="color:#64748b;margin-bottom:16px"><strong>${vendorName}</strong> has submitted a quote${projectName ? ` for <strong>${projectName}</strong>` : ''}${rfqNum ? ` (RFQ: ${rfqNum})` : ''}.</p>
            <a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:700;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">Open ARC to Review &#x2192;</a>
            <p style="color:#94a3b8;font-size:12px;margin-top:24px">Log in to ARC and click the notification bell 🔔 to review and approve the quote.</p>
          </div>`,
        });
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
      text: `Extract pricing from this supplier quote. ${lineItems.length} items were requested:\n\n${itemList}\n\nMATCHING RULES:\n- Ignore spaces, dashes, case: "ARL 449" = "ARL449", "CEL-550M" = "CEL550M"\n- Strip manufacturer prefixes: "HOFF CEL550M" → base "CEL550M" matches "CEL550M"\n- Substring match: if requested part# appears inside supplier part#, it's a match\n- Match by description if part numbers differ but item is clearly the same\n- "partNumber" = ALWAYS use the exact part# from the requested list above\n- "supplierPartNumber" = part# exactly as printed on supplier's quote\n- "supplierLineNumber" = line/item number from the supplier's quote document (e.g. "1", "2", "001")\n- Confidence: "high" = exact match, "medium" = fuzzy/prefix match, "low" = uncertain, "unmatched" = supplier item not matching any request\n\nYou MUST return one entry per requested item (${lineItems.length} total). Also include extra supplier quote items not matching any request (partNumber=null, confidence="unmatched").\n\nReturn ONLY JSON:\n{"header":{"supplierName":null,"quoteNumber":null,"revisionNumber":null,"quoteDate":null,"updatedOn":null,"expiresOn":null,"jobName":null,"contactName":null,"customerPO":null,"customerPODate":null,"fob":null,"freight":null},"lineItems":[{"partNumber":"...","supplierPartNumber":"...","supplierLineNumber":"1","unitPrice":0.00,"leadTimeDays":null,"confidence":"high","notes":""}]}\n\nSet unitPrice to null if not found. Convert lead time weeks to days (*7). Look for "ARO", "days ARO", "weeks", "delivery". Set header fields to null if not found. Dates as YYYY-MM-DD.`
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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16000,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!response.ok) {
    throw new functions.https.HttpsError('internal', `AI API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || '{}';
  functions.logger.info('extractSupplierQuotePricing AI response length:', text.length, 'preview:', text.slice(0, 300));

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
    functions.logger.warn('extractSupplierQuotePricing JSON parse failed:', e.message, 'raw:', text.slice(0, 500));
    extracted = [];
  }

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
  } catch (e) {
    functions.logger.warn('Cross-ref enrichment failed:', e.message);
  }

  // Validation: log count comparison
  const matchedCount = extracted.filter(e => e.partNumber && e.confidence !== 'unmatched').length;
  const unmatchedCount = extracted.filter(e => e.confidence === 'unmatched').length;
  functions.logger.info(`extractSupplierQuotePricing: requested=${lineItems.length}, matched=${matchedCount}, unmatched_supplier_items=${unmatchedCount}, total_extracted=${extracted.length}`);

  return { extracted, quoteHeader, summary: summary || { requestedCount: lineItems.length, matchedCount, unmatchedSupplierItems: unmatchedCount } };
});

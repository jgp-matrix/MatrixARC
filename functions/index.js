const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

admin.initializeApp();

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
const APP_URL = process.env.APP_URL || 'https://matrix-arc.web.app';
if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

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
    from: 'noreply@matrix-arc.web.app',
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
    ...pageImages.slice(0, 8).map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: img }
    })),
    {
      type: 'text',
      text: `You are extracting pricing and lead times from a supplier quote document. The following items were requested:\n\n${itemList}\n\nExtract the unit price and lead time (in calendar days) for each item from the quote images. Match items by part number. Return ONLY a JSON array with no other text:\n[{"partNumber":"...","unitPrice":number_or_null,"leadTimeDays":number_or_null,"confidence":"high|medium|low","notes":"..."}]\n\nSet unitPrice to null if price not clearly found. Set leadTimeDays to null if not stated. Look for lead time phrasing like "ARO", "days ARO", "weeks", "delivery", "lead time". Convert weeks to days (multiply by 7). Use exact part numbers from the list above.`
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
      max_tokens: 2000,
      messages: [{ role: 'user', content: messageContent }],
    }),
  });

  if (!response.ok) {
    throw new functions.https.HttpsError('internal', `AI API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.content?.[0]?.text || '[]';

  let extracted = [];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    extracted = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    if (!Array.isArray(extracted)) extracted = [];
  } catch (e) {
    extracted = [];
  }

  return { extracted };
});

/**
 * ARC Purchasing Module — Cloud Functions
 *
 * Purchase Order management functions for the ARC Purchasing module.
 * These are imported and re-exported from the main functions/index.js.
 *
 * Data paths:
 *   - companies/{companyId}/purchaseOrders/{poId}
 *   - companies/{companyId}/purchaseOrders/{poId}/lines/{lineId}
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Ensure admin is initialized (main index.js does this, but safe to check)
if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

/**
 * Create a new Purchase Order
 * Called from the Purchasing module UI
 */
// DECISION(v1.19.955, cost-attack hardening): maxInstances cap.
exports.createPurchaseOrder = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { companyId, vendorName, vendorNumber, projectNumber, projectId, lineItems, notes } = data || {};
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId required');

  // Verify caller is a member of this company
  const member = await db.doc(`companies/${companyId}/members/${context.auth.uid}`).get();
  if (!member.exists) throw new functions.https.HttpsError('permission-denied', 'Not a member of this company');
  if (member.data().role === 'view') throw new functions.https.HttpsError('permission-denied', 'View-only users cannot create POs');

  // Generate PO number
  const counterRef = db.doc(`companies/${companyId}/config/poCounter`);
  const counter = await db.runTransaction(async (t) => {
    const doc = await t.get(counterRef);
    const next = (doc.exists ? doc.data().next || 1 : 1);
    t.set(counterRef, { next: next + 1 }, { merge: true });
    return next;
  });
  const poNumber = 'PO-' + String(counter).padStart(6, '0');

  const po = {
    poNumber,
    status: 'draft',
    vendorName: vendorName || '',
    vendorNumber: vendorNumber || '',
    projectNumber: projectNumber || '',
    projectId: projectId || '',
    notes: notes || '',
    createdBy: context.auth.uid,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lineItems: lineItems || [],
  };

  const ref = await db.collection(`companies/${companyId}/purchaseOrders`).add(po);
  console.log(`[PO] Created ${poNumber} for company ${companyId} by ${context.auth.uid}`);
  return { id: ref.id, poNumber };
});

/**
 * Update PO status (draft → submitted → approved → received → closed)
 */
exports.updatePurchaseOrderStatus = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { companyId, poId, status } = data || {};
  if (!companyId || !poId || !status) throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');

  const validStatuses = ['draft', 'submitted', 'approved', 'ordered', 'partial_received', 'received', 'closed', 'cancelled'];
  if (!validStatuses.includes(status)) throw new functions.https.HttpsError('invalid-argument', 'Invalid status: ' + status);

  const member = await db.doc(`companies/${companyId}/members/${context.auth.uid}`).get();
  if (!member.exists || member.data().role === 'view') {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions');
  }

  await db.doc(`companies/${companyId}/purchaseOrders/${poId}`).update({
    status,
    updatedAt: Date.now(),
    updatedBy: context.auth.uid,
    [`statusHistory.${status}`]: Date.now(),
  });

  console.log(`[PO] ${poId} status → ${status} by ${context.auth.uid}`);
  return { success: true };
});

module.exports = exports;

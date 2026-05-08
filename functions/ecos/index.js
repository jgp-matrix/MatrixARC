/**
 * ARC Engineering Change Order (ECO) Module — Cloud Functions
 *
 * Phase 1 ships Firestore triggers as logging stubs. Real BC PATCH writes (status flip,
 * planning-line sync) are wired in Phase 6. The plan lives at
 * docs/superpowers/plans/2026-04-28-change-orders.md.
 *
 * Data paths:
 *   - companies/{companyId}/projects/{projectId}/ecos/{ecoId}  (company-shared)
 *   - users/{uid}/projects/{projectId}/ecos/{ecoId}            (personal)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const APP_URL = process.env.APP_URL || 'https://matrix-arc.web.app';
const TRAQS_HOLD_WEBHOOK_URL = process.env.TRAQS_HOLD_WEBHOOK_URL || '';
const TRAQS_STATUS_API_URL = process.env.TRAQS_STATUS_API_URL || '';

/**
 * Triggered when an ECO doc is created (any path under .../ecos/{ecoId}).
 *
 * Phase 1 behavior: log only. Phase 6 wires:
 *   - bcPatchJobOData → set BC Project Status to "Quote"
 *   - TRAQS HOLD webhook (if configured)
 *   - Notification to reviewer/owner/salesperson
 */
exports.onEcoCreatedCompany = functions.firestore
  .document('companies/{companyId}/projects/{projectId}/ecos/{ecoId}')
  .onCreate(async (snap, context) => {
    return logEcoCreated('company', context.params.companyId, context.params.projectId, context.params.ecoId, snap.data());
  });

exports.onEcoCreatedUser = functions.firestore
  .document('users/{uid}/projects/{projectId}/ecos/{ecoId}')
  .onCreate(async (snap, context) => {
    return logEcoCreated('user', context.params.uid, context.params.projectId, context.params.ecoId, snap.data());
  });

async function logEcoCreated(kind, ownerId, projectId, ecoId, eco) {
  console.log(`[ECO] created (${kind}=${ownerId}) project=${projectId} ecoId=${ecoId} number=${eco?.number} status=${eco?.status} kind=${eco?.kind}`);
  // PHASE 6 TODO: bcPatchJobOData(projectNumber, { Status: 'Quote' }) — see plan §BC sync.
  // For now we just log so Phase 1 verification can confirm the trigger wires up correctly
  // before BC writes go live.
  if (TRAQS_HOLD_WEBHOOK_URL) {
    // PHASE 6 TODO: fire HOLD webhook — currently no-op since env var typically null.
    console.log('[ECO] (Phase 6) would fire TRAQS HOLD webhook:', TRAQS_HOLD_WEBHOOK_URL);
  }
  return null;
}

/**
 * Triggered when an ECO doc is updated (status transitions are the main use case).
 * Phase 1 logs only. Phase 6 will:
 *   - On `approved`: notify engineer that customer approved (review-and-accept gate)
 *   - On `in_production`: confirm BC sync succeeded
 *   - On terminal states: re-evaluate whether project still has any active ECOs and flip
 *     BC Status back to "Open" if not
 */
exports.onEcoUpdatedCompany = functions.firestore
  .document('companies/{companyId}/projects/{projectId}/ecos/{ecoId}')
  .onUpdate(async (change, context) => {
    return logEcoUpdated('company', context.params.companyId, context.params.projectId, context.params.ecoId, change.before.data(), change.after.data());
  });

exports.onEcoUpdatedUser = functions.firestore
  .document('users/{uid}/projects/{projectId}/ecos/{ecoId}')
  .onUpdate(async (change, context) => {
    return logEcoUpdated('user', context.params.uid, context.params.projectId, context.params.ecoId, change.before.data(), change.after.data());
  });

async function logEcoUpdated(kind, ownerId, projectId, ecoId, before, after) {
  if (before.status !== after.status) {
    console.log(`[ECO] status change (${kind}=${ownerId}) project=${projectId} eco=${after?.number} ${before.status} → ${after.status}`);
  }
  // PHASE 6 TODO: react to terminal-state transitions to flip BC Status back to "Open"
  // when no remaining active ECOs.
  return null;
}

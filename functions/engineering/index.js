/**
 * ARC Engineering Review Module — Cloud Functions
 *
 * Handles notifications and email triggers for engineering reviews.
 *
 * Data paths:
 *   - companies/{companyId}/projects/{projectId} (preReviewStatus, postReviewStatus)
 *   - reviewUploads/{token} (customer review portal sessions)
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const SENDGRID_KEY = process.env.SENDGRID_API_KEY || '';
const APP_URL = process.env.APP_URL || 'https://matrix-arc.web.app';
const FROM_EMAIL = 'sales@matrixpci.com';
if (SENDGRID_KEY) sgMail.setApiKey(SENDGRID_KEY);

/**
 * Triggered when a customer submits their review via the portal.
 * Sends email notifications to Designer, Salesperson, and Customer.
 * Creates in-app notification for the Designer.
 */
exports.onCustomerReviewSubmitted = functions.firestore
  .document('reviewUploads/{token}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === after.status || after.status !== 'submitted') return null;

    const { uid, projectName, bcProjectNumber, designerName, customerName, customerEmail, salespersonEmail } = after;
    const token = context.params.token;
    const submittedAt = after.submittedAt ? new Date(after.submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now';
    const responseCount = (after.responses || []).filter(r => r.response).length;
    const customerNoteCount = (after.customerNotes || []).length;
    const customerShapeCount = (after.customerShapes || []).length;

    const summaryParts = [];
    if (responseCount > 0) summaryParts.push(`${responseCount} response${responseCount !== 1 ? 's' : ''} to engineering notes`);
    if (customerNoteCount > 0) summaryParts.push(`${customerNoteCount} customer note${customerNoteCount !== 1 ? 's' : ''}`);
    if (customerShapeCount > 0) summaryParts.push(`${customerShapeCount} markup shape${customerShapeCount !== 1 ? 's' : ''}`);
    if (after.additionalComments) summaryParts.push('additional comments');
    const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'review submitted (no responses)';

    // Create in-app notification for designer
    if (uid) {
      try {
        await db.collection(`users/${uid}/notifications`).add({
          type: 'customer_review',
          title: `Customer Review Submitted — ${customerName || 'Customer'}`,
          body: `${customerName || 'Customer'} submitted their review for ${bcProjectNumber || ''} ${projectName || ''}: ${summary}`,
          createdAt: Date.now(),
          read: false,
          projectId: after.projectId || '',
          token,
        });
      } catch (e) {
        console.warn('[ENG] Notification write failed:', e.message);
      }
    }

    // DECISION(v1.19.781): Email button now deep-links to the specific project AND
    // auto-opens the Customer Review Responses modal. Previously it only went to APP_URL
    // (the home page), which left the recipient hunting through projects to find the
    // one with new responses. Designer/salesperson recipients get the deep link;
    // customers get the plain APP_URL (they don't have an account to land into).
    const designerLink = after.projectId ? `${APP_URL}/?openCustomerReview=${encodeURIComponent(after.projectId)}` : APP_URL;
    const buildEmailHtml = (link) => `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1e293b;margin-bottom:4px">Customer Review Submitted</h2>
        <p style="color:#64748b;font-size:14px;margin-bottom:16px"><strong>${bcProjectNumber || ''}</strong> — ${projectName || 'Project'}</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;margin-bottom:20px">
          <div style="font-size:14px;font-weight:700;color:#16a34a;margin-bottom:4px">✅ ${customerName || 'Customer'} has submitted their review</div>
          <div style="font-size:13px;color:#15803d;line-height:1.5">Submitted: ${submittedAt}</div>
          <div style="font-size:13px;color:#15803d;line-height:1.5">Includes: ${summary}</div>
        </div>
        <div style="text-align:center;margin:24px 0">
          <a href="${link}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:700;text-decoration:none">Open ARC to View Responses →</a>
        </div>
        <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:24px">This is an automated notification from ARC Engineering Review.</p>
      </div>
    `;

    const subject = `Customer Review Submitted: ${bcProjectNumber || ''} — ${projectName || ''}`;

    // Send emails via SendGrid
    if (SENDGRID_KEY) {
      const recipients = [];

      // Look up designer email from members collection
      if (uid) {
        try {
          // Find user's company and their email
          const userSnaps = await db.collectionGroup('members').where('__name__', '==', uid).limit(1).get();
          if (!userSnaps.empty) {
            const memberData = userSnaps.docs[0].data();
            if (memberData.email) recipients.push({ email: memberData.email, role: 'designer' });
          }
        } catch (e) {
          console.warn('[ENG] Designer email lookup failed:', e.message);
        }
      }

      // Salesperson
      if (salespersonEmail) recipients.push({ email: salespersonEmail, role: 'salesperson' });

      // Customer (confirmation email)
      if (customerEmail) recipients.push({ email: customerEmail, role: 'customer' });

      for (const recip of recipients) {
        try {
          // Designer + salesperson get the deep link; customer gets the plain APP_URL.
          const link = recip.role === 'customer' ? APP_URL : designerLink;
          await sgMail.send({
            to: recip.email,
            from: FROM_EMAIL,
            subject,
            html: buildEmailHtml(link),
          });
          console.log(`[ENG] Review email sent to ${recip.role}: ${recip.email}`);
        } catch (e) {
          console.warn(`[ENG] Email to ${recip.role} (${recip.email}) failed:`, e.message);
        }
      }
    } else {
      console.warn('[ENG] SENDGRID_KEY not set — emails not sent');
    }

    // Save review event timestamp to the project for tracking
    if (after.projectId && uid) {
      try {
        // Find the project path
        const projPath = `users/${uid}/projects/${after.projectId}`;
        await db.doc(projPath).update({
          customerReviewSubmittedAt: Date.now(),
          customerReviewSubmittedBy: customerName || 'Customer',
        });
      } catch (e) {
        console.warn('[ENG] Project timestamp update failed:', e.message);
      }
    }

    console.log(`[ENG] Customer review submitted for ${bcProjectNumber} by ${customerName} — ${summary}`);
    return null;
  });

/**
 * Send engineering review email notification (callable from client)
 */
// DECISION(v1.19.955, cost-attack hardening): maxInstances cap.
exports.sendReviewEmail = functions.runWith({ maxInstances: 10 }).https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  const { to, projectName, bcProjectNumber, reviewType, designerName, message } = data || {};
  if (!to) throw new functions.https.HttpsError('invalid-argument', 'Recipient email required');

  if (!SENDGRID_KEY) throw new functions.https.HttpsError('failed-precondition', 'Email not configured');

  await sgMail.send({
    to,
    from: FROM_EMAIL,
    subject: `Engineering Review: ${bcProjectNumber || ''} — ${projectName || ''}`,
    html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
      <h2 style="color:#1e293b">${reviewType === 'post_review' ? 'Post-PO' : 'Pre-Quote'} Engineering Review</h2>
      <p style="color:#64748b"><strong>${bcProjectNumber || ''}</strong> — ${projectName || 'Project'}</p>
      <p style="color:#334155">${message || 'An engineering review requires your attention.'}</p>
      <a href="${APP_URL}" style="display:inline-block;background:#7c3aed;color:#fff;font-weight:700;font-size:15px;padding:12px 28px;border-radius:8px;text-decoration:none">Open ARC →</a>
    </div>`,
  });

  return { success: true };
});

module.exports = exports;
